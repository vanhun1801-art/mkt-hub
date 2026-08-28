/**
 * ===========================================================================
 *  GOOGLE ADS SCRIPT — xuất số hằng ngày ra Google Sheet cho app quản lý ads
 * ===========================================================================
 *
 * Vì sao dùng script thay vì Google Ads API: xin developer token phải chờ duyệt
 * cả tuần, còn script này chạy ngay trong giao diện Google Ads, không cần token,
 * không cần OAuth, không cần server công khai.
 *
 * CÁCH DÙNG (làm 1 lần, ~20 phút)
 * ---------------------------------------------------------------------------
 * 1. Tạo một Google Sheet trống. Copy ID của nó từ URL:
 *      docs.google.com/spreadsheets/d/<<<ID Ở ĐÂY>>>/edit
 *    Dán vào SHEET_ID bên dưới.
 *
 * 2. Vào Google Ads → Công cụ và cài đặt (Tools) → Hành động khối lượng lớn
 *    → Tập lệnh (Scripts) → dấu + → Tập lệnh mới.
 *    Dán TOÀN BỘ file này vào, bấm Cho phép (Authorize), rồi Xem trước để thử.
 *
 * 3. Bấm Chạy một lần để kiểm tra Sheet đã có số chưa.
 *
 * 4. Đặt Tần suất (Frequency) = Mỗi giờ (Hourly).
 *
 * 5. Mở Google Sheet → Tệp → Chia sẻ → Xuất bản lên web
 *      - Chọn đúng sheet "DuLieu"
 *      - Định dạng: Giá trị được phân tách bằng dấu phẩy (.csv)
 *      - Bấm Xuất bản, copy đường link.
 *    Dán link đó vào ket-noi.json → googleSheet.csvUrl, đặt enabled = true.
 *
 * LƯU Ý VỀ CẤP ĐỘ
 * ---------------------------------------------------------------------------
 * Mặc định script xuất ở cấp NHÓM QUẢNG CÁO (ad group). Lý do: quảng cáo tìm
 * kiếm của Google thường không có tên, xuất ở cấp quảng cáo sẽ ra một rừng dòng
 * tên rỗng chỉ có ID. Nếu vẫn muốn cấp quảng cáo, đổi LEVEL = 'ad' và đổi
 * ket-noi.json → googleSheet.level = 'ad'.
 */

/* ======================= CẦN SỬA ======================= */
var SHEET_ID = 'DAN_ID_GOOGLE_SHEET_VAO_DAY';
var SHEET_NAME = 'DuLieu';
var SO_NGAY_LUI = 14;        // xuất lại bao nhiêu ngày gần nhất (Google còn khai báo lại chuyển đổi)
var LEVEL = 'adgroup';       // 'adgroup' (nên dùng) hoặc 'ad'
/* ====================================================== */

function main() {
  var to = new Date();
  var from = new Date(to.getTime() - (SO_NGAY_LUI - 1) * 86400000);

  var rows = LEVEL === 'ad' ? layTheoQuangCao(from, to) : layTheoNhom(from, to);

  var sheet = moSheet();
  sheet.clear();
  sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, HEADER.length).setValues(rows);
  }
  // ô ghi chú thời điểm chạy, để anh biết dữ liệu tươi tới đâu
  sheet.getRange(1, HEADER.length + 2).setValue('Cập nhật lúc: ' + Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd HH:mm'));
  Logger.log('Đã ghi ' + rows.length + ' dòng vào sheet ' + SHEET_NAME);
}

var HEADER = ['date', 'campaign_id', 'campaign_name', 'adgroup_id', 'adgroup_name',
  'ad_id', 'ad_name', 'cost', 'impressions', 'clicks', 'conversions'];

function moSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ngay(d) {
  return Utilities.formatDate(d, AdsApp.currentAccount().getTimeZone(), 'yyyyMMdd');
}

/** Số của Google trả về dạng '1.234,56' hoặc '1,234.56' tuỳ locale — bỏ dấu phân cách nghìn. */
function so(v) {
  if (v === null || v === undefined || v === '') return 0;
  var s = String(v).replace(/[^\d.,\-]/g, '');
  var lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function ngayISO(yyyymmdd) {
  var s = String(yyyymmdd).replace(/-/g, '');
  return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
}

function layTheoNhom(from, to) {
  var q = 'SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name,'
    + ' metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions'
    + ' FROM ad_group'
    + ' WHERE segments.date BETWEEN "' + ngayISO(ngay(from)) + '" AND "' + ngayISO(ngay(to)) + '"'
    + ' AND metrics.impressions > 0';
  var out = [];
  var it = AdsApp.search(q);
  while (it.hasNext()) {
    var r = it.next();
    out.push([
      r.segments.date,
      String(r.campaign.id), r.campaign.name,
      String(r.adGroup.id), r.adGroup.name,
      String(r.adGroup.id), r.adGroup.name,     // cấp nhóm: coi nhóm là đơn vị quảng cáo
      Number(r.metrics.costMicros) / 1000000,
      Number(r.metrics.impressions),
      Number(r.metrics.clicks),
      Number(r.metrics.conversions),
    ]);
  }
  return out;
}

function layTheoQuangCao(from, to) {
  var q = 'SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name,'
    + ' ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,'
    + ' metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions'
    + ' FROM ad_group_ad'
    + ' WHERE segments.date BETWEEN "' + ngayISO(ngay(from)) + '" AND "' + ngayISO(ngay(to)) + '"'
    + ' AND metrics.impressions > 0';
  var out = [];
  var it = AdsApp.search(q);
  while (it.hasNext()) {
    var r = it.next();
    var ad = r.adGroupAd.ad;
    // quảng cáo tìm kiếm hay không có tên → đặt tên nhận biết được
    var ten = ad.name && String(ad.name).length ? ad.name
      : (r.adGroup.name + ' · ' + (ad.type || 'AD') + ' ' + String(ad.id).slice(-6));
    out.push([
      r.segments.date,
      String(r.campaign.id), r.campaign.name,
      String(r.adGroup.id), r.adGroup.name,
      String(ad.id), ten,
      Number(r.metrics.costMicros) / 1000000,
      Number(r.metrics.impressions),
      Number(r.metrics.clicks),
      Number(r.metrics.conversions),
    ]);
  }
  return out;
}
