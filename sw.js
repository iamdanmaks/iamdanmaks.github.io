/* =====================================================================
   Service worker: сайт працює без інтернету. Опис: AGENTS.md, «Офлайн».
   Кеші заповнює offline.js зі сторінки, тут ми лише видаємо відповіді.
     nlp-core   сторінки, скрипти, стилі, іконки, шрифти, таймінги озвучки (.cues.js)
     nlp-audio  mp3 озвучки, лише ті лекції, які студент завантажив сам
   Стратегії:
     свої файли  спершу мережа; якщо за 3 с відповіді немає, а копія є, віддаємо копію,
                 а свіжа версія тихо лягає в кеш до наступного відкриття
     шрифти      спершу кеш
     mp3         з кешу за точною адресою (з ?v=<hash>), з підтримкою Range;
                 без копії йдемо в мережу й нічого не кешуємо
   Назви кешів не змінюйте: інакше в студентів зникне вже завантажена озвучка.
   ===================================================================== */
const CORE="nlp-core",AUDIO="nlp-audio",TIMEOUT=3000;

self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil((async()=>{
  for(const k of await caches.keys())if(k!==CORE&&k!==AUDIO)await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    if(url.pathname.endsWith(".mp3"))e.respondWith(audio(req));
    else if(!url.pathname.endsWith(".align.json"))e.respondWith(networkFirst(e));
  }else if(url.hostname==="fonts.googleapis.com"||url.hostname==="fonts.gstatic.com")e.respondWith(cacheFirst(req));
});

// Ключ кешу: адреса без ?query, а тека — як її index.html. offline.js рахує ключі так само.
function key(u){const url=new URL(u);url.search="";url.hash="";if(url.pathname.endsWith("/"))url.pathname+="index.html";return url.href}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

async function networkFirst(e){
  const req=e.request,cache=await caches.open(CORE),k=key(req.url);
  const cached=await cache.match(k);
  const net=fetch(req).then(res=>{
    if(res.ok&&res.type==="basic"&&!res.redirected&&res.status===200)e.waitUntil(cache.put(k,res.clone()));
    return res});
  if(cached){
    e.waitUntil(net.catch(()=>{}));
    return Promise.race([net.then(res=>res.ok?res:cached,()=>cached),wait(TIMEOUT).then(()=>cached)]);
  }
  try{return await net}catch(err){if(req.mode==="navigate")return offlinePage();throw err}
}

async function cacheFirst(req){
  const cache=await caches.open(CORE),cached=await cache.match(req.url);
  if(cached)return cached;
  // Запит із режимом cors, щоб не зберігати «непрозору» відповідь: її браузер рахує як кілька МБ квоти.
  const res=await fetch(req.url,{mode:"cors",credentials:"omit"});
  if(res.ok)await cache.put(req.url,res.clone());
  return res;
}

async function audio(req){
  const res=await (await caches.open(AUDIO)).match(req.url);
  return res?ranged(req,res):fetch(req);
}
// <audio> просить файл шматками (Range). Safari без відповіді 206 звук не грає.
async function ranged(req,res){
  const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range")||"");
  if(!m)return res;
  const blob=await res.blob(),size=blob.size;
  let start,end;
  if(m[1]===""){start=Math.max(0,size-(+m[2]));end=size-1}
  else{start=+m[1];end=m[2]?Math.min(+m[2],size-1):size-1}
  if(start>=size||start>end)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${size}`}});
  return new Response(blob.slice(start,end+1),{status:206,headers:{
    "Content-Type":res.headers.get("Content-Type")||"audio/mpeg","Content-Range":`bytes ${start}-${end}/${size}`,
    "Content-Length":String(end-start+1),"Accept-Ranges":"bytes"}});
}

function offlinePage(){
  return new Response(`<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Немає з'єднання</title>
<style>body{margin:0;padding:48px 16px;font:17px/1.55 system-ui,sans-serif;background:#eef1f5;color:#141922}main{max-width:560px;margin:0 auto}a{color:#2a78d6}
@media (prefers-color-scheme:dark){body{background:#0f1218;color:#eef1f5}a{color:#3987e5}}</style>
<main><h1>Немає з'єднання</h1><p>Цієї сторінки ще немає на пристрої, а інтернету зараз немає.</p>
<p>Лекції, які вже збережено, відкриваються й без зв'язку: <a href="./index.html">перейти до списку лекцій</a>.</p></main></html>`,
    {headers:{"Content-Type":"text/html; charset=utf-8"}});
}
