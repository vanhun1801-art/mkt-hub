#!/usr/bin/env node
'use strict';
/**
 * Trình cài kết nối — chạy MỘT LẦN, sau đó không phải nhập tay gì nữa.
 *
 *   node ket-noi.js
 *
 * Việc nó làm thay anh:
 *   - nhận token (nhập ẩn, không hiện trên màn hình, không lưu vào history)
 *   - tự kiểm tra token còn sống và có đủ quyền chưa
 *   - TỰ TÌM danh sách tài khoản quảng cáo — không phải đi tra ID
 *   - TỰ QUÉT các loại chuyển đổi thật trong 14 ngày qua rồi đề xuất đúng chỉ số
 *     (đây là chỗ dễ sai nhất nếu khai tay)
 *   - ghi ket-noi.json, bật kênh, rồi chạy thử một lượt xem trước
 *
 * Token chỉ đi từ bàn phím vào file trên máy anh. Không in ra màn hình, không
 * ghi vào log, không gửi đi đâu ngoài chính máy chủ của nền tảng.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ketnoi = require('./sync/ketnoi');
const meta = require('./sync/meta');
const tiktok = require('./sync/tiktok');
const gsheet = require('./sync/gsheet');
const gads = require('./sync/gads');
const { getJson, postJson, scrub, hideSecret } = require('./sync/http');
const store = require('./store');

const FILE = ketnoi.FILE;

/* ---------------- in ra màn hình ---------------- */
const C = {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  accent: (s) => `\x1b[36m${s}\x1b[0m`,
};
const say = (s = '') => console.log(s);
const rule = () => say(C.dim('─'.repeat(64)));
const vnd = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ';

/* ---------------- nhập từ bàn phím ---------------- */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));

/**
 * Chế độ không hỏi: lấy token từ biến môi trường, chọn hết tài khoản, lấy chỉ số
 * được đề xuất. Dùng khi chạy lại sau khi xoay token, hoặc để kiểm thử luồng.
 *   LARK_META_TOKEN=... node ket-noi.js --meta --khong-hoi
 */
const KHONG_HOI = process.argv.includes('--khong-hoi');

/** Hiện token khi gõ — dự phòng cho terminal không dán được vào chế độ ẩn. */
const HIEN_TOKEN = process.argv.includes('--hien-token');

/**
 * Nhập ẩn — hiện một dấu chấm cho mỗi ký tự.
 *
 * KHÔNG dùng raw mode. Bài học phải trả giá: bật raw mode trong khi readline vẫn
 * đang nghe cùng một stdin thì readline tự echo nguyên văn những gì nhận được —
 * token hiện trần trên màn hình đúng lúc mình tưởng đang giấu nó. Và gọi
 * stdin.pause() khi xong làm stream chết luôn, mọi rl.question sau đó không bao
 * giờ gọi lại callback nên tiến trình lặng lẽ thoát, phím người dùng gõ rơi
 * thẳng xuống shell.
 *
 * Cách này để readline làm chủ hoàn toàn (nên dán vẫn chạy như thường), chỉ
 * chen vào khâu VẼ ra màn hình để thay ký tự bằng dấu chấm.
 */
function askSecret(q) {
  return new Promise((resolve) => {
    const goc = rl._writeToOutput;
    // _writeToOutput là API nội bộ của readline; không có thì đành nhập hiện chữ
    if (!process.stdin.isTTY || HIEN_TOKEN || typeof goc !== 'function') {
      if (!HIEN_TOKEN && process.stdin.isTTY) {
        say(C.dim('  (không che được ký tự trên terminal này — token sẽ hiện ra)'));
      }
      return rl.question(q, (a) => resolve(a.trim()));
    }

    let daVe = 0;
    rl._writeToOutput = function (str) {
      const n = rl.line.length;
      const xoa = Math.max(0, daVe - n);           // xoá dấu thừa khi Backspace
      const dong = q + '•'.repeat(n);
      rl.output.write('\r' + dong + ' '.repeat(xoa) + '\r' + dong);
      daVe = n;
    };

    rl.question(q, (a) => {
      rl._writeToOutput = goc;
      const v = a.trim();
      process.stdout.write(`\n  ${C.dim('→ đã nhận ' + v.length + ' ký tự')}\n`);
      resolve(v);
    });
  });
}

const yes = async (q, def = true) => {
  if (KHONG_HOI) { say(`${q} ${C.dim('→ ' + (def ? 'có' : 'không'))}`); return def; }
  const a = await ask(`${q} ${C.dim(def ? '[Enter = có]' : '[Enter = không]')} `);
  if (!a) return def;
  return /^(c|y|có|co|ok|1|true)/i.test(a);
};

/* ---------------- đọc / ghi file cấu hình ---------------- */
function readRaw() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return {}; }
}
/** Ghi mà giữ nguyên mọi khoá chú thích `_...` đang có trong file. */
function patch(section, values) {
  const raw = readRaw();
  raw[section] = { ...(raw[section] || {}), ...values };
  fs.writeFileSync(FILE, JSON.stringify(raw, null, 2), 'utf8');
}

