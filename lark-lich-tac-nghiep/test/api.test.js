'use strict';
/*
 * Kiểm tra API của app Lịch tác nghiệp.
 *
 *   node test/api.test.js            chỉ đọc, không ghi vào Base
 *   node test/api.test.js --write    thêm vòng tạo -> sửa -> xoá một bản ghi thật
 *
 * Lưu ý: --write sẽ kích hoạt workflow "Cảnh báo chỉnh sửa bản ghi" của Base.
 */
const BASE = process.env.APP_URL || 'http://localhost:5174';
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

async function call(path, opts) {
  const r = await fetch(BASE + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  let body = null;
  try { body = await r.json(); } catch (_) { body = null; }
  return { status: r.status, body };
}

(async () => {
  console.log('Kiểm tra ' + BASE + (WRITE ? '  (có ghi thật)' : '  (chỉ đọc)'));

  /* ---------- 1. meta ---------- */
  group('1. /api/meta — nạp dữ liệu và danh tính');
  const m = await call('/api/meta');
  ok('trả 200', m.status === 200, 'status=' + m.status);
  const D = m.body || {};
  ok('nhận diện được người dùng lark-cli', !!(D.me && D.me.id), JSON.stringify(D.me));
  ok('xác định vai trò', typeof D.manager === 'boolean');
  ok('có danh sách lịch', Array.isArray(D.items) && D.items.length > 0, 'items=' + (D.items || []).length);
  ok('đã lọc dòng trống của Base', D.blankRows > 0, 'blankRows=' + D.blankRows);
  ok('không còn bản ghi rỗng lọt lưới',
    !(D.items || []).some((t) => !t.title && !t.purpose && !t.start && !t.status &&
      !(t.owner || []).length && !(t.staff || []).length));
  ok('có danh sách nhân sự', (D.people || []).length > 0, 'people=' + (D.people || []).length);
  ok('có options của mọi trường select',
    ['duration', 'transport', 'payment', 'foc', 'focStatus', 'mediaStatus', 'status']
      .every((k) => Array.isArray(D.options[k]) && D.options[k].length),
    JSON.stringify(Object.keys(D.options || {})));
  ok('trả cấu hình luồng trạng thái', (D.config.statusOrder || []).length === 8);

  /* ---------- 2. hình dạng dữ liệu ---------- */
  group('2. Ánh xạ kiểu dữ liệu Base → UI');
  const items = D.items || [];
  const withDate = items.filter((t) => t.start);
  ok('datetime parse được', withDate.length > 0 && !isNaN(new Date(withDate[0].start).getTime()));
  ok('user là mảng {id,name}',
    items.some((t) => (t.owner || []).length && t.owner[0].id && t.owner[0].name));
  ok('number là kiểu số', items.some((t) => typeof t.costPlan === 'number'));
  ok('checkbox là boolean', items.every((t) => typeof t.focRequest === 'boolean'));
  ok('multiSelect là mảng chuỗi',
    items.every((t) => Array.isArray(t.transport) && t.transport.every((x) => typeof x === 'string')));
  ok('attachment có file_token', items.some((t) => (t.files || []).some((f) => f.token)));
  const mdLink = items.find((t) => t.link);
  ok('URL đã bóc khỏi markdown [x](x)', !mdLink || !/^\s*\[/.test(mdLink.link), mdLink && mdLink.link);
  ok('trường formula tuần/tháng có giá trị', items.some((t) => /^\d{4}-T\d{2}$/.test(t.week || '')));

  /* ---------- 3. chuyển vai ---------- */
  group('3. Chuyển vai — quản lý xem giao diện nhân sự');
  const other = (D.people || []).find((p) => p.id !== (D.me && D.me.id));
  ok('có ít nhất một nhân sự khác để mượn vai', !!other, JSON.stringify(other));

  if (other) {
    const a = await call('/api/meta?as=' + encodeURIComponent(other.id));
    ok('meta?as= trả 200', a.status === 200);
    const A = a.body || {};
    if (D.manager) {
      ok('trả về acting đúng người', A.acting && A.acting.id === other.id, JSON.stringify(A.acting));
      ok('vẫn báo manager=true (quyền thật không đổi)', A.manager === true);
      ok('lịch bị thu hẹp so với vai quản lý', A.items.length < D.items.length,
        A.items.length + ' < ' + D.items.length);
      ok('chỉ còn lịch của người đó — lọc thật ở server',
        A.items.every((t) => [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === other.id)));
      ok('số lịch khớp với đếm phía quản lý',
        A.items.length === D.items.filter((t) =>
          [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === other.id)).length);
    } else {
      ok('không phải quản lý thì không mượn được vai', !A.acting);
    }

    // mượn vai chính mình = không mượn
    const self = await call('/api/meta?as=' + encodeURIComponent(D.me.id));
    ok('as=<chính mình> không kích hoạt chế độ xem thử', !(self.body || {}).acting);

    // ghi trong lúc mượn vai phải bị chặn ở server, không chỉ ẩn nút
    if (D.manager) {
      const wPatch = await call('/api/items/' + D.items[0].id + '?as=' + encodeURIComponent(other.id),
        { method: 'PATCH', body: JSON.stringify({ report: 'không được phép' }) });
      ok('PATCH khi đang mượn vai bị chặn 403/PREVIEW_READONLY',
        wPatch.status === 403 && wPatch.body.code === 'PREVIEW_READONLY', JSON.stringify(wPatch.body));

      const wPost = await call('/api/items?as=' + encodeURIComponent(other.id),
        { method: 'POST', body: JSON.stringify({ title: 'x', purpose: 'y', start: new Date().toISOString() }) });
      ok('tạo lịch khi đang mượn vai bị chặn',
        wPost.status === 403 && wPost.body.code === 'PREVIEW_READONLY', JSON.stringify(wPost.body));

      const wDel = await call('/api/items/' + D.items[0].id + '?as=' + encodeURIComponent(other.id),
        { method: 'DELETE' });
      ok('xoá khi đang mượn vai bị chặn',
        wDel.status === 403 && wDel.body.code === 'PREVIEW_READONLY', JSON.stringify(wDel.body));

      const wUp = await call('/api/items/' + D.items[0].id + '/attachment/files?as=' + encodeURIComponent(other.id),
        { method: 'POST', body: 'x' });
      ok('upload khi đang mượn vai bị chặn',
        wUp.status === 403 && wUp.body.code === 'PREVIEW_READONLY', JSON.stringify(wUp.body));

      const rGet = await call('/api/meta?as=' + encodeURIComponent(other.id));
      ok('nhưng đọc thì vẫn được', rGet.status === 200);
    }

    // open_id bịa
    const bogus = await call('/api/meta?as=ou_khong_ton_tai_0000');
    ok('as=<id không tồn tại> bị bỏ qua, không lỗi',
      bogus.status === 200 && !(bogus.body || {}).acting);
    ok('as sai không làm rỗng dữ liệu', (bogus.body || {}).items.length === D.items.length);
  }

  /* ---------- 4. quyền ---------- */
  group('4. Phân quyền');
  const q = await call('/api/quyen');
  ok('/api/quyen trả danh sách quản lý', q.status === 200 && Array.isArray(q.body.managers));
  ok('người đang đăng nhập nằm đúng vai',
    D.manager === q.body.managers.includes(D.me.id));

  if (D.manager) {
    const demote = await call('/api/quyen', {
      method: 'POST',
      body: JSON.stringify({ managers: q.body.managers.filter((x) => x !== D.me.id) }),
    });
    ok('chặn tự bỏ quyền quản lý của mình', demote.status === 400 && demote.body.code === 'SELF_DEMOTE',
      JSON.stringify(demote.body));

    const empty = await call('/api/quyen', { method: 'POST', body: JSON.stringify({ managers: [] }) });
    ok('chặn lưu danh sách quản lý rỗng', empty.status >= 400, JSON.stringify(empty.body));

    const after = await call('/api/quyen');
    ok('danh sách quản lý không bị thay đổi sau 2 lần chặn',
      JSON.stringify(after.body.managers) === JSON.stringify(q.body.managers));
  }

  /* ---------- 5. lỗi & biên ---------- */
  group('5. Xử lý lỗi');
  const nf = await call('/api/items/rec0000000000/', { method: 'PATCH', body: JSON.stringify({ title: 'x' }) });
  ok('đường dẫn sai trả 404', nf.status === 404, 'status=' + nf.status);

  const ghost = await call('/api/items/recKhongCoThat99', { method: 'PATCH', body: JSON.stringify({ title: 'x' }) });
  ok('record không tồn tại trả 404', ghost.status === 404, JSON.stringify(ghost.body));

  const badField = await call('/api/items/' + items[0].id, {
    method: 'PATCH', body: JSON.stringify({ khongCoTruongNay: 1 }),
  });
  ok('patch trường lạ bị từ chối, không ghi bừa', badField.status === 400,
    'status=' + badField.status + ' ' + JSON.stringify(badField.body));

  const badUp = await call('/api/items/' + items[0].id + '/attachment/status', { method: 'POST', body: 'x' });
  ok('không cho upload vào trường không phải đính kèm', badUp.status === 400, 'status=' + badUp.status);

  const miss = await call('/api/items', { method: 'POST', body: JSON.stringify({ title: 'Thiếu trường' }) });
  ok('tạo thiếu trường bắt buộc bị chặn', miss.status === 400 && miss.body.code === 'MISSING_FIELD',
    JSON.stringify(miss.body));

  const st = await call('/api/static-khong-co.js');
  ok('file tĩnh không có trả 404', st.status === 404);

  const trav = await fetch(BASE + '/../server.js');
  ok('chặn đọc file ngoài thư mục public', trav.status === 404 || trav.status === 403, 'status=' + trav.status);

  /* ---------- 6. ghi thật ---------- */
  if (WRITE) {
    group('6. Vòng ghi thật: tạo → sửa → chốt quy tắc → xoá');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const title = '[TEST APP - XOÁ SAU] ' + stamp;
    const start = new Date(Date.now() + 7 * 86400000).toISOString();

    const c = await call('/api/items', {
      method: 'POST',
      body: JSON.stringify({
        title, purpose: 'Bản ghi thử của app, sẽ tự xoá ngay sau khi kiểm tra.',
        plan: '- Kiểm tra đường ghi', start, duration: '3',
        transport: ['Tự túc phương tiện'], costPlan: 123000,
        focRequest: true, foc: ['Vinpearl Safari'], status: 'Đang lên kế hoạch',
      }),
    });
    ok('tạo bản ghi mới', c.status === 200 && c.body.ok, JSON.stringify(c.body).slice(0, 200));

    const after = await call('/api/meta?refresh=1');
    const made = (after.body.items || []).find((t) => t.title === title);
    ok('bản ghi mới xuất hiện trong Base', !!made);

    if (made) {
      ok('giữ đúng chi phí dự kiến', made.costPlan === 123000, String(made.costPlan));
      ok('giữ đúng thời lượng', made.duration === '3', String(made.duration));
      ok('giữ đúng phương tiện', (made.transport || []).includes('Tự túc phương tiện'));
      ok('giữ đúng checkbox FOC', made.focRequest === true);
      ok('giữ đúng danh mục FOC', (made.foc || []).includes('Vinpearl Safari'));
      ok('người tạo được gán làm phụ trách', (made.owner || []).some((u) => u.id === D.me.id));
      ok('người tạo nằm trong nhóm nhân sự', (made.staff || []).some((u) => u.id === D.me.id));
      ok('trạng thái đúng như gửi lên', made.status === 'Đang lên kế hoạch', made.status);

      // quy tắc bắt buộc có báo cáo
      const noProof = await call('/api/items/' + made.id, {
        method: 'PATCH', body: JSON.stringify({ status: 'Đang báo cáo' }),
      });
      ok('chặn chuyển "Đang báo cáo" khi chưa có báo cáo/liên kết',
        noProof.status === 400 && noProof.body.code === 'PROOF_REQUIRED', JSON.stringify(noProof.body));

      const withProof = await call('/api/items/' + made.id, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Đang báo cáo', report: 'Đã kiểm tra đường ghi.' }),
      });
      ok('cho chuyển khi đã có báo cáo', withProof.status === 200, JSON.stringify(withProof.body));

      const upd = await call('/api/items/' + made.id, {
        method: 'PATCH',
        body: JSON.stringify({ costActual: 99000, payment: 'Đã thanh toán', link: 'https://example.com/x' }),
      });
      ok('cập nhật chi phí thực tế + thanh toán + liên kết', upd.status === 200, JSON.stringify(upd.body));

      const re = await call('/api/meta?refresh=1');
      const now2 = (re.body.items || []).find((t) => t.id === made.id);
      ok('đọc lại thấy chi phí thực tế mới', now2 && now2.costActual === 99000, String(now2 && now2.costActual));
      ok('đọc lại thấy trạng thái mới', now2 && now2.status === 'Đang báo cáo', now2 && now2.status);
      ok('đọc lại thấy thanh toán mới', now2 && now2.payment === 'Đã thanh toán');
      ok('URL đọc lại đã bóc markdown', now2 && now2.link === 'https://example.com/x', now2 && now2.link);

      /* --- đính kèm: tải lên rồi tải xuống, so byte --- */
      group('7. Đính kèm (ghi thật)');
      const payload = 'Tep thu cua app Lich tac nghiep\nDong 2: tiếng Việt có dấu\n';
      const fname = 'test-dinh-kem.txt';
      const up = await fetch(BASE + '/api/items/' + made.id + '/attachment/files?name=' + encodeURIComponent(fname), {
        method: 'POST', body: payload,
      });
      const upBody = await up.json().catch(() => ({}));
      ok('tải tệp lên ô "Tệp đính kèm"', up.status === 200 && upBody.ok, JSON.stringify(upBody));

      const re3 = await call('/api/meta?refresh=1');
      const withFile = (re3.body.items || []).find((t) => t.id === made.id);
      const att = withFile && (withFile.files || []).find((f) => f.name === fname);
      ok('đính kèm xuất hiện trong bản ghi', !!att, JSON.stringify(withFile && withFile.files));

      if (att) {
        ok('đính kèm có file_token', !!att.token);
        ok('kích thước đúng bằng nội dung gửi lên',
          att.size === Buffer.byteLength(payload, 'utf8'),
          att.size + ' vs ' + Buffer.byteLength(payload, 'utf8'));

        const dl = await fetch(BASE + '/api/items/' + made.id + '/file/' + att.token);
        ok('tải tệp xuống trả 200', dl.status === 200, 'status=' + dl.status);
        const back = await dl.text();
        ok('nội dung tải về khớp nguyên vẹn (kể cả tiếng Việt)', back === payload,
          JSON.stringify(back.slice(0, 80)));
      }

      const badToken = await fetch(BASE + '/api/items/' + made.id + '/file/khongcothattoken');
      ok('file_token sai không làm sập server', badToken.status >= 400, 'status=' + badToken.status);

      group('8. Dọn dẹp');
      const del = await call('/api/items/' + made.id, { method: 'DELETE' });
      ok('xoá được bản ghi thử', del.status === 200 && del.body.ok, JSON.stringify(del.body));

      const gone = await call('/api/meta?refresh=1');
      ok('bản ghi thử đã biến mất khỏi Base',
        !(gone.body.items || []).some((t) => t.id === made.id));
    }
  }

  /* ---------- chốt chặn khi nộp báo cáo ---------- */
  group('9. Chốt chặn của cửa sổ báo cáo (không ghi gì)');
  {
    const G = require('../server.js');

    // Nhân sự điền báo cáo lúc lịch đang ở "Duyệt/Chờ tác nghiệp" — hai ô này
    // là kết quả thật của chuyến, không phải kế hoạch, nên phải ghi được.
    ok('lịch đã duyệt vẫn ghi được Thời gian kết thúc',
      !G.khoaKeHoach('Duyệt/Chờ tác nghiệp', ['end']));
    ok('lịch đã duyệt vẫn ghi được Thời lượng',
      !G.khoaKeHoach('Duyệt/Chờ tác nghiệp', ['duration']));
    ok('cả bộ trường của cửa sổ báo cáo đều lọt',
      !G.khoaKeHoach('Duyệt/Chờ tác nghiệp',
        ['status', 'end', 'duration', 'costActual', 'reportAfter', 'link', 'mediaNote']));

    // Còn nội dung kế hoạch thì vẫn phải khoá
    ok('lịch đã duyệt không sửa được Tên hoạt động',
      G.khoaKeHoach('Duyệt/Chờ tác nghiệp', ['title']));
    ok('lịch đã duyệt không sửa được Thời gian bắt đầu',
      G.khoaKeHoach('Duyệt/Chờ tác nghiệp', ['start']));
    ok('lịch đã hoàn tất không sửa được Kế hoạch',
      G.khoaKeHoach('Đã hoàn tất', ['plan']));
    ok('lịch chưa duyệt thì sửa thoải mái',
      !G.khoaKeHoach('Đang lên kế hoạch', ['title', 'start', 'plan']));

    // Minh chứng: ghi chú TRƯỚC chuyến không được tính là đã báo cáo
    ok('có Báo cáo sau tác nghiệp thì đủ minh chứng',
      G.duMinhChung({}, { reportAfter: 'Đã quay xong 3 clip' }));
    ok('có Liên kết sản phẩm thì đủ minh chứng',
      G.duMinhChung({}, { link: 'https://roo.vn/a' }));
    ok('ghi chú trước chuyến KHÔNG tính là đã báo cáo',
      !G.duMinhChung({ report: 'Xin foc có ăn trưa nhé TP' }, {}));
    ok('trống trơn thì không cho chuyển sang Đang báo cáo',
      !G.duMinhChung({}, {}));
    ok('khoảng trắng cũng không tính',
      !G.duMinhChung({}, { reportAfter: '   ', link: '  ' }));
    ok('lấy được giá trị cũ trên bản ghi khi body không gửi lại',
      G.duMinhChung({ reportAfter: 'đã viết từ trước' }, { status: 'Đang báo cáo' }));
  }

  /* ---------- xin huỷ lịch ---------- */
  group('10. Xin huỷ lịch (không ghi gì)');
  {
    const G = require('../server.js');
    const mau = [
      { id: 'a', status: 'Đang lên kế hoạch' },
      { id: 'b', status: 'Duyệt/Chờ tác nghiệp' },
      { id: 'c', status: 'Hủy lịch' },
      { id: 'd', status: 'Từ chối' },
      { id: 'e', status: 'Hủy lịch' },
    ];

    /* Chạy ở chế độ cli thì máy chủ lấy danh tính từ lark-cli chứ không đọc
     * header, nên không giả vai nhân sự bằng request được — kiểm thẳng hàm lọc. */
    const cuaNhanSu = G.anLichHuy(mau, false);
    ok('nhân sự không còn thấy lịch đã huỷ',
      !cuaNhanSu.some((t) => t.status === 'Hủy lịch'),
      'còn ' + cuaNhanSu.filter((t) => t.status === 'Hủy lịch').length);
    ok('lịch bị Từ chối thì nhân sự vẫn thấy (khác với huỷ)',
      cuaNhanSu.some((t) => t.status === 'Từ chối'));
    ok('cắt đúng 2 lịch huỷ, giữ lại 3', cuaNhanSu.length === 3, 'còn ' + cuaNhanSu.length);
    ok('quản lý vẫn thấy đủ để đối chiếu', G.anLichHuy(mau, true).length === 5);

    const cfgApp = (await call('/api/meta')).body.config || {};
    ok('"Hủy lịch" nằm trong nhóm trạng thái chỉ quản lý đặt',
      (cfgApp.managerStatuses || []).includes('Hủy lịch'));
    ok('nhân sự không tự đặt được trạng thái Hủy lịch',
      !(cfgApp.staffStatuses || []).includes('Hủy lịch'));

    /* KHÔNG kiểm quyền xoá bằng cách gọi thật DELETE. Ở chế độ cli máy chủ lấy
     * danh tính từ lark-cli chứ không đọc header, nên request nào cũng là quản
     * lý — lần đầu viết bài này nó đã xoá thật một bản ghi của Base. Chốt chặn
     * requireManager nằm ngay đầu nhánh DELETE, đọc mã là thấy. */

    // Xin huỷ mà không ghi lý do thì máy chủ phải chặn, không chỉ giao diện chặn
    const meta = await call('/api/meta');
    const nhap = (meta.body.items || []).find((t) => t.status === 'Đang lên kế hoạch' && !t.cancelReason);
    if (nhap) {
      const bad = await call('/api/items/' + nhap.id, {
        method: 'PATCH',
        body: JSON.stringify({ cancelWant: true, cancelReason: '   ' }),
      });
      ok('xin huỷ không kèm lý do bị máy chủ chặn',
        bad.status === 400 && bad.body.code === 'CANCEL_REASON_REQUIRED',
        'status=' + bad.status + ' ' + JSON.stringify(bad.body));
    } else {
      ok('bỏ qua: Base không có bản nháp nào để thử', true);
    }
  }

  /* ---------- tổng kết ---------- */
  console.log('\n' + '─'.repeat(52));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nLỗi khi chạy test:', e.message); process.exit(2); });
