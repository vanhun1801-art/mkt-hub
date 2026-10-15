'use strict';
/**
 * ============================================================================
 * TRAO ĐỔI TRONG TỪNG LỊCH — chép cách làm của Bảng công việc (lark-task-manager)
 * ============================================================================
 * Anh Hùng 15/10/2026: "Tại ứng dụng lịch tác nghiệp, anh nghĩ nên thêm phần
 * trao đổi như bên ứng dụng Tracking cho nó tiện".
 *
 * Hai bảng riêng trên Base Lịch tác nghiệp, KHÔNG thêm cột vào bảng lịch:
 *   "Trao đổi"           một dòng một tin  (Nội dung · Lịch · Người viết · Thời gian)
 *   "Trao đổi · đã xem"  một dòng một (lịch × người) (Khoá · Lịch · Người xem · Xem tới)
 * Liên kết là MỘT CHIỀU nên bảng lịch không mọc cột mới, và workflow "chống gian
 * lận" (theo dõi gần như mọi cột của bảng lịch) không bị đánh thức mỗi lần nhắn.
 * Đã xem để bảng riêng vì cùng lý do với Tracking: ghi vào dòng lịch là đụng
 * revision (1254291) với người đang sửa lịch.
 *
 * Báo Lark (anh Hùng chốt): người trong lịch (phụ trách + nhân sự) VÀ quản lý,
 * trừ người gửi. App này trên Render không tự biết ai là quản lý — danh sách
 * trong quyen.json là open_id của máy cá nhân — nên đọc bảng Phân quyền của hub
 * (Vai = Quản lý, hoặc "Quản lý base" có lich-tac-nghiep) cộng LARK_MANAGER_EMAILS
 * của hub, và gửi theo EMAIL: open_id riêng theo từng app, email thì không.
 */
const cfg = require('./config');

const TD = cfg.traoDoi;
const DX = cfg.daXem;

/** Base trả ô liên kết nhiều hình dạng: {record_ids:[..]}, {id}, hoặc chuỗi. */
function maLienKet(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (x && (x.record_ids ? x.record_ids[0] : x.id)) || x).filter((x) => typeof x === 'string');
}
const nguoiO = (v) => (Array.isArray(v) ? v.filter(Boolean).map((u) => ({
  id: u.id, name: u.name || u.en_name || u.id, email: String(u.email || '').toLowerCase(),
})) : []);
const chu = (v) => (Array.isArray(v) ? v.map((x) => (x && x.text) || (typeof x === 'string' ? x : '')).join('') : String(v == null ? '' : v));
const thoiDiem = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v).toISOString();
  const d = new Date(String(v).replace(' ', 'T') + (/[zZ+]/.test(String(v)) ? '' : '+07:00'));
  return isNaN(d.getTime()) ? null : d.toISOString();
};

