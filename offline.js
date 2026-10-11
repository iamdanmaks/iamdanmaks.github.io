/* =====================================================================
   Офлайн-доступ. Підключається на кожній сторінці (не залежить від common.js).
   Опис: AGENTS.md, «Офлайн».
   - реєструє sw.js, який видає сторінки з кешу, коли немає інтернету;
   - раз на годину (і одразу при першому відвідуванні) зберігає в кеш усі лекції
     з карток index.html, глосарій, їхні скрипти й стилі, шрифти й таймінги озвучки;
   - показує в шапці позначку «Офлайн», коли зв'язку немає;
   - дає index.html функції для завантаження озвучки: window.offline.
   Нічого реєструвати не треба: нова лекція потрапляє в кеш, щойно її картка є в index.html.
   ===================================================================== */
(function(){
const CORE="nlp-core",AUDIO="nlp-audio",SYNC_EVERY=3600e3,BPS=12000; // mp3 96 кбіт/с = 12000 байт/с
const FONT_SUBSETS=/^(cyrillic|cyrillic-ext|latin|latin-ext|greek)$/; // greek: α, Σ, θ у формулах
const ok="serviceWorker" in navigator&&window.isSecureContext&&"caches" in window;
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const BASE=new URL("./",location.href).href;
const PAGE_IS_INDEX=/(^|\/)(index\.html)?$/.test(location.pathname);
const abs=u=>new URL(u,BASE).href;
// Ключ кешу той самий, що в sw.js: без ?query, тека — як index.html.
function key(u){const url=new URL(u,BASE);url.search="";url.hash="";if(url.pathname.endsWith("/"))url.pathname+="index.html";return url.href}

/* ---------- позначка «Офлайн» у шапці ---------- */
const bar=document.querySelector(".topbar .spacer");
if(bar){
  const chip=document.createElement("span");chip.className="netchip";chip.textContent="Офлайн";
  chip.title="Немає інтернету. Збережені лекції, демо й тести працюють як звичайно.";
  bar.after(chip);
  const upd=()=>chip.hidden=navigator.onLine;upd();
  addEventListener("online",upd);addEventListener("offline",upd);
}

if(!ok){window.offline={supported:false};return}
navigator.serviceWorker.register("sw.js").catch(e=>console.warn("offline: sw.js",e));

/* ---------- каталог сайту ---------- */
async function getText(url,save){
  const r=await fetch(url,{cache:save?"no-cache":"default"});
  if(!r.ok)throw new Error(url+": "+r.status);
  if(save)await (await caches.open(CORE)).put(key(url),r.clone());
  return r.text();
}
const parse=h=>new DOMParser().parseFromString(h,"text/html");
// Таймінги: (window.narrData=…)["audio/…/sN"]={…json…};
function parseCues(t){const i=t.indexOf("]=");return JSON.parse(t.slice(i+2).trim().replace(/;$/,""))}

// Лекції з карток index.html, їхні файли й озвучка. save=true: усе по дорозі кладемо в кеш.
async function catalog(save){
  const idxHtml=PAGE_IS_INDEX&&!save?document.documentElement.outerHTML:await getText(abs("index.html"),save);
  const idx=parse(idxHtml);
  const lectures=[...idx.querySelectorAll("a.lcard")].map(a=>({href:abs(a.getAttribute("href").split("#")[0]),
    num:(a.querySelector(".num")||{}).textContent||"",title:(a.querySelector("h2")||{}).textContent||"",narr:[]}));
  const assets=new Set(),fonts=new Set();
  const scan=doc=>{
    doc.querySelectorAll("script[src],link[href]").forEach(n=>{
      const rel=n.getAttribute("rel")||"";if(n.tagName==="LINK"&&!/stylesheet|icon|manifest/.test(rel))return;
      const u=new URL(n.getAttribute("src")||n.getAttribute("href"),BASE);
      if(u.origin===location.origin)assets.add(key(u.href));else if(u.hostname==="fonts.googleapis.com")fonts.add(u.href)});
  };
  scan(idx);
  const other=[abs("glossary.html")];
  await Promise.all(other.map(async u=>scan(parse(await getText(u,save)))));
  await Promise.all(lectures.map(async l=>{
    const doc=parse(await getText(l.href,save));scan(doc);
    l.narr=[...doc.querySelectorAll("section[data-narr]")].map(s=>({id:s.id,path:s.dataset.narr}));
    await Promise.all(l.narr.map(async n=>{
      const d=parseCues(await getText(abs(n.path+".cues.js"),save));
      n.url=abs(d.audio)+(d.hash?"?v="+d.hash:"");n.bytes=Math.round(d.duration*BPS);
    }));
    l.bytes=l.narr.reduce((a,n)=>a+n.bytes,0);
  }));
  return {lectures,assets,fonts};
}

/* ---------- синхронізація ---------- */
let syncing=null;
async function sync(){
  const cache=await caches.open(CORE);
  const cat=await catalog(true);
  // Спільні файли (common.*, glossary.js, narration.js, іконки, маніфест).
  await Promise.all([...cat.assets].map(async u=>{const r=await fetch(u,{cache:"no-cache"});if(r.ok)await cache.put(u,r)}));
  const man=[...cat.assets].find(u=>u.endsWith(".webmanifest"));
  if(man)try{const m=await (await cache.match(man)).json();
    await Promise.all((m.icons||[]).map(async i=>{const u=key(new URL(i.src,man).href),r=await fetch(u);if(r.ok)await cache.put(u,r)}))}catch(e){}
  // Шрифти: CSS з Google Fonts і файли woff2 лише для потрібних алфавітів (FONT_SUBSETS).
  for(const css of cat.fonts){
    let txt=null;const have=await cache.match(css);
    if(have)txt=await have.text();
    else{const r=await fetch(css,{mode:"cors",credentials:"omit"});if(!r.ok)continue;txt=await r.clone().text();await cache.put(css,r)}
    const urls=[...txt.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{[^}]*?url\((https:[^)]+)\)/g)].filter(m=>FONT_SUBSETS.test(m[1])).map(m=>m[2]);
    // Один змінний шрифт обслуговує кілька накреслень, тож адреси повторюються.
    const uniq=[...new Set(urls)];
    await Promise.all(uniq.map(async u=>{if(await cache.match(u))return;const r=await fetch(u,{mode:"cors",credentials:"omit"});if(r.ok)await cache.put(u,r)}));
  }
  // Озвучка, яку студент уже завантажив, але яку відтоді перезаписали: качаємо нову версію.
  const have=await audioKeys();
  for(const l of cat.lectures)for(const n of l.narr)
    if(!have.has(n.url)&&[...have].some(u=>samePath(u,n.url)))await saveAudio(n).catch(()=>{});
  ls.set("offline:sync",String(Date.now()));
  return cat;
}
function startSync(force){
  if(syncing)return syncing;
  const last=+ls.get("offline:sync")||0;
  if(!force&&(!navigator.onLine||Date.now()-last<SYNC_EVERY))return null;
  syncing=sync().catch(e=>{console.warn("offline: sync",e);throw e}).finally(()=>{syncing=null;fire()});
  fire();return syncing;
}

