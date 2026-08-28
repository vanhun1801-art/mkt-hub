/* ===== Tab "Kết nối & Đồng bộ" — nạp sau app.js, dùng lại helper của app ===== */
'use strict';

(function () {
  const KS = { lastReport: null, csvText: '', csvName: '' };

  const PLAT_OF = { meta: 'Facebook', tiktok: 'TikTok', googleSheet: 'Google Ads' };

  VIEW['ket-noi'] = async (view) => {
    const c = await api('/api/connect');

    const HAN_CLASS = { ok: 'good', warn: 'warn', sapHet: 'warn', het: 'bad' };

    const providerCard = (p) => {
      const dot = !p.sanSang ? 'bad' : p.enabled ? 'good' : 'warn';
      const trangThai = !p.sanSang ? 'Chưa cấu hình' : p.enabled ? 'Đang bật' : 'Đã cấu hình · đang tắt';
      const han = p.hanToken;
      return `<div class="card">
        <div class="card-head">
          <h3>${platTag(PLAT_OF[p.key] || p.label)} ${esc(p.label)}</h3>
          <span class="tag ${dot}">${trangThai}</span>
        </div>
        <div class="card-body">
          ${han && (han.muc === 'het' || han.muc === 'sapHet') ? `<div class="help" style="margin:0 0 12px;border-color:var(--${han.muc === 'het' ? 'bad' : 'warn'});color:var(--${han.muc === 'het' ? 'bad' : 'warn'})">
            <b>${han.muc === 'het' ? 'Token đã hết hạn' : 'Token sắp hết hạn'}</b> — ${esc(han.text)}.
            Chạy <code>node ket-noi.js --meta</code> để lấy token mới.</div>` : ''}
          <div class="stat-row" style="margin-bottom:10px">
            <div><div class="s-label">Token / Link</div><div class="s-value" style="font-size:14px">${p.coToken ? '<span class="tag good">đã có</span>' : '<span class="tag bad">chưa có</span>'}</div></div>
            ${han ? `<div><div class="s-label">Hạn token</div><div class="s-value" style="font-size:13px"><span class="tag ${HAN_CLASS[han.muc] || ''}">${esc(han.text)}</span></div></div>` : ''}
            <div><div class="s-label">Tài khoản</div><div class="s-value" style="font-size:14px">${p.soTaiKhoan ? esc(p.taiKhoan.join(', ')) : '—'}</div></div>
            ${p.chiSoChuyenDoi ? `<div><div class="s-label">Chỉ số chuyển đổi</div><div class="s-value" style="font-size:12.5px">${esc(p.chiSoChuyenDoi)}</div></div>` : ''}
            ${p.capDo ? `<div><div class="s-label">Cấp độ</div><div class="s-value" style="font-size:14px">${esc(p.capDo)}</div></div>` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px">
              <input type="checkbox" data-enable="${p.key}" ${p.enabled ? 'checked' : ''} ${p.sanSang ? '' : 'disabled'}> Bật kênh này
            </label>
            <button class="btn small ghost" data-preview="${p.key}" ${p.sanSang ? '' : 'disabled'}>Xem trước</button>
            <button class="btn small primary" data-sync="${p.key}" ${p.sanSang && p.enabled ? '' : 'disabled'}>Đồng bộ kênh này</button>
          </div>
          ${p.sanSang ? '' : `<div class="help" style="margin:10px 0 0">Điền token/ID vào <b>${esc(c.file)}</b> rồi bấm <b>Kiểm tra kết nối</b>. Xem hướng dẫn từng bước ở <b>ket-noi.mau.json</b>.</div>`}
        </div>
      </div>`;
    };

    const d = c.dongBo;
    view.innerHTML = `
    ${c.fileTonTai ? '' : `<div class="help" style="border-color:var(--bad);color:var(--bad)">
      Chưa có file <b>${esc(c.file)}</b>. Copy <b>ket-noi.mau.json</b> thành <b>${esc(c.file)}</b>, điền token rồi bấm Kiểm tra kết nối.</div>`}

    <div class="help">Đồng bộ luôn ghi lại <b>${d.soNgayLui} ngày gần nhất</b>, không chỉ hôm nay — vì Meta/TikTok/Google còn khai báo lại chuyển đổi trong vài ngày.
    Khoá ghi là (quảng cáo × ngày) nên chạy lại bao nhiêu lần cũng không nhân dòng.
    ${c.hengio.dangBat ? `Hẹn giờ <b>đang bật</b>, lượt kế tiếp khoảng ${c.hengio.lanKeTiep ? new Date(c.hengio.lanKeTiep).toLocaleTimeString('vi-VN') : '—'}.` : 'Hẹn giờ <b>đang tắt</b>.'}</div>

    <div class="grid g3">${c.providers.map(providerCard).join('')}</div>

    <div class="grid g2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><h3>Tuỳ chọn đồng bộ</h3>
          <button class="btn small ghost" id="kTest">Kiểm tra kết nối</button></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="field"><label>Ghi lại bao nhiêu ngày gần nhất</label>
              <input type="number" id="oNgay" min="1" max="90" value="${d.soNgayLui}">
              <span class="hint">7 là hợp lý cho cửa sổ attribution 7 ngày</span></div>
            <div class="field"><label>Tự đồng bộ mỗi (giờ)</label>
              <input type="number" id="oGio" min="0" max="24" value="${d.moiSoGio}">
              <span class="hint">0 = tắt. Chỉ chạy khi app đang mở — muốn chạy nền thì dùng Task Scheduler</span></div>
            <div class="field full"><label>
              <input type="checkbox" id="oKhiKhoiDong" ${d.khiKhoiDong ? 'checked' : ''}> Đồng bộ ngay khi bật server</label></div>
            <div class="field full"><label>
              <input type="checkbox" id="oGhiDe" ${d.ghiDeNhapTay ? 'checked' : ''}> Số từ nền tảng ghi đè lên dòng nhập tay</label>
              <span class="hint">Bật: nền tảng là nguồn đúng. Tắt: giữ nguyên số anh đã gõ, chỉ thêm dòng mới</span></div>
            <div class="field full"><label>
              <input type="checkbox" id="oTaoMoi" ${d.tuTaoMoi ? 'checked' : ''}> Tự tạo chiến dịch / nhóm / quảng cáo chưa có trong Base</label>
              <span class="hint">Nên để TẮT lần đầu, xem trước rồi ghép tay để không nhân đôi dữ liệu cũ</span></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
            <button class="btn primary" id="kSave">Lưu tuỳ chọn</button>
            <button class="btn ghost" id="kPreviewAll">Xem trước tất cả kênh</button>
            <button class="btn primary" id="kSyncAll">⟳ Đồng bộ tất cả kênh đang bật</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Nhập từ file CSV</h3><span class="sub">dùng được ngay, không cần token</span></div>
        <div class="card-body">
          <div class="help">Export báo cáo từ Ads Manager (có cột Ngày + Chi phí + tên quảng cáo), rồi kéo file vào đây. App tự nhận cột theo tên tiếng Việt hoặc tiếng Anh.</div>
          <div class="form-grid">
            <div class="field"><label>Nền tảng của file này</label>
              <select id="cPlat"><option value="Facebook">Facebook</option><option value="TikTok">TikTok</option><option value="Google Ads">Google Ads</option></select></div>
            <div class="field"><label>Cấp độ dòng</label>
              <select id="cLevel"><option value="ad">Từng quảng cáo</option><option value="adgroup">Từng nhóm quảng cáo</option></select></div>
            <div class="field full"><label>Chọn file CSV</label>
              <input type="file" id="cFile" accept=".csv,.tsv,.txt">
              <span class="hint" id="cInfo">Chưa chọn file</span></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn ghost" id="cPreview" disabled>Xem trước</button>
            <button class="btn primary" id="cImport" disabled>Nhập vào Base</button>
          </div>
        </div>
      </div>
    </div>

    <div id="kReport" style="margin-top:14px"></div>

    <div class="card" style="margin-top:14px">
      <div class="card-head"><h3>Ghép ID nền tảng</h3>
        <span class="sub">bản ghi nào chưa có ID sẽ không nhận được số tự động</span></div>
      <div class="card-body tight" id="kMapping"></div>
    </div>

    ${c.lichSu.length ? `<div class="card" style="margin-top:14px">
      <div class="card-head"><h3>Lịch sử trong phiên này</h3></div>
      <div class="card-body tight">${table('kHist', [
        { key: 'luc', label: 'Lúc', render: (r) => new Date(r.luc).toLocaleString('vi-VN') },
        { key: 'loai', label: 'Loại', render: (r) => `<span class="tag ${/xem-truoc/.test(r.loai) ? '' : 'info'}">${esc(r.loai)}</span>` },
        { key: 'kenh', label: 'Kênh', render: (r) => esc((r.kenh || []).join(', ')) },
        { key: 'range', label: 'Khoảng', render: (r) => `${r.from ? dmy(r.from) : '—'} → ${r.to ? dmy(r.to) : '—'}` },
        { key: 'tong', label: 'Kết quả', render: (r) => `+${(r.tong || {}).taoMoi || 0} mới · ~${(r.tong || {}).capNhat || 0} cập nhật` },
        { key: 'loi', label: 'Lỗi', render: (r) => (r.loi && r.loi.length ? `<span class="tag bad">${esc(r.loi.join('; '))}</span>` : '—') },
      ], c.lichSu, { empty: 'Chưa có lượt nào' })}</div>
    </div>` : ''}`;

    renderMapping();
    wire(c);
  };

  /* ---------------- bảng ghép ID ---------------- */
  function renderMapping() {
    const m = S.meta;
    const rows = [
      ...m.campaigns.map((x) => ({ type: 'campaign', loai: 'Chiến dịch', id: x.id, name: x.name, ctx: x.platform, extId: x.extId })),
      ...m.groups.map((x) => ({ type: 'group', loai: 'Nhóm', id: x.id, name: x.name, ctx: (m.campaigns.find((c) => c.id === x.campaignId) || {}).name || '—', extId: x.extId })),
      ...m.ads.map((x) => ({ type: 'ad', loai: 'Quảng cáo', id: x.id, name: x.name, ctx: x.campaignName + ' › ' + x.groupName, extId: x.extId })),
    ];
    const missing = rows.filter((r) => !r.extId).length;
    $('#kMapping').innerHTML = `
      <div class="help" style="margin:14px 14px 0">${missing
        ? `<b>${missing}/${rows.length}</b> bản ghi chưa có ID nền tảng. Lần đồng bộ đầu app sẽ tự khớp theo tên và điền hộ; chỉ những cái tên không khớp/trùng nhau mới cần ghép tay ở đây (dán ID từ Ads Manager).`
        : `Toàn bộ ${rows.length} bản ghi đã có ID nền tảng — đồng bộ sẽ khớp chính xác theo ID.`}</div>
      ${table('kMap', [
        { key: 'loai', label: 'Loại', render: (r) => `<span class="tag">${esc(r.loai)}</span>` },
        { key: 'name', label: 'Tên trong Base', cls: 'name', render: (r) => `<b>${esc(r.name)}</b><span class="sub-line">${esc(r.ctx)}</span>` },
        {
          key: 'extId', label: 'ID nền tảng', noSort: true, render: (r) => `
          <input class="map-in" data-type="${r.type}" data-rec="${r.id}" value="${esc(r.extId || '')}" placeholder="dán ID…" style="min-width:170px;border:1px solid var(--line);border-radius:7px;padding:5px 8px;font:inherit">
          <button class="btn small ghost" data-map-save="${r.id}">Lưu</button>`,
        },
        { key: 'trangThai', label: '', noSort: true, render: (r) => (r.extId ? '<span class="tag good">đã ghép</span>' : '<span class="tag warn">chưa ghép</span>') },
      ], rows, { sort: { key: 'loai', dir: 'asc' } })}`;

    $$('#kMapping [data-map-save]').forEach((b) => b.onclick = async () => {
      const inp = $(`.map-in[data-rec="${b.dataset.mapSave}"]`);
      b.disabled = true;
      try {
        await api('/api/mapping', {
          method: 'POST',
          body: JSON.stringify({ type: inp.dataset.type, recordId: inp.dataset.rec, extId: inp.value.trim() }),
        });
        toast('Đã lưu ID nền tảng', 'ok');
        await loadMeta();
        render();
      } catch (e) { toast(e.message, 'err'); b.disabled = false; }
    });
  }

  /* ---------------- nút bấm ---------------- */
  function wire(c) {
    // bật/tắt kênh
    $$('#view [data-enable]').forEach((cb) => cb.onchange = async () => {
      try {
        await api('/api/connect', { method: 'PUT', body: JSON.stringify({ [cb.dataset.enable]: { enabled: cb.checked } }) });
        toast(`${cb.checked ? 'Đã bật' : 'Đã tắt'} kênh`, 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); }
    });

    $$('#view [data-preview]').forEach((b) => b.onclick = () => runSync({ providers: [b.dataset.preview], dryRun: true }, b));
    $$('#view [data-sync]').forEach((b) => b.onclick = () => {
      if (!confirm('Ghi số từ nền tảng vào Lark Base. Tiếp tục?')) return;
      runSync({ providers: [b.dataset.sync], dryRun: false }, b);
    });
    $('#kPreviewAll').onclick = (e) => runSync({ dryRun: true }, e.target);
    $('#kSyncAll').onclick = (e) => {
      if (!confirm('Đồng bộ mọi kênh đang bật và ghi vào Lark Base. Tiếp tục?')) return;
      runSync({ dryRun: false }, e.target);
    };

    $('#kSave').onclick = async () => {
      try {
        await api('/api/connect', {
          method: 'PUT',
          body: JSON.stringify({
            dongBo: {
              soNgayLui: Number($('#oNgay').value),
              moiSoGio: Number($('#oGio').value),
              khiKhoiDong: $('#oKhiKhoiDong').checked,
              ghiDeNhapTay: $('#oGhiDe').checked,
              tuTaoMoi: $('#oTaoMoi').checked,
            },
          }),
        });
        toast('Đã lưu tuỳ chọn', 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); }
    };

    $('#kTest').onclick = async (e) => {
      const b = e.target; b.disabled = true; b.textContent = 'Đang kiểm tra…';
      try {
        const r = await api('/api/connect/test', { method: 'POST' });
        $('#kReport').innerHTML = `<div class="card"><div class="card-head"><h3>Kết quả kiểm tra kết nối</h3></div>
          <div class="card-body tight">${table('kTestT', [
            { key: 'label', label: 'Kênh' },
            { key: 'ok', label: 'Kết nối', render: (x) => (x.ok ? '<span class="tag good">OK</span>' : `<span class="tag bad">Lỗi</span>`) },
            { key: 'chiTiet', label: 'Chi tiết', cls: 'name', render: (x) => x.ok
              ? esc((x.results || []).map((y) => `${y.account}: ${y.name || 'ok'}${y.currency ? ' · ' + y.currency : ''}${y.khoangNgay ? ' · ' + y.khoangNgay : ''}${y.cotNhanRa ? ' · cột: ' + y.cotNhanRa : ''}`).join(' | ')) || 'ok'
              : `<span style="color:var(--bad)">${esc(x.message || (x.results || []).map((y) => y.message).join('; '))}</span>` },
          ], r.rows)}</div></div>`;
      } catch (e2) { toast(e2.message, 'err'); }
      b.disabled = false; b.textContent = 'Kiểm tra kết nối';
    };

    /* ---- CSV ---- */
    $('#cFile').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        KS.csvText = String(rd.result || '');
        KS.csvName = f.name;
        $('#cInfo').textContent = `${f.name} · ${(f.size / 1024).toFixed(1)} KB · ${KS.csvText.split('\n').length} dòng`;
        $('#cPreview').disabled = false;
        $('#cImport').disabled = false;
      };
      rd.onerror = () => toast('Không đọc được file', 'err');
      rd.readAsText(f, 'utf-8');
    };
    $('#cPreview').onclick = (e) => importCsv(true, e.target);
    $('#cImport').onclick = (e) => {
      if (!confirm(`Nhập "${KS.csvName}" vào Lark Base. Tiếp tục?`)) return;
      importCsv(false, e.target);
    };
  }

  async function importCsv(dryRun, btn) {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = dryRun ? 'Đang đọc…' : 'Đang ghi…';
    try {
      const r = await api('/api/import-csv', {
        method: 'POST',
        body: JSON.stringify({
          text: KS.csvText, platform: $('#cPlat').value, level: $('#cLevel').value, dryRun,
        }),
      });
      showReport({ from: r.khoang && r.khoang.from, to: r.khoang && r.khoang.to, dryRun, ketQua: [r] });
      if (!dryRun) { toast(`Đã nhập: +${r.bangNgay.taoMoi} mới, ~${r.bangNgay.capNhat} cập nhật`, 'ok'); await loadMeta(); }
    } catch (e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = old;
  }

  async function runSync(opts, btn) {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = opts.dryRun ? 'Đang xem trước…' : 'Đang đồng bộ…';
    try {
      const r = await api('/api/sync', { method: 'POST', body: JSON.stringify(opts) });
      showReport(r);
      if (!opts.dryRun) {
        toast(`Đồng bộ xong: +${r.tong.taoMoi} mới, ~${r.tong.capNhat} cập nhật${r.tong.loi ? `, ${r.tong.loi} lỗi` : ''}`, r.tong.loi ? 'err' : 'ok');
        await loadMeta();
      }
    } catch (e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = old;
  }

  /* ---------------- báo cáo ---------------- */
  function showReport(r) {
    KS.lastReport = r;
    const block = (k) => {
      if (!k.ok) return `<div class="card" style="margin-top:12px"><div class="card-head"><h3>${esc(k.label)}</h3>
        <span class="tag bad">Lỗi</span></div><div class="card-body"><b style="color:var(--bad)">${esc(k.loi)}</b>
        ${(k.log || []).length ? `<div class="sub-line">${k.log.map(esc).join('<br>')}</div>` : ''}</div></div>`;

      const cg = k.chuaGhep || {};
      const chuaGhepRows = [
        ...(cg.chienDich || []).map((x) => ({ ...x, loai: 'Chiến dịch' })),
        ...(cg.nhom || []).map((x) => ({ ...x, loai: 'Nhóm' })),
        ...(cg.quangCao || []).map((x) => ({ ...x, loai: 'Quảng cáo' })),
      ];
      return `<div class="card" style="margin-top:12px">
        <div class="card-head">
          <h3>${esc(k.label)} <span class="sub">${k.dryRun ? 'xem trước — chưa ghi gì' : 'đã ghi vào Base'}</span></h3>
          <span class="tag ${k.dryRun ? '' : 'good'}">${k.layDuoc} dòng lấy được</span>
        </div>
        <div class="card-body">
          <div class="stat-row">
            <div><div class="s-label">Dòng tạo mới</div><div class="s-value" style="color:var(--good)">${k.bangNgay.taoMoi}</div></div>
            <div><div class="s-label">Dòng cập nhật</div><div class="s-value" style="color:var(--brand)">${k.bangNgay.capNhat}</div></div>
            <div><div class="s-label">Không đổi</div><div class="s-value">${k.bangNgay.khongDoi}</div></div>
            <div><div class="s-label">Bỏ qua</div><div class="s-value">${k.bangNgay.boQua}</div></div>
            <div><div class="s-label">Khớp theo ID / tên</div><div class="s-value" style="font-size:15px">${k.khop.quangCao.theoId} / ${k.khop.quangCao.theoTen}</div></div>
            ${k.ganIdMoi.length ? `<div><div class="s-label">Gắn ID mới</div><div class="s-value">${k.ganIdMoi.length}</div></div>` : ''}
          </div>

          ${k.columnMap ? `<div class="help">Cột nhận ra: ${esc(Object.entries(k.columnMap).map(([a, b]) => `${a} ← "${b}"`).join(' · '))}
            ${(k.unknownColumns || []).length ? `<br>Cột bỏ qua: ${esc(k.unknownColumns.slice(0, 12).join(', '))}` : ''}</div>` : ''}

          ${(k.actionTypes || []).length ? `<details style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600">
            Các loại chuyển đổi Meta thực có trong kỳ (kiểm tra đang lấy đúng chỉ số chưa)</summary>
            ${table('kAct', [
              { key: 'action_type', label: 'action_type', cls: 'name' },
              { key: 'total', label: 'Tổng', num: true, render: (x) => int(x.total) },
            ], k.actionTypes.slice(0, 15))}</details>` : ''}

          ${(k.xungDotId || []).length ? `<div class="help" style="border-color:var(--bad);color:var(--bad)">
            ${k.xungDotId.length} trường hợp nhiều ID nền tảng cùng đòi gắn vào một bản ghi — đã bỏ qua để không ghi sai:
            ${esc(k.xungDotId.map((x) => x.doiTuong).join(', '))}</div>` : ''}

          ${chuaGhepRows.length ? `<h4 style="margin:14px 0 8px">Chưa ghép được ${chuaGhepRows.length} đối tượng — ${k.dongBoQua} dòng số bị bỏ</h4>
            <div class="help">Ghép tay ở bảng "Ghép ID nền tảng" phía dưới (dán ID vào đúng bản ghi), hoặc bật <b>Tự tạo</b> để app tạo mới.</div>
            ${table('kChua', [
              { key: 'loai', label: 'Loại', render: (x) => `<span class="tag warn">${esc(x.loai)}</span>` },
              { key: 'name', label: 'Tên trên nền tảng', cls: 'name' },
              { key: 'extId', label: 'ID nền tảng', render: (x) => `<code>${esc(x.extId || '—')}</code>` },
              { key: 'chienDich', label: 'Thuộc', cls: 'name', render: (x) => esc([x.chienDich, x.nhom].filter(Boolean).join(' › ') || '—') },
            ], chuaGhepRows.slice(0, 30))}` : ''}

          ${(k.chiTiet.capNhat || []).length ? `<h4 style="margin:14px 0 8px">Số sẽ đổi</h4>
            ${table('kUpd', [
              { key: 'date', label: 'Ngày', render: (x) => dmy(x.date) },
              { key: 'adName', label: 'Quảng cáo', cls: 'name' },
              { key: 'truoc', label: 'Chi tiêu', num: true, render: (x) => `${vnd(x.truoc.spend)} → <b>${vnd(x.spend)}</b>` },
              { key: 'cv', label: 'Chuyển đổi', num: true, render: (x) => `${int(x.truoc.conversions)} → <b>${int(x.conversions)}</b>` },
              { key: 'nguon', label: 'Nguồn cũ', render: (x) => `<span class="tag">${esc(x.truoc.source)}</span>` },
            ], k.chiTiet.capNhat)}` : ''}

          ${(k.chiTiet.taoMoi || []).length ? `<h4 style="margin:14px 0 8px">Dòng sẽ thêm</h4>
            ${table('kNew', [
              { key: 'date', label: 'Ngày', render: (x) => dmy(x.date) },
              { key: 'adName', label: 'Quảng cáo', cls: 'name' },
              { key: 'spend', label: 'Chi tiêu', num: true, render: (x) => vnd(x.spend) },
              { key: 'clicks', label: 'Click', num: true, render: (x) => int(x.clicks) },
              { key: 'conversions', label: 'Chuyển đổi', num: true, render: (x) => int(x.conversions) },
            ], k.chiTiet.taoMoi)}` : ''}

          ${k.soChiCoTrongBase ? `<h4 style="margin:14px 0 8px">Có trong Base nhưng nền tảng không báo (${k.soChiCoTrongBase})</h4>
            <div class="help">App KHÔNG tự xoá. Thường là số nhập tay sai ngày, hoặc quảng cáo đã tắt — anh tự kiểm rồi sửa ở tab Dữ liệu theo ngày.</div>
            ${table('kOnly', [
              { key: 'date', label: 'Ngày', render: (x) => dmy(x.date) },
              { key: 'adName', label: 'Quảng cáo', cls: 'name' },
              { key: 'spend', label: 'Chi tiêu', num: true, render: (x) => vnd(x.spend) },
              { key: 'source', label: 'Nguồn', render: (x) => `<span class="tag">${esc(x.source)}</span>` },
            ], k.chiTiet.chiCoTrongBase || [])}` : ''}

          ${(k.log || []).length ? `<div class="sub-line" style="margin-top:12px">${k.log.map(esc).join('<br>')}</div>` : ''}
        </div>
      </div>`;
    };

    $('#kReport').innerHTML = `
      <div class="card">
        <div class="card-head"><h3>${r.dryRun ? 'Xem trước' : 'Kết quả đồng bộ'}</h3>
          <span class="sub">${r.from ? dmy(r.from) : ''} → ${r.to ? dmy(r.to) : ''}</span></div>
        <div class="card-body tight" style="padding:0 14px 14px">${(r.ketQua || []).map(block).join('')}</div>
      </div>`;
    $('#kReport').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
