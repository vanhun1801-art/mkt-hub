'use strict';
/**
 * Bộ đọc chỉ số cho trang "Tổng quan chung" của lớp vỏ.
 *
 * Hub KHÔNG đọc Lark Base trực tiếp — nó gọi lại API của chính từng module, nên
 * mọi quy tắc nghiệp vụ (lọc dòng trống, tính lại thời lượng, cách cộng chi tiêu)
 * chỉ có một nơi định nghĩa: trong module. Thêm base mới thì viết thêm một hàm ở
 * đây rồi khai `"kpi": "<tên>"` trong modules.json.
 */
const cfg = require('./config');
const { goiJson } = require('./proxy');
const gio = require('./gio-vn');

const DONG = new Set(['Hoàn thành', 'Hủy']);
// trạng thái coi như đã đóng của Lịch tác nghiệp
const LICH_DONG = new Set(['Đã hoàn tất', 'Từ chối', 'Hủy lịch']);
const NGAY = 86400000;

/* Giờ VN, KHÔNG phải giờ máy chủ: Render chạy UTC nên setHours(0,0,0,0) cho ra
 * 07:00 giờ VN, và mọi việc đúng hạn 00:00 bị tính quá hạn sớm một ngày. */
const dauNgay = gio.dauNgay;

/* ---------------- khoảng thời gian ----------------
 * Client gửi `tu`/`den` dạng YYYY-MM-DD (nó biết múi giờ và "tháng này" của máy
 * người dùng). Không có = xem toàn bộ.
 */
function moc(k) {
  if (!k || !k.tu || !k.den) return null;
  // '2026-09-01T00:00:00' không có múi giờ => máy chủ UTC hiểu là 00:00 UTC. Ghim +07.
  const tu = gio.tuNgayKhoa(k.tu);
  const den = gio.tuNgayKhoa(k.den) + NGAY - 1;                    // hết ngày cuối
  if (!Number.isFinite(tu) || !Number.isFinite(den) || tu > den) return null;
  return { tu, den };
}
const trongMoc = (t, m) => !m || (t >= m.tu && t <= m.den);
const soNgay = (hieu) => Math.floor(hieu / NGAY);
/** Base trả datetime có khi là epoch ms, có khi là chuỗi ISO — chuẩn hoá về số. */
const ms = (v) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Date.parse(v) || 0);
const ten = (us) => (us || []).map((u) => u.name || u.id).filter(Boolean).join(', ');

/**
 * Giá trị select trong Base hay có emoji dẫn đầu ("🔴 Cao", "🟡 Trung bình") — bỏ đi
 * khi hiển thị. Cắt theo code point thay vì regex: môi trường shell ở đây hay ăn mất
 * một lớp backslash nên regex escape rất dễ hỏng âm thầm.
 */
