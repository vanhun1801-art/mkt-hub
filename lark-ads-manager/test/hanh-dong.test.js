/**
 * Bảng "chi tiết hành động chuyển đổi": gom bí danh và xếp theo giá trị.
 *
 * Hai cách bảng này có thể NÓI DỐI, cả hai đều đã xảy ra thật trên dữ liệu của
 * công ty và đều được sửa trước khi ship:
 *
 * 1. THỔI SỐ. Meta báo CÙNG một sự kiện dưới nhiều "bề mặt". Đo thật 12/08–10/09:
 *    ba dòng 89 (initiate_checkout), năm dòng 24 (purchase), bảy dòng 118 (lead).
 *    Để nguyên thì người đọc thấy bảy dòng khách tiềm năng và tưởng có 826, trong
 *    khi thật là 118.
 *
 * 2. NHẤN CHÌM CÁI ĐÁNG TIỀN. Xếp theo số thì "Tương tác trang 105.951" và
 *    "Xem video 97.863" đứng đầu, còn "Bắt đầu nhắn tin 1.201" tụt xuống hàng
 *    thứ tám. Một lượt nhắn tin có thể thành đơn; một lượt xem video thì không.
 */
const h = require('../sync/metrics-hanhdong');
const meta = require('../sync/meta');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

console.log('— tên gốc: bỏ tiền tố "bề mặt" của Meta');
[
  ['onsite_conversion.initiate_checkout', 'initiate_checkout'],
  ['onsite_web_initiate_checkout', 'initiate_checkout'],
  ['omni_initiated_checkout', 'initiate_checkout'],
  ['omni_purchase', 'purchase'],
  ['onsite_web_app_purchase', 'purchase'],
  ['onsite_conversion.purchase', 'purchase'],
  ['purchase', 'purchase'],
  ['onsite_conversion.lead_grouped', 'lead'],
  ['onsite_web_lead', 'lead'],
  /* Đuôi `_add_meta_leads` là Meta báo lại cùng một sự kiện lead dưới tên sự
   * kiện pixel khác — ba dòng offsite_* cùng 118. */
  ['offsite_complete_registration_add_meta_leads', 'lead'],
  ['offsite_search_add_meta_leads', 'lead'],
  ['offsite_content_view_add_meta_leads', 'lead'],
].forEach(([vao, ra]) => t(`${vao.slice(0, 44)} -> ${ra}`, h.tenGoc(vao) === ra, h.tenGoc(vao)));

/* KHÔNG được gom quá tay: hai sự kiện nhắn tin khác nhau phải giữ riêng. */
t('hai sự kiện nhắn tin KHÁC nhau vẫn khác tên gốc',
  h.tenGoc('onsite_conversion.messaging_first_reply')
  !== h.tenGoc('onsite_conversion.messaging_conversation_started_7d'));
t('mã lạ giữ nguyên, không bị bóp về rỗng', h.tenGoc('mot_ma_la_hoac_toanh') === 'mot_ma_la_hoac_toanh');
t('rỗng thì rỗng, không nổ', h.tenGoc('') === '' && h.tenGoc(null) === '');

console.log('— gom bí danh: lấy LỚN NHẤT, không cộng');
{
  /* Cộng là nhân số lên đúng như cái đang muốn sửa. Tên rộng nhất (omni_* = mọi
   * bề mặt) vốn đã bao trọn các tên hẹp hơn, nên lấy max. */
  const r = h.gomTrungLap([
    { ma: 'omni_purchase', ten: 'omni_purchase', nhom: 'MUA HÀNG', so: 24 },
    { ma: 'onsite_web_purchase', ten: 'onsite_web_purchase', nhom: 'MUA HÀNG', so: 24 },
    { ma: 'onsite_app_purchase', ten: 'onsite_app_purchase', nhom: 'MUA HÀNG', so: 11 },
  ]);
  t('ba bí danh gom về một dòng', r.length === 1, JSON.stringify(r.map((x) => x.ten)));
  t('lấy giá trị LỚN NHẤT (24), KHÔNG cộng thành 59', r[0].so === 24, String(r[0].so));
  t('ghi lại đủ ba bí danh để không ẩn gì', r[0].biDanh.length === 3, JSON.stringify(r[0].biDanh));
}

