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
  const lop = new Set();
  const v = {
    muted: false, paused: true, loop: true, currentTime: 0,
    soLanLoad: 0, soLanPlay: 0, nghe: {}, dataset: {},
    /* Mọi lần gán src đều ghi lại: "chớp đen" chính là lúc gán src cho thẻ
     * ĐANG HIỆN, nên đếm được thì chốt được. */
    ganSrc: [],
    classList: {
      add: (c) => lop.add(c),
      remove: (c) => lop.delete(c),
      contains: (c) => lop.has(c),
    },
    hien() { return lop.has('hien'); },
    tren() { return lop.has('tren'); },
    /* Thẻ đã nạp sẵn thì có khung hình để vẽ. Mã chỉ cho một thẻ lên hình khi
     * `readyState >= 2`; để 0 là nó đứng chờ, và đó cũng là một bài thử riêng
     * bên dưới. */
    readyState: 4,
    offsetWidth: 0,
    addEventListener(t, f) { (this.nghe[t] = this.nghe[t] || []).push(f); },
    getAttribute(k) { return k === 'src' ? v.src : null; },
    play() {
      this.soLanPlay++;
      if (chanTieng && !this.muted) return Promise.reject(new Error('NotAllowedError'));
      this.paused = false;
      return Promise.resolve();
    },
    soLanPause: 0,
    pause() { this.soLanPause++; this.paused = true; },
    thuocTinhDaBo: [],
    removeAttribute(t) { this.thuocTinhDaBo.push(t); },
    /* `load()` trên thẻ CÒN thuộc tính `autoplay` là trình duyệt tự chạy lại
     * nó — mô phỏng đúng như vậy, nếu không bài thử không thấy được lỗi hai
     * thẻ cùng chạy. */
    load() {
      this.soLanLoad++;
      this.currentTime = 0;
      if (!this.thuocTinhDaBo.includes('autoplay')) { this.paused = false; this.soLanPlay++; }
      else this.paused = true;
    },
    /** Giả lập trình duyệt bắn `ended` khi hết bài. */
    hetBai() { this.paused = true; (this.nghe.ended || []).forEach((f) => f()); },
    hong() { (this.nghe.error || []).forEach((f) => f()); },
    dangPhat() { (this.nghe.playing || []).forEach((f) => f()); },
  };
  let nguon = '';
  Object.defineProperty(v, 'src', {
    get: () => nguon,
    set: (x) => { nguon = x; v.ganSrc.push(x); },
  });
  return v;
}

/** Thẻ <img> giả. `hong` = tải ảnh hỏng (complete nhưng không có kích thước). */
function anhGia() {
  const a = {
    complete: false, naturalWidth: 0, nghe: {}, ganSrc: [],
    addEventListener(t, f) { (this.nghe[t] = this.nghe[t] || []).push(f); },
    getAttribute(k) { return k === 'src' ? a.src : null; },
    /** Ảnh về tới nơi. */
    xong() { this.complete = true; this.naturalWidth = 640; (this.nghe.load || []).forEach((f) => f()); },
  };
  let nguon = '';
  Object.defineProperty(a, 'src', {
    get: () => nguon,
    set: (x) => { nguon = x; a.ganSrc.push(x); a.complete = false; a.naturalWidth = 0; },
  });
  return a;
}

/**
 * Một LỚP của ô phát: có sẵn cả <video> lẫn <img>, đúng như markup thật.
 *
 * Mấy chục câu kiểm cũ đọc thẳng `a.src`, `a.paused`, `a.nghe`… nên lớp giả
 * chuyển tiếp những khoá đó xuống thẻ video của nó — khỏi phải sửa lại từng
 * câu, mà vẫn thử đúng cấu trúc mới. `hien`/`tren`/`la-anh` thì thuộc về CHÍNH
 * lớp, không phải thẻ bên trong.
 */
