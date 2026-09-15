'use strict';
/*
 * Kiểm tra luồng "việc trễ deadline" ở vai NHÂN SỰ.
 *
 *   node test/tre.test.js
 *
 * Test tự bật một instance riêng (cổng 5197) với danh sách quản lý rỗng người,
 * nên tài khoản đang đăng nhập bị coi là nhân sự.
 *
 * KHÔNG ĐỊNH GHI GÌ VÀO BASE: mọi phép thử ở đây đều nhắm vào các đường bị chặn —
 * server trả 422 trước khi gọi API Lark. Hai đường có ghi thật (nhân sự bấm "Giải
 * quyết" trên việc đã trễ, quản lý đóng việc đã trễ) phải thử tay trên một bản
 * ghi nháp rồi hoàn nguyên, không đưa vào bộ test tự động.
 *
 * NHƯNG ĐỪNG TIN LỜI HỨA ĐÓ. Bản trước của file này hứa y hệt, rồi vẫn ghi thật
 * lên một việc đang chạy (15/09/2026) vì luật "đã trễ" của test lệch luật server
 * đúng một chỗ — xem chú thích hetHan(). Lời hứa trong comment không phải bảo đảm.
 * Nên test tự chụp trạng thái trước, đối chiếu sau khi chạy, và hoàn nguyên +
 * báo FAIL nếu có gì bị ghi: soiVaHoanNguyen().
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.PORT_TEST || 5197);
const URL = 'http://127.0.0.1:' + PORT;

let pass = 0, fail = 0;
const fails = [];
function ok(ten, dung, chiTiet) {
  if (dung) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten + (chiTiet ? ' → ' + chiTiet : '')); }
  else {
    fail++; fails.push(ten + (chiTiet ? ' → ' + chiTiet : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : ''));
  }
}
const bo = (ten, vi) => console.log('  \x1b[33mBỎ QUA\x1b[0m ' + ten + ' (' + vi + ')');

const dong = /Hoàn thành|Nghiệm thu|Đã xong|Huỷ|Hủy/i;
const TRE_STATUS = 'Trễ deadline';

/**
 * Việc này đã trễ chưa — PHẢI KHỚP `laTreTheoHan()` trong server.js.
 *
 * Bản cũ chỉ tính theo NGÀY, nên lệch luật server đúng một chỗ: automation của
 * Base tự đặt trạng thái "Trễ deadline" sau deadline 2 tiếng, và server thấy
 * trạng thái đó là coi như đã trễ — sớm hơn phép tính theo ngày.
 *
 * Hậu quả của chỗ lệch đó (đã xảy ra thật 15/09/2026): việc có hạn 09:00 hôm nay,
 * đến 11:00 Base đặt "Trễ deadline". Test vẫn coi là "còn hạn" nên đem đi thử
 * đường Giải quyết mong bị chặn — server lại cho qua và GHI THẬT "Đã giải quyết"
 * lên một việc đang chạy. Hôm trước chạy vẫn pass vì deadline còn ở tương lai:
 * đây là bom hẹn giờ, không phải lỗi ngẫu nhiên.
 *
 * Luật nào đổi ở server.js thì phải đổi kèm ở đây.
 */
const hetHan = (t) => {
  const st = String(t.status || '');
  if (dong.test(st)) return false;          // việc đã đóng thì không tính trễ
  if (st === TRE_STATUS) return true;       // kết luận của Base/quản lý, tin luôn
  if (!t.deadline) return false;
  const h = new Date(t.deadline); h.setHours(0, 0, 0, 0);
  const nay = new Date(); nay.setHours(0, 0, 0, 0);
  return h < nay;
};
const coMinhChung = (t) => (t.attachment || []).length > 0 || !!t.link;
const laTre = (t) => hetHan(t) && !dong.test(String(t.status || '')) && !t.daGiaiQuyet;

/* ---------------- lưới an toàn ----------------
 * Mọi phép thử ở đây đều mong BỊ CHẶN, nên lẽ ra không ghi gì lên Base. Nhưng
 * "lẽ ra" đã sai một lần rồi (xem chú thích hetHan). Nên đừng tin vào lời hứa:
 * chụp lại hai ô mà các đường này có thể chạm vào, đối chiếu sau khi chạy xong,
 * và nếu có gì đổi thì HOÀN NGUYÊN ngay rồi hô to — thay vì để hỏng im lặng.
 */
const cfgTest = require('../config');
const larkTest = cfgTest.mode === 'api' ? require('../larkapi') : require('../lark');
const TEN_GQ = cfgTest.fields.daGiaiQuyet.name;
const TEN_NGAY_GQ = cfgTest.fields.ngayGiaiQuyet.name;

/** Ảnh chụp những ô mà test tuyệt đối không được làm đổi. */
const chup = (ds) => new Map(ds.map((t) => [t.id, {
  ten: t.title, daGiaiQuyet: !!t.daGiaiQuyet, ngayGiaiQuyet: t.ngayGiaiQuyet || null,
}]));

