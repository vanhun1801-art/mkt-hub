'use strict';
/*
 * CÀI ĐẶT — menu bên trái, nội dung bên phải.
 *
 * Trước đây tất cả dồn vào một hộp thoại: bảng module, nút kiểm tra, nút phân
 * quyền, id tài khoản… đọc mệt và không biết còn gì nữa. Giờ chia thành mục, mỗi
 * mục một việc, đúng lối trang cài đặt quen thuộc: chọn mục bên trái, xem và sửa
 * bên phải.
 *
 * Hàm modalCaiDat() ở đây GHI ĐÈ bản cũ trong app.js (file này nạp sau), nên mọi
 * chỗ đang gọi modalCaiDat() vẫn dùng được, không phải sửa gì.
 */

/* `ql: true` = chỉ quản lý thấy. Nhân sự vào Cài đặt chỉ để đổi ngôn ngữ và
 * sáng/tối, nên mọi mục quản trị đều gắn cờ này. Không phải chỉ ẩn cho gọn:
 * server cũng chặn 403 những đầu mối tương ứng, ẩn ở đây là để khỏi bày ra một
 * cánh cửa mà bấm vào chỉ nhận lỗi. */
/* Bảng app có thiết lập riêng. Trang của mỗi app gom TẤT CẢ thiết lập của nó,
 * để không phải vào tận trong app mới sửa được. Thêm app hay thêm thiết lập
 * chỉ là thêm một dòng ở đây.
 *
 * `phanPhoi`: app có trung tâm phân phối. Cố ý KHÔNG dựng lại giao diện đó ở
 * Cài đặt — nó là bảng nhiều cột với trọng số từng người, dựng hai bản là có
 * ngày lệch. Cài đặt làm đúng việc của nó: chỗ duy nhất để TÌM ra thiết lập.
 */
const APP_CD = [
  { id: 'cong-viec', ten: 'Bảng công việc', ic: 'cong-viec',
    mo: 'Phân phối việc mới', tu: 'tỷ lệ tự giao mốc chờ loại việc quản lý',
    phanPhoi: true },
  { id: 'lich-tac-nghiep', ten: 'Lịch tác nghiệp', ic: 'lich',
    mo: 'Khung giờ đăng ký lịch',
    tu: 'mở đóng nút đăng ký thứ 6 thứ 7 khung giờ mở khoá',
    cuaSo: true },
];

/**
 * Danh sách mục, xếp theo VIỆC chứ không theo chỗ lưu.
 *
 *   Của tôi   — riêng máy này, đổi xong chỉ mình thấy
 *   Hệ thống  — cả phòng chịu ảnh hưởng
 *   Từng app  — thiết lập thuộc về một app cụ thể
 *   Nâng cao  — chẩn đoán, không phải thiết lập
 *
 * `ql: true` = chỉ quản lý thấy. Không phải để cho gọn: máy chủ cũng chặn 403
 * những đầu mối tương ứng, ẩn ở đây là để khỏi bày ra một cánh cửa mà bấm vào
 * chỉ nhận lỗi.
 */
function cdNhom() {
  return [
    { nhom: 'Của tôi', ds: [
      { k: 'toi', ten: 'Của tôi', ic: 'nguoi', mo: 'Ngôn ngữ, sáng tối, tài khoản',
        tu: 'tiếng anh english theme giao diện đăng nhập' },
    ] },
    { nhom: 'Hệ thống', ds: [
      { k: 'base', ten: 'Base trong panel', ic: 'base', mo: 'Bật, tắt, ẩn, thêm base',
        tu: 'module app cả phòng kín', ql: true },
      /* MỘT mục cho mọi câu hỏi "ai được làm gì" — xem chú thích ở veCdQuyen. */
      { k: 'quyen', ten: 'Phân quyền', ic: 'nguoi',
        mo: 'Ai thấy base nào, ai duyệt được trong app nào',
        tu: 'quản lý nhân sự chi phí tạo mới lead availability', ql: true },
      /* Đặt cạnh Phân quyền vì cùng một loại việc: tác động tới màn hình của
       * người khác. Khác Phân quyền ở chỗ nó tác động NGAY và CHẶN. */
      { k: 'thong-bao', ten: 'Thông báo tới nhân sự', ic: 'chuong',
        mo: 'Popup chặn màn hình, buộc đọc mới dùng app tiếp',
        tu: 'popup thông báo bắt buộc đọc gấp phổ biến nhắc cả phòng', ql: true },
    { k: 'thuong-hieu', ten: 'Nhận diện thương hiệu', ic: 'anh',
      mo: 'Logo đóng lên tệp xuất ra', ql: true },
      { k: 'he-thong', ten: 'Hệ thống', ic: 'may',
        mo: 'Địa chỉ công khai, app Lark, bản đang chạy',
        tu: 'url link app id build commit chế độ chạy render', ql: true },
    ] },
    { nhom: 'Từng app', ds: APP_CD.map((a) => ({
      k: 'app:' + a.id, ten: a.ten, ic: a.ic, mo: a.mo, tu: a.tu, ql: true,
    })) },
    { nhom: 'Nâng cao', ds: [
      { k: 'kiem-tra', ten: 'Kiểm tra hệ thống', ic: 'may', mo: 'Hỏi từng base xem đọc được gì', ql: true },
      { k: 'log', ten: 'Log app con', ic: 'may', mo: 'Xem stderr thật của app con', ql: true },
    ] },
  ];
}

/**
 * Các mục người đang xem được vào, đã lọc theo ô tìm.
 *
 * Tìm theo TÊN, DÒNG MÔ TẢ, và cả TỪ KHOÁ ẩn (`tu`) — người ta nhớ mình muốn
 * làm gì, không nhớ mục tên gì. Ví dụ gõ "tỷ lệ" ra trang Bảng công việc, gõ
 * "chi phí" ra Phân quyền: hai chữ đó không có trên nhãn nào cả.
 */
function cdMucCuaToi() {
  const q = (S.cdTim || '').trim().toLowerCase();
  /* Xét cả `tu` — từ khoá không hiện ra mắt. Chỉ tìm theo tên và dòng mô tả
   * thì gõ "tỷ lệ" ra RỖNG, dù thứ anh muốn nằm trong trang Bảng công việc:
   * chữ "tỷ lệ" chỉ có trong thân trang, không có trên nhãn. Người ta nhớ mình
   * muốn làm gì, không nhớ mục tên gì. */
  const khop = (m) => !q ||
    (m.ten + ' ' + (m.mo || '') + ' ' + (m.tu || '')).toLowerCase().includes(q);
  return cdNhom()
    .map((g) => ({ nhom: g.nhom, ds: g.ds.filter((m) => (S.quanLy || !m.ql) && khop(m)) }))
    .filter((g) => g.ds.length);
}

function modalCaiDat(mucDau) {
  S.cdMuc = mucDau || S.cdMuc || 'chung';
  const duoc = cdMucCuaToi().flatMap((g) => g.ds.map((m) => m.k));
  if (!duoc.includes(S.cdMuc)) S.cdMuc = duoc[0] || 'chung';
  moModal('Cài đặt',
    '<div class="cd">' +
      '<nav class="cd-nav" id="cdNav"></nav>' +
      '<div class="cd-noi" id="cdNoi"></div>' +
    '</div>',
    '<span class="cd-chan-ghi" id="cdChanGhi"></span>' +
    '<span class="grow"></span>' +
    '<button class="btn ghost" data-close="1">Đóng</button>', true);
  veCdNav();
  veCdNoi();
}

/* Ô tìm: gõ tới đâu lọc tới đó. Giữ con trỏ trong ô sau khi vẽ lại danh sách,
 * không thì gõ được một chữ là mất focus. */
function ganCdTim() {
  const o = $('#cdTim');
  if (!o) return;
  o.oninput = () => {
    S.cdTim = o.value;
    const vt = o.selectionStart;
    veCdNav();
    const moi = $('#cdTim');
    if (moi) { moi.focus(); moi.setSelectionRange(vt, vt); }
  };
}

