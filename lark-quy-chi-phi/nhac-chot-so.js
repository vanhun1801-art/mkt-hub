'use strict';
/**
 * ============================================================================
 * NHẮC CHỐT SỔ — hai mốc cuối tháng, hai lá tin khác nhau
 * ============================================================================
 *
 *   trước ngày cuối tháng 1 ngày  → "mai chốt sổ", còn kịp dọn
 *   ngày cuối tháng               → "hôm nay chốt sổ"
 *
 * Vì sao hai mốc chứ không một: tin ngày cuối tháng đến lúc không còn làm kịp
 * gì nữa. Gom hoá đơn, gán mã quyết toán cho mười mấy khoản — đó là việc của
 * hôm trước. Tin thứ nhất để KỊP, tin thứ hai để KHÔNG QUÊN.
 *
 * VÀ HAI LÁ TIN KHÁC NHAU, gửi hai nơi:
 *
 *   nhóm "Phòng MKT"  → nhắc cả phòng dọn nốt hoá đơn tháng này. KHÔNG một con
 *                       số tiền nào. Tồn quỹ, tổng chi, số khoản chưa quyết
 *                       toán là chuyện giữa người giữ quỹ và kế toán; bày lên
 *                       nhóm chung là bày sổ quỹ cho cả phòng đọc, mà chẳng
 *                       giúp ai nộp hoá đơn nhanh hơn.
 *   riêng anh Hùng    → đủ số để quyết có chốt được chưa.
 *
 * CHỐNG GỬI TRÙNG. Nhớ ngày đã gửi ở du-lieu/, cộng khoá uuid của Lark. Nhưng
 * ổ đĩa Render là ổ TẠM — deploy là mất dấu — nên còn chặn bằng KHUNG GIỜ: chỉ
 * gửi trong buổi sáng. Deploy buổi chiều thì không nhắn lại.
 *
 * Render gói miễn phí ngủ khi không ai vào: tin đi ở lần đầu hub thức trong
 * khung đó. Cùng cách đã dùng cho bản tin sáng của app Lịch tác nghiệp.
 *
 * DÙNG CHUNG BỘ KHUNG với nhac-thang.js và quy-thap.js: cùng depNhac(), cùng
 * hàm gửi hai chế độ (Render dùng bot Marketing Hub, máy cá nhân dùng bot
 * lark-cli), cùng cách tìm người nhận theo TÊN thay vì open_id — mã người Base
 * trả về là open_id THEO APP đang đọc, khai tay thì lệch app là gửi trượt.
 *
 * Tắt: QUY_CHOT_TAT=1 (riêng, không đụng QUY_NHAC_TAT của nhac-thang.js)
 * Nhóm: HUB_NHOM_MKT · người nhận riêng: QUY_NHAC_TEN.
 */
const fs = require('fs');
const path = require('path');

const LECH = 7 * 3600000;                 // giờ Việt Nam
const FILE = path.join(__dirname, 'du-lieu', 'nhac-chot-so.json');
const TEN = process.env.QUY_NHAC_TEN || 'Lê Văn Hùng';
/* Cùng nhóm mà hub đang dùng — khai một chỗ, đổi một chỗ. */
const NHOM = process.env.HUB_NHOM_MKT || 'oc_246eff4a1b9d2e711cedad1645830465';
const GIO_TU = 8, GIO_DEN = 12;
const boDau = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

const vn = (t) => new Date(t + LECH);
const ngayVN = (t) => vn(t).toISOString().slice(0, 10);
const tien = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const ddmm = (t) => String(vn(t).getUTCDate()).padStart(2, '0') + '/'
  + String(vn(t).getUTCMonth() + 1).padStart(2, '0');

