'use strict';
/**
 * CHỐT LUẬT "AI THẤY BASE NÀO" — kiểm thử độc lập, không cần khoá app thật.
 *
 *   node test/quyen-base.test.js
 *
 * Đây là bài kiểm thử canh đúng lỗi đã xảy ra: thêm base mới vào panel thì cả
 * phòng thấy ngay, và bỏ tick hết base của một người lại thành mở hết cho họ.
 *
 * Cách làm: bật một hub ở CHẾ ĐỘ API với khoá giả, nhưng trỏ hai thứ vào file
 * tạm — danh sách base (HUB_MODULES_FILE) và bảng phân quyền (HUB_QUYEN_FILE) —
 * nên không gọi Lark một lần nào. Rồi tự ký cookie phiên cho từng người và đọc
 * /api/hub xem panel của họ còn những base nào.
 */
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 5192;
const SECRET = 'kiem-thu-quyen-base';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-quyen-'));
const fMod = path.join(tmp, 'modules.json');
const fQuyen = path.join(tmp, 'quyen.json');
const CONG_ECHO = 5193;

/* Một app con TỐI GIẢN, chỉ để đọc lại header danh tính mà proxy gửi xuống.
 * Cả tính năng "Lead quản trị một base" nằm ở đúng cái header này — không đo nó
 * thì bài kiểm chỉ chứng minh được panel hiện gì, không chứng minh được app con
 * nhận vai gì. */
fs.writeFileSync(path.join(tmp, 'server.js'), [
  'require("http").createServer((q, r) => {',
  '  r.writeHead(200, { "Content-Type": "application/json" });',
  '  r.end(JSON.stringify({',
  '    ql: q.headers["x-hub-user-manager"] || "",',
  '    ai: q.headers["x-hub-user-id"] || "",',
  '  }));',
  '}).listen(' + CONG_ECHO + ');',
].join(String.fromCharCode(10)));

/* Bốn base: hai mở cho cả phòng, hai kín. Kiểu 'lark' để hub không phải bật app
 * con nào — bài này chỉ hỏi về quyền. */
fs.writeFileSync(fMod, JSON.stringify({
  modules: [
    { id: 'cong-viec', ten: 'Bảng công việc', kieu: 'lark', larkUrl: 'https://x/1', caPhong: true },
    { id: 'lich', ten: 'Lịch tác nghiệp', kieu: 'lark', larkUrl: 'https://x/2', caPhong: true },
    { id: 'quang-cao', ten: 'Quảng cáo', kieu: 'lark', larkUrl: 'https://x/3', caPhong: false },
    // base vừa dựng, CHƯA khai gì cho ai: không ai ngoài quản lý được thấy
    { id: 'base-moi', ten: 'Base mới dựng', kieu: 'lark', larkUrl: 'https://x/4' },
    { id: 'echo', ten: 'App thử', kieu: 'local', thuMuc: tmp, cong: CONG_ECHO, caPhong: false },
  ],
}, null, 2));

