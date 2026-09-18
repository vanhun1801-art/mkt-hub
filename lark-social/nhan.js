'use strict';
/**
 * Gắn nhãn bài đăng theo hashtag, để lọc và báo cáo cho đối tác.
 *
 * Anh Hùng ra quy định cho đội nội dung gắn hashtag trên từng bài, rồi cuối
 * tháng lọc theo hashtag lấy số gửi đối tác. Module này đọc bảng "Nhãn bài"
 * trên Base — mỗi dòng là một nhãn kèm danh sách hashtag của nó — rồi soi
 * caption từng bài.
 *
 * VÌ SAO CẦN BẢNG NHÃN chứ không đọc thẳng hashtag:
 *   · Một đối tác có nhiều hashtag. Báo cáo Vinpearl phải gộp cả
 *     #vinpearlsafariphuquoc, #vinpearlvinwondersphuquoc và
 *     #vinpearlgrandworldphuquoc — đọc thẳng hashtag thì ra ba dòng rời.
 *   · Hashtag là chuỗi không dấu viết dính; báo cáo gửi đối tác cần tên người
 *     đọc được ("VinWonders Phú Quốc").
 *   · Quy định sẽ đổi. Sửa một dòng trong Base xong là số tính lại cho cả lịch
 *     sử, không phải nhờ ai sửa code rồi deploy.
 *
 * ĐÃ NÓI TRƯỚC VỚI ANH HÙNG, để sau này đọc lại không tưởng là bỏ sót: đo bằng
 * hashtag thì bài nào content quên gõ sẽ không vào báo cáo. Đo trên 1.329 bài
 * đang có: 198 bài nhắc "Vinwonder" trong caption nhưng chỉ 162 bài có hashtag
 * tương ứng — hụt 36 bài. Anh chọn đo theo hashtag và sẽ siết quy định để từ nay
 * gắn đủ; module vì thế CHỈ đọc hashtag, đúng như vậy.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Tách chuỗi hashtag người dùng gõ trong Base thành mảng đã chuẩn hoá. */
function tachThe(s) {
  return String(s || '')
    .split(/[\s,;|]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .map((x) => (x.startsWith('#') ? x : '#' + x));
}

/** Mọi hashtag trong một caption, viết thường, không trùng. */
function theCuaBai(caption) {
  const ds = String(caption || '').match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(ds.map((x) => x.toLowerCase()))];
}

/**
 * Chuẩn hoá bảng nhãn đọc từ Base.
 * @returns [{ nhan, nhom, doiTac, the: [...], ghiChu }]
 */
function chuanHoaNhan(rows) {
  return (rows || [])
    .map((r) => ({
      nhan: String(r.nhan || '').trim(),
      nhom: String(r.nhom || '').trim(),
      doiTac: String(r.doiTac || '').trim(),
      ghiChu: String(r.ghiChu || '').trim(),
      bat: r.bat !== false,
      the: tachThe(r.hashtag),
    }))
    .filter((x) => x.nhan && x.bat && x.the.length);
}

/**
 * Gắn nhãn cho một bài.
 * Một bài có thể mang nhiều nhãn (vừa là địa điểm, vừa là mã tour) — đó là
 * chuyện bình thường, không phải lỗi.
 */
function nhanCuaBai(bai, dsNhan) {
  const the = new Set(theCuaBai(bai.title));
  if (!the.size) return [];
  return dsNhan.filter((n) => n.the.some((t) => the.has(t))).map((n) => n.nhan);
}

const CONG = ['views', 'reach', 'impressions', 'likes', 'comments', 'shares', 'saves', 'engagement'];

/**
 * Gộp số theo từng nhãn.
 *
 * `soBai` đếm mọi bài mang nhãn; `soCoXem` chỉ đếm bài đo được lượt xem —
 * Facebook không trả lượt xem cho bài chữ, nên cộng cả số 0 của chúng vào rồi
 * chia trung bình là ra một con số thấp giả tạo.
 */
