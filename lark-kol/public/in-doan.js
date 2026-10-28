'use strict';
/* ==========================================================================
   Trang in thông tin đoàn gửi đối tác tiếp nhận (anh Hùng 28/10: lịch trình đã có PDF, còn thông
   tin KOL, danh sách hành khách và lưu ý cho chỗ đối tác tiếp nhận thì chưa có chỗ xuất).
     · KOL      — liên hệ + các kênh (bỏ được bằng ô "Kênh KOL")
     · chuyến đi — ngày, số khách, chuyến bay, nơi đón / trả, nơi ở
     · dịch vụ  — các hạng mục đã đặt; chọn một đối tác thì chỉ còn dịch vụ của đối tác đó
     · đoàn     — danh sách hành khách (ẩn được số giấy tờ), kèm tải CSV mở bằng Excel
     · lưu ý    — soạn sẵn từ yêu cầu đặc biệt + ghi chú của từng người, bấm vào sửa được trước khi lưu
   KHÔNG có giá, FOC, ghi chú nội bộ của bảng kê, ảnh giấy tờ.
   ========================================================================== */
(function () {
  const $ = (s, g = document) => g.querySelector(s);
  const $$ = (s, g = document) => [...g.querySelectorAll(s)];
  const e = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const p2 = (n) => String(n).padStart(2, '0');
  const VN = 7 * 3600000, NGAY_MS = 86400000;
  const vn = (ms) => { const d = new Date(ms + VN); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), thu: d.getUTCDay() }; };
  const dauNgay = (ms) => { const t = vn(ms); return Date.UTC(t.y, t.m - 1, t.d) - VN; };
  const hhmm = (ms) => { const t = vn(ms); return p2(t.h) + ':' + p2(t.mi); };
  const ddmm = (ms) => { const t = vn(ms); return p2(t.d) + '/' + p2(t.m); };
  const ngayDu = (ms) => (ms ? ddmm(ms) + '/' + vn(ms).y : '');
  const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const tenGon = (s) => String(s || '').replace(/\s+[—-]\s+(Người lớn|Trẻ em|Em bé)$/i, '').trim();
  const boLink = (s) => String(s || '').replace(/https?:\/\/\S+/g, '').replace(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/g, '').replace(/[\s,;:·-]+$/, '').trim();
  const GIAY_NGAN = { CCCD: 'CCCD', 'Hộ chiếu': 'Hộ chiếu', 'Giấy khai sinh': 'GKS' };
  const GOC = (window.__HUB__ && window.__HUB__.prefix) || '';
  const S = { doiTac: '', kenh: true, giay: true };
  const tt = (s) => { $('#idTrangThai').textContent = s; };
  { const q = new URLSearchParams(location.search).get('dt'); if (q) S.doiTac = q; }

  async function api(u) {
    const r = await fetch(GOC + u);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || 'Lỗi ' + r.status);
    return j;
  }
  const coLogo = () => new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok(im.naturalWidth ? GOC + '/api/logo' : '');
    im.onerror = () => ok('');
    im.src = GOC + '/api/logo';
  });

  /* Vé Người lớn / Trẻ em của cùng một dịch vụ cùng giờ là MỘT dòng, khách cộng lại. */
  function gomDv(hm) {
    const m = new Map();
    for (const h of hm) {
      const k = (h.gioHen || 'n' + (h.ngay || 0)) + '|' + tenGon(h.ten) + '|' + (h.nhaCungCap || '');
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(h);
    }
    return [...m.values()].sort((a, b) => (a[0].gioHen || a[0].ngay || 9e15) - (b[0].gioHen || b[0].ngay || 9e15));
  }
  const khachCua = (g) => g.map((x) => (x.soLuong ? x.soLuong + ' ' + String(x.loaiKhach || 'khách').toLowerCase() : '')).filter(Boolean).join(' + ');

  let D = null;   // dữ liệu đã nạp, đổi lựa chọn trên thanh công cụ chỉ vẽ lại

  async function nap() {
    const id = new URLSearchParams(location.search).get('ht');
    if (!id) throw new Error('Thiếu mã hợp tác (?ht=…)');
    const [dl, meta, logo] = await Promise.all([api('/api/du-lieu'), api('/api/meta').catch(() => ({})), coLogo()]);
    const ht = dl.hopTac.find((h) => h.id === id);
    if (!ht) throw new Error('Không tìm thấy hợp tác này');
    const kol = dl.kol.find((k) => k.id === ht.kol) || {};
    D = {
      ht, kol, logo, lienHe: String(meta.lienHeKol || '').trim(),
      kenh: dl.kenh.filter((k) => k.kol === kol.id),
      hm: dl.hangMuc.filter((h) => h.hopTac === id && h.tinhTrang !== 'Huỷ'),
      tv: (dl.thanhVien || []).filter((x) => x.hopTac === id).sort((a, b) => (a.vaiTro === 'Trưởng đoàn' ? -1 : 0) - (b.vaiTro === 'Trưởng đoàn' ? -1 : 0)),
    };
    const ncc = [...new Set(D.hm.map((h) => String(h.nhaCungCap || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
    $('#idDoiTac').innerHTML = '<option value="">Tất cả dịch vụ</option>' + ncc.map((n) => '<option value="' + e(n) + '">' + e(n) + '</option>').join('');
    if (!ncc.includes(S.doiTac)) S.doiTac = '';
    $('#idDoiTac').value = S.doiTac;
    ve();
  }

  function ve() {
    const { ht, kol, logo, lienHe, kenh, tv } = D;
    const hm = S.doiTac ? D.hm.filter((h) => String(h.nhaCungCap || '').trim() === S.doiTac) : D.hm;
    const dv = gomDv(hm);
    const ten = kol.ten || ht.kolTen || '';
    const tuDen = ht.batDau ? ngayDu(ht.batDau) + (ht.ketThuc && dauNgay(ht.ketThuc) !== dauNgay(ht.batDau) ? ' → ' + ngayDu(ht.ketThuc) : '') : '';
    const soNgay = ht.batDau ? Math.round((dauNgay(ht.ketThuc || ht.batDau) - dauNgay(ht.batDau)) / NGAY_MS) + 1 : 0;
    const khoang = soNgay ? soNgay + ' ngày' + (soNgay > 1 ? ' ' + (soNgay - 1) + ' đêm' : '') : '';
    const doan = [[ht.nguoiLon, 'người lớn'], [ht.treEm, 'trẻ em'], [ht.emBe, 'em bé']].filter(([n]) => n > 0).map(([n, t]) => n + ' ' + t).join(' · ');
    const tongKhach = (ht.nguoiLon || 0) + (ht.treEm || 0) + (ht.emBe || 0);
    const luuTru = [...new Map(hm.filter((h) => h.nhom === 'Lưu trú' && !/bữa|ăn sáng|ăn tối/i.test(h.ten))
      .map((h) => { const t = h.nhaCungCap || tenGon(h.ten); return [t, { t, ngay: h.ngay, dem: h.demLuot }]; })).values()];
    const truong = tv.find((x) => x.vaiTro === 'Trưởng đoàn');
    document.title = 'Thông tin đoàn · ' + ten + (S.doiTac ? ' · ' + S.doiTac : '') + (ht.batDau ? ' · ' + ddmm(ht.batDau).replace('/', '-') : '');

    const o = (nhan, gt, rong) => (gt ? '<div class="id-o' + (rong ? ' rong' : '') + '"><small>' + nhan + '</small><div>' + gt + '</div></div>' : '');
    const logoHtml = logo ? '<img class="id-logo" src="' + e(logo) + '" alt="Rooty Trip">' : '<span class="id-chu-logo">Rooty <i>trip</i></span>';

    /* lưu ý soạn sẵn: chỉ những câu có căn cứ trong dữ liệu, còn lại người gửi tự gõ thêm */
    const luuY = [];
    String(ht.yeuCauDacBiet || '').split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((s) => luuY.push(e(s)));
    tv.filter((x) => String(x.ghiChu || '').trim()).forEach((x) => luuY.push('<b>' + e(x.ten) + '</b>: ' + e(x.ghiChu.trim())));
    if (ht.emBe > 0) luuY.push('Đoàn có ' + ht.emBe + ' em bé dưới 1m.');
    if (ht.bayDen || ht.noiDon) luuY.push('Đoàn tới ' + e([ht.bayDen && 'chuyến bay ' + ht.bayDen, ht.noiDon && 'đón tại ' + boLink(ht.noiDon)].filter(Boolean).join(', ')) + '.');
    luuY.push('Đây là đoàn KOL hợp tác truyền thông với Rooty Trip, sẽ quay và chụp nội dung trong lúc sử dụng dịch vụ. Mong anh chị hỗ trợ góc quay và giới thiệu điểm đặc trưng.');
    if (lienHe) luuY.push('Phát sinh trong chuyến, vui lòng báo Rooty Trip: ' + e(lienHe) + '.');

    const bangDv = dv.length ? '<div class="id-bang-boc"><table class="id-bang"><thead><tr><th>Ngày</th><th>Giờ</th><th>Dịch vụ</th>' + (S.doiTac ? '' : '<th>Đối tác</th>') + '<th>Khách</th><th>Điểm hẹn</th></tr></thead><tbody>' +
      dv.map((g) => { const h = g[0]; const d = h.gioHen || h.ngay;
        return '<tr><td class="so">' + (d ? THU[vn(d).thu] + ' ' + ddmm(d) : '') + '</td><td class="so">' + (h.gioHen ? hhmm(h.gioHen) : '') + '</td>' +
          '<td>' + e(tenGon(h.ten)) + (h.nhom === 'Lưu trú' && h.demLuot ? ' <span class="id-mui">· ' + h.demLuot + ' đêm</span>' : '') + '</td>' +
          (S.doiTac ? '' : '<td>' + e(h.nhaCungCap || '') + '</td>') + '<td>' + e(khachCua(g)) + '</td><td>' + e(boLink(h.diemHen)) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<div class="id-mui" style="font-size:12px">Chưa có dịch vụ nào trong bảng kê' + (S.doiTac ? ' của ' + e(S.doiTac) : '') + '.</div>';

    /* khổ dọc chỉ đủ chỗ cho 9 cột: loại giấy đi chung ô với số, cột trống cả đoàn (hết hạn, SĐT) thì bỏ */
    const coHet = S.giay && tv.some((x) => x.ngayHet), coSdt = tv.some((x) => x.sdt);
    const bangKhach = tv.length ? '<div class="id-bang-boc"><table class="id-bang id-khach"><thead><tr><th>#</th><th>Họ tên</th><th>Nhóm</th><th>Giới tính</th><th>Ngày sinh</th><th>Quốc tịch</th>' +
      (S.giay ? '<th>Giấy tờ · số</th><th>Ngày cấp</th>' + (coHet ? '<th>Hết hạn</th>' : '') : '') + (coSdt ? '<th>SĐT</th>' : '') + '</tr></thead><tbody>' +
      tv.map((x, i) => '<tr><td class="so">' + (i + 1) + '</td><td class="ten"><b>' + e(x.ten) + '</b>' + (x.vaiTro === 'Trưởng đoàn' ? '<span class="id-nhan">Trưởng đoàn</span>' : '') + '</td>' +
        '<td>' + e(x.nhomKhach || '') + '</td><td>' + e(x.gioiTinh || '') + '</td><td class="so">' + ngayDu(x.ngaySinh) + '</td><td>' + e(x.quocTich || '') + '</td>' +
        (S.giay ? '<td class="so"><span class="id-mui">' + e(GIAY_NGAN[x.loaiGiay] || x.loaiGiay || '') + '</span> ' + e(x.soGiay || '') + '</td><td class="so">' + ngayDu(x.ngayCap) + '</td>' +
          (coHet ? '<td class="so">' + ngayDu(x.ngayHet) + '</td>' : '') : '') +
        (coSdt ? '<td class="so">' + e(x.sdt || '') + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>' +
      (tongKhach && tongKhach !== tv.length ? '<div class="id-tong">Danh sách có ' + tv.length + ' người, đoàn khai ' + tongKhach + ' khách.</div>' : '')
      : '<div class="id-mui" style="font-size:12px">KOL chưa điền danh sách đoàn.</div>';

    const to = '<section class="id-to" contenteditable spellcheck="false">' +
      '<div class="id-dau">' + logoHtml + '<div class="id-dau-phai"><b>Thông tin đoàn</b>' + e([ht.maTourwell && 'Mã đặt chỗ ' + ht.maTourwell, ht.ma].filter(Boolean).join(' · ')) + '</div></div>' +
      '<h1 class="id-tieu-de">Đoàn KOL <em>' + e(ten) + '</em></h1>' +
      '<div class="id-khoang">' + e([khoang, tuDen, doan].filter(Boolean).join(' · ')) + '</div>' +
      (S.doiTac ? '<div class="id-gui">Gửi ' + e(S.doiTac) + '</div>' : '') +

      '<div class="id-muc"><h3 class="id-h3">Chuyến đi</h3><div class="id-luoi">' +
        o('Thời gian', e([khoang, tuDen].filter(Boolean).join(' · '))) + o('Số khách', e(doan)) + o('Mã đặt chỗ', e(ht.maTourwell || '')) +
        o('Chuyến bay đến', e(ht.bayDen || '')) + o('Chuyến bay về', e(ht.bayVe || '')) +
        o('Nơi đón', e(boLink(ht.noiDon))) + o('Nơi trả', e(boLink(ht.noiTra))) +
        o('Nơi lưu trú', luuTru.map((l) => '<div>' + e(l.t) + (l.ngay ? ' <span class="id-mui">· nhận phòng ' + ddmm(l.ngay) + (l.dem ? ', ' + l.dem + ' đêm' : '') + '</span>' : '') + '</div>').join(''), true) +
      '</div></div>' +

      '<div class="id-muc"><h3 class="id-h3">KOL · người liên hệ</h3><div class="id-luoi">' +
        o('Họ tên', e(ten) + (kol.xungHo ? ' <span class="id-mui">(' + e(kol.xungHo + ' ' + (kol.tenGoi || '')).trim() + ')</span>' : '')) + o('Quốc gia', e(kol.quocGia || '')) +
        o('Điện thoại', e(kol.sdt || (truong && truong.sdt) || '')) + o('Email', e(kol.email || '')) + o('Liên hệ khác', e(kol.lienHe || '')) +
        o('Trưởng đoàn', truong && truong.ten !== ten ? e(truong.ten) + (truong.sdt ? ' · ' + e(truong.sdt) : '') : '') +
      '</div>' +
      (S.kenh && kenh.length ? '<div class="id-bang-boc" style="margin-top:2mm"><table class="id-bang"><thead><tr><th>Nền tảng</th><th>Tên kênh</th><th>Link</th><th>Theo dõi</th></tr></thead><tbody>' +
        kenh.map((k) => '<tr><td>' + e(k.nenTang || '') + (k.reup ? '<span class="id-nhan">re-up</span>' : '') + '</td><td><b>' + e(k.ten || '') + '</b></td>' +
          '<td>' + (k.link ? '<a href="' + e(k.link) + '" target="_blank" rel="noopener">' + e(k.link.replace(/^https?:\/\/(www\.)?/, '')) + '</a>' : '') + '</td>' +
          '<td class="so">' + (k.theoDoi != null ? Number(k.theoDoi).toLocaleString('vi-VN') : '') + '</td></tr>').join('') + '</tbody></table></div>' : '') +
      '</div>' +

      '<div class="id-muc dai"><h3 class="id-h3">' + (S.doiTac ? 'Dịch vụ đặt tại ' + e(S.doiTac) : 'Dịch vụ đã đặt') + '</h3>' + bangDv + '</div>' +
      '<div class="id-muc dai"><h3 class="id-h3">Danh sách hành khách · <span class="id-dem">' + tv.length + '</span></h3>' + bangKhach + '</div>' +
      '<div class="id-muc"><h3 class="id-h3">Lưu ý cho đơn vị tiếp nhận</h3><ul class="id-luu-y">' + luuY.map((s) => '<li>' + s + '</li>').join('') + '</ul></div>' +
      '<div class="id-chan"><span><b>Rooty Trip Phú Quốc</b>' + (lienHe ? ' · Liên hệ: ' + e(lienHe) : '') + '</span><span>Xuất lúc ' + hhmm(Date.now()) + ' ' + ngayDu(Date.now()) + '</span></div>' +
      '</section>';

    /* có bản đã sửa cho đúng lựa chọn này thì dựng lại bản đó, không dựng bản gốc đè lên */
    S.khoa = 'kol.in-doan.' + ht.id + '|' + S.doiTac + '|' + (S.kenh ? 1 : 0) + (S.giay ? 1 : 0);
    S.goc = to; S.lui = [];
    const daSua = docSua();
    anCong();
    $('#idSach').innerHTML = daSua ? daSua.html : to;
    S.tom = tv.length + ' hành khách · ' + dv.length + ' dịch vụ' + (S.doiTac ? ' của ' + S.doiTac : '');
    baoSua(daSua && daSua.at);
    $('#idIn').disabled = false;
    $('#idCsv').disabled = !tv.length;
  }

  /* CSV có BOM để Excel đọc đúng tiếng Việt; ô bắt đầu bằng = + - @ thêm dấu ' để Excel không chạy thành công thức */
  function taiCsv() {
    const { ht, kol, tv } = D;
    const o = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[,\n;]/.test(s) || s.includes('"') ?'"' + s.replace(/"/g, '""') + '"' : s; };
    const dau = ['STT', 'Họ tên', 'Vai trò', 'Nhóm', 'Giới tính', 'Ngày sinh', 'Quốc tịch'].concat(S.giay ? ['Loại giấy tờ', 'Số giấy tờ', 'Ngày cấp', 'Ngày hết hạn'] : [], ['SĐT']);
    const dong = tv.map((x, i) => [i + 1, x.ten, x.vaiTro || '', x.nhomKhach || '', x.gioiTinh || '', ngayDu(x.ngaySinh), x.quocTich || '']
      .concat(S.giay ? [x.loaiGiay || '', x.soGiay || '', ngayDu(x.ngayCap), ngayDu(x.ngayHet)] : [], [x.sdt || '']));
    const csv = '﻿' + [dau, ...dong].map((r) => r.map(o).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const tenTep = ('Doan ' + (kol.ten || ht.kolTen || ht.ma) + (ht.batDau ? ' ' + ddmm(ht.batDau).replace('/', '-') : '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w -]+/g, '').trim();
    a.download = tenTep + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- chỉnh tờ (anh Hùng 28/10: "cho anh chỉnh trên file PDF này hết các vị trí") ----------
   * Cả tờ sửa chữ được. Rê chuột (hoặc chạm) vào một dòng bảng, một ô thông tin, một câu lưu ý hay tên
   * mục thì hiện nút: đưa lên, đưa xuống, thêm dòng (bảng), xoá. Mỗi lần đổi cất vào máy theo hợp tác
   * + lựa chọn trên thanh công cụ, mở lại vẫn còn; "Bản gốc" bỏ hết chỗ đã sửa. */
  const HAN_SUA = 30 * NGAY_MS;
  function docSua() {
    try { const v = JSON.parse(localStorage.getItem(S.khoa) || 'null'); return v && Date.now() - v.at < HAN_SUA ? v : null; } catch (_) { return null; }
  }
  function catSua() {
    const to = $('.id-to'); if (!to) return;
    const at = Date.now();
    try { localStorage.setItem(S.khoa, JSON.stringify({ at, html: to.outerHTML })); } catch (_) {}
    baoSua(at);
  }
  function baoSua(at) {
    tt(S.tom + (at ? ' · đang dùng bản đã sửa lúc ' + hhmm(at) + ' ' + ddmm(at) : ' · bấm vào chữ để sửa, rê chuột vào dòng để đổi chỗ hay xoá'));
    $('#idGoc').hidden = !at;
    $('#idLui').hidden = !S.lui.length;
  }
  let henCat = 0;
  $('#idSach').addEventListener('input', () => { clearTimeout(henCat); henCat = setTimeout(catSua, 500); });

  const cong = document.createElement('div');
  cong.className = 'id-cong';
  cong.hidden = true;
  document.body.appendChild(cong);
  let dich = null;
  const NUT = { len: ['↑', 'Đưa lên'], xuong: ['↓', 'Đưa xuống'], them: ['+', 'Thêm dòng bên dưới'], xoa: ['×', 'Xoá'] };
  /* thứ có nút: dòng bảng, ô thông tin, câu lưu ý, dòng phụ dưới tiêu đề; trỏ vào tên mục thì là cả mục */
  function chonDich(el) {
    if (!el || !el.closest || !el.closest('.id-to')) return null;
    const h3 = el.closest('.id-h3');
    if (h3) return { el: h3.closest('.id-muc'), nut: ['len', 'xuong', 'xoa'], ten: 'mục' };
    const tr = el.closest('tbody tr');
    if (tr) return { el: tr, nut: ['len', 'xuong', 'them', 'xoa'], ten: 'dòng' };
    const k = el.closest('.id-luu-y li, .id-o, .id-khoang, .id-gui, .id-tong');
    return k ? { el: k, nut: k.matches('.id-khoang, .id-gui, .id-tong') ? ['xoa'] : ['len', 'xuong', 'xoa'], ten: '' } : null;
  }
  function hienCong(d) {
    if (!d || !d.el.isConnected) return anCong();
    dich = d;
    cong.innerHTML = d.nut.map((k) => '<button type="button" data-nut="' + k + '" title="' + NUT[k][1] + (d.ten ? ' ' + d.ten : '') + '"' + (k === 'xoa' ? ' class="xoa"' : '') + '>' + NUT[k][0] + '</button>').join('');
    const r = d.el.getBoundingClientRect();
    cong.hidden = false;
    cong.style.top = Math.max(0, r.top + scrollY - 14) + 'px';
    cong.style.left = Math.max(8, Math.min(document.documentElement.clientWidth - cong.offsetWidth - 8, r.right + scrollX - cong.offsetWidth + 6)) + 'px';
    $$('.id-dang-chon').forEach((x) => x.classList.remove('id-dang-chon'));
    d.el.classList.add('id-dang-chon');
  }
  function anCong() { cong.hidden = true; dich = null; $$('.id-dang-chon').forEach((x) => x.classList.remove('id-dang-chon')); }
  $('#idSach').addEventListener('pointerover', (ev) => { const d = chonDich(ev.target); if (d && (!dich || d.el !== dich.el)) hienCong(d); });
  $('#idSach').addEventListener('pointerleave', (ev) => { if (!cong.contains(ev.relatedTarget)) anCong(); });
  cong.addEventListener('pointerleave', (ev) => { if (!(ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('.id-to'))) anCong(); });
  cong.addEventListener('mousedown', (ev) => ev.preventDefault());   // giữ chỗ con trỏ đang gõ
  /* hàng xóm cùng loại để đổi chỗ (bỏ qua thứ khác loại nằm xen giữa) */
  const cungLoai = (el) => (el.tagName === 'TR' ? 'tr' : el.matches('.id-muc') ? '.id-muc' : el.tagName === 'LI' ? 'li' : '.id-o');
  const keBen = (el, truoc) => {
    let x = truoc ? el.previousElementSibling : el.nextElementSibling;
    while (x && !x.matches(cungLoai(el))) x = truoc ? x.previousElementSibling : x.nextElementSibling;
    return x;
  };
  cong.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-nut]'); if (!b || !dich) return;
    const el = dich.el, k = b.dataset.nut;
    el.classList.remove('id-dang-chon');
    S.lui.push($('.id-to').outerHTML);
    if (S.lui.length > 40) S.lui.shift();
    if (k === 'len') { const x = keBen(el, true); if (x) x.before(el); }
    else if (k === 'xuong') { const x = keBen(el, false); if (x) x.after(el); }
    else if (k === 'them') { const c = el.cloneNode(true); c.querySelectorAll('td').forEach((td) => { td.textContent = ''; }); el.after(c); }
    else if (k === 'xoa') el.remove();
    danhSo();
    catSua();
    if (k === 'xoa') anCong(); else hienCong(dich);
  });
  /* xoá, chèn, đổi chỗ khách thì số thứ tự và số đếm trên tên mục đi theo */
  function danhSo() {
    const b = $('.id-khach tbody'); if (!b) return;
    const ds = [...b.rows];
    ds.forEach((tr, i) => { if (tr.cells[0]) tr.cells[0].textContent = i + 1; });
    const dem = $('.id-dem'); if (dem) dem.textContent = ds.length;
  }
  $('#idLui').onclick = () => {
    const h = S.lui.pop(); if (!h) return;
    anCong(); $('#idSach').innerHTML = h; catSua();
  };
  $('#idGoc').onclick = () => {
    try { localStorage.removeItem(S.khoa); } catch (_) {}
    anCong(); S.lui = []; $('#idSach').innerHTML = S.goc; baoSua(0);
  };

  $('#idDoiTac').onchange = (ev) => { S.doiTac = ev.target.value; ve(); };
  $('#idKenh').onchange = (ev) => { S.kenh = ev.target.checked; ve(); };
  $('#idGiay').onchange = (ev) => { S.giay = ev.target.checked; ve(); };
  $('#idIn').onclick = () => { anCong(); window.print(); };
  $('#idCsv').onclick = taiCsv;
  nap().catch((err) => {
    tt('Không dựng được');
    $('#idSach').innerHTML = '<div class="id-loi">' + e(err.message) + '</div>';
  });
})();
