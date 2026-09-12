'use strict';
/**
 * Giao diện app Báo cáo công việc.
 *
 * Nguyên tắc dựng màn: giữ nguyên HÌNH DẠNG cái bảng cả phòng đang gõ trong
 * Excel rồi chụp màn hình — cùng thứ tự cột, cùng cách cộng tổng ở dòng cuối.
 * Không ai phải học lại cách làm; khác biệt duy nhất là dữ liệu chảy vào Base
 * chứ không đóng băng trong một tấm ảnh.
 */

const $ = (s, g) => (g || document).querySelector(s);
const $$ = (s, g) => [...(g || document).querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let META = null;
let MAN = 'ngay';
let MOC = Date.now();          // mốc của kỳ đang mở
let DU = null;                 // dữ liệu phiếu đang mở
let BAN = false;               // có thay đổi chưa lưu

/* ---------------- gọi API ---------------- */
async function goi(duong, opts = {}) {
  const r = await fetch(duong, Object.assign({
    headers: { 'content-type': 'application/json' },
  }, opts));
  const raw = await r.text();
  let d = null;
  try { d = raw ? JSON.parse(raw) : {}; } catch (_) { d = null; }
  if (!r.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
  if (d === null) throw new Error('Máy chủ trả về thứ không đọc được');
  return d;
}

let hetToast;
function toast(chu, kieu) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = kieu || '';
  t.textContent = chu;
  clearTimeout(hetToast);
  hetToast = setTimeout(() => t.remove(), 3800);
}

/* ---------------- ngày giờ (khớp ky.js phía máy chủ) ---------------- */
const NGAY_MS = 86400000;
const VN = 7 * 3600000;
const TEN_THU = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

function phanRa(ms) {
  const d = new Date(Number(ms) + VN);
  return {
    nam: d.getUTCFullYear(), thang: d.getUTCMonth() + 1, ngay: d.getUTCDate(),
    gio: d.getUTCHours(), phut: d.getUTCMinutes(),
    thu: d.getUTCDay() === 0 ? 7 : d.getUTCDay(),
  };
}
const p2 = (n) => String(n).padStart(2, '0');
const veNgay = (ms) => { const p = phanRa(ms); return p2(p.ngay) + '/' + p2(p.thang) + '/' + p.nam; };
const veNgayThu = (ms) => TEN_THU[phanRa(ms).thu] + ' ' + veNgay(ms);
const veLuc = (ms) => { const p = phanRa(ms); return veNgay(ms) + ' ' + p2(p.gio) + ':' + p2(p.phut); };
/* Cho <input type=date>: phải là ngày theo giờ VN, không phải theo giờ máy. */
const veISO = (ms) => { const p = phanRa(ms); return p.nam + '-' + p2(p.thang) + '-' + p2(p.ngay); };
const tuISO = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return y ? Date.UTC(y, m - 1, d) - VN : Date.now();
};
function vePhut(p) {
  const n = Math.max(0, Math.round(Number(p) || 0));
  if (n < 60) return n + ' phút';
  const g = Math.floor(n / 60), du = n % 60;
  return du ? g + ' giờ ' + du : g + ' giờ';
}

/* ---------------- khởi động ---------------- */
async function nap() {
  META = await goi('/api/meta');
  $('#phuDe').textContent = META.toi.ten;
  $('#chipToi').textContent = META.toi.quanLy ? 'Quản lý' : 'Nhân sự';
  $('#tabTheoDoi').hidden = !META.toi.quanLy;
  if (META.larkUrl) {
    const b = $('#btnLark');
    b.hidden = false;
    b.onclick = () => window.open(META.larkUrl, '_blank', 'noopener');
  }
  $('#btnXuat').onclick = xuat;
  $$('.tab').forEach((t) => {
    t.onclick = () => {
      if (BAN && !confirm('Còn thay đổi chưa lưu. Rời đi?')) return;
      BAN = false;
      MAN = t.dataset.man;
      MOC = Date.now();
      $$('.tab').forEach((x) => x.classList.toggle('on', x === t));
      ve();
    };
  });
  await ve();
}

/* Nhắc trước khi đóng tab nếu đang gõ dở — báo cáo gõ 10 phút mà mất thì không
 * ai gõ lại lần hai, họ quay về chụp ảnh Excel. */
