// Writes the DIV programs behind the trailer's screens: a dark background
// with drifting pixel stars, text typed in with DIV's own 6x8 system font
// (drawn big with gfx_rect, pixel by pixel, from the engine's font table),
// boxes and the frame around the game footage. DivJS runs them in
// tools/trailer/stage.html and they are recorded like any game.
//
// A screen (see timeline.mjs):
//   { size: [w, h],                 the program's resolution (scaled up later)
//     seconds,                       how long to record
//     texts: [{ text, x, y, scale, color, at, cps, align, cursor, until }],
//     boxes: [{ x, y, w, h, color, at, outline }],
//     stars: true }
// Text: `{word}` is drawn in the accent colour, `[word]` in the highlight
// colour; `\n` starts a new line. `x` is the left edge, or the centre with
// align 'center' (the default, x defaults to the middle); `y` is the top.
// `at` is when typing starts (seconds), `cps` characters per second (0 =
// all at once; raised so no text takes longer than 0.3 s to type),
// `until` when the text goes (seconds, default never),
// `cursor` leaves DIV's blinking block after the last character.

import { CanvasEngineRuntime } from '../../engine/divjs.js';

export const COLORS = {
  bg: '#0f1419',
  text: '#e8f1f8',
  accent: '#2dd4bf',
  highlight: '#ffcb6b',
  muted: '#95a8b8',
  shadow: '#05080b',
  star: '#2a3948',
  star2: '#56708a'
};

const GLYPH_W = 6;
const MAX_TYPING = 0.3;
const GLYPH_H = 8;

// The engine's 6x8 font, read through its own atlas builder with a stand-in
// canvas that just notes which pixels are set.
let fontPixels = null;
function glyphPixels(code)
{
  if (!fontPixels)
  {
    fontPixels = new Set();
    const saved = globalThis.document;
    globalThis.document = {
      createElement: () => ({ getContext: () => ({ fillRect: (x, y) => fontPixels.add(`${x},${y}`) }) })
    };
    try
    {
      CanvasEngineRuntime.prototype.systemFontAtlas.call({}, '#fff');
    }
    finally
    {
      globalThis.document = saved;
    }
  }
  const rows = [];
  for (let y = 0; y < GLYPH_H; y++)
  {
    const row = [];
    for (let x = 0; x < GLYPH_W; x++)
    {
      row.push(fontPixels.has(`${code * GLYPH_W + x},${y}`));
    }
    rows.push(row);
  }
  return rows;
}

