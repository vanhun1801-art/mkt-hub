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
    Facebook: 'fb', TikTok: 'tt', Instagram: 'ig', 'Zalo OA': 'za',
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
    dangTai: false,
  };

  const homNay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  function themNgay(k, d) {
    const [y, m, dd] = k.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
  }

  /* ---------------- thanh lọc ---------------- */
  const KHOANG = [
    ['7 ngày', 7], ['30 ngày', 30], ['90 ngày', 90], ['Tháng này', 0],
  ];

  function dungBoLoc() {
    const seg = $('#rangeSeg');
    seg.innerHTML = KHOANG.map(([t, d]) =>
      '<button data-days="' + d + '">' + t + '</button>').join('');
    seg.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const d = Number(b.dataset.days);
      S.to = homNay();
      S.from = d ? themNgay(S.to, -(d - 1)) : S.to.slice(0, 8) + '01';
      $$('#rangeSeg button').forEach((x) => x.classList.toggle('on', x === b));
      dongBoInput();
      tai();
    };
    seg.children[1].classList.add('on');

    $('#fFrom').onchange = () => { S.from = $('#fFrom').value; tai(); };
    $('#fTo').onchange = () => { S.to = $('#fTo').value; tai(); };
    $('#btnClearFilter').onclick = () => { S.platforms = []; veLocNenTang(); tai(); };
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
  const TABS = [
    ['tong-quan', 'Tổng quan'],
    ['kenh', 'Theo kênh'],
    ['bai', 'Bài đăng'],
    ['live', 'LIVE'],
    ['nhap-tay', 'Nhập tay'],
    ['nhat-ky', 'Nhật ký'],
  ];

  function dungTabs() {
    $('#tabs').innerHTML = TABS.map(([id, t]) =>
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
  function veTongQuan() {
    const d = S.du;
    const t = d.tong;
    const html = ''
      + '<div class="kpis">'
      + theKpi('Lượt xem', gon(t.views), d.doi.views)
      + theKpi('Lượt tiếp cận', gon(t.reach), d.doi.reach)
      + theKpi('Follower hiện có', gon(t.followers), null, 'chốt ngày mới nhất')
      + theKpi('Follower tăng ròng', (t.followNet >= 0 ? '+' : '') + n0(t.followNet), d.doi.followNet)
      + theKpi('Tương tác', gon(t.engagement), d.doi.engagement)
      + theKpi('Tỷ lệ tương tác', pct(t.tyLeTuongTac), d.doi.tyLeTuongTac)
      + '</div>'

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
    $('#view').innerHTML = '<div class="card"><div class="card-head"><h3>Số liệu theo kênh</h3>'
      + '<span class="sub">' + esc(d.tu) + ' → ' + esc(d.den) + '</span></div>'
      + '<div class="card-body tight">'
      + bangGon([
        { t: 'Kênh', name: 1, v: (r) => (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noreferrer">' : '<span>')
          + esc(r.name) + (r.url ? '</a>' : '</span>')
          + '<span class="sub-line">' + esc(r.platform) + '</span>' },
        { t: 'Follower', num: 1, v: (r) => n0(r.followers) },
        { t: 'Tăng ròng', num: 1, v: (r) => (r.followNet >= 0 ? '+' : '') + n0(r.followNet) },
        { t: 'Lượt xem', num: 1, k: 'views', v: (r) => n0(r.views) },
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

    if (window.Charts) {
      Charts.hbars($('#chKenh'), d.kenh.slice(0, 15).map((k) => ({
        label: k.name, value: k.views, color: Charts.colorFor(k.platform, 0),
      })), { fmt: gon });
    }
  }

  /* ---------------- tab: bài đăng ---------------- */
  let baiTheo = 'views';
  async function veBai() {
    $('#view').innerHTML = '<div class="loading">Đang nạp bài đăng…</div>';
    const q = new URLSearchParams({ from: S.from, to: S.to, theo: baiTheo, n: 100 });
    if (S.platforms.length) q.set('platform', S.platforms.join(','));
    const r = await goi('/api/bai?' + q);
    $('#view').innerHTML = '<div class="card"><div class="card-head">'
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
    $('#view').innerHTML = '<div class="loading">Đang nạp phiên LIVE…</div>';
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
    ['views', 'Lượt xem'], ['reach', 'Lượt tiếp cận'], ['impressions', 'Lượt hiển thị'],
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
    const ds = ['TikTok', 'Facebook', 'Instagram', 'Zalo OA', 'Douyin', 'Xiaohongshu', 'YouTube'];
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
    $('#view').innerHTML = '<div class="loading">Đang nạp nhật ký…</div>';
    const r = await goi('/api/nhat-ky');
    $('#view').innerHTML = '<div class="card"><div class="card-head"><h3>Nhật ký đồng bộ</h3>'
      + '<span class="sub">100 lượt gần nhất</span></div><div class="card-body tight">'
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
      + '<div class="log-box" id="dbLog" style="margin-top:12px">Chưa chạy.</div>'
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
      $('#dbLog').textContent = 'Đang chạy…';
      hen = setInterval(async () => {
        try {
          const t = await goi('/api/dong-bo/trang-thai');
          $('#dbLog').textContent = (t.log || []).join('\n') || 'Đang chạy…';
          $('#dbLog').scrollTop = $('#dbLog').scrollHeight;
        } catch (_) {}
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
      }
    };
  }

  /* ---------------- kết nối ---------------- */
  async function moKetNoi() {
    moModal('<div class="modal-head"><h3>Kết nối nền tảng</h3></div>'
      + '<div class="modal-body"><div class="loading">Đang đọc cấu hình…</div></div>');
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
      + '<div class="kn-row"><label>Mã uỷ quyền</label>'
      + '<input id="zaCode" placeholder="oauth_code lấy ở trang quản trị OA — chỉ cần một lần"></div>'
      + '<div><button class="btn ghost small" id="zaDoi">Đổi mã lấy token</button>'
      + ' <span class="help">Token Zalo sống 1 giờ; app tự làm mới và cất bản mới vào kho khoá.</span></div>'
      + '<div class="acc-list">'
      + (c.zalo.oas || []).map((o) => '<div class="acc"><span class="grow">'
        + esc(o.name || o.oaId) + '<span class="muted"> · ' + esc(o.oaId) + '</span></span></div>').join('')
      + '</div></div></div>'

      /* --- lịch --- */
      + '<div class="kn-block"><header><strong>Chạy tự động</strong></header><div class="body">'
      + '<div class="kn-row"><label>Mỗi mấy giờ</label>'
      + '<input type="number" id="dbGio" value="' + (c.dongBo.moiSoGio || 0) + '" min="0" max="24"></div>'
      + '<div class="kn-row"><label>Quét lại mấy ngày</label>'
      + '<input type="number" id="dbLui" value="' + (c.dongBo.soNgayLui || 7) + '" min="1" max="90"></div>'
      + '<div class="help">Số liệu social còn chạy tiếp vài ngày sau khi đăng, nên mỗi lượt '
      + 'quét lại vài ngày gần đây là cần — không phải chạy thừa.</div>'
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
          },
        });
        await goiJSON('/api/ket-noi', {
          khoi: 'dongBo',
          giaTri: { moiSoGio: Number($('#dbGio').value) || 0, soNgayLui: Number($('#dbLui').value) || 7 },
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

  /* ---------------- vẽ ---------------- */
  function ve() {
    if (!S.du) return;
    try {
      if (S.tab === 'tong-quan') return veTongQuan();
      if (S.tab === 'kenh') return veKenh();
      if (S.tab === 'bai') return veBai();
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
    dungBoLoc();
    dongBoInput();
    dungTabs();

    try {
      const me = await goi('/api/me');
      S.me = me.user; S.quanLy = me.quanLy;
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
