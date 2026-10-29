'use strict';
/**
 * Lớp đọc/ghi Lark Mail qua lark-cli (danh tính user của máy này).
 *
 * Mọi lệnh đi qua `cli()`. Không lệnh nào ở đây xoá thư: "Lưu trữ" là chuyển
 * thư sang thư mục ARCHIVED, chuyển ngược lại được. Gửi thư chỉ xảy ra trong
 * `traLoi({ gui: true })`, và máy chủ chỉ gọi nó sau khi người dùng bấm Gửi
 * trong hộp xác nhận.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const cfg = require('./config');
const mapi = require('./mail-api');

/**
 * Máy này không đọc được Lark Mail: không có lark-cli (bản chạy chung trên
 * Render), hoặc phiên đăng nhập lark-cli đã hết. Không phải lỗi thoáng qua,
 * thử lại cũng vậy, nên giao diện nói lý do thay vì bày lỗi kỹ thuật.
 */
class LoiChuaNoi extends Error {}

/** Lỗi lark-cli thô (cả khối stack của Node) → một dòng đọc được. Bản đầy
 * đủ giữ ở `chiTiet` để ghi log máy chủ, không đưa lên giao diện. */
function loiGon(tho) {
  const s = String(tho || '');
  const dong = s.split('\n').map((d) => d.trim())
    /* "tip: run lark-cli … profile" là lời khuyên lark-cli in kèm, không phải lỗi:
     * từng làm mọi hộp hỏng chỉ báo đúng câu đó (29/10/2026). */
    .find((d) => d && !/^(at |node:internal|\^|throw |\{|\}|Node\.js v|tip:)/i.test(d) && !/^[\w./\\:-]+:\d+$/.test(d)) || 'không rõ lý do';
  const e = new Error('Lark Mail chưa trả lời được: ' + dong.slice(0, 200));
  e.chiTiet = s.slice(0, 4000);
  return e;
}

const TRANSIENT = /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|EPIPE|99991400|frequency|too many|"type":\s*"network"/i;
/* Lark chặn vì gọi dồn dập: 99991400 "request trigger frequency limit",
 * 1230008 "too many requests" (đo 29/10/2026 khi tám hộp đọc cùng lúc). */
const LA_NHANH = /frequency limit|too many requests|rate.?limit/i;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function cliOnce(args, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cfg.cliScript, ...args],
      { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        /* Lỗi API lark-cli in JSON { ok: false, error } ra stderr, không phải
         * stdout. Không đọc stderr thì vừa mất lý do thật (giới hạn tốc độ…),
         * vừa không thử lại được (29/10/2026: 5 hộp hỏng cùng lúc). */
        const docJson = (raw) => {
          /* JSON bắt đầu ở đầu một dòng: dòng "tip: … '{"user_mailbox_id": …}'"
           * phía trước cũng có ngoặc nhọn, lấy ngoặc đầu tiên là đọc hỏng. */
          const m = /^\{/m.exec(raw);
          const s = m ? m.index : raw.indexOf('{'), e = raw.lastIndexOf('}');
          if (s >= 0 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch (_) {} }
          return null;
        };
        const json = docJson((stdout || '').trim()) || (err ? docJson(String(stderr || '')) : null);
        if (json && json.ok === false) {
          const m = (json.error && json.error.message) || JSON.stringify(json.error || json);
          if (/not logged in|login required|token (has )?expired|refresh token|re-?authori[sz]e|auth login/i.test(m)) {
            return reject(new LoiChuaNoi('Phiên đăng nhập Lark trên máy chạy app đã hết hạn. Đăng nhập lại lark-cli rồi tải lại trang.'));
          }
          return reject(new Error(m));
        }
        if (err && !json) {
          console.error('[lark-cli] ' + args.slice(0, 2).join(' ') + ' hỏng: ' + String(stderr || err.message).slice(0, 600));
          return reject(loiGon(stderr || err.message));
        }
        if (!json) return reject(new Error('Không đọc được phản hồi của lark-cli'));
        /* Lệnh API trả { ok, data }; +triage --format data trả thẳng đối tượng. */
        resolve('data' in json && 'ok' in json ? (json.data || {}) : json);
      });
  });
}

