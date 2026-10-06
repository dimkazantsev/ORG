const SUPABASE_URL = "https://bderfrcfuhnutuoyudje.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hv7NgYuVsfKhFuhX_9pl0Q_qXWA2wOr";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id)=>document.getElementById(id);
const views = {home:$("homeView"),student:$("studentView"),teacher:$("teacherView")};
const state = {session:null,participant:null,teams:[],participants:[],question:null,studentStartedAt:null,teacherSession:null,teacherUser:null,subs:[]};

function showView(name){
  Object.entries(views).forEach(([k,v])=>v.classList.toggle("hidden",k!==name));
}
function msg(el,text,kind=""){el.textContent=text;el.dataset.kind=kind}
function code(){return ("ORG"+Math.random().toString(36).slice(2,6)).toUpperCase()}

$("teacherToggle").onclick=()=>showView("teacher");

async function ensureAnonymous(){
  const {data:{session}}=await sb.auth.getSession();
  if(session) return session;
  const {data,error}=await sb.auth.signInAnonymously();
  if(error) throw error;
  return data.session;
}

$("joinForm").addEventListener("submit",async(e)=>{
  e.preventDefault();
  try{
    msg($("joinMessage"),"Подключаю…");
    await ensureAnonymous();
    const {data,error}=await sb.rpc("org_quiz_join",{
      p_code:$("joinCode").value,
      p_full_name:$("joinName").value,
      p_academic_group:$("joinGroup").value
    });
    if(error) throw error;
    const row=data?.[0];
    state.participant={id:row.participant_id};
    $("studentQuizTitle").textContent=row.quiz_title;
    showView("student");
    await loadStudentSession(row.session_id);
    subscribeStudent(row.session_id);
  }catch(err){msg($("joinMessage"),humanError(err.message),"error")}
});

async function loadStudentSession(sessionId){
  const {data:s}=await sb.from("org_quiz_sessions").select("*").eq("id",sessionId).single();
  state.session=s;
  const {data:p}=await sb.from("org_quiz_participants").select("*").eq("session_id",sessionId).maybeSingle();
  if(p){state.participant=p}
  await loadStudentTeams();
  await loadActiveQuestion();
}
async function loadStudentTeams(){
  if(!state.session)return;
  const {data}=await sb.from("org_quiz_teams").select("*").eq("session_id",state.session.id).order("score",{ascending:false});
  state.teams=data||[];
  const mine=state.teams.find(t=>t.id===state.participant?.team_id);
  $("studentTeam").textContent=mine?mine.name:"Без команды";
  $("studentLeaderboard").innerHTML=state.teams.map((t,i)=>leaderRow(i,t.name,t.score)).join("")||"<p class='message'>Команды ещё не сформированы.</p>";
}
async function loadActiveQuestion(){
  if(!state.session)return;
  if(state.session.status==="lobby"){
    $("questionCounter").textContent="Лобби";$("questionPrompt").textContent="Ожидаем запуска преподавателем."; $("answerOptions").innerHTML=""; return;
  }
  if(state.session.status==="finished"){
    $("questionCounter").textContent="Финиш";$("questionPrompt").textContent="Квиз завершён."; $("answerOptions").innerHTML=""; return;
  }
  const {data,error}=await sb.from("org_quiz_questions").select("*")
    .eq("quiz_id",state.session.quiz_id).eq("order_index",state.session.current_question_index).maybeSingle();
  if(error||!data){$("questionPrompt").textContent="Ожидаем следующий вопрос.";return}
  state.question=data; state.studentStartedAt=performance.now();
  $("questionCounter").textContent="Вопрос "+data.order_index;
  $("questionTimer").textContent=data.time_limit_sec+" сек.";
  $("questionPrompt").textContent=data.prompt;
  $("answerFeedback").textContent="";
  $("answerOptions").innerHTML=data.options.map((o,i)=>`<button class="answer" data-i="${i}"><strong>${String.fromCharCode(65+i)}.</strong> ${escapeHtml(o)}</button>`).join("");
  document.querySelectorAll(".answer").forEach(b=>b.onclick=()=>submitAnswer(Number(b.dataset.i)));
}
async function submitAnswer(selected){
  if(!state.question)return;
  document.querySelectorAll(".answer").forEach(b=>b.disabled=true);
  const ms=Math.round(performance.now()-state.studentStartedAt);
  const {data,error}=await sb.rpc("org_quiz_submit_answer",{
    p_session_id:state.session.id,p_question_id:state.question.id,p_selected_option:selected,p_response_ms:ms
  });
  if(error){msg($("answerFeedback"),humanError(error.message));return}
  const r=data?.[0];
  msg($("answerFeedback"),r?.is_correct?`Верно. +${r.points_awarded} баллов`:"Ответ принят.");
}
function subscribeStudent(sessionId){
  clearSubs();
  state.subs.push(
    sb.channel("org-student-session-"+sessionId).on("postgres_changes",{event:"UPDATE",schema:"public",table:"org_quiz_sessions",filter:"id=eq."+sessionId},async payload=>{
      state.session=payload.new;await loadActiveQuestion();
    }).subscribe(),
    sb.channel("org-student-team-"+sessionId).on("postgres_changes",{event:"*",schema:"public",table:"org_quiz_teams",filter:"session_id=eq."+sessionId},loadStudentTeams).subscribe(),
    sb.channel("org-student-person-"+sessionId).on("postgres_changes",{event:"UPDATE",schema:"public",table:"org_quiz_participants",filter:"session_id=eq."+sessionId},async()=>{await loadStudentSession(sessionId)}).subscribe()
  );
}

