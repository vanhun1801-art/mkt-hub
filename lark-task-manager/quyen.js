#!/usr/bin/env node
'use strict';
/*
 * Phân quyền bằng dòng lệnh — dùng khi không mở được app hoặc bị khoá hết quyền.
 *
 *   node quyen.js                    xem ai đang là quản lý
 *   node quyen.js danhsach           liệt kê toàn bộ người + open_id
 *   node quyen.js them "Văn Hùng"    thêm quản lý (khớp tên không cần đủ)
 *   node quyen.js bo "Văn Hùng"      bỏ quyền quản lý
 *   node quyen.js dat ou_xxx,ou_yyy  đặt lại danh sách bằng open_id
 */

const cfg = require('./config');
const lark = require('./lark');

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', b: '\x1b[1m',
  blue: '\x1b[34m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
};

const first = (v) => (Array.isArray(v) ? v[0] : v);
const asUsers = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

/** Danh bạ lấy từ các cột người trong bảng Tracking. */
async function danhBa() {
  const F = cfg.fields;
  const recs = await lark.listAllRecords();
  const m = new Map();
  const count = new Map();
  for (const r of recs) {
    for (const key of ['owner', 'helper', 'requester']) {
      for (const u of asUsers(r.cells[F[key].id])) {
        if (!u.id) continue;
        if (!m.has(u.id)) m.set(u.id, u.name || u.id);
        if (key === 'owner') count.set(u.id, (count.get(u.id) || 0) + 1);
      }
    }
  }
  return [...m.entries()]
    .map(([id, name]) => ({ id, name, soViec: count.get(id) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function timNguoi(list, tuKhoa) {
  const q = String(tuKhoa || '').trim().toLowerCase();
  if (!q) return [];
  if (/^ou_[a-z0-9]+$/i.test(q)) return list.filter((p) => p.id.toLowerCase() === q);
  const hit = list.filter((p) => p.name.toLowerCase().includes(q));
  const exact = hit.filter((p) => p.name.toLowerCase() === q);
  return exact.length ? exact : hit;
}

function inDanhSachQuanLy(list, ids) {
  console.log('\n' + C.b + 'Quản lý hiện tại' + C.reset + C.dim + '  (' + ids.length + ')' + C.reset);
  for (const id of ids) {
    const p = list.find((x) => x.id === id);
    console.log('  ' + C.blue + '●' + C.reset + ' ' + (p ? p.name : C.yellow + '(không có trong bảng)' + C.reset) +
      C.dim + '  ' + id + C.reset);
  }
  console.log('');
}

async function main() {
  const [lenh, arg] = process.argv.slice(2);

  let me = null;
  try { me = await lark.whoami(); } catch (_) {}

  const list = await danhBa();
  let ids = cfg.loadManagerIds();

  if (me) {
    const laQL = ids.includes(me.id);
    console.log('\nĐang đăng nhập: ' + C.b + me.name + C.reset + '  ' +
      (laQL ? C.blue + '[Quản lý]' : C.dim + '[Nhân sự triển khai]') + C.reset +
      C.dim + '  ' + me.id + C.reset);
  } else {
    console.log(C.yellow + '\nChưa đăng nhập lark-cli. Chạy: lark-cli auth login' + C.reset);
  }

  if (!lenh || lenh === 'xem') {
    inDanhSachQuanLy(list, ids);
    console.log(C.dim + 'Thêm quản lý:  node quyen.js them "<tên>"' + C.reset);
    console.log(C.dim + 'Xem tất cả:    node quyen.js danhsach' + C.reset + '\n');
    return;
  }

  if (lenh === 'danhsach') {
    console.log('\n' + C.b + 'Toàn bộ người trong bảng Tracking' + C.reset +
      C.dim + '  (' + list.length + ')' + C.reset);
    for (const p of list) {
      const ql = ids.includes(p.id);
      console.log('  ' + (ql ? C.blue + '●' + C.reset : C.dim + '○' + C.reset) + ' ' +
        p.name.padEnd(30) + C.dim + String(p.soViec).padStart(3) + ' việc  ' + p.id + C.reset +
        (ql ? '  ' + C.blue + 'Quản lý' + C.reset : ''));
    }
    console.log('');
    return;
  }

  if (lenh === 'them' || lenh === 'bo') {
    const hit = timNguoi(list, arg);
    if (!arg) return console.log(C.red + '\nThiếu tên. Ví dụ: node quyen.js ' + lenh + ' "Văn Hùng"' + C.reset + '\n');
    if (!hit.length) return console.log(C.red + '\nKhông tìm thấy ai khớp "' + arg + '".' + C.reset +
      '\n' + C.dim + 'Xem danh sách: node quyen.js danhsach' + C.reset + '\n');
    if (hit.length > 1) {
      console.log(C.yellow + '\nCó ' + hit.length + ' người khớp — ghi rõ hơn hoặc dùng open_id:' + C.reset);
      hit.forEach((p) => console.log('  ' + p.name + C.dim + '  ' + p.id + C.reset));
      console.log('');
      return;
    }
    const p = hit[0];
    if (lenh === 'them') {
      if (ids.includes(p.id)) console.log(C.dim + '\n' + p.name + ' đã là quản lý.' + C.reset);
      else { ids = cfg.saveManagerIds(ids.concat(p.id)); console.log(C.green + '\n+ ' + p.name + ' → Quản lý' + C.reset); }
    } else {
      if (!ids.includes(p.id)) console.log(C.dim + '\n' + p.name + ' vốn không phải quản lý.' + C.reset);
      else {
        const conLai = ids.filter((x) => x !== p.id);
        if (!conLai.length) return console.log(C.red + '\nĐây là quản lý duy nhất — thêm người khác trước khi bỏ.' + C.reset + '\n');
        ids = cfg.saveManagerIds(conLai);
        console.log(C.green + '\n- ' + p.name + ' → Nhân sự triển khai' + C.reset);
      }
    }
    inDanhSachQuanLy(list, ids);
    console.log(C.dim + 'Người bị đổi quyền cần tải lại trang app.' + C.reset + '\n');
    return;
  }

  if (lenh === 'dat') {
    const moi = String(arg || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!moi.length) return console.log(C.red + '\nThiếu open_id. Ví dụ: node quyen.js dat ou_aaa,ou_bbb' + C.reset + '\n');
    ids = cfg.saveManagerIds(moi);
    inDanhSachQuanLy(list, ids);
    return;
  }

  console.log(C.red + '\nLệnh không hợp lệ: ' + lenh + C.reset);
  console.log(C.dim + 'Dùng: xem | danhsach | them "<tên>" | bo "<tên>" | dat ou_a,ou_b' + C.reset + '\n');
}

main().catch((e) => {
  console.error(C.red + '\nLỗi: ' + e.message + C.reset + '\n');
  process.exit(1);
});
