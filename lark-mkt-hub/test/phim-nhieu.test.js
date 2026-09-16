'use strict';
/**
 * ============================================================================
 * NHIỀU VIDEO GIỚI THIỆU — các ô 1..5, phát luân phiên
 * ============================================================================
 * Anh Hùng: "trường hợp anh muốn gắn video nữa thì được không, các video luân
 * phiên chạy".
 *
 * Phần xoay vòng ở trình duyệt nằm ở video-tin.test.js. Bài này lo phía máy
 * chủ, và chốt bốn chuyện dễ hỏng im lặng:
 *
 *   ô 1 giữ tên cũ  — video đang nằm trong kho tên là `video-tong-quan.mp4`.
 *                     Đổi quy ước đặt tên mà quên nó thì trang Tổng quan trống
 *                     trơn sau deploy, mà log không có gì.
 *   thêm ≠ thay     — POST không có `?i=` là THÊM vào ô trống; có `?i=` là THAY
 *                     đúng ô đó. Lẫn hai việc này thì thêm video thứ hai lại
 *                     đè mất video thứ nhất.
 *   DELETE trống    — trước đây DELETE không tham số nghĩa là "gỡ video" vì chỉ
 *                     có một cái. Giờ nghĩa đó thành "xoá sạch cả bộ". Phải báo
 *                     lỗi chứ không được đoán.
 *   tua được        — trang Tổng quan phát qua thẻ <video>, không có Range thì
 *                     Chrome không tua và có máy không phát nổi.
 *
 * Bài này GHI và XOÁ tệp thật, nên nó dựng hub trên một thư mục dữ liệu TẠM
 * (HUB_DU_LIEU) rồi tự dọn. Chạy thẳng vào du-lieu/ của phòng thì một lỗi
 * "thêm hoá ra thay" là đè mất video thật — đã xảy ra đúng một lần lúc cố tình
 * gài lại lỗi để xem bài có nổ không, cứu được nhờ tệp nằm trong kho git.
 *
 * Chạy: node test/phim-nhieu.test.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const GOC = path.join(__dirname, '..');
/* Thư mục dữ liệu riêng của bài thử, dựng mới mỗi lần chạy. */
const DL = path.join(GOC, '.tmp', 'phim-thu-' + process.pid);

/* Một MP4 tí hon nhưng ĐÚNG chuẩn: chỉ có hộp `ftyp`. Đủ để máy chủ nhận và
 * trả lại, mà không phải nhét vài MB vào kho chỉ để chạy test. */
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'ascii'),
  Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2', 'ascii'),
]);

/* Hai hub: một chế độ cli (thử cơ chế ô), một chế độ api (thử cửa quyền).
 * Cổng 5298/5297 — tránh 517x/518x đang có app con của phòng ngồi sẵn. */
function dungHub(port, env) {
  const con = spawn(process.execPath, ['server.js'], {
    env: Object.assign({}, process.env,
      { PORT: String(port), HUB_AUTOSTART: '0', HUB_DU_LIEU: DL }, env || {}),
    cwd: GOC, stdio: 'ignore',
  });
  return con;
}

