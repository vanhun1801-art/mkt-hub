/* Giao diện app Social. Thuần DOM, không framework — cùng lối với bốn app kia
   của phòng, để ai sửa được app này thì sửa được cả bốn. */
(function () {
  'use strict';

  /* ---------------- tiện ích ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('vi-VN');
  const n1 = (v) => (Number(v) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  const pct = (v) => (Number(v) || 0).toLocaleString('vi-VN',
    { style: 'percent', maximumFractionDigits: 1 });
  const gon = (v) => (window.Charts ? Charts.shortNum(v) : n0(v));

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const LOP = {
    Facebook: 'fb', TikTok: 'tt', Instagram: 'ig', 'Zalo OA': 'za', 'Zalo Video': 'zv',
    Douyin: 'dy', Xiaohongshu: 'xhs',
  };
  const lop = (p) => LOP[p] || '';

  function toast(msg, loai) {
    const el = document.createElement('div');
    el.className = 'toast ' + (loai || 'ok');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), loai === 'err' ? 9000 : 4000);
  }

  async function goi(url, opts) {
    const r = await fetch(url, opts);
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch (_) {}
    if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
    return j;
  }
  const goiJSON = (url, body, method) => goi(url, {
    method: method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

  function moModal(html) {
    $('#modal').innerHTML = html;
    $('#modalWrap').hidden = false;
  }
  const dongModal = () => { $('#modalWrap').hidden = true; $('#modal').innerHTML = ''; };
  $('#modalWrap').addEventListener('click', (e) => { if (e.target.id === 'modalWrap') dongModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dongModal(); });

  /* ---------------- trạng thái ---------------- */
  const S = {
    tab: 'tong-quan',
    from: '', to: '',
    platforms: [],
    du: null,          // dữ liệu tổng quan
    kenh: [],
    me: null,
    quanLy: false,
    phamVi: null,      // { soKenh, tongKenh } khi người xem chỉ được giao vài kênh
    dangTai: false,
  };

  const homNay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  function themNgay(k, d) {
    const [y, m, dd] = k.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
  }

  /* ---------------- thanh lọc ----------------
   *
   * Chạy dưới Marketing Hub thì bộ lọc thời gian phải DÙNG CHUNG với bốn app kia:
   * một nơi đổi, mọi nơi theo. Lớp vỏ lo phần này qua hai hàm mà module tự khai
   * (xem shim trong lark-mkt-hub/proxy.js):
   *
   *   window.hubApKhoang(tu, den)  — lớp vỏ gửi khoảng xuống
   *   window.hubBaoKhoang(tu, den) — module báo lên khi NGƯỜI DÙNG tự đổi
   *
   * Và danh sách mốc lấy từ loc.js của lớp vỏ, không tự bịa bộ riêng: quản lý
   * thấy Tháng này / Tháng trước / Tuần này…, nhân sự thấy bộ hẹp quanh hôm nay.
   * Bấm "Tuần trước" trong app này mà thanh lọc của hub vẫn ghi "Tuỳ chỉnh" thì
   * rất khó đọc — nên phải báo ngược lên.
   *
   * Chạy một mình (mở thẳng cổng 5178) thì giữ bộ mốc riêng, vẫn dùng được.
   */
  const duoiHub = () => Boolean(window.HUB_LOC && window.__HUB__);

  /** [{ k, ten, tu, den }] — mốc của lớp vỏ khi có, bộ riêng khi chạy một mình. */
  function mocLoc() {
    if (duoiHub()) {
      return window.HUB_LOC.danhSachTheoVai(window.__HUB__.quanLy)
        .map((x) => ({ k: x.tu + '|' + x.den, ten: x.ten, tu: x.tu, den: x.den }));
    }
    const den = homNay();
    return [
      { ten: '7 ngày', tu: themNgay(den, -6), den },
      { ten: '30 ngày', tu: themNgay(den, -29), den },
      { ten: '90 ngày', tu: themNgay(den, -89), den },
      { ten: 'Tháng này', tu: den.slice(0, 8) + '01', den },
    ].map((x) => ({ ...x, k: x.tu + '|' + x.den }));
  }

  function veSeg() {
    const ds = mocLoc();
    const dang = S.from + '|' + S.to;
    $('#rangeSeg').innerHTML = ds.map((m) =>
      '<button data-k="' + esc(m.k) + '"' + (m.k === dang ? ' class="on"' : '') + '>'
      + esc(m.ten) + '</button>').join('');
    /* Nhân sự không có khoảng tuỳ chọn — giống ba app kia, để mọi người nhìn cùng
     * một bộ mốc thay vì mỗi app một kiểu. */
    if (duoiHub() && window.__HUB__.quanLy === false) {
      ['#fFrom', '#fTo'].forEach((sel) => {
        const g = $(sel) && $(sel).closest('.fgroup');
        if (g) g.hidden = true;
      });
    }
  }

  function dungBoLoc() {
    $('#rangeSeg').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const [tu, den] = b.dataset.k.split('|');
      S.from = tu; S.to = den;
      veSeg();
      dongBoInput();
      baoHub();
      tai();
    };

    const doiTay = () => {
      S.from = $('#fFrom').value;
      S.to = $('#fTo').value;
      if (!S.from || !S.to) return;
      veSeg();
      baoHub();
      tai();
    };
    $('#fFrom').onchange = doiTay;
    $('#fTo').onchange = doiTay;
    $('#btnClearFilter').onclick = () => { S.platforms = []; veLocNenTang(); tai(); };

    /* Lớp vỏ gửi khoảng xuống. '' nghĩa là "toàn bộ" — app này luôn cần một
     * khoảng cụ thể (biểu đồ theo ngày), nên lùi về 30 ngày gần nhất. */
    window.hubApKhoang = function (tu, den) {
      const t = den || homNay();
      S.to = t;
      S.from = tu || themNgay(t, -29);
      veSeg();
      dongBoInput();
      tai();
    };
  }

  /** Báo khoảng đang lọc lên lớp vỏ để bốn app kia đi theo. */
  function baoHub() {
    if (typeof window.hubBaoKhoang === 'function') {
      try { window.hubBaoKhoang(S.from, S.to); } catch (_) { /* chạy một mình */ }
    }
  }

  function dongBoInput() {
    $('#fFrom').value = S.from;
    $('#fTo').value = S.to;
  }

  function veLocNenTang() {
    const co = [...new Set((S.kenh || []).map((k) => k.platform).filter(Boolean))];
    const ds = co.length ? co : ['TikTok', 'Facebook', 'Instagram', 'Zalo OA'];
    $('#fPlatform').innerHTML = ds.map((p) =>
      '<button class="pill ' + lop(p) + (S.platforms.includes(p) ? ' on' : '')
      + '" data-p="' + esc(p) + '">' + esc(p) + '</button>').join('');
    $('#fPlatform').onclick = (e) => {
      const b = e.target.closest('.pill');
      if (!b) return;
      const p = b.dataset.p;
      S.platforms = S.platforms.includes(p) ? S.platforms.filter((x) => x !== p) : S.platforms.concat(p);
      veLocNenTang();
      tai();
    };
  }

  /* ---------------- tabs ---------------- */
  let ndTheo = 'xem';
  const TEN_THU = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

  /* Cột thứ ba: chỉ quản lý mới thấy.
   *
   * Trước đây bày đủ chín tab cho mọi người, mà ba tab trong đó máy chủ chặn —
   * nhân sự bấm vào chỉ nhận một dòng báo lỗi. Bày ra rồi chặn là vừa khó chịu,
   * vừa nói cho người ta biết có những màn hình họ không được xem. */
  const TABS = [
    ['tong-quan', 'Tổng quan'],
    ['kenh', 'Theo kênh'],
    ['bai', 'Bài đăng'],
    ['noi-dung', 'Nội dung'],
    ['binh-luan', 'Khách hỏi'],
    ['nhan', 'Nhãn & đối tác'],
    ['live', 'LIVE'],
    ['nhap-tay', 'Nhập tay', true],
    ['nhat-ky', 'Nhật ký'],
  ];

  const tabDuocXem = () => TABS.filter(([, , chiQuanLy]) => !chiQuanLy || S.quanLy);

  function dungTabs() {
    /* Đang ở một tab không được xem (bấm từ trước, hoặc vừa bị hạ quyền) thì
     * đưa về Tổng quan, chứ không để trắng màn hình. */
    const duoc = tabDuocXem();
    if (!duoc.some(([id]) => id === S.tab)) S.tab = 'tong-quan';
    $('#tabs').innerHTML = duoc.map(([id, t]) =>
      '<button class="tab' + (S.tab === id ? ' on' : '') + '" data-tab="' + id + '">'
      + t + '</button>').join('');
    $('#tabs').onclick = (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      S.tab = b.dataset.tab;
      dungTabs();
      ve();
    };
  }

  /* ---------------- tải dữ liệu ---------------- */
  function truyVan() {
    const q = new URLSearchParams({ from: S.from, to: S.to });
    if (S.platforms.length) q.set('platform', S.platforms.join(','));
    return q.toString();
  }

  async function tai() {
    if (S.dangTai) return;
    S.dangTai = true;
    try {
      const [du, kn] = await Promise.all([
        goi('/api/tong-quan?' + truyVan()),
        goi('/api/kenh'),
      ]);
      S.du = du;
      S.kenh = kn.kenh || [];
      $('#brandSub').textContent = S.kenh.length + ' kênh · ' + n0(du.soBai) + ' bài · '
        + 'cập nhật ' + new Date(du.capNhat).toLocaleString('vi-VN');
      if (!$('#fPlatform').children.length) veLocNenTang();
      ve();
    } catch (e) {
      $('#view').innerHTML = '<div class="empty">Không nạp được dữ liệu: ' + esc(e.message) + '</div>';
    } finally {
      S.dangTai = false;
    }
  }

  /* ---------------- các mảnh dùng lại ---------------- */
  function theKpi(label, value, doi, chan) {
    const d = Number(doi);
    const huong = !isFinite(d) || Math.abs(d) < 0.005 ? 'flat' : (d > 0 ? 'up' : 'down');
    const mui = huong === 'up' ? '▲' : (huong === 'down' ? '▼' : '·');
    return '<div class="kpi">'
      + '<div class="k-label">' + esc(label) + '</div>'
      + '<div class="k-value">' + value + '</div>'
      + '<div class="k-foot">'
      + (doi == null ? '<span>' + esc(chan || '') + '</span>'
        : '<span class="trend ' + huong + '">' + mui + ' ' + pct(Math.abs(d)) + '</span>'
          + '<span>' + esc(chan || 'so kỳ trước') + '</span>')
      + '</div></div>';
  }

  function bangGon(cot, rows, tong) {
    const th = cot.map((c) => '<th class="' + (c.num ? 'num' : 'no-sort') + '">' + esc(c.t) + '</th>').join('');
    const tr = rows.map((r) => '<tr>' + cot.map((c) =>
      '<td class="' + (c.num ? 'num' : (c.name ? 'name' : '')) + '">' + c.v(r) + '</td>').join('') + '</tr>').join('');
    const tf = tong ? '<tfoot><tr>' + cot.map((c, i) =>
      '<td class="' + (c.num ? 'num' : '') + '">' + (i === 0 ? 'Tổng' : (c.num && c.k ? n0(tong[c.k]) : '')) + '</td>').join('')
      + '</tr></tfoot>' : '';
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + th + '</tr></thead><tbody>'
      + (rows.length ? tr : '<tr><td colspan="' + cot.length + '"><div class="empty">Chưa có số liệu trong khoảng này</div></td></tr>')
      + '</tbody>' + tf + '</table></div>';
  }

  const theTag = (p) => '<span class="tag ' + lop(p) + '">' + esc(p) + '</span>';

  /* ---------------- tab: tổng quan ---------------- */
  /* Nhớ người này thích mở hay gấp dải lưu ý. Chỉ là tiện nghi cá nhân nên để
   * trong máy họ; đọc hay ghi hỏng thì cứ coi như đang gấp, không làm vỡ trang. */
  const moLuuY = () => {
    try { return localStorage.getItem('social.luuY') === 'mo'; } catch (_) { return false; }
  };
  const nhoLuuY = (mo) => {
    try { localStorage.setItem('social.luuY', mo ? 'mo' : 'gap'); } catch (_) { /* bỏ qua */ }
  };

  function veTongQuan() {
    const d = S.du;
    const t = d.tong;
    const html = ''
      + veChiBaoPhamVi()
      + '<div class="kpis">'
      + theKpi('Lượt xem', gon(t.views), d.doi.views)
      + theKpi('Lượt tiếp cận', gon(t.reach), d.doi.reach,
        (d.nenCoReach || []).length ? 'chỉ ' + d.nenCoReach.join(', ') + ' có tiếp cận' : '')
      + theKpi('Follower hiện có', gon(t.followers), d.doi.followers,
        t.soKenhThieuFollower
          ? 'chưa gồm ' + t.soKenhThieuFollower + ' kênh chưa có mốc trước ' + d.den
          : 'chốt gần nhất tính đến ' + d.den)
      + theKpi('Follower tăng ròng', (t.followNet >= 0 ? '+' : '') + n0(t.followNet), d.doi.followNet)
      + theKpi('Tương tác', gon(t.engagement), d.doi.engagement)
      + theKpi('Tỷ lệ tương tác', pct(t.tyLeTuongTac), d.doi.tyLeTuongTac)
      + '</div>'

      /* Đặt ngay dưới hàng số, trên biểu đồ — chứ không nhét vào nhật ký đồng bộ.
       * Người đọc biểu đồ không mở nhật ký. */
      /* GẬP LẠI, nhưng không giấu.
       *
       * Bốn dải này giải thích vì sao vài cột trống hay vì sao con số đọc khác với
       * người ta tưởng — cần, nhưng không cần mỗi lần mở màn hình đều đập vào mắt.
       * Để bật sẵn thì người ta quen mắt rồi thôi không đọc nữa, lúc cần lại bỏ qua.
       * Gấp vào một dòng, nhớ lựa chọn của từng người trong máy họ. */
      + ((d.luuY || []).length
        ? '<details class="notes-box"' + (moLuuY() ? ' open' : '') + ' id="luuYHop">'
          + '<summary><span class="ico">!</span>' + d.luuY.length
          + ' lưu ý về cách đọc số</summary>'
          + '<div class="notes">'
          + d.luuY.map((x) => '<div class="note"><span class="ico">!</span><span>'
            + esc(x) + '</span></div>').join('')
          + '</div></details>'
        : '')

      + '<div class="grid g-2-1" style="margin-top:14px">'
      + '<div class="card"><div class="card-head"><h3>Lượt xem &amp; tiếp cận theo ngày</h3>'
      + '<span class="sub">' + esc(d.tu) + ' → ' + esc(d.den) + '</span></div>'
      + '<div class="card-body"><div class="chart" id="chNgay"></div></div></div>'
      + '<div class="card"><div class="card-head"><h3>Tỷ trọng lượt xem</h3></div>'
      + '<div class="card-body" style="display:grid;place-items:center"><div id="chDonut"></div></div></div>'
      + '</div>'

      + '<div class="grid g2" style="margin-top:14px">'
      + '<div class="card"><div class="card-head"><h3>Theo nền tảng</h3></div><div class="card-body tight">'
      + bangGon([
        { t: 'Nền tảng', v: (r) => theTag(r.platform) },
        { t: 'Lượt xem', num: 1, k: 'views', v: (r) => n0(r.views) },
        { t: 'Xem tự nhiên', num: 1, k: 'viewsOrganic',
          v: (r) => (r.viewsOrganic ? n0(r.viewsOrganic) : '—') },
        { t: 'Giờ xem', num: 1, k: 'watchTime',
          v: (r) => (r.watchTime ? n0(Math.round(r.watchTime / 3600)) : '—') },
        { t: 'Xem tự nhiên', num: 1, k: 'viewsOrganic',
          v: (r) => (r.viewsOrganic ? n0(r.viewsOrganic) : '—') },
        { t: 'Tiếp cận', num: 1, k: 'reach', v: (r) => n0(r.reach) },
        { t: 'Tương tác', num: 1, k: 'engagement', v: (r) => n0(r.engagement) },
        { t: 'Follower', num: 1, v: (r) => n0(r.followers) },
        { t: 'Bài', num: 1, k: 'posts', v: (r) => n0(r.posts) },
      ], d.nenTang, t)
      + '</div></div>'
      + '<div class="card"><div class="card-head"><h3>Bài xem nhiều nhất</h3></div><div class="card-body tight">'
      + bangGon([
        { t: 'Bài', name: 1, v: (r) => (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noreferrer">' : '<span>')
          + esc((r.title || '(không tiêu đề)').slice(0, 70)) + (r.url ? '</a>' : '</span>')
          + '<span class="sub-line">' + esc(r.channel || '') + ' · ' + esc(r.date || '') + '</span>' },
        { t: 'Xem', num: 1, v: (r) => n0(r.views) },
        { t: 'Tương tác', num: 1, v: (r) => n0(r.engagement) },
      ], d.topBai.slice(0, 10))
      + '</div></div>'
      + '</div>';

    $('#view').innerHTML = html;
    const hopLuuY = $('#luuYHop');
    if (hopLuuY) hopLuuY.ontoggle = () => nhoLuuY(hopLuuY.open);
    if (window.Charts) {
      Charts.lines($('#chNgay'), d.ngay, [
        { key: 'views', color: '#2b5cff', label: 'Lượt xem' },
        { key: 'reach', color: '#12a150', label: 'Tiếp cận' },
      ], { height: 260 });
      Charts.donut($('#chDonut'), d.nenTang.map((x) => ({ label: x.platform, value: x.views })),
        { centerLabel: 'Lượt xem' });
    }
  }

  /* ---------------- tab: theo kênh ---------------- */
  function veKenh() {
    const d = S.du;
    $('#view').innerHTML = veChiBaoPhamVi()
      + '<div class="card"><div class="card-head"><h3>Số liệu theo kênh</h3>'
      + '<span class="sub">' + esc(d.tu) + ' → ' + esc(d.den) + '</span>'
      + (S.quanLy ? '<button class="btn small" id="pqMo" style="margin-left:auto">'
        + 'Phân quyền xem kênh</button>' : '')
      + '</div>'
      + '<div class="card-body tight">'
      + bangGon([
        { t: 'Kênh', name: 1, v: (r) => (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noreferrer">' : '<span>')
          + esc(r.name) + (r.url ? '</a>' : '</span>')
          + '<span class="sub-line">' + esc(r.platform) + '</span>' },
        { t: 'Follower', num: 1, v: (r) => n0(r.followers) },
        { t: 'Tăng ròng', num: 1, v: (r) => (r.followNet >= 0 ? '+' : '') + n0(r.followNet) },
        { t: 'Lượt xem', num: 1, k: 'views', v: (r) => n0(r.views) },
        { t: 'Hiển thị', num: 1, k: 'impressions', v: (r) => n0(r.impressions) },
        { t: 'Tiếp cận', num: 1, k: 'reach', v: (r) => n0(r.reach) },
        { t: 'Tương tác', num: 1, k: 'engagement', v: (r) => n0(r.engagement) },
        { t: 'Tỷ lệ TT', num: 1, v: (r) => pct(r.tyLeTuongTac) },
        { t: 'Bài', num: 1, k: 'posts', v: (r) => n0(r.posts) },
        { t: 'Xem/bài', num: 1, v: (r) => n0(r.xemMoiBai) },
        { t: 'LIVE', num: 1, k: 'lives', v: (r) => n0(r.lives) },
      ], d.kenh, d.tong)
      + '</div></div>'
      + '<div class="card" style="margin-top:14px"><div class="card-head"><h3>Lượt xem theo kênh</h3></div>'
      + '<div class="card-body"><div id="chKenh"></div></div></div>';

    const nutPq = $('#pqMo');
    if (nutPq) nutPq.onclick = () => moPhanQuyen().catch((e) => toast(e.message, 'err'));

    if (window.Charts) {
      Charts.hbars($('#chKenh'), d.kenh.slice(0, 15).map((k) => ({
        label: k.name, value: k.views, color: Charts.colorFor(k.platform, 0),
      })), { fmt: gon });
    }
  }

  /* ---------------- tab: bài đăng ---------------- */
  let baiTheo = 'views';
  async function veBai() {
    $('#view').innerHTML = window.KX ? KX.man('', { dau: false, the: 4, dong: 8 })
      : '<div class="loading">Đang nạp bài đăng…</div>';
    const q = new URLSearchParams({ from: S.from, to: S.to, theo: baiTheo, n: 100 });
    if (S.platforms.length) q.set('platform', S.platforms.join(','));
    const r = await goi('/api/bai?' + q);
    $('#view').innerHTML = ''
      + ((r.theoNguoi && r.theoNguoi.length > 1)
        ? '<div class="card" style="margin-bottom:12px"><div class="card-head">'
          + '<h3>Theo người đăng</h3>'
          + '<span class="muted" style="margin-left:auto;font-size:12.5px">'
          + 'tính trên toàn bộ bài trong kỳ</span></div><div class="card-body tight">'
          + bangGon([
            { t: 'Người đăng', name: 1, v: (x) => (x.nguoi === '(chưa rõ)'
              ? '<span class="muted">' + esc(x.nguoi) + '</span>' : esc(x.nguoi)) },
            { t: 'Bài', num: 1, v: (x) => n0(x.soBai) },
            { t: 'Lượt xem', num: 1, v: (x) => n0(x.views) },
            { t: 'Tiếp cận', num: 1, v: (x) => (x.reach ? n0(x.reach) : '—') },
            { t: 'Tương tác', num: 1, v: (x) => n0(x.engagement) },
            { t: 'Xem/bài', num: 1, v: (x) => n0(x.soBai ? x.views / x.soBai : 0) },
          ], r.theoNguoi)
          + '</div></div>'
        : '')
      + '<div class="card"><div class="card-head">'
      + '<h3>Bài đăng</h3>'
      + '<div class="seg" id="segTheo">'
      + [['views', 'Lượt xem'], ['engagement', 'Tương tác'], ['comments', 'Bình luận'],
        ['fullWatchRate', 'Xem hết']].map(([k, t]) =>
        '<button data-k="' + k + '"' + (baiTheo === k ? ' class="on"' : '') + '>' + t + '</button>').join('')
      + '</div></div><div class="card-body tight">'
      + bangGon([
        { t: 'Bài', name: 1, v: (x) => (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noreferrer">' : '<span>')
          + esc((x.title || '(không tiêu đề)').slice(0, 90)) + (x.url ? '</a>' : '</span>')
          + '<span class="sub-line">' + esc(x.channel || '') + ' · ' + esc(x.date || '') + '</span>' },
        { t: 'Nền tảng', v: (x) => theTag(x.platform) },
        { t: 'Loại', v: (x) => esc(x.type || '') },
        { t: 'Xem', num: 1, v: (x) => n0(x.views) },
        { t: 'Tiếp cận', num: 1, v: (x) => n0(x.reach) },
        { t: 'Thích', num: 1, v: (x) => n0(x.likes) },
        { t: 'B.luận', num: 1, v: (x) => n0(x.comments) },
        { t: 'Chia sẻ', num: 1, v: (x) => n0(x.shares) },
        { t: 'Tỷ lệ TT', num: 1, v: (x) => pct(x.engRate || (x.reach || x.views ? x.engagement / (x.reach || x.views) : 0)) },
        { t: 'Xem hết', num: 1, v: (x) => (x.fullWatchRate ? pct(x.fullWatchRate) : '—') },
        { t: 'Xem TB', num: 1, v: (x) => (x.avgWatch ? n1(x.avgWatch) + 's' : '—') },
      ], r.bai)
      + '</div></div>';
    $('#segTheo').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      baiTheo = b.dataset.k;
      veBai();
    };
  }

  /* ---------------- tab: LIVE ---------------- */
  async function veLive() {
    $('#view').innerHTML = window.KX ? KX.man('', { dau: false, the: 3, dong: 5 })
      : '<div class="loading">Đang nạp phiên LIVE…</div>';
    const r = await goi('/api/live?' + truyVan());
    const ds = r.live || [];
    $('#view').innerHTML = ''
      + '<div class="notes" style="margin-bottom:14px">'
      + '<div class="note"><span class="ico">!</span><span>'
      + '<b>TikTok và Instagram không mở API cho LIVE.</b> Số của Facebook LIVE tự về; '
      + 'còn TikTok/Instagram phải nhập tay hoặc dán bảng xuất từ LIVE Center — nút '
      + '<b>Dán bảng LIVE</b> bên dưới nhận cả CSV lẫn bảng copy từ Excel.'
      + '</span></div></div>'
      + '<div class="card"><div class="card-head"><h3>Phiên LIVE</h3>'
      + '<div style="display:flex;gap:8px">'
      + '<button class="btn ghost small" id="btnLiveTay">Thêm một phiên</button>'
      + '<button class="btn ghost small" id="btnLiveDan">Dán bảng LIVE</button>'
      + '</div></div><div class="card-body tight">'
      + bangGon([
        { t: 'Phiên', name: 1, v: (x) => esc(x.title || '(không tiêu đề)')
          + '<span class="sub-line">' + esc(x.channel || '') + ' · ' + esc(x.date || '') + '</span>' },
        { t: 'Nền tảng', v: (x) => theTag(x.platform) },
        { t: 'Phút', num: 1, v: (x) => n0(x.minutes) },
        { t: 'Lượt xem', num: 1, v: (x) => n0(x.views) },
        { t: 'Đỉnh', num: 1, v: (x) => n0(x.peak) },
        { t: 'B.luận', num: 1, v: (x) => n0(x.comments) },
        { t: 'Follow mới', num: 1, v: (x) => n0(x.newFollows) },
        { t: 'Nguồn', v: (x) => '<span class="tag">' + esc(x.source || '') + '</span>' },
      ], ds)
      + '</div></div>';
    $('#btnLiveTay').onclick = moLiveTay;
    $('#btnLiveDan').onclick = moLiveDan;
  }

  function chonKenhHtml(id) {
    return '<select id="' + id + '">'
      + S.kenh.map((k) => '<option value="' + esc(k.extId || k.id) + '">'
        + esc(k.name) + ' (' + esc(k.platform) + ')</option>').join('')
      + '</select>';
  }

  function moLiveTay() {
    moModal('<div class="modal-head"><h3>Thêm một phiên LIVE</h3></div>'
      + '<div class="modal-body"><div class="nhap-grid">'
      + '<div style="grid-column:span 2"><label>Kênh</label>' + chonKenhHtml('lvKenh') + '</div>'
      + '<div style="grid-column:span 2"><label>Tiêu đề</label><input id="lvTitle" placeholder="LIVE bán tour đảo"></div>'
      + '<div><label>Bắt đầu</label><input type="datetime-local" id="lvStart"></div>'
      + '<div><label>Kết thúc</label><input type="datetime-local" id="lvEnd"></div>'
      + '<div><label>Lượt xem</label><input type="number" id="lvViews"></div>'
      + '<div><label>Người xem đỉnh</label><input type="number" id="lvPeak"></div>'
      + '<div><label>Bình luận</label><input type="number" id="lvComments"></div>'
      + '<div><label>Thích</label><input type="number" id="lvLikes"></div>'
      + '<div><label>Chia sẻ</label><input type="number" id="lvShares"></div>'
      + '<div><label>Follow mới</label><input type="number" id="lvFollows"></div>'
      + '</div></div>'
      + '<div class="modal-foot"><button class="btn ghost" id="mHuy">Đóng</button>'
      + '<button class="btn primary" id="mLuu">Lưu vào Base</button></div>');
    $('#mHuy').onclick = dongModal;
    $('#mLuu').onclick = async () => {
      try {
        await goiJSON('/api/live/nhap-tay', {
          extId: $('#lvKenh').value,
          title: $('#lvTitle').value,
          start: $('#lvStart').value ? $('#lvStart').value + ':00' : '',
          end: $('#lvEnd').value ? $('#lvEnd').value + ':00' : '',
          views: $('#lvViews').value, peak: $('#lvPeak').value,
          comments: $('#lvComments').value, likes: $('#lvLikes').value,
          shares: $('#lvShares').value, newFollows: $('#lvFollows').value,
        });
        dongModal(); toast('Đã ghi phiên LIVE vào Base'); veLive();
      } catch (e) { toast(e.message, 'err'); }
    };
  }

  function moLiveDan() {
    moModal('<div class="modal-head"><h3>Dán bảng LIVE</h3></div>'
      + '<div class="modal-body"><div class="notes" style="margin-bottom:12px">'
      + '<div class="note info"><span class="ico">i</span><span>'
      + 'Mở TikTok LIVE Center → xuất báo cáo → bôi đen cả bảng (kể cả dòng tiêu đề) → dán vào đây. '
      + 'App đọc cột theo TÊN ở dòng đầu chứ không theo thứ tự, nên xuất bản nào cũng nhận. '
      + 'Tên cột hiểu được: Thời gian bắt đầu · Thời gian kết thúc · Thời lượng · Lượt xem · '
      + 'Người xem cao nhất · Bình luận · Thích · Chia sẻ · Người theo dõi mới · Tiêu đề.'
      + '</span></div></div>'
      + '<div class="kn-form"><div class="kn-row"><label>Kênh</label>' + chonKenhHtml('dnKenh') + '</div>'
      + '<textarea id="dnText" placeholder="Dán bảng vào đây…"></textarea></div></div>'
      + '<div class="modal-foot"><button class="btn ghost" id="mHuy">Đóng</button>'
      + '<button class="btn primary" id="mLuu">Đọc và ghi</button></div>');
    $('#mHuy').onclick = dongModal;
    $('#mLuu').onclick = async () => {
      try {
        const r = await goiJSON('/api/live/dan-bang', {
          extId: $('#dnKenh').value, text: $('#dnText').value,
        });
        dongModal();
        toast('Đọc ' + r.doc + ' dòng, ghi được ' + r.ghi
          + (r.hong.length ? ' · ' + r.hong.length + ' dòng lỗi' : ''),
        r.hong.length ? 'err' : 'ok');
        veLive();
      } catch (e) { toast(e.message, 'err'); }
    };
  }

  /* ---------------- tab: nhập tay ---------------- */
  const O_NHAP = [
    ['followers', 'Follower cuối ngày'], ['followUp', 'Follower tăng'], ['followDown', 'Follower giảm'],
    ['views', 'Lượt xem'], ['viewsOrganic', 'Lượt xem tự nhiên'],
    ['watchTime', 'Thời gian xem video (giây)'],
    ['reach', 'Lượt tiếp cận'], ['impressions', 'Lượt hiển thị'],
    ['profileViews', 'Lượt xem hồ sơ'], ['likes', 'Thích'], ['comments', 'Bình luận'],
    ['shares', 'Chia sẻ'], ['saves', 'Lưu'], ['clicks', 'Click liên kết'],
    ['messages', 'Tin nhắn'], ['leads', 'Lead'], ['posts', 'Số bài đăng'],
  ];

  function veNhapTay() {
    $('#view').innerHTML = ''
      + '<div class="notes" style="margin-bottom:14px">'
      + '<div class="note info"><span class="ico">i</span><span>'
      + 'Màn hình này dành cho những gì API không cho: <b>Douyin</b>, <b>Xiaohongshu</b>, '
      + 'lượt xem bài <b>Zalo OA</b> (tuỳ gói dịch vụ), và mọi chỉ số <b>LIVE của TikTok/Instagram</b>. '
      + 'Số nhập tay ghi vào đúng bảng với số API, cột <b>Nguồn</b> ghi rõ "Nhập tay" để sau này '
      + 'phân biệt được cái nào máy lấy, cái nào người gõ.'
      + '</span></div></div>'
      + '<div class="card"><div class="card-head"><h3>Nhập số liệu một ngày</h3></div>'
      + '<div class="card-body">'
      + '<div class="nhap-grid" style="margin-bottom:12px">'
      + '<div style="grid-column:span 2"><label>Kênh</label>' + chonKenhHtml('ntKenh') + '</div>'
      + '<div><label>Ngày</label><input type="date" id="ntNgay" value="' + homNay() + '"></div>'
      + '</div>'
      + '<div class="nhap-grid">'
      + O_NHAP.map(([k, t]) => '<div><label>' + esc(t) + '</label>'
        + '<input type="number" data-k="' + k + '" class="nt"></div>').join('')
      + '</div>'
      + '<div style="margin-top:14px;display:flex;gap:8px">'
      + '<button class="btn primary" id="ntLuu">Ghi vào Base</button>'
      + '<span class="help">Ô để trống thì không đụng tới giá trị đang có trên Base.</span>'
      + '</div></div></div>'
      + '<div class="card" style="margin-top:14px"><div class="card-head"><h3>Kênh đang có</h3>'
      + '<button class="btn ghost small" id="ntThemKenh">Thêm kênh</button></div>'
      + '<div class="card-body tight">'
      + bangGon([
        { t: 'Kênh', name: 1, v: (k) => esc(k.name) },
        { t: 'Nền tảng', v: (k) => theTag(k.platform) },
        { t: 'ID kênh', v: (k) => '<span class="mono">' + esc(k.extId || '—') + '</span>' },
        { t: 'Nguồn', v: (k) => '<span class="tag">' + esc(k.source || '—') + '</span>' },
        { t: 'Trạng thái', v: (k) => esc(k.status || '') },
      ], S.kenh)
      + '</div></div>';

    $('#ntLuu').onclick = async () => {
      const ban = { extId: $('#ntKenh').value, date: $('#ntNgay').value };
      $$('.nt').forEach((i) => { if (i.value !== '') ban[i.dataset.k] = i.value; });
      try {
        const r = await goiJSON('/api/nhap-tay', ban);
        toast('Đã ghi ' + r.kenh + ' · ' + r.ngay);
        $$('.nt').forEach((i) => { i.value = ''; });
        S.du = null; tai();
      } catch (e) { toast(e.message, 'err'); }
    };
    $('#ntThemKenh').onclick = moThemKenh;
  }

  function moThemKenh() {
    /* Zalo Video không có API mở — số phải nhập tay hoặc dán từ file
     * "Xuất dữ liệu thống kê" của Creator Center, nên nó nằm ở đây chứ không ở
     * khối kết nối. */
    const ds = ['TikTok', 'Facebook', 'Instagram', 'Zalo OA', 'Zalo Video',
      'Douyin', 'Xiaohongshu', 'YouTube'];
    moModal('<div class="modal-head"><h3>Thêm kênh</h3></div>'
      + '<div class="modal-body"><div class="kn-form">'
      + '<div class="kn-row"><label>Tên kênh</label><input id="kName" placeholder="Cuộc sống tại Phú Quốc"></div>'
      + '<div class="kn-row"><label>Nền tảng</label><select id="kPlat">'
      + ds.map((p) => '<option>' + p + '</option>').join('') + '</select></div>'
      + '<div class="kn-row"><label>ID kênh</label><input id="kExt" placeholder="ID nền tảng, hoặc tự đặt nếu nhập tay"></div>'
      + '<div class="kn-row"><label>Handle</label><input id="kHandle" placeholder="@rootytrip"></div>'
      + '<div class="kn-row"><label>Link kênh</label><input id="kUrl" placeholder="https://…"></div>'
      + '</div></div>'
      + '<div class="modal-foot"><button class="btn ghost" id="mHuy">Đóng</button>'
      + '<button class="btn primary" id="mLuu">Tạo kênh</button></div>');
    $('#mHuy').onclick = dongModal;
    $('#mLuu').onclick = async () => {
      const ten = $('#kName').value.trim();
      if (!ten) return toast('Chưa có tên kênh', 'err');
      try {
        await goiJSON('/api/kenh', {
          name: ten, platform: $('#kPlat').value,
          extId: $('#kExt').value.trim() || ('tay-' + ten.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
          handle: $('#kHandle').value.trim(), url: $('#kUrl').value.trim(),
          source: 'Nhập tay',
        });
        dongModal(); toast('Đã tạo kênh'); tai();
      } catch (e) { toast(e.message, 'err'); }
    };
  }

  /* ---------------- tab: nhật ký ---------------- */
  async function veNhatKy() {
    $('#view').innerHTML = window.KX ? KX.man('', { dau: false, the: 0, dong: 8 })
      : '<div class="loading">Đang nạp…</div>';

    /* Hai màn hình trong một tab.
     *
     * Nhân sự cần biết "ai vừa đăng gì" — việc của người. Quản lý cần thêm
     * "máy kéo được bao nhiêu dòng, lỗi gì" — việc của máy. Gộp một tab nhưng
     * nhân sự chỉ nhận phần đầu, và phần đầu lấy từ bảng Bài đăng nên tự bó
     * theo kênh của họ, không lòi caption của kênh họ không được xem. */
    const hd = await goi('/api/hoat-dong?' + new URLSearchParams({
      from: S.from, to: S.to, n: 120,
      ...(S.platforms.length ? { platform: S.platforms.join(',') } : {}),
      ...(S.channels.length ? { channel: S.channels.join(',') } : {}),
    }));

    let html = '<div class="card"><div class="card-head"><h3>Đã đăng gì</h3>'
      + '<span class="sub">' + (hd.hoatDong || []).length + ' bài gần nhất trong kỳ</span>'
      + '</div><div class="card-body tight">'
      + bangGon([
        { t: 'Lúc đăng', v: (x) => esc(String(x.publishedAt || x.date).replace('T', ' ').slice(0, 16)) },
        { t: 'Người đăng', v: (x) => (x.poster
          ? '<span class="tag good">' + esc(x.poster) + '</span>'
          : '<span class="muted">—</span>') },
        { t: 'Kênh', v: (x) => esc(x.channel || '') + '<span class="sub-line">' + esc(x.platform || '') + '</span>' },
        { t: 'Bài', name: 1, v: (x) => (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noreferrer">' : '<span>')
          + esc((x.title || '(không tiêu đề)').slice(0, 80)) + (x.url ? '</a>' : '</span>') },
        { t: 'Lượt xem', num: 1, v: (x) => n0(x.views) },
        { t: 'Tương tác', num: 1, v: (x) => n0(x.engagement) },
      ], hd.hoatDong)
      + '</div></div>';

    if (S.quanLy) {
      const r = await goi('/api/nhat-ky');
      html += '<div class="card" style="margin-top:14px"><div class="card-head">'
        + '<h3>Nhật ký đồng bộ</h3>'
        + '<span class="sub">100 lượt gần nhất · chỉ quản lý</span></div><div class="card-body tight">'
        + bangGon([
          { t: 'Lúc', v: (x) => esc(String(x.at).replace('T', ' ').slice(0, 19)) },
          { t: 'Nền tảng', v: (x) => esc(x.platform || '') },
          { t: 'Kỳ', v: (x) => esc(x.from + ' → ' + x.to) },
          { t: 'Kết quả', v: (x) => '<span class="tag ' + (x.result === 'Thành công' ? 'good'
            : (x.result === 'Lỗi' ? 'bad' : 'warn')) + '">' + esc(x.result) + '</span>' },
          { t: 'Ngày', num: 1, v: (x) => n0(x.rowsDaily) },
          { t: 'Bài', num: 1, v: (x) => n0(x.rowsPost) },
          { t: 'LIVE', num: 1, v: (x) => n0(x.rowsLive) },
          { t: 'Giây', num: 1, v: (x) => n0(x.seconds) },
          { t: 'Ghi chú', name: 1, v: (x) => esc((x.message || '').slice(0, 300)) },
        ], r.nhatKy)
        + '</div></div>';
    }

    $('#view').innerHTML = html;
  }

  /* ---------------- đồng bộ ---------------- */
  let hen = null;
  async function moDongBo() {
    moModal('<div class="modal-head"><h3>Đồng bộ từ API các nền tảng</h3></div>'
      + '<div class="modal-body">'
      + '<div class="kn-form"><div class="kn-row"><label>Từ ngày</label>'
      + '<input type="date" id="dbFrom" value="' + esc(themNgay(homNay(), -6)) + '"></div>'
      + '<div class="kn-row"><label>Đến ngày</label>'
      + '<input type="date" id="dbTo" value="' + esc(homNay()) + '"></div>'
      + '<div class="kn-row"><label>Chỉ một nền tảng</label><select id="dbChi">'
      + '<option value="">Tất cả</option><option>Facebook</option><option>Instagram</option>'
      + '<option>TikTok</option><option>Zalo OA</option></select></div></div>'
      + '<div class="kn-row"><label>Nạp lại từ đầu</label>'
      + '<label class="help" style="display:flex;gap:6px;align-items:flex-start">'
      + '<input type="checkbox" id="dbNapLai" style="margin-top:2px">'
      + '<span>Bỏ mốc cũ, coi mọi bài như lần đầu thấy và rải lượt xem về <b>ngày đăng</b>. '
      + '<b>Xoá và dựng lại</b> các dòng ngày do máy ghi trong khoảng đã chọn — dòng nhập tay '
      + 'và dòng LIVE giữ nguyên. Dùng khi vừa nối thêm kênh hoặc lịch sử đang sai; '
      + 'đừng bật cho lần chạy hằng ngày.</span></label></div>'
      + '<div id="dbTT" class="help" style="margin-top:12px">Chưa chạy.</div>'
      + '<div class="log-box" id="dbLog" style="margin-top:6px">—</div>'
      + '</div>'
      + '<div class="modal-foot"><button class="btn ghost" id="mHuy">Đóng</button>'
      + '<button class="btn ghost" id="mThu">Thử kết nối</button>'
      + '<button class="btn primary" id="mChay">Chạy đồng bộ</button></div>');
    $('#mHuy').onclick = () => { clearInterval(hen); hen = null; dongModal(); };
    $('#mThu').onclick = async () => {
      $('#dbLog').textContent = 'Đang thử…';
      try {
        const r = await goiJSON('/api/ket-noi/thu', { chi: $('#dbChi').value });
        $('#dbLog').textContent = Object.entries(r).map(([k, v]) => {
          if (!v.ok) return k + ': ✗ ' + (v.message || 'không nối được');
          const ds = (v.results || []).map((x) => '    · ' + (x.name || x.account)
            + (x.followers != null ? '  ' + n0(x.followers) + ' follower' : '')
            + (x.ok ? '' : '  ✗ ' + (x.message || ''))).join('\n');
          return k + ': ✓' + (ds ? '\n' + ds : '');
        }).join('\n');
      } catch (e) { $('#dbLog').textContent = 'Lỗi: ' + e.message; }
    };
    $('#mChay').onclick = async () => {
      $('#mChay').disabled = true;
      $('#dbLog').textContent = 'Đang khởi động…';
      $('#dbTT').textContent = 'Đang chạy — 0 giây';

      /* Nhịp tim.
         Một lượt "Nạp lại từ đầu" cả năm chạy hơn 10 phút, và có những đoạn dài
         không sinh dòng log nào — kéo hết bài của một kênh, hoặc ghi hàng trăm
         dòng lên Base. Không có đồng hồ chạy thì màn hình trông y hệt đã treo,
         và người dùng bấm lại hoặc đóng tab giữa chừng. */
      let nhip = 0;
      hen = setInterval(async () => {
        try {
          const t = await goi('/api/dong-bo/trang-thai');
          $('#dbLog').textContent = (t.log || []).join('\n') || 'Đang khởi động…';
          $('#dbLog').scrollTop = $('#dbLog').scrollHeight;
          nhip = (nhip + 1) % 4;
          const ph = Math.floor(t.giay / 60);
          const gio = (ph ? ph + ' phút ' : '') + (t.giay % 60) + ' giây';
          $('#dbTT').innerHTML = t.dangChay
            ? '<b>Đang chạy</b> — ' + gio + '.'.repeat(nhip)
              + ' · ' + (t.log || []).length + ' dòng nhật ký'
              + '<br><span style="opacity:.75">Nạp lại cả năm mất khoảng 10 phút. '
              + 'Có lúc log đứng yên vài phút vì đang ghi hàng trăm dòng lên Base — '
              + 'đồng hồ còn chạy là còn sống.</span>'
            : 'Đã dừng.';
        } catch (_) {
          $('#dbTT').textContent = 'Mất liên lạc với máy chủ — việc vẫn có thể đang chạy.';
        }
      }, 1500);
      try {
        const r = await goiJSON('/api/dong-bo', {
          from: $('#dbFrom').value, to: $('#dbTo').value, chi: $('#dbChi').value,
          napLai: $('#dbNapLai').checked,
        });
        toast('Đồng bộ xong sau ' + r.giay + 's — ' + r.soDongNgay + ' dòng ngày, '
          + r.soBai + ' bài, ' + r.soLive + ' LIVE',
        r.canhBao.length ? 'err' : 'ok');
        if (r.canhBao.length) {
          $('#dbLog').textContent += '\n\n--- Cảnh báo ---\n' + r.canhBao.join('\n');
        }
        tai();
      } catch (e) {
        toast(e.message, 'err');
        $('#dbLog').textContent += '\nLỖI: ' + e.message;
      } finally {
        clearInterval(hen); hen = null;
        $('#mChay').disabled = false;
        const el = $('#dbTT');
        if (el) el.textContent = 'Đã xong.';
      }
    };
  }

  /* ---------------- kết nối ---------------- */
  async function moKetNoi() {
    moModal('<div class="modal-head"><h3>Kết nối nền tảng</h3></div>'
      + '<div class="modal-body">'
      + (window.KX ? KX.dong(4) : '<div class="loading">Đang đọc cấu hình…</div>')
      + '</div>');
    let d;
    try { d = await goi('/api/ket-noi'); } catch (e) {
      $('#modal .modal-body').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      return;
    }
    const c = d.cauHinh;
    /* Giữ lại bản kênh do máy chủ trả về: danh sách "đã nối" chỉ hiện tên chứ
       không có ô để gõ, nên lúc lưu phải lấy lại các trường từ đây. */
    S.ttKenh = (c.tiktok && c.tiktok.channels) || [];
    const kho = d.kho || {};

    const html = ''
      + (kho.canhBao ? '<div class="notes" style="margin-bottom:12px"><div class="note">'
        + '<span class="ico">!</span><span>' + esc(kho.canhBao) + '</span></div></div>' : '')
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
      + '<button class="btn ghost small" id="khoThu">Kiểm tra kho khoá</button>'
      + '<span class="help" id="khoKq">'
      + (kho.bat ? 'Kho đang bật · ' + (kho.ngan || []).length + ' ngăn. Bấm để thử ghi–đọc thật.'
        : 'Kho đang tắt — token chỉ nằm trên đĩa.')
      + '</span></div>'
      + '<div class="notes" style="margin-bottom:12px"><div class="note info"><span class="ico">i</span>'
      + '<span>Cấu hình đang lấy từ <b>' + esc(d.nguon === 'file' ? 'ket-noi.json trên máy'
        : (d.nguon === 'env' ? 'biến môi trường SOCIAL_CONNECT_JSON' : 'chưa có gì')) + '</b>. '
      + 'Token hiện ra dạng che; để nguyên ô che nghĩa là không đổi.</span></div></div>'

      /* --- Facebook + Instagram --- */
      + '<div class="kn-block"><header><strong>Facebook Page + Instagram</strong>'
      + '<label><input type="checkbox" id="fbOn"' + (c.facebook.enabled ? ' checked' : '')
      + '> bật</label></header><div class="body">'
      + '<div class="kn-row"><label>Token gốc</label>'
      + '<input id="fbToken" value="' + esc(c.facebook.userToken || '') + '" '
      + 'placeholder="System User token (không hết hạn) — quyền pages_read_engagement, pages_show_list, read_insights"></div>'
      + '<div class="kn-row"><label>Phiên bản API</label>'
      + '<input id="fbVer" value="' + esc(c.facebook.apiVersion || 'v23.0') + '"></div>'
      + '<div><button class="btn ghost small" id="fbLietKe">Liệt kê Page từ token</button>'
      + ' <span class="help">Chọn trang xong app tự lấy page token và tự cắm Instagram gắn với trang đó.</span></div>'
      + '<div class="kn-row"><label>Thử mã đọc người đăng</label>'
      + '<input id="fbThuNd" placeholder="Dán mã sinh từ tài khoản Facebook của người thật — chỉ để thử, KHÔNG lưu"></div>'
      + '<div><button class="btn ghost small" id="fbThuNdBtn">Thử xem có đọc được người đăng không</button>'
      + ' <span class="help">Facebook hiện "Người đăng: …" dưới tên Trang, nhưng mã Người dùng hệ thống '
      + 'không đọc được — Meta chỉ trả trường đó cho mã sinh từ một CON NGƯỜI có vai trò trên Trang. '
      + 'Mã dán ở đây chỉ sống trong một lời gọi rồi mất: không ghi ra đĩa, không vào kho.</span></div>'
      + '<div id="fbThuNdKq"></div>'
      + '<div class="acc-list" id="fbPages">'
      + (c.facebook.pages || []).map((p) => '<div class="acc"><span class="grow">'
        + esc(p.name || p.id) + '<span class="muted"> · ' + esc(p.id) + '</span></span></div>').join('')
      + '</div>'
      + ((c.instagram.accounts || []).length
        ? '<div class="help">Instagram đang nối: ' + (c.instagram.accounts || [])
          .map((a) => esc('@' + (a.username || a.id))).join(', ') + '</div>' : '')
      + '</div></div>'

      /* --- TikTok --- */
      + '<div class="kn-block"><header><strong>TikTok (nhiều kênh)</strong>'
      + '<label><input type="checkbox" id="ttOn"' + (c.tiktok.enabled ? ' checked' : '')
      + '> bật</label></header><div class="body">'
      + '<div class="kn-row"><label>Client key</label>'
      + '<input id="ttKey" value="' + esc(c.tiktok.clientKey || '') + '"></div>'
      + '<div class="kn-row"><label>Client secret</label>'
      + '<input id="ttSecret" value="' + esc(c.tiktok.clientSecret || '') + '"></div>'
      + '<div class="kn-row"><label>Địa chỉ chuyển hướng</label>'
      + '<input id="ttRedirect" value="' + esc(c.tiktok.redirectUri || (location.origin + '/tiktok-callback'))
      + '" placeholder="https://…"></div>'
      + '<div class="help">Phải khai <b>y hệt</b> chuỗi này trong phần Redirect URI của app trên '
      + 'developers.tiktok.com — lệch một dấu gạch chéo là TikTok từ chối. Trang đó không cần tồn tại: '
      + 'chỉ cần đọc <code>?code=…</code> trên thanh địa chỉ sau khi cấp quyền.</div>'
      /* Hai phần TÁCH HẲN nhau. Bản trước xếp lẫn "kênh đã nối" với "ô khai tay"
         thành một danh sách, nên nhìn vào không biết phải gõ vào ô hay bấm nút —
         mà mỗi kênh TikTok phải làm lại một lượt nên chỗ rối này lặp sáu lần. */
      + '<div style="margin-top:4px"><b style="font-size:12.5px">Kênh đã nối ('
      + (c.tiktok.channels || []).length + ')</b></div>'
      + '<div class="acc-list" id="ttList">'
      + ((c.tiktok.channels || []).length
        ? (c.tiktok.channels || []).map(theKenhTikTok).join('')
        : '<div class="help">Chưa có kênh nào. Làm ba bước bên dưới.</div>')
      + '</div>'

      + '<div style="margin-top:10px;padding-top:12px;border-top:1px dashed var(--line)">'
      + '<b style="font-size:12.5px">Thêm một kênh</b>'
      + '<div class="help" style="margin-bottom:8px">Mỗi kênh TikTok là một tài khoản riêng nên '
      + 'phải làm lại ba bước cho từng kênh — không có đường tắt kiểu một token thấy hết như Facebook.</div>'
      + '<div class="kn-row"><label>Chế độ</label><select id="ttModeMoi">'
      + '<option value="display">display — dùng cái này</option>'
      + '<option value="business">business — chỉ khi TikTok đã bật Business Account API</option>'
      + '</select></div>'
      + '<div class="help">Chưa được TikTok bật sản phẩm <b>Business Account API</b> mà chọn '
      + 'business thì lúc kéo số sẽ báo lỗi. Cứ để <b>display</b>; sau này được duyệt thì đổi ô '
      + 'này, không phải cấp quyền lại.</div>'
      + '<div style="margin:8px 0"><button class="btn ghost small" id="ttLink">1 · Tạo link cấp quyền</button></div>'
      + '<div id="ttLinkBox"></div>'
      + '<div class="kn-row"><label>2 · Dán URL trả về</label>'
      + '<input id="ttCode" placeholder="dán nguyên cả thanh địa chỉ sau khi bấm đồng ý"></div>'
      + '<div style="margin-top:8px"><button class="btn primary small" id="ttDoi">3 · Đổi mã lấy token</button></div>'
      + '</div>'

      + '<details style="margin-top:12px"><summary class="help" style="cursor:pointer">'
      + 'Khai tay (hiếm khi cần — chỉ khi đã có sẵn refresh token, hoặc phải điền business_id)'
      + '</summary><div class="acc-list" id="ttTay" style="margin-top:8px"></div>'
      + '<button class="btn ghost small" id="ttThem" style="margin-top:6px">Thêm dòng</button></details>'
      + '</div></div>'

      /* --- Zalo --- */
      + '<div class="kn-block"><header><strong>Zalo OA</strong>'
      + '<label><input type="checkbox" id="zaOn"' + (c.zalo.enabled ? ' checked' : '')
      + '> bật</label></header><div class="body">'
      + '<div class="kn-row"><label>App ID</label>'
      + '<input id="zaApp" value="' + esc(c.zalo.appId || '') + '"></div>'
      + '<div class="kn-row"><label>Secret key</label>'
      + '<input id="zaSecret" value="' + esc(c.zalo.secretKey || '') + '"></div>'
      + '<div class="kn-row"><label>Địa chỉ chuyển hướng</label>'
      + '<input id="zaRedirect" value="' + esc(c.zalo.redirectUri || (location.origin + '/zalo-callback'))
      + '"><span class="help">Phải trùng từng ký tự với ô Redirect URI khai trong ứng dụng ở '
      + 'developers.zalo.me. Trang đó không cần tồn tại — chỉ cần Zalo chịu chuyển về, rồi '
      + 'chép mã trên thanh địa chỉ.</span></div>'
      + '<div style="margin:8px 0"><button class="btn ghost small" id="zaLink">1 · Tạo link cấp quyền</button></div>'
      + '<div id="zaLinkBox"></div>'
      + '<div class="kn-row"><label>2 · Mã uỷ quyền</label>'
      + '<input id="zaCode" placeholder="dán giá trị code=... trên thanh địa chỉ sau khi bấm Cho phép"></div>'
      + '<div><button class="btn ghost small" id="zaDoi">3 · Đổi mã lấy token</button>'
      + ' <span class="help">Token Zalo sống 1 giờ; app tự làm mới và cất bản mới vào kho khoá.</span></div>'
      + '<div class="acc-list">'
      + (c.zalo.oas || []).map((o) => '<div class="acc"><span class="grow">'
        + esc(o.name || o.oaId) + '<span class="muted"> · ' + esc(o.oaId) + '</span></span></div>').join('')
      + '</div></div></div>'

      /* --- cảnh báo --- */
      + '<div class="kn-block"><header><strong>Cảnh báo vào nhóm Lark</strong>'
      + '<label><input type="checkbox" id="cbOn"' + (c.canhBao.bat ? ' checked' : '')
      + '> bật</label></header><div class="body">'
      + '<div class="help" style="margin-bottom:8px">App tự nhắn vào nhóm khi một kênh '
      + 'ngừng đăng, khi lượt xem tụt hẳn, hoặc khi một nền tảng ngừng về số. '
      + 'Mỗi việc chỉ nhắc lại sau 7 ngày, nên nhóm không bị dội tin.</div>'
      + '<div class="kn-row"><label>Nhóm nhận</label>'
      + '<input id="cbChat" placeholder="oc_…" value="' + esc(c.canhBao.chatId || '') + '">'
      + '<span class="help">Mở nhóm trên Lark → Cài đặt → sao chép Chat ID. '
      + 'Nhớ mời bot <b>Marketing Hub</b> vào nhóm, không thì Lark từ chối.</span></div>'
      + '<div class="kn-row"><label>Im mấy ngày thì báo</label>'
      + '<input type="number" id="cbIm" min="2" max="30" value="' + (c.canhBao.ngayImLang || 5) + '"></div>'
      + '<div class="kn-row"><label>Tụt bao nhiêu % thì báo</label>'
      + '<input type="number" id="cbTut" min="10" max="90" value="' + (c.canhBao.tutPhanTram || 35) + '"></div>'
      + '<div style="margin-top:8px">'
      + '<button class="btn ghost small" id="cbXem">Xem thử — không gửi</button> '
      + '<button class="btn ghost small" id="cbGui">Gửi thử vào nhóm</button></div>'
      + '<div id="cbHop" style="margin-top:8px"></div>'
      + '</div></div>'

      /* --- lịch --- */
      + '<div class="kn-block"><header><strong>Chạy tự động</strong></header><div class="body">'
      + '<div class="kn-row"><label>Mỗi mấy giờ</label>'
      + '<input type="number" id="dbGio" value="' + (c.dongBo.moiSoGio || 0) + '" min="0" max="24"></div>'
      + '<div class="kn-row"><label>Quét lại mấy ngày</label>'
      + '<input type="number" id="dbLui" value="' + (c.dongBo.soNgayLui || 30) + '" min="1" max="90"></div>'
      + '<div class="help">Lượt xem của một bài còn chạy tiếp hàng tháng sau khi đăng, '
      + 'nên quét lại quá ngắn là số cũ đứng yên: một bài đăng 05/09 chỉ sau mười ngày '
      + 'đã thấp hơn thực tế 34%. Để 30 ngày thì bài trong tháng luôn đúng số. '
      + 'Bài cũ hơn thế chỉ cập nhật khi bấm <b>Nạp lại từ đầu</b>.</div>'
      + '</div></div>';

    $('#modal').innerHTML = '<div class="modal-head"><h3>Kết nối nền tảng</h3></div>'
      + '<div class="modal-body">' + html + '</div>'
      + '<div class="modal-foot"><button class="btn ghost" id="mHuy">Đóng</button>'
      + '<button class="btn primary" id="mLuu">Lưu cấu hình</button></div>';

    $('#mHuy').onclick = dongModal;
    $('#khoThu').onclick = async () => {
      $('#khoKq').textContent = 'Đang thử ghi rồi đọc lại…';
      try {
        const r = await goiJSON('/api/ket-noi/kiem-tra-kho', {});
        $('#khoKq').textContent = r.ok
          ? '✓ Kho ghi và đọc được — token sẽ sống qua lần deploy.'
          : '✗ Kho KHÔNG dùng được: ' + r.ly_do;
        $('#khoKq').style.color = r.ok ? 'var(--good)' : 'var(--bad)';
      } catch (e) {
        $('#khoKq').textContent = '✗ ' + e.message;
        $('#khoKq').style.color = 'var(--bad)';
      }
    };
    $('#ttThem').onclick = () => {
      $('#ttTay').insertAdjacentHTML('beforeend', dongTikTok({ mode: 'display' }, 0));
    };
    $('#ttList').onclick = (e) => {
      const b = e.target.closest('.tt-go');
      if (!b) return;
      const hang = b.closest('.acc');
      const ten = hang.querySelector('b').textContent;
      if (confirm('Gỡ kênh "' + ten + '" khỏi cấu hình?\n\n'
        + 'Token của kênh này sẽ không được dùng nữa. Muốn nối lại thì phải cấp quyền từ đầu.')) {
        hang.remove();
      }
    };
    $('#fbThuNdBtn').onclick = async () => {
      const el = $('#fbThuNdKq');
      el.innerHTML = '<span class="help">Đang thử…</span>';
      try {
        const r = await goiJSON('/api/ket-noi/facebook/thu-nguoi-dang', { token: $('#fbThuNd').value });
        el.innerHTML = '<div class="help"><b>' + esc(r.ketLuan) + '</b></div>'
          + (r.ketQua || []).map((x) => '<div class="help">· ' + esc(x.trang) + ': '
            + (x.loi ? 'lỗi — ' + esc(x.loi)
              : esc(x.coNguoiDang + '/' + x.soBai + ' bài có người đăng')
                + (x.ten && x.ten.length ? ' — ' + esc(x.ten.join(', ')) : ''))
            + '</div>').join('');
        /* Xoá mã khỏi ô ngay: không để nó nằm trong DOM sau khi đã dùng xong. */
        $('#fbThuNd').value = '';
      } catch (e) { el.innerHTML = '<div class="help">Lỗi: ' + esc(e.message) + '</div>'; }
    };

    $('#fbLietKe').onclick = async () => {
      try {
        const r = await goiJSON('/api/ket-noi/facebook/pages', { userToken: $('#fbToken').value });
        $('#fbPages').innerHTML = r.pages.map((p) => '<div class="acc">'
          + '<input type="checkbox" class="fbp" value="' + esc(p.id) + '" checked>'
          + '<span class="grow">' + esc(p.name) + '<span class="muted"> · ' + esc(p.id)
          + ' · ' + n0(p.followers) + ' follower'
          + (p.instagram ? ' · IG @' + esc(p.instagram.username) : '') + '</span></span></div>').join('')
          + '<div><button class="btn ghost small" id="fbLuuPages">Lưu các trang đã tick</button></div>';
        $('#fbLuuPages').onclick = async () => {
          const ids = $$('.fbp').filter((x) => x.checked).map((x) => x.value);
          const k = await goiJSON('/api/ket-noi/facebook/luu-pages',
            { userToken: $('#fbToken').value, pageIds: ids });
          toast('Đã lưu ' + k.pages + ' trang'
            + (k.instagram ? ' và ' + k.instagram + ' tài khoản Instagram' : ''));
        };
      } catch (e) { toast(e.message, 'err'); }
    };
    const cbLuat = () => ({
      bat: $('#cbOn').checked,
      chatId: $('#cbChat').value.trim(),
      ngayImLang: Number($('#cbIm').value) || 5,
      tutPhanTram: Number($('#cbTut').value) || 35,
    });

    $('#cbXem').onclick = async () => {
      try {
        const r = await goiJSON('/api/canh-bao/thu', { chiXem: true, luat: cbLuat() });
        $('#cbHop').innerHTML = r.ds.length
          ? '<div class="note info"><span class="ico">→</span><span>Đang có <b>'
            + r.ds.length + '</b> việc đáng báo. Nhóm sẽ nhận đúng thế này:'
            + '<div class="log-box" style="margin-top:6px;white-space:pre-wrap">'
            + esc(r.tin) + '</div></span></div>'
          : '<div class="note"><span class="ico">✓</span><span>Không có gì đáng báo lúc này.</span></div>';
      } catch (e) { toast(e.message, 'err'); }
    };

    $('#cbGui').onclick = async () => {
      if (!$('#cbChat').value.trim()) return toast('Điền Chat ID của nhóm đã', 'err');
      try {
        const r = await goiJSON('/api/canh-bao/thu', { luat: cbLuat() });
        if (r.loi) toast('Không gửi được: ' + r.loi, 'err');
        else if (!r.gui) toast('Không có gì đáng báo — chưa gửi gì cả.');
        else toast('Đã gửi ' + r.gui + ' mục vào nhóm.');
      } catch (e) { toast(e.message, 'err'); }
    };

    $('#zaLink').onclick = async () => {
      try {
        const r = await goiJSON('/api/ket-noi/zalo/link', {
          appId: $('#zaApp').value.trim(),
          redirectUri: $('#zaRedirect').value.trim(),
        });
        /* Hai đường, tuỳ trang quản trị Zalo bày ra cái nào:
         *  - Trang có ô "Code Challenge": dán chuỗi challenge vào đó, Zalo tự
         *    dựng link — đây là đường Zalo đang dùng.
         *  - Không có ô đó: mở thẳng link mình dựng sẵn.
         * Cùng một cặp PKCE nên đường nào cũng đổi được mã. */
        $('#zaLinkBox').innerHTML = '<div class="note info"><span class="ico">→</span><span>'
          + '<b>Nếu trang ứng dụng Zalo có ô "Code Challenge"</b> — dán chuỗi này vào đó, '
          + 'điền Callback Url đúng bằng ô Địa chỉ chuyển hướng ở trên, bấm Lưu. '
          + 'Zalo sẽ tự dựng đường dẫn cấp quyền cho anh:'
          + '<div class="log-box" style="margin:6px 0;word-break:break-all">' + esc(r.codeChallenge) + '</div>'
          + '<button class="btn ghost small" id="zaChepCh">Chép Code Challenge</button>'
          + '<hr style="margin:10px 0;border:0;border-top:1px solid var(--line)">'
          + '<b>Nếu không thấy ô đó</b> — mở thẳng link này bằng trình duyệt đang đăng nhập '
          + 'tài khoản quản trị OA:<br>'
          + '<a href="' + esc(r.link) + '" target="_blank" rel="noreferrer">' + esc(r.link.slice(0, 110))
          + '…</a> <button class="btn ghost small" id="zaChep">Chép link</button>'
          + '<hr style="margin:10px 0;border:0;border-top:1px solid var(--line)">'
          + 'Đường nào cũng vậy: bấm <b>Cho phép</b>, Zalo chuyển sang trang trắng hoặc báo lỗi '
          + '— không sao. Chép đoạn <b>code=…</b> trên thanh địa chỉ, dán xuống ô bên dưới. '
          + 'Mã dùng một lần và hết hạn nhanh, nên dán ngay. Bấm lại nút này là sinh cặp mới, '
          + 'và mã cũ hết dùng được.</span></div>';
        const chep = (t, ten) => navigator.clipboard.writeText(t).then(
          () => toast('Đã chép ' + ten), () => toast('Không chép được — bôi đen rồi Ctrl+C', 'err'));
        $('#zaChepCh').onclick = () => chep(r.codeChallenge, 'Code Challenge');
        $('#zaChep').onclick = () => chep(r.link, 'link');
      } catch (e) { toast(e.message, 'err'); }
    };

    $('#ttLink').onclick = async () => {
      try {
        const r = await goiJSON('/api/ket-noi/tiktok/link', {
          clientKey: $('#ttKey').value.trim(),
          redirectUri: $('#ttRedirect').value.trim(),
          mode: $('#ttModeMoi').value,
        });
        /* Mở tab mới, KHÔNG điều hướng tab đang mở: người dùng đang gõ dở cấu hình
           trong modal này, chuyển trang là mất sạch chưa lưu. */
        $('#ttLinkBox').innerHTML = '<div class="note info"><span class="ico">→</span><span>'
          + 'Mở link này bằng trình duyệt <b>đang đăng nhập kênh cần nối</b> '
          + '(cửa sổ ẩn danh cho kênh thứ hai trở đi, không thì TikTok cấp quyền nhầm kênh):<br>'
          + '<a href="' + esc(r.link) + '" target="_blank" rel="noreferrer">' + esc(r.link.slice(0, 110))
          + '…</a><br><button class="btn ghost small" id="ttChep">Chép link</button></span></div>';
        $('#ttChep').onclick = () => {
          navigator.clipboard.writeText(r.link).then(() => toast('Đã chép link'),
            () => toast('Không chép được — bôi đen link rồi Ctrl+C', 'err'));
        };
      } catch (e) { toast(e.message, 'err'); }
    };
    $('#ttDoi').onclick = async () => {
      try {
        const r = await goiJSON('/api/ket-noi/tiktok/doi-ma', {
          code: $('#ttCode').value.trim(),
          clientKey: $('#ttKey').value.trim(),
          clientSecret: $('#ttSecret').value.trim(),
          redirectUri: $('#ttRedirect').value.trim(),
          mode: $('#ttModeMoi').value,
        });
        toast('Đã nối kênh ' + (r.name || r.openId)
          + (r.followers ? ' · ' + n0(r.followers) + ' follower' : '')
          + ' — tổng ' + r.soKenh + ' kênh');
        // Nối được nhưng chưa cất được vào kho là chuyện phải hiện ra ngay, không
        // để tới lần deploy sau mới phát hiện mất trắng.
        if (r.canhBao) toast(r.canhBao, 'err');
        $('#ttCode').value = '';
        /* Server đã ghi kênh vào cấu hình rồi — nạp lại cả hộp thay vì tự chèn một
           dòng, để danh sách luôn đúng bằng thứ máy chủ thật sự đang giữ. */
        moKetNoi();
      } catch (e) { toast(e.message, 'err'); }
    };
    $('#zaDoi').onclick = async () => {
      try {
        const r = await goiJSON('/api/ket-noi/zalo/doi-ma', {
          code: $('#zaCode').value.trim(),
          appId: $('#zaApp').value.trim(),
          secretKey: $('#zaSecret').value.trim(),
        });
        toast('Đã nối OA ' + r.name + ' · ' + n0(r.followers) + ' follower');
      } catch (e) { toast(e.message, 'err'); }
    };
    $('#mLuu').onclick = async () => {
      try {
        await goiJSON('/api/ket-noi', {
          khoi: 'facebook',
          giaTri: {
            enabled: $('#fbOn').checked,
            userToken: $('#fbToken').value,
            apiVersion: $('#fbVer').value,
          },
        });
        await goiJSON('/api/ket-noi', {
          khoi: 'instagram', giaTri: { enabled: $('#fbOn').checked },
        });
        await goiJSON('/api/ket-noi', {
          khoi: 'tiktok',
          giaTri: {
            enabled: $('#ttOn').checked,
            clientKey: $('#ttKey').value,
            clientSecret: $('#ttSecret').value,
            redirectUri: $('#ttRedirect').value.trim(),
            /* Kênh đã nối gửi lên đúng openId; server ghép theo openId và giữ
               nguyên token thật. Kênh nào bị Gỡ thì không còn trong mảng nên
               server bỏ nó — đó là cách gỡ kênh. */
            channels: $$('#ttList .acc').map((r) => {
              const id = r.dataset.open;
              const g = (S.ttKenh || []).find((x) => x.openId === id) || {};
              return { openId: id, name: g.name || '', handle: g.handle || '',
                mode: g.mode || 'display', businessId: g.businessId || '' };
            }).filter((x) => x.openId)
              .concat($$('#ttTay .acc').map((r) => ({
                openId: $('.tt-open', r).value.trim(),
                name: $('.tt-name', r).value.trim(),
                mode: $('.tt-mode', r).value,
                businessId: $('.tt-biz', r).value.trim(),
                refreshToken: $('.tt-rt', r).value.includes('••••') ? '' : $('.tt-rt', r).value.trim(),
              })).filter((x) => x.openId || x.refreshToken)),
          },
        });
        await goiJSON('/api/ket-noi', {
          khoi: 'zalo',
          giaTri: {
            enabled: $('#zaOn').checked,
            appId: $('#zaApp').value, secretKey: $('#zaSecret').value,
            redirectUri: $('#zaRedirect').value.trim(),
          },
        });
        await goiJSON('/api/ket-noi', { khoi: 'canhBao', giaTri: cbLuat() });
        await goiJSON('/api/ket-noi', {
          khoi: 'dongBo',
          giaTri: { moiSoGio: Number($('#dbGio').value) || 0, soNgayLui: Number($('#dbLui').value) || 30 },
        });
        dongModal();
        toast('Đã lưu cấu hình kết nối');
      } catch (e) { toast(e.message, 'err'); }
    };
  }

  /** Một kênh ĐÃ NỐI: chỉ để nhìn, không phải để gõ. */
  function theKenhTikTok(ch) {
    return '<div class="acc" data-open="' + esc(ch.openId || '') + '">'
      + '<span class="grow"><b>' + esc(ch.name || ch.openId || '(không tên)') + '</b>'
      + '<span class="muted"> · ' + esc(ch.handle ? '@' + ch.handle : ch.openId)
      + ' · ' + esc(ch.mode || 'display')
      + (ch.refreshToken ? ' · đã cấp quyền' : ' · CHƯA có token') + '</span></span>'
      + '<button class="btn ghost small tt-go" type="button">Gỡ</button></div>';
  }

  function dongTikTok(ch, i) {
    return '<div class="acc" style="flex-wrap:wrap">'
      + '<input class="tt-name" style="flex:1 1 150px" placeholder="Tên kênh" value="' + esc(ch.name || '') + '">'
      + '<input class="tt-open" style="flex:1 1 150px" placeholder="open_id" value="' + esc(ch.openId || '') + '">'
      + '<select class="tt-mode" style="flex:0 0 120px">'
      + '<option value="display"' + (ch.mode !== 'business' ? ' selected' : '') + '>display</option>'
      + '<option value="business"' + (ch.mode === 'business' ? ' selected' : '') + '>business</option>'
      + '</select>'
      + '<input class="tt-biz" style="flex:1 1 130px" placeholder="business_id (nếu business)" value="' + esc(ch.businessId || '') + '">'
      + '<input class="tt-rt" style="flex:1 1 200px" placeholder="refresh token" value="' + esc(ch.refreshToken || '') + '">'
      + '</div>';
  }

  /* ---------------- tab: nội dung ---------------- */
  async function veNoiDung() {
    $('#view').innerHTML = window.KX ? KX.man('', { dau: false, the: 4, dong: 6 })
      : '<div class="loading">Đang tính…</div>';
    const q = new URLSearchParams({ from: S.from, to: S.to });
    if (S.platforms.length) q.set('platform', S.platforms.join(','));
    const d = await goi('/api/noi-dung?' + q);

    if (!d.soBai) {
      $('#view').innerHTML = '<div class="empty">Khoảng này chưa có bài nào.</div>';
      return;
    }

    /* Lưới thứ × khung giờ. Đậm nhạt theo trung vị so với ô cao nhất — nhìn một
     * cái là thấy vệt giờ nào ăn, thay vì đọc 84 con số. */
    const o = d.gioVang.o;
    const theoKhoa = new Map(o.map((x) => [x.thu + '|' + x.khung, x]));
    const dung = ndTheo === 'xem' ? (x) => x.xem : (x) => x.tuongTac;
    const dinh = Math.max(1, ...o.filter((x) => x.du).map((x) => dung(x) || 0));
    const oLuoi = (thu, khung) => {
      const x = theoKhoa.get(thu + '|' + khung);
      if (!x || !x.du) {
        return '<td class="gv-mo" title="' + (x ? x.soBai + ' bài — chưa đủ để kết luận'
          : 'chưa từng đăng') + '">·</td>';
      }
      const v = dung(x) || 0;
      const d0 = Math.min(1, v / dinh);
      return '<td style="background:rgba(43,92,255,' + (0.06 + d0 * 0.72).toFixed(2) + ');'
        + 'color:' + (d0 > 0.55 ? '#fff' : 'inherit') + '" title="'
        + esc(x.tenThu + ' ' + x.tenKhung + 'h · ' + x.soBai + ' bài') + '">'
        + (v ? gon(v) : '—') + '</td>';
    };

    const hang = [];
    for (let t = 1; t <= 7; t++) {
      const thu = t % 7;   // bắt đầu từ Thứ 2, Chủ nhật xuống cuối
      let tr = '<tr><th class="gv-thu">' + esc(TEN_THU[thu]) + '</th>';
      for (let k = 0; k < 12; k++) tr += oLuoi(thu, k);
      hang.push(tr + '</tr>');
    }

    const tot = o.filter((x) => x.du && dung(x)).sort((a, b) => dung(b) - dung(a)).slice(0, 3);

    $('#view').innerHTML = ''
      + '<div class="card"><div class="card-head"><h3>Đăng giờ nào ăn</h3>'
      + '<div class="seg" id="segND">'
      + [['xem', 'Lượt xem'], ['tuongTac', 'Tương tác']].map(([k, t]) =>
        '<button data-k="' + k + '"' + (ndTheo === k ? ' class="on"' : '') + '>' + t + '</button>').join('')
      + '</div></div><div class="card-body">'
      + '<div class="help" style="margin-bottom:10px">Số trong ô là <b>trung vị</b> của các bài '
      + 'đăng vào khung đó — không phải trung bình. Một bài lên xu hướng không được phép '
      + 'kéo cả khung giờ lên. Ô chấm là chưa đủ ' + d.gioVang.toiThieu + ' bài để kết luận.'
      + (tot.length ? ' Ăn nhất: <b>' + tot.map((x) => x.tenThu + ' ' + x.tenKhung + 'h').join('</b>, <b>') + '</b>.' : '')
      + '</div>'
      + '<div style="overflow-x:auto"><table class="gv"><thead><tr><th></th>'
      + Array.from({ length: 12 }, (_, k) => '<th>' + (k * 2) + '</th>').join('')
      + '</tr></thead><tbody>' + hang.join('') + '</tbody></table></div>'
      + '</div></div>'

      + '<div class="grid g2" style="margin-top:14px">'
      + '<div class="card"><div class="card-head"><h3>Dạng bài nào ăn</h3></div>'
      + '<div class="card-body tight">'
      + bangGon([
        { t: 'Dạng', name: 1, v: (x) => esc(x.ten) },
        { t: 'Bài', num: 1, v: (x) => n0(x.soBai) },
        { t: 'Xem (trung vị)', num: 1, v: (x) => (x.xem == null ? '<span style="color:var(--ink-3)">không đo được</span>' : n0(x.xem)) },
        { t: 'Tương tác', num: 1, v: (x) => n0(x.tuongTac) },
        { t: 'Tỷ lệ TT', num: 1, v: (x) => pct(x.tyLeTuongTac) },
      ], d.theoLoai.filter((x) => x.du))
      + '</div></div>'
      + '<div class="card"><div class="card-head"><h3>Hashtag kéo người xem</h3>'
      + '<span class="sub">từ 5 bài trở lên</span></div><div class="card-body tight">'
      + bangGon([
        { t: 'Thẻ', name: 1, v: (x) => esc(x.the) },
        { t: 'Bài', num: 1, v: (x) => n0(x.soBai) },
        { t: 'Xem (trung vị)', num: 1, v: (x) => (x.xem == null ? '—' : n0(x.xem)) },
        { t: 'Tương tác', num: 1, v: (x) => n0(x.tuongTac) },
      ], d.hashtag.slice(0, 15))
      + '</div></div></div>'

      + '<div class="card" style="margin-top:14px"><div class="card-head"><h3>Kênh nào nội dung khoẻ</h3>'
      + '<span class="sub">trung vị mỗi bài, không phải tổng</span></div><div class="card-body tight">'
      + bangGon([
        { t: 'Kênh', name: 1, v: (x) => esc(x.ten) },
        { t: 'Bài', num: 1, v: (x) => n0(x.soBai) },
        { t: 'Xem (trung vị)', num: 1, v: (x) => (x.xem == null ? '—' : n0(x.xem)) },
        { t: 'Tương tác', num: 1, v: (x) => n0(x.tuongTac) },
        { t: 'Tỷ lệ TT', num: 1, v: (x) => pct(x.tyLeTuongTac) },
      ], d.theoKenh.filter((x) => x.du))
      + '</div></div>';

    $('#segND').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      ndTheo = b.dataset.k;
      veNoiDung();
    };
  }

  /* ---------------- tab: khách hỏi ---------------- */
  let blNgay = 7;
  let blTatCa = false;

  async function veBinhLuan() {
    $('#view').innerHTML = window.KX
      ? '<div class="notes" style="margin-bottom:12px">Đang đọc bình luận từ Facebook và '
        + 'Instagram — việc này gọi thẳng API nên hơi lâu…</div>' + KX.dong(6)
      : '<div class="loading">Đang đọc bình luận từ Facebook và Instagram — '
        + 'việc này gọi thẳng API nên hơi lâu…</div>';
    let d;
    try {
      d = await goi('/api/binh-luan?ngay=' + blNgay + (blTatCa ? '&tatCa=1' : ''));
    } catch (e) {
      $('#view').innerHTML = '<div class="empty">Không đọc được bình luận: ' + esc(e.message) + '</div>';
      return;
    }

    const dong = (x) => '<div class="bl-item">'
      + '<div class="bl-top"><span class="bl-diem" title="điểm dấu hiệu">' + x.diem + '</span>'
      + theTag(x.platform)
      + '<span class="bl-kenh">' + esc(x.kenh) + '</span>'
      + '<span class="bl-luc">' + esc(String(x.luc).slice(0, 16).replace('T', ' ')) + '</span>'
      + (x.soTraLoi
        ? '<span class="bl-da">đã có ' + x.soTraLoi + ' trả lời</span>'
        : '<span class="bl-chua">chưa ai trả lời</span>')
      + '</div>'
      + '<div class="bl-noi">' + esc(x.noiDung.slice(0, 400)) + '</div>'
      + '<div class="bl-chan">' + x.dauHieu.map((h) => '<span class="bl-dh">' + esc(h) + '</span>').join('')
      + (x.baiUrl ? '<a href="' + esc(x.baiUrl) + '" target="_blank" rel="noreferrer">Mở bài để trả lời →</a>' : '')
      + '</div></div>';

    const chuaTraLoi = d.ds.filter((x) => !x.soTraLoi).length;

    $('#view').innerHTML = ''
      + '<div class="card"><div class="card-head"><h3>Khách hỏi trong bình luận</h3>'
      + '<div class="seg" id="segBL">'
      + [[3, '3 ngày'], [7, '7 ngày'], [14, '14 ngày']].map(([k, t]) =>
        '<button data-k="' + k + '"' + (blNgay === k ? ' class="on"' : '') + '>' + t + '</button>').join('')
      + '</div></div><div class="card-body">'
      + '<div class="help" style="margin-bottom:10px">Quét <b>' + n0(d.daQuet) + '</b> bình luận '
      + 'từ ' + esc(d.tu) + ', lọc ra <b>' + d.ds.length + '</b> câu có dấu hiệu hỏi mua'
      + (chuaTraLoi ? ', trong đó <b>' + chuaTraLoi + '</b> chưa ai trả lời' : '') + '. '
      + 'App chỉ ĐỌC được bình luận — muốn bấm trả lời ngay tại đây thì token cần thêm quyền '
      + '<code>pages_manage_engagement</code> và <code>instagram_manage_comments</code>.'
      + ' <label style="margin-left:6px"><input type="checkbox" id="blTatCa"'
      + (blTatCa ? ' checked' : '') + '> xem cả bình luận thường</label></div>'
      + (d.ds.length
        ? '<div class="bl-list">' + d.ds.slice(0, 200).map(dong).join('') + '</div>'
        : '<div class="empty">Không có câu nào có dấu hiệu hỏi mua trong khoảng này.</div>')
      + '</div></div>'
      + ((d.canhBao || []).length
        ? '<div class="notes" style="margin-top:12px">' + d.canhBao.map((x) =>
          '<div class="note"><span class="ico">!</span><span>' + esc(x) + '</span></div>').join('') + '</div>'
        : '');

    $('#segBL').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      blNgay = Number(b.dataset.k);
      veBinhLuan();
    };
    $('#blTatCa').onchange = (e) => { blTatCa = e.target.checked; veBinhLuan(); };
  }

  /* ---------------- phân quyền xem kênh ---------------- */

  /**
   * Nói thẳng người đang xem chỉ thấy một phần.
   *
   * Không có dòng này thì nhân sự mở app ra thấy 3 kênh, tưởng công ty có 3 kênh,
   * hoặc tệ hơn là tưởng số liệu bị hụt và đi báo lỗi.
   */
  function veChiBaoPhamVi() {
    if (!S.phamVi) return '';
    return '<div class="notes" style="margin-bottom:12px"><div class="note">'
      + '<span class="ico">i</span><span>Anh/chị đang xem <b>' + S.phamVi.soKenh + '/'
      + S.phamVi.tongKenh + '</b> kênh được giao. Mọi con số trên màn hình chỉ tính '
      + 'trên các kênh này. Cần xem thêm kênh khác thì báo phụ trách marketing.'
      + '</span></div></div>';
  }

  async function moPhanQuyen() {
    const r = await goi('/api/kenh?moi=1');
    const ds = r.kenh || [];
    moModal('<div class="modal-head"><h3>Ai xem được kênh nào</h3></div>'
      + '<div class="modal-body">'
      + '<div class="help" style="margin-bottom:12px">Khai <b>email công ty</b> của người được xem '
      + 'kênh, nhiều người thì cách nhau dấu phẩy. Kênh <b>để trống là ai cũng xem được</b> — '
      + 'siết dần từng kênh, đừng khoá sạch một lượt. Quản lý luôn thấy tất cả.</div>'
      + '<div class="pq-list">'
      + ds.map((c) => '<div class="pq-row">'
        + '<div class="pq-ten">' + esc(c.name || c.extId)
        + '<span class="sub-line">' + esc(c.platform || '') + '</span></div>'
        + '<input class="pq-in" data-id="' + esc(c.id) + '" value="' + esc(c.viewers || '')
        + '" placeholder="ai cũng xem được">'
        + '</div>').join('')
      + '</div></div>'
      + '<div class="modal-foot"><button class="btn ghost" id="pqDong">Đóng</button></div>');

    $('#pqDong').onclick = dongModal;
    /* Lưu ngay khi rời ô, không cần nút Lưu riêng: bảng có mười một dòng, bắt
     * bấm lưu từng dòng thì ai cũng quên một dòng. */
    $('#modal').querySelectorAll('.pq-in').forEach((o) => {
      const goc = o.value;
      o.onblur = async () => {
        if (o.value === goc) return;
        try {
          const kq = await goiJSON('/api/kenh/nguoi-xem', { id: o.dataset.id, emails: o.value });
          o.classList.add('pq-ok');
          setTimeout(() => o.classList.remove('pq-ok'), 1200);
          toast(kq.so ? 'Đã giao cho ' + kq.so + ' người' : 'Kênh này giờ ai cũng xem được');
        } catch (e) {
          o.classList.add('pq-loi');
          setTimeout(() => o.classList.remove('pq-loi'), 2500);
          toast(e.message, 'err');
        }
      };
    });
  }

  /**
   * Bấm một thẻ chưa có chủ: hỏi gắn vào nhãn nào ĐÃ CÓ trước, tạo nhãn mới là
   * lối cuối.
   *
   * Bản trước mở thẳng hộp tạo nhãn, nên bấm "#captreo" là đẻ thêm một nhãn nói
   * về đúng chỗ mà "Hòn Thơm" đã nói — rồi báo cáo Sun Group tách làm hai dòng
   * không ai gộp lại được.
   */
  async function moGanThe(the, dsNhom, dsDoiTac) {
    const r = await goi('/api/the/nhan-hop?the=' + encodeURIComponent(the));
    const goiY = r.goiY || [];
    const tatCa = r.tatCa || [];

    const nut = (x, gy) => '<button class="gt-nhan' + (gy ? ' gy' : '') + '" data-nhan="'
      + esc(x.nhan) + '"><b>' + esc(x.nhan) + '</b>'
      + (x.doiTac ? '<span class="dt">' + esc(x.doiTac) + '</span>' : '')
      + (gy && x.viSao ? '<span class="vs">' + esc(x.viSao) + '</span>' : '')
      + '</button>';

    moModal('<div class="modal-head"><h3>Gắn ' + esc(the) + ' vào nhãn nào?</h3></div>'
      + '<div class="modal-body">'
      + (goiY.length
        ? '<div class="help" style="margin-bottom:8px">Nhãn <b>có vẻ hợp</b> — bấm để gắn ngay:</div>'
          + '<div class="gt-list">' + goiY.map((x) => nut(x, true)).join('') + '</div>'
        : '<div class="help" style="margin-bottom:8px">Không nhãn nào trông giống thẻ này. '
          + 'Chọn tay bên dưới, hoặc tạo nhãn mới.</div>')
      + '<div class="help" style="margin:14px 0 8px">Hoặc chọn trong ' + tatCa.length
      + ' nhãn đã có:</div>'
      + '<input id="gtTim" placeholder="gõ để lọc nhanh" style="width:100%;margin-bottom:8px">'
      + '<div class="gt-list" id="gtTatCa">'
      + tatCa.map((x) => nut(x, false)).join('') + '</div>'
      + '</div>'
      + '<div class="modal-foot">'
      + '<button class="btn ghost small" id="gtMoi">Tạo nhãn mới với thẻ này</button>'
      + '<span class="grow"></span>'
      + '<button class="btn ghost" id="gtDong">Đóng</button></div>');

    $('#gtDong').onclick = dongModal;
    $('#gtMoi').onclick = () => moSuaNhan({ hashtag: the, bat: true }, dsNhom, dsDoiTac);
    $('#gtTim').oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      $('#gtTatCa').querySelectorAll('[data-nhan]').forEach((b2) => {
        b2.hidden = q && !b2.dataset.nhan.toLowerCase().includes(q);
      });
    };
    $('#modal').querySelectorAll('[data-nhan]').forEach((b2) => {
      b2.onclick = async () => {
        try {
          await goiJSON('/api/the/gan', { the, nhan: b2.dataset.nhan });
          dongModal();
          toast('Đã gắn ' + the + ' vào "' + b2.dataset.nhan + '"');
          veNhan();
        } catch (e) { toast(e.message, 'err'); }
      };
    });
  }

  /* ---------------- thiết lập nhãn ---------------- */

  /**
   * Sửa nhãn ngay trong app thay vì bắt mở Base.
   *
   * Vẫn ghi thẳng xuống bảng "Nhãn bài" — một nguồn sự thật. Ai quen Base hơn
   * thì sửa trong Base vẫn được, hai đường không bao giờ lệch nhau.
   */
  function moSuaNhan(x, dsNhom, dsDoiTac) {
    const v = x || { nhan: '', nhom: '', hashtag: '', doiTac: '', ghiChu: '', bat: true };
    const goiY = (id, ds) => '<datalist id="' + id + '">'
      + [...new Set(ds.filter(Boolean))].map((t) => '<option value="' + esc(t) + '">').join('')
      + '</datalist>';

    /* `x` có thể là một dòng có thật (sửa) HOẶC chỉ là giá trị điền sẵn khi bấm
     * từ danh sách thẻ chưa có chủ. Phân biệt bằng id, không bằng `x` có hay
     * không — nếu không thì nút Xoá hiện ra cho một dòng chưa tồn tại. */
    const laSua = Boolean(x && x.id);
    moModal('<div class="modal-head"><h3>' + (laSua ? 'Sửa nhãn' : 'Thêm nhãn') + '</h3></div>'
      + '<div class="modal-body"><div class="kn-form">'
      + '<div class="kn-row"><label>Tên nhãn</label>'
      + '<input id="nlTen" value="' + esc(v.nhan) + '" placeholder="VinWonders Phú Quốc">'
      + '<span class="help">Tên này hiện trong báo cáo gửi đối tác, nên viết cho người đọc.</span></div>'
      + '<div class="kn-row"><label>Hashtag</label>'
      + '<input id="nlTag" value="' + esc(v.hashtag) + '" placeholder="#VinpearlVinwondersPhuQuoc #vinwonders">'
      + '<span class="help">Cách nhau bằng dấu cách hoặc dấu phẩy. Bài nào có <b>một trong số</b> '
      + 'các thẻ này là mang nhãn. Không phân biệt hoa thường.</span>'
      + '<div id="nlGoiY" class="goi-y"></div></div>'
      + '<div class="kn-row"><label>Nhóm</label>'
      + '<input id="nlNhom" list="dlNhom" value="' + esc(v.nhom) + '" placeholder="Địa điểm">'
      + goiY('dlNhom', dsNhom)
      + '<span class="help">Gõ gì cũng được — Địa điểm, Mã tour, Sản phẩm, Chiến dịch…</span></div>'
      + '<div class="kn-row"><label>Đối tác</label>'
      + '<input id="nlDT" list="dlDT" value="' + esc(v.doiTac) + '" placeholder="Vinpearl">'
      + goiY('dlDT', dsDoiTac)
      + '<span class="help">Nhiều nhãn cùng đối tác sẽ được cộng chung ở bảng Theo đối tác. '
      + 'Để trống nếu nhãn này không thuộc đối tác nào.</span></div>'
      + '<div class="kn-row"><label>Ghi chú</label>'
      + '<input id="nlGC" value="' + esc(v.ghiChu || '') + '"></div>'
      + '<div class="kn-row"><label>Bật</label>'
      + '<label class="help"><input type="checkbox" id="nlBat"' + (v.bat !== false ? ' checked' : '')
      + '> tắt thì nhãn không tính vào báo cáo, nhưng vẫn giữ lại để bật lại sau</label></div>'
      + '</div></div>'
      + '<div class="modal-foot">'
      + (laSua ? '<button class="btn ghost small" id="nlXoa">Xoá nhãn</button>' : '')
      + '<span class="grow"></span>'
      + '<button class="btn ghost" id="nlHuy">Huỷ</button> '
      + '<button class="btn" id="nlLuu">Lưu</button></div>');

    /* Gợi ý cập nhật ngay khi gõ: đội nội dung viết cùng một địa điểm bằng mấy
     * kiểu thẻ khác nhau, không ai nhớ hết. Bấm một cái là thêm vào ô. */
    let henGoiY = null;
    const veGoiY = async () => {
      const hop = $('#nlGoiY');
      if (!hop) return;
      let ds = [];
      try {
        const r = await goi('/api/nhan/goi-y?' + new URLSearchParams({
          from: S.from, to: S.to,
          nhan: $('#nlTen').value.trim(), hashtag: $('#nlTag').value.trim(),
        }));
        ds = r.ds || [];
      } catch (_) { return; }
      hop.innerHTML = ds.length
        ? '<div class="goi-y-nhan">Thẻ đang dùng trong bài, có thể thuộc nhãn này — bấm để thêm:</div>'
          + ds.map((t) => '<button type="button" class="goi-y-the" data-the="' + esc(t.the) + '">'
            + esc(t.the) + ' <span>' + n0(t.soBai) + '</span></button>').join('')
        : '';
      hop.querySelectorAll('[data-the]').forEach((b) => {
        b.onclick = () => {
          const o = $('#nlTag');
          o.value = (o.value.trim() + ' ' + b.dataset.the).trim();
          veGoiY();
        };
      });
    };
    /* Chờ 350ms sau phím cuối rồi mới hỏi — gõ "VinWonders Phú Quốc" mà mỗi ký
     * tự một lần gọi là 19 lượt quét toàn bộ bài đăng. */
    const hoanGoiY = () => { clearTimeout(henGoiY); henGoiY = setTimeout(veGoiY, 350); };
    $('#nlTen').oninput = hoanGoiY;
    $('#nlTag').oninput = hoanGoiY;
    veGoiY();

    $('#nlHuy').onclick = dongModal;
    $('#nlLuu').onclick = async () => {
      try {
        await goiJSON('/api/nhan/luu', {
          id: x && x.id,
          nhan: $('#nlTen').value, hashtag: $('#nlTag').value,
          nhom: $('#nlNhom').value, doiTac: $('#nlDT').value,
          ghiChu: $('#nlGC').value, bat: $('#nlBat').checked,
        });
        dongModal();
        toast('Đã lưu nhãn');
        veNhan();
      } catch (e) { toast(e.message, 'err'); }
    };
    if (laSua) {
      $('#nlXoa').onclick = async () => {
        /* Xoá nhãn không xoá bài — chỉ là bài thôi không mang nhãn đó nữa. Nói rõ
         * để không ai sợ mất dữ liệu mà giữ lại một đống nhãn rác. */
        if (!confirm('Xoá nhãn "' + v.nhan + '"?\n\nBài đăng KHÔNG bị xoá — chúng chỉ '
          + 'thôi mang nhãn này trong báo cáo.')) return;
        try {
          await goiJSON('/api/nhan/xoa', { id: x.id });
          dongModal();
          toast('Đã xoá nhãn');
          veNhan();
        } catch (e) { toast(e.message, 'err'); }
      };
    }
  }

  /* ---------------- tab: nhãn & đối tác ---------------- */
  async function veNhan() {
    $('#view').innerHTML = '<div class="loading">Đang gắn nhãn…</div>';
    const q = new URLSearchParams({ from: S.from, to: S.to });
    if (S.platforms.length) q.set('platform', S.platforms.join(','));
    const d = await goi('/api/nhan?' + q);

    /* Trang in mở tab mới rồi người dùng bấm Lưu PDF ở đó — trình duyệt lo phần
     * font tiếng Việt, thứ mà tự dựng PDF trong Node làm rất dễ hỏng. */
    const linkXuat = (dt, kieu) => '/api/doi-tac/xuat?' + new URLSearchParams({
      doiTac: dt, kieu, from: S.from, to: S.to,
      ...(S.platforms.length ? { platform: S.platforms.join(',') } : {}),
    });

    const linkCsv = (ten) => '/api/nhan/csv?' + new URLSearchParams({
      nhan: ten, from: S.from, to: S.to,
      ...(S.platforms.length ? { platform: S.platforms.join(',') } : {}),
    });

    const coBai = d.nhan.filter((x) => x.soBai);
    const chuaDung = d.nhan.filter((x) => !x.soBai);
    const chuaCoChu = (d.the || []).filter((t) => !t.thuocNhan);
    const phuSong = d.tongBai ? (d.tongBai - d.khongNhan) / d.tongBai : 0;

    $('#view').innerHTML = ''
      + (d.theoDoiTac.length
        ? '<div class="card"><div class="card-head"><h3>Theo đối tác</h3>'
          + '<span class="sub">gộp mọi nhãn của cùng một đối tác · mỗi bài đếm một lần</span></div>'
          + '<div class="card-body tight">'
          + bangGon([
            { t: 'Đối tác', name: 1, v: (x) => esc(x.doiTac)
              + '<span class="sub-line">' + esc(x.nhan.join(' · ')) + '</span>' },
            { t: 'Bài', num: 1, v: (x) => n0(x.soBai) },
            { t: 'Lượt xem', num: 1, k: 'views', v: (x) => n0(x.views) },
            { t: 'Tương tác', num: 1, k: 'engagement', v: (x) => n0(x.engagement) },
            { t: 'Gửi đối tác', v: (x) => '<a class="btn ghost small" href="'
              + esc(linkXuat(x.doiTac, 'excel')) + '" download>Excel</a> '
              + '<a class="btn ghost small" href="' + esc(linkXuat(x.doiTac, 'in'))
              + '" target="_blank" rel="noreferrer">PDF</a>' },
          ], d.theoDoiTac)
          + '</div></div>'
        : '')

      + '<div class="card" style="margin-top:14px"><div class="card-head"><h3>Theo nhãn</h3>'
      + '<span class="sub">' + esc(S.from) + ' → ' + esc(S.to) + '</span>'
      + (S.quanLy ? '<button class="btn small" id="nlThem" style="margin-left:auto">'
        + '＋ Thêm nhãn</button>' : '')
      + '</div>'
      + '<div class="card-body">'
      + '<div class="help" style="margin-bottom:10px">Nhãn gắn theo <b>hashtag trong caption</b>. '
      + '<b>' + n0(d.tongBai - d.khongNhan) + '/' + n0(d.tongBai) + '</b> bài trong khoảng này '
      + 'đã mang ít nhất một nhãn (' + pct(phuSong) + ')'
      + (d.khongNhan ? ' — <b>' + n0(d.khongNhan) + '</b> bài chưa gắn hashtag nào nên không vào '
        + 'báo cáo đối tác nào cả.' : '.')
      + ' Sửa danh sách hashtag của từng nhãn trong bảng <b>Nhãn bài</b> trên Base.'
      + ' Bài cũ đăng trước khi có quy định được <b>gắn bù</b> một lần bằng từ khoá —'
      + ' cột Bài ghi rõ bao nhiêu bài thuộc diện đó, và sửa được ở cột'
      + ' <b>Nhãn gắn bù</b> trong bảng Bài đăng.</div>'
      + '<div class="tight">'
      + bangGon([
        { t: 'Nhãn', name: 1, v: (x) => esc(x.nhan)
          + '<span class="sub-line">' + esc(x.the.join(' ')) + '</span>' },
        { t: 'Nhóm', v: (x) => esc(x.nhom || '') },
        { t: 'Đối tác', v: (x) => esc(x.doiTac || '') },
        { t: 'Bài', num: 1, v: (x) => n0(x.soBai)
          + (x.soGanBu ? '<span class="sub-line">trong đó ' + n0(x.soGanBu) + ' gắn bù</span>' : '') },
        { t: 'Lượt xem', num: 1, k: 'views', v: (x) => n0(x.views) },
        { t: 'Tương tác', num: 1, k: 'engagement', v: (x) => n0(x.engagement) },
        { t: 'Tỷ lệ TT', num: 1, v: (x) => pct(x.tyLeTuongTac) },
        { t: '', v: (x) => '<a class="btn ghost small" href="' + esc(linkCsv(x.nhan))
          + '" download>Tải CSV</a>'
          + (S.quanLy ? ' <button class="btn ghost small" data-sua="' + esc(x.nhan)
            + '">Sửa</button>' : '') },
      ], coBai)
      + '</div></div></div>'

      + (chuaDung.length
        ? '<div class="card" style="margin-top:14px"><div class="card-head">'
          + '<h3>Nhãn chưa có bài nào</h3><span class="sub">'
          + chuaDung.length + ' nhãn</span></div><div class="card-body">'
          + '<div class="help">Khoảng này chưa bài nào dùng những hashtag sau. Hoặc đội nội dung '
          + 'chưa gắn, hoặc hashtag khai trong Base khác với hashtag đang gõ thật.</div>'
          + '<div class="bl-chan" style="margin-top:8px">'
          + chuaDung.map((x) => (S.quanLy
            ? '<button class="bl-dh" data-sua="' + esc(x.nhan) + '" style="border:0;cursor:pointer">'
            : '<span class="bl-dh">')
            + esc(x.nhan) + ' · ' + esc(x.the.join(' '))
            + (S.quanLy ? '</button>' : '</span>')).join('')
          + '</div></div></div>'
        : '')

      /* Thẻ đang được dùng thật mà chưa nhãn nào nhận. Đây là chỗ nhìn ra thẻ bỏ
       * sót — #diatrunghai 78 bài đáng lẽ thuộc Sunset Town, #thuycung 60 bài
       * đáng lẽ thuộc VinWonders. Không có bảng này thì không ai biết mà tìm. */
      + (chuaCoChu.length
        ? '<div class="card" style="margin-top:14px"><div class="card-head">'
          + '<h3>Hashtag chưa thuộc nhãn nào</h3><span class="sub">'
          + n0(chuaCoChu.length) + ' thẻ · xếp theo số bài</span></div><div class="card-body">'
          + '<div class="help" style="margin-bottom:10px">Thẻ đội nội dung đang gõ mà chưa nhãn '
          + 'nào nhận. Thẻ kênh chung (#phuquoc, #xuhuong…) thì bỏ qua là đúng — cái đáng tìm '
          + 'là thẻ chỉ một địa điểm hay sản phẩm cụ thể.'
          + (S.quanLy ? ' Bấm một thẻ để gắn nó vào một nhãn đã có — hoặc tạo nhãn mới nếu '
            + 'chưa nhãn nào hợp.' : '') + '</div>'
          + '<div class="bl-chan">'
          + chuaCoChu.slice(0, 60).map((t) => (S.quanLy
            ? '<button class="bl-dh" data-the="' + esc(t.the) + '" style="border:0;cursor:pointer">'
            : '<span class="bl-dh">')
            + esc(t.the) + ' <b>' + n0(t.soBai) + '</b>'
            + (S.quanLy ? '</button>' : '</span>')).join('')
          + '</div></div></div>'
        : '');

    /* Chỉ quản lý mới sửa được nhãn — máy chủ cũng chặn, đây chỉ là bớt bày ra
     * những nút bấm vào sẽ báo lỗi. */
    if (!S.quanLy) return;
    const dsNhom = (d.thoNhan || []).map((x) => x.nhom);
    const dsDoiTac = (d.thoNhan || []).map((x) => x.doiTac);
    const timTho = (ten) => (d.thoNhan || []).find((x) => x.nhan === ten);
    const nutThem = $('#nlThem');
    if (nutThem) nutThem.onclick = () => moSuaNhan(null, dsNhom, dsDoiTac);
    $('#view').querySelectorAll('[data-sua]').forEach((b) => {
      b.onclick = () => {
        const x = timTho(b.dataset.sua);
        if (x) moSuaNhan(x, dsNhom, dsDoiTac);
      };
    });
    /* Bấm một thẻ chưa có chủ → mở hộp thêm nhãn với thẻ đó điền sẵn, và gợi ý
     * tự chạy để kéo theo cả họ hàng của nó. */
    $('#view').querySelectorAll('[data-the]').forEach((b) => {
      b.onclick = () => moGanThe(b.dataset.the, dsNhom, dsDoiTac)
        .catch((e) => toast(e.message, 'err'));
    });
  }

  /* ---------------- vẽ ---------------- */
  function ve() {
    if (!S.du) return;
    try {
      if (S.tab === 'tong-quan') return veTongQuan();
      if (S.tab === 'kenh') return veKenh();
      if (S.tab === 'bai') return veBai();
      if (S.tab === 'noi-dung') return veNoiDung();
      if (S.tab === 'binh-luan') return veBinhLuan();
      if (S.tab === 'nhan') return veNhan();
      if (S.tab === 'live') return veLive();
      if (S.tab === 'nhap-tay') return veNhapTay();
      if (S.tab === 'nhat-ky') return veNhatKy();
    } catch (e) {
      $('#view').innerHTML = '<div class="empty">Lỗi hiển thị: ' + esc(e.message) + '</div>';
    }
  }

  /* ---------------- khởi động ---------------- */
  (async function main() {
    S.to = homNay();
    S.from = themNgay(S.to, -29);
    /* Dưới lớp vỏ thì mở lên phải khớp ngay khoảng đang lọc chung, đừng để người
     * dùng thấy 30 ngày rồi giật một nhịp sang mốc khác. Shim của lớp vỏ đã đặt
     * sẵn __HUB__.khoang và cũng sẽ gửi 'loc' xuống, nhưng đọc trước cho mượt. */
    const kh = window.__HUB__ && window.__HUB__.khoang;
    if (kh && kh.tu && kh.den) { S.from = kh.tu; S.to = kh.den; }
    dungBoLoc();
    veSeg();
    dongBoInput();
    dungTabs();

    try {
      const me = await goi('/api/me');
      S.me = me.user; S.quanLy = me.quanLy; S.phamVi = me.phamVi;
      $('#meChip').textContent = (me.user && me.user.name) || (me.quanLy ? 'Quản lý' : 'Khách');
      $('#linkBase').href = me.baseUrl;
      if (!me.quanLy) {
        ['#btnSync', '#btnConnect'].forEach((s) => { $(s).disabled = true; $(s).title = 'Chỉ quản lý'; });
      }
    } catch (_) { $('#meChip').textContent = '—'; }

    $('#btnRefresh').onclick = () => { S.du = null; tai(); };
    $('#btnSync').onclick = moDongBo;
    $('#btnConnect').onclick = moKetNoi;

    await tai();
    window.addEventListener('resize', () => { if (S.tab === 'tong-quan' || S.tab === 'kenh') ve(); });
  }());
}());
