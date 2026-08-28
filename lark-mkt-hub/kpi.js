'use strict';
/**
 * Bộ đọc chỉ số cho trang "Tổng quan chung" của lớp vỏ.
 *
 * Hub KHÔNG đọc Lark Base trực tiếp — nó gọi lại API của chính từng module, nên
 * mọi quy tắc nghiệp vụ (lọc dòng trống, tính lại thời lượng, cách cộng chi tiêu)
 * chỉ có một nơi định nghĩa: trong module. Thêm base mới thì viết thêm một hàm ở
 * đây rồi khai `"kpi": "<tên>"` trong modules.json.
 */
const cfg = require('./config');
const { goiJson } = require('./proxy');

const DONG = new Set(['Hoàn thành', 'Hủy']);
// trạng thái coi như đã đóng của Lịch tác nghiệp
const LICH_DONG = new Set(['Đã hoàn tất', 'Từ chối', 'Hủy lịch']);
const NGAY = 86400000;

const dauNgay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

/* ---------------- khoảng thời gian ----------------
 * Client gửi `tu`/`den` dạng YYYY-MM-DD (nó biết múi giờ và "tháng này" của máy
 * người dùng). Không có = xem toàn bộ.
 */
function moc(k) {
  if (!k || !k.tu || !k.den) return null;
  const tu = dauNgay(new Date(k.tu + 'T00:00:00'));
  const den = dauNgay(new Date(k.den + 'T00:00:00')) + NGAY - 1;   // hết ngày cuối
  if (!Number.isFinite(tu) || !Number.isFinite(den) || tu > den) return null;
  return { tu, den };
}
const trongMoc = (t, m) => !m || (t >= m.tu && t <= m.den);
const soNgay = (hieu) => Math.floor(hieu / NGAY);
/** Base trả datetime có khi là epoch ms, có khi là chuỗi ISO — chuẩn hoá về số. */
const ms = (v) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Date.parse(v) || 0);
const ten = (us) => (us || []).map((u) => u.name || u.id).filter(Boolean).join(', ');

/**
 * Giá trị select trong Base hay có emoji dẫn đầu ("🔴 Cao", "🟡 Trung bình") — bỏ đi
 * khi hiển thị. Cắt theo code point thay vì regex: môi trường shell ở đây hay ăn mất
 * một lớp backslash nên regex escape rất dễ hỏng âm thầm.
 */
