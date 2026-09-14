/* ==========================================================
   ระบบ INDEXEDDB จัดการโปรเจกต์และลูกค้า (PROJECT MANAGEMENT)
   ========================================================== */
const DB_NAME = "SCG_BOQ_DB";
const DB_VERSION = 1;
const STORE_NAME = "projects";
let dbInstance = null;
let currentProjectId = null;
window.currentProjectTab = "all"; // 'all' หรือ 'customer'

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("customerName", "customerName", { unique: false });
        store.createIndex("projectName", "projectName", { unique: false });
        store.createIndex("planFileName", "planFileName", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getAllProjectsFromDB() {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function saveProjectToDB(projectData) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(projectData);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteProjectFromDB(id) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// แปลงรูปแบบวัน-เวลาละเอียดระดับวินาที
function formatDateTimeDetail(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }) + " เวลา " + d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + " น.";
}

// คำนวณมูลค่ารวม (MB) ของโปรเจกต์
function getProjectTotalMB(p) {
  if (!p.items || !Array.isArray(p.items)) return 0;
  return p.items.reduce((sum, it) => sum + (parseFloat(it.value_mb) || 0), 0);
}

// ผูกเข้ากับ window โดยตรงเพื่อไม่ให้แคชหรือ scope บล็อกการเรียกใช้งาน
window.switchProjectTab = function(tab) {
  window.currentProjectTab = tab;
  const tabAll = document.getElementById("tabAllProjects");
  const tabCustomer = document.getElementById("tabByCustomer");
  if (tabAll && tabCustomer) {
    tabAll.classList.toggle("active", tab === "all");
    tabCustomer.classList.toggle("active", tab === "customer");
  }
  const currentQuery = document.getElementById("projectSearchInput") ? document.getElementById("projectSearchInput").value : "";
  renderProjectList(currentQuery);
};

function createNewProjectPrompt() {
  const cust = prompt("ระบุชื่อลูกค้า / เจ้าของโครงการ:", "คุณสมชาย ใจดี");
  if (cust === null) return;
  const prj = prompt("ระบุชื่อโครงการ / อาคาร:", "บ้านพักอาศัย 2 ชั้น");
  if (prj === null) return;

  const currentPlanName = document.getElementById("metaPlanFileName") ? document.getElementById("metaPlanFileName").value.trim() : "";
  const newId = "prj_" + Date.now();
  const newProject = {
    id: newId,
    customerName: cust.trim() || "ไม่ระบุชื่อลูกค้า",
    projectName: prj.trim() || "โครงการใหม่",
    planFileName: currentPlanName || "ยังไม่ได้เลือกไฟล์แบบแปลน",
    projectCode: "PRJ-" + new Date().getFullYear() + "-" + Math.floor(100 + Math.random() * 900),
    estimatorName: document.getElementById("metaEstimator").value || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      concreteOption: "auto",
      roofOption: "auto",
      roofSlopeDeg: "0.3",
      ceilingInsulationOption: "auto",
      roofInsulationOption: "auto",
      wallOption: "auto",
      floorOption: "auto",
      ceilingOption: "auto",
      woodOption: "auto",
      customInstructionPrompt: ""
    },
    items: []
  };

  saveProjectToDB(newProject).then(() => {
    loadProjectIntoUI(newProject);
    renderProjectList();
    closeModal("projectManagerModal");
  });
}

window.createNewProjectForCustomer = function(customerName) {
  const prj = prompt(`ระบุชื่อโครงการใหม่สำหรับลูกค้า "${customerName}":`, "อาคารพักอาศัย / ส่วนต่อเติม");
  if (prj === null || !prj.trim()) return;

  const currentPlanName = document.getElementById("metaPlanFileName") ? document.getElementById("metaPlanFileName").value.trim() : "";
  const newId = "prj_" + Date.now();
  const newProject = {
    id: newId,
    customerName: customerName,
    projectName: prj.trim(),
    planFileName: currentPlanName || "ยังไม่ได้เลือกไฟล์แบบแปลน",
    projectCode: "PRJ-" + new Date().getFullYear() + "-" + Math.floor(100 + Math.random() * 900),
    estimatorName: document.getElementById("metaEstimator").value || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      concreteOption: "auto",
      roofOption: "auto",
      roofSlopeDeg: "0.3",
      ceilingInsulationOption: "auto",
      roofInsulationOption: "auto",
      wallOption: "auto",
      floorOption: "auto",
      ceilingOption: "auto",
      woodOption: "auto",
      customInstructionPrompt: ""
    },
    items: []
  };

  saveProjectToDB(newProject).then(() => {
    loadProjectIntoUI(newProject);
    renderProjectList();
    closeModal("projectManagerModal");
  });
};

