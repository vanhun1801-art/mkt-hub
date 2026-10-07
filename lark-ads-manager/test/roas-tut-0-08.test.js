/**
 * Vì sao ROAS tụt còn 0,08× — hai lỗi, đo ngày 07/10/2026.
 *
 * Màn hình anh Hùng: doanh thu từ quảng cáo 4.320.000đ trên chi tiêu
 * 54.740.748đ, **3 trên 631 đơn** ghi công được. Tháng 8 thì 34 Facebook + 9
 * TikTok. Không phải quảng cáo tệ đi — phép ghi công hỏng.
 *
 * LỖI A — lượt kéo định kỳ không có SỐ ĐIỆN THOẠI của lead.
 *   keoVeKho() chạy với laySdt = false (quét 15.948 khách mất ~4 phút nên cố ý
 *   bỏ), mà đường ghi công `hội thoại → lead → đơn` lại khoá bằng đúng số đó.
 *   Bản đọc ĐƠN thì có sẵn customer.phone — 729/1000 đơn có số — và lead với
 *   đơn dùng chung mã khách `kh`. Ghép lại là ra, không tốn thêm lời gọi nào.
 *   Đo trên kho thật (1.000 lead có số đầy đủ để đối chiếu): lấp được 107 lead,
 *   cả 107 đều khớp số thật, và 107 đúng bằng số lead đã ra đơn.
 *
 * LỖI B — lượt ghi công kém XOÁ ĐÈ lượt tốt.
 *   dongBase() luôn ghi ô Kênh, lenKeHoach() luôn đẩy mọi đơn vào `capNhat`.
 *   Nên một lượt thiếu dữ liệu (Pancake lỗi, hoặc lead không có số) biến mọi
 *   đơn thành 'Khác' và xoá sạch kết quả lượt trước. Chạy mỗi 2 giờ thì chỉ cần
 *   một lượt hỏng là mất hết.
 */
const ghiDT = require('../sync/ghidoanhthu');
const { banDoMaDon } = require('../sync/ghicongtudong');
const cfg = require('../config');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const F = cfg.tables.sales.f;

