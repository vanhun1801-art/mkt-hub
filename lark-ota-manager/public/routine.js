'use strict';
/* ============================================================================
 * Tab "Khách sạn Routine": booking của Pito Hotel (Routine Hospitality).
 *
 * Nguồn là thư GoHost/Agoda trong hộp pito@routinehospitality.vn, máy chủ đọc
 * và ghi vào Base riêng (routine/dong-bo.js). Tab này chỉ đọc Base đó qua
 * /api/routine/bookings. Dùng chung tiện ích của app.js ($, esc, vnd, soVn,
 * goi, toast, moModal).
 * ========================================================================== */

const Routine = (() => {
  const TT = { 'Đã đặt': 'tt-moi', 'Đã nhận phòng': 'tt-xac-nhan', 'Đã trả phòng': 'tt-xong', 'Đã huỷ': 'tt-huy' };
  let dangDoc = false;

  const homNay = () => {
    const d = new Date(Date.now() + 7 * 3600e3);
    return d.toISOString().slice(0, 10);
  };
  const cong = (ngay, n) => new Date(Date.parse(ngay) + n * 864e5).toISOString().slice(0, 10);
  const ngayNgan = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + (s.slice(0, 4) !== homNay().slice(0, 4) ? '/' + s.slice(0, 4) : '') : '—');
  const gioNgan = (s) => (s ? s.slice(11, 16) + ' ' + ngayNgan(s.slice(0, 10)) : '—');

  function bang(rows, co) {
    if (!rows.length) return `<div class="empty">Chưa có đơn nào.</div>`;
    return `<div class="bang-boc"><table>
      <thead><tr>
        <th>Kênh</th><th>Mã đặt phòng</th><th>Khách</th><th>Nhận phòng</th><th class="so">Đêm</th>
        <th>Phòng</th>${co ? '<th class="so">Số tiền</th>' : ''}<th>Trạng thái</th>
      </tr></thead>
      <tbody>${rows.map((b) => `
        <tr data-rt="${esc(b.id)}">
          <td><span class="kenh">${esc(b.kenh || '—')}</span></td>
          <td class="ma-booking"><span class="dam">${esc(b.ma)}</span>
            <div class="manh">${esc(b.maOta || '')}</div></td>
          <td><span class="dam">${esc(b.tenKhach || '—')}</span>
            <div class="manh">${esc(b.quocGia || (b.soKhach ? b.soKhach + ' khách' : ''))}</div></td>
          <td style="white-space:nowrap">${ngayNgan(b.nhanPhong)}${b.traPhong ? ' → ' + ngayNgan(b.traPhong) : ''}</td>
          <td class="so">${b.soDem != null ? soVn(b.soDem) : '—'}</td>
          <td>${esc(b.phong || '—')}</td>
          ${co ? `<td class="so">${vnd(b.soTien)}</td>` : ''}
          <td><span class="tt ${TT[b.trangThai] || ''}">${esc(b.trangThai || '—')}</span></td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function ve(d) {
    if (!d) return window.KX ? KX.man('', { dau: false, the: 4, dong: 6 }) : '';
    const co = !!(d.perm && d.perm.chiPhi);
    const rows = d.rows || [];
    const hn = homNay(), tuan = cong(hn, 7);
    const song = rows.filter((b) => b.trangThai !== 'Đã huỷ');
    const sap = song.filter((b) => b.trangThai === 'Đã đặt' && b.nhanPhong >= hn)
      .sort((a, b) => (a.nhanPhong < b.nhanPhong ? -1 : 1));
    const t = d.thongKe.tong;
    const db = d.dongBo || {};

    let html = '';
    if (d.loi) {
      html += `<div class="canhbao xau"><div class="noi"><b>Không đọc được Base của Routine</b>
        <p>${esc(gonLoi(d.loi))}</p></div></div>`;
    }
    if (db.loi) {
      html += `<div class="canhbao xau"><div class="noi"><b>Lần đọc thư gần nhất bị lỗi</b>
        <p>${esc(gonLoi(db.loi))}</p></div></div>`;
    }

    html += `<div class="nhap-mot-lan">
      <div><b>Thư từ ${esc(db.hop || 'pito@')}</b>
        <p>${db.luc ? (db.loi ? 'Thử đọc lúc ' : 'Đọc lúc ') + new Date(db.luc).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + (db.loi ? ', chưa đọc được' : '') : 'Chưa đọc thư lần nào từ khi máy chủ mở'}${
          db.chuKyMs ? ', tự đọc mỗi ' + Math.round(db.chuKyMs / 60000) + ' phút' : ''}</p></div>
      <div class="rt-nut">
        <button class="btn small primary" id="rtDoc" ${dangDoc || db.dangChay ? 'disabled' : ''}>${dangDoc || db.dangChay ? 'Đang đọc thư…' : 'Đọc thư mới'}</button>
        ${d.baseUrl ? `<a class="btn small ghost" href="${esc(d.baseUrl)}" target="_blank" rel="noreferrer">Mở Base</a>` : ''}
      </div>
    </div>`;

    const the = [
      { nhan: 'Đơn còn hiệu lực', so: t.don, ghi: t.huy ? t.huy + ' đơn đã huỷ' : '' },
      { nhan: 'Đêm phòng', so: t.dem },
      { nhan: 'Nhận phòng 7 ngày tới', so: sap.filter((b) => b.nhanPhong <= tuan).length },
    ];
    if (co) the.push({ nhan: 'Số tiền', tien: t.tien, ghi: t.hoaHong ? 'Hoa hồng đã biết ' + vnd(t.hoaHong) : '' });
    html += `<div class="the-hang">` + the.map((x) => `
      <div class="the" style="cursor:default">
        <div class="nhan">${esc(x.nhan)}</div>
        <div class="so">${x.tien != null ? vnd(x.tien) : soVn(x.so)}</div>
        <div class="ghi">${esc(x.ghi || '')}</div>
      </div>`).join('') + `</div>`;

    if (sap.length) {
      html += `<div class="khoi"><h2>Sắp nhận phòng</h2>${bang(sap, co)}</div>`;
    }

    html += `<div class="khoi"><h2>Theo kênh</h2>
      <div class="bang-boc"><table>
        <thead><tr><th>Kênh</th><th class="so">Đơn</th><th class="so">Đêm phòng</th>
          ${co ? '<th class="so">Số tiền</th><th class="so">Hoa hồng đã biết</th>' : ''}<th class="so">Huỷ</th></tr></thead>
        <tbody>${d.thongKe.theoKenh.map((k) => `<tr>
          <td><span class="kenh">${esc(k.kenh)}</span></td><td class="so">${soVn(k.don)}</td><td class="so">${soVn(k.dem)}</td>
          ${co ? `<td class="so">${vnd(k.tien)}</td><td class="so">${k.hoaHong ? vnd(k.hoaHong) : '—'}</td>` : ''}
          <td class="so">${k.huy ? soVn(k.huy) : '—'}</td></tr>`).join('')}</tbody>
      </table></div></div>`;

    html += `<div class="khoi"><h2>Mọi đơn</h2>${bang(rows, co)}</div>`;
    return html;
  }

  function chiTietDon(b, co) {
    const dong = (k, v) => (v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : '');
    const lichSu = String(b.lichSu || '').split('\n').filter(Boolean)
      .map((x) => `<li>${esc(x.slice(11, 16) + ' ' + ngayNgan(x.slice(0, 10)) + x.slice(16))}</li>`).join('');
    moModal(`
      <h3>${esc(b.kenh || '')} · ${esc(b.ma)}</h3>
      <div class="modal-than">
        <dl class="dl">
          ${dong('Tên khách', esc(b.tenKhach || '—'))}
          ${dong('Trạng thái', `<span class="tt ${TT[b.trangThai] || ''}">${esc(b.trangThai || '—')}</span>`)}
          ${dong('Mã OTA', esc(b.maOta))}
          ${dong('Nhận phòng', esc(ngayNgan(b.nhanPhong)))}
          ${dong('Trả phòng', esc(ngayNgan(b.traPhong)))}
          ${dong('Số đêm', b.soDem != null ? soVn(b.soDem) : '')}
          ${dong('Phòng', esc(b.phong))}
          ${dong('Hạng phòng', esc(b.hangPhong))}
          ${dong('Số khách', b.soKhach ? soVn(b.soKhach) : '')}
          ${dong('Quốc gia', esc(b.quocGia))}
          ${dong('Đặt lúc', b.ngayDat ? esc(gioNgan(b.ngayDat)) : '')}
          ${co ? dong('Số tiền', b.soTien != null ? vnd(b.soTien) : '') : ''}
          ${co ? dong('Giá bán trên OTA', b.giaBan != null ? vnd(b.giaBan) : '') : ''}
          ${co ? dong('Hoa hồng OTA', b.hoaHong != null ? vnd(b.hoaHong) : '') : ''}
          ${co ? dong('Đã thanh toán', b.daThanhToan != null ? vnd(b.daThanhToan) : '') : ''}
          ${dong('Yêu cầu, ghi chú', b.ghiChu ? esc(b.ghiChu).replace(/\n/g, '<br>') : '')}
        </dl>
        ${lichSu ? `<h4>Thư đã đọc</h4><ul class="rt-lich-su">${lichSu}</ul>` : ''}
      </div>
      <div class="modal-chan"><button class="btn" data-dong>Đóng</button></div>`);
  }

  function gan(el, d, napLaiTab) {
    const nut = $('#rtDoc', el);
    if (nut) nut.onclick = async () => {
      dangDoc = true;
      napLaiTab(false);
      try {
        const kq = await goi('/api/routine/dong-bo', { method: 'POST' });
        const l = kq.lan || {};
        toast(l.them || l.sua ? 'Thêm ' + (l.them || 0) + ' đơn, cập nhật ' + (l.sua || 0) + ' đơn' : 'Không có đơn mới', 'tot');
      } catch (e) {
        toast(gonLoi(e.message, 160), 'xau');
      } finally {
        dangDoc = false;
        napLaiTab(true);
      }
    };
    $$('tbody tr[data-rt]', el).forEach((tr) => {
      tr.style.cursor = 'pointer';
      tr.onclick = () => {
        const b = (d.rows || []).find((x) => x.id === tr.dataset.rt);
        if (b) chiTietDon(b, !!(d.perm && d.perm.chiPhi));
      };
    });
  }

  return { ve, gan };
})();