/* =======================================================================
   META
   ======================================================================= */
async function setupMeta() {
  rule();
  say(C.b('  FACEBOOK / META'));
  rule();
  say(`
  Cần một ${C.b('System User token')} — loại không hết hạn. Lấy như sau:

    1. ${C.accent('business.facebook.com/settings')}
       → Người dùng → ${C.b('Người dùng hệ thống')} → Thêm
       (tên gì cũng được, vai trò Employee access)

    2. Chọn user đó → ${C.b('Thêm tài sản')} → Tài khoản quảng cáo
       → tick tài khoản Rooty Trip → bật ${C.b('Xem hiệu suất')}

    3. ${C.b('Tạo mã truy cập mới')} → chọn app → tick quyền ${C.accent('ads_read')} → Tạo

    4. Copy token ${C.warn('ngay')} — Meta chỉ hiện một lần.

  ${C.dim('Chưa có app thì vào developers.facebook.com/apps → Create App → loại Business.')}
  ${C.dim('Để nguyên Development mode, không cần submit duyệt gì.')}
`);

  if (!(await yes('  Đã có token trong tay chưa?'))) {
    say(C.dim('\n  Không sao — lấy xong quay lại chạy `node ket-noi.js` tiếp.\n'));
    return false;
  }

  let token = (process.env.LARK_META_TOKEN || '').trim();
  if (token) say(C.dim('\n  Dùng token từ biến môi trường LARK_META_TOKEN.'));
  else if (KHONG_HOI) {
    say(C.err('\n  Chế độ --khong-hoi cần biến môi trường LARK_META_TOKEN.'));
    return false;
  } else {
    say(C.dim('\n  Dán token rồi Enter. Màn hình hiện dấu chấm thay cho ký tự.'));
    say(C.dim('  Command Prompt dán bằng CHUỘT PHẢI (không nhận Ctrl+V).'));
    token = await askSecret('  Token: ');
  }
  // Không nhận được ký tự nào thì thử lại bằng lối nhập thường — token sẽ hiện
  // lên màn hình, đổi lại là chắc chắn dán được.
  if (!token && !KHONG_HOI) {
    say(C.warn('\n  Không nhận được ký tự nào.'));
    say(C.dim('  Thử lại: dán bằng CHUỘT PHẢI (Command Prompt không nhận Ctrl+V).'));
    say(C.dim('  Lần này token SẼ HIỆN trên màn hình — xong nhớ đóng cửa sổ.'));
    token = (await ask('  Token: ')).trim();
  }
  if (!token) {
    say(C.err('\n  Vẫn không nhận được token.'));
    say(C.dim('  Cách chắc ăn nhất — đặt biến môi trường rồi chạy lại:'));
    say(C.dim('    set LARK_META_TOKEN=<dán token vào đây>'));
    say(C.dim('    node ket-noi.js --meta\n'));
    return false;
  }
  // Đăng ký ngay: từ đây mọi thông báo lỗi in ra đều che token đi.
  // Meta có những câu như "Malformed access token EAAG…" — không che là lộ.
  hideSecret(token);
  if (token.length < 50) {
    say(C.warn(`\n  Token chỉ dài ${token.length} ký tự — trông không giống token Meta (thường ~200).`));
    if (!(await yes('  Vẫn thử?', false))) return false;
  }

  const ver = 'v21.0';

  /* --- 1. token còn sống không --- */
  say('\n  Đang kiểm tra token…');
  let me;
  try {
    me = await getJson(`https://graph.facebook.com/${ver}/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
      { label: 'Meta /me', retries: 1 });
  } catch (e) { say(C.err('  ✗ ' + scrub(e.message))); return false; }
  if (me.error) {
    say(C.err(scrub(`  ✗ Meta từ chối token (code ${me.error.code}): ${me.error.message}`)));
    if (me.error.code === 190) say(C.dim('    → token sai hoặc đã bị thu hồi, tạo lại ở bước 3.'));
    return false;
  }
  say(C.ok(`  ✓ Token hợp lệ — ${me.name || me.id}`));

  // Token cá nhân hết hạn sau ~60 ngày, System User token thì không. Nói rõ ngay
  // để anh biết bao lâu nữa phải làm lại — và app còn cảnh báo trước khi nó chết.
  const tInfo = await meta.tokenInfo({ accessToken: token, apiVersion: ver });
  if (tInfo) {
    if (tInfo.vinhVien) {
      say(C.ok('  ✓ Loại token: KHÔNG hết hạn — cấu hình một lần là xong hẳn.'));
    } else if (tInfo.conLaiNgay != null) {
      say(C.warn(`  ! Token này HẾT HẠN sau ${tInfo.conLaiNgay} ngày (${tInfo.hetHanLuc}).`));
      say(C.dim('    Tới hạn thì chạy lại `node ket-noi.js --meta`. App cảnh báo trước 10 ngày.'));
      say(C.dim('    Muốn khỏi hết hạn phải dùng System User token — cần toàn quyền Business Manager.'));
    }
    if (!tInfo.coAdsRead) {
      say(C.warn(`  ! Token thiếu quyền ads_read (đang có: ${(tInfo.quyen || []).join(', ') || 'không rõ'}).`));
    }
  }

  /* --- 2. tự tìm tài khoản quảng cáo --- */
  say('\n  Đang tìm các tài khoản quảng cáo token này đọc được…');
  let accounts = [];
  try {
    const r = await getJson(`https://graph.facebook.com/${ver}/me/adaccounts`
      + `?fields=account_id,name,currency,timezone_name,account_status&limit=100`
      + `&access_token=${encodeURIComponent(token)}`, { label: 'Meta /me/adaccounts', retries: 1 });
    if (r.error) throw new Error(`(code ${r.error.code}) ${r.error.message}`);
    accounts = r.data || [];
  } catch (e) {
    say(C.err('  ✗ Không lấy được danh sách tài khoản: ' + scrub(e.message)));
    say(C.dim('    → thường là chưa tick quyền ads_read ở bước 3.'));
    return false;
  }

  if (!accounts.length) {
    say(C.err('  ✗ Token không thấy tài khoản quảng cáo nào.'));
    say(C.dim('    → chưa làm bước 2: gán tài khoản quảng cáo cho system user, quyền Xem hiệu suất.'));
    return false;
  }

  say(C.ok(`  ✓ Thấy ${accounts.length} tài khoản:\n`));
  accounts.forEach((a, i) => {
    const off = Number(a.account_status) !== 1 ? C.warn('  (không hoạt động)') : '';
    say(`    ${C.b(String(i + 1))}. ${a.name} ${C.dim('· ' + a.account_id + ' · ' + a.currency + ' · ' + a.timezone_name)}${off}`);
  });

  let chosen;
  if (accounts.length === 1) {
    chosen = accounts;
    say(C.dim('\n  Chỉ có một tài khoản, lấy luôn.'));
  } else {
    const a = KHONG_HOI ? '' : await ask(`\n  Lấy tài khoản nào? ${C.dim('(số, cách nhau bằng dấu phẩy — Enter = lấy hết)')} `);
    if (!a) chosen = accounts;
    else {
      const idx = a.split(',').map((x) => parseInt(x.trim(), 10) - 1).filter((n) => accounts[n]);
      chosen = idx.length ? idx.map((n) => accounts[n]) : accounts;
    }
  }
  const accountIds = chosen.map((a) => a.account_id);
  say(C.ok(`  ✓ Dùng: ${chosen.map((a) => a.name).join(', ')}`));

  /* --- 3. tự quét loại chuyển đổi thật --- */
  say('\n  Đang quét các loại chuyển đổi thật trong 14 ngày qua…');
  const to = store.todayKey();
  const from = store.addDays(to, -13);
  let types = [];
  let tongChi = 0;
  try {
    const probe = await meta.fetchRange(
      { accessToken: token, accountIds, apiVersion: ver, conversionMetric: '', clickMetric: 'clicks' },
      from, to);
    types = probe.actionTypes || [];
    tongChi = probe.rows.reduce((s, r) => s + r.spend, 0);
    say(C.ok(`  ✓ Đọc được ${probe.rows.length} dòng · tổng chi ${vnd(tongChi)} (${from} → ${to})`));
  } catch (e) {
    say(C.warn('  ! Chưa đọc được số: ' + scrub(e.message)));
    say(C.dim('    Vẫn lưu cấu hình, anh kiểm lại sau bằng `node dong-bo.js --kiem-tra`.'));
  }

  // Ưu tiên theo mục tiêu chiến dịch đang chạy: Tin nhắn/Lead → hội thoại tin nhắn
  const PRIORITY = [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'lead',
    'onsite_conversion.lead_grouped',
    'purchase',
    'omni_purchase',
  ];
  let metric = 'onsite_conversion.messaging_conversation_started_7d';

  if (types.length) {
    say('\n  Các loại chuyển đổi Meta đang trả về:\n');
    types.slice(0, 12).forEach((t, i) => {
      const goi = PRIORITY.includes(t.action_type) ? C.accent('  ← nên dùng') : '';
      say(`    ${C.b(String(i + 1))}. ${t.action_type} ${C.dim('= ' + t.total.toLocaleString('vi-VN'))}${goi}`);
    });

    const suggest = PRIORITY.find((p) => types.some((t) => t.action_type === p));
    if (suggest) {
      metric = suggest;
      const n = types.find((t) => t.action_type === suggest).total;
      say(`\n  Đề xuất: ${C.accent(suggest)} ${C.dim('(' + n.toLocaleString('vi-VN') + ' trong 14 ngày)')}`);
      say(C.dim(`  CPA sẽ ra ≈ ${vnd(n > 0 ? tongChi / n : 0)} — so với Ads Manager xem có khớp không.`));
    } else {
      say(C.warn('\n  Không thấy loại nào khớp mục tiêu Tin nhắn/Lead.'));
    }
    const a = KHONG_HOI ? '' : await ask(`\n  Chọn loại nào? ${C.dim('(số, hoặc Enter = lấy đề xuất)')} `);
    if (a) {
      const n = parseInt(a, 10) - 1;
      if (types[n]) metric = types[n].action_type;
    }
  }
  say(C.ok(`  ✓ Chỉ số chuyển đổi: ${metric}`));

  patch('meta', {
    enabled: true,
    accessToken: token,
    accountIds,
    apiVersion: ver,
    conversionMetric: metric,
    clickMetric: 'clicks',
    tokenVinhVien: !!(tInfo && tInfo.vinhVien),
    tokenHetHanLuc: (tInfo && tInfo.hetHanLuc) || '',
  });
  say(C.ok(`\n  ✓ Đã lưu vào ${path.basename(FILE)} — kênh Meta đã BẬT.`));
  return true;
}

