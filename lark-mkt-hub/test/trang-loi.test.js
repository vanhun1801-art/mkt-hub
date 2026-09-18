'use strict';
/**
 * TRANG BÁO HỎNG "Ma-Két đang sửa" — ba lớp chắn, kiểm cả ba, không cần trình duyệt.
 *
 * VÌ SAO CÓ FILE NÀY: cái được thay ở đây là trang 502 màu đen của Render, thứ
 * chỉ hiện ra đúng lúc mọi thứ đang hỏng. Không ai mở nó ra xem hằng ngày để
 * phát hiện nó cũng hỏng nốt — mà một service worker viết sai thì không chỉ
 * hiện xấu, nó chặn luôn đường vào app. Nên phải có máy kiểm thay cho mắt.
 *
 * Ba lớp, theo thứ tự trình duyệt gặp:
 *   1. public/sw.js   — hub nằm hẳn, Render trả trang của họ; service worker đổi.
 *   2. proxy.js       — hub sống, app con chết; proxy tự dựng trang từ loi.html.
 *   3. public/app.js  — không có service worker và khung app con đã dính trang lỗi.
 */
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..');
const PUB = path.join(GOC, 'public');
const doc = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(ten, dieuKien, chiTiet) {
  if (dieuKien) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (chiTiet ? ' → ' + chiTiet : '')); console.log('  ✗ ' + ten); }
}

