/* ==========================================================
   ตรรกะหลัก แอปพลิเคชัน & AI ถอดแบบ BOQ (GEMINI 3.5 FLASH LITE)
   ========================================================== */
let currentUploadedFile = null;
let pdfDocumentInstance = null;
let singleImageInstance = null;
let lastRawBOQItems = [];
let detectedTotalPages = 1;
let editingItemId = null;

function applyQuickPrompt(text) {
  const promptInput = document.getElementById("customInstructionPrompt");
  if (promptInput.value.trim() === "") {
    promptInput.value = text;
  } else {
    promptInput.value += "\n" + text;
  }
}

function clearQuickPrompt() {
  document.getElementById("customInstructionPrompt").value = "";
}

const SCG_ROOF_MIN_SLOPE = {
  "metal_lumax": 0.3,
  "metal_snaplock": 3,
  "metal_760": 5,
  "roman": 15,
  "cpac": 17,
  "excella": 17,
  "scg_neustile": 22,
  "scg_prestige": 25,
  "auto": 0.3
};

function getMinSlopeFromProductName(productName) {
  const p = (productName || "").toLowerCase();
  if (p.includes("lumax") || p.includes("ลูแมกซ์")) return 0.3;
  if (p.includes("snap lock") || p.includes("snaplock")) return 3;
  if (p.includes("760") || p.includes("noise shield")) return 5;
  if (p.includes("ลอนคู่") || p.includes("roman")) return 15;
  if (p.includes("cpac") || p.includes("ซีแพค") || p.includes("excella") || p.includes("เอ็กซ์เซลล่า")) return 17;
  if (p.includes("neustile") || p.includes("นิวสไตล์")) return 22;
  if (p.includes("prestige") || p.includes("เพรสทีจ")) return 25;
  return 15;
}

const SCG_PRODUCT_CATALOG = {
  "งานหลังคา": [
    "SCG Roof Metal Sheet ลอน LumaX (รับความชันต่ำสุด 0.3 องศา)",
    "SCG Roof Metal Sheet ลอน Snap Lock (ซ่อนสกรู ขั้นต่ำ 3 องศา)",
    "SCG Roof Metal Sheet ลอน 760 Noise Shield (กันเสียงฝน)",
    "หลังคาคอนกรีตแผ่นเรียบ SCG Prestige (ขั้นต่ำ 25 องศา)",
    "หลังคาคอนกรีตแผ่นเรียบ SCG Neustile (นิวสไตล์ ขั้นต่ำ 22 องศา)",
    "หลังคาคอนกรีต SCG CPAC ลอนมาตรฐาน (ขั้นต่ำ 17 องศา)",
    "กระเบื้องหลังคาลอนคู่ SCG (ขั้นต่ำ 15 องศา)",
    "หลังคาเซรามิก SCG Excella",
    "ไม้เชิงชาย SCG Smartwood 2 in 1 (ตามแนวชายคา)"
  ],
  "งานสันหลังคา/ตะเข้สัน (SCG Dry Tech)": [
    "ระบบครอบแห้ง SCG Dry Tech System + ครอบสันหลังคา Prestige",
    "ระบบครอบแห้ง SCG Dry Tech System + ครอบสันหลังคา Neustile",
    "ระบบครอบแห้ง SCG Dry Tech System + ครอบสันหลังคา CPAC",
    "ครอบสันหลังคา Metal Sheet LumaX / แฟลชชิ่งสันหลังคา"
  ],
  "งานฉนวนใต้หลังคา (SCG FSO)": [
    "ฉนวนใยแก้วใต้หลังคา SCG FSO (Factory-laminated Foil บุใต้ Metal Sheet/แป)",
    "แผ่นสะท้อนความร้อน SCG Radiant Barrier ใต้แปหลังคา (ม้วน 60 ตร.ม.)"
  ],
  "งานฉนวนปูเหนือฝ้า (STAY COOL)": [
    "ฉนวนปูเหนือฝ้า SCG STAY COOL หนา 75 มม. (3 นิ้ว หุ้มฟอยล์รอบด้าน)",
    "ฉนวนปูเหนือฝ้า SCG STAY COOL หนา 150 มม. (6 นิ้ว กันร้อนสูงสุด)"
  ],
  "งานโครงสร้างและคอนกรีต CPAC": [
    "แผ่นพื้นสำเร็จรูป CPAC Hollow Core หนา 10 ซม. + Topping 5 ซม. + Wire Mesh",
    "แผ่นพื้นสำเร็จรูป CPAC Hollow Core หนา 8 ซม. + Topping 5 ซม. + Wire Mesh",
    "แผ่นพื้นสำเร็จรูป CPAC Hollow Core หนา 12 ซม. (สแปนยาวพิเศษ)",
    "แผ่นพื้นสำเร็จรูป CPAC Hollow Core หนา 15 ซม.",
    "ระบบพื้นคอนกรีตอัดแรง Post-tension (Post-tensioned Slab + PC Strand)",
    "คอนกรีตผสมเสร็จ CPAC 240 ksc Cube (เทพื้นโครงสร้างทั่วไป)",
    "คอนกรีตผสมเสร็จ CPAC 280 ksc Cube (มาตรฐานงานเสา/คาน)",
    "คอนกรีตผสมเสร็จ CPAC 320 ksc Cube (โครงสร้างรับน้ำหนักสูง)",
    "คอนกรีตผสมเสร็จ CPAC 350-400 ksc Cube (งาน Post-tension)",
    "คอนกรีตกันซึม CPAC (สำหรับเทดาดฟ้า/ห้องน้ำ/สระว่ายน้ำ)",
    "คอนกรีตทับหน้า Topping หนา 5 ซม. เหนือแผ่น Hollow Core"
  ],
  "งานไม้สังเคราะห์/ตกแต่ง": [
    "ไม้เชิงชาย SCG Smartwood 2 in 1 (3.0 ม./ท่อน)",
    "ไม้ฝา SCG Smartwood (ลายไม้สัก)",
    "ไม้บัว SCG Smartwood (3.0 ม./ท่อน)",
    "ไม้ระแนงบังแดด / ตกแต่ง SCG Smartwood 3 นิ้ว",
    "ไม้รั้วสังเคราะห์ SCG Smartwood",
    "ไม้พื้นสังเคราะห์ SCG Smartwood / D-COR"
  ],
  "งานผนัง": [
    "ก่ออิฐมวลเบา Q-CON + ปูนฉาบเสือมอร์ตาร์",
    "ผนังเบา สมาร์ทบอร์ด SCG หนา 8-10 มม. + โครง C-Stud",
    "ผนังตกแต่ง ไม้ฝา SCG Smartwood (ลายไม้สัก)",
    "ก่ออิฐมอญ/บล็อก + ปูนเสือซีเมนต์ผสม"
  ],
  "งานพื้น": [
    "กระเบื้องปูพื้น COTTO + ปูนกาวเสือ",
    "ไม้พื้นสังเคราะห์ SCG Smartwood / D-COR",
    "แผ่นพื้นสมาร์ทบอร์ด SCG หนา 16-20 มม."
  ],
  "งานฝ้าเพดาน": [
    "ฝ้าสมาร์ทบอร์ด SCG ขอบเรียบ หนา 3.5-4 มม. + โครงฝ้า",
    "ฝ้าชายคา สมาร์ทบอร์ด SCG รุ่นมีรูระบายอากาศ (ลดร้อน)",
    "แผ่นยิปซัม SCG ตราช้าง ขอบลาด หนา 9 มม. + โครงพลัสไลน์",
    "ไม้ระแนงฝ้า SCG Smartwood"
  ]
};

