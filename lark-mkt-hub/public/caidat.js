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
    ] },
    { nhom: 'Từng app', ds: APP_CD.map((a) => ({
      k: 'app:' + a.id, ten: a.ten, ic: a.ic, mo: a.mo, tu: a.tu, ql: true,
    })) },
    { nhom: 'Nâng cao', ds: [
      { k: 'kiem-tra', ten: 'Kiểm tra hệ thống', ic: 'may',
        mo: 'Hỏi từng base xem đọc được gì · địa chỉ công khai, app Lark, bản đang chạy',
        tu: 'url link app id build commit chế độ chạy render hệ thống', ql: true },
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

/* Chỉ còn cái tên.
 *
 * Anh Hùng: "các cái note nhỏ nhỏ trong cài đặt anh thấy không cần nữa". Mỗi
 * mục trước đây có một câu giải thích dưới tiêu đề; đọc lần đầu thì hiểu ra,
 * đọc lần thứ hai mươi thì chỉ là chữ chắn đường tới cái nút.
 *
 * Bỏ chữ GIẢI THÍCH, KHÔNG bỏ chữ báo tình trạng: cảnh báo đỏ/vàng, câu lỗi,
 * dòng trạng thái của từng base đều giữ nguyên — chúng chỉ hiện khi có chuyện,
 * và lúc có chuyện mà không có chúng thì mù. */
const cdTieuDe = (ten) => '<div class="cd-dau"><h3>' + esc(ten) + '</h3></div>';

/** Một hàng cài đặt: chữ bên trái, thứ điều khiển bên phải. */
const cdHang = (ten, mo, dieuKhien) =>
  '<div class="cd-hang"><div class="cd-hang-tx"><b>' + esc(ten) + '</b>' +
  (mo ? '<p>' + mo + '</p>' : '') + '</div>' +
  '<div class="cd-hang-dk">' + (dieuKhien || '') + '</div></div>';

/** Một hàng cài đặt ĐANG CHỜ dữ liệu: khung xương thay cho chữ "Đang đọc…".
 *
 * Màn Cài đặt mở ra là bắn năm sáu lượt hỏi Base cùng lúc (logo, video, tài
 * khoản, phân quyền, thông báo…), nên trước đây nó hiện ra thành một cột chữ
 * "Đang đọc…" xếp dọc — đọc như trang hỏng chứ không như trang đang tải. */
const cdCho = (rong) => '<div class="cd-hang"><div class="cd-hang-tx">' +
  (window.KX ? KX.chu(rong || '180px') : '<b>Đang đọc…</b>') + '</div></div>';

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
  if (S.cdMuc === 'quyen') return veCdQuyen(el);
  if (S.cdMuc === 'thong-bao') return veCdThongBao(el);
  if (S.cdMuc === 'base') return veCdBase(el);
  if (S.cdMuc === 'thuong-hieu') return veCdThuongHieu(el);
  if (S.cdMuc === 'kiem-tra') return veCdKiemTra(el);
  if (S.cdMuc === 'log') return veCdLog(el);
}


/* ---------------- Nhận diện thương hiệu ----------------
 * Logo ở ĐÂY chứ không ở từng app con: mọi tệp báo cáo xuất ra đều gọi
 * GET /api/logo của lớp vỏ, nên đổi một lần là cả hệ đổi theo. Trước đây app
 * KPI giữ bản riêng — đổi logo là phải nhớ đi sửa từng app, và không cách nào
 * biết app nào đang đóng bản nào lên tệp gửi Sếp.
 */
function veCdThuongHieu(el) {
  el.innerHTML = cdTieuDe('Nhận diện thương hiệu') +
    '<div id="cdLogo">' + cdCho('150px') + '</div>' +
    cdHang('Định dạng nhận vào','',
      '<span class="cd-nhan">≤ 2 MB</span>') +
    /* Video giới thiệu — phát ở trang Tổng quan, cột trái.
     *
     * Anh Hùng: "anh có một video thế này, em có thể cho anh tuỳ chỉnh ở ô Nhận
     * diện thương hiệu". Đặt ở đây chứ không đẻ ra một mục mới: nó cùng một
     * loại việc với logo — bộ mặt của hub, quản lý đặt một lần cho cả phòng. */
    '<div class="cd-muc-nho">Video giới thiệu</div>' +
    '<div id="cdPhim">' + cdCho('200px') + '</div>';
  napCdLogo();
  napCdPhim();
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
      : 'Chưa có tệp nào.';
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

  /* Người trước, máy sau.
   *
   * Anh Hùng: "ở trang của tôi, anh muốn nó thể hiện một số thông tin của cá
   * nhân; xong thì là một số thiết lập chung của hệ thống như ngôn ngữ, giao
   * diện". Bản trước mở ra là hai cái nút chọn ngôn ngữ / sáng tối, còn "mình
   * đang đăng nhập bằng ai" thì nằm cuối và đang tải dở. */
  el.innerHTML = cdTieuDe('Của tôi') +
    '<div class="cd-muc-nho">Tài khoản</div>' +
    '<div id="cdToiTk">' + cdCho('220px') + '</div>' +
    '<div class="cd-muc-nho">Thiết lập chung</div>' +
    cdHang('Ngôn ngữ','', segNgonNgu) +
    cdHang('Sáng / tối','', segTheme);

  goi('/api/toi').then((t) => {
    const o = $('#cdToiTk');
    if (!o) return;
    /* Máy cá nhân không có phiên đăng nhập (chế độ cli dùng thẳng phiên
     * lark-cli), nên nói ra chứ đừng hiện một ô trống. */
    if (!t.ten && !t.email) {
      o.innerHTML = cdHang('Tài khoản', t.che_do === 'api'
        ? 'Chưa đọc được tài khoản.'
        : 'Máy cá nhân — dùng thẳng phiên lark-cli, không đăng nhập vào hub.', '');
      return;
    }
    o.innerHTML =
      cdHang('Tên', esc(t.ten || '—'),
        '<span class="cd-nhan ' + (t.la_quan_ly ? 'luc' : '') + '">' +
        (t.la_quan_ly ? 'Quản lý' : 'Nhân sự') + '</span>') +
      cdHang('Email', t.email ? '<code>' + esc(t.email) + '</code>' : '—',
        t.email ? '<button class="btn nho ghost" data-copy-id="' + esc(t.email) + '">Copy</button>' : '') +
      (t.email_phu ? cdHang('Email phụ', '<code>' + esc(t.email_phu) + '</code>', '') : '') +
      /* open_id đổi theo TỪNG app Lark, mà nó là thứ duy nhất khai được vào
       * LARK_MANAGER_IDS trên Render. Để sẵn nút Copy ở đây thì lúc cần cấp
       * quyền quản lý cho ai, người đó tự mở mục này copy gửi sang. */
      (t.id ? cdHang('Mã Lark (open_id)', '<code>' + esc(t.id) + '</code>',
        '<button class="btn nho ghost" data-copy-id="' + esc(t.id) + '">Copy</button>') : '');
  }).catch(() => {});
}

/* ---------------- Video giới thiệu ----------------
 * Nhiều video, phát luân phiên trên trang Tổng quan: hết cái này sang cái kia
 * rồi quay lại cái đầu. Thứ tự phát = thứ tự ô, và ô hiện ngay trên từng dòng
 * để khỏi phải đoán.
 *
 * Mỗi dòng có "Thay" riêng chứ không chỉ có Gỡ + Thêm: thay một video giữa bộ
 * mà phải gỡ rồi thêm thì nó rơi xuống cuối vòng, đổi mất thứ tự đang có.
 */
async function napCdPhim() {
  const o = $('#cdPhim');
  if (!o) return;
  let t = { co: false, ds: [], toiDa: 5 };
  try { t = await goi('/api/video-gt-tin'); } catch (_) {}
  const ds = Array.isArray(t.ds) ? t.ds : [];
  const toiDa = t.toiDa || 5;

  /* Mỗi ô có thể là VIDEO hoặc ẢNH. Gọi đúng tên nó chứ không gọi tất cả là
   * "Video": người mở Cài đặt cần biết ô nào là ảnh để khỏi đi tìm nút tiếng. */
  const dong = (x, n) =>
    '<div class="cd-hang"><div class="cd-hang-tx">' +
      '<b>' + (x.anh ? 'Ảnh ' : 'Video ') + n +
        (ds.length > 1 && n === 1 ? ' · phát đầu tiên' : '') + '</b>' +
      '<p>' + esc(x.ten) + ' · ' + x.mb + ' MB · tải lên ' +
        esc(new Date(x.luc).toLocaleString('vi-VN')) + '</p>' +
      (x.anh
        ? '<img class="cd-phim-xem" src="/api/video-gt?i=' + x.i + '&v=' + x.luc + '" alt="">'
        : '<video class="cd-phim-xem" src="/api/video-gt?i=' + x.i + '&v=' + x.luc +
          '" controls preload="metadata"></video>') +
    '</div><div class="cd-hang-dk"><div class="cd-doc">' +
      '<button class="btn nho ghost" data-phim-thay="' + x.i + '">Thay</button>' +
      '<button class="btn nho ghost" data-phim-xoa="' + x.i + '">Gỡ</button>' +
    '</div></div></div>';

  o.innerHTML =
    (ds.length
      ? ds.map((x, n) => dong(x, n + 1)).join('')
      : '<div class="cd-hang"><div class="cd-hang-tx"><b>Chưa có gì để phát</b>' +
        '<p>Chưa đặt video hay ảnh nào — trang Tổng quan chỉ hiện bảng tin.</p></div>' +
        '<div class="cd-hang-dk"><button class="btn nho chinh" id="cdPhimThem">Tải lên</button></div></div>') +
    (ds.length
      ? cdHang('Thứ tự phát',
          ds.length > 1
            ? 'Chạy hết ô 1 sang ô 2… rồi quay lại ô 1. Video chạy hết bài, ảnh đứng 8 giây.'
            : 'Chỉ có một ô nên nó lặp lại mãi. Thêm cái nữa là hai cái chạy luân phiên.',
          ds.length < toiDa
            ? '<button class="btn nho chinh" id="cdPhimThem">Thêm video hoặc ảnh</button>'
            : '<span class="cd-nhan">Đã đủ ' + toiDa + ' ô</span>')
      : '') +
    cdHang('Định dạng nhận vào', '',
      '<span class="cd-nhan">MP4 · WEBM · MOV · PNG · JPG · WEBP · GIF ≤ 60 MB · tối đa ' + toiDa + ' ô</span>') +
    '<input type="file" id="cdPhimTep" accept="video/mp4,video/webm,video/quicktime,' +
      'image/png,image/jpeg,image/webp,image/gif" hidden>';

  /* Một ô chọn tệp dùng chung cho cả Thêm lẫn Thay. `oDich` nhớ đang làm gì:
   * rỗng = thêm vào ô trống kế, có số = thay đúng ô đó. */
  const oTep = $('#cdPhimTep');
  let oDich = 0;
  const moChon = (i) => { oDich = i || 0; oTep.click(); };

  const nutThem = $('#cdPhimThem');
  if (nutThem) nutThem.onclick = () => moChon(0);
  o.querySelectorAll('[data-phim-thay]').forEach((b) => {
    b.onclick = () => moChon(Number(b.dataset.phimThay));
  });

  if (oTep) {
    oTep.onchange = async () => {
      const f = oTep.files[0];
      oTep.value = '';
      if (!f) return;
      if (f.size > 60 * 1024 * 1024) {
        return toast('Tệp nặng ' + Math.round(f.size / 1048576) + ' MB — quá 60 MB. Nén lại rồi tải lên.', 'do');
      }
      toast('Đang tải lên…');
      try {
        await goi('/api/video-gt' + (oDich ? '?i=' + oDich : ''),
          { method: 'POST', headers: { 'Content-Type': f.type }, body: f });
        toast(oDich ? 'Đã thay ô ' + oDich : 'Đã thêm vào ô phát', 'luc');
        napCdPhim();
      } catch (e) {
        toast(e.message, 'do');
      }
    };
  }

  o.querySelectorAll('[data-phim-xoa]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try { await goi('/api/video-gt?i=' + Number(b.dataset.phimXoa), { method: 'DELETE' }); napCdPhim(); }
      catch (e) { b.disabled = false; toast(e.message, 'do'); }
    };
  });
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
  el.innerHTML = cdTieuDe('Phân quyền') +
    '<div class="cd-muc-nho">Thấy base nào · quyền từng người</div>' +
    '<div id="cdQuyenTom">' + cdCho('240px') + '</div>' +
    cdHang('Mở màn quản lý','',
      '<button class="btn primary" id="cdMoQuyen">Mở phân quyền</button>') +
    '';

  $('#cdMoQuyen').onclick = () => modalPhanQuyen();

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
  el.innerHTML = cdTieuDe(a.ten) +
    (a.cuaSo ? '<div id="cdCuaSo">' + cdCho('210px') + '</div>' : '') +
    (a.phanPhoi
      ? cdHang('Phân phối việc mới','',
        '<button class="btn nho chinh" id="cdMoPhanPhoi">Mở</button>')
      : '') +
    /* Không lặp lại "quản lý của app này" ở đây nữa: mục Từng app chỉ chứa
     * tính năng RIÊNG của app đó (phân phối việc, khung giờ đăng ký…). Mọi câu
     * hỏi "ai được làm gì" nằm chung một chỗ là Phân quyền. */
    '';

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
  el.innerHTML = cdTieuDe('Thông báo tới nhân sự') +
    '<div id="tbqlNoi">' + cdCho('190px') + '</div>';
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
        '</b>.' +
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

