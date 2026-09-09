'use strict';
/**
 * BỘ LUẬT KPI — hình dạng dữ liệu và phép kiểm tính hợp lệ.
 *
 * Vì sao tách bộ luật ra khỏi số liệu: file Excel cũ để công thức nằm chung ô với
 * dữ liệu, nên mỗi tháng phải copy một khối 68 dòng, và mỗi lần copy là một lần
 * link rụng — trỏ sang tháng khác, bị dán chữ "#DIV/0!" đè lên, bị gõ số cứng
 * bằng đúng mục tiêu. Ở đây thêm một tháng chỉ là thêm dòng SỐ LIỆU; bộ luật
 * đứng yên, có phiên bản, và tháng đã chốt không bao giờ bị bộ luật mới chạm vào.
 *
 * Một bộ luật gồm:
 *   nhom[]    — nhóm kênh × loại nội dung, mỗi nhóm vài tiêu chí có mục tiêu + tỷ trọng
 *   nguoi[]   — mỗi người một danh sách tiêu chí tính lương, và (nếu ăn theo kênh)
 *               bảng phân bổ tỷ trọng kênh
 *   heSo      — hệ số quy đổi theo mục đích nội dung (Bán hàng / Tương tác)
 *   buView    — luật thưởng/phạt độ đều tay
 *
 * Điểm khác Excel quan trọng nhất: MỌI người dùng chung một hình dạng. Trong Excel
 * có hai kiểu bảng chắp vào nhau (người ăn theo kênh vs người ăn theo SEO/Ads/KOL),
 * nên mỗi lần sửa phải nhớ sửa hai chỗ. Ở đây chỉ có một: `nguoi.tieuChi[].nguon`
 * quyết định điểm lấy từ đâu.
 */

/** Tổng trọng số coi là bằng nhau trong ngưỡng này — tránh bắt lỗi vì 0,1+0,2 !== 0,3. */
const EPS = 1e-6;

/** Ngưỡng gắn cờ "mục tiêu có vẻ sai" khi chốt tháng. Xem `tinh.js`. */
const NGUONG = { cao: 3, thap: 0.2 };

/** Ba kiểu nguồn điểm cho một tiêu chí tính lương của một người. */
const KIEU_NGUON = new Set([
  'kenh',   // gộp từ bảng phân bổ kênh của người đó (Thư, Hằng, Khánh, Trường, Ngọc)
  'chiSo',  // một chỉ số đơn lẻ có sẵn (SEO, Ads, OTA, KOL — Hân, Hùng)
  'tay',    // người chấm (HCNS / Trưởng phòng)
]);

const soHopLe = (v) => typeof v === 'number' && Number.isFinite(v);
const gan = (a, b) => Math.abs(a - b) <= EPS;

/** Khoá định danh một nhóm kênh. Dùng ở cả bộ luật lẫn bảng phân bổ. */
function khoaNhom(n) {
  return [n.kenh, n.tenKenh, n.loai].map((x) => String(x || '').trim()).join('|');
}

/**
 * Soát một bộ luật. Trả về mảng vấn đề; mảng rỗng nghĩa là dùng được.
 * Mỗi vấn đề: { muc: 'chan' | 'canhBao', o, viec }
 *   chan     — sai tới mức không cho chốt tháng
 *   canhBao  — vẫn tính được nhưng phải để người ta nhìn thấy
 *
 * Ba phép kiểm dưới đây vá đúng ba lỗi đã tìm thấy trong file Excel:
 *   tỷ trọng người cộng ra 1,3 thay vì 1,2; tỷ trọng kênh không đủ 100%;
 *   hai người trùng khít bảng phân bổ nên điểm luôn bằng nhau.
 */
