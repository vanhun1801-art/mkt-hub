'use strict';
/**
 * ============================================================================
 * LÕI LARK DÙNG CHUNG (lark-core.js) — hai họ chữ ký, hai chế độ, chia lô, kho hub
 * ============================================================================
 * Không cần Lark thật: chế độ api chặn `fetch` và soi URL + thân yêu cầu; chế độ
 * cli không chạy được ở đây (cần lark-cli) nên chỉ thử phần không gọi ra ngoài.
 *
 * Điều phải đúng — mỗi dòng là một lỗi từng xảy ra thật ở một trong 12 app:
 *   - họ A trả { id, c }, họ B trả { record_id, cells }
 *   - createMany dùng CÙNG endpoint /base/v3/…/batch_create dạng { fields, rows }
 *     (13/09/2026: một app tự ghép URL bitable/v1 -> 1254045 FieldNameNotFound)
 *   - dòng thiếu cột được điền null, không làm lệch bảng
 *   - chia lô 200 dòng VÀ theo độ dài JSON (Social: ENAMETOOLONG trên Windows)
 *   - getRecord (api) lật hết trang, không chỉ trang đầu (bản ghi mới nằm cuối)
 *   - 800004135 / 99991400 là lỗi tạm thời; 91403 thì không
 *   - có HUB_KHO_URL thì đọc trang hỏi hub trước, hub hỏng thì đọc thẳng
 *
 * Chạy: node test/lark-core.test.js
 */
process.env.LARK_APP_ID = 'cli_test';
process.env.LARK_APP_SECRET = 'secret_test';
const http = require('http');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; fails.push(ten); console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

/* ---- fetch giả ---- */
const goi = [];
let trangTra = () => ({ code: 0, data: { field_id_list: ['f1'], record_id_list: ['r1'], data: [['a']], has_more: false } });
global.fetch = async (url, opts) => {
  const than = opts && opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : null;
  goi.push({ url: String(url), method: (opts && opts.method) || 'GET', than });
  if (String(url).includes('tenant_access_token')) return { json: async () => ({ code: 0, tenant_access_token: 'tok', expire: 7200 }) };
  if (/\/records\?/.test(String(url))) return { json: async () => trangTra(String(url)) };
  return { json: async () => ({ code: 0, data: { record_id_list: ['rNew'] } }) };
};
const cuoi = () => goi[goi.length - 1];

const core = require('../lark-core');
const cfg = { mode: 'api', identity: 'user', baseToken: 'BASE_APP', appId: 'cli_test', appSecret: 'secret_test', apiHost: 'https://open.larksuite.com' };

