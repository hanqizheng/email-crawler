export function extractEmailsFromHtml(html) {
  // 1. 提取 mailto 链接中的邮箱
  const mailtoEmails = [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const mailtoLinks = doc.querySelectorAll('a[href^="mailto:"]');
    mailtoLinks.forEach((link) => {
      const email = link
        .getAttribute("href")
        .replace("mailto:", "")
        .split("?")[0];
      if (email) mailtoEmails.push(email);
    });
  } catch (e) {
    // DOMParser 失败时忽略
  }

  // 2. 提取文本中的邮箱（含去混淆）
  const deobfuscatedText = html
    .replace(/\s*\[\s*at\s*\]\s*/g, "@")
    .replace(/\s*\(\s*at\s*\)\s*/g, "@");
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const foundEmails = deobfuscatedText.match(emailRegex) || [];

  // 3. 过滤掉资源文件名、黑名单域名、token邮箱等伪邮箱
  const INVALID_SUFFIXES = [
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".gif",
    ".webp",
    ".js",
    ".css",
    ".ico",
    ".json",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp4",
    ".mp3",
    ".pdf",
  ];
  const DOMAIN_BLACKLIST = [
    "sentry.io",
    "ingest.us.sentry.io",
    "google-analytics.com",
    "mixpanel.com",
    "segment.com",
    "datadoghq.com",
    "newrelic.com",
    "cloudfront.net",
    "amazonaws.com",
    "baidu.com",
    "cnzz.com",
  ];
  function looksLikeResource(email) {
    return INVALID_SUFFIXES.some((suffix) =>
      email.toLowerCase().endsWith(suffix)
    );
  }
  function isBlacklistedDomain(email) {
    const domain = email.split("@")[1]?.toLowerCase();
    return DOMAIN_BLACKLIST.some((bad) => domain && domain.endsWith(bad));
  }
  function isSuspiciousTokenEmail(email) {
    // 过滤掉本地部分全是16进制且长度大于20的邮箱
    const local = email.split("@")[0];
    return /^[a-f0-9]{20,}$/i.test(local);
  }

  // 4. 合并去重并过滤
  const uniqueEmails = [...new Set([...mailtoEmails, ...foundEmails])].filter(
    (email) =>
      !looksLikeResource(email) &&
      !isBlacklistedDomain(email) &&
      !isSuspiciousTokenEmail(email)
  );
  return uniqueEmails;
}
