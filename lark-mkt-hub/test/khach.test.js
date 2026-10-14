'use strict';
/**
 * KHÁCH CÔNG TY — người ngoài phòng Marketing đăng nhập vào hub.
 *
 *   node test/khach.test.js
 *
 * Từ 14/10/2026 phạm vi app Lark mở cho cả công ty, nên "đăng nhập được" không
 * còn nghĩa là "người phòng MKT". Bài này canh ba thứ:
 *   1. Khách không thấy base nào, kể cả base mở cho cả phòng, và mọi đường dữ
 *      liệu ở lớp vỏ (danh bạ, bảng tin, lịch...) trả 403.
 *   2. Người phòng (ở nhóm chat "Phòng MKT") vẫn như cũ.
 *   3. Khớp dòng phân quyền theo TÊN không trao dòng "Quản lý" cho người phòng
 *      khác trùng tên.
 *
 * Chỉ dùng file tạm và khoá giả: không gọi Lark ghi gì. Khoá giả nên hub đọc
 * nhóm từ bản lưu du-lieu/nhom-mkt.json (khớp theo tên).
 */
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const congTrong = () => 20000 + Math.floor(Math.random() * 30000);
const PORT = congTrong();
const SECRET = 'kiem-thu-khach';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-khach-'));
const fMod = path.join(tmp, 'modules.json');
const fQuyen = path.join(tmp, 'quyen.json');

const nhom = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'du-lieu', 'nhom-mkt.json'), 'utf8')).nguoi;
const TEN_NHOM = nhom[0].ten;

fs.writeFileSync(fMod, JSON.stringify({
  modules: [
    { id: 'cong-viec', ten: 'Bảng công việc', kieu: 'lark', larkUrl: 'https://x/1', caPhong: true },
    { id: 'kin', ten: 'Base kín', kieu: 'lark', larkUrl: 'https://x/2' },
  ],
}, null, 2));

fs.writeFileSync(fQuyen, JSON.stringify([
  // dòng quản lý ĐÃ gắn email: người khác trùng tên không được nhận
  { nguoi: 'Trùng Tên Quản Lý', email: 'that@rootytrip.com', vai: 'Quản lý', base: '*' },
  // dòng quản lý CHƯA gắn gì, tên của một người ngoài phòng
  { nguoi: 'Chưa Gắn Ai', vai: 'Quản lý', base: '*' },
  // người phòng khác được quản lý cấp riêng một base: theo đúng dòng đó
  { nguoi: 'Phòng khác có dòng', email: 'codong@rootytrip.com', base: ['kin'] },
], null, 2));

const env = Object.assign({}, process.env, {
  PORT: String(PORT),
  LARK_APP_ID: 'cli_gia_de_vao_che_do_api',
  LARK_APP_SECRET: 'gia',
  SESSION_SECRET: SECRET,
  PUBLIC_URL: 'http://localhost:' + PORT,
  LARK_MANAGER_EMAILS: 'quanly@rootytrip.com',
  HUB_MODULES_FILE: fMod,
  HUB_QUYEN_FILE: fQuyen,
  HUB_AUTOSTART: '0',
});

function kyPhien(mail, ten) {
  const body = Buffer.from(JSON.stringify({
    exp: Date.now() + 3600000, id: 'ou_' + mail.split('@')[0], name: ten, email: mail,
  })).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return 'hub_session=' + encodeURIComponent(body + '.' + mac);
}

const con = spawn(process.execPath, ['server.js'], { env, cwd: path.join(__dirname, '..'), stdio: 'ignore' });
const G = 'http://localhost:' + PORT;
const bang = [];
const ghi = (dat, ten, them) => bang.push((dat ? 'OK   ' : 'FAIL ') + ten + (them ? ' -> ' + them : ''));

async function hubCua(mail, ten) {
  const r = await fetch(G + '/api/hub', { headers: { cookie: kyPhien(mail, ten) } });
  const d = await r.json();
  return d.data || d;
}
const ids = (h) => (h.modules || []).map((x) => x.id).sort().join(',');

(async () => {
  await new Promise((s) => setTimeout(s, 3500));
  try {
    const KHACH = ['khach@rootytrip.com', 'Người Phòng Khác'];

    const hK = await hubCua(...KHACH);
    ghi(hK.khach === true, '/api/hub báo khach cho người ngoài phòng');
    ghi((hK.modules || []).length === 0, 'khách không thấy base nào, kể cả base cả phòng', ids(hK));
    ghi(hK.quanLy === false, 'khách không phải quản lý');

    for (const p of ['/api/danh-ba', '/api/anh-dai-dien', '/api/tb-app', '/api/tb-app/tin',
      '/api/bang-tin-chao', '/api/tongquan', '/api/lich-chung', '/api/thong-bao', '/api/toi',
      '/api/lich-cua-so', '/api/duong-chua-co']) {
      const r = await fetch(G + p, { headers: { cookie: kyPhien(...KHACH) } });
      ghi(r.status === 403, 'khách bị chặn ' + p, String(r.status));
    }
    {
      const r = await fetch(G + '/m/cong-viec/', { headers: { cookie: kyPhien(...KHACH) }, redirect: 'manual' });
      ghi(r.status === 403, 'khách gõ tay /m/cong-viec/ bị chặn', String(r.status));
    }
    {
      const r = await fetch(G + '/api/logo', { headers: { cookie: kyPhien(...KHACH) } });
      ghi(r.status !== 403, 'khách vẫn tải được logo cho trang chào', String(r.status));
    }

    const hN = await hubCua('nguoinhom@rootytrip.com', TEN_NHOM);
    ghi(!hN.khach && ids(hN) === 'cong-viec', 'người ở nhóm Phòng MKT vẫn thấy base cả phòng', ids(hN));
    {
      const r = await fetch(G + '/api/thong-bao', { headers: { cookie: kyPhien('nguoinhom@rootytrip.com', TEN_NHOM) } });
      ghi(r.status === 200, 'người phòng vẫn gọi được /api/thong-bao', String(r.status));
    }

    const hD = await hubCua('codong@rootytrip.com', 'Phòng khác có dòng');
    ghi(!hD.khach && ids(hD).includes('kin'), 'người phòng khác có dòng phân quyền theo đúng dòng đó', ids(hD));

    const hT = await hubCua('mao@rootytrip.com', 'Trùng Tên Quản Lý');
    ghi(hT.khach === true && hT.quanLy === false, 'trùng tên dòng quản lý đã gắn email: không nhận dòng đó');

    const hC = await hubCua('ngoai@rootytrip.com', 'Chưa Gắn Ai');
    ghi(hC.khach === true && hC.quanLy === false, 'trùng tên dòng quản lý chưa gắn, nhưng ngoài nhóm: không nhận');

    const hQ = await hubCua('quanly@rootytrip.com', 'Quản lý env');
    ghi(!hQ.khach && hQ.quanLy === true, 'quản lý khai bằng env không bao giờ là khách');
  } catch (e) {
    bang.push('FAIL lỗi khi chạy: ' + e.message);
  }

  console.log(bang.join('\n'));
  try {
    if (process.platform === 'win32') {
      require('child_process').execFileSync('taskkill', ['/pid', String(con.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      con.kill();
    }
  } catch (_) { try { con.kill(); } catch (_) {} }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  process.exit(bang.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
