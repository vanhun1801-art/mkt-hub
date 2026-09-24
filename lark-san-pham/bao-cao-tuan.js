'use strict';
/**
 * Báo cáo sức khoẻ dữ liệu sản phẩm — gửi anh Hùng mỗi sáng thứ Hai (26/09).
 *
 * Anh Hùng: "sợ việc quản lý sự thay đổi cũng như cập nhật Base sẽ khó và sai sót" →
 * "em báo cho anh là được, bằng Marketing Hub". Một thẻ Lark gồm:
 *   1. GẤP — hết hiệu lực mà vẫn đang bán · sắp hết hiệu lực · ưu đãi sắp hết
 *   2. Thiếu mục bắt buộc — chuẩn RIÊNG theo nhóm (vé không cần lịch trình như tour)
 *   3. Link media hỏng / khoá (khách bấm vào bị hỏi xin quyền)
 *   4. Thay đổi 7 ngày qua — từ bảng Nhật ký thay đổi (ai đổi, cũ → mới)
 *
 * Gửi bằng app Marketing Hub (lark-chung/tin-lark.js), chỉ đích bằng EMAIL (open_id riêng
 * theo từng app). Chống gửi trùng: ghi một dòng đánh dấu "Báo cáo tuần <năm-Wtuần>" vào bảng
 * Nhật ký (cột Cột để trống nên bảng tin không lấy nó) — Render khởi động lại, deploy mới vẫn
 * không gửi lần hai. Render gói miễn phí ngủ khi không ai vào: báo cáo đi ở lần đầu tiên hub
 * thức từ 8:00 thứ Hai trở đi (nếu cả thứ Hai không ai mở hub thì đi hôm sau, vẫn một lần/tuần).
 */
const cfg = require('./config');
const kho = require('./kho');

const NGAY = 86400000;
const EMAIL = process.env.SP_BAO_CAO_EMAIL || 'hunglv@rootytrip.com';
const BAN = /Đang kinh doanh|Sắp ra mắt/i;
const co = (s) => !!String(s || '').trim();
const coGia = (p) => p.giaNL != null || (p.giaPax || []).some((r) => r.giaNL);

/* Chuẩn "sẵn sàng gửi khách" theo nhóm */
const MUC = {
  gia: ['Giá công bố', coGia],
  thoiLuong: ['Thời lượng', (p) => co(p.thoiLuong)],
  khoiHanh: ['Khởi hành', (p) => co(p.khoiHanh)],
  usp: ['USP / điểm nổi bật', (p) => co(p.usp)],
  lichTrinh: ['Lịch trình', (p) => co(p.lichTrinh)],
  baoGom: ['Dịch vụ bao gồm', (p) => co(p.baoGom)],
  khongBaoGom: ['Không bao gồm', (p) => co(p.chuaBaoGom)],
  treEm: ['Chính sách trẻ em', (p) => co(p.csTreEm)],
  media: ['Media (ảnh / video)', (p) => (p.media || []).length > 0],
};
const CHUAN = [
  [/ghép|riêng|VIP/i, ['gia', 'thoiLuong', 'khoiHanh', 'usp', 'lichTrinh', 'baoGom', 'khongBaoGom', 'treEm', 'media']],
  [/trọn gói|combo/i, ['gia', 'thoiLuong', 'usp', 'lichTrinh', 'baoGom', 'khongBaoGom', 'treEm', 'media']],
  [/./, ['gia', 'thoiLuong']],                               // dịch vụ lẻ / khác
];
const chuanCua = (p) => CHUAN.find(([re]) => re.test(p.nhom || ''))[1];

