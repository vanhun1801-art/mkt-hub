'use strict';
/**
 * AI nhận xét báo cáo TUẦN / THÁNG — bước 1: gom dữ liệu cho Claude đọc.
 *
 * Anh Hùng (01/10/2026): Claude chạy theo lịch trên máy anh —
 *   tuần: Thứ 7 lúc 8:30 và 14:00 (tuần Thứ 7 → Thứ 6 vừa khép, trước hạn 23:59 Thứ 7)
 *   tháng: ngày 29 và 30 lúc 8:30 và 14:00 (tháng đang chạy)
 * Nhân sự thấy nhận xét của mình ở khung "Chi tiết kỳ"; quản lý thấy của tất cả.
 *
 * Luật đã chốt từ 12/09, giữ nguyên:
 *   - ẨN DANH trước khi đưa cho AI: mỗi người thành "NS1", "NS2"… Bảng mã nằm ở
 *     ai/du-lieu/ma-<kỳ>.json trên máy, KHÔNG nằm trong tệp đưa AI đọc.
 *   - AI KHÔNG CHẤM ĐIỂM — chỉ nhận xét và gợi ý. Điểm/đánh giá vẫn do luật (chuan.js).
 *
 * Chạy:  node ai/chuan-bi.js tuan   |   node ai/chuan-bi.js thang   [--moc <ms>]
 * In ra đường dẫn tệp dữ liệu; tệp kết quả Claude viết xong thì chạy ai/ghi.js.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const K = require('../ky');
const kho = require('../kho');
const CH = require('../chuan');
const LL = require('../lich-lam');

const loai = process.argv[2] === 'thang' ? 'thang' : 'tuan';
const iMoc = process.argv.indexOf('--moc');
const bayGio = iMoc > 0 ? Number(process.argv[iMoc + 1]) : Date.now();
/* Thứ 7 chạy cho tuần VỪA KHÉP (hôm qua là Thứ 6); ngày 29–30 chạy cho tháng đang chạy. */
const k = loai === 'tuan' ? K.kyTuan(bayGio - 12 * 3600000 - (K.phanRaVN(bayGio).thu === 6 ? 86400000 : 0))
  : K.kyThang(bayGio);
const den = Math.min(k.den, bayGio);

const THU_MUC = path.join(__dirname, 'du-lieu');
const catChu = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

