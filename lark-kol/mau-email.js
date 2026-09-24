'use strict';
/**
 * Ba email của một chuyến hợp tác, sinh từ CÙNG một bản ghi:
 *   deXuat  — trình Ban Giám Đốc (có bảng kê tiền)
 *   thuMoi  — gửi KOL (KHÔNG có giá, chỉ nội dung tài trợ + bàn giao)
 *   baoCao  — báo kết quả cho BGĐ sau chuyến
 *
 * Bố cục chép đúng hai email anh Hùng từng gửi (09/07 và 30/07/2026) để BGĐ và
 * KOL đọc quen mắt. Chữ ký KHÔNG chèn ở đây — Lark Mail tự gắn chữ ký mặc định
 * "Signature hunglv@rootytrip.com".
 *
 * HTML chỉ dùng thẻ + style nội dòng đơn giản: Gmail/Outlook bên nhận bỏ <style>.
 */
const T = require('./tinh');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XANH = '#239f87';     // màu bảng kê cũ của anh Hùng
const O = 'border:1px solid #cfd8dc;padding:6px 8px;';
const P = (s) => '<p style="margin:0 0 10px">' + s + '</p>';
const H = (s) => '<p style="margin:16px 0 6px"><b>' + s + '</b></p>';
const tien = (n) => T.tien(n || 0);

/** Tên dịch vụ bỏ đuôi loại khách: "Tour Land 5 — Người lớn" → "Tour Land 5". */
const tenGon = (s) => String(s || '').replace(/\s+[—-]\s+(Người lớn|Trẻ em|Em bé)$/i, '').trim();
const nhomLa = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const NHOM = ['Tour', 'Vé tham quan', 'Ăn uống', 'Lưu trú', 'Di chuyển', 'Khác'];

function xung(kol) {
  const x = kol.xungHo || 'Chị';
  const ten = kol.tenGoi || String(kol.ten || '').split(' ').slice(-1)[0];
  /* giữa câu viết thường ("gửi đến chị Cương"), đầu câu viết hoa ("Chị Cương vui lòng…") */
  return { x, ten, day: x.toLowerCase() + ' ' + ten, dau: x + ' ' + ten, hoa: x.toUpperCase() + ' ' + String(kol.ten || '').toUpperCase() };
}

function soKhach(ht) {
  const p2 = (n) => String(n).padStart(2, '0');
  const ds = [];
  if (ht.nguoiLon) ds.push(p2(ht.nguoiLon) + ' người lớn');
  if (ht.treEm) ds.push(p2(ht.treEm) + ' trẻ em');
  if (ht.emBe) ds.push(p2(ht.emBe) + ' em bé');
  return ds.join('; ') || 'chưa khai';
}
const khoang = (ht) => (ht.batDau ? T.ddmm(ht.batDau) : '?') + ' - ' +
  (ht.ketThuc ? T.ddmm(ht.ketThuc) + '/' + T.vn(ht.ketThuc).nam : '?');

/** Nội dung tài trợ theo ngày: gộp dòng NL/TE của cùng dịch vụ thành một. */
function theoNgay(hm) {
  const song = hm.filter((h) => h.tinhTrang !== 'Huỷ');
  const ngay = new Map();
  for (const h of song.slice().sort((a, b) => (a.ngay || 0) - (b.ngay || 0) || (a.gioHen || 0) - (b.gioHen || 0))) {
    const k = h.ngay ? T.ngayCua(h.ngay) : 'Chưa xếp ngày';
    if (!ngay.has(k)) ngay.set(k, []);
    const ten = tenGon(h.ten);
    const ds = ngay.get(k);
    if (!ds.some((x) => x.ten === ten)) ds.push({ ten, gio: h.gioHen, nhom: h.nhom });
  }
  return [...ngay.entries()];
}
function khoiTaiTro(hm) {
  return theoNgay(hm).map(([k, ds]) => {
    const nhan = /^\d{4}-/.test(k) ? 'Ngày ' + k.slice(8, 10) + '/' + k.slice(5, 7) + '/' + k.slice(0, 4) : k;
    return '<p style="margin:0 0 4px">- <b>' + nhan + ':</b> ' +
      ds.map((d) => (d.gio ? T.hhmm(d.gio) + ' ' : '') + esc(d.ten)).join('; ') + '</p>';
  }).join('');
}

