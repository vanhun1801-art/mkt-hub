'use strict';
/*
 * Kiểm thử lớp an toàn tạo cột, dùng Lark giả trong bộ nhớ.
 * Không gọi mạng và không đụng Base thật.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = path.join(os.tmpdir(), 'ota-schema-field-test-' + process.pid + '.json');
process.env.OTA_BASE_TOKEN = 'bas_test';
process.env.OTA_TABLE_ID = 'tbl_bookings';
process.env.OTA_TABLE_OTA_ID = 'tbl_ota';
process.env.OTA_TABLE_TOUR_ID = 'tbl_tour';
process.env.OTA_SCHEMA_FILE = tmp;

const cfg = require('../config');
const lark = require('../lark');
let seq = 0;
const taoDaGoi = [];

const typeOf = (spec) => spec.chiDoc ? 'formula'
  : spec.kieu === 'Ô đánh dấu' ? 'checkbox'
    : spec.kieu === 'Số' ? 'number'
      : spec.kieu === 'Ngày giờ' ? 'datetime'
        : 'text';

const fieldsBookings = Object.entries(cfg.cot)
  .filter(([key]) => !['gioDon', 'ghiChu', 'daNhan', 'payloadGoc'].includes(key))
  .map(([key, spec]) => ({ id: 'fld_' + key, name: spec.ten, type: typeOf(spec) }));
const fieldsOta = Object.entries(cfg.cotOta)
  .map(([key, spec]) => ({ id: 'fld_ota_' + key, name: spec.ten, type: 'text' }));
const fieldsTour = Object.entries(cfg.cotTour)
  .map(([key, spec]) => ({ id: 'fld_tour_' + key, name: spec.ten, type: 'text' }));

lark.listFields = async (tableId) => {
  if (tableId === 'tbl_bookings') return fieldsBookings.slice();
  if (tableId === 'tbl_ota') return fieldsOta.slice();
  if (tableId === 'tbl_tour') return fieldsTour.slice();
  return [];
};
lark.listTables = async () => [
  { id: 'tbl_bookings', name: 'Bookings' },
  { id: 'tbl_ota', name: 'Danh mục OTA' },
  { id: 'tbl_tour', name: 'Danh mục Tour' },
];
lark.quyenGhi = async () => true;
lark.createField = async (tableId, spec) => {
  if (tableId !== 'tbl_bookings') throw new Error('sai bảng');
  taoDaGoi.push({ ...spec });
  const field = { id: 'fld_new_' + (++seq), name: spec.name, type: spec.type };
  fieldsBookings.push(field);
  return { field_id: field.id };
};

let pass = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
  try { fs.unlinkSync(tmp); } catch (_) {}
  const schema = require('../schema');

  const mot = await schema.taoCotVanHanh();
  t('tạo đúng ba cột', mot.tao.length === 3, JSON.stringify(mot));
  t('đúng tên đã duyệt',
    JSON.stringify(taoDaGoi.map((x) => x.name)) === JSON.stringify(['Giờ đón', 'Ghi chú khách', 'Sales đã nhận']),
    JSON.stringify(taoDaGoi));
  t('đúng kiểu text, text, checkbox',
    JSON.stringify(taoDaGoi.map((x) => x.type)) === JSON.stringify(['text', 'text', 'checkbox']),
    JSON.stringify(taoDaGoi));
  t('không tạo Payload gốc', !taoDaGoi.some((x) => x.name === 'Payload gốc'));
  t('sau lượt đầu không còn thiếu cột vận hành', mot.ok === true && mot.conThieu.length === 0,
    JSON.stringify(mot.conThieu));

  const hai = await schema.taoCotVanHanh();
  t('bấm lần hai không tạo trùng', hai.tao.length === 0 && taoDaGoi.length === 3,
    JSON.stringify({ hai, taoDaGoi }));
  t('lượt hai nhận diện ba cột đã có', hai.daCo.length === 3, JSON.stringify(hai.daCo));

  try { fs.unlinkSync(tmp); } catch (_) {}
  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
