// DivJS Blocks: the block definitions and the toolbox.
//
// Every block here turns into real DIV code (see generator.js). The set is
// small on purpose: a beginner's first games need shapes, movement, keys,
// touching, a score and a sound. Blocks are defined with Blockly's JSON
// format; each one has a tooltip that says what it does in the game. Their
// words come from i18n.js, as %{BKY_DIV_...} message references.
//
// This module only defines things: it runs in the browser and, for the
// tests, in Node (a headless Blockly workspace), so it must not touch the
// page.

import * as Blockly from './vendor/blockly.js';
import { msg, t } from './i18n.js';

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
  return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, width: 22, height: 22, alt: msg(`COLOUR_${name.toUpperCase()}`) };
}

const COLOUR_OPTIONS = Object.keys(PALETTE).map((name) => [swatch(name), name]);

// Keys the sensing blocks offer: label -> DIV key constant.
const KEY_OPTIONS = [
  [msg('KEY_RIGHT'), '_right'],
  [msg('KEY_LEFT'), '_left'],
  [msg('KEY_UP'), '_up'],
  [msg('KEY_DOWN'), '_down'],
  [msg('KEY_SPACE'), '_space'],
  [msg('KEY_ENTER'), '_enter'],
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => [c, `_${c}`]),
  ...'0123456789'.split('').map((c) => [c, `_${c}`])
];

