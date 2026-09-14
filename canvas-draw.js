/* ==========================================================================
   SCG AI BOQ & Concrete Structure Estimator - Canvas & Drawing Logic
   File: canvas-draw.js
   ========================================================================== */

// ตัวแปรและสถานะสำหรับ Canvas และระบบวาดวัดขนาด
let zoomScale = 1.0;
let panOffsetX = 0;
let panOffsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let startX = 0;
let startY = 0;
let isDrawing = false;
let isSpacePressed = false;
let isShiftPressed = false;

// ค่าคงที่สำหรับการเลื่อนขอบจอและการจับจุด (Snap)
const EDGE_PAN_THRESHOLD = 50;
const EDGE_PAN_SPEED = 0.6;
const SNAP_RADIUS = 15;

let autoPanAnimationId = null;
let autoPanVelocity = { x: 0, y: 0 };
let lastClientMousePos = { x: 0, y: 0 };
let currentMousePos = { x: 0, y: 0 };
let activeSnappedPoint = null;

// ข้อมูลรูปทรงที่ถูกวัดและสเกล
let measuredShapes = [];
let measuredLines = [];
let currentPolygonPoints = [];
let currentDragBox = null;
let currentDragLine = null;
let calibrationLine = null;
let pixelsPerMeter = null;
let currentDrawPageImg = null;
let currentToolMode = "pan";