/** Tuần ISO theo giờ VN: '2026-W40' */
function tuanVN(t = Date.now()) {
  const d = new Date(t + 7 * 3600000);
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const thu = u.getUTCDay() || 7;
  u.setUTCDate(u.getUTCDate() + 4 - thu);
  const dau = new Date(Date.UTC(u.getUTCFullYear(), 0, 1));
  return u.getUTCFullYear() + '-W' + String(Math.ceil(((u - dau) / NGAY + 1) / 7)).padStart(2, '0');
}
const ddmm = (t) => { const d = new Date(t + 7 * 3600000); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0'); };

/* link media: khoá = trang Drive/Docs đòi xin quyền hoặc chuyển sang đăng nhập Google */
async function kiemLink(links) {
  const hong = [];
  await Promise.all(links.map(async (u) => {
    try {
      const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) });
      const loc = r.headers.get('location') || '';
      if (r.status >= 300 && r.status < 400) { if (/accounts\.google/.test(loc)) hong.push({ u, ly: 'cần đăng nhập' }); return; }
      if (r.status >= 400) { hong.push({ u, ly: 'lỗi ' + r.status }); return; }
      const t = await r.text();
      if (/You need access|Request access|need permission/i.test(t)) hong.push({ u, ly: 'chưa mở quyền xem' });
    } catch (e) { hong.push({ u, ly: 'không mở được' }); }
  }));
  return hong;
}

/** Dựng nội dung báo cáo. Trả { tieuDe, khoi: [{ten, dong[]}], tong } */
async function dung({ moi = false } = {}) {
  const { ds, dsNhatKy } = await kho.tatCa({ moi });
  const nay = Date.now();
  const ban = ds.filter((p) => BAN.test(p.trangThai));
  const ten = (p) => (p.ma ? p.ma + ' — ' : '') + p.ten;
  const khoi = [];

  const gap = [];
  for (const p of ban) {
    if (p.hieuLucDen && p.hieuLucDen < nay) gap.push('**Hết hiệu lực ' + ddmm(p.hieuLucDen) + ' mà vẫn đang bán:** ' + ten(p));
    else if (p.hieuLucDen && p.hieuLucDen < nay + 14 * NGAY) gap.push('Hết hiệu lực ' + ddmm(p.hieuLucDen) + ': ' + ten(p));
  }
  for (const c of kho.uuDaiSapHet(ds, 14)) gap.push('Ưu đãi hết ' + ddmm(c.den) + ': ' + (c.ten || '?') + ' (' + c.sanPham.slice(0, 6).join(', ') + ')');
  if (gap.length) khoi.push({ ten: 'Cần xử lý ngay (' + gap.length + ')', dong: gap });

  const thieu = [];
  for (const p of ban) {
    const t = chuanCua(p).filter((k) => !MUC[k][1](p)).map((k) => MUC[k][0]);
    if (t.length) thieu.push({ p, t });
  }
  thieu.sort((a, b) => b.t.length - a.t.length);
  if (thieu.length) {
    khoi.push({
      ten: 'Thiếu mục bắt buộc (' + thieu.length + '/' + ban.length + ' sản phẩm đang bán)',
      dong: thieu.slice(0, 12).map((x) => ten(x.p) + ' — thiếu ' + x.t.join(', ')).concat(thieu.length > 12 ? ['… và ' + (thieu.length - 12) + ' sản phẩm nữa (xem tab Cần bổ sung)'] : []),
    });
  }

  const links = [...new Set(ban.flatMap((p) => (p.media || []).map((m) => m.link)).filter(Boolean))];
  const hong = await kiemLink(links);
  if (hong.length) {
    const theoLink = new Map();
    for (const p of ban) for (const m of p.media || []) if (m.link) theoLink.set(m.link, (theoLink.get(m.link) || '') || (p.ma + ' · ' + m.ten));
    khoi.push({ ten: 'Link media khách không mở được (' + hong.length + '/' + links.length + ')', dong: hong.slice(0, 10).map((h) => (theoLink.get(h.u) || h.u) + ' — ' + h.ly) });
  }

  const tuan = (dsNhatKy || []).filter((r) => r.cot && r.luc && r.luc > nay - 7 * NGAY).sort((a, b) => b.luc - a.luc);
  const theoId = new Map(ds.map((p) => [p.id, p]));
  if (tuan.length) {
    const nguoi = [...new Set(tuan.map((r) => r.nguoi).filter(Boolean))];
    const gon = (s) => { s = String(s || '—').replace(/\s+/g, ' '); return s.length > 40 ? s.slice(0, 39) + '…' : s; };
    khoi.push({
      ten: 'Thay đổi 7 ngày qua (' + tuan.length + ' lượt' + (nguoi.length ? ' · ' + nguoi.join(', ') : '') + ')',
      dong: tuan.slice(0, 10).map((r) => { const sp = theoId.get(r.spIds[0]); return (sp ? sp.ma || sp.ten : r.ten) + ' · ' + r.cot + ': ' + gon(r.cu) + ' → ' + gon(r.moi) + (r.nguoi ? ' (' + r.nguoi + ')' : ''); })
        .concat(tuan.length > 10 ? ['… và ' + (tuan.length - 10) + ' lượt nữa (bảng Nhật ký thay đổi)'] : []),
    });
  } else khoi.push({ ten: 'Thay đổi 7 ngày qua', dong: ['Không có thay đổi nào qua app.'] });

  return { tieuDe: 'Sức khoẻ dữ liệu sản phẩm · tuần ' + tuanVN(nay).split('-W')[1] + ' · ' + ban.length + ' sản phẩm đang bán', khoi, soGap: gap.length, soThieu: thieu.length, soHong: hong.length };
}

