'use strict';
/**
 * Quản lý tiến trình con: mỗi module kiểu 'local' là một app Node riêng
 * (lark-task-manager, lark-lich-tac-nghiep, lark-ads-manager...). Hub bật chúng
 * bằng `node server.js` với biến PORT, giữ log và tự bật lại khi chết.
 *
 * Nguyên tắc: nếu cổng của module đã có ai đó chạy sẵn (user tự mở start.bat)
 * thì hub KHÔNG spawn nữa, chỉ dùng lại — nếu không sẽ EADDRINUSE.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const cfg = require('./config');

const MAX_LOG = 300;

/** id -> trạng thái tiến trình */
const S = new Map();

function state(id) {
  if (!S.has(id)) {
    S.set(id, {
      id,
      proc: null,
      cuaHub: false,        // tiến trình do hub bật?
      trangThai: 'tat',     // tat | dang-khoi-dong | chay | loi | ngoai
      loi: '',
      batLuc: 0,
      songLuc: 0,           // lần cuối health check thành công
      soLanChet: 0,
      logs: [],
      dangTat: false,
    });
  }
  return S.get(id);
}

function log(id, dong, loai = 'out') {
  const s = state(id);
  const t = new Date().toISOString().slice(11, 19);
  String(dong).split(/\r?\n/).forEach((d) => {
    if (!d.trim()) return;
    s.logs.push({ t, loai, d: d.length > 500 ? d.slice(0, 500) + '…' : d });
  });
  if (s.logs.length > MAX_LOG) s.logs.splice(0, s.logs.length - MAX_LOG);
}

