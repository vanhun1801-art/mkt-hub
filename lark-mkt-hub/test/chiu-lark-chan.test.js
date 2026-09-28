'use strict';
/**
 * ============================================================================
 * LARK CHẶN TẦN SUẤT THÌ PHẢI THỬ LẠI — CẢ 13 NƠI, KHÔNG SÓT CHỖ NÀO
 * ============================================================================
 * Anh Hùng 29/09/2026: "tuyệt đối không để sót một lỗi nào trên ứng dụng, kể
 * cả kết nối".
 *
 * Đo trên log lúc dựng cả hệ:
 *
 *   [lich-tac-nghiep] [ERR] lark-cli lỗi:
 *     "code": 800004135, "message": "the method：OpenAPIListRecord limited"
 *
 * Đây là Lark chặn tần suất ĐỌC bản ghi, và giới hạn tính theo CẢ TENANT —
 * mà hub bật 12 app con cùng lúc, mỗi app đọc 2–3 bảng ngay khi khởi động.
 * Nên chuyện này KHÔNG hiếm, nó là chuyện thường ngày.
 *
 * Soát ra hai lỗ hổng, cả hai đều im lặng cho tới lúc Lark bận:
 *
 *   1. CHÍN app có lớp thử-lại nhưng THIẾU mã 800004135 trong danh sách lỗi
 *      tạm thời. Thiếu mã thì app coi đây là lỗi VĨNH VIỄN, không thử lại, và
 *      người dùng nhận thẳng một màn lỗi cho một sự cố chỉ kéo dài vài trăm ms.
 *   2. HUB thì không có lớp thử-lại nào cả — trong khi nó là chỗ đọc bảng Phân
 *      quyền (ai thấy base nào), Thông báo, ô phát và logo. Lark bận một nhịp
 *      là cả phòng rơi về quyền mặc định hoặc mất thông báo.
 *
 * Bộ này canh cho cả hai đừng quay lại, và canh luôn chiều ngược lại: lỗi
 * QUYỀN thì KHÔNG được thử lại — thử mấy lần cũng vậy, chỉ làm người dùng chờ
 * lâu hơn rồi vẫn nhận đúng câu lỗi đó.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '\n      ' + vi : '')); }
};

const GOC = path.join(__dirname, '..', '..');
const APP = ['lark-task-manager', 'lark-lich-tac-nghiep', 'lark-ads-manager',
  'lark-ota-manager', 'lark-social', 'lark-chinh-anh', 'lark-kpi',
  'lark-quy-chi-phi', 'lark-bao-cao', 'lark-san-pham', 'lark-lich-lam-viec', 'lark-kol'];

/** Mã Lark báo "bận, thử lại đi" — không phải lỗi của dữ liệu hay của quyền. */
const MA_TAM_THOI = ['800004135', '1254291', '1254036', '99991400'];

console.log('\nmọi nơi gọi Lark đều chịu được lúc Lark bận');

/* ---- 12 app con ---- */
const thieu = [];
let soTep = 0;
for (const app of APP) {
  for (const ten of ['lark.js', 'larkapi.js']) {
    const f = path.join(GOC, app, ten);
    let s;
    try { s = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    soTep++;
    /* Tệp phải vừa CÓ lớp thử lại, vừa BIẾT mã chặn tần suất. Có lớp mà thiếu
     * mã thì lớp đó không cứu được đúng tình huống hay gặp nhất. */
    const coThuLai = /isTransient|TRANSIENT/.test(s) && /retries|for \(let i = 0; i </.test(s);
    /* Đọc mã TRONG MẢNG, không dò trên cả tệp. Tệp nào cũng có một lời chú
     * giải thích mã 800004135 — dò cả tệp thì xoá mã khỏi mảng mà để lời chú
     * lại vẫn "đạt", tức phép thử canh lời chú chứ không canh hành vi. */
    const mang = (/const (?:TRANSIENT|TRANSIENT_CODES|TAM_THOI) = \[([\s\S]*?)\]/.exec(s) || [])[1];
    const soTrongMang = String(mang || '').replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const thieuMa = mang == null ? MA_TAM_THOI.slice() : MA_TAM_THOI.filter((m) => !soTrongMang.includes(m));
    if (!coThuLai) thieu.push(app + '/' + ten + ' — KHÔNG có lớp thử lại');
    else if (thieuMa.length) thieu.push(app + '/' + ten + ' — thiếu mã ' + thieuMa.join(', '));
  }
}
ok('có soi được tệp nào không (phép thử không tự rỗng rồi báo đạt)', soTep >= 20, 'mới soi ' + soTep);
ok('cả 12 app đều thử lại được khi Lark bận',
  thieu.length === 0, thieu.length ? '\n      ' + thieu.join('\n      ') : '');

/* ---- hub ---- */
const bl = fs.readFileSync(path.join(__dirname, '..', 'base-lark.js'), 'utf8');
ok('hub cũng có lớp thử lại khi gọi Base', /function goi\(method, duoi, body\)[\s\S]{0,400}?goiMot\(/.test(bl));
const thieuHub = MA_TAM_THOI.filter((m) => !bl.includes(m));
ok('hub biết đủ các mã tạm thời', thieuHub.length === 0, 'thiếu ' + thieuHub.join(', '));
ok('hub có giãn cách giữa các lần thử (đừng dập liên tiếp vào lúc Lark đang bận)',
  /Math\.pow\(2, i\)/.test(bl));
ok('hub thử LẠI CÓ HẠN, không lặp vô tận', /i < 3/.test(bl));

/* ---- chiều ngược lại: đừng thử lại thứ không đáng ---- */
ok('hub KHÔNG coi lỗi quyền 91403 là tạm thời', !/TAM_THOI[^;]*91403/.test(bl));
const dsTam = (/const TAM_THOI = \[([^\]]*)\]/.exec(bl) || [])[1] || '';
ok('danh sách tạm thời không lẫn mã "bảng không tồn tại"', !/NOTEXIST|1254005/.test(dsTam));

/* Cùng lúc, đừng để ai bỏ mất lớp XẾP HÀNG đã có — nó là thứ làm cho chuyện
 * chặn tần suất ít xảy ra ngay từ đầu, thử lại chỉ là lưới đỡ phía sau. */
for (const app of ['lark-lich-lam-viec', 'lark-kpi']) {
  const f = path.join(GOC, app);
  const co = ['kho.js', 'store.js', 'lark.js', 'larkapi.js'].some((t) => {
    try { return /xepHang|hang = /.test(fs.readFileSync(path.join(f, t), 'utf8')); } catch (_) { return false; }
  });
  ok(app + ' vẫn xếp hàng lượt đọc Base', co);
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
