'use strict';
/**
 * Bản tin sáng — hôm nay có lịch tác nghiệp của bất kỳ ai thì nhắn anh Hùng (26/09).
 *
 * Một thẻ Lark lúc từ 7:00 (giờ VN): mỗi lịch trong ngày một khối — giờ, tên hoạt động,
 * địa điểm, ai đi, phương tiện, trạng thái (chưa duyệt thì tô đỏ), có xin FOC / Media không,
 * kèm nút mở đúng lịch trên hub. Hôm nay không có lịch nào thì KHÔNG nhắn.
 *
 * NGƯỜI NHẬN: tìm theo TÊN (mặc định "Lê Văn Hùng", đổi bằng LICH_BAN_TIN_TEN) trong cột
 * Phụ trách / Nhân sự của chính các lịch. Lý do: mã người Base trả về là open_id THEO APP
 * đang đọc — trên Render là app Marketing Hub, trên máy là app lark-cli — nên mã lấy từ dữ
 * liệu luôn khớp với bot đang gửi, không phải khai open_id tay (open_id riêng theo từng app,
 * cấu hình cũ LARK_MANAGER_IDS từng lệch vì thế).
 *
 * CHỐNG GỬI TRÙNG: nhớ ngày đã gửi ở du-lieu/ban-tin-sang.json + khoá uuid của Lark. Render
 * xoá ổ đĩa mỗi lần deploy nên chỉ gửi trong khung 7:00–11:59 — deploy buổi chiều không nhắn
 * lại. Render gói miễn phí ngủ khi không ai vào: tin đi ở lần đầu hub thức trong khung đó.
 * Tắt: LICH_BAN_TIN_TAT=1.
 */
const fs = require('fs');
const path = require('path');

const LECH = 7 * 3600000, NGAY = 86400000;
const TEN = process.env.LICH_BAN_TIN_TEN || 'Lê Văn Hùng';
const GIO_TU = Number(process.env.LICH_BAN_TIN_GIO || 7), GIO_DEN = 12;
const FILE = path.join(__dirname, 'du-lieu', 'ban-tin-sang.json');
const BO = ['Hủy lịch', 'Từ chối'];
const DA_DUYET = ['Duyệt/Chờ tác nghiệp', 'Đang báo cáo', 'Đã hoàn tất'];

