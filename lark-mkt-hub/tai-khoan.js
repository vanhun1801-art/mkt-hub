'use strict';
/**
 * ============================================================================
 * TÀI KHOẢN + MẬT KHẨU — cho người KHÔNG có tài khoản Lark
 * ============================================================================
 * Anh Hùng 22/09/2026: "lần đầu đăng nhập sẽ yêu cầu 2 tuỳ chọn, 1 là Lark,
 * 2 là tài khoản mật khẩu" — dành cho cộng tác viên / thực tập / đối tác, và
 * "để anh duyệt": ai cũng đăng ký được, nhưng chưa duyệt thì chưa vào được.
 *
 * VÌ SAO LƯU TRÊN BASE: ổ đĩa Render là ổ tạm, mỗi lần deploy dựng lại từ kho
 * mã nguồn. Để tài khoản ở tệp là cứ deploy một lần mất sạch người dùng. Base
 * thì miễn phí, sống qua deploy, và anh Hùng mở ra xem/sửa tay được.
 *
 * ---------------------------------------------------------------------------
 * BĂM MẬT KHẨU BẰNG `crypto.scrypt`, KHÔNG PHẢI ARGON2/BCRYPT
 *
 * Anh Hùng yêu cầu Argon2 hoặc bcrypt. Cả hai đều là thư viện npm, mà kho này
 * giữ luật KHÔNG dependency: `buildCommand: ""` trên Render, không có
 * node_modules, deploy xong trong vài giây. Thêm npm là đổi cách build của cả
 * 10 app.
 *
 * `scrypt` có sẵn trong Node, cùng họ memory-hard với Argon2 (bắt kẻ dò mật
 * khẩu phải trả RAM chứ không chỉ trả CPU — đó mới là thứ chặn được GPU), và
 * nằm trong danh sách OWASP khuyến nghị cho lưu mật khẩu. Về an toàn tương
 * đương bcrypt, chỉ khác là không phải cài gì.
 *
 * Tham số: N=2^15, r=8, p=1, khoá 32 byte, muối 16 byte ngẫu nhiên.
 * N=2^15 × r=8 ăn 32 MB RAM mỗi lần băm — nên phải nâng `maxmem`, mặc định của
 * Node đúng 32 MB và sẽ ném lỗi ngay ở ranh giới. Đo trên máy: ~90ms/lần. Đủ
 * chậm để dò là vô vọng, đủ nhanh để người thật không thấy gì.
 *
 * Chuỗi lưu xuống Base mang theo THAM SỐ của chính nó:
 *   scrypt$1$32768$8$1$<muối b64>$<băm b64>
 * Nên sau này nâng N lên cũng đọc được bản băm cũ — không ai bị khoá ra ngoài
 * vì mình đổi tham số.
 *
 * ---------------------------------------------------------------------------
 * ĐÂY LÀ CỬA MỞ RA INTERNET. Mấy điều bắt buộc, đã cài ở đây hoặc ở auth.js:
 *
 *   1. Đăng ký KHÔNG cấp gì cả. Trạng thái `Chờ duyệt` = đăng nhập vẫn bị từ
 *      chối. Quản lý duyệt mới thành `Hoạt động`.
 *   2. KHÔNG nói email nào đã có. Đăng ký trùng email trả về đúng câu như đăng
 *      ký mới — không thì trang này thành máy dò xem ai đang dùng hệ thống.
 *   3. Sai mật khẩu và không có tài khoản trả về CÙNG một câu, và tốn CÙNG một
 *      khoảng thời gian (xem `kiemMatKhau`).
 *   4. Tài khoản mật khẩu KHÔNG BAO GIỜ được làm quản lý — chốt ở server.js.
 *   5. Chặn tần suất ở auth.js (xem chan-tan-suat.js).
 */
const crypto = require('crypto');
const baseLark = require('./base-lark');

/* Cùng Base với Phân quyền, Thông báo và ô phát — phòng chỉ phải chia sẻ MỘT
 * Base cho app. Bảng thì phải tạo trước: `node thiet-lap/tao-bang-tai-khoan.js`. */
