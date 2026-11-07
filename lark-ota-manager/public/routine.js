'use strict';
/* ============================================================================
 * Đơn vị "Routine Hospitality" (nút chọn ở đầu trang): booking của Pito Hotel.
 *
 * Nguồn là thư GoHost/Agoda trong hộp pito@routinehospitality.vn, máy chủ đọc
 * và ghi vào Base riêng (routine/dong-bo.js). Hai tab theo khuôn Rooty Trip:
 *   rt-don  Đơn & chăm sóc: thẻ việc cần làm, danh sách, cập nhật chăm sóc khách
 *   rt-tk   Thống kê: doanh thu theo kênh, theo tháng, đặt trước, lưu trú
 * Lọc và cộng dồn làm ở máy chủ (routine/thongke.js); file này chỉ vẽ. Dùng chung
 * tiện ích của app.js ($, esc, vnd, soVn, goi, toast, moModal, dongModal, gonLoi).
 * ========================================================================== */

const Routine = (() => {
  const TT = { 'Đã đặt': 'tt-moi', 'Đã nhận phòng': 'tt-xac-nhan', 'Đã trả phòng': 'tt-xong', 'Đã huỷ': 'tt-huy' };
  const CS = { 'Có vấn đề': 'xau', 'Đã xin đánh giá': 'tot', 'Đã hỏi thăm khi ở': 'tot', 'Đã xác nhận giờ đến': 'tot', 'Đã nhắn chào': 'tot' };
  let dangDoc = false;

  const namNay = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 4);
  const ngayNgan = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + (s.slice(0, 4) !== namNay() ? '/' + s.slice(0, 4) : '') : '—');
  const gioNgan = (s) => (s ? s.slice(11, 16) + ' ' + ngayNgan(s.slice(0, 10)) : '—');
  const thangTen = (t) => 'Th' + Number(t.slice(5, 7)) + (t.slice(0, 4) !== namNay() ? '/' + t.slice(0, 4) : '');
  const soTb = (n, donVi) => (n == null ? '—' : String(n).replace('.', ',') + ' ' + donVi);

  /* ---------------- đầu trang: trạng thái đọc thư ---------------- */
  function veThu(d) {
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
    const bn = db.baoNhom;
    if (bn && bn.loi && bn.loi.length) {
      html += `<div class="canhbao xau"><div class="noi"><b>Chưa gửi được tin vào nhóm Booking KS</b>
        <p>${esc(gonLoi(bn.loi[0]))}${bn.loi.length > 1 ? ' (và ' + (bn.loi.length - 1) + ' đơn khác)' : ''}</p></div></div>`;
    }
    const gio = db.luc ? new Date(db.luc).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
    html += `<div class="nhap-mot-lan">
      <div><b>Thư từ ${esc(db.hop || 'pito@')}</b>
        <p>${gio ? (db.loi ? 'Thử đọc lúc ' + gio + ', chưa đọc được' : 'Đọc lúc ' + gio) : 'Chưa đọc thư lần nào từ khi máy chủ mở'}${
          db.chuKyMs ? ', tự đọc mỗi ' + Math.round(db.chuKyMs / 60000) + ' phút' : ''}</p></div>
      <div class="rt-nut">
        <button class="btn small primary" id="rtDoc" ${dangDoc || db.dangChay ? 'disabled' : ''}>${dangDoc || db.dangChay ? 'Đang đọc thư…' : 'Đọc thư mới'}</button>
        ${d.baseUrl ? `<a class="btn small ghost" href="${esc(d.baseUrl)}" target="_blank" rel="noreferrer">Mở Base</a>` : ''}
      </div>
    </div>`;
    return html;
  }

  /* ---------------- danh sách đơn ---------------- */
  const veCo = (b) => `<div class="co">${(b.canXuLy || []).map((c) => `<span class="${c.muc}">${esc(c.nhan)}</span>`).join('')}</div>`;
  /* Đơn không có thư trả phòng mà đã qua ngày trả: máy chủ coi là đã trả (suyRa). */
  const veTrangThai = (b) => `<span class="tt ${TT[b.trangThai] || ''}" ${b.suyRa ? 'title="Không có thư trả phòng, đã qua ngày trả nên coi là đã trả"' : ''}>${esc(b.trangThai || '—')}</span>` +
    (b.suyRa ? '<div class="manh">theo ngày trả</div>' : '');
  const veChamSoc = (b) => (b.chamSoc && b.chamSoc !== 'Chưa liên hệ'
    ? `<span class="chip ${CS[b.chamSoc] || ''}">${esc(b.chamSoc)}</span>` : '<span class="manh">Chưa liên hệ</span>');

  function bang(rows, co) {
    if (!rows.length) return `<div class="empty">Không có đơn nào khớp bộ lọc.</div>`;
    return `<div class="bang-boc"><table>
      <thead><tr>
        <th>Kênh</th><th>Mã đặt phòng</th><th>Khách</th><th>Lưu trú</th><th class="so">Đêm</th><th>Phòng</th>
        ${co ? '<th class="so">Số tiền</th>' : ''}<th>Trạng thái</th><th>Chăm sóc</th><th class="can-xu-ly">Cần xử lý</th>
      </tr></thead>
      <tbody>${rows.map((b) => `
        <tr data-rt="${esc(b.id)}">
          <td><span class="kenh">${esc(b.kenh || '—')}</span></td>
          <td class="ma-booking"><span class="dam">${esc(b.ma)}</span><div class="manh">${esc(b.maOta || '')}</div></td>
          <td><span class="dam">${esc(b.tenKhach || '—')}</span>
            <div class="manh">${esc([b.quocGia, b.soKhach ? b.soKhach + ' khách' : ''].filter(Boolean).join(', '))}</div></td>
          <td style="white-space:nowrap">${ngayNgan(b.nhanPhong)}${b.traPhong ? ' → ' + ngayNgan(b.traPhong) : ''}
            ${b.ngayDat ? `<div class="manh">đặt ${esc(ngayNgan(b.ngayDat.slice(0, 10)))}</div>` : ''}</td>
          <td class="so">${b.soDem != null ? soVn(b.soDem) : '—'}</td>
          <td>${esc(b.phong || '—')}</td>
          ${co ? `<td class="so">${vnd(b.soTien)}</td>` : ''}
          <td>${veTrangThai(b)}</td>
          <td>${veChamSoc(b)}</td>
          <td class="can-xu-ly">${veCo(b)}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function veDon(d, nhom) {
    const co = !!d.perm.chiPhi;
    const vh = d.vanHanh;
    let html = veThu(d);
    html += `<div class="the-hang">` + vh.the.map((t) => `
      <button class="the ${t.muc || ''} ${nhom === t.khoa ? 'dang-chon' : ''}" data-rt-nhom="${esc(t.khoa)}">
        <div class="nhan">${esc(t.nhan)}</div>
        <div class="so">${soVn(t.so)}</div>
        <div class="ghi">${esc(t.ghi || '')}</div>
      </button>`).join('') + `</div>`;
    const tenNhom = nhom ? (vh.the.find((t) => t.khoa === nhom) || {}).nhan : '';
    const rows = nhom && vh.nhom[nhom] ? vh.nhom[nhom] : d.rows;
    html += `<div class="khoi">
      <h2>${nhom ? esc(tenNhom) : 'Danh sách đơn'}
        <span class="phu">${soVn(rows.length)} đơn${nhom ? ' · <a href="#" id="rtBoNhom">xem toàn bộ</a>' : ''}</span></h2>
      ${bang(rows, co)}
    </div>`;
    return html;
  }

  /* ---------------- thống kê ---------------- */
  function thanh(ds, ten, giaTri, nhan) {
    const max = Math.max(1, ...ds.map(giaTri));
    return `<div class="lead-grid">${ds.map((x) => `<div class="lead-row">
      <span>${esc(ten(x))}</span><div class="thanh"><i style="width:${Math.round((giaTri(x) / max) * 100)}%"></i></div>
      <b>${nhan(x)}</b></div>`).join('')}</div>`;
  }

  function veThongKe(d) {
    const co = !!d.perm.chiPhi;
    const tk = d.thongKe;
    const t = tk.tong;
    let html = veThu(d);
    const the = [
      { nhan: 'Đơn', chu: soVn(t.don), ghi: t.huy ? t.huy + ' đơn huỷ (' + String(t.tyLeHuy).replace('.', ',') + '%)' : 'không có đơn huỷ' },
      { nhan: 'Đêm phòng', chu: soVn(t.dem), ghi: t.thieuDem ? t.thieuDem + ' đơn chưa biết số đêm' : '' },
      ...(co ? [
        { nhan: 'Doanh thu', chu: vnd(t.tien), ghi: t.hoaHong ? 'Hoa hồng đã biết ' + vnd(t.hoaHong) : '' },
        { nhan: 'Giá trung bình / đêm', chu: t.giaDem != null ? vnd(t.giaDem) : '—' },
      ] : []),
      { nhan: 'Đặt trước trung bình', chu: soTb(t.datTruocTb, 'ngày'), ghi: t.datTruocCo ? t.datTruocCo + ' đơn có ngày đặt' : 'chưa có ngày đặt' },
      { nhan: 'Lưu trú trung bình', chu: soTb(t.luuTruTb, 'đêm') },
    ];
    html += `<div class="the-hang">` + the.map((x) => `
      <div class="the" style="cursor:default">
        <div class="nhan">${esc(x.nhan)}</div>
        <div class="so">${esc(x.chu)}</div>
        <div class="ghi">${esc(x.ghi || '')}</div>
      </div>`).join('') + `</div>`;

    const maxTien = Math.max(1, ...tk.theoKenh.map((k) => k.tien || 0));
    html += `<div class="khoi"><h2>Theo kênh</h2>
      <div class="bang-boc"><table>
        <thead><tr><th>Kênh</th><th class="so">Đơn</th><th class="so">Đêm phòng</th>
          ${co ? '<th class="so">Doanh thu</th><th style="width:120px">Tỷ trọng</th><th class="so">Giá TB / đêm</th><th class="so">Hoa hồng đã biết</th>' : ''}
          <th class="so">Đặt trước TB</th><th class="so">Lưu trú TB</th><th class="so">Huỷ</th></tr></thead>
        <tbody>${tk.theoKenh.map((k) => `<tr>
          <td><span class="kenh">${esc(k.kenh)}</span></td><td class="so">${soVn(k.don)}</td>
          <td class="so" ${k.thieuDem ? `title="${k.thieuDem} đơn chưa biết ngày trả phòng"` : ''}>${k.dem || !k.thieuDem ? soVn(k.dem) : '—'}</td>
          ${co ? `<td class="so">${vnd(k.tien)}</td>
            <td><div class="thanh"><i style="width:${Math.round(((k.tien || 0) / maxTien) * 100)}%"></i></div></td>
            <td class="so">${k.giaDem != null ? vnd(k.giaDem) : '—'}</td>
            <td class="so">${k.hoaHong ? vnd(k.hoaHong) : '—'}</td>` : ''}
          <td class="so">${soTb(k.datTruocTb, 'ngày')}</td><td class="so">${soTb(k.luuTruTb, 'đêm')}</td>
          <td class="so">${k.huy ? soVn(k.huy) : '—'}</td></tr>`).join('')}</tbody>
      </table></div></div>`;

    if (tk.theoThang.length) {
      html += `<div class="khoi"><h2>Theo tháng nhận phòng</h2><div class="khoi-than">${thanh(tk.theoThang,
        (x) => thangTen(x.thang),
        (x) => (co ? x.tien : x.dem),
        (x) => (co ? vnd(x.tien) : soVn(x.dem) + ' đêm') + '<span class="manh"> · ' + x.don + ' đơn</span>')}</div></div>`;
    }

    html += `<div class="rt-hai-cot">
      <div class="khoi"><h2>Đặt trước bao lâu</h2><div class="khoi-than">${thanh(tk.datTruoc, (x) => x.ten, (x) => x.so, (x) => soVn(x.so))}</div></div>
      <div class="khoi"><h2>Ở bao nhiêu đêm</h2><div class="khoi-than">${thanh(tk.luuTru, (x) => x.ten, (x) => x.so, (x) => soVn(x.so))}</div></div>
    </div>`;
    html += `<div class="khoi"><h2>Chăm sóc khách</h2><div class="khoi-than">${thanh(tk.chamSoc, (x) => x.ten, (x) => x.so, (x) => soVn(x.so))}</div></div>`;
    return html;
  }

  function ve(d, { tab, nhom } = {}) {
    if (!d) return window.KX ? KX.man('', { dau: false, the: 5, dong: 6 }) : '';
    return tab === 'rt-tk' ? veThongKe(d) : veDon(d, nhom);
  }

  /* ---------------- cửa sổ chi tiết + chăm sóc ---------------- */
  function chiTietDon(b, d, napLai) {
    const co = !!d.perm.chiPhi;
    const dong = (k, v) => (v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : '');
    const lichSu = String(b.lichSu || '').split('\n').filter(Boolean)
      .map((x) => `<li>${esc(x.slice(11, 16) + ' ' + ngayNgan(x.slice(0, 10)) + x.slice(16))}</li>`).join('');
    const ds = (d.danhMuc && d.danhMuc.chamSoc) || [];
    const lyDo = (d.danhMuc && d.danhMuc.lyDoHuy) || [];
    const huy = b.trangThai === 'Đã huỷ';
    const TEN_NHAC = { chao: 'mẫu tin chào', 'chua-nhan': 'chưa ai nhận', 'chua-nhan-ql': 'báo quản lý', 'truoc-den': 'trước ngày đến', 'hoi-tham': 'hỏi thăm', 'xin-danh-gia': 'xin đánh giá', 'huy-ly-do': 'hỏi lý do huỷ' };
    const daNhac = String(b.nhacCskh || '').split('\n').map((x) => x.split(' ')[0]).filter((k) => TEN_NHAC[k]).map((k) => TEN_NHAC[k]).join(', ');
    moModal(`
      <h3>${esc(b.kenh || '')} · ${esc(b.ma)}</h3>
      <div class="modal-than">
        <dl class="dl">
          ${dong('Tên khách', esc(b.tenKhach || '—'))}
          ${dong('Trạng thái', veTrangThai(b).replace('theo ngày trả', 'Không có thư trả phòng; đã qua ngày trả nên coi là đã trả'))}
          ${dong('Cần xử lý', veCo(b))}
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
        <h4>Chăm sóc khách</h4>
        ${d.perm.duocSua ? `<div class="suaform">
          <label>Trạng thái chăm sóc<select id="rtChamSoc">${ds.map((c) =>
            `<option ${c === (b.chamSoc || 'Chưa liên hệ') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          ${huy ? `<label>Lý do huỷ<select id="rtLyDoHuy"><option value="">Chưa hỏi được</option>${lyDo.map((c) =>
            `<option ${c === b.lyDoHuy ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
          <label style="grid-column:1/-1">Ghi chú chăm sóc<textarea id="rtGhiChu" rows="3" placeholder="Đã nhắn Zalo, khách đến khoảng 15h…">${esc(b.ghiChuChamSoc)}</textarea></label>
        </div>` : `<dl class="dl">${dong('Trạng thái', veChamSoc(b))}${huy ? dong('Lý do huỷ', esc(b.lyDoHuy || 'Chưa hỏi được')) : ''}${dong('Ghi chú', esc(b.ghiChuChamSoc || '—'))}</dl>`}
        ${daNhac ? `<p class="manh">Đã nhắc trong nhóm: ${esc(daNhac)}</p>` : ''}
        ${b.nguoiChamSoc || b.chamSocLuc ? `<p class="manh">Cập nhật ${esc(b.nguoiChamSoc ? 'bởi ' + b.nguoiChamSoc : '')}${b.chamSocLuc ? ' lúc ' + esc(gioNgan(b.chamSocLuc)) : ''}</p>` : ''}
        ${lichSu ? `<h4>Thư đã đọc</h4><ul class="rt-lich-su">${lichSu}</ul>` : ''}
      </div>
      <div class="modal-chan">
        <button class="btn" data-dong="1">Đóng</button>
        ${d.perm.duocSua ? `<button class="btn primary" id="rtLuu">Lưu chăm sóc</button>` : ''}
      </div>`);
    const nut = $('#rtLuu');
    if (nut) nut.onclick = async () => {
      nut.disabled = true;
      try {
        await goi('/api/routine/don/' + encodeURIComponent(b.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chamSoc: $('#rtChamSoc').value,
            ghiChuChamSoc: $('#rtGhiChu').value,
            ...($('#rtLyDoHuy') ? { lyDoHuy: $('#rtLyDoHuy').value } : {}),
          }),
        });
        toast('Đã lưu chăm sóc đơn ' + b.ma, 'tot');
        dongModal();
        napLai(true);
      } catch (e) {
        toast(gonLoi(e.message, 160), 'xau');
        nut.disabled = false;
      }
    };
  }

  function gan(el, d, { napLai, chonNhom, nhom }) {
    const nut = $('#rtDoc', el);
    if (nut) nut.onclick = async () => {
      dangDoc = true;
      napLai(false);
      try {
        const kq = await goi('/api/routine/dong-bo', { method: 'POST' });
        const l = kq.lan || {};
        toast(l.them || l.sua ? 'Thêm ' + (l.them || 0) + ' đơn, cập nhật ' + (l.sua || 0) + ' đơn' : 'Không có đơn mới', 'tot');
      } catch (e) {
        toast(gonLoi(e.message, 160), 'xau');
      } finally {
        dangDoc = false;
        napLai(true);
      }
    };
    $$('.the[data-rt-nhom]', el).forEach((b) => {
      b.onclick = () => chonNhom(nhom === b.dataset.rtNhom ? '' : b.dataset.rtNhom);
    });
    const bo = $('#rtBoNhom', el);
    if (bo) bo.onclick = (e) => { e.preventDefault(); chonNhom(''); };
    const nguon = nhom && d.vanHanh.nhom[nhom] ? d.vanHanh.nhom[nhom] : d.rows;
    $$('tbody tr[data-rt]', el).forEach((tr) => {
      tr.style.cursor = 'pointer';
      tr.onclick = () => {
        const b = nguon.find((x) => x.id === tr.dataset.rt);
        if (b) chiTietDon(b, d, napLai);
      };
    });
  }

  return { ve, gan };
})();
