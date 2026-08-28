const B='http://localhost:5176';
let pass=0, fail=0;
const t=(name,cond,extra='')=>{ if(cond){pass++;console.log('  ok  '+name);} else {fail++;console.log('  FAIL '+name+' '+extra);} };
async function g(p){ const r=await fetch(B+p); const txt=await r.text(); let j=null; try{j=JSON.parse(txt)}catch(_){}
  return {status:r.status, j, txt}; }
(async()=>{
  console.log('— /api/meta');
  let r=await g('/api/meta');
  t('status 200', r.status===200, r.txt.slice(0,200));
  const m=r.j;
  t('có me', !!m.me, JSON.stringify(m.me));
  t('6 chiến dịch', m.counts.campaigns===6);
  t('13 quảng cáo', m.counts.ads===13);
  t('platforms >=3', m.platforms.length>=3, JSON.stringify(m.platforms));
  t('targets có cpa', m.targets && m.targets.cpa.default>0);

  console.log('— /api/overview (7 ngày)');
  r=await g('/api/overview?days=7');
  t('status 200', r.status===200);
  const o=r.j;
  t('kpi.spend > 0', o.kpi.spend>0, o.kpi.spend);
  t('series đủ 7 ngày', o.series.length===7, o.series.length);
  t('stack cùng độ dài', o.stack.length===o.series.length);
  t('byPlatform không rỗng', o.byPlatform.length>0);
  t('tổng byPlatform = kpi.spend', Math.abs(o.byPlatform.reduce((s,p)=>s+p.spend,0)-o.kpi.spend)<1);
  t('tổng series = kpi.spend', Math.abs(o.series.reduce((s,p)=>s+p.spend,0)-o.kpi.spend)<1);
  t('alerts là mảng', Array.isArray(o.alerts));

  console.log('— lọc theo nền tảng');
  r=await g('/api/overview?days=7&platform=TikTok');
  t('chỉ TikTok', r.j.byPlatform.every(p=>p.platform==='TikTok'), JSON.stringify(r.j.byPlatform.map(p=>p.platform)));
  const tikSpend=r.j.kpi.spend;
  r=await g('/api/overview?days=7&platform=Facebook');
  const fbSpend=r.j.kpi.spend;
  r=await g('/api/overview?days=7&platform=TikTok,Facebook');
  t('cộng 2 nền tảng khớp', Math.abs(r.j.kpi.spend-(tikSpend+fbSpend))<1, r.j.kpi.spend+' vs '+(tikSpend+fbSpend));

  console.log('— lọc theo khoảng ngày cố định');
  r=await g('/api/overview?from=2026-08-01&to=2026-08-26');
  t('26 ngày', r.j.series.length===26, r.j.series.length);
  const tongBase = r.j.kpi.spend;
  t('tổng > 0', tongBase > 0, String(tongBase));
  // Base là dữ liệu sống nên không neo vào con số cố định. Bất biến đáng giữ:
  // đọc từ Base và đọc trực tiếp phải ra CÙNG một tổng cho cùng khoảng ngày.
  // Hai nguồn KHÔNG khớp tuyệt đối, và đó là chuyện bình thường: Base là ảnh chụp
  // tại lượt đồng bộ gần nhất, còn Trực tiếp là số nền tảng đang báo lúc này —
  // Meta vẫn khai báo lại chuyển đổi trong nhiều ngày. Cái cần bắt là sai lệch LỚN
  // (đếm hai lần, ghép sai bản ghi), nên kiểm theo ngưỡng phần trăm.
  const rb = await g('/api/overview?nguon=base&from=2026-08-20&to=2026-08-26');
  const rl = await g('/api/overview?nguon=live&from=2026-08-20&to=2026-08-26');
  const lech = Math.abs(rb.j.kpi.spend - rl.j.kpi.spend);
  const mau = Math.max(rb.j.kpi.spend, rl.j.kpi.spend, 1);
  t('Base và Trực tiếp lệch dưới 5% (không đếm hai lần)',
    lech / mau < 0.05,
    `${rb.j.kpi.spend} vs ${rl.j.kpi.spend} — lệch ${(lech / mau * 100).toFixed(2)}%`);
  const lechCv = Math.abs(rb.j.kpi.conversions - rl.j.kpi.conversions);
  t('chuyển đổi lệch dưới 5%',
    lechCv / Math.max(rb.j.kpi.conversions, rl.j.kpi.conversions, 1) < 0.05,
    rb.j.kpi.conversions + ' vs ' + rl.j.kpi.conversions);

  console.log('— /api/campaigns, /api/groups, /api/ads');
  for (const p of ['/api/campaigns','/api/groups','/api/ads']) {
    r=await g(p+'?days=7');
    t(p+' 200 + rows', r.status===200 && Array.isArray(r.j.rows) && r.j.rows.length>0, r.txt.slice(0,150));
  }
  r=await g('/api/ads?days=30');
  t('ads có action', r.j.rows.every(x=>x.action), '');
  t('ads có cpaTarget', r.j.rows.every(x=>typeof x.cpaTarget==='number'));

  console.log('— /api/daily + /api/entry');
  r=await g('/api/daily?from=2026-08-26&to=2026-08-26');
  t('daily 26/08 có dòng', r.j.rows.length>0, r.j.rows.length);
  t('dòng ở chế độ trực tiếp có id hợp lệ', r.j.rows.every(x=>/^(rec|live:)/.test(x.id)));
  const rBase = await g('/api/daily?nguon=base&from=2026-08-26&to=2026-08-26');
  t('dòng đọc từ Base đều là record thật', rBase.j.rows.every(x=>/^rec/.test(x.id)));
  r=await g('/api/entry?date=2026-08-26');
  t('entry 13 dòng', r.j.rows.length===13, r.j.rows.length);
  t('entry có recordIds', r.j.rows.some(x=>x.recordIds.length>0));

  console.log('— /api/alerts, /api/sales, /api/targets, csv');
  r=await g('/api/alerts'); t('alerts 200', r.status===200 && r.j.rows.length>0, r.j&&r.j.rows&&r.j.rows.length);
  r=await g('/api/sales?days=30'); t('sales 200', r.status===200 && Array.isArray(r.j.byChannel));
  r=await g('/api/targets'); t('targets 200', r.status===200 && r.j.cpa);
  r=await g('/api/export.csv?days=3'); t('csv có header', r.txt.includes('Chi tiêu'), r.txt.slice(0,80));

  console.log('— tĩnh + lỗi');
  r=await g('/'); t('index.html', r.txt.includes('Quản lý quảng cáo'));
  r=await g('/app.js'); t('app.js', r.txt.includes('VIEW'));
  r=await g('/styles.css'); t('styles.css', r.txt.includes('--brand'));
  r=await g('/api/khong-co'); t('404 API', r.status===404);

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail?1:0);
})();
