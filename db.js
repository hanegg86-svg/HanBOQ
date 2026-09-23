/* ==========================================================
   ระบบ INDEXEDDB ปรับปรุงใหม่: รองรับการเก็บ Metadata งาน,
   Project Template, AI Context และ Settings สำหรับถอดแบบ
   ========================================================== */
const DB_NAME = "SCG_BOQ_DB";
const DB_VERSION = 3;
const STORE_NAME = "projects";
let dbInstance = null;
let currentProjectId = null;
window.currentProjectTab = "all";

/* ==========================================================
   การเปิดฐานข้อมูล
   ========================================================== */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // สร้าง Object Store ครั้งแรก
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("customerName", "customerName", { unique: false });
        store.createIndex("projectName", "projectName", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("projectType", "projectType", { unique: false });
        store.createIndex("status", "status", { unique: false });
      } else {
        // อัปเกรด schema: เพิ่ม indexes ถ้ายังไม่มี
        const tx = e.target.transaction;
        const store = tx.objectStore(STORE_NAME);
        if (!store.indexNames.contains("projectType")) {
          store.createIndex("projectType", "projectType", { unique: false });
        }
        if (!store.indexNames.contains("status")) {
          store.createIndex("status", "status", { unique: false });
        }
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/* ==========================================================
   ตรวจสอบและซ่อมแซม project metadata (Auto-migration)
   ========================================================== */
async function repairAllProjectMetadata() {
  const projects = await getAllProjectsFromDB();
  const tx = dbInstance.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  let repairedCount = 0;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    let needsRepair = false;

    if (!p.ai_context) {
      p.ai_context = {
        last_material_preference: "auto",
        project_type_tag: "residential_construction",
        detected_building_types: [],
        detected_slope: null,
        non_scg_materials: []
      };
      needsRepair = true;
    }
    if (!p.project_template) {
      p.project_template = {
        roof_style: "unknown",
        structure_type: "unknown",
        floor_count: 1,
        has_steel_structure: false,
        has_aluminum_composite: false,
        has_concrete_structure: false,
        scope_of_work: [],
        special_notes: ""
      };
      needsRepair = true;
    }
    if (!p.metadata_tags) {
      p.metadata_tags = [];
      needsRepair = true;
    }
    if (!p.status) {
      p.status = "draft";
      needsRepair = true;
    }

    if (needsRepair) {
      store.put(p);
      repairedCount++;
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(repairedCount);
    tx.onerror = () => reject(tx.error);
  });
}

/* ==========================================================
   บันทึกโครงการ พร้อมโครงสร้าง Metadata และ AI Context
   ========================================================== */
