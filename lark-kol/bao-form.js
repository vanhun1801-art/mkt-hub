'use strict';
/**
 * Báo anh Hùng khi KOL gửi form thông tin (28/09/2026) — THẺ Lark bằng bot Marketing Hub
 * (lark-chung/gui-anh-hung.js: trong hub đi /_noi-bo/gui-tin, chạy lẻ trên máy đi bot lark-cli).
 *
 * Chờ 60 giây rồi mới gửi: form lưu thông tin trước, ảnh giấy tờ tải lên từng người sau đó —
 * gửi ngay thì thẻ luôn ghi "0 ảnh". KOL bấm gửi lại trong 60 giây thì gộp thành một thẻ.
 * Thẻ KHÔNG chứa số CCCD / hộ chiếu (tin Lark ai trong đoạn chat cũng đọc được) — chỉ tên,
 * nhóm khách, loại giấy tờ và đã có ảnh hay chưa; chi tiết mở trong app.
 */
const cho = new Map();   // id hợp tác → hẹn giờ

const urlHub = () => (process.env.PUBLIC_URL || process.env.HUB_URL || 'https://mkt-hub-w6hi.onrender.com').replace(/\/+$/, '');

function the(T, ht, kol, tv) {
  const khach = [ht.nguoiLon ? ht.nguoiLon + ' người lớn' : '', ht.treEm ? ht.treEm + ' trẻ em' : '', ht.emBe ? ht.emBe + ' em bé' : ''].filter(Boolean).join(' · ') || '—';
  const chuyen = ht.batDau ? T.ddmm(ht.batDau) + (ht.ketThuc && T.ddmm(ht.ketThuc) !== T.ddmm(ht.batDau) ? ' → ' + T.ddmm(ht.ketThuc) : '') : 'chưa có ngày';
  const thieuAnh = tv.filter((x) => !(x.anhGiay || []).length).length;
  const dong = tv.map((x, i) => (i + 1) + '. **' + x.ten + '**' + (x.vaiTro === 'Trưởng đoàn' ? ' (trưởng đoàn)' : '') + ' · ' + (x.nhomKhach || 'Người lớn') +
    ' · ' + (x.loaiGiay || 'giấy tờ') + ' · ' + ((x.anhGiay || []).length ? (x.anhGiay.length + ' ảnh') : '<font color="orange">chưa có ảnh</font>')).join('\n');
  const o = (nhan, gt) => ({ is_short: true, text: { tag: 'lark_md', content: '**' + nhan + '**\n' + (gt || '—') } });
  return {
    config: { wide_screen_mode: true },
    header: { template: 'turquoise', title: { tag: 'plain_text', content: 'KOL đã điền form thông tin' } },
    elements: [
      { tag: 'markdown', content: '**' + (kol.ten || '?') + '**  ·  ' + (ht.ma || '') + (kol.quocGia ? '  ·  ' + kol.quocGia : '') },
      { tag: 'div', fields: [o('Chuyến đi', chuyen), o('Đoàn', tv.length + ' người · ' + khach)] },
      { tag: 'div', fields: [o('Nơi đón', ht.noiDon), o('Nơi trả', ht.noiTra)] },
      ...(ht.bayDen || ht.bayVe ? [{ tag: 'div', fields: [o('Chuyến bay đến', ht.bayDen), o('Chuyến bay về', ht.bayVe)] }] : []),
      { tag: 'markdown', content: '**Thành viên đoàn**\n' + (dong || '—') },
      ...(ht.yeuCauDacBiet ? [{ tag: 'markdown', content: '**Yêu cầu đặc biệt:** ' + ht.yeuCauDacBiet }] : []),
      ...(thieuAnh ? [{ tag: 'note', elements: [{ tag: 'plain_text', content: thieuAnh + ' người chưa gửi ảnh giấy tờ. Nhắc KOL mở lại link form để bổ sung.' }] }] : []),
      { tag: 'action', actions: [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: 'Mở hợp tác' }, url: urlHub() + '/#/m/kol?rec=' + encodeURIComponent(ht.id) }] },
    ],
  };
}

/** Gọi sau khi form lưu xong. Không ném — báo hỏng chỉ ghi log, không làm hỏng lượt gửi form của KOL. */
function hen(htId, { tre = 60000 } = {}) {
  if (cho.has(htId)) clearTimeout(cho.get(htId));
  cho.set(htId, setTimeout(async () => {
    cho.delete(htId);
    try {
      const kho = require('./kho');
      const T = require('./tinh');
      const dl = await kho.tatCa({ moi: true });
      const ht = dl.hopTac.find((x) => x.id === htId);
      if (!ht) return;
      const kol = dl.kol.find((k) => k.id === ht.kol) || {};
      const tv = (dl.thanhVien || []).filter((x) => x.hopTac === htId).sort((a, b) => (b.vaiTro === 'Trưởng đoàn') - (a.vaiTro === 'Trưởng đoàn'));
      const r = await require('../lark-chung/gui-anh-hung').gui({ card: the(T, ht, kol, tv), khoa: 'kol-form-' + htId + '-' + (ht.formDienLuc || Date.now()), cli: kho.lark.cli });
      if (!r.ok) console.error('[KOL · BÁO FORM] gửi hỏng:', r.loi);
    } catch (e) { console.error('[KOL · BÁO FORM]', e.message); }
  }, tre));
}

module.exports = { hen, the };
