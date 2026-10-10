/* =====================================================================
   Озвучені розділи. Підключається після common.js. Опис: FORMAT.md, «Озвучка».
   Розділ з атрибутом data-narr="audio/<лекція>/<розділ>" отримує кнопку
   «Послухати розділ». Звук і таймінги генерує tools/narrate.py.
   Дії під час відтворення:
     hl|селектор          підсвітити елемент і прокрутити до нього
     unhl                 зняти підсвітку
     set|селектор|v|мс    плавно пересунути повзунок (з подією input)
     click|селектор       натиснути кнопку
     call|хук|аргументи…  викликати narrHooks[хук](…аргументи, мс) з демо лекції
   Селектори шукаються всередині розділу.
   ===================================================================== */
(function(){
const hooks=window.narrHooks=window.narrHooks||{};
document.head.insertAdjacentHTML("beforeend",`<style>
.narr-play{float:right;margin:0 0 8px 12px;font-size:.8em}
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
  else if(act==="click"){const el=q(args[0]);if(el)el.click()}
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

function play(){audio.play();ppBtn.innerHTML=ICON.pause;cancelAnimationFrame(raf);raf=requestAnimationFrame(tick)}
function pause(msg){audio.pause();cancelAnimationFrame(raf);ppBtn.innerHTML=ICON.play;if(msg)cap.textContent=msg}
function stop(){pause();unhl();bar.hidden=true;sec=null}
function start(s){
  const d=window.narrData&&window.narrData[s.dataset.narr];if(!d)return;
  if(sec)stop();
  sec=s;data=d;next=0;audio.src=d.audio;bar.hidden=false;buildTx();
  seek(0);play();
}

ppBtn.onclick=()=>{if(audio.ended){seek(0);play()}else if(audio.paused)play();else pause()};
$(".narr-x",bar).onclick=stop;
$(".narr-track",bar).onclick=e=>{const r=e.currentTarget.getBoundingClientRect();seek((e.clientX-r.left)/r.width*data.duration);};
const rates=[1,1.25,1.5,0.85];
rateBtn.onclick=()=>{const r=rates[(rates.indexOf(audio.playbackRate)+1)%rates.length];audio.playbackRate=r;rateBtn.textContent=r+"×"};
audio.addEventListener("ended",()=>{unhl();ppBtn.innerHTML=ICON.again;cap.textContent="Кінець розділу. Тепер спробуйте демо самі."});
addEventListener("keydown",e=>{if(bar.hidden||e.key!==" "||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName))return;e.preventDefault();ppBtn.click()});
// Студент сам торкнувся демо — віддаємо керування і ставимо на паузу.
document.addEventListener("pointerdown",e=>{if(sec&&!audio.paused&&e.isTrusted&&e.target.closest(".demo")&&sec.contains(e.target))pause("Пауза: ви взяли демо в руки. Натисніть кнопку відтворення, щоб продовжити.")});

$$("section[data-narr]").forEach(s=>{
  const b=document.createElement("button");b.className="btn narr-play";b.textContent="🔊 Послухати розділ";b.hidden=true;
  b.onclick=()=>start(s);s.prepend(b);
  const sc=document.createElement("script");sc.src=s.dataset.narr+".cues.js";
  sc.onload=()=>{const d=window.narrData[s.dataset.narr];b.textContent=`🔊 Послухати розділ · ${fmtT(d.duration)}`;b.hidden=false};
  document.body.append(sc);
});
})();
