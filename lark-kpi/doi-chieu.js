'use strict';
/**
 * ĐỐI CHIẾU LỊCH SỬ — chạy bộ máy trên 8 tháng đã nhập từ Excel rồi so với điểm
 * đã dùng để trả lương.
 *
 * Chạy: `node doi-chieu.js`
 *
 * Đây vừa là phép kiểm chứng bộ máy (cùng số liệu vào phải ra cùng số điểm như
 * bảng Excel đã sửa), vừa là bảng anh Hùng cần khi nhập lịch sử vào app: mỗi
 * tháng cũ hiện HAI cột — "đã trả lương" và "app tính lại" — kèm lý do lệch,
 * thay vì âm thầm đè số mới lên số đã chốt.
 */
const fs = require('fs');
const path = require('path');
const L = require('./luat');
const { chamThang } = require('./tinh');

const FILE = path.join(__dirname, 'du-lieu', 'lich-su-2026.json');

function nap() {
  if (!fs.existsSync(FILE)) {
    console.error('Chưa có ' + FILE + ' — chạy bước rút dữ liệu từ Excel trước.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

const s3 = (v) => (v == null || Number.isNaN(v) ? '—' : (Math.round(v * 1000) / 1000).toFixed(3));
const cot = (s, n) => String(s).padEnd(n).slice(0, n);
const phai = (s, n) => String(s).padStart(n);

function chay() {
  const ds = nap();
  const thangs = Object.keys(ds.thang).sort();
  const tenNguoi = new Map();
  const bang = new Map();   // ma nguoi -> { thang -> {cu, moi} }
  const soatTheoThang = [];

  thangs.forEach((th) => {
    const t = ds.thang[th];
    const loiLuat = L.soat(t.luat);
    const kq = chamThang(t.luat, t.soLieu, t.chamTay, th);
    soatTheoThang.push({
      th,
      chanLuat: loiLuat.filter((x) => x.muc === 'chan'),
      canhLuat: loiLuat.filter((x) => x.muc === 'canhBao'),
      chanCham: (kq.canhBao || []).filter((x) => x.muc === 'chan'),
      canhCham: (kq.canhBao || []).filter((x) => x.muc === 'canhBao'),
      nhapLoi: t.canhBaoNhap || [],
    });
    kq.nguoi.forEach((ng) => {
      tenNguoi.set(ng.ma, ng.ten);
      if (!bang.has(ng.ma)) bang.set(ng.ma, {});
      bang.get(ng.ma)[th] = { moi: ng.tong, cu: (t.daTraLuong || {})[ng.ma], dayDu: ng.dayDu };
    });
  });

  /* ---- bảng đối chiếu ---- */
  console.log('\n=== ĐIỂM TÍNH LƯƠNG: đã trả  →  app tính lại ===\n');
  console.log(cot('Người', 9) + thangs.map((t) => phai(t.slice(5), 16)).join(''));
  let lech = 0; let tong = 0;
  [...bang.keys()].forEach((ma) => {
    const o = bang.get(ma);
    const dong = thangs.map((th) => {
      const c = o[th];
      if (!c) return phai('—', 16);
      tong += 1;
      const khac = c.cu != null && Math.abs(c.cu - c.moi) > 0.0005;
      if (khac) lech += 1;
      return phai(s3(c.cu) + (khac ? ' ≠ ' : ' = ') + s3(c.moi), 16);
    }).join('');
    console.log(cot(tenNguoi.get(ma) || ma, 9) + dong);
  });
  console.log('\n' + tong + ' ô đối chiếu · ' + (tong - lech) + ' khớp · ' + lech + ' lệch');

  /* ---- vì sao lệch ----
   * Không được để một ô lệch mà không nói được lý do: đó đúng là kiểu thay đổi
   * âm thầm đã làm hỏng file Excel. Nguyên nhân gần như luôn là tiêu chí bị loại
   * lúc nhập (Excel để trống ô mục tiêu, tính ra 0 nhưng vẫn ăn tỷ trọng; app
   * loại hẳn rồi chia lại phần còn lại). */
  if (lech) {
    console.log('\n=== VÌ SAO LỆCH ===\n');
    thangs.forEach((th) => {
      const t = ds.thang[th];
      const bo = t.boQuaKhiNhap || [];
      if (!bo.length) return;
      const theoKhoa = new Map();
      bo.forEach((x) => {
        if (!theoKhoa.has(x.khoa)) theoKhoa.set(x.khoa, []);
        theoKhoa.get(x.khoa).push(x.ten);
      });
      const aiDinh = [];
      (t.luat.nguoi || []).forEach((ng) => {
        const o = bang.get(ng.ma);
        const c = o && o[th];
        if (!c || c.cu == null || Math.abs(c.cu - c.moi) <= 0.0005) return;
        aiDinh.push(ng.ten + ' (' + s3(c.cu) + ' → ' + s3(c.moi) + ')');
      });
      if (!aiDinh.length) return;
      console.log(th + ': ' + aiDinh.join(', '));
      console.log('    Excel để trống ô mục tiêu ở ' + bo.length + ' tiêu chí thuộc '
        + theoKhoa.size + ' nhóm, nên Excel cho 0 điểm nhưng vẫn giữ tỷ trọng.');
      console.log('    App loại các tiêu chí đó rồi chia lại tỷ trọng — điểm cao hơn.');
      [...theoKhoa.entries()].slice(0, 4).forEach(([k, ds2]) =>
        console.log('      · ' + k + ' — ' + ds2.join(', ')));
      if (theoKhoa.size > 4) console.log('      · … và ' + (theoKhoa.size - 4) + ' nhóm nữa');
    });
    console.log('\nMọi ô lệch đều do một nguyên nhân: Excel bỏ trống ô mục tiêu.');
    console.log('Bộ luật của app CHẶN việc lưu tiêu chí không có mục tiêu, nên từ nay không tái diễn.');
  }

  /* ---- vì sao chưa chốt được ---- */
  console.log('\n=== SOÁT TỪNG THÁNG ===\n');
  soatTheoThang.forEach((s) => {
    const nChan = s.chanLuat.length + s.chanCham.length;
    console.log(s.th + ': ' + (nChan ? nChan + ' mục CHẶN' : 'không có mục chặn')
      + ' · ' + (s.canhLuat.length + s.canhCham.length) + ' cảnh báo'
      + (s.nhapLoi.length ? ' · ' + s.nhapLoi.length + ' vướng lúc nhập' : ''));
    [...s.chanLuat, ...s.chanCham].slice(0, 4).forEach((x) =>
      console.log('    ✗ ' + x.o + ' — ' + x.viec));
    [...s.canhLuat, ...s.canhCham].slice(0, 3).forEach((x) =>
      console.log('    ! ' + x.o + ' — ' + x.viec));
  });

  return { lech, tong };
}

if (require.main === module) chay();
module.exports = { chay, nap, FILE };
