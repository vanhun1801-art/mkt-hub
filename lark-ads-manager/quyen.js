'use strict';
/**
 * Hai chốt phân quyền của app: VAI quản lý, và KÊNH được xem.
 *
 * Tách ra khỏi server.js để test được. Một chốt bảo mật không có test là chỗ dễ
 * hỏng nhất khi sửa code sau này.
 *
 * Máy cá nhân (mode 'file'): luôn có vai, luôn thấy mọi kênh. Cấu hình nằm ngay
 * trên đĩa của chính người đó, thêm chốt ở đây không bảo vệ được gì.
 *
 * Server chung (mode 'api'): chỉ tin header do hub đặt sau khi đăng nhập Lark và
 * tra bảng Phân quyền. Hub XOÁ header do client tự gửi trước khi ghi lại, và app
 * chỉ nghe trên 127.0.0.1 — nên không ai mạo danh được. Nếu HUB_TRUST_HEADER=0
 * (cổng mở ra ngoài) thì không tin ai cả.
 */

const KHONG_KENH_NAO = '-';
const MOI_KENH = '*';

function laQuanLy(req, cfg, env) {
  const c = cfg || require('./config');
  const e = env || process.env;
  if (c.mode !== 'api') return true;
  if (e.HUB_TRUST_HEADER === '0') return false;
  const h = (req && req.headers) || {};
  return h['x-hub-user-manager'] === '1';
}

/**
 * Người đang xem được phép thấy những kênh nào.
 *
 * @returns {string[]|null} null = KHÔNG giới hạn; mảng rỗng = không kênh nào.
 *
 * Ba giá trị, ba ý nghĩa khác hẳn nhau — và chỗ dễ sai nhất là lẫn `null` với `[]`:
 *
 *   null  hub không nói gì về kênh. KHÔNG được hiểu là cấm.
 *   []    hub nói rõ: người này không được xem kênh nào.
 *   [...] đúng danh sách kênh được xem.
 *
 * Vì sao "hub không nói gì" phải là KHÔNG GIỚI HẠN, dù anh Hùng đã chọn "ô trống
 * = không thấy kênh nào": hai chuyện đó khác nhau. "Ô trống trong bảng" là một
 * lời khai; "không có header" là chưa có ai khai gì cả — ví dụ hub còn chạy bản
 * cũ chưa biết gửi header này, hoặc chạy ở máy cá nhân. Hiểu im lặng thành cấm
 * là cả phòng mở app lên thấy trắng trơn ngay giây deploy, mà chẳng ai làm gì sai.
 *
 * Hub gửi '-' khi thật sự muốn nói "không kênh nào". Đó là một lời khai, và app
 * nghe theo.
 */
function kenhDuocXem(req, cfg, env) {
  const c = cfg || require('./config');
  const e = env || process.env;
  if (c.mode !== 'api') return null;
  if (e.HUB_TRUST_HEADER === '0') return null;
  const raw = ((req && req.headers) || {})['x-hub-perm-kenh'];
  if (raw == null || raw === '') return null;          // hub không nói gì
  const s = String(raw).trim();
  if (s === MOI_KENH) return null;                      // nói rõ: mọi kênh
  if (s === KHONG_KENH_NAO) return [];                  // nói rõ: không kênh nào
  const ds = s.split(',').map((x) => x.trim()).filter(Boolean);
  return ds.length ? ds : [];
}

/**
 * Giao giữa kênh người dùng CHỌN xem và kênh họ ĐƯỢC PHÉP xem.
 *
 * Đây là hàm phải gọi ở mọi đường có dữ liệu, không phải chỉ ở giao diện: giấu
 * nút lọc trên màn hình không ngăn được ai gõ thẳng ?platform=Facebook vào URL.
 *
 * @param {string[]} chon  kênh người dùng chọn ([] = không lọc, tức muốn xem hết)
 * @param {string[]|null} duoc  kết quả của kenhDuocXem()
 */
function locKenh(chon, duoc) {
  const c = (chon || []).map((x) => String(x).trim()).filter(Boolean);
  if (duoc == null) return c;              // không giới hạn: chọn sao dùng vậy
  if (!duoc.length) return [KHONG_KENH_NAO];
  /* Không chọn gì nghĩa là "cho tôi xem hết" — mà hết, với người này, đúng bằng
   * danh sách được phép. */
  if (!c.length) return [...duoc];
  const cho = new Set(duoc);
  const giao = c.filter((x) => cho.has(x));
  /* Chọn toàn kênh không được phép thì trả về một tên KHÔNG khớp gì cả, chứ không
   * trả mảng rỗng: mảng rỗng xuống tới filterDaily lại có nghĩa "không lọc", tức
   * là mở toang đúng cái vừa định chặn. Đây là loại lỗi im lặng nhất. */
  return giao.length ? giao : [KHONG_KENH_NAO];
}

