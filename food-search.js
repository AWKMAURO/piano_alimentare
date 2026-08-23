(function(){
  'use strict';

  const DATABASE_CACHE_KEY='piano-alimentare-ricerche-online-v1';
  const AI_CACHE_KEY='piano-alimentare-ricerche-openai-v1';
  const AI_SETTINGS_KEY='piano-alimentare-config-openai-v1';
  const DATABASE_CACHE_TTL=7*24*60*60*1000;
  const AI_CACHE_TTL=30*24*60*60*1000;
  const MAX_CACHE_ITEMS=40;
  const DATABASE_TIMEOUT=15000;
  const AI_TIMEOUT=35000;
  const foodInput=document.getElementById('diaryFood');
  const kcalInput=document.getElementById('diaryKcal100');
  const diaryDialog=document.getElementById('diaryDialog');
  const infoDialog=document.getElementById('infoDialog');
  if(!foodInput||!kcalInput||!diaryDialog||!infoDialog)return;

  const panel=document.createElement('section');
  panel.className='food-search-box';
  panel.innerHTML='<div class="food-search-actions"><button type="button" id="searchFoodOnline" class="food-search-button"><span aria-hidden="true">⌕</span><span id="databaseSearchLabel">Cerca prodotti</span></button><button type="button" id="searchFoodWithAi" class="food-ai-button"><span class="ai-mark" aria-hidden="true">AI</span><span id="aiSearchLabel">Ricerca intelligente</span></button></div><p id="foodSearchStatus" class="food-search-status" aria-live="polite">Scrivi nome e marca, poi scegli dove cercare.</p><div id="onlineFoodResults" class="online-food-results" hidden></div><div id="onlineSelectedFood" class="online-selected-food" hidden></div><p class="food-search-source"><strong>Cerca prodotti</strong> usa gratuitamente <a href="https://it.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>. <strong>Ricerca intelligente</strong> usa OpenAI solo quando la scegli ed è a consumo. Controlla sempre l’etichetta o la fonte.</p>';
  foodInput.closest('.field').insertAdjacentElement('afterend',panel);

  const databaseButton=document.getElementById('searchFoodOnline');
  const aiButton=document.getElementById('searchFoodWithAi');
  const databaseLabel=document.getElementById('databaseSearchLabel');
  const aiLabel=document.getElementById('aiSearchLabel');
  const status=document.getElementById('foodSearchStatus');
  const results=document.getElementById('onlineFoodResults');
  const selected=document.getElementById('onlineSelectedFood');
  let requestId=0;
  let activeController=null;
  let selectedLabel='';
  let aiSettings=readAiSettings();

  function text(value){
    if(Array.isArray(value))value=value.join(', ');
    return typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
  }

  function queryKey(value){
    return text(value).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function finiteNumber(value){
    if(value===null||value===undefined||String(value).trim()==='')return null;
    const number=Number(value);
    return Number.isFinite(number)&&number>=0?number:null;
  }

  function safeHttpsUrl(value){
    try{
      const url=new URL(value);
      return url.protocol==='https:'?url.toString():'';
    }catch{return''}
  }

  function caloriesPer100(product){
    const nutrients=product&&typeof product.nutriments==='object'?product.nutriments:{};
    const kcal=finiteNumber(nutrients['energy-kcal_100g']);
    if(kcal!==null)return kcal;
    const kj=finiteNumber(nutrients['energy-kj_100g']);
    return kj===null?null:kj/4.184;
  }

  function cleanProduct(product,providerHint=''){
    if(!product||typeof product!=='object')return null;
    const provider=providerHint==='openai_web'||product.provider==='openai_web'?'openai_web':'openfoodfacts';
    const name=text(product.name)||text(product.product_name_it)||text(product.product_name)||text(product.generic_name_it)||text(product.generic_name);
    const savedKcal=finiteNumber(product.kcalPer100);
    const kcal=savedKcal===null?caloriesPer100(product):savedKcal;
    const sourceUrl=provider==='openai_web'?safeHttpsUrl(product.sourceUrl):'';
    if(!name||kcal===null||kcal>1500||(provider==='openai_web'&&!sourceUrl))return null;
    return{
      code:text(product.code).replace(/[^0-9]/g,''),
      name:name.slice(0,100),
      brand:(text(product.brand)||text(product.brands)).slice(0,80),
      quantity:(text(product.quantity)||text(product.basis)).slice(0,40),
      kcalPer100:Math.round(kcal*10)/10,
      unit:product.unit==='ml'?'ml':'g',
      provider,
      sourceLabel:(text(product.sourceLabel)||text(product.sourceTitle)).slice(0,160),
      sourceUrl,
      confidence:['alta','media','bassa'].includes(product.confidence)?product.confidence:'bassa',
      note:text(product.note).slice(0,220)
    };
  }

  function cleanProducts(value,providerHint=''){
    const seen=new Set();
    return(Array.isArray(value)?value:[]).map(product=>cleanProduct(product,providerHint)).filter(product=>{
      if(!product)return false;
      const identity=product.code||`${product.provider}|${queryKey(product.name)}|${queryKey(product.brand)}|${product.kcalPer100}`;
      if(seen.has(identity))return false;
      seen.add(identity);
      return true;
    }).slice(0,10);
  }

  function readObject(key){
    try{
      const value=JSON.parse(localStorage.getItem(key));
      return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    }catch{return{}}
  }

  function getCached(cacheKey,query,ttl,providerHint=''){
    const entry=readObject(cacheKey)[queryKey(query)];
    if(!entry||!Number.isFinite(entry.savedAt)||Date.now()-entry.savedAt>ttl||!Array.isArray(entry.products))return null;
    const products=cleanProducts(entry.products,providerHint);
    return products.length?products:null;
  }

  function putCached(cacheKey,query,products){
    try{
      const cache=readObject(cacheKey);
      cache[queryKey(query)]={savedAt:Date.now(),products};
      const recent=Object.fromEntries(Object.entries(cache).sort((a,b)=>(b[1]?.savedAt||0)-(a[1]?.savedAt||0)).slice(0,MAX_CACHE_ITEMS));
      localStorage.setItem(cacheKey,JSON.stringify(recent));
    }catch{}
  }

  function showStatus(message,state=''){
    status.textContent=message;
    status.dataset.state=state;
  }

  function setBusy(target,value){
    databaseButton.disabled=value;
    aiButton.disabled=value;
    databaseButton.classList.toggle('loading',value&&target===databaseButton);
    aiButton.classList.toggle('loading',value&&target===aiButton);
    databaseLabel.textContent=value&&target===databaseButton?'Ricerca in corso…':'Cerca prodotti';
    aiLabel.textContent=value&&target===aiButton?'Ricerca AI in corso…':'Ricerca intelligente';
  }

  function beginRequest(target){
    requestId++;
    activeController?.abort();
    activeController=null;
    setBusy(target,true);
    return requestId;
  }

  function finishRequest(currentId){
    if(currentId===requestId)setBusy(null,false);
  }

  function clearSelection(){
    selectedLabel='';
    selected.hidden=true;
    selected.classList.remove('ai');
    selected.replaceChildren();
  }

  function diaryLabel(product){
    if(!product.brand||queryKey(product.name).includes(queryKey(product.brand)))return product.name.slice(0,60);
    return `${product.name} · ${product.brand}`.slice(0,60);
  }

  function selectProduct(product){
    selectedLabel=diaryLabel(product);
    foodInput.value=selectedLabel;
    kcalInput.value=String(product.kcalPer100).replace('.',',');
    if(typeof calculateEntryCalories==='function')calculateEntryCalories();
    results.hidden=true;
    selected.replaceChildren();
    selected.classList.toggle('ai',product.provider==='openai_web');
    const confirmation=document.createElement('span');
    confirmation.textContent=product.provider==='openai_web'
      ?`Stima web: ${product.kcalPer100.toLocaleString('it-IT')} kcal per 100 ${product.unit}`
      :`✓ ${product.kcalPer100.toLocaleString('it-IT')} kcal per 100 g/ml inserite`;
    selected.append(confirmation);
    const verifyUrl=product.provider==='openai_web'?product.sourceUrl:(product.code?`https://it.openfoodfacts.org/product/${encodeURIComponent(product.code)}`:'');
    if(verifyUrl){
      const verify=document.createElement('a');
      verify.href=verifyUrl;
      verify.target='_blank';
      verify.rel='noopener';
      verify.textContent=product.provider==='openai_web'?'Apri fonte':'Verifica scheda';
      selected.append(verify);
    }
    selected.hidden=false;
    showStatus(product.provider==='openai_web'?'Valore inserito. Verifica la fonte, poi indica la quantità.':'Prodotto selezionato. Ora indica la quantità.','success');
    document.getElementById('diaryQuantity').focus();
  }

  function confidenceLabel(value){
    return value==='alta'?'Fonte molto affidabile':value==='media'?'Fonte da controllare':'Stima da verificare';
  }

  function resultButton(product){
    const row=document.createElement('button');
    row.type='button';
    row.className=`online-food-result${product.provider==='openai_web'?' ai-result':''}`;
    const description=document.createElement('span');
    const name=document.createElement('strong');
    name.textContent=product.name;
    const details=document.createElement('small');
    details.textContent=[product.brand,product.quantity].filter(Boolean).join(' · ')||(product.provider==='openai_web'?'Alimento generico':'Prodotto senza marca');
    description.append(name,details);
    if(product.provider==='openai_web'){
      const source=document.createElement('small');
      source.className='ai-result-source';
      source.textContent=[confidenceLabel(product.confidence),product.sourceLabel].filter(Boolean).join(' · ');
      description.append(source);
    }
    const nutrition=document.createElement('span');
    const kcal=document.createElement('strong');
    kcal.textContent=product.kcalPer100.toLocaleString('it-IT');
    const unit=document.createElement('small');
    unit.textContent=`kcal / 100 ${product.provider==='openai_web'?product.unit:'g/ml'}`;
    nutrition.append(kcal,unit);
    row.append(description,nutrition);
    row.addEventListener('click',()=>selectProduct(product));
    return row;
  }

  function renderProducts(products,{fromCache=false,provider='openfoodfacts'}={}){
    results.replaceChildren();
    clearSelection();
    const isAi=provider==='openai_web';
    if(!products.length){
      results.hidden=true;
      aiButton.classList.toggle('suggested',!isAi);
      showStatus(isAi?'La ricerca AI non ha trovato calorie verificabili. Usa l’etichetta o inserisci il valore manualmente.':'Nessun prodotto adatto. Prova la ricerca intelligente oppure usa l’etichetta.','warning');
      return;
    }
    aiButton.classList.remove('suggested');
    const heading=document.createElement('p');
    heading.className='online-results-heading';
    heading.textContent=isAi
      ?`${products.length} risultati AI${fromCache?' salvati sul telefono':''}. Sono stime: apri sempre la fonte.`
      :`${products.length} risultati${fromCache?' salvati sul telefono':''}. Tocca quello corretto:`;
    results.append(heading,...products.map(resultButton));
    results.hidden=false;
    showStatus(fromCache?'Risultati caricati dal telefono senza una nuova ricerca.':isAi?'Ricerca AI completata: scegli e verifica la fonte.':'Risultati ricevuti.','success');
  }

  function searchQuery(){
    const query=text(foodInput.value);
    results.dataset.query=queryKey(query);
    results.hidden=true;
    clearSelection();
    if(query.length<2){
      showStatus('Scrivi almeno 2 caratteri del nome o della marca.','warning');
      foodInput.focus();
      return'';
    }
    return query.slice(0,120);
  }

  async function requestDatabaseProducts(query,currentId){
    const controller=new AbortController();
    activeController=controller;
    const timer=setTimeout(()=>controller.abort(),DATABASE_TIMEOUT);
    const params=new URLSearchParams({
      search_terms:query,
      search_simple:'1',
      action:'process',
      sort_by:'unique_scans_n',
      page_size:'12',
      fields:'code,product_name,product_name_it,generic_name,generic_name_it,brands,quantity,nutriments',
      lc:'it',
      cc:'it',
      app_name:'PianoAlimentare',
      app_version:'4.0',
      json:'1'
    });
    try{
      const response=await fetch(`https://it.openfoodfacts.org/cgi/search.pl?${params}`,{
        method:'GET',
        mode:'cors',
        credentials:'omit',
        cache:'no-store',
        headers:{'X-User-Agent':'PianoAlimentare/4.0 (https://awkmauro.github.io/piano_alimentare/)'},
        signal:controller.signal
      });
      if(!response.ok)throw new Error(`http-${response.status}`);
      const data=await response.json();
      if(currentId!==requestId)throw new Error('cancelled');
      return data;
    }finally{
      clearTimeout(timer);
      if(activeController===controller)activeController=null;
    }
  }

  function readAiSettings(){
    const value=readObject(AI_SETTINGS_KEY);
    return{endpoint:normalizeEndpoint(value.endpoint),token:text(value.token)};
  }

  function normalizeEndpoint(value){
    try{
      const url=new URL(text(value));
      const local=url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
      if(url.protocol!=='https:'&&!local)return'';
      url.search='';
      url.hash='';
      return url.toString().replace(/\/+$/,'');
    }catch{return''}
  }

  function aiConfigured(settings=aiSettings){
    return Boolean(normalizeEndpoint(settings.endpoint)&&text(settings.token).length>=24);
  }

  function apiUrl(endpoint,path){
    return `${normalizeEndpoint(endpoint)}${path}`;
  }

  async function apiError(response){
    let payload={};
    try{payload=await response.json()}catch{}
    const error=new Error(payload?.error?.message||`Errore ${response.status}`);
    error.code=payload?.error?.code||`http_${response.status}`;
    error.status=response.status;
    return error;
  }

  async function requestAiProducts(query,currentId){
    const controller=new AbortController();
    activeController=controller;
    const timer=setTimeout(()=>controller.abort(),AI_TIMEOUT);
    try{
      const response=await fetch(apiUrl(aiSettings.endpoint,'/v1/foods/search'),{
        method:'POST',
        mode:'cors',
        credentials:'omit',
        cache:'no-store',
        headers:{'Authorization':`Bearer ${aiSettings.token}`,'Content-Type':'application/json'},
        body:JSON.stringify({query}),
        signal:controller.signal
      });
      if(!response.ok)throw await apiError(response);
      const data=await response.json();
      if(currentId!==requestId)throw new Error('cancelled');
      return data;
    }finally{
      clearTimeout(timer);
      if(activeController===controller)activeController=null;
    }
  }

  async function searchDatabase(){
    const query=searchQuery();
    if(!query)return;
    const cached=getCached(DATABASE_CACHE_KEY,query,DATABASE_CACHE_TTL);
    if(cached){
      renderProducts(cached,{fromCache:true,provider:'openfoodfacts'});
      return;
    }
    if(!navigator.onLine){
      showStatus('Sei offline. Inserisci le kcal dall’etichetta o usa un alimento già salvato.','warning');
      return;
    }
    const currentId=beginRequest(databaseButton);
    showStatus('Cerco prodotti, marche e calorie per 100 g/ml…');
    try{
      const response=await requestDatabaseProducts(query,currentId);
      const products=cleanProducts(response?.products);
      if(products.length)putCached(DATABASE_CACHE_KEY,query,products);
      renderProducts(products,{provider:'openfoodfacts'});
    }catch(error){
      if(currentId===requestId&&error.message!=='cancelled'){
        aiButton.classList.add('suggested');
        showStatus('Database momentaneamente non disponibile. Puoi provare la ricerca intelligente.','error');
      }
    }finally{finishRequest(currentId)}
  }

  function aiFailureMessage(error){
    if(error?.name==='AbortError')return'La ricerca AI ha impiegato troppo tempo. Riprova.';
    if(error?.code==='invalid_access_token')return'Codice di accesso non valido. Controlla la configurazione.';
    if(error?.code==='rate_limited'||error?.code==='openai_limit')return'Troppe ricerche ravvicinate o limite OpenAI raggiunto. Attendi e riprova.';
    if(error?.code==='openai_not_configured'||error?.code==='openai_auth'||error?.code==='server_not_configured')return'Il backend OpenAI non è ancora configurato correttamente.';
    return'Ricerca AI momentaneamente non disponibile. Puoi usare l’etichetta o riprovare.';
  }

  async function searchAi(){
    const query=searchQuery();
    if(!query)return;
    const cached=getCached(AI_CACHE_KEY,query,AI_CACHE_TTL,'openai_web');
    if(cached){
      renderProducts(cached,{fromCache:true,provider:'openai_web'});
      return;
    }
    if(!aiConfigured()){
      showStatus('Configura prima il collegamento OpenAI: non serve inserire qui la chiave API.','warning');
      openAiConfiguration();
      return;
    }
    if(!navigator.onLine){
      showStatus('Sei offline. La ricerca AI richiede internet.','warning');
      return;
    }
    const currentId=beginRequest(aiButton);
    showStatus('OpenAI sta cercando una fonte nutrizionale verificabile…');
    try{
      const response=await requestAiProducts(query,currentId);
      const products=cleanProducts(response?.products,'openai_web');
      if(products.length)putCached(AI_CACHE_KEY,query,products);
      renderProducts(products,{provider:'openai_web'});
    }catch(error){
      if(currentId===requestId&&error.message!=='cancelled')showStatus(aiFailureMessage(error),'error');
    }finally{finishRequest(currentId)}
  }

  const infoCard=infoDialog.querySelector('.dialog-card');
  const aiInfo=document.createElement('section');
  aiInfo.className='ai-config-summary';
  aiInfo.innerHTML='<div><strong>Ricerca intelligente OpenAI</strong><span id="aiConfigSummaryStatus">Non configurata</span></div><button type="button" id="openAiConfig">Configura</button>';
  const exportButton=document.getElementById('exportShopping');
  infoCard.insertBefore(aiInfo,exportButton);

  const aiConfigDialog=document.createElement('dialog');
  aiConfigDialog.id='openAiConfigDialog';
  aiConfigDialog.innerHTML='<form class="dialog-card" id="openAiConfigForm"><div class="dialog-head"><div><p class="eyebrow">COLLEGAMENTO SICURO</p><h2>Ricerca OpenAI</h2></div><button type="button" id="closeAiConfig">×</button></div><p class="ai-config-help">Inserisci l’indirizzo del nostro backend e il codice privato dell’app. <strong>Non inserire mai qui la chiave API OpenAI o la password di ChatGPT.</strong></p><label class="field"><span>Indirizzo backend</span><input id="aiEndpoint" type="url" inputmode="url" autocomplete="url" placeholder="https://…workers.dev" required></label><label class="field"><span>Codice privato dell’app</span><input id="aiAccessToken" type="password" autocomplete="off" minlength="24" placeholder="Almeno 24 caratteri" required></label><p id="aiConfigTestStatus" class="ai-config-test-status" aria-live="polite"></p><button type="button" id="testAiConfig" class="ai-config-test">Verifica collegamento</button><button type="submit" class="primary">Salva su questo dispositivo</button><button type="button" id="removeAiConfig" class="delete-entry">Disattiva OpenAI su questo dispositivo</button></form>';
  document.body.append(aiConfigDialog);

  const aiConfigForm=document.getElementById('openAiConfigForm');
  const endpointInput=document.getElementById('aiEndpoint');
  const tokenInput=document.getElementById('aiAccessToken');
  const configTestStatus=document.getElementById('aiConfigTestStatus');
  const testConfigButton=document.getElementById('testAiConfig');
  const removeConfigButton=document.getElementById('removeAiConfig');
  const configSummaryStatus=document.getElementById('aiConfigSummaryStatus');

  function updateAiConfigurationUi(){
    const configured=aiConfigured();
    configSummaryStatus.textContent=configured?'Configurata su questo dispositivo':'Non configurata';
    configSummaryStatus.dataset.state=configured?'success':'';
    removeConfigButton.classList.toggle('hidden',!configured);
    aiButton.classList.toggle('configured',configured);
  }

  function openAiConfiguration(){
    endpointInput.value=aiSettings.endpoint||'';
    tokenInput.value=aiSettings.token||'';
    configTestStatus.textContent='';
    infoDialog.open&&infoDialog.close();
    aiConfigDialog.showModal();
    setTimeout(()=>endpointInput.focus(),100);
  }

  function candidateSettings(){
    return{endpoint:normalizeEndpoint(endpointInput.value),token:text(tokenInput.value)};
  }

  async function testAiConfiguration(){
    const candidate=candidateSettings();
    if(!candidate.endpoint||candidate.token.length<24){
      configTestStatus.textContent='Controlla indirizzo e codice privato.';
      configTestStatus.dataset.state='error';
      return;
    }
    testConfigButton.disabled=true;
    configTestStatus.textContent='Verifica in corso…';
    configTestStatus.dataset.state='';
    try{
      const response=await fetch(apiUrl(candidate.endpoint,'/health'),{
        method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
        headers:{'Authorization':`Bearer ${candidate.token}`}
      });
      if(!response.ok)throw await apiError(response);
      const data=await response.json();
      if(!data.openaiConfigured)throw Object.assign(new Error(),{code:'openai_not_configured'});
      configTestStatus.textContent=`Collegamento riuscito${data.model?` · ${data.model}`:''}.`;
      configTestStatus.dataset.state='success';
    }catch(error){
      configTestStatus.textContent=aiFailureMessage(error);
      configTestStatus.dataset.state='error';
    }finally{testConfigButton.disabled=false}
  }

  databaseButton.addEventListener('click',searchDatabase);
  aiButton.addEventListener('click',searchAi);
  foodInput.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      searchDatabase();
    }
  });
  foodInput.addEventListener('input',()=>{
    if(selectedLabel&&foodInput.value!==selectedLabel)clearSelection();
    if(results.dataset.query&&queryKey(foodInput.value)!==results.dataset.query)results.hidden=true;
    aiButton.classList.remove('suggested');
  });
  diaryDialog.addEventListener('close',()=>{
    requestId++;
    activeController?.abort();
    activeController=null;
    setBusy(null,false);
    results.hidden=true;
    clearSelection();
    showStatus('Scrivi nome e marca, poi scegli dove cercare.');
  });
  document.getElementById('openAiConfig').addEventListener('click',openAiConfiguration);
  document.getElementById('closeAiConfig').addEventListener('click',()=>aiConfigDialog.close());
  testConfigButton.addEventListener('click',testAiConfiguration);
  aiConfigForm.addEventListener('submit',event=>{
    event.preventDefault();
    const candidate=candidateSettings();
    if(!candidate.endpoint)return alert('Inserisci un indirizzo HTTPS valido per il backend.');
    if(candidate.token.length<24)return alert('Il codice privato deve avere almeno 24 caratteri.');
    aiSettings=candidate;
    localStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(aiSettings));
    updateAiConfigurationUi();
    aiConfigDialog.close();
    showStatus('Ricerca intelligente configurata su questo dispositivo.','success');
  });
  removeConfigButton.addEventListener('click',()=>{
    if(!confirm('Disattivare la ricerca OpenAI su questo dispositivo?'))return;
    localStorage.removeItem(AI_SETTINGS_KEY);
    aiSettings={endpoint:'',token:''};
    endpointInput.value='';
    tokenInput.value='';
    updateAiConfigurationUi();
    aiConfigDialog.close();
  });

  updateAiConfigurationUi();
})();