(async () => {
  const [chuan, dsVT, dsLich] = await Promise.all([CH.doc(true), CH.dsViTri(), LL.docHet()]);
  const phieu = (await kho.dsPhieu({ tu: k.tu, den: k.den }, true));
  const phieuNgay = phieu.filter((x) => x.loaiKy === cfg.chon.loaiKy.ngay && x.trangThai === cfg.chon.trangThaiPhieu.daNop);
  const dongHet = await kho.dsDong({});

  /* gom theo người: trùng email HOẶC trùng open_id là một người (như gomNguoi của
   * server) — phiếu lúc có email lúc không thì không bị tách thành NS1 + NS2. */
  const ds0 = [];
  for (const p of phieuNgay) {
    const mail = String(p.email || '').trim().toLowerCase(), id = String(p.nguoi || '').trim();
    let n = ds0.find((x) => (mail && x.mail.has(mail)) || (id && x.ids.has(id)));
    if (!n) { n = { mail: new Set(), ids: new Set(), ten: '', ps: [] }; ds0.push(n); }
    if (mail) n.mail.add(mail); if (id) n.ids.add(id); if (!n.ten && p.tenNguoi) n.ten = p.tenNguoi;
    n.ps.push(p);
  }
  const nhom = new Map(ds0.map((n, i) => [i, { id: [...n.ids][0] || '', email: [...n.mail][0] || '', ten: n.ten, ps: n.ps }]));

  const ma = {};
  const nguoi = [];
  let so = 0;
  for (const n of nhom.values()) {
    const viTri = CH.viTriCua(dsVT, n);
    const lich = LL.lichCua(dsLich, n);
    const truoc = new Map();
    const cuaHo = dongHet.filter((d) => kho.cungNguoi(d, n)).sort((a, b) => a.ngay - b.ngay);
    const ngay = [];
    for (const p of n.ps.sort((a, b) => a.tuNgay - b.tuNgay)) {
      const dong = cuaHo.filter((d) => d.maPhieu === p.ma);
      cuaHo.filter((d) => d.ngay < p.tuNgay).forEach((d) => truoc.set(CH.khoaViec(d), CH.ptCua(d)));
      /* Kèm số ảnh/video từ app Chỉnh ảnh — chấm y như thẻ gửi nhóm (Designer). */
      const kq = CH.cham(dong, viTri, chuan, truoc, await CH.chinhAnhTrongNgay(n, p.tuNgay));
      ngay.push({
        ngay: K.veNgayThu(p.tuNgay),
        dungHan: p.dungHan || '',
        tongPhut: p.tongPhut || 0,
        viec: dong.map((d) => ({ nhom: d.nhom, viec: catChu(d.congViec, 90), phut: d.phut || 0,
          tienDo: CH.ptCua(d), soLuong: d.soLuong || undefined, ghiChu: catChu(d.tienDo || d.ghiChu, 120) || undefined })),
        danhGiaTheoChuan: kq ? { muc: kq.muc, viecChinhPt: kq.chinhPt, viecPhuPt: kq.phuPt,
          sanLuong: kq.sanLuong.map((s) => s.ten + ' ' + s.dat + '/' + s.toiThieu), loiMayPhut: kq.boPhut || 0 } : null,
        nhanDinh: catChu(p.nhanDinh, 300) || undefined,
        canHoTro: K.canHoTroThat(p.canHoTro) ? catChu(p.canHoTro, 300) : undefined,
      });
    }
    const baoCaoKy = phieu.find((x) => x.loaiKy === cfg.chon.loaiKy[loai] && kho.cungNguoi(x, n));
    const m = 'NS' + (++so);
    ma[m] = { id: n.id, email: n.email, ten: n.ten };
    nguoi.push({
      ma: m,
      viTri: viTri || 'chưa khai vị trí',
      chuanViTri: chuan.viTri[viTri] ? {
        viecChinh: chuan.viTri[viTri].nhomChinh, viecChinhToiThieu: chuan.chinhToiThieu + '%',
        viecPhuToiDa: chuan.phuToiDa + '%',
        sanLuongMoiNgay: chuan.viTri[viTri].sanLuong.map((s) => s.ten + ' ≥ ' + s.toiThieu),
      } : null,
      /* Chỉ tính ngày ĐÃ QUA HẠN (hết ngày) — hôm nay còn tới 23:59 mới là thiếu. */
      ngayCoLichMaChuaNop: K.ngayThieu(k.tu, Math.min(den, K.kyNgay(bayGio).tu - 1), n.ps.map((p) => p.tuNgay), K.LUAT, lich)
        .map(K.veNgayThu),
      ngay,
      daViet: baoCaoKy ? { nhanDinh: catChu(baoCaoKy.nhanDinh, 600) || undefined, keHoach: catChu(baoCaoKy.keHoach, 600) || undefined } : undefined,
      nhanXetAiTruoc: baoCaoKy && baoCaoKy.danhGiaAI ? catChu(baoCaoKy.danhGiaAI, 800) : undefined,
    });
  }

  fs.mkdirSync(THU_MUC, { recursive: true });
  const ten = loai + '-' + K.veNgay(k.tu).split('/').reverse().join('');
  const tepDuLieu = path.join(THU_MUC, ten + '.json');
  fs.writeFileSync(tepDuLieu, JSON.stringify({
    loaiKy: loai === 'tuan' ? 'tuần' : 'tháng', tu: K.veNgay(k.tu), den: K.veNgay(den),
    ghiChu: 'Mỗi người đã ẩn danh bằng mã NS. Phút = phút tự khai. danhGiaTheoChuan do luật tính, không phải AI.',
    nguoi,
  }, null, 1));
  fs.writeFileSync(path.join(THU_MUC, 'ma-' + ten + '.json'), JSON.stringify({ loai, tu: k.tu, ma }, null, 1));
  console.log(JSON.stringify({ tepDuLieu, tepMa: path.join(THU_MUC, 'ma-' + ten + '.json'),
    tepKetQua: path.join(THU_MUC, 'ket-qua-' + ten + '.json'), soNguoi: nguoi.length, ky: K.veNgay(k.tu) + ' – ' + K.veNgay(den) }));
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
