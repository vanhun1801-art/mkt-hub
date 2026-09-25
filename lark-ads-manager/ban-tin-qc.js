'use strict';
/**
 * Bản tin quảng cáo đầu ngày + cuối ngày cho anh Hùng (25/09/2026).
 *
 *   SÁNG (từ 8:00)  — tổng kết HÔM QUA, so với hôm kia.
 *   TỐI  (từ 20:00) — HÔM NAY tính tới giờ gửi, so với cả ngày hôm qua; kèm chiến dịch
 *                     "Đang chạy" mà hôm nay chưa tiêu đồng nào (nghi không phân phối).
 * Đổi giờ: QC_GIO_SANG / QC_GIO_TOI. Tắt: QC_BAN_TIN_TAT=1.
 *
 * SỐ LẤY ĐÚNG CHỖ APP ĐANG LẤY: M.overview trên cùng bộ dữ liệu màn hình Tổng quan
 * (số live từ nền tảng đè lên Base 14 ngày gần nhất) — không tự cộng theo cách khác, để
 * số trong tin khớp số anh mở app ra thấy.
 *
 * Cảnh báo: dùng M.alerts của app, bỏ loại "Thiếu số liệu" khỏi danh sách (chỉ đếm) —
 * mười mấy dòng quảng cáo cũ chưa có số sẽ nhấn chìm cảnh báo thật.
 *
 * Gửi qua hub (lark-chung/gui-anh-hung.js) → bot Marketing Hub. Nhớ buổi đã gửi ở
 * du-lieu/ban-tin-qc.json; Render xoá ổ khi deploy nên mỗi buổi có khung giờ gửi.
 */
const fs = require('fs');
const path = require('path');
const guiAnhHung = require('../lark-chung/gui-anh-hung');

const LECH = 7 * 3600000, NGAY = 86400000;
const GIO = { sang: Number(process.env.QC_GIO_SANG || 8), toi: Number(process.env.QC_GIO_TOI || 20) };
const KHUNG = { sang: 4, toi: 3 };                          // gửi trong bao nhiêu giờ kể từ giờ hẹn
const FILE = path.join(__dirname, 'du-lieu', 'ban-tin-qc.json');
const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const ngayVN = (t) => new Date(t + LECH).toISOString().slice(0, 10);
const ddmm = (k) => k.slice(8, 10) + '/' + k.slice(5, 7);
const thu = (k) => THU[new Date(k + 'T00:00:00Z').getUTCDay()];
const d = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const tien = (n) => d(n) + ' đ';
const pct = (x) => (x == null || !isFinite(x) ? '' : ' (' + (x > 0 ? '+' : '') + String(Math.round(x)).replace('.', ',') + '%)');
const cat = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const VIET_TAT = { Facebook: 'FB', TikTok: 'TT', 'Google Ads': 'GG' };
const MUC = { high: '🔴', mid: '🟠', low: '🟡' };

