'use strict';
/**
 * ============================================================================
 * GỬI SAI THÌ TRẢ 4xx, ĐỪNG TRẢ 500 — VÀ ĐỪNG LỘ ĐƯỜNG DẪN MÁY CHỦ
 * ============================================================================
 * Bắn 16 yêu cầu hỏng vào hub thật. Soát ra một chỗ: thân yêu cầu không phải
 * JSON thì hub trả 500 với đúng câu "JSON không hợp lệ" — câu chữ đúng mà mã
 * sai, và cái sai đó không vô hại:
 *
 *   · 500 nghĩa là "máy chủ gãy". Mọi bảng theo dõi đọc mã chứ không đọc câu
 *     chữ, nên một yêu cầu rác cũng kêu như một sự cố thật.
 *   · Log lỗi bị ngập bởi yêu cầu rác, tới lúc có sự cố thật thì nó nằm lẫn ở
 *     giữa và không ai thấy.
 *   · Người viết app gọi vào thì tưởng lỗi bên máy chủ nên không sửa gì cả.
 *
 * Bộ này canh cả hai mặt: mã trả về, và không được có đường dẫn máy chủ hay
 * vết gọi hàm trong thân trả lời.
 */
const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');

let pass = 0, fail = 0; const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const PORT = 20000 + Math.floor(Math.random() * 30000);
const SECRET = 'kiem-thu-loi-goi-sai';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-loi-'));
const fMod = path.join(tmp, 'modules.json'), fQuyen = path.join(tmp, 'quyen.json');
fs.writeFileSync(fMod, JSON.stringify({ modules: [
  { id: 'cong-viec', ten: 'Bảng công việc', kieu: 'lark', larkUrl: 'https://x/1', caPhong: true },
] }, null, 2));
fs.writeFileSync(fQuyen, '[]');

const con = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'), stdio: 'ignore',
  env: Object.assign({}, process.env, {
    PORT: String(PORT), LARK_APP_ID: 'cli_gia', LARK_APP_SECRET: 'gia',
    SESSION_SECRET: SECRET, PUBLIC_URL: 'http://localhost:' + PORT,
    LARK_MANAGER_EMAILS: 'quanly@rootytrip.com',
    HUB_MODULES_FILE: fMod, HUB_QUYEN_FILE: fQuyen, HUB_AUTOSTART: '0',
  }),
});
const G = 'http://localhost:' + PORT;
const QL = () => {
  const b = Buffer.from(JSON.stringify({
    exp: Date.now() + 3600000, id: 'ou_ql', name: 'Quản lý', email: 'quanly@rootytrip.com',
  })).toString('base64url');
  return 'hub_session=' + encodeURIComponent(b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url'));
};

/* [tên, method, đường, thân, có phiên quản lý, mã mong đợi] */
const CA = [
  ['không có phiên thì 401', 'GET', '/api/hub', null, false, 401],
  ['cookie rác thì 401', 'GET', '/api/hub', null, 'hub_session=rac', 401],
  ['thân không phải JSON thì 400, KHÔNG phải 500', 'POST', '/api/modules', 'khong-phai-json', true, 400],
  ['thiếu trường bắt buộc thì 400', 'POST', '/api/modules', '{"kieu":"lark"}', true, 400],
  ['kiểu base lạ thì 400', 'POST', '/api/modules', '{"ten":"X","kieu":"vo-duyen"}', true, 400],
  ['id chứa ../ thì 400', 'POST', '/api/modules', '{"ten":"X","kieu":"lark","id":"../../etc"}', true, 400],
  ['xoá base không có thì 404', 'DELETE', '/api/modules/khong-co-dau', null, true, 404],
  ['đường API không tồn tại thì 404', 'GET', '/api/duong-khong-co', null, true, 404],
  ['leo thư mục thì 404', 'GET', '/public/../server.js', null, true, 404],
  ['sai kiểu dữ liệu thì 400', 'POST', '/api/quyen', '{"rows":"khong-phai-mang"}', true, 400],
];

(async () => {
  await new Promise((s) => setTimeout(s, 3000));
  for (const [ten, pp, duong, than, phien, mong] of CA) {
    let r, txt;
    try {
      const h = { 'content-type': 'application/json' };
      if (phien === true) h.cookie = QL(); else if (typeof phien === 'string') h.cookie = phien;
      r = await fetch(G + duong, { method: pp, headers: h, redirect: 'manual', body: than == null ? undefined : than });
      txt = (await r.text()).slice(0, 300);
    } catch (e) { ok(ten, false, 'đứt: ' + e.message); continue; }
    ok(ten, r.status === mong, 'trả ' + r.status + ' thay vì ' + mong);
    /* Thân trả lời không được mang đường dẫn máy chủ hay vết gọi hàm ra ngoài. */
    ok('  ' + ten + ' — không lộ đường dẫn/vết mã',
      !/at .*\(.*:\d+:\d+\)|node:internal|[A-Z]:\Users|\/home\//.test(txt), txt.slice(0, 80));
  }

  /* Và chốt lại bằng mã nguồn: chỗ bắt lỗi cuối phải TÔN TRỌNG mã đã phân loại,
   * chứ không dập tất cả về 500 như trước. */
  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('chỗ bắt lỗi cuối tôn trọng mã đã phân loại', /e\.http && e\.http >= 400 && e\.http < 600 \? e\.http : 500/.test(sv));
  ok('chỉ ghi log lỗi khi thật sự là 5xx', /if \(ma >= 500\) console\.error/.test(sv));
  ok('thân hỏng được phân loại là lỗi bên gửi', /loiKhach\('JSON không hợp lệ', 400\)/.test(sv));
  ok('thân quá lớn trả 413', /loiKhach\('Body quá lớn', 413\)/.test(sv));

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
  try { execFileSync('taskkill', ['/pid', String(con.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) { con.kill(); }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  process.exit(fail ? 1 : 0);
})();