function nhan(v) {
  const t = String(v == null ? '' : v);
  const kyHieu = (cp) => cp === 32 || cp === 0xFE0F || cp === 0x200D ||
    (cp >= 0x2000 && cp <= 0x3300) || (cp >= 0x1F000 && cp <= 0x1FAFF);
  let i = 0;
  while (i < t.length) {
    const cp = t.codePointAt(i);
    if (!kyHieu(cp)) break;
    i += cp > 0xFFFF ? 2 : 1;
  }
  return t.slice(i).trim();
}
/* ---------------- Bảng công việc (Tracking) ---------------- */
async function congViec(mod, khoang, nguoi) {
  const [meta, ds] = await Promise.all([
    goiJson(mod, '/api/meta', { nguoi }).catch(() => null),
    goiJson(mod, '/api/tasks', { nguoi }),
  ]);
  const m = moc(khoang);
  const now = Date.now();
  const homNay = dauNgay(now);

  const han = (t) => ms(t.deadline);
  // Lọc y như bộ lọc "Tháng này" trong app: theo DEADLINE, việc không có deadline
  // thì không khớp mốc thời gian nào (giữ số trên hub và trong app khớp nhau).
  const tasks = (ds.tasks || []).filter((t) => (m ? han(t) && trongMoc(han(t), m) : true));
  const mo = tasks.filter((t) => !DONG.has(t.status));
  // "Quá hạn" tính theo NGÀY như trong app (hết hạn hôm nay chưa coi là trễ),
  // nếu so từng giây thì số trên hub lệch với số trong app.
  const quaHan = mo
    .filter((t) => han(t) && han(t) < homNay)
    .sort((a, b) => han(a) - han(b));
  const chuaPhanCong = mo.filter((t) => !(t.owner || []).length);
  const thieuDeadline = mo.filter((t) => !han(t));
  const choTiepNhan = mo.filter((t) => t.status === 'Chờ tiếp nhận');
  const denHan = mo.filter((t) => han(t) >= now && han(t) < homNay + 2 * NGAY);

  const the = [
    { nhan: 'Việc đang mở', so: mo.length, dinhDang: 'so' },
    { nhan: 'Quá hạn', so: quaHan.length, dinhDang: 'so', muc: quaHan.length ? 'cao' : 'ok' },
    { nhan: 'Chưa phân công', so: chuaPhanCong.length, dinhDang: 'so', muc: chuaPhanCong.length ? 'cao' : 'ok' },
    { nhan: 'Đang tiến hành', so: mo.filter((t) => t.status === 'Đang tiến hành').length, dinhDang: 'so' },
    { nhan: 'Sắp tới hạn (48h)', so: denHan.length, dinhDang: 'so', muc: denHan.length ? 'vua' : 'ok' },
    // hàng đợi đầu vào: việc đã vào bảng nhưng người nhận chưa xác nhận bắt tay làm
    { nhan: 'Chờ tiếp nhận', so: choTiepNhan.length, dinhDang: 'so',
      muc: choTiepNhan.length ? 'vua' : 'ok',
      ghi: thieuDeadline.length ? thieuDeadline.length + ' việc chưa có deadline' : '' },
  ];

  const canXuLy = [];
  quaHan.slice(0, 6).forEach((t) => canXuLy.push({
    id: t.id,
    muc: 'cao',
    tieuDe: t.title || '(không tên)',
    phu: 'Quá hạn ' + soNgay(now - han(t)) + ' ngày · ' + (ten(t.owner) || 'chưa phân công'),
    the: [t.priority, t.workType].map(nhan).filter(Boolean),
  }));
  chuaPhanCong.slice(0, 4).forEach((t) => canXuLy.push({
    id: t.id,
    muc: 'vua',
    tieuDe: t.title || '(không tên)',
    phu: 'Chưa có phụ trách chính' + (han(t) ? ' · hạn ' + new Date(han(t)).toLocaleDateString('vi-VN') : ''),
    the: [t.campaign].map(nhan).filter(Boolean),
  }));

  // Việc quá hạn nằm NGOÀI khoảng lọc — để bộ lọc tháng không âm thầm che tồn đọng
  const ngoai = m
    ? (ds.tasks || []).filter((t) => !DONG.has(t.status) && han(t) && han(t) < homNay &&
        !trongMoc(han(t), m)).length
    : 0;

  return {
    the,
    canXuLy,
    tong: tasks.length,
    ngoaiKhoang: ngoai,
    ngoaiKhoangNhan: ngoai ? ngoai + ' việc quá hạn từ trước khoảng lọc' : '',
    vai: meta && meta.role ? meta.role : '',
    nguoi: meta && meta.me ? meta.me.name : '',
  };
}

