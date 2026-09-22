'use strict';
/**
 * Điền cột "Mục đích" của bài đăng — chạy được nhiều lần, không đè tay người.
 *
 *   node muc-dich.js            → chỉ xem trước, không ghi
 *   node muc-dich.js --ghi      → ghi thật
 *
 * VÌ SAO CÓ CỘT NÀY
 * App KPI chấm theo lượt xem, nhưng view không phải view nào cũng bằng nhau:
 * bài BÁN HÀNG hệ số ×1,0, bài TƯƠNG TÁC ×0,2. Một triệu view giải trí không
 * đáng bằng hai trăm nghìn view bán tour. Hệ số đó trước nay nằm trong sheet
 * của anh Hùng, app không biết bài nào là bài gì — nên số ở màn Tiến độ KPI là
 * số THÔ, cao hơn số dùng chốt lương.
 *
 * KHÔNG BẮT ĐỘI NỘI DUNG GÕ THÊM THẺ NÀO.
 * Bản đầu tôi đặt quy ước gõ #banhang / #tuongtac. Anh Hùng bác đúng: hashtag
 * là thứ KHÁCH NHÌN THẤY, gõ #banhang lên caption thì vừa lộ vừa xấu.
 *
 * Nên suy từ nhãn phòng ĐÃ gắn sẵn. Bảng "Nhãn bài" có cột "Mục đích suy ra":
 * mỗi nhãn tự khai nó nói lên điều gì. Mã tour (#CB01, #TG01_3N2D…) và Sản phẩm
 * (#combophuquoc, #tourdao, #flyboard) khai là Bán hàng — đó là thẻ nói thẳng
 * "bài này bán cái gì", và khách đọc thấy cũng bình thường. Địa điểm, Chủ đề,
 * tên thương hiệu để TRỐNG: chúng không nói lên mục đích, khai bừa là tự quyết
 * hộ một chuyện ảnh hưởng tới lương.
 *
 * Đo trên 2.514 bài đang có: suy được 528 bài Bán hàng, 1.250 Tương tác, còn
 * 736 bài (29%) không nhãn nào nói lên mục đích — số đó phải điền tay.
 *
 * BA TẦNG QUYẾT, tầng trên thắng tầng dưới:
 *   1. ô "Mục đích" của bài đã có giá trị  → giữ nguyên, không đụng
 *   2. caption mang hashtag mục đích trực tiếp → dùng nó (đường thoát khi cần
 *      ép một bài, không bắt buộc dùng)
 *   3. suy từ "Mục đích suy ra" của các nhãn bài đang mang
 *
 * KHÔNG BAO GIỜ ĐÈ Ô ĐÃ CÓ. Suy sai thì trưởng phòng sửa thẳng ô trên Base;
 * lần chạy sau phải giữ nguyên. Đó là lý do tầng 1 đứng trên cùng.
 *
 * MÂU THUẪN THÌ KHÔNG ĐIỀN. Bài vừa mang nhãn Bán hàng vừa mang nhãn Tương tác
 * thì liệt kê ra để người quyết. Tự chọn một trong hai là âm thầm quyết hộ.
 */
const cfg = require('./config');
const store = require('./store');
const lark = require('./lark');
const nhan = require('./nhan');

const GHI = process.argv.includes('--ghi');
const NHOM_TRUC_TIEP = 'Mục đích';   // nhóm chứa hashtag ép thẳng, nếu ai muốn dùng
const F_MUC_DICH = 'fldW3g7168';     // cột "Mục đích" của bảng Bài đăng