/**
 * Dòng chú thích dưới danh sách người nhận: nói rõ vì sao mấy ô kia đã tick sẵn,
 * và nói ra những người trong nhóm mà hub KHÔNG có ô để tick.
 *
 * Người thứ 11 vào nhóm hôm qua mà chưa dùng app nào thì hub chưa biết họ —
 * không có ô, không ai nhận ra, và họ không nhận được thông báo nào. Đây là
 * chỗ duy nhất chuyện đó lộ ra.
 */
function tbGhiNhom(nhom, san, moi, cuLaSao) {
  const ten = esc(nhom.ten || 'Phòng MKT');
  /* Dòng đếm do locDs() viết vào — nó đổi theo mỗi lần gõ, nên để rỗng ở đây. */
  let h = '<div class="q-ghi-nho" id="tbDem"></div>';
  if (san.length) {
    h += '<div class="q-ghi-nho">' +
      '<button class="btn nho ghost" id="tbNhom">Tick lại đúng nhóm ' + ten + '</button></div>';
    /* Thông báo cũ lưu `*`: đừng đổi nghĩa sau lưng quản lý. Nói ra trước khi
     * bấm Lưu, vì sau khi lưu thì không nhìn ra được nó đã đổi. */
    if (cuLaSao) {
      h += '<div class="q-ghi-nho" style="color:var(--vang)">Thông báo này đang lưu kiểu cũ: ' +
        '<b>mọi người trong danh bạ</b> (cả người ngoài phòng). Bấm Lưu là nó thành ' +
        'đúng những người đang tick ở trên.</div>';
    }
  } else {
    h += '<div class="q-ghi-nho" style="color:var(--do)">Chưa đọc được nhóm ' + ten +
      ' nên không tick sẵn được ai — đang để mặc định "Cả phòng".' +
      (nhom.loi ? ' ' + esc(nhom.loi) : '') + '</div>';
  }
  if (nhom.nguon === 'luu') {
    h += '<div class="q-ghi-nho" style="color:var(--vang)">Danh sách nhóm là <b>bản lưu</b>' +
      (nhom.luc ? ' ngày ' + esc(ngayO(nhom.luc).split('-').reverse().join('/')) : '') +
      ', không phải bản vừa đọc từ Lark' + (nhom.loi ? ': ' + esc(nhom.loi) : '') +
      '. Ai mới vào nhóm sau mốc đó sẽ không được tick.</div>';
  }
  if ((nhom.thieu || []).length) {
    h += '<div class="q-ghi-nho" style="color:var(--vang)">Trong nhóm nhưng hub chưa thấy ' +
      'ở app nào nên <b>không có ô để tick</b>: ' + nhom.thieu.map(esc).join(', ') +
      '. Họ sẽ không nhận được thông báo này.</div>';
  }
  if ((nhom.trungTen || []).length) {
    h += '<div class="q-ghi-nho" style="color:var(--vang)">Trùng tên nên không dám tick hộ: ' +
      nhom.trungTen.map(esc).join(', ') + ' — tự tick đúng người giúp anh.</div>';
  }
  return h;
}

