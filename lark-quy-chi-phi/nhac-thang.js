'use strict';
/**
 * Nhắc đóng sổ hàng tháng (25/09/2026).
 *
 * Ngày 1 mỗi tháng anh Hùng phải thanh toán HẾT chi phí tháng trước: gạch nợ ở quỹ
 * Tourwell (nhà cung cấp 274) và giải quyết hoá đơn đã phát sinh — ngày 10 kế toán
 * đóng sổ, quá hạn là khoản đó lỡ kỳ.
 *
 * Gửi một thẻ Lark (bot Marketing Hub) vào:
 *   - ngày 1: luôn gửi — kể cả sổ sạch, vì việc gạch nợ Tourwell vẫn phải làm;
 *   - ngày 5 và ngày 9: chỉ gửi khi còn khoản chưa xong ("còn 5 ngày", "mai đóng sổ").
 * Đổi ngày bằng QUY_NHAC_NGAY="1,5,9". Tắt: QUY_NHAC_TAT=1.
 *
 * Khoản tính vào = mọi khoản có NGÀY ĐỀ NGHỊ (trống thì ngày thanh toán) TRƯỚC ngày 1
 * tháng này mà chưa "Đã quyết toán" — tháng trước là chính, tháng cũ hơn còn sót cũng
 * kéo vào luôn, sót tới giờ thì càng phải nhắc.
 *
 * NGƯỜI NHẬN: tìm theo TÊN (mặc định "Lê Văn Hùng", đổi bằng QUY_NHAC_TEN) trong cột
 * Người đề nghị / Người giữ quỹ — mã người Base trả về là open_id THEO APP đang đọc,
 * nên khớp với bot đang gửi (cùng lối bản tin sáng của app Lịch tác nghiệp).
 *
 * CHỐNG GỬI TRÙNG: nhớ ngày đã gửi ở du-lieu/nhac-thang.json + khoá uuid của Lark.
 * Render xoá ổ đĩa mỗi lần deploy nên chỉ gửi trong khung 8:00–11:59.
 */
const fs = require('fs');
const path = require('path');

const LECH = 7 * 3600000;
const TEN = process.env.QUY_NHAC_TEN || 'Lê Văn Hùng';
const NGAY_NHAC = (process.env.QUY_NHAC_NGAY || '1,5,9').split(',').map(Number).filter((n) => n >= 1 && n <= 28);
const HAN = 10;
const GIO_TU = 8, GIO_DEN = 12;
const NCC_TOURWELL = process.env.QUY_TW_NCC || '274';
const FILE = path.join(__dirname, 'du-lieu', 'nhac-thang.json');
const XONG = 'Đã quyết toán';
const KHONG_CAN = 'Không cần chứng từ';

const vn = (t) => new Date(t + LECH);
const ngayVN = (t) => vn(t).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');
const tien = (n) => (Number(n) || 0).toLocaleString('vi-VN') + ' đ';
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
const ngayCua = (c) => String(c.ngayDeNghi || c.ngayChi || '').slice(0, 10);
const ddmm = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—');

