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
  const ra = new Set();
  const the = new Set(theCuaBai(bai.title));
  if (the.size) {
    dsNhan.forEach((n) => { if (n.the.some((t) => the.has(t))) ra.add(n.nhan); });
  }
  /* Nhãn gắn bù cho bài cũ, hoặc người phụ trách gắn tay trong Base. Chỉ nhận
   * những tên có thật trong bảng Nhãn — gõ sai một chữ thì thà không tính còn
   * hơn đẻ ra một nhãn ma chỉ tồn tại ở đúng một bài. */
  if (bai.nhanBu) {
    const hopLe = new Set(dsNhan.map((n) => n.nhan));
    String(bai.nhanBu).split(/\s*[,;|]\s*/).forEach((x) => {
      const t = x.trim();
      if (t && hopLe.has(t)) ra.add(t);
    });
  }
  return [...ra];
}

/** Bài này nhận nhãn nhờ hashtag hay nhờ gắn bù — để màn hình nói rõ. */
function nguonNhan(bai, dsNhan) {
  const the = new Set(theCuaBai(bai.title));
  const coThe = dsNhan.some((n) => n.the.some((t) => the.has(t)));
  return coThe ? 'hashtag' : (bai.nhanBu ? 'gắn bù' : '');
}

/**
 * Bỏ dấu tiếng Việt, để "#hònthơm" và "#honthom" coi như một khi đi tìm thẻ
 * gần giống. Đội nội dung gõ cả hai kiểu, tuỳ bàn phím và tuỳ người.
 */
function khongDau(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/* Những mảnh chữ xuất hiện trong gần như mọi caption của Rooty Trip. Lấy chúng
 * làm manh mối tìm thẻ gần giống thì thẻ nào cũng "gần giống" — gợi ý ra bốn
 * trăm thẻ là không còn là gợi ý nữa. */
const QUA_CHUNG = new Set(['phu', 'quoc', 'phuquoc', 'dulich', 'du', 'lich', 'tour',
  'rooty', 'trip', 'rootytrip', 'viral', 'xuhuong', 'fyp', 'reels', 'reelsfb', 'combo',
  'island', 'travel', 'video', 'tiktok', 'shorts']);

/**
 * Độ dài tiền tố chung của hai chuỗi.
 *
 * Cần vì đội nội dung viết cả "#vinwonders" lẫn "#vinwonderphuquoc" — không
 * chuỗi nào chứa chuỗi nào, nhưng chung gốc "vinwonder". Ngưỡng 6 đủ chặt để
 * "combophuquoc" và "combodulich" (chung "combo", 5) không kéo nhau vào.
 */
function goiChung(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Gợi ý hashtag có thể thuộc về một nhãn, để đỡ bỏ sót.
 *
 * Manh mối lấy từ hai chỗ: các hashtag ĐÃ khai cho nhãn đó, và tên nhãn. Một thẻ
 * được gợi ý khi nó chứa (hoặc nằm trong) một manh mối đủ dài — "#honthom" kéo
 * theo "#captreohonthom", "#honthomphuquoc".
 *
 * Chỉ gợi ý thẻ CHƯA thuộc nhãn nào khác: thẻ đã có chủ mà còn đem gợi ý cho
 * nhãn thứ hai thì hai nhãn cùng đếm một bài, và tổng của hai đối tác cộng lại
 * lớn hơn số bài thật.
 */
function goiYThe(nhanNay, tatCaThe, daThuocNhanKhac, tongBai) {
  const manhMoi = [];
  tachThe(nhanNay.hashtag || (nhanNay.the || []).join(' ')).forEach((t) => {
    const g = khongDau(t).replace(/^#/, '');
    if (g.length >= 4 && !QUA_CHUNG.has(g)) manhMoi.push(g);
  });
  khongDau(nhanNay.nhan || '').split(/[^a-z0-9]+/).forEach((w) => {
    if (w.length >= 5 && !QUA_CHUNG.has(w)) manhMoi.push(w);
  });
  if (!manhMoi.length) return [];

  const daCo = new Set(tachThe(nhanNay.hashtag || (nhanNay.the || []).join(' ')));
  /* Thẻ phủ hơn một phần tư số bài là thẻ kênh chứ không phải thẻ chủ đề —
   * #phuquoc, #dulichphuquoc, #rootytrip. Gán chúng cho một đối tác là đối tác
   * đó bỗng "có" gần hết số bài của công ty. Danh sách QUA_CHUNG không bao giờ
   * kể hết được, nên chặn thêm bằng độ phủ. */
  const tranPhu = num(tongBai) ? num(tongBai) * 0.25 : Infinity;
  return (tatCaThe || [])
    .filter((x) => !daCo.has(x.the) && !daThuocNhanKhac.has(x.the))
    .filter((x) => !QUA_CHUNG.has(khongDau(x.the).replace(/^#/, '')))
    .filter((x) => num(x.soBai) <= tranPhu)
    .filter((x) => {
      const g = khongDau(x.the).replace(/^#/, '');
      /* Thẻ một hai ký tự (#h, #1, #ho — đội nội dung gõ nhầm hoặc cắt dở) nằm
       * trong mọi chuỗi, nên `m.includes(g)` cho chúng khớp với tất cả. Gợi ý
       * "#h" cho nhãn Hòn Thơm thì người dùng mất tin vào cả danh sách. */
      if (g.length < 4) return false;
      return manhMoi.some((m) => g.includes(m) || m.includes(g) || goiChung(g, m) >= 6);
    })
    .sort((a, b) => b.soBai - a.soBai)
    .slice(0, 12);
}

/** Mọi hashtag xuất hiện trong bài, kèm số bài và nhãn đang giữ nó (nếu có). */
function thongKeThe(posts, dsNhan) {
  const chu = new Map();
  (dsNhan || []).forEach((n) => n.the.forEach((t) => chu.set(t, n.nhan)));
  const m = new Map();
  (posts || []).forEach((p) => {
    theCuaBai(p.title).forEach((t) => {
      if (!m.has(t)) m.set(t, { the: t, soBai: 0, views: 0, thuocNhan: chu.get(t) || '' });
      const o = m.get(t);
      o.soBai++;
      o.views += num(p.views);
    });
  });
  return [...m.values()].sort((a, b) => b.soBai - a.soBai);
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
    soBai: 0, soCoXem: 0, soGanBu: 0, bai: [],
    ...CONG.reduce((o, k) => (o[k] = 0, o), {}),
  }));

  (posts || []).forEach((p) => {
    nhanCuaBai(p, dsNhan).forEach((ten) => {
      const o = m.get(ten);
      if (!o) return;
      o.soBai++;
      if (nguonNhan(p, dsNhan) === 'gắn bù') o.soGanBu++;
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
  tachThe, theCuaBai, khongDau, goiYThe, thongKeThe, QUA_CHUNG,
  chuanHoaNhan, nhanCuaBai, nguonNhan, gopTheoNhan, baiKhongNhan,
  dongCsv, csvChoNhan, BOM, CONG,
};
