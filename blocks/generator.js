// DivJS Blocks: turns a Blockly workspace into a DIV program.
//
// The program it writes is plain, tidy DIV that the text playground (and
// the DIV compiler) reads like any other:
//
//   PROGRAM my_game;
//   GLOBAL ...            one per Blockly variable
//   LOCAL look_half...    only when "bounce off the edges" is used
//   FUNCTION make_look    only when "look like" is used
//   PROCESS name(x, y);   one per "define sprite" hat
//   BEGIN ... END         MAIN: "when the game starts"
//
// Rules that keep a beginner's program alive and correct:
// - "forever" is LOOP ... FRAME; END: the FRAME is always added, so a
//   loop can never freeze the game.
// - "repeat n times" shows one frame after each time round (FOR ... FRAME;
//   END), like Scratch, so movement inside it is animated and it can
//   never run over the engine's per-frame instruction budget either.
// - A sprite or MAIN whose blocks run out without a "forever" ends in an
//   empty LOOP FRAME; END: the sprite stays on screen (as in Scratch) and
//   the game keeps running. "delete this sprite" is RETURN.
// - Sprites are processes that take their position: PROCESS name(x, y),
//   created with name(x, y).
// - Names: sprites and variables become lower-case DIV identifiers that
//   are neither keywords, nor the engine's constants, process fields or
//   functions (a variable called "x" or "key" becomes "my_x", "my_key").

import * as Blockly from './vendor/blockly.js';
import { KEYWORD_NAMES, BUILTIN_CONSTANTS, PROCESS_FIELD_NAMES, VM, CanvasEngineRuntime } from '../engine/divjs.js';
import { PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } from './blocks.js';
import { t } from './i18n.js';

// Operator precedence, tightest first, matching the DIV parser (C-like:
// unary, * / %, + -, < <= > >=, == !=, AND, OR).
export const Order = {
  ATOMIC: 0,
  MEMBER: 1,
  FUNCTION_CALL: 2,
  UNARY: 3,
  MULTIPLICATIVE: 4,
  ADDITIVE: 5,
  RELATIONAL: 6,
  EQUALITY: 7,
  AND: 8,
  OR: 9,
  NONE: 99
};

const SHAPES = { circle: 0, box: 1, triangle: 2 };

// Names of the helpers the generator itself may write.
const HELPER_NAMES = ['my_game', 'make_look', 'look_half', 'look_shape', 'look_size', 'look_rgb', 'look_graph', 'look_count'];

// The engine's functions, from a real runtime (so the list is the one
// programs can call). A stand-in 2D context is enough to register them
// where there is no canvas (Node).
function nativeNames()
{
  let ctx = null;
  if (typeof document !== 'undefined')
  {
    ctx = document.createElement('canvas').getContext('2d');
  }
  else
  {
    const canvas = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };
    ctx = new Proxy({}, { get: (target, key) => (key === 'canvas' ? canvas : () => ({})), set: () => true });
  }
  const vm = new VM();
  const runtime = new CanvasEngineRuntime({ vm, ctx });
  runtime.registerNatives();
  const names = [...vm.natives.keys()];
  runtime.dispose();
  return names;
}

let reservedCache = null;

// Every name a sprite or variable must not take, in lower case.
export function reservedNames()
{
  if (!reservedCache)
  {
    reservedCache = new Set([
      ...KEYWORD_NAMES,
      ...Object.keys(BUILTIN_CONSTANTS),
      ...PROCESS_FIELD_NAMES,
      // Paths and names the compiler knows without a declaration.
      'mouse', 'scroll', 'region', 'father', 'son', 'bigbro', 'smallbro', 'fps', 'main',
      ...nativeNames(),
      ...HELPER_NAMES
    ].map((name) => name.toLowerCase()));
  }
  return reservedCache;
}

// A readable DIV identifier from any name: lower case, letters, digits
// and underscores, not starting with a digit.
export function sanitiseName(name)
{
  let id = String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (id === '')
  {
    id = 'thing';
  }
  if (/^[0-9]/.test(id))
  {
    id = `n${id}`;
  }
  return id;
}

