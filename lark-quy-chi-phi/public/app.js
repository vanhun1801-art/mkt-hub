'use strict';
/* ============================================================================
 * QUỸ CHI PHÍ MARKETING — giao diện
 * ============================================================================
 *
 * Thay sáu tab của sheet cũ. Bốn việc app phải làm được, theo đúng thứ tự anh
 * Hùng cần trong ngày:
 *
 *   1. Còn bao nhiêu tiền trong quỹ — câu hỏi đầu tiên mỗi lần mở
 *   2. Khai một khoản chi, đính kèm hoá đơn + UNC ngay lúc khai
 *   3. Quyết toán theo lô — gán một mã QTTU cho hàng chục khoản cùng lúc
 *   4. Khoản nào thiếu chứng từ — sheet cũ thiếu UNC ở 67/162 dòng vì không ai
 *      nhìn ra được chỗ thiếu
 *
 * Không framework, cùng lối với các app khác của phòng.
 * ========================================================================== */

const S = {
  chi: [], nap: [], quy: { tongUng: 0, tongChi: 0, conLai: 0, soLanUng: 0 },
  options: { loaiChi: [], tinhTrang: [] },
  me: null, vai: 'xem', chuQuy: false,
  /* Mã quyết toán gần nhất, để chị kế toán duyệt cả xâu khoản cùng một mã mà
   * không phải gõ lại mười lần. */
  maCuoi: '',
  loc: { loai: '', tinhTrang: '', thang: '', tim: '' },
  chon: new Set(),
  tab: 'so',              // so | thieu | ung
};

/* ---------------------------------------------------------------------------
 * BA VAI
 * -------------------------------------------------------------------------
 * Không phải "chủ quỹ" với "phần còn lại". Kế toán là một vai thật, có việc
 * thật: kiểm chứng từ rồi ĐÓNG SỔ. Ba câu hỏi dưới đây là toàn bộ chỗ giao
 * diện phân biệt vai — chỗ nào cần rẽ nhánh thì hỏi một trong ba, đừng so
 * chuỗi 'keToan' rải rác khắp tệp.
 *
 * Server chốt lại y hệt. Giấu nút chỉ là phép lịch sự với mắt người dùng,
 * không phải hàng rào.
 */
const laChuQuy = () => S.vai === 'chuQuy';
const laKeToan = () => S.vai === 'keToan';
const duocQuyetToan = () => laChuQuy() || laKeToan();

const XUONG_DONG = String.fromCharCode(10);
const THEM_DONG = String.fromCharCode(10, 10);   /* hai dòng trống trong hộp hỏi lại */

const $ = (s, g = document) => g.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tien = (n) => (Number(n) || 0).toLocaleString('vi-VN');
const apiUrl = (p) => (location.pathname.replace(/\/+$/, '') + p).replace(/^\/\//, '/');

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 260); },
    kind === 'err' ? 5200 : 2600);
}

/**
 * Chặn cú bấm thứ hai trong lúc cú thứ nhất còn đang bay.
 *
 * "Ghi vào sổ" gọi Tourwell nên mất 3–8 giây, mà nút thì không đổi gì trong
 * lúc chờ. Bấm lại vì tưởng hụt là ĐẺ RA MỘT KHOẢN CHI THỨ HAI và một đơn
 * Tourwell thứ hai — quỹ bị trừ hai lần cho một lần tiêu, và phát hiện ra thì
 * đã phải đi xoá ở hai hệ thống.
 *
 * Khoá ngay ở phần tử nút chứ không giữ cờ toàn cục: hai cửa sổ khác nhau vẫn
 * bấm được độc lập, và nút tự nhả kể cả khi lời gọi ném lỗi.
 */
async function chongBamHai(nut, viec, dangLam) {
  if (!nut || nut.disabled) return;
  const chu = nut.textContent;
  nut.disabled = true;
  /* Nói đúng việc đang chạy. "Đang lưu…" trên nút Từ chối là sai — người bấm
   * không lưu gì cả, họ đang trả một khoản về cho người giữ quỹ. */
  nut.textContent = dangLam || 'Đang lưu…';
  try {
    await viec();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    nut.disabled = false;
    nut.textContent = chu;
  }
}

async function api(path, opts) {
  const r = await fetch(apiUrl(path), Object.assign(
    { headers: { 'Content-Type': 'application/json' } }, opts || {}));
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (!r.ok) throw new Error('Lỗi máy chủ ' + r.status);
    return r;
  }
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || ('Lỗi ' + r.status));
  return d;
}