function lopGia(tuyChon) {
  const v = videoGia(tuyChon);
  const im = anhGia();
  const lop = new Set();
  const L = {
    video: v,
    img: im,
    dataset: {},
    querySelector: (sel) => (sel === 'video' ? v : im),
    classList: {
      add: (c) => lop.add(c),
      remove: (c) => lop.delete(c),
      contains: (c) => lop.has(c),
    },
    hien: () => lop.has('hien'),
    tren: () => lop.has('tren'),
    laAnh: () => lop.has('la-anh'),
    laPhim: () => lop.has('la-phim'),
  };
  ['src', 'paused', 'muted', 'currentTime', 'readyState', 'error',
    'soLanPlay', 'soLanLoad', 'soLanPause', 'ganSrc', 'nghe', 'thuocTinhDaBo'].forEach((k) =>
    Object.defineProperty(L, k, {
      get: () => v[k], set: (x) => { v[k] = x; }, enumerable: true,
    }));
  ['hetBai', 'hong', 'dangPhat'].forEach((k) => { L[k] = (...x) => v[k](...x); });
  return L;
}

function chay(luaChon, tuyChon) {
  const daBam = !!(tuyChon && tuyChon.daBam);
  const vong = (tuyChon && tuyChon.ds) || null;
  const kho = new Map();
  if (luaChon != null) kho.set('hub.tinTieng', luaChon);
  const nut = { textContent: '', title: '', onclick: null, setAttribute() {} };
  const phim = lopGia(tuyChon);
  const hen = [];
  let soHen = 0;
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
    setTimeout: (f, ms) => { if (!ms) return setImmediate(f); hen.push([f, ms, ++soHen]); return soHen; },
    setInterval: (f, ms) => hen.push([f, ms]),
    clearTimeout: (id) => { const i = hen.findIndex((x) => x[2] === id); if (i >= 0) hen.splice(i, 1); },
    Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(KHOI, ctx);
  ctx.ganPhimTin(phim, nut, vong);
  /* Một cú bấm bất kỳ trên trang — đúng thứ trình duyệt đòi trước khi cho tiếng. */
  const bam = () => (cuChi.pointerdown || []).slice().forEach((f) => f());
  return { phim, nut, kho, hen, bam };
}

/**
 * Dựng ĐÚNG cảnh thật của trang Tổng quan khi có nhiều video: hai thẻ chồng
 * nhau, thẻ đầu đã có src và đang hiện, thẻ sau để trống.
 */
