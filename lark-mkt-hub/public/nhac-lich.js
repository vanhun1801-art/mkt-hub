'use strict';
/* ==========================================================================
   NHẮC ĐĂNG KÝ LỊCH LÀM VIỆC
   ==========================================================================
   Anh Hùng (23/09/2026): lịch đăng ký "hiện lên ngày 29 hằng tháng, hiện cho
   đến khi họ xong đăng ký rồi mới tắt".

   Nên hộp này:
     - hỏi app Lịch làm việc (`/api/nhac`) xem người đang mở có phải đăng ký
       không — ngày nào bắt đầu nhắc, tháng nào, ai phải nộp đều do APP quyết
       (ma-cong.js → thangPhaiDangKy), lớp vỏ chỉ hiện;
     - dùng lại lớp phủ của thông báo chặn màn hình (.bb-phu), và cũng như nó
       KHÔNG có nút đóng: đường ra duy nhất là "Đăng ký ngay";
     - tự lùi khi người đó đang ở trong chính app Lịch làm việc (không thì lớp
       phủ che mất chỗ phải bấm), và hiện lại ngay khi họ đi chỗ khác mà chưa
       nộp;
     - nhường thông báo chặn màn hình của quản lý: có cái đó thì chờ.
   ========================================================================== */
const NL = { mod: 'lich-lam-viec', du: null, deSau: '' };

/* Giờ Việt Nam của mốc đóng kỳ. */
const lucVN = (ms) => {
  const d = new Date(ms + 7 * 3600000);
  const h = (n) => String(n).padStart(2, '0');
  return h(d.getUTCHours()) + ':' + h(d.getUTCMinutes()) + ' ' + h(d.getUTCDate()) + '/' + h(d.getUTCMonth() + 1);
};

async function napNhacLich() {
  const co = (S.modules || []).some((m) => m.id === NL.mod);
  if (!co) { NL.du = null; return veNhacLich(); }
  try {
    const r = await fetch('/m/' + NL.mod + '/api/nhac', { cache: 'no-store', credentials: 'same-origin' });
    /* Không vào được app (chưa cấp quyền, app đang tắt) thì im lặng — đó không
     * phải lý do để chặn màn hình người ta. */
    NL.du = r.ok ? await r.json() : null;
  } catch (_) { return; }
  veNhacLich();
}

function veNhacLich() {
  const d = NL.du;
  const cu = document.getElementById('nlPhu');
  const tb = document.getElementById('tbPhu');
  /* Không bắt buộc (quản lý tắt trong tab Thành viên) thì cho "Để sau" — nhớ
   * theo tháng trong phiên này, sang tab mới hoặc tải lại là hỏi lại. */
  const hien = d && d.can && S.view !== NL.mod && !tb && !(d.batBuoc === false && NL.deSau === d.thang);
  if (!hien) {
    if (cu) cu.remove();
    if (!tb) document.body.classList.remove('bb-chan');
    return;
  }
  const th = String(d.thang || '');
  const nhan = th.slice(5) + '/' + th.slice(0, 4);
  const el = cu || document.createElement('div');
  if (!cu) {
    el.id = 'nlPhu';
    el.className = 'bb-phu';
    document.body.appendChild(el);
  }
  document.body.classList.add('bb-chan');
  /* Ảnh Ma-Két (anh Hùng gửi 23/09/2026) đã tự nói hết lời kêu gọi — phần chữ
   * bên dưới chỉ còn đúng ba thứ ảnh không biết: tháng nào, hạn chót, và nút bấm. */
  el.innerHTML =
    '<div class="bb-hop nl-hop" role="alertdialog" aria-modal="true" aria-label="Đăng ký lịch làm việc tháng ' + esc(nhan) + '">' +
      '<img class="nl-anh" src="/nhac-lich.webp?v=1" alt="Đừng quên! Đăng ký lịch làm việc tháng sau" ' +
        'width="1254" height="1254" onerror="this.remove()">' +
      '<div class="nl-chan">' +
        '<div class="nl-chu">' +
          '<b>' + (d.nhap ? 'Bạn còn một bản nháp tháng ' + esc(nhan) + ' chưa nộp' : 'Đăng ký lịch làm việc tháng ' + esc(nhan)) + '</b>' +
          (d.dong ? '<span>Hạn chót ' + esc(lucVN(d.dong)) + '</span>' : '') +
        '</div>' +
        (d.batBuoc === false ? '<button class="btn ghost" id="nlSau">Để sau</button>' : '') +
        '<button class="btn primary nl-nut" id="nlMo">Đăng ký ngay</button>' +
      '</div>' +
    '</div>';
  const sau = document.getElementById('nlSau');
  if (sau) sau.onclick = () => { NL.deSau = d.thang; veNhacLich(); };
  document.getElementById('nlMo').onclick = () => {
    location.hash = '#/m/' + NL.mod;
    setTimeout(veNhacLich, 0);
  };
}

/* Đi chỗ khác mà chưa nộp -> hiện lại; vào đúng app -> lùi. */
window.addEventListener('hashchange', () => setTimeout(veNhacLich, 0));

/* App con vừa nộp xong thì tắt ngay, khỏi đợi nhịp nạp kế tiếp. */
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin) return;
  const d = ev.data;
  if (d && d.hub === 'llv-da-nop' && NL.du && (!NL.du.thang || d.thang === NL.du.thang)) {
    NL.du.can = false;
    veNhacLich();
    napNhacLich();
  }
});
