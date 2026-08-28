'use strict';
/**
 * Chốt quyền quản panel — kiểm thử ĐỘC LẬP, không cần khoá app thật.
 *
 *   node test/quyen-panel.test.js
 *
 * Cách làm: tự bật một hub ở CHẾ ĐỘ API với khoá giả trên cổng 5191, rồi tự ký
 * cookie phiên bằng cùng SESSION_SECRET cho hai người — một nhân sự và một quản
 * lý — để xem những route quản panel có chặn đúng không. Không gọi Lark, không
 * ghi gì lên Base (khoá giả nên mọi lệnh đọc Base đều thất bại, và đó chính là
 * đường mà nhân sự thật sẽ đi qua).
 */
const { spawn } = require('child_process');
const crypto = require('crypto');

const PORT = 5191;
const SECRET = 'kiem-thu-chot-quyen';
const env = Object.assign({}, process.env, {
  PORT: String(PORT),
  LARK_APP_ID: 'cli_gia_de_vao_che_do_api',
  LARK_APP_SECRET: 'gia',
  SESSION_SECRET: SECRET,
  PUBLIC_URL: 'http://localhost:' + PORT,
  LARK_MANAGER_EMAILS: 'quanly@rootytrip.com',
  HUB_AUTOSTART: '0',
});

function kyPhien(nguoi) {
  const body = Buffer.from(JSON.stringify(Object.assign({ exp: Date.now() + 3600000 }, nguoi))).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return 'hub_session=' + encodeURIComponent(body + '.' + mac);
}

const con = spawn(process.execPath, ['server.js'], { env, cwd: require('path').join(__dirname, '..'), stdio: 'ignore' });
const G = 'http://localhost:' + PORT;

const goi = async (p, o = {}) => {
  const r = await fetch(G + p, Object.assign({ redirect: 'manual' }, o));
  return { code: r.status, raw: (await r.text()).slice(0, 120) };
};

(async () => {
  await new Promise((s) => setTimeout(s, 3500));
  const nhanSu = { cookie: kyPhien({ id: 'ou_nhan_su', name: 'Nhân sự thử', email: 'nhansu@rootytrip.com' }) };
  const ql = { cookie: kyPhien({ id: 'ou_ql', name: 'Quản lý thử', email: 'quanly@rootytrip.com' }) };
  const H = (x) => ({ cookie: x.cookie, 'content-type': 'application/json' });

  const bang = [];
  const thu = async (ten, p, opt, ai, mong) => {
    const r = await goi(p, Object.assign({ headers: H(ai) }, opt));
    bang.push((r.code === mong ? 'OK   ' : 'FAIL ') + ten + ' -> ' + r.code +
      (r.code === mong ? '' : ' (mong ' + mong + ') ' + r.raw));
  };

  await thu('nhân sự tắt module',      '/api/modules/cong-viec/tat', { method: 'POST' }, nhanSu, 403);
  await thu('nhân sự bật lại module',  '/api/modules/cong-viec/bat-lai', { method: 'POST' }, nhanSu, 403);
  await thu('nhân sự xoá base',        '/api/modules/cong-viec', { method: 'DELETE' }, nhanSu, 403);
  await thu('nhân sự sửa base',        '/api/modules/cong-viec', { method: 'PATCH', body: '{"ten":"X"}' }, nhanSu, 403);
  await thu('nhân sự thêm base',       '/api/modules', { method: 'POST', body: '{"ten":"X","kieu":"lark"}' }, nhanSu, 403);
  await thu('nhân sự xem log module',  '/api/modules/cong-viec/log', {}, nhanSu, 403);
  await thu('nhân sự mở Kiểm tra HT',  '/api/kiem-tra', {}, nhanSu, 403);
  await thu('nhân sự mở Phân quyền',   '/api/quyen', {}, nhanSu, 403);
  await thu('nhân sự bật Xem như',     '/api/xem-nhu', { method: 'POST', body: '{"id":"ou_x"}' }, nhanSu, 403);
  await thu('quản lý xem log module',  '/api/modules/cong-viec/log', {}, ql, 200);
  await thu('quản lý mở Phân quyền',   '/api/quyen', {}, ql, 200);

  console.log(bang.join('\n'));
  con.kill();
  process.exit(bang.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
