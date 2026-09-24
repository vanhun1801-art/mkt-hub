'use strict';
/**
 * Theo dõi thư trả lời — BGĐ trả lời email trình duyệt, KOL trả lời thư mời.
 *
 * Anh Hùng chốt 23/09/2026: app KHÔNG tự quyết thay anh. Thấy thư trả lời thì
 * ghi nội dung vào Base (BGĐ trả lời / KOL trả lời) + bot báo anh, và giao diện
 * hiện câu trả lời cạnh nút "Duyệt" / "KOL đã xác nhận" để anh bấm một cái.
 *
 * Tìm luồng thư:
 *   - gửi từ app → +send trả thread_id, lưu ở cột "Thư BGĐ" / "Thư KOL"
 *   - gửi tay trong Lark Mail (Lưu nháp → gửi) → không có thread_id; tìm bằng
 *     tiêu đề đã lưu ("Tiêu đề thư BGĐ" / "Tiêu đề thư mời") qua +triage
 *
 * Thư trả lời = thư trong luồng mà người gửi KHÁC người gửi thư đầu tiên.
 * Cần scope đọc hộp thư của lark-cli (xem README); thiếu thì ghi lỗi có chữ, không ném.
 */
const cfg = require('./config');
const T = require('./tinh');
const kho = require('./kho');

const trangThai = { lanCuoi: 0, loi: '', daBao: 0 };
const CHU_KY = (cfg.mode === 'cli' ? 15 : 10) * 60000;

function cli(args) {
  return require('./lark').cli(args, { retries: 1, timeout: 60000 });
}

/** Lấy mọi chuỗi thread_id có trong một khối JSON (hình dạng trả về của +triage chưa cố định). */
function timThread(o, tieuDe, out = []) {
  if (!o || typeof o !== 'object') return out;
  if (Array.isArray(o)) { o.forEach((x) => timThread(x, tieuDe, out)); return out; }
  if (o.thread_id && (!tieuDe || String(o.subject || o.title || '').includes(tieuDe.slice(0, 40)))) out.push(String(o.thread_id));
  for (const v of Object.values(o)) if (v && typeof v === 'object') timThread(v, tieuDe, out);
  return out;
}

const diaChi = (m) => String((m && m.head_from && (m.head_from.mail_address || m.head_from.address)) || (m && m.from) || '').toLowerCase();
const luc = (m) => Number(m && m.internal_date) || Date.parse((m && m.date_formatted) || '') || 0;

/* Chữ ký BGĐ / công ty hay gặp — cắt từ đây trở đi (thư trả lời trên Lark: "DUYỆT YOUR TRIP. OUR PASSION…"). */
const CHU_KY_CUA = [/YOUR TRIP\.?\s*OUR PASSION/i, /D[ẫa]n\s+[Đđ]ầu\s+Du\s+L[ịi]ch/i, /Tr[âa]n\s+tr[ọo]ng\s*,?\s*$/im, /Best regards/i, /Sent from my/i];
/** Bỏ phần trích thư cũ ("> …", "On … wrote:", "Vào … đã viết:", khối "Từ: … <mail>") và chữ ký — chỉ giữ câu người đó mới viết. */
function catTrich(s) {
  let v = String(s || '').replace(/\r/g, '');
  /* thư dồn một dòng: cắt ngay chỗ bắt đầu khối trích "Từ: … <x@y>" / "From: …" / "On … wrote:" */
  const moc = [/\b(Từ|From)\s*:\s*[^\n]{0,80}?<[^>\s]+@[^>\s]+>/i, /\bOn\b[^\n]{0,120}\bwrote:/i, /\bVào\b[^\n]{0,120}\b(đã )?viết:/i, /-{2,}\s*Original/i, ...CHU_KY_CUA];
  for (const r of moc) { const m = r.exec(v); if (m && m.index > 0) v = v.slice(0, m.index); }
  const dong = v.split('\n');
  const out = [];
  for (const d of dong) {
    if (/^\s*>/.test(d)) break;
    if (/^\s*(On .+wrote:|Vào .+(đã )?viết:|-{2,}\s*Original|From:\s|Từ:\s)/i.test(d)) break;
    out.push(d);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 500);
}

