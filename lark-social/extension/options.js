const $ = (id) => document.getElementById(id);

/* Danh sách tên hỏi từ máy chủ, không chép cứng ở đây: đổi người thì chỉ sửa
 * biến môi trường trên Render, không phải cài lại tiện ích cho từng máy. */
async function napTen(diaChi, khoa, dangChon) {
  const sel = $('toiLa');
  const giu = dangChon || sel.value;
  if (!diaChi || !khoa) return;
  try {
    const r = await fetch(diaChi.replace(/\/+$/, '') + '/nguoi-dang/nap', { headers: { 'x-nd-key': khoa } });
    const j = await r.json();
    if (!j || !Array.isArray(j.nguoi)) return;
    sel.innerHTML = '<option value="">— không phải người đăng (máy quản lý) —</option>'
      + j.nguoi.map((x) => '<option>' + x.replace(/[&<>"]/g, '') + '</option>').join('');
    sel.value = giu;
    $('baoTen').textContent = '';
  } catch (e) {
    $('baoTen').textContent = 'Chưa lấy được danh sách tên từ máy chủ — kiểm tra địa chỉ và khoá.';
  }
}

chrome.storage.sync.get(['diaChi', 'khoa', 'toiLa'], (c) => {
  $('diaChi').value = c.diaChi || 'https://mkt-hub-w6hi.onrender.com';
  $('khoa').value = c.khoa || '';
  $('toiLa').value = c.toiLa || '';
  napTen($('diaChi').value, $('khoa').value, c.toiLa || '');
});

$('taiTen').onclick = (e) => {
  e.preventDefault();
  napTen($('diaChi').value.trim(), $('khoa').value.trim());
};

$('luu').onclick = () => {
  chrome.storage.sync.set({
    diaChi: $('diaChi').value.trim(),
    khoa: $('khoa').value.trim(),
    toiLa: $('toiLa').value,
  }, () => {
    $('bao').textContent = 'Đã lưu.';
    setTimeout(() => { $('bao').textContent = ''; }, 2000);
  });
};
