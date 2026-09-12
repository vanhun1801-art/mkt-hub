'use strict';
/**
 * ============================================================================
 * QUỸ CHI PHÍ — kiểm API, CHỈ ĐỌC
 * ============================================================================
 *
 *   node test/quy.test.js                 (app phải đang chạy ở 5182)
 *   APP_URL=http://localhost:5182 node test/quy.test.js
 *
 * Không ghi gì vào Base. Chỗ đáng kiểm nhất không phải "API có trả về không"
 * mà là SỐ TIỀN CÓ ĐÚNG KHÔNG: số dư từng đợt phải bằng tổng nạp trừ tổng chi
 * tính lại từ chính danh sách khoản chi. Hai con số này đến từ hai đường khác
 * nhau (công thức của Base vs cộng tay ở đây), nên lệch là biết ngay có chuyện.
 */
const BASE = process.env.APP_URL || 'http://localhost:5182';

let pass = 0, fail = 0;
const fails = [];
function ok(ten, dieu, chiTiet) {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (chiTiet ? ' → ' + chiTiet : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : ''));
  }
}
const nhom = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

(async () => {
  let m;
  try {
    const r = await fetch(BASE + '/api/meta');
    m = await r.json();
    if (!r.ok) throw new Error(m.error || ('HTTP ' + r.status));
  } catch (e) {
    console.error('Không gọi được ' + BASE + ' — app chưa chạy?\n  ' + e.message);
    process.exit(1);
  }

  nhom('Đọc sổ');
  ok('có danh sách khoản chi', Array.isArray(m.chi) && m.chi.length > 0, String((m.chi || []).length));
  ok('có đợt tạm ứng', Array.isArray(m.dot) && m.dot.length > 0, String((m.dot || []).length));
  ok('có lần nạp quỹ', Array.isArray(m.nap) && m.nap.length > 0, String((m.nap || []).length));
  ok('biết mình là ai', !!(m.me && m.me.id), JSON.stringify(m.me));
  ok('có đủ lựa chọn loại chi', (m.options.loaiChi || []).length >= 5);

  nhom('Quỹ là MỘT cục');
  ok('server trả về tổng quỹ', !!m.quy, JSON.stringify(m.quy));
  /* Tiền công ty ứng thật = mọi lần nạp TRỪ dòng "Chuyển từ kỳ trước" — dòng đó
   * là tồn của kỳ trước mang sang, cộng vào là tính trùng 11.194.600 đ. */
  const ungThat = m.nap.filter((n) => n.loai !== 'Chuyển từ kỳ trước')
    .reduce((a, n) => a + n.tien, 0);
  const chiHet = m.chi.reduce((a, c) => a + c.tien, 0);
  ok('tổng đã ứng khớp khi tính lại', m.quy.tongUng === ungThat, m.quy.tongUng + ' vs ' + ungThat);
  ok('tổng đã chi khớp khi tính lại', m.quy.tongChi === chiHet, m.quy.tongChi + ' vs ' + chiHet);
  ok('còn lại = đã ứng − đã chi', m.quy.conLai === ungThat - chiHet, String(m.quy.conLai));
  /* Chốt chặn hồi quy: nếu ai đó lỡ đếm cả dòng chuyển tiếp, con số này vọt lên
   * 76.754.531 và bài thử phải đỏ ngay. */
  ok('KHÔNG cộng nhầm dòng chuyển từ kỳ trước', m.quy.tongUng < 70000000,
    'đang là ' + m.quy.tongUng.toLocaleString('vi'));

  /* TỪNG ghim cứng 7.378.056 — con số anh Hùng đối chiếu với kế toán ngày
   * 12/09/2026. Sai lầm: đó là ảnh chụp một khoảnh khắc, mà sổ thì sống. Ngay
   * khoản chi thật đầu tiên (406.000) đã làm bài thử đỏ trong khi phần mềm
   * không hỏng gì. Một bài thử kêu oan thì sớm muộn bị tắt đi.
   *
   * Giữ lại phần BẤT BIẾN: số dư phải luôn bằng phép cộng lại từ sổ (đã kiểm ở
   * trên), và mốc 12/09 thì ghi vào README chứ không ghim vào phép thử. */
  console.log('       số dư hiện tại: ' + m.quy.conLai.toLocaleString('vi') + ' đ'
    + '  (mốc đối chiếu 12/09/2026: 7.378.056 đ)');
  ok('số dư nằm trong khoảng hợp lý của một quỹ tạm ứng',
    m.quy.conLai > -20000000 && m.quy.conLai < 100000000,
    'đang là ' + m.quy.conLai.toLocaleString('vi'));

  nhom('Số dư từng đợt — đối chiếu hai đường tính độc lập');
  let lech = 0;
  for (const d of m.dot) {
    const chi = m.chi.filter((c) => (c.dot || []).includes(d.id))
      .reduce((a, c) => a + c.tien, 0);
    const nap = m.nap.filter((n) => (n.dot || []).includes(d.id))
      .reduce((a, n) => a + n.tien, 0);
    const tinh = nap - chi;
    const khop = Math.abs(tinh - d.conLai) < 1;
    if (!khop) lech++;
    ok('đợt ' + d.ma + ': công thức Base = cộng tay (' + d.conLai.toLocaleString('vi') + ')',
      khop, 'Base ' + d.conLai + ' vs tính lại ' + tinh);
    ok('đợt ' + d.ma + ': tổng chi khớp', Math.abs(d.tongChi - chi) < 1, d.tongChi + ' vs ' + chi);
  }
  ok('không đợt nào lệch số dư', lech === 0, lech + ' đợt lệch');

  nhom('Dữ liệu từng khoản');
  const khongTien = m.chi.filter((c) => !(c.tien > 0));
  ok('không khoản nào có số tiền 0 hoặc âm', khongTien.length === 0,
    khongTien.slice(0, 3).map((c) => c.noiDung).join(' · '));
  const khongDot = m.chi.filter((c) => !(c.dot || []).length);
  ok('mọi khoản đều thuộc một đợt', khongDot.length === 0,
    khongDot.length + ' khoản không có đợt');
  const khongLoai = m.chi.filter((c) => !c.loai);
  ok('mọi khoản đều có loại chi', khongLoai.length === 0, khongLoai.length + ' khoản trống loại');

  nhom('Cảnh báo chứng từ phải đúng cách kế toán làm việc');
  /* Luật đầu tiên là "không đủ cả hoá đơn LẪN UNC = thiếu" và nó réo 68/162
   * khoản, trong đó 67 khoản kế toán đã kiểm và đóng sổ. Cảnh báo sai 67 lần
   * thì lần thứ 68 cũng không ai nhìn. Ba phép thử dưới đây giữ cho nó không
   * quay lại. */
  const thieu = (c) => {
    if (c.tinhTrang === 'Chờ chi') return false;
    if (String(c.maQuyetToan || '').trim()) return false;
    if (c.tinhTrang === 'Đã quyết toán') return false;
    if (c.chungTu === 'Không cần chứng từ') return false;
    const hd = (c.hoaDon || []).length || String(c.linkCu || '').trim();
    const unc = (c.unc || []).length || String(c.linkUncCu || '').trim();
    return !hd && !unc;
  };
  const canBoSung = m.chi.filter(thieu);

  ok('khoản ĐÃ QUYẾT TOÁN không bao giờ bị đòi thêm chứng từ',
    !canBoSung.some((c) => String(c.maQuyetToan || '').trim() || c.tinhTrang === 'Đã quyết toán'));
  ok('khoản đánh dấu "Không cần chứng từ" không bị đòi',
    !canBoSung.some((c) => c.chungTu === 'Không cần chứng từ'));
  /* Chỉ cần MỘT bằng chứng: trả tiền mặt thì không bao giờ có UNC, mua chỗ
   * không xuất hoá đơn thì chỉ có UNC. Đòi đủ cả hai là bịa ra một chuẩn mà
   * chính kế toán không đặt. */
  ok('có hoá đơn nhưng không UNC thì KHÔNG bị đòi',
    !canBoSung.some((c) => (c.hoaDon || []).length || String(c.linkCu || '').trim()));
  ok('cảnh báo không réo quá 10% sổ (đang ' + canBoSung.length + '/' + m.chi.length + ')',
    canBoSung.length <= Math.ceil(m.chi.length * 0.1),
    canBoSung.map((c) => c.noiDung).slice(0, 5).join(' · '));

  ok('server gửi xuống danh sách loại chứng từ',
    (m.options.chungTu || []).length === 3, JSON.stringify(m.options.chungTu));

  nhom('Chốt ghi');
  const r = await fetch(BASE + '/api/chi', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ noiDung: 'TEST không tiền', tien: 0 }),
  });
  const d = await r.json();
  ok('từ chối khoản chi 0 đồng', r.status === 400 && /lớn hơn 0/i.test(d.error || ''), JSON.stringify(d));

  const r2 = await fetch(BASE + '/api/quyet-toan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [], ma: 'QTTU99/TEST' }),
  });
  const d2 = await r2.json();
  ok('từ chối quyết toán khi chưa chọn khoản nào',
    r2.status === 400 && /chưa chọn/i.test(d2.error || ''), JSON.stringify(d2));

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
  if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
