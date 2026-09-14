'use strict';
/**
 * Thêm chiến dịch mới ngay trong form giao việc.
 *
 *   node test/campaign.test.js
 *
 * KHÔNG chạm vào Lark Base — chỉ kiểm hàm dựng định nghĩa cột. Đó mới là chỗ
 * nguy hiểm: sửa cột là ghi TOÀN PHẦN (`+field-update` dùng PUT), nên ô nào
 * không có trong định nghĩa gửi đi là ô đó MẤT. Cột Campain đang có
 * `default_value` là "Operate" — làm mất nó thì không có lỗi nào hiện ra, chỉ
 * là từ hôm đó mọi việc tạo mới đều trống ô Campain.
 *
 * Phép ghi thật đã thử tay một lần rồi hoàn nguyên (thêm một mục, đọc lại,
 * xoá đi, đối chiếu đúng 5 mục ban đầu) — không đưa vào bộ tự động, vì test
 * ghi lên Base thật là thứ chỉ chạy đúng ở lần đầu.
 */
const { themLuaChon } = require('../campaign');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dung, chiTiet) => {
  if (dung) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (chiTiet ? ' → ' + chiTiet : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

/* Bản sao đúng hình dạng cột Campain thật của Base (đọc bằng +field-list). */
const COT = () => ({
  id: 'fld7UlB9mE',
  name: 'Campain',
  type: 'select',
  multiple: false,
  default_value: ['Operate'],
  options: [
    { hue: 'Yellow', lightness: 'Darker', name: 'ITE' },
    { hue: 'Green', lightness: 'Dark', name: 'Operate' },
    { hue: 'Red', lightness: 'Dark', name: 'CT 7-8-9 [05/08 - 31/12/2026]' },
  ],
});

(function () {
  group('1. Giữ nguyên mọi thứ không liên quan (ghi TOÀN PHẦN)');
  {
    const raw = COT();
    const { def } = themLuaChon(raw, 'Tết 2027');
    ok('giữ default_value', JSON.stringify(def.default_value) === '["Operate"]',
      JSON.stringify(def.default_value));
    ok('giữ tên cột', def.name === 'Campain');
    ok('giữ kiểu cột', def.type === 'select');
    ok('giữ multiple', def.multiple === false);
    /* id đi trong URL, không nằm trong thân — gửi kèm thì Lark từ chối. */
    ok('bỏ id ra khỏi thân', !('id' in def));
    ok('không sửa vào object gốc', raw.options.length === 3, 'gốc có ' + raw.options.length);
  }

  group('2. Lựa chọn mới nối vào cuối, màu lấy từ bảng màu đang dùng');
  {
    const { def, options } = themLuaChon(COT(), 'Tết 2027');
    ok('thêm đúng một mục', def.options.length === 4);
    ok('mục mới ở cuối', def.options[3].name === 'Tết 2027');
    ok('ba mục cũ còn nguyên thứ tự',
      def.options.slice(0, 3).map((o) => o.name).join('|') === 'ITE|Operate|CT 7-8-9 [05/08 - 31/12/2026]');
    /* Tự bịa tên màu là đánh cược với bảng màu của Lark; lấy lại màu cột đang
     * dùng thì chắc chắn hợp lệ. */
    const dungSan = COT().options.some((o) => o.hue === def.options[3].hue);
    ok('màu mới lấy từ màu cột đang dùng', dungSan, def.options[3].hue);
    ok('trả về danh sách tên đầy đủ', options.length === 4 && options[3] === 'Tết 2027');
  }

  group('3. Cột chưa có màu nào thì để Lark tự chọn');
  {
    const raw = Object.assign(COT(), { options: [] });
    const { def } = themLuaChon(raw, 'Đầu tiên');
    ok('không bịa hue khi không có mẫu', !('hue' in def.options[0]),
      JSON.stringify(def.options[0]));
    ok('vẫn thêm được mục đầu tiên', def.options[0].name === 'Đầu tiên');
  }

  group('4. Trùng tên: trả về cái đang có, KHÔNG ghi lại');
  {
    const y = themLuaChon(COT(), 'Operate');
    ok('nhận ra trùng y hệt', y.daCo === true);
    ok('không dựng def (khỏi gọi Lark)', y.def === null);

    /* Người ta gõ lại một chiến dịch đã có gần như lần nào cũng xảy ra. Báo
     * lỗi là sai: ý họ là "tôi muốn dùng cái này", và họ đã có nó. */
    ok('bỏ qua hoa/thường', themLuaChon(COT(), 'operate').daCo === true);
    ok('bỏ qua khoảng trắng hai đầu', themLuaChon(COT(), '  Operate  ').daCo === true);
    ok('gộp khoảng trắng giữa chừng',
      themLuaChon(COT(), 'CT   7-8-9   [05/08 - 31/12/2026]').daCo === true);
    ok('trả về ĐÚNG tên đang có trong Base, không phải tên vừa gõ',
      themLuaChon(COT(), 'operate').ten === 'Operate');

    ok('tên khác thì vẫn là thêm mới', themLuaChon(COT(), 'Operate 2').daCo === false);
  }

  group('5. Dấu tiếng Việt là chữ khác nhau');
  {
    /* "Tết" và "Tet" là hai chiến dịch khác nhau — đừng gộp. Gộp dấu lại thì
     * hai chiến dịch thật sự khác nhau bị coi là một. */
    const raw = COT();
    raw.options.push({ name: 'Tết 2027', hue: 'Blue', lightness: 'Light' });
    ok('"Tet" không bị coi là trùng "Tết"', themLuaChon(raw, 'Tet 2027').daCo === false);
    ok('"tết" (thường) vẫn là trùng "Tết"', themLuaChon(raw, 'tết 2027').daCo === true);
  }

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\nKhông đạt:'); fails.forEach((f) => console.log('  · ' + f)); }
  process.exitCode = fail ? 1 : 0;
})();
