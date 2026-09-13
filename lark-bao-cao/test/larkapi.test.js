'use strict';
/**
 * ============================================================================
 * Lớp gọi Open API (chế độ chạy trên Render) — bắt lỗi chỉ-lộ-khi-deploy
 * ============================================================================
 * App có HAI đường xuống Base: `lark.js` gọi lark-cli (chạy trên máy) và
 * `larkapi.js` gọi Open API bằng tenant token (chạy trên Render). Mọi phép thử
 * trên máy chỉ đi đường thứ nhất, nên một lỗi ở đường thứ hai đi thẳng lên bản
 * thật mà không ai thấy.
 *
 * Đã dính đúng thế ngày 13/09/2026: `createMany` viết theo dạng thân của
 * Bitable Open API (`{records: [{fields}]}`) và tự ghép một URL khác, trong khi
 * cả file này dùng endpoint `/base/v3/` với dạng bảng (`{fields, rows}`). Trên
 * máy chạy ngon cả ngày; anh Hùng nộp báo cáo trên Render thì nhận
 * "Lark API 1254045: FieldNameNotFound" — không ai nộp được gì.
 *
 * Cách bắt: chặn `fetch`, gọi thật từng hàm, rồi soi URL và thân yêu cầu.
 * Không cần mạng, không cần khoá thật.
 *
 * Chạy: node test/larkapi.test.js
 */
process.env.LARK_MODE = 'api';
process.env.LARK_APP_ID = 'cli_test';
process.env.LARK_APP_SECRET = 'secret_test';

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

/* ---- fetch giả: ghi lại mọi lượt gọi, trả về thành công rỗng ---- */
const goi = [];
global.fetch = async (url, opts) => {
  const than = opts && opts.body ? JSON.parse(opts.body) : null;
  goi.push({ url: String(url), method: (opts && opts.method) || 'GET', than });
  if (String(url).includes('tenant_access_token')) {
    return { json: async () => ({ code: 0, tenant_access_token: 'tok', expire: 7200 }) };
  }
  return { json: async () => ({ code: 0, data: {} }) };
};

const api = require('../larkapi');
const cfg = require('../config');
const F = cfg.fields;
const cuoi = () => goi[goi.length - 1];

(async () => {
  group('Mọi đường ghi phải dùng CÙNG endpoint');
  {
    goi.length = 0;
    await api.createRecord({ [F.phieu.ma.id]: 'x' });
    const tao1 = cuoi();
    goi.length = 0;
    await api.createMany([{ [F.dong.congViec.id]: 'a' }], cfg.dongTableId);
    const taoN = cuoi();

    ok('createRecord đi qua /base/v3/', /\/open-apis\/base\/v3\/bases\//.test(tao1.url),
      'đang gọi: ' + tao1.url);
    ok('createMany cũng đi qua /base/v3/', /\/open-apis\/base\/v3\/bases\//.test(taoN.url),
      'đang gọi: ' + taoN.url + ' — tự ghép một URL khác là lỗi đã xảy ra thật');
    ok('createMany KHÔNG dùng endpoint bitable/v1',
      !/bitable\/v1/.test(taoN.url),
      'hai endpoint có dạng thân khác hẳn nhau; trộn vào là 1254045 FieldNameNotFound');
    ok('cùng đường batch_create', /\/records\/batch_create$/.test(tao1.url) &&
      /\/records\/batch_create$/.test(taoN.url));
    ok('createMany ghi vào ĐÚNG bảng được truyền',
      taoN.url.includes(cfg.dongTableId),
      'đang gọi: ' + taoN.url);
  }

  group('Dạng thân yêu cầu — bảng (fields + rows), không phải records');
  {
    goi.length = 0;
    await api.createMany([
      { [F.dong.congViec.id]: 'việc A', [F.dong.phut.id]: 60 },
      /* Dòng thứ hai THIẾU một cột — chỗ dễ làm lệch bảng nhất. */
      { [F.dong.congViec.id]: 'việc B' },
    ], cfg.dongTableId);
    const t = cuoi().than;

    ok('thân có mảng `fields`', Array.isArray(t.fields), JSON.stringify(t).slice(0, 160));
    ok('thân có mảng `rows`', Array.isArray(t.rows));
    ok('KHÔNG có khoá `records`', !('records' in t),
      'đó là dạng của bitable/v1 — endpoint này không hiểu');
    ok('gom đủ cột của MỌI dòng, không chỉ dòng đầu', t.fields.length === 2,
      'đang ra: ' + JSON.stringify(t.fields));
    ok('mỗi dòng dài đúng bằng số cột',
      t.rows.every((r) => r.length === t.fields.length));
    ok('ô thiếu điền null, không lệch cột',
      t.rows[1][t.fields.indexOf(F.dong.phut.id)] === null,
      'đang ra: ' + JSON.stringify(t.rows[1]));
    ok('giá trị rơi đúng cột',
      t.rows[0][t.fields.indexOf(F.dong.congViec.id)] === 'việc A' &&
      t.rows[0][t.fields.indexOf(F.dong.phut.id)] === 60);

    goi.length = 0;
    const rong = await api.createMany([], cfg.dongTableId);
    ok('mảng rỗng thì không gọi mạng', goi.length === 0 && Array.isArray(rong.records));
  }

  group('Sửa và xoá — giữ nguyên chữ ký của lark.js');
  {
    goi.length = 0;
    await api.updateRecord('rec1', { [F.phieu.ma.id]: 'y' });
    const t = cuoi();
    ok('update đi qua batch_update', /\/records\/batch_update$/.test(t.url));
    ok('khoá theo record_id', !!t.than.update_records && !!t.than.update_records.rec1);

    goi.length = 0;
    await api.deleteRecords(['rec1', 'rec2']);
    ok('xoá đi qua batch_delete', /\/records\/batch_delete$/.test(cuoi().url));
    ok('gửi đúng danh sách id',
      JSON.stringify(cuoi().than.record_id_list) === '["rec1","rec2"]');
  }

  group('Hai backend phải có CÙNG bộ hàm');
  {
    /* server.js và kho.js chọn backend bằng `cfg.mode === 'api'`. Thiếu một hàm
     * ở một bên thì bên đó nổ "is not a function" — và chỉ nổ ở môi trường dùng
     * backend ấy, tức là đúng lúc đang chạy thật. */
    delete require.cache[require.resolve('../lark')];
    process.env.LARK_MODE = 'cli';
    delete require.cache[require.resolve('../config')];
    const cliMod = require('../lark');
    process.env.LARK_MODE = 'api';
    delete require.cache[require.resolve('../config')];

    const thieu = Object.keys(cliMod).filter((k) => typeof api[k] !== 'function' &&
      typeof cliMod[k] === 'function');
    ok('larkapi có đủ mọi hàm mà lark.js có', thieu.length === 0,
      'thiếu: ' + thieu.join(', '));
  }

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('NỔ: ' + e.stack); process.exit(1); });
