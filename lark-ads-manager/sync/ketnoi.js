'use strict';
/**
 * Đọc/ghi cấu hình kết nối (ket-noi.json).
 *
 * Token CHỈ nằm trong file này trên máy anh — không bao giờ trả ra API/giao diện,
 * không ghi vào Lark Base, không ghi vào log.
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

function read() {
  let raw = {};
  try { raw = stripComments(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (_) { raw = {}; }
  return {
    meta: { ...DEFAULT.meta, ...(raw.meta || {}) },
    tiktok: { ...DEFAULT.tiktok, ...(raw.tiktok || {}) },
    googleSheet: { ...DEFAULT.googleSheet, ...(raw.googleSheet || {}) },
    dongBo: { ...DEFAULT.dongBo, ...(raw.dongBo || {}) },
  };
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
  ['meta', 'tiktok', 'googleSheet'].forEach((k) => {
    if (next[k] && next[k].enabled != null) cur[k].enabled = !!next[k].enabled;
  });
  fs.writeFileSync(FILE, JSON.stringify(cur, null, 2), 'utf8');
  return cur;
}

/** Bản mô tả an toàn để trả ra giao diện — che token, chỉ nói có/không. */
function status() {
  const c = read();
  const exists = fs.existsSync(FILE);
  return {
    fileTonTai: exists,
    file: cfg.connectFile,
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

module.exports = { read, writeOptions, status, hanToken, FILE, DEFAULT };
