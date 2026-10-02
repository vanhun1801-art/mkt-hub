'use strict';
/**
 * ============================================================================
 * NHẮN TRONG TAB TRAO ĐỔI THÌ NGƯỜI KIA PHẢI NHẬN ĐƯỢC TIN LARK
 * ============================================================================
 * Anh Hùng 02/10/2026: "giao diện này khi có thông báo mới, anh chưa nhận được
 * Marketing Hub thông báo cho anh qua Lark rằng có tin nhắn mới".
 *
 * Đo trên chính việc đó (bản ghi reczz28Hjy33P6ox "Bổ sung tư liệu media"):
 *   phụ trách chính : Nguyễn Hồng Ngọc  ← người gõ tin
 *   người order     : Lê Văn Hùng       ← người đáng lẽ nhận
 * Phép tính người nhận ra đúng một người: Lê Văn Hùng. Lớp gửi (sendCard /
 * sendMessage) có đủ. Thế mà không tin nào đi.
 *
 * Nguyên nhân nằm ở DÒNG ĐẦU của baoTraoDoi: `if (!cfg.notify ...) return;`.
 * cfg.notify bật bằng LARK_NOTIFY=1, mà biến đó không được đặt ở đâu — chính
 * tài liệu trong kho (docs/automation-va-app.md mục 7) đã ghi vậy từ trước.
 *
 * Chữa bằng cách bỏ cờ ở đúng chỗ này, KHÔNG phải bằng cách bật cờ lên:
 *
 *   · Cờ ấy chặn thông báo TỰ ĐỘNG — app tự nhắn khi giao việc, khi tới hạn.
 *     Bật nó là mở luôn mấy thứ đó cùng lúc, trong khi chỉ xin đúng một việc.
 *   · Tin trao đổi vốn không tự động: một người gõ chữ rồi bấm Gửi, cho đúng
 *     những người có tên trong việc. Cùng loại với nút "Nhắc" — vốn đã cố ý
 *     không xét cờ (xem nhac.test.js) — chứ không cùng loại với tin máy bắn.
 *
 * VÌ SAO ĐỌC MÃ NGUỒN thay vì gọi thật: đường thành công của POST
 * /api/tasks/:id/comments GỬI TIN LARK CHO NGƯỜI THẬT. Không có cách gọi nó
 * trong phép thử mà không nhắn cho đồng nghiệp. Nên bộ này canh những bất biến
 * đọc được từ mã, cộng một phép tính người nhận chạy thật trên dữ liệu giả.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const GOC = path.join(__dirname, '..');
/* Chuẩn hoá xuống dòng: kho để core.autocrlf=true nên bản clone mới trên
 * Windows nhận CRLF, mà vài mốc dưới đây neo vào ký tự xuống dòng đơn. */
const sv = fs.readFileSync(path.join(GOC, 'server.js'), 'utf8').split('\r\n').join('\n');
const fe = fs.readFileSync(path.join(GOC, 'public', 'app.js'), 'utf8').split('\r\n').join('\n');

console.log('\nnhắn trong tab Trao đổi thì bên kia nhận được tin Lark');

/* ---- 1. cái cột lõi: không được chặn bằng cờ tự-động nữa ---- */
const than = (/async function baoTraoDoi\([\s\S]*?\n\}/.exec(sv) || [''])[0];
ok('tìm được hàm baoTraoDoi', than.length > 100);
ok('baoTraoDoi KHÔNG còn bị cờ cfg.notify chặn',
  !/cfg\.notify/.test(than), 'cờ quay lại chặn tin người gõ tay');

/* Nhưng cờ phải CÒN NGUYÊN cho thông báo tự động — bỏ hết là đi quá tay,
 * thành ra app tự nhắn lúc giao việc và tới hạn mà chưa ai cho phép. */
