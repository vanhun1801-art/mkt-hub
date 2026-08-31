'use strict';
/**
 * Mẫu cấu hình cho test — TOKEN GIẢ.
 *
 * Ba bộ test trước đây đọc `ADS_CONNECT_JSON.txt` để lấy một cấu hình thật. Hai
 * chỗ sai:
 *   1. File đó chỉ tồn tại sau khi chạy `node tao-env.js`. Xoá file là ba bộ test
 *      NỔ ngay lúc nạp module — chúng "pass" trước đó chỉ vì file tình cờ còn đó.
 *   2. Nó chứa token thật. Test không nên đọc bí mật thật để làm gì cả.
 *
 * Mẫu ở đây đi từ ketnoi.DEFAULT nên thêm kênh mới bao nhiêu lần cũng không phải
 * sửa file này — kênh mới tự có mặt với giá trị mặc định, và muốn bật thì khai
 * thêm vào BAT_SAN.
 */
const ketnoi = require('../sync/ketnoi');

/* Giá trị bật sẵn cho từng kênh. Token đều là chuỗi GIẢ, cố tình dài hơn 12 ký tự
 * để đi qua được hideSecret() nếu có chỗ nào gọi tới. */
const BAT_SAN = {
  meta: { enabled: true, accessToken: 'GIA_META_KHONG_PHAI_TOKEN_THAT', accountIds: ['588603187889258', '2283321421916661'] },
  tiktok: { enabled: true, accessToken: 'GIA_TIKTOK_KHONG_PHAI_TOKEN_THAT', advertiserIds: ['7307841310147510274'] },
  googleAds: {
    enabled: true,
    clientId: 'gia.apps.googleusercontent.com',
    clientSecret: 'GIA_CLIENT_SECRET_XXXXX',
    refreshToken: 'GIA_REFRESH_TOKEN_XXXXX',
    developerToken: 'GIA_DEVELOPER_TOKEN_XXX',
    customerIds: ['959-851-9559'],
  },
  pancake: {
    enabled: true,
    pages: [{ pageId: '1175309429179128', token: 'GIA_PAGE_TOKEN_XXXXXXX', platform: 'Facebook', label: 'FB' }],
  },
  pancakePos: { enabled: true, apiKey: 'GIA_POS_API_KEY_XXXXXXX', shopIds: ['123456'] },
  // googleSheet để tắt: hai nguồn Google bật cùng lúc là ghi đôi chi tiêu
};

/** Cấu hình đầy đủ, token giả. `sua` để chỉnh từng khối cho từng ca kiểm. */
function mau(sua = {}) {
  const c = JSON.parse(JSON.stringify(ketnoi.DEFAULT));
  Object.keys(BAT_SAN).forEach((k) => { c[k] = { ...c[k], ...BAT_SAN[k] }; });
  Object.keys(sua).forEach((k) => { c[k] = { ...(c[k] || {}), ...sua[k] }; });
  return c;
}

const json = (sua) => JSON.stringify(mau(sua));

/** Các kênh mẫu này bật VÀ có thông tin — dùng để so thay vì neo con số. */
function kenhBat(sua) {
  const c = mau(sua);
  const coThongTin = (k) => ['accessToken', 'refreshToken', 'clientSecret', 'developerToken', 'csvUrl', 'userToken', 'apiKey']
    .some((f) => typeof k[f] === 'string' && k[f].trim())
    || (Array.isArray(k.pages) && k.pages.some((p) => p && p.token));
  return Object.keys(ketnoi.DEFAULT)
    .filter((k) => k !== 'dongBo' && c[k] && c[k].enabled && coThongTin(c[k]));
}

module.exports = { mau, json, kenhBat, BAT_SAN };
