const SUPABASE_URL = "https://bderfrcfuhnutuoyudje.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hv7NgYuVsfKhFuhX_9pl0Q_qXWA2wOr";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id)=>document.getElementById(id);
const views = {home:$("homeView"),student:$("studentView"),teacher:$("teacherView")};
const state = {session:null,participant:null,teams:[],participants:[],question:null,studentStartedAt:null,teacherSession:null,teacherUser:null,subs:[],quizSets:[],editorQuizId:null,timerHandle:null,analyticsRows:[],selectedAnalyticsSession:null,sound:true,viewAsParticipant:false,regionTopology:null,questionRows:[],bulkQuestionIds:new Set(),composerQuestionIds:[],editingQuestion:null};

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
  if(state.viewAsParticipant){lockQuestionUI();msg($("answerFeedback"),"Режим предпросмотра Модератора — ответы не отправляются.");}
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
  await loadOverview();
  await window.openStudioView("questions");
}
async function loadQuizSets(){
  const {data,error}=await sb.from("org_quiz_sets").select("id,title,topic,description,created_at,published").eq("published",true).order("created_at",{ascending:false});
  if(error){showToast(error.message);return}
  state.quizSets=data||[];
  const opts=state.quizSets.map(q=>`<option value="${q.id}">${escapeHtml(q.title)} — ${escapeHtml(q.topic)}</option>`).join("");
  $("quizSelect").innerHTML=opts;$("editorQuizSelect").innerHTML=opts;
  $("questionSetFilter").innerHTML='<option value="">Все наборы</option>'+opts;
  $("bulkTargetSet").innerHTML='<option value="">Переместить в набор…</option>'+opts;
  if($("sidebarSetCount"))$("sidebarSetCount").textContent=state.quizSets.length+" наборов";
  if($("overviewSets"))$("overviewSets").textContent=state.quizSets.length;
  if(!state.editorQuizId&&state.quizSets[0])state.editorQuizId=state.quizSets[0].id;
  if(state.editorQuizId)$("editorQuizSelect").value=state.editorQuizId;
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
    const p=state.participants.find(x=>x.id===card.dataset.person);
    if(p?.life_state==="eliminated")card.classList.add("eliminated");
    const small=card.querySelector("small");
    if(small)small.textContent=(small.textContent||"")+" · "+(p?.life_state==="eliminated"?"выбыл":"в игре");
    const actions=document.createElement("div");actions.className="life-actions";
    const out=document.createElement("button");out.className="danger";out.textContent="Выбить";
    const back=document.createElement("button");back.className="secondary";back.textContent="Вернуть";
    out.onclick=async e=>{e.stopPropagation();const {error}=await sb.rpc("org_party_set_life_state",{p_participant_id:p.id,p_state:"eliminated",p_reason:"Решение Модератора"});if(error)msg($("teacherActionMessage"),error.message);else{playSound("eliminate");await refreshTeacher()}};
    back.onclick=async e=>{e.stopPropagation();const {error}=await sb.rpc("org_party_set_life_state",{p_participant_id:p.id,p_state:"alive",p_reason:null});if(error)msg($("teacherActionMessage"),error.message);else{playSound("correct");await refreshTeacher()}};
    actions.append(out,back);card.append(actions);
  });
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
  if(bindTeacherTabs.bound)return;bindTeacherTabs.bound=true;
  const titles={
    questions:["Контент","Игровые банки"],
    live:["Сессия","Запустить игру"],
    analytics:["Результаты","Результаты"]
  };
  const ids={questions:"studioQuestions",live:"studioLive",analytics:"studioAnalytics"};
  const open=async view=>{
    if(!titles[view])view="questions";
    document.querySelectorAll(".flow-step").forEach(b=>b.classList.toggle("active",b.dataset.studioView===view));
    Object.entries(ids).forEach(([k,id])=>$(id)?.classList.toggle("hidden",k!==view));
    ["studioOverview","studioSets","studioScenarios","studioMedia","studioPlayers"].forEach(id=>$(id)?.classList.add("hidden"));
    if($("studioBreadcrumb"))$("studioBreadcrumb").textContent=titles[view][0];
    if($("studioPageTitle"))$("studioPageTitle").textContent=titles[view][1];
    if(view==="questions"){await loadQuestionBank();await loadOverview();}
    if(view==="analytics")await loadAnalytics();
  };
  window.openStudioView=open;
  document.querySelectorAll("[data-studio-view]").forEach(b=>b.onclick=()=>open(b.dataset.studioView));
  document.querySelectorAll("[data-open-view]").forEach(b=>b.onclick=()=>open(b.dataset.openView));
  if($("openQuestionEditor"))$("openQuestionEditor").onclick=()=>openQuestionDrawer();
  if($("openSetComposer"))$("openSetComposer").onclick=()=>openSetComposer();
  document.querySelectorAll("[data-close-drawer='question']").forEach(b=>b.onclick=()=>closeDrawer("question"));
  document.querySelectorAll("[data-close-drawer='set']").forEach(b=>b.onclick=()=>closeDrawer("set"));
  document.querySelectorAll("[data-close-drawer='preview']").forEach(b=>b.onclick=()=>closeDrawer("preview"));
  document.querySelectorAll("[data-close-drawer='composer']").forEach(b=>b.onclick=()=>closeDrawer("composer"));
  document.querySelectorAll("[data-close-drawer='setorder']").forEach(b=>b.onclick=()=>closeDrawer("setorder"));
}
function openQuestionDrawer(){
  state.editingQuestion=null;
  $("editingQuestionId").value="";
  $("questionEditorTitle").textContent="Новый вопрос";
  $("createQuestionForm").reset();
  if(state.editorQuizId)$("editorQuizSelect").value=state.editorQuizId;
  $("questionTime").value=30;$("questionDifficulty").value=2;$("questionType").value="single";
  $("questionEditorDrawer").classList.remove("hidden");$("questionEditorDrawer").setAttribute("aria-hidden","false");updateQuestionTypeHint();
}
function openSetDrawer(){$("setEditorDrawer").classList.remove("hidden");$("setEditorDrawer").setAttribute("aria-hidden","false")}
function openSetComposer(){
  state.composerQuestionIds=[];
  $("setComposerForm").reset();
  $("setComposerDrawer").classList.remove("hidden");$("setComposerDrawer").setAttribute("aria-hidden","false");
  renderComposer();
}
function closeDrawer(type){
  const el=type==="question"?$("questionEditorDrawer"):type==="set"?$("setEditorDrawer"):type==="composer"?$("setComposerDrawer"):type==="setorder"?$("setOrderDrawer"):$("questionPreviewDrawer");
  el.classList.add("hidden");el.setAttribute("aria-hidden","true");
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
  closeDrawer("set");
  await window.openStudioView("sets");
  showToast("Набор создан.");
});