function bangKe(hm) {
  const song = hm.filter((h) => h.tinhTrang !== 'Huỷ');
  const nhom = NHOM.filter((n) => song.some((h) => (h.nhom || 'Khác') === n));
  const dau = ['STT', 'Khoản mục', 'SL', 'Đêm/Lượt', 'Đơn giá', 'Thành tiền', 'Hình thức']
    .map((c) => '<th style="' + O + 'background:' + XANH + ';color:#fff;text-align:center">' + c + '</th>').join('');
  let body = '';
  nhom.forEach((n, i) => {
    const ds = song.filter((h) => (h.nhom || 'Khác') === n);
    const cong = ds.reduce((s, h) => s + T.thanhTien(h), 0);
    body += '<tr style="background:#e0f2ef;font-weight:bold"><td style="' + O + 'text-align:center">' + nhomLa[i] +
      '</td><td style="' + O + '" colspan="4">' + esc(n) + '</td><td style="' + O + 'text-align:right">' + tien(cong) +
      '</td><td style="' + O + '"></td></tr>';
    ds.forEach((h, j) => {
      const foc = h.hinhThuc !== 'Công ty chi';
      /* Em bé 0đ: ghi "Miễn phí" thay vì "Công ty chi 0" — BGĐ đọc khỏi thắc mắc. */
      const mienPhi = h.loaiKhach === 'Em bé' && !T.thanhTien(h);
      body += '<tr><td style="' + O + 'text-align:center">' + (j + 1) + '</td><td style="' + O + '">' + esc(h.ten) +
        '</td><td style="' + O + 'text-align:center">' + (h.soLuong || 0) + '</td><td style="' + O + 'text-align:center">' +
        (h.demLuot == null ? 1 : h.demLuot) + '</td><td style="' + O + 'text-align:right">' +
        (foc || mienPhi ? '-' : tien(h.donGiaChi)) + '</td><td style="' + O + 'text-align:right">' + (foc || mienPhi ? '-' : tien(T.thanhTien(h))) +
        '</td><td style="' + O + 'text-align:center">' + esc(mienPhi ? 'Miễn phí' : ['Chưa đề xuất', 'Đã gửi đề xuất'].includes(h.xinFoc) ? 'Đang đề xuất FOC' : h.hinhThuc || '') + '</td></tr>';
    });
  });
  const t = T.tongHopTac(hm);
  body += '<tr style="background:' + XANH + ';color:#fff;font-weight:bold"><td style="' + O + '"></td><td style="' + O +
    '" colspan="4">TỔNG CÔNG TY CHI</td><td style="' + O + 'text-align:right">' + tien(t.tienCongTy) + '</td><td style="' + O + '"></td></tr>';
  return '<table style="border-collapse:collapse;font-size:13px;margin:6px 0 8px">' + '<tr>' + dau + '</tr>' + body + '</table>';
}

/** Tên kênh đăng của một sản phẩm: "TikTok · Mẹ ZinZon". Chưa chọn kênh thì lùi về nền tảng. */
function tenKenhDang(b, kenh) {
  const ds = (b.kenhDang || []).map((id) => (kenh || []).find((k) => k.id === id)).filter(Boolean);
  if (ds.length) return ds.map((k) => k.nenTang + ' · ' + k.ten + (k.reup ? ' (re-up)' : ''));
  return b.nenTang || [];
}
/** Mọi kênh KOL cam kết đăng — gộp từ bàn giao, thay cho ô "Kênh đăng tải" gõ tay trước đây. */
function kenhCamKet(bg, kenh, cu) {
  const s = [...new Set(bg.filter((b) => b.trangThai !== 'Huỷ').flatMap((b) => tenKenhDang(b, kenh)))];
  return s.length ? s.join('; ') : (cu || '');
}

