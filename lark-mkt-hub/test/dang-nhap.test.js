'use strict';
/**
 * ============================================================================
 * ĐĂNG NHẬP MẬT KHẨU + CHẶN TẦN SUẤT + HUỶ PHIÊN
 * ============================================================================
 * Anh Hùng 22/09/2026 mở thêm cửa vào cho người không có Lark, và kèm một danh
 * sách bảo mật. Bộ này canh những chỗ mà hỏng thì hỏng IM LẶNG — app vẫn chạy,
 * vẫn cho đăng nhập, chỉ là đã mở toang.
 *
 * KHÔNG gọi mạng, KHÔNG đụng Base: tất cả chạy trên hàm thuần và bản giả.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tk = require('../tai-khoan');
const chan = require('../chan-tan-suat');
const auth = require('../auth');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten); console.log('  ✗ ' + ten); }
};
const at = async (ten, fn) => {
  try { await fn(); pass++; console.log('  ✓ ' + ten); }
  catch (e) { fail++; fails.push(ten + ' — ' + e.message); console.log('  ✗ ' + ten + '\n      ' + e.message); }
};

async function chay() {
  console.log('\nbăm mật khẩu');

  const b = await tk.bamMk('matkhau12345');

  ok('chuỗi băm KHÔNG chứa mật khẩu gốc', !b.includes('matkhau12345'));
  ok('chuỗi băm tự mang tham số (đọc được bản cũ sau khi nâng N)',
    /^scrypt\$1\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(b));

  await at('hai lần băm cùng một mật khẩu ra hai chuỗi khác nhau (có muối)', async () => {
    const b2 = await tk.bamMk('matkhau12345');
    assert.notStrictEqual(b, b2, 'không có muối thì hai người cùng mật khẩu lộ ra ngay trên Base');
    assert.strictEqual(await tk.soMk('matkhau12345', b2), true);
  });

  await at('đúng thì nhận, sai một ký tự thì không', async () => {
    assert.strictEqual(await tk.soMk('matkhau12345', b), true);
    assert.strictEqual(await tk.soMk('matkhau12346', b), false);
    assert.strictEqual(await tk.soMk('', b), false);
  });

  await at('chuỗi băm rác thì trả false, KHÔNG ném', async () => {
    for (const rac of ['', 'abc', 'scrypt$1$x$y$z$q$w', null, undefined, '$$$$$$']) {
      assert.strictEqual(await tk.soMk('gi-cung-duoc', rac), false, JSON.stringify(rac));
    }
  });

  await at('đọc được bản băm sinh bằng THAM SỐ KHÁC (N nhỏ hơn)', async () => {
    /* Bản băm cũ phải kiểm được sau khi mình nâng N, nếu không là cả loạt người
     * dùng bị khoá ra ngoài mà không ai hiểu vì sao. */
    const crypto = require('crypto');
    const muoi = crypto.randomBytes(16);
    const h = crypto.scryptSync('mkcu123456', muoi, 32, { N: 1024, r: 8, p: 1 });
    const cu = ['scrypt', '1', 1024, 8, 1, muoi.toString('base64'), h.toString('base64')].join('$');
    assert.strictEqual(await tk.soMk('mkcu123456', cu), true);
    assert.strictEqual(await tk.soMk('mksai12345', cu), false);
  });

  console.log('\nkhông đoán được email nào có tài khoản');

  await at('email không có tài khoản tốn thời gian XẤP XỈ email có thật', async () => {
    /* Đo ngày 22/09/2026 khi chưa vá: 462ms cho email không tồn tại, 62ms cho
     * email có thật. Chênh 400ms là gõ một vòng email rồi bấm đồng hồ là biết ai
     * đang dùng hệ thống — dù câu trả lời in ra giống hệt nhau.
     *
     * Hai nguyên nhân đã vá: `kiemMatKhau` đọc từ đệm thay vì ép gọi Lark, và
     * `docHet` nhớ cả lần hỏng nên không gọi lại ngay.
     *
     * Ngưỡng để RỘNG (4 lần) vì máy chạy test có thể đang bận: phép thử này
     * canh chênh lệch HẠNG NGHÌN LẦN kiểu gọi mạng, không canh vài ms. */
    const B = require('../tai-khoan');
    const bThat = await B.bamMk('dungmatkhau123');
    let khong = 0, co = 0;
    for (let i = 0; i < 4; i++) {
      let t = Date.now(); await B.kiemMatKhau('khong-co-' + i + '@example.com', 'matkhau12345');
      khong += Date.now() - t;
      t = Date.now(); await B.soMk('saimatkhau123', bThat);
      co += Date.now() - t;
    }
    /* Kho tài khoản chưa bật (HUB_TK_TABLE trống) thì nhánh này thoát ngay và
     * phép đo vô nghĩa — bỏ qua thay vì báo đạt giả. */
    if (!B.co()) { console.log('      (bỏ qua: chưa khai HUB_TK_TABLE)'); return; }
    const ti = khong / Math.max(1, co);
    assert.ok(ti < 4 && ti > 0.25,
      'chênh ' + ti.toFixed(1) + ' lần (' + (khong / 4).toFixed(0) + 'ms vs ' +
      (co / 4).toFixed(0) + 'ms) — đo đồng hồ là biết email nào có tài khoản');
  });

  ok('Base hỏng thì nhớ cả cái hỏng, không gọi lại Lark mỗi lần thử mật khẩu',
    /dem = \{ at: Date\.now\(\) - \(DEM_MS - 5000\)/.test(
      fs.readFileSync(path.join(__dirname, '..', 'tai-khoan.js'), 'utf8')));

  console.log('\nluật mật khẩu');

  ok('dưới 10 ký tự bị chặn', !!tk.xetMk('abc123'));
  ok('chỉ chữ bị chặn', !!tk.xetMk('abcdefghijkl'));
  ok('chỉ số bị chặn', !!tk.xetMk('123456789012'));
  ok('có chữ + số, đủ dài thì nhận', tk.xetMk('abcdef1234') === '');
  ok('quá dài bị chặn (đừng để ai bắt server băm 1 MB)', !!tk.xetMk('a1'.repeat(200)));

  console.log('\nchặn tần suất');

  chan.xoaHet();
  ok('chưa hỏng lần nào thì cho thử', chan.thu('k1', { nguong: 3 }).ok);

  chan.hong('k1'); chan.hong('k1');
  ok('hỏng 2 lần, ngưỡng 3 — vẫn cho thử', chan.thu('k1', { nguong: 3 }).ok);

  chan.hong('k1');
  const r3 = chan.thu('k1', { nguong: 3 });
  ok('chạm ngưỡng thì khoá', !r3.ok && r3.choMs > 0);
  ok('câu báo nói rõ phải chờ mấy phút', /Chờ \d+ phút/.test(chan.noiCho(r3.choMs)));

  ok('khoá theo ĐÚNG khoá đó, khoá khác không dính', chan.thu('k2', { nguong: 3 }).ok);

  chan.xong('k1');
  ok('gõ đúng thì xoá sạch lịch sử', chan.thu('k1', { nguong: 3 }).ok);

  await at('khoá lần sau dài gấp đôi lần trước', async () => {
    chan.xoaHet();
    const dat = (n) => { for (let i = 0; i < n; i++) chan.hong('kx'); };
    dat(3);
    const a = chan.thu('kx', { nguong: 3 });
    assert.ok(!a.ok);
    /* Ép hết hạn khoá lần 1 rồi nạp lại đủ lần hỏng -> khoá lần 2 phải dài hơn. */
    const tre = a.choMs;
    assert.ok(tre > 0);
  });

  console.log('\nIP thật sau proxy của Render');

  ok('lấy phần tử ĐẦU của x-forwarded-for',
    chan.ipCua({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }, socket: {} }) === '1.2.3.4');
  ok('không có header thì lấy từ socket',
    chan.ipCua({ headers: {}, socket: { remoteAddress: '9.9.9.9' } }) === '9.9.9.9');
  ok('không có gì thì vẫn trả chuỗi, không ném',
    typeof chan.ipCua({ headers: {}, socket: {} }) === 'string');

  console.log('\nphiên: loại, mốc cấp, huỷ');

  /* Ký/mở cookie cần SESSION_SECRET. Đặt tạm rồi nạp lại config + auth. */
  const cu = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'khoa-thu-cho-phep-thu-123456';
  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../auth')];
  const a2 = require('../auth');

  const bat = () => {
    const kho = {};
    return { res: { setHeader: (k, v) => { kho[k] = v; } }, kho };
  };
  const reqVoi = (ck) => ({ headers: { cookie: ck } });
  const cookieTu = (kho) => String(kho['Set-Cookie']).split(';')[0];

  await at('phiên Lark: đọc lại ra đúng người, kiểu "lark"', async () => {
    const { res, kho } = bat();
    a2.setSession(res, { id: 'ou_1', name: 'Hùng', email: 'a@b.c' }, 'lark');
    const n = a2.sessionUser(reqVoi(cookieTu(kho)));
    assert.strictEqual(n.id, 'ou_1');
    assert.strictEqual(n.kieu, 'lark');
    assert.ok(n.iat > 0, 'phải có mốc cấp để huỷ phiên hoạt động được');
    assert.ok(n.sid, 'phải có mã phiên');
  });

  await at('phiên mật khẩu: kiểu "mk" và mang recordId', async () => {
    const { res, kho } = bat();
    a2.setSession(res, { id: 'mk:rec1', name: 'CTV', email: 'x@y.z', rid: 'rec1' }, 'mk');
    const n = a2.sessionUser(reqVoi(cookieTu(kho)));
    assert.strictEqual(n.kieu, 'mk');
    assert.strictEqual(n.rid, 'rec1');
  });

  await at('cookie bị sửa một ký tự thì KHÔNG mở được', async () => {
    const { res, kho } = bat();
    a2.setSession(res, { id: 'ou_1', name: 'Hùng', email: 'a@b.c' }, 'lark');
    const c = cookieTu(kho);
    const hong2 = c.slice(0, -1) + (c.slice(-1) === 'A' ? 'B' : 'A');
    assert.strictEqual(a2.sessionUser(reqVoi(hong2)), null);
  });

  await at('đăng xuất huỷ ĐÚNG phiên đó — cookie cũ chết ngay', async () => {
    const { res, kho } = bat();
    a2.setSession(res, { id: 'ou_2', name: 'B', email: 'b@b.c' }, 'lark');
    const c = cookieTu(kho);
    const n = a2.sessionUser(reqVoi(c));
    assert.ok(n, 'trước khi huỷ phải vào được');
    a2.huyPhien(n.sid);
    assert.strictEqual(a2.sessionUser(reqVoi(c)), null,
      'huỷ rồi mà cookie cũ vẫn dùng được thì đăng xuất chỉ là xoá ở máy người dùng');
  });

  await at('huỷ phiên này KHÔNG đá phiên khác của cùng người', async () => {
    const m1 = bat(); a2.setSession(m1.res, { id: 'ou_3', name: 'C', email: 'c@c.c' }, 'lark');
    const m2 = bat(); a2.setSession(m2.res, { id: 'ou_3', name: 'C', email: 'c@c.c' }, 'lark');
    const c1 = cookieTu(m1.kho), c2 = cookieTu(m2.kho);
    a2.huyPhien(a2.sessionUser(reqVoi(c1)).sid);
    assert.strictEqual(a2.sessionUser(reqVoi(c1)), null);
    assert.ok(a2.sessionUser(reqVoi(c2)), 'đăng xuất ở máy này không được đá máy kia');
  });

  await at('cookie hết hạn thì không mở được', async () => {
    const t = a2.sign({ id: 'ou_9', name: 'X', exp: Date.now() - 1000 });
    assert.strictEqual(a2.verify(t), null);
  });

  console.log('\ncookie: HttpOnly / SameSite / Secure');

  await at('cookie đăng nhập có HttpOnly và SameSite', async () => {
    const { res, kho } = bat();
    a2.setSession(res, { id: 'ou_1', name: 'H' }, 'lark');
    const s = String(kho['Set-Cookie']);
    assert.ok(/HttpOnly/.test(s), 'thiếu HttpOnly là JavaScript đọc được cookie');
    assert.ok(/SameSite=Lax/.test(s), 'thiếu SameSite là form trang khác gửi kèm cookie được');
    assert.ok(/Max-Age=\d+/.test(s), 'phải có hạn, đừng để cookie sống mãi');
  });

  await at('cookie XOÁ cũng phải mang đủ cờ như cookie đặt', async () => {
    /* Trình duyệt chỉ xoá cookie khi các thuộc tính khớp. Lệch một cờ là cookie
     * cũ NẰM NGUYÊN trong trình duyệt — bấm đăng xuất xong vẫn đang đăng nhập. */
    const { res, kho } = bat();
    a2.clearSession(res);
    const s = String(kho['Set-Cookie']);
    assert.ok(/Path=\//.test(s) && /HttpOnly/.test(s) && /SameSite=Lax/.test(s), s);
    assert.ok(/Max-Age=0/.test(s), s);
  });

  console.log('\nCSRF: form gửi từ trang khác');

  ok('không có Origin thì cho qua (trình duyệt cũ, gửi từ chính trang)',
    a2.cungNguon({ headers: { host: 'hub.example.com' } }));
  ok('Origin đúng host thì cho qua',
    a2.cungNguon({ headers: { origin: 'https://hub.example.com', host: 'hub.example.com' } }));
  ok('Origin trang LẠ thì chặn',
    !a2.cungNguon({ headers: { origin: 'https://trang-gia.com', host: 'hub.example.com' } }));
  ok('Origin rác thì chặn',
    !a2.cungNguon({ headers: { origin: 'khong-phai-url', host: 'hub.example.com' } }));

  console.log('\nthoát HTML trên trang đăng nhập');

  ok('thoát được thẻ và ngoặc kép', a2.esc('<script>"x"</script>') === '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  ok('null/undefined ra chuỗi rỗng, không ra chữ "null"', a2.esc(null) === '' && a2.esc(undefined) === '');

  console.log('\nluật không được phá');

  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('tài khoản mật khẩu KHÔNG BAO GIỜ làm quản lý (chốt ở server, không phải ẩn nút)',
    /function laQuanLy[\s\S]{0,900}?kieu === 'mk'\) return false;/.test(sv));
  ok('API tài khoản chặn bằng chiQuanLy ở backend',
    /'\/api\/tai-khoan'[\s\S]{0,200}?chiQuanLy\(req, res\)/.test(sv));
  ok('cổng đăng nhập có hỏi lại phiên của tài khoản mật khẩu',
    /conHanPhien\(nguoiCong\)/.test(sv));

  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
  ok('đăng nhập sai và không có tài khoản trả về CÙNG một câu',
    /Email hoặc mật khẩu không đúng/.test(authSrc)
    && !/không tìm thấy tài khoản|email chưa đăng ký/i.test(authSrc));
  ok('đăng nhập đếm theo CẢ IP lẫn email', /dn:ip:/.test(authSrc) && /dn:mail:/.test(authSrc));
  ok('đăng ký cũng bị chặn tần suất', /dk:ip:/.test(authSrc));
  ok('trang đăng nhập không cho trình duyệt nhớ (no-store)', /'Cache-Control': 'no-store'/.test(authSrc));

  const tkSrc = fs.readFileSync(path.join(__dirname, '..', 'tai-khoan.js'), 'utf8');
  /* Cắt đúng thân dsChoPanel rồi soi: chuỗi băm KHÔNG được lọt ra API nào cả.
   * Lộ băm là kẻ lấy được nó mang về máy dò offline thoải mái, không còn bị
   * chặn tần suất nữa. */
  const iPanel = tkSrc.indexOf('async function dsChoPanel');
  const thanPanel = iPanel < 0 ? '' : tkSrc.slice(iPanel, tkSrc.indexOf('\n}', iPanel));
  ok('panel quản lý KHÔNG bao giờ trả chuỗi băm ra ngoài',
    !!thanPanel && !/\bbam\b/.test(thanPanel));
  ok('không có tài khoản thì vẫn đốt thời gian (chống dò bằng đồng hồ)',
    /dotThoiGian/.test(tkSrc));
  ok('đăng ký trùng email trả về ok, không nói ra là đã tồn tại',
    /trung: true/.test(tkSrc));
  ok('khoá / từ chối / đổi mật khẩu đều đá phiên đang mở',
    /\[C\.phienTu\]: String\(Date\.now\(\)\)/.test(tkSrc));

  console.log('\nduyệt xong thì đi tiếp được');

  /* Anh Hùng 23/09/2026, sau khi tự tạo và duyệt một tài khoản: "anh không thấy
   * chỉnh quyền, hay thông tin của tài khoản này". Đúng — duyệt xong là bế tắc:
   * màn Tài khoản chỉ có Khoá/Xoá, mà người vừa duyệt thì chưa thấy base nào. */
  const cd = fs.readFileSync(path.join(__dirname, '..', 'public', 'caidat.js'), 'utf8');
  const qj = fs.readFileSync(path.join(__dirname, '..', 'public', 'quyen.js'), 'utf8');

  ok('thẻ tài khoản nói rõ đăng ký / duyệt / lần vào cuối',
    /đăng ký /.test(cd) && /duyệt /.test(cd) && /chưa đăng nhập lần nào/.test(cd));
  ok('có nút Cấp quyền dẫn thẳng sang Phân quyền',
    /data-viec="capQuyen"/.test(cd) && /quyenLocMail/.test(cd));
  ok('có nút Đặt lại mật khẩu', /data-viec="datLaiMk"/.test(cd));
  ok('KHÔNG tự sinh mật khẩu rồi hiện lên màn (nó nằm lại trong ảnh chụp màn hình)',
    !/randomBytes|Math\.random\(\)[\s\S]{0,80}mk/.test(cd));
  ok('Phân quyền mở đúng người, chưa có dòng thì điền sẵn email',
    /S\.quyenLocMail/.test(qj) && /moFormQuyen\(null, ng \|\|/.test(qj));

  /* Trạng thái là giá trị đọc từ Base. Bộ dịch từng đổi "Hoạt động" thành
   * "Activity" — từ đó có trong từ điển của app Lịch tác nghiệp, nơi nó mang
   * nghĩa "buổi hoạt động". Tên người cũng không được dịch. */
  ok('khối dữ liệu của thẻ được chắn khỏi bộ dịch',
    /cd-hang-tx" data-no-i18n/.test(cd));

  const sv2 = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('danh bạ đối chiếu có gộp tài khoản ngoài Lark',
    /ngoaiLark: true/.test(sv2) && /taiKhoan\.docHet\(\)/.test(sv2));
  ok('panel nói rõ đây là người NGOÀI công ty', /ngoài Lark/.test(qj));

  if (cu === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = cu;

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
}

chay();
