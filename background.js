import { extractEmailsFromHtml } from "./core/emailExtractor.js";

const CACHE_EXPIRE_MS = 24 * 60 * 60 * 1000; // 24小时

// 获取缓存（带过期判断）
async function getCachedEmails(url) {
  return new Promise((resolve) => {
    chrome.storage.local.get([url], (result) => {
      const entry = result[url];
      if (entry && entry.ts && Date.now() - entry.ts < CACHE_EXPIRE_MS) {
        resolve(entry.emails || []);
      } else {
        resolve(null);
      }
    });
  });
}

// 设置缓存
function setCachedEmails(url, emails) {
  chrome.storage.local.set({
    [url]: { emails, ts: Date.now() },
  });
}

// 后台 fetch 页面内容
async function fetchPageHtml(url) {
  try {
    const resp = await fetch(url, { credentials: "omit" });
    if (!resp.ok) throw new Error("Network error");
    return await resp.text();
  } catch (e) {
    return null;
  }
}

// 任务状态管理
function getTaskKey(tabId) {
  return `email_task_${tabId}`;
}

// 初始化任务状态
function initTask(tabId, mainUrl, relatedUrls) {
  const progress = [
    { url: mainUrl, state: "pending" },
    ...relatedUrls.map((url) => ({ url, state: "pending" })),
  ];
  const task = {
    started: Date.now(),
    finished: false,
    progress,
    emails: [],
    error: null,
  };
  console.log("[BG] 初始化任务", tabId, getTaskKey(tabId), task);
  chrome.storage.local.set({ [getTaskKey(tabId)]: task });
}

// 更新任务进度
function updateTask(tabId, update) {
  const key = getTaskKey(tabId);
  chrome.storage.local.get([key], (result) => {
    const task = result[key] || {};
    const newTask = { ...task, ...update };
    console.log("[BG] 更新任务", tabId, key, newTask);
    chrome.storage.local.set({ [key]: newTask });
  });
}

// 更新单个请求状态
function updateTaskProgress(tabId, url, state) {
  const key = getTaskKey(tabId);
  chrome.storage.local.get([key], (result) => {
    const task = result[key] || {};
    const progress = (task.progress || []).map((item) =>
      item.url === url ? { ...item, state } : item
    );
    const newTask = { ...task, progress };
    console.log("[BG] 更新进度", tabId, url, state, newTask);
    chrome.storage.local.set({ [key]: newTask });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "crawlEmails") {
    console.log("[BG] crawlEmails request=", request, "sender=", sender);
    (async () => {
      const { url, html, links, forceRefresh } = request;
      // 优先用request.tabId（popup传递），否则用sender.tab.id
      const tabId = request.tabId || (sender.tab ? sender.tab.id : undefined);
      console.log("[BG] crawlEmails resolved tabId=", tabId);
      if (!tabId) {
        console.error("[BG] 未获取到tabId，无法初始化任务");
        sendResponse({ emails: [] });
        return;
      }
      const allEmails = new Set();
      const allUrls = [url, ...(links || [])];
      // 1. 初始化任务状态
      initTask(tabId, url, links || []);
      // 2. 主页面邮箱
      updateTaskProgress(tabId, url, "loading");
      try {
        extractEmailsFromHtml(html).forEach((e) => allEmails.add(e));
        updateTaskProgress(tabId, url, "done");
      } catch (e) {
        updateTaskProgress(tabId, url, "error");
      }
      // 3. 相关链接邮箱
      await Promise.all(
        (links || []).map(async (link) => {
          updateTaskProgress(tabId, link, "loading");
          try {
            let emails = null;
            if (!forceRefresh) {
              emails = await getCachedEmails(link);
            }
            if (!emails) {
              const pageHtml = await fetchPageHtml(link);
              if (pageHtml) {
                emails = extractEmailsFromHtml(pageHtml);
                setCachedEmails(link, emails);
              } else {
                emails = [];
              }
            }
            emails.forEach((e) => allEmails.add(e));
            updateTaskProgress(tabId, link, "done");
          } catch (e) {
            updateTaskProgress(tabId, link, "error");
          }
        })
      );
      // 4. 任务完成
      updateTask(tabId, {
        finished: true,
        emails: Array.from(allEmails),
        ended: Date.now(),
      });
      sendResponse({ emails: Array.from(allEmails) });
    })();
    // 异步响应
    return true;
  }
  if (request.action === "clearEmailCache") {
    // 清除所有缓存
    chrome.storage.local.clear(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (request.action === "getEmailTaskStatus") {
    const tabId = request.tabId;
    const key = getTaskKey(tabId);
    chrome.storage.local.get([key], (result) => {
      console.log("[BG] 查询任务", tabId, key, result[key]);
      sendResponse(result[key] || null);
    });
    return true;
  }
});
