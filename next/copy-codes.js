'use strict';
// The projector exposes only the public room code and public team invitations.
// No moderator permissions, participant details, or answer keys are read.
(()=>{
 const button=document.getElementById('projectionCopyAllCodes');
 const dock=document.getElementById('projectionCopyCodesDock');
 const status=document.getElementById('projectionCopyCodesStatus');
 if(!button||!dock||!status)return;
 const validRoom=/^[A-F0-9]{8}$/;
 const validTeam=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const roomCode=new URLSearchParams(location.search).get('room')?.trim().toUpperCase()||'';
 dock.hidden=!validRoom.test(roomCode);
 function makeText(state){
  const code=state?.code;
  if(!validRoom.test(code||'')||code!==roomCode)return '';
  const base=new URL('./',location.href);
  base.searchParams.set('room',code);
  const lines=['Код комнаты: '+code,'Ссылка на игру: '+base.toString()];
  const teams=Array.isArray(state.lobby_teams)&&state.lobby_teams.length?state.lobby_teams:state.teams;
  const ids=new Set();
  for(const team of Array.isArray(teams)?teams:[]){
   if(!validTeam.test(team?.id||'')||ids.has(team.id))continue;
   ids.add(team.id);
   const name=String(team.name||'Команда').replace(/[\r\n\t]+/g,' ').trim();
   const url=new URL(base);
   url.searchParams.set('team',team.id);
   lines.push('Команда: '+name,'Код команды: '+team.id,'Приглашение: '+url.toString());
   if(ids.size===15)break;
  }
  return lines.join('\n');
 }
 async function handleCopy(){
  const text=makeText(typeof ctx!=='undefined'?ctx.last:null);
  if(!text){status.textContent='Данные игры ещё не загружены.';status.hidden=false;return;}
  let copied=false;
  try{await navigator.clipboard.writeText(text);copied=true;}
  catch{
   const field=document.createElement('textarea');
   field.value=text;field.readOnly=true;
   field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
   document.body.append(field);field.select();
   try{copied=document.execCommand('copy');}catch{}
   field.remove();
  }
  status.textContent=copied?'Код комнаты и приглашения команд скопированы.':'Браузер запретил копирование в буфер обмена.';
  status.hidden=false;
 }
 button.addEventListener('click',handleCopy);
})();