function nhan(v) {
  const t = String(v == null ? '' : v);
  const kyHieu = (cp) => cp === 32 || cp === 0xFE0F || cp === 0x200D ||
    (cp >= 0x2000 && cp <= 0x3300) || (cp >= 0x1F000 && cp <= 0x1FAFF);
  let i = 0;
  while (i < t.length) {
    const cp = t.codePointAt(i);
    if (!kyHieu(cp)) break;
    i += cp > 0xFFFF ? 2 : 1;
  }
  return t.slice(i).trim();
}
/* ---------------- Bảng công việc (Tracking) ---------------- */
async function congViec(mod, khoang, nguoi) {
  const [meta, ds] = await Promise.all([
    goiJson(mod, '/api/meta', { nguoi }).catch(() => null),
    goiJson(mod, '/api/tasks', { nguoi }),
  ]);
  const m = moc(khoang);
  const now = Date.now();
  const homNay = dauNgay(now);

  const han = (t) => ms(t.deadline);
  // Lọc y như bộ lọc "Tháng này" trong app: theo DEADLINE, việc không có deadline
  // thì không khớp mốc thời gian nào (giữ số trên hub và trong app khớp nhau).
  const tasks = (ds.tasks || []).filter((t) => (m ? han(t) && trongMoc(han(t), m) : true));
  const mo = tasks.filter((t) => !DONG.has(t.status));
  // "Quá hạn" tính theo NGÀY như trong app (hết hạn hôm nay chưa coi là trễ),
  // nếu so từng giây thì số trên hub lệch với số trong app.
  /* Việc trễ mà nhân sự đã bấm "Giải quyết" (nộp sản phẩm) thì rời khỏi hàng đợi
   * quá hạn — nhưng trạng thái vẫn giữ, nên cuối tháng vẫn đếm được ai trễ. */
  /* Trễ = quá hạn theo ngày HOẬC Base đã đặt trạng thái "Trễ deadline"
   * (automation trong Base đặt sau deadline 2 tiếng, sớm hơn phép tính theo ngày). */
  const treTatCa = mo.filter((t) => t.status === 'Trễ deadline' || (han(t) && han(t) < homNay));
  const quaHan = treTatCa.filter((t) => !t.daGiaiQuyet).sort((a, b) => han(a) - han(b));
  const treDaGQ = treTatCa.filter((t) => t.daGiaiQuyet);
  const chuaPhanCong = mo.filter((t) => !(t.owner || []).length);
  const thieuDeadline = mo.filter((t) => !han(t));
  const choTiepNhan = mo.filter((t) => t.status === 'Chờ tiếp nhận');
  const denHan = mo.filter((t) => han(t) >= now && han(t) < homNay + 2 * NGAY);

  const dangLam = mo.filter((t) => t.status === 'Đang tiến hành');

  /* Nhóm bản ghi đứng sau từng thẻ số. Cửa sổ xử lý nhanh đọc lại đúng các nhóm
   * này (qua /api/o) nên con số trên thẻ và danh sách mở ra luôn khớp — không
   * lọc lại một lần nữa ở client. */
  const dong = (t) => ({
    id: t.id,
    tieuDe: t.title || '(không tên)',
    trangThai: nhan(t.status),
    nguoi: ten(t.owner),
    nguoiId: (t.owner || []).map((u) => u.id),
    han: han(t) || 0,
    the: [t.priority, t.workType, t.campaign].map(nhan).filter(Boolean),
    coMinhChung: !!((t.attachment || []).length || (t.fileKetQua || []).length ||
      t.linkKetQua || t.link),
    daGiaiQuyet: !!t.daGiaiQuyet,
    ngayGiaiQuyet: ms(t.ngayGiaiQuyet) || 0,
  });
  const nhom = {
    'mo': mo.map(dong),
    'qua-han': quaHan.map(dong),
    'chua-phan-cong': chuaPhanCong.map(dong),
    'dang-tien-hanh': dangLam.map(dong),
    'sap-han': denHan.map(dong),
    'cho-tiep-nhan': choTiepNhan.map(dong),
    'thieu-deadline': thieuDeadline.map(dong),
    'tre-da-giai-quyet': treDaGQ.map(dong),
  };

  // Quản lý mới cần thẻ "Chưa phân công" — nhân sự không phân công cho ai cả
  const laQL = !nguoi || nguoi.quanLy;
  const the = [
    { nhan: 'Việc đang mở', so: mo.length, dinhDang: 'so', khoa: 'mo' },
    { nhan: 'Quá hạn', so: quaHan.length, dinhDang: 'so', muc: quaHan.length ? 'cao' : 'ok', khoa: 'qua-han',
      ghi: treDaGQ.length ? treDaGQ.length + ' việc trễ đã giải quyết' : '',
      ghiKhoa: treDaGQ.length ? 'tre-da-giai-quyet' : '' },
    ...(laQL ? [{ nhan: 'Chưa phân công', so: chuaPhanCong.length, dinhDang: 'so', muc: chuaPhanCong.length ? 'cao' : 'ok', khoa: 'chua-phan-cong' }] : []),
    { nhan: 'Đang tiến hành', so: dangLam.length, dinhDang: 'so', khoa: 'dang-tien-hanh' },
    { nhan: 'Sắp tới hạn (48h)', so: denHan.length, dinhDang: 'so', muc: denHan.length ? 'vua' : 'ok', khoa: 'sap-han' },
    // hàng đợi đầu vào: việc đã vào bảng nhưng người nhận chưa xác nhận bắt tay làm
    { nhan: 'Chờ tiếp nhận', so: choTiepNhan.length, dinhDang: 'so',
      muc: choTiepNhan.length ? 'vua' : 'ok', khoa: 'cho-tiep-nhan',
      ghi: thieuDeadline.length ? thieuDeadline.length + ' việc chưa có deadline' : '',
      ghiKhoa: thieuDeadline.length ? 'thieu-deadline' : '' },
  ];
  /* Nhóm nào đứng sau từng mục "cần xử lý" — để trang chủ chỉ đúng thẻ cần bấm
   * khi muốn xem hết phần bị cắt, thay vì bảo người ta đi tìm. */
  const canXuLyKhoa = { 'qua-han': quaHan.length, 'chua-phan-cong': chuaPhanCong.length };

  const canXuLy = [];
  /* Tổng THẬT trước khi cắt. Không có nó thì trang chủ đếm chính danh sách đã cắt
   * và báo thiếu — quản lý đọc "35 việc" rồi tưởng đó là toàn bộ tồn đọng. */
  const canXuLyTong = quaHan.length + chuaPhanCong.length;
  quaHan.slice(0, 6).forEach((t) => canXuLy.push({
    id: t.id,
    muc: 'cao',
    tieuDe: t.title || '(không tên)',
    phu: 'Quá hạn ' + soNgay(now - han(t)) + ' ngày · ' + (ten(t.owner) || 'chưa phân công'),
    the: [t.priority, t.workType].map(nhan).filter(Boolean),
  }));
  chuaPhanCong.slice(0, 4).forEach((t) => canXuLy.push({
    id: t.id,
    muc: 'vua',
    tieuDe: t.title || '(không tên)',
    phu: 'Chưa có phụ trách chính' + (han(t) ? ' · hạn ' + gio.ngayDai(han(t)) : ''),
    the: [t.campaign].map(nhan).filter(Boolean),
  }));

  // Việc quá hạn nằm NGOÀI khoảng lọc — để bộ lọc tháng không âm thầm che tồn đọng
  const ngoai = m
    ? (ds.tasks || []).filter((t) => !DONG.has(t.status) && !t.daGiaiQuyet && han(t) &&
        (t.status === 'Trễ deadline' || han(t) < homNay) && !trongMoc(han(t), m)).length
    : 0;

  return {
    the,
    nhom,
    canXuLy,
    canXuLyTong,
    canXuLyKhoa,
    tong: tasks.length,
    ngoaiKhoang: ngoai,
    ngoaiKhoangNhan: ngoai ? ngoai + ' việc quá hạn từ trước khoảng lọc' : '',
    vai: meta && meta.role ? meta.role : '',
    nguoi: meta && meta.me ? meta.me.name : '',
  };
}

