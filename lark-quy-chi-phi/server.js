'use strict';
/**
 * ============================================================================
 * QUỸ CHI PHÍ MARKETING — máy chủ
 * ============================================================================
 *
 * Thay cho sheet "Quỹ công ty tạm ứng chi trước" (6 tab, 162 dòng). Ba bảng
 * trên Base "Chi phí Marketing": Đợt tạm ứng · Lần nạp quỹ · Chi phí.
 *
 * BA VAI, và ranh giới giữa chúng là ranh giới của việc thật:
 *   chuQuy — anh Hùng giữ tiền: khai chi, nạp quỹ, đính chứng từ, sửa, xoá
 *   keToan — chị kế toán: đọc và QUYẾT TOÁN. Không ghi gì khác vào sổ.
 *   xem    — người còn lại trong phòng: đọc.
 * Kế toán từng bị xếp chung với "xem", nhưng việc của họ là đóng sổ chứ không
 * phải ngắm sổ — nên có chốt riêng `doiQuyenQuyetToan`.
 *
 * QUỸ LÀ MỘT CỤC. Sáu "đợt tạm ứng" chỉ là sáu lần ứng tiền khác nhau, không
 * phải sáu túi tiền riêng — tiêu thì tiêu từ một quỹ. Nên số dư là MỘT con số
 * cho cả sổ, và không chỗ nào bắt người dùng chọn "chi từ cục nào". Bản ghi vẫn
 * gắn vào một đợt, nhưng server tự gắn: đó là chuyện đối chiếu phiếu chi của kế
 * toán, không phải chuyện của người tiêu tiền.
 *
 * Số dư cũng KHÔNG cộng dồn theo dòng như sheet — chèn một dòng cũ vào giữa là
 * phải tính lại cả cột. Cộng cả sổ mỗi lần đọc thì không bao giờ lệch.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const cfg = require('./config');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');
const tourwell = require('../lark-chung/tourwell');

const F = cfg.fields;
const BIND = process.env.BIND || '127.0.0.1';

/* ---------------- đọc ô Base -> giá trị UI ---------------- */
const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (x && (x.text || x.name)) || (typeof x === 'string' ? x : '')).join('');
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
};
const first = (v) => (Array.isArray(v) ? v[0] : v);
const asUsers = (v) => (Array.isArray(v) ? v.map((u) => ({ id: u.id, name: u.name || u.en_name || u.id })) : []);
const asLinks = (v) => {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x && (x.record_id || x.id)))).filter(Boolean);
};
const asAttach = (v) => (Array.isArray(v)
  ? v.map((a) => ({ name: a.name || a.file_name || 'tệp', token: a.file_token || a.token || '', size: a.size || 0 }))
  : []);

/** Một bản ghi Base -> object phẳng theo bản đồ trường. */
function doiRa(rec, map) {
  const c = rec.cells || {};
  const t = { id: rec.record_id };
  for (const [key, f] of Object.entries(map)) {
    const v = c[f.id];
    switch (f.type) {
      case 'select':     t[key] = asText(first(v)) || null; break;
      case 'user':       t[key] = asUsers(v); break;
      case 'datetime':   t[key] = v || null; break;
      case 'number':
      case 'formula':    t[key] = (v === 0 || v) ? Number(asText(v) || v) || 0 : 0; break;
      case 'attachment': t[key] = asAttach(v); break;
      case 'link':       t[key] = asLinks(v); break;
      default:           t[key] = asText(v); break;
    }
  }
  return t;
}

/* ---------------------------------------------------------------------------
 * ĐỊA CHỈ ĐƠN TOURWELL
 * -------------------------------------------------------------------------
 * Ô "Mã đơn Tourwell" lưu một trong hai dạng:
 *
 *   "RT16438 · https://rootytrip.tourwell.net/admin/order/16438/show"
 *   "RT16486"                       ← ghi từ app Lịch tác nghiệp, thiếu địa chỉ
 *
 * Dạng thứ hai là chữ chết trên màn hình, mà kế toán đối chiếu CHÍNH bằng mã
 * này. Nguồn đã sửa để từ nay luôn ghi kèm địa chỉ; chỗ này lo mấy dòng CŨ và
 * mấy mã ai đó gõ thẳng vào Base.
 *
 * DỰNG ĐƯỢC vì SỐ trong mã chính là id đơn. Không phải suy đoán: ngày
 * 23/09/2026 đối chiếu cả 10 mã đang có trong sổ với /api/v1/orders/<số> —
 * 10 khớp, 0 lệch, và link_erp Tourwell trả về đúng bằng chuỗi dựng ở đây.
 *
 * Dựng ở MÁY CHỦ chứ không ở giao diện: địa chỉ máy chủ Tourwell là cấu hình,
 * trình duyệt không biết và không nên biết.
 *
 * Bịa link là mở nhầm sang đơn của người khác — tệ hơn hẳn không bấm được. Nên
 * chỉ dựng khi mã đúng dạng RT + chữ số; ngoài ra trả rỗng.
 */
/* ---------------------------------------------------------------------------
 * LINK CHỨNG TỪ CŨ TRÊN DRIVE
 * -------------------------------------------------------------------------
 * Ô "Link chứng từ cũ" / "Link UNC cũ" KHÔNG lưu một địa chỉ trần. Lark trả
 * chúng về dưới dạng markdown:
 *
 *   [https://drive.google.com/file/d/1EMJ…/view](https://drive.google.com/file/d/1EMJ…/view)
 *
 * Nhét nguyên chuỗi đó vào href thì trình duyệt thấy nó KHÔNG mở đầu bằng
 * http, nên hiểu là đường dẫn tương đối và ghép vào sau địa chỉ app:
 *
 *   mkt-hub-w6hi.onrender.com/m/quy-chi-phi/[https://drive.google.com/…]…
 *   → {"error":"Not found"}
 *
 * Đúng cái anh Hùng gặp ngày 24/09/2026. Và không phải một dòng: ĐỦ CẢ 255 ô
 * (160 hoá đơn + 95 UNC) đều ở dạng này, tức là mọi nút "Mở trên Drive" trong
 * app đều hỏng từ ngày dựng — chỉ là mấy khoản gần đây có tệp đính kèm thật
 * nên không ai bấm tới nút của chứng từ cũ.
 *
 * App Lịch tác nghiệp đã gặp và đã xử (stripMdLink trong server.js của nó);
 * app này thì chưa. Gỡ ở MÁY CHỦ để giao diện nhận về một địa chỉ sạch.
 */
