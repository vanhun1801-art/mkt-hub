'use strict';
/**
 * SOÁT CÁC LƯỢT AI NHẬN XÉT — lượt nào bỏ dở thì nói ra.
 *
 * Vì sao có tệp này. Lượt chạy theo lịch là một phiên Claude không ai ngồi
 * xem. Ngày 10/10/2026 lượt 8:30 Thứ 7 gom xong dữ liệu rồi đứng im ở bước
 * viết tệp, phiên vẫn báo "đang chạy", Base không có gì, và không một dòng nào
 * ghi lại. Soi lại mới thấy tuần trước hỏng y hệt — hai tuần liền, không ai
 * biết, vì một lượt treo thì KHÔNG TỰ BÁO ĐƯỢC.
 *
 * Nên phải có người thứ ba đứng ngoài nhìn vào. Tệp này là người đó: đọc dấu
 * trong ai/nhat-ky.js cùng mấy tệp trong ai/du-lieu, rồi kết luận từng kỳ đã
 * đi hết ba bước chưa.
 *
 * Chạy:
 *   node ai/soat.js            soát cả tuần lẫn tháng
 *   node ai/soat.js tuan       chỉ kỳ tuần
 *   node ai/soat.js --json     cho máy đọc (app gọi bằng đường này)
 *   node ai/soat.js --ghi-loi "<lý do>" [tuan]   đóng dấu hỏng cho kỳ mới nhất
 *
 * Mã thoát 1 khi còn kỳ bỏ dở — để lượt chạy theo lịch biết mà kêu lên thay vì
 * báo "xong" cho một việc chưa xong.
 */
const fs = require('fs');
const path = require('path');
const NK = require('./nhat-ky');

const THU_MUC = path.join(__dirname, 'du-lieu');
const dsTham = process.argv.slice(2);
const coCo = (t) => dsTham.includes(t);
const loaiXin = dsTham.find((x) => x === 'tuan' || x === 'thang');

const gio = (s) => (s ? new Date(s).toLocaleString('vi-VN') : '');

/** Kỳ của một loại, lấy từ tên tệp dữ liệu đã gom. */
function dsKy(loai) {
  let tep = [];
  try { tep = fs.readdirSync(THU_MUC); } catch (_) { return []; }
  return tep
    .filter((f) => new RegExp('^' + loai + '-\\d{8}\\.json$').test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
    .reverse();
}

/* Mốc bật nhật ký. Kỳ nào xong TRƯỚC mốc này thì không có dấu nào cả — kết
 * luận "bỏ dở" cho chúng là nói sai về quá khứ. Những kỳ ấy ghi là "không rõ"
 * và KHÔNG tính vào danh sách cần xử lý. */
const MOC_NHAT_KY = (() => {
  try { return fs.statSync(NK.TEP).birthtimeMs || fs.statSync(NK.TEP).mtimeMs; }
  catch (_) { return Date.now(); }
})();

const sinhLuc = (f) => { try { return fs.statSync(path.join(THU_MUC, f)).mtimeMs; } catch (_) { return 0; } };

function soatMot(loai, ky) {
  const n = NK.cuaKy(loai, ky);
  const mocDuLieu = sinhLuc(ky + '.json');
  const mocKetQua = sinhLuc('ket-qua-' + ky + '.json');
  const coKetQua = mocKetQua > 0;

  /* ĐÃ XONG = có dấu 'ghi'. Không lấy "có tệp kết quả" làm đủ: tệp viết xong
   * mà bước ghi Base hỏng thì vẫn là bỏ dở, và đó mới là cái người ta cần. */
  const xong = !!n.ghi;
  /* Không có dấu nào mà mọi tệp đều có từ trước khi bật nhật ký: chịu, không
   * kết luận. Thà nói "không rõ" hơn là vu cho một lượt đã chạy xong. */
  const quaCu = !n.chuanBi && !n.ghi && coKetQua && mocKetQua < MOC_NHAT_KY;

  return {
    loai,
    ky,
    ngay: ky.slice(-8).replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1'),
    xong,
    khongRo: quaCu,
    coKetQua,
    batDauLuc: n.chuanBi ? n.chuanBi.luc : (mocDuLieu ? new Date(mocDuLieu).toISOString() : null),
    xongLuc: n.ghi ? n.ghi.luc : null,
    soNguoiGom: n.chuanBi ? n.chuanBi.soNguoi : null,
    soNguoiGhi: n.ghi ? n.ghi.soNguoi : null,
    loi: n.loi ? n.loi.ghiChu || 'không rõ' : '',
    /* Bỏ dở ở đâu — câu này mới nói được phải đi sửa chỗ nào. */
    ketAt: (xong || quaCu) ? '' : (!mocDuLieu ? 'chưa gom dữ liệu'
      : (!coKetQua ? 'gom xong nhưng CHƯA viết được tệp nhận xét'
        : 'đã viết nhận xét nhưng CHƯA ghi vào Base')),
  };
}

function soat(loai) {
  return dsKy(loai).slice(0, 6).map((ky) => soatMot(loai, ky));
}

/* --- đóng dấu hỏng --- */
/* Danh sách lượt bỏ dở — server.js gọi để đẩy lên khối "Cần xử lý ngay". */
function boDo(loai) {
  return (loai ? [loai] : ['tuan', 'thang']).flatMap(soat)
    .filter((x) => !x.xong && !x.khongRo);
}

module.exports = { soat, soatMot, boDo, dsKy };

/* PHẦN DÒNG LỆNH chỉ chạy khi gọi thẳng tệp này. Để nó chạy lúc `require` thì
 * trang Tổng quan vừa nạp module là tự thoát tiến trình máy chủ. */
if (require.main === module) {
  const iLoi = dsTham.indexOf('--ghi-loi');
  if (iLoi >= 0) {
    const loai = loaiXin || 'tuan';
    const ky = dsKy(loai)[0];
    if (!ky) { console.error('Chưa có kỳ nào của loại ' + loai); process.exit(1); }
    NK.ghi({ loai, ky, buoc: 'loi', ghiChu: String(dsTham[iLoi + 1] || 'không rõ').slice(0, 300) });
    console.log('đã đóng dấu hỏng cho ' + ky);
    process.exit(0);
  }

  const ra = (loaiXin ? [loaiXin] : ['tuan', 'thang']).flatMap(soat);
  const dang = ra.filter((x) => !x.xong && !x.khongRo);

  if (coCo('--json')) {
    console.log(JSON.stringify({ ky: ra, boDo: dang }));
    process.exit(dang.length ? 1 : 0);
  }

  ra.forEach((x) => {
    const nhan = x.loai === 'tuan' ? 'Tuần' : 'Tháng';
    if (x.xong) {
      console.log('✓ ' + nhan + ' ' + x.ngay + ' · đã ghi ' + x.soNguoiGhi + ' người lúc ' + gio(x.xongLuc));
    } else if (x.khongRo) {
      console.log('· ' + nhan + ' ' + x.ngay + ' · có tệp nhận xét, chạy trước khi bật nhật ký nên không rõ đã ghi Base chưa');
    } else {
      console.log('✗ ' + nhan + ' ' + x.ngay + ' · ' + x.ketAt
        + (x.batDauLuc ? ' (gom lúc ' + gio(x.batDauLuc) + ', ' + x.soNguoiGom + ' người)' : '')
        + (x.loi ? ' · ' + x.loi : ''));
    }
  });
  if (!ra.length) console.log('Chưa có kỳ nào.');
  process.exit(dang.length ? 1 : 0);
}
