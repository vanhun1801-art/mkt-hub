/* Gắn nốt các thẻ còn sót mà phép soát chỉ ra. Chạy qua API để đi hết mọi chốt. */
const G = 'http://localhost:5222';
const post = async (d, b) => {
  const r = await fetch(G + d, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return { ma: r.status, ...(await r.json()) };
};

/* Thẻ gõ sai hoặc cụt của chính thương hiệu/địa điểm đó — gom về đúng nhãn. */
const GAN = [
  ['Rooty Trip Phú Quốc', ['#rootyttipphuquoc', '#rootytriphuquoc', '#rootytripphuqu',
    '#rootytripphuq', '#rootytripmice']],
  ['Sunset Town', ['#symphonyoftheseas', '#symphonyofthesea', '#sunsettow', '#symphopny',
    '#sympho', '#symphonyof', '#symphonyofthes', '#kissofthe', '#sunbav', '#bavaria',
    '#phaohoadiatrunghai', '#diatrunghaiphuquoc']],
  ['VinWonders Phú Quốc', ['#vinpearl']],
  ['Rạch Vẹm', ['#rachve', '#vuongquocsaobien']],
  ['Tàu gỗ', ['#tourtaugo']],
  ['Du lịch Phú Quốc', ['#dulichvietnam', '#dulichbien', '#dulichbie', '#dulichp',
    '#dulichph', '#dulichphu', '#dulichtrongoi', '#dulichtutuc', '#phuquocbeach',
    '#phuquoctrip', '#phuquocvietnam', '#phuquoctattantat']],
];

/* Thẻ sản phẩm nhiều lượt xem mà chưa nhãn nào nhận — tách thành nhãn riêng để
 * đọc được "bài về dịch vụ nào" chứ không chỉ "bài về địa điểm nào". */
const NHAN_MOI = [
  { nhan: 'Tour đảo', nhom: 'Sản phẩm', doiTac: 'Rooty Trip Phú Quốc',
    hashtag: '#tourdao #tourdaophuquoc #tour3dao #tourcanodao #3islandtour' },
  { nhan: 'Flyboard', nhom: 'Sản phẩm', doiTac: 'Rooty Trip Phú Quốc',
    hashtag: '#flyboard' },
  { nhan: 'Combo trọn gói', nhom: 'Sản phẩm', doiTac: 'Rooty Trip Phú Quốc',
    hashtag: '#combotrongoi #combophuquoc #combo #combophuquo #comboph #combokhachsan' },
];

(async () => {
  for (const [ten, the] of GAN) {
    for (const t of the) {
      const r = await post('/api/the/gan', { the: t, nhan: ten });
      console.log('  ' + t.padEnd(24) + '→ ' + ten.padEnd(22)
        + (r.ok ? (r.daCo ? 'đã có' : 'OK') : '✗ ' + r.error));
    }
  }

  for (const n of NHAN_MOI) {
    const r = await post('/api/nhan/luu', { ...n, bat: true });
    console.log('  tạo nhãn ' + n.nhan.padEnd(18) + (r.ok ? 'OK' : '✗ ' + r.error));
  }
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