function veCdNav() {
  const nhom = cdMucCuaToi();
  $('#cdNav').innerHTML =
    '<div class="cd-tim"><input id="cdTim" placeholder="Tìm thiết lập…" value="' +
      esc(S.cdTim || '') + '"></div>' +
    (nhom.length ? '' : '<div class="cd-tim-trong">Không có mục nào khớp.</div>') +
    nhom.map((g) =>
    '<div class="cd-nhom">' + esc(g.nhom) + '</div>' +
    g.ds.map((m) =>
      '<button class="cd-item' + (S.cdMuc === m.k ? ' on' : '') + '" data-cd="' + m.k + '">' +
      '<span class="cd-ic">' + icon(m.ic) + '</span>' +
      '<span class="cd-tx"><b>' + esc(m.ten) + '</b></span></button>').join('')
  ).join('');
  ganCdTim();
}

const cdTieuDe = (ten, mo) =>
  '<div class="cd-dau"><h3>' + esc(ten) + '</h3>' + (mo ? '<p>' + esc(mo) + '</p>' : '') + '</div>';

/** Một hàng cài đặt: chữ bên trái, thứ điều khiển bên phải. */
const cdHang = (ten, mo, dieuKhien) =>
  '<div class="cd-hang"><div class="cd-hang-tx"><b>' + esc(ten) + '</b>' +
  (mo ? '<p>' + mo + '</p>' : '') + '</div>' +
  '<div class="cd-hang-dk">' + (dieuKhien || '') + '</div></div>';

function veCdNoi() {
  const el = $('#cdNoi');
  const chan = $('#cdChanGhi');
  if (chan) chan.textContent = '';
  el.scrollTop = 0;
  if (S.cdMuc.indexOf('app:') === 0) {
    const a = APP_CD.find((x) => 'app:' + x.id === S.cdMuc);
    if (a) return veCdApp(el, a);
  }
  if (S.cdMuc === 'toi') return veCdToi(el);
  if (S.cdMuc === 'he-thong') return veCdHeThong(el);
  if (S.cdMuc === 'quyen') return veCdQuyen(el);
  if (S.cdMuc === 'thong-bao') return veCdThongBao(el);
  if (S.cdMuc === 'base') return veCdBase(el);
  if (S.cdMuc === 'thuong-hieu') return veCdThuongHieu(el);
  if (S.cdMuc === 'kiem-tra') return veCdKiemTra(el);
  if (S.cdMuc === 'log') return veCdLog(el);
}


/* ---------------- Quản lý của từng app ----------------
 * Khác mục "Nhân sự & phân quyền": mục kia quyết ai THẤY base nào (luật của
 * lớp vỏ, lưu ở lớp vỏ). Mục này quyết ai là QUẢN LÝ trong một app — luật của
 * chính app đó, lưu ở app đó, nên phải gọi xuyên proxy sang app mà đọc/ghi.
 *
 * Hai app hai hình dạng endpoint khác nhau (đã đọc thật, không đoán), nên khai
 * thành bảng: thêm app thứ ba chỉ là thêm một dòng.
 */
const QL_APP = [
  { id: 'cong-viec', ten: 'Bảng công việc', doc: '/api/managers',
    than: (ids) => ({ ids }) },
  /* Lịch không trả danh bạ trong /api/quyen — phải lấy thêm ở /api/meta. */
  { id: 'lich-tac-nghiep', ten: 'Lịch tác nghiệp', doc: '/api/quyen',
    dsNguoi: '/api/meta', than: (ids) => ({ managers: ids }) },
];

async function napCdQl(a, y) {
  const hop = $('#cdQl-' + a.id);
  if (!hop) return;
  try {
    const d = await goi('/m/' + a.id + a.doc);
    let nguoi = d.people || [];
    if (!nguoi.length && a.dsNguoi) {
      const m = await goi('/m/' + a.id + a.dsNguoi);
      nguoi = m.people || [];
    }
    S.cdQl = S.cdQl || {};
    S.cdQl[a.id] = { chon: new Set(d.managers || []), me: d.me || null, nguoi };
    veCdQlApp(a, y);
  } catch (e) {
    if (!hop) return;
    hop.innerHTML = cdHang(a.ten,
      'Không đọc được: ' + esc(e.message || '') +
      '. App này có đang chạy không?', '');
  }
}

function veCdQlApp(a, y) {
  const hop = $('#cdQl-' + a.id);
  const t = S.cdQl[a.id];
  if (!hop || !t) return;
  const moDs = !!(y && y.moDs);

  const meId = t.me && t.me.id;
  const ds = t.nguoi.slice().sort((x, y) => String(x.name).localeCompare(String(y.name), 'vi'));
  const dangChon = ds.filter((n) => t.chon.has(n.id));

  hop.innerHTML = cdHang(a.ten,
    (dangChon.length
      ? '<b>' + dangChon.length + ' quản lý:</b> ' + esc(dangChon.map((n) => n.name).join(', '))
      : 'Chưa có ai — app sẽ không có người duyệt.'),
    '<button class="btn nho" data-ql-mo="' + esc(a.id) + '">Sửa</button>') +
    '<div class="cd-ql-ds" id="cdQlDs-' + esc(a.id) + '"' + (moDs ? '' : ' hidden') + '>' +
      ds.map((n) => {
        const laToi = n.id === meId;
        return '<label class="cd-ql-o' + (laToi ? ' la-toi' : '') + '">' +
          '<input type="checkbox" data-ql-tick="' + esc(a.id) + '" value="' + esc(n.id) + '"' +
          (t.chon.has(n.id) ? ' checked' : '') + (laToi ? ' disabled' : '') + '>' +
          '<span>' + esc(n.name) + (laToi ? ' <i>(bạn — không tự bỏ quyền được)</i>' : '') + '</span>' +
          '</label>';
      }).join('') +
      '<div class="cd-ql-luu">' +
        '<button class="btn nho chinh" data-ql-luu="' + esc(a.id) + '">Lưu</button>' +
        '<span class="cd-ql-tin" id="cdQlTin-' + esc(a.id) + '"></span>' +
      '</div>' +
    '</div>';

  hop.querySelector('[data-ql-mo]').onclick = () => {
    const o = $('#cdQlDs-' + a.id);
    o.hidden = !o.hidden;
  };
  hop.querySelectorAll('[data-ql-tick]').forEach((i) => {
    i.onchange = () => { if (i.checked) t.chon.add(i.value); else t.chon.delete(i.value); };
  });
  hop.querySelector('[data-ql-luu]').onclick = () => luuCdQl(a);
  if (y && y.tin) $('#cdQlTin-' + a.id).textContent = y.tin;
}

async function luuCdQl(a) {
  const t = S.cdQl[a.id];
  const tin = $('#cdQlTin-' + a.id);
  const ids = [...t.chon];
  /* Chặn ngay ở đây cho người dùng biết liền, chứ không đợi server trả 400:
   * app không còn quản lý nào là không ai duyệt được gì nữa. */
  if (!ids.length) { tin.textContent = 'Phải còn ít nhất một quản lý.'; return; }
  tin.textContent = 'Đang lưu…';
  try {
    await goi('/m/' + a.id + a.doc, {
      method: 'POST', body: JSON.stringify(a.than(ids)),
    });
    /* Giữ danh sách mở và mang câu báo sang bản vẽ mới — xem chú thích ở
     * napCdQl(). */
    await napCdQl(a, { moDs: true, tin: 'Đã lưu.' });
  } catch (e) {
    tin.textContent = e.message || 'Không lưu được.';
  }
}



/* ---------------- Nhận diện thương hiệu ----------------
 * Logo ở ĐÂY chứ không ở từng app con: mọi tệp báo cáo xuất ra đều gọi
 * GET /api/logo của lớp vỏ, nên đổi một lần là cả hệ đổi theo. Trước đây app
 * KPI giữ bản riêng — đổi logo là phải nhớ đi sửa từng app, và không cách nào
 * biết app nào đang đóng bản nào lên tệp gửi Sếp.
 */
function veCdThuongHieu(el) {
  el.innerHTML = cdTieuDe('Nhận diện thương hiệu',
    'Logo này được nhúng thẳng vào mọi tệp báo cáo các app xuất ra, nên tệp gửi đi đâu cũng thấy.') +
    '<div id="cdLogo" class="cd-hang"><div class="cd-hang-tx"><b>Đang đọc…</b></div></div>' +
    cdHang('Định dạng nhận vào',
      'PNG · JPG · SVG · WEBP, tối đa 2 MB. Nên dùng bản nền trong suốt (PNG hoặc SVG) ' +
      'vì báo cáo in ra nền trắng. Chỉ giữ MỘT tệp — tải bản mới là bản cũ bị thay.',
      '<span class="cd-nhan">≤ 2 MB</span>');
  napCdLogo();
}