function chayHaiThe(ds, luaChon) {
  const kho = new Map();
  if (luaChon != null) kho.set('hub.tinTieng', luaChon);
  const nut = { textContent: '', title: '', onclick: null, setAttribute() {} };
  const a = lopGia(); const b = lopGia();
  const hen = [];
  let soHen = 0;
  const cuChi = {};
  const ctx = {
    localStorage: { getItem: (k) => (kho.has(k) ? kho.get(k) : null), setItem: (k, v) => kho.set(k, v) },
    document: { hidden: false, addEventListener() {}, body: { contains: () => true } },
    window: {
      addEventListener(t, f) { (cuChi[t] = cuChi[t] || []).push(f); },
      removeEventListener(t, f) { cuChi[t] = (cuChi[t] || []).filter((x) => x !== f); },
    },
    S: { view: 'home' },
    DA_CO_CU_CHI: false,
    nguonPhim: (x) => (x ? '/api/video-gt?i=' + (x.i || 1) + '&v=' + (x.luc || 0) : ''),
    setTimeout: (f, ms) => { if (!ms) return setImmediate(f); hen.push([f, ms, ++soHen]); return soHen; },
    setInterval: (f, ms) => hen.push([f, ms]),
    clearTimeout: (id) => { const i = hen.findIndex((x) => x[2] === id); if (i >= 0) hen.splice(i, 1); },
    Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(KHOI, ctx);
  ctx.ganPhimTin([a, b], nut, ds);
  /* ganPhimTin() tự gắn bài đầu vào lớp 1 — lượt gán đó là dựng ban đầu, không
   * phải "gán lại src cho thẻ đang hiện" mà mấy câu dưới đi soi. */
  a.ganSrc.length = 0;
  const bam = () => (cuChi.pointerdown || []).slice().forEach((f) => f());
  return { a, b, nut, hen, bam };
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
    phim.ganSrc.length = 0;          // bỏ lượt gán lúc dựng, chỉ đếm lượt SAU đó
    phim.currentTime = 99;
    phim.hetBai(); await doi();
    ok('một video thì chỉ tua về đầu, không gán lại src',
      phim.currentTime === 0 && phim.ganSrc.length === 0, JSON.stringify(phim.ganSrc));
    ok('và chạy tiếp', phim.paused === false);
  }

  group('Chuyển bài KHÔNG được chớp đen');
  {
    /* Anh Hùng: "đang có 1 khoảng chớp đen khi chuyển giữa các video, anh muốn
     * không có 1 khoảng đen chuyển nào cả".
     *
     * Nguồn cơn của khoảng đen là gán src cho chính thẻ đang hiện: trình duyệt
     * vứt khung hình cũ rồi mới đi tải bài mới, ở giữa là nền đen. Cách chữa
     * duy nhất không phụ thuộc tốc độ mạng: bài kế nằm SẴN trong thẻ thứ hai,
     * chuyển bài chỉ là đổi thẻ nào hiện. */
    const ds = [{ i: 1, luc: 11 }, { i: 2, luc: 22 }, { i: 3, luc: 33 }];
    const { a, b, hen } = chayHaiThe(ds);
    await doi();
    a.dangPhat();                              // bài đầu đã chạy được
    await doi();
    ok('thẻ thứ hai đã nạp SẴN bài kế', /i=2&v=22/.test(b.src), b.src);
    ok('… và đã gọi load()', b.soLanLoad >= 1, String(b.soLanLoad));
    ok('thẻ đang hiện KHÔNG bị gán lại src', a.ganSrc.length === 0, JSON.stringify(a.ganSrc));

    a.hetBai(); await doi();
    ok('hết bài: thẻ hai lên hình', b.hien() === true);
    /* ĐÂY là chỗ hỏng lần thứ ba, và là lỗi anh Hùng vẫn còn thấy: mờ CHÉO —
     * thẻ cũ 1→0 cùng lúc thẻ mới 0→1. Nền dưới hai thẻ màu ĐEN, nên lúc cả
     * hai cùng khoảng 0.5 thì mắt chỉ nhận được chừng ba phần tư độ sáng: tối
     * sầm đúng nhịp chuyển. Thẻ cũ phải GIỮ NGUYÊN độ đục cho tới khi thẻ mới
     * đã che kín. */
    ok('… thẻ một VẪN đục, không mờ theo', a.hien() === true);
    ok('… thẻ hai nằm TRÊN', b.tren() === true);
    ok('… thẻ một xuống dưới', a.tren() === false);
    ok('… thẻ hai đang chạy', b.paused === false);
    /* Dừng thẻ cũ NGAY là hở ra đúng khoảng đen cần tránh: khung hình cuối
     * của nó phải còn đó suốt lượt mờ dần. `ended` đã tự đặt paused = true
     * (đúng như trình duyệt), nên thứ phải chốt là mã KHÔNG tự gọi pause() —
     * mà hẹn lại sau khi mờ xong. */
    ok('… mã không tự dừng thẻ cũ ngay', a.soLanPause === 0, String(a.soLanPause));
    /* KHÔNG chờ `transitionend`, và cũng không được có hiệu ứng nào để mà chờ:
     * đo thật thấy có môi trường chuyển động không chạy một nhịp nào, thẻ mới
     * đứng ở trong suốt, thẻ cũ đến giờ vẫn bị tắt — màn hình đen hẳn mấy
     * giây, tệ hơn cả lỗi ban đầu. Giờ chỉ còn một nhịp ngắn để chắc đã qua
     * một lượt vẽ. */
    ok('… không trông vào transitionend nữa', b.nghe.transitionend === undefined);
    const henDon = hen.filter(([, ms]) => ms > 0 && ms <= 400);
    ok('… chỉ chờ một nhịp vẽ rồi dọn', henDon.length === 1,
      JSON.stringify(hen.map((h) => h[1])));
    ok('… và suốt lượt đó không thẻ nào bị gán src khi đang hiện',
      b.ganSrc.length === 1, JSON.stringify(b.ganSrc));

    /* Trước khi dọn, thẻ cũ là thứ đang che nền đen — gán src cho nó là xoá
     * luôn khung hình nó đang giữ. Phải để yên. */
    await doi();
    ok('chưa dọn thì thẻ cũ KHÔNG bị nạp bài khác', a.ganSrc.length === 0,
      JSON.stringify(a.ganSrc));

    henDon.forEach(([f]) => f());               // qua một lượt vẽ
    await doi();
    ok('qua một lượt vẽ mới tắt thẻ cũ', a.hien() === false);
    ok('… rồi mới dừng thẻ cũ', a.soLanPause === 1, String(a.soLanPause));
    /* Lưới đỡ nổ sau đó không được dọn lần thứ hai — dọn hai lần là tua thẻ
     * đang nạp về đầu lần nữa, phí một lượt tải. */
    henDon.forEach(([f]) => f());
    ok('… lưới đỡ nổ sau cũng không dọn lại lần hai', a.soLanPause === 1, String(a.soLanPause));
    ok('… và lúc đó mới giao bài tiếp theo cho nó', /i=3&v=33/.test(a.src), a.src);
    /* Nạp bài kế phải gọi load(), mà load() trên thẻ CÒN `autoplay` là trình
     * duyệt tự chạy lại nó: thẻ đang ẩn chạy ngầm song song với thẻ đang hiện,
     * và đến lượt nó lên hình thì đang ở giữa bài. Đo trên máy thật thấy cả
     * hai thẻ cùng chạy ở giây 20. */
    ok('… thẻ ẩn KHÔNG chạy ngầm sau khi nạp bài mới', a.paused === true,
      'paused=' + a.paused);
    ok('bỏ autoplay của cả hai thẻ khi nhận quyền điều khiển',
      a.thuocTinhDaBo.includes('autoplay') && b.thuocTinhDaBo.includes('autoplay'),
      JSON.stringify([a.thuocTinhDaBo, b.thuocTinhDaBo]));
  }
  {
    /* Hết vòng phải quay lại bài 1 — vẫn bằng cách đổi thẻ, không phải reload. */
    const ds = [{ i: 1, luc: 11 }, { i: 2, luc: 22 }];
    const { a, b, hen } = chayHaiThe(ds);
    await doi(); a.dangPhat(); await doi();
    a.hetBai(); await doi(); await doi();
    ok('bài 2 đang hiện', b.hien() === true && /i=2/.test(b.src));
    const nhip = () => hen.filter(([, ms]) => ms > 0 && ms <= 400).forEach(([f]) => f());
    nhip(); await doi();                        // qua một lượt vẽ
    ok('thẻ rảnh nạp lại bài 1 để quay vòng', /i=1&v=11/.test(a.src), a.src);
    b.hetBai(); await doi();
    ok('hết vòng: thẻ một lên lại', a.hien() === true && a.tren() === true);
    ok('… bài 2 vẫn đục cho tới khi bài 1 che kín', b.hien() === true);
    ok('… và vẫn chạy', a.paused === false);
    nhip(); await doi();
    ok('… che kín rồi mới tắt bài 2', b.hien() === false);
  }
  {
    /* Thẻ mới chưa có khung hình mà đã cho lên là CHÍNH NÓ vẽ ra màu đen: nó
     * nằm trên, mờ dần tới đục, mà trong tay không có gì để vẽ. `play()` trả
     * về xong không có nghĩa là đã có khung — sau một lần tua hay lúc mạng
     * chớp thì readyState vẫn < 2. */
    const ds = [{ i: 1, luc: 11 }, { i: 2, luc: 22 }];
    const { a, b, hen } = chayHaiThe(ds);
    await doi(); a.dangPhat(); await doi();
    b.readyState = 0;                           // thẻ kế chưa có gì để vẽ
    a.hetBai(); await doi(); await doi();
    ok('thẻ chưa có khung hình thì CHƯA cho lên', b.hien() === false);
    ok('… thẻ cũ vẫn đang che nền', a.hien() === true);
    ok('… có lưới đỡ để không chờ mãi', hen.some(([, ms]) => ms === 700),
      JSON.stringify(hen.map((h) => h[1])));
    b.readyState = 4;
    (b.nghe.loadeddata || []).forEach((f) => f());   // khung hình về tới
    await doi();
    ok('có khung hình rồi mới lên', b.hien() === true && b.tren() === true);
  }
  {
    /* Tiếng phải theo sang thẻ kia, kể cả thẻ đang nằm chờ — thẻ chờ còn tiếng
     * thì lúc lên hình nó kêu trái với nút. */
    const ds = [{ i: 1, luc: 11 }, { i: 2, luc: 22 }];
    const { a, b, bam, nut } = chayHaiThe(ds, '1');
    await doi(); bam(); await doi();
    ok('bấm một cái là có tiếng', a.muted === false);
    ok('thẻ đang chờ cũng mở tiếng sẵn', b.muted === false);
    a.hetBai(); await doi();
    ok('sang bài sau vẫn có tiếng', b.muted === false);
    ok('nút vẫn báo có tiếng', nut.textContent === '🔊', nut.textContent);
  }

  group('Ô phát nhận cả ẢNH, không chỉ video');
  {
    /* Anh Hùng: "chỗ video phát anh muốn thêm định dạng ảnh nữa thay vì chỉ có
     * định dạng video". Ảnh không có sự kiện "hết bài" nên phải tự hẹn giờ. */
    const ds = [{ i: 1, luc: 11 }, { i: 2, luc: 22, anh: true }];
    const { a, b, nut, hen } = chayHaiThe(ds);
    await doi();
    ok('bài đầu là video ⇒ lớp 1 bật thẻ video', a.laPhim() === true && a.laAnh() === false);
    ok('… và nút loa vẫn hiện', nut.hidden !== true);
    a.dangPhat(); await doi();
    ok('ảnh được nạp sẵn vào thẻ <img> của lớp kia', /i=2&v=22/.test(b.img.src), b.img.src);
    ok('… KHÔNG nạp vào thẻ video của lớp đó', b.ganSrc.length === 0, JSON.stringify(b.ganSrc));
    ok('… và lớp kia đã đổi sang kiểu ảnh', b.laAnh() === true && b.laPhim() === false);

    a.hetBai(); await doi();
    ok('hết video ⇒ ảnh chưa giải mã xong thì CHƯA lên', b.hien() === false);
    b.img.xong(); await doi();
    ok('ảnh giải mã xong mới lên hình', b.hien() === true && b.tren() === true);
    /* Ảnh làm gì có tiếng — bày nút loa ở đó là mời người ta bấm một cái nút
     * không làm gì. */
    ok('đang chiếu ảnh thì GIẤU nút loa', nut.hidden === true);
    ok('không gọi play() cho ảnh', b.soLanPlay === 0, String(b.soLanPlay));
  }
  {
    /* Ảnh phải tự sang bài kế: không có `ended` thì chỉ còn hẹn giờ. */
    const ds = [{ i: 1, luc: 11, anh: true }, { i: 2, luc: 22 }];
    const { a, b, hen, nut } = chayHaiThe(ds);
    await doi();
    ok('bài đầu là ảnh ⇒ lớp 1 bật thẻ ảnh', a.laAnh() === true);
    ok('… nút loa bị giấu ngay từ đầu', nut.hidden === true);
    ok('… và KHÔNG gọi play()', a.soLanPlay === 0, String(a.soLanPlay));
    const henAnh = hen.filter(([, ms]) => ms === 8000);
    ok('có hẹn giờ cho ảnh đứng rồi sang bài kế', henAnh.length === 1,
      JSON.stringify(hen.map((h) => h[1])));
    /* Bài đầu là ảnh thì thẻ video không bao giờ bắn `playing`, nên lượt nạp
     * trước phải đi bằng đường hẹn giờ — nếu không bài kế mãi không được nạp. */
    hen.filter(([, ms]) => ms === 2000).forEach(([f]) => f());
    await doi();
    ok('vẫn nạp sẵn được bài kế dù ảnh không bắn playing', /i=2&v=22/.test(b.src), b.src);
    henAnh.forEach(([f]) => f());
    await doi();
    ok('hết giờ thì sang video', b.hien() === true && b.laPhim() === true);
    ok('… và nút loa hiện lại', nut.hidden === false);
  }
  {
    /* Ảnh hỏng cũng không được làm cả vòng đứng lại. */
    const ds = [{ i: 1, luc: 11 }, { i: 2, luc: 22, anh: true }, { i: 3, luc: 33 }];
    const { a, b } = chayHaiThe(ds);
    await doi(); a.dangPhat(); await doi();
    b.img.complete = true; b.img.naturalWidth = 0;   // tải về hỏng
    a.hetBai(); await doi(); await doi();
    ok('ảnh hỏng thì bỏ qua, nhảy sang bài kế', /i=3&v=33/.test(b.src), b.src);
    ok('… và bài kế là video nên lớp đó về kiểu video', b.laPhim() === true);
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
