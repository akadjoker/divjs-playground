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
  return lang && lang !== 'en' ? `blocks/?lang=${lang}` : 'blocks/';
}

// Blocks a little bigger than the page's default (0.65), so they read well
// in a video: the same as pressing the editor's zoom button twice.
const SCALE = 0.86;

// Opens lesson `index` (0 = lesson 1) with its starting blocks, laid out
// in a row, each stack given `column` page pixels of width at least.
export async function openLesson(t, index, { column = 0 } = {})
{
  const { page } = t;
  await page.waitForFunction(() => window.divBlocks && window.divBlocks.workspace(), null, { polling: 100, timeout: 20000 });
  await page.evaluate((scale) => window.divBlocks.workspace().setScale(scale), SCALE);
  // The new scale takes effect on the next frames.
  for (let i = 0; i < 3; i++)
  {
    await t.tick();
  }
  await page.evaluate((i) =>
  {
    // Opening the lesson lays its blocks out from the top left of the view.
    window.divBlocks.openLesson(i);
    // Where a connection of a block is on the page.
    window.__connection = (block, which) =>
    {
      const c = which === 'previous' ? block.previousConnection : block.getInput(which).connection;
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
    style.textContent = '.blocklyTooltipDiv { display: none !important; }';
    document.head.appendChild(style);
  }, index);
  // A few frames for Blockly to draw, then the stacks in a row from the
  // top left of the view (at this scale Blockly may have scrolled the view
  // since), each given room for `column` page pixels of width, so the
  // blocks the lesson adds do not run over the next stack.
  for (let i = 0; i < 4; i++)
  {
    await t.tick();
  }
  await page.evaluate((column) =>
  {
    const ws = window.divBlocks.workspace();
    const view = ws.getMetricsManager().getViewMetrics(true);
    let x = view.left + 32;
    for (const b of ws.getTopBlocks(true))
    {
      const box = b.getBoundingRectangle();
      b.moveBy(x - box.left, view.top + 32 - box.top);
      x += Math.max(box.right - box.left, column / ws.scale) + 32;
    }
  }, column);
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

// The first block of `type` in the workspace (or in the open flyout).
export function blockRect(t, type, { flyout = false } = {})
{
  return t.page.evaluate(([type, flyout]) =>
  {
    const ws = window.divBlocks.workspace();
    const where = flyout ? ws.getToolbox().getFlyout().getWorkspace() : ws;
    const block = where.getTopBlocks(true).find((b) => b.type === type) || where.getBlocksByType(type, true)[0];
    return block ? window.__rect(block.getSvgRoot()) : null;
  }, [type, flyout]);
}

// A field of a block: `input` is a value input (its number block) or null
// for a field of the block itself.
export function fieldRect(t, type, input, field = 'NUM')
{
  return t.page.evaluate(([type, input, field]) =>
  {
    const block = window.divBlocks.workspace().getBlocksByType(type, false)[0];
    const owner = input ? block.getInput(input).connection.targetBlock() : block;
    return window.__rect(owner.getField(field).getSvgRoot());
  }, [type, input, field]);
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

// Drags the block `type` from the open flyout so that it connects to the
// `input` of the first `into` block (a statement input such as DO). The
// pointer grabs the block by its left end, pulls it out and homes in on
// the connection, reading where both connections are every frame; the
// drop is checked by reading the workspace. `seconds`: how long the move
// takes once the block is out of the flyout; `at` / `dropAt`: the cues of
// the line to pick it up and to let go on (it is held in place until then,
// Blockly showing where it will go).
export async function dragBlock(t, type, into, input, { seconds = 1.3, at = null, dropAt = null } = {})
{
  const { page } = t;
  const grab = await page.evaluate((type) =>
  {
    const flyout = window.divBlocks.workspace().getToolbox().getFlyout().getWorkspace();
    const block = flyout.getTopBlocks(true).find((b) => b.type === type);
    const c = window.__connection(block, 'previous');
    const scale = flyout.scale;
    return { x: c.x + 22 * scale, y: c.y + 18 * scale };
  }, type);
  await t.moveTo(grab);
  await t.wait(0.12);
  if (at)
  {
    await t.cue(at, -0.1);
  }
  await t.press();
  // Out of the flyout: past Blockly's drag radius.
  for (let i = 0; i < 5; i++)
  {
    t.mouse = { x: t.mouse.x + 4, y: t.mouse.y + 2 };
    await page.mouse.move(t.mouse.x, t.mouse.y);
    await t.tick();
  }
  const aim = () => page.evaluate(([type, into, input]) =>
  {
    const ws = window.divBlocks.workspace();
    const dragged = ws.getBlocksByType(type, false).find((b) => b.isDragging && b.isDragging()) || ws.getBlocksByType(type, false)[0];
    const target = ws.getBlocksByType(into, false)[0];
    const a = window.__connection(dragged, 'previous');
    const b = window.__connection(target, input);
    return { x: b.x - a.x, y: b.y - a.y };
  }, [type, into, input]);
  await t.moveTo(null, { seconds, aim });
  await t.wait(0.2);
  if (dropAt)
  {
    await t.cue(dropAt, -0.15);
  }
  await t.release();
  // Blockly draws the snapped blocks on the next frames.
  await t.wait(0.1);
  const parent = await page.evaluate(([type]) =>
  {
    const ws = window.divBlocks.workspace();
    const block = ws.getBlocksByType(type, false)[0];
    return block && block.getParent() ? block.getParent().type : null;
  }, [type]);
  if (parent !== into)
  {
    throw new Error(`the ${type} block did not snap into ${into} (its parent: ${parent})`);
  }
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