window.addEventListener('beforeunload', (e) => {
  if (!BAN) return;
  e.preventDefault();
  e.returnValue = '';
});

async function ve() {
  const el = $('#man');
  el.innerHTML = '<p class="phu">Đang tải…</p>';
  try {
    if (MAN === 'theo-doi') return await veTheoDoi(el);
    if (MAN === 'lich-su') return await veLichSu(el);
    return await vePhieu(el, MAN);
  } catch (e) {
    el.innerHTML = '<div class="the"><div class="the-than"><b>Không tải được.</b>' +
      '<p class="phu">' + esc(e.message) + '</p></div></div>';
  }
}

/* ---------------- màn nhập phiếu ---------------- */

async function vePhieu(el, loaiKy) {
  DU = await goi('/api/phieu?ky=' + loaiKy + '&moc=' + MOC + '&moi=1');
  const p = DU.phieu;
  const daNop = p && p.daNop;

  el.innerHTML =
    theDau(loaiKy) +
    (loaiKy === 'ngay' ? theBangNgay(DU) : theTongHop(DU)) +
    theNhanDinh(DU, loaiKy) +
    '<div class="the"><div class="the-than" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<button class="btn chinh" id="btnNop">' + (daNop ? 'Cập nhật báo cáo' : 'Nộp báo cáo') + '</button>' +
      '<button class="btn" id="btnNhap">Lưu nháp</button>' +
      '<span class="phu" id="chuHan">' + esc(cauHan(DU)) + '</span>' +
    '</div></div>';

  gan(loaiKy);
  tinhLai();
}

function theDau(loaiKy) {
  const nhan = loaiKy === 'ngay' ? veNgayThu(DU.ky.tu)
    : loaiKy === 'tuan' ? veNgay(DU.ky.tu) + ' – ' + veNgay(DU.ky.den)
      : 'Tháng ' + p2(phanRa(DU.ky.tu).thang) + '/' + phanRa(DU.ky.tu).nam;
  const p = DU.phieu;
  const tt = !p ? '<span class="nhan-tt xam">Chưa có</span>'
    : p.daNop
      ? '<span class="nhan-tt ' + (p.trangThaiHan === 'tre' ? 'vang' : 'xanh') + '">' +
        (p.trangThaiHan === 'tre' ? esc(p.veHan) : 'Đã nộp') + '</span>'
      : '<span class="nhan-tt vang">Nháp</span>';

  const buoc = loaiKy === 'ngay' ? NGAY_MS : loaiKy === 'tuan' ? 7 * NGAY_MS : 0;
  return '<div class="the"><div class="the-dau">' +
    '<h2>' + esc(nhan) + '</h2>' + tt +
    '<div class="lon"></div>' +
    '<button class="btn nho" id="btnLui">‹ Trước</button>' +
    (loaiKy === 'ngay'
      ? '<input class="in" type="date" id="chonNgay" value="' + veISO(DU.ky.tu) + '">'
      : '') +
    '<button class="btn nho" id="btnToi" ' + (DU.ky.den >= Date.now() ? 'disabled' : '') + '>Sau ›</button>' +
    '<button class="btn nho" id="btnNay">Hiện tại</button>' +
    '</div><div class="the-than phu" data-buoc="' + buoc + '">' +
      (DU.cuaAi && DU.cuaAi.ten ? 'Của <b>' + esc(DU.cuaAi.ten) + '</b> · ' : '') +
      'Hạn nộp <b>' + esc(veLuc(DU.han)) + '</b>' +
    '</div></div>';
}

function cauHan(d) {
  const p = d.phieu;
  if (p && p.daNop) return 'Đã nộp lúc ' + veLuc(p.nopLuc) + ' — ' + p.veHan + '.';
  return Date.now() > d.han
    ? 'Đã quá hạn. Nộp bây giờ vẫn ghi nhận, nhưng đánh dấu là trễ.'
    : 'Còn hạn tới ' + veLuc(d.han) + '.';
}

