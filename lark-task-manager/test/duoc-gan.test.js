'use strict';
/**
 * NGƯỜI ĐƯỢC GẮN @ TRONG TRAO ĐỔI XEM ĐƯỢC VIỆC (02/11/2026).
 *
 * Anh Hùng: tag người vào trao đổi thì "người đó chỉ nhận được thông báo mà
 * không thể xem task". Canh, không gọi Lark:
 *   1. tin có "@Tên mình" thì việc của tin đó vào danh sách được xem;
 *   2. "@Ngọc" nằm trong "@Ngọc Anh" không tính là gắn Ngọc;
 *   3. tên dính liền chữ phía sau ("@Ngọcxyz") không tính;
 *   4. tin của việc liên phòng ghi theo mã ở cột chữ cũng nhận;
 *   5. đệm 60 giây theo người;
 *   6. máy chủ nối đủ ba chỗ: quyền xem, quyền nhắn, danh sách ?gan=1.
 *
 * Hàm cắt nguyên văn từ server.js (server.js tự bật máy chủ khi require).
 * Chạy: node test/duoc-gan.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

const nguon = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').replace(/\r\n/g, '\n');
const dau = nguon.indexOf('const demGan = new Map();');
const cuoi = nguon.indexOf('/** Đuôi tin nhắn: link mở app. */');
if (dau < 0 || cuoi < dau) throw new Error('Không cắt được viecDuocGan trong server.js');
const ma = nguon.slice(dau, cuoi);

const cfg = require('../config');
const CF = cfg.commentFields;
const asText = (v) => (Array.isArray(v) ? v.map((x) => (x && (x.text || x.name)) || x).join('') : v == null ? '' : String(v));
const collectPeople = (tasks) => tasks.flatMap((t) => t.owner || []);

let goi = 0;
const tin = (id, task, nd, lp) => ({ record_id: id, cells: Object.assign(
  { [CF.content.id]: nd },
  task ? { [CF.task.id]: [{ record_ids: [task] }] } : {},
  lp ? { [CF.lienPhong.id]: lp } : {}) });

function dung(cmts) {
  goi = 0;
  const lark = { async listAllRecords() { goi++; return cmts; } };
  // eslint-disable-next-line no-new-func
  return new Function('cfg', 'lark', 'asText', 'collectPeople', 'cache',
    ma + '\nreturn { coGanTen, viecDuocGan, demGan };')(cfg, lark, asText, collectPeople, { scope: [] });
}

const viec = [{ owner: [{ id: 'u2', name: 'Ngọc Anh' }] }];

(async () => {
  const ngoc = { id: 'u1', name: 'Ngọc' };
  const m = dung([
    tin('c1', 'recA', 'Nhờ @Ngọc xem giúp'),
    tin('c2', 'recB', '@Ngọc Anh làm tiếp nhé'),
    tin('c3', 'recC', 'gửi @Ngọcxyz'),
    tin('c4', null, '@Ngọc check giúp việc liên phòng', 'recLP'),
    tin('c5', 'recD', 'không gắn ai'),
  ]);
  const ids = await m.viecDuocGan(ngoc, viec);
  ok('1. được gắn @Ngọc thì thấy việc recA', ids.has('recA'));
  ok('2. "@Ngọc Anh" không tính là gắn Ngọc', !ids.has('recB'));
  ok('3. "@Ngọcxyz" không tính', !ids.has('recC'));
  ok('4. tin việc liên phòng nhận theo mã', ids.has('recLP'));
  ok('   tin không gắn ai không mở quyền', !ids.has('recD'));

  const anh = await m.viecDuocGan({ id: 'u2', name: 'Ngọc Anh' }, viec);
  ok('   "@Ngọc Anh" mở quyền cho Ngọc Anh', anh.has('recB') && !anh.has('recA'));

  goi = 0;
  await m.viecDuocGan(ngoc, viec);
  ok('5. lần đọc thứ hai trong 60 giây dùng đệm', goi === 0);
  m.demGan.clear();
  await m.viecDuocGan(ngoc, viec);
  ok('   xoá đệm thì đọc lại', goi === 1);

  ok('   không có người đăng nhập thì rỗng', (await m.viecDuocGan(null, viec)).size === 0);

  const xem = nguon.slice(nguon.indexOf('async function requireXemViec'), nguon.indexOf('function collectPeople'));
  ok('6. quyền xem việc xét người được gắn', xem.includes('await duocGanVao(t, req)'));
  const gui = nguon.slice(nguon.indexOf("if (req.method === 'POST') {\n      const recs = await getRecords();"));
  ok('   người được gắn nhắn được trong Trao đổi', /duocGanVao\(toTask\(rec\), req\)/.test(gui.slice(0, 1500)));
  ok('   có tin mới thì xoá đệm gắn', /createRecord\(cells, cfg\.commentTableId\);\n\s*demGan\.clear\(\)/.test(nguon));
  const ds = nguon.slice(nguon.indexOf("if (p === '/api/my-orders'"), nguon.indexOf('/* ---- Việc lặp lại (29/10/2026)'));
  ok('   danh sách ?gan=1 mang dấu duocGan, bỏ quản lý', ds.includes("searchParams.get('gan') === '1'") &&
    ds.includes('duocGan: true') && ds.includes('!(await isManager(req))'));

  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  ok('   Bảng công việc xin gan=1 và mở bản chỉ xem', app.includes('&gan=1') && /!!t\.duocGan && !S\.isManager/.test(app));

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
