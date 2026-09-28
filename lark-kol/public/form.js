'use strict';
/* ==========================================================================
   Form KOL tự điền (anh Hùng 28/09/2026). Trang công khai /f/<mã>: KOL điền liên hệ, kênh,
   chuyến đi và danh sách thành viên đoàn (CCCD / hộ chiếu, ngày cấp, ngày sinh).
   Hai thứ tiếng: tự chọn theo quốc gia KOL, đổi được ở góc trên. Không có tiền, bảng kê
   hay ghi chú nội bộ — trang chỉ đọc/ghi đúng thông tin của đoàn này.
   ========================================================================== */
(function () {
  const $ = (s, g = document) => g.querySelector(s);
  const $$ = (s, g = document) => [...g.querySelectorAll(s)];
  const e = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /* gốc app = phần trước /f/<mã> — '' khi chạy máy anh, '/m/kol' trên Hub (Hub không chèn shim vào trang này) */
  const GOC = location.pathname.replace(/\/f\/[a-f0-9]{32}\/?$/, '');
  const MA = (/\/f\/([a-f0-9]{32})/.exec(location.pathname) || [])[1];
  const MV = window.MaVung;
  const VN = 7 * 3600000;
  const ngayIn = (ms) => { if (!ms) return ''; const d = new Date(ms + VN); return d.toISOString().slice(0, 10); };
  const homNay = ngayIn(Date.now());

  const CHU = {
    vi: {
      mat: 'Thông tin hợp tác', tieuDe: 'Chào mừng bạn đến với Rooty Trip Phú Quốc',
      moTa: 'Vui lòng điền thông tin bên dưới để chúng tôi chuẩn bị vé, dịch vụ và khai báo lưu trú cho chuyến đi. Thông tin chỉ dùng cho chuyến đi này.',
      daDien: 'Bạn đã gửi thông tin lúc {t}. Sửa và gửi lại nếu có thay đổi.',
      s1: 'Thông tin liên hệ', s1g: 'Người đại diện liên hệ với Rooty Trip.',
      ten: 'Họ và tên', email: 'Email', quocGia: 'Quốc gia', sdt: 'Số điện thoại', lienHe: 'Liên hệ khác', lienHeG: 'Zalo, KakaoTalk, WhatsApp, quản lý…',
      s2: 'Kênh mạng xã hội', s2g: 'Các kênh sẽ đăng nội dung về chuyến đi.', nenTang: 'Nền tảng', tenKenh: 'Tên kênh', link: 'Link', theoDoi: 'Lượt theo dõi', themKenh: '+ Thêm kênh',
      s3: 'Chuyến đi', s3g: 'Điền nếu đã có, chưa có thì để trống.', den: 'Ngày đến Phú Quốc', ve: 'Ngày rời Phú Quốc', bayDen: 'Chuyến bay đến', bayVe: 'Chuyến bay về',
      bayG: 'Số hiệu + giờ, VD: VJ321 · 08:30', dacBiet: 'Yêu cầu đặc biệt', dacBietG: 'Ăn chay, dị ứng, cần xe đẩy em bé, ghế trẻ em…',
      noiDon: 'Nơi đón tại Phú Quốc', noiTra: 'Nơi trả tại Phú Quốc', noiG: 'Sân bay, tên khách sạn, địa chỉ… hoặc dán link Google Maps',
      anh: 'Ảnh CCCD / hộ chiếu', anhG: 'Chụp rõ, đủ 4 góc: mặt trước (và mặt sau với CCCD). Tối đa 4 ảnh.', chonAnh: 'Chọn ảnh', daCoAnh: 'Đã gửi {n} ảnh — chọn ảnh mới sẽ thay ảnh cũ.',
      dangTaiAnh: 'Đang tải ảnh giấy tờ {i}/{n}…', loiAnh: 'Thông tin đã lưu nhưng tải ảnh của {ten} chưa được: ', anhLon: 'Ảnh quá lớn (tối đa 8 MB)', boAnh: 'Bỏ ảnh',
      s4: 'Thành viên trong đoàn', s4g: 'Mỗi người một thẻ, ghi họ tên ĐÚNG như trên giấy tờ. Trẻ em chưa có CCCD/hộ chiếu dùng giấy khai sinh.',
      tv: 'Thành viên', truong: 'Trưởng đoàn', hoTen: 'Họ tên (như trên giấy tờ)', gioi: 'Giới tính', gioiDs: ['Nữ', 'Nam', 'Khác'], ngaySinh: 'Ngày sinh',
      nhom: 'Nhóm khách', nhomDs: [['Người lớn', 'Người lớn (cao từ 1m40)'], ['Trẻ em', 'Trẻ em (1m – 1m39)'], ['Em bé', 'Em bé (dưới 1m)']],
      quocTich: 'Quốc tịch', loaiGiay: 'Loại giấy tờ', giayDs: [['CCCD', 'CCCD'], ['Hộ chiếu', 'Hộ chiếu'], ['Giấy khai sinh', 'Giấy khai sinh']],
      soGiay: 'Số giấy tờ', ngayCap: 'Ngày cấp', ngayHet: 'Ngày hết hạn', sdtTv: 'SĐT (không bắt buộc)', themTv: '+ Thêm thành viên', xoaTv: 'Xoá thành viên này',
      dongY: 'Tôi đồng ý cho Rooty Trip Phú Quốc dùng các thông tin trên để đặt dịch vụ và khai báo lưu trú cho chuyến đi này.',
      gui: 'Gửi thông tin', dangGui: 'Đang gửi…', chan: 'Thông tin được mã hoá khi gửi và chỉ đội Rooty Trip xem được.',
      xong: 'Đã nhận thông tin, cảm ơn bạn!', xongMo: 'Đội ngũ Rooty Trip Phú Quốc sẽ liên hệ khi mọi thứ sẵn sàng. Cần sửa gì, bạn mở lại đường link này.', suaLai: 'Sửa lại thông tin',
      bat: 'Bắt buộc', loiTen: 'Vui lòng điền họ tên', loiEmail: 'Email chưa đúng dạng', loiCccd: 'CCCD gồm 12 chữ số', loiHc: 'Số hộ chiếu gồm 6–9 chữ và số', loiNgay: 'Ngày không hợp lệ',
      loiCap: 'Ngày cấp phải trước hôm nay', loiDongY: 'Vui lòng đánh dấu đồng ý', loiChung: 'Còn {n} ô cần sửa — xem các ô tô đỏ.', loiTaiVe: 'Không mở được form: ',
    },
    en: {
      mat: 'Collaboration details', tieuDe: 'Welcome to Rooty Trip Phu Quoc',
      moTa: 'Please fill in the details below so we can arrange your tickets, services and accommodation registration. Your information is used for this trip only.',
      daDien: 'You submitted your details on {t}. Edit and submit again if anything changes.',
      s1: 'Contact details', s1g: 'The main contact person for Rooty Trip.',
      ten: 'Full name', email: 'Email', quocGia: 'Country', sdt: 'Phone number', lienHe: 'Other contact', lienHeG: 'KakaoTalk, WhatsApp, Zalo, manager…',
      s2: 'Social media channels', s2g: 'Channels where you will post about the trip.', nenTang: 'Platform', tenKenh: 'Channel name', link: 'Link', theoDoi: 'Followers', themKenh: '+ Add channel',
      s3: 'Your trip', s3g: 'Fill in what you already know; leave blank otherwise.', den: 'Arrival in Phu Quoc', ve: 'Departure from Phu Quoc', bayDen: 'Arrival flight', bayVe: 'Departure flight',
      bayG: 'Flight number + time, e.g. VJ321 · 08:30', dacBiet: 'Special requests', dacBietG: 'Vegetarian, allergies, baby stroller, child seat…',
      noiDon: 'Pick-up location in Phu Quoc', noiTra: 'Drop-off location in Phu Quoc', noiG: 'Airport, hotel name, address… or paste a Google Maps link',
      anh: 'Photo of passport / ID', anhG: 'A clear photo showing all 4 corners (front, and back for ID cards). Up to 4 photos.', chonAnh: 'Choose photos', daCoAnh: '{n} photo(s) already sent — choosing new ones replaces them.',
      dangTaiAnh: 'Uploading ID photos {i}/{n}…', loiAnh: 'Your details were saved, but the photos for {ten} could not be uploaded: ', anhLon: 'File too large (max 8 MB)', boAnh: 'Remove photos',
      s4: 'Travellers', s4g: 'One card per person. Write names EXACTLY as on the ID or passport. Children without a passport may use a birth certificate.',
      tv: 'Traveller', truong: 'Group leader', hoTen: 'Full name (as on ID)', gioi: 'Gender', gioiDs: ['Female', 'Male', 'Other'], ngaySinh: 'Date of birth',
      nhom: 'Guest type', nhomDs: [['Người lớn', 'Adult (1.40 m and taller)'], ['Trẻ em', 'Child (1.00 – 1.39 m)'], ['Em bé', 'Infant (under 1 m)']],
      quocTich: 'Nationality', loaiGiay: 'ID type', giayDs: [['Hộ chiếu', 'Passport'], ['CCCD', 'Vietnamese ID card (CCCD)'], ['Giấy khai sinh', 'Birth certificate']],
      soGiay: 'ID / passport number', ngayCap: 'Date of issue', ngayHet: 'Date of expiry', sdtTv: 'Phone (optional)', themTv: '+ Add traveller', xoaTv: 'Remove this traveller',
      dongY: 'I agree that Rooty Trip Phu Quoc may use the information above to book services and register accommodation for this trip.',
      gui: 'Submit', dangGui: 'Submitting…', chan: 'Your details are sent securely and are only visible to the Rooty Trip team.',
      xong: 'Thank you — we have received your details!', xongMo: 'The Rooty Trip Phu Quoc team will be in touch once everything is ready. Open this link again anytime to make changes.', suaLai: 'Edit my details',
      bat: 'Required', loiTen: 'Please enter a name', loiEmail: 'Please check the email address', loiCccd: 'CCCD must be 12 digits', loiHc: 'Passport numbers are 6–9 letters and digits', loiNgay: 'Invalid date',
      loiCap: 'Date of issue must be in the past', loiDongY: 'Please tick to agree', loiChung: '{n} field(s) need attention — see the ones in red.', loiTaiVe: 'Could not open the form: ',
    },
  };
  const GIOI_GOC = ['Nữ', 'Nam', 'Khác'];
  const NEN_TANG = ['TikTok', 'Facebook', 'Instagram', 'YouTube', 'Threads', 'Zalo', 'Khác'];
  const S = { lang: 'vi', d: null };
  const T = (k) => CHU[S.lang][k];
  const tenNuoc = (x) => { if (S.lang === 'vi') return x.ten; try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(x.iso) || x.ten; } catch (_) { return x.ten; } };

  async function api(url, than) {
    const r = await fetch(GOC + url, than ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(than) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }

  /* ---------------- vẽ ---------------- */
  const o = (nhan, html, { bat, goiY, rong, cls } = {}) => '<label class="f-o' + (rong ? ' rong' : '') + (cls ? ' ' + cls : '') + '">' +
    '<span>' + nhan + (bat ? ' <span class="bat">*</span>' : '') + (goiY ? ' <small>' + goiY + '</small>' : '') + '</span>' + html + '<span class="f-loi"></span></label>';
  const chon = (ds, v, attr) => '<select ' + attr + '><option value=""></option>' + ds.map(([gt, nhan]) => '<option value="' + e(gt) + '"' + (gt === v ? ' selected' : '') + '>' + e(nhan) + '</option>').join('') + '</select>';
  const dsNuoc = () => MV.DS.map((x) => [x.ten, tenNuoc(x)]);

  function veKenh(k) {
    return '<div class="f-kenh" data-kenh data-id="' + e(k.id || '') + '">' +
      o(T('nenTang'), chon(NEN_TANG.map((x) => [x, x === 'Khác' && S.lang === 'en' ? 'Other' : x]), k.nenTang || 'TikTok', 'data-k="nenTang"')) +
      o(T('tenKenh'), '<input data-k="ten" value="' + e(k.ten) + '">') +
      o(T('link'), '<input data-k="link" inputmode="url" placeholder="https://" value="' + e(k.link) + '">') +
      o(T('theoDoi'), '<input data-k="theoDoi" type="number" min="0" inputmode="numeric" value="' + e(k.theoDoi ?? '') + '">') +
      '<button type="button" class="f-nut xoa" data-xoa-kenh aria-label="×">×</button></div>';
  }
  function veTv(x, i) {
    const giay = x.loaiGiay || (S.lang === 'en' ? 'Hộ chiếu' : 'CCCD');
    return '<div class="f-tv" data-tv data-id="' + e(x.id || '') + '"><div class="f-tv-dau"><div><b>' + T('tv') + ' ' + (i + 1) + '</b>' + (i === 0 ? '<span class="nhan">' + T('truong') + '</span>' : '') + '</div>' +
      (i ? '<button type="button" class="f-nut xoa" data-xoa-tv title="' + e(T('xoaTv')) + '" aria-label="' + e(T('xoaTv')) + '">×</button>' : '') + '</div>' +
      '<div class="f-luoi">' +
      o(T('hoTen'), '<input data-k="ten" autocomplete="off" value="' + e(x.ten) + '">', { bat: true, cls: 'w2' }) +
      o(T('gioi'), chon(GIOI_GOC.map((g, j) => [g, T('gioiDs')[j]]), x.gioiTinh || '', 'data-k="gioiTinh"')) +
      o(T('ngaySinh'), '<input data-k="ngaySinh" type="date" max="' + homNay + '" value="' + ngayIn(x.ngaySinh) + '">', { bat: true }) +
      o(T('nhom'), chon(T('nhomDs'), x.nhomKhach || 'Người lớn', 'data-k="nhomKhach"'), { bat: true }) +
      o(T('quocTich'), chon(dsNuoc(), x.quocTich || S.d.kol.quocGia || (S.lang === 'vi' ? 'Việt Nam' : ''), 'data-k="quocTich"')) +
      o(T('loaiGiay'), chon(T('giayDs'), giay, 'data-k="loaiGiay"'), { bat: true }) +
      o(T('soGiay'), '<input data-k="soGiay" autocomplete="off" value="' + e(x.soGiay) + '">', { bat: true }) +
      o(T('ngayCap'), '<input data-k="ngayCap" type="date" max="' + homNay + '" value="' + ngayIn(x.ngayCap) + '">', { bat: true }) +
      o(T('ngayHet'), '<input data-k="ngayHet" type="date" value="' + ngayIn(x.ngayHet) + '">', { cls: 'o-het' + (giay === 'Hộ chiếu' ? '' : ' an') }) +
      o(T('sdtTv'), '<input data-k="sdt" type="tel" inputmode="tel" value="' + e(x.sdt) + '">') +
      '<div class="f-o rong"><span>' + T('anh') + ' <small>' + T('anhG') + '</small></span>' +
        '<div class="f-anh">' + (x._anh || []).map((a) => '<span class="f-anh-o">' + (/^data:image\/(jpeg|png|webp)/.test(a.du) ? '<img src="' + a.du + '" alt="">' : '<i>' + e(a.ten.split('.').pop().toUpperCase()) + '</i>') + '</span>').join('') +
        '<label class="f-nut phu f-anh-chon">' + T('chonAnh') + '<input type="file" accept="image/*,application/pdf" multiple data-anh hidden></label>' +
        ((x._anh || []).length ? '<button type="button" class="f-nut" data-bo-anh>' + T('boAnh') + '</button>' : '') + '</div>' +
        (!(x._anh || []).length && x.soAnh ? '<small class="f-da-co">' + T('daCoAnh').replace('{n}', x.soAnh) + '</small>' : '') +
        '<span class="f-loi"></span></div>' +
      '</div></div>';
  }

  function ve() {
    const d = S.d, k = d.kol;
    document.documentElement.lang = S.lang;
    document.title = T('mat') + ' · Rooty Trip Phu Quoc';
    $$('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === S.lang));
    const nuoc = MV.theoTen(k.quocGia || '') || (S.lang === 'vi' ? MV.theoTen('Việt Nam') : null);
    if (!d.tv.length) d.tv = [{ ten: k.ten, vaiTro: 'Trưởng đoàn', nhomKhach: 'Người lớn', quocTich: k.quocGia }];
    const tv = d.tv;
    $('#fMan').innerHTML = '<div class="f-mo-dau"><div class="f-mat">' + T('mat') + ' · ' + e(d.ma) + '</div><h1>' + T('tieuDe') + '</h1><p>' + T('moTa') + '</p></div>' +
      (d.daDien ? '<div class="f-bao">' + T('daDien').replace('{t}', new Date(d.daDien).toLocaleString(S.lang === 'vi' ? 'vi-VN' : 'en-GB', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' })) + '</div>' : '') +
      '<div class="f-bao do an" id="fLoi"></div>' +
      '<section class="f-the"><h2><span class="so">1</span>' + T('s1') + '</h2><p class="f-giai">' + T('s1g') + '</p><div class="f-luoi" id="fKol">' +
        o(T('ten'), '<input data-k="ten" autocomplete="name" value="' + e(k.ten) + '">', { bat: true }) +
        o(T('email'), '<input data-k="email" type="email" autocomplete="email" inputmode="email" value="' + e(k.email) + '">') +
        o(T('quocGia'), chon(dsNuoc(), nuoc ? nuoc.ten : '', 'data-k="quocGia"')) +
        o(T('sdt'), '<div class="f-sdt"><select data-k="maVung">' + MV.DS.filter((x, i, a) => a.findIndex((y) => y.ma === x.ma) === i).map((x) => '<option value="+' + x.ma + '"' +
          ('+' + x.ma === (k.maVung || (nuoc ? '+' + nuoc.ma : '+84')) ? ' selected' : '') + '>+' + x.ma + '</option>').join('') + '</select>' +
          '<input data-k="sdt" type="tel" inputmode="tel" autocomplete="tel-national" value="' + e(k.sdt ? MV.chuan(k.sdt, k.maVung).dep.replace(/^\+\d+\s*/, '') : '') + '"></div>') +
        o(T('lienHe'), '<input data-k="lienHe" value="' + e(k.lienHe) + '">', { goiY: T('lienHeG'), rong: true }) +
      '</div></section>' +
      '<section class="f-the"><h2><span class="so">2</span>' + T('s2') + '</h2><p class="f-giai">' + T('s2g') + '</p><div id="fKenh">' +
        (d.kenh.length ? d.kenh : [{ nenTang: 'TikTok' }]).map(veKenh).join('') + '</div><button type="button" class="f-nut phu" id="fThemKenh">' + T('themKenh') + '</button></section>' +
      '<section class="f-the"><h2><span class="so">3</span>' + T('s3') + '</h2><p class="f-giai">' + T('s3g') + '</p><div class="f-luoi" id="fHt">' +
        o(T('den'), '<input data-k="batDau" type="date" value="' + ngayIn(d.ht.batDau) + '">') +
        o(T('ve'), '<input data-k="ketThuc" type="date" value="' + ngayIn(d.ht.ketThuc) + '">') +
        o(T('bayDen'), '<input data-k="bayDen" placeholder="' + e(T('bayG')) + '" value="' + e(d.ht.bayDen) + '">') +
        o(T('bayVe'), '<input data-k="bayVe" placeholder="' + e(T('bayG')) + '" value="' + e(d.ht.bayVe) + '">') +
        o(T('noiDon'), '<input data-k="noiDon" placeholder="' + e(T('noiG')) + '" value="' + e(d.ht.noiDon) + '">') +
        o(T('noiTra'), '<input data-k="noiTra" placeholder="' + e(T('noiG')) + '" value="' + e(d.ht.noiTra) + '">') +
        o(T('dacBiet'), '<textarea data-k="yeuCauDacBiet" placeholder="' + e(T('dacBietG')) + '">' + e(d.ht.yeuCauDacBiet) + '</textarea>', { rong: true }) +
      '</div></section>' +
      '<section class="f-the"><h2><span class="so">4</span>' + T('s4') + '</h2><p class="f-giai">' + T('s4g') + '</p><div id="fTv">' + tv.map(veTv).join('') + '</div>' +
        '<button type="button" class="f-nut phu" id="fThemTv">' + T('themTv') + '</button></section>' +
      '<section class="f-the"><label class="f-dong-y"><input type="checkbox" id="fDongY"' + (d.daDien ? ' checked' : '') + '><span>' + T('dongY') + '</span></label><span class="f-loi" id="fLoiDongY" style="color:var(--f-do);font-size:12.5px"></span></section>' +
      '<div class="f-chan"><div class="f-chan-trong"><span>' + T('chan') + '</span><button type="button" class="f-gui" id="fGui">' + T('gui') + '</button></div></div>';
    ganSuKien();
  }

  /* đọc lại những gì đang gõ trước khi vẽ lại (đổi ngôn ngữ, thêm/xoá thẻ) — không mất chữ */
  function doc() {
    const lay = (g) => Object.fromEntries($$('[data-k]', g).map((x) => [x.dataset.k, x.value.trim()]));
    const kol = lay($('#fKol'));
    const kenh = $$('[data-kenh]').map((g) => ({ id: g.dataset.id || undefined, ...lay(g) }));
    const ht = lay($('#fHt'));
    const tv = $$('[data-tv]').map((g, i) => ({ id: g.dataset.id || undefined, ...lay(g), vaiTro: i ? 'Thành viên' : 'Trưởng đoàn' }));
    return { kol, kenh, ht, tv };
  }
  function giuLai() {
    const f = doc();
    const ms = (s) => (s ? Date.parse(s + 'T00:00:00+07:00') : null);
    S.d.kol = { ...S.d.kol, ...f.kol };
    S.d.kenh = f.kenh;
    S.d.ht = { ...S.d.ht, ...f.ht, batDau: ms(f.ht.batDau), ketThuc: ms(f.ht.ketThuc) };
    S.d.tv = f.tv.map((x, i) => ({ ...x, ngaySinh: ms(x.ngaySinh), ngayCap: ms(x.ngayCap), ngayHet: ms(x.ngayHet),
      _anh: (S.d.tv[i] || {})._anh, soAnh: (S.d.tv[i] || {}).soAnh }));
  }

  function ganSuKien() {
    $('#fThemKenh').onclick = () => { giuLai(); S.d.kenh.push({ nenTang: 'TikTok' }); ve(); };
    $('#fThemTv').onclick = () => { giuLai(); S.d.tv.push({ nhomKhach: 'Người lớn', quocTich: S.d.kol.quocGia }); ve(); $$('[data-tv]').pop().scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    $('#fMan').onclick = (ev) => {
      const xk = ev.target.closest('[data-xoa-kenh]');
      if (xk) { giuLai(); const i = $$('[data-kenh]').indexOf(xk.closest('[data-kenh]')); S.d.kenh.splice(i, 1); ve(); return; }
      const ba = ev.target.closest('[data-bo-anh]');
      if (ba) { giuLai(); S.d.tv[$$('[data-tv]').indexOf(ba.closest('[data-tv]'))]._anh = []; ve(); return; }
      const xt = ev.target.closest('[data-xoa-tv]');
      if (xt) { giuLai(); const i = $$('[data-tv]').indexOf(xt.closest('[data-tv]')); S.d.tv.splice(i, 1); ve(); }
    };
    $('#fMan').onchange = async (ev) => {
      if (ev.target.matches('[data-anh]')) {
        const g = ev.target.closest('[data-tv]'); const i = $$('[data-tv]').indexOf(g);
        const ds = [...ev.target.files].slice(0, 4);
        const loiO = g.querySelector('.f-anh').parentElement.querySelector('.f-loi');
        const anh = [];
        for (const f of ds) {
          const du = await nen(f);
          if (du.length * 0.75 > 8 * 1024 * 1024) { loiO.textContent = T('anhLon') + ' · ' + f.name; continue; }
          anh.push({ ten: f.name, du });
        }
        giuLai(); S.d.tv[i]._anh = anh; ve();
        return;
      }
      const k = ev.target.dataset.k;
      /* hộ chiếu mới có ngày hết hạn */
      if (k === 'loaiGiay') ev.target.closest('[data-tv]').querySelector('.o-het').classList.toggle('an', ev.target.value !== 'Hộ chiếu');
      /* chọn quốc gia → mã vùng theo */
      /* trưởng đoàn thường là chính người liên hệ: ô tên thành viên 1 còn trống thì điền theo */
      if (k === 'ten' && ev.target.closest('#fKol')) { const o1 = $('[data-tv] [data-k="ten"]'); if (o1 && !o1.value.trim()) o1.value = ev.target.value.trim(); }
      if (k === 'quocGia' && ev.target.closest('#fKol')) { const n = MV.theoTen(ev.target.value); if (n) $('#fKol [data-k="maVung"]').value = '+' + n.ma; }
      const lb = ev.target.closest('.f-o'); if (lb && lb.classList.contains('loi')) { lb.classList.remove('loi'); lb.querySelector('.f-loi').textContent = ''; }
    };
    $('#fGui').onclick = gui;
  }

  function kiem() {
    let n = 0;
    const bao = (el, chu) => { const lb = el.closest('.f-o'); lb.classList.add('loi'); lb.querySelector('.f-loi').textContent = chu; n++; };
    $$('.f-o.loi').forEach((lb) => { lb.classList.remove('loi'); lb.querySelector('.f-loi').textContent = ''; });
    const kt = (g, k) => g.querySelector('[data-k="' + k + '"]');
    if (!kt($('#fKol'), 'ten').value.trim()) bao(kt($('#fKol'), 'ten'), T('loiTen'));
    const em = kt($('#fKol'), 'email').value.trim();
    if (em && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(em)) bao(kt($('#fKol'), 'email'), T('loiEmail'));
    for (const g of $$('[data-tv]')) {
      if (!kt(g, 'ten').value.trim()) bao(kt(g, 'ten'), T('loiTen'));
      const ns = kt(g, 'ngaySinh').value;
      if (!ns || ns > homNay) bao(kt(g, 'ngaySinh'), ns ? T('loiNgay') : T('bat'));
      const loai = kt(g, 'loaiGiay').value, so = kt(g, 'soGiay').value.replace(/\s/g, '');
      if (!so) bao(kt(g, 'soGiay'), T('bat'));
      else if (loai === 'CCCD' && !/^\d{12}$/.test(so)) bao(kt(g, 'soGiay'), T('loiCccd'));
      else if (loai === 'Hộ chiếu' && !/^[A-Za-z0-9]{6,9}$/.test(so)) bao(kt(g, 'soGiay'), T('loiHc'));
      const nc = kt(g, 'ngayCap').value;
      if (!nc) bao(kt(g, 'ngayCap'), T('bat'));
      else if (nc > homNay || (ns && nc < ns)) bao(kt(g, 'ngayCap'), T('loiCap'));
    }
    const dy = $('#fDongY').checked;
    $('#fLoiDongY').textContent = dy ? '' : T('loiDongY');
    if (!dy) n++;
    return n;
  }

  /* ảnh chụp điện thoại 4–10 MB → JPEG cạnh dài 2000px (~400 KB), vẫn đọc rõ số giấy tờ.
   * PDF / HEIC (trình duyệt không vẽ được) gửi nguyên bản. */
  function docTep(f) { return new Promise((ok, loi) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = loi; r.readAsDataURL(f); }); }
  async function nen(f) {
    const goc = await docTep(f);
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return goc;
    try {
      const im = await new Promise((ok, loi) => { const i = new Image(); i.onload = () => ok(i); i.onerror = loi; i.src = goc; });
      const k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const ra = c.toDataURL('image/jpeg', 0.85);
      return ra.length < goc.length ? ra : goc;
    } catch (_) { return goc; }
  }

  async function gui() {
    const n = kiem();
    if (n) {
      $('#fLoi').textContent = T('loiChung').replace('{n}', n); $('#fLoi').classList.remove('an');
      const dau = $('.f-o.loi') || $('#fDongY'); dau.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    $('#fLoi').classList.add('an');
    giuLai();
    const anh = S.d.tv.map((x) => x._anh || []);
    const f = doc();
    f.tv.forEach((x) => { x.soGiay = x.soGiay.replace(/\s/g, '').toUpperCase(); });
    $('#fGui').disabled = true; $('#fGui').textContent = T('dangGui');
    try {
      const kq = await api('/api/form/' + MA, f);
      /* ảnh từng người tải riêng (mỗi lượt vài MB) — sau khi đã có id thành viên */
      const can = anh.map((a, i) => ({ a, i })).filter((x) => x.a.length && kq.ids && kq.ids[x.i]);
      for (let j = 0; j < can.length; j++) {
        $('#fGui').textContent = T('dangTaiAnh').replace('{i}', j + 1).replace('{n}', can.length);
        try { await api('/api/form/' + MA + '/anh/' + kq.ids[can[j].i], { tep: can[j].a.map((x) => ({ ten: x.ten, du: x.du })) }); }
        catch (err) { throw new Error(T('loiAnh').replace('{ten}', f.tv[can[j].i].ten) + err.message); }
      }
      $('#fMan').innerHTML = '<div class="f-the f-xong"><div class="dau">✓</div><h1>' + T('xong') + '</h1><p>' + T('xongMo') + '</p><button type="button" class="f-nut" id="fSua">' + T('suaLai') + '</button></div>';
      window.scrollTo({ top: 0 });
      $('#fSua').onclick = () => nap();
    } catch (err) {
      $('#fLoi').textContent = err.message; $('#fLoi').classList.remove('an');
      $('#fGui').disabled = false; $('#fGui').textContent = T('gui');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function nap() {
    try {
      S.d = await api('/api/form/' + MA);
      const q = new URLSearchParams(location.search).get('lang');
      if (!S.chonLang) S.lang = q === 'en' || q === 'vi' ? q : S.d.lang;
      ve();
    } catch (err) {
      $('#fMan').innerHTML = '<div class="f-the"><p class="f-mo">' + e(CHU[S.lang].loiTaiVe + err.message) + '</p></div>';
    }
  }
  $$('[data-lang]').forEach((b) => { b.onclick = () => { if (!S.d) return; giuLai(); S.lang = b.dataset.lang; S.chonLang = true; ve(); }; });
  if (!MA) { $('#fMan').innerHTML = '<div class="f-the"><p class="f-mo">Liên kết không đúng / Invalid link</p></div>'; return; }
  nap();
})();
