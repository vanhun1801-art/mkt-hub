'use strict';
/**
 * ============================================================================
 * Kỳ báo cáo, hạn nộp, định mức ca — TOÀN BỘ phần dễ sai âm thầm
 * ============================================================================
 * Tách riêng khỏi server và khỏi Base vì đây là chỗ một lỗi lệch một ngày không
 * bao giờ hiện ra dưới dạng lỗi: màn hình vẫn vẽ một câu hợp lý, chỉ là chấm
 * nhầm người đúng hạn thành trễ. Đã dính đúng kiểu đó ở app Lịch tác nghiệp:
 * viết `moThu: 6` vì nghĩ "Thứ 6", mà ISO 6 là THỨ BẢY, nên cả khung giờ chạy
 * lệch một ngày trong khi giao diện đọc vẫn xuôi tai.
 *
 * Quy ước dùng xuyên suốt, không được đổi ở nơi khác:
 *   - ISO thứ: 1=Thứ 2 … 5=Thứ 6, 6=Thứ 7, 7=Chủ nhật.
 *     "Thứ 6" là 5. Nhắc lại vì đây chính là cái bẫy đã sập một lần.
 *   - Giờ VN là UTC+7 CỐ ĐỊNH (Việt Nam không đổi giờ mùa). Cộng lệch TRƯỚC
 *     rồi mới cắt ngày, vì máy chủ Render chạy giờ UTC — cắt ngày theo giờ máy
 *     thì mọi báo cáo gửi sau 17:00 VN rơi sang ngày hôm trước.
 *
 * Ba loại kỳ và hạn nộp, theo đúng lời anh Hùng:
 *   - Ngày:  nộp cuối ngày làm việc đó.
 *   - Tuần:  nộp ngày cuối cùng của tuần.
 *   - Tháng: chậm nhất ngày đầu tiên của tháng tiếp theo.
 */

const PHUT = 60000;
const GIO = 3600000;
const NGAY = 86400000;
const VN = 7 * GIO;

/** Ca làm việc và định mức phút. Anh Hùng: "ca bình thường là 8 tiếng 480 phút;
 *  còn đôi khi sẽ có 4 tiếng là 240". Nên KHÔNG ép một con số cho cả phòng —
 *  mỗi phiếu tự khai ca, phần trăm tính trên định mức của chính ca đó. */
const CA = {
  ngay: { ten: 'Cả ngày', phut: 480 },
  nua: { ten: 'Nửa ngày', phut: 240 },
  khac: { ten: 'Khác', phut: 0 },   // tự khai, lấy từ ô `dinhMucTay`
};

const TEN_THU = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

/* Trễ bao lâu thì gọi là NỘP BÙ.
 *
 * Quên gửi buổi tối rồi sáng hôm sau gửi là một chuyện; nộp cho một ngày đã
 * trôi qua hẳn — hay dồn cả tuần vào cuối tháng — là chuyện khác. Gộp chung
 * thành "trễ" thì quản lý không phân biệt được ai lỡ tay với ai bỏ bê.
 *
 * 24 giờ: qua hết một ngày làm việc nữa mà vẫn chưa nộp thì đó không còn là lỡ. */
const NGUONG_BU = 24 * 3600000;

/** Luật mặc định. Đưa ra ngoài được để sửa trong Cài đặt mà không phải sửa code. */
const LUAT = {
  /* Tuần của phòng chạy Thứ 7 → Thứ 6, đúng như thẻ nhắc anh Hùng gửi mỗi tuần:
   * "Mốc thời gian đo lường: Thứ 7 tuần trước đến thứ 6 tuần hiện tại". */
  tuanBatDauThu: 6,           // ISO 6 = Thứ 7
  /* Chủ nhật không bắt buộc báo cáo. Ai đi làm thì vẫn nộp được — trong dữ liệu
   * nhóm có người báo "tăng ca ngày 06.09" đúng một Chủ nhật. Không bắt buộc
   * khác với không cho phép. */
  ngayLamViec: [1, 2, 3, 4, 5, 6],
  caMacDinh: 'ngay',
};

/* ---------------- mốc thời gian theo giờ VN ---------------- */

/** Các thành phần ngày/giờ theo giờ VN. */
function phanRaVN(ms) {
  const d = new Date(Number(ms) + VN);
  return {
    nam: d.getUTCFullYear(),
    thang: d.getUTCMonth() + 1,
    ngay: d.getUTCDate(),
    gio: d.getUTCHours(),
    phut: d.getUTCMinutes(),
    /* getUTCDay: 0=CN. Đổi sang ISO để 7 là Chủ nhật, khớp TEN_THU. */
    thu: d.getUTCDay() === 0 ? 7 : d.getUTCDay(),
  };
}

