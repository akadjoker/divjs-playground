// Tutorial video: DivJS Blocks, lesson 2 "Move it with the arrow keys".
// See blocks-1.mjs for how a lesson script works.

import { blocksUrl, openLesson, rectOf, blockRect, blocksRect, center, openCategory, drag, pick, typeNumber, copyPaste,
  childId, revealBlock, workArea, play, scrollCodeTo, codeLineRect, unionRect } from '../blocks.mjs';

const SPRITE = { type: 'div_sprite', name: 'player' };

// Blocks made on the way, by name.
const made = {};

export default {
  id: 'blocks-2',
  url: (lang) => blocksUrl(lang),
  ready: async (t) =>
  {
    await openLesson(t, 1, { column: 300, scale: 0.8 });
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
      id: 'recap',
      async run(t)
      {
        t.focus(await workArea(t, ['div_start', SPRITE]), { seconds: 1.4 });
        await t.cue('player', -0.3);
        t.highlight(await blockRect(t, SPRITE));
        await t.moveTo(center(await blockRect(t, 'div_look')));
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'forever',
      async run(t)
      {
        await openCategory(t, 'control', { at: 'click' });
        made.forever = await drag(t, 'div_forever', { block: 'div_look', next: true }, { at: 'grab' });
        await t.cue('frame', -0.2);
        t.highlight(await blockRect(t, made.forever));
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'if',
      async run(t)
      {
        await openCategory(t, 'control', { at: 'click' });
        made.if1 = await drag(t, 'div_if', { block: made.forever, input: 'DO' }, { at: 'grab' });
      }
    },
    {
      id: 'key',
      async run(t)
      {
        await openCategory(t, 'sensing', { at: 'click' });
        made.key1 = await drag(t, 'div_key', { block: made.if1, input: 'COND' }, { at: 'grab' });
      }
    },
    {
      id: 'move',
      async run(t)
      {
        await openCategory(t, 'motion', { at: 'click' });
        made.x1 = await drag(t, 'div_change_x', { block: made.if1, input: 'DO' }, { at: 'grab' });
        await typeNumber(t, made.x1, 'VALUE', 3, { at: 'num' });
      }
    },
    {
      id: 'meaning',
      async run(t)
      {
        t.focus(await blocksRect(t, [made.if1]), { zoom: 2.2 });
        await t.cue('key', -0.2);
        t.highlight(await blockRect(t, made.key1));
        await t.moveTo(center(await blockRect(t, made.key1)));
        await t.cue('x', -0.2);
        t.highlight(await blockRect(t, made.x1));
        await t.moveTo(center(await blockRect(t, made.x1)));
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'left',
      async run(t)
      {
        t.focus(await workArea(t, [SPRITE], { flyout: 0 }));
        await t.cue('copy', -0.3);
        made.if2 = await copyPaste(t, made.if1);
        made.if2 = await drag(t, null, { block: made.if1, next: true }, { block: made.if2, seconds: 0.9 });
        await pick(t, await childId(t, made.if2, 'COND'), 'KEY', '_left');
        await typeNumber(t, await childId(t, made.if2, 'DO'), 'VALUE', -3);
      }
    },
    {
      id: 'up',
      async run(t)
      {
        await revealBlock(t, made.if2, { margin: 190 });
        t.focus(await workArea(t, [made.if2], { extra: [await blockRect(t, 'div_look')] }));
        await openCategory(t, 'control');
        made.if3 = await drag(t, 'div_if', { block: made.if2, next: true });
        await openCategory(t, 'sensing');
        made.key3 = await drag(t, 'div_key', { block: made.if3, input: 'COND' });
        await pick(t, made.key3, 'KEY', '_up');
        await openCategory(t, 'motion');
        made.y3 = await drag(t, 'div_change_y', { block: made.if3, input: 'DO' });
        await typeNumber(t, made.y3, 'VALUE', -3);
      }
    },
    {
      id: 'down',
      async run(t)
      {
        await revealBlock(t, made.if3, { margin: 170 });
        t.focus(await workArea(t, [made.if2, made.if3], { flyout: 0 }));
        await t.cue('copy', -0.3);
        made.if4 = await copyPaste(t, made.if3);
        made.if4 = await drag(t, null, { block: made.if3, next: true }, { block: made.if4, seconds: 0.9 });
        await pick(t, await childId(t, made.if4, 'COND'), 'KEY', '_down');
        await typeNumber(t, await childId(t, made.if4, 'DO'), 'VALUE', 3);
        t.focus(await workArea(t, [made.if1, made.if4], { flyout: 0 }));
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
        t.focus(await rectOf(t, '#game'));
        const game = await rectOf(t, '#game');
        await t.moveTo({ x: game.x + game.w + 6, y: game.y + game.h * 0.8 }, { seconds: 0.6 });
        await play(t, [['ArrowRight', 0.8], ['ArrowUp', 0.6], ['ArrowLeft', 1.3], ['ArrowDown', 0.9], ['ArrowRight', 0.5]], { click: false });
      }
    },
    {
      id: 'code',
      async run(t)
      {
        const panel = await rectOf(t, '.code-pane');
        t.focus({ ...panel, h: 280 });
        await t.moveTo({ x: panel.x + panel.w * 0.62, y: panel.y + 18 });
        await t.cue('if', -0.9);
        const first = await scrollCodeTo(t, 'IF (key(_right))', { place: 0.15 });
        const last = await codeLineRect(t, 'y = y + 3;');
        const lines = unionRect([first, last, { x: first.x, y: first.y, w: 260, h: 10 }]);
        t.focus({ x: panel.x, y: lines.y - 30, w: panel.w, h: lines.h + 60 });
        t.highlight({ x: lines.x - 4, y: lines.y - 2, w: lines.w + 8, h: lines.h + 4 });
        await t.moveTo({ x: first.x + 200, y: first.y + first.h * 0.7 });
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