function gopTheoNhan(posts, dsNhan) {
  const m = new Map();
  dsNhan.forEach((n) => m.set(n.nhan, {
    nhan: n.nhan, nhom: n.nhom, doiTac: n.doiTac, the: n.the,
    soBai: 0, soCoXem: 0, bai: [],
    ...CONG.reduce((o, k) => (o[k] = 0, o), {}),
  }));

  (posts || []).forEach((p) => {
    nhanCuaBai(p, dsNhan).forEach((ten) => {
      const o = m.get(ten);
      if (!o) return;
      o.soBai++;
      if (num(p.views) > 0) o.soCoXem++;
      CONG.forEach((k) => { o[k] += num(p[k]); });
      o.bai.push(p);
    });
  });

  return [...m.values()].map((o) => ({
    ...o,
    bai: o.bai.sort((a, b) => num(b.views) - num(a.views)),
    /* Mẫu số chọn theo từng bài rồi mới cộng — cùng luật với metrics.agg(). */
    tyLeTuongTac: (() => {
      const mau = o.bai.reduce((s, p) => s + (num(p.reach) || num(p.views)), 0);
      return mau ? o.engagement / mau : 0;
    })(),
  })).sort((a, b) => b.views - a.views || b.soBai - a.soBai);
}

/** Bài không mang nhãn nào — để biết quy định đang được theo tới đâu. */
function baiKhongNhan(posts, dsNhan) {
  return (posts || []).filter((p) => !nhanCuaBai(p, dsNhan).length);
}

/**
 * Một dòng CSV.
 *
 * Excel của Việt Nam mặc định đọc CSV bằng dấu chấm phẩy và bảng mã hệ thống.
 * Dùng dấu phẩy + UTF-8 không BOM là mở ra thấy "Ph├║ Qu盻托" và mọi cột dồn vào
 * một ô — file gửi đối tác mà thế thì hỏng việc. Nên: phân tách bằng dấu chấm
 * phẩy, và bên gọi phải thêm BOM.
 */
function dongCsv(cot) {
  return cot.map((v) => {
    const s = String(v == null ? '' : v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';');
}

const BOM = '﻿';

/** Bảng CSV cho một nhãn: mỗi bài một dòng, kèm một dòng tổng ở cuối. */
function csvChoNhan(o, khoang) {
  const d = [];
  d.push(dongCsv(['Báo cáo nhãn', o.nhan]));
  if (o.doiTac) d.push(dongCsv(['Đối tác', o.doiTac]));
  d.push(dongCsv(['Hashtag', o.the.join(' ')]));
  d.push(dongCsv(['Khoảng thời gian', (khoang && khoang.tu) + ' → ' + (khoang && khoang.den)]));
  d.push('');
  d.push(dongCsv(['Ngày đăng', 'Nền tảng', 'Kênh', 'Dạng', 'Nội dung', 'Link',
    'Lượt xem', 'Tiếp cận', 'Thích', 'Bình luận', 'Chia sẻ', 'Tương tác']));
  o.bai.forEach((p) => d.push(dongCsv([
    String(p.date || '').slice(0, 10), p.platform || '', p.channel || '', p.type || '',
    String(p.title || '').replace(/\s+/g, ' ').slice(0, 300), p.url || '',
    num(p.views), num(p.reach), num(p.likes), num(p.comments), num(p.shares), num(p.engagement),
  ])));
  d.push('');
  d.push(dongCsv(['TỔNG', o.soBai + ' bài', '', '', '', '',
    o.views, o.reach, o.likes, o.comments, o.shares, o.engagement]));
  return BOM + d.join('\r\n');
}

module.exports = {
  tachThe, theCuaBai, chuanHoaNhan, nhanCuaBai, gopTheoNhan, baiKhongNhan,
  dongCsv, csvChoNhan, BOM, CONG,
};
