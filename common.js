/* =====================================================================
   Спільний каркас лекцій з NLP: хелпери, зміст, прогрес, режим лекції,
   тема, клавіатура, тести, підсвітка Python, підказки глосарію.
   Підключення: <script src="glossary.js"></script><script src="common.js"></script>
   наприкінці <body>, перед власним <script> лекції. Опис: FORMAT.md.
   ===================================================================== */

/* ===================== helpers ===================== */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):"—";
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const root=document.documentElement;
const PAGE=decodeURIComponent(location.pathname.split("/").pop()||"index.html");
const cssVar=n=>getComputedStyle(root).getPropertyValue(n).trim();

// Демо, що малюють на canvas/SVG із кольорами теми, реєструють тут функцію
// перемальовування: redraws.push(draw). Вона викликається при зміні теми,
// режиму лекції та розміру вікна.
const redraws=[];function redrawAll(){redraws.forEach(f=>f())}

// Підсвітка Python у <code class="py">. Статичний код підсвічується автоматично;
// для коду, згенерованого скриптом, викличте hlPy(el) самі.
function hlPy(el){
  const src=el.textContent;
  const re=/(#.*$)|(f?"""[\s\S]*?"""|f?'''[\s\S]*?'''|f?"(?:[^"\\\n]|\\.)*"|f?'(?:[^'\\\n]|\\.)*')|\b(def|class|import|from|for|in|if|else|elif|return|lambda|not|and|or|as|with|None|True|False|continue|break|pass|while|yield|print|set|len|sum|sorted|range|list|dict|max|min|super)\b|\b(\d+\.?\d*(?:e-?\d+)?)\b/gm;
  let out="",last=0,m;
  while((m=re.exec(src))){out+=esc(src.slice(last,m.index));
    if(m[1])out+=`<span class="cm">${esc(m[1])}</span>`;else if(m[2])out+=`<span class="st">${esc(m[2])}</span>`;else if(m[3])out+=`<span class="kw">${m[3]}</span>`;else out+=`<span class="nu">${m[4]}</span>`;last=re.lastIndex}
  out+=esc(src.slice(last));
  el.innerHTML=out.replace(/(<span class="kw">(?:def|class)<\/span> )([A-Za-z_]\w*)/g,`$1<span class="fn">$2</span>`);
}

/* ===================== shell: toc, progress, modes ===================== */
const sections=$$("section.slide");
// Прогрес читання: розділ вважається прочитаним, коли його кінець з'явився на екрані.
// Зберігається в localStorage ("prog:<файл>"); index.html показує його на картках лекцій.
const progKey="prog:"+PAGE;
let prog={read:[],last:0};try{Object.assign(prog,JSON.parse(store.get(progKey)||"{}"))}catch(e){}
const readSet=new Set(prog.read.filter(id=>sections.some(s=>s.id===id)));
// Час читання: ~130 слів/хв плюс хвилина на кожне демо; data-min на розділі перекриває оцінку.
const secMin=sections.map(s=>+s.dataset.min||Math.max(1,Math.round(s.textContent.split(/\s+/).length/130+$$(".demo",s).length)));
$("#toc").innerHTML=sections.map((s,i)=>`<li><a href="#${s.id}" title="≈${secMin[i]} хв"><span class="num">${String(i).padStart(2,"0")}</span>${esc(s.dataset.title)}</a></li>`).join("");
$("#toc").insertAdjacentHTML("beforebegin",'<div class="toc-head"><div class="toc-stat"><span id="tocRead"></span><span id="tocLeft"></span></div><div class="toc-bar"><i id="tocBar"></i></div><button type="button" id="progReset" title="Позначити всі розділи непрочитаними">↺ скинути прогрес</button></div>');
$(".topbar .spacer").insertAdjacentHTML("beforebegin",'<span class="readchip" id="readChip" title="Прочитано розділів"></span>');
const tocLinks=$$("#toc a");
function saveProg(){prog.read=[...readSet];prog.total=sections.length;store.set(progKey,JSON.stringify(prog))}
function renderProg(){
  const n=readSet.size,left=sections.reduce((a,s,i)=>a+(readSet.has(s.id)?0:secMin[i]),0);
  tocLinks.forEach((a,i)=>a.classList.toggle("read",readSet.has(sections[i].id)));
  $("#tocRead").textContent=`Прочитано ${n}/${sections.length}`;
  $("#tocLeft").textContent=left?`≈${left} хв`:"✓ усе";
  $("#tocBar").style.width=n/sections.length*100+"%";
  $("#readChip").textContent=`${n}/${sections.length}`;
}
$("#progReset").onclick=()=>{readSet.clear();prog.last=0;saveProg();renderProg()};
let lastCur=-1;
function updateShell(){
  const max=root.scrollHeight-root.clientHeight;
  $("#progress").style.width=(max>0?window.scrollY/max*100:0)+"%";
  let cur=0;for(const [i,s] of sections.entries()){if(s.getBoundingClientRect().top<=140)cur=i}
  tocLinks.forEach((a,i)=>a.classList.toggle("active",i===cur));
  let changed=false;
  sections.forEach(s=>{if(!readSet.has(s.id)&&s.getBoundingClientRect().bottom<=innerHeight+4){readSet.add(s.id);changed=true}});
  if(cur!==lastCur){const first=lastCur<0;lastCur=cur;if(!first){prog.last=cur;changed=true}}  // перший виклик при завантаженні не затирає збережене місце
  if(changed){saveProg();renderProg()}
}
// «Продовжити з того місця»: якщо сторінку відкрито з початку, а раніше читали далі.
function offerResume(){
  const i=prog.last;if(location.hash||!(i>0&&i<sections.length)||window.scrollY>50)return;
  const t=document.createElement("div");t.className="resume";t.setAttribute("role","status");
  t.innerHTML=`<span>Ви зупинилися на розділі «${esc(sections[i].dataset.title)}»</span><button class="btn go" type="button">Продовжити →</button><button class="btn x" type="button" aria-label="Закрити">×</button>`;
  const close=()=>t.remove();
  $(".go",t).onclick=()=>{sections[i].scrollIntoView({behavior:"smooth"});close()};$(".x",t).onclick=close;
  document.body.append(t);setTimeout(()=>addEventListener("scroll",function h(){if(window.scrollY>innerHeight){close();removeEventListener("scroll",h)}},{passive:true}),300);
}
addEventListener("scroll",updateShell,{passive:true});addEventListener("resize",()=>{updateShell();redrawAll()});
function setLecture(on){root.classList.toggle("lecture",on);$("#lectureBtn").setAttribute("aria-pressed",String(on));store.set("lecture",on?"1":"0");setTimeout(()=>{updateShell();redrawAll()},50)}
$("#lectureBtn").onclick=()=>setLecture(!root.classList.contains("lecture"));
// Тема: доки користувач не клацнув, сторінка слідує системній; клік перемикає темна ↔ світла.
const darkMQ=matchMedia("(prefers-color-scheme: dark)");
const curTheme=()=>root.getAttribute("data-theme")||(darkMQ.matches?"dark":"light");
function setTheme(t){if(t)root.setAttribute("data-theme",t);else root.removeAttribute("data-theme");store.set("theme",t);$("#themeBtn").textContent="◐ Тема"+(t?": "+(t==="dark"?"темна":"світла"):"");setTimeout(redrawAll,30)}
$("#themeBtn").onclick=()=>setTheme(curTheme()==="dark"?"light":"dark");
darkMQ.addEventListener("change",()=>setTimeout(redrawAll,30));
addEventListener("keydown",e=>{
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||e.metaKey||e.ctrlKey||e.altKey)return;
  const cur=Math.max(0,sections.findIndex((s,i)=>tocLinks[i].classList.contains("active")));
  if(e.key==="ArrowRight"||e.key==="PageDown"){e.preventDefault();sections[Math.min(cur+1,sections.length-1)].scrollIntoView({behavior:"smooth"})}
  else if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();sections[Math.max(cur-1,0)].scrollIntoView({behavior:"smooth"})}
  else if(e.key==="l"||e.key==="L")setLecture(!root.classList.contains("lecture"));
  else if(e.key==="t"||e.key==="T")$("#themeBtn").click();
});

