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
  danhSach: async (hop, max, tk, thuMuc = 'INBOX') => (thuMuc === 'INBOX' ? THU.filter((t) => t.hop === hop) : []),
  chuKyLark: async () => 'Lê Văn Hùng\nP : 0344',
  thanThu: (chu, chuKy) => '<p>' + chu + '</p>' + (chuKy ? '<div>' + chuKy + '</div>' : ''),
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
    const nhip1 = (await hoi('GET', '/api/thu?lam=1')).j;
    const nhip2 = (await hoi('GET', '/api/thu?du=1')).j;
    ok('đọc hai nhịp: nhịp đầu chưa đủ, ?du=1 trả bản đủ', nhip1.du === false && nhip2.du === true && nhip2.thu.length === 2);
    ok('sau khi đủ, lần đọc thường dùng luôn bản đủ', (await hoi('GET', '/api/thu')).j.du === true);
    ok('mới nhất trước', ds[0].id === 'bbbbbbbbbb==');
    const sep = ds.find((t) => t.id === 'aaaaaaaaaa==');
    ok('thư Ban giám đốc vào Cần trả lời, có cờ sep', sep.ngan === 'xu-ly' && sep.sep === true);
    ok('thư máy gửi vào Chỉ để đọc, có lý do', ds[0].ngan === 'biet' && ds[0].lyDo && ds[0].sep === false);

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

    console.log('\nXong, đã đọc, sao: chỉ ghi sổ riêng, Lark Mail giữ nguyên');
    const thuA = async () => (await hoi('GET', '/api/thu')).j.thu.find((t) => t.id === 'aaaaaaaaaa==');
    goi.length = 0;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'doi'), { than: { xong: true } });
    ok('xong: không gọi Lark', !goi.length);
    ok('xong: thư mang dấu xong', (await thuA()).xong > 0);
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'doi'), { than: { xong: false } });
    ok('hoàn tác: hết dấu xong', (await thuA()).xong === 0);
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'doi'), { than: { daDoc: true, sao: true } });
    const a2 = await thuA();
    ok('đã đọc + gắn sao trong app, Lark không bị gọi', !a2.chuaDoc && a2.sao && !goi.length);
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'doi'), { than: { daDoc: false } });
    ok('đánh dấu chưa đọc trong app', (await thuA()).chuaDoc === true);
    ok('thay đổi lạ: 400', (await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'doi'), { than: { luuTru: true } })).ma === 400);

    console.log('\nChế độ chỉ đọc (lúc soát)');
    process.env.HOP_THU_CHI_DOC = '1';
    goi.length = 0;
    const g1 = await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'tra-loi'), { than: { chu: 'Dạ', gui: true } });
    ok('gửi bị chặn, Lark không bị gọi', g1.ma === 423 && !goi.length);
    delete process.env.HOP_THU_CHI_DOC;

    console.log('\nLuật và hẹn');
    await hoi('POST', '/api/luat', { than: { email: 'ceo@rootytrip.com', ngan: 'biet' } });
    ok('luật tay đổi ngăn', (await hoi('GET', '/api/thu')).j.thu.find((t) => t.id === 'aaaaaaaaaa==').ngan === 'biet');
    ok('ngăn lạ bị từ chối', (await hoi('POST', '/api/luat', { than: { email: 'a@b.c', ngan: 'xoa' } })).ma === 400);
    const den = Date.now() + 3600e3;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'hen'), { than: { den } });
    ok('hẹn lại ghi giờ hẹn', (await hoi('GET', '/api/thu')).j.thu.find((t) => t.id === 'aaaaaaaaaa==').henDen === den);
    ok('giờ hẹn đã qua bị từ chối', (await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'hen'), { than: { den: 1000 } })).ma === 400);

    console.log('\nThư đã gửi: đã trả lời, đang chờ người khác');
    const { ghepChuoi } = require('../server');
    const homNay = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const DEN = [
      { hop: 'h@x', id: 'd1', chuoi: 'c1', ngay: homNay + ' 08:00' },
      { hop: 'h@x', id: 'd2', chuoi: 'c2', ngay: homNay + ' 09:00' },
      { hop: 'h@x', id: 'd3', chuoi: 'c3', ngay: homNay + ' 11:00' },
    ];
    const gui = [
      { hop: 'h@x', id: 'g1', chuoi: 'c1', ngay: homNay + ' 08:30', tieuDe: 'Re: một' },   // trả lời d1
      { hop: 'h@x', id: 'g3', chuoi: 'c3', ngay: homNay + ' 10:00', tieuDe: 'Báo giá' },  // bên kia đã hồi âm lúc 11:00
      { hop: 'h@x', id: 'g4', chuoi: 'c4', ngay: homNay + ' 07:00', tieuDe: 'Mời hợp tác' }, // chưa ai hồi âm
      { hop: 'k@x', id: 'g5', chuoi: 'c2', ngay: homNay + ' 10:00', tieuDe: 'Khác hộp' },   // khác hộp, không tính cho d2
      { hop: 'h@x', id: 'g6', chuoi: 'c6', ngay: '2026-01-01 08:00', tieuDe: 'Cũ quá' },
    ];
    const gc = ghepChuoi(DEN, gui);
    ok('thư đến có thư mình gửi sau nó: đã trả lời', gc.daTraLoi.has('h@x|d1') && !gc.daTraLoi.has('h@x|d2') && !gc.daTraLoi.has('h@x|d3'));
    ok('đang chờ: chỉ chuỗi chưa ai hồi âm, trong 21 ngày', gc.cho.map((x) => x.id).sort().join() === 'g1,g4,g5', JSON.stringify(gc.cho.map((x) => x.id)));

    console.log('\nChữ ký, xem trước, soát chữ');
    const ck = await hoi('GET', '/api/chu-ky');
    ok('chưa đặt: gợi ý từ chữ ký Lark', ck.j.chuKy === 'Lê Văn Hùng\nP : 0344' && ck.j.daDat === false);
    goi.length = 0;
    const xt = await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'xem-truoc'), { than: { chu: 'em đã nhận dc ạ' } });
    ok('xem trước có chữ ký và trích thư gốc', /Lê Văn Hùng/.test(xt.j.html) && /blockquote/.test(xt.j.html), xt.s.slice(0, 200));
    ok('xem trước gửi tới đúng người gửi thư gốc', xt.j.den.length === 1 && xt.j.den[0].email === 'ceo@rootytrip.com');
    ok('xem trước soát được lỗi', xt.j.loi.some((x) => x.sai === 'dc' && x.sua === 'được') && xt.j.loi.some((x) => x.sua === 'E'));
    ok('xem trước không gọi Lark ghi gì', !goi.some((x) => x[0] !== 'doc'));
    await hoi('POST', '/api/chu-ky', { than: { chuKy: 'Hùng · MKT' } });
    ok('đặt chữ ký riêng', (await hoi('GET', '/api/chu-ky')).j.chuKy === 'Hùng · MKT');
    goi.length = 0;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'tra-loi'), { than: { chu: 'Dạ', coChuKy: false } });
    ok('bỏ chữ ký cho một thư', goi[0] && goi[0][4].chuKy === '');
    goi.length = 0;
    await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'tra-loi'), { than: { chu: 'Dạ' } });
    ok('mặc định gửi kèm chữ ký đã đặt', goi[0] && goi[0][4].chuKy === 'Hùng · MKT');

    console.log('\nNhóm theo dõi');
    const nh = await hoi('POST', '/api/nhom', { than: { nhom: [
      { id: 'nhom-pito', ten: '  Hợp tác PITO  ', chuoi: [{ hop: 'HUNGLV@rootytrip.com', chuoi: 'c1', td: 'PITO' }, { hop: '', chuoi: 'x' }] },
      { id: '<script>', ten: 'x' },
    ] } });
    ok('cất nhóm: bỏ mã lạ, bỏ chuỗi hỏng, chuẩn hoá hộp', nh.j.nhom.length === 1 && nh.j.nhom[0].ten === 'Hợp tác PITO' &&
      nh.j.nhom[0].chuoi.length === 1 && nh.j.nhom[0].chuoi[0].hop === 'hunglv@rootytrip.com');
    ok('danh sách thư trả kèm nhóm', (await hoi('GET', '/api/thu')).j.nhom[0].id === 'nhom-pito');

    console.log('\nThiếu khoá AI');
    const p = await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'phan-tich'), { than: {} });
    ok('tóm tắt trả 409 kèm cờ, app vẫn chạy', p.ma === 409 && p.j.khongKhoa === true);
    ok('xếp AI im lặng bỏ qua', (await hoi('POST', '/api/xep-ai', { than: {} })).j.xep === 0);
    const dk = await hoi('POST', '/api/dich', { than: { chu: 'Hello', den: 'vi' } });
    ok('dịch dự phòng không khoá: 409 nói rõ dùng Chrome', dk.ma === 409 && dk.j.khongKhoa && /Chrome/.test(dk.j.error));
    const xtEn = await hoi('POST', duong('hunglv@rootytrip.com', 'aaaaaaaaaa==', 'xem-truoc'), { than: { chu: 'Thanks, ok', ngonNgu: 'en' } });
    ok('bản tiếng Anh không bị luật tiếng Việt bắt lỗi', xtEn.ma === 200 && xtEn.j.loi.length === 0);

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