/**
 * Cắt bộ dữ liệu xuống đúng những kênh người này được xem.
 *
 * Lọc tại NGUỒN chứ không vá từng đường: /api/meta trả danh sách chiến dịch cho
 * ô lọc, /api/alerts trả cảnh báo, /api/sales trả doanh thu theo kênh — ba đường
 * khác nhau, ba chỗ phải nhớ. Cắt một lần ở đây thì đường viết sau này cũng được
 * canh mà không phải nhớ gì.
 *
 * Nhóm quảng cáo KHÔNG mang sẵn tên nền tảng, nên lọc theo chiến dịch của nó.
 *
 * Doanh thu: bảng Báo cáo Sales có cả kênh ngoài quảng cáo ("Khác" — lữ hành,
 * khách cũ, gọi trực tiếp; đo được 1.579/1.660 dòng). Người bị giới hạn kênh thì
 * KHÔNG thấy phần đó: họ được xem kênh của mình, không phải sổ doanh thu công ty.
 * Hệ quả là con số "doanh thu toàn công ty" với họ sẽ sai — nên server kèm cờ
 * `biGioiHan` để giao diện GIẤU ô đó đi, thay vì hiện một số đúng phép tính mà
 * sai ý nghĩa.
 */
function locDuLieuTheoKenh(data, duoc, moiKenh) {
  if (duoc == null) return data;                    // không giới hạn
  /* Không kênh nào thì KHÔNG GÌ CẢ, kể cả dòng vô chủ. Người này không dùng app
   * này, nên cho họ thấy 24.273đ chi tiêu vô chủ chỉ làm băng báo "chưa được cấp
   * kênh nào, không có số để hiện" thành ra nói sai. */
  if (!duoc.length) {
    return {
      ...data,
      campaigns: [], groups: [], ads: [], daily: [], sales: [],
      cMap: {}, gMap: {}, aMap: {},
      biGioiHan: true, kenhDuocXem: [],
    };
  }
  const cho = new Set(duoc);
  /* Dòng KHÔNG thuộc kênh nào đã biết thì giữ lại cho MỌI người xem.
   *
   * Đo trên dữ liệu thật: 2 dòng nền tảng "(chưa gán)", 24.273đ, quảng cáo
   * "(chưa gắn quảng cáo)". Chúng không thuộc kênh của ai, nên nếu lọc bỏ thì
   * khi cả phòng đều bị giới hạn kênh, KHÔNG AI còn thấy chúng nữa — kể cả cảnh
   * báo "chưa gắn quảng cáo" vốn sinh ra từ chính mấy dòng đó. Tiền biến mất
   * khỏi mọi màn hình, và không ai đi sửa phần ghép ID.
   *
   * Giữ lại không rò gì: dòng vô chủ thì không tiết lộ số của kênh ai cả. Đổi
   * lại, tổng của người bị giới hạn cao hơn đúng phần vô chủ đó — 0,04% ở đây,
   * và đó là phần đáng nhìn thấy chứ không đáng giấu đi. */
  const biet = new Set(moiKenh || require('./config').platforms);
  const voChu = (p) => !biet.has(p);
  const campaigns = (data.campaigns || []).filter((c) => cho.has(c.platform) || voChu(c.platform));
  const idCD = new Set(campaigns.map((c) => c.id));
  const groups = (data.groups || []).filter((g) => idCD.has(g.campaignId));
  const ads = (data.ads || []).filter((a) => cho.has(a.platform) || voChu(a.platform));
  const daily = (data.daily || []).filter((d) => cho.has(d.platform) || voChu(d.platform));
  const sales = (data.sales || []).filter((x) => cho.has(x.channel));
  return {
    ...data,
    campaigns, groups, ads, daily, sales,
    /* Dựng lại các bảng tra: để nguyên bảng cũ thì nó vẫn trỏ tới bản ghi vừa bị
     * cắt, và một chỗ nào đó tra ra dữ liệu lẽ ra không được thấy. */
    cMap: Object.fromEntries(campaigns.map((x) => [x.id, x])),
    gMap: Object.fromEntries(groups.map((x) => [x.id, x])),
    aMap: Object.fromEntries(ads.map((x) => [x.id, x])),
    biGioiHan: true,
    kenhDuocXem: [...duoc],
  };
}

module.exports = {
  laQuanLy, kenhDuocXem, locKenh, locDuLieuTheoKenh,
  KHONG_KENH_NAO, MOI_KENH,
};
