/* ==========================================================================
   SCG AI BOQ & Concrete Structure Estimator - AI Service Logic
   File: ai-service.js
   Model: gemini-3.5-flash-lite
   ========================================================================== */

// ฟังก์ชันแปลงไฟล์เป็น Base64 สำหรับส่งให้กับ Gemini API
async function fileToGenerativePart(file) {
  const base64EncodedDataPromise = new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type
    }
  };
}

// ฟังก์ชันทำความสะอาดข้อความและ Parse ข้อมูล JSON จาก AI ให้ถูกต้อง
function cleanAndParseJSON(rawContent) {
  try {
    let cleaned = rawContent.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parsing Error:", e, rawContent);
    throw new Error("รูปแบบข้อมูล JSON จาก AI ไม่ถูกต้อง");
  }
}

// ฟังก์ชันเรียก Gemini API (gemini-3.5-flash-lite) เพื่อวิเคราะห์ปริมาณวัสดุจากการวัดขนาด
async function requestAiEstimation(parts, promptText, category, chosenUnit, chosenValue, chosenProduct, pageNum, auditSummary, mainBox, wasteFactor = "5%") {
  const apiKey = document.getElementById("apiKey").value.trim();
  const statusElem = document.getElementById("statusElem");
  if (!apiKey) {
    alert("กรุณากรอกและบันทึก Gemini API Key ก่อน");
    return;
  }

  parts.unshift({ text: promptText });
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: "ท่านคือวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC ข้อมูลข้อความทุกช่องต้องแสดงเป็นภาษาไทยล้วน 100% ตอบกลับด้วย JSON เท่านั้น"
          }]
        },
        contents: [{ parts: parts }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) throw new Error("API Connection Error");
    const data = await response.json();
    const rawContent = data.candidates[0].content.parts[0].text;
    const result = cleanAndParseJSON(rawContent);

    if (editingItemId) {
      const item = lastRawBOQItems.find(it => it._id === editingItemId);
      if (item) {
        item.category = category;
        item.net_quantity = `${chosenValue.toFixed(2)} ${chosenUnit}`;
        item.scg_product = chosenProduct;
        item.order_estimate = result.order_estimate;
        item.calculation_note = result.calculation_note;
        item.verification_method = auditSummary;
        item.confidence_score = 99;
        item.is_manual_modified = true;
        item.source_location = {
          page_number: pageNum,
          box_2d: mainBox,
          location_description: `วัดขนาดด้วย Geometry/Polygon Tool และเลือกสินค้า "${chosenProduct}" บนหน้า ${pageNum}`
        };
      }
      if (statusElem) statusElem.innerText = `✅ อัปเดตรายการ "${item ? item.item_name : ''}" บนหน้า ${pageNum} สำเร็จ!`;
    } else {
      const newItem = {
        _id: "item_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
        category: category,
        code_ref: `Geometry (${chosenUnit})`,
        item_name: `วัดปริมาณในแบบ (${category} - หน้า ${pageNum})`,
        net_quantity: `${chosenValue.toFixed(2)} ${chosenUnit}`,
        scg_product: chosenProduct,
        order_estimate: result.order_estimate,
        confidence_score: 99,
        calculation_note: result.calculation_note,
        verification_method: auditSummary,
        source_location: {
          page_number: pageNum,
          box_2d: mainBox,
          location_description: `วัดขนาดด้วย Geometry/Polygon Tool บนหน้า ${pageNum}`
        }
      };
      lastRawBOQItems.push(newItem);
      if (statusElem) statusElem.innerText = `✅ เพิ่มรายการใหม่สำเร็จ!`;
    }
    renderBOQTable(lastRawBOQItems);
  } catch (err) {
    if (statusElem) statusElem.innerText = "เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง";
  }
}

