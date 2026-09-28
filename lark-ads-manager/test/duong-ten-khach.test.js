/**
 * Đường ghi công thứ ba: TÊN KHÁCH. Và cái chắn để nó không đi quá xa.
 *
 * Anh Hùng, 28/09/2026: "Chữa chỗ mù đi em".
 *
 * Chỗ mù: 97% hội thoại TikTok có gắn quảng cáo mà không kèm số điện thoại
 * (đo 28/09 trên page "Rooty Trip Phú Quốc", 628 hội thoại có quảng cáo, 609
 * không có số). Đã dò hết mọi hướng trước khi chọn đường này:
 *
 *   khách tự gõ số trong chat   0/80   — ba ca tìm thấy là admin gửi hotline
 *   customers[] của Pancake     không có ô phone/tel/mobile nào
 *   4 endpoint hồ sơ khách      404 hết
 *   đơn POS khoá cứng           TikTok không sinh đơn POS
 *   tag sales + ngày            19% ra một quảng cáo, 41% nhập nhằng → loại
 *   TÊN KHÁCH                   ← còn lại đúng đường này
 *
 * Đo thật trên tháng 8: 21 hội thoại mù ghép được đúng một lead theo tên, gỡ
 * chúng khỏi ô "Rác". Nhưng 0 trong 21 lead đó ra đơn — nên đường này KHÔNG
 * thu thêm đồng doanh thu nào trong tháng đó, và bộ test này không được giả vờ
 * ngược lại. Giá trị của nó là gọi đúng tên: hội thoại đã thành lead Tourwell
 * thì không phải "Rác".
 */
const roas = require('../sync/roas');
const { chuanTen } = require('../sync/pancake');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const data = { ads: [
  { id: 'r1', extId: '111', name: 'QC A', platform: 'TikTok' },
  { id: 'r2', extId: '222', name: 'QC B', platform: 'TikTok' }],
  daily: [{ adId: 'r1', date: '2026-09-10', spend: 1000000 }] };
const CHUNG = { data, from: '2026-09-01', to: '2026-09-30', cuaSo: 60 };
const ht = (o) => ({ type: 'INBOX', sdt: [], coSdt: false, ...o });

console.log('— chuẩn hoá tên: hai hệ thống ghi hai kiểu, phải về một');
{
  t('bỏ tiền tố "(Quý khách)"', chuanTen('(Quý khách) Cô 2 Họ Đào') === chuanTen('Cô 2 Họ Đào'));
  t('bỏ dấu tiếng Việt', chuanTen('Nguyễn Thuý Hằng') === 'nguyenthuyhang', chuanTen('Nguyễn Thuý Hằng'));
  t('bỏ emoji', chuanTen('MiMi 🇻🇳🇺🇸') === 'mimi', chuanTen('MiMi 🇻🇳🇺🇸'));
  /* Tên quá ngắn phải bị loại: 'Anh', 'My', 'Linh' đụng nhau hàng loạt, ghép
   * vào là gán doanh thu cho nhầm quảng cáo. */
  t('tên dưới 4 ký tự bị loại', chuanTen('Anh') === '' && chuanTen('My') === '');
  t('null/undefined không nổ', chuanTen(null) === '' && chuanTen(undefined) === '');
}

console.log('— ghép được thì ghi công, và ghi rõ là đi đường tên');
{
  const kq = roas.tinh({ ...CHUNG,
    hoiThoaiRows: [ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-05',
      tenKhachDs: ['Cô 2 Họ Đào'], tenKhach: 'Cô 2 Họ Đào' })],
    leadRows: [{ id: 1, ma: 'LU1', kh: 'KH-A', ngay: '2026-09-05', khach: '(Quý khách) Cô 2 Họ Đào' }],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 6000000, thu: 5000000 }],
  });
  const row = (kq.rows || []).find((r) => r.duong === 'tên khách') || {};
  t('có dòng đi đường "tên khách"', row.don === 1, JSON.stringify(kq.rows.map((r) => r.duong + ':' + r.don)));
  t('ghi đúng số tiền', kq.tong.tien === 6000000, String(kq.tong.tien));
  const h = (kq.hoiThoaiPhanLoai || [])[0] || {};
  t('hội thoại thành chuyển đổi', h.nhom === 'chuyen-doi', h.nhom);
  t('lý do nói rõ ghép theo TÊN', /theo TÊN/.test(h.lyDo || ''), h.lyDo);
  t('và nói rõ đây là khoá yếu hơn', /yếu hơn số điện thoại/.test(h.lyDo || ''), h.lyDo);
  t('đếm riêng số hội thoại gỡ được bằng tên', kq.cauNoi.hoiThoaiTheoTen === 1, String(kq.cauNoi.hoiThoaiTheoTen));
}

