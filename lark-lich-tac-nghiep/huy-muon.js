'use strict';
/**
 * Mốc mở cửa "xin huỷ muộn" — phép tính tách riêng vì nó là chỗ dễ sai nhất.
 *
 * Luồng: lịch đã duyệt, tới ngày nhân sự bất khả kháng không đi được. Họ không
 * báo cáo được (chưa đi thì không có gì nộp) mà cũng không huỷ được (lịch đã
 * duyệt thì huỷ là việc của quản lý). Nên mở một đường lùi, nhưng mở muộn:
 * 36 tiếng tính từ ĐẦU NGÀY đi, tức 12h trưa ngày hôm sau.
 *
 * Vì sao tách ra một tệp: phép tính này phải cộng độ lệch Việt Nam TRƯỚC khi
 * chia lấy đầu ngày. App này đã có một lỗi đúng kiểu đó — Render chạy giờ UTC
 * nên mọi mốc 00:00–06:59 giờ VN bị đẩy sang ngày hôm trước, đo được 16 lịch
 * và 3 việc rơi sai cột. Ở đây sai một ngày nghĩa là nút huỷ mở sớm 24 tiếng,
 * và không có gì trên màn hình nói ra điều đó.
 *
 * Đo theo ĐẦU NGÀY chứ không theo giờ đi, vì hai lẽ: cả app đang dùng cùng
 * thước "đã qua" theo ngày, và một chuyến 6h sáng với một chuyến 22h cùng ngày
 * thì không có lý gì hạn xin huỷ lệch nhau 16 tiếng.
 */

/** Độ lệch Việt Nam — cố định, không có giờ mùa hè. */
const LECH_VN = 7 * 3600000;

/** Đầu ngày theo giờ Việt Nam của một mốc thời gian (ms). */
function dauNgayVN(ms) {
  return Math.floor((ms + LECH_VN) / 86400000) * 86400000 - LECH_VN;
}

/**
 * Mốc (ms) được phép xin huỷ muộn, hoặc 0 nếu lịch chưa có ngày đi.
 * Lịch không có ngày đi thì không tính được mốc — và cũng không nên đoán.
 */
function moc(item, afterMs) {
  const t = Date.parse((item && item.start) || '');
  if (!t) return 0;
  return dauNgayVN(t) + afterMs;
}

/**
 * Lịch này đã tới lúc được xin huỷ muộn chưa.
 * @param {object} item  bản ghi lịch
 * @param {object} luat  cfg.lateCancel — { status, afterMs }
 * @param {number} [luc] mốc "bây giờ", để kiểm thử tiêm được thời điểm
 */
function duoc(item, luat, luc) {
  if (!item || !luat || item.status !== luat.status) return false;
  const m = moc(item, luat.afterMs);
  return !!m && (luc == null ? Date.now() : luc) >= m;
}

module.exports = { LECH_VN, dauNgayVN, moc, duoc };
