/* ==========================================================================
   SCG AI BOQ & Concrete Structure Estimator - BOQ & UI Manager Logic
   File: boq-manager.js
   ========================================================================== */

// ตัวแปรเก็บข้อมูลสำหรับ BOQ
let lastRawBOQItems = [];
let editingItemId = null;
let detectedTotalPages = 1;
let pdfDocumentInstance = null;

// ฟังก์ชันจัดรูปแบบข้อความประมาณการสั่งซื้อเป็น HTML บรรทัด
function formatOrderEstimateHTML(text) {
  if (!text) return "-";
  let items = text.split(/(?:\r?\n|(?<=\s|^)[-•]\s+|\s*\[|\s*\]|\s*\|\s*)/g)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s !== "-");
  if (items.length <= 1 && text.includes(" - ")) {
    items = text.split(/\s+-\s+/).map(s => s.trim()).filter(s => s.length > 0);
  }
  if (items.length === 0) return text;
  
  let html = `<div class="order-bundle-list">`;
  items.forEach(item => {
    const cleanItem = item.replace(/^[-•*]\s*/, '').trim();
    if (cleanItem) {
      html += `
        <div style="display:flex; gap:6px; align-items:flex-start; margin-bottom: 2px;">
          <span class="order-item-icon">📦</span>
          <span class="order-item-text">${cleanItem}</span>
        </div>`;
    }
  });
  html += `</div>`;
  return html;
}

