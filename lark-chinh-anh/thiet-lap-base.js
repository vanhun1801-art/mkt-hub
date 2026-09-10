'use strict';
/**
 * Dựng Base "Chỉnh ảnh & Edit video" một lần rồi in ra ID thật để dán vào config.js.
 *
 * Giữ file này trong repo vì ba app trước không giữ, và mỗi lần cần dựng lại Base
 * (đổi tenant, tách base cho chi nhánh khác) là lại phải ngồi nhớ lại từng field.
 *
 *   node thiet-lap-base.js            # tạo mới, in ID
 *   node thiet-lap-base.js --dry-run  # chỉ in payload
 *
 * Vì sao chạy bằng Node chứ không gõ lệnh CLI trực tiếp: tên bảng/cột có tiếng
 * Việt, truyền qua Git Bash / cmd rất dễ hỏng dấu. execFile của Node giữ nguyên
 * UTF-8 — đúng cách bốn app kia đang gọi lark-cli.
 */
const { execFile } = require('child_process');
const path = require('path');

const npmRoot = process.env.LARK_NPM_ROOT ||
  path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData/Roaming'), 'npm/node_modules');
const CLI = process.env.LARK_CLI_SCRIPT || path.join(npmRoot, '@larksuite/cli/scripts/run.js');
const DRY = process.argv.includes('--dry-run');

/* 800004135 = "OpenAPIAddTable limited": dựng 4 bảng liền tay là chạm hạn mức.
 * Chờ rồi thử lại, vì nửa Base dựng dở khó dọn hơn là đợi mấy giây. */
const HAN_MUC = [800004135, 1254291, 99991400];
const cho = (ms) => new Promise((r) => setTimeout(r, ms));

async function cli(args, lan = 5) {
  for (let i = 0; ; i++) {
    try { return await cliOnce(args); }
    catch (e) {
      if (i >= lan - 1 || !HAN_MUC.some((c) => e.message.includes(String(c)))) throw e;
      const giay = 5 * (i + 1);
      console.log(`  (hạn mức API — chờ ${giay}s rồi thử lại)`);
      await cho(giay * 1000);
    }
  }
}

function cliOnce(args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args, '--as', 'user', '--format', 'json'],
      { timeout: 120000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const raw = String(stdout || '');
        let j = null;
        const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
        if (s >= 0 && e > s) { try { j = JSON.parse(raw.slice(s, e + 1)); } catch (_) {} }
        if (j && j.ok === false) return reject(new Error(JSON.stringify(j.error || j)));
        if (err && !j) return reject(new Error((stderr || err.message || raw).slice(0, 900)));
        resolve(j ? (j.data ?? {}) : {});
      });
  });
}

/* ---------------- schema ---------------- */

/** Danh mục Tour — bảng đầu tiên, vì bảng Báo cáo có cột link trỏ vào đây. */
const TOUR_FIELDS = [
  { name: 'Tên Tour', type: 'text' },
  { name: 'Thư mục Drive', type: 'text', style: { type: 'url' } },
  { name: 'Nhóm', type: 'select', multiple: false, options: [
    { name: 'Tour', hue: 'Blue' },
    { name: 'Điểm đến', hue: 'Turquoise' },
    { name: 'Dịch vụ', hue: 'Orange' },
    { name: 'Nội bộ', hue: 'Gray' },
  ] },
  { name: 'Thứ tự', type: 'number', style: { type: 'plain', precision: 0 } },
  { name: 'Đang dùng', type: 'checkbox' },
  { name: 'Ghi chú', type: 'text' },
];

/* Lấy đúng theo thư mục Drive "1.MEDIA NEW" anh Hùng gửi. Bỏ số thứ tự đầu tên
 * để hiển thị gọn; thứ tự giữ trong cột Thứ tự. */
