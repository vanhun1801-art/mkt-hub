'use strict';
/**
 * Adapter Google Ads — KHÔNG dùng Google Ads API.
 *
 * Google Ads Script (docs/google-ads-script.js) chạy hẹn giờ ngay trong giao diện
 * Google Ads, ghi số vào một Google Sheet. Sheet được "Xuất bản lên web" dưới dạng
 * CSV, app chỉ việc tải link đó về. Nhờ vậy không cần developer token (phải xin
 * duyệt cả tuần), không cần OAuth, không cần domain public.
 */
const { getText, hideSecret } = require('./http');
const csv = require('./csv');

const PLATFORM = 'Google Ads';

/** Bảo đảm link Sheet trả về CSV chứ không phải HTML. */
function normalizeUrl(u) {
  const s = String(u || '').trim();
  if (!s) throw new Error('Chưa khai googleSheet.csvUrl trong ket-noi.json');
  // link "Xuất bản lên web" dạng .../pub?output=csv — giữ nguyên
  if (/output=csv/.test(s)) return s;
  // link chia sẻ thường: /spreadsheets/d/<id>/edit#gid=<gid> → đổi sang export CSV
  const m = s.match(/\/spreadsheets\/d\/([\w-]+)/);
  if (m) {
    const gid = (s.match(/[#&?]gid=(\d+)/) || [])[1] || '0';
    return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
  }
  return s;
}

/** Đổi lỗi HTTP khô khan thành câu chỉ đúng việc cần làm. */
function giaiThich(msg) {
  const m = String(msg || '');
  if (/HTTP 404/.test(m)) {
    return 'Không tìm thấy Sheet (404). Kiểm tra: link đúng chưa, và Sheet đã '
      + '"Tệp → Chia sẻ → Xuất bản lên web → định dạng .csv" chưa.';
  }
  if (/HTTP 401|HTTP 403/.test(m)) {
    return 'Sheet không cho truy cập (403). Phải Xuất bản lên web dạng .csv, '
      + 'hoặc đặt quyền "Bất kỳ ai có đường liên kết".';
  }
  if (/không phải dữ liệu|trả về HTML|trả về một trang web/i.test(m)) {
    return 'Link trả về trang web chứ không phải CSV. Xuất bản lại và chọn '
      + 'định dạng "Giá trị được phân tách bằng dấu phẩy (.csv)".';
  }
  if (/ENOTFOUND|EAI_AGAIN|timeout/i.test(m)) return 'Không nối được tới Google (kiểm tra mạng).';
  return m;
}

async function fetchRange(conf, from, to, log = () => {}) {
  const url = normalizeUrl(conf.csvUrl);
  hideSecret(conf.csvUrl);
  const text = await getText(url, { label: 'Google Sheet', timeout: 60000 });
  if (/^\s*</.test(text)) {
    throw new Error('Link Google Sheet trả về HTML chứ không phải CSV — hãy dùng Tệp → Chia sẻ → Xuất bản lên web → định dạng CSV, hoặc đặt Sheet ở chế độ "Bất kỳ ai có đường liên kết".');
  }
  const parsed = csv.toRows(text, { platform: PLATFORM, level: conf.level || 'adgroup' });
  const rows = parsed.rows.filter((r) => r.date >= from && r.date <= to);
  log(`Google Sheet: ${parsed.rows.length} dòng trong sheet, ${rows.length} dòng trong khoảng ${from}→${to}`);
  return { rows, columnMap: parsed.columnMap, unknownColumns: parsed.unknownColumns, skipped: parsed.skipped };
}

async function test(conf) {
  try {
    const url = normalizeUrl(conf.csvUrl);
    const text = await getText(url, { label: 'Google Sheet test', retries: 1, timeout: 30000 });
    if (/^\s*</.test(text)) return { ok: false, message: 'Link trả về HTML, chưa phải CSV' };
    const { headers, rows } = csv.parse(text);
    const { map, unknown } = csv.mapColumns(headers);
    const dates = rows.map((r) => csv.parseDate(map.date ? r[map.date] : '')).filter(Boolean).sort();
    return {
      ok: true,
      results: [{
        account: 'Google Sheet', ok: true,
        name: `${rows.length} dòng`,
        khoangNgay: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : 'không đọc được ngày',
        cotNhanRa: Object.keys(map).join(', '),
        cotKhongDung: unknown.slice(0, 8),
      }],
    };
  } catch (e) { return { ok: false, message: giaiThich(e.message) }; }
}

module.exports = { PLATFORM, fetchRange, test, normalizeUrl };
