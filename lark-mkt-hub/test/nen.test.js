'use strict';
/**
 * Kiểm thử lớp nén (nen.js) — phần thuần logic chạy luôn, phần HTTP cần hub
 * đang chạy ở cổng 5180 (không có thì tự bỏ qua, không tính lỗi).
 *
 *   node test/nen.test.js
 *   HUB=http://localhost:5180 node test/nen.test.js
 *
 * Phép thử QUAN TRỌNG NHẤT ở đây không phải "có nén không" mà là "giải nén ra
 * có ĐÚNG BẰNG bản thô không". Nén sai một byte thì app.js hỏng, mà hỏng kiểu
 * này không báo lỗi ở server — chỉ có màn hình trắng ở máy người dùng.
 */
const http = require('http');
const zlib = require('zlib');
const nen = require('../nen');

const GOC = (process.env.HUB || 'http://localhost:5180').replace(/\/+$/, '');
let pass = 0, fail = 0, bo = 0;

function ok(dieuKien, ten, chiTiet) {
  if (dieuKien) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten + (chiTiet ? '  → ' + chiTiet : '')); }
}
const boQua = (ten, vi) => { bo++; console.log('  – ' + ten + '  (bỏ qua: ' + vi + ')'); };

/** Tải một đường dẫn, KHÔNG tự giải nén — phải nhìn được byte thật trên dây. */
function tai(duongDan, acceptEncoding) {
  return new Promise((giai, hong) => {
    const u = new URL(GOC + duongDan);
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET',
      timeout: 30000,
      headers: acceptEncoding ? { 'accept-encoding': acceptEncoding } : {},
    }, (res) => {
      const buf = [];
      res.on('data', (c) => buf.push(c));
      res.on('end', () => giai({ code: res.statusCode, headers: res.headers, than: Buffer.concat(buf) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', hong);
    req.end();
  });
}

const giaiNen = (buf, ma) => (ma === 'br' ? zlib.brotliDecompressSync(buf)
  : ma === 'gzip' ? zlib.gunzipSync(buf) : buf);

(async function () {
  console.log('\nKiểm thử lớp nén · ' + GOC + '\n');

  /* ---- 1. chọn kiểu nén theo Accept-Encoding ---- */
  console.log('[1] Thương lượng Accept-Encoding');
  const ch = (v) => nen.chon({ headers: v === null ? {} : { 'accept-encoding': v } });
  ok(ch('gzip, deflate, br, zstd') === 'br', 'Trình duyệt hiện đại -> br (nhỏ nhất)');
  ok(ch('gzip, deflate') === 'gzip', 'Chỉ có gzip -> gzip');
  ok(ch(null) === '', 'Không khai gì -> gửi bản thô');
  ok(ch('identity') === '', 'identity -> bản thô');
  ok(ch('*') === 'br', 'Dấu sao -> được chọn thoải mái');
  /* q=0 là cách CHUẨN để nói "đừng dùng kiểu này" — gặp thật ở vài proxy
   * doanh nghiệp. Đọc sai chỗ này là gửi br cho nơi không giải được. */
  ok(ch('br;q=0, gzip') === 'gzip', 'br;q=0 -> tụt xuống gzip');
  ok(ch('gzip;q=0') === '', 'gzip;q=0 và không có br -> bản thô');

  /* ---- 2. kiểu nội dung nào được nén ---- */
  console.log('\n[2] Kiểu nội dung');
  ok(nen.nenDuoc('application/json; charset=utf-8'), 'JSON: nén');
  ok(nen.nenDuoc('text/html; charset=utf-8'), 'HTML: nén');
  ok(nen.nenDuoc('application/javascript; charset=utf-8'), 'JS: nén');
  ok(nen.nenDuoc('image/svg+xml'), 'SVG: nén (là chữ)');
  /* SSE mà nén là luồng Trực tiếp của Booking OTA đứng im hàng phút: zlib gom
   * đệm chờ đủ khối mới đẩy. Đây là phép thử canh cửa cho cả tính năng đó. */
  ok(!nen.nenDuoc('text/event-stream; charset=utf-8'), 'SSE: KHÔNG nén');
  ok(!nen.nenDuoc('image/png'), 'PNG: không nén (đã nén sẵn)');
  ok(!nen.nenDuoc('application/octet-stream'), 'Nhị phân lạ: không nén');
  ok(!nen.nenDuoc(''), 'Không biết kiểu gì: không nén');

  /* ---- 3. nén rồi giải ra phải y hệt ---- */
  console.log('\n[3] Nén — giải, không sai một byte');
  const mau = Buffer.from('Lịch tác nghiệp · quá hạn · 一二三 · '.repeat(200), 'utf8');
  for (const ma of ['br', 'gzip']) {
    const z = await nen.nenBuf(mau, ma, false);
    ok(giaiNen(z, ma).equals(mau), ma + ': giải ra đúng bằng bản gốc');
    ok(z.length < mau.length, ma + ': nhỏ hơn bản gốc (' + mau.length + ' -> ' + z.length + ')');
  }

  /* ---- 4. qua HTTP thật ---- */
  console.log('\n[4] Trên đường truyền thật');
  let song = true;
  try { await tai('/healthz'); } catch (_) { song = false; }
  if (!song) {
    boQua('Toàn bộ nhóm HTTP', 'hub chưa chạy ở ' + GOC);
  } else {
    const tho = await tai('/app.js?v=1');
    const br = await tai('/app.js?v=1', 'br');
    const gz = await tai('/app.js?v=1', 'gzip');

    ok(!tho.headers['content-encoding'], 'Không xin nén -> trả bản thô');
    ok(br.headers['content-encoding'] === 'br', 'Xin br -> nhận br');
    ok(gz.headers['content-encoding'] === 'gzip', 'Xin gzip -> nhận gzip');

    /* Đây là phép thử đắt giá nhất của cả file: bản nén giải ra phải khớp
     * TỪNG BYTE với bản thô. Sai ở đây là app.js hỏng trên máy người dùng mà
     * server không hề báo lỗi. */
    ok(giaiNen(br.than, 'br').equals(tho.than), 'br giải ra khớp từng byte với bản thô');
    ok(giaiNen(gz.than, 'gzip').equals(tho.than), 'gzip giải ra khớp từng byte với bản thô');

    ok(br.than.length < tho.than.length / 2, 'br nhỏ hơn một nửa ('
      + tho.than.length + ' -> ' + br.than.length + ')');

    /* Thiếu Vary thì proxy/CDN đứng giữa có thể đưa bản br cho trình duyệt chỉ
     * hiểu gzip — lỗi chỉ hiện ở MỘT SỐ người dùng, loại khó lần nhất. */
    ok(/accept-encoding/i.test(br.headers.vary || ''), 'Bản nén có Vary: Accept-Encoding');

    ok(br.headers['content-length'] === String(br.than.length),
      'Content-Length khớp số byte thật (không còn chunked)');

    /* File nhỏ hơn ngưỡng: nén vào còn to hơn vì phần đầu gzip. */
    const nho = await tai('/icon.svg', 'br');
    ok(!nho.headers['content-encoding'], 'File dưới 1 KB: không nén');

    /* JSON của API cũng phải được nén — /api/lich-chung là 23 KB mỗi lượt và
     * KHÔNG được cache (no-store), nên đây là phần tốn băng thông lặp lại. */
    const apiTho = await tai('/api/lich-chung');
    const apiBr = await tai('/api/lich-chung', 'br');
    if (apiTho.code !== 200) {
      boQua('API JSON được nén', 'HTTP ' + apiTho.code);
    } else {
      ok(apiBr.headers['content-encoding'] === 'br', 'API JSON được nén');
      ok(giaiNen(apiBr.than, 'br').equals(apiTho.than), 'JSON giải ra khớp bản thô');
    }

    /* Trang HTML của app con đi qua proxy: nó được CHÈN thêm shim rồi mới nén,
     * nên đây kiểm cả hai việc cùng lúc. */
    const hub = JSON.parse((await tai('/api/hub')).than.toString('utf8'));
    const modChay = (hub.modules || []).find((x) => x.kieu === 'local'
      && x.tinhTrang && (x.tinhTrang.trangThai === 'chay' || x.tinhTrang.trangThai === 'ngoai'));
    if (!modChay) {
      boQua('Nén trên đường proxy', 'không có module nào đang chạy');
    } else {
      const mTho = await tai('/m/' + modChay.id + '/');
      const mBr = await tai('/m/' + modChay.id + '/', 'br');
      ok(mBr.headers['content-encoding'] === 'br', 'HTML app con qua proxy được nén');
      ok(giaiNen(mBr.than, 'br').toString('utf8').includes('__HUB__'),
        'Giải nén ra vẫn còn shim của lớp vỏ');
      ok(giaiNen(mBr.than, 'br').equals(mTho.than), 'HTML app con: nén-giải khớp bản thô');
    }
  }

  console.log('\n' + pass + ' pass · ' + fail + ' fail' + (bo ? ' · ' + bo + ' bỏ qua' : ''));
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error('\nNổ giữa chừng: ' + e.message);
  console.log('\n' + pass + ' pass · ' + (fail + 1) + ' fail');
  process.exitCode = 1;
});