/* ---------------- Lịch tác nghiệp ---------------- */
async function lichTacNghiep(mod, khoang, nguoi) {
  const meta = await goiJson(mod, '/api/meta', { nguoi });
  const m = moc(khoang);
  const tatCa = meta.items || [];
  const bd0 = (t) => ms(t.start);
  const items = tatCa.filter((t) => trongMoc(bd0(t), m));
  const now = Date.now();
  const d0 = dauNgay(now);
  const thang = new Date(now); thang.setDate(1); thang.setHours(0, 0, 0, 0);
  const thangSau = new Date(thang); thangSau.setMonth(thangSau.getMonth() + 1);

  const bd = (t) => ms(t.start);
  const trong = (t, a, b) => bd(t) >= a && bd(t) < b;
  const choDuyet = items.filter((t) => t.status === 'Chờ duyệt/Xử lý')
    .sort((a, b) => bd(a) - bd(b));
  const homNay = items.filter((t) => trong(t, d0, d0 + NGAY));
  const tuanToi = items.filter((t) => trong(t, d0, d0 + 7 * NGAY));
  const treBaoCao = items.filter((t) => bd(t) && bd(t) < d0 &&
    ['Duyệt/Chờ tác nghiệp', 'Đang báo cáo'].includes(t.status));

  /* ---- lịch đang có nguy cơ: quản lý phải xem, không chờ ai báo ----
   * Mỗi lịch chỉ đếm một lần, lấy lý do nặng nhất. Thứ tự dưới đây là thứ tự
   * ưu tiên: sát ngày mà chưa chốt được người/chưa duyệt thì nguy hơn là treo yêu cầu.
   */
  const SAT_NGAY = 2 * NGAY;                     // 48h tới
  const CHUA_DUYET = ['Đang lên kế hoạch', 'Chờ duyệt/Xử lý'];
  const lyDoNguyCo = (t) => {
    const khi = bd(t);
    const satNgay = khi && khi >= d0 && khi < d0 + SAT_NGAY;
    const conNgay = khi ? Math.max(0, Math.round((khi - now) / NGAY)) : 0;

    if (t.status === 'Từ chối/Cần điều chỉnh') return { muc: 'cao', ly: 'Bị trả lại, chưa điều chỉnh' };
    if (khi && khi < d0 && t.status === 'Duyệt/Chờ tác nghiệp') {
      return { muc: 'cao', ly: 'Đã qua ngày mà chưa báo cáo' };
    }
    if (satNgay && CHUA_DUYET.includes(t.status)) {
      return { muc: 'cao', ly: 'Còn ' + conNgay + ' ngày là tác nghiệp mà chưa duyệt' };
    }
    if (satNgay && !(t.staff || []).length) {
      return { muc: 'cao', ly: 'Sát ngày mà chưa có nhân sự' };
    }
    // Yêu cầu treo chỉ là nguy cơ khi lịch còn sống; lịch đã đóng thì đó là lịch sử
    const conSong = !LICH_DONG.has(t.status);
    if (conSong && t.focRequest && !t.focStatus) return { muc: 'vua', ly: 'Yêu cầu FOC chưa được phản hồi' };
    if (conSong && t.mediaRequest && !t.mediaStatus) return { muc: 'vua', ly: 'Yêu cầu phòng Media chưa phản hồi' };
    if (t.status === 'Đang báo cáo' && khi && khi < d0 - 3 * NGAY) {
      return { muc: 'vua', ly: 'Báo cáo bỏ dở quá 3 ngày' };
    }
    if (t.status === 'Đã hoàn tất' && (t.costActual || 0) > 0 && t.payment !== 'Đã thanh toán') {
      return { muc: 'vua', ly: 'Đã xong nhưng chưa thanh toán chi phí' };
    }
    return null;
  };

  const nguyCo = items
    .map((t) => ({ t, r: lyDoNguyCo(t) }))
    .filter((x) => x.r)
    .sort((a, b) => (a.r.muc === b.r.muc ? bd(a.t) - bd(b.t) : a.r.muc === 'cao' ? -1 : 1));
  const nguyCoNang = nguyCo.filter((x) => x.r.muc === 'cao');
  // Có bộ lọc thì cộng chi phí trong khoảng lọc; không lọc thì lấy tháng hiện tại
  const dsChiPhi = m ? items : items.filter((t) => trong(t, thang.getTime(), thangSau.getTime()));
  const chiPhi = dsChiPhi.reduce((s, t) => s + (t.costPlan || 0), 0);
  const chiPhiThuc = dsChiPhi.reduce((s, t) => s + (t.costActual || 0), 0);

  // nhóm bản ghi sau từng thẻ — cửa sổ xử lý nhanh đọc lại chính các nhóm này
  const dong = (t, lyDo) => ({
    id: t.id,
    tieuDe: t.title || '(không tên)',
    trangThai: nhan(t.status),
    nguoi: (t.staff || []).length ? ten(t.staff) : '',
    phuTrach: ten(t.owner),
    nguoiId: (t.staff || []).map((u) => u.id),
    ngay: bd(t) || 0,
    lyDo: lyDo || '',
    chiPhi: t.costPlan || 0,
    chiPhiThuc: t.costActual || 0,
    thanhToan: t.payment || '',
    the: (t.transport || []).slice(0, 2).map(nhan).filter(Boolean),
    coBaoCao: !!(String(t.report || '').trim() || String(t.link || '').trim()),
  });
  const nhom = {
    'cho-duyet': choDuyet.map((t) => dong(t)),
    'hom-nay': homNay.map((t) => dong(t)),
    '7-ngay': tuanToi.map((t) => dong(t)),
    'nguy-co': nguyCo.map(({ t, r }) => dong(t, r.ly)),
    'chua-chot': treBaoCao.map((t) => dong(t)),
    'chi-phi': dsChiPhi.filter((t) => (t.costPlan || 0) || (t.costActual || 0))
      .sort((a, b) => (b.costPlan || 0) - (a.costPlan || 0)).map((t) => dong(t)),
  };

  const the = [
    { nhan: 'Chờ duyệt', so: choDuyet.length, dinhDang: 'so', muc: choDuyet.length ? 'cao' : 'ok', khoa: 'cho-duyet' },
    { nhan: 'Lịch hôm nay', so: homNay.length, dinhDang: 'so', khoa: 'hom-nay' },
    { nhan: '7 ngày tới', so: tuanToi.length, dinhDang: 'so', khoa: '7-ngay' },
    // thay cho "Đang báo cáo" (số đó chỉ mô tả, không đòi ai làm gì)
    { nhan: 'Lịch có nguy cơ', so: nguyCo.length, dinhDang: 'so', khoa: 'nguy-co',
      muc: nguyCoNang.length ? 'cao' : nguyCo.length ? 'vua' : 'ok',
      ghi: nguyCo.length ? nguyCo[0].r.ly.toLowerCase() + (nguyCo.length > 1 ? ' · +' + (nguyCo.length - 1) + ' việc khác' : '') : '' },
    { nhan: 'Chưa chốt báo cáo', so: treBaoCao.length, dinhDang: 'so', muc: treBaoCao.length ? 'vua' : 'ok', khoa: 'chua-chot' },
    // thẻ tiền chỉ hiện với người được xem chi phí (quản lý, hoặc nhân sự được cấp)
    ...((!nguoi || nguoi.quanLy || nguoi.chiPhi)
      ? [{ nhan: m ? 'Chi phí dự kiến' : 'Chi phí dự kiến tháng', so: chiPhi, dinhDang: 'vnd', khoa: 'chi-phi',
          ghi: chiPhiThuc ? 'thực tế ' + Math.round(chiPhiThuc).toLocaleString('vi-VN') + 'đ' : '' }]
      : []),
  ];

  /* KHÔNG dùng toLocaleString('vi-VN'): 'vi-VN' chỉ đặt cách viết, múi giờ vẫn
   * là của máy chủ. Render chạy UTC nên cả trang Tổng quan hiện sớm 7 tiếng, và
   * mốc 00:00 lùi hẳn sang ngày hôm trước. */
  const gioNgay = (t) => (bd(t)
    ? gio.gio(bd(t)) + ' ' + gio.ngayNgan(bd(t)).replace('/', '-')
    : 'chưa có ngày');
  // nói rõ đang là nhân sự hay chỉ có phụ trách đứng tên — nếu không, câu
  // "chưa có nhân sự" lại đi kèm một cái tên thì đọc rất khó hiểu
  const aiDo = (t) => ((t.staff || []).length ? ten(t.staff)
    : (t.owner || []).length ? 'phụ trách ' + ten(t.owner) : 'chưa có nhân sự');
  const canXuLy = [];
  // tổng THẬT trước khi cắt (xem chú thích cùng tên bên bộ đọc Bảng công việc)
  const canXuLyTong = choDuyet.length + nguyCo.length + homNay.length;
  choDuyet.slice(0, 6).forEach((t) => canXuLy.push({
    id: t.id,
    muc: 'cao',
    tieuDe: t.title || '(không tên)',
    phu: 'Chờ duyệt · ' + gioNgay(t) + ' · ' + aiDo(t),
    the: (t.transport || []).slice(0, 2).map(nhan).filter(Boolean),
  }));
  // lịch có nguy cơ: đưa thẳng lên danh sách cần xử lý kèm lý do
  nguyCo.slice(0, 6).forEach(({ t, r }) => {
    if (canXuLy.some((x) => x.id === t.id)) return;
    canXuLy.push({
      id: t.id,
      muc: r.muc,
      tieuDe: t.title || '(không tên)',
      phu: r.ly + ' · ' + gioNgay(t) + ' · ' + aiDo(t),
      the: [nhan(t.status)].filter(Boolean),
    });
  });
  homNay.slice(0, 4).forEach((t) => {
    if (canXuLy.some((x) => x.id === t.id)) return;
    canXuLy.push({
      id: t.id,
      muc: 'thap',
      tieuDe: t.title || '(không tên)',
      phu: 'Hôm nay · ' + gioNgay(t) + ' · ' + nhan(t.status),
      the: [],
    });
  });

  // Lịch chờ duyệt nằm ngoài khoảng lọc — không để bộ lọc che hàng đợi duyệt
  // Cả lịch chờ duyệt LẪN lịch có nguy cơ nằm ngoài khoảng lọc đều phải đếm,
  // nếu không bộ lọc tháng sẽ âm thầm che mất việc đang cháy của tháng trước.
  const ngoaiDs = m
    ? tatCa.filter((t) => !trongMoc(bd0(t), m) &&
        (t.status === 'Chờ duyệt/Xử lý' || lyDoNguyCo(t)))
    : [];
  const ngoai = ngoaiDs.length;

  return {
    the, nhom, canXuLy, canXuLyTong,
    tong: items.length,
    ngoaiKhoang: ngoai,
    ngoaiKhoangNhan: ngoai ? ngoai + ' lịch chờ duyệt / có nguy cơ ngoài khoảng lọc' : '',
    dongTrong: meta.blankRows || 0,
    nguoi: meta.me ? meta.me.name : '',
  };
}

