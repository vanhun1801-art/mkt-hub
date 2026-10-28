'use strict';
/**
 * Bản chạy chung: thư đọc qua OpenAPI bằng token TỪNG người (hub gửi xuống
 * bằng x-hub-thu-token). Dựng một Lark giả trên máy để soát:
 *   - dữ liệu ra đúng hình dạng như khi đọc bằng lark-cli;
 *   - hai người không thấy thư của nhau, luật tự đặt không lẫn sang nhau;
 *   - Xong / đã đọc chỉ ghi sổ riêng, không gọi batch_modify; trả lời dựng EML có In-Reply-To;
 *   - token hết hạn thì 503 kèm cờ mời nối lại.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

process.env.HOP_THU_DU_LIEU = fs.mkdtempSync(path.join(os.tmpdir(), 'hop-thu-'));
process.env.LARK_CLI_SCRIPT = path.join(os.tmpdir(), 'khong-co-lark-cli', 'run.js');
process.env.ANTHROPIC_API_KEY = '';
delete process.env.HUB;

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
/* Mỗi token là một người, mỗi người một hộp. */
const NGUOI = {
  'tk-hung': { hop: 'hunglv@rootytrip.com', thu: [
    { message_id: 'thuHung00000001', thread_id: 't1', internal_date: '1793081185957', subject: 'Báo giá tour',
      head_from: { name: 'Khách A', mail_address: 'a@khach.vn' }, label_ids: ['UNREAD'], to: [{ mail_address: 'hunglv@rootytrip.com', name: '' }],
      cc: [{ mail_address: 'c@khach.vn', name: 'C' }], smtp_message_id: 'abc@khach.vn', references: '',
      reply_to: '=?utf-8?b?' + Buffer.from('Lê Văn A').toString('base64') + '?= <reply@khach.vn>',
      body_html: b64u('<p>Xin chào anh</p>'), body_plain_text: b64u('Xin chào anh') },
  ] },
  'tk-lan': { hop: 'lan@rootytrip.com', thu: [
    { message_id: 'thuLan000000001', thread_id: 't2', internal_date: '1793000000000', subject: 'Lịch quay',
      head_from: { name: 'B', mail_address: 'b@x.vn' }, label_ids: [], to: [], smtp_message_id: '<x@y>',
      body_html: b64u('<p>Lịch</p>') },
  ] },
};
const ghiNhan = [];

const lark = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const tk = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const tra = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (tk === 'tk-het') return tra({ code: 99991677, msg: 'token expired' });
    const ng = NGUOI[tk];
    if (!ng) return tra({ code: 99991663, msg: 'invalid token' });
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.pathname.replace('/open-apis/mail/v1/user_mailboxes/', ''));
    const body = raw ? JSON.parse(raw) : {};
    ghiNhan.push({ tk, method: req.method, p, body });
    if (p === 'me/accessible_mailboxes') return tra({ code: 0, data: { accessible_mailboxes: [{ email_address: ng.hop, email_type: 'USER_PRIMARY' }] } });
    const [hop, ...con] = p.split('/');
    if (hop !== ng.hop) return tra({ code: 99991672, msg: 'no permission' });
    const duong = con.join('/');
    if (duong === 'messages' && req.method === 'GET') return tra({ code: 0, data: { items: ng.thu.map((t) => t.message_id), has_more: false } });
    if (duong === 'messages/batch_get') return tra({ code: 0, data: { messages: ng.thu.filter((t) => body.message_ids.includes(t.message_id)) } });
    if (duong === 'messages/batch_modify') return tra({ code: 0, data: {} });
    if (duong === 'drafts') return tra({ code: 0, data: { draft_id: 'nhap1' } });
    if (duong === 'drafts/nhap1/send') return tra({ code: 0, data: { message_id: 'daGui' } });
    const m = /^messages\/(.+)$/.exec(duong);
    if (m) return tra({ code: 0, data: { message: ng.thu.find((t) => t.message_id === m[1]) } });
    tra({ code: 404, msg: 'không có ' + p });
  });
});

