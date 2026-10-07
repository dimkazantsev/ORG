const SUPABASE_URL = "https://bderfrcfuhnutuoyudje.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hv7NgYuVsfKhFuhX_9pl0Q_qXWA2wOr";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id)=>document.getElementById(id);
const views = {home:$("homeView"),student:$("studentView"),teacher:$("teacherView")};
const state = {session:null,participant:null,teams:[],participants:[],question:null,studentStartedAt:null,teacherSession:null,teacherUser:null,subs:[],quizSets:[],editorQuizId:null,timerHandle:null,analyticsRows:[],selectedAnalyticsSession:null,sound:true,viewAsParticipant:false,regionTopology:null};

function showView(name){
  const layer=$("transitionLayer");
  layer?.classList.remove("play"); void layer?.offsetWidth; layer?.classList.add("play");
  playSound("transition");
  setTimeout(()=>Object.entries(views).forEach(([k,v])=>v.classList.toggle("hidden",k!==name)),220);
}
function msg(el,text,kind=""){el.textContent=text;el.dataset.kind=kind}
function code(){return ("ORG"+Math.random().toString(36).slice(2,6)).toUpperCase()}

$("teacherToggle").onclick=()=>showView("teacher");
$("brandHome").onclick=()=>showView("home");
$("openModerator").onclick=()=>showView("teacher");
document.querySelectorAll("[data-role-tab]").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll("[data-role-tab]").forEach(x=>x.classList.toggle("active",x===btn));
  $("participantAccess").classList.toggle("hidden",btn.dataset.roleTab!=="participant");
  $("moderatorAccess").classList.toggle("hidden",btn.dataset.roleTab!=="moderator");
  playSound("tap");
});
$("soundToggle").onclick=()=>{state.sound=!state.sound;$("soundToggle").textContent=state.sound?"♪":"×";showToast(state.sound?"Звук включён":"Звук выключен")};

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
    await sb.rpc("org_party_set_profile",{p_role:"participant",p_display_name:$("joinName").value,p_avatar_seed:$("joinName").value,p_preferences:{}});
    $("studentQuizTitle").textContent=row.quiz_title;
    $("playerAvatar").textContent=($("joinName").value.trim()[0]||"У").toUpperCase();
    showView("student");
    await loadStudentSession(row.session_id);
    subscribeStudent(row.session_id);
  }catch(err){msg($("joinMessage"),humanError(err.message),"error")}
});

async function loadStudentSession(sessionId){
  const {data:s}=await sb.from("org_quiz_sessions").select("*").eq("id",sessionId).single();
  state.session=s;
  const {data:p}=await sb.from("org_quiz_participants").select("*").eq("session_id",sessionId).maybeSingle();
  if(p){state.participant=p;renderLifeState()}
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
  $("questionTypeBadge").textContent=questionTypeLabel(data.question_type);
  startSharedTimer(data.time_limit_sec,state.session.question_started_at,$("questionTimer"),()=>lockQuestionUI());
  $("questionPrompt").textContent=data.prompt;
  $("answerFeedback").textContent="";
  $("questionCard").classList.toggle("danger-mode",data.question_type==="elimination");
  await renderQuestionMedia(data,$("mediaStage"));
  await renderQuestionInteraction(data);
}
async function submitPayload(payload){
  if(!state.question)return;
  lockQuestionUI();
  const ms=Math.round(performance.now()-state.studentStartedAt);
  const {data,error}=await sb.rpc("org_quiz_submit_payload",{
    p_session_id:state.session.id,p_question_id:state.question.id,p_answer:payload,p_response_ms:ms
  });
  if(error){msg($("answerFeedback"),humanError(error.message));return}
  const r=data?.[0];
  if(r?.is_correct){playSound("correct");msg($("answerFeedback"),`Верно. +${r.points_awarded} баллов`);}
  else{playSound(state.question?.question_type==="elimination"?"eliminate":"wrong");msg($("answerFeedback"),"Ответ принят.");}
  if(state.session?.id){await loadStudentSession(state.session.id);}
  if(state.participant?.life_state==="eliminated") showEliminationOverlay();
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
  await sb.rpc("org_party_set_profile",{p_role:"moderator",p_display_name:data.user.email||"Модератор",p_avatar_seed:"moderator",p_preferences:{}});
  await enterTeacher();
});

async function enterTeacher(){
  $("teacherLoginCard").classList.add("hidden");
  $("teacherDashboard").classList.remove("hidden");
  $("teacherLogout").classList.remove("hidden");
  bindTeacherTabs();
  await loadQuizSets();
  await loadAnalytics();
}
async function loadQuizSets(){
  const {data,error}=await sb.from("org_quiz_sets").select("id,title,topic").order("created_at");
  if(error){msg($("teacherActionMessage"),error.message);return}
  state.quizSets=data||[];
  const opts=state.quizSets.map(q=>`<option value="${q.id}">${escapeHtml(q.title)} — ${escapeHtml(q.topic)}</option>`).join("");
  $("quizSelect").innerHTML=opts;
  $("editorQuizSelect").innerHTML=opts;
  if(!state.editorQuizId && state.quizSets[0]) state.editorQuizId=state.quizSets[0].id;
  if(state.editorQuizId) $("editorQuizSelect").value=state.editorQuizId;
  await loadQuestionBank();
}

