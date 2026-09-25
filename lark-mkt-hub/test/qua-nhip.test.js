'use strict';
/**
 * ============================================================================
 * LỖI QUÁ NHỊP CỦA LARK — CẢ MƯỜI HAI APP PHẢI LÙI GIỐNG NHAU
 * ============================================================================
 * Ngày 25/09/2026 lúc 11:21, hai app Lịch tác nghiệp và KOL cùng báo
 * `HTTP 400 · 99991400 · request trigger frequency limit` trong cùng một phút.
 *
 * Không app nào gọi quá tay cả. Lark tính hạn mức theo APP, mà cả phòng chỉ còn
 * MỘT app Lark dùng chung cho mười hai app con (xem docs/gop-ve-mot-app.md) —
 * nên hạn mức ấy là của chung, vài app con cùng nạp Base một lúc là đủ vượt.
 *
 * Phép lùi cũ lùi cứng 400ms rồi 800ms: vừa chưa qua hết cửa sổ tính theo giây,
 * vừa khiến hai app va nhau rồi lùi ĐÚNG BẰNG NHAU, thử lại cùng một tích tắc
 * và va tiếp. Phải lùi lâu hơn và lùi lệch nhau.
 *
 * Mười hai bản larkapi.js là mười hai bản chép tay của cùng một đoạn mã. Sửa
 * một chỗ mà quên mười một chỗ kia là chuyện đã xảy ra nhiều lần trong repo
 * này, và lần nào cũng chỉ lộ ra khi có người dùng thật gặp lỗi. Phép thử này
 * đọc thẳng cả mười hai tệp.
 *
 * Chạy: node test/qua-nhip.test.js
 */
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..', '..');
const teps = fs.readdirSync(GOC)
  .filter((d) => d.startsWith('lark-'))
  .map((d) => path.join(GOC, d, 'larkapi.js'))
  .filter((p) => fs.existsSync(p));

let pass = 0;
let fail = 0;
const ok = (dieu, ten) => {
  if (dieu) { pass += 1; console.log('  PASS ' + ten); }
  else { fail += 1; console.log('  FAIL ' + ten); }
};

console.log('\nlỗi quá nhịp 99991400 — ' + teps.length + ' bản larkapi.js');
ok(teps.length >= 12, 'tìm thấy đủ các app (thấy ' + teps.length + ')');

const thieu = { nhan: [], lau: [], lech: [], dung: [] };
teps.forEach((p) => {
  const ten = path.basename(path.dirname(p));
  const s = fs.readFileSync(p, 'utf8');
  if (!s.includes('99991400')) thieu.nhan.push(ten);
  if (!s.includes('1200')) thieu.lau.push(ten);
  if (!s.includes('Math.random()')) thieu.lech.push(ten);
  /* Khai hàm mà quên gọi thì mọi phép thử chữ ở trên vẫn xanh. */
  if (!s.includes('await wait(khoangCho(i, e));')) thieu.dung.push(ten);
  /* Và không được còn sót phép lùi cứng cũ. */
  if (s.includes('await wait(400 * Math.pow(2, i));')) thieu.dung.push(ten + ' (còn lùi cứng)');
});

ok(!thieu.nhan.length, 'app nào cũng nhận ra mã 99991400' + (thieu.nhan.length ? ' — thiếu: ' + thieu.nhan.join(', ') : ''));
ok(!thieu.lau.length, 'lỗi quá nhịp thì chờ lâu hơn lỗi thường' + (thieu.lau.length ? ' — thiếu: ' + thieu.lau.join(', ') : ''));
ok(!thieu.lech.length, 'có khoảng ngẫu nhiên để hai app không lùi bằng nhau' + (thieu.lech.length ? ' — thiếu: ' + thieu.lech.join(', ') : ''));
ok(!thieu.dung.length, 'và THẬT SỰ dùng phép lùi mới' + (thieu.dung.length ? ' — sai: ' + thieu.dung.join(', ') : ''));

/* Chạy thử phép lùi thật, lấy từ một bản bất kỳ — mọi bản đều giống nhau. */
const nguon = fs.readFileSync(teps[0], 'utf8');
/* Thân hàm có dấu chấm phẩy bên trong, nên phải cắt tới dòng `};` đóng hàm
 * chứ không cắt ở dấu chấm phẩy đầu tiên. */
const doan = /const QUA_NHIP = \[[^\]]*\];[\s\S]*?\n\};/.exec(nguon);
ok(!!doan, 'rút được phép lùi ra để chạy thử');
if (doan) {
  // eslint-disable-next-line no-new-func
  const khoangCho = new Function(doan[0] + '\nreturn khoangCho;')();
  const nhip = { code: 99991400 };
  const thuong = { code: 1254291 };

  const mau = (e, lan, n) => Array.from({ length: n }, () => khoangCho(lan, e));
  const mNhip = mau(nhip, 0, 200);
  const mThuong = mau(thuong, 0, 200);

  ok(Math.min(...mNhip) >= 1200, 'quá nhịp: chờ ít nhất 1,2 giây (thấy ' + Math.min(...mNhip) + 'ms)');
  ok(Math.max(...mThuong) < Math.min(...mNhip),
    'lỗi thường vẫn lùi nhanh như cũ, không bị kéo chậm theo');
  ok(new Set(mNhip).size > 50, 'mỗi lần một khoảng khác nhau — hai app không lùi trùng nhau');
  /* Lùi phải TĂNG theo số lần thử, không thì thử ba lượt cũng như một. */
  ok(Math.min(...mau(nhip, 1, 50)) > Math.max(...mNhip) / 2,
    'lùi lâu dần theo số lần đã thử');
  /* Không có đối số lỗi (gọi từ chỗ khác) thì coi như lỗi thường, đừng nổ. */
  ok(typeof khoangCho(0, null) === 'number' && typeof khoangCho(0, undefined) === 'number',
    'không có thông tin lỗi thì vẫn trả về một con số');
}

console.log('\n' + pass + ' pass · ' + fail + ' fail\n');
process.exitCode = fail ? 1 : 0;
