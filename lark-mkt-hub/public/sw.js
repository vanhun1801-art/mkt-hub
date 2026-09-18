'use strict';
/*
 * SERVICE WORKER — chỉ làm ĐÚNG MỘT VIỆC: thay trang "502 Bad Gateway" của
 * Render bằng trang Ma-Két đang sửa (loi.html).
 *
 * Vì sao phải là service worker chứ không sửa server: khi hub chết hẳn (deploy,
 * khởi động lại, hết RAM, hoặc Render ngủ dậy chậm) thì KHÔNG một dòng code nào
 * của mình chạy nữa — Render tự trả trang đen "502 Bad Gateway · Request ID…".
 * Service worker sống trong trình duyệt, nên nó vẫn đứng đó lúc server nằm, và
 * là chỗ duy nhất chặn được trang đó.
 *
 * KHÔNG đệm app: file này không giữ index.html, app.js hay bất cứ thứ gì của
 * lớp vỏ. Đệm app là mở cửa cho bản cũ sống dai sau deploy — thứ khó truy nhất
 * khi đi hỏi "sao máy chị vẫn hiện giao diện tuần trước". Đệm đúng hai thứ:
 * trang báo hỏng và ảnh Ma-Két.
 *
 * Chỉ chặn ĐIỀU HƯỚNG (mở trang, mở khung app con). Mọi lời gọi /api/… vẫn đi
 * thẳng ra mạng như không có gì — app con phải tự biết API của nó hỏng, không
 * được nhận một trang HTML thay cho JSON.
 */

/* Số bản lấy từ ?v= lúc đăng ký (index.html thay BUILD bằng mtime của public).
 * Mỗi lần deploy là một tên kho mới -> trang báo hỏng được nạp lại, kho cũ bị
 * xoá ở bước activate. */
const PHIEN = new URL(self.location.href).searchParams.get('v') || '0';
const KHO = 'maket-loi-' + PHIEN;
/* ĐÚNG MỘT file trong đệm. Ảnh Ma-Két nằm ngay trong trang dưới dạng data:,
 * nên không có lời xin thứ hai nào để mà hụt — bản trước đệm ảnh riêng và
 * người dùng nhận khung ảnh vỡ ngay lần chạy thật đầu tiên. */
const TRANG = '/loi.html';

/** Nạp trang báo hỏng vào kho, KHÔNG để ?v= dính vào khoá (trang xin bản trần). */
async function giu(kho, duong) {
  /* Nuốt lỗi chứ không để nó dội ra: hụt mà làm cả bước cài đổ thì service
   * worker không cài được, và lúc hub nằm thật thì chẳng có lớp chắn nào. */
  try {
    const r = await fetch(duong + '?v=' + PHIEN, { cache: 'reload', credentials: 'same-origin' });
    /* Chưa đăng nhập thì hub trả 302 sang Lark — đệm cái đó lại thì lần hỏng thật
     * người dùng nhận một trang đăng nhập cụt. Chỉ giữ khi thật sự là 200. */
    if (r.ok && r.status === 200) await kho.put(duong, r.clone());
  } catch (_) { /* lần mở trang sau cài lại */ }
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const kho = await caches.open(KHO);
    await giu(kho, TRANG);
    /* Không chờ tab cũ đóng hết: bản mới chỉ đổi trang báo hỏng, không đổi cách
     * app chạy, nên thay ngay là an toàn và đỡ phải giải thích. */
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ten = await caches.keys();
    await Promise.all(ten.filter((k) => k.startsWith('maket-loi-') && k !== KHO)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** Trang báo hỏng trong kho; không có (đệm hụt) thì trả một trang chữ tối giản. */
async function trangBaoHong() {
  let co = null;
  /* Kho đệm có thể không mở được (chế độ ẩn danh, ổ đầy, người dùng vừa xoá dữ
   * liệu trang). Hỏng ở đây mà để lọt ra ngoài thì respondWith nhận lời hứa bị
   * từ chối, và trình duyệt hiện trang "không vào được trang này" — tệ hơn hẳn
   * cái trang 502 đang muốn thay. */
  try { co = await caches.match(TRANG, { ignoreSearch: true }); } catch (_) { co = null; }
  if (co) {
    /* Giữ nguyên thân, chỉ đổi mã trạng thái cho đúng sự thật: 503 = đang tạm
     * nghỉ, sẽ quay lại. Trả 200 thì mấy thứ đo đạc tưởng mọi chuyện bình thường. */
    try {
      return new Response(co.body, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    } catch (_) { /* thân đã bị dùng mất — rơi xuống bản chữ bên dưới */ }
  }
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Đang khắc phục</title>'
    + '<body style="font:15px/1.6 system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0">'
    + '<p>Ma-Két đang cố gắng khắc phục sự cố. Bạn chờ một lát rồi tải lại trang nhé.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  if (req.mode !== 'navigate') return;

  e.respondWith((async () => {
    let r;
    try {
      r = await fetch(req);
    } catch (_) {
      // mất mạng, hoặc Render cắt kết nối giữa chừng
      return trangBaoHong();
    }
    try {
      /* type 'opaqueredirect' (status 0) là cú chuyển sang trang đăng nhập Lark —
       * phải trả nguyên si cho trình duyệt đi tiếp, đụng vào là hỏng đăng nhập. */
      if (r.type === 'opaqueredirect') return r;
      /* Hub còn sống và đã tự trả trang Ma-Két (app con chết — xem proxy.js):
       * bản đó biết app nào chết và vì sao, giữ nguyên chứ đừng thay bằng bản
       * chung trong đệm. */
      if (r.headers.get('x-ma-ket') === 'loi') return r;
      /* CHỈ 502/503/504 mới là "server không với tới được". 500 là app mình tự
       * ném lỗi và thường kèm câu giải thích có ích hơn; 404 cũng vậy. */
      if (r.status === 502 || r.status === 503 || r.status === 504) return await trangBaoHong();
      return r;
    } catch (_) {
      /* Đọc header hay dựng trang đệm mà hỏng thì TRẢ NGUYÊN câu trả lời thật:
       * người dùng nhận trang của Render, xấu nhưng vẫn là trang — còn để lời
       * hứa bị từ chối là trình duyệt báo "không vào được trang này". */
      return r;
    }
  })());
});