$("teacherLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const {data,error}=await sb.auth.signInWithPassword({email:$("teacherEmail").value,password:$("teacherPassword").value});
  if(error){msg($("teacherLoginMessage"),humanError(error.message));return}
  const {data:isAdmin,error:adminErr}=await sb.rpc("org_quiz_is_admin_check");
  if(adminErr||!isAdmin){await sb.auth.signOut();msg($("teacherLoginMessage"),"У этой учётной записи нет прав преподавателя.");return}
  state.teacherUser=data.user;
  await enterTeacher();
});

async function enterTeacher(){
  $("teacherLoginCard").classList.add("hidden");
  $("teacherDashboard").classList.remove("hidden");
  $("teacherLogout").classList.remove("hidden");
  await loadQuizSets();
}
async function loadQuizSets(){
  const {data,error}=await sb.from("org_quiz_sets").select("id,title,topic").order("created_at");
  if(error){msg($("teacherActionMessage"),error.message);return}
  $("quizSelect").innerHTML=(data||[]).map(q=>`<option value="${q.id}">${escapeHtml(q.title)} — ${escapeHtml(q.topic)}</option>`).join("");
}

$("createSessionForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const c=code();
  const {data,error}=await sb.from("org_quiz_sessions").insert({
    quiz_id:$("quizSelect").value,code:c,title:$("sessionTitle").value||null,
    team_count:Number($("teamCount").value||4),created_by:state.teacherUser.id
  }).select().single();
  if(error){msg($("teacherActionMessage"),error.message);return}
  state.teacherSession=data;
  await refreshTeacher();
  subscribeTeacher(data.id);
  msg($("teacherActionMessage"),"Комната создана. Код: "+c);
});

