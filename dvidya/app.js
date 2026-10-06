/* D-Vidya - study playroom. No dependencies. Model calls go through the D'Ai backend. */
(() => {
'use strict';
const AI_URL = 'https://ai.d-verse.in/api/chat';
const KEY = 'dvidya.v1';
const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0, 10);

const SUBJECTS = {
  Science: '🔬', Maths: '➗', 'Social Science': '🌍', English: '📖', Hindi: '🪔', Computer: '💻'
};
const LANGS = ['English','Hindi','Gujarati','Marathi','Bengali','Tamil','Telugu','Kannada','Malayalam','Punjabi'];
const BADGES = [
  ['spark','🔥','First Spark','Log in on day 1',s=>true],
  ['test1','📝','Test Taker','Finish a test',s=>s.tests.length>=1],
  ['test5','🏅','Five Tests','Finish 5 tests',s=>s.tests.length>=5],
  ['perfect','💎','Perfect Score','Score 100% in a test',s=>s.tests.some(t=>t.score===t.total)],
  ['d90','🌟','Distinction','Score 90%+ in a test',s=>s.tests.some(t=>t.score/t.total>=.9)],
  ['streak3','📅','3-Day Streak','Study 3 days in a row',s=>s.best>=3],
  ['streak7','🗓️','Week Warrior','Study 7 days in a row',s=>s.best>=7],
  ['doubt','🦉','Curious Mind','Ask the tutor 5 questions',s=>s.doubts>=5],
  ['cards','🃏','Card Shark','Finish 3 flashcard decks',s=>s.decks>=3],
  ['brain','🧩','Brain Break','Solve a puzzle',s=>s.puzzles>=1],
  ['plan','✅','Planner Pro','Complete 5 planner tasks',s=>s.plan.filter(t=>t.done).length>=5],
  ['xp500','🚀','Rocket','Reach 500 XP',s=>s.xp>=500],
];

let S = load();
function fresh(){return {name:'',cls:8,board:'CBSE',lang:'English',role:'student',xp:0,streak:0,best:0,last:'',tests:[],doubts:0,decks:0,puzzles:0,plan:[],chat:[],weak:{},seen:{}, toured:false};}
function load(){try{return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return fresh();}}
function save(){try{localStorage.setItem(KEY, JSON.stringify(S));}catch{}}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2200);}
function addXP(n,why){const before=level();S.xp+=n;save();toast(`+${n} XP${why?' · '+why:''}`);if(level()>before)setTimeout(()=>toast(`Level up! You are level ${level()} 🎉`),2300);}
const level = () => 1 + Math.floor(S.xp / 100);
function touchStreak(){
  const t=today(); if(S.last===t) return;
  const y=new Date(Date.now()-864e5).toISOString().slice(0,10);
  S.streak = S.last===y ? S.streak+1 : 1; S.best=Math.max(S.best,S.streak); S.last=t; save();
}