ok('cờ vẫn còn gác thông báo TỰ ĐỘNG (baoTin)',
  /function baoTin\([\s\S]{0,200}?cfg\.notify/.test(sv));

/* ---- 2. gửi hỏng thì phải biết, không được nuốt ---- */
ok('baoTraoDoi chờ kết quả thay vì bắn-rồi-quên', /^async function baoTraoDoi/m.test(sv));
ok('baoTraoDoi đếm được gửi thành công và lỗi',
  /return \{ gui, loi \}/.test(than) || /\{ gui: 0, loi: \[\] \}/.test(than));
ok('không còn nuốt lỗi bằng catch rỗng trong baoTraoDoi',
  !/catch \(_\) \{\}/.test(than));
ok('gửi hỏng thì ghi vào log máy chủ', /\[trao-doi\][^\n]*console\.error|console\.error\('\[trao-doi\]/.test(than));

/* ---- 3. máy chủ nói lại cho màn hình biết tin đi tới đâu ---- */
const post = sv.slice(sv.indexOf('const kq = await lark.createRecord(cells, cfg.commentTableId)'));
ok('chỗ gọi có CHỜ baoTraoDoi', /await baoTraoDoi\(/.test(post.slice(0, 1500)));
ok('phản hồi kèm danh sách người được báo', /bao: \{[\s\S]{0,200}ten:/.test(post.slice(0, 2000)));
ok('phản hồi kèm số người báo hỏng', /hong:/.test(post.slice(0, 2000)));

/* ---- 4. màn hình nói thật, không hứa suông ---- */
ok('bỏ câu hứa chung chung cũ',
  !/Người phụ trách, người hỗ trợ và người order sẽ nhận thông báo trong Lark/.test(fe));
ok('màn hình đọc tên người sẽ nhận', /Gửi xong sẽ báo Lark cho: /.test(fe));
ok('việc chưa có ai khác thì nói thẳng là không báo ai',
  /sẽ không báo Lark cho ai/.test(fe));
ok('báo hỏng thì hiện ra cho người gửi', /không báo được Lark cho/.test(fe));

/* ---- 5. phép tính người nhận, chạy thật trên dữ liệu giả ----
 * Dựng lại ĐÚNG biểu thức trong server.js chứ không chép tay một bản khác —
 * chép tay thì hai bên trôi xa nhau mà phép thử vẫn xanh. */
const mBt = /const nguoiNhan = (\[[\s\S]*?);\n/.exec(post);
ok('đọc được biểu thức tính người nhận từ chính server.js', !!mBt);
if (mBt) {
  const tinh = (t, me) => eval(                            // eslint-disable-line no-eval
    '(function(t, me){ return ' + mBt[1].replace(/\s+/g, ' ') + '; })')(t, me);

  const NGOC = { id: 'ou_ngoc', name: 'Nguyễn Hồng Ngọc' };
  const HUNG = { id: 'ou_hung', name: 'Lê Văn Hùng' };
  const BINH = { id: 'ou_binh', name: 'Người hỗ trợ' };

  /* Đúng việc trong ảnh: Ngọc phụ trách và là người gõ, anh Hùng người order. */
  let r = tinh({ owner: [NGOC], helper: [], requester: [HUNG] }, NGOC);
  ok('việc thật trong ảnh: tin của Ngọc báo tới anh Hùng',
    r.length === 1 && r[0].name === 'Lê Văn Hùng', JSON.stringify(r.map((u) => u.name)));

  /* Chiều ngược lại cũng phải đúng. */
  r = tinh({ owner: [NGOC], helper: [], requester: [HUNG] }, HUNG);
  ok('anh Hùng nhắn thì báo tới Ngọc', r.length === 1 && r[0].id === 'ou_ngoc');

  /* Không tự nhắn cho chính mình — nhận lại tin mình vừa gõ là phiền. */
  r = tinh({ owner: [HUNG], helper: [], requester: [HUNG] }, HUNG);
  ok('không báo cho chính người gõ', r.length === 0, JSON.stringify(r));

  /* Một người đứng hai vai thì chỉ nhận MỘT tin, không phải hai. */
  r = tinh({ owner: [HUNG], helper: [HUNG], requester: [NGOC] }, NGOC);
  ok('một người hai vai chỉ nhận một tin', r.length === 1 && r[0].id === 'ou_hung',
    JSON.stringify(r.map((u) => u.name)));

  /* Có người hỗ trợ thì người hỗ trợ cũng phải nhận. */
  r = tinh({ owner: [NGOC], helper: [BINH], requester: [HUNG] }, NGOC);
  ok('người hỗ trợ cũng được báo', r.length === 2 && r.some((u) => u.id === 'ou_binh'));

  /* Việc chưa ai nhận, chỉ có mình người gõ: không có ai để báo — và đây đúng
   * là trường hợp màn hình phải nói thẳng thay vì hứa suông. */
  r = tinh({ owner: [], helper: [], requester: [HUNG] }, HUNG);
  ok('việc chưa ai nhận: không có ai để báo', r.length === 0);

  /* Giữ được TÊN, không chỉ id — màn hình cần tên để nói tin đi tới ai. */
  r = tinh({ owner: [NGOC], helper: [], requester: [HUNG] }, NGOC);
  ok('giữ cả tên người nhận, không chỉ id', !!(r[0] && r[0].name));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
process.exit(fail ? 1 : 0);
