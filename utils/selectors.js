(() => {
  // 重要：以下选择器是基于常见结构的占位值。
  // 你需要在真实 ManageBac 成绩页面中用 DevTools 校准。
  const MB_SELECTORS = {
    gradePage: {
      indicator: '.gradebook-container, [data-component="gradebook"], [role="grid"]',
      urlPattern: /\/classes\/([^/]+)\/tasks\/([^/?#]+)/i,
      altUrlPattern: /\/classes\/([^/]+)\/(?:assessments|gradebook|assignments)\/([^/?#]+)/i
    },
    taskList: {
      table: 'table.gradebook-table, table[data-component="gradebook"], table',
      headerRow: 'thead tr, [role="rowgroup"] [role="row"]',
      headerCell: 'th, [role="columnheader"]',
      taskIdAttr: 'data-task-id'
    },
    studentList: {
      container: 'table tbody, [role="rowgroup"], .student-grades-list',
      row: 'tr[data-student-id], tr, [role="row"], .student-row',
      nameCell: '[data-student-name], td.student-name, .student-name-cell, [data-column="student"], [aria-label*="student"], td:first-child',
      gradeInput: 'input[data-student-id], input[data-task-id], input[type="text"], input[type="number"], [contenteditable="true"]',
      studentIdAttr: 'data-student-id'
    },
    pageInfo: {
      className: '.class-name, .breadcrumb .current, [data-class-name], h1, h2',
      taskName: '.task-title, h1.page-title, [data-task-name], h1, h2'
    },
    saveButton: 'button.save-grades, input[type="submit"].save, button[type="submit"]'
  };

  globalThis.MB_SELECTORS = MB_SELECTORS;
})();
