'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Sync,merge}=require('../public/ghi-chu-sync');
const clone=x=>JSON.parse(JSON.stringify(x));
const initial=()=>({version:0,folders:[{id:'quick',name:'Ghi chú nhanh',icon:'sticky-note'}],notes:[{id:'one',folder:'quick',title:'Họp',body:'Bản đầu',updated:'2026-10-21T01:00:00.000Z'},{id:'two',folder:'quick',title:'Dự án',body:'Dự án đầu',updated:'2026-10-21T01:00:00.000Z'}],refs:[]});
const problem=(status)=>Object.assign(Error('test failure'),{status});
function fixture(){
 let remote=initial(),posts=0,failBefore=0,failAfter=0;
 const backend={load:async()=>clone(remote),write:async(version,data)=>{posts++;if(failBefore-- >0)throw problem(503);if(version!==remote.version)throw problem(409);remote={...remote,...clone(data),version:remote.version+1};if(failAfter-- >0)throw problem(503);return clone(remote);}};
 function client(draft){const timers=[],errors=[],changes=[];let next=0;
  const sync=new Sync({...backend,setTimer:(fn,ms)=>{timers.push({fn,ms,id:++next});return next;},clearTimer:id=>{const found=timers.findIndex(t=>t.id===id);if(found>=0)timers.splice(found,1);},onError:e=>errors.push(e),onChange:(data,refs,copies)=>changes.push({data,refs,copies})});
  sync.start(clone(remote),draft);return {sync,timers,errors,changes};}
 return {backend,client,get remote(){return remote;},get posts(){return posts;},failBefore:()=>{failBefore=1;},failAfter:()=>{failAfter=1;}};
}
function edit(sync,id,patch){const d=clone(sync.data);Object.assign(d.notes.find(n=>n.id===id),patch);sync.edit(d);}
test('two devices editing different notes automatically converge after a revision conflict',async()=>{
 const f=fixture(),a=f.client(),b=f.client();edit(a.sync,'one',{body:'Máy A'});edit(b.sync,'two',{body:'Máy B'});
 await a.sync.flush();await b.sync.flush();await a.sync.pull();
 assert.equal(f.remote.notes.find(n=>n.id==='one').body,'Máy A');assert.equal(f.remote.notes.find(n=>n.id==='two').body,'Máy B');
 assert.deepEqual(a.sync.data,b.sync.data);assert.equal(a.sync.dirty,false);assert.equal(b.errors.filter(Boolean).length,0);
});
test('different fields in one note merge without creating a duplicate',async()=>{
 const f=fixture(),a=f.client(),b=f.client();edit(a.sync,'one',{title:'Tiêu đề mới'});edit(b.sync,'one',{body:'Nội dung mới'});
 await a.sync.flush();await b.sync.flush();assert.equal(f.remote.notes.length,2);
 const n=f.remote.notes.find(n=>n.id==='one');assert.equal(n.title,'Tiêu đề mới');assert.equal(n.body,'Nội dung mới');
});
test('divergent edits of the same field preserve the remote original and a local copy',async()=>{
 const f=fixture(),a=f.client(),b=f.client();edit(a.sync,'one',{body:'Máy A'});edit(b.sync,'one',{body:'Máy B'});
 await a.sync.flush();await b.sync.flush();
 assert.equal(f.remote.notes.find(n=>n.id==='one').body,'Máy A');
 const kept=f.remote.notes.filter(n=>n.body==='Máy B');assert.equal(kept.length,1);assert.notEqual(kept[0].id,'one');
 assert.equal(b.sync.dirty,false);assert.equal(b.changes.some(c=>c.copies.length===1),true);
});
test('typing while a save is in flight is not replaced by its older response',async()=>{
 const f=fixture();let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const c=f.client();const original=c.sync.write;c.sync.write=async(...args)=>{entered();await gate;return original(...args);};
 edit(c.sync,'one',{body:'Đoạn đã gửi'});const saving=c.sync.flush(false);await started;edit(c.sync,'one',{body:'Đoạn đang gõ thêm'});release();await saving;
 assert.equal(c.sync.data.notes.find(n=>n.id==='one').body,'Đoạn đang gõ thêm');assert.equal(c.sync.dirty,true);
 await c.sync.flush();assert.equal(f.remote.notes.find(n=>n.id==='one').body,'Đoạn đang gõ thêm');
});
test('a temporary connection failure schedules a retry and clears the error after recovery',async()=>{
 const f=fixture(),c=f.client();edit(c.sync,'one',{body:'Nội dung chưa gửi'});f.failBefore();
 await assert.rejects(c.sync.flush(),e=>e.status===503);assert.equal(c.sync.dirty,true);assert.equal(c.timers.at(-1).ms,2000);
 await c.sync.flush();assert.equal(c.sync.dirty,false);assert.equal(c.errors.at(-1),null);assert.equal(f.remote.notes.find(n=>n.id==='one').body,'Nội dung chưa gửi');
});
test('a lost acknowledgement is reconciled without uploading the same snapshot again',async()=>{
 const f=fixture(),c=f.client();edit(c.sync,'one',{body:'Đã tới Base'});f.failAfter();await assert.rejects(c.sync.flush());
 await c.sync.flush();assert.equal(f.posts,1);assert.equal(c.sync.version,1);assert.equal(c.sync.dirty,false);
});
test('an outdated draft without its base is recovered without overwriting the newer server note',async()=>{
 const f=fixture(),a=f.client();edit(a.sync,'one',{body:'Đang có trên máy chủ'});await a.sync.flush();
 const draft=initial();draft.baseVersion=0;draft.notes[0].body='Bản nháp cũ chưa lưu';const b=f.client(draft);await b.sync.flush();
 assert.ok(f.remote.notes.some(n=>n.id==='one'&&n.body==='Đang có trên máy chủ'));
 assert.ok(f.remote.notes.some(n=>n.id!=='one'&&n.body==='Bản nháp cũ chưa lưu'));
});
test('concurrent trash and editing retain an editable version',()=>{
 const base=initial(),local=clone(base),remote=clone(base);local.notes[0].body='Đang soạn';remote.notes[0].deleted=true;
 const m=merge(base,local,remote);assert.equal(m.data.notes.find(n=>n.id==='one').deleted,true);
 assert.ok(m.data.notes.some(n=>n.id!=='one'&&n.body==='Đang soạn'&&!n.deleted));
});
test('unchanged polls do not rebuild the editor or create additional writes',async()=>{
 const f=fixture(),c=f.client();const before=c.changes.length;await c.sync.pull();await c.sync.pull();
 assert.equal(c.changes.length,before);assert.equal(f.posts,0);assert.equal(c.sync.dirty,false);
});
test('a changed folder/name on another device is picked up without a reload',async()=>{
 const f=fixture(),a=f.client(),b=f.client();const next=clone(a.sync.data);next.folders.push({id:'new',name:'Cuộc họp',icon:'folder'});a.sync.edit(next);await a.sync.flush();await b.sync.pull();
 assert.ok(b.sync.data.folders.some(x=>x.id==='new'));assert.equal(b.sync.dirty,false);
});
test('pausing for task creation preserves unsaved edits and resumes with the new revision',async()=>{
 const f=fixture(),a=f.client(),b=f.client();a.sync.pause();edit(a.sync,'one',{body:'Đang viết'});edit(b.sync,'two',{body:'Máy khác'});await b.sync.flush();
 assert.equal(a.timers.length,0);a.sync.resume();await a.sync.flush();assert.equal(f.remote.notes.find(n=>n.id==='one').body,'Đang viết');assert.equal(f.remote.notes.find(n=>n.id==='two').body,'Máy khác');
});
test('permission errors never clear a pending draft or blindly loop writes',async()=>{
 const f=fixture(),c=f.client();c.sync.write=async()=>{throw problem(403);};edit(c.sync,'one',{body:'Giữ lại'});
 await assert.rejects(c.sync.flush(),e=>e.status===403);assert.equal(c.sync.dirty,true);assert.equal(c.timers.length,0);assert.equal(c.sync.snapshot().notes.find(n=>n.id==='one').body,'Giữ lại');
});
test('native browser timer functions are not called with the Sync instance as their receiver',()=>{
 const vm=require('node:vm'),fs=require('node:fs');let calls=0;
 const native=function(){assert.notEqual(this?.marker,'notes-client');calls++;return 1;};
 const context={module:{exports:{}},setTimeout:native,clearTimeout:native};vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../public/ghi-chu-sync'),'utf8'),context);
 const client=new context.module.exports.Sync({load:async()=>initial(),write:async()=>initial()});client.marker='notes-client';client.start(initial());
 const next=clone(client.data);next.notes[0].body='Tiếp tục';assert.doesNotThrow(()=>client.edit(next));client.stop();assert.ok(calls>=2);
});
