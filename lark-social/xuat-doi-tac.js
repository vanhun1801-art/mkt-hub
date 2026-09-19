'use strict';
/**
 * Hai tệp gửi đối tác: một bảng Excel để họ đối chiếu, một trang in được để
 * đính kèm email hoặc ký.
 *
 * VÌ SAO PDF LÀ TRANG IN ĐƯỢC CHỨ KHÔNG PHẢI TỆP .pdf SINH TỪ NODE. Dựng PDF
 * nhị phân mà không có thư viện thì phải tự nhúng một font TTF có đủ dấu tiếng
 * Việt và tự đo bề rộng từng chữ để xuống dòng — sai một chút là "Phú Quốc"
 * thành ô vuông trên máy người nhận, mà mình không thấy. Trình duyệt đã làm sẵn
 * việc đó tử tế: mở trang, bấm Lưu PDF, ra tệp có logo, font đúng, chọn được
 * chữ. Cách này app KPI đã dùng và chạy tốt.
 *
 * LOGO LẤY TỪ HUB, không giữ bản riêng ở đây. Logo nằm một chỗ duy nhất —
 * Cài đặt của Marketing Hub — nên đổi logo là mọi báo cáo đổi theo. Mỗi app một
 * bản thì đổi xong không ai biết app nào còn đóng bản cũ lên tệp gửi đối tác.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { taoXlsx } = require('./xlsx');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const hEsc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n0 = (v) => Math.round(num(v)).toLocaleString('vi-VN');
const pct = (v) => (Math.round(num(v) * 1000) / 10).toString().replace('.', ',') + '%';

const HUB = (process.env.SOCIAL_URL_HUB
  || 'http://127.0.0.1:' + (process.env.HUB_PORT || '5180')).replace(/\/+$/, '');

function taiTuHub(duong, giay = 6) {
  return new Promise((giai) => {
    const mod = duong.startsWith('https') ? require('https') : http;
    const req = mod.get(duong, (r) => {
      if (r.statusCode !== 200) { r.resume(); return giai(null); }
      const manh = [];
      r.on('data', (c) => manh.push(c));
      r.on('end', () => giai({ buf: Buffer.concat(manh), mime: r.headers['content-type'] || 'image/png' }));
    });
    req.on('error', () => giai(null));
    req.setTimeout(giay * 1000, () => { req.destroy(); giai(null); });
  });
}

/**
 * Logo đã nhúng base64. Hub tắt thì rơi xuống bản tải về lần trước, rồi mới đến
 * bản chữ. KHÔNG tự vẽ lại logo: vẽ gần đúng một nhãn hiệu rồi đóng lên tệp gửi
 * đối tác thì sai còn khó chịu hơn là không có.
 */
async function logoHtml() {
  const cache = path.join(__dirname, 'du-lieu', 'logo-hub');
  const nhung = (buf, mime) => '<img class="logo" alt="Rooty Trip" src="data:'
    + mime + ';base64,' + buf.toString('base64') + '">';

  const tuHub = await taiTuHub(HUB + '/api/logo');
  if (tuHub && tuHub.buf.length) {
    try {
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      fs.writeFileSync(cache, tuHub.buf);
      fs.writeFileSync(cache + '.mime', tuHub.mime);
    } catch (_) { /* ổ đĩa chỉ đọc thì thôi, không đáng làm hỏng tệp báo cáo */ }
    return nhung(tuHub.buf, tuHub.mime);
  }
  try {
    if (fs.existsSync(cache)) {
      const mime = fs.existsSync(cache + '.mime')
        ? fs.readFileSync(cache + '.mime', 'utf8').trim() : 'image/png';
      return nhung(fs.readFileSync(cache), mime);
    }
  } catch (_) { /* cache hỏng thì rơi xuống bản chữ */ }
  return '<div class="logo-chu"><b>Rooty</b> Trip<span>PHÚ QUỐC</span></div>';
}

/* ---------------- Excel ---------------- */

/**
 * Bài này có ĐO ĐƯỢC lượt xem không.
 *
 * Facebook chỉ trả lượt xem cho video; bài chữ và ảnh không có chỉ số đó. Ghi 0
 * vào báo cáo gửi đối tác là nói sai — đối tác đọc "0 lượt xem, 300 tương tác"
 * rồi hỏi lại, và mình không có câu trả lời nào nghe xuôi. Để trống rồi chú
 * thích một dòng thì đúng sự thật: không đo được, khác hẳn không ai xem.
 *
 * TikTok, Instagram và Zalo đo được mọi dạng bài, nên 0 ở đó là 0 thật.
 */