/** Base cần chuỗi 'YYYY-MM-DD HH:mm:ss', không nhận thẳng ISO. */
function gioBase(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00';
}

/**
 * Những bản ghi đã đổi so với ảnh chụp. Hàm THUẦN, tách riêng để tự kiểm được
 * bằng dữ liệu giả — lưới an toàn mà chính nó hỏng thì còn tệ hơn không có.
 */
function timThayDoi(truoc, sau) {
  return (sau || []).filter((t) => {
    const c = truoc.get(t.id);
    if (!c) return false;                  // bản ghi mới sinh sau ảnh chụp, không xét
    return c.daGiaiQuyet !== !!t.daGiaiQuyet ||
      (c.ngayGiaiQuyet || null) !== (t.ngayGiaiQuyet || null);
  });
}

/** Tự kiểm lưới an toàn bằng dữ liệu giả, không đụng Base. */
function tuKiemLuoiAnToan() {
  const truoc = chup([
    { id: 'recA', title: 'A', daGiaiQuyet: false, ngayGiaiQuyet: null },
    { id: 'recB', title: 'B', daGiaiQuyet: true, ngayGiaiQuyet: '2026-09-01T10:00:00+07:00' },
  ]);
  const yen = [
    { id: 'recA', daGiaiQuyet: false, ngayGiaiQuyet: null },
    { id: 'recB', daGiaiQuyet: true, ngayGiaiQuyet: '2026-09-01T10:00:00+07:00' },
  ];
  ok('lưới an toàn: không đổi gì thì không báo động', timThayDoi(truoc, yen).length === 0);

  // đúng kiểu hỏng đã xảy ra thật: false -> true kèm ngày giải quyết mới
  const hong = [
    { id: 'recA', daGiaiQuyet: true, ngayGiaiQuyet: '2026-09-15T11:02:00+07:00' },
    { id: 'recB', daGiaiQuyet: true, ngayGiaiQuyet: '2026-09-01T10:00:00+07:00' },
  ];
  const bat = timThayDoi(truoc, hong);
  ok('lưới an toàn: bắt được đúng bản ghi bị ghi nhầm',
    bat.length === 1 && bat[0].id === 'recA', bat.map((x) => x.id).join(',') || 'không bắt được');

  // bản ghi sinh ra sau ảnh chụp thì không phải việc của lưới này
  ok('lưới an toàn: bỏ qua bản ghi mới, không báo động nhầm',
    timThayDoi(truoc, yen.concat([{ id: 'recMoi', daGiaiQuyet: true }])).length === 0);

  ok('lưới an toàn: đổi giờ Base đúng định dạng Base nhận',
    gioBase('2026-09-15T11:02:00+07:00') === '2026-09-15 11:02:00' && gioBase(null) === null,
    gioBase('2026-09-15T11:02:00+07:00'));
}

/** Đối chiếu ảnh chụp với thực tế, hoàn nguyên mọi thay đổi ngoài ý muốn. */
async function soiVaHoanNguyen(truoc) {
  let sau = [];
  try {
    sau = (await (await fetch(URL + '/api/tasks?refresh=1')).json()).tasks || [];
  } catch (_) {
    console.log('\n  \x1b[33mKhông đọc lại được danh sách để soi — hãy tự kiểm Base.\x1b[0m');
    return;
  }
  const doi = timThayDoi(truoc, sau);
  if (!doi.length) return;

  console.log('\n\x1b[31m  TEST ĐÃ GHI LÊN BASE — đang hoàn nguyên\x1b[0m');
  for (const t of doi) {
    const c = truoc.get(t.id);
    try {
      await larkTest.updateRecord(t.id, {
        [TEN_GQ]: c.daGiaiQuyet,
        [TEN_NGAY_GQ]: gioBase(c.ngayGiaiQuyet),
      });
      console.log('   · đã trả lại: ' + t.id + ' — ' + (c.ten || '') +
        ' (Đã giải quyết → ' + c.daGiaiQuyet + ')');
    } catch (e) {
      console.log('   · \x1b[31mHOÀN NGUYÊN HỎNG\x1b[0m ' + t.id + ': ' + e.message +
        ' — phải sửa tay trên Lark Base!');
    }
  }
  fail++;
  fails.push('test ghi nhầm lên ' + doi.length + ' bản ghi (đã hoàn nguyên) — luật trễ của test lệch luật server');
}

