'use strict';
/* Quét đệ quy thư mục Drive Marketing → du-lieu/cay.json (mỗi dòng một file/thư mục).
   Chạy: node quet-drive.js   (~30 phút cho 123 nghìn mục, danh tính user của lark-cli)
   Chỉ ĐỌC Drive, không ghi gì lên Lark. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GOC = process.env.KHO_FOLDER || 'ZlJ5f08Jzl1GVrdDV59l9M6PgAb';
/* Trên Windows gọi thẳng run.js bằng node: qua shell thì JSON trong --params bị vỡ dấu nháy. */
const CLI = process.env.LARK_CLI_JS ||
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js');

function list(token, pageToken) {
  const p = { folder_token: token, page_size: 200 };
  if (pageToken) p.page_token = pageToken;
  const s = execFileSync(process.execPath, [CLI, 'drive', 'files', 'list', '--params', JSON.stringify(p), '--format', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 50e6 });
  return JSON.parse(s);
}

const out = [];
const hang = [{ token: GOC, path: '', depth: 0 }];
const loi = [];
let goi = 0;
const t0 = Date.now();
while (hang.length) {
  const f = hang.shift();
  let pt = '';
  do {
    let r;
    try { goi++; r = list(f.token, pt); } catch (e) { loi.push(f.path); break; }
    if (!r.ok) { loi.push(f.path); break; }
    for (const x of r.data.files || []) {
      const p = f.path + '/' + x.name;
      out.push({ path: p, depth: f.depth + 1, type: x.type, token: x.token, url: x.url, mod: +x.modified_time });
      if (x.type === 'folder') hang.push({ token: x.token, path: p, depth: f.depth + 1 });
    }
    pt = r.data.has_more ? r.data.next_page_token : '';
  } while (pt);
  if (goi % 50 === 0) process.stderr.write(`${goi} lượt · ${out.length} mục · còn ${hang.length} thư mục\n`);
}
fs.mkdirSync(path.join(__dirname, 'du-lieu'), { recursive: true });
const dich = path.join(__dirname, 'du-lieu', 'cay.json');
fs.writeFileSync(dich + '.tmp', JSON.stringify(out));
fs.renameSync(dich + '.tmp', dich);
console.log(`Xong: ${out.length} mục, ${goi} lượt gọi, ${Math.round((Date.now() - t0) / 1000)}s` + (loi.length ? `, lỗi ${loi.length} thư mục` : ''));
