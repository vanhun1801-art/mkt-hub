'use strict';
/**
 * Link gửi khách — trang tour CÔNG KHAI, không cần đăng nhập (anh Hùng 26/09).
 *
 * Nhân viên bấm "Tạo link gửi khách" trong chi tiết tour của tab Bản đồ → link dạng
 *   https://<hub>/k/tour/G4
 * Lớp vỏ mở riêng đường /k/* (chỉ GET, không mang danh tính) và chuyển xuống đây thành
 * /khach/*. Nên mọi thứ ở file này phải an toàn khi người lạ trên Internet gọi:
 *   · CHỈ ĐỌC — không có nhánh ghi nào
 *   · dữ liệu theo DANH SÁCH CHO PHÉP (hamKhach) — không bao giờ trả thẳng hồ sơ sản phẩm:
 *     ghi chú ưu đãi nội bộ, giá net, lưu ý, nguồn, người cập nhật, link nội bộ đều bị bỏ
 *   · chỉ sản phẩm đang bán / sắp ra mắt
 *   · KHÔNG gọi aiGoi(): request không header hub sẽ bị hiểu là "chạy một mình = quản lý"
 *
 * Đường:
 *   /khach/tour/<mã>        trang cho khách (lark-ban-do/public/khach.html, điền sẵn tiêu đề + ảnh xem trước)
 *   /khach/api/tour/<mã>    dữ liệu tour (JSON)
 *   /khach/ban-do/*         bản đồ ở chế độ khách (cùng tệp với tab Bản đồ)
 */
const fs = require('fs');
const path = require('path');
const kho = require('./kho');

const TRANG = path.join(__dirname, '..', 'lark-ban-do', 'public', 'khach.html');
const BAN_DUOC = /Đang kinh doanh|Sắp ra mắt/i;
const boEmoji = (s) => String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
const dong = (s) => String(s || '').split('\n').map((x) => x.replace(/^\s*[-–•+*]\s*/, '').trim()).filter(Boolean);
const loaiTour = (nhom) => (/ghép/i.test(nhom) ? 'ghep' : /riêng|VIP/i.test(nhom) ? 'rieng' : /lẻ/i.test(nhom) ? 've' : 'khac');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tien = (n) => (n == null ? '' : Number(n).toLocaleString('vi-VN') + 'đ');

/* Loại media cho khách xem được — tài liệu nội bộ (bảng giá đối tác, kịch bản…) không đưa ra */
const MEDIA_KHACH = /ảnh|video|chương trình|lịch trình|thư mục|brochure|tài liệu bán hàng/i;

/** Hồ sơ tour cho khách — DANH SÁCH CHO PHÉP, không sao chép cả đối tượng sản phẩm. */
function hamKhach(p) {
  const sg = p.giaSauGiam || null;
  const media = (p.media || []).filter((m) => m.link && MEDIA_KHACH.test(m.loai + ' ' + m.ten))
    .map((m) => ({ ten: m.ten, loai: m.loai, ngonNgu: m.ngonNgu, link: m.link }));
  return {
    ma: p.ma,
    ten: p.ten,
    tenEn: p.tenEn || '',
    loai: loaiTour(p.nhom),
    nhom: boEmoji(p.nhom),
    sapRaMat: /Sắp ra mắt/i.test(p.trangThai),
    thoiLuong: p.thoiLuong || '',
    khoiHanh: p.khoiHanh || '',
    giaNL: p.giaNL ?? null,
    giaTE: p.giaTE ?? null,
    sauGiamNL: sg && sg.nl != null && sg.nl < (p.giaNL ?? Infinity) ? sg.nl : null,
    sauGiamTE: sg && sg.te != null && sg.te < (p.giaTE ?? Infinity) ? sg.te : null,
    bacGia: (p.giaPax || []).filter((r) => r.giaNL).map((r) => ({ soKhach: r.soKhach, giaNL: r.giaNL, giaTE: r.giaTE || null })),
    noiBat: dong(p.usp).concat(dong(p.noiBat)).slice(0, 12),
    lichTrinh: String(p.lichTrinh || '').trim(),
    baoGom: dong(p.baoGom),
    khongBaoGom: dong(p.chuaBaoGom),
    treEm: dong(p.csTreEm),
    media,
  };
}

async function timTour(ma) {
  const { ds } = await kho.tatCa();
  const p = ds.find((x) => x.ma === ma);
  return p && BAN_DUOC.test(p.trangThai) ? p : null;
}

/** Trả true nếu đã xử lý. `banDo(res, duong)` là hàm phục vụ bản đồ của server.js. */
async function xuLy(req, res, u, { gui, json, banDo }) {
  const p = u.pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') { gui(res, 405, 'Chỉ đọc', { 'Content-Type': 'text/plain; charset=utf-8' }); return true; }

  const mBd = p.match(/^\/khach\/ban-do(\/.*)?$/);
  if (mBd) { await banDo(res, '/ban-do' + (mBd[1] || '/')); return true; }

  const mApi = p.match(/^\/khach\/api\/tour\/([A-Za-z0-9_-]{1,40})$/);
  if (mApi) {
    const tr = await timTour(mApi[1]);
    if (!tr) { json(res, { error: 'Tour không có hoặc đã ngừng bán' }, 404); return true; }
    json(res, hamKhach(tr));
    return true;
  }

  const mTrang = p.match(/^\/khach\/tour\/([A-Za-z0-9_-]{1,40})\/?$/);
  if (mTrang) {
    const tr = await timTour(mTrang[1]);
    let html = fs.readFileSync(TRANG, 'utf8');
    /* điền sẵn tiêu đề + mô tả để Zalo / Messenger / Facebook hiện thẻ xem trước khi dán link */
    const o = tr ? hamKhach(tr) : null;
    const gia = o ? (o.sauGiamNL ?? o.giaNL) : null;
    const tieuDe = o ? o.ten + ' — Rooty Trip Phú Quốc' : 'Tour Rooty Trip Phú Quốc';
    const moTa = o ? [gia ? 'Chỉ từ ' + tien(gia) + '/người lớn' : '', o.thoiLuong, o.khoiHanh, o.noiBat[0] || ''].filter(Boolean).join(' · ') : 'Tour không có hoặc đã ngừng bán';
    html = html.split('{{TIEU_DE}}').join(esc(tieuDe)).split('{{MO_TA}}').join(esc(moTa)).split('{{MA}}').join(esc(mTrang[1]));
    gui(res, tr ? 200 : 404, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Hub-Khong-Chen': '1' });
    return true;
  }

  gui(res, 404, 'Không có trang này', { 'Content-Type': 'text/plain; charset=utf-8' });
  return true;
}

module.exports = { xuLy, hamKhach };
