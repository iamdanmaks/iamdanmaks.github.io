/* =====================================================================
   Озвучені розділи. Підключається після common.js. Опис: AGENTS.md, «Narration».
   Розділ з атрибутом data-narr="audio/<лекція>/<розділ>" отримує кнопку
   «Послухати розділ». Звук і таймінги генерує tools/narrate.py.
   Дії під час відтворення:
     hl|селектор          підсвітити елемент і прокрутити до нього
     unhl                 зняти підсвітку
     set|селектор|v|мс    плавно пересунути повзунок (з подією input)
     click|селектор       натиснути кнопку (працює і для елементів SVG)
     check|селектор|0/1   поставити або зняти прапорець (з подією change)
     call|хук|аргументи…  викликати narrHooks[хук](…аргументи, мс) з демо лекції
   Селектори шукаються всередині розділу.
   ===================================================================== */
(function(){
const hooks=window.narrHooks=window.narrHooks||{};
document.head.insertAdjacentHTML("beforeend",`<style>
.narr-play{float:right;margin:0 0 8px 12px;font-size:.8em}
.narr-tip{position:absolute;z-index:40;width:max-content;max-width:min(360px,calc(100vw - 24px));background:var(--surface);border:1px solid var(--line);border-top:3px solid var(--violet);border-radius:var(--radius);box-shadow:var(--shadow);padding:10px 14px 12px;font-size:.86rem;line-height:1.5;color:var(--ink-2)}
.narr-tip[hidden]{display:none}
.lecture .narr-tip{font-size:1rem;max-width:min(420px,calc(100vw - 24px))}
.narr-tip b{color:var(--ink);font-weight:600}
.narr-tip p{margin:4px 0 6px}
.narr-tip ul{margin:0;padding-left:1.1em}
.narr-tip li{margin:2px 0}
.narr-hl{outline:3px solid var(--violet);outline-offset:5px;border-radius:var(--radius);box-shadow:0 0 0 10px color-mix(in srgb,var(--violet) 12%,transparent);transition:outline-color .3s,box-shadow .3s}
.narr-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(760px,calc(100vw - 24px));z-index:100;display:flex;gap:10px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;box-shadow:0 8px 30px rgba(0,0,0,.18);font-size:16px}
.narr-bar{flex-direction:column;align-items:stretch}
.narr-bar[hidden]{display:none}
.narr-row{display:flex;gap:10px;align-items:center}
.narr-tx{display:none;max-height:34vh;overflow-y:auto;padding:4px 6px 10px;margin-bottom:8px;border-bottom:1px solid var(--line-soft);font-size:.95em;line-height:1.6;color:var(--muted)}
.narr-bar.tx .narr-tx{display:block}
.narr-bar.tx .narr-cap{display:none}
.narr-tx p{margin:0 0 .7em}
.narr-tx span{cursor:pointer;border-radius:4px;transition:color .15s,background .15s}
.narr-tx span:hover{text-decoration:underline}
.narr-tx .said{color:var(--ink)}
.narr-tx .on{color:var(--hl-ink);background:var(--hl)}
.narr-mid{flex:1;min-width:0}
.narr-cap{color:var(--ink);line-height:1.4;min-height:2.8em;font-size:.95em}
.narr-track{height:5px;background:var(--surface-2);border-radius:3px;margin-top:6px;cursor:pointer}
.narr-fill{height:100%;width:0;background:var(--violet);border-radius:3px}
.narr-bar .btn{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:38px}
@media (max-width:600px){.narr-bar{font-size:14px;gap:6px;padding:8px}.narr-cap{min-height:4.2em}.narr-row{gap:6px}.narr-tx{max-height:30vh}}
</style>`);

const bar=document.createElement("div");bar.className="narr-bar";bar.hidden=true;
bar.innerHTML=`<div class="narr-tx"></div><div class="narr-row"><button class="btn narr-pp" title="Пауза / продовжити (пробіл)"></button><div class="narr-mid"><div class="narr-cap"></div><div class="narr-track"><div class="narr-fill"></div></div></div><button class="btn narr-tx-btn" title="Показати весь текст озвучки" aria-pressed="false">Текст</button><button class="btn narr-rate" title="Швидкість">1×</button><button class="btn narr-x" title="Зупинити">✕</button></div>`;
document.body.append(bar);
const ICON={pause:`<svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="1" width="3" height="10" fill="currentColor"/><rect x="7" y="1" width="3" height="10" fill="currentColor"/></svg>`,play:`<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 1 L11 6 L2.5 11 Z" fill="currentColor"/></svg>`,again:`<svg width="12" height="12" viewBox="0 0 12 12"><path d="M10 6 A4 4 0 1 1 8.8 3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 1 L10.5 2.6 L8.4 5.6 Z" fill="currentColor"/></svg>`};
const ppBtn=$(".narr-pp",bar),cap=$(".narr-cap",bar),fill=$(".narr-fill",bar),rateBtn=$(".narr-rate",bar),tx=$(".narr-tx",bar),txBtn=$(".narr-tx-btn",bar);

const audio=new Audio();
let data=null,sec=null,next=0,raf=0,hlEl=null,spans=[],cur=-1,userScroll=-1e9;
const anims={};
const fmtT=s=>Math.floor(s/60)+":"+String(Math.round(s%60)).padStart(2,"0");

function unhl(){if(hlEl)hlEl.classList.remove("narr-hl");hlEl=null}
function show(el,instant){
  const r=el.getBoundingClientRect(),top=70,bottom=innerHeight-bar.offsetHeight-28;
  if(r.top>=top&&r.bottom<=bottom)return;
  const y=scrollY+r.top-(r.height<bottom-top?(top+bottom-r.height)/2:top);
  scrollTo({top:y,behavior:instant?"auto":"smooth"});
}
function setRange(el,v,ms){
  cancelAnimationFrame(anims[el.id]);
  const a=+el.value,t0=performance.now();
  const step=t=>{const k=ms>0?Math.min(1,(t-t0)/ms):1,e=k<.5?2*k*k:1-(-2*k+2)**2/2;
    el.value=a+(v-a)*e;el.dispatchEvent(new Event("input",{bubbles:true}));if(k<1)anims[el.id]=requestAnimationFrame(step)};
  step(t0);
}
function run([act,...args],instant){
  const q=s=>{const el=sec.querySelector(s);if(!el)console.warn("narr: no element",s);return el};
  if(act==="hl"){const el=q(args[0]);unhl();if(el){el.classList.add("narr-hl");hlEl=el;show(el,instant)}}
  else if(act==="unhl")unhl();
  else if(act==="set"){const el=q(args[0]);if(el)setRange(el,+args[1],instant?0:+(args[2]||600))}
  else if(act==="click"){const el=q(args[0]);if(el){if(typeof el.click==="function")el.click();else el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window}))}}
  else if(act==="check"){const el=q(args[0]),on=args[1]!=="0";if(el&&el.checked!==on){el.checked=on;el.dispatchEvent(new Event("change",{bubbles:true}))}}
  else if(act==="call"){const f=hooks[args[0]];if(!f)return console.warn("narr: no hook",args[0]);
    const xs=args.slice(1).map(Number);if(instant)xs[xs.length-1]=0;f(...xs)}
}
function tick(){
  cancelAnimationFrame(raf);const t=audio.currentTime;
  while(next<data.cues.length&&data.cues[next].t<=t)run(data.cues[next++].do,false);
  const c=data.captions.find(c=>t>=c.t&&t<c.end+.4)||data.captions.findLast(c=>c.t<=t);
  cap.textContent=c?c.text:"";
  fill.style.width=(t/data.duration*100)+"%";
  karaoke(t);
  if(!audio.paused)raf=requestAnimationFrame(tick);
}
// Транскрипт «караоке»: сказані слова яскравіші, поточне виділене маркером.
function buildTx(){
  let h="<p>";
  data.words.forEach(([t,,w],i)=>{h+=`<span data-i="${i}">${esc(w.trimEnd())}</span>`+(/\n\s*\n/.test(w)?"</p><p>":" ")});
  tx.innerHTML=h+"</p>";spans=$$("span",tx);cur=-1;
}
function karaoke(t){
  const w=data.words;let lo=0,hi=w.length-1,i=-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(w[m][0]<=t){i=m;lo=m+1}else hi=m-1}
  if(i===cur)return;
  if(i>cur)for(let k=Math.max(cur,0);k<i;k++)spans[k].classList.add("said");
  else for(let k=Math.max(i,0);k<=cur;k++)spans[k].classList.remove("said");
  if(cur>=0)spans[cur].classList.remove("on");
  cur=i;if(i<0)return;
  const sp=spans[i];sp.classList.add("on");
  if(bar.classList.contains("tx")&&performance.now()-userScroll>4000){
    const y=sp.offsetTop-tx.offsetTop,top=tx.scrollTop;
    if(y<top+20||y>top+tx.clientHeight*.6)tx.scrollTo({top:y-tx.clientHeight/3,behavior:"smooth"});
  }
}
function setTx(on){bar.classList.toggle("tx",on);txBtn.setAttribute("aria-pressed",String(on));store.set("narrTx",on?"1":"0");if(on&&data){cur=-1;spans.forEach(s=>s.classList.remove("said","on"));karaoke(audio.currentTime)}}
txBtn.onclick=()=>setTx(!bar.classList.contains("tx"));
tx.addEventListener("click",e=>{const sp=e.target.closest("span[data-i]");if(sp)seek(data.words[+sp.dataset.i][0])});
["wheel","touchmove"].forEach(ev=>tx.addEventListener(ev,()=>userScroll=performance.now(),{passive:true}));
setTx(store.get("narrTx")==="1");

