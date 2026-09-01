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
const tourwellApi = require('./tourwellapi');
const khoRoas = require('./khoroas');
const reconcile = require('./reconcile');
const csv = require('./csv');
const live = require('./live');

const meta = require('./meta');
const tiktok = require('./tiktok');
const gsheet = require('./gsheet');
const gads = require('./gads');

const ADAPTERS = {
  meta: { mod: meta, source: 'Meta API', label: 'Facebook / Meta' },
  tiktok: { mod: tiktok, source: 'TikTok API', label: 'TikTok' },
  /* `source` phải là một lựa chọn CÓ SẴN trong cột Nguồn của Base (Nhập tay ·
   * Meta API · TikTok API · Google Ads · CSV) — khai chuỗi lạ là Lark từ chối ghi.
   * Dùng chung nhãn "Google Ads" với đường Sheet: hai đường không bao giờ bật
   * cùng lúc nên không lẫn được. Muốn phân biệt thì thêm lựa chọn mới vào Base. */
  googleAds: { mod: gads, source: 'Google Ads', label: 'Google Ads (API)' },
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
  const xin = opts.providers && opts.providers.length ? opts.providers : null;

  /* Nguồn chỉ-để-đo có khối cấu hình nhưng KHÔNG có adapter đồng bộ (Pancake đo
   * "khách đến từ quảng cáo nào", không đo chi tiêu). Trước đây nó bị bộ lọc dưới
   * đây loại âm thầm, và người dùng nhận câu "kênh chọn không hợp lệ" — không nói
   * được là kênh nào, cũng không nói vì sao. Gọi tên hẳn ra. */
  const CHI_DO = Object.keys(ketnoi.DEFAULT)
    .filter((k) => k !== 'dongBo' && !ADAPTERS[k]);
  const xinNhamChiDo = (xin || []).filter((k) => CHI_DO.includes(k));
  if (xinNhamChiDo.length) {
    throw Object.assign(new Error(
      `${xinNhamChiDo.join(', ')} không phải nguồn chi tiêu nên không có gì để đồng bộ vào Base. `
      + 'Pancake dùng thẻ "Pancake — hội thoại & ad_ids" ở tab Kết nối, nút "Đếm phủ".',
    ), { code: 400 });
  }

  let keys = (xin || Object.keys(ADAPTERS))
    .filter((k) => ADAPTERS[k])
    .filter((k) => (xin ? true : conf[k] && conf[k].enabled));

  // Không bao giờ chạy hai nguồn cùng đại diện một nền tảng: googleAds (API) và
  // googleSheet đều ghi nhãn "Google Ads", chạy cả hai là chi tiêu Google vào Base
  // hai lần. Sai gấp đôi mà số nhìn vẫn hợp lý — loại lỗi khó thấy nhất.
  const nguonBoQua = live.nguonBiBo().map((x) => x.kenh);
  keys = keys.filter((k) => !nguonBoQua.includes(k));

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
      // ADAPTERS[key] chắc chắn tồn tại: keys đã lọc qua ADAPTERS ở đầu run(), và
      // chỗ lọc đó báo lỗi có tên cụ thể nếu người dùng gửi lên một nguồn chỉ-để-đo.
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

  // Trả ra hẳn danh sách lỗi. Trước đây mảng này chỉ được dựng tại chỗ để đẩy vào
  // history, nên người gọi (hẹn giờ, UI) không có cách nào đọc được kênh nào chết.
  out.loi = out.ketQua.filter((r) => !r.ok).map((r) => `${r.label}: ${r.loi}`);

  pushHistory({
    loai: dryRun ? 'xem-truoc' : 'dong-bo',
    kenh: keys, from, to, tong: out.tong, loi: out.loi,
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

/* Kho lead/đơn Tourwell coi là còn dùng được trong bao lâu. Mỗi lượt kéo là hàng
 * trăm lời gọi API và Tourwell giới hạn 60 yêu cầu/phút, nên kéo lại mỗi giờ là
 * phí. Sáu giờ đủ tươi cho một bảng ROAS. */
const TUOI_KHO_GIO = Number(process.env.TOURWELL_TUOI_GIO || 6);

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
  /* Lỗi ở lượt tự động gần như luôn là chuyện thoáng qua: giây đầu sau khi khởi
   * động mạng ra ngoài chưa sẵn, hoặc lúc deploy hai bản app còn chồng nhau nên
   * hai lượt đồng bộ đâm nhau khi ghi. Khoá ghi là (quảng cáo × ngày) nên chạy
   * lại KHÔNG nhân dòng — cứ thử lại đúng một lần là sạch, khỏi cần ai nhìn. */
  const tick = async (laLanThuHai = false) => {
    if (!laLanThuHai) nextAt = new Date(Date.now() + ms).toISOString();
    const thuLai = () => {
      logFn('  [hẹn giờ] còn lỗi — tự thử lại sau 60 giây');
      setTimeout(() => tick(true), 60 * 1000);
    };
    try {
      const r = await run({});
      logFn(`  [hẹn giờ] đồng bộ${laLanThuHai ? ' (lần 2)' : ''} xong: +${r.tong.taoMoi} dòng mới, ~${r.tong.capNhat} cập nhật, ${r.tong.loi} lỗi`);
      // In hẳn nội dung từng lỗi. Chỉ in con số thì trên server chung (Render)
      // không còn cách nào biết kênh nào chết vì sao.
      (r.loi || []).forEach((m) => logFn(`  [hẹn giờ] LỖI  ${m}`));

      /* Kéo lead + đơn Tourwell về kho, để ROAS không phải bấm tay.
       *
       * Đặt SAU phần đồng bộ chi tiêu và bọc try riêng: Tourwell hỏng thì chi tiêu
       * vẫn phải vào Base. Và KHÔNG tính vào r.tong.loi, vì đó là con số của việc
       * ghi vào Base — trộn vào sẽ kích cơ chế "thử lại sau 60 giây" cho một việc
       * chẳng liên quan.
       *
       * Chỉ kéo khi kho đã cũ: mỗi lượt kéo là hàng trăm lời gọi API (Tourwell
       * giới hạn 60 yêu cầu/phút), kéo lại mỗi giờ là phí và chậm. */
      try {
        const tw = ketnoi.read().tourwell;
        if (tw && tw.enabled && tw.host && tw.token) {
          if (khoRoas.conTuoi(TUOI_KHO_GIO)) {
            logFn(`  [hẹn giờ] Tourwell: kho còn tươi (dưới ${TUOI_KHO_GIO} giờ), bỏ qua`);
          } else {
            const ngayVN = (lui = 0) => new Date(Date.now() + 7 * 3600 * 1000 - lui * 86400 * 1000)
              .toISOString().slice(0, 10);
            const k = await tourwellApi.keoVeKho(tw, ngayVN(60), ngayVN(0), () => {});
            logFn(`  [hẹn giờ] Tourwell: ${k.lead ? k.lead.dong : 0} lead, `
              + `${k.don ? k.don.dong : 0} đơn (${(k.khoang || []).join(' → ')})`);
          }
        }
      } catch (e) {
        logFn('  [hẹn giờ] Tourwell LỖI  ' + e.message);
      }
      if (r.tong.loi > 0 && !laLanThuHai) thuLai();
    } catch (e) {
      logFn(`  [hẹn giờ] đồng bộ${laLanThuHai ? ' (lần 2)' : ''} lỗi: ${e.message}`);
      if (!laLanThuHai) thuLai();
    }
  };
  timer = setInterval(tick, ms);
  nextAt = new Date(Date.now() + ms).toISOString();
  logFn(`  Hẹn giờ đồng bộ: mỗi ${hours} giờ`);
  // 30 giây, không phải 4: lượt đầu tiên phải đợi Render chuyển giao xong bản cũ,
  // nếu không cả ba kênh cùng chết vì lý do chẳng liên quan gì tới nền tảng.
  if (conf.dongBo.khiKhoiDong) setTimeout(() => tick(), 30 * 1000);
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