function moFormTb(tb) {
  const d = TBQL || {};
  const nhom = d.nhomMkt || {};
  /* Anh Hùng: "nên để các thành viên chọn sẵn là những người có trong nhóm
   * phòng MKT, còn muốn tìm kiếm thêm anh sẽ tự search".
   *
   * Nên thông báo MỚI mở ra là đã tick sẵn nhóm phòng — và "Cả phòng" phải BỎ
   * tick, vì tick nó thì máy chủ ghi người nhận là `*` và mọi ô tick bên dưới
   * bị bỏ qua; tick sẵn mà vẫn gửi cho tất cả thì còn tệ hơn không tick.
   *
   * Đọc nhóm hỏng (app chưa ở trong nhóm, mà cũng không có bản lưu) thì QUAY
   * VỀ mặc định cũ "Cả phòng": mở form ra không ai được tick thì lưu sẽ bị chặn
   * vì "chưa chọn người nhận", và quản lý không hiểu vì sao.
   *
   * SỬA một thông báo cũ thì không đụng vào: danh sách người nhận đã lưu là
   * quyết định của lần soạn đó, tự ý tick thêm là gửi cho người không định gửi. */
  const sanNhom = (nhom.ids || []).slice();
  /* Đọc được nhóm thì form chạy luật mới; đọc hỏng thì giữ nguyên luật cũ —
   * một lần Lark không trả lời không được phép làm quản lý mất đường gửi. */
  const chiNhom = sanNhom.length > 0;
  TBSUA = tb || (sanNhom.length
    ? { mucDo: 'Tin', moiAi: false, ai: sanNhom, bat: true }
    : { mucDo: 'Tin', moiAi: true, ai: [], bat: true });
  const t = TBSUA;
  /* Tệp đã chọn nhưng CHƯA đẩy lên. Sống trong bộ nhớ trình duyệt tới lúc Lưu. */
  TBSUA.tepMoi = [];
  const db = d.danhBa || [];
  const hang = (nhan, noi) =>
    '<div class="q-hang"><label>' + nhan + '</label><div class="q-o">' + noi + '</div></div>';

  let html = '<div class="q-form">';
  html += hang('Mức độ',
    '<select class="q-in" id="tbMucDo">' + (d.mucDo || ['Tin']).map((x) =>
      '<option value="' + esc(x) + '"' + (t.mucDo === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') +
    '</select>');
  html += hang('Tiêu đề',
    '<input class="q-in" id="tbTieuDe" type="text" value="' + esc(t.tieuDe || '') +
    '" placeholder="Câu người ta đọc đầu tiên">');
  html += hang('Nội dung',
    '<textarea class="q-in" id="tbNoiDung" rows="5" placeholder="Xuống dòng được — mỗi dòng một đoạn">' +
    esc(t.noiDung || '') + '</textarea>');

  /* Tệp đính kèm — chọn NGAY LÚC SOẠN.
   *
   * Anh Hùng: "anh nghĩ nên tải file tại thời điểm anh soạn luôn".
   *
   * Ô đính kèm của Base vẫn phải gắn vào một dòng đã có, nên bản trước bắt lưu
   * xong mới mở lại được để đính — đúng về kỹ thuật, sai về cách người ta làm
   * việc: soạn một thông báo là soạn cả chữ lẫn ảnh trong một lượt.
   *
   * Giờ tệp nằm trong trình duyệt tới lúc bấm Lưu; lưu xong có dòng thì đẩy
   * lên ngay sau đó. Người soạn thấy ảnh mình vừa chọn ngay lập tức (xem bằng
   * chính tệp trên máy), không phải chờ vòng mạng nào. */
  html += hang('Tệp đính kèm',
    '<div class="q-tep" id="tbTepDs"></div>' +
    '<input type="file" id="tbTepChon" multiple hidden ' +
      'accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip">' +
    '<button class="btn nho" id="tbTepThem" style="margin-top:6px">Thêm tệp…</button>');

  html += hang('Nút hành động',
    '<input class="q-in" id="tbNhanNut" type="text" value="' + esc(t.nhanNut || '') +
      '" placeholder="Nhãn nút, ví dụ: Đọc quy định mới">' +
    '<input class="q-in" id="tbLienKet" type="text" value="' + esc(t.lienKet || '') +
      '" placeholder="https://... hoặc #/m/cong-viec (một base trong hub)" style="margin-top:6px">' +
    '<label class="q-ck" style="margin-top:6px"><input type="checkbox" id="tbBuocBam"' +
      (t.buocBam ? ' checked' : '') + '>' +
      '<span>Buộc bấm nút này trước khi xác nhận</span></label>');

  html += hang('Khoảng hiển thị',
    '<div class="cd-doc"><input class="q-in" id="tbTu" type="date" value="' + esc(ngayO(t.tuNgay)) + '">' +
    '<input class="q-in" id="tbDen" type="date" value="' + esc(ngayO(t.denNgay)) + '"></div>');

  html += hang('Gửi cho',
    ((TBQL && TBQL.cheDo && TBQL.cheDo !== 'api')
      ? '<div class="q-ghi-nho" style="color:var(--do)">Máy cá nhân: danh sách dưới đây ' +
        'cho open_id KHÁC bản deploy — chọn ở đây thì người nhận không khớp.</div>'
      : '') +
    /* "Cả phòng" NGHĨA LÀ danh sách bên dưới.
     *
     * Anh Hùng: "nếu tích cả phòng, có nghĩa là những người thuộc danh sách
     * hiện bên dưới. Còn nếu bỏ tích thì anh sẽ chọn thủ công".
     *
     * Trước đây ô này lưu người nhận là `*` = MỌI người trong danh bạ, mà danh
     * bạ gom từ chín app nên có cả Điều hành, kế toán, phòng khác. Tick "cả
     * phòng" là thông báo nội bộ của phòng bay sang người ngoài phòng — và
     * không có màn hình nào cho thấy chuyện đó.
     *
     * Giờ nó là cái công tắc tick hết / bỏ hết đúng nhóm phòng, và lưu ra DANH
     * SÁCH TÊN cụ thể. Ai nhận được thì nhìn thấy trên màn hình, không phải suy
     * ra từ một dấu sao. */
    '<label class="q-ck q-ck-manh"><input type="checkbox" id="tbMoiAi"' +
      (chiNhom ? ' data-chi-nhom="1"' : '') +
      ((chiNhom ? sanNhom.every((id) => (t.ai || []).includes(id)) || t.moiAi : t.moiAi)
        ? ' checked' : '') + '>' +
      '<span>Cả phòng</span><small class="q-nhat">— ' +
      (chiNhom ? sanNhom.length + ' người trong nhóm ' + esc(nhom.ten || 'Phòng MKT')
        : 'kể cả người vào sau này') + '</small></label>' +
    '<input class="q-in q-loc" id="tbLoc" type="text" placeholder="Gõ tên để tìm người ngoài phòng…">' +
    '<div class="q-nhom q-nhom-cuon" id="tbAi">' + db.map((x) =>
      '<label class="q-ck' + (sanNhom.includes(x.id) ? ' q-ck-nhom' : '') + '"' +
      ' data-nhom="' + (sanNhom.includes(x.id) ? '1' : '') + '"' +
      ' data-ten="' + esc(String(x.ten).toLowerCase()) + '">' +
      '<input type="checkbox" data-ai="' + esc(x.id) + '"' +
        /* Thông báo cũ lưu `*` (cả danh bạ) thì mở ra tick sẵn nhóm phòng —
         * lưu lại là nó thành danh sách tên, có cảnh báo ngay bên dưới. */
        (((t.ai || []).includes(x.id) || (chiNhom && t.moiAi && sanNhom.includes(x.id)))
          ? ' checked' : '') + '>' +
      '<span>' + esc(x.ten) + '</span></label>').join('') + '</div>' +
    tbGhiNhom(nhom, sanNhom, !tb, !!(tb && t.moiAi)));

  html += hang('Bật',
    '<label class="q-ck q-ck-manh"><input type="checkbox" id="tbBat"' +
      (t.bat !== false ? ' checked' : '') + '>' +
      '<span>Đang gửi</span></label>');
  html += '</div>';

  moModal(tb ? 'Sửa thông báo' : 'Soạn thông báo', html,
    '<button class="btn ghost" id="tbQuay">← Danh sách</button><span class="grow"></span>' +
    '<button class="btn" id="tbThu">Xem thử</button>' +
    '<button class="btn primary" id="tbLuu">Lưu</button>' +
    '<button class="btn ghost" data-close="1">Đóng</button>');

  const ckMoi = $('#tbMoiAi');
  const oNhom = () => $$('#tbAi [data-ai]').filter((x) => sanNhom.includes(x.dataset.ai));
  /* Luật mới: ô "Cả phòng" phản chiếu danh sách — tick hết nhóm thì nó sáng, bỏ
   * một người thì nó tắt. Không còn làm mờ danh sách nữa: mờ là dấu hiệu "mấy ô
   * này vô nghĩa", mà giờ chính chúng là thứ được lưu.
   *
   * Luật cũ (không đọc được nhóm): giữ nguyên `*` và vẫn làm mờ, vì lúc đó ô
   * tick thật sự bị bỏ qua. */
  const dongBo = () => {
    if (chiNhom) {
      const ds = oNhom();
      ckMoi.checked = ds.length > 0 && ds.every((x) => x.checked);
      return;
    }
    $('#tbAi').classList.toggle('q-mo-het', ckMoi.checked);
  };
  ckMoi.onchange = () => {
    if (!chiNhom) return dongBo();
    const bat = ckMoi.checked;
    oNhom().forEach((x) => { x.checked = bat; });
    locDs();
  };
  /* Tick tay từng người thì ô "Cả phòng" phải tự theo. Bắt ở khối cha, không
   * gắn từng dòng: 37 dòng là 37 listener, mà mỗi lần mở form lại gắn lại. */
  $('#tbAi').onchange = dongBo;
  dongBo();
  const oLoc = $('#tbLoc');
  /* Mặc định chỉ hiện người trong nhóm phòng.
   *
   * Anh Hùng: "danh sách này vẫn có rất đông thành viên, không chỉ có những
   * người trong nhóm MKT". Danh bạ hub gom từ MỌI app nên có cả Điều hành, kế
   * toán, các phòng khác — 37 dòng cho một phòng 10 người. Tick sẵn thôi chưa
   * đủ: 27 dòng còn lại vẫn che mất 10 dòng cần nhìn, và vẫn phải cuộn qua hết
   * để kiểm tra xem mình gửi cho ai.
   *
   * Nên: không gõ gì thì chỉ hiện nhóm phòng; gõ tên thì tìm trong TOÀN BỘ danh
   * bạ — đúng câu "muốn tìm kiếm thêm anh sẽ tự search". Ai đã tick thì luôn
   * hiện, kể cả người ngoài phòng: đã chọn mà bị giấu đi thì lúc lưu mới ngã
   * ngửa là gửi cho người mình không thấy.
   *
   * Không đọc được nhóm (sanNhom rỗng) thì hiện hết như cũ — giấu sạch danh
   * sách vì một lần đọc hỏng còn tệ hơn danh sách dài. */
  const locDs = () => {
    const q = oLoc.value.trim().toLowerCase();
    let hien = 0;
    $$('#tbAi .q-ck').forEach((l) => {
      const daTick = l.querySelector('input').checked;
      const an = q
        ? (!l.dataset.ten.includes(q) && !daTick)
        : (chiNhom && !l.dataset.nhom && !daTick);
      l.hidden = an;
      if (!an) hien++;
    });
    const dem = $('#tbDem');
    if (dem) {
      dem.textContent = q
        ? 'Đang tìm trong cả ' + db.length + ' người · hiện ' + hien
        : (chiNhom ? 'Đang hiện ' + hien + ' người trong nhóm ' + (nhom.ten || 'Phòng MKT') : '');
    }
  };
  oLoc.oninput = locDs;
  locDs();
  /* Tick lại đúng nhóm: bỏ hết rồi tick lại theo nhóm, KHÔNG cộng thêm. Cộng
   * thêm thì bấm xong vẫn còn người đã bỏ ra — nút không làm đúng điều nó nói. */
  const nutNhom = $('#tbNhom');
  if (nutNhom) {
    nutNhom.onclick = () => {
      ckMoi.checked = false;
      dongBo();
      $$('#tbAi [data-ai]').forEach((x) => { x.checked = sanNhom.includes(x.dataset.ai); });
      oLoc.value = '';
      locDs();
      toast('Đã tick ' + sanNhom.length + ' người trong nhóm ' + (nhom.ten || 'Phòng MKT'), 'luc');
    };
  }
  veTbTep();
  const nutTep = $('#tbTepThem');
  if (nutTep) {
    const oTep = $('#tbTepChon');
    nutTep.onclick = () => oTep.click();
    oTep.onchange = () => { themTep([...oTep.files]); oTep.value = ''; };
  }

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

/** Vẽ danh sách tệp: cái đã ở trên Base, và cái vừa chọn còn chờ Lưu. */
function veTbTep() {
  const o = $('#tbTepDs');
  if (!o) return;
  const da = (TBSUA && TBSUA.tep) || [];
  const moi = (TBSUA && TBSUA.tepMoi) || [];
  if (!da.length && !moi.length) {
    o.innerHTML = '<div class="q-ghi-nho">Chưa có tệp nào.</div>';
    return;
  }
  const oAnh = (src) => '<img src="' + esc(src) + '" alt="">';
  o.innerHTML =
    da.map((x) =>
      '<div class="q-tep-mot">' +
        (laAnh(x) ? oAnh(duongTep(TBSUA.recordId, x.token))
          : laPhim(x) ? '<video class="q-tep-phim" src="' +
              esc(duongTep(TBSUA.recordId, x.token)) + '" muted preload="metadata"></video>'
          : '<span class="q-tep-ic">TỆP</span>') +
        '<span class="q-tep-ten">' + esc(x.ten) + '</span>' +
        (x.co ? '<span class="q-nhat">' + coTep(x.co) + '</span>' : '') +
        '<button class="btn nho ghost" data-go-tep="' + esc(x.token) + '">Gỡ</button>' +
      '</div>').join('') +
    moi.map((x, i) =>
      '<div class="q-tep-mot">' +
        (x.laAnh ? oAnh(x.xem)
          : x.laPhim ? '<video class="q-tep-phim" src="' + esc(x.xem) + '" muted preload="metadata"></video>'
          : '<span class="q-tep-ic">TỆP</span>') +
        '<span class="q-tep-ten">' + esc(x.ten) + '</span>' +
        '<span class="q-nhat">' + coTep(x.tep.size) +
          (x.goc && x.goc > x.tep.size ? ' · đã nén từ ' + coTep(x.goc) : '') + '</span>' +
        '<span class="q-chip q-nhat">chờ Lưu</span>' +
        '<button class="btn nho ghost" data-bo-tep="' + i + '">Bỏ</button>' +
      '</div>').join('');

  /* Ảnh đã nằm trên Base mà tải hỏng: đổi thành ô chữ, đừng để khung vỡ. */
  $$('#tbTepDs img').forEach((img) => {
    img.onerror = () => {
      const o = document.createElement('span');
      o.className = 'q-tep-ic';
      o.textContent = '!';
      o.title = 'Không tải được ảnh từ Lark';
      img.replaceWith(o);
    };
  });

  $$('#tbTepDs [data-go-tep]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        const d = await goi('/api/tb-app/go-tep', { method: 'POST',
          body: JSON.stringify({ recordId: TBSUA.recordId, token: b.dataset.goTep }) });
        TBSUA.tep = d.tep || [];
        veTbTep();
      } catch (e) { b.disabled = false; toast(e.message, 'do'); }
    };
  });
  $$('#tbTepDs [data-bo-tep]').forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.boTep);
      const x = TBSUA.tepMoi[i];
      if (x && x.xem) URL.revokeObjectURL(x.xem);
      TBSUA.tepMoi.splice(i, 1);
      veTbTep();
    };
  });
}