/** Tiền gọn cho dòng phụ: 8.916.706.200 -> "8,9 tỷ". Dòng phụ chỉ vài chục pixel
 *  nên in đủ chữ số là tràn, mà tràn thì không đọc được gì. */
function dinhDangTien(n) {
  const x = Number(n) || 0;
  if (x >= 1e9) return (Math.round(x / 1e8) / 10).toString().replace('.', ',') + ' tỷ';
  if (x >= 1e6) return Math.round(x / 1e6) + ' tr';
  return x.toLocaleString('vi-VN') + 'đ';
}

/* ---------------- Quản lý quảng cáo ---------------- */
async function quangCao(mod, khoang, nguoi) {
  // App quảng cáo đã nhận from/to nên đưa thẳng khoảng lọc xuống nó tính,
  // không tự cộng lại ở hub (một định nghĩa chỉ số duy nhất nằm ở metrics.js).
  const q = khoang && khoang.tu && khoang.den
    ? '?from=' + encodeURIComponent(khoang.tu) + '&to=' + encodeURIComponent(khoang.den)
    : '?days=3650';
  const ov = await goiJson(mod, '/api/overview' + q);
  const k = ov.kpi || {};
  const d = ov.delta || {};
  const alerts = ov.alerts || [];
  const nang = alerts.filter((a) => a.level === 'high');

  /* Ba ô đầu là ba con số quyết định ngân sách, ba ô sau là chi tiết vận hành.
   *
   * Bỏ CTR khỏi bảng tổng quan: ở tầng này nó gần như không dẫn tới hành động nào —
   * đó là chỉ số chẩn đoán nội dung quảng cáo, việc làm trong app. Chỗ đó nhường
   * cho DOANH THU, con số trước đây thiếu hẳn dù thẻ có ô ROAS.
   *
   * `revenue` ở đây là doanh thu GHI CÔNG CHO QUẢNG CÁO, không phải doanh thu công
   * ty — thẻ này từng hiện ROAS 162,63x vì lấy cả 8,6 tỷ của kênh "Khác" (lữ hành,
   * khách cũ, gọi trực tiếp) làm tử số. */
  const the = [
    { nhan: 'Chi tiêu', so: k.spend || 0, dinhDang: 'vnd', lech: d.spend },
    { nhan: 'Doanh thu từ QC', so: k.revenue || 0, dinhDang: 'vnd', lech: d.revenue,
      ghi: k.revenueCongTy
        ? (k.tyLeTuQuangCao != null ? k.tyLeTuQuangCao + '% của ' + dinhDangTien(k.revenueCongTy) + ' toàn công ty' : '')
        : '' },
    { nhan: 'ROAS', so: k.roas || 0, dinhDang: 'x', lech: d.roas,
      ghi: k.revenue ? 'chỉ tính phần từ quảng cáo' : 'chưa ghi công được đơn nào' },
    { nhan: 'Chuyển đổi', so: k.conversions || 0, dinhDang: 'so', lech: d.conversions },
    { nhan: 'CPA', so: k.cpa || 0, dinhDang: 'vnd', lech: d.cpa, dao: true },
    { nhan: 'Cảnh báo', so: alerts.length, dinhDang: 'so', tab: 'canh-bao', khoa: 'canh-bao',
      muc: nang.length ? 'cao' : alerts.length ? 'vua' : 'ok' },
  ];

  /* Cảnh báo quảng cáo không phải bản ghi Base (nó là kết luận tính ra từ nhiều
   * dòng chi tiêu) nên không có id để thao tác — chỉ đọc rồi mở app. */
  const nhom = {
    'canh-bao': alerts.map((a) => ({
      id: '', tieuDe: a.title, lyDo: a.detail || '',
      muc: a.level === 'high' ? 'cao' : a.level === 'mid' ? 'vua' : 'thap',
      the: [a.kind].filter(Boolean),
    })),
  };

  /* Cảnh báo mức cao/vừa mới đáng lên trang chủ; cắt 8 cho danh sách ngắn nhưng
   * vẫn khai tổng thật để trang chủ đếm đúng. */
  const dangKe = alerts.filter((a) => a.level === 'high' || a.level === 'mid');
  const canXuLyTong = dangKe.length;
  const canXuLy = dangKe
    .slice(0, 8)
    .map((a) => ({
      muc: a.level === 'high' ? 'cao' : 'vua',
      tieuDe: a.title,
      phu: a.detail || '',
      the: [],
    }));

  return {
    the,
    nhom,
    canXuLy,
    canXuLyTong,
    khoang: ov.range ? ov.range.from + ' → ' + ov.range.to : '',
  };
}

