'use strict';
/**
 * ============================================================================
 * PHÉP ĐO LINK KHÔNG ĐƯỢC HOÁ THÀNH "LỖI KẾT NỐI API"
 * ============================================================================
 * Sáng 01/10/2026 anh Hùng nhận một thẻ Lark:
 *
 *     Lỗi kết nối API · Thông tin sản phẩm → Google
 *     HTTP 401 · Unauthorized · 2 lần
 *     GET drive.google.com/file/d/…/view
 *     Token / khoá truy cập hết hạn hoặc sai — cần cấp lại.
 *
 * Không có token nào để cấp lại cả. App Thông tin sản phẩm không hề đăng nhập
 * Google: nó chỉ ĐANG ĐO xem link media dán trong Base khách có mở được không
 * (bao-cao-tuan.js · kiemLink). Link khoá chính là thứ nó đi tìm, và nó đã có
 * chỗ nói rồi — khối "Link media khách không mở được" trong báo cáo tuần.
 *
 * Nhưng lark-chung/canh-api.js bọc fetch của CẢ tiến trình, nên mỗi link Drive
 * khoá lại nổ thêm một thẻ báo động sai, chỉ sai chỗ phải sửa: việc cần làm là
 * mở quyền xem cho cái link ấy, không phải đi cấp lại khoá Google.
 *
 * Luật: phép ĐO link do người dùng dán vào phải chạy trong `canh.imLang(...)`.
 * App KOL (giaiLinkBanDo — dò link Google Maps rút gọn) cùng một kiểu, cùng
 * phải im.
 *
 * Chạy: node test/canh-im.test.js
 */
const fs = require('fs');
const path = require('path');
const canh = require('../../lark-chung/canh-api');

const CHA = path.join(__dirname, '..', '..');
const doc = (...p) => fs.readFileSync(path.join(CHA, ...p), 'utf8');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' → ' + vi : '')); console.log('  ✗ ' + ten); }
};
const group = (t) => console.log('\n' + t);

(async () => {
  group('imLang thật sự bịt miệng bộ canh');
  {
    /* Thay fetch bằng bản giả TRƯỚC khi gọi cai(): boc() bọc quanh cái fetch
     * đang có, nên gán sau là bọc rơi mất. Bản giả luôn trả 401 từ một host
     * NGOÀI máy (127.0.0.1 được bộ canh cố ý bỏ qua), không đụng mạng thật. */
    globalThis.fetch = async () => new Response('', { status: 401 });
    const su = [];
    canh.cai((s) => su.push(s));

    const LINK = 'https://drive.google.com/file/d/abc123/view';

    await fetch(LINK);
    await new Promise((r) => setTimeout(r, 20));
    ok('gọi thường mà 401 thì VẪN báo (không làm hỏng cảnh báo thật)',
      su.length === 1 && su[0].host === 'drive.google.com' && su[0].status === 401,
      JSON.stringify(su));

    const truoc = su.length;
    await canh.imLang(async () => { await fetch(LINK); });
    await new Promise((r) => setTimeout(r, 20));
    ok('gọi trong imLang thì KHÔNG báo', su.length === truoc, JSON.stringify(su.slice(truoc)));

    /* Quan trọng nhất: imLang phải theo được qua `await` và qua Promise.all —
     * kiemLink dò mọi link song song, hở chỗ này là coi như chưa sửa. */
    const truoc2 = su.length;
    await canh.imLang(async () => {
      await new Promise((r) => setTimeout(r, 5));
      await Promise.all([fetch(LINK), fetch(LINK), fetch(LINK)]);
    });
    await new Promise((r) => setTimeout(r, 20));
    ok('im cả khi dò song song nhiều link (Promise.all sau await)',
      su.length === truoc2, JSON.stringify(su.slice(truoc2)));

    const truoc3 = su.length;
    await fetch(LINK);
    await new Promise((r) => setTimeout(r, 20));
    ok('ra khỏi imLang thì báo lại như thường', su.length === truoc3 + 1);
  }

  group('Hai phép đo link đều chạy trong imLang');
  {
    const sp = doc('lark-san-pham', 'bao-cao-tuan.js');
    ok('Thông tin sản phẩm có lấy imLang', /require\('\.\.\/lark-chung\/canh-api'\)/.test(sp));
    const than = sp.slice(sp.indexOf('async function kiemLink'), sp.indexOf('/** Dựng nội dung báo cáo'));
    ok('kiemLink bọc cả thân trong imLang', /return imLang\(async \(\) => \{/.test(than));
    ok('và lời gọi fetch nằm TRONG đó', than.indexOf('return imLang') < than.indexOf('await fetch(u,'));

    const kol = doc('lark-kol', 'server.js');
    ok('KOL có lấy imLang', /require\('\.\.\/lark-chung\/canh-api'\)/.test(kol));
    const than2 = kol.slice(kol.indexOf('async function giaiLinkBanDo'));
    const het = than2.indexOf('\n}\n');
    ok('giaiLinkBanDo bọc vòng dò trong imLang', /await imLang\(async \(\) => \{/.test(than2.slice(0, het)));

    /* Nạp hụt lark-chung (mở app một mình) thì KHÔNG được chết lúc nạp. */
    ok('cả hai đều có đường lùi khi không có bộ canh',
      /let imLang = \(fn\) => fn\(\);/.test(sp) && /let imLang = \(fn\) => fn\(\);/.test(kol));
  }

  group('Nạp bằng --require và require() tương đối phải là MỘT');
  {
    /* Chỗ dễ hỏng im lặng nhất của cả bản vá: hub nhét bộ canh vào app con bằng
     * NODE_OPTIONS --require <đường dẫn tuyệt đối, gạch xuôi> (bao-loi-api.js),
     * còn app con lấy imLang bằng require('../lark-chung/canh-api'). Hai đường
     * đó mà ra hai instance thì mỗi bên giữ một AsyncLocalStorage riêng, imLang
     * bịt miệng đúng cái bộ canh KHÔNG ai nghe — thẻ báo nhầm vẫn bay về như cũ,
     * mà không có dấu hiệu nào cho biết bản vá đã thôi tác dụng. */
    const cp = require('child_process');
    const r = cp.spawnSync(process.execPath,
      ['-e', "console.log(global.__dau === require('../lark-chung/canh-api'))"],
      {
        cwd: path.join(CHA, 'lark-san-pham'),
        encoding: 'utf8',
        env: Object.assign({}, process.env, {
          NODE_OPTIONS: '--require "' + path.join(__dirname, 'canh-danh-dau.js').split(path.sep).join('/') + '"',
          CANH_API: require.resolve('../../lark-chung/canh-api').split(path.sep).join('/'),
        }),
      });
    ok('app con lấy đúng instance mà hub đã nạp', /true/.test(r.stdout || ''),
      ((r.stdout || '') + (r.stderr || '')).slice(0, 300));
  }

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exitCode = 1; }
})();
