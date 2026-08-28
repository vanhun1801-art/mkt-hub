'use strict';
/*
 * BỘ LỌC THỜI GIAN CỦA NHÂN SỰ — một danh sách duy nhất cho cả bốn app.
 *
 * Nhân sự chỉ cần nhìn quanh hôm nay: không có "tháng trước", không có khoảng tuỳ
 * chọn, không có "toàn bộ". Bảy lựa chọn dưới đây là tất cả những gì họ thấy, ở
 * lớp vỏ và trong cả ba app con.
 *
 * Lớp vỏ nạp file này; shim của proxy chèn nó vào từng app con (cùng origin) —
 * nên sửa danh sách chỉ sửa một chỗ, không phải mở bốn app.
 *
 * Mỗi mục trả về khoảng ngày thật (tu/den dạng YYYY-MM-DD) để mọi base hiểu giống
 * nhau: Bảng công việc lọc theo deadline, Lịch tác nghiệp theo ngày bắt đầu, Quảng
 * cáo theo ngày chi tiêu — cùng một khoảng.
 */
(function () {
  if (window.HUB_LOC) return;

  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const dau = () => { const x = new Date(); x.setHours(0, 0, 0, 0); return x; };
  const cong = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  /** Thứ 2 của tuần chứa ngày d (tuần bắt đầu Thứ 2). */
  const thuHai = (d) => cong(d, -((d.getDay() + 6) % 7));
  const thang = (lech) => {
    const t = dau();
    const a = new Date(t.getFullYear(), t.getMonth() + lech, 1);
    return { tu: iso(a), den: iso(new Date(a.getFullYear(), a.getMonth() + 1, 0)) };
  };
  const tuan = (lech) => {
    const s = cong(thuHai(dau()), lech * 7);
    return { tu: iso(s), den: iso(cong(s, 6)) };
  };
  const ngay = (lech) => { const d = cong(dau(), lech); return { tu: iso(d), den: iso(d) }; };

  /* Thứ tự hiển thị: từ hẹp tới rộng, quá khứ gần nhất trước. */
  const MUC = [
    { k: 'hom-qua', ten: 'Hôm qua', khoang: () => ngay(-1) },
    { k: 'hom-nay', ten: 'Hôm nay', khoang: () => ngay(0) },
    { k: 'ngay-mai', ten: 'Ngày mai', khoang: () => ngay(1) },
    { k: 'tuan', ten: 'Tuần này', khoang: () => tuan(0) },
    { k: 'tuan-sau', ten: 'Tuần tới', khoang: () => tuan(1) },
    { k: 'thang', ten: 'Tháng này', khoang: () => thang(0) },
    { k: 'thang-sau', ten: 'Tháng tiếp theo', khoang: () => thang(1) },
  ];

  /** Danh sách cho nhân sự: [{ k, ten, tu, den }] — khoảng tính theo hôm nay. */
  function danhSach() {
    return MUC.map((m) => Object.assign({ k: m.k, ten: m.ten }, m.khoang()));
  }

  /** Khoảng của một mã, hoặc null nếu không có mã đó. */
  function khoangCua(k) {
    const m = MUC.find((x) => x.k === k);
    return m ? m.khoang() : null;
  }

  /** Mã khớp với một khoảng đang áp (để biết nút nào đang sáng). */
  function macCuaKhoang(tu, den) {
    if (!tu || !den) return '';
    const m = danhSach().find((x) => x.tu === tu && x.den === den);
    return m ? m.k : '';
  }

  window.HUB_LOC = { danhSach, khoangCua, macCuaKhoang, MAC_DINH: 'thang' };
})();
