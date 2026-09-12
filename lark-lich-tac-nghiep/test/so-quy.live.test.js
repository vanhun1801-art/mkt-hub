'use strict';
/**
 * ============================================================================
 * GHI SỔ QUỸ + CHÉP CHỨNG TỪ — phép thử CHẠM HỆ THỐNG THẬT
 * ============================================================================
 *
 *   node test/so-quy.live.test.js --that      (app Lịch tác nghiệp chạy ở 5174)
 *
 * Lấy một buổi tác nghiệp THẬT đã có tệp đính kèm, ghi một dòng 10.000 đ vào sổ
 * quỹ kèm chép chứng từ, kiểm tra tệp có sang thật không, rồi xoá dòng đó.
 *
 * Vì sao phải chạm thật: chép tệp đi qua bốn bước — tải từ Base lịch, ghi ra ổ
 * tạm, tải lên Base quỹ, rồi đọc lại. Ba trong bốn bước đó không có cách nào
 * giả lập cho đúng, và chính đoạn này tôi đã viết chú thích là "kèm hai tệp
 * nhân sự đã nộp" trong khi code chưa hề chép gì.
 */
const soQuy = require('../so-quy');
const cfg = require('../config');
const lark = cfg.mode === 'api' ? require('../larkapi') : require('../lark');

if (!process.argv.includes('--that')) {
  console.log('Phép thử này ghi một dòng THẬT vào sổ quỹ rồi tự xoá. Chạy lại với --that.');
  process.exit(0);
}

const APP = process.env.APP_URL || 'http://localhost:5174';
let pass = 0, fail = 0;
function ok(ten, dieu, chiTiet) {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : '')); }
}

(async () => {
  console.log('\n\x1b[1mChép chứng từ từ Base lịch sang sổ quỹ\x1b[0m');

  /* Tìm một buổi tác nghiệp thật có tệp — không tự tạo, vì mục đích là thử
   * đường đi với dữ liệu y như thật. */
  let lich = null;
  try {
    const r = await fetch(APP + '/api/meta');
    const m = await r.json();
    lich = (m.items || []).find((t) => (t.files || []).length || (t.unc || []).length);
  } catch (e) {
    console.error('Không gọi được app Lịch tác nghiệp ở ' + APP + ': ' + e.message);
    process.exit(1);
  }
  if (!lich) { console.log('  Không có lịch nào kèm tệp — bỏ qua.'); process.exit(0); }
  console.log('  dùng lịch: ' + lich.title + ' (' + ((lich.files || []).length) + ' tệp, '
    + ((lich.unc || []).length) + ' UNC)');

  const kq = await soQuy.ghiKhoanChi({ ...lich, title: 'TEST chép chứng từ - huy giup', costActual: 10000 });
  ok('ghi được dòng vào sổ quỹ', !!kq.id, JSON.stringify(kq));
  ok('có chép được ít nhất một tệp', kq.chep > 0, 'chép ' + kq.chep + ' · ' + (kq.loiTep || ''));

  if (kq.id) {
    const cf = soQuy.docCauHinh();
    const rows = await lark.listAllRecords(cf.chiTableId, cf.baseToken);
    const rec = rows.find((r) => r.record_id === kq.id);
    const coTep = Object.values((rec && rec.cells) || {})
      .some((v) => Array.isArray(v) && v.some((x) => x && (x.file_token || x.token)));
    ok('đọc lại thấy tệp nằm trong dòng chi', coTep, 'không thấy ô đính kèm nào có tệp');

    await lark.deleteRecords([kq.id], cf.chiTableId, cf.baseToken);
    console.log('  đã xoá dòng thử');
  }

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
  if (fail) process.exit(1);
})();
