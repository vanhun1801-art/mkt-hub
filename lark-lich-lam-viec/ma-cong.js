'use strict';
/**
 * ============================================================================
 * Mã công + lịch chuẩn — toàn bộ luật nghiệp vụ của app nằm ở đây
 * ============================================================================
 * Không gọi Base, không đọc giờ máy: mọi hàm nhận tham số và trả kết quả, nên
 * phép thử chạy được mà không cần mạng.
 *
 * Bảng mã chép từ phần chú thích cuối tab "LLV 09.2026" của HCNS (dòng 103+).
 * Chỉ lấy những mã khối văn phòng dùng — ca S/C/SC là của kinh doanh.
 */

/* lam  = phần ngày có đi làm (1 · 0,5 · 0)
 * luong = phần ngày được tính lương dù không đi làm (lễ, phép, hiếu hỉ)
 * Hai số tách nhau vì câu hỏi của quản lý là "hôm đó có người không", còn câu
 * hỏi của HCNS là "tháng này bao nhiêu công tính lương". */
const DANH_SACH = [
  { ma: 'x',     ten: 'Đi làm cả ngày',          lam: 1,   luong: 0 },
  { ma: 'x/2',   ten: 'Làm nửa ngày',            lam: 0.5, luong: 0 },
  { ma: 'OFF',   ten: 'Nghỉ hằng tuần',          lam: 0,   luong: 0 },
  { ma: 'NP',    ten: 'Nghỉ phép năm',           lam: 0,   luong: 1 },
  { ma: 'NP/2',  ten: 'Nửa ngày phép',           lam: 0.5, luong: 0.5 },
  { ma: 'KL',    ten: 'Nghỉ không lương',        lam: 0,   luong: 0 },
  { ma: 'NL',    ten: 'Nghỉ lễ',                 lam: 0,   luong: 1 },
  { ma: 'L',     ten: 'Làm ngày lễ (x2)',        lam: 1,   luong: 0 },
  { ma: 'L/2',   ten: 'Làm nửa ngày lễ',         lam: 0.5, luong: 0 },
  { ma: 'LVOFF', ten: 'Làm ngày OFF (x2)',       lam: 1,   luong: 0 },
  { ma: 'CT',    ten: 'Công tác',                lam: 1,   luong: 0 },
  { ma: 'TN',    ten: 'Tác nghiệp',              lam: 1,   luong: 0 },
  { ma: 'TL1',   ten: 'Hiếu (ông bà, anh chị em)', lam: 0, luong: 1 },
  { ma: 'TL3',   ten: 'Hiếu (bố mẹ, con)',       lam: 0,   luong: 1 },
  { ma: 'KH',    ten: 'Nghỉ kết hôn',            lam: 0,   luong: 1 },
];
const THEO_MA = new Map(DANH_SACH.map((m) => [m.ma, m]));
const laMa = (m) => THEO_MA.has(m);

const NGAY_MS = 86400000;
const p2 = (n) => String(n).padStart(2, '0');

/** Số ngày của tháng (thang: 1–12). */
const soNgay = (nam, thang) => new Date(Date.UTC(nam, thang, 0)).getUTCDate();

/** Thứ trong tuần theo lịch, 0 = CN … 6 = T7. Dùng UTC để không lệch theo máy. */
const thuCua = (nam, thang, ngay) => new Date(Date.UTC(nam, thang - 1, ngay)).getUTCDay();

const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "2026-10" -> { nam: 2026, thang: 10 }; sai dạng thì null. */
function docThang(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const nam = Number(m[1]), thang = Number(m[2]);
  if (thang < 1 || thang > 12 || nam < 2020 || nam > 2100) return null;
  return { nam, thang };
}
const veThang = (nam, thang) => nam + '-' + p2(thang);
function congThang(s, buoc) {
  const t = docThang(s);
  const i = t.nam * 12 + (t.thang - 1) + buoc;
  return veThang(Math.floor(i / 12), (i % 12) + 1);
}

/**
 * Lịch chuẩn của công ty (anh Hùng chốt theo tháng 9/2026):
 *   Chủ nhật OFF · Thứ 7 thứ HAI và thứ TƯ của tháng làm nửa ngày · còn lại x.
 * Ngày lễ trong bảng "Ngày lễ" thành NL — trừ khi rơi vào Chủ nhật (vẫn OFF,
 * HCNS tự quyết nghỉ bù và khai thành một dòng lễ riêng).
 *
 * "Tuần thứ 2" đếm theo THỨ 7 THỨ MẤY của tháng, không theo tuần lịch: tháng
 * 9/2026 bắt đầu bằng Thứ 3, nếu đếm tuần lịch thì Thứ 7 đầu (05/09) đã là
 * tuần 1 và kết quả vẫn trùng — nhưng tháng bắt đầu bằng Chủ nhật thì hai cách
 * lệch nhau. Sheet HCNS tháng 9 để x/2 đúng ngày 12 và 26, tức Thứ 7 thứ 2 và 4.
 */
