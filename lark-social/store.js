'use strict';
/**
 * Tầng đọc/ghi Lark Base cho app Social.
 *
 * Hai nguyên tắc chép lại từ app quảng cáo, vì đã trả giá để học:
 *
 *  1. Đọc/ghi bằng FIELD ID, không theo tên cột. Tên cột trên Base bị đổi là
 *     chuyện thường; field ID thì không đổi.
 *
 *  2. Không nhờ formula/rollup của Lark tính tổng. Mọi con số hiển thị đều cộng
 *     lại từ dòng thô trong JS, nên lọc được theo bất kỳ khoảng ngày nào —
 *     formula của Base chỉ tính được cả kỳ hoặc "hôm nay".
 *
 * Thêm một nguyên tắc riêng của app này: mỗi bảng số liệu có một cột "Khoá" là
 * cột chính. Đồng bộ chạy lại bao nhiêu lần cũng ĐÈ đúng dòng cũ thay vì đẻ dòng
 * trùng. Không có khoá thì chạy lại lần hai là Base có hai bản của cùng một ngày,
 * và mọi con số tổng đều sai gấp đôi mà nhìn bảng không thấy gì bất thường.
 */
const cfg = require('./config');
const lark = require('./lark');

const T = cfg.tables;

/* ---------------- chuẩn hoá ô ---------------- */
const num = (v) => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const txt = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.text || v.name || v.link || '');
  return String(v);
};
const clean = (v) => txt(v)
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();
const sel = (v) => (Array.isArray(v) ? txt(v[0]) : txt(v));
const links = (v) => (Array.isArray(v) ? v.map((x) => (x && x.id) || '').filter(Boolean) : []);
const users = (v) => (Array.isArray(v) ? v.map((u) => ({ id: u.id, name: u.name || u.id })) : []);
const url = (v) => {
  const s = txt(v);
  const m = s.match(/^\[(.*?)\]\((.*?)\)$/);
  return m ? m[2] : s;
};

/* ---------------- ngày ---------------- */
const TZ = cfg.tzOffsetHours * 3600 * 1000;

/** Giá trị datetime của Base → 'YYYY-MM-DD' theo giờ base. */
function toKey(v) {
  if (!v) return '';
  const t = typeof v === 'number' ? v : Date.parse(txt(v));
  if (!Number.isFinite(t)) return '';
  return new Date(t + TZ).toISOString().slice(0, 10);
}

/**
 * 'YYYY-MM-DD' → chuỗi datetime ghi vào Base.
 *
 * ĐÃ THỬ TRÊN CHÍNH BASE NÀY: chuỗi trần "2026-09-05 00:00:00" được Lark hiểu
 * theo MÚI GIỜ CỦA BASE (+8) và đọc lại ra "2026-09-05T00:00:00.000+08:00" —
 * đúng ngày. Nên ở đây chỉ cần ghép " 00:00:00", không quy đổi gì.
 *
 * ĐỪNG "sửa" hàm này thành đổi sang UTC theo kiểu app quảng cáo. Đã thử: gửi
 * "2026-09-04 16:00:00" thì Base hiểu là 16:00 ngày 04 giờ base, và mọi dòng
 * lùi đúng một ngày — sai lệch câm, vì bảng vẫn đầy số trông rất hợp lý.
 */
function ngayVeBase(key) {
  return String(key).slice(0, 10) + ' 00:00:00';
}

/**
 * ISO bất kỳ (nền tảng trả về giờ UTC) → chuỗi datetime giờ base để ghi vào Base.
 * Cùng lý do trên: phải cộng lệch múi giờ trước, vì Base đọc chuỗi trần là giờ
 * của chính nó chứ không phải UTC.
 */
function gioVeBase(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + TZ).toISOString().slice(0, 19).replace('T', ' ');
}

const homNay = () => new Date(Date.now() + TZ).toISOString().slice(0, 10);

function themNgay(key, n) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/* ---------------- tải ---------------- */
let cache = null;
let dangTai = null;

function docKenh(r) {
  const f = T.channel.f;
  return {
    id: r.id,
    name: clean(r.c[f.name]),
    platform: sel(r.c[f.platform]),
    extId: clean(r.c[f.extId]),
    handle: clean(r.c[f.handle]),
    url: url(r.c[f.url]),
    owner: users(r.c[f.owner]),
    status: sel(r.c[f.status]),
    source: sel(r.c[f.source]),
    note: clean(r.c[f.note]),
  };
}

