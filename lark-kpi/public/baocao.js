'use strict';
/* MÀN BÁO CÁO — nửa thứ nhất của app.
 *
 * Gom số liệu của MỌI base trong một khoảng thời gian, để mở ra là thấy toàn
 * cảnh phòng, rồi xuất một tệp gửi Sếp.
 *
 * Khác hẳn nửa KPI: ở đây đơn vị là KHOẢNG THỜI GIAN tuỳ ý (tuần, tháng, quý),
 * không phải tháng lương. Nên thanh lọc riêng, giống hệt app Social để ai quen
 * app kia là dùng được ngay.
 *
 * Nạp trước app.js; dùng chung tiện ích khai ở đó.
 */
/* Biểu tượng làm mới, cùng nét với bộ icon của Hub (stroke 1.7, bo tròn đầu). */
const ICON_MOI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="16" height="16">'
  + '<path d="M20 11.5a8 8 0 1 1-2.6-5.4"/><path d="M20 4v5h-5"/></svg>';

var BC = null;        // eslint-disable-line no-var
var BC_KY = null;     // eslint-disable-line no-var — { tu, den, nhan }
/* Kỳ đem ra so sánh. Ba kiểu trả lời ba câu khác nhau — xem kyTruoc() ở
 * bao-cao.js. Nhớ giữa các lần vẽ lại để đổi khoảng thời gian không mất lựa chọn. */
var BC_SS = 'truoc';  // eslint-disable-line no-var
/* Số tháng của bảng xu hướng. Nhớ giữa các lần vẽ để đổi khoảng thời gian
 * không làm mất lựa chọn. */
var BC_SO_THANG = 6; // eslint-disable-line no-var
/* Trưởng phòng đang xem thử báo cáo của ai. Rỗng = xem bản đầy đủ của mình. */
var BC_NHU = ''; // eslint-disable-line no-var
const BC_KIEU_SS = [
  ['truoc', 'Kỳ liền trước'],
  ['thangtruoc', 'Cùng kỳ tháng trước'],
  ['namtruoc', 'Cùng kỳ năm trước'],
];

/* ---- các mốc thời gian dựng sẵn, cùng bộ với app Social ---- */
function bcMoc() {
  const d = new Date();
  const iso = (x) => x.toISOString().slice(0, 10);
  const dauThang = (y, m) => new Date(Date.UTC(y, m, 1));
  const cuoiThang = (y, m) => new Date(Date.UTC(y, m + 1, 0));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  /* Tuần bắt đầu THỨ HAI — lịch làm việc của phòng, không phải Chủ nhật kiểu Mỹ. */
  const thu2 = new Date(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  const thu2Truoc = new Date(thu2.getTime() - 7 * 86400000);
  return [
    { ma: 'thang-nay', nhan: 'Tháng này', tu: iso(dauThang(y, m)), den: iso(cuoiThang(y, m)) },
    { ma: 'thang-truoc', nhan: 'Tháng trước', tu: iso(dauThang(y, m - 1)), den: iso(cuoiThang(y, m - 1)) },
    { ma: 'tuan-nay', nhan: 'Tuần này', tu: iso(thu2), den: iso(new Date(thu2.getTime() + 6 * 86400000)) },
    { ma: 'tuan-truoc', nhan: 'Tuần trước', tu: iso(thu2Truoc), den: iso(new Date(thu2Truoc.getTime() + 6 * 86400000)) },
    { ma: 'quy-nay', nhan: 'Quý này', tu: iso(dauThang(y, Math.floor(m / 3) * 3)), den: iso(cuoiThang(y, Math.floor(m / 3) * 3 + 2)) },
    { ma: 'nam-nay', nhan: 'Năm nay', tu: y + '-01-01', den: y + '-12-31' },
  ];
}

function bcSo(v, kieu) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (kieu === 'vnd') {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' tỷ';
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' tr';
    return Math.round(v).toLocaleString('vi-VN') + ' ₫';
  }
  if (kieu === 'pt') return (Math.round(v * 10) / 10).toString().replace('.', ',') + '%';
  if (kieu === 'x') return (Math.round(v * 100) / 100).toString().replace('.', ',') + 'x';
  return gon(v);
}

/* Ngày kiểu Việt. Trước đây khai bên trong veBaoCao(), nên thanh lọc gọi tới là
 * nổ ReferenceError — giờ để chung một chỗ cho cả tệp dùng. */
const ngay = (s) => String(s || '').split('-').reverse().join('/');

async function veBaoCao() {
  if (!BC_KY) { const m = bcMoc(); BC_KY = { tu: m[0].tu, den: m[0].den, ma: m[0].ma }; }
  const g = el('div');
  let thanhLoc = bcThanhLoc();
  g.appendChild(thanhLoc);

  const hop = el('div');
  g.appendChild(hop);
  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);

  /* Số base đếm từ máy chủ trả về chứ không viết cứng: danh sách app đã đổi vài
   * lần, và dòng chờ ghi "5 base" trong khi đang đọc 9 cái thì sai ngay từ chữ
   * đầu tiên người dùng nhìn thấy. */
  hop.innerHTML = '<div class="rong">đang đọc số từ '
    + (BC && BC.soApp ? BC.soApp + ' base' : 'các base') + '…</div>';
  try {
    BC = await goi('bao-cao?tu=' + BC_KY.tu + '&den=' + BC_KY.den + '&ss=' + BC_SS
      + (BC_NHU ? '&nhu=' + encodeURIComponent(BC_NHU) : ''));
  } catch (e) { hop.innerHTML = '<div class="rong">' + esc(e.message) + '</div>'; return; }

  /* Dựng lại thanh lọc SAU khi có số. Nút "bấm lần hai để đi tới mốc đó" lấy
   * khoảng thời gian từ `BC.kyTruoc`, mà lúc dựng lần đầu `BC` vẫn là của lần vẽ
   * trước — vừa đổi sang "cùng kỳ tháng trước" thì nhãn còn ghi khoảng của "kỳ
   * liền trước", và bấm tiếp sẽ nhảy sang đúng cái khoảng sai đó. */
  thanhLoc.replaceWith(thanhLoc = bcThanhLoc());

  hop.innerHTML = '';
  if (BC.phamVi) hop.appendChild(bcDaiPhamVi(BC.phamVi));
  hop.appendChild(el('div', 'canhbao tin',
    '<div>Kỳ <b>' + ngay(BC.tu) + ' – ' + ngay(BC.den) + '</b> (' + BC.soNgay + ' ngày) · '
    + (BC.kyTruoc
      ? 'so với <b>' + esc(BC.kyTruoc.nhan || 'kỳ trước') + '</b> '
        + ngay(BC.kyTruoc.tu) + ' – ' + ngay(BC.kyTruoc.den) + ' · '
      : '<b>không so với kỳ nào</b> · ')
    + '<b>' + BC.soChay + '/' + BC.soApp + '</b> base đọc được. '
    + 'Số đọc trực tiếp từ các base tại thời điểm mở.'
    + bcChuMucTieu() + '</div>'));

  /* Chi phí đứng TRƯỚC các base: tiền của phòng đi ra hai app khác nhau, và
   * câu "tháng này phòng tiêu bao nhiêu" là câu Sếp hỏi đầu tiên. */
  /* Xu hướng đứng ĐẦU, trước cả chi phí: câu "đang lên hay đang xuống" phải
   * trả lời trước câu "tháng này bao nhiêu". Nhưng nó đọc sáu tháng mất mươi
   * giây, nên dựng chỗ trống rồi điền sau — không bắt cả báo cáo đứng chờ. */
  /* Xu hướng là số của CẢ PHÒNG qua nhiều tháng — không lọc theo phạm vi được,
   * nên người xem phạm vi hẹp thì bỏ hẳn khối này. Để lại là rò số của cả phòng
   * ra đúng chỗ vừa công bố là chỉ trưởng phòng mới thấy. */
  if (!BC.phamVi) {
    const oXu = el('div');
    hop.appendChild(oXu);
    bcNapXuHuong(oXu);
  }

  if (BC.chiPhi) hop.appendChild(bcChiPhi(BC.chiPhi));
  if (BC.tepMoi) hop.appendChild(bcTepMoi(BC.tepMoi));
  BC.base.forEach((b) => hop.appendChild(bcKhoi(b)));
}

