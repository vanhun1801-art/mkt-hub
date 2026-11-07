/**
 * Token tài khoản Pancake hết hạn (01/11/2026) không được làm lead mọi kênh
 * báo lỗi, khi page nào cũng đã có token page riêng. Không gọi mạng: thay
 * danhSachPage và fetchConversations bằng hàm giả.
 */
const pancake = require('../sync/pancake');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

pancake.danhSachPage = async () => { throw new Error('access_token expired'); };
pancake.fetchConversations = async (page) => ({
  rows: page.pageId === 'ttm_A'
    ? [{ tags: ['THUTA'], adIds: [] }, { tags: ['SPAM'], adIds: ['1'] }, { tags: [], adIds: [] }]
    : [{ tags: ['TRIEL'], adIds: ['2'] }],
});
const { gomTinNhan } = require('../sync/tinnhan');

(async () => {
  console.log('— token tài khoản hết hạn, dùng page đã khai');
  const r = await gomTinNhan({
    userToken: 'het-han',
    pages: [
      { pageId: 'ttm_A', token: 'tA', platform: 'TikTok', label: 'Cuộc sống tại Phú Quốc' },
      { pageId: '1346805521858233', token: 'tB', platform: 'Facebook', label: 'Routine Hospitality' },
    ],
  }, '2026-10-01', '2026-10-31');
  t('đọc đủ hai kênh', r.rows.length === 2, JSON.stringify(r.rows));
  t('không kênh nào chưa nối', r.chuaNoi.length === 0, JSON.stringify(r.chuaNoi));
  const a = r.rows.find((x) => x.channel === 'Cuộc sống tại Phú Quốc');
  t('lead TikTok = 1 (bỏ SPAM, bỏ không thẻ)', a && a.lead === 1, JSON.stringify(a));
  t('nền tảng giữ theo Cài đặt', a && a.platform === 'TikTok');
  t('ghi lại lỗi token tài khoản', /expired/.test(r.loiTaiKhoan));

  console.log('— không có page nào đã khai thì vẫn báo lỗi');
  let loi = '';
  try { await gomTinNhan({ userToken: 'het-han', pages: [] }, '2026-09-01', '2026-09-30'); }
  catch (e) { loi = e.message; }
  t('ném lỗi gốc', /expired/.test(loi), loi);

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