$("createSessionForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const c=code();
  const {data,error}=await sb.from("org_quiz_sessions").insert({
    quiz_id:$("quizSelect").value,code:c,title:$("sessionTitle").value||null,
    team_count:Number($("teamCount").value||4),game_mode:$("gameMode").value,created_by:state.teacherUser.id
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
  renderParticipants();renderTeacherLeaderboard();await renderLiveTeacherQuestion();await loadLiveStudentRanking();
}
function renderParticipants(){
  if(!state.teams.length){
    $("participantsBoard").innerHTML=state.participants.map(p=>`
      <div class="participant"><div><strong>${escapeHtml(p.full_name)}</strong><small>${escapeHtml(p.academic_group)}</small></div><span class="message">Без команды</span></div>`).join("")||"<p class='message'>Участники ещё не подключились.</p>";
    return;
  }
  const unassigned=state.participants.filter(p=>!p.team_id);
  const cols=[
    ...state.teams.map(t=>({id:t.id,name:t.name,people:state.participants.filter(p=>p.team_id===t.id)})),
    {id:"",name:"Без команды",people:unassigned}
  ];
  $("participantsBoard").innerHTML=`<div class="teams-dnd">${cols.map(col=>`
    <div class="team-column">
      <h4>${escapeHtml(col.name)} <span class="message">(${col.people.length})</span></h4>
      <div class="team-dropzone" data-drop-team="${col.id}">
        ${col.people.map(p=>`<div class="team-person drag-card" draggable="true" data-person="${p.id}"><strong>${escapeHtml(p.full_name)}</strong><small>${escapeHtml(p.academic_group)}</small></div>`).join("")}
      </div>
    </div>`).join("")}</div>`;
  document.querySelectorAll(".drag-card").forEach(card=>{
    card.addEventListener("dragstart",()=>{card.classList.add("dragging");card.dataset.dragging="1"});
    card.addEventListener("dragend",()=>{card.classList.remove("dragging");delete card.dataset.dragging});
  });
  document.querySelectorAll("[data-drop-team]").forEach(zone=>{
    zone.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("drag-over")});
    zone.addEventListener("dragleave",()=>zone.classList.remove("drag-over"));
    zone.addEventListener("drop",async e=>{
      e.preventDefault();zone.classList.remove("drag-over");
      const card=document.querySelector("[data-dragging='1']");
      if(card) await moveParticipant(card.dataset.person,zone.dataset.dropTeam||null);
    });
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
$("startGame").onclick=()=>setSession({status:"live",current_question_index:1,interaction_phase:"answer",started_at:new Date().toISOString(),question_started_at:new Date().toISOString()});
$("nextQuestion").onclick=async()=>{
  if(!state.teacherSession)return;
  const {count}=await sb.from("org_quiz_questions").select("*",{count:"exact",head:true}).eq("quiz_id",state.teacherSession.quiz_id);
  const next=Math.min((state.teacherSession.current_question_index||0)+1,count||1);
  await setSession({status:"live",current_question_index:next,interaction_phase:"answer",question_started_at:new Date().toISOString()});
};
$("prevQuestion").onclick=()=>setSession({current_question_index:Math.max(1,(state.teacherSession?.current_question_index||1)-1),interaction_phase:"answer",question_started_at:new Date().toISOString()});
$("finishGame").onclick=()=>setSession({status:"finished",ended_at:new Date().toISOString(),question_started_at:null});
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
function humanError(s=""){if(s.includes("SESSION_NOT_FOUND"))return"Комната не найдена или уже закрыта.";if(s.includes("TIME_EXPIRED"))return"Время на ответ истекло.";if(s.includes("QUESTION_NOT_ACTIVE"))return"Этот вопрос уже закрыт.";if(s.includes("Anonymous sign-ins are disabled"))return"Анонимный вход студентов отключён в Supabase.";return s}
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


function bindTeacherTabs(){
  document.querySelectorAll("[data-teacher-tab]").forEach(btn=>{
    if(btn.dataset.bound)return;btn.dataset.bound="1";
    btn.onclick=()=>{
      document.querySelectorAll("[data-teacher-tab]").forEach(b=>b.classList.toggle("active",b===btn));
      $("teacherGamePanel").classList.toggle("hidden",btn.dataset.teacherTab!=="game");
      $("teacherEditorPanel").classList.toggle("hidden",btn.dataset.teacherTab!=="editor");
      $("teacherAnalyticsPanel").classList.toggle("hidden",btn.dataset.teacherTab!=="analytics");
      if(btn.dataset.teacherTab==="analytics") loadAnalytics();
      if(btn.dataset.teacherTab==="editor") loadQuestionBank();
    };
  });
}

$("editorQuizSelect").addEventListener("change",async e=>{
  state.editorQuizId=e.target.value;await loadQuestionBank();
});

$("createQuizForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const {data,error}=await sb.rpc("org_quiz_create_set",{
    p_title:$("newQuizTitle").value,
    p_topic:$("newQuizTopic").value,
    p_description:$("newQuizDescription").value||null
  });
  if(error){msg($("editorMessage"),error.message);return}
  state.editorQuizId=data;
  e.target.reset();
  await loadQuizSets();
  msg($("editorMessage"),"Квиз создан.");
});

