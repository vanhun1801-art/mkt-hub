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

/* Danh sách còn phải đọc, và cái đang hiện. `thu` = đang xem thử (quản lý xem
 * trước), lúc đó không ghi xác nhận và cho đóng thẳng. */
let TB = { ds: [], i: 0, daBam: false, thu: false };

const tbEl = () => document.getElementById('tbPhu');

/**
 * Nạp danh sách còn phải đọc.
 *
 * Lỗi thì IM LẶNG bỏ qua: không đọc được bảng thông báo là chuyện của quản lý,
 * không phải lý do để dán một băng đỏ lên màn hình nhân sự. Trang Cài đặt của
 * quản lý có nói rõ bảng đang lỗi gì.
 */
async function napTbApp() {
  /* Đang xem thử thì đứng yên. Nhịp tự nạp 60 giây ghi đè TB.ds bằng danh sách
   * của máy chủ, mà trên máy quản lý danh sách đó RỖNG — nên bản xem thử biến
   * mất giữa lúc đang xem, và `TB.thu` còn treo lại true. Đã đo được đúng thế. */
  if (TB.thu) return;
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
    /* Hộp nhắc đăng ký lịch nhường chỗ cho thông báo này — giờ tới lượt nó. */
    if (typeof veNhacLich === 'function') veNhacLich();
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
    .map((d) => (d.trim() ? '<p>' + noiCoLink(d) + '</p>' : '')).join('');

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
      (TB.thu && !TB.chiDoc
        ? '<div class="bb-thu">Đang <b>xem thử</b> — nhân sự sẽ thấy đúng thế này. ' +
          'Bấm gì ở đây cũng không ghi xác nhận của ai.</div>'
        : '') +
      '<div class="bb-dau">' +
        '<span class="bb-nhan">' + esc(tb.mucDo || 'Tin') + '</span>' +
        (conLai > 0 && !TB.thu ? '<span class="bb-dem">còn ' + conLai + ' thông báo nữa</span>' : '') +
      '</div>' +
      '<h2 class="bb-ten">' + esc(tb.tieuDe || 'Thông báo') + '</h2>' +
      '<div class="bb-noi">' + (noiDung || '<p class="bb-trong">(không có nội dung)</p>') + '</div>' +
      veTepTb(tb) +
      (nut ? '<div class="bb-viec">' + nut +
        (tb.buocBam ? '<span class="bb-ghi">' +
          (TB.daBam ? 'Đã mở — giờ xác nhận được rồi'
                    : 'Phải mở mục này trước khi xác nhận') + '</span>' : '') +
        '</div>' : '') +
      '<div class="bb-chan-hop">' +
        (tb.denNgay ? '<span class="bb-ghi">Hiển thị tới ' + esc(ngayTb(tb.denNgay)) + '</span>' : '') +
        '<span class="grow"></span>' +
        /* Xem thử: vẫn vẽ đúng nút đó, kèm trạng thái khoá/mở như thật, nhưng
           bấm là đóng chứ không ghi gì. Thêm một nút thoát riêng vì bản thật
           cố ý không có đường nào khác. */
        /* Chế độ ĐỌC LẠI (mở từ bảng tin): chỉ một nút Đóng. Không "Tôi đã đọc"
         * — người ta đã bị popup chặn màn hình bắt đọc một lần rồi, bắt xác
         * nhận lần nữa là phiền vô ích. */
        (TB.chiDoc
          ? '<button class="btn primary" id="tbThuDong">Đóng</button>'
          : '<button class="btn primary" id="tbDoc"' + (khoa ? ' disabled' : '') + '>Tôi đã đọc</button>' +
            (TB.thu ? '<button class="btn ghost" id="tbThuDong">Đóng xem thử</button>' : '')) +
      '</div>' +
    '</div>';

  vaAnhHong(el);

  const oMo = document.getElementById('tbMo');
  if (oMo) {
    oMo.onclick = () => {
      TB.daBam = true;
      if (trongHub) {
        /* ĐỌC LẠI thì đi NGAY. Chế độ này chỉ có nút "Đóng" — không có "Tôi đã
           đọc" để mà chờ, nên nhớ-rồi-đi-sau là chờ một nút không tồn tại: bấm
           CTA xong popup đứng yên, trông như nút hỏng. Tin tự động của app con
           LUÔN rơi vào nhánh này (nó không bao giờ chặn màn hình), nên đây là
           đường đi chính của chúng chứ không phải trường hợp hiếm. */
        if (TB.chiDoc) {
          const di = tb.lienKet;
          dongXemThu();
          location.hash = di;
          return;
        }
        /* Còn popup chặn màn hình thì nhớ lại, xác nhận xong mới đi — xem chú
           thích ở trên. */
        TB.diToi = tb.lienKet;
        veTbApp();
        return;
      }
      window.open(tb.lienKet, '_blank', 'noopener');
      veTbApp();
    };
  }
  const oDoc = document.getElementById('tbDoc');
  if (oDoc) oDoc.onclick = () => (TB.thu ? dongXemThu() : xacNhanTb(tb));
  const oThu = document.getElementById('tbThuDong');
  if (oThu) oThu.onclick = dongXemThu;
}

