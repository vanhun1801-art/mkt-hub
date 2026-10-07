'use strict';
/**
 * Ghi doanh thu Tourwell lên Base, bảng "Báo cáo Sales (theo ngày)".
 *
 * Hai việc trong một:
 *   1. **Sao lưu.** Kho lead/đơn nằm trên ổ đĩa tạm của Render nên mất sau mỗi
 *      lần deploy. Base thì còn mãi, và xem lại được bằng chính giao diện Lark.
 *   2. **Làm sống tab Doanh thu.** Bốn ô số ở đầu tab đó đọc THẲNG bảng này; bảng
 *      rỗng nên tất cả hiện 0đ. Không phải tab hỏng — chỉ là chưa có ai ghi vào.
 *
 * Ba quy tắc bắt buộc, đều để không phá dữ liệu của người khác:
 *
 * - **Chỉ ghi những ô select có option SẴN CÓ.** Ghi một option lạ vào select là
 *   Lark tự thêm option đó vào schema. Cột "Tên dịch vụ sử dụng" có 6 option là
 *   tên tour cụ thể, tên dịch vụ bên Tourwell không khớp — nên KHÔNG ghi cột đó.
 * - **Khoá là `⚙️ Mã đơn Tourwell`.** Ghi lại lần nữa thì SỬA đúng dòng cũ chứ
 *   không sinh dòng trùng. Không có khoá thì mỗi lượt ghi là nhân đôi bảng.
 * - **Không bao giờ xoá dòng nào.** Đơn biến mất khỏi Tourwell thì báo ra, để
 *   người đọc tự quyết, chứ không tự tay dọn.
 */

const { NHAN_LY_DO } = require('./roas');

const CHUAN_KENH = ['Facebook', 'TikTok', 'Google Ads', 'Khác'];
const CHUAN_TRANG_THAI = ['Đã chốt', 'Đang tư vấn', 'Hủy'];

/** Kênh phải là một trong bốn option có sẵn; không rõ thì 'Khác'. */
/** Ba kênh được coi là "đã ghi công được" — dùng để không hạ cấp dòng đã có. */
const LA_KENH_QC = ['Facebook', 'TikTok', 'Google Ads'];

function kenh(v) {
  const s = String(v == null ? '' : v).trim();
  if (CHUAN_KENH.includes(s)) return s;
  if (/face/i.test(s)) return 'Facebook';
  if (/tiktok|tik tok/i.test(s)) return 'TikTok';
  if (/google/i.test(s)) return 'Google Ads';
  return 'Khác';
}

/**
 * Trạng thái Tourwell → một trong ba option có sẵn.
 * Đi theo dấu vết cụ thể chứ không tin mỗi chuỗi `status`, vì mình chưa biết hết
 * các giá trị Tourwell dùng.
 */
function trangThai(don) {
  const s = String((don && don.trangThai) || '').toLowerCase();
  /* Tiếng Việt đặt dấu ở nhiều vị trí khác nhau: "hủy" là h+ủ+y, "huỷ" là h+u+ỷ.
   * Mẫu đầu tiên của tôi viết `hu[ỷy]` nên bỏ sót "hủy" — dạng phổ biến nhất. */
  if (/h[uủ][yỷ]|cancel|cancell?ed/.test(s)) return 'Hủy';
  if (don && don.ngayHuy) return 'Hủy';
  if (CHUAN_TRANG_THAI.includes(don && don.trangThai)) return don.trangThai;
  // Có tiền và không bị huỷ thì coi là đã chốt — đó là định nghĩa mà bốn ô số
  // ở đầu tab Doanh thu đang dùng ("đơn đã chốt").
  if (don && Number(don.tien) > 0) return 'Đã chốt';
  return 'Đang tư vấn';
}