/** Thư trả lời mới nhất trong luồng (người gửi khác thư đầu tiên). */
async function traLoiMoiNhat(threadId) {
  const d = await cli(['mail', '+thread', '--as', 'user', '--thread-id', threadId, '--html=false', '--format', 'json']);
  const ds = (d.messages || []).slice().sort((a, b) => luc(a) - luc(b));
  if (ds.length < 2) return null;
  const toi = diaChi(ds[0]);
  const tl = ds.filter((x) => diaChi(x) && diaChi(x) !== toi).pop();
  if (!tl) return null;
  return { luc: luc(tl), tu: diaChi(tl), noiDung: catTrich(tl.body_plain_text || tl.body_preview || '') || '(thư trả lời không có chữ)' };
}

async function timLuong(ht, loai) {
  const id = loai === 'bgd' ? ht.thuBgd : ht.thuKol;
  if (id) return id;
  const td = loai === 'bgd' ? ht.tdBgd : ht.tdKol;
  if (!td) return '';
  /* +triage nhận tối đa 50 ký tự — lấy đoạn có tên KOL ở cuối tiêu đề cho dễ trúng. */
  const q = td.length > 50 ? td.slice(-50) : td;
  const d = await cli(['mail', '+triage', '--as', 'user', '--query', q, '--max', '10', '--format', 'json']);
  return timThread(d, td.slice(-40))[0] || timThread(d)[0] || '';
}

function dichLoi(e) {
  const s = String((e && e.message) || e);
  if (/missing_scope|missing required scope/i.test(s)) {
    return 'Chưa có quyền đọc hộp thư. Chạy: lark-cli auth login --scope "mail:user_mailbox.message:readonly mail:user_mailbox.message.address:read mail:user_mailbox.message.subject:read mail:user_mailbox.message.body:read"';
  }
  return s.slice(0, 300);
}

/**
 * Một vòng kiểm. `bao(text)` là hàm gửi tin cho anh (nhac.guiTin) — truyền vào để
 * file này không phải biết kênh gửi.
 */
/* ---- Hub (chế độ api): đọc Hộp thư đến bằng phiên "Kết nối hộp thư" (ho-thu.js) ----
 * Thư trả lời = thư CÙNG LUỒNG với thư đã gửi (thread_id lưu lúc gửi), hoặc cùng tiêu đề (bỏ "Re:"),
 * người gửi khác hộp thư của mình, tới SAU lúc gửi. */
const boRe = (s) => String(s || '').replace(/^\s*((re|fw|fwd|tr|trả lời|chuyển tiếp)\s*:\s*)+/i, '').trim().toLowerCase();
async function traLoiApi(ht, loai, hopThu) {
  const luong = loai === 'bgd' ? ht.thuBgd : ht.thuKol;
  const td = boRe(loai === 'bgd' ? ht.tdBgd : ht.tdKol);
  const guiLuc = (loai === 'bgd' ? ht.trinhLuc : ht.thuMoiLuc) || 0;
  const minh = String(cfg.mail.from || 'cmo@rootytrip.com').toLowerCase();
  const khop = hopThu.filter((m) => m.tu && m.tu !== minh && m.luc > guiLuc - 60000 &&
    ((luong && m.luong === luong) || (td && boRe(m.tieuDe) === td)));
  const tl = khop[0];
  return tl ? { luc: tl.luc, tu: tl.tu, noiDung: catTrich(tl.noiDung) || '(thư trả lời không có chữ)' } : null;
}

