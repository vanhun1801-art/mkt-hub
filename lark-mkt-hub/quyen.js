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
const os = require('os');
const fsn = require('fs');
const pathn = require('path');
const { execFile } = require('child_process');
const cfg = require('./config');

const BASE = process.env.HUB_QUYEN_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG';
const TABLE = process.env.HUB_QUYEN_TABLE || 'tblBKm6ZurhN3703';

const F = {
  nguoi: 'Người',
  email: 'Email',
  openId: 'open_id',
  vai: 'Vai',
  viTri: 'Vị trí',
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

/* ---------------- gọi Base bằng lark-cli (máy cá nhân, chế độ cli) ----------------
 * Chạy localhost thì không có App Secret, nhưng máy đã đăng nhập lark-cli — dùng
 * luôn phiên đó để đọc/ghi cùng một bảng phân quyền. Nhờ vậy quản lý sửa quyền
 * được cả ở máy mình lẫn trên bản deploy, dữ liệu vẫn một chỗ.
 */
function timLarkCli() {
  if (process.env.LARK_CLI_SCRIPT) return process.env.LARK_CLI_SCRIPT;
  const rel = pathn.join('node_modules', '@larksuite', 'cli', 'scripts', 'run.js');
  const goc = [
    pathn.join(process.env.APPDATA || pathn.join(os.homedir(), 'AppData', 'Roaming'), 'npm'),
    pathn.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    '/usr/local/lib',
    '/usr/lib',
  ];
  for (const r of goc) {
    const p = pathn.join(r, rel);
    if (fsn.existsSync(p)) return p;
  }
  return null;
}

function cli(args) {
  return new Promise((resolve, reject) => {
    const script = timLarkCli();
    if (!script) {
      return reject(new Error('Máy này chưa có lark-cli (npm i -g @larksuite/cli), ' +
        'hoặc chạy chế độ api bằng LARK_APP_ID + LARK_APP_SECRET.'));
    }
    execFile(process.execPath, [script, ...args],
      { timeout: 60000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        const raw = String(stdout || '').trim();
        let j = null;
        const s = raw.indexOf('{');
        const e = raw.lastIndexOf('}');
        if (s >= 0 && e > s) { try { j = JSON.parse(raw.slice(s, e + 1)); } catch (_) {} }
        if (j && j.ok === false) {
          const m = (j.error && (j.error.message || j.error.hint)) || j.message || 'lark-cli lỗi';
          return reject(new Error(String(m).slice(0, 200)));
        }
        if (err && !j) return reject(new Error(String(err.message || err).slice(0, 200)));
        resolve((j && j.data) || j || {});
      });
  });
}

const cliArgs = () => ['--base-token', BASE, '--table-id', TABLE,
  '--as', process.env.LARK_AS || 'user', '--format', 'json'];

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

const laApi = () => cfg.mode === 'api';

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
  const d = laApi() ? await goi('GET', '/fields?limit=100&offset=0')
                    : await cli(['base', '+field-list', ...cliArgs()]);
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
    const d = laApi()
      ? await goi('GET', '/records?limit=200&offset=' + offset)
      : await cli(['base', '+record-list', ...cliArgs(), '--limit', '200', '--offset', String(offset)]);
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
    viTri: asText(r[F.viTri]).trim(),
    base: asText(r[F.base]).split(',').map((x) => x.trim()).filter(Boolean),
    toanBo: r[F.toanBo] === true,
    taoMoi: r[F.taoMoi] === true,
    chiPhi: r[F.chiPhi] === true,
    ghiChu: asText(r[F.ghiChu]),
  })).filter((r) => r.email || r.openId || r.nguoi);

  cache = { at: Date.now(), ds };
  return ds;
}