/* ---- bảng dòng việc (chỉ có ở phiếu NGÀY) ---- */
function theBangNgay(d) {
  const dong = d.dong.length ? d.dong : [dongTrong()];
  const ca = (d.phieu && d.phieu.ca) || 'Cả ngày';
  return '<div class="the">' +
    '<div class="the-dau"><h2>Đầu việc trong ngày</h2>' +
      '<div class="lon"></div>' +
      '<span class="nho">Ca</span>' +
      '<select class="in" id="chonCa">' +
        META.ca.map((c) => '<option value="' + c.ma + '"' +
          (c.ten === ca ? ' selected' : '') + '>' + esc(c.ten) +
          (c.phut ? ' · ' + c.phut + ' phút' : '') + '</option>').join('') +
      '</select>' +
      '<input class="in" id="dmTay" type="number" min="0" step="15" placeholder="số phút" ' +
        'style="width:110px" hidden>' +
    '</div>' +
    '<div class="the-than cuon">' +
      '<table class="bang"><thead><tr>' +
        '<th style="min-width:190px">Công việc</th>' +
        '<th style="width:140px">Nhóm</th>' +
        '<th style="width:92px">Số phút</th>' +
        '<th style="min-width:230px">Tiến độ công việc</th>' +
        '<th style="width:130px">Trạng thái</th>' +
        '<th class="o-nut"></th>' +
      '</tr></thead><tbody id="thanBang">' +
        dong.map(veHang).join('') +
      '</tbody></table>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn nho" id="btnThem">+ Thêm dòng</button>' +
        '<div class="lon"></div>' +
        '<div class="so-hang" id="oTong"></div>' +
      '</div>' +
    '</div></div>';
}

const dongTrong = () => ({ congViec: '', nhom: 'Khác', phut: '', tienDo: '', trangThai: 'Hoàn thành', ghiChu: '' });