const TOURS = [
  ['TOUR ĐẢO', 'Tour', 1],
  ['LAND TOUR', 'Tour', 2],
  ['RẠCH VẸM', 'Điểm đến', 3],
  ['GRAND WORLD', 'Điểm đến', 4],
  ['MARKETING', 'Nội bộ', 5],
  ['DỊCH VỤ MEDIA ĐẢO', 'Dịch vụ', 6],
  ['GOPRO', 'Dịch vụ', 7],
  ['THUÊ MEDIA', 'Dịch vụ', 8],
  ['KHÁCH SẠN', 'Điểm đến', 9],
  ['PHÁO HOA', 'Điểm đến', 10],
  ['SỰ KIỆN', 'Điểm đến', 11],
  ['BỘ MẪU ẢNH', 'Nội bộ', 12],
  ['MẪU MEDIA', 'Nội bộ', 13],
  ['KHÁC', 'Nội bộ', 99],
];

const baoCaoFields = (tourTableId) => [
  /* Cột chính là TÊN THƯ MỤC đúng quy ước "<Tour> - <Loại> - <ngày>", để mở Base
   * ra là đọc được ngay, không phải cột khoá máy móc như ba app đồng bộ. */
  { name: 'Tên thư mục', type: 'text' },
  { name: '⚙️ Khoá', type: 'text', description: 'tour|loại|ngày — chống báo cáo trùng. App tự ghi.' },
  { name: 'Ngày tác nghiệp', type: 'datetime', style: { format: 'yyyy-MM-dd' } },
  { name: 'Tour', type: 'link', link_table: tourTableId },
  { name: 'Tên Tour', type: 'text', description: 'Sao lại từ Danh mục Tour để nhóm/lọc ngay trên Base.' },
  { name: 'Loại', type: 'select', multiple: false, options: [
    { name: 'Ghép', hue: 'Blue' },
    { name: 'VIP', hue: 'Carmine' },
    { name: 'Khác', hue: 'Gray' },
  ] },
  { name: 'Hạng mục', type: 'select', multiple: true, options: [
    { name: 'Chỉnh ảnh', hue: 'Turquoise' },
    { name: 'Edit video', hue: 'Purple' },
  ] },
  { name: 'Link ảnh', type: 'text', style: { type: 'url' }, description: 'Thư mục Google Photos đã chỉnh.' },
  { name: 'Link video', type: 'text', style: { type: 'url' }, description: 'Thư mục Google Drive chứa video đã edit.' },
  { name: 'Số ảnh', type: 'number', style: { type: 'plain', precision: 0 } },
  { name: 'Số video', type: 'number', style: { type: 'plain', precision: 0 } },
  { name: 'Người thực hiện', type: 'user', multiple: true },
  { name: 'Ghi chú', type: 'text' },
  { name: 'Trạng thái', type: 'select', multiple: false, default_value: ['Chờ nghiệm thu'], options: [
    { name: 'Chờ nghiệm thu', hue: 'Yellow' },
    { name: 'Đạt', hue: 'Green' },
    { name: 'Cần sửa lại', hue: 'Red' },
  ] },
  { name: 'Người nghiệm thu', type: 'user', multiple: false },
  { name: 'Nghiệm thu lúc', type: 'datetime', style: { format: 'yyyy-MM-dd HH:mm' } },
  { name: 'Nhận xét nghiệm thu', type: 'text' },
  { name: 'Đã gửi nhóm', type: 'checkbox' },
  { name: 'Gửi lúc', type: 'datetime', style: { format: 'yyyy-MM-dd HH:mm' } },
  { name: 'Báo cáo lúc', type: 'created_at', style: { format: 'yyyy-MM-dd HH:mm' } },
  { name: 'Cập nhật', type: 'updated_at', style: { format: 'yyyy-MM-dd HH:mm' } },
];

const nhatKyFields = (baoCaoTableId) => [
  { name: 'Lúc', type: 'text', description: 'ISO — cột chính, để mỗi lần gửi là một dòng riêng.' },
  { name: 'Nhóm chat', type: 'text' },
  { name: 'Báo cáo', type: 'link', link_table: baoCaoTableId },
  { name: 'Kết quả', type: 'select', multiple: false, options: [
    { name: 'Thành công', hue: 'Green' },
    { name: 'Thất bại', hue: 'Red' },
  ] },
  { name: 'Mã tin', type: 'text' },
  { name: 'Nội dung', type: 'text' },
  { name: 'Thông báo', type: 'text' },
];

const CAI_DAT_FIELDS = [
  { name: 'Khoá', type: 'text' },
  { name: 'Giá trị', type: 'text' },
  { name: 'Ghi chú', type: 'text' },
];