/** Chọn tệp: nén ảnh nặng rồi xếp vào hàng đợi, chưa gọi mạng lần nào. */
async function themTep(ds) {
  for (const f of ds) {
    let tep = f;
    let goc = f.size;
    try { tep = await nenAnh(f); } catch (_) { tep = f; }
    if (tep.size > 20 * 1024 * 1024) {
      /* Video không nén được ở trình duyệt (phải có bộ mã hoá, nặng gấp mấy lần
       * cả app này), nên nói thẳng đường vòng: cắt ngắn clip, hoặc để clip trên
       * Lark Drive / YouTube rồi gắn link bằng nút hành động. */
      toast('"' + f.name + '" nặng ' + coTep(tep.size) + ' — quá 20 MB. ' +
        (/^video\//.test(f.type || '')
          ? 'Cắt ngắn clip, hoặc để clip trên Drive rồi gắn link ở "Nút hành động".'
          : 'Chọn tệp nhỏ hơn.'), 'do');
      continue;
    }
    const laA = /^image\//.test(tep.type || '');
    const laV = /^video\//.test(tep.type || '');
    TBSUA.tepMoi.push({
      ten: tep.name || f.name, tep, goc, laAnh: laA, laPhim: laV,
      xem: (laA || laV) ? URL.createObjectURL(tep) : '',
    });
    veTbTep();
  }
}