/* ---------------- Lịch tác nghiệp ---------------- */
async function lichTacNghiep(mod, khoang, nguoi) {
  const meta = await goiJson(mod, '/api/meta', { nguoi });
  const m = moc(khoang);
  const tatCa = meta.items || [];
  const bd0 = (t) => ms(t.start);
  const items = tatCa.filter((t) => trongMoc(bd0(t), m));
  const now = Date.now();
  const d0 = dauNgay(now);
  const thang = new Date(now); thang.setDate(1); thang.setHours(0, 0, 0, 0);
  const thangSau = new Date(thang); thangSau.setMonth(thangSau.getMonth() + 1);

  const bd = (t) => ms(t.start);
  const trong = (t, a, b) => bd(t) >= a && bd(t) < b;
  const choDuyet = items.filter((t) => t.status === 'Chờ duyệt/Xử lý')
    .sort((a, b) => bd(a) - bd(b));
  const homNay = items.filter((t) => trong(t, d0, d0 + NGAY));
  const tuanToi = items.filter((t) => trong(t, d0, d0 + 7 * NGAY));
  const treBaoCao = items.filter((t) => bd(t) && bd(t) < d0 &&
    ['Duyệt/Chờ tác nghiệp', 'Đang báo cáo'].includes(t.status));

  /* ---- lịch đang có nguy cơ: quản lý phải xem, không chờ ai báo ----
   * Mỗi lịch chỉ đếm một lần, lấy lý do nặng nhất. Thứ tự dưới đây là thứ tự
   * ưu tiên: sát ngày mà chưa chốt được người/chưa duyệt thì nguy hơn là treo yêu cầu.
   */
  const SAT_NGAY = 2 * NGAY;                     // 48h tới
  const CHUA_DUYET = ['Đang lên kế hoạch', 'Chờ duyệt/Xử lý'];
  const lyDoNguyCo = (t) => {
    const khi = bd(t);
    const satNgay = khi && khi >= d0 && khi < d0 + SAT_NGAY;
    const conNgay = khi ? Math.max(0, Math.round((khi - now) / NGAY)) : 0;

    if (t.status === 'Từ chối/Cần điều chỉnh') return { muc: 'cao', ly: 'Bị trả lại, chưa điều chỉnh' };
    if (khi && khi < d0 && t.status === 'Duyệt/Chờ tác nghiệp') {
      return { muc: 'cao', ly: 'Đã qua ngày mà chưa báo cáo' };
    }
    if (satNgay && CHUA_DUYET.includes(t.status)) {
      return { muc: 'cao', ly: 'Còn ' + conNgay + ' ngày là tác nghiệp mà chưa duyệt' };
    }
    if (satNgay && !(t.staff || []).length) {
      return { muc: 'cao', ly: 'Sát ngày mà chưa có nhân sự' };
    }
    // Yêu cầu treo chỉ là nguy cơ khi lịch còn sống; lịch đã đóng thì đó là lịch sử
    const conSong = !LICH_DONG.has(t.status);
    if (conSong && t.focRequest && !t.focStatus) return { muc: 'vua', ly: 'Yêu cầu FOC chưa được phản hồi' };
    if (conSong && t.mediaRequest && !t.mediaStatus) return { muc: 'vua', ly: 'Yêu cầu phòng Media chưa phản hồi' };
    if (t.status === 'Đang báo cáo' && khi && khi < d0 - 3 * NGAY) {
      return { muc: 'vua', ly: 'Báo cáo bỏ dở quá 3 ngày' };
    }
    if (t.status === 'Đã hoàn tất' && (t.costActual || 0) > 0 && t.payment !== 'Đã thanh toán') {
      return { muc: 'vua', ly: 'Đã xong nhưng chưa thanh toán chi phí' };
    }
    return null;
  };

  const nguyCo = items
    .map((t) => ({ t, r: lyDoNguyCo(t) }))
    .filter((x) => x.r)
    .sort((a, b) => (a.r.muc === b.r.muc ? bd(a.t) - bd(b.t) : a.r.muc === 'cao' ? -1 : 1));
  const nguyCoNang = nguyCo.filter((x) => x.r.muc === 'cao');
  // Có bộ lọc thì cộng chi phí trong khoảng lọc; không lọc thì lấy tháng hiện tại
  const dsChiPhi = m ? items : items.filter((t) => trong(t, thang.getTime(), thangSau.getTime()));
  const chiPhi = dsChiPhi.reduce((s, t) => s + (t.costPlan || 0), 0);
  const chiPhiThuc = dsChiPhi.reduce((s, t) => s + (t.costActual || 0), 0);

  const the = [
    { nhan: 'Chờ duyệt', so: choDuyet.length, dinhDang: 'so', muc: choDuyet.length ? 'cao' : 'ok' },
    { nhan: 'Lịch hôm nay', so: homNay.length, dinhDang: 'so' },
    { nhan: '7 ngày tới', so: tuanToi.length, dinhDang: 'so' },
    // thay cho "Đang báo cáo" (số đó chỉ mô tả, không đòi ai làm gì)
    { nhan: 'Lịch có nguy cơ', so: nguyCo.length, dinhDang: 'so',
      muc: nguyCoNang.length ? 'cao' : nguyCo.length ? 'vua' : 'ok',
      ghi: nguyCo.length ? nguyCo[0].r.ly.toLowerCase() + (nguyCo.length > 1 ? ' · +' + (nguyCo.length - 1) + ' việc khác' : '') : '' },
    { nhan: 'Chưa chốt báo cáo', so: treBaoCao.length, dinhDang: 'so', muc: treBaoCao.length ? 'vua' : 'ok' },
    { nhan: m ? 'Chi phí dự kiến' : 'Chi phí dự kiến tháng', so: chiPhi, dinhDang: 'vnd',
      ghi: chiPhiThuc ? 'thực tế ' + Math.round(chiPhiThuc).toLocaleString('vi-VN') + 'đ' : '' },
  ];

  const gio = (t) => (bd(t) ? new Date(bd(t)).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'chưa có ngày');
  // nói rõ đang là nhân sự hay chỉ có phụ trách đứng tên — nếu không, câu
  // "chưa có nhân sự" lại đi kèm một cái tên thì đọc rất khó hiểu
  const aiDo = (t) => ((t.staff || []).length ? ten(t.staff)
    : (t.owner || []).length ? 'phụ trách ' + ten(t.owner) : 'chưa có nhân sự');
  const canXuLy = [];
  choDuyet.slice(0, 6).forEach((t) => canXuLy.push({
    id: t.id,
    muc: 'cao',
    tieuDe: t.title || '(không tên)',
    phu: 'Chờ duyệt · ' + gio(t) + ' · ' + aiDo(t),
    the: (t.transport || []).slice(0, 2).map(nhan).filter(Boolean),
  }));
  // lịch có nguy cơ: đưa thẳng lên danh sách cần xử lý kèm lý do
  nguyCo.slice(0, 6).forEach(({ t, r }) => {
    if (canXuLy.some((x) => x.id === t.id)) return;
    canXuLy.push({
      id: t.id,
      muc: r.muc,
      tieuDe: t.title || '(không tên)',
      phu: r.ly + ' · ' + gio(t) + ' · ' + aiDo(t),
      the: [nhan(t.status)].filter(Boolean),
    });
  });
  homNay.slice(0, 4).forEach((t) => {
    if (canXuLy.some((x) => x.id === t.id)) return;
    canXuLy.push({
      id: t.id,
      muc: 'thap',
      tieuDe: t.title || '(không tên)',
      phu: 'Hôm nay · ' + gio(t) + ' · ' + nhan(t.status),
      the: [],
    });
  });

  // Lịch chờ duyệt nằm ngoài khoảng lọc — không để bộ lọc che hàng đợi duyệt
  // Cả lịch chờ duyệt LẪN lịch có nguy cơ nằm ngoài khoảng lọc đều phải đếm,
  // nếu không bộ lọc tháng sẽ âm thầm che mất việc đang cháy của tháng trước.
  const ngoaiDs = m
    ? tatCa.filter((t) => !trongMoc(bd0(t), m) &&
        (t.status === 'Chờ duyệt/Xử lý' || lyDoNguyCo(t)))
    : [];
  const ngoai = ngoaiDs.length;

  return {
    the, canXuLy,
    tong: items.length,
    ngoaiKhoang: ngoai,
    ngoaiKhoangNhan: ngoai ? ngoai + ' lịch chờ duyệt / có nguy cơ ngoài khoảng lọc' : '',
    dongTrong: meta.blankRows || 0,
    nguoi: meta.me ? meta.me.name : '',
  };
}

