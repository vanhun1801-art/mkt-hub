'use strict';
/**
 * Tìm người trong danh bạ công ty — cho ô chọn "Người phụ trách" và tab Phân quyền.
 *
 * open_id là RIÊNG THEO TỪNG APP Lark: id ghi vào ô người trên Base phải là id
 * mà chính lớp ghi Base (lark.js / larkapi.js) nhìn thấy. Nên tìm bằng ĐÚNG đường
 * đang ghi:
 *   · cli — `lark-cli contact +search-user --as user` (cùng phiên đang ghi Base)
 *   · api — tenant token của app đang chạy: gom người trong phạm vi app
 *     (contact/v3/scopes → find_by_department), đệm 30 phút, lọc tại chỗ.
 *     Cùng cách với lark-task-manager/larkapi.js → scopeUsers.
 */
const cfg = require('./config');

const boDau = (s) => String(s || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

/* ---------------- cli ---------------- */
async function timCli(q) {
  const lark = require('./lark');
  const d = await lark.cli(['contact', '+search-user', '--query', q, '--as', 'user', '--exclude-external-users'], { retries: 2 });
  return (d.users || []).filter((u) => u.open_id && !u.is_cross_tenant && u.is_activated !== false).map((u) => ({
    id: u.open_id,
    ten: u.localized_name || u.name || u.open_id,
    email: u.enterprise_email || u.email || '',
    phong: u.department || '',
  }));
}

/* ---------------- api ---------------- */
let dem = { luc: 0, ds: null, dang: null };

async function tatCaApi() {
  if (dem.ds && Date.now() - dem.luc < 30 * 60000) return dem.ds;
  if (dem.dang) return dem.dang;
  const { call } = require('./larkapi');
  dem.dang = (async () => {
    const userIds = [], deptIds = [];
    let token = '';
    for (let i = 0; i < 10; i++) {
      const d = await call('GET', '/open-apis/contact/v3/scopes?user_id_type=open_id&department_id_type=open_department_id&page_size=100' +
        (token ? '&page_token=' + encodeURIComponent(token) : ''));
      userIds.push(...(d.user_ids || []));
      deptIds.push(...(d.department_ids || []));
      if (!d.has_more || !d.page_token) break;
      token = d.page_token;
    }
    const ra = new Map();
    for (const dep of deptIds) {
      let pt = '';
      for (let i = 0; i < 20; i++) {
        let d;
        try {
          d = await call('GET', '/open-apis/contact/v3/users/find_by_department?department_id=' + encodeURIComponent(dep) +
            '&department_id_type=open_department_id&user_id_type=open_id&page_size=50' + (pt ? '&page_token=' + encodeURIComponent(pt) : ''));
        } catch (_) { break; }
        for (const u of d.items || []) {
          if (u.open_id) ra.set(u.open_id, { id: u.open_id, ten: u.name || u.en_name || u.open_id, email: u.enterprise_email || u.email || '', phong: '' });
        }
        if (!d.has_more || !d.page_token) break;
        pt = d.page_token;
      }
    }
    for (const id of userIds) {
      if (ra.has(id)) continue;
      try {
        const u = (await call('GET', '/open-apis/contact/v3/users/' + encodeURIComponent(id) + '?user_id_type=open_id')).user || {};
        ra.set(id, { id, ten: u.name || u.en_name || id, email: u.enterprise_email || u.email || '', phong: '' });
      } catch (_) { /* bỏ người không đọc được */ }
    }
    dem = { luc: Date.now(), ds: [...ra.values()], dang: null };
    return dem.ds;
  })().finally(() => { dem.dang = null; });
  return dem.dang;
}

async function timApi(q) {
  const k = boDau(q);
  return (await tatCaApi()).filter((u) => boDau(u.ten + ' ' + u.email).includes(k));
}

/** Tìm tối đa 20 người khớp tên / email. */
async function tim(q) {
  const s = String(q || '').trim().slice(0, 60);
  if (s.length < 1) return [];
  const ds = cfg.mode === 'api' ? await timApi(s) : await timCli(s);
  return ds.slice(0, 20);
}

module.exports = { tim, _datDem: (ds) => { dem = { luc: Date.now(), ds, dang: null }; } };