const SOUND_OPTIONS = ['coin', 'laser', 'explosion', 'powerup', 'hit', 'jump', 'blip']
  .map((name) => [msg(`SOUND_${name.toUpperCase()}`), `sfx_${name}`]);

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
    message0: msg('BLOCK_START'),
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    colour: COLOURS.program,
    tooltip: msg('TIP_START')
  },
  {
    type: 'div_sprite',
    message0: msg('BLOCK_SPRITE'),
    args0: [
      { type: 'field_input', name: 'NAME', text: 'player' },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'DO' }
    ],
    colour: COLOURS.program,
    extensions: ['div_sprite_name'],
    tooltip: msg('TIP_SPRITE')
  },
  {
    type: 'div_create',
    message0: msg('BLOCK_CREATE'),
    args0: [{ type: 'field_sprite', name: 'SPRITE', value: 'player' }, num('X'), num('Y')],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.program,
    tooltip: msg('TIP_CREATE')
  },

  // Looks
  {
    type: 'div_look',
    message0: msg('BLOCK_LOOK'),
    args0: [
      { type: 'field_dropdown', name: 'SHAPE', options: [[msg('SHAPE_CIRCLE'), 'circle'], [msg('SHAPE_BOX'), 'box'], [msg('SHAPE_TRIANGLE'), 'triangle']] },
      { type: 'field_number', name: 'SIZE', value: 30, min: 4, max: 200, precision: 1 },
      { type: 'field_dropdown', name: 'COLOUR', options: COLOUR_OPTIONS }
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: msg('TIP_LOOK')
  },
  {
    type: 'div_set_size',
    message0: msg('BLOCK_SET_SIZE'),
    args0: [num('SIZE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: msg('TIP_SET_SIZE')
  },
  {
    type: 'div_say',
    message0: msg('BLOCK_SAY'),
    args0: [num('TEXT'), num('X'), num('Y')],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: msg('TIP_SAY')
  },
  {
    type: 'div_set_angle',
    message0: msg('BLOCK_SET_ANGLE'),
    args0: [num('ANGLE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: msg('TIP_SET_ANGLE')
  },
  {
    type: 'div_turn',
    message0: msg('BLOCK_TURN'),
    args0: [
      { type: 'field_dropdown', name: 'DIR', options: [[msg('TURN_LEFT'), 'left'], [msg('TURN_RIGHT'), 'right']] },
      num('ANGLE')
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.looks,
    tooltip: msg('TIP_TURN')
  },

  // Motion
  {
    type: 'div_set_x',
    message0: msg('BLOCK_SET_X'),
    args0: [num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: msg('TIP_SET_X')
  },
  {
    type: 'div_change_x',
    message0: msg('BLOCK_CHANGE_X'),
    args0: [num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: msg('TIP_CHANGE_X')
  },
  {
    type: 'div_set_y',
    message0: msg('BLOCK_SET_Y'),
    args0: [num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: msg('TIP_SET_Y')
  },
  {
    type: 'div_change_y',
    message0: msg('BLOCK_CHANGE_Y'),
    args0: [num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: msg('TIP_CHANGE_Y')
  },
  {
    type: 'div_forward',
    message0: msg('BLOCK_FORWARD'),
    args0: [num('STEPS')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: msg('TIP_FORWARD')
  },
  {
    type: 'div_goto',
    message0: msg('BLOCK_GOTO'),
    args0: [num('X'), num('Y')],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: msg('TIP_GOTO')
  },
  {
    type: 'div_goto_random',
    message0: msg('BLOCK_GOTO_RANDOM'),
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: msg('TIP_GOTO_RANDOM')
  },
  {
    type: 'div_bounce',
    message0: msg('BLOCK_BOUNCE'),
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.motion,
    tooltip: msg('TIP_BOUNCE')
  },
  {
    type: 'div_x',
    message0: msg('BLOCK_X'),
    output: 'Number',
    colour: COLOURS.motion,
    tooltip: msg('TIP_X')
  },
  {
    type: 'div_y',
    message0: msg('BLOCK_Y'),
    output: 'Number',
    colour: COLOURS.motion,
    tooltip: msg('TIP_Y')
  },
  {
    type: 'div_direction',
    message0: msg('BLOCK_DIRECTION'),
    output: 'Number',
    colour: COLOURS.motion,
    tooltip: msg('TIP_DIRECTION')
  },

  // Control
  {
    type: 'div_forever',
    message0: msg('BLOCK_FOREVER'),
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    colour: COLOURS.control,
    tooltip: msg('TIP_FOREVER')
  },
  {
    type: 'div_repeat',
    message0: msg('BLOCK_REPEAT'),
    args0: [num('TIMES'), { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.control,
    tooltip: msg('TIP_REPEAT')
  },
  {
    type: 'div_if',
    message0: msg('BLOCK_IF'),
    args0: [num('COND', BOOLEAN), { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.control,
    tooltip: msg('TIP_IF')
  },
  {
    type: 'div_if_else',
    message0: msg('BLOCK_IF_ELSE'),
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
    tooltip: msg('TIP_IF_ELSE')
  },
  {
    type: 'div_wait',
    message0: msg('BLOCK_WAIT'),
    args0: [num('FRAMES')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.control,
    tooltip: msg('TIP_WAIT')
  },
  {
    type: 'div_delete',
    message0: msg('BLOCK_DELETE'),
    previousStatement: null,
    colour: COLOURS.control,
    tooltip: msg('TIP_DELETE')
  },

  // Sensing
  {
    type: 'div_key',
    message0: msg('BLOCK_KEY'),
    args0: [{ type: 'field_dropdown', name: 'KEY', options: KEY_OPTIONS }],
    output: BOOLEAN,
    colour: COLOURS.sensing,
    tooltip: msg('TIP_KEY')
  },
  {
    type: 'div_key_pressed',
    message0: msg('BLOCK_KEY_PRESSED'),
    args0: [{ type: 'field_dropdown', name: 'KEY', options: KEY_OPTIONS }],
    output: BOOLEAN,
    colour: COLOURS.sensing,
    tooltip: msg('TIP_KEY_PRESSED')
  },
  {
    type: 'div_touching',
    message0: msg('BLOCK_TOUCHING'),
    args0: [{ type: 'field_sprite', name: 'SPRITE', value: 'player' }],
    output: BOOLEAN,
    colour: COLOURS.sensing,
    tooltip: msg('TIP_TOUCHING')
  },
  {
    type: 'div_mouse_x',
    message0: msg('BLOCK_MOUSE_X'),
    output: 'Number',
    colour: COLOURS.sensing,
    tooltip: msg('TIP_MOUSE_X')
  },
  {
    type: 'div_mouse_y',
    message0: msg('BLOCK_MOUSE_Y'),
    output: 'Number',
    colour: COLOURS.sensing,
    tooltip: msg('TIP_MOUSE_Y')
  },
  {
    type: 'div_mouse_down',
    message0: msg('BLOCK_MOUSE_DOWN'),
    output: BOOLEAN,
    colour: COLOURS.sensing,
    tooltip: msg('TIP_MOUSE_DOWN')
  },

  // Operators
  {
    type: 'div_number',
    message0: '%1',
    args0: [{ type: 'field_number', name: 'NUM', value: 0 }],
    output: 'Number',
    colour: COLOURS.operators,
    tooltip: msg('TIP_NUMBER')
  },
  {
    type: 'div_text',
    message0: '%1',
    args0: [{ type: 'field_input', name: 'TEXT', text: 'hello' }],
    output: 'String',
    colour: COLOURS.operators,
    tooltip: msg('TIP_TEXT')
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
    tooltip: msg('TIP_ARITH')
  },
  {
    type: 'div_random',
    message0: msg('BLOCK_RANDOM'),
    args0: [num('FROM'), num('TO')],
    inputsInline: true,
    output: 'Number',
    colour: COLOURS.operators,
    tooltip: msg('TIP_RANDOM')
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
    tooltip: msg('TIP_COMPARE')
  },
  {
    type: 'div_logic',
    message0: '%1 %2 %3',
    args0: [
      num('A', BOOLEAN),
      { type: 'field_dropdown', name: 'OP', options: [[msg('LOGIC_AND'), 'AND'], [msg('LOGIC_OR'), 'OR']] },
      num('B', BOOLEAN)
    ],
    inputsInline: true,
    output: BOOLEAN,
    colour: COLOURS.operators,
    tooltip: msg('TIP_LOGIC')
  },
  {
    type: 'div_not',
    message0: msg('BLOCK_NOT'),
    args0: [num('A', BOOLEAN)],
    output: BOOLEAN,
    colour: COLOURS.operators,
    tooltip: msg('TIP_NOT')
  },
  {
    type: 'div_join',
    message0: msg('BLOCK_JOIN'),
    args0: [num('A'), num('B')],
    inputsInline: true,
    output: 'String',
    colour: COLOURS.operators,
    tooltip: msg('TIP_JOIN')
  },

  // Variables
  {
    type: 'div_var_set',
    message0: msg('BLOCK_VAR_SET'),
    args0: [{ type: 'field_variable', name: 'VAR', variable: null }, num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.variables,
    tooltip: msg('TIP_VAR_SET')
  },
  {
    type: 'div_var_change',
    message0: msg('BLOCK_VAR_CHANGE'),
    args0: [{ type: 'field_variable', name: 'VAR', variable: null }, num('VALUE')],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.variables,
    tooltip: msg('TIP_VAR_CHANGE')
  },
  {
    type: 'div_var_get',
    message0: '%1',
    args0: [{ type: 'field_variable', name: 'VAR', variable: null }],
    output: null,
    colour: COLOURS.variables,
    tooltip: msg('TIP_VAR_GET')
  },
  {
    type: 'div_var_show',
    message0: msg('BLOCK_VAR_SHOW'),
    args0: [{ type: 'field_variable', name: 'VAR', variable: null }, num('X'), num('Y')],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.variables,
    tooltip: msg('TIP_VAR_SHOW')
  },

  // Sound
  {
    type: 'div_sound',
    message0: msg('BLOCK_SOUND'),
    args0: [{ type: 'field_dropdown', name: 'SOUND', options: SOUND_OPTIONS }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.sound,
    tooltip: msg('TIP_SOUND')
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
  const items = [{ kind: 'button', text: t('MAKE_VARIABLE'), callbackKey: 'DIV_CREATE_VARIABLE' }];
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

// The toolbox in the current language (the page sets it again after a
// language switch: the new blocks' starting texts are in that language).
export function toolbox()
{
  return {
    kind: 'categoryToolbox',
    contents: [
      { kind: 'category', name: msg('CAT_PROGRAM'), colour: COLOURS.program, custom: 'DIV_PROGRAM' },
      {
        kind: 'category',
        name: msg('CAT_LOOKS'),
        colour: COLOURS.looks,
        contents: [
          block('div_look', {}, { SHAPE: 'circle', SIZE: 30, COLOUR: 'teal' }),
          block('div_set_size', { SIZE: 100 }),
          block('div_say', { TEXT: t('NEW_SAY'), X: 10, Y: 10 }),
          block('div_set_angle', { ANGLE: 90 }),
          block('div_turn', { ANGLE: 15 }, { DIR: 'left' })
        ]
      },
      {
        kind: 'category',
        name: msg('CAT_MOTION'),
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
        name: msg('CAT_CONTROL'),
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
      { kind: 'category', name: msg('CAT_SENSING'), colour: COLOURS.sensing, custom: 'DIV_SENSING' },
      {
        kind: 'category',
        name: msg('CAT_OPERATORS'),
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
          block('div_join', { A: t('NEW_JOIN'), B: 0 }),
          block('div_number', {}, { NUM: 0 }),
          block('div_text', {}, { TEXT: t('NEW_TEXT') })
        ]
      },
      { kind: 'category', name: msg('CAT_VARIABLES'), colour: COLOURS.variables, custom: 'DIV_VARIABLES' },
      {
        kind: 'category',
        name: msg('CAT_SOUND'),
        colour: COLOURS.sound,
        contents: [block('div_sound', {}, { SOUND: 'sfx_coin' })]
      }
    ]
  };
}

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