function boMdLink(v) {
  const m = /^\s*\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(String(v || '').trim());
  return m ? (m[2] || m[1]).trim() : String(v || '');
}

/* Ba ô mang dạng đó. Khai thành danh sách chứ không quét mọi ô chữ: một ghi
 * chú ai đó gõ đúng cú pháp markdown thì phải giữ nguyên là chữ. */
const O_LINK_MD = ['linkCu', 'linkUncCu', 'buoiTacNghiep'];

/** Một khoản chi trước khi đưa xuống giao diện. */
function chuanChi(c) {
  O_LINK_MD.forEach((k) => { if (c[k]) c[k] = boMdLink(c[k]); });
  c.linkDon = linkDonTourwell(c.maDon);
  return c;
}

function linkDonTourwell(maDon) {
  const s = String(maDon || '').trim();
  if (!s) return '';
  const co = s.match(/(https?:\/\/\S+)/);
  if (co) return co[1];
  const m = s.split('·')[0].trim().match(/^RT(\d+)$/i);
  if (!m) return '';
  const host = (tourwell.docCauHinh() || {}).host;
  return host ? host + '/admin/order/' + m[1] + '/show' : '';
}

const pad = (n) => String(n).padStart(2, '0');

/** UI -> ô Base. Khoá theo TÊN cột vì lark.js ghi theo tên. */
function doiVao(patch, map) {
  const out = {};
  for (const key of Object.keys(patch)) {
    const f = map[key];
    const val = patch[key];
    if (!f || f.readOnly || f.type === 'formula' || f.type === 'attachment') continue;
    switch (f.type) {
      case 'select': out[f.name] = val ? String(val) : null; break;
      case 'number': out[f.name] = (val === '' || val == null) ? null : Number(val); break;
      case 'user':
        out[f.name] = (Array.isArray(val) ? val : val ? [val] : [])
          .map((u) => ({ id: typeof u === 'string' ? u : u.id })).filter((u) => u.id);
        break;
      /* Ô liên kết: MẢNG CHUỖI record_id. Truyền [{id}] thì Base nhận lệnh,
       * trả về thành công, mà ô vẫn trống — đã mất một mẻ nhập vì chuyện này. */
      case 'link':
        out[f.name] = (Array.isArray(val) ? val : val ? [val] : [])
          .map((x) => (typeof x === 'string' ? x : (x && x.id))).filter(Boolean);
        break;
      case 'datetime': {
        if (!val) { out[f.name] = null; break; }
        const d = new Date(val);
        if (isNaN(d.getTime())) { out[f.name] = null; break; }
        /* Base ghi giờ Việt Nam còn Render chạy giờ UTC — quy sang UTC+7 rồi
         * đọc theo UTC để chạy ở đâu cũng ra một ngày. */
        const vn = new Date(d.getTime() + 7 * 3600000);
        out[f.name] = `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())} `
          + `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}:00`;
        break;
      }
      default: out[f.name] = val == null ? null : String(val); break;
    }
  }
  return out;
}

/* ---------------- kho tạm ----------------
 * Ba bảng đọc chung một nhịp: số dư của đợt phụ thuộc cả chi lẫn nạp, nên đọc
 * lệch nhau thì màn hình hiện một con số không tồn tại ở thời điểm nào cả. */
const kho = { at: 0, chi: null, dot: null, nap: null };

async function nap(buoc = false) {
  if (!buoc && kho.chi && Date.now() - kho.at < cfg.cacheTtlMs) return kho;
  const [chi, dot, lan] = await Promise.all([
    lark.listAllRecords(cfg.tableId),
    lark.listAllRecords(cfg.dotTableId),
    lark.listAllRecords(cfg.napTableId),
  ]);
  kho.chi = chi; kho.dot = dot; kho.nap = lan; kho.at = Date.now();
  return kho;
}

/* ---------------------------------------------------------------------------
 * QUỸ LÀ MỘT CỤC
 * -------------------------------------------------------------------------
 * Sáu "đợt tạm ứng" chỉ là sáu lần anh Hùng ứng tiền, không phải sáu túi tiền
 * riêng. Tiêu thì tiêu từ một quỹ. Nên số dư là MỘT con số cho cả sổ, và không
 * chỗ nào bắt người dùng chọn "chi từ cục nào".
 *
 * Một chỗ phải cẩn thận: dòng "Chuyển từ kỳ trước" là tồn của kỳ trước chuyển
 * sang, KHÔNG phải tiền công ty đưa thêm. Cộng cả vào thì quỹ phồng lên
 * 11.194.600 đ không có thật.
 * ------------------------------------------------------------------------- */
const NAP_CHUYEN_TIEP = 'Chuyển từ kỳ trước';

function tinhQuy(chi, nap) {
  const tongUng = nap.filter((n) => n.loai !== NAP_CHUYEN_TIEP)
    .reduce((a, n) => a + (Number(n.tien) || 0), 0);
  const tongChi = chi.reduce((a, c) => a + (Number(c.tien) || 0), 0);
  return { tongUng, tongChi, conLai: tongUng - tongChi, soLanUng: nap.filter((n) => n.loai !== NAP_CHUYEN_TIEP).length };
}

/**
 * Đợt để gắn bản ghi mới vào. Người dùng không chọn — nhưng bản ghi vẫn phải
 * thuộc một đợt, vì kế toán đối chiếu theo phiếu chi PC…; đó là chuyện của
 * chứng từ, không phải chuyện của người tiêu tiền.
 */
