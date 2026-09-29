// What the two videos show, in order. Edit this file to re-cut them:
// change a segment's `beats` (120 bpm: 2 beats = 1 s) to re-time it, its
// `from` (seconds into the take) to pick another moment, its texts, or
// the order. Narration lines live in vo_lines.json, per segment id.
//
// TAKES are the recordings the segments cut from (see capture.mjs): the
// games, played by the scripts in tools/game-shots.mjs, the playground
// editor and the Blocks editor. The text screens and the music are made
// from this file by cards.mjs and music.mjs and recorded the same way.

import { SHOTS } from '../game-shots.mjs';

export const BPM = 120;

// ── Takes ───────────────────────────────────────────────────────────────

const inGame = async ({ page }) =>
{
  await page.waitForFunction(() => window.divPlayground?.getState()?.runtime, null, { timeout: 15000, polling: 100 });
  await page.click('#game');
};

const game = (id, seconds = 10, extra = {}) => ({ url: `playground/#p=${id}`, shot: id, seconds, ready: inGame, ...extra });

// A pretend mouse pointer for the editor takes (headless screenshots have
// none), so the viewer sees what is clicked.
const POINTER = `(() =>
{
  const add = () =>
  {
    const p = document.createElement('div');
    p.id = 'trailer-pointer';
    p.style.cssText = 'position:fixed;left:-40px;top:-40px;width:22px;height:22px;z-index:99999;pointer-events:none;' +
      'background:no-repeat url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.7 L9.6 12 L15.5 12 Z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>') + '")';
    document.body.appendChild(p);
    window.addEventListener('mousemove', (e) =>
    {
      p.style.left = e.clientX + 'px';
      p.style.top = e.clientY + 'px';
    }, true);
  };
  if (document.body)
  {
    add();
  }
  else
  {
    window.addEventListener('DOMContentLoaded', add);
  }
})();`;

// The editor takes are 1440x810 CSS pixels at 4/3 scale: 1920x1080 frames.
const UI = { viewport: { width: 1440, height: 810 }, scale: 4 / 3, screenshot: { size: { width: 1920, height: 1080 } }, pointer: POINTER };

// Moves the pretend pointer to the middle of `box` over a few frames.
async function pointTo(ctx, box, frames = 12)
{
  const { page, clock } = ctx;
  const from = ctx.mouse || { x: 700, y: 500 };
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await clock.move(from.x, from.y, to.x, to.y, frames);
  ctx.mouse = to;
  await page.mouse.move(to.x, to.y);
}

