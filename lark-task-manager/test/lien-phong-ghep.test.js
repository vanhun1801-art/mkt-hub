'use strict';
/* Việc liên phòng gắn với bản trong Base phòng bằng "Mã liên phòng". Đuôi mã lấy từ
 * open_id, mà open_id khác nhau theo từng app Lark (Hub trên Render, lark-cli trên
 * máy). 04/11/2026: 26 việc gắn từ máy hiện TRÙNG trên Render. Test này giữ phép
 * ghép không lệ thuộc open_id. */
const assert = require('assert');
const LP = require('../lien-phong');

const viecLP = (rec, ownerId, ten) => ({ id: LP.maRieng(rec, { id: ownerId }), nguonRec: rec, owner: [{ id: ownerId, name: ten }] });

// Cùng người, hai app: open_id khác hẳn.
const tuRender = viecLP('reczz28VRGTp1UVm', 'ou_render_b96d548d3d5e', 'Hằng');
const maTuMay = LP.maRieng('reczz28VRGTp1UVm', { id: 'ou_bcf0b45563e1746fac6c83eaf96eabd7' });
assert.notStrictEqual(tuRender.id, maTuMay);

const phong = [{ id: 'recPhong1', maLienPhong: maTuMay, owner: [{ id: 'ou_khac', name: 'Hằng' }] }];
const daGan = LP.daGan(phong);
assert.strictEqual(daGan(tuRender), true, 'bản liên phòng phải được ẩn dù đuôi open_id khác');

// Việc khác cùng người thì không bị ẩn nhầm.
assert.strictEqual(daGan(viecLP('reczz28VS53SXGNH', 'ou_render_b96d548d3d5e', 'Hằng')), false);

// Bản ghi có chữ x ngay trong record_id vẫn tách đúng.
const coX = viecLP('reczz28VS60x6Hn6', 'ou_render_b96d548d3d5e', 'Hằng');
const phongX = [{ id: 'r2', maLienPhong: LP.maRieng('reczz28VS60x6Hn6', { id: 'ou_may_83eaf96eabd7' }), owner: [{ name: 'Hằng' }] }];
assert.strictEqual(LP.daGan(phongX)(coX), true);

// timTrong: mã từ app khác vẫn ra đúng một việc; việc nhiều người nhận thì chọn theo tên.
const thu = viecLP('recNhieu', 'ou_r_thu', 'Huỳnh Thị Anh Thư');
const ngoc = viecLP('recNhieu', 'ou_r_ngoc', 'Nguyễn Hồng Ngọc');
const ds = [tuRender, thu, ngoc];
assert.strictEqual(LP.timTrong(ds, maTuMay), tuRender);
const maNgocTuMay = LP.maRieng('recNhieu', { id: 'ou_may_ngoc_123456789' });
assert.strictEqual(LP.timTrong(ds, maNgocTuMay), null, 'nhiều người, không biết ai thì không đoán');
assert.strictEqual(LP.timTrong(ds, maNgocTuMay, { owner: [{ name: 'Nguyễn Hồng Ngọc' }] }), ngoc);
assert.strictEqual(LP.timTrong(ds, 'recKhongCo'), null);

console.log('lien-phong-ghep: ok');
