const fs=require('fs'), path=require('path'), os=require('os'), cp=require('child_process');
const ENV=fs.readFileSync('ADS_CONNECT_JSON.txt','utf8').trim();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rd-'));

const chay=(file,env)=>JSON.parse(cp.execFileSync(process.execPath,['-e',
  `const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});
   const c=k.read(); const s=k.status();
   console.log(JSON.stringify({nguon:s.nguon,
     meta:!!c.meta.accessToken, google:!!c.googleAds.refreshToken, tiktok:!!c.tiktok.accessToken,
     sanSang:s.providers.filter(p=>p.sanSang).length}));`],
  {env:{...process.env,...env,LARK_CONNECT_FILE:file},cwd:process.cwd(),encoding:'utf8'}));

// file RỖNG kiểu app tự ghi khi bấm "Lưu tuỳ chọn" lúc chưa có token
const rong=path.join(tmp,'rong.json');
fs.writeFileSync(rong, JSON.stringify({
  meta:{enabled:false,accessToken:'',accountIds:[]},
  tiktok:{enabled:false,accessToken:'',advertiserIds:[]},
  googleAds:{enabled:false,clientId:'',clientSecret:'',refreshToken:'',developerToken:'',customerIds:[]},
  googleSheet:{enabled:false,csvUrl:''},
  dongBo:{soNgayLui:7,moiSoGio:1}
},null,2));

let pass=0,fail=0;
const t=(n,c,x='')=>{c?(pass++,console.log('  ok  '+n)):(fail++,console.log('  FAIL '+n+' :: '+x))};

console.log('— Render: có biến môi trường + file RỖNG (đúng lỗi đang xảy ra)');
let r=chay(rong,{RENDER:'1',ADS_CONNECT_JSON:ENV});
t('lùi về biến môi trường', r.nguon==='env', r.nguon);
t('Facebook đọc được token', r.meta, JSON.stringify(r));
t('Google đọc được token', r.google);
t('có kênh sẵn sàng', r.sanSang>=2, String(r.sanSang));

console.log('\n— Render: biến môi trường, không có file');
r=chay(path.join(tmp,'khong-co.json'),{RENDER:'1',ADS_CONNECT_JSON:ENV});
t('đọc từ env', r.nguon==='env' && r.meta && r.google);

console.log('\n— Máy cá nhân: file CÓ token thì file phải thắng');
r=chay('ket-noi.json',{});
t('đọc từ file', r.nguon==='file');
t('có cả TikTok (chỉ file mới có)', r.tiktok, JSON.stringify(r));

console.log('\n— Biến môi trường JSON hỏng');
r=chay(path.join(tmp,'khong-co.json'),{RENDER:'1',ADS_CONNECT_JSON:'{hỏng'});
t('không sập, báo trống', r.sanSang===0);

console.log('\n'+pass+' pass · '+fail+' fail');
process.exit(fail?1:0);
