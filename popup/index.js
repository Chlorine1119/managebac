import { parseScoreText, parseCsvFile } from "../utils/csv-parser.js";
import { parseXlsxFile } from "../utils/xlsx-parser.js";
import { matchImportedToStudents, buildMappingFromManualAdjustments, findById } from "../utils/name-matcher.js";

const ui = {
  notGradePage: document.getElementById("notGradePage"),
  stepGrab: document.getElementById("stepGrab"),
  stepCheck: document.getElementById("stepCheck"),
  stepFill: document.getElementById("stepFill"),
  pageHint: document.getElementById("pageHint"),
  pageMeta: document.getElementById("pageMeta"),
  scoreInput: document.getElementById("scoreInput"),
  csvFile: document.getElementById("csvFile"),
  useCachedBtn: document.getElementById("useCachedBtn"),
  toCheckBtn: document.getElementById("toCheckBtn"),
  backToGrabBtn: document.getElementById("backToGrabBtn"),
  startFillBtn: document.getElementById("startFillBtn"),
  finishBtn: document.getElementById("finishBtn"),
  matchSummary: document.getElementById("matchSummary"),
  matchList: document.getElementById("matchList"),
  progressText: document.getElementById("progressText"),
  progressBarInner: document.getElementById("progressBarInner"),
  fillLog: document.getElementById("fillLog"),
  cacheDataCheckbox: document.getElementById("cacheDataCheckbox"),
  toast: document.getElementById("toast")
};

const state = {
  tabId: null,
  pageInfo: null,
  students: [],
  importedRows: [],
  matchedRows: [],
  fillPayload: [],
  fillInProgress: false
};

function setVisible(stepKey) {
  [ui.notGradePage, ui.stepGrab, ui.stepCheck, ui.stepFill].forEach((el) => el.classList.add("hidden"));
  ui[stepKey].classList.remove("hidden");
}

function showToast(message, type = "error") {
  ui.toast.textContent = message;
  ui.toast.className = `toast ${type}`;
  ui.toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => ui.toast.classList.add("hidden"), 2200);
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || tabs[0].id == null) {
    throw new Error("未找到当前标签页");
  }
  return tabs[0].id;
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "请求失败");
  }
  return response;
}

function appendLog(text) {
  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = text;
  ui.fillLog.appendChild(line);
  ui.fillLog.scrollTop = ui.fillLog.scrollHeight;
}

function statusBadge(status) {
  if (status === "exact" || status === "normalized" || status === "mapped") {
    return '<span class="badge ok">✅ 精确/可信</span>';
  }
  if (status === "contains" || status === "fuzzy") {
    return '<span class="badge warn">⚠️ 需确认</span>';
  }
  return '<span class="badge err">❌ 未匹配</span>';
}

