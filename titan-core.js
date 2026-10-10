(() => {
  'use strict';

  // =====================================================================
  // Titan: เก็บ "เลขปิดรับ" ที่ระบบตัดออกจากโพยอัตโนมัติ แล้วแสดงใต้ช่อง Note ใน Modal ยืนยันการส่งโพย
  // เว็บแจ้งเลขปิดเป็นข้อความชั่วคราว (~7 วินาที) "ขออภัย ระบบปิดรับเลข <ประเภท> : <เลข> ที่ท่านเลือก !"
  // สคริปต์ดักข้อความนี้ไว้ทันทีที่เกิดขึ้น เพื่อไม่ให้หายไปก่อนที่ผู้ใช้จะแคปทัน
  // =====================================================================
  const LOG = '[Titan เลขปิด]';
  const BOX_CLASS = 'ext-closed-box';
  const BTN_CLASS = 'ext-closed-btn';
  const MODAL_SEL = '#billDetail';
  const MSG_RE = /ปิดรับเลข\s*(.+?)\s*:\s*([0-9]+)\s*ที่ท่านเลือก/;
  const FONT = "'Prompt', 'Sarabun', sans-serif";
  const WINDOW_MS = 4000; // ข้อความแจ้งต้องเกิดใกล้เวลาเปิด Modal ไม่เกินช่วงนี้ จึงนับว่าเป็นรอบเดียวกัน

  const strip = (s) => (s || '').replace(/[\s ​-‍﻿]+/g, ' ').trim();

  // ---------- เก็บข้อมูล ----------
  let batch = []; // [{type, number}] ของรอบล่าสุด
  let lastToastAt = 0;
  let snapshot = []; // รายการที่ผูกกับการเปิด Modal รอบนี้
  let modalWasVisible = false;
  let modalOpenedAt = 0;

  function addClosed(type, number) {
    const now = Date.now();
    if (now - lastToastAt > WINDOW_MS) batch = []; // เริ่มรอบใหม่
    lastToastAt = now;
    if (!batch.some((b) => b.type === type && b.number === number)) batch.push({ type, number });
    if (modalWasVisible && now - modalOpenedAt < WINDOW_MS) {
      snapshot = batch.slice(); // ข้อความมาช้ากว่า Modal เล็กน้อย
    }
  }

  function scanToast(node) {
    if (!node || node.nodeType !== 1) return;
    const list = node.matches && node.matches('.notic') ? [node] : Array.from(node.querySelectorAll ? node.querySelectorAll('.notic') : []);
    list.forEach((el) => {
      if (el.dataset.extSeen) return;
      const m = strip(el.textContent).match(MSG_RE);
      if (!m) return;
      el.dataset.extSeen = '1';
      addClosed(strip(m[1]), m[2]);
    });
  }

  // ---------- Modal ----------
  const getModal = () => {
    const m = document.querySelector(MODAL_SEL);
    if (!m) return null;
    const shown = getComputedStyle(m).display !== 'none' && (m.classList.contains('in') || m.classList.contains('show'));
    return shown ? m : null;
  };

  const groupByType = (items) => {
    const g = new Map();
    items.forEach((it) => {
      if (!g.has(it.type)) g.set(it.type, []);
      g.get(it.type).push(it.number);
    });
    return Array.from(g, ([type, numbers]) => ({ type, numbers }));
  };

  // ---------- UI ----------
  const css = (el, styles) => {
    el.style.cssText = Object.entries(styles).map(([k, v]) => `${k}: ${v} !important`).join('; ');
    return el;
  };

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `closed-number-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function mkBtn(label, bg) {
    const b = css(document.createElement('button'), {
      background: bg, color: '#fff', border: 'none', 'border-radius': '8px', padding: '8px 16px',
      'font-family': FONT, 'font-size': '14px', 'font-weight': '600', cursor: 'pointer',
    });
    b.type = 'button';
    b.className = BTN_CLASS;
    b.dataset.label = label;
    b.textContent = label;
    return b;
  }

  async function copyImageBtn(btn, box) {
    const label = btn.dataset.label;
    const reset = () => setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2500);
    if (typeof html2canvas === 'undefined') { btn.textContent = '❌ โหลดไลบรารีแคปภาพไม่สำเร็จ'; return reset(); }
    btn.disabled = true;
    btn.textContent = '⏳ กำลังสร้างภาพ...';
    const blobPromise = html2canvas(box, {
      backgroundColor: '#ffffff',
      scale: Math.max(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
      ignoreElements: (el) => el.classList && el.classList.contains(BTN_CLASS),
    }).then((canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png')));
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      btn.textContent = '✅ คัดลอกภาพแล้ว กด Ctrl+V ได้เลย';
    } catch (err) {
      console.error(LOG, err);
      try { downloadBlob(await blobPromise); btn.textContent = '💾 บันทึกเป็นไฟล์แทน'; }
      catch (e2) { console.error(LOG, e2); btn.textContent = '❌ สร้างภาพไม่สำเร็จ'; }
    }
    reset();
  }

  function buildBox(groups) {
    const box = css(document.createElement('div'), {
      background: '#ffffff', border: '2px solid #dc3545', 'border-radius': '10px', padding: '12px 14px',
      margin: '8px 0 12px', 'font-family': FONT, color: '#212529', 'text-align': 'center',
    });
    box.className = BOX_CLASS;

    const total = groups.reduce((a, g) => a + g.numbers.length, 0);
    const title = css(document.createElement('div'), { 'font-size': '15px', 'font-weight': '600', 'margin-bottom': '6px' });
    title.textContent = `⚠️ เลขปิดรับที่ระบบตัดออก (${total} รายการ)`;
    box.appendChild(title);

    groups.forEach((g) => {
      const label = css(document.createElement('div'), { 'font-size': '14px', 'margin-top': '8px', 'margin-bottom': '4px' });
      label.textContent = g.type;
      const row = css(document.createElement('div'), {
        display: 'flex', 'flex-wrap': 'wrap', 'justify-content': 'center', gap: '8px',
      });
      g.numbers.forEach((n) => {
        const chip = css(document.createElement('span'), {
          display: 'inline-block', background: '#dc3545', color: '#fff', 'font-size': '15px', 'font-weight': '600',
          'line-height': '1.2', padding: '7px 14px', 'border-radius': '6px', 'min-width': '48px',
        });
        chip.textContent = n;
        row.appendChild(chip);
      });
      box.append(label, row);
    });

    const actions = css(document.createElement('div'), {
      display: 'flex', 'justify-content': 'center', gap: '10px', 'margin-top': '12px',
    });
    const bImg = mkBtn('🖼️ คัดลอกภาพ', '#0d6efd');
    bImg.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); copyImageBtn(bImg, box); });
    actions.append(bImg);
    box.appendChild(actions);
    return box;
  }

  // ---------- วาง/อัปเดตกล่องใต้ช่อง Note ----------
  function render() {
    const modal = getModal();

    // ตรวจจับจังหวะเปิด/ปิด Modal
    if (modal && !modalWasVisible) {
      modalWasVisible = true;
      modalOpenedAt = Date.now();
      snapshot = Date.now() - lastToastAt < WINDOW_MS ? batch.slice() : [];
    } else if (!modal && modalWasVisible) {
      modalWasVisible = false;
      snapshot = [];
    }

    const existing = document.querySelector('.' + BOX_CLASS);
    if (!modal || !snapshot.length) { if (existing) existing.remove(); return; }

    const groups = groupByType(snapshot);
    const sig = JSON.stringify(groups);
    if (existing && existing.dataset.sig === sig && modal.contains(existing)) return;
    if (existing) existing.remove();

    const note = modal.querySelector('#note');
    const anchor = note ? note.closest('.form-group') || note : modal.querySelector('.modal-body');
    if (!anchor || !anchor.parentNode) return;
    const box = buildBox(groups);
    box.dataset.sig = sig;
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
    console.log(LOG, 'แสดงเลขปิดรับใต้ช่อง Note แล้ว', groups);
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; try { render(); } catch (e) { console.error(LOG, e); } });
  };

  new MutationObserver((muts) => {
    let relevant = false;
    for (const m of muts) {
      m.addedNodes.forEach((n) => scanToast(n)); // ดักข้อความแจ้งเลขปิดทันทีที่โผล่
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!(t && t.closest && t.closest('.' + BOX_CLASS))) relevant = true;
    }
    if (relevant) schedule();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

  document.querySelectorAll('.notic').forEach(scanToast);
  console.log(LOG, 'โหลดแล้ว');
  schedule();
})();

// =====================================================================
// ฟีเจอร์เพิ่ม: ปุ่ม "สรุปยอด" (ลอยมุมขวาล่าง) -> เลือกหวย -> คัดลอก @ชื่อ ++ยอดถูก
// =====================================================================
(() => {
  'use strict';

  const LOG = '[Titan สรุปยอดถูก]';
  const ROOT_ID = 'ext-win-fab-root';
  const strip = (s) => (s || '').replace(/[\s ​-‍﻿]+/g, ' ').trim();
  const toNum = (s) => parseFloat(String(s || '').replace(/,/g, '').replace(/[^\d.\-]/g, '')) || 0;
  const fmt = (n) => String(Math.round(n * 100) / 100);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- ดึงผู้ถูกจากตาราง #db_table (หน้ารายงาน) ----------
  // แถวผู้ถูก = คอลัมน์ "ถูกรางวัล" > 0 ; แยกกลุ่มตามคอลัมน์ "หวย" ; ชื่ออยู่ในคอลัมน์ "note"
  // ชื่อเดียวกันในหวยเดียวกันรวมยอดเป็นบรรทัดเดียว ; แถวไม่มีชื่อ ยังนับยอด แต่แยกบรรทัด (ชื่อว่าง)
  const getTable = () => document.getElementById('db_table');
  const headersOf = (t) => Array.from(t.querySelectorAll('thead th')).map((th) => strip(th.textContent));

  function hasReportTable() {
    const t = getTable();
    if (!t) return false;
    const h = headersOf(t);
    return h.includes('ถูกรางวัล') && h.includes('หวย');
  }

  async function extractWinners() {
    const table = getTable();
    const h = headersOf(table);
    const iWin = h.indexOf('ถูกรางวัล');
    const iLot = h.indexOf('หวย');
    const iNote = h.indexOf('note');
    const iStat = h.indexOf('สถานะ');

    const seen = new Set();
    const rows = [];
    const collect = () => {
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const c = tr.children;
        if (c.length <= iWin) return; // แถว "ไม่พบข้อมูล"
        const key = tr.id || strip(tr.textContent);
        if (seen.has(key)) return;
        seen.add(key);
        if (iStat >= 0 && /ยกเลิก/.test(c[iStat].textContent)) return;
        const win = toNum(c[iWin].textContent);
        if (win <= 0) return;
        rows.push({
          lot: strip(c[iLot].textContent) || 'ไม่ระบุหวย',
          name: iNote >= 0 && c[iNote] ? strip(c[iNote].textContent) : '',
          win,
        });
      });
    };

    // ไล่ทุกหน้าของ DataTables (ปกติ 500 โพย/หน้า)
    collect();
    for (let i = 0; i < 60; i++) {
      const next = document.querySelector('#db_table_next:not(.disabled) a');
      if (!next) break;
      next.click();
      await sleep(150);
      collect();
    }
    const first = document.querySelector('#db_table_paginate a[data-dt-idx="1"]');
    if (first && document.querySelector('#db_table_previous:not(.disabled)')) first.click();

    const lots = new Map();
    rows.forEach((r) => {
      if (!lots.has(r.lot)) lots.set(r.lot, { named: new Map(), blanks: [] });
      const g = lots.get(r.lot);
      let name = r.name;
      if (!name || name === '@') g.blanks.push(r.win);
      else {
        if (!name.startsWith('@')) name = '@' + name;
        g.named.set(name, (g.named.get(name) || 0) + r.win);
      }
    });

    return Array.from(lots, ([type, g]) => {
      const list = [
        ...Array.from(g.named, ([name, total]) => ({ name, total })),
        ...g.blanks.map((total) => ({ name: '', total })),
      ];
      return { type, list, sum: list.reduce((a, b) => a + b.total, 0) };
    });
  }

  const lineOf = (w) => `${w.name || '@'} ++${fmt(w.total)}`;
  const textOf = (g) => `รายการผู้ถูกรางวัล ${g.type}\n` + g.list.map(lineOf).join('\n');

  // ---------- UI ----------
  const css = (el, styles) => {
    el.style.cssText = Object.entries(styles).map(([k, v]) => `${k}: ${v} !important`).join('; ');
    return el;
  };
  const FONT = "'IBM Plex Sans Thai', 'Kanit', sans-serif";

  let toastTimer = null;
  function toast(msg, kind) {
    let t = document.getElementById('ext-win-toast');
    if (!t) {
      t = css(document.createElement('div'), {
        position: 'fixed', left: '50%', bottom: '140px', transform: 'translateX(-50%)', 'z-index': '2147483647',
        padding: '14px 24px', 'border-radius': '12px', color: '#fff', 'font-family': FONT,
        'font-size': '14px', 'box-shadow': '0 4px 14px rgba(0,0,0,.3)', 'max-width': '90vw', 'text-align': 'center',
      });
      t.id = 'ext-win-toast';
      document.body.appendChild(t);
    }
    t.style.setProperty('background', kind === 'warn' ? '#dc3545' : '#198754', 'important');
    t.style.setProperty('display', 'block', 'important');
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.style.setProperty('display', 'none', 'important'), 3200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e2) {
        console.error(LOG, e2);
        return false;
      }
    }
  }

  let root, fab, menu, open = false, busy = false;

  function setOpen(v) {
    open = v;
    menu.style.setProperty('display', v ? 'flex' : 'none', 'important');
    fab.textContent = v ? '✕' : 'สรุปยอด';
    fab.style.setProperty('font-size', v ? '34px' : '18px', 'important');
  }

  function renderMenu(groups) {
    menu.textContent = '';
    groups.forEach((g) => {
      const item = css(document.createElement('button'), {
        display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '20px',
        background: '#ffffff', color: '#212529', border: 'none', 'border-radius': '16px',
        padding: '14px 16px 14px 22px', 'font-family': FONT, 'font-size': '20px', 'font-weight': '600',
        cursor: 'pointer', 'box-shadow': '0 2px 10px rgba(0,0,0,.22)', 'white-space': 'nowrap',
      });
      item.type = 'button';

      const label = document.createElement('span');
      label.textContent = `${g.type} · ${g.list.length} คน · ${fmt(g.sum)}`;

      const icon = css(document.createElement('span'), {
        display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', width: '44px', height: '44px',
        'border-radius': '10px', background: '#198754', color: '#fff', 'font-size': '22px',
      });
      icon.textContent = '📋';

      item.append(label, icon);
      item.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await copyText(textOf(g));
        setOpen(false);
        toast(ok ? `✅ คัดลอก "${g.type}" แล้ว (${g.list.length} รายการ)` : '❌ คัดลอกไม่สำเร็จ', ok ? 'ok' : 'warn');
      });
      menu.appendChild(item);
    });
  }

  async function onFabClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (open) return setOpen(false);
    if (busy) return;

    if (!hasReportTable()) {
      return toast('⚠️ ไม่พบตารางรายการ กรุณาเปิดหน้ารายงาน แล้วกดค้นหาให้มีตารางก่อนกดปุ่มสรุปยอด', 'warn');
    }
    busy = true;
    let groups = [];
    try { groups = await extractWinners(); } catch (err) { console.error(LOG, err); }
    busy = false;
    if (!groups.length) return toast('⚠️ ไม่มียอดถูกรางวัลในหน้านี้', 'warn');
    renderMenu(groups);
    setOpen(true);
  }

  function mount() {
    if (document.getElementById(ROOT_ID) || !document.body) return;
    root = css(document.createElement('div'), {
      position: 'fixed', right: '28px', bottom: '28px', 'z-index': '2147483646',
      display: 'flex', 'flex-direction': 'column', 'align-items': 'flex-end', gap: '12px', 'font-family': FONT,
    });
    root.id = ROOT_ID;

    menu = css(document.createElement('div'), {
      display: 'none', 'flex-direction': 'column', 'align-items': 'flex-end', gap: '10px',
      'max-height': '60vh', 'overflow-y': 'auto', padding: '4px',
    });

    fab = css(document.createElement('button'), {
      width: '88px', height: '88px', 'border-radius': '50%', border: 'none', background: '#198754', color: '#fff',
      'font-family': FONT, 'font-size': '18px', 'font-weight': '700', cursor: 'pointer', 'line-height': '1.1',
      'box-shadow': '0 4px 14px rgba(0,0,0,.35)', padding: '0',
    });
    fab.type = 'button';
    fab.textContent = 'สรุปยอด';
    fab.addEventListener('click', onFabClick);

    root.append(menu, fab);
    document.body.appendChild(root);

    document.addEventListener('click', (e) => { if (open && !root.contains(e.target)) setOpen(false); }, true);
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') setOpen(false); });
    console.log(LOG, 'โหลดแล้ว');
  }

  new MutationObserver(() => { if (!document.getElementById(ROOT_ID)) mount(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