(async () => {
  const d = await store.tai();
  const dsNhan = nhan.chuanHoaNhan(await store.taiNhan());

  /* Nhãn ép thẳng (nhóm "Mục đích") và nhãn suy ra (mọi nhãn khác có khai). */
  const epThang = dsNhan.filter((n) => n.nhom === NHOM_TRUC_TIEP);
  const suyRa = dsNhan.filter((n) => n.nhom !== NHOM_TRUC_TIEP && n.mucDich);

  if (!suyRa.length && !epThang.length) {
    console.error('Chưa nhãn nào khai "Mục đích suy ra", và nhóm "' + NHOM_TRUC_TIEP + '" cũng trống.');
    console.error('Mở bảng Nhãn bài, khai cột "Mục đích suy ra" cho các nhãn bán hàng rồi chạy lại.');
    process.exit(1);
  }

  console.log('Nhãn đang nói lên mục đích (khai trong Base, sửa ở đó là đổi ngay):');
  const theoMd = {};
  suyRa.forEach((n) => { (theoMd[n.mucDich] = theoMd[n.mucDich] || []).push(n.nhan); });
  Object.entries(theoMd).forEach(([m, ds]) => {
    console.log('   ' + m.padEnd(11) + ds.length + ' nhãn: ' + ds.slice(0, 6).join(', ')
      + (ds.length > 6 ? '…' : ''));
  });
  if (epThang.length) {
    console.log('   ép thẳng bằng hashtag: '
      + epThang.map((n) => n.nhan + ' ' + n.the.join(' ')).join(' · '));
  }

  const sua = {};
  const dem = new Map();
  const mau = [];
  const mauThan = new Map();   // mỗi mục đích giữ vài ví dụ để soi
  let daCo = 0;
  let khongSuyDuoc = 0;
  const mauThuan = [];

  d.posts.forEach((p) => {
    /* Tầng 1: ô đã có giá trị — kể cả lần chạy trước điền, kể cả người sửa tay. */
    if (String(p.mucDich || '').trim()) { daCo += 1; return; }

    const cap = String(p.title || '').replace(/\s+/g, ' ');

    /* Tầng 2: hashtag ép thẳng. */
    const ep = nhan.nhanCuaBai(p, epThang);
    let chon = null;
    let viSao = '';
    if (ep.length === 1) { chon = ep[0]; viSao = 'hashtag ép thẳng'; }
    else if (ep.length > 1) {
      mauThuan.push('ép thẳng cả hai: ' + ep.join(' + ') + '  ·  ' + cap.slice(0, 58));
      return;
    }

    /* Tầng 3: suy từ nhãn bài đang mang. */
    if (!chon) {
      const co = nhan.nhanCuaBai(p, suyRa);
      if (!co.length) { khongSuyDuoc += 1; return; }
      const md = [...new Set(co.map((x) => (suyRa.find((n) => n.nhan === x) || {}).mucDich))]
        .filter(Boolean);
      if (md.length > 1) {
        mauThuan.push('nhãn nói ngược nhau: ' + co.join(', ') + '  ·  ' + cap.slice(0, 50));
        return;
      }
      chon = md[0];
      viSao = 'suy từ ' + co.join(', ');
    }

    sua[p.id] = { [F_MUC_DICH]: chon };
    dem.set(chon, (dem.get(chon) || 0) + 1);
    const ds = mauThan.get(chon) || [];
    if (ds.length < 4) { ds.push('[' + viSao + '] ' + cap.slice(0, 56)); mauThan.set(chon, ds); }
  });

  const soSua = Object.keys(sua).length;
  const tong = d.posts.length;
  console.log('\nTổng ' + tong + ' bài'
    + ' · ô đã có sẵn ' + daCo
    + ' · điền được ' + soSua
    + ' · không suy được ' + khongSuyDuoc
    + (mauThuan.length ? ' · mâu thuẫn ' + mauThuan.length : ''));
  [...dem.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log('   +' + String(n).padStart(5) + '  ' + t
      + '  (' + Math.round((n / tong) * 100) + '% số bài)'));

  mauThan.forEach((ds, m) => {
    console.log('\nVí dụ điền "' + m + '" — soi xem có suy nhầm không:');
    ds.forEach((x) => console.log('   ' + x));
  });
  if (mauThuan.length) {
    console.log('\n⚠ ' + mauThuan.length + ' bài MÂU THUẪN — không điền, cần người quyết:');
    mauThuan.slice(0, 10).forEach((x) => console.log('   ' + x));
  }
  if (khongSuyDuoc) {
    console.log('\n' + khongSuyDuoc + ' bài (' + Math.round((khongSuyDuoc / tong) * 100)
      + '%) không nhãn nào nói lên mục đích. Ba cách:'
      + '\n   · khai thêm nhãn: mở bảng Nhãn bài, điền cột "Mục đích suy ra" cho nhãn còn trống'
      + '\n   · điền thẳng ô "Mục đích" của bài trên Base — lần chạy sau không đè lên'
      + '\n   · để trống: app KPI coi là chưa phân loại và CHẶN chốt tháng, không tự đoán');
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
