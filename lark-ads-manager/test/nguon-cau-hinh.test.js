const fs=require('fs'), path=require('path'), os=require('os'), cp=require('child_process');
const ENV=fs.readFileSync('ADS_CONNECT_JSON.txt','utf8').trim();
const chay=(env,file)=>JSON.parse(cp.execFileSync(process.execPath,['-e',
  `const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});const s=k.status();
   console.log(JSON.stringify({nguon:s.nguon,canhBao:s.canhBaoODiaTam,deLen:s.deLenBienMoiTruong}));`],
  {env:{...process.env,...env,LARK_CONNECT_FILE:file},cwd:process.cwd(),encoding:'utf8'}));

const rong=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'x-')),'khong-co.json');
const th=[
  ['Render + env, KHÔNG có file  (đúng cách)', {RENDER:'1',ADS_CONNECT_JSON:ENV}, rong],
  ['Render + env + CÓ file       (bẫy anh Hùng đang dính)', {RENDER:'1',ADS_CONNECT_JSON:ENV}, 'ket-noi.json'],
  ['Render, chỉ có file          (chưa khai env)', {RENDER:'1'}, 'ket-noi.json'],
  ['Máy cá nhân                  (bình thường)', {}, 'ket-noi.json'],
];
let pass=0,fail=0;
const mong=[
  {canhBao:false,deLen:false,ten:'không băng nào'},
  {canhBao:true, deLen:true, ten:'băng ĐỎ "sẽ mất khi deploy"'},
  {canhBao:true, deLen:false,ten:'băng vàng "ổ đĩa tạm"'},
  {canhBao:false,deLen:false,ten:'không băng nào'},
];
th.forEach(([ten,env,file],i)=>{
  const s=chay(env,file), m=mong[i];
  const ok=s.canhBao===m.canhBao && s.deLen===m.deLen;
  ok?pass++:fail++;
  console.log((ok?'  ok  ':'  FAIL ')+ten+'  → '+m.ten+(ok?'':'  (thật: '+JSON.stringify(s)+')'));
});
console.log('\n'+pass+' pass · '+fail+' fail');
process.exit(fail?1:0);
