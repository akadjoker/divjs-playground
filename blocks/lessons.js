// DivJS Blocks: the starting tutorial.
//
// Each lesson has a goal, a few hints, the workspace it starts from and a
// complete solution ("Show me the solution"; the tests also run every
// solution). Workspaces are Blockly's JSON serialization, written here
// with a few small helpers so a lesson reads almost like the blocks.
// A lesson's title, goal and hints are in i18n.js (LESSON_<ID>_TITLE,
// _GOAL, _HINTS), in each language; lesson.title and the others read them
// in the page's current language. So do lesson.start and lesson.solution:
// each read builds the blocks again, with the texts the game shows (the
// "show text" blocks of the last lesson's example) in that language.

import { t as text } from './i18n.js';

// ── Helpers that build Blockly JSON ─────────────────────────────────────

function n(value)
{
  return { shadow: { type: 'div_number', fields: { NUM: value } } };
}

function t(value)
{
  return { shadow: { type: 'div_text', fields: { TEXT: value } } };
}

// A value input holding a reporter block (the number shadow stays under
// it, as when a block is dropped on a number).
function v(blockJson, shadowValue = 0)
{
  return { block: blockJson, shadow: n(shadowValue).shadow };
}

function b(type, fields = undefined, inputs = undefined)
{
  const json = { type };
  if (fields)
  {
    json.fields = fields;
  }
  if (inputs)
  {
    json.inputs = inputs;
  }
  return json;
}

// Links statement blocks one under the other; returns the first.
function stack(...blocks)
{
  const list = blocks.filter(Boolean);
  for (let i = 0; i < list.length - 1; i++)
  {
    list[i].next = { block: list[i + 1] };
  }
  return list[0];
}

function body(...blocks)
{
  const first = stack(...blocks);
  return first ? { DO: { block: first } } : undefined;
}

// A hat block placed on the workspace.
function at(x, y, json)
{
  return { ...json, x, y };
}

function start(...blocks)
{
  return b('div_start', undefined, body(...blocks));
}

function sprite(name, ...blocks)
{
  return b('div_sprite', { NAME: name }, body(...blocks));
}

function create(name, x, y)
{
  return b('div_create', { SPRITE: name }, { X: typeof x === 'object' ? x : n(x), Y: typeof y === 'object' ? y : n(y) });
}

function look(shape, size, colour)
{
  return b('div_look', { SHAPE: shape, SIZE: size, COLOUR: colour });
}

function forever(...blocks)
{
  return b('div_forever', undefined, body(...blocks));
}

function ifThen(cond, ...blocks)
{
  const inputs = { COND: { block: cond }, ...(body(...blocks) || {}) };
  return b('div_if', undefined, inputs);
}

function key(name)
{
  return b('div_key', { KEY: name });
}

function changeX(amount)
{
  return b('div_change_x', undefined, { VALUE: n(amount) });
}

function changeY(amount)
{
  return b('div_change_y', undefined, { VALUE: n(amount) });
}

function random(from, to)
{
  return b('div_random', undefined, { FROM: n(from), TO: n(to) });
}

function gotoRandom()
{
  return b('div_goto_random');
}

function touching(name)
{
  return b('div_touching', { SPRITE: name });
}

function sound(name)
{
  return b('div_sound', { SOUND: `sfx_${name}` });
}

function variable(id)
{
  return { VAR: { id } };
}

function workspace(topBlocks, variables = [])
{
  const state = { blocks: { languageVersion: 0, blocks: topBlocks } };
  if (variables.length > 0)
  {
    state.variables = variables.map(([name, id]) => ({ name, id }));
  }
  return state;
}

// ── The pieces the lessons build on ─────────────────────────────────────

const SCORE = ['score', 'var-score'];
const HITS = ['hits', 'var-hits'];
const AIM = ['aim', 'var-aim'];

const playerLooks = () => look('circle', 24, 'teal');

const arrowKeys = () => forever(
  ifThen(key('_right'), changeX(3)),
  ifThen(key('_left'), changeX(-3)),
  ifThen(key('_up'), changeY(-3)),
  ifThen(key('_down'), changeY(3))
);

const coinBlocks = () => [
  look('circle', 14, 'yellow'),
  gotoRandom(),
  forever(
    ifThen(touching('player'),
      b('div_var_change', variable(SCORE[1]), { VALUE: n(1) }),
      sound('coin'),
      gotoRandom())
  )
];

const showScore = () => forever(
  b('div_var_show', variable(SCORE[1]), { X: n(8), Y: n(8) })
);

const enemyBlocks = () => [
  look('box', 18, 'red'),
  b('div_set_angle', undefined, { ANGLE: n(40) }),
  forever(
    b('div_forward', undefined, { STEPS: n(2) }),
    b('div_bounce'),
    ifThen(touching('player'),
      b('div_var_set', variable(SCORE[1]), { VALUE: n(0) }),
      sound('hit'),
      b('div_goto', undefined, { X: n(300), Y: n(20) }))
  )
];

// ── Lessons ─────────────────────────────────────────────────────────────

