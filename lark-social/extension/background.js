/* Gửi hộ content script, vì content script chạy ở origin facebook.com nên bị
 * chặn gọi sang máy chủ khác; service worker thì có host_permissions. */
chrome.runtime.onMessage.addListener((tin, _gui, traLoi) => {
  if (tin && tin.viec === 'gui') {
    chrome.storage.sync.get(['diaChi', 'khoa'], async (c) => {
      const diaChi = (c.diaChi || '').replace(/\/+$/, '');
      if (!diaChi || !c.khoa) {
        traLoi({ ok: false, loi: 'Chưa khai địa chỉ hoặc khoá — mở Tuỳ chọn của tiện ích' });
        return;
      }
      try {
        const r = await fetch(diaChi + '/nguoi-dang/nap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-nd-key': c.khoa },
          body: JSON.stringify({ items: tin.items }),
        });
        const j = await r.json().catch(() => ({}));
        traLoi(r.ok ? { ok: true, kq: j } : { ok: false, loi: (j && j.error) || ('HTTP ' + r.status) });
      } catch (e) {
        traLoi({ ok: false, loi: String(e.message || e) });
      }
    });
    return true;   // giữ kênh mở cho trả lời bất đồng bộ
  }
  return false;
});
