'use strict';
/*
 * CỬA SỔ XỬ LÝ NHANH
 *
 * Bấm một thẻ số ở Tổng quan chung -> mở đúng danh sách bản ghi sau con số đó và
 * xử lý luôn tại chỗ: phân công, đặt hạn, bắt đầu, duyệt lịch, xác nhận thanh
 * toán… Không phải nhảy sang app rồi tự tìm lại việc.
 *
 * Danh sách lấy từ /api/o (đúng nhóm mà kpi.js đã tính ra con số trên thẻ, nên
 * số và danh sách không bao giờ lệch nhau). Hành động gửi qua /api/viec — hub có
 * danh sách trắng, module vẫn tự kiểm quyền lần nữa.
 */

/** Việc làm được với một dòng, quyết theo trạng thái thật của dòng đó. */
function viecLamDuoc(kpi, r, quanLy) {
  const ds = [];
  if (!r.id) return ds;

  if (kpi === 'cong-viec') {
    // việc đã có người/hạn vẫn cần đổi được — quá hạn thì đổi hạn là việc hay làm nhất
    if (quanLy) {
      ds.push({ act: 'phan-cong', ten: (r.nguoiId || []).length ? 'Đổi người' : 'Phân công', kieu: 'nguoi' });
      ds.push({ act: 'dat-han', ten: r.han ? 'Đổi hạn' : 'Đặt hạn', kieu: 'ngay' });
    }
    if (r.trangThai === 'Chờ tiếp nhận') ds.push({ act: 'bat-dau', ten: 'Bắt đầu', chinh: true });
    /* Việc đã trễ thì nhân sự KHÔNG có nút Hoàn thành — kể cả sau khi đã nộp sản
     * phẩm. Dấu trễ chỉ được xoá bởi quản lý lúc nghiệm thu. */
    const treThat = r.trangThai === 'Trễ deadline' ||
      (r.han && new Date(r.han).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0));
    if (r.trangThai !== 'Hoàn thành') {
      /* Chưa có minh chứng thì mở ô dán link — cửa sổ nhanh không đính kèm tệp
       * được, mà module bắt buộc phải có sản phẩm mới cho nộp. */
      if (treThat && !quanLy) {
        const ten = r.daGiaiQuyet ? 'Nộp lại' : 'Giải quyết';
        ds.push(r.coMinhChung
          ? { act: 'giai-quyet', ten, chinh: true }
          : { act: 'giai-quyet', ten, chinh: true, kieu: 'link' });
      }
      else ds.push({ act: 'hoan-thanh', ten: 'Hoàn thành' });
    }
  }

  if (kpi === 'lich-tac-nghiep') {
    // lịch đã đóng thì chỉ còn chuyện tiền, không chốt người hay duyệt lại nữa
    const daDong = ['Đã hoàn tất', 'Từ chối', 'Hủy lịch'].includes(r.trangThai);
    if (quanLy && r.trangThai === 'Chờ duyệt/Xử lý') {
      ds.push({ act: 'duyet', ten: 'Duyệt', chinh: true });
      ds.push({ act: 'tra-lai', ten: 'Trả lại' });
    }
    if (quanLy && !daDong && !(r.nguoiId || []).length) ds.push({ act: 'chot-nhan-su', ten: 'Chốt nhân sự', kieu: 'nguoi' });
    if (quanLy && r.trangThai === 'Đang báo cáo') ds.push({ act: 'hoan-tat', ten: 'Hoàn tất' });
    if (quanLy && (r.chiPhiThuc || 0) > 0 && r.thanhToan !== 'Đã thanh toán') {
      ds.push({ act: 'da-thanh-toan', ten: 'Đã thanh toán' });
    }
  }

  return ds;
}

