'use strict';
/**
 * Cấu hình của lớp vỏ (hub). Bản thân hub không nói chuyện với Lark Base —
 * mọi việc đọc/ghi vẫn do từng module tự làm như khi chạy riêng lẻ.
 */
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const MODULES_FILE = process.env.HUB_MODULES_FILE
  ? path.resolve(ROOT, process.env.HUB_MODULES_FILE)
  : path.join(ROOT, 'modules.json');

/** Đọc lại modules.json mỗi lần gọi để thêm/sửa base không cần restart. */
function docModules() {
  const raw = fs.readFileSync(MODULES_FILE, 'utf8');
  const data = JSON.parse(raw);
  const list = Array.isArray(data.modules) ? data.modules : [];
  return list.map((m, i) => ({
    id: String(m.id || 'module-' + i),
    ten: m.ten || m.id || 'Module',
    mo_ta: m.mo_ta || '',
    icon: m.icon || '▦',
    mau: m.mau || '#3370ff',
    kieu: m.kieu === 'ngoai' || m.kieu === 'lark' ? m.kieu : 'local',
    thuMuc: m.thuMuc ? path.resolve(ROOT, m.thuMuc) : null,
    cong: Number(m.cong || 0),
    lenh: Array.isArray(m.lenh) && m.lenh.length ? m.lenh : ['node', 'server.js'],
    url: m.url || '',
    larkUrl: m.larkUrl || '',
    kpi: m.kpi || '',
    an: Array.isArray(m.an) ? m.an : [],
    css: typeof m.css === 'string' ? m.css : '',
    phuSelector: m.phuSelector || '',
    bat: m.bat !== false,
  }));
}

function ghiModules(list) {
  const raw = fs.readFileSync(MODULES_FILE, 'utf8');
  const data = JSON.parse(raw);
  data.modules = list;
  fs.writeFileSync(MODULES_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Bản thô trong file (để sửa rồi ghi lại, không mất field lạ). */
function docModulesTho() {
  return JSON.parse(fs.readFileSync(MODULES_FILE, 'utf8')).modules || [];
}

/* Số bản của hai file dùng chung (loc.js, i18n.js) — lấy theo thời điểm sửa file
 * thật, nên sửa từ điển là trình duyệt tự nạp lại, không phải nhớ đổi build. */
function verTinh() {
  let t = 0;
  for (const f of ['public/loc.js', 'public/i18n.js', 'public/i18n.js']) {
    try { t = Math.max(t, fs.statSync(path.join(__dirname, f)).mtimeMs); } catch (_) {}
  }
  return String(Math.round(t / 1000) || 1);
}

module.exports = {
  verChung: verTinh(),
  root: ROOT,
  port: Number(process.env.PORT || 5180),
  build: '2026-08-28.1',

  /* ---- Chế độ chạy ----
   * cli : chạy trên máy cá nhân — module dùng phiên lark-cli của máy, không cần đăng nhập
   * api : deploy server chung — hub đăng nhập Lark cho từng người rồi truyền danh tính
   *       xuống module qua header; module đọc/ghi Base bằng app credentials.
   * Tự chọn api khi có đủ LARK_APP_ID + LARK_APP_SECRET.
   */
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionDays: Number(process.env.SESSION_DAYS || 7),

  ten: 'Marketing Hub',
  phu: 'Rooty Trip Phú Quốc',

  modulesFile: MODULES_FILE,
  docModules,
  docModulesTho,
  ghiModules,

  // Hub tự bật các module kiểu 'local' khi khởi động
  tuKhoiDong: process.env.HUB_AUTOSTART !== '0',
  // Thời gian chờ module sẵn sàng (ms)
  khoiDongTimeoutMs: Number(process.env.HUB_BOOT_MS || 60000),
  // Cache chỉ số của trang Tổng quan chung
  kpiCacheMs: Number(process.env.HUB_KPI_MS || 20000),
  // Timeout khi hub gọi API của module
  goiTimeoutMs: Number(process.env.HUB_FETCH_MS || 30000),
  // Việc lâu (ROAS, ghép POS, đồng bộ): 30 giây là thiếu, xem VIEC_LAU ở proxy.js
  goiLauMs: Number(process.env.HUB_FETCH_LAU_MS || 240000),
};
