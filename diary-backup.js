document.querySelector('#infoDialog .dialog-card').insertAdjacentHTML('beforeend','<div class="diary-backup"><button type="button" id="exportDiary">Esporta backup diario</button><label>Importa backup diario<input type="file" id="importDiary" accept="application/json"></label></div>');

$('exportDiary').onclick=()=>{
  if(typeof normalizeDiaryData==='function')normalizeDiaryData();
  const backup={app:'piano-alimentare',version:2,exportedAt:new Date().toISOString(),diaryEntries,foodCatalog,diarySettings};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const link=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`diario-alimentare-${diaryDateKey()}.json`});
  link.click();
  URL.revokeObjectURL(link.href);
};

$('importDiary').onchange=async event=>{
  try{
    const file=event.target.files[0];
    if(!file)return;
    const backup=JSON.parse(await file.text());
    if(backup.app!=='piano-alimentare'||!Array.isArray(backup.diaryEntries)||!Array.isArray(backup.foodCatalog))throw new Error();
    if(confirm('Sostituire il diario attuale con questo backup?')){
      diaryEntries=backup.diaryEntries;
      foodCatalog=backup.foodCatalog;
      diarySettings=backup.diarySettings&&typeof backup.diarySettings==='object'?backup.diarySettings:{calorieGoal:null};
      if(typeof normalizeDiaryData==='function')normalizeDiaryData();
      writeLocal(DIARY_KEY,diaryEntries);
      writeLocal(FOODS_KEY,foodCatalog);
      writeLocal(DIARY_SETTINGS_KEY,diarySettings);
      $('infoDialog').close();
      renderDiary();
    }
  }catch{alert('Il file selezionato non è un backup valido del diario.')}
  event.target.value='';
};

