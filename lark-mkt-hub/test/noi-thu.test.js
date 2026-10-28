'use strict';
/**
 * Nối hộp thư (noi-thu.js), soát bằng một Lark giả trên máy:
 *   - cookie mã hoá, người khác hay ai sửa cookie thì không mở được;
 *   - refresh token dùng một lần: nhiều request cùng lúc chỉ làm mới MỘT lần;
 *   - refresh token bị Lark từ chối thì xoá cookie để giao diện mời nối lại;
 *   - token không phải của người đang đăng nhập hub thì không nhận.
 */
const http = require('http');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

let soLamMoi = 0;
let refreshSong = new Set(['r-1']);
const lark = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const tra = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const b = raw ? JSON.parse(raw) : {};
    if (req.url === '/open-apis/authen/v2/oauth/token') {
      if (b.client_id !== 'cli_thu' || b.client_secret !== 'bi-mat') return tra({ code: 20002, error: 'invalid_client' });
      if (b.grant_type === 'authorization_code') {
        const nguoi = b.code === 'code-la' ? 'ou_la' : 'ou_hung';
        return tra({ code: 0, access_token: 'a-' + nguoi, expires_in: 7200, refresh_token: 'r-1',
          refresh_token_expires_in: 604800, scope: 'mail:user_mailbox:readonly mail:user_mailbox.message:readonly mail:user_mailbox.message.subject:read mail:user_mailbox.message.address:read mail:user_mailbox.message.body:read mail:user_mailbox.message:modify mail:user_mailbox.message:send offline_access' });
      }
      if (b.grant_type === 'refresh_token') {
        soLamMoi++;
        if (!refreshSong.has(b.refresh_token)) return tra({ code: 20064, error: 'invalid_grant', error_description: 'refresh token revoked' });
        refreshSong.delete(b.refresh_token);           // dùng một lần
        const moi = 'r-' + (soLamMoi + 1);
        refreshSong.add(moi);
        return setTimeout(() => tra({ code: 0, access_token: 'a-moi-' + soLamMoi, expires_in: 7200,
          refresh_token: moi, refresh_token_expires_in: 604800, scope: '' }), 60);
      }
    }
    if (req.url === '/open-apis/authen/v1/user_info') {
      const tk = String(req.headers.authorization || '').replace('Bearer a-', '');
      return tra({ code: 0, data: { open_id: tk } });
    }
    tra({ code: 404 });
  });
});

/* Phản hồi giả đủ để noi-thu ghi cookie. */
const resGia = () => {
  const h = {};
  return { h, getHeader: (k) => h[k.toLowerCase()], setHeader: (k, v) => { h[k.toLowerCase()] = v; } };
};
const cookieTu = (res) => {
  const dong = [].concat(res.h['set-cookie'] || []).filter((c) => c.startsWith('hub_thu=')).pop() || '';
  return dong.split(';')[0].slice('hub_thu='.length);
};
const reqVoi = (giaTri) => ({ headers: { cookie: 'hub_session=xyz; hub_thu=' + giaTri } });

