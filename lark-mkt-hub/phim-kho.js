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

/* Khoá của hàng LOGO. Bảng này vốn chỉ giữ ô phát 1..5, nhưng logo có y hệt
 * bài toán: ổ đĩa Render là ổ tạm nên logo tải lên qua Cài đặt bay sau lần
 * deploy kế tiếp, và mọi tệp xuất in bản chữ thay logo.
 *
 * Dùng CHUNG một bảng thay vì dựng bảng thứ hai: phòng chỉ phải chia sẻ một
 * Base, và cột "Ô" vốn là văn bản nên chứa chữ 'logo' được. Nhờ đó mọi thứ
 * khác — gỡ tệp cũ trước khi đính tệp mới, so cỡ để biết có phải tải lại,
 * báo lỗi Lark ra Cài đặt — dùng lại nguyên, không chép thêm một bản. */
const KHOA_LOGO = 'logo';

/* Khoá của hàng LỜI CHÀO. Anh Hùng 08/10/2026: "ngoài hiển thị hình video ra,
 * đôi khi anh muốn hiển thị nội dung text cho nó nhẹ, như chào buổi sáng, chào
 * buổi chiều gì đó".
 *
 * Bảng này chỉ có ba cột — Ô, Tệp, Cập nhật — không có cột nào chứa được một
 * đoạn văn bản tự do. Nên lời chào cất thành một tệp JSON nhỏ trong chính cột
 * đính kèm, y như ô phát và logo.
 *
 * CÓ THỂ thêm một cột "Giá trị" vào Base cho gọn hơn, nhưng đó là đổi cấu trúc
 * Base của phòng — việc phải hỏi trước. Dùng đính kèm thì không đụng gì tới
 * bảng đang có, và dùng lại nguyên bộ gỡ-tệp-cũ / báo-lỗi-Lark sẵn ở đây. */
const KHOA_CHAO = 'chao';

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
    const raw = String(d[COT_O] || '').trim();
    const o = (raw === KHOA_LOGO || raw === KHOA_CHAO) ? raw : Number(raw);
    if (o !== KHOA_LOGO && o !== KHOA_CHAO && !(o >= 1 && o <= 5)) continue;
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

/* ---------------------------------------------------------------------------
 * LỜI CHÀO của ô bên trái bảng tin
 * -------------------------------------------------------------------------*/

/** Hình dạng mặc định — cũng là thứ trả về khi Base chưa có gì hoặc đang lỗi. */
const CHAO_MAC_DINH = { kieu: 'phim', tuChao: true, chu: '' };

/** Chuẩn hoá: dữ liệu đọc từ Base có thể cũ, thiếu trường, hoặc sai kiểu. */
function chuanChao(o) {
  const v = o && typeof o === 'object' ? o : {};
  return {
    kieu: v.kieu === 'chu' ? 'chu' : 'phim',
    tuChao: v.tuChao !== false,
    /* Cắt ở 500: ô này là một lời chào, không phải chỗ dán cả thông báo. Dài
     * quá thì nó tràn khỏi khung và đẩy cột tin bên cạnh méo đi. */
    chu: String(v.chu == null ? '' : v.chu).slice(0, 500),
  };
}

/**
 * Dòng lời chào trên Base, kèm ĐỦ danh sách tệp đính kèm.
 *
 * Không dùng docKho() cho việc này: nó chỉ giữ lại tệp ĐẦU TIÊN của mỗi dòng
 * (`docOTep(...)[0]`), mà ô đính kèm của Lark thì cộng dồn. Khi có nhiều bản
 * chồng nhau thì tệp đầu tiên là bản CŨ NHẤT — đọc nó ra là đọc nhầm, và ghi
 * thì chỉ gỡ được một bản mỗi lượt nên chồng mãi không hết.
 */
async function dongChao() {
  const ds = await B.docHet();
  for (const d of ds) {
    if (String(d[COT_O] || '').trim() !== KHOA_CHAO) continue;
    return { recordId: d.recordId, tep: baseLark.docOTep(d[COT_TEP]) || [] };
  }
  return null;
}

/** Đọc cấu hình lời chào từ Base. Hỏng thì trả mặc định, KHÔNG ném. */
async function docChao() {
  if (!B) return { ...CHAO_MAC_DINH };
  try {
    const d = await dongChao();
    /* Lấy tệp CUỐI — bản ghi sau cùng được đính thêm vào cuối, nên nó mới là
     * cấu hình đang có hiệu lực. Lấy tệp đầu là đọc ra bản cũ nhất. */
    const t0 = d && d.tep.length ? d.tep[d.tep.length - 1] : null;
    if (!t0 || !t0.token) return { ...CHAO_MAC_DINH };
    const t = await B.taiTep(d.recordId, t0.token);
    const buf = (t && t.buf) || (Buffer.isBuffer(t) ? t : null);
    if (!buf || !buf.length) return { ...CHAO_MAC_DINH };
    loiCuoi = '';
    return chuanChao(JSON.parse(buf.toString('utf8')));
  } catch (e) { bao(e); return { ...CHAO_MAC_DINH }; }
}

/** Ghi cấu hình lời chào lên Base. */
async function ghiChao(o) {
  if (!B) return false;
  const sach = chuanChao(o);
  try {
    let d = await dongChao();
    if (!d) {
      const kho = await docKho();
      const rec0 = await dongCua(kho, KHOA_CHAO);
      d = { recordId: rec0, tep: [] };
    }
    const rec = d.recordId;
    /* Gỡ MỌI tệp cũ, không chỉ tệp đầu — ô đính kèm CỘNG DỒN. Gỡ đúng một bản
     * mỗi lượt thì khi đã lỡ chồng ba bản, mỗi lần ghi là gỡ một thêm một:
     * chồng mãi không hết. Đã gặp đúng ba bản chồng nhau sau một loạt bấm
     * nhanh, và lượt đọc sau đó trả về cấu hình của mấy phút trước. */
    for (const t of d.tep) {
      try { await B.goTep(rec, COT_TEP, t.token); } catch (_) { /* lỡ mất thì thôi */ }
    }
    await B.dinhTep(rec, COT_TEP, {
      ten: 'chao.json', kieu: 'application/json',
      buf: Buffer.from(JSON.stringify(sach), 'utf8'),
    });
    try { await B.ghi(rec, { [COT_LUC]: new Date().toISOString() }); } catch (_) {}
    loiCuoi = '';
    return true;
  } catch (e) { bao(e); return false; }
}

module.exports = { co, loi, docKho, ghiKho, xoaKho, veDia, docChao, ghiChao, chuanChao,
  CHAO_MAC_DINH, BASE, TABLE, KHOA_LOGO, KHOA_CHAO };
