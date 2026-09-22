'use strict';
/**
 * ============================================================================
 * CHẶN TẦN SUẤT — cho trang đăng nhập và trang đăng ký
 * ============================================================================
 * Anh Hùng 22/09/2026: "đặt rate limit cho trang đăng nhập để ngăn chặn việc dò
 * mật khẩu hàng nghìn lần mỗi phút".
 *
 * Cửa sổ trượt, giữ trong RAM. KHÔNG dùng kho ngoài vì hub chạy một tiến trình
 * duy nhất trên Render; thêm Redis chỉ để đếm mấy con số là thêm một thứ nữa
 * phải trả tiền và phải trông.
 *
 * ---------------------------------------------------------------------------
 * ĐẾM THEO HAI KHOÁ CÙNG LÚC, và đây là phần dễ làm sai:
 *
 *   theo IP     chặn một máy thử nhiều mật khẩu của nhiều tài khoản
 *   theo EMAIL  chặn nhiều máy (botnet, proxy xoay IP) cùng thử MỘT tài khoản
 *
 * Chỉ đếm theo IP thì đổi IP là qua. Chỉ đếm theo email thì một máy vẫn quét
 * được cả danh sách email, mỗi email vài lần. Phải cả hai.
 *
 * `x-forwarded-for` do Render đặt — proxy của nó ghi IP thật vào ĐẦU chuỗi. Lấy
 * phần tử đầu; các phần tử sau là do client tự bịa được nên không tin.
 *
 * ---------------------------------------------------------------------------
 * ĐẾM LẦN HỎNG, KHÔNG ĐẾM LẦN GỌI. Người gõ đúng mật khẩu thì không tốn lượt —
 * nên một văn phòng chung IP không bị khoá lẫn nhau chỉ vì đông người đăng nhập
 * cùng lúc. Chỉ khi bắt đầu SAI thì mới bị đếm.
 *
 * Chờ tăng dần: quá ngưỡng thì khoá 1 phút, sai tiếp thì 2, 4, 8… tối đa 15
 * phút. Dò tự động chết ngay, còn người gõ nhầm hai ba lần thì gần như không
 * thấy gì.
 */

/* khoá -> { moc: [thời điểm các lần hỏng], khoaToi: mốc hết khoá, lanKhoa: số lần đã khoá } */
const kho = new Map();

const PHUT = 60000;

/** Dọn khoá đã nguội, để Map không phình mãi. */
function don(bayGio) {
  for (const [k, v] of kho) {
    const cuoi = Math.max(v.khoaToi || 0, v.moc.length ? v.moc[v.moc.length - 1] : 0);
    if (bayGio - cuoi > 30 * PHUT) kho.delete(k);
  }
}
let donLuc = 0;

/**
 * Còn được thử không.
 * @returns {{ok: boolean, choMs: number}} choMs = còn phải chờ bao lâu (ms)
 */
function thu(khoa, tuyChon) {
  const o = tuyChon || {};
  const nguong = o.nguong || 5;
  const cuaSo = o.cuaSoMs || 10 * PHUT;
  const bayGio = Date.now();

  if (bayGio - donLuc > 5 * PHUT) { don(bayGio); donLuc = bayGio; }

  const v = kho.get(khoa);
  if (!v) return { ok: true, choMs: 0 };
  if (v.khoaToi && bayGio < v.khoaToi) return { ok: false, choMs: v.khoaToi - bayGio };

  v.moc = v.moc.filter((t) => bayGio - t < cuaSo);
  if (v.moc.length >= nguong) {
    /* Còn đủ lần hỏng trong cửa sổ mà khoá đã hết hạn: khoá tiếp, dài gấp đôi. */
    const lan = (v.lanKhoa || 0) + 1;
    v.lanKhoa = lan;
    v.khoaToi = bayGio + Math.min(15, Math.pow(2, lan - 1)) * PHUT;
    v.moc = [];
    return { ok: false, choMs: v.khoaToi - bayGio };
  }
  return { ok: true, choMs: 0 };
}

/** Ghi một lần HỎNG. Gọi sau khi đã biết chắc là sai, không gọi trước. */
function hong(khoa, tuyChon) {
  const o = tuyChon || {};
  const cuaSo = o.cuaSoMs || 10 * PHUT;
  const bayGio = Date.now();
  const v = kho.get(khoa) || { moc: [], khoaToi: 0, lanKhoa: 0 };
  v.moc = v.moc.filter((t) => bayGio - t < cuaSo).concat(bayGio);
  kho.set(khoa, v);
}

/** Gõ đúng rồi thì xoá sạch lịch sử của khoá đó. */
function xong(khoa) { kho.delete(khoa); }

/**
 * IP thật của request, sau proxy của Render.
 *
 * Phần tử ĐẦU của x-forwarded-for là client; các phần tử sau do client tự đặt
 * được nên vô giá trị. Không có header thì lấy từ socket (chạy ở máy cá nhân).
 */
function ipCua(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (xff) return xff;
  return String((req.socket && req.socket.remoteAddress) || '').trim() || 'khong-ro';
}

/** Câu nói cho người dùng, không lộ ngưỡng cụ thể. */
function noiCho(choMs) {
  const phut = Math.max(1, Math.ceil(choMs / PHUT));
  return 'Thử sai quá nhiều lần. Chờ ' + phut + ' phút rồi thử lại.';
}

/** Chỉ dùng cho phép thử. */
function xoaHet() { kho.clear(); donLuc = 0; }

module.exports = { thu, hong, xong, ipCua, noiCho, xoaHet };
