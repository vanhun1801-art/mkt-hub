#!/usr/bin/env node
'use strict';
/**
 * Đồng bộ từ dòng lệnh — dùng cho Task Scheduler của Windows, chạy được kể cả
 * khi app web không mở.
 *
 *   node dong-bo.js                  đồng bộ mọi kênh đang bật, lùi theo ket-noi.json
 *   node dong-bo.js --xem-truoc      chỉ xem trước, không ghi gì
 *   node dong-bo.js --ngay 14        lùi 14 ngày
 *   node dong-bo.js --kenh meta      chỉ 1 kênh (meta | tiktok | googleSheet)
 *   node dong-bo.js --tu 2026-08-01 --den 2026-08-26
 *   node dong-bo.js --tao-moi        cho phép tạo chiến dịch/nhóm/quảng cáo chưa có
 *   node dong-bo.js --kiem-tra       chỉ kiểm tra kết nối
 */
const sync = require('./sync');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const has = (name) => process.argv.includes('--' + name);

const vnd = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ';

(async () => {
  if (has('kiem-tra')) {
    const rows = await sync.testAll();
    rows.forEach((r) => {
      console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.message ? ' — ' + r.message : ''}`);
      (r.results || []).forEach((x) => console.log(`    ${x.account}: ${x.ok ? (x.name || 'ok') : x.message}`
        + (x.currency ? ` · ${x.currency}` : '') + (x.khoangNgay ? ` · ${x.khoangNgay}` : '')));
    });
    process.exit(rows.every((r) => r.ok) ? 0 : 1);
  }

  // Token sắp hết hạn thì phải hét lên ngay, kẻo đồng bộ chết âm thầm mà không ai biết
  const ketnoi = require('./sync/ketnoi');
  const han = ketnoi.hanToken(ketnoi.read().meta);
  if (han && han.muc === 'het') {
    console.log(`\n!!! TOKEN META ${han.text} — đồng bộ Meta sẽ thất bại.`);
    console.log('    Lấy token mới:  node ket-noi.js --meta\n');
  } else if (han && han.muc === 'sapHet') {
    console.log(`\n!!! Token Meta ${han.text}.`);
    console.log('    Lấy token mới:  node ket-noi.js --meta\n');
  }

  const dryRun = has('xem-truoc');
  const kenh = arg('kenh', null);
  const res = await sync.run({
    providers: kenh && kenh !== true ? [kenh] : undefined,
    dryRun,
    days: arg('ngay', undefined),
    from: arg('tu', undefined),
    to: arg('den', undefined),
    tuTaoMoi: has('tao-moi') ? true : undefined,
  });

  console.log(`\n${dryRun ? 'XEM TRƯỚC' : 'ĐỒNG BỘ'} ${res.from} → ${res.to}`);
  res.ketQua.forEach((r) => {
    if (!r.ok) { console.log(`\n✗ ${r.label}: ${r.loi}`); return; }
    console.log(`\n✓ ${r.label} — lấy được ${r.layDuoc} dòng`);
    console.log(`   khớp: chiến dịch ${r.khop.chienDich.tong} · nhóm ${r.khop.nhom.tong} · quảng cáo ${r.khop.quangCao.tong}`
      + ` (theo ID ${r.khop.quangCao.theoId}, theo tên ${r.khop.quangCao.theoTen})`);
    if (r.ganIdMoi.length) console.log(`   gắn ID nền tảng mới cho ${r.ganIdMoi.length} bản ghi`);
    const cg = r.chuaGhep || {};
    const chua = (cg.chienDich || []).length + (cg.nhom || []).length + (cg.quangCao || []).length;
    if (chua) {
      console.log(`   ⚠ chưa ghép được ${chua} đối tượng (${r.dongBoQua} dòng số bị bỏ):`);
      (cg.quangCao || []).slice(0, 10).forEach((x) => console.log(`      QC "${x.name}" (chiến dịch ${x.chienDich || '?'})`));
      console.log('      → mở tab "Kết nối & Đồng bộ" để ghép tay, hoặc chạy lại với --tao-moi');
    }
    console.log(`   bảng ngày: +${r.bangNgay.taoMoi} mới · ~${r.bangNgay.capNhat} cập nhật · =${r.bangNgay.khongDoi} không đổi · ${r.bangNgay.boQua} bỏ qua`);
    (r.chiTiet.capNhat || []).slice(0, 8).forEach((u) =>
      console.log(`      ${u.date} ${u.adName}: ${vnd(u.truoc.spend)} → ${vnd(u.spend)}`));
    (r.log || []).forEach((l) => console.log('      · ' + l));
  });
  console.log(`\nTổng: +${res.tong.taoMoi} mới · ~${res.tong.capNhat} cập nhật · ${res.tong.loi} lỗi\n`);
  process.exit(res.tong.loi ? 1 : 0);
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
