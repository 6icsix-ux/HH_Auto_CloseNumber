// ==UserScript==
// @name         Eday - สรุปเลขปิด + คัดลอกภาพ
// @namespace    https://github.com/6icsix-ux/HH_Auto_CloseNumber
// @version      1.0.0
// @description  สรุปเลขปิดแยกตามประเภทท้ายตารางยืนยันรายการ พร้อมปุ่มคัดลอกภาพเฉพาะส่วนเลขปิด
// @author       6icsix-ux
// @match        https://edaylotto.com/*
// @match        https://*.edaylotto.com/*
// @run-at       document-idle
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @updateURL    https://raw.githubusercontent.com/6icsix-ux/HH_Auto_CloseNumber/main/eday-closed-number.user.js
// @downloadURL  https://raw.githubusercontent.com/6icsix-ux/HH_Auto_CloseNumber/main/eday-closed-number.user.js
// ==/UserScript==

(() => {
  'use strict';

  const LOG = '[Eday เลขปิด]';
  const BOX_CLASS = 'ext-closed-box';
  const BTN_CLASS = 'ext-copy-btn';
  const LABEL = '📋 คัดลอกภาพรายการเลขปิด';

  const strip = (s) => (s || '').replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, '');
  const normalize = (s) => (s || '').replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, ' ').trim();

  // ---------- 1) หาตารางยืนยันรายการ (หน้าพรีวิวก่อนยืนยันบิล) ----------
  function findPreviewTable() {
    const mark = document.querySelector('span[translate="BET_PAGE.PREVIEW.ITEM_TYPE_NUMBER"]');
    return mark ? mark.closest('table') : null;
  }

  // ---------- 2) ดึงและจัดกลุ่มเลขปิด ----------
  function extractClosed(table) {
    const groups = {};
    let totalCount = 0;

    table.querySelectorAll('tbody tr').forEach((tr) => {
      const isClosed =
        tr.classList.contains('bg-light-danger') || /ปิดรับ/.test(tr.textContent);
      if (!isClosed) return;

      const cell = tr.querySelector('td');
      if (!cell) return;

      let type = normalize(cell.querySelector('span.text-danger')?.textContent);
      let number = normalize(cell.querySelector('span.text-primary')?.textContent);

      if (!type || !number) {
        const raw = normalize(cell.textContent);
        const i = raw.indexOf('@');
        if (i < 0) return;
        type = normalize(raw.slice(0, i));
        number = normalize(raw.slice(i + 1));
      }
      if (!type || !number) return;

      (groups[type] = groups[type] || []).push(number);
      totalCount++;
    });

    return { groups, totalCount };
  }

  // ---------- 3) สร้างกล่องสรุป ----------
  const css = (el, styles) => {
    el.style.cssText = Object.entries(styles)
      .map(([k, v]) => `${k}: ${v} !important`)
      .join('; ');
    return el;
  };

  function buildBox({ groups, totalCount }) {
    const box = css(document.createElement('div'), {
      background: '#ffffff',
      border: '1px solid #dc3545',
      'border-radius': '10px',
      padding: '14px 12px',
      margin: '12px 0',
      'font-family': "'Poppins', 'Prompt', sans-serif",
      color: '#212529',
      'text-align': 'center',
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

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-warning btn-sm ' + BTN_CLASS;
    btn.style.cssText = 'display:block;margin:14px auto 2px;';
    btn.textContent = LABEL;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyBoxImage(btn, box);
    });
    box.appendChild(btn);

    return box;
  }

  // ---------- 4) คัดลอกภาพกล่องสรุป (เฉพาะเลขปิด) ----------
  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `closed-numbers-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function copyBoxImage(btn, box) {
    const setLabel = (t) => { btn.textContent = t; };
    const reset = () => setTimeout(() => { setLabel(LABEL); btn.disabled = false; }, 2500);

    if (typeof html2canvas === 'undefined') {
      setLabel('❌ โหลดไลบรารีแคปภาพไม่สำเร็จ');
      return reset();
    }

    btn.disabled = true;
    setLabel('⏳ กำลังสร้างภาพ...');

    // ส่ง Promise ให้ ClipboardItem เพื่อให้ยังนับเป็นการกดของผู้ใช้
    const blobPromise = html2canvas(box, {
      backgroundColor: '#ffffff',
      scale: Math.max(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
      ignoreElements: (el) => el.classList && el.classList.contains(BTN_CLASS),
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

  // ---------- 5) แทรกกล่องไว้ท้ายตาราง ----------
  function process() {
    const table = findPreviewTable();
    if (!table) return;

    const wrap = table.parentElement; // div ที่ครอบตาราง
    if (!wrap || !wrap.parentNode) return;

    const parent = wrap.parentNode;
    const existing = parent.querySelector(':scope > .' + BOX_CLASS);

    const data = extractClosed(table);
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
    parent.insertBefore(box, wrap.nextSibling);
    console.log(LOG, 'แทรกกล่องสรุปเลขปิดแล้ว', data);
  }

  // ---------- 6) MutationObserver ----------
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { process(); } catch (err) { console.error(LOG, err); }
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
