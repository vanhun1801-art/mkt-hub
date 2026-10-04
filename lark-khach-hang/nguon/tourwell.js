'use strict';
/**
 * ============================================================================
 * KÉO KHÁCH + ĐƠN TỪ TOURWELL
 * ============================================================================
 * Tourwell là nguồn giàu nhất và là nguồn DUY NHẤT có khách quốc tế. Đo ngày
 * 02/10/2026 trên mẫu 400 khách:
 *
 *   số điện thoại  100%   ← khoá ghép chính
 *   giới tính      100%
 *   nhóm khách     100%
 *   hạng khách      82%
 *   quốc gia        36%   ← bản đồ nhiệt dựng từ đây
 *   thành phố, email, ngày sinh, hộ chiếu   0%  → bỏ, đừng dựng cột cho ô trống
 *
 * Vì sao không lấy quốc gia từ quảng cáo: Meta và TikTok đều chỉ nhắm Việt
 * Nam (đo cùng ngày: Meta trả đúng VN, TikTok trả đúng VN). Quảng cáo cho
 * tuổi và giới thì tốt, nhưng bản đồ thế giới thì không có gì để vẽ.
 */
const tw = require('../../lark-chung/tourwell.js');

/* Tourwell chặn ở 60 lượt/phút. Giãn 1,2 giây là 50 lượt/phút — còn chỗ thở
 * cho các app khác đang dùng chung token.
 *
 * MỘT TRANG CHỈ 25 BẢN GHI, dù xin bao nhiêu cũng vậy — đo 02/10/2026:
 * per_page=25, 100, 200 đều trả đúng 25. Đo trang cuối bằng tìm nhị phân: 671
 * trang ≈ 16.775 khách, tức kéo hết mất ~15 PHÚT. Đó là lý do việc này phải
 * chạy nền theo lịch, tuyệt đối không thể bấm-là-có. */
const GIAN_MS = 1400;   // 43 lượt/phút — chừa dư cho app Quảng cáo và Quỹ chi phí dùng chung token
const MOI_TRANG = 25;
/* Trần cao hơn hẳn 671 trang để còn chỗ cho khách mới, nhưng vẫn phải CÓ trần:
 * không có trần mà API lỡ trả mãi một trang đầy thì vòng lặp chạy vô tận. */
const TRAN_TRANG = 2000;

const cho = (ms) => new Promise((r) => setTimeout(r, ms));
const chu = (v) => (v == null ? '' : String(v).trim());
const lay = (o, d) => d.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/**
 * Gọi một lượt, gặp 429 thì ĐỢI rồi thử lại chứ không chết.
 *
 * Tourwell chặn ở 60 lượt/phút, tính chung cho cả token — mà token này còn
 * được app Quảng cáo và app Quỹ chi phí dùng. Nên kể cả khi mình giãn đúng
 * nhịp, một app khác chạy cùng lúc là đủ chạm trần.
 *
 * Lần chạy đầu (02/10/2026) gặp 429 ở trang 20 và CHẾT, mất sạch phần đã kéo.
 * Với một việc dài 14 phút thì chết vì một nhịp nghẽn là không chấp nhận được:
 * đợi một phút rồi đi tiếp vẫn nhanh hơn kéo lại từ đầu.
 */
async function goiKienNhan(duong, bao = () => {}) {
  for (let lan = 0; lan < 5; lan++) {
    try {
      return await tw.goi('GET', duong);
    } catch (e) {
      const m = String((e && e.message) || e);
      /* Không chỉ 429. Một nhịp mạng chập cũng giết cả việc 16 phút — gặp
       * thật 04/10/2026: chạy được mười mấy phút rồi chết ở "fetch failed",
       * mất sạch phần chưa kịp ghi. */
      const quaTan = /429|quá nhiều yêu cầu/i.test(m);
      const mangChap = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|timeout|aborted/i.test(m);
      if ((!quaTan && !mangChap) || lan === 4) throw e;
      /* Nghẽn tần suất thì phải đợi lâu cho hết cửa sổ; mạng chập thì đợi lâu
       * là phí — hai chuyện khác nhau, đừng dùng chung một con số. */
      const doi = quaTan ? 60000 + lan * 30000 : 5000 + lan * 5000;
      bao('  ' + (quaTan ? 'nghẽn tần suất (429)' : 'mạng chập: ' + m.slice(0, 40))
        + ' — đợi ' + Math.round(doi / 1000) + ' giây rồi đi tiếp');
      await cho(doi);
    }
  }
  throw new Error('không gọi được sau 5 lần');
}