/**
 * Xem trước đúng thứ nhân sự sẽ thấy.
 *
 * Cần thiết vì bản thật KHÔNG xem trước được: chế độ cli trên máy quản lý cố ý
 * không có danh tính phiên nên thông báo không hiện ở đó, còn trên bản deploy
 * thì quản lý chỉ thấy thông báo gửi cho chính mình. Không có nút này thì cách
 * duy nhất để biết nó trông ra sao là gửi thật cho cả phòng.
 */
/** Mở một tin để ĐỌC LẠI: không băng xem thử, không nút xác nhận, Escape đóng. */
function xemTinTb(tb) {
  TB.chiDoc = true;
  xemThuTb(tb);
}

function xemThuTb(tb) {
  TB.thu = true;
  TB.daBam = false;
  TB.dsCu = TB.ds;
  TB.ds = [tb];
  TB.i = 0;
  veTbApp();
}

function dongXemThu() {
  TB.thu = false;
  TB.chiDoc = false;
  TB.daBam = false;
  TB.ds = TB.dsCu || [];
  TB.dsCu = null;
  TB.i = 0;
  veTbApp();
}

const mucTb = (m) => (m === 'Gấp' ? 'gap' : m === 'Quan trọng' ? 'quan' : 'tin');

const ngayTb = (ms) => {
  const d = new Date(Number(ms) + 7 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
};

/**
 * Bấm "Tôi đã đọc" là ĐÓNG NGAY, ghi vào Base chạy nền.
 *
 * Anh Hùng: "khi người ta ấn 'Tôi đã đọc' anh nghĩ em nên cho ẩn thông báo
 * liền, còn việc ghi vào base thì em chạy nền".
 *
 * Đúng: lượt ghi đó đi qua lớp vỏ rồi sang Lark Base, đo được 0,8–2,5 giây —
 * mà đây là popup CHẶN toàn màn hình. Bắt người ta nhìn "Đang ghi…" hai giây
 * rưỡi sau khi đã làm đúng việc mình được yêu cầu là phạt người ngoan.
 *
 * Ghi hỏng thì KHÔNG dựng popup lại. Dựng lại giữa lúc người ta đã đi làm việc
 * khác thì vừa giật màn hình vừa không nói được vì sao. Thay vào đó: báo một
 * dòng, và thử lại một lần sau 4 giây — gần như mọi lần hỏng ở đây là mạng chớp
 * một cái. Lần thử lại cũng hỏng thì mới nói thẳng ra, và thông báo sẽ hiện lại
 * ở lần mở app sau (Base chưa ghi nhận), đúng như bản chất sự việc.
 */
async function xacNhanTb(tb) {
  // 1. Đóng trước — không chờ gì cả.
  TB.ds = TB.ds.filter((x) => x.recordId !== tb.recordId);
  TB.daBam = false;
  if (TB.i >= TB.ds.length) TB.i = 0;
  const di = TB.diToi;
  TB.diToi = null;
  veTbApp();
  /* Đi tới mục được chỉ SAU khi hết thông báo — còn cái nữa thì đọc cho xong
     đã, không thì vừa nhảy trang vừa bị chặn tiếp, rối. */
  if (di && !TB.ds.length) location.hash = di;

  // 2. Rồi mới ghi, ở phía sau lưng.
  ghiDaDoc(tb, 1);
}

async function ghiDaDoc(tb, lan) {
  try {
    await goi('/api/tb-app', { method: 'POST', body: JSON.stringify({ recordId: tb.recordId }) });
  } catch (e) {
    if (lan < 2) return setTimeout(() => ghiDaDoc(tb, lan + 1), 4000);
    toast('Chưa ghi được "đã đọc" lên Base (' + e.message + ') — thông báo này sẽ hiện lại lần sau.', 'do');
  }
}

/**
 * Một dòng nội dung -> HTML, có link bấm được.
 *
 * Anh Hùng: "anh nghĩ nên có chức năng gắn Hyper link". Nút hành động chỉ mang
 * được MỘT đường dẫn, mà thông báo thật hay có mấy cái: quy định ở đây, biểu
 * mẫu ở kia.
 *
 * Hai dạng, đều là thứ người ta vốn gõ sẵn khi nhắn trong Lark:
 *   [Đọc quy định](https://...)  chữ hiện thay cho đường dẫn dài
 *   https://...                  dán thẳng, tự thành link
 *
 * ESCAPE TRƯỚC, GẮN LINK SAU. Làm ngược lại là mở cửa cho người soạn chèn thẻ
 * HTML vào màn hình cả phòng. Và chỉ nhận http/https: `javascript:` trong href
 * là chạy mã ngay lúc bấm, mà đây là chữ người khác gõ, không phải mã mình sinh.
 */
function noiCoLink(dong) {
  const the = (url, chu) => {
    const that = String(url).replace(/&amp;/g, '&');   // esc() đã đổi & thành &amp;
    if (!/^https?:\/\//i.test(that)) return chu;       // chặn javascript:, data:...
    return '<a href="' + esc(that) + '" target="_blank" rel="noopener noreferrer">' + chu + '</a>';
  };
  const ganGon = (u) => (u.length > 60 ? u.slice(0, 57) + '…' : u);
  return esc(dong)
    .replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, (_, chu, url) => the(url, chu))
    /* Ký tự đứng trước phải là đầu dòng, khoảng trắng hay dấu mở ngoặc — nhờ
     * vậy đường dẫn đã nằm trong href="..." của bước trên không bị bọc lần hai. */
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/gi, (_, dau, url) => dau + the(url, ganGon(url)));
}

