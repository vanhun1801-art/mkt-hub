'use strict';
/**
 * GỬI YÊU CẦU ĐIỀU CHỈNH THÌ QUẢN LÝ PHẢI NHẬN ĐƯỢC THẺ LARK
 *
 * Anh Hùng 03/11/2026: "Ứng dụng Marketing hub khi nào có yêu cầu điều chỉnh
 * công việc thông báo cho anh nhé".
 *
 * Đọc mã nguồn thay vì gọi thật: POST /api/requests ghi vào Base thật và nhắn
 * cho người thật. Phần dựng thẻ thì chạy thật trên dữ liệu giả.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (ten, dk) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten); }
};

const SV = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const tu = (dau, dai) => { const i = SV.indexOf(dau); return i < 0 ? '' : SV.slice(i, i + dai); };

const post = tu("if (p === '/api/requests' && req.method === 'POST')", 1800);
ok('POST /api/requests gọi baoYeuCau', /await baoYeuCau\(/.test(post));
ok('báo SAU khi đã lưu vào Base',
  post.indexOf('createRecord') > -1 && post.indexOf('createRecord') < post.indexOf('baoYeuCau'));
ok('gửi hỏng không làm hỏng yêu cầu (có .catch)', /baoYeuCau\([\s\S]*?\)\.catch\(/.test(post));

const bao = tu('async function baoYeuCau(', 1200);
ok('người nhận là danh sách quản lý', /cfg\.loadManagerIds\(\)/.test(bao));
ok('không gửi cho chính người gửi', /id !== \(nguoiGui && nguoiGui\.id\)/.test(bao));
ok('không xét cfg.notify', !/cfg\.notify/.test(bao));

/* Dựng thẻ chạy thật: tách hàm ra cùng hai hàm phụ nó cần. */
const lay = (dau) => { const i = SV.indexOf(dau); let j = SV.indexOf('\n}\n', i); return SV.slice(i, j + 2); };
const ma = 'const urlHubTB = () => "https://hub";' +
  "const sachMd = (s) => String(s || '').replace(/([*_~`[\\]<>])/g, '\\\\$1');" +
  lay('function theYeuCau(') + '; return theYeuCau;';
const theYeuCau = new Function(ma)();
const the = theYeuCau({ id: 'ou_ngoc', name: 'Ngọc' }, 'Quay video *tour*', ['Deadline'], 'Lùi 2 ngày', 'Chờ khách', 'recABC');
const txt = JSON.stringify(the);
ok('tiêu đề có tên người gửi và tên việc', /Ngọc xin điều chỉnh việc: Quay video/.test(the.header.title.content));
ok('thân thẻ có phần cần sửa, đề xuất, lý do', /Deadline/.test(txt) && /Lùi 2 ngày/.test(txt) && /Chờ khách/.test(txt));
ok('nút mở thẳng đúng việc trong Hub', /\/#\/m\/cong-viec\?rec=recABC/.test(txt));

console.log('\n' + pass + ' qua, ' + fail + ' hỏng');
if (fail) process.exit(1);