const chuanTen = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Dòng phân quyền của một người, hoặc null nếu chưa khai.
 *
 * Khớp theo ba lớp, vì `open_id` KHÁC NHAU giữa các app Lark: quản lý thêm người
 * từ danh bạ ở máy mình (open_id của lark-cli) mà nhân sự lại đăng nhập trên bản
 * deploy (open_id của app Marketing Hub) -> hai chuỗi không giống nhau.
 *   1. email        — không đổi giữa các app, chắc nhất
 *   2. open_id      — đúng khi cùng một app
 *   3. TÊN hiển thị — phao cứu sinh; chỉ nhận khi đúng MỘT dòng trùng tên
 *
 * Khớp được bằng tên thì tự vá dòng đó (ghi lại open_id/email thật) để lần sau
 * khớp thẳng, không phải dựa vào tên nữa.
 */
async function cuaNguoi(nguoi) {
  if (!nguoi) return null;
  const ds = await docTatCa();
  const mail = String(nguoi.email || '').trim().toLowerCase();

  const mailPhu = String(nguoi.emailPhu || '').trim().toLowerCase();
  const theoMail = (mail ? ds.find((r) => r.email === mail) : null) ||
                   (mailPhu ? ds.find((r) => r.email === mailPhu) : null);
  if (theoMail) return theoMail;

  const theoId = nguoi.id ? ds.find((r) => r.openId && r.openId === nguoi.id) : null;
  if (theoId) return theoId;

  const ten = chuanTen(nguoi.name);
  if (!ten) return null;
  const trungTen = ds.filter((r) => chuanTen(r.nguoi) === ten);
  if (trungTen.length !== 1) return null;      // trùng tên nhiều dòng thì không đoán

  vaDanhTinh(trungTen[0], nguoi).catch(() => {});
  return trungTen[0];
}

/** Ghi open_id/email thật vào dòng vừa khớp bằng tên (chạy nền, lỗi thì bỏ qua). */
async function vaDanhTinh(hang, nguoi) {
  const mail = String(nguoi.email || '').trim();
  const id = String(nguoi.id || '').trim();
  if (!mail && !id) return;
  if (hang.email === mail.toLowerCase() && hang.openId === id) return;
  await ghi(Object.assign({}, hang, {
    email: mail || hang.email,
    openId: id || hang.openId,
    ghiChu: (hang.ghiChu ? hang.ghiChu + ' · ' : '') + 'tự nhận diện theo tên',
  }));
}

/* ---------------- ghi ---------------- */
async function ghi(hang) {
  const cells = {
    [F.nguoi]: hang.nguoi || '',
    [F.email]: (hang.email || '').trim(),
    [F.openId]: (hang.openId || '').trim(),
    [F.vai]: hang.vai === 'Quản lý' ? 'Quản lý' : 'Nhân sự',
    [F.viTri]: hang.viTri || '',
    [F.base]: (hang.base || []).join(','),
    [F.toanBo]: !!hang.toanBo,
    [F.taoMoi]: !!hang.taoMoi,
    [F.chiPhi]: !!hang.chiPhi,
    [F.ghiChu]: hang.ghiChu || '',
  };

  if (hang.recordId) {
    const body = { update_records: { [hang.recordId]: cells } };
    if (laApi()) await goi('POST', '/records/batch_update', body);
    else await cli(['base', '+record-batch-update', ...cliArgs(), '--json', JSON.stringify(body)]);
    cache.at = 0;
    return hang.recordId;
  }
  const ten = Object.keys(cells);
  const body = { fields: ten, rows: [ten.map((n) => cells[n])] };
  const d = laApi()
    ? await goi('POST', '/records/batch_create', body)
    : await cli(['base', '+record-batch-create', ...cliArgs(), '--json', JSON.stringify(body)]);
  cache.at = 0;
  return (d.record_id_list || [])[0] || null;
}

async function xoa(recordId) {
  const body = { record_id_list: [recordId] };
  if (laApi()) await goi('POST', '/records/batch_delete', body);
  else await cli(['base', '+record-batch-delete', ...cliArgs(), '--json', JSON.stringify(body)]);
  cache.at = 0;
}

function xoaCache() { cache.at = 0; }

module.exports = {
  BASE, TABLE, F,
  docTatCa, cuaNguoi, ghi, xoa, xoaCache,
  larkUrl: 'https://rootytrip2.sg.larksuite.com/base/' + BASE + '?table=' + TABLE,
};