function bcThanhLoc() {
  const t = el('div', 'the');
  const than = el('div', 'than loc-hang');
  const moc = bcMoc();

  const g1 = el('div', 'loc-nhom');
  g1.innerHTML = '<label>Khoảng thời gian</label>';
  const seg = el('div', 'seg');
  moc.forEach((m) => {
    const b = el('button', 'seg-nut' + (BC_KY.ma === m.ma ? ' chon' : ''), m.nhan);
    b.onclick = () => { BC_KY = { tu: m.tu, den: m.den, ma: m.ma }; veBaoCao(); };
    seg.appendChild(b);
  });
  g1.appendChild(seg);

  const g2 = el('div', 'loc-nhom');
  g2.innerHTML = '<label>Từ ngày</label>';
  const i1 = el('input'); i1.type = 'date'; i1.value = BC_KY.tu;
  g2.appendChild(i1);
  const g3 = el('div', 'loc-nhom');
  g3.innerHTML = '<label>Đến ngày</label>';
  const i2 = el('input'); i2.type = 'date'; i2.value = BC_KY.den;
  g3.appendChild(i2);
  /* Đổi ngày tay thì bỏ chọn mốc dựng sẵn — nếu vẫn tô sáng "Tháng này" trong
   * khi ngày đã khác thì thanh lọc nói dối về cái đang xem. */
  const doiTay = () => {
    if (!i1.value || !i2.value || i1.value > i2.value) return;
    BC_KY = { tu: i1.value, den: i2.value, ma: '' };
    veBaoCao();
  };
  i1.onchange = doiTay; i2.onchange = doiTay;

  than.appendChild(g1); than.appendChild(g2); than.appendChild(g3);

  /* Bản rút gọn của một nhân sự KHÔNG có so sánh — máy chủ cũng đã bỏ, nên ẩn
   * luôn nhóm nút này thay vì để nó bấm mà không có gì xảy ra. */
  const anSoSanh = !!(BC && BC.phamVi);

  /* Chọn kỳ so sánh. Đặt ngay cạnh khoảng thời gian vì hai thứ này luôn đi đôi:
   * đổi khoảng mà không đổi mốc so thì mọi mũi tên ▲▼ đổi nghĩa mà không báo. */
  const gSS = el('div', 'loc-nhom');
  gSS.innerHTML = '<label>So với</label>';
  const segSS = el('div', 'seg');
  /* BẤM LẦN HAI = ĐI TỚI CHÍNH MỐC ĐÓ.
   *
   * Lần một: so kỳ đang xem với mốc. Lần hai: chuyển hẳn báo cáo sang khoảng
   * thời gian của mốc đó, và bỏ so sánh — thành một bản báo cáo độc lập của
   * tháng trước (hoặc năm trước).
   *
   * Vì sao gộp hai việc vào một nút: muốn xem lại tháng trước thì trước đây
   * phải tự gõ hai ô ngày, mà "cùng kỳ năm trước" thì còn phải tự tính. Máy vừa
   * tính đúng khoảng đó xong để so sánh — `BC.kyTruoc` đang giữ sẵn — nên chỉ
   * cần đưa nó lên thanh lọc, không phải tính lại lần nữa.
   *
   * Bỏ so sánh ở bước này là cố ý: nhảy sang tháng 8 mà vẫn so tiếp với tháng 7
   * thì người xem mất dấu, không còn biết con số nào thuộc kỳ nào. */
  BC_KIEU_SS.forEach(([ma, nhan]) => {
    const dangChon = BC_SS === ma;
    const diToi = dangChon && BC && BC.kyTruoc;
    const b = el('button', 'seg-nut' + (dangChon ? ' chon' : ''), nhan);
    b.title = diToi
      ? 'Bấm lần nữa để xem thẳng báo cáo của ' + nhan.toLowerCase()
        + ' (' + ngay(BC.kyTruoc.tu) + ' – ' + ngay(BC.kyTruoc.den) + '), không so sánh'
      : 'So với ' + nhan.toLowerCase();
    b.onclick = () => {
      if (diToi) {
        BC_KY = { tu: BC.kyTruoc.tu, den: BC.kyTruoc.den, ma: '' };
        BC_SS = 'khong';
      } else if (dangChon) {
        /* Không có `BC.kyTruoc` để nhảy tới (lần vẽ trước hỏng) thì ít nhất vẫn
         * tắt được so sánh, chứ đừng bấm mà không có gì xảy ra. */
        BC_SS = 'khong';
      } else {
        BC_SS = ma;
      }
      veBaoCao();
    };
    segSS.appendChild(b);
  });
  gSS.appendChild(segSS);
  if (BC_SS === 'khong') {
    gSS.appendChild(el('span', 'seg-ghi',
      'báo cáo riêng khoảng ' + ngay(BC_KY.tu) + ' – ' + ngay(BC_KY.den)
      + ', không so sánh — bấm một mốc để bật lại'));
  }
  if (!anSoSanh) than.appendChild(gSS);

  const g4 = el('div', 'loc-nhom grow');
  g4.innerHTML = '<label>&nbsp;</label>';
  const hang = el('div', 'nut-hang');
  const nutXuat = el('button', 'btn chinh', 'Xuất báo cáo');
  nutXuat.title = 'Mở tệp báo cáo hoàn chỉnh — trong đó có nút Lưu PDF, tải HTML, tải CSV';
  nutXuat.onclick = () => window.open('api/xuat-bao-cao?tu=' + BC_KY.tu + '&den=' + BC_KY.den + '&ss=' + BC_SS, '_blank');
  /* Lối tắt cho ai chỉ cần số để bê sang bảng tính, khỏi mở tệp báo cáo ra rồi
   * mới bấm nút CSV trong đó. */
  const nutCsv = el('button', 'btn', 'CSV');
  nutCsv.title = 'Tải thẳng bảng số cho Excel';
  nutCsv.onclick = () => taiVe('xuat-bao-cao-csv?tu=' + BC_KY.tu + '&den=' + BC_KY.den + '&ss=' + BC_SS);
  /* Nút đọc lại là BIỂU TƯỢNG, không phải chữ — giống mọi app khác trong Hub.
   * Chữ "Đọc lại" đứng cạnh "Xuất báo cáo" trông như hai hành động ngang hàng,
   * trong khi một cái là việc chính còn một cái chỉ là làm tươi màn hình. */
  const nutMoi = el('button', 'btn bt', ICON_MOI);
  nutMoi.title = 'Đọc lại số mới nhất từ Base';
  nutMoi.setAttribute('aria-label', 'Làm mới');
  nutMoi.onclick = () => { nutMoi.classList.add('quay'); veBaoCao(); };
  hang.appendChild(nutXuat); hang.appendChild(nutCsv); hang.appendChild(nutMoi);
  g4.appendChild(hang);

  than.appendChild(g4);
  t.appendChild(than);
  return t;
}

