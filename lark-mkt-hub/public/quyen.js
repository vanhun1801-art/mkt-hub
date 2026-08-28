'use strict';
/*
 * NGƯỜI DÙNG & PHÂN QUYỀN — màn hình chỉ quản lý thấy.
 *
 * Hai màn trong cùng một hộp thoại:
 *   1. DANH SÁCH — mỗi người một dòng, đọc là hiểu: vị trí, vai, base được xem,
 *      và quan trọng nhất là cột "Nhận diện" cho biết app có nhận ra người đó
 *      chưa. Trước đây phần này vô hình, nên sửa quyền mà không thấy tác dụng thì
 *      không biết vì sao.
 *   2. FORM — thêm/sửa một người, mỗi thứ một dòng có nhãn và câu giải thích.
 *
 * Dữ liệu nằm trong bảng "Phân quyền app" của Lark Base: sửa ở đây hay sửa thẳng
 * trên Lark đều được, và không mất sau mỗi lần deploy.
 */

/* Ba tùy chọn dành cho nhân sự — mô tả ngắn để quản lý biết mình đang bật gì. */
const QUYEN_CO = [
  { k: 'toanBo', ten: 'Xem toàn bộ', mo: 'Thấy dữ liệu cả phòng, không chỉ việc của mình' },
  { k: 'taoMoi', ten: 'Được tạo mới', mo: 'Tạo việc / lịch mới trong base' },
  { k: 'chiPhi', ten: 'Xem chi phí', mo: 'Thấy các con số tiền' },
];

const chuanTenQ = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/* ---------------- nạp & điều phối ---------------- */
async function modalPhanQuyen() {
  moModal('Người dùng & phân quyền',
    '<div class="trong"><span class="spin"></span> Đang đọc bảng phân quyền…</div>',
    chanDanhSach(), true);
  $('#qVeCaiDat').onclick = modalCaiDat;
  try {
    S.quyen = await goi('/api/quyen?refresh=1');
  } catch (e) {
    $('#mdBody').innerHTML = '<div class="canh-bao do"><span class="grow">' + esc(e.message) + '</span></div>';
    return;
  }
  veDanhSachQuyen();
}

const chanDanhSach = () =>
  '<button class="btn ghost" id="qVeCaiDat">Về Cài đặt</button>' +
  '<span class="grow"></span>' +
  '<button class="btn ghost" data-close="1">Đóng</button>';

/** Cách app sẽ nhận ra người này khi họ đăng nhập — hiện thành một nhãn màu. */
function nhanDien(h, ds) {
  if (h.email) return { loai: 'luc', chu: 'Theo email', mo: 'Chắc nhất — email không đổi giữa các app Lark' };
  if (h.openId) return { loai: 'luc', chu: 'Đã đăng nhập', mo: 'App đã ghi nhận đúng tài khoản của người này' };
  const trung = ds.filter((x) => chuanTenQ(x.nguoi) === chuanTenQ(h.nguoi)).length;
  if (trung > 1) {
    return { loai: 'do', chu: 'Trùng tên',
      mo: 'Có ' + trung + ' dòng cùng tên nên app không dám đoán — phải điền email' };
  }
  return { loai: 'vang', chu: 'Theo tên',
    mo: 'Chưa có email và chưa đăng nhập lần nào — điền email cho chắc' };
}

