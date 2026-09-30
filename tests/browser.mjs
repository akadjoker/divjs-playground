// Browser checks of the site, run with `npm run test:browser` (needs
// Playwright's Chromium: `npx playwright install chromium` on a fresh
// machine). The engine's own test suite lives in the DivJS library.
//
// 1. Every demo and example page loads without errors and draws.
// 2. The playground: every program runs, errors are located, edits
//    persist, share links round-trip, run/stop stays clean, keys typed in
//    the editor don't reach the game, project files, export.
// 3. Online play (two tabs, hidden tabs, WebRTC) and sound.
// 4. DivJS Blocks: the block editor and its lessons.
//
// A small static server over the repository root is started on a free
// port, so nothing else needs to be running.

import http from 'node:http';
import { readFile, readdir, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.div': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.fpg': 'application/octet-stream',
  '.fnt': 'application/octet-stream',
  '.map': 'application/octet-stream'
};

function startServer()
{
  const server = http.createServer(async (req, res) =>
  {
    try
    {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = normalize(join(ROOT, urlPath));
      if (!file.startsWith(ROOT))
      {
        res.writeHead(403).end();
        return;
      }
      if ((await stat(file)).isDirectory())
      {
        file = join(file, 'index.html');
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    }
    catch
    {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) =>
  {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const results = [];

async function check(name, fn)
{
  const started = Date.now();
  try
  {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name} (${Date.now() - started} ms)`);
  }
  catch (err)
  {
    results.push({ name, ok: false, error: err.message });
    console.log(`FAIL  ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
  }
}

function assert(condition, message)
{
  if (!condition)
  {
    throw new Error(message);
  }
}

// Collect page errors, console errors and failed requests.
function watch(page)
{
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) =>
  {
    if (m.type() === 'error')
    {
      problems.push(`console error: ${m.text()}`);
    }
  });
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
  page.on('response', (r) =>
  {
    if (r.status() >= 400)
    {
      problems.push(`HTTP ${r.status()}: ${r.url()}`);
    }
  });
  return problems;
}

// Number of distinct colours in a sample of the canvas (1 = blank).
async function canvasColours(page, selector = 'canvas')
{
  return page.$eval(selector, (canvas) =>
  {
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 97)
    {
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return seen.size;
  });
}

async function listPages(dir)
{
  const names = await readdir(join(ROOT, dir));
  return names.filter((n) => n.endsWith('.html')).map((n) => `${dir}/${n}`);
}

const server = await startServer();
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

try
{
  // ── 2. Demo and example pages ─────────────────────────────────────────
  const pages = [...await listPages('demos'), ...await listPages('examples'), 'tests/simples.html', 'ide/index.html'];
  for (const path of pages)
  {
    await check(`page ${path}`, async () =>
    {
      const page = await browser.newPage();
      const problems = watch(page);
      await page.goto(`${BASE}/${path}`);
      await page.waitForTimeout(1500);
      const colours = await canvasColours(page);
      await page.close();
      assert(problems.length === 0, problems.join('\n'));
      assert(colours > 1, 'the canvas is blank');
    });
  }

  await check('site root opens the playground', async () =>
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`);
    await page.waitForURL('**/playground/**', { timeout: 10000 });
    await page.close();
  });

  // ── 3. Playground ─────────────────────────────────────────────────────
  const manifest = JSON.parse(await readFile(join(ROOT, 'playground/programs/manifest.json'), 'utf8'));

  const openPlayground = async (hash, context = null) =>
  {
    const page = await (context || browser).newPage({ viewport: { width: 1400, height: 850 } });
    const problems = watch(page);
    await page.goto(`${BASE}/playground/${hash}`);
    await page.waitForFunction(() => window.divPlayground && window.divPlayground.getState() !== null, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    return { page, problems };
  };

  for (const program of manifest.programs)
  {
    await check(`playground runs ${program.id}`, async () =>
    {
      const { page, problems } = await openPlayground(`#p=${program.id}`);
      await page.waitForTimeout(1500);
      const state = await page.evaluate(() =>
      {
        const s = window.divPlayground.getState();
        return { running: s.running, halted: s.vm?.halted, status: document.getElementById('status').textContent };
      });
      const size = await page.$eval('#game', (c) => [c.width, c.height]);
      const colours = await canvasColours(page, '#game');
      await page.close();
      assert(problems.length === 0, problems.join('\n'));
      assert(state.running || state.halted, `not running: status "${state.status}"`);
      assert(colours > 1, 'the canvas is blank');
      assert(size[0] === program.width && size[1] === program.height,
        `canvas ${size.join('x')}, manifest says ${program.width}x${program.height}`);
    });
  }

  await check('playground: a compile error is marked at its line', async () =>
  {
    const { page, problems } = await openPlayground('#p=tutor2');
    await page.locator('.cm-line').nth(4).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' zz = unknown_var;');
    await page.keyboard.press('Control+Enter');
    // Checked before the editor's own live check (500 ms after typing) can
    // mark the error, so this is the mark Run itself puts there.
    await page.waitForTimeout(150);
    const marks = await page.locator('.cm-lintRange-error').count();
    const status = await page.textContent('#status');
    const consoleText = await page.textContent('#console');
    await page.click('#console a');
    const caretWord = await page.evaluate(() => window.getSelection().anchorNode?.textContent);
    await page.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(status === 'Compile error', `status "${status}"`);
    assert(/Unknown variable: unknown_var \(line 5, column \d+\)/.test(consoleText), `console: ${consoleText}`);
    assert(marks === 1, `${marks} error marks in the editor`);
    assert(caretWord === 'unknown_var', `the link should put the caret on the error, got "${caretWord}"`);
  });

  await check('playground: edits persist across reloads and Reset restores', async () =>
  {
    const context = await browser.newContext();
    const { page } = await openPlayground('#p=tutor3', context);
    await page.locator('.cm-line').first().click();
    await page.keyboard.press('Home');
    await page.keyboard.type('// my edit\n');
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => window.divPlayground?.getState() !== null);
    await page.waitForTimeout(300);
    const afterReload = await page.locator('.cm-content').innerText();
    const editedMark = await page.locator('button[data-id="tutor3"] .edited').isVisible();
    page.once('dialog', (d) => d.accept());
    await page.click('#resetBtn');
    await page.waitForTimeout(300);
    const afterReset = await page.locator('.cm-content').innerText();
    const stored = await page.evaluate(() => window.localStorage.getItem('divjs.playground.source.tutor3'));
    await context.close();
    assert(afterReload.startsWith('// my edit'), 'the edit was not restored after a reload');
    assert(editedMark, 'the program should be marked edited');
    assert(!afterReset.includes('// my edit'), 'Reset should restore the original');
    assert(stored === null, 'Reset should forget the saved edit');
  });

  await check('playground: a share link reproduces the code', async () =>
  {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const { page } = await openPlayground('#p=tutor2', context);
    await page.locator('.cm-line').first().click();
    await page.keyboard.press('Home');
    await page.keyboard.type('// shared ÿ é\n');
    await page.click('#shareBtn');
    await page.waitForTimeout(300);
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const original = await page.locator('.cm-content').innerText();
    await context.close();
    const fresh = await browser.newContext();
    const { page: other, problems } = await openPlayground(link.slice(link.indexOf('#')), fresh);
    const opened = await other.locator('.cm-content').innerText();
    const stored = await other.evaluate(() => window.localStorage.getItem('divjs.playground.source.tutor2'));
    await fresh.close();
    assert(link.includes('#p=tutor2&code='), `unexpected link ${link}`);
    assert(opened === original, 'the shared code differs from the original');
    assert(stored === null, 'opening a link must not save it before the code is changed');
    assert(problems.length === 0, problems.join('\n'));
  });

  await check('playground: repeated run/stop keeps one loop and one set of listeners', async () =>
  {
    const { page, problems } = await openPlayground('#p=tutor4');
    for (let i = 0; i < 10; i++)
    {
      await page.click('#stopBtn', { force: true });
      await page.click('#runBtn');
    }
    await page.waitForTimeout(500);
    const ticks = await page.evaluate(async () =>
    {
      const vm = window.divPlayground.getState().vm;
      let n = 0;
      const tick = vm.tick.bind(vm);
      vm.tick = () => { n += 1; return tick(); };
      await new Promise((r) => setTimeout(r, 1000));
      return n;
    });
    const client = await page.context().newCDPSession(page);
    const { result } = await client.send('Runtime.evaluate', { expression: 'document.getElementById("game")' });
    const { listeners } = await client.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    const moves = listeners.filter((l) => l.type === 'pointermove').length;
    await page.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(ticks <= 75, `${ticks} VM ticks in one second - more than one loop is running`);
    assert(ticks >= 20, `${ticks} VM ticks in one second - the program is not running`);
    assert(moves === 1, `${moves} pointermove listeners on the canvas`);
  });

  await check('playground: game speed does not depend on the display rate', async () =>
  {
    // A 144 Hz display: requestAnimationFrame every ~7 ms. A program
    // without set_fps must still run at DIV's 18 fps, and set_fps(60) at
    // 60 - it used to tick once per display frame.
    const context = await browser.newContext();
    await context.addInitScript(() =>
    {
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 1000 / 144);
      window.cancelAnimationFrame = (id) => clearTimeout(id);
    });
    const rates = {};
    for (const id of ['tutor3', 'breakout'])
    {
      const { page } = await openPlayground(`#p=${id}`, context);
      await page.waitForTimeout(500);
      rates[id] = await page.evaluate(async () =>
      {
        const vm = window.divPlayground.getState().vm;
        let n = 0;
        const tick = vm.tick.bind(vm);
        vm.tick = () => { n += 1; return tick(); };
        await new Promise((r) => setTimeout(r, 2000));
        return n / 2;
      });
      await page.close();
    }
    await context.close();
    assert(rates.tutor3 >= 15 && rates.tutor3 <= 20, `tutor3 (no set_fps) ran at ${rates.tutor3} ticks/s, expected ~18`);
    assert(rates.breakout >= 52 && rates.breakout <= 64, `breakout (set_fps 60) ran at ${rates.breakout} ticks/s, expected ~60`);
  });

  await check('playground: keys typed in the editor do not reach the game', async () =>
  {
    const { page } = await openPlayground('#p=scroll');
    await page.locator('.cm-line').nth(2).click();
    await page.keyboard.down('ArrowRight');
    const inEditor = await page.evaluate(() => window.divPlayground.getState().runtime.keys.arrowright || false);
    await page.keyboard.up('ArrowRight');
    await page.click('#game');
    await page.keyboard.down('ArrowRight');
    const inGame = await page.evaluate(() => window.divPlayground.getState().runtime.keys.arrowright || false);
    await page.keyboard.up('ArrowRight');
    await page.close();
    assert(!inEditor, 'a key pressed in the editor reached the game');
    assert(inGame === true, 'a key pressed on the game did not reach it');
  });

  await check('playground: new program and switching screen sizes', async () =>
  {
    const context = await browser.newContext();
    const { page, problems } = await openPlayground('#p=tutor3', context);
    const small = await page.$eval('#game', (c) => [c.width, c.height]);
    await page.click('button[data-id="breakout"]');
    await page.waitForTimeout(800);
    const breakout = await page.$eval('#game', (c) => [c.width, c.height]);
    await page.click('#newBtn');
    await page.waitForTimeout(800);
    const title = await page.textContent('#programTitle');
    const running = await page.evaluate(() => window.divPlayground.getState().running);
    await page.locator('.cm-line').first().click();
    await page.keyboard.type('// mine\n');
    await page.waitForTimeout(700);
    const yours = await page.locator('.program-list h3', { hasText: 'Yours' }).count();
    await context.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(small.join('x') === '320x200', `tutor3 canvas ${small.join('x')}`);
    assert(breakout.join('x') === '480x520', `breakout canvas ${breakout.join('x')}`);
    assert(title === 'New program' && running, 'the new program should open and run');
    assert(yours === 1, 'an edited new program should be listed under "Yours"');
  });

  // Full screen: the game panel alone on the screen, scaled up, with the
  // keyboard still going to the game.
  await check('playground: full screen shows the game scaled up', async () =>
  {
    const { page, problems } = await openPlayground('#p=tutor3');
    const before = await page.$eval('#game', (c) => c.getBoundingClientRect().width);
    await page.click('#fullscreenBtn');
    await page.waitForTimeout(500);
    const inside = await page.evaluate(() => ({
      element: document.fullscreenElement?.id || (document.getElementById('screen').classList.contains('screen-max') ? 'screen-max' : null),
      width: document.getElementById('game').getBoundingClientRect().width,
      height: document.getElementById('game').getBoundingClientRect().height,
      focused: document.activeElement?.id,
      viewport: [window.innerWidth, window.innerHeight]
    }));
    await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : null));
    await page.waitForTimeout(400);
    const label = await page.textContent('#fullscreenBtn');
    const after = await page.$eval('#game', (c) => c.getBoundingClientRect().width);
    await page.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(inside.element === 'screen' || inside.element === 'screen-max', `the game panel should be full screen, got ${inside.element}`);
    assert(inside.width > before * 1.2, `the game should be scaled up in full screen (${before} -> ${inside.width} px)`);
    assert(Math.abs(inside.width / inside.height - 320 / 200) < 0.02, `the aspect ratio should be kept (${inside.width}x${inside.height})`);
    assert(inside.focused === 'game', `the canvas should keep the keyboard focus, focus is on ${inside.focused}`);
    assert(label.includes('Full screen') && Math.abs(after - before) < 2, `leaving should restore the button and the size (${label}, ${after} px)`);
  });

  // The Files tab: a program's own FPG/FNT (uploaded here), kept across
  // reloads, carried by a share link when small, and packed by Export.
  await check('playground: project files - upload, keep, share, export', async () =>
  {
    // 614 KB, 165 KB deflated: over the share-link limit (100 KB).
    const fpg = await readFile(join(ROOT, 'assets/div-support/tutor1.fpg'));
    const fnt = await readFile(join(ROOT, 'assets/div-support/tutor1.fnt'));
    const program = [
      'PROGRAM files_test;',
      'GLOBAL lib; fnt;',
      'BEGIN',
      '  set_mode(320, 200);',
      '  lib = load_fpg("SHIP.FPG");      // uploaded as Ship.fpg',
      '  fnt = load_fnt("gfx\\font.fnt"); // uploaded as font.fnt',
      '  LOOP FRAME; END',
      'END',
      ''
    ].join('\n');
    const loaded = (page) => page.evaluate(() =>
    {
      const s = window.divPlayground.getState();
      return {
        files: window.divPlayground.getFiles().map((f) => f.name),
        fpg: [...s.runtime.graphLibraries.values()].map((l) => l.graphs.size),
        fnt: [...s.runtime.bitmapFonts.values()].some((f) => f.loaded)
      };
    });
    const dir = await mkdtemp(join(tmpdir(), 'divjs-export-'));
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    try
    {
      const { page, problems } = await openPlayground('#p=new', context);
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+A');
      await page.keyboard.insertText(program);
      await page.setInputFiles('#fileInput', [
        { name: 'Ship.fpg', mimeType: 'application/octet-stream', buffer: fpg },
        { name: 'font.fnt', mimeType: 'application/octet-stream', buffer: fnt }
      ]);
      await page.waitForTimeout(1500);
      const first = await loaded(page);
      await page.click('#filesTab');
      await page.waitForTimeout(300);
      const listing = await page.locator('#fileList').innerText();

      await page.reload();
      await page.waitForFunction(() => window.divPlayground?.getState() !== null, null, { timeout: 15000 });
      await page.waitForTimeout(1500);
      const afterReload = await loaded(page);

      // Export: one .html, opened from disk with the network blocked.
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
      const exported = join(dir, download.suggestedFilename());
      await download.saveAs(exported);
      const offline = await context.newPage();
      const offlineProblems = watch(offline);
      const network = [];
      await offline.route('**/*', (route) =>
      {
        const url = route.request().url();
        if (/^(file|blob|data):/.test(url))
        {
          return route.continue();
        }
        network.push(url);
        return route.abort();
      });
      await offline.goto(`file://${exported}`);
      await offline.waitForTimeout(1500);
      const packed = await offline.evaluate(() =>
      {
        const s = window.divGame.getState();
        return {
          fpg: [...s.runtime.graphLibraries.values()].map((l) => l.graphs.size),
          fnt: [...s.runtime.bitmapFonts.values()].some((f) => f.loaded)
        };
      });

      // Share: the FPG is too big for a link, so the link has the code only...
      await page.click('#shareBtn');
      await page.waitForTimeout(500);
      const bigLink = await page.evaluate(() => navigator.clipboard.readText());
      const consoleText = await page.locator('#console').innerText();
      // ...without it, the font fits and travels in the link. (From here the
      // program's load_fpg("SHIP.FPG") has no project file and goes to the
      // server, which has none: those 404s are expected.)
      const beforeRemove = problems.length;
      await page.click('#filesTab');
      await page.locator('#fileList li', { hasText: 'Ship.fpg' }).getByRole('button', { name: 'Remove' }).click();
      await page.waitForTimeout(500);
      await page.click('#shareBtn');
      await page.waitForTimeout(500);
      const smallLink = await page.evaluate(() => navigator.clipboard.readText());
      const fresh = await browser.newContext();
      const { page: other, problems: otherProblems } = await openPlayground(smallLink.slice(smallLink.indexOf('#')), fresh);
      await other.waitForTimeout(1500);
      const shared = await loaded(other);
      await fresh.close();

      const expected404 = (line) => /SHIP\.FPG|status of 404/.test(line);
      const unexpected = [
        ...problems.slice(0, beforeRemove),
        ...problems.slice(beforeRemove).filter((line) => !expected404(line)),
        ...offlineProblems,
        ...otherProblems.filter((line) => !expected404(line))
      ];
      assert(unexpected.length === 0, unexpected.join('\n'));
      assert(JSON.stringify(first.files) === '["font.fnt","Ship.fpg"]', `uploaded files ${JSON.stringify(first.files)}`);
      assert(first.fpg[0] > 0 && first.fnt, `the uploaded files should load: ${JSON.stringify(first)}`);
      assert(/FPG, \d+ graphics/.test(listing) && /FNT, \d+ characters/.test(listing), `files listing: ${listing}`);
      assert(afterReload.files.length === 2 && afterReload.fpg[0] > 0 && afterReload.fnt, `after reload: ${JSON.stringify(afterReload)}`);
      assert(download.suggestedFilename() === 'my-game.html', `export name ${download.suggestedFilename()}`);
      assert(network.length === 0, `the exported page asked the network for: ${network.join(', ')}`);
      assert(packed.fpg[0] > 0 && packed.fnt, `exported game: ${JSON.stringify(packed)}`);
      assert(!bigLink.includes('&files=') && consoleText.includes('too big for a link'), 'a link must not carry files over the limit, and say so');
      assert(smallLink.includes('&files='), 'a small file should travel in the link');
      assert(JSON.stringify(shared.files) === '["font.fnt"]' && shared.fnt, `opened link: ${JSON.stringify(shared)}`);
    }
    finally
    {
      await context.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  // Online play between two tabs (BroadcastChannel): host with 3, join
  // with 4, each tab drives its own tank with its own keyboard, and both
  // simulations stay identical (the same hash of every process and global)
  // with no desync reported.
  await check('online: two tabs play Net Tanks in lockstep and stay identical', async () =>
  {
    const context = await browser.newContext();
    try
    {
      const { page: a, problems: pa } = await openPlayground('#p=net-tanks', context);
      const { page: b, problems: pb } = await openPlayground('#p=net-tanks', context);
      const info = (page) => page.evaluate(async () =>
      {
        const { hashState } = await import('/engine/divjs.js');
        const s = window.divPlayground.getState();
        const n = s.runtime.net;
        const tanks = s.vm.processManager.getAll().filter((p) => String(p.name).toLowerCase() === 'tank' && !p.dead)
          .sort((p, q) => p.id - q.id).map((p) => [Math.round(p.x), Math.round(p.y), p.angle]);
        return { status: n.status, me: n.me, running: n.running, frame: n.lock.frame, hash: hashState(s.vm), tanks };
      });
      await a.click('#game');
      await a.keyboard.press('3');
      await b.click('#game');
      await b.keyboard.press('4');
      await a.waitForFunction(() => window.divPlayground.getState().runtime.net.running, null, { timeout: 5000 });
      await b.waitForFunction(() => window.divPlayground.getState().runtime.net.running, null, { timeout: 5000 });
      const start = await info(a);
      // Blue (host) drives forward, red (guest) turns; no shots.
      await a.keyboard.down('ArrowUp');
      await b.keyboard.down('ArrowLeft');
      await a.waitForTimeout(400);
      await a.keyboard.up('ArrowUp');
      await b.keyboard.up('ArrowLeft');
      // Past the next state comparison (every 60 frames) with nobody moving.
      await a.waitForTimeout(1800);
      const ia = await info(a);
      const ib = await info(b);
      await context.close();
      assert(pa.length === 0 && pb.length === 0, [...pa, ...pb].join('\n'));
      assert(ia.me === 0 && ib.me === 1, `players ${ia.me}/${ib.me}`);
      assert(ia.status === 2 && ib.status === 2, `both sides should stay connected and in step: status ${ia.status}/${ib.status}`);
      assert(ia.frame > 90 && Math.abs(ia.frame - ib.frame) <= 3, `lockstep frames ${ia.frame}/${ib.frame}`);
      assert(ia.hash === ib.hash, `the two games should be identical: ${JSON.stringify(ia.tanks)} vs ${JSON.stringify(ib.tanks)}`);
      assert(ia.tanks[0][0] > start.tanks[0][0] + 20, `blue should have driven right: ${start.tanks[0]} -> ${ia.tanks[0]}`);
      assert(ia.tanks[1][2] !== start.tanks[1][2], `red should have turned: ${start.tanks[1]} -> ${ia.tanks[1]}`);
    }
    finally
    {
      await context.close().catch(() => {});
    }
  });

  // A hidden tab gets no animation frames (browsers pause
  // requestAnimationFrame in background tabs). In lockstep the other side
  // would then wait for its input for ever: the hidden side must keep
  // stepping its game on its own timer.
  await check('online: the game keeps going when the other tab is hidden', async () =>
  {
    const context = await browser.newContext();
    try
    {
      const { page: a, problems: pa } = await openPlayground('#p=net-tanks', context);
      const { page: b, problems: pb } = await openPlayground('#p=net-tanks', context);
      await a.click('#game');
      await a.keyboard.press('3');
      await b.click('#game');
      await b.keyboard.press('4');
      for (const page of [a, b])
      {
        await page.waitForFunction(() => window.divPlayground.getState().runtime.net.running, null, { timeout: 5000 });
      }
      // B goes to the background: no more animation frames, hidden.
      await b.evaluate(() =>
      {
        window.requestAnimationFrame = () => 0;
        Object.defineProperty(document, 'hidden', { get: () => true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await a.waitForTimeout(300);
      const frame = (page) => page.evaluate(() => window.divPlayground.getState().runtime.net.lock.frame);
      const [a0, b0] = [await frame(a), await frame(b)];
      await a.waitForTimeout(1500);
      const [a1, b1] = [await frame(a), await frame(b)];
      const status = [await a.evaluate(() => window.divPlayground.getState().runtime.net.status),
        await b.evaluate(() => window.divPlayground.getState().runtime.net.status)];
      await context.close();
      assert(pa.length === 0 && pb.length === 0, [...pa, ...pb].join('\n'));
      assert(status[0] === 2 && status[1] === 2, `both sides should stay connected and in step (status ${status})`);
      assert(b1 - b0 > 45, `the hidden side should keep stepping: ${b1 - b0} frames in 1.5 s`);
      assert(a1 - a0 > 45, `the visible side should not wait for the hidden one: ${a1 - a0} frames in 1.5 s`);
    }
    finally
    {
      await context.close().catch(() => {});
    }
  });

  // The usual way to try two tabs: host in tab A, then switch to tab B and
  // join - so the host's tab is already hidden while the guest connects,
  // and it is the host that has to start the game.
  await check('online: a host whose tab is hidden before the guest joins still starts the game', async () =>
  {
    const context = await browser.newContext();
    try
    {
      const { page: a, problems: pa } = await openPlayground('#p=net-tanks', context);
      const { page: b, problems: pb } = await openPlayground('#p=net-tanks', context);
      await a.click('#game');
      await a.keyboard.press('3');
      await a.waitForTimeout(300);
      await a.evaluate(() =>
      {
        window.requestAnimationFrame = () => 0;
        Object.defineProperty(document, 'hidden', { get: () => true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await a.waitForTimeout(500);
      await b.click('#game');
      await b.keyboard.press('4');
      let started = true;
      try
      {
        await b.waitForFunction(() => window.divPlayground.getState().runtime.net.running, null, { timeout: 4000 });
      }
      catch
      {
        started = false;
      }
      const frames = started ? await b.evaluate(async () =>
      {
        const net = window.divPlayground.getState().runtime.net;
        const f0 = net.lock.frame;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return net.lock.frame - f0;
      }) : 0;
      await context.close();
      assert(pa.length === 0 && pb.length === 0, [...pa, ...pb].join('\n'));
      assert(started, 'the guest should get into the game although the host tab is hidden');
      assert(frames > 30, `the game should run once started: ${frames} frames in 1 s`);
    }
    finally
    {
      await context.close().catch(() => {});
    }
  });

  // Online play over WebRTC, as two players would: the host chooses
  // "host", copies the invitation link (this code + the invitation) and
  // the guest opens it and chooses "join": the invitation is filled in and
  // the answer made. The host pastes the answer; both connect and start.
  await check('online: WebRTC connection through an invitation link and an answer code', async () =>
  {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    try
    {
      const { page: a, problems: pa } = await openPlayground('#p=net-tanks', context);
      await a.click('#game');
      await a.keyboard.press('1');
      await a.waitForSelector('[data-net-copy-link]', { timeout: 15000 });
      await a.click('[data-net-copy-link]');
      await a.waitForFunction(() => document.querySelector('[data-net-code]').value.startsWith('http'));
      const link = await a.$eval('[data-net-code]', (e) => e.value);
      assert(/#p=net-tanks&code=[^&]+&net=DIVNET1\.[A-Za-z0-9_-]+$/.test(link), `invitation link: ${link.slice(0, 120)}`);

      const { page: b, problems: pb } = await openPlayground(link.slice(link.indexOf('#')), context);
      assert(!(await b.evaluate(() => window.location.hash)).includes('net='), 'the invitation should leave the address once used');
      await b.click('#game');
      await b.keyboard.press('2');
      await b.waitForFunction(() => document.querySelector('[data-net-code]')?.value.startsWith('DIVNET1.'), null, { timeout: 15000 });
      const answer = await b.$eval('[data-net-code]', (e) => e.value);

      await a.fill('[data-net-answer]', answer);
      await a.click('[data-net-connect]');
      for (const page of [a, b])
      {
        await page.waitForFunction(() => window.divPlayground.getState().runtime.net.running, null, { timeout: 15000 });
      }
      const panels = (await a.$$('[data-divjs-net]')).length + (await b.$$('[data-divjs-net]')).length;
      await a.keyboard.down('ArrowUp');
      await a.waitForTimeout(300);
      await a.keyboard.up('ArrowUp');
      await a.waitForTimeout(1500);
      const state = (page) => page.evaluate(async () =>
      {
        const { hashState } = await import('/engine/divjs.js');
        const s = window.divPlayground.getState();
        return { status: s.runtime.net.status, me: s.runtime.net.me, hash: hashState(s.vm) };
      });
      const sa = await state(a);
      const sb = await state(b);
      assert(pa.length === 0 && pb.length === 0, [...pa, ...pb].join('\n'));
      assert(panels === 0, 'the connection panels should close once connected');
      assert(sa.me === 0 && sb.me === 1 && sa.status === 2 && sb.status === 2, `after connecting: ${JSON.stringify([sa, sb])}`);
      assert(sa.hash === sb.hash, 'the two games should be identical');
    }
    finally
    {
      await context.close();
    }
  });

  // Sound in a browser that, like a normal one, only allows it after a
  // gesture: nothing plays and the song waits until the first key press,
  // then the music runs and the effect for the key plays.
  await check('sound: silent until the first key, then music and effects', async () =>
  {
    const locked = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
    try
    {
      const page = await locked.newPage({ viewport: { width: 1400, height: 850 } });
      const problems = watch(page);
      await page.goto(`${BASE}/playground/#p=sound-lab`);
      await page.waitForFunction(() => window.divPlayground?.getState()?.runtime);
      await page.waitForTimeout(600);
      const stats = () => page.evaluate(() =>
      {
        const a = window.divPlayground.getState().runtime.audio;
        return { running: a.running, played: a.stats.played, notes: a.stats.notes, song: a.songPlaying };
      });
      const before = await stats();
      await page.click('#game');
      await page.keyboard.press('3');
      await page.waitForTimeout(600);
      const after = await stats();
      assert(problems.length === 0, problems.join('\n'));
      assert(!before.running && before.played === 0 && before.notes === 0 && before.song > 0,
        `before a gesture nothing should play and the song should wait: ${JSON.stringify(before)}`);
      assert(after.running && after.played >= 1 && after.notes > 4, `after a key the music and the effect should play: ${JSON.stringify(after)}`);
    }
    finally
    {
      await locked.close();
    }
  });

  // Touch: on a phone, real touches (not mouse events) play a mouse game.
  // Chicken Cannon starts with a tap, aims while a finger is held and
  // dragged, and fires the chicken when the finger lifts.
  await check('touch: tap to start, hold and drag to aim, lift to fire (Chicken Cannon)', async () =>
  {
    const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 900, height: 700 } });
    try
    {
      const page = await context.newPage();
      const problems = watch(page);
      await page.goto(`${BASE}/playground/#p=chicken-cannon`);
      await page.waitForFunction(() => window.divPlayground?.getState()?.vm);
      await page.waitForTimeout(1200);
      const read = () => page.evaluate(() =>
      {
        const s = window.divPlayground.getState();
        const g = (n) => Number(s.vm.globals.get(s.bytecode.globals[n]));
        return { state: g('state'), phase: g('phase'), ang: g('aim_ang'), pow: g('aim_pow'), shots: g('shots'), left: s.runtime._mouse.buttons[0] };
      });
      // The page finishes laying out after the game starts (the canvas
      // moves as panels above it fill in): wait until it holds still, and
      // aim each touch from where the canvas is at that moment.
      await page.locator('#game').scrollIntoViewIfNeeded();
      let last = '';
      for (let i = 0; i < 40; i++)
      {
        const now = JSON.stringify(await page.locator('#game').boundingBox());
        if (now === last)
        {
          break;
        }
        last = now;
        await page.waitForTimeout(100);
      }
      let box = await page.locator('#game').boundingBox();
      const at = (x, y) => ({ x: box.x + x * box.width / 800, y: box.y + y * box.height / 480 });
      const cdp = await context.newCDPSession(page);
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await touch('touchStart', [at(400, 200)]);
      await page.waitForTimeout(100);
      await touch('touchEnd', []);
      await page.waitForTimeout(1500);
      const started = await read();
      box = await page.locator('#game').boundingBox();
      assert(started.state === 2, `a tap should start the game: ${JSON.stringify(started)}`);
      await touch('touchStart', [at(400, 300)]);
      await page.waitForTimeout(150);
      for (let i = 1; i <= 8; i++)
      {
        await touch('touchMove', [at(400 - i * 9, 300 - i * 14)]);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(300);
      const held = await read();
      assert(held.left && held.phase === 0 && (held.ang !== started.ang || held.pow !== started.pow),
        `a held, dragged finger should aim: ${JSON.stringify(held)} (start ${JSON.stringify(started)})`);
      await touch('touchEnd', []);
      await page.waitForTimeout(500);
      const fired = await read();
      assert(!fired.left && fired.phase === 1 && fired.shots === 1, `lifting the finger should fire: ${JSON.stringify(fired)}`);
      assert(problems.length === 0, problems.join('\n'));
    }
    finally
    {
      await context.close();
    }
  });

  // On-screen controls on a phone, with real touches (several fingers at
  // once) in a Pixel 7, upright and sideways: they appear with the first
  // touch, press the game's keys (manifest "touch"), and stay off the game.
  // A mouse game (Chicken Cannon) gets none and is still played by
  // dragging.
  const openOnPhone = async (id, landscape) =>
  {
    const context = await browser.newContext({ ...devices[landscape ? 'Pixel 7 landscape' : 'Pixel 7'] });
    const page = await context.newPage();
    const problems = watch(page);
    await page.goto(`${BASE}/playground/#p=${id}`);
    await page.waitForFunction(() => window.divPlayground?.getState()?.vm);
    await page.waitForTimeout(800);
    const cdp = await context.newCDPSession(page);
    const points = new Map();
    const phone = {
      context,
      page,
      problems,
      // CDP: touchStart lists every finger down; touchEnd the ones lifting.
      down: async (finger, at) =>
      {
        points.set(finger, at);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...points].map(([i, p]) => ({ id: i, x: p.x, y: p.y })) });
      },
      move: async (finger, at) =>
      {
        points.set(finger, at);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...points].map(([i, p]) => ({ id: i, x: p.x, y: p.y })) });
      },
      up: async (finger) =>
      {
        const p = points.get(finger);
        points.delete(finger);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id: finger, x: p.x, y: p.y }] });
      },
      tap: async (at, ms = 120) =>
      {
        await phone.down(99, at);
        await page.waitForTimeout(ms);
        await phone.up(99);
      },
      centre: (selector) => page.evaluate((s) =>
      {
        const node = document.querySelector(s);
        if (!node)
        {
          return null;
        }
        const r = node.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width / 2 };
      }, selector),
      // A global of the running program; arrays by index (their slots come
      // from compiling the same source again).
      g: (name, index = 0) => page.evaluate(async ([n, k]) =>
      {
        const s = window.divPlayground.getState();
        if (window.touchTestSlotsFor !== s.source)
        {
          const { Lexer, Parser, Compiler } = await import('/engine/divjs.js');
          const compiler = new Compiler();
          compiler.compile(new Parser(new Lexer(s.source).tokenize()).parse());
          window.touchTestSlots = compiler.globalMap;
          window.touchTestSlotsFor = s.source;
        }
        const slot = window.touchTestSlots.get(n);
        return Number(s.vm.globals.get(typeof slot === 'number' ? slot : slot.base + k) ?? 0);
      }, [name, index]),
      layout: () => page.evaluate(() =>
      {
        const box = (n) =>
        {
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
        };
        const root = document.querySelector('[data-divjs-touch]');
        return {
          scrollY: window.scrollY,
          scrollWidth: document.documentElement.scrollWidth,
          game: box(document.getElementById('game')),
          shown: !!root && root.style.display !== 'none',
          controls: [...document.querySelectorAll('[data-touch-pad], [data-touch-key]')].map(box)
        };
      })
    };
    // The first touch, on the game, brings the controls up.
    const game = await page.locator('#game').boundingBox();
    await phone.tap({ x: game.x + game.width / 2, y: game.y + 8 }, 40);
    await page.waitForTimeout(300);
    return phone;
  };

  // The game at the top of the page, nothing sideways, the controls on and
  // (upright, where there is room under the game) not over it.
  const checkPhoneLayout = async (phone, landscape, name) =>
  {
    const l = await phone.layout();
    assert(l.scrollY === 0 && l.game.y < 1, `${name}: the game should be at the top of the page: ${JSON.stringify(l.game)} scrollY ${l.scrollY}`);
    assert(l.scrollWidth <= Math.ceil(phone.page.viewportSize().width), `${name}: the page is ${l.scrollWidth} px wide`);
    assert(l.shown && l.controls.length > 0, `${name}: the touch controls should be on after a touch`);
    for (const c of l.controls)
    {
      assert(c.w >= 44 && c.x >= 0 && c.right <= phone.page.viewportSize().width && c.bottom <= phone.page.viewportSize().height,
        `${name}: a control is too small or off screen: ${JSON.stringify(c)}`);
      if (!landscape)
      {
        assert(c.y >= l.game.bottom - 1, `${name}: upright, a control covers the game: ${JSON.stringify(c)} (game ends at ${l.game.bottom})`);
      }
    }
  };

  for (const landscape of [false, true])
  {
    const way = landscape ? 'sideways' : 'upright';

    await check(`touch controls (${way}): Sparkroll - hold right on the pad and jump`, async () =>
    {
      const phone = await openOnPhone('sparkroll', landscape);
      try
      {
        await checkPhoneLayout(phone, landscape, 'Sparkroll');
        const kip = () => phone.page.evaluate(() =>
        {
          const s = window.divPlayground.getState();
          const id = s.vm.globals.get(s.bytecode.globals.kip_id);
          const p = s.vm.processManager.getAll().find((q) => q.id === id);
          return { state: s.vm.globals.get(s.bytecode.globals.gstate), x: p ? p.x : null, y: p ? p.y : null };
        });
        await phone.tap(await phone.centre('[data-touch-key="enter"]'));
        for (let i = 0; i < 30 && (await kip()).x === null; i++)
        {
          await phone.page.waitForTimeout(200);
        }
        await phone.page.waitForTimeout(1500);
        const before = await kip();
        assert(before.x !== null, `Start should start the game: ${JSON.stringify(before)}`);
        const pad = await phone.centre('[data-touch-pad]');
        await phone.down(1, { x: pad.x + pad.r * 0.8, y: pad.y });
        await phone.page.waitForTimeout(500);
        const running = await kip();
        await phone.down(2, await phone.centre('[data-touch-key="space"]'));
        await phone.page.waitForTimeout(200);
        const jumping = await kip();
        await phone.up(2);
        await phone.up(1);
        assert(running.x > before.x + 10, `holding right should run: ${JSON.stringify([before, running])}`);
        assert(jumping.x > running.x && jumping.y < running.y - 10, `jump while running: ${JSON.stringify([running, jumping])}`);
        assert(phone.problems.length === 0, phone.problems.join('\n'));
      }
      finally
      {
        await phone.context.close();
      }
    });

    await check(`touch controls (${way}): Street Duel - move and attack`, async () =>
    {
      const phone = await openOnPhone('fighter', landscape);
      try
      {
        await checkPhoneLayout(phone, landscape, 'Street Duel');
        const ok = await phone.centre('[data-touch-key="enter"]');
        // Title, character select, round intro: OK until the fight is on
        // and fighter 0 is the player's.
        for (let i = 0; i < 25 && !((await phone.g('ctl_on')) === 1 && (await phone.g('fctrl', 0)) === 0); i++)
        {
          await phone.tap(ok);
          await phone.page.waitForTimeout(600);
        }
        assert((await phone.g('ctl_on')) === 1 && (await phone.g('fctrl', 0)) === 0, 'OK should lead to a fight');
        const x0 = await phone.g('fx', 0);
        const pad = await phone.centre('[data-touch-pad]');
        await phone.down(1, { x: pad.x + pad.r * 0.8, y: pad.y });
        await phone.page.waitForTimeout(500);
        const x1 = await phone.g('fx', 0);
        await phone.up(1);
        assert(Math.abs(x1 - x0) > 5, `the pad should walk the fighter: ${x0} -> ${x1}`);
        // The CPU fights back: a press while the player is knocked down,
        // hit or blocking can't start an attack. Wait until the player's
        // fighter is free (state 0), then press; try a few times.
        const kick = await phone.centre('[data-touch-key="z"]');
        let attacking = -1;
        const seen = [];
        for (let attempt = 0; attempt < 5 && attacking !== 4; attempt++)
        {
          for (let i = 0; i < 60 && (await phone.g('fs', 0)) !== 0; i++)
          {
            await phone.page.waitForTimeout(50);
          }
          await phone.down(2, kick);
          for (let i = 0; i < 10 && attacking !== 4; i++)
          {
            attacking = await phone.g('fs', 0);
            await phone.page.waitForTimeout(30);
          }
          await phone.up(2);
          seen.push(attacking);
          await phone.page.waitForTimeout(400);
        }
        assert(attacking === 4, `LK should attack (state 4) from a free fighter, states seen ${seen.join(', ')}`);
        assert(phone.problems.length === 0, phone.problems.join('\n'));
      }
      finally
      {
        await phone.context.close();
      }
    });

    await check(`touch controls (${way}): Bomber - move and drop a bomb`, async () =>
    {
      const phone = await openOnPhone('bomber', landscape);
      try
      {
        await checkPhoneLayout(phone, landscape, 'Bomber');
        const bomb = await phone.centre('[data-touch-key="space"]');
        await phone.tap(bomb);
        for (let i = 0; i < 40 && !((await phone.g('state')) === 2 && (await phone.g('attract')) === 0); i++)
        {
          await phone.page.waitForTimeout(250);
        }
        const pad = await phone.centre('[data-touch-pad]');
        const where = async () => [await phone.g('p_x', 0), await phone.g('p_y', 0)];
        const start = await where();
        let moved = false;
        // Player 1 starts in the top-left corner: right or down is open.
        for (const [dx, dy] of [[1, 0], [0, 1]])
        {
          await phone.down(1, { x: pad.x + dx * pad.r * 0.8, y: pad.y + dy * pad.r * 0.8 });
          await phone.page.waitForTimeout(450);
          await phone.up(1);
          const now = await where();
          moved = moved || now[0] !== start[0] || now[1] !== start[1];
        }
        assert(moved, `the pad should move player 1 from ${start}`);
        const mine = async () =>
        {
          let n = 0;
          for (let k = 0; k < 40; k++)
          {
            n += (await phone.g('b_on', k)) && (await phone.g('b_own', k)) === 0 ? 1 : 0;
          }
          return n;
        };
        const before = await mine();
        await phone.tap(bomb);
        await phone.page.waitForTimeout(200);
        const after = await mine();
        assert(after === before + 1, `Bomb should drop a bomb of player 1: ${before} -> ${after}`);
        assert(phone.problems.length === 0, phone.problems.join('\n'));
      }
      finally
      {
        await phone.context.close();
      }
    });

    await check(`touch controls (${way}): Chicken Cannon has none, and drag-to-aim still works`, async () =>
    {
      const phone = await openOnPhone('chicken-cannon', landscape);
      try
      {
        const l = await phone.layout();
        assert(!l.shown && l.controls.length === 0, 'a mouse game should get no on-screen controls');
        assert(l.scrollY === 0 && l.game.y < 1, `the game should be at the top: ${JSON.stringify(l.game)}`);
        const read = () => phone.page.evaluate(() =>
        {
          const s = window.divPlayground.getState();
          const g = (n) => Number(s.vm.globals.get(s.bytecode.globals[n]));
          return { state: g('state'), ang: g('aim_ang'), pow: g('aim_pow'), left: s.runtime._mouse.buttons[0] };
        });
        await phone.page.waitForTimeout(1200);
        const box = await phone.page.locator('#game').boundingBox();
        const at = (x, y) => ({ x: box.x + x * box.width / 800, y: box.y + y * box.height / 480 });
        if ((await read()).state !== 2)
        {
          await phone.tap(at(400, 200));
          await phone.page.waitForTimeout(1500);
        }
        const started = await read();
        assert(started.state === 2, `a tap should start the game: ${JSON.stringify(started)}`);
        await phone.down(1, at(400, 300));
        for (let i = 1; i <= 8; i++)
        {
          await phone.move(1, at(400 - i * 9, 300 - i * 14));
          await phone.page.waitForTimeout(40);
        }
        await phone.page.waitForTimeout(300);
        const held = await read();
        await phone.up(1);
        assert(held.left && (held.ang !== started.ang || held.pow !== started.pow), `a dragged finger should aim: ${JSON.stringify([started, held])}`);
        assert(phone.problems.length === 0, phone.problems.join('\n'));
      }
      finally
      {
        await phone.context.close();
      }
    });
  }

  // The desktop page is unchanged: no controls without a touch, the three
  // columns side by side.
  await check('touch controls: none on a desktop, layout in three columns', async () =>
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
    try
    {
      await page.goto(`${BASE}/playground/#p=sparkroll`);
      await page.waitForFunction(() => window.divPlayground?.getState()?.vm);
      await page.mouse.click(1000, 300);
      await page.waitForTimeout(500);
      const l = await page.evaluate(() =>
      {
        const x = (s) => document.querySelector(s).getBoundingClientRect().x;
        const root = document.querySelector('[data-divjs-touch]');
        return { shown: !!root && root.style.display !== 'none', side: x('.sidebar'), editor: x('.editor-pane'), run: x('.run-pane'), height: document.documentElement.scrollHeight };
      });
      assert(!l.shown, 'a mouse click should not bring the touch controls up');
      assert(l.side < l.editor && l.editor < l.run && l.height <= 850, `desktop layout: ${JSON.stringify(l)}`);
    }
    finally
    {
      await page.close();
    }
  });

  // Tab: a program that plays with it (Ghost Squad switches ghosts with it
  // once a round is on) keeps
  // the focus on the game; one that doesn't (Tutorial 2) lets Tab move on
  // through the page as usual.
  await check('playground: Tab stays in a game that uses it, moves on otherwise', async () =>
  {
    const focusAfterTab = async (id, startKey) =>
    {
      const { page, problems } = await openPlayground(`#p=${id}`);
      await page.click('#game');
      await page.waitForTimeout(1500);
      if (startKey)
      {
        await page.keyboard.press(startKey);    // past the title screen
        await page.waitForTimeout(1000);
      }
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
      await page.close();
      assert(problems.length === 0, problems.join('\n'));
      return focused;
    };
    const ghosts = await focusAfterTab('ghost-squad', 'Space');
    const tutor = await focusAfterTab('tutor2');
    assert(ghosts === 'game', `in Ghost Squad Tab should stay on the game, focus went to ${ghosts}`);
    assert(tutor !== 'game', 'in a program that does not use Tab, Tab should move the focus on');
  });

  // ── 4. DivJS Blocks ───────────────────────────────────────────────────
  // The block editor: it loads cleanly, every lesson's solution makes code
  // that compiles and runs, the keys reach the game, the work is kept per
  // lesson, and "Open in the playground" carries the same code over.
  const { LESSONS } = await import('../blocks/lessons.js');

  // Like watch(), but console warnings count too: Blockly reports
  // problems with blocks and fields as warnings.
  const openBlocks = async (context = null, viewport = { width: 1280, height: 800 }) =>
  {
    const page = await (context || browser).newPage({ viewport });
    const problems = watch(page);
    page.on('console', (m) =>
    {
      if (m.type() === 'warning')
      {
        problems.push(`console warning: ${m.text()}`);
      }
    });
    await page.goto(`${BASE}/blocks/`);
    await page.waitForFunction(() => window.divBlocks, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    return { page, problems };
  };

  // VM ticks in `ms` milliseconds of the running game.
  const countTicks = (page, ms) => page.evaluate(async (wait) =>
  {
    const vm = window.divBlocks.getState().vm;
    let n = 0;
    const tick = vm.tick.bind(vm);
    vm.tick = () => { n += 1; return tick(); };
    await new Promise((r) => setTimeout(r, wait));
    vm.tick = tick;
    return n;
  }, ms);

  await check('blocks: the page loads with its first lesson', async () =>
  {
    const { page, problems } = await openBlocks();
    const blocks = await page.evaluate(() => window.divBlocks.workspace().getAllBlocks(false).length);
    const code = await page.textContent('#code');
    const title = await page.textContent('#lessonTitle');
    const lessons = await page.locator('#lessonNav button').count();
    const categories = await page.locator('.blocklyToolboxCategory').count();
    await page.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(blocks >= 2, `${blocks} blocks on the first lesson`);
    assert(code.startsWith('// Made with DivJS Blocks') && code.includes('PROGRAM my_game;'), `code: ${code.slice(0, 120)}`);
    assert(title === `1. ${LESSONS[0].title}`, `title "${title}"`);
    assert(lessons === LESSONS.length, `${lessons} lesson buttons`);
    assert(categories === 8, `${categories} toolbox categories`);
  });

  for (let i = 0; i < LESSONS.length; i++)
  {
    const lesson = LESSONS[i];
    await check(`blocks: lesson ${i + 1} (${lesson.id}) solution compiles and runs`, async () =>
    {
      const { page, problems } = await openBlocks();
      await page.click(`#lessonNav button[data-index="${i}"]`);
      await page.click('#solutionBtn');
      await page.waitForTimeout(200);
      const code = await page.evaluate(() => window.divBlocks.getCode());
      const shown = await page.textContent('#code');
      const compiled = await page.evaluate(async (source) =>
      {
        const { compile } = await import('/engine/divjs.js');
        try
        {
          compile(source);
          return 'ok';
        }
        catch (err)
        {
          return `${err.name}: ${err.message}`;
        }
      }, code);
      const warnings = await page.evaluate(() => window.divBlocks.workspace().getAllBlocks(false)
        .filter((b) => b.getIcon && b.getIcon('warning')).length);
      await page.click('#runBtn');
      await page.waitForTimeout(800);
      const ticks = await countTicks(page, 1000);
      const status = await page.textContent('#status');
      const consoleText = await page.textContent('#console');
      const size = await page.$eval('#game', (c) => [c.width, c.height]);
      const colours = await canvasColours(page, '#game');
      await page.close();
      assert(problems.length === 0, problems.join('\n'));
      assert(shown === code, 'the code shown is not the generated code');
      assert(compiled === 'ok', compiled);
      assert(warnings === 0, `${warnings} blocks with a warning`);
      assert(status === 'Running', `status "${status}"`);
      assert(consoleText === '', `console: ${consoleText}`);
      assert(ticks >= 30 && ticks <= 75, `${ticks} VM ticks in one second`);
      assert(size[0] === 320 && size[1] === 240, `canvas ${size.join('x')}`);
      assert(colours > 1, 'the canvas is blank');
    });
  }

  await check('blocks: lesson 2 - the Right arrow moves the player', async () =>
  {
    const { page, problems } = await openBlocks();
    await page.click('#lessonNav button[data-index="1"]');
    await page.click('#solutionBtn');
    await page.click('#runBtn');
    await page.waitForTimeout(500);
    // The only process with a graphic is the player.
    const playerX = () => page.evaluate(() =>
    {
      const vm = window.divBlocks.getState().vm;
      const sprites = vm.processManager.getAll().filter((p) => !p.isMouse && !p.dead && p.graph > 0);
      return sprites.length === 1 ? sprites[0].x : null;
    });
    const before = await playerX();
    await page.click('#game');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(100);
    const after = await playerX();
    await page.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(before === 160, `the player should start at x 160, got ${before}`);
    assert(after > before + 30, `holding Right for half a second moved the player from ${before} to ${after}`);
  });

  await check('blocks: lesson 3 - touching the coin scores and moves it', async () =>
  {
    const { page, problems } = await openBlocks();
    await page.click('#lessonNav button[data-index="2"]');
    await page.click('#solutionBtn');
    const code = await page.evaluate(() => window.divBlocks.getCode());
    await page.click('#runBtn');
    await page.waitForTimeout(500);
    // Put the player on the coin; score is the program's first GLOBAL.
    const coinBefore = await page.evaluate(() =>
    {
      const vm = window.divBlocks.getState().vm;
      const all = vm.processManager.getAll();
      const player = all.find((p) => p.name === 'player');
      const coin = all.find((p) => p.name === 'coin');
      player.x = player.locals[0] = coin.x;
      player.y = player.locals[1] = coin.y;
      return [coin.x, coin.y];
    });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() =>
    {
      const vm = window.divBlocks.getState().vm;
      const coin = vm.processManager.getAll().find((p) => p.name === 'coin');
      return { score: vm.globals.get(0), coin: [coin.x, coin.y] };
    });
    const consoleText = await page.textContent('#console');
    await page.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(/GLOBAL\n {2}score = 0;/.test(code), 'score should be the first GLOBAL');
    assert(after.score >= 1, `the score is ${after.score} after touching the coin`);
    assert(after.coin.join() !== coinBefore.join(), 'the coin should have moved somewhere else');
    assert(consoleText === '', `console: ${consoleText}`);
  });

  await check('blocks: the blocks are kept per lesson across reloads', async () =>
  {
    const context = await browser.newContext();
    const { page, problems } = await openBlocks(context);
    await page.click('#lessonNav button[data-index="2"]');
    await page.click('#solutionBtn');
    await page.waitForTimeout(600);
    const solved = await page.evaluate(() => window.divBlocks.getCode());
    await page.click('#lessonNav button[data-index="0"]');
    const first = await page.evaluate(() => window.divBlocks.getCode());
    await page.click('#lessonNav button[data-index="2"]');
    const back = await page.evaluate(() => window.divBlocks.getCode());
    await page.reload();
    await page.waitForFunction(() => window.divBlocks);
    const lessonAfterReload = await page.evaluate(() => window.divBlocks.getLesson());
    const afterReload = await page.evaluate(() => window.divBlocks.getCode());
    await context.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(first !== solved, 'lesson 1 should have its own blocks');
    assert(back === solved, 'going back to lesson 3 should bring its blocks back');
    assert(lessonAfterReload === LESSONS[2].id, `after a reload the lesson is ${lessonAfterReload}`);
    assert(afterReload === solved, 'the blocks of lesson 3 were not restored after a reload');
  });

  await check('blocks: "Open in the playground" opens the same code there', async () =>
  {
    const context = await browser.newContext();
    const { page, problems } = await openBlocks(context);
    await page.click('#lessonNav button[data-index="3"]');
    await page.click('#solutionBtn');
    await page.waitForTimeout(300);
    const code = await page.evaluate(() => window.divBlocks.getCode());
    const href = await page.$eval('#openLink', (a) => a.href);
    await page.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(href.startsWith(`${BASE}/playground/#p=new&code=`), `link ${href}`);
    const { page: pg, problems: pgProblems } = await openPlayground(href.slice(href.indexOf('#')), context);
    await pg.waitForTimeout(800);
    const opened = await pg.evaluate(async () =>
    {
      const { EditorView } = await import('/playground/vendor/codemirror.js');
      return EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString();
    });
    const status = await pg.textContent('#status');
    const size = await pg.$eval('#game', (c) => [c.width, c.height]);
    const blocksLink = await pg.$eval('a.link-btn.blocks', (a) => a.getAttribute('href'));
    await context.close();
    assert(pgProblems.length === 0, pgProblems.join('\n'));
    assert(opened === code, 'the playground opened different code');
    assert(status === 'Running', `playground status "${status}"`);
    assert(size[0] === 320 && size[1] === 240, `playground canvas ${size.join('x')}`);
    assert(blocksLink === '../blocks/', `the playground's Blocks link is ${blocksLink}`);
  });

  // EN | PT: the switch translates the page, the toolbox, the blocks, the
  // lesson and the comments in the code, and leaves the blocks, their
  // places, the code itself and the running game as they were. The choice
  // is kept; ?lang= overrides it.
  await check('blocks: the language switch (EN | PT)', async () =>
  {
    const { STRINGS } = await import('../blocks/i18n.js');
    // The code without its // comments (none of the lesson's texts has
    // "//" in it).
    const withoutComments = (code) => code.split('\n').map((line) => line.replace(/\s*\/\/.*$/, '')).join('\n');
    const context = await browser.newContext();
    const { page, problems } = await openBlocks(context);
    const snapshot = () => page.evaluate(() =>
    {
      const ws = window.divBlocks.workspace();
      return {
        code: window.divBlocks.getCode(),
        shown: document.getElementById('code').textContent,
        // Every block, and where each stack sits (blocks inside a stack
        // move with the width of the words before them).
        blocks: ws.getAllBlocks(false).map((b) => `${b.id} ${b.type} ${b.getParent()?.id ?? '-'}`).sort().join('\n'),
        stacks: ws.getTopBlocks(false).map((b) =>
        {
          const xy = b.getRelativeToSurfaceXY();
          return `${b.id} ${Math.round(xy.x)},${Math.round(xy.y)}`;
        }).sort().join('\n'),
        running: window.divBlocks.getState()?.running ?? false,
        processes: window.divBlocks.getState()?.vm.processManager.getAll().length ?? 0
      };
    });
    const texts = () => page.evaluate(() =>
    {
      const ws = window.divBlocks.workspace();
      const repeat = ws.getBlocksByType('div_repeat', false)[0];
      return {
        lang: document.documentElement.lang,
        categories: [...document.querySelectorAll('.blocklyToolboxCategoryLabel')].map((n) => n.textContent),
        title: document.getElementById('lessonTitle').textContent,
        run: document.getElementById('runBtn').textContent,
        status: document.getElementById('status').textContent,
        block: repeat ? repeat.toString() : '',
        pressed: document.querySelector('#langSwitch [aria-pressed="true"]').dataset.lang
      };
    });
    await page.click('#lessonNav button[data-index="4"]');
    await page.click('#solutionBtn');
    await page.click('#runBtn');
    await page.waitForTimeout(600);
    const en = await texts();
    const before = await snapshot();
    await page.click('#langSwitch button[data-lang="pt"]');
    await page.waitForTimeout(300);
    const pt = await texts();
    const after = await snapshot();
    await page.reload();
    await page.waitForFunction(() => window.divBlocks);
    await page.waitForTimeout(300);
    const reloaded = await texts();
    const reloadedCode = await page.evaluate(() => window.divBlocks.getCode());
    await page.goto(`${BASE}/blocks/?lang=en`);
    await page.waitForFunction(() => window.divBlocks);
    await page.waitForTimeout(300);
    const forced = await texts();
    await page.click('#langSwitch button[data-lang="pt"]');
    await page.waitForTimeout(300);
    const address = page.url();
    await page.click('#langSwitch button[data-lang="en"]');
    await page.waitForTimeout(300);
    const back = await texts();
    const backCode = await page.evaluate(() => window.divBlocks.getCode());
    await context.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(en.lang === 'en' && en.pressed === 'en' && en.run === STRINGS.en.RUN, `English at first: ${JSON.stringify(en)}`);
    assert(pt.lang === 'pt-PT' && pt.pressed === 'pt', `lang ${pt.lang}, pressed ${pt.pressed}`);
    assert(pt.categories.join() === 'Programa,Aparência,Movimento,Controlo,Sensores,Operadores,Variáveis,Som', `categories: ${pt.categories.join()}`);
    assert(pt.block.startsWith('repete ') && pt.block.includes(' vezes'), `repeat block: ${pt.block}`);
    assert(pt.title === `5. ${STRINGS.pt.LESSON_FREE_TITLE}`, `title "${pt.title}"`);
    assert(pt.run === STRINGS.pt.RUN && pt.status === STRINGS.pt.STATUS_RUNNING, `run "${pt.run}", status "${pt.status}"`);
    assert(before.running && after.running && after.processes >= before.processes - 3, 'the game should keep running');
    assert(withoutComments(after.code) === withoutComments(before.code), 'the code changed with the language');
    assert(after.shown === after.code, 'the code shown is not the code made in Portuguese');
    assert(before.code.startsWith(`// ${STRINGS.en.CODE_HEADER}\n`) && after.code.startsWith(`// ${STRINGS.pt.CODE_HEADER}\n`), `the header comment: ${after.code.split('\n')[0]}`);
    assert(after.code.includes(`// ${STRINGS.pt.CODE_BOUNCE}\n`) && !after.code.includes(`// ${STRINGS.en.CODE_BOUNCE}\n`), 'the bounce comment is not in Portuguese');
    assert(after.blocks === before.blocks, `the blocks changed:\n${before.blocks}\n---\n${after.blocks}`);
    assert(after.stacks === before.stacks, `the stacks moved:\n${before.stacks}\n---\n${after.stacks}`);
    assert(reloaded.lang === 'pt-PT' && reloaded.title === pt.title, `after a reload: ${reloaded.lang} "${reloaded.title}"`);
    assert(reloadedCode === after.code, 'the code changed after the reload');
    assert(forced.lang === 'en' && forced.run === STRINGS.en.RUN && forced.categories[0] === 'Program', `?lang=en: ${JSON.stringify(forced)}`);
    assert(address.endsWith('?lang=pt'), `the address after switching is ${address}`);
    assert(back.lang === 'en' && back.title === `5. ${STRINGS.en.LESSON_FREE_TITLE}` && back.block.startsWith('repeat '), `back to English: ${JSON.stringify(back)}`);
    assert(back.categories.join() === 'Program,Looks,Motion,Control,Sensing,Operators,Variables,Sound', `categories: ${back.categories.join()}`);
    assert(backCode === before.code, 'the code changed after switching back');
  });

  // On the Portuguese page, the last lesson's example game shows its texts
  // in Portuguese, drawn by the game (Latin-1 characters such as ç and é).
  await check('blocks: lesson 5 in Portuguese - the game\'s texts are in Portuguese', async () =>
  {
    const { STRINGS } = await import('../blocks/i18n.js');
    const context = await browser.newContext();
    const page = await context.newPage({ viewport: { width: 1280, height: 800 } });
    const problems = watch(page);
    await page.goto(`${BASE}/blocks/?lang=pt`);
    await page.waitForFunction(() => window.divBlocks, null, { timeout: 15000 });
    await page.click('#lessonNav button[data-index="4"]');
    await page.click('#solutionBtn');
    await page.click('#runBtn');
    await page.waitForTimeout(800);
    const code = await page.evaluate(() => window.divBlocks.getCode());
    const status = await page.textContent('#status');
    const consoleText = await page.textContent('#console');
    await context.close();
    assert(problems.length === 0, problems.join('\n'));
    for (const key of ['LESSON_FREE_GAME_HITS', 'LESSON_FREE_GAME_WIN', 'LESSON_FREE_GAME_HELP', 'LESSON_FREE_GAME_CLICK'])
    {
      assert(code.includes(`'${STRINGS.pt[key]}'`), `the code has no '${STRINGS.pt[key]}'`);
      assert(!code.includes(`'${STRINGS.en[key]}'`), `the code still has '${STRINGS.en[key]}'`);
    }
    assert(status === STRINGS.pt.STATUS_RUNNING, `status "${status}"`);
    assert(consoleText === '', `console: ${consoleText}`);
  });

  // Blockly's floating widgets must never be cut off by the page layout: a
  // dropdown that opens upwards from a block in the lower part of the
  // workspace, the context menu and a tooltip of a block at its bottom
  // edge. Each is opened with a real click (or hover) and every option
  // must be inside the window, not clipped by any box around it, and
  // reachable by a click at its centre.
  await check('blocks: dropdowns, context menu and tooltips are not cut off', async () =>
  {
    // How much of an element can be seen: its box, cut by every ancestor
    // that clips and by the window.
    const visibleBox = () =>
    {
      window.visibleBox = (element) =>
      {
        const r = element.getBoundingClientRect();
        let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        const cut = (c) =>
        {
          box = {
            left: Math.max(box.left, c.left),
            top: Math.max(box.top, c.top),
            right: Math.min(box.right, c.right),
            bottom: Math.min(box.bottom, c.bottom)
          };
        };
        for (let p = element.parentElement; p && p !== document.documentElement; p = p.parentElement)
        {
          if (getComputedStyle(p).overflow !== 'visible')
          {
            cut(p.getBoundingClientRect());
          }
        }
        cut({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
        const whole = box.left <= r.left + 0.5 && box.top <= r.top + 0.5 && box.right >= r.right - 0.5 && box.bottom >= r.bottom - 0.5;
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), whole };
      };
    };
    // Options of the menu shown in `root`: each one scrolled into the
    // menu's own view if the menu scrolls, then checked.
    const menuOptions = (page, root) => page.evaluate((selector) =>
    {
      const items = [...document.querySelectorAll(`${selector} .blocklyMenuItem`)];
      return items.map((item, i) =>
      {
        const menu = item.closest('.blocklyMenu');
        const r = item.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        if (r.top < m.top)
        {
          menu.scrollTop -= m.top - r.top;
        }
        else if (r.bottom > m.bottom)
        {
          menu.scrollTop += r.bottom - m.bottom;
        }
        const box = window.visibleBox(item);
        const now = item.getBoundingClientRect();
        const hit = document.elementFromPoint(now.left + now.width / 2, now.top + now.height / 2);
        return { text: item.textContent.trim() || `#${i + 1}`, ...box, clickable: Boolean(hit && item.contains(hit)) };
      });
    }, root);
    // Lesson 1's solution, its "look like" block moved so that the colour
    // field sits `fromBottom` px above the bottom edge of the workspace,
    // and the page scrolled so that edge is in the window.
    const placeLook = async (page, fromBottom) =>
    {
      await page.evaluate(() =>
      {
        window.divBlocks.openLesson(0);
        window.divBlocks.showSolution();
      });
      await page.evaluate(() =>
      {
        const r = document.getElementById('workspace').getBoundingClientRect();
        window.scrollBy(0, Math.max(0, r.bottom - window.innerHeight + 8));
      });
      await page.waitForTimeout(200);
      return page.evaluate((offset) =>
      {
        const ws = window.divBlocks.workspace();
        const look = ws.getBlocksByType('div_look', false)[0];
        const field = look.getField('COLOUR').getSvgRoot();
        const area = document.getElementById('workspace').getBoundingClientRect();
        let r = field.getBoundingClientRect();
        look.getRootBlock().moveBy(0, (area.bottom - offset - (r.top + r.height / 2)) / ws.scale);
        r = field.getBoundingClientRect();
        const block = look.getSvgRoot().querySelector('.blocklyPath').getBoundingClientRect();
        return {
          field: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
          // A spot on the block itself, left of its first field.
          block: { x: block.left + 12, y: block.top + block.height / 2 },
          area: { top: area.top, bottom: area.bottom }
        };
      }, fromBottom);
    };
    const failures = [];
    const cases = [
      ['desktop', { width: 1280, height: 800 }, [30, 260]],
      ['short desktop', { width: 1280, height: 560 }, [30]],
      ['phone', { width: 390, height: 844 }, [30, 300]]
    ];
    for (const [name, viewport, offsets] of cases)
    {
      const { page, problems } = await openBlocks(null, viewport);
      await page.evaluate(visibleBox);
      for (const offset of offsets)
      {
        const where = `${name}, ${offset} px from the bottom`;
        const spot = await placeLook(page, offset);
        await page.mouse.click(spot.field.x, spot.field.y);
        await page.waitForTimeout(400);
        const options = await menuOptions(page, '.blocklyDropDownDiv');
        if (options.length !== 10)
        {
          failures.push(`${where}: the colour dropdown shows ${options.length} options`);
        }
        const bad = options.filter((o) => !o.whole || !o.clickable);
        if (bad.length > 0)
        {
          failures.push(`${where}: options cut off or not clickable: ${bad.map((o) => `${o.text} ${o.top}-${o.bottom}${o.whole ? '' : ' cut'}${o.clickable ? '' : ' covered'}`).join(', ')}`);
        }
        // Choosing the first option (red) with a real click works.
        const first = await page.evaluate(() =>
        {
          const item = document.querySelector('.blocklyDropDownDiv .blocklyMenuItem');
          if (!item)
          {
            return null;
          }
          item.closest('.blocklyMenu').scrollTop = 0;
          const r = item.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (first)
        {
          await page.mouse.click(first.x, first.y);
          await page.waitForTimeout(300);
        }
        const colour = await page.evaluate(() => window.divBlocks.workspace().getBlocksByType('div_look', false)[0].getFieldValue('COLOUR'));
        if (colour !== 'red')
        {
          failures.push(`${where}: clicking the first colour chose "${colour}", not red`);
        }
        await page.keyboard.press('Escape');
      }
      // The context menu and the tooltip of a block at the bottom edge.
      const spot = await placeLook(page, 40);
      await page.mouse.click(spot.block.x, spot.block.y, { button: 'right' });
      await page.waitForTimeout(400);
      const items = await menuOptions(page, '.blocklyWidgetDiv');
      if (items.length < 3)
      {
        failures.push(`${name}: the context menu shows ${items.length} items`);
      }
      const badItems = items.filter((o) => !o.whole || !o.clickable);
      if (badItems.length > 0)
      {
        failures.push(`${name}: context menu items cut off or not clickable: ${badItems.map((o) => `${o.text} ${o.top}-${o.bottom}`).join(', ')}`);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.mouse.move(spot.block.x, spot.block.y);
      await page.mouse.move(spot.block.x + 2, spot.block.y);
      await page.waitForTimeout(1500);
      const tooltip = await page.evaluate(() =>
      {
        const tip = document.querySelector('.blocklyTooltipDiv');
        return tip && getComputedStyle(tip).display !== 'none' ? { text: tip.textContent, ...window.visibleBox(tip) } : null;
      });
      if (!tooltip)
      {
        failures.push(`${name}: no tooltip over the block`);
      }
      else if (!tooltip.whole)
      {
        failures.push(`${name}: the tooltip is cut off (${tooltip.top}-${tooltip.bottom})`);
      }
      await page.close();
      failures.push(...problems);
    }
    assert(failures.length === 0, failures.join('\n'));
  });

  await check('blocks: phone width stacks the page without sideways scrolling', async () =>
  {
    const { page, problems } = await openBlocks(null, { width: 390, height: 844 });
    const layout = await page.evaluate(() =>
    {
      const top = (id) => document.getElementById(id).getBoundingClientRect().top;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        order: [top('lessonTitle'), top('screen'), top('workspace'), top('code')]
      };
    });
    await page.close();
    assert(problems.length === 0, problems.join('\n'));
    assert(layout.scrollWidth <= 390, `the page is ${layout.scrollWidth} px wide`);
    const [lessonTop, screenTop, workTop, codeTop] = layout.order;
    assert(lessonTop < screenTop && screenTop < workTop && workTop < codeTop, `order: ${layout.order.join(', ')}`);
  });
}
finally
{
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nSummary: ${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length > 0)
{
  process.exitCode = 1;
}