/* ===================== quiz + code highlight ===================== */
// <div class="quiz" data-ans="N"> — N: номер правильної відповіді серед .opt, з нуля.
// Відповіді зберігаються в localStorage ("quiz:<файл>"), щоб їх бачила сторінка index.html.
// Необов'язкова перевірка посеред лекції: <details class="check"><summary>Перевір себе</summary> .quiz… </details>.
// Згорнута за замовчуванням і на прогрес читання не впливає.
const quizzes=$$(".quiz"),quizKey="quiz:"+PAGE;
let quizState={};try{quizState=JSON.parse(store.get(quizKey)||"{}").answers||{}}catch(e){}
const qid=(qz,i)=>qz.dataset.id||String(i);
const plQ=n=>n+" "+(n%10>=1&&n%10<=4&&!(n%100>=11&&n%100<=14)?"питання":"питань");
function showAnswer(qz,pick){const ans=+qz.dataset.ans,opts=$$(".opt",qz);qz.classList.add("done");opts[pick]?.classList.add(pick===ans?"ok":"no");opts[ans].classList.add("ok")}
function quizStats(list=quizzes){let done=0,ok=0;list.forEach(qz=>{const p=quizState[qid(qz,quizzes.indexOf(qz))];if(p!==undefined){done++;if(p===+qz.dataset.ans)ok++}});return{done,ok,total:list.length}}
function renderQuizMeta(){
  const st=quizStats();
  store.set(quizKey,JSON.stringify({answers:quizState,ok:st.ok,done:st.done,total:st.total}));
  $$("details.check").forEach(d=>{const s=quizStats($$(".quiz",d)),el=$(".check-status",d);
    if(el)el.textContent=s.done?`${s.ok}/${s.total} правильно`:plQ(s.total)+" · необов'язково";d.classList.toggle("passed",s.done===s.total&&s.ok===s.total)});
  const box=$("#quizScore");if(box){
    box.querySelector(".qs-text").innerHTML=st.done?`Правильно <b>${st.ok}</b> з ${st.done} відповідей · усього в лекції ${plQ(st.total)}`:`Усього в лекції ${plQ(st.total)}. Відповіді зберігаються в цьому браузері.`;
    box.querySelector("button").hidden=!st.done}
}
quizzes.forEach((qz,i)=>{
  const id=qid(qz,i);if(quizState[id]!==undefined)showAnswer(qz,quizState[id]);
  $$(".opt",qz).forEach((b,j)=>b.addEventListener("click",()=>{if(qz.classList.contains("done"))return;quizState[id]=j;showAnswer(qz,j);renderQuizMeta()}))});
