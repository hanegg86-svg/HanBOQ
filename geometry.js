/* ==========================================================
   ระบบ PRECISION GEOMETRY TOOL (CANVAS, OSNAP, ORTHO & EDGE PAN)
   ========================================================== */
let currentDrawPageImg = null;
let currentToolMode = "area";
let pixelsPerMeter = null;
let calibrationLine = null;
let isDrawing = false;
let startX = 0, startY = 0;
let currentDragBox = null;
let currentDragLine = null;
let currentPolygonPoints = [];
let currentMousePos = { x: 0, y: 0 };
let activeSnappedPoint = null;
const SNAP_RADIUS = 15;
let autoPanAnimationId = null;
let autoPanVelocity = { x: 0, y: 0 };
let lastClientMousePos = { x: 0, y: 0 };
const EDGE_PAN_THRESHOLD = 45;
const EDGE_PAN_SPEED = 0.35;
let measuredShapes = [];
let measuredLines = [];
let zoomScale = 1.0;
let panOffsetX = 0;
let panOffsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let isSpacePressed = false;
let isShiftPressed = false;

function updateTransform() {
  const canvas = document.getElementById("drawCanvas");
  canvas.style.transformOrigin = "0 0";
  canvas.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${zoomScale})`;
  document.getElementById("zoomLevelDisplay").innerText = `${Math.round(zoomScale * 100)}%`;
}

function zoomStep(factor) {
  const viewport = document.getElementById("canvasViewport");
  const vRect = viewport.getBoundingClientRect();
  const centerX = vRect.width / 2;
  const centerY = vRect.height / 2;
  const newScale = Math.min(Math.max(0.1, zoomScale * factor), 10.0);
  panOffsetX = centerX - (centerX - panOffsetX) * (newScale / zoomScale);
  panOffsetY = centerY - (centerY - panOffsetY) * (newScale / zoomScale);
  zoomScale = newScale;
  updateTransform();
}

function resetZoom() {
  zoomScale = 1.0;
  panOffsetX = 0;
  panOffsetY = 0;
  updateTransform();
}

function fitToViewport() {
  if (!currentDrawPageImg) return;
  const viewport = document.getElementById("canvasViewport");
  const vRect = viewport.getBoundingClientRect();
  const scaleW = vRect.width / currentDrawPageImg.width;
  const scaleH = vRect.height / currentDrawPageImg.height;
  zoomScale = Math.min(scaleW, scaleH) * 0.95;
  panOffsetX = (vRect.width - currentDrawPageImg.width * zoomScale) / 2;
  panOffsetY = (vRect.height - currentDrawPageImg.height * zoomScale) / 2;
  updateTransform();
}

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
      checkPoint({ x: shape.x, y: shape.y + shape.h });
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

function switchToolMode(mode) {
  currentToolMode = mode;
  document.getElementById("btnModeCalib").classList.toggle("active", mode === "calibrate");
  document.getElementById("btnModeArea").classList.toggle("active", mode === "area");
  document.getElementById("btnModePoly").classList.toggle("active", mode === "polygon");
  document.getElementById("btnModeLine").classList.toggle("active", mode === "line");
  document.getElementById("btnModePan").classList.toggle("active", mode === "pan");
  const viewport = document.getElementById("canvasViewport");
  const canvas = document.getElementById("drawCanvas");
  const statusElem = document.getElementById("drawStatus");
  if (mode === "pan") {
    viewport.style.cursor = "grab";
    canvas.style.cursor = "grab";
    statusElem.innerText = "✋ โหมดมือเลื่อนแบบ: คลิกซ้ายค้างแล้วลากเพื่อแพนดูแบบแปลนได้อย่างอิสระ";
  } else if (mode === "calibrate") {
    viewport.style.cursor = "default";
    canvas.style.cursor = "crosshair";
    statusElem.innerText = "📏 โหมดตั้งสเกล: คลิกลากเส้นตรงทับผนังหรือเส้นบอกระยะ 1 เส้น";
  } else if (mode === "polygon") {
    viewport.style.cursor = "default";
    canvas.style.cursor = "crosshair";
    statusElem.innerText = "🔷 โหมด Polygon: คลิกวางจุดมุมเสา (ดับเบิลคลิกเพื่อปิดรูป)";
  } else if (mode === "line") {
    viewport.style.cursor = "default";
    canvas.style.cursor = "crosshair";
    statusElem.innerText = "📐 โหมดลากเส้นวัดความยาว: คลิกลากเส้นตรง";
  } else {
    viewport.style.cursor = "default";
    canvas.style.cursor = "crosshair";
    statusElem.innerText = "🎯 โหมดสี่เหลี่ยม: คลิกลากคลุมพื้นที่";
  }
  redrawCanvas();
}

function updateScaleBadge() {
  const badge = document.getElementById("scaleInfoBadge");
  if (pixelsPerMeter) {
    badge.innerText = `✅ สเกล: 1 ม. = ${pixelsPerMeter.toFixed(1)} px (${calibrationLine ? calibrationLine.meters + "ม." : ""})`;
    badge.style.background = "#dcfce7";
    badge.style.color = "#15803d";
    badge.style.borderColor = "#bbf7d0";
  } else {
    badge.innerText = "⚠️ ยังไม่ได้ตั้งสเกล (คลิกปุ่ม 1 เพื่อตั้ง)";
    badge.style.background = "#e0e7ff";
    badge.style.color = "#3730a3";
    badge.style.borderColor = "#c7d2fe";
  }
}

/* ==========================================================
   ฟังก์ชัน AI ตรวจจับเส้นสเกลอัตโนมัติ (AUTO-CALIBRATION WITH AI)
   ========================================================== */
async function autoDetectScaleWithAI() {
  if (!currentDrawPageImg) {
    alert("กรุณาเลือกและโหลดหน้าแบบแปลนก่อน");
    return;
  }
  const apiKey = document.getElementById("apiKey").value.trim();
  if (!apiKey) {
    alert("กรุณากรอกและบันทึก Gemini API Key ก่อน");
    return;
  }

  const statusElem = document.getElementById("drawStatus");
  const autoBtn = document.getElementById("btnAutoCalib");
  if (autoBtn) autoBtn.disabled = true;
  statusElem.innerText = "🤖 Gemini 3.5 Flash Lite กำลังสแกนหาเส้นบอกระยะ (Dimension line / Grid line) เพื่อตั้งสเกลอัตโนมัติ...";

  try {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = currentDrawPageImg.width;
    tempCanvas.height = currentDrawPageImg.height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(currentDrawPageImg, 0, 0);
    const base64Data = tempCanvas.toDataURL("image/jpeg", 0.9).split(",")[1];

    const promptText = `