/** Kỳ đang đóng: tháng trước so với ngày `t` (giờ VN). */
function kyDong(t) {
  const d = vn(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const ty = m === 1 ? y - 1 : y, tm = m === 1 ? 12 : m - 1;
  return {
    dauThangNay: y + '-' + pad(m) + '-01',
    dauThangTruoc: ty + '-' + pad(tm) + '-01',
    ten: 'tháng ' + pad(tm) + '/' + ty,
    han: pad(HAN) + '/' + pad(m) + '/' + y,
    ngay: d.getUTCDate(),
  };
}

const coChungTu = (c) => (c.hoaDon || []).length || (c.unc || []).length || c.linkCu || c.linkUncCu;

/** Gom việc còn lại của kỳ. `chi` = khoản đã qua doiRa. */
function phanLoai(chi, t) {
  const k = kyDong(t);
  const trongKy = chi.filter((c) => { const d = ngayCua(c); return d && d >= k.dauThangTruoc && d < k.dauThangNay; });
  const conMo = chi.filter((c) => { const d = ngayCua(c); return d && d < k.dauThangNay && c.tinhTrang !== XONG; });
  const nhom = {
    choChi: conMo.filter((c) => c.tinhTrang === 'Chờ chi'),
    choChinh: conMo.filter((c) => c.tinhTrang === 'Chờ điều chỉnh'),
    thieuChungTu: conMo.filter((c) => c.tinhTrang !== 'Chờ chi' && c.chungTu !== KHONG_CAN && !coChungTu(c)),
    thieuMaDon: conMo.filter((c) => c.tinhTrang !== 'Chờ chi' && !String(c.maDon || '').trim()),
    choQt: conMo.filter((c) => c.tinhTrang === 'Đã chi'),
  };
  return {
    k, nhom,
    tongKy: trongKy.reduce((a, c) => a + (Number(c.tien) || 0), 0),
    soKy: trongKy.length,
    daXongKy: trongKy.filter((c) => c.tinhTrang === XONG).length,
    cuHon: conMo.filter((c) => ngayCua(c) < k.dauThangTruoc).length,
    conViec: nhom.choChi.length + nhom.choChinh.length + nhom.thieuChungTu.length + nhom.thieuMaDon.length,
  };
}

const MUC = [
  ['choChi', 'Chưa thanh toán', 'Tình trạng còn "Chờ chi"'],
  ['choChinh', 'Kế toán yêu cầu điều chỉnh', 'chỉnh xong mới quyết toán được'],
  ['thieuChungTu', 'Thiếu chứng từ', 'chưa có hoá đơn / ảnh / UNC nào'],
  ['thieuMaDon', 'Chưa có mã đơn Tourwell', 'không có đơn thì không gạch nợ được'],
];

function dongKhoan(c, kieu) {
  const them = kieu === 'choChinh' && c.lyDoTuChoi ? ' — <font color="red">' + String(c.lyDoTuChoi).slice(0, 80) + '</font>' : '';
  return '• ' + ddmm(ngayCua(c)) + ' · ' + String(c.noiDung || '(không tên)').slice(0, 70) + ' · **' + tien(c.tien) + '**' + them;
}

function theNhac(pl, { urlHub, twHost }) {
  const { k, nhom } = pl;
  const conNgay = HAN - k.ngay;
  const gap = k.ngay >= HAN - 1;
  const el = [];
  el.push({ tag: 'markdown', content:
    'Thanh toán toàn bộ chi phí **' + k.ten + '** — kế toán **đóng sổ ngày ' + k.han + '**' +
    (conNgay > 0 ? ' (còn ' + conNgay + ' ngày)' : ' (hôm nay)') + '.\n' +
    k.ten.charAt(0).toUpperCase() + k.ten.slice(1) + ': ' + pl.soKy + ' khoản · ' + tien(pl.tongKy) + ' · đã quyết toán ' + pl.daXongKy + '/' + pl.soKy +
    (pl.cuHon ? '\n<font color="red">Còn ' + pl.cuHon + ' khoản của các tháng trước nữa chưa quyết toán.</font>' : '') });
  el.push({ tag: 'hr' });
  el.push({ tag: 'markdown', content: '**1. Gạch nợ tại quỹ Tourwell**\nĐối chiếu và gạch các đơn ' + k.ten + ' ở nhà cung cấp quỹ Marketing trên Tourwell.' });
  el.push({ tag: 'markdown', content: '**2. Giải quyết hoá đơn đã phát sinh**' + (pl.conViec ? '' : '\n✅ Không còn khoản nào thiếu — chỉ chờ kế toán quyết toán.') });
  for (const [kieu, ten, giai] of MUC) {
    const ds = nhom[kieu];
    if (!ds.length) continue;
    const hien = ds.slice(0, 6).map((c) => dongKhoan(c, kieu)).join('\n');
    el.push({ tag: 'markdown', content: '<font color="' + (kieu === 'choChi' || kieu === 'choChinh' ? 'red' : 'orange') + '">**' + ten + ': ' + ds.length + ' khoản**</font> · ' + giai + '\n' + hien + (ds.length > 6 ? '\n… và ' + (ds.length - 6) + ' khoản nữa' : '') });
  }
  if (nhom.choQt.length) el.push({ tag: 'note', elements: [{ tag: 'plain_text', content: nhom.choQt.length + ' khoản đã chi, đang chờ kế toán quyết toán (' + tien(nhom.choQt.reduce((a, c) => a + (Number(c.tien) || 0), 0)) + ').' }] });
  const nut = [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: 'Mở quỹ Tourwell' }, url: twHost + '/admin/supplier/' + NCC_TOURWELL + '/show' },
    { tag: 'button', type: 'default', text: { tag: 'plain_text', content: 'Mở Quỹ chi phí' }, url: urlHub + '/#/m/quy-chi-phi' }];
  el.push({ tag: 'action', actions: nut });
  return {
    config: { wide_screen_mode: true },
    header: {
      template: gap ? 'red' : pl.conViec ? 'orange' : 'blue',
      title: { tag: 'plain_text', content: (gap ? 'Mai đóng sổ · ' : 'Đóng sổ ') + k.ten + ' · hạn ' + k.han.slice(0, 5) + (pl.conViec ? ' · còn ' + pl.conViec + ' việc' : '') },
    },
    elements: el,
  };
}