$$("details.check").forEach(d=>{const sm=$("summary",d);if(sm&&!$(".check-status",sm))sm.insertAdjacentHTML("beforeend",'<span class="check-status"></span>')});
if(quizzes.length){
  const last=sections[sections.length-1],lastQ=$$(".quiz",last).pop();
  const box=document.createElement("div");box.className="quiz-score";box.id="quizScore";
  box.innerHTML='<span class="qs-text"></span><button class="btn" type="button">↺ Скинути відповіді</button>';
  box.querySelector("button").onclick=()=>{quizState={};quizzes.forEach(qz=>{qz.classList.remove("done");$$(".opt",qz).forEach(b=>b.classList.remove("ok","no"))});renderQuizMeta()};
  if(lastQ)lastQ.after(box);else last.append(box);
  renderQuizMeta();
}
$$("code.py").forEach(hlPy);

/* ===================== glossary ===================== */
// <span class="term" data-g="ключ">слово у будь-якій формі</span>: визначення береться з glossary.js.
// Підказка з'являється при наведенні, фокусі (Tab) чи дотику і веде до лекції, де термін пояснено,
// та до glossary.html. <span class="term" title="…"> лишається для приміток, яких немає в глосарії.
const gloss=typeof GLOSSARY==="object"?GLOSSARY:{};
const glossTip=document.createElement("div");glossTip.className="gloss-tip";glossTip.id="glossTip";glossTip.setAttribute("role","tooltip");glossTip.hidden=true;
document.body.append(glossTip);
let glossFor=null,glossTimer=0;
function glossShow(el){
  clearTimeout(glossTimer);if(glossFor===el&&!glossTip.hidden)return;
  const k=el.dataset.g,g=gloss[k],[file,hash]=g.src.split("#"),here=file===PAGE;
  const more=here&&el.closest("section.slide")?.id===hash?"":`<a href="${here?"#"+hash:g.src}">Докладніше ${here?"в цій лекції":"в лекції "+file.slice(0,2)} →</a>`;
  glossTip.innerHTML=`<div class="gt-h"><b>${g.term}</b>${g.en&&g.en!==g.term?` · <span>${g.en}</span>`:""}</div><p>${g.def}</p><div class="gt-l">${more}<a href="glossary.html#${k}">Глосарій</a></div>`;
  glossFor?.classList.remove("on");glossFor=el;el.classList.add("on");el.setAttribute("aria-describedby","glossTip");
  glossTip.hidden=false;
  const r=el.getBoundingClientRect(),w=glossTip.offsetWidth,h=glossTip.offsetHeight;
  const left=Math.max(12,Math.min(r.left,root.clientWidth-w-12)),below=r.bottom+8+h<=innerHeight||r.top-8-h<0;
  glossTip.style.left=left+scrollX+"px";glossTip.style.top=(below?r.bottom+8:r.top-8-h)+scrollY+"px";
}
function glossHide(){clearTimeout(glossTimer);glossTip.hidden=true;if(glossFor){glossFor.classList.remove("on");glossFor.removeAttribute("aria-describedby");glossFor=null}}
const glossLater=()=>{clearTimeout(glossTimer);glossTimer=setTimeout(()=>{if(!glossTip.contains(document.activeElement))glossHide()},180)};
$$(".term[data-g]").forEach(el=>{
  if(!gloss[el.dataset.g]){console.warn("glossary.js: немає терміна",el.dataset.g);return}
  el.removeAttribute("title");el.tabIndex=0;
  el.addEventListener("mouseenter",()=>glossShow(el));el.addEventListener("mouseleave",glossLater);
  el.addEventListener("focus",()=>glossShow(el));el.addEventListener("blur",glossLater);
  el.addEventListener("click",()=>glossShow(el));  // дотик на телефоні
});
glossTip.addEventListener("mouseenter",()=>clearTimeout(glossTimer));glossTip.addEventListener("mouseleave",glossLater);
glossTip.addEventListener("focusout",glossLater);
document.addEventListener("click",e=>{if(glossFor&&!glossTip.contains(e.target)&&!e.target.closest(".term[data-g]"))glossHide()});
addEventListener("keydown",e=>{if(e.key==="Escape"&&glossFor)glossHide()});
glossTip.addEventListener("click",e=>{if(e.target.closest("a"))glossHide()});
let glossW=root.clientWidth;addEventListener("resize",()=>{if(root.clientWidth!==glossW){glossW=root.clientWidth;glossHide()}});  // на телефоні resize стріляє і від панелі адреси
$("#toc").insertAdjacentHTML("afterend",'<a class="toc-gloss" href="glossary.html">Глосарій термінів →</a>');

if(store.get("lecture")==="1")setLecture(true);
setTheme(store.get("theme")||"");
renderProg();updateShell();offerResume();
