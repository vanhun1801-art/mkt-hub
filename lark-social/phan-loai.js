'use strict';
/**
 * PHÂN LOẠI BÀI: Bán hàng hay Tương tác — theo đúng một dấu hiệu, là hashtag.
 *
 * Anh Hùng chốt ngày 23/09/2026: bài mang thẻ #Tour là BÁN HÀNG, còn lại là
 * TƯƠNG TÁC. Có hiệu lực chính thức từ 01/10/2026; từ giờ tới đó chạy trước cho
 * quen tay và để thấy sớm nếu có gì lệch.
 *
 * VÌ SAO MỘT LUẬT MÁY MÓC LẠI TỐT HƠN CÁCH CŨ.
 * Bản trước (muc-dich.js) suy mục đích từ bảng Nhãn bài: mỗi nhãn tự khai nó là
 * Bán hàng hay Tương tác, rồi bài nào mang nhãn nào thì suy ra. Nghe hợp lý
 * nhưng đo thật thì 29% số bài không nhãn nào nói lên mục đích — nghĩa là gần
 * một phần ba phải điền tay mỗi tháng, và "điền tay mỗi tháng" thì tháng thứ ba
 * là không ai làm nữa. Một thẻ, một luật, không có vùng xám.
 *
 * CỘT NÀY DO MÁY GIỮ, KHÔNG PHẢI Ô ĐỂ SỬA TAY.
 * Mỗi lượt đồng bộ tính lại toàn bộ và ghi đè. Anh Hùng nói "còn lại là tương
 * tác hết" — hết nghĩa là không có ngoại lệ. Sửa tay một ô thì lượt đồng bộ sau
 * ghi lại như cũ; muốn đổi một bài thì sửa hashtag trên bài, hoặc bảo tôi thêm
 * một cột ngoại lệ riêng. Nói trước ở đây để sau này không ai ngồi sửa tay rồi
 * tưởng app nuốt mất.
 *
 * KHỚP THẺ NGUYÊN VẸN, KHÔNG KHỚP TIỀN TỐ.
 * #Tour là #Tour, không phải #tourdao hay #tourphuquoc. Đo trên dữ liệu thật:
 * 134 bài mang đúng #tour, nhưng 316 bài mang thẻ bắt đầu bằng "tour" — chênh
 * nhau 182 bài. Khớp tiền tố là tự nới luật của anh Hùng ra gấp đôi mà không ai
 * quyết. Muốn tính thêm thẻ nào thì khai vào SOCIAL_THE_BAN_HANG, mỗi thẻ cách
 * nhau dấu phẩy — đó là chỗ để quyết, không phải trong mã.
 */
const cfg = require('./config');
const lark = require('./lark');

const BAN_HANG = 'Bán hàng';
const TUONG_TAC = 'Tương tác';

/** Chuẩn hoá một thẻ người ta gõ: thêm #, bỏ hoa thường, bỏ khoảng trắng. */
const chuanThe = (s) => {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return '';
  return t.startsWith('#') ? t : '#' + t;
};

const THE_BAN_HANG = new Set(
  String(process.env.SOCIAL_THE_BAN_HANG || '#Tour')
    .split(/[\s,;|]+/).map(chuanThe).filter(Boolean),
);

/** Mọi hashtag trong caption, viết thường, không trùng. */
function theCuaBai(caption) {
  const ds = String(caption || '').match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(ds.map((x) => x.toLowerCase()))];
}

/** Bài này là Bán hàng hay Tương tác. Không bao giờ trả về rỗng. */
function loaiCuaBai(caption) {
  return theCuaBai(caption).some((t) => THE_BAN_HANG.has(t)) ? BAN_HANG : TUONG_TAC;
}

/**
 * Tính lại mục đích cho cả kho bài, trả về những dòng CẦN đổi.
 *
 * Chỉ trả dòng lệch, không trả tất cả: ghi 2.525 dòng mỗi lượt đồng bộ chỉ để
 * ghi lại đúng cái đang có là mười mấy lô gọi Lark cho vui.
 */
function tinh(posts) {
  const f = cfg.tables.post.f;
  const doi = {};
  let ban = 0;
  let tuong = 0;
  (posts || []).forEach((p) => {
    const moi = loaiCuaBai(p.title);
    if (moi === BAN_HANG) ban += 1; else tuong += 1;
    if (String(p.mucDich || '').trim() !== moi) doi[p.id] = { [f.mucDich]: moi };
  });
  return { doi, ban, tuong, soDoi: Object.keys(doi).length };
}

/** Tính rồi ghi. Gọi sau mỗi lượt đồng bộ. */
async function chay(posts) {
  const r = tinh(posts);
  if (r.soDoi) await lark.updateMany(cfg.tables.post.id, r.doi);
  return r;
}

module.exports = {
  chay, tinh, loaiCuaBai, theCuaBai, chuanThe,
  THE_BAN_HANG, BAN_HANG, TUONG_TAC,
};
