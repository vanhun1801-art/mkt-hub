'use strict';
/**
 * ============================================================================
 * BÁO CÁO QUỸ — ba lối ra, một bộ số
 * ============================================================================
 *
 *   xuatXlsx(r)    tệp .xlsx đính kèm email, kế toán mở ra đối chiếu
 *   htmlBaoCao(r)  bản đầy đủ — mở ra xem, In → Lưu PDF
 *   htmlEmail(r)   thân email đề xuất nhập quỹ gửi Ban Giám Đốc
 *
 * Cả ba ăn CÙNG MỘT object từ bao-cao.js. Dựng số ở ba chỗ riêng là ba chỗ
 * lệch nhau sau vài lần sửa — mà lệch ở đây là Sếp đọc một con số, kế toán mở
 * tệp ra thấy con số khác.
 *
 * KHÔNG tự sinh PDF ở máy chủ. Trình duyệt nào cũng có "In → Lưu thành PDF",
 * và nó cho xem trước, chọn khổ giấy, bỏ bớt trang. Tự dựng PDF là thêm cả một
 * bộ dựng chữ và phông tiếng Việt để đổi lấy một tệp xấu hơn — cùng lý lẽ đã
 * chốt ở app Lịch tác nghiệp và app KPI.
 */
const { ghiXlsx } = require('../lark-chung/xlsx-ghi');

const tien = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const pt = (v) => (Math.round((Number(v) || 0) * 1000) / 10).toString().replace('.', ',') + '%';
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TIEU_DE = 'BÁO CÁO SỬ DỤNG QUỸ TẠM ỨNG CHI TRƯỚC';

/** Tên tệp: có kỳ và mã quỹ, vì tệp này nằm trong hộp thư của Sếp. */
function tenTep(r, duoi) {
  const sach = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const p = ['bao-cao-quy', sach(r.ky.tenDot)];
  if (r.ky.maQuy) p.push(sach(r.ky.maQuy.split('·')[0]));
  return p.filter(Boolean).join('_').toLowerCase() + '.' + duoi;
}

/* ---------------------------------------------------------------------------
 * .XLSX
 * -------------------------------------------------------------------------
 * MỘT sheet, không phải hai như bản làm tay. Bộ ghi .xlsx tự viết (lark-chung/
 * xlsx-ghi.js) chỉ dựng được một sheet; xếp khối tổng hợp lên trên rồi bảng chi
 * tiết xuống dưới thì người nhận vẫn thấy đủ, mà không phải thêm một nhánh mã
 * chưa ai kiểm vào đúng chỗ sinh ra tệp gửi ra ngoài công ty.
 * ------------------------------------------------------------------------- */
function bangXlsx(r) {
  const cot = [
    { ten: 'STT', rong: 6 },
    { ten: 'Ngày đề nghị', rong: 13 },
    { ten: 'Ngày chi', rong: 12 },
    { ten: 'Người đề nghị', rong: 24 },
    { ten: 'Mã ĐH', rong: 12 },
    { ten: 'Nội dung thanh toán', rong: 46 },
    { ten: 'Nhóm chi phí', rong: 26 },
    { ten: 'Số tiền chi', rong: 15 },
    { ten: 'Tồn luỹ kế', rong: 15 },
    { ten: 'Tuần', rong: 12 },
  ];

  /* Khối tổng hợp đi TRƯỚC bảng chi tiết, mỗi dòng một ý — người nhận đọc từ
   * trên xuống là ra câu chuyện của kỳ, không phải tự lọc bảng để tìm. */
  const g = [];
  const dong = (a, b, c) => g.push([a, b == null ? '' : b, c == null ? '' : c, '', '', '', '', '', '', '']);
  dong('I. TÌNH HÌNH QUỸ TRONG KỲ');
  dong('Kỳ báo cáo', r.ky.tuVN + ' – ' + r.ky.denVN);
  dong('Đợt tạm ứng', r.ky.tenDot);
  if (r.ky.maQuy) dong('Mã quỹ', r.ky.maQuy);
  if (r.ky.nguoiGiu) dong('Người phụ trách quỹ', r.ky.nguoiGiu);
  dong('Ngày lập báo cáo', r.ky.ngayLap);
  dong('');
  dong('Số dư đầu kỳ (chuyển tiếp)', '', r.so.dauKy);
  dong('Tạm ứng bổ sung trong kỳ', '', r.so.napThem);
  dong('Tổng nguồn tạm ứng khả dụng', '', r.so.tongNguon);
  dong('Tổng chi trong kỳ', '', r.so.tongChi);
  dong('Số dư cuối kỳ (tồn quỹ)', '', r.so.cuoiKy);
  dong('Tổng số giao dịch', '', r.so.soGD);
  dong('');

  const khoi = (ten, ds, nhan) => {
    dong(ten);
    g.push([nhan, 'Số GD', 'Số tiền (đ)', 'Tỷ trọng', '', '', '', '', '', '']);
    ds.forEach((x) => g.push([x.ten, x.so, x.tien, pt(x.tyTrong), '', '', '', '', '', '']));
    g.push(['TỔNG CỘNG', r.so.soGD, r.so.tongChi, '100,0%', '', '', '', '', '', '']);
    dong('');
  };
  khoi('II. CƠ CẤU CHI PHÍ THEO NHÓM', r.nhom, 'Nhóm chi phí');
  khoi('III. CHI PHÍ THEO TUẦN', r.tuan, 'Tuần');
  khoi('IV. CHI PHÍ THEO NGƯỜI ĐỀ NGHỊ', r.nguoi, 'Người đề nghị');
  dong('V. CHI TIẾT GIAO DỊCH');
  g.push(cot.map((c) => c.ten));

  const hang = r.chiTiet.map((x) => [
    x.stt, x.ngayDeNghi, x.ngayChi, x.nguoi, x.maDieuHanh, x.noiDung, x.nhom,
    x.tien, x.tonLuyKe, x.tuan,
  ]);
  hang.push(['', '', '', '', '', 'TỔNG CHI TRONG KỲ', '', r.so.tongChi, r.so.cuoiKy, '']);

  return { cot, hang: [...g, ...hang] };
}

