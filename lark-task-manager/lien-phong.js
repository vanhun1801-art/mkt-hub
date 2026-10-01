'use strict';
/**
 * ============================================================================
 * Công việc LIÊN PHÒNG BAN — từ Base "Giao việc" của công ty
 * ============================================================================
 * Anh Hùng (01/10/2026): phòng khác đã có ứng dụng giao việc quy mô công ty.
 * "Không thay đổi cấu trúc hay bất kỳ thứ gì cái mình đang có, chỉ là đọc thêm,
 * và hiển thị một biểu tượng nhỏ: đây là công việc liên phòng ban."
 * Cùng ngày: "anh muốn thao tác như bình thường như base của mình vậy".
 *
 * Việc liên phòng được đổi sang đúng hình dạng một việc của app (title, owner,
 * deadline…) kèm cờ `lienPhong: true` — giao diện vẽ chung mọi chỗ, nhìn cờ để
 * gắn dấu nhỏ và khoá những gì Base công ty không có chỗ chứa.
 *
 * MỖI NGƯỜI NHẬN MỘT VIỆC. Anh Hùng: "chỉ có 1 người phụ trách thôi … tách cho
 * anh một task, chị Hân task nhé, không có chuyện phụ trách chính 2 người".
 * Base công ty giao MỘT bản ghi cho nhiều người và chỉ có MỘT ô trạng thái, nên
 * tiến độ riêng từng người cất ở bảng "Liên phòng · tiến độ" trong Base Tracking
 * của phòng (Claude tạo 01/10, chỉ thêm mới). Bản ghi công ty chỉ nhận phần TỔNG:
 *   - người đầu tiên bấm Bắt đầu làm      → "Đã tiếp nhận"
 *   - có người đã nộp, còn người chưa nộp  → "Đang xử lý"
 *   - mọi người nhận đều đã nộp            → "Đã gửi"
 *   - "Kết quả": link của từng người, mỗi người một dòng "Tên: link"
 *   - tệp sản phẩm: cột "File kết quả" (Claude THÊM cột này 01/10, chỉ thêm mới)
 * Không chép việc sang Base Tracking, không sửa cột nào khác của Base công ty.
 * Trao đổi lưu ở bảng Bình luận của phòng (cột "Việc liên phòng" = mã việc).
 *
 * Mã việc của từng người = record_id gốc + "x" + đuôi open_id — vẫn là chuỗi
 * chữ-số nên đi lọt mọi đường /api/tasks/rec… sẵn có.
 *
 * Nguồn: wiki CI6Qwe8wui9WDnkH0wMl5q9UgFe → Base I84sbcuSvaAp4Rs3IfGl3ytsgEe,
 * bảng tblZmSMkM0cll5KV ("Table" — Giao việc).
 */
const NGUON = {
  base: process.env.LIEN_PHONG_BASE || 'I84sbcuSvaAp4Rs3IfGl3ytsgEe',
  table: process.env.LIEN_PHONG_TABLE || 'tblZmSMkM0cll5KV',
  wiki: process.env.LIEN_PHONG_WIKI || 'CI6Qwe8wui9WDnkH0wMl5q9UgFe',
  host: process.env.LIEN_PHONG_HOST || 'https://rootytrip2.sg.larksuite.com',
  ten: 'Giao việc công ty',
};
/** Tắt hẳn bằng LIEN_PHONG=0 (ví dụ khi app trên Render chưa được cấp quyền Base đó). */
const bat = () => process.env.LIEN_PHONG !== '0';

const F = {
  noiDung: 'fldRtY9AEo', nguoiGiao: 'fldEAZY1zn', nguoiNhan: 'fldl4vSTu8',
  phongBan: 'fldmxbbGLS', trangThai: 'fldPpzKBDV', deadline: 'fldjFHFIT1',
  ngayGiao: 'fld7YCcc2b', uuTien: 'fldNUARMMo', ketQua: 'fldbyMBLCx',
  ghiChu: 'fldtvAR70r', links: 'fldz4LO48N', stt: 'fldTezZMHR', followUp: 'fldS5JrFW8',
  dinhKem: 'fldbc2PN8B', fileKetQua: 'fldQnkrqZu', capNhatCuoi: 'fldVsMY5la',
};
/* Tên cột để GHI (lệnh ghi của Base nhận tên cột). */
const TEN = {
  trangThai: 'Trạng thái', ketQua: 'Kết quả', ghiChu: 'Ghi chú/ hướng xử lý tiếp theo',
  fileKetQua: 'File kết quả', capNhatCuoi: 'Ngày cập nhật cuối',
};

