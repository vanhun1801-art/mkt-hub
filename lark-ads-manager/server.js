'use strict';
/**
 * Server HTTP thuần Node (không dependency) cho app quản lý quảng cáo.
 * Mọi ghi đều đi thẳng vào Lark Base qua lark-cli; sau khi ghi thì xoá cache
 * để lần đọc kế tiếp lấy số mới.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
// cli: dùng phiên lark-cli của máy · api: gọi thẳng Open API bằng app credentials
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');
const store = require('./store');
const M = require('./metrics');
const ketnoi = require('./sync/ketnoi');
const sync = require('./sync');
const live = require('./sync/live');
const giamSat = require('./giam-sat');
const metaAds = require('./sync/meta');
const gads = require('./sync/gads');
const pancake = require('./sync/pancake');
const pancakePos = require('./sync/pancakepos');
const tourwell = require('./sync/tourwell');
const tourwellApi = require('./sync/tourwellapi');
const khoRoas = require('./sync/khoroas');
const roasTinh = require('./sync/roas');

const T = cfg.tables;
const PUBLIC = path.join(__dirname, 'public');

/* ---------------- tiện ích HTTP ---------------- */
function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}
const ok = (res, body) => send(res, 200, body);
const fail = (res, code, message, extra = {}) => send(res, code, { error: message, ...extra });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) { reject(new Error('Body quá lớn')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

/**
 * Van tay noi dung cac file tinh, tinh mot lan khi khoi dong.
 *
 * Header no-store mot minh khong du: app nay chay sau proxy cua mkt-hub, va da co
 * lan deploy xong nhung trinh duyet van dung ketnoi.js cu — giao dien cu goi API
 * moi, ra man hinh sai ma khong ai biet vi sao. Gan ?v=<van tay> vao the script
 * thi doi ma la doi URL, khong con cho nao de cache bam vao.
 */
const VAN_TAY = (() => {
  const crypto = require('crypto');
  const h = crypto.createHash('sha1');
  ['app.js', 'ketnoi.js', 'charts.js', 'styles.css'].forEach((f) => {
    try { h.update(fs.readFileSync(path.join(PUBLIC, f))); } catch (_) { h.update(f); }
  });
  return h.digest('hex').slice(0, 10);
})();

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return fail(res, 403, 'Từ chối');
  fs.readFile(file, (err, buf) => {
    if (err) return fail(res, 404, 'Không tìm thấy ' + rel);
    let out = buf;
    if (rel === 'index.html') out = Buffer.from(buf.toString('utf8').split('__V__').join(VAN_TAY), 'utf8');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(out);
  });
}

/* ---------------- tham số truy vấn ---------------- */
function queryOpts(u) {
  const list = (k) => {
    const v = u.searchParams.get(k);
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  };
  return {
    from: u.searchParams.get('from') || undefined,
    to: u.searchParams.get('to') || undefined,
    days: u.searchParams.get('days') || undefined,
    platforms: list('platform'),
    campaignIds: list('campaign'),
    groupIds: list('group'),
    adIds: list('ad'),
  };
}

/* ---------------- chuyển giá trị sang CellValue ---------------- */
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
const textOrNull = (v) => (v == null || v === '' ? null : String(v));
const selOrNull = (v) => (v == null || v === '' ? null : String(v));
const dateOrNull = (v) => (v ? store.keyToBaseDatetime(String(v).slice(0, 10)) : null);

/** Chỉ lấy các khoá được phép sửa, và chuyển đúng kiểu ô. */
function pickFields(body, spec) {
  const out = {};
  Object.entries(spec).forEach(([key, [fieldId, conv]]) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[fieldId] = conv(body[key]);
  });
  return out;
}

/* ---------------- ghi hiệu suất theo ngày ---------------- */
const dailySpec = {
  spend: [T.daily.f.spend, numOrNull],
  impressions: [T.daily.f.impressions, numOrNull],
  clicks: [T.daily.f.clicks, numOrNull],
  conversions: [T.daily.f.conversions, numOrNull],
  label: [T.daily.f.label, textOrNull],
};

/**
 * Nhập/cập nhật số của một ngày cho nhiều quảng cáo.
 * Có dòng cho (quảng cáo × ngày) rồi thì UPDATE, chưa có thì CREATE.
 * Bỏ trắng cả 4 chỉ số ⇒ bỏ qua dòng đó (không tạo bản ghi rỗng).
 */
async function saveEntries(body) {
  const date = String(body.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error('Ngày không hợp lệ (cần YYYY-MM-DD)'), { code: 400 });
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) throw Object.assign(new Error('Không có dòng nào để lưu'), { code: 400 });

  const data = await store.get();
  const existing = new Map();
  data.daily.filter((d) => d.date === date && d.adId).forEach((d) => {
    if (!existing.has(d.adId)) existing.set(d.adId, d);
  });

  const created = [];
  const updated = [];
  const skipped = [];
  const toCreate = [];

  for (const r of rows) {
    if (!r.adId || !data.aMap[r.adId]) { skipped.push({ adId: r.adId, reason: 'Không tìm thấy quảng cáo' }); continue; }
    const vals = pickFields(r, dailySpec);
    const hasNumber = ['spend', 'impressions', 'clicks', 'conversions']
      .some((k) => r[k] !== '' && r[k] != null && Number(r[k]) !== 0);
    const cur = r.recordId ? { id: r.recordId } : existing.get(r.adId);

    if (!cur && !hasNumber) { skipped.push({ adId: r.adId, reason: 'Để trống' }); continue; }
    if (cur) {
      await lark.updateRecord(T.daily.id, cur.id, vals);
      updated.push(cur.id);
    } else {
      toCreate.push({
        [T.daily.f.date]: store.keyToBaseDatetime(date),
        [T.daily.f.ad]: [{ id: r.adId }],
        [T.daily.f.spend]: Number(r.spend || 0),
        [T.daily.f.impressions]: Number(r.impressions || 0),
        [T.daily.f.clicks]: Number(r.clicks || 0),
        [T.daily.f.conversions]: Number(r.conversions || 0),
        [T.daily.f.label]: textOrNull(r.label),
      });
    }
  }
  if (toCreate.length) created.push(...(await lark.createMany(T.daily.id, toCreate)));
  xoaDem();
  return { date, created: created.length, updated: updated.length, skipped };
}