function cleanAndParseJSON(rawText) {
  if (!rawText) throw new Error("Empty response");
  let cleaned = rawText.trim();
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    cleaned = match[1].trim();
  }
  return JSON.parse(cleaned);
}

document.addEventListener("DOMContentLoaded", async () => {
  await openDatabase();
  const savedKey = localStorage.getItem("GEMINI_API_KEY");
  if (savedKey) {
    document.getElementById("apiKey").value = savedKey;
  }
  setupSlopeFactorListener();
  autoAdjustDefaultSlope();

  const projects = await getAllProjectsFromDB();
  if (projects.length > 0) {
    projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    loadProjectIntoUI(projects[0]);
  }
});

function saveApiKey() {
  const key = document.getElementById("apiKey").value.trim();
  if (key) {
    localStorage.setItem("GEMINI_API_KEY", key);
    alert("บันทึก API Key เรียบร้อยแล้ว");
  }
}

function getSlopeMultiplier(degrees) {
  const deg = parseFloat(degrees) || 0;
  if (deg <= 0) return 1.0;
  const radians = (deg * Math.PI) / 180;
  const cosVal = Math.cos(radians);
  return cosVal > 0 ? (1.0 / cosVal) : 1.0;
}

function setupSlopeFactorListener() {
  const input = document.getElementById("roofSlopeDeg");
  const label = document.getElementById("slopeFactorLabel");
  const warning = document.getElementById("slopeWarning");
  const updateLabel = () => {
    const roofChoice = document.getElementById("roofOption").value;
    const minDeg = SCG_ROOF_MIN_SLOPE[roofChoice] !== undefined ? SCG_ROOF_MIN_SLOPE[roofChoice] : 0.3;
    const currentDeg = parseFloat(input.value) || 0;
    const mult = getSlopeMultiplier(currentDeg);
    label.innerText = `(ขั้นต่ำ: ${minDeg}° | ตัวคูณ: ${mult.toFixed(3)})`;
    if (currentDeg < minDeg) {
      warning.style.display = "block";
      warning.innerText = `⚠️ องศา ${currentDeg}° ต่ำกว่าเกณฑ์มาตรฐาน SCG (ขั้นต่ำ ${minDeg}°) เสี่ยงน้ำไหลย้อนซึม`;
    } else {
      warning.style.display = "none";
    }
  };
  input.addEventListener("input", updateLabel);
}

function autoAdjustDefaultSlope() {
  const roofChoice = document.getElementById("roofOption").value;
  const minDeg = SCG_ROOF_MIN_SLOPE[roofChoice] !== undefined ? SCG_ROOF_MIN_SLOPE[roofChoice] : 0.3;
  const slopeInput = document.getElementById("roofSlopeDeg");
  const modalSlopeInput = document.getElementById("modalSlopeDeg");
  const modalMinLabel = document.getElementById("modalSlopeMinLabel");
  slopeInput.value = minDeg;
  if (modalSlopeInput) modalSlopeInput.value = minDeg;
  if (modalMinLabel) modalMinLabel.innerText = `(ขั้นต่ำ: ${minDeg}°)`;
  const label = document.getElementById("slopeFactorLabel");
  const warning = document.getElementById("slopeWarning");
  const mult = getSlopeMultiplier(minDeg);
  label.innerText = `(ขั้นต่ำ: ${minDeg}° | ตัวคูณ: ${mult.toFixed(3)})`;
  if (warning) warning.style.display = "none";
}

function populateProductDropdown(category, currentProduct) {
  const select = document.getElementById("drawProductSelect");
  select.innerHTML = "";
  let key = "งานหลังคา";
  if (category.includes("สันหลังคา") || category.includes("Dry Tech")) key = "งานสันหลังคา/ตะเข้สัน (SCG Dry Tech)";
  else if (category.includes("ฉนวนใต้หลังคา") || category.includes("FSO")) key = "งานฉนวนใต้หลังคา (SCG FSO)";
  else if (category.includes("ฉนวนปูเหนือฝ้า") || category.includes("STAY COOL")) key = "งานฉนวนปูเหนือฝ้า (STAY COOL)";
  else if (category.includes("หลังคา")) key = "งานหลังคา";
  else if (category.includes("โครงสร้าง") || category.includes("คอนกรีต") || category.includes("CPAC") || category.includes("Hollow") || category.includes("Post")) key = "งานโครงสร้างและคอนกรีต CPAC";
  else if (category.includes("ไม้")) key = "งานไม้สังเคราะห์/ตกแต่ง";
  else if (category.includes("ผนัง")) key = "งานผนัง";
  else if (category.includes("พื้น")) key = "งานพื้น";
  else if (category.includes("ฝ้า") || category.includes("เพดาน")) key = "งานฝ้าเพดาน";
  const products = SCG_PRODUCT_CATALOG[key] || SCG_PRODUCT_CATALOG["งานหลังคา"];
  let matched = false;
  products.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.innerText = p;
    if (currentProduct && p.toLowerCase().includes(currentProduct.toLowerCase().slice(0, 10))) {
      opt.selected = true;
      matched = true;
    }
    select.appendChild(opt);
  });
  if (!matched && currentProduct) {
    const customOpt = document.createElement("option");
    customOpt.value = currentProduct;
    customOpt.innerText = currentProduct;
    customOpt.selected = true;
    select.insertBefore(customOpt, select.firstChild);
  }
  onProductSelectChanged();
}

function onProductSelectChanged() {
  const prod = (document.getElementById("drawProductSelect").value || "").toLowerCase();
  const measureSelect = document.getElementById("measureTypeSelect");
  const isLinearProduct = prod.includes("เชิงชาย") || prod.includes("บัว") || prod.includes("ครอบ") || prod.includes("รางน้ำ") || prod.includes("dry tech");
  if (isLinearProduct) {
    measureSelect.value = "perimeter";
  }
  const cat = document.getElementById("drawCategorySelect").value;
  const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech"));
  if (isRoofRelated) {
    const minSlope = getMinSlopeFromProductName(prod);
    const modalSlopeInput = document.getElementById("modalSlopeDeg");
    const modalMinLabel = document.getElementById("modalSlopeMinLabel");
    modalSlopeInput.value = minSlope;
    if (modalMinLabel) modalMinLabel.innerText = `(ขั้นต่ำ: ${minSlope}°)`;
    document.getElementById("roofSlopeDeg").value = minSlope;
    const mult = getSlopeMultiplier(minSlope);
    document.getElementById("slopeFactorLabel").innerText = `(ขั้นต่ำ: ${minSlope}° | ตัวคูณ: ${mult.toFixed(3)})`;
    document.getElementById("slopeWarning").style.display = "none";
    measuredShapes.forEach(shape => {
      shape.slopeDeg = minSlope;
      shape.slopeAreaM = shape.flatAreaM * mult;
    });
  }
  onMeasureTypeChanged();
}

function onMeasureTypeChanged() {
  updateBoxCounter();
  redrawCanvas();
}

function onRoofShapeChanged() {
  updateBoxCounter();
  redrawCanvas();
}