const rgb = (hex) =>
{
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

// Width in program pixels of `text` (markup removed) at `scale`, without
// the empty column after the last character.
export function textWidth(text, scale = 1)
{
  const plain = text.replace(/[{}[\]]/g, '');
  return Math.max(0, plain.length * GLYPH_W - 1) * scale;
}

// Splits a line with {accent} and [highlight] markup into coloured characters.
function colouredChars(line, color)
{
  const out = [];
  let current = color;
  for (const ch of line)
  {
    if (ch === '{')
    {
      current = COLORS.accent;
    }
    else if (ch === '[')
    {
      current = COLORS.highlight;
    }
    else if (ch === '}' || ch === ']')
    {
      current = color;
    }
    else
    {
      out.push({ ch, color: current });
    }
  }
  return out;
}

export function cardSource(screen)
{
  const [W, H] = screen.size;
  const graphics = new Map();
  const lines = [];
  const setup = [];
  let count = 0;
  const frames = (seconds) => Math.round(seconds * 60);

  // A graphic for one character at a scale and colour, with its shadow one
  // font pixel down and right.
  const glyphGraphic = (ch, scale, color, shadow) =>
  {
    const key = `${ch}|${scale}|${color}|${shadow}`;
    if (graphics.has(key))
    {
      return graphics.get(key);
    }
    const name = `g${count++}`;
    graphics.set(key, name);
    const pad = shadow ? scale : 0;
    setup.push(`  ${name} = new_graphic(${GLYPH_W * scale + pad}, ${GLYPH_H * scale + pad});`);
    const rows = glyphPixels(ch.charCodeAt(0));
    const runs = (paint, offset) =>
    {
      rows.forEach((row, y) =>
      {
        let x = 0;
        while (x < GLYPH_W)
        {
          if (!row[x])
          {
            x++;
            continue;
          }
          let end = x;
          while (end < GLYPH_W && row[end])
          {
            end++;
          }
          const [r, g, b] = rgb(paint);
          setup.push(`  gfx_rect(${name}, ${x * scale + offset}, ${y * scale + offset}, ${(end - x) * scale}, ${scale}, ${r}, ${g}, ${b});`);
          x = end;
        }
      });
    };
    if (shadow)
    {
      runs(COLORS.shadow, scale);
    }
    runs(color, 0);
    setup.push(`  set_point(0, ${name}, 0, 0, 0);`);
    return name;
  };

  const boxGraphic = (w, h, color, outline) =>
  {
    const name = `g${count++}`;
    const [r, g, b] = rgb(color);
    setup.push(`  ${name} = new_graphic(${w}, ${h});`);
    if (outline)
    {
      setup.push(`  gfx_rect_outline(${name}, 0, 0, ${w}, ${h}, ${r}, ${g}, ${b});`);
    }
    else
    {
      setup.push(`  gfx_rect(${name}, 0, 0, ${w}, ${h}, ${r}, ${g}, ${b});`);
    }
    setup.push(`  set_point(0, ${name}, 0, 0, 0);`);
    return name;
  };

  const spawns = [];
  for (const box of screen.boxes || [])
  {
    const name = boxGraphic(box.w, box.h, box.color || COLORS.accent, box.outline);
    spawns.push(`  item(${box.x}, ${box.y}, ${name}, ${frames(box.at || 0)}, ${box.until ? frames(box.until) : 999999}, ${box.z ?? 5});`);
  }
  for (const text of screen.texts || [])
  {
    const scale = text.scale || 1;
    const color = text.color || COLORS.text;
    const shadow = text.shadow !== false;
    // Typed, but never slower than MAX_TYPING seconds a text: a title is
    // readable almost at once.
    const lines = text.text.split('\n');
    const typing = lines.reduce((n, l) => n + l.replace(/[{}[\]]/g, '').length, 0) + 4 * (lines.length - 1);
    const cps = (text.cps ?? 30) > 0 ? Math.max(text.cps ?? 30, typing / MAX_TYPING) : 0;
    const at = frames(text.at || 0);
    const until = text.until ? frames(text.until) : 999999;
    const lineHeight = (GLYPH_H + (text.gap ?? 3)) * scale;
    let typed = 0;
    let last = null;
    text.text.split('\n').forEach((line, row) =>
    {
      const width = textWidth(line, scale);
      const align = text.align || 'center';
      const cx = text.x ?? Math.round(W / 2);
      const left = align === 'center' ? Math.round(cx - width / 2) : align === 'right' ? cx - width : cx;
      const top = (text.y || 0) + row * lineHeight;
      colouredChars(line, color).forEach(({ ch, color: c }, i) =>
      {
        const when = at + (cps > 0 ? Math.round(typed * 60 / cps) : 0);
        typed++;
        last = { x: left + (i + 1) * GLYPH_W * scale, y: top, when };
        if (ch !== ' ')
        {
          spawns.push(`  item(${left + i * GLYPH_W * scale}, ${top}, ${glyphGraphic(ch, scale, c, shadow)}, ${when}, ${until}, 0);`);
        }
      });
      typed += 4;
    });
    if (text.cursor && last)
    {
      const name = boxGraphic(GLYPH_W * scale - scale, GLYPH_H * scale - scale, text.cursorColor || COLORS.accent, false);
      spawns.push(`  cursor(${last.x}, ${last.y}, ${name}, ${last.when + 2}, ${until});`);
    }
  }

  lines.push('PROGRAM card;');
  lines.push('');
  lines.push('// Made by tools/trailer/cards.mjs - a screen of the DivJS trailer.');
  lines.push('');
  lines.push('GLOBAL');
  lines.push('  tick = 0;');
  lines.push('  g_star;');
  lines.push('  g_star2;');
  for (let i = 0; i < count; i++)
  {
    lines.push(`  g${i};`);
  }
  lines.push(`
// Shows graphic gr at x, y from frame t0 until frame t1.
PROCESS item(x, y, gr, t0, t1, z);
BEGIN
  LOOP
    IF (tick >= t0 AND tick < t1)
      graph = gr;
    ELSE
      graph = 0;
    END
    FRAME;
  END
END

// DIV's text cursor: a block that blinks after the typed text.
PROCESS cursor(x, y, gr, t0, t1);
BEGIN
  LOOP
    IF (tick >= t0 AND tick < t1 AND (tick / 20) MOD 2 == 0)
      graph = gr;
    ELSE
      graph = 0;
    END
    FRAME;
  END
END

// A background star drifting ${W > H ? 'left' : 'up'}, one pixel every 'every' frames.
PROCESS star(x, y, gr, every);
BEGIN
  z = 50;
  graph = gr;
  LOOP
    IF (tick MOD every == 0)
      ${W > H ? 'x = x - 1;\n      IF (x < -2) x = x + ' + (W + 4) + '; END' : 'y = y - 1;\n      IF (y < -2) y = y + ' + (H + 4) + '; END'}
    END
    FRAME;
  END
END
`);
  lines.push('BEGIN');
  lines.push(`  set_mode(${W}, ${H});`);
  lines.push('  set_fps(60, 0);');
  lines.push(`  screen_color("${COLORS.bg}");`);
  const [sr, sg, sb] = rgb(COLORS.star);
  const [tr, tg, tb] = rgb(COLORS.star2);
  lines.push('  g_star = new_graphic(1, 1);');
  lines.push(`  gfx_rect(g_star, 0, 0, 1, 1, ${sr}, ${sg}, ${sb});`);
  lines.push('  g_star2 = new_graphic(1, 1);');
  lines.push(`  gfx_rect(g_star2, 0, 0, 1, 1, ${tr}, ${tg}, ${tb});`);
  lines.push(...setup);
  if (screen.stars !== false)
  {
    // Fixed positions (a small LCG), so every take of a screen matches.
    let seed = 7;
    const next = (n) =>
    {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor(seed / 65536) % n;
    };
    const stars = Math.round(W * H / 260);
    for (let i = 0; i < stars; i++)
    {
      const bright = next(4) === 0;
      lines.push(`  star(${next(W)}, ${next(H)}, ${bright ? 'g_star2' : 'g_star'}, ${bright ? 2 + next(2) : 4 + next(6)});`);
    }
  }
  lines.push(...spawns);
  lines.push('  LOOP');
  lines.push('    tick = tick + 1;');
  lines.push('    FRAME;');
  lines.push('  END');
  lines.push('END');
  return lines.join('\n') + '\n';
}
