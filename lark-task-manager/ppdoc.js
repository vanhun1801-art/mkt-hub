'use strict';
/**
 * ============================================================================
 * ĐỌC / GHI CẤU HÌNH PHÂN PHỐI (hai bảng trên Base)
 * ============================================================================
 * Tách khỏi `phanphoi.js` một cách cố ý: tệp kia là BỘ LUẬT (hàm thuần, test
 * được từng nước đi), tệp này là ĐƯỜNG RA BASE (có mạng, có cache, có lỗi). Trộn
 * hai thứ lại thì bộ luật không còn test được mà không dựng cả Base.
 *
 * Ô của bản ghi Base khoá bằng FIELD_ID, không phải tên cột — nên phải đọc danh
 * sách cột trước để dựng bảng tra tên → id. Hai bảng này do lark-cli tạo nên id
 * không cố định giữa các môi trường, khai cứng là gãy khi dựng lại Base.
 */
const cfg = require('./config');
const lark = require('./lark');
const PP = require('./phanphoi');

const SONG = 60000;               // giữ cấu hình 60 giây, sửa trên Base là thấy ngay
let dem = { luc: 0, ch: null };

const asText = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.text || v.name || v.link || '');
  return String(v);
};
const asUsers = (v) => (Array.isArray(v) ? v.filter((x) => x && x.id) : []);
const asSo = (v) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : null;
};

/** Bảng tra tên cột -> field_id cho một bảng. */
async function idCua(tableId) {
  const fs = await lark.listFields(tableId);
  const m = {};
  for (const f of fs) {
    const ten = f.name || f.field_name;
    const id = f.id || f.field_id;
    if (ten && id) m[ten] = id;
  }
  return m;
}

/**
 * Đọc cả hai bảng, trả về đúng hình dáng mà `phanphoi.js` cần.
 * Lỗi mạng thì trả cấu hình RỖNG — nghĩa là không đề xuất, không tự giao. Fail
 * closed: thà không làm gì còn hơn giao việc dựa trên cấu hình đọc dở.
 */
async function docCauHinh(force) {
  if (!force && dem.ch && Date.now() - dem.luc < SONG) return dem.ch;
  try {
    const [idL, idN] = await Promise.all([
      idCua(cfg.luongTableId), idCua(cfg.phanNguoiTableId),
    ]);
    const [recL, recN] = await Promise.all([
      lark.listAllRecords(cfg.luongTableId), lark.listAllRecords(cfg.phanNguoiTableId),
    ]);
    const FL = cfg.luongFields;
    const FN = cfg.phanNguoiFields;

    const luong = recL.map((r) => {
      const lay = (k) => r.cells[idL[FL[k]]];
      const nhanCach = asText(lay('cach'));
      return {
        rec: r.record_id,
        loai: asText(lay('loai')).trim(),
        bat: lay('bat') === true,
        phut: asSo(lay('phut')) || 0,
        cach: cfg.cachChia[nhanCach] || 'tai',
        cachNhan: nhanCach,
        ghiChu: asText(lay('ghiChu')),
      };
    }).filter((x) => x.loai);

    const nguoi = [];
    for (const r of recN) {
      const lay = (k) => r.cells[idN[FN[k]]];
      const loai = asText(lay('loai')).trim();
      const us = asUsers(lay('nguoi'));
      if (!loai || !us.length) continue;
      /* Một dòng = một người. Ô "Người nhận" vẫn có thể chứa nhiều người nếu ai
       * đó gõ thêm trên Base — khi đó tách ra và CHIA ĐỀU trọng số, chứ không
       * nhân bản trọng số lên mấy lần. */
      const ts = asSo(lay('trongSo'));
      const chia = us.length > 1 ? (ts == null ? 1 : ts) / us.length : (ts == null ? 1 : ts);
      for (const u of us) {
        nguoi.push({ rec: r.record_id, loai, id: u.id, ten: u.name || u.id, trongSo: chia });
      }
    }

    dem = { luc: Date.now(), ch: { luong, nguoi, chung: { bat: true, phut: 5 }, docDuoc: true } };
  } catch (e) {
    console.warn('  [phân phối] không đọc được cấu hình, tạm KHÔNG phân phối: ' + e.message);
    dem = { luc: Date.now(), ch: { luong: [], nguoi: [], chung: { bat: false, phut: 5 }, docDuoc: false } };
  }
  return dem.ch;
}

const xoaCache = () => { dem = { luc: 0, ch: null }; };

/** Sửa một dòng bảng luồng. Chỉ nhận đúng bốn ô, không mở cửa cho ô khác. */
async function suaLuong(rec, patch) {
  const idL = await idCua(cfg.luongTableId);
  const FL = cfg.luongFields;
  const cells = {};
  if (typeof patch.bat === 'boolean') cells[idL[FL.bat]] = patch.bat;
  if (patch.phut != null) {
    const n = Math.max(0, Math.min(1440, Number(patch.phut) || 0));
    cells[idL[FL.phut]] = n;
  }
  if (patch.cach) {
    const nhan = Object.keys(cfg.cachChia).find((k) => cfg.cachChia[k] === patch.cach);
    if (!nhan) throw new Error('Cách chia không hợp lệ');
    cells[idL[FL.cach]] = nhan;
  }
  if (!Object.keys(cells).length) throw new Error('Không có gì để đổi');
  await lark.updateRecord(rec, cells, cfg.luongTableId);
  xoaCache();
}

/** Sửa trọng số của một người. 0 = tạm ngưng. */
async function suaTrongSo(rec, trongSo) {
  const idN = await idCua(cfg.phanNguoiTableId);
  const n = Math.max(0, Math.min(1000, Number(trongSo) || 0));
  await lark.updateRecord(rec, { [idN[cfg.phanNguoiFields.trongSo]]: n }, cfg.phanNguoiTableId);
  xoaCache();
}

/* ---------------- sổ ghi ----------------
 * 200 lượt gần nhất, giữ trong RAM. Cố ý KHÔNG ghi ra tệp (ổ đĩa Render là tạm)
 * và cũng chưa ghi lên Base — sổ này để anh Hùng soi xem hệ thống đã giao gì,
 * đúng hay sai, trong lúc còn chưa tin nó. Mất sau khi deploy là chấp nhận được;
 * dấu vết thật của việc giao nằm ở chính cột "Phụ trách chính" trên Base.
 */
const SO = [];
function ghiSo(muc) {
  SO.push(Object.assign({ luc: Date.now() }, muc));
  if (SO.length > 200) SO.shift();
}
const docSo = () => SO.slice().reverse();

module.exports = {
  docCauHinh, xoaCache, suaLuong, suaTrongSo, ghiSo, docSo,
  // để test gọi trực tiếp
  asText, asSo, asUsers, PP,
};
