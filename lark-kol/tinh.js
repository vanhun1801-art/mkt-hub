'use strict';
/**
 * Quy tắc nghiệp vụ KOL — MỘT chỗ duy nhất. Không đọc Base, không gọi mạng, nên
 * test được bằng dữ liệu tay (test/tinh.test.js).
 *
 * Hai con số tiền, cố ý tách:
 *   Thành tiền      = SL × Đêm/Lượt × Đơn giá chi, CHỈ khi "Công ty chi"
 *                     → tiền thật ra khỏi quỹ, là số trình BGĐ duyệt.
 *   Giá trị quy đổi = SL × Đêm/Lượt × Giá công bố (thiếu thì lấy Đơn giá chi)
 *                     → giá trị KOL thực nhận, gồm cả phần đối tác FOC.
 * Bảng kê cũ ghi FOC đơn giá 0 nên mất hẳn phần giá trị thứ hai.
 */

const GIO = 3600000;
const NGAY = 24 * GIO;
const VN = 7 * GIO;          // Phú Quốc, UTC+7, không đổi giờ mùa
const p2 = (n) => String(n).padStart(2, '0');

/* ---------------- thời gian (luôn theo giờ Việt Nam) ---------------- */
function vn(ms) {
  const d = new Date(ms + VN);
  return { nam: d.getUTCFullYear(), thang: d.getUTCMonth() + 1, ngay: d.getUTCDate(),
    gio: d.getUTCHours(), phut: d.getUTCMinutes(), thu: d.getUTCDay() };
}
/** 'YYYY-MM-DD' theo giờ VN. */
const ngayCua = (ms) => { const t = vn(ms); return t.nam + '-' + p2(t.thang) + '-' + p2(t.ngay); };
/** Chuỗi giờ trần theo múi của Base (Asia/Bangkok = UTC+7) — xem memory lark-base-ghi-ngay. */
const choBase = (ms) => { const t = vn(ms); return ngayCua(ms) + ' ' + p2(t.gio) + ':' + p2(t.phut) + ':00'; };
/** 'YYYY-MM-DD' hoặc 'YYYY-MM-DDTHH:mm' (giờ VN) → ms. */
function tuChuoi(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s || ''));
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - VN;
}
const dauNgay = (ms) => tuChuoi(ngayCua(ms));
const soDem = (tu, den) => (tu && den ? Math.max(0, Math.round((dauNgay(den) - dauNgay(tu)) / NGAY)) : 0);

/* ---------------- tiền ---------------- */
const so = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const heSo = (h) => so(h.soLuong) * (h.demLuot == null ? 1 : so(h.demLuot));

function thanhTien(h) {
  return h.hinhThuc === 'Công ty chi' ? Math.round(heSo(h) * so(h.donGiaChi)) : 0;
}
function giaTriQuyDoi(h) {
  if (h.tinhTrang === 'Huỷ') return 0;
  const gia = h.giaCongBo != null ? h.giaCongBo : h.donGiaChi;
  return Math.round(heSo(h) * so(gia));
}
/** Dòng FOC mà chưa có giá công bố — giá trị tài trợ đang bị tính thiếu. */
const thieuGiaCongBo = (h) => h.tinhTrang !== 'Huỷ' && h.hinhThuc === 'FOC đối tác' &&
  !(h.giaCongBo > 0) && h.loaiKhach !== 'Em bé';

function tongHopTac(hangMuc) {
  const song = hangMuc.filter((h) => h.tinhTrang !== 'Huỷ');
  const t = { tienCongTy: 0, giaTriFOC: 0, giaTriQuyDoi: 0, thieuGia: 0, soDong: song.length, theoNhom: {} };
  for (const h of song) {
    const tt = thanhTien(h);
    const qd = giaTriQuyDoi(h);
    t.tienCongTy += tt;
    t.giaTriQuyDoi += qd;
    if (h.hinhThuc === 'FOC đối tác') t.giaTriFOC += qd;
    if (thieuGiaCongBo(h)) t.thieuGia++;
    const n = h.nhom || 'Khác';
    t.theoNhom[n] = (t.theoNhom[n] || 0) + tt;
  }
  return t;
}

/** Số lượng gợi ý theo loại khách — lấy từ số khách của chuyến, không gõ lại. */
function slGoiY(loaiKhach, ht) {
  if (loaiKhach === 'Người lớn') return so(ht.nguoiLon);
  if (loaiKhach === 'Trẻ em') return so(ht.treEm);
  if (loaiKhach === 'Em bé') return so(ht.emBe);
  return 1;
}
/** Em bé dưới 1m mặc định miễn phí (anh Hùng chốt 23/09/2026). */
const giaGoiY = (loaiKhach, nl, te) => (loaiKhach === 'Em bé' ? 0 : loaiKhach === 'Trẻ em' ? te : nl);

