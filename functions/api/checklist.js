const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store"
  }
});

export async function onRequestGet({request,env}){
  const url=new URL(request.url);
  const week=url.searchParams.get("week");
  if(!week) return json({error:"week is required"},400);

  const result=await env.DB
    .prepare("SELECT item_id, checked FROM checklist WHERE week = ?")
    .bind(week)
    .all();

  return json({
    week:week,
    checked:Object.fromEntries(result.results.map((row)=>[row.item_id,Boolean(row.checked)]))
  });
}

export async function onRequestPost({request,env}){
  const body=await request.json().catch(()=>null);

  if(
    !body ||
    typeof body.week!=="string" ||
    typeof body.itemId!=="string" ||
    typeof body.checked!=="boolean"
  ){
    return json({error:"invalid payload"},400);
  }

  const sql="INSERT INTO checklist (week,item_id,checked,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(week,item_id) DO UPDATE SET checked=excluded.checked,updated_at=datetime('now')";

  await env.DB
    .prepare(sql)
    .bind(body.week,body.itemId,body.checked?1:0)
    .run();

  return json({ok:true});
}

export async function onRequestDelete({request,env}){
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