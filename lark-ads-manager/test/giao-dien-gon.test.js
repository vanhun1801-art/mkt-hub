/**
 * Giao diện gọn: những gì đã BỎ thì phải không quay lại, và đường thay thế phải còn.
 *
 * Bộ này giữ ba việc dọn giao diện khỏi bị hoàn nguyên trong im lặng:
 *
 * 1. Tab "Nhập số hằng ngày" đã bỏ. API lấy đủ số của cả ba nền tảng, nên bảng
 *    nhập tay chỉ còn là một cửa để nhập sai. Đo trong Base: 109 dòng "Nhập tay"
 *    đều thuộc 01/08–26/08, giai đoạn TRƯỚC khi nối API.
 *
 * 2. Nhưng đường sửa từng dòng PHẢI còn — ở tab "Dữ liệu theo ngày". Nếu một nền
 *    tảng để hở một ngày mà không còn chỗ nào vá được thì việc bỏ tab là làm hỏng,
 *    không phải làm gọn. Đây là phép kiểm quan trọng nhất của bộ này.
 *
 * 3. /api/entry ở server còn sống: hai bộ test ghi dùng nó, và nó là đường vá.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const app = doc('public/app.js');
const srv = doc('server.js');
const css = doc('public/styles.css');
const kn = doc('public/ketnoi.js');

console.log('— tab nhập tay đã bỏ');
{
  t('không còn tab trong thanh tab', !/id:\s*'nhap-so'/.test(app));
  t('không còn khối VIEW', !/VIEW\['nhap-so'\]/.test(app));
  t('không còn state S.entry', !/S\.entry/.test(app));
  t('không còn CSS .entry-tbl', !css.includes('.entry-tbl'));
}

console.log('— đường sửa từng dòng PHẢI còn');
{
  /* Không có phép kiểm này thì lần dọn sau có thể bỏ luôn nút Sửa, và app mất
   * hẳn cách vá một ngày bị hở — im lặng, không ai biết cho tới lúc cần. */
  t('tab Dữ liệu theo ngày còn trong thanh tab', /id:\s*'du-lieu'/.test(app));
  t('còn nút Sửa từng dòng', app.includes('window.__dailyEdit'));
  t('__dailyEdit còn được khai', /window\.__dailyEdit\s*=/.test(app));
  t('__dailyEdit ghi qua /api/daily', /__dailyEdit[\s\S]{0,2000}?\/api\/daily/.test(app));
}

console.log('— /api/entry còn sống: cho test ghi và cho đường vá');
{
  t('còn đường GET', srv.includes("p === '/api/entry' && method === 'GET'"));
  t('còn đường POST', srv.includes("p === '/api/entry' && method === 'POST'"));
  /* Ghi lại VÌ SAO nó còn, để lần sau không ai tưởng là mã chết rồi xoá. */
  t('có ghi lý do nó còn tồn tại', /Nhập số hằng ngày[\s\S]{0,400}?api\.test\.js/.test(srv));
}

