'use strict';
/**
 * Soạn tin báo cáo gửi vào nhóm chat.
 *
 * Tách hẳn khỏi server.js để test được nội dung tin mà không phải gửi thật vào
 * nhóm. Một hàm soạn tin không có test là chỗ dễ hỏng nhất: sai một chữ trong
 * JSON thẻ thì Lark từ chối, mà lỗi trả về chỉ nói "invalid card".
 *
 * Trả cả `card` và `text`: thẻ đẹp hơn nhưng schema thẻ là thứ Lark có thể siết
 * lại, nên server luôn giữ đường lùi về tin text thuần (xem server.js → guiVeNhom).
 *
 * MỘT LẦN BÁO CÁO = NHIỀU MỤC, và chỉ MỘT TIN. Một buổi có thể có mấy thư mục,
 * khác Tour hoặc khác Ghép/VIP. Nên `soan()` nhận MẢNG và gộp thành một tin: nhóm
 * đọc một lần là biết cả buổi làm được gì, không ai phải cuộn qua mấy tin gần
 * giống nhau để tìm cái mình cần xem.
 *
 * KHÔNG DÙNG NÚT BẤM — quyết định của anh Hùng (10/09/2026). App đang khép kín:
 * người xem ảnh trong nhóm không có đường vào app, nên nút "Nghiệm thu trong app"
 * chỉ dẫn tới một cánh cửa họ không mở được. Có vấn đề thì họ nhắn thẳng trong
 * nhóm, nhân sự tự chỉnh. Link thư mục vẫn bấm được, nhưng để dạng link chữ trong
 * thân tin chứ không phải nút.
 */

const cfg = require('./config');

const pt = (content) => ({ tag: 'plain_text', content: String(content) });
const md = (content) => ({ tag: 'lark_md', content: String(content) });

/** Chỉ nhận http(s). Link rác lọt vào tin thì Lark có thể từ chối cả thẻ. */
function linkSach(v) {
  const s = String(v || '').trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : '';
}

const ngayGon = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(key || '');
};

const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('vi-VN');

/** Tên người chỉnh của một mục, rơi về tên người bấm nút nếu mục chưa ghi ai. */
const tenNguoi = (bc, nguoiTen) => (bc.nguoiLam || []).map((u) => u.name)
  .filter(Boolean).join(', ') || nguoiTen || '—';

/** "120 ảnh · 3 video" */
function dem(bc) {
  const ra = [];
  if (bc.soAnh) ra.push(n0(bc.soAnh) + ' ảnh');
  if (bc.soVideo) ra.push(n0(bc.soVideo) + ' video');
  return ra.join(' · ');
}

/** Link thư mục dạng markdown — bấm được trong thẻ Lark, không cần nút. */
function link(bc) {
  const anh = linkSach(bc.linkAnh);
  const video = linkSach(bc.linkVideo);
  return [
    anh ? '[Thư mục ảnh](' + anh + ')' : '',
    video ? '[Thư mục video](' + video + ')' : '',
  ].filter(Boolean).join('  ·  ');
}

/**
 * Tiêu đề thẻ — GIỐNG NHAU cho một mục và nhiều mục.
 *
 * Người đọc là Media và CSKH, không phải người chỉnh ảnh. Họ cần biết ngay "media
 * giao khách của ngày nào"; tên thư mục nội bộ (TOUR ĐẢO · Ghép · …) nằm trong thân
 * tin. Ngày chỉ in khi CHẮC CHẮN là một ngày — nhiều lô khác ngày thì bỏ trống, in
 * một ngày lên tiêu đề khi thực tế khác nhau là nói sai.
 */
function tieuDe(ngayChung, capNhat) {
  return cfg.tieuDeTin
    + (ngayChung ? ' · ' + ngayChung : '')
    + (capNhat ? ' · cập nhật' : '');
}

/** Giờ Việt Nam dạng 'HH:mm dd/MM'. Server có thể chạy ở múi giờ khác. */
function hienGio(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600 * 1000);
  const s = t.toISOString();
  return s.slice(11, 16) + ' ' + s.slice(8, 10) + '/' + s.slice(5, 7);
}

/* ---------------- một mục ---------------- */

function theMotMuc(bc, { nguoiTen, capNhat }) {
  const hangMuc = (bc.hangMuc || []).join(' · ') || '—';
  const d = dem(bc);

  /* Tên thư mục chuyển từ TIÊU ĐỀ xuống thân tin (10/09/2026): tiêu đề giờ nói cho
   * Media/CSKH, nhưng tên thư mục vẫn phải còn — đó là thứ người chỉnh đối chiếu. */
  const elements = [{
    tag: 'div',
    text: md('**' + (bc.thuMuc || '(chưa đặt tên thư mục)') + '**'),
  }, {
    tag: 'div',
    fields: [
      { is_short: true, text: md('**Tour**\n' + (bc.tour || '—')) },
      { is_short: true, text: md('**Loại**\n' + (bc.loai || '—')) },
      { is_short: true, text: md('**Ngày tác nghiệp**\n' + (ngayGon(bc.ngay) || '—')) },
      { is_short: true, text: md('**Hạng mục**\n' + hangMuc) },
      { is_short: true, text: md('**Người chỉnh**\n' + tenNguoi(bc, nguoiTen)) },
      { is_short: true, text: md('**Số lượng**\n' + (d || '—')) },
    ],
  }];

  const l = link(bc);
  if (l) elements.push({ tag: 'div', text: md(l) });
  /* Ghi chú KHÔNG vào tin — xem lý do ở theNhieuMuc(). Giữ cùng một quy tắc cho cả
   * hai kiểu thẻ, không thì báo 1 lô thấy ghi chú mà báo 2 lô lại không. */

  return {
    elements,
    header: {
      template: capNhat ? 'orange' : 'turquoise',
      title: pt(tieuDe(ngayGon(bc.ngay), capNhat)),
    },
  };
}

