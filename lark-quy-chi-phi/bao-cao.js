'use strict';
/**
 * ============================================================================
 * BÁO CÁO QUỸ THEO KỲ — số để gửi Ban Giám Đốc
 * ============================================================================
 *
 * Anh Hùng vẫn làm bằng tay: gần hết quỹ thì mở sheet, lọc theo tháng, gõ lại
 * bảng cơ cấu chi, dựng file PDF + Excel rồi soạn email đề xuất nhập quỹ mới.
 * Mọi con số trong đó đã nằm sẵn trong Base này — chép lại bằng tay là chép
 * lại một cơ hội sai.
 *
 * KỲ = MỘT ĐỢT TẠM ỨNG, không phải một tháng.
 *
 * Nghe giống nhau vì đợt đang được đặt tên "THÁNG 08", "THÁNG 09". Nhưng cái
 * quyết định là đợt: số dư đầu kỳ là dòng nạp "Chuyển từ kỳ trước" CỦA ĐỢT ĐÓ,
 * và khoản chi thuộc kỳ nào là do ô "Đợt tạm ứng" của nó nói, không phải do
 * ngày chi rơi vào tháng nào. Lấy theo tháng thì một khoản chi ngày 31/08 mà
 * thuộc đợt tháng 9 sẽ nhảy sai kỳ — và bảng cân đối lệch mà không ai thấy.
 *
 * Số tổng KHÔNG cộng lại ở đây: Base đã có công thức Tổng nạp / Tổng đã chi /
 * Còn lại cho từng đợt. Hai nơi cùng tính một con số thì sớm muộn lệch nhau,
 * và lúc lệch thì không biết tin bên nào. Ở đây chỉ cộng những thứ Base KHÔNG
 * tính: cơ cấu theo nhóm, theo tuần, theo người.
 */

const chu = (v) => String(v == null ? '' : v).trim();
const so = (v) => Number(v) || 0;

/* ---------------------------------------------------------------------------
 * NGÀY
 * ------------------------------------------------------------------------- */
