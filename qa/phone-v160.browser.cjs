// Headless browser QA test for MOHIVX Island Phone v1.6.0 features.
// Fixture IPC only; no live Windows or Android devices modified.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const { chromium } = require(process.env.MOHIVX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist');

// Ensure qa directory exists for screenshots
fs.mkdirSync(__dirname, { recursive: true });

const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://local').pathname;
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    const ext = path.extname(file);
    const contentType = ({
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    })[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MOHIVX_TEST_BROWSER || undefined
  });

  try {
    // -------------------------------------------------------------
    // PART 1: Phone Hub (load hub with fake devices Samsung A16 id a & Pixel id b)
    // -------------------------------------------------------------
    for (const lang of ['en', 'ar']) {
      const ar = lang === 'ar';

      // First run at 1080px wide
      const context = await browser.newContext({ viewport: { width: 1080, height: 760 } });
      await context.route('**/*', route => {
        if (route.request().url().startsWith(origin)) route.continue();
        else route.abort();
      });

      await context.addInitScript(({ lang }) => {
        const listeners = new Map();
        const requests = [];

        const deviceA = {
          id: 'a',
          name: 'Samsung A16',
          capabilities: ['phoneData', 'phoneScreen', 'phoneControl', 'phoneCamera', 'phoneMic']
        };
        const deviceB = {
          id: 'b',
          name: 'Pixel',
          capabilities: ['phoneData', 'phoneScreen', 'phoneControl', 'phoneCamera', 'phoneMic']
        };

        const notificationsA = [
          { id: 'notif-1', app: 'WhatsApp', title: 'Ahmed', text: 'Hey there!', at: Date.now() - 60000, sms: false },
          { id: 'notif-2', app: 'Messages', title: 'Telecom', text: 'Balance alert', at: Date.now() - 120000, sms: true }
        ];

        const syncStatusA = {
          at: Date.now(),
          status: {
            model: 'Samsung Galaxy A16',
            battery: 67,
            charging: true,
            connection: 'wifi',
            version: '1.6.0',
            notifications: true,
            capture: [],
            controlEnabled: true,
            name: 'Samsung A16'
          },
          notifications: notificationsA
        };

        const syncStatusB = {
          at: Date.now(),
          status: {
            model: 'Google Pixel 8',
            battery: 88,
            charging: false,
            connection: 'wifi',
            version: '1.6.0',
            notifications: true,
            capture: [],
            controlEnabled: true,
            name: 'Pixel'
          },
          notifications: [
            { id: 'notif-b1', app: 'Telegram', title: 'Tech Group', text: 'Update available', at: Date.now() - 30000, sms: false }
          ]
        };

        let settings = {
          appLang: lang,
          theme: 'original-blue',
          phoneSelectedDevice: 'a',
          phoneCameraDevice: '',
          phoneMicAuto: true,
          islandNotificationsEnabled: true
        };

        const emit = (channel, value) => {
          for (const callback of listeners.get(channel) || []) callback(null, value);
        };

        const ipc = {
          on: (channel, fn) => {
            if (!listeners.has(channel)) listeners.set(channel, new Set());
            listeners.get(channel).add(fn);
          },
          removeListener: (channel, fn) => {
            listeners.get(channel)?.delete(fn);
          },
          send: (channel, arg) => requests.push({ channel, arg }),
          invoke: async (channel, arg) => {
            requests.push({ channel, arg });
            if (channel === 'get-app-settings') return settings;
            if (channel === 'update-app-settings') {
              settings = { ...settings, ...arg };
              emit('app-settings-updated', settings);
              return settings;
            }
            if (channel === 'get-hub-tab') return 'phone';
            if (channel === 'get-app-version') return '1.6.0';
            if (channel === 'android-status') {
              return { enabled: true, devices: [deviceA, deviceB], hosts: ['127.0.0.1'], port: 9120 };
            }
            if (channel === 'phone-sync-status') {
              return arg === 'b' ? syncStatusB : syncStatusA;
            }
            if (channel === 'phone-media-status') return [];
            if (channel === 'phone-camera-status') return { installed: false };
            if (channel === 'phone-mic-status') return { installed: true, ready: true, route: { active: false } };
            if (channel === 'phone-command') {
              return { success: true };
            }
            if (channel === 'phone-viewer-open') {
              return { success: true };
            }
            if (channel === 'desktop-window-state') return { maximized: false, pinned: false };
            return null;
          }
        };

        window.require = () => ({ ipcRenderer: ipc });
        window.__hubQA = {
          requests,
          getSettings: () => settings,
          getDeviceA: () => deviceA,
          getDeviceB: () => deviceB
        };
      }, { lang });

      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));

      await page.goto(origin + '/?view=hub');
      await page.getByRole('heading', {
        name: ar ? 'هاتفك، جزء من الكمبيوتر.' : 'Your phone. Part of your PC.'
      }).waitFor();

      // Check device hero information for device 'a' (Samsung A16)
      await page.getByRole('heading', { name: 'Samsung A16', exact: true }).waitFor();
      await page.getByText('Samsung Galaxy A16').waitFor();
      await page.getByText(/67%/).waitFor();
      await page.getByText(ar ? /يشحن/ : /Charging/).waitFor();
      await page.getByText('Wi-Fi',{exact:true}).waitFor();
      await page.locator('.phone-device-info').getByText('MOHIVX Island 1.6.0').waitFor();

      // Notification hint and list items
      const expectedHint = ar
        ? 'تظهر إشعارات الجوال الجديدة في الجزيرة مع إشعارات الكمبيوتر.'
        : 'New phone notifications also appear in the island with PC notifications.';
      await page.getByText(expectedHint).waitFor();
      await page.getByText('Ahmed').waitFor();
      await page.getByText('Hey there!').waitFor();

      // Switch device to Pixel (device 'b')
      const pixelBtn = page.getByRole('group', {
        name: ar ? 'الهواتف المقترنة' : 'Paired phones'
      }).getByRole('button', { name: 'Pixel', exact: true });
      await pixelBtn.click();

      // Verify that phoneSelectedDevice was updated in settings
      await page.waitForFunction(() => window.__hubQA.getSettings().phoneSelectedDevice === 'b');
      assert.equal(
        await page.evaluate(() => window.__hubQA.getSettings().phoneSelectedDevice),
        'b',
        'switching device button must update phoneSelectedDevice to b'
      );

      // Hero should now reflect Pixel
      await page.getByRole('heading', { name: 'Pixel', exact: true }).waitFor();
      await page.getByText('Google Pixel 8').waitFor();
      await page.getByText(/88%/).waitFor();
      await page.getByText('Telegram').waitFor();
      await page.getByText('Tech Group').waitFor();

      // Test capture start and viewer request on the selected phone
      // Quick actions: Start Phone screen
      const startScreenBtn = page.getByRole('button', {
        name: ar ? 'تشغيل شاشة الهاتف' : 'Start Phone screen',
        exact: true
      });
      await startScreenBtn.click();

      // Verify phone-command (capture.start) and phone-viewer-open were invoked for selected phone 'b'
      const startReq = await page.evaluate(() =>
        window.__hubQA.requests.find(r => r.channel === 'phone-command' && r.arg?.command?.type === 'capture.start')
      );
      assert.ok(startReq, 'capture.start command must be sent');
      assert.equal(startReq.arg.device, 'b', 'capture.start must use selected device b');
      assert.equal(startReq.arg.command.kind, 'screen', 'capture.start must specify screen');

      const viewerReq = await page.evaluate(() =>
        window.__hubQA.requests.find(r => r.channel === 'phone-viewer-open')
      );
      assert.ok(viewerReq, 'phone-viewer-open must be sent');
      assert.equal(viewerReq.arg.device, 'b', 'phone-viewer-open must use selected device b');
      assert.equal(viewerReq.arg.kind, 'screen', 'phone-viewer-open must open screen');

      // Save screenshot for Hub
      const hubScreenshotPath = path.resolve(__dirname, `phone-v160-hub-${lang}.png`);
      await page.screenshot({ path: hubScreenshotPath, fullPage: true });

      // Narrow 420px viewport test: check overflow acceptable
      await page.setViewportSize({ width: 420, height: 760 });
      await page.waitForTimeout(100);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 2, `hub at 420px must not have excessive overflow (found: ${overflow}px)`);

      assert.deepEqual(errors, [], `page errors occurred in Hub (${lang})`);
      await context.close();
      console.log(`Phone hub test passed: ${lang}`);
    }

    // -------------------------------------------------------------
    // PART 2: Phone Viewer (view=phone-viewer&device=a&kind=screen)
    // -------------------------------------------------------------
    // Valid 1x1 PNG fixture data URL (width:720, height:1600 simulated)
    const tinyPngDataUrl = 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1600" viewBox="0 0 720 1600"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#253c64"/><stop offset="1" stop-color="#091220"/></linearGradient></defs><rect width="720" height="1600" fill="url(#b)"/><circle cx="600" cy="450" r="380" fill="#78abef" opacity=".16"/><text x="360" y="310" fill="white" font-family="sans-serif" text-anchor="middle" font-size="100">09:41</text><text x="360" y="365" fill="#b9cfee" font-family="sans-serif" text-anchor="middle" font-size="25">Friday, 23 October</text><rect x="55" y="950" width="610" height="165" rx="35" fill="#d7e5ff" opacity=".13"/><text x="95" y="1022" fill="white" font-family="sans-serif" font-size="30">MOHIVX Island</text><text x="95" y="1070" fill="#c1d8f7" font-family="sans-serif" font-size="23">Your phone, on your desktop</text><g fill="#89b7f7"><circle cx="130" cy="1310" r="58"/><circle cx="285" cy="1310" r="58"/><circle cx="440" cy="1310" r="58"/><circle cx="595" cy="1310" r="58"/></g><rect x="240" y="1530" width="240" height="9" rx="5" fill="white" opacity=".7"/></svg>');

    for (const lang of ['en', 'ar']) {
      const ar = lang === 'ar';
      const context = await browser.newContext({ viewport: { width: 460, height: 820 } });
      await context.route('**/*', route => {
        if (route.request().url().startsWith(origin)) route.continue();
        else route.abort();
      });

      await context.addInitScript(({ lang, tinyPngDataUrl }) => {
        const listeners = new Map();
        const requests = [];
        let controlPermission = true;
        let maximized = false;
        let pinned = false;

        const frame = {
          device: 'a',
          kind: 'screen',
          sequence: 1,
          at: Date.now(),
          width: 720,
          height: 1600,
          dataUrl: tinyPngDataUrl
        };

        const emit = (channel, value) => {
          for (const callback of listeners.get(channel) || []) callback(null, value);
        };

        const ipc = {
          on: (channel, fn) => {
            if (!listeners.has(channel)) listeners.set(channel, new Set());
            listeners.get(channel).add(fn);
          },
          removeListener: (channel, fn) => {
            listeners.get(channel)?.delete(fn);
          },
          send: (channel, arg) => requests.push({ channel, arg }),
          invoke: async (channel, arg) => {
            requests.push({ channel, arg });
            if (channel === 'get-app-settings') return { appLang: lang, theme: 'original-blue' };
            if (channel === 'desktop-window-state') return { maximized, pinned };
            if (channel === 'desktop-window-action') {
              if (arg === 'maximize') maximized = !maximized;
              if (arg === 'pin') pinned = !pinned;
              emit('desktop-window-state-changed', { maximized, pinned });
              return { maximized, alwaysOnTop: pinned };
            }
            if (channel === 'phone-sync-status') {
              return {
                status: {
                  controlEnabled: controlPermission,
                  name: 'Samsung A16'
                }
              };
            }
            if (channel === 'phone-media-get') {
              return frame;
            }
            if (channel === 'phone-input') {
              return { success: true };
            }
            if (channel === 'phone-command') {
              return { success: true };
            }
            if (channel === 'phone-media-stop') {
              return { success: true };
            }
            return null;
          }
        };

        window.require = () => ({ ipcRenderer: ipc });
        window.__viewerQA = {
          requests,
          setControlPermission: allowed => {
            controlPermission = allowed;
          },
          getControlPermission: () => controlPermission
        };
        setInterval(()=>{frame.sequence++;frame.at=Date.now();emit('phone-media-updated',{...frame,dataUrl:undefined});},250);
      }, { lang, tinyPngDataUrl });

      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));

      await page.goto(origin + '/?view=phone-viewer&device=a&kind=screen');

      // Wait for the screen image to be displayed
      const liveImage = page.getByAltText(ar ? 'شاشة الهاتف المباشرة' : 'Live phone screen');
      await liveImage.waitFor();

      const canvas = page.locator('.phone-viewer-canvas');

      // Step 2a: Verify view-only sends no phone-input
      await canvas.click({ position: { x: 100, y: 100 } });
      let inputs = await page.evaluate(() =>
        window.__viewerQA.requests.filter(r => r.channel === 'phone-input')
      );
      assert.equal(inputs.length, 0, 'view-only mode must not send any phone-input');

      // Step 2b: Enable "Control phone"
      const controlBtn = page.locator('.phone-viewer-control-bar button');
      await controlBtn.waitFor();
      await controlBtn.click();
      assert.equal(
        await controlBtn.getAttribute('aria-pressed'),
        'true',
        'Control phone button should be pressed'
      );

      // Step 2c: Click image center -> normalized tap near 0.5, 0.5
      const box = await canvas.boundingBox();
      assert.ok(box, 'canvas bounding box must exist');
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      await page.mouse.click(centerX, centerY);
      await page.waitForTimeout(50);

      inputs = await page.evaluate(() =>
        window.__viewerQA.requests.filter(r => r.channel === 'phone-input')
      );
      const tapInput = inputs.find(i => i.arg?.input?.type === 'tap');
      assert.ok(tapInput, 'click in control mode must emit a tap input');
      assert.ok(
        Math.abs(tapInput.arg.input.x - 0.5) < 0.1,
        `tap X should be near 0.5 (got: ${tapInput.arg.input.x})`
      );
      assert.ok(
        Math.abs(tapInput.arg.input.y - 0.5) < 0.1,
        `tap Y should be near 0.5 (got: ${tapInput.arg.input.y})`
      );

      // Step 2d: Drag -> swipe
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      // Move significantly down/right
      await page.mouse.move(centerX, centerY + 100, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(50);

      inputs = await page.evaluate(() =>
        window.__viewerQA.requests.filter(r => r.channel === 'phone-input')
      );
      const swipeInput = inputs.find(i => i.arg?.input?.type === 'swipe');
      assert.ok(swipeInput, 'drag in control mode must emit a swipe input');
      assert.ok(
        swipeInput.arg.input.endY > swipeInput.arg.input.y,
        'swipe endY should be greater than start y for downward drag'
      );

      // Step 2e: Send text through form -> text input
      const textInput = page.getByPlaceholder(
        ar ? 'اضغط حقلًا على الهاتف، ثم اكتب هنا…' : 'Tap a text field, then type here…'
      );
      await textInput.fill('QA Hello 160');
      const sendTextBtn = page.getByRole('button', {
        name: ar ? 'إرسال النص' : 'Send text',
        exact: true
      });
      await sendTextBtn.click();
      await page.waitForTimeout(50);

      inputs = await page.evaluate(() =>
        window.__viewerQA.requests.filter(r => r.channel === 'phone-input')
      );
      const textAction = inputs.find(i => i.arg?.input?.type === 'text');
      assert.ok(textAction, 'submitting text form must emit a text input');
      assert.equal(textAction.arg.input.text, 'QA Hello 160', 'sent text matches form value');

      // Step 2f: Home / Back buttons -> key input
      const homeBtn = page.getByRole('button', {
        name: ar ? 'الرئيسية' : 'Home',
        exact: true
      });
      await homeBtn.click();
      await page.waitForTimeout(50);

      const backBtn = page.getByRole('button', {
        name: ar ? 'رجوع' : 'Back',
        exact: true
      });
      await backBtn.click();
      await page.waitForTimeout(50);

      inputs = await page.evaluate(() =>
        window.__viewerQA.requests.filter(r => r.channel === 'phone-input')
      );
      const keyHome = inputs.find(i => i.arg?.input?.type === 'key' && i.arg?.input?.key === 'home');
      const keyBack = inputs.find(i => i.arg?.input?.type === 'key' && i.arg?.input?.key === 'back');
      assert.ok(keyHome, 'clicking Home button must emit key:home');
      assert.ok(keyBack, 'clicking Back button must emit key:back');

      // Step 2g: Disable permission via exposed fixture flag -> controls disable and clicks don't send
      await page.evaluate(() => window.__viewerQA.setControlPermission(false));
      // Trigger sync status interval check or wait for auto-poll
      await page.waitForFunction(() => {
        const btn = document.querySelector('.phone-viewer-control-bar button');
        return btn && btn.getAttribute('disabled') !== null;
      });

      // Try clicking on canvas again after permission disabled
      const countBefore = (await page.evaluate(() =>
        window.__viewerQA.requests.filter(r => r.channel === 'phone-input')
      )).length;
      await page.mouse.click(centerX, centerY);
      await page.waitForTimeout(50);
      const countAfter = (await page.evaluate(() =>
        window.__viewerQA.requests.filter(r => r.channel === 'phone-input')
      )).length;
      assert.equal(
        countAfter,
        countBefore,
        'clicks must not emit phone-input when permission is disabled'
      );

      // Step 2h: Test minimize, maximize, and pin window controls
      // Maximize
      const maximizeBtn = page.getByRole('button', {
        name: ar ? 'تكبير النافذة' : 'Maximize window',
        exact: true
      });
      await maximizeBtn.click();
      await page.waitForTimeout(50);

      // Pin (Keep on top)
      const pinBtn = page.getByRole('button', {
        name: ar ? 'البقاء في المقدمة' : 'Keep on top',
        exact: true
      });
      await pinBtn.click();
      await page.waitForTimeout(50);
      assert.equal(await pinBtn.getAttribute('aria-pressed'), 'true', 'pin button should be pressed');

      // Minimize
      const minimizeBtn = page.getByRole('button', {
        name: ar ? 'تصغير النافذة' : 'Minimize window',
        exact: true
      });
      await minimizeBtn.click();
      await page.waitForTimeout(50);

      const winActions = await page.evaluate(() =>
        window.__viewerQA.requests.filter(r => r.channel === 'desktop-window-action')
      );
      assert.ok(winActions.some(r => r.arg === 'maximize'), 'maximize action must be sent');
      assert.ok(winActions.some(r => r.arg === 'pin'), 'pin action must be sent');
      assert.ok(winActions.some(r => r.arg === 'minimize'), 'minimize action must be sent');

      // Save screenshot for Viewer
      const viewerScreenshotPath = path.resolve(__dirname, `phone-v160-viewer-${lang}.png`);
      await page.screenshot({ path: viewerScreenshotPath, fullPage: true });

      // Narrow 420px viewport test for viewer
      await page.setViewportSize({ width: 420, height: 760 });
      await page.waitForTimeout(50);
      const vOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(vOverflow <= 2, `viewer at 420px must not overflow viewport (found: ${vOverflow}px)`);

      assert.deepEqual(errors, [], `page errors occurred in Viewer (${lang})`);
      await context.close();
      console.log(`Phone viewer test passed: ${lang}`);
    }

    console.log('All QA tests completed successfully.');
  } finally {
    await browser.close();
  }
})()
  .catch(error => {
    console.error('Test failed:', error);
    process.exitCode = 1;
  })
  .finally(() => server.close());
