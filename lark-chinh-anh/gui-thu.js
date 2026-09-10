'use strict';
/**
 * Gửi MỘT tin thử để xem hình thù thẻ báo cáo, KHÔNG ghi gì lên Base.
 *
 *   node gui-thu.js --toi-email a@b.com    # nhắn riêng, chỉ đích bằng email
 *   node gui-thu.js --toi-nguoi ou_xxx     # nhắn riêng bằng open_id
 *   node gui-thu.js --toi-nhom oc_xxx      # nhắn vào một nhóm
 *
 *   node gui-thu.js --toi-nhom oc_xxx --mot-muc     # thẻ một mục
 *   node gui-thu.js --toi-nhom oc_xxx --nhieu 8     # ngày cao điểm: 8 lô
 *   node gui-thu.js --toi-nhom oc_xxx --dry-run     # chỉ in ra, không gửi
 *
 * Nhắn riêng thì NÊN dùng --toi-email: **open_id là RIÊNG THEO TỪNG APP**, nên
 * open_id lấy từ app này đưa cho app kia sẽ bị Lark trả `99992361 open_id cross
 * app`. Email thì chung cho cả tenant.
 *
 * Vì sao giữ file này trong repo: mỗi lần đổi app đứng tên gửi, đổi scope, hay
 * deploy sang chỗ mới đều cần một lượt kiểm "tin có ra được không và trông thế
 * nào" — mà kiểm bằng cách bấm Báo cáo thật thì lại đẻ một dòng rác trên Base
 * rồi phải đi xoá. File này đi ĐÚNG đường gửi của app thật (tin.js → lark.guiTin
 * → tin-app.js) nên nó chứng minh được cả chuỗi, chỉ khác là dữ liệu bịa.
 */
const lark = require('./lark');
const tin = require('./tin');
const tinApp = require('./tin-app');

const co = (t) => process.argv.includes(t);
const lay = (t) => {
  const i = process.argv.indexOf(t);
  return i > 0 ? (process.argv[i + 1] || '') : '';
};

const nguoiId = lay('--toi-nguoi');
const email = lay('--toi-email');
const nhomId = lay('--toi-nhom');
const motMuc = co('--mot-muc');
/* --nhieu N: dựng N lô để xem thẻ trông thế nào vào ngày chỉnh rất nhiều ảnh.
 * Không có cách nào khác để biết trước: một buổi cao điểm có thể 8-10 lô, và thẻ
 * dài quá thì Lark tự thu gọn — phải nhìn thật mới quyết được có cần cắt bớt. */
const nhieu = Number(lay('--nhieu') || 0);
const thu = co('--dry-run');

const homNay = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

/* Dữ liệu bịa nhưng đúng hình dạng store.docBaoCao() trả về, để tin.soan() không
 * phải biết đây là tin thử. Link trỏ vào ví dụ, cố ý KHÔNG phải link thật. */
const NGUOI = [{ id: 'ou_thu', name: 'Nguyễn Thanh (ví dụ)' }];
const MAU = [
  {
    thuMuc: 'TOUR ĐẢO · Ghép · ' + doiNgay(homNay),
    tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: homNay,
    hangMuc: ['Chỉnh ảnh'],
    linkAnh: 'https://photos.app.goo.gl/vi-du-anh-ghep',
    linkVideo: '',
    soAnh: 124, soVideo: 0,
    nguoiLam: NGUOI,
    ghiChu: '', trangThai: 'Chờ nghiệm thu',
  },
  {
    thuMuc: 'LAND TOUR · VIP · ' + doiNgay(homNay),
    tour: 'LAND TOUR', loai: 'VIP', ngay: homNay,
    hangMuc: ['Chỉnh ảnh', 'Edit video'],
    linkAnh: 'https://photos.app.goo.gl/vi-du-anh-vip',
    linkVideo: 'https://drive.google.com/drive/folders/vi-du-video-vip',
    soAnh: 58, soVideo: 2,
    nguoiLam: [{ id: 'ou_thu2', name: 'Huỳnh Chí Khanh (ví dụ)' }],
    ghiChu: 'khách xin thêm ảnh nhóm ở cầu Hôn',
    trangThai: 'Chờ nghiệm thu',
  },
];

/* Ngày cao điểm thật: nhiều tour, nhiều người chỉnh, số ảnh lớn. Số liệu bịa nhưng
 * theo tỷ lệ thật — Tour đảo ghép luôn nhiều ảnh nhất, VIP ít ảnh hơn nhưng có video. */
