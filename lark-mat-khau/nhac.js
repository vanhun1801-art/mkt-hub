'use strict';
/**
 * NHẮC TỰ ĐỘNG qua Lark — bot "Marketing Hub" nhắn riêng người phụ trách.
 *
 *   · Gia hạn gói: còn 7 ngày, còn 1 ngày, và hôm sau ngày hết hạn (đã quá hạn).
 *   · Đổi mật khẩu: ngày 1 hằng tháng, mỗi người MỘT tin liệt kê các tài khoản
 *     họ phụ trách mà mật khẩu > 180 ngày chưa đổi (hoặc chưa rõ ngày đổi).
 *
 * KHÔNG GỬI TRÙNG: mỗi tin đã gửi là một dòng ở bảng Nhật ký truy cập, cột
 * "Mã bản ghi" mang khoá (han:<rec>:<ngày hết hạn>:<mốc> · mk:<tháng>:<người>).
 * Trước khi gửi đọc lại nhật ký — Render khởi động lại bao nhiêu lần cũng vậy.
 * Khoá cũng đi vào `uuid` của Lark nên hai tiến trình chạy cùng lúc cũng chỉ ra một tin.
 *
 * KHÔNG CRON: app con trên Render bị cho ngủ, đồng hồ trong tiến trình im lặng
 * không chạy. Nên `chay()` được gọi (1) mỗi 30 phút khi tiến trình đang thức và
 * (2) "đọc-thì-chạy": mỗi request vào app, tối đa một lần mỗi giờ — hub gọi
 * /api/tong-quan mỗi khi có người mở trang Tổng quan, đủ để sáng nào cũng chạy.
 * Cùng lối với lịch đổi thông tin của app Sản phẩm.
 *
 * Chỉ gửi ở chế độ api (Render). Trên máy (cli) thì chỉ XEM TRƯỚC — gửi bằng
 * phiên lark-cli là gửi dưới tên anh Hùng, không phải tên bot. Tắt hẳn: MK_NHAC_TAT=1.
 */
const cfg = require('./config');

const NGAY = 86400000;
const MOC_HAN = [7, 1, -1];          // còn 7 ngày, còn 1 ngày, đã quá 1 ngày
const GIO_BAT_DAU = 8;               // không nhắn trước 8:00 sáng giờ VN

const vn = (t = Date.now()) => new Date(t + 7 * 3600000);
const hai = (n) => String(n).padStart(2, '0');
const ngayVN = (t) => { const d = vn(t); return hai(d.getUTCDate()) + '/' + hai(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); };
const isoVN = (t) => { const d = vn(t); return d.getUTCFullYear() + '-' + hai(d.getUTCMonth() + 1) + '-' + hai(d.getUTCDate()); };
const thangVN = (t) => isoVN(t).slice(0, 7);
const tien = (n) => (n == null ? '' : Math.round(n).toLocaleString('vi-VN') + 'đ');

const urlApp = () => (process.env.PUBLIC_URL || process.env.HUB_URL || 'https://mkt-hub-w6hi.onrender.com').replace(/\/+$/, '') + '/#/m/mat-khau';

let kenh = null;
function kenhGui() {
  if (cfg.mode !== 'api' || !cfg.appId || !cfg.appSecret) return null;
  if (!kenh) kenh = require('../lark-chung/tin-lark').tao({ appId: cfg.appId, appSecret: cfg.appSecret, apiHost: cfg.apiHost, tenApp: 'Marketing Hub' });
  return kenh;
}

