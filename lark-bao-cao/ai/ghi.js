'use strict';
/**
 * AI nhận xét báo cáo TUẦN / THÁNG — bước 2: ghi nhận xét Claude viết vào Base.
 *
 * Đọc tệp kết quả { nguoi: [{ ma: 'NS1', nhanXet: '<markdown rút gọn>' }] }, đổi mã
 * về người thật qua tệp mã của bước 1, rồi ghi ô "Đánh giá AI" của PHIẾU TUẦN /
 * THÁNG của người đó. Chưa có phiếu kỳ thì tạo phiếu NHÁP (không nộp hộ ai).
 * Phiếu đã có thì CHỈ ghi đúng ô Đánh giá AI — không đụng nhận định, trạng thái.
 * KHÔNG ghi ô "Điểm AI": AI không chấm điểm (anh Hùng chốt 12/09).
 *
 * Chạy:  node ai/ghi.js <tệp kết quả> <tệp mã>
 */
const fs = require('fs');
const cfg = require('../config');
const K = require('../ky');
const kho = require('../kho');
const lark = require('../lark');

const [tepKq, tepMa] = process.argv.slice(2);
if (!tepKq || !tepMa) { console.error('Cách dùng: node ai/ghi.js <kết quả> <mã>'); process.exit(1); }

(async () => {
  /* Bảng mã MỚI hơn tệp kết quả = hai tệp của hai lượt khác nhau. Chặn ở đây,
   * trước khi chạm Base.
   *
   * Vì sao phải chặn: chuan-bi.js đánh số lại NS1, NS2… mỗi lượt theo danh sách
   * người CÓ BÁO CÁO trong kỳ. Lượt 01/10 chỉ có một người (NS1 = Khánh); chạy
   * lại hôm nay có sáu người, thứ tự khác. Đem tệp kết quả cũ ghi bằng bảng mã
   * mới là nhận xét của người này rơi vào phiếu người kia — sai loại không ai
   * nhìn ra bằng mắt, vì nhận xét nào trông cũng hợp lý. Đã suýt xảy ra 02/10. */
  const tKq = fs.statSync(tepKq).mtimeMs;
  const tMa = fs.statSync(tepMa).mtimeMs;
  if (tMa > tKq + 1000) {
    console.error('HỎNG: bảng mã (' + new Date(tMa).toLocaleString('vi-VN') + ') mới hơn tệp kết quả (' +
      new Date(tKq).toLocaleString('vi-VN') + ') — hai lượt khác nhau, ghi vào là lẫn người. ' +
      'Chạy lại ai/chuan-bi.js rồi để Claude viết kết quả mới.');
    process.exit(1);
  }
  const kq = JSON.parse(fs.readFileSync(tepKq, 'utf8'));
  const bang = JSON.parse(fs.readFileSync(tepMa, 'utf8'));
  const loai = bang.loai === 'thang' ? 'thang' : 'tuan';
  const F = cfg.fields.phieu;
  const gio = new Date(Date.now() + 7 * 3600000);
  const dau = '*Cập nhật ' + String(gio.getUTCHours()).padStart(2, '0') + ':' + String(gio.getUTCMinutes()).padStart(2, '0') +
    ' ' + K.veNgay(Date.now()) + '*';
  let ghi = 0;
  /* Đọc bảng phiếu MỘT lần (rà 01/10) — đọc lại cho từng người dễ chạm hạn mức
   * đọc của Lark khi các app khác cũng đang chạy. */
  const phieu = await kho.dsPhieu({}, true);
  for (const x of (kq.nguoi || [])) {
    const ai = bang.ma[x.ma];
    const chu = String(x.nhanXet || '').replace(/<[^>]*>/g, '').trim();
    if (!ai || !chu) { console.log('bỏ ' + x.ma + (ai ? ' (trống)' : ' (không có mã)')); continue; }
    const nguoi = { id: ai.id, email: ai.email, ten: ai.ten };
    const ma = kho.maPhieu(loai, bang.tu, kho.khoaNguoi(nguoi));
    let ph = phieu.find((p) => p.ma === ma);
    if (!ph) {
      const r = await kho.luuTongHop({ nguoi, loaiKy: loai, mocMs: bang.tu, nop: false });
      ph = { id: r.phieu.id };
    }
    await lark.updateRecord(ph.id, { [F.danhGiaAI.id]: (dau + '\n\n' + chu).slice(0, 4000) }, cfg.phieuTableId);
    kho.xoaDem();
    ghi++;
    console.log('đã ghi ' + x.ma + ' → ' + ai.ten);
  }
  console.log('xong: ' + ghi + ' người');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
