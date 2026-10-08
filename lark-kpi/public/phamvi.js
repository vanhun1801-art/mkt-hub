/* ================= PHẠM VI BÁO CÁO CỦA TỪNG NGƯỜI =================
 *
 * Khối này nằm trong tab "Phân công kênh" vì hai bảng trả lời hai nửa của cùng
 * một câu hỏi: lưới bên trên nói kênh nào tính điểm cho ai, khối này nói ai
 * được NHÌN THẤY những gì. Tách ra hai tab thì trưởng phòng phải nhớ sang chỗ
 * khác mỗi lần thêm người.
 *
 * Khác lưới phân công ở một điểm quan trọng: phân công gắn với THÁNG (sửa là
 * đổi điểm tháng đó), còn phạm vi xem thì không — mở cho ai là mở luôn, không
 * có chuyện "tháng 8 được xem, tháng 9 thì không".
 */

let PV = null;        // eslint-disable-line no-unused-vars
let PV_MO = null;     // mã người đang mở bảng sửa

async function veKhoiPhamVi(boc) {
  const o = el('div', 'the');
  o.appendChild(el('header', '',
    '<span class="cham-tron" style="background:#0ea5a0"></span>'
    + '<h3>Phạm vi báo cáo</h3>'
    + '<span class="phu">ai nhìn thấy khối nào, kênh nào</span>'));
  boc.appendChild(o);

  try { PV = await goi('pham-vi'); } catch (e) {
    o.appendChild(el('div', 'than', '<div class="rong">' + esc(e.message) + '</div>'));
    return;
  }

  o.appendChild(el('div', 'than nho',
    'Nhân sự mở tab Báo cáo sẽ chỉ thấy đúng những khối và kênh tích ở đây. '
    + 'Chi phí toàn phòng, tệp khách mới và xu hướng <b>luôn chỉ trưởng phòng thấy</b>. '
    + 'Ai chưa khai thì tab Báo cáo không hiện ra với họ.'));

  const bang = el('div', 'pv-ds');
  Object.keys(PV.nguoi).forEach((ma) => bang.appendChild(pvHang(ma, PV.nguoi[ma], boc)));
  o.appendChild(bang);

  const kho = PV.kho || {};
  o.appendChild(el('div', 'than nho nhat', kho.nguon === 'base'
    ? 'Bản sửa ghi thẳng vào bảng <b>Phạm vi báo cáo</b> trên Lark Base, nên còn '
      + 'nguyên sau mỗi lần deploy. '
      + (kho.baseUrl ? '<a href="' + esc(kho.baseUrl) + '" target="_blank">Mở Base</a>' : '')
    : '<b>Đang chạy bản mặc định khai trong mã — sửa ở đây sẽ không lưu được.</b> '
      + esc(kho.loi || 'Chưa nối được Lark Base.')));
}

function pvHang(ma, pv, boc) {
  const h = el('div', 'pv-hang');
  const tenKhoi = (id) => (PV.khoi.find((k) => k.id === id) || {}).ten || id;
  h.innerHTML = '<div class="pv-ten"><b>' + esc(pv.ten || ma) + '</b>'
    + '<em>' + esc(pv.viTri || '') + '</em></div>'
    + '<div class="pv-khoi">'
    + ((pv.khoi || []).length
      ? (pv.khoi || []).map((k) => '<span class="pv-the">' + esc(tenKhoi(k)) + '</span>').join('')
      : '<span class="pv-the trong">chưa khai — không thấy tab Báo cáo</span>')
    + ((pv.kenh || []).length
      ? '<span class="pv-the kenh">' + pv.kenh.length + ' kênh</span>' : '')
    + ((pv.loaiViec || []).length
      ? '<span class="pv-the kenh">việc: ' + esc(pv.loaiViec.join(', ')) + '</span>' : '')
    + '</div>';

  const nut = el('div', 'pv-nut');
  const bSua = el('button', 'nut nhe', PV_MO === ma ? 'Đóng' : 'Sửa');
  bSua.onclick = () => { PV_MO = PV_MO === ma ? null : ma; vePhanCong(); };
  nut.appendChild(bSua);
  const bXem = el('button', 'nut nhe', 'Xem thử báo cáo');
  bXem.title = 'Mở tab Báo cáo đúng như ' + (pv.ten || ma) + ' nhìn thấy';
  bXem.onclick = () => { BC_NHU = ma; doiTab('baocao'); };
  nut.appendChild(bXem);
  h.appendChild(nut);

  if (PV_MO === ma) h.appendChild(pvBangSua(ma, pv));
  return h;
}