/** Dựng thẻ. `buoi` = 'sang' | 'toi'. `data` = bộ dữ liệu như màn hình Tổng quan. */
function dung(M, data, buoi, t = Date.now()) {
  const homNay = ngayVN(t), homQua = ngayVN(t - NGAY);
  const ky = buoi === 'sang' ? homQua : homNay;
  const o = M.overview(data, { from: ky, to: ky });
  const k = o.kpi, dt = o.delta, tg = o.targets || {};
  const tgMacDinh = (tg.cpa && tg.cpa.default) || 0;

  /* tối: so với CẢ NGÀY hôm qua thay vì cùng giờ — nền tảng không trả số theo giờ */
  let soSanh = '';
  if (buoi === 'toi') {
    const q = M.overview(data, { from: homQua, to: homQua }).kpi;
    soSanh = q.spend > 0 ? '\nBằng **' + Math.round((k.spend / q.spend) * 100) + '%** chi tiêu cả ngày hôm qua (' + tien(q.spend) + ' · ' + q.conversions + ' chuyển đổi).' : '';
  }

  const el = [];
  el.push({ tag: 'markdown', content:
    '**Chi** ' + tien(k.spend) + (buoi === 'sang' ? pct(dt.spend) : '') +
    '  ·  **Chuyển đổi** ' + d(k.conversions) + (buoi === 'sang' ? pct(dt.conversions) : '') +
    '  ·  **CPA** ' + (k.conversions ? tien(k.cpa) + (buoi === 'sang' ? pct(dt.cpa) : '') : '—') +
    '  ·  CTR ' + String(k.ctr).replace('.', ',') + '%' +
    (buoi === 'sang' ? '\n<font color="grey">so với ' + thu(o.range.prevFrom) + ' ' + ddmm(o.range.prevFrom) + '</font>' : soSanh) });

  /* theo nền tảng */
  if (o.byPlatform.length) {
    el.push({ tag: 'div', fields: o.byPlatform.map((p) => {
      const cao = p.cpaTarget > 0 && p.conversions > 0 && p.cpa > p.cpaTarget;
      return { is_short: true, text: { tag: 'lark_md', content: '**' + p.platform + '**\n' + tien(p.spend) + ' · ' + p.conversions + ' CĐ\n' +
        (p.conversions ? (cao ? '<font color="red">CPA ' + tien(p.cpa) + '</font>' : 'CPA ' + tien(p.cpa)) + (p.cpaTarget ? ' / mục tiêu ' + d(p.cpaTarget) : '') : (p.spend ? '<font color="red">chưa có chuyển đổi</font>' : '—')) } };
    }) });
  }

  /* chiến dịch có tiêu tiền */
  const camp = o.byCampaign.filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend);
  if (camp.length) {
    el.push({ tag: 'markdown', content: '**Chiến dịch**\n' + camp.slice(0, 7).map((c) =>
      '• ' + cat(c.name, 38) + ' (' + (VIET_TAT[c.platform] || c.platform) + ') · ' + tien(c.spend) + ' · ' + c.conversions + ' CĐ' +
      (c.conversions ? ' · CPA ' + d(c.cpa) : '') + (c.health && c.health.label ? ' · ' + c.health.label : '')).join('\n') +
      (camp.length > 7 ? '\n… và ' + (camp.length - 7) + ' chiến dịch nữa' : '') });
  }
  if (buoi === 'toi') {
    const im = o.byCampaign.filter((c) => c.status === 'Đang chạy' && !(c.spend > 0));
    if (im.length) el.push({ tag: 'markdown', content: '<font color="orange">**Đang chạy mà hôm nay chưa tiêu đồng nào:** ' + im.map((c) => cat(c.name, 40)).join(' · ') + '</font>' });
  }

  /* quảng cáo tốt nhất / cần xử lý */
  const top = (o.topAds || [])[0];
  const xau = (o.worstAds || []).slice(0, 3);
  if (top || xau.length) {
    el.push({ tag: 'markdown', content:
      (top ? '**Chạy tốt nhất:** ' + cat(top.name, 60) + ' · ' + tien(top.spend) + ' · ' + top.conversions + ' CĐ' + (top.conversions ? ' · CPA ' + d(top.cpa) : '') : '') +
      (xau.length ? (top ? '\n' : '') + '**Cần xem lại:**\n' + xau.map((a) => '• ' + cat(a.name, 60) + ' · ' + tien(a.spend) + ' · ' + a.conversions + ' CĐ').join('\n') : '') });
  }

  /* cảnh báo (bỏ "Thiếu số liệu", gộp trùng tên) */
  const thieu = o.alerts.filter((a) => a.kind === 'data').length;
  const xem = new Set();
  const canh = o.alerts.filter((a) => a.kind !== 'data' && !xem.has(a.title) && xem.add(a.title))
    .sort((a, b) => ['high', 'mid', 'low'].indexOf(a.level) - ['high', 'mid', 'low'].indexOf(b.level));
  if (canh.length || thieu) {
    el.push({ tag: 'hr' });
    el.push({ tag: 'markdown', content: '**Cảnh báo**\n' + canh.slice(0, 6).map((a) => (MUC[a.level] || '•') + ' ' + cat(a.title, 90)).join('\n') +
      (canh.length > 6 || thieu ? '\n<font color="grey">' + [canh.length > 6 ? '+' + (canh.length - 6) + ' cảnh báo khác' : '', thieu ? thieu + ' quảng cáo thiếu số liệu' : ''].filter(Boolean).join(' · ') + '</font>' : '') });
  }

  /* nền tảng không kéo được số */
  const loiKN = ((data.live && data.live.loi) || []).filter((x) => x && x.loi);
  if (loiKN.length) el.push({ tag: 'markdown', content: '<font color="red">**Không lấy được số:** ' + loiKN.map((x) => (x.platform ? x.platform + ': ' : '') + cat(x.loi, 100)).join(' · ') + '</font>' });

  /* lũy kế tháng */
  const dauThang = homNay.slice(0, 8) + '01';
  const thang = M.overview(data, { from: dauThang, to: buoi === 'sang' ? (homQua >= dauThang ? homQua : dauThang) : homNay }).kpi;
  el.push({ tag: 'note', elements: [{ tag: 'plain_text', content: 'Tháng ' + homNay.slice(5, 7) + ' đến nay: chi ' + tien(thang.spend) + ' · ' + d(thang.conversions) + ' chuyển đổi' + (thang.conversions ? ' · CPA ' + tien(thang.cpa) : '') }] });

  const urlHub = (process.env.PUBLIC_URL || process.env.HUB_URL || 'https://mkt-hub-w6hi.onrender.com').replace(/\/+$/, '');
  el.push({ tag: 'action', actions: [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: 'Mở Quản lý quảng cáo' }, url: urlHub + '/#/m/quang-cao' }] });

  const gap = loiKN.length || canh.some((a) => a.level === 'high');
  const cpaCao = tgMacDinh && k.conversions && k.cpa > tgMacDinh;
  const gioNay = new Date(t + LECH).toISOString().slice(11, 16);
  return {
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: gap ? 'red' : cpaCao || (k.spend && !k.conversions) ? 'orange' : 'green',
        title: { tag: 'plain_text', content: (buoi === 'sang' ? 'Quảng cáo hôm qua · ' + thu(ky) + ' ' + ddmm(ky) : 'Quảng cáo hôm nay tới ' + gioNay) + ' · ' + tien(k.spend) + ' · ' + k.conversions + ' chuyển đổi' },
      },
      elements: el,
    },
    tomTat: { buoi, ky, chi: k.spend, chuyenDoi: k.conversions, cpa: k.cpa, canhBao: canh.length, thieuSo: thieu, loiKetNoi: loiKN.length },
  };
}