/** Dựng danh sách tin CẦN gửi hôm nay (chưa lọc theo đã gửi). Thuần — test được. */
function lapDanhSach({ tk, goi }, luc = Date.now()) {
  const ds = [];
  const homNay = Math.floor((luc + 7 * 3600000) / NGAY);
  for (const g of goi) {
    if (/ngừng|huỷ|hủy|dừng/i.test(g.trangThai || '') || !g.hetHan) continue;
    const conLai = Math.floor((g.hetHan + 7 * 3600000) / NGAY) - homNay;
    if (!MOC_HAN.includes(conLai)) continue;
    const nguoi = (g.phuTrach || []).filter((n) => n.id);
    const chu = (conLai > 0 ? '🔔 Gói **' + g.ten + '** hết hạn sau ' + conLai + ' ngày (' + ngayVN(g.hetHan) + ')'
      : '⚠️ Gói **' + g.ten + '** đã HẾT HẠN từ ' + ngayVN(g.hetHan)) +
      (g.user ? '\nTài khoản: ' + g.user : '') +
      (g.chiPhi ? '\nChi phí: ' + tien(g.chiPhi) + (g.chuKy ? ' / ' + g.chuKy.toLowerCase() : '') : '') +
      '\n' + (conLai > 0 ? 'Gia hạn xong nhớ cập nhật Ngày hết hạn trong app.' : 'Đã gia hạn thì cập nhật Ngày hết hạn; không dùng nữa thì đổi Trạng thái sang "Ngừng dùng".') +
      '\n' + urlApp();
    for (const n of nguoi) {
      ds.push({ loai: 'han', khoa: 'han:' + g.id + ':' + isoVN(g.hetHan) + ':' + conLai + ':' + n.id, nguoi: n, bang: 'goi', rec: g.id,
        tieuDe: g.ten + (conLai > 0 ? ' · còn ' + conLai + ' ngày' : ' · đã hết hạn'), chu });
    }
    if (!nguoi.length) ds.push({ loai: 'han', khoa: '', nguoi: null, bang: 'goi', rec: g.id, tieuDe: g.ten + ' · chưa có người phụ trách để nhắc', chu: '' });
  }
  /* Đổi mật khẩu: chỉ ngày 1..3 của tháng (lỡ ngày 1 không ai mở app thì vẫn còn 2 ngày bù). */
  if (vn(luc).getUTCDate() <= 3) {
    const theoNguoi = new Map();
    for (const x of tk) {
      if (x.trangThai === 'Ngừng dùng' || !x.coMatKhau) continue;
      if (x.doiLuc && luc - x.doiLuc <= cfg.cuNgay * NGAY) continue;
      for (const n of (x.phuTrach || []).filter((p) => p.id)) {
        if (!theoNguoi.has(n.id)) theoNguoi.set(n.id, { n, ds: [] });
        theoNguoi.get(n.id).ds.push(x);
      }
    }
    for (const { n, ds: tks } of theoNguoi.values()) {
      const dong = tks.slice(0, 15).map((x) => '• ' + (x.nenTang || x.ten) + (x.user ? ' (' + x.user + ')' : '') +
        (x.doiLuc ? ' — đổi lần cuối ' + ngayVN(x.doiLuc) : ' — chưa rõ lần đổi cuối'));
      ds.push({ loai: 'mk', khoa: 'mk:' + thangVN(luc) + ':' + n.id, nguoi: n, bang: 'tk', rec: '',
        tieuDe: n.ten + ' · ' + tks.length + ' mật khẩu cần đổi',
        chu: '🔐 Nhắc đổi mật khẩu tháng ' + thangVN(luc).slice(5) + '/' + thangVN(luc).slice(0, 4) + ': ' + tks.length +
          ' tài khoản anh/chị phụ trách đã hơn ' + cfg.cuNgay + ' ngày chưa đổi mật khẩu.\n' + dong.join('\n') +
          (tks.length > 15 ? '\n… và ' + (tks.length - 15) + ' tài khoản nữa' : '') +
          '\nĐổi trên trang đó trước, rồi mở app → bấm vào tài khoản → ô "Mật khẩu mới" (nút Sinh tạo mật khẩu mạnh).\n' + urlApp() });
    }
  }
  return ds;
}

/** Các khoá đã gửi, đọc từ Nhật ký. */
async function daGui(lark) {
  const F = cfg.f.nk;
  const s = new Set();
  for (const r of await lark.listAllRecords(cfg.nkTableId)) {
    const hd = r.cells[F.hanhDong];
    const ten = Array.isArray(hd) ? String(hd[0] && (hd[0].text || hd[0])) : String(hd || '');
    if (/^Nhắc/.test(ten)) {
      const m = r.cells[F.ma];
      const k = Array.isArray(m) ? m.map((x) => (x && x.text) || x).join('') : String(m || '');
      if (k) s.add(k);
    }
  }
  return s;
}

