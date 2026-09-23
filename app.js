/* ==========================================================
   ตรรกะหลัก แอปพลิเคชัน & AI ถอดแบบ BOQ (GEMINI 3.5 FLASH LITE)
   ปรับปรุง: THAI_CONSTRUCTION_DICT, หมวดโครงสร้างเหล็ก,
   Auto Slope Detection, MATERIAL_MAPPING_TABLE,
   Cross-Sell Engine, Section/Elevation Cross-Check,
   NON_SCG Material Detection, Append/Merge Items & IndexedDB Auto-Sync
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

/* ==========================================================
   พจนานุกรมคำศัพท์ในแบบก่อสร้างไทย (THAI CONSTRUCTION DICT)
   ========================================================== */
const THAI_CONSTRUCTION_DICT = {
  "ค.ส.ล.": "คอนกรีตเสริมเหล็ก",
  "คอร.": "Corrugated (ลอน)",
  "ปลอก": "Pipe Sleeve",
  "ฝ้าเพดานยิปซั่ม": "แผ่นยิปซัม SCG ตราช้าง",
  "พื้นสำเร็จรูป": "แผ่นพื้น CPAC Hollow Core",
  "DL": "Dead Load (น้ำหนักบรรทุกคงที่)",
  "LL": "Live Load (น้ำหนักบรรทุกจร)",
  "FFL": "Finished Floor Level (ระดับพื้นผิวสำเร็จ)",
  "H-beam": "เหล็กโครงสร้างรูปตัว H",
  "ผนังก่ออิฐฉาบปูน": "ก่ออิฐมวลเบา Q-CON + ปูนฉาบเสือมอร์ตาร์",
  "ผนังก่ออิฐมอญ": "ก่ออิฐมอญ/บล็อก + ปูนเสือซีเมนต์ผสม (หรือแนะนำ Q-CON เพื่อลดน้ำหนัก)",
  "ฝ้าเพดานยิปซัม": "แผ่นยิปซัม SCG ตราช้าง ขอบลาด หนา 9 มม. + โครงพลัสไลน์",
  "พื้น ค.ส.ล.": "คอนกรีตผสมเสร็จ CPAC 240 ksc Cube (เทพื้นโครงสร้าง)",
  "วัสดุมุงหลังคา": "ตรวจสอบ Roof Plan — แนะนำ SCG Metal Sheet หรือกระเบื้อง CPAC",
  "โครงเหล็กหลังคา": "SCG Metal Sheet Lumax/Snap Lock (เหมาะกับโครงเหล็ก)",
  "แผ่นเมทัลชีท": "SCG Metal Sheet ลอน Snap Lock / LumaX",
  "อลูมิเนียมคอมโพสิต": "NON_SCG: วัสดุตกแต่งภายนอก (ไม่ใช่สินค้า SCG)",
  "กระจกใส": "NON_SCG: กระจก (ไม่ใช่สินค้า SCG)",
  "อลูมิเนียม อบดำ": "NON_SCG: กรอบอลูมิเนียม (ไม่ใช่สินค้า SCG)",
  "slope_0_to_3": "SCG Metal Sheet LumaX (ขั้นต่ำ 0.3°)",
  "slope_3_to_5": "SCG Metal Sheet Snap Lock (ซ่อนสกรู ขั้นต่ำ 3°)",
  "slope_5_to_15": "SCG Metal Sheet 760 Noise Shield (กันเสียงฝน ขั้นต่ำ 5°)",
  "slope_15_to_17": "กระเบื้องหลังคาลอนคู่ SCG (ขั้นต่ำ 15°)",
  "slope_17_to_22": "หลังคาคอนกรีต SCG CPAC ลอนมาตรฐาน (ขั้นต่ำ 17°)",
  "slope_22_to_25": "SCG Neustile (ขั้นต่ำ 22°)",
  "slope_25_plus": "SCG Prestige (ขั้นต่ำ 25°)"
};

/* ==========================================================
   ตารางจับคู่วัสดุจากแบบ → สินค้า SCG/CPAC (MATERIAL MAPPING)
   ========================================================== */
const MATERIAL_MAPPING_TABLE = [
  ["ผนังก่ออิฐฉาบปูน", "ก่ออิฐมวลเบา Q-CON + ปูนฉาบเสือมอร์ตาร์", "งานผนัง", "scg"],
  ["ผนังก่ออิฐมอญ", "ก่ออิฐมอญ/บล็อก + ปูนเสือซีเมนต์ผสม", "งานผนัง", "scg"],
  ["ผนังเบา", "ผนังเบา สมาร์ทบอร์ด SCG หนา 8-10 มม. + โครง C-Stud", "งานผนัง", "scg"],
  ["แผ่นยิปซัม", "แผ่นยิปซัม SCG ตราช้าง ขอบลาด หนา 9 มม. + โครงพลัสไลน์", "งานฝ้าเพดาน", "scg"],
  ["ยิปซั่มบอร์ด", "แผ่นยิปซัม SCG ตราช้าง ขอบลาด หนา 9 มม. + โครงพลัสไลน์", "งานฝ้าเพดาน", "scg"],
  ["สมาร์ทบอร์ด", "ฝ้าสมาร์ทบอร์ด SCG ขอบเรียบ หนา 4 มม.", "งานฝ้าเพดาน", "scg"],
  ["smartboard", "ฝ้าสมาร์ทบอร์ด SCG ขอบเรียบ หนา 4 มม.", "งานฝ้าเพดาน", "scg"],
  ["พื้นสำเร็จรูป", "แผ่นพื้นสำเร็จรูป CPAC Hollow Core หนา 10 ซม. + Topping 5 ซม.", "งานโครงสร้างและคอนกรีต CPAC", "scg"],
  ["hollow core", "แผ่นพื้นสำเร็จรูป CPAC Hollow Core หนา 10 ซม. + Topping 5 ซม.", "งานโครงสร้างและคอนกรีต CPAC", "scg"],
  ["คอนกรีตผสมเสร็จ", "คอนกรีตผสมเสร็จ CPAC 240 ksc Cube", "งานโครงสร้างและคอนกรีต CPAC", "scg"],
  ["ready-mix", "คอนกรีตผสมเสร็จ CPAC 240 ksc Cube", "งานโครงสร้างและคอนกรีต CPAC", "scg"],
  ["ค.ส.ล.", "คอนกรีตผสมเสร็จ CPAC 240 ksc Cube", "งานโครงสร้างและคอนกรีต CPAC", "scg"],
  ["เหล็กเสริม", "เหล็กเส้นเสริมคอนกรีต (ทั่วไป)", "งานโครงสร้างและคอนกรีต CPAC", "general"],
  ["H-beam", "SCG Metal Sheet Lumax/Snap Lock (อาคารโครงเหล็ก)", "งานโครงสร้างเหล็ก", "scg"],
  ["เหล็กกล่อง", "SCG Metal Sheet Lumax/Snap Lock (อาคารโครงเหล็ก)", "งานโครงสร้างเหล็ก", "scg"],
  ["จันทันเหล็ก", "SCG Metal Sheet Lumax/Snap Lock (อาคารโครงเหล็ก)", "งานโครงสร้างเหล็ก", "scg"],
  ["แปเหล็ก", "SCG Metal Sheet Lumax/Snap Lock (อาคารโครงเหล็ก)", "งานโครงสร้างเหล็ก", "scg"],
  ["หลังคาเมทัลชีท", "SCG Metal Sheet ลอน Snap Lock (ซ่อนสกรู)", "งานหลังคา", "scg"],
  ["metal sheet", "SCG Metal Sheet ลอน LumaX", "งานหลังคา", "scg"],
  ["กระเบื้องหลังคา", "กระเบื้องหลังคาลอนคู่ SCG", "งานหลังคา", "scg"],
  ["หลังคาคอนกรีต", "หลังคาคอนกรีต SCG CPAC ลอนมาตรฐาน", "งานหลังคา", "scg"],
  ["ฉนวนกันความร้อน", "ฉนวนปูเหนือฝ้า SCG STAY COOL หนา 75 มม.", "งานฉนวนปูเหนือฝ้า (STAY COOL)", "scg"],
  ["stay cool", "ฉนวนปูเหนือฝ้า SCG STAY COOL หนา 75 มม.", "งานฉนวนปูเหนือฝ้า (STAY COOL)", "scg"],
  ["fso", "ฉนวนใยแก้วใต้หลังคา SCG FSO", "งานฉนวนใต้หลังคา (SCG FSO)", "scg"],
  ["เชิงชาย", "ไม้เชิงชาย SCG Smartwood 2 in 1", "งานไม้สังเคราะห์/ตกแต่ง", "scg"],
  ["บัว", "ไม้บัว SCG Smartwood", "งานไม้สังเคราะห์/ตกแต่ง", "scg"],
  ["ไม้ระแนง", "ไม้ระแนงบังแดด SCG Smartwood 3 นิ้ว", "งานไม้สังเคราะห์/ตกแต่ง", "scg"],
  ["ไม้ฝา", "ไม้ฝา SCG Smartwood (ลายไม้สัก)", "งานไม้สังเคราะห์/ตกแต่ง", "scg"],
  ["วงกบอลูมิเนียม", "NON_SCG: วงกบอลูมิเนียม (ไม่ใช่สินค้า SCG)", "งานตกแต่งอื่นๆ (ไม่ใช่ SCG)", "non_scg"],
  ["อลูมิเนียมคอมโพสิต", "NON_SCG: Aluminum Composite (ไม่ใช่สินค้า SCG)", "งานตกแต่งอื่นๆ (ไม่ใช่ SCG)", "non_scg"],
  ["aluminum composite", "NON_SCG: Aluminum Composite (ไม่ใช่สินค้า SCG)", "งานตกแต่งอื่นๆ (ไม่ใช่ SCG)", "non_scg"],
  ["กระจกใส", "NON_SCG: กระจก (ไม่ใช่สินค้า SCG)", "งานตกแต่งอื่นๆ (ไม่ใช่ SCG)", "non_scg"],
  ["กระจก", "NON_SCG: กระจก (ไม่ใช่สินค้า SCG)", "งานตกแต่งอื่นๆ (ไม่ใช่ SCG)", "non_scg"],
  ["โถชักโครก", "สุขภัณฑ์ (ไม่ใช่สินค้า SCG — อาจแนะนำ COTTO)", "งานสุขาภิบาล", "general"],
  ["กระเบื้องปูพื้น", "กระเบื้องปูพื้น COTTO + ปูนกาวเสือ", "งานพื้น", "scg"],
  ["cotto", "กระเบื้องปูพื้น COTTO + ปูนกาวเสือ", "งานพื้น", "scg"],
  ["สีทาภายใน", "NON_SCG: งานทาสี (TOA/JOTUN — ไม่ใช่สินค้า SCG)", "งานตกแต่งอื่นๆ (ไม่ใช่ SCG)", "non_scg"],
  ["สีทาภายนอก", "NON_SCG: งานทาสี (TOA/JOTUN — ไม่ใช่สินค้า SCG)", "งานตกแต่งอื่นๆ (ไม่ใช่ SCG)", "non_scg"],
  ["TOA", "NON_SCG: งานทาสี TOA (ไม่ใช่สินค้า SCG)", "งานตกแต่งอื่นๆ (ไม่ใช่ SCG)", "non_scg"],
  ["ระบบกำจัดปลวก", "บริการกำจัดปลวก (ไม่ใช่สินค้า SCG)", "งานอื่นๆ", "general"],
  ["ประตู HDF", "ประตูไม้ HDF (ทั่วไป — ไม่ใช่ SCG โดยตรง)", "งานประตู-หน้าต่าง", "general"],
  ["วงกบประตู", "วงกบประตูไม้ (ทั่วไป — ไม่ใช่ SCG โดยตรง)", "งานประตู-หน้าต่าง", "general"],
  ["หน้าต่างบานเปิด", "หน้าต่างอลูมิเนียม (ทั่วไป — ไม่ใช่ SCG โดยตรง)", "งานประตู-หน้าต่าง", "general"]
];