/* Rút gọn tên nền tảng cho vừa một dòng dưới ô số. */
const BC_TAT = { Facebook: 'FB', Instagram: 'IG', TikTok: 'TikTok', 'Zalo OA': 'Zalo', YouTube: 'YT' };
const bcTat = (x) => BC_TAT[x] || x;

/**
 * Dòng "ai đóng góp vào con số này" đặt ngay dưới mỗi ô.
 *
 * Đây là chỗ chữa lỗi đọc nguy hiểm nhất của trang tổng quan: "Lượt tiếp cận
 * 15k" trông như số toàn phòng, sự thật chỉ Instagram trả về. Giờ ô đó ghi rõ
 * "IG 15k" và "FB · TikTok chưa gửi số này".
 */
function bcNen(nen) {
  if (!nen || !nen.tong) return '';
  if (!nen.co.length) {
    return '<div class="o-nen trong">chưa nền tảng nào gửi số này</div>';
  }
  const co = nen.co.slice(0, 4).map((x) =>
    '<span class="o-nen-i"><b>' + esc(bcTat(x.ten)) + '</b> ' + gon(x.so) + '</span>').join('');
  const thieu = nen.khong.length
    ? '<span class="o-nen-thieu">' + nen.khong.map(bcTat).map(esc).join(' · ') + ' chưa có</span>'
    : '';
  return '<div class="o-nen">' + co + thieu + '</div>';
}

/**
 * KHỐI CHI PHÍ TOÀN PHÒNG — gộp hai ví tiền nằm ở hai app khác nhau.
 * Đọc không đủ cả hai thì nói thẳng là chưa đủ, KHÔNG cộng một nửa rồi gọi là
 * tổng: con số sai kiểu đó nguy hiểm hơn hẳn việc không có con số nào.
 */
function bcChiPhi(c) {
  const t = el('div', 'the the-chinh');
  t.appendChild(el('header', '',
    '<span class="cham-tron" style="background:#d4a017"></span>'
    + '<h3>Chi phí toàn phòng</h3>'
    + '<span class="phu">tiền phòng đi về đâu — quảng cáo + quỹ chi phí</span>'));

  if (!c.doc) {
    t.appendChild(el('div', 'than', '<div class="canhbao chan"><div>'
      + '<b>Chưa cộng được tổng chi phí</b> — không đọc được ' + esc((c.thieu || []).join(' và '))
      + '. Cộng một nửa rồi gọi là tổng chi phí phòng thì sai còn tệ hơn là để trống.'
      + '</div></div>'));
    return t;
  }

  const luoi = el('div', 'o-luoi');
  (c.o || []).forEach((o) => luoi.appendChild(bcO(o)));
  t.appendChild(luoi);

  if (c.tron && c.tron.phan.length && window.Charts) {
    const khung = el('div', 'bieu-do bieu-do-doi');
    const oTron = el('div');
    const oSs = el('div');
    khung.appendChild(oSs); khung.appendChild(oTron);
    t.appendChild(khung);
    if ((c.soSanh || []).length) {
      oSs.appendChild(bcSoSanh(c.soSanh, 'Chi phí so kỳ trước', bcNhanKyTruoc()));
    }
    Charts.donut(oTron, c.tron.phan.map((x) => ({ label: x.nhan, value: x.so })),
      { centerLabel: c.tron.giua, size: 180 });
  }

  /* Hạng mục — câu "tiêu 44 triệu vào đâu". Thanh ngang chứ không vành khuyên:
   * vành khuyên trên 10 hạng mục thì miếng nhỏ mảnh như sợi chỉ và chú thích
   * dài hơn cả hình. */
  if ((c.hangMuc || []).length) {
    const kh = el('div', 'bieu-do');
    kh.appendChild(bcThanhNgang(c.hangMuc, 'Chi theo hạng mục', c.tong));
    t.appendChild(kh);
  }
  (c.bang || []).forEach((bg) => bcBang(t, bg));
  return t;
}

/**
 * Thanh ngang xếp hạng — cho câu hỏi "cái gì nhiều nhất".
 * Dùng thay vành khuyên khi có quá 6 phần: vành khuyên nhiều miếng thì miếng
 * nhỏ mảnh như sợi chỉ, và chú thích dài hơn cả hình.
 */
function bcThanhNgang(ds, tieuDe, tong, don) {
  const g = el('div', 'ss');
  g.appendChild(el('h4', 'ss-tieu', esc(tieuDe)));
  const max = Math.max(1, ...ds.map((x) => x.so));
  const t = tong || ds.reduce((a, x) => a + x.so, 0);
  const hang = el('div', 'tn-ds');
  ds.slice(0, 14).forEach((x) => {
    const r = el('div', 'tn-hang');
    r.innerHTML = '<div class="tn-ten">' + esc(x.nhan)
      + (x.vi ? '<em>' + esc(x.vi) + '</em>' : '') + '</div>'
      + '<div class="tn-ray"><i style="width:' + ((x.so / max) * 100) + '%"></i></div>'
      + '<div class="tn-so">' + bcSo(x.so, don || 'vnd') + '</div>'
      + '<div class="tn-pt">' + (t ? Math.round((x.so / t) * 100) : 0) + '%</div>';
    if (x.soKhoan != null) r.title = x.soKhoan + ' khoản';
    hang.appendChild(r);
  });
  g.appendChild(hang);
  if (ds.length > 14) {
    g.appendChild(el('div', 'ss-chan', 'Còn ' + (ds.length - 14)
      + ' mục nhỏ hơn — xem đủ ở bảng bên dưới.'));
  }
  return g;
}

/** Một bảng chi tiết. Tách ra vì khối base và khối chi phí đều dùng. */
function bcBang(t, bg) {
  const soCot = new Set(bg.soCot || []);
  const tb = el('table');
  tb.innerHTML = '<thead><tr>' + bg.cot.map((c, i) =>
    '<th' + (soCot.has(i) ? ' class="so"' : '') + '>' + esc(c) + '</th>').join('')
    + '</tr></thead><tbody>' + bg.dong.map((r) => '<tr>' + r.map((c, i) =>
      '<td' + (soCot.has(i) ? ' class="so"' : ' class="dai"') + '>'
      + (typeof c === 'number' ? gon(c) : esc(c)) + '</td>').join('') + '</tr>').join('')
    + '</tbody>';
  const kh = el('div', 'bang-cuon');
  kh.appendChild(tb);
  t.appendChild(el('div', 'than nho nhat', bg.tieuDe + ' · ' + bg.dong.length + ' dòng'));
  t.appendChild(kh);
}

/**
 * BIỂU ĐỒ SO SÁNH KỲ TRƯỚC — mỗi chỉ số một ô nhỏ, hai cột đứng cạnh nhau:
 * kỳ trước (cột nhạt) và kỳ này (cột đậm), có in số thật lên đầu từng cột.
 *
 * Hai bản trước đều chỉ vẽ MỘT cột phần trăm đổi. Gọn, nhưng "+20%" không cho
 * biết đang nói về hai triệu lượt xem hay bốn mươi bình luận — mất hết cảm giác
 * về quy mô, mà quy mô mới là thứ quyết định nên bận tâm vào chỉ số nào.
 *
 * Vẽ hai cột cạnh nhau thì vướng chuyện các chỉ số lệch nhau mấy bậc độ lớn
 * (lượt xem 1,99 triệu đứng cạnh bình luận 40): chung một thang thì cột nhỏ dẹp
 * thành vạch kẻ. Cách thoát là KHÔNG dùng chung thang — mỗi ô tự đo theo cột cao
 * nhất của chính nó. Trong một ô, hai cột so được với nhau vì cùng thang; giữa
 * các ô thì không so chiều cao, và cũng không cần, vì số thật in ngay trên đầu.
 *
 * Màu theo TỐT/XẤU chứ không theo hướng: "chi phí giảm 27%" là tin tốt nên
 * xanh, dù cột kỳ này thấp hơn cột kỳ trước.
 */