/**
 * Nén ảnh xuống quanh 1 MB trước khi gửi đi.
 *
 * Anh Hùng: "nếu ảnh nặng thì dùng tool nén lại để hiển thị nhanh phù hợp,
 * khoảng 1MB". Ảnh chụp màn hình 4K nặng 6–8 MB mà hiện trong một popup rộng
 * ~560px thì vừa chờ lâu vừa chẳng nét hơn tí nào.
 *
 * Nén ở TRÌNH DUYỆT, không nén ở máy chủ: byte nặng không bao giờ rời máy người
 * soạn, nên mạng yếu vẫn gửi được. Hạ cạnh dài về tối đa 1600px rồi giảm dần
 * chất lượng cho tới khi lọt 1 MB.
 *
 * KHÔNG đụng vào: tệp không phải ảnh, ảnh SVG (vector, nén lại là mất nét), GIF
 * (nén thành ảnh tĩnh là mất cả cái người ta muốn gửi), và ảnh vốn đã nhẹ.
 *
 * Xuất ra WEBP chứ không JPEG: WEBP giữ được nền trong suốt — logo PNG nền
 * trong mà ép sang JPEG là nền đen. Trình duyệt nào không mã hoá được WEBP thì
 * lùi về JPEG.
 */
async function nenAnh(f, gioiHan) {
  const MUC = gioiHan || 1024 * 1024;
  const kieu = f.type || '';
  if (!/^image\//.test(kieu) || /svg|gif/.test(kieu)) return f;
  if (f.size <= MUC) return f;
  if (!window.createImageBitmap || !document.createElement('canvas').toBlob) return f;

  const anh = await createImageBitmap(f);
  const CANH = 1600;
  const ti = Math.min(1, CANH / Math.max(anh.width, anh.height));
  const w = Math.max(1, Math.round(anh.width * ti));
  const h = Math.max(1, Math.round(anh.height * ti));
  const khung = document.createElement('canvas');
  khung.width = w; khung.height = h;
  khung.getContext('2d').drawImage(anh, 0, 0, w, h);
  if (anh.close) anh.close();

  const veRa = (mime, q) => new Promise((giai) => khung.toBlob(giai, mime, q));
  for (const mime of ['image/webp', 'image/jpeg']) {
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const b = await veRa(mime, q);
      if (!b || !b.size) break;                 // trình duyệt không mã hoá được kiểu này
      if (b.size <= MUC || q === 0.4) {
        if (b.size >= f.size) return f;         // nén xong còn nặng hơn thì thôi
        const duoi = mime === 'image/webp' ? '.webp' : '.jpg';
        return new File([b], String(f.name).replace(/\.[^.]+$/, '') + duoi, { type: mime });
      }
    }
  }
  return f;
}