/* =======================================================================
   GOOGLE ADS (qua Google Sheet)
   ======================================================================= */
async function setupGoogle() {
  rule();
  say(C.b('  GOOGLE ADS'));
  rule();
  say(`
  Không dùng Google Ads API (xin developer token chờ cả tuần). Thay vào đó:

    1. Tạo một Google Sheet trống, copy ID từ URL
    2. Mở ${C.accent('docs\\google-ads-script.js')}, sửa dòng ${C.b('SHEET_ID')}
    3. Google Ads → Công cụ → ${C.b('Tập lệnh')} → dán vào → Cho phép → Chạy một lần
    4. Đặt Tần suất = ${C.b('Mỗi giờ')}
    5. Sheet → Tệp → Chia sẻ → ${C.b('Xuất bản lên web')} → sheet DuLieu, định dạng ${C.b('.csv')}
`);
  if (!(await yes('  Đã có link CSV của Sheet chưa?', false))) {
    say(C.dim('\n  Làm xong quay lại chạy lại là được.\n'));
    return false;
  }
  const url = await ask('  Dán link: ');
  if (!url) { say(C.err('  Không nhận được link.')); return false; }

  say('\n  Đang thử tải…');
  const r = await gsheet.test({ csvUrl: url, level: 'adgroup' });
  if (!r.ok) {
    say(C.err('  ✗ ' + scrub(r.message)));
    say(C.dim('    → nhớ chọn định dạng .csv khi Xuất bản lên web.'));
    return false;
  }
  const info = r.results[0];
  say(C.ok(`  ✓ Đọc được: ${info.name} · ${info.khoangNgay}`));
  say(C.dim(`    cột nhận ra: ${info.cotNhanRa}`));

  patch('googleSheet', { enabled: true, csvUrl: url, level: 'adgroup' });
  say(C.ok('\n  ✓ Đã lưu — kênh Google Ads đã BẬT.'));
  return true;
}

