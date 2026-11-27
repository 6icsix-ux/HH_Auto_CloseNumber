// ==UserScript==
// @name         Eday - สรุปเลขปิด + คัดลอกภาพ
// @namespace    https://github.com/6icsix-ux/HH_Auto_CloseNumber
// @description  สรุปเลขปิดแยกตามประเภทท้ายตารางยืนยันรายการ พร้อมปุ่มคัดลอกภาพเฉพาะส่วนเลขปิด
// @author       6icsix-ux
// @match        https://edaylotto.com/*
// @match        https://*.edaylotto.com/*
// @run-at       document-idle
// @version      2.0.0
// @updateURL    https://raw.githubusercontent.com/6icsix-ux/HH_Auto_CloseNumber/main/eday-closed-number.user.js
// @downloadURL  https://raw.githubusercontent.com/6icsix-ux/HH_Auto_CloseNumber/main/eday-closed-number.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      workers.dev
// @connect      license-gate.phakin-dev.workers.dev
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js
// ==/UserScript==
// ตัวติดตั้งนี้ไม่มีโค้ดหลัก: ขอจากเซิร์ฟเวอร์ตรวจสิทธิ์ก่อนทุกครั้ง
(function () {
  'use strict';
  const WORKER = 'https://license-gate.phakin-dev.workers.dev';
  const SITE = 'eday';
  const TTL_OK = 10 * 60 * 1000;     // ใช้ผลที่แคชไว้ได้ 10 นาที ไม่ต้องถามทุกหน้า
  const TTL_BAD = 2 * 60 * 1000;     // ผลไม่ผ่านแคชสั้นกว่า จ่ายแล้วจะได้ใช้เร็ว
  const GRACE = 24 * 3600 * 1000;    // เซิร์ฟเวอร์ล่ม/เน็ตหลุด ใช้ผลเก่าที่ผ่านแล้วต่อได้ 24 ชม.

  function deviceId() {
    let id = GM_getValue('device_id', '');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)).toLowerCase();
      GM_setValue('device_id', id);
    }
    return id;
  }
  const ID = deviceId();

  function readCache() {
    try { return JSON.parse(GM_getValue('cache', 'null')); } catch (e) { return null; }
  }
  function writeCache(o) { try { GM_setValue('cache', JSON.stringify({ ...o, ts: Date.now() })); } catch (e) {} }

  function ask() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: WORKER + '/api/load',
        headers: { 'content-type': 'application/json' },
        data: JSON.stringify({ id: ID, site: SITE }),
        timeout: 10000,
        onload: (r) => {
          try { const j = JSON.parse(r.responseText); (r.status >= 500 ? reject : resolve)(j); } catch (e) { reject(e); }
        },
        onerror: (e) => reject(new Error('network: ' + ((e && (e.error || e.statusText)) || 'error'))),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  function run(code) {
    try {
      // ส่ง window/GM_xmlhttpRequest เข้าไปให้โค้ดหลักใช้ได้เหมือนตอนเป็น @require
      new Function('window', 'GM_xmlhttpRequest', 'html2canvas', code)(window, GM_xmlhttpRequest, window.html2canvas);
    } catch (e) {
      console.error('[license] run failed', e);
      showNotice({ message: 'โหลดโค้ดไม่สำเร็จ: ' + e.message, mode: 'banner' }, true);
    }
  }

  // ---------- แจ้งเตือน (Shadow DOM กัน CSS ของเว็บ) ----------
  function showNotice(info, soft) {
    const mount = () => {
      let host = document.getElementById('__lic_notice');
      if (host && document.documentElement.contains(host)) return;
      host = document.createElement('div');
      host.id = '__lic_notice';
      host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:0;top:0;right:0;' + (info.mode === 'modal' && !soft ? 'bottom:0;' : '');
      const root = host.attachShadow({ mode: 'closed' });
      const modal = info.mode === 'modal' && !soft;
      const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      root.innerHTML =
        '<style>*{box-sizing:border-box;font-family:system-ui,Tahoma,sans-serif}' +
        '.w{' + (modal ? 'position:absolute;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;' : '') + '}' +
        '.b{background:#b91c1c;color:#fff;padding:12px 16px;font-size:15px;line-height:1.5;' + (modal ? 'max-width:460px;border-radius:12px;box-shadow:0 10px 40px #0008;' : 'box-shadow:0 2px 8px #0006;') + '}' +
        '.b b{display:block;font-size:17px;margin-bottom:4px}' +
        'code{background:#0003;padding:2px 6px;border-radius:4px;font-size:12px;word-break:break-all}' +
        'button{margin:6px 6px 0 0;padding:6px 12px;border:0;border-radius:6px;cursor:pointer;font-size:13px}</style>' +
        '<div class="w"><div class="b"><b>⚠️ ' + (soft ? 'แจ้งเตือน' : 'ยังไม่สามารถใช้งานส่วนขยายได้') + '</b>' +
        esc(info.message) + (info.contact ? '<div>ติดต่อ: ' + esc(info.contact) + '</div>' : '') +
        (soft ? '' : '<div>รหัสเครื่อง: <code>' + ID + '</code></div><button id="cp">คัดลอกรหัสเครื่อง</button><button id="rt">ตรวจสอบสิทธิ์ใหม่</button>') +
        '</div></div>';
      const cp = root.getElementById('cp'), rt = root.getElementById('rt');
      if (cp) cp.onclick = () => { try { navigator.clipboard.writeText(ID); cp.textContent = 'คัดลอกแล้ว'; } catch (e) { prompt('รหัสเครื่อง', ID); } };
      if (rt) rt.onclick = () => { GM_setValue('cache', 'null'); location.reload(); };
      (document.body || document.documentElement).appendChild(host);
    };
    mount();
    setInterval(mount, 2500); // เว็บ SPA อาจล้างหน้า ต้องวางกลับ
  }

  async function main() {
    const c = readCache();
    const age = c ? Date.now() - c.ts : Infinity;
    if (c && age < (c.ok ? TTL_OK : TTL_BAD)) return c.ok ? run(c.code) : showNotice(c);
    try {
      const r = await ask();
      writeCache(r.ok ? { ok: true, code: r.code } : { ok: false, ...r });
      if (r.ok) run(r.code); else showNotice(r);
    } catch (e) {
      console.error('[license] ask failed:', e);
      if (c && c.ok && age < GRACE) return run(c.code);
      showNotice({ message: 'เชื่อมต่อเซิร์ฟเวอร์ตรวจสอบสิทธิ์ไม่ได้ (' + (e && e.message || e) + ') กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า', mode: 'banner' }, true);
    }
  }

  GM_registerMenuCommand('แสดงรหัสเครื่อง', () => prompt('รหัสเครื่อง (ส่งให้ผู้ให้บริการ)', ID));
  GM_registerMenuCommand('ตรวจสอบสิทธิ์ใหม่', () => { GM_setValue('cache', 'null'); location.reload(); });
  main();
})();