/** 'YYYY-MM-DD' → chuỗi datetime của Base, 00:00 giờ Việt Nam. */
function gioBase(ngay) {
  const m = String(ngay || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 7 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Một đơn Tourwell → các ô sẽ ghi vào Base.
 * @param don  dòng đơn (hình dạng của sync/tourwell.js hoặc tourwellapi.js)
 * @param ghiCong  { platform, tenQC, maLead } — kết quả ghi công quảng cáo, nếu có
 */
function dongBase(don, ghiCong, F) {
  const gc = ghiCong || {};
  const ghiChu = [
    don.ma ? `Đơn ${don.ma}` : '',
    gc.maLead ? `lead ${gc.maLead}` : '',
    gc.tenQC ? `QC: ${gc.tenQC}` : '',
    // Không ghép được QC thì ghi rõ VÌ SAO — để 'Khác' đọc được, không phải một
    // nhãn trơ. Chỉ có khi phép ghi công tính ra lý do (không phải mọi lượt ghi
    // đều đi qua đường có tính lý do, xem tinhGhiCong() ở server.js).
    (!gc.platform && gc.lyDo) ? `Khác: ${NHAN_LY_DO[gc.lyDo] || gc.lyDo}` : '',
    don.ban ? `sales: ${don.ban}` : '',
    don.nguon ? `nguồn Tourwell: ${don.nguon}` : '',
  ].filter(Boolean).join(' · ');

  const o = {};
  o[F.orderCode] = String(don.ma || '');
  o[F.revenue] = Number(don.tien) || 0;
  o[F.customer] = String(don.khach || '');
  o[F.status] = trangThai(don);
  /* Kênh lấy từ phép GHI CÔNG, không lấy từ trường Nguồn của Tourwell — đã chứng
   * minh trường đó sai (996/1000 lead cùng một nhãn, và hai ca cụ thể sai hẳn
   * kênh). Không ghi công được thì để 'Khác' chứ không đoán. */
  o[F.channel] = kenh(gc.platform || '');
  const t = gioBase(don.ngayXong || don.ngay);
  if (t) o[F.time] = t;
  if (don.sdt) o[F.phone] = String(don.sdt);
  o[F.note] = ghiChu.slice(0, 900);
  return o;
}

/**
 * Dựng danh sách việc cần ghi. KHÔNG gọi mạng — để test được và để xem trước.
 *
 * @param donRows   đơn Tourwell
 * @param ghiCongTheoDon  Map(mã đơn -> { platform, tenQC, maLead })
 * @param daCo      Map(mã đơn -> record_id) những dòng Base đã có
 */
/**
 * @param {boolean} ghiCongHong  Phép ghi công KHÔNG chạy được lượt này (Pancake
 *   hoặc POS lỗi). Khác hẳn với "chạy được nhưng không ghép ra gì": lượt hỏng
 *   thì app KHÔNG BIẾT GÌ, nên không được phép viết 'Khác' đè lên cột Kênh của
 *   bất kỳ dòng nào. Đo 07/10/2026: Pancake trả "An error occurred" ba lần liên
 *   tiếp, mà lượt ghi công chạy mỗi 2 giờ — mỗi lượt như thế là một lượt xoá.
 */
function lenKeHoach({ donRows = [], ghiCongTheoDon = new Map(), daCo = new Map(), F,
  ghiCongHong = false }) {
  const taoMoi = [];
  const capNhat = [];
  const boQua = [];
  const giuKenh = [];
  const thay = new Set();

  donRows.forEach((don) => {
    const ma = String((don && don.ma) || '').trim();
    if (!ma) { boQua.push({ ly: 'không có mã đơn' }); return; }
    if (thay.has(ma)) { boQua.push({ ma, ly: 'trùng trong dữ liệu nguồn' }); return; }
    thay.add(ma);
    const gc = ghiCongTheoDon.get(ma);
    const fields = dongBase(don, gc, F);
    const rec = daCo.get(ma);
    const cu = rec && typeof rec === 'object' ? rec : null;
    const recId = cu ? cu.id : rec;

    if (recId) {
      /* KHÔNG HẠ CẤP một dòng đã ghi công được.
       *
       * Đã trả giá 07/10/2026: lượt ghi công chạy mỗi 2 giờ, mà lượt nào thiếu
       * dữ liệu (Pancake lỗi, hoặc lead về không có số điện thoại) thì mọi đơn
       * ra 'Khác' — và vì dòng nào cũng được ghi đè, một lượt kém xoá sạch kết
       * quả của lượt tốt trước đó. Tháng 9 từ 19 đơn ghi công được còn 4.
       *
       * Luật: đã có kênh quảng cáo thật trên Base mà lượt này không ghép được,
       * thì GIỮ NGUYÊN cả ô Kênh lẫn ô Ghi chú — giữ luôn ghi chú vì nó chứa tên
       * quảng cáo và mã lead, bỏ đi là mất dấu vết. Ghép được thì vẫn ghi đè như
       * thường: thông tin mới luôn thắng thông tin cũ. */
      const dangCoKenhThat = cu && LA_KENH_QC.includes(String(cu.kenh || '').trim());
      if (ghiCongHong || (dangCoKenhThat && !(gc && gc.platform))) {
        delete fields[F.channel];
        delete fields[F.note];
        giuKenh.push(ma);
      }
      capNhat.push({ record_id: recId, fields });
    } else {
      /* Dòng mới mà lượt ghi công hỏng: để TRỐNG ô Kênh, đừng gắn 'Khác'.
       * 'Khác' nghĩa là "đã xét và không phải quảng cáo" — một lượt hỏng chưa
       * xét gì cả, nói 'Khác' là nói thay cho thứ mình không biết. Lượt sau
       * chạy được sẽ điền vào. */
      if (ghiCongHong) { delete fields[F.channel]; delete fields[F.note]; }
      taoMoi.push({ fields });
    }
  });

  // Dòng có trong Base mà nguồn không còn: BÁO ra, không tự xoá.
  const khongConNguon = [...daCo.keys()].filter((ma) => !thay.has(ma));

  return { taoMoi, capNhat, boQua, khongConNguon, giuKenh };
}

/** Tóm tắt để hiện trước khi ghi thật. */
function tomTat(kh) {
  const tien = (ds) => ds.reduce((a, x) => a + (Number(Object.values(x.fields).find((v) => typeof v === 'number')) || 0), 0);
  return {
    taoMoi: kh.taoMoi.length,
    capNhat: kh.capNhat.length,
    boQua: kh.boQua.length,
    khongConNguon: kh.khongConNguon.length,
    giuKenh: (kh.giuKenh || []).length,
    tongTien: tien(kh.taoMoi) + tien(kh.capNhat),
  };
}

module.exports = { kenh, trangThai, gioBase, dongBase, lenKeHoach, tomTat,
  CHUAN_KENH, CHUAN_TRANG_THAI, LA_KENH_QC };