/** Ngày cuối của tháng chứa mốc `t`, tính theo giờ Việt Nam. */
function ngayCuoiThang(t) {
  const d = vn(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Hôm nay là mốc nào: 'apChot' (trước ngày cuối 1 ngày) · 'cuoi' (ngày cuối) ·
 * '' (không phải mốc nào).
 *
 * Tính theo NGÀY CUỐI THẬT của tháng, không ghim cứng ngày 30: tháng 2 có 28
 * ngày, tháng 4 có 30. Ghim cứng thì tháng nào cũng nhắc lệch, và lệch nặng
 * nhất đúng vào tháng ngắn nhất.
 */
function mocCua(t = Date.now()) {
  const ngay = vn(t).getUTCDate();
  const cuoi = ngayCuoiThang(t);
  if (ngay === cuoi) return 'cuoi';
  if (ngay === cuoi - 1) return 'apChot';
  return '';
}

const nutMo = (urlHub, chu) => ({
  tag: 'action',
  actions: [{
    tag: 'button', type: 'primary',
    text: { tag: 'plain_text', content: chu || 'Mở sổ quỹ' },
    url: String(urlHub || '').replace(/\/+$/, '') + '/m/quy-chi-phi/',
  }],
});

/* ---------------------------------------------------------------------------
 * TIN GỬI NHÓM "PHÒNG MKT" — không một con số tiền nào
 * -------------------------------------------------------------------------
 * Việc của cả phòng ở đây chỉ có một: khoản nào mình đã chi trong tháng thì
 * nộp/đính kèm hoá đơn cho đủ, để người giữ quỹ gom lại thanh toán và đóng sổ.
 * Nói đúng một việc đó. Thêm tồn quỹ với tổng chi vào là vừa lộ sổ vừa loãng.
 * ------------------------------------------------------------------------- */
function theNhom(moc, urlHub, t = Date.now()) {
  const mai = moc === 'apChot';
  return {
    config: { wide_screen_mode: true },
    header: {
      template: mai ? 'orange' : 'red',
      title: { tag: 'plain_text',
        content: mai ? 'Mai chốt sổ quỹ Marketing — dọn nốt hoá đơn tháng này'
          : 'Hôm nay chốt sổ quỹ Marketing — hạn cuối nộp hoá đơn' },
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: mai
        ? '**Mai là ngày cuối tháng.** Cả nhà rà lại các khoản mình đã chi trong '
          + 'tháng này, nộp cho đủ hoá đơn / chứng từ trong hôm nay nhé.'
        : '**Hôm nay là ngày cuối tháng (' + ddmm(t) + ') — hạn cuối.** Khoản nào còn '
          + 'thiếu hoá đơn thì gửi ngay trong hôm nay.' } },
      { tag: 'hr' },
      { tag: 'div', text: { tag: 'lark_md', content:
        '**Cần làm:**\n'
        + '· Mở **Quỹ chi phí → Cần bổ sung chứng từ**, khoản nào của mình thì đính hoá đơn vào\n'
        + '· Khoản đã chi mà chưa khai thì khai nốt trong hôm nay\n'
        + '· Gom đủ rồi mới thanh toán và đóng sổ tháng được' } },
      { tag: 'div', text: { tag: 'lark_md', content:
        '<font color="grey">Qua ngày chốt, kỳ tháng này đóng lại — khoản nộp muộn '
        + 'phải chờ sang kỳ sau.</font>' } },
      nutMo(urlHub, 'Mở Quỹ chi phí'),
    ],
  };
}

/* ---------------------------------------------------------------------------
 * TIN RIÊNG NGƯỜI GIỮ QUỸ — có số, để quyết chốt được hay chưa
 * ------------------------------------------------------------------------- */
