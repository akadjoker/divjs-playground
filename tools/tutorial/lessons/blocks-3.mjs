// Tutorial video: DivJS Blocks, lesson 3 "Catch the coin".
// See blocks-1.mjs for how a lesson script works.

import { blocksUrl, openLesson, rectOf, blockRect, center, openCategory, drag, pick, typeNumber, childId, revealBlock, workArea,
  play, chase, scrollCodeTo, codeLineRect, unionRect } from '../blocks.mjs';

const PLAYER = { type: 'div_sprite', name: 'player' };
const COIN = { type: 'div_sprite', name: 'coin' };
const made = {};

// The camera on the blocks being built (they grow as blocks go in).
async function follow(t)
{
  t.focus(await workArea(t, ['div_start', COIN]), { seconds: 0.8 });
}

export default {
  id: 'blocks-3',
  url: (lang) => blocksUrl(lang),
  ready: async (t) =>
  {
    // The player's blocks (lesson 2) are folded up: this lesson does not
    // touch them.
    await openLesson(t, 2, { scale: 0.8, columns: [['div_start', PLAYER], [COIN]], collapse: [PLAYER], column: 330 });
    made.createPlayer = await childId(t, 'div_start', 'DO');
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
        t.focus(await workArea(t, ['div_start', PLAYER, COIN]), { seconds: 1.4 });
        t.highlight(await blockRect(t, PLAYER));
        await t.moveTo(center(await blockRect(t, PLAYER)));
        await t.cue('coin', -0.3);
        t.highlight(await blockRect(t, COIN));
        await t.moveTo(center(await blockRect(t, COIN)));
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'create',
      async run(t)
      {
        await openCategory(t, 'program', { at: 'click' });
        made.createCoin = await drag(t, 'div_create', { block: made.createPlayer, next: true }, { nth: 0, at: 'grab' });
        await follow(t);
        await pick(t, made.createCoin, 'SPRITE', 'coin', { at: 'pick' });
        await typeNumber(t, made.createCoin, 'X', 60, { at: 'x' });
        await typeNumber(t, made.createCoin, 'Y', 60);
      }
    },
    {
      id: 'look',
      async run(t)
      {
        await openCategory(t, 'looks', { at: 'click' });
        made.look = await drag(t, 'div_look', { block: COIN, input: 'DO' }, { at: 'grab' });
        await follow(t);
        await typeNumber(t, made.look, null, 14, { field: 'SIZE', at: 'size' });
        await pick(t, made.look, 'COLOUR', 'yellow', { at: 'colour' });
      }
    },
    {
      id: 'random',
      async run(t)
      {
        await openCategory(t, 'motion', { at: 'click' });
        made.random = await drag(t, 'div_goto_random', { block: made.look, next: true }, { at: 'grab' });
        await follow(t);
      }
    },
    {
      id: 'loop',
      async run(t)
      {
        await openCategory(t, 'control', { at: 'click' });
        made.forever = await drag(t, 'div_forever', { block: made.random, next: true });
        await openCategory(t, 'control');
        made.if = await drag(t, 'div_if', { block: made.forever, input: 'DO' }, { at: 'if' });
        await follow(t);
      }
    },
    {
      id: 'touching',
      async run(t)
      {
        await openCategory(t, 'sensing', { at: 'click' });
        made.touching = await drag(t, 'div_touching', { block: made.if, input: 'COND' }, { at: 'grab' });
        await follow(t);
        await pick(t, made.touching, 'SPRITE', 'player', { at: 'player' });
        t.highlight(await blockRect(t, made.touching), { pad: 4 });
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'score',
      async run(t)
      {
        await openCategory(t, 'variables', { at: 'click' });
        made.score = await drag(t, 'div_var_change', { block: made.if, input: 'DO' }, { at: 'grab' });
        await follow(t);
      }
    },
    {
      id: 'sound',
      async run(t)
      {
        await openCategory(t, 'sound', { at: 'click' });
        made.sound = await drag(t, 'div_sound', { block: made.score, next: true }, { at: 'grab' });
        await follow(t);
      }
    },
    {
      id: 'jump',
      async run(t)
      {
        await revealBlock(t, made.sound, { margin: 90 });
        t.focus(await workArea(t, [COIN]));
        await openCategory(t, 'motion', { at: 'click' });
        made.jump = await drag(t, 'div_goto_random', { block: made.sound, next: true }, { at: 'grab' });
      }
    },
    {
      id: 'show',
      async run(t)
      {
        await revealBlock(t, 'div_start', { margin: 120, top: 60 });
        t.focus(await workArea(t, ['div_start', PLAYER]));
        await openCategory(t, 'control', { at: 'click' });
        made.showLoop = await drag(t, 'div_forever', { block: made.createCoin, next: true }, { at: 'forever' });
        await openCategory(t, 'variables');
        made.show = await drag(t, 'div_var_show', { block: made.showLoop, input: 'DO' }, { at: 'show' });
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
        await chase(t, 'player', 'coin', Math.max(4, t.lineEndTime(0.3) - t.time));
      }
    },
    {
      id: 'code',
      async run(t)
      {
        const panel = await rectOf(t, '.code-pane');
        t.focus({ ...panel, h: 280 });
        await t.moveTo({ x: panel.x + panel.w * 0.62, y: panel.y + 18 });
        await t.cue('coin', -0.9);
        const head = await scrollCodeTo(t, 'PROCESS coin(x, y);', { place: 0.05 });
        t.focus({ x: panel.x, y: head.y - 30, w: panel.w, h: 300 });
        t.highlight({ x: head.x - 4, y: head.y - 2, w: head.w + 8, h: head.h + 4 });
        await t.cue('touch', -0.3);
        const hit = await codeLineRect(t, 'IF (collision(TYPE player))');
        const last = await codeLineRect(t, 'play_sound(sfx(sfx_coin));');
        const lines = unionRect([hit, last]);
        t.highlight({ x: lines.x - 4, y: lines.y - 2, w: lines.w + 8, h: lines.h + 4 });
        await t.moveTo({ x: hit.x + hit.w + 8, y: hit.y + hit.h * 0.7 });
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