/* ---------- AI ---------- */
function sys(extra=''){
  return `You are D-Vidya, a warm, clear tutor for a Class ${S.cls} ${S.board} student in India. Follow the NCERT/${S.board} syllabus. Write in ${S.lang}${S.lang==='English'?'':' (keep technical terms in English in brackets when helpful)'}. Keep answers short and friendly. ${extra}`;
}
async function ai(messages,{stream=false,onToken,signal}={}){
  const res = await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},signal,
    body:JSON.stringify({messages,stream})});
  if(!res.ok){let m='The AI is busy, try again in a moment.';try{m=(await res.json()).error||m}catch{} throw new Error(m);}
  if(!stream){const j=await res.json();return j.choices?.[0]?.message?.content||'';}
  const rd=res.body.getReader(),dec=new TextDecoder();let buf='',full='';
  for(;;){const {done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});
    const lines=buf.split('\n');buf=lines.pop();
    for(const l of lines){const t=l.trim();if(!t.startsWith('data:'))continue;const raw=t.slice(5).trim();if(raw==='[DONE]')continue;
      try{const d=JSON.parse(raw).choices?.[0]?.delta?.content;if(d){full+=d;onToken&&onToken(full);}}catch{}}}
  return full;
}
async function aiJSON(prompt,tries=2){
  let last;
  for(let i=0;i<tries;i++){
    try{
      const t=await ai([{role:'system',content:sys('Reply with ONLY valid JSON. No markdown fences, no commentary.')},{role:'user',content:prompt}]);
      const m=t.replace(/```json|```/g,'').match(/[\[{][\s\S]*[\]}]/);
      return JSON.parse(m[0]);
    }catch(e){last=e;}
  }
  throw last||new Error('Could not read the answer');
}
function md(src){
  let s=esc(src);
  const blocks=[];
  s=s.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,l,c)=>{blocks.push(`<pre><code>${c}</code></pre>`);return `\u0000${blocks.length-1}\u0000`;});
  s=s.replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<i>$2</i>');
  const out=[];let list=null,tbl=null;
  const close=()=>{if(list){out.push(`</${list}>`);list=null}if(tbl){out.push('</table>');tbl=null}};
  for(const line of s.split('\n')){
    let m;
    if((m=line.match(/^\s*\|(.+)\|\s*$/))){ if(/^[\s|:-]+$/.test(line)) continue; if(!tbl){close();out.push('<table>');tbl=1;} out.push('<tr>'+m[1].split('|').map(c=>`<td>${c.trim()}</td>`).join('')+'</tr>'); continue;}
    if((m=line.match(/^\s*[-*•]\s+(.*)/))){ if(list!=='ul'){close();out.push('<ul>');list='ul'} out.push(`<li>${m[1]}</li>`); continue;}
    if((m=line.match(/^\s*\d+[.)]\s+(.*)/))){ if(list!=='ol'){close();out.push('<ol>');list='ol'} out.push(`<li>${m[1]}</li>`); continue;}
    close();
    if((m=line.match(/^(#{1,4})\s+(.*)/))) out.push(`<h3>${m[2]}</h3>`);
    else if(line.trim()) out.push(`<p>${line}</p>`);
  }
  close();
  return out.join('').replace(/\u0000(\d+)\u0000/g,(_,i)=>blocks[i]);
}

/* ---------- routing ---------- */
const V=$('#view');
const routes={home,test,tutor,cards,plan,break:brk,teach};
let current='home';
function go(name){
  if(!routes[name]) name='home';
  current=name;
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('on',b.dataset.go===name));
  if(location.hash!=='#'+name) history.replaceState(null,'','#'+name);
  V.innerHTML='';V.scrollTop=0;window.scrollTo(0,0);
  routes[name]();
}
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>go(b.dataset.go));

/* ---------- onboarding ---------- */
function onboard(){
  const ov=$('#overlay');ov.hidden=false;
  ov.innerHTML=`<div class="modal"><div class="card pop">
    <h2>Hi! I am Vidya 🦉</h2><p class="mute">Tell me a little so I can fit your class. Saved only on this device.</p>
    <label for="o-name">Your name</label><input id="o-name" placeholder="e.g. Aarav" autocomplete="given-name">
    <div class="row" style="align-items:flex-start"><div style="flex:1;min-width:130px"><label for="o-cls">Class</label><select id="o-cls">${[6,7,8,9,10,11,12].map(c=>`<option ${c==8?'selected':''}>${c}</option>`).join('')}</select></div>
    <div style="flex:1;min-width:130px"><label for="o-board">Board</label><select id="o-board"><option>CBSE</option><option>ICSE</option><option>State board</option></select></div></div>
    <label for="o-lang">Language I explain in</label><select id="o-lang">${LANGS.map(l=>`<option>${l}</option>`).join('')}</select>
    <label>I am a</label><div class="row" id="o-role"><button class="chip on" data-r="student">Student</button><button class="chip" data-r="teacher">Teacher</button><button class="chip" data-r="parent">Parent</button></div>
    <div class="sp"></div><button class="btn" id="o-go" style="width:100%">Let's start</button></div></div>`;
  let role='student';
  ov.querySelectorAll('#o-role .chip').forEach(c=>c.onclick=()=>{role=c.dataset.r;ov.querySelectorAll('#o-role .chip').forEach(x=>x.classList.toggle('on',x===c));});
  $('#o-go').onclick=()=>{
    S.name=$('#o-name').value.trim()||'Friend';S.cls=+$('#o-cls').value;S.board=$('#o-board').value;S.lang=$('#o-lang').value;S.role=role;
    touchStreak();save();ov.hidden=true;ov.innerHTML='';applyRole();go(role==='teacher'?'teach':'home');
    if(!S.toured)setTimeout(tour,400);
  };
}
function applyRole(){ $('#nav-teach').style.display=S.role==='teacher'?'':'none'; }

