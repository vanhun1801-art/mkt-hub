'use strict';
/**
 * ============================================================================
 * GHI KHOẢN CHI VÀO SỔ QUỸ khi quản lý bấm "Đã thanh toán"
 * ============================================================================
 *
 * Buổi tác nghiệp đã chi tiền phải xuất hiện ở hai nơi, vì hai nơi trả lời hai
 * câu hỏi khác nhau:
 *
 *   Tourwell   — chi phí này thuộc đơn nào, kế toán chi tiền theo phiếu nào
 *   Sổ quỹ     — quỹ tạm ứng còn bao nhiêu, khoản này đã quyết toán chưa
 *
 * Trước đây cái thứ hai gõ tay vào Google Sheet, và đó là chỗ 67/162 dòng
 * thiếu UNC. Giờ app ghi thẳng, kèm chính hai tệp nhân sự đã nộp trong Base
 * Lịch tác nghiệp — không ai phải tải xuống rồi tải lên lại.
 *
 * KHÔNG ĐƯỢC LÀM HỎNG VIỆC ĐÁNH DẤU THANH TOÁN. Sổ quỹ hỏng, Base sổ quỹ đổi
 * cấu trúc, mạng chập — tất cả đều chỉ là một dòng cảnh báo, không phải lỗi
 * chặn. Tiền đã chuyển rồi thì Base lịch phải ghi nhận xong.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const TEP = path.join(__dirname, 'so-quy.json');

/* Toạ độ Base "Chi phí Marketing". Đổi được bằng tệp so-quy.json hoặc biến môi
 * trường, nhưng mặc định là Base thật — app này và app Quỹ chi phí phải trỏ
 * cùng một chỗ, nếu không mỗi bên một sổ. */
const MAC_DINH = {
  baseToken: 'IQfUbtDDZacFdCsl657l9hOPged',
  chiTableId: 'tblf4Rq9ei6Fp6A1',
  dotTableId: 'tblsgGaO4NWnMYRV',
};

function docCauHinh() {
  let tep = {};
  try { tep = JSON.parse(fs.readFileSync(TEP, 'utf8')); } catch (_) {}
  const cf = {
    baseToken: process.env.QUY_BASE_TOKEN || tep.baseToken || MAC_DINH.baseToken,
    chiTableId: process.env.QUY_TB_CHI || tep.chiTableId || MAC_DINH.chiTableId,
    dotTableId: process.env.QUY_TB_DOT || tep.dotTableId || MAC_DINH.dotTableId,
  };
  const tat = process.env.QUY_TAT === '1' || tep.tat === true;
  cf.bat = !!cf.baseToken && !!cf.chiTableId && !tat;
  return cf;
}

const bat = () => docCauHinh().bat;

const chu = (v) => String(v == null ? '' : v).trim();
const pad = (n) => String(n).padStart(2, '0');

