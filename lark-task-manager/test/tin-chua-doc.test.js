'use strict';
/**
 * TIN TRAO ĐỔI CHƯA ĐỌC cho lời nhắc kiểm tra việc (26/10/2026).
 *
 * Canh, không gọi Lark:
 *   1. chỉ đếm tin của NGƯỜI KHÁC, mới hơn mốc "đã xem" của chính mình;
 *   2. chỉ việc còn mở mà mình phụ trách / hỗ trợ / order;
 *   3. bỏ tin cũ hơn 14 ngày;
 *   4. mốc "đã xem" của người khác không làm mình thành đã đọc;
 *   5. đệm 60 giây theo người.
 *
 * Hàm cắt nguyên văn từ server.js (server.js tự bật máy chủ khi require).
 * Chạy: node test/tin-chua-doc.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

const nguon = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').replace(/\r\n/g, '\n');
const dau = nguon.indexOf('const demChuaDoc = new Map();');
const cuoi = nguon.indexOf('/** Đuôi tin nhắn: link mở app. */');
if (dau < 0 || cuoi < dau) throw new Error('Không cắt được tinChuaDoc trong server.js');
const ma = nguon.slice(dau, cuoi);

const cfg = require('../config');
const CF = cfg.commentFields, DF = cfg.daXemFields;
const asText = (v) => (Array.isArray(v) ? v.map((x) => (x && (x.text || x.name)) || x).join('') : v == null ? '' : String(v));
const asUsers = (v) => (Array.isArray(v) ? v.map((u) => ({ id: u.id, name: u.name })) : []);
const DONG_HAN = ['Hoàn thành', 'Hủy'];

const NOW = Date.now();
const phut = (m) => NOW - m * 60000;
let goi = 0;
function lark(cmts, xem) {
  return {
    async listAllRecords(bang) {
      goi++;
      return bang === cfg.commentTableId ? cmts : xem;
    },
  };
}
const tin = (id, task, tac, at, nd) => ({ record_id: id, cells: {
  [CF.task.id]: [{ record_ids: [task] }], [CF.author.id]: [{ id: tac, name: tac.toUpperCase() }],
  [CF.at.id]: at, [CF.content.id]: nd || 'nội dung ' + id } });
const xem = (task, nguoi, at) => ({ record_id: 'x' + task + nguoi, cells: {
  [DF.task.id]: [{ record_ids: [task] }], [DF.nguoi.id]: [{ id: nguoi, name: nguoi }], [DF.xemToi.id]: at } });

function dung(cmts, dsXem) {
  goi = 0;
  // eslint-disable-next-line no-new-func
  return new Function('cfg', 'lark', 'asText', 'asUsers', 'DONG_HAN', 'DF',
    ma + '\nreturn { tinChuaDoc, demChuaDoc };')(cfg, lark(cmts, dsXem), asText, asUsers, DONG_HAN, DF);
}

const toi = { id: 'me', name: 'Tôi' };
const tasks = [
  { id: 'A', title: 'Việc A', status: 'Đang tiến hành', owner: [{ id: 'me' }] },
  { id: 'B', title: 'Việc B', status: 'Chờ tiếp nhận', requester: [{ id: 'me' }] },
  { id: 'C', title: 'Việc C (xong)', status: 'Hoàn thành', owner: [{ id: 'me' }] },
  { id: 'D', title: 'Việc D (không có tên tôi)', status: 'Đang tiến hành', owner: [{ id: 'khac' }] },
];

(async () => {
  console.log('\n\x1b[1mĐếm tin chưa đọc\x1b[0m');
  const cmts = [
    tin('c1', 'A', 'an', phut(30)),            // A: sau mốc xem -> chưa đọc
    tin('c2', 'A', 'an', phut(200)),           // A: trước mốc xem -> đã đọc
    tin('c3', 'A', 'me', phut(5)),             // tin của chính mình -> không tính
    tin('c4', 'B', 'binh', phut(10), 'Nhờ anh duyệt giúp'), // B: chưa xem bao giờ -> chưa đọc
    tin('c5', 'B', 'binh', phut(60 * 24 * 20)), // B: quá 14 ngày -> bỏ
    tin('c6', 'C', 'an', phut(3)),             // C: việc đã xong -> bỏ
    tin('c7', 'D', 'an', phut(3)),             // D: không có tên mình -> bỏ
  ];
  const dsXem = [
    xem('A', 'me', new Date(phut(100)).toISOString()),
    xem('B', 'khac', String(phut(1))),          // mốc của người khác: không tính cho mình
  ];
  const { tinChuaDoc, demChuaDoc } = dung(cmts, dsXem);
  const kq = await tinChuaDoc(toi, tasks);
  ok('tổng = 2 (A1, B1)', kq.tong === 2, JSON.stringify(kq));
  ok('hai việc có tin chưa đọc', kq.ds.length === 2 && kq.ds.map((x) => x.id).sort().join() === 'A,B', JSON.stringify(kq.ds));
  ok('xếp việc có tin mới nhất lên đầu', kq.ds[0].id === 'B', kq.ds.map((x) => x.id).join());
  ok('kèm người gửi và trích tin mới nhất', kq.ds[0].nguoi === 'BINH' && kq.ds[0].trich === 'Nhờ anh duyệt giúp', JSON.stringify(kq.ds[0]));
  ok('đọc mốc dạng số (ms) lẫn chuỗi', kq.ds.find((x) => x.id === 'A').n === 1);

  const lanDau = goi;
  await tinChuaDoc(toi, tasks);
  ok('lần gọi thứ hai trong 60 giây dùng đệm, không đọc Base', goi === lanDau, 'goi=' + goi);
  demChuaDoc.delete('me');
  await tinChuaDoc(toi, tasks);
  ok('xoá đệm (vừa mở Trao đổi) thì đọc lại', goi > lanDau);

  const { tinChuaDoc: t2 } = dung(cmts, dsXem);
  const rong = await t2({ id: 'nguoi-la' }, tasks);
  ok('người không có việc nào thì 0 và không đọc bảng tin', rong.tong === 0 && goi === 0, 'goi=' + goi);

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
