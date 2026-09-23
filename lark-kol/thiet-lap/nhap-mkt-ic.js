'use strict';
/**
 * Nhập dữ liệu KOL cũ từ Base "MKT IC" (wiki TZ5nw06Cji3ywykl2D2lCesVg9g, bảng tblY7W4XVfW4F1l9)
 * sang Base KOL mới. Anh Hùng gửi 23/09/2026.
 *
 * Bảng cũ là MỘT bảng phẳng: mỗi dòng = KOL + kênh + chuyến + bảng kê (ảnh) + bàn giao (chữ).
 * Tách ra đúng các bảng mới; bảng kê cũ là ẢNH nên chỉ giữ TỔNG chi phí thành một dòng
 * "Tổng chi phí theo bảng kê cũ" (đánh dấu Cần kiểm lại); lịch trình theo ngày được tách
 * thành từng mốc để hiện trên dòng thời gian và sơ đồ.
 *
 * Chạy lại được: KOL đã có (so theo tên) thì bỏ qua. Châu Kim Cương đã có sẵn → chỉ bổ sung link kênh.
 *   node thiet-lap/nhap-mkt-ic.js [--that]
 */
const cfg = require('../config');
const lark = require('../lark');
const kho = require('../kho');
const T = require('../tinh');
const MV = require('../public/ma-vung');

const THAT = process.argv.includes('--that');
const NGUON = { base: 'IbM8bc8mvaH6VksYfGVl0xUegxc', bang: 'tblY7W4XVfW4F1l9' };
const COT = { fldWtEzg50: 'nenTangTra', fldtuEOb5l: 'batDau', flddAb6Tgx: 'ketThuc', flde2G421X: 'sdt', fldirwpNlq: 'daXong', fldA7aUcUs: 'banGiao',
  fldddp4LGa: 'ten', fld82tcKvQ: 'qg', fldZznmAjy: 'email', fldDi0244S: 'taiTro', fldQ1iqj0h: 'daGuiBgd', fld1o3dQDI: 'tong', flddeRhxCN: 'linkFB',
  fldA6waS1Z: 'linkYT', flduh3STOw: 'nl', fldrrtip0P: 'fTT', fldaADvObL: 'fFB', fldqzYQodb: 'eb', fld7p4Qcqo: 'te', fldwyFJCI7: 'yt', fldll5Hw8k: 'tt',
  fldPRM5AA3: 'linkTT', fldGOUBTEY: 'fb', fldNbrHthB: 'theoDoi', fld3nwsFY1: 'ig', fldwSGDIsr: 'linkIG', fld30RnhSi: 'fIG' };
/* Xưng hô + tên gọi — bảng cũ không có, anh Hùng sửa lại được trong app. */
const GOI = { 'PHẠM THU TRANG': ['Chị', 'Trang'], 'Kim Hye-young': ['Chị', 'Hye-young'], 'VŨ PHẠM ĐÌNH THÁI': ['Anh', 'Thái'], 'HUỲNH VĂN HOÀNG': ['Anh', 'Hoàng'], 'CHÂU KIM CƯƠNG': ['Chị', 'Cương'] };

/* "[Tên](https://…)" → {chu, link}; "Không" → rỗng */
function md(v) {
  const s = String(Array.isArray(v) ? v.map((x) => (x && x.text) || x).join('') : v || '').trim();
  const m = /^\[([^\]]*)\]\(([^)]*)\)/.exec(s);
  const chu = (m ? m[1] : s).replace(/\s+/g, ' ').trim();
  const link = m ? m[2].trim() : /^https?:\/\//.test(s) ? s : '';
  const rong = (x) => !x || /^không$/i.test(x);
  return { chu: rong(chu) ? '' : chu, link: /^https?:\/\/(?!Không)/i.test(link) ? link : '' };
}
const ngay = (v) => (v ? Date.parse(v) : 0);
const tenKenh = (a, b) => md(a).chu || md(b).chu.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60);

function kenhCua(o) {
  const ds = [];
  const them = (nenTang, ten, link, theoDoi) => { if (ten || link) ds.push({ nenTang, ten: ten || nenTang, link, theoDoi: theoDoi || null, capNhat: Date.now() }); };
  them('TikTok', md(o.tt).chu || (md(o.linkTT).link.match(/@([\w.]+)/) || [])[1], md(o.linkTT).link || md(o.tt).link, o.fTT);
  them('Facebook', md(o.fb).chu, md(o.linkFB).link || md(o.fb).link, o.fFB);
  them('YouTube', md(o.yt).chu, md(o.linkYT).link, o.theoDoi);
  them('Instagram', md(o.ig).chu, md(o.linkIG).link, o.fIG);
  return ds;
}

