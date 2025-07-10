document.addEventListener("DOMContentLoaded", () => {
  const crawlButton = document.getElementById("crawlButton");
  const emailList = document.getElementById("emailList");
  const linksDiv = document.getElementById("links");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0].url;
    const domain = new URL(url).hostname;
    const tabId = tabs[0].id;
    // Restore state from storage for this tab
    chrome.storage.local.get(
      ["crawling_" + tabId, "emails_" + domain, "potentialLinks_" + domain],
      (result) => {
        if (result["crawling_" + tabId] === true) {
          crawlButton.textContent = "Crawling...";
          crawlButton.disabled = true;
          emailList.innerHTML =
            "<li>Scanning site... This may take a moment.</li>";
        } else {
          crawlButton.textContent = "Crawl Emails";
          crawlButton.disabled = false;
          updateEmailList(result["emails_" + domain] || []);
        }
        updatePotentialLinks(result["potentialLinks_" + domain] || []);
      }
    );

    // Listen for storage changes for this tab
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (Object.prototype.hasOwnProperty.call(changes, "crawling_" + tabId)) {
        if (changes["crawling_" + tabId].newValue === true) {
          crawlButton.textContent = "Crawling...";
          crawlButton.disabled = true;
          emailList.innerHTML =
            "<li>Scanning site... This may take a moment.</li>";
        } else {
          crawlButton.textContent = "Crawl Emails";
          crawlButton.disabled = false;
          // 只有在邮箱为空时才显示“未发现邮箱”
          chrome.storage.local.get(["emails_" + domain], (result) => {
            updateEmailList(result["emails_" + domain] || []);
          });
        }
      }
      if (changes["emails_" + domain]) {
        updateEmailList(changes["emails_" + domain].newValue || []);
      }
      if (changes["potentialLinks_" + domain]) {
        updatePotentialLinks(
          changes["potentialLinks_" + domain].newValue || []
        );
      }
    });

    // Listen for final results from the background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "displayResults" && request.domain === domain) {
        updateEmailList(request.emails || []);
        crawlButton.textContent = "Crawl Emails";
        crawlButton.disabled = false;
      }
    });

    // Start the crawling process
    crawlButton.addEventListener("click", () => {
      emailList.innerHTML = "<li>Scanning site... This may take a moment.</li>";
      crawlButton.textContent = "Crawling...";
      crawlButton.disabled = true;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          chrome.runtime.sendMessage({
            action: "crawl",
            tabId: tabs[0].id,
            url: tabs[0].url,
          });
        } else {
          emailList.innerHTML =
            "<li>Error: Cannot access the current page URL.</li>";
          crawlButton.textContent = "Crawl Emails";
          crawlButton.disabled = false;
        }
      });
    });

    // 清空缓存按钮只清空当前域名下的缓存
    const clearBtn = document.getElementById("clear-cache");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        chrome.storage.local.remove("emails_" + domain, () => {
          document.getElementById("status").textContent = "缓存已清空";
          updateEmailList([]);
          setTimeout(() => {
            document.getElementById("status").textContent = "";
          }, 1500);
        });
      });
    }

    // 重置状态按钮，清理当前tab的crawling状态
    const resetBtn = document.getElementById("reset-crawling");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        chrome.storage.local.remove("crawling_" + tabId, () => {
          document.getElementById("status").textContent = "爬取状态已重置";
          crawlButton.textContent = "Crawl Emails";
          crawlButton.disabled = false;
          setTimeout(() => {
            document.getElementById("status").textContent = "";
          }, 1500);
        });
      });
    }

    // 自动清理异常crawling状态：如果crawling为true但没有正在爬取，自动清理
    chrome.storage.local.get(["crawling_" + tabId], (result) => {
      if (result["crawling_" + tabId] === true) {
        // 检查是否真的在爬取（可根据实际情况扩展，比如检查队列等）
        // 这里直接清理
        chrome.storage.local.remove("crawling_" + tabId, () => {
          crawlButton.textContent = "Crawl Emails";
          crawlButton.disabled = false;
        });
      }
    });
  });

  function updateEmailList(emails) {
    emailList.innerHTML = "";
    if (emails.length > 0) {
      emails.forEach((email) => {
        const li = document.createElement("li");
        li.textContent = email;
        emailList.appendChild(li);
      });
    } else {
      // 只有在不爬取时才显示未发现邮箱
      if (crawlButton.textContent !== "Crawling...") {
        const li = document.createElement("li");
        li.textContent = "No emails found yet.";
        emailList.appendChild(li);
      }
    }
  }

  function updatePotentialLinks(links) {
    linksDiv.innerHTML = "<b>潜在联系方式链接：</b><br/>";
    if (links && links.length > 0) {
      links.forEach((href) => {
        const a = document.createElement("a");
        a.href = href;
        a.textContent = href;
        a.target = "_blank";
        a.className = "link-item";
        linksDiv.appendChild(a);
        linksDiv.appendChild(document.createElement("br"));
      });
    } else {
      linksDiv.innerHTML += "未发现相关链接。";
    }
  }
});