/* ---------- guided tour ---------- */
function tour(){
  const steps=[
    ['[data-go=home]','Home','Your XP, streak, badges and weak topics live here.'],
    ['[data-go=test]','Test','AI makes a mock test that gets easier or harder as you answer.'],
    ['[data-go=tutor]','Tutor','Ask any doubt. The answer streams in as it is written.'],
    ['[data-go=cards]','Cards','Flip flashcards for quick revision.'],
    ['[data-go=break]','Break','A tiny puzzle to rest your brain and earn XP.'],
  ];
  const ov=$('#overlay');ov.hidden=false;let i=0;
  const show=()=>{
    if(i>=steps.length){ov.hidden=true;ov.innerHTML='';S.toured=true;save();return;}
    const t=document.querySelector(steps[i][0]);const r=t.getBoundingClientRect();
    ov.innerHTML=`<div class="spot" style="left:${r.left-6}px;top:${r.top-6}px;width:${r.width+12}px;height:${r.height+12}px"></div>
    <div class="tip card" style="${r.top>innerHeight/2?'bottom:'+(innerHeight-r.top+20)+'px':'top:'+(r.bottom+20)+'px'}"><h3>${steps[i][1]}</h3><p>${steps[i][2]}</p>
    <div class="row"><button class="btn sm" id="t-next">${i==steps.length-1?'Done':'Next'}</button><button class="btn sm alt" id="t-skip">Skip</button></div></div>`;
    $('#t-next').onclick=()=>{i++;show();};$('#t-skip').onclick=()=>{i=99;show();};
  };
  show();
}

/* ---------- home ---------- */
const owl=`<svg viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="60" cy="68" rx="40" ry="44" fill="#fffdf6" stroke="#211d16" stroke-width="4"/><path d="M26 34 L38 14 L52 30 M94 34 L82 14 L68 30" fill="#c6f432" stroke="#211d16" stroke-width="4" stroke-linejoin="round"/><circle cx="44" cy="58" r="15" fill="#fff" stroke="#211d16" stroke-width="4"/><circle cx="76" cy="58" r="15" fill="#fff" stroke="#211d16" stroke-width="4"/><circle cx="46" cy="60" r="6" fill="#211d16"/><circle cx="74" cy="60" r="6" fill="#211d16"/><path d="M54 72 L60 84 L66 72 Z" fill="#ff8fb1" stroke="#211d16" stroke-width="3" stroke-linejoin="round"/><path d="M36 96 Q60 108 84 96" fill="none" stroke="#211d16" stroke-width="4" stroke-linecap="round"/></svg>`;
function readiness(){
  if(!S.tests.length) return null;
  const l=S.tests.slice(-5);return Math.round(100*l.reduce((a,t)=>a+t.score/t.total,0)/l.length);
}
function home(){
  touchStreak();
  const r=readiness();const lvlXp=S.xp%100;
  const weak=Object.entries(S.weak).filter(([,v])=>v.wrong>0).sort((a,b)=>b[1].wrong/(b[1].wrong+b[1].right)-a[1].wrong/(a[1].wrong+a[1].right)).slice(0,4);
  const open=S.plan.filter(t=>!t.done&&t.date<=today()).slice(0,3);
  const last=S.tests.slice(-6);
  V.innerHTML=`
  <div class="card hero">${owl}<div><h1>Hello ${esc(S.name||'there')}!</h1><p>Class ${S.cls} · ${esc(S.board)} · ${esc(S.lang)}</p>
  <div class="row"><button class="btn" data-g="test">Start a test</button><button class="btn alt" data-g="tutor">Ask a doubt</button></div></div></div>
  <div class="sp"></div>
  <div class="grid g3">
    <div class="card stat"><span class="mute">Level</span><b>${level()}</b><div class="bar"><i style="width:${lvlXp}%"></i></div><small class="mute">${S.xp} XP</small></div>
    <div class="card stat"><span class="mute">Streak</span><b>${S.streak} 🔥</b><small class="mute">Best ${S.best} days</small></div>
    <div class="card stat"><span class="mute">Board readiness</span><b>${r===null?'-':r+'%'}</b><small class="mute">${r===null?'Take a test to see it':'Last '+Math.min(5,S.tests.length)+' tests'}</small></div>
  </div>
  <div class="sp"></div>
  <div class="grid g2">
    <div class="card"><h3>Score curve</h3>${last.length?curve(last):'<p class="mute">No tests yet. Your scores will draw a line here.</p>'}</div>
    <div class="card"><h3>Weak spots</h3>${weak.length?weak.map(([k,v])=>{const p=Math.round(100*v.right/(v.right+v.wrong));return `<p><b>${esc(k)}</b> <span class="pill">${p}% right</span></p><div class="bar"><i style="width:${p}%;background:var(--pink)"></i></div>`}).join('')+`<div class="sp"></div><button class="btn sm sky" data-g="tutor">Fix with the tutor</button>`:'<p class="mute">Nothing yet. Wrong answers in tests will show up here.</p>'}</div>
    <div class="card"><h3>Today</h3>${open.length?open.map(t=>`<p>• ${esc(t.text)}</p>`).join(''):'<p class="mute">No tasks due.</p>'}<div class="sp"></div><button class="btn sm alt" data-g="plan">Open planner</button></div>
    <div class="card"><h3>Brain break</h3><p>Stuck? Solve a tiny Sudoku and grab XP.</p><button class="btn sm sun" data-g="break">Play</button></div>
  </div>
  <div class="sp"></div>
  <div class="card"><h3>Badges · ${BADGES.filter(b=>b[4](S)).length}/${BADGES.length}</h3>
  <div class="grid g3">${BADGES.map(b=>`<div class="badge ${b[4](S)?'':'off'}"><i>${b[1]}</i><b>${b[2]}</b><br><small class="mute">${b[3]}</small></div>`).join('')}</div></div>
  <div class="sp"></div><p class="mute"><button class="chip" id="reset">Change my profile</button></p>`;
  V.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>go(b.dataset.g));
  $('#reset').onclick=()=>{S.toured=true;onboard();};
}
function curve(l){
  const w=300,h=120,p=14;const pts=l.map((t,i)=>[p+(l.length==1?w/2:i*(w-2*p)/(l.length-1)),h-p-(h-2*p)*t.score/t.total]);
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%"><polyline fill="none" stroke="#211d16" stroke-width="3" points="${pts.map(p=>p.join(',')).join(' ')}"/>${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="7" fill="#c6f432" stroke="#211d16" stroke-width="3"/><text x="${p[0]}" y="${Math.max(10,p[1]-12)}" font-size="11" text-anchor="middle" font-weight="700">${Math.round(100*l[i].score/l[i].total)}%</text>`).join('')}</svg>`;
}