/* ---------- озвучка ---------- */
const samePath=(a,b)=>new URL(a).pathname===new URL(b).pathname;
async function audioKeys(){return new Set((await (await caches.open(AUDIO)).keys()).map(r=>r.url))}
// Повний файл без Range, з лічильником байтів для прогресу. Старі версії того самого файлу видаляємо.
async function saveAudio(n,onBytes){
  const r=await fetch(n.url,{cache:"no-cache"});
  if(!r.ok||r.status!==200)throw new Error(n.url+": "+r.status);
  const chunks=[];
  if(r.body&&onBytes){const rd=r.body.getReader();for(;;){const {done,value}=await rd.read();if(done)break;chunks.push(value);onBytes(value.length)}}
  else chunks.push(await r.arrayBuffer());
  const cache=await caches.open(AUDIO);
  await cache.put(n.url,new Response(new Blob(chunks,{type:"audio/mpeg"}),{headers:{"Content-Type":"audio/mpeg"}}));
  for(const req of await cache.keys())if(req.url!==n.url&&samePath(req.url,n.url))await cache.delete(req);
}
async function download(l,onProgress){
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
  const have=await audioKeys();let done=l.narr.filter(n=>have.has(n.url)).reduce((a,n)=>a+n.bytes,0);
  onProgress&&onProgress(done,l.bytes);
  for(const n of l.narr){if(have.has(n.url))continue;
    let got=0;await saveAudio(n,b=>{got+=b;onProgress&&onProgress(done+Math.min(got,n.bytes),l.bytes)});done+=n.bytes}
  fire();
}
async function remove(l){
  const cache=await caches.open(AUDIO),dir=new URL(l.narr[0].url).pathname.replace(/[^/]+$/,"");
  for(const req of await cache.keys())if(new URL(req.url).pathname.startsWith(dir))await cache.delete(req);
  fire();
}
async function status(l){const have=await audioKeys();return l.narr.filter(n=>have.has(n.url)).length}

/* ---------- API для index.html ---------- */
const subs=[];function fire(){subs.forEach(f=>f())}
window.offline={supported:true,catalog:async()=>{if(syncing)try{return await syncing}catch(e){}return catalog(false)},download,remove,status,
  sync:()=>startSync(true),get syncing(){return !!syncing},get lastSync(){return +ls.get("offline:sync")||0},
  onChange:f=>subs.push(f),bytes:BPS};

// Даємо сторінці спершу домалюватися, потім тихо зберігаємо сайт.
addEventListener("load",()=>setTimeout(()=>{const p=startSync(false);if(p)p.catch(()=>{})},1500));
addEventListener("online",()=>{const p=startSync(false);if(p)p.catch(()=>{})});
})();