async function refreshTeacher(){
  const s=state.teacherSession;if(!s)return;
  const [{data:participants},{data:teams}]=await Promise.all([
    sb.from("org_quiz_participants").select("*").eq("session_id",s.id).order("joined_at"),
    sb.from("org_quiz_teams").select("*").eq("session_id",s.id).order("order_index")
  ]);
  state.participants=participants||[];state.teams=teams||[];
  $("metricCode").textContent=s.code;$("metricParticipants").textContent=state.participants.length;
  $("metricTeams").textContent=state.teams.length;$("metricStatus").textContent=statusLabel(s.status);
  renderParticipants();renderTeacherLeaderboard();
}
function renderParticipants(){
  const options='<option value="">Без команды</option>'+state.teams.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  $("participantsBoard").innerHTML=state.participants.map(p=>`
    <div class="participant">
      <div><strong>${escapeHtml(p.full_name)}</strong><small>${escapeHtml(p.academic_group)}</small></div>
      <select data-person="${p.id}">${options}</select>
    </div>`).join("")||"<p class='message'>Участники ещё не подключились.</p>";
  document.querySelectorAll("[data-person]").forEach(sel=>{
    const p=state.participants.find(x=>x.id===sel.dataset.person);sel.value=p?.team_id||"";
    sel.onchange=()=>moveParticipant(sel.dataset.person,sel.value||null);
  });
}
async function moveParticipant(id,team_id){
  const {error}=await sb.from("org_quiz_participants").update({team_id}).eq("id",id);
  if(error)msg($("teacherActionMessage"),error.message);else await refreshTeacher();
}
function renderTeacherLeaderboard(){
  const sorted=[...state.teams].sort((a,b)=>b.score-a.score);
  $("teacherLeaderboard").innerHTML=sorted.map((t,i)=>leaderRow(i,t.name,t.score)).join("")||"<p class='message'>Нет команд.</p>";
}
$("randomizeTeams").onclick=async()=>{
  if(!state.teacherSession)return;
  const {error}=await sb.rpc("org_quiz_randomize_teams",{p_session_id:state.teacherSession.id});
  if(error)msg($("teacherActionMessage"),error.message);else{msg($("teacherActionMessage"),"Команды распределены.");await refreshTeacher()}
};
$("startGame").onclick=()=>setSession({status:"live",current_question_index:1,started_at:new Date().toISOString()});
$("nextQuestion").onclick=async()=>{
  if(!state.teacherSession)return;
  const {count}=await sb.from("org_quiz_questions").select("*",{count:"exact",head:true}).eq("quiz_id",state.teacherSession.quiz_id);
  const next=Math.min((state.teacherSession.current_question_index||0)+1,count||1);
  await setSession({status:"live",current_question_index:next});
};
$("prevQuestion").onclick=()=>setSession({current_question_index:Math.max(1,(state.teacherSession?.current_question_index||1)-1)});
$("finishGame").onclick=()=>setSession({status:"finished",ended_at:new Date().toISOString()});
async function setSession(patch){
  if(!state.teacherSession)return;
  const {data,error}=await sb.from("org_quiz_sessions").update(patch).eq("id",state.teacherSession.id).select().single();
  if(error){msg($("teacherActionMessage"),error.message);return}
  state.teacherSession=data;await refreshTeacher();
}
function subscribeTeacher(sessionId){
  clearSubs();
  ["org_quiz_participants","org_quiz_teams","org_quiz_answers"].forEach(table=>{
    state.subs.push(sb.channel("teacher-"+table+"-"+sessionId).on("postgres_changes",{event:"*",schema:"public",table,filter:"session_id=eq."+sessionId},refreshTeacher).subscribe());
  });
  state.subs.push(sb.channel("teacher-session-"+sessionId).on("postgres_changes",{event:"UPDATE",schema:"public",table:"org_quiz_sessions",filter:"id=eq."+sessionId},async payload=>{state.teacherSession=payload.new;await refreshTeacher()}).subscribe());
}
function clearSubs(){state.subs.forEach(c=>sb.removeChannel(c));state.subs=[]}
$("teacherLogout").onclick=async()=>{clearSubs();await sb.auth.signOut();location.reload()}
function leaderRow(i,name,score){return `<div class="leader-row"><div class="rank">${i+1}</div><div><strong>${escapeHtml(name)}</strong></div><div class="score">${score}</div></div>`}
function statusLabel(s){return ({lobby:"Лобби",live:"Идёт",paused:"Пауза",finished:"Завершено"})[s]||s}
function humanError(s=""){if(s.includes("SESSION_NOT_FOUND"))return"Комната не найдена или уже закрыта.";if(s.includes("Anonymous sign-ins are disabled"))return"Анонимный вход студентов отключён в Supabase.";return s}
function escapeHtml(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

// Восстанавливаем преподавательскую сессию только если пользователь уже авторизован.
(async()=>{
  const {data:{session}}=await sb.auth.getSession();
  if(session && !session.user.is_anonymous){
    state.teacherUser=session.user;
    const {data}=await sb.rpc("org_quiz_is_admin_check");
    if(data){showView("teacher");await enterTeacher()}
  }
})();
