'use strict';
/**
 * Điều phối đồng bộ: lấy số từ các nền tảng đang bật → đối chiếu vào Lark Base.
 *
 * Luôn đồng bộ LÙI nhiều ngày (mặc định 7) chứ không chỉ hôm nay, vì Meta/TikTok/Google
 * còn khai báo lại chuyển đổi trong vòng vài ngày. Chạy lại nhiều lần là an toàn:
 * khoá (quảng cáo × ngày) nên chỉ cập nhật chứ không nhân dòng.
 */
const store = require('../store');
const ketnoi = require('./ketnoi');
const reconcile = require('./reconcile');
const csv = require('./csv');

const meta = require('./meta');
const tiktok = require('./tiktok');
const gsheet = require('./gsheet');
const gads = require('./gads');

const ADAPTERS = {
  meta: { mod: meta, source: 'Meta API', label: 'Facebook / Meta' },
  tiktok: { mod: tiktok, source: 'TikTok API', label: 'TikTok' },
  googleAds: { mod: gads, source: 'Google Ads API', label: 'Google Ads (API)' },
  googleSheet: { mod: gsheet, source: 'Google Ads', label: 'Google Ads (qua Sheet)' },
};

/** Lịch sử các lần đồng bộ trong phiên chạy hiện tại. */
const history = [];
let running = null;

const nowIso = () => new Date().toISOString();

function pushHistory(entry) {
  history.unshift({ luc: nowIso(), ...entry });
  if (history.length > 40) history.length = 40;
}

/** Khoảng ngày cần đồng bộ: lùi `soNgayLui` ngày tính từ hôm nay. */
function range(conf, opts = {}) {
  const to = opts.to || store.todayKey();
  const days = Math.max(1, Number(opts.days || conf.dongBo.soNgayLui || 7));
  return { from: opts.from || store.addDays(to, -(days - 1)), to };
}

/**
 * @param {object} opts { providers?:string[], dryRun?:boolean, from?, to?, days?, tuTaoMoi?, ghiDeNhapTay? }
 */
async function run(opts = {}) {
  if (running) throw Object.assign(new Error('Đang có một lượt đồng bộ chạy dở, chờ xong đã'), { code: 409 });
  const conf = ketnoi.read();
  const keys = (opts.providers && opts.providers.length ? opts.providers : Object.keys(ADAPTERS))
    .filter((k) => ADAPTERS[k])
    .filter((k) => (opts.providers && opts.providers.length ? true : conf[k] && conf[k].enabled));

  if (!keys.length) {
    throw Object.assign(new Error('Chưa bật kênh nào trong ket-noi.json (hoặc kênh chọn không hợp lệ)'), { code: 400 });
  }

  const { from, to } = range(conf, opts);
  const dryRun = !!opts.dryRun;
  const tuTaoMoi = opts.tuTaoMoi == null ? conf.dongBo.tuTaoMoi : !!opts.tuTaoMoi;
  const ghiDeNhapTay = opts.ghiDeNhapTay == null ? conf.dongBo.ghiDeNhapTay : !!opts.ghiDeNhapTay;

  running = { batDau: nowIso(), keys, from, to, dryRun };
  const out = { from, to, dryRun, ketQua: [] };

  try {
    for (const key of keys) {
      const { mod, source, label } = ADAPTERS[key];
      const logs = [];
      try {
        if (!conf[key]) throw new Error(`Chưa có cấu hình cho ${label}`);
        const fetched = await mod.fetchRange(conf[key], from, to, (m) => logs.push(m));
        // đọc Base tươi mới ngay trước khi đối chiếu (mỗi kênh ghi xong là dữ liệu đổi)
        const data = await store.get({ force: true });
        const rep = await reconcile.reconcile(data, fetched.rows, {
          tuTaoMoi, ghiDeNhapTay, source, dryRun,
        });
        out.ketQua.push({
          kenh: key, label, ok: true, source,
          layDuoc: fetched.rows.length,
          actionTypes: fetched.actionTypes || undefined,
          columnMap: fetched.columnMap || undefined,
          log: logs,
          ...rep,
        });
      } catch (e) {
        out.ketQua.push({ kenh: key, label, ok: false, loi: e.message, log: logs });
      }
    }
  } finally {
    running = null;
  }

  out.tong = out.ketQua.reduce((s, r) => ({
    taoMoi: s.taoMoi + ((r.bangNgay && r.bangNgay.taoMoi) || 0),
    capNhat: s.capNhat + ((r.bangNgay && r.bangNgay.capNhat) || 0),
    boQua: s.boQua + ((r.bangNgay && r.bangNgay.boQua) || 0),
    loi: s.loi + (r.ok ? 0 : 1),
  }), { taoMoi: 0, capNhat: 0, boQua: 0, loi: 0 });

  pushHistory({
    loai: dryRun ? 'xem-truoc' : 'dong-bo',
    kenh: keys, from, to, tong: out.tong,
    loi: out.ketQua.filter((r) => !r.ok).map((r) => `${r.label}: ${r.loi}`),
  });
  return out;
}

