(() => {
  const namespace = (globalThis.MBGradeFiller = globalThis.MBGradeFiller || {});
  const selectors = globalThis.MB_SELECTORS || {};

  function safeQueryText(selector) {
    if (!selector) return "";
    const node = document.querySelector(selector);
    return node ? String(node.textContent || "").trim() : "";
  }

  function parseUrlInfo() {
    const href = String(location.href || "");
    const primary = selectors.gradePage?.urlPattern?.exec(href);
    const fallback = selectors.gradePage?.altUrlPattern?.exec(href);
    const match = primary || fallback;

    if (!match) {
      return { classId: "", taskId: "" };
    }

    return {
      classId: match[1] || "",
      taskId: match[2] || ""
    };
  }

  function isGradePage() {
    const info = parseUrlInfo();
    const hasUrlPattern = Boolean(info.classId && info.taskId);

    if (hasUrlPattern) return true;

    const indicator = selectors.gradePage?.indicator;
    return indicator ? Boolean(document.querySelector(indicator)) : false;
  }

  function buildPageInfo() {
    const urlInfo = parseUrlInfo();
    const className =
      safeQueryText(selectors.pageInfo?.className) ||
      (document.title.includes("-") ? document.title.split("-")[0].trim() : document.title);

    const taskName =
      safeQueryText(selectors.pageInfo?.taskName) ||
      (document.title.includes("-") ? document.title.split("-").slice(1).join("-").trim() : "");

    return {
      classId: urlInfo.classId,
      taskId: urlInfo.taskId,
      className,
      taskName,
      href: location.href
    };
  }

  function notifyBackground() {
    const payload = {
      type: "PAGE_DETECTED",
      isGradePage: isGradePage(),
      pageInfo: buildPageInfo(),
      timestamp: Date.now()
    };

    chrome.runtime.sendMessage(payload, () => {
      void chrome.runtime.lastError;
    });

    namespace.pageState = payload;
  }

  function installUrlChangeHook() {
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;

    history.pushState = function patchedPushState(...args) {
      const result = originalPush.apply(this, args);
      setTimeout(notifyBackground, 150);
      return result;
    };

    history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplace.apply(this, args);
      setTimeout(notifyBackground, 150);
      return result;
    };

    window.addEventListener("popstate", () => setTimeout(notifyBackground, 150));
    window.addEventListener("hashchange", () => setTimeout(notifyBackground, 150));
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_PAGE_INFO_FROM_CONTENT") {
      sendResponse({
        ok: true,
        isGradePage: isGradePage(),
        pageInfo: buildPageInfo()
      });
      return true;
    }

    return false;
  });

  installUrlChangeHook();
  notifyBackground();

  const observer = new MutationObserver(() => {
    clearTimeout(namespace.__detectTimer);
    namespace.__detectTimer = setTimeout(notifyBackground, 300);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