function ngayISO(v) {
  const d = new Date(v);
  if (!v || isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function ngayVN(v) {
  const i = ngayISO(v);
  return i ? i.slice(8, 10) + '/' + i.slice(5, 7) + '/' + i.slice(0, 4) : '';
}

/** Ngày của một khoản chi: ưu tiên ngày CHI, thiếu thì lùi về ngày đề nghị. */
const ngayCua = (c) => ngayISO(c.ngayChi) || ngayISO(c.ngayDeNghi);

/**
 * Tuần theo NGÀY TRONG THÁNG, không phải tuần ISO.
 *
 * Bảng anh Hùng gửi Sếp chia 01–07 · 08–14 · 15–21 · 22–cuối tháng. Tuần ISO
 * thì vắt qua hai tháng, nên một kỳ lại đẻ ra năm sáu tuần trong đó có hai
 * tuần cụt — đọc không ra nhịp chi của tháng.
 */
function tuanCua(iso) {
  if (!iso) return '(không ngày)';
  const ngay = Number(iso.slice(8, 10));
  const thang = iso.slice(5, 7);
  const cuoi = new Date(Number(iso.slice(0, 4)), Number(thang), 0).getDate();
  if (ngay <= 7) return '01–07/' + thang;
  if (ngay <= 14) return '08–14/' + thang;
  if (ngay <= 21) return '15–21/' + thang;
  return '22–' + cuoi + '/' + thang;
}

/* ---------------------------------------------------------------------------
 * NHÓM CHI PHÍ
 * -------------------------------------------------------------------------
 * Ô "Loại" trong Base dùng cho người NHẬP (bảy lựa chọn ngắn); bảng gửi Sếp
 * gom lại thành bốn năm nhóm đọc được. Bản đồ để ở config.js vì đây là quy ước
 * trình bày, không phải logic — đổi cách gom thì sửa một chỗ.
 *
 * Loại nào không có trong bản đồ thì giữ NGUYÊN TÊN, không dồn vào "Khác":
 * dồn đi là giấu mất một nhóm chi đang lớn dần mà không ai để ý.
 */
function nhomCua(c, banDo) {
  const l = chu(c.loai);
  if (!l) return 'Chưa phân loại';
  return (banDo && banDo[l]) || l;
}

/* ---------------------------------------------------------------------------
 * GOM
 * ------------------------------------------------------------------------- */
function gom(ds, lay) {
  const m = new Map();
  for (const c of ds) {
    const k = lay(c) || '(trống)';
    const o = m.get(k) || { ten: k, so: 0, tien: 0 };
    o.so++; o.tien += so(c.tien);
    m.set(k, o);
  }
  const tong = ds.reduce((a, c) => a + so(c.tien), 0);
  return [...m.values()]
    .sort((a, b) => b.tien - a.tien)
    .map((o) => ({ ...o, tyTrong: tong ? o.tien / tong : 0 }));
}

/** Giữ nguyên thứ tự tuần trong tháng thay vì xếp theo tiền. */
const theoTuan = (ds) => gom(ds, (c) => tuanCua(ngayCua(c)))
  .sort((a, b) => String(a.ten).localeCompare(String(b.ten)));

const tenNguoi = (c) => {
  const u = (c.nguoi || [])[0];
  return (u && (u.name || u.id)) || '(chưa ghi)';
};

/* ---------------------------------------------------------------------------
 * DỰNG BÁO CÁO
 * ------------------------------------------------------------------------- */
/**
 * @param {object} kho  { chi, nap, dot } — đúng hình dạng /api/meta trả về
 * @param {string} dotId record_id của đợt tạm ứng
 * @param {object} [tuyChon] { banDoNhom, ngayLap }
 */
function dungBaoCao(kho, dotId, tuyChon) {
  const o = tuyChon || {};
  const dot = (kho.dot || []).find((d) => d.id === dotId);
  if (!dot) throw new Error('Không có đợt tạm ứng nào mang mã đó');

  const thuoc = (r) => (r.dot || []).includes(dotId);
  const chi = (kho.chi || []).filter(thuoc)
    .sort((a, b) => String(ngayCua(a)).localeCompare(String(ngayCua(b))));
  const nap = (kho.nap || []).filter(thuoc);

  /* Số dư đầu kỳ là dòng nạp "Chuyển từ kỳ trước"; mọi dòng nạp khác là tiền
   * công ty rót thêm TRONG kỳ. Hai thứ này phải tách, vì đề xuất gửi Sếp nói
   * "xin nhập thêm bao nhiêu" chứ không nói "quỹ có bao nhiêu". */
  const laChuyenTiep = (n) => /chuyển từ kỳ trước/i.test(chu(n.loai) + ' ' + chu(n.noiDung));
  const dauKy = nap.filter(laChuyenTiep).reduce((a, n) => a + so(n.tien), 0);
  const napThem = nap.filter((n) => !laChuyenTiep(n)).reduce((a, n) => a + so(n.tien), 0);

  /* Tổng thì TIN Ô CÔNG THỨC của Base, không cộng lại. Chỉ khi ô trống (đợt
   * mới chưa có công thức chạy) mới đành cộng tay. */
  const tongChi = dot.tongChi || chi.reduce((a, c) => a + so(c.tien), 0);
  const tongNguon = dot.tongNap || (dauKy + napThem);
  const cuoiKy = (dot.conLai === 0 || dot.conLai) ? dot.conLai : (tongNguon - tongChi);

  const ngay = chi.map(ngayCua).filter(Boolean).sort();
  /* Kỳ trải trọn THÁNG mà các khoản chi rơi vào: bảng gửi Sếp ghi "01/08 –
   * 31/08", không ghi "01/08 – 26/08" chỉ vì khoản cuối nằm ngày 26. */
  const dau = ngay[0] || '';
  const cuoi = ngay[ngay.length - 1] || '';
  const tu = dau ? dau.slice(0, 8) + '01' : '';
  const den = cuoi
    ? cuoi.slice(0, 8) + String(new Date(Number(cuoi.slice(0, 4)), Number(cuoi.slice(5, 7)), 0).getDate())
    : '';

  const banDo = o.banDoNhom || {};
  const nhomHoa = chi.map((c) => ({ ...c, __nhom: nhomCua(c, banDo) }));

  let luyKe = tongNguon;
  const chiTiet = chi.map((c, i) => {
    luyKe -= so(c.tien);
    return {
      stt: i + 1,
      ngayDeNghi: ngayVN(c.ngayDeNghi || c.ngayChi),
      ngayChi: ngayVN(c.ngayChi),
      nguoi: tenNguoi(c),
      maDieuHanh: chu(c.maDieuHanh),
      maDon: chu(c.maDon).split('·')[0].trim(),
      noiDung: chu(c.noiDung),
      nhom: nhomCua(c, banDo),
      tien: so(c.tien),
      tonLuyKe: luyKe,
      tuan: tuanCua(ngayCua(c)),
      coChungTu: !!((c.hoaDon || []).length || chu(c.linkCu)),
    };
  });

  return {
    ky: {
      dotId,
      tenDot: chu(dot.ma),
      tu, den,
      tuVN: ngayVN(tu + 'T00:00:00'), denVN: ngayVN(den + 'T00:00:00'),
      /* Mã quỹ = mã quyết toán kế toán đã đóng cho kỳ này. Nhiều mã thì nối —
       * đừng chọn bừa một cái, vì đó là số Sếp và kế toán dùng để đối chiếu. */
      maQuy: [...new Set(chi.map((c) => chu(c.maQuyetToan)).filter(Boolean))].join(' · '),
      nguoiGiu: ((dot.nguoiGiu || [])[0] || {}).name || '',
      tinhTrang: chu(dot.tinhTrang),
      ngayLap: o.ngayLap || ngayVN(new Date()),
    },
    so: {
      dauKy, napThem, tongNguon, tongChi, cuoiKy,
      soGD: chi.length,
      tyLeCon: tongNguon ? cuoiKy / tongNguon : 0,
      am: cuoiKy < 0,
    },
    nhom: gom(nhomHoa, (c) => c.__nhom),
    tuan: theoTuan(chi),
    nguoi: gom(chi, tenNguoi),
    chiTiet,
  };
}

/** Danh sách kỳ để bày ra ô chọn — mới nhất trước. */
function cacKy(kho) {
  const dem = new Map();
  for (const c of (kho.chi || [])) for (const id of (c.dot || [])) dem.set(id, (dem.get(id) || 0) + 1);
  return (kho.dot || []).map((d) => ({
    id: d.id, ma: chu(d.ma), tinhTrang: chu(d.tinhTrang),
    soGD: dem.get(d.id) || 0,
    tongNap: so(d.tongNap), tongChi: so(d.tongChi), conLai: so(d.conLai),
  })).reverse();
}

module.exports = { dungBaoCao, cacKy, tuanCua, nhomCua, ngayVN, ngayISO, ngayCua };
