'use strict';
/**
 * ============================================================================
 * PHÂN PHỐI CÔNG VIỆC — bộ luật chọn người
 * ============================================================================
 * Toàn bộ tệp này là hàm THUẦN: đưa vào danh sách việc + cấu hình, trả ra "giao
 * cho ai và vì sao". Không đọc Base, không ghi Base, không đọc đồng hồ hệ thống
 * (mốc `now` truyền vào). Nhờ vậy test được từng nước đi, và quan trọng hơn: cái
 * gì quyết định việc của người khác thì phải kiểm chứng được, không nằm lẫn
 * trong mã máy chủ.
 *
 * Ba cách chia, khai theo từng loại công việc:
 *
 *   'tai'    Tỷ lệ + cân tải  — mặc định. Nhìn số việc ĐANG MỞ của từng người
 *            rồi chọn người cách xa tỷ lệ của mình nhất. Ai nghỉ, ai đang đội
 *            việc thì việc tự dạt sang người khác, rồi tự cân lại sau.
 *   'luot'   Luân phiên theo tỷ lệ — cùng công thức nhưng đếm trên TỔNG LƯỢT đã
 *            giao (cả việc đã xong). Đúng tỷ lệ về lâu dài, không quan tâm ai
 *            đang rảnh.
 *   'it'     Ít việc nhất — bỏ tỷ lệ, chỉ xem ai đang ít việc mở nhất.
 *
 * Hai cách đầu dùng CHUNG một công thức, chỉ khác con số đếm — nên không thể
 * lệch nhau về logic.
 */

const MO_DONG = ['Hoàn thành', 'Hủy'];
const CACH = ['tai', 'luot', 'it'];
const CACH_NHAN = {
  tai: 'Tỷ lệ + cân tải',
  luot: 'Luân phiên theo tỷ lệ',
  it: 'Ít việc nhất',
};

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

const dong = (t) => MO_DONG.includes(nhan(t.status));
const chuaGiao = (t) => !(t.owner || []).length;

/**
 * Việc này có cần phân phối không?
 *
 * CHỈ những việc đang ở trạng thái yêu cầu mới ("Chờ tiếp nhận") — đó là cửa vào
 * của việc mới đặt. Việc chưa có chủ ở trạng thái khác thì là chuyện khác: đang
 * làm dở mà gỡ người ra, hoặc dữ liệu cũ thiếu — tự giao mấy cái đó là xen vào
 * việc quản lý đang xử lý tay.
 *
 * Danh sách trạng thái khai trong config (`phanPhoiTrangThai`) chứ không cắm
 * cứng ở đây, để đổi tên trạng thái trên Base thì sửa một chỗ.
 */
function canPhanPhoi(t, cauHinh) {
  if (dong(t) || !chuaGiao(t)) return false;
  const ds = (cauHinh && cauHinh.chung && cauHinh.chung.trangThai) || [];
  return !ds.length || ds.includes(nhan(t.status));
}
const loaiCua = (t) => nhan(t.workType);

/**
 * Đếm việc của từng người.
 * @param {'mo'|'tatCa'} pham  'mo' = chỉ việc đang mở; 'tatCa' = mọi lượt đã giao
 */
function demViec(tasks, loai, pham) {
  const d = new Map();
  for (const t of tasks || []) {
    if (loai && loaiCua(t) !== loai) continue;
    if (pham === 'mo' && dong(t)) continue;
    for (const u of t.owner || []) if (u && u.id) d.set(u.id, (d.get(u.id) || 0) + 1);
  }
  return d;
}

/**
 * Chọn một người trong nhóm ứng viên.
 *
 * @param {Array<{id,ten,trongSo}>} ung  ứng viên (trọng số 0 = tạm ngưng, bị loại)
 * @param {Map<string,number>} dem       số đếm hiện tại của từng người
 * @param {string} cach                  'tai' | 'luot' | 'it'
 * @returns {{id,ten,vi}|null}           vi = câu giải thích, để hiện ra và ghi sổ
 */
