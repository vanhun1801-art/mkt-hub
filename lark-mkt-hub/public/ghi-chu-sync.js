/* Shared by the browser and offline regression tests. No credentials or storage. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HubNotesSync = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  const pick = x => ({
    folders:(x.folders||[]).map(f=>({id:f.id,name:f.name,icon:f.icon||'folder'})),
    notes:(x.notes||[]).map(n=>({id:n.id,folder:n.folder,title:n.title||'',body:n.body||'',tags:n.tags||'',pinned:n.pinned===true,deleted:n.deleted===true,updated:n.updated||''})).sort((a,b)=>a.id.localeCompare(b.id)),
  });
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const fields = ['folder','title','body','tags','pinned','deleted'];
  const normalize = (n,keys) => Object.fromEntries(keys.map(k => [k, n?.[k] ?? (k==='pinned'||k==='deleted'?false:'')]));
  const equalNote = (a,b) => same(normalize(a,fields),normalize(b,fields));
  const uid = () => 'conflict_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);

  // Compare against the last acknowledged snapshot, not local clock timestamps.
  // A divergent field preserves the remote original and a separate local copy.
  function merge(base, local, remote) {
    const result={folders:[],notes:[]},copies=[];
    for (const [kind,keys] of [['folders',['name','icon']],['notes',fields]]) {
      const b=new Map((base[kind]||[]).map(x=>[x.id,x]));
      const l=new Map((local[kind]||[]).map(x=>[x.id,x]));
      const r=new Map((remote[kind]||[]).map(x=>[x.id,x]));
      const ids=[...new Set([...r.keys(),...l.keys(),...b.keys()])];
      for (const id of ids) {
        const before=b.get(id),mine=l.get(id),theirs=r.get(id);
        const equal=(a,z)=>same(normalize(a,keys),normalize(z,keys));
        if(!mine&&!theirs)continue;
        if(!mine){if(!before||!equal(before,theirs))result[kind].push(copy(theirs));continue;}
        if(!theirs){if(!before||!equal(before,mine))result[kind].push(copy(mine));continue;}
        if(equal(mine,theirs)){result[kind].push(copy(theirs));continue;}
        let conflict=!before;
        const combined={...theirs};
        for(const key of keys) {
          const old=normalize(before,keys)[key],a=normalize(mine,keys)[key],z=normalize(theirs,keys)[key];
          if(same(a,old))continue;
          if(same(z,old)||same(a,z))combined[key]=mine[key];
          else conflict=true;
        }
        // Deleting a note concurrently with edits also keeps an editable copy.
        if(kind==='notes'&&before&&mine.deleted!==theirs.deleted&&
          ((mine.deleted&&!equal({...before,deleted:theirs.deleted},theirs))||
           (theirs.deleted&&!equal({...before,deleted:mine.deleted},mine))))conflict=true;
        if(!conflict){if(kind==='notes')combined.updated=[mine.updated,theirs.updated].filter(Boolean).sort().pop();result[kind].push(combined);continue;}
        result[kind].push(copy(theirs));
        if(kind==='notes') {
          const duplicate={...copy(mine),id:uid(),title:(mine.title||'Ghi chú') .slice(0,160)+' (bản giữ lại)',deleted:false,updated:new Date().toISOString()};
          result.notes.push(duplicate);copies.push({from:id,to:duplicate.id});
        } else {
          // Folder names do not duplicate all their children; retain both names.
          const duplicate={...copy(mine),id:uid(),name:(mine.name||'Thư mục').slice(0,40)+' (bản giữ lại)'};
          result.folders.push(duplicate);

        }
      }
    }
    const ids=new Set(result.folders.map(x=>x.id));
    for(const n of result.notes)if(!ids.has(n.folder)) {
      const f=[...(local.folders||[]),...(base.folders||[])].find(f=>f.id===n.folder);
      if(f){result.folders.push(copy(f));ids.add(f.id);}
    }
    return {data:result,copies};
  }

  class Sync {
    constructor(opts) {
      Object.assign(this,{load:opts.load,write:opts.write,onChange:opts.onChange||(()=>{}),onStatus:opts.onStatus||(()=>{}),onError:opts.onError||(()=>{}),onDraft:opts.onDraft||(()=>{}),setTimer:opts.setTimer||((fn,ms)=>setTimeout(fn,ms)),clearTimer:opts.clearTimer||(id=>clearTimeout(id))});
      this.base={folders:[],notes:[]};this.data=pick(this.base);this.version=0;this.refs=[];
      this.ready=false;this.paused=false;this.needsPull=false;this.flight=null;this.timer=null;this.failures=0;this.pendingSince=0;this.fatal=false;
    }
    get dirty(){return !same(this.data,this.base);}
    snapshot(){return {baseVersion:this.version,base:copy(this.base),...pick(this.data)};}
    draft(){this.onDraft(this.dirty?this.snapshot():null);}
    status(s){this.onStatus(s);}
    start(remote,draft) {
      this.base=pick(remote);this.data=pick(remote);this.version=remote.version;this.refs=remote.refs||[];this.ready=true;
      let copies=[];
      if(draft&&Array.isArray(draft.notes)&&Array.isArray(draft.folders)) {
        if(draft.baseVersion===remote.version)this.data=pick(draft);
        else {const m=merge(draft.base||{folders:[],notes:[]},pick(draft),this.base);this.data=m.data;copies=m.copies;}
      }
      this.onChange(pick(this.data),this.refs,copies);this.draft();this.status(this.dirty?'pending':'synced');
      if(this.dirty)this.schedule(500);
    }
    edit(data) {
      if(!this.ready)return;
      const wasDirty=this.dirty;this.data=pick(data);this.fatal=false;
      if(!wasDirty)this.pendingSince=Date.now();
      this.draft();this.status('pending');
      this.schedule(Math.min(1200,Math.max(0,5000-(Date.now()-this.pendingSince))));
    }
    schedule(ms) {
      this.clearTimer(this.timer);this.timer=null;
      if(this.paused||this.fatal||!this.ready||!this.dirty)return;
      this.timer=this.setTimer(()=>{this.timer=null;this.flush(false).catch(()=>{});},ms);
    }
    accept(remote,base=this.base) {
      const m=merge(base,this.data,pick(remote));
      const changed=!same(pick(this.data),pick(m.data))||!same(this.refs,remote.refs||[]);
      this.base=pick(remote);this.data=pick(m.data);this.version=remote.version;this.refs=remote.refs||[];
      if(changed||m.copies.length)this.onChange(pick(this.data),this.refs,m.copies);this.draft();
    }
    async pull() {
      if(!this.ready||this.paused)return;
      if(this.flight)return this.flight;
      this.flight=(async()=>{
        try {const remote=await this.load();this.accept(remote);this.needsPull=false;this.failures=0;this.fatal=false;this.onError(null);this.status(this.dirty?'pending':'synced');}
        catch(e){this.needsPull=true;this.failures++;this.fatal=[401,403].includes(e.status);this.onError(e);this.status('offline');throw e;}
      })().finally(()=>{this.flight=null;if(this.dirty)this.schedule(this.failures?this.retryDelay():1200);});
      return this.flight;
    }
    retryDelay(){return Math.min(30000,2000*Math.pow(2,Math.min(this.failures-1,4)));}
    async flush(drain=true) {
      this.clearTimer(this.timer);this.timer=null;
      if(!this.ready)return;
      if(this.flight){await this.flight;return this.dirty?this.flush(drain):undefined;}
      if(!this.dirty)return;
      this.flight=(async()=>{
        try {
          for(let attempt=0;attempt<3;attempt++) {
            if(this.needsPull){this.accept(await this.load());this.needsPull=false;}
            if(!this.dirty)break;
            const sent=pick(this.data);this.status('saving');
            try {const remote=await this.write(this.version,sent);this.accept(remote,sent);break;}
            catch(e){if(e.status===409&&attempt<2){this.needsPull=true;continue;}throw e;}
          }
          this.failures=0;this.fatal=false;this.pendingSince=this.dirty?Date.now():0;this.onError(null);this.status(this.dirty?'pending':'synced');
        }catch(e){this.needsPull=true;this.failures++;this.fatal=[400,401,403,413].includes(e.status);this.draft();this.onError(e);this.status('offline');throw e;}
      })().finally(()=>{this.flight=null;if(this.dirty)this.schedule(this.failures?this.retryDelay():1200);});
      await this.flight;
      if(drain&&this.dirty)return this.flush(true);
    }
    pause(){this.paused=true;this.clearTimer(this.timer);this.timer=null;}
    resume(){this.paused=false;this.needsPull=true;this.schedule(0);}
    stop(){this.pause();}
  }
  return {merge,Sync,equalNote};
});