/* ---------------- Booking OTA ---------------- */
/**
 * Chỉ số của app Booking OTA. Cũng như app quảng cáo, hub KHÔNG tự cộng lại —
 * đưa khoảng lọc xuống module để mọi quy tắc (booking huỷ không tính doanh thu,
 * cách bật cờ "cần xử lý") chỉ định nghĩa ở một nơi là thongke.js của module.
 *
 * Thẻ số ở đây chọn theo câu hỏi người quản lý hỏi vào buổi sáng: hôm nay chạy
 * tour nào, booking nào phải gọi khách, cái nào chưa ai nhận, tiền về bao nhiêu.
 */
async function ota(mod, khoang, nguoi) {
  /* Bộ lọc thời gian của hub áp theo NGÀY ĐI: vận hành tour quan tâm ngày chạy,
   * không phải ngày khách bấm đặt. Không lọc thì xem toàn bộ. */
  const q = khoang && khoang.tu && khoang.den
    ? '?moc=ngayDi&from=' + encodeURIComponent(khoang.tu) + '&to=' + encodeURIComponent(khoang.den)
    : '?moc=ngayDi';

  const [ds, tk] = await Promise.all([
    goiJson(mod, '/api/bookings' + q, { nguoi }),
    goiJson(mod, '/api/thongke' + q, { nguoi }),
  ]);

  const vh = ds.vanHanh || { the: [], nhom: {} };
  const t = tk.tong || {};
  const lay = (khoa) => (vh.the.find((x) => x.khoa === khoa) || { so: 0, ghi: '' });
  const homNay = lay('hom-nay');
  const canGoi = lay('can-goi');
  const chuaNhan = lay('chua-nhan');
  const moiVe = lay('moi-ve');

  const the = [
    { nhan: 'Tour hôm nay', so: homNay.so, dinhDang: 'so', khoa: 'hom-nay', ghi: homNay.ghi },
    { nhan: 'Cần liên hệ khách', so: canGoi.so, dinhDang: 'so', khoa: 'can-goi',
      muc: canGoi.so ? 'cao' : 'ok', ghi: canGoi.ghi },
    /* Base OTA chưa có cột "Sales đã nhận" thì module không trả thẻ này — bỏ hẳn
     * chứ không hiện số 0 mãi mãi. */
    ...(vh.the.some((x) => x.khoa === 'chua-nhan')
      ? [{ nhan: 'Chưa ai nhận', so: chuaNhan.so, dinhDang: 'so', khoa: 'chua-nhan',
        muc: chuaNhan.so ? 'vua' : 'ok' }] : []),
    { nhan: 'Booking về 24h qua', so: moiVe.so, dinhDang: 'so', khoa: 'moi-ve' },
    // thẻ tiền chỉ hiện với người được xem chi phí, giống Lịch tác nghiệp
    ...((!nguoi || nguoi.quanLy || nguoi.chiPhi) ? [
      /* Tên thẻ lấy đúng tên cột công thức của base OTA ("Doanh thu thu về") để
       * người mở Base đối chiếu được ngay, khỏi phải đoán hai chữ có cùng nghĩa. */
      { nhan: 'Doanh thu thu về', so: t.thucNhan || 0, dinhDang: 'vnd',
        ghi: (t.bookingSong || 0) + ' booking · ' + (t.khach || 0) + ' khách' },
      { nhan: 'Hoa hồng OTA', so: t.hoaHong || 0, dinhDang: 'vnd',
        /* Hoa hồng = Gross VND × %. Chưa ai nhập giá OTA bán thì Gross = 0 và
         * hoa hồng cũng 0 — nói ra lý do, đừng để người đọc tưởng OTA không lấy
         * đồng nào. */
        ghi: !t.tongTien ? 'chưa nhập giá OTA bán (Gross) nên chưa tính được'
          : (t.tyLeHoaHong || 0) + '% doanh thu' +
            (t.thieuTyGia ? ' · ' + t.thieuTyGia + ' booking thiếu tỷ giá' : '') },
    ] : []),
  ];

  /* Chỉ những bản ghi ĐÃ nằm trong Lark Base mới có id dạng rec… — booking còn
   * trong hàng đợi cục bộ thì để id rỗng, cửa sổ xử lý nhanh sẽ hiện đọc-thôi
   * thay vì đưa ra nút bấm rồi báo lỗi. */
  /* Cột "Sales đã nhận" là cột TUỲ CHỌN trong base OTA — chưa thêm thì module trả
   * coDaNhan=false, và hub KHÔNG được hiện nút "Nhận booking": bấm vào chỉ nhận
   * về lỗi. Gắn cờ vào từng dòng vì nhanh.js chỉ nhìn thấy dòng, không thấy meta. */
  const coDaNhan = ds.coDaNhan !== false;

  const dong = (b) => ({
    id: /^rec/.test(b.id || '') ? b.id : '',
    coDaNhan,
    tieuDe: (b.tenKhach || '(chưa có tên khách)') + ' · ' + (b.tour || '(chưa có tên tour)'),
    trangThai: b.trangThai || '',
    nguoi: b.kenh || '',
    ngay: b.ngayDi ? Date.parse(b.ngayDi + 'T00:00:00') : 0,
    lyDo: b.canXuLyChuoi || '',
    maBooking: b.maBooking || '',
    sdt: b.sdt || '',
    diemDon: b.diemDon || '',
    daNhan: !!b.daNhan,
    the: [b.kenh, b.sdt ? '' : 'chưa có SĐT', b.diemDon ? '' : 'chưa có điểm đón'].filter(Boolean),
  });

  const nhom = {};
  Object.keys(vh.nhom || {}).forEach((k) => { nhom[k] = (vh.nhom[k] || []).map(dong); });

  const canXuLy = (vh.nhom['can-goi'] || []).slice(0, 8).map((b) => ({
    id: /^rec/.test(b.id || '') ? b.id : '',
    muc: 'cao',
    tieuDe: (b.tenKhach || '(chưa có tên khách)') + ' · ' + (b.maBooking || ''),
    phu: b.canXuLyChuoi + ' · ' + (b.ngayDi ? 'đi ' + b.ngayDi : 'chưa có ngày đi') + ' · ' + b.kenh,
    the: [b.kenh].filter(Boolean),
  }));

  /* Chưa nối được Base là việc của quản trị, không phải của sales — nhưng nó làm
   * mọi số ở trên chỉ là số của hàng đợi tạm, nên phải nói ra ngay trên hub. */
  if (ds.nguon !== 'base') {
    canXuLy.unshift({
      id: '', muc: 'cao',
      tieuDe: 'App Booking OTA chưa ghi được vào Lark Base',
      phu: (ds.loi || 'đang lưu tạm ở hàng đợi cục bộ') + ' — mở base OTA, tab Thiết lập',
      the: [],
    });
  } else if (ds.quyenGhi === false) {
    /* Đọc được mà ghi không được: mọi thẻ số ở trên vẫn đúng nên không có gì
     * trông như hỏng — đúng kiểu lỗi im lặng. Nói ngay cả khi hàng đợi còn trống,
     * vì lúc booking thật đầu tiên về mới biết thì đã muộn. */
    canXuLy.unshift({
      id: '', muc: 'cao',
      tieuDe: 'App Booking OTA chưa có quyền GHI vào Base',
      phu: 'đọc thì được, ghi thì không — booking mới sẽ nằm lại hàng đợi cục bộ' +
        (ds.chuaDay ? ' (đang có ' + ds.chuaDay + ' booking chờ)' : '') +
        '. Mở Base → Chia sẻ → nâng lên "Có thể chỉnh sửa".',
      the: [],
    });
  } else if (ds.chuaDay) {
    /* ĐỌC được Base mà GHI không được — hay gặp nhất khi tài khoản chỉ có quyền
     * Xem trên base. Lúc đó mọi số ở trên vẫn đúng nên không có gì trông như hỏng,
     * chỉ có booking mới lặng lẽ nằm lại hàng đợi. Phải kêu lên. */
    canXuLy.unshift({
      id: '', muc: 'cao',
      tieuDe: ds.chuaDay + ' booking mới chưa đẩy được lên Base',
      phu: 'đọc Base thì được nhưng ghi thì không — thường là tài khoản chỉ có quyền Xem. ' +
        'Mở base OTA, tab Thiết lập để xem lý do và bấm Đẩy hàng đợi vào Base.',
      the: [],
    });
  }

  return {
    the, nhom, canXuLy,
    tong: ds.tongTatCa || 0,
    nguoi: '',
  };
}

