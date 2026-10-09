// ==UserScript==
// @name         HHLott - สรุปเลขปิด
// @namespace    https://github.com/6icsix-ux/HH_Auto_CloseNumber
// @version      1.2.1
// @description  สรุปเลขปิดแยกตามประเภทใน Modal แจ้งเตือน + สรุปยอดถูกรางวัล (@ชื่อ ++ยอด) พร้อมปุ่มคัดลอกภาพ/ข้อความ
// @author       6icsix-ux
// @match        https://hhlott.live/*
// @match        https://*.hhlott.live/*
// @run-at       document-idle
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @updateURL    https://raw.githubusercontent.com/6icsix-ux/HH_Auto_CloseNumber/main/hhlott-closed-number.user.js
// @downloadURL  https://raw.githubusercontent.com/6icsix-ux/HH_Auto_CloseNumber/main/hhlott-closed-number.user.js
// ==/UserScript==

(() => {
  'use strict';

  const LOG = '[HHLott เลขปิด]';
  const CLOSED_WORD = 'เลขปิด';
  const BOX_CLASS = 'ext-closed-box';

  // ตัดช่องว่างทุกชนิด (รวม nbsp และ zero-width) เพื่อเทียบข้อความให้ทน
  const strip = (s) => (s || '').replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, '');
  const normalize = (s) => (s || '').replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, ' ').trim();

  const KEY = strip('ตรวจสอบเลขก่อนกดปุ่มยืนยัน');

  // ---------- 1) หา Modal แจ้งเตือน (ไม่พึ่ง class ใด ๆ) ----------
  function findCloseBtn(scope) {
    return Array.from(scope.querySelectorAll('button, .v-btn, a, [role="button"]')).find(
      (b) => strip(b.textContent) === 'ปิด'
    );
  }

  function findAlertModal() {
    // ลงลึกไปหา element ที่เล็กที่สุดที่ยังมีข้อความแจ้งเตือนครบ
    let node = document.body;
    for (;;) {
      let next = null;
      for (const child of node.children) {
        if (child.classList.contains(BOX_CLASS)) continue;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(child.tagName)) continue;
        if (strip(child.textContent).includes(KEY)) {
          next = child;
          break;
        }
      }
      if (!next) break;
      node = next;
    }
    if (node === document.body) return null;

    // ไต่ขึ้นไปจนเจอ container ที่มีปุ่ม "ปิด" = ตัว Modal
    let root = node;
    while (root && root !== document.body) {
      const btn = findCloseBtn(root);
      if (btn) return { root, closeBtn: btn };
      root = root.parentElement;
    }
    return {
      root: node.closest('.v-overlay__content, .v-card, .v-dialog') || node.parentElement || node,
      closeBtn: null,
    };
  }

  // ---------- 2) ดึงและจัดกลุ่มข้อมูลเลขปิด ----------
  function extractClosedNumbers() {
    const groups = {};
    let totalCount = 0;

    document.querySelectorAll('td.lotto-name').forEach((td) => {
      if (!td.querySelector('.cell-red')) return;

      const raw = normalize(td.textContent);
      if (!raw.includes(CLOSED_WORD)) return;

      const cleaned = normalize(raw.split(CLOSED_WORD).join(' '));
      const idx = cleaned.indexOf('@');
      if (idx < 0) return;

      const type = normalize(cleaned.slice(0, idx));
      const number = normalize(cleaned.slice(idx + 1));
      if (!type || !number) return;

      (groups[type] = groups[type] || []).push(number);
      totalCount++;
    });

    return { groups, totalCount };
  }

  // ---------- 3) สร้างกล่องสรุป (สไตล์: หัวข้อ + ป้ายประเภท + ชิปเลขสีแดง) ----------
  const css = (el, styles) => {
    el.style.cssText = Object.entries(styles)
      .map(([k, v]) => `${k}: ${v} !important`)
      .join('; ');
    return el;
  };

  // ---------- ปุ่มคัดลอกภาพหน้าต่าง (แคปเฉพาะ Modal) ----------
  const COPY_BTN_CLASS = 'ext-copy-btn';
  const COPY_LABEL = '📋 คัดลอกภาพหน้าต่างนี้';

  function getCaptureTarget() {
    const found = findAlertModal();
    if (!found) return null;
    return found.root.closest('.v-overlay__content') || found.root;
  }

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

  async function copyModalImage(btn) {
    const setLabel = (t) => { btn.textContent = t; };
    const reset = () => setTimeout(() => { setLabel(COPY_LABEL); btn.disabled = false; }, 2500);

    if (typeof html2canvas === 'undefined') {
      setLabel('❌ โหลดไลบรารีแคปภาพไม่สำเร็จ');
      return reset();
    }
    const target = getCaptureTarget();
    if (!target) return;

    btn.disabled = true;
    setLabel('⏳ กำลังสร้างภาพ...');

    // ส่ง Promise ให้ ClipboardItem เพื่อให้ยังนับเป็นการกดของผู้ใช้ (Chrome อนุญาต)
    const blobPromise = html2canvas(target, {
      backgroundColor: null,
      scale: Math.max(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
      ignoreElements: (el) => el.classList && el.classList.contains(COPY_BTN_CLASS),
    }).then(
      (canvas) =>
        new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
        )
    );

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      setLabel('✅ คัดลอกแล้ว กด Ctrl+V เพื่อวางได้เลย');
    } catch (err) {
      console.error(LOG, 'คัดลอกลงคลิปบอร์ดไม่สำเร็จ', err);
      try {
        downloadBlob(await blobPromise);
        setLabel('💾 คัดลอกไม่ได้ จึงบันทึกเป็นไฟล์แทน');
      } catch (err2) {
        console.error(LOG, err2);
        setLabel('❌ สร้างภาพไม่สำเร็จ');
      }
    }
    reset();
  }

  function buildBox({ groups, totalCount }) {
    const box = css(document.createElement('div'), {
      background: '#ffffff',
      'border-radius': '10px',
      padding: '14px 12px',
      margin: '12px 0',
      'font-family': "'Prompt', sans-serif",
      color: '#212529',
      'text-align': 'center',
      'max-height': 'none',
      overflow: 'visible',
      'box-shadow': '0 2px 8px rgba(0, 0, 0, 0.25)',
    });
    box.className = BOX_CLASS;

    const title = css(document.createElement('div'), {
      'font-size': '15px',
      'font-weight': '600',
      'margin-bottom': '8px',
    });
    title.textContent = `⚠️ รายการเลขปิดแยกตามประเภท (ทั้งหมด ${totalCount} รายการ)`;
    box.appendChild(title);

    Object.entries(groups).forEach(([type, numbers]) => {
      const label = css(document.createElement('div'), {
        'font-size': '14px',
        'margin-top': '8px',
        'margin-bottom': '4px',
      });
      label.textContent = type;

      const row = css(document.createElement('div'), {
        display: 'flex',
        'flex-wrap': 'wrap',
        'justify-content': 'center',
        gap: '8px',
      });

      numbers.forEach((n) => {
        const chip = css(document.createElement('span'), {
          display: 'inline-block',
          background: '#dc3545',
          color: '#ffffff',
          'font-size': '15px',
          'font-weight': '600',
          'line-height': '1.2',
          padding: '8px 14px',
          'border-radius': '6px',
          'min-width': '48px',
        });
        chip.textContent = n;
        row.appendChild(chip);
      });

      box.append(label, row);
    });

    const copyBtn = css(document.createElement('button'), {
      display: 'block',
      margin: '14px auto 2px',
      background: '#dc3545',
      color: '#ffffff',
      border: 'none',
      'border-radius': '8px',
      padding: '8px 18px',
      'font-family': "'Prompt', sans-serif",
      'font-size': '14px',
      'font-weight': '600',
      cursor: 'pointer',
    });
    copyBtn.type = 'button';
    copyBtn.className = COPY_BTN_CLASS;
    copyBtn.textContent = COPY_LABEL;
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyModalImage(copyBtn);
    });
    box.appendChild(copyBtn);

    return box;
  }

  // ---------- 4) แทรกก่อนปุ่ม "ปิด" ----------
  function insertBox(root, closeBtn, box) {
    if (!closeBtn) {
      root.appendChild(box);
      return;
    }
    let target = closeBtn;
    // ไต่ขึ้นถ้าปุ่มอยู่ใน wrapper ที่มีลูกเดียว (เช่น แถวปุ่มชิดขวา)
    while (
      target.parentElement &&
      target.parentElement !== root &&
      target.parentElement.children.length === 1
    ) {
      target = target.parentElement;
    }
    if (target.parentElement && target.parentElement.matches('.v-card-actions')) {
      target = target.parentElement;
    }
    target.parentNode.insertBefore(box, target);
  }

  // ---------- 5) ฉีดเข้า Modal ----------
  function process() {
    const found = findAlertModal();
    if (!found) return;
    const { root, closeBtn } = found;

    const data = extractClosedNumbers();
    const existing = root.querySelector('.' + BOX_CLASS);

    if (data.totalCount === 0) {
      if (existing) existing.remove();
      return;
    }

    const signature = JSON.stringify(data);
    if (existing) {
      if (existing.dataset.sig === signature) return;
      existing.remove();
    }

    const box = buildBox(data);
    box.dataset.sig = signature;
    insertBox(root, closeBtn, box);
    console.log(LOG, 'แทรกกล่องสรุปแล้ว', data);
  }

  // ---------- 6) MutationObserver ----------
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try {
        process();
      } catch (err) {
        console.error(LOG, err);
      }
    });
  };

  new MutationObserver((mutations) => {
    const relevant = mutations.some((m) => {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      return !(t && t.closest && t.closest('.' + BOX_CLASS));
    });
    if (relevant) schedule();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  console.log(LOG, 'โหลดแล้ว');
  schedule();
})();

