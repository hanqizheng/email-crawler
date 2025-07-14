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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "crawlEmails") {
    // request: { action, url, html, links, forceRefresh }
    (async () => {
      const { url, html, links, forceRefresh } = request;
      const allEmails = new Set();
      // 1. 当前页面邮箱
      extractEmailsFromHtml(html).forEach((e) => allEmails.add(e));
      // 2. 相关链接邮箱
      const linkResults = await Promise.all(
        (links || []).map(async (link) => {
          if (!forceRefresh) {
            const cached = await getCachedEmails(link);
            if (cached) return cached;
          }
          const pageHtml = await fetchPageHtml(link);
          if (pageHtml) {
            const emails = extractEmailsFromHtml(pageHtml);
            setCachedEmails(link, emails);
            return emails;
          } else {
            return [];
          }
        })
      );
      linkResults.flat().forEach((e) => allEmails.add(e));
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
});
