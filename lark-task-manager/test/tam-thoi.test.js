'use strict';
/**
 * ============================================================================
 * LỖI TẠM THỜI CỦA LARK — cái nào đáng thử lại, cái nào phải nổ ra ngay
 * ============================================================================
 * Base của Lark chặn tần suất. Gặp lúc bị chặn mà coi đó là lỗi thật thì màn
 * hình hiện danh sách trống kèm một câu tiếng Anh, trong khi chỉ cần đợi một
 * nhịp rồi đọc lại là xong — người dùng tưởng mất việc.
 *
 * Ngày 11/09 log đã có: "the method：OpenAPIListRecord limited" (mã 800004135),
 * và lúc đó mã này KHÔNG nằm trong danh sách thử-lại. Bài này canh đúng chỗ đó,
 * canh cho CẢ HAI chế độ: máy cá nhân đi qua lark.js (lark-cli), bản deploy đi
 * qua larkapi.js (Open API) — sửa một bên quên bên kia là lỗi quay lại ở chỗ
 * duy nhất mà người ngoài dùng.
 *
 * Chạy: node test/tam-thoi.test.js
 */
let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten);
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};

/* Ép chế độ cli để require('./lark') trả đúng lớp lark-cli, không bị đổi sang
 * larkapi khi máy có sẵn LARK_APP_ID. */
process.env.LARK_MODE = 'cli';
const cli = require('../lark');
const api = require('../larkapi');

console.log('\n\x1b[1mChế độ máy cá nhân (lark-cli)\x1b[0m');
{
  const loi = (s) => new Error(s);
  ok('bị chặn tần suất đọc bảng thì thử lại',
    cli.isTransient(loi('lark-cli lỗi: {"code":800004135,"message":"the method：OpenAPIListRecord limited"}')));
  ok('ghi đụng nhau (1254291) thì thử lại', cli.isTransient(loi('code 1254291')));
  ok('mạng rớt giữa chừng thì thử lại', cli.isTransient(loi('dial tcp: i/o timeout')));
  /* Chốt ngược: thử-lại mọi thứ cũng sai — sai quyền mà thử ba lần thì chỉ làm
   * người dùng đợi lâu gấp ba rồi vẫn báo đúng câu lỗi đó. */
  ok('thiếu quyền thì KHÔNG thử lại, nổ ra ngay',
    !cli.isTransient(loi('{"code":99991672,"message":"permission denied"}')));
  ok('bảng không tồn tại thì KHÔNG thử lại',
    !cli.isTransient(loi('NOTEXIST: table not found')));
}

console.log('\n\x1b[1mChế độ deploy (Open API)\x1b[0m');
{
  ok('bị chặn tần suất đọc bảng thì thử lại', api.isTransient(800004135, 200));
  ok('429 thì thử lại', api.isTransient(0, 429));
  ok('máy chủ Lark lỗi 500 thì thử lại', api.isTransient(0, 500));
  ok('thiếu quyền thì KHÔNG thử lại', !api.isTransient(99991672, 403));
}

console.log('\n' + '─'.repeat(56));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