function chonNguoi(ung, dem, cach) {
  const ds = (ung || []).filter((x) => x && x.id && Number(x.trongSo) > 0);
  if (!ds.length) return null;
  const so = (id) => Number(dem.get(id) || 0);

  if (cach === 'it') {
    /* Không xét tỷ lệ. Bằng nhau thì lấy theo tên để hai lần chạy cùng dữ liệu
     * cho ra cùng kết quả — thứ tự mảng từ Base không đáng tin. */
    const sx = ds.slice().sort((a, b) => so(a.id) - so(b.id) ||
      String(a.ten).localeCompare(String(b.ten), 'vi'));
    const c = sx[0];
    return { id: c.id, ten: c.ten,
      vi: 'đang ít việc nhất trong nhóm (' + so(c.id) + ' việc mở)' };
  }

  /* 'tai' và 'luot': cùng công thức, khác con số đếm.
   * Chỉ tiêu của mỗi người = trọng số / tổng trọng số × (tổng đếm + 1).
   * Ai THIẾU nhiều nhất so với chỉ tiêu thì nhận. Cộng 1 vì đang chia việc mới. */
  const tongTS = ds.reduce((s, x) => s + Number(x.trongSo), 0);
  const tongDem = ds.reduce((s, x) => s + so(x.id), 0);
  const thieu = (x) => (Number(x.trongSo) / tongTS) * (tongDem + 1) - so(x.id);

  const sx = ds.slice().sort((a, b) => thieu(b) - thieu(a) ||
    so(a.id) - so(b.id) ||
    Number(b.trongSo) - Number(a.trongSo) ||
    String(a.ten).localeCompare(String(b.ten), 'vi'));
  const c = sx[0];
  const phanTram = Math.round((Number(c.trongSo) / tongTS) * 100);
  const dvi = cach === 'tai' ? 'việc mở' : 'lượt đã giao';
  return { id: c.id, ten: c.ten,
    vi: 'tỷ lệ ' + phanTram + '% nhưng đang giữ ' + so(c.id) + '/' + tongDem + ' ' + dvi +
      ' — thiếu nhất trong nhóm' };
}

/**
 * Đề xuất người nhận cho MỘT việc.
 * @returns {{loai, bat, cach, ung, chon, vi, khong}}  `khong` = lý do không đề xuất được
 */
function deXuat(task, tasks, cauHinh) {
  const loai = loaiCua(task);
  const luong = (cauHinh.luong || []).find((x) => x.loai === loai) || null;
  const ket = { loai, bat: !!(luong && luong.bat), cach: (luong && luong.cach) || 'tai', ung: [], chon: null, vi: '', khong: '' };

  if (!loai) { ket.khong = 'việc chưa điền Loại công việc — không biết giao cho nhóm nào'; return ket; }
  if (!luong) { ket.khong = 'loại "' + loai + '" chưa khai trong bảng phân phối'; return ket; }

  ket.ung = (cauHinh.nguoi || []).filter((x) => x.loai === loai);
  const song = ket.ung.filter((x) => Number(x.trongSo) > 0);
  if (!ket.ung.length) { ket.khong = 'loại "' + loai + '" chưa khai người nhận nào'; return ket; }
  if (!song.length) { ket.khong = 'cả nhóm "' + loai + '" đang tạm ngưng (trọng số 0)'; return ket; }

  const dem = demViec(tasks, loai, ket.cach === 'luot' ? 'tatCa' : 'mo');
  const c = chonNguoi(ket.ung, dem, ket.cach);
  if (!c) { ket.khong = 'không chọn được ai'; return ket; }
  ket.chon = { id: c.id, ten: c.ten };
  ket.vi = c.vi;
  return ket;
}

/**
 * Danh sách việc đang chờ phân công, kèm đề xuất và đồng hồ đếm ngược.
 *
 * @param {Map<string,number>} thayLuc  việc id -> mốc máy chủ THẤY nó lần đầu.
 *   Cố ý không dùng "ngày tạo" của bản ghi: bảng không có cột đó, và lark-cli
 *   không lấy được `created_time`. Máy chủ khởi động lại thì đồng hồ chạy lại từ
 *   đầu — hệ quả duy nhất là việc chờ thêm N phút, KHÔNG BAO GIỜ giao sai người.
 */