/** Máy này có lark-cli để đọc thư bằng phiên của chủ máy không. */
const coCli = () => fs.existsSync(cfg.cliScript);

async function cli(args, opts = {}) {
  if (!coCli()) {
    const e = new LoiChuaNoi('Hộp thư chưa được nối với tài khoản Lark của anh/chị. ' +
      'Bấm Nối hộp thư, đăng nhập Lark và cho phép đọc thư là xong.');
    e.noiDuoc = true;
    throw e;
  }
  let last;
  for (let i = 0; i < 4; i++) {
    try { return await cliOnce(args, opts); } catch (e) {
      last = e;
      /* Lệnh ghi không thử lại: gửi thư hai lần còn tệ hơn báo lỗi một lần. */
      const nhanh = LA_NHANH.test(e.message);
      if (opts.ghi || i === (nhanh ? 3 : 2) || !TRANSIENT.test(e.message)) throw e;
      /* Bị Lark chặn vì gọi dồn dập thì lùi lâu hơn, lệch nhau ngẫu nhiên để
       * tám hộp không cùng gọi lại một lúc rồi lại bị chặn. */
      await wait(nhanh ? 1200 * Math.pow(2, i) + Math.random() * 600 : 400 * Math.pow(2, i));
    }
  }
  throw last;
}

const U = ['--as', 'user'];

/**
 * `tk` ở mọi hàm dưới: user_access_token hub chuyển xuống (bản chạy chung).
 * Có thì đọc thư của CHÍNH người đó qua OpenAPI; không có thì dùng lark-cli
 * của máy như trước. Lỗi token thành LoiChuaNoi để giao diện mời nối lại.
 */
async function quaApi(fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof mapi.LoiToken) { const l = new LoiChuaNoi(e.message); l.noiDuoc = true; throw l; }
    throw e;
  }
}

/** Hộp thư người đang đăng nhập lark-cli được cấp quyền: hộp chính + hộp chung. */
async function cacHop(tk) {
  /* Không đọc nổi cả DANH SÁCH hộp vì thiếu quyền thì phải nối lại; còn thiếu
   * quyền ở một hộp lẻ thì chỉ hộp đó báo lỗi (danhSach). */
  const d = tk ? await quaApi(() => mapi.cacHop(tk).catch((e) => {
    if (e instanceof mapi.LoiThieuQuyen) throw new mapi.LoiToken('App Marketing Hub chưa được cấp đủ quyền đọc thư. Báo quản lý cấp quyền mail rồi nối lại.');
    throw e;
  }))
    : await cli(['mail', 'user_mailboxes', 'accessible_mailboxes', ...U,
      '--params', JSON.stringify({ user_mailbox_id: 'me' })]);
  return (d.accessible_mailboxes || []).map((h) => ({
    email: String(h.email_address || '').toLowerCase(),
    chinh: h.email_type === 'USER_PRIMARY',
  })).filter((h) => h.email);
}

/** "Tên <a@b.c>" → { ten, email } */
function tachNguoi(s) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(String(s || ''));
  if (m) return { ten: m[1].trim(), email: m[2].trim().toLowerCase() };
  const e = String(s || '').trim().toLowerCase();
  return { ten: '', email: e };
}