/* ---------------- màn 1: danh sách ---------------- */
function veDanhSachQuyen() {
  const d = S.quyen || {};
  const base = d.base || [];
  const ds = (d.hang || []).slice().sort((a, b) => (a.nguoi || '').localeCompare(b.nguoi || '', 'vi'));
  S.quyenHang = ds;

  if (d.loiBang) return veLoiBang(d, base);

  const toiLa = (h) => {
    const t = (S.hub && S.hub.toi) || {};
    const mail = String(t.email || '').toLowerCase();
    return !!((mail && h.email === mail) || (t.ten && chuanTenQ(t.ten) === chuanTenQ(h.nguoi)));
  };

  const tenBase = (id) => (base.find((b) => b.id === id) || {}).ten || id;
  const oBase = (h) => (!h.base || !h.base.length
    ? '<span class="q-chip q-chip-mo">Tất cả ' + base.length + ' base</span>'
    : h.base.map((id) => '<span class="q-chip">' + esc(tenBase(id)) + '</span>').join(''));

  const oQuyen = (h) => {
    if (h.vai === 'Quản lý') return '<span class="q-chip q-chip-mo">toàn quyền</span>';
    const bat = QUYEN_CO.filter((q) => h[q.k]);
    if (!bat.length) return '<span class="q-nhat">mặc định</span>';
    return bat.map((q) => '<span class="q-chip">' + esc(q.ten) + '</span>').join('');
  };

  const dong = (h, i) => {
    const nd = nhanDien(h, ds);
    return '<tr>' +
      '<td><div class="q-ten-o"><b>' + esc(h.nguoi || '(chưa đặt tên)') + '</b>' +
        (toiLa(h) ? '<span class="q-chip q-chip-toi">Bạn</span>' : '') + '</div></td>' +
      '<td>' + (h.email ? esc(h.email) : '<span class="q-nhat">chưa có</span>') + '</td>' +
      '<td>' + (h.viTri ? '<span class="q-chip">' + esc(h.viTri) + '</span>' : '<span class="q-nhat">—</span>') + '</td>' +
      '<td><span class="q-vai-o ' + (h.vai === 'Quản lý' ? 'ql' : 'ns') + '">' +
        (h.vai === 'Quản lý' ? 'Quản lý' : 'Nhân sự') + '</span></td>' +
      '<td><div class="q-chips">' + oBase(h) + '</div></td>' +
      '<td><div class="q-chips">' + oQuyen(h) + '</div></td>' +
      '<td><span class="q-chip q-nd-' + nd.loai + '" title="' + esc(nd.mo) + '">' + esc(nd.chu) + '</span></td>' +
      '<td><div class="thao-tac">' +
        '<button class="btn nho ghost" data-sua="' + i + '">Sửa</button>' +
        '<button class="btn nho ghost" data-xemnhu="' + i + '" title="Mở cả app bằng đúng con mắt của người này">Xem như</button>' +
        '<button class="btn nho do" data-xoaq="' + esc(h.recordId) + '">Xoá</button>' +
      '</div></td></tr>';
  };

  let html = '<div class="q-dau">' +
    '<div><b>' + ds.length + ' người đã khai</b>' +
      '<div class="kh-sub">Ai chưa có trong danh sách thì thấy đủ ' + base.length +
      ' base với vai nhân sự.</div></div>' +
    '<span class="grow"></span>' +
    '<a class="btn ghost nho" href="' + esc(d.larkUrl || '#') + '" target="_blank" rel="noreferrer">Mở bảng trong Lark</a>' +
    '<button class="btn primary" id="qThemNguoi">Thêm người dùng</button>' +
    '</div>';

  html += '<div class="q-cuon"><table class="bang bang-nguoi"><thead><tr>' +
    '<th>Họ tên</th><th>Email</th><th>Vị trí</th><th>Vai trò</th>' +
    '<th>Base được xem</th><th>Quyền thêm</th><th>Nhận diện</th><th></th>' +
    '</tr></thead><tbody>' +
    (ds.length ? ds.map(dong).join('')
      : '<tr><td colspan="8" class="trong">Chưa khai ai. Bấm Thêm người dùng để bắt đầu.</td></tr>') +
    '</tbody></table></div>';

  const thieu = ds.filter((h) => !h.email && !h.openId).length;
  if (thieu) {
    html += '<div class="canh-bao" style="margin-top:12px"><span class="grow">' +
      thieu + ' người chưa có email và chưa đăng nhập lần nào — app đang nhận diện theo tên. ' +
      'Điền email là chắc nhất: email công ty hay email đăng nhập Lark đều được, app khớp cả hai.' +
      '</span></div>';
  }

  html += '<div class="q-ghi">Sửa xong có hiệu lực ngay — người đó chỉ cần tải lại trang. ' +
    'Muốn kiểm tra họ thấy gì thì bấm <b>Xem như</b>; đang xem hộ thì mọi thao tác ghi bị chặn.' +
    (d.env_quan_ly && d.env_quan_ly.length
      ? '<br>Người khai trong biến môi trường luôn giữ vai quản lý: ' + d.env_quan_ly.map(esc).join(', ') + '.'
      : '') +
    '</div>';

  $('#mdTitle').textContent = 'Người dùng & phân quyền';
  $('#mdFoot').innerHTML = chanDanhSach();
  $('#qVeCaiDat').onclick = modalCaiDat;
  $('#mdBody').innerHTML = html;
  $('#qThemNguoi').onclick = () => moFormQuyen(null);
}

function veLoiBang(d, base) {
  const thieuKhoa = /LARK_APP_ID|APP_SECRET|lark-cli/.test(d.loiBang);
  $('#mdBody').innerHTML =
    '<div class="canh-bao do"><span class="grow">' +
    (thieuKhoa
      ? 'Máy này chưa đọc được bảng phân quyền (thiếu khoá app hoặc lark-cli). ' +
        'Phân quyền trên link đã deploy, hoặc sửa trực tiếp trong Lark.'
      : 'Không đọc được bảng phân quyền: ' + esc(d.loiBang)) +
    '</span></div>' +
    '<div class="q-dau"><a class="btn primary" href="' + esc(d.larkUrl || '#') +
    '" target="_blank" rel="noreferrer">Mở bảng phân quyền trong Lark</a><span class="grow"></span></div>' +
    '<div class="q-ghi">Bảng gồm: Người · Email · open_id · Vai · Vị trí · Base được xem (id các base, ' +
    'cách nhau bằng dấu phẩy: ' + base.map((b) => esc(b.id)).join(', ') + ') · ' +
    'Xem toàn bộ base · Được tạo mới · Xem chi phí.</div>';
}

