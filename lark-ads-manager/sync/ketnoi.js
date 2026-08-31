'use strict';
/**
 * Đọc/ghi cấu hình kết nối (ket-noi.json).
 *
 * Token CHỈ nằm trong file này trên máy anh — không bao giờ trả ra API/giao diện,
 * không ghi vào Lark Base, không ghi vào log.
 *
 * TRÊN SERVER CHUNG (Render) thì ổ đĩa là tạm: file này mất sau mỗi lần deploy,
 * và mất token là các kênh tự tắt. Nên có thêm đường thứ hai: biến môi trường
 * ADS_CONNECT_JSON chứa đúng nội dung file đó. Cùng cách metrics.js đã làm với
 * muc-tieu.json / ADS_TARGETS_JSON.
 *
 * Vì sao là biến môi trường chứ KHÔNG phải Lark Base — dù bảng phân quyền thì để
 * trong Base: token quảng cáo là bí mật, ai xem được Base là xem được nó, mà cả
 * phòng đều xem được Base. Biến môi trường của Render mới là chỗ giữ bí mật.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

const FILE = path.join(__dirname, '..', cfg.connectFile);

const DEFAULT = {
  meta: {
    enabled: false, accessToken: '', accountIds: [], apiVersion: 'v21.0',
    conversionMetric: 'onsite_conversion.messaging_conversation_started_7d',
    clickMetric: 'clicks',
    tokenVinhVien: false, tokenHetHanLuc: '',
  },
  tiktok: { enabled: false, accessToken: '', advertiserIds: [], conversionMetric: 'conversion' },
  googleSheet: { enabled: false, csvUrl: '', level: 'adgroup' },
  /* Google Ads API thật. Song song với googleSheet: chưa được Google duyệt
   * developer token thì đi đường Sheet, duyệt rồi thì bật cái này và tắt cái kia. */
  googleAds: {
    enabled: false, clientId: '', clientSecret: '', refreshToken: '',
    developerToken: '', customerIds: [], loginCustomerId: '', apiVersion: 'v22',
  },
  dongBo: {
    soNgayLui: 7, moiSoGio: 1, khiKhoiDong: true,
    ghiDeNhapTay: true, tuTaoMoi: true,
  },
};

/** Bỏ mọi khoá chú thích `_...` khỏi file cấu hình. */
function stripComments(o) {
  if (Array.isArray(o)) return o;
  if (!o || typeof o !== 'object') return o;
  const out = {};
  Object.keys(o).forEach((k) => { if (!k.startsWith('_')) out[k] = stripComments(o[k]); });
  return out;
}

/** Cấu hình đang lấy từ đâu: 'file' (máy cá nhân) · 'env' (server chung) · 'trong'. */
function nguon() {
  // Cùng luật với read(): file rỗng thông tin thì không tính là nguồn
  try {
    const raw = stripComments(JSON.parse(fs.readFileSync(FILE, 'utf8')));
    if (coThongTin(raw)) return 'file';
  } catch (_) {}
  if (process.env.ADS_CONNECT_JSON) return 'env';
  return 'trong';
}

/**
 * File cấu hình có thông tin dùng được không (token / secret / link).
 *
 * Cần phân biệt "file rỗng" với "file không có gì dùng được". Trên Render, chỉ cần
 * người dùng bấm Lưu tuỳ chọn một lần là app ghi cả khối cấu hình ra file — kể cả
 * khi mọi token đều trống. File đó có đủ khoá nên trước đây được coi là hợp lệ và
 * **che vĩnh viễn biến môi trường**: sửa ADS_CONNECT_JSON bao nhiêu lần cũng vô
 * ích, vì app vẫn đọc cái file rỗng kia. Đúng lỗi đã làm mất cả ba kênh.
 */
function coThongTin(raw) {
  if (!raw || typeof raw !== 'object') return false;
  return Object.values(raw).some((khoi) => {
    if (!khoi || typeof khoi !== 'object') return false;
    return ['accessToken', 'refreshToken', 'clientSecret', 'developerToken', 'csvUrl']
      .some((k) => typeof khoi[k] === 'string' && khoi[k].trim().length > 0);
  });
}

