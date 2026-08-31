const DIARY_KEY='piano-alimentare-diario-v1';
const FOODS_KEY='piano-alimentare-alimenti-v1';
const DIARY_SETTINGS_KEY='piano-alimentare-diario-impostazioni-v1';
const ACTIVE_CALORIES_KEY='piano-alimentare-calorie-attive-v1';
const DIARY_MEALS=['Colazione','Spuntino mattina','Pranzo','Spuntino pomeriggio','Cena','Extra'];
const DIARY_UNITS={
  g:{label:'Grammi (g)',singular:'g',plural:'g',reference:100,quantityPlaceholder:'Es. 150'},
  ml:{label:'Millilitri (ml)',singular:'ml',plural:'ml',reference:100,quantityPlaceholder:'Es. 200'},
  porzione:{label:'Porzione',singular:'porzione',plural:'porzioni',reference:1,quantityPlaceholder:'Es. 1'},
  pezzo:{label:'Pezzo',singular:'pezzo',plural:'pezzi',reference:1,quantityPlaceholder:'Es. 1'},
  tazza:{label:'Tazza',singular:'tazza',plural:'tazze',reference:1,quantityPlaceholder:'Es. 1'},
  bicchiere:{label:'Bicchiere',singular:'bicchiere',plural:'bicchieri',reference:1,quantityPlaceholder:'Es. 1'},
  cucchiaio:{label:'Cucchiaio',singular:'cucchiaio',plural:'cucchiai',reference:1,quantityPlaceholder:'Es. 1'},
  cucchiaino:{label:'Cucchiaino',singular:'cucchiaino',plural:'cucchiaini',reference:1,quantityPlaceholder:'Es. 1'},
  legacy:{label:'g/ml (voce precedente)',singular:'g/ml',plural:'g/ml',reference:100,quantityPlaceholder:'Es. 150'}
};

let diaryOffset=0;
let diaryEntries=readLocal(DIARY_KEY,[]);
let foodCatalog=readLocal(FOODS_KEY,[]);
let diarySettings=readLocal(DIARY_SETTINGS_KEY,{calorieGoal:null});
let activeCaloriesByDate=readLocal(ACTIVE_CALORIES_KEY,{});

function readLocal(key,fallback){
  try{
    const value=JSON.parse(localStorage.getItem(key));
    return value??fallback;
  }catch{return fallback}
}

function writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value))}
function diaryUid(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function parseDiaryNumber(value){const number=Number(String(value).trim().replace(/\s/g,'').replace(',','.'));return Number.isFinite(number)?number:NaN}
function localIso(date){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function diaryDate(){const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()+diaryOffset);return date}
function diaryDateKey(){return localIso(diaryDate())}
function diaryUnit(value,fallback='g'){return Object.prototype.hasOwnProperty.call(DIARY_UNITS,value)?value:fallback}
function savedDiaryUnit(item){return item?.unit?diaryUnit(item.unit,'legacy'):'legacy'}
function savedKcalValue(item){const value=Number(item?.kcalRate??item?.kcalValue??item?.kcalPerUnit??item?.kcalPer100);return Number.isFinite(value)&&value>=0?value:0}
function diaryNumber(value,maximumFractionDigits=2){return Number(value||0).toLocaleString('it-IT',{maximumFractionDigits})}

function normalizeDiaryEntry(raw){
  if(!raw||typeof raw!=='object')return null;
  const unit=savedDiaryUnit(raw);
  const kcalRate=savedKcalValue(raw);
  return{...raw,unit,kcalRate,kcalValue:kcalRate};
}

function normalizeCatalogItem(raw){
  if(!raw||typeof raw!=='object'||typeof raw.name!=='string'||!raw.name.trim())return null;
  const unit=savedDiaryUnit(raw);
  const kcalRate=savedKcalValue(raw);
  return{...raw,name:raw.name.trim(),unit,kcalRate,kcalValue:kcalRate};
}

function normalizeActiveCaloriesData(){
  const source=activeCaloriesByDate&&typeof activeCaloriesByDate==='object'&&!Array.isArray(activeCaloriesByDate)?activeCaloriesByDate:{};
  const normalized={};
  for(const [date,raw] of Object.entries(source)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const calories=Number(raw&&typeof raw==='object'?raw.calories:raw);
    if(!Number.isFinite(calories)||calories<=0)continue;
    const updatedAt=Number(raw&&typeof raw==='object'?raw.updatedAt:0);
    normalized[date]={
      calories:Math.round(calories*10)/10,
      updatedAt:Number.isFinite(updatedAt)&&updatedAt>0?updatedAt:Date.now(),
      source:raw&&typeof raw==='object'&&raw.source==='healthkit'?'healthkit':'manual'
    };
  }
  activeCaloriesByDate=normalized;
}

function activeCaloriesForDate(dateKey){
  const calories=Number(activeCaloriesByDate?.[dateKey]?.calories??activeCaloriesByDate?.[dateKey]);
  return Number.isFinite(calories)&&calories>0?Math.round(calories*10)/10:0;
}

function normalizeDiaryData(){
  diaryEntries=(Array.isArray(diaryEntries)?diaryEntries:[]).map(normalizeDiaryEntry).filter(Boolean);
  foodCatalog=(Array.isArray(foodCatalog)?foodCatalog:[]).map(normalizeCatalogItem).filter(Boolean);
  if(!diarySettings||typeof diarySettings!=='object'||Array.isArray(diarySettings))diarySettings={calorieGoal:null};
  normalizeActiveCaloriesData();
}

normalizeDiaryData();

function unitQuantityLabel(unitKey,quantity){
  const unit=DIARY_UNITS[diaryUnit(unitKey,'legacy')];
  return Math.abs(Number(quantity)-1)<0.000001?unit.singular:unit.plural;
}

function unitReferenceLabel(unitKey){
  const unit=DIARY_UNITS[diaryUnit(unitKey,'legacy')];
  return unit.reference===100?`100 ${unit.singular}`:unit.singular;
}

function formatEntryMeasurement(entry){
  const unitKey=savedDiaryUnit(entry);
  const quantity=Number(entry.quantity)||0;
  const kcalValue=savedKcalValue(entry);
  return`${diaryNumber(quantity)} ${unitQuantityLabel(unitKey,quantity)} · ${diaryNumber(kcalValue)} kcal/${unitReferenceLabel(unitKey)}`;
}

function updateDiaryUnitInterface(){
  const unitKey=diaryUnit($('diaryUnit')?.value);
  const unit=DIARY_UNITS[unitKey];
  if(!$('diaryUnit')||!unit)return;
  $('diaryQuantity').placeholder=unit.quantityPlaceholder;
  $('diaryKcalLabel').textContent=unit.reference===100?`Kcal per 100 ${unit.singular}`:`Kcal per ${unit.singular}`;
  $('diaryKcal100').placeholder=unit.reference===100?"Dall'etichetta":'Es. 2';
  $('diaryUnitHelp').textContent=unit.reference===100
    ?`Il valore calorico deve essere riferito a 100 ${unit.singular}.`
    :`Inserisci le calorie di una singola ${unit.singular}.`;
}

function calculateEntryCalories(){
  const quantity=parseDiaryNumber($('diaryQuantity').value);
  const kcalValue=parseDiaryNumber($('diaryKcal100').value);
  const unit=DIARY_UNITS[diaryUnit($('diaryUnit')?.value)];
  const calories=quantity>0&&kcalValue>=0?Math.round(quantity*kcalValue/unit.reference*10)/10:0;
  $('entryCalories').textContent=new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(calories);
  return calories;
}

function diaryMarkup(){
  return`<section class="page" data-page="diary">
    <div class="page-heading diary-heading">
      <p class="eyebrow">DIARIO ALIMENTARE</p>
      <h2>Calorie della giornata</h2>
      <p>Puoi registrare alimenti in grammi, millilitri, porzioni, pezzi o altre unità.</p>
    </div>
    <div class="date-head diary-date">
      <button id="previousDiaryDay" aria-label="Giorno precedente">‹</button>
      <div><p id="diaryFullDate"></p><h2 id="diaryDayName"></h2></div>
      <button id="nextDiaryDay" aria-label="Giorno successivo">›</button>
    </div>
    <section class="calorie-summary">
      <span>CALORIE ASSUNTE</span>
      <strong><span id="dailyCalories">0</span> kcal</strong>
      <div class="calorie-meta"><span id="calorieGoalText">Obiettivo alimentare non impostato</span><span id="caloriePercent"></span></div>
      <div class="calorie-progress"><i id="calorieProgress"></i></div>
      <button id="setCalorieGoal">Imposta obiettivo alimentare</button>
    </section>
    <section class="active-calories-summary">
      <div class="active-calories-copy">
        <span>CALORIE ATTIVE BRUCIATE</span>
        <strong><span id="dailyActiveCalories">0</span> kcal</strong>
        <small>Dato separato: non modifica l’obiettivo alimentare.</small>
      </div>
      <button type="button" id="setActiveCalories">Inserisci</button>
    </section>
    <div id="diaryMeals"></div>
    <button class="diary-add" id="addDiaryEntry">+ Aggiungi alimento</button>
    <p class="diary-disclaimer">Le calorie dipendono dai valori inseriti e possono variare per marca e preparazione.</p>
  </section>`;
}

function dialogMarkup(){
  const unitOptions=Object.entries(DIARY_UNITS).map(([value,unit])=>`<option value="${value}">${unit.label}</option>`).join('');
  return`<dialog id="diaryDialog">
    <form class="dialog-card" id="diaryForm">
      <div class="dialog-head">
        <div><p class="eyebrow">DIARIO</p><h2 id="diaryDialogTitle">Aggiungi alimento</h2></div>
        <button type="button" id="closeDiary" aria-label="Chiudi">×</button>
      </div>
      <input type="hidden" id="diaryEntryId">
      <label class="field"><span>Momento della giornata</span><select id="diaryMeal">${DIARY_MEALS.map(meal=>`<option>${meal}</option>`).join('')}</select></label>
      <label class="field"><span>Alimento</span><input id="diaryFood" list="foodCatalog" maxlength="60" placeholder="Es. caffè" autocomplete="off" required><datalist id="foodCatalog"></datalist></label>
      <div class="field-grid">
        <label class="field"><span>Quantità</span><input id="diaryQuantity" inputmode="decimal" placeholder="Es. 150" required></label>
        <label class="field"><span>Unità di misura</span><select id="diaryUnit">${unitOptions}</select></label>
      </div>
      <label class="field"><span id="diaryKcalLabel">Kcal per 100 g</span><input id="diaryKcal100" inputmode="decimal" placeholder="Dall'etichetta" required></label>
      <p class="diary-disclaimer" id="diaryUnitHelp">Il valore calorico deve essere riferito a 100 g.</p>
      <div class="calorie-preview"><span>Calorie calcolate</span><strong><span id="entryCalories">0</span> kcal</strong></div>
      <button class="primary" type="submit">Salva nel diario</button>
      <button class="delete-entry hidden" type="button" id="deleteDiaryEntry">Elimina alimento</button>
    </form>
  </dialog>
  <dialog id="goalDialog">
    <form class="dialog-card" id="goalForm">
      <div class="dialog-head"><h2>Obiettivo calorie</h2><button type="button" id="closeGoal" aria-label="Chiudi">×</button></div>
      <p>Inserisci solo un obiettivo concordato con la tua professionista. Puoi lasciarlo vuoto per usare il diario senza limite.</p>
      <label class="field"><span>Kcal giornaliere</span><input id="calorieGoal" inputmode="numeric" placeholder="Facoltativo"></label>
      <button class="primary" type="submit">Salva obiettivo</button>
    </form>
  </dialog>
  <dialog id="activeCaloriesDialog">
    <form class="dialog-card" id="activeCaloriesForm">
      <div class="dialog-head">
        <div><p class="eyebrow">ATTIVITÀ DEL GIORNO</p><h2>Calorie attive bruciate</h2></div>
        <button type="button" id="closeActiveCalories" aria-label="Chiudi">×</button>
      </div>
      <p>Inserisci il valore “Energia attiva” indicato da Apple Watch, iPhone o un altro dispositivo.</p>
      <p id="activeCaloriesDate" class="active-calories-date"></p>
      <label class="field"><span>Kcal attive</span><input id="activeCaloriesInput" inputmode="decimal" maxlength="7" placeholder="Es. 450" required></label>
      <p class="diary-disclaimer">Resta separato dalle calorie assunte e non cambia l’obiettivo. La web app non può leggere direttamente Apple Salute.</p>
      <button class="primary" type="submit">Salva attività</button>
      <button class="delete-entry hidden" type="button" id="clearActiveCalories">Azzera per questo giorno</button>
    </form>
  </dialog>`;
}

document.querySelector('[data-page="shopping"]').insertAdjacentHTML('beforebegin',diaryMarkup());
document.querySelector('[data-nav="week"]').insertAdjacentHTML('beforebegin','<button data-nav="diary"><span aria-hidden="true">◷</span>Diario</button>');
document.body.insertAdjacentHTML('beforeend',dialogMarkup());
document.querySelector('[data-nav="diary"]').onclick=()=>{setPage('diary');renderDiary()};

function renderCatalog(){
  const recentByName=new Map();
  [...foodCatalog].sort((a,b)=>(b.lastUsedAt||0)-(a.lastUsedAt||0)).forEach(item=>{
    const key=item.name.toLocaleLowerCase('it');
    if(!recentByName.has(key))recentByName.set(key,item);
  });
  $('foodCatalog').innerHTML=[...recentByName.values()].sort((a,b)=>a.name.localeCompare(b.name,'it')).map(item=>`<option value="${esc(item.name)}"></option>`).join('');
}

function renderDiary(){
  normalizeDiaryData();
  const date=diaryDate();
  const key=diaryDateKey();
  const entries=diaryEntries.filter(entry=>entry.date===key);
  const total=entries.reduce((sum,entry)=>sum+(Number(entry.calories)||0),0);
  const goal=Number(diarySettings.calorieGoal)||0;
  const percent=goal?Math.round(total/goal*100):0;
  const activeCalories=activeCaloriesForDate(key);
  $('diaryFullDate').textContent=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(date);
  $('diaryDayName').textContent=new Intl.DateTimeFormat('it-IT',{weekday:'long'}).format(date);
  $('dailyCalories').textContent=new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(total);
  $('dailyActiveCalories').textContent=new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(activeCalories);
  $('setActiveCalories').textContent=activeCalories>0?'Modifica':'Inserisci';
  $('calorieGoalText').textContent=goal?`${Math.max(goal-total,0).toLocaleString('it-IT',{maximumFractionDigits:1})} kcal rimanenti sull’obiettivo alimentare`:'Obiettivo alimentare non impostato';
  $('caloriePercent').textContent=goal?`${percent}% di ${goal.toLocaleString('it-IT')} kcal`:'';
  $('calorieProgress').style.width=goal?`${Math.min(percent,100)}%`:'0%';
  $('calorieProgress').classList.toggle('over',goal>0&&total>goal);
  $('setCalorieGoal').textContent=goal?'Modifica obiettivo alimentare':'Imposta obiettivo alimentare';
  $('diaryMeals').innerHTML=DIARY_MEALS.map(meal=>{
    const items=entries.filter(entry=>entry.meal===meal);
    const subtotal=items.reduce((sum,entry)=>sum+(Number(entry.calories)||0),0);
    const content=items.length?items.map(entry=>`<button class="diary-entry" data-diary-entry="${entry.id}">
      <span><strong>${esc(entry.food)}</strong><small>${formatEntryMeasurement(entry)}</small></span>
      <span>${diaryNumber(entry.calories,1)} kcal</span>
    </button>`).join(''):'<p class="empty-meal">Nessun alimento registrato</p>';
    return`<section class="diary-meal"><div class="diary-meal-head"><h3>${meal}</h3><span>${diaryNumber(subtotal,1)} kcal</span></div>${content}</section>`;
  }).join('');
  document.querySelectorAll('[data-diary-entry]').forEach(button=>button.onclick=()=>openDiaryEntry(button.dataset.diaryEntry));
  renderCatalog();
}

function openDiaryEntry(id=null,meal='Colazione'){
  const entry=id?diaryEntries.find(item=>item.id===id):null;
  $('diaryForm').reset();
  $('diaryEntryId').value=entry?.id||'';
  $('diaryMeal').value=entry?.meal||meal;
  $('diaryFood').value=entry?.food||'';
  $('diaryQuantity').value=entry?String(entry.quantity).replace('.',','):'';
  $('diaryUnit').value=entry?savedDiaryUnit(entry):'g';
  $('diaryUnit').dataset.previousUnit=$('diaryUnit').value;
  $('diaryKcal100').value=entry?String(savedKcalValue(entry)).replace('.',','):'';
  $('diaryDialogTitle').textContent=entry?'Modifica alimento':'Aggiungi alimento';
  $('deleteDiaryEntry').classList.toggle('hidden',!entry);
  updateDiaryUnitInterface();
  calculateEntryCalories();
  $('diaryDialog').showModal();
  setTimeout(()=>$('diaryFood').focus(),100);
}

function closeDiaryDialog(){$('diaryDialog').close();$('diaryForm').reset()}

function openActiveCaloriesDialog(){
  const activeCalories=activeCaloriesForDate(diaryDateKey());
  $('activeCaloriesInput').value=activeCalories>0?String(activeCalories).replace('.',','):'';
  $('activeCaloriesDate').textContent=new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(diaryDate());
  $('clearActiveCalories').classList.toggle('hidden',!(activeCalories>0));
  $('activeCaloriesDialog').showModal();
  setTimeout(()=>$('activeCaloriesInput').focus(),100);
}

$('previousDiaryDay').onclick=()=>{diaryOffset--;renderDiary()};
$('nextDiaryDay').onclick=()=>{diaryOffset++;renderDiary()};
$('addDiaryEntry').onclick=()=>openDiaryEntry();
$('closeDiary').onclick=closeDiaryDialog;
for(const id of['diaryQuantity','diaryKcal100'])$(id).addEventListener('input',calculateEntryCalories);
$('diaryUnit').addEventListener('change',()=>{
  const next=diaryUnit($('diaryUnit').value);
  const foodKey=$('diaryFood').value.trim().toLocaleLowerCase('it');
  const preset=foodCatalog.filter(item=>item.name.toLocaleLowerCase('it')===foodKey&&savedDiaryUnit(item)===next).sort((a,b)=>(b.lastUsedAt||0)-(a.lastUsedAt||0))[0];
  $('diaryKcal100').value=preset?String(savedKcalValue(preset)).replace('.',','):'';
  $('diaryUnit').dataset.previousUnit=next;
  const selected=$('onlineSelectedFood');
  if(selected){selected.hidden=true;selected.replaceChildren()}
  updateDiaryUnitInterface();
  calculateEntryCalories();
});

$('diaryFood').addEventListener('input',()=>{
  const found=foodCatalog.filter(item=>item.name.toLocaleLowerCase('it')===$('diaryFood').value.trim().toLocaleLowerCase('it')).sort((a,b)=>(b.lastUsedAt||0)-(a.lastUsedAt||0))[0];
  if(!found)return;
  $('diaryUnit').value=savedDiaryUnit(found);
  $('diaryUnit').dataset.previousUnit=$('diaryUnit').value;
  $('diaryKcal100').value=String(savedKcalValue(found)).replace('.',',');
  updateDiaryUnitInterface();
  calculateEntryCalories();
});

$('diaryForm').onsubmit=event=>{
  event.preventDefault();
  const food=$('diaryFood').value.trim();
  const quantity=parseDiaryNumber($('diaryQuantity').value);
  const unit=diaryUnit($('diaryUnit').value);
  const kcalValue=parseDiaryNumber($('diaryKcal100').value);
  const calories=calculateEntryCalories();
  if(!food||!(quantity>0)||!(kcalValue>=0))return alert('Completa alimento, quantità, unità di misura e calorie.');
  const id=$('diaryEntryId').value;
  const roundedKcal=Math.round(kcalValue*100)/100;
  const entry={
    id:id||diaryUid(),
    date:diaryDateKey(),
    meal:$('diaryMeal').value,
    food,
    quantity:Math.round(quantity*100)/100,
    unit,
    kcalRate:roundedKcal,
    kcalValue:roundedKcal,
    kcalPer100:roundedKcal,
    calories:Math.round(calories*10)/10,
    createdAt:Date.now()
  };
  if(id)diaryEntries=diaryEntries.map(item=>item.id===id?{...item,...entry,createdAt:item.createdAt}:item);
  else diaryEntries.push(entry);
  const known=foodCatalog.find(item=>item.name.toLocaleLowerCase('it')===food.toLocaleLowerCase('it')&&savedDiaryUnit(item)===unit);
  if(known){
    known.name=food;
    known.unit=unit;
    known.kcalRate=roundedKcal;
    known.kcalValue=roundedKcal;
    known.kcalPer100=roundedKcal;
    known.lastUsedAt=Date.now();
  }else foodCatalog.push({name:food,unit,kcalRate:roundedKcal,kcalValue:roundedKcal,kcalPer100:roundedKcal,lastUsedAt:Date.now()});
  writeLocal(DIARY_KEY,diaryEntries);
  writeLocal(FOODS_KEY,foodCatalog);
  closeDiaryDialog();
  renderDiary();
};

$('deleteDiaryEntry').onclick=()=>{
  const id=$('diaryEntryId').value;
  if(id&&confirm('Eliminare questo alimento dal diario?')){
    diaryEntries=diaryEntries.filter(item=>item.id!==id);
    writeLocal(DIARY_KEY,diaryEntries);
    closeDiaryDialog();
    renderDiary();
  }
};

$('setActiveCalories').onclick=openActiveCaloriesDialog;
$('closeActiveCalories').onclick=()=>$('activeCaloriesDialog').close();
$('activeCaloriesForm').onsubmit=event=>{
  event.preventDefault();
  const value=$('activeCaloriesInput').value.trim();
  const calories=value?parseDiaryNumber(value):0;
  if(value&&(!Number.isFinite(calories)||calories<0))return alert('Inserisci un numero valido di calorie attive.');
  const key=diaryDateKey();
  if(calories>0)activeCaloriesByDate[key]={calories:Math.round(calories*10)/10,updatedAt:Date.now(),source:'manual'};
  else delete activeCaloriesByDate[key];
  writeLocal(ACTIVE_CALORIES_KEY,activeCaloriesByDate);
  $('activeCaloriesDialog').close();
  renderDiary();
};
$('clearActiveCalories').onclick=()=>{
  const key=diaryDateKey();
  if(confirm('Azzerare le calorie attive per questo giorno?')){
    delete activeCaloriesByDate[key];
    writeLocal(ACTIVE_CALORIES_KEY,activeCaloriesByDate);
    $('activeCaloriesDialog').close();
    renderDiary();
  }
};

$('setCalorieGoal').onclick=()=>{$('calorieGoal').value=diarySettings.calorieGoal||'';$('goalDialog').showModal()};
$('closeGoal').onclick=()=>$('goalDialog').close();
$('goalForm').onsubmit=event=>{
  event.preventDefault();
  const value=$('calorieGoal').value.trim();
  const goal=value?parseDiaryNumber(value):null;
  if(value&&!(goal>0))return alert('Inserisci un obiettivo valido oppure lascia vuoto.');
  diarySettings.calorieGoal=goal?Math.round(goal):null;
  writeLocal(DIARY_SETTINGS_KEY,diarySettings);
  $('goalDialog').close();
  renderDiary();
};

$('diaryUnit').dataset.previousUnit='g';
updateDiaryUnitInterface();
renderDiary();