function veHang(d) {
  return '<tr>' +
    '<td data-nhan="Công việc"><input class="v-cv" value="' + esc(d.congViec) + '" placeholder="Tên đầu việc"></td>' +
    '<td data-nhan="Nhóm"><select class="v-nhom">' +
      META.nhomViec.map((n) => '<option' + (n === d.nhom ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
    '</select></td>' +
    '<td data-nhan="Số phút" class="so-o"><input class="v-phut" type="number" min="0" step="5" value="' +
      esc(d.phut === 0 ? '' : d.phut) + '" placeholder="0"></td>' +
    '<td data-nhan="Tiến độ"><textarea class="v-td" rows="1" placeholder="Làm tới đâu rồi">' + esc(d.tienDo) + '</textarea></td>' +
    '<td data-nhan="Trạng thái"><select class="v-tt">' +
      META.trangThaiViec.map((n) => '<option' + (n === d.trangThai ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
    '</select></td>' +
    '<td class="o-nut"><button class="btn nho v-xoa" title="Xoá dòng">✕</button></td>' +
  '</tr>';
}

/* ---- phần máy tự cộng (tuần / tháng) ---- */
function theTongHop(d) {
  const t = d.tongHop;
  if (!t) return '';
  const thieu = t.ngayThieu.length
    ? '<p class="phu" style="margin:10px 0 0">Chưa có báo cáo ngày: ' +
      t.ngayThieu.map((x) => '<span class="nhan-tt do" style="margin-right:4px">' +
        esc(x.nhan) + '</span>').join('') + '</p>'
    : '<p class="phu" style="margin:10px 0 0">Đủ báo cáo ngày trong kỳ.</p>';

  return '<div class="the">' +
    '<div class="the-dau"><h2>Máy cộng từ báo cáo ngày</h2>' +
      '<span class="nho">Anh/chị chỉ cần viết nhận định bên dưới</span></div>' +
    '<div class="the-than">' +
      '<div class="so-hang">' +
        oSo(t.soPhieuNgay, 'phiếu ngày') +
        oSo(vePhut(t.tongPhut), 'tổng thời lượng') +
        oSo(t.phanTram == null ? '—' : t.phanTram + '%', 'so với định mức',
          t.phanTram == null ? '' : (t.phanTram >= 100 ? 'xanh' : t.phanTram < 80 ? 'do' : '')) +
      '</div>' +
      (t.theoNhom.length
        ? '<div style="margin-top:14px">' + t.theoNhom.map((n) =>
          '<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">' +
            '<span style="width:130px" class="phu">' + esc(n.ten) + '</span>' +
            '<div class="thanh" style="flex:1"><i style="width:' +
              Math.round((n.phut / Math.max(1, t.theoNhom[0].phut)) * 100) + '%"></i></div>' +
            '<span class="nho" style="width:86px;text-align:right">' + esc(vePhut(n.phut)) + '</span>' +
          '</div>').join('') + '</div>'
        : '') +
      thieu +
    '</div></div>';
}

function oSo(so, nhan, mau) {
  return '<div class="so-o"><div class="so ' + (mau || '') + '">' + esc(so) + '</div>' +
    '<div class="nhan">' + esc(nhan) + '</div></div>';
}

function theNhanDinh(d, loaiKy) {
  const p = d.phieu || {};
  return '<div class="the"><div class="the-dau"><h2>Nhận định</h2>' +
    '<span class="nho">' + (loaiKy === 'ngay'
      ? 'Không bắt buộc' : 'Phần này máy không viết thay được') + '</span></div>' +
    '<div class="the-than">' +
      '<label class="phu">Nhận định về kỳ này</label>' +
      '<textarea class="in" id="txNhanDinh" placeholder="Việc chạy tốt ở đâu, vướng ở đâu, vì sao">' +
        esc(p.nhanDinh || '') + '</textarea>' +
      '<label class="phu" style="display:block;margin-top:12px">Kế hoạch kỳ sau</label>' +
      '<textarea class="in" id="txKeHoach" placeholder="Kỳ tới tập trung vào gì">' +
        esc(p.keHoach || '') + '</textarea>' +
    '</div></div>';
}

/* ---------------- gắn sự kiện ---------------- */
function gan(loaiKy) {
  const buoc = Number($('[data-buoc]').dataset.buoc) || 0;
  $('#btnLui').onclick = () => doiMoc(-1, loaiKy, buoc);
  $('#btnToi').onclick = () => doiMoc(1, loaiKy, buoc);
  $('#btnNay').onclick = () => { MOC = Date.now(); ve(); };
  const cn = $('#chonNgay');
  if (cn) cn.onchange = () => { MOC = tuISO(cn.value); ve(); };

  $('#btnNop').onclick = () => luu(true);
  $('#btnNhap').onclick = () => luu(false);

  ['#txNhanDinh', '#txKeHoach'].forEach((s) => { const e = $(s); if (e) e.oninput = () => { BAN = true; }; });

  if (loaiKy !== 'ngay') return;

  const ca = $('#chonCa');
  ca.onchange = () => { BAN = true; hienDmTay(); tinhLai(); };
  $('#dmTay').oninput = () => { BAN = true; tinhLai(); };
  hienDmTay();

  $('#btnThem').onclick = () => {
    $('#thanBang').insertAdjacentHTML('beforeend', veHang(dongTrong()));
    ganHang();
    BAN = true;
    const hang = $('#thanBang').lastElementChild;
    const o = $('.v-cv', hang);
    if (o) o.focus();
  };
  ganHang();
}

function hienDmTay() {
  const ca = $('#chonCa');
  const o = $('#dmTay');
  if (!ca || !o) return;
  o.hidden = ca.value !== 'khac';
  if (!o.hidden && !o.value) {
    o.value = (DU.phieu && DU.phieu.dinhMuc) || '';
  }
}

function ganHang() {
  $$('#thanBang tr').forEach((tr) => {
    $$('input, select, textarea', tr).forEach((o) => {
      o.oninput = () => { BAN = true; tinhLai(); };
      o.onchange = () => { BAN = true; tinhLai(); };
    });
    const x = $('.v-xoa', tr);
    if (x) {
      x.onclick = () => {
        if ($$('#thanBang tr').length === 1) {
          /* Xoá dòng cuối cùng thì để lại một dòng trống, đừng để bảng rỗng
           * không có chỗ gõ — người dùng sẽ tưởng app hỏng. */
          tr.replaceWith(...htmlRa(veHang(dongTrong())));
          ganHang();
        } else tr.remove();
        BAN = true;
        tinhLai();
      };
    }
  });
}

const htmlRa = (h) => {
  const t = document.createElement('tbody');
  t.innerHTML = h;
  return [...t.children];
};

function docBang() {
  return $$('#thanBang tr').map((tr) => ({
    congViec: ($('.v-cv', tr) || {}).value || '',
    nhom: ($('.v-nhom', tr) || {}).value || 'Khác',
    phut: Number(($('.v-phut', tr) || {}).value || 0) || 0,
    tienDo: ($('.v-td', tr) || {}).value || '',
    trangThai: ($('.v-tt', tr) || {}).value || 'Hoàn thành',
  })).filter((d) => d.congViec.trim() || d.phut > 0);
}

function dinhMucHienTai() {
  const ca = $('#chonCa');
  if (!ca) return 0;
  if (ca.value === 'khac') return Number(($('#dmTay') || {}).value || 0) || 0;
  const c = META.ca.find((x) => x.ma === ca.value);
  return (c && c.phut) || 0;
}

/** Cộng tổng ngay khi đang gõ — cùng công thức máy chủ dùng, để con số trên
 *  màn hình và con số ghi vào Base không bao giờ nói khác nhau. */
function tinhLai() {
  const o = $('#oTong');
  if (!o) return;
  const dong = docBang();
  const tong = dong.reduce((s, d) => s + d.phut, 0);
  const dm = dinhMucHienTai();
  const pt = dm > 0 ? Math.round((tong / dm) * 100) : null;
  o.innerHTML =
    oSo(dong.length, 'đầu việc') +
    oSo(vePhut(tong), 'tổng') +
    oSo(pt == null ? '—' : pt + '%', 'so với định mức',
      pt == null ? '' : (pt >= 100 ? 'xanh' : pt < 80 ? 'do' : '')) +
    (dm > 0 && tong < dm
      ? '<div class="so-o"><div class="so">' + esc(vePhut(dm - tong)) + '</div>' +
        '<div class="nhan">chưa khai vào đâu</div></div>'
      : '');
}

function doiMoc(huong, loaiKy, buoc) {
  if (loaiKy === 'thang') {
    const p = phanRa(MOC);
    const th = p.thang + huong;
    MOC = Date.UTC(p.nam + (th > 12 ? 1 : th < 1 ? -1 : 0),
      ((th - 1 + 12) % 12), 1) - VN + 3600000;
  } else {
    MOC = DU.ky.tu + huong * buoc + 3600000;
  }
  ve();
}

/* ---------------- lưu ---------------- */
async function luu(nop) {
  const than = {
    loaiKy: MAN,
    moc: DU.ky.tu + 3600000,
    nop,
    nhanDinh: ($('#txNhanDinh') || {}).value || '',
    keHoach: ($('#txKeHoach') || {}).value || '',
  };
  if (MAN === 'ngay') {
    than.dong = docBang();
    than.ca = ($('#chonCa') || {}).value || 'ngay';
    than.dinhMucTay = Number(($('#dmTay') || {}).value || 0) || 0;
    if (nop && !than.dong.length) {
      return toast('Chưa có đầu việc nào để nộp.', 'do');
    }
  }

  const nut = [$('#btnNop'), $('#btnNhap')].filter(Boolean);
  nut.forEach((b) => { b.disabled = true; });
  try {
    const r = await goi('/api/phieu', { method: 'POST', body: JSON.stringify(than) });
    BAN = false;
    toast(nop ? 'Đã nộp — ' + r.veHan : 'Đã lưu nháp', nop && r.cham &&
      r.cham.trangThai === 'tre' ? '' : 'xanh');
    await ve();
  } catch (e) {
    toast(e.message, 'do');
  } finally {
    nut.forEach((b) => { b.disabled = false; });
  }
}

/* ---------------- màn đã nộp ---------------- */
async function veLichSu(el) {
  const thang = kyThangHienTai();
  const d = await goi('/api/danh-sach?tu=' + thang.tu + '&den=' + thang.den + '&moi=1');
  el.innerHTML = '<div class="the"><div class="the-dau"><h2>Đã nộp trong tháng này</h2>' +
    '<span class="nho">' + veNgay(d.tu) + ' – ' + veNgay(d.den) + '</span></div>' +
    '<div class="the-than cuon">' + (d.ds.length
      ? '<table class="bang-xem"><thead><tr><th>Kỳ</th><th>Loại</th><th class="so-o">Thời lượng</th>' +
        '<th class="so-o">%</th><th>Nộp lúc</th><th>Hạn</th></tr></thead><tbody>' +
        d.ds.map((p) => '<tr>' +
          '<td>' + esc(p.nhan) + '</td>' +
          '<td>' + esc(p.loaiKy === 'ngay' ? 'Ngày' : p.loaiKy === 'tuan' ? 'Tuần' : 'Tháng') + '</td>' +
          '<td class="so-o">' + esc(p.tongGio) + '</td>' +
          '<td class="so-o">' + (p.phanTram == null ? '—' : p.phanTram + '%') + '</td>' +
          '<td>' + (p.daNop ? esc(veLuc(p.nopLuc)) : '<span class="nhan-tt vang">Nháp</span>') + '</td>' +
          '<td>' + nhanHan(p) + '</td>' +
        '</tr>').join('') + '</tbody></table>'
      : '<p class="phu">Chưa có phiếu nào trong tháng này.</p>') +
    '</div></div>';
}

function nhanHan(p) {
  if (!p.daNop) return '<span class="nhan-tt xam">chưa nộp</span>';
  if (p.trangThaiHan === 'tre') return '<span class="nhan-tt do">' + esc(p.veHan) + '</span>';
  return '<span class="nhan-tt xanh">đúng hạn</span>';
}

function kyThangHienTai() {
  const p = phanRa(Date.now());
  const tu = Date.UTC(p.nam, p.thang - 1, 1) - VN;
  const sau = p.thang === 12 ? Date.UTC(p.nam + 1, 0, 1) : Date.UTC(p.nam, p.thang, 1);
  return { tu, den: sau - VN - 1 };
}

/* ---------------- màn theo dõi (quản lý) ---------------- */
async function veTheoDoi(el) {
  const tuan = mocTuan(Date.now());
  const d = await goi('/api/theo-doi?tu=' + tuan.tu + '&den=' + tuan.den + '&moi=1');
  el.innerHTML = '<div class="the"><div class="the-dau"><h2>Ai đã nộp, ai chưa</h2>' +
    '<span class="nho">' + veNgay(d.tu) + ' – ' + veNgay(d.den) +
    ' · ' + d.soNgayCong + ' ngày công</span></div>' +
    '<div class="the-than cuon">' + (d.nguoi.length
      ? '<table class="bang-xem"><thead><tr><th>Người</th><th class="so-o">Đã nộp</th>' +
        '<th class="so-o">Trễ</th><th class="so-o">Tổng</th><th>Ngày còn thiếu</th></tr></thead><tbody>' +
        d.nguoi.map((n) => '<tr>' +
          '<td><b>' + esc(n.ten) + '</b></td>' +
          '<td class="so-o">' + n.soNgayDaNop + '/' + d.soNgayCong + '</td>' +
          '<td class="so-o">' + (n.soTre ? '<span class="nhan-tt vang">' + n.soTre + '</span>' : '0') + '</td>' +
          '<td class="so-o">' + esc(vePhut(n.tongPhut)) + '</td>' +
          '<td>' + (n.thieu.length
            ? n.thieu.map((x) => '<span class="nhan-tt do" style="margin-right:4px">' +
              esc(x.nhan) + '</span>').join('')
            : '<span class="nhan-tt xanh">đủ</span>') + '</td>' +
        '</tr>').join('') + '</tbody></table>'
      : '<p class="phu">Chưa ai nộp phiếu nào trong tuần này.</p>') +
    '</div></div>';
}

/** Tuần Thứ 7 → Thứ 6, đúng như bộ luật phía máy chủ. */
function mocTuan(ms) {
  const d = Math.floor((ms + VN) / NGAY_MS) * NGAY_MS - VN;
  const lui = (phanRa(d).thu - 6 + 7) % 7;
  const tu = d - lui * NGAY_MS;
  return { tu, den: tu + 7 * NGAY_MS - 1 };
}

/* ---------------- xuất ---------------- */
function xuat() {
  const t = kyThangHienTai();
  const caPhong = META.toi.quanLy ? '&ca-phong=1' : '';
  window.location.href = '/api/xuat?tu=' + t.tu + '&den=' + t.den + caPhong;
}

nap().catch((e) => {
  $('#man').innerHTML = '<div class="the"><div class="the-than"><b>Không khởi động được.</b>' +
    '<p class="phu">' + esc(e.message) + '</p></div></div>';
});
