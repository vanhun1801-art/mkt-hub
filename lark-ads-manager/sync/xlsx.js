'use strict';
/**
 * Bộ đọc .xlsx đã chuyển sang `lark-chung/xlsx-doc.js` — app Social cũng phải
 * đọc bản xuất của TikTok LIVE Center, mà hai app đọc cùng một định dạng thì
 * dùng chung một bộ đọc; chép đôi ra là sửa một nơi, nơi kia sai lặng lẽ.
 *
 * Giữ nguyên tệp này làm cửa vào để `sync/tourwell.js` và `test/xlsx.test.js`
 * không phải đổi một dòng nào.
 */
module.exports = require('../../lark-chung/xlsx-doc');