function chuMotMuc(bc, { nguoiTen, capNhat }) {
  const anh = linkSach(bc.linkAnh);
  const video = linkSach(bc.linkVideo);
  const d = dem(bc);
  const dong = [
    tieuDe(ngayGon(bc.ngay), capNhat),
    (bc.thuMuc || '(chưa đặt tên thư mục)'),
    'Hạng mục: ' + ((bc.hangMuc || []).join(' · ') || '—') + (d ? '  (' + d + ')' : ''),
    'Người chỉnh: ' + tenNguoi(bc, nguoiTen),
  ];
  if (anh) dong.push('Ảnh: ' + anh);
  if (video) dong.push('Video: ' + video);
  dong.push('Trạng thái: ' + (bc.trangThai || 'Chờ nghiệm thu'));
  return dong.join('\n');
}

/* ---------------- nhiều mục ---------------- */

function theNhieuMuc(ds, { nguoiTen, ngayChung }) {
  const elements = [];

  const tongAnh = ds.reduce((a, b) => a + (Number(b.soAnh) || 0), 0);
  const tongVideo = ds.reduce((a, b) => a + (Number(b.soVideo) || 0), 0);
  const nguoi = [...new Set(ds.flatMap((b) => (b.nguoiLam || []).map((u) => u.name)))]
    .filter(Boolean);

  elements.push({
    tag: 'div',
    fields: [
      { is_short: true, text: md('**Số lô**\n' + ds.length) },
      { is_short: true, text: md('**Tổng**\n' + ([
        tongAnh ? n0(tongAnh) + ' ảnh' : '',
        tongVideo ? n0(tongVideo) + ' video' : '',
      ].filter(Boolean).join(' · ') || '—')) },
      { is_short: true, text: md('**Người chỉnh**\n' + (nguoi.join(', ') || nguoiTen || '—')) },
      { is_short: true, text: md('**Ngày tác nghiệp**\n' + (ngayChung || '—')) },
    ],
  });
  elements.push({ tag: 'hr' });

  /* Mỗi mục là MỘT KHỐI riêng, cách nhau bằng đường kẻ.
   *
   * Trước đây gộp mọi thứ vào một đoạn ("hạng mục · số lượng · do ai · link") thì
   * hai mục trôi thành một khối chữ xám, không thấy mục nào kết thúc ở đâu — anh
   * Hùng phản hồi đúng chỗ này (10/09/2026). Giờ tách ba dòng cố định:
   *
   *   **1 · TOUR ĐẢO · Ghép · 10.09.2026**     ← tên thư mục, đậm
   *   Chỉnh ảnh · 124 ảnh · do Nguyễn Thanh    ← làm gì, bao nhiêu, ai làm
   *   Thư mục ảnh · Thư mục video              ← link đứng RIÊNG một dòng
   *
   * Link phải đứng riêng: nhét cuối câu thì mắt phải đọc hết câu mới thấy chỗ bấm,
   * mà đó lại là thứ Media cần bấm đầu tiên. */
  ds.forEach((bc, i) => {
    if (i > 0) elements.push({ tag: 'hr' });

    const dong = ['**' + (i + 1) + ' · ' + (bc.thuMuc || '(chưa đặt tên thư mục)') + '**'];

    const giua = [(bc.hangMuc || []).join(' · '), dem(bc), 'do ' + tenNguoi(bc, nguoiTen)]
      .filter(Boolean).join(' · ');
    if (giua) dong.push(giua);

    const l = link(bc);
    if (l) dong.push(l);
    /* KHÔNG in ghi chú vào tin (anh Hùng chốt 10/09/2026): hai dòng trên đã đủ cho
     * Media và CSKH, thêm dòng chữ nghiêng chỉ làm khối mục dài và rối. Ghi chú vẫn
     * nằm nguyên trên Base và trong app — không mất gì, chỉ là không đẩy vào nhóm. */

    elements.push({ tag: 'div', text: md(dong.join('\n')) });
  });

  return {
    elements,
    header: { template: 'turquoise', title: pt(tieuDe(ngayChung, false)) },
  };
}