async function kiem(bao, now = Date.now()) {
  let hopThu = null;
  if (cfg.mode !== 'cli') {
    const H = require('./ho-thu');
    const p = await H.napPhien().catch(() => null);
    if (!p) { trangThai.loi = 'Chưa kết nối hộp thư — kết nối trong khung email để app đọc được thư trả lời'; return []; }
  }
  trangThai.lanCuoi = now;
  const dl = await kho.tatCa({ moi: true });
  const kolTen = new Map(dl.kol.map((k) => [k.id, k.ten]));
  const moi = [];
  try {
    for (const ht of dl.hopTac) {
      for (const [loai, buoc, tl, tlLuc] of [['bgd', 'Chờ BGĐ duyệt', 'bgdTraLoi', 'bgdTraLoiLuc'], ['kol', 'Đã mời KOL', 'kolTraLoi', 'kolTraLoiLuc']]) {
        if (ht.buoc !== buoc) continue;
        let r, o = {};
        if (cfg.mode !== 'cli') {
          if (!hopThu) hopThu = await require('./ho-thu').thuDen();
          r = await traLoiApi(ht, loai, hopThu);
        } else {
          const luong = await timLuong(ht, loai);
          if (!luong) continue;
          r = await traLoiMoiNhat(luong);
          const cot = loai === 'bgd' ? 'thuBgd' : 'thuKol';
          if (!ht[cot]) o = { [cot]: luong };
        }
        /* thư mới, hoặc cùng thư nhưng lần trước cắt sai (nội dung đã lưu khác) → xử lý lại */
        if (r && (r.luc > (ht[tlLuc] || 0) || (r.luc === ht[tlLuc] && r.noiDung !== ht[tl]))) {
          o[tl] = r.noiDung; o[tlLuc] = r.luc;
          moi.push({ ht, loai, ...r });
          const ai = loai === 'bgd' ? 'BGĐ' : 'KOL ' + (kolTen.get(ht.kol) || '');
          /* anh Hùng 24/09: BGĐ trả lời "duyệt / đồng ý" (không kèm ý sửa) → tự chuyển "BGĐ đã duyệt".
           * Thư có ý sửa hoặc không rõ → giữ nguyên bước, hiện câu trả lời để anh tự bấm. */
          const tuDuyet = loai === 'bgd' && !ht.khongTuChuyen && T.yDuyet(r.noiDung) === 'duyet';
          /* KOL trả lời có ý xác nhận (không hỏi thêm, không xin đổi) → tự chuyển "KOL đã xác nhận" */
          const tuXacNhan = loai === 'kol' && !ht.khongTuChuyen && T.yXacNhan(r.noiDung) === 'xacNhan';
          if (tuXacNhan) {
            Object.assign(o, { buoc: 'KOL đã xác nhận', xacNhanLuc: r.luc,
              lichSu: T.noiLichSu(ht.lichSu, T.dongLichSu(ht.buoc, 'KOL đã xác nhận', 'tự chuyển: KOL trả lời "' + r.noiDung.slice(0, 40) + '"', now)) });
          }
          if (tuDuyet) {
            Object.assign(o, { buoc: 'BGĐ đã duyệt', duyetLuc: r.luc, kenhDuyet: 'Email', nguoiDuyet: r.tu, yKien: r.noiDung.slice(0, 300),
              lichSu: T.noiLichSu(ht.lichSu, T.dongLichSu(ht.buoc, 'BGĐ đã duyệt', 'tự chuyển: BGĐ trả lời "' + r.noiDung.slice(0, 40) + '"', now)) });
          }
          if (bao) {
            await bao('Email trả lời · ' + ai + ' (' + ht.ma + ' · ' + (kolTen.get(ht.kol) || '') + ')\n\n"' + r.noiDung.slice(0, 300) + '"\n\n'
              + (tuXacNhan ? 'App đã tự chuyển sang "KOL đã xác nhận" — việc tiếp theo: tạo tour trên Tourwell, điền mã RT. Nhầm thì bấm Lùi bước.'
                : tuDuyet ? 'App đã tự chuyển sang "BGĐ đã duyệt" — việc tiếp theo: soạn thư mời KOL. Nhầm thì bấm Lùi bước.'
                : 'Mở app KOL bấm ' + (loai === 'bgd' ? '"BGĐ đã duyệt" hoặc "BGĐ yêu cầu sửa"' : '"KOL đã xác nhận"') + '.'), 'kol-tl-' + ht.id + '-' + r.luc);
          }
          trangThai.daBao++;
        }
        if (Object.keys(o).length) await kho.sua('hopTac', ht.id, o);
      }
    }
    trangThai.loi = '';
  } catch (e) {
    trangThai.loi = dichLoi(e);
  }
  return moi;
}

let hen = null;
function batDau(bao) {
  if (hen || process.env.KOL_THEO_DOI_TAT === '1') return;   // Hub: kiem() tự bỏ qua khi chưa kết nối hộp thư
  setTimeout(() => kiem(bao).catch(() => {}), 30000);
  hen = setInterval(() => kiem(bao).catch(() => {}), CHU_KY);
  hen.unref();
}

module.exports = { kiem, batDau, trangThai, catTrich, timThread, CHU_KY, _traLoiApi: traLoiApi };
