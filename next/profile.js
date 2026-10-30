'use strict';
const KEY='sb_publishable_7R9F_vBvgg2AsfgRJyRIsQ_j2nljGKI',PROFILE_SUPABASE_URL='https://vwsoergltegncrretxnz.supabase.co';
const $=id=>document.getElementById(id);
const animals=[['fox','🦊','Лиса'],['owl','🦉','Сова'],['cat','🐱','Кот'],['panda','🐼','Панда'],['otter','🦦','Выдра'],['raccoon','🦝','Енот'],['capybara','🦫','Капибара'],['penguin','🐧','Пингвин'],['koala','🐨','Коала'],['red-panda','🦊','Красная панда'],['rabbit','🐰','Кролик'],['bear','🐻','Медведь'],
 ['giraffe','🦒','Жираф'],['gorilla','🦍','Горилла'],['hyena','🐾','Гиена'],['kangaroo','🦘','Кенгуру'],
 ['leopard','🐆','Леопард'],['lion','🦁','Лев'],['orca','🐋','Косатка'],['polarbear','🐻','Белый медведь'],
 ['rhinoceros','🦏','Носорог'],['toucan','🐦','Тукан'],['turtle','🐢','Черепаха'],
 ['wolf','🐺','Волк'],['zebra','🦓','Зебра']];
const s={db:null,me:null,avatar:'fox',registrationAvatar:'fox',pairTimer:null};
function message(id,value='',error=false){$(id).textContent=value;$(id).classList.toggle('error',!!error)}
function avatar(key){return animals.find(x=>x[0]===key)||animals[0]}
function portrait(key,label){return QwizTeams.avatar(avatar(key)[0])}
function drawAvatars(id,selected){
 const tile=([key,icon,label])=>'<button type="button" class="avatar-pick '+(key===selected?'selected':'')+'" data-avatar="'+key+'" aria-label="'+label+'" aria-pressed="'+(key===selected)+'">'+portrait(key,label)+'<small>'+label+'</small></button>';
 $(id).innerHTML=animals.slice(0,12).map(tile).join('')+
  '<details class="avatar-more"'+(animals.slice(12).some(a=>a[0]===selected)?' open':'')+'><summary>Ещё 13 объёмных персонажей <span>3D</span></summary><div class="avatar-more-grid">'+animals.slice(12).map(tile).join('')+'</div></details>';
}
async function rpc(action,data={}){const r=await s.db.rpc('qwiz_student_identity',{p_action:action,p_data:data});if(r.error)throw Error(r.error.message||'Ошибка входа');return r.data}
function chooseTab(register){$('loginPanel').hidden=register;$('registerPanel').hidden=!register;$('authLoginTab').classList.toggle('active',!register);$('authRegisterTab').classList.toggle('active',register)}
function showAuth(){ $('authPanel').hidden=false;$('dashboard').hidden=true;
 const args=new URLSearchParams(location.search);if(args.has('pair'))$('pairEntry').hidden=false;}
function showDashboard(me){s.me=me;$('authPanel').hidden=true;$('dashboard').hidden=false;
 $('myAvatar').innerHTML=portrait(me.avatar,'Ваш персонаж');$('myNickname').textContent=me.nickname;$('myFullName').textContent=me.full_name;$('myLogin').textContent='@'+me.login;
 $('myNameInput').value=me.full_name;$('myNicknameInput').value=me.nickname;s.avatar=me.avatar;
 drawAvatars('profileAvatars',s.avatar);
 const stats=me.stats||{};for(const key of ['Games','Answers','Correct','Points'])$( 'stat'+key ).textContent=Number(stats[key.toLowerCase()]||0).toLocaleString('ru-RU');
}
async function reload(){const data=await rpc('me');if(data.registered)showDashboard(data);else showAuth()}
async function ensureAnon(){const {data,error}=await s.db.auth.getSession();if(error)throw Error(error.message);
 if(data.session)return;const result=await s.db.auth.signInAnonymously();if(result.error)throw Error(result.error.message)}
