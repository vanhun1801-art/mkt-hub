/**
 * Chỗ đã đẻ ra 10.537 dòng trùng, và cái chắn để nó không quay lại.
 *
 * Chuyện đã xảy ra (đo trên Base thật ngày 18/09/2026):
 *
 *   tổng dòng bảng "Báo cáo Sales"   12.000
 *   mã đơn THẬT                       1.463
 *   dòng dư ra                       10.537
 *   doanh thu đang cộng      100.228.412.635đ
 *   doanh thu THẬT            12.879.991.640đ   -> thổi 7,78 lần
 *   một mã lặp tới ×16
 *
 * Nguyên nhân: đọc `r.fields[...]` trong khi cả lark.js (lark-cli) lẫn
 * larkapi.js (tenant token) đều trả bản ghi dạng `{ id, c }`. Nên mã đơn luôn
 * rỗng, bản đồ "đã có trên Base" luôn rỗng, và mọi lượt ghi công đều tưởng
 * "chưa từng ghi" rồi TẠO dòng mới cho toàn bộ đơn.
 *
 * Không có lỗi nào hiện ra. Chỉ có bảng phình lên và doanh thu công ty thổi
 * theo — mà doanh thu công ty lại là mẫu số của "tỉ lệ đến từ quảng cáo".
 *
 * Chú thích trong sync/ghicongtudong.js đã ghi: "Test không bắt được vì test
 * không đọc thật từ Lark — nhớ khi viết test mới cho khối này." Đây là cái đó.
 */
const path = require('path');
const fs = require('fs');
const { banDoMaDon } = require('../sync/ghicongtudong');
const cfg = require('../config');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const F = cfg.tables.sales.f;

console.log('— đọc mã đơn từ bản ghi Base, ĐÚNG hình dạng thật');
{
  /* Hình dạng thật do lark.js và larkapi.js trả về: { id, c }. */
  const rows = [
    { id: 'rec1', c: { [F.orderCode]: 'RT16129', [F.revenue]: 1000 } },
    { id: 'rec2', c: { [F.orderCode]: 'RT16130', [F.revenue]: 2000 } },
  ];
  const m = banDoMaDon(rows, F);
  t('đọc ra đủ mã', m.size === 2, String(m.size));
  t('trỏ đúng record_id', m.get('RT16129') === 'rec1' && m.get('RT16130') === 'rec2');

  /* ĐÂY là phép kiểm quan trọng nhất của cả file. Bản hỏng đọc `r.fields` nên
   * với hình dạng thật thì map RỖNG — và map rỗng nghĩa là "chưa có gì trên
   * Base", nên mọi đơn đều được TẠO MỚI. 12.000 dòng ra đời như thế. */
  t('map KHÔNG được rỗng với hình dạng thật', m.size > 0);
}

console.log('— hình dạng SAI thì đừng âm thầm trả map rỗng');
{
  /* Nếu một ngày nào đó lớp dưới đổi sang `.fields`, hàm này sẽ trả map rỗng —
   * và hậu quả vẫn y như cũ. Không sửa được điều đó bằng code ở đây, nhưng phải
   * GHI LẠI rằng map rỗng là dấu hiệu nguy hiểm, không phải trạng thái bình
   * thường. Bên gọi đọc test này sẽ biết mà cảnh giác. */
  const saiHinh = [{ id: 'rec1', fields: { [F.orderCode]: 'RT16129' } }];
  const m = banDoMaDon(saiHinh, F);
  t('hình dạng .fields ra map rỗng (đúng cái đã cắn)', m.size === 0);

  /* Và hàm phải sống sót qua mọi thứ rác, không được ném: ném ở đây là cả lượt
   * ghi công chết, còn tệ hơn. */
  t('bản ghi thiếu c thì bỏ qua, không nổ', banDoMaDon([{ id: 'x' }], F).size === 0);
  t('mảng rỗng không nổ', banDoMaDon([], F).size === 0);
  t('null không nổ', banDoMaDon(null, F).size === 0);
  t('mã rỗng thì không vào map', banDoMaDon([{ id: 'x', c: { [F.orderCode]: '  ' } }], F).size === 0);
}

console.log('— mã đơn trùng trong chính Base: giữ MỘT record_id');
{
  /* Base đang có sẵn 1.037 mã bị trùng. Bản đồ phải cho ra đúng một record_id
   * mỗi mã, nếu không thì lượt ghi kế tiếp lại sửa lung tung. */
  const rows = [
    { id: 'recA', c: { [F.orderCode]: 'RT16129' } },
    { id: 'recB', c: { [F.orderCode]: 'RT16129' } },
    { id: 'recC', c: { [F.orderCode]: 'RT16129' } },
  ];
  const m = banDoMaDon(rows, F);
  t('ba dòng cùng mã chỉ ra một khoá', m.size === 1);
  t('và giữ record_id cuối cùng đọc được', m.get('RT16129') === 'recC', m.get('RT16129'));
}

console.log('— không còn chỗ nào đọc r.fields trong app');
{
  /* Chặn theo LỚP, không chỉ chặn một hàm: cùng loại lỗi có thể mọc lại ở bất
   * kỳ chỗ nào đọc bản ghi Base. */
  const goc = path.join(__dirname, '..');
  const tep = [];
  const quet = (thuMuc) => {
    fs.readdirSync(thuMuc, { withFileTypes: true }).forEach((e) => {
      if (e.name === 'node_modules' || e.name.startsWith('.')) return;
      const p = path.join(thuMuc, e.name);
      if (e.isDirectory()) { if (e.name !== 'test') quet(p); return; }
      if (e.name.endsWith('.js')) tep.push(p);
    });
  };
  quet(goc);

  const pham = [];
  tep.forEach((p) => {
    const src = fs.readFileSync(p, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    /* `r.fields[` hoặc `.fields[F.` — dấu hiệu đọc bản ghi Base sai hình dạng.
     * Bỏ chú thích trước khi dò, vì chính lời giải thích về lỗi có nhắc tên đó. */
    if (/\.fields\s*\[/.test(src)) pham.push(path.relative(goc, p));
  });
  t('không tệp nào đọc bản ghi bằng .fields[...]', pham.length === 0, pham.join(', '));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