function soat(luat) {
  const v = [];
  const chan = (o, viec) => v.push({ muc: 'chan', o, viec });
  const canh = (o, viec) => v.push({ muc: 'canhBao', o, viec });

  if (!luat || typeof luat !== 'object') return [{ muc: 'chan', o: 'bộ luật', viec: 'Không đọc được bộ luật' }];
  if (!luat.tuThang) chan('bộ luật', 'Thiếu tháng bắt đầu hiệu lực');

  /* ---- nhóm kênh ---- */
  const nhom = Array.isArray(luat.nhom) ? luat.nhom : [];
  if (!nhom.length) chan('nhóm kênh', 'Bộ luật chưa có nhóm kênh nào');
  const daThay = new Set();
  nhom.forEach((n) => {
    const k = khoaNhom(n);
    if (daThay.has(k)) chan(k, 'Nhóm kênh bị khai hai lần');
    daThay.add(k);

    const tc = Array.isArray(n.tieuChi) ? n.tieuChi : [];
    if (!tc.length) { chan(k, 'Nhóm không có tiêu chí nào'); return; }

    /* Tỷ trọng các tiêu chí trong một nhóm phải cộng đủ 100%. Excel để nhóm cộng
     * ra 0,2 (vì một tiêu chí không đo được bị bỏ trống) rồi vẫn tính — nhóm đó
     * mất 80% điểm mà không ai biết. */
    const tong = tc.reduce((s, t) => s + (soHopLe(t.tyTrong) ? t.tyTrong : 0), 0);
    if (!gan(tong, 1)) {
      chan(k, 'Tỷ trọng các tiêu chí cộng ra ' + pt(tong) + ', phải đủ 100%');
    }
    tc.forEach((t) => {
      if (!t.ma) chan(k, 'Một tiêu chí thiếu mã');
      if (!t.nguon) chan(k + ' · ' + (t.ten || t.ma), 'Chưa khai lấy số từ đâu');
      /* Mục tiêu bằng 0 hoặc bỏ trống là cái bẫy chia-cho-0 của Excel. Ở đây chặn
       * thẳng: hoặc đặt mục tiêu thật, hoặc bỏ tiêu chí khỏi nhóm. */
      if (!soHopLe(t.mucTieu) || t.mucTieu <= 0) {
        chan(k + ' · ' + (t.ten || t.ma), 'Mục tiêu phải là số lớn hơn 0');
      }
    });
  });

  /* ---- người ---- */
  const nguoi = Array.isArray(luat.nguoi) ? luat.nguoi : [];
  if (!nguoi.length) chan('nhân sự', 'Bộ luật chưa có người nào');
  const maNguoi = new Set();
  nguoi.forEach((ng) => {
    const ten = ng.ten || ng.ma || '(không tên)';
    if (!ng.ma) chan(ten, 'Thiếu mã người');
    if (maNguoi.has(ng.ma)) chan(ten, 'Mã người bị trùng');
    maNguoi.add(ng.ma);

    const tc = Array.isArray(ng.tieuChi) ? ng.tieuChi : [];
    if (!tc.length) { chan(ten, 'Chưa khai tiêu chí tính lương nào'); return; }
    tc.forEach((t) => {
      if (!soHopLe(t.trongSo)) chan(ten + ' · ' + (t.ten || t.ma), 'Trọng số không phải số');
      const kieu = t.nguon && t.nguon.kieu;
      if (!KIEU_NGUON.has(kieu)) {
        chan(ten + ' · ' + (t.ten || t.ma), 'Kiểu nguồn "' + kieu + '" không hợp lệ');
      }
      if (kieu === 'chiSo' && !t.nguon.ma) {
        chan(ten + ' · ' + (t.ten || t.ma), 'Nguồn chỉ số chưa khai mã');
      }
    });

    /* Tổng trọng số của một người. Không ép bằng 1: mô hình hiện tại cố ý cho
     * tổng 1,2 (tiêu chí "Đóng góp" 0,3 là phần thưởng thêm). Nhưng mọi người
     * phải BẰNG NHAU — Excel có một người ra 1,3 nên tự nhiên được cộng thêm 0,1. */
    ng._tongTrongSo = tc.reduce((s, t) => s + (soHopLe(t.trongSo) ? t.trongSo : 0), 0);

    /* Bảng phân bổ kênh — chỉ bắt buộc khi người này có tiêu chí ăn theo kênh. */
    const anTheoKenh = tc.some((t) => t.nguon && t.nguon.kieu === 'kenh');
    const pb = ng.kenh || {};
    if (anTheoKenh) {
      const tong = Object.values(pb).reduce((s, x) => s + (soHopLe(x) ? x : 0), 0);
      if (!gan(tong, 1)) {
        chan(ten, 'Tỷ trọng kênh cộng ra ' + pt(tong) + ', phải đủ 100%');
      }
      Object.keys(pb).forEach((k) => {
        if (!daThay.has(k)) chan(ten, 'Được phân bổ vào nhóm không tồn tại: ' + k);
      });
    } else if (Object.keys(pb).length) {
      canh(ten, 'Có bảng phân bổ kênh nhưng không có tiêu chí nào ăn theo kênh — bảng này bị bỏ qua');
    }
  });

  const tongs = nguoi.map((n) => n._tongTrongSo).filter(soHopLe);
  if (tongs.length > 1) {
    const chuan = tongs[0];
    nguoi.forEach((ng) => {
      if (soHopLe(ng._tongTrongSo) && !gan(ng._tongTrongSo, chuan)) {
        chan(ng.ten || ng.ma,
          'Tổng trọng số ' + so(ng._tongTrongSo) + ' khác người khác (' + so(chuan) + ')');
      }
    });
  }

  /* Hai người trùng khít bảng phân bổ thì điểm luôn bằng nhau — gần như chắc chắn
   * là lỗi copy, như trường hợp Ngọc trùng Thư suốt tháng 4 đến tháng 7. */
  for (let i = 0; i < nguoi.length; i += 1) {
    for (let j = i + 1; j < nguoi.length; j += 1) {
      const a = nguoi[i]; const b = nguoi[j];
      if (!a.kenh || !b.kenh) continue;
      const ka = Object.keys(a.kenh).filter((k) => a.kenh[k]);
      const kb = Object.keys(b.kenh).filter((k) => b.kenh[k]);
      if (!ka.length || ka.length !== kb.length) continue;
      if (ka.every((k) => gan(a.kenh[k], b.kenh[k] || 0))) {
        canh((a.ten || a.ma) + ' / ' + (b.ten || b.ma),
          'Hai người có bảng phân bổ kênh giống hệt nhau nên điểm sẽ luôn bằng nhau');
      }
    }
  }

  nguoi.forEach((n) => { delete n._tongTrongSo; });
  return v;
}

