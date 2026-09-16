'use strict';
/**
 * ============================================================================
 * VIDEO TRÊN TRANG TỔNG QUAN — phải CHẠY, chạy mãi, và có tiếng
 * ============================================================================
 * Anh Hùng: "khi anh vào mở ứng dụng thì nó không tự động chạy… xem thêm cho
 * video chạy liên tục không dừng không lỗi" — và sau đó đổi ý về âm thanh:
 * "mặc định là video tắt âm thanh nha". Trang Tổng quan là chỗ mở ra xem số
 * giữa phòng làm việc, tự phát tiếng là phiền.
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
 *   3. mặc định là TẮT tiếng; chỉ khi người dùng tự bấm loa mới có, và lựa
 *      chọn đó phải được nhớ cho lần sau.
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
    src: '', soLanLoad: 0, soLanPlay: 0, nghe: {},
    addEventListener(t, f) { (this.nghe[t] = this.nghe[t] || []).push(f); },
    play() {
      this.soLanPlay++;
      if (chanTieng && !this.muted) return Promise.reject(new Error('NotAllowedError'));
      this.paused = false;
      return Promise.resolve();
    },
    load() { this.soLanLoad++; },
    /** Giả lập trình duyệt bắn `ended` khi hết bài. */
    hetBai() { this.paused = true; (this.nghe.ended || []).forEach((f) => f()); },
    hong() { (this.nghe.error || []).forEach((f) => f()); },
  };
}

function chay(luaChon, tuyChon) {
  const daBam = !!(tuyChon && tuyChon.daBam);
  const vong = (tuyChon && tuyChon.ds) || null;
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
    /* app.js dựng đường phát bằng hàm này; nạp riêng khối ganPhimTin nên phải
     * đưa vào đây, và giữ đúng một dạng với bản thật. */
    nguonPhim: (x) => (x ? '/api/video-gt?i=' + (x.i || 1) + '&v=' + (x.luc || 0) : ''),
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
  ctx.ganPhimTin(phim, nut, vong);
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
    /* Mặc định: bấm cả ngày cũng vẫn im. Đây là luật anh Hùng chốt sau cùng —
     * cửa sổ nào cũng có thể là cửa sổ đang mở giữa cuộc họp. */
    const { phim, nut, bam } = chay(null);
    await doi();
    bam();
    await doi();
    ok('CHƯA chọn gì ⇒ vẫn câm dù đã bấm', phim.muted === true);
    ok('và vẫn chạy', phim.paused === false);
    ok('nút báo đúng là đang tắt tiếng', nut.textContent === '🔇', nut.textContent);
  }
  {
    /* Đã tự bấm loa từ lần trước: một cú bấm bất kỳ là có tiếng ngay, không
     * phải đi tìm cái loa bấm lại. */
    const { phim, nut, bam } = chay('1');
    await doi();
    bam();
    await doi();
    ok('đã bật tiếng từ trước + một cú bấm ⇒ có tiếng', phim.muted === false);
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
    const { phim } = chay('1', { daBam: true });
    await doi(); await doi();
    ok('đã bật tiếng + trang đã từng được bấm ⇒ có tiếng ngay', phim.muted === false);
    ok('và vẫn chạy', phim.paused === false);
    const b = chay(null, { daBam: true });
    await doi(); await doi();
    ok('mặc định thì quay lại bao nhiêu lần cũng vẫn câm', b.phim.muted === true);
    ok('và vẫn chạy', b.phim.paused === false);
  }

  group('Trình duyệt chặn tiếng thì KHÔNG được đứng hình');
  {
    const { phim, bam } = chay('1', { chanTieng: true });
    await doi();
    bam();
    await doi(); await doi();
    ok('vẫn chạy', phim.paused === false);
  }

  group('Nhiều video: phát luân phiên');
  {
    /* Anh Hùng: "trường hợp anh muốn gắn video nữa thì được không, các video
     * luân phiên chạy". Thứ tự: 1 -> 2 -> 3 -> quay lại 1. */
    const ds = [{ i: 1, luc: 11 }, { i: 2, luc: 22 }, { i: 3, luc: 33 }];
    const { phim } = chay(null, { ds });
    await doi();
    phim.hetBai(); await doi();
    ok('hết video 1 thì sang video 2', /i=2&v=22/.test(phim.src), phim.src);
    ok('và chạy luôn, không đợi ai bấm', phim.paused === false);
    ok('có gọi load() cho lượt mới', phim.soLanLoad >= 1, String(phim.soLanLoad));
    phim.hetBai(); await doi();
    ok('rồi sang video 3', /i=3&v=33/.test(phim.src), phim.src);
    phim.hetBai(); await doi();
    /* Hết vòng phải QUAY LẠI đầu, không đứng lại ở cái cuối — đứng lại thì
     * sáng hôm sau ai đến cũng chỉ thấy đúng một video. */
    ok('hết vòng thì quay lại video 1', /i=1&v=11/.test(phim.src), phim.src);
    ok('vẫn chạy', phim.paused === false);
  }
  {
    /* Đổi bài KHÔNG được làm mất lựa chọn tiếng: nghe dở chừng mà sang bài sau
     * lại câm thì coi như nút loa hỏng. */
    const ds = [{ i: 1, luc: 11 }, { i: 2, luc: 22 }];
    const { phim, bam } = chay('1', { ds });
    await doi(); bam(); await doi();
    ok('đang có tiếng', phim.muted === false);
    phim.hetBai(); await doi();
    ok('sang bài sau vẫn có tiếng', phim.muted === false);
    ok('và vẫn chạy', phim.paused === false);
  }
  {
    /* Một tệp hỏng (vừa bị gỡ, tải lỗi) mà cả vòng đứng theo thì cái hỏng ăn
     * mất cả bộ. Phải bỏ qua nó ngay, không đợi 10 giây như khi chỉ có một. */
    const ds = [{ i: 1, luc: 11 }, { i: 2, luc: 22 }];
    const { phim } = chay(null, { ds });
    await doi();
    phim.hong(); await doi();
    ok('một video hỏng thì nhảy ngay sang cái kế', /i=2&v=22/.test(phim.src), phim.src);
    ok('và vẫn chạy', phim.paused === false);
  }
  {
    /* Chỉ một video: giữ nguyên lối cũ — tua về đầu, KHÔNG đụng tới src (đổi
     * src là tải lại cả tệp qua mạng, mỗi vòng một lần, vô ích). */
    const { phim } = chay(null, { ds: [{ i: 1, luc: 11 }] });
    await doi();
    phim.currentTime = 99;
    phim.hetBai(); await doi();
    ok('một video thì chỉ tua về đầu', phim.currentTime === 0 && phim.src === '');
    ok('và chạy tiếp', phim.paused === false);
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