// Hands out unique identifiers for one program.
class NameTable
{
  constructor()
  {
    this.used = new Set(reservedNames());
  }

  take(desired)
  {
    let base = sanitiseName(desired);
    if (reservedNames().has(base))
    {
      base = `my_${base}`;
    }
    let name = base;
    for (let n = 2; this.used.has(name); n++)
    {
      name = `${base}_${n}`;
    }
    this.used.add(name);
    return name;
  }
}

// A DIV string literal.
export function quote(text)
{
  const escaped = String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\\'')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/\t/g, '\\t');
  return `'${escaped}'`;
}

// A comment in the page's language, "// " before each of its lines.
function comment(key, params = {}, indent = '')
{
  return t(key, params).split('\n').map((line) => `${indent}// ${line}`.trimEnd()).join('\n');
}

function isNumberLiteral(code)
{
  return /^-?\d+(\.\d+)?$/.test(code);
}

// ── The generator ───────────────────────────────────────────────────────

export const divGenerator = new Blockly.CodeGenerator('DIV');
divGenerator.INDENT = '  ';

// Chains a statement block to the blocks under it, with the block's
// comment (if any) as // lines above its code.
divGenerator.scrub_ = function (block, code, thisOnly)
{
  let comment = '';
  if (!block.outputConnection)
  {
    const text = block.getCommentText();
    if (text)
    {
      comment = text.split('\n').map((line) => `// ${line}`.trimEnd()).join('\n') + '\n';
    }
  }
  const next = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = thisOnly ? '' : this.blockToCode(next);
  return comment + code + nextCode;
};

divGenerator.scrubNakedValue = function (line)
{
  return `${comment('CODE_LOOSE_VALUE', { code: line })}\n`;
};

// Per program state, set up by generateDiv.
function state()
{
  return divGenerator.divState;
}

function value(block, name, order, fallback = '0')
{
  return divGenerator.valueToCode(block, name, order) || fallback;
}

function statements(block, name)
{
  return divGenerator.statementToCode(block, name);
}

// A PRIVATE counter for the process being generated ("repeat", "wait"):
// count_1, count_2... skipping names the program already uses.
function counter(prefix)
{
  const proc = state().proc;
  let name = '';
  for (let k = 1; name === '' || state().names.used.has(name) || proc.privates.includes(name); k++)
  {
    name = `${prefix}_${k}`;
  }
  proc.privates.push(name);
  return name;
}

function warn(block, text)
{
  state().warnings.push({ id: block.id, text });
}

// The DIV name of a sprite given by its name in the blocks, or null.
function spriteIdentifier(block, fieldName)
{
  const raw = block.getFieldValue(fieldName);
  const id = state().sprites.get(raw);
  if (!id)
  {
    warn(block, t('WARN_NO_SPRITE', { name: raw }));
    return null;
  }
  return id;
}

function variableIdentifier(block)
{
  const id = block.getFieldValue('VAR');
  return state().variables.get(id) || 'undefined_variable';
}

// Code to make a sprite stay alive after its blocks run out, unless its
// last block already loops or ends it.
function keepAlive(hat, key)
{
  let last = hat.getInputTargetBlock('DO');
  while (last && last.getNextBlock())
  {
    last = last.getNextBlock();
  }
  while (last && !last.isEnabled())
  {
    last = last.getPreviousBlock();
  }
  if (last && (last.type === 'div_forever' || last.type === 'div_delete'))
  {
    return '';
  }
  return `${comment(key, {}, divGenerator.INDENT)}\n${divGenerator.INDENT}LOOP\n${divGenerator.INDENT}${divGenerator.INDENT}FRAME;\n`
    + `${divGenerator.INDENT}END\n`;
}

function privatesLine(proc)
{
  if (proc.privates.length === 0)
  {
    return '';
  }
  return `PRIVATE ${proc.privates.map((name) => `${name} = 0;`).join(' ')}\n`;
}

const forBlock = divGenerator.forBlock;

// Program