/**
 * Đẩy hàng đợi lên sau khi thông báo đã có dòng trên Base.
 *
 * Gửi thẳng byte trong thân yêu cầu, không dựng multipart: bên nhận chỉ cần
 * đúng MỘT tệp mỗi lượt, mà multipart tự dựng tay là chỗ rất dễ sai lặng lẽ.
 * Tên tệp đi qua header nên phải mã hoá base64 — tên tiếng Việt có dấu nhét
 * thẳng vào header là Node ném "Invalid character in header".
 */
async function dayTepLen(recordId, ds, bao) {
  let hong = 0;
  for (let i = 0; i < ds.length; i++) {
    const x = ds[i];
    if (bao) bao('Đang gửi tệp ' + (i + 1) + '/' + ds.length + '…');
    try {
      await goi('/api/tb-app/tep?recordId=' + encodeURIComponent(recordId), {
        method: 'POST',
        headers: {
          'Content-Type': x.tep.type || 'application/octet-stream',
          'x-ten-tep': btoa(String.fromCharCode(...new TextEncoder().encode(x.ten))),
        },
        body: x.tep,
      });
    } catch (e) {
      hong++;
      toast('Không gửi được "' + x.ten + '": ' + e.message, 'do');
    }
    if (x.xem) URL.revokeObjectURL(x.xem);
  }
  return hong;
}