$("createQuestionForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const type=$("questionType").value;
  const options=[$("optionA").value,$("optionB").value,$("optionC").value,$("optionD").value].map(x=>x.trim()).filter(Boolean);
  let correctPayload=[];
  if(type==="single"||type==="true_false") correctPayload=[Number($("correctOption").value)];
  else if(type==="multiple"){
    const map={A:0,B:1,C:2,D:3};
    correctPayload=String($("correctMulti").value||"").toUpperCase().split(/[,s]+/).filter(Boolean).map(x=>map[x]).filter(Number.isInteger).sort((a,b)=>a-b);
    if(!correctPayload.length){msg($("editorMessage"),"Укажите правильные варианты, например A, B.");return}
  }
  else if(type==="ordering"||type==="ranking") correctPayload=options.map((_,i)=>i);
  else if(type==="odd_one_out") correctPayload=[Number($("correctOption").value)];
  else if(type==="short") correctPayload=[$("optionA").value.trim()];
  const config=(type==="duel"||type==="split")?{mode:"audience_vote",anonymous:true}:type==="scale"?{min:1,max:10,left:"Совсем не согласен",right:"Полностью согласен"}:type==="wordcloud"?{max_words:3}:type==="team_pitch"?{mode:"team_pitch",anonymous:false}:{};
  const {error}=await sb.rpc("org_quiz_create_question_v2",{
    p_quiz_id:$("editorQuizSelect").value,
    p_question_type:type,
    p_prompt:$("newQuestionPrompt").value,
    p_options:options,
    p_correct_payload:correctPayload,
    p_config:config,
    p_explanation:$("newQuestionExplanation").value||null,
    p_points:100,
    p_time_limit_sec:Number($("questionTime").value||30)
  });
  if(error){msg($("editorMessage"),error.message);return}
  const quiz=$("editorQuizSelect").value;
  e.target.reset();$("editorQuizSelect").value=quiz;$("questionTime").value=30;$("questionType").value="single";updateQuestionTypeHint();
  await loadQuestionBank();
  msg($("editorMessage"),"Вопрос добавлен.");
});

async function loadQuestionBank(){
  const id=$("editorQuizSelect")?.value||state.editorQuizId;
  if(!id)return;
  state.editorQuizId=id;
  const {data,error}=await sb.from("org_quiz_questions").select("id,order_index,question_type,prompt,options,config,explanation,time_limit_sec,points").eq("quiz_id",id).order("order_index");
  if(error){if($("editorMessage"))msg($("editorMessage"),error.message);return}
  $("questionBankCount").textContent=`${data.length} вопросов`;
  $("questionBank").innerHTML=data.map(q=>`
    <div class="bank-row">
      <div class="bank-index">${q.order_index}</div>
      <div><strong>${escapeHtml(q.prompt)}</strong><p>${questionTypeLabel(q.question_type)} · ${q.options.map((o,i)=>String.fromCharCode(65+i)+". "+escapeHtml(o)).join(" · ")}</p></div>
      <button class="danger" data-delete-question="${q.id}">Удалить</button>
    </div>`).join("")||"<p class='message'>В этом квизе пока нет вопросов.</p>";
  document.querySelectorAll("[data-delete-question]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Удалить этот вопрос?"))return;
    const {error}=await sb.rpc("org_quiz_delete_question",{p_question_id:b.dataset.deleteQuestion});
    if(error)msg($("editorMessage"),error.message);else await loadQuestionBank();
  });
}

async function loadAnalytics(){
  if(!$("sessionHistory"))return;
  const {data,error}=await sb.from("org_quiz_session_stats").select("*").order("created_at",{ascending:false}).limit(50);
  if(error){$("sessionHistory").innerHTML=`<p class="message">${escapeHtml(error.message)}</p>`;return}
  const rows=data||[];
  $("analyticsSessions").textContent=rows.length;
  $("analyticsParticipants").textContent=rows.reduce((a,r)=>a+Number(r.participants_count||0),0);
  const acc=rows.map(r=>Number(r.accuracy_percent)).filter(Number.isFinite);
  $("analyticsAccuracy").textContent=acc.length?(acc.reduce((a,b)=>a+b,0)/acc.length).toFixed(1)+"%":"—";
  $("analyticsAnswers").textContent=rows.reduce((a,r)=>a+Number(r.answers_count||0),0);
  state.analyticsRows=rows;
  if(!state.selectedAnalyticsSession && rows[0]) state.selectedAnalyticsSession=rows[0].session_id;
  $("sessionHistory").innerHTML=rows.map(r=>`
    <button class="history-row history-button ${state.selectedAnalyticsSession===r.session_id?"selected":""}" data-analytics-session="${r.session_id}">
      <div><strong>${escapeHtml(r.session_title||r.quiz_title)}</strong><small>${escapeHtml(r.quiz_title)} · ${new Date(r.created_at).toLocaleString("ru-RU")}</small></div>
      <div><strong>${escapeHtml(r.topic)}</strong><small>Код ${escapeHtml(r.code)}</small></div>
      <div><strong>${r.participants_count}</strong><small>участников</small></div>
      <div><strong>${r.accuracy_percent??"—"}${r.accuracy_percent==null?"":"%"}</strong><small>${r.answers_count} ответов</small></div>
    </button>`).join("")||"<p class='message'>Проведённых занятий пока нет.</p>";
  document.querySelectorAll("[data-analytics-session]").forEach(b=>b.onclick=async()=>{
    state.selectedAnalyticsSession=b.dataset.analyticsSession;
    await loadAnalytics();
    await loadDetailedAnalytics();
  });
  await loadDetailedAnalytics();
}
$("refreshAnalytics").onclick=loadAnalytics;


