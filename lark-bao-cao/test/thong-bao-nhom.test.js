'use strict';
/**
 * Tin "Ghi nhận báo cáo ngày" vào nhóm. Không chạm mạng: bộ gửi được thay bằng
 * hàm giả, chỉ kiểm nội dung thẻ và ba cái chốt (tắt sẵn · chỉ lần đầu · không ném).
 * Chạy: node test/thong-bao-nhom.test.js
 */
const TB = require('../thong-bao-nhom');
const K = require('../ky');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

const ngay = K.kyNgay(Date.UTC(2026, 8, 30, 5)).tu;           // 30/09/2026 giờ VN
const mau = {
  ten: 'Ngọc', ngayMs: ngay, nopLuc: ngay + 17 * 3600000 + 5 * 60000,
  cham: { trangThai: 'dung-han' },
  dong: [
    { congViec: 'Dựng video *Hòn Thơm*', tienDoPt: 100, trangThai: 'Hoàn thành' },
    { congViec: 'Kịch bản TikTok', tienDoPt: 60, trangThai: 'Đang làm' },
    { congViec: 'Thiết kế banner', tienDoPt: 30, trangThai: 'Tạm dừng' },
    { congViec: '', tienDoPt: 0 },
  ],
};

(async () => {
  const the = TB.dungThe(mau);
  const chu = the.elements[0].text.content;
  ok('tiêu đề: BCCV Ngày - tên - ngày', the.header.title.content === '📋 BCCV Ngày - Ngọc - 30/09/2026', the.header.title.content);
  ok('tiêu đề màu turquoise (gần logo Hub)', the.header.template === 'turquoise');
  ok('tiêu đề có icon 📋', the.header.title.content.includes('📋'));
  ok('thân thẻ đúng thứ tự: người gửi → số lượng → nộp lúc',
    chu.split('\n').map((l) => l.split(':**')[0]).join('|') ===
      '**Người gửi|**Số lượng đầu công việc|**Nộp lúc', chu);
  ok('số lượng đầu việc bỏ dòng trống', chu.includes('**Số lượng đầu công việc:** 3'), chu);
  ok('không còn dòng Ngày báo cáo', !chu.includes('Ngày báo cáo'), chu);
  ok('giờ nộp theo giờ VN', chu.includes('17:05'), chu);
  ok('BỎ dòng thời lượng', !/Thời lượng|định mức/.test(JSON.stringify(the)));
  const hangs = the.elements.filter((e) => e.tag === 'column_set');
  const o = (h, i) => h.columns[i].elements[0].text.content;
  ok('bảng: 1 hàng tiêu đề + 3 việc', hangs.length === 4, hangs.length);
  ok('hàng tiêu đề nền xám', hangs[0].background_style === 'grey' && o(hangs[0], 0) === '**Công việc**');
  ok('việc xong có dấu ✅', o(hangs[1], 1) === '✅ 100%', o(hangs[1], 1));
  ok('việc đang làm chỉ %', o(hangs[2], 1) === '60%');
  ok('việc tạm dừng ghi rõ', o(hangs[3], 1) === '30% · Tạm dừng');
  ok('ký tự markdown trong tên được thoát', o(hangs[1], 0) === '1. Dựng video \*Hòn Thơm\*', o(hangs[1], 0));
  ok('không có việc → không có bảng', !TB.dungThe(Object.assign({}, mau, { dong: [] })).elements.some((e) => e.tag === 'column_set'));
  const tag = TB.dungThe(Object.assign({}, mau, { openId: 'ou_abc123' })).elements[0].text.content;
  ok('có open_id → tag người gửi', tag.includes('**Người gửi:** <at id=ou_abc123></at>'), tag);
  ok('không có open_id → ghi tên', chu.includes('**Người gửi:** Ngọc'), chu);
  ok('không kèm nút bấm', !the.elements.some((e) => e.tag === 'action'));
  ok('thẻ thật không có chữ THỬ', !/THỬ/.test(the.header.title.content));
  ok('thẻ thử có chữ THỬ', /^\[THỬ\]/.test(TB.dungThe(mau, { thu: true }).header.title.content));

  const tre = TB.dungThe(Object.assign({}, mau, { cham: { trangThai: 'tre', treMs: 2 * 3600000 } }));
  ok('trễ vẫn cùng màu tiêu đề', tre.header.template === 'turquoise');
  ok('trễ ghi rõ bao lâu', tre.elements[0].text.content.includes("🚨 <font color='red'>**TRỄ 2 GIỜ**</font>"), tre.elements[0].text.content);
  const bu = TB.dungThe(Object.assign({}, mau, { cham: { trangThai: 'tre', treMs: 30 * 3600000, bu: true } }));
  ok('nộp bù ghi chữ Nộp bù', bu.elements[0].text.content.includes('NỘP BÙ'));

  /* baoNop: bộ gửi giả qua cfg có khoá → đi đường tin-lark; thay bằng lark.cli giả
   * ở chế độ máy (cfg không khoá). */
  let goi = [];
  const dep = { cfg: {}, lark: { cli: async (a) => { goi.push(a); return {}; } } };
  const r = { ma: 'NGAY-x', ky: { tu: ngay }, cham: { trangThai: 'dung-han' }, soLanNop: 1,
    dong: [{ congViec: 'X', tienDoPt: 50 }] };

  process.env.BAO_CAO_TIN_NHOM = '0';
  let kq = await TB.baoNop(dep, { ten: 'A' }, r);
  ok('BAO_CAO_TIN_NHOM=0 → không gửi', goi.length === 0 && /tắt/.test(kq.bo || ''));

  delete process.env.BAO_CAO_TIN_NHOM;
  kq = await TB.baoNop(dep, { ten: 'A' }, r);
  ok('máy cá nhân (không khoá Hub) → không gửi nhóm', goi.length === 0 && /máy/.test(kq.bo || ''));

  process.env.BAO_CAO_TIN_NHOM = '1';
  kq = await TB.baoNop(dep, { ten: 'A' }, Object.assign({}, r, { soLanNop: 2 }));
  ok('nộp lại lần 2 — không gửi', goi.length === 0);
  kq = await TB.baoNop(dep, { ten: 'A' }, r);
  ok('lần nộp đầu — gửi đúng một tin', goi.length === 1 && kq.ok);
  ok('gửi vào nhóm Phòng MKT', goi[0].includes('--chat-id') && goi[0].includes(TB.nhomId()));
  ok('khoá chống trùng theo mã phiếu', goi[0].includes('bcn-NGAY-x'));

  const hong = { cfg: {}, lark: { cli: async () => { throw new Error('Lark sập'); } } };
  const oe = console.error; console.error = () => {};
  kq = await TB.baoNop(hong, { ten: 'A' }, r);
  console.error = oe;
  ok('Lark hỏng → không ném, trả lỗi', kq.ok === false && /Lark sập/.test(kq.loi));
  delete process.env.BAO_CAO_TIN_NHOM;

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