let dangChay = null;
let lanCuoi = 0;

/**
 * Chạy một lượt. `thu: true` = chỉ xem trước, không gửi, không ghi.
 * Trả { guiDuoc, daGuiTruoc, loi:[], xemTruoc:[] }.
 */
async function chay({ kho, lark, thu = false, luc = Date.now() } = {}) {
  if (dangChay) return dangChay;
  dangChay = (async () => {
    const kq = { guiDuoc: 0, daGuiTruoc: 0, loi: [], xemTruoc: [], cheDo: cfg.mode };
    if (process.env.MK_NHAC_TAT === '1' && !thu) { kq.loi.push('Đang tắt (MK_NHAC_TAT=1)'); return kq; }
    const d = await kho.tatCa();
    const ds = lapDanhSach(d, luc);
    const cu = await daGui(lark);
    const k = kenhGui();
    for (const t of ds) {
      const xong = t.khoa && cu.has(t.khoa);
      kq.xemTruoc.push({ loai: t.loai, tieuDe: t.tieuDe, nguoi: t.nguoi ? t.nguoi.ten : '', trangThai: !t.nguoi ? 'không có người nhận' : xong ? 'đã gửi' : 'chờ gửi' });
      if (!t.nguoi || xong) { if (xong) kq.daGuiTruoc++; continue; }
      if (thu) continue;
      if (vn(luc).getUTCHours() < GIO_BAT_DAU) continue;
      if (!k) { kq.loi.push('Chỉ gửi trên Render (chế độ api) — ở máy chỉ xem trước.'); break; }
      const r = await k.gui({ userId: t.nguoi.id, text: t.chu.replace(/\*\*/g, ''), khoa: t.khoa.slice(-50) });
      if (!r.ok) { kq.loi.push(t.nguoi.ten + ': ' + r.loi); continue; }
      kq.guiDuoc++;
      cu.add(t.khoa);
      try {
        await lark.createRecord({
          [cfg.f.nk.viec]: (t.loai === 'han' ? 'Nhắc gia hạn · ' : 'Nhắc đổi mật khẩu · ') + t.tieuDe + ' → ' + t.nguoi.ten,
          [cfg.f.nk.luc]: isoVN(luc) + ' ' + hai(vn(luc).getUTCHours()) + ':' + hai(vn(luc).getUTCMinutes()) + ':00',
          [cfg.f.nk.nguoi]: 'Bot Marketing Hub',
          [cfg.f.nk.hanhDong]: t.loai === 'han' ? 'Nhắc gia hạn' : 'Nhắc đổi mật khẩu',
          [cfg.f.nk.bang]: t.bang === 'goi' ? 'Gói đăng ký' : 'Tài khoản',
          [cfg.f.nk.ma]: t.khoa,
        }, cfg.nkTableId);
      } catch (e) { console.error('[NHẮC] gửi rồi mà không ghi được nhật ký:', e.message); }
    }
    if (kq.guiDuoc || kq.loi.length) console.log('[NHẮC]', kq.guiDuoc, 'tin', kq.loi.length ? '· lỗi: ' + kq.loi.join(' | ') : '');
    lanCuoi = Date.now();
    return kq;
  })().finally(() => { dangChay = null; });
  return dangChay;
}

/** "Đọc-thì-chạy": gọi từ mỗi request, tự giới hạn một lần mỗi giờ. Không bao giờ ném. */
function moiGio(o) {
  if (Date.now() - lanCuoi < 3600000 || dangChay) return;
  lanCuoi = Date.now();
  chay(o).catch((e) => console.error('[NHẮC]', e.message));
}

function batVong(o) {
  if (process.env.MK_NHAC_TAT === '1') return;
  setTimeout(() => moiGio(o), 60000).unref();
  setInterval(() => { lanCuoi = 0; moiGio(o); }, 30 * 60000).unref();
}

module.exports = { lapDanhSach, chay, moiGio, batVong, isoVN };