function startSharedTimer(limitSec,startedAt,el,onEnd){
  if(state.timerHandle){clearInterval(state.timerHandle);state.timerHandle=null}
  if(!el){return}
  if(!startedAt){el.textContent=limitSec+" сек.";return}
  const tick=()=>{
    const elapsed=Math.floor((Date.now()-new Date(startedAt).getTime())/1000);
    const left=Math.max(0,limitSec-elapsed);
    el.textContent=left+" сек.";
    el.classList.toggle("timer-danger",left<=5);
    if(left<=0){clearInterval(state.timerHandle);state.timerHandle=null;onEnd?.()}
  };
  tick();state.timerHandle=setInterval(tick,250);
}

async function renderLiveTeacherQuestion(){
  if(!state.teacherSession)return;
  if(state.teacherSession.status==="lobby"){
    $("presenterCounter").textContent="Лобби";
    $("presenterPrompt").textContent="Ожидаем запуска.";
    $("presenterOptions").innerHTML="";$("optionDistribution").innerHTML="";$("presenterTimer").textContent="—";return;
  }
  if(state.teacherSession.status==="finished"){
    $("presenterCounter").textContent="Финиш";$("presenterPrompt").textContent="Квиз завершён."; $("presenterOptions").innerHTML="";$("optionDistribution").innerHTML="";$("presenterTimer").textContent="—";return;
  }
  const {data:q}=await sb.from("org_quiz_questions").select("*").eq("quiz_id",state.teacherSession.quiz_id).eq("order_index",state.teacherSession.current_question_index).maybeSingle();
  if(!q)return;
  const openMode=["duel","split","wordcloud","team_pitch"].includes(q.question_type);
  $("openVoting").classList.toggle("hidden",!["duel","split","team_pitch"].includes(q.question_type));
  $("showResults").classList.toggle("hidden",!openMode);
  $("presenterCounter").textContent="Вопрос "+q.order_index;
  $("presenterPrompt").textContent=q.prompt;
  await renderQuestionMedia(q,$("presenterMedia"));
  startSharedTimer(q.time_limit_sec,state.teacherSession.question_started_at,$("presenterTimer"));
  if(openMode){
    if(state.teacherSession.interaction_phase==="answer"){
      $("presenterOptions").innerHTML='<div class="presenter-option">Участники формулируют свои ответы…</div>';
      $("optionDistribution").innerHTML="";
    }else if(state.teacherSession.interaction_phase==="vote"){
      const {data:answers}=await sb.from("org_quiz_open_answers").select("id,answer_text").eq("session_id",state.teacherSession.id).eq("question_id",q.id);
      $("presenterOptions").innerHTML=(answers||[]).map(a=>`<div class="presenter-option">${escapeHtml(a.answer_text)}</div>`).join("")||'<div class="presenter-option">Ответов пока нет.</div>';
      $("optionDistribution").innerHTML="";
    }else{
      const {data:res}=await sb.rpc("org_quiz_open_public_results",{p_session_id:state.teacherSession.id,p_question_id:q.id});
      $("presenterOptions").innerHTML=(res||[]).map((a,i)=>`<div class="presenter-option"><strong>#${i+1}</strong> ${escapeHtml(a.answer_text)} <span style="opacity:.6">· ${a.votes} голосов</span></div>`).join("");
      $("optionDistribution").innerHTML="";
    }
  }else{
    $("presenterOptions").innerHTML=q.options.map((o,i)=>`<div class="presenter-option"><strong>${String.fromCharCode(65+i)}.</strong> ${escapeHtml(o)}</div>`).join("");
    const {data:stats}=await sb.from("org_quiz_question_stats").select("*").eq("session_id",state.teacherSession.id).eq("question_id",q.id).maybeSingle();
    const counts=[stats?.option_a||0,stats?.option_b||0,stats?.option_c||0,stats?.option_d||0].slice(0,q.options.length);
    const total=counts.reduce((a,b)=>a+Number(b),0);
    $("optionDistribution").innerHTML=counts.map((n,i)=>{
      const pct=total?Math.round(Number(n)*100/total):0;
      return `<div class="dist-row"><strong>${String.fromCharCode(65+i)}</strong><div class="dist-bar"><span style="width:${pct}%"></span></div><span>${n}</span></div>`;
    }).join("");
  }
}