async function saveProjectToDB(projectData) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // ดึง metadata จาก UI ปัจจุบัน
    const projectName = document.getElementById("metaProjectName")?.value || "";
    const customerName = document.getElementById("metaCustomerName")?.value || "";
    const planFileName = document.getElementById("metaPlanFileName")?.value || "";
    const projectCode = document.getElementById("metaProjectCode")?.value || "";
    const estimatorName = document.getElementById("metaEstimator")?.value || "";

    // ตรวจจับ metadata จาก BOQ items
    const boqItems = (typeof lastRawBOQItems !== "undefined" && lastRawBOQItems) ? lastRawBOQItems : [];
    let detectedTypes = [];
    let nonSCGMaterials = [];
    let detectedSlope = null;
    let hasSteelStructure = false;
    let hasConcreteStructure = false;
    let hasAluminumComposite = false;
    let floorCount = 1;

    for (let i = 0; i < boqItems.length; i++) {
      const item = boqItems[i];
      const cat = (item.category || "").toLowerCase();
      const prod = (item.scg_product || "").toLowerCase();
      const notes = (item.verification_method || "") + " " + (item.calculation_note || "");

      if (cat.includes("โครงเหล็ก") || prod.includes("metal sheet") || prod.includes("lumax") || prod.includes("snap lock")) {
        hasSteelStructure = true;
        if (detectedTypes.indexOf("steel_structure") === -1) detectedTypes.push("steel_structure");
      }
      if (cat.includes("คอนกรีต") || cat.includes("cpac") || cat.includes("ค.ส.ล.") || cat.includes("hollow core")) {
        hasConcreteStructure = true;
        if (detectedTypes.indexOf("concrete_structure") === -1) detectedTypes.push("concrete_structure");
      }
      if (cat.includes("ไม่ใช่ scg") || cat.includes("non_scg") || prod.includes("non_scg")) {
        if (nonSCGMaterials.indexOf(item.item_name) === -1) nonSCGMaterials.push(item.item_name || "วัสดุไม่ใช่ SCG");
      }
      if (cat.includes("อลูมิเนียมคอมโพสิต") || prod.includes("aluminum composite")) {
        hasAluminumComposite = true;
      }
      if (notes.includes("ชั้น 2") || notes.includes("+3.75") || notes.includes("2 ชั้น")) {
        floorCount = Math.max(floorCount, 2);
      }

      // ตรวจจับ slope จาก notes
      const slopeMatch = notes.match(/(\d+(?:\.\d+)?)\s*[º°]/);
      if (slopeMatch && !detectedSlope) {
        detectedSlope = parseFloat(slopeMatch[1]);
      }
    }

    // Scope of Work จากแบบ
    let scopeOfWork = [];
    const catSet = {};
    for (let i = 0; i < boqItems.length; i++) {
      const cat = boqItems[i].category || "";
      if (cat && !catSet[cat]) {
        catSet[cat] = true;
        scopeOfWork.push(cat);
      }
    }

    const enhancedData = {
      ...projectData,
      // Meta พื้นฐาน
      projectName: projectName || projectData.projectName || "",
      customerName: customerName || projectData.customerName || "",
      planFileName: planFileName || projectData.planFileName || "",
      projectCode: projectCode || projectData.projectCode || "",
      estimatorName: estimatorName || projectData.estimatorName || "",
      updatedAt: new Date().toISOString(),
      status: projectData.status || "draft",

      // AI Context สำหรับการเรียนรู้และแนะนำสินค้าให้แม่นขึ้น
      ai_context: {
        last_material_preference: (typeof document !== "undefined" && document.getElementById("roofOption")?.value) || projectData.settings?.roofOption || "auto",
        project_type_tag: hasSteelStructure ? "steel_structure_commercial" : (hasConcreteStructure ? "concrete_residential" : "residential_construction"),
        detected_building_types: detectedTypes.length > 0 ? detectedTypes : (projectData.ai_context?.detected_building_types || []),
        detected_slope: detectedSlope !== null ? detectedSlope : (projectData.ai_context?.detected_slope || null),
        non_scg_materials: nonSCGMaterials.length > 0 ? nonSCGMaterials : (projectData.ai_context?.non_scg_materials || []),
        last_used_prompt: (typeof document !== "undefined" && document.getElementById("customInstructionPrompt")?.value) || "",
        export_count: (projectData.ai_context?.export_count || 0)
      },

      // Project Template สำหรับถอดแบบซ้ำ
      project_template: {
        roof_style: hasSteelStructure ? "metal_sheet" : (hasConcreteStructure ? "concrete_tile" : "unknown"),
        structure_type: hasSteelStructure ? "steel_frame" : (hasConcreteStructure ? "reinforced_concrete" : "unknown"),
        floor_count: floorCount,
        has_steel_structure: hasSteelStructure,
        has_aluminum_composite: hasAluminumComposite,
        has_concrete_structure: hasConcreteStructure,
        scope_of_work: scopeOfWork.length > 0 ? scopeOfWork : (projectData.project_template?.scope_of_work || []),
        special_notes: projectData.project_template?.special_notes || ""
      },

      // Metadata Tags สำหรับค้นหาและจัดกลุ่ม
      metadata_tags: [
        ...(hasSteelStructure ? ["steel_structure", "metal_sheet_roof"] : []),
        ...(hasConcreteStructure ? ["concrete", "cpac", "reinforced_concrete"] : []),
        ...(floorCount >= 2 ? ["multi_floor", "commercial"] : ["single_floor"]),
        ...(hasAluminumComposite ? ["aluminum_composite", "non_scg_facade"] : []),
        ...(detectedSlope !== null ? ["slope_" + detectedSlope + "deg"] : []),
        ...(nonSCGMaterials.length > 0 ? ["has_non_scg_materials"] : []),
        "project_" + (projectCode || "unknown")
      ],

      // Settings snapshot
      settings: projectData.settings || {
        roofOption: (typeof document !== "undefined" && document.getElementById("roofOption")?.value) || "auto",
        concreteOption: (typeof document !== "undefined" && document.getElementById("concreteOption")?.value) || "cpac_240",
        roofSlopeDeg: (typeof document !== "undefined" && document.getElementById("roofSlopeDeg")?.value) || "15",
        ceilingInsulationOption: (typeof document !== "undefined" && document.getElementById("ceilingInsulationOption")?.value) || "none",
        roofInsulationOption: (typeof document !== "undefined" && document.getElementById("roofInsulationOption")?.value) || "none",
        wallOption: (typeof document !== "undefined" && document.getElementById("wallOption")?.value) || "qcon",
        floorOption: (typeof document !== "undefined" && document.getElementById("floorOption")?.value) || "cotto",
        ceilingOption: (typeof document !== "undefined" && document.getElementById("ceilingOption")?.value) || "scg_gypsum",
        woodOption: (typeof document !== "undefined" && document.getElementById("woodOption")?.value) || "smartwood"
      },

      // BOQ Items
      items: projectData.items || boqItems
    };

    const req = store.put(enhancedData);
    req.onsuccess = () => {
      currentProjectId = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ==========================================================
   ดึงข้อมูลโครงการทั้งหมด
   ========================================================== */
async function getAllProjectsFromDB() {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      resolve([]);
      return;
    }
    const tx = dbInstance.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* ==========================================================
   ดึงโครงการตาม ID
   ========================================================== */
async function getProjectById(id) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/* ==========================================================
   ลบโครงการ
   ========================================================== */
async function deleteProjectFromDB(id) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => {
      if (currentProjectId === id) currentProjectId = null;
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/* ==========================================================
   อัปเดต status ของโครงการ
   ========================================================== */
async function updateProjectStatus(id, newStatus) {
  const project = await getProjectById(id);
  if (!project) return;
  project.status = newStatus;
  project.updatedAt = new Date().toISOString();
  return saveProjectToDB(project);
}

/* ==========================================================
   นับจำนวน AI export (สำหรับ Analytics)
   ========================================================== */
async function incrementExportCount(id) {
  const project = await getProjectById(id);
  if (!project) return;
  if (!project.ai_context) project.ai_context = {};
  project.ai_context.export_count = (project.ai_context.export_count || 0) + 1;
  project.updatedAt = new Date().toISOString();
  return saveProjectToDB(project);
}

/* ==========================================================
   UI Helpers: โหลดโครงการเข้า UI
   ========================================================== */
window.selectProject = async function(id) {
  const project = await getProjectById(id);
  if (project) {
    loadProjectIntoUI(project);
    closeModal("projectManagerModal");
  }
};

window.duplicateProject = async function(id) {
  const project = await getProjectById(id);
  if (!project) return;
  const newProject = JSON.parse(JSON.stringify(project));
  newProject.id = "proj_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  newProject.projectName = (project.projectName || "โครงการ") + " (สำเนา)";
  newProject.createdAt = new Date().toISOString();
  newProject.updatedAt = new Date().toISOString();
  newProject.status = "draft";
  await saveProjectToDB(newProject);
  await refreshProjectList();
  alert('สำเนาโครงการ "' + newProject.projectName + '" เรียบร้อยแล้ว');
};

window.deleteProject = async function(id) {
  const project = await getProjectById(id);
  const name = project ? (project.projectName || "โครงการที่ไม่มีชื่อ") : "โครงการนี้";
  if (confirm('คุณต้องการลบ "' + name + '" และข้อมูล BOQ ทั้งหมดของโครงการนี้ใช่หรือไม่? (การกระทำนี้ไม่สามารถกู้คืนได้)')) {
    await deleteProjectFromDB(id);
    if (typeof lastRawBOQItems !== "undefined" && lastRawBOQItems) {
      lastRawBOQItems = [];
    }
    if (typeof renderBOQTable === "function") {
      renderBOQTable([]);
    }
    await refreshProjectList();
    document.getElementById("metaProjectName").value = "";
    document.getElementById("metaCustomerName").value = "";
    document.getElementById("metaPlanFileName").value = "";
    document.getElementById("metaProjectCode").value = "";
    document.getElementById("metaEstimator").value = "";
    updateActiveBarDisplay("", "", "");
  }
};

/* ==========================================================
   โหลดข้อมูลโปรเจกต์เข้า UI
   ========================================================== */
function loadProjectIntoUI(project) {
  currentProjectId = project.id;

  // Meta
  document.getElementById("metaProjectName").value = project.projectName || "";
  document.getElementById("metaCustomerName").value = project.customerName || "";
  document.getElementById("metaPlanFileName").value = project.planFileName || "";
  document.getElementById("metaProjectCode").value = project.projectCode || "";
  document.getElementById("metaEstimator").value = project.estimatorName || "";

  // Active Bar
  updateActiveBarDisplay(
    project.projectName || "",
    project.customerName || "",
    project.planFileName || ""
  );

  // Settings (คืนค่า settings จาก project)
  if (project.settings) {
    const s = project.settings;
    if (s.roofOption && document.getElementById("roofOption")) document.getElementById("roofOption").value = s.roofOption;
    if (s.concreteOption && document.getElementById("concreteOption")) document.getElementById("concreteOption").value = s.concreteOption;
    if (s.roofSlopeDeg && document.getElementById("roofSlopeDeg")) document.getElementById("roofSlopeDeg").value = s.roofSlopeDeg;
    if (s.ceilingInsulationOption && document.getElementById("ceilingInsulationOption")) document.getElementById("ceilingInsulationOption").value = s.ceilingInsulationOption;
    if (s.roofInsulationOption && document.getElementById("roofInsulationOption")) document.getElementById("roofInsulationOption").value = s.roofInsulationOption;
    if (s.wallOption && document.getElementById("wallOption")) document.getElementById("wallOption").value = s.wallOption;
    if (s.floorOption && document.getElementById("floorOption")) document.getElementById("floorOption").value = s.floorOption;
    if (s.ceilingOption && document.getElementById("ceilingOption")) document.getElementById("ceilingOption").value = s.ceilingOption;
    if (s.woodOption && document.getElementById("woodOption")) document.getElementById("woodOption").value = s.woodOption;

    // เรียก auto adjust slope
    if (typeof autoAdjustDefaultSlope === "function") {
      autoAdjustDefaultSlope();
    }
    if (typeof setupSlopeFactorListener === "function") {
      setupSlopeFactorListener();
    }
  }

  // Custom Instruction Prompt
  if (project.ai_context?.last_used_prompt && document.getElementById("customInstructionPrompt")) {
    document.getElementById("customInstructionPrompt").value = project.ai_context.last_used_prompt || "";
  }

  // BOQ Items
  if (project.items && Array.isArray(project.items) && project.items.length > 0) {
    if (typeof lastRawBOQItems !== "undefined") {
      for (let i = 0; i < project.items.length; i++) {
        const item = project.items[i];
        if (!item._id) item._id = "item_" + Date.now() + "_" + i;
        item.unit_price = item.unit_price !== undefined ? parseFloat(item.unit_price) : 0;
        if (typeof calculateItemTotals === "function") {
          calculateItemTotals(item);
        }
      }
      lastRawBOQItems = project.items;
    }
    if (typeof renderBOQTable === "function") {
      renderBOQTable(project.items);
    }
    const recalcBtn = document.getElementById("recalcBtn");
    if (recalcBtn) recalcBtn.disabled = false;
    const resultCard = document.getElementById("resultCard");
    if (resultCard) resultCard.style.display = "block";
  } else {
    if (typeof lastRawBOQItems !== "undefined") {
      lastRawBOQItems = [];
    }
    if (typeof renderBOQTable === "function") {
      renderBOQTable([]);
    }
  }

  // แสดงข้อมูล project_template และ ai_context บน status bar
  const statusDiv = document.getElementById("status");
  if (statusDiv && project.project_template) {
    const pt = project.project_template;
    let tags = [];
    if (pt.has_steel_structure) tags.push("🏗️ โครงเหล็ก");
    if (pt.has_concrete_structure) tags.push("🏢 ค.ส.ล.");
    if (pt.floor_count >= 2) tags.push("📐 " + pt.floor_count + " ชั้น");
    if (pt.has_aluminum_composite) tags.push("⚠️ มี Aluminum Composite");
    if (tags.length > 0) {
      statusDiv.innerText = "📂 โหลดโครงการ: " + (project.projectName || "ไม่ระบุชื่อ") + " | " + tags.join(" | ");
    }
  }
}

/* ==========================================================
   อัปเดต Active Bar Display (รองรับ ID ทั้งสองเวอร์ชัน)
   ========================================================== */
function updateActiveBarDisplay(projectName, customerName, fileName) {
  const activeProjectName = document.getElementById("activeProjectNameDisplay") || document.getElementById("activeProjectDisplay");
  const activeCustomerName = document.getElementById("activeCustomerDisplay");
  const activeFileName = document.getElementById("activeFileNameDisplay") || document.getElementById("activePlanFileDisplay");

  if (activeProjectName) activeProjectName.innerText = projectName || "โครงการทั่วไป (ยังไม่ได้บันทึก)";
  if (activeCustomerName) activeCustomerName.innerText = customerName ? "[ลูกค้า: " + customerName + "]" : "[ลูกค้า: ไม่ระบุ]";
  if (activeFileName) activeFileName.innerText = fileName ? "📄 [ไฟล์แบบ: " + fileName + "]" : "📄 [ไฟล์แบบ: ยังไม่ได้เลือกแบบ]";
}

/* ==========================================================
   บันทึกโครงการปัจจุบัน
   ========================================================== */
async function saveCurrentProject() {
  const projectName = document.getElementById("metaProjectName").value.trim();
  if (!projectName) {
    alert("กรุณากรอกชื่อโครงการก่อนบันทึก");
    return;
  }

  const projectData = {
    id: currentProjectId || ("proj_" + Date.now() + "_" + Math.floor(Math.random() * 10000)),
    createdAt: currentProjectId ? undefined : new Date().toISOString()
  };

  if (!currentProjectId) {
    // โครงการใหม่ → ใช้ createdAt
    const existingProject = await getProjectById(projectData.id);
    if (!existingProject) {
      projectData.createdAt = new Date().toISOString();
    }
  }

  await saveProjectToDB(projectData);
  await refreshProjectList();

  const statusDiv = document.getElementById("status");
  if (statusDiv) {
    statusDiv.innerText = "💾 บันทึกโครงการ '" + projectName + "' เรียบร้อยแล้ว ✅";
    setTimeout(() => {
      if (statusDiv.innerText.includes("บันทึกโครงการ")) {
        statusDiv.innerText = "";
      }
    }, 2500);
  }
}

/* ==========================================================
   สร้างโครงการใหม่
   ========================================================== */
async function createNewProject() {
  if (typeof lastRawBOQItems !== "undefined" && lastRawBOQItems && lastRawBOQItems.length > 0) {
    if (!confirm("คุณมีข้อมูล BOQ ที่ยังไม่ได้บันทึก ต้องการบันทึกก่อนสร้างโครงการใหม่หรือไม่?\n\nกด OK = บันทึกก่อน\nกด Cancel = สร้างใหม่โดยไม่บันทึก")) {
      // ไม่บันทึก → ล้างข้อมูล
    } else {
      await saveCurrentProject();
    }
  }

  // ล้าง UI
  document.getElementById("metaProjectName").value = "";
  document.getElementById("metaCustomerName").value = "";
  document.getElementById("metaPlanFileName").value = "";
  document.getElementById("metaProjectCode").value = "";
  document.getElementById("metaEstimator").value = "";
  document.getElementById("customInstructionPrompt").value = "";
  updateActiveBarDisplay("", "", "");

  if (typeof lastRawBOQItems !== "undefined") {
    lastRawBOQItems = [];
  }
  if (typeof renderBOQTable === "function") {
    renderBOQTable([]);
  }
  if (typeof measuredShapes !== "undefined") {
    measuredShapes = [];
  }
  if (typeof measuredLines !== "undefined") {
    measuredLines = [];
  }
  if (typeof currentPolygonPoints !== "undefined") {
    currentPolygonPoints = [];
  }
  if (typeof pixelsPerMeter !== "undefined") {
    pixelsPerMeter = null;
  }
  if (typeof calibrationLine !== "undefined") {
    calibrationLine = null;
  }

  currentProjectId = null;
  document.getElementById("recalcBtn").disabled = true;
  document.getElementById("resultCard").style.display = "none";

  const statusDiv = document.getElementById("status");
  if (statusDiv) statusDiv.innerText = "🆕 สร้างโครงการใหม่เรียบร้อยแล้ว พร้อมเริ่มถอดแบบ";
}

/* ==========================================================
   สลับแท็บ & ค้นหาใน Project Manager (NEW)
   ========================================================== */
window.switchProjectTab = function(tab) {
  window.currentProjectTab = tab;
  const tabAll = document.getElementById("tabAllProjects");
  const tabCust = document.getElementById("tabByCustomer");
  if (tabAll) tabAll.classList.toggle("active", tab === "all");
  if (tabCust) tabCust.classList.toggle("active", tab === "customer");
  refreshProjectList();
};

window.filterProjectList = async function() {
  await refreshProjectList();
};

/* ==========================================================
   รีเฟรชรายการโครงการใน Project Manager (รองรับ Flat และจัดกลุ่มลูกค้า)
   ========================================================== */
async function refreshProjectList() {
  const container = document.getElementById("projectListContainer");
  if (!container) return;

  const searchInput = document.getElementById("projectSearchInput");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  let projects = await getAllProjectsFromDB();
  projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  if (query) {
    projects = projects.filter(p => {
      const name = (p.projectName || "").toLowerCase();
      const cust = (p.customerName || "").toLowerCase();
      const plan = (p.planFileName || "").toLowerCase();
      const code = (p.projectCode || "").toLowerCase();
      return name.includes(query) || cust.includes(query) || plan.includes(query) || code.includes(query);
    });
  }

  if (projects.length === 0) {
    container.innerHTML = '<div class="empty-project-hint" style="text-align: center; padding: 30px; color: #64748b;"><span>📭</span><p>ไม่พบโครงการที่บันทึกไว้</p></div>';
    return;
  }

  const activeTab = window.currentProjectTab || "all";

  if (activeTab === "customer") {
    // จัดกลุ่มตามชื่อลูกค้า
    const groups = {};
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const cust = p.customerName ? p.customerName.trim() : "ไม่ระบุชื่อลูกค้า";
      if (!groups[cust]) groups[cust] = [];
      groups[cust].push(p);
    }

    let html = "";
    for (const custName in groups) {
      const groupProjects = groups[custName];
      html += `
        <div class="customer-master-card">
          <div class="customer-master-header">
            <div class="customer-header-title">
              <span>👤 ${custName}</span>
              <span class="customer-count-badge">${groupProjects.length} โครงการ</span>
            </div>
          </div>
          <div class="customer-project-sublist">
      `;
      for (let j = 0; j < groupProjects.length; j++) {
        const p = groupProjects[j];
        const itemCount = (p.items && Array.isArray(p.items)) ? p.items.length : 0;
        const totalMB = (p.items && Array.isArray(p.items))
          ? p.items.reduce((sum, it) => sum + (parseFloat(it.value_mb) || 0), 0)
          : 0;
        const isActive = currentProjectId === p.id ? "active-project" : "";
        html += `
          <div class="customer-subproject-row ${isActive}" onclick="selectProject('${p.id}')" style="cursor:pointer;">
            <div>
              <div style="font-weight: bold; color: #0f172a;">${p.projectName || "โครงการที่ไม่มีชื่อ"}</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                📄 ${p.planFileName || "-"} | 📦 ${itemCount} รายการ | 💰 ${totalMB.toFixed(2)} MB
              </div>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;" onclick="event.stopPropagation();">
              <button type="button" class="btn-icon-sm" title="ทำสำเนา" onclick="duplicateProject('${p.id}')">📋</button>
              <button type="button" class="btn-icon-sm btn-delete-sm" title="ลบโครงการ" onclick="deleteProject('${p.id}')">🗑️</button>
            </div>
          </div>
        `;
      }
      html += `
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  } else {
    // แสดงรายการแบบ Flat List
    let html = "";
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const itemCount = (p.items && Array.isArray(p.items)) ? p.items.length : 0;
      const totalMB = (p.items && Array.isArray(p.items))
        ? p.items.reduce((sum, it) => sum + (parseFloat(it.value_mb) || 0), 0)
        : 0;
      const statusLabel = p.status === "completed" ? "✅ เสร็จสิ้น" :
                          p.status === "in_progress" ? "🔄 กำลังดำเนินการ" :
                          "📝 ร่าง";

      let typeBadge = "";
      if (p.project_template) {
        if (p.project_template.has_steel_structure) typeBadge += '<span class="mini-badge steel">โครงเหล็ก</span> ';
        if (p.project_template.has_concrete_structure) typeBadge += '<span class="mini-badge concrete">ค.ส.ล.</span> ';
        if (p.project_template.has_aluminum_composite) typeBadge += '<span class="mini-badge warning">Aluminum Composite</span> ';
      }
      if (p.ai_context?.detected_slope) {
        typeBadge += '<span class="mini-badge slope">' + p.ai_context.detected_slope + '°</span> ';
      }

      const isActive = currentProjectId === p.id ? "active-project" : "";

      html += `
        <div class="project-card-item ${isActive}" onclick="selectProject('${p.id}')" style="cursor:pointer;">
          <div class="project-card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="project-card-title" style="font-weight: bold;">${p.projectName || "โครงการที่ไม่มีชื่อ"}</div>
            <div style="display: flex; gap: 6px; align-items: center;" onclick="event.stopPropagation();">
              <span class="project-status-badge">${statusLabel}</span>
              <button type="button" class="btn-icon-sm" title="ทำสำเนา" onclick="duplicateProject('${p.id}')">📋</button>
              <button type="button" class="btn-icon-sm btn-delete-sm" title="ลบโครงการ" onclick="deleteProject('${p.id}')">🗑️</button>
            </div>
          </div>
          <div class="project-card-meta" style="font-size: 12px; color: #64748b; margin: 4px 0;">
            <span>👤 ${p.customerName || "-"}</span> |
            <span>📄 ${p.planFileName || "-"}</span> |
            <span>📦 ${itemCount} รายการ</span>
            ${totalMB > 0 ? ' | <span>💰 ' + totalMB.toFixed(2) + ' MB</span>' : ""}
          </div>
          <div class="project-card-tags">${typeBadge}</div>
          <div class="project-card-date" style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
            แก้ไขล่าสุด: ${formatDateTimeDetail(p.updatedAt)}
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  }
}

/* ==========================================================
   เปิด/ปิด Project Manager Modal
   ========================================================== */
async function openProjectManager() {
  document.getElementById("projectManagerModal").style.display = "flex";
  await refreshProjectList();
}

function closeModal(modalId) {
  if (typeof stopAutoPanLoop === "function") {
    stopAutoPanLoop();
  }
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = "none";
}

/* ==========================================================
   ฟอร์แมตวันที่
   ========================================================== */
function formatDateTimeDetail(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  return d.toLocaleDateString("th-TH") + " " + d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Fallback Aliases ป้องกันการเรียกฟังก์ชันสลับชื่อจากหน้าเว็บ
window.openProjectManagerModal = openProjectManager;
window.saveCurrentProjectToDB = saveCurrentProject;
window.createNewProjectPrompt = createNewProject;

/* ==========================================================
   Initialize: เปิด DB + ซ่อมแซม metadata เก่า
   ========================================================== */
(async function initDB() {
  try {
    await openDatabase();
    const repaired = await repairAllProjectMetadata();
    if (repaired > 0) {
      console.log("🛠️ ซ่อมแซม metadata ของ " + repaired + " โปรเจกต์เรียบร้อย");
    }
  } catch (err) {
    console.error("DB Init Error:", err);
  }
})();
