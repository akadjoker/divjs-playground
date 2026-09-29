// Tutorial video: DivJS Blocks, lesson 5 "Free play".
// See blocks-1.mjs for how a lesson script works.

import { blocksUrl, openLesson, rectOf, blockRect, center, revealBlock, play, allowTooltips, childId } from '../blocks.mjs';

const SHIP = { type: 'div_sprite', name: 'ship' };
const SHOT = { type: 'div_sprite', name: 'shot' };
const ROCK = { type: 'div_sprite', name: 'rock' };

// Points at a sprite's stack (scrolled into view) with a ring round its top.
async function pointAt(t, spec)
{
  await revealBlock(t, spec, { margin: 40, top: 40 });
  const r = await blockRect(t, spec);
  const ws = await rectOf(t, '#workspace');
  const top = { x: r.x, y: r.y, w: Math.min(r.w, 420), h: Math.min(r.h, 170) };
  t.focus({ x: ws.x, y: Math.max(ws.y, r.y - 40), w: ws.w, h: Math.min(ws.h, r.h + 80) }, { seconds: 0.9 });
  t.highlight(top);
  await t.moveTo({ x: r.x + 60, y: r.y + 24 });
}

export default {
  id: 'blocks-5',
  url: (lang) => blocksUrl(lang),
  ready: async (t) =>
  {
    await openLesson(t, 4, { scale: 0.8 });
  },
  steps: [
    {
      id: 'intro',
      async run(t)
      {
        t.cursorHidden = true;
        t.card('intro', { fade: 0.01 });
        await t.lineEnd(0.1);
        t.hideCard({ fade: 0.7 });
        t.cursorHidden = false;
      }
    },
    {
      id: 'start',
      async run(t)
      {
        const ws = await rectOf(t, '#workspace');
        const lesson = await rectOf(t, '.lesson');
        t.focus([lesson, { x: ws.x, y: ws.y, w: ws.w, h: 200 }], { seconds: 1.2 });
        await t.cue('start', -0.3);
        t.highlight(await blockRect(t, 'div_start'));
        await t.moveTo(center(await blockRect(t, 'div_start')));
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'solution',
      async run(t)
      {
        const button = await rectOf(t, '#solutionBtn');
        t.focus([button, { ...(await rectOf(t, '#workspace')), h: 300 }]);
        await t.moveTo(center(button));
        await t.cue('click', -0.1);
        await t.click();
        await t.wait(0.4);
        const ws = await rectOf(t, '#workspace');
        t.focus(ws);
        await t.cue('ship', -0.3);
        await t.moveTo({ x: ws.x + ws.w * 0.5, y: ws.y + ws.h * 0.4 });
        await t.lineEnd();
      }
    },
    {
      id: 'ship',
      async run(t)
      {
        await pointAt(t, SHIP);
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'shot',
      async run(t)
      {
        await pointAt(t, SHOT);
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'rock',
      async run(t)
      {
        await pointAt(t, ROCK);
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'run',
      async run(t)
      {
        const button = await rectOf(t, '#runBtn');
        t.focus([button, await rectOf(t, '#game')], { seconds: 0.9 });
        await t.moveTo(center(button), { seconds: 0.8 });
        await t.cue('click');
        await t.click();
        await play(t, [], { at: 'game' });
      }
    },
    {
      id: 'playing',
      async run(t)
      {
        const game = await rectOf(t, '#game');
        t.focus(game);
        await t.moveTo({ x: game.x + game.w + 6, y: game.y + game.h * 0.8 }, { seconds: 0.6 });
        const fire = (n) => Array.from({ length: n }, () => [['Space', 0.08], ['', 0.25]]).flat();
        await play(t, [...fire(3), ['ArrowLeft', 0.5], ...fire(3), ['ArrowUp', 0.5], ['ArrowRight', 0.7], ...fire(4), ['ArrowLeft', 0.3],
          ...fire(4), ['ArrowUp', 0.4], ['ArrowRight', 0.4], ...fire(4)], { click: false });
      }
    },
    {
      id: 'tips',
      async run(t)
      {
        await allowTooltips(t);
        // The ship's first block, "look like a triangle": its tooltip.
        const look = await childId(t, SHIP, 'DO');
        await revealBlock(t, look, { own: true, margin: 200, top: 60 });
        const r = await blockRect(t, look, { own: true });
        const ws = await rectOf(t, '#workspace');
        t.focus({ x: ws.x, y: r.y - 40, w: Math.min(ws.w, 700), h: 260 });
        await t.cue('hover', -0.6);
        await t.moveTo({ x: r.x + 40, y: r.y + r.h * 0.5 });
        await t.lineEnd();
      }
    },
    {
      id: 'playground',
      async run(t)
      {
        const link = await rectOf(t, '#openLink');
        t.focus([link, await rectOf(t, '#runBtn')]);
        await t.cue('link', -0.3);
        t.highlight(link, { pad: 4 });
        await t.moveTo({ x: link.x + link.w * 0.6, y: link.y + link.h * 0.65 });
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'outro',
      async run(t)
      {
        t.wide(1.3);
        await t.cue('next', -0.3);
        t.card('outro', { banner: true });
        const game = await rectOf(t, '#game');
        await t.moveTo({ x: game.x + game.w * 0.9, y: game.y + game.h + 20 }, { seconds: 1.0 });
      }
    }
  ]
};
