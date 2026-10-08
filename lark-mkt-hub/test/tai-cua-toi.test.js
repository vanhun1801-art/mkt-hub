'use strict';
/**
 * ============================================================================
 * "Tải của tôi" — nhân sự phải NHÌN THẤY dải nhiệt của chính mình
 * ============================================================================
 * Ngày 08/10/2026 anh Hùng hỏi "nhân sự có đang thấy dải nhiệt của bản thân
 * không". Đo ra: KHÔNG. Mà lý do mới là chỗ đáng ghi lại.
 *
 * Máy chủ làm đủ cả: cắt lưới còn đúng dòng của người đang xem, đặt cờ
 * `chiMinh`, đổi nhãn khối thành "Tải của tôi", đổi phụ đề thành "Tải của bạn",
 * và có hẳn phép thử "nhân sự không thấy ngày nghỉ của đồng nghiệp". Dữ liệu
 * về tới trình duyệt đầy đủ. Nhưng veHome() có một dòng:
 *
 *     const taiHtml = S.quanLy ? khoiTaiNhanSu() : '';
 *
 * nên khối không bao giờ được vẽ cho nhân sự. Cả nhánh "Tải của tôi" là mã
 * chết — viết xong, thử xong, chưa ai từng nhìn thấy.
 *
 * Đây là loại lỗi mà phép thử máy chủ không bao giờ bắt được: máy chủ đúng từ
 * đầu đến cuối. Hở nằm ở mối nối giữa hai bên. Nên bài này canh CẢ HAI đầu —
 * máy chủ cắt đúng, VÀ trang chịu vẽ ra.
 *
 * Chạy: node test/tai-cua-toi.test.js
 */
const fs = require('fs');
const path = require('path');
const { lichChung, BO_DOC, DOC_NGHI, xoaCache } = require('../lichchung');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; fails.push(ten); console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const TU = '2026-10-01', DEN = '2026-10-31';
const viec = (o) => Object.assign({
  id: 'r1', module: 'cv', ngay: '2026-10-05', gio: '', tieuDe: 'Viết bài',
  trangThai: '', muc: 'thap', the: [], chinh: [], hoTro: [],
}, o);

const KHANH = { id: 'ou_khanh', name: 'Khánh' };
const TRUONG = { id: 'ou_truong', name: 'Trường' };

async function chay(dsViec, dsNghi, nguoi) {
  BO_DOC.__v = async () => dsViec;
  DOC_NGHI.__n = async () => dsNghi;
  xoaCache();
  const kq = await lichChung([{ id: 'cv', kpi: '__v' }, { id: 'llv', kpi: '__n' }], TU, DEN, true, nguoi);
  delete BO_DOC.__v; delete DOC_NGHI.__n;
  return kq;
}

/* Nhân sự thường: không quản lý, không "xem toàn bộ", không được kê xem ai. */
const thuong = (id) => ({ id, quanLy: false, toanBo: false, moiXemTai: false, xemTaiAi: [] });

(async () => {
  group('máy chủ cắt đúng phần của nhân sự');

  const dsViec = [
    viec({ id: 'a', chinh: [KHANH] }),
    viec({ id: 'b', ngay: '2026-10-06', chinh: [KHANH] }),
    viec({ id: 'c', ngay: '2026-10-07', chinh: [TRUONG] }),
  ];
  const dsNghi = [
    { id: 'ou_khanh', ten: 'Khánh', ngay: '2026-10-04', ma: 'OFF', muc: 'ca' },
    { id: 'ou_truong', ten: 'Trường', ngay: '2026-10-04', ma: 'OFF', muc: 'ca' },
  ];

  const cuaKhanh = await chay(dsViec, dsNghi, thuong('ou_khanh'));
  ok('chỉ còn đúng một dòng — của chính mình',
    cuaKhanh.hang.length === 1 && cuaKhanh.hang[0].id === 'ou_khanh');
  ok('không lộ việc của đồng nghiệp', cuaKhanh.hang[0].tong === 2);
  ok('không lộ ngày nghỉ của đồng nghiệp',
    JSON.stringify(cuaKhanh.hang).indexOf('Trường') === -1);
  ok('cờ chiMinh bật — để trang đổi nhãn thành "Tải của tôi"', cuaKhanh.chiMinh === true);
  ok('tổng lượt đếm theo đúng phần được xem, không theo cả phòng',
    cuaKhanh.tongLuot === 2 && cuaKhanh.tongViec === 2);

  const cuaQL = await chay(dsViec, dsNghi, { id: 'ou_sep', quanLy: true });
  ok('quản lý vẫn thấy cả lưới', cuaQL.hang.length === 2);
  ok('quản lý KHÔNG bị đổi nhãn sang "Tải của tôi"', cuaQL.chiMinh === false);

  /* Người được kê xem thêm vài người thì vẫn là "Tải nhân sự", không phải
   * "Tải của tôi" — nhãn sai ở đây làm người ta tưởng đang nhìn mỗi mình. */
  const keThem = await chay(dsViec, dsNghi,
    { id: 'ou_khanh', quanLy: false, toanBo: false, moiXemTai: false, xemTaiAi: ['ou_truong'] });
  ok('được kê xem thêm người thì thấy đủ cả hai dòng', keThem.hang.length === 2);
  ok('…và nhãn KHÔNG phải "Tải của tôi"', keThem.chiMinh === false);

  /* Nhân sự chưa có việc nào: lưới rỗng, và trang phải nói ra một câu chứ
   * không để khoảng trắng. */
  const rong = await chay(dsViec, dsNghi, thuong('ou_la_ai_do'));
  ok('người chưa có việc nào thì lưới rỗng (không rơi sang thấy cả phòng)', rong.hang.length === 0);

  group('trang chịu vẽ khối ra cho nhân sự');

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  /* Chính là dòng đã gây lỗi. Canh bằng regex thay vì so chuỗi nguyên văn để
   * đổi khoảng trắng hay tên biến vẫn bắt được. */
  ok('veHome() KHÔNG còn chặn khối tải theo quyền quản lý',
    !/taiHtml\s*=\s*[^;]*\bS\.quanLy\s*\?/.test(src),
    'còn `S.quanLy ?` trước khoiTaiNhanSu() — nhân sự sẽ lại không thấy gì');
  ok('veHome() vẫn gọi khoiTaiNhanSu()', /const\s+taiHtml\s*=\s*khoiTaiNhanSu\(\)/.test(src));
  ok('và taiHtml vẫn được ghép vào trang', /\+\s*taiHtml\s*;/.test(src));

  /* Nhãn và phụ đề phải chạy theo cờ của máy chủ, không theo S.quanLy — nếu
   * lấy theo quyền thì người được kê xem thêm sẽ thấy nhãn sai. */
  ok('nhãn khối lấy theo d.chiMinh của máy chủ', /d\.chiMinh\s*\?\s*'Tải của tôi'/.test(src));
  ok('phụ đề cũng lấy theo d.chiMinh', /d\.chiMinh[\s\S]{0,40}'Tải của bạn/.test(src));
  ok('lưới rỗng thì nói ra một câu, không để trắng',
    /!d\.hang\.length[\s\S]{0,120}Không có việc nào/.test(src));

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
  process.exit(fail ? 1 : 0);
})();
