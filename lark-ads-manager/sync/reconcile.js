'use strict';
/**
 * Đối chiếu dữ liệu từ nền tảng vào Lark Base.
 *
 * Nguyên tắc thiết kế quan trọng nhất: **không tạo bừa**.
 * Base đã có 6 chiến dịch / 7 nhóm / 13 quảng cáo do anh khai tay. Lần đồng bộ đầu
 * phải GẮN vào đúng bản ghi cũ chứ không được nhân đôi. Vì vậy thứ tự khớp là:
 *   1. Khớp theo ID nền tảng đã lưu (cột ⚙️ ID …) — chắc chắn nhất.
 *   2. Khớp theo TÊN, nhưng có giới hạn phạm vi và chỉ nhận khi DUY NHẤT:
 *      chiến dịch khớp trong cùng nền tảng, nhóm khớp trong cùng chiến dịch,
 *      quảng cáo khớp trong cùng chiến dịch. Base này có tên trùng thật
 *      (2 chiến dịch "Daily_Tour Đảo", 2 quảng cáo "IS_Giá chưa tới 1 củ") nên
 *      khớp tên toàn cục là sẽ cộng sai.
 *   3. Còn lại: báo ra để anh ghép tay, hoặc tạo mới nếu bật `tuTaoMoi`.
 * Khớp được theo tên thì ghi luôn ID nền tảng vào Base để lần sau khớp theo ID.
 */
const cfg = require('../config');
const lark = require('../lark');
const store = require('../store');

const T = cfg.tables;