/* =======================================================================
   CHỜ CODE OAUTH — dùng chung cho Google và TikTok
   ======================================================================= */

/**
 * Mở cổng 127.0.0.1:<cong> chờ nhà cung cấp gọi về, ĐỒNG THỜI cho dán tay URL.
 * Đường nào tới trước thì lấy.
 *
 * Có đường dán tay vì hai lý do thật: (1) phải bấm qua màn hình cảnh báo nên hay
 * quá thời gian chờ, (2) máy chạy lệnh có thể không phải máy đăng nhập được — anh
 * Hùng điều khiển máy nhà từ máy công ty, Google đòi passkey ở gần máy nhà.
 * Code còn hiệu lực vài phút nên mở đồng ý ở máy khác rồi dán URL sang vẫn chạy.
 */
/**
 * Lấy mã bằng cách xin người dùng dán URL — dùng khi redirect trỏ ra domain ngoài,
 * không hứng tự động được. Chấp nhận cả URL đầy đủ lẫn mỗi đoạn mã.
 */
async function danCodeTay(tenTham = 'code') {
  for (let lan = 0; lan < 3; lan++) {
    const v = (await ask('  Dán URL trình duyệt nhảy tới (hoặc chỉ ' + tenTham + '): ')).trim();
    if (!v) continue;
    const m = v.match(new RegExp('[?&]' + tenTham + '=([^&\\s]+)'));
    if (m) return decodeURIComponent(m[1]);
    // không có dấu ? thì coi như người dùng dán thẳng mã
    if (!/[?&=]/.test(v)) return v;
    say(C.warn('  Chuỗi vừa dán không thấy ' + tenTham + '= — thử lại.'));
  }
  throw new Error('Không lấy được ' + tenTham);
}

