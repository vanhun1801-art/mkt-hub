'use strict';
/**
 * ============================================================================
 * VIDEO TRÊN TRANG TỔNG QUAN — phải CHẠY, chạy mãi, và có tiếng
 * ============================================================================
 * Anh Hùng: "khi anh vào mở ứng dụng thì nó không tự động chạy… xem thêm cho
 * video chạy liên tục không dừng không lỗi, mặc định mở âm thanh".
 *
 * Lỗi cũ, và là loại lỗi chỉ lộ ra ở MÁY ĐÃ TỪNG BẤM: mã đọc lựa chọn "bật
 * tiếng" rồi bỏ câm NGAY từ đầu. Trình duyệt chỉ cho tự chạy khi video ĐANG
 * CÂM, nên từ lần đó trở đi video không bao giờ tự chạy nữa — và nó chặn im
 * lặng, `play()` bị từ chối chứ không báo gì.
 *
 * Ba điều bài này chốt, chạy CHÍNH hàm của app.js trong vm với một thẻ video
 * giả — không cần trình duyệt:
 *
 *   1. mở ra là CÂM rồi chạy, kể cả khi người dùng đã chọn "bật tiếng";
 *   2. bỏ câm ngay khi trình duyệt cho phép, và nếu bị chặn thì lùi về câm mà
 *      VẪN CHẠY (video đứng hình là người ta tưởng app hỏng);
 *   3. mặc định là CÓ tiếng; chỉ khi người dùng tự tắt mới im.
 *
 * Chạy: node test/video-tin.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

/* ---------------- nạp đúng hàm ganPhimTin của app.js ---------------- */
const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const dau = SRC.indexOf('function ganPhimTin(');
const cuoi = SRC.indexOf('\nfunction veHome()', dau);
if (dau < 0 || cuoi < 0) {
  console.log('  \x1b[31mFAIL\x1b[0m không tìm thấy ganPhimTin trong public/app.js');
  console.log('\n\x1b[31m0 pass · 1 fail\x1b[0m');
  process.exit(1);
}
const KHOI = SRC.slice(dau, cuoi);

/**
 * Thẻ video giả. `chanTieng` = trình duyệt từ chối play() khi chưa câm, đúng
 * cách Chrome xử một lượt tự chạy có tiếng.
 */
function videoGia({ chanTieng = false } = {}) {
  return {
    muted: false, paused: true, loop: true, currentTime: 0,
    soLanPlay: 0, nghe: {},
    addEventListener(t, f) { (this.nghe[t] = this.nghe[t] || []).push(f); },
    play() {
      this.soLanPlay++;
      if (chanTieng && !this.muted) return Promise.reject(new Error('NotAllowedError'));
      this.paused = false;
      return Promise.resolve();
    },
    load() {},
  };
}