/**
 * Tệp đính kèm trong popup.
 *
 * Ảnh hiện thẳng ra — thông báo kèm ảnh chụp màn hình mà phải bấm tải về rồi mở
 * bằng app khác thì chẳng ai xem. Tệp khác thành một nút tải về.
 *
 * Đường dẫn đi qua lớp vỏ (`/api/tb-app/tep/...`), không phải link Lark: người
 * nhận không cần quyền gì trên Base, và khoá app không ra khỏi máy chủ.
 */
function veTepTb(tb) {
  const ds = tb.tep || [];
  if (!ds.length) return '';
  const duong = (x) => '/api/tb-app/tep/' + encodeURIComponent(tb.recordId) + '/' + encodeURIComponent(x.token);
  const laAnh = (x) => /^image\//.test(x.kieu || '') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(x.ten || '');
  const laPhim = (x) => /^video\//.test(x.kieu || '') || /\.(mp4|mov|webm|m4v)$/i.test(x.ten || '');
  return '<div class="bb-tep">' + ds.map((x) => {
    if (laAnh(x)) {
      return '<a class="bb-tep-anh" href="' + duong(x) + '" target="_blank" rel="noopener"' +
        ' data-ten="' + esc(x.ten) + '"><img src="' + duong(x) + '" alt="' + esc(x.ten) + '"></a>';
    }
    /* Video phát ngay tại chỗ, tràn viền như ảnh.
     *
     * KHÔNG tự chạy: thông báo này bật lên giữa lúc người ta đang làm việc, một
     * đoạn phim tự kêu là chuyện khó chịu nhất có thể làm với người dùng. Có
     * `preload="metadata"` nên trình duyệt chỉ tải phần đầu để biết dài bao
     * nhiêu — chưa bấm thì chưa tốn mạng. */
    if (laPhim(x)) {
      return '<video class="bb-tep-phim" controls preload="metadata" playsinline ' +
        'src="' + duong(x) + '"></video>';
    }
    return '<a class="bb-tep-mot" href="' + duong(x) + '" target="_blank" rel="noopener" download>' +
      '<span class="bb-tep-ic">TỆP</span><span>' + esc(x.ten) + '</span></a>';
  }).join('') + '</div>';
}

/**
 * Ảnh tải hỏng thì đổi thành một dòng bấm-để-tải, đừng để lại khung ảnh vỡ.
 *
 * Khung vỡ là thứ tệ nhất có thể hiện ở đây: người nhận không biết mình đang
 * thiếu cái gì, người gửi tưởng đã gửi được. Một dòng "không hiện được ảnh —
 * bấm để mở" thì vừa nói ra sự thật, vừa còn một đường để lấy tệp về, và bấm
 * vào là thấy đúng câu lỗi của máy chủ.
 */
function vaAnhHong(el) {
  el.querySelectorAll('.bb-tep-anh img').forEach((img) => {
    img.onerror = async () => {
      const a = img.closest('.bb-tep-anh');
      if (!a) return;
      /* Hỏi lại chính đường dẫn đó để LẤY CÂU LỖI. Thẻ <img> không nói được vì
       * sao nó hỏng, mà "bấm để mở" thì bắt người ta đi tìm hộ mình. Máy chủ đã
       * ghi sẵn lý do của từng đường đã thử — hiện thẳng ra đây. */
      let vi = '';
      try {
        const r = await fetch(a.getAttribute('href'));
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          vi = d.error || ('HTTP ' + r.status);
        }
      } catch (e) { vi = String(e.message || e); }
      a.className = 'bb-tep-mot';
      a.innerHTML = '<span class="bb-tep-ic">TỆP</span><span>' +
        esc(a.dataset.ten || 'tệp') +
        (vi ? ' — <b style="color:var(--do)">' + esc(vi.slice(0, 220)) + '</b>'
            : ' — không hiện được ảnh, bấm để mở') + '</span>';
    };
  });
}

/* Escape KHÔNG đóng được lớp phủ này. Bắt ở chế độ capture để chặn trước cái
   handler Escape chung của hub (nó đóng modal), không thì bấm Escape là thoát
   được một thứ sinh ra để không thoát được. */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !tbEl()) return;
  e.stopPropagation();
  e.preventDefault();
  // ...trừ lúc xem thử: đó là cửa của quản lý, không phải cửa cần chặn
  if (TB.thu) dongXemThu();
}, true);