/* Bảng tiến độ riêng từng người (Base Tracking của phòng). */
const TD = {
  table: process.env.LIEN_PHONG_TD_TABLE || 'tbljwz06ZoHAIJ6h',
  f: { maViec: 'fldKmvFR8I', maGoc: 'fldm6I04Mr', nguoi: 'fldGGKxUG4', trangThai: 'fld7W37UnR',
    link: 'fldAaWw4AB', ghiChu: 'flddTXef0r', luc: 'fldYfOwqyT' },
  ten: { maViec: 'Mã việc', maGoc: 'Mã gốc', nguoi: 'Người', trangThai: 'Trạng thái',
    link: 'Link kết quả', ghiChu: 'Ghi chú', luc: 'Cập nhật lúc' },
};

/* Trạng thái bên công ty → bộ trạng thái của app (để chia làn, đếm hạn).
 * Giữ nguyên chữ gốc ở `trangThaiGoc` cho người đọc. */
const TRANG_THAI = {
  'Chờ tiếp nhận': 'Chờ tiếp nhận',
  'Đã tiếp nhận': 'Đang tiến hành',
  'Đang xử lý': 'Đang tiến hành',
  /* "Đã gửi" = người nhận đã gửi kết quả, chờ người giao xem — đúng nghĩa
   * "Hoàn thành" (đã nộp, chờ nghiệm thu) của app. */
  'Đã gửi': 'Hoàn thành',
  'Hoàn thành': 'Hoàn thành',
  'Từ chối': 'Hủy',
};
const UU_TIEN = { 'Gấp': '🔴 Cao', 'Cao': '🔴 Cao', 'Trung bình': '🟡 Trung bình', 'Thấp': '🟢 Thấp' };

const chu = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : x && (x.text || x.name || x.link) || '')).join('');
  if (typeof v === 'object') return v.text || v.name || v.link || '';
  return String(v);
};
const motChon = (v) => chu(Array.isArray(v) ? v[0] : v);
const nguoi = (v) => (Array.isArray(v) ? v.filter(Boolean).map((u) => ({ id: u.id, name: u.name || u.en_name || u.id })) : []);
const tep = (v) => (Array.isArray(v) ? v.map((a) => ({ name: a.name, size: a.size, type: a.type, token: a.file_token || a.token || null })) : []);
const ngay = (v) => { const x = Array.isArray(v) ? v[0] : v; return x == null || x === '' ? null : (typeof x === 'number' ? new Date(x).toISOString() : String(x)); };

function linkBanGhi(recId) {
  return NGUON.host + '/wiki/' + NGUON.wiki + '?table=' + NGUON.table + '&record=' + encodeURIComponent(recId);
}

/** Một bản ghi Base công ty → dữ liệu chung của việc (chưa tách người). */
function sangViec(rec) {
  const c = rec.cells || {};
  const nd = chu(c[F.noiDung]).replace(/\r/g, '').trim();
  const dong = nd.split('\n');
  const tieuDe = (dong.shift() || '').trim() || '(việc liên phòng không tên)';
  const goc = motChon(c[F.trangThai]);
  const dl = ngay(c[F.deadline]);
  return {
    id: rec.record_id,
    lienPhong: true,
    nguonTen: NGUON.ten,
    nguonMa: chu(c[F.stt]),
    nguonUrl: linkBanGhi(rec.record_id),
    phongBan: motChon(c[F.phongBan]),
    trangThaiGoc: goc,
    title: tieuDe.slice(0, 300),
    detail: dong.join('\n').trim(),
    status: TRANG_THAI[goc] || 'Đang tiến hành',
    priority: UU_TIEN[motChon(c[F.uuTien])] || null,
    owner: nguoi(c[F.nguoiNhan]),
    helper: [],
    requester: nguoi(c[F.nguoiGiao]),
    startAt: ngay(c[F.ngayGiao]),
    deadline1: dl,
    deadline2: null,
    deadline: dl,
    link: chu(c[F.links]).trim(),
    /* "Kết quả" là ô chữ: người nhận dán link/kết quả vào đó — đóng vai Link kết quả. */
    linkKetQua: chu(c[F.ketQua]).trim(),
    ketQua: chu(c[F.ketQua]).trim(),
    note: [chu(c[F.ghiChu]).trim(), chu(c[F.followUp]).trim()].filter(Boolean).join('\n'),
    workType: '',
    campaign: null,
    channel: [],
    attachment: tep(c[F.dinhKem]),
    fileKetQua: tep(c[F.fileKetQua]),
  };
}

const maRieng = (recId, u) => recId + 'x' + String((u && u.id) || 'khuyet').replace(/[^A-Za-z0-9]/g, '').slice(-12);

function docDongTD(r) {
  const c = r.cells || {};
  return {
    rid: r.record_id,
    maViec: chu(c[TD.f.maViec]).trim(),
    trangThai: motChon(c[TD.f.trangThai]),
    link: chu(c[TD.f.link]).trim(),
    ghiChu: chu(c[TD.f.ghiChu]).trim(),
  };
}

