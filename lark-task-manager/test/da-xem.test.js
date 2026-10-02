'use strict';
/**
 * ============================================================================
 * DẤU "ĐÃ XEM" — AI ĐÃ ĐỌC TỚI ĐÂU
 * ============================================================================
 * Anh Hùng 02/10/2026: "nếu người kia đã xem thì có biết được luôn không em".
 *
 * Trước đó không có đường nào biết: bảng Bình luận chỉ có 5 cột và không cột
 * nào ghi ai đã đọc, còn sendCard thì gọi Lark xong vứt luôn phản hồi — trong
 * đó có message_id, chính là chìa để hỏi Lark "ai đã đọc tin này".
 *
 * Hai cách, đã cân rồi mới chọn:
 *   · Hỏi Lark ai đã mở THẺ. Rẻ, không đụng Base. Nhưng Lark chỉ cho hỏi tin
 *     do app gửi và CHỈ TRONG 7 NGÀY, và nó đo "đã mở thẻ" chứ không phải "đã
 *     đọc trong app".
 *   · Ghi lại lúc mỗi người mở tab Trao đổi. Giữ được mãi, đúng nghĩa đã đọc.
 *     Anh Hùng chọn cách này.
 *
 * Mốc lưu là THỜI ĐIỂM XEM, không phải id tin cuối: lưu id thì tin tới trễ hay
 * tin bị sửa sẽ làm lệch; so theo giờ thì chỉ một phép so.
 *
 * Bộ này canh ba thứ dễ hỏng ngầm nhất:
 *   1. Ghi trùng — mỗi lần mở tab đẻ một dòng, bảng phình vô hạn.
 *   2. Ghi dồn — nhịp nạp lại của tab biến thành hàng chục lượt ghi mỗi phút.
 *   3. Đếm sai — tính cả mình, hoặc tính người xem TRƯỚC khi mình nhắn.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8').split('\r\n').join('\n');
const sv = doc('server.js');
const fe = doc('public/app.js');
const cfg = require(path.join(GOC, 'config'));

console.log('\ndấu "đã xem" — ai đã đọc tới đâu');

/* ---- 1. chỗ lưu ---- */
ok('config khai bảng "Trao đổi · đã xem"', /^tbl[A-Za-z0-9]+$/.test(String(cfg.daXemTableId)), String(cfg.daXemTableId));
for (const c of ['khoa', 'task', 'nguoi', 'xemToi', 'lienPhong']) {
  ok('  có cột ' + c, !!(cfg.daXemFields && cfg.daXemFields[c] && cfg.daXemFields[c].id));
}
/* Bảng RIÊNG, không phải một ô trên dòng việc: mười người cùng mở một việc là
 * mười lượt ghi vào cùng một dòng, Base trả 1254291 (xung đột revision) mà
 * dòng việc vốn đã là dòng nóng nhất. */
ok('dùng bảng riêng, không ghi đè lên dòng việc',
  cfg.daXemTableId !== cfg.tableId && cfg.daXemTableId !== cfg.commentTableId);

/* ---- 2. máy chủ ---- */
ok('đọc bình luận trả kèm daXem (một lượt, không mở thêm đường gọi)',
  /\{ comments: list, daXem: await docDaXem\(/.test(sv));
ok('có đường đánh dấu đã xem', /\/api\/tasks\/\(rec\[A-Za-z0-9\]\+\)\\\/da-xem/.test(sv)
  || /da-xem\$/.test(sv));

const ghi = (/async function ghiDaXem[\s\S]*?\n\}/.exec(sv) || [''])[0];
ok('tìm được hàm ghiDaXem', ghi.length > 100);
ok('có dòng rồi thì SỬA, chưa có mới tạo (không đẻ dòng trùng)',
  /if \(cu\)[\s\S]{0,200}updateRecord/.test(ghi) && /createRecord/.test(ghi));
ok('soi trùng bằng khoá (việc × người)', /khoaDaXem/.test(sv) && /DF\.khoa\.id/.test(ghi));
/* open_id của Lark khác nhau theo từng APP: cùng một người, bản trên Render
 * thấy một mã, lark-cli ở máy lập trình thấy một mã khác. Soi trùng CHỈ bằng
 * chuỗi khoá thì hai bên ghi ra hai khoá khác nhau, một người một việc thành
 * hai dòng — đúng cái chuyện ghi trùng đang muốn chặn. Ô người thì không dính,
 * vì Lark luôn trả mã theo app của bên đang hỏi. */
ok('soi trùng ưu tiên Ô NGƯỜI, không chỉ chuỗi khoá (open_id khác nhau theo app)',
  /asUsers\(r\.cells\[DF\.nguoi\.id\]\)\[0\] \|\| \{\}\)\.id === nguoi\.id/.test(ghi));
