chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageData") {
    const { emails, links } = getPageData();
    sendResponse({ emails, links });
  }
});

function getPageData() {
  const contactKeywords = ["contact us", "about", "about us"];
  const links = Array.from(document.links);
  const emails = new Set();
  const potentialLinks = new Set();

  // 1. 提取页面文本中的邮箱
  const text = document.body.innerText;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  (text.match(emailRegex) || []).forEach((email) => emails.add(email));

  // 2. 提取所有a标签的邮箱和潜在链接
  links.forEach((link) => {
    const href = link.href;
    const linkText = link.textContent.toLowerCase();
    if (href.toLowerCase().startsWith("mailto:")) {
      const email = href.replace(/^mailto:/i, "").split("?")[0];
      if (email) emails.add(email);
    } else {
      for (const keyword of contactKeywords) {
        if (linkText.includes(keyword)) {
          potentialLinks.add(href);
        }
      }
    }
  });

  return { emails: Array.from(emails), links: Array.from(potentialLinks) };
}