function onCategoryChangedInDrawModal() {
  const cat = document.getElementById("drawCategorySelect").value;
  const slopeContainer = document.getElementById("modalSlopeContainer");
  const roofShapeContainer = document.getElementById("roofShapeContainer");
  const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech"));
  slopeContainer.style.display = isRoofRelated ? "inline-flex" : "none";
  roofShapeContainer.style.display = cat.includes("หลังคา") ? "inline-flex" : "none";
  populateProductDropdown(cat, null);
}

function onModalSlopeChanged() {
  const modalSlope = parseFloat(document.getElementById("modalSlopeDeg").value) || 0;
  document.getElementById("roofSlopeDeg").value = modalSlope;
  const prod = document.getElementById("drawProductSelect").value;
  const minSlope = getMinSlopeFromProductName(prod);
  const mult = getSlopeMultiplier(modalSlope);
  const label = document.getElementById("slopeFactorLabel");
  const warning = document.getElementById("slopeWarning");
  label.innerText = `(ขั้นต่ำ: ${minSlope}° | ตัวคูณ: ${mult.toFixed(3)})`;
  if (modalSlope < minSlope) {
    warning.style.display = "block";
    warning.innerText = `⚠️ องศา ${modalSlope}° ต่ำกว่าเกณฑ์มาตรฐาน SCG (ขั้นต่ำ ${minSlope}°)`;
  } else {
    warning.style.display = "none";
  }
  const cat = document.getElementById("drawCategorySelect").value;
  const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech"));
  if (isRoofRelated) {
    measuredShapes.forEach(shape => {
      shape.slopeDeg = modalSlope;
      shape.slopeAreaM = shape.flatAreaM * mult;
    });
    updateBoxCounter();
    redrawCanvas();
  }
}

async function onFileSelected() {
  const file = document.getElementById("planFile").files[0];
  if (file) {
    const planInput = document.getElementById("metaPlanFileName");
    if (planInput) {
      planInput.value = file.name;
    }
    const currentPrj = document.getElementById("metaProjectName").value;
    const currentCust = document.getElementById("metaCustomerName").value;
    updateActiveBarDisplay(currentPrj, currentCust, file.name);

    await loadPlanDocument(file);
    document.getElementById("drawBtn").disabled = false;
  }
}

function fileToGenerativePart(file) {
  return new Promise((resolve, reject) => {
    let mimeType = file.type;
    if (!mimeType && file.name.toLowerCase().endsWith(".pdf")) {
      mimeType = "application/pdf";
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64Data = reader.result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: mimeType || "application/octet-stream"
        }
      });
    };
    reader.onerror = error => reject(error);
  });
}

async function loadPlanDocument(file) {
  currentUploadedFile = file;
  pdfDocumentInstance = null;
  singleImageInstance = null;
  detectedTotalPages = 1;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const arrayBuffer = await file.arrayBuffer();
    pdfDocumentInstance = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    detectedTotalPages = pdfDocumentInstance.numPages;
  } else {
    const dataUrl = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(file);
    });
    singleImageInstance = new Image();
    singleImageInstance.src = dataUrl;
    await singleImageInstance.decode();
    detectedTotalPages = 1;
  }
}

async function getPageImage(pageNum) {
  if (pdfDocumentInstance) {
    const pageIndex = Math.min(Math.max(1, pageNum || 1), pdfDocumentInstance.numPages);
    const page = await pdfDocumentInstance.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      background: 'rgb(255, 255, 255)'
    }).promise;
    const img = new Image();
    img.src = canvas.toDataURL("image/jpeg", 0.95);
    await img.decode();
    return { image: img, page: pageIndex, total: pdfDocumentInstance.numPages };
  } else if (singleImageInstance) {
    return { image: singleImageInstance, page: 1, total: 1 };
  }
  return null;
}

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
        <div class="order-item-row">
          <span class="order-item-icon">📦</span>
          <span class="order-item-text">${cleanItem}</span>
        </div>
      `;
    }
  });
  html += `</div>`;
  return html;
}

function toggleCustomScopeMode() {
  const isSingle = document.getElementById("scopeSinglePageRadio").checked;
  document.getElementById("customPageSelectContainer").style.display = isSingle ? "block" : "none";
}

function openCustomItemModal() {
  const pageSelect = document.getElementById("customItemPageSelect");
  pageSelect.innerHTML = "";
  const totalPages = detectedTotalPages || (pdfDocumentInstance ? pdfDocumentInstance.numPages : 1);
  for (let i = 1; i <= totalPages; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.innerText = `หน้า ${i}`;
    pageSelect.appendChild(opt);
  }
  document.getElementById("scopeAllPagesRadio").checked = true;
  toggleCustomScopeMode();
  document.getElementById("customItemTextInput").value = "";
  document.getElementById("customItemStatus").innerText = "";
  document.getElementById("customItemModal").style.display = "flex";
}

async function submitCustomItemRow() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const instructionText = document.getElementById("customItemTextInput").value.trim();
  const isAllPages = document.getElementById("scopeAllPagesRadio").checked;
  const selectedPageVal = document.getElementById("customItemPageSelect").value;
  const pageNum = isAllPages ? 1 : (parseInt(selectedPageVal) || 1);
  const category = document.getElementById("customItemCategorySelect").value;
  const statusElem = document.getElementById("customItemStatus");
  const submitBtn = document.getElementById("btnSubmitCustomItem");
  const planFile = document.getElementById("planFile").files[0];
  const specFile = document.getElementById("specFile").files[0];
  if (!apiKey) {
    alert("กรุณากรอกและบันทึก Gemini API Key ก่อน");
    return;
  }
  if (!instructionText) {
    alert("กรุณาระบุรายละเอียดหรือความต้องการเฉพาะเจาะจง");
    return;
  }
  submitBtn.disabled = true;
  if (isAllPages) {
    statusElem.innerText = `Gemini 3.5 Flash Lite กำลังสแกนหา "${category}" และจับคู่สัญลักษณ์ Schedule เป็นภาษาไทยจากแบบแปลนครบทุกหน้า...`;
  } else {
    statusElem.innerText = `กำลังวิเคราะห์คำสั่งเฉพาะเจาะจงสำหรับหน้า ${pageNum} เป็นภาษาไทย...`;
  }
  try {
    const parts = [];
    if (planFile) {
      const planPart = await fileToGenerativePart(planFile);
      parts.push(planPart);
    }
    if (specFile) {
      const specPart = await fileToGenerativePart(specFile);
      parts.push(specPart);
    }
    let promptText = "";
    if (isAllPages) {
      promptText = `
### บทบาทและข้อกำหนดภาษา (บังคับภาษาไทย 100%):
ท่านคือวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC
ข้อมูลข้อความทุกช่อง (ยกเว้นรหัสสัญลักษณ์ เช่น △1, △5, F1, HC หรือชื่อแบรนด์ SCG, CPAC, Q-CON) ต้องเขียนเป็น "ภาษาไทยล้วน 100%"
### ขอบเขตและงาน:
จงสแกนตรวจสอบแบบแปลนทุกหน้า (หน้า 1 ถึง ${detectedTotalPages}) เพื่อถอดแบบและประมาณราคาตามคำสั่งเฉพาะเจาะจงนี้:
"""
หมวดงาน: ${category}
คำสั่งเฉพาะเจาะจง: ${instructionText}
"""
### กฎการตอบกลับ:
1. สำหรับทุกชั้น/โซนที่พบหมวดงานหรือสัญลักษณ์นี้ ให้สร้างเป็นรายการแยกแถวใน Array
2. ระบุเลขหน้าที่พบจริงลงใน "source_location.page_number"
3. ใน "order_estimate" ให้แจกแจงรายการสินค้าสั่งซื้อและอุปกรณ์แพ็กเกจระบบเป็นภาษาไทย แต่ละบรรทัดขึ้นต้นด้วย "- "
4. ใน "calculation_note" และ "verification_method" ให้อธิบายสูตรและการคำนวณเป็นภาษาไทย
5. ส่งออกเฉพาะ JSON Array
`;
    } else {
      promptText = `
