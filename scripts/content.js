// ====== 邮箱保护机制解码工具 BEGIN ======
// Cloudflare邮箱保护解码
function decodeCloudflareEmails(dom) {
  const emails = [];
  dom.querySelectorAll("span.__cf_email__").forEach((span) => {
    const encoded = span.getAttribute("data-cfemail");
    if (encoded) {
      let email = "",
        r = parseInt(encoded.substr(0, 2), 16),
        n,
        i;
      for (n = 2; encoded.length - n; n += 2) {
        i = parseInt(encoded.substr(n, 2), 16) ^ r;
        email += String.fromCharCode(i);
      }
      emails.push(email);
    }
  });
  return emails;
}
// 预留：Base64、实体、ROT13等机制
function decodeBase64Emails(dom) {
  // 伪代码：查找所有base64邮箱并解码
  return [];
}
// 统一入口，返回所有解码出的邮箱
function decodeAllProtectedEmails(dom) {
  return [
    ...decodeCloudflareEmails(dom),
    ...decodeBase64Emails(dom),
    // 未来可扩展更多机制
  ];
}
// ====== 邮箱保护机制解码工具 END ======

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageData") {
    const html = document.documentElement.outerHTML;
    const links = getPotentialLinks();
    const emails = getAllEmails();
    sendResponse({ html, links, emails });
  }
});

function getAllEmails() {
  const emails = new Set();
  // 1. mailto
  document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
    const email = link
      .getAttribute("href")
      .replace("mailto:", "")
      .split("?")[0];
    if (email) emails.add(email);
  });
  // 2. 文本正则
  const text = document.body.innerText;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  (text.match(emailRegex) || []).forEach((email) => emails.add(email));
  // 3. 保护机制解码
  decodeAllProtectedEmails(document).forEach((email) => emails.add(email));
  return Array.from(emails);
}

function getPotentialLinks() {
  const contactKeywords = [
    "contact us",
    "contact",
    "about",
    "about us",
    "communication",
    "team",
  ];
  const links = Array.from(document.links);
  const potentialLinks = new Set();
  links.forEach((link) => {
    const href = link.href;
    const linkText = link.textContent.toLowerCase();
    for (const keyword of contactKeywords) {
      if (linkText.includes(keyword)) {
        potentialLinks.add(href);
      }
    }
  });
  return Array.from(potentialLinks);
}
