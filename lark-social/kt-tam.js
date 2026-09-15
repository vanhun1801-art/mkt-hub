const store = require('./store');
const nd = require('./noi-dung');
(async () => {
  const d = await store.tai();
  const r = nd.tongHop(d.posts, { tz: 8 });
  console.log(r.soBai + ' bài · trung vị ' + r.xemTrungVi.toLocaleString('vi-VN') + ' lượt xem/bài\n');
  console.log('GIỜ VÀNG (trung vị lượt xem, chỉ ô đủ ' + r.gioVang.toiThieu + ' bài):');
  r.gioVang.o.filter((x) => x.du).sort((a, b) => b.xem - a.xem).slice(0, 8)
    .forEach((x) => console.log('   ' + x.tenThu.padEnd(9) + x.tenKhung + 'h  '
      + String(x.xem).padStart(7) + ' xem  · ' + x.soBai + ' bài'));
  console.log('\nTHEO LOẠI BÀI:');
  r.theoLoai.forEach((x) => console.log('   ' + x.ten.padEnd(10) + String(x.soBai).padStart(4) + ' bài · '
    + String(x.xem).padStart(7) + ' xem · ' + String(x.tuongTac).padStart(5) + ' tương tác · '
    + (x.tyLeTuongTac * 100).toFixed(2) + '%'));
  console.log('\nHASHTAG (≥5 bài):');
  r.hashtag.slice(0, 8).forEach((x) => console.log('   ' + x.the.padEnd(24)
    + String(x.soBai).padStart(4) + ' bài · ' + String(x.xem).padStart(7) + ' xem'));
})().catch((e) => { console.error(e.message); process.exit(1); });
