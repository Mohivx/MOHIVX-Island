// Headless Playwright regression for Vision-inspired settings & apps drawer.
// Purely in-memory IPC; never invokes Windows apps, desktop GUI, mic or notifications.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');

const baseSource = fs.readFileSync(path.join(__dirname, 'reviewed-features.browser.cjs'), 'utf8')
  .split('(async()=>{')[0]
  .replace("if(channel==='get-installed-apps')return", "if(channel==='get-installed-apps')return window.__appsFixtures||")
  .replace(
    "if(channel==='get-app-version')",
    `if(channel==='get-windows-banner-control-status')return {success:true,hasSavedState:false};
     if(channel==='use-island-notifications')return window.__bannerReply||{success:true,hasSavedState:true};
     if(channel==='restore-windows-banners')return {success:true,hasSavedState:false};
     if(channel==='get-app-version')`
  );

const fixtureModule = { exports: {} };
vm.runInNewContext(baseSource + '\nmodule.exports={server,fixture,chromium};', {
  require,
  __dirname,
  module: fixtureModule,
  process,
  URL
});
const { server, fixture, chromium } = fixtureModule.exports;

const TARGET_APP_ID = 'OpenAI.ChatGPT_family!App';
const STORE_CHATGPT = {
  name: 'ChatGPT',
  appId: TARGET_APP_ID,
  path: 'shell:AppsFolder\\' + TARGET_APP_ID,
  letter: 'C',
  type: 'Application'
};
const ALIAS_ONE = {
  name: 'ChatGPT Alias 1',
  target: 'C:/Program Files/WindowsApps/OpenAI.ChatGPT_family!App/ChatGPT.exe',
  args: '--profile Default',
  path: 'C:/ProgramData/Microsoft/Windows/Start Menu/Programs/ChatGPT.lnk',
  appId: TARGET_APP_ID,
  letter: 'C',
  type: 'Shortcut'
};
const ALIAS_TWO = {
  name: 'ChatGPT Alias 2',
  target: 'C:/Program Files/WindowsApps/OpenAI.ChatGPT_family!App/ChatGPT.exe',
  args: '--profile Default',
  path: 'C:/Users/mahib/Desktop/ChatGPT.lnk',
  appId: TARGET_APP_ID,
  letter: 'C',
  type: 'Shortcut'
};
const CUSTOM_CHATGPT = {
  name: 'ChatGPT Custom',
  path: 'shell:AppsFolder\\' + TARGET_APP_ID,
  letter: 'C',
  type: 'Custom App',
  isCustom: true
};

const EXPECTED_SECTIONS = [
  'Hitodama',
  'Customization',
  'Shortcuts',
  'Behavior',
  'System',
  'API keys',
  'Your data',
  'Notifications',
  'Permissions',
  'Privacy'
];