### บทบาทและข้อกำหนดภาษา (บังคับภาษาไทย 100%):
ท่านคือวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC
ข้อมูลข้อความทุกช่องต้องเป็น "ภาษาไทยล้วน 100%"
### ขอบเขตและงาน:
เพิ่มรายการเฉพาะเจาะจงลงในตาราง BOQ สำหรับแปลนหน้า ${pageNum} ตามคำสั่งนี้:
"""
หมวดงาน: ${category}
คำสั่งเฉพาะเจาะจง: ${instructionText}
อ้างอิงหน้าแปลน: หน้า ${pageNum}
"""
### กฎการตอบกลับ:
1. สกัด item_name, net_quantity (พร้อมหน่วยภาษาไทย), และสินค้า SCG/CPAC ที่เหมาะสมที่สุด
2. ใส่รหัสสัญลักษณ์ในแบบ (ถ้ามี) ลงใน "code_ref"
3. ใน "order_estimate" แจกแจงรายการสินค้าและอุปกรณ์เสริมเป็นภาษาไทย แต่ละบรรทัดขึ้นต้นด้วย "- "
4. ส่งออกเฉพาะ JSON Object
`;
    }
    parts.unshift({ text: promptText });
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: "ท่านคือวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC ข้อความและข้อมูลทุกช่องในตารางต้องเป็นภาษาไทยล้วน 100% ตอบกลับด้วยรูปแบบ JSON เท่านั้น"
          }]
        },
        contents: [{ parts: parts }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });
    if (!response.ok) throw new Error("API Connection Error");
    const data = await response.json();
    const rawContent = data.candidates[0].content.parts[0].text;
    const parsedResult = cleanAndParseJSON(rawContent);
    let itemsToAdd = [];
    if (Array.isArray(parsedResult)) {
      itemsToAdd = parsedResult;
    } else if (parsedResult && typeof parsedResult === 'object') {
      itemsToAdd = [parsedResult];
    }
    itemsToAdd.forEach((item, idx) => {
      item._id = "item_" + Date.now() + "_" + idx + "_" + Math.floor(Math.random() * 1000);
      item.value_mb = item.value_mb !== undefined ? parseFloat(item.value_mb) : 0;
      item.is_manual_modified = true;
      lastRawBOQItems.push(item);
    });
    lastRawBOQItems.sort((a, b) => {
      const pA = (a.source_location && a.source_location.page_number) ? a.source_location.page_number : 1;
      const pB = (b.source_location && b.source_location.page_number) ? b.source_location.page_number : 1;
      return pA - pB;
    });
    renderBOQTable(lastRawBOQItems);
    statusElem.innerText = `✅ เพิ่มรายการเฉพาะเจาะจง (${itemsToAdd.length} รายการ) สำเร็จ!`;
    setTimeout(() => {
      closeModal("customItemModal");
    }, 900);
  } catch (err) {
    statusElem.innerText = "เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง";
  } finally {
    submitBtn.disabled = false;
  }
}

async function processDocuments() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const planFile = document.getElementById("planFile").files[0];
  const sectionFile = document.getElementById("sectionFile").files[0];
  const specFile = document.getElementById("specFile").files[0];
  const customInstruction = document.getElementById("customInstructionPrompt").value.trim();
  const concreteChoice = document.getElementById("concreteOption").value;
  const roofChoice = document.getElementById("roofOption").value;
  const ceilingInsChoice = document.getElementById("ceilingInsulationOption").value;
  const roofInsChoice = document.getElementById("roofInsulationOption").value;
  const wallChoice = document.getElementById("wallOption").value;
  const floorChoice = document.getElementById("floorOption").value;
  const ceilingChoice = document.getElementById("ceilingOption").value;
  const woodChoice = document.getElementById("woodOption").value;
  const slopeDeg = document.getElementById("roofSlopeDeg").value;
  const statusDiv = document.getElementById("status");
  const btn = document.getElementById("processBtn");
  const recalcBtn = document.getElementById("recalcBtn");
  if (!apiKey) {
    alert("กรุณากรอกและบันทึก Gemini API Key ก่อน");
    return;
  }
  if (!planFile) {
    alert("กรุณาเลือกไฟล์แบบแปลนพื้น (Floor Plan)");
    return;
  }
  btn.disabled = true;
  recalcBtn.disabled = true;
  statusDiv.innerText = "กำลังประมวลผลไฟล์และตรวจนับจำนวนหน้าทั้งหมด...";
  try {
    await loadPlanDocument(planFile);
    document.getElementById("drawBtn").disabled = false;
    const parts = [];
    const planPart = await fileToGenerativePart(planFile);
    parts.push(planPart);
    if (sectionFile) {
      statusDiv.innerText = "กำลังอ่านแบบรูปตัด/รูปด้าน (Section & Elevation)...";
      const secPart = await fileToGenerativePart(sectionFile);
      parts.push(secPart);
    }
    if (specFile) {
      statusDiv.innerText = "กำลังอ่านรายการประกอบแบบ / ตารางสัญลักษณ์ Schedule ...";
      const specPart = await fileToGenerativePart(specFile);
      parts.push(specPart);
    }
    statusDiv.innerText = `Gemini 3.5 Flash Lite กำลังสแกนทุกผังและจับคู่สัญลักษณ์ Schedule เป็นภาษาไทยในเอกสารทั้งหมด ${detectedTotalPages} หน้า...`;
    let customDirective = "";
    if (customInstruction) {
      customDirective = `\n### คำสั่งเน้นย้ำของผู้ใช้งาน:\n"""\n${customInstruction}\n"""\n`;
    }
    const promptText = `
### กฎเหล็กด้านภาษา (MANDATORY THAI LANGUAGE RULE):
ท่านคือหัวหน้าวิศวกรผู้เชี่ยวชาญการถอดแบบและประมาณราคา (Chief QS) ของ SCG และ CPAC
ข้อมูลและคำอธิบายทุกช่องในตาราง BOQ ต้องเขียนเป็น "ภาษาไทยล้วน 100%"
### งานที่ต้องปฏิบัติ:
วิเคราะห์แบบสถาปัตย์ แบบโครงสร้าง และแบบรูปตัด/รูปด้าน ทั้งหมด ${detectedTotalPages} หน้า พร้อมตรวจสอบสอบทาน 3 มิติ เพื่อจัดทำรายการประมาณการวัสดุ BOQ สินค้า SCG และคอนกรีต CPAC อย่างละเอียดและแม่นยำ
${customDirective}
### สเปกวัสดุที่ผู้ใช้เลือก:
1. หมวดคอนกรีตและโครงสร้าง CPAC: "${concreteChoice}"
2. หมวดหลังคา: "${roofChoice}" (ความชัน: ${slopeDeg} องศา)
3. หมวดฉนวนปูเหนือฝ้า: "${ceilingInsChoice}"
4. หมวดฉนวนใต้หลังคา: "${roofInsChoice}"
5. ผนัง: "${wallChoice}", พื้น: "${floorChoice}", ฝ้า: "${ceilingChoice}", ไม้ตกแต่ง: "${woodChoice}"
### รูปแบบผลลัพธ์ (ภาษาไทยล้วน 100%):
ส่งออกเฉพาะ JSON Array ที่ถูกต้องตามโครงสร้างนี้:
[
  {
    "category": "หมวดงานภาษาไทย เช่น งานผนัง, งานหลังคา, งานโครงสร้างและคอนกรีต CPAC",
    "code_ref": "รหัสสัญลักษณ์ เช่น △1, △5, F1, HC หรือรหัสอ้างอิงในแบบ",
    "item_name": "ชื่อรายการงานตามแบบแปลน/ตารางสัญลักษณ์ภาษาไทย (ระบุชั้น/ห้อง/โซน)",
    "net_quantity": "ปริมาณพร้อมหน่วยภาษาไทย เช่น 120.50 ตร.ม. หรือ 45.00 ม.",
    "scg_product": "ชื่อสินค้า SCG หรือ CPAC ที่แนะนำ",
    "order_estimate": "- รายการสินค้าหลัก 1 พร้อมจำนวนและหน่วย\\n- อุปกรณ์ส่วนควบระบบ 2",
    "confidence_score": 98,
    "calculation_note": "สูตรคำนวณและสัดส่วนเผื่อเศษเป็นภาษาไทย",
    "verification_method": "ที่มาการคำนวณและการ Cross-Check 3D เป็นภาษาไทย",
    "source_location": {
      "page_number": 1,
      "box_2d": [100, 100, 900, 900],
      "location_description": "คำอธิบายตำแหน่งบนแบบแปลนหน้านั้นภาษาไทย"
    }
  }
]
`;
    parts.unshift({ text: promptText });
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: "ท่านคือหัวหน้าวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC ข้อความและข้อมูลทุกช่องในตารางต้องเป็นภาษาไทยล้วน 100% ส่งออกเฉพาะ JSON ล้วน"
          }]
        },
        contents: [{ parts: parts }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });
    if (!response.ok) throw new Error("API Connection Error");
    const data = await response.json();
    const rawContent = data.candidates[0].content.parts[0].text;
    const boqItems = cleanAndParseJSON(rawContent);
    boqItems.sort((a, b) => {
      const pA = (a.source_location && a.source_location.page_number) ? a.source_location.page_number : 1;
      const pB = (b.source_location && b.source_location.page_number) ? b.source_location.page_number : 1;
      return pA - pB;
    });
    boqItems.forEach((item, idx) => {
      item._id = "item_" + Date.now() + "_" + idx;
      item.value_mb = item.value_mb !== undefined ? parseFloat(item.value_mb) : 0;
    });
    lastRawBOQItems = boqItems;
    recalcBtn.disabled = false;
    renderBOQTable(lastRawBOQItems);
    statusDiv.innerText = `ประมวลผลสำเร็จเรียบร้อย! ถอดปริมาณงานได้ทั้งหมด ${boqItems.length} รายการเป็นภาษาไทย`;
  } catch (err) {
    statusDiv.innerText = "เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง";
  } finally {
    btn.disabled = false;
  }
}

