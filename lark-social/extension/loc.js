/* Phần suy luận thuần của tiện ích, tách riêng để thử được bằng Node.
 *
 * Ba hàm dưới đây là chỗ đã hỏng hai lần rồi: đọc tên khi Facebook chẻ dòng chữ
 * thành nhiều nút, và so trùng khi một bài đăng bị bắt nhiều lần trong luồng hẹn
 * giờ. Nhét trong content.js thì chỉ thử được bằng cách mở Facebook ra bấm —
 * mỗi lượt vài phút và không lặp lại được.
 */
(function (goc) {
  const RE_TEN = /Người\s*đăng\s*[:：]\s*([^\n·|]+)/;

  /** Bỏ dấu câu thừa, gộp khoảng trắng, về chữ thường — để so hai đoạn chữ. */
  const dauVan = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  /**
   * Rút tên người từ một đoạn chữ đã ghép.
   *
   * Ghép lại thì ngày giờ dính ngay sau tên, không có dấu phân cách:
   * "Người đăng: Phương Ái10 Tháng 9 lúc 16:06". Tên người không có chữ số nên
   * cắt ở chữ số đầu tiên là sạch.
   */
  function tachTen(van) {
    const m = RE_TEN.exec(String(van || ''));
    if (!m) return '';
    const ten = m[1].split(/[0-9]/)[0].replace(/\s+/g, ' ').trim();
    return ten && ten.length <= 60 ? ten : '';
  }

  /**
   * Hai đoạn chữ này có phải cùng một bài không.
   *
   * So theo BAO HÀM chứ không so mấy chục ký tự đầu: luồng hẹn giờ trong
   * Business Suite bấm nhiều bước, mỗi bước chụp được một đoạn hơi khác nhau,
   * nên so phần đầu là trượt — một bài đăng từng ra bốn mục vì lỗi này.
   */
  function trungNhau(a, b) {
    const x = dauVan(a);
    const y = dauVan(b);
    if (!x || !y) return false;
    return x.includes(y) || y.includes(x);
  }

  goc.RT_LOC = { dauVan, tachTen, trungNhau, RE_TEN };
}(typeof self !== 'undefined' ? self : this));
