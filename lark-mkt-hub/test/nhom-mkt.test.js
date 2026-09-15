'use strict';
/**
 * ============================================================================
 * KHỚP NHÓM CHAT "PHÒNG MKT" VÀO DANH BẠ HUB
 * ============================================================================
 * Anh Hùng muốn form soạn thông báo tick sẵn người trong nhóm phòng. Cái đắt
 * không phải chỗ tick — là chỗ QUYẾT ĐỊNH ai được tick. Hai kiểu sai, cả hai
 * đều im lặng:
 *
 *   tick thiếu — người trong nhóm không được tick thì không nhận thông báo, mà
 *                màn hình vẫn báo "đã gửi".
 *   tick thừa  — tick nhầm người ngoài phòng (trùng tên, hoặc lấy cả danh bạ)
 *                thì thông báo nội bộ của phòng bay sang phòng khác.
 *
 * Nên luật khớp nằm ở máy chủ và thử được ở đây, không gọi Lark, không cần khoá.
 *
 * Chạy: node test/nhom-mkt.test.js
 */
const fs = require('fs');
const path = require('path');
const N = require('../nhom-lark');

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

/* Danh bạ hub: người trong phòng LẪN người ngoài phòng — đúng như thật, vì
 * danh bạ gom từ mọi app chứ không riêng app của phòng. */
const DANH_BA = [
  { id: 'ou_han', ten: 'Hân Phù MKT', email: 'han@rootytrip.com' },
  { id: 'ou_hang', ten: 'Hằng', email: '' },
  { id: 'ou_hung', ten: 'Lê Văn Hùng', email: 'marketing@rootytrip.com' },
  { id: 'ou_truong', ten: 'Danh Minh Trường', email: '' },
  { id: 'ou_chang', ten: 'Chang - Điều hành', email: 'chang@rootytrip.com' },
  { id: 'ou_dat', ten: 'Bùi Việt Đạt', email: '' },
];

group('Khớp cơ bản');
{
  const k = N.khopDanhBa(DANH_BA, [
    { id: 'ou_han', ten: 'Hân Phù MKT' },
    { id: 'ou_hang', ten: 'Hằng' },
  ]);
  ok('khớp theo open_id khi cùng chế độ', k.ids.join(',') === 'ou_han,ou_hang', k.ids.join(','));
  ok('không ai bị coi là thiếu', k.thieu.length === 0, k.thieu.join(','));
}
{
  /* Bản deploy đọc nhóm ra open_id của app Marketing Hub, còn danh bạ dựng từ
   * app con — hai dãy id khác nhau cho cùng một người. Lúc đó chỉ còn tên. */
  const k = N.khopDanhBa(DANH_BA, [
    { id: 'ou_KHAC_HOAN_TOAN_1', ten: 'Hân Phù MKT' },
    { id: 'ou_KHAC_HOAN_TOAN_2', ten: 'Lê Văn Hùng' },
  ]);
  ok('id lệch chế độ thì lùi về khớp tên', k.ids.join(',') === 'ou_han,ou_hung', k.ids.join(','));
}
{
  const k = N.khopDanhBa(DANH_BA, [{ id: '', ten: '  hân   phù   MKT ' }]);
  ok('thừa khoảng trắng và HOA thường vẫn khớp', k.ids.join(',') === 'ou_han', k.ids.join(','));
}
{
  /* Tiếng Việt gõ bằng tổ hợp (NFD) trông y hệt bản dựng sẵn (NFC) nhưng khác
   * chuỗi byte. Không chuẩn hoá thì "Hằng" không khớp "Hằng". */
  const k = N.khopDanhBa(DANH_BA, [{ id: '', ten: 'Hằng'.normalize('NFD') }]);
  ok('dấu tiếng Việt NFD vẫn khớp NFC', k.ids.join(',') === 'ou_hang', k.ids.join(','));
}

