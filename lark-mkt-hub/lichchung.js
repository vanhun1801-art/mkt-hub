'use strict';
/**
 * Lịch chung: gộp việc của mọi base về một lưới NHÂN SỰ × NGÀY.
 *
 * Mục đích là thấy ngay ai đang bị dồn việc trong ngày nào, nên:
 *  - một việc có nhiều người thì đếm cho TỪNG người (đó mới là tải thật của họ);
 *  - việc chưa có người xếp vào hàng "Chưa phân công" — cũng là tải chưa ai gánh;
 *  - mỗi việc chỉ nằm ở MỘT ngày: công việc lấy deadline (ngày phải xong),
 *    lịch tác nghiệp lấy ngày bắt đầu (ngày thật sự phải có mặt).
 *
 * Hub không đọc Lark Base trực tiếp — vẫn gọi API của từng module như kpi.js.
 */
const cfg = require('./config');
const { goiJson } = require('./proxy');

const NGAY = 86400000;
const DONG = new Set(['Hoàn thành', 'Hủy']);
const LICH_DONG = new Set(['Đã hoàn tất', 'Từ chối', 'Hủy lịch']);

const ms = (v) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Date.parse(v) || 0);
const p2 = (n) => String(n).padStart(2, '0');

/** epoch ms -> 'YYYY-MM-DD' theo giờ địa phương của máy chạy hub. */
function ngayCua(t) {
  if (!t) return '';
  const d = new Date(t);
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}
const gioCua = (t) => (t ? p2(new Date(t).getHours()) + ':' + p2(new Date(t).getMinutes()) : '');

/** Bỏ emoji dẫn đầu của giá trị select trong Base ("🔴 Cao" -> "Cao"). */
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

const nguoiCua = (arr) => (arr || [])
  .filter((u) => u && (u.id || u.name))
  .map((u) => ({ id: u.id || u.name, name: u.name || u.id }));

/* ---------------- việc từ base "Bảng công việc" ---------------- */
async function tuCongViec(mod, tu, den, nguoi) {
  const ds = await goiJson(mod, '/api/tasks', { nguoi });
  const homNay = ngayCua(Date.now());
  const out = [];

  (ds.tasks || []).forEach((t) => {
    const khi = ms(t.deadline) || ms(t.startAt);
    const ngay = ngayCua(khi);
    if (!ngay || ngay < tu || ngay > den) return;

    const xong = DONG.has(t.status);
    const tre = !xong && ngay < homNay;
    out.push({
      id: t.id,
      module: mod.id,
      ngay,
      gio: ms(t.deadline) ? gioCua(ms(t.deadline)) : '',
      tieuDe: t.title || '(không tên)',
      trangThai: t.status || '',
      muc: tre ? 'cao' : xong ? 'xong' : ngay === homNay ? 'vua' : 'thap',
      the: [nhan(t.priority), nhan(t.workType)].filter(Boolean),
      chinh: nguoiCua(t.owner),
      hoTro: nguoiCua(t.helper),
    });
  });
  return out;
}

/* ---------------- việc từ base "Lịch tác nghiệp" ---------------- */
async function tuLichTacNghiep(mod, tu, den, nguoi) {
  const meta = await goiJson(mod, '/api/meta', { nguoi });
  const homNay = ngayCua(Date.now());
  const out = [];

  (meta.items || []).forEach((t) => {
    const khi = ms(t.start);
    const ngay = ngayCua(khi);
    if (!ngay || ngay < tu || ngay > den) return;

    const xong = LICH_DONG.has(t.status);
    const cho = t.status === 'Chờ duyệt/Xử lý';
    out.push({
      id: t.id,
      module: mod.id,
      ngay,
      gio: gioCua(khi),
      tieuDe: t.title || '(không tên)',
      trangThai: t.status || '',
      muc: cho ? 'cao' : xong ? 'xong' : ngay === homNay ? 'vua' : 'thap',
      the: (t.transport || []).slice(0, 2).map(nhan).filter(Boolean),
      // nhân sự đi tác nghiệp là tải thật; phụ trách chỉ đứng tên nếu chưa có nhân sự
      chinh: nguoiCua(t.staff).length ? nguoiCua(t.staff) : nguoiCua(t.owner),
      hoTro: nguoiCua(t.staff).length ? nguoiCua(t.owner) : [],
    });
  });
  return out;
}

const BO_DOC = {
  'cong-viec': tuCongViec,
  'lich-tac-nghiep': tuLichTacNghiep,
};

