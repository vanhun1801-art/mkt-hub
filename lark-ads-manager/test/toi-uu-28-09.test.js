/**
 * Năm việc anh Hùng đặt ngày 28/09/2026, và cái chắn cho từng việc.
 *
 *   1. "Giao diện tính ROAS em lôi giúp anh các cái tính ROAS lên trên"
 *   2. "Cứ mỗi 2 tiếng cho tự lôi Tourwell về 1 lần và tính ROAS và lưu lên Base"
 *   3. "Nếu như lượt tin nhắn mà biết chuyển đổi ra tiền thì sẽ tốt biết mấy"
 *   4. "Giao diện kết nối em làm thông minh hơn giúp anh tiện theo dõi"
 *   5. "Tổng thể thiết kế và tối ưu thông minh hơn nữa"
 *
 * Việc 2 gần như đã có sẵn: bộ hẹn giờ chạy mỗi giờ và đã tự kéo Tourwell, tự
 * tính ROAS, tự ghi Base. Cái thiếu duy nhất là NHỊP — TUOI_KHO_GIO đang 6.
 * Nên phép kiểm ở đây canh đúng con số đó, và canh luôn cửa sổ 21 ngày: hạ cửa
 * sổ xuống cho rẻ là hỏng, vì keoVeKho() THAY cả kho chứ không trộn.
 */
const fs = require('fs');
const path = require('path');
const roas = require('../sync/roas');
const sync = require('../sync');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('— việc 2: nhịp 2 tiếng, cửa sổ vẫn 21 ngày');
{
  t('kho coi là cũ sau 2 giờ', sync.TUOI_KHO_GIO === 2, String(sync.TUOI_KHO_GIO));
  /* Cửa sổ KHÔNG được hạ theo. keoVeKho() ghi đè cả kho, nên kéo 7 ngày là vứt
   * mất 14 ngày đang có — và đơn đổi trạng thái sang "Đã chốt" sau hai tuần sẽ
   * không bao giờ được cập nhật lại. */
  t('cửa sổ định kỳ vẫn 21 ngày', sync.NGAY_LUI_TW === 21, String(sync.NGAY_LUI_TW));

  const idx = doc('sync/index.js');
  t('ghi lại cái giá đã đo, không nói suông', /1\.077 giây/.test(idx));
  /* Chuỗi này nằm trong khối chú thích nhiều dòng nên có " * " chen vào giữa —
   * lần đầu tôi viết regex một dòng và nó trượt. */
  t('giải thích vì sao không hạ cửa sổ',
    /THAY cả kho chứ không[\s*]+trộn thêm/.test(idx));

  /* Lượt tự động phải đi trọn ba bước, không dừng ở bước kéo. */
  t('lượt tự động có gọi ghi công + ghi Base', /ghiCongTuDong\.chay/.test(idx));
}

console.log('— việc 3: hội thoại nói ra bao nhiêu TIỀN');
{
  const data = { ads: [{ id: 'rec1', extId: '111', name: 'QC', platform: 'TikTok' }],
    daily: [{ adId: 'rec1', date: '2026-09-10', spend: 1000000 }] };
  const kq = roas.tinh({
    data, from: '2026-09-01', to: '2026-09-30', cuaSo: 60,
    hoiThoaiRows: [{ id: 'ht-1', type: 'INBOX', adIds: ['111'], ngay: '2026-09-05',
      sdt: ['0900000001'], coSdt: true }],
    leadRows: [{ id: 1, ma: 'LU1', sdt: '0900000001', kh: 'KH-A', ngay: '2026-09-05' }],
    donRows: [
      { ma: 'RT1', kh: 'KH-A', ngay: '2026-09-06', tien: 5000000, thu: 4000000 },
      { ma: 'RT2', kh: 'KH-A', ngay: '2026-09-08', tien: 3000000, thu: 2000000 },
    ],
  });
  const h = (kq.hoiThoaiPhanLoai || [])[0] || {};
  t('hội thoại mang theo số tiền', h.tien === 8000000, String(h.tien));
  t('và mang cả doanh thu thuần', h.thu === 6000000, String(h.thu));
  t('kèm đủ hai mã đơn', (h.maDon || []).length === 2, JSON.stringify(h.maDon));

  const C = kq.cauNoi || {};
  t('cầu nối có tổng tiền từ hội thoại', C.tienCuaHoiThoai === 8000000, JSON.stringify(C));
  t('đếm đúng số đơn của nhóm hội thoại', C.donCuaHoiThoai === 2, String(C.donCuaHoiThoai));
  t('có bình quân mỗi hội thoại', C.tienMoiHoiThoai === 8000000, String(C.tienMoiHoiThoai));
}

