'use strict';
/**
 * ============================================================================
 * BUỔI TÁC NGHIỆP ĐÃ BÁO CÁO — lấy từ Base "Lịch tác nghiệp"
 * ============================================================================
 * Anh Hùng (03/10/2026): "sau mỗi buổi đi, nhân sự điền báo cáo tác nghiệp. Đi
 * tác nghiệp xong mà thấy không khoẻ thì chỉ cần báo cáo tác nghiệp là đủ,
 * không cần báo cáo ngày — đừng ghi nhận là không có báo cáo."
 *
 * Nên ngày nào một người có buổi tác nghiệp ĐÃ NỘP BÁO CÁO SAU CHUYẾN thì ngày
 * đó coi như đã có báo cáo: không vào danh sách "ngày chưa nộp", không kéo điểm
 * xuống, không để AI viết "thiếu ngày này".
 *
 * ---------------------------------------------------------------------------
 * GHÉP NGƯỜI BẰNG TÊN, KHÔNG BẰNG open_id
 *
 * Ô "Nhân sự"/"Phụ trách" bên Lịch tác nghiệp là ô người của Lark, mang id do
 * app TẠO RA dòng đó cấp. Dòng cũ còn mang id của app cũ (đã đo: Khánh là
 * ou_6699b11a… bên đó, ou_a3582c… bên Báo cáo) — so id là trượt sạch những
 * dòng cũ. Nên ghép theo tên đã bỏ dấu, kèm mẹo "Nguyễn Long Khánh" ↔ "Nguyễn
 * Long Khánh (Pinky)" y như lich-lam.js.
 *
 * ---------------------------------------------------------------------------
 * THẾ NÀO LÀ "ĐÃ BÁO CÁO"
 *
 * Chỉ cần ô "Báo cáo sau tác nghiệp" có chữ. KHÔNG đòi đủ cả chi phí thực tế
 * như luật nghiệm thu bên app kia: ở đây câu hỏi chỉ là "hôm đó người này có
 * báo cáo gì không", chứ không phải "buổi đó đã nghiệm thu xong chưa". Buổi bị
 * huỷ hoặc bị từ chối thì không tính — không đi thì không có gì để báo.
 */
const cfg = require('./config');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const T = cfg.tacNghiep;
/* Trạng thái coi như KHÔNG đi: có ghi báo cáo cũng không tính thay báo cáo ngày. */
const BO = ['Hủy lịch', 'Huỷ lịch', 'Từ chối'];

const txt = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(', ');
  if (typeof v === 'object') return v.text || v.name || v.en_name || '';
  return String(v);
};
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

/** 00:00 giờ VN của ngày chứa mốc. Giữ cùng quy ước với ky.js. */
const VN = 7 * 3600000;
const NGAY = 86400000;
const dauNgay = (ms) => Math.floor((Number(ms) + VN) / NGAY) * NGAY - VN;

let dem = { luc: 0, ds: null };

/** [{ ngay: <ms đầu ngày>, ten: [...tên người], coBaoCao: bool, tieuDe }] */
async function docHet(moi) {
  if (!moi && dem.ds && Date.now() - dem.luc < 10 * 60000) return dem.ds;
  try {
    const f = await lark.listFields(T.table, T.base);
    const id = (ten) => { const x = f.find((y) => (y.field_name || y.name) === ten); return x && (x.field_id || x.id); };
    const iBatDau = id('Thời gian bắt đầu');
    const iNhanSu = id('Nhân sự');
    const iPhuTrach = id('Phụ trách');
    const iBaoCao = id('Báo cáo sau tác nghiệp');
    const iTrangThai = id('Trạng thái');
    const iTen = id('Tên hoạt động');
    if (!iBatDau || !iBaoCao) throw new Error('bảng thiếu cột Thời gian bắt đầu / Báo cáo sau tác nghiệp');

    const rows = await lark.listAllRecords(T.table, T.base);
    const ds = rows.map((r) => {
      const c = r.cells;
      const bd = Number(c[iBatDau]) || Date.parse(txt(c[iBatDau])) || 0;
      const nguoi = [txt(c[iNhanSu]), txt(c[iPhuTrach])].filter(Boolean).join(', ');
      return {
        ngay: bd ? dauNgay(bd) : 0,
        ten: nguoi.split(',').map((x) => boDau(x)).filter(Boolean),
        trangThai: txt(c[iTrangThai]).trim(),
        coBaoCao: !!txt(c[iBaoCao]).trim(),
        tieuDe: txt(c[iTen]).trim(),
      };
    }).filter((x) => x.ngay && x.ten.length);
    dem = { luc: Date.now(), ds };
    return ds;
  } catch (e) {
    console.error('[tác nghiệp] đọc Base hỏng: ' + e.message);
    return dem.ds || [];
  }
}

/** Những ngày (ms đầu ngày) người này có buổi tác nghiệp ĐÃ báo cáo. */
function ngayDaBaoCao(ds, nguoi) {
  const ten = boDau(nguoi && (nguoi.ten || nguoi.tenNguoi));
  if (!ten) return [];
  const khop = (x) => x.ten.some((t) => t === ten ||
    /* "Nguyễn Long Khánh" ↔ "Nguyễn Long Khánh (Pinky)", hai chiều */
    ten.startsWith(t + ' (') || t.startsWith(ten + ' ('));
  return [...new Set(ds.filter((x) => x.coBaoCao && !BO.includes(x.trangThai) && khop(x))
    .map((x) => x.ngay))];
}

/** Buổi tác nghiệp của người này trong một ngày — để màn hình nói rõ vì sao. */
function buoiTrongNgay(ds, nguoi, ms) {
  const d = dauNgay(ms);
  const ten = boDau(nguoi && (nguoi.ten || nguoi.tenNguoi));
  return ds.filter((x) => x.ngay === d && x.ten.some((t) => t === ten ||
    ten.startsWith(t + ' (') || t.startsWith(ten + ' (')));
}

module.exports = { docHet, ngayDaBaoCao, buoiTrongNgay, boDau };