/** 00:00:00.000 giờ VN của ngày chứa `ms`. */
function dauNgay(ms) {
  return Math.floor((Number(ms) + VN) / NGAY) * NGAY - VN;
}

/** 23:59:59.999 giờ VN của ngày chứa `ms`. */
function cuoiNgay(ms) {
  return dauNgay(ms) + NGAY - 1;
}

/** Mốc UTC của 00:00 giờ VN ngày y-m-d. */
function tuNgayVN(nam, thang, ngay) {
  return Date.UTC(nam, thang - 1, ngay) - VN;
}

/** "12/09/2026" */
function veNgay(ms) {
  const p = phanRaVN(ms);
  const p2 = (n) => String(n).padStart(2, '0');
  return p2(p.ngay) + '/' + p2(p.thang) + '/' + p.nam;
}

/** "Thứ 7 12/09/2026" */
function veNgayThu(ms) {
  return TEN_THU[phanRaVN(ms).thu] + ' ' + veNgay(ms);
}

/** "12/09/2026 17:01" */
function veLuc(ms) {
  const p = phanRaVN(ms);
  const p2 = (n) => String(n).padStart(2, '0');
  return veNgay(ms) + ' ' + p2(p.gio) + ':' + p2(p.phut);
}

/* ---------------- ba loại kỳ ---------------- */

function kyNgay(ms) {
  const tu = dauNgay(ms);
  return { loai: 'ngay', tu, den: tu + NGAY - 1, nhan: veNgay(tu) };
}

/**
 * Tuần chứa `ms`, bắt đầu ở thứ `batDauThu` (ISO).
 *
 * Lùi về đúng ngày bắt đầu bằng số học trên ISO thay vì đếm ngược từng ngày:
 * (thu - batDau + 7) % 7 luôn ra 0..6 kể cả khi tuần vắt qua Chủ nhật, là chỗ
 * mà cách "trừ dần cho tới khi khớp" hay đi sai một nhịp.
 */
function kyTuan(ms, batDauThu = LUAT.tuanBatDauThu) {
  const d = dauNgay(ms);
  const thu = phanRaVN(d).thu;
  const lui = (thu - batDauThu + 7) % 7;
  const tu = d - lui * NGAY;
  const den = tu + 7 * NGAY - 1;
  return { loai: 'tuan', tu, den, nhan: veNgay(tu) + ' – ' + veNgay(den) };
}

function kyThang(ms) {
  const p = phanRaVN(ms);
  const tu = tuNgayVN(p.nam, p.thang, 1);
  const sau = p.thang === 12 ? tuNgayVN(p.nam + 1, 1, 1) : tuNgayVN(p.nam, p.thang + 1, 1);
  return {
    loai: 'thang',
    tu,
    den: sau - 1,
    nhan: 'Tháng ' + String(p.thang).padStart(2, '0') + '/' + p.nam,
  };
}

/** Dựng kỳ theo loại — một cửa duy nhất cho server gọi. */
function ky(loai, ms, luat = LUAT) {
  if (loai === 'ngay') return kyNgay(ms);
  if (loai === 'tuan') return kyTuan(ms, luat.tuanBatDauThu);
  if (loai === 'thang') return kyThang(ms);
  throw new Error('Loại kỳ lạ: ' + loai);
}

/* ---------------- hạn nộp ---------------- */

/**
 * Hạn nộp của một kỳ.
 *
 * Ngày: hết chính ngày đó.
 *
 * Tuần và tháng: hết NGÀY ĐẦU TIÊN của kỳ kế tiếp. Hai cái này cùng một luật,
 * dù nghe như hai quy định riêng — anh Hùng nói tuần là "làm báo cáo ngày thứ
 * 7, còn hiệu quả đo lường từ thứ 7 tuần trước tới thứ 6 tuần này", và tháng là
 * "chậm nhất ngày đầu tiên của tháng tiếp theo". Kỳ tuần đóng hết Thứ 6, nên
 * Thứ 7 chính là ngày đầu của tuần kế; kỳ tháng đóng hết ngày cuối tháng, nên
 * mùng 1 là ngày đầu của tháng kế.
 *
 * Lý do sâu hơn: hạn phải nằm SAU khi kỳ đóng. Đặt hạn vào trong kỳ là bắt
 * người ta tổng kết một khoảng chưa kết thúc — bản trước để hạn tuần đúng vào
 * Thứ 6, tức là đòi báo cáo tuần khi ngày cuối cùng của tuần còn chưa hết.
 */