function dangCho(tasks, cauHinh, now, thayLuc) {
  const ds = [];
  for (const t of tasks || []) {
    if (!canPhanPhoi(t, cauHinh)) continue;
    const dx = deXuat(t, tasks, cauHinh);
    const tu = thayLuc && thayLuc.get(t.id);
    /* Mốc chờ khai theo TỪNG LOẠI: Website chỉ một người thì chờ 5 phút vô nghĩa,
     * còn Thiết kế thì nên chừa thời gian cho quản lý tự chọn. Không khai thì lấy
     * mốc chung, không có nữa thì 5 phút. */
    const luongCua = (cauHinh.luong || []).find((x) => x.loai === dx.loai);
    const phut = Number((luongCua && luongCua.phut) ||
      (cauHinh.chung && cauHinh.chung.phut) || 5);
    const conLai = tu ? Math.max(0, Math.ceil((tu + phut * 60000 - now) / 60000)) : phut;
    ds.push({
      id: t.id,
      tieuDe: t.title || '(chưa đặt tên)',
      loai: dx.loai,
      nguoiOrder: (t.requester || []).map((u) => u.name).filter(Boolean).join(', '),
      han: t.deadline || '',
      uuTien: nhan(t.priority),
      deXuat: dx.chon,
      vi: dx.vi,
      khong: dx.khong,
      tuDong: dx.bat && !!dx.chon && !!(cauHinh.chung && cauHinh.chung.bat),
      conLaiPhut: conLai,
      denHan: !!tu && now >= tu + phut * 60000,
    });
  }
  /* Việc gấp lên trước: sắp đến lượt tự giao xếp đầu, rồi tới hạn sớm hơn. */
  return ds.sort((a, b) => a.conLaiPhut - b.conLaiPhut ||
    (Date.parse(a.han || '') || Infinity) - (Date.parse(b.han || '') || Infinity));
}

/** Những việc ĐỦ ĐIỀU KIỆN tự giao ngay lúc này. */
function denLuotTuGiao(tasks, cauHinh, now, thayLuc) {
  return dangCho(tasks, cauHinh, now, thayLuc)
    .filter((x) => x.tuDong && x.denHan && x.deXuat);
}

/** Bảng tải hiện tại của cả phòng, để hiện trong trung tâm phân phối. */
function bangTai(tasks, cauHinh) {
  const ra = [];
  for (const l of cauHinh.luong || []) {
    const ung = (cauHinh.nguoi || []).filter((x) => x.loai === l.loai);
    const demMo = demViec(tasks, l.loai, 'mo');
    const demTat = demViec(tasks, l.loai, 'tatCa');
    const tongTS = ung.reduce((s, x) => s + Math.max(0, Number(x.trongSo) || 0), 0) || 1;
    const tongMo = ung.reduce((s, x) => s + Number(demMo.get(x.id) || 0), 0);
    ra.push({
      loai: l.loai, bat: !!l.bat, cach: l.cach || 'tai', cachNhan: CACH_NHAN[l.cach || 'tai'],
      tongMo,
      nguoi: ung.map((x) => ({
        id: x.id, ten: x.ten, trongSo: Number(x.trongSo) || 0,
        tyLe: Math.round((Math.max(0, Number(x.trongSo) || 0) / tongTS) * 100),
        dangMo: Number(demMo.get(x.id) || 0),
        thucTe: tongMo ? Math.round((Number(demMo.get(x.id) || 0) / tongMo) * 100) : 0,
        tongLuot: Number(demTat.get(x.id) || 0),
      })).sort((a, b) => b.trongSo - a.trongSo ||
        String(a.ten).localeCompare(String(b.ten), 'vi')),
    });
  }
  return ra;
}

module.exports = {
  CACH, CACH_NHAN, MO_DONG,
  nhan, dong, chuaGiao, loaiCua,
  canPhanPhoi, demViec, chonNguoi, deXuat, dangCho, denLuotTuGiao, bangTai,
};
