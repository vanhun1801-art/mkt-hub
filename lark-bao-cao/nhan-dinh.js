'use strict';
/**
 * ============================================================================
 * Nhận định tự động về một kỳ báo cáo
 * ============================================================================
 * Anh Hùng muốn nhân sự "nhận được nhận định của AI", và quản lý "thấy được
 * đánh giá của AI toàn phòng".
 *
 * File này làm phần KHÔNG cần mô hình ngôn ngữ: đọc dữ liệu thật của kỳ rồi
 * phát biểu ra những điều đo được — nộp đúng hạn hay không, thời lượng so với
 * định mức, việc dồn vào một nhóm, đầu việc đứng yên nhiều ngày, ngày thiếu báo
 * cáo. Đó vốn là phần lớn thứ một người quản lý cần biết, và nó chạy được ngay,
 * không cần khoá, không phụ thuộc mạng, không bao giờ bịa ra một con số.
 *
 * Chỗ dành cho LLM: `ai.js` (chưa nối). Khi có nhà cung cấp, nó nhận đúng khối
 * `sựKiện` bên dưới và viết lại thành lời nhận xét — nhưng những gì nó nói vẫn
 * phải neo vào các sự kiện này, chứ không đọc thẳng dữ liệu thô. Máy tổng hợp
 * số, mô hình chỉ diễn đạt.
 */
const K = require('./ky');

/* Ngưỡng. Để một chỗ vì chúng là quy ước quản lý, không phải hằng số kỹ thuật —
 * anh Hùng đổi ý thì sửa ở đây, không phải đi tìm trong năm hàm. */
const NGUONG = {
  thieuGio: 80,        // dưới ngần này phần trăm định mức thì coi là khai thiếu giờ
  duGio: 100,
  domNhom: 60,         // một nhóm việc chiếm hơn ngần này phần trăm thời lượng
  ganLau: 3,           // một đầu việc giữ nguyên % qua ngần này ngày báo cáo
  treNhieu: 2,         // số lần trễ trong kỳ thì thành chuyện đáng nói
};

const MUC = { tot: 'tot', luu_y: 'luu-y', canh: 'canh' };

const cauNhom = (ds) => ds.map((n) => n.ten + ' ' + K.vePhut(n.phut)).join(', ');

/**
 * Nhận định cho MỘT phiếu (ngày / tuần / tháng).
 *
 * Trả về danh sách "ý", mỗi ý có mức và một câu tiếng Việt đọc được ngay. Không
 * gộp thành một đoạn văn ở đây: giao diện cần tô màu từng ý theo mức, còn khi
 * nào nối LLM thì chính danh sách này là đầu vào.
 *
 * `boiCanh` gom những thứ chỉ biết được khi nhìn rộng hơn một phiếu:
 *   { phieuTruoc: [...], dongTheoNgay: Map, ngayThieu: [...] }
 */