function theRieng(so, moc, urlHub, t = Date.now()) {
  const mai = moc === 'apChot';
  const viec = [];
  if (so.chuaQuyetToan) {
    viec.push('**' + so.chuaQuyetToan + ' khoản chưa có mã quyết toán** — chị kế toán đóng '
      + 'sổ bằng mã này. Chốt kỳ khi chúng còn trống thì chúng nằm lại kỳ cũ.');
  }
  if (so.thieuChungTu) viec.push(so.thieuChungTu + ' khoản chưa có chứng từ.');
  if (!viec.length) viec.push('Không còn khoản nào vướng — chốt kỳ được ngay.');

  return {
    config: { wide_screen_mode: true },
    header: {
      template: mai ? 'orange' : 'red',
      title: { tag: 'plain_text',
        content: mai ? 'Mai chốt sổ quỹ Marketing' : 'Hôm nay chốt sổ quỹ Marketing' },
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: mai
        ? '**Mai là ngày cuối tháng.** Hôm nay còn kịp dọn nốt. Đã nhắc nhóm Phòng MKT nộp hoá đơn.'
        : '**Hôm nay là ngày cuối tháng (' + ddmm(t) + ').** Chốt sổ rồi mở kỳ mới.' } },
      { tag: 'hr' },
      { tag: 'div', fields: [
        { is_short: true, text: { tag: 'lark_md', content: '**Kỳ đang dùng**\n' + (so.ky || '—') } },
        { is_short: true, text: { tag: 'lark_md', content: '**Tồn quỹ**\n' + tien(so.ton) + ' đ' } },
        { is_short: true, text: { tag: 'lark_md', content: '**Khoản chi trong kỳ**\n' + (so.soKhoan || 0) } },
        { is_short: true, text: { tag: 'lark_md', content: '**Chưa quyết toán**\n' + (so.chuaQuyetToan || 0) } },
      ] },
      { tag: 'div', text: { tag: 'lark_md', content: viec.map((x) => '· ' + x).join('\n') } },
      { tag: 'hr' },
      { tag: 'div', text: { tag: 'lark_md', content:
        'Vào **Các lần ứng tiền** bấm *Chốt kỳ & mở kỳ mới* — số tồn thành số dư đầu kỳ mới. '
        + 'Gửi báo cáo BGĐ ở tab *Báo cáo gửi BGĐ*.' } },
      nutMo(urlHub),
    ],
  };
}

/* ---------------------------------------------------------------------------
 * CHẠY
 * ------------------------------------------------------------------------- */
function timNguoiNhan(chi, dot) {
  const k = boDau(TEN);
  for (const r of [...dot.map((d) => d.nguoiGiu), ...chi.map((c) => c.nguoi)]) {
    for (const u of r || []) if (u && u.id && boDau(u.name) === k) return u;
  }
  return null;
}

let tinApp = null;
async function gui(lark, cfg, dich, card, khoa) {
  if (cfg.appId && cfg.appSecret) {                          // Render: bot Marketing Hub
    if (!tinApp) tinApp = require('../lark-chung/tin-lark').tao({ appId: cfg.appId, appSecret: cfg.appSecret, apiHost: cfg.apiHost, tenApp: 'Marketing Hub' });
    return tinApp.gui({ ...dich, card, khoa });
  }
  try {                                                       // máy: bot lark-cli
    const den = dich.chatId ? ['--chat-id', dich.chatId] : ['--user-id', dich.userId];
    await lark.cli(['im', '+messages-send', '--as', 'bot', ...den, '--msg-type', 'interactive',
      '--content', JSON.stringify(card), '--idempotency-key', khoa, '--format', 'json'], { retries: 1 });
    return { ok: true };
  } catch (e) { return { ok: false, loi: e.message }; }
}

/** Số của kỳ đang dùng — chỉ dùng cho tin RIÊNG, tin nhóm không có số nào. */
function soCuaKy(chi, dot) {
  const cu = dot.find((d) => d.tinhTrang === 'Đang dùng');
  if (!cu) return null;
  const trong = chi.filter((c) => (c.dot || []).includes(cu.id));
  return {
    ky: cu.ma,
    ton: (cu.conLai === 0 || cu.conLai) ? cu.conLai : (Number(cu.tongNap) || 0) - (Number(cu.tongChi) || 0),
    soKhoan: trong.length,
    chuaQuyetToan: trong.filter((c) => !String(c.maQuyetToan || '').trim()).length,
    thieuChungTu: trong.filter((c) => !((c.hoaDon || []).length || String(c.linkCu || '').trim())
      && c.tinhTrang !== 'Chờ chi' && !String(c.maQuyetToan || '').trim()).length,
  };
}

