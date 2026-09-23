'use strict';
/**
 * ============================================================================
 * DẢI NHIỆT × NGÀY NGHỈ — base "Lịch làm việc" chỉ tô nền, không cộng tải
 * ============================================================================
 * Ngày nghỉ đi qua DOC_NGHI, KHÔNG qua BO_DOC. Nhét nhầm vào BO_DOC thì mỗi
 * ngày nghỉ thành một "việc" và người nghỉ phép nhiều nhất lại đứng đầu bảng
 * tải — đúng ngược nghĩa.
 *
 * Phép thử tiêm bộ đọc giả vào BO_DOC và DOC_NGHI, không cần Base.
 * Chạy: node test/nghi-lich.test.js
 */
const { lichChung, BO_DOC, DOC_NGHI, xoaCache } = require('../lichchung');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; fails.push(ten); console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

const TU = '2026-10-01', DEN = '2026-10-31';
const viec = (o) => Object.assign({ id: 'r1', module: 'cv', ngay: '2026-10-05', gio: '', tieuDe: 'Viết bài',
  trangThai: '', muc: 'thap', the: [], chinh: [], hoTro: [] }, o);

async function chay(dsViec, dsNghi) {
  BO_DOC.__v = async () => dsViec;
  DOC_NGHI.__n = async () => dsNghi;
  xoaCache();
  const kq = await lichChung([{ id: 'cv', kpi: '__v' }, { id: 'llv', kpi: '__n' }], TU, DEN, true, null);
  delete BO_DOC.__v; delete DOC_NGHI.__n;
  return kq;
}

(async () => {
  const HUNG = { id: 'ou_hung', name: 'Lê Văn Hùng' };

  let kq = await chay([viec({ chinh: [HUNG] })],
    [{ id: 'ou_hung', ten: 'Lê Văn Hùng', ngay: '2026-10-05', ma: 'NP', muc: 'ca', tenMa: 'Nghỉ phép năm' },
      { id: 'ou_hung', ten: 'Lê Văn Hùng', ngay: '2026-10-10', ma: 'x/2', muc: 'nua', tenMa: 'Làm nửa ngày' }]);
  let h = kq.hang.find((r) => r.id === 'ou_hung');
  ok('ngày nghỉ gắn vào đúng dòng theo open_id', h && h.nghi['2026-10-05'] && h.nghi['2026-10-05'].ma === 'NP');
  ok('nửa ngày giữ mức "nua"', h && h.nghi['2026-10-10'].muc === 'nua');
  ok('ngày nghỉ KHÔNG cộng vào tải', h && h.tong === 1, h && String(h.tong));
  ok('việc rơi vào ngày nghỉ cả ngày được đếm là trùng', h && h.trungNghi === 1);
  ok('tổng lượt không đổi vì ngày nghỉ', kq.tongLuot === 1);

  /* Tên HCNS khác dấu cách / hoa thường so với tên Lark, không có open_id. */
  kq = await chay([viec({ chinh: [HUNG] })],
    [{ id: '', ten: 'lê  văn HÙNG', ngay: '2026-10-06', ma: 'KL', muc: 'ca', tenMa: 'Nghỉ không lương' }]);
  h = kq.hang.find((r) => r.id === 'ou_hung');
  ok('không có id thì khớp theo tên bỏ dấu cách/hoa thường', h && h.nghi['2026-10-06'] && h.nghi['2026-10-06'].ma === 'KL');

  /* Tên Lark lệch tên HCNS — dòng dải nhiệt mang tên Lark, ngày nghỉ mang tên HCNS. */
  kq = await chay([viec({ chinh: [{ id: 'ou_pinky', name: 'Nguyễn Long Khánh (Pinky)' }] }),
    viec({ id: 'r2', chinh: [{ id: 'ou_han', name: 'Hân Phù MKT' }] }),
    viec({ id: 'r3', chinh: [{ id: 'ou_khanh', name: 'Huỳnh Chí Khanh' }] })],
  [{ id: '', ten: 'Nguyễn Long Khánh', ngay: '2026-10-09', ma: 'NP', muc: 'ca' },
    { id: '', ten: 'Phù Mỹ Hân', ngay: '2026-10-09', ma: 'NP', muc: 'ca' }]);
  const cua = (id) => (kq.hang.find((r) => r.id === id) || {}).nghi || {};
  ok('"Nguyễn Long Khánh" (HCNS) gắn vào dòng "Nguyễn Long Khánh (Pinky)"', !!cua('ou_pinky')['2026-10-09']);
  ok('"Phù Mỹ Hân" (HCNS) gắn vào dòng "Hân Phù MKT"', !!cua('ou_han')['2026-10-09']);
  ok('Khánh không bị gắn nhầm sang Huỳnh Chí Khanh', !cua('ou_khanh')['2026-10-09']);

  /* Người không có việc nào trong khoảng nhưng có ngày nghỉ, có id -> vẫn một dòng. */
  kq = await chay([], [{ id: 'ou_thu', ten: 'Huỳnh Thị Anh Thư', ngay: '2026-10-07', ma: 'NP', muc: 'ca', tenMa: 'Nghỉ phép năm' }]);
  h = kq.hang.find((r) => r.id === 'ou_thu');
  ok('người chỉ có ngày nghỉ vẫn có dòng', h && h.tong === 0 && h.nghi['2026-10-07']);

  /* Không id, không khớp tên -> bỏ, KHÔNG được rơi vào hàng "Chưa phân công". */
  kq = await chay([], [{ id: '', ten: 'Ai Đó', ngay: '2026-10-07', ma: 'NP', muc: 'ca' }]);
  ok('ngày nghỉ không rõ người thì bỏ, không rơi vào "Chưa phân công"', !kq.hang.some((r) => r.id === ''));

  /* Base Lịch làm việc hỏng thì dải nhiệt vẫn vẽ việc, chỉ báo lỗi. */
  BO_DOC.__v = async () => [viec({ chinh: [HUNG] })];
  DOC_NGHI.__n = async () => { throw new Error('Base bận'); };
  xoaCache();
  kq = await lichChung([{ id: 'cv', kpi: '__v' }, { id: 'llv', kpi: '__n' }], TU, DEN, true, null);
  delete BO_DOC.__v; delete DOC_NGHI.__n;
  ok('Base nghỉ hỏng thì vẫn có việc + báo lỗi', kq.tongLuot === 1 && kq.loi.some((x) => x.module === 'llv'));

  /* Nhân sự chỉ thấy dòng mình — ngày nghỉ của người khác không lộ. */
  BO_DOC.__v = async () => [viec({ chinh: [HUNG] }), viec({ id: 'r2', chinh: [{ id: 'ou_ngoc', name: 'Ngọc' }] })];
  DOC_NGHI.__n = async () => [{ id: 'ou_ngoc', ten: 'Ngọc', ngay: '2026-10-08', ma: 'NP', muc: 'ca' }];
  xoaCache();
  kq = await lichChung([{ id: 'cv', kpi: '__v' }, { id: 'llv', kpi: '__n' }], TU, DEN, true,
    { id: 'ou_hung', quanLy: false, toanBo: false });
  delete BO_DOC.__v; delete DOC_NGHI.__n;
  ok('nhân sự không thấy ngày nghỉ của đồng nghiệp', kq.hang.length === 1 && kq.hang[0].id === 'ou_hung');

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  process.exit(fail ? 1 : 0);
})();