function chay(luaChon, tuyChon) {
  const daBam = !!(tuyChon && tuyChon.daBam);
  const kho = new Map();
  if (luaChon != null) kho.set('hub.tinTieng', luaChon);
  const nut = { textContent: '', title: '', onclick: null, setAttribute() {} };
  const phim = videoGia(tuyChon);
  const hen = [];
  const cuChi = {};          // sự kiện window -> danh sách hàm, để bắn cử chỉ giả
  const ctx = {
    localStorage: { getItem: (k) => (kho.has(k) ? kho.get(k) : null), setItem: (k, v) => kho.set(k, v) },
    document: { hidden: false, addEventListener() {} },
    window: {
      addEventListener(t, f) { (cuChi[t] = cuChi[t] || []).push(f); },
      removeEventListener(t, f) { cuChi[t] = (cuChi[t] || []).filter((x) => x !== f); },
    },
    S: { view: 'home' },
    /* Trang đã có cú bấm nào chưa — app.js giữ cờ này ở ngoài hàm. Mặc định
     * FALSE để bài thử đúng cảnh "vừa mở app, chưa bấm gì". */
    DA_CO_CU_CHI: daBam,
    /* setTimeout 0 phải CHẠY THẬT: nhánh "đã có cử chỉ" mở tiếng qua nó. Hẹn
     * dài hơn thì chỉ ghi lại để xem có đặt hay không. */
    setTimeout: (f, ms) => { if (!ms) return setImmediate(f); hen.push([f, ms]); },
    setInterval: (f, ms) => hen.push([f, ms]),
    Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(KHOI, ctx);
  ctx.ganPhimTin(phim, nut);
  /* Một cú bấm bất kỳ trên trang — đúng thứ trình duyệt đòi trước khi cho tiếng. */
  const bam = () => (cuChi.pointerdown || []).slice().forEach((f) => f());
  return { phim, nut, kho, hen, bam };
}

/* Đợi hết microtask: `play()` trả Promise nên nhánh .catch chạy sau một nhịp. */
const doi = () => new Promise((r) => setImmediate(r));

(async () => {
  group('Mở ra là phải CHẠY');
  {
    const { phim } = chay(null);
    ok('gọi play() ngay', phim.soLanPlay >= 1, String(phim.soLanPlay));
    await doi();
    ok('video đang chạy', phim.paused === false);
  }
  {
    /* Đây chính là máy của anh Hùng: đã bấm bật tiếng từ lần trước. */
    const { phim } = chay('1');
    await doi();
    ok('đã chọn "bật tiếng" từ trước thì VẪN tự chạy', phim.paused === false);
  }

  group('Câm cho tới khi có cử chỉ, rồi mới mở tiếng');
  {
    /* Đây là ràng buộc của TRÌNH DUYỆT, không phải lựa chọn thẩm mỹ: gán
     * muted = false trước khi có cử chỉ thì Chrome DỪNG luôn video, và vì
     * play() sau đó cũng bị từ chối nên video nằm im — mở app lên thấy đứng
     * hình mà nút lại báo có tiếng. Đúng lỗi anh Hùng gặp. */
    const { phim, nut } = chay(null);
    await doi();
    ok('lúc mới vào: CÂM', phim.muted === true);
    ok('lúc mới vào: vẫn chạy', phim.paused === false);
    ok('nút hiện đúng trạng thái thật (tắt tiếng)', nut.textContent === '🔇', nut.textContent);
  }
  {
    const { phim, nut, bam } = chay(null);
    await doi();
    bam();
    await doi();
    ok('một cú bấm bất kỳ ⇒ có tiếng', phim.muted === false);
    ok('và vẫn chạy', phim.paused === false);
    ok('nút đổi theo', nut.textContent === '🔊', nut.textContent);
  }
  {
    const { phim, bam } = chay('0');
    await doi();
    bam();
    await doi();
    ok('ai tự tắt tiếng thì bấm mấy cũng vẫn im', phim.muted === true);
    ok('và vẫn chạy', phim.paused === false);
  }

  {
    /* Quay về trang Tổng quan lần thứ hai: trang đã có cử chỉ từ trước, không
     * được bắt bấm lại lần nữa mới có tiếng. */
    const { phim } = chay(null, { daBam: true });
    await doi(); await doi();
    ok('trang đã từng được bấm ⇒ có tiếng ngay', phim.muted === false);
    ok('và vẫn chạy', phim.paused === false);
  }

  group('Trình duyệt chặn tiếng thì KHÔNG được đứng hình');
  {
    const { phim, bam } = chay('1', { chanTieng: true });
    await doi();
    bam();
    await doi(); await doi();
    ok('vẫn chạy', phim.paused === false);
  }

  group('Chạy liên tục');
  {
    const { phim, hen } = chay(null);
    ok('có canh nhịp gọi lại', hen.some(([, ms]) => ms === 5000), JSON.stringify(hen.map((h) => h[1])));
    ['ended', 'stalled', 'error', 'volumechange'].forEach((t) => {
      ok('bắt sự kiện ' + t, Array.isArray(phim.nghe[t]) && phim.nghe[t].length > 0);
    });
    /* Hết bài mà `loop` hụt thì tự tua về đầu — video đứng ở khung cuối trông
     * y như hỏng. */
    phim.paused = true; phim.currentTime = 99;
    phim.nghe.ended[0]();
    await doi();
    ok('hết bài thì tua về đầu và chạy tiếp', phim.currentTime === 0 && phim.paused === false);
  }

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
})();
