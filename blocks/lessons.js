// DivJS Blocks: the starting tutorial.
//
// Each lesson has a goal, a few hints, the workspace it starts from and a
// complete solution ("Show me the solution"; the tests also run every
// solution). Workspaces are Blockly's JSON serialization, written here
// with a few small helpers so a lesson reads almost like the blocks.

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
    title: 'Make a shape appear',
    goal: 'Show a teal circle in the middle of the game screen.',
    hints: [
      'From Looks, drag "look like a circle" into the "define sprite player" block.',
      'From Program, drag "create sprite player at x 160 y 120" under "when the game starts".',
      'Press ▶ Run. The screen is 320 wide and 240 tall, so 160, 120 is the middle.'
    ],
    start: workspace([
      at(20, 20, start()),
      at(20, 160, sprite('player'))
    ]),
    solution: workspace([
      at(20, 20, start(create('player', 160, 120))),
      at(20, 160, sprite('player', playerLooks()))
    ])
  },
  {
    id: 'arrows',
    title: 'Move it with the arrow keys',
    goal: 'Make the circle move when you press the arrow keys.',
    hints: [
      'Put a "forever" loop (Control) at the end of "define sprite player": it runs every frame.',
      'Inside it, add "if key right arrow pressed? then change x by 3" (Control, Sensing, Motion).',
      'Do the same for left (change x by -3), up (change y by -3) and down (change y by 3): y grows DOWN the screen.',
      'Run, then click the game so it gets the keys.'
    ],
    start: workspace([
      at(20, 20, start(create('player', 160, 120))),
      at(20, 160, sprite('player', playerLooks()))
    ]),
    solution: workspace([
      at(20, 20, start(create('player', 160, 120))),
      at(20, 160, sprite('player', playerLooks(), arrowKeys()))
    ])
  },
  {
    id: 'coin',
    title: 'Catch the coin',
    goal: 'Add a coin at a random place. When the player touches it: add 1 to the score, play a sound and move the coin somewhere else.',
    hints: [
      'Under "when the game starts", create sprite coin (at x 60, y 60 for example).',
      'In "define sprite coin": look like a small yellow circle, "go to a random place" (Motion), then forever: if touching sprite player?',
      'Inside the if: change score by 1 (the "score" variable is ready in Variables), play sound coin, go to a random place.',
      'Show the score: a "forever" with "show variable score at x 8 y 8" at the end of "when the game starts".'
    ],
    start: workspace([
      at(20, 20, start(create('player', 160, 120))),
      at(20, 170, sprite('player', playerLooks(), arrowKeys())),
      at(440, 20, sprite('coin'))
    ], [SCORE]),
    solution: workspace([
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
    title: 'Avoid the enemy',
    goal: 'Add a red box that flies around and bounces off the edges. If it touches the player, the score goes back to 0.',
    hints: [
      'Create the enemy under "when the game starts", in a corner (x 300, y 20).',
      'In "define sprite enemy": look like a red box, point in direction 40, then forever: move forward 2 steps and bounce off the edges.',
      'Still inside the forever: if touching sprite player? then set score to 0, play sound hit, and go to x 300 y 20.'
    ],
    start: workspace([
      at(20, 20, start(
        create('player', 160, 120),
        create('coin', 60, 60),
        showScore()
      )),
      at(20, 250, sprite('player', playerLooks(), arrowKeys())),
      at(440, 20, sprite('coin', ...coinBlocks())),
      at(440, 250, sprite('enemy'))
    ], [SCORE]),
    solution: workspace([
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
    title: 'Free play',
    goal: 'Make your own game with every block. The solution is an example: a ship that turns, flies and shoots at rocks.',
    hints: [
      'Every block has a tip: hold the mouse over it.',
      '"Open in the playground" takes the DIV code of your blocks to the text editor, to go on in real code.',
      'Your blocks are saved in this browser, for each lesson.'
    ],
    start: workspace([
      at(20, 20, start())
    ]),
    solution: workspace([
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
            TEXT: v(b('div_join', undefined, { A: t('rocks hit: '), B: v(b('div_var_get', variable(HITS[1]))) })),
            X: n(8),
            Y: n(8)
          }),
          b('div_if_else', undefined, {
            COND: { block: b('div_logic', { OP: 'AND' }, {
              A: { block: b('div_compare', { OP: '>=' }, { A: v(b('div_var_get', variable(HITS[1]))), B: n(5) }) },
              B: { block: b('div_not', undefined, { A: { block: key('_h') } }) }
            }) },
            DO: { block: b('div_say', undefined, { TEXT: t('You win! (hold H to hide this)'), X: n(80), Y: n(110) }) },
            ELSE: { block: b('div_say', undefined, { TEXT: t('arrows: fly  space: fire  C: centre'), X: n(8), Y: n(224) }) }
          }),
          ifThen(b('div_logic', { OP: 'OR' }, {
            A: { block: b('div_mouse_down') },
            B: { block: key('_m') }
          }), b('div_say', undefined, {
            TEXT: t('click!'),
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
