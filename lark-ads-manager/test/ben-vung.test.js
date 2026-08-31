const fs=require('fs'), path=require('path'), os=require('os'), cp=require('child_process');
/* Token GIẢ, không đọc ADS_CONNECT_JSON.txt nữa: file đó chỉ có sau khi chạy
 * tao-env.js, nên xoá nó là bộ test này NỔ lúc nạp module — nó "pass" trước đây
 * chỉ vì file tình cờ còn đó. Xem test/mau-cau-hinh.js. */
const mauCH=require('./mau-cau-hinh');
const DAY=mauCH.json();                                    // đủ mọi kênh
const THIEU=mauCH.json({tiktok:{accessToken:''}});         // thiếu đúng TikTok
const KENH_BAT=mauCH.kenhBat();                            // để so, thay vì neo con số
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bv-'));
/* File trên đĩa cũng phải là mẫu giả — trước đây dùng 'ket-noi.json' thật của máy
 * nên kết quả phụ thuộc vào việc hôm đó máy đang khai những kênh gì.
 *
 * PHẢI là tên TƯƠNG ĐỐI: sync/ketnoi.js tính đường dẫn bằng
 * path.join(__dirname,'..',cfg.connectFile), nên đưa đường dẫn tuyệt đối vào là
 * nó nối chuỗi thành rác và file coi như không tồn tại. */
const FILE_CO_TOKEN='ket-noi.mau-test.json';
const FILE_KHONG_CO='ket-noi.khong-co-test.json';
fs.writeFileSync(path.join(process.cwd(),FILE_CO_TOKEN), DAY);
process.on('exit',()=>{try{fs.unlinkSync(path.join(process.cwd(),FILE_CO_TOKEN))}catch(_){}});

const chay=(file,env)=>JSON.parse(cp.execFileSync(process.execPath,['-e',
  `const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});
   console.log(JSON.stringify(k.benVung()));`],
  {env:{...process.env,...env,LARK_CONNECT_FILE:file},cwd:process.cwd(),encoding:'utf8'}));

let pass=0,fail=0;
const t=(n,c,x='')=>{c?(pass++,console.log('  ok  '+n)):(fail++,console.log('  FAIL '+n+' :: '+x))};

console.log('— Render · biến có đủ mọi kênh · file có token (đúng hiện trạng)');
let b=chay(FILE_CO_TOKEN,{RENDER:'1',ADS_CONNECT_JSON:DAY});
t('không phải lo', b.canLo===false, JSON.stringify(b));
/* KHÔNG neo con số. Bất biến: mọi kênh đang chạy đều được giữ, không mất cái nào.
 * Đã bốn lần một con số cứng làm vỡ test khi thêm kênh mới. */
t('giữ đủ mọi kênh đang chạy, không mất cái nào',
  b.seCon.length===b.dangChay.length && b.seMat.length===0, JSON.stringify(b));
t('và số kênh đang chạy đúng bằng số kênh mẫu bật',
  b.dangChay.length===KENH_BAT.length, JSON.stringify(b.dangChay)+' vs '+JSON.stringify(KENH_BAT));

console.log('\n— Render · biến THIẾU TikTok · file có token (bẫy đã dính thật)');
b=chay(FILE_CO_TOKEN,{RENDER:'1',ADS_CONNECT_JSON:THIEU});
t('cảnh báo bật', b.canLo===true);
t('chỉ ra đúng kênh sẽ mất là tiktok', JSON.stringify(b.seMat)==='["tiktok"]', JSON.stringify(b.seMat));
t('mất đúng một kênh, còn lại giữ hết',
  b.seCon.length===b.dangChay.length-1, JSON.stringify(b));

console.log('\n— Render · chưa có biến môi trường');
b=chay(FILE_CO_TOKEN,{RENDER:'1'});
t('cảnh báo mất hết', b.canLo===true && b.seCon.length===0, JSON.stringify(b));

console.log('\n— Máy cá nhân');
b=chay(FILE_CO_TOKEN,{});
t('không lo, file trên đĩa thật', b.canLo===false && b.noiLuu==='file trên máy');

console.log('\n'+pass+' pass · '+fail+' fail');
process.exit(fail?1:0);