function chuNhieuMuc(ds, { nguoiTen, ngayChung }) {
  const tongAnh = ds.reduce((a, b) => a + (Number(b.soAnh) || 0), 0);
  const tongVideo = ds.reduce((a, b) => a + (Number(b.soVideo) || 0), 0);
  const dong = [
    tieuDe(ngayChung, false),
    ds.length + ' lô'
      + '  (' + ([
        tongAnh ? n0(tongAnh) + ' ảnh' : '',
        tongVideo ? n0(tongVideo) + ' video' : '',
      ].filter(Boolean).join(' · ') || 'chưa ghi số lượng') + ')',
    '',
  ];
  ds.forEach((bc, i) => {
    const d = dem(bc);
    dong.push((i + 1) + '. ' + (bc.thuMuc || '(chưa đặt tên)'));
    dong.push('   ' + [(bc.hangMuc || []).join(' · '), d, 'do ' + tenNguoi(bc, nguoiTen)]
      .filter(Boolean).join(' · '));
    const anh = linkSach(bc.linkAnh);
    const video = linkSach(bc.linkVideo);
    if (anh) dong.push('   Ảnh: ' + anh);
    if (video) dong.push('   Video: ' + video);
  });
  return dong.join('\n');
}

/* ---------------- cửa vào ---------------- */

/**
 * `bc` là một báo cáo hoặc MẢNG báo cáo (xem store.docBaoCao).
 * `nguoiTen` = tên người bấm Báo cáo · `capNhat` = lần báo lại của lô đã có.
 */
function soan(bc, o = {}) {
  const ds = (Array.isArray(bc) ? bc : [bc]).filter(Boolean);
  const nguoiTen = o.nguoiTen || '';

  if (ds.length <= 1) {
    const mot = ds[0] || {};
    const t = theMotMuc(mot, { nguoiTen, capNhat: !!o.capNhat });
    return {
      text: chuMotMuc(mot, { nguoiTen, capNhat: !!o.capNhat }),
      card: dungThe(t, { nguoiTen }),
    };
  }

  /* Ngày chung chỉ hiện khi CẢ ĐÁM cùng một ngày. Khác ngày mà vẫn in một ngày
   * lên tiêu đề là nói sai — lúc đó bỏ trống, ngày nằm trong từng mục. */
  const ngay = [...new Set(ds.map((b) => b.ngay).filter(Boolean))];
  const ngayChung = ngay.length === 1 ? ngayGon(ngay[0]) : '';

  const t = theNhieuMuc(ds, { nguoiTen, ngayChung });
  return {
    text: chuNhieuMuc(ds, { nguoiTen, ngayChung }),
    card: dungThe(t, { nguoiTen }),
  };
}

function dungThe({ elements, header }, { nguoiTen }) {
  /* Dòng cuối nói rõ ai bấm gửi và lúc nào — nhóm cần biết để hỏi lại đúng người,
   * và để phân biệt tin do app đẩy với tin người tự gõ tay như trước.
   * Có đường kẻ trước nó, nếu không dòng chữ ký dính vào mục cuối. */
  const els = elements.concat([{ tag: 'hr' }, {
    tag: 'note',
    elements: [pt((nguoiTen ? nguoiTen + ' báo cáo' : 'Báo cáo') + ' · ' + hienGio()
      + ' · qua app Chỉnh ảnh')],
  }]);
  return { config: { wide_screen_mode: true }, header, elements: els };
}

/** Thẻ thông báo kết quả nghiệm thu — gửi tiếp vào cùng nhóm. */
function soanNghiemThu(bc, { nguoiTen = '' } = {}) {
  const dat = bc.trangThai === 'Đạt';
  const text = (dat ? 'Đã nghiệm thu ĐẠT' : 'Yêu cầu SỬA LẠI') + ': ' + (bc.thuMuc || '')
    + (bc.nhanXet ? '\nNhận xét: ' + bc.nhanXet : '')
    + (nguoiTen ? '\nNgười nghiệm thu: ' + nguoiTen : '')
    + '\nNgười chỉnh: ' + tenNguoi(bc, '');

  const elements = [{
    tag: 'div',
    text: md(dat ? '**Đạt** — sản phẩm được duyệt.' : '**Cần sửa lại** — nhờ bạn chỉnh và báo cáo lại.'),
  }, {
    tag: 'div',
    fields: [
      { is_short: true, text: md('**Người chỉnh**\n' + tenNguoi(bc, '')) },
      { is_short: true, text: md('**Số lượng**\n' + (dem(bc) || '—')) },
    ],
  }];
  if (bc.nhanXet) elements.push({ tag: 'div', text: md('**Nhận xét**\n' + bc.nhanXet) });
  const l = link(bc);
  if (l) elements.push({ tag: 'div', text: md(l) });
  elements.push({
    tag: 'note',
    elements: [pt((nguoiTen ? nguoiTen + ' nghiệm thu' : 'Nghiệm thu') + ' · ' + hienGio())],
  });

  return {
    text,
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: dat ? 'green' : 'red',
        title: pt((dat ? 'Đạt · ' : 'Cần sửa lại · ') + (bc.thuMuc || '')),
      },
      elements,
    },
  };
}

module.exports = { soan, soanNghiemThu, linkSach, ngayGon, hienGio, dem, link };