const TOUR_MAU = [
  ['TOUR ĐẢO', 'Ghép', ['Chỉnh ảnh'], 186, 0],
  ['TOUR ĐẢO', 'VIP', ['Chỉnh ảnh', 'Edit video'], 74, 2],
  ['LAND TOUR', 'Ghép', ['Chỉnh ảnh'], 152, 0],
  ['LAND TOUR', 'VIP', ['Chỉnh ảnh', 'Edit video'], 61, 1],
  ['GRAND WORLD', 'Ghép', ['Chỉnh ảnh'], 128, 0],
  ['RẠCH VẸM', 'Ghép', ['Chỉnh ảnh'], 97, 0],
  ['PHÁO HOA', 'Khác', ['Chỉnh ảnh', 'Edit video'], 88, 3],
  ['KHÁCH SẠN', 'Khác', ['Chỉnh ảnh'], 64, 0],
  ['SỰ KIỆN', 'Khác', ['Chỉnh ảnh', 'Edit video'], 143, 2],
  ['GRAND WORLD', 'VIP', ['Chỉnh ảnh'], 52, 0],
];
const NGUOI_MAU = ['Nguyễn Thanh', 'Huỳnh Chí Khanh', 'Danh Minh Trường', 'Hằng'];

function mauNhieu(n) {
  return Array.from({ length: Math.min(n, TOUR_MAU.length) }, (_, i) => {
    const [tour, loai, hangMuc, soAnh, soVideo] = TOUR_MAU[i];
    const ten = NGUOI_MAU[i % NGUOI_MAU.length];
    return {
      thuMuc: tour + ' · ' + loai + ' · ' + doiNgay(homNay),
      tour, loai, ngay: homNay, hangMuc,
      linkAnh: 'https://photos.app.goo.gl/vi-du-' + (i + 1),
      linkVideo: soVideo ? 'https://drive.google.com/drive/folders/vi-du-' + (i + 1) : '',
      soAnh, soVideo,
      nguoiLam: [{ id: 'ou_thu' + i, name: ten + ' (ví dụ)' }],
      ghiChu: '', trangThai: 'Chờ nghiệm thu',
    };
  });
}

function doiNgay(k) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
  return m ? m[3] + '.' + m[2] + '.' + m[1] : k;
}

async function main() {
  if (!nguoiId && !nhomId && !email) {
    console.error('Thiếu đích gửi. Dùng --toi-email a@b.com, --toi-nguoi ou_xxx, hoặc --toi-nhom oc_xxx');
    process.exitCode = 1;
    return;
  }

  const ds = nhieu > 0 ? mauNhieu(nhieu) : (motMuc ? [MAU[0]] : MAU);
  const soan = tin.soan(ds, { nguoiTen: 'TIN THỬ' });

  /* Nói rõ ngay trên tiêu đề là tin thử — người nhận không phải đoán, và nếu gửi
   * lạc vào nhóm thật thì cũng không ai tưởng là sản phẩm có thật. */
  soan.card.header.title.content = '[TIN THỬ] ' + soan.card.header.title.content;
  soan.card.header.template = 'wathet';
  soan.text = '[TIN THỬ — không phải sản phẩm thật]\n' + soan.text;

  const g = tinApp.nguoiGui();
  console.log('Gửi bằng: ' + g.ten + (g.appId ? ' (' + g.appId + ')' : '') + ' · qua ' + g.qua);
  console.log('Đích: ' + (email ? 'email ' + email
    : (nguoiId ? 'người ' + nguoiId : 'nhóm ' + nhomId)));
  console.log('Số mục trong tin: ' + ds.length);

  if (thu) {
    console.log('\n--- TIN CHỮ ---\n' + soan.text);
    console.log('\n--- THẺ (JSON) ---\n' + JSON.stringify(soan.card, null, 1));
    return;
  }

  const r = await lark.guiTin({
    email: email || '',
    userId: nguoiId || '',
    chatId: nhomId || '',
    card: soan.card,
    text: soan.text,
    khoa: 'thu-' + Date.now().toString(36),
  });

  if (r.ok) {
    console.log('\nĐÃ GỬI. message_id = ' + (r.msgId || '(Lark không trả)'));
    return;
  }

  console.error('\nKHÔNG GỬI ĐƯỢC: ' + r.loi);
  console.error('\nBốn chỗ hay thiếu, theo đúng thứ tự nên kiểm:');
  console.error('  1. App đứng tên gửi chưa có scope im:message, hoặc đã cấp mà CHƯA');
  console.error('     phát hành version mới  → Lark trả 99991672');
  console.error('  2. Bot chưa ở trong nhóm / app chưa mở cho người nhận → 230002, 230013');
  console.error('  3. App ID và App Secret không cùng một app → 10014 app secret invalid');
  console.error('  4. open_id lấy từ app KHÁC → 99992361 open_id cross app; dùng --toi-email');
  process.exitCode = 1;
}

main().catch((e) => { console.error('LỖI: ' + e.message); process.exitCode = 1; });