/* ---------------- Quản lý quảng cáo ---------------- */
async function quangCao(mod, khoang, nguoi) {
  // App quảng cáo đã nhận from/to nên đưa thẳng khoảng lọc xuống nó tính,
  // không tự cộng lại ở hub (một định nghĩa chỉ số duy nhất nằm ở metrics.js).
  const q = khoang && khoang.tu && khoang.den
    ? '?from=' + encodeURIComponent(khoang.tu) + '&to=' + encodeURIComponent(khoang.den)
    : '?days=3650';
  const ov = await goiJson(mod, '/api/overview' + q);
  const k = ov.kpi || {};
  const d = ov.delta || {};
  const alerts = ov.alerts || [];
  const nang = alerts.filter((a) => a.level === 'high');

  const the = [
    { nhan: 'Chi tiêu', so: k.spend || 0, dinhDang: 'vnd', lech: d.spend },
    { nhan: 'Chuyển đổi', so: k.conversions || 0, dinhDang: 'so', lech: d.conversions },
    { nhan: 'CPA', so: k.cpa || 0, dinhDang: 'vnd', lech: d.cpa, dao: true },
    { nhan: 'ROAS', so: k.roas || 0, dinhDang: 'x', lech: d.roas },
    { nhan: 'CTR', so: k.ctr || 0, dinhDang: 'pt', lech: d.ctr },
    { nhan: 'Cảnh báo', so: alerts.length, dinhDang: 'so', tab: 'canh-bao',
      muc: nang.length ? 'cao' : alerts.length ? 'vua' : 'ok' },
  ];

  const canXuLy = alerts
    .filter((a) => a.level === 'high' || a.level === 'mid')
    .slice(0, 8)
    .map((a) => ({
      muc: a.level === 'high' ? 'cao' : 'vua',
      tieuDe: a.title,
      phu: a.detail || '',
      the: [],
    }));

  return {
    the,
    canXuLy,
    khoang: ov.range ? ov.range.from + ' → ' + ov.range.to : '',
  };
}

