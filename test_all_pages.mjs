// Quick automated test of all pages
import { chromium } from 'playwright';

const BASE = 'https://doorworld168-ai.github.io/doorworld-admin/';
const PAGES = [
  '/', '/bossview', '/members', '/products', '/service', '/quotes',
  '/measurement', '/drafting', '/formalquote', '/cases', '/ordering',
  '/salesorder', '/internalorder', '/chinafactory', '/twfactory',
  '/installation', '/payment', '/finance', '/accessories', '/staff'
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Login first
await page.goto(BASE);
await page.fill('input[placeholder="admin_user"]', 'admin');
await page.fill('input[placeholder="••••••••"]', 'doorworld2025');
await page.click('button:has-text("登入管理後台")');
await page.waitForTimeout(1500);

const results = [];
for (const path of PAGES) {
  const errors = [];
  const errHandler = (msg) => { if (msg.type() === 'error') errors.push(msg.text()); };
  const pageErrHandler = (err) => errors.push('PAGE_ERR: ' + err.message);
  page.on('console', errHandler);
  page.on('pageerror', pageErrHandler);

  try {
    await page.goto(BASE + path.replace(/^\//, ''), { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(800);
    const title = await page.$eval('body', b => b.innerText.slice(0, 100)).catch(() => '');
    const hasError = title.includes('頁面發生錯誤') || title.includes('系統已更新');
    results.push({
      path,
      status: hasError ? '❌ CRASH' : '✅ OK',
      errors: errors.filter(e => !e.includes('favicon') && !e.includes('DevTools')),
      preview: title.slice(0, 50).replace(/\n/g, ' ')
    });
  } catch (e) {
    results.push({ path, status: '❌ TIMEOUT', errors: [e.message], preview: '' });
  }

  page.off('console', errHandler);
  page.off('pageerror', pageErrHandler);
}

console.log('\n=== Results ===\n');
results.forEach(r => {
  console.log(`${r.status}  ${r.path}`);
  if (r.errors.length) r.errors.forEach(e => console.log('    🔴', e.slice(0, 150)));
});

console.log('\n=== Summary ===');
console.log('OK:', results.filter(r => r.status.includes('OK')).length);
console.log('FAIL:', results.filter(r => !r.status.includes('OK')).length);

await browser.close();
