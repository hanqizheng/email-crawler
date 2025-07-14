// Cloudflare邮箱保护解码
export function decodeCloudflareEmails(dom) {
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
export function decodeBase64Emails(dom) {
  // 伪代码：查找所有base64邮箱并解码
  return [];
}

// 统一入口，返回所有解码出的邮箱
export function decodeAllProtectedEmails(dom) {
  return [
    ...decodeCloudflareEmails(dom),
    ...decodeBase64Emails(dom),
    // 未来可扩展更多机制
  ];
}