function nhomCua(t) {
  const s = t.toLowerCase();
  if (/khách sạn|lưu trú|check-out|trả phòng|wyndham|extra bed/.test(s)) return 'Lưu trú';
  if (/ăn|bữa|bửa|nhà hàng/.test(s)) return 'Ăn uống';
  if (/đón bay|tiễn bay|xe/.test(s)) return 'Di chuyển';
  if (/vé|vinwonders|safari|grand world|cáp treo/.test(s)) return 'Vé tham quan';
  return 'Tour';
}
/** "- Ngày 13/07/2026: Vinwonders; Grand World; Ăn tối" → mốc theo ngày. */
function lichTrinh(taiTro, batDau) {
  const out = [];
  for (const dong of String(taiTro || '').split('\n')) {
    const m = /Ngày\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*:?\s*(.*)$/i.exec(dong);
    const noi = m ? m[4] : /^\s*-\s*(.+)$/.exec(dong) ? /^\s*-\s*(.+)$/.exec(dong)[1] : '';
    if (!noi.trim()) continue;
    const d = m ? T.tuChuoi(m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0')) : batDau;
    for (const muc of noi.split(/;|\. (?=[A-ZĐ])/)) {
      const t = muc.replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim();
      if (t.length > 1 && !/^kết thúc$/i.test(t)) out.push({ ten: t.charAt(0).toUpperCase() + t.slice(1), ngay: d, nhom: nhomCua(t) });
    }
  }
  return out;
}
/** "+ 01 Video Trải nghiệm tại Vinwonders" → sản phẩm bàn giao. */
function banGiao(txt) {
  const out = [];
  for (const dong of String(txt || '').split('\n')) {
    const t = dong.replace(/^\s*\+\s*/, '').trim();
    if (!t || /^\+$/.test(t)) continue;
    const m = /^(\d+|xx)\s+(.*)$/i.exec(t);
    const sl = m && /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
    const ten = (m ? m[2] : t).replace(/^./, (c) => c.toUpperCase());
    const s = ten.toLowerCase();
    const loai = /story/.test(s) ? 'Story' : /bộ ảnh|ảnh/.test(s) ? 'Bộ ảnh' : /post|bài/.test(s) ? 'Bài viết' : /video/.test(s) ? 'Video' : 'Video';
    const chuDe = /vinwonders|vin\b/.test(s) ? 'Vinwonders' : /hòn thơm|cáp treo/.test(s) ? 'Hòn Thơm' : /cano|3 đảo/.test(s) ? 'Tour 3 đảo' : /đối tác/.test(s) ? 'Đối tác' : 'Chung';
    out.push({ ten, soLuong: sl, loai, chuDe });
  }
  return out;
}

(async () => {
  const d = await lark.cli(['base', '+record-list', '--as', 'user', '--base-token', NGUON.base, '--table-id', NGUON.bang, '--limit', '200', '--format', 'json']);
  const dong = (d.data || []).map((row) => { const o = {}; (d.field_id_list || []).forEach((id, i) => { if (COT[id]) o[COT[id]] = row[i]; }); return o; })
    .filter((o) => String(o.ten || '').trim());
  const dl = await kho.tatCa({ moi: true });
  const coTen = (t) => dl.kol.find((k) => k.ten.trim().toLowerCase() === t.trim().toLowerCase() || t.toUpperCase().includes(k.ten.toUpperCase()));
  const nam = T.vn(Date.now()).nam;
  const dsMa = dl.hopTac.map((h) => h.ma);
  for (const o of dong) {
    const ten = String(o.ten).trim();
    const goc = Object.keys(GOI).find((k) => ten.toUpperCase().startsWith(k.toUpperCase())) || '';
    const [xungHo, tenGoi] = GOI[goc] || ['Chị', ''];
    const qg = (o.qg || [])[0] || 'Việt Nam';
    const ma = (MV.theoTen(qg) || { ma: '84' }).ma;
    const c = MV.chuan(o.sdt ? String(o.sdt) : '', ma);
    const email = md(o.email).chu.replace(/^mailto:/i, '');
    const kenh = kenhCua(o);
    const co = coTen(ten);
    if (co) {
      /* Đã có (Châu Kim Cương) — chỉ bổ sung link cho kênh cùng nền tảng còn thiếu. */
      const kCo = dl.kenh.filter((k) => k.kol === co.id);
      const sua = {};
      for (const k of kenh) { const x = kCo.find((y) => y.nenTang === k.nenTang && !y.reup && !y.link); if (x && k.link) sua[x.id] = { link: k.link }; }
      console.log('· có sẵn ' + co.ten + ' — bổ sung link cho ' + Object.keys(sua).length + ' kênh');
      if (THAT && Object.keys(sua).length) await kho.suaNhieu('kenh', sua);
      continue;
    }
    const lt = lichTrinh(o.taiTro, ngay(o.batDau));
    const bg = banGiao(o.banGiao);
    console.log('+ ' + ten + ' | ' + qg + ' ' + c.quocTe + (c.loi ? ' (' + c.loi + ')' : '') + ' | ' + email + ' | ' + kenh.length + ' kênh | ' +
      (o.batDau ? T.ddmm(ngay(o.batDau)) + '–' + T.ddmm(ngay(o.ketThuc)) : 'chưa có chuyến') + ' | ' + lt.length + ' mốc | ' + bg.length + ' bàn giao | tổng ' + T.tien(o.tong || 0));
    if (!THAT) continue;
    const kolId = await kho.tao('kol', { ten, xungHo, tenGoi, quocGia: qg, maVung: '+' + (c.ma || ma), sdt: c.quocTe, email: /@/.test(email) ? email : '',
      tinhTrang: o.batDau ? 'Đã hợp tác' : 'Tiềm năng', nguon: 'Khác', tongTheoDoi: kenh.reduce((s, k) => s + (k.theoDoi || 0), 0),
      ghiChu: 'Nhập từ Base MKT IC cũ ngày ' + T.ddmm(Date.now()) + '.' });
    const kIds = kenh.length ? await kho.taoNhieu('kenh', kenh.map((k) => ({ ...k, kol: kolId }))) : [];
    if (!o.batDau) continue;
    const maHt = T.maMoi(dsMa, nam); dsMa.push(maHt);
    const now = Date.now();
    const htId = await kho.tao('hopTac', {
      ma: maHt, kol: kolId, buoc: o.daXong ? 'Hoàn tất' : 'Chờ nhận sản phẩm', nguoiLon: o.nl || 0, treEm: o.te || 0, emBe: o.eb || 0,
      batDau: ngay(o.batDau), ketThuc: ngay(o.ketThuc), ttTourwell: 'Chưa tạo', trinhLuc: o.daGuiBgd ? ngay(o.batDau) - 2 * T.NGAY : null,
      yeuCau: 'Nhắc tên Rooty Trip Phú Quốc trong video (voice + hình ảnh), có kêu gọi hành động (CTA) đến Rooty Trip Phú Quốc. Gắn thẻ Rooty Trip Phú Quốc, hashtag #RootyTrip #RootyTripPhuQuoc + hashtag của cơ sở tài trợ.',
      ghiChu: 'Nhập từ Base MKT IC cũ. Nội dung tài trợ gốc:\n' + String(o.taiTro || '').trim() + '\n\nBảng kê gốc là ảnh đính kèm trong Base MKT IC.',
      lichSu: T.dongLichSu('', o.daXong ? 'Hoàn tất' : 'Chờ nhận sản phẩm', 'nhập từ Base MKT IC cũ', now),
    });
    const hm = lt.map((x) => ({ ten: x.ten, hopTac: htId, nhom: x.nhom, ngay: x.ngay, nguonDv: 'Nhập tay', loaiKhach: 'Trọn gói', soLuong: 1, demLuot: 1,
      hinhThuc: 'Công ty chi', donGiaChi: 0, thanhTien: 0, tinhTrang: 'Đã xong', xinFoc: /foc/i.test(x.ten) ? 'Đối tác đồng ý' : 'Không áp dụng',
      ghiChu: 'Mốc lịch trình từ bản cũ — chi phí nằm ở dòng tổng' }));
    if (o.tong) hm.push({ ten: 'Tổng chi phí theo bảng kê cũ', hopTac: htId, nhom: 'Khác', ngay: ngay(o.batDau), nguonDv: 'Nhập tay', loaiKhach: 'Trọn gói', soLuong: 1, demLuot: 1,
      hinhThuc: 'Công ty chi', donGiaChi: o.tong, thanhTien: o.tong, tinhTrang: 'Đã xong', kiemLai: true, xinFoc: 'Không áp dụng',
      ghiChu: 'Bảng kê cũ là ảnh — tách từng dòng khi cần.' });
    if (hm.length) await kho.taoNhieu('hangMuc', hm);
    const tra = (o.nenTangTra || []).map((x) => (/tik/i.test(x) ? 'TikTok' : /you/i.test(x) ? 'YouTube' : x));
    const kenhDang = kenh.map((k, i) => (tra.includes(k.nenTang) ? kIds[i] : null)).filter(Boolean);
    if (bg.length) await kho.taoNhieu('banGiao', bg.map((b) => ({ ...b, hopTac: htId, trangThai: o.daXong ? 'Đã đăng' : 'Chưa làm', kenhDang,
      nenTang: tra.filter((x) => ['TikTok', 'Facebook', 'YouTube', 'Instagram'].includes(x)), hanDang: ngay(o.ketThuc) + 7 * T.NGAY })));
    await kho.sua('hopTac', htId, { tienCongTy: o.tong || 0, giaTriQuyDoi: o.tong || 0 });
  }
  if (!THAT) console.log('\nTHỬ — chưa ghi gì. Thêm --that để nhập thật.');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
