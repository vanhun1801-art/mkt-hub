'use strict';
/**
 * MỤC TIÊU CHO TAB BÁO CÁO.
 *
 * Trước module này, tab Báo cáo trả lời được "làm được bao nhiêu" nhưng không
 * trả lời được "có đạt không" — trong khi nửa KPI của chính app này đã có bộ
 * luật mục tiêu đầy đủ, chi tiết tới từng kênh × từng chỉ số. Hai nửa ở cùng
 * một thư mục mà không nói chuyện với nhau.
 *
 * Việc của module: đọc bộ luật của (các) tháng mà khoảng báo cáo chạm vào, gộp
 * mục tiêu theo kênh thành mục tiêu của cả phòng, và chia theo tỷ lệ số ngày.
 *
 * KHÔNG định nghĩa lại mục tiêu ở đây. Mọi con số đều lấy từ đúng bộ luật đang
 * dùng để chấm lương — nếu báo cáo nói "đạt 82%" mà phiếu KPI nói khác thì một
 * trong hai đang bịa, và người bị thiệt là nhân sự.
 */

const { tach, chuan, NEN_TANG, CHI_SO_BAI, CHI_SO_LIVE } = require('./nguon');

/** Các tháng (YYYY-MM) mà khoảng tu→den chạm vào, kể cả chạm một ngày. */
function thangTrongKhoang(tu, den) {
  const ds = [];
  const a = new Date(tu + 'T00:00:00Z');
  const b = new Date(den + 'T00:00:00Z');
  const x = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
  while (x <= b) {
    ds.push(x.toISOString().slice(0, 7));
    x.setUTCMonth(x.getUTCMonth() + 1);
  }
  return ds;
}

/** Số ngày của khoảng tu→den nằm trong tháng `thang`. */
function soNgayGiao(tu, den, thang) {
  const a = new Date(tu + 'T00:00:00Z').getTime();
  const b = new Date(den + 'T00:00:00Z').getTime();
  const [y, m] = thang.split('-').map(Number);
  const dau = Date.UTC(y, m - 1, 1);
  const cuoi = Date.UTC(y, m, 0);
  const t = Math.max(a, dau);
  const d = Math.min(b, cuoi);
  return d < t ? 0 : Math.round((d - t) / 86400000) + 1;
}

const soNgayThang = (thang) => {
  const [y, m] = thang.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * Gộp mục tiêu của một khoảng thời gian.
 *
 * `docLuat(thang)` trả bộ luật của tháng đó, hoặc null nếu chưa có. Truyền vào
 * thay vì gọi store thẳng, để phép thử chạy được mà không cần Base.
 *
 * Trả về:
 *   coLuat   — những tháng đọc được luật
 *   thieuLuat— những tháng KHÔNG có luật (phải nói ra, xem ghi chú bên dưới)
 *   phong    — { view, follow, lead, liveView, ... } mục tiêu cả phòng
 *   kenh     — Map khoá "Nền tảng|Tên kênh" → { view, follow, ... }
 *   tyLe     — phần của tháng mà khoảng này chiếm (để giao diện nói rõ đã chia)
 */
function gomMucTieu(tu, den, docLuat) {
  const thang = thangTrongKhoang(tu, den);
  const phong = {};
  const kenh = new Map();
  const coLuat = [];
  const thieuLuat = [];
  let tongNgay = 0;
  let ngayCoLuat = 0;

  thang.forEach((th) => {
    const ngay = soNgayGiao(tu, den, th);
    tongNgay += ngay;
    const luat = docLuat(th);
    if (!luat) { if (ngay) thieuLuat.push(th); return; }
    coLuat.push(th);
    ngayCoLuat += ngay;

    /* CHIA THEO NGÀY. Mục tiêu trong bộ luật là mục tiêu CẢ THÁNG. Xem báo cáo
     * tuần mà đem so với mục tiêu tháng thì tuần nào cũng "đạt 23%" — đúng số
     * nhưng vô nghĩa. Chia theo số ngày khoảng này chiếm trong tháng.
     *
     * Cách chia này giả định công việc rải đều trong tháng. Không đúng tuyệt
     * đối (cuối tháng thường dồn việc), nhưng đó là giả định duy nhất công bằng
     * khi không có kế hoạch theo tuần — và nói rõ ra ở giao diện. */
    const phan = ngay / soNgayThang(th);

    (luat.nhom || []).forEach((nh) => {
      (nh.tieuChi || []).forEach((t) => {
        const mt = Number(t.mucTieu);
        if (!Number.isFinite(mt) || mt <= 0) return;
        const p = tach(t.nguon);
        if (!p) return;
        const nenTang = NEN_TANG[chuan(p.kenh)];
        if (!nenTang) return;
        /* Chỉ nhận chỉ số nào ánh xạ được sang trường app Social trả về. Tiêu
         * chí kiểu "Số lượng thiết kế đạt" không có nguồn tự động nên bỏ qua ở
         * đây — nó vẫn được chấm ở nửa KPI, chỉ là báo cáo không đối chiếu được. */
        const laLive = CHI_SO_LIVE[p.chiSo] != null;
        if (!laLive && CHI_SO_BAI[p.chiSo] == null) return;

        const gia = mt * phan;
        phong[p.chiSo] = (phong[p.chiSo] || 0) + gia;
        const khoa = nenTang + '|' + p.tenKenh;
        const o = kenh.get(khoa) || { nenTang, ten: p.tenKenh };
        o[p.chiSo] = (o[p.chiSo] || 0) + gia;
        kenh.set(khoa, o);
      });
    });
  });

  return {
    coLuat,
    thieuLuat,
    phong,
    kenh,
    /* Phần khoảng báo cáo chiếm trong (các) tháng có luật. Bằng 1 nghĩa là đúng
     * trọn tháng — giao diện chỉ cần cảnh báo "mục tiêu đã chia" khi khác 1. */
    tyLe: tongNgay ? ngayCoLuat / tongNgay : 0,
    tronThang: thang.length === 1 && soNgayGiao(tu, den, thang[0]) === soNgayThang(thang[0]),
  };
}

/**
 * Gắn mục tiêu vào một ô số của báo cáo.
 * `dao` = chỉ số thấp là tốt (chi phí, CPA) — đạt nghĩa là NẰM DƯỚI mục tiêu.
 */
function gan(o, mt, dao) {
  if (!Number.isFinite(mt) || mt <= 0) return o;
  const dat = dao ? (o.so <= mt) : (o.so >= mt);
  return {
    ...o,
    mucTieu: mt,
    datPt: mt ? (o.so / mt) * 100 : null,
    datMucTieu: dat,
  };
}

module.exports = { gomMucTieu, gan, thangTrongKhoang, soNgayGiao, soNgayThang };