/** Tóm tắt thư trong một thư mục (mặc định Hộp đến) của một hộp, mới nhất trước. */
async function danhSach(hop, max = cfg.soThuMoiHop, tk = '', thuMuc = 'INBOX') {
  const d = tk ? await quaApi(() => mapi.triage(tk, hop, max, thuMuc))
    : await cli(['mail', '+triage', ...U, '--mailbox', hop, '--max', String(max),
      '--format', 'data', '--labels', '--filter', JSON.stringify({ folder_id: thuMuc })]);
  return (d.messages || []).map((m) => {
    const nhan = String(m.labels || '').split(',').map((x) => x.trim()).filter(Boolean);
    return {
      hop,
      id: m.message_id,
      chuoi: m.thread_id || '',
      ngay: m.date || '',
      tu: tachNguoi(m.from),
      tieuDe: m.subject || '',
      chuaDoc: nhan.includes('UNREAD'),
      sao: nhan.includes('FLAGGED'),
      nhan,
      rac: thuMuc === 'SPAM',
    };
  });
}

const THUC_THE = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * HTML thư → chữ có xuống dòng. Bản chữ thuần Lark trả về dồn cả thư thành
 * một khối không xuống dòng, nên tự chuyển từ HTML: thẻ khối thành dòng mới,
 * ô bảng ngăn bằng " | ", link giữ địa chỉ. Kết quả vẫn là CHỮ, giao diện
 * không bao giờ chèn HTML của thư.
 */
function htmlSangChu(html) {
  let s = String(html || '')
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, u, chu) => {
      const c = chu.replace(/<[^>]+>/g, '').trim();
      return c && !c.includes(u) && !u.includes(c) ? c + ' (' + u + ')' : (c || u);
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/?(p|div|table|h[1-6]|ul|ol|blockquote|section|article|header|footer)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, k) => {
      if (k[0] === '#') {
        const n = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return THUC_THE[k.toLowerCase()] != null ? THUC_THE[k.toLowerCase()] : m;
    });
  s = s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ')
    .split('\n').map((d) => d.trim().replace(/\s*\|\s*$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

/* Chỗ bắt đầu phần trích thư cũ: Lark, Gmail, Outlook, blockquote. */
const MOC_TRICH = /<div\b[^>]*(class="[^"]*(history-quote-wrapper|gmail_quote)|id="(divRplyFwdMsg|appendonsend)")|<blockquote\b/i;

/** Tách thư thành phần mới viết và phần trích thư cũ. */
function tachTrich(html) {
  const h = String(html || '');
  const m = MOC_TRICH.exec(h);
  if (!m) return { moi: htmlSangChu(h), trich: '' };
  return { moi: htmlSangChu(h.slice(0, m.index)), trich: htmlSangChu(h.slice(m.index)) };
}

/** Một thư đầy đủ, dạng chữ (giao diện không bao giờ chèn HTML của thư). */
async function doc(hop, id, tk = '') {
  const d = tk ? await quaApi(() => mapi.message(tk, hop, id))
    : await cli(['mail', '+message', ...U, '--mailbox', hop, '--message-id', id]);
  const phan = d.body_html ? tachTrich(d.body_html) : { moi: String(d.body_plain_text || d.body_preview || ''), trich: '' };
  const nguoi = (x) => ({ ten: (x && x.name) || '', email: String((x && x.mail_address) || '').toLowerCase() });
  return {
    hop,
    id: d.message_id || id,
    chuoi: d.thread_id || '',
    ngay: d.date_formatted || '',
    tu: nguoi(d.head_from),
    den: (d.to || []).map(nguoi),
    cc: (d.cc || []).map(nguoi),
    tieuDe: d.subject || '',
    noiDung: phan.moi,
    trich: phan.trich,
    tep: (d.attachments || []).map((a) => ({ ten: a.filename || a.name || 'tệp', co: a.size || 0 })),
    nhan: d.label_ids || [],
    canhBao: d.security_level && Object.keys(d.security_level).length ? d.security_level : null,
  };
}

/** Đổi nhãn / thư mục. Tất cả đều hoàn tác được. */
async function doi(hop, ids, { them = [], bo = [], thuMuc = '' } = {}, tk = '') {
  if (tk) return quaApi(() => mapi.modify(tk, hop, ids, { them, bo, thuMuc }));
  const a = ['mail', '+message-modify', ...U, '--mailbox', hop, '--message-ids', ids.join(',')];
  if (them.length) a.push('--add-label-ids', them.join(','));
  if (bo.length) a.push('--remove-label-ids', bo.join(','));
  if (thuMuc) a.push('--add-folder', thuMuc);
  return cli(a, { ghi: true });
}

/** Chữ người gõ → HTML đơn giản, đã thoát ký tự. */
function veHtml(chu) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(chu || '').trim().split(/\n{2,}/)
    .map((doan) => '<p>' + esc(doan).replace(/\n/g, '<br>') + '</p>').join('');
}

