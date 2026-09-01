/**
 * Test kho lead/đơn Tourwell và quy tắc "còn tươi".
 *
 * Vì sao đáng có bộ riêng: kho này quyết định bộ hẹn giờ có đi kéo lại hay không.
 * Đặt sai một chiều thì mỗi giờ nó kéo lại hàng trăm lời gọi API (Tourwell giới
 * hạn 60 yêu cầu/phút) — chậm và phí. Đặt sai chiều kia thì kho cũ mãi không được
 * làm mới mà chẳng ai biết, vì không có lỗi nào được ném ra.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const kho = require('../sync/khoroas');

/* Kho thật có thể đang chứa dữ liệu anh Hùng vừa nạp. Cất đi trước khi test ghi
 * đè lên, trả lại nguyên trạng khi xong — đã một lần làm hỏng dữ liệu thật vì
 * chạy phép thử thẳng vào file đang dùng. */
let saoLuu = null;
let coFile = false;
try { saoLuu = fs.readFileSync(kho.FILE); coFile = true; } catch (_) {}
const traLai = () => {
  try {
    if (coFile) fs.writeFileSync(kho.FILE, saoLuu, { mode: 0o600 });
    else fs.unlinkSync(kho.FILE);
  } catch (_) {}
};
process.on('exit', traLai);

const mau = (luc, tuApi = true) => ({
  luc, tuApi, khoang: ['2026-07-03', '2026-09-01'],
  lead: { tomTat: { loai: 'lead', dong: 2, tu: '2026-08-01', den: '2026-08-31' }, rows: [{ id: 1 }, { id: 2 }] },
  don: { tomTat: { loai: 'don', dong: 1, tongTien: 5000000 }, rows: [{ ma: 'UP1' }] },
});

console.log('— ghi rồi đọc lại');
kho.ghi(mau(new Date().toISOString()));
let k = kho.doc();
t('đọc lại được', !!k && k.lead.rows.length === 2, JSON.stringify(k && Object.keys(k)));
t('giữ nguyên cờ tuApi', k.tuApi === true);
t('giữ khoảng ngày', Array.isArray(k.khoang) && k.khoang.length === 2);

console.log('— tomTat: chỉ trả tóm tắt, KHÔNG kèm dòng thô');
const tt = kho.tomTat();
t('báo có dữ liệu', tt.coDuLieu === true);
t('có tóm tắt lead và đơn', tt.lead.dong === 2 && tt.don.dong === 1);
t('nói rõ nguồn là API', tt.tuApi === true);
/* Dòng thô là hàng nghìn bản ghi. Lọt vào phản hồi trạng thái là mỗi lần mở trang
 * tải về vài MB, và trên Render đó là tiền băng thông thật. */
t('KHÔNG kèm dòng thô', !JSON.stringify(tt).includes('"rows"'), JSON.stringify(tt).slice(0, 120));

console.log('— conTuoi: quyết định bộ hẹn giờ có kéo lại hay không');
kho.ghi(mau(new Date().toISOString()));
t('vừa ghi xong thì còn tươi', kho.conTuoi(6) === true);

kho.ghi(mau(new Date(Date.now() - 3 * 3600 * 1000).toISOString()));
t('3 giờ trước, ngưỡng 6 giờ → còn tươi', kho.conTuoi(6) === true);
t('3 giờ trước, ngưỡng 1 giờ → hết tươi', kho.conTuoi(1) === false);

kho.ghi(mau(new Date(Date.now() - 9 * 3600 * 1000).toISOString()));
t('9 giờ trước, ngưỡng 6 giờ → hết tươi', kho.conTuoi(6) === false);

console.log('— các ca hỏng: không được coi là còn tươi');
kho.ghi({ lead: null, don: null });
t('thiếu mốc thời gian → hết tươi', kho.conTuoi(6) === false);
kho.ghi(mau('không phải ngày'));
t('mốc thời gian hỏng → hết tươi, không nổ', kho.conTuoi(6) === false);
kho.xoa();
t('không có kho → hết tươi', kho.conTuoi(6) === false);
t('không có kho thì doc() trả null chứ không nổ', kho.doc() === null);
t('tomTat khi rỗng vẫn trả lời được', kho.tomTat().coDuLieu === false);
t('xoá lần nữa không nổ', typeof kho.xoa() === 'boolean');

console.log('— bộ hẹn giờ chỉ kéo khi ĐÃ BẬT và kho đã cũ');
/* Kiểm bằng cách đọc mã nguồn: chạy thật thì phải gọi ra Tourwell. Điều cần chốt
 * là ba điều kiện có mặt đủ, và phần Tourwell KHÔNG được tính vào số lỗi của việc
 * ghi Base — trộn vào sẽ kích cơ chế "thử lại sau 60 giây" cho việc chẳng liên quan. */
const src = fs.readFileSync(path.join(__dirname, '..', 'sync', 'index.js'), 'utf8');
t('có kiểm tw.enabled', /tw\.enabled/.test(src));
t('có kiểm đủ host và token', /tw\.host/.test(src) && /tw\.token/.test(src));
t('có kiểm kho còn tươi', /khoRoas\.conTuoi/.test(src));
t('phần Tourwell nằm trong try riêng', /Tourwell LỖI/.test(src) || /Tourwell LỖI/.test(src));
t('KHÔNG cộng vào r.tong.loi',
  !/tong\.loi\s*\+=/.test(src), 'lỗi Tourwell không được kích thử-lại của việc ghi Base');

console.log('— hàm kéo dùng chung cho cả nút bấm và hẹn giờ');
const tw = require('../sync/tourwellapi');
t('có keoVeKho', typeof tw.keoVeKho === 'function');
const srvSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
t('server dùng chung hàm đó, không chép lại logic', /tourwellApi\.keoVeKho/.test(srvSrc));
t('scheduler cũng dùng chung hàm đó', /tourwellApi\.keoVeKho/.test(src));
t('server không còn tự mở file kho', !/roas-tourwell\.json/.test(srvSrc),
  'đường dẫn kho chỉ được khai ở sync/khoroas.js');

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
