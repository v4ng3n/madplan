const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store"
  }
});

const VALID_DAYS=["Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag","Søndag"];

async function ensurePreferencesTable(env){
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS preferences ("+
    "id INTEGER PRIMARY KEY CHECK (id = 1),"+
    "selected_days TEXT NOT NULL,"+
    "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"+
    ")"
  ).run();
}

async function checklistGet(request,env){
  if(!env.DB) return json({error:"D1 database is not configured yet"},503);
  const url=new URL(request.url);
  const week=url.searchParams.get("week");
  if(!week) return json({error:"week is required"},400);

  const result=await env.DB
    .prepare("SELECT item_id, checked FROM checklist WHERE week = ?")
    .bind(week)
    .all();

  return json({
    week,
    checked:Object.fromEntries(result.results.map((row)=>[row.item_id,Boolean(row.checked)]))
  });
}

async function checklistPost(request,env){
  if(!env.DB) return json({error:"D1 database is not configured yet"},503);
  const body=await request.json().catch(()=>null);
  if(
    !body ||
    typeof body.week!=="string" ||
    typeof body.itemId!=="string" ||
    typeof body.checked!=="boolean"
  ){
    return json({error:"invalid payload"},400);
  }

  await env.DB.prepare(
    "INSERT INTO checklist (week,item_id,checked,updated_at) VALUES (?,?,?,datetime('now')) "+
    "ON CONFLICT(week,item_id) DO UPDATE SET checked=excluded.checked,updated_at=datetime('now')"
  )
  .bind(body.week,body.itemId,body.checked?1:0)
  .run();

  return json({ok:true});
}

async function checklistDelete(request,env){
  if(!env.DB) return json({error:"D1 database is not configured yet"},503);
  const body=await request.json().catch(()=>null);
  if(!body || typeof body.week!=="string"){
    return json({error:"invalid payload"},400);
  }

  await env.DB
    .prepare("DELETE FROM checklist WHERE week = ?")
    .bind(body.week)
    .run();

  return json({ok:true});
}

async function preferencesGet(env){
  if(!env.DB) return json({error:"D1 database is not configured yet"},503);
  await ensurePreferencesTable(env);
  const row=await env.DB.prepare(
    "SELECT selected_days, updated_at FROM preferences WHERE id = 1"
  ).first();

  if(!row){
    return json({configured:false,selectedDays:[]});
  }

  let selectedDays=[];
  try{
    selectedDays=JSON.parse(row.selected_days);
  }catch{
    selectedDays=[];
  }

  return json({
    configured:true,
    selectedDays:selectedDays.filter((day)=>VALID_DAYS.includes(day)),
    updatedAt:row.updated_at
  });
}

async function preferencesPost(request,env){
  if(!env.DB) return json({error:"D1 database is not configured yet"},503);
  await ensurePreferencesTable(env);
  const body=await request.json().catch(()=>null);
  if(!body || !Array.isArray(body.selectedDays)){
    return json({error:"invalid payload"},400);
  }

  const selectedDays=VALID_DAYS.filter((day)=>body.selectedDays.includes(day));
  if(selectedDays.length<1){
    return json({error:"select at least one day"},400);
  }

  await env.DB.prepare(
    "INSERT INTO preferences (id,selected_days,updated_at) VALUES (1,?,datetime('now')) "+
    "ON CONFLICT(id) DO UPDATE SET selected_days=excluded.selected_days,updated_at=datetime('now')"
  ).bind(JSON.stringify(selectedDays)).run();

  return json({ok:true,selectedDays});
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);

    if(url.pathname==="/api/checklist"){
      if(request.method==="GET") return checklistGet(request,env);
      if(request.method==="POST") return checklistPost(request,env);
      if(request.method==="DELETE") return checklistDelete(request,env);
      return json({error:"method not allowed"},405);
    }

    if(url.pathname==="/api/preferences"){
      if(request.method==="GET") return preferencesGet(env);
      if(request.method==="POST") return preferencesPost(request,env);
      return json({error:"method not allowed"},405);
    }

    return env.ASSETS.fetch(request);
  }
};