/* ============================================================
   Social — số liệu các kênh mạng xã hội
   ============================================================ */
async function social(mod, khoang, nguoi) {
  /* App Social đã nhận from/to nên đưa thẳng khoảng lọc xuống nó tính — một
     định nghĩa chỉ số duy nhất nằm ở metrics.js của app, hub không cộng lại. */
  const q = khoang && khoang.tu && khoang.den
    ? '?from=' + encodeURIComponent(khoang.tu) + '&to=' + encodeURIComponent(khoang.den)
    : '?days=30';
  const ov = await goiJson(mod, '/api/tong-quan' + q, { nguoi });
  const t = ov.tong || {};
  const d = ov.doi || {};

  const the = [
    { nhan: 'Lượt xem', so: t.views || 0, dinhDang: 'so', lech: d.views },
    { nhan: 'Lượt tiếp cận', so: t.reach || 0, dinhDang: 'so', lech: d.reach },
    /* Follower là số CHỐT ở ngày mới nhất, không phải tổng cộng dồn — nói rõ ra,
       vì đây đúng là chỗ mọi bảng social hay cộng nhầm rồi ra số to gấp mấy chục lần. */
    { nhan: 'Follower', so: t.followers || 0, dinhDang: 'so', ghi: 'chốt ngày mới nhất' },
    { nhan: 'Follower tăng ròng', so: t.followNet || 0, dinhDang: 'so', lech: d.followNet,
      muc: (t.followNet || 0) < 0 ? 'vua' : 'ok' },
    { nhan: 'Tương tác', so: t.engagement || 0, dinhDang: 'so', lech: d.engagement },
    { nhan: 'Tỷ lệ tương tác', so: (t.tyLeTuongTac || 0) * 100, dinhDang: 'pt', lech: d.tyLeTuongTac },
  ];

  /* Việc cần xử lý của một app số liệu không phải "duyệt cái gì", mà là "kênh nào
     đang im". Kênh không đăng bài nào trong kỳ là thứ trưởng phòng cần thấy ngay
     trên trang chủ — nó không tự kêu như một đơn hàng chờ duyệt. */
  const im = (ov.kenh || []).filter((k) => !k.posts && !k.views);
  const canXuLy = im.slice(0, 8).map((k) => ({
    muc: 'vua',
    tieuDe: k.name + ' — không có số liệu trong kỳ',
    phu: k.platform + ' · chưa đăng bài hoặc chưa đồng bộ',
    the: [k.platform].filter(Boolean),
  }));

  return {
    the,
    nhom: { 'kenh-im': im.map((k) => ({
      id: '', tieuDe: k.name, lyDo: k.platform + ' · không có số liệu trong kỳ', muc: 'vua',
      the: [k.platform].filter(Boolean),
    })) },
    canXuLy,
    canXuLyTong: im.length,
    canXuLyKhoa: 'kenh-im',
    tong: (ov.kenh || []).length,
    khoang: ov.tu ? ov.tu + ' → ' + ov.den : '',
    nguoi: '',
  };
}