function napCdLogo() {
  goi('/api/logo-tin').then((t) => {
    const o = $('#cdLogo');
    if (!o) return;
    const xem = t.co
      ? '<div class="cd-logo-xem"><img src="/api/logo?v=' + t.luc + '" alt="Logo"></div>'
      : '<div class="cd-logo-xem trong">chưa có logo</div>';
    const mo = t.co
      ? esc(t.ten) + ' · ' + t.kb + ' KB · tải lên ' + new Date(t.luc).toLocaleString('vi-VN')
      : 'Chưa có tệp nào. Báo cáo đang in tạm bằng chữ theo màu thương hiệu.';
    o.outerHTML = '<div id="cdLogo" class="cd-hang"><div class="cd-hang-tx">' +
      '<b>Logo hiện dùng</b><p>' + mo + '</p>' + xem + '</div>' +
      '<div class="cd-hang-dk"><div class="cd-doc">' +
      '<button class="btn nho chinh" id="cdLogoChon">' + (t.co ? 'Đổi ảnh' : 'Tải ảnh lên') + '</button>' +
      (t.co ? '<button class="btn nho ghost" id="cdLogoXoa">Gỡ</button>' : '') +
      '<input type="file" id="cdLogoTep" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden>' +
      '</div></div></div>';

    $('#cdLogoChon').onclick = () => $('#cdLogoTep').click();
    const xoa = $('#cdLogoXoa');
    if (xoa) {
      xoa.onclick = async () => {
        if (!confirm('Gỡ logo? Các tệp báo cáo xuất sau đó sẽ in tạm bằng chữ.')) return;
        try { await goi('/api/logo', { method: 'DELETE' }); napCdLogo(); }
        catch (e) { alert(e.message); }
      };
    }
    $('#cdLogoTep').onchange = (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = async () => {
        try {
          await goi('/api/logo', { method: 'POST', body: JSON.stringify({ anh: fr.result }) });
          napCdLogo();
        } catch (e) { alert(e.message); }
      };
      fr.readAsDataURL(f);
    };
  }).catch(() => {});
}

/* ---------------- Chung ---------------- */
/* ---------------- Của tôi ----------------
 * Chỉ những thứ đổi xong CHỈ MÌNH THẤY. Tách khỏi phần hệ thống vì trước đây
 * hai loại nằm lẫn một trang: ngôn ngữ (riêng máy) đứng cạnh địa chỉ công khai
 * (cả hệ), nên không ai biết đổi cái nào thì ai bị ảnh hưởng.
 */
function veCdToi(el) {
  const segNgonNgu = '<div class="seg seg-lang" data-no-i18n="1">' + NGON_NGU.map(([val, t]) =>
    '<button data-lang-set="' + val + '" class="' + (S.lang === val ? 'on' : '') + '">' + t + '</button>').join('') +
    '</div>';
  const segTheme = '<div class="seg seg-theme">' + THEME.map(([val, t]) =>
    '<button data-theme-set="' + val + '" class="' + (S.theme === val ? 'on' : '') + '" title="' + t + '">' +
    icon(val) + '</button>').join('') + '</div>';

  el.innerHTML = cdTieuDe('Của tôi',
    'Ba thứ dưới đây nhớ riêng trong máy bạn — đổi xong người khác không bị ảnh hưởng.') +
    cdHang('Ngôn ngữ', 'Áp cho lớp vỏ và cả các app con.', segNgonNgu) +
    cdHang('Sáng / tối', 'Theo hệ thống là ăn theo cài đặt của máy.', segTheme) +
    '<div id="cdToiTk" class="cd-hang"><div class="cd-hang-tx"><b>Đang đọc…</b></div></div>';

  goi('/api/toi').then((t) => {
    const o = $('#cdToiTk');
    if (!o) return;
    const khoa = t.email || t.id || '';
    o.outerHTML = cdHang('Tài khoản Lark',
      khoa ? '<code>' + esc(khoa) + '</code>' : 'Chưa đọc được tài khoản.',
      '<span class="cd-nhan ' + (t.la_quan_ly ? 'luc' : 'do') + '">' +
      (t.la_quan_ly ? 'Quản lý' : 'Nhân sự') + '</span>');
  }).catch(() => {});
}

/* ---------------- Hệ thống ----------------
 * Phần đọc-để-biết của cả hệ: một link ra internet, app Lark nào đang chạy,
 * bản nào đang chạy. Không sửa được ở đây — mấy thứ này đặt bằng biến môi
 * trường trên Render; nói ra để đối chiếu khi có sự cố.
 */
function veCdHeThong(el) {
  el.innerHTML = cdTieuDe('Hệ thống',
    'Thông tin phiên đang chạy. Đặt bằng biến môi trường, không sửa ở đây.') +
    cdHang('Địa chỉ công khai',
      'Chỉ lớp vỏ này ra internet. Các app con chạy trên cổng nội bộ trong cùng máy chủ, ' +
      'chỉ lớp vỏ gọi được — nên cả hệ chỉ có MỘT link và MỘT lần đăng nhập.',
      '<code>' + esc(location.origin) + '</code>') +
    '<div id="cdHtApp" class="cd-hang"><div class="cd-hang-tx"><b>Đang đọc…</b></div></div>' +
    '<div id="cdBanChay"></div>';

  goi('/api/toi').then((t) => {
    const o = $('#cdHtApp');
    if (!o) return;
    const nut = (val) => '<button class="btn nho" data-copy-id="' + esc(val) + '">Copy</button>';
    if (t.che_do !== 'api') {
      o.outerHTML = cdHang('Chế độ chạy',
        'Đang dùng phiên <code>lark-cli</code> của máy này. Không qua app Lark, nên phạm vi ' +
        'khả dụng (Availability) không ảnh hưởng gì ở đây.',
        '<span class="cd-nhan">cli · máy cá nhân</span>');
      return;
    }
    o.outerHTML = cdHang('App Lark đang chạy',
      (t.app_id
        ? '<code>' + esc(t.app_id) + '</code> — so với app anh phát hành bên Developer Console. ' +
          'Khác nhau thì mọi thay đổi Availability không có tác dụng.'
        : 'Chưa khai LARK_APP_ID.'),
      (t.app_id
        ? '<div class="cd-doc"><a class="btn nho ghost" target="_blank" rel="noreferrer" ' +
          'href="https://open.larksuite.com/app/' + esc(t.app_id) + '/version/create">Trang phát hành</a>' +
          nut(t.app_id) + '</div>'
        : ''));
  }).catch(() => {});

  goi('/healthz').then((h) => {
    const o = $('#cdBanChay');
    if (!o) return;
    o.innerHTML = cdHang('Bản đang chạy',
      'Số bản: <code>' + esc(h.build || '') + '</code>' +
      (h.commit ? ' · commit <code>' + esc(h.commit) + '</code>' : ''),
      '<span class="cd-nhan">' + esc(h.che_do || '') + '</span>');
  }).catch(() => {});
}

/* ---------------- Phân quyền (MỘT mục duy nhất) ----------------
 * Trước đây là HAI mục nghe giống nhau: "Nhân sự & phân quyền" quyết ai THẤY
 * base nào, "Quản lý từng app" quyết ai là QUẢN LÝ trong app. Muốn cho ai
 * quyền duyệt lịch thì phải đoán vào mục nào — lỗi thiết kế, không phải chuyện
 * nhãn.
 *
 * Giờ mọi câu hỏi "ai được làm gì" vào đúng một cửa. Hai tầng vẫn tách bạch
 * TRONG trang (hai khối, hai lời giải thích), chỉ bỏ chuyện phải đoán.
 */