function pvBangSua(ma, pv) {
  const o = el('div', 'pv-sua');
  const chon = { khoi: new Set(pv.khoi || []), kenh: new Set(pv.kenh || []) };

  const nhomKhoi = el('div', 'pv-nhom');
  nhomKhoi.appendChild(el('h4', '', 'Khối được xem'));
  PV.khoi.forEach((k) => {
    const l = el('label', 'pv-o');
    const i = el('input'); i.type = 'checkbox'; i.checked = chon.khoi.has(k.id);
    i.onchange = () => { if (i.checked) chon.khoi.add(k.id); else chon.khoi.delete(k.id); };
    l.appendChild(i);
    l.appendChild(el('span', '', '<b>' + esc(k.ten) + '</b><em>' + esc(k.mo) + '</em>'));
    nhomKhoi.appendChild(l);
  });
  o.appendChild(nhomKhoi);

  /* Danh sách kênh lấy từ chính lưới phân công đang mở — khỏi phải gõ tay tên
   * kênh, và chắc chắn trùng đúng tên app Social dùng. */
  const dsKenh = pvDanhSachKenh();
  const nhomKenh = el('div', 'pv-nhom');
  nhomKenh.appendChild(el('h4', '', 'Kênh được xem <em>bỏ trống = mọi kênh</em>'));
  if (!dsKenh.length) {
    nhomKenh.appendChild(el('div', 'than nho nhat', 'Chưa đọc được danh sách kênh từ bộ luật.'));
  }
  dsKenh.forEach((k) => {
    const l = el('label', 'pv-o');
    const i = el('input'); i.type = 'checkbox'; i.checked = chon.kenh.has(k);
    i.onchange = () => { if (i.checked) chon.kenh.add(k); else chon.kenh.delete(k); };
    l.appendChild(i);
    l.appendChild(el('span', '', esc(k.replace('|', ' · '))));
    nhomKenh.appendChild(l);
  });
  o.appendChild(nhomKenh);

  const nhomChu = el('div', 'pv-nhom');
  nhomChu.appendChild(el('h4', '', 'Tên người này ở các app khác'));
  const iTen = el('textarea');
  iTen.rows = 2;
  iTen.value = (pv.tenApp || []).join('\n');
  iTen.placeholder = 'Mỗi dòng một tên, ví dụ: Nguyễn Long Khánh (Pinky)';
  nhomChu.appendChild(iTen);
  nhomChu.appendChild(el('div', 'than nho nhat',
    'Dùng để lọc việc và buổi tác nghiệp của đúng người này. '
    + '<b>Khớp đúng từng chữ</b> — bảng công việc có cả "Nguyễn Long Khánh (Pinky)" '
    + 'lẫn "Huỳnh Chí Khanh", gõ thiếu là lấy nhầm việc của người khác.'));

  nhomChu.appendChild(el('h4', '', 'Chỉ các loại việc <em>bỏ trống = mọi loại</em>'));
  const iLoai = el('input');
  iLoai.value = (pv.loaiViec || []).join(', ');
  iLoai.placeholder = 'Edit Video, Thiết kế';
  nhomChu.appendChild(iLoai);

  /* Hai ô này trước đây chỉ khai trong mã, màn hình không gửi lên. Giờ Base là
   * nơi giữ bản thật nên không gửi nghĩa là XOÁ — phải cho sửa ngay tại đây. */
  nhomChu.appendChild(el('h4', '', 'Tên trong plugin Người đăng <em>app Social</em>'));
  const iDang = el('input');
  iDang.value = (pv.tenDang || []).join(', ');
  iDang.placeholder = 'Võ Hằng';
  nhomChu.appendChild(iDang);
  nhomChu.appendChild(el('div', 'than nho nhat',
    'Tên gắn trên từng bài ở app Social, thường khác tên trong bộ luật KPI. '
    + 'Dùng để tách bài <b>chính người này đăng</b> khỏi số chung của cả kênh.'));

  nhomChu.appendChild(el('h4', '', 'Chỉ các nền tảng quảng cáo <em>bỏ trống = mọi nền tảng</em>'));
  const iQc = el('input');
  iQc.value = (pv.nenTangQc || []).join(', ');
  iQc.placeholder = 'Google Ads';
  nhomChu.appendChild(iQc);
  o.appendChild(nhomChu);

  const nut = el('div', 'pv-luu');
  const b = el('button', 'nut', 'Lưu phạm vi');
  b.onclick = async () => {
    b.disabled = true;
    const tach = (v) => v.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    try {
      await goi('luu-pham-vi', {
        ma,
        pv: {
          ten: pv.ten,
          viTri: pv.viTri,
          tenApp: tach(iTen.value),
          khoi: [...chon.khoi],
          kenh: [...chon.kenh],
          loaiViec: tach(iLoai.value),
          tenDang: tach(iDang.value),
          nenTangQc: tach(iQc.value),
        },
      });
      PV_MO = null;
      vePhanCong();
    } catch (e) { b.disabled = false; alert(e.message); }
  };
  nut.appendChild(b);
  o.appendChild(nut);
  return o;
}

/** Tên kênh rút từ bộ luật đang mở, dạng "Nền tảng|Tên kênh". */
function pvDanhSachKenh() {
  const NEN = {
    fb: 'Facebook', facebook: 'Facebook', tiktok: 'TikTok',
    insta: 'Instagram', instagram: 'Instagram', zalooa: 'Zalo OA', zalo: 'Zalo OA',
  };
  const ra = new Set();
  ((PC && PC.nhom) || []).forEach((n) => {
    const ph = String(n.khoa || n.ma || '').split('|');
    if (ph.length < 2) return;
    const nt = NEN[ph[0].toLowerCase()];
    if (nt) ra.add(nt + '|' + ph[1]);
  });
  return [...ra].sort();
}
