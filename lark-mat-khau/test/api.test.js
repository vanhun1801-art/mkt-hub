'use strict';
/**
 * Máy chủ — QUYỀN XEM, nhật ký, không rò mật khẩu qua danh sách.
 * Không chạm Base: thay lớp lark bằng bộ giả trước khi nạp server.js.
 * Base hỏng thì bộ này vẫn phải chạy, vì nó đang gác chuyện quyền.
 *
 * Chạy: node test/api.test.js
 */
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

process.env.TK_KHOA = crypto.randomBytes(32).toString('base64');
process.env.LARK_MODE = 'cli';
process.env.HUB = '1';
const CONG = 5199;

const cfg = require('../config');
const mh = require('../ma-hoa');
const F = cfg.f;

/* ---------------- Base giả ---------------- */
const MK_A = 'Bi-mat-A!9';
const MK_B = 'Bi-mat-B!7';
const MK_GOI = 'Goi-chu-thuong-1';
const BANG = {
  [cfg.tkTableId]: [
    { record_id: 'recA', cells: { [F.tk.nenTang]: 'Tik Tok', [F.tk.ten]: 'Rooty', [F.tk.nhom]: ['Mạng xã hội'], [F.tk.user]: 'rooty@x.vn',
      [F.tk.matKhau]: mh.maHoa(MK_A), [F.tk.duocXem]: [{ id: 'ou_han', name: 'Mỹ Hân' }], [F.tk.stt]: 1 } },
    { record_id: 'recB', cells: { [F.tk.nenTang]: 'Klook', [F.tk.ten]: 'OTA', [F.tk.nhom]: ['Kênh bán OTA'], [F.tk.user]: 'ota@x.vn',
      [F.tk.matKhau]: mh.maHoa(MK_B), [F.tk.duocXem]: [], [F.tk.stt]: 2 } },
  ],
  [cfg.goiTableId]: [
    { record_id: 'recG', cells: { [F.goi.ten]: 'Adobe', [F.goi.chuKy]: ['Năm'], [F.goi.chiPhi]: 1200000, [F.goi.soLuong]: 1,
      [F.goi.matKhau]: MK_GOI, [F.goi.hetHan]: Date.now() + 5 * 86400000, [F.goi.dangNhap]: '[a@b.vn](mailto:a@b.vn)',
      [F.goi.duocXem]: [] } },
  ],
  [cfg.nkTableId]: [],
};
let hongNhatKy = false;
const daGhi = [];
const lark = {
  whoami: async () => null,
  cli: async (args) => {
    if (args[0] === 'contact') return { users: [{ open_id: 'ou_moi', localized_name: 'Người Mới', enterprise_email: 'moi@x.vn', department: 'Phòng MKT' }] };
    throw new Error('cli giả không biết lệnh ' + args.join(' '));
  },
  listAllRecords: async (t) => JSON.parse(JSON.stringify(BANG[t] || [])),
  getRecord: async (id, t) => JSON.parse(JSON.stringify((BANG[t] || []).find((r) => r.record_id === id) || null)),
  createRecord: async (fields, t) => {
    if (t === cfg.nkTableId && hongNhatKy) throw new Error('Lark API 1254036: quá tần suất');
    BANG[t].push({ record_id: 'recN' + BANG[t].length, cells: fields });
    daGhi.push({ t, fields });
  },
  createMany: async () => ({}),
  updateRecord: async (id, fields, t) => {
    const r = BANG[t].find((x) => x.record_id === id); Object.assign(r.cells, fields); daGhi.push({ t, id, fields });
  },
  updateMany: async (map, t) => { for (const [id, f] of Object.entries(map)) await lark.updateRecord(id, f, t); },
};
const goc = Module._load;
Module._load = function (req, parent, ...r) {
  if (parent && parent.filename && parent.filename.startsWith(path.join(__dirname, '..')) && /^\.\/lark(api)?$/.test(req)) return lark;
  return goc.call(this, req, parent, ...r);
};
const { server } = require('../server');