/** Bàn giao gom theo chủ đề: a) Vinwonders: 01 Video …; 01 Ảnh … */
function khoiBanGiao(bg, kenh) {
  const song = bg.filter((b) => b.trangThai !== 'Huỷ');
  const chuDe = [...new Set(song.map((b) => b.chuDe || 'Chung'))];
  const chu = 'abcdefghij';
  return chuDe.map((c, i) => '<p style="margin:6px 0 2px"><b>' + chu[i] + ') Chủ đề ' + esc(c) + ':</b></p>' +
    song.filter((b) => (b.chuDe || 'Chung') === c).map((b) => {
      const k = tenKenhDang(b, kenh);
      return '<p style="margin:0 0 2px;padding-left:14px">' + String(b.soLuong || 1).padStart(2, '0') + ' ' + esc(b.ten) +
        (k.length ? ' <span style="color:#667">(' + esc(k.join(', ')) + ')</span>' : '') + '</p>';
    }).join('')
  ).join('');
}

/* Bảng sản phẩm KOL cam kết (anh Hùng 24/09: mục 4 cũ đọc không ra kết quả nhận được) —
 * mỗi dòng một sản phẩm: chủ đề, loại + số lượng, đăng ở kênh nào (có link), hạn đăng. */
function bangBanGiao(bg, kenh) {
  const song = bg.filter((b) => b.trangThai !== 'Huỷ').sort((a, b) => (a.hanDang || 9e15) - (b.hanDang || 9e15));
  if (!song.length) return P('<i>Chưa khai sản phẩm bàn giao.</i>');
  const kenhHtml = (b) => {
    const ds = (b.kenhDang || []).map((id) => (kenh || []).find((k) => k.id === id)).filter(Boolean);
    if (!ds.length) return esc((b.nenTang || []).join(', ') || '—');
    return ds.map((k) => esc(k.nenTang && k.nenTang !== 'Khác' ? k.nenTang + ' · ' : '') +
      (k.link ? '<a href="' + esc(k.link) + '">' + esc(k.ten) + '</a>' : esc(k.ten)) + (k.reup ? ' (re-up)' : '')).join('<br>');
  };
  const dau = ['STT', 'Sản phẩm', 'Loại', 'SL', 'Kênh đăng', 'Hạn đăng']
    .map((c) => '<th style="' + O + 'background:' + XANH + ';color:#fff;text-align:center">' + c + '</th>').join('');
  const dong = song.map((b, i) => '<tr><td style="' + O + 'text-align:center">' + (i + 1) + '</td><td style="' + O + '"><b>' + esc(b.ten) + '</b>' +
    (b.chuDe ? '<br><span style="color:#667">Chủ đề: ' + esc(b.chuDe) + '</span>' : '') + '</td><td style="' + O + 'text-align:center">' + esc(b.loai || '') +
    '</td><td style="' + O + 'text-align:center">' + String(b.soLuong || 1).padStart(2, '0') + '</td><td style="' + O + '">' + kenhHtml(b) +
    '</td><td style="' + O + 'text-align:center">' + (b.hanDang ? T.ddmm(b.hanDang) + '/' + T.vn(b.hanDang).nam : '—') + '</td></tr>').join('');
  const tong = song.reduce((n, b) => n + (Number(b.soLuong) || 1), 0);
  const theoLoai = {};
  for (const b of song) theoLoai[b.loai || 'Khác'] = (theoLoai[b.loai || 'Khác'] || 0) + (Number(b.soLuong) || 1);
  return '<table style="border-collapse:collapse;font-size:13px;margin:6px 0 8px"><tr>' + dau + '</tr>' + dong +
    '<tr style="background:#e0f2ef;font-weight:bold"><td style="' + O + '"></td><td style="' + O + '" colspan="5">Tổng: ' + String(tong).padStart(2, '0') + ' sản phẩm (' +
    Object.entries(theoLoai).map(([l, n]) => String(n).padStart(2, '0') + ' ' + esc(l.toLowerCase())).join(', ') + ')</td></tr></table>';
}