function theLark(bc, urlApp) {
  const mau = bc.soGap ? 'red' : bc.soThieu || bc.soHong ? 'orange' : 'green';
  const el = [];
  for (const k of bc.khoi) {
    el.push({ tag: 'markdown', content: '**' + k.ten + '**\n' + k.dong.map((d) => '- ' + d).join('\n') });
    el.push({ tag: 'hr' });
  }
  el.pop();
  if (urlApp) el.push({ tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: 'Mở app Thông tin sản phẩm' }, type: 'primary', url: urlApp }] });
  return { config: { wide_screen_mode: true }, header: { template: mau, title: { tag: 'plain_text', content: bc.tieuDe } }, elements: el };
}

let tinApp = null;
function kenh() {
  const id = process.env.SP_TIN_APP_ID || process.env.LARK_APP_ID, sec = process.env.SP_TIN_APP_SECRET || process.env.LARK_APP_SECRET;
  if (!id || !sec) return null;
  if (!tinApp) tinApp = require('../lark-chung/tin-lark').tao({ appId: id, appSecret: sec, apiHost: process.env.LARK_API_HOST, tenApp: 'Marketing Hub' });
  return tinApp;
}
const urlApp = () => (process.env.PUBLIC_URL || process.env.HUB_URL || 'https://mkt-hub-w6hi.onrender.com').replace(/\/+$/, '') + '/#/m/san-pham';

/* NGƯỜI NHẬN — open_id là RIÊNG THEO APP, và app Marketing Hub không có quyền đọc danh bạ,
   email tenant cũng không chắc gắn tài khoản (đã thử 26/09: 230001 invalid receive_id). Nên
   người nhận là QUẢN LÝ đã bấm "Gửi báo cáo cho tôi" trong app: lúc đó hub gửi kèm open_id
   đúng theo app Marketing Hub (x-hub-user-id). Ghi nhớ bằng một dòng trong bảng Nhật ký
   ("Người nhận báo cáo tuần", Giá trị mới = open_id|email|tên) — bền qua deploy. */
const NHAN = 'Người nhận báo cáo tuần';
function nguoiNhan(dsNhatKy) {
  const r = (dsNhatKy || []).filter((x) => (x.ten || '') === NHAN && x.moi).sort((a, b) => (b.luc || 0) - (a.luc || 0))[0];
  if (r) { const [id, email, ten] = r.moi.split('|'); return { userId: id || '', email: email || '', ten: ten || '' }; }
  return process.env.SP_BAO_CAO_EMAIL ? { email: EMAIL, ten: EMAIL } : null;
}
const denCua = (n) => (n.userId ? { userId: n.userId } : { email: n.email });

