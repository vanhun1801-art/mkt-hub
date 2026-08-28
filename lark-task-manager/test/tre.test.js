'use strict';
/*
 * Kiểm tra luồng "việc trễ deadline" ở vai NHÂN SỰ.
 *
 *   node test/tre.test.js
 *
 * Test tự bật một instance riêng (cổng 5197) với danh sách quản lý rỗng người,
 * nên tài khoản đang đăng nhập bị coi là nhân sự.
 *
 * KHÔNG GHI GÌ VÀO BASE: mọi phép thử ở đây đều là các đường bị chặn — server
 * trả 422 trước khi gọi API Lark. Hai đường có ghi thật (nhân sự bấm "Giải
 * quyết" trên việc đã trễ, quản lý đóng việc đã trễ) phải thử tay trên một bản
 * ghi nháp rồi hoàn nguyên, không đưa vào bộ test tự động.
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
const hetHan = (t) => {
  if (!t.deadline) return false;
  const h = new Date(t.deadline); h.setHours(0, 0, 0, 0);
  const nay = new Date(); nay.setHours(0, 0, 0, 0);
  return h < nay;
};
const coMinhChung = (t) => (t.attachment || []).length > 0 || !!t.link;
const laTre = (t) => hetHan(t) && !dong.test(String(t.status || '')) && !t.daGiaiQuyet;

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

  try {
    let meta = null;
    for (let i = 0; i < 40 && !meta; i++) {
      await new Promise((s) => setTimeout(s, 500));
      try { meta = await (await fetch(URL + '/api/meta')).json(); } catch (_) {}
    }
    if (!meta) throw new Error('instance không lên được ở cổng ' + PORT);

    console.log('\n\x1b[1mVai đang thử\x1b[0m');
    const vai = meta.role || (meta.manager ? 'manager' : '');
    ok('instance chạy ở vai nhân sự', vai === 'staff', 'role=' + vai);
    ok('server công bố luật chặn hoàn thành khi trễ',
      !!(meta.rules && meta.rules.chanHoanThanhKhiTre));

    const ds = (await (await fetch(URL + '/api/tasks')).json()).tasks || [];
    console.log('\n\x1b[1mĐọc dữ liệu\x1b[0m');
    ok('lấy được danh sách việc', ds.length > 0, ds.length + ' việc');
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

    console.log('\n\x1b[1mViệc còn hạn\x1b[0m');
    const conHan = ds.find((t) => !hetHan(t) && !dong.test(String(t.status || '')));
    if (!conHan) bo('không cho Giải quyết việc chưa trễ', 'không có việc nào còn hạn');
    else {
      const r = await goi(conHan.id, 'giai-quyet');
      ok('không cho Giải quyết việc chưa trễ',
        r.status === 422 && r.ma === 'NOT_LATE', r.status + ' ' + r.ma);
    }

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