/* ---------------- ngày ---------------- */
function ngayVN(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}
function thangCua(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
const homNay = () => new Date().toISOString().slice(0, 10);

/* ---------------- đọc dữ liệu ---------------- */
async function taiLai(moi) {
  const d = await api('/api/meta' + (moi ? '?moi=1' : ''));
  S.chi = d.chi || [];
  S.nap = d.nap || [];
  S.quy = d.quy || S.quy;
  S.options = d.options || S.options;
  S.me = d.me;
  S.vai = d.vai || (d.chuQuy ? 'chuQuy' : 'xem');
  S.chuQuy = S.vai === 'chuQuy';
  S.chon.clear();
  ve();
}

/* Các lần ứng tiền, mới nhất trước. "Chuyển từ kỳ trước" không phải tiền công
 * ty đưa thêm — nó là tồn của kỳ trước, đếm vào là tính trùng. */
const LAN_CHUYEN_TIEP = 'Chuyển từ kỳ trước';
/* Cột tình trạng trả lời câu "KHOẢN ĐANG Ở ĐÂU", không phải "AI làm gì" — nên
 * là "Chờ điều chỉnh" chứ không phải "Kế toán trả lại". Ai yêu cầu thì đã rõ
 * qua vai; điều người giữ quỹ cần biết là khoản đang chờ mình làm gì. */
const CHO_CHINH = 'Chờ điều chỉnh';

/**
 * KHOẢN NÀO THẬT SỰ CẦN BỔ SUNG CHỨNG TỪ
 *
 * Luật đầu tiên tôi viết là "không đủ cả hoá đơn LẪN UNC = thiếu", và nó gắn cờ
 * 68/162 khoản — trong đó 67 khoản kế toán đã nhận và đóng sổ từ lâu. Một cảnh
 * báo réo sai 67 lần thì lần thứ 68 cũng không ai nhìn.
 *
 * Luật đúng theo cách kế toán thật sự làm việc:
 *
 *   · ĐÃ QUYẾT TOÁN thì thôi — có mã QTTU nghĩa là kế toán đã kiểm và chấp nhận.
 *     Đòi thêm chứng từ của khoản đã đóng là vô nghĩa.
 *   · "Không cần chứng từ" là một câu trả lời hợp lệ, không phải chỗ trống. Chi
 *     nhỏ lẻ, hỗ trợ tiền ăn thường không có hoá đơn VAT; hoá đơn tay hoặc ảnh
 *     là đủ và kế toán vẫn duyệt.
 *   · Chỉ cần MỘT bằng chứng, không đòi cả hai. Trả tiền mặt thì không bao giờ
 *     có UNC; mua ở chỗ không xuất hoá đơn thì chỉ có UNC. Đòi đủ cả hai là bịa
 *     ra một chuẩn mà chính kế toán không đặt.
 */
/**
 * Ô "Mã đơn Tourwell" lưu "RT16409 · https://…" — tách lại thành mã và link.
 *
 * Nhận cả KHOẢN CHI chứ không riêng chuỗi, vì địa chỉ đơn có thể không nằm
 * trong ô: mấy dòng cũ chỉ có mã trần. Máy chủ dựng địa chỉ hộ rồi đưa xuống ở
 * `linkDon` (xem linkDonTourwell trong server.js) — trình duyệt không biết
 * địa chỉ máy chủ Tourwell nên không tự dựng được.
 *
 * Trả về null khi trống, để chỗ gọi phân biệt được "chưa có đơn" với "có đơn
 * mà không có link".
 */
function tachDon(c) {
  const o = (c && typeof c === 'object') ? c : { maDon: c };
  const s = String(o.maDon || '').trim();
  if (!s) return null;
  const m = s.match(/(https?:\/\/\S+)/);
  return { ma: s.split('·')[0].trim() || s, link: m ? m[1] : String(o.linkDon || '') };
}

function thieuChungTu(c) {
  if (c.tinhTrang === 'Chờ chi') return false;
  if (String(c.maQuyetToan || '').trim()) return false;
  if (c.tinhTrang === 'Đã quyết toán') return false;
  if (c.chungTu === 'Không cần chứng từ') return false;
  const coHoaDon = (c.hoaDon || []).length || String(c.linkCu || '').trim();
  const coUnc = (c.unc || []).length || String(c.linkUncCu || '').trim();
  return !coHoaDon && !coUnc;
}

/**
 * Khoản nào "chọn hết" được phép quét vào.
 *
 * KHÔNG phải mọi dòng đang hiện. Trong 163 khoản của sổ có 154 khoản đã mang
 * mã QTTU riêng từ những đợt quyết toán cũ; quét cả vào rồi gán một mã mới là
 * xoá sạch 154 mã đó, không hoàn lại được. Ô tích ở đầu bảng vì thế chỉ lấy
 * khoản CHƯA có mã và ĐÃ chi tiền — đúng nghĩa "những khoản còn phải đóng sổ".
 *
 * Tick từng dòng thì vẫn tick được khoản đã có mã: sửa một mã gõ nhầm là việc
 * có thật. Nhưng lúc đó phải là một hành động có chủ ý trên đúng dòng đó, và
 * cửa sổ quyết toán sẽ nói thẳng là sắp ghi đè lên cái gì.
 */
const quyetToanDuoc = (c) => !String(c.maQuyetToan || '').trim() && c.tinhTrang !== 'Chờ chi';

/**
 * Khoản nào được mời tạo bù đơn Tourwell.
 *
 * KHÔNG phải mọi khoản đang thiếu mã đơn. 162 dòng nhập từ sheet cũ đều trống
 * ô "Mã đơn Tourwell", nhưng chúng ĐÃ đi qua Tourwell bằng tay từ lâu — dấu
 * vết là mã điều hành SG… và mã quyết toán QTTU… nằm ngay trên dòng. Mời tạo
 * đơn cho chúng là bày sẵn 162 cái bẫy: bấm nhầm một cái là một đơn THẬT mọc
 * lên trên Tourwell cho khoản tiền đã đóng sổ từ tháng 4.
 *
 * Nên chỉ mời khi không còn dấu vết nào của một lần qua Tourwell trước đó.
 */
const canTaoDon = (c) => !String(c.maDon || '').trim()
  && !String(c.maDieuHanh || '').trim()
  && !String(c.maQuyetToan || '').trim()
  && c.tinhTrang !== 'Đã quyết toán';

function locChi() {
  const l = S.loc;
  const tim = l.tim.trim().toLowerCase();
  return S.chi.filter((c) => {
    if (l.loai && c.loai !== l.loai) return false;
    if (l.tinhTrang && c.tinhTrang !== l.tinhTrang) return false;
    if (l.thang && thangCua(c.ngayChi || c.ngayDeNghi) !== l.thang) return false;
    if (S.tab === 'thieu' && !thieuChungTu(c)) return false;
    if (tim) {
      /* Gồm cả MÃ ĐƠN RT: đó là mã kế toán đối chiếu nhiều nhất, mà trước đây
       * dán RT16438 vào ô tìm thì ra rỗng — ô tìm chỉ soi mã điều hành SG.
       * Thêm mã số thuế và lý do trả lại vì cả hai đều là thứ người ta nhớ
       * loáng thoáng rồi đi tìm lại. */
      const kho = [c.noiDung, c.maDon, c.maDieuHanh, c.maQuyetToan, c.ncc,
        c.soHoaDon, c.mst, c.lyDoTuChoi, c.ghiChu].join(' ').toLowerCase();
      if (!kho.includes(tim)) return false;
    }
    return true;
  }).sort((a, b) => String(b.ngayChi || b.ngayDeNghi || '').localeCompare(String(a.ngayChi || a.ngayDeNghi || '')));
}

/* ---------------------------------------------------------------------------
 * MỘT KỲ LÀ MỘT THÁNG
 * -------------------------------------------------------------------------
 * Anh Hùng và kế toán chốt sổ theo tháng, nên bốn con số kế toán cần là bốn
 * con số của MỘT kỳ, và chúng phải cộng khớp nhau:
 *
 *     số dư đầu kỳ  +  nạp trong kỳ  −  chi trong kỳ  =  tồn cuối kỳ
 *
 * Trước đây màn hình chỉ có "còn trong quỹ" (một con số sống, không thuộc kỳ
 * nào) và "chi tháng này". Kế toán nhìn vào không dựng lại được phép tính trên,
 * nên vẫn phải mở sheet ra cộng tay — đúng việc app này sinh ra để bỏ.
 *
 * Bản ghi KHÔNG CÓ NGÀY được tính vào "trước kỳ": chúng là dữ liệu cũ nhập từ
 * sheet. Xếp vào kỳ hiện tại thì tháng này tự dưng phình ra một khoản không ai
 * tiêu.
 */
function tinhKy(thang) {
  const truocKy = (v) => { const t = thangCua(v); return !t || t < thang; };
  const trongKy = (v) => thangCua(v) === thang;
  const lanNap = S.nap.filter((n) => n.loai !== LAN_CHUYEN_TIEP);
  const cong = (ds) => ds.reduce((a, x) => a + (Number(x.tien) || 0), 0);

  const dauKy = cong(lanNap.filter((n) => truocKy(n.ngay)))
    - cong(S.chi.filter((c) => truocKy(c.ngayChi || c.ngayDeNghi)));
  const nap = cong(lanNap.filter((n) => trongKy(n.ngay)));
  const chi = cong(S.chi.filter((c) => trongKy(c.ngayChi || c.ngayDeNghi)));
  return { dauKy, nap, chi, cuoiKy: dauKy + nap - chi };
}

/**
 * KỲ NÀO ĐÓNG SỔ ÂM LÀ CÓ CHUYỆN.
 *
 * Quỹ tạm ứng không âm được: tiêu là tiêu tiền đã ứng. Một kỳ ra số âm nghĩa là
 * có khoản chi bị xếp nhầm kỳ — ngày thanh toán gõ lệch một hai ngày là đủ đẩy
 * cả cục tiền sang tháng trước.
 *
 * Ngày 15/09/2026 ba khoản (1.465.200) mang ngày 31/08 thay vì 01/09, và tháng
 * 8 đóng ở −495.200 trong khi anh Hùng cùng kế toán đã chốt tháng đó ở 970.000.
 * Tổng quỹ vẫn đúng nên không có gì bật ra — phải ngồi dò tay mới thấy.
 *
 * Chuông này biến chuyện đó thành một vệt đỏ ngay đầu trang.
 */
function kyAm() {
  const thangs = [...new Set(S.chi.map((c) => thangCua(c.ngayChi || c.ngayDeNghi))
    .filter(Boolean))].sort();
  return thangs.filter((t) => tinhKy(t).cuoiKy < 0);
}

/* Kỳ đang xem = tháng người dùng chọn ở bộ lọc, không chọn thì là tháng này.
 * Nhờ vậy chị kế toán lọc sang tháng 8 là cả dải số trên đầu nhảy theo — chốt
 * sổ tháng nào thì nhìn đúng tháng đó. */
const kyDangXem = () => S.loc.thang || thangCua(new Date().toISOString());
const tenKy = (t) => 'tháng ' + t.slice(5) + '/' + t.slice(0, 4);

/* ---------------- vẽ ---------------- */
const TEN_VAI = { chuQuy: 'Người giữ quỹ', keToan: 'Kế toán', xem: 'Chỉ xem' };

function ve() {
  $('#phuDe').textContent = (laChuQuy() ? 'Sổ quỹ · ' : laKeToan() ? 'Kiểm chứng từ · ' : 'Chỉ xem · ')
    + S.chi.length + ' khoản chi · ' + S.quy.soLanUng + ' lần ứng tiền';

  /* Chip danh tính ở thanh trên — giống Quản lý quảng cáo và Báo cáo công việc.
   * Mở app ra mà không biết mình đang là vai nào thì mọi nút thiếu đều thành
   * một câu hỏi; nói thẳng ra thì không ai phải đoán. */
  const chip = $('#chipVai');
  if (chip) {
    chip.textContent = TEN_VAI[S.vai] + (S.me && S.me.name ? ' · ' + S.me.name : '');
    chip.className = 'chip ' + S.vai;
  }

  /* Vai không được phép thì GIẤU HẲN nút, đừng để nó nằm đó rồi bấm vào chỉ báo
   * "bạn không có quyền". Một nút bấm được mà không làm gì là lời hứa suông. */
  [['#btnNap', laChuQuy()], ['#btnChiMoi', laChuQuy()]].forEach(([sel, hien]) => {
    const e = $(sel);
    if (e) e.hidden = !hien;
  });

  /* Hộp thanh chọn dựng LUÔN LUÔN, dù rỗng. Nó `position: fixed` nên không
   * chiếm chỗ trong dòng chảy — hiện hay ẩn đều không xê dịch một hàng nào. */
  $('#man').innerHTML = veTong() + veLoc() + (S.tab === 'ung' ? veUng() : veBang())
    + '<div id="thanhChonHop">' + (S.chon.size ? veThanhChon() : '') + '</div>';
  /* Chừa đáy trang đúng bằng thanh đang nổi, để hàng cuối không bị nó che.
   * Đệm ở ĐÁY thì thêm bao nhiêu cũng không đẩy hàng nào xuống. */
  document.body.classList.toggle('co-thanhchon', S.chon.size > 0);
  ganSuKien();
}

function veTong() {
  const ky = kyDangXem();
  const k = tinhKy(ky);
  const dangLocThang = !!S.loc.thang;
  const soThieu = S.chi.filter(thieuChungTu).length;
  const chuaQuyetToan = S.chi.filter((c) => c.tinhTrang === 'Đã chi').length;
  const traLai = S.chi.filter((c) => c.tinhTrang === CHO_CHINH).length;
  const soKhoanKy = S.chi.filter((c) => thangCua(c.ngayChi || c.ngayDeNghi) === ky).length;

  const oSo = (nhan, so, mo, phu) => '<div class="o' + (phu && phu.lop ? ' ' + phu.lop : '')
    + '"' + (phu && phu.bam ? ' ' + phu.bam : '') + '>'
    + '<div class="nhan">' + nhan + '</div>'
    + '<div class="so' + (phu && phu.coNho ? '' : ' nho') + (Number(so) < 0 ? ' am' : '') + '">'
    + (phu && phu.thoTien === false ? so : tien(so) + '<span class="d">đ</span>') + '</div>'
    + (mo ? '<div class="mo">' + mo + '</div>' : '')
  + '</div>';

  /* Tồn cuối kỳ khi đang lọc một tháng cụ thể; không lọc thì đó chính là số dư
   * sống của quỹ — cùng một phép tính, khác cái tên vì khác câu hỏi người ta
   * đang hỏi. */
  const oChinh = dangLocThang
    ? oSo('Tồn cuối ' + tenKy(ky), k.cuoiKy,
        'đầu kỳ ' + tien(k.dauKy) + ' + nạp ' + tien(k.nap) + ' − chi ' + tien(k.chi),
        { lop: 'chinh', coNho: true })
    : oSo('Còn trong quỹ', S.quy.conLai,
        'đã ứng ' + tien(S.quy.tongUng) + ' · đã chi ' + tien(S.quy.tongChi),
        { lop: 'chinh', coNho: true });

  /* Vệt đỏ đứng TRƯỚC dải số: nếu có kỳ âm thì mọi con số bên dưới đều đang kể
   * một câu chuyện sai, nói ra trước khi người ta kịp tin chúng. */
  const am = kyAm();
  const bao = am.length
    ? '<div class="bao-am"><b>Có ' + am.length + ' kỳ đóng sổ âm: '
      + am.map(tenKy).join(' · ') + '.</b> Quỹ tạm ứng không âm được — gần như '
      + 'chắc chắn có khoản chi bị gõ nhầm ngày thanh toán nên rơi sang tháng khác. '
      + 'Bấm vào tháng đó ở bộ lọc để soi.</div>'
    : '';

  return bao + '<section class="tong">'
    + oChinh
    /* Số dư đầu kỳ: con số kế toán cần để mở sổ tháng mới, và là vế trái của
     * phép tính đầu kỳ + nạp − chi = cuối kỳ. Thiếu nó thì ba con số kia không
     * kiểm chéo được với nhau. */
    + oSo('Số dư đầu ' + tenKy(ky), k.dauKy,
        k.nap ? 'nạp thêm trong kỳ + ' + tien(k.nap) : 'chưa nạp thêm trong kỳ')
    /* Dòng mờ nói SỐ KHOẢN chứ không nói "bấm chỗ kia để xem kỳ khác". Một câu
     * chỉ dẫn đứng thường trực thì đọc một lần là thừa mãi mãi; số khoản thì
     * lần nào cũng là tin mới. */
    + oSo('Chi trong ' + tenKy(ky), k.chi, soKhoanKy + ' khoản')
    + oSo('Cần bổ sung chứng từ', soThieu,
        soThieu ? 'bấm để xem' : 'không còn khoản nào',
        { thoTien: false, lop: soThieu ? 'canhbao' : '', bam: 'data-tab="thieu"' })
    + oSo('Chờ quyết toán', chuaQuyetToan, chuaQuyetToan ? 'bấm để lọc ra' : 'đã gán mã hết',
        { thoTien: false, bam: 'data-loctt="Đã chi"' })
    /* Chỉ hiện khi CÓ khoản bị trả lại. Một ô số 0 đứng thường trực là một ô
     * người ta học cách không nhìn; đúng lúc nó khác 0 thì cũng trôi qua mắt. */
    + (traLai
      ? oSo('Chờ điều chỉnh', traLai, 'bấm để xem phải sửa gì',
          { thoTien: false, lop: 'canhbao', bam: 'data-loctt="' + CHO_CHINH + '"' })
      : '')
  + '</section>';
}

function veLoc() {
  const thangs = [...new Set(S.chi.map((c) => thangCua(c.ngayChi || c.ngayDeNghi)).filter(Boolean))]
    .sort().reverse();
  const opt = (ds, sel, rong) => '<option value="">' + rong + '</option>'
    + ds.map((x) => '<option value="' + esc(x.v != null ? x.v : x) + '"'
      + ((x.v != null ? x.v : x) === sel ? ' selected' : '') + '>'
      + esc(x.t != null ? x.t : x) + '</option>').join('');

  return '<section class="thanh">'
    + '<div class="tabs">'
      + ['so:Sổ quỹ', 'thieu:Cần bổ sung chứng từ', 'ung:Các lần ứng tiền'].map((x) => {
        const [k, t] = x.split(':');
        return '<button class="tab' + (S.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + t + '</button>';
      }).join('')
    + '</div>'
    + (S.tab === 'ung' ? '' :
      '<div class="loc">'
      + '<input id="lTim" placeholder="Tìm nội dung, mã đơn RT, mã điều hành SG, mã quyết toán…" value="'
        + esc(S.loc.tim) + '">'
      + '<select id="lThang">' + opt(thangs.map((m) => ({ v: m, t: 'Tháng ' + m.slice(5) + '/' + m.slice(0, 4) })), S.loc.thang, 'Mọi tháng') + '</select>'
      + '<select id="lLoai">' + opt(S.options.loaiChi, S.loc.loai, 'Mọi loại') + '</select>'
      + '<select id="lTT">' + opt(S.options.tinhTrang, S.loc.tinhTrang, 'Mọi tình trạng') + '</select>'
      + '</div>')
  + '</section>';
}

function veBang() {
  const ds = locChi();
  const tong = ds.reduce((a, c) => a + c.tien, 0);
  if (!ds.length) {
    return '<section class="bang"><div class="trong">'
      + (S.tab === 'thieu' ? 'Không khoản nào thiếu chứng từ.' : 'Không có khoản chi nào khớp bộ lọc.')
      + '</div></section>';
  }

  const dong = (c) => {
    /* Dòng đỏ có hai nguồn: thiếu chứng từ, và kế toán trả lại. Cả hai đều là
     * "có việc phải làm ở dòng này", nên dùng chung một màu — thêm màu thứ ba
     * chỉ làm loãng cái đang có nghĩa. */
    const thieu = thieuChungTu(c) || c.tinhTrang === CHO_CHINH;
    const dv = tachDon(c);
    return '<tr' + (thieu ? ' class="canhbao"' : '') + '>'
      + '<td class="chon">' + (duocQuyetToan()
        ? '<input type="checkbox" data-chon="' + c.id + '"' + (S.chon.has(c.id) ? ' checked' : '') + '>' : '') + '</td>'
      + '<td class="nd"><b>' + esc(c.noiDung || '(không tên)') + '</b>'
        + '<div class="phu2">' + [
          /* Mã đơn Tourwell: bấm được, mở thẳng đơn. Kế toán đối chiếu theo mã
           * này nên nó phải nổi hơn mấy thứ khác trong dòng phụ. */
          dv ? (dv.link
            ? '<a class="ma-don" target="_blank" href="' + esc(dv.link) + '">' + esc(dv.ma) + '</a>'
            : '<span class="ma-don">' + esc(dv.ma) + '</span>')
            /* Chưa có đơn: tạo BÙ ngay tại dòng. Trước đây cách duy nhất là
             * khai lại khoản chi — tức là đẻ thêm một dòng, trừ quỹ hai lần. */
            : (laChuQuy() && canTaoDon(c)
              ? '<button class="ma-them" data-taodon="' + c.id + '">+ đơn Tourwell</button>' : ''),
          c.maDieuHanh
            ? esc(c.maDieuHanh)
            : (laChuQuy() ? '<button class="ma-them" data-gansg="' + c.id + '">+ mã điều hành</button>' : ''),
          /* Mã số thuế nhà cung cấp: thứ kế toán soi để biết hoá đơn có hợp lệ
           * không. Chỉ hiện khi có, nên sổ không bị thêm một cột trống. */
          c.mst ? '<span class="mst">MST ' + esc(c.mst) + '</span>' : '',
        ].filter(Boolean).join(' · ') + '</div>'
        /* Lý do trả lại nằm NGAY DƯỚI nội dung, không giấu trong ô Ghi chú:
         * đây là câu kế toán nhắn cho người giữ quỹ, và nó chỉ có tác dụng nếu
         * đọc được mà không phải bấm vào đâu cả. */
        + (c.tinhTrang === CHO_CHINH && c.lyDoTuChoi
          ? '<div class="tra-lai">Cần điều chỉnh: ' + esc(c.lyDoTuChoi) + '</div>' : '')
        + '</td>'
      + '<td class="loai"><span class="the">' + esc(c.loai || '—') + '</span></td>'
      + '<td class="num">' + tien(c.tien) + '</td>'
      + '<td class="ngay">' + esc(ngayVN(c.ngayChi || c.ngayDeNghi)) + '</td>'
      + '<td class="ai">' + esc(((c.nguoi || [])[0] || {}).name || '') + '</td>'
      /* Kế toán chỉ thấy hoá đơn — luật nằm trong taiLieuCua(). */
      + '<td class="teps">' + veChungTu(c) + '</td>'
      /* Mã quyết toán đứng thành CỘT RIÊNG, không nhét vào dòng phụ dưới nội
       * dung nữa. Đó là ô kế toán dò dọc theo trang để biết khoản nào đã đóng
       * sổ; nằm lẫn trong một dòng chữ xám thì phải đọc từng dòng mới thấy. */
      + '<td class="maqt">' + (c.maQuyetToan
        ? '<span class="qt">' + esc(c.maQuyetToan) + '</span>' : '<span class="mo">—</span>') + '</td>'
      + '<td class="tt"><span class="badge ' + (c.tinhTrang === 'Đã quyết toán' ? 'xanh'
        : c.tinhTrang === CHO_CHINH ? 'do'
        : c.tinhTrang === 'Đã chi' ? 'vang' : 'xam') + '">' + esc(c.tinhTrang || '—') + '</span></td>'
      /* Cột tác vụ nói đúng việc của từng vai. Kế toán soi TỪNG dòng rồi nhận
       * hoặc trả — bắt họ tích chọn rồi mở cửa sổ cho một dòng là bắt đi đường
       * vòng cho việc họ làm nhiều nhất. */
      + '<td class="tacvu">' + veTacVu(c) + '</td>'
      + '</tr>';
  };

  /* Thanh chọn KHÔNG nằm ở đây nữa — xem #thanhChonHop trong ve(). Đặt nó
   * trong dòng chảy của bảng thì lúc hiện ra nó đẩy cả bảng xuống 52px, gần
   * bằng một hàng (60px): tích ô đầu tiên xong, con trỏ đang đứng ở hàng khác
   * mà không ai bảo. */
  return '<section class="bang">'
    + '<div class="cuon"><table><thead><tr>'
      + '<th class="chon">' + (duocQuyetToan() ? '<input type="checkbox" id="chonHet">' : '') + '</th>'
      + '<th>Nội dung</th><th>Loại</th><th class="num">Số tiền</th><th>Ngày chi</th>'
      + '<th>Người</th><th>Chứng từ</th><th>Mã quyết toán</th><th>Tình trạng</th><th></th>'
    + '</tr></thead><tbody>' + ds.map(dong).join('') + '</tbody>'
    + '<tfoot><tr><td colspan="3">' + ds.length + ' khoản</td>'
      + '<td class="num">' + tien(tong) + '</td><td colspan="6"></td></tr></tfoot>'
    + '</table></div></section>';
}

/* ---------------------------------------------------------------------------
 * CHỨNG TỪ: MỘT NÚT, MỘT CỬA SỔ
 * -------------------------------------------------------------------------
 * Trước đây mỗi tệp là một con chip, kèm một chip ⇩ đi cạnh. Khoản 13/09 có
 * sáu hoá đơn nên ô chứng từ nở thành mười hai con chip xuống ba hàng, đẩy
 * chiều cao dòng lên gấp ba và làm mọi dòng khác lệch nhịp. Mắt phải đọc mười
 * hai thứ để biết một chuyện duy nhất: khoản này có chứng từ hay chưa.
 *
 * Giờ một nút. Có chứng từ thì nó sáng, bấm vào mở cửa sổ bày cả bộ.
 * ------------------------------------------------------------------------- */
function taiLieuCua(c) {
  const ra = [];
  const them = (arr, linkCu, nhan) => {
    (arr || []).forEach((f, i) => {
      if (!f || !f.token) return;
      ra.push({ nhan, ten: f.name || (nhan + ' ' + (i + 1)), token: f.token, recId: c.id });
    });
    /* Chứng từ cũ vẫn là link Google Drive. Chỉ hiện khi KHÔNG có tệp thật —
     * có tệp rồi mà còn bày link cũ là mời người ta đi nhầm đường. */
    if (!(arr || []).some((f) => f && f.token) && String(linkCu || '').trim()) {
      ra.push({ nhan, ten: nhan + ' (Drive cũ)', linkCu: String(linkCu).trim() });
    }
  };
  them(c.hoaDon, c.linkCu, 'Hoá đơn');
  /* Kế toán chỉ thấy hoá đơn — cùng luật với bảng, và vì cùng một lý do. */
  if (!laKeToan()) them(c.unc, c.linkUncCu, 'UNC');
  return ra;
}

/** Nhãn ngắn cho cột Chứng từ khi kế toán đã chấp nhận một dạng khác hoá đơn. */
function theChungTu(c) {
  if (c.chungTu === 'Không cần chứng từ') {
    return '<span class="the" title="Kế toán đã đồng ý không cần chứng từ">không cần</span>';
  }
  if (c.chungTu === 'Hoá đơn tay / ảnh') {
    return '<span class="the" title="Hoá đơn tay hoặc ảnh — kế toán chấp nhận">tay/ảnh</span>';
  }
  return '';
}

function veChungTu(c) {
  const ds = taiLieuCua(c);
  const the = theChungTu(c);
  if (ds.length) {
    return '<button class="ct-nut co" data-chungtu="' + c.id + '">Chứng từ <b>'
      + ds.length + '</b></button>' + the;
  }
  /* Chưa có gì: chủ quỹ vẫn bấm được để đính vào, người khác thì nút tắt hẳn.
   * Một nút sáng mà bấm vào không làm gì là lời hứa suông. */
  return (laChuQuy()
    ? '<button class="ct-nut them" data-chungtu="' + c.id + '">+ Chứng từ</button>'
    : '<span class="ct-nut trong">chưa có</span>') + the;
}

function veTacVu(c) {
  if (laChuQuy()) return '<button class="btn sm" data-sua="' + c.id + '">Sửa</button>';
  if (!laKeToan()) return '';
  /* Khoản đã đóng sổ chỉ còn một việc: đổi mã nếu gõ nhầm. Bày lại nút "Từ
   * chối" ở đó là mời gọi lùi một bước đã xong. */
  /* Khoản đã đóng sổ: một nút "Sửa" y như bên vai người giữ quỹ. Nó mở cùng
   * một cửa sổ, nơi vừa đổi được mã vừa BỎ quyết toán để đưa khoản về lại
   * trạng thái trước. */
  if (c.tinhTrang === 'Đã quyết toán') {
    return '<button class="btn sm" data-duyet="' + c.id + '">Sửa</button>';
  }
  /* "Yêu cầu điều chỉnh" chứ không phải "Từ chối": kế toán không bác khoản chi,
   * họ nhờ bổ sung rồi sẽ nhận. Chữ "từ chối" làm người nhận tưởng khoản tiền
   * bị bác bỏ. */
  return '<button class="btn sm duyet" data-duyet="' + c.id + '">Quyết toán</button>'
    + '<button class="btn sm nguyhiem" data-tuchoi="' + c.id + '">Yêu cầu điều chỉnh</button>';
}

/**
 * Thanh chọn: MỖI NÚT NÓI ĐÚNG SỐ KHOẢN NÓ ĐỤNG TỚI, không nói số khoản đang
 * được tích.
 *
 * Chọn 20 khoản trong đó 15 đã đóng sổ thì nút "Quyết toán 20 khoản" là một lời
 * nói dối: gán mã cho 15 khoản kia là xoá 15 mã cũ. Nên tách hẳn hai việc, và
 * mỗi nút chỉ đếm phần nó thật sự làm.
 */
function veThanhChon() {
  const ds = S.chi.filter((c) => S.chon.has(c.id));
  const tong = ds.reduce((a, c) => a + c.tien, 0);
  const daDongSo = ds.filter((c) => String(c.maQuyetToan || '').trim()
    || c.tinhTrang === 'Đã quyết toán');
  const chuaDongSo = ds.filter((c) => !daDongSo.includes(c));
  return '<div class="thanhchon">'
    + '<b>' + ds.length + ' khoản</b> · ' + tien(tong) + ' đ'
    + '<div class="sp"></div>'
    + '<button class="btn" data-bochon="1">Bỏ chọn</button>'
    + (daDongSo.length
      ? '<button class="btn nguyhiem" data-boqt="1">Bỏ quyết toán '
        + daDongSo.length + ' khoản</button>' : '')
    + (chuaDongSo.length
      ? '<button class="btn primary" data-quyettoan="1">Quyết toán '
        + chuaDongSo.length + ' khoản</button>' : '')
  + '</div>';
}

/**
 * CÁC LẦN ỨNG TIỀN — không phải "các cục tiền".
 *
 * Mã phiếu chi PC… chỉ là chứng từ của từng lần công ty đưa tiền; tiêu thì tiêu
 * từ một quỹ chung. Nên bảng này là một cuốn nhật ký nhận tiền, không có cột
 * "còn lại của đợt" — số dư chỉ có một, nằm ở đầu trang.
 *
 * Dòng "Chuyển từ kỳ trước" cố ý hiện mờ và KHÔNG cộng vào tổng: nó là tồn của
 * kỳ trước, đếm vào là tính trùng 11.194.600 đ.
 */
function veUng() {
  if (!S.nap.length) return '<section class="bang"><div class="trong">Chưa có lần ứng nào.</div></section>';
  const ds = [...S.nap].sort((a, b) => String(b.ngay || '').localeCompare(String(a.ngay || '')));

  const dong = (n) => {
    const chuyen = n.loai === LAN_CHUYEN_TIEP;
    return '<tr' + (chuyen ? ' class="mo"' : '') + '>'
      + '<td class="nd"><b>' + esc(n.noiDung || n.loai || '(không tên)') + '</b>'
        + (n.ghiChu ? '<div class="phu2">' + esc(n.ghiChu) + '</div>' : '') + '</td>'
      + '<td class="num' + (chuyen ? '' : ' duong') + '">' + (chuyen ? '' : '+ ') + tien(n.tien) + '</td>'
      + '<td class="ngay">' + esc(ngayVN(n.ngay)) + '</td>'
      + '<td><span class="badge ' + (chuyen ? 'xam' : 'xanh') + '">' + esc(n.loai || '—') + '</span></td>'
      + '<td class="phu2">' + (chuyen ? 'không tính vào tiền công ty đưa' : '') + '</td>'
    + '</tr>';
  };

  return '<section class="bang"><div class="cuon"><table><thead><tr>'
    + '<th>Nội dung</th><th class="num">Số tiền</th><th>Ngày</th><th>Loại</th><th></th>'
    + '</tr></thead><tbody>' + ds.map(dong).join('') + '</tbody>'
    + '<tfoot><tr><td>Công ty đã ứng ' + S.quy.soLanUng + ' lần</td>'
      + '<td class="num">' + tien(S.quy.tongUng) + '</td><td colspan="3"></td></tr></tfoot>'
    + '</table></div>'
    + (laChuQuy() ? '<div class="duoi"><button class="btn" id="btnNap2">+ Ghi một lần ứng tiền</button></div>' : '')
  + '</section>';
}

/* ---------------- cửa sổ ---------------- */
function moModal(tieuDe, than, chan, lop) {
  $('#mdTitle').textContent = tieuDe;
  $('#mdBody').innerHTML = than;
  $('#mdFoot').innerHTML = chan;
  /* Cửa sổ chứng từ cần rộng gấp rưỡi cửa sổ form: nó bày ảnh, mà ảnh hoá đơn
   * hẹp quá thì lại phải mở từng cái ra xem — đúng việc nó sinh ra để bỏ. */
  $('.hop').className = 'hop' + (lop ? ' ' + lop : '');
  $('#modal').classList.add('on');
}
function dongModal() {
  $('#modal').classList.remove('on');
  thuHoiAnhChungTu();
}

/* ============ xem chứng từ ============
 * Hoá đơn và UNC là thứ người ta phải NHÌN mới đối chiếu được. Trước đây mỗi
 * chứng từ chỉ là một liên kết bắn sang tab mới; anh Hùng báo 12/09/2026 bấm vào
 * "xem không được". Giờ mở ngay tại chỗ, nút Tải xuống đứng riêng.
 * HEIC không trình duyệt nào mở được (ảnh iPhone hay dính đuôi này) nên không
 * nhận là xem được — đưa người ta một khung trắng còn tệ hơn là bảo tải về.
 */
const laAnh = (n) => /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(n || '');
const laPdf = (n) => /\.pdf$/i.test(n || '');
const laChu = (n) => /\.(txt|csv|md|log)$/i.test(n || '');
const xemDuocTep = (n) => laAnh(n) || laPdf(n) || laChu(n);

const urlTep = (recId, token, tai) =>
  apiUrl('/api/chi/' + recId + '/tep/' + token + '/tai' + (tai ? '?tai=1' : ''));

/* Chứng từ được LẤY VỀ bằng fetch rồi mới dựng, chứ không gán thẳng URL vào
 * <img>. Khi máy chủ trả lỗi (hay gặp nhất: app Lark chưa được cấp quyền tệp nên
 * bản online không tải được đính kèm), <img src> chỉ hiện một ô vỡ và <a
 * download> thì trình duyệt báo "Site wasn't available" — không ai biết vì sao.
 * Anh Hùng gặp đúng cảnh đó 12/09/2026. Lấy bằng fetch thì đọc được câu lỗi máy
 * chủ viết ra và in thẳng lên màn hình. */
let xtUrl = null;                  // object URL đang mở, phải thu hồi khi đóng

async function layTep(recId, token) {
  const r = await fetch(urlTep(recId, token));
  if (!r.ok) {
    let lyDo = 'Máy chủ trả lỗi ' + r.status;
    try { const d = await r.json(); if (d && d.error) lyDo = d.error; } catch (_) {}
    throw new Error(lyDo);
  }
  return r.blob();
}

async function moXemTep(recId, token, ten) {
  $('#xtTen').textContent = ten || 'chứng từ';
  const tai = $('#xtTai');
  tai.removeAttribute('href');
  tai.setAttribute('data-tai', '1');
  tai.dataset.rec = recId;
  tai.dataset.token = token;
  tai.dataset.ten = ten || '';
  $('#xtThan').innerHTML = '<div class="xt-khong"><div class="ic">ĐANG MỞ</div></div>';
  $('#xemTep').classList.add('on');

  if (!xemDuocTep(ten)) {
    $('#xtThan').innerHTML = '<div class="xt-khong"><div class="ic">TỆP</div>' +
      '<div>Kiểu tệp này không xem trực tiếp được.</div>' +
      '<a class="btn primary" data-tai="1" data-rec="' + esc(recId) + '" data-token="' +
      esc(token) + '" data-ten="' + esc(ten || '') + '">Tải về để mở</a></div>';
    return;
  }

  try {
    const blob = await layTep(recId, token);
    if (xtUrl) URL.revokeObjectURL(xtUrl);
    xtUrl = URL.createObjectURL(blob);
    $('#xtThan').innerHTML = laAnh(ten)
      ? '<img src="' + xtUrl + '" alt="">'
      : '<iframe src="' + xtUrl + '"></iframe>';
  } catch (e) {
    $('#xtThan').innerHTML = '<div class="xt-khong"><div class="ic">KHÔNG MỞ ĐƯỢC</div>' +
      '<div>' + esc(e.message) + '</div></div>';
  }
}

/* Tải cũng đi bằng fetch, vì lý do y hệt: hỏng thì nói được hỏng cái gì.
 * Chứng từ ở đây là hoá đơn và ảnh chuyển khoản, không có tệp nặng. */
async function taiTepVe(recId, token, ten) {
  try {
    const blob = await layTep(recId, token);
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = ten || 'chung-tu';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  } catch (e) {
    toast('Không tải được "' + (ten || 'tệp') + '": ' + e.message, 'err');
  }
}

function dongXemTep() {
  $('#xemTep').classList.remove('on');
  $('#xtThan').innerHTML = '';
  if (xtUrl) { URL.revokeObjectURL(xtUrl); xtUrl = null; }
}

const o = (nhan, html, rong) => '<label class="o' + (rong ? ' rong' : '') + '">'
  + '<span>' + esc(nhan) + '</span>' + html + '</label>';
const chon = (id, ds, gt) => '<select id="' + id + '">'
  + ds.map((x) => '<option' + (x === gt ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';

function moKhaiChi(sua) {
  const c = sua ? S.chi.find((x) => x.id === sua) : null;

  moModal(c ? 'Sửa khoản chi' : 'Khai khoản chi',
    '<div class="form">'
    + o('Nội dung chi', '<input id="fNoiDung" value="' + esc(c ? c.noiDung : '') + '" placeholder="VD: Xanh SM đi Vinwonders tác nghiệp">', true)
    + o('Số tiền (đ)', '<input id="fTien" type="number" min="0" step="1000" value="' + (c ? c.tien : '') + '">')
    + o('Loại chi', chon('fLoai', S.options.loaiChi, c ? c.loai : 'Khác'))
    + o('Ngày chi', '<input id="fNgay" type="date" value="'
        + (c && c.ngayChi ? new Date(c.ngayChi).toISOString().slice(0, 10) : homNay()) + '">')
    + o('Tình trạng', chon('fTT', S.options.tinhTrang, c ? c.tinhTrang : 'Đã chi'))
    + o('Mã điều hành', '<input id="fMaDH" value="' + esc(c ? c.maDieuHanh : '') + '" placeholder="SG…">')
    + o('Chứng từ', '<select id="fChungTu"><option value="">— chưa xác định —</option>'
        + (S.options.chungTu || []).map((x) => '<option' + (c && c.chungTu === x ? ' selected' : '')
          + '>' + esc(x) + '</option>').join('') + '</select>')
    + o('Số hoá đơn', '<input id="fSoHD" value="' + esc(c ? c.soHoaDon : '') + '">')
    + o('Mã số thuế NCC', '<input id="fMST" value="' + esc(c ? c.mst : '') + '" placeholder="kế toán kiểm MST">')
    + o('Nhà cung cấp trên TW', '<input id="fNCC" value="' + esc(c ? c.ncc : '') + '">')
    + o('Thông tin chuyển khoản', '<input id="fCK" value="' + esc(c ? c.chuyenKhoan : '') + '">')
    + o('Ghi chú', '<input id="fGhiChu" value="' + esc(c ? c.ghiChu : '') + '">', true)
    + (c ? '' : '<div class="nhac">Khai xong rồi đính hoá đơn và UNC ngay ở dòng của khoản — '
        + 'sổ cũ thiếu UNC ở 67/162 dòng vì để đó rồi quên.</div>')
    + '</div>',
    (c ? '<button class="btn nguyhiem" data-xoa="' + c.id + '">Xoá khoản này</button>' : '')
    + '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn primary" id="btnLuuChi" data-chinh="1" data-id="' + (c ? c.id : '') + '">'
    + (c ? 'Lưu' : 'Ghi vào sổ') + '</button>');
  setTimeout(() => $('#fNoiDung') && $('#fNoiDung').focus(), 30);
}

function moNapQuy() {
  moModal('Ghi một lần ứng tiền',
    '<div class="form">'
    + o('Số tiền (đ)', '<input id="nTien" type="number" min="0" step="100000" placeholder="10000000">')
    + o('Ngày nhận', '<input id="nNgay" type="date" value="' + homNay() + '">')
    + o('Nội dung', '<input id="nNoiDung" placeholder="Tạm ứng đợt tháng 10 · phiếu chi PC…">', true)
    + '<div class="nhac">Quỹ là <b>một cục</b>: số dư đầu trang cộng mọi lần ứng rồi trừ mọi khoản chi. '
      + 'Mã phiếu chi ghi vào ô Nội dung để đối chiếu với kế toán, không phải để chia tiền thành nhiều túi.</div>'
    + '</div>',
    '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn primary" id="btnLuuNap" data-chinh="1">Ghi vào quỹ</button>');
  setTimeout(() => $('#nTien') && $('#nTien').focus(), 30);
}

function moQuyetToan() {
  /* Chỉ đóng sổ khoản CHƯA có mã. Khoản đã có mã muốn gán lại thì bỏ quyết toán
   * trước — một đường rõ ràng, thay vì một cú bấm vừa gán vừa xoá. */
  const chon = S.chi.filter((c) => S.chon.has(c.id));
  const boQua = chon.filter((c) => String(c.maQuyetToan || '').trim());
  const ds = chon.filter((c) => !boQua.includes(c));
  const tong = ds.reduce((a, c) => a + c.tien, 0);
  const thieu = ds.filter(thieuChungTu);
  const deGhiDe = [];
  const chuaChi = ds.filter((c) => c.tinhTrang === 'Chờ chi');
  if (!ds.length) return toast('Cả ' + chon.length + ' khoản đã có mã quyết toán rồi.', 'err');
  moModal('Quyết toán ' + ds.length + ' khoản',
    '<div class="form">'
    + '<div class="tomtat"><b>' + ds.length + ' khoản</b> · tổng <b>' + tien(tong) + ' đ</b></div>'
    + (deGhiDe.length
      ? '<div class="nhac canhbao"><b>' + deGhiDe.length + ' khoản đã có mã quyết toán.</b> '
        + 'Gán mã mới là <b>xoá hẳn</b> mã cũ, không lấy lại được: '
        + esc([...new Set(deGhiDe.map((c) => c.maQuyetToan))].slice(0, 4).join(', '))
        + (deGhiDe.length > 4 ? '…' : '')
        + '<br>Bỏ tick mấy khoản đó nếu chỉ định đóng sổ phần còn lại.</div>'
      : '')
    + (boQua.length
      ? '<div class="nhac"><b>' + boQua.length + ' khoản đã có mã quyết toán nên không đụng tới.</b> '
        + 'Muốn gán mã khác thì bấm <b>Bỏ quyết toán</b> trước.</div>' : '')
    + (chuaChi.length
      ? '<div class="nhac canhbao"><b>' + chuaChi.length + ' khoản còn ở "Chờ chi".</b> '
        + 'Tiền chưa rời quỹ mà đóng sổ thì kế toán nhận một chứng từ chưa có thật.</div>'
      : '')
    + (thieu.length
      ? '<div class="nhac canhbao"><b>' + thieu.length + ' khoản chưa đủ chứng từ.</b> '
        + 'Quyết toán vẫn chạy, nhưng kế toán sẽ hỏi lại đúng mấy khoản này: '
        + esc(thieu.slice(0, 3).map((c) => c.noiDung).join(' · '))
        + (thieu.length > 3 ? '…' : '') + '</div>'
      : '<div class="nhac ok">Cả ' + ds.length + ' khoản đều có chứng từ.</div>')
    + o('Mã quyết toán', '<input id="qMa" placeholder="QTTU31/LVH">', true)
    + '<div class="nhac">Mã này ghi vào cả ' + ds.length + ' khoản và chuyển tình trạng sang '
      + '<b>Đã quyết toán</b>. Sửa lại được bằng cách quyết toán lần nữa với mã khác.</div>'
    + '</div>',
    '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn ' + (deGhiDe.length ? 'nguyhiem' : 'primary') + '" id="btnLuuQT" data-chinh="1"'
    + ' data-ids="' + ds.map((c) => c.id).join(',') + '"'
    + (deGhiDe.length ? ' data-ghide="' + deGhiDe.length + '"' : '') + '>'
    + (deGhiDe.length ? 'Ghi đè ' + deGhiDe.length + ' mã cũ · gán cho ' + ds.length + ' khoản'
      : 'Gán mã cho ' + ds.length + ' khoản') + '</button>');
  setTimeout(() => $('#qMa') && $('#qMa').focus(), 30);
}

/* ---------------------------------------------------------------------------
 * KẾ TOÁN DUYỆT / TRẢ LẠI MỘT KHOẢN
 * -------------------------------------------------------------------------
 * Hai cửa sổ nhỏ, cùng một khuôn: kê lại khoản đang đụng tới rồi hỏi đúng MỘT
 * thứ. Kê lại là cần — chị kế toán bấm hàng chục dòng liên tiếp, bấm nhầm dòng
 * là gán mã cho khoản của tháng khác.
 * ------------------------------------------------------------------------- */
function tomTatKhoan(c) {
  const dv = tachDon(c);
  return '<div class="tomtat"><b>' + esc(c.noiDung || '(không tên)') + '</b>'
    + '<div class="nho">' + tien(c.tien) + ' đ · ' + esc(ngayVN(c.ngayChi || c.ngayDeNghi))
    + (dv ? ' · ' + esc(dv.ma) : '')
    + (c.mst ? ' · MST ' + esc(c.mst) : '') + '</div></div>';
}

/* ---------------------------------------------------------------------------
 * CỬA SỔ CHỨNG TỪ
 * -------------------------------------------------------------------------
 * Bày ẢNH chứ không bày tên tệp. Kế toán nhìn hoá đơn để đọc mã số thuế và số
 * tiền — một danh sách "hd1.jpg · hd2.jpg" bắt họ mở từng cái ra mới biết cái
 * nào là cái cần, tức là vẫn đúng số lần bấm như cũ.
 *
 * Ảnh nạp SAU khi cửa sổ đã hiện: dựng khung trước, rồi từng ô tự thay ảnh vào
 * khi tải xong. Chờ đủ sáu ảnh rồi mới vẽ là sáu giây nhìn màn hình trắng.
 */
let anhChungTu = [];              // object URL đang mở, phải thu hồi khi đóng

function thuHoiAnhChungTu() {
  anhChungTu.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
  anhChungTu = [];
}

function moChungTu(id) {
  const c = S.chi.find((x) => x.id === id);
  if (!c) return;
  const ds = taiLieuCua(c);
  thuHoiAnhChungTu();

  const o = (t, i) => {
    /* Chỉ dựng thẻ bấm khi thật sự là một địa chỉ http.
     *
     * Chuỗi nào KHÔNG mở đầu bằng http thì trình duyệt coi là đường dẫn tương
     * đối và ghép vào sau địa chỉ app — ra một trang 404 mang nguyên cái chuỗi
     * đó trên thanh địa chỉ, trông như app hỏng. Ô này vốn lưu markdown
     * `[url](url)`; máy chủ đã gỡ (boMdLink), nhưng chốt thêm ở đây để một
     * dạng lạ khác cũng không lọt thành liên kết chết. */
    const laDiaChi = /^https?:\/\//i.test(String(t.linkCu || '').trim());
    const xem = laDiaChi
      ? '<a class="ct-xem" target="_blank" rel="noopener" href="' + esc(t.linkCu) + '">Mở trên Drive ↗</a>'
      : t.linkCu
        /* Không mở được thì nói thẳng và bày chuỗi ra, để kế toán còn copy đi
         * tìm — im lặng bỏ nút đi là giấu mất manh mối duy nhất. */
        ? '<div class="ct-hong">Không mở được liên kết cũ<code>' + esc(t.linkCu) + '</code></div>'
      : '<span class="ct-xem" data-xem="' + esc(t.token) + '" data-rec="' + esc(t.recId)
        + '" data-ten="' + esc(t.ten) + '">Xem</span>'
        + '<span class="ct-tai" data-tai="1" data-rec="' + esc(t.recId) + '" data-token="'
        + esc(t.token) + '" data-ten="' + esc(t.ten) + '" title="Tải về máy">⇩</span>';
    return '<figure class="ct-the" data-ct="' + i + '">'
      + '<div class="ct-anh" id="ctAnh' + i + '"'
        + (t.linkCu ? '' : ' data-xem="' + esc(t.token) + '" data-rec="' + esc(t.recId)
          + '" data-ten="' + esc(t.ten) + '"')
        + '><span class="ct-cho">' + (t.linkCu ? 'DRIVE' : 'đang mở…') + '</span></div>'
      + '<figcaption><span class="ct-nhan">' + esc(t.nhan) + '</span>'
      + '<span class="ct-ten" title="' + esc(t.ten) + '">' + esc(t.ten) + '</span>'
      + '<span class="ct-viec">' + xem + '</span></figcaption></figure>';
  };

  const nhom = (nhan) => {
    const phan = ds.map((t, i) => ({ t, i })).filter((x) => x.t.nhan === nhan);
    const themDuoc = laChuQuy() && (nhan === 'Hoá đơn' || nhan === 'UNC');
    if (!phan.length && !themDuoc) return '';
    return '<div class="ct-nhom"><div class="ct-dau">' + esc(nhan)
      + (phan.length ? ' <b>' + phan.length + '</b>' : ' <span class="nho">chưa có</span>')
      + (themDuoc ? '<button class="btn sm" data-themtep="' + (nhan === 'UNC' ? 'unc' : 'hoaDon')
        + '" data-rec="' + esc(c.id) + '">+ Thêm</button>' : '')
      + '</div>'
      + (phan.length ? '<div class="ct-luoi">' + phan.map((x) => o(x.t, x.i)).join('') + '</div>' : '')
      + '</div>';
  };

  moModal('Chứng từ',
    tomTatKhoan(c)
    + (ds.length ? '' : '<div class="nhac">Khoản này chưa có chứng từ nào.</div>')
    + nhom('Hoá đơn')
    + (laKeToan() ? '' : nhom('UNC')),
    '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>',
    'rong');

  napAnhChungTu(ds);
}

/* Nạp từng ảnh một, không bắn song song sáu lời gọi: máy chủ phải tải tệp về từ
 * Lark rồi mới trả, bắn cùng lúc là xếp hàng ở đó chứ không nhanh hơn. */
async function napAnhChungTu(ds) {
  for (let i = 0; i < ds.length; i++) {
    const t = ds[i];
    const o = $('#ctAnh' + i);
    if (!o || t.linkCu) continue;
    if (!laAnh(t.ten)) {
      o.innerHTML = '<span class="ct-cho">' + (laPdf(t.ten) ? 'PDF' : 'TỆP') + '</span>';
      continue;
    }
    try {
      const blob = await layTep(t.recId, t.token);
      if (!$('#ctAnh' + i)) return;            // cửa sổ đã đóng giữa chừng
      const u = URL.createObjectURL(blob);
      anhChungTu.push(u);
      o.innerHTML = '<img src="' + u + '" alt="' + esc(t.ten) + '">';
    } catch (e) {
      o.innerHTML = '<span class="ct-cho loi">' + esc(e.message) + '</span>';
    }
  }
}

function moDuyetMot(id) {
  const c = S.chi.find((x) => x.id === id);
  if (!c) return;
  const cu = String(c.maQuyetToan || '').trim();
  const thieu = thieuChungTu(c);
  moModal(cu ? 'Sửa quyết toán' : 'Quyết toán khoản này',
    '<div class="form">'
    + tomTatKhoan(c)
    + (cu ? '<div class="nhac canhbao">Khoản này đang mang mã <b>' + esc(cu)
        + '</b>. Gán mã mới là xoá hẳn mã cũ.</div>' : '')
    /* Cùng cảnh báo với cửa sổ quyết toán theo lô. Thiếu ở đây thì đóng sổ
     * từng dòng lại là con đường lách được lời nhắc — mà đóng sổ từng dòng
     * chính là cách kế toán làm nhiều nhất. */
    + (c.tinhTrang === 'Chờ chi'
      ? '<div class="nhac canhbao">Khoản này còn ở <b>"Chờ chi"</b> — tiền chưa rời quỹ. '
        + 'Đóng sổ bây giờ là kế toán nhận một chứng từ chưa có thật.</div>' : '')
    + (thieu ? '<div class="nhac canhbao">Khoản này chưa có hoá đơn lẫn UNC.</div>' : '')
    + o('Mã quyết toán', '<input id="dMa" value="' + esc(cu || S.maCuoi || '')
        + '" placeholder="QTTU31/LVH">', true)
    + '<div class="nhac">Mã ghi thẳng vào cột <b>Mã quyết toán</b> của sổ và chuyển '
      + 'tình trạng sang <b>Đã quyết toán</b>.</div>'
    + '</div>',
    /* Đóng sổ không còn là đường một chiều. Bấm nhầm mã, bấm nhầm dòng, hay
     * soi kỹ lại rồi đổi ý — trước đây đều phải mở Base sửa tay, đúng cái việc
     * app này sinh ra để bỏ. Nút gỡ đứng bên TRÁI, tách khỏi nút xác nhận. */
    (cu ? '<button class="btn nguyhiem" id="btnBoQuyetToan" data-id="' + id + '">'
      + 'Bỏ quyết toán</button>' : '')
    + '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn ' + (cu ? 'nguyhiem' : 'primary') + '" id="btnDuyetMot" data-chinh="1" '
    + 'data-id="' + id + '"' + (cu ? ' data-ghide="1"' : '') + '>'
    + (cu ? 'Ghi đè mã cũ' : 'Quyết toán') + '</button>');
  setTimeout(() => $('#dMa') && $('#dMa').focus(), 30);
}

/* Nội dung cần điều chỉnh là thứ DUY NHẤT đi ngược từ kế toán về người giữ quỹ.
 * Bỏ trống thì người nhận thấy một dòng đỏ không biết sửa gì, và câu hỏi "sao
 * trả?" quay lại thành một tin nhắn — đúng cái vòng app này định cắt. */
const LY_DO_SAN = [
  'Thiếu hoá đơn',
  'Thiếu UNC / chứng từ chuyển tiền',
  'Hoá đơn sai mã số thuế',
  'Hoá đơn mờ, không đọc được',
  'Sai số tiền so với chứng từ',
];

function moTuChoi(id) {
  const c = S.chi.find((x) => x.id === id);
  if (!c) return;
  moModal('Yêu cầu điều chỉnh',
    '<div class="form">'
    + tomTatKhoan(c)
    + o('Cần điều chỉnh gì', '<textarea id="tLyDo" rows="3" '
        + 'placeholder="Người giữ quỹ sẽ đọc đúng câu này để biết phải sửa gì"></textarea>', true)
    + '<div class="lydo-san">' + LY_DO_SAN.map((x) =>
        '<button class="the bam" data-lydo="' + esc(x) + '">' + esc(x) + '</button>').join('')
      + '</div>'
    + '<div class="nhac">Khoản chuyển sang <b>Chờ điều chỉnh</b> và hiện đỏ trong sổ '
      + 'của người giữ quỹ, kèm nguyên câu này.</div>'
    + '</div>',
    '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn nguyhiem" id="btnTuChoi" data-chinh="1" data-id="' + id + '">Gửi yêu cầu</button>');
  setTimeout(() => $('#tLyDo') && $('#tLyDo').focus(), 30);
}

/**
 * KẾT QUẢ TẠO ĐƠN TOURWELL
 *
 * Cửa sổ này tồn tại vì Open API chỉ làm được nửa quy trình: đơn đã có, dòng
 * chi phí Quỹ Marketing đã có, nhưng đơn đang ở "Đang xử lý" — chưa chuyển
 * thành công, chưa gửi điều hành. Đóng lại mà không kê ra thì người khai tưởng
 * xong, và tháng sau kế toán mới phát hiện đơn treo.
 *
 * Năm việc dưới đây là phần Tourwell KHÔNG mở API; phần gõ số — chỗ dễ sai
 * nhất — máy đã làm.
 */
function moKetQuaTourwell(tw, khoan) {
  if (!tw || (tw.bo && tw.bo !== 'da-co')) return;

  if (tw.loi && !tw.ma) {
    moModal('Chưa tạo được đơn Tourwell',
      '<div class="tw-hop">'
      + '<p><b>Khoản chi đã ghi vào sổ quỹ</b> — phần đó không sao.</p>'
      + '<div class="nhac canhbao">' + esc(tw.loi) + '</div>'
      + '<p class="nho">Khoản chi đã nằm trong sổ rồi nên <b>đừng khai lại</b> — '
      + 'khai lại là đẻ thêm một dòng, quỹ bị trừ hai lần cho một lần tiêu. '
      + 'Sửa xong thì bấm <b>+ đơn Tourwell</b> ngay trên dòng của khoản để tạo bù.</p></div>',
      '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>');
    return;
  }

  const viec = [
    'Bấm <b>Chuyển thành công</b> ở góc trên phải',
    'Bấm <b>Xác nhận chuyển thành công</b>',
    'Tải <b>hoá đơn + UNC</b> vào ô Tệp đính kèm',
    'Vào <b>Mã điều hành</b> → <b>Nhận điều hành</b> → <b>Đồng ý</b>',
    'Bấm <b>Hoàn thành</b>',
  ];

  moModal('Đã tạo đơn Tourwell',
    '<div class="tw-hop">'
    + '<div class="tw-ma">' + esc(tw.ma) + '</div>'
    + '<div class="nho">' + tien(tw.tien) + ' đ · Quỹ Marketing · VAT 8% đã gồm'
      + (khoan && khoan.noiDung ? ' · ' + esc(khoan.noiDung) : '') + '</div>'
    + (tw.dayDu === false
      ? '<div class="nhac canhbao">Đơn đã tạo nhưng dòng chi phí chưa vào: ' + esc(tw.loi || '')
        + '<br>Vào đơn thêm tay ở mục <b>Sửa giá net</b>.</div>'
      : '<div class="nhac ok">✔ Dòng chi phí Quỹ Marketing đã vào — điều hành thấy sẵn, '
        + 'và khoản này sẽ hiện trong lịch sử chi của nhà cung cấp Quỹ Marketing.</div>')
    + '<div class="tw-con">Còn ' + viec.length + ' việc phải bấm tay trên Tourwell '
      + '<span class="nho">(API không làm được mấy bước này)</span></div>'
    + '<ol class="tw-ds">' + viec.map((v) => '<li>' + v + '</li>').join('') + '</ol>'
    + (tw.loiGhiBase
      ? '<div class="nhac canhbao">Chưa ghi được mã đơn vào sổ: ' + esc(tw.loiGhiBase)
        + '<br>Lưu mã <b>' + esc(tw.ma) + '</b> lại, kẻo lần sửa sau tạo thêm đơn nữa.</div>'
      : '')
    + '</div>',
    '<a class="btn primary" target="_blank" href="' + esc(tw.link) + '">Mở đơn trên Tourwell</a>'
    + '<div class="sp"></div><button class="btn" data-close="1">Để sau</button>');
}

/* ---------------- tải tệp ---------------- */
function taiTep(id, key, xong) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*,application/pdf';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    toast('Đang tải ' + f.name + '…');
    try {
      await api('/api/chi/' + id + '/tep/' + key + '?name=' + encodeURIComponent(f.name),
        { method: 'POST', headers: {}, body: f });
      toast('Đã đính ' + (key === 'unc' ? 'UNC' : 'hoá đơn'), 'ok');
      await taiLai(true);
      if (xong) xong();
    } catch (e) { toast(e.message, 'err'); }
  };
  inp.click();
}

/* ---------------- sự kiện ---------------- */
function ganSuKien() {
  const g = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
  g('#lTim', 'input', (e) => { S.loc.tim = e.target.value; veLai(); });
  /* Đổi bộ lọc thì bỏ chọn những dòng vừa khuất khỏi màn hình. Giữ lại là mở
   * đường cho tai nạn: chọn 163 khoản, lọc còn 3 dòng, rồi bấm quyết toán mà
   * tưởng mình chỉ đụng vào 3 dòng đang nhìn thấy. */
  const doiLoc = (fn) => (e) => {
    fn(e.target.value);
    const con = new Set(locChi().map((c) => c.id));
    [...S.chon].forEach((id) => { if (!con.has(id)) S.chon.delete(id); });
    ve();
  };
  g('#lThang', 'change', doiLoc((v) => { S.loc.thang = v; }));
  g('#lLoai', 'change', doiLoc((v) => { S.loc.loai = v; }));
  g('#lTT', 'change', doiLoc((v) => { S.loc.tinhTrang = v; }));
}

/**
 * Ô tích "chọn hết" và nút ghi ở cuối bảng đi theo UỶ QUYỀN, không gắn trực
 * tiếp.
 *
 * Vì sao: gõ vào ô tìm kiếm chỉ vẽ lại phần `.bang` (để con trỏ khỏi nhảy khỏi
 * ô tìm), mà vẽ lại là đẻ ra một `#chonHet` MỚI — cái cũ mang listener đã bị
 * vứt đi cùng bảng. Hậu quả: tìm xong thì ô tích đầu bảng bấm không ăn gì, im
 * lặng, không lỗi. Uỷ quyền ở document thì bảng vẽ lại bao nhiêu lần cũng vậy.
 */
function chonHetTrongBang(bat) {
  const ds = locChi();
  if (!bat) { ds.forEach((c) => S.chon.delete(c.id)); return ve(); }
  const duoc = ds.filter(quyetToanDuoc);
  if (duoc.length) {
    duoc.forEach((c) => S.chon.add(c.id));
    const bo = ds.length - duoc.length;
    if (bo) toast('Chọn ' + duoc.length + ' khoản còn phải đóng sổ · bỏ qua ' + bo
      + ' khoản đã có mã quyết toán');
    return ve();
  }
  /* Không còn gì để đóng sổ, mà cả trang đang là khoản ĐÃ đóng sổ — người dùng
   * vừa lọc đúng vào chúng, gần như chắc chắn là để gỡ cả lô. Chọn giúp, và
   * nói rõ vừa chọn cái gì. Chỉ làm khi không lẫn: nếu còn khoản đóng sổ được
   * thì nhánh trên đã chạy rồi. */
  const daXong = ds.filter((c) => String(c.maQuyetToan || '').trim()
    || c.tinhTrang === 'Đã quyết toán');
  if (daXong.length && daXong.length === ds.length) {
    daXong.forEach((c) => S.chon.add(c.id));
    toast('Chọn ' + daXong.length + ' khoản đã quyết toán');
  } else {
    toast('Không còn khoản nào chờ quyết toán.');
  }
  ve();
}

/* Gõ tìm kiếm thì chỉ vẽ lại phần bảng, giữ nguyên con trỏ trong ô tìm. */
let henVe = null;
function veLai() {
  clearTimeout(henVe);
  henVe = setTimeout(() => {
    const b = $('.bang');
    if (b) b.outerHTML = S.tab === 'ung' ? veUng() : veBang();
  }, 160);
}

document.addEventListener('click', async (e) => {
  const T = e.target;

  /* Xem chứng từ đứng TRƯỚC data-close: chip tệp nằm trong bảng lẫn trong form
   * khai chi, bắt sau là mở chứng từ xong đóng luôn form đang gõ dở. */
  if (T.closest('[data-xtclose]') || T.id === 'xemTep') return dongXemTep();
  const xt = T.closest('[data-xem]');
  if (xt) return moXemTep(xt.dataset.rec, xt.dataset.xem, xt.dataset.ten);
  const xtTai = T.closest('[data-tai]');
  if (xtTai) { e.preventDefault(); return taiTepVe(xtTai.dataset.rec, xtTai.dataset.token, xtTai.dataset.ten); }

  if (T.closest('[data-close]') || T.id === 'modal') return dongModal();
  if (T.closest('#btnRefresh')) { toast('Đang đọc lại…'); return taiLai(true).then(() => toast('Xong', 'ok')); }
  if (T.closest('#btnChiMoi')) {
    return laChuQuy() ? moKhaiChi() : toast('Chỉ người giữ quỹ mới khai khoản chi.', 'err');
  }
  if (T.closest('#btnNap') || T.closest('#btnNap2')) {
    return laChuQuy() ? moNapQuy() : toast('Chỉ người giữ quỹ mới ghi tiền ứng.', 'err');
  }

  const tab = T.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; S.chon.clear(); return ve(); }

  const loctt = T.closest('[data-loctt]');
  if (loctt) {
    S.tab = 'so'; S.loc.tinhTrang = loctt.dataset.loctt; S.chon.clear();
    return ve();
  }

  const sua = T.closest('[data-sua]');
  if (sua) return laChuQuy() ? moKhaiChi(sua.dataset.sua) : toast('Chỉ người giữ quỹ mới sửa được khoản chi.', 'err');

  /* Gán mã điều hành SG… — Tourwell không đưa mã này qua API nên phải dán tay.
   * Đặt ngay trên dòng thay vì bắt mở cửa sổ sửa: việc này làm sau khi nhận
   * điều hành xong, lúc đang nhìn danh sách. */
  const gansg = T.closest('[data-gansg]');
  if (gansg) {
    const id = gansg.dataset.gansg;
    const c = S.chi.find((x) => x.id === id);
    const ma = prompt('Mã điều hành của khoản "' + ((c && c.noiDung) || '') + '"'
      + '\n\nChép từ mục Điều hành & Đặt dịch vụ trên Tourwell (dạng SG…)',
      (c && c.maDieuHanh) || '');
    if (ma === null) return;
    try {
      await api('/api/chi/' + id, { method: 'PATCH', body: JSON.stringify({ maDieuHanh: ma.trim() }) });
      toast(ma.trim() ? 'Đã gán ' + ma.trim() : 'Đã xoá mã điều hành', 'ok');
      await taiLai(true);
    } catch (e) { toast(e.message, 'err'); }
    return;
  }

  /* Tạo bù đơn Tourwell cho một khoản ĐÃ nằm trong sổ. Không đụng tới số tiền,
   * không đẻ thêm dòng chi — chỉ lấp chỗ đơn còn thiếu. */
  const taodon = T.closest('[data-taodon]');
  if (taodon) {
    const c = S.chi.find((x) => x.id === taodon.dataset.taodon);
    if (!confirm('Tạo đơn Tourwell cho khoản "' + ((c && c.noiDung) || '') + '"?'
      + THEM_DONG + tien(c && c.tien) + ' đ · Quỹ Marketing · VAT 8% đã gồm.')) return;
    await chongBamHai(taodon, async () => {
      const kq = await api('/api/chi/' + taodon.dataset.taodon + '/tourwell', { method: 'POST' });
      await taiLai(true);
      if (kq && kq.tourwell) moKetQuaTourwell(kq.tourwell, c || {});
    }, 'Đang tạo đơn…');
    return;
  }

  const duyet = T.closest('[data-duyet]');
  if (duyet) return moDuyetMot(duyet.dataset.duyet);
  const tuchoi = T.closest('[data-tuchoi]');
  if (tuchoi) return moTuChoi(tuchoi.dataset.tuchoi);

  /* Lý do soạn sẵn: bấm là điền vào ô, vẫn sửa tiếp được. Năm câu này chiếm
   * gần hết số lần trả lại, mà gõ tay thì mỗi lần một kiểu chữ. */
  const lydo = T.closest('[data-lydo]');
  if (lydo) {
    const o = $('#tLyDo');
    if (o) { o.value = lydo.dataset.lydo; o.focus(); }
    return;
  }

  if (T.closest('#btnDuyetMot')) {
    const nut = T.closest('#btnDuyetMot');
    const ma = $('#dMa').value.trim();
    if (!ma) return toast('Phải nhập mã quyết toán.', 'err');
    await chongBamHai(nut, async () => {
      await api('/api/chi/' + nut.dataset.id + '/duyet', {
        method: 'POST',
        body: JSON.stringify({ ma, deGhiDe: nut.dataset.ghide === '1' }),
      });
      S.maCuoi = ma;
      dongModal(); toast('Đã quyết toán · ' + ma, 'ok'); await taiLai(true);
    }, 'Đang quyết toán…');
    return;
  }

  if (T.closest('#btnBoQuyetToan')) {
    const nut = T.closest('#btnBoQuyetToan');
    const c = S.chi.find((x) => x.id === nut.dataset.id);
    if (!confirm('Bỏ quyết toán khoản "' + ((c && c.noiDung) || '') + '"?'
      + THEM_DONG + 'Mã ' + ((c && c.maQuyetToan) || '') + ' bị xoá và khoản quay về '
      + '"Đã chi" để xử lý lại.')) return;
    await chongBamHai(nut, async () => {
      await api('/api/chi/' + nut.dataset.id + '/bo-quyet-toan', { method: 'POST' });
      dongModal(); toast('Đã bỏ quyết toán · khoản quay về "Đã chi"', 'ok');
      await taiLai(true);
    }, 'Đang gỡ…');
    return;
  }

  if (T.closest('#btnTuChoi')) {
    const nut = T.closest('#btnTuChoi');
    const lyDo = $('#tLyDo').value.trim();
    if (!lyDo) return toast('Phải ghi nội dung cần điều chỉnh.', 'err');
    await chongBamHai(nut, async () => {
      await api('/api/chi/' + nut.dataset.id + '/tu-choi', {
        method: 'POST', body: JSON.stringify({ lyDo }),
      });
      dongModal(); toast('Đã gửi yêu cầu điều chỉnh', 'ok'); await taiLai(true);
    }, 'Đang gửi…');
    return;
  }

  const ct = T.closest('[data-chungtu]');
  if (ct) return moChungTu(ct.dataset.chungtu);

  /* Thêm tệp ngay trong cửa sổ chứng từ, rồi MỞ LẠI cửa sổ để thấy cái vừa
   * đính. Không mở lại thì người ta phải đóng đi bấm vào lại mới tin là xong. */
  const themTep = T.closest('[data-themtep]');
  if (themTep) {
    const rec = themTep.dataset.rec;
    return taiTep(rec, themTep.dataset.themtep, () => moChungTu(rec));
  }

  const tep = T.closest('[data-taitep]');
  if (tep) return taiTep(tep.dataset.taitep, tep.dataset.o);

  if (T.closest('[data-bochon]')) { S.chon.clear(); return ve(); }
  if (T.closest('[data-quyettoan]')) return moQuyetToan();

  /* Bỏ quyết toán theo lô. Hỏi lại và KỂ TÊN mã sắp mất: mã quyết toán không
   * dựng lại được từ app, gỡ xong là phải đi tra sổ kế toán mới biết khoản nào
   * từng mang mã nào. */
  const boqt = T.closest('[data-boqt]');
  if (boqt) {
    const ds = S.chi.filter((c) => S.chon.has(c.id)
      && (String(c.maQuyetToan || '').trim() || c.tinhTrang === 'Đã quyết toán'));
    if (!ds.length) return toast('Không khoản nào đang ở trạng thái quyết toán.', 'err');
    const ma = [...new Set(ds.map((c) => String(c.maQuyetToan || '').trim()).filter(Boolean))];
    if (!confirm('Bỏ quyết toán ' + ds.length + ' khoản?' + THEM_DONG
      + (ma.length ? 'Xoá ' + ma.length + ' mã: ' + ma.slice(0, 5).join(', ')
        + (ma.length > 5 ? '…' : '') + XUONG_DONG : '')
      + 'Các khoản quay về "Đã chi". Mã đã xoá không dựng lại được.')) return;
    await chongBamHai(boqt, async () => {
      const r = await api('/api/bo-quyet-toan', {
        method: 'POST', body: JSON.stringify({ ids: ds.map((c) => c.id) }),
      });
      toast('Đã bỏ quyết toán ' + r.so + ' khoản', 'ok');
      S.chon.clear(); await taiLai(true);
    }, 'Đang gỡ…');
    return;
  }

  const xoa = T.closest('[data-xoa]');
  if (xoa) {
    const c = S.chi.find((x) => x.id === xoa.dataset.xoa);
    /* Xoá dòng chi KHÔNG gỡ được đơn Tourwell đã tạo, và KHÔNG gỡ được dấu
     * "đã ghi sổ quỹ" bên Base lịch tác nghiệp. Nói ra trước, vì cả hai chỗ đó
     * phải dọn tay và người bấm xoá là người duy nhất còn nhớ khoản này. */
    const nhac = ['Xoá khoản "' + (c ? c.noiDung : '') + '"?', '', 'Số dư quỹ tự tính lại.'];
    const dv = c && tachDon(c);
    if (dv) nhac.push('Đơn ' + dv.ma + ' bên Tourwell KHÔNG tự huỷ — phải vào huỷ tay, '
      + 'nếu không lịch sử chi của Quỹ Marketing vẫn còn khoản này.');
    if (c && c.buoiTacNghiep) nhac.push('Khoản này do app Lịch tác nghiệp ghi sang. '
      + 'Xoá rồi thì bấm "Đã thanh toán" lần nữa cũng không ghi lại được.');
    if (!confirm(nhac.join(XUONG_DONG))) return;
    try {
      await api('/api/chi/' + xoa.dataset.xoa, { method: 'DELETE' });
      dongModal(); toast('Đã xoá', 'ok'); await taiLai(true);
    } catch (err) { toast(err.message, 'err'); }
    return;
  }

  /* ---- lưu khoản chi ---- */
  if (T.closest('#btnLuuChi')) {
    const id = T.closest('#btnLuuChi').dataset.id;
    const body = {
      noiDung: $('#fNoiDung').value.trim(),
      tien: Number($('#fTien').value || 0),
      loai: $('#fLoai').value,
      ngayChi: $('#fNgay').value ? $('#fNgay').value + 'T00:00:00+07:00' : null,
      tinhTrang: $('#fTT').value,
      maDieuHanh: $('#fMaDH').value.trim(),
      chungTu: $('#fChungTu').value || null,
      soHoaDon: $('#fSoHD').value.trim(),
      mst: $('#fMST').value.trim(),
      ncc: $('#fNCC').value.trim(),
      chuyenKhoan: $('#fCK').value.trim(),
      ghiChu: $('#fGhiChu').value.trim(),
    };
    if (!body.noiDung) return toast('Phải ghi nội dung chi.', 'err');
    if (!(body.tien > 0)) return toast('Số tiền phải lớn hơn 0.', 'err');
    await chongBamHai(T.closest('#btnLuuChi'), async () => {
      let kq = null;
      if (id) await api('/api/chi/' + id, { method: 'PATCH', body: JSON.stringify(body) });
      else kq = await api('/api/chi', { method: 'POST', body: JSON.stringify(body) });
      dongModal();
      toast(id ? 'Đã lưu' : 'Đã ghi vào sổ', 'ok');
      await taiLai(true);
      if (kq && kq.tourwell) moKetQuaTourwell(kq.tourwell, body);
    });
    return;
  }

  /* ---- nạp quỹ ---- */
  if (T.closest('#btnLuuNap')) {
    const body = {
      tien: Number($('#nTien').value || 0),
      ngay: $('#nNgay').value ? $('#nNgay').value + 'T00:00:00+07:00' : null,
      noiDung: $('#nNoiDung').value.trim(),
      loai: 'Nạp thêm',
    };
    if (!(body.tien > 0)) return toast('Số tiền nạp phải lớn hơn 0.', 'err');
    await chongBamHai(T.closest('#btnLuuNap'), async () => {
      await api('/api/nap', { method: 'POST', body: JSON.stringify(body) });
      dongModal(); toast('Đã ghi ' + tien(body.tien) + ' đ vào quỹ', 'ok'); await taiLai(true);
    });
    return;
  }

  /* ---- quyết toán lô ---- */
  if (T.closest('#btnLuuQT')) {
    const nut = T.closest('#btnLuuQT');
    const ma = $('#qMa').value.trim();
    if (!ma) return toast('Phải nhập mã quyết toán.', 'err');
    const soGhiDe = Number(nut.dataset.ghide || 0);
    if (soGhiDe && !confirm('Xoá hẳn mã quyết toán cũ của ' + soGhiDe + ' khoản, thay bằng "'
      + ma + '"?' + THEM_DONG + 'Không lấy lại được.')) return;
    await chongBamHai(nut, async () => {
      const r = await api('/api/quyet-toan', {
        method: 'POST',
        body: JSON.stringify({ ids: nut.dataset.ids.split(','), ma, deGhiDe: !!soGhiDe }),
      });
      S.maCuoi = ma;
      dongModal(); toast('Đã quyết toán ' + r.so + ' khoản với mã ' + ma, 'ok');
      S.chon.clear(); await taiLai(true);
    }, 'Đang quyết toán…');
    return;
  }
});

/**
 * TÍCH MỘT Ô THÌ CHỈ ĐỔI THANH CHỌN, KHÔNG VẼ LẠI CẢ TRANG.
 *
 * Bản cũ gọi ve() ở hai nước: lúc tích ô ĐẦU TIÊN (thanh chưa có) và lúc bỏ ô
 * CUỐI CÙNG (thanh phải biến mất). Hai nước đó dựng lại toàn bộ bảng — 173
 * dòng — chỉ để thêm hay bớt một thanh. Và vì thanh nằm trong dòng chảy, nó
 * đẩy cả bảng xuống 52px, gần bằng chiều cao một hàng (60px): chị kế toán tích
 * xong ô đầu, con trỏ đang đứng trên một hàng khác, tích tiếp là sai dòng.
 *
 * Giờ thanh nổi trong #thanhChonHop, và ở đây chỉ thay ruột cái hộp đó.
 */
document.addEventListener('change', (e) => {
  if (e.target.id === 'chonHet') return chonHetTrongBang(e.target.checked);
  const c = e.target.closest('[data-chon]');
  if (!c) return;
  if (c.checked) S.chon.add(c.dataset.chon); else S.chon.delete(c.dataset.chon);
  const hop = $('#thanhChonHop');
  if (!hop) return ve();          // hộp chưa có (bản dựng cũ còn trong trang)
  hop.innerHTML = S.chon.size ? veThanhChon() : '';
  document.body.classList.toggle('co-thanhchon', S.chon.size > 0);
});

/**
 * ENTER LÀ BẤM NÚT CHÍNH CỦA CỬA SỔ ĐANG MỞ.
 *
 * Chị kế toán duyệt hàng chục dòng liên tiếp: bấm Quyết toán → gõ mã → phải
 * rời tay khỏi bàn phím đi tìm con chuột để bấm nút. Nhân lên ba chục lần thì
 * đó là ba chục lần đổi tay không có lý do gì.
 *
 * Ô nhiều dòng (lý do trả lại) thì Enter phải là xuống dòng — chỉ Ctrl+Enter
 * mới gửi, đúng nếp mọi ô soạn thảo khác.
 */
function nutChinhCuaModal() {
  const chan = $('#mdFoot');
  if (!chan || !$('#modal').classList.contains('on')) return null;
  /* Nút chính được ĐÁNH DẤU TƯỜNG MINH bằng data-chinh, không suy ra từ màu.
   *
   * Suy từ màu đã suýt sập hai lần: cửa sổ "Sửa khoản chi" đặt nút "Xoá khoản
   * này" trước nút Lưu, còn cửa sổ "Sửa quyết toán" đặt nút "Bỏ quyết toán"
   * trước nút xác nhận — cả hai đều đỏ, cả hai đều đứng trước, và cả hai đều
   * là thứ không lùi lại được. Mỗi lần thêm một nút đỏ lại phải nhớ luật chọn
   * nút; đánh dấu thì không phải nhớ gì.
   *
   * Cửa sổ không có nút nào mang dấu (kết quả Tourwell, xem chứng từ) thì Enter
   * không làm gì — đúng, vì ở đó không có việc nào để xác nhận. */
  return chan.querySelector('[data-chinh]');
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const o = e.target;
  const trongModal = o && o.closest && o.closest('#mdBody');
  if (!trongModal) return;
  const nhieuDong = o.tagName === 'TEXTAREA';
  if (nhieuDong && !(e.ctrlKey || e.metaKey)) return;
  const nut = nutChinhCuaModal();
  if (!nut || nut.disabled) return;
  e.preventDefault();
  nut.click();
});

document.addEventListener('keydown', (e) => {
  /* Lớp xem chứng từ nằm trên cùng nên Esc đóng nó trước — đóng cả form khai chi
   * bên dưới thì người ta mất công gõ lại chỉ vì liếc qua một cái hoá đơn. */
  if (e.key === 'Escape' && $('#xemTep').classList.contains('on')) return dongXemTep();
  if (e.key === 'Escape') dongModal();
});

taiLai().catch((e) => {
  $('#man').innerHTML = '<div class="dangTai err">Không đọc được sổ quỹ: ' + esc(e.message) + '</div>';
});