async function choCode(cong, tenTham = 'code') {
  const http = require('http');
  let sv = null;
  const cho = new Promise((resolve, reject) => {
    sv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1:' + cong);
      const c = u.searchParams.get(tenTham);
      const err = u.searchParams.get('error') || u.searchParams.get('error_description');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<meta charset="utf-8"><body style="font:16px system-ui;padding:40px">' +
        (c ? '<b>Xong.</b> Quay lại cửa sổ dòng lệnh nhé.' : '<b>Bị từ chối:</b> ' + (err || 'không rõ')) +
        '</body>');
      try { sv.close(); } catch (_) {}
      c ? resolve(c) : reject(new Error(err || 'Không nhận được ' + tenTham));
    });
    sv.on('error', reject);
    sv.listen(cong, '127.0.0.1');
    setTimeout(() => { try { sv.close(); } catch (_) {} reject(new Error('Chờ quá 15 phút')); }, 900000);
  });

  const danTay = ask('  (hoặc dán vào đây URL mà trình duyệt nhảy tới, rồi Enter): ')
    .then((v) => {
      const re = new RegExp('[?&]' + tenTham + '=([^&\\s]+)');
      const m = String(v || '').match(re);
      if (!m) throw new Error('Chuỗi dán vào không có tham số ' + tenTham + '=');
      return decodeURIComponent(m[1]);
    });

  try {
    return await Promise.race([cho, danTay]);
  } finally {
    try { sv.close(); } catch (_) {}
  }
}

/* =======================================================================
   GOOGLE ADS — API THẬT
   ======================================================================= */

/**
 * Lấy refresh token bằng luồng OAuth "cài đặt" (loopback).
 *
 * Vì sao mở cổng 127.0.0.1 chứ không dán code bằng tay: Google đã bỏ luồng
 * out-of-band (urn:ietf:wg:oauth:2.0:oob) từ 2022, dán code tay không còn chạy.
 * Cổng chỉ mở đúng lúc chờ Google gọi về rồi đóng ngay.
 */
async function layRefreshToken(clientId, clientSecret) {
  const CONG = 47123;
  const redirect = 'http://127.0.0.1:' + CONG;

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent',           // bắt Google cấp refresh token cả khi đã đồng ý trước đó
  }).toString();

  say('');
  say('  Mở link này trong trình duyệt đang đăng nhập đúng tài khoản Google Ads:');
  say('');
  say('  ' + C.accent(url));
  say('');
  say(C.dim('  Đồng ý xong trình duyệt tự gọi về máy, cửa sổ này nhận được ngay.'));
  say(C.dim('  Nếu trình duyệt báo "127.0.0.1 refused to connect": copy nguyên URL trên'));
  say(C.dim('  thanh địa chỉ của nó rồi dán vào dòng dưới — code vẫn còn hiệu lực ~10 phút.'));

  let code;
  try {
    code = await choCode(CONG, 'code');
  } catch (e) {
    throw new Error(e.message);
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirect, grant_type: 'authorization_code',
    }).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.refresh_token) {
    throw new Error(scrub('Google không trả refresh token: ' + (d.error_description || d.error || 'không rõ')));
  }
  hideSecret(d.refresh_token);
  return d.refresh_token;
}

async function setupGoogleApi() {
  rule();
  say(C.b('  GOOGLE ADS — API THẬT'));
  rule();
  say(`
  Cần bốn thứ:

    1. ${C.b('OAuth client')} — Google Cloud Console → API & Services → Credentials
       → Create credentials → OAuth client ID → loại ${C.b('Desktop app')}
       Nhớ thêm ${C.accent('http://127.0.0.1:47123')} vào Authorized redirect URIs.
    2. ${C.b('Developer token')} — Google Ads → Công cụ → API Center.
       Token mới ở mức ${C.warn('Test')} chỉ đọc được tài khoản test; muốn đọc tài khoản
       thật phải xin ${C.b('Basic Access')} (Google duyệt, thường vài ngày).
    3. ${C.b('ID tài khoản quảng cáo')} — góc trên Google Ads, dạng 123-456-7890.
    4. ${C.b('ID tài khoản quản lý (MCC)')} nếu tài khoản nằm dưới MCC.
`);
  if (!(await yes('  Có đủ OAuth client và developer token chưa?', false))) {
    say(C.dim('\n  Chưa đủ thì cứ dùng đường Google Sheet (`node ket-noi.js --google`), số vẫn về đủ.\n'));
    return false;
  }

  const clientId = await ask('  Client ID: ');
  if (!clientId) { say(C.err('  Không nhận được Client ID.')); return false; }
  const clientSecret = await askSecret('  Client secret: ');
  if (!clientSecret) { say(C.err('  Không nhận được Client secret.')); return false; }
  const developerToken = await askSecret('  Developer token: ');
  if (!developerToken) { say(C.err('  Không nhận được Developer token.')); return false; }
  const ids = (await ask('  ID tài khoản quảng cáo (nhiều thì cách nhau dấu phẩy): '))
    .split(',').map((x) => x.trim()).filter(Boolean);
  if (!ids.length) { say(C.err('  Chưa khai tài khoản nào.')); return false; }
  const mcc = await ask('  ID tài khoản quản lý MCC (Enter nếu không có): ');

  let refreshToken;
  try {
    refreshToken = await layRefreshToken(clientId, clientSecret);
  } catch (e) {
    say(C.err('\n  ✗ ' + e.message));
    say(C.dim('    → kiểm tra đã thêm http://127.0.0.1:47123 vào Authorized redirect URIs chưa.'));
    return false;
  }
  say(C.ok('  ✓ Đã lấy được refresh token.'));

  const conf = { clientId, clientSecret, refreshToken, developerToken, customerIds: ids, loginCustomerId: mcc };
  say('\n  Đang thử đọc tài khoản…');
  const r = await gads.test(conf);
  if (!r.ok) {
    const chi = r.message || (r.results || []).filter((x) => !x.ok).map((x) => x.account + ': ' + x.message).join(' · ');
    say(C.err('  ✗ ' + scrub(chi)));
    say(C.dim('    → developer token mức Test không đọc được tài khoản thật; cần Basic Access.'));
    // vẫn lưu để khỏi phải lấy lại refresh token, chỉ không bật kênh
    patch('googleAds', { ...conf, enabled: false });
    say(C.dim('    Đã lưu cấu hình nhưng để TẮT. Xin duyệt xong chỉ cần bật lại trong app.'));
    return false;
  }
  (r.results || []).forEach((x) => say(C.ok(`  ✓ ${x.account} · ${x.name} · ${x.currency} · ${x.timezone}`)));

  patch('googleAds', { ...conf, enabled: true });
  say(C.ok('\n  ✓ Đã lưu — kênh Google Ads (API) đã BẬT.'));
  say(C.dim('    Nếu đang bật cả đường Google Sheet thì nên tắt một đường, tránh đếm hai lần.'));
  return true;
}