const KHONG_DO_XEM = new Set(['Bài viết', 'Ảnh', 'Album']);
const doDuocXem = (p) => !(p.platform === 'Facebook' && KHONG_DO_XEM.has(p.type));

/**
 * Ô lượt xem: để trống khi nền tảng KHÔNG ĐO, ghi số khi đã có số.
 *
 * KHÔNG được giấu một con số có thật chỉ vì cột "Dạng" ghi sai. Facebook trả
 * `status_type` cho reels là `added_video`, nhưng những dòng vào Base từ trước lần
 * sửa bảng tra vẫn đang mang dạng "Bài viết". Lọc theo dạng đơn thuần làm 48 bài
 * có tổng 32.852 lượt xem bị xuất ra ô trống — đối tác mở link ra thấy video có
 * người xem mà báo cáo ghi không có gì.
 *
 * Có số thì ghi số. Trống chỉ dành cho trường hợp thật sự không đo được.
 */
const oXem = (p) => (num(p.views) > 0 || doDuocXem(p) ? num(p.views) : null);

/**
 * Ô tiếp cận: Facebook đã gỡ mọi chỉ số đếm NGƯỜI ở mức bài, nên cột này luôn
 * bằng 0 với bài Facebook và TikTok. Ghi số 0 là nói "bài này không ai thấy", sai
 * hẳn; để trống là nói "không đo được", đúng.
 */
const oTiepCan = (p) => (num(p.reach) > 0 ? num(p.reach) : null);

const COT_BAI = ['Ngày đăng', 'Nền tảng', 'Kênh', 'Nhãn', 'Dạng', 'Nội dung', 'Link',
  'Lượt xem', 'Tiếp cận', 'Thích', 'Bình luận', 'Chia sẻ', 'Tương tác'];
const RONG_BAI = [12, 11, 24, 22, 10, 60, 40, 12, 12, 10, 11, 11, 12];

/**
 * Một tệp .xlsx cho một đối tác: sheet đầu là tổng hợp theo nhãn, mỗi nhãn một
 * sheet chi tiết.
 *
 * Bài mang hai nhãn của cùng đối tác sẽ xuất hiện ở hai sheet chi tiết — đúng,
 * vì nó thuộc cả hai — nhưng dòng TỔNG ở sheet đầu đếm mỗi bài một lần, lấy
 * thẳng từ gopTheoDoiTac(). Hai con số ấy khác nhau là có lý do, nên sheet đầu
 * ghi rõ chứ không để người đọc tự cộng rồi thắc mắc.
 */
function excelDoiTac({ doiTac, nhan, tongHop, tu, den }) {
  const tongHang = [
    { dam: true, o: ['Báo cáo hoạt động mạng xã hội'] },
    { o: ['Đối tác', doiTac] },
    { o: ['Khoảng thời gian', tu + ' → ' + den] },
    { o: ['Xuất lúc', new Date().toLocaleString('vi-VN')] },
    { o: [] },
    { dam: true, o: ['Nhãn', 'Số bài', 'Lượt xem', 'Tiếp cận', 'Thích', 'Bình luận', 'Chia sẻ', 'Tương tác'] },
  ];
  nhan.forEach((o) => tongHang.push({
    o: [o.nhan, num(o.soBai), num(o.views), num(o.reach) || null, num(o.likes),
      num(o.comments), num(o.shares), num(o.engagement)],
  }));
  tongHang.push({ o: [] });
  tongHang.push({
    dam: true,
    o: ['TỔNG (mỗi bài đếm một lần)', num(tongHop.soBai), num(tongHop.views), num(tongHop.reach) || null,
      num(tongHop.likes), num(tongHop.comments), num(tongHop.shares), num(tongHop.engagement)],
  });
  tongHang.push({ o: [] });
  tongHang.push({
    o: ['Ghi chú: một bài nhắc nhiều địa điểm của cùng đối tác sẽ nằm ở nhiều sheet chi tiết, '
      + 'nhưng dòng TỔNG chỉ đếm một lần.'],
  });
  tongHang.push({
    o: ['Ô "Lượt xem" để trống nghĩa là Facebook không đo lượt xem cho dạng bài đó '
      + '(bài chữ, ảnh) — không phải không có ai xem. Video và Reels thì luôn có số.'],
  });

  const sheets = [{ ten: 'Tổng hợp', rong: [30, 10, 14, 14, 10, 12, 11, 12], hang: tongHang }];

  nhan.forEach((o) => {
    const hang = [{ dam: true, o: COT_BAI }];
    (o.bai || []).forEach((p) => hang.push({
      o: [
        String(p.date || '').slice(0, 10), p.platform || '', p.channel || '', o.nhan, p.type || '',
        String(p.title || '').replace(/\s+/g, ' ').slice(0, 500), p.url || '',
        oXem(p), oTiepCan(p), num(p.likes), num(p.comments), num(p.shares), num(p.engagement),
      ],
    }));
    sheets.push({ ten: o.nhan, rong: RONG_BAI, hang });
  });

  return taoXlsx(sheets);
}