// ฟังก์ชันปรับปรุงการแสดงผล Transform ของ Canvas
function updateTransform() {
  const canvas = document.getElementById("drawCanvas");
  if (!canvas) return;
  canvas.style.transformOrigin = "0 0";
  canvas.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${zoomScale})`;
  const display = document.getElementById("zoomLevelDisplay");
  if (display) {
    display.innerText = `${Math.round(zoomScale * 100)}%`;
  }
}

// ฟังก์ชันซูมเข้าและซูมออกทีละขั้น
function zoomStep(factor) {
  const viewport = document.getElementById("canvasViewport");
  if (!viewport) return;
  const vRect = viewport.getBoundingClientRect();
  const centerX = vRect.width / 2;
  const centerY = vRect.height / 2;
  const newScale = Math.min(Math.max(0.1, zoomScale * factor), 10.0);
  panOffsetX = centerX - (centerX - panOffsetX) * (newScale / zoomScale);
  panOffsetY = centerY - (centerY - panOffsetY) * (newScale / zoomScale);
  zoomScale = newScale;
  updateTransform();
}

// รีเซ็ตการซูมและตำแหน่งกึ่งกลาง
function resetZoom() {
  zoomScale = 1.0;
  panOffsetX = 0;
  panOffsetY = 0;
  updateTransform();
}

// ปรับขนาดภาพแบบแปลนให้พอดีกับกรอบ Viewport
function fitToViewport() {
  if (!currentDrawPageImg) return;
  const viewport = document.getElementById("canvasViewport");
  if (!viewport) return;
  const vRect = viewport.getBoundingClientRect();
  const scaleW = vRect.width / currentDrawPageImg.width;
  const scaleH = vRect.height / currentDrawPageImg.height;
  zoomScale = Math.min(scaleW, scaleH) * 0.95;
  panOffsetX = (vRect.width - currentDrawPageImg.width * zoomScale) / 2;
  panOffsetY = (vRect.height - currentDrawPageImg.height * zoomScale) / 2;
  updateTransform();
}

// แปลงพิกัดจากหน้าจอ (Client) ไปเป็นพิกัดจริงบน Canvas
function getCanvasCoordsFromClient(clientX, clientY) {
  const viewport = document.getElementById("canvasViewport");
  const vRect = viewport.getBoundingClientRect();
  const x = clientX - vRect.left;
  const y = clientY - vRect.top;
  const canvasX = (x - panOffsetX) / zoomScale;
  const canvasY = (y - panOffsetY) / zoomScale;
  return { x: canvasX, y: canvasY };
}

function getCanvasCoords(e) {
  return getCanvasCoordsFromClient(e.clientX, e.clientY);
}

// ฟังก์ชัน Magnetic Snap ช่วยดูดจุดมุมและปลายเส้นอัตโนมัติ
function findMagneticSnapPoint(targetPos) {
  let closestPt = null;
  let minDist = SNAP_RADIUS / zoomScale;
  const checkPoint = (pt) => {
    if (!pt) return;
    const dist = Math.sqrt(Math.pow(targetPos.x - pt.x, 2) + Math.pow(targetPos.y - pt.y, 2));
    if (dist < minDist) {
      minDist = dist;
      closestPt = { x: pt.x, y: pt.y };
    }
  };

  currentPolygonPoints.forEach(checkPoint);
  measuredShapes.forEach(shape => {
    if (shape.type === 'rect') {
      checkPoint({ x: shape.x, y: shape.y });
      checkPoint({ x: shape.x + shape.w, y: shape.y });
      checkPoint({ x: shape.x + shape.w, y: shape.y + shape.h });
      checkPoint({ x: shape.x, y: shape.h });
    } else if (shape.type === 'polygon' && shape.points) {
      shape.points.forEach(checkPoint);
    }
  });

  measuredLines.forEach(l => {
    checkPoint({ x: l.x1, y: l.y1 });
    checkPoint({ x: l.x2, y: l.y2 });
  });

  return closestPt;
}

// ล็อกมุมฉากและมุม 45 องศา (Ortho Lock เมื่อกด Shift)
function applyOrthoLock(baseX, baseY, targetX, targetY) {
  const dx = targetX - baseX;
  const dy = targetY - baseY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 2) return { x: targetX, y: targetY };
  let angle = Math.atan2(dy, dx);
  const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: baseX + dist * Math.cos(snapAngle),
    y: baseY + dist * Math.sin(snapAngle)
  };
}

// อัปเดตพิกัดและขนาดของเส้นหรือกรอบที่กำลังวาด
function updateActiveMeasurementShape() {
  const rawCoords = getCanvasCoordsFromClient(lastClientMousePos.x, lastClientMousePos.y);
  currentMousePos = rawCoords;
  activeSnappedPoint = findMagneticSnapPoint(rawCoords);
  let effectiveX = activeSnappedPoint ? activeSnappedPoint.x : rawCoords.x;
  let effectiveY = activeSnappedPoint ? activeSnappedPoint.y : rawCoords.y;

  if (isShiftPressed && !activeSnappedPoint) {
    const locked = applyOrthoLock(startX, startY, effectiveX, effectiveY);
    effectiveX = locked.x;
    effectiveY = locked.y;
  }

  if (isDrawing) {
    if (currentToolMode === "calibrate" || currentToolMode === "line") {
      currentDragLine = { x1: startX, y1: startY, x2: effectiveX, y2: effectiveY };
    } else if (currentToolMode === "area") {
      let x = Math.min(startX, effectiveX);
      let y = Math.min(startY, effectiveY);
      let w = Math.abs(effectiveX - startX);
      let h = Math.abs(effectiveY - startY);
      if (isShiftPressed && !activeSnappedPoint) {
        const side = Math.max(w, h);
        w = side;
        h = side;
        x = (effectiveX < startX) ? startX - side : startX;
        y = (effectiveY < startY) ? startY - side : startY;
      }
      currentDragBox = { x, y, w, h };
    }
  }
  redrawCanvas();
}

// Loop เลื่อนหน้าจออัตโนมัติเมื่อลากเมาส์ชิดขอบจอ (Edge Panning Loop)
function startAutoPanLoop() {
  if (autoPanAnimationId !== null) return;
  const loop = () => {
    if (autoPanVelocity.x !== 0 || autoPanVelocity.y !== 0) {
      panOffsetX += autoPanVelocity.x;
      panOffsetY += autoPanVelocity.y;
      updateTransform();
      updateActiveMeasurementShape();
    }
    autoPanAnimationId = requestAnimationFrame(loop);
  };
  autoPanAnimationId = requestAnimationFrame(loop);
}

function stopAutoPanLoop() {
  if (autoPanAnimationId !== null) {
    cancelAnimationFrame(autoPanAnimationId);
    autoPanAnimationId = null;
  }
  autoPanVelocity = { x: 0, y: 0 };
}

function checkEdgePanning(clientX, clientY) {
  const isDrawingActive = isDrawing || (currentToolMode === "polygon" && currentPolygonPoints.length > 0);
  if (!isDrawingActive || currentToolMode === "pan") {
    stopAutoPanLoop();
    return;
  }
  const viewport = document.getElementById("canvasViewport");
  if (!viewport) return;
  const vRect = viewport.getBoundingClientRect();
  let vx = 0;
  let vy = 0;

  if (clientX < vRect.left + EDGE_PAN_THRESHOLD) {
    const dist = (vRect.left + EDGE_PAN_THRESHOLD) - clientX;
    vx = Math.min(30, dist * EDGE_PAN_SPEED + 3);
  } else if (clientX > vRect.right - EDGE_PAN_THRESHOLD) {
    const dist = clientX - (vRect.right - EDGE_PAN_THRESHOLD);
    vx = -Math.min(30, dist * EDGE_PAN_SPEED + 3);
  }

  if (clientY < vRect.top + EDGE_PAN_THRESHOLD) {
    const dist = (vRect.top + EDGE_PAN_THRESHOLD) - clientY;
    vy = Math.min(30, dist * EDGE_PAN_SPEED + 3);
  } else if (clientY > vRect.bottom - EDGE_PAN_THRESHOLD) {
    const dist = clientY - (vRect.bottom - EDGE_PAN_THRESHOLD);
    vy = -Math.min(30, dist * EDGE_PAN_SPEED + 3);
  }

  autoPanVelocity = { x: vx, y: vy };
  if (vx !== 0 || vy !== 0) {
    startAutoPanLoop();
  } else {
    stopAutoPanLoop();
  }
}

// คำนวณพื้นที่และเส้นรอบรูปหลายเหลี่ยมตามสเกลจริง (Polygon Metrics)
function calculatePolygonMetrics(points, ppm) {
  if (!points || points.length < 3 || !ppm) return { flatAreaM: 0, perimeterM: 0 };  
  let areaSum = 0;
  let periSum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    areaSum += (p1.x * p2.y) - (p2.x * p1.y);
    const dx = (p2.x - p1.x) / ppm;
    const dy = (p2.y - p1.y) / ppm;
    periSum += Math.sqrt(dx * dx + dy * dy);
  }
  const pixelArea = Math.abs(areaSum) / 2;
  const flatAreaM = pixelArea / (ppm * ppm);
  return { flatAreaM, perimeterM: periSum };
}

// ระบบบันทึก Event การกดคลิกและการลากเมาส์บน Canvas
function setupDrawEvents() {
  const viewport = document.getElementById("canvasViewport");
  const canvas = document.getElementById("drawCanvas");
  if (!viewport || !canvas) return;

  viewport.oncontextmenu = (e) => e.preventDefault();
  viewport.onwheel = (e) => {
    e.preventDefault();
    const vRect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - vRect.left;
    const mouseY = e.clientY - vRect.top;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.min(Math.max(0.1, zoomScale * zoomFactor), 10.0);
    panOffsetX = mouseX - (mouseX - panOffsetX) * (newScale / zoomScale);
    panOffsetY = mouseY - (mouseY - panOffsetY) * (newScale / zoomScale);
    zoomScale = newScale;
    updateTransform();
  };

  window.addEventListener("keydown", (e) => {
    const modal = document.getElementById("drawModal");
    if (e.code === "Space" && !isSpacePressed && modal && modal.style.display === "flex") {
      isSpacePressed = true;
      viewport.style.cursor = "grab";
      canvas.style.cursor = "grab";
    }
    if (e.key === "Shift") {
      isShiftPressed = true;
      updateActiveMeasurementShape();
    }
    if (e.key === "Escape" && currentToolMode === "polygon") {
      currentPolygonPoints = [];
      stopAutoPanLoop();
      redrawCanvas();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      isSpacePressed = false;
      viewport.style.cursor = (currentToolMode === "pan") ? "grab" : "default";
      canvas.style.cursor = (currentToolMode === "pan") ? "grab" : "crosshair";
    }
    if (e.key === "Shift") {
      isShiftPressed = false;
      updateActiveMeasurementShape();
    }
  });

  viewport.onmousedown = (e) => {
    if (currentToolMode === "pan" || e.button === 2 || (e.button === 0 && isSpacePressed)) {
      isPanning = true;
      panStartX = e.clientX - panOffsetX;
      panStartY = e.clientY - panOffsetY;
      viewport.style.cursor = "grabbing";
      canvas.style.cursor = "grabbing";
      return;
    }
    if (e.button === 0) {
      lastClientMousePos = { x: e.clientX, y: e.clientY };
      const rawCoords = getCanvasCoords(e);
      const coords = activeSnappedPoint || rawCoords;
      if (currentToolMode === "polygon") {
        handlePolygonClick(coords);
        return;
      }
      startX = coords.x;
      startY = coords.y;
      isDrawing = true;
    }
  };

  viewport.ondblclick = (e) => {
    if (currentToolMode === "polygon" && currentPolygonPoints.length >= 3) {
      closeAndFinishPolygon();
    }
  };

  window.addEventListener("mousemove", (e) => {
    lastClientMousePos = { x: e.clientX, y: e.clientY };
    if (isPanning) {
      panOffsetX = e.clientX - panStartX;
      panOffsetY = e.clientY - panStartY;
      updateTransform();
      return;
    }
    checkEdgePanning(e.clientX, e.clientY);
    updateActiveMeasurementShape();
  });

  window.addEventListener("mouseup", (e) => {
    stopAutoPanLoop();
    if (isPanning) {
      isPanning = false;
      viewport.style.cursor = (currentToolMode === "pan" || isSpacePressed) ? "grab" : "default";
      canvas.style.cursor = (currentToolMode === "pan" || isSpacePressed) ? "grab" : "crosshair";
      return;
    }
    if (currentToolMode === "polygon") return;
    if (!isDrawing) return;
    isDrawing = false;

    if (currentToolMode === "calibrate" && currentDragLine) {
      const dx = currentDragLine.x2 - currentDragLine.x1;
      const dy = currentDragLine.y2 - currentDragLine.y1;
      const pixelDist = Math.sqrt(dx * dx + dy * dy);
      if (pixelDist > 15) {
        const inputVal = prompt("📏 เส้นที่คุณลากยาวจริงกี่เมตร? (เช่น 4.0 หรือ 1.5):", "4.0");
        if (inputVal && !isNaN(parseFloat(inputVal)) && parseFloat(inputVal) > 0) {
          const realMeters = parseFloat(inputVal);
          pixelsPerMeter = pixelDist / realMeters;
          calibrationLine = { ...currentDragLine, realMeters: realMeters };
          updateScaleBadge();
          switchToolMode("area");
        }
      }
      currentDragLine = null;
    } else if (currentToolMode === "line" && currentDragLine) {
      if (pixelsPerMeter) {
        const dx = (currentDragLine.x2 - currentDragLine.x1) / pixelsPerMeter;
        const dy = (currentDragLine.y2 - currentDragLine.y1) / pixelsPerMeter;
        const lenM = Math.sqrt(dx * dx + dy * dy);
        measuredLines.push({ ...currentDragLine, lengthM: lenM });
      }
      currentDragLine = null;
      updateBoxCounter();
    } else if (currentToolMode === "area" && currentDragBox) {
      if (currentDragBox.w > 5 && currentDragBox.h > 5) {
        const wM = pixelsPerMeter ? (currentDragBox.w / pixelsPerMeter) : 0;
        const hM = pixelsPerMeter ? (currentDragBox.h / pixelsPerMeter) : 0;
        const flatArea = wM * hM;
        measuredShapes.push({
          type: 'rect',
          x: currentDragBox.x,
          y: currentDragBox.y,
          w: currentDragBox.w,
          h: currentDragBox.h,
          flatAreaM: flatArea,
          slopeAreaM: flatArea,
          perimeterM: 2 * (wM + hM)
        });
      }
      currentDragBox = null;
      updateBoxCounter();
    }
    redrawCanvas();
  });
}

// จัดการการคลิกจุดของ Polygon
function handlePolygonClick(coords) {
  if (!pixelsPerMeter) {
    alert("กรุณากดปุ่ม '📏 ตั้งสเกล' ก่อนเริ่มวาดรูปหลายเหลี่ยม");
    return;
  }
  if (currentPolygonPoints.length >= 3) {
    const firstPt = currentPolygonPoints[0];
    const dist = Math.sqrt(Math.pow(coords.x - firstPt.x, 2) + Math.pow(coords.y - firstPt.y, 2));
    if (dist < 18 / zoomScale) {
      closeAndFinishPolygon();
      return;
    }
  }
  let finalCoord = coords;
  if (isShiftPressed && currentPolygonPoints.length > 0 && !activeSnappedPoint) {
    const lastPt = currentPolygonPoints[currentPolygonPoints.length - 1];
    finalCoord = applyOrthoLock(lastPt.x, lastPt.y, coords.x, coords.y);
  }
  currentPolygonPoints.push(finalCoord);
  redrawCanvas();
}

// ปิดและบันทึกรูปหลายเหลี่ยม
function closeAndFinishPolygon() {
  if (currentPolygonPoints.length < 3) return;
  const metrics = calculatePolygonMetrics(currentPolygonPoints, pixelsPerMeter);
  measuredShapes.push({
    type: 'polygon',
    points: [...currentPolygonPoints],
    flatAreaM: metrics.flatAreaM,
    slopeAreaM: metrics.flatAreaM,
    perimeterM: metrics.perimeterM
  });
  currentPolygonPoints = [];
  stopAutoPanLoop();
  updateBoxCounter();
  redrawCanvas();
}

// เลิกทำ (Undo) รูปทรงล่าสุด
function undoLastBox() {
  if (currentPolygonPoints.length > 0) {
    currentPolygonPoints.pop();
  } else if (measuredLines.length > 0) {
    measuredLines.pop();
  } else if (measuredShapes.length > 0) {
    measuredShapes.pop();
  }
  stopAutoPanLoop();
  updateBoxCounter();
  redrawCanvas();
}

// ล้างรูปทรงและเส้นที่วาดทั้งหมด
function clearAllDrawBoxes() {
  measuredShapes = [];
  measuredLines = [];
  currentPolygonPoints = [];
  currentDragBox = null;
  currentDragLine = null;
  activeSnappedPoint = null;
  stopAutoPanLoop();
  updateBoxCounter();
  redrawCanvas();
  const status = document.getElementById("drawStatus");
  if (status) status.innerText = "ล้างข้อมูลเรียบร้อยแล้ว ลากกรอบหรือคลิก Polygon ใหม่เพื่อวัด";
}

// สลับโหมดเครื่องมือวาด
function switchToolMode(mode) {
  currentToolMode = mode;
  const btnCalib = document.getElementById("btnModeCalib");
  const btnArea = document.getElementById("btnModeArea");
  const btnPoly = document.getElementById("btnModePoly");
  const btnLine = document.getElementById("btnModeLine");
  const btnPan = document.getElementById("btnModePan");

  if (btnCalib) btnCalib.classList.toggle("active", mode === "calibrate");
  if (btnArea) btnArea.classList.toggle("active", mode === "area");
  if (btnPoly) btnPoly.classList.toggle("active", mode === "polygon");
  if (btnLine) btnLine.classList.toggle("active", mode === "line");
  if (btnPan) btnPan.classList.toggle("active", mode === "pan");  

  const viewport = document.getElementById("canvasViewport");
  const canvas = document.getElementById("drawCanvas");
  const statusElem = document.getElementById("drawStatus");

  if (mode === "pan") {
    if (viewport) viewport.style.cursor = "grab";
    if (canvas) canvas.style.cursor = "grab";
    if (statusElem) statusElem.innerText = "✋ โหมดมือเลื่อนแบบ: คลิกซ้ายค้างแล้วลากเพื่อแพนดูแบบแปลนได้อย่างอิสระ";
  } else if (mode === "calibrate") {
    if (viewport) viewport.style.cursor = "default";
    if (canvas) canvas.style.cursor = "crosshair";
    if (statusElem) statusElem.innerText = "📏 โหมดตั้งสเกล: คลิกลากเส้นตรงทับผนังหรือเส้นบอกระยะ 1 เส้น (ลากชนขอบจอจะเลื่อนเอง)";
  } else if (mode === "polygon") {
    if (viewport) viewport.style.cursor = "default";
    if (canvas) canvas.style.cursor = "crosshair";
    if (statusElem) statusElem.innerText = "🔷 โหมด Polygon: คลิกวางจุดมุมเสา (ขอบจอเลื่อนเอง | ดับเบิลคลิกเพื่อปิดรูป)";
  } else if (mode === "area") {
    if (viewport) viewport.style.cursor = "default";
    if (canvas) canvas.style.cursor = "crosshair";
    if (statusElem) statusElem.innerText = "⬛ โหมดสี่เหลี่ยม: ลากกรอบสี่เหลี่ยมเพื่อวัดพื้นที่";
  } else if (mode === "line") {
    if (viewport) viewport.style.cursor = "default";
    if (canvas) canvas.style.cursor = "crosshair";
    if (statusElem) statusElem.innerText = "📏 โหมดเส้นตรง: คลิกลากเพื่อวัดความยาว";
  }
}

function updateScaleBadge() {
  const badge = document.getElementById("scaleBadge");
  if (!badge) return;
  if (pixelsPerMeter) {
    badge.innerText = `สเกล: 1 ม. = ${pixelsPerMeter.toFixed(1)} px`;
    badge.style.background = "#dcfce7";
    badge.style.color = "#15803d";
  } else {
    badge.innerText = "สเกล: ยังไม่ได้ตั้ง";
    badge.style.background = "#f1f5f9";
    badge.style.color = "#475569";
  }
}

function updateBoxCounter() {
  const counter = document.getElementById("boxCounter");
  if (!counter) return;
  const count = measuredShapes.length + measuredLines.length;
  counter.innerText = `${count} รูป/เส้น`;
}

// โหลดหน้าแปลนลง Canvas
async function loadDrawCanvasPage(pageNum) {
  if (typeof getPageImage !== "function") return;
  const pageResult = await getPageImage(pageNum);
  if (!pageResult) return;
  currentDrawPageImg = pageResult.image;
  const canvas = document.getElementById("drawCanvas");
  if (canvas && currentDrawPageImg) {
    canvas.width = currentDrawPageImg.width;
    canvas.height = currentDrawPageImg.height;
  }
  currentDragBox = null;
  currentDragLine = null;
  redrawCanvas();
}

async function onDrawPageChange() {
  const select = document.getElementById("drawPageSelect");
  if (!select) return;
  const pageNum = parseInt(select.value);
  measuredShapes = [];
  measuredLines = [];
  currentPolygonPoints = [];
  calibrationLine = null;
  pixelsPerMeter = null;
  updateScaleBadge();
  updateBoxCounter();
  await loadDrawCanvasPage(pageNum);
  setTimeout(fitToViewport, 100);
}

// เปิด Precision Geometry Tool Modal
function openManualDrawModal() {
  const modal = document.getElementById("drawModal");
  if (!modal) return;
  const title = document.getElementById("drawModalHeaderTitle");
  if (title) title.innerText = "📐 สร้างรายการใหม่ด้วย Precision Geometry Tool (Auto-Edge Pan)";
  
  const select = document.getElementById("drawPageSelect");
  if (select) {
    select.innerHTML = "";
    const totalPages = window.pdfDocumentInstance ? window.pdfDocumentInstance.numPages : 1;
    for (let i = 1; i <= totalPages; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.innerText = `หน้า ${i}`;
      select.appendChild(opt);
    }
  }
  modal.style.display = "flex";
  measuredShapes = [];
  measuredLines = [];
  currentPolygonPoints = [];
  updateBoxCounter();
  loadDrawCanvasPage(1);
  setupDrawEvents();
  setTimeout(fitToViewport, 100);
}

// วาดอ็อบเจ็กต์ทั้งหมดลงบน Canvas แบบเรียลไทม์
function redrawCanvas() {
  const canvas = document.getElementById("drawCanvas");
  if (!canvas || !currentDrawPageImg) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(currentDrawPageImg, 0, 0);

  if (calibrationLine) {
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(calibrationLine.x1, calibrationLine.y1);
    ctx.lineTo(calibrationLine.x2, calibrationLine.y2);
    ctx.stroke();
    ctx.restore();
  }

  measuredLines.forEach((line) => {
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
    const midX = (line.x1 + line.x2) / 2;
    const midY = (line.y1 + line.y2) / 2;
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(midX - 40, midY - 20, 80, 22);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(`📏 ${line.lengthM.toFixed(2)} ม.`, midX - 35, midY - 5);
    ctx.restore();
  });

  measuredShapes.forEach((shape, idx) => {
    ctx.save();
    if (shape.type === 'polygon' && shape.points) {
      ctx.beginPath();
      shape.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(37, 99, 235, 0.25)";
      ctx.fill();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 4;
      ctx.stroke();
      shape.points.forEach(pt => {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    } else if (shape.type === 'rect') {
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 4;
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
    }
    ctx.restore();
  });

  if (currentPolygonPoints.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    currentPolygonPoints.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.lineTo(currentMousePos.x, currentMousePos.y);
    ctx.stroke();
    ctx.restore();
  }

  if (currentDragBox) {
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 3;
    ctx.strokeRect(currentDragBox.x, currentDragBox.y, currentDragBox.w, currentDragBox.h);
  }

  if (activeSnappedPoint) {
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(activeSnappedPoint.x, activeSnappedPoint.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("🧲 SNAP", activeSnappedPoint.x + 12, activeSnappedPoint.y + 4);
    ctx.restore();
  }
}