// ฟังก์ชันวิเคราะห์และเพิ่มรายการเฉพาะเจาะจง (Custom Item) ด้วยโมเดล gemini-3.5-flash-lite
async function submitCustomItemRow() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const instructionText = document.getElementById("customItemDescInput") 
    ? document.getElementById("customItemDescInput").value.trim() 
    : "";
  const isAllPages = document.getElementById("scopeAllPagesRadio") 
    ? document.getElementById("scopeAllPagesRadio").checked 
    : true;
  const selectedPageVal = document.getElementById("customItemPageSelect") 
    ? document.getElementById("customItemPageSelect").value 
    : "1";
  const pageNum = isAllPages ? 1 : (parseInt(selectedPageVal) || 1);
  const category = document.getElementById("customItemCategorySelect").value;
  const statusElem = document.getElementById("statusElem");
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

  if (statusElem) {
    if (isAllPages) {
      statusElem.innerText = `Gemini 3.5 Flash Lite กำลังสแกนหา "${category}" และจับคู่สัญลักษณ์ Schedule เป็นภาษาไทยจากแบบแปลนครบทุกหน้า...`;
    } else {
      statusElem.innerText = `กำลังวิเคราะห์คำสั่งเฉพาะเจาะจงสำหรับหน้า ${pageNum} เป็นภาษาไทย...`;
    }
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
จงสแกนและถอดแบบหมวด "${category}" จากแบบแปลนทุกหน้าและเอกสารประกอบแบบ
คำสั่งเฉพาะเจาะจงเพิ่มเติม: "${instructionText}"

### ข้อกำหนด:
1. สกัด item_name, net_quantity (พร้อมหน่วยภาษาไทย เช่น ตร.ม., ม.), และสินค้า SCG/CPAC ที่เหมาะสมที่สุด
2. ใส่รหัสสัญลักษณ์ในแบบ (ถ้ามี) ลงใน "code_ref"
3. ใน "order_estimate" แจกแจงรายการสินค้าและอุปกรณ์เสริมเป็นภาษาไทย แต่ละบรรทัดขึ้นต้นด้วย "- "
4. อธิบายสูตรคำนวณใน "calculation_note" เป็นภาษาไทย
5. ส่งออกเป็น JSON Array ของ Object:
[
  {
    "category": "${category}",
    "code_ref": "รหัสสัญลักษณ์ เช่น △1, F1",
    "item_name": "ชื่อรายการงานตามแบบแปลนภาษาไทย",
    "net_quantity": "ปริมาณพร้อมหน่วยภาษาไทย",
    "scg_product": "ชื่อสินค้า SCG หรือ CPAC ที่แนะนำ",
    "order_estimate": "- สินค้าหลัก 1\\n- อุปกรณ์เสริม 2",
    "confidence_score": 99,
    "calculation_note": "สูตรคำนวณและสัดส่วนเผื่อเศษภาษาไทย",
    "verification_method": "[สแกนทุกหน้า]: ${instructionText}",
    "source_location": {
      "page_number": 1,
      "box_2d": [100, 100, 900, 900],
      "location_description": "ตำแหน่งที่พบในแบบแปลน"
    }
  }
]
`;
    } else {
      promptText = `
จงถอดแบบหมวด "${category}" เฉพาะเจาะจงบนหน้า ${pageNum} ตามคำสั่ง: "${instructionText}"

### กฎการตอบกลับ:
1. สกัด item_name, net_quantity (พร้อมหน่วยภาษาไทย เช่น ตร.ม., ม.), และสินค้า SCG/CPAC ที่เหมาะสมที่สุด
2. ใส่รหัสสัญลักษณ์ในแบบ (ถ้ามี) ลงใน "code_ref"
3. ใน "order_estimate" แจกแจงรายการสินค้าและอุปกรณ์เสริมเป็นภาษาไทย แต่ละบรรทัดขึ้นต้นด้วย "- "
4. อธิบายสูตรคำนวณใน "calculation_note" เป็นภาษาไทย และระบุ "[รายการสั่งเพิ่มเฉพาะเจาะจง หน้า ${pageNum}]" ใน verification_method
5. ส่งออกเฉพาะ JSON Object:
{
  "category": "${category}",
  "code_ref": "รหัสสัญลักษณ์ เช่น △1 หรือ กำหนดเอง",
  "item_name": "ชื่อรายการงานภาษาไทย",
  "net_quantity": "ปริมาณพร้อมหน่วยภาษาไทย",
  "scg_product": "ชื่อสินค้า SCG หรือ CPAC ที่แนะนำ",
  "order_estimate": "- สินค้าหลัก 1\\n- อุปกรณ์เสริม 2",
  "confidence_score": 99,
  "calculation_note": "สูตรคำนวณและสัดส่วนเผื่อเศษภาษาไทย",
  "verification_method": "[รายการสั่งเพิ่มเฉพาะเจาะจง หน้า ${pageNum}]: ${instructionText}",
  "source_location": {
    "page_number": ${pageNum},
    "box_2d": [100, 100, 900, 900],
    "location_description": "รายการสั่งเพิ่มเฉพาะเจาะจงสำหรับแปลนหน้า ${pageNum}"
  }
}
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
            text: "ท่านคือวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC ข้อความและข้อมูลทุกช่องในตารางต้องเป็นภาษาไทยล้วน 100% ห้ามตอบเป็นภาษาอังกฤษ ตอบกลับด้วยรูปแบบ JSON เท่านั้น"
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
      item.is_manual_modified = true;
      lastRawBOQItems.push(item);
    });

    lastRawBOQItems.sort((a, b) => {
      const pA = (a.source_location && a.source_location.page_number) ? a.source_location.page_number : 1;
      const pB = (b.source_location && b.source_location.page_number) ? b.source_location.page_number : 1;
      return pA - pB;
    });

    renderBOQTable(lastRawBOQItems);
    if (statusElem) statusElem.innerText = `✅ เพิ่มรายการเฉพาะเจาะจง (${itemsToAdd.length} รายการ) ลงในตารางเรียบร้อยแล้ว!`;
    setTimeout(() => {
      closeModal("customItemModal");
    }, 900);
  } catch (err) {
    if (statusElem) statusElem.innerText = "เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง";
  }
}

