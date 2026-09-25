'use strict';
/**
 * ============================================================================
 * ĐỒNG HỒ NHỊP GỌI LARK — một hạn mức, mười hai app con xin lượt ở đây
 * ============================================================================
 * Anh Hùng 25/09/2026, sau khi Lịch tác nghiệp và KOL cùng báo
 * `99991400 request trigger frequency limit` trong cùng một phút: "làm luôn
 * luồng đó đi em".
 *
 * VÌ SAO LÙI-RỒI-THỬ-LẠI LÀ CHƯA ĐỦ. Bản trước đã cho mỗi app lùi lâu hơn và
 * lùi lệch nhau, nên va xong thì tản ra được. Nhưng đó là chữa sau khi đã va.
 * Lark tính hạn mức theo APP, mà cả phòng chỉ còn MỘT app Lark dùng chung cho
 * mười hai app con — nên muốn hết va thì phải có một chỗ duy nhất biết "giây
 * này cả nhà đã gọi mấy lần rồi".
 *
 * ĐỒNG HỒ ẢO, KHÔNG PHẢI GIỎ TOKEN. Giữ đúng một con số: thời điểm sớm nhất
 * được gọi tiếp. Ai xin lượt thì nhận về "chờ bao nhiêu mili giây", rồi mốc ấy
 * nhích lên một khoảng. Cách này cho thứ tự đến trước được trước, không cần hẹn
 * giờ nạp lại giỏ, và lúc rảnh thì mốc tự lùi về hiện tại nên không tích luỹ
 * lượt ảo để rồi cho phép một cú xả cả trăm lời gọi.
 *
 * CHỜ QUÁ LÂU THÌ THÔI, CHO ĐI LUÔN. Hạn mức dùng chung mà có app đang kéo cả
 * kho về thì người xin sau có thể phải chờ hàng chục giây — đứng chờ chừng đó
 * là treo màn hình của người đang ngồi đợi. Quá TRAN_CHO thì trả "đi đi", chịu
 * rủi ro dính 99991400 và để phép lùi-thử-lại đỡ. Chậm còn hơn treo, nhưng
 * treo thì không.
 *
 * KHÔNG ĐẾM PHẦN CỦA CHÍNH HUB. Hub gọi Lark thẳng trong tiến trình của nó,
 * không đi qua cửa này. Nên NHIP_QPS phải đặt thấp hơn hạn mức thật của Lark
 * (20/giây với Base API) để chừa chỗ cho phần đó — mặc định 15.
 */

const QPS = Math.max(1, Number(process.env.HUB_NHIP_QPS || 15));
/* Làm tròn LÊN, và tính bằng mili giây nguyên.
 *
 * 1000/15 = 66,666… nên mười lăm khoảng cộng lại ra 999,9999999999999 — nhỏ
 * hơn một giây đúng một hạt bụi dấu phẩy động. Đủ để lọt lượt thứ MƯỜI SÁU vào
 * giây đầu tiên, tức vượt đúng cái hạn mức mà cả luồng này sinh ra để giữ.
 * Phép thử bắt được; lấy 67ms thì mười lăm lượt chiếm 1005ms, chắc chắn không
 * quá. Đổi lại nhịp thật là 14,9/giây thay vì 15 — lệch về phía an toàn. */
const KHOANG = Math.ceil(1000 / QPS);
const TRAN_CHO = Math.max(0, Number(process.env.HUB_NHIP_TRAN_CHO || 4000));

let mocKe = 0;          // thời điểm sớm nhất được gọi tiếp (ms)
const dem = { cho: 0, ngay: 0, tran: 0, tongCho: 0, lauNhat: 0 };

/**
 * Xin một lượt gọi Lark.
 * @returns { cho, tran } — chờ `cho` mili giây rồi gọi; `tran` là đã quá hạn
 *          chờ nên cho đi luôn, không giữ chỗ.
 */
function xin(bayGio) {
  const now = Number.isFinite(bayGio) ? bayGio : Date.now();
  const moc = Math.max(now, mocKe);
  const cho = moc - now;
  if (cho > TRAN_CHO) {
    /* KHÔNG nhích mốc: người này không giữ chỗ, nên người xin sau không bị đẩy
     * lùi thêm vì một lượt đã bỏ hàng. */
    dem.tran += 1;
    return { cho: 0, tran: true };
  }
  mocKe = moc + KHOANG;
  if (cho > 0) { dem.cho += 1; dem.tongCho += cho; if (cho > dem.lauNhat) dem.lauNhat = cho; }
  else dem.ngay += 1;
  return { cho, tran: false };
}

/** Số liệu cho trang Kiểm tra hệ thống — để biết có đang nghẽn không. */
function tinhTrang() {
  const tong = dem.ngay + dem.cho + dem.tran;
  return {
    qps: QPS,
    tranChoMs: TRAN_CHO,
    tong,
    diNgay: dem.ngay,
    phaiCho: dem.cho,
    quaTranChoDiLuon: dem.tran,
    choTrungBinhMs: dem.cho ? Math.round(dem.tongCho / dem.cho) : 0,
    choLauNhatMs: Math.round(dem.lauNhat),
  };
}

/* Chỉ dùng trong kiểm thử. */
function datLai() {
  mocKe = 0;
  Object.keys(dem).forEach((k) => { dem[k] = 0; });
}

module.exports = { xin, tinhTrang, datLai, QPS, KHOANG, TRAN_CHO };