lark.listen(0, '127.0.0.1', () => {
  process.env.LARK_API_HOST = 'http://127.0.0.1:' + lark.address().port;
  const mapi = require('../mail-api');
  const { server } = require('../server');

  console.log('\nGiải mã tiêu đề và địa chỉ');
  ok('ngày theo giờ Việt Nam', mapi.ngayVN(1793081185957) === '2026-10-27 13:06', mapi.ngayVN(1793081185957));
  const dc = mapi.tachDsDiaChi('=?utf-8?b?' + Buffer.from('Lê Văn A').toString('base64') + '?= <reply@khach.vn>, x@y.vn');
  ok('tên MIME giải ra chữ có dấu', dc[0].name === 'Lê Văn A' && dc[0].mail_address === 'reply@khach.vn', JSON.stringify(dc));
  ok('địa chỉ trần vẫn nhận', dc[1] && dc[1].mail_address === 'x@y.vn');

  const goi = (duong, tk, { method = 'GET', body, id = 'ou_' + tk } = {}) => new Promise((resolve, reject) => {
    const h = { 'x-hub-user-id': id, 'x-hub-user-email': 'nv%40rootytrip.com', 'x-hub-user-name': 'NV' };
    if (tk) h['x-hub-thu-token'] = tk;
    if (body) h['content-type'] = 'application/json';
    const r = http.request({ host: '127.0.0.1', port: server.address().port, path: duong, method, headers: h }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ ma: res.statusCode, s, j: (() => { try { return JSON.parse(s); } catch (_) { return null; } })() }));
    });
    r.on('error', reject);
    r.end(body ? JSON.stringify(body) : undefined);
  });

  server.listen(0, '127.0.0.1', async () => {
    try {
      console.log('\nMỗi người thấy hộp của mình');
      const h1 = await goi('/api/hop', 'tk-hung');
      ok('anh Hùng: hộp chính là hộp của anh', h1.ma === 200 && h1.j.chinh === 'hunglv@rootytrip.com', h1.s.slice(0, 200));
      const t1 = await goi('/api/thu', 'tk-hung');
      const t2 = await goi('/api/thu', 'tk-lan');
      ok('anh Hùng: một thư, của anh', t1.j && t1.j.thu.length === 1 && t1.j.thu[0].id === 'thuHung00000001', t1.s.slice(0, 300));
      ok('chị Lan: một thư, của chị', t2.j && t2.j.thu.length === 1 && t2.j.thu[0].id === 'thuLan000000001', t2.s.slice(0, 300));
      const th = t1.j.thu[0];
      ok('hình dạng như lark-cli: ngày, người gửi, chưa đọc',
        th.ngay === '2026-10-27 13:06' && th.tu.email === 'a@khach.vn' && th.tu.ten === 'Khách A' && th.chuaDoc === true, JSON.stringify(th));

      const la = await goi('/api/thu/' + encodeURIComponent('hunglv@rootytrip.com') + '/thuHung00000001', 'tk-lan');
      ok('chị Lan không mở được thư trong hộp anh Hùng', la.ma === 403, la.ma + ' ' + la.s.slice(0, 120));

      console.log('\nĐọc một thư');
      const d = await goi('/api/thu/' + encodeURIComponent('hunglv@rootytrip.com') + '/thuHung00000001', 'tk-hung');
      ok('thân thư giải base64url thành chữ', d.j && d.j.thu.noiDung === 'Xin chào anh', d.s.slice(0, 300));
      ok('người nhận và cc giữ nguyên', d.j && d.j.thu.cc[0].email === 'c@khach.vn');

      console.log('\nLuật tự đặt không lẫn giữa người');
      await goi('/api/luat', 'tk-hung', { method: 'POST', body: { email: 'a@khach.vn', ngan: 'don' } });
      const sau1 = await goi('/api/thu', 'tk-hung');
      const sauLan = await goi('/api/luat', 'tk-lan', { method: 'POST', body: { email: 'z@z.vn', ngan: 'biet' } });
      ok('luật anh Hùng có tác dụng với anh', sau1.j.thu[0].ngan === 'don', sau1.j.thu[0].ngan);
      ok('luật chị Lan không có luật của anh Hùng', sauLan.j && !('a@khach.vn' in sauLan.j.luat), JSON.stringify(sauLan.j));

      console.log('\nGhi lên Lark');
      ghiNhan.length = 0;
      await goi('/api/thu/' + encodeURIComponent('hunglv@rootytrip.com') + '/thuHung00000001/doi', 'tk-hung',
        { method: 'POST', body: { xong: true, daDoc: true } });
      ok('Xong và đã đọc không đổi gì trên Lark Mail', !ghiNhan.some((x) => /batch_modify/.test(x.p)), JSON.stringify(ghiNhan.map((x) => x.p)));

      ghiNhan.length = 0;
      const nhap = await goi('/api/thu/' + encodeURIComponent('hunglv@rootytrip.com') + '/thuHung00000001/tra-loi', 'tk-hung',
        { method: 'POST', body: { chu: 'Dạ em gửi báo giá ạ', tatCa: true } });
      const dr = ghiNhan.find((x) => /\/drafts$/.test(x.p));
      const eml = dr ? Buffer.from(dr.body.raw, 'base64url').toString('utf8') : '';
      ok('lưu nháp, không gửi', nhap.j && nhap.j.daGui === false && !ghiNhan.some((x) => /send$/.test(x.p)), nhap.s.slice(0, 200));
      ok('EML trả lời đúng địa chỉ reply-to', /^To: =\?UTF-8\?B\?[^\r]*<reply@khach\.vn>/m.test(eml), eml.slice(0, 400));
      const nhan = eml.split('\r\n').filter((d) => /^(To|Cc): /.test(d)).join('\n');
      ok('trả lời tất cả: cc giữ người cũ, bỏ chính mình', /^Cc: [^\n]*<c@khach\.vn>/m.test(nhan) && !/hunglv@/.test(nhan), nhan);
      ok('có In-Reply-To để giữ chuỗi thư', /^In-Reply-To: <abc@khach\.vn>/m.test(eml));
      ok('tiêu đề có dấu được mã hoá', /^Subject: =\?UTF-8\?B\?/m.test(eml));
      const than = Buffer.from(eml.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
      ok('thân có chữ mới và trích thư cũ', /Dạ em gửi báo giá ạ/.test(than) && /history-quote-wrapper/.test(than) && /Xin chào anh/.test(than));

      ghiNhan.length = 0;
      const g = await goi('/api/thu/' + encodeURIComponent('hunglv@rootytrip.com') + '/thuHung00000001/tra-loi', 'tk-hung',
        { method: 'POST', body: { chu: 'Gửi luôn', gui: true } });
      ok('Gửi: tạo nháp rồi gửi nháp đó', g.j && g.j.daGui === true && ghiNhan.some((x) => x.p.endsWith('drafts/nhap1/send')), g.s.slice(0, 200));

      console.log('\nToken hết hạn');
      const het = await goi('/api/thu', 'tk-het');
      ok('503 kèm cờ mời nối lại', het.ma === 503 && het.j.chuaNoi === true && het.j.noiDuoc === true, het.s.slice(0, 200));
      ok('câu nói việc cần làm', /Nối hộp thư/.test(het.j.error));

      console.log('\nToken không kèm danh tính');
      const tron = await goi('/api/thu', 'tk-hung', { id: '' });
      ok('không có open_id thì không dùng token', tron.ma !== 200, String(tron.ma));
    } catch (e) {
      ok('chạy hết không lỗi', false, e.stack);
    }
    server.close(); lark.close();
    console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
    if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
  });
});