$("createQuestionForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const type=$("questionType").value;
  const options=[$("optionA").value,$("optionB").value,$("optionC").value,$("optionD").value].map(x=>x.trim()).filter(Boolean);
  let correctPayload=[];
  if(["single","true_false","flag","anthem","person_photo","place_photo","elimination"].includes(type)) correctPayload=[Number($("correctOption").value)];
  else if(type==="region_map") correctPayload=[$("targetRegion").value.trim()];
  else if(type==="vote") correctPayload=[];
  else if(type==="multiple"){
    const map={A:0,B:1,C:2,D:3};
    correctPayload=String($("correctMulti").value||"").toUpperCase().split(/[,\s]+/).filter(Boolean).map(x=>map[x]).filter(Number.isInteger).sort((a,b)=>a-b);
    if(!correctPayload.length){msg($("editorMessage"),"Укажите правильные варианты, например A, B.");return}
  }else if(type==="ordering"||type==="ranking"||type==="matching") correctPayload=options.map((_,i)=>i);
  else if(type==="odd_one_out") correctPayload=[Number($("correctOption").value)];
  else if(type==="short") correctPayload=[$("optionA").value.trim()];

  let config=(type==="duel"||type==="split")?{mode:"audience_vote",anonymous:true}:type==="scale"?{min:1,max:10,left:"Совсем не согласен",right:"Полностью согласен"}:type==="wordcloud"?{max_words:3}:type==="team_pitch"?{mode:"team_pitch",anonymous:false}:{};
  let media=$("mediaUrl").value.trim();
  let mediaPath=state.editingQuestion?.media_storage_path||null;
  const file=$("mediaUpload").files?.[0];
  if(file){
    try{
      const uploaded=await uploadQuestionMedia(file);
      media=uploaded.url;mediaPath=uploaded.path;
    }catch(err){msg($("editorMessage"),"Загрузка файла: "+err.message);return}
  }
  if(type==="flag"&&media)config={...config,flag_url:media,media_kind:"flag"};
  if(["person_photo","place_photo"].includes(type)&&media)config={...config,image_url:media,media_kind:type};
  if(type==="anthem"&&media)config={...config,audio_url:media,media_kind:"audio"};
  if(type==="region_map")config={...config,target_region:$("targetRegion").value.trim(),map_dataset:"data/regions.topojson",show_disputed_note:true};
  if(type==="vote")config={...config,poll:true,show_live_results:true};
  if(type==="elimination"||$("eliminateOnWrong").checked)config={...config,eliminate_on_wrong:true,elimination_label:"Выбывание в раунде"};

  const tags=String($("questionTags").value||"").split(",").map(x=>x.trim()).filter(Boolean);
  const difficulty=Number($("questionDifficulty").value||2);
  const points=Number($("questionPoints").value||100);
  const time=Number($("questionTime").value||30);
  const editingId=$("editingQuestionId").value;

  if(editingId){
    const {error}=await sb.rpc("org_quiz_update_question_v3",{
      p_question_id:editingId,p_quiz_id:$("editorQuizSelect").value,p_question_type:type,p_prompt:$("newQuestionPrompt").value,
      p_options:options,p_correct_payload:correctPayload,p_config:config,p_explanation:$("newQuestionExplanation").value||null,
      p_points:points,p_time_limit_sec:time,p_tags:tags,p_difficulty:difficulty,p_media_storage_path:mediaPath
    });
    if(error){msg($("editorMessage"),error.message);return}
  }else{
    const {data:newId,error}=await sb.rpc("org_quiz_create_question_v2",{
      p_quiz_id:$("editorQuizSelect").value,p_question_type:type,p_prompt:$("newQuestionPrompt").value,
      p_options:options,p_correct_payload:correctPayload,p_config:config,p_explanation:$("newQuestionExplanation").value||null,
      p_points:points,p_time_limit_sec:time
    });
    if(error){msg($("editorMessage"),error.message);return}
    const {error:updateError}=await sb.rpc("org_quiz_update_question_v3",{
      p_question_id:newId,p_quiz_id:$("editorQuizSelect").value,p_question_type:type,p_prompt:$("newQuestionPrompt").value,
      p_options:options,p_correct_payload:correctPayload,p_config:config,p_explanation:$("newQuestionExplanation").value||null,
      p_points:points,p_time_limit_sec:time,p_tags:tags,p_difficulty:difficulty,p_media_storage_path:mediaPath
    });
    if(updateError){msg($("editorMessage"),updateError.message);return}
  }

  const quiz=$("editorQuizSelect").value;
  state.editingQuestion=null;e.target.reset();$("editingQuestionId").value="";$("editorQuizSelect").value=quiz;
  $("questionTime").value=30;$("questionPoints").value=100;$("questionDifficulty").value=2;$("questionType").value="single";updateQuestionTypeHint();
  await loadQuestionBank();await loadQuizSetLibrary();await loadMediaLibrary();closeDrawer("question");
  await window.openStudioView("questions");showToast(editingId?"Вопрос обновлён.":"Вопрос сохранён в банк.");
});

