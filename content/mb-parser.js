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

  function pickInputFromRow(row) {
    const preferred = selectors.studentList?.gradeInput;
    if (preferred) {
      const target = row.querySelector(preferred);
      if (target) return target;
    }

    return row.querySelector("input, [contenteditable='true']");
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

  function parseGradePage() {
    const rowSelector = selectors.studentList?.row || "tr";
    const rows = Array.from(document.querySelectorAll(rowSelector));
    const students = [];

    rows.forEach((row, index) => {
      const inputElement = pickInputFromRow(row);
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
