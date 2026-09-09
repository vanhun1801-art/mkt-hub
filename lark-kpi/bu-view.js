'use strict';
/**
 * LUẬT BÙ VIEW — thưởng/phạt độ đều tay.
 *
 * Ý tưởng gốc trong file Excel, giữ nguyên vì nó đúng: chống kiểu "ăn may một
 * video viral rồi bỏ bê cả tháng". Luật cho phép tối đa một tỷ lệ nhất định số
 * bài được rơi dưới ngưỡng (mặc định: nửa số bài, ngưỡng = view trung bình chia
 * đôi). Ít bài tụt hơn mức cho phép thì được cộng thưởng bằng số suất dư nhân
 * view trung bình; nhiều hơn thì bị trừ ngược.
 *
 * Viết lại thành hàm thuần vì trong Excel nó nằm rải trên bảy cột (K, M, O, Q, S,
 * U, V) của 39 dòng mỗi tháng — và chính ở đó có hai lỗi: một ô khoá cứng mẫu số
 * vào dòng khác, một ô đếm bài ảnh dưới chuẩn bằng dấu TRỪ thay vì CỘNG. Gom về
 * một hàm thì chỉ còn một chỗ để sai, và có test canh.
 */

const soHopLe = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param baiViet  [{ view: số, mucDich: 'Bán hàng' | 'Tương tác' }]
 * @param luatBu   { bat, chiaNguong, tyLeChoPhep }
 * @param heSoCua  (mucDich) => số — hệ số quy đổi theo mục đích nội dung
 * @returns {
 *   soBai, tong, trungBinh, nguong, duoiNguong, suatDu, thuong, sauBu,
 *   theoMucDich: { [mucDich]: { soBai, tong, heSo, quyDoi } },
 *   ketQua      — số cuối cùng đưa vào chấm KPI
 * }
 */
function tinh(baiViet, luatBu, heSoCua) {
  const ds = (baiViet || []).filter((b) => b && soHopLe(b.view));
  const soBai = ds.length;
  const tong = ds.reduce((s, b) => s + b.view, 0);

  const bat = !luatBu || luatBu.bat !== false;
  const chia = soHopLe(luatBu && luatBu.chiaNguong) && luatBu.chiaNguong > 0 ? luatBu.chiaNguong : 2;
  const choPhep = soHopLe(luatBu && luatBu.tyLeChoPhep) ? luatBu.tyLeChoPhep : 0.5;

  const trungBinh = soBai > 0 ? tong / soBai : 0;
  const nguong = trungBinh / chia;
  const duoiNguong = soBai > 0 ? ds.filter((b) => b.view < nguong).length : 0;
  const suatDu = bat && soBai > 0 ? soBai * choPhep - duoiNguong : 0;
  const thuong = suatDu * trungBinh;
  const sauBu = tong + thuong;

  /* Chia phần đã bù về từng mục đích theo đúng tỷ lệ view thật của nó, rồi mới
   * nhân hệ số. Excel bù riêng cho từng mục đích (mỗi mục đích một dòng) — kết
   * quả gần như nhau nhưng cách này không cho một mục đích ít bài tự sinh ra
   * thưởng lớn nhờ trung bình của mục đích kia. */
  const theoMucDich = {};
  ds.forEach((b) => {
    const md = b.mucDich || 'Chưa phân loại';
    const o = theoMucDich[md] || (theoMucDich[md] = { soBai: 0, tong: 0, heSo: 1, quyDoi: 0 });
    o.soBai += 1;
    o.tong += b.view;
  });
  let ketQua = 0;
  Object.entries(theoMucDich).forEach(([md, o]) => {
    o.heSo = typeof heSoCua === 'function' ? heSoCua(md) : 1;
    const phan = tong > 0 ? o.tong / tong : 0;
    o.sauBu = o.tong + thuong * phan;
    o.quyDoi = o.sauBu * o.heSo;
    ketQua += o.quyDoi;
  });

  return {
    soBai, tong, trungBinh, nguong, duoiNguong,
    suatDu, thuong, sauBu, theoMucDich, ketQua,
  };
}

/** Bài chưa gắn mục đích — tháng không chốt được khi danh sách này còn dài. */
function chuaPhanLoai(baiViet) {
  return (baiViet || []).filter((b) => b && !b.mucDich);
}

module.exports = { tinh, chuaPhanLoai };