/**
 * Chọn nguồn số cho các endpoint CHỈ ĐỌC.
 *
 * Mặc định: đã nối kênh nào thì lấy TRỰC TIẾP từ nền tảng cho mấy ngày gần đây,
 * lịch sử xa hơn vẫn từ Base. Muốn ép về Base thì thêm ?nguon=base.
 * Ghi thì luôn dùng store.get() vì cần record_id thật của Base.
 */
/** Kết quả chấm sức khoẻ gần nhất do tác vụ nền ghi lại. */
function docSucKhoe() {
  try {
    const t = JSON.parse(fs.readFileSync(giamSat.FILE_TT, 'utf8'));
    return {
      khoe: t.khoe, coLoiNang: t.coLoiNang, luc: t.luc,
      vanDe: t.van_de || [], moiNhat: t.moiNhat || {}, guiLark: t.guiLark || null,
    };
  } catch (_) { return null; }
}

async function dataFor(u) {
  const xin = u.searchParams.get('nguon');
  const muonLive = xin ? xin === 'live' : live.kenhDangBat().length > 0;
  if (!muonLive) {
    const d = await store.get();
    return { ...d, live: { bat: false, nenTang: [], loi: [], layLuc: null } };
  }
  try {
    return await live.duLieu({ soNgay: Number(u.searchParams.get('liveNgay') || 14) });
  } catch (e) {
    // nền tảng hỏng thì vẫn phải xem được số cũ, không để trắng màn hình
    console.error('[live]', e.message);
    const d = await store.get();
    return { ...d, live: { bat: false, nenTang: [], loi: [{ loi: e.message }], layLuc: null } };
  }
}

/**
 * Ghi xong thì phải xoá CẢ HAI lớp đệm.
 *
 * store là đệm đọc Base; live là đệm số lấy thẳng từ nền tảng (TTL 3 phút) và nó
 * ĐÈ LÊN số Base trong 14 ngày gần nhất. Chỉ xoá store thì sửa xong đọc lại vẫn
 * ra số cũ suốt 3 phút — người dùng tưởng app không lưu.
 */
function xoaDem() {
  store.invalidate();
  try { live.xoaCache(); } catch (_) {}
}

