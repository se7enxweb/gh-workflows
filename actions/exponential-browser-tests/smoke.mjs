// Exponential Platform browser smoke test (Playwright, Chromium).
//
//   node smoke.mjs <base-url> <admin-paths> <user> <password> <out-dir>
//
// 1. The front page answers without a server error and without an exception page.
// 2. The first admin path that shows a login form is used to sign in; after
//    signing in the browser must have left the login page, and the page must
//    not be an error page.
// Screenshots of every step land in <out-dir>.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base, adminPathsArg, user, password, out] = process.argv.slice(2);
const adminPaths = adminPathsArg.split(',').map((p) => p.trim()).filter(Boolean);
fs.mkdirSync(out, { recursive: true });

const failures = [];
const errorPattern = /(Uncaught|Fatal error|Stack trace|An exception occurred|Whoops, looks like something went wrong)/i;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function visit(url, name) {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    const status = response ? response.status() : 0;
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    const text = await page.content();
    console.log(`${name}: ${url} -> HTTP ${status}, title "${await page.title()}"`);
    return { status, text };
}

// 1. Front page
{
    const { status, text } = await visit(`${base}/`, '01-front-page');
    if (status >= 500 || status === 0) failures.push(`front page answered HTTP ${status}`);
    if (errorPattern.test(text)) failures.push('front page shows an error page');
}

// 2. Admin login
let loggedIn = false;
for (const [i, path] of adminPaths.entries()) {
    const { status } = await visit(`${base}${path}`, `02-admin-${i}`);
    const userField = page.locator('input[name="_username"], input#username').first();
    if (status >= 500 || (await userField.count()) === 0) {
        console.log(`  no login form at ${path}`);
        continue;
    }
    // Type like a person: the admin login enables its button from key events.
    const passwordField = page.locator('input[name="_password"], input#password').first();
    await userField.click();
    await userField.pressSequentially(user, { delay: 20 });
    await passwordField.click();
    await passwordField.pressSequentially(password, { delay: 20 });
    const button = page.locator('form button[type="submit"], form input[type="submit"]').first();
    try {
        await button.waitFor({ state: 'visible', timeout: 5000 });
        await page.waitForFunction((el) => !el.disabled, await button.elementHandle(), { timeout: 10000 });
        await Promise.all([page.waitForNavigation({ timeout: 60000 }), button.click()]);
    } catch (e) {
        console.log(`  login button not usable (${String(e).split('\n')[0]}); submitting the form directly`);
        await Promise.all([
            page.waitForNavigation({ timeout: 60000 }),
            passwordField.evaluate((el) => el.form.submit()),
        ]);
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}/03-after-login.png`, fullPage: true });
    const url = page.url();
    const text = await page.content();
    console.log(`after login: ${url}, title "${await page.title()}"`);
    if (/\/login(\b|$)/.test(new URL(url).pathname)) failures.push(`still on the login page after signing in (${url})`);
    if (errorPattern.test(text)) failures.push('the page after signing in is an error page');
    loggedIn = true;
    break;
}
if (!loggedIn) failures.push(`no admin login form found at ${adminPaths.join(', ')}`);

await browser.close();
if (consoleErrors.length) console.log(`JavaScript errors (reported, not fatal):\n  ${consoleErrors.join('\n  ')}`);
if (failures.length) {
    console.log(`FAIL\n  ${failures.join('\n  ')}`);
    process.exit(1);
}
console.log('PASS');
