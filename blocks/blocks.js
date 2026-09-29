// DivJS Blocks: the block definitions and the toolbox.
//
// Every block here turns into real DIV code (see generator.js). The set is
// small on purpose: a beginner's first games need shapes, movement, keys,
// touching, a score and a sound. Blocks are defined with Blockly's JSON
// format; each one has a tooltip that says what it does in the game.
//
// This module only defines things: it runs in the browser and, for the
// tests, in Node (a headless Blockly workspace), so it must not touch the
// page.

import * as Blockly from './vendor/blockly.js';

// Category colours, like Scratch's (a little darker so the white text on
// the blocks stays readable).
export const COLOURS = {
  program: '#0f9e8a',
  looks: '#8a5cf5',
  motion: '#3d7fe0',
  control: '#d18a0e',
  sensing: '#2b93c0',
  operators: '#3a9f3a',
  variables: '#e0641b',
  sound: '#c050c0'
};

// The palette the "look like" block offers: name -> [r, g, b].
export const PALETTE = {
  red: [255, 77, 77],
  orange: [255, 153, 51],
  yellow: [255, 221, 51],
  green: [76, 217, 100],
  teal: [45, 212, 191],
  blue: [77, 151, 255],
  purple: [165, 110, 255],
  pink: [255, 110, 199],
  white: [240, 240, 240],
  grey: [140, 150, 160]
};

// Screen size of every Blocks program (the generator's set_mode).
export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 240;

function swatch(name)
{
  const [r, g, b] = PALETTE[name];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22">`
    + `<rect x="1" y="1" width="20" height="20" rx="5" fill="rgb(${r},${g},${b})" stroke="#ffffff" stroke-width="2"/></svg>`;
  return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, width: 22, height: 22, alt: name };
}

const COLOUR_OPTIONS = Object.keys(PALETTE).map((name) => [swatch(name), name]);

// Keys the sensing blocks offer: label -> DIV key constant.
const KEY_OPTIONS = [
  ['right arrow', '_right'],
  ['left arrow', '_left'],
  ['up arrow', '_up'],
  ['down arrow', '_down'],
  ['space', '_space'],
  ['enter', '_enter'],
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => [c, `_${c}`]),
  ...'0123456789'.split('').map((c) => [c, `_${c}`])
];

const SOUND_OPTIONS = ['coin', 'laser', 'explosion', 'powerup', 'hit', 'jump', 'blip']
  .map((name) => [name, `sfx_${name}`]);

// ── The sprite name dropdown ────────────────────────────────────────────

// Names of the sprites defined (with "define sprite") in a workspace, in
// the order they appear. A flyout's blocks look at the main workspace.
export function spriteNames(workspace)
{
  const ws = workspace?.targetWorkspace || workspace;
  if (!ws)
  {
    return [];
  }
  const names = [];
  for (const block of ws.getBlocksByType('div_sprite', true))
  {
    const name = block.getFieldValue('NAME');
    if (name && !names.includes(name))
    {
      names.push(name);
    }
  }
  return names;
}

// A dropdown listing the workspace's sprites. Unlike a plain dropdown it
// accepts any name (a saved workspace may load a "create sprite" block
// before the "define sprite" block it names, and a sprite may be renamed
// or deleted later): the generator reports names that do not exist.
export class FieldSpriteName extends Blockly.FieldDropdown
{
  constructor(value, validator, config)
  {
    super(function ()
    {
      return this.spriteOptions();
    }, validator, config);
    if (value)
    {
      this.setValue(value);
    }
  }

  static fromJson(options)
  {
    return new this(options.value, undefined, options);
  }

  spriteOptions()
  {
    const names = spriteNames(this.getSourceBlock()?.workspace);
    const current = this.getValue();
    if (current && !names.includes(current))
    {
      names.push(current);
    }
    if (names.length === 0)
    {
      names.push('player');
    }
    return names.map((name) => [name, name]);
  }

  // Always rebuilt: the sprites change while the menu's cache would not.
  getOptions()
  {
    return super.getOptions(false);
  }

  doClassValidation_(value)
  {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }
}

// ── Block definitions ───────────────────────────────────────────────────

function num(name, check = null)
{
  return { type: 'input_value', name, check };
}

const BOOLEAN = 'Boolean';