async function loadLiveStudentRanking(){
  if(!state.teacherSession)return;
  const {data}=await sb.from("org_quiz_student_stats").select("*").eq("session_id",state.teacherSession.id).order("score",{ascending:false});
  $("studentRanking").innerHTML=(data||[]).map((r,i)=>`<div class="leader-row"><div class="rank">${i+1}</div><div><strong>${escapeHtml(r.full_name)}</strong><small>${escapeHtml(r.academic_group)} · ${r.accuracy_percent??0}%</small></div><div class="score">${r.score}</div></div>`).join("")||"<p class='message'>Ответов пока нет.</p>";
}

$("fullscreenQuestion").onclick=()=>{
  const el=$("teacherQuestionStage");
  if(document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.();
};

async function loadDetailedAnalytics(){
  const id=state.selectedAnalyticsSession;
  if(!id)return;
  const [{data:students},{data:questions}]=await Promise.all([
    sb.from("org_quiz_student_stats").select("*").eq("session_id",id).order("score",{ascending:false}),
    sb.from("org_quiz_question_stats").select("*").eq("session_id",id).order("order_index")
  ]);
  $("analyticsStudentRanking").innerHTML=(students||[]).map((r,i)=>`<div class="leader-row"><div class="rank">${i+1}</div><div><strong>${escapeHtml(r.full_name)}</strong><small>${escapeHtml(r.academic_group)} · ${r.correct_count}/${r.answers_count}</small></div><div class="score">${r.score}</div></div>`).join("")||"<p class='message'>Нет данных.</p>";
  $("analyticsQuestionStats").innerHTML=(questions||[]).map(r=>`<div class="qa-row"><div class="rank">${r.order_index}</div><div><strong>${escapeHtml(r.prompt)}</strong><div class="qa-meta">${r.answers_count} ответов · среднее время ${r.avg_response_ms?Math.round(r.avg_response_ms/1000)+" сек.":"—"}</div></div><div class="score">${r.accuracy_percent??0}%</div></div>`).join("")||"<p class='message'>Нет данных.</p>";
}

async function getExportRows(){
  const id=state.selectedAnalyticsSession;
  if(!id)return {students:[],questions:[],session:null};
  const session=state.analyticsRows.find(r=>r.session_id===id)||null;
  const [{data:students},{data:questions}]=await Promise.all([
    sb.from("org_quiz_student_stats").select("*").eq("session_id",id).order("score",{ascending:false}),
    sb.from("org_quiz_question_stats").select("*").eq("session_id",id).order("order_index")
  ]);
  return {students:students||[],questions:questions||[],session};
}

$("exportCsv").onclick=async()=>{
  const {students,session}=await getExportRows();
  if(!students.length)return;
  const header=["ФИО","Группа","Команда","Ответов","Верных","Точность, %","Баллы","Среднее время, мс"];
  const lines=[header,...students.map(r=>[r.full_name,r.academic_group,r.team_name||"",r.answers_count,r.correct_count,r.accuracy_percent??"",r.score,r.avg_response_ms??""])];
  const csv="\ufeff"+lines.map(row=>row.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(";")).join("\n");
  downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),safeFileName(session?.session_title||session?.quiz_title||"org-quiz")+".csv");
};

$("exportXlsx").onclick=async()=>{
  const {students,questions,session}=await getExportRows();
  if(!window.XLSX||(!students.length&&!questions.length))return;
  const wb=XLSX.utils.book_new();
  const s1=students.map(r=>({"ФИО":r.full_name,"Группа":r.academic_group,"Команда":r.team_name||"","Ответов":r.answers_count,"Верных":r.correct_count,"Точность, %":r.accuracy_percent??0,"Баллы":r.score,"Среднее время, мс":r.avg_response_ms??""}));
  const s2=questions.map(r=>({"№":r.order_index,"Вопрос":r.prompt,"Ответов":r.answers_count,"Верных":r.correct_count,"Точность, %":r.accuracy_percent??0,"Среднее время, мс":r.avg_response_ms??"","A":r.option_a,"B":r.option_b,"C":r.option_c,"D":r.option_d}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(s1),"Студенты");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(s2),"Вопросы");
  XLSX.writeFile(wb,safeFileName(session?.session_title||session?.quiz_title||"org-quiz")+".xlsx");
};

