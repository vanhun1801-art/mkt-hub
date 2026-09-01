'use strict';
/**
 * Chạy lượt kéo Tourwell Ở NỀN, rồi cho hỏi tiến độ.
 *
 * Vì sao phải làm vậy chứ không nới giờ tiếp: lượt kéo 60 ngày mất vài phút
 * (hàng chục trang, mỗi lượt giãn 1,5 giây cho đủ giới hạn 60 yêu cầu/phút của
 * Tourwell, cộng thêm những lần phải chờ 429). Đã nới hạn chờ của hub lên 4 phút
 * và VẪN quá. Nới tiếp là sai hướng:
 *   - hub giữ một kết nối treo vài phút, người dùng ngồi nhìn màn hình trắng;
 *   - bấm lại là chạy hai lượt song song, và đó chính là thứ đã gây 429;
 *   - Render ngắt kết nối tự do, mà module thì vẫn chạy tiếp phần việc còn lại.
 *
 * Nên: bấm nút là ĐẶT VIỆC rồi trả lời ngay. Giao diện hỏi tiến độ mỗi vài giây.
 * Việc chạy tiếp kể cả khi người dùng đóng tab, và kết quả nằm trong kho.
 *
 * Chỉ cho MỘT lượt chạy một lúc — bấm thêm thì nhận lại đúng lượt đang chạy chứ
 * không sinh lượt thứ hai.
 */

const MAX_LOG = 200;

let viec = null;

/** Trạng thái hiện tại. Không bao giờ kèm dòng thô — chúng rất nặng. */
function trangThai() {
  if (!viec) return { dangChay: false, coViec: false };
  return {
    dangChay: viec.dangChay,
    coViec: true,
    batDau: viec.batDau,
    xong: viec.xong,
    giay: Math.round(((viec.xong ? Date.parse(viec.xong) : Date.now()) - Date.parse(viec.batDau)) / 1000),
    khoang: viec.khoang,
    log: viec.log.slice(-12),
    soDongLog: viec.log.length,
    kq: viec.kq,
    loi: viec.loi,
  };
}

/**
 * Đặt việc. Trả về ngay, không chờ.
 * @returns {{daChay:boolean}} daChay=true nghĩa là đã có lượt đang chạy, không đặt thêm.
 */
function dat({ conf, from, to, laySdt = false, chay }) {
  if (viec && viec.dangChay) return { daChay: true, ...trangThai() };

  viec = {
    dangChay: true,
    batDau: new Date().toISOString(),
    xong: null,
    khoang: [from, to],
    log: [],
    kq: null,
    loi: null,
  };
  const ghi = (m) => {
    if (viec.log.length < MAX_LOG) viec.log.push(String(m).trim());
  };
  ghi(`bắt đầu kéo ${from} → ${to}` + (laySdt ? ' (kèm số điện thoại)' : ''));

  /* Cố ý KHÔNG await: hàm này phải trả về ngay. Mọi lỗi bắt hết vào viec.loi —
   * để lọt ra ngoài đây là unhandled rejection, tiến trình chết và không ai biết
   * vì sao. */
  Promise.resolve()
    .then(() => chay(conf, from, to, ghi, laySdt))
    .then((kq) => { viec.kq = kq; ghi('xong'); })
    .catch((e) => { viec.loi = e.message; ghi('LỖI: ' + e.message); })
    .then(() => { viec.dangChay = false; viec.xong = new Date().toISOString(); });

  return { daChay: false, ...trangThai() };
}

/** Quên lượt đã xong, để giao diện không hiện mãi kết quả cũ. */
function xoa() {
  if (viec && viec.dangChay) return false;
  viec = null;
  return true;
}

module.exports = { dat, trangThai, xoa };