/** Gõ cửa cổng của module xem có ai trả lời không. */
function songKhong(cong, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: cong, path: '/', method: 'GET', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function khoiDong(mod) {
  if (mod.kieu !== 'local') return state(mod.id);
  const s = state(mod.id);
  if (s.proc && !s.proc.killed) return s;

  if (!mod.thuMuc || !fs.existsSync(mod.thuMuc)) {
    s.trangThai = 'loi';
    s.loi = 'Không thấy thư mục: ' + mod.thuMuc;
    log(mod.id, s.loi, 'err');
    return s;
  }

  // Đã có instance chạy sẵn trên cổng này -> dùng lại, không spawn
  if (await songKhong(mod.cong)) {
    s.trangThai = 'ngoai';
    s.cuaHub = false;
    s.songLuc = Date.now();
    log(mod.id, 'Đã có app chạy sẵn ở cổng ' + mod.cong + ' — hub dùng lại, không tự bật.', 'hub');
    return s;
  }

  const [cmd, ...args] = mod.lenh;
  s.dangTat = false;
  s.trangThai = 'dang-khoi-dong';
  s.loi = '';
  s.batLuc = Date.now();
  log(mod.id, '$ ' + mod.lenh.join(' ') + '   (PORT=' + mod.cong + ', cwd=' + mod.thuMuc + ')', 'hub');

  let proc;
  try {
    proc = spawn(cmd, args, {
      cwd: mod.thuMuc,
      env: { ...process.env, PORT: String(mod.cong), HUB: '1', HUB_PREFIX: '/m/' + mod.id },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    s.trangThai = 'loi';
    s.loi = e.message;
    log(mod.id, 'Không bật được: ' + e.message, 'err');
    return s;
  }

  s.proc = proc;
  s.cuaHub = true;
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', (d) => log(mod.id, d, 'out'));
  proc.stderr.on('data', (d) => log(mod.id, d, 'err'));

  proc.on('exit', (code, sig) => {
    s.proc = null;
    log(mod.id, 'Tiến trình kết thúc (code=' + code + (sig ? ', signal=' + sig : '') + ')', 'hub');
    if (s.dangTat) { s.trangThai = 'tat'; return; }
    s.trangThai = 'loi';
    s.loi = 'Tiến trình dừng đột ngột (code ' + code + ')';
    s.soLanChet += 1;
    // Tự bật lại, giãn dần, tối đa 5 lần liên tiếp
    if (s.soLanChet <= 5) {
      const cho = Math.min(15000, 2000 * s.soLanChet);
      log(mod.id, 'Sẽ bật lại sau ' + Math.round(cho / 1000) + 's…', 'hub');
      setTimeout(() => { if (!s.dangTat) khoiDong(mod); }, cho);
    } else {
      log(mod.id, 'Chết quá nhiều lần — dừng tự bật lại. Bấm "Bật lại" trong Cài đặt.', 'hub');
    }
  });

  choSanSang(mod).catch(() => {});
  return s;
}

/** Chờ module trả lời trên cổng của nó rồi đánh dấu 'chay'. */
async function choSanSang(mod) {
  const s = state(mod.id);
  const hetHan = Date.now() + cfg.khoiDongTimeoutMs;
  while (Date.now() < hetHan) {
    if (s.dangTat) return false;
    if (!s.proc && s.cuaHub) return false;
    if (await songKhong(mod.cong, 1200)) {
      s.trangThai = 'chay';
      s.songLuc = Date.now();
      s.soLanChet = 0;
      log(mod.id, 'Sẵn sàng ở http://127.0.0.1:' + mod.cong, 'hub');
      return true;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  if (s.trangThai !== 'chay') {
    s.trangThai = 'loi';
    s.loi = 'Quá thời gian chờ ' + Math.round(cfg.khoiDongTimeoutMs / 1000) + 's mà cổng ' + mod.cong + ' chưa trả lời';
    log(mod.id, s.loi, 'err');
  }
  return false;
}

async function tat(mod) {
  const s = state(mod.id);
  // App do người dùng tự mở (start.bat) — hub không có quyền tắt hộ
  if (!s.cuaHub && (await songKhong(mod.cong))) {
    s.thongBao = 'App này đang được chạy sẵn ngoài hub (cửa sổ start.bat riêng) — ' +
      'hub chỉ dùng lại chứ không tắt/bật hộ. Đóng cửa sổ đó nếu muốn dừng.';
    log(mod.id, s.thongBao, 'hub');
    return s;
  }
  s.thongBao = '';
  s.dangTat = true;
  if (s.proc) {
    log(mod.id, 'Đang tắt…', 'hub');
    try { s.proc.kill(); } catch (_) {}
    s.proc = null;
  }
  s.trangThai = 'tat';
  s.cuaHub = false;
  return s;
}

async function batLai(mod) {
  const s0 = state(mod.id);
  if (!s0.cuaHub && (await songKhong(mod.cong))) {
    s0.thongBao = 'App chạy sẵn ngoài hub — không bật lại từ đây được. ' +
      'Đóng cửa sổ start.bat của app rồi bấm Bật lại, hub sẽ tự chạy nó.';
    log(mod.id, s0.thongBao, 'hub');
    return s0;
  }
  await tat(mod);
  const s = state(mod.id);
  s.thongBao = '';
  s.soLanChet = 0;
  await new Promise((r) => setTimeout(r, 400));
  return khoiDong(mod);
}

/** Kiểm tra sức khoẻ định kỳ cho mọi module đang được bật. */
async function ktSucKhoe(mods) {
  for (const mod of mods) {
    if (mod.kieu !== 'local' || !mod.bat) continue;
    const s = state(mod.id);
    if (s.trangThai === 'tat' || s.dangTat) continue;
    const song = await songKhong(mod.cong, 1500);
    if (song) {
      s.songLuc = Date.now();
      if (s.trangThai !== 'chay') { s.trangThai = s.proc || s.cuaHub ? 'chay' : 'ngoai'; s.loi = ''; }
      if (!s.proc && !s.cuaHub) s.trangThai = 'ngoai';
    } else if (s.trangThai === 'chay' || s.trangThai === 'ngoai') {
      s.trangThai = s.proc ? 'dang-khoi-dong' : 'loi';
      if (!s.proc) s.loi = 'Cổng ' + mod.cong + ' không trả lời';
    }
  }
}

function tinhTrang(mod) {
  const s = state(mod.id);
  if (mod.kieu !== 'local') {
    return { trangThai: mod.kieu === 'lark' ? 'lark' : 'ngoai-url', loi: '', cuaHub: false, soLog: 0 };
  }
  return {
    trangThai: s.trangThai,
    loi: s.loi,
    thongBao: s.thongBao || '',
    cuaHub: s.cuaHub,
    batLuc: s.batLuc,
    songLuc: s.songLuc,
    soLanChet: s.soLanChet,
    soLog: s.logs.length,
  };
}

function logs(id, n = 120) {
  return state(id).logs.slice(-n);
}

async function tatHet() {
  for (const s of S.values()) {
    s.dangTat = true;
    if (s.proc) { try { s.proc.kill(); } catch (_) {} }
  }
}

module.exports = { khoiDong, tat, batLai, ktSucKhoe, tinhTrang, logs, tatHet, songKhong };