function veCdQuyen(el) {
  el.innerHTML = cdTieuDe('Phân quyền',
    'Ai mở được app là do Lark quyết (Availability). Ai thấy base nào và ai duyệt được thì quyết ở đây.') +
    '<div class="cd-muc-nho">Thấy base nào · quyền từng người</div>' +
    '<div id="cdQuyenTom" class="cd-hang"><div class="cd-hang-tx"><b>Đang đọc bảng phân quyền…</b></div></div>' +
    cdHang('Mở màn quản lý',
      'Danh sách từng người: vị trí, vai, base được xem, và app có nhận ra họ chưa.',
      '<button class="btn primary" id="cdMoQuyen">Mở phân quyền</button>') +
    '<div class="cd-muc-nho">Ai là quản lý bên trong từng app</div>' +
    QL_APP.map((a) => '<div id="cdQl-' + esc(a.id) + '">' +
      cdHang(a.ten, 'đang đọc…', '') + '</div>').join('');

  $('#cdMoQuyen').onclick = () => modalPhanQuyen();
  QL_APP.forEach((a) => napCdQl(a));

  goi('/api/quyen').then((d) => {
    const o = $('#cdQuyenTom');
    if (!o) return;
    const hang = d.hang || [];
    const chuaKhop = hang.filter((h) => !h.khop).length;
    const daKhop = new Set(hang.filter((h) => h.khop).map((h) => h.khop.id));
    const chuaKhai = (d.danhBa || []).filter((x) => !daKhop.has(x.id)).length;
    o.outerHTML = cdHang('Tình trạng',
      hang.length + ' người đã khai quyền riêng · ' + chuaKhai + ' người chưa khai (đang ở mặc định: thấy đủ ' +
      (d.base || []).length + ' base)' +
      (chuaKhop ? '<br><b style="color:var(--do)">' + chuaKhop +
        ' dòng chưa khớp được với ai trong Lark — quyền đó chưa có tác dụng.</b>' : ''),
      '<span class="cd-nhan ' + (chuaKhop ? 'do' : 'luc') + '">' +
      (chuaKhop ? 'cần xử lý' : 'ổn') + '</span>');
  }).catch((e) => {
    const o = $('#cdQuyenTom');
    if (o) o.outerHTML = cdHang('Tình trạng', esc(e.message), '');
  });
}

/* ---------------- Trang của một app ----------------
 * "Phân phối công việc" trước đây là một mục CẤP CAO mà bên trong chỉ có một
 * cái nút — ngang hàng với Phân quyền, trong khi nó chỉ là thiết lập của một
 * app. Hạ xuống thành một dòng ở đây.
 *
 * Trang này là chỗ để kéo dần thiết lập còn nằm trong app ra: Mục tiêu của
 * Quảng cáo, Kết nối của Social, Cấu hình thông báo của Lịch.
 */
function veCdApp(el, a) {
  el.innerHTML = cdTieuDe(a.ten, 'Thiết lập riêng của app này.') +
    (a.cuaSo ? '<div id="cdCuaSo"><div class="cd-hang"><div class="cd-hang-tx">' +
      '<b>Đang đọc khung giờ đăng ký…</b></div></div></div>' : '') +
    (a.phanPhoi
      ? cdHang('Phân phối việc mới',
        'Việc mới không ai nhận sau một khoảng chờ thì hệ tự giao, theo loại việc và tỷ lệ ' +
        'của từng nhân sự. Bật/tắt từng loại, đặt mốc chờ, đặt tỷ lệ.',
        '<button class="btn nho chinh" id="cdMoPhanPhoi">Mở</button>')
      : '') +
    cdHang('Quản lý của app này',
      'Ai duyệt được bên trong app — sửa ở mục <b>Phân quyền</b>, để mọi câu hỏi ' +
      '"ai được làm gì" nằm chung một chỗ.',
      '<button class="btn nho" data-cd="quyen">Mở Phân quyền</button>');

  if (a.cuaSo) napCdCuaSo(a);
  const n = $('#cdMoPhanPhoi');
  if (n) {
    n.onclick = () => {
      dongModal();
      location.hash = '#/m/' + a.id + '?mo=phan-phoi';
    };
  }
}

/* ---------------- Thông báo tới nhân sự ----------------
 * Chỗ duy nhất trong cả hệ mà một người bấm một nút là màn hình người khác bị
 * chặn. Nên trang này phải trả lời được BA câu, và trả lời ngay trên màn hình
 * chứ không bắt đi tìm:
 *
 *   gửi cái gì · cho ai · ai đã đọc rồi
 *
 * Câu thứ ba là câu quan trọng nhất: gửi xong mà không biết ai chưa đọc thì
 * thông báo bắt buộc chẳng khác gì thông báo thường.
 */
let TBQL = null;      // dữ liệu đang hiện
let TBSUA = null;     // thông báo đang soạn / sửa

function veCdThongBao(el) {
  el.innerHTML = cdTieuDe('Thông báo tới nhân sự',
    'Popup che toàn bộ app, người nhận buộc bấm "Tôi đã đọc" mới dùng tiếp được.') +
    '<div id="tbqlNoi"><div class="cd-hang"><div class="cd-hang-tx"><b>Đang đọc…</b></div></div></div>';
  napCdTb();
}

async function napCdTb(refresh) {
  const o = $('#tbqlNoi');
  if (!o) return;
  try {
    TBQL = await goi('/api/tb-app/quan-ly' + (refresh ? '?refresh=1' : ''));
  } catch (e) {
    o.innerHTML = cdHang('Không đọc được', esc(e.message), '');
    return;
  }
  veCdTbDs();
}

function veCdTbDs() {
  const o = $('#tbqlNoi');
  if (!o) return;
  const d = TBQL || {};
  let h = '';

  /* Chưa khai bảng thì nói đúng việc phải làm, kèm danh sách cột. Không nói ra
   * thì màn hình này chỉ là một cái nút Gửi bấm vào ra lỗi. */
  if (!d.coBang) {
    h += '<div class="canh-bao do"><span class="grow">Chưa có bảng thông báo. ' +
      'Tạo một bảng trong Base Phân quyền với đúng các cột bên dưới, rồi khai ' +
      '<code>HUB_TB_TABLE</code> trên Render.</span></div>' +
      cdHang('Các cột cần tạo',
        '<code>Tiêu đề</code> (văn bản) · <code>Nội dung</code> (văn bản nhiều dòng) · ' +
        '<code>Mức độ</code> (lựa chọn: Tin / Quan trọng / Gấp) · ' +
        '<code>Nút hành động</code> (văn bản) · <code>Liên kết</code> (văn bản) · ' +
        '<code>Buộc bấm nút</code> (checkbox) · <code>Từ ngày</code>, <code>Đến ngày</code> (ngày) · ' +
        '<code>Người nhận</code> (văn bản) · <code>Bật</code> (checkbox) · ' +
        '<code>Đã đọc</code> (văn bản)', '');
    o.innerHTML = h;
    return;
  }

  if ((d.thieuCot || []).length) {
    h += '<div class="canh-bao do"><span class="grow">Bảng còn thiếu cột: <b>' +
      d.thieuCot.map(esc).join(', ') + '</b> — mấy ô đó sẽ bị bỏ khi lưu, ' +
      'nghĩa là thiết lập tương ứng KHÔNG có tác dụng.</span></div>';
  }
  if (d.loiBang) {
    h += '<div class="canh-bao do"><span class="grow">' + esc(d.loiBang) + '</span></div>';
  }

  /* Cảnh báo NẶNG, và nó đứng trên cả nút Soạn: đây là loại lỗi không có dấu
   * hiệu nào. Tick đúng tên, lưu thành công, rồi không ai nhận được gì — vì
   * open_id cấp theo từng app Lark, máy cá nhân và bản deploy ra hai chuỗi khác
   * nhau cho cùng một người. Đã đo được đúng thế trên Base thật. */
  if (d.cheDo && d.cheDo !== 'api') {
    h += '<div class="canh-bao do"><span class="grow">' +
      '<b>Đang mở ở máy cá nhân — đừng soạn thông báo ở đây.</b> Danh bạ máy này ' +
      'cho <code>open_id</code> khác với bản đã deploy, nên người nhận sẽ không ' +
      'khớp: tick đúng tên, lưu xong, mà không ai nhận được gì. ' +
      'Soạn trên <b>link đã deploy</b>. Xem thử và xem "ai đã xem" ở đây thì vẫn đúng.' +
      '</span></div>';
  }

  h += '<div class="cd-doc" style="margin-bottom:12px">' +
    '<button class="btn primary" id="tbSoan">Soạn thông báo</button>' +
    '<button class="btn nho" id="tbLai">Làm mới</button>' +
    (d.larkUrl ? '<a class="btn nho ghost" target="_blank" rel="noreferrer" href="' +
      esc(d.larkUrl) + '">Mở bảng trong Lark</a>' : '') +
    '</div>';

  const ds = d.ds || [];
  if (!ds.length) {
    h += '<div class="cd-hang"><div class="cd-hang-tx">Chưa có thông báo nào.</div></div>';
  } else {
    h += '<div class="bb-ds">' + ds.map(veCdTbDong).join('') + '</div>';
  }
  o.innerHTML = h;

  $('#tbSoan').onclick = () => moFormTb(null);
  $('#tbLai').onclick = () => napCdTb(true);
  /* Xem thử đóng hộp Cài đặt trước: lớp phủ nằm TRÊN hộp đó, không đóng thì
   * bấm "Đóng xem thử" xong lại thấy Cài đặt nằm dưới, rối. */
  $$('#tbqlNoi [data-tb-ai]').forEach((b) => {
    b.onclick = () => {
      const tb = (TBQL.ds || []).find((x) => x.recordId === b.dataset.tbAi);
      if (tb) moAiDaXem(tb);
    };
  });
  $$('#tbqlNoi [data-tb-thu]').forEach((b) => {
    b.onclick = () => {
      const tb = (TBQL.ds || []).find((x) => x.recordId === b.dataset.tbThu);
      if (!tb) return;
      dongModal();
      xemThuTb(tb);
    };
  });
  $$('#tbqlNoi [data-tb-sua]').forEach((b) => {
    b.onclick = () => moFormTb((TBQL.ds || []).find((x) => x.recordId === b.dataset.tbSua));
  });
  $$('#tbqlNoi [data-tb-xoa]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Xoá thông báo này?')) return;
      try {
        await goi('/api/tb-app/quan-ly?recordId=' + encodeURIComponent(b.dataset.tbXoa),
          { method: 'DELETE' });
        toast('Đã xoá', 'luc');
        napCdTb(true);
      } catch (e) { toast(e.message, 'do'); }
    };
  });
}