// Перемотування: застосовуємо всі дії до цієї точки миттєво, щоб стан демо збігся з голосом.
function seek(t){audio.currentTime=t;next=0;unhl();
  while(next<data.cues.length&&data.cues[next].t<=t)run(data.cues[next++].do,true);tick()}

function play(){audio.play().catch(()=>{}); // помилку показує обробник "error"
  ppBtn.innerHTML=ICON.pause;cancelAnimationFrame(raf);raf=requestAnimationFrame(tick)}
function pause(msg){audio.pause();cancelAnimationFrame(raf);ppBtn.innerHTML=ICON.play;if(msg)cap.textContent=msg}
function stop(){pause();unhl();bar.hidden=true;sec=null}
function start(s){
  const d=window.narrData&&window.narrData[s.dataset.narr];if(!d)return;
  if(sec)stop();
  // ?v=<hash>: нова озвучка отримує нову адресу, тож sw.js не віддасть стару версію з кешу.
  sec=s;data=d;next=0;audio.src=d.audio+(d.hash?"?v="+d.hash:"");bar.hidden=false;buildTx();
  seek(0);play();
}

ppBtn.onclick=()=>{if(audio.ended){seek(0);play()}else if(audio.paused)play();else pause()};
$(".narr-x",bar).onclick=stop;
$(".narr-track",bar).onclick=e=>{const r=e.currentTarget.getBoundingClientRect();seek((e.clientX-r.left)/r.width*data.duration);};
const rates=[1,1.25,1.5,0.85];
rateBtn.onclick=()=>{const r=rates[(rates.indexOf(audio.playbackRate)+1)%rates.length];audio.playbackRate=r;rateBtn.textContent=r+"×"};
audio.addEventListener("error",()=>{if(!sec)return;pause();
  cap.innerHTML=navigator.onLine?"Не вдалося завантажити озвучку. Спробуйте ще раз.":'Без інтернету озвучка грає, лише якщо її завантажено на пристрій. Це можна зробити на <a href="./index.html#offline">головній сторінці</a>.'});
