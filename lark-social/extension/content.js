/* Rooty · Người đăng — đọc dòng "Người đăng: …" trên Trang Facebook.
 *
 * VÌ SAO PHẢI ĐỌC MÀN HÌNH. Facebook hiện tên người đăng dưới mỗi bài nhưng
 * không phát qua API: trường admin_creator tồn tại mà luôn rỗng — đã thử 4 loại
 * mã, 6 phiên bản API, 5 edge, bài từ 2023 tới nay, kể cả mã của người thật có
 * business_management. Nhật ký hoạt động không có API. File xuất Business
 * Manager chỉ ghi thao tác quản trị. Nên đường còn lại là đọc chính thứ người
 * dùng đang nhìn.
 *
 * BA ĐIỀU TIỆN ÍCH NÀY KHÔNG LÀM, và cố ý không làm:
 *   - không tự cuộn trang, không tự bấm, không tự mở bài;
 *   - không chạy ngầm khi không có ai ngồi đó;
 *   - không tự gửi — phải bấm nút.
 * Nó là công cụ hỗ trợ thao tác của người, không phải bot. Ranh giới đó vừa giữ
 * cho tài khoản khỏi bị Facebook khoá, vừa là điều kiện để việc này còn tử tế.
 */
(() => {
  const RE_TEN = /Người\s*đăng\s*[:：]\s*([^\n·|]+)/;
  const CHON_LINK = 'a[href*="/reel/"],a[href*="/posts/"],a[href*="/videos/"],a[href*="story_fbid"]';
  const thay = new Map();          // link -> tên

  /* Leo ngược từ chỗ có chữ "Người đăng" lên tới khối bài, rồi lấy link bài
   * trong khối đó. Leo quá cao thì vớ phải bài kế bên, nên chặn ở 12 tầng. */
  function linkCuaKhoi(node) {
    let el = node.parentElement;
    for (let i = 0; el && i < 12; i++, el = el.parentElement) {
      const a = el.querySelector(CHON_LINK);
      if (a && a.href) return a.href.split('?')[0];
    }
    return '';
  }

  function quet() {
    const di = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = di.nextNode())) {
      const m = RE_TEN.exec(n.data || '');
      if (!m) continue;
      const ten = m[1].replace(/\s+/g, ' ').trim();
      if (!ten || ten.length > 60) continue;
      const link = linkCuaKhoi(n);
      if (link) thay.set(link, ten);
    }
    ve();
  }

  /* --- bảng nhỏ ở góc --- */
  let hop;
  function ve() {
    if (!hop) {
      hop = document.createElement('div');
      hop.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;'
        + 'background:#1c1e21;color:#e4e6eb;font:13px/1.5 system-ui,sans-serif;'
        + 'border:1px solid #3e4042;border-radius:10px;padding:10px 12px;min-width:210px;'
        + 'box-shadow:0 6px 20px rgba(0,0,0,.35)';
      document.body.appendChild(hop);
    }
    const n = thay.size;
    hop.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Rooty · Người đăng</div>'
      + '<div id="rt-so">Đã thấy <b>' + n + '</b> bài trên màn hình</div>'
      + '<div style="margin-top:8px;display:flex;gap:6px">'
      + '<button id="rt-quet" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid #555;'
      + 'background:#3a3b3c;color:#e4e6eb;cursor:pointer">Quét lại</button>'
      + '<button id="rt-gui" style="flex:1;padding:5px 8px;border-radius:6px;border:0;'
      + 'background:#2374e1;color:#fff;cursor:pointer"' + (n ? '' : ' disabled') + '>Gửi</button>'
      + '</div><div id="rt-bao" style="margin-top:6px;color:#b0b3b8"></div>';
    hop.querySelector('#rt-quet').onclick = quet;
    hop.querySelector('#rt-gui').onclick = gui;
  }

  function gui() {
    const bao = hop.querySelector('#rt-bao');
    const items = [...thay.entries()].map(([link, nguoi]) => ({ link, nguoi }));
    if (!items.length) return;
    bao.textContent = 'Đang gửi…';
    chrome.runtime.sendMessage({ viec: 'gui', items }, (r) => {
      if (!r || !r.ok) { bao.textContent = 'Lỗi: ' + ((r && r.loi) || 'không rõ'); return; }
      const k = r.kq || {};
      /* Nói cả phần KHÔNG ghi được. Giấu đi thì người dùng tưởng xong hết, mà
       * KPI thì thiếu người. */
      bao.innerHTML = 'Đã ghi <b>' + (k.daGhi || 0) + '</b>/' + (k.nhan || 0) + ' bài'
        + (k.khongKhop ? '<br>' + k.khongKhop + ' bài chưa có trong Base' : '')
        + (k.tenLa && k.tenLa.length ? '<br>tên lạ: ' + k.tenLa.join(', ') : '');
      thay.clear();
    });
  }

  /* Quét một lần khi trang đã đứng yên. Không theo dõi liên tục: Facebook dựng
   * lại DOM suốt, nghe hết thì vừa tốn máy vừa giống bot. Cuộn thêm thì bấm
   * "Quét lại". */
  setTimeout(quet, 1500);
})();