function veCdTbDong(tb) {
  const db = (TBQL && TBQL.danhBa) || [];
  /* Ai CHƯA đọc = người nhận trừ người đã đọc. Đây là con số quản lý cần, nên
   * tính ra sẵn thay vì bày hai danh sách rồi để anh tự trừ. */
  const nhan = tb.moiAi ? db.map((x) => x.id) : (tb.ai || []);
  const daDoc = new Set((tb.daDoc || []).map((x) => x.id));
  const chua = nhan.filter((id) => !daDoc.has(id));
  const tenCua = (id) => (db.find((x) => x.id === id) || {}).ten || id;

  const khoang = [tb.tuNgay ? 'từ ' + ngayTb(tb.tuNgay) : '',
    tb.denNgay ? 'đến ' + ngayTb(tb.denNgay) : ''].filter(Boolean).join(' ') || 'không giới hạn';

  return '<div class="bb-dong' + (tb.bat ? '' : ' tat') + '">' +
    '<div class="bb-dong-noi">' +
      '<div class="bb-dong-ten">' +
        '<span class="bb-nhan bb-' + esc(tb.mucDo === 'Gấp' ? 'gap' : tb.mucDo === 'Quan trọng' ? 'quan' : 'tin') +
          '">' + esc(tb.mucDo) + '</span> ' + esc(tb.tieuDe || '(không tiêu đề)') +
        (tb.bat ? '' : ' <span class="cd-nhan">đang tắt</span>') +
      '</div>' +
      '<div class="bb-dong-phu">' +
        esc(String(tb.noiDung || '').replace(/\s+/g, ' ').slice(0, 110)) +
        '<br>Gửi cho: <b>' + (tb.moiAi ? 'cả phòng' : (tb.ai || []).length + ' người') + '</b>' +
        ' · Hiển thị: ' + esc(khoang) +
        (tb.nhanNut ? ' · Nút "' + esc(tb.nhanNut) + '"' + (tb.buocBam ? ' (buộc bấm)' : '') : '') +
      '</div>' +
      /* Thanh tiến độ + một con số, rồi hết. Bản đầu bày tám cái tên "chưa đọc"
       * cắt ngang ở đây: vừa chật vừa không trả lời được gì — 8 tên trong 34
       * người thì nhìn xong vẫn phải đi tìm. Danh sách đầy đủ nằm sau nút. */
      '<div class="bb-doc-ds">' +
        '<span class="bb-tien-do" title="' + daDoc.size + '/' + nhan.length + ' đã đọc">' +
          '<i style="width:' + (nhan.length ? Math.round((daDoc.size / nhan.length) * 100) : 0) + '%"></i>' +
        '</span>' +
        '<span class="bb-ai ' + (chua.length ? 'chua' : 'roi') + '">' +
          daDoc.size + '/' + nhan.length + ' đã đọc' +
          (chua.length ? ' · còn ' + chua.length : ' · đủ') + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="bb-dong-nut">' +
      '<button class="btn nho" data-tb-ai="' + esc(tb.recordId) + '">Ai đã xem</button>' +
      '<button class="btn nho" data-tb-thu="' + esc(tb.recordId) + '">Xem thử</button>' +
      '<button class="btn nho" data-tb-sua="' + esc(tb.recordId) + '">Sửa</button>' +
      '<button class="btn nho ghost" data-tb-xoa="' + esc(tb.recordId) + '">Xoá</button>' +
    '</div>' +
    '</div>';
}

/* `ngayTb` khai ở tbapp.js — hai tệp cùng một phạm vi toàn cục, khai hai lần
 * là SyntaxError và tệp nạp sau chết hẳn (đã gặp: lớp phủ không chạy, chỉ có
 * một dòng lỗi trong console). Dùng lại bản ở đó. */
/* Ô <input type="date"> cần YYYY-MM-DD theo giờ VN, không phải theo giờ máy. */
const ngayO = (ms) => (ms ? new Date(Number(ms) + 7 * 3600000).toISOString().slice(0, 10) : '');
const msTuO = (v) => (v ? Date.parse(v + 'T00:00:00+07:00') || 0 : 0);

/**
 * Hai danh sách: ai đã xem (kèm giờ), ai chưa.
 *
 * Đây mới là câu trả lời quản lý cần — con số chỉ nói có bao nhiêu, còn việc
 * phải làm là đi nhắc ĐÚNG NGƯỜI. Xếp chưa-đọc lên trước vì đó là phần còn
 * việc; đã-đọc để dưới, theo thứ tự đọc sớm trước.
 */
function moAiDaXem(tb) {
  const db = (TBQL && TBQL.danhBa) || [];
  const tenCua = (id) => (db.find((x) => x.ten && x.id === id) || {}).ten || id;
  const nhan = tb.moiAi ? db.map((x) => x.id) : (tb.ai || []);
  const daDoc = (tb.daDoc || []).slice()
    .sort((a, b) => String(a.luc).localeCompare(String(b.luc)));
  const idDaDoc = new Set(daDoc.map((x) => x.id));
  const chua = nhan.filter((id) => !idDaDoc.has(id))
    .sort((a, b) => tenCua(a).localeCompare(tenCua(b), 'vi'));

  /* Giờ đọc theo giờ VN, dạng ngắn. "23:14 hôm qua" và "8:02 sáng nay" là hai
   * câu chuyện khác nhau khi có việc, nên phải hiện giờ chứ không chỉ ngày. */
  const gio = (iso) => {
    const t = Date.parse(iso || '');
    if (!t) return 'không rõ lúc nào';
    const d = new Date(t + 7 * 3600000);
    const p2 = (n) => String(n).padStart(2, '0');
    return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + ' ' +
      p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
  };

  const khoi = (ten, ds, lop) =>
    '<div class="bb-cot">' +
      '<div class="bb-cot-dau"><b>' + ten + '</b><span class="bb-ai ' + lop + '">' +
        ds.length + '</span></div>' +
      (ds.length
        ? '<div class="bb-cot-ds">' + ds.join('') + '</div>'
        : '<div class="q-ghi-nho">— không có ai —</div>') +
    '</div>';

  moModal('Ai đã xem · ' + (tb.tieuDe || '(không tiêu đề)'),
    '<div class="bb-ai-noi">' +
      '<div class="q-ghi-nho">Gửi cho <b>' +
        (tb.moiAi ? 'cả phòng — tính theo danh bạ ' + db.length + ' người' : nhan.length + ' người') +
        '</b>. ' +
        (tb.moiAi ? 'Người mới vào sau cũng nhận, nên con số có thể nhích lên.' : '') +
      '</div>' +
      '<div class="bb-hai-cot">' +
        khoi('Chưa xem', chua.map((id) =>
          '<div class="bb-ai-dong"><span>' + esc(tenCua(id)) + '</span></div>'), 'chua') +
        khoi('Đã xem', daDoc.map((x) => {
          /* Không tra được tên nghĩa là open_id đó KHÔNG thuộc vùng của bản
           * đang chạy — dấu hiệu duy nhất của chuyện lệch vùng, nên nói ra chứ
           * đừng để một chuỗi ou_... trần không ai đọc được. */
          const ten = x.ten && x.ten !== x.id ? x.ten : '';
          return '<div class="bb-ai-dong">' +
            (ten ? '<span>' + esc(ten) + '</span>'
                 : '<span><code>' + esc(String(x.id).slice(0, 14)) + '…</code> ' +
                   '<em class="bb-la">không có trong danh bạ bản này</em></span>') +
            '<span class="bb-luc">' + esc(gio(x.luc)) + '</span></div>';
        }), 'roi') +
      '</div>' +
    '</div>',
    '<button class="btn ghost" id="tbAiQuay">← Danh sách</button><span class="grow"></span>' +
    '<button class="btn ghost" data-close="1">Đóng</button>', true);

  $('#tbAiQuay').onclick = () => { modalCaiDat('thong-bao'); };
}