console.log('— việc 3: hai hội thoại cùng chạm một đơn thì KHÔNG cộng hai lần');
{
  /* Chỗ dễ phồng số nhất. Khách nhắn hai lần từ hai quảng cáo khác nhau, cùng
   * một số điện thoại, cùng một đơn: cộng thẳng h.tien là ra gấp đôi — và một
   * con số doanh thu gấp đôi thì trông rất đẹp, nên càng phải chặn. */
  const data = { ads: [
    { id: 'r1', extId: '111', name: 'QC A', platform: 'TikTok' },
    { id: 'r2', extId: '222', name: 'QC B', platform: 'TikTok' }],
    daily: [{ adId: 'r1', date: '2026-09-10', spend: 500000 }] };
  const kq = roas.tinh({
    data, from: '2026-09-01', to: '2026-09-30', cuaSo: 60,
    hoiThoaiRows: [
      { id: 'ht-1', type: 'INBOX', adIds: ['111'], ngay: '2026-09-05', sdt: ['0900000001'], coSdt: true },
      { id: 'ht-2', type: 'INBOX', adIds: ['222'], ngay: '2026-09-06', sdt: ['0900000001'], coSdt: true },
    ],
    leadRows: [{ id: 1, ma: 'LU1', sdt: '0900000001', kh: 'KH-A', ngay: '2026-09-05' }],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 5000000, thu: 4000000 }],
  });
  const cd = (kq.hoiThoaiPhanLoai || []).filter((h) => h.nhom === 'chuyen-doi');
  t('cả hai hội thoại đều tính là chuyển đổi', cd.length === 2, String(cd.length));
  t('mỗi hội thoại tự nó thấy 5 triệu', cd.every((h) => h.tien === 5000000),
    JSON.stringify(cd.map((h) => h.tien)));

  const C = kq.cauNoi || {};
  t('nhưng TỔNG của nhóm vẫn là 5 triệu, không phải 10', C.tienCuaHoiThoai === 5000000,
    String(C.tienCuaHoiThoai));
  t('và chỉ đếm 1 đơn', C.donCuaHoiThoai === 1, String(C.donCuaHoiThoai));
  t('bình quân chia theo số hội thoại', C.tienMoiHoiThoai === 2500000, String(C.tienMoiHoiThoai));

  /* Một số điện thoại chạm nhiều đơn qua nhiều lead cũng không được nhân lên. */
  t('ghi công doanh thu vẫn chỉ tính đơn đó một lần',
    kq.tong.tien === 5000000, String(kq.tong.tien));
}

