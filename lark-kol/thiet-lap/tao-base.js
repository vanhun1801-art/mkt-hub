'use strict';
/**
 * Dựng Base "KOL · Hợp tác truyền thông" từ con số không, kèm ca mẫu Châu Kim Cương.
 *
 * Sáu bảng:
 *   KOL              — một người (một KOL hợp tác được nhiều lần)
 *   Kênh             — một kênh của một KOL (bao nhiêu kênh thì bấy nhiêu dòng)
 *   Dịch vụ đối tác  — khách sạn, nhà hàng… KHÔNG có trong Base Sản phẩm
 *   Hợp tác          — một chuyến; trục của quy trình (cột Bước)
 *   Hạng mục         — một dòng bảng kê chi phí, kiêm một mốc lịch trình (Giờ hẹn)
 *   Bàn giao         — một sản phẩm KOL cam kết, kèm số đo 7 ngày và 30 ngày
 *
 * Thành tiền / Giá trị quy đổi / tổng của Hợp tác do APP tính và ghi, không dùng
 * formula — quy tắc tiền nằm một chỗ (lark-kol/tinh.js), Base chỉ là kho.
 *
 * Chạy: node thiet-lap/tao-base.js          (in ra việc sẽ làm, KHÔNG ghi)
 *       node thiet-lap/tao-base.js --that   (tạo thật)
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const THAT = process.argv.includes('--that');

function cliScript() {
  const rel = path.join('node_modules', '@larksuite', 'cli', 'scripts', 'run.js');
  const roots = [
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    '/usr/local/lib', '/usr/lib',
  ];
  for (const r of roots) { const p = path.join(r, rel); if (fs.existsSync(p)) return p; }
  throw new Error('Không tìm thấy lark-cli');
}

function cli(args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cliScript(), ...args],
      { timeout: 120000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const raw = String(stdout || '').trim();
        let j = null;
        const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
        if (s >= 0 && e > s) { try { j = JSON.parse(raw.slice(s, e + 1)); } catch (_) {} }
        if (j && j.ok === false) return reject(new Error(JSON.stringify(j.error)));
        if (err && !j) return reject(new Error((stderr || err.message || '').slice(0, 600)));
        resolve((j && j.data) || {});
      });
  });
}

const chon = (...ten) => ({ options: ten.map((name) => ({ name })) });
const nhieu = (...ten) => ({ multiple: true, ...chon(...ten) });
const VND = { style: { type: 'currency', precision: 0, currency_code: 'VND' } };
const SO = { style: { type: 'plain', precision: 0, thousands_separator: true } };
const NGAY = { style: { format: 'yyyy-MM-dd' } };
const GIO = { style: { format: 'yyyy-MM-dd HH:mm' } };
const NEN_TANG = ['TikTok', 'Facebook', 'YouTube', 'Instagram', 'Threads', 'Zalo', 'Khác'];

/* ---------------------------------------------------------------- KOL */
const KOL = [
  { type: 'text', name: 'Tên KOL' },
  { type: 'select', name: 'Tình trạng', ...chon('Tiềm năng', 'Đang trao đổi', 'Đã hợp tác', 'Không phù hợp') },
  { type: 'select', name: 'Quốc gia', ...chon('Việt Nam', 'Hàn Quốc', 'Nhật Bản', 'Trung Quốc', 'Đài Loan',
    'Thái Lan', 'Singapore', 'Malaysia', 'Philippines', 'Ấn Độ', 'Nga', 'Mỹ', 'Úc', 'Anh', 'Pháp', 'Đức', 'Khác') },
  { type: 'text', name: 'Mã vùng', description: 'Tự suy từ Quốc gia (+84, +82…). Sửa tay nếu KOL dùng số nước khác.' },
  { type: 'text', name: 'Số điện thoại', style: { type: 'phone' }, description: 'Dạng quốc tế, ví dụ +84778866707.' },
  { type: 'text', name: 'Email', style: { type: 'email' } },
  { type: 'text', name: 'Liên hệ khác', description: 'Zalo, WhatsApp, Line, quản lý của KOL…' },
  { type: 'select', name: 'Nguồn', ...chon('Tìm trên TikTok', 'Tìm trên Facebook', 'Tìm trên Instagram',
    'Tìm trên YouTube', 'Được giới thiệu', 'KOL tự liên hệ', 'Agency', 'Khác') },
  { type: 'select', name: 'Lĩnh vực', ...nhieu('Gia đình', 'Du lịch', 'Ẩm thực', 'Review', 'Lifestyle',
    'Giải trí', 'Làm đẹp', 'Khác') },
  { type: 'number', name: 'Tổng theo dõi', ...SO, description: 'App cộng từ bảng Kênh.' },
  { type: 'number', name: 'Đánh giá', style: { type: 'rating', icon: 'star', min: 1, max: 5 },
    description: 'Chấm sau khi hợp tác: đúng hẹn, chất lượng nội dung, hiệu quả.' },
  { type: 'text', name: 'Ghi chú' },
];

