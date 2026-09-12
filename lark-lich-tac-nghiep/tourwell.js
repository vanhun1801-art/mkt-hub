'use strict';
/**
 * Lớp mỏng quy đổi "một buổi tác nghiệp" thành "một khoản chi" cho module
 * Tourwell dùng chung (`../lark-chung/tourwell.js`).
 *
 * Vì sao tách: app Quỹ chi phí cũng tạo đơn Tourwell khi khai một khoản chi.
 * Hai bản chép đôi thì sửa VAT hay đổi nhà cung cấp một nơi là nơi kia sai lặng
 * lẽ — mà sai đúng vào tiền và vào sổ kế toán.
 *
 * Riêng phần map thì ở lại đây, vì chỉ app này mới biết "tên buổi tác nghiệp"
 * là `title` và "ngày đi" là `start`.
 */
const chung = require('../lark-chung/tourwell');

/** Buổi tác nghiệp -> khoản chi. */
const raKhoan = (lich) => ({
  /* Lịch chưa đặt tên vẫn phải đọc ra là chuyện tác nghiệp, không rơi về chữ
   * chung chung của module dùng chung — kế toán đọc đơn phải biết tiền đi đâu. */
  ten: (lich && lich.title) || 'Tác nghiệp Marketing',
  ngay: lich && lich.start,
  tien: lich && lich.costActual,
});

module.exports = {
  SO: chung.SO,
  GIAN_MS: chung.GIAN_MS,
  docCauHinh: chung.docCauHinh,
  bat: chung.bat,
  ngayVN: chung.ngayVN,

  moTa: (lich) => chung.moTa(raKhoan(lich)),
  thanDon: (lich) => chung.thanDon(raKhoan(lich)),
  thanChiPhi: (lich) => chung.thanChiPhi(raKhoan(lich)),

  /**
   * Tạo đơn cho một lịch tác nghiệp. Người gọi phải tự chốt trước: lịch chưa có
   * mã đơn (bấm hai lần là hai đơn thật) và chi phí thực tế > 0.
   */
  taoDonChoLich: (lich) => chung.taoDon(raKhoan(lich)),
};