/** Nhập từ nội dung CSV do anh dán/tải lên. */
async function importCsv(text, { platform, level = 'ad', dryRun = false, tuTaoMoi, ghiDeNhapTay } = {}) {
  if (!platform) throw Object.assign(new Error('Phải chọn nền tảng cho file CSV'), { code: 400 });
  const conf = ketnoi.read();
  const parsed = csv.toRows(text, { platform, level });
  if (!parsed.rows.length) throw Object.assign(new Error('CSV không có dòng dữ liệu nào đọc được'), { code: 400 });

  const data = await store.get({ force: true });
  const rep = await reconcile.reconcile(data, parsed.rows, {
    source: 'CSV',
    dryRun,
    tuTaoMoi: tuTaoMoi == null ? conf.dongBo.tuTaoMoi : !!tuTaoMoi,
    ghiDeNhapTay: ghiDeNhapTay == null ? conf.dongBo.ghiDeNhapTay : !!ghiDeNhapTay,
  });
  const res = {
    kenh: 'csv', label: `CSV · ${platform}`, ok: true, source: 'CSV',
    layDuoc: parsed.rows.length,
    columnMap: parsed.columnMap,
    unknownColumns: parsed.unknownColumns,
    boQuaKhiDoc: parsed.skipped,
    ...rep,
  };
  pushHistory({
    loai: dryRun ? 'xem-truoc-csv' : 'nhap-csv',
    kenh: [platform], from: rep.khoang && rep.khoang.from, to: rep.khoang && rep.khoang.to,
    tong: { ...rep.bangNgay, loi: 0 },
  });
  return res;
}

/** Kiểm tra kết nối từng kênh, không ghi gì. */
async function testAll() {
  const conf = ketnoi.read();
  const out = [];
  for (const [key, { mod, label }] of Object.entries(ADAPTERS)) {
    if (!conf[key]) { out.push({ kenh: key, label, ok: false, message: 'Chưa cấu hình' }); continue; }
    try { out.push({ kenh: key, label, ...(await mod.test(conf[key])) }); }
    catch (e) { out.push({ kenh: key, label, ok: false, message: e.message }); }
  }
  return out;
}

/* ---------------- hẹn giờ ---------------- */
let timer = null;
let nextAt = null;

function startScheduler(logFn = console.log) {
  stopScheduler();
  const conf = ketnoi.read();
  const hours = Number(conf.dongBo.moiSoGio || 0);
  const enabled = Object.keys(ADAPTERS).some((k) => conf[k] && conf[k].enabled);
  if (!hours || !enabled) {
    logFn(`  Hẹn giờ đồng bộ: TẮT ${!enabled ? '(chưa bật kênh nào)' : '(moiSoGio = 0)'}`);
    return;
  }
  const ms = hours * 3600 * 1000;
  const tick = async () => {
    nextAt = new Date(Date.now() + ms).toISOString();
    try {
      const r = await run({});
      logFn(`  [hẹn giờ] đồng bộ xong: +${r.tong.taoMoi} dòng mới, ~${r.tong.capNhat} cập nhật, ${r.tong.loi} lỗi`);
    } catch (e) {
      logFn(`  [hẹn giờ] đồng bộ lỗi: ${e.message}`);
    }
  };
  timer = setInterval(tick, ms);
  nextAt = new Date(Date.now() + ms).toISOString();
  logFn(`  Hẹn giờ đồng bộ: mỗi ${hours} giờ`);
  if (conf.dongBo.khiKhoiDong) setTimeout(tick, 4000);
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null; nextAt = null;
}

const schedulerState = () => ({ dangBat: !!timer, lanKeTiep: nextAt });

module.exports = {
  run, importCsv, testAll, history, schedulerState,
  startScheduler, stopScheduler,
  dangChay: () => running,
  ADAPTERS: Object.fromEntries(Object.entries(ADAPTERS).map(([k, v]) => [k, { source: v.source, label: v.label }])),
};
