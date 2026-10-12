(() => {
  'use strict';

  // =====================================================================
  // keyhuay888: หน้า "ส่งโพย" -> ปุ่มคัดลอกภาพ รวม 3 ส่วนเป็นภาพเดียว
  //   1) ส่วนหัว (ชื่อตลาด/งวด/เวลา)  2) ส่วนที่ 4 ตารางเลขที่ซื้อ  3) ส่วนที่ 5 บันทึกช่วยจำ
  // =====================================================================
  const LOG = '[KeyHuay คัดลอกภาพโพย]';
  const ROOT_ID = 'ext-bill-img-root';
  const LABEL = '📋 คัดลอกภาพโพย';

  // ----- ตัวเลือกส่วนที่จะแคป (เรียงจากบนลงล่าง) -----
  const HEADER_SELS = ['.card-section-header', '[data-member-mobile-betting-market-header]'];
  const TABLE_SEL = '[data-third-purchase-table]';
  const MEMO_SEL = '[data-third-memo-submit-row]';

  // ----- ปุ่ม/ตัวควบคุมที่ "ไม่เอา" ลงภาพ (ปรับเพิ่ม/ลดได้) ปุ่ม ส่งโพย จะแสดงในภาพเหมือนหน้าเว็บ -----
  const HIDE_SEL = [
    '[data-third-edit-purchase-prices]',     // ปุ่ม แก้ไขราคา
    '[data-third-remove-purchase]',          // ปุ่ม ถังขยะ
    '[data-third-quick-remaining-setting]',  // สวิตช์ แสดงยอดคงเหลือ
    '[data-ext-hide]',                       // กรอบรูปที่โหลดไม่ได้ (ตั้งชั่วคราวตอนแคป)
    '#' + ROOT_ID,
  ].join(',');

  const GAP = 14;      // ระยะห่างระหว่างส่วน (px)
  const PAD = 16;      // ขอบรอบภาพ (px)
  const FONT = "'Noto Sans Thai', 'Prompt', 'Sarabun', sans-serif";

  const h2c = () => window.html2canvasPro || window.html2canvas;
  const h2i = () => window.htmlToImage; // เอนจินหลัก: ให้เบราว์เซอร์วาดเอง (ตรงกับหน้าเว็บมากกว่า)
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const pickHeader = () => {
    for (const sel of HEADER_SELS) {
      const el = Array.from(document.querySelectorAll(sel)).find(visible);
      if (el) return el;
    }
    return null;
  };
  const onBillPage = () => !!document.querySelector(TABLE_SEL);

  // สีพื้นหลังจริง ณ ตำแหน่งนั้น: ซ้อนสีพื้น (รวมที่โปร่งแสง) ของ parent ทุกชั้นเข้าด้วยกัน
  const _px = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function parseColor(c) {
    _px.canvas.width = _px.canvas.height = 1;
    _px.clearRect(0, 0, 1, 1);
    _px.fillStyle = '#000';
    _px.fillStyle = c;
    _px.fillRect(0, 0, 1, 1);
    const d = _px.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  function pageBg(el) {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let [r, g, b] = [11, 16, 23]; // ฐานสำรอง
    for (let i = layers.length - 1; i >= 0; i--) {
      const [lr, lg, lb, la] = layers[i];
      r = lr * la + r * (1 - la); g = lg * la + g * (1 - la); b = lb * la + b * (1 - la);
    }
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }

  // ---------- UI ----------
  const css = (el, styles) => {
    el.style.cssText = Object.entries(styles).map(([k, v]) => `${k}: ${v} !important`).join('; ');
    return el;
  };

  let toastTimer = null;
  function toast(msg, kind, sticky) {
    let t = document.getElementById('ext-bill-toast');
    if (!t) {
      t = css(document.createElement('div'), {
        position: 'fixed', left: '50%', bottom: '110px', transform: 'translateX(-50%)', 'z-index': '2147483647',
        padding: '12px 22px', 'border-radius': '12px', color: '#fff', 'font-family': FONT,
        'font-size': '15px', 'box-shadow': '0 4px 14px rgba(0,0,0,.4)', 'max-width': '90vw', 'text-align': 'center',
      });
      t.id = 'ext-bill-toast';
      document.body.appendChild(t);
    }
    t.style.setProperty('background', kind === 'warn' ? '#dc3545' : kind === 'busy' ? '#0d6efd' : '#198754', 'important');
    t.style.setProperty('display', 'block', 'important');
    t.textContent = msg;
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => t.style.setProperty('display', 'none', 'important'), 3200);
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ดึงรูปข้ามโดเมนเป็น data URL โดยเลี่ยงข้อจำกัด CORS
  //  - Tampermonkey: GM_xmlhttpRequest   - Extension: ให้ background.js ดึงให้   - อื่นๆ: fetch ปกติ
  const blobToDataUrl = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });

  async function loadImageData(src) {
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((res, rej) => {
        GM_xmlhttpRequest({
          method: 'GET', url: src, responseType: 'blob', timeout: 15000,
          onload: (r) => (r.response ? blobToDataUrl(r.response).then(res, rej) : rej(new Error('empty'))),
          onerror: rej, ontimeout: rej,
        });
      });
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const r = await chrome.runtime.sendMessage({ type: 'ext-fetch-image', url: src });
        if (r && r.ok) return r.data;
      } catch (e) { /* ใช้ fetch ปกติต่อ */ }
    }
    const r = await fetch(src, { mode: 'cors', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return blobToDataUrl(await r.blob());
  }

  // เตรียมรูป (ธงชาติ) เป็น data URL ล่วงหน้า ถ้าโหลดแบบ CORS ไม่ได้ จะซ่อนกรอบรูปในภาพ แทนที่จะเป็นกรอบว่าง
  async function prepImages(parts) {
    const map = new Map(); // src -> dataURL | null
    const imgs = parts.flatMap((p) => Array.from(p.querySelectorAll('img')));
    await Promise.all(imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || map.has(src)) return;
      map.set(src, null);
      if (src.startsWith('data:')) { map.set(src, src); return; }
      try { map.set(src, await loadImageData(src)); }
      catch (e) { console.warn(LOG, 'โหลดรูปไม่ได้ (CORS):', src); }
    }));
    return map;
  }

  // ปรับสำเนาหน้าเว็บก่อนแคป: เอฟเฟกต์กระจก/ไล่สี/ฟิลเตอร์ของเว็บ วาดเป็นลายตารางหมากรุก จึงปิดเฉพาะในภาพ
  function fixClone(doc, imgMap) {
    const st = doc.createElement('style');
    st.textContent = `
      *, *::before, *::after {
        background-image: none !important;
        backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
        filter: none !important; mask: none !important; -webkit-mask: none !important;
        mix-blend-mode: normal !important;
      }
    `;
    doc.head.appendChild(st);
    doc.querySelectorAll('img').forEach((img) => {
      const key = img.getAttribute('data-ext-src') || img.currentSrc || img.src;
      const data = imgMap.get(key) || imgMap.get(img.src);
      if (data) { img.removeAttribute('srcset'); img.src = data; }
      else if (imgMap.has(key) || imgMap.has(img.src)) {
        const box = img.closest('span') || img;
        box.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // html-to-image: สลับรูปบนหน้าจริงเป็น data URL ชั่วคราว (กันติด CORS) แล้วคืนค่าเดิมหลังแคป
  async function applyImages(parts, map) {
    const undo = [];
    const imgs = parts.flatMap((p) => Array.from(p.querySelectorAll('img')));
    await Promise.all(imgs.map(async (img) => {
      const key = img.currentSrc || img.src;
      if (!map.has(key)) return;
      const data = map.get(key);
      if (data) {
        const o = { img, src: img.getAttribute('src'), srcset: img.getAttribute('srcset') };
        img.removeAttribute('srcset');
        img.src = data;
        undo.push(() => { img.setAttribute('src', o.src); if (o.srcset) img.setAttribute('srcset', o.srcset); });
        try { await img.decode(); } catch (e) { /* ignore */ }
      } else {
        const box = img.closest('span') || img;
        box.setAttribute('data-ext-hide', '');
        undo.push(() => box.removeAttribute('data-ext-hide'));
      }
    }));
    return () => undo.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
  }

  // ---------- แคปทีละส่วน แล้วต่อเป็นภาพเดียว ----------
  async function buildImage(parts) {
    const lib = h2c();
    const i2 = h2i();
    if (!i2 && !lib) throw new Error('ไม่พบไลบรารีแคปภาพ (html-to-image / html2canvas-pro)');
    const scale = Math.max(2, window.devicePixelRatio || 1);
    const bg = pageBg(document.querySelector(TABLE_SEL) || parts[0]);
    const imgMap = await prepImages(parts);
    const restore = i2 ? await applyImages(parts, imgMap) : () => {};
    const shots = [];
    try {
      for (const el of parts) {
        if (i2) {
          shots.push(await i2.toCanvas(el, {
            pixelRatio: scale,
            backgroundColor: bg,
            style: { whiteSpace: 'nowrap' }, // กันข้อความขึ้นบรรทัดใหม่/ถูกตัด เมื่อฟอนต์ในภาพกว้างกว่าหน้าเว็บเล็กน้อย
            filter: (n) => !(n.matches && n.matches(HIDE_SEL)),
          }));
        } else {
          shots.push(await lib(el, {
            backgroundColor: bg,
            scale,
            useCORS: true,
            logging: false,
            ignoreElements: (n) => n.matches && n.matches(HIDE_SEL),
            onclone: (doc) => fixClone(doc, imgMap),
          }));
        }
      }
    } finally { restore(); }
    const pad = PAD * scale, gap = GAP * scale;
    const W = Math.max(...shots.map((c) => c.width)) + pad * 2;
    const H = shots.reduce((a, c) => a + c.height, 0) + gap * (shots.length - 1) + pad * 2;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    let y = pad;
    shots.forEach((c) => {
      ctx.drawImage(c, Math.round((W - c.width) / 2), y);
      y += c.height + gap;
    });
    return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  }

  let busy = false;
  async function onClick(btn) {
    if (busy) return;
    if (!onBillPage()) return toast('⚠️ ไม่พบหน้าส่งโพย กรุณาเปิดหน้าแทงหวยก่อนกดปุ่มนี้', 'warn');
    if (!document.querySelector('[data-third-purchase-number]')) {
      return toast('⚠️ ยังไม่มีเลขในตาราง กรุณาเพิ่มบิลก่อนคัดลอกภาพ', 'warn');
    }
    const parts = [pickHeader(), document.querySelector(TABLE_SEL), document.querySelector(MEMO_SEL)].filter(Boolean);
    busy = true;
    btn.textContent = '⏳ กำลังสร้างภาพ...';
    const blobPromise = buildImage(parts);
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      toast('✅ คัดลอกภาพแล้ว กด Ctrl+V เพื่อวางได้เลย', 'ok');
    } catch (err) {
      console.error(LOG, err);
      try { downloadBlob(await blobPromise); toast('💾 คัดลอกไม่ได้ จึงบันทึกเป็นไฟล์แทน', 'ok'); }
      catch (e2) { console.error(LOG, e2); toast('❌ สร้างภาพไม่สำเร็จ (ดูรายละเอียดใน Console)', 'warn'); }
    }
    btn.textContent = LABEL;
    busy = false;
  }

  const floatStyle = {
    position: 'fixed', right: '24px', bottom: '24px', 'z-index': '2147483646',
    background: '#0d6efd', color: '#fff', border: 'none', 'border-radius': '999px', padding: '16px 26px',
    'font-family': FONT, 'font-size': '18px', 'font-weight': '700', cursor: 'pointer',
    'box-shadow': '0 4px 14px rgba(0,0,0,.45)',
  };

  // ปุ่ม "คัดลอกภาพ" วางไว้ใต้ปุ่ม "ส่งโพย" (หน้าตาเหมือนปุ่มของเว็บ แบบ outline) ถ้าหาปุ่มส่งโพยไม่เจอ จะลอยมุมขวาล่างแทน
  function mount() {
    if (!document.body) return;
    const row = document.querySelector(MEMO_SEL);
    const submit = row && row.querySelector('[data-third-submit-slip]');
    let el = document.getElementById(ROOT_ID);
    if (el) {
      const docked = el.dataset.docked === '1';
      if (docked && row && el.previousElementSibling === row) return; // ตำแหน่งถูกต้องอยู่แล้ว
      if (!docked && !submit) return;
      el.remove();
    }

    let btn;
    if (submit) {
      const wrap = document.createElement('div');
      wrap.id = ROOT_ID;
      wrap.dataset.docked = '1';
      wrap.className = 'grid gap-3 sm:grid-cols-2';
      wrap.style.setProperty('margin-top', '10px', 'important');
      const spacer = document.createElement('div');
      spacer.className = 'hidden sm:block';
      btn = submit.cloneNode(true);
      ['id', 'data-third-submit-slip', 'disabled', 'aria-disabled', 'form'].forEach((a) => btn.removeAttribute(a));
      btn.setAttribute('data-variant', 'outline');
      btn.type = 'button';
      btn.textContent = LABEL;
      wrap.append(spacer, btn);
      row.after(wrap);
    } else {
      btn = css(document.createElement('button'), floatStyle);
      btn.id = ROOT_ID;
      btn.type = 'button';
      btn.textContent = LABEL;
      document.body.appendChild(btn);
    }
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(btn); });
    console.log(LOG, 'แสดงปุ่มแล้ว', submit ? '(ใต้ปุ่มส่งโพย)' : '(ลอยมุมขวาล่าง)');
  }

  // หน้าเป็น SPA: ถ้าปุ่มหาย/ตำแหน่งเพี้ยน ให้สร้างกลับมา
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  mount();
  console.log(LOG, 'โหลดแล้ว');
})();
