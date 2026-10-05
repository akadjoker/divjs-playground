// Records short animated GIFs of the playground's games, for the README
// and the game pages: each game is opened in Chromium (Playwright), taken
// past its title screens, played for a few seconds with real key presses
// and mouse drags, and its canvas is recorded.
//
//   node tools/capture.mjs                     every game in SHOTS
//   node tools/capture.mjs fighter bomber      some of them
//   options: --out docs/media  --width 320  --fps 8
//            --check  also saves <id>-end.png, the game's last frame
//
// Math.random is seeded before each game starts, so a game that makes its
// world at random makes the same one every time and a script can aim at it.
//
// Needs Playwright's Chromium (npx playwright install chromium) and the
// gifenc package (a dev dependency).

import http from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Steps: ['wait', ms], ['press', key], ['down', key], ['up', key],
// ['hold', key, ms], ['drag', x1, y1, x2, y2, ms] and ['click', x, y] in
// the game's own coordinates, ['move', x, y, ms] (the mouse glides there
// and waits) and ['run', async ({ page, click }) => ...] for anything else. `setup` runs before recording, `play` while
// it records for `seconds`. A `bot` is a function that runs in the page
// while it records, for what key steps cannot time (a rhythm game's
// notes): it reads the game's variables and sends keys itself, and leaves
// window.__stopBot to stop it; `botArg` is handed to it.
const hold = (key, ms) => ['hold', key, ms];

// Beat Bash's own player: reads the notes from the game (n_t, n_ln and n_st
// follow MAXN in the global slots, 1000 values each) and presses each
// lane's key as the note reaches the line.
function beatBashBot()
{
  const { vm, bytecode } = window.divPlayground.getState();
  const slots = bytecode.globals;
  const read = (slot) => vm.globals.get(slot) ?? 0;
  const first = slots.maxn + 1;
  const lanes = [['d', 'KeyD'], ['f', 'KeyF'], ['j', 'KeyJ'], ['k', 'KeyK']];
  const sent = new Set();
  const send = (type, lane) => window.dispatchEvent(new KeyboardEvent(type, { key: lanes[lane][0], code: lanes[lane][1], bubbles: true }));
  const timer = setInterval(() =>
  {
    const now = read(slots.song_t);
    const count = read(slots.nnotes);
    for (let i = read(slots.nfirst); i < count; i++)
    {
      const at = read(first + i);
      if (at - now > 0.012)
      {
        break;
      }
      if (!sent.has(i) && read(first + 2000 + i) === 0 && at - now > -0.06)
      {
        const lane = read(first + 1000 + i);
        sent.add(i);
        send('keydown', lane);
        setTimeout(() => send('keyup', lane), 70);
      }
    }
  }, 2);
  window.__stopBot = () => clearInterval(timer);
}

// Cave Flyer's own pilot: keeps the ship in the middle of the gap ahead.
// The ceiling and floor heights (top_h, bot_h: 256 columns of 4 px each in
// a ring) follow `ring` in the global slots.
function caveBot()
{
  const { vm, bytecode } = window.divPlayground.getState();
  const slots = bytecode.globals;
  const read = (slot) => vm.globals.get(slot) ?? 0;
  const ring = read(slots.ring);
  const columnWidth = read(slots.col_w);
  const top = slots.ring + 1;
  const floor = top + ring;
  let held = false;
  const history = [];
  const press = (down) =>
  {
    if (down !== held)
    {
      held = down;
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: ' ', code: 'Space', bubbles: true }));
    }
  };
  // The pilot starts the game itself (the ship falls at once, so there is
  // no time to spare between the key and the first correction).
  press(true);
  const timer = setInterval(() =>
  {
    const ship = vm.processManager.getAll().find((p) => p.name === 'ship' && !p.dead);
    if (!ship)
    {
      press(false);
      return;
    }
    const ahead = Math.floor((read(slots.scroll_x) + ship.x + 28) / columnWidth) % ring;
    const middle = (read(top + ahead) + read(floor + ahead)) / 2;
    // Speed over the last few frames, then up whenever the ship is (or is
    // about to be, at its speed) below the middle of the gap.
    history.push(ship.y);
    if (history.length > 6)
    {
      history.shift();
    }
    const speed = (history[history.length - 1] - history[0]) / Math.max(1, history.length - 1);
    press(ship.y + speed * 11 > middle);
  }, 16);
  window.__stopBot = () =>
  {
    clearInterval(timer);
    press(false);
  };
}

