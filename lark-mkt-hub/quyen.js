'use strict';
/**
 * Phân quyền thành viên — lưu trong một bảng Lark Base, không lưu file.
 *
 * Vì sao Base chứ không phải file JSON: ổ đĩa của Render là tạm, file mất sau mỗi
 * lần deploy. Để trong Base thì quản lý sửa được cả trong app lẫn trực tiếp trên
 * Lark, và dữ liệu đi cùng chỗ với mọi thứ khác của phòng.
 *
 * Bảng: "Phân quyền app" (mặc định nằm trong Base Tracking).
 *   Người · Email · open_id · Vai · Base được xem · Xem toàn bộ base ·
 *   Được tạo mới · Xem chi phí · Ghi chú
 *
 * Khớp người theo EMAIL trước, rồi mới tới open_id: open_id khác nhau giữa các
 * app Lark nên không dùng làm khoá chính được.
 */
const cfg = require('./config');

const BASE = process.env.HUB_QUYEN_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG';
const TABLE = process.env.HUB_QUYEN_TABLE || 'tblBKm6ZurhN3703';

const F = {
  nguoi: 'Người',
  email: 'Email',
  openId: 'open_id',
  vai: 'Vai',
  base: 'Base được xem',
  toanBo: 'Xem toàn bộ base',
  taoMoi: 'Được tạo mới',
  chiPhi: 'Xem chi phí',
  ghiChu: 'Ghi chú',
};

/* ---------------- gọi Base bằng token của app ---------------- */
let tokenCache = { value: null, exp: 0 };

async function tenantToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  if (!cfg.appId || !cfg.appSecret) throw new Error('Thiếu LARK_APP_ID / LARK_APP_SECRET');
  const r = await fetch(cfg.apiHost + '/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error('Lấy tenant_access_token thất bại: ' + (d.msg || d.code));
  tokenCache = { value: d.tenant_access_token, exp: Date.now() + Math.max(60, (d.expire || 7200) - 300) * 1000 };
  return tokenCache.value;
}

const url = (duoi) => cfg.apiHost + '/open-apis/base/v3/bases/' + BASE + '/tables/' + TABLE + duoi;

async function goi(method, duoi, body) {
  const token = await tenantToken();
  const r = await fetch(url(duoi), {
    method,
    headers: Object.assign({ Authorization: 'Bearer ' + token },
      body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (d.code !== 0) {
    const e = new Error('Lark API ' + d.code + ': ' + (d.msg || 'lỗi không rõ'));
    e.code = d.code;
    throw e;
  }
  return d.data || {};
}

/* ---------------- đọc ---------------- */
const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : (x && (x.text || x.name)) || '')).join('');
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
};

function doiHang(fieldIds, ids, rows) {
  // Base trả dạng cột -> đổi về từng bản ghi, khoá là TÊN cột cho dễ đọc
  return rows.map((row, i) => {
    const o = { id: ids[i] };
    fieldIds.forEach((ten, j) => { o[ten] = row[j]; });
    return o;
  });
}

let cache = { at: 0, ds: null };
let mapCot = { at: 0, theoId: null };

/** id cột -> tên cột. Bản ghi Base trả về theo id, mà code đọc theo tên cho dễ hiểu. */
async function tenCot() {
  if (mapCot.theoId && Date.now() - mapCot.at < 5 * 60000) return mapCot.theoId;
  const d = await goi('GET', '/fields?limit=100&offset=0');
  const ds = d.fields || d.items || [];
  const theoId = {};
  ds.forEach((f) => { theoId[f.field_id || f.id] = f.field_name || f.name; });
  mapCot = { at: Date.now(), theoId };
  return theoId;
}

async function docTatCa(boQuaCache) {
  if (!boQuaCache && cache.ds && Date.now() - cache.at < 20000) return cache.ds;

  const theoId = await tenCot();
  const out = [];
  let offset = 0;
  for (let trang = 0; trang < 10; trang++) {
    const d = await goi('GET', '/records?limit=200&offset=' + offset);
    const ten = (d.field_id_list || []).map((id) => theoId[id] || id);
    out.push(...doiHang(ten, d.record_id_list || [], d.data || []));
    if (!d.has_more) break;
    offset += 200;
  }

  const ds = out.map((r) => ({
    recordId: r.id,
    nguoi: asText(r[F.nguoi]),
    email: asText(r[F.email]).trim().toLowerCase(),
    openId: asText(r[F.openId]).trim(),
    vai: asText(Array.isArray(r[F.vai]) ? r[F.vai][0] : r[F.vai]) || '',
    base: asText(r[F.base]).split(',').map((x) => x.trim()).filter(Boolean),
    toanBo: r[F.toanBo] === true,
    taoMoi: r[F.taoMoi] === true,
    chiPhi: r[F.chiPhi] === true,
    ghiChu: asText(r[F.ghiChu]),
  })).filter((r) => r.email || r.openId || r.nguoi);

  cache = { at: Date.now(), ds };
  return ds;
}

/** Dòng phân quyền của một người, hoặc null nếu chưa khai. */
async function cuaNguoi(nguoi) {
  if (!nguoi) return null;
  const ds = await docTatCa();
  const mail = String(nguoi.email || '').trim().toLowerCase();
  return ds.find((r) => mail && r.email === mail) ||
         ds.find((r) => nguoi.id && r.openId === nguoi.id) || null;
}

/* ---------------- ghi ---------------- */
async function ghi(hang) {
  const cells = {
    [F.nguoi]: hang.nguoi || '',
    [F.email]: (hang.email || '').trim(),
    [F.openId]: (hang.openId || '').trim(),
    [F.vai]: hang.vai === 'Quản lý' ? 'Quản lý' : 'Nhân sự',
    [F.base]: (hang.base || []).join(','),
    [F.toanBo]: !!hang.toanBo,
    [F.taoMoi]: !!hang.taoMoi,
    [F.chiPhi]: !!hang.chiPhi,
    [F.ghiChu]: hang.ghiChu || '',
  };

  if (hang.recordId) {
    await goi('POST', '/records/batch_update', { update_records: { [hang.recordId]: cells } });
    cache.at = 0;
    return hang.recordId;
  }
  const ten = Object.keys(cells);
  const d = await goi('POST', '/records/batch_create', {
    fields: ten, rows: [ten.map((n) => cells[n])],
  });
  cache.at = 0;
  return (d.record_id_list || [])[0] || null;
}

async function xoa(recordId) {
  await goi('POST', '/records/batch_delete', { record_id_list: [recordId] });
  cache.at = 0;
}

function xoaCache() { cache.at = 0; }

module.exports = {
  BASE, TABLE, F,
  docTatCa, cuaNguoi, ghi, xoa, xoaCache,
  larkUrl: 'https://rootytrip2.sg.larksuite.com/base/' + BASE + '?table=' + TABLE,
};