(async () => {
  group('Chia lô');
  {
    const lo = core.chiaLo(Array.from({ length: 450 }, (_, i) => i), () => 10);
    ok('450 dòng ngắn -> 3 lô (200/200/50)', lo.length === 3 && lo[0].length === 200 && lo[2].length === 50);
    const dai = core.chiaLo(Array.from({ length: 10 }, () => 'x'), () => 10000);
    ok('dòng dài -> mỗi lô 2 dòng vì trần 24k ký tự', dai.length === 5 && dai[0].length === 2);
    const mot = core.chiaLo(['x'], () => 99999);
    ok('một dòng tự nó quá dài vẫn được gửi riêng', mot.length === 1 && mot[0].length === 1);
  }

  group('Hình dạng bản ghi theo họ');
  {
    const d = { field_id_list: ['f1', 'f2'], record_id_list: ['r1'], data: [['a', 'b']] };
    const A = core.cotThanhBanGhi(d, 'A')[0], B = core.cotThanhBanGhi(d, 'B')[0];
    ok('họ A: { id, c }', A.id === 'r1' && A.c.f2 === 'b' && !('cells' in A));
    ok('họ B: { record_id, cells }', B.record_id === 'r1' && B.cells.f1 === 'a' && !('c' in B));
  }

  group('Lỗi tạm thời');
  {
    const e = (s) => new Error(s);
    ok('cli: 800004135 thử lại', core.loiTamThoiCli(e('lark-cli lỗi: {"code":800004135}')));
    ok('cli: i/o timeout thử lại', core.loiTamThoiCli(e('dial tcp: i/o timeout')));
    ok('cli: 91403 (quyền) KHÔNG thử lại', !core.loiTamThoiCli(e('Lark 91403 permission denied')));
    ok('api: 99991400 thử lại', core.loiTamThoiApi(99991400, 200));
    ok('api: HTTP 503 thử lại', core.loiTamThoiApi(0, 503));
    ok('api: 1254045 (sai cột) KHÔNG thử lại', !core.loiTamThoiApi(1254045, 200));
  }

  group('Họ A, chế độ api');
  {
    const A = core.taoLark(cfg, { ho: 'A', mode: 'api', thuMuc: __dirname });
    goi.length = 0;
    const ds = await A.listAll('tblX');
    ok('listAll đi /base/v3/bases/BASE_APP/tables/tblX/records', /\/base\/v3\/bases\/BASE_APP\/tables\/tblX\/records\?limit=200&offset=0/.test(cuoi().url), cuoi().url);
    ok('trả { id, c }', ds.length === 1 && ds[0].id === 'r1' && ds[0].c.f1 === 'a');
    goi.length = 0;
    const id = await A.createRecord('tblX', { f1: 'v' });
    ok('createRecord -> batch_create dạng { fields, rows } và trả record_id', /batch_create$/.test(cuoi().url) && cuoi().than.fields[0] === 'f1' && cuoi().than.rows[0][0] === 'v' && id === 'rNew', JSON.stringify(cuoi().than));
    goi.length = 0;
    const ids = await A.createMany('tblX', [{ f1: 'a' }, { f2: 'b' }]);
    ok('createMany: hợp cột, ô thiếu = null', cuoi().than.fields.join() === 'f1,f2' && cuoi().than.rows[1][0] === null && cuoi().than.rows[1][1] === 'b', JSON.stringify(cuoi().than));
    ok('createMany trả mảng id', Array.isArray(ids) && ids[0] === 'rNew');
    goi.length = 0;
    const n = await A.updateMany('tblX', { r1: { f1: 1 }, r2: { f1: 2 } });
    ok('updateMany -> batch_update { update_records } và trả số dòng', /batch_update$/.test(cuoi().url) && cuoi().than.update_records.r2.f1 === 2 && n === 2);
    goi.length = 0;
    await A.deleteRecords('tblX', ['r1']);
    ok('deleteRecords -> batch_delete { record_id_list }', /batch_delete$/.test(cuoi().url) && cuoi().than.record_id_list[0] === 'r1');
    ok('cli() ở chế độ api ném lỗi rõ', await A.cli().then(() => false, (e) => /không dùng lark-cli/i.test(e.message)));
    ok('whoami api = null', (await A.whoami()) === null);
  }

  group('Họ B, chế độ api');
  {
    const B = core.taoLark(cfg, { ho: 'B', mode: 'api', thuMuc: __dirname, bangMacDinh: 'tblMD' });
    goi.length = 0;
    const ds = await B.listAllRecords();
    ok('listAllRecords không tham số -> bảng mặc định', /tables\/tblMD\/records/.test(cuoi().url));
    ok('trả { record_id, cells }', ds[0].record_id === 'r1' && ds[0].cells.f1 === 'a');
    goi.length = 0;
    await B.listAllRecords('tblKhac', 'BASE_KHAC');
    ok('tham số base -> ghi sang Base khác', /bases\/BASE_KHAC\/tables\/tblKhac/.test(cuoi().url));
    goi.length = 0;
    await B.updateRecord('r1', { f1: 'x' }, 'tblMD');
    ok('updateRecord(id, fields, table)', cuoi().than.update_records.r1.f1 === 'x');
    goi.length = 0;
    const tho = await B.createMany([{ f1: 'a' }], 'tblMD');
    ok('createMany họ B trả kết quả thô có record_id_list', tho && tho.record_id_list && tho.record_id_list[0] === 'rNew');
    ok('createMany rỗng -> { records: [] } không gọi Lark', JSON.stringify(await B.createMany([])) === '{"records":[]}');

    /* getRecord phải lật hết trang */
    let dem = 0;
    trangTra = (url) => {
      dem++;
      const off = Number(/offset=(\d+)/.exec(url)[1]);
      return off === 0
        ? { code: 0, data: { field_id_list: ['f1'], record_id_list: ['r1'], data: [['a']], has_more: true } }
        : { code: 0, data: { field_id_list: ['f1'], record_id_list: ['rCuoi'], data: [['z']], has_more: false } };
    };
    const rec = await B.getRecord('rCuoi');
    ok('getRecord (api) lật sang trang 2 để thấy bản ghi mới tạo', rec && rec.record_id === 'rCuoi' && dem === 2, 'dem=' + dem);
    trangTra = () => ({ code: 0, data: { field_id_list: ['f1'], record_id_list: ['r1'], data: [['a']], has_more: false } });
  }

  group('Kho Base ở hub: hỏi hub trước, hub hỏng thì đọc thẳng');
  {
    /* Hub giả: trả trang có dấu hiệu riêng, rồi "chết" (502). */
    let hubTra = 200;
    const srv = http.createServer((req, res) => {
      if (hubTra !== 200) { res.writeHead(hubTra); return res.end(); }
      if (/\/records/.test(req.url)) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ field_id_list: ['f1'], record_id_list: ['tuHub'], data: [['h']], has_more: false })); }
      if (/\/fields/.test(req.url)) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ fields: [{ id: 'f1', name: 'Từ hub' }] })); }
      res.writeHead(200); res.end('{"ok":true}');
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    process.env.HUB_KHO_URL = 'http://127.0.0.1:' + srv.address().port + '/_noi-bo/kho';
    process.env.HUB_KHOA_NOI_BO = 'k';
    delete require.cache[require.resolve('../kho-hub')];
    delete require.cache[require.resolve('../lark-core')];
    const core2 = require('../lark-core');
    const A = core2.taoLark(cfg, { ho: 'A', mode: 'api', thuMuc: __dirname });
    goi.length = 0;
    const ds = await A.listAll('tblX');
    ok('có hub -> bản ghi lấy từ hub, KHÔNG gọi Lark', ds[0].id === 'tuHub' && goi.length === 0, 'goi Lark ' + goi.length);
    const cot = await A.listFields('tblX');
    ok('cột cũng lấy từ hub', cot[0].name === 'Từ hub');
    hubTra = 502;
    goi.length = 0;
    const ds2 = await A.listAll('tblX');
    ok('hub hỏng -> tự đọc Lark, không gãy', ds2[0].id === 'r1' && goi.length >= 1);
    hubTra = 200;
    const soRecords = () => goi.filter((g) => /\/records\?/.test(g.url)).length;
    goi.length = 0;
    const rec = await A.getRecord('tblX', 'r1');
    ok('getRecord không qua kho (luôn mới nhất) -> gọi thẳng Lark', rec && rec.id === 'r1' && soRecords() === 1, 'goi Lark ' + soRecords());
    const T = core2.taoLark(cfg, { ho: 'A', mode: 'api', thuMuc: __dirname, khongQuaHub: true });
    goi.length = 0;
    await T.listAll('tblX');
    ok('khongQuaHub -> đọc thẳng Lark', soRecords() === 1, 'goi Lark ' + soRecords());
    srv.close();
    delete process.env.HUB_KHO_URL;
  }

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
