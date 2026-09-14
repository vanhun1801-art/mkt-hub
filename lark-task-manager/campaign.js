'use strict';
/**
 * Thêm một lựa chọn vào ĐỊNH NGHĨA của một cột select trong Lark Base.
 *
 * Để riêng một file vì đây là chỗ duy nhất trong app có thể làm hỏng dữ liệu
 * một cách im lặng (xem chú thích hàm), nên nó phải kiểm thử được mà không
 * cần bật server — `server.js` không export gì và require nó là chạy luôn.
 */

/**
 * Dựng định nghĩa cột MỚI để thêm một lựa chọn vào cột select.
 *
 * Tách riêng khỏi lớp HTTP vì đây là chỗ duy nhất có thể làm HỎNG DỮ LIỆU, mà
 * hỏng im lặng: `+field-update` (và PUT .../fields/:id) là ghi TOÀN PHẦN — ô
 * nào không có trong `def` là ô đó mất. Cột Campain đang có `default_value`
 * là "Operate"; gõ lại định nghĩa bằng tay là mất nó, và chỉ lộ ra ở lần tạo
 * việc sau khi ô Campain bỗng trống. Nên `def` luôn dựng từ chính bản đọc về
 * và CHỈ thay `options`.
 *
 * Trả { daCo, ten, options, def }. `daCo` = tên này đã có rồi, không phải ghi.
 */
function themLuaChon(raw, ten) {
  const cu = raw.options || [];
  const tenCu = cu.map((o) => o.name);

  /* So khớp bỏ qua hoa/thường và khoảng trắng thừa: gần như lần nào cũng có
   * người gõ lại một chiến dịch đã có. Trả về CÁI ĐANG CÓ chứ đừng báo lỗi —
   * ý người dùng là "tôi muốn dùng cái này", và họ đã được đúng cái đó. */
  const chuan = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const trung = cu.find((o) => chuan(o.name) === chuan(ten));
  if (trung) return { daCo: true, ten: trung.name, options: tenCu, def: null };

  /* Màu: LẤY LẠI đúng những cặp màu cột này đang dùng, xoay vòng theo số lựa
   * chọn. Tự bịa một tên màu là đánh cược với bảng màu của Lark — sai tên thì
   * cả lời gọi hỏng, mà hỏng ở đây nghĩa là không thêm được nữa. Cột chưa có
   * màu nào thì bỏ hẳn hai ô này, để Lark tự chọn. */
  const bangMau = cu.filter((o) => o.hue).map((o) => ({ hue: o.hue, lightness: o.lightness }));
  const mau = bangMau.length ? bangMau[cu.length % bangMau.length] : null;

  const def = Object.assign({}, raw);
  delete def.id;                       // id đi trong URL, không nằm trong thân
  def.options = cu.concat([Object.assign({ name: ten }, mau || {})]);
  return { daCo: false, ten, options: def.options.map((o) => o.name), def };
}

module.exports = { themLuaChon };
