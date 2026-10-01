'use strict';
/**
 * MÁY GIẢ để bấm thử giao diện mà KHÔNG chạm Base thật.
 *
 *   node test/may-gia.js                 → http://localhost:5193  (vai quản lý)
 *   MAY_GIA_NV=1 node test/may-gia.js    → vai nhân sự "Hân Thử" (chỉ được cấp 2 dòng)
 *
 * Chạy đúng server.js của app; chỉ thay lớp lark bằng một Base trong bộ nhớ với
 * dữ liệu bịa (không có mật khẩu thật nào). Tắt máy là mọi thứ biến mất.
 */
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

process.env.TK_KHOA = process.env.TK_KHOA_GIA || crypto.randomBytes(32).toString('base64');
process.env.LARK_MODE = 'cli';
delete process.env.HUB;
const CONG = Number(process.env.PORT || 5193);
if (process.env.MAY_GIA_NV) process.env.TK_XEM_NHU = 'ou_hanthu|Hân Thử';

const cfg = require('../config');
const mh = require('../ma-hoa');
const F = cfg.f;
const NGAY = 86400000;
const hom = Date.now();

let so = 0;
const rec = () => 'recGia' + (++so);
const ng = (id, ten) => ({ id, name: ten });
const HAN = ng('ou_hanthu', 'Hân Thử');
const HUNG = ng('ou_hungthu', 'Hùng Thử');

const BANG = {
  [cfg.tkTableId]: [
    ['Tik Tok', 'Rooty Thử', 'Mạng xã hội', 'https://tiktok.com/@thu', 'thu1@vidu.vn', 'MatKhauGia-1', [HAN], [HAN]],
    ['Instagram', 'Rooty IG', 'Mạng xã hội', 'instagram.com/thu', 'thu2@vidu.vn', 'MatKhauGia-2', [HUNG], []],
    ['Klook', 'OTA Thử', 'Kênh bán OTA', '', 'ota@vidu.vn', 'MatKhauGia-3', [], []],
    ['Google', 'Gmail MKT', 'Email & Google', 'https://mail.google.com', 'mkt@vidu.vn', 'MatKhauGia-4', [HAN], [HAN]],
    ['Payoneer', 'Ví thử', 'Thanh toán', 'javascript:alert(1)', 'pay@vidu.vn', '', [], []],
    ['<img src=x onerror=alert(1)>', 'Tên có mã độc', 'Khác', '', '"><b>x', 'MatKhauGia-6', [], []],
  ].map(([nenTang, ten, nhom, link, user, mk, pt, xem], i) => ({
    record_id: rec(),
    cells: {
      [F.tk.nenTang]: nenTang, [F.tk.ten]: ten, [F.tk.nhom]: [nhom], [F.tk.link]: link, [F.tk.user]: user,
      [F.tk.matKhau]: mk ? mh.maHoa(mk) : null, [F.tk.matKhauCu]: i === 0 ? mh.maHoa('MatKhauCuGia') : null,
      [F.tk.phuTrach]: pt, [F.tk.duocXem]: xem, [F.tk.trangThai]: ['Đang dùng'], [F.tk.stt]: i + 1,
      [F.tk.doiLuc]: i === 3 ? hom - 10 * NGAY : null,
    },
  })),
  [cfg.goiTableId]: [
    ['Adobe Thử', 'Chính hãng', 'Năm', 2400000, -5, 2, 2],
    ['Canva Thử', 'NCC thứ 3', 'Tháng', 150000, 7, 5, 3],
    ['CapCut Thử', 'Chính hãng', 'Tháng', 200000, 60, 1, 0],
  ].map(([ten, loai, chuKy, chiPhi, conNgay, toiDa, dung], i) => ({
    record_id: rec(),
    cells: {
      [F.goi.ten]: ten, [F.goi.loai]: [loai], [F.goi.chuKy]: [chuKy], [F.goi.chiPhi]: chiPhi, [F.goi.soLuong]: 1,
      [F.goi.hetHan]: hom + conNgay * NGAY, [F.goi.batDau]: hom - 300 * NGAY, [F.goi.tbToiDa]: toiDa, [F.goi.tbDangDung]: dung,
      [F.goi.dangNhap]: '[goi' + i + '@vidu.vn](mailto:goi' + i + '@vidu.vn)', [F.goi.matKhau]: mh.maHoa('GoiGia-' + i),
      [F.goi.phuTrach]: [HUNG], [F.goi.duocXem]: i === 1 ? [HAN] : [], [F.goi.trangThai]: 'Đang dùng',
    },
  })),
  [cfg.nkTableId]: [],
};

const DANH_BA = [
  { open_id: 'ou_hanthu', localized_name: 'Hân Thử', enterprise_email: 'han@vidu.vn', department: 'Phòng MKT' },
  { open_id: 'ou_hungthu', localized_name: 'Hùng Thử', enterprise_email: 'hung@vidu.vn', department: 'Phòng MKT' },
  { open_id: 'ou_ngocthu', localized_name: 'Ngọc Thử', enterprise_email: 'ngoc@vidu.vn', department: 'Phòng Sale' },
];
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
const tenTheoId = new Map(DANH_BA.map((u) => [u.open_id, u.localized_name]));
/* Base thật trả kèm tên trong ô người — giả lập đúng thế để giao diện hiện tên. */
const kemTen = (v) => (Array.isArray(v) ? v.map((x) => (x && x.id && !x.name ? { id: x.id, name: tenTheoId.get(x.id) || x.id } : x)) : v);
const sao = (r) => JSON.parse(JSON.stringify(r));

const lark = {
  whoami: async () => ({ id: 'ou_quanly', name: 'Quản Lý Thử' }),
  cli: async (args) => {
    if (args[0] === 'contact') {
      const q = boDau(args[args.indexOf('--query') + 1]);
      return { users: DANH_BA.filter((u) => boDau(u.localized_name + ' ' + u.enterprise_email).includes(q)) };
    }
    throw new Error('máy giả không biết lệnh ' + args.join(' '));
  },
  listAllRecords: async (t) => sao(BANG[t] || []),
  getRecord: async (id, t) => sao((BANG[t] || []).find((r) => r.record_id === id) || null),
  createRecord: async (fields, t) => { BANG[t].push({ record_id: rec(), cells: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, kemTen(v)])) }); },
  createMany: async (rows, t) => { for (const f of rows) await lark.createRecord(f, t); },
  updateRecord: async (id, fields, t) => {
    const r = BANG[t].find((x) => x.record_id === id);
    if (!r) throw new Error('không có ' + id);
    for (const [k, v] of Object.entries(fields)) r.cells[k] = kemTen(v);
  },
  updateMany: async (map, t) => { for (const [id, f] of Object.entries(map)) await lark.updateRecord(id, f, t); },
  deleteRecords: async (ids, t) => { BANG[t] = BANG[t].filter((r) => !ids.includes(r.record_id)); },
};

const goc = Module._load;
Module._load = function (req, parent, ...r) {
  if (parent && parent.filename && parent.filename.startsWith(path.join(__dirname, '..')) && /^\.\/lark(api)?$/.test(req)) return lark;
  return goc.call(this, req, parent, ...r);
};

const { server } = require('../server');
server.listen(CONG, '127.0.0.1', () => console.log('Máy giả · http://localhost:' + CONG + (process.env.MAY_GIA_NV ? '  (vai nhân sự Hân Thử)' : '  (vai quản lý)')));