function findMaterialMatch(text) {
  const lower = (text || "").toLowerCase();
  for (let i = 0; i < MATERIAL_MAPPING_TABLE.length; i++) {
    const [keyword, product, category, flag] = MATERIAL_MAPPING_TABLE[i];
    if (lower.includes(keyword.toLowerCase())) {
      return { product, category, flag };
    }
  }
  return null;
}

/* ==========================================================
   ตรวจจับความชันหลังคาจากข้อความในแบบ (AUTO SLOPE DETECTION)
   ========================================================== */
function detectSlopeFromDrawingText(aiResponseText) {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*[º°]/g,
    /SLOPE\s*[:=]?\s*(\d+(?:\.\d+)?)/gi,
    /ความชัน\s*(\d+(?:\.\d+)?)/gi,
    /([\d.]+)\s*องศา/gi
  ];
  for (let p = 0; p < patterns.length; p++) {
    const matches = aiResponseText.matchAll(patterns[p]);
    for (const match of matches) {
      if (match && match[1]) {
        const detected = parseFloat(match[1]);
        if (detected >= 0 && detected <= 60) return detected;
      }
    }
  }
  return null;
}

function autoMapSlopeToRoofProduct(slopeDeg) {
  if (slopeDeg <= 0.3) return { product: "metal_lumax", name: "SCG Metal Sheet LumaX (ขั้นต่ำ 0.3°)" };
  if (slopeDeg <= 3) return { product: "metal_snaplock", name: "SCG Metal Sheet Snap Lock (ขั้นต่ำ 3°)" };
  if (slopeDeg <= 5) return { product: "metal_760", name: "SCG Metal Sheet 760 Noise Shield (ขั้นต่ำ 5°)" };
  if (slopeDeg <= 15) return { product: "roman", name: "กระเบื้องหลังคาลอนคู่ SCG (ขั้นต่ำ 15°)" };
  if (slopeDeg <= 17) return { product: "cpac", name: "หลังคาคอนกรีต SCG CPAC ลอนมาตรฐาน (ขั้นต่ำ 17°)" };
  if (slopeDeg <= 22) return { product: "scg_neustile", name: "SCG Neustile (ขั้นต่ำ 22°)" };
  return { product: "scg_prestige", name: "SCG Prestige (ขั้นต่ำ 25°)" };
}

/* ==========================================================
   ตรวจจับประเภทอาคารจากข้อความ (BUILDING TYPE DETECTION)
   ========================================================== */