/** Giờ Việt Nam dạng "YYYY-MM-DD HH:mm:ss": Base đọc chuỗi trần theo múi giờ của Base. */
function chuoiGioVN(d) {
  const vn = new Date(d.getTime() + 7 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return vn.getUTCFullYear() + '-' + p(vn.getUTCMonth() + 1) + '-' + p(vn.getUTCDate()) +
    ' ' + p(vn.getUTCHours()) + ':' + p(vn.getUTCMinutes()) + ':' + p(vn.getUTCSeconds());
}

async function docTin(lark, lichId) {
  const recs = await lark.listAllRecords(TD.tableId);
  return recs.map((r) => ({
    id: r.record_id,
    lich: maLienKet(r.cells[TD.lich.id]),
    content: chu(r.cells[TD.noiDung.id]),
    author: nguoiO(r.cells[TD.nguoiViet.id]),
    at: thoiDiem(r.cells[TD.thoiGian.id]),
  }))
    .filter((c) => c.lich.includes(lichId) && c.content)
    .map(({ lich, ...c }) => c)
    .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
}

async function ghiTin(lark, lichId, me, noiDung) {
  return lark.createRecord({
    [TD.noiDung.name]: noiDung,
    [TD.lich.name]: [{ id: lichId }],
    [TD.nguoiViet.name]: [{ id: me.id }],
    // ghi giờ thẳng tay: để trống thì Base hiểu 00:00 của ngày đó
    [TD.thoiGian.name]: chuoiGioVN(new Date()),
  }, TD.tableId);
}

/* ---------------- đã xem ---------------- */

async function docHangDaXem(lark, lichId) {
  const recs = await lark.listAllRecords(DX.tableId);
  return recs.map((r) => ({
    rec: r.record_id,
    khoa: chu(r.cells[DX.khoa.id]),
    lich: maLienKet(r.cells[DX.lich.id]),
    nguoi: nguoiO(r.cells[DX.nguoi.id])[0] || null,
    at: thoiDiem(r.cells[DX.xemToi.id]),
  })).filter((x) => x.lich.includes(lichId) || x.khoa.startsWith(lichId + '·'));
}

async function docDaXem(lark, lichId) {
  try {
    return (await docHangDaXem(lark, lichId))
      .filter((x) => x.nguoi && x.at)
      .map((x) => ({ id: x.nguoi.id, name: x.nguoi.name, at: x.at }));
  } catch (e) {
    console.error('[da-xem]', e.message);
    return [];
  }
}

/** Ghi "tôi đã xem tới bây giờ": sửa dòng có sẵn của (lịch × người), chưa có thì tạo. */
async function ghiDaXem(lark, lichId, me) {
  const gio = chuoiGioVN(new Date());
  const khoa = lichId + '·' + me.id;
  const ds = await docHangDaXem(lark, lichId);
  const co = ds.find((x) => x.nguoi && x.nguoi.id === me.id) || ds.find((x) => x.khoa === khoa);
  if (co) await lark.updateRecord(co.rec, { [DX.xemToi.name]: gio }, DX.tableId);
  else {
    await lark.createRecord({
      [DX.khoa.name]: khoa,
      [DX.lich.name]: [{ id: lichId }],
      [DX.nguoi.name]: [{ id: me.id }],
      [DX.xemToi.name]: gio,
    }, DX.tableId);
  }
  return { ok: true, at: new Date().toISOString() };
}

/* ---------------- quản lý nhận báo ---------------- */

let demQL = { at: 0, ds: [] };

/**
 * Quản lý duyệt lịch: [{ id?, email?, name? }].
 * Hỏng đọc bảng thì vẫn còn env, không làm hỏng việc gửi tin.
 */
async function quanLyLich(lark) {
  if (Date.now() - demQL.at < 5 * 60000) return demQL.ds;
  const ds = [];
  const them = (x) => {
    const email = String(x.email || '').trim().toLowerCase();
    const id = String(x.id || '').trim();
    if (!email && !id) return;
    if (ds.some((y) => (email && y.email === email) || (id && y.id === id))) return;
    ds.push({ email, id, name: x.name || '' });
  };
  String(process.env.LARK_MANAGER_EMAILS || '').split(',').forEach((e) => them({ email: e }));
  /* Máy cá nhân: open_id quản lý trong quyen.json đúng với bot lark-cli của máy. */
  if (cfg.mode !== 'api') cfg.loadManagerIds().forEach((id) => them({ id }));
  else String(process.env.LARK_MANAGER_IDS || '').split(',').forEach((id) => them({ id }));
  try {
    const base = process.env.HUB_QUYEN_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG';
    const bang = process.env.HUB_QUYEN_TABLE || 'tblBKm6ZurhN3703';
    const truong = await lark.listFields(bang, base);
    const idCua = (ten) => ((truong || []).find((f) => (f.name || f.field_name) === ten) || {}).id ||
      ((truong || []).find((f) => (f.name || f.field_name) === ten) || {}).field_id;
    const [fVai, fMail, fId, fQLB, fTen] = ['Vai', 'Email', 'open_id', 'Quản lý base', 'Người'].map(idCua);
    for (const r of await lark.listAllRecords(bang, base)) {
      const c = r.cells;
      const vai = chu(Array.isArray(c[fVai]) && typeof c[fVai][0] === 'string' ? c[fVai][0] : c[fVai]);
      const qlb = chu(c[fQLB]).split(',').map((s) => s.trim());
      if (vai !== 'Quản lý' && !qlb.includes('lich-tac-nghiep')) continue;
      /* Gửi bằng email thì đúng ở mọi app; open_id trong bảng là của app hub,
       * chỉ dùng khi chạy chính app đó (Render). */
      them({ email: chu(c[fMail]), id: cfg.mode === 'api' ? chu(c[fId]) : '', name: chu(c[fTen]) });
    }
  } catch (e) {
    console.warn('[trao-doi] chưa đọc được bảng Phân quyền của hub: ' + e.message);
  }
  demQL = { at: Date.now(), ds };
  return ds;
}

/**
 * Ai nhận tin: phụ trách + nhân sự + quản lý, trừ người gửi, không ai hai lần.
 * Người trong lịch đã có open_id đúng app; quản lý trùng người trong lịch (cùng
 * id hoặc cùng email) thì bỏ bản quản lý.
 */
function gopNguoiNhan(item, quanLy, me) {
  const ra = [];
  const laToi = (x) => (me.id && x.id === me.id) || (me.email && x.email && x.email === me.email);
  for (const u of [...(item.owner || []), ...(item.staff || [])]) {
    const x = { id: u.id, email: String(u.email || '').toLowerCase(), name: u.name || '' };
    if (!x.id || laToi(x) || ra.some((y) => y.id === x.id)) continue;
    ra.push(x);
  }
  for (const q of quanLy) {
    if (laToi(q)) continue;
    if (ra.some((y) => (q.id && y.id === q.id) || (q.email && y.email && y.email === q.email))) continue;
    ra.push(q);
  }
  return ra;
}

function theTraoDoi(item, me, noiDung, urlHub) {
  const ten = me.name || 'Một người';
  return {
    config: { wide_screen_mode: true },
    header: { template: 'blue', title: { tag: 'plain_text', content: '💬 ' + ten + ' nhắn về lịch: ' + (item.title || 'Lịch tác nghiệp') } },
    elements: [
      { tag: 'note', elements: [{ tag: 'plain_text', content: 'Lịch tác nghiệp · Marketing Hub' }] },
      { tag: 'div', text: { tag: 'lark_md', content: '**' + ten + ':** ' + String(noiDung).slice(0, 600) } },
      { tag: 'action', actions: [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: 'Mở trao đổi' },
        url: urlHub + '/#/m/lich-tac-nghiep?rec=' + encodeURIComponent(item.id) + '&mo=trao-doi' }] },
    ],
  };
}

