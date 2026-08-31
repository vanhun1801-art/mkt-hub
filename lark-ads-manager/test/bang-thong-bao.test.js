const fs=require('fs'), path=require('path'), os=require('os');
// Mô phỏng 3 tình huống, kiểm đúng băng nào hiện
const truong=[
  { ten:'Render + ADS_CONNECT_JSON (tình huống của anh Hùng)', env:{RENDER:'1', ADS_CONNECT_JSON:fs.readFileSync('ADS_CONNECT_JSON.txt','utf8').trim()}, khongCoFile:true },
  { ten:'Render nhưng chỉ có file trên đĩa (deploy sau là mất)', env:{RENDER:'1'}, khongCoFile:false },
  { ten:'Máy cá nhân, có file', env:{}, khongCoFile:false },
];
for (const t of truong) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kt-'));
  const kq=require('child_process').execFileSync(process.execPath, ['-e', `
    const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});
    const s=k.status();
    console.log(JSON.stringify({
      nguon:s.nguon, oDiaTam:s.oDiaTam, canhBao:s.canhBaoODiaTam,
      coKenhSanSang: s.providers.some(p=>p.sanSang),
    }));`],
    { env: { ...process.env, ...t.env,
             LARK_CONNECT_FILE: t.khongCoFile ? path.join(tmp,'khong-co.json') : 'ket-noi.json' },
      cwd: process.cwd(), encoding:'utf8' });
  const s=JSON.parse(kq);
  console.log('\n'+t.ten);
  console.log('   nguồn:', s.nguon, '| có kênh sẵn sàng:', s.coKenhSanSang);
  console.log('   băng "Chưa nối kênh nào" :', s.coKenhSanSang ? 'ẨN ✓' : 'HIỆN');
  console.log('   băng "ổ đĩa là tạm"      :', s.canhBao ? 'HIỆN' : 'ẨN ✓');
  console.log('   băng "đọc từ biến môi trường":', s.nguon==='env' ? 'HIỆN ✓' : 'ẩn');
}
