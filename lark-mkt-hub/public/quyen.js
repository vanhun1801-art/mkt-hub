'use strict';
/*
 * Phân quyền thành viên — cửa sổ chỉ quản lý thấy.
 *
 * Hai việc quản lý làm ở đây:
 *   1. Chọn người này được thấy những base nào (bỏ tick là base biến khỏi panel
 *      của họ, và API của hub cũng chặn luôn — không phải ẩn cho vui).
 *   2. Ba tùy chọn cho nhân sự trong base: xem toàn bộ dữ liệu, được tạo mới,
 *      xem số tiền.
 *
 * Dữ liệu nằm trong bảng "Phân quyền app" của Lark Base, nên sửa ở đây hay sửa
 * thẳng trên Lark đều được, và không mất sau mỗi lần deploy.
 */

/* Ba tùy chọn dành cho nhân sự — mô tả ngắn để quản lý biết mình đang bật gì. */
const QUYEN_CO = [
  { k: 'toanBo', ten: 'Xem toàn bộ', mo: 'Thấy dữ liệu cả phòng, không chỉ việc của mình' },
  { k: 'taoMoi', ten: 'Được tạo mới', mo: 'Tạo việc / lịch mới trong base' },
  { k: 'chiPhi', ten: 'Xem chi phí', mo: 'Thấy các con số tiền' },
];

async function modalPhanQuyen() {
  moModal('Phân quyền thành viên',
    '<div class="trong"><span class="spin"></span> Đang đọc bảng phân quyền…</div>',
    '<button class="btn ghost" id="qVeCaiDat">Về Cài đặt</button>' +
    '<button class="btn ghost" data-close="1">Đóng</button>', true);
  $('#qVeCaiDat').onclick = modalCaiDat;
  try {
    S.quyen = await goi('/api/quyen?refresh=1');
  } catch (e) {
    $('#mdBody').innerHTML = '<div class="canh-bao do"><span class="grow">' + esc(e.message) + '</span></div>';
    return;
  }
  veBangQuyen();
}

