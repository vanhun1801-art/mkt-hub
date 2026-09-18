'use strict';
/**
 * Soát toàn bộ hệ thống nhãn — chạy tay khi nghi số gửi đối tác có gì đó lệch.
 *
 *   node soat-nhan.js            soát cả năm
 *   node soat-nhan.js 2026-08-01 2026-08-31
 *
 * Bảy phép soát, mỗi phép nhắm một kiểu sai ĐÃ hoặc CÓ THỂ làm số đối tác lệch.
 * Cố ý không tự sửa gì: đây là báo cáo để người đọc quyết định.
 */
const store = require('./store');
const nhan = require('./nhan');

const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('vi-VN');
const dong = (s) => console.log(s);
const muc = (s) => { console.log('\n' + s); console.log('─'.repeat(s.length)); };

(async () => {
  const tu = process.argv[2] || '2026-01-01';
  const den = process.argv[3] || store.homNay();

  const d = await store.tai();
  const tho = await store.taiNhan();
  const ds = nhan.chuanHoaNhan(tho);
  const bai = d.posts.filter((p) => {
    const ng = String(p.date || '').slice(0, 10);
    return ng && ng >= tu && ng <= den;
  });

  dong('SOÁT NHÃN · ' + tu + ' → ' + den);
  dong(bai.length + ' bài trong kỳ · ' + ds.length + ' nhãn đang bật · '
    + tho.length + ' dòng trong bảng Nhãn');

  /* ---- 1. Thẻ bị HAI nhãn cùng giữ ---- */
  muc('1. Thẻ bị nhiều nhãn cùng giữ');
  const chu = new Map();
  const dungChung = [];
  ds.forEach((x) => x.the.forEach((t) => {
    /* So theo TÊN nhãn, không theo dòng: một nhãn khai lặp cùng một thẻ thì
     * tachThe() đã lọc, nhưng hai DÒNG khác nhau cùng tên lại là chuyện khác. */
    if (chu.has(t) && chu.get(t) !== x.nhan) dungChung.push({ the: t, a: chu.get(t), b: x.nhan });
    else chu.set(t, x.nhan);
  }));
  if (!dungChung.length) dong('   ✓ không có');
  else dungChung.forEach((x) => dong('   ✗ ' + x.the + ' — cả "' + x.a + '" và "' + x.b
    + '" cùng giữ. Hai nhãn sẽ cùng đếm một bài.'));

  /* ---- 2. Nhãn khai trùng tên ---- */
  muc('2. Nhãn trùng tên');
  const dem = new Map();
  tho.forEach((x) => dem.set(x.nhan, (dem.get(x.nhan) || 0) + 1));
  const trungTen = [...dem.entries()].filter(([, v]) => v > 1);
  if (!trungTen.length) dong('   ✓ không có');
  else trungTen.forEach(([t, v]) => dong('   ✗ "' + t + '" có ' + v
    + ' dòng — bảng gộp số về một chỗ, dòng kia biến mất khỏi báo cáo.'));

  /* ---- 3. Nhãn bật mà không có thẻ nào ---- */
  muc('3. Nhãn bật nhưng chưa khai hashtag');
  const rong = tho.filter((x) => x.bat !== false && !nhan.tachThe(x.hashtag).length);
  if (!rong.length) dong('   ✓ không có');
  else rong.forEach((x) => dong('   ✗ "' + x.nhan + '" — sẽ không bao giờ khớp bài nào.'));

  /* ---- 4. Bài trùng khoá trong Base ---- */
  muc('4. Bài bị ghi hai lần');
  const theoKhoa = new Map();
  bai.forEach((p) => theoKhoa.set(p.key, (theoKhoa.get(p.key) || 0) + 1));
  const trungBai = [...theoKhoa.entries()].filter(([, v]) => v > 1);
  if (!trungBai.length) dong('   ✓ không có');
  else {
    dong('   ✗ ' + trungBai.length + ' bài có hơn một dòng — mọi lượt xem của chúng bị nhân đôi.');
    trungBai.slice(0, 5).forEach(([k, v]) => dong('      ' + k + ' × ' + v));
  }

  /* ---- 5. Tổng theo đối tác có khớp khi đếm tay không ---- */
  muc('5. Đối chiếu tổng của từng đối tác');
  const theoTen = new Map(ds.map((x) => [x.nhan, x]));
  const tay = new Map();
  bai.forEach((p) => {
    const dts = new Set();
    nhan.nhanCuaBai(p, ds).forEach((t) => {
      const x = theoTen.get(t);
      if (x && x.doiTac) dts.add(x.doiTac);
    });
    dts.forEach((dt) => {
      if (!tay.has(dt)) tay.set(dt, { bai: new Set(), views: 0 });
      const o = tay.get(dt);
      if (!o.bai.has(p.key)) { o.bai.add(p.key); o.views += Number(p.views) || 0; }
    });
  });
  nhan.gopTheoDoiTac(bai, ds).forEach((o) => {
    const t = tay.get(o.doiTac) || { bai: new Set(), views: 0 };
    const khop = o.soBai === t.bai.size && Math.round(o.views) === Math.round(t.views);
    dong('   ' + (khop ? '✓' : '✗') + ' ' + o.doiTac.padEnd(22)
      + 'app ' + String(o.soBai).padStart(4) + ' bài / ' + n0(o.views).padStart(11)
      + '   đếm tay ' + String(t.bai.size).padStart(4) + ' bài / ' + n0(t.views).padStart(11));
  });

  /* ---- 6. Thẻ chưa ai nhận, xếp theo lượt xem ---- */
  muc('6. Thẻ chưa thuộc nhãn nào, nhiều lượt xem nhất');
  const tk = nhan.thongKeThe(bai, ds);
  const chuaAiNhan = tk.filter((t) => !t.thuocNhan).sort((a, b) => b.views - a.views);
  dong('   ' + chuaAiNhan.length + ' thẻ chưa có chủ. Hai mươi thẻ nhiều lượt xem nhất:');
  chuaAiNhan.slice(0, 20).forEach((t) => dong('      ' + t.the.padEnd(26)
    + String(t.soBai).padStart(4) + ' bài · ' + n0(t.views).padStart(11) + ' lượt xem'));

  /* ---- 7. Nhãn nào đang bỏ sót thẻ họ hàng ---- */
  muc('7. Gợi ý thẻ còn sót cho từng nhãn');
  const coChu = new Set(tk.filter((x) => x.thuocNhan).map((x) => x.the));
  let coGoi = false;
  ds.forEach((x) => {
    const g = nhan.goiYThe({ nhan: x.nhan, hashtag: x.the.join(' ') }, tk, coChu, bai.length);
    if (!g.length) return;
    coGoi = true;
    dong('   ' + x.nhan);
    g.forEach((t) => dong('      + ' + t.the.padEnd(26) + String(t.soBai).padStart(4)
      + ' bài · ' + n0(t.views).padStart(11) + ' lượt xem'));
  });
  if (!coGoi) dong('   ✓ không nhãn nào còn thẻ họ hàng bỏ sót');

  /* ---- 8. Lượt xem trong kỳ nghĩa là gì ---- */
  muc('8. Lượt xem đang đếm kiểu gì');
  const nen = new Map();
  bai.forEach((p) => {
    const k = p.platform || '?';
    if (!nen.has(k)) nen.set(k, { bai: 0, coXem: 0, views: 0 });
    const o = nen.get(k);
    o.bai++;
    if (Number(p.views) > 0) o.coXem++;
    o.views += Number(p.views) || 0;
  });
  [...nen.entries()].sort().forEach(([k, o]) => dong('   ' + k.padEnd(12)
    + String(o.bai).padStart(4) + ' bài · ' + String(o.coXem).padStart(4) + ' bài có số · '
    + n0(o.views).padStart(12) + ' lượt xem'));
  dong('');
  dong('   Mọi nền tảng đều trả lượt xem TRỌN ĐỜI của bài, không phải lượt xem');
  dong('   phát sinh trong kỳ. "Lượt xem tháng 8" vì thế đọc là "tổng lượt xem tới');
  dong('   nay của những bài ĐĂNG trong tháng 8" — con số này còn tăng sau khi gửi');
  dong('   báo cáo, và hai lần xuất cùng một kỳ sẽ ra hai số khác nhau.');
})().catch((e) => { console.error('LỖI: ' + e.message); process.exit(1); });
