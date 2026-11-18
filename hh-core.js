
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

    // ยอดคงเหลือ = ผลรวมคอลัมน์ "ยอดเดิมพัน" ของตารางยืนยัน (แถวเลขปิดถูกระบบปรับเป็น 0 แล้ว)
    let remaining = null;
    document.querySelectorAll('td.lotto-name').forEach((td) => {
      if (!td.textContent.includes('@')) return;
      const amountCell = td.nextElementSibling;
      if (!amountCell) return;
      remaining = (remaining || 0) + parseMoney(amountCell.textContent);
    });

    return { groups, totalCount, remaining };
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


  // บรรทัดแสดงยอดเงินที่เหลือหลังหักเลขปิดออกแล้ว
  const fmtMoney = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });   // จำนวนเต็มไม่ต้องมี .00
  const parseMoney = (s) => { const n = parseFloat(String(s || '').replace(/,/g, '').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
  function moneyLine(remaining) {
    const el = css(document.createElement('div'), {
      'font-size': '17px', 'font-weight': '700', color: '#198754', margin: '2px 0 10px',
    });
    el.textContent = `💰 ยอดคงเหลือหลังหักเลขปิด: ${typeof remaining === 'string' ? remaining : fmtMoney(remaining) + ' บาท'}`;
    return el;
  }

  function buildBox({ groups, totalCount, remaining }) {
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
    if (remaining !== null && remaining !== undefined) box.appendChild(moneyLine(remaining));

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
  const textOf = (g) => g.list.map(lineOf).join('\n');

  // ---------- UI ----------
  const css = (el, styles) => {
    el.style.cssText = Object.entries(styles).map(([k, v]) => `${k}: ${v} !important`).join('; ');
    return el;
  };
  const FONT = "'Prompt', sans-serif";

  let toastTimer = null;
  function toast(msg, kind, sticky) {
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
    t.style.setProperty('background', kind === 'warn' ? '#dc3545' : kind === 'busy' ? '#0d6efd' : '#198754', 'important');
    t.style.setProperty('display', 'block', 'important');
    t.textContent = msg;
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => t.style.setProperty('display', 'none', 'important'), 3200);
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
        setOpen(false);
        toast(`⏳ กำลังคัดลอก ${g.type}...`, 'busy', true);
        const [ok] = await Promise.all([copyText(textOf(g)), new Promise((r) => setTimeout(r, 400))]);
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

// =====================================================================
// ฟีเจอร์เพิ่ม: ปุ่ม "คัดลอกบิล" (หน้าแทงหวย HH) -> คัดลอกภาพ: แถวใส่เลข + รายการบิล + คำเตือน/หมายเหตุ + วันเวลา/เวลาที่เหลือ/ชื่อหวย/ยอดรวม
// ปุ่มอยู่ข้างปุ่ม "บันทึก" ส่วนปุ่ม ล้างตาราง/บันทึก จะไม่ติดในภาพ
// =====================================================================
(() => {
  'use strict';

  const LOG = '[HH คัดลอกบิล]';
  const BTN_ID = 'ext-hh-bill-btn';
  const LABEL = '📋 คัดลอกบิล';

  const strip = (s) => (s || '').replace(/[\s ​-‍﻿]+/g, ' ').trim();
  const css = (el, styles) => {
    el.style.cssText = Object.entries(styles).map(([k, v]) => `${k}: ${v} !important`).join('; ');
    return el;
  };
  const visible = (el) => !!(el && el.getClientRects().length);
  const commonAncestor = (a, b) => { for (let n = a; n; n = n.parentElement) if (n.contains(b)) return n; return null; };

  // ---------- หาส่วนต่างๆ ของหน้า ----------
  function findParts() {
    const btns = Array.from(document.querySelectorAll('button')).filter(visible);
    const saveBtn = btns.find((b) => strip(b.textContent) === 'บันทึก');
    const addBtn = btns.find((b) => strip(b.textContent) === 'เพิ่มบิล');
    if (!saveBtn || !addBtn) return null;
    const inputRow = addBtn.closest('.v-row');          // แถว ใส่เลข | กลับเลข | บน | โต๊ด | เพิ่มบิล
    const btnRow = saveBtn.closest('.v-row');
    const btnCol = btnRow && btnRow.parentElement;      // คอลัมน์ที่มีปุ่ม ล้างตาราง/บันทึก
    if (!inputRow || !btnCol) return null;
    const root = commonAncestor(inputRow, btnCol);
    if (!root || root === document.body) return null;
    return { saveBtn, inputRow, btnCol, root };
  }

  // เก็บเฉพาะ: ตั้งแต่แถวใส่เลข ลงไปจนก่อนแถวปุ่ม ล้างตาราง/บันทึก
  function makeKeep(p) {
    return (n) => {
      if (n.nodeType !== 1) return true;
      if (n === p.root) return true;
      if (n.id === BTN_ID) return false;
      if (n.matches && n.matches('.v-counter')) return false;   // ตัวนับตัวอักษรของช่องหมายเหตุ
      if (n === p.btnCol || p.btnCol.contains(n)) return false;              // ปุ่ม ล้างตาราง/บันทึก
      if (n.contains(p.inputRow) || p.inputRow.contains(n)) return true;     // แถวใส่เลข และบรรพบุรุษ
      const pos = p.inputRow.compareDocumentPosition(n);
      if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) return false;           // ส่วนก่อนหน้าแถวใส่เลข
      const after = p.btnCol.compareDocumentPosition(n);
      if (after & Node.DOCUMENT_POSITION_FOLLOWING && !n.contains(p.btnCol)) return false; // ส่วนหลังปุ่ม (ตารางเปล่า ฯลฯ)
      return true;
    };
  }

  // ---------- UI ----------
  let toastTimer = null;
  function toast(msg, kind, sticky) {
    let t = document.getElementById('ext-hh-bill-toast');
    if (!t) {
      t = css(document.createElement('div'), {
        position: 'fixed', left: '50%', bottom: '90px', transform: 'translateX(-50%)', 'z-index': '2147483647',
        padding: '12px 22px', 'border-radius': '12px', color: '#fff',
        'font-size': '15px', 'box-shadow': '0 4px 14px rgba(0,0,0,.35)', 'max-width': '90vw', 'text-align': 'center',
      });
      t.id = 'ext-hh-bill-toast';
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

  // สีพื้นหลังจริงของหน้า (รองรับธีมสว่าง/มืด)
  function pageBg(el) {
    const solid = (c) => c && c !== 'transparent' && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(c);
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (solid(c)) return c;
    }
    return '#ffffff';
  }

  // ---------- สร้างภาพ ----------
  let fontCssPromise = null;
  const getFontCss = (node) => {
    const i2 = window.htmlToImage;
    if (!i2 || !i2.getFontEmbedCSS) return Promise.resolve(undefined);
    if (!fontCssPromise) {
      fontCssPromise = i2.getFontEmbedCSS(node).catch((e) => { console.warn(LOG, 'ฝังฟอนต์ไม่ได้', e); fontCssPromise = null; return undefined; });
    }
    return fontCssPromise;
  };


  // ---------- แคชรูป (ธง) + อุ่นเครื่องล่วงหน้า เพื่อให้กดคัดลอกแล้วเร็ว ----------
  const imgCache = new Map();   // url -> Promise<dataURL|null>
  function toDataUrl(url) {
    if (!imgCache.has(url)) {
      imgCache.set(url, fetch(url, { mode: 'cors', cache: 'force-cache' })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((b) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); }))
        .catch((e) => { console.warn(LOG, 'โหลดรูปไม่ได้', url, e); imgCache.delete(url); return null; }));
    }
    return imgCache.get(url);
  }
  function inlineImages(root) {
    const imgs = Array.from(root.querySelectorAll('img')).filter((i) => /^https?:/.test(i.src));
    return Promise.all(imgs.map(async (i) => {
      const d = await toDataUrl(i.src);
      if (d) { i.removeAttribute('srcset'); i.src = d; }
    }));
  }
  let warmed = false;
  function warmUp(p) {
    if (warmed) return;
    warmed = true;
    const run = () => {
      try {
        getFontCss(p.root);
        p.root.querySelectorAll('img').forEach((i) => { if (/^https?:/.test(i.src)) toDataUrl(i.src); });
      } catch (e) { console.warn(LOG, e); }
    };
    (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(run, { timeout: 3000 });
  }

  const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  async function renderBill(p, scale, bg) {
    const keep = makeKeep(p);
    const i2 = window.htmlToImage;
    if (i2) {
      const opt = {
        pixelRatio: scale,
        backgroundColor: bg,
        imagePlaceholder: PLACEHOLDER,
        style: { height: 'auto', minHeight: '0' },
        filter: keep,
      };
      const fontCSS = await getFontCss(p.root);
      if (fontCSS !== undefined) opt.fontEmbedCSS = fontCSS;
      return i2.toCanvas(p.root, opt);
    }
    return html2canvas(p.root, {
      backgroundColor: bg, scale, useCORS: true, logging: false,
      ignoreElements: (n) => !keep(n),
    });
  }

  // ย่อภาพเป็นเล็กๆ เพื่อวิเคราะห์เร็ว (การไล่พิกเซลภาพเต็มขนาดช้ามาก)
  const K = 8;
  function smallOf(canvas) {
    const sw = Math.max(1, Math.floor(canvas.width / K)), sh = Math.max(1, Math.floor(canvas.height / K));
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, sw, sh);
    return { sw, sh, data: ctx.getImageData(0, 0, sw, sh).data };
  }

  // ตัดพื้นที่ว่างท้ายภาพ โดยเทียบกับสีพื้นหลังจริง + เว้นขอบล่างเล็กน้อย
  function cropBlank(canvas, scale) {
    const { sw, sh, data } = smallOf(canvas);
    const b0 = [data[0], data[1], data[2]];
    let last = -1;
    for (let y = sh - 1; y >= 0 && last < 0; y--) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        if (data[i + 3] > 8 && Math.abs(data[i] - b0[0]) + Math.abs(data[i + 1] - b0[1]) + Math.abs(data[i + 2] - b0[2]) > 24) { last = y; break; }
      }
    }
    const H = last < 0 ? canvas.height : Math.min(canvas.height, (last + 1) * K + Math.round(12 * scale));
    if (H >= canvas.height) return canvas;
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = H;
    out.getContext('2d').drawImage(canvas, 0, 0);
    return out;
  }

  // ตัดช่องว่างโล่งขนาดใหญ่ที่อยู่ "กลางภาพ" (แถวที่ซ้ำกับแถวบนทุกพิกเซล) ให้เหลือแค่เล็กน้อย
  function collapseGaps(canvas, scale) {
    const { sw, sh, data } = smallOf(canvas);
    const empty = new Array(sh).fill(false);
    for (let y = 1; y < sh; y++) {
      const r1 = y * sw * 4, r0 = (y - 1) * sw * 4;
      let ok = true;
      for (let x = 0; x < sw; x++) {
        const i = x * 4;
        if (Math.abs(data[r1 + i] - data[r0 + i]) + Math.abs(data[r1 + i + 1] - data[r0 + i + 1]) + Math.abs(data[r1 + i + 2] - data[r0 + i + 2]) > 8) { ok = false; break; }
      }
      empty[y] = ok;
    }
    const MIN = Math.max(2, Math.round(90 * scale / K)), KEEP = Math.round(16 * scale);
    const segs = [];
    let start = 0, y = 0;
    while (y < sh) {
      if (!empty[y]) { y++; continue; }
      let z = y;
      while (z < sh && empty[z]) z++;
      if (z - y >= MIN && y > 0 && z < sh) {
        segs.push([start, y * K + Math.round(KEEP / 2)]);
        start = z * K - Math.round(KEEP / 2);
      }
      y = z;
    }
    if (!segs.length) return canvas;
    segs.push([start, canvas.height]);
    const w = canvas.width;
    const H = segs.reduce((a, s) => a + (s[1] - s[0]), 0);
    const out = document.createElement('canvas');
    out.width = w; out.height = H;
    const octx = out.getContext('2d');
    let oy = 0;
    segs.forEach(([a, b]) => { octx.drawImage(canvas, 0, a, w, b - a, 0, oy, w, b - a); oy += b - a; });
    return out;
  }

  // เว้นขอบรอบภาพ
  function pad(canvas, bg, scale) {
    const M = Math.round(12 * scale);
    const out = document.createElement('canvas');
    out.width = canvas.width + M * 2;
    out.height = canvas.height + M * 2;
    const ctx = out.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, M, M);
    return out;
  }


  // ปรับหน้าจริงชั่วคราวระหว่างแคป: เว้นที่ให้ป้าย "ใส่เลข", แทนไอคอนฟอนต์ด้วย SVG, หดกล่องเขียวให้พอดีรายการบิล
  const ICONS = {
    'mdi-delete': 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
    'mdi-plus-thick': 'M20 14H14V20H10V14H4V10H10V4H14V10H20V14Z',
  };
  function tweak(p) {
    const undo = [];
    const setStyle = (el, props) => {
      const old = el.getAttribute('style');
      Object.entries(props).forEach(([k, v]) => el.style.setProperty(k, v, 'important'));
      undo.push(() => (old === null ? el.removeAttribute('style') : el.setAttribute('style', old)));
    };
    setStyle(p.inputRow, { 'margin-top': '6px' });
    setStyle(p.root, { flex: '0 0 620px', 'max-width': 'none', width: '620px' });  // ขยายให้กว้างพอ ปุ่มด้านขวาไม่โดนตัด
    p.root.querySelectorAll('i.mdi').forEach((i) => {
      const key = Object.keys(ICONS).find((k) => i.classList.contains(k));
      if (!key) return;
      const sp = document.createElement('span');
      sp.setAttribute('data-ext-tmp', '');
      sp.style.cssText = 'display:inline-flex;vertical-align:middle;width:1.4em;height:1.4em;color:inherit;';
      sp.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="' + ICONS[key] + '"/></svg>';
      const old = i.getAttribute('style');
      i.style.setProperty('display', 'none', 'important');
      i.after(sp);
      undo.push(() => { sp.remove(); old === null ? i.removeAttribute('style') : i.setAttribute('style', old); });
    });
    const box = p.inputRow.closest('.v-alert');
    if (box && p.root.contains(box)) {
      setStyle(box, { height: 'auto', 'min-height': '0' });
      box.querySelectorAll('.v-textarea__sizer').forEach((n) => n.remove());   // textarea ซ่อนที่ใช้คำนวณความสูง ทำให้กล่องสูงเกินจริง
      const rows = Array.from(box.querySelectorAll('.v-row')).filter((r) => r.querySelector('textarea[readonly]'));
      // ใช้ก้นของ "ส่วนที่มองเห็นจริง" (ช่องตัวเลข/ปุ่ม/ข้อความ) ไม่ใช่ความสูงของแถว
      const bottoms = [];
      rows.forEach((r) => r.querySelectorAll('.v-field, button, p').forEach((e) => bottoms.push(e.getBoundingClientRect().bottom)));
      if (bottoms.length) {
        const cs = getComputedStyle(box);
        const need = Math.max(...bottoms) - box.getBoundingClientRect().top
          + (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0) + 6;
        if (box.getBoundingClientRect().height > need + 8) setStyle(box, { height: need + 'px', overflow: 'hidden' });
      }
    }
    return () => undo.reverse().forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  }


  // สร้างสำเนานอกจอสำหรับแคป เพื่อไม่ให้หน้าจริงขยับ/ดันตารางข้างๆ ตอนคัดลอก
  function makeOffscreen(p) {
    const W = 620;
    const marks = [['in', p.inputRow], ['btn', p.btnCol]];
    marks.forEach(([k, el]) => el.setAttribute('data-ext-k', k));
    const clone = p.root.cloneNode(true);
    marks.forEach(([, el]) => el.removeAttribute('data-ext-k'));
    // cloneNode ไม่คัดลอกค่าที่พิมพ์ไว้ในช่อง/textarea ต้องใส่เอง
    const srcF = p.root.querySelectorAll('input, textarea');
    const dstF = clone.querySelectorAll('input, textarea');
    srcF.forEach((s, i) => { if (dstF[i]) dstF[i].value = s.value; });
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    clone.querySelectorAll('#' + BTN_ID + ',[data-ext-tmp]').forEach((n) => n.remove());
    const cs = getComputedStyle(p.root);
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;pointer-events:none;` +
      `font-family:${cs.fontFamily};font-size:${cs.fontSize};line-height:${cs.lineHeight};color:${cs.color};`;
    host.appendChild(clone);
    document.body.appendChild(host);
    const p2 = {
      root: clone,
      inputRow: clone.querySelector('[data-ext-k="in"]'),
      btnCol: clone.querySelector('[data-ext-k="btn"]'),
    };
    return { p2, cleanup: () => host.remove() };
  }

  let busy = false;
  async function onClick(btn) {
    if (busy) return;
    if (!window.htmlToImage && typeof html2canvas === 'undefined') return toast('❌ โหลดไลบรารีแคปภาพไม่สำเร็จ', 'warn');
    const p = findParts();
    if (!p) return toast('⚠️ ไม่พบส่วนบิล กรุณาเปิดหน้าแทงหวยก่อน', 'warn');
    if (!p.root.querySelector('textarea[readonly]')) return toast('⚠️ ยังไม่มีเลขในบิล กรุณาเพิ่มบิลก่อนคัดลอก', 'warn');

    busy = true;
    btn.textContent = '⏳ กำลังสร้างภาพ...';
    const bg = pageBg(p.root);
    const off = makeOffscreen(p);
    await inlineImages(off.p2.root);   // ใช้รูปจากแคช (ไม่ต้องโหลดใหม่ทุกครั้ง)
    const restore = tweak(off.p2);
    const cleanup = () => { restore(); off.cleanup(); };
    const t0 = performance.now();
    const scale = Math.max(2, window.devicePixelRatio || 1);
    const lap = (m) => console.log(LOG, `[เวลา] ${m}: ${Math.round(performance.now() - t0)} ms`);
    lap('เตรียมสำเนา');
    const blobPromise = renderBill(off.p2, scale, bg)
      .then((canvas) => { lap(`วาดภาพ ${canvas.width}x${canvas.height}`); return canvas; })
      .then((canvas) => pad(cropBlank(collapseGaps(canvas, scale), scale), bg, scale))
      .then((canvas) => { lap(`ตัดแต่ง ${canvas.width}x${canvas.height}`); return canvas; })
      .then((canvas) => new Promise((res, rej) => canvas.toBlob((b) => {
        console.log(LOG, `สร้างภาพใช้เวลา ${Math.round(performance.now() - t0)} ms (${window.htmlToImage ? 'html-to-image' : 'html2canvas'})`);
        return b ? res(b) : rej(new Error('toBlob failed'));
      }, 'image/png')));

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      toast('✅ คัดลอกบิลแล้ว กด Ctrl+V เพื่อวางได้เลย', 'ok');
    } catch (err) {
      console.error(LOG, err);
      try { downloadBlob(await blobPromise); toast('💾 คัดลอกไม่ได้ จึงบันทึกเป็นไฟล์แทน', 'ok'); }
      catch (e2) { console.error(LOG, e2); toast('❌ สร้างภาพไม่สำเร็จ (ดูรายละเอียดใน Console)', 'warn'); }
    } finally {
      cleanup();
      btn.textContent = LABEL;
      busy = false;
    }
  }

  // วางปุ่มไว้ข้างปุ่ม "บันทึก"
  function mount() {
    const p = findParts();
    const existing = document.getElementById(BTN_ID);
    if (!p) { if (existing) existing.remove(); return; }
    warmUp(p);
    if (existing && existing.previousElementSibling === p.saveBtn) return;
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'v-btn v-btn--elevated v-theme--PurpleTheme bg-primary v-btn--density-default elevation-0 v-btn--size-default v-btn--variant-elevated center ml-1';
    const inner = document.createElement('span');
    inner.className = 'v-btn__content';
    btn.appendChild(inner);
    Object.defineProperty(btn, 'textContent', { set(v) { inner.textContent = v; }, get() { return inner.textContent; }, configurable: true });
    btn.textContent = LABEL;
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(btn); });
    p.saveBtn.after(btn);
    console.log(LOG, 'แสดงปุ่มแล้ว');
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; try { mount(); } catch (e) { console.error(LOG, e); } });
  }).observe(document.documentElement, { childList: true, subtree: true });
  mount();
  console.log(LOG, 'โหลดแล้ว');
})();