console.log('— gom theo TÊN, không theo con số');
{
  /* "Bắt đầu nhắn tin 1.201" và "Hội thoại có trả lời 1.201" bằng nhau nhưng là
   * HAI sự kiện khác nhau. Gom theo số là gộp nhầm. */
  const r = h.gomTrungLap([
    { ma: 'onsite_conversion.messaging_conversation_started_7d', ten: 'Bắt đầu nhắn tin', nhom: 'NHẮN TIN', so: 1201 },
    { ma: 'onsite_conversion.messaging_conversation_replied_7d', ten: 'Hội thoại có trả lời', nhom: 'NHẮN TIN', so: 1201 },
  ]);
  t('hai sự kiện cùng số KHÔNG bị gộp', r.length === 2, JSON.stringify(r.map((x) => x.ten)));
}

console.log('— tên hiện ra tra theo TÊN GỐC, không theo bí danh');
{
  /* `initiate_checkout` CÓ trong bảng dịch, nhưng không bí danh nào Meta trả về
   * trùng đúng tên gốc — nên nếu chờ bí danh thì bảng hiện mã máy. */
  const dich = (goc) => meta.TEN_HANH_DONG[goc] || '';
  const r = h.gomTrungLap([
    { ma: 'onsite_web_initiate_checkout', ten: 'onsite_web_initiate_checkout', nhom: 'MUA HÀNG', so: 89 },
    { ma: 'omni_initiated_checkout', ten: 'omni_initiated_checkout', nhom: 'MUA HÀNG', so: 89 },
  ], dich);
  t('hiện tên đã dịch', r[0].ten === 'Bắt đầu thanh toán', r[0].ten);
  t('không hiện mã máy', !/^on|^omni/.test(r[0].ten));
}
{
  /* Không có bảng dịch (Google Ads) thì giữ nguyên tên — tên của Google vốn đã là
   * tiếng người. */
  const r = h.gomTrungLap([{ ten: 'Click Zalo', nhom: 'CONTACT', so: 12 }]);
  t('không có bảng dịch thì giữ nguyên tên', r[0].ten === 'Click Zalo');
}

console.log('— xếp theo NHÓM gần tiền trước, rồi mới theo số');
{
  const r = h.xepHanhDong([
    { ten: 'Tương tác trang', nhom: 'TƯƠNG TÁC', so: 105951 },
    { ten: 'Xem video', nhom: 'XEM VIDEO', so: 97863 },
    { ten: 'Bắt đầu nhắn tin', nhom: 'NHẮN TIN', so: 1201 },
    { ten: 'Click Zalo', nhom: 'CONTACT', so: 12 },
    { ten: 'Mua hàng', nhom: 'PURCHASE', so: 1 },
  ]).map((x) => x.ten);
  t('mua hàng (1 lượt) lên TRÊN tương tác (105.951 lượt)',
    r.indexOf('Mua hàng') < r.indexOf('Tương tác trang'), JSON.stringify(r));
  t('đúng thứ tự nghiệp vụ',
    JSON.stringify(r) === JSON.stringify(['Mua hàng', 'Click Zalo', 'Bắt đầu nhắn tin', 'Xem video', 'Tương tác trang']),
    JSON.stringify(r));
}
{
  const r = h.xepHanhDong([
    { ten: 'A', nhom: 'NHẮN TIN', so: 5 },
    { ten: 'B', nhom: 'NHẮN TIN', so: 50 },
  ]).map((x) => x.ten);
  t('trong cùng nhóm thì số lớn lên trên', JSON.stringify(r) === JSON.stringify(['B', 'A']));
}
t('nhóm chưa biết xếp giữa, không giành chỗ nhóm gần tiền và cũng không bị vùi',
  h.hangNhom('MOT_NHOM_LA') === h.CHUA_BIET
  && h.hangNhom('MOT_NHOM_LA') > h.hangNhom('PURCHASE')
  && h.hangNhom('MOT_NHOM_LA') < h.hangNhom('ENGAGEMENT'));
t('danh sách rỗng không nổ', h.xepHanhDong([]).length === 0 && h.gomTrungLap(null).length === 0);

console.log('— KHÔNG được lọc bỏ dòng nào');
{
  /* Bỏ dòng là tổng không khớp và không ai biết vì sao. Gom thì được, bỏ thì không. */
  const vao = [
    { ma: 'a', ten: 'A', nhom: 'TƯƠNG TÁC', so: 1 },
    { ma: 'b', ten: 'B', nhom: 'XEM VIDEO', so: 2 },
    { ma: 'c', ten: 'C', nhom: 'KHONG_BIET', so: 3 },
  ];
  t('xếp không làm mất dòng', h.xepHanhDong(vao).length === 3);
  t('gom không làm mất dòng khi tên gốc khác nhau', h.gomTrungLap(vao).length === 3);
}

