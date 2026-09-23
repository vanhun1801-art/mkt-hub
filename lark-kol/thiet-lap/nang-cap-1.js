'use strict';
/**
 * Nâng cấp Base KOL lần 1 (23/09/2026) — theo góp ý của anh Hùng sau lượt test:
 *   - Hợp tác: lịch sử bước (để lùi bước), theo dõi thư trả lời của BGĐ / KOL
 *   - Hạng mục: trạng thái xin FOC với đối tác
 *   - Bàn giao: chọn kênh đăng từ bảng Kênh của KOL, "Trả cho đối tác"
 *   - Bảng mới "Đối tác": email + người liên hệ để soạn thư xin FOC
 *   - Đổi tên bước: "Đã tạo dịch vụ" → "Đã tạo tour Tourwell", "Chờ bàn giao" → "Chờ nhận sản phẩm"
 *
 * Chạy lại được: cột/bảng đã có thì bỏ qua.
 *   node thiet-lap/nang-cap-1.js          (in việc sẽ làm)
 *   node thiet-lap/nang-cap-1.js --that   (làm thật)
 */
const cfg = require('../config');
const lark = require('../lark');

const THAT = process.argv.includes('--that');
const chon = (...ten) => ({ options: ten.map((name) => ({ name })) });
const GIO = { style: { format: 'yyyy-MM-dd HH:mm' } };
const B = cfg.baseToken;

const COT = {
  [cfg.bang.hopTac]: [
    { type: 'text', name: 'Lịch sử bước', description: 'Mỗi dòng một lần đổi bước — app ghi, dùng để lùi bước khi bấm nhầm.' },
    { type: 'checkbox', name: 'Không tự chuyển', description: 'Bật khi anh lùi bước tay — bộ tự chuyển theo ngày đi/về sẽ không đẩy bước lên lại.' },
    { type: 'text', name: 'Thư BGĐ', description: 'thread_id của email trình BGĐ (Lark Mail) — app đọc thư trả lời.' },
    { type: 'text', name: 'Tiêu đề thư BGĐ' },
    { type: 'text', name: 'BGĐ trả lời', description: 'Đoạn đầu thư trả lời mới nhất của BGĐ.' },
    { type: 'datetime', name: 'BGĐ trả lời lúc', ...GIO },
    { type: 'text', name: 'Thư KOL', description: 'thread_id của thư mời KOL.' },
    { type: 'text', name: 'Tiêu đề thư mời' },
    { type: 'text', name: 'KOL trả lời' },
    { type: 'datetime', name: 'KOL trả lời lúc', ...GIO },
  ],
  [cfg.bang.hangMuc]: [
    { type: 'select', name: 'Xin FOC', ...chon('Không xin', 'Chưa xin', 'Đang xin', 'Đồng ý', 'Từ chối') },
    { type: 'datetime', name: 'Xin FOC lúc', ...GIO },
  ],
  [cfg.bang.banGiao]: [
    { type: 'link', name: 'Kênh đăng', link_table: cfg.bang.kenh },
    { type: 'text', name: 'Trả cho đối tác', description: 'Tên đối tác nhận sản phẩm này đổi lại FOC (Sun World, Vinpearl…).' },
  ],
};

const BANG_DOI_TAC = [
  { type: 'text', name: 'Tên đối tác' },
  { type: 'text', name: 'Email', style: { type: 'email' } },
  { type: 'text', name: 'CC', description: 'Email CC, cách nhau bằng dấu phẩy.' },
  { type: 'text', name: 'Người liên hệ' },
  { type: 'text', name: 'SĐT' },
  { type: 'text', name: 'Ghi chú' },
];

(async () => {
  const bang = await lark.cli(['base', '+table-list', '--as', 'user', '--base-token', B, '--format', 'json']);
  const dsBang = bang.tables || bang.items || [];
  const coBang = dsBang.find((t) => t.name === 'Đối tác');
  for (const [tid, ds] of Object.entries(COT)) {
    const co = new Set((await lark.listFields(tid)).map((f) => f.name || f.field_name));
    for (const f of ds) {
      if (co.has(f.name)) { console.log('  có sẵn  ' + tid + ' · ' + f.name); continue; }
      console.log((THAT ? '  thêm    ' : '  sẽ thêm ') + tid + ' · ' + f.name);
      if (THAT) await lark.cli(['base', '+field-create', '--as', 'user', '--base-token', B, '--table-id', tid, '--json', JSON.stringify(f)]);
    }
  }
  if (coBang) console.log('  có sẵn  bảng Đối tác = ' + (coBang.table_id || coBang.id));
  else {
    console.log((THAT ? '  tạo' : '  sẽ tạo') + ' bảng Đối tác');
    if (THAT) {
      const t = await lark.cli(['base', '+table-create', '--as', 'user', '--base-token', B, '--name', 'Đối tác',
        '--fields', JSON.stringify(BANG_DOI_TAC), '--format', 'json']);
      console.log('    id = ' + (t.table_id || (t.table && (t.table.table_id || t.table.id))));
    }
  }

  /* Đổi tên bước: ghi giá trị mới vào bản ghi (Base tự thêm lựa chọn mới). Lựa chọn
   * cũ còn nằm trong cột nhưng không bản ghi nào dùng. */
  const DOI = { 'Đã tạo dịch vụ': 'Đã tạo tour Tourwell', 'Chờ bàn giao': 'Chờ nhận sản phẩm' };
  const fl = await lark.listFields(cfg.bang.hopTac);
  const idBuoc = (fl.find((f) => (f.name || f.field_name) === 'Bước') || {}).id;
  const ds = await lark.listAllRecords(cfg.bang.hopTac);
  const sua = {};
  for (const r of ds) {
    const v = [].concat(r.cells[idBuoc] || [])[0];
    if (DOI[v]) sua[r.record_id] = { 'Bước': DOI[v] };
  }
  console.log('  đổi tên bước cho ' + Object.keys(sua).length + ' hợp tác');
  if (THAT && Object.keys(sua).length) await lark.updateMany(sua, cfg.bang.hopTac);
  if (!THAT) console.log('\nTHỬ — chưa ghi gì. Thêm --that để làm thật.');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
