const $ = (id) => document.getElementById(id);
chrome.storage.sync.get(['diaChi', 'khoa'], (c) => {
  $('diaChi').value = c.diaChi || 'https://mkt-hub-w6hi.onrender.com';
  $('khoa').value = c.khoa || '';
});
$('luu').onclick = () => {
  chrome.storage.sync.set({ diaChi: $('diaChi').value.trim(), khoa: $('khoa').value.trim() }, () => {
    $('bao').textContent = 'Đã lưu.';
    setTimeout(() => { $('bao').textContent = ''; }, 2000);
  });
};