/** Ngày cho Base: chuỗi giờ Việt Nam, cùng luật với toCells() của server.js. */
function ngayBase(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const vn = new Date(d.getTime() + 7 * 3600000);
  return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())} 00:00:00`;
}

/**
 * Đợt tạm ứng đang dùng. Lấy theo cột Tình trạng chứ không theo "đợt mới nhất":
 * đợt mới nhất có thể là đợt vừa mở để chuẩn bị, chưa nạp tiền.
 */
async function dotDangDung(cf) {
  /* Bản ghi trả về khoá theo field ID, nên phải hỏi danh sách trường để biết
   * id nào là "Tình trạng". Tra theo tên cột thay vì ghi cứng id: Base sổ quỹ
   * do người khác cũng sửa được, mà xoá rồi tạo lại một cột là id đổi. */
  const [rows, fields] = await Promise.all([
    lark.listAllRecords(cf.dotTableId, cf.baseToken),
    lark.listFields(cf.dotTableId, cf.baseToken),
  ]);
  const idCua = {};
  ((fields && fields.items) || fields || []).forEach((f) => {
    idCua[f.field_name || f.name] = f.field_id || f.id;
  });
  const text = (v) => (Array.isArray(v)
    ? v.map((x) => (x && (x.text || x.name)) || (typeof x === 'string' ? x : '')).join('')
    : chu(v && (v.text || v.name) ? (v.text || v.name) : v));

  const dang = rows.find((r) => text((r.cells || {})[idCua['Tình trạng']]) === 'Đang dùng');
  const chon = dang || rows[rows.length - 1];
  if (!chon) return null;
  return { id: chon.record_id, ma: text((chon.cells || {})[idCua['Mã phiếu chi']]) };
}

/**
 * Ghi một khoản chi vào sổ quỹ.
 *
 * @param lich  bản ghi lịch tác nghiệp (đã qua toItem)
 * @param maDon mã đơn Tourwell vừa tạo, nếu có
 * @returns {{id, dot, tien}} hoặc {bo|loi}
 */
async function ghiKhoanChi(lich, maDon) {
  const cf = docCauHinh();
  if (!cf.bat) return { bo: 'chua-cau-hinh' };

  const tien = Math.round(Number(lich && lich.costActual) || 0);
  if (!(tien > 0)) return { bo: 'khong-co-chi-phi' };

  const dot = await dotDangDung(cf);
  const ten = chu(lich.title) || 'Tác nghiệp Marketing';
  const ngay = ngayBase(lich.start);

  const cells = {
    'Nội dung chi': ngay ? `${ten} (${ngay.slice(8, 10)}/${ngay.slice(5, 7)})` : ten,
    'Loại chi': 'Tác nghiệp',
    'Số tiền': tien,
    'Ngày đề nghị': ngay,
    'Ngày thanh toán': ngayBase(new Date().toISOString()),
    'Tình trạng': 'Đã chi',
    'Ghi chú': 'App Lịch tác nghiệp ghi tự động',
  };
  /* Người đề nghị = người phụ trách buổi đó, không phải người bấm nút. Quản lý
   * bấm thay thì sổ vẫn phải ghi đúng ai tiêu khoản này. */
  const ai = (lich.owner || [])[0] || (lich.staff || [])[0];
  if (ai && ai.id) cells['Người đề nghị'] = [{ id: ai.id }];
  if (maDon) cells['Mã đơn Tourwell'] = maDon;
  if (dot) cells['Đợt tạm ứng'] = [dot.id];   // mảng CHUỖI record_id, không phải [{id}]
  if (lich.id) {
    cells['Buổi tác nghiệp'] = cfg.larkUrl.split('?')[0] + '?table=' + cfg.tableId
      + '&record=' + lich.id;
  }

  const out = await lark.createRecord(cells, cf.chiTableId, cf.baseToken);
  /* lark-cli trả record_id_list, Open API trả records[] — đọc thiếu một dạng thì
   * id ra null và mọi việc sau đó im lặng không chạy. */
  const id = (out && (
    (out.record_id_list && out.record_id_list[0])
    || out.record_id
    || (out.record && out.record.record_id)
    || (out.records && out.records[0] && out.records[0].record_id)
  )) || null;

  const tep = id ? await chepChungTu(cf, lich, id) : { chep: 0 };
  return { id, dot: dot && dot.ma, tien, ...tep };
}

/* Chép nhiều nhất từng này tệp mỗi ô. Nhân sự đôi khi tải 5-6 ảnh hoá đơn; chép
 * hết thì nút "Đã thanh toán" treo cả phút. Ba tệp đủ để kế toán đối chiếu. */
const TOI_DA_TEP = 3;

/**
 * Chép hoá đơn và UNC từ bản ghi lịch tác nghiệp sang dòng chi trong sổ quỹ.
 *
 * Vì sao phải chép chứ không trỏ link: kế toán mở Base sổ quỹ, không mở Base
 * lịch — hai Base khác nhau, quyền khác nhau. Không chép thì anh Hùng lại phải
 * tải xuống rồi tải lên tay, đúng cái việc app này sinh ra để bỏ đi.
 *
 * Hỏng ở đây KHÔNG được làm hỏng việc ghi sổ: dòng chi đã có rồi, thiếu tệp thì
 * bổ sung sau được, còn mất dòng chi thì mất dấu cả khoản tiền.
 */
async function chepChungTu(cf, lich, chiId) {
  const viec = [
    { tu: lich.files, sang: 'Hoá đơn' },   // ô "Tệp đính kèm" của Base lịch = hoá đơn
    { tu: lich.unc, sang: 'UNC' },
  ];
  let chep = 0;
  const loi = [];

  for (const v of viec) {
    const ds = (v.tu || []).filter((f) => f && f.token).slice(0, TOI_DA_TEP);
    for (const f of ds) {
      const ten = 'sq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      let thuMuc = null;
      try {
        thuMuc = await lark.downloadAttachment(lich.id, f.token, ten, cfg.tableId);
        const tepTrong = fs.readdirSync(thuMuc);
        if (!tepTrong.length) throw new Error('tải về rỗng');
        await lark.uploadAttachment(chiId, v.sang, './.tmp/' + ten + '/' + tepTrong[0],
          cf.chiTableId, cf.baseToken);
        chep++;
      } catch (e) {
        loi.push(v.sang + ': ' + e.message);
      } finally {
        if (thuMuc) { try { fs.rmSync(thuMuc, { recursive: true, force: true }); } catch (_) {} }
      }
    }
  }
  return { chep, loiTep: loi.length ? loi.join(' · ') : undefined };
}

module.exports = { bat, docCauHinh, ngayBase, dotDangDung, ghiKhoanChi };