// =====================================================================
// ฟีเจอร์เพิ่ม: ปุ่ม "สรุปยอด" (ลอยมุมขวาล่าง) -> เลือกประเภท -> คัดลอก @ชื่อ ++ยอดถูก
// =====================================================================
(() => {
  'use strict';

  const LOG = '[HHLott สรุปยอดถูก]';
  const ROOT_ID = 'ext-win-fab-root';
  const strip = (s) => (s || '').replace(/[\s ​-‍﻿]+/g, ' ').trim();
  const toNum = (s) => parseFloat(String(s || '').replace(/,/g, '').replace(/[^\d.\-]/g, '')) || 0;
  const fmt = (n) => String(Math.round(n * 100) / 100);

  // ---------- ดึงผู้ถูกจาก tr.billWin แยกตามประเภท (ชนิดหวย) ----------
  // ชื่อเดียวกันในประเภทเดียวกันรวมยอดเป็นบรรทัดเดียว
  // แถวที่ไม่ได้บันทึกชื่อ ยังนับยอด แต่ไม่รวมกัน (แยกบรรทัด) และชื่อเป็นช่องว่าง
  function hasReportTable() {
    return Array.from(document.querySelectorAll('table th')).some((th) => strip(th.textContent) === 'ถูกรางวัล');
  }

  function extractWinners() {
    const types = new Map(); // ประเภท -> { named: Map(ชื่อ->ยอด), blanks: [ยอด] }
    document.querySelectorAll('tr.billWin').forEach((tr) => {
      const tds = tr.querySelectorAll(':scope > td');
      if (tds.length < 9) return;

      const prize = toNum(tds[6].textContent); // คอลัมน์ "ถูกรางวัล"
      if (prize <= 0) return;

      let type = strip(tds[1].textContent); // คอลัมน์ "ชนิดหวย"
      if (!type) {
        const col = tr.closest('.v-col');
        const h = col && col.querySelector('h4');
        type = h ? strip(h.textContent) : 'ไม่ระบุประเภท';
      }

      let name = '';
      for (const td of tds) {
        const m = strip(td.textContent).match(/ออกรางวัล\s*:\s*(.*)$/);
        if (m) { name = strip(m[1]); break; }
      }

      if (!types.has(type)) types.set(type, { named: new Map(), blanks: [] });
      const g = types.get(type);
      if (!name || name === '@') {
        g.blanks.push(prize);
      } else {
        if (!name.startsWith('@')) name = '@' + name;
        g.named.set(name, (g.named.get(name) || 0) + prize);
      }
    });

    return Array.from(types, ([type, g]) => {
      const list = [
        ...Array.from(g.named, ([name, total]) => ({ name, total })),
        ...g.blanks.map((total) => ({ name: '', total })), // ชื่อว่าง
      ];
      return { type, list, sum: list.reduce((a, b) => a + b.total, 0) };
    });
  }

  // บรรทัดข้อความ: ชื่อว่างจะเว้นช่องว่างไว้ให้กรอก  เช่น "@ ++475"
  const lineOf = (w) => `${w.name || '@'} ++${fmt(w.total)}`;
  const textOf = (g) => `${g.type}\n` + g.list.map(lineOf).join('\n');

  // ---------- UI ----------
  const css = (el, styles) => {
    el.style.cssText = Object.entries(styles).map(([k, v]) => `${k}: ${v} !important`).join('; ');
    return el;
  };
  const FONT = "'Prompt', sans-serif";

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
      // สำรอง: textarea + execCommand
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

  let root, fab, menu, open = false;

  function setOpen(v) {
    open = v;
    menu.style.setProperty('display', v ? 'flex' : 'none', 'important');
    fab.textContent = v ? '✕' : 'สรุปยอด';
    fab.style.setProperty('font-size', v ? '34px' : '18px', 'important');
    fab.style.setProperty('background', v ? '#198754' : '#198754', 'important');
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

  function onFabClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (open) return setOpen(false);

    if (!hasReportTable()) {
      return toast('⚠️ ไม่พบตารางรายการ กรุณาเปิดหน้ารายงานที่มีตารางก่อนกดปุ่มสรุปยอด', 'warn');
    }
    const groups = extractWinners();
    if (!groups.length) {
      return toast('⚠️ ไม่มียอดถูกรางวัลในหน้านี้', 'warn');
    }
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

    // คลิกนอกเมนู / กด Esc = ปิดเมนู
    document.addEventListener('click', (e) => { if (open && !root.contains(e.target)) setOpen(false); }, true);
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') setOpen(false); });
    console.log(LOG, 'โหลดแล้ว');
  }

  // ถ้า SPA ล้าง body ให้สร้างปุ่มกลับมา
  new MutationObserver(() => { if (!document.getElementById(ROOT_ID)) mount(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
