'use strict';
/**
 * Gửi email qua Lark Mail — hộp thư @rootytrip.com nằm trên Lark (MX = larksuite),
 * nên dùng thẳng lark-cli `mail +send` bằng danh tính của anh Hùng: thư đi từ
 * hộp thư thật, có chữ ký mặc định, nằm trong mục Đã gửi như thư gõ tay.
 *
 * Hai kiểu:
 *   gui=true  → --confirm-send, đi ngay
 *   gui=false → chỉ lưu NHÁP trong Lark Mail, mở Lark ra sửa/gửi sau
 *
 * Chế độ api (Render) không có phiên user của lark-cli — gửi mail bằng tenant
 * token thì không đứng tên anh được, nên cố ý báo lỗi có chữ thay vì gửi bằng
 * danh tính khác.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const THU_MUC = path.join(__dirname, 'du-lieu');
const hopLe = (e) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e);
const tach = (s) => String(s || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

/**
 * @param {{den:string, cc?:string, tieuDe:string, html:string, gui:boolean, thu?:boolean}} m
 * `thu: true` = --dry-run (test dùng, không gửi gì).
 */
/* ---- Render (chế độ api): gửi bằng Lark Mail Open API với tenant token của app Marketing Hub ----
 * Thư đi từ hộp thư cfg.mail.from (mặc định cmo@rootytrip.com) — anh Hùng 24/09 muốn gửi bằng cmo@.
 * Cần app có quyền mail:user_mailbox.message:send VÀ quản trị viên cho app dùng hộp thư đó
 * (Lark Admin → Ứng dụng → Marketing Hub → phạm vi dữ liệu Mail). Thiếu thì báo đúng chữ, không gửi bằng hộp thư khác.
 * Không có "lưu nháp" ở đường này — chỉ gửi ngay. */
async function guiApi(m, den, cc) {
  if (!m.gui) throw Object.assign(new Error('Bản trên Hub chỉ gửi thẳng được, chưa lưu nháp vào Lark Mail — bấm Gửi ngay, hoặc Chép nội dung để dán vào Lark Mail.'), { http: 400 });
  const tu = cfg.mail.from || 'cmo@rootytrip.com';
  const api = require('./larkapi');
  const body = { subject: m.tieuDe, to: den.map((x) => ({ mail_address: x })), body_html: m.html, head_from: { name: cfg.mail.tenGui || 'Rooty Trip Phú Quốc' } };
  if (cc.length) body.cc = cc.map((x) => ({ mail_address: x }));
  if (m.thu) return { ok: true, nhap: false, du: { dryRun: true, tu, body } };
  try {
    const d = await api.call('POST', '/open-apis/mail/v1/user_mailboxes/' + encodeURIComponent(tu) + '/messages/send', { body, retries: 1 });   // không thử lại: lỗi mạng sau khi đã gửi thì thử lại là gửi hai lần
    return { ok: true, nhap: false, tu, du: d };
  } catch (e) {
    const s = String(e.message || e);
    if (/99991672|99991679|permission|scope|forbidden|access denied|no auth/i.test(s) || [99991672, 99991679, 1230002, 1230003].includes(e.code)) {
      throw Object.assign(new Error('App Marketing Hub chưa được phép gửi thư từ ' + tu + '. Cần 2 việc trên Lark: (1) Developer Console → Marketing Hub → Quyền: bật "mail:user_mailbox.message:send" rồi phát hành phiên bản; ' +
        '(2) Lark Admin → Ứng dụng → Marketing Hub → Phạm vi dữ liệu: cho phép hộp thư ' + tu + '. Thư đang soạn chưa đi đâu cả. (' + s.slice(0, 120) + ')'), { http: 424 });
    }
    if (/not found|mailbox/i.test(s)) throw Object.assign(new Error('Không tìm thấy hộp thư ' + tu + ' trên Lark Mail (' + s.slice(0, 120) + ')'), { http: 424 });
    throw e;
  }
}

async function guiMail(m) {
  const den = tach(m.den);
  const cc = tach(m.cc);
  if (!den.length) throw new Error('Chưa có địa chỉ người nhận');
  const sai = [...den, ...cc].filter((e) => !hopLe(e));
  if (sai.length) throw new Error('Địa chỉ email không hợp lệ: ' + sai.join(', '));
  if (!String(m.tieuDe || '').trim()) throw new Error('Chưa có tiêu đề');
  if (!String(m.html || '').trim()) throw new Error('Nội dung trống');
  if (cfg.mode === 'api') return guiApi(m, den, cc);

  const lark = require('./lark');
  fs.mkdirSync(THU_MUC, { recursive: true });
  /* --body-file chỉ nhận đường dẫn TƯƠNG ĐỐI trong thư mục đang chạy. */
  const ten = 'thu-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.html';
  fs.writeFileSync(path.join(THU_MUC, ten), m.html, 'utf8');
  const args = ['mail', '+send', '--as', 'user', '--to', den.join(','), '--subject', m.tieuDe,
    '--body-file', 'du-lieu/' + ten];
  if (cc.length) args.push('--cc', cc.join(','));
  if (cfg.mail.from) args.push('--from', cfg.mail.from);
  if (m.gui) args.push('--confirm-send');
  if (m.thu) args.push('--dry-run');
  try {
    const d = await lark.cli(args, { cwd: __dirname, retries: 1, timeout: 90000 });
    return { ok: true, nhap: !m.gui, du: d };
  } catch (e) {
    /* lark-cli trả nguyên khối JSON — dịch ra câu người đọc được, kèm lệnh sửa. */
    const s = String(e.message || e);
    const thieu = /missing required scope\(s\):\s*([\w:.\-, ]+)/.exec(s);
    if (thieu || /missing_scope/.test(s)) {
      const sc = thieu ? thieu[1].trim() : 'mail:user_mailbox.message:send';
      throw Object.assign(new Error('Phiên lark-cli chưa có quyền gửi mail (' + sc + '). Chạy lệnh: lark-cli auth login --scope "' + sc +
        '" rồi bấm đồng ý trên trang Lark mở ra, sau đó gửi lại. Email đang soạn chưa đi đâu cả.'), { http: 424 });
    }
    if (/not logged in|no user|token.*(expired|invalid)/i.test(s)) {
      throw Object.assign(new Error('Phiên lark-cli của anh đã hết hạn — chạy lark-cli auth login rồi gửi lại.'), { http: 424 });
    }
    throw e;
  } finally {
    try { fs.unlinkSync(path.join(THU_MUC, ten)); } catch (_) {}
  }
}

module.exports = { guiMail, hopLe, tach };
