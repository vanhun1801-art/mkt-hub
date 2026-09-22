'use strict';
/**
 * Điền cột "Mục đích" của bài đăng từ hashtag — chạy được nhiều lần.
 *
 *   node muc-dich.js            → chỉ xem trước, không ghi
 *   node muc-dich.js --ghi      → ghi thật
 *
 * VÌ SAO CÓ CỘT NÀY
 * App KPI chấm điểm theo lượt xem, nhưng view không phải view nào cũng bằng
 * nhau: bài BÁN HÀNG tính hệ số ×1,0, bài TƯƠNG TÁC ×0,2. Một triệu view giải
 * trí không đáng bằng hai trăm nghìn view bán tour. Trước nay hệ số đó nằm
 * trong sheet của anh Hùng, app không có cách nào biết bài nào là bài gì — nên
 * số ở màn Tiến độ KPI là số thô, cao hơn số dùng chốt lương.
 *
 * VÌ SAO ĐỌC HASHTAG, KHÔNG ĐOÁN TỪ CAPTION
 * Đây là dữ liệu gắn LƯƠNG. `gan-bu.js` đã ghi rõ nguyên tắc của hệ này: app
 * không bao giờ tự dò từ khoá, vì nếu nó lén dò thì số trong báo cáo không khớp
 * với thứ đội nội dung gắn, và không ai giải thích nổi vì sao. Hashtag thì khác
 * — đó là thứ người viết caption CỐ Ý gõ, đọc nó là đọc ý định của họ chứ không
 * phải suy diễn hộ.
 *
 * VÌ SAO HASHTAG KHAI TRONG BASE, KHÔNG CẮM TRONG CODE
 * Dùng lại đúng bảng "Nhãn bài" mà đội nội dung đã quen, nhóm "Mục đích". Một
 * mục đích có thể mang nhiều hashtag, và đổi quy ước là sửa một dòng trong Base
 * — không nhờ ai sửa code rồi deploy.
 *
 * KHÔNG BAO GIỜ ĐÈ Ô ĐÃ CÓ.
 * Content quên gõ hashtag thì trưởng phòng sửa thẳng ô "Mục đích" trên Base;
 * lần chạy sau phải giữ nguyên thứ người ta sửa. Chỉ điền vào ô đang TRỐNG.
 *
 * BÀI MANG CẢ HAI HASHTAG thì KHÔNG điền gì và liệt kê ra để người quyết. Tự
 * chọn một trong hai là âm thầm quyết hộ một chuyện ảnh hưởng tới lương.
 */
const cfg = require('./config');
const store = require('./store');
const lark = require('./lark');
const nhan = require('./nhan');

const GHI = process.argv.includes('--ghi');
const NHOM = 'Mục đích';

/* Tên cột trên Base. Trường được tạo ngày 22/09/2026; khai ở đây thay vì trong
 * config.js vì chỉ mỗi tệp này dùng tới. */
const F_MUC_DICH = 'fldW3g7168';

(async () => {
  const d = await store.tai();
  const tho = await store.taiNhan();
  const dsMucDich = nhan.chuanHoaNhan(tho).filter((n) => n.nhom === NHOM);

  if (!dsMucDich.length) {
    console.error('Bảng "Nhãn bài" chưa có dòng nào thuộc nhóm "' + NHOM + '".');
    console.error('Thêm hai dòng (Bán hàng · Tương tác) kèm hashtag rồi chạy lại.');
    process.exit(1);
  }
  console.log('Quy ước đang dùng (đọc từ Base, sửa ở đó là đổi ngay):');
  dsMucDich.forEach((n) => console.log('   ' + n.nhan.padEnd(12) + n.the.join(' ')));

  const sua = {};
  const dem = new Map();
  const mau = [];
  let daCo = 0;      // ô đã có sẵn giá trị — giữ nguyên
  let khongThe = 0;  // caption không mang hashtag mục đích nào
  const haiThe = [];

  d.posts.forEach((p) => {
    /* Ô đã có giá trị thì bỏ qua — kể cả do lần chạy trước điền, kể cả do
     * người sửa tay. Đây là chốt giữ phần sửa tay. */
    if (String(p.mucDich || '').trim()) { daCo += 1; return; }

    const khop = nhan.nhanCuaBai(p, dsMucDich);
    if (!khop.length) { khongThe += 1; return; }
    if (khop.length > 1) {
      haiThe.push(khop.join(' + ') + '  ·  '
        + String(p.title || '').replace(/\s+/g, ' ').slice(0, 64));
      return;
    }
    const m = khop[0];
    sua[p.id] = { [F_MUC_DICH]: m };
    dem.set(m, (dem.get(m) || 0) + 1);
    if (mau.length < 10) {
      mau.push(m.padEnd(11) + String(p.title || '').replace(/\s+/g, ' ').slice(0, 64));
    }
  });

  const soSua = Object.keys(sua).length;
  console.log('\nTổng ' + d.posts.length + ' bài'
    + ' · ô đã có sẵn ' + daCo
    + ' · không mang hashtag mục đích ' + khongThe
    + ' · điền được ' + soSua
    + (haiThe.length ? ' · mang cả hai thẻ ' + haiThe.length : ''));

  [...dem.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log('   +' + String(n).padStart(4) + '  ' + t));

  if (mau.length) {
    console.log('\nMƯỜI BÀI ĐẦU sẽ điền — soi xem có gắn nhầm không:');
    mau.forEach((x) => console.log('   ' + x));
  }
  if (haiThe.length) {
    console.log('\n⚠ ' + haiThe.length + ' bài mang CẢ HAI hashtag — không điền, cần người quyết:');
    haiThe.slice(0, 10).forEach((x) => console.log('   ' + x));
  }
  if (khongThe) {
    console.log('\n' + khongThe + ' bài chưa mang hashtag mục đích nào. Cách xử lý:'
      + '\n   · bài mới: nhắc đội nội dung gõ ' + dsMucDich.map((n) => n.the[0]).join(' hoặc ')
      + '\n   · bài cũ:  điền thẳng cột "Mục đích" trên Base, lần chạy sau không đè lên');
  }

  if (!soSua) { console.log('\nKhông có gì để ghi.'); return; }
  if (!GHI) { console.log('\n(xem trước — CHƯA ghi gì. Thêm --ghi để ghi thật)'); return; }

  const ids = Object.keys(sua);
  for (let i = 0; i < ids.length; i += 200) {
    const lo = {};
    ids.slice(i, i + 200).forEach((id) => { lo[id] = sua[id]; });
    await lark.updateMany(cfg.tables.post.id, lo);
    console.log('   đã ghi ' + Math.min(i + 200, ids.length) + '/' + ids.length);
  }
  store.xoaCache();
  console.log('\nxong.');
})().catch((e) => { console.error('LỖI: ' + e.message.slice(0, 300)); process.exit(1); });
