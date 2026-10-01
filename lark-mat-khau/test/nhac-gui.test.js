'use strict';
/**
 * Bộ nhắc ở CHẾ ĐỘ API (như trên Render), Lark giả: gửi đúng người, ghi nhật ký,
 * chạy lại KHÔNG gửi trùng, trước 8:00 không gửi, gửi lỗi thì không ghi "đã gửi".
 * Chạy: node test/nhac-gui.test.js
 */
const path = require('path');
const Module = require('module');
let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

process.env.LARK_MODE = 'api';
process.env.LARK_APP_ID = 'cli_gia';
process.env.LARK_APP_SECRET = 'bi-mat-gia';
delete process.env.MK_NHAC_TAT;

const daGuiTin = [];
let hongNguoi = '';
const tinGia = { tao: () => ({ gui: async (o) => {
  if (o.userId === hongNguoi) return { ok: false, loi: 'Lark 230013: bot chưa mở cho người này' };
  daGuiTin.push(o); return { ok: true };
} }) };
const goc = Module._load;
Module._load = function (req, parent, ...r) {
  if (/lark-chung[\\/]tin-lark$/.test(req) || req === '../lark-chung/tin-lark') return tinGia;
  return goc.call(this, req, parent, ...r);
};

const cfg = require('../config');
const nhac = require('../nhac');
const NGAY = 86400000;
const hom = (n) => Date.parse('2026-10-01T00:00:00+07:00') + n * NGAY;
const H = { id: 'ou_h', ten: 'Hân' }, G = { id: 'ou_g', ten: 'Giang' };
const D = {
  luc: 0,
  goi: [{ id: 'g7', ten: 'Canva', hetHan: hom(7), phuTrach: [H, G], trangThai: 'Đang dùng' }],
  tk: [{ id: 't1', nenTang: 'TikTok', coMatKhau: true, doiLuc: null, phuTrach: [H], trangThai: 'Đang dùng' }],
};
const kho = { tatCa: async () => D };
const NK = [];
const lark = {
  listAllRecords: async (t) => (t === cfg.nkTableId ? NK.map((c) => ({ cells: c })) : []),
  createRecord: async (f, t) => { if (t === cfg.nkTableId) NK.push(f); },
};

(async () => {
  const sang7 = Date.parse('2026-10-01T00:30:00Z');            // 07:30 VN
  let kq = await nhac.chay({ kho, lark, luc: sang7 });
  ok('trước 8:00 không gửi', kq.guiDuoc === 0 && daGuiTin.length === 0, JSON.stringify(kq));

  const sang9 = Date.parse('2026-10-01T02:00:00Z');            // 09:00 VN
  hongNguoi = 'ou_g';
  kq = await nhac.chay({ kho, lark, luc: sang9 });
  ok('gửi được 2 tin (gia hạn cho Hân + mật khẩu cho Hân)', kq.guiDuoc === 2, JSON.stringify(kq));
  ok('gửi lỗi cho Giang được báo ra, không im lặng', kq.loi.some((l) => /Giang/.test(l)));
  ok('mỗi tin gửi bằng open_id người phụ trách', daGuiTin.every((t) => t.userId === 'ou_h'));
  ok('tin có khoá chống trùng (uuid)', daGuiTin.every((t) => t.khoa && t.khoa.length <= 50));
  ok('tin không còn dấu ** markdown', daGuiTin.every((t) => !/\*\*/.test(t.text)));
  ok('mỗi tin đã gửi = một dòng nhật ký "Nhắc …"', NK.length === 2 && NK.every((c) => /^Nhắc/.test(c[cfg.f.nk.hanhDong])));
  ok('lỗi gửi thì KHÔNG ghi "đã gửi" (để lần sau gửi lại)', !NK.some((c) => String(c[cfg.f.nk.ma]).includes('ou_g')));

  hongNguoi = '';
  kq = await nhac.chay({ kho, lark, luc: sang9 + 3600000 });
  ok('chạy lại: chỉ gửi đúng tin còn thiếu (Giang), không gửi lại cho Hân', kq.guiDuoc === 1 && kq.daGuiTruoc === 2 && daGuiTin.at(-1).userId === 'ou_g',
    JSON.stringify(kq));
  kq = await nhac.chay({ kho, lark, luc: sang9 + 7200000 });
  ok('chạy lần nữa: không gửi gì', kq.guiDuoc === 0 && kq.daGuiTruoc === 3);

  process.env.MK_NHAC_TAT = '1';
  kq = await nhac.chay({ kho, lark, luc: sang9 });
  ok('MK_NHAC_TAT=1 thì không chạy', kq.guiDuoc === 0 && /tắt/i.test(kq.loi.join(' ')));

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