function renderMatchList() {
  ui.matchList.innerHTML = "";

  state.matchedRows.forEach((row, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "match-row";

    const left = document.createElement("div");
    left.innerHTML = `${statusBadge(row.status)}<strong>${row.importedName || "(无姓名)"}</strong> → ${row.selectedStudentName || "未选择"}<br/><small>分数：${row.score}</small>`;

    const right = document.createElement("div");

    if (row.status === "fuzzy" || row.status === "unmatched") {
      const select = document.createElement("select");
      select.className = "select";

      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "手动选择学生";
      select.appendChild(blank);

      state.students.forEach((student) => {
        const option = document.createElement("option");
        option.value = student.studentId;
        option.textContent = student.name;
        if (student.studentId === row.selectedStudentId) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      select.addEventListener("change", (event) => {
        const chosenId = event.target.value;
        const student = findById(state.students, chosenId);
        state.matchedRows[index].selectedStudentId = chosenId;
        state.matchedRows[index].selectedStudentName = student?.name || "";
      });

      right.appendChild(select);
    }

    wrapper.appendChild(left);
    wrapper.appendChild(right);
    ui.matchList.appendChild(wrapper);
  });
}

function renderSummary(summary) {
  ui.matchSummary.textContent = `匹配结果：${summary.exact + summary.normalized + summary.mapped}/${summary.total} 精确匹配，${summary.contains + summary.fuzzy} 模糊匹配，${summary.unmatched} 未匹配`;
}

async function loadCachedAvailability() {
  try {
    const response = await sendMessage({ type: "GET_CACHED_DATA" });
    if (Array.isArray(response.lastFillData) && response.lastFillData.length > 0) {
      ui.useCachedBtn.classList.remove("hidden");
    }
  } catch (_err) {
    // ignore
  }
}

async function bootstrap() {
  try {
    state.tabId = await getActiveTabId();
    const pageResponse = await sendMessage({ type: "GET_PAGE_INFO", tabId: state.tabId });
    state.pageInfo = pageResponse.currentPage;

    if (!state.pageInfo?.isGradePage) {
      ui.pageHint.textContent = "当前不是成绩页面";
      setVisible("notGradePage");
      return;
    }

    ui.pageHint.textContent = "已检测到 ManageBac 成绩页面";
    ui.pageMeta.textContent = `${state.pageInfo.className || "未知班级"} · ${state.pageInfo.taskName || "未知作业"}`;
    setVisible("stepGrab");
    await loadCachedAvailability();
  } catch (error) {
    ui.pageHint.textContent = "页面检测失败";
    setVisible("notGradePage");
    showToast(error instanceof Error ? error.message : "初始化失败");
  }
}

async function parseStudents() {
  const response = await sendMessage({ type: "PARSE_STUDENTS", tabId: state.tabId });
  state.students = response.students || [];
  if (!state.students.length) {
    throw new Error("未解析到学生列表，请确认页面已完整加载");
  }
}

async function parseImportedRows() {
  await parseStudents();

  const file = ui.csvFile.files?.[0];
  let parsed;

  if (file) {
    const filename = String(file.name || "").toLowerCase();
    const isXlsx = filename.endsWith(".xlsx") || file.type.includes("spreadsheetml");

    if (isXlsx) {
      parsed = await parseXlsxFile(file, { pageStudents: state.students });
    } else {
      parsed = await parseCsvFile(file, { pageStudents: state.students });
    }
  } else {
    parsed = parseScoreText(ui.scoreInput.value, { pageStudents: state.students });
  }

  if (!parsed.rows.length) {
    throw new Error("没有可用分数数据，请检查粘贴内容或 CSV/Excel 文件");
  }

  state.importedRows = parsed.rows;
  if (parsed.errors.length) {
    appendLog(`解析警告：${parsed.errors[0]}`);
  }
}

async function doMatching() {
  const mappingResp = await sendMessage({ type: "GET_NAME_MAPPINGS" });
  const mapping = mappingResp.nameMapping || {};
  const matched = matchImportedToStudents(state.importedRows, state.students, mapping);
  state.matchedRows = matched.results;
  renderSummary(matched.summary);
  renderMatchList();
}

async function moveToCheck() {
  ui.fillLog.innerHTML = "";
  try {
    await parseImportedRows();
    await doMatching();
    setVisible("stepCheck");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "匹配失败");
  }
}

function buildFillPayload() {
  const payload = state.matchedRows
    .filter((row) => row.selectedStudentId && String(row.score || "").trim() !== "")
    .map((row) => ({
      importedName: row.importedName,
      studentId: row.selectedStudentId,
      studentName: row.selectedStudentName,
      score: String(row.score || "").trim()
    }));

  return payload;
}

async function startFill() {
  try {
    state.fillPayload = buildFillPayload();
    if (!state.fillPayload.length) {
      throw new Error("没有可填入的数据，请先确认匹配关系");
    }

    state.fillInProgress = true;
    ui.fillLog.innerHTML = "";
    ui.progressText.textContent = `正在填入... 0/${state.fillPayload.length}`;
    ui.progressBarInner.style.width = "0%";

    setVisible("stepFill");

    const response = await sendMessage({
      type: "FILL_GRADES",
      tabId: state.tabId,
      items: state.fillPayload
    });

    if (state.fillInProgress) {
      finalizeFill(response.summary, response.results || []);
    }
  } catch (error) {
    state.fillInProgress = false;
    showToast(error instanceof Error ? error.message : "填入失败");
  }
}

async function finalizeFill(summary, results) {
  if (!summary) return;

  state.fillInProgress = false;
  ui.progressText.textContent = `完成：成功 ${summary.success}/${summary.total}，失败 ${summary.failed}`;
  ui.progressBarInner.style.width = "100%";

  appendLog(`✅ 填入完成：成功 ${summary.success}，失败 ${summary.failed}`);

  const failedRows = (results || []).filter((row) => row.status === "failed");
  failedRows.forEach((row) => appendLog(`❌ ${row.studentName || row.studentId}：${row.reason || "失败"}`));

  await sendMessage({
    type: "LOG_FILL_HISTORY",
    classId: state.pageInfo?.classId,
    taskId: state.pageInfo?.taskId,
    results
  });

  if (ui.cacheDataCheckbox.checked) {
    await sendMessage({
      type: "CACHE_FILL_DATA",
      rows: state.fillPayload.map((item) => ({ name: item.studentName, score: item.score }))
    });
    appendLog("💾 已缓存本次数据，可用于平行班。");
  }

  const mapping = buildMappingFromManualAdjustments(state.matchedRows);
  if (Object.keys(mapping).length > 0) {
    await sendMessage({ type: "SAVE_NAME_MAPPINGS", mapping });
    appendLog("🧠 已保存手动匹配映射，下次自动应用。");
  }
}

ui.toCheckBtn.addEventListener("click", moveToCheck);
ui.backToGrabBtn.addEventListener("click", () => setVisible("stepGrab"));
ui.startFillBtn.addEventListener("click", startFill);
ui.finishBtn.addEventListener("click", () => {
  setVisible("stepGrab");
  showToast("已完成，可切换平行班后继续使用", "success");
});

ui.useCachedBtn.addEventListener("click", async () => {
  try {
    const response = await sendMessage({ type: "GET_CACHED_DATA" });
    const lines = (response.lastFillData || []).map((item) => `${item.name}\t${item.score}`);
    ui.scoreInput.value = lines.join("\n");
    showToast("已载入上次数据", "success");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "读取缓存失败");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (!state.fillInProgress) return;

  if (message?.type === "FILL_PROGRESS") {
    const { index, total, result } = message;
    const percent = total ? Math.round((index / total) * 100) : 0;
    ui.progressText.textContent = `正在填入... ${index}/${total}`;
    ui.progressBarInner.style.width = `${percent}%`;

    if (result?.status === "success") {
      appendLog(`✅ ${result.studentName} → ${result.score}`);
    } else {
      appendLog(`❌ ${result.studentName || result.studentId}：${result.reason || "失败"}`);
    }
  }

  if (message?.type === "FILL_COMPLETE") {
    finalizeFill(message.summary, message.results || []).catch((error) => {
      showToast(error instanceof Error ? error.message : "收尾处理失败");
    });
  }
});

bootstrap();