/** Tên mốc so sánh đang chọn — để chú thích nói đúng "tháng trước" hay "năm trước". */
function bcNhanKyTruoc() {
  const k = BC && BC.kyTruoc;
  return k && k.nhan ? k.nhan : 'kỳ trước';
}

function bcSoSanh(ds, tieuDe, nhanTruoc) {
  const g = el('div', 'ss');
  g.appendChild(el('h4', 'ss-tieu', esc(tieuDe || 'So với kỳ trước')));
  g.appendChild(el('div', 'sp-chu',
    '<span><i class="truoc"></i>' + esc(nhanTruoc || 'kỳ trước') + '</span>'
    + '<span><i class="nay"></i>kỳ này</span>'));
  const luoi = el('div', 'sp-luoi');
  const CAO = 78;
  ds.forEach((x) => {
    /* Thang riêng cho từng ô: chia theo cột cao nhất TRONG Ô, không phải cao
     * nhất cả biểu đồ. Số âm (chênh dự toán, lãi lỗ) thì lấy trị tuyệt đối làm
     * thang, nếu không cột sẽ có chiều cao âm và biến mất. */
    const max = Math.max(Math.abs(x.nay), Math.abs(x.truoc), 1);
    const cao = (v) => Math.max(3, Math.round((Math.abs(v) / max) * CAO));
    const mau = x.tot == null ? 'im' : x.tot ? 'tot' : 'xau';
    const pt = (x.lech > 0 ? '+' : '') + (Math.round(x.lech * 10) / 10).toString().replace('.', ',') + '%';
    const o = el('div', 'sp-o');
    o.innerHTML = '<div class="sp-ten">' + esc(x.nhan) + '</div>'
      + '<div class="sp-cap">'
      + '<div class="sp-cot"><b>' + bcSo(x.truoc, x.dinhDang) + '</b>'
      + '<i class="truoc" style="height:' + cao(x.truoc) + 'px"></i></div>'
      + '<div class="sp-cot"><b class="' + mau + '">' + bcSo(x.nay, x.dinhDang) + '</b>'
      + '<i class="nay ' + mau + '" style="height:' + cao(x.nay) + 'px"></i></div>'
      + '</div>'
      + '<div class="sp-lech ' + mau + '">' + (x.lech > 0 ? '▲ ' : '▼ ') + pt + '</div>';
    o.title = x.nhan + ': ' + gon(x.truoc) + ' → ' + gon(x.nay) + ' (' + pt + ')';
    luoi.appendChild(o);
  });
  g.appendChild(luoi);
  g.appendChild(el('div', 'ss-chan',
    '<b>Mỗi ô có thang riêng</b> — hai cột trong cùng một ô so được với nhau, '
    + 'còn chiều cao giữa các ô thì không (lượt xem hàng triệu đứng cạnh bình luận '
    + 'hàng chục, chung thang thì cột nhỏ dẹp thành vạch kẻ). Số thật in trên đầu '
    + 'từng cột · xanh = tốt lên · đỏ = xấu đi · <b>xám = không có chiều tốt xấu</b> '
    + '(tổng tiền đã chi: giảm có thể là tiết kiệm, cũng có thể là ngừng chạy)'));
  return g;
}

/**
 * BIỂU ĐỒ CỘT SỐ TUYỆT ĐỐI — "cái nào nhiều nhất".
 *
 * Dùng thay vành khuyên ở những chỗ các phần đứng cùng một thang và người đọc
 * muốn so bên nào hơn bên nào (trạng thái việc, lượt xem theo KOL, các bậc của
 * phễu). Vành khuyên bắt người ta ướm hai miếng bánh với nhau; cột thì chỉ cần
 * nhìn cái nào cao hơn.
 */
function bcCot(c) {
  const ds = (c.muc || []).filter((x) => Number.isFinite(x.so));
  const g = el('div', 'ss');
  g.appendChild(el('h4', 'ss-tieu', esc(c.nhan)));
  if (!ds.length) {
    g.appendChild(el('div', 'ss-chan', 'chưa có số cho biểu đồ này'));
    return g;
  }
  const max = Math.max(1, ...ds.map((x) => x.so));
  const hang = el('div', 'ct-ds');
  ds.slice(0, 14).forEach((x, i) => {
    const o = el('div', 'ct-cot');
    o.innerHTML = '<b>' + bcSo(x.so, c.don || 'so') + '</b>'
      /* Chiều cao tính thẳng ra px chứ không dùng %: ô bọc cột không có chiều
       * cao xác định (nó co theo nhãn bên dưới), nên % sẽ rơi về auto và mọi
       * cột dẹp bằng nhau. */
      + '<i style="height:' + Math.max(3, Math.round((x.so / max) * 130)) + 'px;'
      + 'background:' + (window.Charts ? Charts.colorFor(x.nhan, i) : '#2b5cff') + '"></i>'
      + '<span>' + esc(x.nhan) + '</span>';
    o.title = x.nhan + ': ' + gon(x.so);
    hang.appendChild(o);
  });
  g.appendChild(hang);
  if (ds.length > 14) {
    g.appendChild(el('div', 'ss-chan', 'Hiện 14 mục cao nhất trong ' + ds.length + ' mục.'));
  }
  return g;
}

/**
 * Dải báo phạm vi — hiện khi báo cáo đang bị giới hạn vào một người.
 *
 * Phải nói THẲNG là đang xem bản rút gọn, kèm đúng những gì bị cắt. Không có
 * dải này thì người đọc tưởng "lượt xem 2,03 triệu" là của cả phòng, trong khi
 * đó là của sáu kênh mình phụ trách — lệch nhau một triệu lượt.
 */
function bcDaiPhamVi(pv) {
  const o = el('div', 'canhbao canhBao');
  const phan = [];
  if (pv.soKenh) phan.push('<b>' + pv.soKenh + ' kênh</b> được phân công');
  if ((pv.loaiViec || []).length) {
    phan.push('việc loại <b>' + pv.loaiViec.map(esc).join(', ') + '</b>');
  }
  let nut = '';
  if (BC_NHU) {
    nut = ' <button class="nut nhe" id="pvThoi">Thôi xem thử</button>';
  }
  o.innerHTML = '<div>' + (BC_NHU ? 'Đang <b>xem thử</b> báo cáo của ' : 'Báo cáo của ')
    + '<b>' + esc(pv.ten) + '</b>' + (pv.viTri ? ' · ' + esc(pv.viTri) : '') + '. '
    + 'Chỉ gồm ' + (phan.length ? phan.join(' và ') + ', ' : '')
    + 'và những khối đã mở cho người này. '
    + '<b>Không phải số của cả phòng</b> — chi phí, tệp khách mới và xu hướng toàn '
    + 'phòng chỉ trưởng phòng xem được.' + nut + '</div>';
  const b = o.querySelector('#pvThoi');
  if (b) b.onclick = () => { BC_NHU = ''; veBaoCao(); };
  return o;
}

