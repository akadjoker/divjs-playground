// Tutorial video: DivJS Blocks, lesson 4 "Avoid the enemy".
// See blocks-1.mjs for how a lesson script works.

import { blocksUrl, openLesson, rectOf, blockRect, center, openCategory, drag, pick, typeNumber, childId, revealBlock, workArea,
  play, chase, scrollCodeTo, codeLineRect, unionRect } from '../blocks.mjs';

const PLAYER = { type: 'div_sprite', name: 'player' };
const COIN = { type: 'div_sprite', name: 'coin' };
const ENEMY = { type: 'div_sprite', name: 'enemy' };
const made = {};

// The camera on the blocks being built (they grow as blocks go in).
async function follow(t)
{
  t.focus(await workArea(t, [ENEMY]), { seconds: 0.8 });
}

export default {
  id: 'blocks-4',
  url: (lang) => blocksUrl(lang),
  ready: async (t) =>
  {
    // The player and the coin (lessons 2 and 3) are folded up.
    await openLesson(t, 3, { scale: 0.8, columns: [['div_start', PLAYER, COIN], [ENEMY]], collapse: [PLAYER, COIN], column: 330 });
    made.createCoin = await childId(t, await childId(t, 'div_start', 'DO'), 'next');
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
        t.focus(await workArea(t, ['div_start', PLAYER, COIN, ENEMY]), { seconds: 1.4 });
        await t.cue('enemy', -0.3);
        t.highlight(await blockRect(t, ENEMY));
        await t.moveTo(center(await blockRect(t, ENEMY)));
        await t.lineEnd();
        t.highlight(null);
      }
    },
    {
      id: 'create',
      async run(t)
      {
        await openCategory(t, 'program', { at: 'click' });
        made.create = await drag(t, 'div_create', { block: made.createCoin, next: true }, { at: 'grab' });
        await follow(t);
        await pick(t, made.create, 'SPRITE', 'enemy', { at: 'pick' });
        await typeNumber(t, made.create, 'X', 300, { at: 'x' });
        await typeNumber(t, made.create, 'Y', 20);
      }
    },
    {
      id: 'look',
      async run(t)
      {
        t.focus(await workArea(t, [ENEMY, 'div_start']));
        await openCategory(t, 'looks', { at: 'click' });
        made.look = await drag(t, 'div_look', { block: ENEMY, input: 'DO' }, { at: 'grab' });
        await follow(t);
        await pick(t, made.look, 'SHAPE', 'box', { at: 'box' });
        await typeNumber(t, made.look, null, 18, { field: 'SIZE' });
        await pick(t, made.look, 'COLOUR', 'red', { at: 'red' });
      }
    },
    {
      id: 'direction',
      async run(t)
      {
        await openCategory(t, 'looks', { at: 'click' });
        made.angle = await drag(t, 'div_set_angle', { block: made.look, next: true }, { at: 'grab' });
        await follow(t);
        await typeNumber(t, made.angle, 'ANGLE', 40, { at: 'num' });
      }
    },
    {
      id: 'fly',
      async run(t)
      {
        await openCategory(t, 'control', { at: 'click' });
        made.forever = await drag(t, 'div_forever', { block: made.angle, next: true });
        await openCategory(t, 'motion', { at: 'motion' });
        made.forward = await drag(t, 'div_forward', { block: made.forever, input: 'DO' });
        await typeNumber(t, made.forward, 'STEPS', 2);
        await openCategory(t, 'motion');
        made.bounce = await drag(t, 'div_bounce', { block: made.forward, next: true }, { at: 'bounce' });
        await follow(t);
      }
    },
    {
      id: 'hit',
      async run(t)
      {
        await revealBlock(t, made.bounce, { margin: 200 });
        t.focus(await workArea(t, [ENEMY]));
        await openCategory(t, 'control', { at: 'click' });
        made.if = await drag(t, 'div_if', { block: made.bounce, next: true });
        await follow(t);
        await openCategory(t, 'sensing', { at: 'sensing' });
        made.touching = await drag(t, 'div_touching', { block: made.if, input: 'COND' });
        await follow(t);
        const sprite = await t.page.evaluate((id) => window.__find(id).getFieldValue('SPRITE'), made.touching);
        if (sprite !== 'player')
        {
          await pick(t, made.touching, 'SPRITE', 'player');
        }
      }
    },
    {
      id: 'reset',
      async run(t)
      {
        await openCategory(t, 'variables', { at: 'click' });
        made.set = await drag(t, 'div_var_set', { block: made.if, input: 'DO' }, { at: 'grab' });
        await revealBlock(t, made.set, { margin: 160 });
        await openCategory(t, 'sound', { at: 'sound' });
        made.sound = await drag(t, 'div_sound', { block: made.set, next: true });
        await follow(t);
        await pick(t, made.sound, 'SOUND', 'sfx_hit');
      }
    },
    {
      id: 'back',
      async run(t)
      {
        await revealBlock(t, made.sound, { margin: 160 });
        t.focus(await workArea(t, [made.forever]));
        await openCategory(t, 'motion', { at: 'click' });
        made.goto = await drag(t, 'div_goto', { block: made.sound, next: true }, { at: 'grab' });
        await typeNumber(t, made.goto, 'X', 300, { at: 'x' });
        await typeNumber(t, made.goto, 'Y', 20);
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
        await chase(t, 'player', 'coin', Math.max(5, t.lineEndTime(0.3) - t.time), { flee: 'enemy' });
      }
    },
    {
      id: 'code',
      async run(t)
      {
        const panel = await rectOf(t, '.code-pane');
        t.focus({ ...panel, h: 280 });
        await t.moveTo({ x: panel.x + panel.w * 0.62, y: panel.y + 18 });
        await t.cue('bounce', -0.9);
        const first = await scrollCodeTo(t, 'advance(2);', { place: 0.1 });
        const last = await codeLineRect(t, 'IF (y > 240 - look_half)');
        const lines = unionRect([first, last]);
        t.focus({ x: panel.x, y: lines.y - 40, w: panel.w, h: lines.h + 80 });
        t.highlight({ x: lines.x - 4, y: lines.y - 2, w: lines.w + 8, h: lines.h + 4 });
        await t.moveTo({ x: first.x + first.w + 10, y: first.y + first.h * 0.7 });
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