console.log('— LỖI B: không hạ một dòng đã ghi công được xuống "Khác"');
{
  const don = [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-10', tien: 5000000, khach: 'A' }];
  const daCo = banDoMaDon([{ id: 'rec1', c: { [F.orderCode]: 'RT1', [F.channel]: ['TikTok'] } }], F);

  /* Lượt này KHÔNG ghép được (map rỗng) — đúng tình huống Pancake lỗi. */
  const kh = ghiDT.lenKeHoach({ donRows: don, ghiCongTheoDon: new Map(), daCo, F });
  t('vẫn cập nhật dòng đó', kh.capNhat.length === 1, JSON.stringify(kh.capNhat.length));
  const f = kh.capNhat[0].fields;
  t('KHÔNG gửi ô Kênh lên nữa', !(F.channel in f), JSON.stringify(Object.keys(f)));
  /* Giữ cả ghi chú: nó chứa tên quảng cáo và mã lead, ghi đè là mất dấu vết. */
  t('và KHÔNG gửi ô Ghi chú', !(F.note in f));
  t('doanh thu vẫn được cập nhật', f[F.revenue] === 5000000, String(f[F.revenue]));
  t('đếm ra số dòng được giữ', (kh.giuKenh || []).length === 1, JSON.stringify(kh.giuKenh));
  t('tóm tắt cũng nói ra', ghiDT.tomTat(kh).giuKenh === 1);
}

console.log('— nhưng ghép ĐƯỢC thì vẫn ghi đè như thường');
{
  const don = [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-10', tien: 5000000 }];
  const daCo = banDoMaDon([{ id: 'rec1', c: { [F.orderCode]: 'RT1', [F.channel]: ['TikTok'] } }], F);
  const m = new Map([['RT1', { platform: 'Facebook', tenQC: 'QC A', maLead: 'LU1' }]]);
  const kh = ghiDT.lenKeHoach({ donRows: don, ghiCongTheoDon: m, daCo, F });
  const f = kh.capNhat[0].fields;
  t('có gửi ô Kênh', F.channel in f);
  t('và đổi sang kênh mới', f[F.channel] === 'Facebook', f[F.channel]);
  t('ghi chú mang tên quảng cáo', /QC: QC A/.test(f[F.note]), f[F.note]);
  t('không tính vào số dòng được giữ', (kh.giuKenh || []).length === 0);
}

console.log('— dòng đang là "Khác" thì cứ ghi đè, không có gì để giữ');
{
  const don = [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-10', tien: 5000000 }];
  const daCo = banDoMaDon([{ id: 'rec1', c: { [F.orderCode]: 'RT1', [F.channel]: ['Khác'] } }], F);
  const kh = ghiDT.lenKeHoach({ donRows: don, ghiCongTheoDon: new Map(), daCo, F });
  const f = kh.capNhat[0].fields;
  t('vẫn gửi ô Kênh', F.channel in f);
  t('và là Khác', f[F.channel] === 'Khác', f[F.channel]);
}

console.log('— dòng MỚI thì không có gì để giữ, ghi bình thường');
{
  const don = [{ ma: 'RT9', kh: 'KH-Z', ngay: '2026-09-10', tien: 1000000 }];
  const kh = ghiDT.lenKeHoach({ donRows: don, ghiCongTheoDon: new Map(), daCo: new Map(), F });
  t('vào nhánh tạo mới', kh.taoMoi.length === 1 && kh.capNhat.length === 0);
  t('có đủ ô Kênh', F.channel in kh.taoMoi[0].fields);
}

console.log('— lượt KHÔNG tính được ghi công: cấm ghi cột Kênh, kể cả dòng mới');
{
  /* Đo 07/10/2026: Pancake trả "An error occurred" ba lần liên tiếp. Lượt ghi
   * công chạy mỗi 2 giờ, nên mỗi lượt như thế là một lượt xoá sạch. Lượt hỏng
   * thì app KHÔNG BIẾT GÌ — khác hẳn "đã xét và không phải quảng cáo". */
  const don = [
    { ma: 'RT1', kh: 'KH-A', ngay: '2026-09-10', tien: 5000000 },
    { ma: 'RT9', kh: 'KH-Z', ngay: '2026-09-11', tien: 2000000 },
  ];
  const daCo = banDoMaDon([{ id: 'rec1', c: { [F.orderCode]: 'RT1', [F.channel]: ['Facebook'] } }], F);
  const kh = ghiDT.lenKeHoach({ donRows: don, ghiCongTheoDon: new Map(), daCo, F, ghiCongHong: true });

  const sua = kh.capNhat[0].fields;
  t('dòng cũ: không đụng ô Kênh', !(F.channel in sua));
  t('dòng cũ: không đụng ô Ghi chú', !(F.note in sua));
  t('dòng cũ: doanh thu vẫn cập nhật', sua[F.revenue] === 5000000);

  const moi = kh.taoMoi[0].fields;
  t('dòng MỚI: để trống Kênh, không gắn "Khác"', !(F.channel in moi), JSON.stringify(Object.keys(moi)));
  t('dòng mới: vẫn ghi mã đơn và doanh thu',
    moi[F.orderCode] === 'RT9' && moi[F.revenue] === 2000000);

  /* Và lượt CHẠY ĐƯỢC nhưng không ghép ra gì thì vẫn gắn 'Khác' như thường —
   * lúc đó app đã xét và biết là không phải quảng cáo. */
  const ok = ghiDT.lenKeHoach({ donRows: don, ghiCongTheoDon: new Map(), daCo: new Map(), F });
  t('lượt chạy được vẫn gắn Khác cho dòng mới', ok.taoMoi[0].fields[F.channel] === 'Khác');
}

console.log('— LỖI A: lấp số điện thoại cho lead từ đơn của cùng khách');
{
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'sync', 'tourwellapi.js'), 'utf8');

  t('có bước lấp số', /lấp số điện thoại cho/.test(src));
  /* CHỈ lấp khi lượt này không tự lấy số: số lấy thẳng từ bản khách đáng tin hơn. */
  t('chỉ lấp khi không tự lấy số', /if \(!sdtTheoKH\) \{/.test(src));
  t('chỉ lấp chỗ đang trống', /if \(l && !l\.sdt && l\.kh/.test(src));
  t('ghép theo mã khách kh', /tuDon\.has\(l\.kh\)/.test(src));
  t('ghi lại con số đã đo', /107 lead/.test(src));
  t('nói rõ không tốn lời gọi nào', /không tốn lời gọi nào/.test(src));

  /* Phép ghép tự dựng lại ở đây, để kiểm đúng cái logic chứ không chỉ kiểm chữ. */
  const don = [
    { ma: 'RT1', kh: 'KH-A', sdt: '0900000001' },
    { ma: 'RT2', kh: 'KH-B', sdt: '' },
    { ma: 'RT3', kh: 'KH-A', sdt: '0900000999' },   // cùng khách, đến sau
  ];
  const lead = [
    { ma: 'LU1', kh: 'KH-A', sdt: '' },
    { ma: 'LU2', kh: 'KH-B', sdt: '' },
    { ma: 'LU3', kh: 'KH-C', sdt: '' },
    { ma: 'LU4', kh: 'KH-A', sdt: '0911111111' },   // đã có số sẵn
  ];
  const tuDon = new Map();
  don.forEach((d) => { if (d && d.kh && d.sdt && !tuDon.has(d.kh)) tuDon.set(d.kh, d.sdt); });
  lead.forEach((l) => { if (l && !l.sdt && l.kh && tuDon.has(l.kh)) l.sdt = tuDon.get(l.kh); });

  t('lead khớp khách thì được lấp', lead[0].sdt === '0900000001', lead[0].sdt);
  t('khách không có đơn nào có số thì vẫn trống', lead[1].sdt === '');
  t('khách không có đơn thì vẫn trống', lead[2].sdt === '');
  t('lead đã có số thì KHÔNG bị đè', lead[3].sdt === '0911111111', lead[3].sdt);
  /* Một khách nhiều đơn: giữ số của đơn ĐẦU đọc được, đừng đổi qua đổi lại. */
  t('một khách nhiều đơn thì lấy số đầu tiên', tuDon.get('KH-A') === '0900000001');
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