const BO_DOC = {
  'cong-viec': congViec,
  'lich-tac-nghiep': lichTacNghiep,
  'quang-cao': quangCao,
};

/* ---------------- cache + gom ---------------- */
const cache = new Map(); // "id|tu|den" -> { at, data }

/* Khoá cache mang cả khoảng lọc VÀ id người xem: chế độ chạy chung, mỗi người
 * thấy một phạm vi khác nhau — dùng chung cache là lộ dữ liệu của nhau. */
const khoa = (mod, k, nguoi) => mod.id + '|' + ((k && k.tu) || '') + '|' + ((k && k.den) || '') +
  '|' + ((nguoi && nguoi.id) || '');

async function doc(mod, khoang, nguoi) {
  const fn = BO_DOC[mod.kpi];
  if (!fn) return { ok: false, loi: '', khongCo: true };

  const kh = khoa(mod, khoang, nguoi);
  const c = cache.get(kh);
  if (c && c.data && Date.now() - c.at < cfg.kpiCacheMs) return { ...c.data, ok: true, luc: c.at };

  try {
    const data = await fn(mod, khoang, nguoi);
    cache.set(kh, { at: Date.now(), data });
    return { ...data, ok: true, luc: Date.now() };
  } catch (e) {
    const cu = cache.get(kh);
    if (cu && cu.data) return { ...cu.data, ok: true, cu: true, loi: e.message, luc: cu.at };
    return { ok: false, loi: e.message };
  }
}

/** Đọc song song chỉ số của mọi module đang bật, theo cùng một khoảng thời gian. */
async function tongQuan(mods, khoang, nguoi) {
  const ds = await Promise.all(mods.map(async (m) => ({ id: m.id, ...(await doc(m, khoang, nguoi)) })));
  const canXuLy = [];
  ds.forEach((r) => (r.canXuLy || []).forEach((v) => canXuLy.push({ ...v, module: r.id })));
  const uu = { cao: 0, vua: 1, thap: 2 };
  canXuLy.sort((a, b) => (uu[a.muc] ?? 3) - (uu[b.muc] ?? 3));
  const ngoai = ds.reduce((s, r) => s + (r.ngoaiKhoang || 0), 0);
  return {
    modules: ds,
    canXuLy: canXuLy.slice(0, 40),
    khoang: khoang && khoang.tu ? khoang : null,
    ngoaiKhoang: ngoai,
    luc: Date.now(),
  };
}

function xoaCache(id) {
  if (!id) return cache.clear();
  [...cache.keys()].filter((k) => k.split('|')[0] === id).forEach((k) => cache.delete(k));
}

module.exports = { doc, tongQuan, xoaCache, BO_DOC };