function docNgay(r) {
  const f = T.daily.f;
  return {
    id: r.id,
    key: clean(r.c[f.key]),
    date: toKey(r.c[f.date]),
    channelIds: links(r.c[f.channel]),
    platform: sel(r.c[f.platform]),
    followers: num(r.c[f.followers]),
    followUp: num(r.c[f.followUp]),
    followDown: num(r.c[f.followDown]),
    views: num(r.c[f.views]),
    reach: num(r.c[f.reach]),
    impressions: num(r.c[f.impressions]),
    profileViews: num(r.c[f.profileViews]),
    likes: num(r.c[f.likes]),
    comments: num(r.c[f.comments]),
    shares: num(r.c[f.shares]),
    saves: num(r.c[f.saves]),
    engagement: num(r.c[f.engagement]),
    clicks: num(r.c[f.clicks]),
    messages: num(r.c[f.messages]),
    leads: num(r.c[f.leads]),
    posts: num(r.c[f.posts]),
    lives: num(r.c[f.lives]),
    source: sel(r.c[f.source]),
  };
}

function docBai(r) {
  const f = T.post.f;
  return {
    id: r.id,
    key: clean(r.c[f.key]),
    title: clean(r.c[f.title]),
    channelIds: links(r.c[f.channel]),
    platform: sel(r.c[f.platform]),
    extId: clean(r.c[f.extId]),
    publishedAt: r.c[f.publishedAt] || null,
    date: toKey(r.c[f.publishedAt]),
    type: sel(r.c[f.type]),
    url: url(r.c[f.url]),
    views: num(r.c[f.views]),
    reach: num(r.c[f.reach]),
    impressions: num(r.c[f.impressions]),
    likes: num(r.c[f.likes]),
    comments: num(r.c[f.comments]),
    shares: num(r.c[f.shares]),
    saves: num(r.c[f.saves]),
    engagement: num(r.c[f.engagement]),
    avgWatch: num(r.c[f.avgWatch]),
    fullWatchRate: num(r.c[f.fullWatchRate]),
    source: sel(r.c[f.source]),
  };
}

function docLive(r) {
  const f = T.live.f;
  return {
    id: r.id,
    key: clean(r.c[f.key]),
    title: clean(r.c[f.title]),
    channelIds: links(r.c[f.channel]),
    platform: sel(r.c[f.platform]),
    extId: clean(r.c[f.extId]),
    start: r.c[f.start] || null,
    date: toKey(r.c[f.start]),
    end: r.c[f.end] || null,
    minutes: num(r.c[f.minutes]),
    views: num(r.c[f.views]),
    peak: num(r.c[f.peak]),
    comments: num(r.c[f.comments]),
    likes: num(r.c[f.likes]),
    shares: num(r.c[f.shares]),
    newFollows: num(r.c[f.newFollows]),
    url: url(r.c[f.url]),
    source: sel(r.c[f.source]),
  };
}

async function taiThat() {
  const [kenhRaw, ngayRaw, baiRaw, liveRaw] = await Promise.all([
    lark.listAll(T.channel.id),
    lark.listAll(T.daily.id),
    lark.listAll(T.post.id),
    lark.listAll(T.live.id),
  ]);

  const channels = kenhRaw.map(docKenh);
  const byRec = new Map(channels.map((c) => [c.id, c]));
  const byExt = new Map(channels.filter((c) => c.extId).map((c) => [c.extId, c]));

  /* Gắn tên kênh vào từng dòng số liệu ngay lúc nạp. Giao diện và phần gộp số
   * đều cần "dòng này của kênh nào" — làm một lần ở đây rẻ hơn tra bảng ở mọi
   * chỗ dùng, và tránh chuyện mỗi nơi tra một kiểu rồi lệch nhau. */
  const gan = (r) => {
    const c = r.channelIds.map((id) => byRec.get(id)).filter(Boolean)[0] || null;
    r.channel = c ? c.name : '';
    r.channelExtId = c ? c.extId : '';
    if (!r.platform && c) r.platform = c.platform;
    return r;
  };

  const daily = ngayRaw.map(docNgay).map(gan);
  const posts = baiRaw.map(docBai).map(gan);
  const lives = liveRaw.map(docLive).map(gan);

  return {
    luc: Date.now(),
    channels, byRec, byExt,
    daily, posts, lives,
  };
}

async function tai(moi = false) {
  if (!moi && cache && Date.now() - cache.luc < cfg.cacheTtlMs) return cache;
  if (dangTai) return dangTai;
  dangTai = taiThat().then((d) => { cache = d; dangTai = null; return d; })
    .catch((e) => { dangTai = null; throw e; });
  return dangTai;
}