function lichChuan(thangS, ngayLe) {
  const { nam, thang } = docThang(thangS);
  const le = new Set(ngayLe || []);
  const out = [];
  let thu7 = 0;
  for (let d = 1; d <= soNgay(nam, thang); d++) {
    const thu = thuCua(nam, thang, d);
    const khoa = veThang(nam, thang) + '-' + p2(d);
    if (thu === 6) thu7 += 1;
    if (thu === 0) out.push('OFF');
    else if (le.has(khoa)) out.push('NL');
    else if (thu === 6 && (thu7 === 2 || thu7 === 4)) out.push('x/2');
    else out.push('x');
  }
  return out;
}

/** Cộng một dãy mã công của tháng. */
function tinh(thangS, ma, ngayLe) {
  const chuan = lichChuan(thangS, ngayLe);
  const cong = (ds, k) => ds.reduce((s, m) => s + ((THEO_MA.get(m) || {})[k] || 0), 0);
  const congChuan = cong(chuan, 'lam') + cong(chuan, 'luong');
  const lam = cong(ma, 'lam');
  const luong = cong(ma, 'luong');
  const dem = (m) => ma.filter((x) => x === m).length;
  /* Ngày nghỉ = phần ngày KHÔNG đi làm, bỏ qua ngày mà lịch chuẩn vốn đã nghỉ
   * (Chủ nhật, lễ, nửa ngày T7). Không bỏ thì ai cũng "nghỉ 5,5 ngày" mỗi tháng
   * và con số chẳng nói gì. */
  const nghi = ma.reduce((s, m, i) => {
    const c = THEO_MA.get(chuan[i]);
    const t = THEO_MA.get(m);
    return c && t ? s + Math.max(0, c.lam - t.lam) : s;
  }, 0);
  return {
    congChuan,
    tongCong: lam + luong,
    lam,
    nghi,
    phep: dem('NP') + dem('NP/2') * 0.5,
    khongLuong: dem('KL'),
    lamNgayNghi: dem('LVOFF') + dem('L') + dem('L/2') * 0.5,
  };
}

/**
 * Ngày đó người này vắng bao nhiêu: 'ca' (cả ngày) · 'nua' · '' (có mặt).
 * Đây là thứ bản đồ nhiệt của hub hiển thị.
 */
function mucVang(ma) {
  const t = THEO_MA.get(ma);
  if (!t) return '';
  if (t.lam === 0) return 'ca';
  if (t.lam < 1) return 'nua';
  return '';
}

/**
 * Những điều nên nói với người đăng ký trước khi họ bấm Nộp. Không chặn — HCNS
 * mới là nơi quyết — chỉ để lỗi gõ nhầm không đi tới tận bảng lương.
 */
function canhBao(thangS, ma, ngayLe) {
  const { nam, thang } = docThang(thangS);
  const le = new Set(ngayLe || []);
  const out = [];
  ma.forEach((m, i) => {
    const d = i + 1;
    const thu = thuCua(nam, thang, d);
    const khoa = veThang(nam, thang) + '-' + p2(d);
    const nhan = THU[thu] + ' ' + p2(d) + '/' + p2(thang);
    if (!laMa(m)) out.push(nhan + ': chưa chọn mã công');
    else if (thu === 0 && (m === 'x' || m === 'x/2')) out.push(nhan + ' là Chủ nhật — đi làm thì chọn LVOFF (tính x2)');
    else if (le.has(khoa) && (m === 'x' || m === 'x/2')) out.push(nhan + ' là ngày lễ — đi làm thì chọn L hoặc L/2');
  });
  const t = tinh(thangS, ma, ngayLe);
  if (t.tongCong < t.congChuan) {
    out.push('Tổng công ' + String(t.tongCong).replace('.', ',') + ' thấp hơn công chuẩn ' + t.congChuan +
      ' — ngày nghỉ ngoài lịch chuẩn nên ghi rõ NP (phép) hay KL (không lương)');
  }
  return out;
}

/** Ngày giờ Việt Nam (UTC+7) của một mốc ms, không phụ thuộc máy chạy. */
function vn(ms) {
  const d = new Date(ms + 7 * 3600000);
  return { nam: d.getUTCFullYear(), thang: d.getUTCMonth() + 1, ngay: d.getUTCDate() };
}

/**
 * Tháng mà người dùng đang phải đăng ký, hoặc '' nếu chưa tới lúc.
 *
 * Từ ngày 29 trở đi: tháng SAU. Từ 01 tới 28: chính tháng này — tức ai lỡ ngày
 * 29 thì sang đầu tháng vẫn bị nhắc tiếp, đúng yêu cầu "hiện cho đến khi xong
 * đăng ký mới tắt". `batDau` chặn những tháng trước khi có app, nếu không hôm
 * dựng xong cả phòng bị đòi đăng ký bù tháng đang chạy dở.
 */
function thangPhaiDangKy(ms, batDau) {
  const t = vn(ms);
  /* Tháng 2 thường chỉ có 28 ngày — không có ngày 29 thì nhắc từ ngày cuối. */
  const moc = Math.min(29, soNgay(t.nam, t.thang));
  const thang = t.ngay >= moc ? congThang(veThang(t.nam, t.thang), 1) : veThang(t.nam, t.thang);
  return batDau && thang < batDau ? '' : thang;
}

