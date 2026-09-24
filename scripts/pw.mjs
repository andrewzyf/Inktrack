// Shared Playwright helpers for in-browser verification scripts.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

export async function launch({ mobile = false, width = 1280, height = 720 } = {}) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext(
    mobile
      ? { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width, height } },
  );
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return { browser, context, page, logs };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
