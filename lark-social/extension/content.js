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
      const ten = RT_LOC.tachTen(el.textContent || '');
      if (ten) return ten;
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
    /* Máy người đăng thì khỏi quét feed: họ đã được ghi nhận ngay lúc bấm Đăng,
     * quét thêm chỉ tốn máy mỗi lần cuộn. */
    if (toiLa) return;
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
  let choCu = false;          // có mục treo quá một ngày chưa khớp
  let henTat = null;

  async function docTrangThai() {
    const c = await chrome.storage.sync.get(['toiLa']);
    toiLa = c.toiLa || '';
    const kho = await chrome.storage.local.get(['cho']);
    const cho = kho.cho || [];
    soCho = cho.length;
    /* Vài tiếng là chuyện thường (chờ lượt đồng bộ, chờ bài hẹn giờ lên sóng).
     * Quá một ngày mà chưa ghi được thì có gì đó hỏng, phải nói ra. */
    choCu = cho.some((x) => Date.now() - (x.luc || 0) > 86400000);
    /* Chưa khai thì có bắt được cũng không gửi đi đâu — đây là lỗi im lặng
     * kinh điển, nên phải hiện ngay chứ không đợi ai hỏi. */
    const c2 = await chrome.storage.sync.get(['diaChi', 'khoa']);
    if (toiLa && (!c2.diaChi || !c2.khoa)) loi = 'Chưa khai địa chỉ hoặc khoá — mở Tuỳ chọn của tiện ích';
    ve();
  }

  /* Báo một câu rồi tự tắt, để người đăng biết là đã ghi nhận mà không phải
   * nhìn một cái bảng nằm lì góc màn hình cả ngày. */
  function noiNhanh(chu) {
    khoe = chu;
    ve();
    clearTimeout(henTat);
    henTat = setTimeout(() => { khoe = ''; ve(); }, 5000);
  }

  /* MÁY NGƯỜI ĐĂNG THÌ IM LẶNG.
   *
   * Bắt phải bấm Gửi là sớm muộn cũng quên, mà quên thì KPI thiếu bài. Nên bài
   * vừa đăng được gửi ngay, và bảng chỉ hiện khi có chuyện cần người biết:
   *   - chưa khai địa chỉ / khoá — chưa khai thì không gửi đi đâu được;
   *   - gửi hỏng — mạng hoặc khoá sai;
   *   - có bài treo quá một ngày chưa khớp — bình thường chỉ vài tiếng là xong;
   *   - vừa bắt được một bài — báo một câu rồi tự tắt sau vài giây.
   * Máy quản lý (không khai "Tôi là") thì giữ nguyên bảng có nút, vì đó là việc
   * rà tay, cố ý để người quyết định lúc nào gửi. */
  let loi = '';
  let khoe = '';

  /* Chạy trong mọi khung để bắt được ô soạn bài nằm trong iframe, nhưng BẢNG thì
   * chỉ vẽ ở khung ngoài cùng — không thì mỗi iframe một bảng, chồng lên nhau. */
  const laKhungChinh = (() => { try { return window.top === window; } catch (_) { return false; } })();

  function ve() {
    if (!laKhungChinh) return;
    if (toiLa) {
      const treo = soCho && choCu;
      if (!loi && !khoe && !treo) {
        if (hop) { hop.remove(); hop = null; }
        return;
      }
      if (!hop) taoHop();
      hop.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Rooty · Người đăng</div>'
        + (loi ? '<div style="color:#ff8a8a">' + loi + '</div>' : '')
        + (khoe ? '<div>' + khoe + '</div>' : '')
        + (treo ? '<div style="color:#f0b45f">' + soCho + ' bài chưa ghi được sau hơn một ngày — báo anh Hùng</div>'
          + '<div style="margin-top:6px"><a href="#" id="rt-xoa" style="color:#b0b3b8;font-size:12px">xoá hàng chờ</a></div>' : '');
      nutXoa();
      return;
    }

    /* Không có gì để nói thì đừng hiện. */
    if (!thay.size && !soCho) {
      if (hop) { hop.remove(); hop = null; }
      return;
    }
    if (!hop) taoHop();
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
      + '</div>'
      + (soCho ? '<div style="margin-top:6px"><a href="#" id="rt-xoa" '
        + 'style="color:#b0b3b8;font-size:12px">xoá hàng chờ</a></div>' : '')
      + '<div id="rt-bao" style="margin-top:6px;color:#b0b3b8"></div>';
    hop.querySelector('#rt-quet').onclick = quet;
    hop.querySelector('#rt-gui').onclick = gui;
    nutXoa();
  }

  function taoHop() {
    hop = document.createElement('div');
    hop.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;'
      + 'background:#1c1e21;color:#e4e6eb;font:13px/1.5 system-ui,sans-serif;'
      + 'border:1px solid #3e4042;border-radius:10px;padding:10px 12px;min-width:210px;'
      + 'max-width:280px;box-shadow:0 6px 20px rgba(0,0,0,.35)';
    document.body.appendChild(hop);
  }

  /* Hàng chờ có lúc dính mục rác — phải có cách dọn, không thì nó treo cả tháng
   * rồi gửi lại mỗi lần mở Facebook. */
  function nutXoa() {
    const xoa = hop && hop.querySelector('#rt-xoa');
    if (!xoa) return;
    xoa.onclick = async (ev) => {
      ev.preventDefault();
      await chrome.storage.local.set({ cho: [] });
      soCho = 0;
      choCu = false;
      ve();
    };
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
  if (laKhungChinh) setTimeout(quet, 1500);

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

  /* NHỜ ĐOẠN CHỮ ĐANG SOẠN, không đợi tới lúc bấm mới đi tìm.
   *
   * Luồng hẹn giờ trong Business Suite đi nhiều bước: soạn bài → bấm Lên lịch →
   * chọn ngày giờ → xác nhận. Đến bước cuối thì ô soạn bài không còn trên màn
   * hình nữa, nên đi tìm lúc đó là tìm hụt — bài hẹn giờ 10:30 của bạn Lý Thư
   * Bạch mất trắng vì lý do này, không lại dấu vết nào trong nhật ký. */
  const DAI_TOI_THIEU = 40;

  /* KHUNG SOẠN BÀI CÓ THỂ KHÔNG PHẢI CONTENTEDITABLE, VÀ CÓ THỂ Ở KHUNG KHÁC.
   *
   * Bản trước chỉ dò contenteditable và role=textbox, nên gõ vào một <textarea>
   * thường là không thấy gì. Và Business Suite dựng khung soạn bài trong iframe,
   * nên kể có dò đúng kiểu thì script ở trang ngoài cũng không với tới — đúng
   * triệu chứng: bắt được cú bấm nhưng không moi được chữ nào.
   *
   * Giờ chạy trong MỌI khung (all_frames), và bản nháp cất vào kho chung thay vì
   * biến cục bộ: khung có ô soạn bài ghi vào, khung có nút Đăng đọc ra. */
  let vanCuoi = '';
  let henNhap = null;

  function nhoNhap(v) {
    vanCuoi = v;
    clearTimeout(henNhap);
    henNhap = setTimeout(() => {
      try { chrome.storage.local.set({ nhap: { van: v.slice(0, 400), luc: Date.now() } }); }
      catch (_) { /* kho hỏng thì vẫn còn biến cục bộ */ }
    }, 800);
  }

  addEventListener('input', (e) => {
    const t = e.target;
    if (!t) return;
    const laO = t.isContentEditable || t.tagName === 'TEXTAREA'
      || (t.getAttribute && t.getAttribute('role') === 'textbox');
    if (!laO) return;
    const v = (t.value || t.innerText || t.textContent || '').trim();
    if (v.length >= DAI_TOI_THIEU) nhoNhap(v);
  }, true);

  function chuSoanBai() {
    /* Lấy ô nhiều chữ nhất đang hiện, vì Business Suite còn có ô tìm kiếm và ô
     * bình luận cũng cùng dạng. */
    let tot = '';
    document.querySelectorAll(
      '[contenteditable="true"],[role="textbox"],textarea',
    ).forEach((el) => {
      if (!el.offsetParent) return;
      const t = (el.value || el.innerText || el.textContent || '').trim();
      if (t.length > tot.length) tot = t;
    });
    return tot;
  }

  /* Bản nháp một khung khác vừa ghi. Quá nửa tiếng thì bỏ: đó là bài cũ, xài lại
   * là gán nhầm nội dung cho bài mới. */
  function nhapTuKho() {
    return new Promise((xong) => {
      try {
        chrome.storage.local.get(['nhap'], (c) => {
          const n = c && c.nhap;
          xong(n && Date.now() - (n.luc || 0) < 1800000 ? (n.van || '') : '');
        });
      } catch (_) { xong(''); }
    });
  }

  async function ghiNho(van) {
    const c = await chrome.storage.sync.get(['toiLa']);
    if (!c.toiLa || van.length < 40) return;
    const kho = await chrome.storage.local.get(['cho']);
    const cho = kho.cho || [];

    /* MỘT BÀI ĐĂNG ra BỐN MỤC — lỗi thật, lần đầu chạy trên máy bạn Lý Thư
     * Bạch. Luồng hẹn giờ trong Business Suite bấm nhiều bước (Đăng → Lên lịch →
     * xác nhận), mỗi bước chụp được một đoạn chữ hơi khác nhau, nên so 80 ký tự đầu
     * là trượt.
     *
     * Giờ so theo BAO HÀM: đoạn này nằm trong đoạn kia, hoặc ngược lại, thì là cùng
     * một bài. Bản dài hơn được giữ vì khớp caption cần càng nhiều chữ càng chắc. */
    const moi = RT_LOC.dauVan(van);
    for (let i = 0; i < cho.length; i++) {
      const cu2 = RT_LOC.dauVan(cho[i].van);
      if (RT_LOC.trungNhau(van, cho[i].van)) {
        if (moi.length > cu2.length) {
          cho[i] = { ...cho[i], van: van.slice(0, 400) };
          await chrome.storage.local.set({ cho });
        }
        return;
      }
    }
    cho.push({ van: van.slice(0, 400), nguoi: c.toiLa, luc: Date.now() });
    await chrome.storage.local.set({ cho });
    soCho = cho.length;
    noiNhanh('Đã ghi nhận bài của <b>' + c.toiLa + '</b>');
    guiCho();
  }

  /* Gửi hàng chờ. Bài vừa đăng CHƯA có trong Base — đồng bộ 6 tiếng một lượt
   * mới kéo về — nên mục nào chưa khớp thì giữ lại, lần mở Facebook sau gửi
   * tiếp. Tự lành, không cần ai nhớ. */
  async function guiCho() {
    const kho = await chrome.storage.local.get(['cho']);
    let cho = kho.cho || [];
    if (!cho.length) return;
    /* Quá một tháng chưa khớp thì bỏ: bài đó không bao giờ vào Base nữa. Ghi
     * xuống luôn, không đợi lượt gửi thành công — không thì mục quá hạn nằm lại
     * mãi và lần nào cũng được lọc ra rồi bỏ đi, tốn một lượt gọi vô ích. */
    const han = Date.now() - 31 * 86400000;
    const truoc = cho.length;
    cho = cho.filter((x) => x.luc > han);
    if (cho.length !== truoc) await chrome.storage.local.set({ cho });
    if (!cho.length) { soCho = 0; ve(); return; }

    chrome.runtime.sendMessage(
      { viec: 'gui', items: cho.map((x) => ({ nguoi: x.nguoi, van: x.van })) },
      async (r) => {
        if (!r || !r.ok) {
          /* Mạng chập thì im, để lần sau. Sai khoá hoặc chưa khai thì phải nói
           * — cái đó không tự khỏi, và im lặng là mất bài. */
          const m = String((r && r.loi) || '');
          if (/kho|khoá|401|Chưa khai/i.test(m)) { loi = 'Không gửi được: ' + m; ve(); }
          return;
        }
        loi = '';
        const giu = new Set(r.kq && r.kq.chuaKhop ? r.kq.chuaKhop : []);
        const conLai = cho.filter((_x, i) => giu.has(i));
        await chrome.storage.local.set({ cho: conLai });
        soCho = conLai.length;
        choCu = conLai.some((x) => Date.now() - (x.luc || 0) > 86400000);
        ve();
      },
    );
  }

  addEventListener('click', async (e) => {
    const el = e.target && e.target.closest ? e.target.closest('div[role="button"],button,span') : null;
    if (!el) return;
    const chu = (el.innerText || el.textContent || '').trim();
    if (!NUT_DANG.test(chu)) return;
    /* BỎ ĐIỀU KIỆN PHẢI NẰM TRONG DIALOG.
     *
     * Siết như vậy là quá tay: Công cụ lập kế hoạch của Business Suite soạn bài
     * trên cả trang, không phải trong hộp thoại, nên cú bấm Lên lịch bị bỏ qua.
     * Chốt thật nằm ở đoạn chữ: không có bài đang soạn thì không ghi gì. */
    const van = chuSoanBai() || vanCuoi || await nhapTuKho();
    if (van) {
      ghiNho(van);
      vanCuoi = '';   // bài sau phải tự gõ lại, không xài lại chữ của bài trước
      try { chrome.storage.local.remove(['nhap']); } catch (_) { /* thôi */ }
    } else if (toiLa) {
      /* Bấm Đăng mà không moi được chữ nào thì phải nói. Im lặng bỏ qua là cách
       * bài hẹn giờ 10:30 biến mất mà không ai hay — một tháng sau chấm KPI mới
       * phát hiện thiếu. */
      noiNhanh('<span style="color:#f0b45f">Bấm Đăng nhưng không đọc được nội dung — báo anh Hùng</span>');
    }
  }, true);

  /* Mở Facebook là thử gửi lại hàng chờ. */
  docTrangThai();
  setTimeout(guiCho, 3000);
  /* Thử lại mỗi năm phút khi tab còn mở: bài hẹn giờ lên sóng lúc nào không
   * biết, đợi người ta đóng mở Facebook thì có khi vài ngày sau mới ghi được. */
  if (laKhungChinh) setInterval(guiCho, 5 * 60 * 1000);
})();