const ngayVN = (t) => new Date(t + LECH).toISOString().slice(0, 10);
const dauNgay = (t) => Math.floor((t + LECH) / NGAY) * NGAY - LECH;
const hhmm = (t) => { const d = new Date(t + LECH); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
const ddmm = (t) => { const d = new Date(t + LECH); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
const THU = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const ms = (v) => (typeof v === 'number' ? v : v ? Date.parse(v) || 0 : 0);
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

/** Lịch diễn ra trong ngày `t` (cả lịch nhiều ngày đang giữa chừng). */
function lichHomNay(items, t = Date.now()) {
  const a = dauNgay(t), b = a + NGAY;
  return items.filter((x) => {
    if (BO.includes(x.status)) return false;
    const s = ms(x.start), e = ms(x.end) || s;
    return s && s < b && e >= a;
  }).sort((x, y) => ms(x.start) - ms(y.start));
}

function timNguoiNhan(items) {
  const k = boDau(TEN);
  for (const x of items) for (const u of [...(x.owner || []), ...(x.staff || [])]) if (u && u.id && boDau(u.name) === k) return u;
  return null;
}

function theSang(ds, t, urlHub) {
  const a = dauNgay(t);
  const el = [];
  const chua = ds.filter((x) => !DA_DUYET.includes(x.status)).length;
  ds.forEach((x, i) => {
    if (i) el.push({ tag: 'hr' });
    const s = ms(x.start), e = ms(x.end);
    const gio = s < a ? 'từ ' + ddmm(s) : hhmm(s);
    const den = e ? (e >= a + NGAY ? 'tới ' + ddmm(e) : hhmm(e)) : '';
    const nguoi = [...new Set([...(x.owner || []), ...(x.staff || [])].map((u) => u.name).filter(Boolean))];
    const duyet = DA_DUYET.includes(x.status);
    const them = [x.focRequest ? 'xin FOC' + (x.focStatus ? ' · ' + x.focStatus : '') : '', x.mediaRequest ? 'cần Media' + (x.mediaStatus ? ' · ' + x.mediaStatus : '') : ''].filter(Boolean);
    el.push({ tag: 'markdown', content: '**' + gio + (den ? ' – ' + den : '') + '  ·  ' + (x.title || 'Lịch tác nghiệp') + '**' +
      (duyet ? '' : '\n<font color="red">' + (x.status || 'Chưa duyệt') + ' — chưa được duyệt</font>') });
    el.push({ tag: 'div', fields: [
      { is_short: true, text: { tag: 'lark_md', content: '**Ai đi**\n' + (nguoi.join(', ') || '—') } },
      { is_short: true, text: { tag: 'lark_md', content: '**Ở đâu**\n' + (x.diaDiem || '—') } },
      { is_short: true, text: { tag: 'lark_md', content: '**Phương tiện**\n' + ((x.transport || []).join(', ') || '—') } },
      { is_short: true, text: { tag: 'lark_md', content: '**Trạng thái**\n' + (x.status || '—') } },
    ] });
    if (them.length || x.purpose) el.push({ tag: 'note', elements: [{ tag: 'plain_text', content: [x.purpose ? 'Mục đích: ' + String(x.purpose).slice(0, 120) : '', them.join(' · ')].filter(Boolean).join('  ·  ') }] });
    el.push({ tag: 'action', actions: [{ tag: 'button', type: i === 0 ? 'primary' : 'default', text: { tag: 'plain_text', content: 'Mở lịch này' }, url: urlHub + '/#/m/lich-tac-nghiep?rec=' + encodeURIComponent(x.id) }] });
  });
  const d = new Date(t + LECH);
  return {
    config: { wide_screen_mode: true },
    header: {
      template: chua ? 'orange' : 'blue',
      title: { tag: 'plain_text', content: 'Tác nghiệp hôm nay · ' + THU[d.getUTCDay()] + ' ' + ddmm(t) + ' · ' + ds.length + ' lịch' + (chua ? ' (' + chua + ' chưa duyệt)' : '') },
    },
    elements: el,
  };
}

let tinApp = null;
async function gui(lark, cfg, u, card, khoa) {
  if (cfg.appId && cfg.appSecret) {                         // Render: bot Marketing Hub
    if (!tinApp) tinApp = require('../lark-chung/tin-lark').tao({ appId: cfg.appId, appSecret: cfg.appSecret, apiHost: cfg.apiHost, tenApp: 'Marketing Hub' });
    return tinApp.gui({ userId: u.id, card, khoa });
  }
  try {                                                      // máy: bot lark-cli, cùng app với mã người
    await lark.cli(['im', '+messages-send', '--as', 'bot', '--user-id', u.id, '--msg-type', 'interactive', '--content', JSON.stringify(card), '--idempotency-key', khoa, '--format', 'json'], { retries: 1 });
    return { ok: true };
  } catch (e) { return { ok: false, loi: e.message }; }
}

/** Dựng + gửi. `ep` = bỏ qua khung giờ và dấu đã gửi (gửi thử). */
async function chay({ getRecords, toItem, lark, cfg }, { ep = false, t = Date.now(), tieuDeThem = '' } = {}) {
  const items = (await getRecords(true)).map(toItem);
  const ds = lichHomNay(items, t);
  if (!ds.length) return { ok: true, bo: 'hôm nay không có lịch' };
  const u = timNguoiNhan(items);
  if (!u) return { ok: false, loi: 'Không tìm thấy "' + TEN + '" trong cột Phụ trách / Nhân sự của các lịch' };
  const card = theSang(ds, t, (process.env.PUBLIC_URL || process.env.HUB_URL || 'https://mkt-hub-w6hi.onrender.com').replace(/\/+$/, ''));
  if (tieuDeThem) card.header.title.content = tieuDeThem + card.header.title.content;
  const r = await gui(lark, cfg, u, card, 'lich-sang-' + ngayVN(t) + (ep ? '-' + Date.now() : ''));
  return Object.assign({ soLich: ds.length, nguoiNhan: u.name }, r);
}

function bat(dep) {
  if (process.env.LICH_BAN_TIN_TAT === '1') return;
  let dang = false, daGui = '';
  try { daGui = JSON.parse(fs.readFileSync(FILE, 'utf8')).ngay || ''; } catch (_) { /* chưa có */ }
  const thu = async () => {
    const t = Date.now(), h = new Date(t + LECH).getUTCHours(), ngay = ngayVN(t);
    if (dang || daGui === ngay || h < GIO_TU || h >= GIO_DEN) return;
    dang = true;
    try {
      const r = await chay(dep, { t });
      if (r.ok) {
        daGui = ngay;
        try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ ngay })); } catch (_) { /* ổ tạm */ }
      }
      console.log('[BẢN TIN SÁNG]', r.bo || (r.ok ? 'đã gửi ' + r.soLich + ' lịch cho ' + r.nguoiNhan : 'LỖI ' + r.loi));
    } catch (e) { console.error('[BẢN TIN SÁNG]', e.message); } finally { dang = false; }
  };
  setTimeout(thu, 60 * 1000);
  setInterval(thu, 10 * 60 * 1000).unref();
}

module.exports = { bat, chay, lichHomNay, theSang, timNguoiNhan };