function khoiKenh(kenh) {
  if (!kenh.length) return P('Kênh: chưa khai');
  return '<p style="margin:0 0 4px">Kênh:</p>' + kenh.map((k) =>
    '<p style="margin:0 0 2px;padding-left:14px">' + esc(k.nenTang) + ': ' +
    (k.link ? '<a href="' + esc(k.link) + '">' + esc(k.ten) + '</a>' : esc(k.ten)) +
    (k.theoDoi != null ? ' | ' + tien(k.theoDoi) + ' lượt theo dõi' : '') + (k.reup ? ' (re-up)' : '') + '</p>').join('');
}

/* ================================================================ */
function deXuat({ ht, kol, kenh, hm, bg }, cfg) {
  const t = T.tongHopTac(hm);
  const ten = String(kol.ten || '').toUpperCase();
  const html = [
    P('Kính gửi ' + esc(cfg.bgdTen) + ','),
    P('Phòng Marketing trình duyệt hợp tác cùng <b>' + esc(kol.ten) + '</b>, người có sức ảnh hưởng ' +
      (kol.tongTheoDoi ? 'với khoảng ' + tien(kol.tongTheoDoi) + ' lượt theo dõi' : 'rộng rãi') +
      '. Việc hợp tác này là cơ hội tốt để Rooty Trip Phú Quốc tiếp cận thêm nhiều đối tượng mới và mở rộng tệp khán giả.'),
    H('1. Thông tin KOL'),
    '<p style="margin:0 0 2px">Tên đại diện: <b>' + esc(kol.ten) + '</b></p>',
    '<p style="margin:0 0 2px">Quốc tịch: ' + esc(kol.quocGia || '') + '</p>',
    '<p style="margin:0 0 2px">Email: ' + esc(kol.email || '') + '</p>',
    '<p style="margin:0 0 2px">Số điện thoại: ' + esc(kol.sdt || '') + '</p>',
    '<p style="margin:0 0 2px">Số lượng khách: ' + soKhach(ht) + '</p>',
    khoiKenh(kenh),
    P('Thời gian hợp tác: <b>' + khoang(ht) + '</b>'),
    H('2. Nội dung tài trợ'),
    khoiTaiTro(hm),
    H('3. Bảng kê chi phí'),
    bangKe(hm),
    '<p style="margin:0 0 2px">Tiền công ty chi: <b>' + tien(t.tienCongTy) + ' VNĐ</b></p>',
    H('4. Sản phẩm KOL cam kết'),
    bangBanGiao(bg, kenh),
    ht.yeuCau ? '<p style="margin:8px 0 2px"><b>Yêu cầu nội dung:</b></p>' + P(esc(ht.yeuCau).replace(/\n/g, '<br>')) : '',
    P('<br>Mong ' + esc(cfg.bgdTen) + ' phê duyệt đề xuất hợp tác trên nhằm tối ưu hiệu quả tiếp cận khách hàng tiềm năng ' +
      'và thúc đẩy chuyển đổi trên các nền tảng mạng xã hội.'),
    P('Trân trọng,'),
  ].join('\n');
  return { tieuDe: 'ĐỀ XUẤT HỢP TÁC TRUYỀN THÔNG ROOTY TRIP x ' + ten, den: cfg.bgdTo, html };
}

