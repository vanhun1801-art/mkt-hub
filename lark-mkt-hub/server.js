'use strict';
/**
 * Siêu ứng dụng phòng Marketing — Rooty Trip Phú Quốc.
 *
 * Đây là LỚP VỎ (hub): panel bên trái liệt kê các base đang quản lý, khung bên
 * phải là app của base đó (giữ nguyên bộ tab riêng của nó). Hub tự bật các app
 * module trên máy, proxy chúng vào cùng một origin, và tự dựng trang
 * "Tổng quan chung" gom chỉ số của mọi base.
 *
 * Chạy:  node server.js      ->  http://localhost:5180
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const kids = require('./children');
const kpi = require('./kpi');
const bot = require('./bot');
const gioVN = require('./gio-vn');
const lich = require('./lichchung');
const auth = require('./auth');
const quyen = require('./quyen');
const viTri = require('./vi-tri');
const { chuyenTiep, goiJson } = require('./proxy');
const tbApp = require('./thongbao-app');
const nhomLark = require('./nhom-lark');
const nen = require('./nen');

const PUBLIC = path.join(__dirname, 'public');

/* ---------------- ai là quản lý ----------------
 * Khai bằng open_id (LARK_MANAGER_IDS) hoặc EMAIL (LARK_MANAGER_EMAILS). Nên dùng
 * email: open_id khác nhau giữa các app Lark nên đổi app là phải khai lại, còn
 * email thì không đổi. Hub quyết định rồi gửi kết luận xuống module qua header,
 * module không phải biết danh sách.
 */
