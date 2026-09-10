'use strict';
/**
 * ============================================================================
 * NHẮC VIỆC — bấm là gửi, và nói thật gửi được hay không
 * ============================================================================
 * Hai lỗi đã gặp thật, chồng lên nhau:
 *
 *   1. Bấm "Nhắc nhận việc" thì app báo "Chưa bật gửi tin Lark (biến
 *      LARK_NOTIFY=1), nên chưa nhắc được." Cờ đó có để app khỏi TỰ ĐỘNG nhắn
 *      bừa lúc đang dựng, nhưng nó chặn luôn thao tác người bấm — nút chỉ để
 *      trưng. App Lịch tác nghiệp có nút Nhắc tương đương và gửi không cần cờ.
 *
 *   2. Kể cả khi bật cờ: baoTin() là gửi-rồi-quên và nuốt lỗi, còn endpoint
 *      trả ok ngay. Thiếu quyền im:message thì người bấm được báo "đã nhắc"
 *      mà bên kia không nhận gì.
 *
 * VÌ SAO ĐỌC MÃ NGUỒN thay vì gọi thật: đường thành công của /api/nhac GỬI TIN
 * LARK CHO NGƯỜI THẬT. Không có cách gọi nó trong phép thử mà không nhắn cho
 * đồng nghiệp, nên phép thử canh mấy bất biến ĐỌC ĐƯỢC từ mã. Cách này yếu hơn
 * gọi thật, nhưng nó bắt đúng thứ đã hỏng: cờ quay lại chặn thao tác tay, hoặc
 * endpoint quay về báo thành công mà không chờ kết quả.
 *
 * Chạy: node test/nhac.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const SV = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

/** Thân hàm/khối bắt đầu từ `moc`, cắt `n` ký tự — đủ để soi một hàm. */
const tu = (s, moc, n) => {
  const i = s.indexOf(moc);
  return i < 0 ? '' : s.slice(i, i + n);
};

/**
 * Thân của MỘT endpoint: từ `moc` tới endpoint kế tiếp.
 *
 * Cắt theo số ký tự thì tràn sang handler sau và bắt oan — đã bị đúng lỗi này:
 * cửa sổ 2600 ký tự chạm tới một baoTin() của endpoint khác, phép thử báo
 * "/api/nhac vẫn gọi baoTin" trong khi nó không hề gọi.
 */
const thanEndpoint = (s, moc) => {
  const i = s.indexOf(moc);
  if (i < 0) return '';
  const j = s.indexOf("if (p === '", i + moc.length);
  return boChuThich(s.slice(i, j < 0 ? s.length : j));
};

/**
 * Bỏ chú thích khối trước khi soi.
 *
 * Cũng đã bị đúng lỗi này: chú thích trong mã có câu "không dùng baoTin()",
 * thế là phép thử báo "/api/nhac vẫn gọi baoTin" — bắt chính lời giải thích
 * rằng mình KHÔNG gọi nó. Phép thử phải đọc mã, không đọc chú thích.
 *
 * Chỉ bỏ khối /* … *\/, không bỏ // : trong tệp có chuỗi 'https://…', cắt từ
 * dấu // tới hết dòng là ăn mất mã thật.
 */
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

(async () => {
  group('1. Thông báo TỰ ĐỘNG vẫn phải bị cờ chặn');
  {
    /* Đây là nửa còn lại của bài toán: gỡ cờ khỏi thao tác tay thì được, nhưng
     * gỡ luôn khỏi baoTin() là mở toang cửa nhắn cả phòng mỗi lần giao việc,
     * bình luận, hay tự phân phối. */
    const than = tu(SV, 'function baoTin(', 260);
    ok('baoTin() còn xét cfg.notify', /if \(!cfg\.notify/.test(than),
      than.split('\n')[1] || '(không đọc được thân hàm)');
  }

  group('2. Thao tác NGƯỜI BẤM không bị cờ chặn nữa');
  {
    const than = thanEndpoint(SV, "if (p === '/api/nhac'");
    ok('tìm được endpoint /api/nhac', than.length > 100);
    ok('không còn chặn bằng cfg.notify', !/cfg\.notify/.test(than),
      /cfg\.notify/.test(than) ? 'vẫn còn xét cfg.notify trong endpoint' : '');
    ok('không còn mã lỗi CHUA_BAT_TIN', !than.includes('CHUA_BAT_TIN'));
  }

  group('3. Gửi phải CHỜ kết quả, và trượt thì báo trượt');
  {
    const than = thanEndpoint(SV, "if (p === '/api/nhac'");
    ok('dùng guiTinNgay (có await) chứ không dùng baoTin',
      /await guiTinNgay\(/.test(than) && !/\bbaoTin\(/.test(than),
      /\bbaoTin\(/.test(than) ? 'vẫn gọi baoTin — gửi rồi quên, nuốt lỗi' : '');

    ok('gửi trượt thì trả mã GUI_TRUOT', than.includes('GUI_TRUOT'));

    /* Mốc chặn 6 tiếng chỉ được ghi SAU khi gửi được. Ghi trước thì một lần
     * trượt là khoá luôn 6 tiếng, cấp quyền xong vẫn không nhắc lại được. */
    const iTruot = than.indexOf('GUI_TRUOT');
    const iMoc = than.indexOf('daNhac.set');
    ok('mốc chặn 6 tiếng ghi SAU nhánh trượt', iTruot > -1 && iMoc > iTruot,
      'GUI_TRUOT ở ' + iTruot + ', daNhac.set ở ' + iMoc);

    const gtn = tu(SV, 'async function guiTinNgay(', 700);
    ok('guiTinNgay KHÔNG nuốt lỗi — có thu lại lỗi để trả về',
      /loi\.push\(/.test(gtn), '(không thấy chỗ thu lỗi)');
    ok('guiTinNgay không xét cfg.notify', !/cfg\.notify/.test(gtn));
  }

  group('4. Client phải hiện cả lời chỉ cách sửa');
  {
    /* Câu lỗi chỉ nói "không gửi được"; cách sửa nằm ở hint. Bỏ hint thì người
     * dùng biết là hỏng mà không biết làm gì. */
    const than = tu(APP, 'async function nhacNhanh(', 900);
    ok('nhacNhanh() hiện cả e.hint', /e\.hint/.test(than),
      than.includes('toast(e.message, true)') ? 'chỉ hiện e.message, bỏ mất hint' : '');
  }

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
