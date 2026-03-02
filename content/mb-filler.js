(() => {
  const namespace = (globalThis.MBGradeFiller = globalThis.MBGradeFiller || {});
  const selectors = globalThis.MB_SELECTORS || {};

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function dispatchEvents(target) {
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    target.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

    input.focus();

    if (typeof nativeSetter === "function") {
      nativeSetter.call(input, "");
      nativeSetter.call(input, value);
    } else {
      input.value = "";
      input.value = value;
    }

    dispatchEvents(input);
  }

  function setEditableValue(node, value) {
    node.focus();
    node.textContent = "";
    node.textContent = value;
    dispatchEvents(node);
  }

  function pickRows() {
    const rowSelector = selectors.studentList?.row || "tr";
    return Array.from(document.querySelectorAll(rowSelector));
  }

  function collectInputs(row) {
    const preferred = selectors.studentList?.gradeInput;
    if (preferred) {
      const nodes = Array.from(row.querySelectorAll(preferred));
      if (nodes.length) return nodes;
    }
    return Array.from(row.querySelectorAll("input, [contenteditable='true']"));
  }

  function escapeAttrValue(value) {
    return String(value || "").replace(/"/g, '\\"');
  }

  function pickInputFromRow(row, task) {
    const inputs = collectInputs(row);
    if (!inputs.length) return null;

    if (task?.id) {
      const attr = selectors.taskList?.taskIdAttr || "data-task-id";
      const escapedTaskId = escapeAttrValue(task.id);
      const direct =
        row.querySelector(`[${attr}="${escapedTaskId}"]`) ||
        row.querySelector(`[data-task-id="${escapedTaskId}"]`) ||
        row.querySelector(`[name*="${escapedTaskId}"]`) ||
        row.querySelector(`[id*="${escapedTaskId}"]`);
      if (direct) return direct;
    }

    if (typeof task?.index === "number" && task.index >= 0 && task.index < inputs.length) {
      return inputs[task.index];
    }

    return inputs[0];
  }

  function pickNameFromRow(row) {
    const selector = selectors.studentList?.nameCell;
    if (selector) {
      const nameNode = row.querySelector(selector);
      const value = String(nameNode?.textContent || "").trim();
      if (value) return value;
    }

    const fallback = Array.from(row.querySelectorAll("td, [role='gridcell'], [role='cell']"))
      .map((node) => String(node.textContent || "").trim())
      .find((txt) => txt && !/^\d+(\.\d+)?$/.test(txt));

    return fallback || "";
  }

  function pickStudentId(row, input, index) {
    const attr = selectors.studentList?.studentIdAttr || "data-student-id";
    return (
      row.getAttribute(attr) ||
      input?.getAttribute(attr) ||
      row.dataset?.studentId ||
      input?.dataset?.studentId ||
      row.getAttribute("data-id") ||
      input?.getAttribute("data-id") ||
      `row-${index}`
    );
  }

  function buildInputMap(task) {
    const rows = pickRows();
    const map = new Map();

    rows.forEach((row, index) => {
      const input = pickInputFromRow(row, task);
      if (!input) return;
      const name = pickNameFromRow(row);
      const studentId = pickStudentId(row, input, index);
      map.set(studentId, { input, name, studentId });
      if (name) map.set(`name:${name}`, { input, name, studentId });
    });

    return map;
  }

  async function fillGrades(items, task) {
    const inputMap = buildInputMap(task);
    const results = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const keyById = item.studentId;
      const keyByName = item.studentName ? `name:${item.studentName}` : "";
      const target = inputMap.get(keyById) || (keyByName ? inputMap.get(keyByName) : null);

      if (!target) {
        const failed = {
          status: "failed",
          studentId: item.studentId,
          studentName: item.studentName || item.importedName || "",
          score: item.score,
          reason: `任务[${task?.name || task?.id || "默认"}]输入框未找到`
        };
        results.push(failed);
        chrome.runtime.sendMessage({ type: "FILL_PROGRESS", index: index + 1, total: items.length, result: failed });
        continue;
      }

      try {
        const score = String(item.score ?? "").trim();
        if (target.input instanceof HTMLInputElement) {
          setInputValue(target.input, score);
        } else {
          setEditableValue(target.input, score);
        }

        const success = {
          status: "success",
          studentId: target.studentId,
          studentName: target.name,
          score
        };

        results.push(success);
        chrome.runtime.sendMessage({ type: "FILL_PROGRESS", index: index + 1, total: items.length, result: success });
      } catch (error) {
        const failed = {
          status: "failed",
          studentId: target.studentId,
          studentName: target.name,
          score: String(item.score ?? ""),
          reason: error instanceof Error ? error.message : "填入失败"
        };
        results.push(failed);
        chrome.runtime.sendMessage({ type: "FILL_PROGRESS", index: index + 1, total: items.length, result: failed });
      }

      await delay(200 + Math.random() * 300);
    }

    const summary = {
      total: results.length,
      success: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length
    };

    const payload = { type: "FILL_COMPLETE", summary, results, task };
    chrome.runtime.sendMessage(payload, () => {
      void chrome.runtime.lastError;
    });

    return payload;
  }

  namespace.fillGrades = fillGrades;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FILL_GRADES") {
      const items = Array.isArray(message.items) ? message.items : [];
      const task = message.task || null;
      fillGrades(items, task)
        .then((data) => sendResponse({ ok: true, ...data }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "填入失败" }));
      return true;
    }

    return false;
  });
})();
