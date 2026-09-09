'use strict';
/**
 * BỘ MÁY CHẤM ĐIỂM — hàm thuần, không đọc mạng, không đọc Base.
 *
 * Vào:  bộ luật (luat.js) + số liệu tháng + điểm chấm tay
 * Ra:   phiếu KPI từng người, kèm toàn bộ chuỗi tính để bấm xuống xem được
 *
 * Tách khỏi I/O để kiểm chứng được: cùng một bộ số liệu phải luôn ra cùng một
 * điểm, và có thể chạy lại 8 tháng cũ để đối chiếu với bảng Excel.
 *
 * SỐ LIỆU vào là một map phẳng { 'mã nguồn': số | null }. `null` nghĩa là
 * KHÔNG ĐO ĐƯỢC — khác hẳn số 0. Excel nhập chữ "x" vào ô mục tiêu cho những
 * kênh không đo được follow, làm cả nhóm ra lỗi rồi bị chữa cháy bằng cách gõ
 * điểm 0; ở đây tiêu chí không đo được bị LOẠI và tỷ trọng của nó chia lại cho
 * các tiêu chí còn đo được — nhóm không bị mất điểm oan.
 */
const L = require('./luat');

const soHopLe = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Chấm một nhóm kênh.
 * Trả { khoa, ten, tieuChi[], diem, boQuaHet } — `diem` là null nếu cả nhóm
 * không đo được cái gì (đừng trả 0, vì 0 có nghĩa là "làm mà không ra kết quả").
 */
function chamNhom(nhom, soLieu, canhBao) {
  const khoa = L.khoaNhom(nhom);
  const ten = [nhom.kenh, nhom.tenKenh, nhom.loai].filter(Boolean).join(' · ');
  const tc = Array.isArray(nhom.tieuChi) ? nhom.tieuChi : [];

  const doDuoc = [];
  const bo = [];
  tc.forEach((t) => {
    const kq = soLieu[t.nguon];
    (soHopLe(kq) ? doDuoc : bo).push(t);
  });

  /* Chia lại tỷ trọng cho phần đo được. Nếu tổng phần đo được là 0 thì không
   * chia được — trả nhóm rỗng thay vì tạo ra số vô nghĩa. */
  const tongDoDuoc = doDuoc.reduce((s, t) => s + (soHopLe(t.tyTrong) ? t.tyTrong : 0), 0);

  const ra = [];
  bo.forEach((t) => {
    ra.push({
      ma: t.ma, ten: t.ten || t.ma, nguon: t.nguon,
      mucTieu: t.mucTieu, ketQua: null,
      datMucTieu: null, tyTrong: 0, tyTrongGoc: t.tyTrong, diem: 0,
      boQua: true, lyDo: 'Không có nguồn số liệu — tỷ trọng đã chia lại cho tiêu chí khác',
    });
    canhBao.push({
      muc: 'canhBao', o: ten + ' · ' + (t.ten || t.ma),
      viec: 'Không đo được, đã loại khỏi nhóm và chia lại ' + pt(t.tyTrong) + ' tỷ trọng',
    });
  });

  if (!doDuoc.length || tongDoDuoc <= 0) {
    canhBao.push({ muc: 'chan', o: ten, viec: 'Cả nhóm không có tiêu chí nào đo được' });
    return { khoa, ten, tieuChi: ra, diem: null, boQuaHet: true };
  }

  let diem = 0;
  doDuoc.forEach((t) => {
    const kq = soLieu[t.nguon];
    const dat = t.mucTieu > 0 ? kq / t.mucTieu : 0;
    const tyTrong = t.tyTrong / tongDoDuoc;   // chia lại về tổng 100%
    const d = tyTrong * dat;
    diem += d;
    ra.push({
      ma: t.ma, ten: t.ten || t.ma, nguon: t.nguon,
      mucTieu: t.mucTieu, ketQua: kq,
      datMucTieu: dat, tyTrong, tyTrongGoc: t.tyTrong, diem: d,
      boQua: false,
    });

    /* Mục tiêu lệch xa thực tế làm hỏng cả bảng: tháng 7 có kênh đặt mục tiêu
     * 30.000 view trong khi đạt 353.035 — một mình nó kéo điểm hai người vọt lên.
     * Không tự sửa mục tiêu (đó là quyết định của quản lý), nhưng phải kêu. */
    if (dat > L.NGUONG.cao) {
      canhBao.push({
        muc: 'canhBao', o: ten + ' · ' + (t.ten || t.ma),
        viec: 'Đạt ' + pt(dat) + ' mục tiêu — mục tiêu ' + gon(t.mucTieu) + ' có vẻ đặt quá thấp',
      });
    } else if (dat < L.NGUONG.thap) {
      canhBao.push({
        muc: 'canhBao', o: ten + ' · ' + (t.ten || t.ma),
        viec: 'Chỉ đạt ' + pt(dat) + ' mục tiêu — kiểm tra lại nguồn số liệu hoặc mục tiêu',
      });
    }
  });

  /* Giữ thứ tự như khai trong bộ luật để phiếu đọc được như bảng gốc. */
  const thuTu = new Map(tc.map((t, i) => [t.ma, i]));
  ra.sort((a, b) => (thuTu.get(a.ma) ?? 0) - (thuTu.get(b.ma) ?? 0));

  return { khoa, ten, tieuChi: ra, diem, boQuaHet: false };
}