const BO_DOC = {
  'cong-viec': congViec,
  'lich-tac-nghiep': lichTacNghiep,
  'quang-cao': quangCao,
  'ota': ota,
  'social': social,
};

/* ---------------- cache + gom ---------------- */
const cache = new Map(); // "id|tu|den" -> { at, data }

/* Khoá cache mang cả khoảng lọc VÀ id người xem: chế độ chạy chung, mỗi người
 * thấy một phạm vi khác nhau — dùng chung cache là lộ dữ liệu của nhau. */
const khoa = (mod, k, nguoi) => mod.id + '|' + ((k && k.tu) || '') + '|' + ((k && k.den) || '') +
  '|' + ((nguoi && nguoi.id) || '');

async function doc(mod, khoang, nguoi) {
  const fn = BO_DOC[mod.kpi];
  if (!fn) return { ok: false, loi: '', khongCo: true };

  const kh = khoa(mod, khoang, nguoi);
  const c = cache.get(kh);
  if (c && c.data && Date.now() - c.at < cfg.kpiCacheMs) return { ...c.data, ok: true, luc: c.at };

  try {
    const data = await fn(mod, khoang, nguoi);
    cache.set(kh, { at: Date.now(), data });
    return { ...data, ok: true, luc: Date.now() };
  } catch (e) {
    const cu = cache.get(kh);
    if (cu && cu.data) return { ...cu.data, ok: true, cu: true, loi: e.message, luc: cu.at };
    return { ok: false, loi: e.message };
  }
}

