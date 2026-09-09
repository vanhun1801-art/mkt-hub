'use strict';
/**
 * KHO DỮ LIỆU — tạm thời đọc/ghi tệp JSON trên máy.
 *
 * Vì sao chưa dùng Lark Base như bốn app kia: giai đoạn này cần anh Hùng bấm thử
 * và đánh giá mô hình chấm điểm, chưa cần lưu chung. Đổi sang Base sau chỉ phải
 * thay đúng tệp này — server và bộ máy chấm không biết dữ liệu nằm ở đâu.
 *
 * Hai loại tệp:
 *   du-lieu/lich-su-2026.json  — 8 tháng nhập từ Excel (bộ luật + số liệu + điểm đã trả)
 *   du-lieu/sua-tay.json       — điểm chấm tay và bộ luật do người dùng sửa trên app
 */
const fs = require('fs');
const path = require('path');

const THU_MUC = path.join(__dirname, 'du-lieu');
const F_LICH_SU = path.join(THU_MUC, 'lich-su-2026.json');
const F_SUA = path.join(THU_MUC, 'sua-tay.json');

function docJson(f, macDinh) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return macDinh; }
}
function ghiJson(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 1), 'utf8');
}

/* Đọc lại mỗi lần gọi thay vì giữ trong RAM: tệp nhỏ, và sửa tay bên ngoài app
 * phải có hiệu lực ngay — đỡ phải nhớ khởi động lại. */
const lichSu = () => docJson(F_LICH_SU, { thang: {} });
const suaTay = () => docJson(F_SUA, { thang: {} });

/** Danh sách tháng có dữ liệu, mới nhất trước. */
function danhSachThang() {
  return Object.keys(lichSu().thang).sort().reverse();
}

/**
 * Gộp bản gốc với phần người dùng đã sửa trên app.
 * Bản gốc (nhập từ Excel) không bao giờ bị ghi đè — sửa gì cũng nằm ở tệp riêng,
 * nên luôn quay về được số gốc để đối chiếu.
 */
function thang(th) {
  const goc = lichSu().thang[th];
  if (!goc) return null;
  const sua = suaTay().thang[th] || {};
  return {
    thang: th,
    luat: sua.luat || goc.luat,
    daSuaLuat: !!sua.luat,
    luatGoc: goc.luat,
    soLieu: Object.assign({}, goc.soLieu, sua.soLieu || {}),
    chamTay: gopChamTay(goc.chamTay, sua.chamTay),
    daTraLuong: goc.daTraLuong || {},
    boQuaKhiNhap: goc.boQuaKhiNhap || [],
    chot: sua.chot || null,
    nhatKySo: sua.nhatKySo || [],
    coSoLieuMoi: !!(sua.soLieu && Object.keys(sua.soLieu).length),
  };
}

function gopChamTay(a, b) {
  const ra = {};
  Object.keys(Object.assign({}, a, b)).forEach((ng) => {
    ra[ng] = Object.assign({}, (a || {})[ng], (b || {})[ng]);
  });
  return ra;
}

/** Ghi một điểm chấm tay. Không đụng vào tệp gốc. */
function luuChamTay(th, maNguoi, maTieuChi, diem) {
  const s = suaTay();
  const t = s.thang[th] || (s.thang[th] = {});
  const c = t.chamTay || (t.chamTay = {});
  const ng = c[maNguoi] || (c[maNguoi] = {});
  if (diem === null || diem === '' || diem === undefined) delete ng[maTieuChi];
  else ng[maTieuChi] = Number(diem);
  ghiJson(F_SUA, s);
  return true;
}

/**
 * Ghi số liệu đổ về / tải lên cho một tháng.
 * Không đụng bản gốc: số mới nằm ở tệp sửa và đè lên bản gốc khi đọc, nên luôn
 * quay lại được số ban đầu nếu đổ nhầm.
 * @param nguon nhãn cho biết số này ở đâu ra ('app' | 'file' | 'tay')
 */
function luuSoLieu(th, soLieu, nguon) {
  const s = suaTay();
  const t = s.thang[th] || (s.thang[th] = {});
  t.soLieu = Object.assign({}, t.soLieu, soLieu || {});
  const g = t.nhatKySo || (t.nhatKySo = []);
  g.unshift({ luc: Date.now(), nguon: nguon || 'tay', so: Object.keys(soLieu || {}).length });
  t.nhatKySo = g.slice(0, 20);
  ghiJson(F_SUA, s);
  return Object.keys(soLieu || {}).length;
}

/** Bỏ toàn bộ số liệu đã đổ về, quay lại bản gốc. */
function boSoLieu(th) {
  const s = suaTay();
  if (s.thang[th]) { delete s.thang[th].soLieu; delete s.thang[th].nhatKySo; ghiJson(F_SUA, s); }
  return true;
}

/** Ghi đè bộ luật của một tháng (dùng khi lưu kết quả thử luật). */
function luuLuat(th, luat) {
  const s = suaTay();
  const t = s.thang[th] || (s.thang[th] = {});
  t.luat = luat;
  ghiJson(F_SUA, s);
  return true;
}

/** Trả bộ luật của tháng về đúng bản nhập từ Excel. */
function boSuaLuat(th) {
  const s = suaTay();
  if (s.thang[th]) { delete s.thang[th].luat; ghiJson(F_SUA, s); }
  return true;
}

/**
 * Chốt tháng: đóng băng bản chụp. Sau khi chốt, tính lại không đổi được số đã
 * chốt — đây đúng là thứ file Excel không có, nên một tháng đã trả lương vẫn có
 * thể âm thầm đổi số khi ai đó sửa công thức phía trên.
 */
function chot(th, banChup, boi) {
  const s = suaTay();
  const t = s.thang[th] || (s.thang[th] = {});
  t.chot = { luc: Date.now(), boi: boi || '', banChup };
  ghiJson(F_SUA, s);
  return t.chot;
}
function boChot(th) {
  const s = suaTay();
  if (s.thang[th]) { delete s.thang[th].chot; ghiJson(F_SUA, s); }
  return true;
}

module.exports = {
  THU_MUC, F_LICH_SU, F_SUA,
  danhSachThang, thang, luuChamTay, luuLuat, boSuaLuat, chot, boChot,
  luuSoLieu, boSoLieu,
  coLichSu: () => fs.existsSync(F_LICH_SU),
};
