'use strict';
/* Tìm kiếm tự học mỗi ngày:
   1. Lượt bấm/phát/tải/ghim sau một lần tìm → media đó được cộng điểm cho đúng từ khoá ấy.
   2. Từ đồng nghĩa (du-lieu/hoc/dong-nghia.json) — lượt chạy hằng ngày đọc các lần tìm hỏng
      (0 kết quả / không ai bấm) rồi bổ sung, server tự nạp lại.
   Nhật ký sự kiện: du-lieu/hoc/su-kien-YYYY-MM.jsonl (không ghi tên người dùng). */
const fs = require('fs');
const path = require('path');
const { DL, bo } = require('./chi-muc');

const DIR = path.join(DL, 'hoc');
const DONG = path.join(DIR, 'dong-nghia.json');
fs.mkdirSync(DIR, { recursive: true });

/* Bộ khởi đầu: tiếng Anh ↔ tiếng Việt và cách gọi tắt hay gặp trong phòng. Mỗi dòng là một nhóm
   cùng nghĩa — gõ bất kỳ từ nào trong nhóm là tìm cả nhóm. */
const KHOI_DAU = [
  /* Tìm kiếm so CHUỖI CON, nên không thêm từ ngắn/rộng (vd "tb", "dji", "phòng"): chúng dính vào
     tên file và kéo theo cả nghìn kết quả lạc đề. */
  ['hoàng hôn', 'sunset'], ['bãi biển', 'beach'], ['flycam', 'drone'], ['hồ bơi', 'pool', 'bể bơi'],
  ['team building', 'teambuilding'], ['gala dinner', 'gala', 'tiệc tối'], ['pháo hoa', 'firework', 'fireworks'],
  ['cáp treo', 'cable car'], ['lặn ngắm san hô', 'snorkeling', 'lặn biển'], ['đi bộ dưới biển', 'seawalker'],
  ['phòng ngủ', 'bedroom'], ['ẩm thực', 'món ăn', 'đồ ăn', 'food'], ['đám cưới', 'wedding', 'tiệc cưới'],
  ['đoàn', 'khách đoàn', 'mice'], ['địa trung hải', 'sunset town', 'thị trấn hoàng hôn'], ['kol', 'influencer', 'koc'],
  ['cano', 'ca nô', 'speedboat'], ['du thuyền', 'yacht', 'cruise'], ['khai trương', 'grand opening', 'opening'],
];

function khoa(q) { return bo(q || '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

let nhom = new Map();   // khoá không dấu → danh sách khoá cùng nhóm
function napDongNghia() {
  let ds = KHOI_DAU;
  try { ds = JSON.parse(fs.readFileSync(DONG, 'utf8')).nhom || KHOI_DAU; } catch (e) {
    fs.writeFileSync(DONG, JSON.stringify({ ghiChu: 'Mỗi mảng là một nhóm cùng nghĩa. Lượt chạy hằng ngày tự bổ sung.', nhom: KHOI_DAU }, null, 1));
  }
  const m = new Map();
  for (const g of ds) {
    const k = [...new Set(g.map(khoa).filter(Boolean))];
    for (const x of k) m.set(x, [...new Set((m.get(x) || []).concat(k))]);
  }
  nhom = m;
}
napDongNghia();
fs.watchFile(DONG, { interval: 5000 }, napDongNghia);

/* Các cách viết tương đương của một cụm (gồm chính nó) */
const moRong = cum => nhom.get(khoa(cum)) || [khoa(cum)];

/* ---------- điểm học từ lượt bấm ---------- */
const TRONG = { bam: 1, phat: 2, tai: 3, ghim: 3 };
const diem = new Map();   // khoá truy vấn → Map(token → điểm)
function cong(q, t, w) {
  const k = khoa(q); if (!k || !t) return;
  if (!diem.has(k)) diem.set(k, new Map());
  const m = diem.get(k); m.set(t, (m.get(t) || 0) + w);
}
for (const f of fs.readdirSync(DIR).filter(n => /^su-kien-\d{4}-\d{2}\.jsonl$/.test(n))) {
  for (const dong of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
    try { const e = JSON.parse(dong); if (TRONG[e.loai]) cong(e.q, e.t, TRONG[e.loai]); } catch (er) {}
  }
}

function ghi(e) {
  const loai = String(e.loai || '');
  if (!(loai in TRONG) && loai !== 'tim') return false;
  const rec = { luc: Date.now(), loai, q: String(e.q || '').slice(0, 100) };
  if (e.t) rec.t = String(e.t).slice(0, 40);
  if (loai === 'tim') { rec.tong = Math.max(0, +e.tong || 0); if (!khoa(rec.q)) return false; }
  const thang = new Date().toISOString().slice(0, 7);
  fs.appendFileSync(path.join(DIR, 'su-kien-' + thang + '.jsonl'), JSON.stringify(rec) + '\n');
  if (TRONG[loai]) cong(rec.q, rec.t, TRONG[loai]);
  return true;
}

/* Điểm học cho một media với một truy vấn: khớp nguyên câu mạnh nhất, cộng thêm từ các cụm
   đồng nghĩa của cả câu. Có trần để một ảnh bị bấm nhiều không đè hết kết quả khớp nội dung. */
function diemHoc(q, t) {
  let s = 0;
  for (const k of moRong(q)) { const m = diem.get(k); if (m) s += m.get(t) || 0; }
  return Math.min(s, 12);
}

/* Câu tìm ra 0 kết quả kể từ mốc `tu` (ms) — lần tìm SAU CÙNG của câu đó vẫn 0 thì mới tính */
function timKhongRa(tu) {
  const cuoi = new Map();
  for (const f of fs.readdirSync(DIR).filter(n => /^su-kien-\d{4}-\d{2}\.jsonl$/.test(n)).sort()) {
    for (const dong of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
      try { const e = JSON.parse(dong); if (e.loai === 'tim' && e.luc >= tu) cuoi.set(khoa(e.q), e); } catch (er) {}
    }
  }
  return [...cuoi.values()].filter(e => e.tong === 0).map(e => e.q);
}

/* Câu cả phòng hay tìm trong 30 ngày, CHỈ những câu lần gần nhất ra kết quả — gợi ý một câu
   rỗng là dắt người ta vào ngõ cụt. Đọc lại file tối đa 1 lần/phút. */
let demHay = { luc: 0, ds: [] };
function hayTim(n = 8) {
  if (Date.now() - demHay.luc > 60e3) {
    const tu = Date.now() - 30 * 86400e3, m = new Map();
    for (const f of fs.readdirSync(DIR).filter(x => /^su-kien-\d{4}-\d{2}\.jsonl$/.test(x)).sort()) {
      for (const dong of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
        try {
          const e = JSON.parse(dong); if (e.loai !== 'tim' || e.luc < tu) continue;
          const k = khoa(e.q); const x = m.get(k) || { q: e.q.trim(), lan: 0, tong: 0 };
          x.lan++; x.tong = e.tong; x.q = e.q.trim(); m.set(k, x);
        } catch (er) {}
      }
    }
    demHay = { luc: Date.now(), ds: [...m.values()].filter(x => x.tong > 0).sort((a, b) => b.lan - a.lan) };
  }
  return demHay.ds.slice(0, n);
}

module.exports = { khoa, moRong, ghi, diemHoc, timKhongRa, hayTim, TRONG };