const ngayVN = (t) => (t ? new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');
const gioVN = (t) => (t ? new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const tien = (v) => Math.round(Number(v) || 0).toLocaleString('vi-VN') + 'đ';

/** Dòng phụ dưới tiêu đề: chỉ những gì giúp quyết định, không kể lại cả bản ghi. */
function phuCua(kpi, r) {
  const p = [];
  if (r.lyDo) p.push(r.lyDo);
  if (kpi === 'cong-viec') {
    const now = Date.now();
    if (r.han) {
      const ngay = Math.floor((now - r.han) / 86400000);
      p.push(ngay > 0 ? 'quá hạn ' + ngay + ' ngày' : 'hạn ' + ngayVN(r.han));
    } else p.push('chưa có deadline');
    if (r.daGiaiQuyet) {
      p.push('đã giải quyết' + (r.ngayGiaiQuyet ? ' ' + ngayVN(r.ngayGiaiQuyet) : ''));
    }
    p.push(r.nguoi || 'chưa phân công');
    if (r.trangThai) p.push(r.trangThai);
  }
  if (kpi === 'lich-tac-nghiep') {
    p.push(r.ngay ? gioVN(r.ngay) : 'chưa có ngày');
    p.push(r.nguoi || (r.phuTrach ? 'phụ trách ' + r.phuTrach : 'chưa có nhân sự'));
    if (r.trangThai) p.push(r.trangThai);
    if (r.chiPhi || r.chiPhiThuc) {
      p.push('dự kiến ' + tien(r.chiPhi) + (r.chiPhiThuc ? ' · thực tế ' + tien(r.chiPhiThuc) : ''));
    }
    if (r.thanhToan) p.push(r.thanhToan);
  }
  return p.filter(Boolean).join(' · ');
}

/**
 * Mở cửa sổ nhanh.
 * @param {string} modId  base nào
 * @param {string} khoa   nhóm ('qua-han', 'cho-duyet'…) hoặc 'rec:<id>' cho một dòng
 * @param {string} tieuDe tiêu đề hiển thị (nhãn thẻ vừa bấm)
 */
async function moCuaSo(modId, khoa, tieuDe) {
  const mod = S.modules.find((m) => m.id === modId);
  S.cuaSo = { modId, khoa, tieuDe: tieuDe || '' };
  moModal(tieuDe || 'Xử lý nhanh',
    '<div class="trong"><span class="spin"></span> Đang lấy danh sách…</div>',
    '<button class="btn ghost" data-close="1">Đóng</button>', true);
  await napCuaSo();
  if (mod) $('#mdTitle').textContent = (tieuDe ? tieuDe + ' · ' : '') + mod.ten;
}

async function napCuaSo() {
  const c = S.cuaSo;
  if (!c) return;
  const k = khoangDangLoc();
  const q = new URLSearchParams({ mod: c.modId, khoa: c.khoa });
  if (k) { q.set('tu', k.tu); q.set('den', k.den); }
  let d;
  try { d = await goi('/api/o?' + q.toString()); } catch (e) {
    $('#mdBody').innerHTML = '<div class="canh-bao do"><span class="grow">' + esc(e.message) + '</span></div>';
    return;
  }
  S.cuaSo.data = d;
  veCuaSo();
}

function veCuaSo() {
  const d = S.cuaSo.data;
  const kpi = d.kpi;
  const ds = d.ds || [];

  const hangHtml = (r, i) => {
    const viec = viecLamDuoc(kpi, r, d.quanLy);
    const nut = viec.map((v) =>
      '<button class="btn nho' + (v.chinh ? ' primary' : ' ghost') + '" data-nhanh="' + v.act +
      '" data-i="' + i + '"' + (v.kieu ? ' data-kieu="' + v.kieu + '"' : '') + '>' + esc(v.ten) + '</button>').join('');
    return '<div class="n-hang" data-hang="' + i + '">' +
      '<span class="muc muc-' + (r.muc || (r.lyDo ? 'cao' : 'thap')) + '"></span>' +
      '<div class="n-noi">' +
        '<div class="n-td">' + esc(r.tieuDe) + '</div>' +
        '<div class="n-phu">' + esc(phuCua(kpi, r)) + '</div>' +
        ((r.the || []).length
          ? '<div>' + r.the.map((x) => '<span class="the-nho">' + esc(x) + '</span>').join('') + '</div>' : '') +
        '<div class="n-o" data-o="' + i + '" hidden></div>' +
      '</div>' +
      '<div class="n-nut">' + nut +
        (r.id ? '<button class="btn nho ghost" data-mochitiet="' + esc(r.id) + '">Mở chi tiết</button>' : '') +
      '</div>' +
      '</div>';
  };

  $('#mdBody').innerHTML = ds.length
    ? '<div class="n-ds">' + ds.map(hangHtml).join('') + '</div>'
    : '<div class="trong">Không còn mục nào trong nhóm này.</div>';

  $('#mdFoot').innerHTML =
    '<span class="n-dem">' + ds.length + ' mục' + (d.quanLy ? '' : ' · vai nhân sự') + '</span>' +
    '<span class="grow"></span>' +
    '<button class="btn ghost" id="nLamMoi">Làm mới</button>' +
    '<button class="btn ghost" id="nMoApp">Mở app</button>' +
    '<button class="btn ghost" data-close="1">Đóng</button>';
  $('#nLamMoi').onclick = () => napCuaSo();
  $('#nMoApp').onclick = () => {
    // mở đúng tab mà bộ đọc chỉ số khai cho thẻ này (VD Cảnh báo của app quảng cáo)
    const mod = (S.tq && S.tq.modules || []).find((x) => x.id === S.cuaSo.modId);
    const the = mod && (mod.the || []).find((t) => t.khoa === S.cuaSo.khoa);
    dongModal();
    moTab(S.cuaSo.modId, (the && the.tab) || '');
  };
}

/** Ô nhập phụ cho hành động cần giá trị (chọn người / chọn ngày). */
function moONhap(i, act, kieu) {
  const box = $('.n-o[data-o="' + i + '"]');
  if (!box) return;
  if (box.dataset.act === act && !box.hidden) { box.hidden = true; box.dataset.act = ''; return; }
  box.dataset.act = act;
  box.hidden = false;
  if (kieu === 'nguoi') {
    const ds = S.cuaSo.data.nhanSu || [];
    box.innerHTML = '<select class="q-in n-chon">' +
      '<option value="">Chọn người…</option>' +
      ds.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.ten) + '</option>').join('') +
      '</select><button class="btn nho primary" data-luunhanh="' + i + '">Lưu</button>';
  } else if (kieu === 'link') {
    box.innerHTML = '<input type="url" class="q-in n-chon" placeholder="Dán link sản phẩm cuối (Drive, Figma, bài đăng…)">' +
      '<button class="btn nho primary" data-luunhanh="' + i + '">Nộp</button>';
  } else {
    const mac = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    box.innerHTML = '<input type="date" class="q-in n-chon" value="' + mac + '">' +
      '<button class="btn nho primary" data-luunhanh="' + i + '">Lưu</button>';
  }
  const el = box.querySelector('.n-chon');
  if (el) el.focus();
}

