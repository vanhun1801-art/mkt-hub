
(() => {
 const root=document.getElementById('rooty-notes');
 const $=s=>root.querySelector(s), $$=s=>Array.from(root.querySelectorAll(s));

 // Reuse the current Hub palette and typeface, including its active skin.
 function syncHubAppearance(theme){
  let parentStyle;
  try{if(parent!==window)parentStyle=parent.getComputedStyle(parent.document.documentElement);}catch(_){}
  const dark=theme==='toi'||theme==='dark'||(!theme&&(parentStyle?parentStyle.colorScheme==='dark':matchMedia('(prefers-color-scheme: dark)').matches));
  document.documentElement.style.colorScheme=dark?'dark':'light';
  if(!parentStyle)return;
  const tokens={'--n-canvas':['--ios-nen','--nen'],'--n-bg':['--ios-the','--trang'],'--n-side':['--ios-the-2','--trang-2'],'--n-text':['--ios-chu','--chu'],'--n-muted':['--ios-chu-2','--chu-mo'],'--n-line':['--ios-vach','--vien'],'--n-accent':['--ios-xanh','--xanh'],'--n-accent-text':['--ios-xanh-chu','--xanh'],'--n-soft':['--ios-xanh-nhat','--xanh-nhat'],'--n-input':['--ios-o','--vien-mem'],'--n-shadow':['--ios-bong'],'--n-font':['--ios-font']};
  for(const [target,sources] of Object.entries(tokens)){const value=sources.map(name=>parentStyle.getPropertyValue(name).trim()).find(Boolean);if(value)root.style.setProperty(target,value);}
 }
 syncHubAppearance();
 const stamp=()=>new Date().toISOString();
 const uid=()=> 'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
 let data={folders:[],notes:[],tasks:[]},cacheKey='',blocked=false,taskBusy=false,taskRequest=null,sync=null,loading=false,draftKey='',legacyDraftKey='',legacyRaw='',draftPersisted=true,discarding=false,channel=null,lastPull=0,lastTasks=0,lastMeta=0,meta={canCreate:false,canAssign:false,people:[],options:{}};
 let saveLabel='Đang tải…';
 let folder='all',selected=data.notes.find(n=>!n.deleted)?.id||null,query='',snippet='',taskNote=null,dialogReturn=null,timer;
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const plain=html=>{const d=document.createElement('div');d.innerHTML=html;return d.textContent||'';};
 const shapes={'chevron-left':'<path d="m15 4-8 8 8 8"/>','ellipsis-circle':'<circle cx="12" cy="12" r="9"/><circle cx="7" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="17" cy="12" r=".9" fill="currentColor" stroke="none"/>','folder-plus':'<path d="M3 7V4h7l2 3h9v13H3zM8 14h8M12 10v8"/>','square-pen':'<path d="M13 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8M15 3l6 6M10 14l1-5 8-8 5 5-8 8z"/>','messages-square':'<path d="M3 3h15v11H9l-6 5zM10 17h7l5 4V9"/>','sticky-note':'<path d="M4 3h16v12l-6 6H4zM14 21v-6h6M8 8h8M8 12h5"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',folder:'<path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3"/>','trash-2':'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>','pin':'<path d="m8 3 9 1-2 6 4 4-6 1-4 6v-7l-5-3 5-2z"/>','list':'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>','lock-keyhole':'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>','circle-plus':'<circle cx="12" cy="12" r="9"/><path d="M7 12h10M12 7v10"/>','undo-2':'<path d="m8 3-5 5 5 5M3 8h10a7 7 0 0 1 0 14"/>','list-checks':'<path d="m2 6 2 2 3-4M10 6h12M10 13h12M10 20h12m-8-8 2 2 3-4"/>'};
 const icons=()=>$$('i[data-lucide]').forEach(i=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','16');svg.setAttribute('height','16');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.innerHTML=shapes[i.dataset.lucide]||'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>';i.replaceWith(svg);});
 async function api(path='',options={}) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),40000);
  try{
   const r=await fetch('/api/ghi-chu'+path,{...options,headers:{'Content-Type':'application/json'},credentials:'same-origin',signal:controller.signal,cache:'no-store'});
   if(r.redirected||!(r.headers.get('content-type')||'').includes('application/json'))throw Object.assign(Error('Phiên đăng nhập đã hết. Anh mở lại Hub để đăng nhập; bản nháp vẫn được giữ.'),{status:401});
   const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'Chưa thể đồng bộ ghi chú.'),{status:r.status,code:d.code});return d;
  }catch(e){if(e.name==='AbortError')throw Error('Kết nối đang chậm, hệ thống sẽ tự thử lại.');throw e;}finally{clearTimeout(timeout);}
 }
 function label(value){saveLabel=value;$('#rn-mobile-status').textContent=value==='Đã lưu trên Lark'?'':value;$('#rn-global-save').textContent=value==='Đã lưu trên Lark'?'Đã lưu':value;$('#rn-global-save').dataset.state=value==='Đã lưu trên Lark'?'saved':value.startsWith('Đang')?'busy':'pending';}
 function backup(snapshot=sync?.snapshot()){
  if(!draftKey||!snapshot)return;
  const raw=JSON.stringify(snapshot);draftPersisted=false;
  try{localStorage.setItem(draftKey,raw);draftPersisted=true;}catch(_){}
  try{sessionStorage.setItem(draftKey,raw);draftPersisted=true;}catch(_){}
 }
 function syncError(e){
  if(!e){$('#rn-error').hidden=true;$('#rn-recovery').hidden=true;$('#rn-sync-details').hidden=true;return;}
  $('#rn-error').textContent=[401,403,400,413].includes(e.status)?e.message:'Chưa kết nối được để đồng bộ. Nội dung đang soạn vẫn được giữ; hệ thống sẽ tự thử lại.';
  $('#rn-error').hidden=false;$('#rn-recovery').hidden=false;$('#rn-sync-details').hidden=false;$('#rn-sync-detail-text').textContent=e.message;
  $('#rn-recovery-text').textContent=draftPersisted?'Bản nháp chưa đồng bộ đang được giữ trên máy này.':'Nội dung chưa đồng bộ đang ở trong trang này. Anh có thể tải bản nháp để giữ lại.';
 }
 function persist(){sync?.edit(data);}
 async function flush(){if(!sync)throw Error('Đang tải ghi chú.');return sync.flush();}
 function applyField(el,key,value){
  value=value||'';
  if(key!=='body'){
   if(el.value===value)return;
   const focused=document.activeElement===el,start=el.selectionStart,end=el.selectionEnd;
   el.value=value;if(focused&&typeof start==='number')el.setSelectionRange(Math.min(start,value.length),Math.min(end,value.length));return;
  }
  if(el.innerHTML===value)return;
  const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
  let offsets=null;
  if(range&&el.contains(range.startContainer)&&el.contains(range.endContainer)){
   const before=range.cloneRange();before.selectNodeContents(el);before.setEnd(range.startContainer,range.startOffset);const start=before.toString().length;
   before.setEnd(range.endContainer,range.endOffset);offsets=[start,before.toString().length];
  }
  const scroll=$('.page').scrollTop;el.innerHTML=value;
  if(offsets){
   const point=offset=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,last;while((node=walker.nextNode())){last=node;if(offset<=node.textContent.length)return [node,offset];offset-=node.textContent.length;}return last?[last,last.textContent.length]:[el,0];};
   const a=point(offsets[0]),b=point(offsets[1]),next=document.createRange();next.setStart(a[0],a[1]);next.setEnd(b[0],b[1]);selection.removeAllRanges();selection.addRange(next);
  }
  $('.page').scrollTop=scroll;
 }
 function applySynced(next,refs,copies){
  const old=current(),oldId=selected,wasTaskBoard=!$('#rn-task-view').hidden;
  const focus=document.activeElement;
  const activeField=focus===$('#rn-body')||focus===$('#rn-title')||focus===$('#rn-tags');
  const newRefs=(refs||[]).some(r=>!data.tasks.some(t=>t.id===r.id));
  data.folders=next.folders;data.notes=next.notes;
  data.tasks=(refs||[]).map(r=>({...r,...(data.tasks.find(t=>t.id===r.id)||{})}));
  const duplicate=(copies||[]).find(c=>c.from===selected);
  if(duplicate){selected=duplicate.to;toast('Nội dung được sửa ở hai nơi. Em đã giữ riêng một bản để anh không mất phần đang viết.');}
  if(!current()&&selected)selected=data.notes.find(n=>!n.deleted)?.id||null;
  if(!data.folders.some(f=>f.id===folder)&&folder!=='all'&&folder!=='trash')folder='all';
  folders();list();linked();icons();mobileChrome();
  const n=current();
  const changed=oldId!==selected||!HubNotesSync.equalNote(old,n);
  // Touch only changed fields. Preserve selection and scroll for remote edits;
  // an unchanged field keeps the native undo stack while an acknowledgement arrives.
  if(changed&&activeField&&n){
   for(const [id,key] of [['rn-title','title'],['rn-tags','tags'],['rn-body','body']])applyField($('#'+id),key,n[key]);
   $('#rn-move').innerHTML=data.folders.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join('');$('#rn-move').value=n.folder;
   $('#rn-pin').classList.toggle('active',!!n.pinned);
  }else if(changed)editor();
  if(n)$('#rn-date').textContent='Cập nhật '+fmt(n.updated);
  if(wasTaskBoard)showTaskBoard();
  icons();fitTitle();
  if(newRefs)setTimeout(()=>refreshTasks(true),0);
 }
 async function refreshTasks(silent=false){
  lastTasks=Date.now();
  try{const r=await api('/tasks');data.tasks=r.tasks;folders();linked();icons();fitTitle();if(!$('#rn-task-view').hidden)$('#rn-task-list').innerHTML=data.tasks.map(taskCard).join('');}
  catch(e){if(!silent)toast('Chưa cập nhật được công việc: '+e.message);}
 }
 function openNote(id){const n=data.notes.find(n=>n.id===id);if(!n){toast('Ghi chú này không có trong tài khoản của anh.');return;}folder=n.deleted?'trash':n.folder;choose(id);}
 function toast(text){clearTimeout(timer);$('#rn-toast').textContent=text;$('#rn-toast').hidden=false;timer=setTimeout(()=>$('#rn-toast').hidden=true,2800);}
 const current=()=>data.notes.find(n=>n.id===selected);
 const fmt=s=>new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(s));
 function folders(){const alive=data.notes.filter(n=>!n.deleted);$('#rn-folders').innerHTML=[{id:'all',name:'Tất cả ghi chú',icon:'notebook'},...data.folders].map(f=>'<button type="button" class="folder '+(folder===f.id?'on':'')+'" data-folder="'+esc(f.id)+'"><i data-lucide="'+esc(f.icon)+'" aria-hidden="true"></i><span class="folder-name">'+esc(f.name)+'</span><span class="number">'+alive.filter(n=>f.id==='all'||n.folder===f.id).length+'</span></button>').join('');$('#rn-trash').classList.toggle('on',folder==='trash');$('#rn-taskcount').textContent=data.tasks.length;}
 function list(){let ns=data.notes.filter(n=>(folder==='trash'?n.deleted:!n.deleted&&(folder==='all'||n.folder===folder))&&(!query||(n.title+' '+plain(n.body)+' '+n.tags).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updated.localeCompare(a.updated));$('#rn-folder-title').textContent=folder==='all'?'Tất cả ghi chú':folder==='trash'?'Đã xoá gần đây':(data.folders.find(f=>f.id===folder)?.name||'Ghi chú');let last='';$('#rn-list').innerHTML=ns.map(n=>{const age=Math.floor((Date.now()+7*3600000)/86400000)-Math.floor((Date.parse(n.updated)+7*3600000)/86400000);const group=n.pinned?'Đã ghim':phone.matches?(age<=0?'Hôm nay':age<7?'7 ngày qua':age<30?'30 ngày qua':'Trước đó'):'Ghi chú';const head=last!==group?'<div class="list-section">'+group+'</div>':'';last=group;return head+'<button type="button" class="note-row '+(selected===n.id?'on':'')+'" data-note="'+esc(n.id)+'"><strong>'+esc(n.title||'Ghi chú chưa đặt tên')+'</strong><p>'+esc(plain(n.body).slice(0,95)||'Chưa có nội dung')+'</p><small>'+fmt(n.updated)+' <span class="mini-dot"></span> '+esc(data.folders.find(f=>f.id===n.folder)?.name||'Ghi chú')+'</small></button>';}).join('')||'<div class="empty-list">'+(query?'Không tìm thấy ghi chú.':'Chưa có ghi chú trong mục này.')+'</div>';}
 function taskCard(t){return '<button type="button" class="task-card" data-task="'+esc(t.id)+'"><i data-lucide="'+(t.status==='Hoàn thành'?'circle-check':'circle-dashed')+'" aria-hidden="true"></i><span><strong>'+esc(t.title)+'</strong><small>'+esc(t.status||'Đang cập nhật')+' · '+esc(t.owner||'Chưa phân công')+(t.due?' · '+fmt(t.due):'')+'</small></span><span class="arrow">↗</span></button>';}
 function linked(){const tasks=data.tasks.filter(t=>t.note===selected);root.classList.toggle('has-task-links',tasks.length>0);$('#rn-linkcount').textContent=tasks.length+' công việc';$('#rn-linked').innerHTML=tasks.map(taskCard).join('')||'<p class="linked-empty">Chọn một đoạn trong ghi chú để tạo công việc, hoặc bấm “Tạo công việc”.</p>';}
 function editor(){const n=current();$('#rn-editor-view').hidden=!n;$('#rn-empty').hidden=!!n;$('#rn-task-view').hidden=true;if(!n)return;$('#rn-date').textContent='Cập nhật '+fmt(n.updated);$('#rn-title').value=n.title;$('#rn-body').innerHTML=n.body;$('#rn-tags').value=n.tags||'';$('#rn-move').innerHTML=data.folders.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join('');$('#rn-move').value=n.folder;$('#rn-pin').classList.toggle('active',!!n.pinned);$('#rn-pin').setAttribute('aria-label',n.pinned?'Bỏ ghim ghi chú':'Ghim ghi chú');$('#rn-delete').setAttribute('aria-label',n.deleted?'Khôi phục ghi chú':'Chuyển ghi chú vào mục đã xoá');$('#rn-delete').innerHTML='<i data-lucide="'+(n.deleted?'undo-2':'trash-2')+'" aria-hidden="true"></i>';$('#rn-create-task').disabled=!!n.deleted||!meta.canCreate;snippet='';$('#rn-selection').hidden=true;linked();}
 const phone=matchMedia('(max-width:600px)');
 let mobileScreen='list',mobileReturn='list',mobileHistoryReady=false;
 root.dataset.screen='list';$('#rn-mobile-status').textContent='Đang tải…';
 function mobileChrome(){
  root.dataset.screen=mobileScreen;
  const n=current(),name=folder==='all'?'Ghi chú':folder==='trash'?'Đã xoá gần đây':data.folders.find(f=>f.id===folder)?.name||'Ghi chú';
  $('#rn-mobile-title').textContent=mobileScreen==='folders'?'Thư mục':mobileScreen==='tasks'?'Công việc':name;
  $('#rn-mobile-back').hidden=mobileScreen==='folders';
  $('#rn-mobile-back span').textContent=mobileScreen==='editor'?(name.length>18?'Ghi chú':name):mobileScreen==='tasks'?'Ghi chú':'Thư mục';
  $('#rn-done').hidden=mobileScreen!=='editor';
  $('#rn-more').hidden=mobileScreen==='folders'||mobileScreen==='tasks';
  $('#rn-mobile-folder-new').hidden=mobileScreen!=='folders';
  const count=data.notes.filter(x=>folder==='trash'?x.deleted:!x.deleted&&(folder==='all'||x.folder===folder)).length;
  $('#rn-mobile-count').textContent=mobileScreen==='folders'?data.folders.length+' thư mục':count+' ghi chú';
  $('#rn-mobile-status').textContent=saveLabel==='Đã lưu trên Lark'?'':saveLabel;
  const canNote=mobileScreen==='editor'&&!!n;
  for(const id of ['rn-menu-task','rn-menu-pin','rn-menu-details','rn-menu-delete'])$('#'+id).hidden=!canNote;
  $('#rn-menu-task').disabled=!meta.canCreate||!!n?.deleted;
  $('#rn-menu-pin span').textContent=n?.pinned?'Bỏ ghim':'Ghim ghi chú';
  $('#rn-menu-delete span').textContent=n?.deleted?'Khôi phục ghi chú':'Xoá ghi chú';
 }
 function fitTitle(){const el=$('#rn-title');if(!el.getClientRects().length)return;el.style.height='auto';el.style.height=el.scrollHeight+'px';}
 let titleWidth=0;
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width&&width!==titleWidth){titleWidth=width;fitTitle();}}).observe($('#rn-title'));
 document.fonts?.ready.then(()=>requestAnimationFrame(fitTitle));
 function mobileState(screen,replace=false){
  const back=screen==='editor'?'list':screen==='list'?'folders':screen==='tasks'?mobileReturn:null;
  mobileScreen=screen;mobileChrome();fitTitle();requestAnimationFrame(fitTitle);$('#rn-format-tray').hidden=true;$('#rn-format').setAttribute('aria-expanded','false');root.removeAttribute('data-details');
  if(!phone.matches)return;
  const state={hubNotes:true,screen,folder,selected,back};
  if(!mobileHistoryReady||replace||(screen==='editor'&&history.state?.screen==='editor')){history.replaceState(state,'');mobileHistoryReady=true;}else if(history.state?.screen!==screen||history.state?.selected!==selected||history.state?.folder!==folder)history.pushState(state,'');
 }
 function backMobile(){
  if(taskBusy)return;
  document.activeElement?.blur();
  if(history.state?.hubNotes&&history.state.back&&mobileHistoryReady&&history.state.screen!=='list'){history.back();return;}
  mobileState(mobileScreen==='list'?'folders':mobileScreen==='tasks'?mobileReturn:'list',true);
 }
 function render(){folders();list();editor();icons();mobileChrome();fitTitle();}
 window.addEventListener('popstate',e=>{
  if(!e.state?.hubNotes||!phone.matches)return;
  folder=e.state.folder||'all';selected=e.state.selected;mobileScreen=e.state.screen==='editor'&&!current()?'list':e.state.screen;
  $('#rn-more-modal').hidden=true;$('#rn-format-tray').hidden=true;render();
  if(mobileScreen==='tasks')showTaskBoard();
 });
 phone.addEventListener('change',()=>{mobileChrome();fitTitle();fitMobileViewport();if(phone.matches)mobileState(mobileScreen,true);});
 function fitMobileViewport(){
  if(!phone.matches){root.style.removeProperty('--n-viewport');return;}
  let height=window.visualViewport?.height||innerHeight;
  try{if(parent!==window&&parent.visualViewport&&window.frameElement){const rect=window.frameElement.getBoundingClientRect();height=Math.min(innerHeight,parent.visualViewport.height+parent.visualViewport.offsetTop-rect.top);}}catch(_){}
  root.style.setProperty('--n-viewport',Math.max(180,height)+'px');
 }
 const resizeMobile=()=>requestAnimationFrame(fitMobileViewport);
 window.visualViewport?.addEventListener('resize',resizeMobile);
 window.addEventListener('resize',resizeMobile);
 try{if(parent!==window)parent.visualViewport?.addEventListener('resize',resizeMobile);}catch(_){}
 fitMobileViewport();

 function updateNote(){fitTitle();const n=current();if(!n)return;n.title=$('#rn-title').value;n.body=$('#rn-body').innerHTML;n.tags=$('#rn-tags').value;n.updated=stamp();persist();folders();list();icons();mobileChrome();}
 function choose(id){selected=id;render();mobileState('editor');}
 function addNote(meeting){if(taskBusy)return;if(!data.folders.length||blocked){toast(blocked?'Anh giữ bản nháp và tải lại dữ liệu trước nhé.':'Đang tải ghi chú, anh đợi một chút nhé.');return;}folder=meeting?'meet':folder==='all'||folder==='trash'?'quick':folder;const n={id:uid(),folder,title:meeting?'Cuộc họp mới':'',body:meeting?'<h3>Thông tin cuộc họp</h3><p>Thời gian: </p><p>Người tham gia: </p><h3>Nội dung trao đổi</h3><p><br></p><h3>Kết luận</h3><p><br></p><h3>Các việc cần triển khai</h3><p><br></p>':'',tags:meeting?'#CuộcHọp':'',updated:stamp(),pinned:false};data.notes.unshift(n);selected=n.id;query='';$('#rn-search').value='';persist();render();mobileState('editor');$('#rn-title').focus();$('#rn-title').select();}
 function showTask(task){if(task){window.parent.location.hash='#/m/cong-viec?rec='+encodeURIComponent(task.id);return;}if(!meta.canCreate){toast('Anh chưa có quyền tạo việc hoặc Bảng công việc đang tải.');return;}if(taskRequest&&taskRequest.noteId!==selected){toast('Có một lượt tạo việc chưa xác định kết quả. Anh mở lại ghi chú trước để kiểm tra.');return;}const n=task?data.notes.find(n=>n.id===task.note):current();if(!n)return;taskNote=n.id;dialogReturn=phone.matches?$('#rn-more'):document.activeElement;$('#rn-modal-title').textContent=task?'Chi tiết công việc':'Tạo công việc';$('#rn-task-submit').textContent=task?'Lưu thay đổi':'Tạo công việc';$('#rn-task-title').value=task?.title||(snippet.trim().split('\n')[0].slice(0,200))||n.title;$('#rn-task-detail').value=task?.detail||snippet||'';$('#rn-owner').value=task?.owner||'';$('#rn-due').value=task?.due||'';$('#rn-priority').value=meta.options.priority?.find(x=>x.includes('Trung bình'))||meta.options.priority?.[0]||'🟡 Trung bình';$('#rn-type').value=task?.type||'Content';$('#rn-source').innerHTML='Từ ghi chú: <button type="button" data-source="'+esc(n.id)+'">'+esc(n.title||'Chưa đặt tên')+' ↗</button>';if(taskRequest){$('#rn-task-title').value=taskRequest.title;$('#rn-task-detail').value=taskRequest.detail;$('#rn-modal-title').textContent='Kiểm tra lượt tạo việc đã gửi';$('#rn-task-submit').textContent='Kiểm tra kết quả';}$('#rn-task-modal').hidden=false;$('#rn-task-title').focus();}
 function closeTask(){if(taskBusy)return;$('#rn-task-modal').hidden=true;dialogReturn?.focus();}
 function selection(){const s=window.getSelection();if(s&&s.rangeCount&&$('#rn-body').contains(s.getRangeAt(0).commonAncestorContainer)){snippet=s.toString().trim();$('#rn-selection').hidden=!snippet;}}
 root.addEventListener('click',e=>{const f=e.target.closest('[data-folder]');if(f){folder=f.dataset.folder;const ns=data.notes.filter(n=>!n.deleted&&(folder==='all'||n.folder===folder));selected=ns[0]?.id||null;query='';$('#rn-search').value='';render();mobileState('list');return;}const n=e.target.closest('[data-note]');if(n){choose(n.dataset.note);return;}const t=e.target.closest('[data-task]');if(t){showTask(data.tasks.find(t=>t.id===e.target.closest('[data-task]').dataset.task));return;}const s=e.target.closest('[data-source]');if(s){closeTask();const n=data.notes.find(n=>n.id===s.dataset.source);folder=n.deleted?'trash':n.folder;choose(n.id);return;}const cmd=e.target.closest('[data-cmd]');if(cmd){$('#rn-body').focus();document.execCommand(cmd.dataset.cmd,false,null);updateNote();}});
 $$('.tools button,.mobile-formatbar button').forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));
 $('#rn-new').onclick=()=>addNote(false);$('#rn-meeting').onclick=()=>addNote(true);
 $('#rn-title').oninput=updateNote;$('#rn-body').oninput=updateNote;$('#rn-tags').oninput=updateNote;
 $('#rn-body').ondrop=e=>e.preventDefault();
 $('#rn-body').onpaste=e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));updateNote();};
 $('#rn-body').addEventListener('change',e=>{if(e.target.type==='checkbox'){e.target.toggleAttribute('checked',e.target.checked);updateNote();}});
 $('#rn-body').addEventListener('mouseup',selection);$('#rn-body').addEventListener('keyup',selection);
 $('#rn-move').onchange=()=>{current().folder=$('#rn-move').value;current().updated=stamp();persist();folders();list();icons();mobileChrome();};
 $('#rn-pin').onclick=()=>{const n=current();if(!n)return;n.pinned=!n.pinned;persist();render();};
 $('#rn-delete').onclick=()=>{const n=current();if(!n)return;const restore=!!n.deleted;n.deleted=!restore;persist();selected=data.notes.find(x=>(folder==='trash'?x.deleted:!x.deleted&&(folder==='all'||x.folder===folder)))?.id||null;render();mobileState('list',true);toast(restore?'Đã khôi phục ghi chú':'Đã chuyển vào “Đã xoá gần đây”');};
 $('#rn-trash').onclick=()=>{folder='trash';selected=data.notes.find(n=>n.deleted)?.id||null;query='';$('#rn-search').value='';render();mobileState('list');};
 $('#rn-search').oninput=()=>{query=$('#rn-search').value;list();};
 $('#rn-checklist').onclick=()=>{$('#rn-body').focus();document.execCommand('insertHTML',false,'<p><input type="checkbox" aria-label="Đánh dấu mục ghi chú"> Việc cần làm</p>');updateNote();};
 $('#rn-create-task').onclick=()=>showTask();$('#rn-selection-task').onclick=()=>showTask();$('#rn-task-cancel').onclick=closeTask;
 $('#rn-task-form').onsubmit=async e=>{e.preventDefault();if(taskBusy)return;const title=$('#rn-task-title').value.trim();if(!title)return;taskBusy=true;sync?.pause();$('#rn-layout').inert=true;$('#rn-task-submit').disabled=true;
  const owner=$('#rn-owner').value;
  const request=taskRequest||{requestId:uid(),noteId:taskNote,title,detail:$('#rn-task-detail').value,owner:owner?[{id:owner}]:[],deadline1:$('#rn-due').value?new Date($('#rn-due').value).toISOString():'',priority:$('#rn-priority').value,workType:$('#rn-type').value};
  try{await flush();taskRequest=request;try{sessionStorage.setItem('hub-notes-task:'+cacheKey,JSON.stringify(request));}catch(_){}const r=await api('/tasks',{method:'POST',body:JSON.stringify(request)});data.tasks=r.refs.map(ref=>data.tasks.find(t=>t.id===ref.id)||{...ref,status:'Đang cập nhật'});taskRequest=null;try{sessionStorage.removeItem('hub-notes-task:'+cacheKey);}catch(_){}taskBusy=false;closeTask();folders();linked();icons();await refreshTasks();toast('Đã tạo công việc trong Bảng công việc');}
  catch(e){if(e.status>=400&&e.status<500&&e.status!==409){taskRequest=null;try{sessionStorage.removeItem('hub-notes-task:'+cacheKey);}catch(_){}}toast(e.message);$('#rn-error').textContent=e.message;$('#rn-error').hidden=false; }
  finally{taskBusy=false;$('#rn-layout').inert=false;$('#rn-task-submit').disabled=false;sync?.resume();await sync?.pull().catch(()=>{});}
 };
 function showTaskBoard(){$('#rn-editor-view').hidden=true;$('#rn-empty').hidden=true;$('#rn-task-view').hidden=false;$('#rn-task-list').innerHTML=data.tasks.map(taskCard).join('')||'<p>Chưa tạo công việc nào.</p>';icons();}
 $('#rn-tasks').onclick=()=>{mobileReturn=mobileScreen==='editor'?'editor':'list';showTaskBoard();mobileState('tasks');};$('#rn-back').onclick=()=>{editor();icons();mobileState(mobileReturn,true);};
 $('#rn-folder-new').onclick=()=>{if(!data.folders.length||blocked){toast('Anh đợi dữ liệu ghi chú sẵn sàng nhé.');return;}$('#rn-folder-modal').hidden=false;$('#rn-folder-name').value='';$('#rn-folder-name').focus();};$('#rn-folder-cancel').onclick=()=>{$('#rn-folder-modal').hidden=true;$('#rn-folder-new').focus();};$('#rn-folder-form').onsubmit=e=>{e.preventDefault();const name=$('#rn-folder-name').value.trim();if(!name)return;if(data.folders.some(f=>f.name.toLowerCase()===name.toLowerCase())){toast('Thư mục này đã có rồi');return;}const f={id:uid(),name,icon:'folder'};data.folders.push(f);folder=f.id;selected=null;persist();$('#rn-folder-modal').hidden=true;render();mobileState('list');};
 root.addEventListener('keydown',e=>{const modal=!$('#rn-task-modal').hidden?$('#rn-task-modal'):!$('#rn-folder-modal').hidden?$('#rn-folder-modal'):!$('#rn-more-modal').hidden?$('#rn-more-modal'):null;if(!modal)return;if(e.key==='Escape'){e.preventDefault();if(modal.id==='rn-task-modal')closeTask();else if(modal.id==='rn-more-modal')closeMore();else{$('#rn-folder-modal').hidden=true;$('#rn-folder-new').focus();}}if(e.key==='Tab'){const els=Array.from(modal.querySelectorAll('input,select,textarea,button')).filter(x=>!x.disabled);const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});

 function closeMore(){$('#rn-more-modal').hidden=true;$('#rn-more').focus();}
 $('#rn-mobile-back').onclick=backMobile;
 $('#rn-mobile-new').onclick=()=>addNote(false);$('#rn-editor-new').onclick=()=>addNote(false);
 $('#rn-mobile-folder-new').onclick=()=>$('#rn-folder-new').click();
 $('#rn-done').onclick=()=>{document.activeElement?.blur();$('#rn-format-tray').hidden=true;$('#rn-format').setAttribute('aria-expanded','false');flush().catch(()=>{});};
 $('#rn-more').onclick=()=>{mobileChrome();document.activeElement?.blur();$('#rn-more-modal').hidden=false;$('#rn-more-close').focus();};
 $('#rn-more-close').onclick=closeMore;
 $('#rn-more-modal').onclick=e=>{if(e.target===$('#rn-more-modal'))closeMore();};
 for(const [menu,target] of [['rn-menu-task','rn-create-task'],['rn-menu-pin','rn-pin'],['rn-menu-delete','rn-delete'],['rn-menu-meeting','rn-meeting'],['rn-menu-tasks','rn-tasks']])$('#'+menu).onclick=()=>{closeMore();$('#'+target).click();};
 $('#rn-menu-details').onclick=()=>{closeMore();root.dataset.details=root.dataset.details==='open'?'':'open';};
 $('#rn-format').onmousedown=e=>e.preventDefault();
 $('#rn-format').onclick=()=>{const open=$('#rn-format-tray').hidden;$('#rn-format-tray').hidden=!open;$('#rn-format').setAttribute('aria-expanded',String(open));};
 $('#rn-body').addEventListener('touchend',selection);
 $('#rn-retry').onclick=()=>{if(!sync){loadNotes();return;}sync.needsPull=true;sync.fatal=false;flush().catch(()=>{});};
 $('#rn-download').onclick=()=>{const draft=sync?.snapshot()||{folders:data.folders,notes:data.notes};const b=new Blob([JSON.stringify(draft,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ghi-chu-ban-nhap.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 $('#rn-discard').onclick=()=>{if(!confirm('Bỏ bản nháp chưa đồng bộ trong cửa sổ này và tải lại bản đã lưu?'))return;for(const name of ['localStorage','sessionStorage']){try{window[name].removeItem(draftKey);if(legacyRaw&&window[name].getItem(legacyDraftKey)===legacyRaw)window[name].removeItem(legacyDraftKey);}catch(_){}}discarding=true;sync?.stop();location.reload();};
 window.addEventListener('beforeunload',e=>{if(!discarding&&sync?.dirty){backup();e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(sync?.dirty){backup();if(!taskBusy)flush().catch(()=>{});}}else catchUp();});
 window.addEventListener('online',catchUp);
 window.addEventListener('focus',catchUp);
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent)return;if(e.data?.hub==='theme'){syncHubAppearance(e.data.v);}if(e.data?.hub==='ghi-chu'&&data.folders.length)openNote(e.data.note);});
 function isVisible(){try{return !document.hidden&&(!window.frameElement||window.frameElement.getClientRects().length>0);}catch(_){return !document.hidden;}}
 async function catchUp(){
  if(!isVisible()||taskBusy)return;
  if(!sync){loadNotes();return;}
  if(sync.flight||Date.now()-lastPull<2000)return;
  lastPull=Date.now();
  await sync.pull().catch(()=>{});
  if(sync.dirty&&!sync.fatal)sync.flush(false).catch(()=>{});
  if(Date.now()-lastTasks>30000)refreshTasks(true);
  if(!meta.canCreate&&Date.now()-lastMeta>60000)loadMeta();
 }
 setInterval(catchUp,6000);
 async function loadMeta(){
  lastMeta=Date.now();
  try{meta=await api('/meta');const people=[...new Map(meta.people.map(p=>[p.id,p])).values()];$('#rn-owner').innerHTML='<option value="">Chưa phân công</option>'+people.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name||p.id)+'</option>').join('');$('#rn-owner').disabled=!meta.canAssign;for(const [id,key,fallback] of [['rn-priority','priority',['🟡 Trung bình']],['rn-type','workType',['Content']]]){$('#'+id).innerHTML=(meta.options[key]?.length?meta.options[key]:fallback).map(v=>'<option>'+esc(v)+'</option>').join('');}if(current())$('#rn-create-task').disabled=!!current().deleted||!meta.canCreate;mobileChrome();}catch(_){}
 }
 async function loadNotes(){
  if(loading||sync)return;loading=true;
  try{
   const d=await api();cacheKey=d.cacheKey;
   let tabId;try{tabId=sessionStorage.getItem('hub-notes-tab');if(!tabId){tabId=uid();sessionStorage.setItem('hub-notes-tab',tabId);}}catch(_){tabId=uid();}
   legacyDraftKey='hub-notes-draft:'+cacheKey;draftKey=legacyDraftKey+':'+tabId;
   let draft;for(const key of [draftKey,legacyDraftKey]){try{const raw=localStorage.getItem(key)||sessionStorage.getItem(key);draft=JSON.parse(raw);if(draft&&key===legacyDraftKey)legacyRaw=raw;}catch(_){}if(draft)break;}
   try{taskRequest=JSON.parse(sessionStorage.getItem('hub-notes-task:'+cacheKey));}catch(_){}
   if(typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel('hub-notes:'+cacheKey);channel.onmessage=e=>{if(sync&&e.data?.version>sync.version){lastPull=0;catchUp();}};}
   sync=new HubNotesSync.Sync({load:()=>api(),write:(version,snapshot)=>api('',{method:'PATCH',body:JSON.stringify({version,data:snapshot})}),onChange:applySynced,onError:syncError,
    onDraft:snapshot=>{if(snapshot)backup(snapshot);else{for(const name of ['localStorage','sessionStorage']){try{window[name].removeItem(draftKey);if(legacyRaw&&window[name].getItem(legacyDraftKey)===legacyRaw)window[name].removeItem(legacyDraftKey);}catch(_){}}}},
    onStatus:state=>{label({pending:'Chưa đồng bộ…',saving:'Đang lưu…',synced:'Đã lưu trên Lark',offline:'Chưa đồng bộ · sẽ tự thử lại'}[state]);if(state==='synced')channel?.postMessage({version:sync.version});}
   });
   sync.start(d,draft);selected=data.notes.find(n=>!n.deleted)?.id||null;render();mobileState('list',true);$('#rn-layout').inert=false;
   const note=new URLSearchParams(location.search).get('note');if(note)openNote(note);
   loadMeta();refreshTasks(true);
  }catch(e){syncError(e);label('Chưa kết nối · sẽ tự thử lại');}finally{loading=false;}
 }
 loadNotes();
})();