forBlock.div_start = function (block)
{
  const s = state();
  const indent = divGenerator.INDENT;
  s.proc = { privates: [] };
  const body = statements(block, 'DO');
  let code = privatesLine(s.proc);
  code += 'BEGIN\n';
  code += `${indent}set_mode(${SCREEN_WIDTH}, ${SCREEN_HEIGHT});\n`;
  code += `${indent}set_fps(60, 0);\n`;
  code += `${indent}set_color('#ffffff');   ${comment('CODE_TEXT_COLOUR')}\n`;
  code += body;
  code += keepAlive(block, 'CODE_KEEP_RUNNING');
  code += 'END\n';
  return code;
};

forBlock.div_sprite = function (block)
{
  const s = state();
  const name = s.spriteOfBlock.get(block.id);
  s.proc = { privates: [] };
  const body = statements(block, 'DO');
  let code = `PROCESS ${name}(x, y);\n`;
  code += privatesLine(s.proc);
  code += 'BEGIN\n';
  code += body;
  code += keepAlive(block, 'CODE_STAY');
  code += 'END\n';
  return code;
};

forBlock.div_create = function (block)
{
  const name = spriteIdentifier(block, 'SPRITE');
  const x = value(block, 'X', Order.NONE);
  const y = value(block, 'Y', Order.NONE);
  if (!name)
  {
    return `${comment('CODE_NO_SPRITE', { name: quote(block.getFieldValue('SPRITE')) })}\n`;
  }
  return `${name}(${x}, ${y});\n`;
};

// Looks

// A dropdown value's label in the page's language ("teal" -> "azul-esverdeado").
function optionLabel(kind, value)
{
  const key = `${kind}_${String(value).toUpperCase()}`;
  const label = t(key);
  return label === key ? String(value) : label;
}

forBlock.div_look = function (block)
{
  const s = state();
  s.usesLook = true;
  const shape = block.getFieldValue('SHAPE');
  const size = Math.max(4, Math.min(200, Math.round(Number(block.getFieldValue('SIZE')) || 30)));
  const colour = block.getFieldValue('COLOUR');
  const [r, g, b] = PALETTE[colour] || PALETTE.white;
  const look = comment('CODE_LOOK', { colour: optionLabel('COLOUR', colour), shape: optionLabel('SHAPE', shape) });
  let code = `graph = make_look(${SHAPES[shape] ?? 0}, ${size}, ${r}, ${g}, ${b});   ${look}\n`;
  if (s.usesBounce)
  {
    code += `look_half = ${Math.floor(size / 2)};\n`;
  }
  return code;
};

forBlock.div_set_size = function (block)
{
  return `size = ${value(block, 'SIZE', Order.NONE, '100')};\n`;
};

forBlock.div_say = function (block)
{
  const text = value(block, 'TEXT', Order.NONE, '\'\'');
  return `text(${value(block, 'X', Order.NONE)}, ${value(block, 'Y', Order.NONE)}, ${text});\n`;
};

forBlock.div_set_angle = function (block)
{
  const angle = value(block, 'ANGLE', Order.MULTIPLICATIVE);
  return `angle = ${angle} * 1000;   ${comment('CODE_ANGLE')}\n`;
};

forBlock.div_turn = function (block)
{
  const angle = value(block, 'ANGLE', Order.MULTIPLICATIVE);
  const sign = block.getFieldValue('DIR') === 'right' ? '-' : '+';
  return `angle = angle ${sign} ${angle} * 1000;\n`;
};

// Motion

function change(field, block)
{
  const amount = value(block, 'VALUE', Order.ADDITIVE);
  if (isNumberLiteral(amount) && amount.startsWith('-'))
  {
    return `${field} = ${field} - ${amount.slice(1)};\n`;
  }
  return `${field} = ${field} + ${amount};\n`;
}

forBlock.div_set_x = function (block)
{
  return `x = ${value(block, 'VALUE', Order.NONE)};\n`;
};

forBlock.div_change_x = function (block)
{
  return change('x', block);
};

forBlock.div_set_y = function (block)
{
  return `y = ${value(block, 'VALUE', Order.NONE)};\n`;
};