console.log('— bốn câu "số đến từ đâu" nói đúng bốn chuyện');
{
  /* Lôi hàm thuần ra khỏi tệp giao diện mà chạy. Máy dev chưa có token Tourwell
   * nên mở trang chỉ vào được MỘT nhánh trong bốn; ba nhánh kia mà sai thì chỉ
   * lộ trên Render, tức là lộ lúc app đã nói sai với người dùng. */
  const i = app.indexOf('function nguonSo(tt) {');
  t('hàm nguonSo còn trong public/app.js', i >= 0);
  let nguonSo = null;
  if (i >= 0) {
    let d = 0, j = app.indexOf('{', i);
    for (; j < app.length; j += 1) {
      if (app[j] === '{') d += 1;
      else if (app[j] === '}') { d -= 1; if (!d) break; }
    }
    /* dmy là hàm định dạng ngày của app; truyền vào để hàm chạy độc lập được. */
    nguonSo = new Function('dmy', app.slice(i, j + 1) + '; return nguonSo;')((x) => String(x));
  }
  const chuoi = (o) => String(nguonSo(o)).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

  const NHIP = { tuDongSoNgay: 21, tuDongMoiGio: 6 };
  const kb = chuoi({ ...NHIP, tourwellBat: false });
  const kr = chuoi({ ...NHIP, tourwellBat: true, coDuLieu: false });
  const xl = chuoi({ ...NHIP, tourwellBat: true, coDuLieu: true, tuApi: false, luc: '2026-09-10T03:00:00Z' });
  const ap = chuoi({ ...NHIP, tourwellBat: true, coDuLieu: true, tuApi: true,
    luc: '2026-09-10T03:00:00Z', khoang: ['2026-08-20', '2026-09-10'], conTuoi: true });

  /* Bốn câu phải KHÁC nhau. Gộp lại thành một câu chung chung là bắt người đọc
   * tự đoán phải làm gì tiếp. */
  t('bốn trường hợp ra bốn câu khác nhau', new Set([kb, kr, xl, ap]).size === 4);

  t('chưa bật API thì nói rõ là chưa bật', /Chưa bật API Tourwell/.test(kb));
  t('chưa bật API thì chỉ đường đi bật', /Kết nối/.test(kb) && /Tourwell/.test(kb));

  t('kho rỗng thì nói kho rỗng, không nói thiếu file',
    /kho còn rỗng/.test(kr) && !/Excel/.test(kr));
  t('kho rỗng thì mời bấm kéo lại', /Kéo lại từ Tourwell ngay/.test(kr));

  t('số từ Excel thì nói là từ Excel', /file Excel/.test(xl));
  t('số từ Excel thì nhắc rằng API đã bật rồi', /API Tourwell đã bật rồi/.test(xl));

  /* Đây là câu quan trọng nhất của cả việc này: bản trước mở tab ra là dạy
   * "Cần hai bản xuất Excel từ Tourwell", trong khi số đã tự về từ API. */
  t('số tự về thì nói tự về', /tự về từ API Tourwell/.test(ap));
  t('số tự về thì nói KHÔNG cần Excel', /không cần xuất Excel/.test(ap));
  t('số tự về thì có giờ kéo gần nhất', /Lần kéo gần nhất/.test(ap));

  /* Nhịp tự kéo phải là số THẬT từ server, không phải chữ gõ cứng trong HTML. */
  ['21 ngày', '6 giờ'].forEach((x) => t(`nhịp tự kéo lấy từ server (${x})`,
    ap.includes(x) && kr.includes(x)));

  /* Không câu nào được quay lại lối cũ: bắt xuất Excel khi API đã lo. */
  t('không câu nào bắt xuất Excel khi API đang chạy',
    !/Cần hai bản xuất Excel/.test(ap + kr + xl));
}

console.log('— nhập Excel còn, nhưng là đường lùi');
{
  /* Không xoá hẳn: API có thể chết token, Tourwell có thể đổi. Nhưng cũng không
   * để ngang hàng với đường chính — bày ra là dạy người ta làm việc tay. */
  t('vẫn nhập được file', app.includes('id="rsFile"') && app.includes('id="rsNhap"'));
  t('nằm trong khối gấp lại', /<details class="lui"[\s\S]{0,900}?id="rsFile"/.test(app));
  t('nói rõ là đường lùi', /đường lùi khi API Tourwell không dùng được/.test(app));
  /* Nhập file THAY kho đang có — kể cả kho vừa tự kéo. Không nói ra thì người
   * dùng nhập một file cũ rồi không hiểu vì sao số lùi lại. */
  t('cảnh báo file sẽ thay kho đang có', /THAY kho đang có/.test(app));
  t('có nút kéo lại ngay trên tab Doanh thu', app.includes('id="rsKeo"'));
  t('nút kéo dùng cửa sổ của lượt tự động, không phải 60 ngày',
    /tuDongSoNgay \|\| 21/.test(app));
  t('khối gấp lại có CSS riêng, không phải chữ trần', css.includes('.lui > summary'));
}

console.log('— tab Kết nối: việc chính lên trên, ô kỹ thuật gấp lại');
{
  /* Bốn ô số kỹ thuật từng chiếm nửa chiều ngang để hỏi những câu người dùng
   * không có cách nào tự trả lời, còn ba việc anh Hùng thật sự vào đây để làm
   * thì nằm lẫn bên dưới. */
  const gap = kn.indexOf('<details class="lui"');
  t('có khối gấp lại cho tuỳ chọn nâng cao', gap > 0);
  const nut = kn.indexOf('id="kSyncAll"');
  t('nút Đồng bộ nằm TRƯỚC khối gấp lại', nut > 0 && nut < gap);
  ['kTest', 'kPreviewAll'].forEach((id) => {
    const i = kn.indexOf(`id="${id}"`);
    t(`${id} cũng nằm ngoài khối gấp lại`, i > 0 && i < gap);
  });
  /* Bốn ô kỹ thuật và cả nhập CSV thì vào trong. */
  ['oNgay', 'oGio', 'oKhiKhoiDong', 'oTaoMoi', 'kSave', 'cPlat', 'cFile', 'cImport']
    .forEach((id) => t(`${id} nằm trong khối gấp lại`, kn.indexOf(`id="${id}"`) > gap));
  t('vẫn còn thẻ CSV như đường lùi', /Nhập từ file CSV[\s\S]{0,120}?đường lùi/.test(kn));
}