lark.listen(0, '127.0.0.1', async () => {
  process.env.LARK_API_HOST = 'http://127.0.0.1:' + lark.address().port;
  process.env.LARK_APP_ID = 'cli_thu';
  process.env.LARK_APP_SECRET = 'bi-mat';
  process.env.SESSION_SECRET = 'khoa-thu-' + Date.now();
  process.env.PUBLIC_URL = 'https://hub.vd';
  const noi = require('../noi-thu');
  const HUNG = { id: 'ou_hung', kieu: 'lark' };

  try {
    console.log('\nTrang hỏi quyền');
    const u = new URL(noi.urlHoiQuyen('/#/m/hop-thu'));
    ok('đúng trang hỏi quyền của Lark', u.pathname === '/open-apis/authen/v1/authorize', u.pathname);
    ok('xin đủ quyền mail và offline_access', u.searchParams.get('scope').split(' ').includes('mail:user_mailbox.message:send')
      && u.searchParams.get('scope').includes('offline_access'));
    ok('state đánh dấu lượt nối thư', u.searchParams.get('state') === 'thu:/#/m/hop-thu');
    ok('dùng client_id (OAuth v2)', u.searchParams.get('client_id') === 'cli_thu');

    console.log('\nNhận code');
    const r0 = resGia();
    ok('token của người khác thì không nhận', /không phải tài khoản đang đăng nhập/.test(await noi.nhanCode(r0, 'code-la', HUNG)));
    ok('và không đặt cookie', !cookieTu(r0));
    ok('tài khoản mật khẩu được nói rõ lý do', /mật khẩu/.test(await noi.nhanCode(resGia(), 'code', { id: 'mk:1', kieu: 'mk' })));
    const r1 = resGia();
    ok('đúng người thì xong', (await noi.nhanCode(r1, 'code-hung', HUNG)) === '');
    const c1 = cookieTu(r1);
    ok('cookie HttpOnly, Secure, có hạn', /HttpOnly/.test(r1.h['set-cookie']) && /Secure/.test(r1.h['set-cookie']) && /Max-Age=\d+/.test(r1.h['set-cookie']));
    ok('cookie không chứa token dạng chữ rõ', c1 && !/r-1|a-ou_hung/.test(c1) && !/r-1/.test(Buffer.from(c1, 'base64url').toString('latin1')));

    console.log('\nĐọc token');
    ok('vừa nối xong: dùng ngay access token trong RAM', (await noi.tokenCho(reqVoi(c1), resGia(), HUNG)) === 'a-ou_hung');
    ok('người khác cầm cookie này: không có gì', (await noi.tokenCho(reqVoi(c1), resGia(), { id: 'ou_la' })) === '');
    const sua = c1.slice(0, -3) + (c1.slice(-3) === 'AAA' ? 'BBB' : 'AAA');
    ok('cookie bị sửa: không mở được', (await noi.tokenCho(reqVoi(sua), resGia(), HUNG)) === '');
    ok('không có cookie: không có gì', (await noi.tokenCho({ headers: {} }, resGia(), HUNG)) === '');

    console.log('\nMáy chủ khởi động lại (RAM trắng), năm request cùng lúc');
    noi._ram.clear();
    soLamMoi = 0;
    const cacRes = [0, 1, 2, 3, 4].map(() => resGia());
    const kq = await Promise.all(cacRes.map((r) => noi.tokenCho(reqVoi(c1), r, HUNG)));
    ok('chỉ làm mới một lần', soLamMoi === 1, 'gọi ' + soLamMoi + ' lần');
    ok('cả năm nhận cùng token mới', kq.every((x) => x === 'a-moi-1'), kq.join(','));
    const c2 = cookieTu(cacRes[0]);
    ok('cookie được ghi lại với refresh token mới', c2 && c2 !== c1 && noi._mo(c2).r === 'r-2');

    console.log('\nCookie cũ (refresh token đã dùng) sau khi RAM có bản mới');
    ok('vẫn đọc được nhờ bản trong RAM', (await noi.tokenCho(reqVoi(c1), resGia(), HUNG)) === 'a-moi-1');

    console.log('\nLark thu hồi refresh token');
    noi._ram.clear();
    refreshSong = new Set();
    const rh = resGia();
    ok('không có token', (await noi.tokenCho(reqVoi(c2), rh, HUNG)) === '');
    ok('cookie bị xoá để mời nối lại', /hub_thu=;.*Max-Age=0/.test([].concat(rh.h['set-cookie']).join('\n')));

    console.log('\nNgắt nối');
    const rn = resGia();
    noi.ngat({ headers: {} }, rn, HUNG);
    ok('xoá cookie', /Max-Age=0/.test([].concat(rn.h['set-cookie']).join('')));
  } catch (e) {
    ok('chạy hết không lỗi', false, e.stack);
  }

  lark.close();
  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
});