const xoaCache = () => { cache = null; };

/* ---------------- ghi ---------------- */

/**
 * Bảo đảm mỗi kênh trong `ds` có một dòng trong bảng Kênh; trả bản đồ
 * extId → record_id để các bảng số liệu link sang.
 *
 * Ghép theo ID nền tảng chứ không theo tên: tên kênh người ta đổi suốt (thêm
 * emoji, đổi "Rooty Trip Phú Quốc" thành "Rooty Trip Phú Quốc 🌴"), còn ID thì
 * cố định. Ghép theo tên là mỗi lần đổi tên lại đẻ ra một kênh mới.
 */
async function baoDamKenh(ds) {
  if (!ds.length) return {};
  const d = await tai(true);
  const f = T.channel.f;
  const map = {};
  const them = [];

  for (const k of ds) {
    if (!k.extId) continue;
    const co = d.byExt.get(String(k.extId));
    if (co) { map[k.extId] = co.id; continue; }
    them.push({
      [f.name]: k.name || String(k.extId),
      [f.platform]: k.platform,
      [f.extId]: String(k.extId),
      [f.handle]: k.handle || '',
      [f.url]: k.url || '',
      [f.status]: 'Đang chạy',
      [f.source]: 'API',
    });
  }

  if (them.length) {
    const ids = await lark.createMany(T.channel.id, them);
    them.forEach((r, i) => { if (ids[i]) map[r[f.extId]] = ids[i]; });
    xoaCache();
  }
  return map;
}

/** Chỉ ghi những ô thực sự đổi — Base đếm mọi lần ghi vào lịch sử sửa đổi. */
function khacNhau(cu, moi) {
  const out = {};
  Object.keys(moi).forEach((k) => {
    const a = cu[k]; const b = moi[k];
    if (typeof b === 'number') { if (num(a) !== b) out[k] = b; return; }
    if (b == null || b === '') return;
    if (clean(a) !== clean(b)) out[k] = b;
  });
  return out;
}

/**
 * Ghi (tạo mới hoặc đè) theo cột Khoá.
 *   tenBang  : 'daily' | 'post' | 'live'
 *   rows     : mảng object đã có sẵn field ID làm khoá
 *   layKhoa  : row -> chuỗi khoá
 * Trả { them, sua, boQua }.
 */
async function ghiTheoKhoa(tenBang, rows, layKhoa) {
  if (!rows.length) return { them: 0, sua: 0, boQua: 0 };
  const bang = T[tenBang];
  const cu = await lark.listAll(bang.id);
  const theoKhoa = new Map(cu.map((r) => [clean(r.c[bang.f.key]), r]));

  const them = [];
  const sua = {};
  let boQua = 0;

  for (const row of rows) {
    const khoa = layKhoa(row);
    if (!khoa) { boQua++; continue; }
    const co = theoKhoa.get(khoa);
    if (!co) { them.push(row); continue; }
    const doi = khacNhau(co.c, row);
    if (Object.keys(doi).length) sua[co.id] = doi;
  }

  if (them.length) await lark.createMany(bang.id, them);
  if (Object.keys(sua).length) await lark.updateMany(bang.id, sua);
  xoaCache();
  return { them: them.length, sua: Object.keys(sua).length, boQua };
}

/** Một dòng nhật ký đồng bộ. Lỗi ở đây không được làm hỏng lượt đồng bộ. */
async function ghiNhatKy(ban) {
  const f = T.log.f;
  try {
    await lark.createRecord(T.log.id, {
      [f.at]: new Date().toISOString(),
      [f.platform]: ban.platform || 'Tất cả',
      [f.ranAt]: gioVeBase(new Date().toISOString()),
      [f.from]: ban.from || '',
      [f.to]: ban.to || '',
      [f.result]: ban.result || 'Thành công',
      [f.rowsDaily]: num(ban.rowsDaily),
      [f.rowsPost]: num(ban.rowsPost),
      [f.rowsLive]: num(ban.rowsLive),
      [f.seconds]: num(ban.seconds),
      [f.message]: String(ban.message || '').slice(0, 1000),
    });
  } catch (e) {
    console.warn('[store] không ghi được nhật ký: ' + e.message);
  }
}

module.exports = {
  T, tai, xoaCache, baoDamKenh, ghiTheoKhoa, ghiNhatKy,
  toKey, ngayVeBase, gioVeBase, homNay, themNgay,
  num, txt, clean, sel, links, users, url,
};