console.log('— ô "ghi đè lên dòng nhập tay" bỏ hẳn, không phải ẩn đi');
{
  /* Bỏ tab nhập tay rồi thì không còn dòng nhập tay mới, nên ô này chỉ còn một
   * câu trả lời đúng. Để lại là bắt người ta quyết một việc không có gì để quyết. */
  t('không còn ô oGhiDe', !kn.includes('oGhiDe'));
  /* Nhưng giá trị vẫn phải được gửi, và gửi là true: nếu bỏ luôn thì cấu hình cũ
   * nào đang để tắt sẽ nằm im mãi ở tắt. */
  t('lưu tuỳ chọn vẫn gửi ghiDeNhapTay: true', /ghiDeNhapTay:\s*true/.test(kn));
}

console.log('— thẻ "Giữ cấu hình qua lần deploy" chỉ hiện khi câu nó nói là đúng');
{
  /* Trên máy cá nhân ổ đĩa không phải ổ tạm và cũng chẳng có deploy nào, mà thẻ
   * vẫn nói "deploy là mất". Cùng loại lỗi với "cần hai bản xuất Excel". */
  t('có điều kiện oDiaTam', /function theGiuBen[\s\S]{0,400}?!c\.oDiaTam/.test(kn));

  /* Băng cảnh báo nói "Bấm Lấy nội dung ADS_CONNECT_JSON NGAY DƯỚI ĐÂY", nên thẻ
   * phải thật sự ở ngay dưới. Tôi đã một lần dời nó xuống cuối tab và làm câu đó
   * trỏ vào chỗ không có gì — cùng lỗi với băng gọi tên nút "Lấy lại quyền". */
  const bang = kn.indexOf('ngay dưới đây');
  const the = kn.indexOf('${theGiuBen(c)}');
  const kenh = kn.indexOf('c.providers.filter(hienKenh)');
  t('băng cảnh báo có trỏ xuống dưới', bang > 0);
  t('thẻ đứng ngay dưới băng, trước các thẻ kênh', the > 0 && the < kenh);
  t('nút mà băng gọi tên đúng là nút có thật',
    kn.includes('Lấy nội dung ADS_CONNECT_JSON'));
}