function timNguoiNhan(chi, dot) {
  const k = boDau(TEN);
  for (const r of [...dot.map((d) => d.nguoiGiu), ...chi.map((c) => c.nguoi)]) {
    for (const u of r || []) if (u && u.id && boDau(u.name) === k) return u;
  }
  return null;
}

let tinApp = null;
async function gui(lark, cfg, u, card, khoa) {
  if (cfg.appId && cfg.appSecret) {                          // Render: bot Marketing Hub
    if (!tinApp) tinApp = require('../lark-chung/tin-lark').tao({ appId: cfg.appId, appSecret: cfg.appSecret, apiHost: cfg.apiHost, tenApp: 'Marketing Hub' });
    return tinApp.gui({ userId: u.id, card, khoa });
  }
  try {                                                       // máy: bot lark-cli
    await lark.cli(['im', '+messages-send', '--as', 'bot', '--user-id', u.id, '--msg-type', 'interactive', '--content', JSON.stringify(card), '--idempotency-key', khoa, '--format', 'json'], { retries: 1 });
    return { ok: true };
  } catch (e) { return { ok: false, loi: e.message }; }
}

/**
 * Dựng (+ gửi). dep = { docChi, lark, cfg, twHost, urlHub }.
 * `ep` bỏ qua luật ngày (gửi thử) · `xem` chỉ dựng, không gửi.
 */
async function chay(dep, { t = Date.now(), ep = false, xem = false, tieuDeThem = '' } = {}) {
  const { chi, dot } = await dep.docChi();
  const pl = phanLoai(chi, t);
  if (!ep && pl.k.ngay !== 1 && !pl.conViec) return { ok: true, bo: 'không còn việc — ngày ' + pl.k.ngay + ' không nhắc' };
  const card = theNhac(pl, dep);
  if (tieuDeThem) card.header.title.content = tieuDeThem + card.header.title.content;
  const tomTat = { ky: pl.k.ten, han: pl.k.han, soKy: pl.soKy, tongKy: pl.tongKy, conViec: pl.conViec,
    choChi: pl.nhom.choChi.length, choChinh: pl.nhom.choChinh.length, thieuChungTu: pl.nhom.thieuChungTu.length,
    thieuMaDon: pl.nhom.thieuMaDon.length, choQt: pl.nhom.choQt.length, cuHon: pl.cuHon };
  if (xem) return Object.assign({ ok: true, card }, tomTat);
  const u = timNguoiNhan(chi, dot);
  if (!u) return { ok: false, loi: 'Không tìm thấy "' + TEN + '" trong cột Người đề nghị / Người giữ quỹ' };
  const r = await gui(dep.lark, dep.cfg, u, card, 'quy-nhac-' + ngayVN(t) + (ep ? '-' + Date.now() : ''));
  return Object.assign({ nguoiNhan: u.name }, tomTat, r);
}

function bat(dep) {
  if (process.env.QUY_NHAC_TAT === '1') return;
  let dang = false, daGui = '';
  try { daGui = JSON.parse(fs.readFileSync(FILE, 'utf8')).ngay || ''; } catch (_) { /* chưa có */ }
  const thu = async () => {
    const t = Date.now(), d = vn(t), h = d.getUTCHours(), ngay = ngayVN(t);
    if (dang || daGui === ngay || !NGAY_NHAC.includes(d.getUTCDate()) || h < GIO_TU || h >= GIO_DEN) return;
    dang = true;
    try {
      const r = await chay(dep, { t });
      if (r.ok) {
        daGui = ngay;
        try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ ngay })); } catch (_) { /* ổ tạm */ }
      }
      console.log('[NHẮC ĐÓNG SỔ]', r.bo || (r.ok ? 'đã nhắc ' + r.nguoiNhan + ' · ' + r.ky + ' · còn ' + r.conViec + ' việc' : 'LỖI ' + r.loi));
    } catch (e) { console.error('[NHẮC ĐÓNG SỔ]', e.message); } finally { dang = false; }
  };
  setTimeout(thu, 90 * 1000);
  setInterval(thu, 10 * 60 * 1000).unref();
}

module.exports = { bat, chay, phanLoai, kyDong, theNhac, timNguoiNhan, gui };