async function recalculateWithNewSpecs() {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) {
    alert("กรุณาวิเคราะห์แบบแปลนก่อนอย่างน้อยหนึ่งครั้ง");
    return;
  }
  const apiKey = document.getElementById("apiKey").value.trim();
  const statusDiv = document.getElementById("status");
  const recalcBtn = document.getElementById("recalcBtn");
  const slopeDeg = document.getElementById("roofSlopeDeg").value;
  recalcBtn.disabled = true;
  statusDiv.innerText = "กำลังคำนวณปริมาณสินค้าใหม่ตามสเปกที่เลือกเป็นภาษาไทย...";
  try {
    const promptText = `
### คำสั่งคำนวณใหม่ (บังคับภาษาไทย 100%):
จงปรับปรุงสเปกสินค้า SCG & CPAC และคำนวณยอดสั่งซื้อใหม่สำหรับรายการ BOQ ที่มีอยู่เดิม โดยทุกข้อความต้องเป็น "ภาษาไทยล้วน 100%"
### รายการเดิม:
${JSON.stringify(lastRawBOQItems.map(it => ({
  _id: it._id,
  category: it.category,
  code_ref: it.code_ref,
  item_name: it.item_name,
  net_quantity: it.net_quantity,
  source_location: it.source_location
})), null, 2)}
### สเปกใหม่ที่เลือก:
- หมวดหลังคา: "${document.getElementById("roofOption").value}" (ความชัน: ${slopeDeg} องศา)
- หมวดฉนวนปูเหนือฝ้า: "${document.getElementById("ceilingInsulationOption").value}"
- หมวดฉนวนใต้หลังคา: "${document.getElementById("roofInsulationOption").value}"
- หมวดโครงสร้างคอนกรีต CPAC: "${document.getElementById("concreteOption").value}"
- หมวดผนัง: "${document.getElementById("wallOption").value}"
- หมวดพื้น: "${document.getElementById("floorOption").value}"
- หมวดฝ้าเพดาน: "${document.getElementById("ceilingOption").value}"
- หมวดไม้ตกแต่ง: "${document.getElementById("woodOption").value}"
### ข้อกำหนด:
1. คงลำดับแถวและ _id เดิมทั้งหมด
2. ใน "order_estimate" ให้แสดงรายการสั่งซื้อและอุปกรณ์เสริมเป็นภาษาไทย แต่ละรายการขึ้นต้นด้วย "- "
3. ส่งออกเฉพาะ JSON Array ที่ถูกต้อง
`;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "ท่านคือวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC ข้อความและข้อมูลทุกช่องต้องเป็นภาษาไทยล้วน 100% ตอบกลับด้วย JSON เท่านั้น" }]
        },
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });
    if (!response.ok) throw new Error("Recalculate Error");
    const data = await response.json();
    const rawContent = data.candidates[0].content.parts[0].text;
    const updatedItems = cleanAndParseJSON(rawContent);
    updatedItems.forEach((item, idx) => {
      const orig = lastRawBOQItems[idx];
      item._id = (orig && orig._id) ? orig._id : "item_" + Date.now() + "_" + idx;
      item.value_mb = (orig && orig.value_mb !== undefined) ? orig.value_mb : 0;
    });
    lastRawBOQItems = updatedItems;
    renderBOQTable(lastRawBOQItems);
    statusDiv.innerText = "คำนวณและอัปเดตสเปกสินค้าใหม่เป็นภาษาไทยสำเร็จ!";
  } catch (err) {
    statusDiv.innerText = "เกิดข้อผิดพลาดในการคำนวณใหม่ กรุณาลองอีกครั้ง";
  } finally {
    recalcBtn.disabled = false;
  }
}

function updateItemValue(id, val) {
  if (!lastRawBOQItems) return;
  const item = lastRawBOQItems.find(it => it._id === id);
  if (!item) return;
  const num = parseFloat(val);
  item.value_mb = !isNaN(num) && num >= 0 ? num : 0;
  updateTotalSummaryDisplay();
}

function updateTotalSummaryDisplay() {
  if (!lastRawBOQItems) return;
  const totalMB = lastRawBOQItems.reduce((sum, it) => sum + (parseFloat(it.value_mb) || 0), 0);
  const totalValElem = document.getElementById("totalProjectValueDisplay");
  const totalCountElem = document.getElementById("totalItemsCountDisplay");
  if (totalValElem) totalValElem.innerText = `${totalMB.toFixed(2)} MB`;
  if (totalCountElem) totalCountElem.innerText = `${lastRawBOQItems.length} รายการ`;
}

