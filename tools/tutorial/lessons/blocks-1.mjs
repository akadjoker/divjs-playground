// Tutorial video: DivJS Blocks, lesson 1 "Make a shape appear".
//
// Each step says the line with its id (blocks-1.<language>.json) and acts
// while it is said; {name} markers in the line are the cues it waits for.
// See ../director.mjs for what `t` can do and ../blocks.mjs for the
// editor's own actions.

import { blocksUrl, openLesson, rectOf, blockRect, fieldRect, center, openCategory, dragBlock, scrollCodeTo, codeLineRect } from '../blocks.mjs';

// The part of the editor the blocks steps happen in: the toolbox, the
// flyout that opens beside it and the blocks.
async function blocksArea(t)
{
  const toolbox = await rectOf(t, '.blocklyToolbox');
  const start = await blockRect(t, 'div_start');
  const sprite = await blockRect(t, 'div_sprite');
  // Room for the blocks dropped into "define sprite" (they are wider).
  const right = Math.max(sprite.x + Math.max(sprite.w, 330), toolbox.x + toolbox.w + 380) + 24;
  const bottom = Math.max(start.y + start.h, sprite.y + sprite.h) + 50;
  return { x: toolbox.x, y: toolbox.y, w: right - toolbox.x, h: bottom - toolbox.y };
}

// A point on a block's top row, a little in from its left end.
async function blockTop(t, type)
{
  const r = await blockRect(t, type);
  return { x: r.x + 48, y: r.y + 30 };
}

export default {
  id: 'blocks-1',
  url: (lang) => blocksUrl(lang),
  ready: async (t) =>
  {
    // Room for "create sprite player at x 160 y 120" beside "define sprite".
    await openLesson(t, 0, { column: 330 });
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
      id: 'tour',
      async run(t)
      {
        t.focus(await blocksArea(t), { seconds: 1.4 });
        await t.cue('start', -0.3);
        t.highlight(await blockRect(t, 'div_start'));
        await t.moveTo(await blockTop(t, 'div_start'));
        await t.cue('sprite', -0.3);
        t.highlight(await blockRect(t, 'div_sprite'));
        await t.moveTo(await blockTop(t, 'div_sprite'));
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'looks',
      async run(t)
      {
        await openCategory(t, 'looks', { at: 'click' });
      }
    },
    {
      id: 'drag-look',
      async run(t)
      {
        await dragBlock(t, 'div_look', 'div_sprite', 'DO', { at: 'grab', dropAt: 'snap' });
        t.highlight(await blockRect(t, 'div_sprite'));
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'program',
      async run(t)
      {
        await t.wait(0.3);
        await t.moveTo(await blockTop(t, 'div_look'));
        await t.wait(1.2);
        await openCategory(t, 'program', { at: 'click' });
      }
    },
    {
      id: 'drag-create',
      async run(t)
      {
        await dragBlock(t, 'div_create', 'div_start', 'DO', { at: 'grab', dropAt: 'snap' });
        t.highlight(await blockRect(t, 'div_start'));
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'xy',
      async run(t)
      {
        const screen = await rectOf(t, '#game');
        t.focus([screen, await rectOf(t, '#runBtn')]);
        await t.cue('w', -0.4);
        t.highlight(screen);
        await t.moveTo({ x: screen.x + screen.w / 2, y: screen.y + screen.h + 4 });
        await t.cue('so', -0.5);
        t.highlight(null);
        t.focus(await blocksArea(t));
        await t.cue('x', -0.4);
        const x = await fieldRect(t, 'div_create', 'X');
        t.highlight(x, { pad: 4 });
        await t.moveTo({ x: x.x + x.w * 0.6, y: x.y + x.h * 0.8 });
        await t.cue('y', -0.3);
        const y = await fieldRect(t, 'div_create', 'Y');
        t.highlight(y, { pad: 4 });
        await t.moveTo({ x: y.x + y.w * 0.6, y: y.y + y.h * 0.8 });
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
      }
    },
    {
      id: 'result',
      async run(t)
      {
        const screen = await rectOf(t, '#game');
        t.focus(screen);
        // The circle: 30 of the screen's 320 pixels, in its middle.
        const middle = center(screen);
        const r = 22 * screen.w / 320;
        await t.moveTo({ x: middle.x + screen.w * 0.22, y: middle.y + screen.h * 0.22 });
        await t.cue('circle', -0.2);
        t.highlight({ x: middle.x - r, y: middle.y - r, w: 2 * r, h: 2 * r });
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'code',
      async run(t)
      {
        const panel = await rectOf(t, '.code-pane');
        t.focus({ ...panel, h: 280 });
        await t.moveTo({ x: panel.x + panel.w * 0.62, y: panel.y + 18 });
        await t.cue('code', -0.2);
        t.highlight(await rectOf(t, '#code'));
        await t.cue('process', -0.9);
        t.highlight(null);
        const first = await scrollCodeTo(t, 'PROCESS player(x, y);', { place: 0.2 });
        const look = await codeLineRect(t, 'graph = make_look(');
        const lines = { x: first.x - 4, y: first.y - 2, w: Math.max(first.w, look.w + look.x - first.x) + 8, h: look.y + look.h - first.y + 4 };
        t.focus({ x: panel.x, y: lines.y - 40, w: panel.w, h: lines.h + 80 });
        t.highlight(lines);
        await t.moveTo({ x: look.x + look.w + 10, y: look.y + look.h * 0.7 });
        await t.cue('create', -0.9);
        t.highlight(null);
        const create = await scrollCodeTo(t, 'player(160, 120);', { place: 0.45 });
        t.focus({ x: panel.x, y: create.y - 90, w: panel.w, h: create.h + 180 });
        t.highlight(create);
        await t.moveTo({ x: create.x + create.w + 10, y: create.y + create.h * 0.7 });
        // Under the numbers as they are said.
        await t.cue('at', -0.2);
        const numbers = await codeLineRect(t, '160, 120');
        await t.moveTo({ x: numbers.x + 20, y: numbers.y + numbers.h * 0.9 }, { seconds: 0.5 });
        await t.moveTo({ x: numbers.x + 80, y: numbers.y + numbers.h * 0.9 }, { seconds: 1.2 });
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
        const next = await rectOf(t, '#nextBtn');
        await t.moveTo({ x: next.x + next.w * 0.7, y: next.y + next.h * 0.65 }, { seconds: 1.0 });
        t.highlight(next, { pad: 4 });
      }
    }
  ]
};
