import { extractEmails } from "./core/emailExtractor.js";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "crawl") {
    const tabId = request.tabId;
    const url = request.url;
    const domain = new URL(url).hostname;
    const allEmails = new Set();
    const allPotentialLinks = new Set();
    let pending = 0;

    // 初始化状态
    chrome.storage.local.set({
      ["crawling_" + tabId]: true,
      ["emails_" + domain]: [],
      ["potentialLinks_" + domain]: [],
    });

    // 1. 处理当前页面
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        files: ["scripts/content.js"],
      })
      .then(() => {
        chrome.tabs.sendMessage(
          tabId,
          { action: "getPageData" },
          (response) => {
            if (response) {
              (response.emails || []).forEach((email) => allEmails.add(email));
              (response.links || []).forEach((link) =>
                allPotentialLinks.add(link)
              );
              chrome.storage.local.set({
                ["emails_" + domain]: Array.from(allEmails),
                ["potentialLinks_" + domain]: Array.from(allPotentialLinks),
              });

              // 2. 仅访问每个潜在链接页面一次并提取邮箱
              const links = Array.from(allPotentialLinks);
              pending = links.length;
              if (pending === 0) finish();
              links.forEach((link) => {
                chrome.tabs.create({ url: link, active: false }, (newTab) => {
                  chrome.tabs.onUpdated.addListener(function listener(
                    tabId_,
                    info
                  ) {
                    if (tabId_ === newTab.id && info.status === "complete") {
                      chrome.scripting
                        .executeScript({
                          target: { tabId: newTab.id },
                          files: ["scripts/content.js"],
                        })
                        .then(() => {
                          chrome.tabs.sendMessage(
                            newTab.id,
                            { action: "getPageData" },
                            (resp) => {
                              if (resp && resp.emails) {
                                resp.emails.forEach((email) =>
                                  allEmails.add(email)
                                );
                                chrome.storage.local.set({
                                  ["emails_" + domain]: Array.from(allEmails),
                                });
                              }
                              chrome.tabs.remove(newTab.id, () => {
                                pending--;
                                if (pending === 0) finish();
                              });
                            }
                          );
                        })
                        .catch(() => {
                          chrome.tabs.remove(newTab.id, () => {
                            pending--;
                            if (pending === 0) finish();
                          });
                        });
                      chrome.tabs.onUpdated.removeListener(listener);
                    }
                  });
                });
              });
            } else {
              finish();
            }
          }
        );
      });

    function finish() {
      chrome.storage.local.set({ ["crawling_" + tabId]: false });
      chrome.runtime.sendMessage({
        action: "displayResults",
        emails: Array.from(allEmails),
        domain: domain,
      });
    }
  }
});