forBlock.div_change_y = function (block)
{
  return change('y', block);
};

forBlock.div_forward = function (block)
{
  return `advance(${value(block, 'STEPS', Order.NONE)});\n`;
};

forBlock.div_goto = function (block)
{
  return `x = ${value(block, 'X', Order.NONE)};\ny = ${value(block, 'Y', Order.NONE)};\n`;
};

forBlock.div_goto_random = function ()
{
  return `x = rand(20, ${SCREEN_WIDTH - 20});\ny = rand(20, ${SCREEN_HEIGHT - 20});\n`;
};

// Bounce: past an edge, back inside and the angle mirrored (0 is right,
// 90000 up: a left/right wall mirrors it around 90000, a top/bottom one
// around 0). look_half keeps the whole shape inside.
forBlock.div_bounce = function ()
{
  const w = SCREEN_WIDTH;
  const h = SCREEN_HEIGHT;
  return `${comment('CODE_BOUNCE')}\n`
    + 'IF (x < look_half) x = look_half; angle = 180000 - angle; END\n'
    + `IF (x > ${w} - look_half) x = ${w} - look_half; angle = 180000 - angle; END\n`
    + 'IF (y < look_half) y = look_half; angle = -angle; END\n'
    + `IF (y > ${h} - look_half) y = ${h} - look_half; angle = -angle; END\n`;
};

forBlock.div_x = function ()
{
  return ['x', Order.ATOMIC];
};

forBlock.div_y = function ()
{
  return ['y', Order.ATOMIC];
};

forBlock.div_direction = function ()
{
  return ['angle / 1000', Order.MULTIPLICATIVE];
};

// Control

forBlock.div_forever = function (block)
{
  const indent = divGenerator.INDENT;
  return `LOOP\n${statements(block, 'DO')}${indent}FRAME;\nEND\n`;
};

forBlock.div_repeat = function (block)
{
  const indent = divGenerator.INDENT;
  const times = value(block, 'TIMES', Order.NONE);
  const i = counter('count');
  return `FOR ${i} = 1 TO ${times}\n${statements(block, 'DO')}${indent}FRAME;\nEND\n`;
};

forBlock.div_if = function (block)
{
  const cond = value(block, 'COND', Order.NONE);
  return `IF (${cond})\n${statements(block, 'DO')}END\n`;
};

forBlock.div_if_else = function (block)
{
  const cond = value(block, 'COND', Order.NONE);
  return `IF (${cond})\n${statements(block, 'DO')}ELSE\n${statements(block, 'ELSE')}END\n`;
};

forBlock.div_wait = function (block)
{
  const indent = divGenerator.INDENT;
  const frames = value(block, 'FRAMES', Order.NONE);
  const i = counter('wait');
  return `FOR ${i} = 1 TO ${frames}   ${comment('CODE_WAIT')}\n${indent}FRAME;\nEND\n`;
};

forBlock.div_delete = function ()
{
  return `RETURN;   ${comment('CODE_DELETE')}\n`;
};

// Sensing

forBlock.div_key = function (block)
{
  return [`key(${block.getFieldValue('KEY')})`, Order.FUNCTION_CALL];
};

forBlock.div_key_pressed = function (block)
{
  return [`key_pressed(${block.getFieldValue('KEY')})`, Order.FUNCTION_CALL];
};

forBlock.div_touching = function (block)
{
  const name = spriteIdentifier(block, 'SPRITE');
  if (!name)
  {
    return ['0', Order.ATOMIC];
  }
  return [`collision(TYPE ${name})`, Order.FUNCTION_CALL];
};

forBlock.div_mouse_x = function ()
{
  return ['mouse.x', Order.MEMBER];
};

forBlock.div_mouse_y = function ()
{
  return ['mouse.y', Order.MEMBER];
};

forBlock.div_mouse_down = function ()
{
  return ['mouse.left', Order.MEMBER];
};

// Operators

forBlock.div_number = function (block)
{
  const n = Number(block.getFieldValue('NUM')) || 0;
  const code = String(n);
  return [code, n < 0 ? Order.UNARY : Order.ATOMIC];
};

