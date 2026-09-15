'use strict';
/**
 * ============================================================================
 * THỨ TỰ APP TRONG PANEL — người dùng tự xếp
 * ============================================================================
 * Anh Hùng: "anh muốn có thể thay đổi được vị trí của các ứng dụng thay vì theo
 * thứ tự hiện tại". Ba kiểu hỏng, cả ba đều im lặng:
 *
 *   mất app   — thứ tự lưu lại thành BỘ LỌC: app khai thêm sau (hoặc app không
 *               có trong danh sách đã lưu) biến mất khỏi panel.
 *   đổi nhầm  — bấm ↑ ở dòng đầu / ↓ ở dòng cuối mà vẫn xáo, hoặc đổi chỗ tính
 *               trên cả app đang ẩn nên nhảy cách hai bậc.
 *   quên mất  — xếp xong, tải lại trang là về như cũ.
 *
 * Bài này chạy CHÍNH đoạn mã của public/app.js — cắt đúng khối thứ tự rồi nạp
 * vào vm với localStorage giả. Không chép lại logic: chép lại thì bài test xanh
 * trong khi app hỏng.
 *
 * Chạy: node test/thu-tu-app.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

/* ---------------- nạp đúng khối thứ tự của app.js ---------------- */
const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const dau = SRC.indexOf("const KHOA_THU_TU = 'hub.thuTuApp';");
const cuoi = SRC.indexOf('SÁNG / TỐI', dau);
if (dau < 0 || cuoi < 0) {
  console.log('  \x1b[31mFAIL\x1b[0m không tìm thấy khối thứ tự trong public/app.js');
  console.log('\n\x1b[31m0 pass · 1 fail\x1b[0m');
  process.exit(1);
}
const KHOI = SRC.slice(dau, SRC.lastIndexOf('/* ====', cuoi));

function moiMoi(thuTuDaLuu) {
  const kho = new Map();
  if (thuTuDaLuu) kho.set('hub.thuTuApp', JSON.stringify(thuTuDaLuu));
  const ctx = {
    S: { modules: [], thuTu: [] },
    localStorage: {
      getItem: (k) => (kho.has(k) ? kho.get(k) : null),
      setItem: (k, v) => kho.set(k, v),
    },
    JSON, Map, Array,
    kho,
  };
  vm.createContext(ctx);
  vm.runInContext(KHOI, ctx);
  ctx.S.thuTu = ctx.docThuTu();
  return ctx;
}

const ids = (ds) => ds.map((m) => m.id).join(',');
const MODS = [
  { id: 'cong-viec', bat: true }, { id: 'lich', bat: true }, { id: 'quang-cao', bat: true },
  { id: 'ota', bat: true }, { id: 'kpi', bat: true }, { id: 'bao-cao', bat: true },
];

group('Chưa xếp gì thì giữ nguyên thứ tự tệp');
{
  const c = moiMoi(null);
  ok('không có thứ tự lưu ⇒ y như modules.json',
    ids(c.sapXepModules(MODS)) === ids(MODS), ids(c.sapXepModules(MODS)));
  ok('không đụng vào mảng gốc', c.sapXepModules(MODS) !== MODS);
}

group('Xếp lại thì panel theo');
{
  const c = moiMoi(['bao-cao', 'kpi', 'cong-viec', 'lich', 'quang-cao', 'ota']);
  ok('đúng thứ tự đã lưu',
    ids(c.sapXepModules(MODS)) === 'bao-cao,kpi,cong-viec,lich,quang-cao,ota',
    ids(c.sapXepModules(MODS)));
  ok('không mất app nào', c.sapXepModules(MODS).length === MODS.length);
}

group('App khai thêm sau KHÔNG được biến mất');
{
  /* Đây là kiểu hỏng đắt nhất: khai app thứ mười, ai đã từng xếp panel thì
   * không bao giờ thấy nó — mà không có lỗi nào hiện ra. */
  const c = moiMoi(['bao-cao', 'cong-viec']);
  const them = MODS.concat([{ id: 'app-moi', bat: true }]);
  const kq = c.sapXepModules(them);
  ok('app lạ vẫn còn', kq.some((m) => m.id === 'app-moi'), ids(kq));
  ok('app lạ xuống cuối, không chen giữa', kq[kq.length - 1].id === 'app-moi', ids(kq));
  ok('app đã xếp vẫn đứng đầu', kq[0].id === 'bao-cao' && kq[1].id === 'cong-viec', ids(kq));
  ok('đủ số app', kq.length === them.length, String(kq.length));
}
{
  /* Thứ tự cũ còn giữ id của app đã xoá — không được để nó đẩy lệch ai. */
  const c = moiMoi(['app-da-xoa', 'bao-cao', 'kpi']);
  const kq = c.sapXepModules(MODS);
  ok('id đã xoá thì rơi ra, không tạo chỗ trống',
    ids(kq) === 'bao-cao,kpi,cong-viec,lich,quang-cao,ota', ids(kq));
}

