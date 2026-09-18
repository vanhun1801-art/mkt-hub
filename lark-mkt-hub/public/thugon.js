'use strict';
/*
 * THU GỌN KHỐI LỌC TRÊN ĐIỆN THOẠI — một file cho lớp vỏ và cả chín app con.
 *
 * Anh Hùng, sau khi test trên máy thật: "Thanh lọc chiếm nhiều diện tích, nó
 * luôn hiển thị ở đó và chiếm diện tích, nên tối ưu nhỏ lại, loại thanh thu
 * gọn và ẩn đi."
 *
 * Đo trước khi sửa, ở khổ 375px:
 *     lớp vỏ            .loc-bar    163px   (nội dung thật bắt đầu ở y=328/812)
 *     Bảng công việc    .filters    248px   (việc đầu tiên ở y=1337 — hơn 1,5 màn)
 *     Lịch tác nghiệp   .filters    296px
 *     Báo cáo & KPI     .loc-hang   379px
 *     Quỹ chi phí       .loc        184px
 *
 * Cách làm: thay cả khối bằng MỘT dòng tóm tắt "Lọc · Tháng này · Chưa xong",
 * bấm vào thì khối cũ hiện ra nguyên vẹn ngay tại chỗ, bấm lần nữa thì đóng.
 * Không đụng gì tới HTML hay JS của app — khối lọc vẫn là khối lọc cũ, chỉ bị
 * ẩn/hiện. Nhờ vậy mọi thứ app đang đọc từ DOM (giá trị select, ô tìm) vẫn
 * nguyên, và gỡ file này ra thì mọi app trở lại y như cũ.
 *
 * Chỉ chạy ở ≤640px. Trên máy tính khối lọc luôn mở, không có nút nào thêm.
 *
 * Câu tóm tắt lấy từ CHÍNH DOM đang hiển thị, nên nó tự đúng ngôn ngữ mà
 * i18n.js vừa dịch — không cần từ điển riêng. Riêng chữ "Lọc" là chữ của file
 * này nên nó nằm trong một text node riêng để i18n.js dịch được như mọi nhãn
 * khác (đã thêm khoá 'Lọc' vào từ điển).
 *
 * MỘT SELECTOR, NHIỀU KHỐI: Bảng công việc có ba khối .filters — mỗi tab một
 * khối (Tổng quan / Việc của tôi / Bảng) — và app ẩn tab không dùng bằng lớp
 * `hidden` trên <section> CHA. Nên file này phải duyệt hết mọi khối khớp
 * selector, và chỉ gắn thanh vào khối của tab ĐANG MỞ; gắn vào cả ba thì người
 * dùng thấy ba nút "Lọc" chồng nhau, hai trong số đó của tab không nhìn thấy.
 */