console.log('— TÊN TRÙNG thì bỏ hẳn, không chọn bừa');
{
  /* Hai khách cùng tên: không có cách nào biết hội thoại thuộc ai. Đoán ở đây
   * là gán doanh thu của người này cho quảng cáo mang người kia về. */
  const kq = roas.tinh({ ...CHUNG,
    hoiThoaiRows: [ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-05', tenKhachDs: ['Trần Văn Nam'] })],
    leadRows: [
      { id: 1, ma: 'LU1', kh: 'KH-A', ngay: '2026-09-05', khach: 'Trần Văn Nam' },
      { id: 2, ma: 'LU2', kh: 'KH-B', ngay: '2026-09-06', khach: 'Trần Văn Nam' }],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 9000000, thu: 7000000 }],
  });
  t('không ghi công cho ai cả', kq.tong.don === 0, JSON.stringify(kq.tong));
  t('và hội thoại KHÔNG bị gọi là chuyển đổi',
    (kq.hoiThoaiPhanLoai[0] || {}).nhom !== 'chuyen-doi', (kq.hoiThoaiPhanLoai[0] || {}).nhom);
}

console.log('— hội thoại quy về NHIỀU quảng cáo thì bỏ, y như hai đường kia');
{
  const kq = roas.tinh({ ...CHUNG,
    hoiThoaiRows: [ht({ id: 'h1', adIds: ['111', '222'], ngay: '2026-09-05', tenKhachDs: ['Cô 2 Họ Đào'] })],
    leadRows: [{ id: 1, ma: 'LU1', kh: 'KH-A', ngay: '2026-09-05', khach: 'Cô 2 Họ Đào' }],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 9000000, thu: 7000000 }],
  });
  t('không ghi công khi hai quảng cáo cùng nhận', kq.tong.don === 0, JSON.stringify(kq.tong));
}

console.log('— đường TÊN không được giành đơn của đường mạnh hơn');
{
  /* Cùng một đơn: đường số điện thoại (đường 2) phải giữ, đường tên không được
   * cướp lại rồi tính thành hai đơn. */
  const kq = roas.tinh({ ...CHUNG,
    hoiThoaiRows: [
      ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-05', sdt: ['0900000001'], coSdt: true }),
      ht({ id: 'h2', adIds: ['222'], ngay: '2026-09-06', tenKhachDs: ['Cô 2 Họ Đào'] }),
    ],
    leadRows: [{ id: 1, ma: 'LU1', sdt: '0900000001', kh: 'KH-A', ngay: '2026-09-05', khach: 'Cô 2 Họ Đào' }],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 6000000, thu: 5000000 }],
  });
  t('đơn chỉ được ghi công MỘT lần', kq.tong.don === 1, JSON.stringify(kq.tong));
  t('tiền không nhân đôi', kq.tong.tien === 6000000, String(kq.tong.tien));
  const duong = (kq.rows || []).filter((r) => r.don > 0).map((r) => r.duong);
  t('và đơn đó thuộc đường số điện thoại', duong.length === 1 && duong[0] === 'hội thoại', JSON.stringify(duong));
  /* Hội thoại đi đường tên không ra đơn nào thì không được đếm là lead của nó. */
  const rTen = (kq.rows || []).find((r) => r.duong === 'tên khách');
  t('hội thoại tên không ra đơn thì không đẻ dòng rỗng', !rTen || rTen.lead === 0, JSON.stringify(rTen));
}

console.log('— tên khớp lead nhưng lead chưa ra đơn: là TIỀM NĂNG, không phải Rác');
{
  /* Ca hay gặp nhất, đo được 18/21 trên dữ liệu tháng 8. Gọi một hội thoại đã
   * thành lead Tourwell là "Rác" thì ô "Rác 96%" đang nói quá. */
  const kq = roas.tinh({ ...CHUNG,
    hoiThoaiRows: [ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-05', tenKhachDs: ['Cô 2 Họ Đào'] })],
    leadRows: [{ id: 1, ma: 'LU1', kh: 'KH-A', ngay: '2026-09-05', khach: 'Cô 2 Họ Đào' }],
    donRows: [],
  });
  const h = kq.hoiThoaiPhanLoai[0] || {};
  t('không bị xếp vào Rác', h.nhom === 'tiem-nang', h.nhom);
  t('nói rõ chưa thấy ra đơn', /chưa thấy ra đơn/.test(h.lyDo || ''), h.lyDo);
  t('và không bịa ra tiền', !h.tien, String(h.tien));
}

console.log('— app phải NÓI RA chỗ nó mù, kèm số đã đo');
{
  const fs = require('fs');
  const path = require('path');
  const r = fs.readFileSync(path.join(__dirname, '..', 'sync', 'roas.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  /* Ghi lại mọi hướng đã dò, để phiên sau khỏi đi dò lại từ đầu. */
  t('ghi chú có khối "CHỖ MÙ"', /CHỖ MÙ 96%/.test(r));
  t('ghi lại kết quả dò tin nhắn 0/80', /0 \/ 80/.test(r));
  t('ghi lại vì sao loại đường tag sales', /19% ra ĐÚNG MỘT quảng cáo/.test(r));
  t('nói rõ phần còn lại phải sửa ở chỗ tạo lead', /KHÔNG chữa được từ dữ liệu/.test(r));

  /* Và giao diện phải nói với người dùng, không chỉ nói với người đọc code. */
  t('giao diện giải thích vì sao không đo được', /Vì sao phần còn lại không đo được/.test(app));
  t('nêu con số 97% đã đo', /97% hội thoại có gắn quảng cáo/.test(app));
  t('nói rõ app không tự bịa ra được', /app không tự bịa ra được/.test(app));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