fs.writeFileSync(fQuyen, JSON.stringify([
  { nguoi: 'Có hai base', email: 'hai@rootytrip.com', base: ['cong-viec', 'lich'] },
  { nguoi: 'Bỏ tick hết', email: 'trong@rootytrip.com', base: [] },
  { nguoi: 'Được mọi base', email: 'sao@rootytrip.com', base: '*' },
  { nguoi: 'Có base kín', email: 'kin@rootytrip.com', base: ['quang-cao'] },
  /* Lead phụ trách đúng một base: quản lý BÊN TRONG base đó, nhân sự ở mọi nơi
   * khác. Ô "Base được xem" để trống có chủ ý — quản trị base thì đương nhiên
   * xem được, không phải khai hai lần. */
  { nguoi: 'Lead base kín', email: 'lead@rootytrip.com', base: [], quanLyBase: ['quang-cao'] },
  { nguoi: 'Lead app thử', email: 'leadecho@rootytrip.com', base: [], quanLyBase: ['echo'] },
  { nguoi: 'Nhân sự app thử', email: 'nsecho@rootytrip.com', base: ['echo'] },
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
  HUB_AUTOSTART: '1',
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
  const r = await fetch(G + '/api/hub', { headers: { cookie: kyPhien(mail, ten || mail) } });
  const d = await r.json();
  return d.data || d;
}
async function panelCua(mail, ten) {
  return ((await hubCua(mail, ten)).modules || []).map((x) => x.id).sort();
}

const nhuNhau = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

(async () => {
  await new Promise((s) => setTimeout(s, 3500));
  try {
    const chung = ['cong-viec', 'lich'];

    const hai = await panelCua('hai@rootytrip.com', 'Có hai base');
    ghi(nhuNhau(hai, chung), 'người khai đúng 2 base thấy đúng 2 base', hai.join(','));

    /* Đây là lỗi cũ: ô "Base được xem" trống bị hiểu là "tất cả". Bỏ tick hết
     * trong màn Phân quyền phải là CẤM, chỉ còn base mở cho cả phòng. */
    const trong = await panelCua('trong@rootytrip.com', 'Bỏ tick hết');
    ghi(nhuNhau(trong, chung), 'bỏ tick hết KHÔNG còn là "thấy tất cả"', trong.join(','));

    const sao = await panelCua('sao@rootytrip.com', 'Được mọi base');
    ghi(sao.includes('base-moi') && sao.length === 5, 'ô ghi "*" thì thấy cả base mới', sao.join(','));

    const kin = await panelCua('kin@rootytrip.com', 'Có base kín');
    ghi(nhuNhau(kin, ['cong-viec', 'lich', 'quang-cao']),
      'được cấp base kín thì thấy base kín + base cả phòng', kin.join(','));

    /* Người chưa có dòng nào trong bảng: mặc định chỉ base cả phòng. Trước đây
     * họ thấy sạch mọi base, kể cả base vừa dựng xong. */
    const la = await panelCua('nguoila@rootytrip.com', 'Chưa khai quyền');
    ghi(nhuNhau(la, chung), 'người chưa khai quyền chỉ thấy base cả phòng', la.join(','));
    ghi(!la.includes('base-moi'), 'base mới dựng KHÔNG tự hiện cho người chưa khai');

    const ql = await panelCua('quanly@rootytrip.com', 'Quản lý');
    ghi(ql.length === 5, 'quản lý thấy cả 5 base', ql.join(','));

    /* ---- Lead phụ trách một base ----
     * Đường biên đã chốt: quản lý BÊN TRONG base đó, ở lớp vỏ vẫn là nhân sự.
     * Bài này canh cả hai phía — có đủ quyền cần, và KHÔNG có quyền không nên có.
     */
    const LEAD = ['lead@rootytrip.com', 'Lead base kín'];
    const hLead = await hubCua(...LEAD);
    const dsLead = (hLead.modules || []).map((x) => x.id).sort();
    ghi(nhuNhau(dsLead, ['cong-viec', 'lich', 'quang-cao']),
      'Lead thấy base mình quản trị dù base đó kín', dsLead.join(','));

    const modQC = (hLead.modules || []).find((x) => x.id === 'quang-cao') || {};
    const modCV = (hLead.modules || []).find((x) => x.id === 'cong-viec') || {};
    ghi(modQC.quanLyToi === true, 'Lead có vai quản lý ở base mình phụ trách');
    ghi(modCV.quanLyToi === false, 'Lead KHÔNG mang vai quản lý sang base khác');
    ghi(hLead.quanLy === false && (hLead.toi || {}).quanLy === false,
      'Lead không phải quản lý ở lớp vỏ (không hiện nút quản trị hub)');

    const chan = async (ten, p, opt) => {
      const r = await fetch(G + p, Object.assign({
        headers: { cookie: kyPhien(...LEAD), 'content-type': 'application/json' },
        redirect: 'manual',
      }, opt));
      ghi(r.status === 403, ten, String(r.status));
    };
    await chan('Lead không mở được màn Phân quyền', '/api/quyen');
    await chan('Lead không dùng được Xem như', '/api/xem-nhu', { method: 'POST', body: '{"id":"ou_x"}' });
    await chan('Lead không thêm được base', '/api/modules', { method: 'POST', body: '{"ten":"X","kieu":"lark"}' });
    await chan('Lead không xoá được base mình phụ trách', '/api/modules/quang-cao', { method: 'DELETE' });
    await chan('Lead không xem được log app con', '/api/modules/quang-cao/log');
    await chan('Lead không mở được base cho cả phòng', '/api/modules/quang-cao',
      { method: 'PATCH', body: '{"caPhong":true}' });

    /* Vai đi XUYÊN proxy xuống app con: đây là chỗ tính năng thành thật hay không. */
    const xuyen = async (mail, ten) => {
      const r = await fetch(G + '/m/echo/api/thu', { headers: { cookie: kyPhien(mail, ten) } });
      return r.ok ? r.json() : { ql: 'HTTP ' + r.status };
    };
    const dLead = await xuyen('leadecho@rootytrip.com', 'Lead app thử');
    const dNS = await xuyen('nsecho@rootytrip.com', 'Nhân sự app thử');
    ghi(dLead.ql === '1', 'app con nhận Lead là quản lý (x-hub-user-manager)', JSON.stringify(dLead));
    ghi(dNS.ql === '', 'app con nhận người kia là nhân sự', JSON.stringify(dNS));

    /* Gõ tay URL cũng phải bị chặn — kể cả base kiểu 'lark'/'ngoai', vì cú
     * chuyển hướng cũng đã là để lộ URL riêng của app đó. */
    const r = await fetch(G + '/m/base-moi/', {
      headers: { cookie: kyPhien('nguoila@rootytrip.com', 'Chưa khai quyền') }, redirect: 'manual',
    });
    ghi(r.status === 403, 'gõ tay /m/base-moi/ bị chặn 403', String(r.status));
  } catch (e) {
    bang.push('FAIL lỗi khi chạy: ' + e.message);
  }

  console.log(bang.join('\n'));
  con.kill();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  process.exit(bang.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