function veBangQuyen() {
  const d = S.quyen || {};
  const base = d.base || [];
  // dòng chưa lưu (chưa có recordId) xuống cuối để quản lý thấy ngay mình vừa thêm gì
  const ds = (d.hang || []).slice().sort((a, b) =>
    (a.recordId ? 0 : 1) - (b.recordId ? 0 : 1) ||
    (a.nguoi || '').localeCompare(b.nguoi || '', 'vi'));

  const oBase = (h) => base.map((b) => {
    const het = !h.base || !h.base.length;
    return '<label class="q-ck"><input type="checkbox" data-base="' + esc(b.id) + '"' +
      (het || h.base.includes(b.id) ? ' checked' : '') + '>' +
      '<span>' + esc(b.ten) + '</span></label>';
  }).join('');

  const oQuyen = (h) => QUYEN_CO.map((q) =>
    '<label class="q-ck" title="' + esc(q.mo) + '"><input type="checkbox" data-q="' + q.k + '"' +
    (h[q.k] ? ' checked' : '') + '><span>' + esc(q.ten) + '</span></label>').join('');

  const dongHtml = (h, i) =>
    '<tr data-i="' + i + '" data-rec="' + esc(h.recordId || '') + '" data-openid="' + esc(h.openId || '') + '">' +
    '<td><input class="q-in q-ten" type="text" value="' + esc(h.nguoi || '') + '" placeholder="Tên"></td>' +
    '<td><input class="q-in q-mail' + (h.email ? '' : ' q-thieu') + '" type="text" value="' + esc(h.email || '') +
      '" placeholder="email@rootytrip.com" title="' +
      (h.email ? '' : 'Chưa có email — đang phải nhận diện theo tên. Điền email cho chắc.') + '"></td>' +
    '<td><select class="q-in q-vitri" data-i="' + i + '">' +
      '<option value="">— chọn vị trí —</option>' +
      (d.viTri || []).map((v) =>
        '<option value="' + esc(v.ten) + '"' + (h.viTri === v.ten ? ' selected' : '') +
        ' title="' + esc(v.mo || '') + '">' + esc(v.ten) + '</option>').join('') +
    '</select></td>' +
    '<td><select class="q-in q-vai">' +
      '<option value="Nhân sự"' + (h.vai === 'Quản lý' ? '' : ' selected') + '>Nhân sự</option>' +
      '<option value="Quản lý"' + (h.vai === 'Quản lý' ? ' selected' : '') + '>Quản lý</option>' +
    '</select></td>' +
    '<td><div class="q-nhom">' + oBase(h) + '</div></td>' +
    '<td><div class="q-nhom">' + oQuyen(h) + '</div></td>' +
    '<td><div class="thao-tac">' +
      '<button class="btn nho primary" data-luuq="' + i + '">Lưu</button>' +
      (h.recordId
        ? '<button class="btn nho ghost" data-xemnhu="' + i + '" ' +
          'title="Mở cả app bằng đúng con mắt của người này">Xem như</button>' +
          '<button class="btn nho ghost" data-xoaq="' + esc(h.recordId) + '">Xoá</button>'
        : '') +
    '</div></td></tr>';

  /* Đọc bảng thất bại thì KHÔNG bày ô nhập: lưu lúc này dễ tạo dòng trùng với
   * dòng đang có mà mình chưa đọc được. Nói rõ lý do rồi mời sửa thẳng trên Lark. */
  if (d.loiBang) {
    const thieuKhoa = /LARK_APP_ID|APP_SECRET/.test(d.loiBang);
    $('#mdBody').innerHTML =
      '<div class="canh-bao do"><span class="grow">' +
      (thieuKhoa
        ? 'Bản chạy trên máy này (chế độ cli) không có khoá app nên chưa đọc được bảng phân quyền. ' +
          'Phân quyền trên link đã deploy, hoặc sửa trực tiếp trong Lark.'
        : 'Không đọc được bảng phân quyền: ' + esc(d.loiBang)) +
      '</span></div>' +
      '<div class="q-them"><a class="btn primary" href="' + esc(d.larkUrl || '#') +
      '" target="_blank" rel="noreferrer">Mở bảng phân quyền trong Lark</a>' +
      '<span class="grow"></span></div>' +
      '<div class="q-ghi">Bảng gồm: Người · Email · Vai · Base được xem (id các base, ' +
      'cách nhau bằng dấu phẩy: ' + base.map((b) => esc(b.id)).join(', ') + ') · ' +
      'Xem toàn bộ base · Được tạo mới · Xem chi phí.</div>';
    return;
  }

  let html = '<div class="q-them">' +
    '<select id="qNguoiMoi"><option value="">Chọn người trong danh bạ…</option>' +
    (d.danhBa || []).map((x) => '<option value="' + esc(x.id) + '" data-mail="' + esc(x.email || '') + '">' +
      esc(x.ten) + '</option>').join('') +
    '</select>' +
    '<input type="text" id="qMailMoi" placeholder="email@rootytrip.com">' +
    '<button class="btn primary" id="qThem">Thêm dòng</button>' +
    '<span class="grow"></span>' +
    '<a class="btn ghost nho" href="' + esc(d.larkUrl || '#') + '" target="_blank" rel="noreferrer">Mở bảng trong Lark</a>' +
    '</div>';

  html += '<div class="q-cuon"><table class="bang bang-quyen"><thead><tr>' +
    '<th>Người</th><th>Email</th><th>Vị trí</th><th>Vai</th><th>Base được xem</th>' +
    '<th>Tùy chọn cho nhân sự</th><th></th></tr></thead><tbody>' +
    (ds.length ? ds.map(dongHtml).join('')
      : '<tr><td colspan="7" class="trong">Chưa khai ai — mặc định mọi người thấy đủ ' +
        base.length + ' base với vai nhân sự.</td></tr>') +
    '</tbody></table></div>';

  const soThieuMail = ds.filter((h) => h.recordId && !h.email).length;
  if (soThieuMail) {
    html += '<div class="canh-bao" style="margin-top:10px"><span class="grow">' +
      soThieuMail + ' dòng chưa có email nên đang nhận diện theo TÊN. ' +
      'open_id khác nhau giữa các app Lark, nên khai email là chắc nhất — app sẽ tự điền ' +
      'open_id thật khi người đó đăng nhập lần tới. Điền email nào cũng được: email ' +
      'công ty cấp hay email dùng để đăng nhập Lark, app khớp cả hai.</span></div>';
  }

  html += '<div class="q-ghi">Khớp người theo email, rồi open_id, cuối cùng mới tới tên · bỏ tick base nào thì base đó ' +
    'biến khỏi panel của họ · quản lý khai trong biến môi trường luôn giữ vai quản lý' +
    (d.env_quan_ly && d.env_quan_ly.length ? ' (' + d.env_quan_ly.map(esc).join(', ') + ')' : '') +
    '.<br>Chọn <b>Vị trí</b> là các ô tự tick theo mẫu của vị trí đó — sửa tay lại được. ' +
    'Xem toàn bộ và Được tạo mới áp cho Bảng công việc và Lịch tác nghiệp; ' +
    'Xem chi phí áp cho Lịch tác nghiệp.</div>';

  $('#mdBody').innerHTML = html;
  S.quyenHang = ds;

  $('#qThem').onclick = () => {
    const sel = $('#qNguoiMoi');
    const openId = sel.value;
    const opt = openId ? sel.options[sel.selectedIndex] : null;
    const ten = opt ? opt.textContent : '';
    // email gõ tay ưu tiên, không có thì lấy email trong danh bạ (nếu Lark cho)
    const email = $('#qMailMoi').value.trim() || (opt ? opt.getAttribute('data-mail') || '' : '');
    if (!openId && !email) { toast('Chọn người trong danh bạ hoặc nhập email', 'do'); return; }
    if (S.quyenHang.some((h) => email && h.email === email.toLowerCase())) {
      toast('Email này đã có dòng phân quyền', 'do');
      return;
    }
    S.quyen.hang = (S.quyen.hang || []).concat([{
      recordId: '', nguoi: ten, email, openId,
      vai: 'Nhân sự', base: [], toanBo: false, taoMoi: true, chiPhi: false,
    }]);
    veBangQuyen();
  };
}