/**
 * Nạp bảng xu hướng vào chỗ đã chừa. Chạy sau khi báo cáo chính đã hiện.
 *
 * `#den` lấy theo tháng của NGÀY CUỐI khoảng đang xem, không phải tháng hiện
 * tại: đang xem tháng 5 mà bảng xu hướng chạy tới tháng 9 thì cột cuối không
 * phải cái đang đọc, nhìn lệch hẳn.
 */
async function bcNapXuHuong(o) {
  const den = String(BC_KY.den).slice(0, 7);
  o.appendChild(el('div', 'the', '<div class="than nho nhat">'
    + 'đang đọc xu hướng ' + BC_SO_THANG + ' tháng…</div>'));
  let x;
  try {
    x = await goi('xu-huong?den=' + den + '&so=' + BC_SO_THANG);
  } catch (e) {
    o.innerHTML = '';
    o.appendChild(el('div', 'the', '<div class="than nho nhat">'
      + 'không đọc được xu hướng: ' + esc(e.message) + '</div>'));
    return;
  }
  /* Người dùng có thể đã đổi khoảng trong lúc chờ — bỏ kết quả cũ đi, đừng vẽ
   * bảng của khoảng khác vào màn hình đang xem khoảng này. */
  if (String(BC_KY.den).slice(0, 7) !== den) return;
  o.innerHTML = '';
  o.appendChild(bcXuHuong(x));
}

/**
 * BẢNG XU HƯỚNG — mỗi chỉ số một dãy cột, mỗi cột một tháng.
 *
 * Báo cáo chỉ so được hai kỳ, nên không phân biệt được "tháng này kém" với
 * "đang xuống dốc ba tháng liền". Phú Quốc theo mùa rất nặng: giảm 51% so tháng
 * trước có thể chỉ là hết cao điểm, cũng có thể là hỏng thật.
 *
 * Mỗi dòng có THANG RIÊNG, như biểu đồ so sánh — lượt xem hàng triệu không thể
 * chung thang với ROAS. Trong một dòng thì các tháng so được với nhau, đó là
 * phép so duy nhất bảng này hứa hẹn.
 */
/* Dòng nào hiện trên biểu đồ. Nhớ giữa các lần vẽ để bỏ tích một đường rồi đổi
 * khoảng thời gian không bị bật lại. Rỗng = hiện bốn dòng đầu (mặc định). */
var BC_XH_AN = {}; // eslint-disable-line no-var

const BC_XH_MAU = ['#2b5cff', '#12a150', '#e0245e', '#f59e0b', '#8b5cf6',
  '#0ea5a0', '#64748b', '#d946ef'];

/**
 * BẢNG XU HƯỚNG — biểu đồ ĐƯỜNG nhiều đường chồng lên nhau.
 *
 * Bản trước vẽ mỗi chỉ số một dãy cột nhỏ, mỗi dòng một thang riêng. Đúng số
 * nhưng mười hai cột xám xếp cạnh nhau trên tám dòng thì mắt không bám được vào
 * đâu — nhìn ra một khối ô vuông chứ không nhìn ra xu hướng. Đường thì thấy
 * ngay dốc lên hay dốc xuống, và chồng nhiều đường lên một khung mới so được
 * "doanh thu rơi trong khi chi phí đứng yên".
 *
 * CHUẨN HOÁ VỀ % CỦA ĐỈNH CHÍNH NÓ. Chi phí 68 triệu không thể chung thang với
 * ROAS 5,92 — chung thang thì ROAS dẹp thành đường kẻ sát đáy. Mỗi đường chia
 * cho tháng cao nhất của chính nó, nên trục dọc đọc là "so với lúc đỉnh của
 * chỉ số đó". Cái mất đi là không so được độ cao giữa hai đường; cái được là so
 * được HÌNH DÁNG, mà xu hướng chính là hình dáng. Số thật vẫn in đủ ở bảng
 * ngay dưới và hiện khi rê chuột.
 */
function bcXuHuong(x) {
  const t = el('div', 'the');
  const nhanThang = (th) => 'T' + Number(th.slice(5));
  t.appendChild(el('header', '',
    '<span class="cham-tron" style="background:#f59e0b"></span>'
    + '<h3>Xu hướng ' + x.thang.length + ' tháng</h3>'
    + '<span class="phu">' + nhanThang(x.thang[0]) + ' – '
    + nhanThang(x.thang[x.thang.length - 1]) + '</span>'));

  const chon = el('div', 'than nho');
  chon.appendChild(el('span', '', 'Xem '));
  [3, 6, 12].forEach((n) => {
    const b = el('button', 'seg-nut' + (BC_SO_THANG === n ? ' chon' : ''), n + ' tháng');
    b.onclick = () => { BC_SO_THANG = n; veBaoCao(); };
    chon.appendChild(b);
  });
  t.appendChild(chon);

  /* Mặc định hiện bốn dòng đầu. Tám đường cùng lúc thì rối hơn là rõ — người
   * xem tự tích thêm dòng nào cần. */
  const hien = (r, i) => (BC_XH_AN[r.nhan] === undefined ? i < 4 : !BC_XH_AN[r.nhan]);

  const khung = el('div', 'bieu-do');
  const veLai = () => {
    khung.innerHTML = '';
    khung.appendChild(bcXhDuong(x, hien));
    khung.appendChild(bcXhChuThich(x, hien, veLai));
  };
  veLai();
  t.appendChild(khung);

  /* Bảng số thật — biểu đồ chỉ nói hình dáng, bảng nói con số. */
  const bang = el('div', 'xh');
  bang.style.setProperty('--xh-n', x.thang.length);
  const dau = el('div', 'xh-hang xh-dau');
  dau.innerHTML = '<div class="xh-ten"></div>'
    + x.thang.map((th) => '<div class="xh-o">' + nhanThang(th) + '</div>').join('')
    + '<div class="xh-lech">so tháng đầu có số</div>';
  bang.appendChild(dau);

  x.dong.forEach((r, i) => {
    const co = r.diem.filter((q) => q.so != null && q.so !== 0);
    /* Cần ÍT NHẤT HAI tháng có số mới nói được xu hướng. App Quảng cáo mới nối
     * từ T8, nên trong bảng tới T8 nó chỉ có đúng một điểm — lấy điểm đó làm cả
     * mốc đầu lẫn mốc cuối thì ra "▼ 0%", đọc như đứng yên trong khi thật ra là
     * chưa có gì để so. */
    const dauKy = co.length >= 2 ? co[0] : null;
    const cuoiKy = r.diem[r.diem.length - 1];
    let lech = null;
    if (dauKy && cuoiKy && cuoiKy.so != null && dauKy.so) {
      lech = ((cuoiKy.so - dauKy.so) / Math.abs(dauKy.so)) * 100;
    }
    const mauLech = lech == null || r.trungTinh ? 'im' : (lech > 0 ? 'tot' : 'xau');

    const h = el('div', 'xh-hang' + (hien(r, i) ? ' sang' : ''));
    h.innerHTML = '<div class="xh-ten"><i style="background:'
      + (hien(r, i) ? BC_XH_MAU[i % BC_XH_MAU.length] : 'transparent') + '"></i>'
      + esc(r.nhan) + '</div>'
      + r.diem.map((pt, k) => '<div class="xh-o"><b'
        + (k === r.diem.length - 1 ? ' class="nay"' : (pt.so == null ? ' class="trong"' : ''))
        + '>' + (pt.so == null ? '—' : bcSo(pt.so, r.dinhDang)) + '</b></div>').join('')
      + '<div class="xh-lech ' + mauLech + '"' + (dauKy
        ? ' title="so ' + nhanThang(cuoiKy.thang) + ' với ' + nhanThang(dauKy.thang)
          + ' — tháng đầu tiên có số ở dòng này"' : '') + '>'
      + (lech == null ? '—'
        : (lech > 0 ? '▲ +' : '▼ ') + (Math.round(lech * 10) / 10).toString().replace('.', ',') + '%')
      + '</div>';
    bang.appendChild(h);
  });
  khung.appendChild(bang);

  const chu = ['Mỗi đường chia cho tháng cao nhất của chính nó, nên trục dọc đọc là '
    + '<b>“so với lúc đỉnh của chỉ số đó”</b> — so được hình dáng giữa các đường, '
    + 'không so được độ cao. Chi phí hàng chục triệu không thể chung thang với ROAS '
    + 'một con số. Số thật nằm ở bảng ngay trên và hiện khi rê chuột lên điểm.'];
  if ((x.thieu || []).length) {
    chu.push('Tháng đọc thiếu base: ' + x.thieu.map((k) => nhanThang(k.thang)
      + ' (' + k.doc + '/' + k.tong + ')').join(', ') + '.');
  }
  t.appendChild(el('div', 'than nho nhat', chu.join(' ')));
  return t;
}