group('Chỉ tick người trong nhóm');
{
  const k = N.khopDanhBa(DANH_BA, [{ id: 'ou_han', ten: 'Hân Phù MKT' }]);
  ok('người ngoài phòng KHÔNG bị tick', !k.ids.includes('ou_chang') && !k.ids.includes('ou_dat'),
    k.ids.join(','));
  ok('chỉ đúng một người', k.ids.length === 1, String(k.ids.length));
}
{
  const k = N.khopDanhBa(DANH_BA, []);
  ok('nhóm rỗng thì không tick ai', k.ids.length === 0, k.ids.join(','));
}
{
  const k = N.khopDanhBa([], [{ id: 'ou_han', ten: 'Hân Phù MKT' }]);
  ok('danh bạ rỗng thì không nổ', k.ids.length === 0 && k.thieu.length === 1, JSON.stringify(k));
}
{
  const k = N.khopDanhBa(DANH_BA, [
    { id: 'ou_han', ten: 'Hân Phù MKT' },
    { id: '', ten: 'Hân Phù MKT' },
  ]);
  ok('một người vào hai lần chỉ ra một id', k.ids.length === 1, k.ids.join(','));
}

group('Nói ra chỗ không khớp được');
{
  const k = N.khopDanhBa(DANH_BA, [
    { id: 'ou_han', ten: 'Hân Phù MKT' },
    { id: 'ou_moi', ten: 'Người Mới Vào' },
  ]);
  ok('người hub chưa biết được liệt vào "thiếu"', k.thieu.join(',') === 'Người Mới Vào', k.thieu.join(','));
  ok('và KHÔNG bị bịa ra một id nào', k.ids.join(',') === 'ou_han', k.ids.join(','));
}
{
  const db = DANH_BA.concat([{ id: 'ou_hang2', ten: 'Hằng', email: 'hang2@rootytrip.com' }]);
  const k = N.khopDanhBa(db, [{ id: '', ten: 'Hằng' }]);
  ok('trùng tên thì KHÔNG tick bừa', k.ids.length === 0, k.ids.join(','));
  ok('và báo ra để tự tick', k.trungTen.join(',') === 'Hằng', k.trungTen.join(','));
}
{
  /* Trùng tên nhưng id khớp thẳng thì vẫn tick được — id chắc hơn tên. */
  const db = DANH_BA.concat([{ id: 'ou_hang2', ten: 'Hằng', email: '' }]);
  const k = N.khopDanhBa(db, [{ id: 'ou_hang2', ten: 'Hằng' }]);
  ok('trùng tên mà có id đúng thì vẫn tick', k.ids.join(',') === 'ou_hang2', k.ids.join(','));
}

group('Đọc đáp của Lark');
{
  ok('api trả items', N.gomNguoi({ items: [{ member_id: 'ou_a', name: 'A' }] })[0].id === 'ou_a');
  ok('lark-cli trả users', N.gomNguoi({ users: [{ member_id: 'ou_b', name: 'B' }] })[0].ten === 'B');
  ok('bỏ mục không có tên', N.gomNguoi({ users: [{ member_id: 'ou_c', name: '' }] }).length === 0);
  ok('đáp rỗng không nổ', N.gomNguoi(null).length === 0);
}

group('Bản lưu đi theo kho');
{
  const f = N.FILE_LUU;
  ok('bản lưu nằm trong lark-mkt-hub/du-lieu', /du-lieu[\\/]nhom-mkt\.json$/.test(f), f);
  if (fs.existsSync(f)) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    ok('bản lưu có người', (j.nguoi || []).length > 0, String((j.nguoi || []).length));
    /* Không được giữ open_id: id chỉ đúng trong chế độ đã đọc nó, mà file này
     * đi qua kho sang máy khác — giữ id là mời một lần khớp sai im lặng. */
    ok('bản lưu KHÔNG giữ open_id', (j.nguoi || []).every((x) => !x.id),
      JSON.stringify((j.nguoi || [])[0]));
  } else {
    ok('bản lưu tồn tại', false, 'chưa có ' + f + ' — chạy hub một lần ở máy có lark-cli');
  }
}