/* ---------------- router ---------------- */
async function api(req, res, u) {
  const p = u.pathname;
  const method = req.method;

  if (p === '/api/meta' && method === 'GET') {
    // chế độ api: danh tính do lớp vỏ (Marketing Hub) đăng nhập rồi gửi kèm header
    const [data, me] = await Promise.all([dataFor(u), nguoiDung(req)]);
    return ok(res, {
      me,
      baseUrl: cfg.baseUrl,
      loadedAt: data.loadedAt,
      minDate: data.minDate,
      maxDate: data.maxDate,
      today: store.todayKey(),
      live: data.live || { bat: false },
      kenhTrucTiep: live.kenhDangBat(),
      counts: {
        campaigns: data.campaigns.length, groups: data.groups.length,
        ads: data.ads.length, daily: data.daily.length, sales: data.sales.length,
      },
      platforms: [...new Set(data.campaigns.map((c) => c.platform))].sort(),
      campaigns: data.campaigns.map((c) => ({ id: c.id, name: c.name, platform: c.platform, status: c.status, extId: c.extId })),
      groups: data.groups.map((g) => ({ id: g.id, name: g.name, campaignId: g.campaignId, status: g.status, extId: g.extId })),
      ads: data.ads.map((a) => ({
        id: a.id, name: a.name, groupId: a.groupId, groupName: a.groupName,
        campaignId: a.campaignId, campaignName: a.campaignName, platform: a.platform, approval: a.approval, extId: a.extId,
      })),
      options: {
        campaignStatus: ['Nháp', 'Chờ duyệt', 'Đang chạy', 'Tạm dừng', 'Kết thúc'],
        objective: ['Nhận diện thương hiệu', 'Tương tác', 'Truy cập website', 'Tin nhắn/Lead', 'Chuyển đổi/Đơn hàng'],
        platform: cfg.platforms,
        groupStatus: ['Đang chạy', 'Tạm dừng', 'Kết thúc'],
        adApproval: ['Chờ duyệt', 'Đã duyệt', 'Bị từ chối', 'Tạm dừng'],
        optimize: ['CPC (click)', 'CPM (hiển thị)', 'CPA (chuyển đổi)', 'Tin nhắn/Lead'],
        placement: ['Feed', 'Reels', 'Stories', 'For You (TikTok)', 'Tìm kiếm', 'Khám phá', 'Google tìm kiếm'],
        creative: ['Ảnh đơn', 'Video', 'Carousel', 'Bộ sưu tập'],
      },
      targets: M.readTargets(),
    });
  }

  if (p === '/api/overview' && method === 'GET') {
    const data = await dataFor(u);
    return ok(res, M.overview(data, queryOpts(u)));
  }

  if (p === '/api/campaigns' && method === 'GET') {
    const data = await dataFor(u);
    const q = queryOpts(u);
    const { from, to, rows } = M.filterDaily(data, q);
    const span = store.daysBetween(from, to) + 1;
    const prev = M.filterDaily(data, { ...q, from: store.addDays(from, -span), to: store.addDays(from, -1) }).rows;
    return ok(res, { from, to, rows: M.campaignRows(data, rows, prev, M.readTargets(), from, to) });
  }

  if (p === '/api/ads' && method === 'GET') {
    const data = await dataFor(u);
    const q = queryOpts(u);
    const { from, to, rows } = M.filterDaily(data, q);
    const span = store.daysBetween(from, to) + 1;
    const prev = M.filterDaily(data, { ...q, from: store.addDays(from, -span), to: store.addDays(from, -1) }).rows;
    return ok(res, { from, to, rows: M.adRows(data, rows, prev, M.readTargets()) });
  }

  if (p === '/api/groups' && method === 'GET') {
    const data = await dataFor(u);
    const q = queryOpts(u);
    const { from, to, rows } = M.filterDaily(data, q);
    const byGroup = M.groupBy(rows, (r) => r.groupId);
    const t = M.readTargets();
    return ok(res, {
      from, to,
      rows: data.groups.map((g) => {
        const c = g.campaignId ? data.cMap[g.campaignId] : null;
        const m = M.agg(byGroup.get(g.id) || []);
        const target = M.cpaTarget(t, c ? c.platform : '');
        return {
          id: g.id, name: g.name, campaignId: g.campaignId,
          campaignName: c ? c.name : '(không thuộc chiến dịch)',
          platform: c ? c.platform : '(chưa gán)',
          status: g.status, optimize: g.optimize, placement: g.placement,
          audience: g.audience, budget: g.budget,
          adCount: data.ads.filter((a) => a.groupId === g.id).length,
          ...m, cpaTarget: target,
          cpaVsTarget: target > 0 && m.conversions > 0 ? Math.round((m.cpa / target - 1) * 1000) / 10 : null,
        };
      }).sort((a, b) => b.spend - a.spend),
    });
  }

  if (p === '/api/daily' && method === 'GET') {
    const data = await dataFor(u);
    return ok(res, M.dailyTable(data, queryOpts(u)));
  }

  if (p === '/api/entry' && method === 'GET') {
    const data = await store.get();
    return ok(res, M.entryMatrix(data, u.searchParams.get('date') || undefined));
  }

  if (p === '/api/entry' && method === 'POST') {
    const body = await readBody(req);
    return ok(res, await saveEntries(body));
  }

  if (p === '/api/alerts' && method === 'GET') {
    const data = await dataFor(u);
    return ok(res, { rows: M.alerts(data) });
  }

  if (p === '/api/sales' && method === 'GET') {
    const data = await dataFor(u);
    const q = queryOpts(u);
    const { from, to } = M.normRange(data, q);
    const rows = data.sales.filter((s) => s.date >= from && s.date <= to);
    const byChannel = [...M.groupBy(rows.filter((s) => s.status === 'Đã chốt'), (s) => s.channel)]
      .map(([channel, rs]) => ({ channel, orders: rs.length, revenue: rs.reduce((a, b) => a + b.revenue, 0) }));
    const ad = M.filterDaily(data, q).rows;
    const spendByChannel = Object.fromEntries([...M.groupBy(ad, (r) => r.platform)]
      .map(([k, rs]) => [k, rs.reduce((a, b) => a + b.spend, 0)]));
    return ok(res, {
      from, to,
      total: rows.length,
      rows: rows.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300),
      byChannel: byChannel.map((c) => ({
        ...c,
        spend: spendByChannel[c.channel] || 0,
        roas: spendByChannel[c.channel] > 0 ? Math.round((c.revenue / spendByChannel[c.channel]) * 100) / 100 : 0,
        cac: c.orders > 0 ? Math.round((spendByChannel[c.channel] || 0) / c.orders) : 0,
      })).sort((a, b) => b.revenue - a.revenue),
    });
  }

  if (p === '/api/targets') {
    if (method === 'GET') return ok(res, M.readTargets());
    if (method === 'PUT') return ok(res, M.writeTargets(await readBody(req)));
  }

  /* ---- kết nối & đồng bộ ---- */
  if (p === '/api/connect' && method === 'GET') {
    return ok(res, {
      ...ketnoi.status(),
      // giao diện cần biết có được phép lấy nội dung ADS_CONNECT_JSON ra hay không
      laQuanLy: laQuanLy(req),
      hengio: sync.schedulerState(),
      dangChay: !!sync.dangChay(),
      sucKhoe: docSucKhoe(),
      nguonBiBo: live.nguonBiBo(),
      lichSu: sync.history.slice(0, 15),
      adapters: sync.ADAPTERS,
    });
  }

  if (p === '/api/connect' && method === 'PUT') {
    const body = await readBody(req);
    const saved = ketnoi.writeOptions(body);
    sync.startScheduler((m) => console.log(m));
    return ok(res, { ...ketnoi.status(), hengio: sync.schedulerState(), dongBo: saved.dongBo });
  }

  if (p === '/api/connect/test' && method === 'POST') {
    return ok(res, { rows: await sync.testAll() });
  }

  /* Điền token/ID ngay trong app. Token chỉ đi VÀO — mọi phản hồi dưới đây đều
   * trả ketnoi.status(), thứ đã che sẵn bí mật. */
  if (p === '/api/connect/secrets' && method === 'PUT') {
    const body = await readBody(req);
    const { daDoi } = ketnoi.writeSecrets(body);

    // Đổi token Meta thì hỏi lại Meta xem token sống tới bao giờ, để thẻ hiện đúng hạn.
    if (daDoi.includes('meta.accessToken')) {
      try { ketnoi.writeMetaTokenInfo(await metaAds.tokenInfo(ketnoi.read().meta)); } catch (_) {}
    }
    // Bật/tắt kênh hay đổi tài khoản thì số đang cache không còn đúng nữa.
    live.xoaCache();
    sync.startScheduler((m) => console.log(m));
    return ok(res, { ...ketnoi.status(), hengio: sync.schedulerState(), daDoi });
  }

  /**
   * Lấy nội dung cho biến môi trường ADS_CONNECT_JSON — CÓ TOKEN THẬT.
   *
   * Đây là ngoại lệ duy nhất của luật "token chỉ đi vào, không đi ra", và nó cần
   * thiết: app cho điền token trong giao diện nhưng ổ đĩa Render là tạm, nên không
   * có đường lấy ra thì token điền qua web mất sau mỗi lần deploy — đã mất ba lần.
   *
   * Khoá bằng vai quản lý. Không ghi ra log.
   */
  if (p === '/api/connect/xuat-env' && method === 'POST') {
    if (!laQuanLy(req)) return fail(res, 403, 'Chỉ vai quản lý mới lấy được nội dung này');
    const r = ketnoi.xuatEnv();
    console.log('[xuat-env] ' + ((await nguoiDung(req)) || {}).name + ' đã lấy nội dung ADS_CONNECT_JSON ('
      + r.noiDung.length + ' ký tự, ' + r.kenh.filter((x) => x.coToken).length + ' kênh có thông tin)');
    return ok(res, r);
  }

  /* ---------------- Pancake (hội thoại · ad_ids) ---------------- */

  /**
   * Lưu cấu hình Pancake. Token chỉ đi VÀO, phản hồi luôn là status() đã che sẵn.
   * Ô token để trống = giữ token cũ (xem writePancake), nên sửa nhãn page không
   * làm mất token.
   */
  if (p === '/api/pancake' && method === 'PUT') {
    const body = await readBody(req);
    let daDoi;
    try { ({ daDoi } = ketnoi.writePancake(body)); }
    catch (e) { return fail(res, e.code || 400, e.message); }
    return ok(res, { ...ketnoi.status(), daDoi });
  }

  /**
   * Dò danh sách page bằng token cấp tài khoản.
   *
   * page_id không hiện rõ ở đâu trong giao diện Pancake, mà khai sai một chữ số là
   * mọi lệnh sau đó trả 401 mà không nói vì sao. Để máy đọc hộ.
   */
  if (p === '/api/pancake/pages' && method === 'POST') {
    const body = await readBody(req);
    // Cho phép dò bằng token vừa dán mà chưa lưu, để người dùng thử trước khi cất.
    const conf = body && body.userToken
      ? { userToken: String(body.userToken).trim() }
      : ketnoi.read().pancake;
    try { return ok(res, { rows: await pancake.danhSachPage(conf) }); }
    catch (e) { return fail(res, 400, e.message); }
  }

  /** Kiểm tra từng page: đọc thử hội thoại, đếm xem có bao nhiêu cái mang ad_ids. */
  if (p === '/api/pancake/test' && method === 'POST') {
    try { return ok(res, await pancake.test(ketnoi.read().pancake)); }
    catch (e) { return fail(res, 400, e.message); }
  }

  /** Tag của page, kèm cờ is_lead_event — để chọn tag nào tính là đơn chốt. */
  if (p === '/api/pancake/tags' && method === 'POST') {
    const body = await readBody(req);
    const conf = ketnoi.read().pancake;
    const page = (conf.pages || []).find((x) => String(x.pageId) === String(body.pageId));
    if (!page) return fail(res, 400, 'Chưa lưu page này');
    try { return ok(res, { rows: await pancake.danhSachTag(page) }); }
    catch (e) { return fail(res, 400, e.message); }
  }

  /**
   * Phép đếm phủ: hội thoại có ad_ids trên các page đã khai, so với số chuyển đổi
   * nền tảng báo trong cùng khoảng. Lệch nhiều nghĩa là quảng cáo đang dẫn tin nhắn
   * về page CHƯA khai — câu hỏi không trả lời được bằng cách nhìn giao diện.
   */
  if (p === '/api/pancake/phu' && method === 'POST') {
    const body = await readBody(req);
    const conf = ketnoi.read().pancake;
    const pages = (conf.pages || []).filter((x) => x.pageId && x.token);
    if (!pages.length) return fail(res, 400, 'Chưa khai page nào');
    // Gio VN, khong phai UTC: o UTC thi truoc 07:00 sang se hoi sai mot ngay.
    const ngayVN = (lui = 0) => new Date(Date.now() + 7 * 3600 * 1000 - lui * 86400 * 1000)
      .toISOString().slice(0, 10);
    const from = body.from || ngayVN(14);
    const to = body.to || ngayVN(0);
    const log = [];
    const theoPage = [];
    let tatCa = [];
    for (const pg of pages) {
      try {
        const r = await pancake.fetchConversations(pg, from, to, (m) => log.push(m));
        tatCa = tatCa.concat(r.rows);
        theoPage.push({
          pageId: pg.pageId, label: pg.label, platform: pg.platform, ok: true,
          hoiThoai: r.rows.length,
          coAd: r.rows.filter((x) => x.adIds.length).length,
          coSdt: r.rows.filter((x) => x.coSdt).length,
        });
      } catch (e) {
        theoPage.push({ pageId: pg.pageId, label: pg.label, ok: false, loi: e.message });
      }
    }
    // Số nền tảng báo, cùng khoảng ngày, để đặt cạnh nhau.
    const d = await store.get();
    const o = M.overview(d, { from, to });
    const theoAd = pancake.theoAdVaNgay(tatCa, { tagChot: conf.tagChot });
    /* Ghép luôn ở đây: tải hội thoại là phần đắt nhất (phân trang 60 dòng, giãn
     * 210ms vì Pancake giới hạn 5 request/giây mỗi page), nên đã tải rồi thì tính
     * hết một lượt, đừng bắt người dùng bấm hai nút mà tải hai lần. */
    const ghep = pancake.ghepVoiChiTieu(theoAd, d, { from, to });
    return ok(res, {
      from, to, theoPage, log,
      tong: {
        hoiThoai: tatCa.length,
        coAd: tatCa.filter((x) => x.adIds.length).length,
        coSdt: tatCa.filter((x) => x.coSdt).length,
      },
      nenTang: o.byPlatform.map((x) => ({ platform: x.platform, chuyenDoi: x.conversions, spend: x.spend })),
      theoAd, ghep,
    });
  }

  /* ---------------- ROAS: nhập bản xuất Tourwell rồi ghi công ---------------- */

  /**
   * Kho tạm cho hai bản xuất Tourwell.
   *
   * Vì sao lưu ra đĩa chứ không giữ trong bộ nhớ: người dùng nhập file một lần rồi
   * đổi khoảng ngày, mở lại tab, tính lại nhiều lượt — bắt nhập lại mỗi lần là
   * không dùng được. Vì sao KHÔNG ghi vào Base: đây là dữ liệu thô của một lần
   * nhập, không phải sổ sách; ghi vào Base là nhân đôi nguồn sự thật.
   *
   * Trên Render ổ đĩa là tạm nên kho này mất sau deploy — giao diện nói rõ điều đó
   * kèm thời điểm nhập, chứ không im lặng trả bảng rỗng.
   */
  const docKho = () => khoRoas.doc();

  if (p === '/api/roas/trang-thai' && method === 'GET') {
    const k = docKho();
    return ok(res, {
      coDuLieu: !!k,
      luc: k ? k.luc : null,
      lead: k && k.lead ? k.lead.tomTat : null,
      don: k && k.don ? k.don.tomTat : null,
      tuApi: !!(k && k.tuApi),
      khoang: (k && k.khoang) || null,
      oDiaTam: !!process.env.RENDER,
    });
  }

  /**
   * Nhập file. Nhận nhiều file một lượt và TỰ nhận dạng file nào là lead, file nào
   * là đơn — theo tên cột chứ không theo tên file, vì tên file người dùng đổi được.
   */
  if (p === '/api/roas/nhap' && method === 'POST') {
    const body = await readBody(req);
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) return fail(res, 400, 'Chưa chọn file nào');

    const cu = docKho() || {};
    const moi = { luc: new Date().toISOString(), lead: cu.lead || null, don: cu.don || null };
    const nhanXet = [];
    for (const f of files) {
      let buf;
      try { buf = Buffer.from(String(f.base64 || ''), 'base64'); }
      catch (_) { return fail(res, 400, `Không đọc được ${f.ten || 'file'}`); }
      if (!buf.length) return fail(res, 400, `${f.ten || 'File'} rỗng`);
      let loai;
      try { loai = tourwell.nhanDang(buf); }
      catch (e) { return fail(res, 400, `${f.ten || 'File'}: ${e.message}`); }
      if (!loai) {
        return fail(res, 400, `${f.ten || 'File'} không phải bản xuất Lead hay Đơn hàng của Tourwell `
          + '(không thấy cột "Mã lead" hay "Mã đơn")');
      }
      try {
        const r = loai === 'lead' ? tourwell.docLead(buf) : tourwell.docDon(buf);
        moi[loai] = { tomTat: tourwell.tomTat(loai, r.rows), rows: r.rows };
        nhanXet.push({ ten: f.ten || '', loai, dong: r.rows.length });
      } catch (e) { return fail(res, 400, `${f.ten || 'File'}: ${e.message}`); }
    }
    khoRoas.ghi(moi);
    return ok(res, {
      nhanXet,
      luc: moi.luc,
      lead: moi.lead ? moi.lead.tomTat : null,
      don: moi.don ? moi.don.tomTat : null,
      oDiaTam: !!process.env.RENDER,
    });
  }

  /** Xoá kho tạm — dùng khi nhập nhầm file. */
  if (p === '/api/roas/xoa' && method === 'POST') {
    khoRoas.xoa();
    return ok(res, { da: true });
  }

  /** Lưu cấu hình Tourwell API. Ô token để trống = giữ token cũ. */
  if (p === '/api/tourwell' && method === 'PUT') {
    const body = await readBody(req);
    try { return ok(res, ketnoi.writeTourwell(body)); }
    catch (e) { return fail(res, 400, e.message); }
  }

  /**
   * Thử kết nối. In ra ĐÚNG những khoá thật sự nhận được, không in theo tài liệu:
   * riêng `Get all order` tài liệu bỏ trống hẳn phần schema, nên chỉ nhìn dữ liệu
   * thật mới biết mình đọc đúng trường hay không.
   */
  if (p === '/api/tourwell/test' && method === 'POST') {
    const body = await readBody(req);
    const conf = ketnoi.read().tourwell;
    const ngayVN = (lui = 0) => new Date(Date.now() + 7 * 3600 * 1000 - lui * 86400 * 1000)
      .toISOString().slice(0, 10);
    try {
      return ok(res, await tourwellApi.test(conf, body.from || ngayVN(14), body.to || ngayVN(0)));
    } catch (e) { return fail(res, 400, e.message); }
  }

  /**
   * Kéo lead + đơn từ Tourwell API vào ĐÚNG cái kho mà bản nhập Excel vẫn ghi.
   * Nhờ vậy phần tính ROAS phía sau không phải biết dữ liệu đến từ đường nào, và
   * bản Excel vẫn dùng được nguyên vẹn làm đường lui khi API trục trặc.
   */
  if (p === '/api/roas/keo-api' && method === 'POST') {
    const body = await readBody(req);
    const conf = ketnoi.read().tourwell;
    if (!conf || !conf.enabled) return fail(res, 400, 'Tourwell API chưa bật');
    const ngayVN = (lui = 0) => new Date(Date.now() + 7 * 3600 * 1000 - lui * 86400 * 1000)
      .toISOString().slice(0, 10);
    const log = [];
    try {
      const r = await tourwellApi.keoVeKho(conf, body.from || ngayVN(60), body.to || ngayVN(0),
        (m) => log.push(m), !!body.laySdt);
      return ok(res, { ...r, log, oDiaTam: !!process.env.RENDER });
    } catch (e) { return fail(res, 400, e.message + (log.length ? ' | ' + log.join(' ') : '')); }
  }

  /**
   * Tính ROAS. Đọc đơn POS và hội thoại Pancake tại chỗ (chúng luôn tươi), ghép với
   * hai bản xuất trong kho.
   */
  if (p === '/api/roas/tinh' && method === 'POST') {
    const body = await readBody(req);
    const kho = docKho();
    if (!kho || !kho.lead || !kho.don) {
      return fail(res, 400, 'Chưa nhập đủ hai bản xuất Tourwell (Danh sách lead và Danh sách đơn hàng)');
    }
    const c = ketnoi.read();
    const ngayVN = (lui = 0) => new Date(Date.now() + 7 * 3600 * 1000 - lui * 86400 * 1000)
      .toISOString().slice(0, 10);
    /* Mặc định lấy đúng khoảng mà bản xuất ĐƠN phủ. Chọn khoảng rộng hơn bản xuất
     * là tự tạo ra "chi tiêu không có doanh thu" một cách giả tạo. */
    const from = body.from || kho.don.tomTat.tu || ngayVN(30);
    const to = body.to || kho.don.tomTat.den || ngayVN(0);
    const cuaSo = Number(body.cuaSo) > 0 ? Number(body.cuaSo) : 60;

    const log = [];
    let posRows = [];
    let htRows = [];
    const loi = [];
    if (c.pancakePos.enabled && pancakePos.danhSachGian(c.pancakePos).some((x) => x.apiKey)) {
      try { posRows = (await pancakePos.fetchOrders(c.pancakePos, from, to, (m) => log.push(m))).rows; }
      catch (e) { loi.push('Pancake POS: ' + e.message); }
    } else if (pancakePos.danhSachGian(c.pancakePos).some((x) => x.apiKey)) {
      /* Trường hợp dễ nhầm nhất: gian có khoá, "Kiểm tra kết nối" báo OK, nhưng ô
       * Bật đọc chưa tích. Không nói rõ thì người dùng tưởng đã đo bằng khoá cứng
       * trong khi ROAS đang rơi hết về khoá số điện thoại. */
      loi.push('Gian hàng POS đã có khoá nhưng ô "Bật đọc Pancake POS" chưa tích — '
        + 'ROAS đang bỏ qua khoá cứng và chỉ ghép theo số điện thoại. Tích ô đó rồi Lưu cấu hình POS.');
    } else loi.push('Pancake POS chưa có khoá gian hàng nào — thiếu hẳn đường khoá cứng');
    for (const pg of (c.pancake.pages || []).filter((x) => x.pageId && x.token)) {
      try {
        const r = await pancake.fetchConversations(pg, from, to, (m) => log.push(m));
        htRows = htRows.concat(r.rows);
      } catch (e) { loi.push(`Pancake ${pg.label || pg.pageId}: ${e.message}`); }
    }

    const d = await store.get();
    const kq = roasTinh.tinh({
      posRows, hoiThoaiRows: htRows,
      leadRows: kho.lead.rows, donRows: kho.don.rows,
      data: d, from, to, cuaSo,
    });
    return ok(res, {
      ...kq,
      log, loi,
      nguon: {
        posDon: posRows.length,
        hoiThoai: htRows.length,
        lead: kho.lead.rows.length,
        don: kho.don.rows.length,
        nhapLuc: kho.luc,
        khoangXuatDon: [kho.don.tomTat.tu, kho.don.tomTat.den],
        khoangXuatLead: [kho.lead.tomTat.tu, kho.lead.tomTat.den],
      },
    });
  }

  /* ---------------- Pancake POS (đơn · ad_id · mã lead Tourwell) ---------------- */

  if (p === '/api/pancake-pos' && method === 'PUT') {
    const body = await readBody(req);
    let daDoi;
    try { ({ daDoi } = ketnoi.writePancakePos(body)); }
    catch (e) { return fail(res, e.code || 400, e.message); }
    return ok(res, { ...ketnoi.status(), daDoi });
  }

  /** Dò shop bằng api_key — shop_id không hiện rõ trong giao diện POS. */
  if (p === '/api/pancake-pos/shops' && method === 'POST') {
    const body = await readBody(req);
    const conf = body && body.apiKey
      ? { apiKey: String(body.apiKey).trim() }
      : ketnoi.read().pancakePos;
    try { return ok(res, { rows: await pancakePos.danhSachShop(conf) }); }
    catch (e) { return fail(res, 400, e.message); }
  }

  if (p === '/api/pancake-pos/test' && method === 'POST') {
    try { return ok(res, await pancakePos.test(ketnoi.read().pancakePos)); }
    catch (e) { return fail(res, 400, e.message); }
  }

  /**
   * Phép ghép chính: đơn POS → (ad_id × ngày) ghép với chi tiêu, và (mã lead → quảng cáo).
   *
   * Bảng thứ hai là thứ dùng để nối với bản xuất Excel của Tourwell — cột "Mã lead"
   * trong file khớp thẳng vào đây, nên ra được doanh thu theo từng quảng cáo mà
   * không cần API key đọc dữ liệu của Tourwell.
   */
  if (p === '/api/pancake-pos/ghep' && method === 'POST') {
    const body = await readBody(req);
    const conf = ketnoi.read().pancakePos;
    const gian = pancakePos.danhSachGian(conf);
    if (!gian.length) return fail(res, 400, 'Chưa khai gian hàng nào');
    const thieu = gian.filter((x) => !x.apiKey).map((x) => x.shopId);
    if (thieu.length) return fail(res, 400, 'Gian chưa có api_key: ' + thieu.join(', '));
    const ngayVN = (lui = 0) => new Date(Date.now() + 7 * 3600 * 1000 - lui * 86400 * 1000)
      .toISOString().slice(0, 10);
    const from = body.from || ngayVN(14);
    const to = body.to || ngayVN(0);
    const log = [];
    let don;
    try { don = await pancakePos.fetchOrders(conf, from, to, (m) => log.push(m)); }
    catch (e) { return fail(res, 400, e.message); }

    const theoAd = pancakePos.theoAdVaNgay(don.rows);
    const d = await store.get();
    /* Dùng lại phép ghép của sync/pancake.js để không viết lại phần phân loại cấp
     * ID và cộng chi tiêu. Nhưng phải TRẢ VỀ ĐÚNG TÊN: đường POS đếm ĐƠN, không
     * đếm hội thoại. Bản đầu nhồi soDon vào ô hoiThoai rồi để giao diện in nhãn
     * "Hội thoại" — bốn cặp cột hiện ra giống hệt nhau, và bảng thành bảng dối. */
    const nenTangCua = new Map();
    (d.ads || []).forEach((a) => { if (a.extId) nenTangCua.set(String(a.extId), a.platform || ''); });

    const ghepTho = pancake.ghepVoiChiTieu(
      { rows: theoAd.rows.map((r) => ({
        adId: r.adId, ngay: r.ngay, platform: nenTangCua.get(String(r.adId)) || '',
        hoiThoai: r.soDon, coSdt: r.sdt.length, chot: r.soLead, soDon: r.soDon,
      })) },
      d, { from, to },
    );
    // Đặt lại tên cho đúng nghĩa của đường POS trước khi trả ra giao diện
    const ghep = {
      ...ghepTho,
      laPOS: true,
      rows: ghepTho.rows.map((r) => ({
        adId: r.adId, ten: r.ten, ghepDuoc: r.ghepDuoc, ngay: r.ngay, platform: r.platform,
        spend: r.spend, cvNenTang: r.cvNenTang,
        soDon: r.hoiThoai,                 // số đơn POS
        soLead: r.chot,                    // số lead Tourwell khác nhau
        soSdt: r.coSdt,                    // số điện thoại khác nhau
        giaMoiDon: r.giaMoiHoiThoai,
        giaMoiLead: r.giaMoiChot,
      })),
    };
    return ok(res, {
      from, to, log,
      tong: {
        don: don.rows.length,
        coAdId: don.rows.filter((x) => x.adId).length,
        coMaLead: don.rows.filter((x) => x.leadId != null).length,
        coTien: don.rows.filter((x) => x.tien > 0).length,
        tienPOS: don.rows.reduce((a, x) => a + x.tien, 0),
      },
      theoAd: { soDong: theoAd.rows.length, khongCoAd: theoAd.khongCoAd,
        khongCoLead: theoAd.khongCoLead, soLeadDuyNhat: theoAd.soLeadDuyNhat },
      ghep,
      leadVeAd: pancakePos.leadVeQuangCao(don.rows),
    });
  }

  /** Dò danh sách tài khoản quảng cáo bằng token vừa lưu — đỡ phải đi tra ID tay. */
  if (p === '/api/connect/tai-khoan' && method === 'POST') {
    const body = await readBody(req);
    const c = ketnoi.read();
    try {
      if (body.provider === 'meta') return ok(res, { rows: await metaAds.danhSachTaiKhoan(c.meta) });
      if (body.provider === 'googleAds') return ok(res, { rows: await gads.danhSachTaiKhoan(c.googleAds) });
    } catch (e) { return fail(res, 400, e.message); }
    return fail(res, 400, 'Chỉ dò được tài khoản của Facebook và Google Ads');
  }

  /**
   * Lấy refresh token Google ngay trong giao diện.
   *
   * Trên máy cá nhân thì `node ket-noi.js --google-api` mở cổng 127.0.0.1 chờ Google
   * gọi về. Chạy trên server chung thì không có cổng nào để chờ, nên đi đường dán tay:
   * mở link → đồng ý → trình duyệt nhảy tới 127.0.0.1 và báo lỗi kết nối → copy nguyên
   * URL trên thanh địa chỉ dán vào đây. Code trong URL còn hiệu lực khoảng 10 phút.
   */
  if (p === '/api/connect/google-oauth' && method === 'POST') {
    const body = await readBody(req);
    const g = ketnoi.read().googleAds;
    if (!g.clientId || !g.clientSecret) return fail(res, 400, 'Lưu OAuth Client ID và Client Secret trước đã');
    const redirect = 'http://127.0.0.1:47123';

    if (body.buoc === 'link') {
      return ok(res, {
        url: 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
          client_id: g.clientId,
          redirect_uri: redirect,
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/adwords',
          access_type: 'offline',
          prompt: 'consent', // bắt Google cấp refresh token cả khi đã đồng ý lần trước
        }).toString(),
        redirect,
      });
    }

    if (body.buoc === 'doi') {
      const dan = String(body.dan || '').trim();
      // Nhận cả URL đầy đủ lẫn mỗi mã code dán trần.
      const m = dan.match(/[?&]code=([^&\s]+)/);
      const code = m ? decodeURIComponent(m[1]) : dan;
      if (!code || /\s/.test(code)) return fail(res, 400, 'Chưa thấy mã code trong chuỗi vừa dán');
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: g.clientId, client_secret: g.clientSecret,
          redirect_uri: redirect, grant_type: 'authorization_code',
        }).toString(),
      });
      const d = await r.json().catch(() => ({}));
      if (!d.refresh_token) {
        return fail(res, 400, 'Google không trả refresh token: '
          + (d.error_description || d.error || 'không rõ')
          + '. Mã code chỉ dùng được một lần và hết hạn sau ~10 phút — bấm lấy link mới rồi làm lại.');
      }
      ketnoi.writeSecrets({ googleAds: { refreshToken: d.refresh_token } });
      live.xoaCache();
      return ok(res, { ...ketnoi.status(), daLay: true });
    }
    return fail(res, 400, 'buoc phải là link hoặc doi');
  }

  if (p === '/api/sync' && method === 'POST') {
    const body = await readBody(req);
    return ok(res, await sync.run({
      providers: body.providers,
      dryRun: !!body.dryRun,
      from: body.from, to: body.to, days: body.days,
      tuTaoMoi: body.tuTaoMoi,
      ghiDeNhapTay: body.ghiDeNhapTay,
    }));
  }

  if (p === '/api/import-csv' && method === 'POST') {
    const body = await readBody(req);
    if (!body.text || String(body.text).trim().length < 10) return fail(res, 400, 'Chưa có nội dung CSV');
    return ok(res, await sync.importCsv(String(body.text), {
      platform: body.platform,
      level: body.level || 'ad',
      dryRun: !!body.dryRun,
      tuTaoMoi: body.tuTaoMoi,
      ghiDeNhapTay: body.ghiDeNhapTay,
    }));
  }

  /** Ghép tay: gắn ID nền tảng vào một bản ghi cụ thể. */
  if (p === '/api/mapping' && method === 'POST') {
    const body = await readBody(req);
    const spec = {
      campaign: [T.campaign.id, T.campaign.f.extId],
      group: [T.group.id, T.group.f.extId],
      ad: [T.ad.id, T.ad.f.extId],
    }[body.type];
    if (!spec) return fail(res, 400, 'type phải là campaign | group | ad');
    if (!/^rec[\w]+$/.test(String(body.recordId || ''))) return fail(res, 400, 'recordId không hợp lệ');
    const extId = body.extId == null || body.extId === '' ? null : String(body.extId).trim();

    // Không cho một ID nền tảng gắn vào hai bản ghi khác nhau
    if (extId) {
      const data = await store.get();
      const list = { campaign: data.campaigns, group: data.groups, ad: data.ads }[body.type];
      const clash = list.find((x) => x.extId === extId && x.id !== body.recordId);
      if (clash) return fail(res, 409, `ID "${extId}" đang gắn ở "${clash.name}" — bỏ ở đó trước đã`);
    }
    await lark.updateRecord(spec[0], body.recordId, { [spec[1]]: extId });
    xoaDem();
    return ok(res, { updated: body.recordId, extId });
  }

  if (p === '/api/refresh' && method === 'POST') {
    xoaDem();
    live.xoaCache();
    const data = await store.get({ force: true });
    return ok(res, { loadedAt: data.loadedAt, counts: { daily: data.daily.length } });
  }

  /* ---- cập nhật bản ghi ---- */
  let m;
  if ((m = p.match(/^\/api\/campaign\/(rec[\w]+)$/)) && method === 'PATCH') {
    const body = await readBody(req);
    const fields = pickFields(body, {
      name: [T.campaign.f.name, textOrNull],
      platform: [T.campaign.f.platform, selOrNull],
      objective: [T.campaign.f.objective, selOrNull],
      status: [T.campaign.f.status, selOrNull],
      budget: [T.campaign.f.budget, numOrNull],
      dailyBudget: [T.campaign.f.dailyBudget, numOrNull],
      start: [T.campaign.f.start, dateOrNull],
      end: [T.campaign.f.end, dateOrNull],
      note: [T.campaign.f.note, textOrNull],
    });
    if (!Object.keys(fields).length) return fail(res, 400, 'Không có trường nào để cập nhật');
    await lark.updateRecord(T.campaign.id, m[1], fields);
    xoaDem();
    return ok(res, { updated: m[1], fields: Object.keys(fields).length });
  }

  if ((m = p.match(/^\/api\/group\/(rec[\w]+)$/)) && method === 'PATCH') {
    const body = await readBody(req);
    const fields = pickFields(body, {
      name: [T.group.f.name, textOrNull],
      status: [T.group.f.status, selOrNull],
      budget: [T.group.f.budget, numOrNull],
      optimize: [T.group.f.optimize, selOrNull],
      placement: [T.group.f.placement, selOrNull],
      audience: [T.group.f.audience, textOrNull],
    });
    if (!Object.keys(fields).length) return fail(res, 400, 'Không có trường nào để cập nhật');
    await lark.updateRecord(T.group.id, m[1], fields);
    xoaDem();
    return ok(res, { updated: m[1] });
  }

  if ((m = p.match(/^\/api\/ad\/(rec[\w]+)$/)) && method === 'PATCH') {
    const body = await readBody(req);
    const fields = pickFields(body, {
      name: [T.ad.f.name, textOrNull],
      approval: [T.ad.f.approval, selOrNull],
      creative: [T.ad.f.creative, selOrNull],
      url: [T.ad.f.url, textOrNull],
      caption: [T.ad.f.caption, textOrNull],
    });
    if (!Object.keys(fields).length) return fail(res, 400, 'Không có trường nào để cập nhật');
    await lark.updateRecord(T.ad.id, m[1], fields);
    xoaDem();
    return ok(res, { updated: m[1] });
  }

  if ((m = p.match(/^\/api\/daily\/(rec[\w]+)$/))) {
    if (method === 'PATCH') {
      const body = await readBody(req);
      const fields = pickFields(body, {
        ...dailySpec,
        date: [T.daily.f.date, dateOrNull],
        adId: [T.daily.f.ad, (v) => (v ? [{ id: v }] : null)],
      });
      if (!Object.keys(fields).length) return fail(res, 400, 'Không có trường nào để cập nhật');
      await lark.updateRecord(T.daily.id, m[1], fields);
      xoaDem();
      return ok(res, { updated: m[1] });
    }
    if (method === 'DELETE') {
      await lark.deleteRecords(T.daily.id, [m[1]]);
      xoaDem();
      return ok(res, { deleted: m[1] });
    }
  }

  /* ---- xuất CSV ---- */
  if (p === '/api/export.csv' && method === 'GET') {
    const data = await store.get();
    const { rows } = M.dailyTable(data, queryOpts(u));
    const head = ['Ngày', 'Nền tảng', 'Chiến dịch', 'Nhóm', 'Quảng cáo', 'Chi tiêu', 'Hiển thị', 'Click', 'Chuyển đổi', 'CTR %', 'CPC', 'CPM', 'CPA'];
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = [head.join(',')].concat(rows.map((r) => [
      r.date, r.platform, r.campaignName, r.groupName, r.adName,
      r.spend, r.impressions, r.clicks, r.conversions, r.ctr, r.cpc, r.cpm, r.cpa,
    ].map(esc).join(','))).join('\r\n');
    return send(res, 200, '﻿' + csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hieu-suat-quang-cao.csv"',
    });
  }

  return fail(res, 404, 'Không có API ' + p);
}