/** Khung SVG của biểu đồ đường. `hien(r,i)` quyết định đường nào được vẽ. */
function bcXhDuong(x, hien) {
  const W = 1000;
  const H = 300;
  const L = 44;
  const R = 14;
  const T = 14;
  const B = 34;
  const n = x.thang.length;
  const cx = (i) => (n < 2 ? L : L + (i * (W - L - R)) / (n - 1));
  const cy = (pt) => T + (1 - pt / 100) * (H - T - B);
  const ve = [];

  /* Lưới ngang bốn vạch. Nhãn là phần trăm của đỉnh, không phải số thật —
   * ghi "% đỉnh" ngay trên trục để không ai đọc nhầm thành giá trị. */
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = cy(v);
    ve.push('<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y
      + '" stroke="var(--vien-mem)" stroke-width="1"/>');
    ve.push('<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" '
      + 'font-size="11" fill="var(--chu-nhat)">' + v + '%</text>');
  });
  x.thang.forEach((th, i) => {
    ve.push('<text x="' + cx(i) + '" y="' + (H - 12) + '" text-anchor="middle" '
      + 'font-size="11.5" fill="var(--chu-nhat)">T' + Number(th.slice(5)) + '</text>');
  });

  x.dong.forEach((r, i) => {
    if (!hien(r, i)) return;
    const mau = BC_XH_MAU[i % BC_XH_MAU.length];
    const dinh = Math.max(0, ...r.diem.map((q) => Math.abs(q.so || 0)));
    if (!dinh) return;
    /* Tháng KHÔNG ĐỌC ĐƯỢC thì ĐỨT ĐƯỜNG, không nối thẳng qua. Nối qua là vẽ ra
     * một đoạn dốc chưa từng xảy ra. */
    const doan = [];
    let cur = [];
    r.diem.forEach((q, k) => {
      if (q.so == null) { if (cur.length) doan.push(cur); cur = []; return; }
      cur.push([cx(k), cy((Math.abs(q.so) / dinh) * 100)]);
    });
    if (cur.length) doan.push(cur);
    doan.forEach((d) => {
      if (d.length === 1) return;
      ve.push('<polyline fill="none" stroke="' + mau + '" stroke-width="2.2" '
        + 'stroke-linejoin="round" stroke-linecap="round" points="'
        + d.map((q) => q[0] + ',' + q[1]).join(' ') + '"/>');
    });
    r.diem.forEach((q, k) => {
      if (q.so == null) return;
      const y = cy((Math.abs(q.so) / dinh) * 100);
      ve.push('<circle cx="' + cx(k) + '" cy="' + y + '" r="3.2" fill="' + mau + '">'
        + '<title>' + esc(r.nhan) + ' · T' + Number(x.thang[k].slice(5)) + ': '
        + gon(q.so) + (q.mucTieu ? ' · mục tiêu ' + gon(q.mucTieu) : '') + '</title></circle>');
    });
  });

  const o = el('div', 'xd');
  /* KHÔNG dùng preserveAspectRatio="none": khung rộng 1150px mà viewBox 1000px
   * thì mọi chữ trong SVG bị kéo ngang 15%, nhìn nhoè như lỗi phông. Để tỷ lệ
   * mặc định và cho CSS tính chiều cao theo bề ngang. */
  o.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" '
    + 'role="img" aria-label="Xu hướng các chỉ số theo tháng">' + ve.join('') + '</svg>';
  return o;
}

/** Chú thích kiêm nút bật/tắt từng đường. */
function bcXhChuThich(x, hien, veLai) {
  const o = el('div', 'xd-ct');
  x.dong.forEach((r, i) => {
    const bat = hien(r, i);
    const cuoi = [...r.diem].reverse().find((q) => q.so != null);
    const b = el('button', 'xd-nut' + (bat ? '' : ' tat'));
    b.innerHTML = '<i style="background:' + BC_XH_MAU[i % BC_XH_MAU.length] + '"></i>'
      + '<span>' + esc(r.nhan) + '</span>'
      + '<b>' + (cuoi ? bcSo(cuoi.so, r.dinhDang) : '—') + '</b>';
    b.title = bat ? 'Bấm để ẩn đường này' : 'Bấm để hiện đường này';
    b.onclick = () => { BC_XH_AN[r.nhan] = bat; veLai(); };
    o.appendChild(b);
  });
  return o;
}

/**
 * Một dòng nói về mục tiêu: lấy của tháng nào, đã chia theo ngày chưa, tháng
 * nào chưa đặt. Không có dòng này thì người đọc không biết vạch mục tiêu dưới
 * mỗi ô là mục tiêu cả tháng hay phần đã chia.
 */
function bcChuMucTieu() {
  const m = BC && BC.mucTieu;
  if (!m) return '';
  if (!m.coLuat.length) {
    return '<br><b>Chưa đặt mục tiêu</b> cho '
      + m.thieuLuat.map((x) => 'tháng ' + x.slice(5)).join(', ')
      + ' — các ô không có vạch mục tiêu vì bộ luật KPI tháng đó chưa lập, '
      + 'không phải vì mục tiêu bằng 0.';
  }
  let t = '<br>Mục tiêu lấy từ bộ luật KPI '
    + m.coLuat.map((x) => 'tháng ' + x.slice(5)).join(' + ')
    + ' (' + m.soKenh + ' kênh) — cùng bộ luật đang dùng để chấm lương.';
  if (!m.tronThang) {
    t += ' Khoảng đang xem không trọn tháng nên <b>mục tiêu đã chia theo số ngày</b>, '
      + 'giả định công việc rải đều trong tháng.';
  }
  if (m.thieuLuat.length) {
    t += ' Chưa có bộ luật cho ' + m.thieuLuat.map((x) => 'tháng ' + x.slice(5)).join(', ')
      + ' nên phần đó không góp mục tiêu.';
  }
  return t;
}