/* ---------------- chạy ---------------- */

async function main() {
  if (DRY) {
    console.log(JSON.stringify({ TOUR_FIELDS, baoCao: baoCaoFields('<tour>'), nhatKy: nhatKyFields('<bc>'), CAI_DAT_FIELDS }, null, 2));
    return;
  }

  /* Cho phép chạy lại khi bước sau vỡ: --base-token <token> thì dùng Base đã có
   * thay vì đẻ thêm một Base rỗng nữa. */
  const iTok = process.argv.indexOf('--base-token');
  let baseToken = iTok > 0 ? process.argv[iTok + 1] : '';

  if (!baseToken) {
  console.log('Tạo Base…');
  const base = await cli(['base', '+base-create',
    '--name', 'Chỉnh ảnh & Edit video — Rooty Trip',
    '--time-zone', 'Asia/Shanghai',
    '--table-name', 'Danh mục Tour',
    '--fields', JSON.stringify(TOUR_FIELDS)]);
    baseToken = base.base?.base_token || base.app?.app_token || base.app_token || base.base_token;
    if (!baseToken) throw new Error('Không lấy được base_token: ' + JSON.stringify(base).slice(0, 500));
  }
  console.log('  base_token = ' + baseToken);

  const B = ['--base-token', baseToken];

  /* Dùng lại bảng đã có thay vì tạo trùng — chạy lại script phải an toàn, lần
   * đầu đã bị hạn mức API chặn đúng ở bảng thứ tư. */
  let dsBang = (await cli(['base', '+table-list', ...B])).tables || [];
  const idBang = (ten) => (dsBang.find((t) => t.name === ten) || {}).id;
  async function bang(ten, fields) {
    const co = idBang(ten);
    if (co) { console.log(`  ${ten} = ${co} (đã có)`); return co; }
    console.log(`Tạo bảng ${ten}…`);
    const r = await cli(['base', '+table-create', ...B, '--name', ten, '--fields', JSON.stringify(fields)]);
    const id = r.table?.id || r.table_id || r.id;
    if (!id) throw new Error('Không lấy được table id của ' + ten + ': ' + JSON.stringify(r).slice(0, 400));
    dsBang = (await cli(['base', '+table-list', ...B])).tables || [];
    console.log(`  ${ten} = ${id}`);
    return id;
  }

  const tourId = idBang('Danh mục Tour');
  if (!tourId) throw new Error('Không thấy bảng Danh mục Tour: ' + JSON.stringify(dsBang).slice(0, 400));
  console.log('  Danh mục Tour = ' + tourId);

  const bcId = await bang('Báo cáo sản phẩm', baoCaoFields(tourId));
  const nkId = await bang('Nhật ký gửi tin', nhatKyFields(bcId));
  const cdId = await bang('Cài đặt', CAI_DAT_FIELDS);

  const soTour = (dsBang.find((t) => t.id === tourId) || {}).records_count || 0;
  if (soTour) {
    console.log(`Danh mục Tour đã có ${soTour} dòng — không nạp lại.`);
  } else {
    console.log('Nạp danh mục Tour…');
    const names = ['Tên Tour', 'Nhóm', 'Thứ tự', 'Đang dùng'];
    await cli(['base', '+record-batch-create', ...B, '--table-id', tourId,
      '--json', JSON.stringify({ fields: names, rows: TOURS.map(([t, n, i]) => [t, n, i, true]) })]);
  }

  console.log('\n--- Field ID thật (dán vào config.js) ---');
  for (const [ten, id] of [['Danh mục Tour', tourId], ['Báo cáo sản phẩm', bcId],
    ['Nhật ký gửi tin', nkId], ['Cài đặt', cdId]]) {
    const fl = await cli(['base', '+field-list', ...B, '--table-id', id]);
    console.log(`\n${ten}  (${id})`);
    (fl.fields || fl.items || []).forEach((f) => {
      console.log(`  ${f.id || f.field_id}  ${f.type}  ${f.name || f.field_name}`);
    });
  }
  console.log('\nBase: https://rootytrip2.sg.larksuite.com/base/' + baseToken);
}

main().catch((e) => { console.error('LỖI: ' + e.message); process.exitCode = 1; });
