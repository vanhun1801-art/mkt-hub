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
   * 76.194.600 và bài thử phải đỏ ngay. */
  ok('KHÔNG cộng nhầm dòng chuyển từ kỳ trước', m.quy.tongUng < 70000000,
    'đang là ' + m.quy.tongUng.toLocaleString('vi'));

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
