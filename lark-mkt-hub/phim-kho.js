'use strict';
/**
 * ============================================================================
 * KHO LƯU CHO Ô PHÁT TRANG TỔNG QUAN — Base giữ thật, ổ đĩa chỉ là bộ đệm
 * ============================================================================
 * Anh Hùng: "những lần anh deploy lại thì mất đi video phát hoặc cái anh đã
 * thiết lập" — rồi chốt "hay là lưu trên base".
 *
 * Gốc của chuyện mất: ổ đĩa của Render là ổ TẠM, mỗi lần deploy dựng lại từ
 * kho mã nguồn. Tệp tải lên qua Cài đặt nằm ở `du-lieu/` nên bay sạch. Gói
 * trả phí có đĩa gắn thêm, nhưng Base thì miễn phí và đã có sẵn.
 *
 * CÁCH LÀM — hai tầng, và thứ tự quan trọng:
 *
 *   Base   = nơi giữ THẬT. Mỗi ô 1..5 là một dòng, tệp nằm ở cột đính kèm.
 *            Deploy bao nhiêu lần cũng còn.
 *   du-lieu/ = BỘ ĐỆM. Hub khởi động thì kéo từ Base về đây rồi phát từ đây.
 *
 * Vì sao không phát thẳng từ Base: đường tải media của Lark phải xin token,
 * đổi sang đường tạm rồi mới tải được — chậm, mà đây là video tự chạy ngay
 * khi mở trang. Đệm ở đĩa thì tốc độ phát y như cũ; mất đệm cũng không sao,
 * lần khởi động sau kéo lại.
 *
 * KHÔNG được để hỏng im lặng: Base lỗi thì ô phát vẫn chạy bằng bộ đệm, nhưng
 * `loiCuoi` phải mang đúng mã lỗi của Lark để Cài đặt nói ra. Trước nay mỗi
 * lần chuyện này hỏng là hỏng không một dòng nào.
 */
const fs = require('fs');
const path = require('path');
const baseLark = require('./base-lark');

/* Cùng Base với bảng Phân quyền và Thông báo — phòng chỉ phải chia sẻ MỘT
 * Base cho app, và mọi thứ của hub nằm cùng một chỗ. */
const BASE = process.env.HUB_PHIM_BASE || process.env.HUB_TB_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG';
const TABLE = process.env.HUB_PHIM_TABLE || 'tbl1rcw5ES34EeEY';
const COT_O = 'Ô';
const COT_TEP = 'Tệp';
const COT_LUC = 'Cập nhật';

const B = TABLE ? baseLark.bang(BASE, TABLE, COT_TEP) : null;

/* Lỗi lần chạm Base gần nhất. Cài đặt đọc cái này để nói thật với người dùng
 * thay vì lặng lẽ quay về ổ tạm. */
let loiCuoi = '';
const bao = (e) => { loiCuoi = e && e.message ? e.message : String(e || ''); return null; };

function co() { return !!B; }
function loi() { return loiCuoi; }

/** Mọi ô đang có trên Base: Map(số ô -> { recordId, tep }). */
async function docKho() {
  if (!B) return new Map();
  const ds = await B.docHet();
  const ra = new Map();
  for (const d of ds) {
    const o = Number(String(d[COT_O] || '').trim());
    if (!(o >= 1 && o <= 5)) continue;
    const tep = baseLark.docOTep(d[COT_TEP])[0] || null;
    ra.set(o, { recordId: d.recordId, tep });
  }
  loiCuoi = '';
  return ra;
}

/** Dòng của ô i, tạo mới nếu chưa có. */
async function dongCua(kho, i) {
  const co1 = kho.get(i);
  if (co1 && co1.recordId) return co1.recordId;
  const id = await B.tao({ [COT_O]: String(i) });
  kho.set(i, { recordId: id, tep: null });
  return id;
}

/**
 * Cất tệp của ô i lên Base. Gỡ tệp cũ TRƯỚC khi đính tệp mới — ô đính kèm
 * cộng dồn, không gỡ thì mỗi lần thay là Base phình thêm một bản.
 */
async function ghiKho(i, tep) {
  if (!B) return false;
  try {
    const kho = await docKho();
    const rec = await dongCua(kho, i);
    const cu = kho.get(i);
    if (cu && cu.tep && cu.tep.token) {
      try { await B.goTep(rec, COT_TEP, cu.tep.token); } catch (_) { /* tệp cũ lỡ mất thì thôi */ }
    }
    await B.dinhTep(rec, COT_TEP, tep);
    try { await B.ghi(rec, { [COT_LUC]: new Date().toISOString() }); } catch (_) { /* cột ghi chú, hỏng cũng không sao */ }
    loiCuoi = '';
    return true;
  } catch (e) { bao(e); return false; }
}

/** Xoá ô i khỏi Base (gỡ tệp và xoá luôn dòng, khỏi để lại dòng rỗng). */
async function xoaKho(i) {
  if (!B) return false;
  try {
    const kho = await docKho();
    const cu = kho.get(i);
    if (!cu) return true;
    if (cu.tep && cu.tep.token) {
      try { await B.goTep(cu.recordId, COT_TEP, cu.tep.token); } catch (_) { /* thôi */ }
    }
    try { await B.xoa(cu.recordId); } catch (_) { /* để lại dòng rỗng cũng không sao */ }
    loiCuoi = '';
    return true;
  } catch (e) { bao(e); return false; }
}

/**
 * Kéo từ Base về bộ đệm trên đĩa.
 *
 * `tepCua(i)` trả về tệp ĐANG có ở đệm (hoặc null) để biết có phải tải lại
 * không; `ghiDia(i, ten, buf)` ghi xuống. Truyền vào thay vì tự làm, để module
 * này không phải biết quy ước đặt tên của server.js.
 *
 * So bằng CỠ TỆP, không so bằng thời gian: mỗi lần deploy là một ổ đĩa mới nên
 * thời gian sửa tệp vô nghĩa, còn cỡ thì đủ để biết đệm có đúng bản không.
 */
async function veDia(tepCua, ghiDia) {
  if (!B) return { ok: false, lyDo: 'chưa khai bảng' };
  let keo = 0;
  let bo = 0;
  try {
    const kho = await docKho();
    for (const [i, o] of kho) {
      if (!o.tep || !o.tep.token) continue;
      const dang = tepCua(i);
      if (dang && o.tep.co && dang.co === o.tep.co) { bo += 1; continue; }
      try {
        const t = await B.taiTep(o.recordId, o.tep.token);
        if (t && t.buf && t.buf.length) { ghiDia(i, o.tep.ten, t.buf); keo += 1; }
      } catch (e) { bao(e); }
    }
    return { ok: true, keo, bo, loi: loiCuoi };
  } catch (e) { bao(e); return { ok: false, lyDo: loiCuoi }; }
}

module.exports = { co, loi, docKho, ghiKho, xoaKho, veDia, BASE, TABLE };
