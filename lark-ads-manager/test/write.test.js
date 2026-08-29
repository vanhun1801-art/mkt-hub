const B='http://localhost:5176';
const j=async(p,o)=>{const r=await fetch(B+p,o?{...o,headers:{'Content-Type':'application/json'}}:undefined);
  const t=await r.text(); let x=null; try{x=JSON.parse(t)}catch(_){}; return {s:r.status,x,t};};
/* Đọc lại luôn kèm ?nguon=base.
 * Từ khi bật kênh trực tiếp (Meta/Google Ads), các endpoint đọc lấy số THẲNG từ
 * nền tảng cho 14 ngày gần nhất và bỏ qua dòng cũ của Base trong khoảng đó — nên
 * dòng nhập tay mà test vừa ghi sẽ bị số live thay chỗ, không phải ghi hỏng. */
(async()=>{
  const DATE='2026-08-27';
  const meta=(await j('/api/meta')).x;
  const ad=meta.ads.find(a=>a.campaignName.includes('SPCN_CT7'))||meta.ads[0];
  console.log('QC test:', ad.name, '|', ad.campaignName);

  // 1) tạo mới
  let r=await j('/api/entry',{method:'POST',body:JSON.stringify({date:DATE,rows:[
    {adId:ad.id,spend:123456,impressions:1000,clicks:25,conversions:3,label:'__TEST_APP_DELETE_ME__'}]})});
  console.log('1) POST /api/entry ->',r.s,JSON.stringify(r.x));
  if(r.x.created!==1) throw new Error('không tạo được dòng mới');

  // 2) đọc lại: đúng ngày, đúng số, đúng liên kết
  let d=(await j('/api/daily?nguon=base&from='+DATE+'&to='+DATE)).x;
  const row=d.rows.find(x=>x.label==='__TEST_APP_DELETE_ME__');
  console.log('2) đọc lại ->',row && {date:row.date,ad:row.adName,spend:row.spend,cpa:row.cpa,plat:row.platform});
  if(!row) throw new Error('không thấy dòng vừa tạo');
  if(row.date!==DATE) throw new Error('NGÀY SAI: '+row.date+' (mong '+DATE+')');
  if(row.spend!==123456||row.conversions!==3) throw new Error('số sai');
  if(row.orphan) throw new Error('không gắn được quảng cáo');
  if(row.cpa!==41152) console.log('   (cpa='+row.cpa+')');

  // 3) cập nhật qua /api/entry (không tạo dòng trùng)
  r=await j('/api/entry',{method:'POST',body:JSON.stringify({date:DATE,rows:[
    {adId:ad.id,spend:200000,impressions:2000,clicks:50,conversions:5,label:'__TEST_APP_DELETE_ME__'}]})});
  console.log('3) POST lần 2 ->',r.s,JSON.stringify(r.x));
  if(r.x.updated!==1||r.x.created!==0) throw new Error('phải UPDATE chứ không CREATE');
  d=(await j('/api/daily?nguon=base&from='+DATE+'&to='+DATE)).x;
  const same=d.rows.filter(x=>x.label==='__TEST_APP_DELETE_ME__');
  console.log('   số dòng sau update:',same.length,'spend:',same[0].spend);
  if(same.length!==1) throw new Error('bị tạo dòng trùng');
  if(same[0].spend!==200000) throw new Error('update không vào');

  // 4) PATCH 1 dòng
  r=await j('/api/daily/'+row.id,{method:'PATCH',body:JSON.stringify({spend:999,conversions:1})});
  console.log('4) PATCH ->',r.s,JSON.stringify(r.x));
  d=(await j('/api/daily?nguon=base&from='+DATE+'&to='+DATE)).x;
  console.log('   sau PATCH spend =',d.rows.find(x=>x.id===row.id).spend);

  // 5) PATCH chiến dịch (ghi rồi trả về nguyên trạng)
  const camp=meta.campaigns.find(c=>c.name.includes('SPCN_CT7'));
  let before=(await j('/api/campaigns?days=7')).x.rows.find(c=>c.id===camp.id);
  console.log('5) CD',camp.name,'note trước =',JSON.stringify(before.note),'| dailyBudget =',before.dailyBudget);
  r=await j('/api/campaign/'+camp.id,{method:'PATCH',body:JSON.stringify({note:(before.note||'')+' [test]'})});
  console.log('   PATCH ->',r.s,JSON.stringify(r.x));
  let after=(await j('/api/campaigns?days=7')).x.rows.find(c=>c.id===camp.id);
  console.log('   note sau =',JSON.stringify(after.note));
  if(!after.note.endsWith('[test]')) throw new Error('PATCH chiến dịch không vào');
  await j('/api/campaign/'+camp.id,{method:'PATCH',body:JSON.stringify({note:before.note||''})});
  after=(await j('/api/campaigns?days=7')).x.rows.find(c=>c.id===camp.id);
  console.log('   đã trả nguyên trạng:',JSON.stringify(after.note));

  // 6) xoá dòng test
  r=await j('/api/daily/'+row.id,{method:'DELETE'});
  console.log('6) DELETE ->',r.s,JSON.stringify(r.x));
  d=(await j('/api/daily?nguon=base&from='+DATE+'&to='+DATE)).x;
  const left=d.rows.filter(x=>x.label==='__TEST_APP_DELETE_ME__');
  console.log('   còn lại dòng test:',left.length);
  if(left.length) throw new Error('xoá không sạch');

  console.log('\nTẤT CẢ VÒNG GHI ĐỀU ĐÚNG, đã dọn sạch dữ liệu test.');
})().catch(e=>{console.error('\nLỖI:',e.message);process.exit(1)});