/* ---------------- màn 2: form một người ---------------- */
function moFormQuyen(i) {
  const d = S.quyen || {};
  const base = d.base || [];
  const moi = i == null;
  const h = moi
    ? { recordId: '', nguoi: '', email: '', openId: '', vai: 'Nhân sự', viTri: '',
        base: [], toanBo: false, taoMoi: true, chiPhi: false, ghiChu: '' }
    : S.quyenHang[i];
  S.quyenSua = Object.assign({}, h);

  const hang = (nhan, noi, ghi) =>
    '<div class="q-hang"><label>' + nhan + '</label><div class="q-o">' + noi +
    (ghi ? '<div class="q-ghi-nho">' + ghi + '</div>' : '') + '</div></div>';

  let html = '<div class="q-form">';

  if (moi) {
    html += hang('Chọn từ danh bạ',
      '<select class="q-in" id="fNguoiMoi"><option value="">— chọn người —</option>' +
      (d.danhBa || []).map((x) => '<option value="' + esc(x.id) + '" data-mail="' + esc(x.email || '') + '">' +
        esc(x.ten) + '</option>').join('') + '</select>',
      'Chọn xong app tự điền tên, và cả email nếu Lark có.');
  }

  html += hang('Họ tên', '<input class="q-in" id="fTen" type="text" value="' + esc(h.nguoi) +
    '" placeholder="Nguyễn Văn A">');
  html += hang('Email',
    '<input class="q-in" id="fMail" type="text" value="' + esc(h.email) + '" placeholder="email@rootytrip.com">',
    'Email công ty hay email đăng nhập Lark đều được — app khớp cả hai. Bỏ trống thì phải nhận diện theo tên.');

  html += hang('Vị trí công việc',
    '<select class="q-in" id="fViTri"><option value="">— chọn vị trí —</option>' +
    (d.viTri || []).map((v) => '<option value="' + esc(v.ten) + '"' + (h.viTri === v.ten ? ' selected' : '') +
      '>' + esc(v.ten) + '</option>').join('') + '</select>',
    'Chọn vị trí là các ô bên dưới tự tick theo mẫu — sửa tay lại được.');

  html += hang('Vai trò',
    '<select class="q-in" id="fVai">' +
    '<option value="Nhân sự"' + (h.vai === 'Quản lý' ? '' : ' selected') + '>Nhân sự — chỉ việc của mình</option>' +
    '<option value="Quản lý"' + (h.vai === 'Quản lý' ? ' selected' : '') + '>Quản lý — toàn quyền</option>' +
    '</select>');

  html += hang('Base được xem',
    '<div class="q-nhom" id="fBase">' + base.map((b) => {
      const het = !h.base || !h.base.length;
      return '<label class="q-ck"><input type="checkbox" data-base="' + esc(b.id) + '"' +
        (het || h.base.includes(b.id) ? ' checked' : '') + '><span>' + esc(b.ten) + '</span></label>';
    }).join('') + '</div>',
    'Bỏ tick base nào thì base đó biến khỏi panel của họ, và API cũng chặn luôn.');

  html += hang('Quyền thêm cho nhân sự',
    '<div class="q-nhom" id="fQuyen">' + QUYEN_CO.map((q) =>
      '<label class="q-ck"><input type="checkbox" data-q="' + q.k + '"' + (h[q.k] ? ' checked' : '') + '>' +
      '<span>' + esc(q.ten) + '</span><small class="q-nhat">— ' + esc(q.mo) + '</small></label>').join('') +
    '</div>');

  html += hang('Ghi chú', '<input class="q-in" id="fGhiChu" type="text" value="' + esc(h.ghiChu || '') +
    '" placeholder="(không bắt buộc)">');
  html += '</div>';

  $('#mdTitle').textContent = moi ? 'Thêm người dùng' : 'Sửa quyền · ' + (h.nguoi || h.email);
  $('#mdBody').innerHTML = html;
  $('#mdFoot').innerHTML =
    '<button class="btn ghost" id="fQuayLai">← Danh sách</button>' +
    '<span class="grow"></span>' +
    '<button class="btn primary" id="fLuu">Lưu</button>' +
    '<button class="btn ghost" data-close="1">Đóng</button>';

  $('#fQuayLai').onclick = veDanhSachQuyen;
  $('#fLuu').onclick = luuFormQuyen;

  const selMoi = $('#fNguoiMoi');
  if (selMoi) {
    selMoi.onchange = () => {
      if (!selMoi.value) return;
      const o = selMoi.options[selMoi.selectedIndex];
      S.quyenSua.openId = selMoi.value;
      $('#fTen').value = o.textContent;
      if (!$('#fMail').value) $('#fMail').value = o.getAttribute('data-mail') || '';
    };
  }

  const selVT = $('#fViTri');
  if (selVT) {
    selVT.onchange = () => {
      const mau = (d.viTri || []).find((v) => v.ten === selVT.value);
      if (!mau) return;
      $$('#fBase [data-base]').forEach((ck) => { ck.checked = (mau.base || []).includes(ck.dataset.base); });
      QUYEN_CO.forEach((q) => {
        const ck = $('#fQuyen [data-q="' + q.k + '"]');
        if (ck) ck.checked = !!mau[q.k];
      });
      $('#fVai').value = mau.vai === 'Quản lý' ? 'Quản lý' : 'Nhân sự';
      toast('Đã áp mẫu vị trí ' + mau.ten + (mau.mo ? ' — ' + mau.mo : ''), '');
    };
  }
}