group('Lên / xuống một bậc');
{
  const c = moiMoi(null);
  c.S.modules = MODS.slice();
  ok('↑ ở dòng đầu không làm gì', c.doiChoApp('cong-viec', -1) === false);
  ok('↓ ở dòng cuối không làm gì', c.doiChoApp('bao-cao', 1) === false);
  ok('id lạ không làm gì', c.doiChoApp('khong-co', -1) === false);
  ok('panel không bị xáo', ids(c.S.modules) === ids(MODS), ids(c.S.modules));

  ok('↓ đổi chỗ với đúng người kế bên', c.doiChoApp('cong-viec', 1) === true);
  ok('đúng một bậc', ids(c.S.modules) === 'lich,cong-viec,quang-cao,ota,kpi,bao-cao',
    ids(c.S.modules));
  c.doiChoApp('cong-viec', -1);
  ok('↑ trả về chỗ cũ', ids(c.S.modules) === ids(MODS), ids(c.S.modules));
}

group('App đang ẩn không chen vào phép đổi chỗ');
{
  /* Ẩn một app ở giữa rồi bấm ↓: nếu tính trên cả app ẩn thì nó nhảy cách hai
   * bậc trên panel — người bấm thấy "sao lại nhảy hai dòng". */
  const c = moiMoi(null);
  c.S.modules = [
    { id: 'a', bat: true }, { id: 'an', bat: false },
    { id: 'b', bat: true }, { id: 'c', bat: true },
  ];
  c.doiChoApp('a', 1);
  ok('đổi chỗ chỉ trong nhóm đang hiện',
    c.S.modules.filter((m) => m.bat).map((m) => m.id).join(',') === 'b,a,c',
    c.S.modules.map((m) => m.id).join(','));
  ok('app ẩn vẫn nằm trong thứ tự đã lưu (bật lại là về đúng chỗ)',
    JSON.parse(c.kho.get('hub.thuTuApp')).includes('an'), c.kho.get('hub.thuTuApp'));
}

group('Nhớ qua lần tải trang sau');
{
  const c = moiMoi(null);
  c.S.modules = MODS.slice();
  c.doiChoApp('bao-cao', -1);
  const daGhi = c.kho.get('hub.thuTuApp');
  ok('có ghi xuống localStorage', !!daGhi, String(daGhi));

  const c2 = moiMoi(JSON.parse(daGhi));
  ok('mở lại trang ra đúng thứ tự vừa xếp',
    ids(c2.sapXepModules(MODS)) === 'cong-viec,lich,quang-cao,ota,bao-cao,kpi',
    ids(c2.sapXepModules(MODS)));
}
{
  const c = moiMoi(null);
  c.luuThuTu([]);
  ok('"Về thứ tự gốc" xoá sạch thứ tự riêng',
    ids(c.sapXepModules(MODS)) === ids(MODS), ids(c.sapXepModules(MODS)));
}

group('Trình duyệt chặn localStorage thì vẫn chạy');
{
  /* Chế độ riêng tư / tắt cookie: đọc-ghi localStorage NÉM lỗi. Panel vẫn phải
   * hiện đủ app, chỉ là không nhớ được thứ tự. */
  const ctx = {
    S: { modules: [], thuTu: [] },
    localStorage: {
      getItem: () => { throw new Error('chặn'); },
      setItem: () => { throw new Error('chặn'); },
    },
    JSON, Map, Array,
  };
  vm.createContext(ctx);
  vm.runInContext(KHOI, ctx);
  let no = false;
  try {
    ctx.S.thuTu = ctx.docThuTu();
    ctx.S.modules = MODS.slice();
    ctx.doiChoApp('bao-cao', -1);
  } catch (_) { no = true; }
  ok('không nổ', !no);
  ok('vẫn đủ app', ctx.sapXepModules(MODS).length === MODS.length);
}

group('Giao diện có đường để bấm');
{
  const app = SRC;
  const cd = fs.readFileSync(path.join(__dirname, '..', 'public', 'caidat.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  ok('mục app trên panel kéo được', /draggable="true" data-keo="1"/.test(app));
  ok('nhóm "Đang ẩn" KHÔNG kéo được',
    !/id: m\.id, href: '#\/cai-dat'[\s\S]{0,200}keo: true/.test(app));
  /* Panel tự vẽ lại mỗi 10 giây. Vẽ lại giữa lúc kéo là thay hết thẻ DOM dưới
   * tay, cú kéo đứt ngang mà không hiểu vì sao. */
  ok('đang kéo thì không vẽ lại panel', /if \(S\.dangKeo\) return;/.test(app));
  ok('có nút ↑ ↓ trong Cài đặt cho màn cảm ứng',
    /data-len="/.test(cd) && /data-xuong="/.test(cd));
  ok('↑ ↓ chỉ có ở app đang hiện', /m\.bat\s*\n?\s*\?\s*'<button class="btn nho ghost" data-len=/.test(cd));
  ok('có nút về thứ tự gốc', /cdThuTuGoc/.test(cd) && /luuThuTu\(\[\]\)/.test(cd));
  ok('có kiểu hiện lúc đang kéo', /\.rail-item\.dang-keo/.test(css));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