### งานและบทบาท (MANDATORY JSON ONLY):
ท่านคือวิศวกรผู้เชี่ยวชาญการอ่านแบบสถาปัตยกรรมและโครงสร้าง
จงสแกนตรวจสอบภาพแปลนอาคารนี้ เพื่อค้นหา "เส้นบอกระยะ (Dimension line หรือ Grid dimension)" ที่ชัดเจนที่สุด 1 เส้น
(เช่น เส้นบอกระยะระหว่างแนวเสา Grid 1 ถึง 2, เส้นบอกระยะผนัง หรือ Dimension ตัวเลขบอกความยาวในหน่วยเมตร เช่น 4.00, 3.50, 5.00)

### สิ่งที่ต้องตอบกลับ:
ระบุพิกัดหัว-ท้ายของเส้นบอกระยะนั้นเป็นค่าพิกัดสัมพัทธ์ 0 ถึง 1000 (โดย [0,0] คือมุมซ้ายบน และ [1000,1000] คือมุมขวาล่างของภาพ)
พร้อมตัวเลขระยะทางจริงในหน่วยเมตร (เฉพาะตัวเลข เช่น 4.0 หรือ 3.5)

ตอบกลับด้วย JSON รูปแบบนี้เท่านั้น:
{
  "detected_meters": 4.0,
  "dimension_text": "4.00 ม.",
  "start_point": { "x": 250, "y": 340 },
  "end_point": { "x": 370, "y": 340 }
}
`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: "ท่านคือวิศวกรผู้อ่านแบบก่อสร้าง ตอบกลับเฉพาะ JSON ที่ระบุพิกัดเส้นบอกระยะและตัวเลขระยะทางจริงเป็นเมตรเท่านั้น"
          }]
        },
        contents: [{
          parts: [
            { text: promptText },
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
              }
            }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) throw new Error("API Connection Error");
    const data = await response.json();
    const rawContent = data.candidates[0].content.parts[0].text;
    const result = cleanAndParseJSON(rawContent);

    if (result && result.start_point && result.end_point && result.detected_meters) {
      const meters = parseFloat(result.detected_meters);
      if (isNaN(meters) || meters <= 0) {
        throw new Error("ตรวจพบระยะทางไม่ถูกต้อง");
      }

      const x1 = (result.start_point.x / 1000) * currentDrawPageImg.width;
      const y1 = (result.start_point.y / 1000) * currentDrawPageImg.height;
      const x2 = (result.end_point.x / 1000) * currentDrawPageImg.width;
      const y2 = (result.end_point.y / 1000) * currentDrawPageImg.height;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const pixelDist = Math.sqrt(dx * dx + dy * dy);

      if (pixelDist < 10) {
        throw new Error("ระยะพิกเซลสั้นเกินไป ไม่สามารถคำนวณสเกลได้");
      }

      pixelsPerMeter = pixelDist / meters;
      calibrationLine = {
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        meters: meters
      };

      updateScaleBadge();
      redrawCanvas();
      statusElem.innerText = `✅ ตรวจจับสเกลสำเร็จอัตโนมัติ: ${result.dimension_text || meters + ' ม.'} (${pixelDist.toFixed(1)} px) ➔ 1 ม. = ${pixelsPerMeter.toFixed(1)} px`;
    } else {
      throw new Error("ไม่พบเส้นบอกระยะที่สมบูรณ์");
    }
  } catch (err) {
    console.error("Auto Calibration Error:", err);
    statusElem.innerText = "⚠️ ไม่สามารถตรวจจับสเกลอัตโนมัติได้ กรุณาใช้ปุ่ม '📏 1. ตั้งสเกล' เพื่อลากเส้นเอง";
  } finally {
    if (autoBtn) autoBtn.disabled = false;
  }
}

function updateBoxCounter() {
  const cat = document.getElementById("drawCategorySelect").value;
  const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech"));
  const mType = document.getElementById("measureTypeSelect").value;
  const label = document.getElementById("boxCounterLabel");
  if (currentToolMode === "line" || measuredLines.length > 0) {
    const totalLineM = measuredLines.reduce((sum, l) => sum + (l.lengthM || 0), 0);
    label.innerText = `วัดแล้ว ${measuredLines.length} เส้น (รวมความยาว: ${totalLineM.toFixed(2)} ม.)`;
    return;
  }
  if (mType === "perimeter") {
    const totalPerimeter = measuredShapes.reduce((sum, b) => sum + (b.perimeterM || 0), 0);
    label.innerText = `เลือกแล้ว ${measuredShapes.length} รูป (เส้นรอบรูป: ${totalPerimeter.toFixed(2)} ม.)`;
  } else {
    const totalFlat = measuredShapes.reduce((sum, b) => sum + (b.flatAreaM || 0), 0);
    const totalSlope = measuredShapes.reduce((sum, b) => sum + (b.slopeAreaM || b.flatAreaM || 0), 0);
    if (isRoofRelated) {
      label.innerText = `เลือกแล้ว ${measuredShapes.length} รูป (ราบ: ${totalFlat.toFixed(2)} ตร.ม. | ลาดเอียง: ${totalSlope.toFixed(2)} ตร.ม.)`;
    } else {
      label.innerText = `เลือกแล้ว ${measuredShapes.length} รูป (${totalFlat.toFixed(2)} ตร.ม.)`;
    }
  }
}

function redrawCanvas() {
  if (!currentDrawPageImg) return;
  const canvas = document.getElementById("drawCanvas");
  const ctx = canvas.getContext("2d");
  canvas.width = currentDrawPageImg.width;
  canvas.height = currentDrawPageImg.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(currentDrawPageImg, 0, 0);
  const cat = document.getElementById("drawCategorySelect").value;
  const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech"));
  const mType = document.getElementById("measureTypeSelect").value;
  const currentSlopeDeg = parseFloat(document.getElementById("modalSlopeDeg").value) || 0;
  const slopeMultiplier = getSlopeMultiplier(currentSlopeDeg);

  if (calibrationLine) {
    ctx.save();
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(calibrationLine.x1, calibrationLine.y1);
    ctx.lineTo(calibrationLine.x2, calibrationLine.y2);
    ctx.stroke();
    const midX = (calibrationLine.x1 + calibrationLine.x2) / 2;
    const midY = (calibrationLine.y1 + calibrationLine.y2) / 2;
    ctx.fillStyle = "#8b5cf6";
    ctx.fillRect(midX - 50, midY - 26, 100, 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`📏 ${calibrationLine.meters} ม.`, midX - 35, midY - 9);
    ctx.restore();
  }

  if (currentDragLine) {
    ctx.save();
    ctx.strokeStyle = (currentToolMode === "line") ? "#f59e0b" : "#a855f7";
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(currentDragLine.x1, currentDragLine.y1);
    ctx.lineTo(currentDragLine.x2, currentDragLine.y2);
    ctx.stroke();
    ctx.restore();
  }

  if (measuredShapes.length > 0 || measuredLines.length > 0 || currentDragBox || currentPolygonPoints.length > 0) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.15)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  measuredLines.forEach((line) => {
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
    const midX = (line.x1 + line.x2) / 2;
    const midY = (line.y1 + line.y2) / 2;
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(midX - 45, midY - 24, 90, 24);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`📏 ${line.lengthM.toFixed(2)} ม.`, midX - 38, midY - 7);
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
      ctx.strokeStyle = isRoofRelated ? "#ef4444" : "#2563eb";
      ctx.lineWidth = 4;
      ctx.stroke();
      shape.points.forEach(pt => {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      const firstPt = shape.points[0];
      let polyLabel = `🔷 #${idx + 1} (Polygon)`;
      if (mType === "perimeter") {
        polyLabel = `🔄 #${idx + 1}: รอบรูป = ${shape.perimeterM.toFixed(2)} ม.`;
      } else if (shape.flatAreaM) {
        polyLabel = isRoofRelated
          ? `🔷 #${idx + 1}: ราบ ${shape.flatAreaM.toFixed(1)} ➔ ลาดเอียง (${shape.slopeDeg || currentSlopeDeg}°) = ${shape.slopeAreaM.toFixed(1)} ตร.ม.`
          : `🔷 #${idx + 1}: ${shape.flatAreaM.toFixed(2)} ตร.ม.`;
      }
      ctx.fillStyle = isRoofRelated ? "#ef4444" : "#2563eb";
      const badgeY = firstPt.y > 32 ? firstPt.y - 32 : firstPt.y;
      const textWidth = ctx.measureText(polyLabel).width + 24;
      ctx.fillRect(firstPt.x, badgeY, Math.max(190, textWidth), 28);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(polyLabel, firstPt.x + 8, badgeY + 19);
    } else if (shape.type === 'rect') {
      ctx.drawImage(currentDrawPageImg, shape.x, shape.y, shape.w, shape.h, shape.x, shape.y, shape.w, shape.h);
      ctx.strokeStyle = isRoofRelated ? "#ef4444" : "#10b981";
      ctx.lineWidth = 5;
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
      let badgeLabel = `🎯 #${idx + 1}`;
      if (mType === "perimeter" && shape.perimeterM) {
        badgeLabel = `🔄 #${idx + 1}: เส้นรอบรูป = ${shape.perimeterM.toFixed(2)} ม.`;
      } else if (shape.flatAreaM) {
        badgeLabel = isRoofRelated
          ? `🎯 #${idx + 1}: ราบ ${shape.flatAreaM.toFixed(1)} ➔ ลาดเอียง (${shape.slopeDeg || currentSlopeDeg}°) = ${shape.slopeAreaM.toFixed(1)} ตร.ม.`
          : `🎯 #${idx + 1}: ${shape.flatAreaM.toFixed(2)} ตร.ม.`;
      }
      ctx.fillStyle = isRoofRelated ? "#ef4444" : "#10b981";
      const badgeY = shape.y > 32 ? shape.y - 32 : shape.y;
      const textWidth = ctx.measureText(badgeLabel).width + 24;
      ctx.fillRect(shape.x, badgeY, Math.max(190, textWidth), 28);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(badgeLabel, shape.x + 8, badgeY + 19);
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
    let endPt = activeSnappedPoint || currentMousePos;
    if (isShiftPressed && currentPolygonPoints.length > 0 && !activeSnappedPoint) {
      const lastPt = currentPolygonPoints[currentPolygonPoints.length - 1];
      endPt = applyOrthoLock(lastPt.x, lastPt.y, currentMousePos.x, currentMousePos.y);
    }
    ctx.lineTo(endPt.x, endPt.y);
    ctx.stroke();
    currentPolygonPoints.forEach((pt, idx) => {
      ctx.fillStyle = (idx === 0) ? "#ef4444" : "#38bdf8";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (idx === 0) ? 8 : 5, 0, Math.PI * 2);
      ctx.fill();
    });
    const firstPt = currentPolygonPoints[0];
    if (currentPolygonPoints.length >= 3) {
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("⭕ ดับเบิลคลิก หรือคลิกที่นี่เพื่อปิดรูป", firstPt.x + 12, firstPt.y);
    }
    ctx.restore();
  }

  if (currentDragBox) {
    ctx.drawImage(currentDrawPageImg, currentDragBox.x, currentDragBox.y, currentDragBox.w, currentDragBox.h, currentDragBox.x, currentDragBox.y, currentDragBox.w, currentDragBox.h);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 4;
    ctx.strokeRect(currentDragBox.x, currentDragBox.y, currentDragBox.w, currentDragBox.h);
    if (pixelsPerMeter) {
      const wM = currentDragBox.w / pixelsPerMeter;
      const hM = currentDragBox.h / pixelsPerMeter;
      ctx.fillStyle = "#0284c7";
      let dragLabel = "";
      if (mType === "perimeter") {
        const peri = 2 * (wM + hM);
        dragLabel = `🔄 เส้นรอบรูป: ${peri.toFixed(2)} ม.`;
      } else {
        const flatM = wM * hM;
        dragLabel = `📐 ราบ ${flatM.toFixed(2)} ตร.ม.`;
        if (isRoofRelated) {
          const slopeM = flatM * slopeMultiplier;
          dragLabel = `📐 ราบ ${flatM.toFixed(1)} ➔ ลาดเอียง (${currentSlopeDeg}°) = ${slopeM.toFixed(1)} ตร.ม.`;
        }
      }
      ctx.fillRect(currentDragBox.x, currentDragBox.y - 26, Math.max(220, ctx.measureText(dragLabel).width + 20), 24);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(dragLabel, currentDragBox.x + 6, currentDragBox.y - 8);
    }
  }

  if (activeSnappedPoint) {
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(activeSnappedPoint.x, activeSnappedPoint.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(16, 185, 129, 0.4)";
    ctx.beginPath();
    ctx.arc(activeSnappedPoint.x, activeSnappedPoint.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("🧲 SNAP", activeSnappedPoint.x + 14, activeSnappedPoint.y + 4);
    ctx.restore();
  }
}

function setupDrawEvents() {
  const viewport = document.getElementById("canvasViewport");
  const canvas = document.getElementById("drawCanvas");
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
    if (e.code === "Space" && !isSpacePressed && document.getElementById("drawModal").style.display === "flex") {
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
          const meters = parseFloat(inputVal);
          pixelsPerMeter = pixelDist / meters;
          calibrationLine = { ...currentDragLine, meters: meters };
          updateScaleBadge();
          switchToolMode("area");
        }
      }
      currentDragLine = null;
      redrawCanvas();
    } else if (currentToolMode === "line" && currentDragLine) {
      if (pixelsPerMeter) {
        const dx = currentDragLine.x2 - currentDragLine.x1;
        const dy = currentDragLine.y2 - currentDragLine.y1;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);
        if (pixelDist > 10) {
          const lineM = pixelDist / pixelsPerMeter;
          measuredLines.push({
            x1: currentDragLine.x1,
            y1: currentDragLine.y1,
            x2: currentDragLine.x2,
            y2: currentDragLine.y2,
            lengthM: lineM
          });
          updateBoxCounter();
        }
      } else {
        alert("กรุณากดปุ่ม '1. ตั้งสเกล' ก่อนวัดความยาว");
      }
      currentDragLine = null;
      redrawCanvas();
    } else if (currentToolMode === "area" && currentDragBox) {
      if (currentDragBox.w > 10 && currentDragBox.h > 10) {
        let widthM = 0, heightM = 0, flatAreaM = 0, slopeAreaM = 0, perimeterM = 0;
        const cat = document.getElementById("drawCategorySelect").value;
        const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech"));
        const currentSlopeDeg = parseFloat(document.getElementById("modalSlopeDeg").value) || 0;
        const slopeMultiplier = getSlopeMultiplier(currentSlopeDeg);
        if (pixelsPerMeter) {
          widthM = currentDragBox.w / pixelsPerMeter;
          heightM = currentDragBox.h / pixelsPerMeter;
          flatAreaM = widthM * heightM;
          slopeAreaM = isRoofRelated ? (flatAreaM * slopeMultiplier) : flatAreaM;
          perimeterM = 2 * (widthM + heightM);
        }
        measuredShapes.push({
          type: 'rect',
          ...currentDragBox,
          widthM: widthM,
          heightM: heightM,
          flatAreaM: flatAreaM,
          slopeAreaM: slopeAreaM,
          perimeterM: perimeterM,
          slopeDeg: currentSlopeDeg
        });
        updateBoxCounter();
      }
      currentDragBox = null;
      redrawCanvas();
    }
  });
}