function dsQuanLyId() {
  return (process.env.LARK_MANAGER_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
}
function dsQuanLyEmail() {
  return (process.env.LARK_MANAGER_EMAILS || '').split(',')
    .map((x) => x.trim().toLowerCase()).filter(Boolean);
}
function laQuanLy(nguoi) {
  if (!nguoi) return false;
  if (nguoi.id && dsQuanLyId().includes(nguoi.id)) return true;
  const mail = String(nguoi.email || '').toLowerCase();
  return !!(mail && dsQuanLyEmail().includes(mail));
}

/**
 * Quyền hiệu lực: bảng "Phân quyền app" trong Base, cộng với biến môi trường.
 * Env luôn thắng theo hướng MỞ (không ai tự khoá mình ra ngoài được nếu bảng
 * trống, sai, hay Base tạm thời lỗi).
 *
 * `base` mang BA nghĩa khác nhau, và đây là chỗ dễ nhầm nhất của cả app:
 *   null      chưa có dòng phân quyền -> chỉ thấy base mở cho CẢ PHÒNG
 *   []        có dòng mà bỏ trống     -> KHÔNG thấy base nào (trừ base cả phòng)
 *   ['a','b'] đúng hai base đó
 * cộng cờ `moiBase` (ô ghi '*') = thấy mọi base, kể cả base thêm sau này.
 *
 * Trước đây [] bị gộp thành null, nên "bỏ tick hết base" lại thành "mở hết" —
 * và base mới thêm vào panel là cả phòng thấy ngay. Giờ tách rõ ba nghĩa.
 */
async function quyenCua(nguoi) {
  const envQL = laQuanLy(nguoi);
  const mac = {
    quanLy: envQL, base: null, moiBase: false, quanLyBase: [],
    toanBo: false, xemTaiAi: [], moiXemTai: false, taoMoi: true, chiPhi: envQL,
    /* null = hub không nói gì về kênh quảng cáo. KHÔNG phải "cấm hết" — xem
     * quyen.kenhQuangCaoCua(). */
    kenhQC: null, tuBang: false,
  };
  if (!nguoi || cfg.mode !== 'api') return Object.assign(mac, { moiBase: true });
  let hang = null;
  let bang = [];
  // Base lỗi/hết hạn token: mở hết còn hơn khoá cả phòng ra ngoài, nhưng phải
  // là ĐÚNG nhánh lỗi — chưa khai dòng nào là chuyện khác, xem dưới.
  try {
    hang = await quyen.cuaNguoi(nguoi);
    bang = await quyen.docTatCa();
  } catch (e) { return Object.assign(mac, { moiBase: true, loiBang: true }); }
  const kenhQC = quyen.kenhQuangCaoCua(hang, bang);
  if (!hang) return Object.assign(mac, { kenhQC });
  return Object.assign(tuHang(hang), {
    quanLy: envQL || hang.vai === 'Quản lý',
    chiPhi: hang.chiPhi || envQL || hang.vai === 'Quản lý',
    /* Giới hạn kênh KHÔNG nới cho quản lý. Vai quản lý nói về việc được sửa cấu
     * hình, không phải về việc theo dõi kênh của ai — anh Hùng vẫn là quản lý mà
     * chỉ muốn nhìn Facebook với TikTok. Muốn xem hết thì khai `*` cho mình. */
    kenhQC,
  });
}

/** Một dòng trong bảng Phân quyền -> quyền hiệu lực (không tính env). */
function tuHang(hang) {
  return {
    quanLy: hang.vai === 'Quản lý',
    base: hang.base || [],
    moiBase: !!hang.moiBase,
    quanLyBase: hang.quanLyBase || [],
    toanBo: hang.toanBo,
    xemTaiAi: hang.xemTaiAi || [],
    moiXemTai: !!hang.moiXemTai,
    taoMoi: hang.taoMoi,
    chiPhi: hang.chiPhi,
    kenhQC: null,          // người gọi tự đặt lại; xem quyenCua()
    tuBang: true,
  };
}

/**
 * Người này có được xem base đó không. Nhận cả object module (để đọc `caPhong`)
 * lẫn id trần cho những chỗ gọi cũ.
 */
function duocXem(q, mod) {
  const m = typeof mod === 'string' ? (timMod(mod) || { id: mod, caPhong: false }) : mod;
  if (!q) return true;                          // chưa xác thực (chế độ cli)
  if (q.quanLy || q.moiBase) return true;
  if (q.base && q.base.includes(m.id)) return true;   // được cấp riêng
  if (laQLBase(q, m)) return true;              // Lead phụ trách base thì đương nhiên xem được
  return m.caPhong === true;                    // còn lại: chỉ base mở cho cả phòng
}

/**
 * Người này có phải QUẢN LÝ CỦA BASE NÀY.
 *
 * Ba đường thành quản lý của một base:
 *   1. quản lý toàn hệ (env LARK_MANAGER_* hoặc Vai = Quản lý)   -> mọi base
 *   2. ô "Quản lý base" có id base đó                            -> đúng base đó
 *   3. chạy trên máy cá nhân (chế độ cli)                        -> người ngồi máy
 *
 * Cách 2 là nấc dành cho Lead: bên TRONG app đó họ là quản lý (thấy mọi bản ghi,
 * mọi số tiền, thao tác được hết), còn lớp vỏ vẫn coi họ là nhân sự — không
 * thêm/xoá base, không sửa phân quyền, không Xem như. Cố ý hẹp: xem `chiQuanLy`.
 */
function laQLBase(q, mod) {
  if (cfg.mode !== 'api') return true;
  if (!q || !mod) return !!(q && q.quanLy);
  if (q.quanLy) return true;
  return (q.quanLyBase || []).includes(typeof mod === 'string' ? mod : mod.id);
}

/* ---------------- XEM NHƯ MỘT NHÂN SỰ ----------------
 * Quản lý bấm "Xem như" một người: cả lớp vỏ chuyển sang đúng con mắt của người
 * đó — panel chỉ còn base họ được xem, chỉ số bó theo việc của họ, chi phí ẩn nếu
 * họ không được xem. Nhờ vậy không phải mượn máy nhân sự để kiểm tra.
 *
 * Hai chốt an toàn:
 *   1. Chỉ QUẢN LÝ mới được bật (người thường gửi cookie cũng bị bỏ qua).
 *   2. Đang xem hộ thì MỌI THAO TÁC GHI bị chặn — không hành động dưới tên họ.
 */
const COOKIE_NHU = 'hub_nhu';

function docCookie(req, ten) {
  const raw = req.headers.cookie || '';
  for (const ph of raw.split(';')) {
    const [k, ...v] = ph.trim().split('=');
    if (k === ten) { try { return decodeURIComponent(v.join('=')); } catch (_) { return null; } }
  }
  return null;
}

/* Cookie này được KÝ. Trước đây nó chỉ là base64 nên ai cũng tự tạo được; lúc đó
 * chưa khai thác được vì hàm dưới chỉ được gọi sau khi đã xác nhận người thật là
 * quản lý. Nhưng an toàn nhờ "nhớ kiểm ở nơi gọi" là loại an toàn dễ vỡ: chỉ cần
 * một route mới đọc cookie này mà quên kiểm vai là thành lỗ leo thang quyền.
 * Ký rồi thì nó tự an toàn, không phụ thuộc nơi gọi nữa.
 *
 * Chạy trên máy cá nhân thì không có SESSION_SECRET -> dùng khoá ngẫu nhiên sinh
 * lúc khởi động. Hệ quả duy nhất: restart hub thì thoát chế độ xem hộ, chấp nhận
 * được vì đây vốn là trạng thái tạm 8 tiếng.
 */
const KHOA_NHU = cfg.sessionSecret || crypto.randomBytes(32).toString('hex');

function kyNhu(o) {
  const than = Buffer.from(JSON.stringify(o)).toString('base64url');
  const mac = crypto.createHmac('sha256', KHOA_NHU).update(than).digest('base64url');
  return than + '.' + mac;
}

function moNhu(token) {
  const i = String(token || '').lastIndexOf('.');
  if (i < 0) return null;
  const than = token.slice(0, i);
  const mac = Buffer.from(token.slice(i + 1));
  const that = Buffer.from(crypto.createHmac('sha256', KHOA_NHU).update(than).digest('base64url'));
  if (mac.length !== that.length || !crypto.timingSafeEqual(mac, that)) return null;
  try {
    const o = JSON.parse(Buffer.from(than, 'base64url').toString('utf8'));
    if (!o || !o.exp || Date.now() > o.exp) return null;
    return o;
  } catch (_) { return null; }
}

/** Người đang được xem hộ, hoặc null. */
function xemNhuCua(req) {
  const o = moNhu(docCookie(req, COOKIE_NHU));
  if (!o || (!o.id && !o.email)) return null;
  return { id: o.id || '', name: o.ten || o.id || o.email, email: o.email || '' };
}

/**
 * Danh tính + quyền HIỆU LỰC của request. Trả về:
 *   nguoi   - danh tính gửi xuống module (người thật, hoặc người đang xem hộ)
 *   q       - quyền hiệu lực
 *   xemNhu  - đang xem hộ ai (null nếu không)
 * Mọi route dùng chung hàm này để không có chỗ nào quên áp phân quyền.
 */
async function aiDangXem(req) {
  const that = cfg.mode === 'api' ? auth.sessionUser(req) : null;
  const qThat = await quyenCua(that);
  const laQL = qThat.quanLy || cfg.mode !== 'api';   // máy cá nhân: người ngồi máy là quản lý

  const nhu = laQL ? xemNhuCua(req) : null;
  if (!nhu) return { nguoi: that, q: qThat, xemNhu: null };

  let hang = null;
  try { hang = await quyen.cuaNguoi(nhu); } catch (_) { hang = null; }
  const q = hang
    ? Object.assign(tuHang(hang), { quanLy: false })   // xem bằng mắt nhân sự, không mang quyền quản lý
    : { quanLy: false, base: null, moiBase: false, quanLyBase: [], toanBo: false, taoMoi: true, chiPhi: false, tuBang: false };

  return { nguoi: { id: nhu.id, name: nhu.name, email: nhu.email }, q, xemNhu: nhu, quanLyThat: laQL };
}

/**
 * Chặn những thứ CHỈ quản lý được làm: bật/tắt/thêm/xoá base trong panel, xem log
 * của app con, tự kiểm tra hệ thống. Ẩn nút trên giao diện là chưa đủ — ai gõ tay
 * API cũng phải bị chặn.
 */
async function chiQuanLy(req, res) {
  if (cfg.mode !== 'api') return false;              // máy cá nhân: người ngồi máy là quản lý
  const q = await quyenCua(auth.sessionUser(req));
  if (!q.quanLy) {
    loi(res, 403, 'Chỉ quản lý được thao tác này.');
    return true;
  }
  // quản lý nhưng đang xem hộ nhân sự -> vẫn không cho ghi
  const nhu = xemNhuCua(req);
  if (nhu && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    loi(res, 403, 'Đang xem bằng mắt của ' + nhu.name + ' — thoát chế độ này rồi hãy thao tác.');
    return true;
  }
  return false;
}

/** Đang xem hộ thì chặn mọi thao tác ghi. */
function chanGhiKhiXemHo(res, xemNhu, method) {
  if (!xemNhu || method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  loi(res, 403, 'Đang xem bằng mắt của ' + xemNhu.name + ' — thoát chế độ này rồi hãy thao tác.');
  return true;
}

/* Danh tính kèm quyền để gửi xuống module. Thiếu bước gộp này thì hub tự gọi
 * /api/meta mà không nói mình là quản lý -> chỉ số trên Tổng quan bị bó vào phạm
 * vi nhân sự, lệch với con số trong chính app.
 *
 * `mod` quyết định vai: cùng một người có thể là QUẢN LÝ của base này và NHÂN SỰ
 * của base kia (ô "Quản lý base"). Nên hàm này phải biết đang gọi vào base nào —
 * bỏ `mod` là quay về vai toàn hệ, chỉ dùng cho chỗ gộp nhiều base (lịch chung).
 *
 * Quản lý của một base thì trong base đó được xem hết và xem được tiền: một Lead
 * phụ trách OTA mà không thấy doanh thu OTA thì không phụ trách được gì. */
/**
 * Danh bạ gom người từ MỌI app đang bật, không chỉ Bảng công việc.
 *
 * Đo bằng dữ liệu thật: lưới bảng nhiệt có 9 dòng, mà một dòng — người chỉ có
 * trong Lịch tác nghiệp — KHÔNG có trong danh bạ. Hậu quả kép: không thêm được
 * họ thành một dòng phân quyền, và không tick được họ trong "Xem tải của ai",
 * nên tải của họ không bao giờ cấp được cho ai. Danh bạ trước đây chỉ hỏi đúng
 * một app nên hụt đúng những người này.
 *
 * Gọi song song và bỏ qua app nào không trả lời: mấy panel dùng hàm này quản lý
 * mở thường xuyên, đừng để một app chậm làm cả màn hình treo.
 *
 * Dùng ở hai chỗ (Phân quyền, Thông báo) nên phải là MỘT hàm: sao chép lần hai
 * thì lần sau sửa một bên, bên kia im lặng hụt người.
 */
async function danhBaMoiApp(nguoi) {
  const gop = new Map();
  // giữ cả email nếu module biết: open_id khác nhau giữa các app Lark,
  // khai bằng email thì đổi app vẫn khớp
  const nap = (x) => {
    if (!x || !x.id) return;
    const cu = gop.get(x.id);
    if (!cu) gop.set(x.id, { id: x.id, ten: x.name || x.id, email: x.email || '' });
    else if (!cu.email && x.email) cu.email = x.email;
  };
  const mods = danhSach().filter((x) => x.bat && x.kieu === 'local' && x.cong);
  const metas = await Promise.all(mods.map((mod) =>
    goiJson(mod, '/api/meta', { nguoi }).catch(() => null)));
  metas.forEach((meta) => {
    if (!meta) return;
    [...(meta.people || []), ...(meta.scopePeople || [])].forEach(nap);
  });
  return [...gop.values()].sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
}

function nguoiKemQuyen(nguoi, q, mod) {
  if (!nguoi) return null;
  const ql = mod ? laQLBase(q, mod) : !!(q && q.quanLy);
  return Object.assign({}, nguoi, {
    quanLy: ql,
    toanBo: ql || !!(q && q.toanBo),
    /* Quyền hẹp "Xem tải người khác" — chỉ lichChung() đọc tới.
     *
     * PHẢI kê ở đây. Hàm này dựng object MỚI nên quyền nào không liệt kê là
     * rơi mất trên đường, mà rơi kiểu này im lặng: cột đã tick đúng người,
     * lưới vẫn chỉ hiện dòng của họ, không báo gì. Bản đầu quên đúng chỗ này.
     * Xem phép thử "đường đi của quyền" trong test/xem-tai.test.js. */
    xemTaiAi: (q && q.xemTaiAi) || [],
    moiXemTai: ql || !!(q && q.moiXemTai),
    taoMoi: ql || !q || q.taoMoi !== false,
    chiPhi: ql || !!(q && q.chiPhi),
  });
}

/* ---------------- header bảo mật ----------------
 * Đặt MỘT LẦN ở đầu mọi request thay vì rải trong từng hàm trả lời. Node gộp các
 * giá trị setHeader vào writeHead sau đó, nên cách này phủ luôn cả trang đăng nhập
 * lẫn phần proxy vào app con — không có đường nào lọt.
 *
 * frame-ancestors: hub tự nhúng iframe module cùng origin nên phải có 'self'.
 * Mở app trong Lark thì Lark có thể nhúng bằng iframe, nên cho sẵn tên miền Lark;
 * đổi được bằng HUB_FRAME_ANCESTORS nếu môi trường khác.
 */
const KHUNG_CHA = process.env.HUB_FRAME_ANCESTORS ||
  "'self' https://*.larksuite.com https://*.feishu.cn https://*.larkoffice.com";

function headerBaoMat(res) {
  res.setHeader('Content-Security-Policy', 'frame-ancestors ' + KHUNG_CHA);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // HSTS chỉ có nghĩa (và chỉ an toàn) khi thật sự chạy qua https
  if (cfg.publicUrl.startsWith('https://')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/* ---------------- HTTP tiện ích ---------------- */
function send(res, code, body, headers = {}, daNen) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  /* Nén + Content-Length nằm trong nen.traLoi, không rải ra từng chỗ gọi: `send`
   * là cửa ra của GẦN NHƯ mọi phản hồi của hub (API, trang tĩnh, trang lỗi), nên
   * vá một chỗ này là phủ hết. Chữ ký không đổi để 40 chỗ gọi giữ nguyên. */
  nen.traLoi(res, code, data, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  }, daNen);
}
const ok = (res, b) => send(res, 200, b);
const loi = (res, code, msg) => send(res, code, { error: msg });

function docBody(req) {
  return new Promise((resolve, reject) => {
    const buf = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > 1024 * 1024) { reject(new Error('Body quá lớn')); req.destroy(); return; }
      buf.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(buf).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  /* Mấy đuôi dưới đây chủ yếu để đoán kiểu cho tệp đính kèm của thông báo, thứ
   * người ta tải lên chứ không phải thứ mình viết ra. Trừ .jpg: ảnh Ma-Két của
   * trang báo hỏng (public/ma-ket-sua-loi.jpg) là file tĩnh thật. */
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

/* Bộ nhớ đệm file tĩnh: nội dung + BẢN NÉN SẴN, khoá theo đường dẫn và mtime.
 *
 * Hai cái lợi, cái thứ hai mới là chính:
 *   1. Không đọc đĩa lại cho mỗi lượt xin (readFileSync chặn vòng lặp sự kiện —
 *      mà hub còn đang proxy cho chín app trên cùng một tiến trình).
 *   2. Nén được MỘT LẦN ở mức cao nhất (brotli 11) thay vì mức vừa mỗi lượt:
 *      app.js 80 KB xuống 21 KB thay vì 24 KB, và không tốn CPU lần thứ hai.
 *
 * Khoá có mtime nên sửa file là tự hết hiệu lực — không phải nhớ xoá đệm khi
 * phát triển. Vẫn kiểm mtime mỗi lượt bằng statSync (rẻ, và đúng cả khi deploy
 * ghi đè file trong lúc tiến trình đang chạy). */
const demTinh = new Map();

function docTinh(f, laTrangChu, mtimeMs) {
  const kh = f + '|' + mtimeMs;
  const cu = demTinh.get(kh);
  if (cu) return cu;
  let body = fs.readFileSync(f);
  /* Trang chủ khai mọi file tĩnh với ?v=BUILD — thay bằng số bản thật để đổi bản
   * là trình duyệt nạp lại, không dính bản cũ trong cache. */
  if (laTrangChu) {
    body = Buffer.from(body.toString('utf8').split('v=BUILD').join('v=' + cfg.verChung), 'utf8');
  }
  const o = { body, nen: null };
  /* Chỉ giữ một bộ file trong public (10 file, ~315 KB thô). Xoá mục cũ của
   * cùng đường dẫn để sửa file nhiều lần không phình bộ nhớ. */
  for (const k of demTinh.keys()) if (k.slice(0, k.lastIndexOf('|')) === f) demTinh.delete(k);
  demTinh.set(kh, o);
  /* Nén nền: lượt xin đầu tiên vẫn nhận bản thô (nén xong chưa kịp), các lượt
   * sau lấy bản nén kỹ trong RAM. Không chặn ai chờ brotli mức 11. */
  const loai = MIME[path.extname(f)] || '';
  if (nen.nenDuoc(loai) && body.length >= nen.NGUONG) {
    Promise.all([nen.nenBuf(body, 'br', true), nen.nenBuf(body, 'gzip', true)])
      .then(([br, gz]) => { o.nen = { br, gzip: gz }; })
      .catch(() => { /* nén hỏng thì cứ gửi bản thô, không ai chết vì chuyện này */ });
  }
  return o;
}

function tinh(res, duongDan, truyVan) {
  const p = duongDan === '/' ? '/index.html' : duongDan;
  const f = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
  let st = null;
  try { st = fs.statSync(f); } catch (_) { st = null; }
  if (!f.startsWith(PUBLIC) || !st || !st.isFile()) {
    return send(res, 404, 'Không có ' + p, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  const laTrangChu = path.basename(f) === 'index.html';
  const tep = docTinh(f, laTrangChu, st.mtimeMs);
  const body = tep.body;
  /* Trang chủ KHÔNG được nằm trong cache: nó là nơi duy nhất giữ số bản của mọi
   * file khác. Trình duyệt giữ lại bản HTML cũ thì nó xin đúng những file cũ, và
   * cả cơ chế ?v= thành vô nghĩa. Các file kia thì cứ để cache thoải mái — đổi
   * file là đổi số bản, tức là đổi luôn địa chỉ, nên không bao giờ lấy nhầm bản cũ. */
  /* Chỉ file được xin KÈM số bản mới cho cache lâu: đổi file là đổi số bản,
   * tức là đổi luôn địa chỉ, nên không bao giờ lấy nhầm bản cũ. File xin trần
   * (icon.svg, hay ai đó gõ thẳng /caidat.js) thì không có gì bảo đảm, để cache
   * là lặp lại đúng chuyện hôm nay. */
  const coSoBan = /[?&]v=/.test(truyVan || '');
  send(res, 200, body, {
    'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': !laTrangChu && coSoBan ? 'public, max-age=31536000, immutable' : 'no-store',
  }, tep.nen);
}

/* Địa chỉ đưa vào href phải là http/https.
 *
 * `esc()` bên client chặn được việc thoát khỏi dấu nháy, nhưng `javascript:…`
 * thì không cần thoát khỏi dấu nháy nào cả — nó nằm gọn trong href và chạy khi
 * có người bấm. Chặn ở cửa vào là chắc nhất: dữ liệu sai không bao giờ vào tới
 * file, nên không có chỗ nào phải nhớ lọc lúc hiển thị. */
const laHttp = (s) => /^https?:\/\//i.test(String(s || ''));

/**
 * Kiểm một ô của module trước khi ghi vào modules.json. Dùng CHUNG cho cả thêm
 * mới lẫn sửa — xem chú thích ở nhánh PATCH để biết vì sao phải chung.
 * Trả { gt } nếu hợp lệ, { loi } nếu không.
 */
function kiemTruong(k, v) {
  if (k === 'mau') {
    return /^#[0-9a-f]{3,8}$/i.test(String(v || ''))
      ? { gt: String(v) }
      : { loi: 'Màu phải là mã dạng #2b5cff' };
  }
  if (k === 'larkUrl' || k === 'url') {
    // để trống là bỏ đường dẫn, hợp lệ
    if (!String(v || '').trim()) return { gt: '' };
    return laHttp(v) ? { gt: String(v) } : { loi: 'Đường dẫn phải bắt đầu bằng http:// hoặc https://' };
  }
  if (k === 'bat') return { gt: v !== false };
  if (k === 'icon') return { gt: String(v || '').slice(0, 24) };
  if (k === 'kpi') {
    return !v || kpi.BO_DOC[v] ? { gt: v ? String(v) : '' } : { loi: 'Không có bộ đọc chỉ số "' + v + '"' };
  }
  return { gt: typeof v === 'string' ? v.slice(0, 400) : v };
}

/* ---------------- danh sách module ---------------- */
function danhSach() {
  try { return cfg.docModules(); } catch (e) {
    console.error('  modules.json lỗi: ' + e.message);
    return [];
  }
}
const timMod = (id) => danhSach().find((m) => m.id === id) || null;

/* Danh bạ gom từ mọi Base — đổi rất chậm nên giữ lại 5 phút, khỏi bắt từng
 * module trả lời lại mỗi lần ai đó mở ô chọn người. */
const demDanhBa = new Map();   // khoaNguoi -> { at, ds }

/* ---------------- byte của tệp đính kèm ----------------
 * Tệp vừa tải lên thì lớp vỏ ĐANG CẦM byte trong tay. Giữ lại một bản, và mọi
 * lượt xem ảnh sau đó lấy thẳng ở đây thay vì xin lại Lark.
 *
 * Hai cái lợi, cái thứ hai mới là lý do thật:
 *   1. Nhanh — không mất một vòng gọi ra Lark cho mỗi lần popup hiện ra.
 *   2. Ảnh HIỆN ĐƯỢC kể cả khi đường tải về của Lark từ chối (đúng chuyện đang
 *      xảy ra trên bản deploy: tải lên thì được, tải về thì không).
 *
 * Bộ đệm nằm trong RAM nên mất sau mỗi lần deploy hay ngủ dậy; lúc đó lại đi
 * đường Lark như cũ. Nó là đường tắt, không phải nơi lưu trữ — chỗ lưu thật vẫn
 * là ô đính kèm trên Base.
 */
const demTep = new Map();            // file_token -> { buf, kieu, at }
const DEM_TEP_TRAN = 24 * 1024 * 1024;   // ~24 MB, đủ vài chục ảnh đã nén

/**
 * Trả một tệp cho trình duyệt, có hỗ trợ xin TỪNG ĐOẠN (HTTP Range).
 *
 * Ảnh thì tải một phát là xong, nhưng VIDEO thì không: thẻ <video> tua được là
 * nhờ xin đúng đoạn byte quanh chỗ người ta kéo tới. Máy chủ không biết trả
 * từng đoạn thì Chrome vẫn phát được từ đầu, còn kéo thanh thời gian thì đứng
 * im — trông y như hỏng.
 *
 * `Accept-Ranges` phải nói ra, nếu không trình duyệt còn chẳng buồn hỏi.
 */
function traTep(req, res, buf, kieu) {
  const chung = {
    'Content-Type': kieu || 'application/octet-stream',
    /* Tệp đính kèm không đổi nội dung theo token, nhưng là thứ riêng của phòng
     * — để `private` để proxy dọc đường không giữ lại bản sao. */
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  };
  const xin = String(req.headers.range || '');
  const khop = /^bytes=(\d*)-(\d*)$/.exec(xin);
  if (!khop) return send(res, 200, buf, chung);

  let dau = khop[1] === '' ? null : Number(khop[1]);
  let cuoi = khop[2] === '' ? null : Number(khop[2]);
  if (dau === null && cuoi === null) return send(res, 200, buf, chung);
  if (dau === null) { dau = Math.max(0, buf.length - cuoi); cuoi = buf.length - 1; }
  if (cuoi === null || cuoi >= buf.length) cuoi = buf.length - 1;
  if (dau > cuoi || dau >= buf.length) {
    return send(res, 416, '', Object.assign({}, chung,
      { 'Content-Range': 'bytes */' + buf.length }));
  }
  return send(res, 206, buf.subarray(dau, cuoi + 1), Object.assign({}, chung, {
    'Content-Range': 'bytes ' + dau + '-' + cuoi + '/' + buf.length,
  }));
}

function nhoTep(token, buf, kieu) {
  if (!token || !buf || buf.length > 20 * 1024 * 1024) return;
  demTep.set(token, { buf, kieu, at: Date.now() });
  let tong = 0;
  for (const v of demTep.values()) tong += v.buf.length;
  if (tong <= DEM_TEP_TRAN) return;
  /* Quá trần thì bỏ cái cũ nhất trước — ảnh của thông báo đang hiện bao giờ
   * cũng là ảnh vừa được xem, nên nó ở lại. */
  for (const [k] of [...demTep.entries()].sort((a, b) => a[1].at - b[1].at)) {
    tong -= demTep.get(k).buf.length;
    demTep.delete(k);
    if (tong <= DEM_TEP_TRAN) break;
  }
}

/* ---- thông báo: chỉ lưu "ai đã đọc mã nào" ---- */
const BAC_TB = { gap: 0, can: 1, tin: 2 };
const FILE_DA_DOC = path.join(__dirname, 'thong-bao.json');
const khoaNguoi = (n) => (n && (n.email || n.id)) || 'khach';

function docDaDoc() {
  try { return JSON.parse(fs.readFileSync(FILE_DA_DOC, 'utf8')); }
  catch (e) { return {}; }
}
function ghiDaDoc(o) {
  try { fs.writeFileSync(FILE_DA_DOC, JSON.stringify(o, null, 2), 'utf8'); }
  catch (e) { console.error('  [thông báo] không ghi được:', e.message); }
}

function congKhai(m) {
  return {
    id: m.id, ten: m.ten, mo_ta: m.mo_ta, icon: m.icon, mau: m.mau, kieu: m.kieu,
    cong: m.cong, url: m.kieu === 'local' ? '/m/' + m.id + '/' : m.url,
    larkUrl: m.larkUrl, kpi: m.kpi, bat: m.bat, caPhong: m.caPhong,
    caPhongTuEnv: m.caPhongTuEnv === true, coKpi: !!kpi.BO_DOC[m.kpi],
    thuMuc: m.thuMuc ? path.basename(m.thuMuc) : '',
    tinhTrang: kids.tinhTrang(m),
  };
}

/* ---------------- API ---------------- */
/* Logo dùng chung cho mọi tệp xuất của các app con. Chỉ giữ MỘT tệp: tải lên
 * bản mới là xoá bản cũ, nên không bao giờ có hai logo cùng tồn tại rồi app này
 * lấy .png còn app kia lấy .svg. */
/* Thư mục dữ liệu. HUB_DU_LIEU để bài kiểm thử trỏ sang thư mục tạm — bài
 * thử video có GHI và XOÁ tệp thật, chạy thẳng vào du-lieu/ là có ngày nó đè
 * mất video của phòng. Đã xảy ra đúng một lần, cứu được nhờ tệp nằm trong kho
 * git. Ngoài kiểm thử thì không ai đặt biến này. */
const THU_MUC_DL = process.env.HUB_DU_LIEU
  ? path.resolve(process.env.HUB_DU_LIEU)
  : path.join(__dirname, 'du-lieu');
const DUOI_LOGO = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/svg+xml': '.svg', 'image/webp': '.webp' };
const MIME_LOGO = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

function tepLogo() {
  for (const d of ['.svg', '.png', '.jpg', '.jpeg', '.webp']) {
    const duong = path.join(THU_MUC_DL, 'logo' + d);
    if (fs.existsSync(duong)) return { duong, mime: MIME_LOGO[d] };
  }
  return null;
}

/* ---------------- video giới thiệu ----------------
 * NHIỀU video, phát luân phiên. Mỗi video nằm ở một Ô đánh số 1..5 trong
 * du-lieu/; trang Tổng quan phát hết ô này sang ô kia rồi quay lại ô đầu.
 *
 * Ô 1 giữ NGUYÊN tên cũ `video-tong-quan.mp4` — video đang nằm trong kho mang
 * đúng tên đó và đã được .gitignore mở đường riêng. Đổi tên nó chỉ để cho đều
 * là tự tay tạo ra một khối 24 MB nữa trong lịch sử git mà chẳng được gì.
 * Từ ô 2 trở đi là `video-tong-quan-2.mp4`, `-3`…
 *
 * Số ô đang dùng có thể ĐỨT QUÃNG (gỡ ô 2 mà còn ô 3): dsPhim() bỏ qua ô
 * trống và trả về số ô THẬT của từng video, nên không phải dồn tệp lại — dồn
 * tệp là chép qua chép lại vài chục MB cho một việc không ai thấy.
 *
 * Ổ đĩa Render là ổ TẠM — video tải lên qua Cài đặt sẽ mất sau lần deploy kế
 * tiếp, y như logo. Muốn nó sống lâu thì đưa tệp vào kho (xem README).
 */
/* Anh Hùng: "chỗ video phát anh muốn thêm định dạng ảnh nữa thay vì chỉ có
 * định dạng video". Nên mỗi ô giờ giữ được MỘT TẤM ẢNH hoặc MỘT VIDEO; trang
 * Tổng quan chạy lẫn lộn cả hai trong cùng một vòng.
 *
 * Tên biến vẫn là *_PHIM và đường vẫn là /api/video-gt: đổi tên là phải sờ vào
 * chín chỗ ở ba tệp, mà cái tên đó có sai đâu — nó là "ô phát" của trang chủ.
 * GIF nằm trong danh sách vì nó đúng là thứ người ta hay dán vào chỗ này. */
const DUOI_PHIM = {
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
};
const MIME_PHIM = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
};
/* Thứ tự dò KHÔNG được đổi tuỳ tiện: một ô chỉ có đúng một tệp, nhưng nếu ai
 * đó tải đè mà lượt xoá hụt thì ô có hai tệp — lúc đó dò theo thứ tự này để
 * hai lần đọc cho cùng một kết quả, không hên xui. */
const DUOI_DS = ['.mp4', '.webm', '.mov', '.png', '.jpg', '.webp', '.gif'];
/* 5 ô: đủ cho một vòng banner, mà vẫn chặn được chuyện kho phình ra vô hạn —
 * mỗi video là một khối nhị phân nằm lại trong lịch sử git vĩnh viễn. */
const SO_PHIM_TOI_DA = 5;

/** Tên tệp của ô thứ i. Ô 1 không có hậu tố, để giữ nguyên tệp đang có. */
function tenPhim(i, duoi) {
  return 'video-tong-quan' + (i > 1 ? '-' + i : '') + duoi;
}

/** Video ở ô i (mặc định ô 1), hoặc null nếu ô trống. */
function tepPhim(i) {
  const o = Number(i) || 1;
  if (!(o >= 1 && o <= SO_PHIM_TOI_DA)) return null;
  for (const d of DUOI_DS) {
    const duong = path.join(THU_MUC_DL, tenPhim(o, d));
    if (fs.existsSync(duong)) {
      return { duong, mime: MIME_PHIM[d], duoi: d, i: o, anh: /^image\//.test(MIME_PHIM[d]) };
    }
  }
  return null;
}

/** Mọi video đang có, theo đúng thứ tự phát. */
function dsPhim() {
  const ra = [];
  for (let i = 1; i <= SO_PHIM_TOI_DA; i++) {
    const t = tepPhim(i);
    if (t) ra.push(t);
  }
  return ra;
}

/** Ô trống đầu tiên, hoặc 0 nếu đã đầy. */
function oTrong() {
  for (let i = 1; i <= SO_PHIM_TOI_DA; i++) if (!tepPhim(i)) return i;
  return 0;
}

/** Xoá sạch ô i — MỌI đuôi, phòng khi ô từng đổi định dạng (video sang ảnh). */
function xoaPhim(i) {
  const o = Number(i) || 1;
  for (const d of DUOI_DS) {
    const duong = path.join(THU_MUC_DL, tenPhim(o, d));
    try { if (fs.existsSync(duong)) fs.unlinkSync(duong); } catch (_) { /* khoá tệp thì thôi */ }
  }
}

function xoaLogo() {
  for (const d of ['.svg', '.png', '.jpg', '.jpeg', '.webp']) {
    const duong = path.join(THU_MUC_DL, 'logo' + d);
    try { if (fs.existsSync(duong)) fs.unlinkSync(duong); } catch (_) { /* khoá tệp thì thôi */ }
  }
}

async function api(req, res, u) {
  const p = u.pathname;
  const m = req.method;

  if (p === '/api/hub' && m === 'GET') {
    const { nguoi, q, xemNhu, quanLyThat } = await aiDangXem(req);
    return ok(res, {
      ten: cfg.ten, phu: cfg.phu, build: cfg.build, cong: cfg.port,
      che_do: cfg.mode,
      // số bản của file dùng chung — client gắn vào src iframe để không dính cache
      ver: cfg.verChung,
      // chạy trên máy cá nhân (cli) thì người ngồi trước máy chính là quản lý
      quanLy: xemNhu ? false : (q.quanLy || cfg.mode !== 'api'),
      // đang xem hộ: vẫn cho thoát chế độ này nên client cần biết mình thật là quản lý
      quanLyThat: !!(quanLyThat || q.quanLy || cfg.mode !== 'api'),
      xemNhu: xemNhu ? { ten: xemNhu.name, email: xemNhu.email || null } : null,
      toi: nguoi ? { ten: nguoi.name, email: nguoi.email || null, quanLy: q.quanLy } : null,
      // panel chỉ hiện base người này được xem
      modules: danhSach().filter((x) => duocXem(q, x))
        // quanLyToi: base này mình có vai quản lý không (Lead một base)
        .map((x) => Object.assign(congKhai(x), { quanLyToi: xemNhu ? false : laQLBase(q, x) })),
    });
  }

  /* Danh bạ chung của phòng.
   *
   * Mỗi Base chỉ biết những người từng xuất hiện trong chính nó — Lịch tác
   * nghiệp có 8 người, Bảng công việc có 35. Nhân sự đi tác nghiệp lần đầu thì
   * không tìm ra tên mình ở ô chọn người. Gom danh bạ từ mọi Base đang bật là
   * đủ dùng, mà không phải xin thêm quyền đọc danh bạ công ty trên Lark.
   *
   * Chỉ trả về tên và mã người — đúng những thứ vốn đã hiện đầy trên mọi lịch. */
  /* ==========================================================================
     THÔNG BÁO
     Lớp vỏ không tự sinh ra thông báo: nó hỏi từng Base "có gì cần báo cho
     người này không", mỗi Base suy ra từ chính dữ liệu của mình. Nhờ vậy không
     có bảng sự kiện nào phải đồng bộ, và việc xử lý xong thì thông báo tự mất.
     Lớp vỏ chỉ nhớ giúp một thứ: ai đã đọc mã nào.
     ========================================================================== */
  if (p === '/api/thong-bao' && m === 'GET') {
    const { nguoi: nguoiTB, q: qTB } = await aiDangXem(req);
    const mods = danhSach().filter((x) => x.bat && duocXem(qTB, x));
    /* SONG SONG, không nối tiếp. Mỗi app phải đọc Base của nó mới trả lời được,
     * nên nối tiếp thì chuông cộng dồn thời gian của cả chín app: đo thật 3.9
     * giây, trong khi app chậm nhất chỉ mất khoảng 1 giây. Nhịp tự nạp 2 phút
     * một lần của mọi người đang mở app đều đi qua đây.
     *
     * `danhBaMoiApp` ở ngay trên đã làm đúng cách này từ đầu — chỗ này chỉ là
     * bản chép còn sót lại kiểu cũ.
     *
     * Một Base im lặng vẫn không làm hỏng cả chuông: mỗi lời gọi tự nuốt lỗi
     * của mình, y như vòng lặp cũ. */
    const goi = await Promise.all(mods.map((mod) =>
      goiJson(mod, '/api/thong-bao', { nguoi: nguoiTB })
        .then((d) => ({ mod, d }))
        .catch(() => null)));
    const ra = [];
    for (const g of goi) {
      if (!g) continue;
      for (const it of (g.d.items || [])) {
        if (!it || !it.id) continue;
        ra.push(Object.assign({}, it, { mod: g.mod.id, modTen: g.mod.ten || g.mod.id }));
      }
    }
    const daDoc = new Set(docDaDoc()[khoaNguoi(nguoiTB)] || []);
    for (const it of ra) it.moi = !daDoc.has(it.id);
    // bac(): KHÔNG dùng "|| 9" — mức gấp nhất có bậc 0, mà 0 || 9 ra 9, thành ra
    // việc gấp nhất bị đẩy xuống cuối danh sách
    const bac = (x) => (BAC_TB[x] === undefined ? 9 : BAC_TB[x]);
    ra.sort((a, b) => (a.moi === b.moi ? 0 : a.moi ? -1 : 1) ||
      bac(a.muc) - bac(b.muc) ||
      (new Date(b.khi || 0) - new Date(a.khi || 0)));
    return ok(res, { items: ra, soMoi: ra.filter((x) => x.moi).length });
  }

  /* Đánh dấu đã đọc. Nhận đúng danh sách mã mà client đang hiển thị — không
   * "đọc hết" mù quáng, để mục vừa xuất hiện lúc đang mở bảng không bị nuốt. */
  if (p === '/api/thong-bao/doc' && m === 'POST') {
    const { nguoi: nguoiTB } = await aiDangXem(req);
    const body = await docBody(req);
    const them = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const kho = docDaDoc();
    const k = khoaNguoi(nguoiTB);
    const gop = [...new Set([...(kho[k] || []), ...them])];
    // giữ 400 mã gần nhất là quá đủ; mã cũ có quay lại thì coi như mới, không sao
    kho[k] = gop.slice(-400);
    ghiDaDoc(kho);
    return ok(res, { ok: true, da: kho[k].length });
  }

  /* Ô chọn người của app Lịch tác nghiệp gọi ngược lên đây (xem `taiDanhBa`
   * bên app đó). Dùng chung MỘT hàm `danhBaMoiApp` với màn Phân quyền và màn
   * Thông báo — bản trước chép lại vòng lặp ở đây thành bản thứ ba, và bản chép
   * đó vừa chạy NỐI TIẾP qua chín app (đo được ~2.1 giây cho một ô chọn tên)
   * vừa thiếu email mà hai màn kia có.
   *
   * Đệm mang khoá NGƯỜI XEM. Bản trước dùng chung một biến cho mọi người: ai mở
   * trước thì danh sách của người đó được phát lại cho cả phòng suốt 5 phút —
   * nhân sự chỉ thấy một base sẽ "hâm" một danh bạ cụt, rồi quản lý mở lên cũng
   * nhận đúng danh bạ cụt ấy. */
  if (p === '/api/danh-ba' && m === 'GET') {
    const { nguoi: nguoiDB } = await aiDangXem(req);
    const moi = u.searchParams.get('refresh') === '1';
    const khDB = khoaNguoi(nguoiDB);
    const cu = demDanhBa.get(khDB);
    if (!moi && cu && Date.now() - cu.at < 5 * 60000) {
      return ok(res, { nguoi: cu.ds, tuCache: true });
    }
    const ds = (await danhBaMoiApp(nguoiDB))
      .map((x) => ({ id: x.id, name: x.ten, email: x.email || '' }));
    demDanhBa.set(khDB, { at: Date.now(), ds });
    /* Trần nhỏ thôi: phòng có 35 người, giữ 50 khoá là thừa sức mà không thành
     * chỗ rò bộ nhớ cho một tiến trình chạy hàng tuần. */
    if (demDanhBa.size > 50) {
      const cuNhat = [...demDanhBa.entries()].sort((a, b) => a[1].at - b[1].at);
      for (const [k] of cuNhat.slice(0, demDanhBa.size - 50)) demDanhBa.delete(k);
    }
    return ok(res, { nguoi: ds });
  }

  if (p === '/api/tongquan' && m === 'GET') {
    const { nguoi: nguoiTQ, q: qTQ } = await aiDangXem(req);
    const mods = danhSach().filter((x) => x.bat && kpi.BO_DOC[x.kpi] && duocXem(qTQ, x));
    if (u.searchParams.get('refresh') === '1') kpi.xoaCache();
    // Khoảng lọc do client tính (nó biết múi giờ, "tháng này" theo máy người dùng)
    const ngay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
    const tu = ngay(u.searchParams.get('tu'));
    const den = ngay(u.searchParams.get('den'));
    const khoang = tu && den ? { tu, den } : null;
    // hàm chứ không phải object: vai của người này khác nhau theo từng base
    const kq = await kpi.tongQuan(mods, khoang, (mod) => nguoiKemQuyen(nguoiTQ, qTQ, mod));
    return ok(res, kq);
  }

  if (p === '/api/lich-chung' && m === 'GET') {
    const ngay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
    let tu = ngay(u.searchParams.get('tu'));
    let den = ngay(u.searchParams.get('den'));
    if (!tu || !den) {
      /* Không truyền khoảng thì lấy tháng hiện tại — lưới người × ngày phải có
       * biên. Theo giờ VN: máy chủ Render chạy UTC nên trong khoảng 00:00–06:59
       * giờ VN ngày mùng 1, bản cũ tính ra THÁNG TRƯỚC. */
      const th = gioVN.thangNay();
      tu = th.tu; den = th.den;
    }
    if (tu > den) [tu, den] = [den, tu];
    // lưới quá rộng thì vô dụng mà còn nặng — chặn ở 92 ngày
    const soNgay = Math.round((Date.parse(den) - Date.parse(tu)) / 86400000) + 1;
    if (soNgay > 92) return loi(res, 400, 'Khoảng quá rộng (' + soNgay + ' ngày) — chọn tối đa 3 tháng.');

    const { nguoi: nguoiLC, q: qLC } = await aiDangXem(req);
    const mods = danhSach().filter((x) => x.bat && lich.BO_DOC[x.kpi] && duocXem(qLC, x));
    if (u.searchParams.get('refresh') === '1') lich.xoaCache();
    return ok(res, await lich.lichChung(mods, tu, den, u.searchParams.get('refresh') === '1',
      nguoiKemQuyen(nguoiLC, qLC)));
  }

  // /api/modules/<id>/<hanhDong>
  const mm = /^\/api\/modules\/([^/]+)(?:\/(bat|tat|bat-lai|log))?$/.exec(p);
  if (mm) {
    // bật/tắt/sửa/xoá base trong panel, và cả log của app con: việc của quản lý
    if (await chiQuanLy(req, res)) return;
    const mod = timMod(decodeURIComponent(mm[1]));
    if (!mod) return loi(res, 404, 'Không có module ' + mm[1]);
    const act = mm[2];

    if (act === 'log' && m === 'GET') {
      return ok(res, { id: mod.id, logs: kids.logs(mod.id, Number(u.searchParams.get('n') || 150)) });
    }
    if (act === 'bat' && m === 'POST') { await kids.khoiDong(mod); return ok(res, congKhai(mod)); }
    if (act === 'tat' && m === 'POST') { await kids.tat(mod); return ok(res, congKhai(mod)); }
    if (act === 'bat-lai' && m === 'POST') {
      kpi.xoaCache(mod.id);
      await kids.batLai(mod);
      return ok(res, congKhai(mod));
    }

    if (!act && m === 'PATCH') {
      const body = await docBody(req);
      const tho = cfg.docModulesTho();
      const i = tho.findIndex((x) => x.id === mod.id);
      if (i < 0) return loi(res, 404, 'Không thấy trong modules.json');
      for (const k of ['ten', 'mo_ta', 'icon', 'mau', 'larkUrl', 'url', 'bat', 'kpi']) {
        if (!(k in body)) continue;
        /* Sửa phải qua đúng bộ kiểm mà lúc THÊM đã qua.
         *
         * Trước đây nhánh POST kiểm `mau` bằng biểu thức mã màu và bắt `url`
         * phải là http/https, còn nhánh PATCH thì gán thẳng — cùng một ô, hai
         * cửa, chỉ một cửa có người gác. Mà hai ô này đều chảy vào HTML:
         * `mau` vào `style="background:…"`, `larkUrl` vào `href="…"`. Thoát ký
         * tự (`esc`) chặn được chuyện phá vỡ dấu nháy, nhưng không chặn được
         * `javascript:` trong href hay `url(http://…)` nhét thêm vào style.
         *
         * Chỉ quản lý mới gọi được đường này nên đây không phải lỗ hổng leo
         * quyền — nhưng "chỉ người có quyền mới hỏng được" là lý do để bỏ qua
         * rất tệ khi bộ kiểm đã viết sẵn cách đó ba chục dòng. */
        const v = kiemTruong(k, body[k]);
        if (v.loi) return loi(res, 400, v.loi);
        tho[i][k] = v.gt;
      }
      // mở/đóng cho cả phòng: chỉ nhận đúng true/false, đừng để chuỗi "false" lọt vào
      if ('caPhong' in body) tho[i].caPhong = body.caPhong === true;
      cfg.ghiModules(tho);
      const moi = timMod(mod.id);
      if (moi && moi.bat && moi.kieu === 'local') kids.khoiDong(moi);
      if (moi && !moi.bat) kids.tat(moi);
      return ok(res, congKhai(moi || mod));
    }

    if (!act && m === 'DELETE') {
      await kids.tat(mod);
      const tho = cfg.docModulesTho().filter((x) => x.id !== mod.id);
      cfg.ghiModules(tho);
      kpi.xoaCache(mod.id);
      return ok(res, { xoa: mod.id });
    }
  }

  if (p === '/api/modules' && m === 'POST') {
    if (await chiQuanLy(req, res)) return;
    const b = await docBody(req);
    const ten = String(b.ten || '').trim();
    if (!ten) return loi(res, 400, 'Thiếu tên base');
    const kieu = ['local', 'ngoai', 'lark'].includes(b.kieu) ? b.kieu : 'ngoai';
    const id = String(b.id || '').trim() || khongDau(ten);
    if (timMod(id)) return loi(res, 400, 'Đã có module id "' + id + '"');

    if (kieu === 'local') {
      const tm = path.resolve(cfg.root, String(b.thuMuc || ''));
      if (!b.thuMuc || !fs.existsSync(tm)) return loi(res, 400, 'Không thấy thư mục: ' + tm);
      if (!fs.existsSync(path.join(tm, 'server.js'))) return loi(res, 400, 'Thư mục không có server.js');
      if (!Number(b.cong)) return loi(res, 400, 'Thiếu cổng cho module chạy trên máy');
    } else if (!String(b.url || '').startsWith('http')) {
      return loi(res, 400, 'Thiếu URL (http/https)');
    }

    /* Đường dẫn Lark cũng phải là http/https — nó chảy thẳng vào href của nút
     * "Base" trên trang chủ. Cùng bộ kiểm với nhánh PATCH, xem `kiemTruong`. */
    if (String(b.larkUrl || '').trim() && !laHttp(b.larkUrl)) {
      return loi(res, 400, 'Link Lark Base phải bắt đầu bằng http:// hoặc https://');
    }
    const moi = {
      id, ten,
      mo_ta: String(b.mo_ta || ''),
      /* Trước đây cắt còn 4 ký tự, từ thời icon là "chữ viết tắt" kiểu CV/LT/QC.
       * Từ lúc đổi sang bộ icon 2D thì đây là TÊN icon ('cong-viec', 'quang-cao'),
       * nên phép cắt đó biến 'quang-cao' thành 'quan' — base thêm mới hiện ra
       * bốn chữ cái thay vì hình. Mọi base trong modules.json đều dùng tên icon;
       * chỉ đường thêm mới là còn sót lại luật cũ. */
      icon: String(b.icon || 'base').slice(0, 24),
      mau: /^#[0-9a-f]{3,8}$/i.test(String(b.mau || '')) ? b.mau : '#3370ff',
      kieu,
      kpi: b.kpi && kpi.BO_DOC[b.kpi] ? b.kpi : '',
      larkUrl: String(b.larkUrl || '').trim(),
      bat: true,
      /* Base MỚI mặc định KÍN: chỉ quản lý và người được cấp tên mới thấy.
       * Trước đây thêm base là cả phòng thấy ngay trong panel — dựng thử một base
       * chưa xong đã có người vào xem. Mở cho cả phòng là một thao tác riêng. */
      caPhong: b.caPhong === true,
    };
    if (kieu === 'local') {
      moi.thuMuc = String(b.thuMuc);
      moi.cong = Number(b.cong);
      moi.lenh = Array.isArray(b.lenh) && b.lenh.length ? b.lenh : ['node', 'server.js'];
      if (Array.isArray(b.an)) moi.an = b.an;
      if (b.phuSelector) moi.phuSelector = String(b.phuSelector);
    } else {
      moi.url = String(b.url);
    }

    const tho = cfg.docModulesTho();
    tho.push(moi);
    cfg.ghiModules(tho);
    const mod = timMod(id);
    if (mod && mod.kieu === 'local') kids.khoiDong(mod);
    return ok(res, congKhai(mod));
  }

  /* ---------------- logo thương hiệu ----------------
   * MỘT bản logo cho cả hệ, giữ ở lớp vỏ. App con nào cần đóng logo lên tệp
   * xuất thì gọi GET /api/logo lấy về — trước đây app KPI giữ bản riêng, đổi
   * logo là phải đi sửa từng app và không ai biết app nào đang dùng bản nào.
   *
   * GET không đòi đăng nhập: đây là nhãn hiệu in trên báo cáo chứ không phải
   * dữ liệu, và app con gọi từ máy chủ sang nên không mang theo phiên nào cả.
   * Ghi thì chỉ quản lý.
   */
  if (p === '/api/logo' && (m === 'GET' || m === 'HEAD')) {
    const t = tepLogo();
    if (!t) return loi(res, 404, 'Chưa có logo');
    const buf = fs.readFileSync(t.duong);
    res.writeHead(200, {
      'Content-Type': t.mime,
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache',
    });
    return res.end(m === 'HEAD' ? undefined : buf);
  }

  if (p === '/api/logo-tin' && m === 'GET') {
    const t = tepLogo();
    if (!t) return ok(res, { co: false });
    const st = fs.statSync(t.duong);
    return ok(res, {
      co: true, ten: path.basename(t.duong), mime: t.mime,
      kb: Math.round(st.size / 1024), luc: st.mtimeMs,
    });
  }

  if (p === '/api/logo' && m === 'POST') {
    if (await chiQuanLy(req, res)) return;
    const b = await docBody(req);
    const khop = /^data:(image\/(?:png|jpeg|svg\+xml|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.anh || ''));
    if (!khop) return loi(res, 400, 'Chỉ nhận PNG · JPG · SVG · WEBP');
    const buf = Buffer.from(khop[2], 'base64');
    if (buf.length > 2 * 1024 * 1024) return loi(res, 400, 'Ảnh quá 2 MB — nén bớt rồi tải lại');
    xoaLogo();
    if (!fs.existsSync(THU_MUC_DL)) fs.mkdirSync(THU_MUC_DL, { recursive: true });
    fs.writeFileSync(path.join(THU_MUC_DL, 'logo' + DUOI_LOGO[khop[1]]), buf);
    return ok(res, { ok: true, kb: Math.round(buf.length / 1024) });
  }

  if (p === '/api/logo' && m === 'DELETE') {
    if (await chiQuanLy(req, res)) return;
    xoaLogo();
    return ok(res, { ok: true });
  }

  /* Video giới thiệu: phát trên trang Tổng quan, ai đăng nhập cũng xem được;
   * chỉ quản lý được thay. Trả TỪNG ĐOẠN qua traTep() để tua được.
   * `?i=` chọn ô; không có thì ô 1, để đường dẫn cũ vẫn chạy. */
  if (p === '/api/video-gt' && (m === 'GET' || m === 'HEAD')) {
    const t = tepPhim(u.searchParams.get('i'));
    if (!t) return loi(res, 404, 'Chưa có video giới thiệu.');
    if (m === 'HEAD') {
      return send(res, 200, '', { 'Content-Type': t.mime, 'Accept-Ranges': 'bytes' });
    }
    return traTep(req, res, fs.readFileSync(t.duong), t.mime);
  }

  if (p === '/api/video-gt-tin' && m === 'GET') {
    const ds = dsPhim().map((t) => {
      const st = fs.statSync(t.duong);
      return { i: t.i, ten: path.basename(t.duong), mb: Math.round(st.size / 104857.6) / 10,
        luc: st.mtimeMs, kieu: t.mime, anh: !!t.anh };
    });
    /* `co` và các trường của video ĐẦU nằm luôn ở gốc: bản cũ của trang Tổng
     * quan đọc thẳng `t.luc` để chống đệm, và nó có thể còn nằm trong trình
     * duyệt của ai đó chưa tải lại trang. */
    return ok(res, Object.assign({ co: ds.length > 0, tong: ds.length, toiDa: SO_PHIM_TOI_DA, ds },
      ds[0] || {}));
  }

  if (p === '/api/video-gt' && m === 'POST') {
    if (await chiQuanLy(req, res)) return;
    const kieu = String(req.headers['content-type'] || '').split(';')[0];
    if (!DUOI_PHIM[kieu]) return loi(res, 400, 'Chỉ nhận MP4 · WEBM · MOV · PNG · JPG · WEBP · GIF.');
    /* Có `?i=` là THAY đúng ô đó; không có là THÊM vào ô trống đầu tiên. Hai
     * việc khác hẳn nhau nên không để chung một đường đoán mò. */
    let o = Number(u.searchParams.get('i')) || 0;
    if (o) {
      if (!(o >= 1 && o <= SO_PHIM_TOI_DA)) return loi(res, 400, 'Ô video không hợp lệ.');
    } else {
      o = oTrong();
      if (!o) return loi(res, 409, 'Đã đủ ' + SO_PHIM_TOI_DA + ' video. Gỡ bớt một cái rồi thêm.');
    }
    const buf = await new Promise((giai, hong) => {
      const phan = [];
      let n = 0;
      req.on('data', (c) => {
        n += c.length;
        /* 60 MB: video này phát ngay trên trang chủ nên nặng hơn tệp đính kèm
         * được — nó nằm trên ổ đĩa của chính hub, không đi qua Lark. Vẫn phải
         * có trần, và chặn NGAY trong lúc nhận. */
        if (n > 60 * 1024 * 1024) { hong(new Error('Video quá 60 MB.')); req.destroy(); return; }
        phan.push(c);
      });
      req.on('end', () => giai(Buffer.concat(phan)));
      req.on('error', hong);
    }).catch((e) => e);
    if (buf instanceof Error) return loi(res, 400, buf.message);
    if (!buf.length) return loi(res, 400, 'Tệp rỗng.');
    /* Xoá ô trước khi ghi: ô cũ có thể đang giữ đuôi khác (.webm) — không xoá
     * thì hai tệp cùng ô cùng tồn tại và tepPhim() trả về cái cũ. */
    xoaPhim(o);
    if (!fs.existsSync(THU_MUC_DL)) fs.mkdirSync(THU_MUC_DL, { recursive: true });
    fs.writeFileSync(path.join(THU_MUC_DL, tenPhim(o, DUOI_PHIM[kieu])), buf);
    return ok(res, { ok: true, i: o, mb: Math.round(buf.length / 104857.6) / 10 });
  }

  if (p === '/api/video-gt' && m === 'DELETE') {
    if (await chiQuanLy(req, res)) return;
    /* Bắt buộc nói rõ ô nào. Trước đây DELETE trống nghĩa là "gỡ video" vì chỉ
     * có một cái; giờ có nhiều thì nghĩa đó thành "xoá sạch" — một cú bấm nhầm
     * là mất cả bộ. Thà báo lỗi. */
    const o = Number(u.searchParams.get('i')) || 0;
    if (!(o >= 1 && o <= SO_PHIM_TOI_DA)) return loi(res, 400, 'Thiếu ?i= — cần nói rõ gỡ video nào.');
    xoaPhim(o);
    return ok(res, { ok: true, i: o });
  }

  /* Bảng tin trên trang Tổng quan: những thông báo CÒN HIỆU LỰC của người đang
   * xem — kể cả cái họ đã bấm "Tôi đã đọc".
   *
   * Khác hẳn /api/tb-app: đường kia trả những cái CÒN PHẢI ĐỌC để chặn màn
   * hình, đọc xong là biến mất. Bảng tin thì để xem lại, nên đọc rồi vẫn còn —
   * chỉ đánh dấu "đã đọc" để phân biệt cái mới. */
  if (p === '/api/tb-app/tin' && m === 'GET') {
    const { nguoi: nguoiTin, xemNhu: nhuTin } = await aiDangXem(req);
    const id = (nguoiTin && nguoiTin.id) || '';
    let ds = [];
    let loiBang = '';
    try {
      const het = await tbApp.docTatCa();
      /* Máy cá nhân KHÔNG có danh tính phiên (xem aiDangXem), nên lọc theo người
       * nhận sẽ ra rỗng. Bảng tin thì chỉ ĐỌC — không chặn màn hình, không ghi
       * xác nhận của ai — nên ở chế độ cli cứ hiện mọi thông báo còn hiệu lực:
       * người ngồi máy đó chính là người soạn chúng. (Popup chặn màn hình vẫn
       * tắt ở chế độ cli, lý do ở /api/tb-app.) */
      ds = cfg.mode === 'api'
        ? het.filter((tb) => tbApp.dangHieuLuc(tb, id))
        : het.filter((tb) => tbApp.dangHieuLuc(Object.assign({}, tb, { moiAi: true }), id));
    } catch (e) { loiBang = e.message; }
    const bac = { 'Gấp': 0, 'Quan trọng': 1, 'Tin': 2 };
    return ok(res, {
      xemNhu: !!nhuTin,
      loiBang,
      ds: ds
        .sort((a, b) => (bac[a.mucDo] - bac[b.mucDo]) || (b.tuNgay - a.tuNgay))
        .slice(0, 20)
        .map((tb) => ({
          recordId: tb.recordId, tieuDe: tb.tieuDe, noiDung: tb.noiDung, mucDo: tb.mucDo,
          nhanNut: tb.nhanNut, lienKet: tb.lienKet, tuNgay: tb.tuNgay, denNgay: tb.denNgay,
          tep: tb.tep || [],
          daDoc: tbApp.daXacNhan(tb, id),
        })),
    });
  }

  if (p === '/api/toi' && m === 'GET') {
    /* open_id của một người KHÁC NHAU giữa các app Lark. Đổi app là danh sách
     * LARK_MANAGER_IDS cũ không còn khớp -> quản lý bị tụt xuống vai nhân sự.
     * Endpoint này để lấy đúng open_id dưới app đang chạy. */
    const nguoi = cfg.mode === 'api' ? auth.sessionUser(req) : null;
    return ok(res, {
      che_do: cfg.mode,
      id: nguoi ? nguoi.id : null,
      ten: nguoi ? nguoi.name : null,
      email: nguoi ? (nguoi.email || null) : null,
      email_phu: nguoi ? (nguoi.emailPhu || null) : null,
      la_quan_ly: laQuanLy(nguoi),
      // app_id KHÔNG phải bí mật (nó nằm trong URL Developer Console) — hiện ra để
      // đối chiếu: app đang phát hành bên Lark có đúng là app hub đang chạy không
      app_id: cfg.appId || '',
      so_quan_ly_dang_khai: dsQuanLyId().length + dsQuanLyEmail().length,
    });
  }

  /* Tự kiểm tra hệ thống: hỏi từng module xem nó thấy gì DƯỚI DANH TÍNH của người
   * đang đăng nhập. Thiếu số liệu trên server chung hầu như luôn là quyền, và ba
   * mã lỗi dưới đây nói rõ thiếu ở đâu: 99991672 (thiếu scope, hoặc chưa publish),
   * 91403 (chưa chia sẻ Base cho app), 20029 (redirect URL chưa khai). */
  if (p === '/api/kiem-tra' && m === 'GET') {
    if (await chiQuanLy(req, res)) return;   // trang tự kiểm tra: chỉ quản lý
    const nguoi = cfg.mode === 'api' ? auth.sessionUser(req) : null;
    if (nguoi) nguoi.quanLy = laQuanLy(nguoi);
    const hostThat = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    let hostKhai = '';
    try { hostKhai = new URL(cfg.publicUrl).host; } catch (_) {}

    /* Hỏi app CÁI NÓ CÓ.
     *
     * Bản trước bắt mọi app phải có cả `/api/meta` lẫn `/api/tasks` — hình dạng
     * của app đầu tiên (Bảng công việc). Sáu app viết sau không có `/api/tasks`
     * (Social còn không có `/api/meta`), nên màn này báo ĐỎ "Lỗi · Không có
     * đường /api/tasks" cho sáu app đang chạy hoàn toàn bình thường.
     *
     * Đó là lỗi nặng hơn nó trông: màn tự kiểm tra mà báo sai thì lần sau có
     * app hỏng thật, không ai tin màu đỏ nữa.
     *
     * Giờ: cổng sống là ĐẠT. `/api/meta` chỉ là phần cộng thêm — app nào có thì
     * đọc được tên người, vai, số bản ghi; app nào không khai thì ghi "app
     * không khai /api/meta", KHÔNG phải lỗi. Chỉ app nào TRẢ LỖI THẬT (không
     * phải 404) mới đỏ. */
    const mods = danhSach().filter((x) => x.bat && x.kieu === 'local');
    const ket = await Promise.all(mods.map(async (mod) => {
      const o = { id: mod.id, ten: mod.ten, trangThai: kids.tinhTrang(mod).trangThai };
      o.song = await kids.songKhong(mod.cong, 2500);
      if (!o.song) {
        o.loi = 'Cổng ' + mod.cong + ' không trả lời — app đang tắt hay chết lúc khởi động? Xem Log app con.';
        return o;
      }

      /* 404 = app không khai đường này. Mọi mã khác = app trả lời nhưng hỏng,
       * và cái đó mới đáng báo đỏ. */
      const thu = async (duong) => {
        try { return { co: true, d: await goiJson(mod, duong, { nguoi }) }; }
        catch (e) { return { co: false, thieu: e.http === 404, loi: e.message }; }
      };

      const m = await thu('/api/meta');
      if (!m.co) {
        if (m.thieu) o.ghi = 'app không khai /api/meta — chỉ kiểm tra được cổng';
        else o.loi = m.loi;
        return o;
      }
      const meta = m.d || {};
      o.nguoi = meta.me ? meta.me.name : null;
      o.vai = (meta.role === 'manager' || meta.manager) ? 'quản lý' : 'nhân sự';
      if ((meta.people || []).length) o.danhBa = meta.people.length;
      if ((meta.scopePeople || []).length) o.phamVi = meta.scopePeople.length;
      if (meta.counts) { o.dem = meta.counts; o.tong = meta.counts.daily; }
      /* Mỗi app đặt tên cho "số bản ghi của mình" một kiểu — đọc thật từng app
       * rồi kê ra đây, chứ không ép chín app phải giống nhau chỉ để màn này đếm
       * được. App nào không có khoá nào trong danh sách thì màn hình ghi "đang
       * chạy", đúng bằng thứ biết chắc. */
      for (const k of ['items', 'tours', 'records', 'rows', 'soBooking']) {
        const v = meta[k];
        const n = Array.isArray(v) ? v.length : (typeof v === 'number' ? v : null);
        if (n != null) { o.tong = n; break; }
      }

      /* Chỉ app nào thật sự có mới hỏi — hỏi rồi bỏ qua 404 cũng được, nhưng
       * mỗi lần hỏi là một vòng mạng, mà màn này hỏi chín app một lúc. */
      const t = await thu('/api/tasks');
      if (t.co) o.tong = (t.d.tasks || []).length;
      else if (!t.thieu) o.loi = t.loi;
      if (o.tong == null && !o.loi) o.ghi = 'đọc được /api/meta · app không báo số bản ghi';
      return o;
    }));

    return ok(res, {
      hub: {
        che_do: cfg.mode,
        commit: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || null,
        toi: nguoi ? { id: nguoi.id, ten: nguoi.name, email: nguoi.email || null } : null,
        la_quan_ly: laQuanLy(nguoi),
        app_id: cfg.appId || '',
        so_quan_ly_dang_khai: dsQuanLyId().length + dsQuanLyEmail().length,
        public_url: cfg.publicUrl || null,
        host_that: hostThat,
        public_url_khop: !hostKhai || !hostThat || hostKhai.toLowerCase() === hostThat.toLowerCase(),
        co_session_secret: !!cfg.sessionSecret,
      },
      modules: ket,
    });
  }

  /* ---------------- phân quyền thành viên (chỉ quản lý) ---------------- */
  if (p === '/api/quyen') {
    const nguoi = cfg.mode === 'api' ? auth.sessionUser(req) : null;
    const q = await quyenCua(nguoi);
    if (cfg.mode === 'api' && !q.quanLy) return loi(res, 403, 'Chỉ quản lý xem được phân quyền.');

    if (m === 'GET') {
      let hang = [];
      let loiBang = '';
      try { hang = await quyen.docTatCa(u.searchParams.get('refresh') === '1'); }
      catch (e) { loiBang = e.message; }

      const danhBa = await danhBaMoiApp(nguoi);

      /* ĐỐI CHIẾU với danh bạ thật: dòng khai bằng tay rất dễ lệch (tên trong Lark
       * là "Hân Phù MKT" mà khai "Phù Mỹ Hân", email đoán sai) — lệch là app không
       * nhận ra người đó và họ rơi về mặc định THẤY MỌI BASE. Trả về kết quả đối
       * chiếu để màn hình nói thẳng "đã khớp ai" hay "chưa khớp ai". */
      const chuanTen = (x) => String(x || '').trim().toLowerCase().replace(/s+/g, ' ');
      hang = hang.map((h) => {
        const mail = String(h.email || '').toLowerCase();
        const theoMail = mail && danhBa.find((x) => String(x.email || '').toLowerCase() === mail);
        const theoId = h.openId && danhBa.find((x) => x.id === h.openId);
        const cungTen = danhBa.filter((x) => chuanTen(x.ten) === chuanTen(h.nguoi));
        const theoTen = cungTen.length === 1 ? cungTen[0] : null;
        const ai = theoMail || theoId || theoTen || null;
        return Object.assign({}, h, {
          khop: ai ? {
            id: ai.id, ten: ai.ten,
            cach: theoMail ? 'email' : theoId ? 'open_id' : 'ten',
          } : null,
          trungTen: cungTen.length > 1 ? cungTen.length : 0,
        });
      });

      return ok(res, {
        base: danhSach().filter((x) => x.bat).map((x) => ({ id: x.id, ten: x.ten, caPhong: x.caPhong })),
        // mẫu quyền theo vị trí công việc: chọn vị trí là các ô tự tick theo mẫu
        viTri: viTri.docDanhSach(),
        hang, danhBa, loiBang,
        // cột thiếu -> panel cảnh báo; xem chú thích ở quyen.cotThieu()
        thieuCot: await quyen.cotThieu(),
        // kiểu cột đi kèm: panel phải chỉ ĐÚNG kiểu, xem quyen.KIEU_COT
        kieuCot: quyen.KIEU_COT,
        larkUrl: quyen.larkUrl,
        env_quan_ly: dsQuanLyEmail().concat(dsQuanLyId()),
      });
    }

    if (m === 'POST') {
      const b = await docBody(req);
      if (!b || (!b.email && !b.openId)) return loi(res, 400, 'Phải có email hoặc open_id để nhận diện người này.');
      const id = await quyen.ghi(b);
      /* Hai bộ đệm này giữ dữ liệu ĐÃ LỌC theo quyền, nên đổi quyền mà không
       * xoá thì người vừa được cấp vẫn thấy y như cũ tới khi đệm hết hạn —
       * cấp quyền sẽ trông như không chạy. */
      lich.xoaCache();
      kpi.xoaCache();
      return ok(res, { recordId: id });
    }

    if (m === 'DELETE') {
      const rec = u.searchParams.get('recordId');
      if (!rec) return loi(res, 400, 'Thiếu recordId');
      await quyen.xoa(rec);
      lich.xoaCache();
      kpi.xoaCache();
      return ok(res, { xoa: rec });
    }
  }

  /* ---------------- khung giờ đăng ký của app Lịch ----------------
   * Hub KHÔNG giữ luật — nó gọi thẳng API của app con. Một nơi giữ luật thì hai
   * màn hình (hub và app Lịch) không thể lệch nhau; giữ bản sao ở hub là sớm
   * muộn có người sửa một bên rồi bên kia nói khác.
   */
  if (p === '/api/lich-cua-so') {
    const modCS = timMod('lich-tac-nghiep');
    if (!modCS || !modCS.bat) return loi(res, 404, 'App Lịch tác nghiệp đang không chạy.');

    if (m === 'GET') {
      const { nguoi: nguoiCS, q: qCS } = await aiDangXem(req);
      try {
        return ok(res, await goiJson(modCS, '/api/cua-so',
          { nguoi: nguoiKemQuyen(nguoiCS, qCS, modCS) }));
      } catch (e) {
        return loi(res, 502, e.message);
      }
    }

    if (m === 'POST') {
      if (await chiQuanLy(req, res)) return;
      const b = await docBody(req);
      const MOT_GIO = 3600000;
      /* Hai loại yêu cầu, cùng một đường ghi:
       *
       *   viec — ba hành động tức thì. Mỗi cái ghi CẢ hai ô ngoại lệ nên không
       *          bao giờ còn hai ngoại lệ cùng sống.
       *   luat — sửa khung giờ hằng tuần (bật/tắt, thứ + giờ).
       *
       * Gộp vào một đầu mối vì cả hai đều là "sửa cùng một dòng trên Base";
       * tách đôi thì hai đường phải cùng biết cách gọi app con và cùng phải nhớ
       * xoá đệm — sớm muộn một bên quên. */
      let than = b.viec === 'mo' ? { moTayToi: Date.now() + MOT_GIO, dongTayToi: 0 }
        : b.viec === 'dong' ? { dongTayToi: Date.now() + MOT_GIO, moTayToi: 0 }
        : b.viec === 'bo' ? { moTayToi: 0, dongTayToi: 0 }
        : null;
      if (!than && b.luat) {
        /* Chuyển tiếp ĐÚNG những ô app con biết. Bê nguyên body xuống thì hub
         * thành một lỗ hổng: ai gõ tay API là ghi được ô bất kỳ. */
        than = {};
        for (const k of ['bat', 'moThu', 'moGio', 'dongThu', 'dongGio', 'ghiChu']) {
          if (b.luat[k] != null) than[k] = b.luat[k];
        }
        if (!Object.keys(than).length) than = null;
      }
      if (!than) return loi(res, 400, 'Cần `viec` (mo/dong/bo) hoặc `luat` để sửa.');
      const { nguoi: nguoiCS, q: qCS } = await aiDangXem(req);
      try {
        return ok(res, await goiJson(modCS, '/api/cua-so', {
          method: 'PATCH', body: than,
          nguoi: nguoiKemQuyen(nguoiCS, qCS, modCS),
        }));
      } catch (e) {
        /* App con từ chối vì dữ liệu sai (giờ "25:99") thì trả lại ĐÚNG mã của
         * nó. Gói hết thành 502 là nói dối: 502 nghĩa "app con hỏng", còn đây
         * là "anh gõ sai" — hai chuyện phải xử lý khác nhau. */
        return loi(res, e.http && e.http < 500 ? e.http : 502, e.message);
      }
    }
  }

  /* ---------------- thông báo chặn màn hình ----------------
   * Quản lý gửi một câu, người nhận buộc phải đọc mới dùng app tiếp được.
   * Luật "ai thấy cái gì, còn hiệu lực không" nằm ở thongbao-app.js.
   */
  /* ---------------- tệp đính kèm của thông báo ----------------
   * Tệp KHÔNG đi thẳng từ trình duyệt sang Lark: đi qua đây. Ba lý do, mỗi lý
   * do một mình đã đủ:
   *   · khoá app chỉ có ở máy chủ, không được lộ ra trình duyệt;
   *   · chặn được cỡ tệp và ai được tải lên (chỉ quản lý);
   *   · người NHẬN thông báo xem được ảnh mà không cần quyền gì trên Base.
   */
  if (p === '/api/tb-app/tep' && m === 'POST') {
    if (await chiQuanLy(req, res)) return;
    const recordId = u.searchParams.get('recordId') || '';
    /* Tên tệp đi qua header nên phải mã hoá: tên tiếng Việt có dấu mà nhét
     * thẳng vào header là Node ném lỗi "Invalid character in header". */
    let ten = 'tep';
    try { ten = Buffer.from(String(req.headers['x-ten-tep'] || ''), 'base64').toString('utf8') || 'tep'; }
    catch (_) {}
    const kieu = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
    if (!recordId) return loi(res, 400, 'Thiếu recordId — lưu thông báo trước rồi mới đính kèm.');

    const buf = await new Promise((giai, hong) => {
      const phan = [];
      let n = 0;
      req.on('data', (c) => {
        n += c.length;
        /* 20 MB: vừa đủ một clip ngắn, và cũng là trần của một lượt tải lên
         * Lark (tệp to hơn phải cắt khúc — một việc khác hẳn, chưa làm).
         * Chặn NGAY trong lúc nhận, không đợi nhận hết rồi mới đo: tệp lỡ tay
         * không được phép kéo sập tiến trình. */
        if (n > 20 * 1024 * 1024) { hong(new Error('Tệp quá 20 MB.')); req.destroy(); return; }
        phan.push(c);
      });
      req.on('end', () => giai(Buffer.concat(phan)));
      req.on('error', hong);
    }).catch((e) => e);
    if (buf instanceof Error) return loi(res, 400, buf.message);
    if (!buf.length) return loi(res, 400, 'Tệp rỗng.');

    try {
      const token = await tbApp.dinhTep(recordId, { ten, kieu, buf });
      nhoTep(token, buf, kieu);
      return ok(res, { token, ten, kieu, co: buf.length });
    } catch (e) {
      return loi(res, 400, e.message);
    }
  }

  if (p === '/api/tb-app/go-tep' && m === 'POST') {
    if (await chiQuanLy(req, res)) return;
    const b = await docBody(req);
    try { return ok(res, { tep: await tbApp.goTep(b.recordId, b.token) }); }
    catch (e) { return loi(res, 400, e.message); }
  }

  /* Phát lại tệp cho trình duyệt. AI CŨNG xem được — nhưng phải biết đúng cặp
   * (recordId, token), mà cặp đó chỉ đi xuống máy người NHẬN thông báo đó. */
  if (p.startsWith('/api/tb-app/tep/') && m === 'GET') {
    const phan = p.slice('/api/tb-app/tep/'.length).split('/');
    const recordId = decodeURIComponent(phan[0] || '');
    const token = decodeURIComponent(phan[1] || '');
    if (!recordId || !token) return loi(res, 400, 'Thiếu recordId hoặc token.');

    /* Có sẵn trong bộ đệm thì phát luôn — nhanh hơn, và không phụ thuộc đường
     * tải về của Lark. */
    const sanCo = demTep.get(token);
    if (sanCo) {
      sanCo.at = Date.now();
      return traTep(req, res, sanCo.buf, sanCo.kieu);
    }

    try {
      const t = await tbApp.taiTep(recordId, token);
      /* Kiểu tệp: đường cli không báo kiểu, mà ô trên Base cũng hay để trống.
       * Đoán theo ĐUÔI TÊN là đủ và đúng ở đây — trả octet-stream cho một tấm
       * PNG thì thẻ <img> của popup tuỳ trình duyệt mà hiện hay không. */
      let kieu = t.kieu || '';
      if (!kieu || kieu === 'application/octet-stream') {
        const ds = await tbApp.docTatCa().catch(() => []);
        const dong = ds.find((x) => x.recordId === recordId);
        const ten = ((dong && (dong.tep || []).find((x) => x.token === token)) || {}).ten || t.ten || '';
        const duoi = String(ten).toLowerCase().replace(/^.*(\.[a-z0-9]+)$/, '$1');
        kieu = ((dong && (dong.tep || []).find((x) => x.token === token)) || {}).kieu ||
          MIME[duoi] || kieu || 'application/octet-stream';
      }
      nhoTep(token, t.buf, kieu);
      return traTep(req, res, t.buf, kieu);
    } catch (e) {
      return loi(res, 400, e.message);
    }
  }

  if (p === '/api/tb-app') {
    /* Danh sách CÒN PHẢI ĐỌC của chính người đang xem.
     *
     * Cắt ở máy chủ: cái này che màn hình người ta, nên nội dung thông báo gửi
     * cho người khác không được lọt xuống máy họ rồi mới ẩn bằng CSS.
     *
     * Đang "Xem như" thì trả rỗng. Quản lý soát giao diện nhân sự mà bị một
     * popup chặn màn hình, rồi bấm "Tôi đã đọc" là xác nhận HỘ người ta — mất
     * luôn bằng chứng ai đã đọc lúc nào. */
    if (m === 'GET') {
      /* Máy cá nhân (chế độ cli) KHÔNG bị chặn. Đây là cái bẫy đã đo được:
       * chế độ cli cố ý không có danh tính phiên (xem aiDangXem), nên một thông
       * báo "cả phòng" vẫn hiện ra — mà đường xác nhận lại đòi id từ phiên và
       * trả 401. Popup hiện lên và KHÔNG BAO GIỜ đóng được, khoá luôn hub trên
       * máy của chính người gửi.
       *
       * Chặn ở đây thay vì nới đường xác nhận: máy cá nhân là máy của quản lý —
       * người GỬI thông báo — không có lý gì chặn họ bằng câu họ vừa viết. Muốn
       * xem trước thì dùng nút "Xem thử" trong Cài đặt. */
      if (cfg.mode !== 'api') return ok(res, { ds: [], cuBo: 'cli' });
      const { nguoi: nguoiTB, xemNhu: nhuTB } = await aiDangXem(req);
      if (nhuTB) return ok(res, { ds: [], xemNhu: true });
      let ds = [];
      let loiBang = '';
      try { ds = await tbApp.cuaNguoi(nguoiTB, u.searchParams.get('refresh') === '1'); }
      catch (e) { loiBang = e.message; }
      return ok(res, { ds, loiBang });
    }

    /* Xác nhận đã đọc. Người xác nhận lấy từ PHIÊN, không nhận từ client:
     * nhận theo client thì gõ tay một open_id khác là xác nhận hộ người ta. */
    if (m === 'POST') {
      const { nguoi: nguoiTB, xemNhu: nhuTB } = await aiDangXem(req);
      if (nhuTB) return loi(res, 403, 'Đang xem giao diện của người khác — không xác nhận thay họ được.');
      if (!nguoiTB || !nguoiTB.id) return loi(res, 401, 'Chưa nhận ra bạn là ai.');
      const b = await docBody(req);
      if (!b.recordId) return loi(res, 400, 'Thiếu recordId');
      try {
        const kq = await tbApp.xacNhan(b.recordId, nguoiTB.id);
        return ok(res, kq);
      } catch (e) {
        return loi(res, 400, e.message);
      }
    }
  }

  /* Soạn / sửa / xoá thông báo, và xem ai đã đọc — chỉ quản lý. */
  if (p === '/api/tb-app/quan-ly') {
    if (await chiQuanLy(req, res)) return;

    if (m === 'GET') {
      const { nguoi: nguoiQL } = await aiDangXem(req);
      let ds = [];
      let loiBang = '';
      try { ds = await tbApp.docTatCa(u.searchParams.get('refresh') === '1'); }
      catch (e) { loiBang = e.message; }
      /* Map không đi qua JSON được — đổi "đã đọc" thành danh sách để panel vẽ
       * được "ai đọc lúc nào" mà không phải đọc lại Base lần nữa. */
      const danhBa = await danhBaMoiApp(nguoiQL).catch(() => []);
      const ten = new Map(danhBa.map((x) => [x.id, x.ten]));

      /* Ai thuộc phòng MKT — để form soạn tick sẵn đúng những người đó.
       *
       * Khớp Ở ĐÂY chứ không đẩy hai danh sách xuống trình duyệt rồi so bên đó:
       * luật khớp (theo id, lùi về tên, xử trùng tên) là chỗ dễ sai và phải
       * thử được bằng `node test/nhom-mkt.test.js`. Trình duyệt chỉ nhận một
       * mảng id đã chốt. */
      const nhom = await nhomLark.thanhVien(u.searchParams.get('refresh') === '1')
        .catch((e) => ({ nhom: 'Phòng MKT', nguoi: [], nguon: '', luc: 0, loi: e.message }));
      const khop = nhomLark.khopDanhBa(danhBa, nhom.nguoi);

      return ok(res, {
        ds: ds.map((tb) => Object.assign({}, tb, {
          daDoc: [...tb.daDoc.entries()].map(([id, luc]) => ({ id, ten: ten.get(id) || id, luc })),
        })),
        danhBa,
        /* Người trong nhóm chat "Phòng MKT". `ids` là để tick sẵn; `thieu` là
         * người ở trong nhóm mà hub chưa thấy trong app nào — họ KHÔNG có ô để
         * tick, nên phải nói ra thay vì lặng lẽ bỏ sót. */
        nhomMkt: {
          ten: nhom.nhom, nguon: nhom.nguon, luc: nhom.luc, loi: nhom.loi,
          soNguoi: nhom.nguoi.length,
          ids: khop.ids, thieu: khop.thieu, trungTen: khop.trungTen,
        },
        loiBang,
        coBang: tbApp.coBang(),
        thieuCot: await tbApp.cotThieu(),
        larkUrl: tbApp.larkUrl(),
        mucDo: tbApp.MUC_DO,
        /* Máy cá nhân đọc danh bạ qua phiên lark-cli, bản deploy đọc qua app
         * Marketing Hub — open_id cấp theo TỪNG app nên hai bên ra hai chuỗi
         * khác nhau cho cùng một người. Soạn ở máy cá nhân là tick đúng tên,
         * lưu thành công, và không ai nhận được gì. Nói ra để panel cảnh báo. */
        cheDo: cfg.mode,
      });
    }

    if (m === 'POST') {
      const b = await docBody(req);
      if (!String(b.tieuDe || '').trim() && !String(b.noiDung || '').trim()) {
        return loi(res, 400, 'Thông báo phải có tiêu đề hoặc nội dung.');
      }
      /* Không gửi cho ai thì popup không bao giờ hiện — chặn ở đây, không để
       * quản lý soạn xong tưởng đã gửi. */
      if (!b.moiAi && !((b.ai || []).length)) {
        return loi(res, 400, 'Chưa chọn người nhận. Tick "Cả phòng" hoặc chọn ít nhất một người.');
      }
      try {
        const id = await tbApp.luu(b);
        return ok(res, { recordId: id });
      } catch (e) {
        return loi(res, 400, e.message);
      }
    }

    if (m === 'DELETE') {
      const rec = u.searchParams.get('recordId');
      if (!rec) return loi(res, 400, 'Thiếu recordId');
      try {
        await tbApp.xoa(rec);
        return ok(res, { xoa: rec });
      } catch (e) {
        return loi(res, 400, e.message);
      }
    }
  }

  /* ---------------- cửa sổ xử lý nhanh ----------------
   * Bấm một thẻ số ở Tổng quan -> mở danh sách bản ghi sau thẻ đó và làm luôn
   * vài việc thường gặp, không phải nhảy sang app.
   */
  if (p === '/api/o' && m === 'GET') {
    const { nguoi: nguoiO, q: qO, xemNhu: nhuO } = await aiDangXem(req);
    const mod = timMod(u.searchParams.get('mod') || '');
    if (!mod || !mod.bat) return loi(res, 404, 'Không có base này trong panel');
    if (!duocXem(qO, mod)) return loi(res, 403, 'Bạn không được xem base này');

    const ngay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
    const tu = ngay(u.searchParams.get('tu'));
    const den = ngay(u.searchParams.get('den'));
    const khoaNhom = u.searchParams.get('khoa') || '';
    let ds;
    try {
      ds = await kpi.nhomCua(mod, khoaNhom, tu && den ? { tu, den } : null, nguoiKemQuyen(nguoiO, qO, mod));
    } catch (e) { return loi(res, 400, e.message); }

    /* Danh bạ để phân công / chốt nhân sự ngay trong cửa sổ. Lấy từ chính module
     * nên luôn là người có thật trong base đó. */
    let nhanSu = [];
    if (mod.kpi === 'cong-viec' || mod.kpi === 'lich-tac-nghiep') {
      try {
        const meta = await goiJson(mod, '/api/meta', { nguoi: nguoiKemQuyen(nguoiO, qO, mod) });
        nhanSu = (meta.people || []).map((x) => ({ id: x.id, ten: x.name || x.id }));
      } catch (_) { /* thiếu danh bạ thì chỉ mất nút phân công */ }
    }

    return ok(res, {
      mod: mod.id, ten: mod.ten, kpi: mod.kpi, khoa: khoaNhom,
      // nút thao tác trong cửa sổ: Lead của base này cũng được, không chỉ quản lý tổng
      quanLy: nhuO ? false : laQLBase(qO, mod),
      xemNhu: nhuO ? nhuO.name : null,
      ds, nhanSu,
    });
  }

  /* Bảng hành động cho phép làm từ cửa sổ nhanh. Danh sách trắng: hub không cho
   * gọi tuỳ ý API của module, và module vẫn tự kiểm quyền lần nữa. */
  function goiHanhDong(mod, id, act, v) {
    if (mod.kpi === 'cong-viec') {
      const bulk = (patch) => ({ duong: '/api/tasks/bulk', method: 'PATCH', body: { ids: [id], patch } });
      if (act === 'bat-dau') return { duong: '/api/tasks/' + id + '/start', method: 'POST', body: {} };
      /* Ô nhập của cửa sổ nhanh gửi giá trị dạng chuỗi; chỗ khác có thể gửi {link}. */
      const nopLink = () => {
        const l = typeof v === 'string' ? v : v && v.link;
        return l ? { link: String(l) } : {};
      };
      if (act === 'hoan-thanh') return { duong: '/api/tasks/' + id + '/complete', method: 'POST', body: nopLink() };
      // việc đã trễ: nộp sản phẩm nhưng KHÔNG đổi trạng thái (giữ dấu trễ)
      if (act === 'giai-quyet') return { duong: '/api/tasks/' + id + '/giai-quyet', method: 'POST', body: nopLink() };
      if (act === 'phan-cong') return bulk({ owner: [String(v)] });
      /* Ô chọn ngày chỉ cho ra YYYY-MM-DD. Để nguyên thì module quy về 00:00 —
       * tức việc "hạn hôm nay" thành quá hạn ngay lúc đặt. Hạn là HẾT ngày đó. */
      if (act === 'dat-han') {
        const ng = String(v || '');
        return bulk({ deadline: /^\d{4}-\d{2}-\d{2}$/.test(ng) ? ng + 'T23:59:00' : ng });
      }
      if (act === 'trang-thai') return bulk({ status: String(v) });
    }
    if (mod.kpi === 'lich-tac-nghiep') {
      const patch = (b) => ({ duong: '/api/items/' + id, method: 'PATCH', body: b });
      if (act === 'duyet') return patch({ status: 'Duyệt/Chờ tác nghiệp' });
      if (act === 'tra-lai') return patch({ status: 'Từ chối/Cần điều chỉnh' });
      if (act === 'hoan-tat') return patch({ status: 'Đã hoàn tất' });
      if (act === 'da-thanh-toan') return patch({ payment: 'Đã thanh toán' });
      if (act === 'chot-nhan-su') return patch({ staff: [String(v)] });
    }
    if (mod.kpi === 'ota') {
      /* Chỉ hai việc làm được từ hub. Số tiền và mã booking là dữ liệu của OTA —
       * module cũng không cho sửa, nên ở đây càng không mở. */
      const patch = (b) => ({ duong: '/api/booking/' + id, method: 'PATCH', body: b });
      if (act === 'nhan-booking') return patch({ daNhan: true });
      if (act === 'dien-diem-don') return patch({ diemDon: String(v || '') });
      if (act === 'dien-sdt') return patch({ sdt: String(v || '') });
    }
    return null;
  }

  if (p === '/api/viec' && m === 'POST') {
    const { nguoi: nguoiV, q: qV, xemNhu: nhuV } = await aiDangXem(req);
    if (chanGhiKhiXemHo(res, nhuV, m)) return;
    const b = await docBody(req);
    const mod = timMod(b.mod || '');
    if (!mod || !mod.bat) return loi(res, 404, 'Không có base này trong panel');
    if (!duocXem(qV, mod)) return loi(res, 403, 'Bạn không được xem base này');
    if (!/^rec[A-Za-z0-9]+$/.test(String(b.id || ''))) return loi(res, 400, 'Thiếu mã bản ghi');

    const g = goiHanhDong(mod, b.id, String(b.act || ''), b.giaTri);
    if (!g) return loi(res, 400, 'Hành động không được phép ở đây');

    try {
      const kq = await goiJson(mod, g.duong, {
        method: g.method, body: g.body, nguoi: nguoiKemQuyen(nguoiV, qV, mod), timeoutMs: 30000,
      });
      kpi.xoaCache(mod.id);   // số trên thẻ phải đổi ngay sau khi xử lý
      lich.xoaCache();
      return ok(res, { ok: true, kq });
    } catch (e) {
      /* Giữ câu giải thích của module (VD "Chưa có minh chứng kết quả"). Lỗi thô
       * của lark-cli dài cả trang JSON — cắt lại cho vừa một dòng thông báo. */
      let msg = String(e.message || 'Lỗi không rõ').replace(/\s+/g, ' ');
      if (msg.length > 240) msg = msg.slice(0, 240) + '…';
      return send(res, e.http && e.http < 500 ? e.http : 502,
        { error: msg, code: e.code || '', hint: e.hint || '' });
    }
  }

  /* Bật/tắt chế độ "Xem như". Cookie chứ không phải tham số URL: proxy vào module
   * không thêm được tham số, mà app con vẫn phải thấy đúng danh tính đang xem. */
  if (p === '/api/xem-nhu') {
    const nguoiX = cfg.mode === 'api' ? auth.sessionUser(req) : null;
    const qX = await quyenCua(nguoiX);
    if (cfg.mode === 'api' && !qX.quanLy) return loi(res, 403, 'Chỉ quản lý dùng được chế độ xem hộ.');

    if (m === 'DELETE') {
      res.setHeader('Set-Cookie', COOKIE_NHU + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
      return ok(res, { thoat: true });
    }
    if (m === 'POST') {
      const b = await docBody(req);
      if (!b || (!b.id && !b.email)) return loi(res, 400, 'Thiếu người cần xem hộ.');
      const gt = kyNhu({
        id: b.id || '', ten: b.ten || '', email: b.email || '',
        exp: Date.now() + 8 * 3600 * 1000,
      });
      const parts = [COOKIE_NHU + '=' + encodeURIComponent(gt), 'Path=/', 'HttpOnly',
        'SameSite=Lax', 'Max-Age=' + 8 * 3600];
      if (cfg.publicUrl.startsWith('https://')) parts.push('Secure');
      res.setHeader('Set-Cookie', parts.join('; '));
      return ok(res, { xemNhu: b.ten || b.email || b.id });
    }
  }

  if (p === '/api/bo-doc-kpi' && m === 'GET') return ok(res, { ds: Object.keys(kpi.BO_DOC) });

  if (p === '/healthz') {
    /* Đây là endpoint DUY NHẤT mở công khai (Render gọi để biết app còn sống).
     *
     * Trả thêm ĐÚNG MỘT thứ cho người chưa đăng nhập: `build`. Mọi đường khác
     * của bản chạy thật đều 302 về đăng nhập Lark, kể cả tệp tĩnh, nên không
     * ai — kể cả người trong phòng — kiểm được "bản mới lên chưa" mà không mở
     * trình duyệt và đăng nhập. Đã mất ba lượt hỏi qua hỏi lại vì đúng chuyện
     * này, nên anh Hùng chốt đưa số bản ra ngoài.
     *
     * Chỉ `build` thôi: nó là chuỗi ngày + bảy ký tự đầu của commit, trên một
     * kho RIÊNG TƯ nên không nói lên điều gì dùng được. Chế độ chạy và danh
     * sách base VẪN là thông tin nội bộ — chúng nói ra phòng này có những base
     * nào và base nào đang chết, giữ sau tường đăng nhập. */
    const nguoiH = cfg.mode === 'api' ? auth.sessionUser(req) : null;
    if (cfg.mode === 'api' && !laQuanLy(nguoiH)) return ok(res, { ok: true, build: cfg.build });
    return ok(res, {
      ok: true, build: cfg.build,
      che_do: cfg.mode,
      // Render đặt biến này -> biết chắc đang chạy commit nào, đỡ đoán khi deploy
      commit: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || null,
      modules: danhSach().map((x) => ({ id: x.id, trangThai: kids.tinhTrang(x).trangThai })),
    });
  }

  return loi(res, 404, 'Không có API ' + p);
}

/** "Bảng công việc" -> "bang-cong-viec" (id không dấu, dùng cho URL). */
function khongDau(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'base';
}

/* ---------------- server ---------------- */
const server = http.createServer(async (req, res) => {
  headerBaoMat(res);
  /* Chốt kiểu nén MỘT LẦN ở đây rồi gắn lên res, đúng cách headerBaoMat làm với
   * header bảo mật: mọi đường ra (API, file tĩnh, proxy vào app con, trang lỗi)
   * đọc chung một chỗ, không đường nào lọt. */
  res.__nen = nen.chon(req);
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = u.pathname;

  /* ---- webhook OTA: đường CÔNG KHAI, nằm TRƯỚC cổng đăng nhập ----
   * Máy của Klook / Viator / Ctrip không thể đăng nhập Lark, nên webhook buộc
   * phải đi vòng ngoài cổng đăng nhập. Đổi lại nó bị bó rất hẹp:
   *   - chỉ POST, chỉ đúng dạng /ota/webhook/<kênh>, chỉ chuyển tới module 'ota';
   *   - KHÔNG gửi header danh tính (tham số `nguoi` = null) nên không ai mạo danh
   *     được quản lý qua đường này — chuyenTiep xoá sạch header x-hub-* của client;
   *   - chính module bắt buộc kiểm OTA_WEBHOOK_SECRET, sai thì trả 401.
   * Thêm base khác cần webhook thì mở thêm một nhánh tương tự, ĐỪNG nới regex này.
   */
  const wh = /^\/ota\/webhook\/([A-Za-z0-9_-]{1,32})\/?$/.exec(p);
  if (wh) {
    if (req.method !== 'POST') {
      return send(res, 405, 'Webhook chỉ nhận POST', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const modOta = timMod('ota');
    if (!modOta || modOta.kieu !== 'local' || !modOta.bat) {
      return send(res, 404, JSON.stringify({ error: 'Base Booking OTA chưa được bật trong panel' }),
        { 'Content-Type': 'application/json; charset=utf-8' });
    }
    kids.khoiDong(modOta);   // bảo đảm module đang chạy (không chờ)
    return chuyenTiep(req, res, modOta, '/webhook/' + wh[1] + (u.search || ''), null);
  }

  /* ---- nguồn số liệu cho trợ lý: đường CÔNG KHAI, nằm TRƯỚC cổng đăng nhập ----
   * Coze (hoặc bộ não nào khác) ở ngoài Internet, không đăng nhập Lark được, nên
   * buộc phải đi vòng ngoài cổng. Bó hẹp giống webhook OTA:
   *   - chưa khai BOT_API_TOKEN thì nhánh này trả 404 như không tồn tại;
   *   - chỉ GET, không endpoint nào ghi;
   *   - KHÔNG đọc header danh tính của client — bot.js dùng một danh tính cố định
   *     (xem toàn bộ, không quyền chi phí), nên gọi vào đây không mạo danh được ai;
   *   - có trần lượt/phút và sổ ghi để biết ai đang dò cửa.
   * Chi tiết vì sao không có dữ liệu tiền ở đây: xem đầu bot.js.
   */
  {
    const xong = await bot.xuLy(req, res, u, {
      timMod, khoiDong: (mod) => kids.khoiDong(mod), send,
      goc: (cfg.publicUrl || 'http://127.0.0.1:' + cfg.port).replace(/\/$/, ''),
    });
    if (xong !== false) return;
  }

  /* --- lối công khai cho Zalo, đặt TRƯỚC cổng đăng nhập ---
   *
   * Zalo đòi chứng minh mình sở hữu địa chỉ callback bằng cách gọi thẳng vào
   * /zalo-callback/zalo_verifier<mã>.html — máy chủ của Zalo, không có phiên
   * đăng nhập Lark nào. Không mở lối này thì nó gặp trang đăng nhập và báo
   * "không tìm thấy tệp", mà nhìn từ trình duyệt của mình thì mọi thứ vẫn bình
   * thường vì mình đang đăng nhập sẵn.
   *
   * Mở đúng hai đường, khớp biểu thức chặt, không đọc tệp theo đường dẫn người
   * gọi đưa vào — nếu không thì đây thành lỗ đọc trộm tệp của máy chủ. */
  const zaloVerify = /^\/zalo-callback\/(zalo_verifier[A-Za-z0-9_-]{1,120})\.html$/.exec(p);
  if (zaloVerify) {
    /* Tệp Zalo cho tải về là một trang HTML đủ bộ, mã nằm trong thẻ meta
     * `zalo-platform-site-verification` — KHÔNG phải chuỗi trần như thoạt tưởng.
     * Mã trong thẻ trùng đúng phần đuôi của tên tệp, nên dựng lại được mà không
     * cần ai tải tệp lên. ZALO_VERIFIER vẫn được tôn trọng, phòng khi Zalo đổi
     * khuôn: sửa bằng biến môi trường, không phải sửa code rồi deploy lại. */
    const ma = zaloVerify[1].replace(/^zalo_verifier/, '');
    const noiDung = process.env.ZALO_VERIFIER
      || '<!DOCTYPE html>\n<html lang="en">\n\n<head>\n'
        + '    <meta property="zalo-platform-site-verification" content="' + ma + '" />\n'
        + '</head>\n\n<body>\nThere Is No Limit To What You Can Accomplish Using Zalo!\n</body>\n\n</html>';
    return send(res, 200, noiDung, { 'Content-Type': 'text/html; charset=utf-8' });
  }
  if (p === '/zalo-callback') {
    /* Zalo trả mã uỷ quyền về đây dưới dạng ?code=…&oa_id=… Trang này chỉ bày mã
     * ra cho dễ chép — chứ để trắng thì phải mò trên thanh địa chỉ. Không lưu,
     * không gửi đi đâu: mã chỉ sống vài phút và phải tự tay dán sang app Social. */
    const escZ = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const ma = u.searchParams.get('code') || '';
    const oa = u.searchParams.get('oa_id') || '';
    return send(res, 200,
      '<!doctype html><meta charset="utf-8"><title>Mã uỷ quyền Zalo</title>'
      + '<style>body{font:15px/1.6 system-ui,sans-serif;margin:40px auto;max-width:640px;padding:0 16px}'
      + 'code{display:block;background:#f4f5f7;padding:12px;border-radius:8px;word-break:break-all;'
      + 'margin:8px 0;font-size:14px}</style>'
      + (ma
        ? '<h2>Mã uỷ quyền Zalo</h2><p>Chép chuỗi dưới đây, dán vào ô <b>Mã uỷ quyền</b> '
          + 'trong Social rồi bấm <b>Đổi mã lấy token</b>. Mã dùng một lần và hết hạn nhanh.</p>'
          + '<code>' + escZ(ma) + '</code>'
          + (oa ? '<p>OA: <b>' + escZ(oa) + '</b></p>' : '')
        : '<h2>Chưa có mã</h2><p>Trang này chỉ hiện mã khi Zalo chuyển về kèm <code>?code=…</code>. '
          + 'Nếu đang xác thực quyền sở hữu thì không cần mở trang này.</p>'),
      { 'Content-Type': 'text/html; charset=utf-8' });
  }

  /* Chế độ api (deploy chung): hub đăng nhập Lark một lần cho cả hệ. Mọi thứ đều
   * phải qua cổng này, trừ /healthz (Render gọi để biết app còn sống), /auth/*,
   * hai đường Zalo ở ngay trên và webhook OTA ở khối trên. */
  if (cfg.mode === 'api') {
    if (p.startsWith('/auth/')) {
      const xong = await auth.handle(req, res, u);
      if (xong !== false) return;
    }
    /* GET /api/logo mở như /healthz. Đây là NHÃN HIỆU in lên tệp báo cáo, không
     * phải dữ liệu — và app con gọi nó từ máy chủ sang máy chủ nên không mang
     * theo phiên đăng nhập nào. Chặn ở đây thì mọi tệp xuất trên server chung
     * đều in bản chữ thay logo, mà không có gì báo là vì sao. Ghi logo vẫn chỉ
     * quản lý (POST/DELETE đi qua chiQuanLy trong api()). */
    const moCong = p === '/healthz'
      || (p === '/api/logo' && (req.method === 'GET' || req.method === 'HEAD'));
    if (!moCong && !auth.sessionUser(req)) return auth.requireLogin(res, u);
  }

  // proxy vào module: /m/<id>/...
  const mm = /^\/m\/([^/]+)(\/.*)?$/.exec(p);
  if (mm) {
    const id = decodeURIComponent(mm[1]);
    const mod = timMod(id);
    if (!mod) return send(res, 404, 'Không có module ' + id, { 'Content-Type': 'text/plain; charset=utf-8' });

    /* Kiểm quyền TRƯỚC mọi thứ khác, kể cả trước cú chuyển hướng của module ngoài:
     * ẩn khỏi panel là chưa đủ, ai gõ tay URL cũng phải bị chặn — và người không
     * được xem thì cũng không nên biết URL riêng của app đó. */
    const { nguoi, q, xemNhu } = await aiDangXem(req);
    if (nguoi && !duocXem(q, mod)) {
      return send(res, 403, 'Bạn chưa được cấp quyền xem base "' + mod.ten + '".',
        { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    if (mod.kieu !== 'local') {
      // module ngoài chỉ có URL — chuyển hướng thẳng ra đó
      res.writeHead(302, { Location: mod.url || '/' });
      return res.end();
    }
    if (!mm[2]) { // /m/<id> -> /m/<id>/
      res.writeHead(302, { Location: p + '/' + (u.search || '') });
      return res.end();
    }
    kids.khoiDong(mod); // bảo đảm đang chạy (không chờ)
    if (xemNhu && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return send(res, 403, 'Đang xem bằng mắt của ' + xemNhu.name +
        ' — thoát chế độ này rồi hãy thao tác.', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (nguoi) {
      /* Vai tính theo ĐÚNG base đang mở: Lead phụ trách base này vào app con với
       * vai quản lý, mà mở base khác thì vẫn là nhân sự. */
      const ql = laQLBase(q, mod);
      nguoi.quanLy = ql;
      nguoi.toanBo = ql || q.toanBo;
      nguoi.taoMoi = ql || q.taoMoi;
      nguoi.chiPhi = ql || q.chiPhi;
    }
    /* Chạy trên máy cá nhân thì không có phiên đăng nhập, nhưng người ngồi trước
     * máy chính là quản lý — phải nói rõ cho app con, nếu không nó tưởng nhân sự
     * và cắt bớt bộ lọc. Không có id thì proxy cũng không gửi header danh tính. */
    const vai = nguoi || { quanLy: cfg.mode !== 'api', toanBo: cfg.mode !== 'api' };
    return chuyenTiep(req, res, mod, mm[2] + (u.search || ''), vai);
  }

  /* Trang /toi: in thẳng open_id của người đang đăng nhập ra chữ to, có nút Copy.
   * Có trang này vì open_id khác nhau giữa các app Lark — đổi app là phải khai lại
   * LARK_MANAGER_IDS, mà đọc JSON thì bất tiện cho người không quen. */
  if (p === '/toi') {
    const nguoi = cfg.mode === 'api' ? auth.sessionUser(req) : null;
    const laQL = laQuanLy(nguoi);
    const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const than = cfg.mode !== 'api'
      ? '<h1>Đang chạy trên máy cá nhân</h1><p>Chế độ này dùng phiên lark-cli của máy, ' +
        'không có open_id riêng. Trang này chỉ cần thiết khi chạy trên server chung.</p>'
      : !nguoi
        ? '<h1>Chưa đăng nhập</h1><p><a href="/auth/login?next=%2Ftoi">Đăng nhập Lark</a></p>'
        : '<div class="nhan">Tài khoản Lark</div>' +
          '<h1>' + esc(nguoi.name) + '</h1>' +
          (nguoi.email
            ? '<div class="nhan">Email — dùng cái này để khai quản lý</div>' +
              '<div class="id" id="id">' + esc(nguoi.email) + '</div>' +
              '<button id="cp">Copy email</button>'
            : '<div class="nhan">open_id dưới app này</div>' +
              '<div class="id" id="id">' + esc(nguoi.id) + '</div>' +
              '<button id="cp">Copy open_id</button>') +
          // email còn lại (nếu Lark có cả email công ty và email đăng nhập)
          (nguoi.emailPhu
            ? '<p style="color:#8b95a7;font-size:13px">Email còn lại của tài khoản này: <code>' +
              esc(nguoi.emailPhu) + '</code> — khai cái nào app cũng khớp.</p>'
            : '') +
          (laQL
            ? '<p class="ok">Đang có vai quản lý — không cần làm gì thêm.</p>'
            : '<p class="canh">Chưa có vai quản lý. Vào <b>Render → service → Environment</b>, ' +
              'thêm biến <code>' + (nguoi.email ? 'LARK_MANAGER_EMAILS' : 'LARK_MANAGER_IDS') +
              '</code> bằng chuỗi trên rồi <b>Save</b>. Nhiều người thì cách nhau bằng dấu phẩy.</p>') +
          '<p style="color:#8b95a7;font-size:13px">open_id: <code>' + esc(nguoi.id) + '</code></p>';

    const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tài khoản của tôi</title><style>' +
      'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6fa;color:#1a2233;' +
      'font:15px/1.6 "Segoe UI",system-ui,sans-serif}' +
      '.box{background:#fff;border:1px solid #e3e8f0;border-radius:14px;padding:30px 34px;max-width:560px;' +
      'box-shadow:0 6px 24px rgba(20,30,60,.07)}' +
      'h1{margin:2px 0 18px;font-size:22px}' +
      '.nhan{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8b95a7}' +
      '.id{font:14px ui-monospace,Consolas,monospace;background:#f4f6fa;border:1px solid #e3e8f0;' +
      'border-radius:9px;padding:12px 14px;margin:6px 0 14px;word-break:break-all;user-select:all}' +
      'button{font:inherit;background:#2b5cff;color:#fff;border:0;border-radius:9px;padding:9px 16px;cursor:pointer}' +
      'p{font-size:14px}.ok{color:#0c7a41}.canh{color:#96591b}' +
      'code{background:#f4f6fa;border:1px solid #eef1f6;border-radius:5px;padding:1px 5px;font-size:13px}' +
      'a{color:#2b5cff}@media(prefers-color-scheme:dark){body{background:#12161f;color:#e4e8f1}' +
      '.box{background:#1a1f2b;border-color:#2c3444}.id{background:#12161f;border-color:#2c3444}' +
      'code{background:#12161f;border-color:#2c3444}}</style></head><body><div class="box">' +
      than + '</div><script>var b=document.getElementById("cp");if(b)b.onclick=function(){' +
      'navigator.clipboard.writeText(document.getElementById("id").textContent.trim())' +
      '.then(function(){b.textContent="Đã copy"}).catch(function(){b.textContent="Bấm giữ để chọn rồi Ctrl+C"})};' +
      '</script></body></html>';
    return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
  }

  if (p.startsWith('/api/') || p === '/healthz') {
    return api(req, res, u).catch((e) => {
      console.error('[API]', p, '->', e.message);
      if (!res.headersSent) loi(res, 500, e.message || 'Lỗi không xác định');
    });
  }

  return tinh(res, p, u.search);
});

/* ---------------- khởi động ---------------- */
const mods = danhSach();

server.listen(cfg.port, () => {
  console.log('');
  console.log('  ' + cfg.ten + ' · ' + cfg.phu + '   (build ' + cfg.build + ')');
  console.log('  ->  http://localhost:' + cfg.port);
  console.log('');
  console.log('  Base đang quản lý:');
  mods.forEach((m) => console.log('   ' + (m.bat ? '•' : '·') + ' ' + m.ten +
    '  [' + m.kieu + (m.kieu === 'local' ? ' :' + m.cong : '') + ']' + (m.bat ? '' : '  (đang tắt)')));
  console.log('');

  if (cfg.tuKhoiDong) {
    mods.filter((m) => m.bat && m.kieu === 'local').forEach((m, i) => {
      setTimeout(() => kids.khoiDong(m), i * 600);
    });
  } else {
    console.log('  HUB_AUTOSTART=0 — không tự bật module, mở trong Cài đặt.');
  }

  setInterval(() => { kids.ktSucKhoe(danhSach()).catch(() => {}); }, 10000);
  console.log('  Ctrl+C để dừng (tắt luôn các module do hub bật).');
  console.log('');
});

let dangDong = false;
function dong() {
  if (dangDong) return;
  dangDong = true;
  console.log('\n  Đang tắt các module…');
  kids.tatHet().finally(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
process.on('SIGINT', dong);
process.on('SIGTERM', dong);
process.on('SIGHUP', dong);
