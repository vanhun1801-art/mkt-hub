'use strict';
/**
 * ============================================================================
 * THỨ TỰ VIỆC CON DO NGƯỜI XẾP
 * ============================================================================
 * Anh Hùng 27/10/2026: "anh muốn lôi các công việc con đó vào một công việc lớn
 * khác, kiểu di chuyển linh hoạt thứ tự nó đi với nhau".
 *
 * Việc con tới giờ xếp theo DEADLINE (conCua() bên app.js). Xếp tự động thì
 * không bao giờ nói được "làm cái này trước cái kia" khi hai việc cùng hạn, mà
 * đó chính là thứ anh cần khi chia một việc lớn thành các bước.
 *
 * CHỖ CẤT — và vì sao tạm thời là tệp:
 *
 * Bảng Công việc trên Base có đúng 24 cột, không còn cột số nào rảnh, và không
 * có ô liên kết hai chiều "Child items" để mượn thứ tự. Muốn làm đúng thì phải
 * THÊM MỘT CỘT vào Base của phòng — đó là đổi cấu trúc dữ liệu thật, phải hỏi
 * anh Hùng trước. Nên bản xem thử này cất ra tệp, và mọi lối vào đi qua đúng
 * hai hàm doc()/ghi() dưới đây: đổi sang cột Base sau chỉ phải sửa hai hàm đó,
 * không đụng tới máy chủ hay giao diện.
 *
 * HÌNH DẠNG: { "<id việc cha>": ["<id con>", "<id con>", …] }
 *
 * Danh sách này KHÔNG phải nguồn sự thật về "ai là con của ai" — ô `Parent
 * items` trên Base mới là. Đây chỉ là thứ tự. Nên nó được phép thiếu hoặc thừa
 * id: con mới chưa có trong danh sách thì xếp xuống cuối, id của việc đã xoá
 * hay đã dời đi thì bỏ qua. Không bao giờ được để thứ tự quyết định việc nào
 * hiện ra.
 */
const fs = require('fs');
const path = require('path');

const TEP = path.join(__dirname, 'thu-tu-con.json');

let nho = null;

function doc() {
  if (nho) return nho;
  try {
    const o = JSON.parse(fs.readFileSync(TEP, 'utf8'));
    nho = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (_) { nho = {}; }
  return nho;
}

function ghi(o) {
  nho = o;
  try {
    fs.writeFileSync(TEP, JSON.stringify(o, null, 1), 'utf8');
    return true;
  } catch (e) {
    console.error('[thu-tu-con] không ghi được:', e.message);
    return false;
  }
}

/** Thứ tự đang lưu của một việc cha (mảng id, có thể rỗng). */
function cua(idCha) {
  const o = doc();
  return Array.isArray(o[idCha]) ? o[idCha].slice() : [];
}

/**
 * Đặt thứ tự mới cho một việc cha.
 * `ids` là thứ tự người vừa kéo; chỉ giữ những id là chuỗi, bỏ trùng.
 */
function dat(idCha, ids) {
  if (!idCha) return false;
  const sach = [];
  const da = new Set();
  for (const x of (Array.isArray(ids) ? ids : [])) {
    if (typeof x !== 'string' || !x || da.has(x)) continue;
    da.add(x);
    sach.push(x);
  }
  const o = Object.assign({}, doc());
  if (sach.length) o[idCha] = sach;
  else delete o[idCha];
  return ghi(o);
}

/**
 * Xếp một mảng việc con theo thứ tự đã lưu.
 *
 * Con CHƯA có trong danh sách xếp xuống cuối, giữ nguyên thứ tự cũ giữa chúng
 * (thường là theo deadline) — việc mới chia ra không được nhảy lên đầu và xô
 * lệch thứ tự anh vừa kéo.
 */
function xep(idCha, ds) {
  const tt = cua(idCha);
  if (!tt.length) return ds;
  const viTri = new Map(tt.map((id, i) => [id, i]));
  return ds.slice().sort((a, b) => {
    const x = viTri.has(a.id) ? viTri.get(a.id) : Infinity;
    const y = viTri.has(b.id) ? viTri.get(b.id) : Infinity;
    return x - y;
  });
}

/** Bỏ một id khỏi mọi danh sách — dùng khi việc con dời sang cha khác hoặc bị xoá. */
function goKhoiMoiCha(id) {
  const o = Object.assign({}, doc());
  let doi = false;
  for (const k of Object.keys(o)) {
    const truoc = o[k].length;
    o[k] = o[k].filter((x) => x !== id);
    if (o[k].length !== truoc) doi = true;
    if (!o[k].length) delete o[k];
  }
  return doi ? ghi(o) : true;
}

/** Thêm một id vào CUỐI danh sách của cha mới (nếu cha đó đang có thứ tự riêng). */
function themVaoCuoi(idCha, id) {
  if (!idCha || !id) return true;
  const o = Object.assign({}, doc());
  if (!Array.isArray(o[idCha])) return true;   // cha chưa xếp tay thì thôi, để tự nhiên
  if (o[idCha].includes(id)) return true;
  o[idCha] = o[idCha].concat([id]);
  return ghi(o);
}

function _datLai() { nho = null; }

module.exports = { cua, dat, xep, goKhoiMoiCha, themVaoCuoi, TEP, _datLai };