/**
 * Danh sách bản ghi đứng sau một thẻ số (cửa sổ xử lý nhanh).
 * Dùng lại cache của `doc()` nên mở cửa sổ gần như tức thì và con số luôn khớp
 * với thẻ vừa bấm.
 */
async function nhomCua(mod, khoaNhom, khoang, nguoi) {
  const d = await doc(mod, khoang, nguoi);
  if (!d.ok) throw new Error(d.loi || 'Không đọc được chỉ số của base này');

  /* "rec:<id>" = xin đúng một bản ghi (bấm một dòng trong Cần xử lý ngay). Tìm
   * trong các nhóm đã tính nên không phải gọi thêm module. */
  if (khoaNhom.startsWith('rec:')) {
    const id = khoaNhom.slice(4);
    for (const ds of Object.values(d.nhom || {})) {
      const hit = ds.find((x) => x.id === id);
      if (hit) return [hit];
    }
    return [];
  }

  const ds = (d.nhom || {})[khoaNhom];
  if (!ds) throw new Error('Không có nhóm "' + khoaNhom + '" trong base này');
  return ds;
}

/** Đọc song song chỉ số của mọi module đang bật, theo cùng một khoảng thời gian. */
async function tongQuan(mods, khoang, nguoi) {
  // `nhom` giữ ở server (nặng, có thể vài trăm dòng); client xin riêng khi cần
  const ds = await Promise.all(mods.map(async (m) => {
    const { nhom, ...cong } = await doc(m, khoang, nguoi);
    return { id: m.id, ...cong };
  }));
  const canXuLy = [];
  ds.forEach((r) => (r.canXuLy || []).forEach((v) => canXuLy.push({ ...v, module: r.id })));
  const uu = { cao: 0, vua: 1, thap: 2 };
  canXuLy.sort((a, b) => (uu[a.muc] ?? 3) - (uu[b.muc] ?? 3));
  const ngoai = ds.reduce((s, r) => s + (r.ngoaiKhoang || 0), 0);
  /* Tổng THẬT của cả hệ, cộng trước khi cắt. Từng bộ đọc đã cắt danh sách của nó
   * (6 việc quá hạn, 4 chưa phân công…) rồi đây cắt thêm lần nữa ở 40 — nếu chỉ
   * đếm mảng cuối thì trang chủ báo thiếu mà không ai biết. */
  const tong = ds.reduce((s, r) => s + (r.canXuLyTong || (r.canXuLy || []).length), 0);
  return {
    modules: ds,
    canXuLy: canXuLy.slice(0, 40),
    canXuLyTong: tong,
    khoang: khoang && khoang.tu ? khoang : null,
    ngoaiKhoang: ngoai,
    luc: Date.now(),
  };
}

function xoaCache(id) {
  if (!id) return cache.clear();
  [...cache.keys()].filter((k) => k.split('|')[0] === id).forEach((k) => cache.delete(k));
}

module.exports = { doc, tongQuan, nhomCua, xoaCache, BO_DOC };