/* ---------------- bước ---------------- */
const BUOC = ['Đang trao đổi', 'Chờ BGĐ duyệt', 'BGĐ đã duyệt', 'Đã mời KOL', 'KOL đã xác nhận',
  'Đã tạo tour Tourwell', 'Đang đi tour', 'Chờ nhận sản phẩm', 'Hoàn tất', 'Huỷ'];
const viTri = (b) => BUOC.indexOf(b);

/**
 * Vì sao chặn: thư mời Châu Kim Cương gửi 30/07 — sau khi chuyến 11–13/07 đã xong.
 * Mỗi hành động chỉ mở khi bước trước đã qua; trả lý do để giao diện nói rõ.
 */
function duocLam(ht, viec) {
  const i = viTri(ht.buoc);
  const can = {
    /* anh Hùng 23/09: chốt bảng kê xong mới trình BGĐ — BGĐ duyệt đúng con số cuối. */
    trinhBgd: () => (i > 1 ? 'Đã qua bước trình duyệt' : !ht.chotLuc ? 'Chưa chốt bảng kê — chốt xong mới trình BGĐ' : ''),
    daDuyet: () => (i === 1 ? '' : 'Chỉ duyệt khi đang Chờ BGĐ duyệt'),
    guiThuMoi: () => (i >= 2 && i <= 3 ? '' : i < 2 ? 'BGĐ chưa duyệt — chưa gửi thư mời được' : 'Đã qua bước mời'),
    kolXacNhan: () => (i === 3 ? '' : 'Chỉ xác nhận sau khi đã gửi thư mời'),
    taoDichVu: () => (i === 4 ? '' : i < 4 ? 'KOL chưa xác nhận' : 'Đã tạo tour Tourwell'),
    baoCao: () => (i >= 7 ? '' : 'Chưa tới bước bàn giao'),
  }[viec];
  if (!can) return 'Không rõ hành động';
  if (ht.buoc === 'Huỷ') return 'Hợp tác đã huỷ';
  return can();
}

/**
 * Bước tự trôi theo lịch: đã tạo dịch vụ mà tới ngày đi → Đang đi tour; qua
 * ngày về → Chờ nhận sản phẩm. Chỉ đề xuất, server mới ghi.
 */
function buocTheoLich(ht, now) {
  /* Anh vừa lùi bước tay → đừng đẩy lên lại mỗi phút. */
  if (ht.khongTuChuyen) return '';
  const hn = dauNgay(now);
  if (ht.buoc === 'Đã tạo tour Tourwell' && ht.batDau && hn >= dauNgay(ht.batDau)) {
    return ht.ketThuc && hn > dauNgay(ht.ketThuc) ? 'Chờ nhận sản phẩm' : 'Đang đi tour';
  }
  if (ht.buoc === 'Đang đi tour' && ht.ketThuc && hn > dauNgay(ht.ketThuc)) return 'Chờ nhận sản phẩm';
  return '';
}

/**
 * Lùi về bước trước khi bấm nhầm. Trả { buoc, xoa } — `xoa` là các mốc của bước
 * bị bỏ (ngày trình, ngày duyệt…), không xoá thì dải bước vẫn hiện ngày của bước
 * chưa từng xảy ra. Huỷ thì trả về đúng bước trước lúc huỷ (đọc từ Lịch sử bước).
 */
function lui(ht) {
  const b = ht.buoc;
  if (b === 'Huỷ') {
    const dong = String(ht.lichSu || '').split('\n').reverse().find((d) => /→ Huỷ/.test(d));
    const m = dong && /·\s*(.+?)\s*→ Huỷ/.exec(dong);
    const truoc = m && BUOC.includes(m[1]) && m[1] !== 'Huỷ' ? m[1] : 'Đang trao đổi';
    return { buoc: truoc, xoa: { lyDoHuy: '' } };
  }
  const i = viTri(b);
  if (i <= 0) return null;
  const XOA = {
    'Chờ BGĐ duyệt': { trinhLuc: null },
    'BGĐ đã duyệt': { duyetLuc: null, nguoiDuyet: '', kenhDuyet: null },
    'Đã mời KOL': { thuMoiLuc: null },
    'KOL đã xác nhận': { xacNhanLuc: null },
  };
  const buoc = BUOC[i - 1];
  /* Lùi vào khoảng đi tour thì bộ tự chuyển sẽ đẩy lên lại ngay — khoá nó. */
  const khoa = ['Đã tạo tour Tourwell', 'Đang đi tour'].includes(buoc) || b === 'Đang đi tour' || b === 'Chờ nhận sản phẩm';
  return { buoc, xoa: { ...(XOA[b] || {}), ...(khoa ? { khongTuChuyen: true } : {}) } };
}