const so = (n) => (Math.round(n * 1000) / 1000).toString().replace('.', ',');
const pt = (n) => (Math.round(n * 1000) / 10).toString().replace('.', ',') + '%';

/** Hệ số quy đổi cho một mục đích nội dung ở một nhóm kênh. */
function heSo(luat, khoa, mucDich) {
  const h = (luat && luat.heSo) || {};
  const rieng = (h.theoNhom || {})[khoa];
  if (rieng && soHopLe(rieng[mucDich])) return rieng[mucDich];
  const md = h.macDinh || {};
  return soHopLe(md[mucDich]) ? md[mucDich] : 1;
}

/** Bộ luật rỗng đúng hình dạng — dùng khi tạo bộ luật mới trên giao diện. */
function boLuatMoi(tuThang) {
  return {
    id: 'bl-' + tuThang,
    ten: 'Bộ luật từ tháng ' + tuThang,
    tuThang,
    denThang: null,
    heSo: { macDinh: { 'Bán hàng': 1, 'Tương tác': 0.2 }, theoNhom: {} },
    buView: { bat: true, chiaNguong: 2, tyLeChoPhep: 0.5 },
    nhom: [],
    nguoi: [],
  };
}

module.exports = { soat, khoaNhom, heSo, boLuatMoi, NGUONG, EPS, KIEU_NGUON };
