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
const CD_MUC = [
  { nhom: 'Cài đặt', ds: [
    { k: 'chung', ten: 'Chung', ic: 'cai-dat', mo: 'Ngôn ngữ, sáng tối, tài khoản' },
    { k: 'base', ten: 'Base trong panel', ic: 'base', mo: 'Bật, tắt, ẩn, thêm base', ql: true },
    { k: 'nguoi', ten: 'Nhân sự & phân quyền', ic: 'nguoi', mo: 'Ai thấy base nào', ql: true },
    { k: 'quan-ly-app', ten: 'Quản lý từng app', ic: 'cong-viec',
      mo: 'Ai duyệt được trong từng app', ql: true },
    { k: 'phan-phoi', ten: 'Phân phối công việc', ic: 'lich',
      mo: 'Tự giao việc mới theo tỷ lệ', ql: true },
  ] },
  { nhom: 'Nâng cao', ds: [
    { k: 'kiem-tra', ten: 'Kiểm tra hệ thống', ic: 'may', mo: 'Hỏi từng base xem đọc được gì', ql: true },
    { k: 'log', ten: 'Log app con', ic: 'may', mo: 'Xem stderr thật của app con', ql: true },
  ] },
];

/** Các mục người đang xem được vào. */
function cdMucCuaToi() {
  return CD_MUC
    .map((g) => ({ nhom: g.nhom, ds: g.ds.filter((m) => S.quanLy || !m.ql) }))
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

function veCdNav() {
  $('#cdNav').innerHTML = cdMucCuaToi().map((g) =>
    '<div class="cd-nhom">' + esc(g.nhom) + '</div>' +
    g.ds.map((m) =>
      '<button class="cd-item' + (S.cdMuc === m.k ? ' on' : '') + '" data-cd="' + m.k + '">' +
      '<span class="cd-ic">' + icon(m.ic) + '</span>' +
      '<span class="cd-tx"><b>' + esc(m.ten) + '</b></span></button>').join('')
  ).join('');
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
  if (S.cdMuc === 'chung') return veCdChung(el);
  if (S.cdMuc === 'base') return veCdBase(el);
  if (S.cdMuc === 'nguoi') return veCdNguoi(el);
  if (S.cdMuc === 'quan-ly-app') return veCdQuanLyApp(el);
  if (S.cdMuc === 'phan-phoi') return veCdPhanPhoi(el);
  if (S.cdMuc === 'kiem-tra') return veCdKiemTra(el);
  if (S.cdMuc === 'log') return veCdLog(el);
}

/* ---------------- Chung ---------------- */
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

function veCdQuanLyApp(el) {
  el.innerHTML = cdTieuDe('Quản lý từng app',
    'Ai được quyền quản lý bên trong mỗi app. Không phải "ai thấy base nào" — ' +
    'cái đó ở mục Nhân sự & phân quyền.') +
    QL_APP.map((a) => '<div id="cdQl-' + esc(a.id) + '">' +
      cdHang(a.ten, 'đang đọc…', '') + '</div>').join('');
  QL_APP.forEach((a) => napCdQl(a));
}

/**
 * Đọc lại rồi vẽ lại một khối.
 *
 * `y` = { moDs, tin }: giữ danh sách đang mở, và câu báo hiện SAU khi vẽ.
 * Không có hai thứ này thì bấm Lưu xong khối bị vẽ lại, ô thông báo bị xoá và
 * danh sách đóng lại — đúng lỗi đã gặp: ghi thành công mà mặt màn hình như
 * chưa xảy ra gì.
 */
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

/* ---------------- Phân phối công việc ----------------
 * Mở thẳng màn phân phối của Bảng công việc thay vì dựng lại ở đây: nó là bảng
 * nhiều cột với trọng số từng người, dựng lại là hai bản phải sửa song song.
 * Cài đặt làm đúng việc của nó — chỗ duy nhất để TÌM ra thiết lập.
 */
function veCdPhanPhoi(el) {
  el.innerHTML = cdTieuDe('Phân phối công việc',
    'Việc mới không ai nhận sau một khoảng chờ thì hệ tự giao, theo loại việc và ' +
    'tỷ lệ của từng nhân sự.') +
    cdHang('Mở màn phân phối',
      'Bật/tắt từng loại việc, đặt mốc chờ, và đặt tỷ lệ cho từng nhân sự.',
      '<button class="btn nho chinh" id="cdMoPhanPhoi">Mở</button>');
  $('#cdMoPhanPhoi').onclick = () => {
    dongModal();
    location.hash = '#/m/cong-viec?mo=phan-phoi';
  };
}

function veCdChung(el) {
  const segNgonNgu = '<div class="seg seg-lang" data-no-i18n="1">' + NGON_NGU.map(([v, t]) =>
    '<button data-lang-set="' + v + '" class="' + (S.lang === v ? 'on' : '') + '">' + t + '</button>').join('') +
    '</div>';
  const segTheme = '<div class="seg seg-theme">' + THEME.map(([v, t]) =>
    '<button data-theme-set="' + v + '" class="' + (S.theme === v ? 'on' : '') + '" title="' + t + '">' +
    icon(v) + '</button>').join('') + '</div>';

  /* Nhân sự chỉ cần đổi ngôn ngữ và sáng/tối. Mấy dòng còn lại là chuyện vận
   * hành — cổng nội bộ, app_id, số bản, commit — bày ra vừa rối vừa lộ ruột gan
   * hệ thống, nên chỉ quản lý thấy. */
  const ql = !!S.quanLy;

  el.innerHTML = cdTieuDe('Chung', ql ? 'Thông tin phiên đang chạy và cách hiển thị.'
                                      : 'Chọn ngôn ngữ và kiểu hiển thị cho riêng máy bạn.') +
    '<div id="cdToi" class="cd-hang"><div class="cd-hang-tx"><b>Đang đọc…</b></div></div>' +
    cdHang('Ngôn ngữ', 'Áp cho lớp vỏ và cả ba app con. Mỗi người nhớ lựa chọn riêng trong máy mình.', segNgonNgu) +
    cdHang('Sáng / tối', 'Theo hệ thống là ăn theo cài đặt của máy.', segTheme) +
    (ql ? cdHang('Địa chỉ công khai',
      'Chỉ lớp vỏ này ra internet. Ba app con chạy trên cổng nội bộ (5173 · 5174 · 5176) ' +
      'trong cùng một máy chủ, chỉ lớp vỏ gọi được — nên cả hệ chỉ có MỘT link và MỘT lần đăng nhập.',
      '<code>' + esc(location.origin) + '</code>') : '') +
    (ql ? '<div id="cdBanChay"></div>' : '');

  goi('/api/toi').then((t) => {
    const o = $('#cdToi');
    if (!o) return;
    const nut = (v) => '<button class="btn nho" data-copy-id="' + esc(v) + '">Copy</button>';
    if (t.che_do !== 'api') {
      o.outerHTML = !ql ? '' :
        cdHang('Chế độ chạy', 'Đang dùng phiên <code>lark-cli</code> của máy này. Không qua app Lark, ' +
          'nên phạm vi khả dụng (Availability) không ảnh hưởng gì ở đây.',
        '<span class="cd-nhan">cli · máy cá nhân</span>');
      return;
    }
    const khoa = t.email || t.id;
    o.outerHTML =
      cdHang('Tài khoản Lark',
        '<code>' + esc(khoa) + '</code>' +
        (ql && t.email_phu ? '<br>Email còn lại: <code>' + esc(t.email_phu) + '</code>' : ''),
        '<div class="cd-doc">' +
          '<span class="cd-nhan ' + (t.la_quan_ly ? 'luc' : 'do') + '">' +
          (t.la_quan_ly ? 'Quản lý' : 'Nhân sự') + '</span>' + (ql ? nut(khoa) : '') + '</div>') +
      (!ql ? '' : cdHang('App Lark đang chạy',
        (t.app_id
          ? '<code>' + esc(t.app_id) + '</code> — so với app anh phát hành bên Developer Console. ' +
            'Khác nhau thì mọi thay đổi Availability không có tác dụng.'
          : 'Chưa khai LARK_APP_ID.'),
        (t.app_id
          ? '<div class="cd-doc"><a class="btn nho ghost" target="_blank" rel="noreferrer" ' +
            'href="https://open.larksuite.com/app/' + esc(t.app_id) + '/version/create">Trang phát hành</a>' +
            nut(t.app_id) + '</div>'
          : '')));
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
        ? 'Cả phòng thấy base này'
        : 'Chỉ quản lý và người được cấp tên') + '">' +
        (m.caPhong ? 'Cả phòng' : 'Kín') + '</span>' +
      '<div class="thao-tac">' +
        '<button class="btn nho ghost" data-caphong="' + esc(m.id) + '"' +
          ' data-moi="' + (m.caPhong ? '0' : '1') + '">' +
          (m.caPhong ? 'Đóng lại' : 'Mở cả phòng') + '</button>' +
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
function veCdNguoi(el) {
  el.innerHTML = cdTieuDe('Người dùng & phân quyền',
    'Ai mở được app là do Lark quyết (Availability). Ai thấy base nào là do anh quyết ở đây.') +
    '<div id="cdQuyenTom" class="cd-hang"><div class="cd-hang-tx"><b>Đang đọc bảng phân quyền…</b></div></div>' +
    cdHang('Mở màn quản lý',
      'Danh sách từng người: vị trí, vai, base được xem, và app có nhận ra họ chưa.',
      '<button class="btn primary" id="cdMoQuyen">Mở phân quyền</button>');
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
