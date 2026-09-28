'use strict';
/**
 * ============================================================================
 * TỆP TĨNH PHẢI ĐƯỢC NHỚ — VÀ PHẢI ĐÚNG BẢN
 * ============================================================================
 * Anh Hùng 29/09/2026: "tối ưu tốc độ… tất tần tật".
 *
 * Đo được: 8 trong 12 app con trả `no-store` cho MỌI tệp tĩnh. Nghĩa là mỗi
 * lần mở một tab trong hub, trình duyệt tải lại toàn bộ CSS/JS của app đó —
 * 133 đến 374 KB, lần nào cũng vậy, kể cả khi không có gì đổi. Trên điện thoại
 * 4G đây là khoản chậm lớn nhất soát ra trong cả đợt này.
 *
 * Bốn app trong số đó đã có sẵn vân tay và đã đóng dấu `?v=__V__` vào trang
 * chủ từ lâu — nhưng vẫn trả no-store, nên cả bộ máy ấy chưa từng dùng được
 * vào việc gì.
 *
 * Lý do viết `no-store` ngày trước là ĐÚNG: sửa app xong F5 phải thấy ngay.
 * Đánh số bản giữ được cả hai: đổi tệp thì vân tay đổi, tức ĐỊA CHỈ đổi, nên
 * không bao giờ lấy nhầm bản cũ, mà bản không đổi thì không tải lại lần nào.
 *
 * Ba điều kiện phải đủ cả ba, thiếu một là hỏng theo kiểu im lặng:
 *
 *   1. index.html KHÔNG được cache — nó giữ số bản của mọi tệp khác; giữ bản
 *      cũ là xin đúng những tệp cũ, và cả cơ chế thành vô nghĩa.
 *   2. Tệp xin KÈM số bản mới được cache lâu. Tệp xin trần thì không có gì
 *      bảo đảm, cache là lặp lại đúng chuyện hôm nay.
 *   3. Vân tay phải ĐỔI khi tệp đổi. Không đổi mà cache một năm là bẫy chết
 *      người: deploy xong người dùng vẫn thấy bản cũ và không có cách nào ép.
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const GOC = path.join(__dirname, '..', '..');
const APP = ['lark-task-manager', 'lark-lich-tac-nghiep', 'lark-ads-manager',
  'lark-ota-manager', 'lark-social', 'lark-chinh-anh', 'lark-kpi',
  'lark-quy-chi-phi', 'lark-bao-cao', 'lark-san-pham', 'lark-lich-lam-viec', 'lark-kol'];

console.log('\ntệp tĩnh được nhớ, và nhớ đúng bản');

/* ---- phần tĩnh: đọc mã, nhanh, chạy được ở mọi máy ---- */
let soApp = 0;
const thieuCache = [], thieuDau = [], conDauChuaThay = [];
for (const app of APP) {
  const fSv = path.join(GOC, app, 'server.js');
  const fHtml = path.join(GOC, app, 'public', 'index.html');
  let sv, html;
  try { sv = fs.readFileSync(fSv, 'utf8'); html = fs.readFileSync(fHtml, 'utf8'); }
  catch (_) { continue; }
  soApp++;

  /* Máy chủ phải cache lâu CÓ ĐIỀU KIỆN — cache vô điều kiện còn tệ hơn không
   * cache, vì nó khoá người dùng vào bản cũ. */
  const coCache = /max-age=31536000/.test(sv);
  const coDieuKien = /\[\?&\]v=/.test(sv);
  if (!coCache || !coDieuKien) {
    thieuCache.push(app + (coCache ? ' (cache nhưng KHÔNG theo số bản)' : ' (không cache)'));
  }

  /* Trang phải đóng dấu số bản lên MỌI đường css/js nội bộ. Sót một đường là
   * đường đó vừa không được cache, vừa có thể lệch bản với các đường kia. */
  const ds = [...html.matchAll(/\b(?:href|src)="([^"]*\.(?:css|js)[^"]*)"/g)]
    .map((m) => m[1]).filter((u) => !/^https?:|^\/\//.test(u))
    /* Bỏ đường /api/: có đuôi .js nhưng là nội dung SINH RA (lark-kol dựng
     * window.PQ_TOUR từ Base), không phải tệp trên đĩa. Chúng có chính sách
     * cache riêng theo độ tươi của dữ liệu, không đóng dấu vân tay được. */
    .filter((u) => !/^\/?api\//.test(u));
  const sot = ds.filter((u) => !/[?&]v=/.test(u));
  if (sot.length) thieuDau.push(app + ': ' + sot.join(' '));

  /* Và máy chủ phải THAY được dấu đó. Dấu còn nguyên trong tệp nguồn là đúng;
   * nhưng nếu không có chỗ nào thay thì người dùng nhận nguyên chữ __V__ —
   * một địa chỉ cố định, cache một năm, vĩnh viễn không đổi. */
  if (ds.some((u) => u.includes('__V__')) && !/__V__/.test(sv)) conDauChuaThay.push(app);
}

ok('soi được cả 12 app', soApp === 12, 'mới soi ' + soApp);
ok('app nào cũng cache tệp tĩnh, và chỉ khi có số bản',
  thieuCache.length === 0, thieuCache.join(' · '));
ok('mọi đường css/js đều được đóng dấu số bản',
  thieuDau.length === 0, thieuDau.join(' · '));
ok('dấu __V__ đều có nơi thay, không lọt ra người dùng',
  conDauChuaThay.length === 0, conDauChuaThay.join(' · '));

/* ---- phần động: bật app THẬT lên và đo ----
 *
 * Phải đo cả 12, không được đo mẫu. Thử phá để kiểm chính bộ này: bỏ lời gọi
 * `cacheTinh` ở một app mà vẫn giữ khai báo hàm — phần đọc mã ở trên KHÔNG
 * thấy, vì nó chỉ thấy hàm còn được khai chứ không biết có ai gọi. Một app âm
 * thầm quay về no-store là đủ để mất hết phần vừa làm, mà không dòng nào đỏ.
 *
 * Bật 12 app tốn chừng 45 giây. Đổi 45 giây lấy chỗ mù đó là đáng. */
const DO = APP.map((ten, i) => [ten, 28301 + i]);

async function batVaDo(ten, cong) {
  const con = spawn(process.execPath, ['server.js'], {
    cwd: path.join(GOC, ten), stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(cong) }),
  });
  await new Promise((r) => setTimeout(r, 3500));
  const G = 'http://127.0.0.1:' + cong;
  const kq = {};
  try {
    const rH = await fetch(G + '/', { redirect: 'manual' });
    const html = await rH.text();
    kq.trangChu = rH.headers.get('cache-control');
    kq.dungDoDai = !rH.headers.get('content-length')
      || Number(rH.headers.get('content-length')) === Buffer.byteLength(html, 'utf8');
    const m = /\b(?:href|src)="([^"]*\.css[?&]v=[^"]+)"/.exec(html);
    kq.soBan = m ? (/[?&]v=([^"&]+)/.exec(m[1]) || [])[1] : null;
    if (m) {
      const d = m[1].replace(/^\//, '');
      kq.coSoBan = (await fetch(G + '/' + d, { redirect: 'manual' })).headers.get('cache-control');
      kq.tran = (await fetch(G + '/' + d.split('?')[0], { redirect: 'manual' })).headers.get('cache-control');
    }
  } catch (e) { kq.loi = e.message; }
  try { execFileSync('taskkill', ['/pid', String(con.pid), '/T', '/F'], { stdio: 'ignore' }); }
  catch (_) { con.kill(); }
  await new Promise((r) => setTimeout(r, 300));
  return kq;
}

(async () => {
  for (const [ten, cong] of DO) {
    const a = await batVaDo(ten, cong);
    ok(ten + ': bật lên và trả lời được', !a.loi, a.loi);
    ok(ten + ': trang chủ KHÔNG nằm trong cache', a.trangChu === 'no-store', String(a.trangChu));
    ok(ten + ': Content-Length khớp sau khi thay số bản', a.dungDoDai !== false,
      'khai sai độ dài là trình duyệt cắt cụt đuôi trang');
    ok(ten + ': tệp có số bản được nhớ lâu', /max-age=31536000/.test(String(a.coSoBan)), String(a.coSoBan));
    ok(ten + ': tệp xin trần KHÔNG được nhớ', a.tran === 'no-store', String(a.tran));
    ok(ten + ': số bản là vân tay thật, không phải chữ __V__',
      !!a.soBan && !String(a.soBan).includes('__V__'), String(a.soBan));

    /* Điều kiện nặng nhất: sửa tệp thì số bản phải đổi. Sửa xong trả lại
     * nguyên vẹn — bộ thử không được để lại dấu vết trong kho mã.
     *
     * Cái này thì đo MẪU thôi: nó phải bật app thêm một lần nữa, mà cách tính
     * vân tay ở 12 app là cùng một khuôn, nên hai app đủ chứng minh khuôn ấy
     * đúng. Phần trên mới là phần phải quét hết, vì nó bắt chuyện một app lặng
     * lẽ rơi khỏi hàng. */
    if (!['lark-task-manager', 'lark-quy-chi-phi'].includes(ten)) continue;
    const f = path.join(GOC, ten, 'public', 'styles.css');
    const goc = fs.readFileSync(f);
    fs.writeFileSync(f, Buffer.concat([goc, Buffer.from('\n/* thử đổi số bản */\n')]));
    let sau;
    try { sau = (await batVaDo(ten, cong + 50)).soBan; }
    finally { fs.writeFileSync(f, goc); }
    ok(ten + ': sửa tệp thì số bản ĐỔI (không thì cache một năm là bẫy)',
      !!sau && sau !== a.soBan, 'trước ' + a.soBan + ' sau ' + sau);
    ok(ten + ': bộ thử trả lại tệp nguyên vẹn',
      Buffer.compare(fs.readFileSync(f), goc) === 0);
  }

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
  process.exit(fail ? 1 : 0);
})();