const norm = (s) => String(s == null ? '' : s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ')
  .trim();

/** Gom nhiều khoá về 1 map: khoá → [bản ghi]. */
function indexBy(list, keyFn) {
  const m = new Map();
  list.forEach((x) => {
    const k = keyFn(x);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  });
  return m;
}
/** Chỉ nhận khi khớp duy nhất — 2 ứng viên trở lên là mơ hồ, không đoán. */
const uniqueOf = (arr) => (arr && arr.length === 1 ? arr[0] : null);

/**
 * @param {object} data   store.get()
 * @param {Array}  rows   dòng chuẩn hoá từ adapter
 * @param {object} opts   { tuTaoMoi, ghiDeNhapTay, source, dryRun }
 */
async function reconcile(data, rows, opts = {}) {
  const { tuTaoMoi = false, ghiDeNhapTay = true, source = 'CSV', dryRun = false } = opts;

  const log = [];
  const say = (m) => log.push(m);

  /* ---------- 1. chỉ mục bản ghi hiện có ---------- */
  const cByExt = indexBy(data.campaigns, (c) => c.extId);
  const gByExt = indexBy(data.groups, (g) => g.extId);
  const aByExt = indexBy(data.ads, (a) => a.extId);
  const cByName = indexBy(data.campaigns, (c) => c.platform + '||' + norm(c.name));
  const gByName = indexBy(data.groups, (g) => (g.campaignId || '') + '||' + norm(g.name));
  const aByName = indexBy(data.ads, (a) => (a.campaignId || '') + '||' + norm(a.name));
  const aByNameInGroup = indexBy(data.ads, (a) => (a.groupId || '') + '||' + norm(a.name));

  /* ---------- 2. tách các thực thể duy nhất trong dữ liệu vào ---------- */
  const campaigns = new Map();  // extId||name → {platform, extId, name}
  const groups = new Map();
  const ads = new Map();
  const keyOf = (extId, name) => (extId ? 'id:' + extId : 'nm:' + norm(name));

  rows.forEach((r) => {
    const ck = r.platform + '|' + keyOf(r.campaignExtId, r.campaignName);
    if (!campaigns.has(ck)) campaigns.set(ck, { platform: r.platform, extId: r.campaignExtId, name: r.campaignName });
    const gk = ck + '|' + keyOf(r.groupExtId, r.groupName);
    if (!groups.has(gk)) groups.set(gk, { platform: r.platform, extId: r.groupExtId, name: r.groupName, ck });
    const ak = gk + '|' + keyOf(r.adExtId, r.adName);
    if (!ads.has(ak)) ads.set(ak, { platform: r.platform, extId: r.adExtId, name: r.adName, ck, gk });
    r._ck = ck; r._gk = gk; r._ak = ak;
  });

  /* ---------- 3. giải quyết chiến dịch ---------- */
  const resolved = { campaign: new Map(), group: new Map(), ad: new Map() };
  const attach = [];          // ghi ID nền tảng vào bản ghi khớp theo tên
  const create = { campaign: [], group: [], ad: [] };
  const unmatched = { campaign: [], group: [], ad: [] };

  for (const [ck, c] of campaigns) {
    let rec = uniqueOf(cByExt.get(c.extId));
    let how = rec ? 'id' : null;
    if (!rec && c.name) {
      rec = uniqueOf(cByName.get(c.platform + '||' + norm(c.name)));
      if (rec) how = 'ten';
    }
    if (rec) {
      resolved.campaign.set(ck, { rec, how });
      if (how === 'ten' && c.extId && rec.extId !== c.extId) {
        attach.push({ table: T.campaign.id, field: T.campaign.f.extId, recordId: rec.id, extId: c.extId, label: `Chiến dịch "${rec.name}"` });
      }
    } else if (tuTaoMoi) {
      create.campaign.push({ ck, ...c });
      // đánh dấu "sẽ có" để nhóm/quảng cáo con cũng được lên kế hoạch tạo;
      // record_id thật chỉ có sau khi ghi, điền vào ở bước 8b.
      resolved.campaign.set(ck, { pending: true, how: 'moi' });
    } else {
      unmatched.campaign.push({ ck, platform: c.platform, extId: c.extId, name: c.name });
    }
  }

  /* ---------- 4. nhóm ---------- */
  for (const [gk, g] of groups) {
    const parent = resolved.campaign.get(g.ck);
    const parentReady = parent && !parent.pending;
    let rec = uniqueOf(gByExt.get(g.extId));
    let how = rec ? 'id' : null;
    if (!rec && parentReady && g.name) {
      rec = uniqueOf(gByName.get(parent.rec.id + '||' + norm(g.name)));
      if (rec) how = 'ten';
    }
    // Base có nhóm nhưng chỉ 1 nhóm trong chiến dịch đó → gắn vào nhóm duy nhất ấy
    if (!rec && parentReady) {
      const inCampaign = data.groups.filter((x) => x.campaignId === parent.rec.id);
      if (inCampaign.length === 1) { rec = inCampaign[0]; how = 'duy-nhat-trong-cd'; }
    }
    if (rec) {
      resolved.group.set(gk, { rec, how });
      if (how !== 'id' && g.extId && rec.extId !== g.extId) {
        attach.push({ table: T.group.id, field: T.group.f.extId, recordId: rec.id, extId: g.extId, label: `Nhóm "${rec.name}"` });
      }
    } else if (tuTaoMoi && parent) {
      create.group.push({ gk, ...g });
      resolved.group.set(gk, { pending: true, how: 'moi' });
    } else {
      unmatched.group.push({ gk, platform: g.platform, extId: g.extId, name: g.name, coChienDich: !!parent });
    }
  }

  /* ---------- 5. quảng cáo ---------- */
  for (const [ak, a] of ads) {
    const parentG = resolved.group.get(a.gk);
    const parentC = resolved.campaign.get(a.ck);
    const gReady = parentG && !parentG.pending;
    const cReady = parentC && !parentC.pending;
    let rec = uniqueOf(aByExt.get(a.extId));
    let how = rec ? 'id' : null;
    // hẹp trước rộng sau: trong nhóm → trong chiến dịch. Base có tên quảng cáo
    // trùng nhau ở các nhóm khác nhau nên phải thử phạm vi nhóm trước.
    if (!rec && gReady && a.name) {
      rec = uniqueOf(aByNameInGroup.get(parentG.rec.id + '||' + norm(a.name)));
      if (rec) how = 'ten-trong-nhom';
    }
    if (!rec && cReady && a.name) {
      rec = uniqueOf(aByName.get(parentC.rec.id + '||' + norm(a.name)));
      if (rec) how = 'ten';
    }
    if (rec) {
      resolved.ad.set(ak, { rec, how });
      if (how !== 'id' && a.extId && rec.extId !== a.extId) {
        attach.push({ table: T.ad.id, field: T.ad.f.extId, recordId: rec.id, extId: a.extId, label: `Quảng cáo "${rec.name}"` });
      }
    } else if (tuTaoMoi && parentG) {
      create.ad.push({ ak, ...a });
      resolved.ad.set(ak, { pending: true, how: 'moi' });
    } else {
      unmatched.ad.push({
        ak, platform: a.platform, extId: a.extId, name: a.name,
        chienDich: (cReady && parentC.rec.name) || (campaigns.get(a.ck) || {}).name || '',
        nhom: (gReady && parentG.rec.name) || (groups.get(a.gk) || {}).name || '',
        coNhom: !!gReady,
      });
    }
  }

  /* ---------- 5b. chốt an toàn cho việc gắn ID ---------- */
  // Nếu hai thực thể khác nhau của nền tảng lại đòi gắn ID vào CÙNG một bản ghi Base,
  // ghi cả hai thì cái sau đè cái trước và sai âm thầm. Trường hợp đó bỏ hẳn, báo ra.
  const attachByRecord = new Map();
  attach.forEach((a) => {
    if (!attachByRecord.has(a.recordId)) attachByRecord.set(a.recordId, []);
    attachByRecord.get(a.recordId).push(a);
  });
  const attachConflict = [];
  const attachSafe = [];
  for (const [recordId, list] of attachByRecord) {
    const ids = [...new Set(list.map((x) => x.extId))];
    if (ids.length > 1) {
      attachConflict.push({ doiTuong: list[0].label, cacId: ids, ly_do: 'nhiều ID nền tảng cùng đòi gắn vào một bản ghi' });
    } else {
      attachSafe.push(list[0]);
    }
  }
  attach.length = 0;
  attach.push(...attachSafe);

  /* ---------- 6. gộp số theo (quảng cáo × ngày) ---------- */
  // Cấp adgroup hoặc CSV gộp nhiều quảng cáo về 1 bản ghi ⇒ phải CỘNG, không ghi đè
  const bucket = new Map();
  const orphanRows = [];
  rows.forEach((r) => {
    const a = resolved.ad.get(r._ak);
    if (!a || !a.rec) { orphanRows.push(r); return; }
    const k = a.rec.id + '|' + r.date;
    const cur = bucket.get(k) || {
      adRecordId: a.rec.id, adName: a.rec.name, date: r.date, platform: r.platform,
      spend: 0, impressions: 0, clicks: 0, conversions: 0, soDongGoc: 0,
    };
    cur.spend += r.spend; cur.impressions += r.impressions;
    cur.clicks += r.clicks; cur.conversions += r.conversions; cur.soDongGoc++;
    bucket.set(k, cur);
  });

  /* ---------- 7. so với bảng ngày hiện có ---------- */
  const existing = new Map();
  data.daily.forEach((d) => { if (d.adId) existing.set(d.adId + '|' + d.date, d); });

  const toCreate = [];
  const toUpdate = [];
  const skipped = [];
  const unchanged = [];
  const eq = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.5;

  for (const [k, b] of bucket) {
    const cur = existing.get(k);
    if (!cur) {
      const empty = !b.spend && !b.impressions && !b.clicks && !b.conversions;
      if (empty) { skipped.push({ ...b, ly_do: 'nền tảng trả về toàn số 0' }); continue; }
      toCreate.push(b);
      continue;
    }
    if (cur.source === 'Nhập tay' && !ghiDeNhapTay) {
      skipped.push({ ...b, ly_do: 'giữ nguyên dòng nhập tay (tuỳ chọn ghiDeNhapTay=false)', recordId: cur.id });
      continue;
    }
    if (eq(cur.spend, b.spend) && eq(cur.impressions, b.impressions)
      && eq(cur.clicks, b.clicks) && eq(cur.conversions, b.conversions) && cur.source === source) {
      unchanged.push({ ...b, recordId: cur.id });
      continue;
    }
    toUpdate.push({
      ...b, recordId: cur.id,
      truoc: { spend: cur.spend, impressions: cur.impressions, clicks: cur.clicks, conversions: cur.conversions, source: cur.source },
    });
  }

  // dòng trong Base nằm trong khoảng đồng bộ nhưng nền tảng không có
  const range = [...bucket.values()].map((b) => b.date).sort();
  const from = range[0], to = range[range.length - 1];
  const chiCoTrongBase = from ? data.daily.filter((d) =>
    d.adId && d.date >= from && d.date <= to && !bucket.has(d.adId + '|' + d.date)
    && (d.spend || d.conversions)
    && resolvedPlatformOf(d, resolved) // chỉ tính quảng cáo thuộc nền tảng đang đồng bộ
  ).map((d) => ({ recordId: d.id, date: d.date, adName: d.adName, spend: d.spend, source: d.source })) : [];

  // Với chế độ tự tạo + xem trước: thực thể chưa tồn tại nên chưa gắn được dòng nào.
  // Đếm riêng số (quảng cáo mới × ngày) để anh biết sẽ thêm bao nhiêu dòng.
  const dongChoThucTheMoi = new Set(
    orphanRows.filter((r) => { const a = resolved.ad.get(r._ak); return a && a.pending; })
      .map((r) => r._ak + '|' + r.date)
  ).size;

  const report = {
    dryRun,
    source,
    khoang: from ? { from, to } : null,
    dongVao: rows.length,
    khop: {
      chienDich: countHow(resolved.campaign),
      nhom: countHow(resolved.group),
      quangCao: countHow(resolved.ad),
    },
    ganIdMoi: attach.map((a) => ({ doiTuong: a.label, extId: a.extId })),
    xungDotId: attachConflict,
    seTao: {
      chienDich: create.campaign.map((x) => x.name),
      nhom: create.group.map((x) => x.name),
      quangCao: create.ad.map((x) => x.name),
    },
    chuaGhep: { chienDich: unmatched.campaign, nhom: unmatched.group, quangCao: unmatched.ad },
    dongBoQua: orphanRows.length,
    dongChoThucTheMoi: dongChoThucTheMoi,
    bangNgay: {
      taoMoi: toCreate.length,
      capNhat: toUpdate.length,
      khongDoi: unchanged.length,
      boQua: skipped.length,
    },
    chiTiet: {
      taoMoi: toCreate.slice(0, 40),
      capNhat: toUpdate.slice(0, 40),
      boQua: skipped.slice(0, 20),
      chiCoTrongBase: chiCoTrongBase.slice(0, 30),
    },
    soChiCoTrongBase: chiCoTrongBase.length,
    log,
  };

  if (dryRun) return report;

  /* ---------- 8. ghi thật ---------- */
  // 8a. gắn ID nền tảng vào bản ghi khớp theo tên
  const byTable = {};
  attach.forEach((a) => {
    byTable[a.table] = byTable[a.table] || {};
    byTable[a.table][a.recordId] = { [a.field]: a.extId };
  });
  for (const tbl of Object.keys(byTable)) {
    await lark.updateMany(tbl, byTable[tbl]);
    say(`Đã gắn ID nền tảng cho ${Object.keys(byTable[tbl]).length} bản ghi (bảng ${tbl})`);
  }

  // 8b. tạo chiến dịch → nhóm → quảng cáo (theo thứ tự vì có liên kết cha con)
  if (create.campaign.length) {
    const ids = await lark.createMany(T.campaign.id, create.campaign.map((c) => ({
      [T.campaign.f.name]: c.name || '(không tên)',
      [T.campaign.f.platform]: c.platform,
      [T.campaign.f.status]: 'Đang chạy',
      [T.campaign.f.extId]: c.extId || null,
    })));
    create.campaign.forEach((c, i) => {
      if (ids[i]) resolved.campaign.set(c.ck, { rec: { id: ids[i], name: c.name }, how: 'moi' });
    });
    say(`Đã tạo ${ids.length} chiến dịch mới`);
  }
  if (create.group.length) {
    const rows2 = create.group.map((g) => {
      const parent = resolved.campaign.get(g.ck);
      return {
        [T.group.f.name]: g.name || '(không tên)',
        [T.group.f.status]: 'Đang chạy',
        [T.group.f.extId]: g.extId || null,
        [T.group.f.campaign]: parent ? [{ id: parent.rec.id }] : null,
      };
    });
    const ids = await lark.createMany(T.group.id, rows2);
    create.group.forEach((g, i) => {
      if (ids[i]) resolved.group.set(g.gk, { rec: { id: ids[i], name: g.name }, how: 'moi' });
    });
    say(`Đã tạo ${ids.length} nhóm quảng cáo mới`);
  }
  if (create.ad.length) {
    const rows2 = create.ad.map((a) => {
      const parent = resolved.group.get(a.gk);
      return {
        [T.ad.f.name]: a.name || '(không tên)',
        [T.ad.f.approval]: 'Đã duyệt',
        [T.ad.f.extId]: a.extId || null,
        [T.ad.f.group]: parent ? [{ id: parent.rec.id }] : null,
      };
    });
    const ids = await lark.createMany(T.ad.id, rows2);
    create.ad.forEach((a, i) => {
      if (ids[i]) resolved.ad.set(a.ak, { rec: { id: ids[i], name: a.name }, how: 'moi' });
    });
    say(`Đã tạo ${ids.length} quảng cáo mới`);
  }

  // 8c. nếu vừa tạo thực thể mới thì gộp lại số cho các dòng trước đó chưa gắn được
  if (create.ad.length || create.group.length || create.campaign.length) {
    orphanRows.forEach((r) => {
      const a = resolved.ad.get(r._ak);
      if (!a || !a.rec) return;
      const k = a.rec.id + '|' + r.date;
      const cur = bucket.get(k) || {
        adRecordId: a.rec.id, adName: a.rec.name, date: r.date, platform: r.platform,
        spend: 0, impressions: 0, clicks: 0, conversions: 0, soDongGoc: 0,
      };
      cur.spend += r.spend; cur.impressions += r.impressions;
      cur.clicks += r.clicks; cur.conversions += r.conversions; cur.soDongGoc++;
      bucket.set(k, cur);
      if (!existing.has(k) && !toCreate.some((x) => x.adRecordId === cur.adRecordId && x.date === cur.date)) {
        toCreate.push(cur);
      }
    });
  }

  // 8d. ghi bảng ngày — cập nhật lại số đếm vì bước 8c có thể vừa thêm dòng
  report.bangNgay.taoMoi = toCreate.length;
  report.chiTiet.taoMoi = toCreate.slice(0, 40);
  if (toCreate.length) {
    const rows2 = toCreate.map((b) => ({
      [T.daily.f.date]: store.keyToBaseDatetime(b.date),
      [T.daily.f.ad]: [{ id: b.adRecordId }],
      [T.daily.f.spend]: Math.round(b.spend),
      [T.daily.f.impressions]: Math.round(b.impressions),
      [T.daily.f.clicks]: Math.round(b.clicks),
      [T.daily.f.conversions]: Math.round(b.conversions),
      [T.daily.f.source]: source,
    }));
    const ids = await lark.createMany(T.daily.id, rows2);
    say(`Đã tạo ${ids.length} dòng hiệu suất mới`);
  }
  if (toUpdate.length) {
    const map = {};
    toUpdate.forEach((b) => {
      map[b.recordId] = {
        [T.daily.f.spend]: Math.round(b.spend),
        [T.daily.f.impressions]: Math.round(b.impressions),
        [T.daily.f.clicks]: Math.round(b.clicks),
        [T.daily.f.conversions]: Math.round(b.conversions),
        [T.daily.f.source]: source,
      };
    });
    const n = await lark.updateMany(T.daily.id, map);
    say(`Đã cập nhật ${n} dòng hiệu suất`);
  }

  store.invalidate();
  report.log = log;
  report.daGhi = true;
  return report;
}

/** Chỉ đếm dòng Base thuộc nền tảng đang đồng bộ (tránh báo nhầm kênh khác). */
function resolvedPlatformOf(dailyRow, resolved) {
  for (const v of resolved.ad.values()) if (v.rec && v.rec.id === dailyRow.adId) return true;
  return false;
}

function countHow(map) {
  const out = { tong: map.size, theoId: 0, theoTen: 0, seTao: 0 };
  for (const v of map.values()) {
    if (v.how === 'id') out.theoId++;
    else if (v.how === 'moi') out.seTao = (out.seTao || 0) + 1;
    else out.theoTen++;   // ten | ten-trong-nhom | duy-nhat-trong-cd
  }
  return out;
}

module.exports = { reconcile, norm };
