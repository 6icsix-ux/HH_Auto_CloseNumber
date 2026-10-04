// ==UserScript==
// @name         HHLott - สรุปเลขปิด
// @namespace    https://github.com/6icsix-ux/HH_Auto_CloseNumber
// @version      1.0.2
// @description  สรุปรายการเลขปิดแยกตามประเภท แสดงใน Modal แจ้งเตือนสีแดงอัตโนมัติ
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