forBlock.div_text = function (block)
{
  return [quote(block.getFieldValue('TEXT')), Order.ATOMIC];
};

forBlock.div_arith = function (block)
{
  const op = block.getFieldValue('OP');
  const order = op === '*' || op === '/' ? Order.MULTIPLICATIVE : Order.ADDITIVE;
  return [`${value(block, 'A', order)} ${op} ${value(block, 'B', order)}`, order];
};

forBlock.div_random = function (block)
{
  return [`rand(${value(block, 'FROM', Order.NONE)}, ${value(block, 'TO', Order.NONE)})`, Order.FUNCTION_CALL];
};

forBlock.div_compare = function (block)
{
  const op = block.getFieldValue('OP');
  const order = op === '==' || op === '!=' ? Order.EQUALITY : Order.RELATIONAL;
  return [`${value(block, 'A', order)} ${op} ${value(block, 'B', order)}`, order];
};

forBlock.div_logic = function (block)
{
  const op = block.getFieldValue('OP');
  const order = op === 'AND' ? Order.AND : Order.OR;
  return [`${value(block, 'A', order)} ${op} ${value(block, 'B', order)}`, order];
};

forBlock.div_not = function (block)
{
  return [`NOT ${value(block, 'A', Order.UNARY)}`, Order.UNARY];
};

// Text + anything is text in DIV; '' + first makes sure two numbers are
// joined, not added.
forBlock.div_join = function (block)
{
  const a = value(block, 'A', Order.ADDITIVE, '\'\'');
  const b = value(block, 'B', Order.ADDITIVE, '\'\'');
  const first = a.startsWith('\'') ? a : `'' + ${a}`;
  return [`${first} + ${b}`, Order.ADDITIVE];
};

// Variables

forBlock.div_var_set = function (block)
{
  return `${variableIdentifier(block)} = ${value(block, 'VALUE', Order.NONE)};\n`;
};

forBlock.div_var_change = function (block)
{
  return change(variableIdentifier(block), block);
};

forBlock.div_var_get = function (block)
{
  return [variableIdentifier(block), Order.ATOMIC];
};

forBlock.div_var_show = function (block)
{
  const name = block.getField('VAR').getText();
  const label = quote(`${name}: `);
  return `text(${value(block, 'X', Order.NONE)}, ${value(block, 'Y', Order.NONE)}, ${label} + ${variableIdentifier(block)});\n`;
};

// Sound

forBlock.div_sound = function (block)
{
  return `play_sound(sfx(${block.getFieldValue('SOUND')}));\n`;
};

// ── Helpers the program may need ────────────────────────────────────────

function makeLook()
{
  return `${comment('CODE_MAKE_LOOK')}
FUNCTION make_look(shape, d, r, g, b);
PRIVATE i = 0; gr = 0; rgb = 0;
BEGIN
  rgb = r * 65536 + g * 256 + b;
  FOR i = 0 TO look_count - 1
    IF (look_shape[i] == shape AND look_size[i] == d AND look_rgb[i] == rgb)
      RETURN look_graph[i];
    END
  END
  gr = new_graphic(d, d);
  IF (shape == 0)
    gfx_circle(gr, d / 2, d / 2, d / 2, r, g, b);
  END
  IF (shape == 1)
    gfx_rect(gr, 0, 0, d, d, r, g, b);
  END
  IF (shape == 2)
${comment('CODE_TRIANGLE', {}, '    ')}
    FOR i = 0 TO d - 1
      gfx_line(gr, i, i / 2, i, d - 1 - i / 2, r, g, b);
    END
  END
  IF (look_count < 64)
    look_shape[look_count] = shape;
    look_size[look_count] = d;
    look_rgb[look_count] = rgb;
    look_graph[look_count] = gr;
    look_count = look_count + 1;
  END
  RETURN gr;
END
`;
}

// ── Whole program ───────────────────────────────────────────────────────

function isHat(block)
{
  return block.type === 'div_start' || block.type === 'div_sprite';
}