/** Một bản ghi công ty + tiến độ riêng → các việc, MỖI NGƯỜI NHẬN MỘT VIỆC. */
function tachTheoNguoi(rec, tienDo) {
  const goc = sangViec(rec);
  const nhan = goc.owner.length ? goc.owner : [{ id: '', name: 'Chưa có người nhận' }];
  const mot = nhan.length === 1;
  return nhan.map((u) => {
    const id = maRieng(rec.record_id, u);
    const td = tienDo.get(id) || null;
    let status;
    if (goc.trangThaiGoc === 'Hoàn thành') status = 'Hoàn thành';
    else if (goc.trangThaiGoc === 'Từ chối') status = 'Hủy';
    else if (td && td.trangThai) status = td.trangThai;
    else if (mot) status = goc.status;                       // một người: theo ô công ty
    else status = goc.trangThaiGoc === 'Đã gửi' ? 'Hoàn thành' : 'Chờ tiếp nhận';
    return Object.assign({}, goc, {
      id,
      nguonRec: rec.record_id,
      owner: u.id ? [u] : [],
      tatCaNhan: nhan.filter((x) => x.id),
      dongNhan: mot ? [] : nhan.filter((x) => x.id && x.id !== u.id),
      status,
      /* Một người và chưa có dòng tiến độ: dùng Kết quả/Ghi chú của bản ghi công ty. */
      linkKetQua: td ? td.link : (mot ? goc.linkKetQua : ''),
      note: td ? td.ghiChu : (mot ? goc.note : ''),
      tdRid: td ? td.rid : null,
    });
  });
}

/* Đệm 60 giây: Base công ty đổi chậm, và app mở là gọi /api/tasks liên tục. */
const dem = { at: 0, ds: null, dang: null, loi: '' };

async function docHet(lark, force) {
  if (!bat()) return [];
  if (!force && dem.ds && Date.now() - dem.at < 60000) return dem.ds;
  if (dem.dang) return dem.dang;
  dem.dang = (async () => {
    try {
      const [rs, td] = await Promise.all([
        lark.listAllRecords(NGUON.table, NGUON.base),
        lark.listAllRecords(TD.table).catch(() => []),
      ]);
      const tienDo = new Map(td.map(docDongTD).filter((x) => x.maViec).map((x) => [x.maViec, x]));
      dem.ds = rs.flatMap((r) => tachTheoNguoi(r, tienDo));
      dem.loi = '';
    } catch (e) {
      /* Không đọc được (thiếu quyền, mạng): giữ bản cũ nếu có, app vẫn chạy bình
       * thường với việc của phòng — liên phòng chỉ là phần đọc thêm. */
      dem.loi = String((e && e.message) || e).split('\n')[0].slice(0, 200);
      if (!dem.ds) dem.ds = [];
      console.error('  [liên phòng] không đọc được Base Giao việc: ' + dem.loi);
    }
    dem.at = Date.now();
    return dem.ds;
  })().finally(() => { dem.dang = null; });
  return dem.dang;
}

/**
 * Việc liên phòng LIÊN QUAN tới phòng MKT: giao cho Phòng MKT, hoặc người nhận /
 * người giao là người đang làm việc trong Bảng công việc của phòng (có tên ở
 * Phụ trách chính / Người hỗ trợ của ít nhất một việc). Không lấy cả công ty —
 * việc nội bộ của phòng khác không phải chuyện của app này.
 */
function lienQuan(dsLP, viecPhong) {
  const nguoiPhong = new Set();
  for (const t of viecPhong) for (const u of [...(t.owner || []), ...(t.helper || [])]) if (u && u.id) nguoiPhong.add(u.id);
  return dsLP.filter((v) => v.phongBan === 'Phòng MKT' ||
    [...v.owner, ...v.requester].some((u) => u && nguoiPhong.has(u.id)));
}

/* ---------------- GHI ---------------- */
const quen = () => { dem.at = 0; };

/** Ghi bản ghi công ty. `o`: { trangThai, ketQua, ghiChu } (bỏ trống = không đụng). */
async function ghiCongTy(lark, recId, o, gioVN) {
  const cells = {};
  if (o.trangThai) cells[TEN.trangThai] = o.trangThai;
  if (o.ketQua != null) cells[TEN.ketQua] = String(o.ketQua);
  if (o.ghiChu != null) cells[TEN.ghiChu] = String(o.ghiChu);
  if (!Object.keys(cells).length) return;
  if (gioVN) cells[TEN.capNhatCuoi] = gioVN;
  await lark.updateRecord(recId, cells, NGUON.table, NGUON.base);
}