/**
 * Duyệt hết các trang của một đường.
 *
 * Tourwell KHÔNG trả tổng số trang (phản hồi chỉ có mỗi `data`), nên điều kiện
 * dừng là trang ngắn hơn một trang đầy.
 *
 * THAM SỐ PHẢI LÀ `per_page`, KHÔNG PHẢI `limit`.
 *
 * Đo 02/10/2026: với `limit` thì Tourwell nhận request nhưng BỎ QUA `page` —
 * trang 1, trang 2 và trang 300 trả về y hệt nhau. Lần kéo đầu tiên vì thế tải
 * đúng 100 bản ghi lặp lại 375 lần mà log vẫn đếm "37.500 dòng" rất thuyết
 * phục. Đây là kiểu hỏng tệ nhất: không có lỗi, không có cảnh báo, chỉ có một
 * con số to và sai.
 *
 * Nên bên dưới có chốt chặn: trang mới mà trùng hệt trang trước thì DỪNG và
 * nói ra. Thà thiếu dữ liệu và biết mình thiếu, còn hơn đầy dữ liệu giả.
 */
async function duyet(duong, bao = () => {}, luuDo = null) {
  const ra = [];
  let dauTruoc = '';
  for (let trang = 1; trang <= TRAN_TRANG; trang++) {
    const noi = duong + (duong.includes('?') ? '&' : '?') + 'per_page=' + MOI_TRANG + '&page=' + trang;
    const j = await goiKienNhan(noi, bao);
    const lo = (j && j.data) || [];
    if (!Array.isArray(lo) || !lo.length) break;

    const dau = lo.map((x) => x && (x.code || x.id)).join(',');
    if (dau && dau === dauTruoc) {
      bao('! ' + duong + ': trang ' + trang + ' trùng hệt trang trước — phân trang không chạy, DỪNG ở '
        + ra.length + ' dòng');
      break;
    }
    dauTruoc = dau;

    ra.push(...lo);
    /* Báo tiến độ: một việc chạy mười lăm phút mà im lặng thì người xem không
     * phân biệt được "đang chạy" với "đã treo". */
    if (trang % 20 === 0) {
      bao(duong + ': ' + ra.length + ' dòng (trang ' + trang + ')');
      /* Lưu dở dang. Một việc chạy 14 phút mà chỉ ghi ở phút cuối thì hỏng ở
       * phút 13 là mất trắng — đã xảy ra thật ngay lần chạy đầu. */
      if (luuDo) { try { luuDo(ra); } catch (_) {} }
    }
    if (lo.length < MOI_TRANG) break;
    if (trang === TRAN_TRANG) bao('! ' + duong + ': DỪNG Ở ' + TRAN_TRANG + ' TRANG — có thể còn thiếu');
    await cho(GIAN_MS);
  }
  bao(duong + ': xong, ' + ra.length + ' dòng');
  return ra;
}

/**
 * Ngày của Tourwell là "20/10/2026" — NGÀY/THÁNG/năm, không phải ISO.
 *
 * Đổi sang YYYY-MM-DD ngay tại cửa vào. Để nguyên rồi cắt ký tự ở chỗ khác là
 * kiểu sai âm thầm kinh điển: "05/03/2026" đọc thành tháng 5 hay tháng 3 đều
 * trông hợp lý, và biểu đồ mùa đi sẽ sai mà không ai nghi ngờ. Lần đầu chạy
 * (04/10/2026) chính vì cắt nhầm nên biểu đồ mùa đi RỖNG — may là rỗng hẳn chứ
 * không phải sai lệch, nên còn nhìn ra.
 */
function ngayVN(v) {
  const s = chu(v);
  if (!s) return '';
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  const i = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return i ? i[0] : '';
}