const BASE = process.env.HUB_TK_BASE || process.env.HUB_TB_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG';
const TABLE = process.env.HUB_TK_TABLE || '';

const C = {
  ten: 'Tên',
  email: 'Email',
  bam: 'Băm',
  trangThai: 'Trạng thái',
  taoLuc: 'Tạo lúc',
  duyetLuc: 'Duyệt lúc',
  dangNhapCuoi: 'Đăng nhập cuối',
  phienTu: 'Phiên từ',
  ghiChu: 'Ghi chú',
};

const TT = { cho: 'Chờ duyệt', hoatDong: 'Hoạt động', khoa: 'Khoá', tuChoi: 'Từ chối' };

const B = TABLE ? baseLark.bang(BASE, TABLE, null) : null;

let loiCuoi = '';
const bao = (e) => { loiCuoi = e && e.message ? e.message : String(e || ''); };

function co() { return !!B; }
function loi() { return loiCuoi; }

/* ---------------- băm ---------------- */

const N = 32768, R = 8, P = 1, DAI = 32, MUOI = 16;
/* maxmem phải > 128*N*r = 32 MB, nếu không Node ném "Invalid scrypt params" —
 * và ném ở đúng tham số mà tài liệu OWASP khuyên dùng. */
const MAXMEM = 96 * 1024 * 1024;

function scrypt(mk, muoi, n, r, p, dai) {
  return new Promise((xong, hong) => {
    crypto.scrypt(String(mk).normalize('NFKC'), muoi, dai, { N: n, r, p, maxmem: MAXMEM },
      (e, kq) => (e ? hong(e) : xong(kq)));
  });
}

/** Băm mật khẩu thành chuỗi tự mô tả tham số. */
async function bamMk(mk) {
  const muoi = crypto.randomBytes(MUOI);
  const h = await scrypt(mk, muoi, N, R, P, DAI);
  return ['scrypt', '1', N, R, P, muoi.toString('base64'), h.toString('base64')].join('$');
}

/**
 * So mật khẩu với chuỗi băm. Đọc tham số TỪ CHÍNH chuỗi đó, nên bản băm sinh ra
 * bằng tham số cũ vẫn kiểm được sau khi mình nâng N.
 */
async function soMk(mk, chuoi) {
  const ph = String(chuoi || '').split('$');
  if (ph.length !== 7 || ph[0] !== 'scrypt') return false;
  const n = Number(ph[2]), r = Number(ph[3]), p = Number(ph[4]);
  if (!(n > 1 && r > 0 && p > 0)) return false;
  let muoi, mong;
  try {
    muoi = Buffer.from(ph[5], 'base64');
    mong = Buffer.from(ph[6], 'base64');
  } catch (_) { return false; }
  if (!muoi.length || !mong.length) return false;
  let thay;
  try { thay = await scrypt(mk, muoi, n, r, p, mong.length); } catch (_) { return false; }
  return thay.length === mong.length && crypto.timingSafeEqual(thay, mong);
}

/* ---------------- đọc/ghi Base ---------------- */

const chuan = (s) => String(s || '').trim().toLowerCase();

/* Đệm ngắn: mỗi request đã đăng nhập đều phải đọc lại hàng để biết tài khoản có
 * bị khoá hay phiên có bị huỷ chưa. Không đệm là mỗi lần bấm một vòng gọi Lark.
 * 30 giây: khoá một tài khoản thì chậm nhất nửa phút là người đó văng ra. */
const DEM_MS = 30000;
let dem = { at: 0, ds: null };

function xoaDem() { dem = { at: 0, ds: null }; }