const laAnh = (x) => /^image\//.test(x.kieu || '') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(x.ten || '');
const laPhim = (x) => /^video\//.test(x.kieu || '') || /\.(mp4|mov|webm|m4v)$/i.test(x.ten || '');
const duongTep = (rec, token) =>
  '/api/tb-app/tep/' + encodeURIComponent(rec) + '/' + encodeURIComponent(token);
const coTep = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

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
    /* Đọc được nhóm phòng thì KHÔNG bao giờ lưu `*` nữa: "cả phòng" giờ nghĩa
     * là danh sách tên đang tick bên dưới, và người nhận phải nhìn thấy được
     * trên màn hình chứ không suy ra từ một dấu sao. */
    moiAi: $('#tbMoiAi').dataset.chiNhom ? false : !!$('#tbMoiAi').checked,
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
    const kq = await goi('/api/tb-app/quan-ly', { method: 'POST', body: JSON.stringify(than) });
    /* Tệp đi SAU khi có dòng: ô đính kèm của Base gắn vào một dòng cụ thể.
     * Lưu chữ hỏng thì không gửi tệp; lưu chữ xong mà tệp hỏng thì thông báo
     * vẫn còn đó — nói rõ tệp nào hỏng chứ không nuốt mất. */
    const cho = (TBSUA && TBSUA.tepMoi) || [];
    let hong = 0;
    if (cho.length) {
      hong = await dayTepLen(kq.recordId || than.recordId, cho,
        (tin) => { nut.textContent = tin; });
      TBSUA.tepMoi = [];
    }
    toast(hong ? 'Đã lưu, nhưng ' + hong + ' tệp chưa gửi được.' : 'Đã lưu thông báo',
      hong ? 'do' : 'luc');
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
      (tay ? 'Đang <b>' + (tay === 'mo' ? 'mở tay' : 'đóng tay') + '</b> tới <b>' +
        esc(cdMocCuaSo(tay === 'mo' ? L.moTayToi : L.dongTayToi)) + '</b>.' : ''),
      '<div class="cd-doc">' +
        '<button class="btn nho chinh" data-cs-viec="mo">Mở khoá 1 giờ</button>' +
        '<button class="btn nho" data-cs-viec="dong">Đóng 1 giờ</button>' +
        (tay ? '<button class="btn nho ghost" data-cs-viec="bo">Bỏ</button>' : '') +
      '</div>') +

    cdHang('Khung giờ hằng tuần',
      '<label class="q-ck q-ck-manh" style="margin:2px 0 8px">' +
        '<input type="checkbox" id="cdCsBat"' + (L.bat === false ? '' : ' checked') + '>' +
        '<span>Áp khung giờ</span>' +
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
        /* Đổi chỗ bằng nút, song song với kéo thả trên panel: màn cảm ứng kéo
         * rất khó, và kéo thì không ai đoán ra là kéo được nếu không thử. Chỉ
         * app đang hiện mới có — app đang ẩn không có chỗ nào trên panel để mà
         * xếp trước xếp sau. */
        (m.bat
          ? '<button class="btn nho ghost" data-len="' + esc(m.id) + '" title="Lên một bậc">↑</button>' +
            '<button class="btn nho ghost" data-xuong="' + esc(m.id) + '" title="Xuống một bậc">↓</button>'
          : '') +
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
        /* Anh Hùng: "chừa lại bật tắt, điều chỉnh thứ tự, bỏ tùy chọn log,
         * xoá". Log vẫn còn nguyên ở Nâng cao → Log app con; xoá base là việc
         * một năm một lần, làm thẳng trong modules.json, không đáng để một nút
         * đỏ đứng cạnh nút Ẩn suốt ngày. */
        (m.kieu === 'local'
          ? '<button class="btn nho" data-batlai="' + esc(m.id) + '">Bật lại</button>' +
            '<button class="btn nho ghost" data-tat="' + esc(m.id) + '">Tắt</button>'
          : '') +
        '<button class="btn nho ghost" data-an="' + esc(m.id) + '">' + (m.bat ? 'Ẩn' : 'Hiện lại') + '</button>' +
      '</div></div>';
  };

  el.innerHTML = cdTieuDe('Base trong panel') +
    '<div class="cd-ds-base">' + S.modules.map(dong).join('') + '</div>' +
    /* Thứ tự là của RIÊNG máy này — nói thẳng ra, không để quản lý tưởng mình
     * vừa xếp lại panel cho cả phòng. */
    '<div class="cd-hang"><div class="cd-hang-tx"><b>Thứ tự trong panel</b></div>' +
      '<div class="cd-hang-dk"><button class="btn nho ghost" id="cdThuTuGoc">Về thứ tự gốc</button></div></div>' +
    '<div class="cd-hang"><div class="cd-hang-tx"><b>Thêm base</b></div>' +
      '<div class="cd-hang-dk"><button class="btn primary" id="cdThem">Thêm base</button></div></div>';
  $('#cdThem').onclick = modalThem;
  $('#cdThuTuGoc').onclick = () => {
    luuThuTu([]);
    napHub().then(() => { veCdBase(el); toast('Đã về thứ tự gốc', 'luc'); });
  };
}