/* ---------------- gọi ---------------- */
const NGUOI = {
  ql: { 'x-hub-user-id': 'ou_ql', 'x-hub-user-name': encodeURIComponent('Lê Văn Hùng'), 'x-hub-user-manager': '1' },
  han: { 'x-hub-user-id': 'ou_han', 'x-hub-user-name': encodeURIComponent('Mỹ Hân') },
  hanApp: { 'x-hub-user-id': 'ou_KHAC_APP', 'x-hub-user-name': encodeURIComponent('Mỹ Hân') },
  la: { 'x-hub-user-id': 'ou_la', 'x-hub-user-name': encodeURIComponent('Người Lạ') },
  hut: { 'x-hub-user-id': '' },
};
function goi(duong, ai, than) {
  return new Promise((resolve, reject) => {
    const body = than ? JSON.stringify(than) : null;
    const rq = http.request({ host: '127.0.0.1', port: CONG, path: duong, method: than ? 'POST' : 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, NGUOI[ai] || {}) }, (res) => {
      let s = ''; res.on('data', (c) => { s += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (_) {} resolve({ ma: res.statusCode, j, s, h: res.headers }); });
    });
    rq.on('error', reject); if (body) rq.write(body); rq.end();
  });
}
const nk = () => BANG[cfg.nkTableId].map((r) => r.cells[F.nk.hanhDong]);