/** Mọi tài khoản. Trả về [] khi chưa khai bảng — app vẫn chạy, chỉ là không có đăng nhập mật khẩu. */
async function docHet(moi) {
  if (!B) return [];
  if (!moi && dem.ds && Date.now() - dem.at < DEM_MS) return dem.ds;
  try {
    const ds = (await B.docHet()).map((d) => ({
      recordId: d.recordId,
      ten: String(d[C.ten] || '').trim(),
      email: chuan(d[C.email]),
      bam: String(d[C.bam] || '').trim(),
      trangThai: String(d[C.trangThai] || '').trim() || TT.cho,
      taoLuc: String(d[C.taoLuc] || ''),
      duyetLuc: String(d[C.duyetLuc] || ''),
      dangNhapCuoi: String(d[C.dangNhapCuoi] || ''),
      phienTu: Number(d[C.phienTu] || 0) || 0,
      ghiChu: String(d[C.ghiChu] || ''),
    })).filter((x) => x.email);
    dem = { at: Date.now(), ds };
    loiCuoi = '';
    return ds;
  } catch (e) {
    /* Base hỏng thì NHỚ CẢ CÁI HỎNG, đừng gọi lại ngay.
     *
     * Đo ngày 22/09/2026 với bảng khai sai id: mỗi lần thử mật khẩu tốn ~450ms
     * chờ Lark trả lỗi. Nghĩa là ai cũng bắt server mình gọi Lark được chỉ bằng
     * cách gõ sai mật khẩu, và thời gian trả lời khi đó phơi ra "email này không
     * có trong hệ thống" — đúng thứ `dotThoiGian` sinh ra để giấu.
     *
     * Nhớ 5 giây: đủ để một trận dò không thành cần cẩu kéo Lark, mà Base vừa
     * sống lại thì cũng chỉ chậm 5 giây là nhận ra. */
    bao(e);
    dem = { at: Date.now() - (DEM_MS - 5000), ds: dem.ds || [] };
    return dem.ds;
  }
}

async function theoEmail(mail, moi) {
  const m = chuan(mail);
  if (!m) return null;
  return (await docHet(moi)).find((x) => x.email === m) || null;
}

/* ---------------- đăng ký ---------------- */

const LA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Luật mật khẩu. Ngắn gọn và nói thẳng thiếu gì — đừng bắt đoán. */
function xetMk(mk) {
  const s = String(mk || '');
  if (s.length < 10) return 'Mật khẩu phải từ 10 ký tự trở lên.';
  if (s.length > 200) return 'Mật khẩu dài quá 200 ký tự.';
  if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) return 'Mật khẩu phải có cả chữ và số.';
  return '';
}

/* Trần số tài khoản đang chờ duyệt. Cửa đăng ký mở ra internet nên phải có mức
 * trần: không thì một con bot đẩy vài nghìn dòng rác vào Base của phòng trong
 * một đêm. Chạm trần thì đăng ký tạm đóng cho tới khi quản lý dọn. */
const CHO_TOI_DA = Number(process.env.HUB_TK_CHO_TOI_DA || 50);

/**
 * Đăng ký. LUÔN trả về { ok: true } khi dữ liệu hợp lệ — kể cả khi email đã có
 * tài khoản. Chỗ gọi in đúng một câu "đã gửi, chờ duyệt" cho mọi trường hợp, để
 * trang này không dùng được làm máy dò xem ai đang có tài khoản.
 */
async function dangKy({ ten, email, mk }) {
  if (!B) return { ok: false, loi: 'Chưa bật đăng nhập mật khẩu.' };
  const m = chuan(email);
  const t = String(ten || '').trim().slice(0, 80);
  if (!t) return { ok: false, loi: 'Chưa điền tên.' };
  if (!LA_EMAIL.test(m) || m.length > 120) return { ok: false, loi: 'Email không hợp lệ.' };
  const loiMk = xetMk(mk);
  if (loiMk) return { ok: false, loi: loiMk };

  try {
    const ds = await docHet(true);
    if (ds.some((x) => x.email === m)) return { ok: true, trung: true };
    if (ds.filter((x) => x.trangThai === TT.cho).length >= CHO_TOI_DA) {
      return { ok: false, loi: 'Danh sách chờ duyệt đang đầy. Liên hệ quản lý.' };
    }
    const bam = await bamMk(mk);
    await B.tao({
      [C.ten]: t, [C.email]: m, [C.bam]: bam,
      [C.trangThai]: TT.cho, [C.taoLuc]: new Date().toISOString(),
    });
    xoaDem();
    loiCuoi = '';
    return { ok: true };
  } catch (e) { bao(e); return { ok: false, loi: 'Không ghi được lên Base.' }; }
}

