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
  try { if (fs.readFileSync(FILE, 'utf8').trim()) return 'file'; } catch (_) {}
  if (process.env.ADS_CONNECT_JSON) return 'env';
  return 'trong';
}

function read() {
  let raw = {};
  try { raw = stripComments(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (_) { raw = {}; }
  // Không có file (hoặc file hỏng) -> thử biến môi trường. File luôn thắng, để sửa
  // trên máy cá nhân có hiệu lực ngay mà không phải xoá biến.
  if (!Object.keys(raw).length && process.env.ADS_CONNECT_JSON) {
    try { raw = stripComments(JSON.parse(process.env.ADS_CONNECT_JSON)); }
    catch (e) { console.error('  ADS_CONNECT_JSON không phải JSON hợp lệ: ' + e.message); raw = {}; }
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
  fs.writeFileSync(FILE, JSON.stringify(cur, null, 2), 'utf8');
  /* Trên server chung, file vừa ghi sống tới lần deploy tiếp theo rồi mất. Báo ra
   * để giao diện nói thẳng là phải cập nhật biến ADS_CONNECT_JSON, thay vì để anh
   * tưởng đã lưu xong rồi vài hôm sau thấy kênh tự tắt. */
  if (nguon() === 'env' || process.env.ADS_CONNECT_JSON) cur._tamThoi = true;
  return cur;
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
    canhBaoODiaTam: ng === 'file' && !!process.env.RENDER && !process.env.ADS_CONNECT_JSON,
    dongBo: c.dongBo,
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

module.exports = { read, writeOptions, status, hanToken, nguon, FILE, DEFAULT };
