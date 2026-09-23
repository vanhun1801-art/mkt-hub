/* ==========================================================================
   Mã vùng điện thoại thế giới + chuẩn hoá số — DÙNG CHUNG cho trình duyệt
   (window.MaVung) và server (require('./public/ma-vung')). Một bản duy nhất để
   ô nhập và dữ liệu ghi Base không bao giờ hiểu một số theo hai cách.

   Mỗi dòng: "ISO|Tên|mã". Việt Nam và các thị trường khách Phú Quốc đứng đầu.
   ========================================================================== */
(function (goc) {
  'use strict';
  const DS = [
    'VN|Việt Nam|84', 'KR|Hàn Quốc|82', 'CN|Trung Quốc|86', 'TW|Đài Loan|886', 'JP|Nhật Bản|81',
    'TH|Thái Lan|66', 'SG|Singapore|65', 'MY|Malaysia|60', 'PH|Philippines|63', 'ID|Indonesia|62',
    'KH|Campuchia|855', 'LA|Lào|856', 'MM|Myanmar|95', 'IN|Ấn Độ|91', 'HK|Hồng Kông|852', 'MO|Ma Cao|853',
    'RU|Nga|7', 'KZ|Kazakhstan|7', 'US|Mỹ|1', 'CA|Canada|1', 'AU|Úc|61', 'NZ|New Zealand|64',
    'GB|Anh|44', 'FR|Pháp|33', 'DE|Đức|49', 'IT|Ý|39', 'ES|Tây Ban Nha|34', 'NL|Hà Lan|31',
    'BE|Bỉ|32', 'CH|Thuỵ Sĩ|41', 'AT|Áo|43', 'SE|Thuỵ Điển|46', 'NO|Na Uy|47', 'DK|Đan Mạch|45',
    'FI|Phần Lan|358', 'PL|Ba Lan|48', 'CZ|Séc|420', 'UA|Ukraina|380', 'BY|Belarus|375', 'IL|Israel|972',
    'AE|UAE|971', 'SA|Ả Rập Xê Út|966', 'QA|Qatar|974', 'TR|Thổ Nhĩ Kỳ|90',
    'AF|Afghanistan|93', 'AL|Albania|355', 'DZ|Algeria|213', 'AD|Andorra|376', 'AO|Angola|244',
    'AR|Argentina|54', 'AM|Armenia|374', 'AZ|Azerbaijan|994', 'BH|Bahrain|973', 'BD|Bangladesh|880',
    'BZ|Belize|501', 'BJ|Benin|229', 'BT|Bhutan|975', 'BO|Bolivia|591', 'BA|Bosnia & Herzegovina|387',
    'BW|Botswana|267', 'BR|Brazil|55', 'BN|Brunei|673', 'BG|Bulgaria|359', 'BF|Burkina Faso|226',
    'BI|Burundi|257', 'CM|Cameroon|237', 'CV|Cape Verde|238', 'CF|Trung Phi|236', 'TD|Chad|235',
    'CL|Chile|56', 'CO|Colombia|57', 'KM|Comoros|269', 'CG|Congo|242', 'CD|CHDC Congo|243',
    'CR|Costa Rica|506', 'CI|Bờ Biển Ngà|225', 'HR|Croatia|385', 'CU|Cuba|53', 'CY|Síp|357',
    'DJ|Djibouti|253', 'DO|Cộng hoà Dominica|1', 'EC|Ecuador|593', 'EG|Ai Cập|20', 'SV|El Salvador|503',
    'GQ|Guinea Xích Đạo|240', 'ER|Eritrea|291', 'EE|Estonia|372', 'ET|Ethiopia|251', 'FJ|Fiji|679',
    'GA|Gabon|241', 'GM|Gambia|220', 'GE|Georgia|995', 'GH|Ghana|233', 'GR|Hy Lạp|30',
    'GT|Guatemala|502', 'GN|Guinea|224', 'GW|Guinea-Bissau|245', 'GY|Guyana|592', 'HT|Haiti|509',
    'HN|Honduras|504', 'HU|Hungary|36', 'IS|Iceland|354', 'IR|Iran|98', 'IQ|Iraq|964', 'IE|Ireland|353',
    'JM|Jamaica|1', 'JO|Jordan|962', 'KE|Kenya|254', 'KI|Kiribati|686', 'KP|Triều Tiên|850',
    'KW|Kuwait|965', 'KG|Kyrgyzstan|996', 'LV|Latvia|371', 'LB|Liban|961', 'LS|Lesotho|266',
    'LR|Liberia|231', 'LY|Libya|218', 'LI|Liechtenstein|423', 'LT|Litva|370', 'LU|Luxembourg|352',
    'MG|Madagascar|261', 'MW|Malawi|265', 'MV|Maldives|960', 'ML|Mali|223', 'MT|Malta|356',
    'MH|Quần đảo Marshall|692', 'MR|Mauritania|222', 'MU|Mauritius|230', 'MX|Mexico|52',
    'FM|Micronesia|691', 'MD|Moldova|373', 'MC|Monaco|377', 'MN|Mông Cổ|976', 'ME|Montenegro|382',
    'MA|Maroc|212', 'MZ|Mozambique|258', 'NA|Namibia|264', 'NR|Nauru|674', 'NP|Nepal|977',
    'NI|Nicaragua|505', 'NE|Niger|227', 'NG|Nigeria|234', 'MK|Bắc Macedonia|389', 'OM|Oman|968',
    'PK|Pakistan|92', 'PW|Palau|680', 'PS|Palestine|970', 'PA|Panama|507', 'PG|Papua New Guinea|675',
    'PY|Paraguay|595', 'PE|Peru|51', 'PT|Bồ Đào Nha|351', 'PR|Puerto Rico|1', 'RO|Romania|40',
    'RW|Rwanda|250', 'WS|Samoa|685', 'SM|San Marino|378', 'ST|São Tomé & Príncipe|239', 'SN|Senegal|221',
    'RS|Serbia|381', 'SC|Seychelles|248', 'SL|Sierra Leone|232', 'SK|Slovakia|421', 'SI|Slovenia|386',
    'SB|Quần đảo Solomon|677', 'SO|Somalia|252', 'ZA|Nam Phi|27', 'SS|Nam Sudan|211', 'LK|Sri Lanka|94',
    'SD|Sudan|249', 'SR|Suriname|597', 'SZ|Eswatini|268', 'SY|Syria|963', 'TJ|Tajikistan|992',
    'TZ|Tanzania|255', 'TL|Đông Timor|670', 'TG|Togo|228', 'TO|Tonga|676', 'TT|Trinidad & Tobago|1',
    'TN|Tunisia|216', 'TM|Turkmenistan|993', 'TV|Tuvalu|688', 'UG|Uganda|256', 'UY|Uruguay|598',
    'UZ|Uzbekistan|998', 'VU|Vanuatu|678', 'VA|Vatican|379', 'VE|Venezuela|58', 'YE|Yemen|967',
    'ZM|Zambia|260', 'ZW|Zimbabwe|263',
  ].map((s) => { const [iso, ten, ma] = s.split('|'); return { iso, ten, ma }; });

  /* Số chữ số SAU mã vùng (bỏ số 0 đầu) — chỉ khai những nước hay gặp; nước khác
   * chấp nhận 6–12 chữ số. Việt Nam 9 số (di động 3/5/7/8/9, bàn 2x). */
  const DO_DAI = { 84: [9, 10], 82: [9, 10], 86: [11, 11], 886: [9, 9], 81: [9, 10], 66: [8, 9], 65: [8, 8],
    60: [9, 10], 63: [10, 10], 62: [9, 12], 855: [8, 9], 91: [10, 10], 7: [10, 10], 1: [10, 10], 61: [9, 9],
    44: [10, 10], 33: [9, 9], 49: [10, 11] };

  /* Mã dài trước để "+886" không bị bắt thành "+88…" hay "+8…". */
  const THEO_DAI = [...new Set(DS.map((x) => x.ma))].sort((a, b) => b.length - a.length);
  const theoMa = (ma) => DS.find((x) => x.ma === String(ma).replace(/\D/g, ''));
  const theoTen = (ten) => DS.find((x) => x.ten === ten);

  /**
   * Chuẩn hoá một số điện thoại gõ tay.
   * @returns {{so:string, ma:string, quocTe:string, dep:string, loi:string, sua:string[]}}
   *   quocTe = "+84778866707" (ghi Base) · dep = "+84 778 866 707" (hiển thị)
   *   sua    = các chỗ đã tự sửa, để giao diện nói cho người nhập biết.
   */
  function chuan(vao, maVung) {
    const sua = [];
    let s = String(vao || '').trim();
    if (!s) return { so: '', ma: String(maVung || '').replace(/\D/g, ''), quocTe: '', dep: '', loi: '', sua };
    /* Gõ nhầm chữ thay số: O/o → 0, l/I → 1; số full-width (bàn phím tiếng Trung/Nhật). */
    const goc0 = s;
    s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
      .replace(/[oO]/g, '0').replace(/[lI|]/g, '1');
    if (s !== goc0) sua.push('đổi chữ gõ nhầm thành số');
    let ma = String(maVung || '').replace(/\D/g, '');
    /* Xét dấu + / 00 trên chuỗi GỐC: "0O78…" sau khi đổi O→0 thành "0078…" — không được
     * hiểu nhầm là đầu số quốc tế. "(+84) …" có ngoặc phía trước vẫn là số quốc tế. */
    const coCong = /^[\s(]*(\+|00)/.test(goc0);
    let d = s.replace(/\D/g, '');
    if (/^[\s(]*00/.test(goc0)) d = d.replace(/^00/, '');
    if (coCong) {
      const m = THEO_DAI.find((x) => d.startsWith(x));
      if (m) { if (ma && m !== ma) sua.push('nhận mã vùng +' + m + ' từ số đã dán'); ma = m; d = d.slice(m.length); }
    } else if (ma && d.startsWith(ma) && d.length > (DO_DAI[ma] ? DO_DAI[ma][1] : 10)) {
      /* "84778866707" không có dấu +: đã kèm mã vùng rồi. */
      d = d.slice(ma.length); sua.push('bỏ mã vùng bị gõ lặp');
    }
    if (d.startsWith('0')) { d = d.replace(/^0+/, ''); sua.push('bỏ số 0 đầu'); }
    const [min, max] = DO_DAI[ma] || [6, 12];
    let loi = '';
    if (!ma) loi = 'Chưa chọn mã vùng';
    else if (d.length < min) loi = 'Thiếu số: sau +' + ma + ' cần ' + (min === max ? min : min + '–' + max) + ' chữ số, đang có ' + d.length;
    else if (d.length > max) loi = 'Thừa số: sau +' + ma + ' chỉ ' + (min === max ? min : min + '–' + max) + ' chữ số, đang có ' + d.length;
    else if (ma === '84' && d.length === 9 && !/^[235789]/.test(d)) loi = 'Số Việt Nam thường bắt đầu bằng 3, 5, 7, 8, 9 (di động) hoặc 2 (bàn)';
    const nhom = ma === '82' && d.length === 10 ? d.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')
      : d.length === 9 ? d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')
        : d.length === 10 ? d.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')
          : d.length === 11 ? d.replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3') : d.replace(/(\d{3})(?=\d)/g, '$1 ');
    return { so: d, ma, quocTe: ma && d ? '+' + ma + d : d, dep: ma && d ? '+' + ma + ' ' + nhom : d, loi, sua };
  }

  const api = { DS, theoMa, theoTen, chuan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else goc.MaVung = api;
})(typeof window !== 'undefined' ? window : globalThis);