/* ---------------------------------------------------------------- Kênh */
const KENH = [
  { type: 'text', name: 'Tên kênh' },
  { type: 'link', name: 'KOL', link_table: 'KOL', bidirectional: true, bidirectional_link_field_name: 'Kênh' },
  { type: 'select', name: 'Nền tảng', ...chon(...NEN_TANG) },
  { type: 'text', name: 'Link', style: { type: 'url' } },
  { type: 'number', name: 'Lượt theo dõi', ...SO },
  { type: 'datetime', name: 'Cập nhật số lúc', ...NGAY },
  { type: 'checkbox', name: 'Chỉ re-up', description: 'Kênh chỉ đăng lại nội dung, không phải kênh chính.' },
];

/* ---------------------------------------------------------------- Dịch vụ đối tác */
const DICH_VU = [
  { type: 'text', name: 'Tên dịch vụ' },
  { type: 'select', name: 'Loại', ...chon('Lưu trú', 'Ăn uống', 'Vé tham quan', 'Tour', 'Di chuyển', 'Khác') },
  { type: 'text', name: 'Nhà cung cấp' },
  { type: 'select', name: 'Đơn vị tính', ...chon('Người', 'Phòng/đêm', 'Suất', 'Chuyến', 'Vé') },
  { type: 'number', name: 'Giá công bố NL', ...VND },
  { type: 'number', name: 'Giá công bố TE', ...VND },
  { type: 'number', name: 'Giá công bố EB', ...VND },
  { type: 'number', name: 'Giá net NL', ...VND },
  { type: 'number', name: 'Giá net TE', ...VND },
  { type: 'number', name: 'Giá net EB', ...VND },
  { type: 'checkbox', name: 'Thường FOC', description: 'Đối tác hay tài trợ miễn phí cho KOL.' },
  { type: 'text', name: 'Người liên hệ' },
  { type: 'text', name: 'SĐT liên hệ' },
  { type: 'text', name: 'Địa chỉ' },
  { type: 'checkbox', name: 'Đang dùng' },
  { type: 'text', name: 'Ghi chú' },
];

/* ---------------------------------------------------------------- Hợp tác */
const BUOC = ['Đang trao đổi', 'Chờ BGĐ duyệt', 'BGĐ đã duyệt', 'Đã mời KOL', 'KOL đã xác nhận',
  'Đã tạo dịch vụ', 'Đang đi tour', 'Chờ bàn giao', 'Hoàn tất', 'Huỷ'];
