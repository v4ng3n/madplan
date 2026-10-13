import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
const source=await fs.readFile(new URL('../src/worker.js',import.meta.url),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function setup(){
 const db=new DatabaseSync(':memory:');
 const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this},async run(){return {meta:db.prepare(sql).run(...args)}},async all(){return {results:db.prepare(sql).all(...args)}}}}};
 db.exec("CREATE TABLE manual_items(id INTEGER PRIMARY KEY,name TEXT,checked INTEGER,created_at TEXT,updated_at TEXT);INSERT INTO manual_items(id,name,checked) VALUES (1,'Checked A',1),(2,'Keep',0),(3,'Checked B',1)");
 return {db,env:{DB}};
}
function request(payload){return new Request('https://test.local/api/manual-items',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})}
test('bulk deletion removes checked items and preserves the unchecked item',async()=>{
 const {db,env}=setup();try{const r=await worker.fetch(request({checkedOnly:true}),env);assert.equal(r.status,200);assert.equal((await r.json()).deleted,2);assert.deepEqual(db.prepare('SELECT id,name,checked FROM manual_items').all().map(x=>({...x})),[{id:2,name:'Keep',checked:0}]);const again=await worker.fetch(request({checkedOnly:true}),env);assert.equal((await again.json()).deleted,0)}finally{db.close()}
});
test('empty or malformed payload never deletes manual items',async()=>{
 const {db,env}=setup();try{for(const payload of [{},{checkedOnly:'true'},{id:'2'}]){const r=await worker.fetch(request(payload),env);assert.equal(r.status,400)}assert.equal(db.prepare('SELECT count(*) AS n FROM manual_items').get().n,3)}finally{db.close()}
});
test('single item delete remains available',async()=>{
 const {db,env}=setup();try{const r=await worker.fetch(request({id:1}),env);assert.equal(r.status,200);assert.deepEqual(db.prepare('SELECT id FROM manual_items ORDER BY id').all().map(x=>x.id),[2,3])}finally{db.close()}
});