function handlePolygonClick(coords) {
  if (!pixelsPerMeter) {
    alert("กรุณากดปุ่ม '1. ตั้งสเกล' ก่อนเริ่มวาดรูปหลายเหลี่ยม");
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

function closeAndFinishPolygon() {
  if (currentPolygonPoints.length < 3) return;
  const cat = document.getElementById("drawCategorySelect").value;
  const isRoofRelated = (cat.includes("หลังคา") || cat.includes("FSO") || cat.includes("Dry Tech"));
  const currentSlopeDeg = parseFloat(document.getElementById("modalSlopeDeg").value) || 0;
  const slopeMultiplier = getSlopeMultiplier(currentSlopeDeg);
  const metrics = calculatePolygonMetrics(currentPolygonPoints, pixelsPerMeter);
  const flatArea = metrics.flatAreaM;
  const slopeArea = isRoofRelated ? (flatArea * slopeMultiplier) : flatArea;
  measuredShapes.push({
    type: 'polygon',
    points: [...currentPolygonPoints],
    flatAreaM: flatArea,
    slopeAreaM: slopeArea,
    perimeterM: metrics.perimeterM,
    slopeDeg: currentSlopeDeg
  });
  currentPolygonPoints = [];
  stopAutoPanLoop();
  updateBoxCounter();
  redrawCanvas();
}

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
  document.getElementById("drawStatus").innerText = "ล้างข้อมูลเรียบร้อยแล้ว ลากกรอบหรือคลิก Polygon ใหม่เพื่อวัด";
}

async function openInPlaceEditor(itemId) {
  if (!currentUploadedFile) {
    alert("กรุณาเลือกไฟล์แบบแปลนก่อน");
    return;
  }
  editingItemId = itemId;
  const targetItem = lastRawBOQItems.find(it => it._id === itemId);
  if (!targetItem) return;
  const loc = targetItem.source_location || {};
  const targetPage = (loc.page_number && loc.page_number !== "all") ? loc.page_number : 1;
  const modalTitle = document.getElementById("drawModalHeaderTitle");
  modalTitle.innerText = `🔍 ตำแหน่งในแบบ (หน้า ${targetPage}) & แก้ไขรายการ: "${targetItem.item_name}"`;
  const select = document.getElementById("drawPageSelect");
  select.innerHTML = "";
  const totalPages = pdfDocumentInstance ? pdfDocumentInstance.numPages : 1;
  for (let i = 1; i <= totalPages; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.innerText = `หน้า ${i}`;
    if (i === targetPage) opt.selected = true;
    select.appendChild(opt);
  }
  const catSelect = document.getElementById("drawCategorySelect");
  const cat = targetItem.category || "";
  if (cat.includes("สันหลังคา") || cat.includes("Dry Tech")) catSelect.value = "งานสันหลังคา/ตะเข้สัน (SCG Dry Tech)";
  else if (cat.includes("ฉนวนใต้หลังคา") || cat.includes("FSO")) catSelect.value = "งานฉนวนใต้หลังคา (SCG FSO)";
  else if (cat.includes("ฉนวนปูเหนือฝ้า") || cat.includes("STAY COOL")) catSelect.value = "งานฉนวนปูเหนือฝ้า (STAY COOL)";
  else if (cat.includes("หลังคา")) catSelect.value = "งานหลังคา";
  else if (cat.includes("โครงสร้าง") || cat.includes("คอนกรีต") || cat.includes("CPAC") || cat.includes("Hollow") || cat.includes("Post")) catSelect.value = "งานโครงสร้างและคอนกรีต CPAC";
  else if (cat.includes("ไม้")) catSelect.value = "งานไม้สังเคราะห์/ตกแต่ง";
  else if (cat.includes("ผนัง")) catSelect.value = "งานผนัง";
  else if (cat.includes("พื้น")) catSelect.value = "งานพื้น";
  else if (cat.includes("ฝ้า") || cat.includes("เพดาน")) catSelect.value = "งานฝ้าเพดาน";
  populateProductDropdown(catSelect.value, targetItem.scg_product);
  const isRoofRelated = (catSelect.value.includes("หลังคา") || catSelect.value.includes("FSO") || catSelect.value.includes("Dry Tech"));
  document.getElementById("modalSlopeContainer").style.display = isRoofRelated ? "inline-flex" : "none";
  document.getElementById("roofShapeContainer").style.display = catSelect.value.includes("หลังคา") ? "inline-flex" : "none";
  const slopeMatch = (targetItem.verification_method || "").match(/Slope\s*([\d.]+)/i);
  if (slopeMatch) {
    document.getElementById("modalSlopeDeg").value = slopeMatch[1];
  }
  if ((targetItem.net_quantity || "").includes("ม.") && !(targetItem.net_quantity || "").includes("ตร.ม.")) {
    document.getElementById("measureTypeSelect").value = "perimeter";
  }
  document.getElementById("drawModal").style.display = "flex";
  document.getElementById("drawStatus").innerText = `กำลังเปิดแปลนหน้า ${targetPage} ของรายการ "${targetItem.item_name}"...`;
  await loadDrawCanvasPage(targetPage);
  measuredShapes = [];
  measuredLines = [];
  currentPolygonPoints = [];

  if (targetItem.pixels_per_meter) {
    pixelsPerMeter = targetItem.pixels_per_meter;
    if (targetItem.calibration_line) {
      calibrationLine = JSON.parse(JSON.stringify(targetItem.calibration_line));
    }
    updateScaleBadge();
  }

  if (targetItem.measured_shapes && targetItem.measured_shapes.length > 0) {
    measuredShapes = JSON.parse(JSON.stringify(targetItem.measured_shapes));
    if (targetItem.measured_lines && targetItem.measured_lines.length > 0) {
      measuredLines = JSON.parse(JSON.stringify(targetItem.measured_lines));
    }
  } else if (loc.box_2d && loc.box_2d.length === 4 && currentDrawPageImg) {
    const box = loc.box_2d;
    const ymin = (box[0] / 1000) * currentDrawPageImg.height;
    const xmin = (box[1] / 1000) * currentDrawPageImg.width;
    const ymax = (box[2] / 1000) * currentDrawPageImg.height;
    const xmax = (box[3] / 1000) * currentDrawPageImg.width;
    const w = xmax - xmin;
    const h = ymax - ymin;
    const numMatch = (targetItem.net_quantity || "").match(/[\d,.]+/);
    const origVal = numMatch ? parseFloat(numMatch[0].replace(/,/g, '')) : 0;
    const currentSlopeDeg = parseFloat(document.getElementById("modalSlopeDeg").value) || 0;
    const slopeMultiplier = getSlopeMultiplier(currentSlopeDeg);
    measuredShapes.push({
      type: 'rect',
      x: xmin,
      y: ymin,
      w: w,
      h: h,
      widthM: 0,
      heightM: 0,
      flatAreaM: isRoofRelated ? (origVal / slopeMultiplier) : origVal,
      slopeAreaM: origVal,
      perimeterM: origVal,
      slopeDeg: currentSlopeDeg
    });
  }
  updateBoxCounter();
  redrawCanvas();
  setupDrawEvents();
  setTimeout(fitToViewport, 100);
}

function openManualDrawModal() {
  editingItemId = null;
  document.getElementById("drawModalHeaderTitle").innerText = "📐 สร้างรายการใหม่ด้วย Precision Geometry Tool (Auto-Edge Pan)";
  const select = document.getElementById("drawPageSelect");
  select.innerHTML = "";
  const totalPages = pdfDocumentInstance ? pdfDocumentInstance.numPages : 1;
  for (let i = 1; i <= totalPages; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.innerText = `หน้า ${i}`;
    select.appendChild(opt);
  }
  document.getElementById("drawModal").style.display = "flex";
  onCategoryChangedInDrawModal();
  measuredShapes = [];
  measuredLines = [];
  currentPolygonPoints = [];
  updateBoxCounter();
  loadDrawCanvasPage(1);
  setupDrawEvents();
  setTimeout(fitToViewport, 100);
}

async function onDrawPageChange() {
  const pageNum = parseInt(document.getElementById("drawPageSelect").value);
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

async function loadDrawCanvasPage(pageNum) {
  const pageResult = await getPageImage(pageNum);
  if (!pageResult) return;
  currentDrawPageImg = pageResult.image;
  currentDragBox = null;
  currentDragLine = null;
  redrawCanvas();
}

async function saveAndApplyInPlaceMeasurement() {
  const mType = document.getElementById("measureTypeSelect").value;
  const isLineMode = measuredLines.length > 0;
  if (measuredShapes.length === 0 && !isLineMode) {
    alert("กรุณาตีกรอบหรือคลิก Polygon วัดอย่างน้อย 1 รายการบนแบบแปลน");
    return;
  }
  const apiKey = document.getElementById("apiKey").value.trim();
  if (!apiKey) {
    alert("กรุณากรอกและบันทึก API Key ก่อน");
    return;
  }
  const category = document.getElementById("drawCategorySelect").value;
  const isRoofRelated = (category.includes("หลังคา") || category.includes("FSO") || category.includes("Dry Tech"));
  const chosenProduct = document.getElementById("drawProductSelect").value;
  const pageNum = parseInt(document.getElementById("drawPageSelect").value);
  const slopeDeg = document.getElementById("modalSlopeDeg").value;
  const roofShape = document.getElementById("roofShapeSelect").value;
  const wastePercent = (roofShape === "hip") ? 1.10 : 1.05;
  const wasteFactorText = (roofShape === "hip") ? "10%" : "5%";
  
  let chosenValue = 0;
  let chosenUnit = "ตร.ม.";
  let auditSummary = "";
  
  if (isLineMode) {
    chosenValue = measuredLines.reduce((sum, l) => sum + (l.lengthM || 0), 0);
    chosenUnit = "ม.";
    let parts = measuredLines.map((l, i) => `เส้น #${i+1} (${l.lengthM.toFixed(2)} ม.)`);
    auditSummary = `[วัดความยาวแนวเส้น หน้า ${pageNum}]: ${parts.join(" + ")} = รวมความยาวสุทธิ ${chosenValue.toFixed(2)} เมตร`;
  } else if (mType === "perimeter") {
    chosenValue = measuredShapes.reduce((sum, b) => sum + (b.perimeterM || 0), 0);
    chosenUnit = "ม.";
    let parts = measuredShapes.map((b, i) => `#${i+1} [${b.type === 'polygon' ? 'Polygon' : 'สี่เหลี่ยม'} = ${b.perimeterM.toFixed(2)} ม.]`);
    auditSummary = `[คิดเส้นรอบรูปอาคาร/แนวสัน หน้า ${pageNum}]: ${parts.join(" + ")} = รวมความยาว ${chosenValue.toFixed(2)} เมตร`;
  } else {
    chosenValue = isRoofRelated
      ? measuredShapes.reduce((sum, b) => sum + (b.slopeAreaM || 0), 0)
      : measuredShapes.reduce((sum, b) => sum + (b.flatAreaM || 0), 0);
    chosenUnit = "ตร.ม.";
    let parts = measuredShapes.map((b, i) => {
      return isRoofRelated
        ? `รูป #${i+1} (${b.type === 'polygon' ? 'Polygon' : 'สี่เหลี่ยม'} ราบ ${b.flatAreaM.toFixed(2)} ม.² ÷ cos(${b.slopeDeg || slopeDeg}°) = ลาดเอียง ${b.slopeAreaM.toFixed(2)} ม.²)`
        : `รูป #${i+1} (${b.type === 'polygon' ? 'Polygon' : 'สี่เหลี่ยม'} ${b.flatAreaM.toFixed(2)} ม.²)`;
    });
    auditSummary = isRoofRelated
      ? `[หน้า ${pageNum} | คำนวณ Slope ${slopeDeg}° | ทรง${roofShape === 'hip' ? 'ปั้นหยา' : 'จั่ว'}]: ${parts.join(" + ")} = รวมพื้นที่ลาดเอียงสุทธิ ${chosenValue.toFixed(2)} ตร.ม.`
      : `[หน้า ${pageNum}]: ${parts.join(" + ")} = รวมสุทธิ ${chosenValue.toFixed(2)} ตร.ม.`;
  }

  const statusElem = document.getElementById("drawStatus");
  statusElem.innerText = `กำลังคำนวณยอดสั่งซื้อสินค้าและระบบแพ็กเกจของ "${chosenProduct}" ...`;

  let mainBox = [100, 100, 500, 500];
  if (measuredShapes.length > 0 && currentDrawPageImg) {
    let allX = [];
    let allY = [];
    measuredShapes.forEach(sh => {
      if (sh.type === 'rect') {
        allX.push(sh.x, sh.x + sh.w);
        allY.push(sh.y, sh.y + sh.h);
      } else if (sh.type === 'polygon' && sh.points) {
        sh.points.forEach(p => { allX.push(p.x); allY.push(p.y); });
      }
    });
    if (allX.length > 0 && allY.length > 0) {
      mainBox = [
        Math.round((Math.min(...allY) / currentDrawPageImg.height) * 1000),
        Math.round((Math.min(...allX) / currentDrawPageImg.width) * 1000),
        Math.round((Math.max(...allY) / currentDrawPageImg.height) * 1000),
        Math.round((Math.max(...allX) / currentDrawPageImg.width) * 1000)
      ];
    }
  }

  let fallbackOrderEstimate = "";
  const pLower = chosenProduct.toLowerCase();
  if (pLower.includes("dry tech") || pLower.includes("สันหลังคา")) {
    const tiles = Math.ceil(chosenValue * 3.3 * wastePercent);
    const dryRolls = Math.ceil((chosenValue / 3.0) * wastePercent);
    fallbackOrderEstimate = `- แผ่นครอบสันหลังคา: ${tiles} แผ่น\n- แผ่นรองใต้สันหลังคา SCG Dry Tech: ${dryRolls} ม้วน (3.0 ม./ม้วน)`;
  } else if (pLower.includes("hollow core") || pLower.includes("ฮอลโลว์คอร์")) {
    const sqmAmt = (chosenValue * wastePercent).toFixed(1);
    const toppingCubic = (chosenValue * 0.05 * wastePercent).toFixed(2);
    const wireMeshSqm = (chosenValue * 1.10).toFixed(1);
    fallbackOrderEstimate = `- แผ่นพื้น CPAC Hollow Core: ${sqmAmt} ตร.ม.\n- คอนกรีตทับหน้า Topping หนา 5 ซม.: ${toppingCubic} คิว (ลบ.ม.)\n- ตะแกรงเหล็ก Wire Mesh: ${wireMeshSqm} ตร.ม. (เผื่อทาบ 10%)`;
  } else if (pLower.includes("prestige") || pLower.includes("neustile") || pLower.includes("cpac") || pLower.includes("ลอนคู่")) {
    const tiles = Math.ceil(chosenValue * 11 * wastePercent);
    fallbackOrderEstimate = `- กระเบื้องหลังคา: ${tiles} แผ่น (เผื่อเศษ ${wasteFactorText})`;
  } else if (pLower.includes("post-tension")) {
    const sqmAmt = (chosenValue * wastePercent).toFixed(1);
    const strandKg = Math.round(chosenValue * 4.0);
    fallbackOrderEstimate = `- พื้นคอนกรีตอัดแรง Post-tension: ${sqmAmt} ตร.ม.\n- ลวดสลิง PC Strand: ~${strandKg} กก.`;
  } else if (pLower.includes("คอนกรีตผสมเสร็จ") || pLower.includes("ready-mix")) {
    const cubic = (chosenValue * wastePercent).toFixed(2);
    fallbackOrderEstimate = `- คอนกรีตผสมเสร็จ CPAC: ${cubic} คิว (ลบ.ม.)`;
  } else if (pLower.includes("เชิงชาย") || pLower.includes("บัว")) {
    const pcs = Math.ceil((chosenValue / 3.0) * wastePercent);
    fallbackOrderEstimate = `- ไม้เชิงชาย SCG Smartwood: ${pcs} ท่อน (3.0 ม./ท่อน)`;
  } else if (pLower.includes("stay cool")) {
    const rolls = Math.ceil((chosenValue / 2.40) * wastePercent);
    fallbackOrderEstimate = `- ฉนวนปูเหนือฝ้า SCG STAY COOL: ${rolls} ม้วน (ปูเหนือฝ้า 2.40 ตร.ม./ม้วน)`;
  } else if (pLower.includes("fso")) {
    const sqmAmt = (chosenValue * wastePercent).toFixed(1);
    fallbackOrderEstimate = `- ฉนวนใยแก้วใต้หลังคา SCG FSO: ${sqmAmt} ตร.ม.`;
  } else if (pLower.includes("สมาร์ทบอร์ด") || pLower.includes("ยิปซัม")) {
    const sheets = Math.ceil((chosenValue / 2.88) * wastePercent);
    fallbackOrderEstimate = `- แผ่นบอร์ด: ${sheets} แผ่น (ขนาดมาตรฐาน 1.20x2.40 ม.)`;
  } else if (pLower.includes("ไม้ฝา")) {
    const planks = Math.ceil(chosenValue * 2.22 * wastePercent);
    fallbackOrderEstimate = `- ไม้ฝาตกแต่ง SCG Smartwood: ${planks} แผ่น`;
  } else {
    const sqmAmt = (chosenValue * wastePercent).toFixed(1);
    fallbackOrderEstimate = `- ${chosenProduct}: ${sqmAmt} ${chosenUnit} (เผื่อเศษ ${wasteFactorText})`;
  }

  let finalOrderEstimate = fallbackOrderEstimate;
  let finalCalcNote = `คำนวณจากขนาดวัดจริง ${chosenValue.toFixed(2)} ${chosenUnit} อัตราเผื่อเศษวัสดุ ${wasteFactorText}`;

  const promptText = `
### คำสั่งและบริบทงาน (บังคับภาษาไทย 100%):
ท่านคือวิศวกรและผู้เชี่ยวชาญการถอดแบบและประมาณราคา (QS) ของ SCG และ CPAC
จงคำนวณยอดสั่งซื้อสินค้าจริง (order_estimate) และหมายเหตุวิธีคำนวณ (calculation_note) สำหรับงานก่อสร้างนี้เป็น "ภาษาไทยล้วน 100%"
### ข้อมูลนำเข้า:
- หมวดงาน: "${category}"
- สินค้าที่แนะนำ: "${chosenProduct}"
- ปริมาณงานสุทธิ: ${chosenValue.toFixed(2)} ${chosenUnit}
- ที่มาการวัด: ${auditSummary}
- สัดส่วนเผื่อเศษ: ${wasteFactorText}
### ข้อกำหนดสำคัญ:
1. ใน "order_estimate" ให้ระบุสินค้าหลักและอุปกรณ์ส่วนควบในระบบเป็นภาษาไทย แต่ละบรรทัดขึ้นต้นด้วย "- "
2. ใน "calculation_note" อธิบายสูตรคำนวณและสัดส่วนเผื่อเศษเป็นภาษาไทย
3. ส่งออกเฉพาะ JSON Object ที่ถูกต้อง:
{
  "order_estimate": "- รายการสินค้า 1\\n- อุปกรณ์เสริม 2",
  "calculation_note": "สูตรคำนวณและอัตราเผื่อเศษภาษาไทย"
}
`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "ท่านคือวิศวกรผู้เชี่ยวชาญการถอดแบบ BOQ ของ SCG และ CPAC ข้อมูลข้อความทุกช่องต้องแสดงเป็นภาษาไทยล้วน 100% ตอบกลับด้วย JSON เท่านั้น" }]
        },
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const rawContent = data.candidates[0].content.parts[0].text;
        const result = cleanAndParseJSON(rawContent);
        if (result.order_estimate) finalOrderEstimate = result.order_estimate;
        if (result.calculation_note) finalCalcNote = result.calculation_note;
      }
    }
  } catch (apiErr) {
    // ใช้ค่า Fallback ต่อได้ทันที
  }

  if (editingItemId) {
    const item = lastRawBOQItems.find(it => it._id === editingItemId);
    if (item) {
      item.category = category;
      item.net_quantity = `${chosenValue.toFixed(2)} ${chosenUnit}`;
      item.scg_product = chosenProduct;
      item.order_estimate = finalOrderEstimate;
      item.calculation_note = finalCalcNote;
      item.verification_method = auditSummary;
      item.confidence_score = 99;
      item.is_manual_modified = true;
      item.measured_shapes = JSON.parse(JSON.stringify(measuredShapes));
      item.measured_lines = JSON.parse(JSON.stringify(measuredLines));
      item.pixels_per_meter = pixelsPerMeter;
      item.calibration_line = calibrationLine ? JSON.parse(JSON.stringify(calibrationLine)) : null;
      item.source_location = {
        page_number: pageNum,
        box_2d: mainBox,
        location_description: `วัดขนาดด้วย Geometry Tool และเลือกสินค้า "${chosenProduct}" บนหน้า ${pageNum}`
      };
      statusElem.innerText = `✅ อัปเดตรูปทรงและรายการ "${item.item_name}" บนหน้า ${pageNum} สำเร็จ!`;
    }
  } else {
    const newItem = {
      _id: "item_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
      category: category,
      code_ref: `Geometry (${chosenUnit})`,
      item_name: `วัดปริมาณในแบบ (${category} - หน้า ${pageNum})`,
      net_quantity: `${chosenValue.toFixed(2)} ${chosenUnit}`,
      scg_product: chosenProduct,
      order_estimate: finalOrderEstimate,
      confidence_score: 99,
      calculation_note: finalCalcNote,
      verification_method: auditSummary,
      is_manual_modified: true,
      measured_shapes = JSON.parse(JSON.stringify(measuredShapes)),
      measured_lines = JSON.parse(JSON.stringify(measuredLines)),
      pixels_per_meter = pixelsPerMeter,
      calibration_line = calibrationLine ? JSON.parse(JSON.stringify(calibrationLine)) : null,
      source_location: {
        page_number: pageNum,
        box_2d: mainBox,
        location_description: `วัดในแบบบนหน้า ${pageNum}`
      }
    };
    lastRawBOQItems.push(newItem);
    statusElem.innerText = `✅ เพิ่มรายการใหม่ของหน้า ${pageNum} ลงในตาราง BOQ สำเร็จ!`;
  }

  renderBOQTable(lastRawBOQItems);
  setTimeout(() => {
    closeModal('drawModal');
  }, 800);
}
