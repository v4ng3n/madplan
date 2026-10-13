import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const manifest = JSON.parse(await fs.readFile(new URL('../public/data/flyers.json', import.meta.url)));
const code = await fs.readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const env = { DB: {}, ASSETS: { fetch: async () => Response.json(manifest) } };
test('all four complete page sequences have decoded high resolution image evidence', () => {
 assert.deepEqual(manifest.flyers.map(f=>f.store), ['REMA 1000','Netto','365discount','SuperBrugsen']);
 for (const f of manifest.flyers) {
  assert.equal(f.complete,true); assert.equal(f.pages.length,f.pageCount);
  assert.deepEqual(f.pages.map(p=>p.number),Array.from({length:f.pageCount},(_,i)=>i+1));
  for(const p of f.pages){assert.ok(p.width>=1200);assert.ok(p.height>=800);assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.ok(p.bytes>10000)}
 }
});
test('image proxy uses the exact signed replacement URL from the publisher, never guessed names', async () => {
 const oldFetch=globalThis.fetch;let requested;
 globalThis.fetch=async url=>{requested=url;return new Response('image bytes',{headers:{'content-type':'image/jpeg'}})};
 try {
  const f=manifest.flyers[0];
  const r=await worker.fetch(new Request('https://test.local/proxy/flyer-page?catalog='+f.catalogId+'&page=1'),env);
  assert.equal(r.status,200);assert.equal(requested,f.pages[0].url);assert.equal(r.headers.get('content-type'),'image/jpeg');
 }finally{globalThis.fetch=oldFetch}
});
test('proxy refuses arbitrary sources, unknown editions and invalid pages', async () => {
 for(const query of ['catalog=unknown&page=1','catalog='+manifest.flyers[0].catalogId+'&page=999','asset=foo&page=1','catalog=x&page=NaN']){
  const r=await worker.fetch(new Request('https://test.local/proxy/flyer-page?'+query),env);assert.ok(r.status>=400);
 }
});
test('publisher failures are reported, never returned as successful image responses', async () => {
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('not found',{status:404});
 try{const r=await worker.fetch(new Request('https://test.local/proxy/flyer-page?catalog='+manifest.flyers[0].catalogId+'&page=1'),env);assert.equal(r.status,502);assert.match((await r.json()).error,/unavailable/)}finally{globalThis.fetch=oldFetch}
});