function thuMoi({ ht, kol, kenh, hm, bg }) {
  const x = xung(kol);
  const html = [
    P('Thân gửi KOL ' + esc(kol.ten) + ','),
    P('Rooty Trip Phú Quốc xin gửi lời chào nồng hậu đến ' + esc(x.day) + '!'),
    P('Cảm ơn ' + esc(x.day) + ' đã dành thời gian trao đổi với Rooty Trip Phú Quốc, chúng tôi rất vui mừng và trân trọng ' +
      'mối quan hệ hợp tác này. Dựa vào các nội dung trao đổi trước đó, chúng tôi gửi bảng tổng hợp nội dung hợp tác như bên dưới:'),
    H('1) NỘI DUNG TÀI TRỢ'),
    khoiTaiTro(hm),
    '<p style="margin:6px 0 2px">---</p>',
    '<p style="margin:0 0 2px">Số lượng: ' + soKhach(ht) + '</p>',
    P('Thời gian: ' + khoang(ht)),
    H('2) NỘI DUNG BÀN GIAO'),
    khoiBanGiao(bg, kenh),
    ht.yeuCau ? '<p style="margin:10px 0 2px"><b>Nội dung cần nhắc đến:</b></p>' + P(esc(ht.yeuCau)) : '',
    kenhCamKet(bg, kenh, ht.kenhDang) ? P('<b>Đăng tải nội dung tại kênh:</b> ' + esc(kenhCamKet(bg, kenh, ht.kenhDang))) : '',
    H('3) LƯU Ý CHUNG'),
    '<p style="margin:0 0 2px">Media được sản xuất trong quá trình hợp tác, 2 bên có thể sử dụng và trao đổi để phục vụ sản xuất nội dung.</p>',
    P('Hợp tác trên tinh thần bảo vệ hình ảnh diễn viên và bảo vệ hình ảnh thương hiệu.'),
    P(esc(x.dau) + ' vui lòng kiểm tra và xác nhận lại thông tin qua email này để đội ngũ Rooty Trip Phú Quốc chuẩn bị ' +
      'công tác đón tiếp chu đáo nhất nhé.'),
    P('Rất mong đợi được đồng hành cùng ' + esc(x.day) + ' và team tại Phú Quốc!'),
    P('Trân trọng,'),
  ].join('\n');
  return { tieuDe: 'THƯ MỜI HỢP TÁC ROOTY TRIP PHÚ QUỐC X ' + x.hoa, den: kol.email || '', html };
}

function baoCao({ ht, kol, hm, bg }, cfg) {
  const k = T.ketQua(ht, hm, bg);
  const bai = bg.filter((b) => b.trangThai === 'Đã đăng');
  const dong = bai.map((b) => '<tr><td style="' + O + '">' + (b.link ? '<a href="' + esc(b.link) + '">' + esc(b.ten) + '</a>' : esc(b.ten)) +
    '</td><td style="' + O + 'text-align:center">' + (b.ngayDang ? T.ddmm(b.ngayDang) : '') + '</td><td style="' + O + 'text-align:right">' +
    tien(T.xemMoiNhat(b)) + '</td><td style="' + O + 'text-align:right">' + tien((b.thich30 != null ? b.thich30 : b.thich7) || 0) +
    '</td><td style="' + O + 'text-align:right">' + tien((b.binhLuan30 != null ? b.binhLuan30 : b.binhLuan7) || 0) + '</td></tr>').join('');
  const th = (c) => '<th style="' + O + 'background:' + XANH + ';color:#fff">' + c + '</th>';
  const html = [
    P('Kính gửi ' + esc(cfg.bgdTen) + ','),
    P('Phòng Marketing báo cáo kết quả hợp tác cùng <b>' + esc(kol.ten) + '</b> (' + khoang(ht) + ').'),
    H('1. Chi phí'),
    '<p style="margin:0 0 2px">Tiền công ty chi: <b>' + tien(k.tienCongTy) + ' VNĐ</b></p>',
    P('Giá trị tài trợ quy đổi: <b>' + tien(k.giaTriQuyDoi) + ' VNĐ</b>'),
    H('2. Bàn giao'),
    P('Đã đăng <b>' + k.daDang + ' / ' + k.camKet + '</b> sản phẩm cam kết.'),
    bai.length ? '<table style="border-collapse:collapse;font-size:13px"><tr>' + th('Bài') + th('Ngày đăng') + th('Lượt xem') +
      th('Thích') + th('Bình luận') + '</tr>' + dong + '</table>' : '',
    H('3. Hiệu quả'),
    '<p style="margin:0 0 2px">Tổng lượt xem: <b>' + tien(k.xem) + '</b> · Tổng tương tác: <b>' + tien(k.tuongTac) + '</b></p>',
    k.cpm != null ? P('Chi phí / 1.000 lượt xem: <b>' + tien(k.cpm) + 'đ</b> (tiền thật) · <b>' + tien(k.cpmQuyDoi) + 'đ</b> (quy đổi)') : '',
    P('<br>Trân trọng,'),
  ].join('\n');
  return { tieuDe: 'BÁO CÁO KẾT QUẢ HỢP TÁC ROOTY TRIP x ' + String(kol.ten || '').toUpperCase(), den: cfg.bgdTo, html };
}

