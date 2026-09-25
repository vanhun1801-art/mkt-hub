'use strict';
/**
 * Nhắc báo cáo + đề xuất nhập quỹ khi quỹ xuống dưới ngưỡng (25/09/2026).
 *
 * Ngưỡng mặc định 1.500.000 đ (anh Hùng chốt), đổi bằng QUY_NGUONG. Số dư là MỘT con
 * số cho cả sổ — tổng đã ứng − tổng đã chi, đúng hàm tinhQuy của server (không cộng
 * lại theo cách khác, hai nơi tính một con số thì sớm muộn lệch).
 *
 * Khi nào nhắn (kiểm mỗi 20 phút, chỉ trong 8:00–20:59 giờ VN):
 *   - vừa xuống dưới ngưỡng → nhắn ngay (thường là ngay sau khi khai một khoản chi);
 *   - vẫn dưới ngưỡng → nhắc lại mỗi 2 ngày, cho tới khi có lần nạp đưa quỹ lên lại.
 * Quỹ lên lại ≥ ngưỡng thì quên trạng thái, lần sau tụt là nhắn lại từ đầu.
 * Tắt: QUY_THAP_TAT=1.
 *
 * Trạng thái nhớ ở du-lieu/quy-thap.json. Render xoá ổ mỗi lần deploy, nên sau deploy
 * mà quỹ đang thấp thì có thể nhận thêm một tin — chấp nhận, nhắc thừa còn hơn lỡ.
 *
 * Người nhận và cách gửi: dùng chung với nhac-thang.js (tìm "Lê Văn Hùng" trong sổ).
 */
const fs = require('fs');
const path = require('path');
const { timNguoiNhan, gui } = require('./nhac-thang');

const LECH = 7 * 3600000, NGAY = 86400000;
const NGUONG = Number(process.env.QUY_NGUONG || 1500000);
const NHAC_LAI = 2;                                          // ngày
const GIO_TU = 8, GIO_DEN = 21;
const FILE = path.join(__dirname, 'du-lieu', 'quy-thap.json');

const ngayVN = (t) => new Date(t + LECH).toISOString().slice(0, 10);
const tien = (n) => (Number(n) || 0).toLocaleString('vi-VN') + ' đ';
const ngayCua = (c) => String(c.ngayChi || c.ngayDeNghi || '').slice(0, 10);
/* làm tròn lên 500.000 đ — số đề xuất gửi Sếp nên là số chẵn */
const chan = (n) => Math.ceil(n / 500000) * 500000;

/** Tình hình quỹ để dựng thẻ. `quy` = kết quả tinhQuy của server. */
function tinhHinh({ chi }, quy, t = Date.now(), nguong = NGUONG) {
  const moc = ngayVN(t - 30 * NGAY), homNay = ngayVN(t);
  const da30 = chi.filter((c) => c.tinhTrang !== 'Chờ chi' && ngayCua(c) >= moc && ngayCua(c) <= homNay);
  const chi30 = da30.reduce((a, c) => a + (Number(c.tien) || 0), 0);
  const choChi = chi.filter((c) => c.tinhTrang === 'Chờ chi');
  const tienCho = choChi.reduce((a, c) => a + (Number(c.tien) || 0), 0);
  const moiNgay = chi30 / 30;
  return {
    conLai: quy.conLai, nguong, thap: quy.conLai < nguong,
    chi30, soKhoan30: da30.length, moiNgay,
    duNgay: moiNgay > 0 ? Math.max(0, Math.floor(quy.conLai / moiNgay)) : null,
    tienCho, soCho: choChi.length, sauCho: quy.conLai - tienCho,
    deXuat: chan(Math.max(chi30, nguong * 2) + Math.max(0, tienCho - quy.conLai)),
    ganNhat: [...chi].filter((c) => ngayCua(c)).sort((a, b) => ngayCua(b).localeCompare(ngayCua(a))).slice(0, 3),
  };
}