async function goi(id, act) {
  const r = await fetch(URL + '/api/tasks/' + id + '/' + act, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  let body = null;
  try { body = await r.json(); } catch (_) {}
  return { status: r.status, ma: (body && body.code) || '', loi: (body && body.error) || '' };
}

(async () => {
  const quyen = path.join(os.tmpdir(), 'tre-test-quyen-' + process.pid + '.json');
  fs.writeFileSync(quyen, JSON.stringify({ managers: ['ou_khong_co_ai_ca'] }), 'utf8');
  const con = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, { PORT: String(PORT), LARK_QUYEN_FILE: quyen }),
    stdio: 'ignore',
  });
  const don = () => { try { con.kill(); } catch (_) {} try { fs.unlinkSync(quyen); } catch (_) {} };
  let anhChup = new Map();

  try {
    let meta = null;
    for (let i = 0; i < 40 && !meta; i++) {
      await new Promise((s) => setTimeout(s, 500));
      try { meta = await (await fetch(URL + '/api/meta')).json(); } catch (_) {}
    }
    if (!meta) throw new Error('instance không lên được ở cổng ' + PORT);

    console.log('\n\x1b[1mLưới an toàn (dữ liệu giả, không đụng Base)\x1b[0m');
    tuKiemLuoiAnToan();

    console.log('\n\x1b[1mVai đang thử\x1b[0m');
    const vai = meta.role || (meta.manager ? 'manager' : '');
    ok('instance chạy ở vai nhân sự', vai === 'staff', 'role=' + vai);
    ok('server công bố luật chặn hoàn thành khi trễ',
      !!(meta.rules && meta.rules.chanHoanThanhKhiTre));

    const ds = (await (await fetch(URL + '/api/tasks')).json()).tasks || [];
    console.log('\n\x1b[1mĐọc dữ liệu\x1b[0m');
    ok('lấy được danh sách việc', ds.length > 0, ds.length + ' việc');
    anhChup = chup(ds);        // mốc để cuối bài đối chiếu xem có ghi nhầm không
    const saiKieu = ds.filter((t) => typeof t.daGiaiQuyet !== 'boolean');
    ok('"Đã giải quyết" luôn là boolean thật', saiKieu.length === 0,
      saiKieu.length ? saiKieu.length + ' dòng sai kiểu (checkbox chưa chuẩn hoá)' : 'cả ' + ds.length + ' dòng');

    console.log('\n\x1b[1mViệc đã trễ (nhân sự)\x1b[0m');
    const treCoMC = ds.find((t) => laTre(t) && coMinhChung(t));
    if (!treCoMC) bo('không tự chuyển Hoàn thành khi đã trễ', 'không có việc trễ nào đã có minh chứng');
    else {
      const r = await goi(treCoMC.id, 'complete');
      ok('không tự chuyển Hoàn thành khi đã trễ',
        r.status === 422 && r.ma === 'LATE_NEEDS_RESOLVE', r.status + ' ' + r.ma);
    }

    const treKhongMC = ds.find((t) => laTre(t) && !coMinhChung(t));
    if (!treKhongMC) bo('vẫn đòi minh chứng trước khi nộp', 'không có việc trễ nào thiếu minh chứng');
    else {
      const r = await goi(treKhongMC.id, 'complete');
      ok('vẫn đòi minh chứng trước khi nộp',
        r.status === 422 && r.ma === 'PROOF_REQUIRED', r.status + ' ' + r.ma);
      const g = await goi(treKhongMC.id, 'giai-quyet');
      ok('Giải quyết cũng đòi minh chứng',
        g.status === 422 && g.ma === 'PROOF_REQUIRED', g.status + ' ' + g.ma);
    }

    console.log('[1mViệc trễ ĐÃ nộp sản phẩm[0m');
    const treDaGQ = ds.find((t) => hetHan(t) && !dong.test(String(t.status || '')) && t.daGiaiQuyet);
    if (!treDaGQ) bo('nộp rồi vẫn không tự đóng được việc', 'không có việc trễ nào đã giải quyết');
    else {
      const r = await goi(treDaGQ.id, 'complete');
      ok('nộp rồi vẫn không tự đóng được việc',
        r.status === 422 && r.ma === 'LATE_NEEDS_RESOLVE', r.status + ' ' + r.ma);
    }

    console.log('\n\x1b[1mViệc còn hạn\x1b[0m');
    const conHan = ds.find((t) => !hetHan(t) && !dong.test(String(t.status || '')));
    if (!conHan) bo('không cho Giải quyết việc chưa trễ', 'không có việc nào còn hạn');
    else {
      const r = await goi(conHan.id, 'giai-quyet');
      ok('không cho Giải quyết việc chưa trễ',
        r.status === 422 && r.ma === 'NOT_LATE', r.status + ' ' + r.ma);
    }

    // Không tin lời hứa "test này chỉ đọc" — kiểm chứng rồi mới kết luận
    await soiVaHoanNguyen(anhChup);

    console.log('\n' + '─'.repeat(52));
    console.log('  ' + pass + ' pass · ' + fail + ' fail');
    console.log('─'.repeat(52) + '\n');
    if (fail) { fails.forEach((f) => console.log('  · ' + f)); process.exitCode = 1; }
  } catch (e) {
    console.log('\nLỗi khi chạy test: ' + e.message);
    process.exitCode = 1;
  } finally {
    don();
  }
})();