// Plays Sugar Swap for `ms`: each time the board settles (phase 0) the game
// has worked out its best swap (hint_a, hint_b: cell numbers, 9 to a row,
// 48 px cells from x 16, y 24), and this makes it with two clicks.
async function sugarSwap({ page, click }, ms)
{
  const end = Date.now() + ms;
  const centre = (cell) => [16 + (cell % 9) * 48 + 24, 24 + Math.floor(cell / 9) * 48 + 24];
  while (Date.now() < end)
  {
    const [phase, a, b] = await page.evaluate(() =>
    {
      const { vm, bytecode } = window.divPlayground.getState();
      const read = (name) => vm.globals.get(bytecode.globals[name]) ?? 0;
      return [read('phase'), read('hint_a'), read('hint_b')];
    });
    if (phase === 0 && a >= 0 && b >= 0)
    {
      await click(...centre(a));
      await page.waitForTimeout(250);
      await click(...centre(b));
      await page.waitForTimeout(1500);
    }
    else
    {
      await page.waitForTimeout(200);
    }
  }
}

// A player for action games: walks the `hero` process towards the nearest
// live process named in `enemies`, swings (`attack`) once it is within
// `reach` pixels, and walks to `idle` when none is left. With `axis: 'x'`
// it only lines up sideways (a shooter, a paddle) and fires when `reach`
// pixels or less away in x; `sway` swings the aim from side to side by up
// to that many pixels, so a paddle does not return every ball straight.
function chaseBot({ hero, enemies, reach, attack, idle, axis, sway, oldest })
{
  const { vm } = window.divPlayground.getState();
  const codes = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', [attack]: `Key${attack.toUpperCase()}` };
  const held = new Set();
  const press = (key, down) =>
  {
    if (down === held.has(key))
    {
      return;
    }
    held[down ? 'add' : 'delete'](key);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, code: codes[key], bubbles: true }));
  };
  let swungAt = 0;
  const timer = setInterval(() =>
  {
    const all = vm.processManager.getAll().filter((p) => !p.isMouse && !p.dead);
    // `oldest`: the hero and its enemies share one process (a fighter): the
    // hero is the first made, the others its enemies.
    const me = oldest ? all.filter((p) => p.name === hero).sort((a, b) => a.id - b.id)[0] : all.find((p) => p.name === hero);
    if (!me)
    {
      return;
    }
    const sideways = axis === 'x';
    const dist = (p) => (sideways ? Math.abs(p.x - me.x) : Math.hypot(p.x - me.x, p.y - me.y));
    const target = all.filter((p) => p !== me && enemies.includes(p.name)).sort((a, b) => dist(a) - dist(b))[0] || idle;
    const dx = target ? target.x - me.x + (target === idle ? 0 : Math.sin(Date.now() / 450) * (sway || 0)) : 0;
    const dy = target && !sideways && target.y !== null ? target.y - me.y : 0;
    press('ArrowLeft', dx < -6);
    press('ArrowRight', dx > 6);
    press('ArrowUp', dy < -6);
    press('ArrowDown', dy > 6);
    if (target && target !== idle && Math.hypot(dx, dy) < reach && Date.now() - swungAt > 380)
    {
      swungAt = Date.now();
      press(attack, true);
      setTimeout(() => press(attack, false), 70);
    }
  }, 30);
  window.__stopBot = () =>
  {
    clearInterval(timer);
    for (const key of [...held])
    {
      press(key, false);
    }
  };
}
// Replaces Math.random with a seeded generator (mulberry32).
function seedRandom()
{
  let seed = 123456789;
  Math.random = () =>
  {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SHOTS = {
  fighter: {
    seconds: 7,
    setup: [['wait', 1500], ['press', 'Enter'], ['wait', 900], ['press', 'Enter'], ['wait', 900], ['press', 'Enter'], ['wait', 900], ['press', 'Enter'], ['wait', 2600]],
    play: [hold('ArrowRight', 500), ['press', 'a'], ['wait', 150], ['press', 's'], ['wait', 150], ['press', 'd'], ['wait', 300],
      ['press', 'z'], ['wait', 200], ['press', 'c'], ['wait', 400], hold('ArrowRight', 300), ['press', 'x'], ['wait', 300],
      ['down', 'ArrowDown'], ['wait', 50], ['down', 'ArrowRight'], ['wait', 50], ['up', 'ArrowDown'], ['press', 'd'], ['up', 'ArrowRight'],
      ['wait', 700], hold('ArrowUp', 100), ['wait', 300], ['press', 'c'], ['wait', 600], ['press', 'a'], ['press', 's'], ['press', 'd']]
  },
  bomber: {
    seconds: 7,
    setup: [['wait', 1500], ['press', 'Enter'], ['wait', 900], ['press', 'Enter'], ['wait', 1500]],
    play: [['press', 'Space'], hold('ArrowDown', 400), hold('ArrowRight', 500), ['wait', 1600], hold('ArrowLeft', 500),
      ['press', 'Space'], hold('ArrowUp', 400), hold('ArrowRight', 300), ['wait', 1500], hold('ArrowDown', 500)]
  },
  strike: {
    seconds: 7,
    setup: [['wait', 7000], ['press', 'Space'], ['wait', 900], ['press', 'Space'], ['wait', 1200]],
    play: [['down', 'ArrowUp'], ['down', 'Space'], ['wait', 1200], hold('ArrowLeft', 500), ['wait', 800], ['press', 'z'],
      ['wait', 500], ['press', 'z'], hold('d', 600), ['up', 'Space'], ['wait', 600], ['press', 'x'], hold('ArrowRight', 600), ['up', 'ArrowUp']]
  },
  'bad-cat': {
    seconds: 7,
    setup: [['wait', 1500], ['press', 'Enter'], ['wait', 1500]],
    play: [hold('ArrowRight', 600), hold('ArrowUp', 200), ['press', 'x'], hold('ArrowRight', 400), hold('Space', 250), ['press', 'x'],
      ['wait', 150], ['press', 'x'], hold('ArrowLeft', 700), hold('ArrowUp', 300), ['press', 'x'], ['wait', 800], hold('ArrowRight', 900), ['press', 'x']]
  },
  'chicken-cannon': {
    seconds: 7,
    setup: [['wait', 1500], ['press', 'Space'], ['wait', 1200]],
    play: [['drag', 400, 300, 330, 190, 400], ['wait', 3000], ['press', '3'], ['drag', 400, 300, 360, 200, 400], ['wait', 900], ['click', 400, 200]]
  },
  'wobbly-walker': {
    seconds: 7,
    setup: [['wait', 1200]],
    play: [hold('q', 300), hold('o', 200), hold('w', 300), hold('p', 200), hold('q', 300), hold('o', 200), hold('w', 300), hold('p', 200),
      hold('q', 300), hold('o', 200), hold('w', 300), hold('p', 200), hold('q', 400), hold('o', 300)]
  },
  'ghost-squad': {
    seconds: 7,
    setup: [['wait', 1500], ['press', 'Space'], ['wait', 2600]],
    play: [hold('ArrowLeft', 700), hold('ArrowUp', 600), ['press', '2'], hold('ArrowRight', 700), hold('ArrowDown', 500), ['press', '3'],
      hold('ArrowUp', 800), ['press', '4'], hold('ArrowLeft', 900), hold('ArrowDown', 700)]
  },
  'net-tanks': {
    seconds: 6,
    setup: [['wait', 1000], ['press', '5'], ['wait', 800]],
    play: [['down', 'w'], ['down', 'ArrowUp'], ['wait', 700], ['press', 'Space'], ['press', 'Enter'], hold('a', 300), hold('ArrowLeft', 300),
      ['wait', 600], ['press', 'Space'], ['press', 'Enter'], hold('d', 400), ['wait', 700], ['press', 'Space'], ['up', 'w'], ['up', 'ArrowUp']]
  },
  racer: {
    seconds: 6,
    setup: [['wait', 1500], ['press', 'Space'], ['wait', 1500]],
    play: [['down', 'ArrowUp'], ['wait', 1200], hold('ArrowLeft', 400), ['wait', 800], hold('ArrowRight', 500), ['wait', 900], hold('ArrowLeft', 300), ['up', 'ArrowUp']]
  },
  pinball: {
    seconds: 6,
    setup: [['wait', 1500], ['press', 'Space'], ['wait', 800]],
    play: [hold('Space', 1000), ['wait', 1200], ['press', 'z'], ['press', 'm'], ['wait', 600], ['press', 'z'], ['wait', 400], ['press', 'm'],
      ['wait', 500], ['press', 'z'], ['press', 'm']]
  },
  sparkroll: {
    seconds: 8,
    setup: [['wait', 1500], ['press', 'Enter'], ['wait', 1800]],
    play: [['down', 'ArrowDown'], ['wait', 150], ['press', 'Space'], ['wait', 120], ['press', 'Space'], ['wait', 120], ['press', 'Space'],
      ['up', 'ArrowDown'], ['down', 'ArrowRight'], ['wait', 450], ['press', 'ArrowDown'], ['wait', 1500], ['press', 'ArrowDown'], ['wait', 2400],
      ['press', 'Space'], ['wait', 2200], ['up', 'ArrowRight']]
  },
  'rusty-leap': {
    seconds: 7,
    setup: [['wait', 5500], ['press', 'Enter'], ['wait', 2900]],
    play: [['down', 'ArrowRight'], ['wait', 700], hold('z', 260), ['wait', 450], hold('z', 160), ['wait', 500], hold('z', 300),
      ['wait', 250], hold('z', 300), ['wait', 600], ['down', 'x'], ['wait', 400], hold('z', 330), ['wait', 500], hold('z', 330),
      ['wait', 500], hold('z', 300), ['up', 'x'], ['up', 'ArrowRight']]
  },
  'keyhole-hop': {
    seconds: 8,
    setup: [['wait', 2200], ['press', 'z'], ['wait', 1400], ['press', 'z'], ['wait', 1600]],
    play: [['wait', 300], ['down', 'ArrowRight'], ['wait', 450], hold('z', 150), ['wait', 250], hold('z', 250), ['wait', 350],
      hold('z', 250), ['wait', 250], hold('z', 250), ['wait', 250], ['up', 'ArrowRight'], ['wait', 150], ['down', 'ArrowRight'],
      hold('z', 450), ['wait', 400], ['up', 'ArrowRight'], ['wait', 250], ['down', 'ArrowRight'], hold('z', 450), ['wait', 1100],
      ['up', 'ArrowRight'], ['press', 'ArrowUp']]
  },
  'sky-shield': {
    seconds: 8,
    setup: [['wait', 1500], ['press', 'Enter'], ['wait', 5200]],
    play: [['click', 150, 230], ['wait', 350], ['click', 330, 190], ['wait', 350], ['click', 500, 250], ['wait', 900],
      ['click', 250, 300], ['wait', 300], ['click', 420, 320], ['wait', 1200], ['click', 120, 280], ['wait', 300],
      ['click', 560, 300], ['wait', 900], ['click', 320, 260], ['wait', 400], ['click', 200, 330]]
  },
  'balloon-pop': {
    seconds: 7,
    setup: [['wait', 2500], ['click', 420, 396], ['wait', 2600]],
    play: [['click', 76, 330], ['wait', 500], ['click', 198, 330], ['wait', 500], ['click', 320, 330], ['wait', 500], ['click', 442, 330],
      ['wait', 500], ['click', 564, 330], ['wait', 600], ['click', 76, 280], ['wait', 500], ['click', 198, 280], ['wait', 500],
      ['click', 320, 280], ['wait', 500], ['click', 442, 280], ['wait', 500], ['click', 564, 280]]
  },
  'beat-bash': {
    seconds: 9,
    setup: [['wait', 2500], ['press', 'Enter'], ['wait', 1500], ['press', 'Enter'], ['wait', 1900]],
    bot: beatBashBot,
    play: [['wait', 9000]]
  },
  'ember-keep': {
    seconds: 5,
    setup: [['wait', 3000], ['press', 'Enter'], ['wait', 1200]],
    bot: chaseBot,
    botArg: { hero: 'hero', enemies: ['slime'], reach: 30, attack: 'z', idle: { x: 400, y: 150 } },
    play: [['wait', 8000]]
  },
  'vector-asteroids': {
    seconds: 6,
    setup: [['wait', 1200], ['press', 'Enter'], ['wait', 800]],
    play: [['down', 'Space'], hold('ArrowLeft', 500), hold('ArrowUp', 400), hold('ArrowRight', 700), hold('ArrowUp', 300), ['wait', 600],
      hold('ArrowLeft', 900), ['up', 'Space']]
  },

  // ── Start-here steps, tutorials, examples and demos ──
  'start1-player': { seconds: 5, setup: [['wait', 800]], play: [hold('ArrowRight', 700), hold('ArrowUp', 500), hold('ArrowLeft', 900), hold('ArrowDown', 500)] },
  'start2-shots': { seconds: 5, setup: [['wait', 800]], play: [['press', 'Space'], hold('ArrowRight', 500), ['press', 'Space'], ['wait', 150], ['press', 'Space'], hold('ArrowUp', 400), ['press', 'Space'], ['wait', 200], ['press', 'Space'], hold('ArrowLeft', 700), ['press', 'Space'], ['wait', 150], ['press', 'Space'], hold('ArrowDown', 300), ['press', 'Space']] },
  'start3-enemies': { seconds: 6, setup: [['wait', 800]], bot: chaseBot, botArg: { hero: 'player', enemies: ['enemy'], reach: 14, attack: 'Space', axis: 'x' }, play: [['wait', 6000]] },
  tutor0a: { seconds: 5, setup: [['wait', 800]], play: [['move', 80, 150, 100], ['drag', 80, 150, 240, 150, 700], ['drag', 240, 150, 160, 120, 600], ['drag', 160, 120, 60, 160, 700]] },
  tutor0b: { seconds: 6, setup: [['wait', 800]], play: [['move', 80, 160, 100], ['drag', 80, 160, 250, 160, 900], ['drag', 250, 160, 120, 150, 900], ['drag', 120, 150, 200, 165, 900]] },
  tutor1a: { seconds: 5, setup: [['wait', 800]], play: [hold('ArrowUp', 700), hold('ArrowLeft', 500), hold('ArrowUp', 800), hold('ArrowRight', 700), hold('ArrowUp', 500)] },
  tutor1b: { seconds: 6, setup: [['wait', 800]], play: [hold('ArrowUp', 500), ['press', 'Control'], hold('ArrowLeft', 400), ['press', 'Control'], hold('ArrowUp', 400), ['press', 'Control'], hold('ArrowRight', 500), ['press', 'Control'], ['wait', 300], ['press', 'Control']] },
  tutor2: { seconds: 5, setup: [['wait', 800]], play: [hold('Space', 150), ['wait', 500], hold('Space', 150), ['wait', 500], hold('Space', 150), ['wait', 500], hold('Space', 150), ['wait', 500], hold('Space', 150), ['wait', 500], hold('Space', 150), ['wait', 500]] },
  tutor3: { seconds: 6, setup: [['wait', 800]], play: [hold('q', 400), hold('p', 400), hold('a', 600), hold('l', 600), hold('q', 500), hold('p', 300), hold('a', 500), hold('l', 500)] },
  tutor4: { seconds: 6, setup: [['wait', 800]], play: [hold('ArrowRight', 600), hold('ArrowDown', 500), hold('ArrowLeft', 700), hold('ArrowUp', 500), hold('ArrowRight', 700), hold('ArrowDown', 400)] },
  tutor5: { seconds: 6, setup: [['wait', 800]], play: [['move', 60, 60, 100], ['move', 260, 60, 300], ['move', 260, 140, 300], ['move', 60, 140, 300], ['move', 160, 100, 300], ['move', 250, 160, 300]] },
  tutor6: { seconds: 5, setup: [['wait', 800]], play: [['click', 160, 240], ['wait', 400], ['click', 320, 260], ['wait', 400], ['click', 480, 240], ['wait', 400], ['click', 320, 340]] },
  'platformer-basic': { seconds: 5, setup: [['wait', 800]], play: [hold('Space', 60), ['wait', 1000], hold('Space', 60), ['wait', 1000], hold('Space', 60), ['wait', 1000], hold('Space', 60), ['wait', 1000]] },
  'frame-timing': { seconds: 4, setup: [['wait', 500]], play: [['wait', 4000]] },
  scroll: { seconds: 6, setup: [['wait', 800]], play: [hold('ArrowRight', 1200), hold('ArrowDown', 900), hold('ArrowLeft', 1200), hold('ArrowUp', 900)] },
  'sound-lab': { seconds: 5, setup: [['wait', 800], ['press', 'm'], ['wait', 300]], play: [['press', '1'], ['wait', 500], ['press', '2'], ['wait', 500], ['press', 'ArrowUp'], ['press', '3'], ['wait', 500], ['press', '4'], ['wait', 500], ['press', '5'], ['wait', 500], ['press', '6'], ['wait', 500]] },
  breakout: { seconds: 10, setup: [['wait', 800], ['press', 'Space'], ['wait', 300]], bot: chaseBot, botArg: { hero: 'paddle', enemies: ['ball'], reach: -1, attack: 'q', axis: 'x' }, play: [['wait', 10000]] },
  platformer: { seconds: 6, setup: [['wait', 800]], play: [hold('ArrowRight', 500), ['press', 'ArrowUp'], ['wait', 500], ['press', 'x'], hold('ArrowRight', 400), ['press', 'ArrowUp'], ['wait', 400], ['press', 'x'], ['wait', 300], hold('ArrowLeft', 900), ['press', 'ArrowUp'], ['wait', 300], ['press', 'x'], hold('ArrowLeft', 500), ['press', 'ArrowUp'], ['wait', 500], hold('ArrowRight', 700)] },
  shmup: { seconds: 6, setup: [['wait', 1000]], play: [['down', 'z'], hold('ArrowLeft', 600), hold('ArrowRight', 1200), hold('ArrowLeft', 900), hold('ArrowRight', 700), ['up', 'z']] },
  bunnymark: { seconds: 5, setup: [['wait', 800]], play: [['press', '1'], ['wait', 600], ['press', '1'], ['wait', 600], ['press', '2'], ['wait', 1500], ['press', '2'], ['wait', 1500]] },
  pathfind: { seconds: 6, setup: [['wait', 800]], play: [['click', 700, 100], ['wait', 1500], ['click', 150, 420], ['wait', 1500], ['click', 600, 400], ['wait', 1500]] },
  'fpg-fnt-game': { seconds: 6, setup: [['wait', 800]], play: [hold('ArrowRight', 800), hold('ArrowDown', 600), hold('ArrowLeft', 1000), hold('ArrowUp', 700), hold('ArrowRight', 800)] },

  // ── The big procedural games ──
  maze: { seconds: 6, setup: [['wait', 1500], ['press', 'Space'], ['wait', 900]], play: [hold('ArrowRight', 700), hold('ArrowDown', 700), hold('ArrowRight', 700), hold('ArrowUp', 600), hold('ArrowRight', 600), hold('ArrowDown', 600)] },
  invaders: { seconds: 6, setup: [['wait', 1500], ['press', 'Space'], ['wait', 1200]], play: [['down', 'Space'], hold('ArrowLeft', 700), hold('ArrowRight', 1400), hold('ArrowLeft', 900), hold('ArrowRight', 600), ['up', 'Space']] },
  'cave-flyer': { seconds: 7, setup: [['wait', 1500]], bot: caveBot, play: [['wait', 7000]] },
  dungeon: { seconds: 7, setup: [['wait', 1500], ['press', 'Space'], ['wait', 1200]], play: [['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowDown'], ['wait', 160], ['press', 'ArrowDown'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160], ['press', 'ArrowRight'], ['wait', 160]] },
  rts: { seconds: 7, setup: [['wait', 3500], ['press', 'Space'], ['wait', 2500]], play: [['drag', 170, 350, 330, 400, 300], ['wait', 300], ['click', 300, 260], ['wait', 1500], ['press', '1'], ['wait', 1000], ['press', '2'], ['wait', 1500], ['click', 380, 250], ['wait', 1500]] },
  artillery: { seconds: 8, setup: [['wait', 3000], ['press', 'd'], ['wait', 1500]], play: [['wait', 8000]] },
  'tower-defense': { seconds: 8, setup: [['wait', 1500], ['press', 'Space'], ['wait', 1200]], play: [['press', '1'], ['click', 482, 204], ['wait', 700], ['press', '1'], ['click', 300, 212], ['wait', 700], ['press', 'n'], ['wait', 5500]] },
  colony: { seconds: 7, setup: [['wait', 5000], ['press', 'Space'], ['wait', 1200]], play: [['drag', 60, 140, 180, 200, 400], ['wait', 600], ['drag', 280, 100, 360, 140, 400], ['wait', 600], ['press', 'z'], ['wait', 4500]] },
  lemmings: { seconds: 7, setup: [['wait', 1500], ['press', 'Enter'], ['wait', 1800]], play: [['press', 'f'], ['wait', 7000]] },
  raptor: { seconds: 6, setup: [['wait', 1500], ['press', 'Space'], ['wait', 1200], ['press', 'Space'], ['wait', 1200]], play: [['down', 'z'], hold('ArrowLeft', 600), hold('ArrowRight', 1200), hold('ArrowLeft', 900), hold('ArrowRight', 600), ['up', 'z']] },
  sandbox: { seconds: 7, setup: [['wait', 1500], ['press', 'Space'], ['wait', 7500]], play: [hold('ArrowRight', 900), ['press', 'Space'], hold('ArrowRight', 600), ['drag', 330, 300, 330, 300, 900], hold('ArrowLeft', 900), ['press', 'Space']] },
  tetris: { seconds: 7, setup: [['wait', 1500], ['press', 'Enter'], ['wait', 1500]], play: [hold('ArrowLeft', 200), ['press', 'ArrowUp'], ['press', 'Space'], ['wait', 500], hold('ArrowRight', 300), ['press', 'ArrowUp'], ['press', 'Space'], ['wait', 500], hold('ArrowLeft', 500), ['press', 'Space'], ['wait', 500], hold('ArrowRight', 500), ['press', 'Space'], ['wait', 600]] },
  aquarium: { seconds: 7, setup: [['wait', 3500]], play: [['click', 300, 200], ['wait', 700], ['click', 480, 300], ['wait', 700], ['press', '1'], ['press', '2'], ['wait', 800], ['click', 200, 320], ['wait', 800], ['press', 'm'], ['wait', 2500]] },
  match3: { seconds: 8, setup: [['wait', 1500], ['press', 'Enter'], ['wait', 1800]], play: [['run', (api) => sugarSwap(api, 8000)]] },
  karate: { seconds: 7, setup: [['wait', 1500], ['press', 'Enter'], ['wait', 1500], ['press', 'Enter'], ['wait', 2000]], play: [hold('ArrowRight', 500), ['press', 'Space'], ['wait', 300], ['press', 'Space'], ['wait', 300], hold('ArrowRight', 300), ['press', 'z'], ['wait', 400], ['press', 'Space'], ['wait', 400], hold('ArrowLeft', 400), ['press', 'z']] },
  brawler: { seconds: 8, setup: [['wait', 1500], ['press', 'Enter'], ['wait', 1500], ['press', 'Enter'], ['wait', 2500]], bot: chaseBot, botArg: { hero: 'fighter', enemies: ['fighter'], oldest: true, reach: 46, attack: 'z', idle: { x: 99999, y: null } }, play: [['wait', 8000]] },

  // ── Physics ──
  'physics-sandbox': { seconds: 6, setup: [['wait', 800]], play: [['click', 200, 120], ['wait', 300], ['click', 320, 100], ['wait', 300], ['press', 'p'], ['wait', 900], ['click', 440, 120], ['wait', 300], ['press', 'w'], ['wait', 2500]] },
  slingshot: { seconds: 8, setup: [['wait', 1500], ['click', 400, 230], ['wait', 1500]], play: [['drag', 168, 314, 70, 376, 500], ['wait', 3000], ['drag', 168, 314, 80, 360, 500], ['wait', 3500]] },
  'physics-lab': { seconds: 7, setup: [['wait', 800]], play: [['press', '2'], ['wait', 1500], ['press', '3'], ['wait', 1500], ['press', '1'], ['press', 'Space'], ['wait', 2500]] },
  hillclimb: { seconds: 5, setup: [['wait', 1500], ['press', 'Enter'], ['wait', 1200]], play: [['down', 'ArrowRight'], ['wait', 3000], ['press', 'ArrowLeft'], ['wait', 1500], ['up', 'ArrowRight']] },
  arkanoid: { seconds: 7, setup: [['wait', 1500], ['press', 'Space'], ['wait', 1000], ['press', 'Space'], ['wait', 300]], play: [hold('ArrowLeft', 500), hold('ArrowRight', 800), hold('ArrowLeft', 700), hold('ArrowRight', 700), hold('ArrowLeft', 500), hold('ArrowRight', 600)] },
  bubbles: { seconds: 7, setup: [['wait', 1500], ['press', 'Enter'], ['wait', 1500]], play: [hold('ArrowLeft', 400), ['press', 'Space'], ['wait', 1000], hold('ArrowRight', 800), ['press', 'Space'], ['wait', 1000], hold('ArrowRight', 300), ['press', 'Space'], ['wait', 1200], hold('ArrowLeft', 900), ['press', 'Space']] }
};

function option(name, fallback)
{
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.div': 'text/plain', '.md': 'text/markdown' };

function startServer()
{
  const server = http.createServer(async (req, res) =>
  {
    try
    {
      let file = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!file.startsWith(ROOT))
      {
        res.writeHead(403).end();
        return;
      }
      if ((await stat(file)).isDirectory())
      {
        file = join(file, 'index.html');
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    }
    catch
    {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function runSteps(page, steps)
{
  const box = async () => page.$eval('#game', (c) =>
  {
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, sx: r.width / c.width, sy: r.height / c.height };
  });
  for (const step of steps)
  {
    const [kind, a, b, c, d, e] = step;
    if (kind === 'wait')
    {
      await page.waitForTimeout(a);
    }
    else if (kind === 'press')
    {
      // Held for a few frames: a game that reads key_pressed() once a frame
      // does not see a key that goes down and up within one.
      await page.keyboard.down(a);
      await page.waitForTimeout(40);
      await page.keyboard.up(a);
    }
    else if (kind === 'down')
    {
      await page.keyboard.down(a);
    }
    else if (kind === 'up')
    {
      await page.keyboard.up(a);
    }
    else if (kind === 'hold')
    {
      await page.keyboard.down(a);
      await page.waitForTimeout(b);
      await page.keyboard.up(a);
    }
    else if (kind === 'run')
    {
      // A function for what steps cannot say: it gets the page and a
      // click(x, y) in the game's own coordinates.
      await a({
        page,
        click: async (x, y) =>
        {
          const g = await box();
          await page.mouse.click(g.x + x * g.sx, g.y + y * g.sy, { delay: 60 });
        }
      });
    }
    else if (kind === 'move')
    {
      const g = await box();
      await page.mouse.move(g.x + a * g.sx, g.y + b * g.sy, { steps: 12 });
      await page.waitForTimeout(c ?? 0);
    }
    else if (kind === 'drag' || kind === 'click')
    {
      const g = await box();
      await page.mouse.move(g.x + a * g.sx, g.y + b * g.sy);
      await page.mouse.down();
      if (kind === 'drag')
      {
        await page.mouse.move(g.x + c * g.sx, g.y + d * g.sy, { steps: 10 });
        await page.waitForTimeout(e);
      }
      await page.mouse.up();
    }
  }
}

async function record(page, seconds, fps, width)
{
  await page.evaluate((w) =>
  {
    const src = document.getElementById('game');
    const h = Math.round(src.height * w / src.width);
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const ctx = small.getContext('2d', { willReadFrequently: true });
    window.__grab = () =>
    {
      ctx.drawImage(src, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let binary = '';
      for (let i = 0; i < data.length; i += 0x8000)
      {
        binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
      }
      return { w, h, b64: btoa(binary) };
    };
  }, width);
  const frames = [];
  const step = 1000 / fps;
  const start = Date.now();
  let next = start;
  while (Date.now() - start < seconds * 1000)
  {
    const shot = await page.evaluate(() => window.__grab());
    frames.push({ ...shot, t: Date.now() });
    next += step;
    const wait = next - Date.now();
    if (wait > 0)
    {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  return frames;
}

function encode(frames)
{
  const { w, h } = frames[0];
  const pixels = frames.map((f) => new Uint8Array(Buffer.from(f.b64, 'base64')));
  // One palette for the whole clip, from a sample of its frames.
  const sampleEvery = Math.max(1, Math.floor(frames.length / 8));
  const sample = pixels.filter((_, i) => i % sampleEvery === 0);
  const joined = new Uint8Array(sample.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of sample)
  {
    joined.set(p, offset);
    offset += p.length;
  }
  const palette = quantize(joined, 256);
  const gif = GIFEncoder();
  pixels.forEach((p, i) =>
  {
    const delay = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 100;
    gif.writeFrame(applyPalette(p, palette), w, h, i === 0 ? { palette, delay } : { delay });
  });
  gif.finish();
  return gif.bytes();
}

async function main()
{
  const names = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
  const ids = names.length > 0 ? names : Object.keys(SHOTS);
  const outDir = resolve(ROOT, option('out', 'docs/media'));
  const width = Number(option('width', 320));
  const fps = Number(option('fps', 8));

  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  await mkdir(outDir, { recursive: true });
  try
  {
    for (const id of ids)
    {
      const shot = SHOTS[id];
      if (!shot)
      {
        console.log(`skip ${id}: no script for it in tools/capture.mjs`);
        continue;
      }
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      const problems = [];
      page.on('pageerror', (e) => problems.push(e.message));
      page.on('console', (m) =>
      {
        if (m.type() === 'error' || m.type() === 'warning')
        {
          problems.push(m.text());
        }
      });
      // A fixed random seed, so a game generates the same world each time
      // and the scripts can aim at it.
      await page.addInitScript(seedRandom);
      await page.goto(`${base}/playground/#p=${id}`);
      await page.waitForFunction(() => window.divPlayground?.getState()?.runtime, null, { timeout: 15000 });
      await page.click('#game');
      await runSteps(page, shot.setup);
      if (shot.bot)
      {
        await page.evaluate(shot.bot, shot.botArg);
      }
      const recording = record(page, shot.seconds, fps, width);
      await runSteps(page, shot.play);
      const frames = await recording;
      if (shot.bot)
      {
        await page.evaluate(() => window.__stopBot?.());
      }
      const bytes = encode(frames);
      const file = join(outDir, `${id}.gif`);
      await writeFile(file, bytes);
      if (process.argv.includes('--check'))
      {
        await (await page.$('#game')).screenshot({ path: join(outDir, `${id}-end.png`) });
      }
      console.log(`${id}: ${frames.length} frames, ${frames[0].w}x${frames[0].h}, ${(bytes.length / 1024).toFixed(0)} KB${problems.length ? `, ${problems.length} console problems: ${problems[0]}` : ''}`);
      await page.close();
    }
  }
  finally
  {
    await browser.close();
    server.close();
  }
}

// Run only when started from the command line, so the scripts above can
// be imported (tests, other tools) without recording anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
{
  await main();
}