/**
 * VẠCH MỤC TIÊU dưới con số.
 *
 * Báo cáo trước đây chỉ nói "được bao nhiêu", không nói "có đạt không" — trong
 * khi nửa KPI của chính app này đã có mục tiêu tới từng kênh. Vạch này nối hai
 * nửa lại: cùng một bộ luật đang dùng để chấm lương, nên báo cáo và phiếu KPI
 * không thể nói hai con số khác nhau.
 *
 * Thang màu dùng chung với các màn KPI: ≥100% xanh · 80–100% vàng · <80% đỏ.
 * Ô nào bộ luật không đặt mục tiêu thì KHÔNG vẽ gì — "chưa đặt mục tiêu" khác
 * hẳn "mục tiêu bằng 0", vẽ một vạch rỗng là nói sai.
 */
function bcVachMucTieu(o) {
  if (!Number.isFinite(o.mucTieu) || o.mucTieu <= 0) return '';
  const pt = Number.isFinite(o.datPt) ? o.datPt : 0;
  const mau = pt >= 100 ? 'dat' : (pt >= 80 ? 'gan' : 'thieu');
  /* Vượt mục tiêu thì thanh đầy, không cho tràn ra ngoài khung — con số phần
   * trăm bên cạnh đã nói rõ vượt bao nhiêu. */
  const w = Math.max(1, Math.min(100, pt));
  return '<div class="mt">'
    + '<div class="mt-ray"><i class="' + mau + '" style="width:' + w + '%"></i></div>'
    + '<div class="mt-chu"><b class="' + mau + '">'
    + (Math.round(pt * 10) / 10).toString().replace('.', ',') + '%</b> mục tiêu '
    + bcSo(o.mucTieu, o.dinhDang) + '</div></div>';
}

/** Một ô số. Tách ra vì cả khối base lẫn khối chi phí đều dùng. */
function bcO(o) {
  const l = o.lech;
  /* CPA thấp là tốt nên đảo chiều màu — không đảo thì "CPA giảm 20%" bị tô đỏ
   * như tin xấu. */
  const tot = (l == null || o.trungTinh) ? null : (o.dao ? l < 0 : l > 0);
  const dLech = (l != null && Number.isFinite(l))
    ? '<div class="ghi ' + (tot == null ? 'im' : tot ? 'tot' : 'xau') + '">'
      + (l > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(l * 10) / 10).toString().replace('.', ',')
      + '% so kỳ trước</div>'
    : '';
  const dGhi = o.ghi ? '<div class="ghi">' + esc(o.ghi) + '</div>' : '';
  return el('div', 'o' + (o.muc === 'cao' ? ' xau' : '') + (o.chinh ? ' chinh' : ''),
    '<div class="nhan">' + esc(o.nhan) + '</div>'
    + '<div class="so">' + bcSo(o.so, o.dinhDang) + '</div>'
    + bcVachMucTieu(o) + dLech + dGhi + bcNen(o.nen));
}

/**
 * PHỄU — các dải thu hẹp dần, KHÔNG có trục số.
 *
 * Cột và thanh đều thua ở đây: từ 3,1 triệu lượt tiếp cận xuống 6 booking là
 * khoảng cách nửa triệu lần, thang nào cũng bóp bốn bậc cuối thành sợi chỉ. Bỏ
 * trục đi thì không còn gì để đọc sai, và bề rộng thu hẹp theo thứ bậc nói đúng
 * cái cần nói: càng xuống sâu càng ít người. Số thật in thẳng lên dải, mức rơi
 * in vào khe giữa hai dải — chỗ rơi nhiều nhất là chỗ cần sửa.
 */
function bcPheu(ds, goc) {
  const g = el('div', 'ss');
  g.appendChild(el('h4', 'ss-tieu', 'Từ người nhìn thấy đến người đặt'));
  const kh = el('div', 'ph-ds');
  ds.forEach((x, i) => {
    /* Bề rộng theo THỨ BẬC chứ không theo số: 100% xuống 34% chia đều. Cố tình
     * không tỷ lệ với giá trị — nếu tỷ lệ thì dải cuối mỏng 0,0002 pixel. */
    const w = 100 - (i * (66 / Math.max(1, ds.length - 1)));
    if (i) {
      const g0 = el('div', 'ph-khe');
      g0.innerHTML = '<span>▼ rơi ' + (100 - x.conLai).toString().replace('.', ',') + '%'
        + ' · còn lại ' + x.conLai.toString().replace('.', ',') + '%</span>';
      kh.appendChild(g0);
    }
    const d = el('div', 'ph-dai');
    d.innerHTML = '<div class="ph-than" style="width:' + w + '%">'
      + '<b>' + gon(x.so) + '</b><span>' + esc(x.nhan) + '</span></div>'
      + (x.moiMot ? '<div class="ph-ghi">cứ ' + x.moiMot.toLocaleString('vi-VN')
        + ' ' + esc(goc) + ' mới có 1</div>' : '');
    d.title = x.nhan + ': ' + gon(x.so);
    kh.appendChild(d);
  });
  g.appendChild(kh);
  g.appendChild(el('div', 'ss-chan',
    'Bề rộng các dải thu hẹp đều theo thứ bậc, <b>không tỷ lệ với con số</b> — '
    + 'bậc đầu và bậc cuối chênh nhau quá xa, vẽ đúng tỷ lệ thì dải cuối mỏng đến '
    + 'mức không nhìn thấy. Số thật in trên từng dải. <b>Các bậc ở đây cùng một '
    + 'tập người và cùng một hệ đo</b> nên tỷ lệ giữa chúng mới có nghĩa — báo cáo '
    + 'chỉ dựng phễu ở những chỗ đạt điều kiện đó.'));
  return g;
}

/**
 * TỆP KHÁCH HÀNG TIẾP CẬN MỚI — khối gộp, đứng ngay sau chi phí.
 *
 * Đặt ở đây là cố ý: đọc xong "phòng tiêu bao nhiêu" thì câu tiếp theo luôn là
 * "đổi được bao nhiêu người mới". Hai khối cạnh nhau thì tự nó thành một câu.
 */
function bcTepMoi(m) {
  const t = el('div', 'the chi-phi');
  t.appendChild(el('header', '',
    '<span class="cham-tron" style="background:#0ea5a0"></span>'
    + '<h3>Tệp khách hàng tiếp cận mới</h3>'
    + '<span class="phu">gộp từ Social · LIVE · Quảng cáo · KOL · OTA</span>'));
  t.appendChild(el('div', 'than nho',
    'Đây là các phép đo <b>rời rạc</b>, không phải các chặng của một phễu: lượt '
    + 'tiếp cận chỉ đo được ở Facebook và Instagram, tin nhắn hầu hết là Zalo OA, '
    + 'còn booking đến từ chợ của các sàn OTA và không có trường nguồn marketing '
    + 'nào nối về đây. <b>Đừng chia bậc này cho bậc kia</b> — mỗi ô ghi rõ chỗ nào '
    + 'đo được. Ô nào không app nào đo được thì để trống chứ không hiện 0.'));
  const luoi = el('div', 'o-luoi');
  (m.o || []).forEach((o) => luoi.appendChild(bcO(o)));
  t.appendChild(luoi);
  /* Khối này KHÔNG còn phễu — xem chú thích trong gomTepMoi() ở bao-cao.js.
   * Các ô dưới đây là những phép đo rời rạc trên các tập người khác nhau; xếp
   * thành phễu là vẽ ra một dòng chảy không tồn tại. */
  (m.bang || []).forEach((bg) => bcBang(t, bg));
  return t;
}

/* Tên và lời dẫn của từng nhóm ô. Khai ở một chỗ để tiêu đề và câu giải thích
 * không bao giờ lệch nhau. */