/**
 * Thư đề xuất hợp tác FOC gửi MỘT đối tác — liệt kê đúng các dịch vụ của đối tác đó, số khách,
 * ngày dùng, và sản phẩm truyền thông Rooty Trip / KOL trả lại (bàn giao gắn "Trả
 * cho đối tác" = đối tác này). Không có giá: đối tác tự biết giá của mình.
 */
function xinFoc({ ht, kol, kenh, hm, bg, doiTac, tenDoiTac }, cfg) {
  const song = hm.filter((h) => h.tinhTrang !== 'Huỷ');
  const gom = new Map();
  for (const h of song.slice().sort((a, b) => (a.ngay || 0) - (b.ngay || 0))) {
    const k = tenGon(h.ten) + '|' + (h.ngay ? T.ngayCua(h.ngay) : '');
    if (!gom.has(k)) gom.set(k, { ten: tenGon(h.ten), ngay: h.ngay, gio: h.gioHen, khach: [] });
    if (h.soLuong) gom.get(k).khach.push(h.soLuong + ' ' + String(h.loaiKhach || '').toLowerCase());
  }
  const tra = bg.filter((b) => b.trangThai !== 'Huỷ' && String(b.traDoiTac || '').trim().toLowerCase() === tenDoiTac.toLowerCase());
  const tongKenh = (kenh || []).filter((k) => !k.reup).reduce((s, k) => s + (k.theoDoi || 0), 0);
  const html = [
    P('Kính gửi ' + esc((doiTac && doiTac.lienHe) || 'Quý đối tác') + ' — ' + esc(tenDoiTac) + ','),
    P('Rooty Trip Phú Quốc đang chuẩn bị chuyến trải nghiệm cùng KOL <b>' + esc(kol.ten) + '</b>' +
      (tongTheoDoiChu(tongKenh)) + ' từ ' + khoang(ht) + '. Rooty Trip Phú Quốc trân trọng gửi đến ' + esc(tenDoiTac) + ' đề xuất hợp tác truyền thông: ' + esc(tenDoiTac) +
      ' đồng hành tài trợ (FOC) các dịch vụ dưới đây, đổi lại là các quyền lợi truyền thông cho thương hiệu trên kênh của KOL.'),
    '<table style="border-collapse:collapse;font-size:13px;margin:6px 0 10px"><tr>' +
      ['Ngày', 'Dịch vụ', 'Số khách'].map((c) => '<th style="' + O + 'background:' + XANH + ';color:#fff">' + c + '</th>').join('') + '</tr>' +
      [...gom.values()].map((x) => '<tr><td style="' + O + '">' + (x.ngay ? T.ddmm(x.ngay) + (x.gio ? ' ' + T.hhmm(x.gio) : '') : '') + '</td><td style="' + O + '">' +
        esc(x.ten) + '</td><td style="' + O + '">' + esc(x.khach.join(' + ')) + '</td></tr>').join('') + '</table>',
    H('Kênh của KOL'),
    (kenh || []).filter((k) => !k.reup).map((k) => '<p style="margin:0 0 2px;padding-left:14px">' + esc(k.nenTang) + ': ' +
      (k.link ? '<a href="' + esc(k.link) + '">' + esc(k.ten) + '</a>' : esc(k.ten)) + (k.theoDoi != null ? ' | ' + tien(k.theoDoi) + ' lượt theo dõi' : '') + '</p>').join(''),
    H('Quyền lợi dành cho ' + esc(tenDoiTac)),
    tra.length ? tra.map((b) => '<p style="margin:0 0 2px;padding-left:14px">' + String(b.soLuong || 1).padStart(2, '0') + ' ' + esc(b.ten) +
      (tenKenhDang(b, kenh).length ? ' (' + esc(tenKenhDang(b, kenh).join(', ')) + ')' : '') + '</p>').join('')
      : P('KOL sẽ trải nghiệm và nhắc tên, gắn thẻ ' + esc(tenDoiTac) + ' trong các nội dung đăng tải về chuyến đi.'),
    P('<br>Sau chuyến đi, Rooty Trip sẽ gửi lại đường dẫn bài đăng và số liệu (lượt xem, tương tác) để ' + esc(tenDoiTac) + ' tiện theo dõi.'),
    P('Rooty Trip Phú Quốc rất mong nhận được phản hồi từ ' + esc(tenDoiTac) + ' để hai bên kịp phối hợp chuẩn bị. Trân trọng cảm ơn!'),
    P('Trân trọng,'),
  ].join('\n');
  return { tieuDe: 'ĐỀ XUẤT HỢP TÁC TRUYỀN THÔNG · ' + tenDoiTac.toUpperCase() + ' x KOL ' + String(kol.ten || '').toUpperCase() + ' (' + khoang(ht) + ')',
    den: (doiTac && doiTac.email) || '', html };
}
const tongTheoDoiChu = (n) => (n ? ' (khoảng ' + tien(n) + ' lượt theo dõi)' : '');