console.log('— việc 1: khối tính ROAS đứng TRÊN, nút đứng trước bảng');
{
  const app = doc('public/app.js');
  const i = app.indexOf("VIEW['doanh-thu']");
  const j = app.indexOf('VIEW[', i + 10);
  const tab = app.slice(i, j > 0 ? j : app.length);

  const iRoas = tab.indexOf('id="roasKhoi"');
  const iKenh = tab.indexOf('Hiệu quả theo kênh');
  /* Tìm đúng THẺ h3, không tìm chuỗi trần: khối chú thích ngay trên roasKhoi
   * cũng nhắc tên bảng này, và indexOf bắt phải chú thích trước. */
  const iDon = tab.indexOf('<h3>Đơn gần nhất</h3>');
  t('khối ROAS nằm trước bảng "Hiệu quả theo kênh"', iRoas > 0 && iRoas < iKenh, `${iRoas} / ${iKenh}`);
  t('và nằm trước bảng "Đơn gần nhất"', iRoas > 0 && (iDon < 0 || iRoas < iDon), `${iRoas} / ${iDon}`);
  t('chỉ còn MỘT ô roasKhoi', (app.match(/id="roasKhoi"/g) || []).length === 1);

  /* Trong khối: nút → bảng kết quả → mới tới mấy khối chữ giải thích. */
  const k = app.indexOf('async function roasVe');
  const than = app.slice(k, k + 3000);
  const iNut = than.indexOf('id="rsTinh"');
  const iKq = than.indexOf('id="rsKetQua"');
  const iNguon = than.indexOf('nguonSo(tt)');
  t('nút Tính ROAS đứng trước ô kết quả', iNut > 0 && iNut < iKq, `${iNut} / ${iKq}`);
  t('và cả hai đứng trước khối giải thích nguồn', iKq > 0 && iKq < iNguon, `${iKq} / ${iNguon}`);
  t('khối giải thích nguồn gấp lại được', /<summary>Dữ liệu này đến từ đâu<\/summary>/.test(app));
}

console.log('— việc 2 + 5: giao diện nói ra nhịp tự chạy, cạnh chỗ có nút');
{
  const app = doc('public/app.js');
  t('có hàm in nhịp tự chạy', /function nhipTuDong/.test(app));
  t('nhịp hiện ngay hàng nút', /nhipTuDong\(tt\)/.test(app));
  /* "chưa lượt nào" phải khác "vừa chạy" — gộp lại là nói app biết thứ nó không biết. */
  t('phân biệt chưa chạy lượt nào', /chưa lượt nào/.test(app));
}

console.log('— việc 3: danh sách hội thoại có cột tiền, xếp theo tiền');
{
  const app = doc('public/app.js');
  t('có cột "Ra tiền"', /label: 'Ra tiền'/.test(app));
  t('có dòng tổng cho nhóm chuyển đổi', /footer: nhom === 'chuyen-doi'/.test(app));
  t('xếp theo tiền giảm dần', /sort: \{ key: 'tien', dir: 'desc' \}/.test(app));
  t('Tổng quan có ô tiền từ hội thoại', /Tiền từ hội thoại quảng cáo/.test(app));
}

console.log('— việc 4: tab Kết nối có dải sức khoẻ từng kênh');
{
  const kn = doc('public/ketnoi.js');
  // Đổi tên 07/10/2026: "từng kênh" -> "kết nối", vì giờ nó theo dõi cả sáu nguồn.
  t('có dải sức khoẻ kết nối', /Sức khoẻ kết nối/.test(kn));
  t('mỗi kênh nói rõ CẦN LÀM GÌ', /Cần làm gì/.test(kn));
  /* Chỗ không biết thì ghi gạch. Tô xanh cho đẹp là đúng cái sai đã bỏ đi ở
   * băng "Đồng bộ đang khoẻ" hồi 18/09. */
  t('chưa có số thì nói chưa có, không tô xanh', /chưa có số nào trong Base/.test(kn));
  t('số cũ quá thì kêu', /số cũ \$\{tre\} ngày/.test(kn));
  /* Chữ đổi 07/10/2026: giờ nói "nối lại ngay", vì ba nguồn mới (Pancake,
   * POS, Tourwell) không nối bằng cách dán token vào một ô. */
  t('token hết hạn là việc gấp nhất', /token hết hạn, nối lại ngay/.test(kn));
  t('dải đứng TRƯỚC băng sức khoẻ cũ',
    kn.indexOf('${sucKhoeKenh}') < kn.indexOf('${bangSucKhoe}'));
  t('nói luôn nhịp Tourwell 2 giờ ở đầu tab', /Tourwell \+ ROAS mỗi 2 giờ/.test(kn));
  /* Hẹn giờ tắt thì phải nói thẳng, vì lúc đó mọi con số trên trang đều là số cũ. */
  t('hẹn giờ tắt thì nói rõ phải bấm tay', /hẹn giờ đang tắt, mọi thứ phải bấm tay/.test(kn));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
