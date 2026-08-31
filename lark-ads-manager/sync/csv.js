'use strict';
/**
 * Đọc CSV xuất từ Ads Manager (Meta / TikTok / Google) và Google Sheet.
 *
 * Tự nhận cột theo tên tiếng Việt hoặc tiếng Anh, tự nhận dấu phân cách
 * (`,` `;` tab) và tự nhận định dạng số Việt (1.234.567,89) lẫn Anh (1,234,567.89).
 */

/* ---------------- tách CSV ---------------- */
/** Tách 1 dòng CSV có tôn trọng dấu ngoặc kép. */
function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectSep(sample) {
  const counts = [',', ';', '\t'].map((s) => [s, sample.split(s).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/**
 * Trả { headers, rows } — rows là mảng object theo header gốc.
 * Bỏ qua các dòng mở đầu không phải bảng (Meta/Google hay chèn tiêu đề báo cáo).
 */
function parse(text) {
  const clean = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = clean.split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return { headers: [], rows: [], sep: ',' };

  const sep = detectSep(lines.slice(0, 5).join('\n'));

  // dòng header = dòng đầu tiên có ≥3 ô và nhận ra được ít nhất 1 cột đã biết
  let headerIdx = 0;
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const cells = splitLine(lines[i], sep);
    if (cells.length >= 3 && cells.some((c) => lookup(c))) { headerIdx = i; break; }
  }

  const headers = splitLine(lines[headerIdx], sep);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep);
    if (cells.every((c) => c === '')) continue;
    const o = {};
    headers.forEach((h, j) => { o[h] = cells[j] == null ? '' : cells[j]; });
    rows.push(o);
  }
  return { headers, rows, sep, headerIdx };
}

/* ---------------- số ---------------- */
/** '1.234.567,89' · '1,234,567.89' · '12 345' · '₫1.234' → number */
function parseNumber(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s || /^(--|-|n\/a|—)$/i.test(s)) return 0;
  s = s.replace(/[^\d.,\-]/g, '');          // bỏ ₫, đ, %, khoảng trắng, chữ
  if (!s) return 0;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // dấu nào ở sau cùng thì là dấu thập phân
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // chỉ có dấu phẩy: nếu sau nó đúng 1–2 số thì là thập phân, còn lại là phân cách nghìn
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    // chỉ có dấu chấm: nhiều dấu chấm ⇒ phân cách nghìn kiểu VN
    const parts = s.split('.');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = parts.join('');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Chuẩn hoá ngày về YYYY-MM-DD từ nhiều định dạng phổ biến. */
function parseDate(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);        // dd/mm/yyyy
  if (m) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  m = s.match(/^(\d{8})$/);                                  // 20260827
  if (m) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    // lấy theo giờ địa phương, không qua UTC — kẻo lệch 1 ngày
    const d = new Date(t);
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }
  return '';
}
const p2 = (x) => String(x).padStart(2, '0');