const HOP_TAC = [
  { type: 'text', name: 'Mã hợp tác', description: 'KOL-YYYY-NNN' },
  { type: 'link', name: 'KOL', link_table: 'KOL', bidirectional: true, bidirectional_link_field_name: 'Hợp tác' },
  { type: 'select', name: 'Bước', ...chon(...BUOC) },
  { type: 'number', name: 'Người lớn', ...SO, description: 'Từ 1m40 trở lên.' },
  { type: 'number', name: 'Trẻ em', ...SO, description: 'Từ 1m đến 1m39 — tính giá trẻ em.' },
  { type: 'number', name: 'Em bé', ...SO, description: 'Dưới 1m.' },
  { type: 'datetime', name: 'Ngày bắt đầu', ...NGAY },
  { type: 'datetime', name: 'Ngày kết thúc', ...NGAY },
  { type: 'text', name: 'Kênh đăng tải', description: 'Kênh KOL cam kết đăng, ví dụ TikTok Mẹ ZinZon + re-up Fanpage.' },
  { type: 'text', name: 'Yêu cầu nội dung', description: 'Nhắc tên, CTA, gắn thẻ, hashtag…' },
  { type: 'number', name: 'Tiền công ty chi', ...VND, description: 'App tính: tổng Thành tiền các hạng mục Công ty chi.' },
  { type: 'number', name: 'Giá trị FOC', ...VND, description: 'App tính: giá công bố của các hạng mục đối tác tài trợ.' },
  { type: 'number', name: 'Giá trị quy đổi', ...VND, description: 'App tính: tổng giá công bố mọi hạng mục — giá trị KOL thực nhận.' },
  { type: 'datetime', name: 'Trình BGĐ lúc', ...GIO },
  { type: 'text', name: 'Người duyệt' },
  { type: 'select', name: 'Kênh duyệt', ...chon('Email', 'Lark') },
  { type: 'datetime', name: 'Duyệt lúc', ...GIO },
  { type: 'text', name: 'Ý kiến BGĐ' },
  { type: 'datetime', name: 'Gửi thư mời lúc', ...GIO },
  { type: 'datetime', name: 'KOL xác nhận lúc', ...GIO },
  { type: 'text', name: 'Mã đơn Tourwell', description: 'RTxxxxx — đơn "Dịch vụ khác", phải loại khỏi ROAS.' },
  { type: 'select', name: 'Trạng thái Tourwell', ...chon('Chưa tạo', 'Đang xử lý', 'Thành công', 'Đã gửi điều hành') },
  { type: 'number', name: 'Tổng lượt xem', ...SO, description: 'App cộng lượt xem mốc mới nhất của các bài bàn giao.' },
  { type: 'text', name: 'Lý do huỷ' },
  { type: 'text', name: 'Ghi chú' },
];

/* ---------------------------------------------------------------- Hạng mục */
const HANG_MUC = [
  { type: 'text', name: 'Tên hạng mục' },
  { type: 'link', name: 'Hợp tác', link_table: 'Hợp tác', bidirectional: true, bidirectional_link_field_name: 'Hạng mục' },
  { type: 'select', name: 'Nhóm', ...chon('Tour', 'Ăn uống', 'Lưu trú', 'Vé tham quan', 'Di chuyển', 'Khác') },
  { type: 'datetime', name: 'Ngày dùng', ...NGAY },
  { type: 'datetime', name: 'Giờ hẹn', ...GIO, description: 'Mốc lịch trình — bot nhắc trước giờ này.' },
  { type: 'text', name: 'Điểm hẹn' },
  { type: 'select', name: 'Nguồn dịch vụ', ...chon('Base Sản phẩm', 'Dịch vụ đối tác', 'Nhập tay') },
  { type: 'text', name: 'Mã dịch vụ', description: 'Mã sản phẩm bên Base Sản phẩm (chép lúc chốt).' },
  { type: 'link', name: 'Dịch vụ đối tác', link_table: 'Dịch vụ đối tác', bidirectional: true,
    bidirectional_link_field_name: 'Đã dùng ở' },
  { type: 'select', name: 'Loại khách', ...chon('Người lớn', 'Trẻ em', 'Em bé', 'Phòng', 'Xe/Chuyến', 'Trọn gói') },
  { type: 'number', name: 'Số lượng', ...SO },
  { type: 'number', name: 'Đêm/Lượt', ...SO },
  { type: 'select', name: 'Hình thức chi', ...chon('Công ty chi', 'FOC đối tác', 'KOL tự trả') },
  { type: 'number', name: 'Đơn giá chi', ...VND, description: 'Tiền công ty trả thật mỗi đơn vị (giá net). FOC = 0.' },
  { type: 'number', name: 'Giá công bố', ...VND, description: 'Giá bán lẻ mỗi đơn vị — để quy đổi giá trị tài trợ.' },
  { type: 'number', name: 'VAT %', ...SO },
  { type: 'number', name: 'Thành tiền', ...VND, description: 'App tính: SL × Đêm/Lượt × Đơn giá chi.' },
  { type: 'number', name: 'Giá trị quy đổi', ...VND, description: 'App tính: SL × Đêm/Lượt × Giá công bố.' },
  { type: 'text', name: 'Nhà cung cấp' },
  { type: 'select', name: 'Tình trạng', ...chon('Chờ', 'Đã xong', 'Có sự cố', 'Huỷ') },
  { type: 'checkbox', name: 'Nhắc hẹn', description: 'Bot nhắn anh trước Giờ hẹn.' },
  { type: 'datetime', name: 'Đã nhắc lúc', ...GIO },
  { type: 'text', name: 'Tin nhắn nhắc', description: 'Để trống thì app tự soạn.' },
  { type: 'checkbox', name: 'Cần kiểm lại' },
  { type: 'text', name: 'Ghi chú' },
];