/** Người đang dùng: chế độ cli hỏi lark-cli, chế độ api đọc header của lớp vỏ. */
/**
 * Người gọi có vai quản lý không.
 *
 * Trên máy cá nhân (mode 'file'): luôn có. Cấu hình nằm ngay trên đĩa của chính
 * người đó, thêm một cái chốt ở đây không bảo vệ được gì.
 *
 * Trên server chung (mode 'api'): chỉ tin header x-hub-user-manager, do hub đặt
 * sau khi đã đăng nhập Lark và tra bảng Phân quyền app. Hub xoá header do client
 * tự gửi trước khi ghi lại, và app chỉ nghe trên 127.0.0.1 — xem khối "cổng nghe"
 * ở cuối file.
 */
const laQuanLy = (req) => require('./quyen').laQuanLy(req, cfg);

async function nguoiDung(req) {
  if (cfg.mode !== 'api') return lark.whoami();
  // Chỉ tin header khi app nghe trên loopback — xem khối "cổng nghe" cuối file.
  if (process.env.HUB_TRUST_HEADER === '0') return null;
  const id = req.headers['x-hub-user-id'];
  if (!id) return null;
  const ten = req.headers['x-hub-user-name'];
  let deco = id;
  try { deco = ten ? decodeURIComponent(ten) : id; } catch (_) { deco = ten || id; }
  return { id: String(id), name: String(deco) };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (!u.pathname.startsWith('/api/')) return serveStatic(req, res, u.pathname);
  api(req, res, u).catch((err) => {
    const code = err.code && Number.isInteger(err.code) ? err.code : 500;
    console.error('[API]', u.pathname, '->', err.message);
    fail(res, code >= 400 && code < 600 ? code : 500, err.message || 'Lỗi không xác định');
  });
});