function xuatXlsx(r, logo) {
  const { cot, hang } = bangXlsx(r);
  return {
    tep: tenTep(r, 'xlsx'),
    kieu: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    than: ghiXlsx({
      ten: 'Báo cáo quỹ', cot, hang,
      tieuDe: TIEU_DE, khongDauCot: true,
      phuDe: 'Phòng Marketing · Rooty Trip Phú Quốc  ·  ' + r.ky.tuVN + ' – ' + r.ky.denVN
        + (r.ky.maQuy ? '  ·  ' + r.ky.maQuy : ''),
      logo,
    }),
  };
}

/* ---------------------------------------------------------------------------
 * HTML
 * ------------------------------------------------------------------------- */
const CSS = [
  '@page{size:A4;margin:14mm}',
  '*{box-sizing:border-box}',
  /* Nền trắng khai tường minh: máy để chế độ tối thì trang xem trước ra chữ
     đen trên nền đen, in giấy vẫn đúng mà màn hình tưởng hỏng. */
  'html{background:#fff}',
  'body{font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;'
    + 'color:#1a2233;background:#fff;margin:0;padding:22px;max-width:900px}',
  'h1{font-size:19px;margin:0 0 2px;letter-spacing:-.01em}',
  'h2{font-size:13px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#2b5cff}',
  '.phu{color:#5b6779;font-size:12px;margin-bottom:16px}',
  '.o{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 4px}',
  '.o>div{flex:1 1 150px;border:1px solid #e3e8f0;border-radius:10px;padding:10px 12px}',
  '.o .lb{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8b95a7}',
  '.o .v{font-size:17px;font-weight:700;margin-top:2px}',
  '.o .g{font-size:11px;color:#5b6779;margin-top:1px}',
  'table{border-collapse:collapse;width:100%;margin-top:4px}',
  'th{background:#2b5cff;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.05em;'
    + 'text-align:left;padding:7px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  'td{padding:6px 8px;border-bottom:1px solid #e3e8f0;vertical-align:top}',
  'td.n,th.n{text-align:right;white-space:nowrap}',
  'tr{break-inside:avoid}',
  'thead{display:table-header-group}',
  'tfoot td{font-weight:700;border-top:2px solid #2b5cff}',
  '.am{color:#b42318}',
  '.chan{margin-top:18px;color:#8b95a7;font-size:10px;display:flex;justify-content:space-between}',
  '@media print{.khong-in{display:none}}',
  '.khong-in{position:fixed;right:18px;top:14px}',
  '.khong-in button{font:600 13px system-ui;padding:8px 16px;border-radius:8px;border:0;'
    + 'background:#2b5cff;color:#fff;cursor:pointer}',
].join('');

function bangHtml(nhan, ds, r) {
  return '<table><thead><tr><th>' + esc(nhan) + '</th><th class="n">Số GD</th>'
    + '<th class="n">Số tiền</th><th class="n">Tỷ trọng</th></tr></thead><tbody>'
    + ds.map((x) => '<tr><td>' + esc(x.ten) + '</td><td class="n">' + x.so
      + '</td><td class="n">' + tien(x.tien) + 'đ</td><td class="n">' + pt(x.tyTrong)
      + '</td></tr>').join('')
    + '</tbody><tfoot><tr><td>TỔNG CỘNG</td><td class="n">' + r.so.soGD
    + '</td><td class="n">' + tien(r.so.tongChi) + 'đ</td><td class="n">100,0%</td></tr></tfoot></table>';
}

/** Bản đầy đủ — để xem và In → Lưu PDF. `logo` là data URI, có thì đóng lên đầu. */
function htmlBaoCao(r, logo) {
  const o = (lb, v, g) => '<div><div class="lb">' + lb + '</div><div class="v">' + v
    + '</div>' + (g ? '<div class="g">' + g + '</div>' : '') + '</div>';

  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>'
    + esc(TIEU_DE + ' · ' + r.ky.tenDot) + '</title><style>' + CSS + '</style></head><body>'
    + '<div class="khong-in"><button onclick="window.print()">In / Lưu PDF</button></div>'
    + (logo ? '<img src="' + logo + '" alt="Rooty Trip" style="height:44px;display:block;margin-bottom:10px">' : '')
    + '<h1>' + esc(TIEU_DE) + '</h1>'
    + '<div class="phu">Phòng Marketing · Rooty Trip Phú Quốc<br>Kỳ báo cáo: <b>'
      + esc(r.ky.tuVN + ' – ' + r.ky.denVN) + '</b> · Đợt: ' + esc(r.ky.tenDot)
      + (r.ky.maQuy ? ' · Mã quỹ: ' + esc(r.ky.maQuy) : '')
      + (r.ky.nguoiGiu ? ' · Người phụ trách quỹ: ' + esc(r.ky.nguoiGiu) : '')
      + ' · Ngày lập: ' + esc(r.ky.ngayLap) + '</div>'

    + '<div class="o">'
      + o('Tổng nguồn tạm ứng', tien(r.so.tongNguon) + 'đ',
        tien(r.so.dauKy) + 'đ dư đầu kỳ + ' + tien(r.so.napThem) + 'đ tạm ứng mới')
      + o('Tổng chi trong kỳ', tien(r.so.tongChi) + 'đ', r.so.soGD + ' khoản')
      + o('Số dư cuối kỳ', '<span class="' + (r.so.am ? 'am' : '') + '">' + tien(r.so.cuoiKy) + 'đ</span>',
        'tương đương ' + pt(r.so.tyLeCon) + ' nguồn tạm ứng')
    + '</div>'

    + '<h2>1 · Cơ cấu chi theo nhóm</h2>' + bangHtml('Nhóm chi phí', r.nhom, r)
    + '<h2>2 · Diễn biến chi theo tuần</h2>' + bangHtml('Tuần', r.tuan, r)
    + '<h2>3 · Chi phí theo người đề nghị</h2>' + bangHtml('Người đề nghị', r.nguoi, r)

    + '<h2>4 · Chi tiết các khoản chi</h2>'
    + '<table><thead><tr><th class="n">STT</th><th>Ngày</th><th>Mã ĐH</th>'
      + '<th>Nội dung thanh toán</th><th>Nhóm</th><th class="n">Số tiền</th>'
      + '<th class="n">Tồn luỹ kế</th></tr></thead><tbody>'
    + r.chiTiet.map((x) => '<tr><td class="n">' + x.stt + '</td><td>' + esc(x.ngayDeNghi)
      + '</td><td>' + esc(x.maDieuHanh) + '</td><td>' + esc(x.noiDung) + '</td><td>'
      + esc(x.nhom) + '</td><td class="n">' + tien(x.tien) + 'đ</td><td class="n">'
      + tien(x.tonLuyKe) + 'đ</td></tr>').join('')
    + '</tbody><tfoot><tr><td colspan="5">TỔNG CHI TRONG KỲ</td><td class="n">'
      + tien(r.so.tongChi) + 'đ</td><td class="n">' + tien(r.so.cuoiKy) + 'đ</td></tr></tfoot></table>'

    + '<div class="chan"><span>Tài liệu nội bộ · '
      + esc(r.ky.maQuy || r.ky.tenDot) + '</span><span>Rooty Trip Phú Quốc</span></div>'
    + '</body></html>';
}

/* ---------------------------------------------------------------------------
 * THÂN EMAIL
 * -------------------------------------------------------------------------
 * Đúng bố cục thư anh Hùng vẫn gửi: xin nhập quỹ TRƯỚC, báo cáo kỳ vừa rồi
 * SAU. Thứ tự đó có lý của nó — Sếp cần quyết một việc, còn báo cáo là cơ sở
 * để quyết; đảo lại thì phải đọc hết mới biết thư này hỏi gì.
 *
 * Bảng dựng bằng thuộc tính inline chứ không bằng <style>: hộp thư nào cũng
 * cắt bớt CSS trong <head>, và cắt xong thì bảng về dạng thô.
 * ------------------------------------------------------------------------- */
function htmlEmail(r, o) {
  const y = o || {};
  const xin = Number(y.xinNap) || 0;
  const td = 'padding:6px 9px;border-bottom:1px solid #e3e8f0;font-size:13px';
  const th = 'padding:7px 9px;background:#f3f5f9;font-size:11px;text-transform:uppercase;'
    + 'letter-spacing:.05em;color:#5b6779;text-align:left';

  const hangNhom = r.nhom.map((x) => '<tr>'
    + '<td style="' + td + '">' + esc(x.ten) + '</td>'
    + '<td style="' + td + ';text-align:right">' + x.so + '</td>'
    + '<td style="' + td + ';text-align:right">' + tien(x.tien) + ' đ</td>'
    + '<td style="' + td + ';text-align:right">' + pt(x.tyTrong) + '</td></tr>').join('');

  return '<div style="font:14px/1.6 -apple-system,BlinkMacSystemFont,\'Segoe UI\',system-ui,sans-serif;color:#1a2233">'
    + '<p>Kính gửi Ban Giám Đốc,</p>'
    + '<p>Phòng Marketing kính gửi đề xuất nhập Quỹ Marketing và báo cáo Quỹ Marketing.</p>'

    + (xin ? '<p style="margin-top:18px"><b>1. NHẬP QUỸ MARKETING</b></p>'
      + '<ul style="margin:4px 0 8px;padding-left:20px">'
      + (y.hangMuc || []).map((h) => '<li>' + esc(h) + '</li>').join('')
      + '</ul>'
      + '<p>Tổng ngân sách đề xuất' + (y.kyMoi ? ' ' + esc(y.kyMoi) : '') + ': <b>'
      + tien(xin) + ' VND</b></p>' : '')

    + '<p style="margin-top:18px"><b>' + (xin ? '2. ' : '') + 'BÁO CÁO QUỸ MARKETING</b></p>'
    + '<p>Thời gian sử dụng: <b>' + esc(r.ky.tuVN + ' – ' + r.ky.denVN) + '</b>'
    + (r.ky.maQuy ? ' · Mã quỹ: <b>' + esc(r.ky.maQuy) + '</b>' : '') + '<br>'
    + 'Tổng nguồn tạm ứng: <b>' + tien(r.so.tongNguon) + ' VND</b> '
    + '(' + tien(r.so.dauKy) + ' dư đầu kỳ + ' + tien(r.so.napThem) + ' tạm ứng mới)<br>'
    + 'Tổng chi trong kỳ: <b>' + tien(r.so.tongChi) + ' VND</b> · ' + r.so.soGD + ' khoản<br>'
    + 'Số dư cuối kỳ (tồn quỹ): <b' + (r.so.am ? ' style="color:#b42318"' : '') + '>'
    + tien(r.so.cuoiKy) + ' VND</b> (' + pt(r.so.tyLeCon) + ' nguồn tạm ứng)</p>'

    + '<p style="margin-top:14px">Cơ cấu chi phí theo nhóm:</p>'
    + '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:620px">'
    + '<tr><th style="' + th + '">Nhóm chi phí</th><th style="' + th + ';text-align:right">Số GD</th>'
    + '<th style="' + th + ';text-align:right">Số tiền (đ)</th>'
    + '<th style="' + th + ';text-align:right">Tỷ trọng</th></tr>'
    + hangNhom
    + '<tr><td style="' + td + ';font-weight:700">TỔNG CỘNG</td>'
    + '<td style="' + td + ';text-align:right;font-weight:700">' + r.so.soGD + '</td>'
    + '<td style="' + td + ';text-align:right;font-weight:700">' + tien(r.so.tongChi) + ' đ</td>'
    + '<td style="' + td + ';text-align:right;font-weight:700">100,0%</td></tr></table>'

    + (y.ghiChu ? '<p style="margin-top:14px">' + esc(y.ghiChu) + '</p>' : '')
    + '<p style="margin-top:16px">Mong Ban Giám Đốc sớm phê duyệt đề xuất trên, để phòng ban '
    + 'tiếp tục duy trì các hoạt động.</p>'
    + '<p>Trân trọng,</p></div>';
}

/** Tiêu đề thư — đúng lối anh Hùng vẫn đặt. */
function tieuDeEmail(r, o) {
  const y = o || {};
  return (Number(y.xinNap) ? 'ĐỀ XUẤT PHÊ DUYỆT CHI PHÍ NHẬP QUỸ MARKETING'
    + (y.kyMoi ? ' ' + String(y.kyMoi).toUpperCase() : '')
    : 'BÁO CÁO QUỸ MARKETING ' + r.ky.tenDot.toUpperCase());
}

module.exports = { xuatXlsx, htmlBaoCao, htmlEmail, tieuDeEmail, tenTep, bangXlsx, TIEU_DE };
