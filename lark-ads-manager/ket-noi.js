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
const { getJson, scrub, hideSecret } = require('./sync/http');
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
  if (!(await yes('  Đã có access token TikTok chưa?', false))) {
    say(C.dim('\n  Trong lúc chờ thì Meta + Google đã lo phần lớn số liệu rồi.\n'));
    return false;
  }
  const token = (process.env.LARK_TIKTOK_TOKEN || '').trim() || await askSecret('  Token (nhập ẩn): ');
  if (!token) { say(C.err('  Không nhận được token.')); return false; }
  const advRaw = await ask('  advertiser_id (cách nhau bằng dấu phẩy): ');
  const advertiserIds = advRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!advertiserIds.length) { say(C.err('  Cần ít nhất một advertiser_id.')); return false; }

  say('\n  Đang kiểm tra…');
  const r = await tiktok.test({ accessToken: token, advertiserIds });
  if (!r.ok) { say(C.err('  ✗ ' + scrub(r.message || 'không rõ'))); return false; }
  (r.results || []).forEach((x) => say(C.ok(`  ✓ ${x.name} · ${x.currency} · ${x.timezone}`)));

  patch('tiktok', { enabled: true, accessToken: token, advertiserIds, conversionMetric: 'conversion' });
  say(C.ok('\n  ✓ Đã lưu — kênh TikTok đã BẬT.'));
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

  const only = (process.argv.slice(2).find((a) => /^--(meta|facebook|google|googlesheet|tiktok)$/i.test(a)) || '')
    .replace(/^--/, '');
  const chay = {
    meta: setupMeta, facebook: setupMeta,
    google: setupGoogle, googlesheet: setupGoogle,
    tiktok: setupTiktok,
  };

  let daBat = false;
  if (only && chay[only.toLowerCase()]) {
    daBat = await chay[only.toLowerCase()]();
  } else {
    say('');
    if (await yes('  Cài Facebook / Meta bây giờ?')) daBat = (await setupMeta()) || daBat;
    say('');
    if (await yes('  Cài Google Ads bây giờ?')) daBat = (await setupGoogle()) || daBat;
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