/* ---------------- cổng nghe ----------------
 * MẶC ĐỊNH CHỈ NGHE 127.0.0.1. App này TIN header danh tính do lớp vỏ gửi kèm
 * (x-hub-user-id / x-hub-user-manager...), nên mở cổng ra mạng ngoài đồng nghĩa
 * ai cùng mạng Wi-Fi cũng tự xưng được là quản lý. Lớp vỏ luôn gọi qua 127.0.0.1
 * nên chạy dưới hub không cần khai gì thêm.
 *
 * Muốn phơi app này ra ngoài thì đặt BIND_HOST=0.0.0.0 — khi đó việc tin header
 * TỰ TẮT, vì hai thứ đó không được phép cùng bật.
 */
const BIND = process.env.BIND_HOST || '127.0.0.1';
const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];
if (!LOOPBACK.includes(BIND) && process.env.HUB_TRUST_HEADER !== '0') {
  process.env.HUB_TRUST_HEADER = '0';
  console.warn('\n  [bảo mật] BIND_HOST=' + BIND + ' mở cổng ra mạng ngoài, nên đã TẮT\n' +
    '  việc tin header danh tính của lớp vỏ. Chạy dưới Marketing Hub thì bỏ BIND_HOST.\n');
}

server.listen(cfg.port, BIND, () => {
  console.log(`\n  Quản lý quảng cáo đa nền tảng — Rooty Trip`);
  console.log(`  http://localhost:${cfg.port}`);
  console.log(`  Base: ${cfg.baseUrl}\n`);
  // nạp sẵn để lần mở đầu tiên nhanh
  store.get().then((d) => console.log(`  Đã nạp: ${d.campaigns.length} chiến dịch · ${d.ads.length} quảng cáo · ${d.daily.length} dòng ngày`))
    .catch((e) => console.error('  Không nạp được base:', e.message));
  sync.startScheduler((m) => console.log(m));
});