const BC_NHOM = {
  toi: {
    ten: 'Kết quả của tôi',
    mo: 'cộng từ từng bài có tên tôi ở cột Người đăng',
  },
  kenh: {
    ten: 'Số chung của các kênh tôi phụ trách',
    mo: 'của cả kênh, gồm bài mọi người đăng và cả bài đăng từ trước',
  },
};

/**
 * Vẽ dãy ô, tách nhóm nếu các ô có khai `nhom`.
 *
 * Vì sao phải tách: nhóm "của tôi" và nhóm "cả kênh" đến từ hai nguồn khác
 * hẳn nhau — một bên cộng từng bài đăng trong kỳ, một bên lấy bảng số liệu
 * theo ngày (gồm cả bài cũ). Để chung một lưới thì người đọc tự trừ số này cho
 * số kia, mà trừ là sai hoàn toàn.
 */
function bcLuoiO(t, ds, b) {
  const o = ds || [];
  if (!o.length) return;
  if (!o.some((x) => x.nhom)) {
    const luoi = el('div', 'o-luoi');
    o.forEach((x) => luoi.appendChild(bcO(x)));
    t.appendChild(luoi);
    return;
  }
  /* Thứ tự cố định: của mình trước, cả kênh sau. Người mở phiếu của mình muốn
   * biết mình làm được gì; số của kênh chỉ là bối cảnh. */
  ['toi', 'kenh'].forEach((k) => {
    const ds2 = o.filter((x) => x.nhom === k);
    if (!ds2.length) return;
    const n = BC_NHOM[k] || { ten: k, mo: '' };
    const soKenh = (b && b.soKenhCuaToi) || 0;
    t.appendChild(el('div', 'nhom-o',
      '<h4>' + esc(n.ten) + '</h4><span>' + esc(n.mo)
      + (k === 'kenh' && soKenh ? ' · ' + soKenh + ' kênh' : '') + '</span>'));
    const luoi = el('div', 'o-luoi');
    ds2.forEach((x) => luoi.appendChild(bcO(x)));
    t.appendChild(luoi);
  });
  /* Ô không thuộc nhóm nào thì vẫn phải hiện — bỏ sót một ô còn tệ hơn xếp nó
   * vào nhầm chỗ. */
  const con = o.filter((x) => !x.nhom);
  if (con.length) {
    const luoi = el('div', 'o-luoi');
    con.forEach((x) => luoi.appendChild(bcO(x)));
    t.appendChild(luoi);
  }
}

function bcKhoi(b) {
  const t = el('div', 'the');
  t.appendChild(el('header', '',
    '<span class="cham-tron" style="background:' + esc(b.mau) + '"></span>'
    + '<h3>' + esc(b.ten) + '</h3>'
    + '<span class="phu">' + (b.chay ? esc(b.mo) : '<span class="nhan-o chan">không đọc được</span>') + '</span>'));

  if (!b.chay) {
    t.appendChild(el('div', 'than', '<div class="canhbao chan"><div>'
      + '<b>Không đọc được số liệu</b> — ' + esc(b.loi) + '. '
      + 'Ô của base này để trống chứ không hiện 0, vì 0 và “không đọc được” là hai chuyện khác nhau.'
      + '</div></div>'));
    return t;
  }

  /* Lời cảnh báo của chính app nguồn về giới hạn số liệu của nó — ví dụ Meta đã
   * gỡ mọi chỉ số đếm người duy nhất nên Facebook không có lượt tiếp cận. Đây là
   * nguồn đáng tin nhất về "vì sao ô này trống", nên chép nguyên chứ không tự
   * đoán lại ở tầng này. */
  if ((b.luuY || []).length) {
    t.appendChild(el('div', 'than', '<div class="canhbao tin"><div>'
      + '<b>Giới hạn số liệu của ' + esc(b.ten) + '</b><ul class="luu-y">'
      + b.luuY.map((x) => '<li>' + esc(x) + '</li>').join('')
      + '</ul></div></div>'));
  }

  bcLuoiO(t, b.o, b);

  /* Biểu đồ so sánh kỳ trước — đặt ngay dưới dãy ô, trước biểu đồ theo ngày:
   * "tháng này khác tháng trước chỗ nào" là câu hỏi đến trước "diễn biến trong
   * tháng ra sao". */
  if ((b.soSanh || []).length) {
    const kh = el('div', 'bieu-do');
    kh.appendChild(bcSoSanh(b.soSanh, 'Thay đổi so với kỳ trước', bcNhanKyTruoc()));
    t.appendChild(kh);
  }

  /* Phễu — chỉ khối nào có quy công thật mới khai (Quảng cáo, LIVE). */
  if ((b.pheu || []).length > 1) {
    const kh = el('div', 'bieu-do');
    kh.appendChild(bcPheu(b.pheu, b.goc));
    t.appendChild(kh);
  }

  /* --- cột số tuyệt đối + thanh xếp hạng theo người ---
   * Bảng công việc và Lịch tác nghiệp trước đây chỉ có một vành khuyên trạng
   * thái. Vành khuyên trả lời "việc đang nằm ở đâu" — câu của người trực bảng.
   * Người đọc báo cáo tháng hỏi khác: cái nào nhiều nhất, và ai làm bao nhiêu. */
  /* Tối đa hai hình cạnh nhau. `cot` là cột số tuyệt đối, `thanh`/`thanh2` là
   * bảng xếp hạng — base nào dùng gì thì tự khai, ở đây chỉ xếp chỗ. */
  const hinh = [];
  if (b.cot && (b.cot.muc || []).length) hinh.push(() => bcCot(b.cot));
  [b.thanh, b.thanh2].forEach((x) => {
    if (x && (x.muc || []).length) {
      hinh.push(() => bcThanhNgang(x.muc, x.nhan, 0, x.don || 'so'));
    }
  });
  if (hinh.length) {
    const khung = el('div', 'bieu-do' + (hinh.length > 1 ? ' bieu-do-cap' : ''));
    hinh.forEach((ve) => { const o = el('div'); o.appendChild(ve()); khung.appendChild(o); });
    t.appendChild(khung);
  }

  /* --- biểu đồ: đường theo ngày + vành khuyên cơ cấu, xếp cạnh nhau --- */
  if ((b.chuoi && b.chuoi.diem.length) || (b.tron && b.tron.phan.length)) {
    const khung = el('div', 'bieu-do bieu-do-doi');
    const oDuong = el('div');
    const oTron = el('div');
    khung.appendChild(oDuong); khung.appendChild(oTron);
    t.appendChild(khung);

    if (b.chuoi && b.chuoi.diem.length && window.Charts) {
      /* charts.js nhận mảng bản ghi + danh sách khoá; `x` của mình chính là
       * `date` mà nó mong đợi. */
      Charts.lines(oDuong, b.chuoi.diem.map((p) => Object.assign({ date: p.x }, p)),
        b.chuoi.duong.map((l) => ({ key: l.key, color: l.mau, label: l.label })),
        { height: 210 });
      const ct = el('div', 'chu-thich', b.chuoi.duong
        .map((l) => '<span><i style="background:' + esc(l.mau) + '"></i>' + esc(l.label) + '</span>').join(''));
      oDuong.appendChild(ct);
    }
    if (b.tron && b.tron.phan.length && window.Charts) {
      Charts.donut(oTron, b.tron.phan.map((x) => ({ label: x.nhan, value: x.so })),
        { centerLabel: b.tron.giua, size: 180 });
    }
  }

  /* --- các bảng chi tiết --- */
  (b.bang || []).forEach((bg) => bcBang(t, bg));
  return t;
}