// ฟังก์ชันเรนเดอร์ข้อมูลลงในตาราง BOQ
function renderBOQTable(items) {
  const tbody = document.getElementById("boqBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!items || items.length === 0) {
    const resultCard = document.getElementById("resultCard");
    if (resultCard) resultCard.style.display = "none";
    return;
  }

  items.forEach((item) => {
    let badgeClass = "badge badge-other";
    const cat = item.category || "";
    if (cat.includes("หลังคา") || cat.includes("สันหลังคา") || cat.includes("ฉนวน")) {
      badgeClass = "badge badge-roof";
    } else if (cat.includes("ผนัง")) {
      badgeClass = "badge badge-wall";
    } else if (cat.includes("พื้น") || cat.includes("โครงสร้าง") || cat.includes("คอนกรีต")) {
      badgeClass = "badge badge-floor";
    }

    const conf = item.confidence_score || 95;
    let confClass = "badge-high";
    let confIcon = "🟢";
    if (conf < 80) {
      confClass = "badge-low";
      confIcon = "🔴";
    } else if (conf < 90) {
      confClass = "badge-medium";
      confIcon = "🟡";
    }

    const pageNum = (item.source_location && item.source_location.page_number) ? item.source_location.page_number : 1;
    const isModified = item.is_manual_modified ? "modified" : "";
    const manualBadge = item.is_manual_modified ? `<span class="manual-badge">✏️ ปรับแก้แล้ว</span>` : "";
    const orderEstimateFormatted = formatOrderEstimateHTML(item.order_estimate);
    const crossCheckBadge = item.is_manual_modified ? `<div style="font-size: 10px; color: #d97706; margin-top: 2px;">📐 วัดขนาดโดยผู้ใช้</div>` : "";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><span class="${badgeClass}">${item.category || "-"}</span></td>
      <td style="text-align: center; font-weight: 600;">หน้า ${pageNum}</td>
      <td style="font-weight: 600; color: #475569;">${item.code_ref || "-"}</td>
      <td>
        <div style="font-weight: 600; color: #0f172a;">${item.item_name || "-"}</div>
      </td>
      <td>
        <div class="edit-qty-wrapper">
          <input type="text" class="input-qty ${isModified}" id="qty-input-${item._id}" value="${item.net_quantity || ""}" onchange="updateNetQuantity('${item._id}', this.value)">
          ${manualBadge}
        </div>
      </td>
      <td style="color: #b91c1c; font-weight: 600;">${item.scg_product || "-"}</td>
      <td>
        <div id="order-estimate-${item._id}">${orderEstimateFormatted}</div>
      </td>
      <td style="text-align: center;">
        <span class="confidence-badge ${confClass}">
          ${confIcon} ${conf}%
        </span>
      </td>
      <td style="color: #64748b;">${item.calculation_note || "-"}</td>
      <td>
        <div class="audit-text">${item.verification_method || "คำนวณตามพื้นที่/ความยาวที่ปรากฏในแบบ"}</div>
        ${crossCheckBadge}
      </td>
      <td class="no-print" style="text-align: center;">
        <button type="button" class="btn-view" onclick="openInPlaceEditor('${item._id}')">🔍 ดู/แก้ไขในแบบ (หน้า ${pageNum})</button>
      </td>
      <td class="no-print" style="text-align: center;">
        <button type="button" class="btn-delete" title="ลบรายการนี้ออก" onclick="deleteBOQItem('${item._id}')">🗑️ ลบ</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  const resultCard = document.getElementById("resultCard");
  if (resultCard) resultCard.style.display = "block";
}

// ฟังก์ชันลบรายการออกจากตาราง BOQ
function deleteBOQItem(id) {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) return;
  const targetItem = lastRawBOQItems.find(item => item._id === id);
  const itemName = targetItem ? (targetItem.item_name || "รายการนี้") : "รายการนี้";
  if (confirm(`คุณต้องการลบ "${itemName}" ออกจากตาราง BOQ ใช่หรือไม่?`)) {
    lastRawBOQItems = lastRawBOQItems.filter(item => item._id !== id);
    renderBOQTable(lastRawBOQItems);
  }
}

// อัปเดตปริมาณสุทธิเมื่อผู้ใช้พิมพ์แก้ไขในตาราง
function updateNetQuantity(id, newValue) {
  if (!lastRawBOQItems) return;
  const item = lastRawBOQItems.find(it => it._id === id);
  if (!item) return;
  const trimmed = newValue.trim();
  item.net_quantity = trimmed;
  item.is_manual_modified = true;

  const numericMatch = trimmed.match(/[\d,.]+/);
  if (numericMatch) {
    const rawNum = parseFloat(numericMatch[0].replace(/,/g, ''));
    if (!isNaN(rawNum) && rawNum > 0) {
      if (typeof updateOrderEstimate === "function") {
        updateOrderEstimate(id, rawNum, item.scg_product);
      }
    }
  }
}

// สลับโหมดการเลือกขอบเขตหน้า (สแกนทุกหน้า vs เลือกเฉพาะหน้า)
function toggleCustomScopeMode() {
  const isSingle = document.getElementById("scopeSinglePageRadio").checked;
  const container = document.getElementById("customPageSelectContainer");
  if (container) {
    container.style.display = isSingle ? "block" : "none";
  }
}

// เปิดหน้าต่าง Modal เพิ่มรายการแบบกำหนดเอง
function openCustomItemModal() {
  const pageSelect = document.getElementById("customItemPageSelect");
  if (pageSelect) {
    pageSelect.innerHTML = "";
    const totalPages = detectedTotalPages || (pdfDocumentInstance ? pdfDocumentInstance.numPages : 1);
    for (let i = 1; i <= totalPages; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.innerText = `หน้า ${i}`;
      pageSelect.appendChild(opt);
    }
  }

  const allRadio = document.getElementById("scopeAllPagesRadio");
  if (allRadio) allRadio.checked = true;
  toggleCustomScopeMode();

  const descInput = document.getElementById("customItemDescInput");
  if (descInput) descInput.value = "";
  
  const modal = document.getElementById("customItemModal");
  if (modal) modal.style.display = "flex";
}

// ฟังก์ชันเปิดดูและแก้ไขในแบบแปลน (In-place Editor)
function openInPlaceEditor(id) {
  const item = lastRawBOQItems.find(it => it._id === id);
  if (!item) return;
  editingItemId = id;
  if (typeof openManualDrawModal === "function") {
    openManualDrawModal();
    const pageNum = (item.source_location && item.source_location.page_number) ? item.source_location.page_number : 1;
    const pageSelect = document.getElementById("drawPageSelect");
    if (pageSelect) {
      pageSelect.value = pageNum;
      if (typeof onDrawPageChange === "function") {
        onDrawPageChange();
      }
    }
  }
}

// ฟังก์ชัน Export ข้อมูลเป็น Excel (.xlsx แท้)
function exportExcel() {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) {
    alert("ไม่มีข้อมูลสำหรับส่งออก Excel");
    return;
  }

  const excelData = lastRawBOQItems.map(row => {
    const page = (row.source_location && row.source_location.page_number) ? row.source_location.page_number : "-";
    const desc = (row.source_location && row.source_location.location_description) ? row.source_location.location_description : "-";
    const modifiedStatus = row.is_manual_modified ? "แก้ไขในแบบแล้ว" : "คำนวณอัตโนมัติ";
    const cleanEstimate = (row.order_estimate || "-").replace(/^[-•*]\s*/gm, '').replace(/\r?\n/g, " | ");

    return {
      "หมวดงาน": row.category || "-",
      "หน้าที่พบ": `หน้า ${page}`,
      "รหัสอ้างอิง/สัญลักษณ์": row.code_ref || "-",
      "รายการงานตามแบบ": row.item_name || "-",
      "ปริมาณสุทธิ": row.net_quantity || "-",
      "สถานะ": modifiedStatus,
      "สินค้า SCG / CPAC ที่แนะนำ": row.scg_product || "-",
      "ประมาณการสั่งซื้อจริง (พร้อมแพ็กเกจระบบ)": cleanEstimate,
      "ความมั่นใจ (%)": row.confidence_score || "-",
      "หมายเหตุและสูตรคำนวณ": row.calculation_note || "-",
      "การ Cross-Check และที่มาปริมาณ": row.verification_method || "-",
      "คำอธิบายตำแหน่งในแบบ": desc
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const colWidths = [
    { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 32 },
    { wch: 14 }, { wch: 16 }, { wch: 35 }, { wch: 45 },
    { wch: 14 }, { wch: 35 }, { wch: 40 }, { wch: 30 }
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SCG_BOQ");
  const fileName = `SCG_CPAC_BOQ_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

// สร้างเนื้อหารายงานสำหรับการพิมพ์หรือแสดงตัวอย่าง PDF
function buildReportHTML() {
  const headerHTML = `
    <div style="border-bottom: 3px solid #dc2626; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <h2 style="margin: 0; color: #dc2626; font-size: 19px; font-weight: bold;">รายงานถอดแบบและประมาณการสั่งซื้อสินค้า SCG & คอนกรีต CPAC</h2>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">สรุปรายการแยกตามหน้าแปลนก่อสร้างจริง พร้อมระบบตรวจสอบ Cross-Check 3D & Symbol Schedule Mapping</div>
      </div>
      <div style="text-align: right; font-size: 11px; color: #64748b;">
        วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}
      </div>
    </div>
  `;

  let rowsHTML = "";
  lastRawBOQItems.forEach(row => {
    const page = (row.source_location && row.source_location.page_number) ? row.source_location.page_number : "-";
    rowsHTML += `
      <tr>
        <td style="padding: 6px 8px; font-weight: 600;">${row.category || "-"}</td>
        <td style="padding: 6px 8px; text-align: center;">หน้า ${page}</td>
        <td style="padding: 6px 8px;">${row.code_ref || "-"}</td>
        <td style="padding: 6px 8px; font-weight: 600;">${row.item_name || "-"}</td>
        <td style="padding: 6px 8px; font-weight: bold;">${row.net_quantity || "-"}</td>
        <td style="padding: 6px 8px; color: #b91c1c; font-weight: 600;">${row.scg_product || "-"}</td>
        <td style="padding: 6px 8px; font-size: 10px;">${(row.order_estimate || "-").replace(/\n/g, "<br>")}</td>
        <td style="padding: 6px 8px; color: #64748b; font-size: 10px;">${row.calculation_note || "-"}</td>
        <td style="padding: 6px 8px; color: #0369a1; font-size: 9px; line-height: 1.3;">${row.verification_method || "-"}</td>
      </tr>
    `;
  });

  const tableHTML = `
    <table style="width: 100%; border-collapse: collapse; text-align: left;">
      <thead>
        <tr style="background: #f1f5f9; border-bottom: 2px solid #94a3b8; font-size: 11px;">
          <th style="padding: 8px;">หมวดงาน</th>
          <th style="padding: 8px; text-align: center;">หน้า</th>
          <th style="padding: 8px;">รหัส/สัญลักษณ์</th>
          <th style="padding: 8px;">รายการงานตามแบบ</th>
          <th style="padding: 8px;">ปริมาณสุทธิ</th>
          <th style="padding: 8px;">สินค้าแนะนำ</th>
          <th style="padding: 8px;">ประมาณการสั่งซื้อจริง</th>
          <th style="padding: 8px;">หมายเหตุ/สูตรคำนวณ</th>
          <th style="padding: 8px;">ที่มาการ Cross-Check</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML}
      </tbody>
    </table>
  `;

  return headerHTML + tableHTML;
}

// เปิดหน้าต่างดูตัวอย่างรายงาน PDF
function openPdfPreviewModal() {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) {
    alert("ไม่มีข้อมูลสำหรับแสดงรายงาน PDF");
    return;
  }
  printReportDocument();
}

// สั่งพิมพ์รายงานเอกสารออกทางหน้าต่างพิมพ์เบราว์เซอร์ (A4 แนวนอน)
function printReportDocument() {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) {
    alert("ไม่มีข้อมูลสำหรับสั่งพิมพ์");
    return;
  }
  const reportContent = buildReportHTML();
  const printWindow = window.open('', '_blank', 'width=1200,height=850');
  if (!printWindow) {
    alert("เบราว์เซอร์บล็อกหน้าต่างป๊อปอัป กรุณาอนุญาตป๊อปอัปสำหรับเว็บไซต์นี้");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>SCG_CPAC_BOQ_Report_${new Date().toISOString().slice(0, 10)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm 10mm 10mm 10mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-after: auto;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
    }
    th {
      background-color: #f1f5f9 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
  ${reportContent}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 400);
    };
  <\/script>
</body>
</html>
  `);
  printWindow.document.close();
}

// ฟังก์ชันบันทึกโปรเจกต์เป็นไฟล์ JSON (Export JSON)
function exportJSON() {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) {
    alert("ไม่มีข้อมูลสำหรับส่งออก JSON");
    return;
  }

  const projectSnapshot = {
    exportDate: new Date().toISOString(),
    version: "3.5-lite",
    settings: {
      woodOption: document.getElementById("woodOption") ? document.getElementById("woodOption").value : "auto",
      customInstructionPrompt: document.getElementById("customInstructionPrompt") ? document.getElementById("customInstructionPrompt").value : ""
    },
    items: lastRawBOQItems
  };

  const jsonString = JSON.stringify(projectSnapshot, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SCG_BOQ_Project_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ฟังก์ชันนำเข้าโปรเจกต์จากไฟล์ JSON (Import JSON)
function handleJsonFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      let itemsToLoad = [];
      if (Array.isArray(imported)) {
        itemsToLoad = imported;
      } else if (imported && Array.isArray(imported.items)) {
        itemsToLoad = imported.items;
        if (imported.settings) {
          const s = imported.settings;
          if (s.woodOption && document.getElementById("woodOption")) {
            document.getElementById("woodOption").value = s.woodOption;
          }
          if (s.customInstructionPrompt && document.getElementById("customInstructionPrompt")) {
            document.getElementById("customInstructionPrompt").value = s.customInstructionPrompt;
          }
        }
      }

      lastRawBOQItems = itemsToLoad;
      renderBOQTable(lastRawBOQItems);
      alert(`✅ นำเข้าข้อมูลโปรเจกต์สำเร็จ (${lastRawBOQItems.length} รายการ)`);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการอ่านไฟล์ JSON กรุณาตรวจสอบความถูกต้องของไฟล์");
    }
  };
  reader.readAsText(file);
}