function renderBOQTable(items) {
  const tbody = document.getElementById("boqBody");
  tbody.innerHTML = "";
  if (!items || items.length === 0) {
    document.getElementById("resultCard").style.display = "none";
    return;
  }
  items.forEach((item) => {
    let badgeClass = "badge badge-other";
    const cat = item.category || "";
    if (cat.includes("หลังคา")) badgeClass = "badge badge-roof";
    else if (cat.includes("สันหลังคา") || cat.includes("Dry Tech")) badgeClass = "badge badge-roof";
    else if (cat.includes("ฉนวนใต้หลังคา") || cat.includes("FSO")) badgeClass = "badge badge-roof";
    else if (cat.includes("ฉนวนปูเหนือฝ้า") || cat.includes("STAY COOL")) badgeClass = "badge badge-insulation";
    else if (cat.includes("โครงสร้าง") || cat.includes("คอนกรีต") || cat.includes("CPAC") || cat.includes("Hollow") || cat.includes("Post")) badgeClass = "badge badge-concrete";
    else if (cat.includes("ไม้")) badgeClass = "badge badge-wood";
    else if (cat.includes("ผนัง")) badgeClass = "badge badge-wall";
    else if (cat.includes("พื้น")) badgeClass = "badge badge-floor";
    else if (cat.includes("ฝ้า") || cat.includes("เพดาน")) badgeClass = "badge badge-ceiling";
    else if (cat.includes("สุขาภิบาล") || cat.includes("ระบบ")) badgeClass = "badge badge-mep";

    const conf = typeof item.confidence_score === "number" ? item.confidence_score : 95;
    let confClass = "conf-high";
    let confIcon = "🟢";
    if (conf < 75) {
      confClass = "conf-low";
      confIcon = "🔴";
    } else if (conf < 88) {
      confClass = "conf-med";
      confIcon = "🟡";
    }

    const loc = item.source_location || {};
    const pageNum = loc.page_number || 1;
    const pageBadge = `<span class="page-indicator-badge">📄 หน้า ${pageNum}</span>`;
    const isModified = item.is_manual_modified ? "modified" : "";
    const manualBadge = item.is_manual_modified ? `<span class="manual-badge">📐 แก้ไขแล้ว</span>` : "";
    const hasCrossCheck = (item.verification_method || "").toLowerCase().includes("section") ||
                          (item.verification_method || "").includes("รูปตัด") ||
                          (item.verification_method || "").includes("ความสูง");
    const crossCheckBadge = hasCrossCheck ? `<div class="cross-check-tag">🔍 Cross-Checked 3D</div>` : "";
    const orderEstimateFormatted = formatOrderEstimateHTML(item.order_estimate);
    const itemVal = item.value_mb !== undefined && item.value_mb !== null ? item.value_mb : "";

    const row = document.createElement("tr");
    row.id = `boq-row-${item._id}`;
    row.innerHTML = `
      <td><span class="${badgeClass}">${item.category || "-"}</span></td>
      <td style="text-align: center;">${pageBadge}</td>
      <td style="font-weight: 700; color: #0284c7;">${item.code_ref || "-"}</td>
      <td>
        <div style="font-weight: 600; color: #0f172a;">${item.item_name || "-"}</div>
      </td>
      <td>
        <div class="edit-qty-wrapper">
          <input type="text" class="input-qty ${isModified}" id="qty-input-${item._id}" value="${item.net_quantity || ""}" onchange="updateNetQuantity('${item._id}', this.value)">
          ${manualBadge}
        </div>
      </td>
      <td style="white-space: nowrap; min-width: 170px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <input type="number" step="0.01" min="0" class="input-value-mb" id="val-input-${item._id}" value="${itemVal}" placeholder="0.00" onchange="updateItemValue('${item._id}', this.value)">
          <span style="font-size: 12px; font-weight: 800; color: #047857;">MB</span>
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
        <button class="btn-view" onclick="openInPlaceEditor('${item._id}')">🔍 ดู/แก้ไขในแบบ (หน้า ${pageNum})</button>
      </td>
      <td class="no-print" style="text-align: center;">
        <button class="btn-delete" title="ลบรายการนี้ออก" onclick="deleteBOQItem('${item._id}')">🗑️ ลบ</button>
      </td>
    `;
    tbody.appendChild(row);
  });
  updateTotalSummaryDisplay();
  document.getElementById("resultCard").style.display = "block";
}

function deleteBOQItem(id) {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) return;
  const targetItem = lastRawBOQItems.find(item => item._id === id);
  const itemName = targetItem ? (targetItem.item_name || "รายการนี้") : "รายการนี้";
  if (confirm(`คุณต้องการลบ "${itemName}" ออกจากตาราง BOQ ใช่หรือไม่?`)) {
    lastRawBOQItems = lastRawBOQItems.filter(item => item._id !== id);
    renderBOQTable(lastRawBOQItems);
  }
}

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
      const product = (item.scg_product || "").toLowerCase();
      let newEstimate = "";
      if (product.includes("dry tech") || product.includes("สันหลังคา")) {
        const tiles = Math.ceil(rawNum * 3.3 * 1.05);
        const dryRolls = Math.ceil((rawNum / 3.0) * 1.05);
        newEstimate = `- แผ่นครอบสันหลังคา: ${tiles} แผ่น\n- แผ่นรองใต้สันหลังคา SCG Dry Tech: ${dryRolls} ม้วน (3.0 ม./ม้วน)`;
      } else if (product.includes("hollow core") || product.includes("ฮอลโลว์คอร์")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        const toppingCubic = (rawNum * 0.05 * 1.05).toFixed(2);
        const wireMeshSqm = (rawNum * 1.10).toFixed(1);
        newEstimate = `- แผ่นพื้น CPAC Hollow Core: ${sqmAmt} ตร.ม.\n- คอนกรีตทับหน้า Topping หนา 5 ซม.: ${toppingCubic} คิว (ลบ.ม.)\n- ตะแกรงเหล็ก Wire Mesh: ${wireMeshSqm} ตร.ม. (เผื่อทาบ 10%)`;
      } else if (product.includes("prestige") || product.includes("เพรสทีจ") || product.includes("neustile") || product.includes("นิวสไตล์") || product.includes("cpac") || product.includes("ลอนคู่")) {
        const tiles = Math.ceil(rawNum * 11 * 1.05);
        newEstimate = `- กระเบื้องหลังคา: ${tiles} แผ่น (เผื่อเศษ 5%)`;
      } else if (product.includes("post-tension") || product.includes("โพสต์เทนชั่น")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        const strandKg = Math.round(rawNum * 4.0);
        newEstimate = `- พื้นคอนกรีตอัดแรง Post-tension: ${sqmAmt} ตร.ม.\n- ลวดสลิง PC Strand: ~${strandKg} กก.`;
      } else if (product.includes("คอนกรีตผสมเสร็จ") || product.includes("ready-mix")) {
        const cubic = (rawNum * 1.05).toFixed(2);
        newEstimate = `- คอนกรีตผสมเสร็จ CPAC: ${cubic} คิว (ลบ.ม.)`;
      } else if (product.includes("เชิงชาย") || product.includes("บัว")) {
        const pcs = Math.ceil((rawNum / 3.0) * 1.05);
        newEstimate = `- ไม้เชิงชาย SCG Smartwood: ${pcs} ท่อน (3.0 ม./ท่อน)`;
      } else if (product.includes("stay cool") || product.includes("สเตย์คูล")) {
        const rolls = Math.ceil((rawNum / 2.40) * 1.05);
        newEstimate = `- ฉนวนปูเหนือฝ้า SCG STAY COOL: ${rolls} ม้วน (ปูเหนือฝ้า 2.40 ตร.ม./ม้วน)`;
      } else if (product.includes("fso")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        newEstimate = `- ฉนวนใยแก้วใต้หลังคา SCG FSO: ${sqmAmt} ตร.ม.`;
      } else if (product.includes("สมาร์ทบอร์ด") || product.includes("smartboard") || product.includes("ยิปซัม")) {
        const sheets = Math.ceil((rawNum / 2.88) * 1.05);
        newEstimate = `- แผ่นบอร์ด: ${sheets} แผ่น`;
      } else if (product.includes("ไม้ฝา") || product.includes("siding")) {
        const planks = Math.ceil(rawNum * 2.22 * 1.05);
        newEstimate = `- ไม้ฝาตกแต่ง SCG Smartwood: ${planks} แผ่น`;
      } else if (product.includes("lumax") || product.includes("metal sheet") || product.includes("เมทัลชีท")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        newEstimate = `- แผ่นหลังคา Metal Sheet: ${sqmAmt} ตร.ม.`;
      }
      if (newEstimate) {
        item.order_estimate = newEstimate;
        const estElem = document.getElementById(`order-estimate-${id}`);
        if (estElem) estElem.innerHTML = formatOrderEstimateHTML(newEstimate);
      }
    }
  }
  const inputElem = document.getElementById(`qty-input-${id}`);
  if (inputElem) {
    inputElem.classList.add("modified");
  }
}