(function () {
  if (window.__THUGON__) return;              // tránh nạp hai lần
  window.__THUGON__ = true;

  var mq = window.matchMedia('(max-width: 640px)');
  var MO_SAN = false;                         // mặc định: đóng

  /* Khối nào được thu gọn?
   *   · app con — proxy của lớp vỏ khai sẵn trong __HUB__.locSelector, lấy từ
   *     `locSelector` của module trong modules.json;
   *   · lớp vỏ  — tự đánh dấu bằng thuộc tính data-thu-gon trên chính khối đó.
   * Không khai thì file này đứng yên, không làm gì cả. */
  function selector() {
    var s = (window.__HUB__ && window.__HUB__.locSelector) || '';
    if (s) return s;
    return document.querySelector('[data-thu-gon]') ? '[data-thu-gon]' : '';
  }

  function khois() {
    var s = selector();
    if (!s) return [];
    return [].slice.call(document.querySelectorAll(s));
  }

  /* Khối có thuộc về màn đang xem không?
   *
   * Chỉ soi TỔ TIÊN, không soi chính nó: chính nó lúc đang thu gọn thì
   * display:none, nên hỏi nó thì khối nào cũng bị coi là đang ẩn — thanh vừa
   * dựng xong đã bị chính mình gỡ ra.
   *
   * Và phải duyệt display của tổ tiên chứ KHÔNG hỏi `cha.offsetParent`: với
   * Social và Booking OTA, khối lọc là con trực tiếp của <body>, mà
   * `document.body.offsetParent` theo chuẩn CSS luôn là null — hỏi kiểu đó thì
   * hai app này vĩnh viễn bị chấm là "đang ẩn" và không bao giờ có thanh thu
   * gọn. (Đã mất một vòng đo mới thấy: bảy app kia chạy đúng, chỉ hai app này
   * im lặng không có nút nào.) */
  function dangHien(k) {
    for (var n = k.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    return true;
  }

  /* ---------------- câu tóm tắt ---------------- */

  /* Lấy những lựa chọn KHÁC MẶC ĐỊNH, vì nói lại mặc định thì không mang tin.
   * Với <select> thì "mặc định" quy ước là mục đầu tiên ("Mọi tháng", "All
   * staff"...) — đúng với cả chín app, vì cả chín đều dựng select theo lối đó. */
  function tomTat(k) {
    var ra = [];

    // mốc thời gian đang chọn: luôn nói, vì nó luôn đang lọc một cái gì đó
    var moc = k.querySelector('.hub-seg .on, .hub-seg .chon, .seg .on, .seg .chon');
    if (moc) ra.push((moc.textContent || '').trim());

    [].forEach.call(k.querySelectorAll('select'), function (s) {
      if (s.selectedIndex <= 0) return;                  // đang để mặc định
      var o = s.options[s.selectedIndex];
      var t = o ? (o.textContent || '').trim() : '';
      if (t) ra.push(t);
    });

    [].forEach.call(k.querySelectorAll('input[type="search"], input[type="text"]'), function (i) {
      var v = (i.value || '').trim();
      if (v) ra.push('“' + v + '”');
    });

    ra = ra.filter(Boolean);
    if (!ra.length) return '';
    /* Ba mục là hết chỗ của một dòng 375px; còn nữa thì đếm cho biết là còn. */
    if (ra.length > 3) return ra.slice(0, 3).join(' · ') + ' +' + (ra.length - 3);
    return ra.join(' · ');
  }

  /* ---------------- dựng / gỡ ---------------- */

  function thanhCua(k) {
    var t = k.previousElementSibling;
    return t && t.classList.contains('tg-thanh') ? t : null;
  }

  function veLai(k) {
    var thanh = thanhCua(k);
    if (!thanh) return;
    var tt = tomTat(k);
    /* textContent chứ không innerHTML: câu này có tên chiến dịch, tên người,
     * nội dung ô tìm — dữ liệu thật, không được để nó thành thẻ HTML. */
    thanh.querySelector('.tg-tt').textContent = tt;
    thanh.classList.toggle('tg-co', !!tt);
  }

  function dung(k) {
    if (thanhCua(k)) { veLai(k); return; }

    var thanh = document.createElement('button');
    thanh.type = 'button';
    thanh.className = 'tg-thanh';
    thanh.setAttribute('aria-expanded', String(MO_SAN));
    /* Chuỗi tĩnh, không có dữ liệu người dùng — dựng bằng innerHTML được.
     * "Lọc" nằm riêng một text node để i18n.js dịch nguyên node. */
    thanh.innerHTML =
      '<span class="tg-ic" aria-hidden="true"></span>' +
      '<span class="tg-nhan">Lọc</span>' +
      '<span class="tg-tt"></span>' +
      '<span class="tg-mui" aria-hidden="true"></span>';

    thanh.addEventListener('click', function () {
      /* Đọc lại khối từ chính thanh này, không gọi lại selector: trang có thể
       * có nhiều khối, thanh nào mở khối nấy. */
      var kk = thanh.nextElementSibling;
      if (!kk) return;
      var dangDong = kk.classList.contains('tg-dong');
      kk.classList.toggle('tg-dong', !dangDong);
      thanh.classList.toggle('tg-mo', dangDong);
      thanh.setAttribute('aria-expanded', String(dangDong));
    });

    k.parentNode.insertBefore(thanh, k);
    k.classList.toggle('tg-dong', !MO_SAN);
    thanh.classList.toggle('tg-mo', MO_SAN);
    veLai(k);
  }

  function go(k) {
    var thanh = thanhCua(k);
    if (thanh) thanh.remove();
    k.classList.remove('tg-dong');
  }

  /* ---------------- vòng đời ---------------- */

  function ap() {
    var ds = khois();
    for (var i = 0; i < ds.length; i++) {
      var k = ds[i];
      if (mq.matches && dangHien(k)) dung(k);
      else go(k);
    }
  }

  /* App dựng lại khối lọc lúc chạy (đổi tab, nạp xong dữ liệu) thì thanh tóm
   * tắt phải theo. Quan sát cả cây vì mỗi app dựng ở một chỗ khác nhau; mọi
   * việc trong `ap()` đều là kiểm-rồi-mới-sửa nên gọi thừa không hại gì.
   *
   * Gộp nhịp 120ms: `ap()` tự sinh ra mutation (chèn/gỡ thanh), mà mutation đó
   * lại gọi `ap()` — không gộp thì thành vòng lặp bận. */
  var cho = null;
  function hen() {
    if (cho) return;
    cho = setTimeout(function () { cho = null; ap(); }, 120);
  }

  function trongKhoi(el) {
    var s = selector();
    return s && el && el.closest ? el.closest(s) : null;
  }

  function batDau() {
    ap();

    if (window.MutationObserver) {
      new MutationObserver(hen).observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'],
      });
    }

    /* Đổi lựa chọn trong khối lọc thì câu tóm tắt phải đổi theo ngay, kể cả khi
     * khối đang mở — đóng lại là thấy đúng câu mới. */
    ['change', 'input'].forEach(function (loai) {
      document.addEventListener(loai, function (e) {
        var k = trongKhoi(e.target);
        if (k) veLai(k);
      }, true);
    });
    /* Mốc thời gian là <button>, không phát `change`. Đợi một nhịp cho app kịp
     * dời lớp .on sang nút mới rồi mới đọc. */
    document.addEventListener('click', function (e) {
      var k = trongKhoi(e.target);
      if (k) setTimeout(function () { veLai(k); }, 0);
    }, true);

    /* Xoay ngang máy hoặc đổi cỡ cửa sổ thì trả khối về đúng trạng thái của khổ
     * mới — không để máy tính dính một nút "Lọc" vô nghĩa, và ngược lại. */
    if (mq.addEventListener) mq.addEventListener('change', ap);
    else if (mq.addListener) mq.addListener(ap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', batDau);
  } else {
    batDau();
  }
})();