/* =======================================================================
   TIKTOK
   ======================================================================= */
async function setupTiktok() {
  rule();
  say(C.b('  TIKTOK'));
  rule();
  say(`
  Kênh duy nhất phải chờ TikTok duyệt app (thường vài ngày).
  Tạo app ở ${C.accent('business-api.tiktok.com')} → My Apps → Create,
  chọn quyền Ad Account Management + Reporting → Submit → chờ duyệt
  → uỷ quyền tài khoản → đổi auth_code lấy access token dài hạn.
`);
  /* Hai đường: có token rồi thì dán; chưa có thì công cụ tự đi lấy bằng app_id +
   * secret, vì bước cuối (đổi auth_code) là một lệnh POST, làm tay bằng trình
   * duyệt không xong. */
  if (!(await yes('  Đã có access token TikTok sẵn chưa?', false))) {
    if (!(await yes('  Vậy để công cụ tự lấy token bằng app_id + secret nhé?', true))) {
      say(C.dim('\n' + '  Trong lúc chờ thì Meta + Google đã lo phần lớn số liệu rồi.' + '\n'));
      return false;
    }
    return await tiktokTuLayToken();
  }
  const token = (process.env.LARK_TIKTOK_TOKEN || '').trim() || await askSecret('  Token (nhập ẩn): ');
  if (!token) { say(C.err('  Không nhận được token.')); return false; }
  const advRaw = await ask('  advertiser_id (cách nhau bằng dấu phẩy): ');
  const advertiserIds = advRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!advertiserIds.length) { say(C.err('  Cần ít nhất một advertiser_id.')); return false; }

  say('\n  Đang kiểm tra…');
  const r = await tiktok.test({ accessToken: token, advertiserIds });
  if (!r.ok) {
    say(C.err('  ✗ ' + scrub(r.message || 'không rõ')));
    // 40105 gần như luôn là dán nhầm chuỗi. App Secret dài đúng 40 ký tự nên rất
    // hay bị nhầm sang ô này, mà hai thứ đó khác nhau hoàn toàn.
    if (/40105|incorrect or has been revoked/i.test(r.message || '')) {
      say('');
      say(C.warn('  Access token KHÁC App Secret — kiểm lại xem có dán nhầm không.'));
      if (token.length <= 45) {
        say(C.dim(`    Chuỗi vừa nhập dài ${token.length} ký tự, đúng bằng độ dài App Secret hay gặp.`));
      }
      say(C.dim('    App Secret nằm ở trang app (mục Secret, có nút 👁 và Reset).'));
      say(C.dim('    Access token KHÔNG hiện ở đó — nó chỉ sinh ra sau khi uỷ quyền'));
      say(C.dim('    tài khoản quảng cáo, đổi auth_code lấy token.'));
      say('');
      say(C.dim('    Chưa từng uỷ quyền lần nào thì chạy lại và trả lời "chưa có token",'));
      say(C.dim('    công cụ sẽ tự đi lấy giúp:  node ket-noi.js --tiktok'));
    }
    return false;
  }
  (r.results || []).forEach((x) => say(C.ok(`  ✓ ${x.name} · ${x.currency} · ${x.timezone}`)));

  patch('tiktok', { enabled: true, accessToken: token, advertiserIds, conversionMetric: 'conversion' });
  say(C.ok('\n  ✓ Đã lưu — kênh TikTok đã BẬT.'));
  return true;
}

