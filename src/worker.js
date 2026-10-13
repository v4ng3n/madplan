const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const VALID_DAYS=["Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag","Søndag"];
async function ensureTables(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS checklist (week TEXT NOT NULL,item_id TEXT NOT NULL,checked INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (week,item_id))").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK (id=1),selected_days TEXT NOT NULL,day_requests TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 try{await env.DB.prepare("ALTER TABLE preferences ADD COLUMN day_requests TEXT NOT NULL DEFAULT '{}'").run()}catch{}
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS manual_items (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,checked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
async function checklistGet(request,env){const week=new URL(request.url).searchParams.get("week");if(!week)return json({error:"week is required"},400);const r=await env.DB.prepare("SELECT item_id,checked FROM checklist WHERE week=?").bind(week).all();return json({week,checked:Object.fromEntries(r.results.map(x=>[x.item_id,Boolean(x.checked)]))});}
async function checklistPost(request,env){const b=await request.json().catch(()=>null);if(!b||typeof b.week!=="string"||typeof b.itemId!=="string"||typeof b.checked!=="boolean")return json({error:"invalid payload"},400);await env.DB.prepare("INSERT INTO checklist (week,item_id,checked,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(week,item_id) DO UPDATE SET checked=excluded.checked,updated_at=datetime('now')").bind(b.week,b.itemId,b.checked?1:0).run();return json({ok:true});}
async function checklistDelete(request,env){const b=await request.json().catch(()=>null);if(!b||typeof b.week!=="string")return json({error:"invalid payload"},400);await env.DB.prepare("DELETE FROM checklist WHERE week=?").bind(b.week).run();return json({ok:true});}
async function preferencesGet(env){await ensureTables(env);const row=await env.DB.prepare("SELECT selected_days,day_requests,updated_at FROM preferences WHERE id=1").first();if(!row)return json({configured:false,selectedDays:[]});let d=[];try{d=JSON.parse(row.selected_days)}catch{}let requests={};try{requests=JSON.parse(row.day_requests||"{}")}catch{};const cleanRequests=Object.fromEntries(VALID_DAYS.filter(day=>typeof requests[day]==="string"&&requests[day].trim()).map(day=>[day,requests[day].trim().slice(0,120)]));return json({configured:true,selectedDays:d.filter(x=>VALID_DAYS.includes(x)),dayRequests:cleanRequests,updatedAt:row.updated_at});}
async function preferencesPost(request,env){await ensureTables(env);const b=await request.json().catch(()=>null);if(!b||!Array.isArray(b.selectedDays))return json({error:"invalid payload"},400);const d=VALID_DAYS.filter(x=>b.selectedDays.includes(x));if(!d.length)return json({error:"select at least one day"},400);const requests=b.dayRequests&&typeof b.dayRequests==="object"?Object.fromEntries(VALID_DAYS.filter(day=>typeof b.dayRequests[day]==="string"&&b.dayRequests[day].trim()).map(day=>[day,b.dayRequests[day].trim().slice(0,120)])):{};await env.DB.prepare("INSERT INTO preferences (id,selected_days,day_requests,updated_at) VALUES (1,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET selected_days=excluded.selected_days,day_requests=excluded.day_requests,updated_at=datetime('now')").bind(JSON.stringify(d),JSON.stringify(requests)).run();return json({ok:true,selectedDays:d,dayRequests:requests});}
async function manualGet(env){await ensureTables(env);const r=await env.DB.prepare("SELECT id,name,checked FROM manual_items ORDER BY id").all();return json({items:r.results.map(x=>({...x,checked:Boolean(x.checked)}))});}
async function manualPost(request,env){await ensureTables(env);const b=await request.json().catch(()=>null);const name=typeof b?.name==="string"?b.name.trim().slice(0,100):"";if(!name)return json({error:"name is required"},400);const r=await env.DB.prepare("INSERT INTO manual_items (name) VALUES (?) RETURNING id,name,checked").bind(name).first();return json({item:{...r,checked:false}},201);}
async function manualPatch(request,env){await ensureTables(env);const b=await request.json().catch(()=>null);if(!Number.isInteger(b?.id)||typeof b.checked!=="boolean")return json({error:"invalid payload"},400);await env.DB.prepare("UPDATE manual_items SET checked=?,updated_at=datetime('now') WHERE id=?").bind(b.checked?1:0,b.id).run();return json({ok:true});}
async function manualDelete(request,env){await ensureTables(env);const b=await request.json().catch(()=>null);if(b?.checkedOnly===true){const result=await env.DB.prepare("DELETE FROM manual_items WHERE checked=1").run();return json({ok:true,deleted:result.meta?.changes||0});}if(!Number.isInteger(b?.id))return json({error:"invalid payload"},400);await env.DB.prepare("DELETE FROM manual_items WHERE id=?").bind(b.id).run();return json({ok:true});}
export default{async fetch(request,env){if(!env.DB)return request.method==="GET"&&new URL(request.url).pathname.startsWith("/api/")?json({error:"database unavailable"},503):env.ASSETS.fetch(request);const u=new URL(request.url);
 if(u.pathname==="/api/checklist"){if(request.method==="GET")return checklistGet(request,env);if(request.method==="POST")return checklistPost(request,env);if(request.method==="DELETE")return checklistDelete(request,env);}
 if(u.pathname==="/api/preferences"){if(request.method==="GET")return preferencesGet(env);if(request.method==="POST")return preferencesPost(request,env);}
 if(u.pathname==="/api/manual-items"){if(request.method==="GET")return manualGet(env);if(request.method==="POST")return manualPost(request,env);if(request.method==="PATCH")return manualPatch(request,env);if(request.method==="DELETE")return manualDelete(request,env);}
 if(u.pathname==="/proxy/flyer-page"&&request.method==="GET"){
  const catalog=u.searchParams.get("catalog"),page=Number(u.searchParams.get("page"));
  if(!catalog||!Number.isInteger(page)||page<1)return json({error:"invalid flyer page"},400);
  const manifestResponse=await env.ASSETS.fetch(new Request(new URL("/data/flyers.json",request.url)));
  if(!manifestResponse.ok)return json({error:"flyer manifest unavailable"},503);
  const manifest=await manifestResponse.json();let flyer=manifest.flyers?.find(f=>f.catalogId===catalog&&f.complete);
  if(!flyer&&/^[A-Za-z0-9_-]{1,32}$/.test(catalog)){const archive=await env.ASSETS.fetch(new Request(new URL("/data/flyer-editions/"+catalog+".json",request.url)));if(archive.ok){try{const data=await archive.json();if(data.catalogId===catalog&&data.complete)flyer=data}catch{}}}
  const entry=flyer?.pages?.find(p=>p.number===page);
  if(!entry)return json({error:"flyer edition or page unavailable"},404);
  const source=new URL(entry.url);
  if(source.protocol!=="https:"||source.hostname!=="image-transformer-api.tjek.com")return json({error:"invalid publisher image source"},502);
  const cache=globalThis.caches?.default;
  const cacheUrl=new URL(request.url);cacheUrl.searchParams.set("revision",entry.sha256);
  const cacheKey=new Request(cacheUrl.toString());const cached=await cache?.match(cacheKey);if(cached)return cached;
  try{
   const upstream=await fetch(source.toString(),{headers:{accept:"image/*"}});
   if(!upstream.ok||!upstream.headers.get("content-type")?.startsWith("image/"))return json({error:"publisher image unavailable",store:flyer.store,page},502);
   const response=new Response(upstream.body,{headers:{"content-type":upstream.headers.get("content-type"),"cache-control":"public, max-age=3600","x-content-type-options":"nosniff"}});
   if(cache)await cache.put(cacheKey,response.clone());return response;
  }catch{return json({error:"publisher image request failed",store:flyer.store,page},502)}
 }
 if(u.pathname.startsWith("/api/"))return json({error:"method not allowed"},405);return env.ASSETS.fetch(request);}};