function moFormTb(tb) {
  const d = TBQL || {};
  TBSUA = tb || { mucDo: 'Tin', moiAi: true, ai: [], bat: true };
  const t = TBSUA;
  const db = d.danhBa || [];
  const hang = (nhan, noi, ghi) =>
    '<div class="q-hang"><label>' + nhan + '</label><div class="q-o">' + noi +
    (ghi ? '<div class="q-ghi-nho">' + ghi + '</div>' : '') + '</div></div>';

  let html = '<div class="q-form">';
  html += hang('Mức độ',
    '<select class="q-in" id="tbMucDo">' + (d.mucDo || ['Tin']).map((x) =>
      '<option value="' + esc(x) + '"' + (t.mucDo === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') +
    '</select>', 'Chỉ đổi màu và thứ tự hiện — không đổi mức chặn. Cái nào cũng chặn màn hình.');
  html += hang('Tiêu đề',
    '<input class="q-in" id="tbTieuDe" type="text" value="' + esc(t.tieuDe || '') +
    '" placeholder="Câu người ta đọc đầu tiên">');
  html += hang('Nội dung',
    '<textarea class="q-in" id="tbNoiDung" rows="5" placeholder="Xuống dòng được — mỗi dòng một đoạn">' +
    esc(t.noiDung || '') + '</textarea>');

  html += hang('Nút hành động',
    '<input class="q-in" id="tbNhanNut" type="text" value="' + esc(t.nhanNut || '') +
      '" placeholder="Nhãn nút, ví dụ: Đọc quy định mới">' +
    '<input class="q-in" id="tbLienKet" type="text" value="' + esc(t.lienKet || '') +
      '" placeholder="https://... hoặc #/m/cong-viec (một base trong hub)" style="margin-top:6px">' +
    '<label class="q-ck" style="margin-top:6px"><input type="checkbox" id="tbBuocBam"' +
      (t.buocBam ? ' checked' : '') + '>' +
      '<span>Buộc bấm nút này trước khi xác nhận</span></label>',
    'Bỏ trống cả hai ô là thông báo <b>chỉ cần đọc</b>. Điền vào là có thêm chỗ để ấn. ' +
    'Link bắt đầu bằng <code>#</code> thì mở trong hub sau khi xác nhận; còn lại mở tab mới.');

  html += hang('Khoảng hiển thị',
    '<div class="cd-doc"><input class="q-in" id="tbTu" type="date" value="' + esc(ngayO(t.tuNgay)) + '">' +
    '<input class="q-in" id="tbDen" type="date" value="' + esc(ngayO(t.denNgay)) + '"></div>',
    'Bỏ trống là hiện ngay và hiện mãi tới khi tắt. "Đến ngày" tính <b>hết</b> ngày đó.');

  html += hang('Gửi cho',
    ((TBQL && TBQL.cheDo && TBQL.cheDo !== 'api')
      ? '<div class="q-ghi-nho" style="color:var(--do)">Máy cá nhân: danh sách dưới đây ' +
        'cho open_id KHÁC bản deploy — chọn ở đây thì người nhận không khớp.</div>'
      : '') +
    '<label class="q-ck q-ck-manh"><input type="checkbox" id="tbMoiAi"' + (t.moiAi ? ' checked' : '') + '>' +
      '<span>Cả phòng</span><small class="q-nhat">— kể cả người vào sau này</small></label>' +
    '<input class="q-in q-loc" id="tbLoc" type="text" placeholder="Lọc theo tên…">' +
    '<div class="q-nhom q-nhom-cuon" id="tbAi">' + db.map((x) =>
      '<label class="q-ck" data-ten="' + esc(String(x.ten).toLowerCase()) + '">' +
      '<input type="checkbox" data-ai="' + esc(x.id) + '"' +
        ((t.ai || []).includes(x.id) ? ' checked' : '') + '>' +
      '<span>' + esc(x.ten) + '</span></label>').join('') + '</div>');

  html += hang('Bật',
    '<label class="q-ck q-ck-manh"><input type="checkbox" id="tbBat"' +
      (t.bat !== false ? ' checked' : '') + '>' +
      '<span>Đang gửi</span><small class="q-nhat">— bỏ tick là giữ lại nhưng không hiện nữa</small></label>');
  html += '</div>';

  moModal(tb ? 'Sửa thông báo' : 'Soạn thông báo', html,
    '<button class="btn ghost" id="tbQuay">← Danh sách</button><span class="grow"></span>' +
    '<button class="btn" id="tbThu">Xem thử</button>' +
    '<button class="btn primary" id="tbLuu">Lưu</button>' +
    '<button class="btn ghost" data-close="1">Đóng</button>');

  const ckMoi = $('#tbMoiAi');
  const dongBo = () => { $('#tbAi').classList.toggle('q-mo-het', ckMoi.checked); };
  ckMoi.onchange = dongBo;
  dongBo();
  const oLoc = $('#tbLoc');
  oLoc.oninput = () => {
    const q = oLoc.value.trim().toLowerCase();
    // đã tick thì luôn hiện, không thì lọc xong tưởng mình bỏ tick mất
    $$('#tbAi .q-ck').forEach((l) => {
      l.hidden = !!q && !l.dataset.ten.includes(q) && !l.querySelector('input').checked;
    });
  };
  $('#tbQuay').onclick = () => { modalCaiDat('thong-bao'); };
  $('#tbLuu').onclick = luuFormTb;
  /* Xem thử ngay từ form, đọc nội dung ĐANG GÕ chứ không phải bản đã lưu — xem
   * trước mà phải lưu rồi mới xem được thì chẳng còn là xem trước. */
  $('#tbThu').onclick = () => {
    dongModal();
    xemThuTb({
      recordId: '(xem-thu)',
      mucDo: $('#tbMucDo').value,
      tieuDe: $('#tbTieuDe').value.trim(),
      noiDung: $('#tbNoiDung').value,
      nhanNut: $('#tbNhanNut').value.trim(),
      lienKet: $('#tbLienKet').value.trim(),
      buocBam: !!$('#tbBuocBam').checked,
      denNgay: msTuO($('#tbDen').value),
    });
  };
}

async function luuFormTb() {
  const than = {
    recordId: (TBSUA && TBSUA.recordId) || '',
    mucDo: $('#tbMucDo').value,
    tieuDe: $('#tbTieuDe').value.trim(),
    noiDung: $('#tbNoiDung').value,
    nhanNut: $('#tbNhanNut').value.trim(),
    lienKet: $('#tbLienKet').value.trim(),
    buocBam: !!$('#tbBuocBam').checked,
    tuNgay: msTuO($('#tbTu').value),
    denNgay: msTuO($('#tbDen').value),
    moiAi: !!$('#tbMoiAi').checked,
    ai: $$('#tbAi [data-ai]').filter((x) => x.checked).map((x) => x.dataset.ai),
    bat: !!$('#tbBat').checked,
  };
  /* Buộc bấm mà không có nút thì người nhận bị khoá vĩnh viễn: nút "Tôi đã đọc"
   * chờ một cái nút không tồn tại. Chặn ở đây, đây là loại lỗi tự gây ra cho
   * chính nhân sự của mình. */
  if (than.buocBam && !(than.nhanNut && than.lienKet)) {
    return toast('Bật "buộc bấm" thì phải có cả nhãn nút và liên kết — không thì người nhận không đóng được popup.', 'do');
  }
  const nut = $('#tbLuu');
  nut.disabled = true;
  nut.textContent = 'Đang lưu…';
  try {
    await goi('/api/tb-app/quan-ly', { method: 'POST', body: JSON.stringify(than) });
    toast('Đã lưu thông báo', 'luc');
    modalCaiDat('thong-bao');
  } catch (e) {
    nut.disabled = false;
    nut.textContent = 'Lưu';
    toast(e.message, 'do');
  }
}

/* ---------------- Khung giờ đăng ký (app Lịch) ----------------
 * Hub không giữ luật, chỉ gọi API của app con. Ở đây chỉ cần trả lời hai câu:
 * bây giờ mở hay đóng, và mở khoá / đóng một giờ.
 */
async function napCdCuaSo(a) {
  const o = $('#cdCuaSo');
  if (!o) return;
  let d;
  try {
    d = await goi('/api/lich-cua-so');
  } catch (e) {
    o.innerHTML = cdHang('Khung giờ đăng ký', 'Không đọc được: ' + esc(e.message), '');
    return;
  }
  const L = d.luatTho || {};
  const thu = d.thu || [];
  const tay = L.dongTayToi && L.dongTayToi > Date.now() ? 'dong'
    : L.moTayToi && L.moTayToi > Date.now() ? 'mo' : '';
  const oThu = (id, val) => '<select class="cd-in cd-in-nho" id="' + id + '">' +
    thu.map((t, i) => '<option value="' + (i + 1) + '"' +
      (Number(val) === i + 1 ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>';

  /* MỘT nhóm, ba hàng, theo đúng thứ tự người ta hỏi:
   *   bây giờ sao · cần mở/đóng ngay không · luật hằng tuần là gì
   * Bản trước đẩy việc sửa luật sang app Lịch — hai màn hình cho một việc,
   * đúng cái anh Hùng gọi là loạn. */
  o.innerHTML =
    cdHang('Đang ' + (d.mo ? 'MỞ' : 'ĐÓNG'),
      esc(d.vi || '') +
      (d.moLuc ? ' Mở lại <b>' + esc(cdMocCuaSo(d.moLuc)) + '</b>.' : '') +
      (d.dongLuc ? ' Đóng lúc <b>' + esc(cdMocCuaSo(d.dongLuc)) + '</b>.' : ''),
      '<span class="cd-nhan ' + (d.mo ? 'luc' : 'do') + '">' + (d.mo ? 'mở' : 'đóng') + '</span>') +

    cdHang('Mở / đóng ngay',
      'Bấm là áp ngay, hết một giờ tự trở về khung giờ hằng tuần.' +
      (tay ? '<br>Đang <b>' + (tay === 'mo' ? 'mở tay' : 'đóng tay') + '</b> tới <b>' +
        esc(cdMocCuaSo(tay === 'mo' ? L.moTayToi : L.dongTayToi)) + '</b>.' : ''),
      '<div class="cd-doc">' +
        '<button class="btn nho chinh" data-cs-viec="mo">Mở khoá 1 giờ</button>' +
        '<button class="btn nho" data-cs-viec="dong">Đóng 1 giờ</button>' +
        (tay ? '<button class="btn nho ghost" data-cs-viec="bo">Bỏ</button>' : '') +
      '</div>') +

    cdHang('Khung giờ hằng tuần',
      '<label class="q-ck q-ck-manh" style="margin:2px 0 8px">' +
        '<input type="checkbox" id="cdCsBat"' + (L.bat === false ? '' : ' checked') + '>' +
        '<span>Áp khung giờ</span><small class="q-nhat">— bỏ tick là nút đăng ký mở liên tục</small>' +
      '</label>' +
      '<div class="cd-doc" style="margin-bottom:4px">' +
        /* data-no-i18n: "Đóng" là một khoá trong từ điển (nút Đóng của hộp thoại)
         * nên lớp dịch đổi cái nhãn này thành "Close" — đã thấy trên màn hình.
         * Đây là nhãn của một ô nhập, không phải nút, nên chặn dịch. */
        '<span class="cd-nhan" data-no-i18n="1">Mở</span>' + oThu('cdCsMoThu', L.moThu) +
        '<input class="cd-in cd-in-nho" id="cdCsMoGio" value="' + esc(L.moGio || '15:00') + '" placeholder="15:00">' +
        '<span class="cd-nhan" data-no-i18n="1">Đóng</span>' + oThu('cdCsDongThu', L.dongThu) +
        '<input class="cd-in cd-in-nho" id="cdCsDongGio" value="' + esc(L.dongGio || '12:00') + '" placeholder="12:00">' +
      '</div>' +
      'Đặt mốc đóng <b>trước</b> mốc mở cũng được — ví dụ mở Thứ 7 15:00, đóng Thứ 2 12:00 ' +
      'thì cửa sổ vắt qua cuối tuần.',
      '<button class="btn nho chinh" id="cdCsLuu">Lưu khung giờ</button>');

  $$('#cdCuaSo [data-cs-viec]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        await goi('/api/lich-cua-so', { method: 'POST', body: JSON.stringify({ viec: b.dataset.csViec }) });
        toast(b.dataset.csViec === 'mo' ? 'Đã mở khoá đăng ký 1 giờ'
          : b.dataset.csViec === 'dong' ? 'Đã đóng đăng ký 1 giờ' : 'Đã về theo khung giờ', 'luc');
        napCdCuaSo(a);
      } catch (e) {
        b.disabled = false;
        toast(e.message, 'do');
      }
    };
  });

  $('#cdCsLuu').onclick = async () => {
    const nut = $('#cdCsLuu');
    nut.disabled = true;
    nut.textContent = 'Đang lưu…';
    try {
      /* Chỉ gửi phần KHUNG GIỜ. Gửi kèm hai ô ngoại lệ thì bấm Lưu để đổi giờ
       * sẽ vô tình xoá ngoại lệ vừa đặt, mà không có gì báo. */
      await goi('/api/lich-cua-so', { method: 'POST', body: JSON.stringify({ luat: {
        bat: !!$('#cdCsBat').checked,
        moThu: Number($('#cdCsMoThu').value),
        moGio: $('#cdCsMoGio').value,
        dongThu: Number($('#cdCsDongThu').value),
        dongGio: $('#cdCsDongGio').value,
      } }) });
      toast('Đã lưu khung giờ đăng ký', 'luc');
      napCdCuaSo(a);
    } catch (e) {
      nut.disabled = false;
      nut.textContent = 'Lưu khung giờ';
      toast(e.message, 'do');
    }
  };
}

/** "Thứ 6 17:00 ngày 11/09" theo giờ VN — hub chạy ở đâu cũng ra đúng. */
function cdMocCuaSo(ms) {
  if (!ms) return '';
  const d = new Date(Number(ms) + 7 * 3600000);
  const p2 = (n) => String(n).padStart(2, '0');
  const ten = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.getUTCDay()];
  return ten + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) +
    ' ngày ' + p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1);
}

