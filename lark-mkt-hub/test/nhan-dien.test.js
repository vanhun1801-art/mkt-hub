'use strict';
/**
 * ============================================================================
 * MÀN PHÂN QUYỀN PHẢI NÓI ĐÚNG VỀ CHỖ BÁM CỦA TỪNG DÒNG
 * ============================================================================
 * Anh Hùng 26/09/2026: "anh đều không muốn có lỗi thao tác nào nữa".
 *
 * Loại lỗi nguy hiểm nhất ở màn này không phải là hiện sai số — mà là BÁO SAI
 * TÌNH TRẠNG. Báo sai đẩy quản lý đi sửa thứ đang chạy đúng, và che mất thứ
 * đang thật sự hỏng.
 *
 * Đo trên bảng thật ngày 26/09/2026, trước khi sửa:
 *   · 4/13 dòng báo ĐỎ "quyền chưa có tác dụng" — cả 4 đều có email công ty
 *     hợp lệ, quyền vẫn chạy đúng;
 *   · 12/13 dòng khuyên "nên điền email cho chắc" — email ĐÃ điền sẵn;
 *   · 2 dòng thật sự mong manh (KHÔNG có email) thì lẫn vào đám vàng kia.
 *
 * Gốc: màn này chẩn đoán theo DANH BẠ của các app, mà 39/40 mục trong danh bạ
 * không mang email (các app chỉ trả id + tên). Trong khi lúc đăng nhập,
 * `quyen.cuaNguoi()` khớp bằng EMAIL TRONG PHIÊN trước tiên và không đụng tới
 * danh bạ một chút nào.
 *
 * Sau khi sửa: 11 xanh · 2 vàng, và hai dòng vàng đúng là hai dòng không email.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '\n      ' + vi : '')); }
};

/* Lấy đúng hàm `nhanDien` ra khỏi tệp giao diện rồi chạy thật, thay vì dò bằng
 * biểu thức chính quy. Dò chuỗi chỉ chứng minh "có viết câu đó"; chạy thật mới
 * chứng minh "phân loại đúng". */
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'quyen.js'), 'utf8');
const dau = src.indexOf('function nhanDien(h) {');
assert.ok(dau >= 0, 'không tìm thấy hàm nhanDien trong public/quyen.js');
let sau = 0, cuoi = dau;
for (let i = src.indexOf('{', dau); i < src.length; i++) {
  if (src[i] === '{') sau++;
  else if (src[i] === '}') { sau--; if (!sau) { cuoi = i + 1; break; } }
}
// eslint-disable-next-line no-new-func
const nhanDien = new Function(src.slice(dau, cuoi) + '; return nhanDien;')();

console.log('\nchẩn đoán theo ĐÚNG cách hệ khớp lúc đăng nhập');

/* ---- có email = khoá chắc, bất kể danh bạ có thấy hay không ---- */
{
  const r = nhanDien({ nguoi: 'A', email: 'a@rootytrip.com', khop: null });
  ok('có email mà danh bạ không thấy -> XANH, không phải đỏ', r.loai === 'luc', r.loai + ' · ' + r.chu);
  ok('nói rõ quyền vẫn áp dụng, không doạ là hỏng',
    !/chưa có tác dụng|rơi về mặc định/.test(r.mo), r.mo);
  ok('KHÔNG khuyên điền email khi email đã có', !/điền email/i.test(r.mo), r.mo);
}
{
  const r = nhanDien({ nguoi: 'A', email: 'a@rootytrip.com', khop: { ten: 'A', cach: 'email' } });
  ok('khớp thẳng bằng email -> XANH', r.loai === 'luc');
}
{
  /* Đây là tình huống THẬT của 12/13 dòng: có email, nhưng danh bạ chỉ khớp
   * được bằng tên vì danh bạ không mang email. Vẫn phải là xanh. */
  const r = nhanDien({ nguoi: 'A', email: 'a@rootytrip.com', khop: { ten: 'A', cach: 'ten' } });
  ok('có email nhưng danh bạ chỉ khớp tên -> vẫn XANH', r.loai === 'luc', r.loai + ' · ' + r.chu);
  ok('không đổ lỗi cho người dùng, nói thật là danh bạ thiếu email',
    /danh bạ/i.test(r.mo), r.mo);
}

/* ---- không email = mong manh thật, và phải là thứ DUY NHẤT bị nhắc ---- */
{
  const r = nhanDien({ nguoi: 'B', email: '', khop: { ten: 'B', cach: 'ten' } });
  ok('KHÔNG email, khớp bằng tên -> VÀNG', r.loai === 'vang', r.loai);
  ok('nói rõ đổi tên là mất quyền', /đổi tên/.test(r.mo), r.mo);
  ok('bảo điền email vào', /điền email/i.test(r.mo), r.mo);
}
{
  const r = nhanDien({ nguoi: 'C', email: '', khop: null });
  ok('KHÔNG email, không ai trùng tên -> ĐỎ', r.loai === 'do', r.loai);
  ok('nói đúng hậu quả: rơi về mặc định', /rơi về mặc định/.test(r.mo), r.mo);
}
{
  const r = nhanDien({ nguoi: 'D', email: '', khop: { ten: 'D', cach: 'ten' }, trungTen: 3 });
  ok('KHÔNG email mà trùng tên nhiều người -> ĐỎ', r.loai === 'do', r.loai + ' · ' + r.chu);
  ok('nêu đúng số người trùng', /3/.test(r.chu), r.chu);
}

/* ---- tài khoản email + mật khẩu ---- */
{
  const r = nhanDien({ nguoi: 'E', email: 'e@gmail.com', khop: { ten: 'E', cach: 'email', ngoaiLark: true } });
  ok('tài khoản mật khẩu -> XANH và có nhắc cân nhắc base', r.loai === 'luc' && /Cân nhắc/.test(r.mo));
}

console.log('\nđúng bộ dữ liệu THẬT đo được trên bảng');
{
  /* 13 dòng như bảng thật: 11 dòng có email, 2 dòng không. Danh bạ không mang
   * email nên mọi dòng chỉ khớp được bằng tên. */
  const bang = [];
  for (let i = 0; i < 11; i++) bang.push({ nguoi: 'N' + i, email: 'n' + i + '@rootytrip.com', khop: { ten: 'N' + i, cach: 'ten' } });
  bang.push({ nguoi: 'Lê Trung Thành', email: '', khop: { ten: 'Lê Trung Thành', cach: 'ten' } });
  bang.push({ nguoi: 'Phan Văn Thêm', email: '', khop: { ten: 'Phan Văn Thêm', cach: 'ten' } });
  const dem = {};
  bang.forEach((h) => { const l = nhanDien(h).loai; dem[l] = (dem[l] || 0) + 1; });
  ok('11 xanh · 2 vàng · 0 đỏ — khớp đúng con số đo trên bảng thật',
    dem.luc === 11 && dem.vang === 2 && !dem.do, JSON.stringify(dem));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