console.log('— khối điều khiển: không bày nút mà bấm vào sẽ lỗi');
{
  /* Nguyên tắc số một của khối này. Đo thật ngày 10/09/2026: Facebook và TikTok
   * đều thiếu quyền ghi. Bày nút "Tắt quảng cáo" ở đó là hứa một việc app không
   * làm được — và anh Hùng chỉ biết sau khi đã bấm. */
  t('có hàm vẽ khối điều khiển', /async function veDieuKhien\(/.test(app));
  t('hộp chi tiết quảng cáo gọi nó', /veDieuKhien\(a\);/.test(app));
  t('hỏi quyền trước khi vẽ', /\/api\/dieu-khien\/kha-nang/.test(app));
  t('nút chỉ hiện khi ĐO ĐƯỢC là ghi được', /q\.ghi !== true/.test(app));
  t('chưa ghi được thì nói vì sao', /Chưa bật\/tắt được/.test(app));
  t('và chỉ cách cấp quyền', /Cách cấp quyền/.test(app));
  /* Vẫn phải cho đường làm việc: link sang nền tảng. Chặn nút mà không chỉ đường
   * nào khác là bỏ mặc người dùng. */
  t('vẫn hiện link mở nền tảng khi chưa ghi được', /lienKet/.test(app));
}

console.log('— trạng thái hiện ra phải là trạng thái THẬT');
{
  /* Base là ảnh chụp lúc đồng bộ gần nhất, có thể đã cũ vài giờ. Bấm tắt dựa
   * trên số cũ là bấm dựa trên một điều có thể không còn đúng. */
  t('đọc trạng thái từ nền tảng, không từ Base', /\/api\/dieu-khien\/xem-truoc/.test(app));
  t('nói rõ là đọc thẳng từ nền tảng', /Đọc thẳng từ nền tảng/.test(app));
  /* Đo thật: nhóm ACTIVE mà effective_status là CAMPAIGN_PAUSED — bật lên vẫn
   * không chạy. Chỉ hiện cái đầu là app nói một điều không đúng. */
  t('hiện CẢ trạng thái thật khi nó khác', /trangThaiThat/.test(app));
  t('có bảng dịch trạng thái ra tiếng người', /CAMPAIGN_PAUSED:/.test(app));
}

console.log('— xác nhận trước khi ghi phải in đủ số để quyết');
{
  /* Hộp xác nhận là hàng rào cuối. Nó phải in đủ thứ để người bấm biết mình đang
   * bấm cái gì — chứ không phải "Bạn có chắc không?". */
  const iBat = app.indexOf("$('#dkBatTat').onclick");
  const khoiBat = app.slice(iBat, iBat + 2200);
  ['a.name', 'a.campaignName', 'a.spend', 'a.conversions', 'a.cpa', 'a.action', 'a.reason']
    .forEach((x) => t(`xác nhận bật/tắt in ${x}`, khoiBat.includes(x)));
  t('và nói rõ là đổi THẬT trên nền tảng', /đổi thật trên/.test(khoiBat));

  /* Neo vào chỗ GẮN xử lý, không vào chỗ khai nút: `dkDoiNS` xuất hiện lần đầu
   * trong HTML của nút, cách xử lý cả nghìn ký tự — cắt từ đó thì lát cắt không
   * chứa hộp xác nhận, và test đo nhầm chỗ. Tôi đã cắt sai đúng như vậy. */
  const iNS = app.indexOf("$('#dkDoiNS').onclick");
  const khoiNS = app.slice(iNS, iNS + 3000);
  t('xác nhận ngân sách in số cũ và số mới', /vnd\(nsCu\)/.test(khoiNS) && /vnd\(moi\)/.test(khoiNS));
  t('và in phần trăm thay đổi', /pctDoi/.test(khoiNS));
  t('và in ngân sách đặt ở CẤP nào', /cấp:/.test(khoiNS));
  t('và gọi đúng tên: lệnh TIÊU TIỀN', /TIÊU TIỀN/.test(khoiNS));
  /* Google đặt ngân sách ở campaign_budget — resource riêng mà nhiều chiến dịch
   * chia nhau được. Đổi tưởng một, thật ra đổi cả nhóm. */
  t('cảnh báo khi ngân sách dùng chung nhiều chiến dịch', /dùng chung cho/.test(khoiNS));

  /* Đọc-trước-khi-ghi: không có soTienCu thì server không phát hiện được là màn
   * hình đang hiện số cũ, và app ghi đè lên việc của người khác. */
  t('gửi kèm soTienCu để server đối chiếu', /soTienCu: nsCu/.test(khoiNS));
}

console.log('— sau khi ghi, không được nói quá');
{
  /* Ghi lên nền tảng KHÔNG làm số trong Base đổi theo. Không nói ra thì anh Hùng
   * bấm Làm mới, thấy số cũ, và tưởng lệnh không ăn. */
  t('nói rõ Base chưa đổi theo', /Base chưa đổi theo/.test(app));
  t('nói rõ phải chờ lượt đồng bộ kế tiếp', /đồng bộ kế tiếp/.test(app));
}

console.log('— thẻ kênh tự nói được "quyền GHI đã có chưa"');
{
  /* Anh Hùng đã ba lần phải nhắn hỏi "kiểm tra lại" sau mỗi lần đi cấp quyền
   * trên Facebook/TikTok. App biết câu trả lời — /api/dieu-khien/kha-nang dò
   * thẳng nền tảng — nhưng chỉ nói trong hộp chi tiết của một quảng cáo, mà lúc
   * vừa cấp quyền xong thì người ta đang đứng ở tab Kết nối. Bắt người dùng đi
   * hỏi người khác một điều app tự trả lời được là lỗi của app. */
  t('thẻ kênh có ô Quyền ghi', /Quyền ghi/.test(kn));
  t('có hàm dò', /async function doQuyenGhi/.test(kn));
  t('dò ngay khi mở tab', /\n\s*doQuyenGhi\(\);/.test(kn));
  t('và có nút dò lại tại chỗ', kn.includes('id="kQuyenGhi"'));

  /* Đọc số và ghi số là HAI quyền khác nhau. Ô "Token: đã có" chỉ nói về quyền
   * đọc, nên nó không thay được ô này. */
  t('phân biệt được ba trạng thái', /bật\/tắt được/.test(kn)
    && /chưa cấp quyền/.test(kn) && /chưa rõ/.test(kn));
  t('chưa cấp quyền thì in luôn CÁCH cấp', /Cách cấp:/.test(kn));

  /* PLAT_OF gán cả googleSheet lẫn googleAds về "Google Ads". Khoá ô theo TÊN
   * nền tảng thì hai thẻ khác nhau dính chung một câu trả lời — tôi đã viết sai
   * đúng như vậy ở bản đầu. */
  t('ô khoá theo key kênh, không theo tên nền tảng',
    /data-quyen-ghi="\$\{esc\(p\.key\)\}"/.test(kn));
  t('có bảng đổi tên nền tảng sang key', /KEY_CUA/.test(kn));

  /* Kênh không điều khiển được thì phải nói "không áp dụng"; để nó đứng
   * "đang dò…" mãi là một lời nói sai nhỏ mà không bao giờ tự sửa. */
  t('kênh không có trong câu trả lời thì nói không áp dụng', /không áp dụng/.test(kn));
}

console.log('— trạng thái nền tảng phải ra tiếng người, và không tự nói ngược');
{
  /* Đo thật sau khi nối xong TikTok: AD_STATUS_DELIVERY_OK và
   * ADGROUP_STATUS_DELIVERY_OK rơi thẳng ra màn hình, vì bảng dịch chỉ có mã của
   * Meta. Cùng loại lỗi với bảng hành động chuyển đổi hồi trước. */
  const i = app.indexOf('const nhanTT =');
  t('có hàm dịch trạng thái', i > 0);
  let nhanTT = null;
  if (i > 0) {
    /* Kéo cả bảng dịch lẫn hàm ra chạy thật, thay vì chỉ dò chữ trong mã nguồn. */
    const j = app.indexOf('const NHAN_TRANG_THAI');
    const k = app.indexOf('};', i);
    nhanTT = new Function(app.slice(j, k + 2) + '; return nhanTT;')();
  }

  /* TikTok đặt tên <CẤP>_STATUS_<TÌNH TRẠNG>, ba cấp chung một bộ hậu tố. Bỏ tiền
   * tố rồi tra hậu tố thì một bảng phủ cả ba — khỏi khai ba lần, khỏi sót. */
  t('dịch được mã cấp quảng cáo của TikTok', nhanTT('AD_STATUS_DELIVERY_OK') === 'đang chạy',
    nhanTT && nhanTT('AD_STATUS_DELIVERY_OK'));
  t('dịch được mã cấp nhóm của TikTok', nhanTT('ADGROUP_STATUS_DELIVERY_OK') === 'đang chạy');
  t('dịch được mã cấp chiến dịch của TikTok',
    nhanTT('CAMPAIGN_STATUS_DELIVERY_OK') === 'đang chạy');
  t('vẫn dịch được mã của Meta', nhanTT('ACTIVE') === 'đang chạy'
    && nhanTT('CAMPAIGN_PAUSED') === 'chiến dịch đang tắt');
  t('mã chưa biết thì hiện NGUYÊN VĂN, không đoán bừa',
    nhanTT('MOT_MA_HOAN_TOAN_MOI') === 'MOT_MA_HOAN_TOAN_MOI');

  /* Màn hình từng viết "đang chạy — nhưng thực tế đang chạy": phép so đang so MÃ
   * MÁY (`ENABLE` khác `AD_STATUS_DELIVERY_OK`) trong khi dịch ra thì y hệt. */
  t('so trạng thái SAU KHI DỊCH, không so mã máy',
    /nhanTT\(t\.trangThaiThat\) !== nhanTT\(t\.trangThai\)/.test(app));
  t('ô kết quả sau khi ghi cũng so sau khi dịch',
    /nhanTT\(s2\.trangThaiThat\) !== nhanTT\(s2\.trangThai\)/.test(app));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