ok('vẫn so cả việc khi soi trùng (không nhầm sang việc khác)', /cungViec\(r\)/.test(ghi));
ok('việc liên phòng ghi vào cột chữ, không nhét vào ô liên kết',
  /if \(laLienPhong\) cells\[DF\.lienPhong\.name\]/.test(ghi));

const docFn = (/async function docDaXem[\s\S]*?\n\}/.exec(sv) || [''])[0];
ok('đọc hỏng thì trả rỗng, không làm vỡ tab Trao đổi', /return \[\];/.test(docFn));
ok('đọc hỏng có ghi log', /\[da-xem\]/.test(docFn));

/* Chốt quyền: không có thì ai cũng ghi được "mình đã xem" lên việc người
 * khác, và cái dấu đó thành ra nói dối. */
const khoi = sv.slice(sv.indexOf('const mXem = p.match'), sv.indexOf('/* ---- bình luận ---- */'));
ok('đường đánh dấu có chốt quyền', /requireOwnTask/.test(khoi));
ok('đánh dấu theo NGƯỜI ĐANG ĐĂNG NHẬP, không nhận id từ bên gửi',
  /const me = await whoAmI\(req\)/.test(khoi) && !/body\.(nguoi|openId|id)/.test(khoi));

/* ---- 3. màn hình: chạy THẬT hàm trong app.js, không chép lại ---- */
const lay = (ten) => {
  const m = new RegExp('function ' + ten + '\\([\\s\\S]*?\\n\\}').exec(fe);
  return m ? m[0] : '';
};
const nguonVe = lay('veDaXem');
const nguonDanh = lay('danhDauDaXem');
ok('tìm được veDaXem và danhDauDaXem trong app.js', !!nguonVe && !!nguonDanh);

/* DOM giả tối thiểu — đủ để chạy đúng mã thật. */
const elGia = () => {
  const o = {
    _con: [], classList: { _c: [], add(x) { this._c.push(x); }, contains(x) { return this._c.includes(x); } },
    textContent: '', title: '',
    appendChild(c) { this._con.push(c); return c; },
    get lastChild() { return this._con[this._con.length - 1] || null; },
  };
  return o;
};
const moiTruong = {
  el: (tag, cls, txt) => { const o = elGia(); if (cls) o.classList.add(cls); if (txt) o.textContent = txt; return o; },
  vnParts: (s) => { const d = new Date(s); return { H: d.getHours(), M: d.getMinutes() }; },
  p2: (n) => String(n).padStart(2, '0'),
  req: () => Promise.resolve({}),
};
const nap = new Function(                                   // eslint-disable-line no-new-func
  'el', 'vnParts', 'p2', 'req',
  nguonVe + '\n' + nguonDanh + '\nreturn { veDaXem, danhDauDaXem };');
const { veDaXem, danhDauDaXem } = nap(moiTruong.el, moiTruong.vnParts, moiTruong.p2, moiTruong.req);

const ME = 'ou_toi';
const tinCuaToi = [{ id: 'c1', at: '2026-10-02T09:00:00+07:00', author: [{ id: ME, name: 'Tôi' }] }];
const chu = (daXem, cmts) => {
  const h = elGia();
  veDaXem(h, cmts || tinCuaToi, daXem, ME);
  return h.lastChild ? h.lastChild.textContent : '(không vẽ gì)';
};

ok('chưa ai đọc thì nói thẳng', chu([]) === 'Chưa ai xem', chu([]));
ok('một người đọc thì nói rõ tên và giờ',
  chu([{ id: 'ou_a', name: 'Nguyễn Hồng Ngọc', at: '2026-10-02T09:40:00+07:00' }])
    === '✓✓ Nguyễn Hồng Ngọc đã xem 09:40',
  chu([{ id: 'ou_a', name: 'Nguyễn Hồng Ngọc', at: '2026-10-02T09:40:00+07:00' }]));
ok('đông người thì đếm, không liệt kê một hàng dài tên',
  chu([{ id: 'a', name: 'A', at: '2026-10-02T10:00:00+07:00' },
    { id: 'b', name: 'B', at: '2026-10-02T10:00:00+07:00' },
    { id: 'c', name: 'C', at: '2026-10-02T10:00:00+07:00' }]) === '✓✓ 3 người đã xem');

