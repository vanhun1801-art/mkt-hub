'use strict';
/**
 * ============================================================================
 * CỬA SỔ ĐĂNG KÝ — nút đăng ký chỉ mở trong một khung giờ mỗi tuần
 * ============================================================================
 * Chỗ kẹt anh Hùng nêu: nút đăng ký mở liên tục, nhân sự thêm lịch bất kỳ lúc
 * nào, nên anh phải xử lý lịch rải rác cả tuần. Nếp anh đang làm bằng tay là
 * nhắn cho cả phòng: mở 15:00 thứ 6, đóng 12:00 thứ 7, phần còn lại của ngày
 * thứ 7 anh xếp việc cho tuần sau.
 *
 * Tệp này chỉ làm một việc: trả lời "bây giờ mở hay đóng, và mốc kế tiếp là
 * lúc nào". Tách riêng vì nó là chỗ dễ sai nhất của cả cơ chế:
 *
 *   1. Phải tính theo giờ VIỆT NAM. Render chạy UTC — app này đã có một lỗi
 *      đúng kiểu đó, 16 lịch rơi sai cột ngày.
 *   2. Cửa sổ VẮT QUA tuần được: "mở 15:00 T7, đóng 12:00 T2" là hợp lệ. So
 *      kiểu `mo <= nay && nay < dong` sẽ luôn ra ĐÓNG trong trường hợp đó.
 *   3. Sai một tiếng ở đây nghĩa là nhân sự bấm vào nút và bị chặn, hoặc đăng
 *      ký được đúng lúc anh đang xếp việc — cả hai đều không có gì báo.
 *
 * Cách tính: đổi mọi mốc về "số phút kể từ 00:00 thứ Hai, giờ VN" (0..10079).
 * Trên trục đó cửa sổ chỉ còn hai dạng — thường và vắt qua mốc 0.
 */

const LECH_VN = 7 * 3600000;          // VN = UTC+7, không có giờ mùa hè
const PHUT = 60000;
const TUAN = 7 * 24 * 60;             // số phút một tuần

/**
 * Số thứ theo chuẩn ISO: 1 = thứ Hai … 7 = Chủ nhật.
 *
 * ĐỌC KỸ CHỖ NÀY. Tên tiếng Việt lệch một so với số: "Thứ 6" là ISO **5**, không
 * phải 6. Bản đầu tôi khai moThu = 6 với ý "thứ 6" và cả cơ chế lệch đúng một
 * ngày — cửa sổ chạy T7→CN thay vì T6→T7, mà trên màn hình vẫn hiện ra một câu
 * đọc thấy hợp lý. Nên dùng THU_SO để tra chứ đừng gõ số bằng tay.
 */
const THU = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const THU_SO = {
  'Thứ 2': 1, 'Thứ 3': 2, 'Thứ 4': 3, 'Thứ 5': 4,
  'Thứ 6': 5, 'Thứ 7': 6, 'Chủ nhật': 7,
};

/** Luật mặc định — đúng nếp anh Hùng đang nhắn tay cho cả phòng. */
const MAC_DINH = {
  bat: true,
  moThu: THU_SO['Thứ 6'], moGio: '15:00',
  dongThu: THU_SO['Thứ 7'], dongGio: '12:00',
  moTayToi: 0,
  dongTayToi: 0,
};

/** "15:00" -> 900 phút. Sai định dạng thì trả null để chỗ gọi biết mà bỏ qua. */
function docGio(s) {
  const m = /^\s*(\d{1,2})\s*[:h]\s*(\d{1,2})?\s*$/.exec(String(s == null ? '' : s));
  if (!m) return null;
  const gio = Number(m[1]);
  const phut = Number(m[2] || 0);
  if (gio > 23 || phut > 59) return null;
  return gio * 60 + phut;
}

const veGio = (p) => String(Math.floor(p / 60)).padStart(2, '0') + ':' + String(p % 60).padStart(2, '0');

/**
 * Mốc thời gian -> số phút kể từ 00:00 thứ Hai theo giờ VN.
 *
 * getUTCDay() trên mốc đã cộng lệch VN cho ra thứ theo giờ VN; 0 là Chủ nhật
 * nên đổi thành 7 để thứ Hai = 1 và cả tuần xếp liền mạch.
 */