async function loadQuestionBank(){
  let {data,error}=await sb.from("org_quiz_questions")
    .select("id,quiz_id,order_index,question_type,prompt,options,config,explanation,time_limit_sec,points,tags,difficulty,media_storage_path,updated_at")
    .order("updated_at",{ascending:false});
  if(error){
    ({data,error}=await sb.from("org_quiz_questions")
      .select("id,quiz_id,order_index,question_type,prompt,options,config,explanation,time_limit_sec,points,tags,difficulty,media_storage_path")
      .order("quiz_id",{ascending:true})
      .order("order_index",{ascending:true}));
  }
  if(error){
    $("questionBank").innerHTML=`<div class="empty-state"><strong>Не удалось загрузить вопросы</strong><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }
  const visibleSetIds=new Set((state.quizSets||[]).map(s=>s.id));
  state.questionRows=(data||[]).filter(q=>visibleSetIds.has(q.quiz_id));
  $("sidebarQuestionCount").textContent=state.questionRows.length+" в банке";
  $("overviewQuestions").textContent=state.questionRows.length;
  renderQuestionLibrary();
}
function renderQuestionLibrary(){
  const search=($("questionSearch")?.value||"").trim().toLowerCase();
  const setId=$("questionSetFilter")?.value||"";
  const type=$("questionTypeFilter")?.value||"";
  const difficulty=$("questionDifficultyFilter")?.value||"";
  const rows=(state.questionRows||[]).filter(q=>
    (!setId||q.quiz_id===setId)&&(!type||q.question_type===type)&&(!difficulty||String(q.difficulty||2)===difficulty)&&
    (!search||q.prompt.toLowerCase().includes(search)||(q.tags||[]).some(t=>String(t).toLowerCase().includes(search)))
  );
  $("questionBankCount").textContent=`${rows.length} вопросов`;

  const icon={single:"✓",multiple:"☷",flag:"⚑",anthem:"♫",person_photo:"◎",place_photo:"⌖",region_map:"◫",vote:"◉",elimination:"!",matching:"⇄",ordering:"↕",duel:"✦",split:"◇",scale:"—",wordcloud:"☁",ranking:"≡",team_pitch:"◆"};
  const visual=q=>{
    const cfg=q.config||{};
    if(cfg.flag_url)return `<div class="question-visual flag-card"><img src="${escapeHtml(cfg.flag_url)}" alt=""></div>`;
    if(cfg.image_url)return `<div class="question-visual photo-card"><img src="${escapeHtml(cfg.image_url)}" alt=""></div>`;
    if(cfg.audio_url)return `<div class="question-visual audio-card-large"><span>♫</span><div><strong>Аудиораунд</strong><small>Гимн · нажмите «Открыть», чтобы прослушать</small></div></div>`;
    if(q.question_type==="region_map")return `<div class="question-visual map-card-large"><span>◎</span><div><strong>Интерактивная карта</strong><small>Выбор региона · zoom · pan</small></div></div>`;
    const tone={elimination:"danger",duel:"violet",vote:"yellow",single:"blue",multiple:"blue"}[q.question_type]||"mint";
    return `<div class="question-visual abstract-card ${tone}"><span>${icon[q.question_type]||"?"}</span><strong>${questionTypeLabel(q.question_type)}</strong></div>`;
  };

  $("questionBank").innerHTML=rows.map(q=>{
    const set=state.quizSets.find(s=>s.id===q.quiz_id);
    const checked=state.bulkQuestionIds.has(q.id)?"checked":"";
    const tags=(q.tags||[]).slice(0,3).map(t=>`<span class="mini-tag">${escapeHtml(t)}</span>`).join("");
    return `<article class="question-tile ${checked?"selected-row":""}">
      <div class="question-tile-check"><label><input type="checkbox" data-select-question="${q.id}" ${checked}><span></span></label></div>
      ${visual(q)}
      <div class="question-tile-body">
        <div class="question-tile-top"><span class="question-kind">${questionTypeLabel(q.question_type)}</span><span class="difficulty-chip">Сложность ${q.difficulty||2}</span></div>
        <h3>${escapeHtml(q.prompt)}</h3>
        <p>${escapeHtml(set?.title||"Без набора")}</p>
        <div class="tag-line">${tags}</div>
        <div class="question-tile-footer">
          <div class="question-stats"><span>${q.time_limit_sec} сек.</span><span>${q.points} баллов</span>${q.config?.source_url?'<span class="source-chip">Источник ✓</span>':""}</div>
          <div class="question-actions">
            <button class="question-action primary-mini" data-preview-question="${q.id}">Открыть</button>
            <button class="question-action" data-edit-question="${q.id}">Изменить</button>
            <button class="question-action danger" data-delete-question="${q.id}" aria-label="Удалить">×</button>
          </div>
        </div>
      </div>
    </article>`;
  }).join("")||'<div class="empty-state"><strong>Вопросы не найдены</strong><p>Измените фильтры или создайте новый вопрос.</p></div>';

  document.querySelectorAll("[data-select-question]").forEach(x=>x.onchange=()=>{
    x.checked?state.bulkQuestionIds.add(x.dataset.selectQuestion):state.bulkQuestionIds.delete(x.dataset.selectQuestion);
    updateBulkBar();renderQuestionLibrary();
  });
  document.querySelectorAll("[data-preview-question]").forEach(b=>b.onclick=()=>previewLibraryQuestion(b.dataset.previewQuestion));
  document.querySelectorAll("[data-edit-question]").forEach(b=>b.onclick=()=>editQuestion(b.dataset.editQuestion));
  document.querySelectorAll("[data-delete-question]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Удалить этот вопрос?"))return;
    const {error}=await sb.rpc("org_quiz_delete_question",{p_question_id:b.dataset.deleteQuestion});
    if(error)showToast(error.message);
    else{state.bulkQuestionIds.delete(b.dataset.deleteQuestion);await loadQuestionBank();await loadQuizSetLibrary();}
  });
  updateBulkBar();
}
function updateBulkBar(){
  const n=state.bulkQuestionIds.size;
  $("bulkQuestionBar").classList.toggle("hidden",n===0);$("bulkSelectedCount").textContent=n;
}

async function previewLibraryQuestion(id){
  const q=(state.questionRows||[]).find(x=>x.id===id);if(!q)return;
  $("questionPreviewDrawer").classList.remove("hidden");$("questionPreviewDrawer").setAttribute("aria-hidden","false");
  $("previewType").textContent=questionTypeLabel(q.question_type);
  $("previewTitle").textContent=q.prompt;
  const set=state.quizSets.find(s=>s.id===q.quiz_id);
  $("previewMeta").innerHTML=`<span>${escapeHtml(set?.title||"Без набора")}</span><span>${q.time_limit_sec} сек.</span><span>${q.points} баллов</span>`;
  const host=$("previewMedia");host.className="preview-media hidden";host.innerHTML="";
  const cfg=q.config||{};
  if(cfg.flag_url){host.className="preview-media flag-preview";host.innerHTML=`<img src="${escapeHtml(cfg.flag_url)}" alt="">`;}
  else if(cfg.image_url){host.className="preview-media";host.innerHTML=`<img src="${escapeHtml(cfg.image_url)}" alt="">`;}
  else if(cfg.audio_url){host.className="preview-media audio-preview";host.innerHTML=`<div class="audio-preview-inner"><span>♫</span><audio controls preload="metadata" src="${escapeHtml(cfg.audio_url)}"></audio></div>`;}
  else if(q.question_type==="region_map"){host.className="preview-media";host.dataset.preview="1";await renderRussiaMap(q,host);}
  $("previewOptions").innerHTML=(q.options||[]).length
    ? q.options.map((o,i)=>`<div class="preview-option"><span>${String.fromCharCode(65+i)}</span><strong>${escapeHtml(o)}</strong></div>`).join("")
    : '<div class="preview-option muted"><strong>Ответ вводится интерактивно</strong></div>';
  $("previewExplanation").innerHTML=(q.explanation||q.config?.source_url)
    ? `<span class="section-kicker">Пояснение</span>${q.explanation?`<p>${escapeHtml(q.explanation)}</p>`:""}${q.config?.source_url?`<a class="source-link" href="${escapeHtml(q.config.source_url)}" target="_blank" rel="noopener">Открыть источник ↗</a>`:""}`
    : "";
}
async function loadQuizSetLibrary(){
  if(!$("quizSetLibrary"))return;
  const rows=state.questionRows||[];
  $("quizSetLibrary").innerHTML=state.quizSets.map(s=>{
    const setRows=rows.filter(q=>q.quiz_id===s.id);
    const count=setRows.length;
    const types=[...new Set(setRows.map(q=>questionTypeLabel(q.question_type)))].slice(0,3);
    return `<article class="set-card">
      <div class="set-card-top"><span class="section-kicker">${escapeHtml(s.topic)}</span><span class="info-badge">${count} вопросов</span></div>
      <h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.description||"Описание не добавлено.")}</p>
      <div class="set-type-line">${types.map(t=>`<span>${escapeHtml(t)}</span>`).join("")}</div>
      <div class="set-card-footer"><span>${new Date(s.created_at).toLocaleDateString("ru-RU")}</span><div class="row-actions">
        <button class="text-button" data-set-order="${s.id}">Порядок</button>
        <button class="text-button" data-set-open="${s.id}">Вопросы →</button>
      </div></div>
    </article>`;
  }).join("")||'<div class="empty-state"><strong>Нет наборов</strong><p>Создайте первый набор игры.</p></div>';
  document.querySelectorAll("[data-set-open]").forEach(b=>b.onclick=()=>{ $("questionSetFilter").value=b.dataset.setOpen;window.openStudioView("questions");renderQuestionLibrary();});
  document.querySelectorAll("[data-set-order]").forEach(b=>b.onclick=()=>openSetOrder(b.dataset.setOrder));
  $("overviewQuizSets").innerHTML=state.quizSets.slice(0,5).map(s=>`<div class="compact-row"><div><strong>${escapeHtml(s.title)}</strong><small>${escapeHtml(s.topic)}</small></div><span class="info-badge">${rows.filter(q=>q.quiz_id===s.id).length}</span></div>`).join("");
}
async function loadMediaLibrary(){
  if(!$("mediaLibrary"))return;
  const rows=(state.questionRows||[]).filter(q=>q.config&&(q.config.image_url||q.config.flag_url||q.config.audio_url));
  $("mediaLibrary").innerHTML=rows.map(q=>{
    const cfg=q.config||{};const url=cfg.image_url||cfg.flag_url||cfg.audio_url;
    const visual=cfg.audio_url
      ? `<div class="media-thumb audio-thumb"><span>♫</span><audio controls preload="none" src="${escapeHtml(url)}"></audio></div>`
      : `<div class="media-thumb"><img src="${escapeHtml(url)}" alt=""></div>`;
    return `<article class="media-item">${visual}<div class="media-info"><strong>${escapeHtml(q.prompt.slice(0,65))}</strong><small>${questionTypeLabel(q.question_type)}</small><button class="text-button" data-media-preview="${q.id}">Открыть вопрос →</button></div></article>`;
  }).join("")||'<div class="empty-state"><strong>Медиатека пуста</strong><p>Медиа появятся после создания фото-, флаг- или аудиовопросов.</p></div>';
  document.querySelectorAll("[data-media-preview]").forEach(b=>b.onclick=()=>previewLibraryQuestion(b.dataset.mediaPreview));
}
function loadPlayersDirectory(){
  if(!$("playersDirectory"))return;
  $("playersDirectory").innerHTML=(state.participants||[]).map(p=>`<div class="player-directory-row"><div><strong>${escapeHtml(p.full_name)}</strong><small>${escapeHtml(p.academic_group)}</small></div><span>${escapeHtml(state.teams.find(t=>t.id===p.team_id)?.name||"Без команды")}</span><span>${p.life_state==="eliminated"?"Выбыл":"В игре"}</span></div>`).join("")||'<div class="empty-state"><strong>Нет участников</strong><p>Игроки появятся после подключения к комнате.</p></div>';
}
async function loadOverview(){
  await loadQuizSetLibrary();
  if(state.teacherSession){
    $("overviewLiveState").innerHTML=`<strong>Комната ${escapeHtml(state.teacherSession.code)}</strong><p>${escapeHtml(state.teacherSession.title||"Активная сессия")} · ${statusLabel(state.teacherSession.status)}</p>`;
  }
  const order=["Флаги мира — 196 SVG","Россия на карте — 89 регионов","Гимны мира — аудиораунд","Лица науки и культуры","Места мира","Тёмная комната — выбывание"];
  const icons={"Флаги мира — 196 SVG":"⚑","Россия на карте — 89 регионов":"◎","Гимны мира — аудиораунд":"♫","Лица науки и культуры":"◉","Места мира":"⌖","Тёмная комната — выбывание":"!"};
  const notes={"Флаги мира — 196 SVG":"193 члена ООН + 2 наблюдателя + 1 бонус","Россия на карте — 89 регионов":"Интерактивная карта · zoom · pan","Гимны мира — аудиораунд":"Аудиораунды с гимнами","Лица науки и культуры":"Угадывание по фотографии","Места мира":"Угадывание места по фото","Тёмная комната — выбывание":"Ошибка может выбить игрока"};
  const packs=order.map(t=>state.quizSets.find(s=>s.title===t)).filter(Boolean);
  const host=$("overviewGamePacks");
  if(host){
    host.innerHTML=packs.map((s,i)=>{
      const count=(state.questionRows||[]).filter(q=>q.quiz_id===s.id).length;
      return `<article class="game-pack-card game-pack-${i+1}">
        <div class="game-pack-visual"><span>${icons[s.title]||"◆"}</span></div>
        <div class="game-pack-copy">
          <span>${escapeHtml(s.topic)}</span>
          <h4>${escapeHtml(s.title)}</h4>
          <p>${escapeHtml(notes[s.title]||s.description||"")}</p>
        </div>
        <div class="game-pack-footer">
          <div><strong>${count}</strong><span>заданий</span></div>
          <button class="game-pack-open" data-game-pack="${s.id}">Открыть →</button>
        </div>
      </article>`;
    }).join("");
    host.querySelectorAll("[data-game-pack]").forEach(b=>b.onclick=async()=>{
      await window.openStudioView("questions");
      $("questionSetFilter").value=b.dataset.gamePack;
      renderQuestionLibrary();
      window.scrollTo({top:0,behavior:"smooth"});
    });
  }
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
  team_pitch:"Команда формулирует позицию, затем аудитория оценивает предложения.",
  flag:"Покажите флаг и предложите варианты стран.",
  anthem:"Аудио-фрагмент гимна: участники угадывают страну.",
  person_photo:"Угадайте известного человека по фотографии.",
  place_photo:"Определите место или страну по фотографии.",
  region_map:"Игрок кликает по нужному субъекту на интерактивной карте России.",
  vote:"Голосование аудитории без правильного ответа.",
  elimination:"Раунд высокого риска: неверный ответ может выбить игрока из командного зачёта."
};
function questionTypeLabel(t){return ({single:"Один ответ",multiple:"Несколько ответов",true_false:"Верно / неверно",short:"Короткий ответ",ordering:"Порядок",matching:"Сопоставление",duel:"Баттл ответов",split:"Кейс + голосование",odd_one_out:"Кто лишний",scale:"Шкала позиции",wordcloud:"Облако мнений",ranking:"Ранжирование",team_pitch:"Защита позиции",flag:"Флаг",anthem:"Гимн",person_photo:"Кто это?",place_photo:"Где это?",region_map:"Регион на карте",vote:"Голосование",elimination:"На выбывание"})[t]||"Задание"}
function updateQuestionTypeHint(){
  if(!$("questionType"))return;
  const t=$("questionType").value;
  $("questionTypeHint").textContent=typeHints[t]||"Интерактивное задание.";
  const optionWrap=$("optionA").closest(".form-grid");
  optionWrap.classList.toggle("hidden",["duel","split","scale","wordcloud","team_pitch","region_map"].includes(t));
  $("mediaConfig").classList.toggle("hidden",!["flag","anthem","person_photo","place_photo","region_map"].includes(t));
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
    if(error)msg($("answerFeedback"),humanError(error.message));else{playSound("vote");lockQuestionUI();msg($("answerFeedback"),"Голос принят.");}
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
    const res=await fetch("./data/regions.topojson");
    state.regionTopology=await res.json();
  }
  const topo=state.regionTopology;
  const obj=topo.objects.ru89||topo.objects[Object.keys(topo.objects)[0]];
  const fc=topojson.feature(topo,obj);
  const outline=topojson.merge(topo,obj.geometries);
  const isPreview=host.dataset.preview==="1";

  host.innerHTML=`
    <div class="russia-map-wrap">
      <div class="map-toolbar">
        <div class="map-help"><strong>Найдите регион на карте</strong><span>Колесо мыши — масштаб · перетаскивание — перемещение · клик — выбрать/снять</span></div>
        <div class="map-controls">
          <button type="button" data-map-zoom-out aria-label="Отдалить">−</button>
          <button type="button" data-map-reset aria-label="Сбросить масштаб">⌂</button>
          <button type="button" data-map-zoom-in aria-label="Приблизить">+</button>
        </div>
      </div>
      <div class="map-canvas"><svg aria-label="Интерактивная карта России"><g class="map-viewport"><g class="map-regions"></g><g class="map-outline"></g></g></svg></div>
      <div class="map-answerbar">
        <div><span>Ваш выбор</span><strong data-map-selected>Регион не выбран</strong></div>
        <button type="button" class="button-primary" data-map-confirm disabled>${isPreview?"Режим просмотра":"Подтвердить ответ"}</button>
      </div>
      <div class="map-note">Спорные в международно-правовом отношении территории отмечены отдельной штриховкой.</div>
    </div>`;

  const canvas=host.querySelector(".map-canvas");
  const svg=d3.select(host.querySelector("svg"));
  const viewport=svg.select(".map-viewport");
  const regionLayer=svg.select(".map-regions");
  const outlineLayer=svg.select(".map-outline");

  const width=Math.max(720,canvas.clientWidth||1000);
  const height=Math.max(420,canvas.clientHeight||560);
  svg.attr("viewBox",`0 0 ${width} ${height}`).attr("width",width).attr("height",height);

  const projection=d3.geoConicEqualArea().parallels([50,70]).rotate([-100,0]);
  const pad=Math.max(18,Math.min(width,height)*.035);
  projection.fitExtent([[pad,pad],[width-pad,height-pad]],fc);
  const path=d3.geoPath(projection);

  let selectedId=null;
  const idOf=d=>d.properties?.id||d.id||"";
  const nameOf=d=>d.properties?.name_full||d.properties?.name||idOf(d)||"Регион";

  outlineLayer.append("path")
    .datum(outline)
    .attr("class","map-country-outline")
    .attr("d",path);

  const regions=regionLayer.selectAll("path").data(fc.features,d=>idOf(d)).join("path")
    .attr("d",path)
    .attr("class",d=>"map-region"+(d.properties?.new2022?" new2022":""))
    .attr("data-region",d=>idOf(d))
    .attr("tabindex",0)
    .attr("aria-label",d=>nameOf(d))
    .on("click",function(e,d){
      e.stopPropagation();
      const id=idOf(d);
      selectedId=selectedId===id?null:id;
      regions.classed("selected",x=>idOf(x)===selectedId);
      const picked=fc.features.find(x=>idOf(x)===selectedId);
      host.querySelector("[data-map-selected]").textContent=picked?nameOf(picked):"Регион не выбран";
      host.querySelector("[data-map-confirm]").disabled=!selectedId||isPreview;
      playSound("tap");
    });

  const zoom=d3.zoom()
    .scaleExtent([1,14])
    .on("zoom",e=>viewport.attr("transform",e.transform));
  svg.call(zoom).on("dblclick.zoom",null);

  host.querySelector("[data-map-zoom-in]").onclick=()=>svg.transition().duration(180).call(zoom.scaleBy,1.6);
  host.querySelector("[data-map-zoom-out]").onclick=()=>svg.transition().duration(180).call(zoom.scaleBy,1/1.6);
  host.querySelector("[data-map-reset]").onclick=()=>svg.transition().duration(220).call(zoom.transform,d3.zoomIdentity);
  host.querySelector("[data-map-confirm]").onclick=async()=>{
    if(!selectedId||isPreview)return;
    const btn=host.querySelector("[data-map-confirm]");
    btn.disabled=true;btn.textContent="Ответ отправлен";
    regions.style("pointer-events","none");
    await submitPayload([selectedId]);
  };
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

$("questionSearch")?.addEventListener("input",renderQuestionLibrary);
$("questionSetFilter")?.addEventListener("change",renderQuestionLibrary);
$("questionTypeFilter")?.addEventListener("change",renderQuestionLibrary);

$("questionDifficultyFilter")?.addEventListener("change",renderQuestionLibrary);
$("bulkClear")?.addEventListener("click",()=>{state.bulkQuestionIds.clear();renderQuestionLibrary()});
$("bulkAddTag")?.addEventListener("click",async()=>{
  const tag=$("bulkTag").value.trim();if(!tag||!state.bulkQuestionIds.size)return;
  const {error}=await sb.rpc("org_quiz_bulk_action",{p_question_ids:[...state.bulkQuestionIds],p_action:"tag",p_target_set:null,p_tag:tag});
  if(error)return showToast(error.message);$("bulkTag").value="";await loadQuestionBank();showToast("Тег добавлен.");
});
$("bulkMove")?.addEventListener("click",async()=>{
  const target=$("bulkTargetSet").value;if(!target||!state.bulkQuestionIds.size)return showToast("Выберите набор.");
  const {error}=await sb.rpc("org_quiz_bulk_action",{p_question_ids:[...state.bulkQuestionIds],p_action:"move",p_target_set:target,p_tag:null});
  if(error)return showToast(error.message);state.bulkQuestionIds.clear();await loadQuestionBank();await loadQuizSetLibrary();showToast("Вопросы перемещены.");
});
$("bulkDelete")?.addEventListener("click",async()=>{
  if(!state.bulkQuestionIds.size||!confirm("Удалить выбранные вопросы?"))return;
  const {error}=await sb.rpc("org_quiz_bulk_action",{p_question_ids:[...state.bulkQuestionIds],p_action:"delete",p_target_set:null,p_tag:null});
  if(error)return showToast(error.message);state.bulkQuestionIds.clear();await loadQuestionBank();await loadQuizSetLibrary();showToast("Выбранные вопросы удалены.");
});


async function uploadQuestionMedia(file){
  if(!state.teacherUser)throw new Error("Нужен вход Модератора.");
  const ext=(file.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"");
  const base=file.name.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9а-яА-Я_-]+/g,"-").slice(0,60)||"media";
  const path=`${state.teacherUser.id}/${Date.now()}-${base}.${ext}`;
  const {error}=await sb.storage.from("org-party-media").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type||undefined});
  if(error)throw error;
  const {data}=sb.storage.from("org-party-media").getPublicUrl(path);
  return {path,url:data.publicUrl};
}

async function editQuestion(id){
  const {data,error}=await sb.rpc("org_quiz_get_question_admin",{p_question_id:id});
  if(error)return showToast(error.message);
  const q=data;state.editingQuestion=q;
  $("editingQuestionId").value=q.id;$("questionEditorTitle").textContent="Редактировать вопрос";
  $("editorQuizSelect").value=q.quiz_id;$("questionType").value=q.question_type;$("newQuestionPrompt").value=q.prompt||"";
  const opts=Array.isArray(q.options)?q.options:[];
  ["optionA","optionB","optionC","optionD"].forEach((id,i)=>$(id).value=opts[i]||"");
  $("newQuestionExplanation").value=q.explanation||"";$("questionTime").value=q.time_limit_sec||30;$("questionPoints").value=q.points??100;
  $("questionDifficulty").value=q.difficulty||2;$("questionTags").value=(q.tags||[]).join(", ");
  $("mediaUpload").value="";
  const cfg=q.config||{};
  $("mediaUrl").value=cfg.flag_url||cfg.image_url||cfg.audio_url||"";
  $("targetRegion").value=cfg.target_region||"";
  $("eliminateOnWrong").checked=!!cfg.eliminate_on_wrong;
  const cp=Array.isArray(q.correct_payload)?q.correct_payload:[];
  if(q.question_type==="multiple")$("correctMulti").value=cp.map(i=>String.fromCharCode(65+Number(i))).join(", ");
  else if(["single","true_false","flag","anthem","person_photo","place_photo","elimination","odd_one_out"].includes(q.question_type))$("correctOption").value=String(cp[0]??0);
  $("questionEditorDrawer").classList.remove("hidden");$("questionEditorDrawer").setAttribute("aria-hidden","false");updateQuestionTypeHint();
}

function renderComposer(){
  const search=($("composerSearch")?.value||"").trim().toLowerCase();
  const type=$("composerType")?.value||"";
  const selected=new Set(state.composerQuestionIds);
  const rows=(state.questionRows||[]).filter(q=>!selected.has(q.id)&&(!type||q.question_type===type)&&(!search||q.prompt.toLowerCase().includes(search)));
  $("composerBank").innerHTML=rows.slice(0,150).map(q=>`<button type="button" class="composer-item" data-composer-add="${q.id}"><span>${questionTypeLabel(q.question_type)}</span><strong>${escapeHtml(q.prompt)}</strong><small>+ добавить</small></button>`).join("")||'<div class="empty-state compact"><strong>Нет вопросов</strong></div>';
  $("composerSelected").innerHTML=state.composerQuestionIds.map((id,i)=>{
    const q=state.questionRows.find(x=>x.id===id);if(!q)return"";
    return `<div class="composer-item selected-item" draggable="true" data-composer-id="${id}"><span class="drag-grip">⋮⋮</span><div><small>${i+1}. ${questionTypeLabel(q.question_type)}</small><strong>${escapeHtml(q.prompt)}</strong></div><button type="button" data-composer-remove="${id}">×</button></div>`;
  }).join("")||'<div class="empty-state compact"><strong>Добавьте вопросы</strong><p>Нажимайте на задания слева.</p></div>';
  $("composerCount").textContent=state.composerQuestionIds.length;
  document.querySelectorAll("[data-composer-add]").forEach(b=>b.onclick=()=>{state.composerQuestionIds.push(b.dataset.composerAdd);renderComposer()});
  document.querySelectorAll("[data-composer-remove]").forEach(b=>b.onclick=()=>{state.composerQuestionIds=state.composerQuestionIds.filter(x=>x!==b.dataset.composerRemove);renderComposer()});
  let dragged=null;
  document.querySelectorAll("[data-composer-id]").forEach(el=>{
    el.ondragstart=()=>{dragged=el.dataset.composerId;el.classList.add("dragging")};
    el.ondragend=()=>{el.classList.remove("dragging");dragged=null};
    el.ondragover=e=>{e.preventDefault();if(!dragged||dragged===el.dataset.composerId)return;const from=state.composerQuestionIds.indexOf(dragged),to=state.composerQuestionIds.indexOf(el.dataset.composerId);if(from<0||to<0)return;state.composerQuestionIds.splice(to,0,state.composerQuestionIds.splice(from,1)[0]);renderComposer()};
  });
}
$("composerSearch")?.addEventListener("input",renderComposer);
$("composerType")?.addEventListener("change",renderComposer);
$("setComposerForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!state.composerQuestionIds.length)return showToast("Добавьте хотя бы один вопрос.");
  const {data,error}=await sb.rpc("org_party_create_set_from_questions",{
    p_title:$("composerTitle").value,p_topic:$("composerTopic").value,p_description:$("composerDescription").value||null,p_question_ids:state.composerQuestionIds
  });
  if(error)return showToast(error.message);
  closeDrawer("composer");await loadQuizSets();await window.openStudioView("sets");showToast("Набор собран.");
});

function openSetOrder(setId){
  const set=state.quizSets.find(s=>s.id===setId);if(!set)return;
  state.orderingSetId=setId;state.orderingIds=(state.questionRows||[]).filter(q=>q.quiz_id===setId).sort((a,b)=>a.order_index-b.order_index).map(q=>q.id);
  $("setOrderTitle").textContent=set.title;renderSetOrder();
  $("setOrderDrawer").classList.remove("hidden");$("setOrderDrawer").setAttribute("aria-hidden","false");
}
function renderSetOrder(){
  $("setOrderList").innerHTML=(state.orderingIds||[]).map((id,i)=>{
    const q=state.questionRows.find(x=>x.id===id);if(!q)return"";
    return `<div class="set-order-item" draggable="true" data-order-id="${id}"><span class="drag-grip">⋮⋮</span><span class="order-no">${i+1}</span><div><strong>${escapeHtml(q.prompt)}</strong><small>${questionTypeLabel(q.question_type)}</small></div></div>`;
  }).join("")||'<div class="empty-state"><strong>В наборе нет вопросов</strong></div>';
  let dragged=null;
  document.querySelectorAll("[data-order-id]").forEach(el=>{
    el.ondragstart=()=>{dragged=el.dataset.orderId;el.classList.add("dragging")};
    el.ondragend=()=>{el.classList.remove("dragging");dragged=null};
    el.ondragover=e=>{e.preventDefault();if(!dragged||dragged===el.dataset.orderId)return;const a=state.orderingIds.indexOf(dragged),b=state.orderingIds.indexOf(el.dataset.orderId);state.orderingIds.splice(b,0,state.orderingIds.splice(a,1)[0]);renderSetOrder()};
  });
}
$("saveSetOrder")?.addEventListener("click",async()=>{
  if(!state.orderingSetId)return;
  const {error}=await sb.rpc("org_quiz_reorder_set",{p_quiz_id:state.orderingSetId,p_question_ids:state.orderingIds});
  if(error)return showToast(error.message);
  closeDrawer("setorder");await loadQuestionBank();showToast("Порядок сохранён.");
});

function shuffleArray(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function buildPartyNightSelection(){
  const specs=[
    ["flag",Number($("partyCountFlag").value||0)],["anthem",Number($("partyCountAnthem").value||0)],
    ["person_photo",Number($("partyCountPerson").value||0)],["place_photo",Number($("partyCountPlace").value||0)],
    ["region_map",Number($("partyCountMap").value||0)],["single",Number($("partyCountTest").value||0)],
    ["vote",Number($("partyCountVote").value||0)],["duel",Number($("partyCountDuel").value||0)],
    ["elimination",Number($("partyCountElimination").value||0)]
  ];
  let picked=[];
  for(const [type,n] of specs){
    const pool=shuffleArray((state.questionRows||[]).filter(q=>q.question_type===type));
    picked.push(...pool.slice(0,n));
  }
  if($("partyShuffle").checked)picked=shuffleArray(picked);
  return picked;
}
function renderPartyNightPreview(rows){
  if(!$("partyNightPreview"))return;
  $("partyNightPreview").innerHTML=rows.length?rows.map((q,i)=>`<div class="scenario-row"><span>${i+1}</span><div><strong>${escapeHtml(q.prompt)}</strong><small>${questionTypeLabel(q.question_type)}</small></div></div>`).join(""):'<div class="empty-state compact"><strong>Сценарий ещё не собран</strong><p>Настройте количество раундов слева.</p></div>';
}
["partyCountFlag","partyCountAnthem","partyCountPerson","partyCountPlace","partyCountMap","partyCountTest","partyCountVote","partyCountDuel","partyCountElimination","partyShuffle"].forEach(id=>$(id)?.addEventListener("input",()=>renderPartyNightPreview(buildPartyNightSelection())));
$("partyNightForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const rows=buildPartyNightSelection();renderPartyNightPreview(rows);
  if(!rows.length)return msg($("partyNightMessage"),"Выберите хотя бы один раунд.");
  const {data,error}=await sb.rpc("org_party_create_set_from_questions",{
    p_title:$("partyNightTitle").value||"ORG Party Night",p_topic:"Party Night",p_description:"Автоматически собранный сценарий",p_question_ids:rows.map(q=>q.id)
  });
  if(error)return msg($("partyNightMessage"),error.message);
  await loadQuizSets();msg($("partyNightMessage"),"Party Night создан.");showToast("Готов новый Party Night.");
});