/** dep = { M, layDuLieu, cli } */
async function chay(dep, { buoi, t = Date.now(), xem = false, ep = false } = {}) {
  const data = await dep.layDuLieu();
  const { card, tomTat } = dung(dep.M, data, buoi, t);
  if (xem) return Object.assign({ ok: true, card }, tomTat);
  if (ep) card.header.title.content = '[THỬ] ' + card.header.title.content;
  const r = await guiAnhHung.gui({ card, khoa: 'qc-' + buoi + '-' + ngayVN(t) + (ep ? '-' + Date.now() : ''), cli: dep.cli });
  return Object.assign({}, tomTat, r);
}

function bat(dep) {
  if (process.env.QC_BAN_TIN_TAT === '1') return;
  let dang = false, da = {};
  try { da = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (_) { /* chưa có */ }
  const thu1 = async () => {
    if (dang) return;
    const t = Date.now(), h = new Date(t + LECH).getUTCHours(), ngay = ngayVN(t);
    const buoi = ['sang', 'toi'].find((b) => h >= GIO[b] && h < GIO[b] + KHUNG[b] && da[b] !== ngay);
    if (!buoi) return;
    dang = true;
    try {
      const r = await chay(dep, { buoi, t });
      if (r.ok) {
        da[buoi] = ngay;
        try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(da)); } catch (_) { /* ổ tạm */ }
      }
      console.log('[BẢN TIN QC]', buoi, r.ok ? 'đã gửi · chi ' + r.chi + ' · ' + r.chuyenDoi + ' CĐ' : 'LỖI ' + r.loi);
    } catch (e) { console.error('[BẢN TIN QC]', e.message); } finally { dang = false; }
  };
  setTimeout(thu1, 2 * 60 * 1000);
  setInterval(thu1, 10 * 60 * 1000).unref();
}

module.exports = { bat, chay, dung };
