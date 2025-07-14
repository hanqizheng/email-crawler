document.addEventListener("DOMContentLoaded", () => {
  const crawlButton = document.getElementById("crawlButton");
  const emailList = document.getElementById("emailList");
  const exportBtn = document.getElementById("export-csv");
  const clearBtn = document.getElementById("clear-cache");
  const statusDiv = document.getElementById("status");

  let lastEmails = [];
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
    try {
      const tabInfo = await getCurrentTabInfo();
      console.log("[POPUP] crawlEmails, tabInfo=", tabInfo);
      if (!tabInfo) throw new Error("无法获取当前标签页");
      lastUrl = tabInfo.url;
      const { html, links, emails } = await getPageData(tabInfo.tabId);
      // debug: 确认 links 是否正确
      console.log("[POPUP] crawlEmails, links=", links);
      // 优先用content script直接提取到的emails
      if (emails && emails.length > 0) {
        setCrawlingState(false);
        setStatus("邮箱爬取完成，共 " + emails.length + " 个邮箱");
        updateEmailList(emails);
        showExportBtn(true);
        return;
      }
      // fallback: 让background处理html和links
      const msg = {
        action: "crawlEmails",
        url: lastUrl,
        html,
        links,
        forceRefresh,
        tabId: tabInfo.tabId, // 明确传递tabId，保证一致性
      };
      console.log("[POPUP] sendMessage crawlEmails", msg);
      chrome.runtime.sendMessage(msg, (resp) => {
        console.log("[POPUP] crawlEmails resp=", resp);
        setCrawlingState(false);
        if (!resp || !resp.emails) {
          setStatus("邮箱爬取失败", "#e74c3c");
          updateEmailList([]);
        } else {
          setStatus("邮箱爬取完成，共 " + resp.emails.length + " 个邮箱");
          updateEmailList(resp.emails);
          showExportBtn(true);
        }
      });
    } catch (e) {
      setCrawlingState(false);
      setStatus("爬取失败: " + e, "#e74c3c");
      updateEmailList([]);
    }
  }

  // 新增：进度UI渲染
  function renderProgressUI(task) {
    const progressDiv = document.getElementById("progress-ui");
    if (!progressDiv) return;
    progressDiv.innerHTML = "";
    if (!task || !task.progress) return;
    // 顶部loading icon
    const loadingIcon = document.createElement("div");
    loadingIcon.style.display = "flex";
    loadingIcon.style.justifyContent = "center";
    loadingIcon.style.alignItems = "center";
    loadingIcon.style.margin = "16px 0 8px 0";
    loadingIcon.innerHTML = `<svg class="spin" width="32" height="32" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#334eff" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.4 31.4" transform="rotate(-90 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/></circle></svg>`;
    progressDiv.appendChild(loadingIcon);
    // 进度列表
    const list = document.createElement("ul");
    list.style.listStyle = "none";
    list.style.padding = "0";
    list.style.margin = "0";
    task.progress.forEach((item) => {
      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.marginBottom = "6px";
      let color = "#334eff",
        text = "请求中";
      if (item.state === "done") {
        color = "#1bbf4c";
        text = "已完成";
      }
      if (item.state === "error") {
        color = "#e74c3c";
        text = "失败";
      }
      li.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};margin-right:8px;"></span><span style="flex:1;word-break:break-all;">${item.url}</span><span style="margin-left:8px;font-size:0.95em;color:${color};">${text}</span>`;
      list.appendChild(li);
    });
    progressDiv.appendChild(list);
    // 进度条（可选）
    const total = task.progress.length;
    const done = task.progress.filter((i) => i.state === "done").length;
    const bar = document.createElement("div");
    bar.style.height = "6px";
    bar.style.background = "#ebefff";
    bar.style.borderRadius = "4px";
    bar.style.margin = "12px 0 0 0";
    bar.innerHTML = `<div style="width:${
      (done / total) * 100
    }%;height:100%;background:#334eff;border-radius:4px;"></div>`;
    progressDiv.appendChild(bar);
  }

  // 读取任务状态并渲染
  async function loadAndRenderTask(tabId) {
    console.log("[POPUP] loadAndRenderTask, tabId=", tabId);
    chrome.runtime.sendMessage(
      { action: "getEmailTaskStatus", tabId },
      (task) => {
        console.log("[POPUP] 读取任务", tabId, task);
        if (task && !task.finished) {
          document.getElementById("progress-ui").style.display = "block";
          renderProgressUI(task);
          setCrawlingState(true);
        } else {
          document.getElementById("progress-ui").style.display = "none";
          setCrawlingState(false);
        }
        if (task && task.finished && task.emails) {
          setStatus("邮箱爬取完成，共 " + task.emails.length + " 个邮箱");
          updateEmailList(task.emails);
          showExportBtn(true);
        } else {
          showExportBtn(false);
        }
      }
    );
  }

  // 控制导出按钮显示
  function showExportBtn(show) {
    const exportBtn = document.getElementById("export-csv");
    if (exportBtn) exportBtn.style.display = show ? "block" : "none";
  }

  // 新增：进度UI容器
  let progressDiv = document.getElementById("progress-ui");
  if (!progressDiv) {
    progressDiv = document.createElement("div");
    progressDiv.id = "progress-ui";
    progressDiv.style.margin = "0 0 16px 0";
    document.body.insertBefore(
      progressDiv,
      document.getElementById("emailList")
    );
  }
  progressDiv.style.display = "none";

  // 页面加载时恢复进度
  getCurrentTabInfo().then((tabInfo) => {
    console.log("[POPUP] DOMContentLoaded, tabInfo=", tabInfo);
    if (tabInfo) loadAndRenderTask(tabInfo.tabId);
  });

  // 监听 storage 变化，实时刷新进度
  chrome.storage.onChanged.addListener((changes, namespace) => {
    getCurrentTabInfo().then((tabInfo) => {
      console.log("[POPUP] storage.onChanged, tabInfo=", tabInfo);
      if (tabInfo) loadAndRenderTask(tabInfo.tabId);
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      chrome.runtime.sendMessage({ action: "clearEmailCache" }, (resp) => {
        setStatus("缓存已清空");
        updateEmailList([]);
        setTimeout(clearStatus, 1500);
      });
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

  // 获取邮箱按钮点击时，重置进度UI
  crawlButton.addEventListener("click", () => {
    document.getElementById("progress-ui").style.display = "block";
    showExportBtn(false);
    crawlEmails(false);
  });

  // 自动加载一次（可选：如需首次自动爬取可取消注释）
  // crawlEmails(false);
});