async function dotMacDinh(dotRows) {
  const dang = dotRows.find((d) => d.tinhTrang === 'Đang dùng');
  const chon = dang || dotRows[dotRows.length - 1];
  return chon ? chon.id : null;
}

/* ---------------------------------------------------------------------------
 * TẠO ĐƠN TOURWELL CHO MỘT KHOẢN CHI
 * -------------------------------------------------------------------------
 * Mọi khoản tiêu từ quỹ đều đi qua nhà cung cấp "QUỸ MARKETING" (id 274) bên
 * Tourwell — lịch sử chi của quỹ nằm ở
 * https://rootytrip.tourwell.net/admin/supplier/274/show?tab=history
 * Nên khai một khoản chi ở đây mà không tạo đơn thì lịch sử bên kia thủng.
 *
 * Ba luật giống hệt app Lịch tác nghiệp, và giống vì cùng một lý do:
 *   1. một khoản chi một đơn — ô "Mã đơn Tourwell" có mã rồi thì thôi
 *   2. Tourwell hỏng không chặn việc ghi sổ — tiền đã tiêu rồi
 *   3. nói rõ đơn mới ở "Đang xử lý", còn 5 nút phải bấm tay
 * ------------------------------------------------------------------------- */
const dangTaoDon = new Set();

async function taoDonTourwell(recId, khoan) {
  if (!tourwell.bat()) return { bo: 'chua-cau-hinh' };
  if (!recId) return { bo: 'khong-co-ban-ghi' };
  if (!(Number(khoan.tien) > 0)) return { bo: 'khong-co-chi-phi' };
  /* Ô "Mã đơn Tourwell" là chốt chống trùng. Với khoản mới thì ô này luôn
   * trống, nhưng hàm này còn được gọi lại từ nút "tạo lại đơn" — mà lúc đó
   * khoản đã có thể có đơn rồi. Một khoản chi một đơn, không hơn. */
  if (String(khoan.maDon || '').trim()) {
    return { bo: 'da-co', ma: String(khoan.maDon).trim().split('·')[0].trim() };
  }
  if (dangTaoDon.has(recId)) return { bo: 'dang-tao' };
  dangTaoDon.add(recId);

  try {
    const kq = await tourwell.taoDon({
      ten: khoan.noiDung,
      ngay: khoan.ngayChi || khoan.ngayDeNghi,
      tien: khoan.tien,
    });
    /* Ghi mã ngược vào Base NGAY, kể cả khi dòng chi phí lỗi: đơn đã tồn tại
     * thì ô này phải có mã, nếu không lần sửa sau lại đẻ thêm đơn nữa. */
    try {
      await lark.updateRecord(recId, { [F.chi.maDon.name]: kq.ma + ' · ' + kq.link }, cfg.tableId);
      kho.at = 0;
    } catch (e) { kq.loiGhiBase = e.message; }
    return kq;
  } catch (e) {
    return { loi: e.message };
  } finally {
    dangTaoDon.delete(recId);
  }
}

/* ---------------- danh tính ---------------- */
const nguoiCuaRequest = new AsyncLocalStorage();

const giaiMa = (v) => {
  if (!v) return '';
  try { return decodeURIComponent(v); } catch (_) { return String(v); }
};

function nguoiTuHeader(req) {
  const id = req.headers['x-hub-user-id'];
  if (!id) return null;
  /* Hub gửi CẢ HAI email — enterprise_email công ty cấp và email đăng nhập
   * Lark — vì người khai quyền không biết chắc mình đang điền cái nào. Nhận cả
   * hai thì khai kiểu nào cũng trúng. */
  return {
    id: String(id),
    name: giaiMa(req.headers['x-hub-user-name']) || String(id),
    email: giaiMa(req.headers['x-hub-user-email']),
    emailPhu: giaiMa(req.headers['x-hub-user-email-phu']),
    /* Hub đã quyết ai là quản lý (theo open_id hoặc email) và gửi kèm cờ này. */
    quanLy: req.headers['x-hub-user-manager'] === '1',
  };
}

/* whoami ở chế độ cli sinh HẲN MỘT TIẾN TRÌNH node (`lark-cli auth status`).
 * Một lời gọi /api/meta hỏi danh tính ba lần — me, vai, chuQuy — nên trước khi
 * có chỗ nhớ này là ba tiến trình cho mỗi lần mở trang, đủ để thấy giật. Người
 * đăng nhập lark-cli thì cả phiên không đổi, nhớ 5 phút là quá đủ. */
const nhoToi = { at: 0, ai: null };
const NHO_MS = 5 * 60 * 1000;

