const fs=require('fs'), path=require('path'), os=require('os'), cp=require('child_process');
const DAY=fs.readFileSync('ADS_CONNECT_JSON.txt','utf8').trim();          // đủ 3 kênh
const THIEU=JSON.stringify((()=>{const j=JSON.parse(DAY); j.tiktok={...j.tiktok,accessToken:''}; return j;})());
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bv-'));

const chay=(file,env)=>JSON.parse(cp.execFileSync(process.execPath,['-e',
  `const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});
   console.log(JSON.stringify(k.benVung()));`],
  {env:{...process.env,...env,LARK_CONNECT_FILE:file},cwd:process.cwd(),encoding:'utf8'}));

let pass=0,fail=0;
const t=(n,c,x='')=>{c?(pass++,console.log('  ok  '+n)):(fail++,console.log('  FAIL '+n+' :: '+x))};

console.log('— Render · biến đủ 3 kênh · file có token (đúng hiện trạng)');
let b=chay('ket-noi.json',{RENDER:'1',ADS_CONNECT_JSON:DAY});
t('không phải lo', b.canLo===false, JSON.stringify(b));
t('giữ đủ 3 kênh', b.seCon.length===3, JSON.stringify(b.seCon));

console.log('\n— Render · biến THIẾU TikTok · file có token (bẫy hôm nay)');
b=chay('ket-noi.json',{RENDER:'1',ADS_CONNECT_JSON:THIEU});
t('cảnh báo bật', b.canLo===true);
t('chỉ ra đúng kênh sẽ mất là tiktok', JSON.stringify(b.seMat)==='["tiktok"]', JSON.stringify(b.seMat));
t('nói rõ kênh giữ được', b.seCon.length===2, JSON.stringify(b.seCon));

console.log('\n— Render · chưa có biến môi trường');
b=chay('ket-noi.json',{RENDER:'1'});
t('cảnh báo mất hết', b.canLo===true && b.seCon.length===0, JSON.stringify(b));

console.log('\n— Máy cá nhân');
b=chay('ket-noi.json',{});
t('không lo, file trên đĩa thật', b.canLo===false && b.noiLuu==='file trên máy');

console.log('\n'+pass+' pass · '+fail+' fail');
process.exit(fail?1:0);