/* ---------------- đăng nhập ---------------- */

/* Một bản băm giả để đốt thời gian khi KHÔNG tìm thấy tài khoản. Không có nó
 * thì email chưa đăng ký trả lời trong 1ms còn email có thật mất 90ms — đo thời
 * gian là biết ai đang dùng hệ thống, dù câu trả lời giống hệt nhau. */
let bamGia = null;
async function dotThoiGian(mk) {
  if (!bamGia) bamGia = await bamMk('khong-phai-mat-khau-cua-ai-ca');
  try { await soMk(mk, bamGia); } catch (_) { /* chỉ để tốn thời gian */ }
}

/**
 * Kiểm mật khẩu. Trả { ok, nguoi } hoặc { ok: false, lyDo }.
 *
 * `lyDo` phân biệt được ở NHẬT KÝ, nhưng chỗ gọi chỉ in một câu chung cho
 * 'sai' và 'khong-co' — xem auth.js.
 */
async function kiemMatKhau(email, mk) {
  if (!B) return { ok: false, lyDo: 'tat' };
  /* ĐỌC TỪ ĐỆM, đừng ép làm mới.
   *
   * Đo ngày 22/09/2026: bản đầu để `moi = true` nên mỗi lần thử mật khẩu là một
   * vòng gọi Lark. Ba cái hại, cái thứ ba mới là cái khó thấy:
   *   1. chậm — người gõ đúng cũng phải chờ một vòng mạng;
   *   2. ai cũng bắt server mình gọi Lark được, chỉ bằng cách gõ sai mật khẩu;
   *   3. thời gian trả lời phụ thuộc vào Base, nên nó CHE MẤT cái
   *      `dotThoiGian` đang cố làm — đo được 462ms cho email không tồn tại và
   *      62ms cho email có thật, đúng cái chênh lệch mà hàm kia sinh ra để xoá.
   *
   * Đệm 30 giây. Vừa duyệt xong mà người ta đăng nhập ngay thì `doiTrangThai`
   * đã gọi `xoaDem()` rồi, nên không ai phải chờ. */
  const tk = await theoEmail(email);
  if (!tk || !tk.bam) { await dotThoiGian(mk); return { ok: false, lyDo: 'khong-co' }; }
  const dung = await soMk(mk, tk.bam);
  if (!dung) return { ok: false, lyDo: 'sai' };
  if (tk.trangThai === TT.cho) return { ok: false, lyDo: 'cho-duyet' };
  if (tk.trangThai !== TT.hoatDong) return { ok: false, lyDo: 'khoa' };
  return { ok: true, nguoi: { id: 'mk:' + tk.recordId, name: tk.ten || tk.email, email: tk.email } };
}

/** Ghi lại lần đăng nhập gần nhất. Hỏng cũng không được chặn người ta vào. */
async function ghiDangNhap(recordId) {
  if (!B) return;
  try { await B.ghi(recordId, { [C.dangNhapCuoi]: new Date().toISOString() }); }
  catch (e) { bao(e); }
}

/* ---------------- huỷ phiên ---------------- */

/**
 * Mốc "mọi phiên cấp TRƯỚC lúc này đều hết hiệu lực", lưu trên Base.
 *
 * Phiên của hub là cookie tự chứng thực (ký HMAC), không có kho phiên ở server —
 * nên đăng xuất chỉ xoá cookie ở máy người dùng, còn ai đã sao được chuỗi cookie
 * thì vẫn dùng tiếp tới ngày hết hạn. Đó đúng là mục anh Hùng nêu: "làm cho
 * phiên cũ hết tác dụng ngay khi người dùng đăng xuất".
 *
 * Cách vá mà không cần kho phiên: cookie mang `iat` (cấp lúc nào), hàng tài
 * khoản mang `Phiên từ`. `iat < Phiên từ` là cookie chết. Ghi lên Base nên sống
 * qua cả deploy lẫn restart — khác với danh sách trong RAM, cứ restart là kẻ
 * cầm cookie cũ lại vào được.
 */