/* ---------------- Người dùng & phân quyền ---------------- */
/* ---------------- Kiểm tra hệ thống ---------------- */
async function veCdKiemTra(el) {
  el.innerHTML = cdTieuDe('Kiểm tra hệ thống') +
    (window.KX ? KX.bang(8, 2)
      : '<div class="trong"><span class="spin"></span> Đang hỏi từng base…</div>');
  let d;
  try { d = await goi('/api/kiem-tra'); } catch (e) {
    el.innerHTML = cdTieuDe('Kiểm tra hệ thống') +
      '<div class="canh-bao do"><span class="grow">' + esc(e.message) + '</span></div>';
    return;
  }
  const h = d.hub;
  const hang = (ten, gt, tot) => cdHang(ten, '', '<span class="cd-nhan ' +
    (tot === false ? 'do' : tot === true ? 'luc' : '') + '">' + esc(gt) + '</span>');

  let html = cdTieuDe('Kiểm tra hệ thống') +
    hang('Chế độ', h.che_do === 'api' ? 'api · server chung' : 'cli · máy cá nhân') +
    hang('Địa chỉ công khai', location.origin) +
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
    /* Ba trạng thái, không phải hai: ĐỎ là app trả lời nhưng hỏng · THƯỜNG là
     * đọc được số · XÁM là app đang chạy nhưng không khai /api/meta để mà hỏi.
     * Gộp trạng thái thứ ba vào đỏ (bản trước làm thế) là báo động giả cho sáu
     * app đang chạy tốt — rồi lần sau đỏ thật cũng không ai buồn nhìn. */
    return '<div class="the ' + (loi ? 'cao' : 'ok') + '">' +
      '<div class="nhan">' + esc(m.ten) + '</div>' +
      (loi
        ? '<div class="ghi" style="color:var(--do)"><b>' + esc(ma || 'Lỗi') + '</b><br>' + esc(loi.slice(0, 160)) + '</div>'
        : m.ghi
          ? '<div class="so" style="color:var(--chu-nhat)">đang chạy</div>' +
            '<div class="ghi">' + esc(m.ghi) + '</div>'
          : '<div class="so">' + (m.tong == null ? '—' : so(m.tong)) + '</div>' +
            '<div class="ghi">bản ghi đọc được' + (m.vai ? ' · vai ' + esc(m.vai) : '') + '</div>') +
      '</div>';
  }).join('') + '</div>';

  html += '<div class="cd-hang"><div class="cd-hang-tx"><b>Chạy lại</b>' +
    '</div>' +
    '<div class="cd-hang-dk"><button class="btn ghost" id="cdKtLai">Chạy lại</button></div></div>';

  el.innerHTML = html;
  $('#cdKtLai').onclick = () => veCdKiemTra(el);
}

/* ---------------- Log app con ---------------- */
async function veCdLog(el, id) {
  const ds = S.modules.filter((m) => m.kieu === 'local');
  const chon = id || S.cdLog || (ds[0] && ds[0].id);
  S.cdLog = chon;

  el.innerHTML = cdTieuDe('Log app con') +
    '<div class="cd-hang"><div class="cd-hang-tx"><b>Chọn base</b></div>' +
      '<div class="cd-hang-dk"><select class="q-in" id="cdLogChon">' +
      ds.map((m) => '<option value="' + esc(m.id) + '"' + (m.id === chon ? ' selected' : '') + '>' +
        esc(m.ten) + '</option>').join('') + '</select>' +
      '<button class="btn ghost nho" id="cdLogTai">Tải lại</button>' +
      '<button class="btn nho" data-batlai="' + esc(chon || '') + '">Bật lại base</button></div></div>' +
    '<div class="log" id="cdLogHop">' + (window.KX ? KX.log(8) : 'Đang đọc…') + '</div>';

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
