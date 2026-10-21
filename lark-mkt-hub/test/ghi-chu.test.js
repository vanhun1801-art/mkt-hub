'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const notes = require('../ghi-chu');
const base = require('../base-lark');
const clone = x => JSON.parse(JSON.stringify(x));
const user = { id: 'alice', kieu: 'lark' };
const content = () => ({ folders: notes.defaults().folders, notes: [{ id: 'meeting1', folder: 'meet', title: 'Nội dung riêng', body: '<p>Họp</p>', updated: new Date().toISOString() }] });
function fixture(taskCall) {
  const rows = new Map();
  const storage = { async read(k) { return clone(rows.get(k) || notes.defaults()); }, async write(k, v) { rows.set(k, clone(v)); } };
  return { rows, service: notes.createService({ storage, taskCall, publicUrl: 'https://hub.example' }) };
}
test('private per identity and revision conflict preserves the saved document', async () => {
  const { service } = fixture();
  await service.save(user, 0, content());
  assert.equal((await service.load({ id: 'bob' })).notes.length, 0);
  assert.equal((await service.load({ id: 'alice', kieu: 'mk' })).notes.length, 0);
  await assert.rejects(service.save(user, 0, { ...content(), notes: [] }), e => e.code === 'NOTES_CONFLICT');
  assert.equal((await service.load(user)).notes[0].title, 'Nội dung riêng');
  await assert.rejects(service.load(null), e => e.http === 401);
});
test('rich text strips active markup, arbitrary attributes and oversized content', () => {
  const clean = notes.cleanHTML('<p onclick="evil()">Hi<b style="x">A</b><img src=x onerror=evil()><svg onload=evil()></svg><a href="javascript:evil()">link</a><input autofocus onfocus=evil() checked></p>');
  assert.equal(clean, '<p>Hi<b>A</b>link<input type="checkbox" aria-label="Đánh dấu mục ghi chú" checked></p>');
  assert.throws(() => notes.cleanHTML('x'.repeat(40001)), e => e.http === 413);
  const c = content(); c.notes[0].folder = 'other'; assert.throws(() => notes.validate(c), e => e.http === 400);
});
test('two clicks create one real task with source link, blank owner and fixed requester', async () => {
  let posts = 0, patch;
  const { service } = fixture(async (ctx, path, opts) => { posts++; patch = opts.body; return { id: 'rec1' }; });
  await service.save(user, 0, content());
  const ctx = { user, canCreate: true, canAssign: true };
  const body = { requestId: 'request_123', noteId: 'meeting1', title: 'Việc từ cuộc họp', requester: [{ id: 'bob' }] };
  const [a,b] = await Promise.all([service.createTask(ctx, body), service.createTask(ctx, body)]);
  assert.equal(a.id,b.id); assert.equal(posts,1); assert.equal(patch.owner,undefined);
  assert.deepEqual(patch.requester,[{id:'alice'}]); assert.match(patch.link, /^https:\/\/hub.example\/#\/ghi-chu\?note=meeting1&from=request_123$/);
  assert.equal((await service.load(user)).refs.length,1);
  await assert.rejects(service.createTask({...ctx,user:{id:'bob'}},body),e=>e.http===404);
});
test('staff cannot assign, disabled creation rejects before POST', async () => {
  let calls=0; const {service}=fixture(async()=>{calls++;return {id:'x'};});await service.save(user,0,content());
  const body={requestId:'request_123',noteId:'meeting1',title:'Test',owner:[{id:'bob'}]};
  await assert.rejects(service.createTask({user,canCreate:true,canAssign:false},body),e=>e.http===403);
  await assert.rejects(service.createTask({user,canCreate:false},body),e=>e.http===403);assert.equal(calls,0);
});
test('ambiguous upstream timeout recovers same task without a second POST', async () => {
  let posts=0,created;
  const {service}=fixture(async(ctx,path,opts)=>{if(opts.method==='POST'){posts++;created={id:'rec-recovered',...opts.body};throw Object.assign(Error('timeout'),{http:502});}return {tasks:created?[created]:[]};});
  await service.save(user,0,content());const ctx={user,canCreate:true,canAssign:false},body={requestId:'request_456',noteId:'meeting1',title:'X'};
  await assert.rejects(service.createTask(ctx,body),/timeout/);
  const r=await service.createTask(ctx,body);assert.equal(r.id,'rec-recovered');assert.equal(posts,1);
});
test('upload or attachment update failure leaves previous Lark snapshot intact', async () => {
  const original=base.laApi;base.laApi=()=>true;
  try {
    const owner=notes.ownerKey(user),old=zlib.gzipSync(Buffer.from(JSON.stringify({...notes.defaults(),...content(),owner,version:4})));
    let uploaded=0,failUpload=true;
    const B={docHet:async()=>[{recordId:'row', 'Ô':'ghi-chu:'+owner,'Tệp':[{name:'ghi-chu.json.gz',file_token:'old'}]}],taiTep:async()=>({buf:old}),upMedia:async()=>{uploaded++;if(failUpload)throw Error('upload failed');return 'new';},ghi:async()=>{throw Error('update failed');}};
    const storage=notes.createLarkStorage(B);
    await assert.rejects(storage.write(owner,notes.defaults()),/upload failed/);assert.equal((await storage.read(owner)).version,4);
    failUpload=false;await assert.rejects(storage.write(owner,notes.defaults()),/update failed/);assert.equal((await storage.read(owner)).version,4);assert.equal(uploaded,2);
  } finally {base.laApi=original;}
});
test('HTTP boundary denies view-as, guest, missing session and cross-site writes', async () => {
  const source=fs.readFileSync(require.resolve('../server'),'utf8');
  const part=source.slice(source.indexOf('async function nguCanhGhiChu('),source.indexOf('async function api(req,'));
  let identity={nguoi:user,q:{quanLy:true},xemNhu:null},loaded;
  const context={URL, cfg:{mode:'api',publicUrl:'https://hub.example'},aiDangXem:async()=>identity,timMod:()=>({id:'cong-viec'}),duocXem:()=>true,laQLBase:q=>q.quanLy,loiKhach:(message,http)=>Object.assign(Error(message),{http}),khoGhiChu:{load:async u=>{loaded=u;return {notes:[]};}},ok:(res,body)=>({status:200,body}),loi:(res,status,error)=>({status,body:{error}}),send:(res,status,body)=>({status,body})};vm.createContext(context);vm.runInContext(part+'\nthis.handler=apiGhiChu;',context);
  const req={method:'GET',headers:{host:'hub.example'}},url=new URL('https://hub.example/api/ghi-chu?owner=bob');
  assert.equal((await context.handler(req,{},url)).status,200);assert.equal(loaded.id,'alice');
  for(const i of [{...identity,xemNhu:{id:'bob'}},{...identity,q:{khach:true}},{...identity,nguoi:null}]){identity=i;assert.ok((await context.handler(req,{},url)).status>=400);}
  identity={nguoi:user,q:{quanLy:true},xemNhu:null};assert.equal((await context.handler({method:'PATCH',headers:{host:'hub.example',origin:'https://evil.example','sec-fetch-site':'cross-site'}},{},url)).status,403);
});
