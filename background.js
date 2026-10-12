// ดึงรูป (เช่น ธงชาติ) ที่เซิร์ฟเวอร์ไม่เปิด CORS ให้ content.js: ส่งกลับเป็น data URL
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'ext-fetch-image') return;
  (async () => {
    try {
      const r = await fetch(msg.url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const type = r.headers.get('content-type') || 'image/png';
      const bytes = new Uint8Array(await r.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      sendResponse({ ok: true, data: `data:${type};base64,${btoa(bin)}` });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // ตอบแบบ async
});