async function toiLaAi() {
  const tuHub = nguoiCuaRequest.getStore();
  if (tuHub) return tuHub;
  if (nhoToi.ai && Date.now() - nhoToi.at < NHO_MS) return nhoToi.ai;
  if (typeof lark.whoami === 'function') {
    try {
      const ai = await lark.whoami();
      if (ai) { nhoToi.ai = ai; nhoToi.at = Date.now(); }
      return ai;
    } catch (_) { return null; }
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * BA VAI — chuQuy · keToan · xem
 * -------------------------------------------------------------------------
 * Trước đây app chỉ có một chốt "có phải chủ quỹ không", và ai không phải thì
 * rơi hết vào ô chỉ đọc. Nhưng kế toán KHÔNG chỉ đọc: việc của họ là kiểm
 * chứng từ rồi ĐÓNG SỔ — gán mã quyết toán. Bắt họ mở Base sửa từng dòng thì
 * đúng cái việc app này sinh ra để bỏ.
 *
 * TIN CỜ QUẢN LÝ CỦA HUB trước, rồi mới tới danh sách open_id.
 *
 * Vì sao: open_id KHÁC NHAU theo từng app Lark. Cái id ghi trong cfg.chuQuy lấy
 * từ bản ghi Base (app Tracking), còn Hub đăng nhập bằng app riêng của nó nên
 * gửi xuống một open_id khác hẳn — so bằng id thì không bao giờ khớp, và anh
 * Hùng mở app trên web ra thấy mình bị coi là khách chỉ xem. Đúng lỗi ngày
 * 12/09/2026. App Lịch tác nghiệp không dính vì nó tin cờ này ngay từ đầu.
 *
 * Kế toán thì ngược lại: không có cờ nào của Hub nói "người này là kế toán",
 * nên so cả open_id lẫn HỌ TÊN (Hub gửi sẵn trong x-hub-user-name). Tên là cái
 * duy nhất anh Hùng gõ được mà không phải đi đào id.
 */
const chuanTen = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Khai kế toán bằng EMAIL, họ tên, hay open_id — cái nào cũng được.
 *
 * Email là cái nên dùng: nó không đổi theo app Lark như open_id, không gõ sai
 * dấu như tên tiếng Việt, và là thứ duy nhất anh Hùng đọc ra ngay được từ danh
 * bạ công ty. So bằng chuanTen luôn cho tiện — hạ chữ thường và bóp khoảng
 * trắng thừa, đúng thứ email cũng cần.
 */
function laKeToan(me) {
  if (!me) return false;
  const cua = [me.id, me.name, me.email, me.emailPhu].map(chuanTen).filter(Boolean);
  return cfg.keToan.some((k) => {
    const kk = chuanTen(k);
    return kk && (k === me.id || cua.includes(kk));
  });
}

async function vaiCua() {
  const me = await toiLaAi();
  if (!me) return 'xem';
  if (me.quanLy || cfg.chuQuy.includes(me.id)) return 'chuQuy';
  if (laKeToan(me)) return 'keToan';
  return 'xem';
}

async function laChuQuy() {
  return (await vaiCua()) === 'chuQuy';
}

async function doiChuQuy(res) {
  const vai = await vaiCua();
  if (vai === 'chuQuy') return true;
  /* Nói đúng vai của người đang đứng đó. Bảo kế toán rằng họ "đang xem ở chế
   * độ chỉ đọc" là sai — họ quyết toán được, chỉ không ghi tiền vào sổ. */
  json(res, {
    error: vai === 'keToan'
      ? 'Kế toán quyết toán được, nhưng khai chi và nạp quỹ là việc của người giữ quỹ.'
      : 'Chỉ người giữ quỹ mới ghi được vào sổ. Bạn đang xem ở chế độ chỉ đọc.',
    code: 'NOT_FUND_OWNER',
  }, 403);
  return false;
}

/** Quyết toán là việc CHUNG của chủ quỹ và kế toán — chốt riêng, rộng hơn. */
async function doiQuyenQuyetToan(res) {
  const vai = await vaiCua();
  if (vai === 'chuQuy' || vai === 'keToan') return true;
  json(res, {
    error: 'Chỉ người giữ quỹ hoặc kế toán mới quyết toán được.',
    code: 'NOT_ALLOWED',
  }, 403);
  return false;
}

/* ---------------- máy chủ ---------------- */
const server = http.createServer((req, res) => {
  const me = nguoiTuHeader(req);
  if (me) nguoiCuaRequest.run(me, () => xuLy(req, res).catch((e) => loi(res, e)));
  else xuLy(req, res).catch((e) => loi(res, e));
});

function loi(res, e) {
  console.error('[lỗi]', e && e.message);
  if (!res.headersSent) json(res, { error: String((e && e.message) || e) }, 500);
  else res.end();
}

async function xuLy(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Hub-User-Id,X-Hub-User-Name');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  /* ---- màn hình chính ---- */
  if (p === '/api/meta' && req.method === 'GET') {
    const k = await nap(url.searchParams.get('moi') === '1');
    const chi = k.chi.map((r) => chuanChi(doiRa(r, F.chi)));
    const dot = k.dot.map((r) => doiRa(r, F.dot));
    const lan = k.nap.map((r) => doiRa(r, F.nap));

    /* Số dư của từng đợt do công thức Base tính, app không tự cộng lại — hai
     * nơi cùng tính một con số thì sớm muộn lệch nhau. */
    return json(res, {
      me: await toiLaAi(),
      /* `vai` là thứ giao diện đọc; `chuQuy` giữ lại cho khỏi vỡ chỗ nào còn
       * đọc cờ cũ — chủ quỹ vẫn là chủ quỹ ở cả hai cách hỏi. */
      vai: await vaiCua(),
      chuQuy: await laChuQuy(),
      quy: tinhQuy(chi, lan),
      chi, dot, nap: lan,
      options: { loaiChi: cfg.loaiChi, tinhTrang: cfg.tinhTrang, chungTu: cfg.loaiChungTu },
    });
  }

  /* ---- thẻ chỉ số cho trang Tổng quan của hub ----
   * Hub KHÔNG đọc Base của app này; nó hỏi đúng đường dưới đây. Định nghĩa
   * "còn bao nhiêu tiền", "bao nhiêu khoản chờ quyết toán" nằm ở app — đổi cách
   * tính thì sửa một chỗ, thẻ trên hub đổi theo. */
  if (p === '/api/tong-quan' && req.method === 'GET') {
    const k = await nap(false);
    const chi = k.chi.map((r) => doiRa(r, F.chi));
    const lan = k.nap.map((r) => doiRa(r, F.nap));
    const quy = tinhQuy(chi, lan);

    const tu = url.searchParams.get('tu') || '';
    const den = url.searchParams.get('den') || '';
    /* Lọc theo NGÀY ĐỀ NGHỊ: đó là ngày khoản chi phát sinh. Ngày chi có thể
     * trống (chưa chi) nên lọc theo nó là khoản mới nhất biến mất khỏi thẻ. */
    const trongKy = (r) => {
      if (!tu || !den) return true;
      const d = String(r.ngayDeNghi || '').slice(0, 10);
      return d && d >= tu && d <= den;
    };
    const kyChi = chi.filter(trongKy);
    const choChi = chi.filter((r) => r.tinhTrang === 'Chờ chi');
    /* "Đã chi" mà chưa "Đã quyết toán" = tiền đã ra khỏi quỹ nhưng chưa khoá
     * sổ. Đây là việc còn phải làm, nên nó là con số đáng cảnh báo nhất ở đây. */
    const choQt = chi.filter((r) => r.tinhTrang === 'Đã chi');

    return json(res, {
      the: [
        { chinh: true, nhan: 'Còn trong quỹ', so: quy.conLai || 0, dinhDang: 'vnd',
          ghi: 'đã ứng ' + (quy.soLanUng || 0) + ' lần' },
        { nhan: 'Chờ chi', so: choChi.length, dinhDang: 'so',
          muc: choChi.length ? 'vua' : 'ok', tab: 'chi' },
        { nhan: 'Chờ quyết toán', so: choQt.length, dinhDang: 'so',
          muc: choQt.length ? 'vua' : 'ok', tab: 'chi' },
        { nhan: 'Chi trong kỳ', so: kyChi.reduce((a, r) => a + (Number(r.tien) || 0), 0),
          dinhDang: 'vnd', ghi: kyChi.length + ' khoản' },
        { nhan: 'Đã chi từ đầu quỹ', so: quy.tongChi || 0, dinhDang: 'vnd' },
      ],
      tong: chi.length,
      khoang: tu && den ? tu + ' → ' + den : '',
    });
  }

  /* ---- khoản chi ---- */
  if (p === '/api/chi' && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const body = await docThan(req);
    if (!String(body.noiDung || '').trim()) {
      return json(res, { error: 'Phải ghi nội dung chi.' }, 400);
    }
    if (!(Number(body.tien) > 0)) {
      return json(res, { error: 'Số tiền phải lớn hơn 0.' }, 400);
    }
    const me = await toiLaAi();
    if (!body.nguoi && me) body.nguoi = [me.id];
    if (!body.tinhTrang) body.tinhTrang = 'Đã chi';
    if (!body.ngayChi) body.ngayChi = new Date().toISOString();
    /* Giao diện không hỏi đợt nữa — server tự gắn. Bản ghi vẫn phải có đợt để
     * kế toán đối chiếu theo phiếu chi. */
    if (!body.dot || !body.dot.length) {
      const k = await nap();
      const id = await dotMacDinh(k.dot.map((r) => doiRa(r, F.dot)));
      if (id) body.dot = [id];
    }
    const out = await lark.createRecord(doiVao(body, F.chi), cfg.tableId);
    kho.at = 0;
    /* lark-cli +record-batch-create trả về `record_id_list`; bản Open API trả
     * `records[]`. Đọc thiếu một dạng thì id ra null, và đơn Tourwell không bao
     * giờ được tạo — mà API vẫn báo thành công. */
    const id = (out && (
      (out.record_id_list && out.record_id_list[0])
      || out.record_id
      || (out.record && out.record.record_id)
      || (out.records && out.records[0] && out.records[0].record_id)
    )) || null;

    /* Rồi tạo đơn bên Tourwell — giống hệt đường của app Lịch tác nghiệp, vì
     * mọi khoản chi qua Quỹ Marketing đều phải có một đơn để kế toán chi tiền.
     * Tourwell hỏng KHÔNG được làm hỏng việc ghi sổ: tiền đã tiêu rồi. */
    const tw = await taoDonTourwell(id, body);
    if (tw && tw.loi) console.warn('[Tourwell]', tw.loi);
    return json(res, { ok: true, id, tourwell: tw });
  }

  const mChi = p.match(/^\/api\/chi\/(rec[A-Za-z0-9]+)$/);
  if (mChi) {
    const id = mChi[1];
    if (req.method === 'PATCH') {
      if (!(await doiChuQuy(res))) return;
      const body = await docThan(req);
      const cells = doiVao(body, F.chi);
      if (!Object.keys(cells).length) return json(res, { error: 'Không có gì để sửa' }, 400);
      await lark.updateRecord(id, cells, cfg.tableId);
      kho.at = 0;
      return json(res, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!(await doiChuQuy(res))) return;
      await lark.deleteRecords([id], cfg.tableId);
      kho.at = 0;
      return json(res, { ok: true });
    }
  }

  /* ---- tạo lại đơn Tourwell cho một khoản ĐÃ có trong sổ ----
   * Tourwell hỏng lúc khai (hết token, sai host, mạng chập) thì khoản chi vẫn
   * vào sổ — đúng thiết kế, tiền đã tiêu rồi. Nhưng trước đây không có đường
   * nào tạo bù cái đơn ấy, và lời khuyên duy nhất là "khai lại khoản này" —
   * tức là ĐẺ THÊM MỘT DÒNG CHI, trừ tiền quỹ hai lần cho một lần tiêu. Lời
   * khuyên đó tệ hơn cả cái lỗi nó định chữa. */
  const mTw = p.match(/^\/api\/chi\/(rec[A-Za-z0-9]+)\/tourwell$/);
  if (mTw && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const k = await nap();
    const rec = k.chi.find((r) => r.record_id === mTw[1]);
    if (!rec) return json(res, { error: 'Không thấy khoản chi này trong sổ.' }, 404);
    const khoan = doiRa(rec, F.chi);
    /* Cùng luật với giao diện, và cần ở đây vì cùng lý do: 162 khoản nhập từ
     * sheet cũ trống ô "Mã đơn Tourwell" nhưng ĐÃ qua Tourwell bằng tay — dấu
     * vết là mã điều hành SG… và mã quyết toán. Tạo đơn cho chúng là dựng một
     * đơn THẬT cho khoản tiền đã đóng sổ từ tháng 4. */
    const daQua = [khoan.maDieuHanh, khoan.maQuyetToan].some((x) => String(x || '').trim())
      || khoan.tinhTrang === 'Đã quyết toán';
    if (daQua) {
      return json(res, {
        error: 'Khoản này đã có dấu vết đi qua Tourwell ('
          + [khoan.maDieuHanh && ('mã điều hành ' + khoan.maDieuHanh),
            khoan.maQuyetToan && ('đã quyết toán ' + khoan.maQuyetToan)]
            .filter(Boolean).join(' · ')
          + '). Tạo đơn nữa là đơn trùng — xoá ô Mã điều hành trước nếu thật sự cần.',
        code: 'DA_QUA_TOURWELL',
      }, 409);
    }
    const tw = await taoDonTourwell(mTw[1], khoan);
    if (tw && tw.loi && !tw.ma) return json(res, { error: tw.loi }, 502);
    return json(res, { ok: true, tourwell: tw, khoan });
  }

  /* ---- chứng từ ---- */
  const mUp = p.match(/^\/api\/chi\/(rec[A-Za-z0-9]+)\/tep\/([a-zA-Z]+)$/);
  if (mUp && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const [, id, key] = mUp;
    if (!cfg.uploadable.includes(key)) return json(res, { error: 'Ô này không nhận tệp.' }, 400);
    const ten = decodeURIComponent(url.searchParams.get('name') || 'tep');
    const an = ten.replace(/[\\/:*?"<>|]/g, '_').slice(-120);
    const relDir = './.tmp/up-' + Date.now();
    const absDir = path.join(__dirname, relDir);
    fs.mkdirSync(absDir, { recursive: true });
    try {
      fs.writeFileSync(path.join(absDir, an), await docThanTho(req, 60 * 1024 * 1024));
      await lark.uploadAttachment(id, F.chi[key].name, relDir + '/' + an, cfg.tableId);
      kho.at = 0;
      return json(res, { ok: true });
    } finally {
      try { fs.rmSync(absDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const mDl = p.match(/^\/api\/chi\/(rec[A-Za-z0-9]+)\/tep\/([A-Za-z0-9]+)\/tai$/);
  if (mDl && req.method === 'GET') {
    const [, id, token] = mDl;
    let dir = null;
    try {
      dir = await lark.downloadAttachment(id, token, 'dl-' + Date.now(), cfg.tableId);
      const files = fs.readdirSync(dir);
      if (!files.length) return json(res, { error: 'Không tải được tệp' }, 404);
      const file = path.join(dir, files[0]);
      const buf = fs.readFileSync(file);
      const kieu = MIME_TEP[path.extname(file).toLowerCase()] || 'application/octet-stream';
      /* Xem trước trong app thì phải để `inline`; ?tai=1 là người ta bấm "Tải
       * xuống" nên ép `attachment`. Kiểu không xem được cũng tải luôn — mở ra
       * chỉ được một trang trắng. */
      /* HEIC/HEIF thì KHÔNG: trình duyệt nào cũng chịu, để inline là người ta
       * nhận một khung trắng. Ảnh iPhone tải thẳng lên hay dính đuôi này. */
      const xemDuoc = (/^(image|text)\//.test(kieu) || kieu === 'application/pdf')
        && !/^image\/hei[cf]$/.test(kieu);
      const tai = url.searchParams.get('tai') === '1' || !xemDuoc;
      res.writeHead(200, {
        'Content-Type': kieu,
        'Content-Length': buf.length,
        'Content-Disposition': (tai ? 'attachment' : 'inline') +
          "; filename*=UTF-8''" + encodeURIComponent(files[0]),
        'Cache-Control': 'private, max-age=300',
      });
      return res.end(buf);
    } finally {
      if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
    }
  }

  /* ---- nạp quỹ ---- */
  if (p === '/api/nap' && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const body = await docThan(req);
    if (!(Number(body.tien) > 0)) return json(res, { error: 'Số tiền nạp phải lớn hơn 0.' }, 400);
    if (!body.dot || !body.dot.length) {
      const k = await nap();
      const id = await dotMacDinh(k.dot.map((r) => doiRa(r, F.dot)));
      if (id) body.dot = [id];
    }
    if (!body.loai) body.loai = 'Nạp thêm';
    if (!body.ngay) body.ngay = new Date().toISOString();
    if (!body.noiDung) body.noiDung = 'Tạm ứng ngày ' + new Date().toLocaleDateString('vi-VN');
    await lark.createRecord(doiVao(body, F.nap), cfg.napTableId);
    kho.at = 0;
    return json(res, { ok: true });
  }

  /* ---- mở đợt mới ---- */
  if (p === '/api/dot' && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const body = await docThan(req);
    if (!String(body.ma || '').trim()) return json(res, { error: 'Phải có mã phiếu chi.' }, 400);
    const me = await toiLaAi();
    if (!body.nguoiGiu && me) body.nguoiGiu = [me.id];
    if (!body.tinhTrang) body.tinhTrang = 'Đang dùng';
    if (!body.ngayMo) body.ngayMo = new Date().toISOString();
    await lark.createRecord(doiVao(body, F.dot), cfg.dotTableId);
    kho.at = 0;
    return json(res, { ok: true });
  }

  const mDot = p.match(/^\/api\/dot\/(rec[A-Za-z0-9]+)$/);
  if (mDot && req.method === 'PATCH') {
    if (!(await doiChuQuy(res))) return;
    const cells = doiVao(await docThan(req), F.dot);
    if (!Object.keys(cells).length) return json(res, { error: 'Không có gì để sửa' }, 400);
    await lark.updateRecord(mDot[1], cells, cfg.dotTableId);
    kho.at = 0;
    return json(res, { ok: true });
  }

  /* ---- quyết toán theo lô ----
   * Gán một mã QTTU cho nhiều khoản cùng lúc. Đây là việc hay làm nhất sau khi
   * nộp chứng từ, và là việc mà làm tay trên Base thì phải sửa từng dòng. */
  if (p === '/api/quyet-toan' && req.method === 'POST') {
    if (!(await doiQuyenQuyetToan(res))) return;
    const body = await docThan(req);
    const ids = (body.ids || []).filter((x) => /^rec[A-Za-z0-9]+$/.test(x));
    const ma = String(body.ma || '').trim();
    if (!ids.length) return json(res, { error: 'Chưa chọn khoản nào.' }, 400);
    if (!ma) return json(res, { error: 'Phải nhập mã quyết toán.' }, 400);

    /* ---------------------------------------------------------------------
     * CHỐT CHỐNG XOÁ SỔ LỊCH SỬ QUYẾT TOÁN
     * -------------------------------------------------------------------
     * Ô tích ở đầu bảng chọn cả trang. Trong 163 khoản của sổ thì 154 khoản
     * ĐÃ có mã QTTU riêng của chúng, gán từ những đợt quyết toán cũ. Bấm
     * "Quyết toán 163 khoản" với một mã mới là ghi đè sạch 154 mã đó — không
     * hoàn lại được, và kế toán mất đường đối chiếu với phiếu chi cũ.
     *
     * Giao diện đã cảnh báo, nhưng cảnh báo không phải hàng rào: một tab mở
     * từ hôm qua, một cú Enter nhầm, là xong. Nên chốt ở đây: đụng vào mã đã
     * có thì phải nói thẳng `deGhiDe: true`.
     * ------------------------------------------------------------------- */
    const k = await nap();
    const theoId = {};
    k.chi.map((r) => doiRa(r, F.chi)).forEach((c) => { theoId[c.id] = c; });
    const deGhiDe = ids
      .map((id) => theoId[id])
      .filter((c) => c && String(c.maQuyetToan || '').trim()
        && String(c.maQuyetToan).trim() !== ma);
    if (deGhiDe.length && !body.deGhiDe) {
      return json(res, {
        error: deGhiDe.length + ' khoản đã có mã quyết toán riêng ('
          + deGhiDe.slice(0, 3).map((c) => c.maQuyetToan).join(', ')
          + (deGhiDe.length > 3 ? '…' : '') + '). Gán mã mới là xoá hẳn mã cũ.',
        code: 'GHI_DE_MA_CU',
        so: deGhiDe.length,
        vidu: deGhiDe.slice(0, 5).map((c) => ({ noiDung: c.noiDung, ma: c.maQuyetToan })),
      }, 409);
    }

    const cells = {
      [F.chi.maQuyetToan.name]: ma,
      [F.chi.tinhTrang.name]: 'Đã quyết toán',
      [F.chi.lyDoTuChoi.name]: '',   // đã nhận rồi thì lời từ chối cũ hết hiệu lực
    };
    const map = {};
    ids.forEach((id) => { map[id] = cells; });
    if (typeof lark.updateMany === 'function') {
      await lark.updateMany(map, cfg.tableId);
    } else {
      for (const id of ids) await lark.updateRecord(id, cells, cfg.tableId);
    }
    kho.at = 0;
    return json(res, { ok: true, so: ids.length });
  }

  /* ---------------------------------------------------------------------
   * KẾ TOÁN DUYỆT HOẶC TRẢ LẠI TỪNG KHOẢN
   * -------------------------------------------------------------------
   * Quyết toán theo lô hợp với anh Hùng: đóng sổ một đợt hàng chục khoản.
   * Kế toán thì làm ngược lại — soi TỪNG dòng, khoản nào đủ chứng từ thì
   * nhận, khoản nào thiếu thì trả về. Bắt họ tích chọn rồi mở cửa sổ cho một
   * dòng là bắt đi đường vòng cho việc hay làm nhất của họ.
   *
   * Trả lại PHẢI có lý do. Một dòng đỏ không kèm chữ thì anh Hùng nhận về một
   * câu đố, và câu đố đó sẽ quay lại thành một tin nhắn hỏi "sao trả?".
   * ------------------------------------------------------------------- */
  const mDuyet = p.match(/^\/api\/chi\/(rec[A-Za-z0-9]+)\/(duyet|tu-choi)$/);
  if (mDuyet && req.method === 'POST') {
    if (!(await doiQuyenQuyetToan(res))) return;
    const [, id, viec] = mDuyet;
    const body = await docThan(req);
    const k = await nap();
    const rec = k.chi.find((r) => r.record_id === id);
    if (!rec) return json(res, { error: 'Không thấy khoản chi này trong sổ.' }, 404);
    const truoc = doiRa(rec, F.chi);

    if (viec === 'tu-choi') {
      const lyDo = String(body.lyDo || '').trim();
      if (!lyDo) return json(res, { error: 'Phải ghi nội dung cần điều chỉnh.' }, 400);
      await lark.updateRecord(id, {
        [F.chi.tinhTrang.name]: cfg.CHO_CHINH,
        [F.chi.lyDoTuChoi.name]: lyDo,
      }, cfg.tableId);
      kho.at = 0;
      return json(res, { ok: true, tinhTrang: cfg.CHO_CHINH, lyDo });
    }

    /* Duyệt = gán mã quyết toán. Dùng ĐÚNG ô "Mã quyết toán" sẵn có chứ không
     * đẻ ô thứ hai: một khoản một mã, nếu không kế toán và người giữ quỹ mỗi
     * bên nhìn một con số rồi cãi nhau xem cái nào thật. */
    const ma = String(body.ma || '').trim();
    if (!ma) return json(res, { error: 'Phải nhập mã quyết toán.' }, 400);
    const cu = String(truoc.maQuyetToan || '').trim();
    if (cu && cu !== ma && !body.deGhiDe) {
      return json(res, {
        error: 'Khoản này đã mang mã ' + cu + '. Gán mã mới là xoá hẳn mã cũ.',
        code: 'GHI_DE_MA_CU', so: 1, vidu: [{ noiDung: truoc.noiDung, ma: cu }],
      }, 409);
    }
    /* Duyệt là xoá lời từ chối cũ: khoản đã qua rồi mà còn treo câu "thiếu hoá
     * đơn" thì lần sau đọc lại không biết còn đúng nữa không. */
    await lark.updateRecord(id, {
      [F.chi.maQuyetToan.name]: ma,
      [F.chi.tinhTrang.name]: 'Đã quyết toán',
      [F.chi.lyDoTuChoi.name]: '',
    }, cfg.tableId);
    kho.at = 0;
    return json(res, { ok: true, ma });
  }

  /* ---------------------------------------------------------------------
   * BỎ QUYẾT TOÁN — đưa khoản về lại trạng thái trước khi đóng sổ
   * -------------------------------------------------------------------
   * Quyết toán trước đây là đường một chiều: bấm nhầm mã, bấm nhầm dòng, hay
   * đơn giản là đổi ý sau khi soi kỹ hơn — đều không lùi được từ trong app,
   * phải mở Base sửa tay. Mà mở Base sửa tay chính là việc app này sinh ra để
   * bỏ đi.
   *
   * Trạng thái trước luôn là "Đã chi": tiền đã rời quỹ rồi mới có chuyện đóng
   * sổ. Không cần cột nhớ trạng thái cũ cho một đường lùi chỉ có một đích.
   * ------------------------------------------------------------------- */
  const mBo = p.match(/^\/api\/chi\/(rec[A-Za-z0-9]+)\/bo-quyet-toan$/);
  if (mBo && req.method === 'POST') {
    if (!(await doiQuyenQuyetToan(res))) return;
    const k = await nap();
    const rec = k.chi.find((r) => r.record_id === mBo[1]);
    if (!rec) return json(res, { error: 'Không thấy khoản chi này trong sổ.' }, 404);
    const truoc = doiRa(rec, F.chi);
    if (truoc.tinhTrang !== 'Đã quyết toán' && !String(truoc.maQuyetToan || '').trim()) {
      return json(res, { error: 'Khoản này chưa quyết toán, không có gì để bỏ.' }, 400);
    }
    await lark.updateRecord(mBo[1], {
      [F.chi.maQuyetToan.name]: '',
      [F.chi.tinhTrang.name]: 'Đã chi',
    }, cfg.tableId);
    kho.at = 0;
    return json(res, { ok: true, maCu: truoc.maQuyetToan || '' });
  }

  /* ---------------------------------------------------------------------
   * BỎ QUYẾT TOÁN THEO LÔ
   * -------------------------------------------------------------------
   * Gán nhầm một mã cho ba chục khoản thì gỡ từng cái là ba chục lần bấm, và
   * đúng lúc đang sốt ruột nhất. Cùng hình dạng với /api/quyet-toan: nhận một
   * mảng id, làm một lượt.
   *
   * CHỈ ĐỤNG KHOẢN ĐANG CÓ MÃ. Chọn cả trang rồi bấm thì khoản chưa quyết toán
   * bị bỏ qua chứ không bị đổi tình trạng lây — đổi lây là sửa dữ liệu người
   * dùng không hề định sửa.
   * ------------------------------------------------------------------- */
  if (p === '/api/bo-quyet-toan' && req.method === 'POST') {
    if (!(await doiQuyenQuyetToan(res))) return;
    const body = await docThan(req);
    const ids = (body.ids || []).filter((x) => /^rec[A-Za-z0-9]+$/.test(x));
    if (!ids.length) return json(res, { error: 'Chưa chọn khoản nào.' }, 400);

    const k = await nap();
    const theoId = {};
    k.chi.map((r) => doiRa(r, F.chi)).forEach((c) => { theoId[c.id] = c; });
    const dungLa = ids.filter((id) => {
      const c = theoId[id];
      return c && (String(c.maQuyetToan || '').trim() || c.tinhTrang === 'Đã quyết toán');
    });
    if (!dungLa.length) {
      return json(res, { error: 'Không khoản nào trong số đã chọn đang ở trạng thái quyết toán.' }, 400);
    }

    const cells = {
      [F.chi.maQuyetToan.name]: '',
      [F.chi.tinhTrang.name]: 'Đã chi',
    };
    const map = {};
    dungLa.forEach((id) => { map[id] = cells; });
    if (typeof lark.updateMany === 'function') await lark.updateMany(map, cfg.tableId);
    else for (const id of dungLa) await lark.updateRecord(id, cells, cfg.tableId);
    kho.at = 0;
    return json(res, { ok: true, so: dungLa.length, boQua: ids.length - dungLa.length });
  }

  /* ---- tệp tĩnh ---- */
  if (req.method === 'GET') {
    const ten = p === '/' ? '/index.html' : p;
    const f = path.join(__dirname, 'public', ten.replace(/^\/+/, ''));
    if (f.startsWith(path.join(__dirname, 'public')) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const buf = fs.readFileSync(f);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
        'Content-Length': buf.length,
        'Cache-Control': 'no-cache',
      });
      return res.end(buf);
    }
  }

  return json(res, { error: 'Not found' }, 404);
}

/* ---------------- tiện ---------------- */
function json(res, obj, code) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': b.length,
    'Cache-Control': 'no-store',
  });
  res.end(b);
}

function docThan(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 4000000) req.destroy(); });
    req.on('end', () => {
      try { resolve(d ? JSON.parse(d) : {}); }
      catch (_) { reject(new Error('JSON body không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

function docThanTho(req, tran) {
  return new Promise((resolve, reject) => {
    const cs = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > tran) { req.destroy(); return reject(new Error('Tệp quá lớn (tối đa ' + Math.round(tran / 1048576) + ' MB)')); }
      cs.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(cs)));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};
const MIME_TEP = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.heic': 'image/heic',
};

server.listen(cfg.port, BIND, () => {
  console.log('\n  Rooty Trip · Quỹ chi phí Marketing');
  console.log('  ->  http://localhost:' + cfg.port);
  console.log('\n  Base  : ' + cfg.baseToken);
  console.log('  Chế độ: ' + cfg.mode + '\n');
});