async function register(e){e.preventDefault();message('authMessage','');
 const password=$('registerPassword').value;
 if(password!==$('registerPasswordConfirm').value){message('authMessage','Пароли не совпадают.',true);return}
 try{const result=await rpc('register',{login:$('registerLogin').value.trim().toLowerCase(),password,
   full_name:$('registerFullName').value.trim(),nickname:$('registerNickname').value.trim(),avatar:s.registrationAvatar});
 if(!result.ok)throw Error(result.message||'Регистрация не выполнена');
 $('registerPassword').value='';$('registerPasswordConfirm').value='';await reload();
 }catch(error){message('authMessage',error.message,true)}}
async function login(e){e.preventDefault();message('authMessage','');
 try{const r=await rpc('login',{login:$('studentLoginName').value.trim().toLowerCase(),password:$('studentLoginPassword').value});
 if(!r.ok)throw Error(r.message||'Неверный логин или пароль');$('studentLoginPassword').value='';await reload();
 }catch(error){message('authMessage',error.message,true)}}
async function update(e){e.preventDefault();try{const r=await rpc('update',{full_name:$('myNameInput').value.trim(),nickname:$('myNicknameInput').value.trim(),avatar:s.avatar});
 if(!r.ok)throw Error(r.message||'Ошибка');await reload();message('profileMessage','Изменения сохранены.');
 }catch(error){message('profileMessage',error.message,true)}}
async function changePassword(e){e.preventDefault();try{const r=await rpc('change_password',{old_password:$('oldPassword').value,new_password:$('newPassword').value});
 if(!r.ok)throw Error(r.message||'Неверный пароль');$('passwordForm').reset();message('profileMessage','Пароль изменён.');
 }catch(error){message('profileMessage',error.message,true)}}
async function makePair(){message('profileMessage','');
 try{const r=await rpc('pair_create');if(!r.ok)throw Error(r.message||'Не удалось создать QR');
 const url=new URL('./profile.html',location.href);url.searchParams.set('pair',r.token);
 $('pairQr').hidden=false;$('pairQr').replaceChildren();
 if(typeof QRCode==='function')new QRCode($('pairQr'),{text:url.toString(),width:190,height:190,colorDark:'#24302d',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
 if(s.pairTimer)clearInterval(s.pairTimer);
 let expires=Date.now()+300000;
 s.pairTimer=setInterval(()=>{const left=Math.max(0,Math.ceil((expires-Date.now())/1000));
  $('pairClock').textContent=left?'QR действует ещё '+Math.ceil(left/60)+' мин.':'QR истёк. Создайте новый.';
  if(!left){clearInterval(s.pairTimer);$('pairQr').hidden=true}},1000);
 }catch(error){message('profileMessage',error.message,true)}}
async function claimPair(){const token=new URLSearchParams(location.search).get('pair');if(!token)return;
 try{const r=await rpc('pair_claim',{token});if(!r.ok)throw Error(r.message||'Код не принят');
 const url=new URL(location.href);url.searchParams.delete('pair');history.replaceState(null,'',url.toString());
 await reload();
 }catch(error){message('authMessage',error.message,true)}}
function wire(){
 $('authLoginTab').onclick=()=>chooseTab(false);$('authRegisterTab').onclick=()=>chooseTab(true);
 $('studentRegister').onsubmit=register;$('studentLogin').onsubmit=login;
 $('changeProfile').onsubmit=update;$('passwordForm').onsubmit=changePassword;
 $('registerAvatars').onclick=e=>{const b=e.target.closest('[data-avatar]');if(!b)return;s.registrationAvatar=b.dataset.avatar;drawAvatars('registerAvatars',s.registrationAvatar)};
 $('profileAvatars').onclick=e=>{const b=e.target.closest('[data-avatar]');if(!b)return;s.avatar=b.dataset.avatar;drawAvatars('profileAvatars',s.avatar)};
 $('createPair').onclick=makePair;$('claimPair').onclick=claimPair;
}
async function init(){
 wire();drawAvatars('registerAvatars',s.registrationAvatar);
 if(!window.supabase?.createClient){message('authMessage','Нет соединения с игрой.',true);showAuth();return}
 s.db=window.supabase.createClient(PROFILE_SUPABASE_URL,KEY);
 try{await ensureAnon();if(new URLSearchParams(location.search).has('pair')){showAuth();await claimPair()}else await reload();
 }catch(error){showAuth();message('authMessage',error.message,true)}
}
window.addEventListener('DOMContentLoaded',init);