function detectBuildingType(rawText) {
  const lower = (rawText || "").toLowerCase();
  const indicators = {
    hasSteelStructure: lower.includes("h-beam") || lower.includes("เหล็กกล่อง") || lower.includes("จันทันเหล็ก") || lower.includes("แปเหล็ก") || lower.includes("โครงเหล็ก"),
    hasMultiFloor: lower.includes("ระดับพื้นชั้น 2") || lower.includes("ชั้น 2") || (lower.match(/\+3\.\d{2}/g) || []).length >= 2,
    hasRoofStructure: lower.includes("หลังคาน") || lower.includes("slope") || lower.includes("º") || lower.includes("°"),
    hasConcreteStructure: lower.includes("ค.ส.ล.") || lower.includes("เสาคอนกรีต") || lower.includes("ฐานราก") || lower.includes("ready-mix"),
    hasAluminumComposite: lower.includes("อลูมิเนียมคอมโพสิต") || lower.includes("aluminum composite"),
    hasWWTPSystem: lower.includes("wwtp") || lower.includes("บ่อพัก") || lower.includes("บำบัดน้ำเสีย"),
    hasCOTTOProducts: lower.includes("cotto") || lower.includes("คอตโต้"),
    sectionLevels: (rawText || "").match(/\+[\d.]+/g) || []
  };
  return indicators;
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
  "งานโครงสร้างเหล็ก": [
    "SCG Metal Sheet ลอน LumaX (เหมาะกับโครงเหล็ก ความชันต่ำ 0.3°)",
    "SCG Metal Sheet ลอน Snap Lock (ซ่อนสกรู เหมาะกับโครงเหล็ก ขั้นต่ำ 3°)",
    "SCG Metal Sheet ลอน 760 Noise Shield (โครงเหล็ก + กันเสียงฝน ขั้นต่ำ 5°)",
    "แปเหล็กกล่อง + SCG Metal Sheet (ระบบหลังคาโครงเหล็กครบวงจร)",
    "ฉนวนใยแก้วใต้หลังคา SCG FSO (บุใต้ Metal Sheet บนโครงเหล็ก)",
    "แผ่นสะท้อนความร้อน SCG Radiant Barrier (ติดใต้แปเหล็ก)"
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
    label.innerText = "(ขั้นต่ำ: " + minDeg + "° | ตัวคูณ: " + mult.toFixed(3) + ")";
    if (currentDeg < minDeg) {
      warning.style.display = "block";
      warning.innerText = "⚠️ องศา " + currentDeg + "° ต่ำกว่าเกณฑ์มาตรฐาน SCG (ขั้นต่ำ " + minDeg + "°) เสี่ยงน้ำไหลย้อนซึม";
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
  if (modalMinLabel) modalMinLabel.innerText = "(ขั้นต่ำ: " + minDeg + "°)";
  const label = document.getElementById("slopeFactorLabel");
  const warning = document.getElementById("slopeWarning");
  const mult = getSlopeMultiplier(minDeg);
  label.innerText = "(ขั้นต่ำ: " + minDeg + "° | ตัวคูณ: " + mult.toFixed(3) + ")";
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
  else if (category.includes("โครงเหล็ก") || category.includes("เหล็ก") || category.includes("H-beam") || category.includes("steel")) key = "งานโครงสร้างเหล็ก";
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
  const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech") || cat.includes("โครงเหล็ก"));
  if (isRoofRelated) {
    const minSlope = getMinSlopeFromProductName(prod);
    const modalSlopeInput = document.getElementById("modalSlopeDeg");
    const modalMinLabel = document.getElementById("modalSlopeMinLabel");
    modalSlopeInput.value = minSlope;
    if (modalMinLabel) modalMinLabel.innerText = "(ขั้นต่ำ: " + minSlope + "°)";
    document.getElementById("roofSlopeDeg").value = minSlope;
    const mult = getSlopeMultiplier(minSlope);
    document.getElementById("slopeFactorLabel").innerText = "(ขั้นต่ำ: " + minSlope + "° | ตัวคูณ: " + mult.toFixed(3) + ")";
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
  const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech") || cat.includes("โครงเหล็ก"));
  slopeContainer.style.display = isRoofRelated ? "inline-flex" : "none";
  roofShapeContainer.style.display = (cat.includes("หลังคา") || cat.includes("โครงเหล็ก")) ? "inline-flex" : "none";
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
  label.innerText = "(ขั้นต่ำ: " + minSlope + "° | ตัวคูณ: " + mult.toFixed(3) + ")";
  if (modalSlope < minSlope) {
    warning.style.display = "block";
    warning.innerText = "⚠️ องศา " + modalSlope + "° ต่ำกว่าเกณฑ์มาตรฐาน SCG (ขั้นต่ำ " + minSlope + "°)";
  } else {
    warning.style.display = "none";
  }
  const cat = document.getElementById("drawCategorySelect").value;
  const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech") || cat.includes("โครงเหล็ก"));
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
  let html = '<div class="order-bundle-list">';
  for (let i = 0; i < items.length; i++) {
    const cleanItem = items[i].replace(/^[-•*]\s*/, '').trim();
    if (cleanItem) {
      html += '<div class="order-item-row"><span class="order-item-icon">📦</span><span class="order-item-text">' + cleanItem + '</span></div>';
    }
  }
  html += '</div>';
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
    opt.innerText = "หน้า " + i;
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
    statusElem.innerText = 'Gemini 3.5 Flash Lite กำลังสแกนหา "' + category + '" และจับคู่สัญลักษณ์ Schedule เป็นภาษาไทยจากแบบแปลนครบทุกหน้า...';
  } else {
    statusElem.innerText = "กำลังวิเคราะห์คำสั่งเฉพาะเจาะจงสำหรับหน้า " + pageNum + " เป็นภาษาไทย...";
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
      promptText = "\n### บทบาทและข้อกำหนดภาษา (บังคับภาษาไทย 100%):\nท่านคือวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC\nข้อมูลข้อความทุกช่อง (ยกเว้นรหัสสัญลักษณ์ เช่น △1, △5, F1, HC หรือชื่อแบรนด์ SCG, CPAC, Q-CON) ต้องเขียนเป็น \"ภาษาไทยล้วน 100%\"\n### ขอบเขตและงาน:\nจงสแกนตรวจสอบแบบแปลนทุกหน้า (หน้า 1 ถึง " + detectedTotalPages + ") เพื่อถอดแบบและประมาณราคาตามคำสั่งเฉพาะเจาะจงนี้:\n\"\"\"\nหมวดงาน: " + category + "\nคำสั่งเฉพาะเจาะจง: " + instructionText + "\n\"\"\"\n### กฎการตอบกลับ:\n1. สำหรับทุกชั้น/โซนที่พบหมวดงานหรือสัญลักษณ์นี้ ให้สร้างเป็นรายการแยกแถวใน Array\n2. ระบุเลขหน้าที่พบจริงลงใน \"source_location.page_number\"\n3. ใน \"order_estimate\" ให้แจกแจงรายการสินค้าสั่งซื้อและอุปกรณ์แพ็กเกจระบบเป็นภาษาไทย แต่ละบรรทัดขึ้นต้นด้วย \"- \"\n4. ใน \"calculation_note\" และ \"verification_method\" ให้อธิบายสูตรและการคำนวณเป็นภาษาไทย\n5. ส่งออกเฉพาะ JSON Array\n";
    } else {
      promptText = "\n### บทบาทและข้อกำหนดภาษา (บังคับภาษาไทย 100%):\nท่านคือวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC\nข้อมูลข้อความทุกช่องต้องเป็น \"ภาษาไทยล้วน 100%\"\n### ขอบเขตและงาน:\nเพิ่มรายการเฉพาะเจาะจงลงในตาราง BOQ สำหรับแปลนหน้า " + pageNum + " ตามคำสั่งนี้:\n\"\"\"\nหมวดงาน: " + category + "\nคำสั่งเฉพาะเจาะจง: " + instructionText + "\nอ้างอิงหน้าแปลน: หน้า " + pageNum + "\n\"\"\"\n### กฎการตอบกลับ:\n1. สกัด item_name, net_quantity (พร้อมหน่วยภาษาไทย), และสินค้า SCG/CPAC ที่เหมาะสมที่สุด\n2. ใส่รหัสสัญลักษณ์ในแบบ (ถ้ามี) ลงใน \"code_ref\"\n3. ใน \"order_estimate\" แจกแจงรายการสินค้าและอุปกรณ์เสริมเป็นภาษาไทย แต่ละบรรทัดขึ้นต้นด้วย \"- \"\n4. ส่งออกเฉพาะ JSON Object\n";
    }
    parts.unshift({ text: promptText });
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + apiKey;
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
    if (!Array.isArray(lastRawBOQItems)) {
      lastRawBOQItems = [];
    }
    for (let idx = 0; idx < itemsToAdd.length; idx++) {
      const item = itemsToAdd[idx];
      item._id = "item_" + Date.now() + "_" + idx + "_" + Math.floor(Math.random() * 1000);
      item.unit_price = item.unit_price !== undefined ? parseFloat(item.unit_price) : 0;
      calculateItemTotals(item);
      item.is_manual_modified = true;
      lastRawBOQItems.push(item);
    }
    lastRawBOQItems.sort((a, b) => {
      const pA = (a.source_location && a.source_location.page_number) ? a.source_location.page_number : 1;
      const pB = (b.source_location && b.source_location.page_number) ? b.source_location.page_number : 1;
      return pA - pB;
    });
    const recalcBtn = document.getElementById("recalcBtn");
    if (recalcBtn) recalcBtn.disabled = false;
    const resultCard = document.getElementById("resultCard");
    if (resultCard) resultCard.style.display = "block";
    renderBOQTable(lastRawBOQItems);

    // Auto-save to IndexedDB
    if (typeof saveCurrentProject === "function") {
      await saveCurrentProject();
    }

    statusElem.innerText = "✅ เพิ่มรายการเฉพาะเจาะจง (" + itemsToAdd.length + " รายการ) สำเร็จ! (รวมทั้งหมด " + lastRawBOQItems.length + " รายการ)";
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
    statusDiv.innerText = "Gemini 3.5 Flash Lite กำลังสแกนทุกผังและจับคู่สัญลักษณ์ Schedule เป็นภาษาไทยในเอกสารทั้งหมด " + detectedTotalPages + " หน้า...";
    let customDirective = "";
    if (customInstruction) {
      customDirective = "\n### คำสั่งเน้นย้ำของผู้ใช้งาน:\n\"\"\"\n" + customInstruction + "\n\"\"\"\n";
    }
    const promptText = "\n### กฎเหล็กด้านภาษา (MANDATORY THAI LANGUAGE RULE):\nท่านคือหัวหน้าวิศวกรผู้เชี่ยวชาญการถอดแบบและประมาณราคา (Chief QS) ของ SCG และ CPAC\nข้อมูลและคำอธิบายทุกช่องในตาราง BOQ ต้องเขียนเป็น \"ภาษาไทยล้วน 100%\"\n### งานที่ต้องปฏิบัติ:\nวิเคราะห์แบบสถาปัตย์ แบบโครงสร้าง และแบบรูปตัด/รูปด้าน ทั้งหมด " + detectedTotalPages + " หน้า พร้อมตรวจสอบสอบทาน 3 มิติ เพื่อจัดทำรายการประมาณการวัสดุ BOQ สินค้า SCG และคอนกรีต CPAC อย่างละเอียดและแม่นยำ\n" + customDirective + "\n### พจนานุกรมคำศัพท์ในแบบก่อสร้างไทย:\n" + JSON.stringify(THAI_CONSTRUCTION_DICT, null, 2) + "\n\n### การตรวจสอบจากรูปตัดและรูปด้าน (Section & Elevation Cross-Check):\n1. ตรวจสอบรูปตัด (Section A-A, B-B) ทุกรูป: หาระดับ FFL (Finished Floor Level), ระดับหลังคา, ระดับฝ้าเพดาน\n2. คำนวณความสูงของผนัง: ความสูง = ระดับฝ้า - FFL หรือ ระดับหลังคา - FFL\n3. ตรวจสอบจำนวนชั้น: ถ้าพบ \"ระดับพื้นชั้น 2 +3.75\" หรือค่าระดับความสูงหลายค่า → แยก BOQ ตามชั้น\n4. ถ้าพบโครงเหล็ก H-beam 200x200 → อาคารนี้ใช้โครงสร้างเหล็ก → แนะนำ SCG Metal Sheet\n5. ตรวจสอบ slope จากแปลนโครงสร้างหลังคา (S-05, ST.07) — ระบุเป็นองศา (º หรือ °)\n6. ทุกรูปตัดต้องนำมาคำนวณ Cross-Check 3D: พื้นที่ผนังภายนอก, ความสูงฝ้า, ปริมาณวัสดุกรุผนัง\n\n### สเปกวัสดุที่ผู้ใช้เลือก:\n1. หมวดคอนกรีตและโครงสร้าง CPAC: \"" + concreteChoice + "\"\n2. หมวดหลังคา: \"" + roofChoice + "\" (ความชัน: " + slopeDeg + " องศา)\n3. หมวดฉนวนปูเหนือฝ้า: \"" + ceilingInsChoice + "\"\n4. หมวดฉนวนใต้หลังคา: \"" + roofInsChoice + "\"\n5. ผนัง: \"" + wallChoice + "\", พื้น: \"" + floorChoice + "\", ฝ้า: \"" + ceilingChoice + "\", ไม้ตกแต่ง: \"" + woodChoice + "\"\n### รูปแบบผลลัพธ์ (ภาษาไทยล้วน 100%):\nส่งออกเฉพาะ JSON Array ที่ถูกต้องตามโครงสร้างนี้:\n[\n  {\n    \"category\": \"หมวดงานภาษาไทย เช่น งานผนัง, งานหลังคา, งานโครงสร้างและคอนกรีต CPAC\",\n    \"code_ref\": \"รหัสสัญลักษณ์ เช่น △1, △5, F1, HC หรือรหัสอ้างอิงในแบบ\",\n    \"item_name\": \"ชื่อรายการงานตามแบบแปลน/ตารางสัญลักษณ์ภาษาไทย (ระบุชั้น/ห้อง/โซน)\",\n    \"net_quantity\": \"ปริมาณพร้อมหน่วยภาษาไทย เช่น 120.50 ตร.ม. หรือ 45.00 ม.\",\n    \"scg_product\": \"ชื่อสินค้า SCG หรือ CPAC ที่แนะนำ\",\n    \"order_estimate\": \"- รายการสินค้าหลัก 1 พร้อมจำนวนและหน่วย\\n- อุปกรณ์ส่วนควบระบบ 2\",\n    \"confidence_score\": 98,\n    \"calculation_note\": \"สูตรคำนวณและสัดส่วนเผื่อเศษเป็นภาษาไทย\",\n    \"verification_method\": \"ที่มาการคำนวณและการ Cross-Check 3D เป็นภาษาไทย\",\n    \"source_location\": {\n      \"page_number\": 1,\n      \"box_2d\": [100, 100, 900, 900],\n      \"location_description\": \"คำอธิบายตำแหน่งบนแบบแปลนหน้านั้นภาษาไทย\"\n    }\n  }\n]\n";
    parts.unshift({ text: promptText });
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + apiKey;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: "ท่านคือหัวหน้าวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC ข้อความและข้อมูลทุกช่องในตารางต้องเป็นภาษาไทยล้วน 100% ส่งออกเฉพาะ JSON ล้วน\n\n### พจนานุกรมคำศัพท์ในแบบก่อสร้างไทย:\n" + JSON.stringify(THAI_CONSTRUCTION_DICT, null, 2) + "\n\n### กฎการจับคู่วัสดุจากแบบ → สินค้า SCG/CPAC:\n1. ถ้าพบ \"โครงเหล็กหลังคา\" หรือ \"H-beam\" + หลังคา → แนะนำ SCG Metal Sheet (Lumax/Snap Lock/760) ตามความชัน\n2. ถ้าพบ \"ผนังก่ออิฐฉาบปูน\" → แนะนำ Q-CON อิฐมวลเบา + ปูนฉาบเสือ (ลดน้ำหนัก กันร้อน)\n3. ถ้าพบ \"พื้นสำเร็จรูป\" → แนะนำ CPAC Hollow Core\n4. ถ้าพบ \"ฝ้าเพดานยิปซั่ม\" → แนะนำ SCG ตราช้าง + โครงพลัสไลน์\n5. ถ้าพบ \"สมาร์ทบอร์ด\" หรือ \"Smartboard\" → แนะนำฝ้าสมาร์ทบอร์ด SCG\n6. ถ้าพบวัสดุที่ไม่ใช่ SCG (อลูมิเนียม กระจก Aluminum Composite TOA) → ระบุ category เป็น \"งานตกแต่งอื่นๆ (ไม่ใช่ SCG)\" และ flag ใน item_name\n7. พยายามหาโอกาส Cross-Sell: ถ้าพบหลังคา → แนะนำฉนวน FSO/STAY COOL, ถ้าพบผนัง → แนะนำ Smartboard, ถ้าพบพื้น → แนะนำ COTTO\n8. ถ้าพบระบบบำบัดน้ำเสีย (WWTP) หรือบ่อพัก → แนะนำคอนกรีตกันซึม CPAC\n9. ตรวจสอบรูปตัด (Section) เสมอ: หาระดับความสูงฝ้า (FFL), ระดับหลังคา → คำนวณ slope factor และพื้นที่ผนัง\n10. ถ้าพบ slope 5º → อาคารใช้ Metal Sheet (Lumax/Snap Lock) เพราะ slope ต่ำกว่าเกณฑ์กระเบื้องหลังคา"
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

    // ===== Auto-detect slope จาก AI response =====
    const detectedSlope = detectSlopeFromDrawingText(rawContent);
    if (detectedSlope !== null) {
      document.getElementById("roofSlopeDeg").value = detectedSlope;
      if (document.getElementById("modalSlopeDeg")) {
        document.getElementById("modalSlopeDeg").value = detectedSlope;
      }
      const roofMapping = autoMapSlopeToRoofProduct(detectedSlope);
      document.getElementById("roofOption").value = roofMapping.product;
      autoAdjustDefaultSlope();
      statusDiv.innerText += " | 🔍 ตรวจพบความชันหลังคา " + detectedSlope + "° → แนะนำ " + roofMapping.name;
    }

    // ===== ตรวจจับประเภทอาคารและ Cross-Check =====
    const buildingType = detectBuildingType(rawContent);
    if (buildingType.hasSteelStructure) {
      statusDiv.innerText += " | 🏗️ ตรวจพบโครงสร้างเหล็ก (H-beam) → แนะนำ SCG Metal Sheet";
    }
    if (buildingType.hasAluminumComposite) {
      statusDiv.innerText += " | ⚠️ พบ Aluminum Composite → วัสดุไม่ใช่ SCG (แจ้งผู้ใช้)";
    }
    if (buildingType.hasCOTTOProducts) {
      statusDiv.innerText += " | 🧱 พบสุขภัณฑ์ COTTO → แนะนำสินค้า SCG";
    }

    // ===== จับคู่วัสดุจาก MATERIAL_MAPPING_TABLE =====
    for (let i = 0; i < boqItems.length; i++) {
      const item = boqItems[i];
      const itemText = (item.item_name || "") + " " + (item.code_ref || "") + " " + (item.scg_product || "");
      const materialMatch = findMaterialMatch(itemText);

      if (materialMatch && materialMatch.flag === "non_scg") {
        item.category = materialMatch.category;
        item.scg_product = materialMatch.product;
        item.confidence_score = 85;
        item.calculation_note = "⚠️ วัสดุนี้ไม่ใช่สินค้า SCG/CPAC: " + materialMatch.product + " | กรุณาตรวจสอบกับผู้จำหน่ายวัสดุทั่วไป";
        item.verification_method = "ตรวจพบจากแบบแปลน — ไม่มีสินค้า SCG ที่เทียบเท่าโดยตรง";
      } else if (materialMatch && materialMatch.flag === "scg" && (!item.scg_product || item.scg_product === "-")) {
        item.scg_product = materialMatch.product;
        item.category = materialMatch.category;
        item.confidence_score = Math.max(item.confidence_score || 90, 90);
      } else if (materialMatch && materialMatch.flag === "general") {
        item.category = materialMatch.category;
        if (!item.scg_product || item.scg_product === "-") {
          item.scg_product = materialMatch.product;
        }
      }
    }

    for (let i = 0; i < boqItems.length; i++) {
      const item = boqItems[i];
      item._id = "item_" + Date.now() + "_" + i + "_" + Math.floor(Math.random() * 1000);
      item.unit_price = item.unit_price !== undefined ? parseFloat(item.unit_price) : 0;
      calculateItemTotals(item);
    }

    // ===== ตรวจสอบการต่อท้ายรายการ (Append/Merge) เพื่อไม่ให้ล้างของเก่าออก =====
    let isAppendMode = false;
    if (lastRawBOQItems && lastRawBOQItems.length > 0) {
      if (customInstruction) {
        isAppendMode = confirm("พบรายการเดิมอยู่ในตาราง " + lastRawBOQItems.length + " รายการ\n\nต้องการ 'เพิ่มรายการใหม่' ต่อท้ายรายการเดิมใช่หรือไม่?\n- กด [ตกลง (OK)] เพื่อเพิ่มต่อท้ายรายการเดิม\n- กด [ยกเลิก (Cancel)] เพื่อล้างแล้วเริ่มวิเคราะห์ใหม่ทั้งหมด");
      } else {
        isAppendMode = confirm("มีรายการเดิมอยู่ในตาราง " + lastRawBOQItems.length + " รายการ\n\nต้องการ 'เพิ่มรายการใหม่' ต่อท้ายรายการเดิม หรือ 'เริ่มวิเคราะห์ใหม่ทั้งหมด'?\n- กด [ตกลง (OK)] เพื่อเพิ่มต่อท้าย\n- กด [ยกเลิก (Cancel)] เพื่อแทนที่ทั้งหมด");
      }
    }

    if (isAppendMode) {
      lastRawBOQItems = lastRawBOQItems.concat(boqItems);
    } else {
      lastRawBOQItems = boqItems;
    }

    lastRawBOQItems.sort((a, b) => {
      const pA = (a.source_location && a.source_location.page_number) ? a.source_location.page_number : 1;
      const pB = (b.source_location && b.source_location.page_number) ? b.source_location.page_number : 1;
      return pA - pB;
    });

    recalcBtn.disabled = false;
    renderBOQTable(lastRawBOQItems);

    // Auto-save to IndexedDB
    if (typeof saveCurrentProject === "function") {
      await saveCurrentProject();
    }

    statusDiv.innerText = isAppendMode
      ? "✅ เพิ่มรายการสำเร็จ! เพิ่มใหม่ " + boqItems.length + " รายการ (รวมในตารางทั้งหมด " + lastRawBOQItems.length + " รายการเป็นภาษาไทย)"
      : "ประมวลผลสำเร็จเรียบร้อย! ถอดปริมาณงานได้ทั้งหมด " + boqItems.length + " รายการเป็นภาษาไทย";
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
  if (!apiKey) {
    alert("กรุณากรอกและบันทึก Gemini API Key ก่อน");
    return;
  }
  const statusDiv = document.getElementById("status");
  const recalcBtn = document.getElementById("recalcBtn");
  const slopeDeg = document.getElementById("roofSlopeDeg").value;
  recalcBtn.disabled = true;
  statusDiv.innerText = "กำลังคำนวณปริมาณสินค้าใหม่ตามสเปกที่เลือกเป็นภาษาไทย...";
  try {
    const promptText = "\n### คำสั่งคำนวณใหม่ (บังคับภาษาไทย 100%):\nจงปรับปรุงสเปกสินค้า SCG & CPAC และคำนวณยอดสั่งซื้อใหม่สำหรับรายการ BOQ ที่มีอยู่เดิม โดยทุกข้อความต้องเป็น \"ภาษาไทยล้วน 100%\"\n### รายการเดิม:\n" + JSON.stringify(lastRawBOQItems.map(it => ({
      _id: it._id,
      category: it.category,
      code_ref: it.code_ref,
      item_name: it.item_name,
      net_quantity: it.net_quantity,
      source_location: it.source_location
    })), null, 2) + "\n### สเปกใหม่ที่เลือก:\n- หมวดหลังคา: \"" + document.getElementById("roofOption").value + "\" (ความชัน: " + slopeDeg + " องศา)\n- หมวดฉนวนปูเหนือฝ้า: \"" + document.getElementById("ceilingInsulationOption").value + "\"\n- หมวดฉนวนใต้หลังคา: \"" + document.getElementById("roofInsulationOption").value + "\"\n- หมวดโครงสร้างคอนกรีต CPAC: \"" + document.getElementById("concreteOption").value + "\"\n- หมวดผนัง: \"" + document.getElementById("wallOption").value + "\"\n- หมวดพื้น: \"" + document.getElementById("floorOption").value + "\"\n- หมวดฝ้าเพดาน: \"" + document.getElementById("ceilingOption").value + "\"\n- หมวดไม้ตกแต่ง: \"" + document.getElementById("woodOption").value + "\"\n### ข้อกำหนด:\n1. คงลำดับแถวและ _id เดิมทั้งหมด\n2. ใน \"order_estimate\" ให้แสดงรายการสั่งซื้อและอุปกรณ์เสริมเป็นภาษาไทย แต่ละรายการขึ้นต้นด้วย \"- \"\n3. ใช้ MATERIAL_MAPPING_TABLE จับคู่วัสดุจากแบบกับสินค้า SCG\n4. ส่งออกเฉพาะ JSON Array ที่ถูกต้อง\n";
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + apiKey;
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
    for (let idx = 0; idx < updatedItems.length; idx++) {
      const item = updatedItems[idx];
      const orig = lastRawBOQItems[idx];
      item._id = (orig && orig._id) ? orig._id : "item_" + Date.now() + "_" + idx;
      item.unit_price = (orig && orig.unit_price !== undefined) ? orig.unit_price : 0;
      item.value_mb = (orig && orig.value_mb !== undefined) ? orig.value_mb : 0;
      calculateItemTotals(item);
    }
    lastRawBOQItems = updatedItems;
    renderBOQTable(lastRawBOQItems);

    if (typeof saveCurrentProject === "function") {
      await saveCurrentProject();
    }

    statusDiv.innerText = "คำนวณและอัปเดตสเปกสินค้าใหม่เป็นภาษาไทยสำเร็จ!";
  } catch (err) {
    statusDiv.innerText = "เกิดข้อผิดพลาดในการคำนวณใหม่ กรุณาลองอีกครั้ง";
  } finally {
    recalcBtn.disabled = false;
  }
}

/* ----------------------------------------------------------
   ระบบสกัดตัวเลขและคำนวณราคาอัตโนมัติ (AUTO PRICING ENGINE)
   ---------------------------------------------------------- */
function extractNumericQuantity(qtyStr) {
  if (!qtyStr) return 0;
  const match = String(qtyStr).match(/[\d,.]+/);
  if (!match) return 0;
  const num = parseFloat(match[0].replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

function calculateItemTotals(item) {
  const qty = extractNumericQuantity(item.net_quantity);

  if ((item.unit_price === undefined || item.unit_price === null || item.unit_price === 0) && item.value_mb > 0) {
    const existingTotal = item.value_mb * 1000000;
    item.total_price = existingTotal;
    if (qty > 0) {
      item.unit_price = parseFloat((existingTotal / qty).toFixed(2));
    }
  } else {
    const uPrice = parseFloat(item.unit_price) || 0;
    item.unit_price = uPrice;
    item.total_price = qty * uPrice;
    item.value_mb = item.total_price > 0 ? (item.total_price / 1000000) : 0;
  }
  return {
    qty,
    unitPrice: item.unit_price,
    totalPrice: item.total_price,
    value_mb: item.value_mb
  };
}

function formatCurrency(amount) {
  const val = parseFloat(amount) || 0;
  return val.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " ฿";
}

function updateItemUnitPrice(id, val) {
  if (!lastRawBOQItems) return;
  const item = lastRawBOQItems.find(it => it._id === id);
  if (!item) return;
  const num = parseFloat(val);
  item.unit_price = !isNaN(num) && num >= 0 ? num : 0;

  const totals = calculateItemTotals(item);

  const totalValElem = document.getElementById('total-val-' + id);
  const totalMbElem = document.getElementById('total-mb-' + id);
  if (totalValElem) totalValElem.innerText = formatCurrency(totals.totalPrice);
  if (totalMbElem) totalMbElem.innerText = '(' + totals.value_mb.toFixed(4) + ' MB)';

  updateTotalSummaryDisplay();
}

function updateItemValue(id, val) {
  if (!lastRawBOQItems) return;
  const item = lastRawBOQItems.find(it => it._id === id);
  if (!item) return;
  const num = parseFloat(val);
  item.value_mb = !isNaN(num) && num >= 0 ? num : 0;
  item.total_price = item.value_mb * 1000000;
  const qty = extractNumericQuantity(item.net_quantity);
  if (qty > 0) {
    item.unit_price = parseFloat((item.total_price / qty).toFixed(2));
    const uPriceInput = document.getElementById('unit-price-' + id);
    if (uPriceInput) uPriceInput.value = item.unit_price > 0 ? item.unit_price : "";
  }
  updateTotalSummaryDisplay();
}

function updateTotalSummaryDisplay() {
  if (!lastRawBOQItems) return;
  const totalMB = lastRawBOQItems.reduce((sum, it) => sum + (parseFloat(it.value_mb) || 0), 0);
  const totalBaht = lastRawBOQItems.reduce((sum, it) => sum + (parseFloat(it.total_price) || 0), 0);
  const totalValElem = document.getElementById("totalProjectValueDisplay");
  const totalCountElem = document.getElementById("totalItemsCountDisplay");
  if (totalValElem) totalValElem.innerText = totalMB.toFixed(2) + " MB (" + totalBaht.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " บาท)";
  if (totalCountElem) totalCountElem.innerText = lastRawBOQItems.length + " รายการ";
}

function ensureTableHeader() {
  const tbody = document.getElementById("boqBody");
  if (!tbody) return;
  const table = tbody.closest("table");
  if (!table) return;
  let thead = table.querySelector("thead");
  if (!thead) {
    thead = document.createElement("thead");
    table.insertBefore(thead, tbody);
  }
  thead.innerHTML = `
    <tr>
      <th>หมวดงาน</th>
      <th style="text-align: center;">หน้า</th>
      <th>รหัส/สัญลักษณ์</th>
      <th>รายการงานตามแบบ (แยกชั้น/ผัง/โซน)</th>
      <th>ปริมาณสุทธิ (แก้ไขได้)</th>
      <th style="min-width: 135px; text-align: right;">ราคา/หน่วย (บาท)</th>
      <th style="min-width: 160px; text-align: right;">มูลค่ารวม (คำนวณอัตโนมัติ)</th>
      <th>สินค้า SCG / CPAC ที่แนะนำ</th>
      <th>ประมาณการสั่งซื้อจริง</th>
      <th style="text-align: center;">ความมั่นใจ</th>
      <th>หมายเหตุ/สูตรคำนวณ</th>
      <th>การ Cross-Check 3D</th>
      <th class="no-print" style="text-align: center;">ดู/แก้ไขในแบบ</th>
      <th class="no-print" style="text-align: center;">จัดการ</th>
    </tr>
  `;
}

function renderBOQTable(items) {
  ensureTableHeader();
  const tbody = document.getElementById("boqBody");
  tbody.innerHTML = "";
  const recalcBtn = document.getElementById("recalcBtn");
  if (recalcBtn) {
    recalcBtn.disabled = (!items || items.length === 0);
  }
  if (!items || items.length === 0) {
    document.getElementById("resultCard").style.display = "none";
    return;
  }
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    calculateItemTotals(item);
    let badgeClass = "badge badge-other";
    const cat = item.category || "";
    if (cat.includes("หลังคา")) badgeClass = "badge badge-roof";
    else if (cat.includes("สันหลังคา") || cat.includes("Dry Tech")) badgeClass = "badge badge-roof";
    else if (cat.includes("ฉนวนใต้หลังคา") || cat.includes("FSO")) badgeClass = "badge badge-roof";
    else if (cat.includes("ฉนวนปูเหนือฝ้า") || cat.includes("STAY COOL")) badgeClass = "badge badge-insulation";
    else if (cat.includes("โครงเหล็ก")) badgeClass = "badge badge-concrete";
    else if (cat.includes("โครงสร้าง") || cat.includes("คอนกรีต") || cat.includes("CPAC") || cat.includes("Hollow") || cat.includes("Post")) badgeClass = "badge badge-concrete";
    else if (cat.includes("ไม้")) badgeClass = "badge badge-wood";
    else if (cat.includes("ผนัง")) badgeClass = "badge badge-wall";
    else if (cat.includes("พื้น")) badgeClass = "badge badge-floor";
    else if (cat.includes("ฝ้า") || cat.includes("เพดาน")) badgeClass = "badge badge-ceiling";
    else if (cat.includes("สุขาภิบาล") || cat.includes("ระบบ")) badgeClass = "badge badge-mep";
    else if (cat.includes("ไม่ใช่ SCG") || cat.includes("NON_SCG") || cat.includes("อื่นๆ")) badgeClass = "badge badge-other";
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
    const pageBadge = '<span class="page-indicator-badge">📄 หน้า ' + pageNum + '</span>';
    const isModified = item.is_manual_modified ? "modified" : "";
    const manualBadge = item.is_manual_modified ? '<span class="manual-badge">📐 แก้ไขแล้ว</span>' : "";
    const hasCrossCheck = (item.verification_method || "").toLowerCase().includes("section") ||
                          (item.verification_method || "").includes("รูปตัด") ||
                          (item.verification_method || "").includes("ความสูง");
    const crossCheckBadge = hasCrossCheck ? '<div class="cross-check-tag">🔍 Cross-Checked 3D</div>' : "";

    const isNonSCG = (cat.includes("ไม่ใช่ SCG") || cat.includes("NON_SCG") || (item.scg_product || "").includes("NON_SCG"));
    const nonSCGWarning = isNonSCG ? '<div style="font-size:10px; color:#b91c1c; font-weight:bold; margin-top:3px;">⚠️ ไม่ใช่สินค้า SCG</div>' : "";

    const orderEstimateFormatted = formatOrderEstimateHTML(item.order_estimate);
    const unitPriceVal = item.unit_price > 0 ? item.unit_price : "";
    const row = document.createElement("tr");
    row.id = 'boq-row-' + item._id;
    row.innerHTML = `
      <td><span class="${badgeClass}">${item.category || "-"}</span>${nonSCGWarning}</td>
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
      <td style="white-space: nowrap; min-width: 135px; text-align: right;">
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
          <input type="number" step="any" min="0" class="input-unit-price" id="unit-price-${item._id}" value="${unitPriceVal}" placeholder="0.00" oninput="updateItemUnitPrice('${item._id}', this.value)">
          <span style="font-size: 11px; font-weight: 700; color: #475569;">บ.</span>
        </div>
      </td>
      <td style="white-space: nowrap; min-width: 160px; text-align: right;">
        <div class="total-price-cell">
          <span class="total-price-val" id="total-val-${item._id}">${formatCurrency(item.total_price)}</span>
          <span class="total-price-mb" id="total-mb-${item._id}">(${item.value_mb.toFixed(4)} MB)</span>
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
  }
  updateTotalSummaryDisplay();
  document.getElementById("resultCard").style.display = "block";
}

function deleteBOQItem(id) {
  if (!lastRawBOQItems || lastRawBOQItems.length === 0) return;
  const targetItem = lastRawBOQItems.find(item => item._id === id);
  const itemName = targetItem ? (targetItem.item_name || "รายการนี้") : "รายการนี้";
  if (confirm('คุณต้องการลบ "' + itemName + '" ออกจากตาราง BOQ ใช่หรือไม่?')) {
    lastRawBOQItems = lastRawBOQItems.filter(item => item._id !== id);
    renderBOQTable(lastRawBOQItems);
    if (typeof saveCurrentProject === "function") {
      saveCurrentProject();
    }
  }
}

function updateNetQuantity(id, newValue) {
  if (!lastRawBOQItems) return;
  const item = lastRawBOQItems.find(it => it._id === id);
  if (!item) return;
  const trimmed = newValue.trim();
  item.net_quantity = trimmed;
  item.is_manual_modified = true;
  const totals = calculateItemTotals(item);
  const totalValElem = document.getElementById('total-val-' + id);
  const totalMbElem = document.getElementById('total-mb-' + id);
  if (totalValElem) totalValElem.innerText = formatCurrency(totals.totalPrice);
  if (totalMbElem) totalMbElem.innerText = '(' + totals.value_mb.toFixed(4) + ' MB)';
  updateTotalSummaryDisplay();
  const numericMatch = trimmed.match(/[\d,.]+/);
  if (numericMatch) {
    const rawNum = parseFloat(numericMatch[0].replace(/,/g, ''));
    if (!isNaN(rawNum) && rawNum > 0) {
      const product = (item.scg_product || "").toLowerCase();
      let newEstimate = "";
      if (product.includes("dry tech") || product.includes("สันหลังคา")) {
        const tiles = Math.ceil(rawNum * 3.3 * 1.05);
        const dryRolls = Math.ceil((rawNum / 3.0) * 1.05);
        newEstimate = "- แผ่นครอบสันหลังคา: " + tiles + " แผ่น\n- แผ่นรองใต้สันหลังคา SCG Dry Tech: " + dryRolls + " ม้วน (3.0 ม./ม้วน)";
      } else if (product.includes("hollow core") || product.includes("ฮอลโลว์คอร์")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        const toppingCubic = (rawNum * 0.05 * 1.05).toFixed(2);
        const wireMeshSqm = (rawNum * 1.10).toFixed(1);
        newEstimate = "- แผ่นพื้น CPAC Hollow Core: " + sqmAmt + " ตร.ม.\n- คอนกรีตทับหน้า Topping หนา 5 ซม.: " + toppingCubic + " คิว (ลบ.ม.)\n- ตะแกรงเหล็ก Wire Mesh: " + wireMeshSqm + " ตร.ม. (เผื่อทาบ 10%)";
      } else if (product.includes("prestige") || product.includes("เพรสทีจ") || product.includes("neustile") || product.includes("นิวสไตล์") || product.includes("cpac") || product.includes("ลอนคู่")) {
        const tiles = Math.ceil(rawNum * 11 * 1.05);
        newEstimate = "- กระเบื้องหลังคา: " + tiles + " แผ่น (เผื่อเศษ 5%)";
      } else if (product.includes("post-tension") || product.includes("โพสต์เทนชั่น")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        const strandKg = Math.round(rawNum * 4.0);
        newEstimate = "- พื้นคอนกรีตอัดแรง Post-tension: " + sqmAmt + " ตร.ม.\n- ลวดสลิง PC Strand: ~" + strandKg + " กก.";
      } else if (product.includes("คอนกรีตผสมเสร็จ") || product.includes("ready-mix")) {
        const cubic = (rawNum * 1.05).toFixed(2);
        newEstimate = "- คอนกรีตผสมเสร็จ CPAC: " + cubic + " คิว (ลบ.ม.)";
      } else if (product.includes("เชิงชาย") || product.includes("บัว")) {
        const pcs = Math.ceil((rawNum / 3.0) * 1.05);
        newEstimate = "- ไม้เชิงชาย SCG Smartwood: " + pcs + " ท่อน (3.0 ม./ท่อน)";
      } else if (product.includes("stay cool") || product.includes("สเตย์คูล")) {
        const rolls = Math.ceil((rawNum / 2.40) * 1.05);
        newEstimate = "- ฉนวนปูเหนือฝ้า SCG STAY COOL: " + rolls + " ม้วน (ปูเหนือฝ้า 2.40 ตร.ม./ม้วน)";
      } else if (product.includes("fso")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        newEstimate = "- ฉนวนใยแก้วใต้หลังคา SCG FSO: " + sqmAmt + " ตร.ม.";
      } else if (product.includes("สมาร์ทบอร์ด") || product.includes("smartboard") || product.includes("ยิปซัม")) {
        const sheets = Math.ceil((rawNum / 2.88) * 1.05);
        newEstimate = "- แผ่นบอร์ด: " + sheets + " แผ่น";
      } else if (product.includes("ไม้ฝา") || product.includes("siding")) {
        const planks = Math.ceil(rawNum * 2.22 * 1.05);
        newEstimate = "- ไม้ฝาตกแต่ง SCG Smartwood: " + planks + " แผ่น";
      } else if (product.includes("lumax") || product.includes("metal sheet") || product.includes("เมทัลชีท")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        newEstimate = "- แผ่นหลังคา Metal Sheet: " + sqmAmt + " ตร.ม.";
      } else if (product.includes("คอนกรีตกันซึม")) {
        const cubic = (rawNum * 1.05).toFixed(2);
        newEstimate = "- คอนกรีตกันซึม CPAC: " + cubic + " คิว (ลบ.ม.)";
      } else if (product.includes("cotto") || product.includes("กระเบื้องปูพื้น")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        newEstimate = "- กระเบื้องปูพื้น COTTO: " + sqmAmt + " ตร.ม.\n- ปูนกาวเสือ: ตามอัตราส่วนผู้ผลิต";
      } else if (product.includes("q-con") || product.includes("อิฐมวลเบา")) {
        const sqmAmt = (rawNum * 1.05).toFixed(1);
        newEstimate = "- อิฐมวลเบา Q-CON: " + sqmAmt + " ตร.ม.\n- ปูนฉาบเสือมอร์ตาร์: ตามอัตราส่วนผู้ผลิต";
      }
      if (newEstimate) {
        item.order_estimate = newEstimate;
        const estElem = document.getElementById('order-estimate-' + id);
        if (estElem) estElem.innerHTML = formatOrderEstimateHTML(newEstimate);
      }
    }
  }
  const inputElem = document.getElementById('qty-input-' + id);
  if (inputElem) {
    inputElem.classList.add("modified");
  }
  if (typeof saveCurrentProject === "function") {
    saveCurrentProject();
  }
}

function closeModal(modalId) {
  if (typeof stopAutoPanLoop === "function") {
    stopAutoPanLoop();
  }
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = "none";
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
  const totalBaht = lastRawBOQItems.reduce((sum, it) => sum + (parseFloat(it.total_price) || 0), 0);
  const excelData = lastRawBOQItems.map(row => {
    calculateItemTotals(row);
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
      "หน้าที่พบ": "หน้า " + page,
      "รหัสอ้างอิง/สัญลักษณ์": row.code_ref || "-",
      "รายการงานตามแบบ": row.item_name || "-",
      "ปริมาณสุทธิ": row.net_quantity || "-",
      "ราคาต่อหน่วย (บาท)": row.unit_price !== undefined ? Number(row.unit_price) : 0,
      "มูลค่ารวม (บาท)": row.total_price !== undefined ? Number(Number(row.total_price).toFixed(2)) : 0,
      "มูลค่า (MB)": row.value_mb !== undefined && row.value_mb !== null ? Number(Number(row.value_mb).toFixed(4)) : 0,
      "สถานะ": modifiedStatus,
      "สินค้า SCG / CPAC ที่แนะนำ": row.scg_product || "-",
      "ประมาณการสั่งซื้อจริง": cleanEstimate,
      "ความมั่นใจ (%)": row.confidence_score || "-",
      "หมายเหตุและสูตรคำนวณ": row.calculation_note || "-",
      "การ Cross-Check และที่มาปริมาณ": row.verification_method || "-",
      "คำอธิบายตำแหน่งในแบบ": desc
    };
  });
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
    "ราคาต่อหน่วย (บาท)": "",
    "มูลค่ารวม (บาท)": Number(totalBaht.toFixed(2)),
    "มูลค่า (MB)": Number(totalMB.toFixed(4)),
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
  const fileName = "SCG_BOQ_" + cust + "_" + prj + "_" + new Date().toISOString().slice(0,10) + ".xlsx";
  XLSX.writeFile(workbook, fileName);
}

function buildReportHTML() {
  const cust = document.getElementById("metaCustomerName").value || "ไม่ระบุชื่อลูกค้า";
  const prj = document.getElementById("metaProjectName").value || "โครงการทั่วไป";
  const plan = document.getElementById("metaPlanFileName").value || "ไม่ระบุชื่อแบบ";
  const code = document.getElementById("metaProjectCode").value || "-";
  const estimator = document.getElementById("metaEstimator").value || "-";
  const totalMB = lastRawBOQItems.reduce((sum, it) => sum + (parseFloat(it.value_mb) || 0), 0);
  const totalBaht = lastRawBOQItems.reduce((sum, it) => sum + (parseFloat(it.total_price) || 0), 0);
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
        <div style="font-size: 14px; font-weight: 800; color: #047857;">💰 มูลค่ารวมโครงการ: ${totalMB.toFixed(2)} MB (${totalBaht.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} บาท)</div>
        <div style="margin-top: 3px;"><strong>วันที่ออกรายงาน:</strong> ${new Date().toLocaleDateString('th-TH')}</div>
        <div><strong>จำนวนรายการทั้งหมด:</strong> ${lastRawBOQItems.length} รายการ</div>
      </div>
    </div>
  `;
  let rowsHTML = "";
  for (let i = 0; i < lastRawBOQItems.length; i++) {
    const row = lastRawBOQItems[i];
    calculateItemTotals(row);
    const page = (row.source_location && row.source_location.page_number) ? row.source_location.page_number : "-";
    const cleanEstimate = (row.order_estimate || "-")
      .split(/\r?\n/)
      .map(s => s.trim().replace(/^[-•*]\s*/, ''))
      .filter(s => s.length > 0)
      .map(s => '• ' + s)
      .join("<br>");
    const uPriceText = row.unit_price > 0 ? Number(row.unit_price).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "-";
    const totalBahtText = row.total_price > 0 ? Number(row.total_price).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " ฿" : "-";
    const mbText = row.value_mb > 0 ? "(" + Number(row.value_mb).toFixed(4) + " MB)" : "";
    rowsHTML += `
      <tr style="border-bottom: 1px solid #cbd5e1; font-size: 10px; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'}; page-break-inside: avoid;">
        <td style="padding: 6px 8px; font-weight: bold; color: #b91c1c; vertical-align: top;">${row.category || "-"}</td>
        <td style="padding: 6px 8px; text-align: center; font-weight: bold; vertical-align: top;">หน้า ${page}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: #0284c7; vertical-align: top;">${row.code_ref || "-"}</td>
        <td style="padding: 6px 8px; font-weight: bold; vertical-align: top;">${row.item_name || "-"}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: #0284c7; vertical-align: top;">${row.net_quantity || "-"}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: #334155; text-align: right; vertical-align: top;">${uPriceText}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: #047857; text-align: right; vertical-align: top;">
          <div>${totalBahtText}</div>
          <div style="font-size: 8px; color: #0284c7;">${mbText}</div>
        </td>
        <td style="padding: 6px 8px; font-weight: bold; color: #b91c1c; vertical-align: top;">${row.scg_product || "-"}</td>
        <td style="padding: 6px 8px; line-height: 1.35; vertical-align: top;">${cleanEstimate}</td>
        <td style="padding: 6px 8px; color: #475569; line-height: 1.3; vertical-align: top;">${row.calculation_note || "-"}</td>
        <td style="padding: 6px 8px; color: #0369a1; font-size: 9px; line-height: 1.3; vertical-align: top;">${row.verification_method || "-"}</td>
      </tr>
    `;
  }
  const tableHTML = `
    <table style="width: 100%; border-collapse: collapse; text-align: left;">
      <thead>
        <tr style="background: #f1f5f9; border-bottom: 2px solid #94a3b8; font-size: 11px;">
          <th style="padding: 8px;">หมวดงาน</th>
          <th style="padding: 8px; text-align: center;">หน้า</th>
          <th style="padding: 8px;">รหัส/สัญลักษณ์</th>
          <th style="padding: 8px;">รายการงานตามแบบ</th>
          <th style="padding: 8px;">ปริมาณสุทธิ</th>
          <th style="padding: 8px; text-align: right; min-width: 100px;">ราคา/หน่วย (บาท)</th>
          <th style="padding: 8px; text-align: right; min-width: 130px;">มูลค่ารวม</th>
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
          <td style="padding: 8px;"></td>
          <td style="padding: 8px; text-align: right; color: #047857;">
            <div>${totalBaht.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} บาท</div>
            <div style="font-size: 9px; color: #0284c7;">(${totalMB.toFixed(2)} MB)</div>
          </td>
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
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.onload = function() {
    setTimeout(function() {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };
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
    version: "3.5-lite-enhanced",
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
  link.download = "SCG_BOQ_" + cust + "_" + prj + "_" + new Date().toISOString().slice(0,10) + ".json";
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
      for (let idx = 0; idx < itemsToLoad.length; idx++) {
        const item = itemsToLoad[idx];
        if (!item._id) item._id = "item_" + Date.now() + "_" + idx;
        item.unit_price = item.unit_price !== undefined ? parseFloat(item.unit_price) : 0;
        calculateItemTotals(item);
      }
      lastRawBOQItems = itemsToLoad;
      document.getElementById("recalcBtn").disabled = false;
      renderBOQTable(lastRawBOQItems);
      document.getElementById("status").innerText = '✅ นำเข้าข้อมูลสำเร็จแล้ว (' + lastRawBOQItems.length + ' รายการ)';
      alert('นำเข้าข้อมูลเรียบร้อยแล้ว (' + lastRawBOQItems.length + ' รายการ)');
    } catch (err) {
      alert("ไม่สามารถอ่านไฟล์ JSON ได้ กรุณาตรวจสอบความถูกต้องของไฟล์");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}
