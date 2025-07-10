export function extractEmails(text) {
  // De-obfuscate common patterns like "user [at] example.com"
  const deobfuscatedText = text.replace(/\s*\[\s*at\s*\]\s*/g, '@').replace(/\s*\(\s*at\s*\)\s*/g, '@');
  
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const foundEmails = deobfuscatedText.match(emailRegex) || [];
  
  // Filter for unique emails
  const uniqueEmails = [...new Set(foundEmails)];
  
  return uniqueEmails;
}