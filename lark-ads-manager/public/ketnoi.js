/* ===== Tab "Kết nối & Đồng bộ" — nạp sau app.js, dùng lại helper của app ===== */
'use strict';

(function () {
  const KS = { lastReport: null, csvText: '', csvName: '' };

  const PLAT_OF = { meta: 'Facebook', tiktok: 'TikTok', googleAds: 'Google Ads', googleSheet: 'Google Ads' };

  /* Kênh đi đường vòng, không hiện ra giao diện nữa.
   *
   * googleSheet có từ hồi chưa xin được developer token của Google: script chạy trong
   * Google Ads ghi ra một Google Sheet, app đọc CSV của Sheet đó. Nay Google Ads API
   * đã duyệt và chạy thật nên đường này thừa, mà còn phải nuôi tay (script + Sheet).
   * Adapter `sync/gsheet.js` và `docs/google-ads-script.js` GIỮ NGUYÊN — chỉ ẩn thẻ.
   *
   * Ẩn có điều kiện: kênh nào đang BẬT thì vẫn hiện, để không bao giờ có chuyện một
   * kênh lặng lẽ ghi số vào Base mà giao diện không nhắc tới nó. */
  const KENH_AN = ['googleSheet'];
  const hienKenh = (p) => !KENH_AN.includes(p.key) || p.enabled;

  /* ===== Biểu mẫu điền token ngay trong app =====
   * Trước đây token chỉ điền được bằng `node ket-noi.js` trên máy cá nhân. App chạy
   * trên Render thì không có dòng lệnh nào để gõ, nên phải điền được ở đây.
   *
   * `mat: true` = ô bí mật: KHÔNG BAO GIỜ được điền sẵn giá trị cũ (server không trả
   * ra), và để trống nghĩa là giữ nguyên cái đang lưu. */
  const FORM = {
    meta: {
      nut: 'Điền Access Token Facebook',
      fields: [
        { k: 'accessToken', l: 'Access Token', mat: true, full: true, ph: 'EAAG…',
          hint: 'Business Manager → Cài đặt doanh nghiệp → Người dùng hệ thống → Tạo mã truy cập, tick quyền ads_read. Token loại này không hết hạn.' },
        { k: 'accountIds', l: 'Mã tài khoản quảng cáo', full: true, ph: '1234567890, 9876543210',
          hint: 'Xem ở Ads Manager. Nhiều tài khoản thì ngăn bằng dấu phẩy; có act_ hay không đều được.' },
        { k: 'apiVersion', l: 'Phiên bản Graph API', ph: 'v21.0' },
        { k: 'clickMetric', l: 'Chỉ số click', ph: 'clicks',
          hint: 'clicks = Clicks (all) · inline_link_clicks = chỉ click vào link' },
        { k: 'conversionMetric', l: 'Chỉ số chuyển đổi', full: true,
          ph: 'onsite_conversion.messaging_conversation_started_7d',
          hint: 'Tin nhắn/Lead: onsite_conversion.messaging_conversation_started_7d · Mua hàng: purchase · Lead form: lead' },
      ],
      doTaiKhoan: true,
    },
    tiktok: {
      nut: 'Điền Access Token TikTok',
      fields: [
        { k: 'accessToken', l: 'Access Token', mat: true, full: true, ph: 'token dài hạn của TikTok Business',
          hint: 'Tạo app ở business-api.tiktok.com → chờ duyệt → uỷ quyền tài khoản quảng cáo → lấy token dài hạn.' },
        { k: 'advertiserIds', l: 'Mã tài khoản quảng cáo (Advertiser ID)', full: true, ph: '7012345678901234567',
          hint: 'Hiện ở trang uỷ quyền, hoặc góc trên TikTok Ads Manager. Nhiều tài khoản ngăn bằng dấu phẩy.' },
        { k: 'conversionMetric', l: 'Chỉ số chuyển đổi', ph: 'conversion',
          hint: 'conversion = tổng chuyển đổi · result = theo cột Kết quả của TikTok' },
      ],
    },
    googleAds: {
      nut: 'Điền thông tin Google Ads API',
      fields: [
        { k: 'clientId', l: 'OAuth Client ID', full: true, ph: '…apps.googleusercontent.com',
          hint: 'Google Cloud Console → Credentials → OAuth client ID → loại Desktop app. Thêm http://127.0.0.1:47123 vào Authorized redirect URIs.' },
        { k: 'clientSecret', l: 'OAuth Client Secret', mat: true, full: true },
        { k: 'developerToken', l: 'Google Ads Developer Token', mat: true, full: true,
          hint: 'Google Ads → Công cụ → API Center. Mức Test chỉ đọc được tài khoản test; đọc tài khoản thật phải xin Basic Access.' },
        { k: 'loginCustomerId', l: 'Mã MCC (tài khoản quản lý)', ph: '993-620-5152',
          hint: 'Bỏ trống nếu tài khoản không nằm dưới MCC' },
        { k: 'customerIds', l: 'Mã tài khoản Ads', ph: '959-851-9559',
          hint: 'Nhiều tài khoản ngăn bằng dấu phẩy' },
      ],
      oauth: true,
      doTaiKhoan: true,
    },
    googleSheet: {
      nut: 'Điền link Google Sheet',
      fields: [
        { k: 'csvUrl', l: 'Link CSV đã xuất bản', full: true, ph: 'https://docs.google.com/spreadsheets/…/pub?output=csv',
          hint: 'Dán docs/google-ads-script.js vào Google Ads → Công cụ → Tập lệnh, hẹn giờ mỗi giờ. Rồi Sheet → Tệp → Chia sẻ → Xuất bản lên web → định dạng CSV.' },
        { k: 'level', l: 'Cấp độ dòng', chon: [['adgroup', 'Từng nhóm quảng cáo'], ['ad', 'Từng quảng cáo']],
          hint: 'Quảng cáo tìm kiếm của Google không có tên riêng nên nên để nhóm' },
      ],
    },
  };

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
            Bấm <b>Sửa cấu hình</b> bên dưới rồi dán token mới vào.</div>` : ''}
          ${(p.thieu || []).length ? `<div class="help" style="margin:0 0 12px">
            <b>Còn thiếu:</b> ${p.thieu.map((x) => `<code>${esc(x)}</code>`).join(' · ')}.
            Bấm <b>Điền thông tin Google Ads API</b> bên dưới để khai một lượt.</div>` : ''}
          <div class="stat-row" style="margin-bottom:10px">
            <div><div class="s-label">Token / Link</div><div class="s-value" style="font-size:14px">${p.coToken ? '<span class="tag good">đã có</span>' : '<span class="tag bad">chưa có</span>'}</div></div>
            ${han ? `<div><div class="s-label">Hạn token</div><div class="s-value" style="font-size:13px"><span class="tag ${HAN_CLASS[han.muc] || ''}">${esc(han.text)}</span></div></div>` : ''}
            <div><div class="s-label">Tài khoản</div><div class="s-value" style="font-size:14px">${p.soTaiKhoan ? esc(p.taiKhoan.join(', ')) : '—'}</div></div>
            ${p.chiSoChuyenDoi ? `<div><div class="s-label">Chỉ số chuyển đổi</div><div class="s-value" style="font-size:12.5px">${esc(p.chiSoChuyenDoi)}</div></div>` : ''}
            ${p.capDo ? `<div><div class="s-label">Cấp độ</div><div class="s-value" style="font-size:14px">${esc(p.capDo)}</div></div>` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px">
              <input type="checkbox" data-enable="${p.key}" ${p.enabled ? 'checked' : ''} ${p.sanSang ? '' : 'disabled'}> Bật kênh này
            </label>
            <button class="btn small ghost" data-preview="${p.key}" ${p.sanSang ? '' : 'disabled'}>Xem trước</button>
            <button class="btn small primary" data-sync="${p.key}" ${p.sanSang && p.enabled ? '' : 'disabled'}>Đồng bộ kênh này</button>
            <button class="btn small ${p.sanSang ? 'ghost' : 'primary'}" data-mo-form="${p.key}">${p.sanSang ? 'Sửa cấu hình' : (FORM[p.key] || {}).nut || 'Điền thông tin'}</button>
          </div>
          ${formHtml(p, (c.bieuMau || {})[p.key] || {})}
        </div>
      </div>`;
    };

    /* ---- biểu mẫu điền token, gấp lại sẵn để thẻ không dài ngoằng ---- */
    function formHtml(p, bm) {
      const f = FORM[p.key];
      if (!f) return '';
      const o = (x) => {
        const id = `kn-${p.key}-${x.k}`;
        const daCo = bm['daCo' + x.k.charAt(0).toUpperCase() + x.k.slice(1)];
        if (x.chon) {
          return `<div class="field ${x.full ? 'full' : ''}"><label for="${id}">${esc(x.l)}</label>
            <select id="${id}" data-f="${p.key}.${x.k}">${x.chon.map(([v, t]) =>
              `<option value="${esc(v)}" ${bm[x.k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
            ${x.hint ? `<span class="hint">${esc(x.hint)}</span>` : ''}</div>`;
        }
        // Ô bí mật: không điền sẵn giá trị (server không trả ra), để trống = giữ nguyên.
        return `<div class="field ${x.full ? 'full' : ''}"><label for="${id}">${esc(x.l)}
            ${x.mat && daCo ? '<span class="tag good" style="margin-left:6px">đã lưu</span>' : ''}</label>
          <input id="${id}" data-f="${p.key}.${x.k}" ${x.mat ? 'type="password" autocomplete="new-password" spellcheck="false"' : 'type="text"'}
            value="${x.mat ? '' : esc(bm[x.k] || '')}"
            placeholder="${esc(x.mat && daCo ? 'để trống nếu không đổi' : (x.ph || ''))}">
          ${x.hint ? `<span class="hint">${esc(x.hint)}</span>` : ''}</div>`;
      };

      return `<div class="kn-form" data-form="${p.key}" hidden>
        <div class="form-grid">${f.fields.map(o).join('')}</div>
        ${f.oauth ? `<div class="help" style="margin:12px 0 0">
          <b>Refresh Token</b> ${bm.daCoRefreshToken ? '<span class="tag good">đã lưu</span>' : '<span class="tag bad">chưa có</span>'} —
          lưu Client ID + Secret trước, rồi bấm <b>Lấy link uỷ quyền</b>.
          Trình duyệt sẽ nhảy tới <code>127.0.0.1:47123</code> và báo không kết nối được: đó là bình thường,
          copy nguyên URL trên thanh địa chỉ rồi dán xuống ô dưới.
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="btn small ghost" data-gg-link>Lấy link uỷ quyền</button>
            <a class="btn small primary" data-gg-mo hidden target="_blank" rel="noopener">Mở trang đồng ý của Google</a>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input data-gg-dan placeholder="dán URL trình duyệt nhảy tới (hoặc mã code)" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:7px;padding:6px 9px;font:inherit">
            <button class="btn small ghost" data-gg-doi>Đổi lấy token</button>
          </div></div>` : ''}
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn small primary" data-luu="${p.key}">Lưu cấu hình</button>
          ${f.doTaiKhoan ? `<button class="btn small ghost" data-do-tk="${p.key}">Dò tài khoản</button>` : ''}
          <button class="btn small ghost" data-huy-form="${p.key}">Đóng</button>
          ${(p.coToken || bm.daCoRefreshToken) ? `<button class="btn small ghost" data-xoa-tk="${p.key}" style="margin-left:auto;color:var(--bad)">Xoá token đã lưu</button>` : ''}
        </div>
        <div class="kn-tk" data-tk="${p.key}"></div>
      </div>`;
    }

    // Băng cảnh báo sức khoẻ — tác vụ nền chạy mỗi 3 giờ và khi hỏng thì hỏng lặng lẽ,
    // nên kết quả chấm điểm gần nhất phải đập vào mắt ngay khi mở tab.
    const sk = c.sucKhoe;
    const bangSucKhoe = !sk ? '' : (sk.khoe
      ? `<div class="help" style="border-color:var(--good);color:var(--good)">
           <b>Đồng bộ đang khoẻ</b> — kiểm lúc ${esc(new Date(sk.luc).toLocaleString('vi-VN'))}.
           Số mới nhất: ${esc(Object.entries(sk.moiNhat || {}).map(([k, v]) => k + ' ' + v).join(' · '))}</div>`
      : `<div class="help" style="border-color:var(--${sk.coLoiNang ? 'bad' : 'warn'});color:var(--${sk.coLoiNang ? 'bad' : 'warn'})">
           <b>${sk.coLoiNang ? 'Đồng bộ đang hỏng' : 'Đồng bộ có vấn đề'}</b> — kiểm lúc ${esc(new Date(sk.luc).toLocaleString('vi-VN'))}
           <ul style="margin:6px 0 0;padding-left:18px">
             ${(sk.vanDe || []).map((v) => `<li>${v.nang ? '🔴' : '🟠'} ${esc(v.mo_ta)}</li>`).join('')}
           </ul>
           <div style="margin-top:6px">Số mới nhất: ${esc(Object.entries(sk.moiNhat || {}).map(([k, v]) => k + ' ' + v).join(' · '))}</div>
         </div>`);

    const d = c.dongBo;
    view.innerHTML = `
    ${bangSucKhoe}`;
    view.innerHTML += `
    ${
      // "Chưa nối kênh nào" phải xét theo có kênh nào SẴN SÀNG không, chứ không phải
      // theo việc file có trên đĩa hay không — trên Render cấu hình đến từ biến môi
      // trường nên không hề có file, mà kênh vẫn chạy ngon.
      c.providers.some((p) => p.sanSang) ? '' : `<div class="help">
      Chưa nối kênh nào. Bấm <b>Điền thông tin</b> ở thẻ nền tảng bên dưới, dán token vào rồi <b>Lưu cấu hình</b> —
      app tự tạo <b>${esc(c.file)}</b> hộ, không phải sửa file tay.</div>`}
    ${
      // Nguy hiểm nhất: đã có ADS_CONNECT_JSON nhưng vừa điền thêm token qua web.
      // File tạm đè lên biến môi trường nên bây giờ chạy đúng, deploy sau là mất.
      c.deLenBienMoiTruong ? `<div class="help" style="border-color:var(--bad);color:var(--bad)">
      <b>Phần vừa điền sẽ mất khi deploy lại.</b> Anh đã khai <code>ADS_CONNECT_JSON</code> rồi, nhưng token
      điền qua web này nằm trên ổ đĩa tạm và đang <b>đè lên</b> biến môi trường. Deploy lần sau file mất,
      app tụt về biến môi trường và phần vừa thêm biến mất theo.
      <br>Cách xử lý: cập nhật lại biến <code>ADS_CONNECT_JSON</code> cho có đủ cả các kênh vừa thêm.</div>`
      : c.canhBaoODiaTam ? `<div class="help" style="border-color:var(--warn);color:var(--warn)">
      App đang chạy trên server chung, <b>ổ đĩa là tạm</b>: token điền ở đây sống tới lần deploy kế tiếp rồi mất.
      Muốn giữ lâu dài thì dán nội dung <b>${esc(c.file)}</b> vào biến môi trường <code>ADS_CONNECT_JSON</code> của Render.</div>` : ''}
    ${(() => {
      /* Câu hỏi thật của người dùng là "mai deploy xong tôi có phải gắn lại API
       * không". Trả lời thẳng bằng tên kênh, đừng bắt họ tự suy từ chuyện
       * "cấu hình nằm ở file hay ở biến môi trường". */
      const b = c.benVung;
      if (!b) return '';
      const ten = { meta: 'Facebook', tiktok: 'TikTok', googleAds: 'Google Ads', googleSheet: 'Google Sheet' };
      const list = (a) => a.map((k) => ten[k] || k).join(', ');
      if (!b.dangChay.length) return '';
      if (!b.canLo) {
        return `<div class="help" style="border-color:var(--good);color:var(--good)">
          <b>Deploy lại không mất gì.</b> ${esc(list(b.seCon))} đều được lưu ở ${esc(b.noiLuu)}.
          Không phải gắn lại API.</div>`;
      }
      return `<div class="help" style="border-color:var(--bad);color:var(--bad)">
        <b>Deploy lại sẽ mất: ${esc(list(b.seMat))}.</b>
        ${b.seCon.length ? `Giữ được: ${esc(list(b.seCon))}.` : 'Không kênh nào được giữ.'}
        <br>Chạy <code>node tao-env.js</code> trên máy rồi dán nội dung
        <code>ADS_CONNECT_JSON.txt</code> vào biến <code>ADS_CONNECT_JSON</code> của Render.</div>`;
    })()}

    <div class="help">Đồng bộ luôn ghi lại <b>${d.soNgayLui} ngày gần nhất</b>, không chỉ hôm nay — vì Meta/TikTok/Google còn khai báo lại chuyển đổi trong vài ngày.
    Khoá ghi là (quảng cáo × ngày) nên chạy lại bao nhiêu lần cũng không nhân dòng.
    ${c.hengio.dangBat ? `Hẹn giờ <b>đang bật</b>, lượt kế tiếp khoảng ${c.hengio.lanKeTiep ? new Date(c.hengio.lanKeTiep).toLocaleTimeString('vi-VN') : '—'}.` : 'Hẹn giờ <b>đang tắt</b>.'}</div>

    <div class="grid g3">${c.providers.filter(hienKenh).map(providerCard).join('')}</div>

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

  /* ---------------- biểu mẫu điền token ---------------- */

  /** Gom mọi ô của một kênh thành { meta: { accessToken: '…' } }. */
  function nhatForm(key) {
    const out = {};
    $$(`#view [data-form="${key}"] [data-f]`).forEach((el) => {
      out[el.dataset.f.split('.')[1]] = el.value;
    });
    return { [key]: out };
  }

  function wireForm() {
    const form = (k) => $(`#view [data-form="${k}"]`);

    $$('#view [data-mo-form]').forEach((b) => b.onclick = () => {
      const f = form(b.dataset.moForm);
      f.hidden = !f.hidden;
      if (!f.hidden) {
        const dau = f.querySelector('input:not([type=checkbox])');
        if (dau) dau.focus();
        f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    $$('#view [data-huy-form]').forEach((b) => b.onclick = () => { form(b.dataset.huyForm).hidden = true; });

    $$('#view [data-luu]').forEach((b) => b.onclick = async () => {
      const k = b.dataset.luu;
      const old = b.textContent;
      b.disabled = true; b.textContent = 'Đang lưu…';
      try {
        const r = await api('/api/connect/secrets', { method: 'PUT', body: JSON.stringify(nhatForm(k)) });
        const p = (r.providers || []).find((x) => x.key === k) || {};
        toast(p.sanSang ? 'Đã lưu — bấm Kiểm tra kết nối để thử' : 'Đã lưu, còn thiếu: ' + ((p.thieu || []).join(', ') || 'token hoặc mã tài khoản'), p.sanSang ? 'ok' : 'err');
        render();
      } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = old; }
    });

    $$('#view [data-do-tk]').forEach((b) => b.onclick = async () => {
      const k = b.dataset.doTk;
      const old = b.textContent;
      b.disabled = true; b.textContent = 'Đang dò…';
      try {
        // Dò bằng token ĐÃ LƯU, nên phải lưu trước — nếu không sẽ dò bằng token cũ.
        await api('/api/connect/secrets', { method: 'PUT', body: JSON.stringify(nhatForm(k)) });
        const r = await api('/api/connect/tai-khoan', { method: 'POST', body: JSON.stringify({ provider: k }) });
        veTaiKhoan(k, r.rows || []);
      } catch (e) { toast(e.message, 'err'); }
      b.disabled = false; b.textContent = old;
    });

    $$('#view [data-xoa-tk]').forEach((b) => b.onclick = async () => {
      const k = b.dataset.xoaTk;
      if (!confirm('Xoá token đã lưu của kênh này? Kênh sẽ tắt cho tới khi điền token mới.')) return;
      const xoa = { meta: { accessToken: null }, tiktok: { accessToken: null }, googleSheet: { csvUrl: null },
        googleAds: { clientSecret: null, refreshToken: null, developerToken: null } }[k];
      try {
        await api('/api/connect/secrets', { method: 'PUT', body: JSON.stringify({ [k]: { ...xoa, enabled: false } }) });
        toast('Đã xoá token', 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); }
    });

    /* ---- OAuth Google: lấy refresh token mà không cần dòng lệnh ---- */
    const ggLink = $('#view [data-gg-link]');
    if (ggLink) ggLink.onclick = async () => {
      ggLink.disabled = true;
      try {
        // Client ID/Secret đang gõ dở phải lưu trước thì link mới đúng.
        await api('/api/connect/secrets', { method: 'PUT', body: JSON.stringify(nhatForm('googleAds')) });
        const r = await api('/api/connect/google-oauth', { method: 'POST', body: JSON.stringify({ buoc: 'link' }) });
        const a = $('#view [data-gg-mo]');
        a.href = r.url; a.hidden = false; a.textContent = 'Mở trang đồng ý của Google';
        window.open(r.url, '_blank', 'noopener');
        toast('Đồng ý xong, copy URL trên thanh địa chỉ rồi dán xuống ô dưới', 'ok');
      } catch (e) { toast(e.message, 'err'); }
      ggLink.disabled = false;
    };

    const ggDoi = $('#view [data-gg-doi]');
    if (ggDoi) ggDoi.onclick = async () => {
      const dan = $('#view [data-gg-dan]').value.trim();
      if (!dan) { toast('Chưa dán gì vào ô', 'err'); return; }
      ggDoi.disabled = true; ggDoi.textContent = 'Đang đổi…';
      try {
        await api('/api/connect/google-oauth', { method: 'POST', body: JSON.stringify({ buoc: 'doi', dan }) });
        toast('Đã lấy được refresh token', 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); ggDoi.disabled = false; ggDoi.textContent = 'Đổi lấy token'; }
    };
  }

  /** Kết quả dò tài khoản: tick cái nào thì điền vào ô mã tài khoản. */
  function veTaiKhoan(key, rows) {
    const o = $(`#view [data-tk="${key}"]`);
    if (!rows.length) {
      o.innerHTML = '<div class="help" style="margin:12px 0 0">Token hợp lệ nhưng không thấy tài khoản quảng cáo nào được uỷ quyền.</div>';
      return;
    }
    const oId = key === 'meta' ? 'kn-meta-accountIds' : 'kn-googleAds-customerIds';
    const dangChon = ($('#' + oId).value || '').split(/[\s,;]+/).filter(Boolean);
    o.innerHTML = `<div class="help" style="margin:12px 0 0">
      <b>Thấy ${rows.length} tài khoản</b> — tick cái nào cần lấy số:
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:8px">
        ${rows.map((r) => `<label style="display:flex;align-items:center;gap:7px;font-size:12.5px">
          <input type="checkbox" data-tk-id="${esc(r.id)}" ${dangChon.includes(String(r.id)) ? 'checked' : ''}>
          <code>${esc(r.id)}</code> ${esc(r.name || '')}${r.currency ? ' · ' + esc(r.currency) : ''}
          ${r.dangChay === false ? '<span class="tag warn">không hoạt động</span>' : ''}</label>`).join('')}
      </div>
      <button class="btn small ghost" data-tk-dien style="margin-top:8px">Điền vào ô mã tài khoản</button></div>`;
    o.querySelector('[data-tk-dien]').onclick = () => {
      const chon = [...o.querySelectorAll('[data-tk-id]')].filter((x) => x.checked).map((x) => x.dataset.tkId);
      if (!chon.length) { toast('Chưa tick tài khoản nào', 'err'); return; }
      $('#' + oId).value = chon.join(', ');
      toast('Đã điền — nhớ bấm Lưu cấu hình', 'ok');
    };
  }

  /* ---------------- nút bấm ---------------- */
  function wire(c) {
    wireForm();

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