/* ---------------------------------------------------------------- Bàn giao */
const SO_DO = (moc) => [
  { type: 'number', name: 'Xem ' + moc, ...SO },
  { type: 'number', name: 'Thích ' + moc, ...SO },
  { type: 'number', name: 'Bình luận ' + moc, ...SO },
  { type: 'number', name: 'Chia sẻ ' + moc, ...SO },
  { type: 'number', name: 'Lưu ' + moc, ...SO },
  { type: 'datetime', name: 'Nhập số ' + moc + ' lúc', ...NGAY },
];
const BAN_GIAO = [
  { type: 'text', name: 'Sản phẩm' },
  { type: 'link', name: 'Hợp tác', link_table: 'Hợp tác', bidirectional: true, bidirectional_link_field_name: 'Bàn giao' },
  { type: 'text', name: 'Chủ đề', description: 'Cơ sở / chủ đề: Vinwonders, Hòn Thơm, Tour Rooty Trip…' },
  { type: 'select', name: 'Loại', ...chon('Video', 'Ảnh', 'Story', 'Bộ ảnh', 'Re-up', 'Livestream', 'Bài viết') },
  { type: 'select', name: 'Nền tảng', ...nhieu(...NEN_TANG) },
  { type: 'number', name: 'Số lượng', ...SO },
  { type: 'datetime', name: 'Hạn đăng', ...NGAY },
  { type: 'select', name: 'Trạng thái', ...chon('Chưa làm', 'Đã gửi nháp', 'Cần sửa', 'Đã đăng', 'Huỷ') },
  { type: 'datetime', name: 'Ngày đăng', ...NGAY },
  { type: 'text', name: 'Link bài', style: { type: 'url' } },
  { type: 'checkbox', name: 'Đủ gắn thẻ + hashtag' },
  { type: 'checkbox', name: 'Có nhắc tên + CTA' },
  ...SO_DO('7N'),
  ...SO_DO('30N'),
  { type: 'text', name: 'Ghi chú' },
];

/* ================================================================ ca mẫu */
/* Châu Kim Cương, 11–13/07/2026 — lấy từ email trình BGĐ (09/07), thư mời (30/07)
 * và bảng kê anh Hùng gửi. Số khách theo email: 4 NL + 2 TE (bảng kê từng tính
 * tour cho 4 TE). Ngày 12/07 đổi từ G4 sang Land 5 do sự cố. */
const MAU_DICH_VU = [
  ['Devesun — phòng gia đình', 'Lưu trú', 'Devesun', 'Phòng/đêm', 2100000, true],
  ['Nhà hàng Việt Xưa', 'Ăn uống', 'Việt Xưa', 'Suất', null, false],
  ['Nhà hàng Bò Tơ 68', 'Ăn uống', 'Bò Tơ 68', 'Suất', null, false],
];

