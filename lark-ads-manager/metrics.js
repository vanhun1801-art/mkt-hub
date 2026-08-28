'use strict';
/**
 * Tính toàn bộ chỉ số từ dữ liệu thô của bảng "Hiệu suất theo ngày".
 *
 * Nguyên tắc: một hàm `agg()` duy nhất định nghĩa mọi chỉ số phái sinh
 * (CTR/CPC/CPM/CPA/CVR/ROAS) để mọi bảng, biểu đồ, cảnh báo dùng chung một
 * định nghĩa — không có chỗ nào tự tính lại.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const store = require('./store');

/* ---------------- mục tiêu / ngưỡng ---------------- */
const DEFAULT_TARGETS = {
  cpa: { default: 25000, Facebook: 22000, TikTok: 25000, 'Google Ads': 30000 },
  ctrMin: 1.0,            // % — dưới ngưỡng này coi là creative yếu
  cvrMin: 0.5,            // % click → chuyển đổi
  minSpendJudge: 300000,  // đ — dưới mức này chưa đủ dữ liệu để kết luận
  budgetWarnPct: 80,      // % ngân sách → cảnh báo cam
  dataLagDays: 1,         // cho phép trễ nhập liệu bao nhiêu ngày
  spendSpikePct: 50,      // % tăng chi tiêu so với trung bình 7 ngày → cảnh báo
};

const targetsPath = path.join(__dirname, cfg.targetsFile);

function readTargets() {
  try {
    const raw = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
    return { ...DEFAULT_TARGETS, ...raw, cpa: { ...DEFAULT_TARGETS.cpa, ...(raw.cpa || {}) } };
  } catch (_) {
    return { ...DEFAULT_TARGETS, cpa: { ...DEFAULT_TARGETS.cpa } };
  }
}

