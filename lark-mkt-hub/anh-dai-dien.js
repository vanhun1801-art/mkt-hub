'use strict';
/**
 * ẢNH ĐẠI DIỆN LARK cho cả hệ (27/09/2026). Anh Hùng: "mỗi tài khoản đều có ảnh
 * đại diện, mà app của anh thì chưa có — lôi ảnh từ bên Lark qua được không".
 *
 * Nguồn người: thành viên nhóm "Phòng MKT" (nhom-lark.js, đã có open_id + tên).
 * Nguồn ảnh:
 *   - chế độ api: contact/v3/users/batch bằng tenant token (app Marketing Hub
 *     đã có quyền danh bạ), 50 người một lượt;
 *   - chế độ cli: `lark-cli contact +search-user --user-ids …` (máy anh Hùng).
 *
 * Trả về bảng TÊN (đã chuẩn hoá) → đường ảnh 240px trên CDN của Lark. App con
 * chỉ biết tên người (ô tròn chữ viết tắt có title=tên), nên khớp theo tên — cùng
 * cách nhom-lark.js khớp danh bạ. Trùng tên thì BỎ (gắn nhầm mặt người khác còn
 * tệ hơn để chữ viết tắt).
 *
 * Nhớ 6 giờ trong bộ nhớ; lỗi thì trả bản cũ (hoặc rỗng) — thiếu ảnh không bao
 * giờ được làm hỏng trang.
 */
const cfg = require('./config');
const { laApi, tenantToken, cli } = require('./base-lark');
const nhomLark = require('./nhom-lark');

const NHO_MS = 6 * 3600e3;
let dem = { at: 0, ds: null, dangLam: null };

const anhCua = (u) => {
  const a = (u && u.avatar) || u || {};
  return a.avatar_240 || a.avatar_middle || a.avatar_640 || a.avatar_big || a.avatar_72 || a.avatar_thumb || a.avatar_url || '';
};

/* Hạn giờ cho mọi cuộc gọi ra Lark. Không đặt thì Node để mặc định 300 giây:
 * một lần Lark treo là trang đăng nhập đứng im năm phút mà không nói gì. Những
 * lời gọi này bình thường dưới một giây; quá 20 giây thì không phải chậm nữa
 * mà là hỏng, và báo hỏng sớm hơn là bắt người ta ngồi chờ. */
const HAN_GOI = 20000;
const han = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout
  ? AbortSignal.timeout(HAN_GOI) : undefined);

async function quaApi(ids) {
  const token = await tenantToken();
  const ra = [];
  for (let i = 0; i < ids.length; i += 50) {
    const q = ids.slice(i, i + 50).map((x) => 'user_ids=' + encodeURIComponent(x)).join('&');
    const r = await fetch(cfg.apiHost + '/open-apis/contact/v3/users/batch?user_id_type=open_id&' + q,
      { headers: { Authorization: 'Bearer ' + token }, signal: han() });
    const d = await r.json();
    if (d.code !== 0) throw new Error('Lark từ chối đọc danh bạ (' + d.code + ' ' + (d.msg || '') + ')');
    ((d.data && d.data.items) || []).forEach((u) => ra.push({ id: u.open_id, ten: u.name || u.en_name || '', anh: anhCua(u) }));
  }
  return ra;
}

async function quaCli(ids) {
  /* +search-user không trả ảnh; +get-user thì có (avatar_240…). Một người một
   * lượt — phòng chỉ vài chục người, và kết quả nhớ 6 giờ. */
  const ra = [];
  for (const id of ids) {
    try {
      const d = await cli(['contact', '+get-user', '--user-id', id, '--as', process.env.LARK_AS || 'user', '--format', 'json']);
      const u = (d && (d.user || (d.data && d.data.user) || d.data)) || d || {};
      ra.push({ ten: u.name || u.localized_name || u.en_name || '', anh: anhCua(u) });
    } catch (_) { /* thiếu một người thì bỏ qua người đó */ }
  }
  return ra;
}

/** Email → open_id dưới CHÍNH app đang chạy (open_id riêng theo app). */
async function idTheoEmail(emails) {
  if (!emails.length) return [];
  const token = await tenantToken();
  const ra = [];
  for (let i = 0; i < emails.length; i += 50) {
    const r = await fetch(cfg.apiHost + '/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ emails: emails.slice(i, i + 50) }),
      signal: han(),
    });
    const d = await r.json();
    if (d.code === 0) ((d.data && d.data.user_list) || []).forEach((x) => { if (x.user_id) ra.push(x.user_id); });
  }
  return ra;
}

/**
 * @param {() => Promise<Array<{id:string,ten:string,email:string}>>} layDanhBa
 *        danh bạ hub (server.js danhBaMoiApp) — ở chế độ api, id trong đó là
 *        open_id của chính app Marketing Hub nên đọc thẳng được.
 */
async function lamMoi(layDanhBa) {
  const [db, nhom] = await Promise.all([
    Promise.resolve(layDanhBa ? layDanhBa() : []).catch(() => []),
    nhomLark.thanhVien(false).catch(() => ({ nguoi: [] })),
  ]);
  let ids = [...new Set([...(db || []), ...(nhom.nguoi || [])].map((x) => x.id).filter((x) => /^ou_/.test(x || '')))];
  let nguoi = [];
  if (laApi()) {
    nguoi = ids.length ? await quaApi(ids).catch(() => []) : [];
    const coTen = new Set(nguoi.filter((u) => u.anh).map((u) => nhomLark.chuanTen(u.ten)));
    const thieuMail = (db || []).filter((x) => x.email && !coTen.has(nhomLark.chuanTen(x.ten))).map((x) => x.email);
    const them = await idTheoEmail([...new Set(thieuMail)]).catch(() => []);
    if (them.length) nguoi = nguoi.concat(await quaApi(them).catch(() => []));
  } else {
    nguoi = ids.length ? await quaCli(ids) : [];
  }
  const ds = {}, trung = new Set();
  const gan = (ten, anh) => {
    const k = nhomLark.chuanTen(ten);
    if (!k || !anh) return;
    if (ds[k] && ds[k] !== anh) trung.add(k);
    ds[k] = anh;
  };
  nguoi.forEach((u) => gan(u.ten, u.anh));
  /* App con in tên theo Base (VD "Nguyễn Long Khánh (Pinky)") còn danh bạ Lark
   * có thể là tên khác — gắn thêm tên theo danh bạ hub cho cùng một người. */
  const theoId = new Map(nguoi.map((u) => [u.id, u]));
  (db || []).forEach((x) => { const u = theoId.get(x.id); if (u) gan(x.ten, u.anh); });
  trung.forEach((k) => delete ds[k]);
  return ds;
}

/** Bảng tên → ảnh. Không bao giờ ném lỗi. */
async function bang(layDanhBa) {
  if (dem.ds && Date.now() - dem.at < NHO_MS) return dem.ds;
  if (!dem.dangLam) {
    dem.dangLam = lamMoi(layDanhBa)
      .then((ds) => { dem = { at: Date.now(), ds, dangLam: null }; return ds; })
      .catch((e) => {
        console.warn('[anh-dai-dien] ' + (e && e.message));
        dem = { at: Date.now() - NHO_MS + 10 * 60e3, ds: dem.ds || {}, dangLam: null };   // thử lại sau 10 phút
        return dem.ds;
      });
  }
  return dem.dangLam;
}

module.exports = { bang };