/* ============ 0. vật liệu ============ */
console.log('\nVật liệu');
{
  /* Ảnh rời vẫn cần: lớp phủ của lớp vỏ (lớp 3) dùng nó, và nó là bản gốc để
   * nhúng vào loi.html. */
  const anh = path.join(PUB, 'ma-ket-sua-loi.jpg');
  ok('có ảnh Ma-Két', fs.existsSync(anh));
  const kb = fs.existsSync(anh) ? fs.statSync(anh).size / 1024 : 0;
  /* Ảnh gốc 1,3 MB. Trang này hiện ra đúng lúc mạng hoặc server đang chật vật —
   * bắt tải 1,3 MB lúc đó là đổ thêm dầu; bản 720px đủ nét mà chỉ 42 KB. */
  ok('ảnh nhẹ (dưới 200 KB)', kb > 0 && kb < 200, Math.round(kb) + ' KB');

  const hGoc = doc('loi.html');
  /* Bỏ chú thích HTML rồi mới soi: chú thích trong file có NHẮC tới đường dẫn
   * ảnh (để kể vì sao không dùng nó nữa), mà đó không phải một lời xin. */
  const h = hGoc.replace(/<!--[\s\S]*?-->/g, '');
  ok('trang lỗi có dấu nhận mặt data-ma-ket', /<html[^>]+data-ma-ket="loi"/.test(h));
  ok('có chỗ chèn chi tiết <!--LOI-->', hGoc.includes('<!--LOI-->'));
  ok('nói đúng câu cần nói', h.includes('Ma-Két đang cố gắng khắc phục sự cố'));

  /* ĐÃ HỎNG THẬT 18/09/2026: bản đầu để ảnh ở đường dẫn riêng, trang hiện ra
   * đúng lúc server không với tới được nên lời xin ảnh trượt nốt — người dùng
   * nhận khung ảnh vỡ kèm chữ alt giữa trang. Trang này phải TỰ ĐỦ: đọc được
   * chữ thì chắc chắn thấy được ảnh. */
  ok('ảnh nhúng thẳng trong trang', /<img[^>]+src="data:image\/jpeg;base64,/.test(h));
  ok('KHÔNG xin ảnh qua đường dẫn riêng', !h.includes('/ma-ket-sua-loi.jpg'));
  /* Lúc trang này hiện ra thì server thường đang chết: xin thêm một file .css
   * hay .js nữa là thêm một lần hỏng, và trang hiện ra trần trụi không kiểu. */
  ok('không nạp css/js ngoài', !/<link[^>]+stylesheet/i.test(h) && !/<script[^>]+src=/i.test(h));
  const kbTrang = fs.statSync(path.join(PUB, 'loi.html')).size / 1024;
  ok('trang vẫn gọn (dưới 120 KB dù ôm cả ảnh)', kbTrang < 120, Math.round(kbTrang) + ' KB');
  /* Gõ cửa /healthz thì hub sống mà app con chết vẫn trả 200 -> nạp lại -> gặp
   * đúng trang này -> quay vòng vô tận. Phải gõ đúng địa chỉ đang hỏng. */
  ok('tự thử lại bằng chính địa chỉ đang hỏng', h.includes('fetch(location.href'));

  const idx = doc('index.html');
  ok('lớp vỏ có đăng ký service worker', /serviceWorker\.register\('\/sw\.js\?v=BUILD'/.test(idx));
}

/* ============ 1. service worker ============ */
console.log('\nLớp 1 — service worker (public/sw.js)');
{
  /* Chạy sw.js trong một cái vỏ giả: chỉ cần self, caches và fetch. Không mô
   * phỏng cả trình duyệt — điều muốn kiểm là LUẬT chọn trang, không phải
   * Chromium có chạy được service worker hay không. */
  function dungVo(fetchGia) {
    const tay = {};
    const kho = new Map();
    const caches = {
      open: async () => ({ put: async (k, v) => kho.set(k, v) }),
      match: async (k) => { const v = kho.get(k); return v ? v.clone() : undefined; },
      keys: async () => ['maket-loi-cu', 'maket-loi-9'],
      delete: async () => true,
    };
    const self = {
      location: { href: 'http://hub.test/sw.js?v=9' },
      addEventListener: (t, f) => { tay[t] = f; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    };
    const src = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
    new Function('self', 'caches', 'fetch', src)(self, caches, fetchGia);
    return { tay, kho };
  }

  const trangLoiHtml = doc('loi.html');
  const fetchThuong = async (u) => {
    const duong = String(u && u.url ? u.url : u);
    if (duong.includes('/loi.html')) {
      return new Response(trangLoiHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (duong.includes('ma-ket-sua-loi.jpg')) return new Response('JPG', { status: 200 });
    return new Response('?', { status: 404 });
  };

  const chay = async () => {
    /* waitUntil phải GIỮ lời hứa lại rồi chờ: trình duyệt thật cũng làm vậy,
     * còn bỏ qua nó thì phép kiểm chạy trước lúc worker kịp nạp đệm. */
    const cai = async (t) => { let cho; await t.install({ waitUntil: (x) => { cho = x; } }); await cho; };

    const { tay, kho } = dungVo(fetchThuong);
    ok('có bắt cả ba sự kiện', !!(tay.install && tay.activate && tay.fetch));
    await cai(tay);
    ok('lúc cài có giữ sẵn trang lỗi', kho.has('/loi.html'));
    /* Đúng MỘT file: ảnh đã nằm trong trang, đệm thêm là thêm chỗ để hụt. */
    ok('không đệm gì ngoài trang lỗi', kho.size === 1, [...kho.keys()].join(', '));

    /** Bắn một sự kiện fetch, trả về câu trả lời service worker chọn (null = không đụng). */
    const ban = async (req, traLoi) => {
      const { tay: t } = dungVo(traLoi || fetchThuong);
      await cai(t);
      let p = null;
      t.fetch({ request: req, respondWith: (x) => { p = x; } });
      return p ? await p : null;
    };

    const dieuHuong = { method: 'GET', url: 'http://hub.test/m/lich-tac-nghiep/', mode: 'navigate' };

    // Render trả 502 -> phải thay bằng trang Ma-Két
    let r = await ban(dieuHuong, async (u) => (String(u.url || u).includes('/loi.html')
      ? fetchThuong(u)
      : new Response('<title>502 Bad Gateway</title>Powered by Render', { status: 502 })));
    let than = r ? await r.text() : '';
    ok('502 của Render bị thay bằng trang Ma-Két', than.includes('Ma-Két đang cố gắng khắc phục sự cố'));
    ok('trả 503 chứ không giả vờ 200', r && r.status === 503, r && String(r.status));

    // mất mạng hẳn
    r = await ban(dieuHuong, async (u) => {
      // chỉ ĐƯỜNG ĐANG MỞ mất mạng; đệm vẫn nạp được như lần trước
      if (String(u.url || u).includes('/m/')) throw new Error('mất mạng');
      return fetchThuong(u);
    });
    than = r ? await r.text() : '';
    ok('mất mạng cũng ra trang Ma-Két', than.includes('Ma-Két'));

    // proxy đã tự trả trang Ma-Két (có chi tiết app nào chết) -> giữ nguyên
    r = await ban(dieuHuong, async (u) => (String(u.url || u).includes('/loi.html')
      ? fetchThuong(u)
      : new Response('TRANG CỦA PROXY', { status: 502, headers: { 'X-Ma-Ket': 'loi' } })));
    than = r ? await r.text() : '';
    ok('trang Ma-Két của proxy được giữ nguyên', than === 'TRANG CỦA PROXY');

    // chuyển hướng sang đăng nhập Lark: đụng vào là hỏng đăng nhập
    r = await ban(dieuHuong, async (u) => {
      if (String(u.url || u).includes('/loi.html')) return fetchThuong(u);
      /* Node không cho dựng Response status 0, mà đúng thứ cần thử lại là
       * câu trả lời "đi tới trang đăng nhập" ấy — nên dựng vật giả cho giống. */
      return { type: 'opaqueredirect', status: 0, headers: new Headers() };
    });
    ok('cú chuyển sang trang đăng nhập đi thẳng', r && r.type === 'opaqueredirect');

    // trang bình thường
    r = await ban(dieuHuong, async (u) => (String(u.url || u).includes('/loi.html')
      ? fetchThuong(u)
      : new Response('APP', { status: 200 })));
    than = r ? await r.text() : '';
    ok('trang chạy tốt không bị đụng vào', than === 'APP');

    // 500 là app tự ném lỗi, thường kèm lời giải thích có ích hơn
    r = await ban(dieuHuong, async (u) => (String(u.url || u).includes('/loi.html')
      ? fetchThuong(u)
      : new Response('Lỗi trong app', { status: 500 })));
    than = r ? await r.text() : '';
    ok('lỗi 500 của chính app được giữ nguyên', than === 'Lỗi trong app');

    // KHÔNG được nuốt lời gọi API: app con phải tự biết API của nó hỏng
    r = await ban({ method: 'GET', url: 'http://hub.test/api/hub', mode: 'cors' },
      async () => new Response('{}', { status: 502 }));
    ok('lời gọi /api không bị đụng vào', r === null);

    r = await ban({ method: 'POST', url: 'http://hub.test/m/x/', mode: 'navigate' },
      async () => new Response('', { status: 502 }));
    ok('lệnh ghi (POST) không bị đụng vào', r === null);
  };

  chay().then(ket).catch((e) => { fail++; fails.push('lớp 1 nổ: ' + e.message); ket(); });
}

/* ============ 2 & 3 chạy sau khi lớp 1 xong (nó bất đồng bộ) ============ */
function ket() {
  console.log('\nLớp 2 — proxy (app con chết)');
  {
    const { trangLoi } = require(path.join(GOC, 'proxy.js'));
    const mod = { ten: 'Lịch tác nghiệp', lenh: ['node', 'server.js'], thuMuc: '../lark-lich-tac-nghiep' };
    const html = trangLoi(mod, 'connect ECONNREFUSED 127.0.0.1:5174');
    ok('dựng từ loi.html (ảnh Ma-Két đi kèm luôn trong trang)',
      html.includes('data:image/jpeg;base64,'));
    ok('chèn được chi tiết cho người quản trị', html.includes('window.__LOI__')
      && html.includes('Lịch tác nghiệp') && html.includes('ECONNREFUSED'));
    ok('giữ lệnh chạy và thư mục', html.includes('node server.js') && html.includes('lark-lich-tac-nghiep'));

    /* Lời báo lỗi đi thẳng từ ngoài vào một thẻ <script>. Không thoát dấu < thì
     * một thông báo chứa "</script>" đóng sớm thẻ ấy và phần còn lại của trang
     * thành chữ trần — hoặc tệ hơn. */
    const doc2 = trangLoi(mod, 'lỗi lạ </script><img src=x onerror=alert(1)>');
    const trongScript = doc2.slice(doc2.indexOf('window.__LOI__'));
    ok('thông báo lỗi không thoát khỏi thẻ script',
      !/<\/script>/i.test(trongScript.slice(0, trongScript.indexOf(';</script>'))));
  }

  console.log('\nLớp 3 — lớp vỏ (khung app con dính trang lỗi)');
  {
    const js = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
    ok('khung app con có soi trang lỗi lúc nạp xong', /dinhTrangLoi\(f\)/.test(js));
    ok('có lớp phủ Ma-Két', /function phuLoi\(/.test(js) && js.includes('ma-ket-sua-loi.jpg'));
    /* Lớp phủ chạy khi server không với tới được, nên ảnh cũng có thể trượt —
     * ẩn hẳn còn hơn để Chrome vẽ khung vỡ kèm chữ alt. */
    ok('ảnh của lớp phủ hỏng thì ẩn đi', /onerror="this\.remove\(\)"/.test(js));
    ok('lớp phủ có kiểu trong styles.css', doc('styles.css').includes('.frame-loi'));

    /* Cắt đúng hàm nhận mặt ra chạy thử: đây là chỗ dễ sai nhất của lớp 3 —
     * nhận nhầm thì app đang chạy tốt bị phủ trang báo hỏng lên. */
    const dau = js.indexOf('function dinhTrangLoi(');
    const cuoi = js.indexOf('\n}\n', dau) + 3;
    const nhan = new Function('return ' + js.slice(dau, cuoi))();

    const khung = (title, text, maKet) => ({
      contentDocument: {
        title,
        body: { innerText: text },
        documentElement: { getAttribute: () => (maKet ? 'loi' : null) },
      },
    });
    ok('nhận ra trang 502 của Render',
      nhan(khung('502 Bad Gateway', 'This service is currently unavailable. Powered by Render')));
    ok('nhận ra trang 503',
      nhan(khung('503 Service Temporarily Unavailable', 'Bad Gateway')));
    ok('không nhận nhầm app đang chạy',
      !nhan(khung('Lịch tác nghiệp', 'Đăng ký tác nghiệp · duyệt · báo cáo')));
    ok('không phủ đè lên trang Ma-Két của proxy',
      !nhan(khung('Ma-Két đang khắc phục sự cố', 'Ma-Két đang cố gắng khắc phục sự cố', true)));
    ok('khung khác origin thì bỏ qua', !nhan({ get contentDocument() { throw new Error('cross-origin'); } }));
  }

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
}
