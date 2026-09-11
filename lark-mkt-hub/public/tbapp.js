'use strict';
/* ==========================================================================
   THÔNG BÁO CHẶN MÀN HÌNH
   ==========================================================================
   Quản lý nói một câu, người nhận buộc phải đọc mới dùng app tiếp được.

   Ba thứ làm nó khác cái toast và khác chuông thông báo có sẵn:

     1. Che TOÀN BỘ app, kể cả iframe của app con. Lớp phủ nằm trong lớp vỏ nên
        nó đè lên mọi thứ — không cần app con biết gì về chuyện này.
     2. KHÔNG có đường thoát nào ngoài nút "Tôi đã đọc": không dấu X, không
        Escape, không bấm ra ngoài. Cố ý — đây là chỗ duy nhất trong cả hệ đóng
        bằng một đường duy nhất, vì nó sinh ra để chặn.
     3. Xác nhận được GHI LẠI kèm thời điểm, nên quản lý biết ai chưa đọc.

   Một lúc chỉ hiện MỘT thông báo, gấp trước. Dồn năm cái vào một màn hình thì
   người ta cuộn qua rồi bấm cho xong, đúng cái cần tránh.
   ========================================================================== */

/* Danh sách còn phải đọc, và cái đang hiện. */
let TB = { ds: [], i: 0, daBam: false };

const tbEl = () => document.getElementById('tbPhu');

/**
 * Nạp danh sách còn phải đọc.
 *
 * Lỗi thì IM LẶNG bỏ qua: không đọc được bảng thông báo là chuyện của quản lý,
 * không phải lý do để dán một băng đỏ lên màn hình nhân sự. Trang Cài đặt của
 * quản lý có nói rõ bảng đang lỗi gì.
 */
async function napTbApp() {
  try {
    const d = await goi('/api/tb-app');
    TB.ds = d.ds || [];
    if (TB.i >= TB.ds.length) TB.i = 0;
    veTbApp();
  } catch (_) { /* im lặng */ }
}

function veTbApp() {
  const cu = tbEl();
  const tb = TB.ds[TB.i];
  if (!tb) {
    if (cu) cu.remove();
    document.body.classList.remove('bb-chan');
    return;
  }

  let el = cu;
  if (!el) {
    el = document.createElement('div');
    el.id = 'tbPhu';
    el.className = 'bb-phu';
    document.body.appendChild(el);
  }
  /* Khoá cuộn trang dưới lớp phủ: không khoá thì người ta cuộn được trang nền,
     nhìn như app vẫn dùng được, chỉ là có cái hộp chắn ngang. */
  document.body.classList.add('bb-chan');

  const conLai = TB.ds.length - 1;
  const noiDung = String(tb.noiDung || '').split('\n')
    .map((d) => (d.trim() ? '<p>' + esc(d) + '</p>' : '')).join('');

  /* Nút hành động: link ra ngoài thì mở tab mới; đường trong hub (bắt đầu bằng
     #) thì nhớ lại, xác nhận xong mới đi tới — đi ngay thì lớp phủ vẫn chắn,
     người ta tới đúng trang mà không xem được gì. */
  const trongHub = tb.lienKet && tb.lienKet.startsWith('#');
  const nut = tb.nhanNut && tb.lienKet
    ? '<button class="btn chinh bb-mo" id="tbMo">' + esc(tb.nhanNut) + '</button>'
    : '';

  const khoa = tb.buocBam && nut && !TB.daBam;

  el.innerHTML =
    '<div class="bb-hop bb-' + esc(mucTb(tb.mucDo)) + '" role="alertdialog" aria-modal="true">' +
      '<div class="bb-dau">' +
        '<span class="bb-nhan">' + esc(tb.mucDo || 'Tin') + '</span>' +
        (conLai > 0 ? '<span class="bb-dem">còn ' + conLai + ' thông báo nữa</span>' : '') +
      '</div>' +
      '<h2 class="bb-ten">' + esc(tb.tieuDe || 'Thông báo') + '</h2>' +
      '<div class="bb-noi">' + (noiDung || '<p class="bb-trong">(không có nội dung)</p>') + '</div>' +
      (nut ? '<div class="bb-viec">' + nut +
        (tb.buocBam ? '<span class="bb-ghi">' +
          (TB.daBam ? 'Đã mở — giờ xác nhận được rồi'
                    : 'Phải mở mục này trước khi xác nhận') + '</span>' : '') +
        '</div>' : '') +
      '<div class="bb-chan-hop">' +
        (tb.denNgay ? '<span class="bb-ghi">Hiển thị tới ' + esc(ngayTb(tb.denNgay)) + '</span>' : '') +
        '<span class="grow"></span>' +
        '<button class="btn primary" id="tbDoc"' + (khoa ? ' disabled' : '') + '>Tôi đã đọc</button>' +
      '</div>' +
    '</div>';

  const oMo = document.getElementById('tbMo');
  if (oMo) {
    oMo.onclick = () => {
      TB.daBam = true;
      if (trongHub) {
        /* Nhớ lại rồi đi sau khi xác nhận — xem chú thích ở trên. */
        TB.diToi = tb.lienKet;
        veTbApp();
        return;
      }
      window.open(tb.lienKet, '_blank', 'noopener');
      veTbApp();
    };
  }
  const oDoc = document.getElementById('tbDoc');
  if (oDoc) oDoc.onclick = () => xacNhanTb(tb);
}

const mucTb = (m) => (m === 'Gấp' ? 'gap' : m === 'Quan trọng' ? 'quan' : 'tin');

const ngayTb = (ms) => {
  const d = new Date(Number(ms) + 7 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
};

async function xacNhanTb(tb) {
  const nut = document.getElementById('tbDoc');
  if (nut) { nut.disabled = true; nut.textContent = 'Đang ghi…'; }
  try {
    await goi('/api/tb-app', { method: 'POST', body: JSON.stringify({ recordId: tb.recordId }) });
    TB.ds = TB.ds.filter((x) => x.recordId !== tb.recordId);
    TB.daBam = false;
    if (TB.i >= TB.ds.length) TB.i = 0;
    const di = TB.diToi;
    TB.diToi = null;
    veTbApp();
    /* Đi tới mục được chỉ SAU khi hết thông báo — còn cái nữa thì đọc cho xong
       đã, không thì vừa nhảy trang vừa bị chặn tiếp, rối. */
    if (di && !TB.ds.length) location.hash = di;
  } catch (e) {
    if (nut) { nut.disabled = false; nut.textContent = 'Tôi đã đọc'; }
    toast(e.message, 'do');
  }
}

/* Escape KHÔNG đóng được lớp phủ này. Bắt ở chế độ capture để chặn trước cái
   handler Escape chung của hub (nó đóng modal), không thì bấm Escape là thoát
   được một thứ sinh ra để không thoát được. */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && tbEl()) { e.stopPropagation(); e.preventDefault(); }
}, true);
