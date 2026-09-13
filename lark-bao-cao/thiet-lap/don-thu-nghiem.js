'use strict';
/**
 * ============================================================================
 * Dọn dữ liệu thử nghiệm — CHỈ dữ liệu thử, không bao giờ cả bảng
 * ============================================================================
 * Vì sao file này tồn tại: ngày 13/09/2026 tôi dọn dữ liệu sau mỗi đợt thử bằng
 * một dòng gọn lỏn —
 *
 *     const r = await lark.listAllRecords(t);
 *     await lark.deleteRecords(r.map((x) => x.record_id), t);
 *
 * — tức là XOÁ SẠCH cả bảng, không phân biệt phiếu của tôi hay phiếu anh Hùng
 * vừa nộp thật. Anh nộp báo cáo thử, rồi thấy dữ liệu biến mất, và tưởng là do
 * deploy. Không phải deploy. Là tôi, nhiều lần, trong cùng một buổi.
 *
 * Nên từ nay việc dọn phải đi qua đây, và file này có ba hàng rào:
 *
 *   1. Mặc định KHÔNG xoá gì — phải có `--that`.
 *   2. Chỉ xoá bản ghi mang DẤU thử nghiệm, không bao giờ quét cả bảng.
 *   3. In ra từng dòng sắp xoá để nhìn trước khi gật.
 *
 * Chạy: node thiet-lap/don-thu-nghiem.js          (chỉ liệt kê)
 *       node thiet-lap/don-thu-nghiem.js --that   (xoá thật)
 */
const cfg = require('../config');
const K = require('../ky');
const kho = require('../kho');
const lark = cfg.mode === 'api' ? require('../larkapi') : require('../lark');

const THAT = process.argv.includes('--that');

/* Dấu thử nghiệm. Dữ liệu do tôi tạo ra để thử LUÔN mang một trong mấy dấu này
 * ở tên công việc — nếu một ngày nào đó tôi quên đặt dấu thì file này bỏ sót,
 * và bỏ sót là hậu quả đúng: thà để lại rác còn hơn xoá nhầm việc thật. */
const DAU = [/^THU\b/i, /^THỬ\b/i, /THU NGHIEM/i, /THỬ NGHIỆM/i, /^TEST\b/i];

const laThu = (chu) => DAU.some((d) => d.test(String(chu || '').trim()));

(async () => {
  const dong = await kho.dsDong({}, true);
  const phieu = await kho.dsPhieu({}, true);

  const dongThu = dong.filter((d) => laThu(d.congViec));
  /* Phiếu bị coi là thử khi MỌI dòng việc của nó đều là dòng thử — phiếu có lẫn
   * việc thật thì giữ lại, chỉ xoá mấy dòng thử bên trong. */
  const maThu = new Set();
  for (const ma of new Set(dong.map((d) => d.maPhieu))) {
    const cua = dong.filter((d) => d.maPhieu === ma);
    if (cua.length && cua.every((d) => laThu(d.congViec))) maThu.add(ma);
  }
  const phieuThu = phieu.filter((p) => maThu.has(p.ma));

  console.log('Trong Base đang có: ' + phieu.length + ' phiếu · ' + dong.length + ' dòng việc');
  console.log('');
  console.log('Sẽ xoá ' + phieuThu.length + ' phiếu:');
  phieuThu.forEach((p) => console.log('   · ' + K.veNgay(p.tuNgay) + ' ' + p.loaiKy +
    ' — ' + (p.tenNguoi || p.nguoi)));
  console.log('Sẽ xoá ' + dongThu.length + ' dòng việc:');
  dongThu.forEach((d) => console.log('   · ' + K.veNgay(d.ngay) + ' — ' + d.congViec));

  const giuPhieu = phieu.length - phieuThu.length;
  const giuDong = dong.length - dongThu.length;
  console.log('');
  console.log('GIỮ NGUYÊN ' + giuPhieu + ' phiếu và ' + giuDong + ' dòng việc của người thật.');

  if (!THAT) {
    console.log('\n(chưa xoá gì — thêm --that để xoá thật)');
    return;
  }
  if (!phieuThu.length && !dongThu.length) {
    console.log('\nKhông có gì để xoá.');
    return;
  }

  if (dongThu.length) await lark.deleteRecords(dongThu.map((d) => d.id), cfg.dongTableId);
  if (phieuThu.length) await lark.deleteRecords(phieuThu.map((p) => p.id), cfg.phieuTableId);
  kho.xoaDem();

  const conP = (await kho.dsPhieu({}, true)).length;
  const conD = (await kho.dsDong({}, true)).length;
  console.log('\nXong. Còn lại ' + conP + ' phiếu · ' + conD + ' dòng việc.');
  if (conP !== giuPhieu || conD !== giuDong) {
    console.error('CẢNH BÁO: số còn lại không khớp con số đã hứa giữ. Kiểm tra ngay.');
    process.exit(1);
  }
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
