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
  const kq = JSON.parse(fs.readFileSync(tepKq, 'utf8'));
  const bang = JSON.parse(fs.readFileSync(tepMa, 'utf8'));
  const loai = bang.loai === 'thang' ? 'thang' : 'tuan';
  const F = cfg.fields.phieu;
  const gio = new Date(Date.now() + 7 * 3600000);
  const dau = '_Cập nhật ' + String(gio.getUTCHours()).padStart(2, '0') + ':' + String(gio.getUTCMinutes()).padStart(2, '0') +
    ' ' + K.veNgay(Date.now()) + '_';
  let ghi = 0;
  for (const x of (kq.nguoi || [])) {
    const ai = bang.ma[x.ma];
    const chu = String(x.nhanXet || '').replace(/<[^>]*>/g, '').trim();
    if (!ai || !chu) { console.log('bỏ ' + x.ma + (ai ? ' (trống)' : ' (không có mã)')); continue; }
    const nguoi = { id: ai.id, email: ai.email, ten: ai.ten };
    const ma = kho.maPhieu(loai, bang.tu, nguoi.id);
    let ph = (await kho.dsPhieu({}, true)).find((p) => p.ma === ma);
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
