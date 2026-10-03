'use strict';
/**
 * ============================================================================
 * NHẬP LẠI BÁO CÁO NGÀY TỪ BẢNG GOOGLE SHEET CŨ
 * ============================================================================
 * Anh Hùng (03/10/2026): bốn người còn báo cáo ngày 26–30/09 nằm trong Sheet
 * riêng, chưa vào Base — nhập lại để tuần 26/09–03/10 đủ dữ liệu cho báo cáo
 * tuần và cho lượt AI nhận xét.
 *
 * Đầu vào: tệp JSON do ai rút từ Sheet ra, hình dạng
 *   { "<email>": { "26/09/2026": [ { viec, phut, tienDo, ghiChu, link } ] } }
 *
 * Chạy:
 *   node thiet-lap/nhap-tu-sheet.js <tệp.json>            — CHỈ XEM TRƯỚC
 *   node thiet-lap/nhap-tu-sheet.js <tệp.json> --that     — ghi thật
 *
 * Ba điều cố ý:
 *
 * 1. KHÔNG đụng phiếu đã có. Ngày nào Base đã có phiếu của người đó thì bỏ
 *    qua và in ra, không ghi đè — dữ liệu người ta tự nộp luôn thắng bản nhập
 *    lại từ Sheet.
 *
 * 2. Đánh dấu ĐÚNG HẠN, nộp lúc 17:00 chính ngày đó. Nếu để máy tự chấm thì
 *    mọi phiếu nhập hôm nay đều thành "nộp bù" — sai với sự thật: họ ĐÃ báo
 *    cáo đúng hạn, chỉ là báo vào Sheet chứ chưa có Base. Để nguyên thì bảng
 *    kỷ luật và nhận xét AI đều kết luận ngược.
 *
 * 3. Nhóm việc suy từ TÊN công việc theo bảng dưới. Không đoán được thì vào
 *    "Khác" và in ra để người chạy soát lại — thà để Khác còn hơn gán bừa, vì
 *    nhóm quyết định phần trăm việc chính khi chấm chuẩn.
 */
const fs = require('fs');
const cfg = require('../config');
const K = require('../ky');
const kho = require('../kho');
const lark = require('../lark');
const CH = require('../chuan');

/* Tên trong Sheet -> nhóm việc của app. Khoá là chữ thường, so bằng "chứa". */
const BANG_NHOM = [
  [['page', 'fb', 'facebook', 'zalo', 'instagram', '(ig)'], 'Page'],
  [['tiktok', 'tik tok'], 'TikTok'],
  [['edit clip', 'edit video', 'edit'], 'Edit video'],
  [['chỉnh ảnh', 'chinh anh'], 'Chỉnh ảnh'],
  /* icon / in ấn: Trường ghi vào 'Khác' nhưng đó là việc thiết kế. */
  [['thiết kế', 'thiet ke', 'design', 'icon', 'in ấn'], 'Thiết kế'],
  [['kịch bản', 'kich ban'], 'Kịch bản'],
  [['quay', 'chụp'], 'Chụp/Quay'],
  [['live'], 'Livestream'],
  [['google ads', 'quảng cáo', 'quang cao', 'ads'], 'Chạy quảng cáo'],
  [['web', 'seo'], 'Website/SEO'],
  [['ota', 'booking'], 'OTA'],
  /* Zalo OA là kênh để đăng bài, không phải chatbot — Thư lên lịch 5 bài post. */
  [['chatbot'], 'Chatbot'],
  [['báo cáo', 'bao cao'], 'Báo cáo'],
  [['họp', 'hop '], 'Họp'],
  [['lỗi máy', 'mất điện', 'mất mạng'], 'Lỗi máy / mất điện'],
];

/** "Tăng ca" không phải loại việc — đoán nhóm theo nội dung đã ghi bên trong. */
function nhomCua(viec, noiDung) {
  const v = String(viec || '').toLowerCase().trim();
  const tim = (s) => {
    for (const [tu, nhom] of BANG_NHOM) if (tu.some((t) => s.includes(t))) return nhom;
    return '';
  };
  if (/^(tăng ca|tang ca|công việc khác|cong viec khac|khác|khac)$/.test(v)) {
    return tim(String(noiDung || '').toLowerCase()) || 'Khác';
  }
  return tim(v) || 'Khác';
}

/**
 * Ô "TIẾN ĐỘ CÔNG VIỆC" trong Sheet là một khối chữ: dòng đầu nói xong hay
 * chưa ("Hoàn thành 100%", "đang thực hiện"), mấy dòng sau là việc cụ thể.
 * Tách ra: phần trăm + trạng thái + phần còn lại làm ghi chú.
 */
function doTienDo(tho) {
  const s = String(tho || '').trim();
  const dong = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const dau = (dong[0] || '').toLowerCase();
  const m = s.match(/(\d{1,3})\s*%/);
  let pt = m ? Math.min(100, Number(m[1])) : null;
  const xong = /hoàn thành|hoan thanh|xong|đã xong/.test(dau);
  if (pt == null) pt = xong ? 100 : 0;
  const trangThai = pt >= 100 || xong ? 'Hoàn thành' : 'Đang làm';
  return { tienDoPt: pt, trangThai, ghiChu: dong.join(' · ') };
}