let tinApp = null;
/** Gửi một thẻ. Render: bot Marketing Hub qua lark-chung; máy: bot lark-cli (chỉ open_id). */
async function guiThe(lark, nguoi, card, khoa) {
  if (cfg.appId && cfg.appSecret) {
    if (!tinApp) tinApp = require('../lark-chung/tin-lark').tao({ appId: cfg.appId, appSecret: cfg.appSecret, apiHost: cfg.apiHost, tenApp: 'Marketing Hub' });
    return tinApp.gui(nguoi.email ? { email: nguoi.email, card, khoa } : { userId: nguoi.id, card, khoa });
  }
  if (!nguoi.id) return { ok: false, loi: 'máy cá nhân chỉ gửi được theo open_id' };
  try {
    await lark.cli(['im', '+messages-send', '--as', 'bot', '--user-id', nguoi.id, '--msg-type', 'interactive',
      '--content', JSON.stringify(card), '--idempotency-key', khoa, '--format', 'json'], { retries: 1 });
    return { ok: true };
  } catch (e) { return { ok: false, loi: e.message }; }
}

/**
 * Báo tin mới cho từng người. CHỜ kết quả để người gửi biết ai đã được báo, ai
 * hỏng — cùng lý do với Tracking: báo lặng lẽ hỏng thì người ta tưởng đã nhắn.
 */
async function baoTraoDoi(lark, item, me, noiDung, nhan) {
  const urlHub = (process.env.PUBLIC_URL || process.env.HUB_URL || cfg.hubUrl || 'https://mkt-hub-w6hi.onrender.com').replace(/\/+$/, '');
  const card = theTraoDoi(item, me, noiDung, urlHub);
  const gui = [];
  const hong = [];
  const moc = Date.now().toString(36);
  for (const x of nhan.slice(0, 30)) {
    const khoa = ('td-' + item.id + '-' + moc + '-' + (x.id || x.email)).slice(0, 50);
    let r;
    try { r = await guiThe(lark, x, card, khoa); } catch (e) { r = { ok: false, loi: e.message }; }
    const ten = x.name || x.email || x.id;
    if (r && r.ok) gui.push(ten);
    else { hong.push(ten); console.warn('[trao-doi] không báo được ' + ten + ': ' + ((r && (r.loi || r.ly)) || '?')); }
  }
  return { gui, hong };
}

module.exports = { docTin, ghiTin, docDaXem, ghiDaXem, quanLyLich, gopNguoiNhan, theTraoDoi, baoTraoDoi, chuoiGioVN, maLienKet };