// Where an element is, in the take's pixels (for the vertical crops).
async function region(page, selector, scale)
{
  const r = await page.$eval(selector, (el) =>
  {
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  return [r.x, r.y, r.w, r.h].map((v) => Math.round(v * scale));
}

function asteroidsPlay()
{
  const steps = [];
  const turns = ['ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowRight'];
  turns.forEach((turn, i) =>
  {
    steps.push(['down', turn]);
    for (let k = 0; k < 7; k++)
    {
      steps.push(['press', 'Space'], ['wait', 110]);
    }
    steps.push(['up', turn]);
    if (i % 2 === 1)
    {
      steps.push(['hold', 'ArrowUp', 180]);
    }
  });
  return steps;
}

export const TAKES = {
  fighter: game('fighter'),
  bomber: game('bomber'),
  strike: game('strike'),
  'bad-cat': game('bad-cat'),
  'chicken-cannon': game('chicken-cannon'),
  // Both tanks on the move and firing all the time (one keyboard: blue
  // WASD + Space, red arrows + Enter).
  'net-tanks': game('net-tanks', 8, {
    steps: [['down', 'w'], ['down', 'ArrowUp'], ['wait', 400], ['press', 'Space'], ['hold', 'a', 250], ['press', 'Enter'],
      ['hold', 'ArrowRight', 250], ['wait', 300], ['press', 'Space'], ['press', 'Enter'], ['hold', 'd', 500], ['hold', 'ArrowLeft', 400],
      ['wait', 300], ['press', 'Space'], ['press', 'Enter'], ['wait', 400], ['press', 'Space'], ['press', 'Enter'], ['hold', 'a', 300],
      ['wait', 300], ['press', 'Space'], ['press', 'Enter'], ['wait', 600], ['up', 'w'], ['up', 'ArrowUp']]
  }),
  'wobbly-walker': game('wobbly-walker'),
  'ghost-squad': game('ghost-squad'),
  racer: game('racer'),
  // Firing is key_pressed(): a press every few frames while turning.
  'vector-asteroids': game('vector-asteroids', 10, { steps: asteroidsPlay() }),

  // The playground: Chicken Cannon fires a chicken into the fort, its
  // gravity is changed from 600 to 1800 in the code, Run, and the same
  // shot (aimed with the keys this time) drops short. The fort takes
  // longer to build under the new gravity: the segments cut that out. Regions (take pixels) for the layouts:
  // code (the editor), line (the GRAV line), screen (the game).
  'live-edit': {
    ...UI,
    url: 'playground/#p=chicken-cannon',
    seconds: 11,
    ready: async (ctx) =>
    {
      await inGame(ctx);
      // The GRAV line in the middle of the editor.
      await ctx.page.evaluate(() =>
      {
        const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes('GRAV = 600'));
        line.scrollIntoView({ block: 'center' });
      });
    },
    setup: SHOTS['chicken-cannon'].setup,
    async play(ctx)
    {
      const { page, clock, run } = ctx;
      const code = await region(page, '.cm-editor', UI.scale);
      const screen = await region(page, '#game', UI.scale);
      const found = await page.evaluate(() =>
      {
        const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes('GRAV = 600'));
        line.id = 'trailer-line';
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode())
        {
          const i = node.textContent.indexOf('600');
          if (i >= 0)
          {
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 3);
            const b = range.getBoundingClientRect();
            return { x: b.x, y: b.y, width: b.width, height: b.height };
          }
        }
        return null;
      });
      const line = await region(page, '#trailer-line', UI.scale);
      // The first shot, as the game was written.
      await run([['drag', 400, 300, 330, 190, 400], ['wait', 300]]);
      // While it flies: select 600 and type 1800.
      await pointTo(ctx, found, 24);
      await page.mouse.dblclick(ctx.mouse.x, ctx.mouse.y);
      // The pointer steps aside so the new number can be read.
      await pointTo(ctx, { x: found.x + 40, y: found.y + 34, width: 0, height: 0 }, 8);
      await clock.wait(150);
      for (const ch of '1800')
      {
        await page.keyboard.type(ch);
        await clock.wait(160);
      }
      // See the first shot land.
      await clock.wait(900);
      const runButton = await page.$eval('#runBtn', (b) =>
      {
        const r = b.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      await pointTo(ctx, runButton, 14);
      await page.mouse.click(ctx.mouse.x, ctx.mouse.y);
      // The program starts again on its title screen: a click on it starts
      // the game (and gives it the keyboard). The same shot is then aimed
      // with the keys (full power) and fired with Space.
      const title = await page.$eval('#game', (c) =>
      {
        const r = c.getBoundingClientRect();
        return { x: r.x + 400 * r.width / c.width - 1, y: r.y + 215 * r.height / c.height - 1, width: 2, height: 2 };
      });
      await pointTo(ctx, title, 30);
      await page.mouse.click(ctx.mouse.x, ctx.mouse.y);
      await run([['wait', 2300], ['hold', 'ArrowRight', 1100], ['press', 'Space'], ['wait', 2500]]);
      return { code, screen, line };
    }
  },

  // DivJS Blocks, lesson 4: the solution's blocks are loaded, run and played.
  blocks: {
    ...UI,
    url: 'blocks/',
    seconds: 10,
    audio: true,
    ready: async ({ page }) =>
    {
      await page.waitForFunction(() => document.querySelector('#lessonNav button'), null, { polling: 100 });
      await page.evaluate(() => [...document.querySelectorAll('#lessonNav button')].find((b) => b.textContent.trim() === '4').click());
    },
    setup: [['wait', 700]],
    async play(ctx)
    {
      const { page, clock, run } = ctx;
      const box = async (selector) => page.$eval(selector, (b) =>
      {
        const r = b.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      await clock.wait(500);
      await pointTo(ctx, await box('#solutionBtn'), 18);
      await page.mouse.click(ctx.mouse.x, ctx.mouse.y);
      await clock.wait(700);
      await pointTo(ctx, await box('#runBtn'), 24);
      await page.mouse.click(ctx.mouse.x, ctx.mouse.y);
      await clock.wait(200);
      await page.focus('#game');
      await run([['hold', 'ArrowRight', 700], ['hold', 'ArrowUp', 600], ['hold', 'ArrowLeft', 900], ['hold', 'ArrowDown', 500],
        ['hold', 'ArrowRight', 800], ['hold', 'ArrowUp', 700], ['hold', 'ArrowLeft', 600]]);
      return {
        workspace: await region(page, '#workspace', UI.scale),
        screen: await region(page, '#game', UI.scale),
        code: await region(page, '#code', UI.scale)
      };
    }
  }
};

// ── Layouts ─────────────────────────────────────────────────────────────
//
// Both videos draw their text screens at a low resolution in DivJS and
// scale them up by `scale` with nearest-neighbour: the Short at 180x320
// (x6), the trailer at 384x216 (x5). Game footage goes in `window` (in
// video pixels), scaled by a whole number and cropped to fit.

export const FORMATS = {
  short: { size: [1080, 1920], card: [180, 320], scale: 6, window: [0, 360, 1080, 1200], zoom: 2 },
  trailer: { size: [1920, 1080], card: [384, 216], scale: 5, window: [616, 60, 1280, 960], zoom: 2 }
};

// Game names as shown under the footage.
const NAMES = {
  fighter: 'Street Duel',
  bomber: 'Bomber Arena',
  strike: 'Dune Strike',
  'bad-cat': 'Bad Cat',
  'chicken-cannon': 'Chicken Cannon',
  'net-tanks': 'Net Tanks',
  'wobbly-walker': 'Wobbly Walker',
  'ghost-squad': 'Ghost Squad',
  racer: 'Micro Racer',
  'vector-asteroids': 'Vector Asteroids'
};

// A game segment. `focus` is the point of the game screen to keep in the
// middle when it has to be cropped; `say` is the caption.
const clip = (id, beats, from, say = '', extra = {}) => ({ id: extra.id || id, take: id, beats, from, say, name: NAMES[id], ...extra });
// A text screen.
const card = (id, beats, texts, extra = {}) => ({ id, beats, texts, ...extra });

// The live edit without the fort being built again (see its take).
const LIVE_CUTS = [[0.3, 3.55], [5.2]];
// The net match without the pauses after each hit.
const NET_CUTS = [[0.2, 1.6], [2.6, 3.6], [4.0]];

export const VIDEOS = {
  short: {
    format: 'short',
    segments: [
      clip('fighter', 4, 0.5, 'Remember DIV\n[Games Studio?]', { id: 'hook', zoom: 3, focus: [330, 200], music: 'intro', hit: 'hit' }),
      clip('bomber', 4, 1.8, 'It\'s back.', { music: 'main', hit: 'explosion' }),
      clip('strike', 4, 2.6, 'And it runs in\nyour {browser}.', { zoom: 3 }),
      clip('bad-cat', 4, 1.0, 'Every game is\nplain {DIV code}', { zoom: 3, focus: [420, 240] }),
      clip('chicken-cannon', 4, 2.2, '', { focus: [330, 240] }),
      clip('ghost-squad', 4, 3.0, '', { focus: [270, 240] }),
      clip('wobbly-walker', 4, 0.3, '', { zoom: 3, focus: [240, 240] }),
      clip('racer', 4, 1.9, '', { zoom: 3, focus: [260, 240] }),
      clip('vector-asteroids', 4, 2.5),
      clip('net-tanks', 4, 0.2, 'Online\nmultiplayer.', { bottom: '[No server.]', hit: 'powerup', cuts: NET_CUTS }),
      {
        // The GRAV line zoomed in (5x: the number is as big as the
        // captions), the game under it. The cuts leave out the fort being
        // built again.
        id: 'live', beats: 16, take: 'live-edit', cuts: LIVE_CUTS, say: 'Change any\ngame {live}', music: 'calm', hit: 'blip',
        stack: [{ region: 'line', box: [20, -26, 216, 74] }, { region: 'screen' }]
      },
      {
        id: 'blocks', beats: 10, take: 'blocks', from: 0.5, say: 'New to code?\nUse {blocks}.', hit: 'blip',
        stack: [{ region: 'workspace', left: 170, width: 800, height: 356, at: 0 }, { region: 'screen', outWidth: 624 }]
      },
      card('end', 12, [
        { text: 'DivJS', scale: 5, y: 92, color: '#2dd4bf', cps: 12, cursor: true },
        { text: 'Free and\nopen source', scale: 2, y: 172, at: 0.9, cps: 30 },
        { text: 'akadjoker.github.io\n/divjs-playground', scale: 1, y: 236, at: 1.6, cps: 0, color: '#ffcb6b' }
      ], { music: 'end', hit: 'coin' })
    ]
  },
  trailer: {
    format: 'trailer',
    segments: [
      card('hook', 8, [
        { text: 'Remember', scale: 3, y: 62, cps: 21 },
        { text: '[DIV Games Studio]?', scale: 3, y: 100, at: 0.8, cps: 27, cursor: true }
      ], { music: 'intro' }),
      clip('fighter', 8, 0.5, 'It\'s back.\n\nAnd it runs in\nyour {browser}.', { music: 'main', hit: 'hit' }),
      clip('bomber', 8, 1.6, 'The same DIV\nlanguage:\nprocesses, FRAME,\nthe lot.'),
      clip('strike', 6, 2.6, 'Every game here\nis plain {DIV code}.'),
      clip('bad-cat', 6, 1.4, 'Read it.\nChange it.\nMake your own.'),
      clip('chicken-cannon', 6, 1.2, '', { focus: [380, 240] }),
      clip('ghost-squad', 6, 2.8),
      clip('wobbly-walker', 6, 0.2),
      clip('racer', 6, 1.6),
      clip('vector-asteroids', 6, 2.5),
      card('net-card', 6, [
        { text: 'Online multiplayer.', scale: 3, y: 70, cps: 36 },
        { text: '[No server.]', scale: 3, y: 112, at: 1.1, cps: 24, cursor: true }
      ], { hit: 'powerup' }),
      clip('net-tanks', 6, 0.2, 'Two browsers,\npeer to peer.', { cuts: NET_CUTS }),
      card('live-card', 6, [
        { text: 'Change any', scale: 3, y: 70, cps: 30 },
        { text: 'game {live}', scale: 3, y: 112, at: 0.6, cps: 30, cursor: true }
      ], { music: 'calm', hit: 'blip' }),
      {
        // The GRAV line with its number and comment (2.7x), the game under it.
        id: 'live', beats: 18, take: 'live-edit', cuts: LIVE_CUTS, window: [0, 0, 1920, 1080],
        stack: [{ region: 'line', box: [-70, -26, 620, 74], outWidth: 1700 }, { region: 'screen', outWidth: 1200 }]
      },
      card('blocks-card', 6, [
        { text: 'New to code?', scale: 3, y: 70, cps: 30 },
        { text: 'Start with {blocks}.', scale: 3, y: 112, at: 0.8, cps: 30, cursor: true }
      ], { hit: 'blip' }),
      { id: 'blocks', beats: 16, take: 'blocks', from: 0.3, ui: true, crop: [160, 100, 1744, 981] },
      card('games-card', 6, [
        { text: 'Over 30 games', scale: 3, y: 62, cps: 30 },
        { text: 'to play, read', scale: 3, y: 100, at: 0.7, cps: 30 },
        { text: 'and change.', scale: 3, y: 138, at: 1.4, cps: 30, cursor: true }
      ], { music: 'main', hit: 'explosion' }),
      card('end', 14, [
        { text: 'DivJS', scale: 8, y: 36, color: '#2dd4bf', cps: 10, cursor: true },
        { text: 'Free and open source', scale: 2, y: 124, at: 1.0, cps: 30 },
        { text: 'akadjoker.github.io/divjs-playground', scale: 1, y: 170, at: 1.8, cps: 0, color: '#ffcb6b' }
      ], { music: 'end', hit: 'coin' })
    ]
  }
};