/** Điểm phần "ăn theo kênh" của một người = Σ (tỷ trọng kênh × điểm nhóm). */
function diemTheoKenh(nguoi, banNhom, canhBao) {
  const pb = nguoi.kenh || {};
  const chiTiet = [];
  let diem = 0;
  let tyTrongMat = 0;

  Object.entries(pb).forEach(([khoa, ty]) => {
    if (!soHopLe(ty) || ty === 0) return;
    const n = banNhom.get(khoa);
    if (!n) {
      tyTrongMat += ty;
      canhBao.push({
        muc: 'chan', o: nguoi.ten || nguoi.ma,
        viec: 'Được phân bổ ' + pt(ty) + ' vào nhóm không có trong bộ luật: ' + khoa,
      });
      return;
    }
    if (n.diem == null) {
      tyTrongMat += ty;
      chiTiet.push({ khoa, ten: n.ten, tyTrong: ty, diemNhom: null, diem: 0, boQua: true });
      return;
    }
    const d = ty * n.diem;
    diem += d;
    chiTiet.push({ khoa, ten: n.ten, tyTrong: ty, diemNhom: n.diem, diem: d, boQua: false });
  });

  if (tyTrongMat > 0) {
    canhBao.push({
      muc: 'canhBao', o: nguoi.ten || nguoi.ma,
      viec: pt(tyTrongMat) + ' tỷ trọng kênh không chấm được — điểm của người này bị thiếu đúng phần đó',
    });
  }
  chiTiet.sort((a, b) => b.tyTrong - a.tyTrong);
  return { diem, chiTiet, tyTrongMat };
}

/**
 * Chấm cả tháng.
 *
 * @param luat     bộ luật đã qua `luat.soat()`
 * @param soLieu   { 'mã nguồn': số | null }
 * @param chamTay  { 'mã người': { 'mã tiêu chí': số } }
 * @returns { thang, luatId, nhom[], nguoi[], canhBao[] }
 */
function chamThang(luat, soLieu, chamTay, thang) {
  const canhBao = [];
  soLieu = soLieu || {};
  chamTay = chamTay || {};

  const nhom = (luat.nhom || []).map((n) => chamNhom(n, soLieu, canhBao));
  const banNhom = new Map(nhom.map((n) => [n.khoa, n]));

  const nguoi = (luat.nguoi || []).map((ng) => {
    const theoKenh = diemTheoKenh(ng, banNhom, canhBao);
    const tay = chamTay[ng.ma] || {};
    const dong = [];
    let tong = 0;
    let tongTrongSo = 0;
    let thieuCham = 0;

    (ng.tieuChi || []).forEach((t) => {
      const w = soHopLe(t.trongSo) ? t.trongSo : 0;
      tongTrongSo += w;
      const kieu = (t.nguon || {}).kieu;
      let diem = null;
      let ghi = '';

      if (kieu === 'kenh') {
        diem = theoKenh.diem;
        ghi = theoKenh.chiTiet.length + ' kênh';
      } else if (kieu === 'chiSo') {
        const v = soLieu[t.nguon.ma];
        if (soHopLe(v)) diem = v;
        else {
          diem = null;
          canhBao.push({
            muc: 'chan', o: (ng.ten || ng.ma) + ' · ' + (t.ten || t.ma),
            viec: 'Chưa có số cho chỉ số "' + t.nguon.ma + '"',
          });
        }
      } else if (kieu === 'tay') {
        const v = tay[t.ma];
        if (soHopLe(v)) diem = v;
        else {
          diem = null;
          thieuCham += 1;
          canhBao.push({
            muc: 'chan', o: (ng.ten || ng.ma) + ' · ' + (t.ten || t.ma),
            viec: 'Chưa được ' + (t.nguon.boi || 'người phụ trách') + ' chấm',
          });
        }
      }

      /* Chưa có điểm thì tính 0 để bảng vẫn đọc được, NHƯNG đã có cảnh báo mức
       * "chặn" ở trên nên tháng này không chốt được. Không im lặng coi như 0 —
       * đó đúng là cách Excel biến một ô trống thành "hoàn thành 0%" mà không ai
       * nhận ra suốt bốn tháng. */
      const dTinh = soHopLe(diem) ? diem : 0;
      const luong = w * dTinh;
      tong += luong;
      dong.push({
        ma: t.ma, ten: t.ten || t.ma, kieu, trongSo: w,
        diem, diemTinhLuong: luong, ghi,
        chuaCo: !soHopLe(diem),
        boi: (t.nguon || {}).boi || '',
      });
    });

    return {
      ma: ng.ma, ten: ng.ten || ng.ma, viTri: ng.viTri || '',
      tieuChi: dong, kenh: theoKenh.chiTiet,
      tong, tongTrongSo, thieuCham,
      dayDu: dong.every((d) => !d.chuaCo) && theoKenh.tyTrongMat === 0,
    };
  });

  return { thang: thang || luat.tuThang, luatId: luat.id, nhom, nguoi, canhBao };
}

/**
 * Tháng này chốt được chưa. Gộp lỗi bộ luật với lỗi lúc chấm — chỉ cần một mục
 * mức "chặn" là chưa chốt được.
 */
function chotDuoc(luat, ketQua) {
  const v = [...L.soat(luat), ...(ketQua.canhBao || [])];
  const chan = v.filter((x) => x.muc === 'chan');
  return { duoc: chan.length === 0, chan, canhBao: v.filter((x) => x.muc === 'canhBao') };
}

const pt = (n) => (Math.round(n * 1000) / 10).toString().replace('.', ',') + '%';
function gon(n) {
  if (!soHopLe(n)) return String(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' tỷ';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' tr';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
}

module.exports = { chamThang, chamNhom, chotDuoc };