function openProjectManagerModal() {
  const currentQuery = document.getElementById("projectSearchInput") ? document.getElementById("projectSearchInput").value : "";
  renderProjectList(currentQuery);
  document.getElementById("projectManagerModal").style.display = "flex";
}

async function renderProjectList(filter = "") {
  const container = document.getElementById("projectListContainer");
  container.innerHTML = "<div style='text-align:center; padding:20px; color:#64748b;'>กำลังโหลด...</div>";
  const projects = await getAllProjectsFromDB();
  projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const query = (filter || "").toLowerCase().trim();

  // แยกการแสดงผลตามแท็บที่เลือก (all vs customer)
  if (window.currentProjectTab === "customer") {
    renderCustomerGroupedList(projects, query);
    return;
  }

  // --- มุมมอง: โครงการทั้งหมด (Flat List) ---
  const filtered = projects.filter(p => 
    (p.customerName || "").toLowerCase().includes(query) ||
    (p.projectName || "").toLowerCase().includes(query) ||
    (p.planFileName || "").toLowerCase().includes(query) ||
    (p.projectCode || "").toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:#64748b;">ไม่พบโครงการที่ค้นหา หรือยังไม่มีโครงการที่ถูกบันทึก</div>`;
    return;
  }

  container.innerHTML = "";
  filtered.forEach(p => {
    const isCurrent = p.id === currentProjectId;
    const totalMb = getProjectTotalMB(p);
    const div = document.createElement("div");
    div.className = `project-card-item ${isCurrent ? "active-project" : ""}`;
    div.innerHTML = `
      <div>
        <div style="font-size:15px; font-weight:bold; color:#0f172a;">
          🏢 ${p.projectName} 
          <span style="font-size:12px; font-weight:normal; color:#dc2626; margin-left:6px;">[${p.projectCode || "-"}]</span>
        </div>
        <div style="font-size:13px; color:#475569; margin-top:2px;">
          👤 ลูกค้า: <strong>${p.customerName}</strong> | 📦 รายการ BOQ: ${p.items ? p.items.length : 0} รายการ
        </div>
        <div style="font-size:12px; color:#0284c7; margin-top:3px; font-weight:600;">
          📄 ชื่อแบบแปลน: ${p.planFileName || "ไม่ระบุ"}
        </div>
        <div style="display:flex; gap:8px; align-items:center; margin-top:5px; flex-wrap:wrap;">
          <span class="timestamp-pill">🕒 ${formatDateTimeDetail(p.updatedAt)}</span>
          ${totalMb > 0 ? `<span class="project-value-pill">💰 มูลค่า: ${totalMb.toFixed(2)} MB</span>` : ''}
        </div>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        ${isCurrent ? '<span style="font-size:12px; font-weight:bold; color:#16a34a; margin-right:8px;">กำลังเปิดใช้งาน</span>' : 
        `<button type="button" style="background:#0284c7; padding:6px 12px; font-size:12px; flex:none;" onclick="selectProject('${p.id}')">📂 เปิด</button>`}
        <button type="button" style="background:#475569; padding:6px 10px; font-size:12px; flex:none;" onclick="duplicateProject('${p.id}')">📋 สำเนา</button>
        <button type="button" class="btn-delete" style="padding:6px 10px; font-size:12px;" onclick="removeProject('${p.id}', '${p.projectName}')">🗑️</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderCustomerGroupedList(projects, query) {
  const container = document.getElementById("projectListContainer");
  container.innerHTML = "";

  // จัดกลุ่มโครงการตามชื่อลูกค้า (Group by Customer Name)
  const customerMap = {};
  projects.forEach(p => {
    const custKey = (p.customerName || "ไม่ระบุชื่อลูกค้า").trim();
    if (!customerMap[custKey]) {
      customerMap[custKey] = [];
    }
    customerMap[custKey].push(p);
  });

  const customerNames = Object.keys(customerMap);

  // กรองตามคำค้นหา
  const filteredCustomers = customerNames.filter(cust => {
    if (!query) return true;
    if (cust.toLowerCase().includes(query)) return true;
    return customerMap[cust].some(p => 
      (p.projectName || "").toLowerCase().includes(query) ||
      (p.planFileName || "").toLowerCase().includes(query) ||
      (p.projectCode || "").toLowerCase().includes(query)
    );
  });

  if (filteredCustomers.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:#64748b;">ไม่พบรายชื่อลูกค้าหรือโครงการที่ค้นหา</div>`;
    return;
  }

  filteredCustomers.forEach(cust => {
    let prjList = customerMap[cust];
    if (query && !cust.toLowerCase().includes(query)) {
      prjList = prjList.filter(p => 
        (p.projectName || "").toLowerCase().includes(query) ||
        (p.planFileName || "").toLowerCase().includes(query) ||
        (p.projectCode || "").toLowerCase().includes(query)
      );
    }

    const customerTotalMb = prjList.reduce((sum, p) => sum + getProjectTotalMB(p), 0);

    const groupCard = document.createElement("div");
    groupCard.className = "customer-master-card";

    // ส่วนหัวของลูกค้า (Customer Folder Header)
    const header = document.createElement("div");
    header.className = "customer-master-header";
    header.innerHTML = `
      <div class="customer-header-title">
        <span>👤 ลูกค้า: ${cust}</span>
        <span class="customer-count-badge">${prjList.length} โครงการ</span>
        ${customerTotalMb > 0 ? `<span style="font-size:12px; font-weight:800; color:#38bdf8; margin-left:6px;">(รวม ${customerTotalMb.toFixed(2)} MB)</span>` : ''}
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button type="button" class="btn-add-for-customer" onclick="createNewProjectForCustomer('${cust}')">➕ เพิ่มโครงการให้ลูกค้านี้</button>
      </div>
    `;
    groupCard.appendChild(header);

    // รายการโครงการย่อยของลูกค้ารายนี้ (Subproject List)
    const prjContainer = document.createElement("div");
    prjContainer.className = "customer-project-sublist";

    prjList.forEach(p => {
      const isCurrent = p.id === currentProjectId;
      const subTotalMb = getProjectTotalMB(p);
      const itemDiv = document.createElement("div");
      itemDiv.className = `customer-subproject-row ${isCurrent ? "active-project" : ""}`;
      itemDiv.innerHTML = `
        <div>
          <div style="font-size: 14px; font-weight: bold; color: #0f172a;">
            🏢 ${p.projectName} 
            <span style="font-size: 11px; font-weight: normal; color: #dc2626; margin-left: 4px;">[${p.projectCode || "-"}]</span>
          </div>
          <div style="font-size: 12px; color: #0284c7; margin-top: 2px; font-weight: 600;">
            📄 แบบแปลน: ${p.planFileName || "ไม่ระบุชื่อไฟล์แบบ"}
          </div>
          <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px; flex-wrap: wrap;">
            <span class="timestamp-pill">🕒 ${formatDateTimeDetail(p.updatedAt)}</span>
            <span style="font-size: 11px; color: #64748b;">📦 ${p.items ? p.items.length : 0} รายการ</span>
            ${subTotalMb > 0 ? `<span class="project-value-pill">💰 ${subTotalMb.toFixed(2)} MB</span>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          ${isCurrent ? '<span style="font-size: 12px; font-weight: bold; color: #16a34a; margin-right: 6px;">กำลังเปิดใช้งาน</span>' : 
          `<button type="button" style="background: #0284c7; padding: 6px 12px; font-size: 12px; flex: none;" onclick="selectProject('${p.id}')">📂 เปิด</button>`}
          <button type="button" style="background: #475569; padding: 6px 10px; font-size: 12px; flex: none;" onclick="duplicateProject('${p.id}')">📋 สำเนา</button>
          <button type="button" class="btn-delete" style="padding: 6px 10px; font-size: 12px;" onclick="removeProject('${p.id}', '${p.projectName}')">🗑️</button>
        </div>
      `;
      prjContainer.appendChild(itemDiv);
    });

    groupCard.appendChild(prjContainer);
    container.appendChild(groupCard);
  });
}

function filterProjectList() {
  const q = document.getElementById("projectSearchInput").value;
  renderProjectList(q);
}

async function selectProject(id) {
  const projects = await getAllProjectsFromDB();
  const p = projects.find(it => it.id === id);
  if (p) {
    loadProjectIntoUI(p);
    closeModal("projectManagerModal");
  }
}

async function duplicateProject(id) {
  const projects = await getAllProjectsFromDB();
  const p = projects.find(it => it.id === id);
  if (!p) return;
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = "prj_" + Date.now();
  copy.projectName += " (สำเนา)";
  copy.projectCode += "-COPY";
  copy.updatedAt = new Date().toISOString();
  await saveProjectToDB(copy);
  const currentQuery = document.getElementById("projectSearchInput") ? document.getElementById("projectSearchInput").value : "";
  renderProjectList(currentQuery);
}

async function removeProject(id, name) {
  if (confirm(`คุณต้องการลบโครงการ "${name}" ออกจากเครื่องใช่หรือไม่?`)) {
    await deleteProjectFromDB(id);
    if (currentProjectId === id) {
      currentProjectId = null;
      updateActiveBarDisplay("โครงการทั่วไป (ยังไม่ได้บันทึก)", "ไม่ระบุ", "ยังไม่ได้เลือกแบบ");
    }
    const currentQuery = document.getElementById("projectSearchInput") ? document.getElementById("projectSearchInput").value : "";
    renderProjectList(currentQuery);
  }
}

function loadProjectIntoUI(p) {
  currentProjectId = p.id;
  document.getElementById("metaCustomerName").value = p.customerName || "";
  document.getElementById("metaProjectName").value = p.projectName || "";
  document.getElementById("metaPlanFileName").value = p.planFileName || "";
  document.getElementById("metaProjectCode").value = p.projectCode || "";
  document.getElementById("metaEstimator").value = p.estimatorName || "";

  if (p.settings) {
    const s = p.settings;
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

  lastRawBOQItems = p.items || [];
  renderBOQTable(lastRawBOQItems);
  updateActiveBarDisplay(p.projectName, p.customerName, p.planFileName);
}

function updateActiveBarDisplay(prjName, custName, planName) {
  document.getElementById("activeProjectDisplay").innerText = prjName || "โครงการทั่วไป";
  document.getElementById("activeCustomerDisplay").innerText = `[ลูกค้า: ${custName || "ไม่ระบุ"}]`;
  const planDisplay = document.getElementById("activePlanFileDisplay");
  if (planDisplay) {
    planDisplay.innerText = `📄 [ไฟล์แบบ: ${planName || "ยังไม่ได้เลือกแบบ"}]`;
  }
}

async function saveCurrentProjectToDB() {
  const cust = document.getElementById("metaCustomerName").value.trim() || "ไม่ระบุชื่อลูกค้า";
  const prj = document.getElementById("metaProjectName").value.trim() || "โครงการทั่วไป";
  const planName = document.getElementById("metaPlanFileName").value.trim() || "ไม่ระบุชื่อไฟล์แบบ";
  const code = document.getElementById("metaProjectCode").value.trim() || ("PRJ-" + new Date().getFullYear());
  const estimator = document.getElementById("metaEstimator").value.trim();

  if (!currentProjectId) {
    currentProjectId = "prj_" + Date.now();
  }

  const projectData = {
    id: currentProjectId,
    customerName: cust,
    projectName: prj,
    planFileName: planName,
    projectCode: code,
    estimatorName: estimator,
    updatedAt: new Date().toISOString(),
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

  await saveProjectToDB(projectData);
  updateActiveBarDisplay(prj, cust, planName);
  alert(`บันทึกโครงการ "${prj}" (แบบ: ${planName}) ของลูกค้า "${cust}" ลงใน IndexedDB เรียบร้อยแล้ว!`);
}
