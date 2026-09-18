'use strict';
/**
 * Gắn bù nhãn cho bài cũ — CHẠY MỘT LẦN, bằng tay.
 *
 * Từ ngày anh Hùng ra quy định, bài mới nhận nhãn bằng hashtag. Nhưng 1.329 bài
 * đã đăng trước đó phần lớn không có hashtag quy định, mà đối tác vẫn muốn xem
 * số của giai đoạn đã qua. Script này dò TỪ KHOÁ trong caption (cột "Từ khoá
 * (chỉ để gắn bù bài cũ)" của bảng Nhãn bài) rồi ghi tên nhãn vào cột "Nhãn gắn
 * bù" của bảng Bài đăng.
 *
 * CỐ Ý TÁCH KHỎI ĐƯỜNG CHẠY HẰNG NGÀY. Đồng bộ không bao giờ động vào cột này,
 * và app cũng không tự dò từ khoá — nếu nó lén dò thì số trong báo cáo sẽ không
 * khớp với thứ đội nội dung gắn, và không ai giải thích nổi vì sao.
 *
 * KHÔNG ĐÈ NHÃN ĐÃ CÓ. Bài nào đã có hashtag đúng thì bỏ qua; bài nào đã được
 * gắn tay thì giữ nguyên. Chạy lại lần hai không làm hỏng gì.
 *
 *   node gan-bu.js            → chỉ xem trước, không ghi
 *   node gan-bu.js --ghi      → ghi thật
 */
const cfg = require('./config');
const store = require('./store');
const lark = require('./lark');
const nhan = require('./nhan');

const GHI = process.argv.includes('--ghi');

/* Chỉ chặn ranh giới ĐẦU, không chặn đuôi.
 *
 * Hai lý do. Một: `\b` của JavaScript coi chữ có dấu là dấu phân cách nên
 * không dùng được với tiếng Việt (xem binh-luan.js). Hai: chặn cả đuôi thì
 * "vinwonder" KHÔNG khớp "VinWonders" — thử thật, 197 bài nhắc tên mà chỉ gắn
 * bù được đúng 1. Tên riêng thì hậu tố là chuyện thường ("VinWonders",
 * "safaris"), còn tiền tố thì không, nên chặn đầu là đủ: "advinwonder" vẫn
 * không khớp.
 */
const thoat = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bien = (t) => new RegExp('(?<!\\p{L})' + thoat(t), 'iu');

function tachTuKhoa(s) {
  return String(s || '').split(/[,;|]+/).map((x) => x.trim()).filter(Boolean);
}

(async () => {
  const d = await store.tai();
  const tho = await store.taiNhan();
  const dsNhan = nhan.chuanHoaNhan(tho);
  const tuKhoa = new Map(tho.map((r) => [r.nhan, tachTuKhoa(r.tuKhoa).map(bien)]));

  const f = cfg.tables.post.f;
  const sua = {};
  const dem = new Map();
  const mau = [];
  let daCo = 0;

  d.posts.forEach((p) => {
    const cap = String(p.title || '');
    if (!cap) return;
    /* Xét TỪNG NHÃN một, không bỏ qua cả bài chỉ vì nó đã mang một nhãn khác.
     * Bản đầu bỏ qua mọi bài đã có nhãn, nên bài vừa gắn #sunsettown vừa nhắc
     * VinWonders trong lời thì không bao giờ nhận thêm nhãn VinWonders — chỉ
     * gắn bù được 66 bài thay vì 197. */
    const dangCo = new Set(nhan.nhanCuaBai(p, dsNhan));
    const themVao = dsNhan
      .filter((n) => !dangCo.has(n.nhan))
      .filter((n) => (tuKhoa.get(n.nhan) || []).some((re) => re.test(cap)))
      .map((n) => n.nhan);
    if (!themVao.length) { if (dangCo.size) daCo++; return; }
    if (mau.length < 10) mau.push('[' + themVao.join(', ') + ']  '
      + cap.replace(/\s+/g, ' ').slice(0, 70));
    /* Giữ nguyên phần đã gắn tay trước đó, chỉ nối thêm. */
    const cu = String(p.nhanBu || '').split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean);
    const gop = [...new Set([...cu, ...themVao])];
    sua[p.id] = { [f.labels]: gop.join(', ') };
    themVao.forEach((t) => dem.set(t, (dem.get(t) || 0) + 1));
  });

  const soSua = Object.keys(sua).length;
  console.log('Tổng ' + d.posts.length + ' bài · đã có nhãn ' + daCo
    + ' · gắn bù được ' + soSua + '\n');
  [...dem.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log('  +' + String(n).padStart(4) + '  ' + t));
  console.log('\nMƯỜI BÀI ĐẦU sẽ được gắn — soi xem có bắt nhầm không:');
  mau.forEach((x) => console.log('  ' + x));

  if (!GHI) {
    console.log('\n(xem trước — chưa ghi gì. Thêm --ghi để ghi thật)');
    return;
  }
  const ids = Object.keys(sua);
  for (let i = 0; i < ids.length; i += 200) {
    const lo = {};
    ids.slice(i, i + 200).forEach((id) => { lo[id] = sua[id]; });
    await lark.updateMany(cfg.tables.post.id, lo);
    console.log('  đã ghi ' + Math.min(i + 200, ids.length) + '/' + ids.length);
  }
  store.xoaCache();
  console.log('\nxong.');
})().catch((e) => { console.error('LỖI: ' + e.message.slice(0, 300)); process.exit(1); });