/* Người nào chưa có ở đây thì tra bảng Phân quyền của hub theo email — chỗ
 * anh Hùng đã khai sẵn cả phòng, khỏi chép tay thêm một dòng mỗi lần có thêm
 * một bảng Sheet. Bảng dưới chỉ còn là bản vá cho ai Phân quyền ghi thiếu. */
const NGUOI = {
  'thuhta@rootytrip.com': { id: 'ou_498e794af73c287291ca37a8cb6f50cc', ten: 'Huỳnh Thị Anh Thư' },
  'hangvtc@rootytrip.com': { id: 'ou_832738e765aae94e9b1fb96d548d3d5e', ten: 'Võ Thị Cẩm Hằng' },
  'truongdm@rootytrip.com': { id: 'ou_5c7965c6d5ce353f0907faf108be36f0', ten: 'Danh Minh Trường' },
  'hanpm@rootytrip.com': { id: 'ou_87771f51930868d9bd5c27ffe86e0a64', ten: 'Hân Phù MKT' },
};

const tep = process.argv[2];
const that = process.argv.includes('--that');
if (!tep) { console.error('Cách dùng: node thiet-lap/nhap-tu-sheet.js <tệp.json> [--that]'); process.exit(1); }

(async () => {
  const vao = JSON.parse(fs.readFileSync(tep, 'utf8'));
  const daCo = new Set((await kho.dsPhieu({ loaiKy: 'ngay' }, true)).map((p) => p.ma));
  const F = cfg.fields.phieu;
  let soGhi = 0, soBo = 0;
  const laKhac = [];

  const bangQuyen = await CH.dsViTri();
  for (const [email, theoNgay] of Object.entries(vao)) {
    const q = bangQuyen.find((x) => x.email === String(email).toLowerCase());
    const ng = NGUOI[email] || (q && q.openId ? { id: q.openId, ten: q.ten } : null);
    if (!ng) { console.log('BỎ QUA ' + email + ' — không có trong Phân quyền, cũng chưa khai ở bảng NGUOI'); continue; }
    const nguoi = { id: ng.id, email, ten: ng.ten };

    for (const [ngay, dsTho] of Object.entries(theoNgay).sort()) {
      const [d, m, y] = ngay.split('/').map(Number);
      const ngayMs = K.tuNgayVN(y, m, d) + 9 * K.GIO;
      const ma = kho.maPhieu('ngay', K.kyNgay(ngayMs).tu, kho.khoaNguoi(nguoi));
      const dong = dsTho.map((x) => {
        const t = doTienDo(x.tienDo);
        const nhom = nhomCua(x.viec, x.tienDo);
        if (nhom === 'Khác') laKhac.push(ng.ten + ' ' + ngay + ': ' + x.viec);
        return {
          congViec: [x.viec, x.ghiChu].filter(Boolean).join(' — ').slice(0, 300),
          nhom,
          phut: x.phut,
          tienDoPt: t.tienDoPt,
          tienDo: [t.ghiChu, x.link].filter(Boolean).join(' · ').slice(0, 900),
          trangThai: t.trangThai,
        };
      });
      const tong = dong.reduce((s, x) => s + x.phut, 0);
      /* Ca suy từ tổng phút: ≤ 240 là nửa ngày. Tăng ca vẫn tính ca cả ngày —
       * đúng như cách cả phòng đang ghi (định mức 480, vượt thì trên 100%). */
      const ca = tong > 0 && tong <= 240 ? 'nua' : 'ngay';

      if (daCo.has(ma)) {
        soBo++;
        console.log('bỏ   ' + ng.ten.padEnd(20) + ngay + ' — Base đã có phiếu, không đụng vào');
        continue;
      }
      console.log((that ? 'GHI  ' : 'thử  ') + ng.ten.padEnd(20) + ngay + ' · ' + dong.length +
        ' việc · ' + tong + ' phút · ca ' + (ca === 'nua' ? '240' : '480') +
        ' · nhóm: ' + [...new Set(dong.map((x) => x.nhom))].join(', '));
      soGhi++;
      if (!that) continue;

      const r = await kho.luuNgay({ nguoi, ngayMs, ca, dong, nop: true });
      /* Chấm lại thành đúng hạn, nộp lúc 17:00 chính ngày đó — xem đầu tệp. */
      await lark.updateRecord(r.phieu.id, {
        [F.nopLuc.id]: K.tuNgayVN(y, m, d) + 17 * K.GIO,
        [F.dungHan.id]: cfg.chon.dungHan['dung-han'],
        [F.nopBu.id]: false,
        [F.trePhut.id]: 0,
        [F.soLanNop.id]: 1,
      }, cfg.phieuTableId);
      kho.xoaDem();
    }
  }

  console.log('\n' + (that ? 'ĐÃ GHI ' : 'sẽ ghi ') + soGhi + ' phiếu · bỏ qua ' + soBo + ' phiếu đã có');
  if (laKhac.length) {
    console.log('\nVào nhóm "Khác" (soát lại nếu cần):');
    [...new Set(laKhac)].forEach((x) => console.log('  - ' + x));
  }
  if (!that) console.log('\nĐây mới là xem trước. Thêm --that để ghi thật.');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