/** Đọc một dòng đang hiển thị rồi ghi vào Base. */
async function luuDongQuyen(tr) {
  const oBase = [...tr.querySelectorAll('[data-base]')];
  const chon = oBase.filter((x) => x.checked).map((x) => x.dataset.base);
  const bat = (k) => {
    const el = tr.querySelector('[data-q="' + k + '"]');
    return !!(el && el.checked);
  };
  const hang = {
    recordId: tr.dataset.rec || '',
    nguoi: tr.querySelector('.q-ten').value.trim(),
    email: tr.querySelector('.q-mail').value.trim(),
    openId: tr.dataset.openid || '',
    vai: tr.querySelector('.q-vai').value,
    viTri: tr.querySelector('.q-vitri') ? tr.querySelector('.q-vitri').value : '',
    // tick đủ = không giới hạn -> để trống ô trong Base cho dễ đọc
    base: chon.length === oBase.length ? [] : chon,
    toanBo: bat('toanBo'),
    taoMoi: bat('taoMoi'),
    chiPhi: bat('chiPhi'),
  };
  if (!hang.email && !hang.openId) { toast('Dòng này thiếu email — không nhận ra người', 'do'); return; }
  if (!chon.length) { toast('Bỏ tick hết base thì người này vào app không thấy gì', ''); }

  const nut = tr.querySelector('[data-luuq]');
  nut.disabled = true;
  nut.textContent = 'Đang lưu';
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

/**
 * Chọn vị trí công việc -> tick sẵn theo mẫu của vị trí đó. Không tự lưu: quản lý
 * còn sửa tay được cho từng người rồi mới bấm Lưu.
 */
document.addEventListener('change', (e) => {
  const sel = e.target.closest('.q-vitri');
  if (!sel) return;
  const mau = ((S.quyen && S.quyen.viTri) || []).find((v) => v.ten === sel.value);
  if (!mau) return;
  const tr = sel.closest('tr');
  const dsBase = mau.base || [];
  tr.querySelectorAll('[data-base]').forEach((ck) => { ck.checked = dsBase.includes(ck.dataset.base); });
  QUYEN_CO.forEach((q) => {
    const ck = tr.querySelector('[data-q="' + q.k + '"]');
    if (ck) ck.checked = !!mau[q.k];
  });
  const vai = tr.querySelector('.q-vai');
  if (vai) vai.value = mau.vai === 'Quản lý' ? 'Quản lý' : 'Nhân sự';
  toast('Đã áp mẫu vị trí ' + mau.ten + (mau.mo ? ' — ' + mau.mo : '') + '. Bấm Lưu để ghi.', '');
});

document.addEventListener('click', (e) => {
  const xn = e.target.closest('[data-xemnhu]');
  if (xn) {
    e.preventDefault();
    const h = (S.quyenHang || [])[Number(xn.getAttribute('data-xemnhu'))];
    if (h) batXemNhu(h);
    return;
  }
  if (e.target.closest('#btnThoatXemNhu')) { e.preventDefault(); thoatXemNhu(); return; }
  const luu = e.target.closest('[data-luuq]');
  if (luu) { e.preventDefault(); luuDongQuyen(luu.closest('tr')); return; }
  const xoa = e.target.closest('[data-xoaq]');
  if (xoa) {
    e.preventDefault();
    if (confirm('Xoá dòng này? Người đó trở về mặc định: thấy mọi base, vai nhân sự.')) {
      xoaDongQuyen(xoa.getAttribute('data-xoaq'));
    }
  }
});
