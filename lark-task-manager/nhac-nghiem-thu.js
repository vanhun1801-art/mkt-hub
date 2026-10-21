'use strict';
const crypto = require('node:crypto');
const LECH = 7 * 3600000;
const dong = t => ['Hoàn thành', 'Hủy', 'Nháp'].includes(t.status);
const choDuyet = t => !!t.daGiaiQuyet && !dong(t) && !t.lienPhong;
const md = s => String(s || '').replace(/([*_~`[\]<>])/g, '\\$1').slice(0, 220);
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 40);
const nguoi = list => [...new Set((list || []).map(u => u && u.id).filter(Boolean))];
function gioVN(now) {
  const d = new Date(now + LECH);
  return { ngay: d.toISOString().slice(0, 10), gio: d.getUTCHours(), phut: d.getUTCMinutes() };
}
const nut = (title, url) => ({ tag: 'action', actions: [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: title }, url }] });
const chu = content => ({ tag: 'div', text: { tag: 'lark_md', content } });
const the = (title, color, elements) => ({ config: { wide_screen_mode: true }, header: { template: color, title: { tag: 'plain_text', content: title } }, elements });
const urlTask = (url, t) => url + '/#/m/cong-viec?mo=nghiem-thu&rec=' + encodeURIComponent(t.id);
function theNghiemThu(tasks, url, { demo = false, moc = '', now = Date.now() } = {}) {
  const list = tasks.filter(choDuyet).sort((a, b) => (Date.parse(a.ngayGiaiQuyet) || now) - (Date.parse(b.ngayGiaiQuyet) || now));
  const title = (demo ? '[THỬ] ' : '') + (list.length ? list.length + ' công việc chờ bạn nghiệm thu' : 'Mẫu nhắc nghiệm thu');
  const elements = [chu((moc === 'sang' ? '**Đầu ngày · 08:00**' : moc === 'chieu' ? '**Cuối ngày · 17:00**' : '**Nhân sự đã nộp sản phẩm**') + '\nMarketing Hub · Bảng công việc')];
  if (demo) elements.push(chu('**Gửi thử riêng cho bạn. Chưa gửi người order khác.**'));
  if (!list.length) elements.push(chu('Hiện bạn không có việc chờ nghiệm thu. Khi có sản phẩm, Bot sẽ liệt kê tên việc, người nộp và nút mở sản phẩm tại đây.'));
  for (const t of list.slice(0, 5)) {
    const age = (now - (Date.parse(t.ngayGiaiQuyet) || now)) / 3600000;
    elements.push({ tag: 'hr' }, chu('**' + md(t.title || '(chưa có tên)') + '**\nNgười nộp: ' + md((t.owner || []).map(u => u.name).join(', ') || 'chưa gán') + (age >= 36 ? '\n⚠️ Đã chờ nghiệm thu hơn 36 giờ.' : '\nSản phẩm đã sẵn sàng để kiểm tra.')));
    elements.push(nut('Xem sản phẩm & nghiệm thu', urlTask(url, t)));
  }
  if (list.length > 5) elements.push(chu('Còn **' + (list.length - 5) + '** việc khác trong danh sách nghiệm thu.'));
  elements.push({ tag: 'hr' }, chu('**Việc cần làm**\n1. Mở và kiểm tra link/tệp sản phẩm theo yêu cầu ban đầu.\n2. Chọn **Nghiệm thu đạt** nếu đạt yêu cầu.\n3. Chọn **Cần chỉnh sửa**, ghi rõ góp ý nếu chưa đạt.\nBot tự ngừng nhắc việc đã nghiệm thu hoặc đã trả về chỉnh sửa.'));
  elements.push(nut('Mở danh sách nghiệm thu', url + '/#/m/cong-viec?mo=nghiem-thu'));
  return the(title, 'orange', elements);
}
function canhBao(tasks, now) {
  return tasks.filter(t => !dong(t) && !t.daGiaiQuyet && !t.lienPhong).map(t => {
    const han = Date.parse(t.deadline || t.deadline1) || 0;
    const late = t.status === 'Trễ deadline' || (han > 0 && han < now);
    const soon = han >= now && han <= now + 86400000;
    const priority = late ? 0 : soon ? 1 : t.status === 'Làm lại' ? 2 : 3;
    const action = late ? 'Nộp sản phẩm ngay; nếu đang vướng, ghi rõ lý do và thời điểm có thể bàn giao trong Trao đổi.'
      : t.status === 'Làm lại' ? 'Đọc góp ý, chỉnh sửa và nộp lại sản phẩm.'
      : t.status === 'Chờ tiếp nhận' ? 'Tiếp nhận việc, kiểm tra yêu cầu và xác nhận thời điểm bắt đầu.'
      : soon ? 'Ưu tiên hoàn tất và nộp sản phẩm trước hạn; báo vướng mắc ngay nếu có.'
      : 'Cập nhật tiến độ, nêu bước tiếp theo và thời gian dự kiến bàn giao.';
    return { t, han, late, priority, action };
  }).filter(x => x.late || x.priority < 3 || ['Đang tiến hành', 'Chờ tiếp nhận'].includes(x.t.status))
    .sort((a, b) => a.priority - b.priority || (a.han || Infinity) - (b.han || Infinity));
}
function theCanhBao(tasks, url, now = Date.now()) {
  const list = canhBao(tasks, now);
  const late = list.filter(x => x.late).length;
  const elements = [chu('**Bản thử riêng cho quản lý · dữ liệu toàn phòng hiện tại**\n' + late + ' việc quá hạn chưa nộp · ' + (list.length - late) + ' việc cần theo dõi.'), chu('**Ưu tiên hôm nay:** xử lý việc trễ trước, sau đó việc sắp đến hạn và việc cần làm lại.')];
  if (!list.length) elements.push(chu('Hiện không có việc cần cảnh báo.'));
  for (const x of list.slice(0, 5)) {
    const t = x.t;
    const han = x.han ? new Date(x.han).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : 'chưa có deadline';
    elements.push({ tag: 'hr' }, chu((x.late ? '🔴 ' : '🟠 ') + '**' + md(t.title || '(chưa có tên)') + '**\nPhụ trách: ' + md((t.owner || []).map(u => u.name).join(', ') || 'chưa gán') + '\nHạn: ' + md(han) + '\n**Việc cần làm:** ' + x.action));
    elements.push(nut('Mở việc & xử lý', url + '/#/m/cong-viec?rec=' + encodeURIComponent(t.id)));
  }
  if (list.length > 5) elements.push(chu('Còn **' + (list.length - 5) + '** việc khác cần theo dõi trong Bảng công việc.'));
  elements.push(chu('Đây là gợi ý hành động từ trạng thái và deadline. Bot không tự đổi deadline hoặc tạo thêm công việc.'));
  return the('[THỬ] Cần hành động · ' + late + ' việc trễ deadline', 'red', elements);
}

// Một dòng cấu hình + các dấu gửi trong kho cấu hình Base. Không lưu trên ổ tạm Render.
function storage(B) {
  const prefix = 'bot-cong-viec:v1:';
  let cache = null;
  let at = 0;
  async function rows(force = false) {
    if (!force && cache && Date.now() - at < 30000) return cache;
    const data = await B.docHet(); cache = data; at = Date.now(); return data;
  }
  return {
    async read() {
      const ds = (await rows()).filter(r => String(r['Ô'] || '').startsWith(prefix));
      if (ds.length > 1) throw new Error('Cấu hình Bot có hai dòng trùng trên Base.');
      return ds.length ? JSON.parse(String(ds[0]['Ô']).slice(prefix.length)) : { mode: 'pilot', pilot: null };
    },
    async write(settings) {
      const ds = (await rows(true)).filter(r => String(r['Ô'] || '').startsWith(prefix));
      if (ds.length > 1) throw new Error('Cấu hình Bot có hai dòng trùng trên Base.');
      const cells = { 'Ô': prefix + JSON.stringify(settings) };
      if (ds.length) await B.ghi(ds[0].recordId, cells); else if (!(await B.tao(cells))) throw new Error('Base chưa xác nhận lưu cấu hình Bot.');
      cache = null;
    },
    async has(key) { return (await rows()).some(r => r['Ô'] === 'bot-cv-gui:' + key); },
    async mark(key) {
      if (!(await B.tao({ 'Ô': 'bot-cv-gui:' + key }))) throw new Error('Base chưa xác nhận dấu gửi.');
      cache = null;
    },
  };
}
function create({ store, send, getTasks, url, now = Date.now, log = console.error }) {
  let queue = Promise.resolve();
  let busy = false;
  const serial = fn => { const p = queue.catch(() => {}).then(fn); queue = p; return p; };
  async function once(userId, card, key) {
    const stamp = hash(userId + ':' + key);
    if (await store.has(stamp)) return { ok: true, skipped: true };
    const r = await send({ userId, card, khoa: stamp });
    if (!r || !r.ok) throw new Error((r && r.loi) || 'Lark chưa xác nhận đã gửi tin.');
    await store.mark(stamp);
    return r;
  }
  function recipients(t, cfg) {
    const ids = nguoi(t.requester);
    return cfg.mode === 'all' ? ids : cfg.mode === 'pilot' && cfg.pilot ? ids.filter(id => id === cfg.pilot.id) : [];
  }
  async function submission(t) {
    return serial(async () => {
      if (!choDuyet(t)) return;
      const cfg = await store.read();
      const key = 'nop:' + t.id + ':' + (t.nhacVong || t.ngayGiaiQuyet || '') + ':' + hash(JSON.stringify([t.linkKetQua, t.fileKetQua]));
      for (const id of recipients(t, cfg)) await once(id, theNghiemThu([t], url), key);
    });
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const time = now(); const vn = gioVN(time);
      // Chỉ bù trong 30 phút đầu ca, không bắn bản sáng vào giữa buổi/ban đêm.
      if (![8, 17].includes(vn.gio) || vn.phut >= 30) return;
      await serial(async () => {
        const cfg = await store.read();
        if (cfg.mode === 'off' || (cfg.mode === 'pilot' && !cfg.pilot)) return;
        const tasks = (await getTasks()).filter(choDuyet);
        const map = new Map();
        for (const t of tasks) for (const id of recipients(t, cfg)) {
          if (!map.has(id)) map.set(id, []); map.get(id).push(t);
        }
        for (const [id, list] of map) {
          try { await once(id, theNghiemThu(list, url, { moc: vn.gio === 8 ? 'sang' : 'chieu', now: time }), 'lich:' + vn.ngay + ':' + vn.gio); }
          catch (e) { log('[Bot nghiệm thu] ' + e.message); }
        }
      });
    } catch (e) { log('[Bot nghiệm thu] ' + e.message); } finally { busy = false; }
  }
  async function preview(me) {
    const tasks = await getTasks();
    return { settings: await store.read(), cards: [theNghiemThu(tasks.filter(t => nguoi(t.requester).includes(me.id)), url, { demo: true, now: now() }), theCanhBao(tasks, url, now())] };
  }
  async function demo(me, requestId) {
    return serial(async () => {
      const p = await preview(me);
      const sent = [];
      for (let i = 0; i < p.cards.length; i++) sent.push(await once(me.id, p.cards[i], 'demo:' + requestId + ':' + i));
      // Gửi thử cũng chọn người nhận thử cho lịch nhắc. Chưa mở cho người khác.
      await store.write({ mode: 'pilot', pilot: { id: me.id, name: me.name }, hours: ['08:00', '17:00'], timezone: 'Asia/Ho_Chi_Minh' });
      return { ok: true, sent: sent.length, recipient: me.name, mode: 'pilot' };
    });
  }
  return { submission, tick, preview, demo, stop: () => serial(() => store.write({ mode: 'off', pilot: null })) };
}
module.exports = { choDuyet, gioVN, canhBao, theNghiemThu, theCanhBao, storage, create };