/**
 * Dựng (+ gửi). dep = { docChi, lark, cfg, urlHub }.
 * `ep` bỏ qua luật ngày (gửi thử) · `xem` chỉ dựng, không gửi.
 */
async function chay(dep, { t = Date.now(), moc, ep = false, xem = false, tieuDeThem = '' } = {}) {
  const m = moc || mocCua(t);
  if (!m && !ep) return { ok: true, bo: 'hôm nay không phải mốc chốt sổ' };
  const mm = m || 'apChot';

  const { chi, dot } = await dep.docChi();
  const theN = theNhom(mm, dep.urlHub, t);
  const so = soCuaKy(chi, dot);
  const theR = so ? theRieng(so, mm, dep.urlHub, t) : null;
  if (tieuDeThem) {
    theN.header.title.content = tieuDeThem + theN.header.title.content;
    if (theR) theR.header.title.content = tieuDeThem + theR.header.title.content;
  }
  if (xem) return { ok: true, moc: mm, nhomThe: theN, riengThe: theR, so };

  const khoa = (noi) => 'quy-chot-' + ngayVN(t) + '-' + mm + '-' + noi + (ep ? '-' + Date.now() : '');

  const raNhom = NHOM
    ? await gui(dep.lark, dep.cfg, { chatId: NHOM }, theN, khoa('nhom'))
    : { ok: false, loi: 'chưa khai nhóm (HUB_NHOM_MKT)' };

  /* Tin nhóm hỏng KHÔNG chặn tin riêng, và ngược lại: hai việc độc lập, mà
   * người giữ quỹ không nhận được tin thì cả tháng không ai chốt sổ. */
  let raRieng = { ok: false, loi: 'chưa dựng được số của kỳ đang dùng' };
  if (theR) {
    const u = timNguoiNhan(chi, dot);
    raRieng = u
      ? await gui(dep.lark, dep.cfg, { userId: u.id }, theR, khoa('rieng'))
      : { ok: false, loi: 'không tìm thấy "' + TEN + '" trong cột Người đề nghị / Người giữ quỹ' };
  }

  return { moc: mm, ok: raNhom.ok || raRieng.ok, nhom: raNhom, rieng: raRieng, so };
}

function bat(dep) {
  if (process.env.QUY_CHOT_TAT === '1') return;
  let dang = false, daGui = '';
  try { daGui = JSON.parse(fs.readFileSync(FILE, 'utf8')).dau || ''; } catch (_) { /* chưa có */ }

  const thu = async () => {
    const t = Date.now();
    const m = mocCua(t);
    const dau = ngayVN(t) + '-' + m;
    const h = vn(t).getUTCHours();
    if (dang || !m || daGui === dau || h < GIO_TU || h >= GIO_DEN) return;
    dang = true;
    try {
      const r = await chay(dep, { t, moc: m });
      if (r.ok) {
        daGui = dau;
        try {
          fs.mkdirSync(path.dirname(FILE), { recursive: true });
          fs.writeFileSync(FILE, JSON.stringify({ dau }));
        } catch (_) { /* ổ tạm, mất thì đã có khung giờ chặn */ }
      }
      console.log('[NHẮC CHỐT SỔ]', r.bo || (r.moc + ': nhóm '
        + (r.nhom.ok ? 'OK' : 'LỖI ' + r.nhom.loi) + ' · riêng '
        + (r.rieng.ok ? 'OK' : 'LỖI ' + r.rieng.loi)));
    } catch (e) {
      console.error('[NHẮC CHỐT SỔ]', e.message);
    } finally { dang = false; }
  };

  setTimeout(thu, 90 * 1000);
  setInterval(thu, 10 * 60 * 1000).unref();
}

module.exports = { bat, chay, mocCua, ngayCuoiThang, theNhom, theRieng, soCuaKy, timNguoiNhan, NHOM };