/* ---------------- Base trong panel ---------------- */
function veCdBase(el) {
  const dong = (m) => {
    const tt = m.tinhTrang || {};
    const nhan = NHAN_TT[tt.trangThai] || ['', ''];
    return '<div class="cd-base">' +
      '<span class="cd-ic" style="' + (m.mau ? 'background:' + esc(m.mau) + '22;color:' + esc(m.mau) : '') + '">' +
        icon(m.icon) + '</span>' +
      '<div class="cd-base-tx"><b>' + esc(m.ten) + '</b>' +
        '<p>' + (m.kieu === 'local'
          ? 'hub tự bật · cổng nội bộ ' + m.cong + ' (không ra internet)'
          : m.kieu === 'ngoai' ? 'app có URL riêng' : 'mở thẳng Lark Base') +
        (tt.loi ? ' · <span style="color:var(--do)">' + esc(tt.loi.slice(0, 80)) + '</span>' : '') + '</p></div>' +
      '<span class="chip ' + nhan[1] + '">' + esc(nhan[0]) + '</span>' +
      /* Ai thấy base này — dòng nào cũng phải trả lời được câu đó ngay, không
       * phải mở màn Phân quyền mới biết. Bấm vào là đổi. */
      '<span class="chip ' + (m.caPhong ? 'vang' : '') + '" title="' + (m.caPhong
        ? (m.caPhongTuEnv
          ? 'Cả phòng thấy base này — mở bằng biến HUB_CA_PHONG, không phải bằng nút ở đây'
          : 'Cả phòng thấy base này')
        : 'Chỉ quản lý và người được cấp tên') + '">' +
        (m.caPhong ? 'Cả phòng' : 'Kín') + (m.caPhongTuEnv ? ' · env' : '') + '</span>' +
      '<div class="thao-tac">' +
        /* Mở bằng biến môi trường thì nút này bấm cũng vô ích: nó chỉ sửa
         * modules.json, còn biến vẫn mở base ra. Khoá nút và nói rõ phải sửa ở đâu,
         * đừng để người dùng bấm rồi tưởng app không nghe. */
        (m.caPhongTuEnv
          ? '<button class="btn nho ghost" disabled title="Base này mở bằng biến'
            + ' HUB_CA_PHONG. Muốn đóng thì bỏ id khỏi biến đó (trên Render:'
            + ' Environment → HUB_CA_PHONG) rồi deploy lại.">Mở bằng env</button>'
          : '<button class="btn nho ghost" data-caphong="' + esc(m.id) + '"'
            + ' data-moi="' + (m.caPhong ? '0' : '1') + '">'
            + (m.caPhong ? 'Đóng lại' : 'Mở cả phòng') + '</button>') +
        (m.kieu === 'local'
          ? '<button class="btn nho" data-batlai="' + esc(m.id) + '">Bật lại</button>' +
            '<button class="btn nho ghost" data-tat="' + esc(m.id) + '">Tắt</button>' +
            '<button class="btn nho ghost" data-cdlog="' + esc(m.id) + '">Log</button>'
          : '') +
        '<button class="btn nho ghost" data-an="' + esc(m.id) + '">' + (m.bat ? 'Ẩn' : 'Hiện lại') + '</button>' +
        '<button class="btn nho do" data-xoa="' + esc(m.id) + '">Xoá</button>' +
      '</div></div>';
  };

  el.innerHTML = cdTieuDe('Base trong panel',
    'Mỗi base là một app riêng. Tắt hay ẩn ở đây không ảnh hưởng dữ liệu trong Lark. ' +
    'Base "Kín" chỉ quản lý và người được cấp tên trong Phân quyền mới thấy — base mới ' +
    'luôn bắt đầu ở Kín.') +
    '<div class="cd-ds-base">' + S.modules.map(dong).join('') + '</div>' +
    '<div class="cd-hang"><div class="cd-hang-tx"><b>Thêm base</b>' +
      '<p>Khai thêm một app hoặc một Lark Base vào panel.</p></div>' +
      '<div class="cd-hang-dk"><button class="btn primary" id="cdThem">Thêm base</button></div></div>';
  $('#cdThem').onclick = modalThem;
}