function read() {
  let raw = {};
  try { raw = stripComments(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (_) { raw = {}; }
  // File chỉ thắng khi thật sự CÓ thông tin. File rỗng thì lùi về biến môi trường,
  // để hệ thống tự lành sau mỗi lần deploy thay vì kẹt cứng ở trạng thái trắng.
  if (!coThongTin(raw) && process.env.ADS_CONNECT_JSON) {
    try {
      const tuEnv = stripComments(JSON.parse(process.env.ADS_CONNECT_JSON));
      // Giữ lại tuỳ chọn đồng bộ người dùng vừa sửa trên web, chỉ lấy phần bí mật từ env
      raw = { ...tuEnv, dongBo: { ...(tuEnv.dongBo || {}), ...(raw.dongBo || {}) } };
    } catch (e) {
      console.error('  ADS_CONNECT_JSON không phải JSON hợp lệ: ' + e.message);
    }
  }
  /* Đắp từng phần theo DEFAULT: file cũ chưa có khối mới (VD googleAds) vẫn đọc
   * được, không phải sửa file tay sau mỗi lần thêm kênh. */
  const out = {};
  Object.keys(DEFAULT).forEach((k) => { out[k] = { ...DEFAULT[k], ...(raw[k] || {}) }; });
  return out;
}

/** Chỉ cho sửa các tuỳ chọn không phải bí mật. Token/ID phải sửa trong file. */
function writeOptions(next = {}) {
  const cur = read();
  const d = cur.dongBo;
  const n = next.dongBo || {};
  const numIn = (v, lo, hi, fb) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : fb;
  };
  cur.dongBo = {
    soNgayLui: numIn(n.soNgayLui, 1, 90, d.soNgayLui),
    moiSoGio: numIn(n.moiSoGio, 0, 24, d.moiSoGio),
    khiKhoiDong: n.khiKhoiDong == null ? d.khiKhoiDong : !!n.khiKhoiDong,
    ghiDeNhapTay: n.ghiDeNhapTay == null ? d.ghiDeNhapTay : !!n.ghiDeNhapTay,
    tuTaoMoi: n.tuTaoMoi == null ? d.tuTaoMoi : !!n.tuTaoMoi,
  };
  ['meta', 'tiktok', 'googleAds', 'googleSheet'].forEach((k) => {
    if (next[k] && next[k].enabled != null) cur[k].enabled = !!next[k].enabled;
  });
  ghiFile(cur);
  /* Trên server chung, file vừa ghi sống tới lần deploy tiếp theo rồi mất. Báo ra
   * để giao diện nói thẳng là phải cập nhật biến ADS_CONNECT_JSON, thay vì để anh
   * tưởng đã lưu xong rồi vài hôm sau thấy kênh tự tắt. */
  if (nguon() === 'env' || process.env.ADS_CONNECT_JSON) cur._tamThoi = true;
  return cur;
}

/* =======================================================================
   ĐIỀN TOKEN TỪ GIAO DIỆN
   -----------------------------------------------------------------------
   writeOptions() ở trên cố tình không cho sửa bí mật: hồi đó token chỉ điền
   bằng `node ket-noi.js` trên máy cá nhân. Nhưng khi app chạy trên Render thì
   không có dòng lệnh nào để gõ, nên phải có đường điền ngay trong app.

   Ba quy tắc giữ nguyên, để mở đường này không thành lỗ hổng:
     1. Token ĐI VÀO được, KHÔNG BAO GIỜ đi ra. status()/bieuMau() chỉ trả
        "đã có / chưa có", tuyệt đối không trả lại giá trị.
     2. Ô để TRỐNG nghĩa là GIỮ NGUYÊN cái đang lưu — vì giao diện không hiện
        token cũ nên nếu trống mà xoá thì mỗi lần sửa chỉ số lại mất token.
        Muốn xoá hẳn thì gửi null (nút "Xoá token đã lưu").
     3. File ghi với quyền 0600 (chỉ chủ máy đọc được).
   ======================================================================= */

/** Khai báo các trường giao diện được sửa, kèm cách làm sạch giá trị. */
const TRUONG = {
  meta: [
    ['accessToken', 'biMat'],
    ['accountIds', 'idMeta'],
    ['apiVersion', 'phienBan'],
    ['conversionMetric', 'chiSo'],
    ['clickMetric', 'chiSo'],
  ],
  tiktok: [
    ['accessToken', 'biMat'],
    ['advertiserIds', 'idSo'],
    ['conversionMetric', 'chiSo'],
  ],
  googleAds: [
    ['clientId', 'chuoi'],
    ['clientSecret', 'biMat'],
    ['refreshToken', 'biMat'],
    ['developerToken', 'biMat'],
    ['customerIds', 'idGoogle'],
    ['loginCustomerId', 'idGoogleMot'],
  ],
  googleSheet: [
    ['csvUrl', 'lienKet'],
    ['level', 'capDo'],
  ],
};

/** Trường nào là bí mật — dùng để biết ô trống thì giữ nguyên. */
const LA_BI_MAT = (kenh, key) => (TRUONG[kenh] || []).some(([k, t]) => k === key && t === 'biMat');

const loi = (msg) => { const e = new Error(msg); e.code = 400; return e; };

/** Tách một ô nhiều ID (xuống dòng / dấu phẩy / khoảng trắng) thành mảng, bỏ trùng. */
function dsId(v, lam) {
  const tho = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,;]+/);
  const out = [];
  tho.forEach((x) => {
    const s = lam(String(x).trim());
    if (s && !out.includes(s)) out.push(s);
  });
  return out;
}