async function huyPhien(recordId) {
  if (!B) return false;
  try {
    await B.ghi(recordId, { [C.phienTu]: String(Date.now()) });
    xoaDem();
    loiCuoi = '';
    return true;
  } catch (e) { bao(e); return false; }
}

/** Cookie này còn sống không (theo mốc huỷ phiên của chính tài khoản đó). */
async function conHan(recordId, iat) {
  const tk = (await docHet()).find((x) => x.recordId === recordId);
  if (!tk) return false;                       // hàng bị xoá -> hết đường vào
  if (tk.trangThai !== TT.hoatDong) return false;
  return !(tk.phienTu && Number(iat || 0) < tk.phienTu);
}

/* ---------------- quản lý ---------------- */

async function doiTrangThai(recordId, tt) {
  if (!B) return { ok: false, loi: 'Chưa bật đăng nhập mật khẩu.' };
  if (!Object.values(TT).includes(tt)) return { ok: false, loi: 'Trạng thái lạ.' };
  try {
    const cells = { [C.trangThai]: tt };
    if (tt === TT.hoatDong) cells[C.duyetLuc] = new Date().toISOString();
    /* Khoá hay từ chối thì đá luôn mọi phiên đang mở, đừng đợi cookie hết hạn. */
    if (tt !== TT.hoatDong) cells[C.phienTu] = String(Date.now());
    await B.ghi(recordId, cells);
    xoaDem();
    return { ok: true };
  } catch (e) { bao(e); return { ok: false, loi: 'Không ghi được lên Base.' }; }
}

async function datLaiMk(recordId, mk) {
  if (!B) return { ok: false, loi: 'Chưa bật đăng nhập mật khẩu.' };
  const loiMk = xetMk(mk);
  if (loiMk) return { ok: false, loi: loiMk };
  try {
    /* Đổi mật khẩu là đá mọi phiên đang mở — đây là việc người ta làm khi nghi
     * mật khẩu đã lộ, mà phiên cũ vẫn chạy thì đổi cũng như không. */
    await B.ghi(recordId, { [C.bam]: await bamMk(mk), [C.phienTu]: String(Date.now()) });
    xoaDem();
    return { ok: true };
  } catch (e) { bao(e); return { ok: false, loi: 'Không ghi được lên Base.' }; }
}

async function xoaTk(recordId) {
  if (!B) return { ok: false, loi: 'Chưa bật đăng nhập mật khẩu.' };
  try { await B.xoa(recordId); xoaDem(); return { ok: true }; }
  catch (e) { bao(e); return { ok: false, loi: 'Không xoá được trên Base.' }; }
}

/** Danh sách cho panel quản lý — KHÔNG kèm chuỗi băm. */
async function dsChoPanel() {
  const ds = await docHet(true);
  return ds.map((x) => ({
    id: x.recordId, ten: x.ten, email: x.email,
    trangThai: x.trangThai, taoLuc: x.taoLuc, ghiChu: x.ghiChu,
    duyetLuc: x.duyetLuc, dangNhapCuoi: x.dangNhapCuoi,
  })).sort((a, b) => {
    const ua = a.trangThai === TT.cho ? 0 : 1;
    const ub = b.trangThai === TT.cho ? 0 : 1;
    return ua - ub || String(a.taoLuc).localeCompare(String(b.taoLuc));
  });
}

module.exports = {
  co, loi, TT, BASE, TABLE,
  bamMk, soMk, xetMk,
  dangKy, kiemMatKhau, ghiDangNhap,
  huyPhien, conHan,
  doiTrangThai, datLaiMk, xoaTk, dsChoPanel, docHet, theoEmail, xoaDem,
};
