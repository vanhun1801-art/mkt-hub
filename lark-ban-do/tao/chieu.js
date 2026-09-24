'use strict';
/* Phép chiếu dùng chung cho hình đảo (tao/hinh.js) và toạ độ địa điểm (tao/du-lieu.js).
   Equirectangular có hiệu chỉnh cos(vĩ độ) — ở vùng nhỏ cỡ Phú Quốc sai số không nhìn thấy.
   Trình duyệt dùng lại đúng các hằng số này qua PQ_HINH.chieu. */
const BAC = 10.475, NAM = 9.83, TAY = 103.79, DONG = 104.11;
const K = 1500;                                          // điểm ảnh cho mỗi độ vĩ
const COS = Math.cos(((BAC + NAM) / 2) * Math.PI / 180);

const CHIEU = {
  BAC, NAM, TAY, DONG, K, COS,
  rong: Math.round((DONG - TAY) * K * COS),
  cao: Math.round((BAC - NAM) * K),
  xy: (lat, lon) => [(lon - TAY) * K * COS, (BAC - lat) * K],
};

module.exports = { CHIEU };
