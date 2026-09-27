'use strict';
/**
 * THEO DÕI LỖI GIAO DIỆN TỪ MÁY NGƯỜI DÙNG THẬT (27/09/2026).
 *
 * Anh Hùng: "cài ẩn khi anh cho tất cả cùng dùng rồi theo dõi có lỗi không" —
 * một người không bao giờ tự đi hết mọi trường hợp; cả phòng dùng thì có.
 *
 * ios.js (lớp vỏ) và ios-app.js (12 app con) âm thầm gửi về đây khi gặp:
 *   - lỗi JavaScript / promise bị từ chối không ai bắt;
 *   - trang tràn ngang (có thứ lòi khỏi màn hình);
 *   - cửa sổ kẹt: lớp vỏ còn làm mờ mà không còn cửa sổ nào mở.
 * Người dùng không thấy gì. Không gửi dữ liệu nghiệp vụ — chỉ câu lỗi, app,
 * đường dẫn, cỡ màn, trình duyệt, và tên người đang đăng nhập để hỏi lại.
 *
 * Lưu trong BỘ NHỚ (ổ đĩa Render là tạm, và đây là dữ liệu chẩn đoán, không
 * phải dữ liệu cần giữ): tối đa 800 dòng gần nhất, gộp dòng trùng. Đồng thời
 * in ra log máy chủ (Render giữ log) với tiền tố [loi-giao-dien].
 */
const TRAN = 800;
const ds = [];          // mới nhất ở cuối
const theoKhoa = new Map();

const cat = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

/** Ghi một báo lỗi. Trả false nếu bỏ qua (thiếu nội dung). */
function ghi(b, nguoi) {
  if (!b || typeof b !== 'object') return false;
  const r = {
    loai: cat(b.loai, 20) || 'js',
    app: cat(b.app, 40) || 'hub',
    msg: cat(b.msg, 400),
    nguon: cat(b.nguon, 200),
    url: cat(b.url, 200),
    w: Math.max(0, Math.min(10000, +b.w || 0)),
    h: Math.max(0, Math.min(10000, +b.h || 0)),
    ua: cat(b.ua, 160),
    ai: cat(nguoi && (nguoi.name || nguoi.email), 60),
  };
  if (!r.msg) return false;
  const khoa = [r.loai, r.app, r.msg, r.nguon].join('|');
  const nay = Date.now();
  const cu = theoKhoa.get(khoa);
  if (cu) {
    cu.lan++; cu.cuoi = nay;
    if (r.ai && !cu.nguoi.includes(r.ai) && cu.nguoi.length < 12) cu.nguoi.push(r.ai);
    if (r.w && !cu.coMan.includes(r.w) && cu.coMan.length < 8) cu.coMan.push(r.w);
    return true;
  }
  const dong = Object.assign({ khoa, dau: nay, cuoi: nay, lan: 1, nguoi: r.ai ? [r.ai] : [], coMan: r.w ? [r.w] : [] }, r);
  ds.push(dong); theoKhoa.set(khoa, dong);
  while (ds.length > TRAN) { const bo = ds.shift(); theoKhoa.delete(bo.khoa); }
  console.warn('[loi-giao-dien] ' + r.loai + ' · ' + r.app + ' · ' + r.msg + (r.nguon ? ' @ ' + r.nguon : '') + ' · ' + r.w + 'px · ' + (r.ai || '?'));
  return true;
}

/** Danh sách cho quản lý: dòng gặp gần nhất lên đầu. */
function danhSach() {
  return ds.slice().sort((a, b) => b.cuoi - a.cuoi).map(({ khoa, ...x }) => x);
}

module.exports = { ghi, danhSach };