/** Thêm/sửa dòng tiến độ riêng của một việc (một người). */
async function ghiTienDo(lark, v, o, gioVN) {
  const cells = {};
  if (o.trangThai) cells[TD.ten.trangThai] = o.trangThai;
  if (o.link != null) cells[TD.ten.link] = String(o.link);
  if (o.ghiChu != null) cells[TD.ten.ghiChu] = String(o.ghiChu);
  if (gioVN) cells[TD.ten.luc] = gioVN;
  if (v.tdRid) return lark.updateRecord(v.tdRid, cells, TD.table);
  cells[TD.ten.maViec] = v.id;
  cells[TD.ten.maGoc] = v.nguonRec;
  if (v.owner[0] && v.owner[0].id) cells[TD.ten.nguoi] = [{ id: v.owner[0].id }];
  const kq = await lark.createRecord(cells, TD.table);
  const rid = kq && ((kq.record_id_list && kq.record_id_list[0]) ||
    (kq.data && kq.data.record_id_list && kq.data.record_id_list[0]));
  if (rid) v.tdRid = rid;
  return kq;
}

/** Sau mỗi lần ghi tiến độ: tính lại phần TỔNG rồi ghi vào bản ghi công ty. */
async function tongHopVeCongTy(lark, recId, gioVN, giuTrangThai) {
  quen();
  const ds = (await docHet(lark, true)).filter((x) => x.nguonRec === recId);
  if (!ds.length) return;
  const goc = ds[0].trangThaiGoc;
  if (goc === 'Hoàn thành' || goc === 'Từ chối') return;   // người giao đã chốt — không đụng
  const xong = ds.filter((x) => x.status === 'Hoàn thành').length;
  const batDau = ds.some((x) => x.status === 'Đang tiến hành' || x.status === 'Hoàn thành');
  let trangThai = null;
  if (xong === ds.length) trangThai = 'Đã gửi';
  else if (xong > 0) trangThai = 'Đang xử lý';
  else if (batDau && goc === 'Chờ tiếp nhận') trangThai = 'Đã tiếp nhận';
  const mot = ds.length === 1;
  const ketQua = mot ? ds[0].linkKetQua
    : ds.filter((x) => x.linkKetQua).map((x) => x.owner[0].name + ': ' + x.linkKetQua).join('\n');
  const ghiChu = mot ? ds[0].note
    : ds.filter((x) => x.note).map((x) => x.owner[0].name + ': ' + x.note).join('\n');
  await ghiCongTy(lark, recId, {
    trangThai: giuTrangThai ? null : trangThai,
    ketQua: ketQua || null,
    ghiChu: ghiChu || null,
  }, gioVN);
  quen();
}

/** Bắt đầu làm (một người). */
async function batDau(lark, v, gioVN) {
  await ghiTienDo(lark, v, { trangThai: 'Đang tiến hành' }, gioVN);
  await tongHopVeCongTy(lark, v.nguonRec, gioVN);
}
/** Nộp kết quả (một người): link + ghi chú (bỏ trống = giữ). */
async function nop(lark, v, o, gioVN) {
  await ghiTienDo(lark, v, { trangThai: 'Hoàn thành', link: o.link || undefined, ghiChu: o.ghiChu || undefined }, gioVN);
  await tongHopVeCongTy(lark, v.nguonRec, gioVN);
}
/**
 * Sửa link kết quả / ghi chú (tự lưu). `o.trangThai` ('Đang tiến hành' | 'Hoàn
 * thành') chỉ có khi bản đã lưu về Base phòng bị đổi trạng thái (trả Làm lại,
 * nộp lại) — lúc đó tính lại cả trạng thái TỔNG bên công ty.
 */
async function capNhat(lark, v, o, gioVN) {
  const tt = o.trangThai || (v.tdRid ? null : (v.status === 'Hoàn thành' || v.status === 'Đang tiến hành' ? v.status : null));
  await ghiTienDo(lark, v, { trangThai: tt, link: o.link, ghiChu: o.ghiChu }, gioVN);
  await tongHopVeCongTy(lark, v.nguonRec, gioVN, !o.trangThai);
}

const taiLen = async (lark, v, relPath) => {
  await lark.uploadAttachment(v.nguonRec, TEN.fileKetQua, relPath, NGUON.table, NGUON.base);
  quen();
};
const goTep = async (lark, v, token) => {
  await lark.removeAttachment(v.nguonRec, TEN.fileKetQua, token, NGUON.table, NGUON.base);
  quen();
};
const taiVe = (lark, v, token, slug) => lark.downloadAttachment(v.nguonRec, token, slug, NGUON.table, NGUON.base);
/** Tìm việc liên phòng theo mã (mã riêng từng người). */
async function tim(lark, id) { return (await docHet(lark)).find((v) => v.id === id) || null; }

module.exports = { docHet, lienQuan, sangViec, tachTheoNguoi, maRieng, NGUON, bat, loi: () => dem.loi,
  batDau, nop, capNhat, taiLen, goTep, taiVe, tim, quen };
