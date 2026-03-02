const STATE_KEY = "mb_grade_filler_state";

const DEFAULT_STATE = {
  currentPage: {
    tabId: null,
    classId: "",
    taskId: "",
    className: "",
    taskName: "",
    isGradePage: false,
    href: ""
  },
  lastFillData: [],
  nameMapping: {},
  fillHistory: []
};

async function getState() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  return { ...DEFAULT_STATE, ...(stored[STATE_KEY] || {}) };
}

async function saveState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}

async function routeToTab(tabId, message) {
  if (!tabId && tabId !== 0) {
    throw new Error("未找到目标标签页");
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(STATE_KEY);
  if (!existing[STATE_KEY]) {
    await chrome.storage.local.set({ [STATE_KEY]: DEFAULT_STATE });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "PAGE_DETECTED": {
        const tabId = sender?.tab?.id ?? null;
        const pageInfo = message.pageInfo || {};
        const next = await saveState({
          currentPage: {
            tabId,
            classId: pageInfo.classId || "",
            taskId: pageInfo.taskId || "",
            className: pageInfo.className || "",
            taskName: pageInfo.taskName || "",
            href: pageInfo.href || "",
            isGradePage: Boolean(message.isGradePage)
          }
        });

        sendResponse({ ok: true, currentPage: next.currentPage });
        return;
      }

      case "GET_PAGE_INFO": {
        const state = await getState();
        const tabId = message.tabId ?? state.currentPage?.tabId;

        let page = state.currentPage;

        if (tabId || tabId === 0) {
          try {
            const live = await routeToTab(tabId, { type: "GET_PAGE_INFO_FROM_CONTENT" });
            if (live?.ok) {
              page = {
                tabId,
                classId: live.pageInfo?.classId || "",
                taskId: live.pageInfo?.taskId || "",
                className: live.pageInfo?.className || "",
                taskName: live.pageInfo?.taskName || "",
                href: live.pageInfo?.href || "",
                isGradePage: Boolean(live.isGradePage)
              };
              await saveState({ currentPage: page });
            }
          } catch (_error) {
            // ignore live refresh failure and keep cached page state
          }
        }

        sendResponse({ ok: true, currentPage: page });
        return;
      }

      case "PARSE_STUDENTS": {
        const tabId = message.tabId;
        const response = await routeToTab(tabId, { type: "PARSE_STUDENTS" });
        sendResponse(response || { ok: false, error: "解析失败" });
        return;
      }

      case "FILL_GRADES": {
        const tabId = message.tabId;
        const items = Array.isArray(message.items) ? message.items : [];
        const response = await routeToTab(tabId, { type: "FILL_GRADES", items });
        sendResponse(response || { ok: false, error: "填入失败" });
        return;
      }

      case "CACHE_FILL_DATA": {
        const rows = Array.isArray(message.rows)
          ? message.rows.map((r) => ({ name: String(r.name || ""), score: String(r.score || "") }))
          : [];

        const state = await saveState({ lastFillData: rows });
        sendResponse({ ok: true, lastFillData: state.lastFillData });
        return;
      }

      case "GET_CACHED_DATA": {
        const state = await getState();
        sendResponse({ ok: true, lastFillData: state.lastFillData || [] });
        return;
      }

      case "GET_NAME_MAPPINGS": {
        const state = await getState();
        sendResponse({ ok: true, nameMapping: state.nameMapping || {} });
        return;
      }

      case "SAVE_NAME_MAPPINGS": {
        const incoming = message.mapping || {};
        const state = await getState();
        const merged = { ...(state.nameMapping || {}), ...incoming };
        await saveState({ nameMapping: merged });
        sendResponse({ ok: true, nameMapping: merged });
        return;
      }

      case "LOG_FILL_HISTORY": {
        const state = await getState();
        const history = Array.isArray(state.fillHistory) ? [...state.fillHistory] : [];
        history.unshift({
          timestamp: Date.now(),
          classId: message.classId || state.currentPage?.classId || "",
          taskId: message.taskId || state.currentPage?.taskId || "",
          results: Array.isArray(message.results) ? message.results : []
        });

        const trimmed = history.slice(0, 100);
        await saveState({ fillHistory: trimmed });
        sendResponse({ ok: true });
        return;
      }

      default:
        sendResponse({ ok: false, error: "未知消息类型" });
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "后台处理失败" });
  });

  return true;
});