async function assertNoHorizontalOverflow(page, label) {
  const overflows = await page.evaluate(() => {
    const list = [];
    const elements = [
      { name: 'document.body', el: document.body },
      { name: 'sidebar', el: document.querySelector('.settings-layout-sidebar') },
      { name: 'content', el: document.querySelector('.settings-layout-content') },
      { name: 'app-container', el: document.querySelector('.companion-body') }
    ];
    for (const item of elements) {
      if (item.el) {
        if (item.el.scrollWidth > item.el.clientWidth + 1) {
          list.push({ name: item.name, scrollWidth: item.el.scrollWidth, clientWidth: item.el.clientWidth });
        }
      }
    }
    return list;
  });
  assert.deepEqual(overflows, [], `Horizontal overflow detected in ${label}: ` + JSON.stringify(overflows));
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MOHIVX_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });

  try {
    for (const lang of ['en', 'ar']) {
      const ar = lang === 'ar';

      // -------------------------------------------------------------
      // 1. Settings Window QA at widths 1180 and 780, height 800
      // -------------------------------------------------------------
      for (const width of [1180, 780]) {
        const context = await browser.newContext({ viewport: { width, height: 800 } });
        await context.route('**/*', r => (r.request().url().startsWith(origin) ? r.continue() : r.abort()));
        await fixture(context, lang);

        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto(origin + '/?view=hub');
        await page.locator('[data-testid="companion-app"]').waitFor();

        const nav = page.getByRole('navigation', { name: ar ? 'أقسام الإعدادات' : 'Settings sections' });
        await nav.waitFor();

        // Check sidebar lists ten sections including Notifications
        const navButtons = nav.getByRole('button');
        const count = await navButtons.count();
        assert.equal(count, 10, `Sidebar must contain 10 sections at width ${width} (${lang}), got ${count}`);

        // Notifications section must be present in nav
        const notifNavBtn = nav.getByRole('button', { name: ar ? 'الإشعارات' : 'Notifications', exact: true });
        assert.equal(await notifNavBtn.count(), 1, `Notifications button missing in ${lang}`);

        // All last nav items must be reachable by scrolling the sidebar
        const lastNavBtn = navButtons.nth(count - 1);
        await lastNavBtn.scrollIntoViewIfNeeded();
        assert(await lastNavBtn.isVisible(), `Last nav item should be reachable by scrolling at width ${width} (${lang})`);

        // Check horizontal overflow
        await assertNoHorizontalOverflow(page, `settings-default-${width}-${lang}`);

        // Keyword search 'wallpaper' or 'خلفيات' yields Customization
        const searchInput = page.getByRole('searchbox', { name: ar ? 'بحث الإعدادات' : 'Search settings' }).or(page.getByPlaceholder(ar ? 'بحث الإعدادات' : 'Search settings'));
        await searchInput.fill(ar ? 'خلفيات' : 'wallpaper');

        const searchNavButtons = nav.getByRole('button');
        assert.equal(await searchNavButtons.count(), 1, 'Search should filter to Customization only');
        const customBtn = nav.getByRole('button', { name: ar ? 'التخصيص' : 'Customization', exact: true });
        assert.equal(await customBtn.count(), 1);

        // Enter navigates to Customization
        await searchInput.press('Enter');
        const contentHeader = page.locator('.settings-layout-content h1');
        await contentHeader.waitFor();
        assert.equal(await contentHeader.innerText(), ar ? 'التخصيص' : 'Customization');

        // Clear restores navigation
        const clearBtn = page.getByRole('button', { name: ar ? 'مسح بحث الإعدادات' : 'Clear settings search' });
        await clearBtn.click();
        assert.equal(await nav.getByRole('button').count(), 10, 'Clearing search restores 10 sections');

        // Nonsense search shows localized no-results
        await searchInput.fill('xyznonexistentquery123');
        const noResults = page.locator('.no-results');
        await noResults.waitFor();
        assert.equal(await noResults.innerText(), ar ? 'لا توجد نتائج.' : 'No settings found.');
        await searchInput.fill('');

        // Notifications controls test & persistence across reload
        await notifNavBtn.click();
        await page.locator('.notification-settings-panel').waitFor();

        // Switch notification appearance & persist
        const styleSelect = page.getByLabel(ar ? 'شكل الإشعار' : 'Notification appearance', { exact: true });
        await styleSelect.selectOption('compact');

        const motionSelect = page.getByLabel(ar ? 'حركة الإشعار' : 'Notification motion', { exact: true });
        await motionSelect.selectOption('fade');

        const durationSelect = page.getByLabel(ar ? 'مدة ظهور الإشعار' : 'Notification duration', { exact: false });
        await durationSelect.selectOption('3');

        // Verify Windows notification switches exist and function
        const popupsSwitch = page.getByRole('switch', { name: ar ? 'نوافذ إشعارات MOHIVX في ويندوز' : 'MOHIVX Windows popups', exact: true });
        const initialChecked = await popupsSwitch.getAttribute('aria-checked');
        await popupsSwitch.click();
        assert.notEqual(await popupsSwitch.getAttribute('aria-checked'), initialChecked);

        // Reload page to verify persistence
        await page.reload();
        await page.locator('[data-testid="companion-app"]').waitFor();
        const reloadedNav = page.getByRole('navigation', { name: ar ? 'أقسام الإعدادات' : 'Settings sections' });
        await reloadedNav.getByRole('button', { name: ar ? 'الإشعارات' : 'Notifications', exact: true }).click();

        assert.equal(await page.getByLabel(ar ? 'شكل الإشعار' : 'Notification appearance', { exact: true }).inputValue(), 'compact');
        assert.equal(await page.getByLabel(ar ? 'حركة الإشعار' : 'Notification motion', { exact: true }).inputValue(), 'fade');
        assert.equal(await page.locator('#notice-duration').inputValue(), '3');

        // Check horizontal overflow again on notifications panel
        await assertNoHorizontalOverflow(page, `settings-notifications-${width}-${lang}`);

        // Save screenshot at 1180px width
        if (width === 1180) {
          await page.screenshot({ path: path.join(__dirname, `notifications-settings-${lang}.png`),animations:'disabled' });
          await reloadedNav.getByRole('button',{name:ar?'هيتوداما':'Hitodama',exact:true}).click();
          await page.screenshot({ path: path.join(__dirname, `apps-vision-settings-${lang}.png`),animations:'disabled' });
        }

        assert.deepEqual(errors, [], `Unexpected page errors at width ${width} (${lang})`);
        await context.close();
      }

      // -------------------------------------------------------------
      // 2. Apps drawer QA: ChatGPT deduping, Store app + aliases + custom path
      // -------------------------------------------------------------
      {
        const context = await browser.newContext({ viewport: { width: 1180, height: 900 } });
        await context.route('**/*', r => (r.request().url().startsWith(origin) ? r.continue() : r.abort()));
        await fixture(context, lang);

        // Populate localStorage custom apps fixture before mounting
        await context.addInitScript(({ customApp, storeApp, alias1, alias2 }) => {
          localStorage.setItem('hitodama_custom_apps', JSON.stringify([customApp]));
          // Override get-installed-apps in IPC to return store item + shortcut aliases
          window.__appsFixtures=[storeApp,alias1,alias2,{name:'Calculator',path:'C:/fixture/calc.exe',letter:'C',type:'Application'}];
        }, { customApp: CUSTOM_CHATGPT, storeApp: STORE_CHATGPT, alias1: ALIAS_ONE, alias2: ALIAS_TWO });

        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto(origin);
        await page.locator('[data-island-stage]').waitFor();

        // Open apps tab via Alt+A
        await page.keyboard.press('Alt+A');
        const search = page.getByRole('combobox');
        await search.waitFor();
        await page.locator('.island-section-nav').hover();
        const refresh=page.getByRole('button',{name:ar?'تحديث قائمة التطبيقات':'Refresh applications',exact:true});await refresh.click();
        assert.equal(await page.evaluate(()=>window.__test.requests.filter(r=>r.channel==='get-installed-apps').at(-1).arg.refresh),true);

        // Search for ChatGPT
        await search.fill('ChatGPT');
        await page.waitForTimeout(100);

        // Verify shared merging shows only ONE ChatGPT instance (no duplicate aliases or custom app copy)
        const matchedAppCards = page.locator('[data-app-key]').filter({ hasText: 'ChatGPT' });
        const count = await matchedAppCards.count();
        assert.equal(count, 1, `Shared app merge must produce exactly 1 ChatGPT instance, found ${count}`);

        // Launch app via ArrowDown + Enter
        await page.keyboard.press('ArrowDown');
        await page.locator('[data-app-selected="true"]').filter({ hasText: 'ChatGPT' }).waitFor();
        await page.keyboard.press('Enter');

        // Verify in-memory launch-app request carrying appId
        const launchRequests = await page.evaluate(() => window.__test.requests.filter(r => r.channel === 'launch-app'));
        assert(launchRequests.length > 0, 'Must have at least one launch-app request');
        const lastLaunch = launchRequests.at(-1);
        assert.equal(lastLaunch.arg.appId, TARGET_APP_ID, 'launch-app payload must carry target appId');

        assert.deepEqual(errors, [], `Unexpected page errors in apps drawer (${lang})`);
        await context.close();
      }
    }
    console.log('All Apps + Vision Settings regression assertions passed.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
  server.close();
});