function theQuyThap(th, { urlHub, baoCaoDen }, soNgayThap = 0) {
  const am = th.conLai < 0;
  const el = [];
  el.push({ tag: 'markdown', content:
    'Quỹ còn **<font color="red">' + tien(th.conLai) + '</font>** — dưới ngưỡng ' + tien(th.nguong) + '.' +
    (soNgayThap ? ' Đã dưới ngưỡng **' + soNgayThap + ' ngày**.' : '') +
    (th.duNgay != null ? '\nTheo mức chi 30 ngày qua (~' + tien(Math.round(th.moiNgay)) + '/ngày) quỹ còn đủ khoảng **' + th.duNgay + ' ngày**.' : '') +
    (th.soCho ? '\n<font color="orange">Còn ' + th.soCho + ' khoản Chờ chi · ' + tien(th.tienCho) + ' — chi hết thì quỹ còn ' + tien(th.sauCho) + '.</font>' : '') });
  el.push({ tag: 'div', fields: [
    { is_short: true, text: { tag: 'lark_md', content: '**Chi 30 ngày qua**\n' + tien(th.chi30) + ' · ' + th.soKhoan30 + ' khoản' } },
    { is_short: true, text: { tag: 'lark_md', content: '**Gợi ý mức nhập**\n' + tien(th.deXuat) } },
  ] });
  el.push({ tag: 'hr' });
  el.push({ tag: 'markdown', content:
    '**Việc cần làm**\n' +
    '1. Lập **báo cáo quỹ** (cơ cấu chi, số dư) gửi Ban Giám Đốc' + (baoCaoDen ? ' — ' + baoCaoDen : '') + '.\n' +
    '2. Kèm **đề xuất nhập quỹ mới** — gợi ý ' + tien(th.deXuat) + ' (≈ mức chi 30 ngày' + (th.tienCho > th.conLai ? ' + phần Chờ chi còn thiếu' : '') + ', làm tròn).\n' +
    '3. Nhận tiền xong thì ghi **Lần nạp quỹ** trong app — tin nhắc này tự dừng.' });
  el.push({ tag: 'action', actions: [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: 'Mở Quỹ chi phí' }, url: urlHub + '/#/m/quy-chi-phi' }] });
  return {
    config: { wide_screen_mode: true },
    header: { template: am ? 'red' : 'orange', title: { tag: 'plain_text', content: (am ? 'Quỹ đã âm · ' : 'Quỹ sắp hết · còn ') + tien(th.conLai) + ' — báo cáo & đề xuất nhập quỹ' } },
    elements: el,
  };
}

/** dep = { docChi, tinhQuy, lark, cfg, urlHub, baoCaoDen } */
async function chay(dep, { t = Date.now(), xem = false, ep = false, nguong = NGUONG, soNgayThap = 0, tieuDeThem = '' } = {}) {
  const so = await dep.docChi();
  const th = tinhHinh(so, dep.tinhQuy(so.chi, so.nap), t, nguong);
  if (!th.thap && !ep) return { ok: true, bo: 'quỹ còn ' + th.conLai + ' ≥ ngưỡng', conLai: th.conLai };
  const card = theQuyThap(th, dep, soNgayThap);
  if (tieuDeThem) card.header.title.content = tieuDeThem + card.header.title.content;
  const tomTat = { conLai: th.conLai, nguong: th.nguong, thap: th.thap, chi30: th.chi30, duNgay: th.duNgay, soCho: th.soCho, tienCho: th.tienCho, deXuat: th.deXuat };
  if (xem) return Object.assign({ ok: true, card }, tomTat);
  const u = timNguoiNhan(so.chi, so.dot);
  if (!u) return { ok: false, loi: 'Không tìm thấy người nhận trong sổ' };
  const r = await gui(dep.lark, dep.cfg, u, card, 'quy-thap-' + ngayVN(t) + (ep ? '-' + Date.now() : ''));
  return Object.assign({ nguoiNhan: u.name }, tomTat, r);
}

function bat(dep) {
  if (process.env.QUY_THAP_TAT === '1') return;
  let dang = false, tt = null;                              // tt = { dau, lanCuoi } khi đang dưới ngưỡng
  try { tt = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { /* chưa có */ }
  const ghi = () => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(tt || {})); } catch (_) { /* ổ tạm */ } };
  const thu = async () => {
    const t = Date.now(), h = new Date(t + LECH).getUTCHours(), ngay = ngayVN(t);
    if (dang || h < GIO_TU || h >= GIO_DEN) return;
    dang = true;
    try {
      const so = await dep.docChi();
      const q = dep.tinhQuy(so.chi, so.nap);
      if (q.conLai >= NGUONG) { if (tt && tt.dau) { tt = null; ghi(); console.log('[QUỸ THẤP] quỹ đã lên lại ' + q.conLai); } return; }
      if (tt && tt.lanCuoi && (Date.parse(ngay) - Date.parse(tt.lanCuoi)) / NGAY < NHAC_LAI) return;
      const soNgayThap = tt && tt.dau ? Math.round((Date.parse(ngay) - Date.parse(tt.dau)) / NGAY) : 0;
      const r = await chay(dep, { t, soNgayThap });
      if (r.ok && !r.bo) { tt = { dau: (tt && tt.dau) || ngay, lanCuoi: ngay }; ghi(); }
      console.log('[QUỸ THẤP]', r.bo || (r.ok ? 'đã nhắc ' + r.nguoiNhan + ' · quỹ còn ' + r.conLai : 'LỖI ' + r.loi));
    } catch (e) { console.error('[QUỸ THẤP]', e.message); } finally { dang = false; }
  };
  setTimeout(thu, 2 * 60 * 1000);
  setInterval(thu, 20 * 60 * 1000).unref();
}

module.exports = { bat, chay, tinhHinh, theQuyThap, NGUONG };