/** Một dòng Lịch sử bước: "23/09 15:40 · Đang trao đổi → Chờ BGĐ duyệt · gửi email". */
const dongLichSu = (tu, den, ly, ms) => ddmm(ms) + ' ' + hhmm(ms) + ' · ' + (tu ? tu + ' → ' + den : 'Bắt đầu: ' + den) + (ly ? ' · ' + ly : '');
const noiLichSu = (cu, dong) => (cu ? cu + '\n' : '') + dong;

/** Đối tác trả lời đề xuất FOC → dòng tự đổi hình thức chi — anh không phải sửa hai chỗ. */
function theoFoc(trangThai) {
  if (trangThai === 'Đối tác đồng ý') return { hinhThuc: 'FOC đối tác', donGiaChi: 0 };
  if (trangThai === 'Đối tác từ chối') return { hinhThuc: 'Công ty chi' };
  return {};
}

/** Cảnh báo số khách lạ tay (đã gặp: gõ 40 trẻ em). Trả chuỗi rỗng khi ổn. */
function canhBaoKhach(ht) {
  const nl = so(ht.nguoiLon), te = so(ht.treEm), eb = so(ht.emBe);
  if (nl + te + eb === 0) return 'Chưa có khách nào';
  if (nl === 0) return 'Chưa có người lớn nào';
  if (nl + te + eb > 15) return 'Tổng ' + (nl + te + eb) + ' khách — nhiều bất thường cho một chuyến KOL, kiểm lại';
  if (te > nl * 4) return te + ' trẻ em cho ' + nl + ' người lớn — kiểm lại có gõ nhầm không';
  return '';
}

/* ---------------- lịch trình ---------------- */
/**
 * Trạng thái từng mốc so với bây giờ. Mốc "đang" = mốc có giờ hẹn gần nhất đã
 * qua, CÙNG NGÀY, và mốc kế tiếp chưa tới — KOL đang ở đó.
 */
function trangThaiLich(hangMuc, now) {
  const co = hangMuc.filter((h) => h.gioHen && h.tinhTrang !== 'Huỷ').sort((a, b) => a.gioHen - b.gioHen);
  const out = new Map();
  let dang = null;
  for (const h of co) if (h.gioHen <= now && ngayCua(h.gioHen) === ngayCua(now)) dang = h;
  for (const h of co) {
    let tt = h.gioHen > now ? 'sap' : 'qua';
    if (h === dang && h.tinhTrang !== 'Đã xong') tt = 'dang';
    if (h.tinhTrang === 'Đã xong') tt = 'xong';
    if (h.tinhTrang === 'Có sự cố') tt = 'su-co';
    out.set(h.id, tt);
  }
  return out;
}

/** Mốc cần nhắc bây giờ: bật Nhắc hẹn, chưa nhắc, giờ hẹn trong (now, now + trước]. */
function canNhac(h, now, truocPhut) {
  if (!h.nhacHen || h.daNhac || !h.gioHen || h.tinhTrang === 'Huỷ' || h.tinhTrang === 'Đã xong') return false;
  return h.gioHen > now && h.gioHen - now <= truocPhut * 60000;
}
/* Chuyến chưa xác nhận hoặc đã xong thì không nhắc gì cả. */
const BUOC_NHAC = ['KOL đã xác nhận', 'Đã tạo tour Tourwell', 'Đang đi tour'];

const hhmm = (ms) => { const t = vn(ms); return p2(t.gio) + ':' + p2(t.phut); };
const ddmm = (ms) => { const t = vn(ms); return p2(t.ngay) + '/' + p2(t.thang); };