function phutTrongTuan(ms) {
  const d = new Date(ms + LECH_VN);
  const thu = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return (thu - 1) * 24 * 60 + d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Gộp luật đã khai với mặc định, và chuẩn hoá về số. */
function chuanLuat(raw) {
  const r = raw || {};
  const soThu = (v, md) => {
    const n = Number(v);
    return n >= 1 && n <= 7 ? n : md;
  };
  const gio = (v, md) => {
    const p = docGio(v);
    return p == null ? docGio(md) : p;
  };
  return {
    bat: r.bat !== false,
    moThu: soThu(r.moThu, MAC_DINH.moThu),
    moPhut: gio(r.moGio, MAC_DINH.moGio),
    dongThu: soThu(r.dongThu, MAC_DINH.dongThu),
    dongPhut: gio(r.dongGio, MAC_DINH.dongGio),
    moTayToi: Number(r.moTayToi) || 0,
    dongTayToi: Number(r.dongTayToi) || 0,
  };
}

/**
 * Bây giờ (hoặc `luc`) nút đăng ký mở hay đóng.
 *
 * Trả về:
 *   mo       — mở hay không
 *   vi       — vì sao (để giao diện nói thẳng, không bắt người ta đoán)
 *   moLuc    — mốc mở KẾ TIẾP (ms), khi đang đóng
 *   dongLuc  — mốc đóng của cửa sổ đang mở (ms), khi đang mở
 *
 * Thứ tự xét CÓ Ý NGHĨA: hai nút tay đứng trước lịch tự động, vì chúng là câu
 * "tôi quyết thế" của quản lý — đặt sau thì bấm mở tay xong vẫn bị lịch đóng
 * lại, và không ai hiểu vì sao.
 */
function trangThai(raw, luc) {
  const L = chuanLuat(raw);
  const t = luc == null ? Date.now() : luc;

  if (!L.bat) {
    return { mo: true, vi: 'Cơ chế đang tắt — nút đăng ký mở liên tục.', luat: L };
  }
  if (L.dongTayToi && t < L.dongTayToi) {
    return { mo: false, vi: 'Quản lý đang đóng tay.', moLuc: L.dongTayToi, luat: L, tay: 'dong' };
  }
  if (L.moTayToi && t < L.moTayToi) {
    return { mo: true, vi: 'Quản lý đang mở tay.', dongLuc: L.moTayToi, luat: L, tay: 'mo' };
  }

  const nay = phutTrongTuan(t);
  const mo = (L.moThu - 1) * 24 * 60 + L.moPhut;
  const dong = (L.dongThu - 1) * 24 * 60 + L.dongPhut;

  /* Hai dạng cửa sổ. `vat` là khi mốc đóng nằm TRƯỚC mốc mở trên trục tuần —
   * ví dụ mở 15:00 T7, đóng 12:00 T2. So thẳng `mo <= nay && nay < dong` thì
   * dạng này luôn ra ĐÓNG, cả tuần không mở nổi một lần. */
  const vat = dong <= mo;
  const dangMo = vat ? (nay >= mo || nay < dong) : (nay >= mo && nay < dong);

  /* Quy về mốc tuyệt đối: lấy mốc đầu tuần (00:00 thứ Hai giờ VN) rồi cộng phút.
   * Tính kiểu này không phụ thuộc giờ máy, và không lệch khi qua mốc nửa đêm. */
  const dauTuan = t - nay * PHUT;
  const tron = (x) => Math.floor(x / PHUT) * PHUT;
  const mocMo = tron(dauTuan + mo * PHUT);
  const mocDong = tron(dauTuan + dong * PHUT);

  if (dangMo) {
    // đang mở: mốc đóng là lần tới, có thể thuộc tuần sau nếu cửa sổ vắt qua
    const d = mocDong > t ? mocDong : mocDong + TUAN * PHUT;
    return { mo: true, vi: 'Đang trong khung đăng ký.', dongLuc: d, luat: L };
  }
  const m = mocMo > t ? mocMo : mocMo + TUAN * PHUT;
  return {
    mo: false,
    vi: 'Ngoài khung đăng ký (' + THU[L.moThu] + ' ' + veGio(L.moPhut) +
        ' → ' + THU[L.dongThu] + ' ' + veGio(L.dongPhut) + ').',
    moLuc: m,
    luat: L,
  };
}

/** "Thứ 6 15:00 ngày 12/09" — câu người đọc hiểu ngay, theo giờ VN. */
function noiMoc(ms) {
  if (!ms) return '';
  const d = new Date(Number(ms) + LECH_VN);
  const thu = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const p2 = (n) => String(n).padStart(2, '0');
  return THU[thu] + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) +
    ' ngày ' + p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1);
}

module.exports = {
  LECH_VN, THU, THU_SO, MAC_DINH,
  docGio, veGio, phutTrongTuan, chuanLuat, trangThai, noiMoc,
};