const HM = (ten, nhom, ngay, gio, loai, sl, luot, hinhThuc, gia, extra = {}) =>
  ({ ten, nhom, ngay, gio, loai, sl, luot, hinhThuc, gia, ...extra });
const MAU_HANG_MUC = [
  HM('Tour ghép Cáp treo Hòn Thơm (Buffet) — Người lớn', 'Tour', '2026-07-11', null, 'Người lớn', 4, 1, 'FOC đối tác', 0),
  HM('Tour ghép Cáp treo Hòn Thơm (Buffet) — Trẻ em', 'Tour', '2026-07-11', null, 'Trẻ em', 2, 1, 'FOC đối tác', 0),
  HM('Lưu trú Devesun 11–13/07', 'Lưu trú', '2026-07-11', null, 'Phòng', 1, 2, 'Công ty chi', 2100000,
    { dv: 0, ghi: 'Bảng kê cũ ghi "11-12/07" nhưng tính 2 đêm — nhận 11/07, trả 13/07.' }),
  HM('Tour Land 5 — Người lớn', 'Tour', '2026-07-12', null, 'Người lớn', 4, 1, 'Công ty chi', 550000,
    { kiem: true, ghi: 'Đổi từ G4 sang Land 5 do sự cố. Bảng kê ghi "Tour ghép Cano 3 đảo" — kiểm lại có phải cùng tour.' }),
  HM('Tour Land 5 — Trẻ em', 'Tour', '2026-07-12', null, 'Trẻ em', 2, 1, 'Công ty chi', 275000,
    { kiem: true, ghi: 'Bảng kê cũ tính 4 trẻ em; email ghi 2 trẻ em.' }),
  HM('Ăn tối Việt Xưa — Người lớn', 'Ăn uống', '2026-07-12', null, 'Người lớn', 4, 1, 'FOC đối tác', 0,
    { dv: 1, kiem: true, ghi: 'Bảng kê cũ ghi 2 người lớn.' }),
  HM('Ăn tối Việt Xưa — Trẻ em', 'Ăn uống', '2026-07-12', null, 'Trẻ em', 2, 1, 'FOC đối tác', 0, { dv: 1 }),
  HM('Tour ghép Grand Vin — Người lớn', 'Tour', '2026-07-13', null, 'Người lớn', 4, 1, 'FOC đối tác', 0),
  HM('Tour ghép Grand Vin — Trẻ em', 'Tour', '2026-07-13', null, 'Trẻ em', 2, 1, 'FOC đối tác', 0),
  HM('Ăn tối Bò Tơ 68 — Người lớn', 'Ăn uống', '2026-07-13', null, 'Người lớn', 4, 1, 'FOC đối tác', 0, { dv: 2 }),
  HM('Ăn tối Bò Tơ 68 — Trẻ em', 'Ăn uống', '2026-07-13', null, 'Trẻ em', 2, 1, 'FOC đối tác', 0, { dv: 2 }),
];

const MAU_BAN_GIAO = [
  ['Video trải nghiệm Vinwonders + ăn tối Bò Tơ 68', 'Vinwonders', 'Video', 1],
  ['Ảnh check-in Vinwonders', 'Vinwonders', 'Ảnh', 1],
  ['Video trải nghiệm Hòn Thơm + Việt Xưa + Devesun', 'Hòn Thơm', 'Video', 1],
  ['Stories check-in gia đình tại Hòn Thơm', 'Hòn Thơm', 'Story', 2],
  ['Ảnh check-in Hòn Thơm', 'Hòn Thơm', 'Ảnh', 1],
  ['Video trải nghiệm Tour 3N2Đ Rooty Trip', 'Tour Rooty Trip Phú Quốc', 'Video', 1],
  ['Bộ ảnh check-in tổng hợp chuyến đi', 'Tour Rooty Trip Phú Quốc', 'Bộ ảnh', 1],
];

const ngay = (d) => (d ? d + ' 00:00:00' : null);
const idBang = (t) => t.table_id || (t.table && (t.table.table_id || t.table.id));
const idsBanGhi = (r) => r.record_id_list || (r.records || []).map((x) => x.record_id);
const lk = (id) => (id ? [{ id }] : null);