/**
 * Tự lấy access token TikTok: mở trang uỷ quyền -> nhận auth_code -> đổi thành
 * access token dài hạn (TikTok không đặt hạn cho token này) + danh sách advertiser.
 */
async function tiktokTuLayToken() {
  const CONG = 47124;
  const MAC_DINH = 'http://127.0.0.1:' + CONG;
  say('');
  say('  Cần ba thứ ở business-api.tiktok.com → My Apps → app của anh:');
  say('    · App ID   (dãy số)');
  say('    · App Secret');
  say('    · Redirect URL đã khai trong app');
  say('');
  say(C.dim('  TikTok bắt redirect_uri phải khớp CHÍNH XÁC cái đã khai trong app.'));
  say(C.dim('  App đã khai sẵn URL riêng thì dán đúng URL đó vào — công cụ tự xoay theo.'));
  say('');

  const appId = (await ask('  App ID: ')).trim();
  if (!appId) { say(C.err('  Không nhận được App ID.')); return false; }
  const secret = await askSecret('  App Secret: ');
  if (!secret) { say(C.err('  Không nhận được App Secret.')); return false; }
  hideSecret(secret);

  const redirectVao = (await ask(`  Redirect URL ${C.dim('(Enter = ' + MAC_DINH + ')')}: `)).trim();
  const redirect = redirectVao || MAC_DINH;

  // Chỉ hứng được mã tự động khi redirect trỏ về chính máy này. Trỏ ra domain
  // ngoài thì trình duyệt nhảy tới đó, mình phải xin người dùng dán URL lại.
  const veMayNay = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(redirect);
  const congNghe = veMayNay ? Number((redirect.match(/:(\d+)/) || [])[1] || CONG) : null;

  const url = 'https://business-api.tiktok.com/portal/auth?' + new URLSearchParams({
    app_id: appId, state: 'rooty', redirect_uri: redirect,
  }).toString();

  say('');
  say('  Mở link này trong trình duyệt đang đăng nhập TikTok Business:');
  say('');
  say('  ' + C.accent(url));
  say('');
  if (veMayNay) {
    say(C.dim('  Uỷ quyền xong trình duyệt tự gọi về máy. Nếu nó báo không kết nối được'));
    say(C.dim('  thì copy nguyên URL trên thanh địa chỉ rồi dán vào dòng dưới.'));
  } else {
    say(C.dim('  Redirect trỏ ra ngoài máy này nên công cụ không tự bắt mã được.'));
    say(C.dim('  Uỷ quyền xong, trình duyệt nhảy tới trang của anh — copy NGUYÊN URL'));
    say(C.dim('  trên thanh địa chỉ (có đoạn auth_code=...) rồi dán vào dòng dưới.'));
  }

  let authCode;
  try {
    authCode = veMayNay ? await choCode(congNghe, 'auth_code') : await danCodeTay('auth_code');
  } catch (e) {
    say(C.err('\n' + '  ✗ ' + e.message));
    return false;
  }

  say('\n' + '  Đang đổi auth_code lấy access token…');
  let d;
  try {
    d = await postJson('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
      { app_id: appId, secret, auth_code: authCode }, { label: 'TikTok oauth', retries: 1 });
  } catch (e) {
    say(C.err('  ✗ ' + scrub(e.message)));
    return false;
  }
  if (Number(d.code) !== 0 || !d.data || !d.data.access_token) {
    say(C.err('  ✗ TikTok báo: (' + d.code + ') ' + scrub(d.message || 'không rõ')));
    say(C.dim('    → thường là app chưa được duyệt, hoặc Redirect URL khai trong app khác ' + redirect));
    return false;
  }

  const token = d.data.access_token;
  hideSecret(token);
  const advertiserIds = (d.data.advertiser_ids || []).map(String);
  say(C.ok('  ✓ Lấy được token. Tài khoản được uỷ quyền: ' + (advertiserIds.join(', ') || '(không có)')));
  if (!advertiserIds.length) {
    say(C.err('  ✗ Không có advertiser nào được uỷ quyền — quay lại trang uỷ quyền và tick tài khoản.'));
    return false;
  }

  say('\n' + '  Đang kiểm tra đọc số…');
  const r = await tiktok.test({ accessToken: token, advertiserIds });
  if (!r.ok) {
    say(C.err('  ✗ ' + scrub(r.message || 'không rõ')));
    patch('tiktok', { enabled: false, accessToken: token, advertiserIds, conversionMetric: 'conversion' });
    say(C.dim('    Đã lưu token nhưng để TẮT kênh, khỏi phải uỷ quyền lại.'));
    return false;
  }
  (r.results || []).forEach((x) => say(C.ok('  ✓ ' + x.name + ' · ' + x.currency + ' · ' + x.timezone)));

  patch('tiktok', { enabled: true, accessToken: token, advertiserIds, conversionMetric: 'conversion' });
  say(C.ok('\n' + '  ✓ Đã lưu — kênh TikTok đã BẬT.'));
  return true;
}