// Generates the DIV program for a workspace.
// Returns { code, warnings: [{ id, text }] } - warnings name blocks that
// could not be used as they are (a second "when the game starts", a sprite
// name used twice, a sprite that does not exist), in the page's language.
// The code's comments are in the page's language too; the code itself is
// the same in every language.
export function generateDiv(workspace)
{
  const gen = divGenerator;
  const names = new NameTable();
  const s = {
    names,
    warnings: [],
    sprites: new Map(),       // name in the blocks -> DIV identifier
    spriteOfBlock: new Map(), // "define sprite" block id -> DIV identifier
    variables: new Map(),     // Blockly variable id -> DIV identifier
    usesLook: false,
    usesBounce: false,
    proc: null
  };
  gen.divState = s;
  gen.init(workspace);
  gen.isInitialized = true;

  const tops = workspace.getTopBlocks(true).filter((b) => isHat(b) && b.isEnabled());
  for (const loose of workspace.getTopBlocks(false))
  {
    if (!isHat(loose) && !loose.isShadow())
    {
      warn(loose, t('WARN_LOOSE'));
    }
  }
  s.usesBounce = workspace.getAllBlocks(false).some((b) => b.type === 'div_bounce' && b.isEnabled());

  // Sprites first (their names read best unchanged), then variables.
  const spriteHats = tops.filter((b) => b.type === 'div_sprite');
  for (const hat of spriteHats)
  {
    const raw = hat.getFieldValue('NAME');
    if (s.sprites.has(raw))
    {
      warn(hat, t('WARN_SAME_SPRITE', { name: raw }));
      continue;
    }
    const id = names.take(raw);
    s.sprites.set(raw, id);
    s.spriteOfBlock.set(hat.id, id);
  }
  const variables = workspace.getVariableMap().getAllVariables();
  for (const v of variables)
  {
    s.variables.set(v.getId(), names.take(v.getName()));
  }

  const mains = tops.filter((b) => b.type === 'div_start');
  for (const extra of mains.slice(1))
  {
    warn(extra, t('WARN_TWO_STARTS'));
  }

  const processes = [];
  for (const hat of spriteHats)
  {
    if (s.spriteOfBlock.has(hat.id))
    {
      processes.push(gen.blockToCode(hat, true));
    }
  }
  let main = '';
  if (mains.length > 0)
  {
    main = gen.blockToCode(mains[0], true);
  }
  else
  {
    s.proc = { privates: [] };
    main = 'BEGIN\n'
      + `  set_mode(${SCREEN_WIDTH}, ${SCREEN_HEIGHT});\n`
      + '  set_fps(60, 0);\n'
      + `${comment('CODE_NO_START', {}, '  ')}\n`
      + '  LOOP\n    FRAME;\n  END\nEND\n';
  }

  // Assemble.
  let code = `${comment('CODE_HEADER')}\n`;
  code += `${comment('CODE_HEADER_NEXT')}\n`;
  code += 'PROGRAM my_game;\n';
  const globals = variables.map((v) => `  ${s.variables.get(v.getId())} = 0;\n`);
  if (s.usesLook)
  {
    globals.push(`${comment('CODE_LOOKS_MADE', {}, '  ')}\n`);
    globals.push('  look_shape[63]; look_size[63]; look_rgb[63]; look_graph[63];\n');
    globals.push('  look_count = 0;\n');
  }
  if (globals.length > 0)
  {
    code += `\nGLOBAL\n${globals.join('')}`;
  }
  if (s.usesBounce)
  {
    code += `\nLOCAL\n  look_half = 0;   ${comment('CODE_LOOK_HALF')}\n`;
  }
  for (const proc of processes)
  {
    code += `\n${proc}`;
  }
  if (s.usesLook)
  {
    code += `\n${makeLook()}`;
  }
  code += `\n${comment('CODE_STARTS_HERE')}\n${main}`;
  gen.divState = null;
  return { code, warnings: s.warnings };
}

divGenerator.workspaceToCode = function (workspace)
{
  return generateDiv(workspace).code;
};