/* ---------- chapter picker shared ---------- */
const chapCache={};
async function chapters(subject){
  const k=`${S.cls}|${S.board}|${subject}`;
  if(chapCache[k]) return chapCache[k];
  try{
    const stored=JSON.parse(localStorage.getItem('dvidya.ch.'+k)||'null');if(stored){return chapCache[k]=stored;}
    const j=await aiJSON(`List the main chapter names of ${S.board} Class ${S.cls} ${subject} (NCERT). Return a JSON array of up to 14 short strings.`);
    const a=j.filter(x=>typeof x==='string').slice(0,14);localStorage.setItem('dvidya.ch.'+k,JSON.stringify(a));return chapCache[k]=a;
  }catch{return [];}
}
function picker(host,{withDiff=false}={}){
  const st={subject:'Science',topic:'',diff:'Mixed'};
  host.innerHTML=`<label>Subject</label><div class="row" id="p-sub">${Object.entries(SUBJECTS).map(([s,e])=>`<button class="chip ${s==st.subject?'on':''}" data-s="${s}">${e} ${s}</button>`).join('')}</div>
  <label for="p-topic">Chapter or topic</label><input id="p-topic" placeholder="Type a topic, or tap one below">
  <div class="row" id="p-ch" style="margin-top:10px"><span class="mute dots">Finding chapters</span></div>`;
  const loadCh=async()=>{const box=$('#p-ch',host);box.innerHTML='<span class="mute dots">Finding chapters</span>';const list=await chapters(st.subject);
    box.innerHTML=list.length?list.map(c=>`<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join(''):'<span class="mute">Type your own topic above.</span>';
    box.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{$('#p-topic',host).value=b.dataset.c;});};
  host.querySelectorAll('#p-sub .chip').forEach(b=>b.onclick=()=>{st.subject=b.dataset.s;host.querySelectorAll('#p-sub .chip').forEach(x=>x.classList.toggle('on',x===b));loadCh();});
  loadCh();
  return {get:()=>({subject:st.subject,topic:$('#p-topic',host).value.trim()||st.subject})};
}
function fail(host,e,retry){host.innerHTML=`<div class="err-box"><b>That did not work.</b> ${esc(e.message||e)}<div class="sp"></div><button class="btn sm" id="retry">Try again</button></div>`;$('#retry',host).onclick=retry;}

/* ---------- adaptive test ---------- */
function test(){
  V.innerHTML=`<h1>Mock test</h1><p class="mute">10 questions. Get one wrong and the next gets easier. Get it right and it gets harder.</p><div class="card"><div id="pk"></div><div class="sp"></div><button class="btn" id="go" style="width:100%">Make my test</button></div><div id="stage"></div>`;
  const pk=picker($('#pk'));
  $('#go').onclick=()=>{const {subject,topic}=pk.get();build(subject,topic);};
  async function build(subject,topic){
    $('#stage').innerHTML=`<div class="card" style="margin-top:18px"><b class="dots">Writing your questions</b><div class="bar" style="margin-top:12px"><i style="width:40%"></i></div></div>`;
    try{
      const j=await aiJSON(`Write 12 multiple-choice questions for ${S.board} Class ${S.cls} ${subject}, topic: "${topic}". 4 easy, 4 medium, 4 hard. Return a JSON array of objects: {"q":string,"options":[4 strings],"answer":index 0-3,"level":"easy"|"medium"|"hard","why":"one-sentence explanation"}. Options must not include letters like A) or 1).`);
      const pool=(Array.isArray(j)?j:j.questions||[]).filter(x=>x&&x.q&&Array.isArray(x.options)&&x.options.length>=2&&Number.isInteger(x.answer)&&x.options[x.answer]!==undefined);
      if(pool.length<5) throw new Error('Too few good questions came back.');
      run(subject,topic,pool);
    }catch(e){fail($('#stage'),e,()=>build(subject,topic));}
  }
  function run(subject,topic,pool){
    const lv={easy:0,medium:1,hard:2};let ability=1,n=0,score=0;const total=Math.min(10,pool.length);const log=[];
    const next=()=>{
      if(n>=total) return end();
      const want=['easy','medium','hard'][ability];
      let i=pool.findIndex(q=>q.level===want);
      if(i<0){let best=0,bd=9;pool.forEach((q,k)=>{const d=Math.abs((lv[q.level]??1)-ability);if(d<bd){bd=d;best=k}});i=best;}
      const q=pool.splice(i,1)[0];n++;
      $('#stage').innerHTML=`<div class="card pop" style="margin-top:18px"><div class="row" style="justify-content:space-between"><span class="pill">Question ${n}/${total}</span><span class="pill" style="background:var(--sun)">${esc(q.level||'medium')}</span></div>
      <div class="bar" style="margin:12px 0"><i style="width:${100*(n-1)/total}%"></i></div><h3>${esc(q.q)}</h3>
      ${q.options.map((o,k)=>`<button class="opt" data-k="${k}">${esc(o)}</button>`).join('')}<div id="fb"></div></div>`;
      $('#stage').querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
        const k=+b.dataset.k,ok=k===q.answer;
        $('#stage').querySelectorAll('.opt').forEach(x=>{x.disabled=true;if(+x.dataset.k===q.answer)x.classList.add('good');});
        if(!ok)b.classList.add('bad');
        const w=S.weak[topic]||(S.weak[topic]={right:0,wrong:0,subject});ok?w.right++:w.wrong++;
        if(ok){score++;ability=Math.min(2,ability+1);}else ability=Math.max(0,ability-1);
        log.push({q:q.q,ok});save();
        $('#fb').innerHTML=`<div class="explain"><b>${ok?'Correct! 🎉':'Not quite.'}</b> ${esc(q.why||'')}</div><div class="sp"></div><button class="btn" id="nx">${n>=total?'See result':'Next'}</button>`;
        $('#nx').onclick=next;$('#nx').focus();
      });
    };
    const end=()=>{
      S.tests.push({subject,topic,score,total,date:today()});const bonus=score*10+20;addXP(bonus,'test done');
      const pct=Math.round(100*score/total);
      $('#stage').innerHTML=`<div class="card pop hero" style="margin-top:18px">${owl}<div><h2>${score}/${total} · ${pct}%</h2><p>${pct>=90?'Distinction level. Wow!':pct>=60?'Solid. A little more practice and you are there.':'Good start. Let us fix the gaps together.'}</p><div class="row"><button class="btn" id="again">New test</button><button class="btn alt" id="tut">Ask the tutor</button></div></div></div>`;
      $('#again').onclick=test;$('#tut').onclick=()=>{S.pending=`Explain the key ideas of "${topic}" (${subject}) simply, then give me 2 practice questions.`;go('tutor');};
    };
    next();
  }
}

/* ---------- tutor ---------- */
function tutor(){
  V.innerHTML=`<h1>Tutor 🦉</h1><p class="mute">Ask anything from school. I explain step by step.</p>
  <div class="row" id="qs">${['Explain photosynthesis simply','Why is the sky blue?','Help me solve 2x + 5 = 17','Summarise the French Revolution'].map(q=>`<button class="chip">${q}</button>`).join('')}</div>
  <div class="sp"></div><div class="chat" id="chat"></div>
  <form class="composer" id="f"><input id="in" placeholder="Type your doubt" autocomplete="off" aria-label="Your doubt"><button class="btn" id="send">Send</button></form>`;
  const chat=$('#chat');
  const draw=()=>{chat.innerHTML=S.chat.length?'':'<div class="msg ai">Hi! What are we learning today?</div>';S.chat.forEach(m=>chat.append(el(`<div class="msg ${m.role==='user'?'me':'ai'}">${m.role==='user'?esc(m.content):md(m.content)}</div>`)));};
  draw();
  let busy=false;
  async function ask(text){
    if(busy||!text.trim())return;busy=true;$('#send').disabled=true;
    S.chat.push({role:'user',content:text});S.chat=S.chat.slice(-30);S.doubts++;touchStreak();save();draw();
    const bubble=el('<div class="msg ai"><span class="dots">Thinking</span></div>');chat.append(bubble);bubble.scrollIntoView({block:'end',behavior:'smooth'});
    try{
      const msgs=[{role:'system',content:sys('Explain step by step with small examples. Use short paragraphs and lists. End with one quick check question.')},...S.chat.slice(-10)];
      const full=await ai(msgs,{stream:true,onToken:t=>{bubble.innerHTML=md(t);}});
      if(!full)throw new Error('Empty answer');
      S.chat.push({role:'assistant',content:full});save();if(S.doubts%5===0)addXP(10,'curious mind');
    }catch(e){bubble.innerHTML=`<b>Hmm.</b> ${esc(e.message)} <button class="chip" id="rt">Retry</button>`;S.chat.pop();save();const t=text;$('#rt',bubble).onclick=()=>{bubble.remove();busy=false;ask(t);return;};}
    busy=false;$('#send').disabled=false;
  }
  $('#f').onsubmit=e=>{e.preventDefault();const v=$('#in').value;$('#in').value='';ask(v);};
  $('#qs').querySelectorAll('.chip').forEach(c=>c.onclick=()=>ask(c.textContent));
  if(S.pending){const p=S.pending;delete S.pending;ask(p);}
}

/* ---------- flashcards ---------- */
function cards(){
  V.innerHTML=`<h1>Flashcards</h1><div class="card"><div id="pk"></div><div class="sp"></div><button class="btn" id="go" style="width:100%">Make a deck</button></div><div id="stage"></div>`;
  const pk=picker($('#pk'));$('#go').onclick=()=>{const {subject,topic}=pk.get();build(subject,topic);};
  async function build(subject,topic){
    $('#stage').innerHTML='<div class="card" style="margin-top:18px"><b class="dots">Making cards</b></div>';
    try{
      const j=await aiJSON(`Make 8 flashcards for ${S.board} Class ${S.cls} ${subject}, topic "${topic}". JSON array of {"front":short question or term,"back":short answer, max 25 words}.`);
      const deck=(Array.isArray(j)?j:j.cards||[]).filter(c=>c&&c.front&&c.back);
      if(deck.length<3)throw new Error('Too few cards came back.');
      show(deck);
    }catch(e){fail($('#stage'),e,()=>build(subject,topic));}
  }
  function show(deck){
    let i=0,got=0;
    const draw=()=>{
      if(i>=deck.length){S.decks++;addXP(got*3+10,'deck done');$('#stage').innerHTML=`<div class="card pop" style="margin-top:18px;text-align:center"><h2>${got}/${deck.length} remembered</h2><button class="btn" id="n">New deck</button></div>`;$('#n').onclick=cards;return;}
      $('#stage').innerHTML=`<div style="margin-top:18px"><p class="mute">Card ${i+1}/${deck.length} · tap the card to flip</p><div class="flip" id="fl"><div><div class="face">${esc(deck[i].front)}</div><div class="face back">${esc(deck[i].back)}</div></div></div>
      <div class="sp"></div><div class="row"><button class="btn pink" id="no" style="flex:1">Again</button><button class="btn" id="yes" style="flex:1">Got it</button></div></div>`;
      $('#fl').onclick=()=>$('#fl').classList.toggle('on');
      $('#no').onclick=()=>{i++;draw();};$('#yes').onclick=()=>{got++;i++;draw();};
    };draw();
  }
}

/* ---------- planner ---------- */
function plan(){
  const render=()=>{
    const list=[...S.plan].sort((a,b)=>a.done-b.done||a.date.localeCompare(b.date));
    $('#list').innerHTML=list.length?list.map(t=>`<div class="task ${t.done?'done':''}"><input type="checkbox" data-id="${t.id}" ${t.done?'checked':''} aria-label="Done"><span>${esc(t.text)}<br><small class="mute">${t.date===today()?'Today':esc(t.date)}</small></span><button class="chip" data-del="${t.id}" aria-label="Delete">✕</button></div>`).join(''):'<p class="mute">Nothing planned yet.</p>';
    $('#list').querySelectorAll('input[type=checkbox]').forEach(c=>c.onchange=()=>{const t=S.plan.find(x=>x.id==c.dataset.id);t.done=c.checked;save();if(t.done)addXP(5,'task done');render();});
    $('#list').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{S.plan=S.plan.filter(x=>x.id!=b.dataset.del);save();render();});
  };
  V.innerHTML=`<h1>Study planner</h1><div class="card"><label for="t">Add a task</label><div class="row"><input id="t" style="flex:1;min-width:200px" placeholder="e.g. Revise Force and Pressure"><input id="d" type="date" style="width:auto" value="${today()}"><button class="btn" id="add">Add</button></div></div>
  <div class="sp"></div><div class="card"><h3>Plan it for me</h3><p class="mute">Tell me what is coming up and I will split it into daily tasks.</p>
  <input id="g" placeholder="e.g. Maths unit test in 5 days on Algebra"><div class="sp"></div><button class="btn sky" id="mk">Make a plan</button><div id="pe"></div></div>
  <div class="sp"></div><div id="list"></div>`;
  render();
  const add=(text,date)=>{S.plan.push({id:Date.now()+Math.random(),text,date,done:false});save();};
  $('#add').onclick=()=>{const t=$('#t').value.trim();if(!t)return;add(t,$('#d').value||today());$('#t').value='';render();};
  $('#mk').onclick=async()=>{
    const g=$('#g').value.trim();if(!g)return;$('#mk').disabled=true;$('#pe').innerHTML='<p class="dots">Planning</p>';
    try{
      const j=await aiJSON(`Student goal: "${g}". Today is ${today()}. Make a realistic daily study plan, max 10 tasks, each under 12 words. JSON array of {"text":string,"date":"YYYY-MM-DD"} with dates starting today.`);
      const a=(Array.isArray(j)?j:j.tasks||[]).filter(x=>x&&x.text);if(!a.length)throw new Error('No tasks came back.');
      a.slice(0,10).forEach(x=>add(String(x.text),/^\d{4}-\d\d-\d\d$/.test(x.date)?x.date:today()));$('#pe').innerHTML='';$('#g').value='';render();toast('Plan added');
    }catch(e){$('#pe').innerHTML=`<div class="err-box">${esc(e.message)}</div>`;}
    $('#mk').disabled=false;
  };
}

/* ---------- brain break: 4x4 sudoku ---------- */
function brk(){
  const base=[[1,2,3,4],[3,4,1,2],[2,3,4,1],[4,1,2,3]];
  const sh=a=>[...a].sort(()=>Math.random()-.5);
  const digits=sh([1,2,3,4]);
  const rows=[...sh([0,1]),...sh([2,3])];
  const cols=[...sh([0,1]),...sh([2,3])];
  const sol=rows.map(r=>cols.map(c=>digits[base[r][c]-1]));
  const g=sol.map(r=>r.slice());const hide=new Set();while(hide.size<8)hide.add(Math.floor(Math.random()*16));
  hide.forEach(i=>g[Math.floor(i/4)][i%4]=0);const fixed=g.map(r=>r.map(v=>v!==0));
  let sel=null;
  V.innerHTML=`<h1>Brain break 🧩</h1><p class="mute">Fill every row, column and 2×2 box with 1 to 4. Tap a square, then a number.</p><div class="sud" id="b"></div><div class="sp"></div>
  <div class="row" style="justify-content:center">${[1,2,3,4].map(n=>`<button class="btn" data-n="${n}" style="min-width:64px">${n}</button>`).join('')}<button class="btn alt" data-n="0">Clear</button></div><div class="sp"></div><div class="row" style="justify-content:center"><button class="btn sun" id="chk">Check</button><button class="btn alt" id="nw">New puzzle</button></div>`;
  const draw=(errs=[])=>{$('#b').innerHTML=g.map((r,y)=>r.map((v,x)=>`<button class="${fixed[y][x]?'fix':''} ${sel&&sel[0]==y&&sel[1]==x?'sel':''} ${errs.includes(y*4+x)?'err':''}" data-y="${y}" data-x="${x}" aria-label="Row ${y+1} column ${x+1}">${v||''}</button>`).join('')).join('');
    $('#b').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(fixed[b.dataset.y][b.dataset.x])return;sel=[+b.dataset.y,+b.dataset.x];draw();});};
  draw();
  V.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{if(!sel)return toast('Tap a square first');g[sel[0]][sel[1]]=+b.dataset.n;draw();});
  $('#nw').onclick=brk;
  $('#chk').onclick=()=>{
    const errs=[];g.forEach((r,y)=>r.forEach((v,x)=>{if(v&&v!==sol[y][x])errs.push(y*4+x);}));
    if(errs.length){draw(errs);toast('Red squares are off');return;}
    if(g.flat().includes(0)){toast('Looking good so far. Keep going');return;}
    S.puzzles++;addXP(15,'puzzle solved');$('#chk').disabled=true;
  };
}

/* ---------- teacher tools ---------- */
function teach(){
  const KINDS=['Question paper','Worksheet','Lesson plan','Marking scheme'];
  V.innerHTML=`<h1>Teacher tools 🎓</h1><p class="mute">Make classroom material for Class ${S.cls} ${esc(S.board)}.</p><div class="card"><div id="pk"></div>
  <label>What to make</label><div class="row" id="k">${KINDS.map((k,i)=>`<button class="chip ${i?'':'on'}">${k}</button>`).join('')}</div>
  <label for="ex">Anything special? (optional)</label><input id="ex" placeholder="e.g. 20 marks, include 2 case-based questions">
  <div class="sp"></div><button class="btn" id="go" style="width:100%">Generate</button></div><div id="stage"></div>`;
  const pk=picker($('#pk'));let kind=KINDS[0];
  $('#k').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{kind=c.textContent;$('#k').querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x===c));});
  const run=async()=>{
    const {subject,topic}=pk.get();$('#go').disabled=true;
    $('#stage').innerHTML='<div class="card" style="margin-top:18px"><b class="dots">Writing</b></div>';
    try{
      const box=el('<div class="card out" style="margin-top:18px"></div>');$('#stage').innerHTML='';$('#stage').append(box);
      const full=await ai([{role:'system',content:sys('You help a teacher. Produce clean, classroom-ready material in markdown with headings and lists. No chit-chat.')},{role:'user',content:`Make a ${kind} for ${subject}, topic "${topic}". ${$('#ex').value}`}],{stream:true,onToken:t=>{box.innerHTML=md(t);}});
      if(!full)throw new Error('Empty result');
      $('#stage').append(el('<div class="row" style="margin-top:14px"><button class="btn sm" id="cp">Copy</button><button class="btn sm alt" id="pr">Print</button></div>'));
      $('#cp').onclick=()=>navigator.clipboard.writeText(full).then(()=>toast('Copied'));$('#pr').onclick=()=>window.print();
    }catch(e){fail($('#stage'),e,run);}
    $('#go').disabled=false;
  };
  $('#go').onclick=run;
}

/* ---------- boot ---------- */
applyRole();
if(!S.name) onboard(); else touchStreak();
go((location.hash||'#home').slice(1));
})();
