'use strict';
/**
 * Máy chủ với lớp Lark Mail GIẢ: không đọc, không ghi thư thật nào.
 *
 * Canh chỗ nguy hiểm nhất của app: hộp thư đọc bằng tài khoản Lark của chủ
 * máy, nên người khác vào qua hub tuyệt đối không được thấy thư đó. Và thư
 * chỉ được GỬI khi giao diện nói rõ gui:true.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

process.env.HOP_THU_DU_LIEU = fs.mkdtempSync(path.join(os.tmpdir(), 'hop-thu-'));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.HUB;
delete process.env.HOP_THU_CHI_DOC;

const goi = [];
const THU = [
  { hop: 'hunglv@rootytrip.com', id: 'aaaaaaaaaa==', ngay: '2026-10-27 10:00', tu: { ten: 'CEO', email: 'ceo@rootytrip.com' }, tieuDe: 'Trả lời: x', chuaDoc: true, sao: false, nhan: [] },
  { hop: 'sales@rootytrip.com', id: 'bbbbbbbbbb==', ngay: '2026-10-28 09:00', tu: { ten: '', email: 'no-reply@misa.vn' }, tieuDe: 'Mã xác nhận 123', chuaDoc: false, sao: false, nhan: [] },
];
const gia = {
  cacHop: async () => [{ email: 'hunglv@rootytrip.com', chinh: true }, { email: 'sales@rootytrip.com', chinh: false }],
  danhSach: async (hop) => THU.filter((t) => t.hop === hop),
  doc: async (hop, id) => Object.assign({ den: [], cc: [], noiDung: 'x', trich: '', tep: [] }, THU.find((t) => t.id === id)),
  doi: async (...a) => { goi.push(['doi', ...a]); return {}; },
  traLoi: async (...a) => { goi.push(['traLoi', ...a]); return { draft_id: 'd1' }; },
};
require.cache[require.resolve('../thu')] = { id: 'thu', filename: require.resolve('../thu'), loaded: true, exports: gia };
const { server } = require('../server');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

let cong;
function hoi(method, duong, { than, h = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: cong, method, path: duong, headers: Object.assign({ 'content-type': 'application/json' }, h) }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (_) {} resolve({ ma: res.statusCode, j, s }); });
    });
    req.on('error', reject);
    if (than) req.end(JSON.stringify(than)); else req.end();
  });
}
const hub = (email, phu) => Object.assign({ 'x-hub-user-id': 'ou_1', 'x-hub-user-name': encodeURIComponent('Người') },
  email != null ? { 'x-hub-user-email': encodeURIComponent(email) } : {}, phu ? { 'x-hub-user-email-phu': encodeURIComponent(phu) } : {});
const duong = (hop, id, viec) => '/api/thu/' + encodeURIComponent(hop) + '/' + encodeURIComponent(id) + (viec ? '/' + viec : '');

server.listen(0, '127.0.0.1', async () => {
  cong = server.address().port;
  try {
    console.log('\nAi được xem thư');
    ok('chạy một mình trên máy: được', (await hoi('GET', '/api/hop')).ma === 200);
    const la = await hoi('GET', '/api/thu', { h: hub('khac@rootytrip.com') });
    ok('qua hub, email khác chủ hộp: 403', la.ma === 403 && la.j.khongPhaiChu === true);
    ok('403 không lộ tiêu đề thư nào', !/Trả lời|Mã xác nhận/.test(la.s));
    ok('qua hub mà hụt email: 403, không rơi về nhánh chạy một mình', (await hoi('GET', '/api/thu', { h: hub(null) })).ma === 403);
    ok('qua hub, email chính trùng chủ: được', (await hoi('GET', '/api/thu', { h: hub('HUNGLV@rootytrip.com') })).ma === 200);
    ok('qua hub, email phụ trùng chủ: được', (await hoi('GET', '/api/thu', { h: hub('marketing@rootytrip.com', 'hunglv@rootytrip.com') })).ma === 200);
    ok('HUB=1 mà không có header: 403', await (async () => {
      process.env.HUB = '1';
      const r = await hoi('GET', '/api/hop');
      delete process.env.HUB;
      return r.ma === 403;
    })());

    console.log('\nDanh sách');
    const ds = (await hoi('GET', '/api/thu')).j.thu;
    ok('gom thư của mọi hộp', ds.length === 2);
    ok('mới nhất trước', ds[0].id === 'bbbbbbbbbb==');
    ok('có ngăn và lý do', ds.find((t) => t.id === 'aaaaaaaaaa==').ngan === 'sep' && ds[0].ngan === 'tu-dong' && ds[0].lyDo);

    console.log('\nĐường dẫn thư');
    ok('hộp không được cấp: 403', (await hoi('GET', duong('ceo@rootytrip.com', 'aaaaaaaaaa=='))).ma === 403);
    ok('mã thư lạ: 400', (await hoi('GET', duong('hunglv@rootytrip.com', '../../etc'))).ma === 400);
    ok('đọc một thư', (await hoi('GET', duong('hunglv@rootytrip.com', 'aaaaaaaaaa=='))).j.thu.tieuDe === 'Trả lời: x');

    console.log('\nGửi thư');
    goi.length = 0;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'tra-loi'), { than: { chu: 'Dạ' } });
    ok('không nói gui:true thì chỉ lưu nháp', goi[0] && goi[0][0] === 'traLoi' && goi[0][4].gui === false);
    goi.length = 0;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'tra-loi'), { than: { chu: 'Dạ', gui: 'true' } });
    ok('gui là chuỗi "true" cũng KHÔNG gửi', goi[0] && goi[0][4].gui === false);
    goi.length = 0;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'tra-loi'), { than: { chu: 'Dạ', gui: true } });
    ok('gui:true mới gửi', goi[0] && goi[0][4].gui === true);
    goi.length = 0;
    ok('thư trống: 400, không gọi Lark', (await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'tra-loi'), { than: { chu: '  ' } })).ma === 400 && !goi.length);

    console.log('\nĐổi nhãn, lưu trữ');
    goi.length = 0;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'doi'), { than: { luuTru: true } });
    ok('lưu trữ = chuyển sang archive, không xoá', goi[0][3].thuMuc === 'archive');
    goi.length = 0;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'doi'), { than: { luuTru: false } });
    ok('hoàn tác = về inbox', goi[0][3].thuMuc === 'inbox');
    goi.length = 0;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'doi'), { than: { daDoc: true, sao: true } });
    ok('đã đọc + gắn sao', goi[0][3].bo.includes('UNREAD') && goi[0][3].them.includes('FLAGGED'));

    console.log('\nChế độ chỉ đọc (lúc soát)');
    process.env.HOP_THU_CHI_DOC = '1';
    goi.length = 0;
    const g1 = await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'tra-loi'), { than: { chu: 'Dạ', gui: true } });
    const g2 = await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'doi'), { than: { daDoc: true } });
    ok('gửi và đổi nhãn đều bị chặn, Lark không bị gọi', g1.ma === 423 && g2.ma === 423 && !goi.length);
    delete process.env.HOP_THU_CHI_DOC;

    console.log('\nLuật và hẹn');
    await hoi('POST', '/api/luat', { than: { email: 'ceo@rootytrip.com', ngan: 'biet' } });
    ok('luật tay đổi ngăn', (await hoi('GET', '/api/thu')).j.thu.find((t) => t.id === 'aaaaaaaaaa==').ngan === 'biet');
    ok('ngăn lạ bị từ chối', (await hoi('POST', '/api/luat', { than: { email: 'a@b.c', ngan: 'xoa' } })).ma === 400);
    const den = Date.now() + 3600e3;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'hen'), { than: { den } });
    ok('hẹn lại ghi giờ hẹn', (await hoi('GET', '/api/thu')).j.thu.find((t) => t.id === 'aaaaaaaaaa==').henDen === den);
    ok('giờ hẹn đã qua bị từ chối', (await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'hen'), { than: { den: 1000 } })).ma === 400);

    console.log('\nThiếu khoá AI');
    const p = await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'phan-tich'), { than: {} });
    ok('tóm tắt trả 409 kèm cờ, app vẫn chạy', p.ma === 409 && p.j.khongKhoa === true);
    ok('xếp AI im lặng bỏ qua', (await hoi('POST', '/api/xep-ai', { than: {} })).j.xep === 0);

    console.log('\nTrang');
    const tc = await hoi('GET', '/');
    ok('trang chủ có dấu phiên bản thật, không còn BUILD', tc.ma === 200 && !/v=BUILD/.test(tc.s) && /styles\.css\?v=\w+/.test(tc.s));
    ok('không ra ngoài thư mục public', (await hoi('GET', '/../server.js')).ma === 404);
  } catch (e) {
    ok('không ném lỗi', false, e.stack);
  }
  server.close();
  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
});