async function cho(G) {
  for (let i = 0; i < 80; i++) {
    try { await fetch(G + '/healthz'); return true; } catch (_) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return false;
}

/* Hiện trạng ban đầu: ô 1 mang tên cũ, ô 2 có hậu tố số — đúng hai dạng tên
 * mà máy chủ phải hiểu. Dựng sẵn để bài thử không phụ thuộc máy ai đang có
 * mấy video. */
function dungDuLieu() {
  fs.mkdirSync(DL, { recursive: true });
  fs.writeFileSync(path.join(DL, 'video-tong-quan.mp4'), Buffer.concat([MP4, MP4, MP4]));
  fs.writeFileSync(path.join(DL, 'video-tong-quan-2.mp4'), Buffer.concat([MP4, MP4]));
}

function donDuLieu() {
  try { fs.rmSync(DL, { recursive: true, force: true }); } catch (_) { /* thôi */ }
}

(async () => {
  const P1 = 5298, P2 = 5297;
  const G1 = 'http://localhost:' + P1;
  const G2 = 'http://localhost:' + P2;
  dungDuLieu();
  const cli = dungHub(P1);
  const api = dungHub(P2, {
    LARK_APP_ID: 'cli_gia_de_vao_che_do_api',
    LARK_APP_SECRET: 'gia',
    SESSION_SECRET: 'kiem-thu-phim',
    PUBLIC_URL: G2,
  });
  let oThu = 0;

  try {
    if (!await cho(G1)) { ok('hub cli lên được', false, 'cổng ' + P1 + ' không trả lời'); return; }

    group('Danh sách ô');
    const tin = await (await fetch(G1 + '/api/video-gt-tin')).json();
    ok('trả về mảng ds', Array.isArray(tin.ds), JSON.stringify(tin).slice(0, 120));
    ok('đọc được cả hai dạng tên (ô 1 không hậu tố, ô 2 có)',
      tin.ds.length === 2 && tin.ds[0].ten === 'video-tong-quan.mp4' &&
      tin.ds[1].ten === 'video-tong-quan-2.mp4', JSON.stringify(tin.ds.map((x) => x.ten)));
    ok('có trần số ô', tin.toiDa >= 2, String(tin.toiDa));
    ok('tong khớp độ dài ds', tin.tong === tin.ds.length, tin.tong + ' vs ' + tin.ds.length);
    ok('co = có ít nhất một video', tin.co === (tin.ds.length > 0));
    ok('ds xếp tăng dần theo ô',
      tin.ds.every((x, k) => k === 0 || x.i > tin.ds[k - 1].i), JSON.stringify(tin.ds.map((x) => x.i)));
    /* Bản cũ của trang Tổng quan đọc thẳng `luc` ở gốc để chống đệm. Nó còn
     * nằm trong trình duyệt của ai chưa tải lại trang sau khi deploy. */
    if (tin.ds.length) {
      ok('vẫn trả các trường của video đầu ở gốc (cho bản cũ)',
        tin.luc === tin.ds[0].luc && tin.ten === tin.ds[0].ten);
      ok('ô 1 giữ tên cũ video-tong-quan.*',
        tin.ds[0].i !== 1 || /^video-tong-quan\.(mp4|webm|mov)$/.test(tin.ds[0].ten), tin.ds[0].ten);
    }

    group('Đường phát');
    if (tin.ds.length) {
      const dau = tin.ds[0];
      const khongI = await fetch(G1 + '/api/video-gt', { method: 'HEAD' });
      ok('không có ?i= thì phát ô 1 (đường dẫn cũ vẫn chạy)', khongI.status === 200, 'HTTP ' + khongI.status);
      const co = await fetch(G1 + '/api/video-gt?i=' + dau.i, { method: 'HEAD' });
      ok('?i= của ô đang có thì 200', co.status === 200, 'HTTP ' + co.status);
      /* Không có Range thì Chrome không tua được, và có máy không chịu phát. */
      /* Xin đúng 10 byte đầu: tệp thử chỉ vài chục byte nên xin 100 byte là
       * máy chủ kẹp lại còn 0-71 — đúng chuẩn, nhưng bài thử lại tưởng sai. */
      const r = await fetch(G1 + '/api/video-gt?i=' + dau.i, { headers: { Range: 'bytes=0-9' } });
      ok('tua được: trả 206', r.status === 206, 'HTTP ' + r.status);
      ok('… kèm Content-Range đúng dạng',
        /^bytes 0-9\/\d+$/.test(r.headers.get('content-range') || ''), r.headers.get('content-range'));
      ok('… và trả đúng 10 byte', (await r.arrayBuffer()).byteLength === 10);
      ok('… và khai Accept-Ranges', (r.headers.get('accept-ranges') || '') === 'bytes');
    }
    const ngoai = await fetch(G1 + '/api/video-gt?i=99');
    ok('ô ngoài khoảng 1..5 thì 404', ngoai.status === 404, 'HTTP ' + ngoai.status);
    const chuMinh = await fetch(G1 + '/api/video-gt?i=' + (tin.toiDa));
    if (!tin.ds.some((x) => x.i === tin.toiDa)) {
      ok('ô trống thì 404', chuMinh.status === 404, 'HTTP ' + chuMinh.status);
    }

    group('Thêm ≠ thay');
    const daCo = tin.ds.map((x) => x.i);
    const trongDau = [1, 2, 3, 4, 5].find((i) => !daCo.includes(i));
    if (!trongDau) {
      ok('còn ô trống để thử', false, 'cả 5 ô đều đang có video');
    } else {
      const them = await fetch(G1 + '/api/video-gt', {
        method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: MP4,
      });
      const kq = await them.json();
      oThu = kq.i;
      ok('POST không có ?i= thì THÊM vào ô trống đầu tiên', them.status === 200 && kq.i === trongDau,
        'HTTP ' + them.status + ' → ô ' + kq.i);
      /* Đây là chỗ hỏng thật nếu lẫn thêm với thay: video cũ phải còn nguyên. */
      const sau = await (await fetch(G1 + '/api/video-gt-tin')).json();
      ok('… và KHÔNG đụng tới video đang có',
        daCo.every((i) => sau.ds.some((x) => x.i === i)), JSON.stringify(sau.ds.map((x) => x.i)));
      ok('… ô mới có mặt trong danh sách', sau.ds.some((x) => x.i === oThu));
      const phat = await fetch(G1 + '/api/video-gt?i=' + oThu);
      ok('… và phát được', phat.status === 200, 'HTTP ' + phat.status);
      ok('… đúng số byte đã gửi',
        (await phat.arrayBuffer()).byteLength === MP4.length);

      const thay = await fetch(G1 + '/api/video-gt?i=' + oThu, {
        method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: Buffer.concat([MP4, MP4]),
      });
      const kq2 = await thay.json();
      ok('POST có ?i= thì THAY đúng ô đó', thay.status === 200 && kq2.i === oThu, 'ô ' + kq2.i);
      const lai = await fetch(G1 + '/api/video-gt?i=' + oThu);
      ok('… nội dung đã đổi', (await lai.arrayBuffer()).byteLength === MP4.length * 2);

      const sai = await fetch(G1 + '/api/video-gt', {
        method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: MP4,
      });
      ok('định dạng lạ thì 400', sai.status === 400, 'HTTP ' + sai.status);
      const oSai = await fetch(G1 + '/api/video-gt?i=9', {
        method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: MP4,
      });
      ok('ô ngoài khoảng thì 400', oSai.status === 400, 'HTTP ' + oSai.status);

      group('Gỡ phải nói rõ ô nào');
      /* Một cú bấm nhầm không được phép xoá cả bộ. */
      const trong = await fetch(G1 + '/api/video-gt', { method: 'DELETE' });
      ok('DELETE không có ?i= thì 400, KHÔNG xoá gì', trong.status === 400, 'HTTP ' + trong.status);
      const conNguyen = await (await fetch(G1 + '/api/video-gt-tin')).json();
      ok('… và mọi video vẫn còn', conNguyen.ds.length === sau.ds.length,
        conNguyen.ds.length + ' vs ' + sau.ds.length);

      const go = await fetch(G1 + '/api/video-gt?i=' + oThu, { method: 'DELETE' });
      ok('DELETE có ?i= thì gỡ đúng ô đó', go.status === 200, 'HTTP ' + go.status);
      const cuoi = await (await fetch(G1 + '/api/video-gt-tin')).json();
      ok('… ô đó biến khỏi danh sách', !cuoi.ds.some((x) => x.i === oThu));
      ok('… các video khác còn nguyên',
        daCo.every((i) => cuoi.ds.some((x) => x.i === i)), JSON.stringify(cuoi.ds.map((x) => x.i)));
      oThu = 0;
    }

    group('Chỉ quản lý được thay video');
    if (!await cho(G2)) { ok('hub api lên được', false, 'cổng ' + P2 + ' không trả lời'); return; }
    const upLau = await fetch(G2 + '/api/video-gt', {
      method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: MP4,
    });
    ok('người chưa đăng nhập KHÔNG tải video lên được',
      upLau.status === 401 || upLau.status === 403, 'HTTP ' + upLau.status);
    const goLau = await fetch(G2 + '/api/video-gt?i=2', { method: 'DELETE' });
    ok('người chưa đăng nhập KHÔNG gỡ video được',
      goLau.status === 401 || goLau.status === 403, 'HTTP ' + goLau.status);
  } finally {
    /* Dọn kể cả khi bài nổ giữa chừng — bỏ lại một tệp trong du-lieu/ là lần
     * chạy sau thấy một video lạ trên trang Tổng quan. */
    cli.kill();
    api.kill();
    donDuLieu();
    console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
    if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
  }
})();