/** Chuẩn hoá số điện thoại về một dạng để còn ghép được với kênh khác. */
function chuanSdt(so, ma) {
  let s = chu(so).replace(/[^\d+]/g, '');
  if (!s) return '';
  const m = chu(ma).replace(/[^\d]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (m && !s.startsWith(m)) s = m + s.replace(/^0+/, '');
  /* Số Việt Nam có hai cách viết (0xxx và 84xxx) cho cùng một người. Không gom
   * về một dạng thì cùng một khách thành hai hồ sơ — đúng chuyện "gộp trùng"
   * đang muốn tránh. */
  if (s.startsWith('840')) s = '84' + s.slice(3);
  if (/^0\d{9}$/.test(s)) s = '84' + s.slice(1);
  return s;
}

/* Chuyển một dòng thô của Tourwell thành dòng của mình.
 *
 * Tách ra thành hàm riêng vì nó được dùng ở HAI nơi: lúc trả kết quả cuối, và
 * lúc lưu dở dang. Trước đây bản lưu dở dang ghi thẳng dữ liệu thô — app đọc
 * vào thấy toàn `code`/`name` thay vì `ma`/`ten` nên lọc sạch, còn đúng một
 * hồ sơ. Hai nơi cùng một phép chuyển thì không trôi xa nhau được. */
function doiKhach(r) {
  return {
    ma: chu(lay(r, 'code')),
    id: lay(r, 'id'),
    ten: chu(lay(r, 'name')),
    sdt: chuanSdt(lay(r, 'phone.primary.number'), lay(r, 'phone.primary.code')),
    sdt2: chuanSdt(lay(r, 'phone.secondary.number'), lay(r, 'phone.secondary.code')),
    gioi: chu(lay(r, 'gender')),
    nuoc: chu(lay(r, 'address.country')),
    hang: chu(lay(r, 'medal')),
    nhom: chu(lay(r, 'sub_group')),
    sales: (Array.isArray(r.sales_person) ? r.sales_person : []).map((x) => chu(x && x.name)).filter(Boolean),
    link: chu(lay(r, 'link_erp')),
  };
}

async function keoKhach(bao = () => {}, luuDo = null) {
  const tho = await duyet('/api/v1/customers', bao,
    luuDo ? (ds) => luuDo(ds.map(doiKhach).filter((x) => x.ma || x.sdt)) : null);
  return tho.map(doiKhach).filter((x) => x.ma || x.sdt);
}

/* Cùng lý do với doiKhach: dùng chung cho kết quả cuối và bản lưu dở dang. */
function doiDon(r) {
  return {
    ma: chu(lay(r, 'code')),
    khachMa: chu(lay(r, 'customer.code')),
    khachTen: chu(lay(r, 'customer.name')),
    nguon: chu(lay(r, 'source.name')),
    luc: chu(lay(r, 'order_at_iso') || lay(r, 'created_at_iso')),
    /* Tourwell có HAI ô trạng thái và phải giữ cả hai.
     *
     *   status_code 0 = Đang xử lý · 1 = Thành công · 2 = Đã hủy
     *
     * Gộp bằng `status_code || status` là sai hai lần: mã 0 là số 0 nên bị coi
     * là rỗng và rơi sang chữ, còn mã 1 và 2 thì mất hẳn phần chữ nên đọc dữ
     * liệu ra chỉ thấy "1", "2" không hiểu gì.
     *
     * Quan trọng hơn: ĐƠN HUỶ không được tính vào doanh thu. 27/500 đơn trong
     * mẫu là đơn huỷ — cộng vào là mọi con số marketing phồng lên mà vẫn trông
     * hợp lý. */
    maTT: Number(lay(r, 'status_code')),
    trangThai: chu(lay(r, 'status')),
    daHuy: Number(lay(r, 'status_code')) === 2 || !!chu(lay(r, 'cancel_at_iso')),
    huyLuc: chu(lay(r, 'cancel_at_iso')),
    tien: Number(lay(r, 'total_payment.base')) || 0,
    daTra: Number(lay(r, 'total_paid.base')) || 0,
    sales: (Array.isArray(r.sales_person) ? r.sales_person : []).map((x) => chu(x && x.name)).filter(Boolean),
    /* Đây là chỗ trả lời "nhu cầu khách": mua gì, đi ngày nào, đón ở đâu.
     *
     * service_info và item_info là OBJECT, không phải chuỗi. Ép thẳng sang chữ
     * thì ra "[object Object]" — và vì tất cả đều ra một chuỗi giống hệt nhau,
     * bảng "tour bán chạy" hiện đúng MỘT dòng "[object Object] = 29.256" trông
     * như một con số thật. Gặp 04/10/2026.
     *
     *   service_info = loại  {name:"Vé tham quan", code:"ticket"}
     *   item_info    = món   {name, description:"*VÉ DINNER SHOW"}
     *   prices[].object.title = tên in trên phiếu, cụ thể nhất
     */
    dichVu: (Array.isArray(r.services) ? r.services : []).map((s) => ({
      loai: chu(lay(s, 'service_info.name')),
      ten: chu(lay(s, 'item_info.description')) || chu(lay(s, 'item_info.name'))
        || chu(lay(s, 'prices.0.object.title')) || chu(lay(s, 'service_info.name')),
      di: ngayVN(lay(s, 'departure_date')),
      ve: ngayVN(lay(s, 'return_date')),
      don: chu(lay(s, 'pickup_location')),
      ghiChu: chu(lay(s, 'passenger_note')),
    })).filter((s) => s.ten || s.di),
    /* ĐI MẤY NGƯỜI, CÓ TRẺ EM KHÔNG — rút từ các dòng giá.
     *
     * Đây là chỗ duy nhất trong cả hệ nói được khách đi một mình, đi đôi, hay
     * cả nhà có con nhỏ. `prices[].object.title` ghi rõ "Người lớn",
     * "Trẻ em (1m < 1m4)", "Em bé", kèm `quantity`. Đo mẫu 82 đơn: 17% đơn có
     * dòng trẻ em, trung vị 3 khách/đơn.
     *
     * Chỉ đếm dòng NGƯỜI. Trong prices[] còn lẫn dòng dịch vụ ("Thuê xe 7
     * chỗ", "Deluxe Double") và cả dòng kế toán ("lợi nhuận") — cộng tất vào
     * là ra số khách bịa. */
    khach: demKhach(r),
    link: chu(lay(r, 'link_erp')),
  };
}

/* Bỏ dấu trước khi so.
 *
 * Khớp thẳng chữ có dấu là cái bẫy: "người" ở dạng NFC là ng-ư-ờ-i, chữ "ờ"
 * mang sẵn cả dấu móc lẫn dấu huyền nên không nằm trong lớp [oơ] như mình
 * tưởng. Viết biểu thức kiểu đó thì nó lặng lẽ không khớp gì, và số khách ra
 * 0 — gặp thật khi thử lần đầu. Bỏ dấu rồi so chuỗi thường thì không bao giờ
 * dính chuyện này. */
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().trim();

/** Các dòng giá là NGƯỜI, không phải dịch vụ hay dòng kế toán. */
const LA_NGUOI_LON = /^(nguoi lon|ng\.? *lon|adult|nguoi\b)/;
const LA_TRE = /tre em|^em be|^be\b|child|infant|^tre\b/;

function demKhach(r) {
  let nguoiLon = 0, treEm = 0;
  for (const s of (Array.isArray(r.services) ? r.services : [])) {
    for (const p of (Array.isArray(s.prices) ? s.prices : [])) {
      const t = boDau(lay(p, 'object.title'));
      const q = Number(p && p.quantity) || 0;
      if (!t || q <= 0) continue;
      if (LA_TRE.test(t)) treEm += q;
      else if (LA_NGUOI_LON.test(t)) nguoiLon += q;
    }
  }
  const tong = nguoiLon + treEm;
  return { nguoiLon, treEm, tong, coTre: treEm > 0 };
}

async function keoDon(bao = () => {}, luuDo = null) {
  const tho = await duyet('/api/v1/orders', bao,
    luuDo ? (ds) => luuDo(ds.map(doiDon).filter((x) => x.ma)) : null);
  return tho.map(doiDon).filter((x) => x.ma);
}

module.exports = { keoKhach, keoDon, chuanSdt, ngayVN, doiDon, GIAN_MS };
