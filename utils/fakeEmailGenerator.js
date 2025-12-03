function generateFakeEmail(name) {
  const domains = ['example.com','mail.com','fakeemail.com'];
  const randomDomain = domains[Math.floor(Math.random() * domains.length)];
  const sanitized = name.toLowerCase().replace(/\s/g,'');
  const randomNum = Math.floor(Math.random() * 10000);
  return `${sanitized}${randomNum}@${randomDomain}`;
}

module.exports = generateFakeEmail;
