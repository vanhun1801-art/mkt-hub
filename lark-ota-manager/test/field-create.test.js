'use strict';
/* Kiểm đúng hợp đồng tạo field với Lark Base v3, không gọi mạng thật. */
process.env.LARK_APP_ID = 'cli_test';
process.env.LARK_APP_SECRET = 'secret_test';
process.env.OTA_BASE_TOKEN = 'bas_test';
process.env.LARK_API_HOST = 'https://open.larksuite.test';

const calls = [];
global.fetch = async (url, opts = {}) => {
  calls.push({ url, opts });
  if (url.endsWith('/open-apis/auth/v3/tenant_access_token/internal')) {
    return { status: 200, json: async () => ({ code: 0, tenant_access_token: 't-test', expire: 7200 }) };
  }
  return { status: 200, json: async () => ({ code: 0, data: { field_id: 'fld_test' } }) };
};

let pass = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
  const api = require('../larkapi');
  const out = await api.createField('tbl_test', {
    name: 'Giờ đón', type: 'text', description: 'Giờ đón khách',
  });
  const req = calls[1] || {};
  let body = null;
  try { body = JSON.parse((req.opts || {}).body || 'null'); } catch (_) {}

  t('gọi đúng endpoint Base v3', /\/open-apis\/base\/v3\/bases\/bas_test\/tables\/tbl_test\/fields$/.test(req.url || ''), req.url || '');
  t('dùng POST', (req.opts || {}).method === 'POST', String((req.opts || {}).method));
  t('body là field trực tiếp, không bọc thêm fields', body && body.name === 'Giờ đón' && body.type === 'text' && !body.fields, JSON.stringify(body));
  t('trả dữ liệu Lark', out && out.field_id === 'fld_test', JSON.stringify(out));

  console.log(`
${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
