document.addEventListener("DOMContentLoaded", () => {
  const crawlButton = document.getElementById("crawlButton");
  const emailList = document.getElementById("emailList");
  const linksDiv = document.getElementById("links");
  const exportBtn = document.getElementById("export-csv");
  const clearBtn = document.getElementById("clear-cache");
  const resetBtn = document.getElementById("reset-crawling");
  const statusDiv = document.getElementById("status");

  let lastEmails = [];
  let lastLinks = [];
  let lastUrl = "";

  function setStatus(msg, color = "#1bbf4c") {
    statusDiv.textContent = msg;
    statusDiv.style.color = color;
  }

  function clearStatus() {
    statusDiv.textContent = "";
  }

  function updateEmailList(emails) {
    lastEmails = emails;
    emailList.innerHTML = "";
    if (emails.length > 0) {
      emails.forEach((email) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="email-user">${
          email.split("@")[0]
        }</span><a class="email-link" href="mailto:${email}">${email}</a>`;
        emailList.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No emails found yet.";
      emailList.appendChild(li);
    }
  }

  function updatePotentialLinks(links) {
    lastLinks = links;
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

  function setCrawlingState(isCrawling) {
    crawlButton.textContent = isCrawling ? "Crawling..." : "Crawl Emails";
    crawlButton.disabled = isCrawling;
  }

  async function getCurrentTabInfo() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          resolve({ tab: tabs[0], url: tabs[0].url, tabId: tabs[0].id });
        } else {
          resolve(null);
        }
      });
    });
  }

  async function getPageData(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ["scripts/content.js"],
        },
        () => {
          chrome.tabs.sendMessage(tabId, { action: "getPageData" }, (resp) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError.message);
            } else if (!resp) {
              reject("无法获取页面数据");
            } else {
              resolve(resp);
            }
          });
        }
      );
    });
  }

  async function crawlEmails(forceRefresh = false) {
    setCrawlingState(true);
    setStatus("正在爬取邮箱，请稍候...", "#334eff");
    updateEmailList([]);
    updatePotentialLinks([]);
    try {
      const tabInfo = await getCurrentTabInfo();
      if (!tabInfo) throw new Error("无法获取当前标签页");
      lastUrl = tabInfo.url;
      const { html, links, emails } = await getPageData(tabInfo.tabId);
      updatePotentialLinks(links);
      // 优先用content script直接提取到的emails
      if (emails && emails.length > 0) {
        setCrawlingState(false);
        setStatus("邮箱爬取完成，共 " + emails.length + " 个邮箱");
        updateEmailList(emails);
        return;
      }
      // fallback: 让background处理html
      chrome.runtime.sendMessage(
        {
          action: "crawlEmails",
          url: lastUrl,
          html,
          links,
          forceRefresh,
        },
        (resp) => {
          setCrawlingState(false);
          if (!resp || !resp.emails) {
            setStatus("邮箱爬取失败", "#e74c3c");
            updateEmailList([]);
          } else {
            setStatus("邮箱爬取完成，共 " + resp.emails.length + " 个邮箱");
            updateEmailList(resp.emails);
          }
        }
      );
    } catch (e) {
      setCrawlingState(false);
      setStatus("爬取失败: " + e, "#e74c3c");
      updateEmailList([]);
    }
  }

  crawlButton.addEventListener("click", () => crawlEmails(false));

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      chrome.runtime.sendMessage({ action: "clearEmailCache" }, (resp) => {
        setStatus("缓存已清空");
        updateEmailList([]);
        setTimeout(clearStatus, 1500);
      });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      setStatus("状态已重置");
      setCrawlingState(false);
      updateEmailList([]);
      setTimeout(clearStatus, 1500);
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      if (!lastEmails || lastEmails.length === 0) {
        alert("没有可导出的邮箱");
        return;
      }
      let csvContent = "姓名,邮箱\n";
      lastEmails.forEach((email) => {
        const name = email.split("@")[0];
        csvContent += `"${name}","${email}"\n`;
      });
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "emails.csv";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    });
  }

  // 自动加载一次（可选：如需首次自动爬取可取消注释）
  // crawlEmails(false);
});