export const LESSONS = [
  {
    id: 'shape',
    start: () => workspace([
      at(20, 20, start()),
      at(20, 160, sprite('player'))
    ]),
    solution: () => workspace([
      at(20, 20, start(create('player', 160, 120))),
      at(20, 160, sprite('player', playerLooks()))
    ])
  },
  {
    id: 'arrows',
    start: () => workspace([
      at(20, 20, start(create('player', 160, 120))),
      at(20, 160, sprite('player', playerLooks()))
    ]),
    solution: () => workspace([
      at(20, 20, start(create('player', 160, 120))),
      at(20, 160, sprite('player', playerLooks(), arrowKeys()))
    ])
  },
  {
    id: 'coin',
    start: () => workspace([
      at(20, 20, start(create('player', 160, 120))),
      at(20, 170, sprite('player', playerLooks(), arrowKeys())),
      at(440, 20, sprite('coin'))
    ], [SCORE]),
    solution: () => workspace([
      at(20, 20, start(
        create('player', 160, 120),
        create('coin', 60, 60),
        showScore()
      )),
      at(20, 250, sprite('player', playerLooks(), arrowKeys())),
      at(440, 20, sprite('coin', ...coinBlocks()))
    ], [SCORE])
  },
  {
    id: 'enemy',
    start: () => workspace([
      at(20, 20, start(
        create('player', 160, 120),
        create('coin', 60, 60),
        showScore()
      )),
      at(20, 250, sprite('player', playerLooks(), arrowKeys())),
      at(440, 20, sprite('coin', ...coinBlocks())),
      at(440, 250, sprite('enemy'))
    ], [SCORE]),
    solution: () => workspace([
      at(20, 20, start(
        create('player', 160, 120),
        create('coin', 60, 60),
        create('enemy', 300, 20),
        showScore()
      )),
      at(20, 290, sprite('player', playerLooks(), arrowKeys())),
      at(440, 20, sprite('coin', ...coinBlocks())),
      at(440, 290, sprite('enemy', ...enemyBlocks()))
    ], [SCORE])
  },
  {
    id: 'free',
    start: () => workspace([
      at(20, 20, start())
    ]),
    solution: () => workspace([
      at(20, 20, start(
        create('ship', 160, 120),
        b('div_repeat', undefined, {
          TIMES: n(5),
          DO: { block: stack(
            create('rock', v(random(10, 310), 160), v(random(10, 60), 30)),
            b('div_wait', undefined, { FRAMES: n(20) })
          ) }
        }),
        forever(
          b('div_say', undefined, {
            TEXT: v(b('div_join', undefined, { A: t(text('LESSON_FREE_GAME_HITS')), B: v(b('div_var_get', variable(HITS[1]))) })),
            X: n(8),
            Y: n(8)
          }),
          b('div_if_else', undefined, {
            COND: { block: b('div_logic', { OP: 'AND' }, {
              A: { block: b('div_compare', { OP: '>=' }, { A: v(b('div_var_get', variable(HITS[1]))), B: n(5) }) },
              B: { block: b('div_not', undefined, { A: { block: key('_h') } }) }
            }) },
            DO: { block: b('div_say', undefined, { TEXT: t(text('LESSON_FREE_GAME_WIN')), X: n(80), Y: n(110) }) },
            ELSE: { block: b('div_say', undefined, { TEXT: t(text('LESSON_FREE_GAME_HELP')), X: n(8), Y: n(224) }) }
          }),
          ifThen(b('div_logic', { OP: 'OR' }, {
            A: { block: b('div_mouse_down') },
            B: { block: key('_m') }
          }), b('div_say', undefined, {
            TEXT: t(text('LESSON_FREE_GAME_CLICK')),
            X: v(b('div_mouse_x')),
            Y: v(b('div_arith', { OP: '-' }, { A: v(b('div_mouse_y')), B: n(12) }))
          }))
        )
      )),
      at(20, 560, sprite('ship',
        look('triangle', 24, 'green'),
        b('div_set_angle', undefined, { ANGLE: n(90) }),
        forever(
          ifThen(key('_left'), b('div_turn', { DIR: 'left' }, { ANGLE: n(5) })),
          ifThen(key('_right'), b('div_turn', { DIR: 'right' }, { ANGLE: n(5) })),
          ifThen(key('_up'), b('div_forward', undefined, { STEPS: n(3) })),
          b('div_bounce'),
          ifThen(key('_c'), b('div_set_x', undefined, { VALUE: n(160) }), b('div_set_y', undefined, { VALUE: n(120) })),
          ifThen(b('div_key_pressed', { KEY: '_space' }),
            b('div_var_set', variable(AIM[1]), { VALUE: v(b('div_direction')) }),
            sound('laser'),
            b('div_create', { SPRITE: 'shot' }, { X: v(b('div_x'), 160), Y: v(b('div_y'), 120) }))
        )
      )),
      at(520, 20, sprite('shot',
        look('circle', 6, 'white'),
        b('div_set_size', undefined, { SIZE: n(150) }),
        b('div_set_angle', undefined, { ANGLE: v(b('div_var_get', variable(AIM[1]))) }),
        b('div_repeat', undefined, {
          TIMES: n(40),
          DO: { block: b('div_forward', undefined, { STEPS: n(5) }) }
        }),
        b('div_delete')
      )),
      at(520, 330, sprite('rock',
        look('box', 16, 'grey'),
        b('div_set_angle', undefined, { ANGLE: v(random(0, 359)) }),
        forever(
          b('div_forward', undefined, { STEPS: n(1) }),
          b('div_bounce'),
          ifThen(touching('shot'),
            b('div_var_change', variable(HITS[1]), { VALUE: n(1) }),
            sound('explosion'),
            b('div_delete'))
        )
      ))
    ], [HITS, AIM])
  }
];

for (const lesson of LESSONS)
{
  const key = `LESSON_${lesson.id.toUpperCase()}`;
  const { start: makeStart, solution: makeSolution } = lesson;
  Object.defineProperties(lesson, {
    start: { get: makeStart, enumerable: true },
    solution: { get: makeSolution, enumerable: true },
    title: { get: () => text(`${key}_TITLE`), enumerable: true },
    goal: { get: () => text(`${key}_GOAL`), enumerable: true },
    hints: { get: () => text(`${key}_HINTS`), enumerable: true }
  });
}
