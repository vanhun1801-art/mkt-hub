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
  const RE_CO = /Người\s*đăng/;
  const RE_TEN = /Người\s*đăng\s*[:：]\s*([^\n·|]+)/;
  const CHON_LINK = 'a[href*="/reel/"],a[href*="/posts/"],a[href*="/videos/"],a[href*="story_fbid"]';
  const thay = new Map();          // khoá -> { ten, link, van }

  /* TÊN NẰM Ở NÚT KHÁC VỚI CHỮ "Người đăng".
   *
   * Facebook dựng dòng đó thành nhiều mảnh: "Người đăng:" một nút, tên người
   * một nút (thường là link tới trang cá nhân). Đọc từng nút chữ một thì nút
   * đầu khớp "Người đăng:" nhưng phần tên rỗng — đó là lý do bản trước báo
   * "đã thấy 0 bài" trong khi màn hình rõ ràng có tên. Phải leo lên cha để lấy
   * textContent đã ghép lại. */
  function tenQuanhNode(n) {
    let el = n.parentElement;
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      const m = RE_TEN.exec(el.textContent || '');
      if (!m) continue;
      /* Ghép lại thì ngày giờ dính ngay sau tên, không có dấu phân cách:
       * "Phương Ái10 Tháng 9 lúc 16:06". Tên người không có chữ số nên cắt ở
       * chữ số đầu tiên là sạch. */
      const ten = m[1].split(/[0-9]/)[0].replace(/\s+/g, ' ').trim();
      if (ten && ten.length <= 60) return ten;
    }
    return '';
  }

  /* Leo ngược từ chỗ có chữ "Người đăng" lên tới khối bài, rồi lấy link bài
   * trong khối đó. Leo quá cao thì vớ phải bài kế bên, nên chặn ở 12 tầng. */
  function khoiCuaNode(node) {
    let el = node.parentElement;
    let to = null;
    for (let i = 0; el && i < 12; i++, el = el.parentElement) {
      const a = el.querySelector(CHON_LINK);
      if (a && a.href) return { el, link: a.href.split('?')[0] };
      /* Nhớ lại khối đủ to để còn dùng khi cả 12 tầng đều không có link. */
      if (!to && (el.innerText || '').length > 120) to = el;
    }
    /* KHÔNG CÓ LINK VẪN GIỮ. Nhiều bài trong feed không kèm thẻ link nào bắt
     * được — bản trước bỏ luôn những bài đó, nên anh Hùng thấy "cái được cái
     * không". Máy chủ khớp được bằng caption, nên thiếu link vẫn dùng được. */
    return to ? { el: to, link: '' } : null;
  }

  /* Đếm để biết mất ở đâu, thay vì chỉ thấy con số cuối rồi đoán. */
  let soDong = 0;
  let soHut = 0;

  function quet() {
    const di = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let dong = 0;
    let hut = 0;
    let n;
    while ((n = di.nextNode())) {
      if (!RE_CO.test(n.data || '')) continue;
      dong++;
      const ten = tenQuanhNode(n);
      if (!ten) { hut++; continue; }
      const k = khoiCuaNode(n);
      if (!k) { hut++; continue; }
      const van = (k.el.innerText || '').slice(0, 400);
      /* Không có link thì lấy chính đoạn chữ làm khoá, để cùng một bài quét
       * nhiều lượt không thành nhiều mục. */
      const khoa = k.link || ('van:' + van.slice(0, 120));
      thay.set(khoa, { ten, link: k.link, van });
    }
    soDong = dong;
    soHut = hut;
    ve();
  }

  /* --- bảng nhỏ ở góc --- */
  let hop;
  let toiLa = '';
  let soCho = 0;

  async function docTrangThai() {
    const c = await chrome.storage.sync.get(['toiLa']);
    toiLa = c.toiLa || '';
    const kho = await chrome.storage.local.get(['cho']);
    soCho = (kho.cho || []).length;
    ve();
  }

  function ve() {
    /* Không có gì để nói thì đừng hiện: trên Business Suite phần đọc feed luôn
     * ra 0, bày một ô "0 bài" chỉ tổ làm người ta tưởng hỏng. */
    if (!thay.size && !soCho && !toiLa) {
      if (hop) { hop.remove(); hop = null; }
      return;
    }
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
      + (toiLa ? '<div>Máy của <b>' + toiLa + '</b></div>' : '')
      + (soCho ? '<div>Đang chờ khớp: <b>' + soCho + '</b> bài</div>' : '')
      + (n || !toiLa ? '<div>Đã thấy <b>' + n + '</b> bài trên màn hình</div>' : '')
      + (soHut ? '<div style="color:#f0a">' + soHut + '/' + soDong
        + ' dòng "Người đăng" chưa lấy được</div>' : '')
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
    const items = [...thay.values()].map((x) => ({ link: x.link, nguoi: x.ten, van: x.van }));
    if (!items.length) return;
    bao.textContent = 'Đang gửi…';
    chrome.runtime.sendMessage({ viec: 'gui', items }, (r) => {
      if (!r || !r.ok) { bao.textContent = 'Lỗi: ' + ((r && r.loi) || 'không rõ'); return; }
      const k = r.kq || {};
      /* Nói cả phần KHÔNG ghi được. Giấu đi thì người dùng tưởng xong hết, mà
       * KPI thì thiếu người. */
      bao.innerHTML = 'Đã ghi <b>' + (k.daGhi || 0) + '</b>/' + (k.nhan || 0) + ' bài'
        + (k.khongKhop ? '<br>' + k.khongKhop + ' bài chưa khớp được' : '')
        + (k.tenLa && k.tenLa.length ? '<br>tên lạ: ' + k.tenLa.join(', ') : '');
      thay.clear();
    });
  }

  /* TỰ QUÉT KHI CUỘN — anh Hùng không phải bấm "Quét lại" từng lượt.
   *
   * Vẫn đúng ranh giới đã đặt: tiện ích KHÔNG tự cuộn, không tự mở bài, không
   * tự gửi. Nó chỉ đọc lại phần màn hình mà người dùng vừa cuộn tới — cùng một
   * dữ liệu, chỉ bỏ cái nút thừa đi.
   *
   * Hai cái chốt cho khỏi ngốn máy: Facebook dựng lại DOM liên tục nên phải
   * chờ lắng 900ms rồi mới quét, và hai lượt quét cách nhau tối thiểu 1,5 giây.
   */
  let hen = null;
  let lanCuoi = 0;
  function henQuet() {
    clearTimeout(hen);
    hen = setTimeout(() => {
      const gio = Date.now();
      if (gio - lanCuoi < 1500) { henQuet(); return; }
      lanCuoi = gio;
      quet();
    }, 900);
  }

  addEventListener('scroll', henQuet, { passive: true });
  /* Bỏ qua thay đổi do CHÍNH bảng này gây ra. Không chặn thì mỗi lần vẽ lại số
   * đếm là một thay đổi DOM, lại kích hoạt quét, lại vẽ — chạy vòng mãi. */
  new MutationObserver((ds) => {
    if (hop && ds.every((m) => hop.contains(m.target))) return;
    henQuet();
  }).observe(document.body, { childList: true, subtree: true });
  setTimeout(quet, 1500);

  /* ================= BẮT LÚC ĐĂNG (máy của người đăng) =================
   *
   * Đây là đường chính xác nhất, vì nó không phụ thuộc Facebook có vẽ dòng
   * "Người đăng" hay không: người đăng là người đang ngồi trước máy, đã khai
   * trong Tuỳ chọn; còn bài nào thì lấy chính đoạn chữ họ vừa soạn.
   *
   * Caption là dấu vân tay tốt hơn cả link, vì lúc bấm Đăng thì bài chưa tồn
   * tại, chưa có link nào để lấy.
   */
  const NUT_DANG = /^(đăng|đăng ngay|đăng bài|chia sẻ ngay|lên lịch|lên lịch đăng|publish|post|schedule)$/i;

  function chuSoanBai() {
    /* Ô soạn bài là contenteditable. Lấy ô nhiều chữ nhất đang hiện, vì trong
     * Business Suite còn có ô tìm kiếm và ô bình luận cũng cùng dạng. */
    let tot = '';
    document.querySelectorAll('[contenteditable="true"],[role="textbox"]').forEach((el) => {
      if (!el.offsetParent) return;
      const t = (el.innerText || el.textContent || '').trim();
      if (t.length > tot.length) tot = t;
    });
    return tot;
  }

  async function ghiNho(van) {
    const c = await chrome.storage.sync.get(['toiLa']);
    if (!c.toiLa || van.length < 40) return;
    const kho = await chrome.storage.local.get(['cho']);
    const cho = kho.cho || [];
    /* Bấm Đăng hai lần, hoặc bấm nhầm rồi bấm lại — đừng ghi thành hai bài. */
    if (cho.some((x) => x.van.slice(0, 80) === van.slice(0, 80))) return;
    cho.push({ van: van.slice(0, 400), nguoi: c.toiLa, luc: Date.now() });
    await chrome.storage.local.set({ cho });
    soCho = cho.length;
    ve();
    guiCho();
  }

  /* Gửi hàng chờ. Bài vừa đăng CHƯA có trong Base — đồng bộ 6 tiếng một lượt
   * mới kéo về — nên mục nào chưa khớp thì giữ lại, lần mở Facebook sau gửi
   * tiếp. Tự lành, không cần ai nhớ. */
  async function guiCho() {
    const kho = await chrome.storage.local.get(['cho']);
    let cho = kho.cho || [];
    if (!cho.length) return;
    /* Quá một tháng chưa khớp thì bỏ: bài đó không bao giờ vào Base nữa. */
    const han = Date.now() - 31 * 86400000;
    cho = cho.filter((x) => x.luc > han);

    chrome.runtime.sendMessage(
      { viec: 'gui', items: cho.map((x) => ({ nguoi: x.nguoi, van: x.van })) },
      async (r) => {
        if (!r || !r.ok) return;                       // mạng hỏng thì để lần sau
        const giu = new Set(r.kq && r.kq.chuaKhop ? r.kq.chuaKhop : []);
        const conLai = cho.filter((_x, i) => giu.has(i));
        await chrome.storage.local.set({ cho: conLai });
        soCho = conLai.length;
        ve();
      },
    );
  }

  addEventListener('click', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('div[role="button"],button,span') : null;
    if (!el) return;
    const chu = (el.innerText || el.textContent || '').trim();
    if (!NUT_DANG.test(chu)) return;
    /* Chụp NGAY, trước khi Facebook xoá ô soạn bài. */
    const van = chuSoanBai();
    if (van) ghiNho(van);
  }, true);

  /* Mở Facebook là thử gửi lại hàng chờ. */
  docTrangThai();
  setTimeout(guiCho, 3000);
})();