/** Tin soạn sẵn để anh copy gửi KOL qua Zalo/Messenger. */
function tinNhacKol(h, ht, kol) {
  if (h.tinNhan) return h.tinNhan;
  /* Xưng hô + Tên gọi của bảng KOL ("chị Min Ji"); thiếu thì mới đoán bằng chữ cuối của tên. */
  const goi = kol && (kol.tenGoi || String(kol.ten || '').replace(/^\[[^\]]*\]\s*/, '').split(' ').slice(-1)[0]);
  const xung = goi ? String((kol && kol.xungHo) || 'chị').toLowerCase() + ' ' + goi : 'anh/chị';
  const ten = String(h.ten || '').replace(/\s+[—-]\s+(Người lớn|Trẻ em|Em bé)$/i, '');
  const noi = h.diemHen ? ' tại ' + h.diemHen : '';
  return 'Dạ Rooty Trip nhắc ' + xung + ': ' + hhmm(h.gioHen) + ' hôm nay (' + ddmm(h.gioHen) + ') '
    + 'là ' + ten + noi + '. Gia đình mình chuẩn bị trước giúp em ạ. '
    + 'Có gì cần hỗ trợ ' + xung + ' nhắn em ngay nhé!';
}

/* ---------------- bàn giao ---------------- */
function trangThaiBanGiao(b, now) {
  if (b.trangThai === 'Huỷ') return { ma: 'huy', nhan: 'Huỷ' };
  if (b.trangThai === 'Đã đăng') {
    if (b.ngayDang && !b.nhap7 && now >= dauNgay(b.ngayDang) + 7 * NGAY) return { ma: 'do-7', nhan: 'Đến hạn nhập số 7 ngày' };
    if (b.ngayDang && !b.nhap30 && now >= dauNgay(b.ngayDang) + 30 * NGAY) return { ma: 'do-30', nhan: 'Đến hạn nhập số 30 ngày' };
    return { ma: 'dang', nhan: 'Đã đăng' };
  }
  if (b.hanDang && dauNgay(now) > dauNgay(b.hanDang)) return { ma: 'tre', nhan: 'Quá hạn đăng' };
  return { ma: 'cho', nhan: b.trangThai || 'Chưa làm' };
}
/** Số mới nhất của một bài: 30N nếu đã có, không thì 7N. */
const xemMoiNhat = (b) => (b.xem30 != null ? b.xem30 : b.xem7 != null ? b.xem7 : 0);

function ketQua(ht, hangMuc, banGiao) {
  const t = tongHopTac(hangMuc);
  const song = banGiao.filter((b) => b.trangThai !== 'Huỷ');
  const daDang = song.filter((b) => b.trangThai === 'Đã đăng');
  const xem = daDang.reduce((s, b) => s + xemMoiNhat(b), 0);
  const tuongTac = daDang.reduce((s, b) => s + ['thich', 'binhLuan', 'chiaSe', 'luu']
    .reduce((x, k) => x + so(b[k + '30'] != null ? b[k + '30'] : b[k + '7']), 0), 0);
  return {
    ...t,
    camKet: song.reduce((s, b) => s + (so(b.soLuong) || 1), 0),
    daDang: daDang.reduce((s, b) => s + (so(b.soLuong) || 1), 0),
    xem, tuongTac,
    /* Chi phí trên 1.000 lượt xem — theo TIỀN THẬT và theo giá trị quy đổi. */
    cpm: xem ? Math.round(t.tienCongTy / xem * 1000) : null,
    cpmQuyDoi: xem ? Math.round(t.giaTriQuyDoi / xem * 1000) : null,
  };
}

/* ---------------- linh tinh ---------------- */
function maMoi(dsMa, nam) {
  const dau = 'KOL-' + nam + '-';
  const max = dsMa.filter((m) => String(m).startsWith(dau))
    .map((m) => Number(String(m).slice(dau.length)) || 0).reduce((a, b) => Math.max(a, b), 0);
  return dau + String(max + 1).padStart(3, '0');
}

/** Số điện thoại về dạng quốc tế: '0778 866 707' + '+84' → '+84778866707'. */
/** Số điện thoại về dạng quốc tế — bộ chuẩn hoá dùng chung với ô nhập (public/ma-vung.js). */
function sdtQuocTe(sdt, maVung) {
  return require('./public/ma-vung').chuan(sdt, maVung).quocTe;
}

const tien = (n) => (n == null ? '' : Math.round(n).toLocaleString('vi-VN'));

module.exports = {
  NGAY, vn, ngayCua, choBase, tuChuoi, dauNgay, soDem, hhmm, ddmm,
  thanhTien, giaTriQuyDoi, thieuGiaCongBo, tongHopTac, slGoiY, giaGoiY,
  BUOC, viTri, duocLam, buocTheoLich, lui, dongLichSu, noiLichSu, theoFoc, canhBaoKhach,
  trangThaiLich, canNhac, BUOC_NHAC, tinNhacKol,
  trangThaiBanGiao, xemMoiNhat, ketQua,
  maMoi, sdtQuocTe, tien,
};