// ฟังก์ชันหลักในการประมวลผลเอกสารอัตโนมัติด้วย Cross-Check 3D & Multi-Drawing Scan
async function processDocuments() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const planFile = document.getElementById("planFile").files[0];
  const sectionFile = document.getElementById("sectionFile").files[0];
  const specFile = document.getElementById("specFile").files[0];
  const customInstruction = document.getElementById("customInstructionPrompt").value.trim();
  const woodOption = document.getElementById("woodOption") ? document.getElementById("woodOption").value : "auto";
  const statusElem = document.getElementById("statusElem");

  if (!apiKey) {
    alert("กรุณากรอกและบันทึก Gemini API Key ก่อน");
    return;
  }
  if (!planFile) {
    alert("กรุณาเลือกไฟล์แบบแปลน (Plan File)");
    return;
  }

  if (statusElem) {
    statusElem.innerText = "Gemini 3.5 Flash Lite กำลังประมวลผลแบบแปลน พร้อมตรวจสอบ Cross-Check และ Schedule เป็นภาษาไทย...";
  }

  try {
    const parts = [];
    parts.push(await fileToGenerativePart(planFile));

    if (sectionFile) {
      parts.push(await fileToGenerativePart(sectionFile));
    }
    if (specFile) {
      parts.push(await fileToGenerativePart(specFile));
    }

    const promptText = `
จงสแกนและถอดแบบ BOQ ของอาคารทั้งหมดจากแบบแปลนที่แนบมา
คำสั่งเฉพาะเจาะจง: "${customInstruction}"
ตัวเลือกไม้สังเคราะห์: "${woodOption}"

### รูปแบบผลลัพธ์ (ภาษาไทยล้วน 100%):
ในช่อง "order_estimate" ให้ขึ้นต้นแต่ละรายการสินค้าและอุปกรณ์ระบบด้วย "- "
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
            text: "ท่านคือหัวหน้าวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC ข้อความและข้อมูลทุกช่องในตารางต้องเป็นภาษาไทยล้วน 100% ห้ามตอบเป็นภาษาอังกฤษ ตอบกลับด้วยรูปแบบ JSON เท่านั้น"
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
    const parsedItems = cleanAndParseJSON(rawContent);

    lastRawBOQItems = (Array.isArray(parsedItems) ? parsedItems : [parsedItems]).map((item, idx) => {
      item._id = "item_" + Date.now() + "_" + idx;
      return item;
    });

    renderBOQTable(lastRawBOQItems);
    if (statusElem) statusElem.innerText = `✅ ประมวลผลถอดแบบสำเร็จ พบทั้งหมด ${lastRawBOQItems.length} รายการ`;
  } catch (err) {
    if (statusElem) statusElem.innerText = "เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง";
  }
}