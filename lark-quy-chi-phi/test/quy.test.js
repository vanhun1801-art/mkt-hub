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
    /* "App chưa chạy" là phỏng đoán, không phải chẩn đoán. Ngày 13/09/2026 máy
     * chủ CÓ chạy nhưng mọi request ném ReferenceError — câu đoán bừa chỉ tổ
     * làm mất thêm mười phút. Chỉ thẳng vào bản ghi lỗi. */
    const XD = String.fromCharCode(10);
    console.error('Không gọi được ' + BASE + XD + '  ' + e.message + XD
      + '  Máy chủ có thể đang chạy mà vỡ ở từng request — xem .tmp/log-*.txt');
    process.exit(1);
  }

  nhom('Đọc sổ');
  ok('có danh sách khoản chi', Array.isArray(m.chi) && m.chi.length > 0, String((m.chi || []).length));
  ok('có đợt tạm ứng', Array.isArray(m.dot) && m.dot.length > 0, String((m.dot || []).length));
  ok('có lần nạp quỹ', Array.isArray(m.nap) && m.nap.length > 0, String((m.nap || []).length));
  ok('biết mình là ai', !!(m.me && m.me.id), JSON.stringify(m.me));
  /* Giao diện rẽ nhánh theo `vai`, không theo cờ `chuQuy` nữa. Server quên gửi
   * thì mọi người rơi về 'xem' và anh Hùng lại mở app ra thấy mình là khách —
   * đúng lỗi đã gặp ngày 12/09/2026, lần đó vì open_id lệch giữa hai app Lark. */
  ok('server nói rõ mình đang ở vai nào',
    ['chuQuy', 'keToan', 'xem'].includes(m.vai), 'vai = ' + m.vai);
  ok('cờ chuQuy cũ vẫn khớp với vai mới', m.chuQuy === (m.vai === 'chuQuy'),
    m.vai + ' / ' + m.chuQuy);
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

  nhom('Không bản ghi nào được thiếu ngày');
  /* ---------------------------------------------------------------------
   * Ngày 15/09/2026: một dòng nạp 10.000.000 nằm trong sổ mà KHÔNG CÓ NGÀY.
   * App xếp "không ngày" vào trước mọi kỳ — đúng cho 162 dòng cũ nhập từ
   * sheet, nhưng dòng nạp này thì không: nó làm số dư ĐẦU KỲ của tháng 7,
   * tháng 8 và tháng 9 đều phồng lên đúng 10 triệu. Không lỗi nào bật ra,
   * tổng quỹ vẫn đúng, chỉ có phần chia theo kỳ là sai — thứ kế toán đọc.
   *
   * Dòng "Chuyển từ kỳ trước" thì được phép trống ngày: chúng là tồn mang
   * sang, và tinhQuy() đã loại chúng ra khỏi mọi phép cộng.
   * ------------------------------------------------------------------- */
  const napThieuNgay = m.nap.filter((n) => n.loai !== 'Chuyển từ kỳ trước'
    && !String(n.ngay || '').trim());
  ok('mọi lần nạp tiền đều có ngày', napThieuNgay.length === 0,
    napThieuNgay.map((n) => (n.noiDung || '?') + ' ' + n.tien.toLocaleString('vi')).join(' · '));

  const chiThieuNgay = m.chi.filter((c) => !String(c.ngayChi || c.ngayDeNghi || '').trim());
  ok('mọi khoản chi đều có ngày', chiThieuNgay.length === 0,
    chiThieuNgay.map((c) => c.noiDung).slice(0, 5).join(' · '));

  nhom('Các kỳ tháng nối liền nhau');
  /* Tồn cuối tháng trước PHẢI bằng số dư đầu tháng sau, và tháng cuối cùng phải
   * bằng số dư sống của quỹ. Đây là thứ kế toán dùng để mở sổ tháng mới; đứt
   * một mắt là họ phải quay về cộng tay trong sheet. */
  const thangCua = (v) => (/^\d{4}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 7) : '');
  const napThat = m.nap.filter((n) => n.loai !== 'Chuyển từ kỳ trước');
  const cong = (ds) => ds.reduce((a, x) => a + (Number(x.tien) || 0), 0);
  const tinhKy = (t) => {
    const truoc = (v) => { const k = thangCua(v); return !k || k < t; };
    const trong = (v) => thangCua(v) === t;
    const dauKy = cong(napThat.filter((n) => truoc(n.ngay)))
      - cong(m.chi.filter((c) => truoc(c.ngayChi || c.ngayDeNghi)));
    const nap2 = cong(napThat.filter((n) => trong(n.ngay)));
    const chi2 = cong(m.chi.filter((c) => trong(c.ngayChi || c.ngayDeNghi)));
    return { dauKy, nap: nap2, chi: chi2, cuoiKy: dauKy + nap2 - chi2 };
  };
  const cacThang = [...new Set(m.chi.map((c) => thangCua(c.ngayChi || c.ngayDeNghi))
    .filter(Boolean))].sort();
  let dut = 0;
  for (let i2 = 1; i2 < cacThang.length; i2++) {
    const truoc2 = tinhKy(cacThang[i2 - 1]);
    const sau = tinhKy(cacThang[i2]);
    if (truoc2.cuoiKy !== sau.dauKy) {
      dut++;
      console.log('       đứt ở ' + cacThang[i2 - 1] + ' → ' + cacThang[i2]
        + ': ' + truoc2.cuoiKy.toLocaleString('vi') + ' vs ' + sau.dauKy.toLocaleString('vi'));
    }
  }
  ok('cuối kỳ tháng trước = đầu kỳ tháng sau, suốt ' + cacThang.length + ' kỳ', dut === 0,
    dut + ' chỗ đứt');
  const chot = tinhKy(cacThang[cacThang.length - 1]);
  ok('tồn cuối kỳ tháng chót = số dư quỹ', chot.cuoiKy === m.quy.conLai,
    chot.cuoiKy + ' vs ' + m.quy.conLai);

  nhom('Vai nào ra vai nấy — theo đúng header Hub gửi xuống');
  /* Phân quyền đọc từ header, nên phải thử bằng CHÍNH header đó. Ba cách khai
   * một người: open_id, họ tên, email. Email là cách nên dùng và cũng là cách
   * dễ hỏng lặng lẽ nhất nếu ai đó lỡ bỏ một mắt xích — hub quên chuyển tiếp,
   * app quên đọc, hay so chuỗi phân biệt hoa thường. */
  const nhuLa = async (h) => {
    const r = await fetch(BASE + '/api/meta', { headers: h });
    return r.json();
  };
  /* Phải trùng `keToan` trong config.js. Ghi thẳng ở đây chứ không hỏi server:
   * hỏi server thì phép thử chỉ chứng minh "server nhất quán với chính nó", còn
   * ghi ra thì nó canh đúng người mà anh Hùng đã chốt. */
  const KT = 'tentt@rootytrip.com';

  const kt1 = await nhuLa({
    'x-hub-user-id': 'ou_thu_ke_toan', 'x-hub-user-name': 'Ke%20Toan',
    'x-hub-user-email': KT,
  });
  ok('email công ty khớp thì ra vai kế toán', kt1.vai === 'keToan', 'vai = ' + kt1.vai);
  ok('kế toán KHÔNG phải chủ quỹ', kt1.chuQuy === false);

  /* Hub giữ hai email và chuyển tiếp cả hai. Bỏ rơi cái thứ hai là khớp được
   * một nửa, mà nửa bị bỏ thường là nửa người ta hay gõ. */
  const kt2 = await nhuLa({
    'x-hub-user-id': 'ou_thu_ke_toan', 'x-hub-user-name': 'Ke%20Toan',
    'x-hub-user-email-phu': KT,
  });
  ok('email đăng nhập Lark cũng khớp', kt2.vai === 'keToan', 'vai = ' + kt2.vai);

  const kt3 = await nhuLa({
    'x-hub-user-id': 'ou_thu_ke_toan', 'x-hub-user-name': 'Ke%20Toan',
    'x-hub-user-email': KT.toUpperCase(),
  });
  ok('viết hoa viết thường không ảnh hưởng', kt3.vai === 'keToan', 'vai = ' + kt3.vai);

  const la = await nhuLa({
    'x-hub-user-id': 'ou_nguoi_la', 'x-hub-user-name': 'Nguoi%20La',
    'x-hub-user-email': 'khong-phai-ai@rootytrip.com',
  });
  ok('người ngoài chỉ được xem', la.vai === 'xem', 'vai = ' + la.vai);

  /* Cờ quản lý của Hub phải thắng mọi danh sách id: open_id khác nhau theo từng
   * app Lark, nên id anh Hùng ghi trong config KHÔNG khớp id Hub gửi. Đúng lỗi
   * 12/09/2026 — mở web ra thấy mình là khách. */
  const ql = await nhuLa({
    'x-hub-user-id': 'ou_id_la_hoac', 'x-hub-user-name': 'Le%20Van%20Hung',
    'x-hub-user-manager': '1',
  });
  ok('cờ quản lý của Hub thắng, dù open_id không khớp config',
    ql.vai === 'chuQuy', 'vai = ' + ql.vai);

  nhom('Kế toán không ghi được vào sổ, nhưng quyết toán được');
  const nhuKeToan = {
    'Content-Type': 'application/json',
    'x-hub-user-id': 'ou_thu_ke_toan', 'x-hub-user-name': 'Ke%20Toan',
    'x-hub-user-email': KT,
  };
  const rKhai = await fetch(BASE + '/api/chi', {
    method: 'POST', headers: nhuKeToan,
    body: JSON.stringify({ noiDung: 'TEST kế toán không được khai', tien: 1000 }),
  });
  ok('kế toán khai khoản chi thì bị chặn ở SERVER', rKhai.status === 403, 'HTTP ' + rKhai.status);
  const rNap = await fetch(BASE + '/api/nap', {
    method: 'POST', headers: nhuKeToan, body: JSON.stringify({ tien: 1000 }),
  });
  ok('kế toán nạp quỹ cũng bị chặn', rNap.status === 403, 'HTTP ' + rNap.status);
  const rQt = await fetch(BASE + '/api/quyet-toan', {
    method: 'POST', headers: nhuKeToan, body: JSON.stringify({ ids: [], ma: 'QTTU99/TEST' }),
  });
  /* 400 "chưa chọn khoản nào" = đã QUA chốt quyền rồi mới dừng ở khâu kiểm dữ
   * liệu. Đó mới là điều cần chứng minh; 403 ở đây là hỏng. */
  ok('kế toán QUA được chốt quyền quyết toán', rQt.status === 400, 'HTTP ' + rQt.status);

  nhom('Kế toán duyệt / trả lại từng khoản');
  /* Chỉ chạm vào đường TRẢ LỖI — thiếu lý do, thiếu mã, sai vai. Ba trường hợp
   * đó dừng trước khi ghi, nên phép thử vẫn chỉ đọc đúng như tên tệp hứa. */
  const mot = m.chi.find((c) => c.tinhTrang === 'Đã chi') || m.chi[0];

  const rNoLyDo = await fetch(BASE + '/api/chi/' + mot.id + '/tu-choi', {
    method: 'POST', headers: nhuKeToan, body: JSON.stringify({}),
  });
  const dNoLyDo = await rNoLyDo.json();
  ok('trả lại mà không ghi lý do thì bị chặn',
    rNoLyDo.status === 400 && /lý do/i.test(dNoLyDo.error || ''), JSON.stringify(dNoLyDo));

  const rNoMa = await fetch(BASE + '/api/chi/' + mot.id + '/duyet', {
    method: 'POST', headers: nhuKeToan, body: JSON.stringify({}),
  });
  ok('duyệt mà không nhập mã thì bị chặn', rNoMa.status === 400, 'HTTP ' + rNoMa.status);

  /* Vai chỉ xem KHÔNG được đụng vào hai đường này. Giấu nút chỉ là phép lịch
   * sự với mắt người dùng, chốt thật nằm ở đây. */
  const nhuNguoiLa = {
    'Content-Type': 'application/json',
    'x-hub-user-id': 'ou_nguoi_la', 'x-hub-user-name': 'Nguoi%20La',
    'x-hub-user-email': 'khong-phai-ai@rootytrip.com',
  };
  const rLa = await fetch(BASE + '/api/chi/' + mot.id + '/tu-choi', {
    method: 'POST', headers: nhuNguoiLa, body: JSON.stringify({ lyDo: 'phá thử' }),
  });
  ok('người ngoài không trả lại được khoản nào', rLa.status === 403, 'HTTP ' + rLa.status);
  const rLa2 = await fetch(BASE + '/api/chi/' + mot.id + '/duyet', {
    method: 'POST', headers: nhuNguoiLa, body: JSON.stringify({ ma: 'QTTU-PHA' }),
  });
  ok('người ngoài không duyệt được khoản nào', rLa2.status === 403, 'HTTP ' + rLa2.status);

  const rKhong = await fetch(BASE + '/api/chi/recKHONGCOTHAT/duyet', {
    method: 'POST', headers: nhuKeToan, body: JSON.stringify({ ma: 'X' }),
  });
  ok('khoản không tồn tại thì trả 404, không phải 500', rKhong.status === 404,
    'HTTP ' + rKhong.status);

  nhom('Sổ có chỗ chứa lời từ chối');
  ok('server gửi xuống ô Lý do từ chối', m.chi.every((c) => 'lyDoTuChoi' in c));
  ok('"Kế toán trả lại" là một tình trạng hợp lệ',
    (m.options.tinhTrang || []).includes('Kế toán trả lại'),
    JSON.stringify(m.options.tinhTrang));

  nhom('Không xoá được lịch sử quyết toán bằng một lời gọi');
  const daDongSo = m.chi.find((c) => String(c.maQuyetToan || '').trim());
  if (daDongSo) {
    const r = await fetch(BASE + '/api/quyet-toan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [daDongSo.id], ma: 'QTTU-KHONG-BAO-GIO' }),
    });
    const d = await r.json();
    ok('ghi đè mã cũ mà không khai cờ thì bị chặn (409)',
      r.status === 409 && d.code === 'GHI_DE_MA_CU', 'HTTP ' + r.status + ' ' + JSON.stringify(d));
    ok('câu từ chối nêu đúng mã sắp mất',
      String(d.error || '').includes(daDongSo.maQuyetToan), d.error);
  } else {
    ok('có khoản đã đóng sổ để thử ghi đè', false, 'sổ chưa có khoản nào mang mã QTTU');
  }

  nhom('Không tạo đơn Tourwell trùng cho khoản đã đi qua Tourwell');
  const daQua = m.chi.find((c) => String(c.maDieuHanh || '').trim() && !String(c.maDon || '').trim());
  if (daQua) {
    const r = await fetch(BASE + '/api/chi/' + daQua.id + '/tourwell', { method: 'POST' });
    const d = await r.json();
    ok('khoản đã có mã điều hành SG thì bị chặn (409)',
      r.status === 409 && d.code === 'DA_QUA_TOURWELL', 'HTTP ' + r.status + ' ' + JSON.stringify(d));
  } else {
    console.log('       (bỏ qua: sổ không còn khoản nào có SG mà thiếu mã đơn)');
  }

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