/* ---------------- kỳ đăng ký cố định ----------------
 * Anh Hùng (23/09/2026): đăng ký mở vào một giờ cố định (mặc định 09:00 ngày
 * 29) và đóng ngày hôm sau. Trong kỳ, ai chưa nộp bị khoá mọi app khác của hub.
 * Cấu hình đọc từ bảng "Cấu hình" trên Base, quản lý chỉnh ở tab Thành viên. */
const CAU_HINH_MAC_DINH = Object.freeze({ ngayMo: 29, gioMo: '09:00', dongSauNgay: 1, gioDong: '23:59', batBuoc: true });

const laGio = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));

/** Kiểm + chuẩn hoá cấu hình; trả { ch } hoặc { loi }. */
function kiemCauHinh(o) {
  const ch = Object.assign({}, CAU_HINH_MAC_DINH, o || {});
  ch.ngayMo = Number(ch.ngayMo);
  ch.dongSauNgay = Number(ch.dongSauNgay);
  ch.batBuoc = ch.batBuoc === true || ch.batBuoc === 1 || ch.batBuoc === '1' || ch.batBuoc === 'true';
  if (!Number.isInteger(ch.ngayMo) || ch.ngayMo < 1 || ch.ngayMo > 31) return { loi: 'Ngày mở phải từ 1 tới 31.' };
  if (!laGio(ch.gioMo) || !laGio(ch.gioDong)) return { loi: 'Giờ phải dạng HH:MM (ví dụ 09:00).' };
  if (!Number.isInteger(ch.dongSauNgay) || ch.dongSauNgay < 0 || ch.dongSauNgay > 10) return { loi: 'Đóng sau 0–10 ngày.' };
  if (ch.dongSauNgay === 0 && ch.gioDong <= ch.gioMo) return { loi: 'Đóng cùng ngày thì giờ đóng phải sau giờ mở.' };
  return { ch };
}

/** Mốc ms của giờ VN "HH:MM" ngày (nam, thang, ngay) — ngày vượt cuối tháng tự tràn sang tháng sau. */
const mocVN = (nam, thang, ngay, gio, cuoiPhut) => {
  const [h, m] = gio.split(':').map(Number);
  return Date.UTC(nam, thang - 1, ngay, h, m) - 7 * 3600000 + (cuoiPhut ? 59999 : 0);
};

/** Kỳ đăng ký mở trong tháng (nam, thang) — để đăng ký cho tháng SAU. */
function kyCuaThang(nam, thang, ch) {
  const ngay = Math.min(ch.ngayMo, soNgay(nam, thang));
  return {
    thang: congThang(veThang(nam, thang), 1),
    mo: mocVN(nam, thang, ngay, ch.gioMo),
    /* hết phút đóng: "23:59" nghĩa là tới 23:59:59 */
    dong: mocVN(nam, thang, ngay + ch.dongSauNgay, ch.gioDong, true),
  };
}

/**
 * Kỳ đăng ký liên quan tới thời điểm `ms`: kỳ đang mở, hoặc kỳ SẮP mở.
 * Xét cả kỳ của tháng trước — mở ngày 31 đóng sau một ngày thì kỳ đó còn chạy
 * sang mùng 1 tháng này.
 */
function cuaSo(ms, chVao) {
  const ch = kiemCauHinh(chVao).ch || CAU_HINH_MAC_DINH;
  const t = vn(ms);
  const truoc = congThang(veThang(t.nam, t.thang), -1);
  const ky = [truoc, veThang(t.nam, t.thang), congThang(veThang(t.nam, t.thang), 1)].map((s) => {
    const x = docThang(s);
    return kyCuaThang(x.nam, x.thang, ch);
  });
  const mo = ky.find((k) => ms >= k.mo && ms <= k.dong);
  if (mo) return Object.assign({ dangMo: true, batBuoc: ch.batBuoc }, mo);
  const sap = ky.find((k) => k.mo > ms);
  return Object.assign({ dangMo: false, batBuoc: ch.batBuoc }, sap);
}

/** Tháng nên mở sẵn khi vào app: kỳ đang mở thì tháng đó; kỳ tháng này đã qua thì tháng sau; còn lại tháng này. */
function thangXem(ms, ch) {
  const cs = cuaSo(ms, ch);
  const t = vn(ms);
  const nay = veThang(t.nam, t.thang);
  if (cs.dangMo) return cs.thang;
  const kyNay = kyCuaThang(t.nam, t.thang, kiemCauHinh(ch).ch || CAU_HINH_MAC_DINH);
  return ms > kyNay.dong ? congThang(nay, 1) : nay;
}

module.exports = {
  CAU_HINH_MAC_DINH, kiemCauHinh, cuaSo, thangXem,
  DANH_SACH, THEO_MA, THU, laMa, soNgay, thuCua, docThang, veThang, congThang,
  lichChuan, tinh, mucVang, canhBao, vn, thangPhaiDangKy, NGAY_MS,
};