function safeFileName(s){return String(s).replace(/[\\/:*?"<>|]+/g,"_").trim()||"org-quiz"}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}


const typeHints={
  single:"Один правильный вариант. Быстрый классический раунд.",
  multiple:"Можно выбрать несколько вариантов и подтвердить ответ.",
  true_false:"Короткий бинарный раунд: верно или неверно.",
  short:"Студент вводит короткий текстовый ответ.",
  ordering:"Элементы нужно перетащить в правильную последовательность.",
  duel:"Свободный ответ → анонимное голосование аудитории за лучший.",
  split:"Открытый кейс → предложения участников → голосование за сильнейшее решение.",
  odd_one_out:"Выберите лишний элемент из набора и объясните логику.",
  scale:"Шкала позиции 1–10. Используется для фиксации мнений и обсуждения.",
  wordcloud:"Короткие ответы собираются в живое облако мнений.",
  ranking:"Перетащите элементы и выстройте их по приоритету.",
  team_pitch:"Команда формулирует позицию, затем аудитория оценивает предложения."
};
function questionTypeLabel(t){return ({single:"Один ответ",multiple:"Несколько ответов",true_false:"Верно / неверно",short:"Короткий ответ",ordering:"Порядок",matching:"Сопоставление",duel:"Баттл ответов",split:"Кейс + голосование",odd_one_out:"Кто лишний",scale:"Шкала позиции",wordcloud:"Облако мнений",ranking:"Ранжирование",team_pitch:"Защита позиции"})[t]||"Задание"}
function updateQuestionTypeHint(){
  if(!$("questionType"))return;
  const t=$("questionType").value;
  $("questionTypeHint").textContent=typeHints[t]||"Интерактивное задание.";
  const optionWrap=$("optionA").closest(".two-col");
  optionWrap.classList.toggle("hidden",["duel","split","scale","wordcloud","team_pitch"].includes(t));
  $("correctOptionLabel").classList.toggle("hidden",["duel","split","short","ordering","multiple","scale","wordcloud","ranking","team_pitch"].includes(t));
  $("correctMultiLabel").classList.toggle("hidden",t!=="multiple");
}
$("questionType").addEventListener("change",updateQuestionTypeHint);
updateQuestionTypeHint();

function lockQuestionUI(){
  document.querySelectorAll(".answer,.vote-card,[data-submit-question],.open-response button").forEach(b=>b.disabled=true);
}
async function renderQuestionInteraction(q){
  const host=$("answerOptions");
  host.className="answer-grid";
  const phase=state.session?.interaction_phase||"answer";

  if((q.question_type==="duel"||q.question_type==="split") && phase==="answer"){
    host.className="open-response";
    host.innerHTML=`<textarea id="openAnswerText" maxlength="800" placeholder="${q.question_type==="duel"?"Сформулируйте сильный, точный ответ…":"Предложите краткое решение кейса…"}"></textarea><button class="primary" data-submit-question>Отправить ответ</button>`;
    host.querySelector("[data-submit-question]").onclick=submitOpenAnswer;
    return;
  }
  if(["duel","split","team_pitch"].includes(q.question_type) && phase==="vote"){
    await renderVoteCandidates(q);return;
  }
  if(["duel","split","team_pitch"].includes(q.question_type) && phase==="result"){
    await renderOpenResults(q);return;
  }
  if(q.question_type==="wordcloud" && phase==="result"){
    const {data}=await sb.from("org_quiz_open_answers").select("answer_text").eq("session_id",state.session.id).eq("question_id",q.id);
    host.className="wordcloud-stage";
    const words=(data||[]).flatMap(r=>String(r.answer_text||"").split(/[;,]+/)).map(x=>x.trim()).filter(Boolean);
    const freq={}; words.forEach(w=>{const k=w.toLowerCase();freq[k]=(freq[k]||0)+1});
    host.innerHTML=Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([w,n],i)=>`<span class="cloud-word" style="font-size:${14+Math.min(18,n*3)}px;animation-delay:${i*35}ms">${escapeHtml(w)}${n>1?" ×"+n:""}</span>`).join("")||"<p class=\"message\">Ответов пока нет.</p>";
    return;
  }
  if(q.question_type==="scale"){
    host.className="scale-wrap";
    const min=Number(q.config?.min||1), max=Number(q.config?.max||10);
    host.innerHTML=`<div class="scale-labels"><span>${escapeHtml(q.config?.left||"1")}</span><span>${escapeHtml(q.config?.right||String(max))}</span></div><div class="scale-track">${Array.from({length:max-min+1},(_,i)=>`<button class="scale-point" data-scale="${min+i}">${min+i}</button>`).join("")}</div><button class="primary" data-submit-question disabled>Подтвердить позицию</button>`;
    let value=null;
    host.querySelectorAll("[data-scale]").forEach(b=>b.onclick=()=>{value=Number(b.dataset.scale);host.querySelectorAll("[data-scale]").forEach(x=>x.classList.toggle("active",x===b));host.querySelector("[data-submit-question]").disabled=false});
    host.querySelector("[data-submit-question]").onclick=()=>submitPayload([value]);
    return;
  }
  if(q.question_type==="ranking"){
    host.className="order-list";
    host.innerHTML=q.options.map((o,i)=>`<div class="order-item" draggable="true" data-order="${i}"><span class="order-handle">↕</span><span>${escapeHtml(o)}</span></div>`).join("")+'<button class="primary" data-submit-question>Подтвердить ранжирование</button>';
    enableOrdering();
    host.querySelector("[data-submit-question]").onclick=()=>submitPayload([...host.querySelectorAll(".order-item")].map(x=>Number(x.dataset.order)));
    return;
  }
  if(q.question_type==="odd_one_out"){
    host.innerHTML=q.options.map((o,i)=>`<button class="answer" data-i="${i}"><strong>${String.fromCharCode(65+i)}.</strong> ${escapeHtml(o)}</button>`).join("");
    host.querySelectorAll(".answer").forEach(b=>b.onclick=()=>submitPayload([Number(b.dataset.i)]));
    return;
  }
  if(q.question_type==="matching"){
    const right=Array.isArray(q.config?.right)?q.config.right:[];
    host.className="matching-grid";
    host.innerHTML=q.options.map((left,i)=>`<div class="match-row"><div class="match-left">${escapeHtml(left)}</div><select data-match="${i}"><option value="">Выберите пару</option>${right.map((r,j)=>`<option value="${j}">${escapeHtml(r)}</option>`).join("")}</select></div>`).join("")+'<button class="primary" data-submit-question>Проверить сопоставление</button>';
    host.querySelector("[data-submit-question]").onclick=()=>{const vals=[...host.querySelectorAll("[data-match]")].map(x=>Number(x.value));if(vals.some(Number.isNaN)){msg($("answerFeedback"),"Сопоставьте все элементы.");return}submitPayload(vals)};
    return;
  }
  if(q.question_type==="short"){
    host.className="open-response";
    host.innerHTML='<input id="shortAnswer" placeholder="Введите ответ"><button class="primary" data-submit-question>Ответить</button>';
    host.querySelector("[data-submit-question]").onclick=()=>submitPayload([$("shortAnswer").value.trim().toLowerCase()]);
    return;
  }
  if(q.question_type==="ordering"){
    host.className="order-list";
    host.innerHTML=q.options.map((o,i)=>`<div class="order-item" draggable="true" data-order="${i}"><span class="order-handle">↕</span><span>${escapeHtml(o)}</span></div>`).join("")+'<button class="primary" data-submit-question>Подтвердить порядок</button>';
    enableOrdering();
    host.querySelector("[data-submit-question]").onclick=()=>submitPayload([...host.querySelectorAll(".order-item")].map(x=>Number(x.dataset.order)));
    return;
  }
  if(q.question_type==="multiple"){
    host.innerHTML=q.options.map((o,i)=>`<button class="answer" type="button" data-i="${i}"><strong>${String.fromCharCode(65+i)}.</strong> ${escapeHtml(o)}</button>`).join("")+'<button class="primary" data-submit-question>Подтвердить выбор</button>';
    host.querySelectorAll(".answer").forEach(b=>b.onclick=()=>b.classList.toggle("selected"));
    host.querySelector("[data-submit-question]").onclick=()=>submitPayload([...host.querySelectorAll(".answer.selected")].map(x=>Number(x.dataset.i)).sort((a,b)=>a-b));
    return;
  }
  const opts=q.question_type==="true_false" && !q.options.length?["Верно","Неверно"]:q.options;
  host.innerHTML=opts.map((o,i)=>`<button class="answer" data-i="${i}"><strong>${String.fromCharCode(65+i)}.</strong> ${escapeHtml(o)}</button>`).join("");
  host.querySelectorAll(".answer").forEach(b=>b.onclick=()=>submitPayload([Number(b.dataset.i)]));
}
function enableOrdering(){
  let drag=null;
  document.querySelectorAll(".order-item").forEach(item=>{
    item.ondragstart=()=>{drag=item;item.classList.add("dragging")};
    item.ondragend=()=>{item.classList.remove("dragging");drag=null};
    item.ondragover=e=>{e.preventDefault();if(!drag||drag===item)return;const r=item.getBoundingClientRect();item.parentNode.insertBefore(drag,e.clientY<r.top+r.height/2?item:item.nextSibling)};
  });
}
async function submitOpenAnswer(){
  const text=$("openAnswerText").value.trim();
  if(!text)return;
  const {error}=await sb.rpc("org_quiz_submit_open",{p_session_id:state.session.id,p_question_id:state.question.id,p_answer_text:text});
  if(error){msg($("answerFeedback"),humanError(error.message));return}
  lockQuestionUI();msg($("answerFeedback"),"Ответ отправлен. Ждите голосование аудитории.");
}
async function renderVoteCandidates(q){
  const {data,error}=await sb.rpc("org_quiz_vote_candidates",{p_session_id:state.session.id,p_question_id:q.id});
  const host=$("answerOptions");host.className="vote-grid";
  if(error){host.innerHTML='<p class="message">'+escapeHtml(humanError(error.message))+"</p>";return}
  host.innerHTML=(data||[]).map(a=>`<button class="vote-card" data-vote="${a.answer_id}">${escapeHtml(a.answer_text)}</button>`).join("")||"<p class='message'>Пока нет ответов для голосования.</p>";
  host.querySelectorAll("[data-vote]").forEach(b=>b.onclick=async()=>{
    const {error}=await sb.rpc("org_quiz_vote_open",{p_session_id:state.session.id,p_question_id:q.id,p_answer_id:b.dataset.vote});
    if(error)msg($("answerFeedback"),humanError(error.message));else{lockQuestionUI();msg($("answerFeedback"),"Голос принят.");}
  });
}
async function renderOpenResults(q){
  const {data,error}=await sb.rpc("org_quiz_open_public_results",{p_session_id:state.session.id,p_question_id:q.id});
  const host=$("answerOptions");host.className="vote-grid";
  if(error){host.innerHTML='<p class="message">'+escapeHtml(humanError(error.message))+"</p>";return}
  const max=Math.max(1,...(data||[]).map(x=>Number(x.votes||0)));
  host.innerHTML=(data||[]).map((a,i)=>`<div class="vote-card"><strong>#${i+1}</strong><p>${escapeHtml(a.answer_text)}</p><div class="dist-bar"><span style="width:${Math.round(Number(a.votes||0)*100/max)}%"></span></div><small>${a.votes} голосов</small></div>`).join("");
}
$("openVoting").onclick=()=>setSession({interaction_phase:"vote",status:"live"});
$("showResults").onclick=()=>setSession({interaction_phase:"result",status:"paused"});

function showToast(text){
  const t=$("toast"); if(!t)return; t.textContent=text;t.classList.remove("hidden");clearTimeout(showToast._t);showToast._t=setTimeout(()=>t.classList.add("hidden"),1800);
}
function playSound(kind){
  if(!state.sound)return;
  try{
    const A=window.AudioContext||window.webkitAudioContext; const ctx=playSound.ctx||(playSound.ctx=new A());
    const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);
    const spec={tap:[440,.045],correct:[660,.14],wrong:[180,.22],transition:[320,.10],eliminate:[120,.45],vote:[520,.08]}[kind]||[360,.06];
    o.frequency.value=spec[0];o.type=kind==="wrong"||kind==="eliminate"?"sawtooth":"sine";
    g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.08,ctx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+spec[1]);
    o.start();o.stop(ctx.currentTime+spec[1]+.02);
  }catch{}
}