/* Hai cái bẫy thật của phép so theo giờ. */
ok('người mở tab TRƯỚC khi mình nhắn thì chưa tính là đã đọc',
  chu([{ id: 'ou_a', name: 'Ngọc', at: '2026-10-02T08:00:00+07:00' }]) === 'Chưa ai xem');
ok('không tính chính mình là người đã xem',
  chu([{ id: ME, name: 'Tôi', at: '2026-10-02T23:00:00+07:00' }]) === 'Chưa ai xem');
ok('việc chưa có tin nào của mình thì không vẽ gì',
  chu([{ id: 'ou_a', name: 'Ngọc', at: '2026-10-02T10:00:00+07:00' }],
    [{ id: 'c9', at: '2026-10-02T09:00:00+07:00', author: [{ id: 'ou_a', name: 'Ngọc' }] }])
    === '(không vẽ gì)');

/* ---- 3b. dấu đã xem đổi thì màn hình phải VẼ LẠI ----
 * Lỗi đã gặp 02/10/2026: Trường mở ra xem rồi mà màn hình anh Hùng vẫn báo
 * "Chưa ai xem". Vì khoá "có gì mới không" của lượt nạp định kỳ chỉ tính id
 * các TIN — người kia đọc thì dấu đổi mà danh sách tin thì không, nên lượt nạp
 * thoát ngay và dòng đó đứng nguyên mãi. Phải đóng mở lại ngăn mới thấy. */
const nguonNap = (/async function napBinhLuan[\s\S]*?\n\}/.exec(fe) || [''])[0];
ok('tìm được napBinhLuan', nguonNap.length > 200);
ok('khoá "có gì mới" tính cả dấu đã xem',
  /const dauXem = \(d\.daXem \|\| \[\]\)\.map/.test(nguonNap));
ok('chỉ dấu đổi thì vẽ lại ĐÚNG dòng đó',
  /querySelector\('\.cmt-daxem'\)[\s\S]{0,160}veDaXem\(/.test(nguonNap));
/* Và KHÔNG dựng lại cả danh sách tin trong nhánh đó — dựng lại là nhảy mất
 * chỗ đang cuộn và chớp một cái, trong khi thứ đổi chỉ là một dòng chữ. */
const nhanh = (/if \(im && list\._dau === dau\) \{[\s\S]*?\n    \}/.exec(nguonNap) || [''])[0];
ok('nhánh đó không dựng lại danh sách tin',
  !!nhanh && nhanh.indexOf("innerHTML = ''") === -1);

/* ---- 4. không ghi dồn ---- */
let soLanGoi = 0;
const napD = new Function(                                  // eslint-disable-line no-new-func
  'el', 'vnParts', 'p2', 'req', nguonDanh + '\nreturn danhDauDaXem;');
const danhDau = napD(moiTruong.el, moiTruong.vnParts, moiTruong.p2,
  () => { soLanGoi += 1; return Promise.resolve({}); });

const tinNguoiKhac = [{ id: 'c1', at: '2026-10-02T09:00:00+07:00', author: [{ id: 'ou_a', name: 'Ngọc' }] }];

soLanGoi = 0;
danhDau({ id: 'recX' }, tinNguoiKhac, [], ME);
ok('có tin mới của người khác thì ĐÁNH DẤU', soLanGoi === 1, 'gọi ' + soLanGoi + ' lần');

soLanGoi = 0;
danhDau({ id: 'recX' }, tinNguoiKhac, [{ id: ME, at: '2026-10-02T10:00:00+07:00' }], ME);
ok('đã đánh dấu rồi thì THÔI, không ghi lại mỗi nhịp nạp', soLanGoi === 0, 'gọi ' + soLanGoi + ' lần');

soLanGoi = 0;
danhDau({ id: 'recX' }, tinCuaToi, [], ME);
ok('chỉ có tin của mình thì không đánh dấu', soLanGoi === 0, 'gọi ' + soLanGoi + ' lần');

soLanGoi = 0;
const t = { id: 'recX' };
danhDau(t, tinNguoiKhac, [], ME);
danhDau(t, tinNguoiKhac, [], ME);          // nhịp thứ hai ập tới trước khi lượt đầu xong
ok('hai nhịp sát nhau chỉ ghi MỘT lượt', soLanGoi === 1, 'gọi ' + soLanGoi + ' lần');

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
process.exit(fail ? 1 : 0);