function closeModal(modalId) {
  stopAutoPanLoop();
  document.getElementById(modalId).style.display = "none";
}

window.onclick = function(event) {
  if (event.target.classList.contains("modal")) {
    closeModal(event.target.id);
  }
};

function exportExcel() {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) {
    alert("ไม่มีข้อมูลสำหรับส่งออก Excel");
    return;
  }
  const cust = document.getElementById("metaCustomerName").value || "ไม่ระบุลูกค้า";
  const prj = document.getElementById("metaProjectName").value || "ไม่ระบุโครงการ";
  const plan = document.getElementById("metaPlanFileName").value || "ไม่ระบุชื่อแบบ";
  const code = document.getElementById("metaProjectCode").value || "-";
  const totalMB = lastRawBOQItems.reduce((sum, it) => sum + (parseFloat(it.value_mb) || 0), 0);

  const excelData = lastRawBOQItems.map(row => {
    const page = (row.source_location && row.source_location.page_number) ? row.source_location.page_number : "-";
    const desc = (row.source_location && row.source_location.location_description) ? row.source_location.location_description : "-";
    const modifiedStatus = row.is_manual_modified ? "แก้ไขในแบบแล้ว" : "คำนวณอัตโนมัติ";
    const cleanEstimate = (row.order_estimate || "-").replace(/^[-•*]\s*/gm, '').replace(/\r?\n/g, " | ");
    return {
      "ชื่อโครงการ": prj,
      "ชื่อลูกค้า": cust,
      "ชื่อไฟล์แบบแปลน": plan,
      "รหัสโครงการ": code,
      "หมวดงาน": row.category || "-",
      "หน้าที่พบ": `หน้า ${page}`,
      "รหัสอ้างอิง/สัญลักษณ์": row.code_ref || "-",
      "รายการงานตามแบบ": row.item_name || "-",
      "ปริมาณสุทธิ": row.net_quantity || "-",
      "มูลค่า (MB)": row.value_mb !== undefined && row.value_mb !== null ? row.value_mb : 0,
      "สถานะ": modifiedStatus,
      "สินค้า SCG / CPAC ที่แนะนำ": row.scg_product || "-",
      "ประมาณการสั่งซื้อจริง": cleanEstimate,
      "ความมั่นใจ (%)": row.confidence_score || "-",
      "หมายเหตุและสูตรคำนวณ": row.calculation_note || "-",
      "การ Cross-Check และที่มาปริมาณ": row.verification_method || "-",
      "คำอธิบายตำแหน่งในแบบ": desc
    };
  });

  // แถวสรุปท้ายตาราง Excel
  excelData.push({
    "ชื่อโครงการ": "รวมมูลค่าโครงการทั้งหมด",
    "ชื่อลูกค้า": "",
    "ชื่อไฟล์แบบแปลน": "",
    "รหัสโครงการ": "",
    "หมวดงาน": "",
    "หน้าที่พบ": "",
    "รหัสอ้างอิง/สัญลักษณ์": "",
    "รายการงานตามแบบ": "",
    "ปริมาณสุทธิ": "",
    "มูลค่า (MB)": Number(totalMB.toFixed(2)),
    "สถานะ": "",
    "สินค้า SCG / CPAC ที่แนะนำ": "",
    "ประมาณการสั่งซื้อจริง": "",
    "ความมั่นใจ (%)": "",
    "หมายเหตุและสูตรคำนวณ": "",
    "การ Cross-Check และที่มาปริมาณ": "",
    "คำอธิบายตำแหน่งในแบบ": ""
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SCG_BOQ");
  const fileName = `SCG_BOQ_${cust}_${prj}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

function buildReportHTML() {
  const cust = document.getElementById("metaCustomerName").value || "ไม่ระบุชื่อลูกค้า";
  const prj = document.getElementById("metaProjectName").value || "โครงการทั่วไป";
  const plan = document.getElementById("metaPlanFileName").value || "ไม่ระบุชื่อแบบ";
  const code = document.getElementById("metaProjectCode").value || "-";
  const estimator = document.getElementById("metaEstimator").value || "-";
  const totalMB = lastRawBOQItems.reduce((sum, it) => sum + (parseFloat(it.value_mb) || 0), 0);

  const headerHTML = `
    <div style="border-bottom: 3px solid #dc2626; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <h2 style="margin: 0; color: #dc2626; font-size: 19px; font-weight: bold;">รายงานถอดแบบและประมาณการสั่งซื้อสินค้า SCG & คอนกรีต CPAC</h2>
        <div style="font-size: 13px; font-weight: bold; color: #0f172a; margin-top: 5px;">
          🏢 โครงการ: ${prj} | 👤 ลูกค้า: ${cust}
        </div>
        <div style="font-size: 12px; font-weight: 600; color: #0284c7; margin-top: 3px;">
          📄 แบบแปลนอ้างอิง: ${plan}
        </div>
        <div style="font-size: 11px; color: #64748b; margin-top: 3px;">
          รหัสโครงการ: ${code} | ผู้ประมาณราคา: ${estimator}
        </div>
      </div>
      <div style="text-align: right; font-size: 11px; color: #475569; line-height: 1.4;">
        <div style="font-size: 14px; font-weight: 800; color: #047857;">💰 มูลค่ารวมโครงการ: ${totalMB.toFixed(2)} MB</div>
        <div style="margin-top: 3px;"><strong>วันที่ออกรายงาน:</strong> ${new Date().toLocaleDateString('th-TH')}</div>
        <div><strong>จำนวนรายการทั้งหมด:</strong> ${lastRawBOQItems.length} รายการ</div>
      </div>
    </div>
  `;
  let rowsHTML = "";
  lastRawBOQItems.forEach((row, i) => {
    const page = (row.source_location && row.source_location.page_number) ? row.source_location.page_number : "-";
    const cleanEstimate = (row.order_estimate || "-")
      .split(/\r?\n/)
      .map(s => s.trim().replace(/^[-•*]\s*/, ''))
      .filter(s => s.length > 0)
      .map(s => `• ${s}`)
      .join("<br>");
    const valText = row.value_mb !== undefined && row.value_mb !== null && row.value_mb > 0 ? Number(row.value_mb).toFixed(2) + " MB" : "-";
    rowsHTML += `
      <tr style="border-bottom: 1px solid #cbd5e1; font-size: 10px; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'}; page-break-inside: avoid;">
        <td style="padding: 6px 8px; font-weight: bold; color: #b91c1c; vertical-align: top;">${row.category || "-"}</td>
        <td style="padding: 6px 8px; text-align: center; font-weight: bold; vertical-align: top;">หน้า ${page}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: #0284c7; vertical-align: top;">${row.code_ref || "-"}</td>
        <td style="padding: 6px 8px; font-weight: bold; vertical-align: top;">${row.item_name || "-"}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: #0284c7; vertical-align: top;">${row.net_quantity || "-"}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: #047857; text-align: right; vertical-align: top;">${valText}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: #b91c1c; vertical-align: top;">${row.scg_product || "-"}</td>
        <td style="padding: 6px 8px; line-height: 1.35; vertical-align: top;">${cleanEstimate}</td>
        <td style="padding: 6px 8px; color: #475569; line-height: 1.3; vertical-align: top;">${row.calculation_note || "-"}</td>
        <td style="padding: 6px 8px; color: #0369a1; font-size: 9px; line-height: 1.3; vertical-align: top;">${row.verification_method || "-"}</td>
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
          <th style="padding: 8px; text-align: right; min-width: 130px;">มูลค่า (MB)</th>
          <th style="padding: 8px;">สินค้าแนะนำ</th>
          <th style="padding: 8px;">ประมาณการสั่งซื้อจริง</th>
          <th style="padding: 8px;">หมายเหตุ/สูตรคำนวณ</th>
          <th style="padding: 8px;">ที่มาการ Cross-Check</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML}
      </tbody>
      <tfoot>
        <tr style="background: #e2e8f0; font-size: 11px; font-weight: bold;">
          <td colspan="5" style="padding: 8px; text-align: right;">รวมมูลค่าโครงการทั้งหมด:</td>
          <td style="padding: 8px; text-align: right; color: #047857;">${totalMB.toFixed(2)} MB</td>
          <td colspan="4" style="padding: 8px;"></td>
        </tr>
      </tfoot>
    </table>
  `;
  return headerHTML + tableHTML;
}

function openPdfPreviewModal() {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) {
    alert("ไม่มีข้อมูลสำหรับแสดงรายงาน PDF");
    return;
  }
  const paper = document.getElementById("a4ReportPaper");
  paper.innerHTML = buildReportHTML();
  document.getElementById("pdfPreviewModal").style.display = "flex";
}

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
      <title>SCG_CPAC_BOQ_Report_${new Date().toISOString().slice(0,10)}</title>
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
        tfoot {
          display: table-footer-group;
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

function exportJSON() {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) {
    alert("ไม่มีข้อมูลสำหรับส่งออก JSON");
    return;
  }
  const cust = document.getElementById("metaCustomerName").value || "ไม่ระบุลูกค้า";
  const prj = document.getElementById("metaProjectName").value || "ไม่ระบุโครงการ";
  const plan = document.getElementById("metaPlanFileName").value || "ไม่ระบุชื่อแบบ";

  const projectSnapshot = {
    exportDate: new Date().toISOString(),
    version: "3.5-lite",
    meta: {
      customerName: cust,
      projectName: prj,
      planFileName: plan,
      projectCode: document.getElementById("metaProjectCode").value,
      estimatorName: document.getElementById("metaEstimator").value
    },
    settings: {
      concreteOption: document.getElementById("concreteOption").value,
      roofOption: document.getElementById("roofOption").value,
      roofSlopeDeg: document.getElementById("roofSlopeDeg").value,
      ceilingInsulationOption: document.getElementById("ceilingInsulationOption").value,
      roofInsulationOption: document.getElementById("roofInsulationOption").value,
      wallOption: document.getElementById("wallOption").value,
      floorOption: document.getElementById("floorOption").value,
      ceilingOption: document.getElementById("ceilingOption").value,
      woodOption: document.getElementById("woodOption").value,
      customInstructionPrompt: document.getElementById("customInstructionPrompt").value
    },
    items: lastRawBOQItems
  };
  const jsonString = JSON.stringify(projectSnapshot, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SCG_BOQ_${cust}_${prj}_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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
        if (imported.meta) {
          if (imported.meta.customerName) document.getElementById("metaCustomerName").value = imported.meta.customerName;
          if (imported.meta.projectName) document.getElementById("metaProjectName").value = imported.meta.projectName;
          if (imported.meta.planFileName) document.getElementById("metaPlanFileName").value = imported.meta.planFileName;
          if (imported.meta.projectCode) document.getElementById("metaProjectCode").value = imported.meta.projectCode;
          if (imported.meta.estimatorName) document.getElementById("metaEstimator").value = imported.meta.estimatorName;
          updateActiveBarDisplay(imported.meta.projectName, imported.meta.customerName, imported.meta.planFileName);
        }
        if (imported.settings) {
          const s = imported.settings;
          if (s.concreteOption) document.getElementById("concreteOption").value = s.concreteOption;
          if (s.roofOption) document.getElementById("roofOption").value = s.roofOption;
          if (s.roofSlopeDeg) document.getElementById("roofSlopeDeg").value = s.roofSlopeDeg;
          if (s.ceilingInsulationOption) document.getElementById("ceilingInsulationOption").value = s.ceilingInsulationOption;
          if (s.roofInsulationOption) document.getElementById("roofInsulationOption").value = s.roofInsulationOption;
          if (s.wallOption) document.getElementById("wallOption").value = s.wallOption;
          if (s.floorOption) document.getElementById("floorOption").value = s.floorOption;
          if (s.ceilingOption) document.getElementById("ceilingOption").value = s.ceilingOption;
          if (s.woodOption) document.getElementById("woodOption").value = s.woodOption;
          if (s.customInstructionPrompt) document.getElementById("customInstructionPrompt").value = s.customInstructionPrompt;
          setupSlopeFactorListener();
        }
      } else {
        throw new Error("โครงสร้างไฟล์ JSON ไม่ถูกต้อง");
      }
      itemsToLoad.forEach((item, idx) => {
        if (!item._id) item._id = "item_" + Date.now() + "_" + idx;
        item.value_mb = item.value_mb !== undefined ? parseFloat(item.value_mb) : 0;
      });
      lastRawBOQItems = itemsToLoad;
      document.getElementById("recalcBtn").disabled = false;
      renderBOQTable(lastRawBOQItems);
      document.getElementById("status").innerText = `✅ นำเข้าข้อมูลสำเร็จแล้ว (${lastRawBOQItems.length} รายการ)`;
      alert(`นำเข้าข้อมูลเรียบร้อยแล้ว (${lastRawBOQItems.length} รายการ)`);
    } catch (err) {
      alert("ไม่สามารถอ่านไฟล์ JSON ได้ กรุณาตรวจสอบความถูกต้องของไฟล์");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}