/** Gửi một hành động rồi nạp lại danh sách + số trên thẻ. */
async function lamNhanh(i, act, giaTri, nut) {
  const r = (S.cuaSo.data.ds || [])[i];
  if (!r || !r.id) return;
  if (nut) { nut.disabled = true; nut.textContent = 'Đang gửi'; }
  try {
    await goi('/api/viec', {
      method: 'POST',
      body: JSON.stringify({ mod: S.cuaSo.modId, id: r.id, act, giaTri }),
    });
    toast('Đã xử lý: ' + r.tieuDe.slice(0, 40), 'luc');
    await napCuaSo();
    // hub đã xoá cache của base vừa xử lý -> nạp thường là đủ, khỏi đọc lại cả 3 base
    napTongQuan();
  } catch (e) {
    toast(e.message + (e.goiY ? ' — ' + e.goiY : ''), 'do');
    if (nut) { nut.disabled = false; }
    veCuaSo();
  }
}

document.addEventListener('click', (e) => {
  const nut = e.target.closest('[data-nhanh]');
  if (nut) {
    e.preventDefault();
    const i = Number(nut.getAttribute('data-i'));
    const act = nut.getAttribute('data-nhanh');
    const kieu = nut.getAttribute('data-kieu');
    if (kieu) moONhap(i, act, kieu);            // cần giá trị -> mở ô nhập
    else lamNhanh(i, act, null, nut);
    return;
  }

  const luu = e.target.closest('[data-luunhanh]');
  if (luu) {
    e.preventDefault();
    const i = Number(luu.getAttribute('data-luunhanh'));
    const box = $('.n-o[data-o="' + i + '"]');
    const el = box && box.querySelector('.n-chon');
    const v = el ? el.value : '';
    if (!v) { toast('Chưa chọn giá trị', 'do'); return; }
    lamNhanh(i, box.dataset.act, v, luu);
    return;
  }

  const ct = e.target.closest('[data-mochitiet]');
  if (ct) {
    e.preventDefault();
    const id = ct.getAttribute('data-mochitiet');
    dongModal();
    moViec(S.cuaSo.modId, id);
    return;
  }
});