/* ---------------- trang in ---------------- */

/**
 * Trang A4 in được. Bấm "Lưu PDF" là ra tệp PDF có logo.
 *
 * `@page` phải khai khổ: không khai thì trình duyệt lấy khổ mặc định của máy in
 * và bảng rộng bị cắt mất mép phải — lỗi app KPI đã trả giá. Và chỉ tránh ngắt
 * ở đơn vị NHỎ (một hàng bảng), chứ đặt `break-inside: avoid` lên cả khối dài
 * hơn một mặt giấy thì trình duyệt đành đẩy sang trang mới rồi vẫn cắt, để lại
 * nửa trang trắng.
 */
function trangIn({ doiTac, nhan, tongHop, tu, den, logo, soBaiMoiNhan = 40 }) {
  const dong = (o) => '<tr><td class="ten">' + hEsc(o.nhan) + '</td>'
    + '<td class="s">' + n0(o.soBai) + '</td>'
    + '<td class="s">' + n0(o.views) + '</td>'
    + '<td class="s">' + (num(o.reach) ? n0(o.reach) : '—') + '</td>'
    + '<td class="s">' + n0(o.engagement) + '</td>'
    + '<td class="s">' + pct(o.tyLeTuongTac) + '</td></tr>';

  const bangBai = (o) => {
    const ds = (o.bai || []).slice(0, soBaiMoiNhan);
    if (!ds.length) return '';
    return '<h3>' + hEsc(o.nhan) + ' <span class="phu">' + n0(o.soBai) + ' bài'
      + (o.soBai > ds.length ? ' · liệt kê ' + ds.length + ' bài nhiều lượt xem nhất' : '')
      + '</span></h3>'
      + '<table class="bai"><thead><tr><th>Ngày</th><th>Nền tảng</th><th>Nội dung</th>'
      + '<th class="s">Lượt xem</th><th class="s">Tương tác</th></tr></thead><tbody>'
      + ds.map((p) => '<tr><td class="ng">' + hEsc(String(p.date || '').slice(0, 10)) + '</td>'
        + '<td>' + hEsc(p.platform || '') + '</td>'
        + '<td class="nd">' + hEsc(String(p.title || '(không tiêu đề)').replace(/\s+/g, ' ').slice(0, 150))
        + '</td>'
        + '<td class="s">' + (doDuocXem(p) ? n0(p.views) : '<span class="kdd">—</span>') + '</td>'
        + '<td class="s">' + n0(p.engagement) + '</td></tr>').join('')
      + '</tbody></table>';
  };

  return '<!doctype html><html lang="vi"><head><meta charset="utf-8">'
    + '<title>Báo cáo ' + hEsc(doiTac) + ' · ' + hEsc(tu) + ' → ' + hEsc(den) + '</title>'
    + '<style>'
    + '@page { size: A4 portrait; margin: 14mm 12mm; }'
    + '* { box-sizing: border-box; }'
    + 'body { margin: 0; background: #eef1f5; color: #15212b;'
    + " font: 13px/1.55 'Segoe UI', system-ui, -apple-system, sans-serif; }"
    + '.to { max-width: 190mm; margin: 18px auto; background: #fff; padding: 22px 26px 30px; }'
    + '.dau { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px;'
    + ' border-bottom: 2px solid #15212b; padding-bottom: 14px; }'
    + '.logo { max-height: 52px; max-width: 200px; display: block; }'
    + '.logo-chu { font-size: 21px; font-weight: 700; line-height: 1.1; }'
    + '.logo-chu b { color: #0a6a6a; } .logo-chu span { display: block; font-size: 9px;'
    + ' letter-spacing: .22em; color: #6b7c88; font-weight: 600; }'
    + '.tieu { text-align: right; }'
    + '.tieu h1 { margin: 0; font-size: 19px; letter-spacing: -.01em; }'
    + '.tieu .dt { font-size: 15px; font-weight: 600; color: #0a6a6a; margin-top: 2px; }'
    + '.tieu .ky { font-size: 12px; color: #60707c; margin-top: 3px; }'
    + '.oso { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 6px; }'
    + '.oso > div { flex: 1 1 120px; border: 1px solid #dde4ea; padding: 10px 12px; }'
    + '.oso .nh { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #6b7c88; }'
    + '.oso .gt { font-size: 20px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }'
    + 'h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #15212b; }'
    + 'h3 { font-size: 12.5px; margin: 16px 0 6px; }'
    + 'h3 .phu { font-weight: 400; color: #6b7c88; font-size: 11px; }'
    + 'table { width: 100%; border-collapse: collapse; font-size: 11.5px; }'
    + 'th { text-align: left; font-size: 9.5px; letter-spacing: .07em; text-transform: uppercase;'
    + ' color: #6b7c88; border-bottom: 1px solid #c9d4dd; padding: 6px 8px 6px 0; }'
    + 'td { padding: 6px 8px 6px 0; border-bottom: 1px solid #edf1f4; vertical-align: top; }'
    + 'td.ten { font-weight: 600; } td.ng { white-space: nowrap; color: #60707c; }'
    + 'td.nd { color: #3d4d59; }'
    + 'th.s, td.s { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }'
    + 'tr { break-inside: avoid; }'
    + '.kdd { color: #9aa8b2; }'
    + '.chan { margin-top: 26px; padding-top: 12px; border-top: 1px solid #dde4ea;'
    + ' font-size: 10.5px; color: #78868f; }'
    + '.nut { position: sticky; top: 0; background: #15212b; padding: 10px 16px; display: flex;'
    + ' gap: 10px; align-items: center; }'
    + '.nut button { font: inherit; font-size: 12.5px; padding: 6px 14px; border: 0; cursor: pointer;'
    + ' background: #0a6a6a; color: #fff; }'
    + '.nut span { color: #9fb0bb; font-size: 12px; }'
    + '@media print { .nut { display: none; } body { background: #fff; }'
    + ' .to { margin: 0; max-width: none; padding: 0; } }'
    + '</style></head><body>'
    + '<div class="nut"><button onclick="window.print()">Lưu PDF / In</button>'
    + '<span>Bấm rồi chọn "Lưu dưới dạng PDF" trong hộp in.</span></div>'
    + '<div class="to">'
    + '<div class="dau">' + logo
    + '<div class="tieu"><h1>Báo cáo hoạt động mạng xã hội</h1>'
    + '<div class="dt">' + hEsc(doiTac) + '</div>'
    + '<div class="ky">' + hEsc(tu) + ' → ' + hEsc(den) + '</div></div></div>'

    + '<div class="oso">'
    + '<div><div class="nh">Số bài</div><div class="gt">' + n0(tongHop.soBai) + '</div></div>'
    + '<div><div class="nh">Lượt xem</div><div class="gt">' + n0(tongHop.views) + '</div></div>'
    + '<div><div class="nh">Tương tác</div><div class="gt">' + n0(tongHop.engagement) + '</div></div>'
    + '<div><div class="nh">Tỷ lệ tương tác</div><div class="gt">' + pct(tongHop.tyLeTuongTac) + '</div></div>'
    + '</div>'

    + '<h2>Theo từng nhãn</h2>'
    + '<table><thead><tr><th>Nhãn</th><th class="s">Bài</th><th class="s">Lượt xem</th>'
    + '<th class="s">Tiếp cận</th><th class="s">Tương tác</th><th class="s">Tỷ lệ TT</th></tr></thead>'
    + '<tbody>' + nhan.map(dong).join('') + '</tbody></table>'

    + '<h2>Danh sách bài đăng</h2>'
    + nhan.map(bangBai).join('')

    + '<div class="chan">Số liệu lấy trực tiếp từ API của TikTok, Facebook, Instagram và Zalo OA,'
    + ' tổng hợp trong hệ thống Marketing Hub của Rooty Trip Phú Quốc.'
    + ' Bài được gắn cho đối tác theo hashtag trong nội dung bài đăng.'
    + ' Một bài nhắc nhiều địa điểm của cùng đối tác chỉ được đếm một lần trong phần tổng.'
    + ' Dấu — nghĩa là Facebook KHÔNG CUNG CẤP số đó qua API cho dạng bài đó,'
    + ' không phải không có ai xem: bài chữ và ảnh không có lượt xem lẫn tiếp cận'
    + ' (đã thử từng chỉ số một, trên mọi phiên bản API từ v18 đến v23).'
    + ' Video và Reels thì luôn có đủ cả hai, và lượt xem là tổng lượt phát —'
    + ' đúng con số Meta hiển thị.'
    + '<br>Xuất lúc ' + hEsc(new Date().toLocaleString('vi-VN')) + '.</div>'
    + '</div></body></html>';
}

module.exports = { excelDoiTac, trangIn, logoHtml, doDuocXem, oXem, oTiepCan, COT_BAI };