/* ---------------- nhận cột ---------------- */
const norm = (s) => String(s == null ? '' : s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // bỏ dấu tiếng Việt
  .replace(/đ/g, 'd')                            // đ → d (không tách được bằng NFD)
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Từ điển: khoá chuẩn ⇐ các tên cột có thể gặp. */
const SYNONYMS = {
  date: ['day', 'date', 'ngay', 'reporting starts', 'date start', 'stat time day', 'ngay bao cao',
    'ngay bat dau bao cao', 'thoi gian', 'ngay thang', 'reporting ends'],
  campaignExtId: ['campaign id', 'ma chien dich', 'id chien dich', 'campaign identifier'],
  campaignName: ['campaign name', 'ten chien dich', 'campaign', 'chien dich'],
  groupExtId: ['ad set id', 'adset id', 'adgroup id', 'ad group id', 'id nhom quang cao', 'ma nhom quang cao'],
  groupName: ['ad set name', 'adset name', 'adgroup name', 'ad group name', 'ten nhom quang cao',
    'nhom quang cao', 'ad group', 'ad set'],
  adExtId: ['ad id', 'id quang cao', 'ma quang cao', 'creative id'],
  adName: ['ad name', 'ten quang cao', 'quang cao', 'ad', 'creative name'],
  spend: ['amount spent vnd', 'amount spent', 'spend', 'cost', 'cost vnd', 'chi phi', 'chi phi vnd',
    'so tien da chi tieu', 'so tien da chi tieu vnd', 'tong chi phi', 'chi tieu', 'total cost'],
  impressions: ['impressions', 'impr', 'luot hien thi', 'hien thi', 'so luot hien thi', 'lan hien thi'],
  clicks: ['clicks all', 'clicks', 'luot click', 'so lan nhap', 'so lan nhap chuot', 'nhap chuot',
    'link clicks', 'luot nhap vao lien ket', 'so luot click', 'clicks tat ca',
    // TikTok Ads Manager: "Lượt nhấp (đích đến)" / "Clicks (destination)"
    'luot nhap', 'clicks destination', 'destination clicks'],
  conversions: ['conversions', 'conversion', 'chuyen doi', 'luot chuyen doi', 'so luot chuyen doi',
    'results', 'ket qua', 'total conversions', 'messaging conversations started',
    'cuoc hoi thoai qua tin nhan da bat dau', 'so cuoc hoi thoai qua tin nhan da bat dau',
    'tin nhan', 'leads', 'so luong khach hang tiem nang'],
};

const INDEX = (() => {
  const m = new Map();
  Object.entries(SYNONYMS).forEach(([key, list]) => list.forEach((s) => {
    if (!m.has(norm(s))) m.set(norm(s), key);
  }));
  return m;
})();

/** Tên cột gốc → khoá chuẩn, hoặc null. Khớp chính xác trước, rồi khớp chứa. */
function lookup(header) {
  const n = norm(header);
  if (!n) return null;
  if (INDEX.has(n)) return INDEX.get(n);
  // khớp lỏng: tên cột chứa nguyên cụm từ điển (ưu tiên cụm dài nhất)
  let best = null, bestLen = 0;
  for (const [syn, key] of INDEX) {
    if (syn.length > bestLen && n.includes(syn) && syn.length >= 4) { best = key; bestLen = syn.length; }
  }
  return best;
}

/** Dò sơ đồ cột: { khoáChuẩn: tênCộtGốc }. Cột trùng khoá thì giữ cột đầu. */
function mapColumns(headers) {
  const map = {};
  const unknown = [];
  headers.forEach((h) => {
    const key = lookup(h);
    if (!key) { unknown.push(h); return; }
    if (!map[key]) map[key] = h;
  });
  return { map, unknown };
}

/**
 * CSV → mảng dòng chuẩn hoá.
 * platform bắt buộc truyền từ ngoài (an toàn hơn đoán theo tên cột).
 */
function toRows(text, { platform, level = 'ad' } = {}) {
  const { headers, rows } = parse(text);
  if (!headers.length) throw new Error('Không đọc được CSV: file trống hoặc sai định dạng');
  const { map, unknown } = mapColumns(headers);

  const missing = ['date', 'spend'].filter((k) => !map[k]);
  if (missing.length) {
    throw new Error(`CSV thiếu cột bắt buộc: ${missing.join(', ')}. Cột đọc được: ${headers.join(' | ')}`);
  }
  if (!map.adName && !map.adExtId && !map.groupName && !map.campaignName) {
    throw new Error('CSV không có cột nào để nhận ra quảng cáo/nhóm/chiến dịch');
  }

  const g = (r, k) => (map[k] ? r[map[k]] : '');
  const out = [];
  const skipped = [];
  rows.forEach((r, i) => {
    const date = parseDate(g(r, 'date'));
    if (!date) { skipped.push({ dong: i + 2, ly_do: 'không đọc được ngày' }); return; }

    const adName = String(g(r, 'adName') || '').trim();
    const groupName = String(g(r, 'groupName') || '').trim();
    const campaignName = String(g(r, 'campaignName') || '').trim();
    // cấp adgroup: coi nhóm quảng cáo là đơn vị "quảng cáo" trong Base
    const useGroupAsAd = level === 'adgroup' || (!adName && !g(r, 'adExtId'));

    const row = {
      platform,
      date,
      campaignExtId: String(g(r, 'campaignExtId') || '').trim(),
      campaignName,
      groupExtId: String(g(r, 'groupExtId') || '').trim(),
      groupName: groupName || campaignName,
      adExtId: String((useGroupAsAd ? g(r, 'groupExtId') : g(r, 'adExtId')) || '').trim(),
      adName: (useGroupAsAd ? (groupName || campaignName) : adName),
      spend: parseNumber(g(r, 'spend')),
      impressions: parseNumber(g(r, 'impressions')),
      clicks: parseNumber(g(r, 'clicks')),
      conversions: parseNumber(g(r, 'conversions')),
    };
    if (!row.adName && !row.adExtId) { skipped.push({ dong: i + 2, ly_do: 'không có tên/ID quảng cáo' }); return; }
    out.push(row);
  });

  return { rows: out, columnMap: map, unknownColumns: unknown, skipped, headers };
}

module.exports = { parse, parseNumber, parseDate, mapColumns, lookup, toRows, norm };