function renderLifeState(){
  if(!state.participant||!$("lifeBadge"))return;
  const eliminated=state.participant.life_state==="eliminated";
  $("lifeBadge").className="life-badge "+(eliminated?"eliminated":"alive");
  $("lifeBadge").textContent=eliminated?"✕ Вы выбили":"● В игре";
  $("lifeExplanation").textContent=eliminated
    ?"Вы можете продолжать отвечать, но ваши баллы больше не идут в общий счёт команды."
    :"Ваши баллы идут в общий счёт команды.";
}

async function renderQuestionMedia(q,host){
  if(!host)return;
  host.className="media-stage hidden";host.innerHTML="";
  const cfg=q.config||{};
  if(cfg.flag_url){host.className="media-stage flag-stage";host.innerHTML=`<img src="${escapeHtml(cfg.flag_url)}" alt="Флаг для задания">`;return}
  if(cfg.image_url){host.className="media-stage";host.innerHTML=`<img src="${escapeHtml(cfg.image_url)}" alt="Изображение для задания" style="object-fit:${escapeHtml(cfg.image_fit||"cover")}">`;return}
  if(cfg.audio_url){host.className="media-stage";host.innerHTML=`<div class="audio-card"><div class="note">♫</div><strong>Прослушайте фрагмент</strong><audio controls preload="metadata" src="${escapeHtml(cfg.audio_url)}"></audio></div>`;return}
  if(q.question_type==="region_map"){host.className="media-stage";await renderRussiaMap(q,host);return}
}
async function renderRussiaMap(q,host){
  if(!state.regionTopology){
    const res=await fetch("./data/regions.topojson"); state.regionTopology=await res.json();
  }
  const topo=state.regionTopology; const key=Object.keys(topo.objects)[0]; const fc=topojson.feature(topo,topo.objects[key]);
  host.innerHTML='<div class="russia-map-wrap"><svg viewBox="0 0 1000 520" aria-label="Интерактивная карта России"></svg><div class="map-note">Игровой слой включает 89 геометрий. Территории, чей международный статус оспаривается, визуально отмечены отдельно.</div></div>';
  const svg=d3.select(host.querySelector("svg"));
  const projection=d3.geoMercator().fitExtent([[15,15],[985,505]],fc);
  const path=d3.geoPath(projection);
  svg.selectAll("path").data(fc.features).join("path")
    .attr("d",path)
    .attr("class",d=>"map-region"+(d.properties?.new2022?" new2022":""))
    .attr("data-region",d=>d.properties?.id||d.id||"")
    .on("click",async function(e,d){
      if(this.classList.contains("correct")||this.classList.contains("wrong"))return;
      const id=d.properties?.id||d.id||"";
      const correct=id===q.config?.target_region;
      this.classList.add(correct?"correct":"wrong");
      await submitPayload([id]);
    });
}
function showEliminationOverlay(){
  const card=$("questionCard");if(!card||card.querySelector(".elimination-overlay"))return;
  const o=document.createElement("div");o.className="elimination-overlay";o.innerHTML='<div><strong>ВЫБЫВАНИЕ</strong><p>Вы продолжаете игру, но больше не приносите очки команде.</p></div>';card.appendChild(o);setTimeout(()=>o.remove(),2600);
}

$("viewAsParticipant").onclick=async()=>{
  if(!state.teacherSession){showToast("Сначала создайте комнату");return}
  state.viewAsParticipant=true;
  state.session=state.teacherSession;
  state.participant={id:"preview",team_id:null,life_state:"alive",contributes_to_team:false};
  const quiz=state.quizSets.find(q=>q.id===state.teacherSession.quiz_id);
  $("studentQuizTitle").textContent=quiz?.title||"Предпросмотр";
  $("playerAvatar").textContent="М";
  renderLifeState();
  await loadStudentTeams();
  await loadActiveQuestion();
  showView("student");
};