const DEFINITIONS = [
  // Program
  {
    type: 'div_start',
    message0: 'when the game starts %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    colour: COLOURS.program,
    tooltip: 'The game starts here: create your sprites with "create sprite". '
      + 'The screen is 320 wide and 240 tall; x grows to the right and y grows down.'
  },
  {
    type: 'div_sprite',
    message0: 'define sprite %1 %2 %3',
    args0: [
      { type: 'field_input', name: 'NAME', text: 'player' },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'DO' }
    ],
    colour: COLOURS.program,
    extensions: ['div_sprite_name'],
    tooltip: 'What a sprite looks like and what it does. Nothing appears until '
      + '"create sprite" makes one; every copy runs these blocks on its own.'
  },
  {
    type: 'div_create',
    message0: 'create sprite %1 at x %2 y %3',
    args0: [{ type: 'field_sprite', name: 'SPRITE', value: 'player' }, num('X'), num('Y')],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.program,
    tooltip: 'Makes a new copy of a sprite at this place on the screen. You can create as many as you like.'
  },

  // Looks
  {
    type: 'div_look',
    message0: 'look like a %1 size %2 colour %3',
    args0: [
      { type: 'field_dropdown', name: 'SHAPE', options: [['circle', 'circle'], ['box', 'box'], ['triangle', 'triangle']] },
      { type: 'field_number', name: 'SIZE', value: 30, min: 4, max: 200, precision: 1 },
      { type: 'field_dropdown', name: 'COLOUR', options: COLOUR_OPTIONS }
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: 'Gives the sprite a shape to show: size is its width in pixels (4 to 200). '
      + 'The triangle points the way the sprite is facing.'
  },
  {
    type: 'div_set_size',
    message0: 'set size to %1 %%',
    args0: [num('SIZE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: 'Makes the sprite bigger or smaller: 100 is its normal size, 50 is half, 200 is double.'
  },
  {
    type: 'div_say',
    message0: 'show text %1 at x %2 y %3',
    args0: [num('TEXT'), num('X'), num('Y')],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: 'Writes a text on the screen for one frame: put it inside a "forever" loop to keep it there.'
  },
  {
    type: 'div_set_angle',
    message0: 'point in direction %1 degrees',
    args0: [num('ANGLE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: 'Turns the sprite to face a direction: 0 is right, 90 is up, 180 is left, 270 (or -90) is down.'
  },
  {
    type: 'div_turn',
    message0: 'turn %1 by %2 degrees',
    args0: [
      { type: 'field_dropdown', name: 'DIR', options: [['left ↺', 'left'], ['right ↻', 'right']] },
      num('ANGLE')
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: 'Turns the sprite a little. "move forward" then goes the new way.'
  },

  // Motion
  {
    type: 'div_set_x',
    message0: 'set x to %1',
    args0: [num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: 'Moves the sprite to this x: 0 is the left edge, 320 the right edge.'
  },
  {
    type: 'div_change_x',
    message0: 'change x by %1',
    args0: [num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: 'Moves the sprite sideways: a positive number goes right, a negative one goes left.'
  },
  {
    type: 'div_set_y',
    message0: 'set y to %1',
    args0: [num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: 'Moves the sprite to this y: 0 is the top edge, 240 the bottom edge.'
  },
  {
    type: 'div_change_y',
    message0: 'change y by %1',
    args0: [num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: 'Moves the sprite up or down: a positive number goes DOWN the screen, a negative one goes up.'
  },
  {
    type: 'div_forward',
    message0: 'move forward %1 steps',
    args0: [num('STEPS')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: 'Moves the sprite this many pixels the way it is facing (see "point in direction").'
  },
  {
    type: 'div_goto',
    message0: 'go to x %1 y %2',
    args0: [num('X'), num('Y')],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: 'Jumps the sprite to this place on the screen.'
  },
  {
    type: 'div_goto_random',
    message0: 'go to a random place',
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: 'Jumps the sprite to a random place on the screen (at least 20 pixels from the edges).'
  },
  {
    type: 'div_bounce',
    message0: 'bounce off the edges',
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: 'If the sprite has gone past an edge of the screen, puts it back and turns it round like a ball. '
      + 'Use it with "move forward", inside a "forever" loop.'
  },
  {
    type: 'div_x',
    message0: 'x position',
    output: 'Number',
    colour: COLOURS.motion,
    tooltip: 'Where the sprite is across the screen (0 at the left, 320 at the right).'
  },
  {
    type: 'div_y',
    message0: 'y position',
    output: 'Number',
    colour: COLOURS.motion,
    tooltip: 'Where the sprite is down the screen (0 at the top, 240 at the bottom).'
  },
  {
    type: 'div_direction',
    message0: 'direction',
    output: 'Number',
    colour: COLOURS.motion,
    tooltip: 'The way the sprite is facing, in degrees (0 right, 90 up).'
  },

  // Control
  {
    type: 'div_forever',
    message0: 'forever %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    colour: COLOURS.control,
    tooltip: 'Runs the blocks inside again and again, once every frame (60 times a second), until the game stops.'
  },
  {
    type: 'div_repeat',
    message0: 'repeat %1 times %2 %3',
    args0: [num('TIMES'), { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.control,
    tooltip: 'Runs the blocks inside this many times. The game shows one frame after each time round, '
      + 'so you see every step of a movement.'
  },
  {
    type: 'div_if',
    message0: 'if %1 then %2 %3',
    args0: [num('COND', BOOLEAN), { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.control,
    tooltip: 'Runs the blocks inside only when the condition is true.'
  },
  {
    type: 'div_if_else',
    message0: 'if %1 then %2 %3 else %4 %5',
    args0: [
      num('COND', BOOLEAN),
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'DO' },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'ELSE' }
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.control,
    tooltip: 'Runs the first blocks when the condition is true, the second ones when it is not.'
  },
  {
    type: 'div_wait',
    message0: 'wait %1 frames',
    args0: [num('FRAMES')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.control,
    tooltip: 'Waits this many frames before going on: 60 frames is one second. The rest of the game keeps moving.'
  },
  {
    type: 'div_delete',
    message0: 'delete this sprite',
    previousStatement: null,
    colour: COLOURS.control,
    tooltip: 'Removes this copy of the sprite from the game (a coin that was picked up, a shot that hit something).'
  },

  // Sensing
  {
    type: 'div_key',
    message0: 'key %1 pressed?',
    args0: [{ type: 'field_dropdown', name: 'KEY', options: KEY_OPTIONS }],
    output: BOOLEAN,
    colour: COLOURS.sensing,
    tooltip: 'True while this key is held down. Click the game first so it gets the keys.'
  },
  {
    type: 'div_key_pressed',
    message0: 'key %1 just pressed?',
    args0: [{ type: 'field_dropdown', name: 'KEY', options: KEY_OPTIONS }],
    output: BOOLEAN,
    colour: COLOURS.sensing,
    tooltip: 'True only in the frame the key goes down: one shot per press, even if the key is held.'
  },
  {
    type: 'div_touching',
    message0: 'touching sprite %1 ?',
    args0: [{ type: 'field_sprite', name: 'SPRITE', value: 'player' }],
    output: BOOLEAN,
    colour: COLOURS.sensing,
    tooltip: 'True when this sprite overlaps a sprite of that kind. Both need a "look like" block to have a size.'
  },
  {
    type: 'div_mouse_x',
    message0: 'mouse x',
    output: 'Number',
    colour: COLOURS.sensing,
    tooltip: 'Where the mouse pointer is across the game screen.'
  },
  {
    type: 'div_mouse_y',
    message0: 'mouse y',
    output: 'Number',
    colour: COLOURS.sensing,
    tooltip: 'Where the mouse pointer is down the game screen.'
  },
  {
    type: 'div_mouse_down',
    message0: 'mouse button down?',
    output: BOOLEAN,
    colour: COLOURS.sensing,
    tooltip: 'True while the left mouse button is held down over the game.'
  },

  // Operators
  {
    type: 'div_number',
    message0: '%1',
    args0: [{ type: 'field_number', name: 'NUM', value: 0 }],
    output: 'Number',
    colour: COLOURS.operators,
    tooltip: 'A number.'
  },
  {
    type: 'div_text',
    message0: '%1',
    args0: [{ type: 'field_input', name: 'TEXT', text: 'hello' }],
    output: 'String',
    colour: COLOURS.operators,
    tooltip: 'Some text.'
  },
  {
    type: 'div_arith',
    message0: '%1 %2 %3',
    args0: [
      num('A'),
      { type: 'field_dropdown', name: 'OP', options: [['+', '+'], ['-', '-'], ['×', '*'], ['÷', '/']] },
      num('B')
    ],
    inputsInline: true,
    output: 'Number',
    colour: COLOURS.operators,
    tooltip: 'Adds, subtracts, multiplies or divides. Dividing two whole numbers gives a whole number: 7 ÷ 2 is 3.'
  },
  {
    type: 'div_random',
    message0: 'pick random %1 to %2',
    args0: [num('FROM'), num('TO')],
    inputsInline: true,
    output: 'Number',
    colour: COLOURS.operators,
    tooltip: 'A random whole number from the first number to the second (both included).'
  },
  {
    type: 'div_compare',
    message0: '%1 %2 %3',
    args0: [
      num('A'),
      { type: 'field_dropdown', name: 'OP', options: [['=', '=='], ['≠', '!='], ['<', '<'], ['≤', '<='], ['>', '>'], ['≥', '>=']] },
      num('B')
    ],
    inputsInline: true,
    output: BOOLEAN,
    colour: COLOURS.operators,
    tooltip: 'Compares two values: true or false.'
  },
  {
    type: 'div_logic',
    message0: '%1 %2 %3',
    args0: [
      num('A', BOOLEAN),
      { type: 'field_dropdown', name: 'OP', options: [['and', 'AND'], ['or', 'OR']] },
      num('B', BOOLEAN)
    ],
    inputsInline: true,
    output: BOOLEAN,
    colour: COLOURS.operators,
    tooltip: '"and" is true when both sides are true; "or" when at least one of them is.'
  },
  {
    type: 'div_not',
    message0: 'not %1',
    args0: [num('A', BOOLEAN)],
    output: BOOLEAN,
    colour: COLOURS.operators,
    tooltip: 'True when the condition inside is false, and false when it is true.'
  },
  {
    type: 'div_join',
    message0: 'join %1 %2',
    args0: [num('A'), num('B')],
    inputsInline: true,
    output: 'String',
    colour: COLOURS.operators,
    tooltip: 'Puts two things together as text: join "score: " and 5 gives "score: 5".'
  },

  // Variables
  {
    type: 'div_var_set',
    message0: 'set %1 to %2',
    args0: [{ type: 'field_variable', name: 'VAR', variable: null }, num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.variables,
    tooltip: 'Gives the variable a new value. Variables are shared by the whole game.'
  },
  {
    type: 'div_var_change',
    message0: 'change %1 by %2',
    args0: [{ type: 'field_variable', name: 'VAR', variable: null }, num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.variables,
    tooltip: 'Adds a number to the variable (a negative number takes some away).'
  },
  {
    type: 'div_var_get',
    message0: '%1',
    args0: [{ type: 'field_variable', name: 'VAR', variable: null }],
    output: null,
    colour: COLOURS.variables,
    tooltip: 'The value the variable holds now.'
  },
  {
    type: 'div_var_show',
    message0: 'show variable %1 at x %2 y %3',
    args0: [{ type: 'field_variable', name: 'VAR', variable: null }, num('X'), num('Y')],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.variables,
    tooltip: 'Writes the variable\'s name and value on the screen for one frame: put it inside a "forever" loop.'
  },

  // Sound
  {
    type: 'div_sound',
    message0: 'play sound %1',
    args0: [{ type: 'field_dropdown', name: 'SOUND', options: SOUND_OPTIONS }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.sound,
    tooltip: 'Plays a sound effect made by the engine (no file needed). Browsers only play sound after a click or a key press.'
  }
];

export const BLOCK_TYPES = DEFINITIONS.map((d) => d.type);

let registered = false;

// Registers the custom field and every block (once).
export function registerBlocks()
{
  if (registered)
  {
    return;
  }
  registered = true;
  Blockly.fieldRegistry.register('field_sprite', FieldSpriteName);
  // A sprite needs a name: an empty one is refused while typing.
  Blockly.Extensions.register('div_sprite_name', function ()
  {
    this.getField('NAME').setValidator((text) => (String(text).trim() === '' ? null : text));
  });
  Blockly.common.defineBlocksWithJsonArray(DEFINITIONS);
}

// ── Toolbox ─────────────────────────────────────────────────────────────

function shadowNumber(value)
{
  return { shadow: { type: 'div_number', fields: { NUM: value } } };
}

function shadowText(value)
{
  return { shadow: { type: 'div_text', fields: { TEXT: value } } };
}

function block(type, inputs = {}, fields = undefined)
{
  const info = { kind: 'block', type };
  if (fields)
  {
    info.fields = fields;
  }
  if (Object.keys(inputs).length > 0)
  {
    info.inputs = {};
    for (const [name, value] of Object.entries(inputs))
    {
      info.inputs[name] = typeof value === 'string' ? shadowText(value) : shadowNumber(value);
    }
  }
  return info;
}

// The Program and Sensing categories are built when opened, so their
// sprite dropdowns start on a sprite the workspace really has.
function programFlyout(workspace)
{
  const names = spriteNames(workspace);
  // A new "define sprite" gets a name no sprite has yet.
  let fresh = names.includes('player') ? 'sprite' : 'player';
  for (let n = 2; names.includes(fresh); n++)
  {
    fresh = `sprite${n}`;
  }
  return [
    block('div_start'),
    block('div_sprite', {}, { NAME: fresh }),
    block('div_create', { X: 160, Y: 120 }, { SPRITE: names[0] || 'player' })
  ];
}

function sensingFlyout(workspace)
{
  const sprite = spriteNames(workspace)[0] || 'player';
  return [
    block('div_key', {}, { KEY: '_right' }),
    block('div_key_pressed', {}, { KEY: '_space' }),
    block('div_touching', {}, { SPRITE: sprite }),
    block('div_mouse_x'),
    block('div_mouse_y'),
    block('div_mouse_down')
  ];
}

// Variables: a button to make one, then the blocks for the newest one.
function variablesFlyout(workspace)
{
  const items = [{ kind: 'button', text: 'Make a variable', callbackKey: 'DIV_CREATE_VARIABLE' }];
  const variables = workspace.getVariableMap().getAllVariables();
  if (variables.length === 0)
  {
    return items;
  }
  const variable = variables[variables.length - 1];
  const field = { VAR: { id: variable.getId() } };
  items.push(
    block('div_var_set', { VALUE: 0 }, field),
    block('div_var_change', { VALUE: 1 }, field),
    block('div_var_show', { X: 10, Y: 10 }, field)
  );
  for (const v of variables)
  {
    items.push(block('div_var_get', {}, { VAR: { id: v.getId() } }));
  }
  return items;
}

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Program', colour: COLOURS.program, custom: 'DIV_PROGRAM' },
    {
      kind: 'category',
      name: 'Looks',
      colour: COLOURS.looks,
      contents: [
        block('div_look', {}, { SHAPE: 'circle', SIZE: 30, COLOUR: 'teal' }),
        block('div_set_size', { SIZE: 100 }),
        block('div_say', { TEXT: 'Hello!', X: 10, Y: 10 }),
        block('div_set_angle', { ANGLE: 90 }),
        block('div_turn', { ANGLE: 15 }, { DIR: 'left' })
      ]
    },
    {
      kind: 'category',
      name: 'Motion',
      colour: COLOURS.motion,
      contents: [
        block('div_change_x', { VALUE: 4 }),
        block('div_change_y', { VALUE: 4 }),
        block('div_set_x', { VALUE: 160 }),
        block('div_set_y', { VALUE: 120 }),
        block('div_goto', { X: 160, Y: 120 }),
        block('div_goto_random'),
        block('div_forward', { STEPS: 3 }),
        block('div_bounce'),
        block('div_x'),
        block('div_y'),
        block('div_direction')
      ]
    },
    {
      kind: 'category',
      name: 'Control',
      colour: COLOURS.control,
      contents: [
        block('div_forever'),
        block('div_repeat', { TIMES: 10 }),
        block('div_if'),
        block('div_if_else'),
        block('div_wait', { FRAMES: 60 }),
        block('div_delete')
      ]
    },
    { kind: 'category', name: 'Sensing', colour: COLOURS.sensing, custom: 'DIV_SENSING' },
    {
      kind: 'category',
      name: 'Operators',
      colour: COLOURS.operators,
      contents: [
        block('div_arith', { A: 1, B: 1 }, { OP: '+' }),
        block('div_arith', { A: 1, B: 1 }, { OP: '-' }),
        block('div_arith', { A: 1, B: 1 }, { OP: '*' }),
        block('div_arith', { A: 1, B: 1 }, { OP: '/' }),
        block('div_random', { FROM: 1, TO: 10 }),
        block('div_compare', { A: 0, B: 50 }, { OP: '>' }),
        block('div_compare', { A: 0, B: 50 }, { OP: '<' }),
        block('div_compare', { A: 0, B: 50 }, { OP: '==' }),
        block('div_logic', {}, { OP: 'AND' }),
        block('div_logic', {}, { OP: 'OR' }),
        block('div_not'),
        block('div_join', { A: 'score: ', B: 0 }),
        block('div_number', {}, { NUM: 0 }),
        block('div_text', {}, { TEXT: 'hello' })
      ]
    },
    { kind: 'category', name: 'Variables', colour: COLOURS.variables, custom: 'DIV_VARIABLES' },
    {
      kind: 'category',
      name: 'Sound',
      colour: COLOURS.sound,
      contents: [block('div_sound', {}, { SOUND: 'sfx_coin' })]
    }
  ]
};

// Hooks the dynamic categories and the "Make a variable" button into a
// workspace made by Blockly.inject.
export function registerFlyouts(workspace)
{
  workspace.registerToolboxCategoryCallback('DIV_PROGRAM', programFlyout);
  workspace.registerToolboxCategoryCallback('DIV_SENSING', sensingFlyout);
  workspace.registerToolboxCategoryCallback('DIV_VARIABLES', variablesFlyout);
  workspace.registerButtonCallback('DIV_CREATE_VARIABLE', (button) =>
  {
    Blockly.Variables.createVariableButtonHandler(button.getTargetWorkspace());
  });
}
