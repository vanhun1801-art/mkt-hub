'use strict';
/**
 * VIỆC CON (21/10/2026): việc lớn chia thành việc con bằng ô "Parent items".
 *
 * Canh ba điều, không gọi Lark:
 *   1. ganTienDoCon đếm đúng tổng / xong / trễ, bỏ việc con đã Huỷ, và đếm trên
 *      TOÀN BỘ việc chứ không trên phần người xem thấy;
 *   2. toCells chỉ ghi việc cha khi được phép (lúc tạo việc), mọi đường sửa
 *      khác bỏ qua nó;
 *   3. ô liên kết ghi đúng dạng [{ id }].
 *
 * Hai hàm được cắt nguyên văn từ server.js (server.js tự bật máy chủ khi
 * require nên không nạp thẳng được).
 *
 * Chạy: node test/viec-con.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

const nguon = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').replace(/\r\n/g, '\n');
const cat = (ten) => {
  const dau = nguon.indexOf('function ' + ten + '(');
  if (dau < 0) throw new Error('Không thấy hàm ' + ten + ' trong server.js');
  const cuoi = nguon.indexOf('\n}\n', dau);
  return nguon.slice(dau, cuoi + 2);
};

const cfg = require('../config');
const F = cfg.fields;
const chuoiGioVN = () => '';
// eslint-disable-next-line no-new-func
const lay = new Function('F', 'chuoiGioVN',
  cat('toCells') + '\n' + cat('ganTienDoCon') + '\nreturn { toCells, ganTienDoCon };');
const { toCells, ganTienDoCon } = lay(F, chuoiGioVN);

console.log('\n\x1b[1m1. Đếm tiến độ việc con\x1b[0m');
{
  const qua = new Date(Date.now() - 86400000).toISOString();
  const toi = new Date(Date.now() + 86400000).toISOString();
  const tatCa = [
    { id: 'cha', status: 'Đang tiến hành' },
    { id: 'c1', parent: ['cha'], status: 'Hoàn thành', deadline: qua },
    { id: 'c2', parent: ['cha'], status: 'Đang tiến hành', deadline: qua },
    { id: 'c3', parent: ['cha'], status: 'Chờ tiếp nhận', deadline: toi },
    { id: 'c4', parent: ['cha'], status: 'Hủy', deadline: qua },
    { id: 'le', status: 'Đang tiến hành' },
  ];
  const thay = [{ id: 'cha' }, { id: 'le' }];
  ganTienDoCon(thay, tatCa);
  const c = thay[0].con || {};
  ok('tổng bỏ việc con đã Huỷ (3)', c.tong === 3, JSON.stringify(c));
  ok('xong đếm việc Hoàn thành (1)', c.xong === 1, JSON.stringify(c));
  ok('trễ chỉ đếm việc chưa xong đã quá hạn (1)', c.tre === 1, JSON.stringify(c));
  ok('việc không có con thì không gắn gì', !('con' in thay[1]));
  ok('đếm trên toàn bộ việc dù người xem chỉ thấy việc cha', thay.length === 2 && c.tong === 3);
}

console.log('\n\x1b[1m2. Việc cha chỉ ghi lúc tạo\x1b[0m');
{
  const sua = toCells({ title: 'A', parent: ['recCha'] });
  ok('đường sửa bỏ qua việc cha', !(F.parent.name in sua), JSON.stringify(sua));
  ok('đường sửa vẫn ghi ô khác', sua[F.title.name] === 'A');
  const tao = toCells({ title: 'A', parent: ['recCha'] }, { choCha: true });
  const o = tao[F.parent.name];
  ok('lúc tạo ghi việc cha dạng [{ id }]', Array.isArray(o) && o.length === 1 && o[0].id === 'recCha', JSON.stringify(o));
  const tao2 = toCells({ parent: [{ id: 'recX' }, ''] }, { choCha: true });
  ok('nhận cả dạng object, bỏ phần tử rỗng', JSON.stringify(tao2[F.parent.name]) === '[{"id":"recX"}]', JSON.stringify(tao2));
}

console.log('\n\x1b[1m3. Quyền\x1b[0m');
ok('nhân sự gửi được ô việc cha khi tạo', cfg.staffCreatable.includes('parent'));
ok('nhân sự KHÔNG sửa được việc cha', !cfg.staffEditable.includes('parent'));

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