console.log('— dữ liệu THẬT của công ty: các họ bí danh phải gom đúng');
{
  /* Bộ mã lấy đúng từ tài khoản Meta của công ty ngày 10/09/2026. Neo vào đây để
   * lần sau đổi luật gom thì thấy ngay nó gom quá tay hay quá ít. */
  const MA = ['page_engagement', 'post_engagement', 'video_view', 'link_click',
    'onsite_conversion.messaging_welcome_message_view', 'onsite_conversion.total_messaging_connection',
    'onsite_conversion.messaging_conversation_replied_7d', 'onsite_conversion.messaging_conversation_started_7d',
    'post_interaction_net', 'post_interaction_gross', 'onsite_conversion.messaging_first_reply',
    'onsite_conversion.messaging_user_depth_2_message_send', 'onsite_conversion.messaging_user_depth_3_message_send',
    'onsite_conversion.messaging_user_depth_5_message_send', 'post_reaction', 'onsite_conversion.post_net_like',
    'comment', 'post', 'onsite_web_lead', 'onsite_conversion.lead_grouped',
    'offsite_complete_registration_add_meta_leads', 'offsite_search_add_meta_leads',
    'offsite_content_view_add_meta_leads', 'omni_purchase', 'onsite_app_purchase',
    'onsite_web_app_purchase', 'onsite_conversion.purchase', 'onsite_web_purchase',
    'onsite_conversion.initiate_checkout', 'onsite_web_initiate_checkout', 'omni_initiated_checkout'];
  const rows = MA.map((ma, i) => ({
    ma, ten: meta.TEN_HANH_DONG[ma] || ma, nhom: meta.nhomHanhDong(ma), so: 100 - i,
  }));
  const gom = h.gomTrungLap(rows, (g) => meta.TEN_HANH_DONG[g] || '');
  t('gom bớt được thật', gom.length < rows.length, `${rows.length} -> ${gom.length}`);
  const timGoc = (g) => gom.find((x) => h.tenGoc(x.ma || x.ten) === g);
  t('cả họ purchase về MỘT dòng', timGoc('purchase').biDanh.length === 5,
    JSON.stringify(timGoc('purchase').biDanh));
  t('cả họ lead về MỘT dòng', timGoc('lead').biDanh.length === 5,
    JSON.stringify(timGoc('lead').biDanh));
  t('cả họ checkout về MỘT dòng', timGoc('initiate_checkout').biDanh.length === 3);
  /* Các sự kiện nhắn tin là những chuyện khác nhau, không được gộp. */
  t('các sự kiện nhắn tin vẫn riêng',
    gom.filter((x) => x.nhom === 'NHẮN TIN').length >= 7,
    String(gom.filter((x) => x.nhom === 'NHẮN TIN').length));
}

console.log('— bảng dịch của Meta: mã máy phải ra tiếng người');
{
  /* Tra bằng mã ĐẦY ĐỦ như Meta trả về — bảng dịch khoá theo tên gốc, nên phép
   * tra phải đi qua tenGoc(). Đây chính là chỗ trước kia trượt: bảng dịch có khoá
   * `onsite_conversion.messaging_block` mà chỗ gom lại tra `messaging_block`. */
  const q = ['onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.messaging_user_depth_2_message_send',
    'onsite_conversion.messaging_block', 'onsite_conversion.post_net_comment',
    'onsite_conversion.post_unlike', 'post_interaction_net', 'like',
    'omni_purchase', 'onsite_web_initiate_checkout',
    'purchase', 'lead', 'link_click'];
  q.forEach((m) => t(`có bản dịch cho ${m.slice(0, 46)}`, !!meta.TEN_HANH_DONG[h.tenGoc(m)]));
  /* Mã chưa biết KHÔNG được bỏ đi — bỏ là mất số và tổng không khớp. */
  t('mã chưa biết vẫn có nhóm', !!meta.nhomHanhDong('mot_ma_hoan_toan_moi'));
}

console.log('— hai mã khác nhau không được cùng một tên hiện ra');
{
  /* Đã xảy ra thật: `like` (thích TRANG, 136) và `onsite_conversion.post_net_like`
   * (thích BÀI, 797) đều hiện là "Thích trang". Hai dòng cùng tên khác số thì bảng
   * không đọc được — người đọc không biết dòng nào là gì. */
  const dem = new Map();
  Object.entries(meta.TEN_HANH_DONG).forEach(([ma, ten]) => {
    dem.set(ten, [...(dem.get(ten) || []), ma]);
  });
  const trung = [...dem.entries()].filter(([, ms]) => ms.length > 1);
  t('không có tên nào bị hai mã dùng chung', trung.length === 0,
    trung.map(([ten, ms]) => `${ten} <- ${ms.join(', ')}`).join(' ; '));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