/** Báo cáo gửi lại đối tác sau chuyến: chỉ các bài "Trả cho đối tác" = đối tác đó. */
function baoCaoDoiTac({ ht, kol, kenh, bg, doiTac, tenDoiTac }) {
  const bai = bg.filter((b) => b.trangThai !== 'Huỷ' && String(b.traDoiTac || '').trim().toLowerCase() === tenDoiTac.toLowerCase());
  const th = (c) => '<th style="' + O + 'background:' + XANH + ';color:#fff">' + c + '</th>';
  const html = [
    P('Kính gửi ' + esc((doiTac && doiTac.lienHe) || 'Quý đối tác') + ' — ' + esc(tenDoiTac) + ','),
    P('Rooty Trip Phú Quốc cảm ơn ' + esc(tenDoiTac) + ' đã đồng hành cùng chuyến trải nghiệm của KOL <b>' + esc(kol.ten) + '</b> (' + khoang(ht) + '). Kết quả các nội dung dành cho ' + esc(tenDoiTac) + ':'),
    '<table style="border-collapse:collapse;font-size:13px"><tr>' + th('Nội dung') + th('Kênh') + th('Ngày đăng') + th('Lượt xem') + th('Tương tác') + '</tr>' +
      bai.map((b) => '<tr><td style="' + O + '">' + (b.link ? '<a href="' + esc(b.link) + '">' + esc(b.ten) + '</a>' : esc(b.ten)) + '</td><td style="' + O + '">' +
        esc(tenKenhDang(b, kenh).join(', ')) + '</td><td style="' + O + 'text-align:center">' + (b.ngayDang ? T.ddmm(b.ngayDang) : 'chưa đăng') + '</td><td style="' + O + 'text-align:right">' +
        tien(T.xemMoiNhat(b)) + '</td><td style="' + O + 'text-align:right">' +
        tien(['thich', 'binhLuan', 'chiaSe', 'luu'].reduce((s, k) => s + ((b[k + '30'] != null ? b[k + '30'] : b[k + '7']) || 0), 0)) + '</td></tr>').join('') + '</table>',
    P('<br>Rất mong tiếp tục được hợp tác cùng ' + esc(tenDoiTac) + ' trong các chuyến tiếp theo.'),
    P('Trân trọng,'),
  ].join('\n');
  return { tieuDe: 'KẾT QUẢ TRUYỀN THÔNG · KOL ' + String(kol.ten || '').toUpperCase() + ' x ' + tenDoiTac.toUpperCase(), den: (doiTac && doiTac.email) || '', html };
}

module.exports = { deXuat, thuMoi, baoCao, xinFoc, baoCaoDoiTac, esc, tenGon, tenKenhDang };
