/* =====================================================================
   Спільний каркас лекцій з NLP: хелпери, зміст, прогрес, режим лекції,
   тема, клавіатура, тести, підсвітка Python.
   Підключення: <script src="common.js"></script> наприкінці <body>,
   перед власним <script> лекції. Опис: FORMAT.md.
   ===================================================================== */

/* ===================== helpers ===================== */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):"—";
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const root=document.documentElement;
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
$("#toc").innerHTML=sections.map((s,i)=>`<li><a href="#${s.id}"><span class="num">${String(i).padStart(2,"0")}</span>${esc(s.dataset.title)}</a></li>`).join("");
const tocLinks=$$("#toc a");
function updateShell(){
  const max=root.scrollHeight-root.clientHeight;
  $("#progress").style.width=(max>0?window.scrollY/max*100:0)+"%";
  let cur=0;for(const [i,s] of sections.entries()){if(s.getBoundingClientRect().top<=140)cur=i}
  tocLinks.forEach((a,i)=>a.classList.toggle("active",i===cur));
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
// <div class="quiz" data-ans="N"> — N: номер правильної відповіді серед .opt, з нуля
$$(".quiz").forEach(qz=>{const ans=+qz.dataset.ans;$$(".opt",qz).forEach((b,i)=>b.addEventListener("click",()=>{if(qz.classList.contains("done"))return;qz.classList.add("done");b.classList.add(i===ans?"ok":"no");$$(".opt",qz)[ans].classList.add("ok")}))});
$$("code.py").forEach(hlPy);

if(store.get("lecture")==="1")setLecture(true);
setTheme(store.get("theme")||"");
updateShell();
