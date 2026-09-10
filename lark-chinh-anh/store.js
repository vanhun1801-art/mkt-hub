'use strict';
/**
 * Tầng đọc/ghi Lark Base cho app Chỉnh ảnh & Edit video.
 *
 * Ba nguyên tắc chép lại từ app quảng cáo / Social, vì đã trả giá để học:
 *
 *  1. Đọc/ghi bằng FIELD ID, không theo tên cột. Tên cột trên Base bị đổi là
 *     chuyện thường; field ID thì không đổi.
 *
 *  2. Không nhờ formula/rollup của Lark tính tổng. Mọi con số hiển thị đều cộng
 *     lại từ dòng thô trong JS, nên lọc được theo bất kỳ khoảng ngày nào.
 *
 *  3. Bảng Báo cáo có cột "⚙️ Khoá" (tour|loại|ngày). Nhân sự báo cáo lại cùng
 *     một lô việc thì ĐÈ đúng dòng cũ, không đẻ dòng trùng — nếu không, một tour
 *     báo hai lần là mọi con số đếm gấp đôi mà nhìn bảng không thấy gì bất thường.
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
const multi = (v) => (Array.isArray(v) ? v.map(txt).filter(Boolean) : (txt(v) ? [txt(v)] : []));
const links = (v) => (Array.isArray(v) ? v.map((x) => (x && x.id) || '').filter(Boolean) : []);
const users = (v) => (Array.isArray(v) ? v.map((u) => ({ id: u.id, name: u.name || u.id })) : []);
const bool = (v) => v === true || v === 'true' || v === 1;
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

/** Giá trị datetime của Base → 'YYYY-MM-DD HH:mm' theo giờ base. */
function toPhut(v) {
  if (!v) return '';
  const t = typeof v === 'number' ? v : Date.parse(txt(v));
  if (!Number.isFinite(t)) return '';
  return new Date(t + TZ).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * 'YYYY-MM-DD' → chuỗi datetime ghi vào Base.
 *
 * Base này tạo với time_zone Asia/Shanghai. Lark hiểu chuỗi trần
 * "2026-09-10 00:00:00" theo MÚI GIỜ CỦA BASE, nên chỉ cần ghép " 00:00:00",
 * KHÔNG quy đổi sang UTC. Đổi thành quy đổi UTC thì mọi dòng lùi đúng một ngày —
 * sai lệch câm, vì bảng vẫn đầy số trông rất hợp lý. Xem memory lark-base-ghi-ngay.
 */
function ngayVeBase(key) {
  return String(key).slice(0, 10) + ' 00:00:00';
}

/** ISO (giờ UTC) → chuỗi datetime giờ base. Phải cộng lệch trước, cùng lý do trên. */
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

/* ---------------- đọc từng dòng ---------------- */
function docTour(r) {
  const f = T.tour.f;
  return {
    id: r.id,
    ten: clean(r.c[f.name]),
    drive: url(r.c[f.drive]),
    nhom: sel(r.c[f.group]),
    thuTu: num(r.c[f.order]),
    dung: bool(r.c[f.active]),
    ghiChu: clean(r.c[f.note]),
  };
}

function docBaoCao(r) {
  const f = T.baoCao.f;
  return {
    id: r.id,
    thuMuc: clean(r.c[f.folder]),
    khoa: clean(r.c[f.key]),
    ngay: toKey(r.c[f.date]),
    tourIds: links(r.c[f.tour]),
    tour: clean(r.c[f.tourName]),
    loai: sel(r.c[f.kind]),
    hangMuc: multi(r.c[f.items]),
    linkAnh: url(r.c[f.linkPhoto]),
    linkVideo: url(r.c[f.linkVideo]),
    soAnh: num(r.c[f.nPhoto]),
    soVideo: num(r.c[f.nVideo]),
    nguoiLam: users(r.c[f.doer]),
    ghiChu: clean(r.c[f.note]),
    trangThai: sel(r.c[f.status]) || 'Chờ nghiệm thu',
    nguoiNghiemThu: users(r.c[f.judge])[0] || null,
    nghiemThuLuc: toPhut(r.c[f.judgedAt]),
    nhanXet: clean(r.c[f.judgeNote]),
    daGui: bool(r.c[f.sent]),
    guiLuc: toPhut(r.c[f.sentAt]),
    taoLuc: toPhut(r.c[f.createdAt]),
  };
}

/* ---------------- tải (có cache ngắn) ---------------- */
let cache = null;
let dangTai = null;

async function tai(moi = false) {
  if (!moi && cache && Date.now() - cache.t < cfg.cacheTtlMs) return cache.d;
  if (dangTai) return dangTai;          // nhiều tab F5 cùng lúc → một lượt đọc
  dangTai = (async () => {
    const [tours, baoCao, caiDat] = await Promise.all([
      lark.listAll(T.tour.id),
      lark.listAll(T.baoCao.id),
      lark.listAll(T.caiDat.id),
    ]);
    const d = {
      tours: tours.map(docTour)
        .filter((t) => t.ten)
        .sort((a, b) => (a.thuTu || 999) - (b.thuTu || 999) || a.ten.localeCompare(b.ten)),
      baoCao: baoCao.map(docBaoCao)
        .filter((b) => b.thuMuc || b.khoa)
        .sort((a, b) => String(b.ngay).localeCompare(String(a.ngay))
          || String(b.taoLuc).localeCompare(String(a.taoLuc))),
      caiDat: Object.fromEntries(caiDat
        .map((r) => [clean(r.c[T.caiDat.f.key]), clean(r.c[T.caiDat.f.value])])
        .filter(([k]) => k)),
      luc: new Date().toISOString(),
    };
    cache = { t: Date.now(), d };
    return d;
  })().finally(() => { dangTai = null; });
  return dangTai;
}

const xoaCache = () => { cache = null; };

/* ---------------- ghi ---------------- */

/**
 * Ghi một báo cáo. Có `id` thì sửa dòng đó; không thì tìm theo khoá, thấy thì đè,
 * không thấy thì tạo mới. Trả { id, moi } để giao diện nói đúng "đã ghi" hay
 * "đã cập nhật báo cáo cũ".
 */
async function ghiBaoCao(ban) {
  const f = T.baoCao.f;
  const fields = {};
  const dat = (k, v) => { if (v !== undefined) fields[k] = v; };

  dat(f.folder, ban.thuMuc);
  dat(f.key, ban.khoa);
  if (ban.ngay) dat(f.date, ngayVeBase(ban.ngay));
  if (ban.tourId) dat(f.tour, [{ id: ban.tourId }]);
  dat(f.tourName, ban.tour);
  if (ban.loai) dat(f.kind, ban.loai);
  if (ban.hangMuc) dat(f.items, ban.hangMuc);
  dat(f.linkPhoto, ban.linkAnh);
  dat(f.linkVideo, ban.linkVideo);
  if (ban.soAnh != null && ban.soAnh !== '') dat(f.nPhoto, num(ban.soAnh));
  if (ban.soVideo != null && ban.soVideo !== '') dat(f.nVideo, num(ban.soVideo));
  if (ban.nguoiLamIds) dat(f.doer, ban.nguoiLamIds.map((id) => ({ id })));
  dat(f.note, ban.ghiChu);
  if (ban.trangThai) dat(f.status, ban.trangThai);

  let id = ban.id || '';
  let moi = false;
  if (!id && ban.khoa) {
    const cu = await lark.listAll(T.baoCao.id);
    const co = cu.find((r) => clean(r.c[f.key]) === ban.khoa);
    if (co) id = co.id;
  }
  if (id) await lark.updateRecord(T.baoCao.id, id, fields);
  else { id = await lark.createRecord(T.baoCao.id, fields); moi = true; }
  xoaCache();
  return { id, moi };
}

/**
 * Đánh dấu đã gửi nhóm — nhận MỘT id hoặc MẢNG id.
 *
 * Mảng vì một tin gộp nhiều lô (một lần báo cáo nhiều mục): gửi xong mà chỉ đóng
 * dấu cho lô đầu thì mấy lô còn lại vẫn hiện "chưa gửi" trong khi nhóm đã nhận tin,
 * và người ta bấm Gửi nhóm lần nữa → nhóm nhận trùng.
 *
 * Tách riêng khỏi ghiBaoCao() vì gửi tin và ghi báo cáo là hai việc khác nhau:
 * ghi thành công mà gửi thất bại là chuyện bình thường và phải thấy được.
 */
async function danhDauDaGui(id) {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  if (!ids.length) return 0;
  const f = T.baoCao.f;
  const luc = gioVeBase(new Date().toISOString());
  const map = {};
  ids.forEach((x) => { map[x] = { [f.sent]: true, [f.sentAt]: luc }; });
  await lark.updateMany(T.baoCao.id, map);
  xoaCache();
  return ids.length;
}

/** Nghiệm thu: Đạt hoặc Cần sửa lại, kèm người và nhận xét. */
async function nghiemThu(id, { trangThai, nhanXet, nguoiId }) {
  const f = T.baoCao.f;
  const fields = {
    [f.status]: trangThai,
    [f.judgedAt]: gioVeBase(new Date().toISOString()),
    [f.judgeNote]: String(nhanXet || ''),
  };
  if (nguoiId) fields[f.judge] = [{ id: nguoiId }];
  await lark.updateRecord(T.baoCao.id, id, fields);
  xoaCache();
  return { id };
}

/** Một dòng nhật ký gửi tin. Lỗi ở đây KHÔNG được làm hỏng việc gửi/ghi báo cáo. */
async function ghiNhatKy(ban) {
  const f = T.nhatKy.f;
  try {
    const fields = {
      [f.at]: new Date().toISOString(),
      [f.chat]: String(ban.chat || ''),
      [f.result]: ban.ok ? 'Thành công' : 'Thất bại',
      [f.msgId]: String(ban.msgId || ''),
      [f.content]: String(ban.noiDung || '').slice(0, 2000),
      [f.message]: String(ban.thongBao || '').slice(0, 1000),
    };
    if (ban.baoCaoId) fields[f.report] = [{ id: ban.baoCaoId }];
    await lark.createRecord(T.nhatKy.id, fields);
    xoaCache();
  } catch (e) {
    console.warn('[store] không ghi được nhật ký: ' + e.message);
  }
}

/** Lưu một cài đặt (nhóm chat…). Có dòng cùng khoá thì đè. */
async function ghiCaiDat(khoa, giaTri, ghiChu) {
  const f = T.caiDat.f;
  const cu = await lark.listAll(T.caiDat.id);
  const co = cu.find((r) => clean(r.c[f.key]) === khoa);
  const fields = { [f.key]: khoa, [f.value]: String(giaTri == null ? '' : giaTri) };
  if (ghiChu != null) fields[f.note] = String(ghiChu);
  if (co) await lark.updateRecord(T.caiDat.id, co.id, fields);
  else await lark.createRecord(T.caiDat.id, fields);
  xoaCache();
}

/** Thêm/sửa một Tour trong danh mục. */
async function ghiTour(ban) {
  const f = T.tour.f;
  const fields = {};
  if (ban.ten) fields[f.name] = ban.ten;
  if (ban.drive != null) fields[f.drive] = ban.drive;
  if (ban.nhom) fields[f.group] = ban.nhom;
  if (ban.thuTu != null && ban.thuTu !== '') fields[f.order] = num(ban.thuTu);
  if (ban.dung != null) fields[f.active] = !!ban.dung;
  if (ban.ghiChu != null) fields[f.note] = ban.ghiChu;
  if (!Object.keys(fields).length) throw Object.assign(new Error('Không có gì để ghi'), { code: 400 });
  let id = ban.id;
  if (id) await lark.updateRecord(T.tour.id, id, fields);
  else id = await lark.createRecord(T.tour.id, fields);
  xoaCache();
  return { id };
}

module.exports = {
  tai, xoaCache, ghiBaoCao, danhDauDaGui, nghiemThu, ghiNhatKy, ghiCaiDat, ghiTour,
  ngayVeBase, gioVeBase, toKey, toPhut, homNay, themNgay, num, clean,
};