function writeTargets(next) {
  const cur = readTargets();
  const merged = { ...cur, ...next, cpa: { ...cur.cpa, ...(next.cpa || {}) } };
  fs.writeFileSync(targetsPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

const cpaTarget = (t, platform) => Number(t.cpa[platform] || t.cpa.default) || 0;

/* ---------------- gộp số ---------------- */
const div = (a, b) => (b > 0 ? a / b : 0);
const r2 = (n) => Math.round(n * 100) / 100;

/** Gộp một tập dòng ngày thành một bộ chỉ số đầy đủ. */
function agg(rows, revenue = 0) {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const conversions = rows.reduce((s, r) => s + r.conversions, 0);
  return {
    rows: rows.length,
    spend, impressions, clicks, conversions, revenue,
    ctr: r2(div(clicks, impressions) * 100),
    cvr: r2(div(conversions, clicks) * 100),
    cpc: Math.round(div(spend, clicks)),
    cpm: Math.round(div(spend, impressions) * 1000),
    cpa: Math.round(div(spend, conversions)),
    roas: r2(div(revenue, spend)),
  };
}

const EMPTY = agg([]);

/** Chênh lệch % giữa kỳ này và kỳ trước, cho từng chỉ số. */
function delta(cur, prev) {
  const out = {};
  Object.keys(cur).forEach((k) => {
    if (typeof cur[k] !== 'number') return;
    const p = Number(prev[k] || 0);
    out[k] = p > 0 ? r2(((cur[k] - p) / p) * 100) : (cur[k] > 0 ? null : 0);
  });
  return out;
}

/* ---------------- lọc ---------------- */
function normRange(data, q = {}) {
  const today = store.todayKey();
  let to = q.to || data.maxDate || today;
  let from = q.from;
  if (!from) {
    const days = Number(q.days || 7);
    from = store.addDays(to, -(days - 1));
  }
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

function filterDaily(data, q = {}) {
  const { from, to } = normRange(data, q);
  const plats = q.platforms && q.platforms.length ? new Set(q.platforms) : null;
  const camps = q.campaignIds && q.campaignIds.length ? new Set(q.campaignIds) : null;
  const groups = q.groupIds && q.groupIds.length ? new Set(q.groupIds) : null;
  const ads = q.adIds && q.adIds.length ? new Set(q.adIds) : null;
  const rows = data.daily.filter((d) => {
    if (!d.date || d.date < from || d.date > to) return false;
    if (plats && !plats.has(d.platform)) return false;
    if (camps && !camps.has(d.campaignId)) return false;
    if (groups && !groups.has(d.groupId)) return false;
    if (ads && !ads.has(d.adId)) return false;
    return true;
  });
  return { from, to, rows };
}

function salesIn(data, from, to, platforms) {
  const plats = platforms && platforms.length ? new Set(platforms) : null;
  return data.sales.filter((s) => s.date >= from && s.date <= to &&
    s.status === 'Đã chốt' && (!plats || plats.has(s.channel)));
}
const revenueOf = (sales) => sales.reduce((s, x) => s + x.revenue, 0);

/* ---------------- nhóm theo chiều ---------------- */
function groupBy(rows, keyFn) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  return m;
}

/** Chuỗi theo từng ngày trong khoảng, kể cả ngày trống. */
function dailySeries(rows, from, to, sales) {
  const byDate = groupBy(rows, (r) => r.date);
  const revByDate = groupBy(sales || [], (s) => s.date);
  const out = [];
  const n = store.daysBetween(from, to);
  for (let i = 0; i <= n; i++) {
    const d = store.addDays(from, i);
    const rs = byDate.get(d) || [];
    const rev = revenueOf(revByDate.get(d) || []);
    out.push({ date: d, ...agg(rs, rev), missing: rs.length === 0 });
  }
  return out;
}

/* ---------------- báo cáo tổng quan ---------------- */
function overview(data, q = {}) {
  const t = readTargets();
  const { from, to, rows } = filterDaily(data, q);
  const span = store.daysBetween(from, to) + 1;
  const prevTo = store.addDays(from, -1);
  const prevFrom = store.addDays(prevTo, -(span - 1));
  const prevRows = filterDaily(data, { ...q, from: prevFrom, to: prevTo }).rows;

  const sales = salesIn(data, from, to, q.platforms);
  const prevSales = salesIn(data, prevFrom, prevTo, q.platforms);

  const cur = agg(rows, revenueOf(sales));
  const prev = agg(prevRows, revenueOf(prevSales));

  const series = dailySeries(rows, from, to, sales);

  // chi tiêu theo ngày × nền tảng (cho biểu đồ cột xếp lớp)
  const platformKeys = [...new Set(data.daily.map((d) => d.platform))].sort();
  const stack = series.map((s) => {
    const cell = { date: s.date };
    platformKeys.forEach((p) => { cell[p] = 0; });
    return cell;
  });
  const idx = Object.fromEntries(series.map((s, i) => [s.date, i]));
  rows.forEach((r) => {
    const i = idx[r.date];
    if (i != null) stack[i][r.platform] += r.spend;
  });

  const byPlatform = [...groupBy(rows, (r) => r.platform)].map(([platform, rs]) => {
    const rev = revenueOf(sales.filter((s) => s.channel === platform));
    const m = agg(rs, rev);
    return {
      platform, ...m,
      shareSpend: r2(div(m.spend, cur.spend) * 100),
      shareConv: r2(div(m.conversions, cur.conversions) * 100),
      cpaTarget: cpaTarget(t, platform),
      cpaVsTarget: cpaTarget(t, platform) > 0 && m.conversions > 0
        ? r2((m.cpa / cpaTarget(t, platform) - 1) * 100) : null,
    };
  }).sort((a, b) => b.spend - a.spend);

  const byCampaign = campaignRows(data, rows, prevRows, t, from, to);
  const ads = adRows(data, rows, prevRows, t);

  return {
    range: { from, to, days: span, prevFrom, prevTo },
    kpi: cur,
    prev,
    delta: delta(cur, prev),
    series,
    stack,
    platformKeys,
    byPlatform,
    byCampaign,
    topAds: ads.filter((a) => a.conversions > 0 && a.spend >= t.minSpendJudge)
      .sort((a, b) => a.cpa - b.cpa).slice(0, 8),
    worstAds: ads.filter((a) => a.spend >= t.minSpendJudge && (a.actionLevel === 'bad' || a.actionLevel === 'warn'))
      .sort((a, b) => (b.conversions === 0 ? Infinity : b.cpa) - (a.conversions === 0 ? Infinity : a.cpa))
      .slice(0, 8),
    alerts: alerts(data, t),
    targets: t,
  };
}

/* ---------------- theo chiến dịch ---------------- */
function campaignRows(data, rows, prevRows, t, from, to) {
  const cur = groupBy(rows, (r) => r.campaignId);
  const prv = groupBy(prevRows, (r) => r.campaignId);
  const todayRows = groupBy(data.daily.filter((d) => d.date === store.todayKey()), (r) => r.campaignId);
  const allTime = groupBy(data.daily, (r) => r.campaignId);

  const out = data.campaigns.map((c) => {
    const m = agg(cur.get(c.id) || []);
    const p = agg(prv.get(c.id) || []);
    const life = agg(allTime.get(c.id) || []);
    const today = agg(todayRows.get(c.id) || []);
    const target = cpaTarget(t, c.platform);
    const activeDays = new Set((cur.get(c.id) || []).map((r) => r.date)).size;
    return {
      id: c.id,
      name: c.name,
      platform: c.platform,
      status: c.status,
      objective: c.objective,
      owners: c.owners.map((o) => o.name),
      start: c.start,
      end: c.end,
      budget: c.budget,
      dailyBudget: c.dailyBudget,
      note: c.note,
      products: c.productNames,
      groupCount: data.groups.filter((g) => g.campaignId === c.id).length,
      adCount: data.ads.filter((a) => a.campaignId === c.id).length,
      ...m,
      avgSpendPerDay: activeDays ? Math.round(m.spend / activeDays) : 0,
      lifetimeSpend: life.spend,
      lifetimeConversions: life.conversions,
      lifetimeCpa: life.cpa,
      budgetUsedPct: c.budget > 0 ? r2((life.spend / c.budget) * 100) : null,
      budgetLeft: c.budget > 0 ? c.budget - life.spend : null,
      todaySpend: today.spend,
      dailyBudgetUsedPct: c.dailyBudget > 0 ? r2((today.spend / c.dailyBudget) * 100) : null,
      cpaTarget: target,
      cpaVsTarget: target > 0 && m.conversions > 0 ? r2((m.cpa / target - 1) * 100) : null,
      trend: delta(m, p),
      health: health(m, target, t),
    };
  });
  // chiến dịch không còn trong bảng (dòng mồ côi)
  const orphan = rows.filter((r) => r.orphan);
  if (orphan.length) {
    out.push({
      id: null, name: '(dòng chưa gắn quảng cáo)', platform: '(chưa gán)', status: '—',
      ...agg(orphan), budget: 0, dailyBudget: 0, budgetUsedPct: null, health: { score: 0, label: '⚠️ Thiếu liên kết' },
      owners: [], products: [], groupCount: 0, adCount: 0, trend: {},
    });
  }
  return out.sort((a, b) => b.spend - a.spend);
}

/* ---------------- theo quảng cáo ---------------- */
function adRows(data, rows, prevRows, t) {
  const cur = groupBy(rows, (r) => r.adId);
  const prv = groupBy(prevRows, (r) => r.adId);
  return data.ads.map((a) => {
    const rs = cur.get(a.id) || [];
    const m = agg(rs);
    const p = agg(prv.get(a.id) || []);
    const target = cpaTarget(t, a.platform);
    const dates = rs.map((r) => r.date).sort();
    return {
      id: a.id,
      name: a.name,
      groupId: a.groupId,
      groupName: a.groupName,
      campaignId: a.campaignId,
      campaignName: a.campaignName,
      platform: a.platform,
      creative: a.creative,
      approval: a.approval,
      url: a.url,
      caption: a.caption,
      hasFile: a.hasFile,
      ...m,
      cpaTarget: target,
      cpaVsTarget: target > 0 && m.conversions > 0 ? r2((m.cpa / target - 1) * 100) : null,
      lastDate: dates[dates.length - 1] || '',
      activeDays: new Set(dates).size,
      trend: delta(m, p),
      ...verdict(m, target, t),
    };
  }).sort((a, b) => b.spend - a.spend);
}

/** Khuyến nghị hành động cho một quảng cáo. */
function verdict(m, target, t) {
  if (m.spend <= 0) return { action: 'Không chi tiêu', actionLevel: 'idle', reason: 'Không có chi tiêu trong kỳ' };
  if (m.spend < t.minSpendJudge) {
    return { action: 'Chưa đủ dữ liệu', actionLevel: 'idle',
      reason: `Chi tiêu ${fmtVnd(m.spend)} < ngưỡng đánh giá ${fmtVnd(t.minSpendJudge)}` };
  }
  if (m.conversions === 0) {
    return { action: 'Tắt / xem lại', actionLevel: 'bad',
      reason: `Đã chi ${fmtVnd(m.spend)} nhưng 0 chuyển đổi` };
  }
  if (!target) return { action: 'Theo dõi', actionLevel: 'warn', reason: 'Chưa đặt CPA mục tiêu cho nền tảng này' };
  const ratio = m.cpa / target;
  if (ratio <= 0.8) return { action: 'Tăng ngân sách', actionLevel: 'great',
    reason: `CPA ${fmtVnd(m.cpa)} thấp hơn mục tiêu ${Math.round((1 - ratio) * 100)}%` };
  if (ratio <= 1) return { action: 'Giữ nguyên', actionLevel: 'good',
    reason: `CPA ${fmtVnd(m.cpa)} trong mục tiêu ${fmtVnd(target)}` };
  if (ratio <= 1.3) return { action: 'Tối ưu', actionLevel: 'warn',
    reason: `CPA ${fmtVnd(m.cpa)} vượt mục tiêu ${Math.round((ratio - 1) * 100)}%` };
  return { action: 'Tắt / xem lại', actionLevel: 'bad',
    reason: `CPA ${fmtVnd(m.cpa)} vượt mục tiêu ${Math.round((ratio - 1) * 100)}%` };
}

/** Điểm sức khoẻ 0–100 của một chiến dịch trong kỳ. */
function health(m, target, t) {
  if (m.spend <= 0) return { score: null, label: '— Không chạy' };
  let score = 100;
  if (target > 0 && m.conversions > 0) score -= Math.min(60, Math.max(0, (m.cpa / target - 1) * 100));
  if (m.conversions === 0) score -= 60;
  if (m.ctr < t.ctrMin) score -= Math.min(20, (t.ctrMin - m.ctr) * 20);
  if (m.cvr < t.cvrMin && m.clicks > 0) score -= 10;
  score = Math.max(0, Math.round(score));
  const label = score >= 80 ? '🟢 Tốt' : score >= 60 ? '🟡 Cần theo dõi' : score >= 40 ? '🟠 Cần tối ưu' : '🔴 Kém';
  return { score, label };
}

const fmtVnd = (n) => Math.round(n).toLocaleString('vi-VN') + 'đ';

/* ---------------- cảnh báo ---------------- */
function alerts(data, t = readTargets()) {
  const out = [];
  const today = store.todayKey();
  const push = (level, kind, title, detail, ref) => out.push({ level, kind, title, detail, ref });

  const lifetime = groupBy(data.daily, (r) => r.campaignId);
  const todayByCampaign = groupBy(data.daily.filter((d) => d.date === today), (r) => r.campaignId);

  data.campaigns.forEach((c) => {
    const life = agg(lifetime.get(c.id) || []);
    const tod = agg(todayByCampaign.get(c.id) || []);

    if (c.budget > 0) {
      const pct = (life.spend / c.budget) * 100;
      if (pct >= 100) {
        push('high', 'budget', `Vượt ngân sách: ${c.name}`,
          `Đã chi ${fmtVnd(life.spend)} / ${fmtVnd(c.budget)} (${r2(pct)}%)`, { type: 'campaign', id: c.id });
      } else if (pct >= t.budgetWarnPct) {
        push('mid', 'budget', `Sắp hết ngân sách: ${c.name}`,
          `Đã chi ${fmtVnd(life.spend)} / ${fmtVnd(c.budget)} (${r2(pct)}%)`, { type: 'campaign', id: c.id });
      }
    } else if (c.status === 'Đang chạy') {
      push('low', 'budget', `Chưa đặt ngân sách: ${c.name}`, 'Chiến dịch đang chạy nhưng không có ngân sách dự kiến', { type: 'campaign', id: c.id });
    }

    if (c.dailyBudget > 0 && tod.spend > c.dailyBudget) {
      push('high', 'budget-day', `Vượt ngân sách ngày: ${c.name}`,
        `Hôm nay đã chi ${fmtVnd(tod.spend)} / ${fmtVnd(c.dailyBudget)}`, { type: 'campaign', id: c.id });
    }

    if (c.status === 'Đang chạy' && c.end && c.end < today) {
      push('mid', 'schedule', `Quá ngày kết thúc: ${c.name}`,
        `Ngày kết thúc ${c.end} nhưng trạng thái vẫn "Đang chạy"`, { type: 'campaign', id: c.id });
    }
    if (c.status === 'Đang chạy' && c.start && c.start > today) {
      push('low', 'schedule', `Chưa tới ngày bắt đầu: ${c.name}`,
        `Bắt đầu ${c.start} nhưng đã ở trạng thái "Đang chạy"`, { type: 'campaign', id: c.id });
    }
  });

  // thiếu dữ liệu: quảng cáo đang chạy nhưng chưa nhập số cho hôm qua
  const deadline = store.addDays(today, -t.dataLagDays);
  const lastByAd = new Map();
  data.daily.forEach((d) => {
    if (!d.adId) return;
    const cur = lastByAd.get(d.adId);
    if (!cur || d.date > cur) lastByAd.set(d.adId, d.date);
  });
  data.ads.forEach((a) => {
    const active = a.campaignStatus === 'Đang chạy' && a.groupStatus !== 'Kết thúc' && a.approval !== 'Tạm dừng';
    if (!active) return;
    const last = lastByAd.get(a.id);
    if (!last) {
      push('mid', 'data', `Chưa có dữ liệu: ${a.name}`, `Quảng cáo thuộc "${a.campaignName}" chưa có dòng hiệu suất nào`, { type: 'ad', id: a.id });
    } else if (last < deadline) {
      push('mid', 'data', `Thiếu số liệu: ${a.name}`,
        `Dữ liệu mới nhất ${last} — trễ ${store.daysBetween(last, today)} ngày`, { type: 'ad', id: a.id });
    }
  });

  // nhập trùng: cùng một quảng cáo, cùng một ngày, hai dòng — tổng đang cộng cả hai
  const trung = [...groupBy(data.daily.filter((d) => d.adId), (r) => r.adId + '|' + r.date)]
    .filter(([, rs]) => rs.length > 1);
  trung.forEach(([, rs]) => {
    push('mid', 'data', `Nhập trùng: ${rs[0].adName}`,
      `Ngày ${rs[0].date} có ${rs.length} dòng (${rs.map((r) => fmtVnd(r.spend)).join(' + ')}) — số đang bị cộng dồn cả hai`,
      { type: 'daily-dup', id: rs[0].id });
  });

  // dòng chưa gắn quảng cáo
  const orphan = data.daily.filter((d) => d.orphan);
  if (orphan.length) {
    push('mid', 'data', `${orphan.length} dòng chưa gắn quảng cáo`,
      `Tổng ${fmtVnd(orphan.reduce((s, r) => s + r.spend, 0))} không vào được chiến dịch nào (ngày: ${[...new Set(orphan.map((o) => o.date))].join(', ')})`,
      { type: 'daily-orphan' });
  }

  // hiệu suất 7 ngày gần nhất
  const to = data.maxDate;
  const from = store.addDays(to, -6);
  const win = data.daily.filter((d) => d.date >= from && d.date <= to);
  const byAd = groupBy(win, (r) => r.adId);
  data.ads.forEach((a) => {
    const m = agg(byAd.get(a.id) || []);
    if (m.spend < t.minSpendJudge) return;
    const target = cpaTarget(t, a.platform);
    if (m.conversions === 0) {
      push('high', 'perf', `Không ra chuyển đổi: ${a.name}`,
        `7 ngày (${from}→${to}) chi ${fmtVnd(m.spend)}, 0 chuyển đổi`, { type: 'ad', id: a.id });
    } else if (target > 0 && m.cpa > target * 1.3) {
      push('mid', 'perf', `CPA cao: ${a.name}`,
        `CPA 7 ngày ${fmtVnd(m.cpa)} vs mục tiêu ${fmtVnd(target)} (+${Math.round((m.cpa / target - 1) * 100)}%)`, { type: 'ad', id: a.id });
    }
    if (m.ctr < t.ctrMin && m.impressions > 1000) {
      push('low', 'perf', `CTR thấp: ${a.name}`,
        `CTR ${m.ctr}% < ngưỡng ${t.ctrMin}% (${m.impressions.toLocaleString('vi-VN')} hiển thị)`, { type: 'ad', id: a.id });
    }
  });

  // quảng cáo có chi tiêu nhưng chưa được duyệt
  data.ads.forEach((a) => {
    const m = agg((byAd.get(a.id) || []));
    if (m.spend > 0 && (a.approval === 'Chờ duyệt' || a.approval === 'Bị từ chối' || a.approval === 'Tạm dừng')) {
      push('low', 'meta', `Trạng thái duyệt lệch: ${a.name}`,
        `Trạng thái "${a.approval}" nhưng vẫn phát sinh chi tiêu ${fmtVnd(m.spend)} trong 7 ngày`, { type: 'ad', id: a.id });
    }
  });

  // biến động chi tiêu toàn tài khoản
  const lastDay = agg(data.daily.filter((d) => d.date === to));
  const prev7 = data.daily.filter((d) => d.date >= store.addDays(to, -7) && d.date < to);
  const avg = prev7.length ? agg(prev7).spend / new Set(prev7.map((d) => d.date)).size : 0;
  if (avg > 0 && lastDay.spend > avg * (1 + t.spendSpikePct / 100)) {
    push('mid', 'spike', 'Chi tiêu tăng đột biến',
      `Ngày ${to} chi ${fmtVnd(lastDay.spend)} vs trung bình 7 ngày ${fmtVnd(avg)} (+${Math.round((lastDay.spend / avg - 1) * 100)}%)`, { type: 'day', id: to });
  }

  const order = { high: 0, mid: 1, low: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/* ---------------- bảng chi tiết theo ngày ---------------- */
function dailyTable(data, q = {}) {
  const { from, to, rows } = filterDaily(data, q);
  return {
    from, to,
    rows: rows.slice().sort((a, b) => (a.date === b.date ? a.adName.localeCompare(b.adName) : b.date.localeCompare(a.date)))
      .map((r) => ({
        id: r.id, date: r.date, adId: r.adId, adName: r.adName,
        groupName: r.groupName, campaignName: r.campaignName, platform: r.platform,
        spend: r.spend, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions,
        label: r.label, orphan: r.orphan, source: r.source,
        ...agg([r]),
      })),
  };
}

/* ---------------- ma trận nhập liệu ---------------- */
/** Bảng nhập nhanh: mỗi quảng cáo đang hoạt động × 1 ngày. */
function entryMatrix(data, dateKey) {
  const date = dateKey || store.todayKey();
  const prevDate = store.addDays(date, -1);
  const existing = new Map();
  data.daily.filter((d) => d.date === date && d.adId).forEach((d) => {
    if (!existing.has(d.adId)) existing.set(d.adId, []);
    existing.get(d.adId).push(d);
  });
  const prevByAd = groupBy(data.daily.filter((d) => d.date === prevDate && d.adId), (d) => d.adId);
  const rows = data.ads.map((a) => {
    const recs = existing.get(a.id) || [];
    const m = agg(recs);
    const pm = agg(prevByAd.get(a.id) || []);
    return {
      prev: { spend: pm.spend, impressions: pm.impressions, clicks: pm.clicks, conversions: pm.conversions, cpa: pm.cpa },
      adId: a.id, adName: a.name, groupName: a.groupName, campaignName: a.campaignName,
      platform: a.platform, approval: a.approval,
      active: a.campaignStatus === 'Đang chạy' && a.groupStatus !== 'Kết thúc',
      recordIds: recs.map((r) => r.id),
      duplicated: recs.length > 1,
      filled: recs.length > 0,
      spend: m.spend, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
      label: recs[0] ? recs[0].label : '',
    };
  });
  rows.sort((a, b) => (b.active - a.active) ||
    a.campaignName.localeCompare(b.campaignName) || a.adName.localeCompare(b.adName));
  return {
    date, prevDate, rows,
    filled: rows.filter((r) => r.filled).length,
    total: rows.filter((r) => r.active).length,
  };
}

module.exports = {
  agg, EMPTY, delta, filterDaily, normRange, dailySeries, groupBy,
  overview, campaignRows, adRows, alerts, dailyTable, entryMatrix,
  readTargets, writeTargets, cpaTarget, verdict, health, fmtVnd,
};
