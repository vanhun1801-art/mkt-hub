'use strict';
/**
 * Chia khoảng ngày thành từng cửa sổ nhỏ.
 *
 * Meta đặt trần độ dài khoảng cho endpoint insights, và trần của mỗi nền tảng
 * một khác — hỏi dài hơn là nó từ chối CẢ REQUEST chứ không cắt bớt hộ:
 *
 *   Facebook Page insights  ~93 ngày  → "(#100) Invalid parameter"
 *   Instagram insights       30 ngày  → "(#100) There cannot be more than 30 days"
 *
 * Cả hai lỗi này chỉ hiện ra khi chạy "Nạp lại từ đầu" cho cả năm: kéo 7 ngày
 * thì không bao giờ gặp, nên rất dễ tưởng code đúng.
 */

const NGAY = 86400000;

const iso = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * [['2026-01-01','2026-03-31'], ['2026-04-01','2026-06-29'], …]
 * Cửa sổ cuối luôn kết thúc đúng `den`; không bao giờ trả cửa sổ rỗng.
 */
function chiaKhoang(tu, den, soNgayToiDa) {
  const t0 = Date.parse(tu + 'T00:00:00Z');
  const t1 = Date.parse(den + 'T00:00:00Z');
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return [];
  const buoc = Math.max(1, Number(soNgayToiDa) || 1);
  const out = [];
  for (let t = t0; t <= t1; t += buoc * NGAY) {
    const het = Math.min(t1, t + (buoc - 1) * NGAY);
    out.push([iso(t), iso(het)]);
    if (het >= t1) break;
  }
  return out;
}

module.exports = { chiaKhoang };