function hanNop(k) {
  if (k.loai === 'ngay') return k.den;
  return cuoiNgay(k.den + 1);
}

/**
 * Nộp lúc `nopLuc` cho kỳ `k` thì đúng hạn hay trễ.
 * Chưa nộp (nopLuc rỗng) KHÔNG phải là trễ nếu hạn chưa tới — đó là "chưa tới
 * hạn", một trạng thái khác hẳn, và gộp hai thứ này là cách nhanh nhất để bảng
 * đánh giá báo đỏ oan cho người còn cả buổi chiều để nộp.
 */
function chamHan(k, nopLuc, bayGio = Date.now()) {
  const han = hanNop(k);
  if (!nopLuc) {
    return han >= bayGio
      ? { trangThai: 'chua-toi-han', han, treMs: 0 }
      : { trangThai: 'thieu', han, treMs: bayGio - han };
  }
  const tre = Number(nopLuc) - han;
  if (tre <= 0) return { trangThai: 'dung-han', han, treMs: 0, bu: false };
  /* Vẫn là trạng thái 'tre' — nộp bù là một MỨC của trễ, không phải trạng thái
   * thứ năm. Tách thành trạng thái riêng thì mọi chỗ đang hỏi "có trễ không"
   * phải sửa lại, và chỗ nào quên sửa sẽ âm thầm coi người nộp bù là đúng hạn. */
  return { trangThai: 'tre', han, treMs: tre, bu: tre > NGUONG_BU };
}

/** Câu mô tả một lần nộp — dùng chung ở mọi màn để không nơi nào nói khác nơi nào. */
function veLanNop(cham) {
  if (!cham) return '';
  if (cham.trangThai === 'dung-han') return 'Đúng hạn';
  if (cham.trangThai === 'chua-toi-han') return 'Chưa tới hạn';
  if (cham.trangThai === 'thieu') return 'Chưa nộp, đã quá hạn';
  return (cham.bu ? 'Nộp bù — ' : '') + veTre(cham.treMs);
}

/** "trễ 2 ngày 3 giờ" — nói bằng đơn vị người đọc hiểu ngay. */
function veTre(ms) {
  const t = Math.max(0, Number(ms) || 0);
  if (t < PHUT) return 'trễ dưới một phút';
  const ngay = Math.floor(t / NGAY);
  const gio = Math.floor((t % NGAY) / GIO);
  const phut = Math.floor((t % GIO) / PHUT);
  const phan = [];
  if (ngay) phan.push(ngay + ' ngày');
  if (gio) phan.push(gio + ' giờ');
  if (!ngay && phut) phan.push(phut + ' phút');
  return 'trễ ' + phan.join(' ');
}

/* ---------------- định mức và tổng hợp ---------------- */

