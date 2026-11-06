'use strict';
/**
 * Thống kê booking khách sạn theo tuần, gửi vào nhóm Booking KS lúc 17:00 thứ 7
 * (anh Hùng chốt 05/11/2026).
 *
 * Tuần đo lường: thứ 7 tuần trước 00:00 → thứ 6 tuần này 23:59 (giờ VN). Gửi thứ 7
 * ngày D thì khung là D-7 … D-1. Booking tính theo NGÀY ĐẶT trong khung; so với
 * khung liền trước (D-14 … D-8).
 *
 * Phần tính và soạn thẻ là hàm thuần (test được); phần hẹn giờ và gửi ở cuối tệp.
 */
const { tenQuocGia } = require('./bao-nhom');

const cong = (ngay, n) => new Date(Date.parse(ngay + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const homNayVN = (ms = Date.now()) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const dm = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
const huy = (b) => b.trangThai === 'Đã huỷ';
const tien = (b) => Number(b.soTien) || Number(b.giaBan) || 0;
const vnd = (n) => Math.round(n).toLocaleString('vi-VN') + ' đ';
const trieu = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('vi-VN') + ' tr' : vnd(n));

/** Khung tuần cho ngày gửi (YYYY-MM-DD, là thứ 7): { tu, den } đều tính cả hai đầu. */
function khungTuan(ngayGui) {
  return { tu: cong(ngayGui, -7), den: cong(ngayGui, -1) };
}

/** Số liệu của các đơn đặt trong [tu, den]. */
function tongHop(rows, tu, den) {
  const trong = rows.filter((b) => {
    const d = String(b.ngayDat || '').slice(0, 10);
    return d && d >= tu && d <= den;
  });
  const con = trong.filter((b) => !huy(b));
  const theoKenh = {};
  for (const b of trong) {
    const k = b.kenh || 'Khác';
    const o = theoKenh[k] || (theoKenh[k] = { kenh: k, dat: 0, huy: 0, dem: 0, tien: 0 });
    o.dat++;
    if (huy(b)) o.huy++;
    else { o.dem += Number(b.soDem) || 0; o.tien += tien(b); }
  }
  const qg = {};
  for (const b of con) {
    const t = tenQuocGia(b.quocGia);
    if (t) qg[t] = (qg[t] || 0) + 1;
  }
  const truoc = con.filter((b) => b.nhanPhong && b.ngayDat).map((b) =>
    Math.round((Date.parse(b.nhanPhong + 'T00:00:00Z') - Date.parse(b.ngayDat.slice(0, 10) + 'T00:00:00Z')) / 864e5));
  return {
    tu, den,
    dat: trong.length,
    huy: trong.length - con.length,
    con: con.length,
    dem: con.reduce((t, b) => t + (Number(b.soDem) || 0), 0),
    tien: con.reduce((t, b) => t + tien(b), 0),
    datTruocTb: truoc.length ? Math.round(truoc.reduce((t, x) => t + x, 0) / truoc.length) : null,
    kenh: Object.values(theoKenh).sort((a, b) => b.tien - a.tien || b.dat - a.dat),
    quocGia: Object.entries(qg).sort((a, b) => b[1] - a[1]),
  };
}

/** Đơn còn hiệu lực nhận phòng trong 7 ngày tới (từ ngày gửi). */
function nhanTuanToi(rows, ngayGui) {
  const den = cong(ngayGui, 6);
  return rows.filter((b) => !huy(b) && b.nhanPhong && b.nhanPhong >= ngayGui && b.nhanPhong <= den).length;
}

function lech(nay, truoc, dinhDang = (x) => String(x)) {
  if (truoc == null) return '';
  const d = nay - truoc;
  if (!d) return 'bằng tuần trước';
  return (d > 0 ? '▲ ' : '▼ ') + dinhDang(Math.abs(d)) + ' so với tuần trước';
}

const o = (nhan, giaTri, phu, mau) => ({
  tag: 'column', width: 'weighted', weight: 1, background_style: mau, padding: '10px 8px 10px 8px',
  elements: [{ tag: 'markdown', text_align: 'center',
    content: nhan + '\n**' + giaTri + '**' + (phu ? '\n<font color="grey">' + phu + '</font>' : '') }],
});

/** Thẻ Lark (schema 2.0). */
function dungThe(th, truoc, { nhanToi = null } = {}) {
  const el = [];
  el.push({ tag: 'column_set', horizontal_spacing: '8px', columns: [
    o('Booking giữ được', th.con, lech(th.con, truoc && truoc.con), 'green-100'),
    o('Doanh thu', trieu(th.tien), lech(th.tien, truoc && truoc.tien, trieu), 'turquoise-100'),
  ] });
  el.push({ tag: 'column_set', horizontal_spacing: '8px', columns: [
    o('Booking mới', th.dat, '', 'grey-100'),
    o('Đã huỷ', th.huy, th.dat ? Math.round((th.huy / th.dat) * 100) + '% số đặt' : '', th.huy ? 'red-100' : 'grey-100'),
    o('Đêm phòng', th.dem, th.datTruocTb != null ? 'đặt trước TB ' + th.datTruocTb + ' ngày' : '', 'grey-100'),
  ] });

  if (th.kenh.length) {
    el.push({ tag: 'markdown', content: '**Theo kênh**' });
    el.push({
      tag: 'table', page_size: 10, row_height: 'low', freeze_first_column: true,
      header_style: { bold: true, background_style: 'grey', text_align: 'center' },
      columns: [
        { name: 'kenh', display_name: 'Kênh', data_type: 'text', width: 'auto' },
        { name: 'dat', display_name: 'Đặt', data_type: 'number', horizontal_align: 'right', width: 'auto' },
        { name: 'huy', display_name: 'Huỷ', data_type: 'number', horizontal_align: 'right', width: 'auto' },
        { name: 'dem', display_name: 'Đêm', data_type: 'number', horizontal_align: 'right', width: 'auto' },
        { name: 'tien', display_name: 'Doanh thu', data_type: 'text', horizontal_align: 'right', width: 'auto' },
      ],
      rows: th.kenh.map((k) => ({ kenh: k.kenh, dat: k.dat, huy: k.huy, dem: k.dem, tien: vnd(k.tien) })),
    });
  }
  const dong = [];
  if (th.quocGia.length) dong.push('**Khách theo quốc gia:** ' + th.quocGia.slice(0, 6).map(([t, n]) => t + ' ' + n).join(' · '));
  if (nhanToi != null) dong.push('**Nhận phòng 7 ngày tới:** ' + nhanToi + ' booking');
  if (dong.length) el.push({ tag: 'markdown', content: dong.join('\n') });
  el.push({ tag: 'markdown', text_size: 'notation',
    content: '<font color="grey">Tính theo ngày đặt, từ thứ 7 ' + dm(th.tu) + ' đến thứ 6 ' + dm(th.den) +
      '. Doanh thu là số tiền GoHost ghi của booking chưa huỷ.</font>' });

  return {
    schema: '2.0',
    config: { wide_screen_mode: true },
    header: {
      template: 'turquoise',
      title: { tag: 'plain_text', content: 'Booking khách sạn tuần ' + dm(th.tu) + ' – ' + dm(th.den) },
      subtitle: { tag: 'plain_text', content: 'Pito Hotel · Routine Hospitality' },
    },
    body: { elements: el },
  };
}

/** Soạn thẻ tuần cho ngày gửi từ danh sách đơn. */
function soanTuan(rows, ngayGui) {
  const { tu, den } = khungTuan(ngayGui);
  const th = tongHop(rows, tu, den);
  const truoc = tongHop(rows, cong(tu, -7), cong(den, -7));
  /* Tuần trước chưa có đơn nào (Base mới có dữ liệu từ 31/10/2026) thì không so. */
  return { th, the: dungThe(th, truoc.dat ? truoc : null, { nhanToi: nhanTuanToi(rows, ngayGui) }) };
}

/* ---------------- hẹn giờ ---------------- */

/** Có tới giờ gửi chưa: thứ 7, từ 17:00 tới 17:59 giờ VN. */
function toiGio(ms = Date.now()) {
  const d = new Date(ms + 7 * 3600e3);
  return d.getUTCDay() === 6 && d.getUTCHours() === 17;
}

let daGui = '';
/**
 * Mỗi phút gọi một lần. Đúng khung giờ thì gửi một lần trong ngày. `uuid` của Lark
 * (khoá theo ngày) chặn gửi trùng khi Render khởi động lại trong cùng giờ.
 */
async function thu({ guiTin, docRows, chatId, ms = Date.now() }) {
  if (!toiGio(ms)) return null;
  const ngay = homNayVN(ms);
  if (daGui === ngay) return null;
  const { the, th } = soanTuan(await docRows(), ngay);
  const r = await guiTin.gui({ chatId, card: the, khoa: 'rt-tuan-' + ngay });
  if (r && r.ok) daGui = ngay;
  else console.error('[routine] gửi thống kê tuần hỏng:', r && r.loi);
  return { ...r, th };
}

module.exports = { khungTuan, tongHop, nhanTuanToi, dungThe, soanTuan, toiGio, thu };