/* ---------------- Người dùng & phân quyền ---------------- */
/* ---------------- Kiểm tra hệ thống ---------------- */
async function veCdKiemTra(el) {
  el.innerHTML = cdTieuDe('Kiểm tra hệ thống', 'Hỏi thẳng từng base xem đang đọc được gì.') +
    '<div class="trong"><span class="spin"></span> Đang hỏi từng base…</div>';
  let d;
  try { d = await goi('/api/kiem-tra'); } catch (e) {
    el.innerHTML = cdTieuDe('Kiểm tra hệ thống', '') +
      '<div class="canh-bao do"><span class="grow">' + esc(e.message) + '</span></div>';
    return;
  }
  const h = d.hub;
  const hang = (ten, gt, tot) => cdHang(ten, '', '<span class="cd-nhan ' +
    (tot === false ? 'do' : tot === true ? 'luc' : '') + '">' + esc(gt) + '</span>');

  let html = cdTieuDe('Kiểm tra hệ thống', 'Hỏi thẳng từng base xem đang đọc được gì.') +
    hang('Chế độ', h.che_do === 'api' ? 'api · server chung' : 'cli · máy cá nhân') +
    hang('App Lark đang chạy', h.app_id || '(không dùng app)', h.che_do !== 'api' ? null : !!h.app_id) +
    (h.commit ? hang('Bản đang chạy', h.commit) : '') +
    (h.che_do === 'api'
      ? hang('Vai quản lý', h.la_quan_ly ? 'có' : 'KHÔNG', h.la_quan_ly) +
        hang('PUBLIC_URL', (h.public_url || '(trống)') + (h.public_url_khop ? '' : ' ≠ ' + h.host_that),
          h.public_url_khop) +
        hang('Khoá phiên (SESSION_SECRET)', h.co_session_secret ? 'có' : 'THIẾU', h.co_session_secret)
      : '');

  html += '<div class="cd-luoi-base">' + (d.modules || []).map((m) => {
    const loi = m.loi || '';
    const ma = /9999167/.test(loi) ? 'Thiếu quyền (scope) hoặc chưa Publish version'
      : /91403/.test(loi) ? 'App chưa được chia sẻ Base này'
      : /Cannot find module|lark-cli/.test(loi) ? 'Đang gọi lark-cli — sai chế độ chạy'
      : '';
    return '<div class="the ' + (loi ? 'cao' : 'ok') + '">' +
      '<div class="nhan">' + esc(m.ten) + '</div>' +
      (loi
        ? '<div class="ghi" style="color:var(--do)"><b>' + esc(ma || 'Lỗi') + '</b><br>' + esc(loi.slice(0, 160)) + '</div>'
        : '<div class="so">' + (m.tong == null ? '—' : so(m.tong)) + '</div>' +
          '<div class="ghi">bản ghi đọc được' + (m.vai ? ' · vai ' + esc(m.vai) : '') + '</div>') +
      '</div>';
  }).join('') + '</div>';

  html += '<div class="cd-hang"><div class="cd-hang-tx"><b>Chạy lại</b>' +
    '<p>Đọc lại từ đầu, không dùng số đã nhớ.</p></div>' +
    '<div class="cd-hang-dk"><button class="btn ghost" id="cdKtLai">Chạy lại</button></div></div>';

  el.innerHTML = html;
  $('#cdKtLai').onclick = () => veCdKiemTra(el);
}

/* ---------------- Log app con ---------------- */
async function veCdLog(el, id) {
  const ds = S.modules.filter((m) => m.kieu === 'local');
  const chon = id || S.cdLog || (ds[0] && ds[0].id);
  S.cdLog = chon;

  el.innerHTML = cdTieuDe('Log app con', 'Dòng lệnh thật của app con — chỗ đầu tiên cần xem khi một base báo lỗi.') +
    '<div class="cd-hang"><div class="cd-hang-tx"><b>Chọn base</b></div>' +
      '<div class="cd-hang-dk"><select class="q-in" id="cdLogChon">' +
      ds.map((m) => '<option value="' + esc(m.id) + '"' + (m.id === chon ? ' selected' : '') + '>' +
        esc(m.ten) + '</option>').join('') + '</select>' +
      '<button class="btn ghost nho" id="cdLogTai">Tải lại</button>' +
      '<button class="btn nho" data-batlai="' + esc(chon || '') + '">Bật lại base</button></div></div>' +
    '<div class="log" id="cdLogHop">Đang đọc…</div>';

  $('#cdLogChon').onchange = () => veCdLog(el, $('#cdLogChon').value);
  $('#cdLogTai').onclick = () => veCdLog(el, chon);

  try {
    const d = await goi('/api/modules/' + encodeURIComponent(chon) + '/log?n=200');
    const hop = $('#cdLogHop');
    if (!hop) return;
    hop.innerHTML = (d.logs || []).map((l) =>
      '<span class="t">' + esc(l.t) + '</span> <span class="' + esc(l.loai) + '">' + esc(l.d) + '</span>').join('\n')
      || 'Chưa có log.';
    hop.scrollTop = hop.scrollHeight;
  } catch (e) {
    const hop = $('#cdLogHop');
    if (hop) hop.textContent = e.message;
  }
}

/* ---------------- điều hướng trong Cài đặt ---------------- */
document.addEventListener('click', (e) => {
  const m = e.target.closest('[data-cd]');
  if (m) {
    e.preventDefault();
    S.cdMuc = m.getAttribute('data-cd');
    veCdNav();
    veCdNoi();
    return;
  }
  const lg = e.target.closest('[data-cdlog]');
  if (lg) {
    e.preventDefault();
    S.cdMuc = 'log';
    S.cdLog = lg.getAttribute('data-cdlog');
    veCdNav();
    veCdNoi();
  }
});
