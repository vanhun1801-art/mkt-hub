'use strict';
/**
 * ============================================================================
 * HOÁN ĐỔI DEADLINE GIỮA HAI VIỆC → BÁO NGƯỜI ORDER
 * ============================================================================
 * Anh Hùng 05/11/2026: editor có lịch cố định, việc gấp không chen vào được.
 * Editor đang có A (hạn 02:00) và B (16:00), phát sinh C gấp (22:00): cho
 * editor HOÁN ĐỔI hạn của C và A — C nhận 02:00, A nhận 22:00. Hai mốc vẫn là
 * hai mốc cũ, chỉ đổi chủ, nên lịch editor không phình ra. Muốn một mốc MỚI
 * thì vẫn phải gửi Yêu cầu điều chỉnh như trước.
 *
 * Chỉ hoán đổi được giữa hai việc của chính mình, cùng loại công việc, còn
 * mở, và chưa qua hạn (đổi hạn đã qua là xoá dấu trễ).
 *
 * Chỗ ghi nhận là luồng Trao đổi của từng việc: máy chủ tự gửi một dòng mang
 * tên người đổi. Nhờ vậy dùng lại nguyên cơ chế tin chưa đọc đã có (bảng Trao
 * đổi · đã xem): thẻ của người order sáng như có tin mới; mỗi người một mốc đã
 * xem nên chỉ người order tự tắt được cờ của mình; đổi nhiều lần thì nhiều
 * dòng, vẫn một lần sáng. Không thêm cột Base nào.
 */

const HD_LUI = 'Hoán đổi deadline, lùi hạn';
const HD_SOM = 'Hoán đổi deadline, lên sớm';
const DOI_DL = 'Đổi deadline';
const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const LECH_VN = 7 * 3600000;
const p2 = (n) => String(n).padStart(2, '0');

/** Mốc giờ → ms. Chuỗi không kèm múi giờ (Base ghi "YYYY-MM-DD HH:MM:SS") là giờ VN. */
function msVN(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(\d{4}-\d\d-\d\d)(?:[ T](\d\d:\d\d(?::\d\d)?))?$/.exec(s);
  const t = m ? Date.parse(m[1] + 'T' + (m[2] || '00:00') + '+07:00') : Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/** "08:00 T3 10/11" theo giờ VN. */
function nhanGio(v) {
  const ms = msVN(v);
  if (!ms) return 'chưa có';
  const d = new Date(ms + LECH_VN);
  return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ' ' + THU[d.getUTCDay()] + ' ' +
    p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1);
}

/** Lý do không hoán đổi được A với B; được thì ''. */
function chanHoanDoi(a, b, meId, now, dong) {
  if (!a || !b) return 'Không tìm thấy việc.';
  if (a.id === b.id) return 'Chọn một việc khác.';
  const cuaToi = (t) => [...(t.owner || []), ...(t.helper || [])].some((u) => u && u.id === meId);
  if (!cuaToi(a) || !cuaToi(b)) return 'Chỉ hoán đổi được giữa hai việc của chính bạn.';
  if ((a.workType || '') !== (b.workType || '')) return 'Chỉ hoán đổi được hai việc cùng loại công việc.';
  if (dong.includes(a.status) || dong.includes(b.status)) return 'Việc đã đóng thì không hoán đổi.';
  const ha = msVN(a.deadline1), hb = msVN(b.deadline1);
  if (!ha || !hb) return 'Cả hai việc phải có deadline.';
  if (ha === hb) return 'Hai việc cùng deadline, không cần hoán đổi.';
  if (ha < now || hb < now) return 'Việc đã qua deadline thì không hoán đổi.';
  return '';
}

/** Dòng ghi vào Trao đổi của việc `t` sau khi nhận hạn của việc `voi`. */
function tinHoanDoi(t, voi) {
  const lui = msVN(voi.deadline1) > msVN(t.deadline1);
  return (lui ? HD_LUI : HD_SOM) + ': ' + nhanGio(t.deadline1) + ' → ' + nhanGio(voi.deadline1) +
    '. Đổi chỗ với "' + (voi.title || '(chưa có tên)') + '".';
}

/** Người order hoặc quản lý sửa thẳng deadline (sau Yêu cầu điều chỉnh): ghi lại cho người làm. */
function tinDoiDeadline(truoc, body) {
  if (!('deadline1' in body) || msVN(body.deadline1) === msVN(truoc.deadline1)) return null;
  return DOI_DL + ': ' + nhanGio(truoc.deadline1) + ' → ' + nhanGio(body.deadline1);
}

/** Loại của một tin Trao đổi: 'lui' | 'som' | 'deadline' | ''. */
function loaiTin(noiDung) {
  const s = String(noiDung || '');
  return s.startsWith(HD_LUI) ? 'lui' : s.startsWith(HD_SOM) ? 'som' : s.startsWith(DOI_DL) ? 'deadline' : '';
}

/** Nhiều tin chưa đọc: loại nặng hơn thắng (sáng đỏ không bị sáng xanh đè). */
const NANG = { '': 0, som: 1, lui: 2, deadline: 2 };
const nangHon = (cu, moi) => (NANG[moi] > NANG[cu || ''] ? moi : cu);

module.exports = { msVN, nhanGio, chanHoanDoi, tinHoanDoi, tinDoiDeadline, loaiTin, nangHon };
