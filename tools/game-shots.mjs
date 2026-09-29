// The games' play scripts and the page plumbing shared by the tools that
// record them: tools/capture.mjs (README GIFs, in real time) and
// tools/trailer/ (trailer footage, on a virtual clock).

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Steps: ['wait', ms], ['press', key], ['down', key], ['up', key],
// ['hold', key, ms], ['drag', x1, y1, x2, y2, ms] and ['click', x, y] in
// the game's own coordinates. `setup` runs before recording, `play` while
// it records for `seconds`.
export const hold = (key, ms) => ['hold', key, ms];
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
  'vector-asteroids': {
    seconds: 6,
    setup: [['wait', 1200], ['press', 'Enter'], ['wait', 800]],
    play: [['down', 'Space'], hold('ArrowLeft', 500), hold('ArrowUp', 400), hold('ArrowRight', 700), hold('ArrowUp', 300), ['wait', 600],
      hold('ArrowLeft', 900), ['up', 'Space']]
  }
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.div': 'text/plain', '.md': 'text/markdown' };

export function startServer()
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

// `clock` changes how time passes: by default steps wait in real time;
// tools/trailer/ passes one whose wait(ms) steps a virtual clock instead
// (and whose press(key) holds the key for a frame).
export async function runSteps(page, steps, clock = realClock(page))
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
      await clock.wait(a);
    }
    else if (kind === 'press')
    {
      await clock.press(a);
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
      await clock.wait(b);
      await page.keyboard.up(a);
    }
    else if (kind === 'drag' || kind === 'click')
    {
      const g = await box();
      await page.mouse.move(g.x + a * g.sx, g.y + b * g.sy);
      await page.mouse.down();
      if (kind === 'drag')
      {
        await clock.move(g.x + a * g.sx, g.y + b * g.sy, g.x + c * g.sx, g.y + d * g.sy, 10);
        await clock.wait(e);
      }
      await page.mouse.up();
    }
  }
}

export function realClock(page)
{
  return {
    wait: (ms) => page.waitForTimeout(ms),
    press: (key) => page.keyboard.press(key),
    move: (x0, y0, x1, y1, steps) => page.mouse.move(x1, y1, { steps })
  };
}

// The value of `--name value` on the command line, or `fallback`.
export function option(name, fallback)
{
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