audio.addEventListener("ended",()=>{unhl();ppBtn.innerHTML=ICON.again;cap.textContent=sec&&$(".demo",sec)?"Кінець розділу. Тепер спробуйте демо самі.":"Кінець розділу."});
addEventListener("keydown",e=>{if(bar.hidden||e.key!==" "||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName))return;e.preventDefault();ppBtn.click()});
// Студент сам торкнувся демо — віддаємо керування і ставимо на паузу.
document.addEventListener("pointerdown",e=>{if(sec&&!audio.paused&&e.isTrusted&&e.target.closest(".demo")&&sec.contains(e.target))pause("Пауза: ви взяли демо в руки. Натисніть кнопку відтворення, щоб продовжити.")});

// Підказка до кнопки: це не просто озвучка тексту, а лектор, який веде розділом і керує демо.
const tip=document.createElement("div");tip.className="narr-tip";tip.id="narrTip";tip.setAttribute("role","tooltip");tip.hidden=true;
tip.innerHTML=`<b>Лектор проведе вас розділом</b><p>Це не просто озвучка тексту сторінки. Лектор пояснює ідею своїми словами, з прикладами, і веде вас розділом:</p><ul><li>підсвічує блок, про який зараз говорить, і сам прокручує сторінку;</li><li>показує, як працювати з демо: рухає повзунки, натискає кнопки й каже, на що дивитися;</li><li>торкніться демо, і лектор стане на паузу, поки ви пробуєте самі;</li><li>субтитри, повний текст, перемотування кліком по слову, швидкість.</li></ul>`;
document.body.append(tip);
let tipFor=null;
function tipShow(b){tipFor=b;tip.hidden=false;
  const r=b.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight,W=document.documentElement.clientWidth;
  const below=r.bottom+8+h<=innerHeight||r.top-8-h<0;
  tip.style.left=Math.max(12,Math.min(r.right-w,W-w-12))+scrollX+"px";tip.style.top=(below?r.bottom+8:r.top-8-h)+scrollY+"px"}
function tipHide(){tip.hidden=true;tipFor=null}
addEventListener("scroll",()=>{if(tipFor)tipHide()},{passive:true});

$$("section[data-narr]").forEach(s=>{
  const b=document.createElement("button");b.className="btn narr-play";b.textContent="🔊 Послухати розділ";b.hidden=true;
  b.setAttribute("aria-describedby","narrTip");
  b.addEventListener("mouseenter",()=>tipShow(b));b.addEventListener("mouseleave",tipHide);
  b.addEventListener("focus",()=>{if(b.matches(":focus-visible"))tipShow(b)});b.addEventListener("blur",tipHide);
  b.onclick=()=>{tipHide();start(s)};s.prepend(b);
  const sc=document.createElement("script");sc.src=s.dataset.narr+".cues.js";
  sc.onload=()=>{const d=window.narrData[s.dataset.narr];b.textContent=`🔊 Послухати розділ · ${fmtT(d.duration)}`;b.hidden=false};
  document.body.append(sc);
});
})();
