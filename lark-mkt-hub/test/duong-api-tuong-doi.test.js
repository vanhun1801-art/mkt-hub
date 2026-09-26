'use strict';
/**
 * ============================================================================
 * APP CON PHẢI GỌI API BẰNG ĐƯỜNG TƯƠNG ĐỐI, KHÔNG ĐƯỢC CÓ GẠCH CHÉO ĐẦU
 * ============================================================================
 * Mỗi app con chạy được ở HAI chỗ:
 *   · một mình, ở cổng riêng      -> tài liệu ở  http://localhost:5177/
 *   · trong Marketing Hub          -> tài liệu ở  https://hub/m/<id>/
 *
 * Viết `'/api/export.csv'` thì gạch chéo đầu trỏ về GỐC, tức là về HUB — mà hub
 * không có route đó, nên trả 404. Viết `'api/export.csv'` thì trình duyệt giải
 * theo tài liệu hiện tại và ra đúng `/m/<id>/api/export.csv` ở cả hai chỗ.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO PHẢI CÓ PHÉP THỬ NÀY — lỗi này IM LẶNG với người viết code:
 *
 * Mở app một mình để thử thì `/api/...` chạy đúng. Chỉ khi mở trong hub — tức
 * là cách mà CẢ PHÒNG dùng hằng ngày — nó mới gãy. Nên sửa xong thử ở cổng
 * riêng thấy ngon, đẩy lên rồi mới hỏng.
 *
 * Đo ngày 27/09/2026, tìm thấy 8 chỗ ở 4 app, đều đã hỏng trong hub:
 *   · Bảng công việc — 3 chỗ TẢI TỆP ĐÍNH KÈM lên công việc (nặng nhất: app
 *     bắt buộc có tệp hoặc link mới cho chuyển sang "Hoàn thành", nên hỏng chỗ
 *     này là chặn người ta báo xong việc), và 1 nút mở báo cáo
 *   · Quản lý quảng cáo — 2 nút Xuất CSV
 *   · Booking OTA — 1 nút Xuất CSV
 *   · Báo cáo công việc — 1 nút xuất
 * Kiểm thật: đường app đang gọi trả 404, đường qua module trả 200.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '\n      ' + vi : '')); }
};

const GOC = path.join(__dirname, '..', '..');
const APP = ['lark-task-manager', 'lark-lich-tac-nghiep', 'lark-ads-manager',
  'lark-ota-manager', 'lark-social', 'lark-chinh-anh', 'lark-kpi',
  'lark-quy-chi-phi', 'lark-bao-cao', 'lark-san-pham', 'lark-lich-lam-viec', 'lark-kol'];

/* Chỗ nào thật sự sinh ra một lời gọi mạng: fetch, đổi địa chỉ trang, mở tab
 * mới, hay thuộc tính href/src trong chuỗi HTML. */
const RE = /(?:fetch\s*\(|location\s*(?:\.href)?\s*=\s*|window\.open\s*\(|\bhref=|\bsrc=)\s*['"`]\/api\//g;

console.log('\nkhông app con nào gọi /api/… bằng đường tuyệt đối');

const dinh = [];
let soTepDaSoi = 0;

for (const app of APP) {
  const thuMuc = path.join(GOC, app, 'public');
  let ds;
  try { ds = fs.readdirSync(thuMuc).filter((f) => f.endsWith('.js')); } catch (_) { continue; }
  for (const ten of ds) {
    const p = path.join(thuMuc, ten);
    let s;
    try { s = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
    soTepDaSoi++;
    /* Bỏ chú thích: mấy tệp này giải thích chính cái bẫy đó bằng ví dụ
     * `'/api/…'`, đọc nhầm là phép thử báo lỗi bằng một đoạn văn. */
    const sach = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    const dong = sach.split('\n');
    dong.forEach((d, i) => {
      RE.lastIndex = 0;
      if (RE.test(d)) dinh.push(app + '/public/' + ten + ':' + (i + 1) + '  ' + d.trim().slice(0, 96));
    });
  }
}

ok('có soi được tệp nào không (phép thử không tự rỗng rồi báo đạt)',
  soTepDaSoi >= 12, 'mới soi ' + soTepDaSoi + ' tệp');

ok('không chỗ nào dùng /api/… có gạch chéo đầu',
  dinh.length === 0,
  dinh.length ? '\n      ' + dinh.join('\n      ') : '');

/* Chốt riêng bốn chỗ đã từng hỏng, để thông báo lỗi gọi đúng tên màn hình. */
const doc = (p) => { try { return fs.readFileSync(path.join(GOC, p), 'utf8'); } catch (_) { return ''; } };
ok('Bảng công việc — tải tệp đính kèm lên công việc',
  !/fetch\('\/api\/tasks\//.test(doc('lark-task-manager/public/app.js')));
ok('Quản lý quảng cáo — nút Xuất CSV',
  !/href="\/api\/export\.csv/.test(doc('lark-ads-manager/public/app.js')));
ok('Booking OTA — nút Xuất CSV',
  !/location = '\/api\/export\.csv/.test(doc('lark-ota-manager/public/app.js')));
ok('Báo cáo công việc — nút xuất',
  !/location\.href = '\/api\/xuat/.test(doc('lark-bao-cao/public/app.js')));

console.log('\nhub kéo iframe về khi app con lạc đường');
{
  /* Vá một nguyên nhân không bằng chặn cả hậu quả. Dù đường dẫn đã đúng, một
   * app con vẫn có thể tự điều hướng ra khỏi `/m/<id>/` vì lý do khác (chuyển
   * hướng đăng nhập, link quên target). Khi đó iframe KẸT lại ở trang kia và
   * bấm lại app ở panel cũng chỉ hiện trang chết — phải tải lại cả hub.
   *
   * Đã dựng lại đúng tình huống trong trình duyệt: ép iframe sang trang 404,
   * chuyển sang app khác rồi quay lại — iframe tự về /m/ota/ và app hiện lại. */
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  ok('có hàm kéo iframe về', app.indexOf('function keoIframeVeNeuLac(') >= 0);
  ok('so với đúng đường của module, không phải một chuỗi cứng',
    app.indexOf("'/m/' + encodeURIComponent(mod.id) + '/'") >= 0);

  /* Phải gọi trong moModule — tức là MỖI LẦN MỞ app. Đặt ở chỗ tạo khung thì
   * không ăn: trình duyệt còn khôi phục địa chỉ cũ của iframe từ lịch sử phiên
   * SAU khi khung đã dựng xong. Đã thử và thấy nó trượt đúng như vậy. */
  const i2 = app.indexOf('function moModule(');
  const than = i2 < 0 ? '' : app.slice(i2, app.indexOf('\nfunction ', i2 + 10));
  ok('gọi trong moModule, mỗi lần mở app', than.indexOf('keoIframeVeNeuLac(mod, o);') >= 0);
  ok('gọi TRƯỚC khi hiện khung ra',
    than.indexOf('keoIframeVeNeuLac') >= 0
    && than.indexOf('keoIframeVeNeuLac') < than.indexOf('o.wrap.hidden = false'));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
