(() => {
  const namespace = (globalThis.MBGradeFiller = globalThis.MBGradeFiller || {});
  const selectors = globalThis.MB_SELECTORS || {};

  function textOf(node) {
    return node ? String(node.textContent || "").trim() : "";
  }

  function pickNameFromRow(row) {
    const preferred = selectors.studentList?.nameCell;
    if (preferred) {
      const target = row.querySelector(preferred);
      const value = textOf(target);
      if (value) return value;
    }

    const cells = Array.from(row.querySelectorAll("td, [role='gridcell'], [role='cell']"));
    for (const cell of cells) {
      const value = textOf(cell);
      if (!value) continue;
      if (/^\d+(\.\d+)?$/.test(value)) continue;
      return value;
    }

    return "";
  }

  function collectInputs(row) {
    const preferred = selectors.studentList?.gradeInput;
    if (preferred) {
      const nodes = Array.from(row.querySelectorAll(preferred));
      if (nodes.length) return nodes;
    }
    return Array.from(row.querySelectorAll("input, [contenteditable='true']"));
  }

  function normalizeTaskId(taskId) {
    return String(taskId || "").trim();
  }

  function escapeAttrValue(value) {
    return value.replace(/"/g, '\\"');
  }

  function pickInputFromRow(row, task) {
    const inputs = collectInputs(row);
    if (!inputs.length) return null;

    if (task?.id) {
      const normalizedTaskId = normalizeTaskId(task.id);
      const attr = selectors.taskList?.taskIdAttr || "data-task-id";
      const escaped = escapeAttrValue(normalizedTaskId);

      const direct =
        row.querySelector(`[${attr}="${escaped}"]`) ||
        row.querySelector(`[data-task-id="${escaped}"]`) ||
        row.querySelector(`[name*="${escaped}"]`) ||
        row.querySelector(`[id*="${escaped}"]`);

      if (direct) return direct;
    }

    if (typeof task?.index === "number" && task.index >= 0 && task.index < inputs.length) {
      return inputs[task.index];
    }

    return inputs[0];
  }

  function pickStudentId(row, input, index) {
    const attr = selectors.studentList?.studentIdAttr || "data-student-id";

    const direct = row.getAttribute(attr) || input?.getAttribute(attr);
    if (direct) return direct;

    const viaDataset = row.dataset?.studentId || input?.dataset?.studentId;
    if (viaDataset) return viaDataset;

    const aria = row.getAttribute("data-id") || input?.getAttribute("data-id");
    if (aria) return aria;

    return `row-${index}`;
  }

  function getPageInfo() {
    const state = namespace.pageState?.pageInfo || {};
    return {
      classId: state.classId || "",
      taskId: state.taskId || "",
      className: state.className || "",
      taskName: state.taskName || "",
      href: location.href
    };
  }

  function parseTaskList() {
    const tableSelector = selectors.taskList?.table || "table";
    const table = document.querySelector(tableSelector);
    if (!table) return [];

    const headerRowSelector = selectors.taskList?.headerRow || "thead tr";
    const headerCellSelector = selectors.taskList?.headerCell || "th";
    const headerRow = table.querySelector(headerRowSelector);
    if (!headerRow) return [];

    const headerCells = Array.from(headerRow.querySelectorAll(headerCellSelector));
    if (headerCells.length <= 1) return [];

    const attr = selectors.taskList?.taskIdAttr || "data-task-id";

    return headerCells
      .slice(1)
      .map((cell, index) => {
        const name = textOf(cell) || `Task ${index + 1}`;
        const taskId =
          cell.getAttribute(attr) ||
          cell.getAttribute("data-task-id") ||
          cell.dataset?.taskId ||
          `task-${index + 1}`;

        return {
          id: String(taskId),
          name,
          index
        };
      })
      .filter((task) => task.name);
  }

  function parseGradePage() {
    const rowSelector = selectors.studentList?.row || "tr";
    const rows = Array.from(document.querySelectorAll(rowSelector));
    const tasks = parseTaskList();
    const activeTask = tasks[0] || null;
    const students = [];

    rows.forEach((row, index) => {
      const inputElement = pickInputFromRow(row, activeTask);
      if (!inputElement) return;

      const name = pickNameFromRow(row);
      if (!name) return;

      const studentId = pickStudentId(row, inputElement, index);
      const currentValue =
        inputElement instanceof HTMLInputElement
          ? String(inputElement.value || "")
          : String(inputElement.textContent || "").trim();

      students.push({
        name,
        studentId,
        rowIndex: index,
        currentValue,
        inputType:
          inputElement instanceof HTMLInputElement
            ? inputElement.type || "text"
            : inputElement.getAttribute("contenteditable")
              ? "contenteditable"
              : "unknown"
      });
    });

    return {
      students,
      tasks,
      totalCount: students.length,
      pageInfo: getPageInfo()
    };
  }

  namespace.parseGradePage = parseGradePage;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PARSE_STUDENTS") {
      try {
        const data = parseGradePage();
        sendResponse({ ok: true, ...data });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "解析失败" });
      }
      return true;
    }

    return false;
  });
})();