/** Chữ ký người dùng đặt trong app (chữ thường) → khối HTML cuối thư. */
function veChuKy(chuKy) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dong = String(chuKy || '').trim().split('\n').map((d) => esc(d.trim()));
  if (!dong.join('')) return '';
  return '<div class="hop-thu-chu-ky" style="margin-top:16px;padding-top:8px;border-top:1px solid #ddd;color:#555;font-size:13px">' +
    dong.join('<br>') + '</div>';
}

/** Thân thư đi: phần viết + chữ ký. Xem trước và gửi dùng chung một hàm. */
const thanThu = (chu, chuKy) => veHtml(chu) + veChuKy(chuKy);

/**
 * Chữ ký mặc định trên Lark Mail của một hộp, để gợi ý lần đầu. Chỉ đường
 * lark-cli có lệnh này, và Lark chỉ trả bản xem trước một dòng: tách lại
 * thành dòng theo các mốc quen thuộc (P :, E :, |).
 */
async function chuKyLark(hop) {
  if (!coCli()) return '';
  const d = await cli(['mail', '+signature', ...U, '--from', hop]).catch(() => null);
  const ds = (d && d.signatures) || [];
  const k = ds.find((x) => x.is_reply_default) || ds.find((x) => x.is_send_default) || ds[0];
  if (!k) return '';
  return String(k.content_preview || '').replace(/&nbsp;/g, ' ').replace(/\[image\]/g, '').replace(/-{3,}/g, '')
    .replace(/\s+([PETMW]\s*:)/g, '\n$1')
    .replace(/(\p{Lu}{2,})\s+(\p{Lu}\p{Ll})/gu, '$1\n$2')       // "…PHÚ QUỐC Lê Văn Hùng": tên công ty viết hoa hết
    .split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** Thêm một sự kiện vào lịch Lark của người dùng. Thời điểm là mili giây. */
async function taoLich(sk, tk = '') {
  if (tk) return quaApi(() => mapi.taoLich(tk, sk));
  const iso = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 16) + '+07:00';
  return cli(['calendar', '+create', ...U, '--summary', sk.tieuDe, '--start', iso(sk.batDau), '--end', iso(sk.ketThuc),
    '--description', sk.moTa || ''], { ghi: true });
}

/**
 * Trả lời một thư. Mặc định LƯU NHÁP; `gui: true` mới gửi đi.
 * `tatCa`: trả lời tất cả (giữ To/CC của thư gốc). `chuKy`: chữ ký đặt trong app.
 */
async function traLoi(hop, id, chu, { gui = false, tatCa = false, chuKy = '' } = {}, tk = '') {
  const html = thanThu(chu, chuKy);
  if (tk) return quaApi(() => mapi.traLoi(tk, hop, id, html, { gui, tatCa }));
  /* --no-signature: chữ ký đã nằm trong thân (đúng bản người dùng vừa xem
   * trước), không để lark-cli chèn thêm chữ ký thứ hai. */
  const a = ['mail', tatCa ? '+reply-all' : '+reply', ...U, '--mailbox', hop,
    '--message-id', id, '--body', html, '--no-signature'];
  if (gui) a.push('--confirm-send');
  return cli(a, { ghi: true });
}

module.exports = { LoiChuaNoi, loiGon, coCli, cacHop, danhSach, doc, doi, traLoi, tachNguoi, veHtml, veChuKy, thanThu, chuKyLark, taoLich, htmlSangChu, tachTrich };
