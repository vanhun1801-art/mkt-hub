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
          '<td contenteditable>' + e(tenGon(h.ten)) + (h.nhom === 'Lưu trú' && h.demLuot ? ' <span class="id-mui">· ' + h.demLuot + ' đêm</span>' : '') + '</td>' +
          (S.doiTac ? '' : '<td>' + e(h.nhaCungCap || '') + '</td>') + '<td>' + e(khachCua(g)) + '</td><td contenteditable>' + e(boLink(h.diemHen)) + '</td></tr>'; }).join('') +
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

    $('#idSach').innerHTML = '<section class="id-to">' +
      '<div class="id-dau">' + logoHtml + '<div class="id-dau-phai"><b>Thông tin đoàn</b>' + e([ht.maTourwell && 'Mã đặt chỗ ' + ht.maTourwell, ht.ma].filter(Boolean).join(' · ')) + '</div></div>' +
      '<h1 class="id-tieu-de" contenteditable>Đoàn KOL <em>' + e(ten) + '</em></h1>' +
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
      '<div class="id-muc dai"><h3 class="id-h3">Danh sách hành khách · ' + tv.length + '</h3>' + bangKhach + '</div>' +
      '<div class="id-muc"><h3 class="id-h3">Lưu ý cho đơn vị tiếp nhận</h3><ul class="id-luu-y" contenteditable>' + luuY.map((s) => '<li>' + s + '</li>').join('') + '</ul></div>' +
      '<div class="id-chan"><span><b>Rooty Trip Phú Quốc</b>' + (lienHe ? ' · Liên hệ: ' + e(lienHe) : '') + '</span><span>Xuất lúc ' + hhmm(Date.now()) + ' ' + ngayDu(Date.now()) + '</span></div>' +
      '</section>';

    tt(tv.length + ' hành khách · ' + dv.length + ' dịch vụ' + (S.doiTac ? ' của ' + S.doiTac : '') + ' · bấm vào chữ trên tờ để sửa, rồi Lưu PDF');
    $('#idIn').disabled = false;
    $('#idCsv').disabled = !tv.length;
  }

  /* CSV có BOM để Excel đọc đúng tiếng Việt; ô bắt đầu bằng = + - @ thêm dấu ' để Excel không chạy thành công thức */
  function taiCsv() {
    const { ht, kol, tv } = D;
    const o = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
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

  $('#idDoiTac').onchange = (ev) => { S.doiTac = ev.target.value; ve(); };
  $('#idKenh').onchange = (ev) => { S.kenh = ev.target.checked; ve(); };
  $('#idGiay').onchange = (ev) => { S.giay = ev.target.checked; ve(); };
  $('#idIn').onclick = () => window.print();
  $('#idCsv').onclick = taiCsv;
  nap().catch((err) => {
    tt('Không dựng được');
    $('#idSach').innerHTML = '<div class="id-loi">' + e(err.message) + '</div>';
  });
})();