(async () => {
  await new Promise((r) => server.listen(CONG, '127.0.0.1', r));
  try {
    group('Danh sách không bao giờ chở mật khẩu');
    for (const ai of ['ql', 'han', 'la']) {
      const r = await goi('/api/danh-sach', ai);
      ok(ai + ': 200', r.ma === 200, r.s.slice(0, 200));
      ok(ai + ': không có enc:v1 và không có mật khẩu chữ', !/enc:v1/.test(r.s) && ![MK_A, MK_B, MK_GOI].some((m) => r.s.includes(m)));
      ok(ai + ': Cache-Control no-store', /no-store/.test(r.h['cache-control'] || ''));
    }
    const tq = await goi('/api/tong-quan', 'ql');
    ok('tong-quan không chở mật khẩu', !/enc:v1/.test(tq.s) && !tq.s.includes(MK_GOI));
    ok('tong-quan: gói còn 5 ngày lên danh sách cần xử lý', (tq.j.canXuLy || []).some((x) => /Adobe/.test(x.tieuDe)));
    ok('tong-quan: báo ô chưa mã hoá', (tq.j.the || []).some((t) => /chưa mã hoá/.test(t.nhan) && t.muc === 'cao'));
    const ds = (await goi('/api/danh-sach', 'han')).j;
    ok('Hân chỉ thấy đúng dòng được cấp (recA), không thấy recB, không thấy gói nào',
      ds.tk.length === 1 && ds.tk[0].id === 'recA' && ds.goi.length === 0, JSON.stringify(ds.tk.map((x) => x.id)));
    ok('nhân sự không thấy ai khác được cấp quyền', ds.tk.every((x) => x.duocXem.length === 0));
    const dsLa = (await goi('/api/danh-sach', 'la')).j;
    ok('người mới chưa được cấp: không thấy dòng nào, kể cả tên', dsLa.tk.length === 0 && dsLa.goi.length === 0 &&
      !/Tik Tok|Klook|Adobe/.test(JSON.stringify(dsLa)));
    const tqLa = (await goi('/api/tong-quan', 'la')).j;
    ok('thẻ số trên hub của người mới cũng không lộ gói nào', (tqLa.canXuLy || []).length === 0 && !/Adobe/.test(JSON.stringify(tqLa)));
    const dsQl = (await goi('/api/danh-sach', 'ql')).j;
    ok('gói: bỏ markdown mailto ở ô đăng nhập', dsQl.goi[0].user === 'a@b.vn');
    ok('gói năm quy về tháng', dsQl.goi[0].chiPhiThang === 100000);

    group('Mở mật khẩu — quyền theo từng dòng');
    let r = await goi('/api/mo', 'ql', { bang: 'tk', id: 'recB' });
    ok('quản lý mở được dòng không cấp cho ai', r.ma === 200 && r.j.matKhau === MK_B, r.s);
    r = await goi('/api/mo', 'han', { bang: 'tk', id: 'recA' });
    ok('Hân mở được dòng được cấp (khớp id)', r.ma === 200 && r.j.matKhau === MK_A, r.s);
    r = await goi('/api/mo', 'hanApp', { bang: 'tk', id: 'recA' });
    ok('Hân qua app Lark khác (id khác, cùng tên) vẫn mở được', r.ma === 200 && r.j.matKhau === MK_A, r.s);
    r = await goi('/api/mo', 'han', { bang: 'tk', id: 'recB' });
    ok('Hân KHÔNG mở được dòng chưa cấp → 403', r.ma === 403 && !r.s.includes(MK_B), r.s);
    ok('lượt bị từ chối được ghi nhật ký', nk().includes('Bị từ chối'));
    r = await goi('/api/mo', 'la', { bang: 'goi', id: 'recG' });
    ok('người lạ không mở được gói → 403', r.ma === 403 && !r.s.includes(MK_GOI));
    r = await goi('/api/mo', 'hut', { bang: 'tk', id: 'recB' });
    ok('request từ hub hụt danh tính = người lạ, không tự thành quản lý', r.ma === 403, r.s);
    r = await goi('/api/mo', 'ql', { bang: 'goi', id: 'recG' });
    ok('gói chữ thường cũ vẫn đọc được, gắn cờ chuaMaHoa', r.ma === 200 && r.j.matKhau === MK_GOI && r.j.chuaMaHoa === true);
    r = await goi('/api/mo', 'ql', { bang: 'tk', id: 'recKHONG' });
    ok('dòng không có → 404', r.ma === 404);
    r = await goi('/api/mo', 'ql', { bang: 'xyz', id: 'recA' });
    ok('bảng lạ → 400', r.ma === 400);
    const truoc = nk().filter((x) => x === 'Xem').length;
    ok('mỗi lượt mở thành công là một dòng nhật ký "Xem"', truoc >= 4, 'đếm ' + truoc);

    group('Không ghi được nhật ký → không trả mật khẩu');
    hongNhatKy = true;
    r = await goi('/api/mo', 'ql', { bang: 'tk', id: 'recA' });
    ok('503, không có mật khẩu trong câu trả lời', r.ma === 503 && !r.s.includes(MK_A), r.s);
    hongNhatKy = false;

    group('Quyền được rút là mất ngay (đọc tươi, không đệm)');
    BANG[cfg.tkTableId][0].cells[F.tk.duocXem] = [];
    r = await goi('/api/mo', 'han', { bang: 'tk', id: 'recA' });
    ok('vừa rút quyền trên Base → 403 ngay, không chờ đệm 60 giây', r.ma === 403);

    group('Cấp quyền — chỉ quản lý');
    r = await goi('/api/cap-quyen', 'han', { bang: 'tk', ids: ['recB'], nguoi: ['ou_han'], kieu: 'them' });
    ok('nhân sự tự cấp quyền → 403', r.ma === 403);
    r = await goi('/api/cap-quyen', 'ql', { bang: 'tk', ids: ['recB'], nguoi: ['ou_han'], kieu: 'them' });
    ok('quản lý cấp → 200', r.ma === 200, r.s);
    r = await goi('/api/mo', 'han', { bang: 'tk', id: 'recB' });
    ok('sau khi cấp, Hân mở được', r.ma === 200 && r.j.matKhau === MK_B);
    r = await goi('/api/cap-quyen', 'ql', { bang: 'tk', ids: ['recB'], nguoi: ['ou_han'], kieu: 'bot' });
    ok('quản lý rút → dòng trống lại', r.ma === 200 && BANG[cfg.tkTableId][1].cells[F.tk.duocXem].length === 0);
    r = await goi('/api/cap-quyen', 'ql', { bang: 'tk', ids: ['recB'], nguoi: ['<script>'], kieu: 'them' });
    ok('id người không phải ou_… bị lọc bỏ', r.ma === 200 && BANG[cfg.tkTableId][1].cells[F.tk.duocXem].length === 0);

    group('Đổi mật khẩu');
    BANG[cfg.tkTableId][0].cells[F.tk.duocXem] = [{ id: 'ou_han', name: 'Mỹ Hân' }];
    r = await goi('/api/doi-mat-khau', 'la', { bang: 'tk', id: 'recA', matKhau: 'moi' });
    ok('người không có quyền → 403', r.ma === 403);
    r = await goi('/api/doi-mat-khau', 'han', { bang: 'tk', id: 'recA', matKhau: 'Moi-2026' });
    const c = BANG[cfg.tkTableId][0].cells;
    ok('người được cấp đổi được', r.ma === 200, r.s);
    ok('ô mới lưu dạng mã hoá, không phải chữ', mh.daMaHoa(c[F.tk.matKhau]) && mh.giaiMa(c[F.tk.matKhau]) === 'Moi-2026');
    ok('mật khẩu cũ chuyển sang cột "cũ", vẫn mã hoá', mh.daMaHoa(c[F.tk.matKhauCu]) && mh.giaiMa(c[F.tk.matKhauCu]) === MK_A);
    ok('có ngày đổi', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(c[F.tk.doiLuc]));
    ok('nhật ký "Đổi mật khẩu"', nk().includes('Đổi mật khẩu'));
    ok('nhật ký không chép mật khẩu vào đâu cả', !JSON.stringify(BANG[cfg.nkTableId]).includes('Moi-2026') &&
      !JSON.stringify(BANG[cfg.nkTableId]).includes(MK_A));

    group('Thêm / nhật ký — chỉ quản lý');
    ok('nhân sự thêm → 403', (await goi('/api/them', 'han', { nenTang: 'X' })).ma === 403);
    r = await goi('/api/them', 'ql', { nenTang: 'Zalo 999', matKhau: 'Zz-1', nhom: 'Mạng xã hội' });
    const moi = BANG[cfg.tkTableId].at(-1).cells;
    ok('quản lý thêm → mật khẩu mã hoá', r.ma === 200 && mh.daMaHoa(moi[F.tk.matKhau]));
    ok('nhân sự đọc nhật ký → 403', (await goi('/api/nhat-ky', 'han')).ma === 403);
    r = await goi('/api/nhat-ky', 'ql');
    ok('quản lý đọc nhật ký', r.ma === 200 && r.j.ds.length > 0);
    ok('khoi-tao: người mới không được tìm danh bạ, quản lý thì được', (await goi('/api/khoi-tao', 'la')).j.timNguoi === false &&
      (await goi('/api/khoi-tao', 'ql')).j.timNguoi === true);

    group('Sửa thông tin — chỉ quản lý, chỉ cột trong danh sách');
    ok('nhân sự sửa → 403', (await goi('/api/sua', 'han', { bang: 'goi', id: 'recG', truong: { chiPhi: 1 } })).ma === 403);
    r = await goi('/api/sua', 'ql', { bang: 'goi', id: 'recG', truong: { chiPhi: '1.500.000', hetHan: '2026-12-31', chuKy: 'Tháng', phuTrach: ['ou_han', 'xx'] } });
    const g = BANG[cfg.goiTableId][0].cells;
    ok('quản lý sửa gói → 200', r.ma === 200, r.s);
    ok('số "1.500.000" ghi thành 1500000', g[F.goi.chiPhi] === 1500000);
    ok('ngày ghi dạng Base đọc được', g[F.goi.hetHan] === '2026-12-31 00:00:00');
    ok('lựa chọn đúng tên', g[F.goi.chuKy] === 'Tháng');
    ok('người: lọc id rác, ghi [{id}]', JSON.stringify(g[F.goi.phuTrach]) === '[{"id":"ou_han"}]');
    ok('nhật ký có "cũ → mới"', BANG[cfg.nkTableId].some((x) => x.cells[F.nk.hanhDong] === 'Sửa thông tin' && /Chi phí.*1200000 → 1500000/.test(x.cells[F.nk.viec])),
      BANG[cfg.nkTableId].map((x) => x.cells[F.nk.viec]).filter((v) => /Sửa/.test(v)).join(' | '));
    ok('cột mật khẩu KHÔNG sửa được qua cửa này', (await goi('/api/sua', 'ql', { bang: 'goi', id: 'recG', truong: { matKhau: 'x' } })).ma === 400 &&
      g[F.goi.matKhau] === MK_GOI);
    ok('lựa chọn lạ → 400', (await goi('/api/sua', 'ql', { bang: 'tk', id: 'recA', truong: { nhom: 'Bậy' } })).ma === 400);
    ok('ngày sai → 400', (await goi('/api/sua', 'ql', { bang: 'goi', id: 'recG', truong: { hetHan: '31/12/2026' } })).ma === 400);
    ok('số âm → 400', (await goi('/api/sua', 'ql', { bang: 'goi', id: 'recG', truong: { soLuong: -1 } })).ma === 400);
    r = await goi('/api/sua', 'ql', { bang: 'tk', id: 'recA', truong: { ghiChu: '' } });
    ok('ô để trống → xoá ô (null)', r.ma === 200 && BANG[cfg.tkTableId][0].cells[F.tk.ghiChu] === null);
    ok('nhân sự thêm gói → 403', (await goi('/api/them-goi', 'han', { truong: { ten: 'X' } })).ma === 403);
    r = await goi('/api/them-goi', 'ql', { truong: { ten: 'Canva', chuKy: 'Năm', chiPhi: 3000000 }, matKhau: 'Cv-1' });
    const gm = BANG[cfg.goiTableId].at(-1).cells;
    ok('quản lý thêm gói, mật khẩu mã hoá', r.ma === 200 && gm[F.goi.ten] === 'Canva' && mh.daMaHoa(gm[F.goi.matKhau]), r.s);
    r = await goi('/api/sua', 'han', { bang: 'tk', id: 'recA', truong: { ghiChu: 'Hân sửa' } });
    ok('người được cấp sửa được dòng của mình', r.ma === 200 && BANG[cfg.tkTableId][0].cells[F.tk.ghiChu] === 'Hân sửa', r.s);
    ok('…nhưng không sửa được dòng chưa được cấp', (await goi('/api/sua', 'han', { bang: 'tk', id: 'recB', truong: { ghiChu: 'x' } })).ma === 403);
    ok('người mới không sửa được gì', (await goi('/api/sua', 'la', { bang: 'tk', id: 'recA', truong: { ghiChu: 'x' } })).ma === 403);

    group('Hub chạy trên máy (cli, không header danh tính)');
    r = await goi('/api/khoi-tao', 'khong');
    ok('người ngồi máy là quản lý — cùng quyền với phiên lark-cli đang đọc Base', r.ma === 200 && r.j.me.quanLy === true, r.s.slice(0, 200));

    group('Tìm người trong danh bạ');
    ok('người mới (chưa được cấp dòng nào) không tra danh bạ được', (await goi('/api/tim-nguoi?q=moi', 'la')).ma === 403);
    r = await goi('/api/tim-nguoi?q=moi', 'ql');
    ok('quản lý tra được, trả id + tên + phòng', r.ma === 200 && r.j.ds[0].id === 'ou_moi' && r.j.ds[0].phong === 'Phòng MKT', r.s);
    ok('người được cấp một dòng cũng tra được (để gán phụ trách)', (await goi('/api/tim-nguoi?q=moi', 'han')).ma === 200);
    r = await goi('/api/cap-quyen', 'ql', { bang: 'tk', ids: ['recB'], nguoi: ['ou_moi'], tenNguoi: { ou_moi: 'Người Mới' }, kieu: 'them' });
    ok('cấp quyền người tìm được: nhật ký ghi đúng tên', r.ma === 200 && BANG[cfg.nkTableId].some((x) => /thêm: Người Mới/.test(x.cells[F.nk.viec])));

    group('Hạn mức mở');
    let ma = 0;
    for (let i = 0; i < 45; i++) { ma = (await goi('/api/mo', 'la', { bang: 'tk', id: 'recB' })).ma; if (ma === 429) break; }
    ok('mở dồn dập → 429', ma === 429);

    group('Tệp tĩnh');
    r = await goi('/', 'la');
    ok('trang chủ 200, số bản đã thay', r.ma === 200 && !/v=BUILD/.test(r.s));
    ok('đường thoát thư mục bị chặn', (await goi('/..%2f.env', 'la')).ma === 404);
  } finally {
    server.close();
  }
  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