/* ---------------- gộp thành lưới người × ngày ---------------- */
const cache = new Map(); // "tu|den" -> { at, data }

async function lichChung(mods, tu, den, boQuaCache, nguoi) {
  // khoá cache có id người xem: mỗi người thấy phạm vi khác nhau, không được lẫn
  const kh = tu + '|' + den + '|' + ((nguoi && nguoi.id) || '');
  const c = cache.get(kh);
  if (!boQuaCache && c && Date.now() - c.at < cfg.kpiCacheMs) return { ...c.data, luc: c.at };

  const dsMod = mods.filter((m) => BO_DOC[m.kpi]);
  const ket = await Promise.all(dsMod.map(async (m) => {
    try {
      return { id: m.id, viec: await BO_DOC[m.kpi](m, tu, den, nguoi) };
    } catch (e) {
      return { id: m.id, viec: [], loi: e.message };
    }
  }));

  const viec = [];
  const loi = [];
  ket.forEach((r) => {
    viec.push(...r.viec);
    if (r.loi) loi.push({ module: r.id, loi: r.loi });
  });

  /* các ngày trong khoảng */
  const ngay = [];
  for (let t = Date.parse(tu + 'T00:00:00'); t <= Date.parse(den + 'T00:00:00'); t += NGAY) {
    ngay.push(ngayCua(t));
  }

  /* dòng theo người: mỗi việc tính cho từng người phụ trách */
  const dong = new Map();   // idNguoi -> { id, ten, o: Map(ngay -> [viec]), tong, chuaXong }
  const themVao = (ng, v, vai) => {
    const id = ng ? ng.id : '';
    if (!dong.has(id)) dong.set(id, { id, ten: ng ? ng.name : 'Chưa phân công', o: new Map(), tong: 0, gap: 0 });
    const r = dong.get(id);
    if (!r.o.has(v.ngay)) r.o.set(v.ngay, []);
    r.o.get(v.ngay).push({ ...v, vai });
    r.tong += 1;
    if (v.muc === 'cao') r.gap += 1;
  };

  viec.forEach((v) => {
    if (!v.chinh.length && !v.hoTro.length) return themVao(null, v, 'chinh');
    v.chinh.forEach((ng) => themVao(ng, v, 'chinh'));
    v.hoTro.forEach((ng) => themVao(ng, v, 'ho-tro'));
  });

  const hang = [...dong.values()].map((r) => ({
    id: r.id,
    ten: r.ten,
    tong: r.tong,
    gap: r.gap,
    // ngày nào nhiều việc nhất của người này — để biết đỉnh tải
    dinh: Math.max(0, ...[...r.o.values()].map((x) => x.length)),
    o: Object.fromEntries([...r.o.entries()].map(([k, v]) => [k, v])),
  }));

  // người bị dồn nhiều xếp trước; "Chưa phân công" luôn ở cuối
  hang.sort((a, b) => (a.id === '' ? 1 : b.id === '' ? -1 : 0) || b.tong - a.tong || a.ten.localeCompare(b.ten, 'vi'));

  /* Tải nhân sự là của ai người ấy xem. Nhân sự chỉ thấy ĐÚNG dòng của mình —
   * việc chung với người khác vẫn còn trong dòng của họ, nhưng không lộ tên và
   * khối lượng của đồng nghiệp. Quản lý (hoặc nhân sự được cấp "Xem toàn bộ")
   * thấy cả lưới. Cắt ở server, không phải ẩn trên giao diện. */
  const xemHet = !nguoi || nguoi.quanLy || nguoi.toanBo;
  const hangHien = xemHet ? hang : hang.filter((r) => r.id && r.id === nguoi.id);

  const theoNgay = Object.fromEntries(ngay.map((n) => [n, 0]));
  hangHien.forEach((r) => ngay.forEach((n) => { theoNgay[n] += (r.o[n] || []).length; }));

  const data = {
    tu, den, ngay, hang: hangHien, theoNgay,
    // đếm theo đúng phần được xem, nếu không dòng phụ đề nói một đằng lưới một nẻo
    tongViec: xemHet ? viec.length : hangHien.reduce((s, r) => s + r.tong, 0),
    tongLuot: hangHien.reduce((s, r) => s + r.tong, 0),
    chiMinh: !xemHet,
    loi,
  };
  cache.set(kh, { at: Date.now(), data });
  return { ...data, luc: Date.now() };
}

function xoaCache() { cache.clear(); }

module.exports = { lichChung, xoaCache, BO_DOC };