/** Định mức phút của một phiếu ngày. `khac` thì lấy số người tự khai. */
function dinhMuc(ca, dinhMucTay) {
  const c = CA[ca] || CA[LUAT.caMacDinh];
  if (c.phut) return c.phut;
  const n = Number(dinhMucTay);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Cộng các dòng việc của một phiếu.
 *
 * Phần trăm tính trên ĐỊNH MỨC, không phải trên tổng phút đã khai. Chia cho
 * chính tổng của mình thì ai cũng ra đúng 100% — đó là con số hiện đang nằm
 * trong ảnh của cả phòng, và nó không nói lên điều gì cả. Chia cho định mức thì
 * 240/480 hiện ra là 50%, tức là còn nửa ca chưa khai vào đâu.
 */
function gop(dong, dinhMucPhut) {
  const ds = Array.isArray(dong) ? dong : [];
  let tong = 0;
  const nhom = new Map();
  for (const d of ds) {
    const p = Math.max(0, Math.round(Number(d.phut) || 0));
    tong += p;
    const k = (d.nhom || 'Khác').trim() || 'Khác';
    nhom.set(k, (nhom.get(k) || 0) + p);
  }
  const dm = Math.max(0, Math.round(Number(dinhMucPhut) || 0));
  return {
    soViec: ds.length,
    tongPhut: tong,
    dinhMucPhut: dm,
    /* Không có định mức thì phần trăm là null, KHÔNG phải 0: "chưa đo được"
     * và "làm được 0%" là hai chuyện khác nhau. */
    phanTram: dm > 0 ? Math.round((tong / dm) * 100) : null,
    thieuPhut: dm > 0 ? Math.max(0, dm - tong) : 0,
    theoNhom: [...nhom.entries()]
      .map(([ten, phut]) => ({ ten, phut }))
      .sort((a, b) => b.phut - a.phut),
  };
}

/** "8 giờ" / "7 giờ 30" / "45 phút" */
function vePhut(p) {
  const n = Math.max(0, Math.round(Number(p) || 0));
  if (n < 60) return n + ' phút';
  const gio = Math.floor(n / 60);
  const du = n % 60;
  return du ? gio + ' giờ ' + du : gio + ' giờ';
}

/**
 * Gộp các dòng việc trong một kỳ THEO ĐẦU VIỆC.
 *
 * Báo cáo tuần không phải là bảy báo cáo ngày dán cạnh nhau — người viết cần
 * thấy "việc A tôi làm 3 ngày, tổng 6 tiếng, tiến độ đi từ 30% lên 70%", chứ
 * không phải bảy dòng rời rạc. Bốn con số tổng (số phiếu, tổng giờ, % định mức,
 * số nhóm việc) thì đúng nhưng không viết ra được câu nào.
 *
 * Khoá gộp là mã việc bên Tracking, lùi về tên khi gõ tay — cùng cách
 * `timDungYen()` dùng, để hai chỗ không bao giờ gộp khác nhau.
 */
function gopTheoViec(dong) {
  const m = new Map();
  for (const d of (dong || [])) {
    const ten = String(d.congViec || '').trim();
    if (!ten) continue;
    const khoa = String(d.maViec || '').trim() || ('ten:' + ten.toLowerCase());
    if (!m.has(khoa)) {
      m.set(khoa, {
        khoa, ten, maViec: d.maViec || '', nhom: d.nhom || 'Khác',
        tongPhut: 0, ngay: [], ghiChu: [],
      });
    }
    const v = m.get(khoa);
    v.tongPhut += Math.max(0, Math.round(Number(d.phut) || 0));
    v.ngay.push({
      ms: dauNgay(d.ngay),
      pt: Math.max(0, Math.min(100, Math.round(Number(d.tienDoPt) || 0))),
      trangThai: d.trangThai || '',
    });
    const gc = String(d.tienDo || '').trim();
    if (gc) v.ghiChu.push({ ms: dauNgay(d.ngay), chu: gc });
  }

  return [...m.values()].map((v) => {
    v.ngay.sort((a, b) => a.ms - b.ms);
    v.ghiChu.sort((a, b) => a.ms - b.ms);
    const dau = v.ngay[0];
    const cuoi = v.ngay[v.ngay.length - 1];
    return {
      ten: v.ten,
      maViec: v.maViec,
      nhom: v.nhom,
      tongPhut: v.tongPhut,
      soNgay: v.ngay.length,
      ptDau: dau ? dau.pt : 0,
      ptCuoi: cuoi ? cuoi.pt : 0,
      trangThai: cuoi ? cuoi.trangThai : '',
      /* Đứng yên = làm từ 2 ngày trở lên mà con số không nhúc nhích và chưa
       * xong. Ngưỡng ở đây thấp hơn timDungYen() (3 ngày) vì trong phạm vi một
       * tuần thì hai ngày đã đáng để người viết nhắc tới. */
      dungYen: v.ngay.length >= 2 && dau.pt === cuoi.pt && cuoi.pt < 100
        && cuoi.trangThai !== 'Hoàn thành',
      ghiChu: v.ghiChu,
    };
  }).sort((a, b) => b.tongPhut - a.tongPhut || a.ten.localeCompare(b.ten));
}

/**
 * Những ngày làm việc trong khoảng mà người này KHÔNG có phiếu nào.
 * Đây là câu hỏi anh Hùng thật sự hỏi mỗi chiều — "ai chưa nộp" — nên nó phải
 * là một hàm, không phải việc mắt người dò trong nhóm chat.
 */
function ngayThieu(tu, den, dsNgayDaNop, luat = LUAT) {
  const co = new Set((dsNgayDaNop || []).map((x) => dauNgay(x)));
  const ra = [];
  for (let d = dauNgay(tu); d <= den; d += NGAY) {
    if (!luat.ngayLamViec.includes(phanRaVN(d).thu)) continue;
    if (!co.has(d)) ra.push(d);
  }
  return ra;
}


/* ---------------- so với kỳ trước ---------------- */

/**
 * Mốc của kỳ LIỀN TRƯỚC, và cắt kỳ đó tới đâu cho công bằng.
 *
 * Bẫy ở đây không phải chuyện tính ngày, mà là chuyện so lệch: tháng mới tới
 * ngày 14 mà đem đọ với trọn 31 ngày tháng trước thì tháng nào cũng "tụt 60%",
 * và con số đó không nói lên điều gì ngoài việc tháng chưa hết. Nên khi kỳ này
 * CHƯA xong thì cắt kỳ trước lại đúng số ngày đã trôi — 14 ngày so với 14 ngày.
 *
 * Trả:
 *   mocMs    — một mốc nằm trong kỳ trước, đưa thẳng cho ky() / kho.tongHop()
 *   denToiDa — chỉ tính kỳ trước tới đây; null là lấy trọn kỳ
 *   dayDu    — kỳ này đã kết thúc chưa (màn hình phải nói rõ đang so kiểu nào,
 *              không thì người đọc tưởng đang so hai kỳ trọn vẹn)
 *   soNgay   — số ngày của kỳ này được tính vào phép so
 */
function mocSoSanh(kyNay, bayGio) {
  const nay = bayGio == null ? Date.now() : bayGio;
  /* Lùi một mili giây khỏi đầu kỳ là rơi vào kỳ trước, không cần biết kỳ trước
   * dài 28, 30 hay 31 ngày. */
  const mocMs = kyNay.tu - 1;
  const truoc = ky(kyNay.loai, mocMs);
  if (nay > kyNay.den) {
    return {
      mocMs, denToiDa: null, dayDu: true,
      soNgay: Math.round((kyNay.den + 1 - kyNay.tu) / NGAY),
    };
  }
  const soNgay = Math.max(1, Math.round((dauNgay(nay) - kyNay.tu) / NGAY) + 1);
  /* Kỳ trước ngắn hơn (tháng 2 chẳng hạn) thì lấy hết kỳ đó, không đòi thêm
   * ngày không tồn tại. */
  return {
    mocMs,
    denToiDa: Math.min(truoc.tu + soNgay * NGAY - 1, truoc.den),
    dayDu: false,
    soNgay,
  };
}

/** "+14 giờ" · "-2 giờ 30" · "không đổi" */
function veChenhPhut(phut) {
  const n = Math.round(Number(phut) || 0);
  if (n === 0) return 'không đổi';
  return (n > 0 ? '+' : '-') + vePhut(Math.abs(n));
}

/**
 * Gói phần "so với kỳ trước" để màn hình vẽ thẳng, không phải tự tính.
 *
 * `nay` và `truoc` là kết quả gop()/tongHop(): cần tongPhut, phanTram,
 * soPhieuNgay. `tin` là thứ mocSoSanh() trả về, cộng thêm nhãn kỳ trước.
 *
 * `coDuLieu` là ô quan trọng nhất: tháng trước không ai nộp phiếu nào thì mọi
 * phép so đều vô nghĩa — "giảm 100%" nghe như cả phòng bỏ việc, trong khi sự
 * thật chỉ là hồi đó chưa dùng app. Màn hình phải nói "chưa có gì để so" chứ
 * không được vẽ ra một con số.
 */
function soSanh(nay, truoc, tin = {}) {
  const coDuLieu = (truoc && truoc.soPhieuNgay > 0);
  const chenhPhut = coDuLieu ? (nay.tongPhut || 0) - (truoc.tongPhut || 0) : null;
  /* Phần trăm định mức so được cả khi số ngày lệch (nó đã chia cho định mức của
   * chính những ngày đã nộp) — nhưng chỉ khi CẢ HAI kỳ đo được. */
  const chenhPhanTram = (coDuLieu && nay.phanTram != null && truoc.phanTram != null)
    ? nay.phanTram - truoc.phanTram : null;
  return {
    nhan: tin.nhan || '',
    dayDu: !!tin.dayDu,
    soNgay: tin.soNgay || 0,
    coDuLieu,
    soPhieuNgay: coDuLieu ? truoc.soPhieuNgay : 0,
    tongPhut: coDuLieu ? truoc.tongPhut : 0,
    tongGio: coDuLieu ? vePhut(truoc.tongPhut) : '',
    phanTram: coDuLieu ? truoc.phanTram : null,
    chenhPhut,
    chenhGio: chenhPhut == null ? '' : veChenhPhut(chenhPhut),
    chenhPhanTram,
  };
}

module.exports = {
  PHUT, GIO, NGAY, VN, CA, TEN_THU, LUAT, NGUONG_BU,
  phanRaVN, dauNgay, cuoiNgay, tuNgayVN,
  veNgay, veNgayThu, veLuc, vePhut, veTre, veLanNop,
  kyNgay, kyTuan, kyThang, ky,
  hanNop, chamHan, gopTheoViec,
  dinhMuc, gop, ngayThieu,
  mocSoSanh, veChenhPhut, soSanh,
};