async function luuFormQuyen() {
  const oBase = $$('#fBase [data-base]');
  const chon = oBase.filter((x) => x.checked).map((x) => x.dataset.base);
  const bat = (k) => !!($('#fQuyen [data-q="' + k + '"]') || {}).checked;
  const hang = {
    recordId: S.quyenSua.recordId || '',
    nguoi: $('#fTen').value.trim(),
    email: $('#fMail').value.trim(),
    openId: S.quyenSua.openId || '',
    vai: $('#fVai').value,
    viTri: $('#fViTri').value,
    // tick đủ = không giới hạn, để trống ô trong Base cho dễ đọc
    base: chon.length === oBase.length ? [] : chon,
    toanBo: bat('toanBo'),
    taoMoi: bat('taoMoi'),
    chiPhi: bat('chiPhi'),
    ghiChu: $('#fGhiChu').value.trim(),
  };
  if (!hang.nguoi && !hang.email) { toast('Cần ít nhất họ tên hoặc email', 'do'); return; }
  if (!chon.length) toast('Bỏ tick hết base thì người này vào app không thấy gì', '');

  const nut = $('#fLuu');
  nut.disabled = true;
  nut.textContent = 'Đang lưu…';
  try {
    await goi('/api/quyen', { method: 'POST', body: JSON.stringify(hang) });
    toast('Đã lưu quyền của ' + (hang.nguoi || hang.email), 'luc');
    await modalPhanQuyen();
    napHub();
  } catch (e) {
    toast(e.message, 'do');
    nut.disabled = false;
    nut.textContent = 'Lưu';
  }
}

/* ---------------- xoá / xem như ---------------- */
async function xoaDongQuyen(recordId) {
  try {
    await goi('/api/quyen?recordId=' + encodeURIComponent(recordId), { method: 'DELETE' });
    toast('Đã xoá — người này trở về mặc định', 'luc');
    await modalPhanQuyen();
    napHub();
  } catch (e) {
    toast(e.message, 'do');
  }
}

/**
 * Xem cả app bằng đúng con mắt của một nhân sự: panel chỉ còn base họ được xem,
 * chỉ số bó theo việc của họ. Nạp lại trang để mọi app con nhận danh tính mới.
 */
async function batXemNhu(h) {
  try {
    await goi('/api/xem-nhu', {
      method: 'POST',
      body: JSON.stringify({ id: h.openId || '', ten: h.nguoi || h.email, email: h.email || '' }),
    });
    location.hash = '#/tong-quan';
    location.reload();
  } catch (e) { toast(e.message, 'do'); }
}

async function thoatXemNhu() {
  try {
    await goi('/api/xem-nhu', { method: 'DELETE' });
    location.reload();
  } catch (e) { toast(e.message, 'do'); }
}

document.addEventListener('click', (e) => {
  const sua = e.target.closest('[data-sua]');
  if (sua) { e.preventDefault(); moFormQuyen(Number(sua.getAttribute('data-sua'))); return; }

  const xn = e.target.closest('[data-xemnhu]');
  if (xn) {
    e.preventDefault();
    const h = (S.quyenHang || [])[Number(xn.getAttribute('data-xemnhu'))];
    if (h) batXemNhu(h);
    return;
  }
  if (e.target.closest('#btnThoatXemNhu')) { e.preventDefault(); thoatXemNhu(); return; }

  const xoa = e.target.closest('[data-xoaq]');
  if (xoa) {
    e.preventDefault();
    if (confirm('Xoá dòng này? Người đó trở về mặc định: thấy mọi base, vai nhân sự.')) {
      xoaDongQuyen(xoa.getAttribute('data-xoaq'));
    }
  }
});