function chiMotPhieu(phieu, dong, boiCanh = {}) {
  const y = [];
  const them = (muc, chu, vi) => y.push({ muc, chu, vi: vi || '' });

  /* ---- 1. đúng hạn ---- */
  if (phieu.trangThaiHan === 'tre') {
    them(MUC.canh, 'Nộp muộn — ' + phieu.veHan + '.',
      'Quy định là nộp cuối kỳ; muộn thì số liệu tới tay quản lý sau khi đã cần dùng.');
  } else if (phieu.trangThaiHan === 'thieu') {
    them(MUC.canh, 'Chưa nộp và đã quá hạn.');
  } else if (phieu.daNop) {
    them(MUC.tot, 'Nộp đúng hạn.');
  }

  /* ---- 2. thời lượng so với định mức ---- */
  if (phieu.phanTram == null) {
    them(MUC.luu_y, 'Chưa khai định mức ca nên không đo được mức lấp đầy.');
  } else if (phieu.phanTram < NGUONG.thieuGio) {
    const thieu = Math.max(0, (phieu.dinhMuc || 0) - (phieu.tongPhut || 0));
    them(MUC.luu_y,
      'Mới khai ' + phieu.phanTram + '% định mức, còn ' + K.vePhut(thieu) + ' chưa vào đâu.',
      'Có thể là quên khai, cũng có thể là thật sự trống việc — hai chuyện đó cần trả lời khác nhau.');
  } else if (phieu.phanTram > 130) {
    them(MUC.luu_y, 'Khai ' + phieu.phanTram + '% định mức — vượt khá xa một ca.',
      'Làm thêm giờ đều đặn là dấu hiệu việc dồn, không phải dấu hiệu chăm.');
  } else {
    them(MUC.tot, 'Thời lượng khai ' + phieu.phanTram + '% định mức, cân với ca làm.');
  }

  /* ---- 3. cơ cấu việc ---- */
  const tong = dong.reduce((s, d) => s + (d.phut || 0), 0);
  const nhom = new Map();
  for (const d of dong) {
    const k = d.nhom || 'Khác';
    nhom.set(k, (nhom.get(k) || 0) + (d.phut || 0));
  }
  const xep = [...nhom.entries()].map(([ten, phut]) => ({ ten, phut }))
    .sort((a, b) => b.phut - a.phut);

  if (tong > 0 && xep.length) {
    const dau = xep[0];
    const pt = Math.round((dau.phut / tong) * 100);
    if (pt >= NGUONG.domNhom && xep.length > 1) {
      them(MUC.luu_y, dau.ten + ' chiếm ' + pt + '% thời lượng kỳ này.',
        'Còn lại: ' + cauNhom(xep.slice(1, 4)) + '.');
    } else if (xep.length >= 4) {
      them(MUC.luu_y, 'Việc rải ra ' + xep.length + ' nhóm khác nhau.',
        'Nhiều nhất: ' + cauNhom(xep.slice(0, 3)) + '.');
    }
  }

  /* ---- 4. đầu việc đứng yên ---- */
  const dungYen = (boiCanh.dungYen || []).filter((x) => x.soNgay >= NGUONG.ganLau);
  if (dungYen.length) {
    them(MUC.canh,
      dungYen.length + ' đầu việc giữ nguyên tiến độ qua ' +
      Math.max(...dungYen.map((x) => x.soNgay)) + ' ngày báo cáo.',
      dungYen.slice(0, 3).map((x) => x.ten + ' (' + x.pt + '%)').join(' · '));
  }

  /* ---- 5. việc chưa xong nhưng không nói vì sao ---- */
  const doDang = dong.filter((d) => d.trangThai && d.trangThai !== 'Hoàn thành');
  const khongLyDo = doDang.filter((d) => !String(d.tienDo || '').trim());
  if (khongLyDo.length) {
    them(MUC.luu_y, khongLyDo.length + ' việc chưa hoàn thành mà không ghi tiến độ.',
      'Không có dòng tiến độ thì quản lý chỉ thấy việc đứng, không biết đứng vì đâu.');
  }

  /* ---- 6. ngày thiếu (chỉ có nghĩa với kỳ tuần/tháng) ---- */
  const thieu = boiCanh.ngayThieu || [];
  if (thieu.length) {
    them(MUC.canh, 'Thiếu ' + thieu.length + ' ngày báo cáo trong kỳ.',
      thieu.slice(0, 5).map((x) => K.veNgay(x.ms || x)).join(', '));
  }

  /* ---- 7. cần hỗ trợ ---- */
  if (String(phieu.canHoTro || '').trim()) {
    them(MUC.canh, 'Có nêu vướng mắc cần hỗ trợ.', phieu.canHoTro);
  }

  return y;
}

/**
 * Tìm đầu việc "đứng yên": cùng tên việc, tiến độ % không nhúc nhích qua nhiều
 * ngày báo cáo liên tiếp. Đây là thứ ảnh chụp màn hình không bao giờ chỉ ra
 * được, vì muốn thấy nó phải so bảy tấm ảnh với nhau.
 */
function timDungYen(dongTheoNgay) {
  const theoViec = new Map();
  const ngay = [...dongTheoNgay.keys()].sort((a, b) => a - b);
  for (const n of ngay) {
    for (const d of dongTheoNgay.get(n) || []) {
      const khoa = (d.maViec || '') || ('ten:' + String(d.congViec || '').trim().toLowerCase());
      if (!khoa || khoa === 'ten:') continue;
      if (!theoViec.has(khoa)) theoViec.set(khoa, []);
      theoViec.get(khoa).push({ ngay: n, pt: Number(d.tienDoPt) || 0, ten: d.congViec, tt: d.trangThai });
    }
  }
  const ra = [];
  for (const [, ds] of theoViec) {
    if (ds.length < NGUONG.ganLau) continue;
    const cuoi = ds[ds.length - 1];
    if (cuoi.tt === 'Hoàn thành' || cuoi.pt >= 100) continue;
    /* Đếm ngược từ cuối xem bao nhiêu ngày liền cùng một con số. */
    let n = 1;
    for (let i = ds.length - 2; i >= 0 && ds[i].pt === cuoi.pt; i--) n++;
    if (n >= NGUONG.ganLau) ra.push({ ten: cuoi.ten, pt: cuoi.pt, soNgay: n });
  }
  return ra.sort((a, b) => b.soNgay - a.soNgay);
}

/** Một câu gọn cho bảng toàn phòng — quản lý liếc là biết ai cần nhìn kỹ. */
function motCau(y) {
  const canh = y.filter((x) => x.muc === MUC.canh);
  if (canh.length) return canh[0].chu;
  const luu = y.filter((x) => x.muc === MUC.luu_y);
  if (luu.length) return luu[0].chu;
  return y.length ? y[0].chu : 'Chưa đủ dữ liệu để nhận định.';
}

/** Điểm 0–100, thuần số học, để xếp thứ tự bảng toàn phòng. KHÔNG phải điểm KPI. */
function chamDiem(y) {
  let d = 100;
  for (const x of y) {
    if (x.muc === MUC.canh) d -= 20;
    else if (x.muc === MUC.luu_y) d -= 8;
  }
  return Math.max(0, Math.min(100, d));
}

module.exports = { chiMotPhieu, timDungYen, motCau, chamDiem, NGUONG, MUC };
