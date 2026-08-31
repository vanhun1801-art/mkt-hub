'use strict';
/*
 * Kiểm tra các chốt quyền ở vai NHÂN SỰ.
 *
 * Cần một instance chạy với quyen.json không chứa tài khoản đang đăng nhập:
 *   PORT=5175 LARK_QUYEN_FILE=quyen.nhansu.json node server.js
 *
 *   node test/quyen.test.js            chỉ kiểm tra các đường bị chặn (không ghi)
 *   node test/quyen.test.js --write    thêm các đường được phép (có ghi thật)
 *
 * Mọi phép thử "bị chặn" đều không chạm vào Base — server từ chối trước khi gọi API.
 */
const STAFF = process.env.STAFF_URL || 'http://localhost:5175';
const MGR = process.env.APP_URL || 'http://localhost:5174';
const WRITE = process.argv.includes('--write');

let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + name); }
  else {
    fail++; fails.push(name + (detail ? ' → ' + detail : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + name + (detail ? '\n         ' + detail : ''));
  }
}
function group(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* Bài này chỉ đúng khi STAFF_URL thật sự chạy vai nhân sự. Thiếu
 * quyen.nhansu.json là instance rơi về vai quản lý, mọi chốt 403 không xảy ra,
 * và các phép PATCH bên dưới GHI THẬT xuống Base — đã có hai bản ghi của phòng
 * bị đổi tên vì chạy sai vai. Nên dừng hẳn thay vì chạy tiếp. */
const BAO_DUNG_VAI = (url) => [
  '',
  'DỪNG  ' + url + ' đang chạy ở vai QUẢN LÝ, không phải nhân sự.',
  '      Chạy đúng cách:  PORT=5175 LARK_QUYEN_FILE=quyen.nhansu.json node server.js',
  '      (chạy tiếp ở vai quản lý thì các phép thử sẽ GHI THẬT xuống Base)',
  '',
].join(String.fromCharCode(10));

async function call(base, path, opts) {
  const r = await fetch(base + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  let body = null;
  try { body = await r.json(); } catch (_) {}
  return { status: r.status, body };
}
const staff = (p, o) => call(STAFF, p, o);
const mgr = (p, o) => call(MGR, p, o);

(async () => {
  console.log('Vai nhân sự: ' + STAFF + '   ·   Vai quản lý: ' + MGR);

  const s = (await staff('/api/meta')).body;
  const m = (await mgr('/api/meta')).body;

  /* ---------- 0. đúng vai chưa ----------
   * DỪNG NGAY nếu instance ở STAFF_URL không thật sự chạy vai nhân sự. Thiếu
   * quyen.nhansu.json là nó rơi về vai quản lý, mọi chốt 403 không xảy ra, và
   * mấy phép PATCH bên dưới GHI THẬT xuống Base. Đã có hai bản ghi của phòng bị
   * đổi tên vì chạy bài này ở sai vai — không để tái diễn. */
  if (s.manager !== false) {
    console.log(BAO_DUNG_VAI(STAFF));
    process.exit(2);
  }

  /* ---------- 1. phạm vi nhìn thấy ---------- */
  group('1. Nhân sự chỉ thấy lịch của mình');
  ok('server báo không phải quản lý', s.manager === false);
  ok('thấy ít lịch hơn quản lý', s.items.length < m.items.length, s.items.length + ' < ' + m.items.length);
  ok('mọi lịch thấy được đều là của mình',
    s.items.every((t) => [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === s.me.id)));
  // Lịch đã huỷ bị cắt khỏi phần của nhân sự, nên trừ ra khi đối chiếu
  ok('số lịch khớp phép đếm từ phía quản lý (trừ lịch đã huỷ)',
    s.items.length === m.items.filter((t) =>
      t.status !== 'Hủy lịch' &&
      [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === s.me.id)).length,
    s.items.length + ' vs ' + m.items.filter((t) =>
      t.status !== 'Hủy lịch' &&
      [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === s.me.id)).length);
  ok('không còn thấy lịch đã huỷ', !s.items.some((t) => t.status === 'Hủy lịch'));
  ok('chỉ được cấp danh sách trạng thái của nhân sự',
    (s.config.staffStatuses || []).length === 3);

  /* ---------- 2. không mượn được vai ---------- */
  group('2. Nhân sự không mượn được vai người khác');
  const victim = (m.people || []).find((p) => p.id !== s.me.id);
  const asOther = (await staff('/api/meta?as=' + encodeURIComponent(victim.id))).body;
  ok('as=<người khác> bị bỏ qua', !asOther.acting, JSON.stringify(asOther.acting));
  ok('không mở rộng được phạm vi bằng as=', asOther.items.length === s.items.length,
    asOther.items.length + ' vs ' + s.items.length);
  ok('vẫn chỉ thấy lịch của chính mình',
    asOther.items.every((t) => [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === s.me.id)));

  /* ---------- 3. lịch của người khác ---------- */
  group('3. Không thao tác lên lịch không phải của mình');
  const notMine = m.items.find((t) =>
    ![...(t.owner || []), ...(t.staff || [])].some((u) => u.id === s.me.id));
  ok('tìm được một lịch của người khác để thử', !!notMine, notMine && notMine.title);

  const patchOther = await staff('/api/items/' + notMine.id, {
    method: 'PATCH', body: JSON.stringify({ report: 'không được phép' }),
  });
  ok('PATCH lịch người khác bị chặn 403/NOT_YOURS',
    patchOther.status === 403 && patchOther.body.code === 'NOT_YOURS', JSON.stringify(patchOther.body));

  const delOther = await staff('/api/items/' + notMine.id, { method: 'DELETE' });
  ok('DELETE bị chặn 403/MANAGER_ONLY',
    delOther.status === 403 && delOther.body.code === 'MANAGER_ONLY', JSON.stringify(delOther.body));

  const upOther = await staff('/api/items/' + notMine.id + '/attachment/files?name=x.txt', {
    method: 'POST', body: 'noi dung',
  });
  ok('upload lên lịch người khác bị chặn', upOther.status === 403, JSON.stringify(upOther.body));

  const dlOther = await fetch(STAFF + '/api/items/' + notMine.id + '/file/AKoob6h29oecKKxMKyPliy37gve');
  ok('tải đính kèm của lịch người khác bị chặn', dlOther.status === 403, 'status=' + dlOther.status);

  const quyenOther = await staff('/api/quyen', {
    method: 'POST', body: JSON.stringify({ managers: [s.me.id] }),
  });
  ok('tự cấp quyền quản lý bị chặn',
    quyenOther.status === 403 && quyenOther.body.code === 'MANAGER_ONLY', JSON.stringify(quyenOther.body));

  /* ---------- 4. trường khoá trên lịch của mình ---------- */
  group('4. Trường và trạng thái do quản lý giữ');
  const mine = s.items[0];
  ok('có lịch của mình để thử', !!mine, mine && mine.title);

  const locked = {
    owner: 'Phụ trách',
    payment: 'Thanh toán chi phí',
    focStatus: 'Trạng thái FOC',
    mediaStatus: 'Trạng thái nhân sự Media',
    mediaSent: 'Gửi Feedback Media',
    /* mediaNote đã chuyển sang nhân sự điền: đó là nhận xét VỀ bạn Media, do
     * chính người xin hỗ trợ viết sau chuyến — nên không còn nằm ở đây. */
  };
  for (const k of Object.keys(locked)) {
    const v = k === 'owner' ? [{ id: s.me.id }] : k === 'mediaSent' ? true : 'Phê duyệt';
    const r = await staff('/api/items/' + mine.id, { method: 'PATCH', body: JSON.stringify({ [k]: v }) });
    ok('khoá trường "' + locked[k] + '"',
      r.status === 403 && r.body.code === 'FIELD_LOCKED', JSON.stringify(r.body));
  }

  for (const st of ['Duyệt/Chờ tác nghiệp', 'Từ chối', 'Hủy lịch', 'Đã hoàn tất', 'Từ chối/Cần điều chỉnh']) {
    const r = await staff('/api/items/' + mine.id, { method: 'PATCH', body: JSON.stringify({ status: st }) });
    ok('khoá trạng thái "' + st + '"',
      r.status === 403 && r.body.code === 'STATUS_LOCKED', JSON.stringify(r.body));
  }

  /* ---------- 5. khoá kế hoạch sau khi duyệt ---------- */
  // (chốt vai đã kiểm ở đầu bài — xem phần "0. Đúng vai chưa")
  group('5. Kế hoạch khoá sau khi lịch đã duyệt/đóng');
  const sealed = s.items.find((t) =>
    ['Duyệt/Chờ tác nghiệp', 'Đã hoàn tất', 'Hủy lịch', 'Từ chối'].includes(t.status));
  if (sealed) {
    /* Gửi lại CHÍNH tên đang có, không phải một tên khác.
     *
     * Bài này kỳ vọng máy chủ trả 403. Nhưng nếu instance ở STAFF_URL không
     * thật sự chạy vai nhân sự (thiếu quyen.nhansu.json thì nó rơi về vai quản
     * lý), 403 không xảy ra và PATCH ghi thật xuống Base. Bản cũ gửi chuỗi
     * "đổi tên trộm" và đã đổi tên hai bản ghi thật của phòng theo đúng đường
     * này. Gửi lại tên cũ thì kể cả lọt cũng không đổi gì. */
    const r = await staff('/api/items/' + sealed.id, {
      method: 'PATCH', body: JSON.stringify({ title: sealed.title }),
    });
    /* Hai chốt cùng chặn được: NOT_OWNER (không phải phụ trách) chạy trước,
     * PLAN_LOCKED (kế hoạch đã khoá) chạy sau. Lịch nào cũng chỉ cần một trong
     * hai là đủ an toàn, nên nhận cả hai mã. */
    const CHAN = ['PLAN_LOCKED', 'NOT_OWNER'];
    ok('không sửa được Tên hoạt động của lịch "' + sealed.status + '"',
      r.status === 403 && CHAN.includes(r.body.code), JSON.stringify(r.body));

    const r2 = await staff('/api/items/' + sealed.id, {
      method: 'PATCH', body: JSON.stringify({ costPlan: sealed.costPlan ?? null }),
    });
    ok('không sửa được Chi phí dự kiến của lịch đã chốt',
      r2.status === 403 && CHAN.includes(r2.body.code), JSON.stringify(r2.body));
  } else {
    console.log('  \x1b[33mSKIP\x1b[0m không có lịch đã duyệt/đóng của người này để thử');
  }

  /* ---------- 6. tạo lịch: trường quản lý bị bỏ ---------- */
  if (WRITE) {
    group('6. Nhân sự tạo lịch (ghi thật)');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const title = '[TEST QUYEN - XOÁ SAU] ' + stamp;
    const other2 = (m.people || []).find((p) => p.id !== s.me.id);

    const c = await staff('/api/items', {
      method: 'POST',
      body: JSON.stringify({
        title,
        purpose: 'Bản ghi thử phân quyền, xoá ngay sau khi kiểm tra.',
        start: new Date(Date.now() + 9 * 86400000).toISOString(),
        duration: '2',
        // các trường dưới đây nhân sự KHÔNG được phép đặt
        owner: [other2.id],
        payment: 'Đã thanh toán',
        focStatus: 'Phê duyệt',
        status: 'Đã hoàn tất',
      }),
    });
    ok('tạo được lịch mới', c.status === 200 && c.body.ok, JSON.stringify(c.body).slice(0, 200));

    const re = (await staff('/api/meta?refresh=1')).body;
    const made = (re.items || []).find((t) => t.title === title);
    ok('lịch mới hiện trong phạm vi của mình', !!made);

    if (made) {
      ok('trạng thái bị ép về "Chờ duyệt/Xử lý", không tự hoàn tất được',
        made.status === 'Chờ duyệt/Xử lý', made.status);
      ok('Phụ trách bị ép về chính người tạo, không gán cho người khác',
        (made.owner || []).length === 1 && made.owner[0].id === s.me.id,
        JSON.stringify(made.owner));
      ok('Thanh toán do quản lý giữ nên bị bỏ qua', !made.payment, String(made.payment));
      ok('Trạng thái FOC do quản lý giữ nên bị bỏ qua', !made.focStatus, String(made.focStatus));
      ok('người tạo tự động nằm trong nhóm nhân sự',
        (made.staff || []).some((u) => u.id === s.me.id));

      group('7. Đường được phép của nhân sự (ghi thật)');
      const sub = await staff('/api/items/' + made.id, {
        method: 'PATCH', body: JSON.stringify({ status: 'Đang lên kế hoạch' }),
      });
      ok('hạ về "Đang lên kế hoạch" được phép', sub.status === 200, JSON.stringify(sub.body));

      const edit = await staff('/api/items/' + made.id, {
        method: 'PATCH',
        body: JSON.stringify({ plan: '- 08:00 xuất phát', costPlan: 250000, transport: ['Taxi'] }),
      });
      ok('sửa Kế hoạch / Chi phí dự kiến / Phương tiện được phép', edit.status === 200, JSON.stringify(edit.body));

      const resend = await staff('/api/items/' + made.id, {
        method: 'PATCH', body: JSON.stringify({ status: 'Chờ duyệt/Xử lý' }),
      });
      ok('gửi duyệt lại được phép', resend.status === 200, JSON.stringify(resend.body));

      const re2 = (await staff('/api/meta?refresh=1')).body;
      const now2 = (re2.items || []).find((t) => t.id === made.id);
      ok('đọc lại thấy kế hoạch đã sửa', now2 && /08:00/.test(now2.plan || ''), now2 && now2.plan);
      ok('đọc lại thấy chi phí đã sửa', now2 && now2.costPlan === 250000, String(now2 && now2.costPlan));
      ok('đọc lại thấy phương tiện đã sửa', now2 && (now2.transport || []).includes('Taxi'));

      group('8. Quản lý duyệt rồi dọn dẹp (ghi thật)');
      const app = await mgr('/api/items/' + made.id, {
        method: 'PATCH', body: JSON.stringify({ status: 'Duyệt/Chờ tác nghiệp' }),
      });
      ok('quản lý duyệt được lịch của nhân sự', app.status === 200, JSON.stringify(app.body));

      const nowLocked = await staff('/api/items/' + made.id, {
        method: 'PATCH', body: JSON.stringify({ title: 'sửa sau khi đã duyệt' }),
      });
      ok('sau khi duyệt, nhân sự hết sửa được kế hoạch',
        nowLocked.status === 403 && nowLocked.body.code === 'PLAN_LOCKED', JSON.stringify(nowLocked.body));

      const stillOk = await staff('/api/items/' + made.id, {
        method: 'PATCH', body: JSON.stringify({ report: 'Đã hoàn thành tác nghiệp.' }),
      });
      ok('nhưng vẫn ghi được Báo cáo', stillOk.status === 200, JSON.stringify(stillOk.body));

      const delMine = await staff('/api/items/' + made.id, { method: 'DELETE' });
      ok('nhân sự không xoá được lịch của chính mình',
        delMine.status === 403 && delMine.body.code === 'MANAGER_ONLY', JSON.stringify(delMine.body));

      const del = await mgr('/api/items/' + made.id, { method: 'DELETE' });
      ok('quản lý xoá được bản ghi thử', del.status === 200 && del.body.ok, JSON.stringify(del.body));

      const gone = (await mgr('/api/meta?refresh=1')).body;
      ok('bản ghi thử đã biến mất', !(gone.items || []).some((t) => t.id === made.id));
    }
  }

  console.log('\n' + '─'.repeat(52));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nLỗi khi chạy test:', e.message); process.exit(2); });
