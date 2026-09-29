// What the tutorials do in the DivJS Blocks editor (blocks/): open a
// lesson, find things on the page, open a toolbox category, drag a block
// from it into place with real mouse events (and check it snapped), run.
// Everything is found by block type or position, never by its label, so
// the same lesson script works in every language of the page.

// The toolbox categories, in their order (blocks/blocks.js TOOLBOX).
export const CATEGORIES = ['program', 'looks', 'motion', 'control', 'sensing', 'operators', 'variables', 'sound'];

// The editor's address in a language. The page reads its language from
// `?lang=` (English when it has no translation).
export function blocksUrl(lang)
{
  return `blocks/?lang=${lang || 'en'}`;
}

// Blocks a little bigger than the page's default (0.65), so they read well
// in a video: the same as pressing the editor's zoom button twice.
const SCALE = 0.86;

// Opens lesson `index` (0 = lesson 1) with its starting blocks, laid out
// in a row, each stack given `column` page pixels of width at least.
export async function openLesson(t, index, { column = 0, scale = SCALE, columns = null, collapse = [] } = {})
{
  const { page } = t;
  await page.waitForFunction(() => window.divBlocks && window.divBlocks.workspace(), null, { polling: 100, timeout: 20000 });
  await page.evaluate((s) => window.divBlocks.workspace().setScale(s), scale);
  // The new scale takes effect on the next frames.
  for (let i = 0; i < 3; i++)
  {
    await t.tick();
  }
  await page.evaluate((i) =>
  {
    // Opening the lesson lays its blocks out from the top left of the view.
    window.divBlocks.openLesson(i);
    const ws = () => window.divBlocks.workspace();
    // A block from a spec: its id, its type (the first one), or
    // { type, name, nth } (name: the NAME field of "define sprite").
    window.__find = (spec) =>
    {
      if (typeof spec === 'string')
      {
        return ws().getBlockById(spec) || ws().getBlocksByType(spec, false)[0] || null;
      }
      const list = ws().getBlocksByType(spec.type, false).filter((b) => spec.name === undefined || b.getFieldValue('NAME') === spec.name);
      return list[spec.nth || 0] || null;
    };
    // Where a connection of a block is on the page: 'previous', 'output',
    // 'next' or the name of an input.
    window.__connection = (block, which) =>
    {
      const c = which === 'previous' ? block.previousConnection
        : which === 'output' ? block.outputConnection
          : which === 'next' ? block.nextConnection
            : block.getInput(which).connection;
      const o = c.getOffsetInBlock();
      const m = block.getSvgRoot().getScreenCTM();
      return { x: m.e + m.a * o.x, y: m.f + m.d * o.y };
    };
    window.__rect = (el) =>
    {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    // No tooltips: the pointer rests on blocks while the narration talks.
    const style = document.createElement('style');
    style.id = 'tutorial-no-tooltips';
    style.textContent = '.blocklyTooltipDiv { display: none !important; }';
    document.head.appendChild(style);
  }, index);
  // A few frames for Blockly to draw, then the stacks laid out from the
  // top left of the view (at this scale Blockly may have scrolled the view
  // since): in a row, each given room for `column` page pixels of width, so
  // the blocks the lesson adds do not run over the next stack; or in
  // `columns` ([[spec, ...], ...], top to bottom). `collapse`: stacks
  // folded up (Blockly's "Collapse Block") that the lesson does not touch.
  for (let i = 0; i < 4; i++)
  {
    await t.tick();
  }
  await page.evaluate(([column, columns, collapse]) =>
  {
    const ws = window.divBlocks.workspace();
    for (const spec of collapse)
    {
      window.__find(spec).setCollapsed(true);
    }
    const view = ws.getMetricsManager().getViewMetrics(true);
    const gap = 32 / ws.scale;
    const cols = columns ? columns.map((c) => c.map((spec) => window.__find(spec))) : ws.getTopBlocks(true).map((b) => [b]);
    let x = view.left + gap;
    for (const col of cols)
    {
      let y = view.top + gap;
      let width = column / ws.scale;
      for (const b of col)
      {
        const box = b.getBoundingRectangle();
        b.moveBy(x - box.left, y - box.top);
        y += box.bottom - box.top + gap;
        width = Math.max(width, box.right - box.left);
      }
      x += width + gap;
    }
  }, [column, columns, collapse]);
  for (let i = 0; i < 4; i++)
  {
    await t.tick();
  }
  const lesson = await page.evaluate(() => window.divBlocks.getLesson());
  return lesson;
}

// ── Where things are (page pixels, { x, y, w, h }) ──────────────────────

export function rectOf(t, selector)
{
  return t.page.$eval(selector, (el) => window.__rect(el));
}

export const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// A block's rect: a spec (see __find), or with `flyout` the first block
// of that type in the open flyout.
export function blockRect(t, spec, { flyout = false } = {})
{
  return t.page.evaluate(([spec, flyout]) =>
  {
    let block = null;
    if (flyout)
    {
      block = window.divBlocks.workspace().getToolbox().getFlyout().getWorkspace().getTopBlocks(true).find((b) => b.type === spec);
    }
    else
    {
      block = window.__find(spec);
    }
    return block ? window.__rect(block.getSvgRoot()) : null;
  }, [spec, flyout]);
}

// The rect of several blocks together.
export async function blocksRect(t, specs)
{
  const rects = [];
  for (const spec of specs)
  {
    rects.push(await blockRect(t, spec));
  }
  return unionRect(rects);
}

export function unionRect(rects)
{
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// A field of a block (spec): `input` is a value input (the field is on
// the number block in it) or null for a field of the block itself.
export function fieldRect(t, spec, input, field = 'NUM')
{
  return t.page.evaluate(([spec, input, field]) =>
  {
    const block = window.__find(spec);
    const owner = input ? block.getInput(input).connection.targetBlock() : block;
    return window.__rect(owner.getField(field).getSvgRoot());
  }, [spec, input, field]);
}

export function categoryRect(t, name)
{
  return t.page.evaluate((i) =>
  {
    const item = window.divBlocks.workspace().getToolbox().getToolboxItems()[i];
    return window.__rect(item.getDiv().querySelector('.blocklyTreeRow') || item.getDiv());
  }, CATEGORIES.indexOf(name));
}

// The line of the DIV code panel that holds `text`: from where the text
// starts to the end of its line.
export function codeLineRect(t, text)
{
  return t.page.evaluate((text) =>
  {
    const pre = document.getElementById('code');
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let all = '';
    for (let n = walker.nextNode(); n; n = walker.nextNode())
    {
      nodes.push([n, all.length]);
      all += n.textContent;
    }
    const at = all.indexOf(text);
    if (at < 0)
    {
      return null;
    }
    const find = (i) =>
    {
      const [node, start] = nodes.filter(([, s]) => s <= i).pop();
      return [node, i - start];
    };
    const eol = all.indexOf('\n', at);
    const range = document.createRange();
    range.setStart(...find(at));
    range.setEnd(...find((eol < 0 ? all.length : eol) - 1));
    const r = range.getBoundingClientRect();
    // Not past the panel's edge (long lines run on under it).
    const box = pre.getBoundingClientRect();
    const right = Math.min(r.right + 10, box.right - 6);
    return { x: r.x, y: r.y, w: right - r.x, h: r.height };
  }, text);
}

// ── Actions ─────────────────────────────────────────────────────────────

// Points at the category and clicks it (its flyout opens).
export async function openCategory(t, name, { at = null } = {})
{
  const r = await categoryRect(t, name);
  await t.moveTo({ x: r.x + Math.min(70, r.w * 0.45), y: r.y + r.h / 2 });
  if (at)
  {
    await t.cue(at);
  }
  await t.click();
  await t.wait(0.15);
}

// Where a dragged block goes: { block: spec, input: 'DO' } (a statement
// or value input) or { block: spec, next: true } (under that block).
const targetOf = (target) => [target.block, target.next ? 'next' : target.input];

// Drags a block so that it connects to `target`: the block `type` from the
// open flyout (`nth`: which one of that type), or with `block` a block
// already in the workspace. The pointer grabs the block by its left end,
// pulls it out and homes in on the connection, reading where both
// connections are every frame; the drop is checked by reading the
// workspace. `seconds`: how long the move takes once the block is out of
// the flyout; `at` / `dropAt`: the cues of the line to pick it up and to
// let go on (it is held in place until then, Blockly showing where it will
// go). Returns the dragged block's id.
export async function drag(t, type, target, { block = null, nth = 0, seconds = 1.1, at = null, dropAt = null, grabAt = null } = {})
{
  const { page } = t;
  const before = await page.evaluate(() => window.divBlocks.workspace().getAllBlocks(false).map((b) => b.id));
  if (!block)
  {
    await revealInFlyout(t, type, nth);
  }
  const grab = await page.evaluate(([type, nth, id, grabAt]) =>
  {
    const ws = window.divBlocks.workspace();
    let b = null;
    let scale = ws.scale;
    if (id)
    {
      b = window.__find(id);
    }
    else
    {
      const flyout = ws.getToolbox().getFlyout().getWorkspace();
      b = flyout.getTopBlocks(true).filter((x) => x.type === type)[nth];
      scale = flyout.scale;
    }
    const r = b.getSvgRoot().getBoundingClientRect();
    const plug = b.previousConnection ? 'previous' : 'output';
    const c = window.__connection(b, plug);
    // By its left end, on its top row: a word of its label, not a field.
    const g = grabAt || [b.outputConnection ? 14 : 22, 18];
    return { x: Math.max(r.x + 6, c.x) + g[0] * scale, y: r.y + g[1] * scale, plug, id: b.id };
  }, [type, nth, block && typeof block === 'string' ? block : block ? await blockId(t, block) : null, grabAt]);
  await t.moveTo(grab);
  await t.wait(0.12);
  if (at)
  {
    await t.cue(at, -0.1);
  }
  await t.press();
  // Past Blockly's drag radius.
  for (let i = 0; i < 5; i++)
  {
    t.mouse = { x: t.mouse.x + 4, y: t.mouse.y + 2 };
    await page.mouse.move(t.mouse.x, t.mouse.y);
    await t.tick();
  }
  const [targetSpec, targetConn] = targetOf(target);
  const aim = () => page.evaluate(([before, id, plug, spec, conn]) =>
  {
    const ws = window.divBlocks.workspace();
    const dragged = id ? ws.getBlockById(id) : ws.getAllBlocks(false).find((b) => !before.includes(b.id) && !b.isShadow() && !b.getParent());
    const a = window.__connection(dragged, plug);
    const b = window.__connection(window.__find(spec), conn);
    return { x: b.x - a.x, y: b.y - a.y };
  }, [before, block ? grab.id : null, grab.plug, targetSpec, targetConn]);
  await t.moveTo(null, { seconds, aim });
  await t.wait(0.2);
  if (dropAt)
  {
    await t.cue(dropAt, -0.15);
  }
  await t.release();
  // Blockly draws the snapped blocks on the next frames.
  await t.wait(0.1);
  const result = await page.evaluate(([before, id, spec, conn]) =>
  {
    const ws = window.divBlocks.workspace();
    const dragged = id ? ws.getBlockById(id) : ws.getAllBlocks(false).find((b) => !before.includes(b.id) && !b.isShadow());
    const target = window.__find(spec);
    const into = conn === 'next' ? target.nextConnection.targetBlock() : target.getInput(conn).connection.targetBlock();
    return { id: dragged && dragged.id, ok: !!dragged && into === dragged, into: into && into.type, type: dragged && dragged.type };
  }, [before, block ? grab.id : null, targetSpec, targetConn]);
  if (!result.ok)
  {
    throw new Error(`the ${result.type || type} block did not snap into ${JSON.stringify(target)} (found there: ${result.into})`);
  }
  return result.id;
}

// Lesson 1's form: drag(t, type, { block: into, input }).
export function dragBlock(t, type, into, input, options = {})
{
  return drag(t, type, { block: into, input }, options);
}

// The id of the block in `input` of a block ('next': the one under it).
export function childId(t, spec, input)
{
  return t.page.evaluate(([spec, input]) =>
  {
    const b = window.__find(spec);
    const c = input === 'next' ? b.nextConnection.targetBlock() : b.getInput(input).connection.targetBlock();
    return c ? c.id : null;
  }, [spec, input]);
}

async function blockId(t, spec)
{
  return t.page.evaluate((spec) => window.__find(spec).id, spec);
}

// Scrolls the open flyout (with the mouse wheel, over it) until the
// block `type` is in view.
async function revealInFlyout(t, type, nth = 0)
{
  const { page } = t;
  for (let tries = 0; tries < 12; tries++)
  {
    const where = await page.evaluate(([type, nth]) =>
    {
      const flyout = window.divBlocks.workspace().getToolbox().getFlyout();
      const view = flyout.svgGroup_ ? flyout.svgGroup_.getBoundingClientRect() : flyout.getWorkspace().getParentSvg().getBoundingClientRect();
      const b = flyout.getWorkspace().getTopBlocks(true).filter((x) => x.type === type)[nth];
      const r = b.getSvgRoot().getBoundingClientRect();
      return { top: view.top, bottom: view.bottom, x: view.left + view.width / 2, y0: r.top, y1: r.bottom };
    }, [type, nth]);
    const below = where.y1 - (where.bottom - 30);
    const above = where.top - where.y0;
    if (below <= 0 && above <= 0)
    {
      return;
    }
    if (tries === 0)
    {
      await t.moveTo({ x: where.x, y: (where.top + where.bottom) / 2 });
    }
    const dy = below > 0 ? Math.min(below + 40, 240) : -Math.min(above + 40, 240);
    for (let i = 0; i < 4; i++)
    {
      await page.mouse.wheel(0, dy / 4);
      await t.tick();
    }
    await t.wait(0.1);
  }
  throw new Error(`the ${type} block could not be scrolled into view in the flyout`);
}

// Picks `value` in a dropdown field: a click on the field, then on the
// option in the menu (found by its place in the field's options, so in
// any language).
export async function pick(t, spec, field, value, { at = null } = {})
{
  const { page } = t;
  // Near the top of the workspace, so the menu opens downwards (one that
  // opens upwards is cut off by the workspace's edge).
  await scrollWorkspace(t, () => fieldRect(t, spec, null, field), { above: 40, maxTop: 150 });
  const r = await fieldRect(t, spec, null, field);
  await t.moveTo({ x: r.x + r.w * 0.5, y: r.y + r.h * 0.55 });
  if (at)
  {
    await t.cue(at, -0.1);
  }
  await t.click();
  await t.wait(0.35);
  // The menu may scroll to show the option: measure it again until it
  // stays put, then point at it.
  const itemRect = () => page.evaluate(([spec, field, value]) =>
  {
    const options = window.__find(spec).getField(field).getOptions(false);
    const index = options.findIndex((o) => o[1] === value);
    const el = [...document.querySelectorAll('.blocklyDropDownDiv .blocklyMenuItem')][index];
    if (!el)
    {
      return null;
    }
    el.scrollIntoView({ block: 'nearest' });
    return window.__rect(el);
  }, [spec, field, value]);
  let item = null;
  for (let i = 0; i < 20; i++)
  {
    const r = await itemRect();
    await t.tick();
    if (r && item && Math.abs(r.x - item.x) < 0.5 && Math.abs(r.y - item.y) < 0.5)
    {
      break;
    }
    item = r;
  }
  if (!item)
  {
    throw new Error(`no option ${value} in the menu of ${field}`);
  }
  for (let i = 0; i < 3; i++)
  {
    await t.moveTo({ x: item.x + Math.min(60, item.w * 0.4), y: item.y + item.h / 2 }, i ? { seconds: 0.15 } : {});
    const again = await itemRect();
    if (Math.abs(again.y - item.y) < 1)
    {
      break;
    }
    item = again;
  }
  const hit = await page.evaluate(([x, y, spec, field, value]) =>
  {
    const options = window.__find(spec).getField(field).getOptions(false);
    const index = options.findIndex((o) => o[1] === value);
    const el = [...document.querySelectorAll('.blocklyDropDownDiv .blocklyMenuItem')][index];
    const under = document.elementFromPoint(x, y);
    return !!el && !!under && el.contains(under);
  }, [t.mouse.x, t.mouse.y, spec, field, value]);
  if (!hit)
  {
    throw new Error(`the option ${value} of ${field} is not under the pointer (is the menu cut off?)`);
  }
  await t.click();
  await t.wait(0.3);
  const now = await page.evaluate(([spec, field]) => window.__find(spec).getFieldValue(field), [spec, field]);
  if (now !== value)
  {
    throw new Error(`${field} is ${now}, not ${value}`);
  }
}

// Types a number into a number field: on the number block in value input
// `input`, or with input null a field of the block itself (`field`).
export async function typeNumber(t, spec, input, value, { field = 'NUM', at = null } = {})
{
  const { page } = t;
  const r = await fieldRect(t, spec, input, field);
  await t.moveTo({ x: r.x + r.w * 0.5, y: r.y + r.h * 0.6 });
  if (at)
  {
    await t.cue(at, -0.1);
  }
  await t.click();
  await t.wait(0.25);
  // The editor opens with the number selected: typing replaces it.
  await page.keyboard.press('Control+A');
  for (const ch of String(value))
  {
    await page.keyboard.type(ch);
    await t.wait(0.12);
  }
  await t.wait(0.2);
  await page.keyboard.press('Enter');
  await t.wait(0.25);
  const now = await page.evaluate(([spec, input, field]) =>
  {
    const block = window.__find(spec);
    const owner = input ? block.getInput(input).connection.targetBlock() : block;
    return owner.getFieldValue(field);
  }, [spec, input, field]);
  if (Number(now) !== Number(value))
  {
    throw new Error(`the number is ${now}, not ${value}`);
  }
}

// Copies a block (with the blocks inside it) and pastes the copy, as
// Ctrl+C / Ctrl+V do: a click selects it first. Returns the copy's id.
export async function copyPaste(t, spec)
{
  const { page } = t;
  const before = await page.evaluate(() => window.divBlocks.workspace().getTopBlocks(false).map((b) => b.id));
  const r = await blockRect(t, spec);
  await t.moveTo({ x: r.x + 10, y: r.y + 12 });
  await t.click();
  await t.wait(0.2);
  await page.keyboard.press('Control+C');
  await t.wait(0.15);
  await page.keyboard.press('Control+V');
  await t.wait(0.3);
  const id = await page.evaluate((before) => window.divBlocks.workspace().getTopBlocks(false).map((b) => b.id).find((x) => !before.includes(x)), before);
  if (!id)
  {
    throw new Error('the copy was not pasted');
  }
  return id;
}

// Clicks the game (it gets the keys; not with `click` false) and plays
// `keys`: [[key, seconds], ...] held one after the other ('' waits).
export async function play(t, keys, { at = null, click = true } = {})
{
  const { page } = t;
  if (click)
  {
    const game = await rectOf(t, '#game');
    await t.moveTo({ x: game.x + game.w * 0.85, y: game.y + game.h * 0.85 });
    if (at)
    {
      await t.cue(at, -0.1);
    }
    await t.click();
  }
  for (const [key, seconds] of keys)
  {
    if (key)
    {
      await page.keyboard.down(key);
    }
    await t.wait(seconds);
    if (key)
    {
      await page.keyboard.up(key);
    }
  }
}

// Scrolls the workspace (the mouse wheel over an empty part of it) until
// the block `spec` has `margin` page pixels below it in view (and `top`
// above it).
export function revealBlock(t, spec, { margin = 150, top = 20 } = {})
{
  return scrollWorkspace(t, () => blockRect(t, spec), { below: margin, above: top });
}

// Scrolls the workspace until the rect rect() returns has `above` page
// pixels of the workspace above it and `below` below it (or sits no lower
// than `maxTop` from the workspace's top).
async function scrollWorkspace(t, rect, { below = 0, above = 20, maxTop = null } = {})
{
  const { page } = t;
  for (let tries = 0; tries < 10; tries++)
  {
    const r = await rect();
    const ws = await rectOf(t, '#workspace');
    let down = r.y + r.h + below - (ws.y + ws.h);
    if (maxTop !== null)
    {
      down = Math.max(down, r.y - (ws.y + maxTop));
    }
    const up = ws.y + above - r.y;
    if (down <= 1 && up <= 1)
    {
      return;
    }
    const dy = down > 1 ? Math.min(down, ws.h * 0.5) : -Math.min(up, ws.h * 0.5);
    if (tries === 0)
    {
      await t.moveTo({ x: ws.x + ws.w - 110, y: ws.y + ws.h * 0.45 });
    }
    for (let i = 0; i < 6; i++)
    {
      await page.mouse.wheel(0, dy / 6);
      await t.tick();
    }
    await t.wait(0.1);
  }
}

// The part of the editor where blocks are built: the category list, the
// flyout beside it (`flyout` page pixels wide) and the blocks `specs`.
export async function workArea(t, specs, { flyout = 380, extra = [] } = {})
{
  const first = await categoryRect(t, 'program');
  const last = await categoryRect(t, 'sound');
  const cats = { x: first.x, y: first.y, w: first.w + flyout, h: last.y + last.h - first.y };
  const rects = [cats, ...extra];
  for (const spec of specs)
  {
    rects.push(await blockRect(t, spec));
  }
  return unionRect(rects);
}

// Plays the game for `seconds` steering the sprite `who` (a process name)
// with the arrow keys towards the nearest process named `to` (or away
// from it with `flee`), as a player would.
export async function chase(t, who, to, seconds, { flee = null } = {})
{
  const { page } = t;
  const held = new Set();
  const end = t.time + seconds;
  while (t.time < end)
  {
    const want = await page.evaluate(([who, to, flee]) =>
    {
      const state = window.divBlocks.getState();
      const all = state && state.vm ? state.vm.processManager.getAll() : [];
      const me = all.find((p) => p.name === who);
      if (!me)
      {
        return [];
      }
      const near = (name) => all.filter((p) => p.name === name).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
      const target = near(to);
      let dx = target ? target.x - me.x : 0;
      let dy = target ? target.y - me.y : 0;
      const danger = flee ? near(flee) : null;
      if (danger && Math.hypot(danger.x - me.x, danger.y - me.y) < 60)
      {
        dx = me.x - danger.x;
        dy = me.y - danger.y;
      }
      const keys = [];
      if (dx > 3)
      {
        keys.push('ArrowRight');
      }
      if (dx < -3)
      {
        keys.push('ArrowLeft');
      }
      if (dy > 3)
      {
        keys.push('ArrowDown');
      }
      if (dy < -3)
      {
        keys.push('ArrowUp');
      }
      return keys;
    }, [who, to, flee]);
    for (const key of [...held])
    {
      if (!want.includes(key))
      {
        await page.keyboard.up(key);
        held.delete(key);
      }
    }
    for (const key of want)
    {
      if (!held.has(key))
      {
        await page.keyboard.down(key);
        held.add(key);
      }
    }
    await t.tick();
  }
  for (const key of held)
  {
    await page.keyboard.up(key);
  }
}

// Lets Blockly show its tooltips (hidden while recording otherwise).
export function allowTooltips(t)
{
  return t.page.evaluate(() => document.getElementById('tutorial-no-tooltips')?.remove());
}

// Scrolls the DIV code panel so that the line with `text` sits at `place`
// (0 top .. 1 bottom), smoothly over `seconds`; returns the line's rect.
export async function scrollCodeTo(t, text, { place = 0.35, seconds = 0.8 } = {})
{
  const { page } = t;
  const [from, to] = await page.evaluate(([text, place]) =>
  {
    const pre = document.getElementById('code');
    const index = pre.textContent.indexOf(text);
    const line = pre.textContent.slice(0, index).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(pre).lineHeight) || 17;
    const want = line * lineHeight - pre.clientHeight * place;
    return [pre.scrollTop, Math.max(0, Math.min(pre.scrollHeight - pre.clientHeight, want))];
  }, [text, place]);
  await t.tween(seconds, (k) => page.evaluate((y) =>
  {
    document.getElementById('code').scrollTop = y;
  }, from + (to - from) * k));
  return codeLineRect(t, text);
}
