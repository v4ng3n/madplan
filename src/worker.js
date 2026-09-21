const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store"
  }
});

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
    checked:Object.fromEntries(
      result.results.map((row)=>[row.item_id,Boolean(row.checked)])
    )
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
    "INSERT INTO checklist (week,item_id,checked,updated_at) VALUES (?,?,?,datetime('now')) " +
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

export default {
  async fetch(request,env){
    const url=new URL(request.url);

    if(url.pathname==="/api/checklist"){
      if(request.method==="GET") return checklistGet(request,env);
      if(request.method==="POST") return checklistPost(request,env);
      if(request.method==="DELETE") return checklistDelete(request,env);
      return json({error:"method not allowed"},405);
    }

    return env.ASSETS.fetch(request);
  }
};