/** Gửi ngay (nút trong app / vòng thứ Hai). `toi` = người bấm (nhận + được ghi nhớ). Trả { ok, loi?, bc } */
async function gui({ lark, danhDau = true, toi = null } = {}) {
  const k = kenh();
  if (!k) return { ok: false, loi: 'Chưa khai App ID / Secret của Marketing Hub (LARK_APP_ID / LARK_APP_SECRET)' };
  const bc = await dung({ moi: true });
  const { dsNhatKy } = await kho.tatCa();
  const n = toi && (toi.id || toi.email) ? { userId: toi.id, email: toi.email, ten: toi.ten } : nguoiNhan(dsNhatKy);
  if (!n) return { ok: false, loi: 'Chưa có người nhận — quản lý bấm "Gửi báo cáo cho tôi" trong tab Quản lý một lần' };
  const r = await k.gui(Object.assign(denCua(n), { card: theLark(bc, urlApp()), khoa: 'bc-sp-' + tuanVN() + (danhDau ? '' : '-' + Date.now()) }));
  const gio = require('./nhatky').gioBase(Date.now());
  const F = cfg.f.nhatKy;
  if (r.ok && lark) {
    try {
      /* ghi nhớ người vừa bấm làm người nhận (nếu khác người đang lưu) */
      const cu = nguoiNhan(dsNhatKy);
      if (toi && toi.id && (!cu || cu.userId !== toi.id)) {
        await lark.createRecord({ [F.noiDung]: NHAN, [F.giaTriMoi]: [toi.id, toi.email || '', toi.ten || ''].join('|'), [F.nguoiDoi]: toi.ten || '', [F.luc]: gio }, cfg.nhatKyTableId);
      }
      if (danhDau) await lark.createRecord({ [F.noiDung]: 'Báo cáo tuần ' + tuanVN() + ' — đã gửi ' + (n.ten || n.email || n.userId), [F.luc]: gio }, cfg.nhatKyTableId);
      kho.xoaDem();
    } catch (e) { console.error('[BÁO CÁO TUẦN] không ghi được nhật ký:', e.message); }
  }
  return Object.assign({ bc, nguoiNhan: n.ten || n.email }, r);
}

/** Vòng nền: từ 8:00 thứ Hai (giờ VN), chưa có dấu tuần này thì gửi. */
function batVong(lark) {
  if (process.env.SP_BAO_CAO_TAT === '1' || !kenh()) return;
  let dang = false;
  const thu = async () => {
    if (dang) return;
    const d = new Date(Date.now() + 7 * 3600000);
    const thu2 = d.getUTCDay() === 1 ? d.getUTCHours() >= 8 : d.getUTCDay() !== 0;   // từ 8h thứ Hai tới hết thứ Bảy
    if (!thu2) return;
    dang = true;
    try {
      const { dsNhatKy } = await kho.tatCa({ moi: true });
      const dau = 'Báo cáo tuần ' + tuanVN();
      if ((dsNhatKy || []).some((r) => (r.ten || '').startsWith(dau))) return;
      if (!nguoiNhan(dsNhatKy)) return;                       // chưa quản lý nào đăng ký nhận
      const r = await gui({ lark });
      console.log('[BÁO CÁO TUẦN]', r.ok ? 'đã gửi ' + EMAIL : 'LỖI ' + r.loi);
    } catch (e) { console.error('[BÁO CÁO TUẦN]', e.message); } finally { dang = false; }
  };
  setTimeout(thu, 90 * 1000);                               // đợi app đọc Base xong lượt đầu
  setInterval(thu, 20 * 60 * 1000).unref();
}

module.exports = { dung, gui, batVong, theLark, tuanVN };