(async () => {
  if (!THAT) {
    console.log('THỬ — chưa ghi gì cả. Thêm --that để tạo thật.\n');
    for (const [ten, f] of [['KOL', KOL], ['Kênh', KENH], ['Dịch vụ đối tác', DICH_VU],
      ['Hợp tác', HOP_TAC], ['Hạng mục', HANG_MUC], ['Bàn giao', BAN_GIAO]]) {
      console.log('Bảng "' + ten + '" — ' + f.length + ' cột');
    }
    console.log('\nCa mẫu: 1 KOL · 3 kênh · ' + MAU_DICH_VU.length + ' dịch vụ đối tác · 1 hợp tác · ' +
      MAU_HANG_MUC.length + ' hạng mục · ' + MAU_BAN_GIAO.length + ' bàn giao');
    return;
  }

  const tiep = process.argv.includes('--tiep') ? process.argv[process.argv.indexOf('--tiep') + 1] : null;
  console.log('Tạo Base…');
  const base = tiep ? { base: { base_token: tiep } } : await cli(['base', '+base-create', '--as', 'user',
    '--name', 'KOL · Hợp tác truyền thông',
    /* Lark từ chối 'Asia/Ho_Chi_Minh'. Bangkok cùng UTC+7, không đổi giờ mùa. */
    '--time-zone', 'Asia/Bangkok',
    '--table-name', 'KOL',
    '--fields', JSON.stringify(KOL),
    '--format', 'json']);
  const token = base.app_token || (base.app && base.app.app_token) ||
    (base.base && (base.base.app_token || base.base.base_token));
  if (!token) throw new Error('Không lấy được base_token: ' + JSON.stringify(base).slice(0, 400));
  console.log('  base_token: ' + token);
  console.log('  url: ' + (base.url || (base.app && base.app.url) || (base.base && base.base.url) || ''));

  const B = { base: token };
  const tao = async (ten, fields) => {
    const t = await cli(['base', '+table-create', '--as', 'user', '--base-token', token,
      '--name', ten, '--fields', JSON.stringify(fields), '--format', 'json']);
    B[ten] = idBang(t);
    console.log('  ' + ten + ': ' + B[ten]);
  };
  await tao('Kênh', KENH);
  await tao('Dịch vụ đối tác', DICH_VU);
  await tao('Hợp tác', HOP_TAC);
  await tao('Hạng mục', HANG_MUC);
  await tao('Bàn giao', BAN_GIAO);

  const ghi = async (bang, fields, rows) => idsBanGhi(await cli(['base', '+record-batch-create', '--as', 'user',
    '--base-token', token, '--table-id', bang, '--json', JSON.stringify({ fields, rows })]));

  console.log('\nNhập ca mẫu Châu Kim Cương…');
  const [kol] = await ghi('KOL',
    ['Tên KOL', 'Tình trạng', 'Quốc gia', 'Mã vùng', 'Số điện thoại', 'Email', 'Nguồn', 'Lĩnh vực', 'Tổng theo dõi'],
    [['Châu Kim Cương', 'Đã hợp tác', 'Việt Nam', '+84', '+84778866707', 'chaukimcuong.tn@gmail.com',
      'Tìm trên TikTok', ['Gia đình', 'Du lịch'], 607000]]);
  await ghi(B['Kênh'], ['Tên kênh', 'KOL', 'Nền tảng', 'Lượt theo dõi', 'Cập nhật số lúc', 'Chỉ re-up'], [
    ['Mẹ ZinZon', lk(kol), 'TikTok', 520000, ngay('2026-07-09'), false],
    ['Gia Đình Mình Vui', lk(kol), 'Facebook', 87000, ngay('2026-07-09'), false],
    ["ZinZon's Family", lk(kol), 'Facebook', null, null, true],
  ]);
  const dv = await ghi(B['Dịch vụ đối tác'], ['Tên dịch vụ', 'Loại', 'Nhà cung cấp', 'Đơn vị tính', 'Giá net NL', 'Đang dùng'],
    MAU_DICH_VU.map((d) => [d[0], d[1], d[2], d[3], d[4], true]));

  const tien = MAU_HANG_MUC.reduce((s, h) => s + (h.hinhThuc === 'Công ty chi' ? h.sl * h.luot * h.gia : 0), 0);
  const [ht] = await ghi(B['Hợp tác'], ['Mã hợp tác', 'KOL', 'Bước', 'Người lớn', 'Trẻ em', 'Em bé',
    'Ngày bắt đầu', 'Ngày kết thúc', 'Kênh đăng tải', 'Yêu cầu nội dung', 'Tiền công ty chi',
    'Trình BGĐ lúc', 'Người duyệt', 'Kênh duyệt', 'Gửi thư mời lúc', 'Trạng thái Tourwell', 'Ghi chú'], [[
    'KOL-2026-001', lk(kol), 'Chờ bàn giao', 4, 2, 0, ngay('2026-07-11'), ngay('2026-07-13'),
    "TikTok: Mẹ ZinZon · Re-up Fanpage: ZinZon's Family",
    'Nhắc tên Rooty Trip trong video (voice + hình ảnh), có kêu gọi hành động đến Rooty Trip Phú Quốc. ' +
      'Gắn thẻ Rooty Trip Phú Quốc, hashtag #RootyTrip #RootyTripPhuQuoc + hashtag của cơ sở tài trợ.',
    tien, '2026-07-09 16:56:00', 'Phạm Quang Hậu', 'Email', '2026-07-30 10:48:00', 'Chưa tạo',
    'Nhập lại từ email + bảng kê cũ. Bảng kê cũ báo 7.500.000đ vì tính tour cho 4 trẻ em.',
  ]]);

  await ghi(B['Hạng mục'], ['Tên hạng mục', 'Hợp tác', 'Nhóm', 'Ngày dùng', 'Nguồn dịch vụ', 'Dịch vụ đối tác',
    'Loại khách', 'Số lượng', 'Đêm/Lượt', 'Hình thức chi', 'Đơn giá chi', 'Thành tiền', 'Tình trạng',
    'Cần kiểm lại', 'Ghi chú'], MAU_HANG_MUC.map((h) => [
    h.ten, lk(ht), h.nhom, ngay(h.ngay), h.dv != null ? 'Dịch vụ đối tác' : 'Nhập tay', h.dv != null ? lk(dv[h.dv]) : null,
    h.loai, h.sl, h.luot, h.hinhThuc, h.gia, h.sl * h.luot * h.gia, 'Đã xong', !!h.kiem, h.ghi || null,
  ]));

  await ghi(B['Bàn giao'], ['Sản phẩm', 'Hợp tác', 'Chủ đề', 'Loại', 'Nền tảng', 'Số lượng', 'Trạng thái'],
    MAU_BAN_GIAO.map((b) => [b[0], lk(ht), b[1], b[2], b[2] === 'Story' ? ['TikTok'] : ['TikTok', 'Facebook'], b[3], 'Chưa làm']));
  console.log('  Tiền công ty chi (theo 4 NL + 2 TE): ' + tien.toLocaleString('vi-VN') + 'đ');

  console.log('\nId thật của từng cột:');
  const bang = await cli(['base', '+table-list', '--as', 'user', '--base-token', token, '--format', 'json']);
  for (const t of (bang.tables || bang.items || [])) {
    const tid = t.table_id || t.id;
    console.log('  bảng ' + t.name + ' = ' + tid);
    const fl = await cli(['base', '+field-list', '--as', 'user', '--base-token', token,
      '--table-id', tid, '--format', 'json']);
    for (const f of (fl.fields || fl.items || [])) {
      console.log('    ' + (f.field_id || f.id) + '  ' + (f.field_name || f.name) + '  [' + f.type + ']');
    }
  }
  console.log('\nNHỚ: mời app Marketing Hub (cli_aa1a8ae21a78ded2) vào Base với quyền Quản lý, ' +
    'không thì bản trên Render báo 91403.');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