/* =======================================================================
   CHẠY
   ======================================================================= */
(async () => {
  // Khi file được require (kiểm thử) thì không chạy trình cài.
  if (require.main !== module) { rl.close(); return; }

  say('');
  rule();
  say(C.b('  CÀI KẾT NỐI QUẢNG CÁO — Rooty Trip'));
  say(C.dim('  Chạy một lần. Sau đó app tự lấy số, không phải nhập tay nữa.'));
  rule();

  // Trình cài cần bàn phím thật. Nếu bị nối ống (pipe) thì readline sẽ nuốt hết
  // input một lượt rồi đóng, các câu hỏi sau không bao giờ nhận được trả lời.
  if (!process.stdin.isTTY && !KHONG_HOI) {
    say(C.err('\n  Cần chạy trong cửa sổ dòng lệnh thật (Command Prompt / PowerShell / Terminal).'));
    say(C.dim('  Mở thư mục app rồi gõ:  node ket-noi.js'));
    say(C.dim('  Hoặc chạy tự động:      LARK_META_TOKEN=... node ket-noi.js --meta --khong-hoi\n'));
    rl.close();
    process.exit(1);
  }

  const st = ketnoi.status();
  if (!st.fileTonTai) {
    const mau = path.join(__dirname, 'ket-noi.mau.json');
    if (fs.existsSync(mau)) { fs.copyFileSync(mau, FILE); say(C.dim(`\n  Đã tạo ${path.basename(FILE)} từ bản mẫu.`)); }
  }
  say('\n  Trạng thái hiện tại:');
  st.providers.forEach((p) => {
    const s = p.sanSang ? (p.enabled ? C.ok('đã bật') : C.warn('đã cấu hình, đang tắt')) : C.dim('chưa cấu hình');
    say(`    ${p.label.padEnd(32)} ${s}`);
  });

  const only = (process.argv.slice(2)
    .find((a) => /^--(meta|facebook|google|googlesheet|google-api|googleads|tiktok)$/i.test(a)) || '')
    .replace(/^--/, '');
  const chay = {
    meta: setupMeta, facebook: setupMeta,
    google: setupGoogle, googlesheet: setupGoogle,
    'google-api': setupGoogleApi, googleads: setupGoogleApi,
    tiktok: setupTiktok,
  };

  let daBat = false;
  if (only && chay[only.toLowerCase()]) {
    daBat = await chay[only.toLowerCase()]();
  } else {
    say('');
    if (await yes('  Cài Facebook / Meta bây giờ?')) daBat = (await setupMeta()) || daBat;
    say('');
    if (await yes('  Cài Google Ads qua API bây giờ?', false)) daBat = (await setupGoogleApi()) || daBat;
    say('');
    if (await yes('  Cài Google Ads qua Google Sheet bây giờ?')) daBat = (await setupGoogle()) || daBat;
    say('');
    if (await yes('  Cài TikTok bây giờ?', false)) daBat = (await setupTiktok()) || daBat;
  }

  rule();
  if (daBat) {
    say(C.b('  XONG PHẦN KẾT NỐI'));
    say(`
  Bước tiếp theo — ${C.b('xem trước')} trước khi ghi vào Base lần đầu:

    ${C.accent('node dong-bo.js --xem-truoc')}

  Xem trước không ghi gì. Đọc mục "Chưa ghép được" — nếu có, mở app
  ${C.accent('http://localhost:5176')} → tab Kết nối & Đồng bộ → bảng Ghép ID nền tảng.

  Ổn rồi thì:

    ${C.accent('node dong-bo.js')}

  Và để nó tự chạy mãi, không cần mở app:

    ${C.accent('cai-tac-vu.bat')}   ${C.dim('(bấm đúp — đăng ký chạy mỗi 3 giờ)')}
`);
  } else {
    say(C.dim('  Chưa bật được kênh nào. Lấy đủ token rồi chạy lại `node ket-noi.js`.'));
    say(C.dim('  Trong lúc chờ vẫn nhập CSV được ở tab Kết nối & Đồng bộ.\n'));
  }
  rule();
  say('');
  ketThuc(0);
})().catch((e) => {
  say(C.err('\n  LỖI: ' + scrub(e.message) + '\n'));
  ketThuc(1);
});

/**
 * Đóng bàn phím rồi để Node tự thoát.
 * Gọi process.exit() ngay lúc readline đang đóng làm libuv trên Windows bung
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" — chạy đúng nhưng
 * kết thúc bằng một dòng crash, người dùng tưởng hỏng.
 */
function ketThuc(ma) {
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (_) {}
  rl.close();
  process.stdin.pause();
  try { process.stdin.unref(); } catch (_) {}
  process.exitCode = ma;
}
