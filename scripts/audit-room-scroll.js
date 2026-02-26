const { chromium } = require('playwright');

async function run() {
  const baseUrl = 'http://127.0.0.1:3000';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const result = {
    ok: false,
    roomUrl: null,
    checks: {},
    metrics: {}
  };

  try {
    await page.goto(`${baseUrl}/auth/dev-login`, { waitUntil: 'domcontentloaded' });
    await page.goto(`${baseUrl}/chat/rooms`, { waitUntil: 'domcontentloaded' });

    let roomHref = await page.locator('a[href*="/chat/room/"]').first().getAttribute('href').catch(() => null);
    if (!roomHref) {
      const onclick = await page.locator('[onclick*=\"/chat/room/\"]').first().getAttribute('onclick');
      if (onclick) {
        const match = onclick.match(/\/chat\/room\/[^'")]+/);
        if (match) {
          roomHref = match[0];
        }
      }
    }
    if (!roomHref) {
      throw new Error('Nenhuma sala encontrada na listagem.');
    }

    const roomUrl = roomHref.startsWith('http') ? roomHref : `${baseUrl}${roomHref}`;
    result.roomUrl = roomUrl;

    await page.goto(roomUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#messagesArea', { state: 'visible' });
    await page.waitForTimeout(1800);

    const before = await page.$eval('#messagesArea', (el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY
    }));

    await page.$eval('#messagesArea', (el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    await page.waitForTimeout(1200);

    const afterTop = await page.$eval('#messagesArea', (el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }));

    await page.evaluate(() => {
      if (typeof window.scrollMessagesToBottom === 'function') {
        window.scrollMessagesToBottom(true);
      } else {
        const el = document.getElementById('messagesArea');
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      }
    });

    await page.waitForTimeout(150);

    const afterBottom = await page.$eval('#messagesArea', (el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }));

    const scrollBtnVisible = await page.$eval('#scrollBottomBtn', (el) => {
      const cls = el.className || '';
      return !cls.includes('invisible') && !cls.includes('opacity-0');
    });

    result.metrics.before = before;
    result.metrics.afterTop = afterTop;
    result.metrics.afterBottom = afterBottom;

    result.checks.hasScrollableContent = before.scrollHeight > before.clientHeight;
    result.checks.overflowEnabled = before.overflowY === 'auto' || before.overflowY === 'scroll';
    result.checks.canGoTop = afterTop.scrollTop <= 2;
    result.checks.canGoBottom = (afterBottom.scrollTop + afterBottom.clientHeight) >= (afterBottom.scrollHeight - 4);
    result.checks.scrollButtonAppearsWhenUp = scrollBtnVisible;

    result.ok = Object.values(result.checks).every(Boolean);

    await page.screenshot({ path: 'scripts/audit-room-scroll.png', fullPage: false });
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('[audit-room-scroll] erro:', err.message);
  process.exit(1);
});
