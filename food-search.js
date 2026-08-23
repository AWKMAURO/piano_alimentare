(function(){
  'use strict';

  const CACHE_KEY='piano-alimentare-ricerche-online-v1';
  const CACHE_TTL=7*24*60*60*1000;
  const MAX_CACHE_ITEMS=30;
  const REQUEST_TIMEOUT=15000;
  const foodInput=document.getElementById('diaryFood');
  const kcalInput=document.getElementById('diaryKcal100');
  const diaryDialog=document.getElementById('diaryDialog');
  if(!foodInput||!kcalInput||!diaryDialog)return;

  const panel=document.createElement('section');
  panel.className='food-search-box';
  panel.innerHTML='<button type="button" id="searchFoodOnline" class="food-search-button"><span aria-hidden="true">⌕</span> Cerca alimento online</button><p id="foodSearchStatus" class="food-search-status" aria-live="polite">Scrivi nome e marca, poi premi Cerca.</p><div id="onlineFoodResults" class="online-food-results" hidden></div><div id="onlineSelectedFood" class="online-selected-food" hidden></div><p class="food-search-source">Dati dei prodotti: <a href="https://it.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>, banca dati aperta con licenza <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a>. Controlla sempre l’etichetta.</p>';
  foodInput.closest('.field').insertAdjacentElement('afterend',panel);

  const button=document.getElementById('searchFoodOnline');
  const status=document.getElementById('foodSearchStatus');
  const results=document.getElementById('onlineFoodResults');
  const selected=document.getElementById('onlineSelectedFood');
  let requestId=0;
  let activeController=null;
  let selectedLabel='';

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

  function caloriesPer100(product){
    const nutrients=product&&typeof product.nutriments==='object'?product.nutriments:{};
    const kcal=finiteNumber(nutrients['energy-kcal_100g']);
    if(kcal!==null)return kcal;
    const kj=finiteNumber(nutrients['energy-kj_100g']);
    return kj===null?null:kj/4.184;
  }

  function cleanProduct(product){
    if(!product||typeof product!=='object')return null;
    const name=text(product.name)||text(product.product_name_it)||text(product.product_name)||text(product.generic_name_it)||text(product.generic_name);
    const savedKcal=finiteNumber(product.kcalPer100);
    const kcal=savedKcal===null?caloriesPer100(product):savedKcal;
    if(!name||kcal===null||kcal>1500)return null;
    return{
      code:text(product.code).replace(/[^0-9]/g,''),
      name:name.slice(0,100),
      brand:(text(product.brand)||text(product.brands)).slice(0,80),
      quantity:text(product.quantity).slice(0,40),
      kcalPer100:Math.round(kcal*10)/10
    };
  }

  function cleanProducts(value){
    const seen=new Set();
    return(Array.isArray(value)?value:[]).map(cleanProduct).filter(product=>{
      if(!product)return false;
      const identity=product.code||`${queryKey(product.name)}|${queryKey(product.brand)}|${product.kcalPer100}`;
      if(seen.has(identity))return false;
      seen.add(identity);
      return true;
    }).slice(0,10);
  }

  function readCache(){
    try{
      const cache=JSON.parse(localStorage.getItem(CACHE_KEY));
      return cache&&typeof cache==='object'&&!Array.isArray(cache)?cache:{};
    }catch{return{}}
  }

  function getCached(query){
    const entry=readCache()[queryKey(query)];
    if(!entry||!Number.isFinite(entry.savedAt)||Date.now()-entry.savedAt>CACHE_TTL||!Array.isArray(entry.products))return null;
    return cleanProducts(entry.products);
  }

  function putCached(query,products){
    try{
      const cache=readCache();
      cache[queryKey(query)]={savedAt:Date.now(),products};
      const recent=Object.fromEntries(Object.entries(cache).sort((a,b)=>(b[1]?.savedAt||0)-(a[1]?.savedAt||0)).slice(0,MAX_CACHE_ITEMS));
      localStorage.setItem(CACHE_KEY,JSON.stringify(recent));
    }catch{}
  }

  function showStatus(message,state=''){
    status.textContent=message;
    status.dataset.state=state;
  }

  function loading(value){
    button.disabled=value;
    button.classList.toggle('loading',value);
    button.lastChild.textContent=value?' Ricerca in corso…':' Cerca alimento online';
  }

  function clearSelection(){
    selectedLabel='';
    selected.hidden=true;
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
    const confirmation=document.createElement('span');
    confirmation.textContent=`✓ ${product.kcalPer100.toLocaleString('it-IT')} kcal per 100 g/ml inserite`;
    selected.append(confirmation);
    if(product.code){
      const verify=document.createElement('a');
      verify.href=`https://it.openfoodfacts.org/product/${encodeURIComponent(product.code)}`;
      verify.target='_blank';
      verify.rel='noopener';
      verify.textContent='Verifica scheda';
      selected.append(verify);
    }
    selected.hidden=false;
    showStatus('Prodotto selezionato. Ora indica la quantità.','success');
    document.getElementById('diaryQuantity').focus();
  }

  function resultButton(product){
    const row=document.createElement('button');
    row.type='button';
    row.className='online-food-result';
    const description=document.createElement('span');
    const name=document.createElement('strong');
    name.textContent=product.name;
    const details=document.createElement('small');
    details.textContent=[product.brand,product.quantity].filter(Boolean).join(' · ')||'Prodotto senza marca';
    description.append(name,details);
    const nutrition=document.createElement('span');
    const kcal=document.createElement('strong');
    kcal.textContent=product.kcalPer100.toLocaleString('it-IT');
    const unit=document.createElement('small');
    unit.textContent='kcal / 100 g/ml';
    nutrition.append(kcal,unit);
    row.append(description,nutrition);
    row.addEventListener('click',()=>selectProduct(product));
    return row;
  }

  function renderProducts(products,fromCache=false){
    results.replaceChildren();
    clearSelection();
    if(!products.length){
      results.hidden=true;
      showStatus('Nessun prodotto con calorie per 100 g/ml. Prova nome e marca oppure usa l’etichetta.','warning');
      return;
    }
    const heading=document.createElement('p');
    heading.className='online-results-heading';
    heading.textContent=`${products.length} risultati${fromCache?' salvati sul telefono':''}. Tocca quello corretto:`;
    results.append(heading,...products.map(resultButton));
    results.hidden=false;
    showStatus(fromCache?'Risultati caricati dal telefono, senza consumare una nuova ricerca.':'Risultati ricevuti.','success');
  }

  async function requestProducts(query,currentId){
    const controller=new AbortController();
    activeController=controller;
    const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT);
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
      app_version:'3.0',
      json:'1'
    });
    try{
      const response=await fetch(`https://it.openfoodfacts.org/cgi/search.pl?${params}`,{
        method:'GET',
        mode:'cors',
        credentials:'omit',
        cache:'no-store',
        headers:{'X-User-Agent':'PianoAlimentare/3.0 (https://awkmauro.github.io/piano_alimentare/)'},
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

  async function search(){
    const query=text(foodInput.value);
    results.dataset.query=queryKey(query);
    results.hidden=true;
    clearSelection();
    if(query.length<2){
      showStatus('Scrivi almeno 2 caratteri del nome o della marca.','warning');
      foodInput.focus();
      return;
    }
    const cached=getCached(query);
    if(cached){
      renderProducts(cached,true);
      return;
    }
    if(!navigator.onLine){
      showStatus('Sei offline. Inserisci le kcal dall’etichetta o usa un alimento già salvato.','warning');
      return;
    }
    const currentId=++requestId;
    loading(true);
    showStatus('Cerco nome, marca e calorie per 100 g/ml…');
    try{
      const response=await requestProducts(query,currentId);
      const products=cleanProducts(response?.products);
      if(products.length)putCached(query,products);
      renderProducts(products);
    }catch(error){
      if(error.message!=='cancelled')showStatus('Ricerca momentaneamente non disponibile. Riprova tra poco oppure usa le kcal dell’etichetta.','error');
    }finally{
      if(currentId===requestId)loading(false);
    }
  }

  button.addEventListener('click',search);
  foodInput.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      search();
    }
  });
  foodInput.addEventListener('input',()=>{
    if(selectedLabel&&foodInput.value!==selectedLabel)clearSelection();
    if(results.dataset.query&&queryKey(foodInput.value)!==results.dataset.query)results.hidden=true;
  });
  diaryDialog.addEventListener('close',()=>{
    requestId++;
    activeController?.abort();
    activeController=null;
    loading(false);
    results.hidden=true;
    clearSelection();
    showStatus('Scrivi nome e marca, poi premi Cerca.');
  });
})();