group('Form soạn tick sẵn nhóm');
{
  /* Đọc thẳng mã của panel: phần này chạy trong trình duyệt nên không require
   * được, mà nó lại là chỗ dễ bị sửa ngược nhất. Hai điều phải giữ:
   *   - thông báo MỚI mở ra với "Cả phòng" TẮT (bật thì máy chủ ghi `*` và mọi
   *     ô tick bên dưới bị bỏ qua — tick sẵn thành vô nghĩa);
   *   - SỬA thông báo cũ thì không đụng vào danh sách đã lưu. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'caidat.js'), 'utf8');
  ok('form dùng nhomMkt từ máy chủ', /d\.nhomMkt/.test(src));
  ok('mới + có nhóm ⇒ Cả phòng TẮT, ai = nhóm',
    /sanNhom\.length[\s\S]{0,120}moiAi:\s*false,\s*ai:\s*sanNhom/.test(src));
  ok('đọc nhóm hỏng ⇒ quay về mặc định Cả phòng',
    /moiAi:\s*true,\s*ai:\s*\[\]/.test(src));
  ok('sửa thông báo cũ thì giữ nguyên người nhận', /TBSUA = tb \|\| \(sanNhom\.length/.test(src));

  /* Tick sẵn thôi chưa đủ: anh Hùng vẫn thấy "rất đông thành viên" vì 27 người
   * ngoài phòng vẫn nằm trong danh sách. Không gõ gì thì chỉ hiện nhóm phòng;
   * gõ tên mới tìm trong cả danh bạ. Ai ĐÃ TICK thì luôn hiện — giấu một người
   * đã chọn đi là để họ nhận thông báo mà mình không thấy tên trên màn hình.
   *
   * (Đã chạy thật trên trình duyệt: 37 dòng · hiện 9 · tick 9; gõ "thương" ra
   * thêm Thương Vũ; bấm "Tick lại đúng nhóm" về lại đúng 9.) */
  ok('mặc định chỉ hiện người trong nhóm', /chiNhom && !l\.dataset\.nhom && !daTick/.test(src));
  ok('có gõ thì tìm trong cả danh bạ', /q\s*\?\s*\(!l\.dataset\.ten\.includes\(q\) && !daTick\)/.test(src));
  ok('đã tick thì luôn hiện', /const daTick = l\.querySelector\('input'\)\.checked/.test(src));
  ok('đọc nhóm hỏng thì hiện hết như cũ', /const chiNhom = sanNhom\.length > 0/.test(src));

  /* "Cả phòng" đổi nghĩa: nó LÀ danh sách bên dưới, không còn là dấu sao.
   *
   * Anh Hùng: "nếu tích cả phòng, có nghĩa là những người thuộc danh sách hiện
   * bên dưới. Còn nếu bỏ tích thì anh sẽ chọn thủ công". Dấu sao cũ nghĩa là
   * MỌI người trong danh bạ — gồm cả Điều hành, kế toán, phòng khác — nên tick
   * "cả phòng" là thông báo nội bộ bay ra ngoài phòng mà không màn hình nào nói.
   *
   * (Đã chạy thật trên trình duyệt: mở form → Cả phòng sáng · 9 tick; bỏ tick
   * một người → Cả phòng tự tắt; tick lại Cả phòng → 9 tick; bấm Lưu thì thân
   * yêu cầu là moiAi:false kèm đúng 9 tên, không có `*`.) */
  ok('lưu ra danh sách tên, không lưu dấu sao',
    /moiAi: \$\('#tbMoiAi'\)\.dataset\.chiNhom \? false : !!\$\('#tbMoiAi'\)\.checked/.test(src));
  ok('ô Cả phòng tick/bỏ hết đúng nhóm', /oNhom\(\)\.forEach\(\(x\) => \{ x\.checked = bat; \}\)/.test(src));
  ok('tick tay thì ô Cả phòng tự theo', /\$\('#tbAi'\)\.onchange = dongBo/.test(src));
  ok('không làm mờ danh sách nữa khi đọc được nhóm',
    /if \(chiNhom\) \{[\s\S]{0,200}return;\s*\}\s*\$\('#tbAi'\)\.classList\.toggle\('q-mo-het'/.test(src));
  ok('sửa thông báo kiểu cũ thì cảnh báo trước khi lưu', /đang lưu kiểu cũ/.test(src));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
