/* Giao diện app Chỉnh ảnh & Edit video. Thuần DOM, không framework — cùng lối với
   sáu app kia của phòng, để ai sửa được app này thì sửa được cả bảy. */
(function () {
  'use strict';

  /* ---------------- tiện ích ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('vi-VN');
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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
    /* Chạy trong khung nhúng của Marketing Hub thì cửa sổ chỉ nổi trong khung —
     * nhờ lớp vỏ tối cả panel để nó nổi trên toàn giao diện. */
    try { if (window.__HUB__) window.__HUB__.che(true); } catch (_) {}
  }
  const dongModal = () => {
    $('#modalWrap').hidden = true;
    $('#modal').innerHTML = '';
    try { if (window.__HUB__) window.__HUB__.che(false); } catch (_) {}
  };
  $('#modalWrap').addEventListener('click', (e) => { if (e.target.id === 'modalWrap') dongModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    /* Esc đóng khung gợi ý danh bạ trước, chỉ khi không có khung nào mới đóng modal —
     * không thì đang chọn người mà bấm Esc là văng luôn cả cửa sổ. */
    if (S.goiY) { datGoiY(null); return; }
    dongModal();
  });

  /* ---------------- trạng thái ---------------- */
  const S = {
    tab: 'bao-cao',
    tu: '', den: '',
    tour: '', trangThai: '', hangMuc: '', q: '', chiToi: false,
    meta: null,
    ds: [], tong: null,
    /* Hàng đợi nghiệm thu: KHÔNG dùng chung S.ds vì S.ds bị bộ lọc thời gian cắt
     * (mặc định 30 ngày). Lô chờ nghiệm thu từ tháng trước vẫn phải hiện ra, nếu
     * không nó nằm đó mãi mà không ai thấy. */
    hangDoi: [], dangNT: '',
    /* Bản nháp của biểu mẫu báo cáo. Giữ ngoài DOM vì mỗi lần vẽ lại danh sách
     * Tour (Làm mới) là DOM bị dựng lại — không giữ thì người đang gõ mất nội dung.
     *
     * MỘT LẦN BÁO CÁO = NHIỀU MỤC: một buổi có mấy thư mục, khác Tour hoặc khác
     * Ghép/VIP, và có thể do người khác chỉnh. Nên `muc` là mảng, và người chỉnh
     * nằm TRONG từng mục chứ không gộp lên đầu. */
    form: { gui: true, muc: [] },
    /* id → tên, để hiện chip người chỉnh mà không phải gọi lại danh bạ. */
    tenNguoi: {},
    /* Gợi ý danh bạ đang mở của mục nào: { i, ds } */
    goiY: null,
    dangGui: false,
  };

  /** Một mục trắng. Kế thừa Tour / Loại / ngày / người của mục trước — thêm mục
   *  thứ hai trong cùng buổi thì thường chỉ khác cái link. */
  function mucMoi(truoc) {
    const t = truoc || {};
    return {
      tourId: t.tourId || '',
      loai: t.loai || 'Ghép',
      ngay: t.ngay || (S.meta ? S.meta.homNay : ''),
      hangMuc: (t.hangMuc || ['Chỉnh ảnh']).slice(),
      nguoiIds: (t.nguoiIds || []).slice(),
      linkAnh: '', linkVideo: '', soAnh: '', soVideo: '', ghiChu: '',
    };
  }

  const homNay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  function themNgay(k, d) {
    const [y, m, dd] = String(k).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
  }
  const ngayGon = (k) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k || ''));
    return m ? m[3] + '.' + m[2] : String(k || '—');
  };

  /* ---------------- bộ lọc thời gian dùng chung với lớp vỏ ----------------
   * Cùng hợp đồng như bốn app kia (xem shim trong lark-mkt-hub/proxy.js):
   *   window.hubApKhoang(tu, den)  — lớp vỏ gửi khoảng xuống
   *   window.hubBaoKhoang(tu, den) — module báo lên khi NGƯỜI DÙNG tự đổi
   * Chạy một mình thì giữ bộ mốc riêng.
   */
  const duoiHub = () => Boolean(window.HUB_LOC && window.__HUB__);

  function mocLoc() {
    if (duoiHub()) {
      return window.HUB_LOC.danhSachTheoVai(window.__HUB__.quanLy)
        .map((x) => ({ k: x.tu + '|' + x.den, ten: x.ten, tu: x.tu, den: x.den }));
    }
    const den = homNay();
    return [
      { ten: 'Hôm nay', tu: den, den },
      { ten: '7 ngày', tu: themNgay(den, -6), den },
      { ten: '30 ngày', tu: themNgay(den, -29), den },
      { ten: 'Tháng này', tu: den.slice(0, 8) + '01', den },
    ].map((x) => ({ ...x, k: x.tu + '|' + x.den }));
  }

  function baoHub() {
    if (typeof window.hubBaoKhoang === 'function') {
      try { window.hubBaoKhoang(S.tu, S.den); } catch (_) {}
    }
  }

  window.hubApKhoang = function (tu, den) {
    const t = den || homNay();
    S.den = t;
    S.tu = tu || themNgay(t, -29);
    if (S.tab === 'san-pham') napDs();
  };

  /* ---------------- tab ---------------- */
  /* Tab Nghiệm thu chỉ hiện với quản lý: nhân sự vào đó cũng không làm được gì
   * (server chặn), mà thấy một tab bấm vào là lỗi 403 thì rất khó hiểu. */
  const TABS = () => [
    { k: 'bao-cao', ten: 'Báo cáo' },
    { k: 'san-pham', ten: 'Sản phẩm đã làm' },
    ...(S.meta && S.meta.quanLy ? [{ k: 'nghiem-thu', ten: 'Nghiệm thu' }] : []),
    { k: 'cai-dat', ten: 'Cài đặt' },
  ];

  function veTabs() {
    $('#tabs').innerHTML = TABS().map((t) => {
      /* Con số trên tab là thứ CẦN người ta quay lại làm: việc bị trả về sửa (của
       * mình) và hàng đợi chờ nghiệm thu (của quản lý). Không được để nó nằm im
       * trong danh sách. */
      const n = t.k === 'san-pham' ? soCanSua()
        : (t.k === 'nghiem-thu' ? S.hangDoi.length : 0);
      return '<button class="tab' + (S.tab === t.k ? ' on' : '') + '" data-k="' + t.k + '">'
        + esc(t.ten) + (n ? '<span class="badge">' + n + '</span>' : '') + '</button>';
    }).join('');
    $('#tabs').onclick = (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      S.tab = b.dataset.k;
      location.hash = '#/' + S.tab;
      veTabs();
      ve();
      if (S.tab === 'san-pham' && !S.ds.length) napDs();
      if (S.tab === 'nghiem-thu') napHangDoi();
      if (S.tab === 'bao-cao') dongBoTour();
      if (S.tab === 'cai-dat') dongBoTour();
    };
  }

  const soCanSua = () => (S.ds || []).filter((b) => b.trangThai === 'Cần sửa lại'
    && (!S.meta || !S.meta.user || b.nguoiLam.some((u) => u.id === S.meta.user.id))).length;

  /* ---------------- nạp ---------------- */
  async function napMeta(moi) {
    S.meta = await goi('/api/meta' + (moi ? '?moi=1' : ''));
    const u = S.meta.user;
    $('#meChip').textContent = u ? (u.name + (S.meta.quanLy ? ' · quản lý' : '')) : 'chưa rõ người dùng';
    $('#linkBase').href = S.meta.baseUrl;
    (S.meta.people || []).forEach((x) => { S.tenNguoi[x.id] = x.ten; });
    if (u) S.tenNguoi[u.id] = u.name;
    if (!S.form.muc.length) {
      const m = mucMoi();
      /* Người chỉnh mặc định là chính người đang mở app — trường hợp thường gặp
       * nhất, và không bao giờ để báo cáo vô chủ. */
      if (u) m.nguoiIds = [u.id];
      S.form.muc = [m];
    }
    capNhatPhu();
  }

  function capNhatPhu() {
    const m = S.meta || {};
    const t = S.tong;
    $('#brandSub').textContent = t
      ? `${n0(t.soBaoCao)} lô · ${n0(t.soAnh)} ảnh · ${n0(t.soVideo)} video · nhóm ${(m.nhom || {}).ten || '—'}`
      : `nhóm nhận báo cáo: ${(m.nhom || {}).ten || 'chưa chọn'}`;
  }

  async function napDs() {
    const q = new URLSearchParams({ tu: S.tu, den: S.den });
    if (S.tour) q.set('tour', S.tour);
    if (S.trangThai) q.set('trangThai', S.trangThai);
    if (S.hangMuc) q.set('hangMuc', S.hangMuc);
    if (S.q) q.set('q', S.q);
    if (S.chiToi && S.meta && S.meta.user) q.set('nguoi', S.meta.user.id);
    const r = await goi('/api/bao-cao?' + q.toString());
    S.ds = r.baoCao;
    S.tong = r.tong;
    veTabs();
    capNhatPhu();
    if (S.tab === 'san-pham') ve();
  }

  /**
   * Đọc lại danh mục Tour từ Base và cập nhật combobox nếu nó đã đổi.
   *
   * Vì sao cần: anh Hùng thêm/bớt Tour ngay trong Base, nhưng app chỉ đọc danh mục
   * MỘT LẦN lúc mở trang — thêm Tour xong quay lại tab thì combobox vẫn là bản cũ,
   * trông như app không đồng bộ. Gọi ở mỗi lần vào tab Báo cáo.
   *
   * Gọi KHÔNG kèm ?moi=1: server đã có cache 45 giây, nên bấm qua lại giữa các tab
   * không biến thành một lượt đọc cả Base mỗi lần.
   *
   * Chỉ vẽ lại khi danh mục THẬT SỰ đổi — vẽ lại vô cớ là xoá mất con trỏ và nội
   * dung người dùng đang gõ dở.
   */
  const vanTayTour = (m) => ((m && m.toursAll) || [])
    .map((t) => t.id + '·' + t.ten + '·' + (t.dung ? 1 : 0)).join('|');

  async function dongBoTour() {
    const truoc = vanTayTour(S.meta);
    try { await napMeta(); } catch (_) { return; }
    if (vanTayTour(S.meta) === truoc) return;

    /* Tour đang chọn có thể vừa bị xoá hoặc tắt trong Base. Im lặng bỏ nó là người
     * dùng bấm Báo cáo mới biết; nói ra ngay thì họ chọn lại được. */
    const mat = S.form.muc.filter((m) => m.tourId && !tourCua(m)).length;
    if (S.tab === 'bao-cao') veForm();
    toast(mat
      ? 'Danh mục Tour vừa đổi — ' + mat + ' mục mất Tour đã chọn, chọn lại giúp em.'
      : 'Danh mục Tour vừa đổi, đã cập nhật.', mat ? 'err' : 'ok');
  }

  /** Hàng đợi nghiệm thu — lấy TOÀN BỘ lô chờ, không theo bộ lọc thời gian. */
  async function napHangDoi() {
    if (!(S.meta && S.meta.quanLy)) return;
    try {
      const r = await goi('/api/bao-cao?tu=2000-01-01&den=2999-12-31'
        + '&trangThai=' + encodeURIComponent('Chờ nghiệm thu'));
      S.hangDoi = r.baoCao;
      veTabs();
      if (S.tab === 'nghiem-thu') ve();
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------------- vẽ ---------------- */
  function ve() {
    if (S.tab === 'bao-cao') return veForm();
    if (S.tab === 'san-pham') return veDs();
    if (S.tab === 'nghiem-thu') return veNghiemThu();
    return veCaiDat();
  }

  /* ===== tab Báo cáo ===== */
  const dsTour = () => (S.meta && S.meta.tours) || [];
  const tourCua = (m) => dsTour().find((t) => t.id === m.tourId) || null;

  function tenThuMuc(m) {
    const t = tourCua(m);
    const k = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m.ngay || '');
    const ng = k ? k[3] + '.' + k[2] + '.' + k[1] : '';
    return [t ? t.ten : '', m.loai, ng].filter(Boolean).join(' · ');
  }

  /** Lô đã có báo cáo chưa — để nói trước là sẽ CẬP NHẬT chứ không tạo dòng mới. */
  function loTrung(m) {
    const t = tourCua(m);
    if (!t || !m.ngay) return null;
    return (S.ds || []).find((b) => b.tour === t.ten && b.loai === m.loai
      && b.ngay === m.ngay) || null;
  }

  /** Hai mục trong cùng lần bấm mà cùng Tour + Loại + ngày thì mục sau đè mục
   *  trước trên Base. Chặn ở giao diện luôn, đừng để server báo lỗi mới biết. */
  function mucTrungNhau() {
    const thay = new Map();
    const ra = [];
    S.form.muc.forEach((m, i) => {
      const t = tourCua(m);
      if (!t || !m.ngay) return;
      const k = t.ten + '|' + m.loai + '|' + m.ngay;
      if (thay.has(k)) ra.push([i, thay.get(k)]);
      else thay.set(k, i);
    });
    return ra;
  }

  function veForm() {
    const m0 = S.meta || {};
    const trung = mucTrungNhau();
    const tong = S.form.muc.reduce((a, m) => ({
      anh: a.anh + (Number(m.soAnh) || 0),
      video: a.video + (Number(m.soVideo) || 0),
    }), { anh: 0, video: 0 });

    $('#view').innerHTML = `
    <div class="grid g-2-1">
      <div class="card">
        <div class="card-head">
          <h3>Báo cáo sản phẩm</h3>
          <span class="sub">${n0(S.form.muc.length)} mục${tong.anh ? ' · ' + n0(tong.anh) + ' ảnh' : ''}${tong.video ? ' · ' + n0(tong.video) + ' video' : ''}</span>
        </div>
        <div class="card-body">
          <div id="dsMuc">${S.form.muc.map((m, i) => veMuc(m, i)).join('')}</div>

          ${trung.length ? `<div class="note">Mục ${trung.map(([a, b]) => (a + 1) + ' trùng mục ' + (b + 1)).join('; ')} — cùng Tour, Loại và ngày. Gộp link vào một mục, hoặc đổi Loại/ngày.</div>` : ''}

          <div class="them-muc">
            <button class="btn ghost" id="btnThemMuc">Thêm mục</button>
          </div>

          <div class="sticky-actions">
            <label class="oGui"><input type="checkbox" id="fGui"${S.form.gui ? ' checked' : ''}> Gửi tin về nhóm ${esc((m0.nhom || {}).ten || '—')}</label>
            <button class="btn primary" id="btnGui"${S.dangGui ? ' disabled' : ''}>${S.dangGui ? 'Đang gửi…' : 'Báo cáo ' + n0(S.form.muc.length) + ' mục'}</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Của tôi gần đây</h3></div>
        <div class="card-body tight" id="cuaToi">${veCuaToi()}</div>
      </div>
    </div>`;

    gan();
  }

  function veMuc(m, i) {
    const mt = S.meta || {};
    const canAnh = m.hangMuc.includes('Chỉnh ảnh');
    const canVideo = m.hangMuc.includes('Edit video');
    const cu = loTrung(m);
    const ten = tenThuMuc(m);

    return `<section class="muc" data-i="${i}">
      <div class="muc-dau">
        <span class="muc-so">${i + 1}</span>
        <span class="muc-ten">${esc(ten || 'chưa đủ Tour và ngày')}</span>
        ${S.form.muc.length > 1 ? `<button class="btn ghost small" data-xoa="${i}">Xoá mục</button>` : ''}
      </div>

      <div class="form-grid">
        <div class="field">
          <label>Tour</label>
          <select data-f="tourId">
            <option value="">— chọn Tour —</option>
            ${dsTour().map((t) => `<option value="${esc(t.id)}"${t.id === m.tourId ? ' selected' : ''}>${esc(t.ten)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Loại</label>
          <div class="seg" data-f="loai">
            ${(mt.loai || []).map((x) => `<button data-v="${esc(x)}"${x === m.loai ? ' class="on"' : ''}>${esc(x)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Ngày tác nghiệp</label>
          <input type="date" data-f="ngay" value="${esc(m.ngay)}">
        </div>
        <div class="field">
          <label>Hạng mục</label>
          <div class="pills" data-f="hangMuc">
            ${(mt.hangMuc || []).map((x) => `<button class="pill${m.hangMuc.includes(x) ? ' on' : ''}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}
          </div>
        </div>

        <div class="field full"${canAnh ? '' : ' hidden'}>
          <label>Link thư mục ảnh (Google Photos)</label>
          <input data-f="linkAnh" value="${esc(m.linkAnh)}" placeholder="https://photos.app.goo.gl/…" autocomplete="off">
        </div>
        <div class="field full"${canVideo ? '' : ' hidden'}>
          <label>Link thư mục video (Google Drive)</label>
          <input data-f="linkVideo" value="${esc(m.linkVideo)}" placeholder="https://drive.google.com/drive/folders/…" autocomplete="off">
        </div>

        <div class="field">
          <label>Số ảnh</label>
          <input type="number" min="0" data-f="soAnh" value="${esc(m.soAnh)}"${canAnh ? '' : ' disabled'}>
        </div>
        <div class="field">
          <label>Số video</label>
          <input type="number" min="0" data-f="soVideo" value="${esc(m.soVideo)}"${canVideo ? '' : ' disabled'}>
        </div>

        <div class="field full">
          <label>Người chỉnh</label>
          ${veChonNguoi(m, i)}
        </div>

        <div class="field full">
          <label>Ghi chú</label>
          <input data-f="ghiChu" value="${esc(m.ghiChu)}" placeholder="">
        </div>
      </div>

      ${cu ? `<div class="note info"><div>Lô này đã có báo cáo ${esc(cu.daGui ? 'và đã gửi nhóm' : 'nhưng chưa gửi nhóm')} — bấm Báo cáo sẽ cập nhật dòng đó, không tạo dòng mới.</div></div>` : ''}
    </section>`;
  }

  /**
   * Ô chọn người chỉnh của MỘT mục: chip + ô tìm trong danh bạ Lark.
   *
   * Khung gợi ý LUÔN nằm sẵn trong DOM (rỗng + hidden), chỉ đổi ruột bằng veGoiY().
   * Trước đây mỗi lần có kết quả là dựng lại cả khối này, tức là thay luôn thẻ
   * <input> đang gõ — phải nhét lại giá trị rồi focus(), mà focus() đẩy con trỏ về
   * cuối. Sửa giữa chuỗi là con trỏ nhảy. Giờ ô input không bao giờ bị thay.
   */
  function veChonNguoi(m, i) {
    const chip = m.nguoiIds.map((id) => `<span class="ng-chip">${esc(S.tenNguoi[id] || id)}<button data-bo="${esc(id)}" title="Bỏ">×</button></span>`).join('');
    return `<div class="chon-nguoi">
      <div class="ng-chips">${chip || '<span class="ng-trong">chưa chọn ai</span>'}</div>
      <input data-nguoi="${i}" placeholder="gõ tên để tìm trong danh bạ Lark" autocomplete="off">
      <div class="ng-goiy" data-goiy="${i}" hidden></div>
    </div>`;
  }

  /** Đổi ruột khung gợi ý của mục i. Không đụng tới ô input. */
  function veGoiY(i) {
    const o = $(`[data-goiy="${i}"]`);
    if (!o) return;
    const g = S.goiY && S.goiY.i === i ? S.goiY : null;
    if (!g) { o.hidden = true; o.innerHTML = ''; return; }
    o.hidden = false;
    if (g.dangTim) { o.innerHTML = '<div class="ng-trong">đang tìm…</div>'; return; }
    if (g.loi) { o.innerHTML = '<div class="ng-trong canh">' + esc(g.loi) + '</div>'; return; }
    o.innerHTML = g.ds.length
      ? g.ds.map((x) => `<button data-them="${esc(x.id)}" data-ten="${esc(x.ten)}">${esc(x.ten)}${x.phong ? ' <span class="ng-phong">' + esc(x.phong) + '</span>' : ''}</button>`).join('')
      : '<div class="ng-trong">không thấy ai khớp</div>';
  }

  /**
   * Đặt trạng thái gợi ý và vẽ lại ĐÚNG những khung bị ảnh hưởng.
   *
   * Phải vẽ lại cả khung CŨ: mở gợi ý ở mục 1 rồi sang gõ mục 2 thì khung của mục 1
   * còn treo đó. Và khi xoá sạch ô tìm, trước đây chỉ gán S.goiY = null mà không vẽ
   * lại — nên dòng "không thấy ai khớp" nằm lì trên màn hình dù ô đã trống. Đó đúng
   * là cái anh Hùng chụp lại.
   */
  function datGoiY(g) {
    const cu = S.goiY ? S.goiY.i : -1;
    S.goiY = g;
    if (cu >= 0 && (!g || g.i !== cu)) veGoiY(cu);
    if (g) veGoiY(g.i);
  }

  function veCuaToi() {
    const me = (S.meta && S.meta.user) || null;
    const ds = (S.ds || []).filter((b) => !me || b.nguoiLam.some((u) => u.id === me.id)).slice(0, 12);
    if (!ds.length) return '<div class="empty">Chưa có báo cáo nào trong khoảng đang lọc.</div>';
    return '<ul class="mini-list">' + ds.map((b) => `<li>
      <div class="ml-top"><span class="ml-ten">${esc(b.thuMuc)}</span>${tagTrangThai(b)}</div>
      <div class="ml-duoi">${esc(ngayGon(b.ngay))} · ${esc(b.hangMuc.join(' · ') || '—')}${b.soAnh ? ' · ' + n0(b.soAnh) + ' ảnh' : ''}${b.soVideo ? ' · ' + n0(b.soVideo) + ' video' : ''}${b.daGui ? '' : ' · <span class="canh">chưa gửi nhóm</span>'}</div>
      ${b.trangThai === 'Cần sửa lại' && b.nhanXet ? '<div class="ml-nx">' + esc(b.nhanXet) + '</div>' : ''}
    </li>`).join('') + '</ul>';
  }

  const tagTrangThai = (b) => {
    const lop = b.trangThai === 'Đạt' ? 'good' : (b.trangThai === 'Cần sửa lại' ? 'bad' : 'warn');
    return '<span class="tag ' + lop + '">' + esc(b.trangThai) + '</span>';
  };

  /**
   * Gắn sự kiện cho biểu mẫu.
   *
   * Dùng UỶ QUYỀN trên #dsMuc thay vì gắn cho từng ô: có N mục × 10 ô, gắn từng
   * cái thì mỗi lần vẽ lại là hàng trăm listener. Và quan trọng hơn — ô CHỮ chỉ
   * ghi vào state, KHÔNG vẽ lại; vẽ lại giữa lúc đang gõ là mất con trỏ.
   */
  function gan() {
    const ds = $('#dsMuc');

    const chiSo = (el) => {
      const s2 = el.closest('.muc');
      return s2 ? Number(s2.dataset.i) : -1;
    };

    ds.addEventListener('input', (e) => {
      const el = e.target;
      const i = chiSo(el);
      if (i < 0) return;
      const m = S.form.muc[i];
      if (!m) return;

      if (el.dataset.nguoi != null) { timNguoi(i, el.value); return; }
      const f = el.dataset.f;
      if (!f) return;
      m[f] = el.value;
      /* Số ảnh/số video đổi thì dòng tổng ở đầu thẻ phải đổi theo, nhưng KHÔNG
       * vẽ lại cả biểu mẫu — chỉ sửa đúng chỗ đó. */
      if (f === 'soAnh' || f === 'soVideo') capNhatTong();
    });

    ds.addEventListener('change', (e) => {
      const el = e.target;
      const i = chiSo(el);
      if (i < 0) return;
      const f = el.dataset.f;
      if (f === 'tourId' || f === 'ngay') {
        S.form.muc[i][f] = el.value;
        veForm();
      }
    });

    ds.addEventListener('click', (e) => {
      const el = e.target;
      const i = chiSo(el);

      const xoa = el.closest('[data-xoa]');
      if (xoa) {
        S.form.muc.splice(Number(xoa.dataset.xoa), 1);
        S.goiY = null;
        veForm();
        return;
      }

      const bo = el.closest('[data-bo]');
      if (bo && i >= 0) {
        const m = S.form.muc[i];
        m.nguoiIds = m.nguoiIds.filter((x) => x !== bo.dataset.bo);
        S.goiY = null;
        veForm();
        return;
      }

      const them = el.closest('[data-them]');
      if (them && i >= 0) {
        const m = S.form.muc[i];
        const id = them.dataset.them;
        S.tenNguoi[id] = them.dataset.ten;
        if (!m.nguoiIds.includes(id)) m.nguoiIds.push(id);
        lanTim[i] = (lanTim[i] || 0) + 1;   // huỷ lượt tra đang bay, khỏi mở lại khung
        S.goiY = null;
        veForm();
        return;
      }

      if (i < 0) return;
      const m = S.form.muc[i];
      const seg = el.closest('[data-f="loai"] button');
      if (seg) { m.loai = seg.dataset.v; veForm(); return; }

      const pill = el.closest('[data-f="hangMuc"] .pill');
      if (pill) {
        const v = pill.dataset.v;
        const k = m.hangMuc.indexOf(v);
        if (k >= 0) m.hangMuc.splice(k, 1); else m.hangMuc.push(v);
        /* Không cho bỏ hết: mục không có hạng mục nào thì server chặn, thà chặn
         * ngay ở đây còn hơn để người ta bấm Báo cáo rồi mới ăn lỗi. */
        if (!m.hangMuc.length) m.hangMuc = [v];
        veForm();
      }
    });

    $('#btnThemMuc').onclick = () => {
      if (S.form.muc.length >= 20) return toast('Một lần báo cáo tối đa 20 mục.', 'err');
      S.form.muc.push(mucMoi(S.form.muc[S.form.muc.length - 1]));
      S.goiY = null;
      veForm();
      /* Cuộn tới mục mới, không thì bấm Thêm mục xong không thấy gì xảy ra. */
      const els = $$('#dsMuc .muc');
      if (els.length) els[els.length - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    $('#fGui').onchange = (e) => { S.form.gui = e.target.checked; };
    $('#btnGui').onclick = guiBaoCao;
  }

  function capNhatTong() {
    const tong = S.form.muc.reduce((a, m) => ({
      anh: a.anh + (Number(m.soAnh) || 0),
      video: a.video + (Number(m.soVideo) || 0),
    }), { anh: 0, video: 0 });
    const el = $('.card-head .sub');
    if (el) {
      el.textContent = n0(S.form.muc.length) + ' mục'
        + (tong.anh ? ' · ' + n0(tong.anh) + ' ảnh' : '')
        + (tong.video ? ' · ' + n0(tong.video) + ' video' : '');
    }
  }

  /* ---- tìm người trong danh bạ ---- */
  const hen = {};
  /* Đếm lượt gõ của TỪNG mục. Một lượt tra danh bạ mất ~0,7 giây (lark-cli phải bật
   * một tiến trình Node), nên gõ nhanh là có hai lượt cùng bay; lượt cũ về sau sẽ
   * đè kết quả của lượt mới. Chỉ nhận kết quả của lượt gõ MỚI NHẤT. */
  const lanTim = {};

  async function timNguoi(i, q) {
    clearTimeout(hen['n' + i]);
    const tu = String(q || '').trim();
    if (!tu) { datGoiY(null); return; }

    /* Hiện "đang tìm…" NGAY, đừng đợi. Gõ xong mà cả giây không có gì nhúc nhích
     * thì người dùng kết luận là hỏng — đúng như anh Hùng vừa gặp. */
    datGoiY({ i, dangTim: true, ds: [] });

    const lan = (lanTim[i] = (lanTim[i] || 0) + 1);
    hen['n' + i] = setTimeout(async () => {
      try {
        const r = await goi('/api/nhan-su?q=' + encodeURIComponent(tu));
        if (lan !== lanTim[i]) return;           // đã có lượt gõ mới
        datGoiY({ i, ds: r.nguoi.slice(0, 8) });
      } catch (e) {
        if (lan === lanTim[i]) datGoiY({ i, ds: [], loi: e.message });
      }
    }, 280);
  }

  /* ---- gửi ---- */
  async function guiBaoCao() {
    const f = S.form;
    if (!f.muc.length) return toast('Chưa có mục nào.', 'err');

    const trung = mucTrungNhau();
    if (trung.length) {
      return toast('Mục ' + trung.map(([a, b]) => (a + 1) + ' trùng mục ' + (b + 1)).join('; ')
        + ' — cùng Tour, Loại và ngày.', 'err');
    }

    for (let i = 0; i < f.muc.length; i++) {
      const m = f.muc[i];
      const o = 'Mục ' + (i + 1) + ': ';
      if (!tourCua(m)) return toast(o + 'chọn Tour trước.', 'err');
      if (!m.ngay) return toast(o + 'chọn ngày tác nghiệp.', 'err');
      if (m.hangMuc.includes('Chỉnh ảnh') && !/^https?:\/\//i.test(String(m.linkAnh).trim())) {
        return toast(o + 'thiếu link thư mục ảnh.', 'err');
      }
      if (m.hangMuc.includes('Edit video') && !/^https?:\/\//i.test(String(m.linkVideo).trim())) {
        return toast(o + 'thiếu link thư mục video.', 'err');
      }
    }

    S.dangGui = true; veForm();
    try {
      const r = await goiJSON('/api/bao-cao', {
        gui: f.gui,
        muc: f.muc.map((m) => ({
          tourId: m.tourId, loai: m.loai, ngay: m.ngay, hangMuc: m.hangMuc,
          linkAnh: String(m.linkAnh).trim(), linkVideo: String(m.linkVideo).trim(),
          soAnh: m.soAnh, soVideo: m.soVideo, ghiChu: m.ghiChu,
          nguoiLamIds: m.nguoiIds, thuMuc: tenThuMuc(m),
        })),
      });

      const cu = r.soMuc - r.soMoi;
      const noi = r.soMoi
        ? ('Đã ghi ' + r.soMoi + ' lô mới' + (cu ? ' và cập nhật ' + cu + ' lô cũ' : ''))
        : ('Đã cập nhật ' + cu + ' lô cũ');
      if (f.gui && r.gui.ok) toast(noi + ', đã gửi nhóm ' + r.nhom.ten + '.');
      else if (f.gui) toast(noi + ', nhưng KHÔNG gửi được nhóm: ' + r.gui.loi, 'err');
      else toast(noi + ' (không gửi nhóm).');
      if (r.gui.canhBao) toast(r.gui.canhBao, 'err');

      /* Giữ lại MỘT mục trắng kế thừa mục cuối (Tour, Loại, ngày, người) — nhân sự
       * thường báo liền mấy lô trong cùng buổi. Xoá link và số lượng vì đó là thứ
       * khác nhau giữa các lô. */
      S.form.muc = [mucMoi(f.muc[f.muc.length - 1])];
      S.goiY = null;
      await napDs();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      S.dangGui = false;
      veForm();
    }
  }

  /* ===== tab Sản phẩm đã làm ===== */
  function veDs() {
    const t = S.tong || { soBaoCao: 0, soAnh: 0, soVideo: 0, choNghiemThu: 0, dat: 0, canSua: 0, chuaGui: 0, theoNguoi: [], theoTour: [] };
    const m = S.meta || {};
    const moc = mocLoc();
    const dang = S.tu + '|' + S.den;

    $('#view').innerHTML = `
    <section class="filters">
      <div class="fgroup">
        <label>Khoảng thời gian</label>
        <div class="seg" id="rangeSeg">${moc.map((x) => `<button data-k="${esc(x.k)}"${x.k === dang ? ' class="on"' : ''}>${esc(x.ten)}</button>`).join('')}</div>
      </div>
      <div class="fgroup"><label>Từ ngày</label><input type="date" id="fFrom" value="${esc(S.tu)}"></div>
      <div class="fgroup"><label>Đến ngày</label><input type="date" id="fTo" value="${esc(S.den)}"></div>
      <div class="fgroup">
        <label>Tour</label>
        <select id="lTour"><option value="">Tất cả</option>${(m.toursAll || []).map((x) => `<option${x.ten === S.tour ? ' selected' : ''}>${esc(x.ten)}</option>`).join('')}</select>
      </div>
      <div class="fgroup">
        <label>Trạng thái</label>
        <select id="lTrangThai"><option value="">Tất cả</option>${(m.trangThai || []).map((x) => `<option${x === S.trangThai ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
      </div>
      <div class="fgroup">
        <label>Hạng mục</label>
        <select id="lHangMuc"><option value="">Tất cả</option>${(m.hangMuc || []).map((x) => `<option${x === S.hangMuc ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
      </div>
      <div class="fgroup grow"><label>Tìm</label><input id="lQ" value="${esc(S.q)}" placeholder="tên thư mục, người làm, ghi chú"></div>
      <div class="fgroup"><label>&nbsp;</label><label class="oGui"><input type="checkbox" id="lToi"${S.chiToi ? ' checked' : ''}> Chỉ của tôi</label></div>
    </section>

    <div class="kpis">
      <div class="kpi"><div class="k-label">Lô đã báo</div><div class="k-value">${n0(t.soBaoCao)}</div></div>
      <div class="kpi"><div class="k-label">Ảnh</div><div class="k-value">${n0(t.soAnh)}</div></div>
      <div class="kpi"><div class="k-label">Video</div><div class="k-value">${n0(t.soVideo)}</div></div>
      <div class="kpi"><div class="k-label">Chờ nghiệm thu</div><div class="k-value">${n0(t.choNghiemThu)}</div></div>
      <div class="kpi"><div class="k-label">Cần sửa lại</div><div class="k-value">${n0(t.canSua)}</div></div>
      <div class="kpi"><div class="k-label">Chưa gửi nhóm</div><div class="k-value">${n0(t.chuaGui)}</div></div>
    </div>

    <div class="grid" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><h3>Sản phẩm</h3><span class="sub">${n0(S.ds.length)} lô</span></div>
        <div class="card-body tight"><div class="tbl-wrap">${bangDs()}</div></div>
      </div>
    </div>

    <div class="grid g2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><h3>Theo người làm</h3></div>
        <div class="card-body tight"><div class="tbl-wrap">${bangNguoi(t.theoNguoi)}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Theo Tour</h3></div>
        <div class="card-body tight"><div class="tbl-wrap">${bangTour(t.theoTour)}</div></div>
      </div>
    </div>`;

    ganDs();
  }

  function bangDs() {
    if (!S.ds.length) return '<div class="empty">Không có lô nào khớp bộ lọc.</div>';
    const ql = S.meta && S.meta.quanLy;
    return `<table class="tbl">
      <thead><tr>
        <th class="no-sort">Ngày</th><th class="no-sort">Thư mục</th><th class="no-sort">Hạng mục</th>
        <th class="no-sort num">Ảnh</th><th class="no-sort num">Video</th>
        <th class="no-sort">Người làm</th><th class="no-sort">Trạng thái</th><th class="no-sort">Việc</th>
      </tr></thead>
      <tbody>${S.ds.map((b) => `<tr>
        <td class="mono">${esc(ngayGon(b.ngay))}</td>
        <td class="name">${esc(b.thuMuc)}${b.daGui ? '' : ' <span class="tag warn">chưa gửi</span>'}
          ${b.nhanXet ? '<div class="phu">' + esc(b.nhanXet) + '</div>' : ''}</td>
        <td>${esc(b.hangMuc.join(' · ') || '—')}</td>
        <td class="num">${b.soAnh ? n0(b.soAnh) : '—'}</td>
        <td class="num">${b.soVideo ? n0(b.soVideo) : '—'}</td>
        <td class="name">${esc(b.nguoiLam.map((u) => u.name).join(', ') || '—')}</td>
        <td>${tagTrangThai(b)}</td>
        <td class="viec">
          ${b.linkAnh ? `<a class="btn small ghost" href="${esc(b.linkAnh)}" target="_blank" rel="noreferrer">Ảnh</a>` : ''}
          ${b.linkVideo ? `<a class="btn small ghost" href="${esc(b.linkVideo)}" target="_blank" rel="noreferrer">Video</a>` : ''}
          ${b.daGui ? '' : `<button class="btn small ghost" data-gui="${esc(b.id)}">Gửi nhóm</button>`}
          ${ql ? `<button class="btn small ghost" data-nt="${esc(b.id)}">Nghiệm thu</button>` : ''}
        </td>
      </tr>`).join('')}</tbody></table>`;
  }

  function bangNguoi(ds) {
    if (!ds || !ds.length) return '<div class="empty">Chưa có số liệu.</div>';
    return `<table class="tbl">
      <thead><tr><th class="no-sort">Người</th><th class="no-sort num">Lô</th><th class="no-sort num">Ảnh</th><th class="no-sort num">Video</th><th class="no-sort num">Sửa lại</th></tr></thead>
      <tbody>${ds.map((u) => `<tr>
        <td class="name">${esc(u.ten)}</td>
        <td class="num">${n0(u.lo)}</td><td class="num">${n0(u.anh)}</td>
        <td class="num">${n0(u.video)}</td>
        <td class="num">${u.canSua ? '<span class="tag bad">' + n0(u.canSua) + '</span>' : '—'}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function bangTour(ds) {
    if (!ds || !ds.length) return '<div class="empty">Chưa có số liệu.</div>';
    return `<table class="tbl">
      <thead><tr><th class="no-sort">Tour</th><th class="no-sort num">Lô</th><th class="no-sort num">Ảnh</th><th class="no-sort num">Video</th></tr></thead>
      <tbody>${ds.map((x) => `<tr>
        <td class="name">${esc(x.ten)}</td>
        <td class="num">${n0(x.lo)}</td><td class="num">${n0(x.anh)}</td><td class="num">${n0(x.video)}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function ganDs() {
    $('#rangeSeg').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      [S.tu, S.den] = b.dataset.k.split('|');
      baoHub();
      napDs();
    };
    const doiTay = () => {
      const a = $('#fFrom').value, z = $('#fTo').value;
      if (!a || !z) return;
      S.tu = a; S.den = z; baoHub(); napDs();
    };
    $('#fFrom').onchange = doiTay;
    $('#fTo').onchange = doiTay;
    $('#lTour').onchange = (e) => { S.tour = e.target.value; napDs(); };
    $('#lTrangThai').onchange = (e) => { S.trangThai = e.target.value; napDs(); };
    $('#lHangMuc').onchange = (e) => { S.hangMuc = e.target.value; napDs(); };
    $('#lToi').onchange = (e) => { S.chiToi = e.target.checked; napDs(); };
    let hen = 0;
    $('#lQ').oninput = (e) => {
      S.q = e.target.value;
      clearTimeout(hen);
      hen = setTimeout(napDs, 320);
    };

    $('#view').onclick = async (e) => {
      const g = e.target.closest('[data-gui]');
      if (g) {
        g.disabled = true; g.textContent = 'Đang gửi…';
        try {
          const r = await goiJSON('/api/gui-lai', { id: g.dataset.gui });
          if (r.gui.ok) { toast('Đã gửi nhóm.'); await napDs(); }
          else { toast('Không gửi được: ' + r.gui.loi, 'err'); g.disabled = false; g.textContent = 'Gửi nhóm'; }
        } catch (err) { toast(err.message, 'err'); g.disabled = false; g.textContent = 'Gửi nhóm'; }
        return;
      }
      const nt = e.target.closest('[data-nt]');
      if (nt) moNghiemThu(nt.dataset.nt);
    };
  }

  function moNghiemThu(id) {
    const b = S.ds.find((x) => x.id === id);
    if (!b) return;
    moModal(`
      <div class="modal-head"><h3>Nghiệm thu · ${esc(b.thuMuc)}</h3>
        <button class="btn ghost small" id="mDong">Đóng</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field full">
            <label>Kết quả</label>
            <div class="seg" id="mKq">
              <button data-v="Đạt" class="on">Đạt</button>
              <button data-v="Cần sửa lại">Cần sửa lại</button>
            </div>
          </div>
          <div class="field full">
            <label>Nhận xét</label>
            <textarea id="mNx" placeholder="Trả về sửa thì phải ghi rõ sửa gì"></textarea>
          </div>
        </div>
        <div class="note info">${esc(b.hangMuc.join(' · '))} · ${b.soAnh ? n0(b.soAnh) + ' ảnh' : ''}${b.soVideo ? ' ' + n0(b.soVideo) + ' video' : ''} · ${esc(b.nguoiLam.map((u) => u.name).join(', ') || 'chưa ghi người')}</div>
      </div>
      <div class="modal-foot">
        <label class="oGui"><input type="checkbox" id="mGui" checked> Gửi kết quả về nhóm</label>
        <button class="btn primary" id="mLuu">Lưu nghiệm thu</button>
      </div>`);

    let kq = 'Đạt';
    $('#mKq').onclick = (e) => {
      const x = e.target.closest('button');
      if (!x) return;
      kq = x.dataset.v;
      $$('#mKq button').forEach((y) => y.classList.toggle('on', y === x));
    };
    $('#mDong').onclick = dongModal;
    $('#mLuu').onclick = async () => {
      const nx = $('#mNx').value.trim();
      if (kq === 'Cần sửa lại' && !nx) return toast('Ghi rõ cần sửa gì.', 'err');
      $('#mLuu').disabled = true;
      try {
        const r = await goiJSON('/api/quan-ly/nghiem-thu', {
          id, trangThai: kq, nhanXet: nx, gui: $('#mGui').checked,
        });
        toast('Đã nghiệm thu: ' + kq + (r.gui.ok ? ' · đã báo nhóm' : ''));
        if ($('#mGui').checked && !r.gui.ok) toast('Không gửi được nhóm: ' + r.gui.loi, 'err');
        dongModal();
        await napDs();
      } catch (e2) {
        toast(e2.message, 'err');
        $('#mLuu').disabled = false;
      }
    };
  }

  /* ===== tab Nghiệm thu ===== */
  /**
   * Hàng đợi cho quản lý: mỗi lô một khối, mở thư mục ảnh ra xem rồi bấm Đạt hoặc
   * Cần sửa lại ngay tại đó.
   *
   * Vì sao là một TAB riêng chứ không phải nút trong bảng "Sản phẩm đã làm": xem ảnh
   * là việc làm liên tục nhiều lô một lượt, mà bảng thì bị bộ lọc thời gian cắt và
   * trộn lẫn lô đã duyệt với lô chưa. Ở đây chỉ còn thứ cần quyết.
   */
  function veNghiemThu() {
    const ds = S.hangDoi || [];
    const tongAnh = ds.reduce((a, b) => a + (b.soAnh || 0), 0);
    const tongVideo = ds.reduce((a, b) => a + (b.soVideo || 0), 0);

    $('#view').innerHTML = `
    <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <div class="kpi"><div class="k-label">Chờ nghiệm thu</div><div class="k-value">${n0(ds.length)}</div></div>
      <div class="kpi"><div class="k-label">Ảnh chờ xem</div><div class="k-value">${n0(tongAnh)}</div></div>
      <div class="kpi"><div class="k-label">Video chờ xem</div><div class="k-value">${n0(tongVideo)}</div></div>
    </div>

    <div class="grid" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><h3>Hàng đợi nghiệm thu</h3><span class="sub">cũ nhất trước</span></div>
        <div class="card-body">${ds.length ? veHangDoi(ds) : '<div class="empty">Không còn lô nào chờ nghiệm thu.</div>'}</div>
      </div>
    </div>`;

    ganNghiemThu();
  }

  function veHangDoi(ds) {
    /* Cũ nhất trước: lô để lâu là lô dễ bị quên, phải đẩy lên đầu. */
    const xep = ds.slice().sort((a, b) => String(a.ngay).localeCompare(String(b.ngay)));
    return xep.map((b) => `<section class="nt" data-id="${esc(b.id)}">
      <div class="nt-dau">
        <div class="nt-ten">${esc(b.thuMuc)}</div>
        <div class="nt-phu">${esc(ngayGon(b.ngay))} · ${esc(b.hangMuc.join(' · ') || '—')}${b.soAnh ? ' · ' + n0(b.soAnh) + ' ảnh' : ''}${b.soVideo ? ' · ' + n0(b.soVideo) + ' video' : ''} · ${esc(b.nguoiLam.map((u) => u.name).join(', ') || 'chưa ghi người')}</div>
      </div>
      <div class="nt-link">
        ${b.linkAnh ? `<a class="btn ghost small" href="${esc(b.linkAnh)}" target="_blank" rel="noreferrer">Mở thư mục ảnh</a>` : ''}
        ${b.linkVideo ? `<a class="btn ghost small" href="${esc(b.linkVideo)}" target="_blank" rel="noreferrer">Mở thư mục video</a>` : ''}
        ${b.daGui ? '' : '<span class="tag warn">chưa gửi nhóm</span>'}
      </div>
      <div class="nt-lam">
        <input data-nx="${esc(b.id)}" placeholder="Cần sửa gì? (bắt buộc khi trả về sửa)" autocomplete="off">
        <button class="btn ok" data-dat="${esc(b.id)}">Đạt</button>
        <button class="btn danger" data-sua="${esc(b.id)}">Cần sửa lại</button>
      </div>
    </section>`).join('');
  }

  function ganNghiemThu() {
    const v = $('#view');
    v.onclick = async (e) => {
      const dat = e.target.closest('[data-dat]');
      const sua = e.target.closest('[data-sua]');
      if (!dat && !sua) return;
      const id = (dat || sua).dataset.dat || (dat || sua).dataset.sua;
      const o = $(`.nt[data-id="${id}"]`);
      const nx = (o && $('input[data-nx]', o) ? $('input[data-nx]', o).value : '').trim();

      if (sua && !nx) {
        toast('Ghi rõ cần sửa gì trước khi trả về.', 'err');
        const el = o && $('input[data-nx]', o);
        if (el) el.focus();
        return;
      }
      if (S.dangNT === id) return;
      S.dangNT = id;
      $$('.nt[data-id="' + id + '"] button').forEach((b) => { b.disabled = true; });

      try {
        const r = await goiJSON('/api/quan-ly/nghiem-thu', {
          id, trangThai: dat ? 'Đạt' : 'Cần sửa lại', nhanXet: nx, gui: true,
        });
        toast((dat ? 'Đã duyệt: ' : 'Đã trả về sửa: ') + (r.baoCao ? r.baoCao.thuMuc : '')
          + (r.gui.ok ? ' · đã báo nhóm' : ''));
        if (!r.gui.ok) toast('Không gửi được nhóm: ' + r.gui.loi, 'err');
        /* Bỏ khỏi hàng đợi ngay, không đợi nạp lại — quản lý đang xem liên tục
         * nhiều lô, chờ một vòng gọi Base là mất nhịp. */
        S.hangDoi = S.hangDoi.filter((x) => x.id !== id);
        veTabs();
        ve();
        napDs();
      } catch (err) {
        toast(err.message, 'err');
        $$('.nt[data-id="' + id + '"] button').forEach((b) => { b.disabled = false; });
      } finally {
        S.dangNT = '';
      }
    };
  }

  /* ===== tab Cài đặt ===== */
  function veCaiDat() {
    const m = S.meta || {};
    const ql = m.quanLy;
    $('#view').innerHTML = `
    <div class="grid g-2-1 dinh-tren">
      <div class="card">
        <div class="card-head"><h3>Nhóm chat nhận báo cáo</h3><span class="sub">${esc((m.nhom || {}).ten || '—')}</span></div>
        <div class="card-body">
          ${veNguoiGui(m.nguoiGui)}
          ${ql ? `<div class="field full">
            <label>Chọn nhóm</label>
            <select id="cNhom"><option value="">— đang tải danh sách nhóm —</option></select>
            <div class="hint" id="cNhomId">${esc((m.nhom || {}).id || '')}</div>
          </div>
          <div class="sticky-actions"><button class="btn primary" id="cLuu" disabled>Lưu nhóm</button></div>`
        : '<div class="empty">Chỉ quản lý đổi được nhóm nhận báo cáo.</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Danh mục Tour</h3><span class="sub">${n0((m.toursAll || []).length)} mục · từ Base</span></div>
        <div class="card-body tight">
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th class="no-sort">Tour</th><th class="no-sort">Nhóm</th><th class="no-sort num">Thứ tự</th><th class="no-sort">Dùng</th></tr></thead>
            <tbody>${(m.toursAll || []).map((t) => `<tr>
              <td class="name">${esc(t.ten)}</td><td>${esc(t.nhom || '—')}</td>
              <td class="num">${t.thuTu || '—'}</td>
              <td>${t.dung ? '<span class="tag good">có</span>' : '<span class="tag">tắt</span>'}</td>
            </tr>`).join('')}</tbody></table></div>
          ${ql ? `<div class="sticky-actions">
            <a class="btn ghost" href="${esc(m.baseUrl || '')}" target="_blank" rel="noreferrer">Sửa danh mục trên Base</a>
            <button class="btn ghost" id="cTour">Đọc lại danh mục</button>
          </div>` : ''}
        </div>
      </div>
    </div>`;

    if (ql) napNhom();
    const bt = $('#cTour');
    if (bt) {
      bt.onclick = async () => {
        bt.disabled = true;
        const truoc = vanTayTour(S.meta);
        try {
          /* Nút này ép đọc thẳng Base (?moi=1), bỏ qua cache 45 giây — sửa xong
           * trong Base là muốn thấy ngay, không đợi. */
          await napMeta(true);
          ve();
          toast(vanTayTour(S.meta) === truoc
            ? 'Danh mục không đổi — app đang khớp Base.'
            : 'Đã đọc lại danh mục từ Base.');
        } catch (e) { toast(e.message, 'err'); bt.disabled = false; }
      };
    }
  }

  /** Bot nào đứng tên gửi — và phải mời bot NÀO vào nhóm. */
  function veNguoiGui(g) {
    if (!g) return '';
    const dung = g.qua !== 'cli';
    /* Bọc trong MỘT div: .note là flex container, để text trần thì mỗi thẻ con
     * thành một flex item và cả dòng gãy vụn ra. */
    return `<div class="note ${dung ? 'info' : ''}"><div>
      Tin gửi bằng bot <b>${esc(g.ten)}</b>${g.appId ? ' · <span class="mono">' + esc(g.appId) + '</span>' : ''} — phải mời đúng bot này vào nhóm.
      ${dung ? '' : '<br>Chưa khai <span class="mono">ANH_TIN_APP_SECRET</span> nên đang dùng bot của lark-cli, <b>KHÁC</b> bot <b>' + esc((g.nen || {}).ten || '') + '</b> · <span class="mono">' + esc((g.nen || {}).appId || '') + '</span> mà anh muốn.'}
    </div></div>`;
  }

  async function napNhom() {
    try {
      const r = await goi('/api/quan-ly/nhom');
      const dang = (S.meta.nhom || {}).id;
      const sel = $('#cNhom');
      if (!sel) return;
      sel.innerHTML = r.nhom.map((c) =>
        `<option value="${esc(c.id)}"${c.id === dang ? ' selected' : ''}>${esc(c.ten || c.id)}</option>`).join('');
      $('#cLuu').disabled = false;
      sel.onchange = () => { $('#cNhomId').textContent = sel.value; };
      $('#cLuu').onclick = async () => {
        const ten = sel.options[sel.selectedIndex].textContent;
        $('#cLuu').disabled = true;
        try {
          const kq = await goiJSON('/api/quan-ly/nhom', { id: sel.value, ten });
          S.meta.nhom = kq.nhom;
          toast('Báo cáo sẽ gửi về nhóm ' + kq.nhom.ten + '.');
          capNhatPhu();
        } catch (e) { toast(e.message, 'err'); }
        $('#cLuu').disabled = false;
      };
    } catch (e) {
      const sel = $('#cNhom');
      if (sel) sel.innerHTML = '<option value="">' + esc(e.message) + '</option>';
    }
  }

  /* ---------------- khởi động ---------------- */
  $('#btnRefresh').onclick = async () => {
    try { await napMeta(true); await napDs(); await napHangDoi(); ve(); toast('Đã đọc lại từ Base.'); }
    catch (e) { toast(e.message, 'err'); }
  };

  async function batDau() {
    const t = homNay();
    /* Lớp vỏ đã đẩy khoảng xuống trước khi app.js chạy thì dùng luôn, đỡ một nhịp
     * nhấp nháy; chạy một mình thì mặc định 30 ngày gần nhất. */
    const kh = window.__HUB__ && window.__HUB__.khoang;
    S.den = (kh && kh.den) || t;
    S.tu = (kh && kh.tu) || themNgay(S.den, -29);

    const h = (location.hash || '').replace(/^#\//, '');
    if (['bao-cao', 'san-pham', 'nghiem-thu', 'cai-dat'].includes(h)) S.tab = h;

    try {
      await napMeta();
      veTabs();
      ve();
      await napDs();
      await napHangDoi();
      ve();
    } catch (e) {
      $('#view').innerHTML = '<div class="empty">Không nạp được dữ liệu: ' + esc(e.message) + '</div>';
    }
  }

  batDau();
})();