const LAM_SACH = {
  // Token dán từ trình duyệt hay dính khoảng trắng / xuống dòng ở hai đầu.
  biMat: (v) => String(v).trim(),
  chuoi: (v) => String(v).trim().slice(0, 300),
  // act_1234567890 hay 1234567890 đều được — cất dạng số cho meta.js tự thêm act_
  idMeta: (v) => dsId(v, (s) => s.replace(/^act_/i, '').replace(/[^0-9]/g, '')),
  idSo: (v) => dsId(v, (s) => s.replace(/[^0-9]/g, '')),
  // Google viết 123-456-7890; gads.js tự bỏ gạch nên cất y như anh nhìn thấy trên Ads
  idGoogle: (v) => dsId(v, (s) => s.replace(/[^0-9-]/g, '').replace(/^-+|-+$/g, '')),
  idGoogleMot: (v) => (dsId(v, (s) => s.replace(/[^0-9-]/g, '').replace(/^-+|-+$/g, ''))[0] || ''),
  phienBan: (v) => {
    const s = String(v).trim();
    if (!s) return '';
    if (!/^v\d+(\.\d+)?$/.test(s)) throw loi('Phiên bản API phải dạng v21.0');
    return s;
  },
  chiSo: (v) => {
    const s = String(v).trim();
    if (s && !/^[a-z0-9_.]{2,80}$/i.test(s)) throw loi('Tên chỉ số chỉ gồm chữ, số, dấu chấm và gạch dưới');
    return s;
  },
  lienKet: (v) => {
    const s = String(v).trim();
    if (s && !/^https?:\/\//i.test(s)) throw loi('Link CSV phải bắt đầu bằng https://');
    return s;
  },
  capDo: (v) => {
    const s = String(v).trim();
    if (s && s !== 'ad' && s !== 'adgroup') throw loi('Cấp độ phải là ad hoặc adgroup');
    return s || 'adgroup';
  },
};

/** Ghi vào file với quyền 0600 — token không để cho tài khoản khác trên máy đọc. */
function ghiFile(cur) {
  fs.writeFileSync(FILE, JSON.stringify(cur, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(FILE, 0o600); } catch (_) {} // Windows bỏ qua, không sao
}

/**
 * Lưu token/ID điền từ giao diện.
 *
 * next = { meta: { accessToken: '…', accountIds: '123, 456' }, ... }
 *   ''   -> giữ nguyên (với ô bí mật) / xoá trắng (với ô thường)
 *   null -> xoá hẳn giá trị đang lưu
 */
function writeSecrets(next = {}) {
  const cur = read();
  const doi = [];

  Object.keys(TRUONG).forEach((kenh) => {
    const g = next[kenh];
    if (!g || typeof g !== 'object') return;
    TRUONG[kenh].forEach(([key, kieu]) => {
      if (!(key in g)) return;
      const v = g[key];
      if (v === null) { cur[kenh][key] = Array.isArray(cur[kenh][key]) ? [] : ''; doi.push(kenh + '.' + key); return; }
      // Ô bí mật để trống = không đụng tới; nếu không, mỗi lần sửa chỉ số lại mất token.
      if (LA_BI_MAT(kenh, key) && String(v).trim() === '') return;
      const sach = LAM_SACH[kieu](v);
      const cu = cur[kenh][key];
      const khac = Array.isArray(sach) ? JSON.stringify(sach) !== JSON.stringify(cu || []) : sach !== cu;
      if (khac) { cur[kenh][key] = sach; doi.push(kenh + '.' + key); }
    });
    if (g.enabled != null) cur[kenh].enabled = !!g.enabled;
  });

  // Token Meta mới thì hạn cũ không còn đúng — xoá đi, server sẽ hỏi lại Meta.
  if (doi.includes('meta.accessToken')) { cur.meta.tokenVinhVien = false; cur.meta.tokenHetHanLuc = ''; }

  ghiFile(cur);
  return { daDoi: doi };
}

/** Ghi lại hạn token Meta sau khi hỏi debug_token (không phải thứ người dùng gõ). */
function writeMetaTokenInfo(info) {
  const cur = read();
  cur.meta.tokenVinhVien = !!(info && info.vinhVien);
  cur.meta.tokenHetHanLuc = (info && info.hetHanLuc) || '';
  ghiFile(cur);
}

/**
 * Giá trị điền sẵn cho biểu mẫu: mọi thứ TRỪ bí mật.
 * Bí mật chỉ trả cờ `daCo…` để giao diện hiện "đã lưu" mà không lộ giá trị.
 */
function bieuMau() {
  const c = read();
  return {
    meta: {
      accountIds: (c.meta.accountIds || []).join(', '),
      apiVersion: c.meta.apiVersion || 'v21.0',
      conversionMetric: c.meta.conversionMetric || '',
      clickMetric: c.meta.clickMetric || '',
      daCoAccessToken: !!c.meta.accessToken,
    },
    tiktok: {
      advertiserIds: (c.tiktok.advertiserIds || []).join(', '),
      conversionMetric: c.tiktok.conversionMetric || '',
      daCoAccessToken: !!c.tiktok.accessToken,
    },
    googleAds: {
      clientId: c.googleAds.clientId || '',
      customerIds: (c.googleAds.customerIds || []).join(', '),
      loginCustomerId: c.googleAds.loginCustomerId || '',
      daCoClientSecret: !!c.googleAds.clientSecret,
      daCoRefreshToken: !!c.googleAds.refreshToken,
      daCoDeveloperToken: !!c.googleAds.developerToken,
    },
    googleSheet: {
      csvUrl: c.googleSheet.csvUrl || '',
      level: c.googleSheet.level || 'adgroup',
      daCoCsvUrl: !!c.googleSheet.csvUrl,
    },
  };
}


/**
 * Kênh nào còn sống sau lần deploy tới.
 *
 * Trên Render, ổ đĩa bị xoá mỗi lần deploy nên chỉ những gì nằm trong
 * ADS_CONNECT_JSON là bền. Ở máy cá nhân thì file không mất, nên mọi thứ đều bền.
 */
function benVung() {
  const dangCo = (khoi) => ['accessToken', 'refreshToken', 'clientSecret', 'developerToken', 'csvUrl']
    .some((k) => khoi && typeof khoi[k] === 'string' && khoi[k].trim().length > 0);

  const c = read();
  const dangChay = ['meta', 'tiktok', 'googleAds', 'googleSheet'].filter((k) => c[k] && c[k].enabled && dangCo(c[k]));

  // Máy cá nhân: file nằm trên đĩa thật, không mất đi đâu
  if (!process.env.RENDER) {
    return { canLo: false, noiLuu: 'file trên máy', dangChay, seMat: [], seCon: dangChay };
  }
  let env = null;
  try { env = stripComments(JSON.parse(process.env.ADS_CONNECT_JSON || 'null')); } catch (_) { env = null; }
  if (!env) {
    return { canLo: dangChay.length > 0, noiLuu: 'chưa có biến môi trường', dangChay, seMat: dangChay, seCon: [] };
  }
  const seCon = dangChay.filter((k) => dangCo(env[k]));
  const seMat = dangChay.filter((k) => !dangCo(env[k]));
  return { canLo: seMat.length > 0, noiLuu: 'ADS_CONNECT_JSON', dangChay, seMat, seCon };
}

/** Bản mô tả an toàn để trả ra giao diện — che token, chỉ nói có/không. */
function status() {
  const c = read();
  const exists = fs.existsSync(FILE);
  const ng = nguon();
  return {
    fileTonTai: exists,
    file: cfg.connectFile,
    // 'file' = máy cá nhân · 'env' = server chung (ADS_CONNECT_JSON) · 'trong' = chưa khai
    nguon: ng,
    // Ổ đĩa Render là tạm: mọi thứ điền qua web đều nằm trên đĩa đó và mất sau deploy.
    canhBaoODiaTam: ng === 'file' && !!process.env.RENDER,
    /**
     * Trường hợp nguy hiểm nhất, và cũng dễ tưởng là an toàn nhất: đã khai
     * ADS_CONNECT_JSON rồi nhưng lại điền thêm token qua web. File tạm ĐÈ LÊN biến
     * môi trường (xem read()), nên app chạy đúng ngay lúc này — tới lần deploy sau
     * file bay mất, tụt về biến môi trường, và phần vừa thêm biến mất theo mà
     * không có gì báo.
     */
    deLenBienMoiTruong: ng === 'file' && !!process.env.RENDER && !!process.env.ADS_CONNECT_JSON,
    /**
     * Kênh nào sống sót qua lần deploy tới.
     *
     * Câu hỏi thật của người dùng không phải "cấu hình nằm ở đâu" mà là "mai deploy
     * xong tôi có phải gắn lại API không". Chỉ có biến môi trường trả lời được:
     * ổ đĩa Render bị xoá mỗi lần deploy, nên kênh nào KHÔNG có trong
     * ADS_CONNECT_JSON là kênh sẽ mất. Trả ra đây để giao diện nói thẳng ra.
     */
    benVung: benVung(),
    oDiaTam: !!process.env.RENDER,
    dongBo: c.dongBo,
    bieuMau: bieuMau(),
    providers: [
      {
        key: 'meta', label: 'Facebook / Meta', enabled: c.meta.enabled,
        coToken: !!c.meta.accessToken, soTaiKhoan: (c.meta.accountIds || []).length,
        taiKhoan: (c.meta.accountIds || []).map(maskAccount),
        chiSoChuyenDoi: c.meta.conversionMetric, chiSoClick: c.meta.clickMetric,
        hanToken: hanToken(c.meta),
        sanSang: !!(c.meta.accessToken && (c.meta.accountIds || []).length),
      },
      {
        key: 'tiktok', label: 'TikTok', enabled: c.tiktok.enabled,
        coToken: !!c.tiktok.accessToken, soTaiKhoan: (c.tiktok.advertiserIds || []).length,
        taiKhoan: (c.tiktok.advertiserIds || []).map(maskAccount),
        chiSoChuyenDoi: c.tiktok.conversionMetric,
        sanSang: !!(c.tiktok.accessToken && (c.tiktok.advertiserIds || []).length),
      },
      {
        key: 'googleAds', label: 'Google Ads (API)', enabled: c.googleAds.enabled,
        coToken: !!(c.googleAds.refreshToken && c.googleAds.developerToken),
        soTaiKhoan: (c.googleAds.customerIds || []).length,
        taiKhoan: (c.googleAds.customerIds || []).map(maskAccount),
        capDo: 'ad',
        thieu: [
          c.googleAds.clientId ? '' : 'clientId',
          c.googleAds.clientSecret ? '' : 'clientSecret',
          c.googleAds.refreshToken ? '' : 'refreshToken',
          c.googleAds.developerToken ? '' : 'developerToken',
          (c.googleAds.customerIds || []).length ? '' : 'customerIds',
        ].filter(Boolean),
        sanSang: !!(c.googleAds.clientId && c.googleAds.clientSecret && c.googleAds.refreshToken &&
          c.googleAds.developerToken && (c.googleAds.customerIds || []).length),
      },
      {
        key: 'googleSheet', label: 'Google Ads (qua Google Sheet)', enabled: c.googleSheet.enabled,
        coToken: !!c.googleSheet.csvUrl, soTaiKhoan: c.googleSheet.csvUrl ? 1 : 0,
        taiKhoan: c.googleSheet.csvUrl ? [maskUrl(c.googleSheet.csvUrl)] : [],
        capDo: c.googleSheet.level,
        sanSang: !!c.googleSheet.csvUrl,
      },
    ],
  };
}

/** Diễn giải hạn token đã lưu thành thứ đọc được, kèm mức độ cần lo. */
function hanToken(m) {
  if (!m.accessToken) return null;
  if (m.tokenVinhVien) return { text: 'không hết hạn', muc: 'ok' };
  if (!m.tokenHetHanLuc) return { text: 'chưa rõ hạn', muc: 'warn' };
  const con = Math.floor((Date.parse(m.tokenHetHanLuc + 'T00:00:00Z') - Date.now()) / 86400000);
  if (con < 0) return { text: `ĐÃ HẾT HẠN ${m.tokenHetHanLuc}`, muc: 'het', conLaiNgay: con };
  if (con <= 10) return { text: `còn ${con} ngày (hết hạn ${m.tokenHetHanLuc})`, muc: 'sapHet', conLaiNgay: con };
  return { text: `còn ${con} ngày (hết hạn ${m.tokenHetHanLuc})`, muc: 'ok', conLaiNgay: con };
}

const maskAccount = (id) => {
  const s = String(id).replace(/^act_/, '');
  return s.length <= 5 ? s : s.slice(0, 3) + '…' + s.slice(-3);
};
const maskUrl = (u) => {
  try { const x = new URL(u); return x.hostname + '/…'; } catch (_) { return 'đã đặt'; }
};

module.exports = { benVung,
  read, writeOptions, writeSecrets, writeMetaTokenInfo, bieuMau,
  status, hanToken, nguon, FILE, DEFAULT,
};
