// DivJS Blocks: the page's words in English and in Portuguese (Portugal).
//
// One table per language, with the same keys. English is complete; a key
// missing from another language falls back to English (the tests report
// missing keys). Texts take {name} parameters; block messages keep
// Blockly's %1, %2... for their inputs, in any order the language needs.
//
// Every string also goes into Blockly.Msg as DIV_<KEY>, so the block
// definitions and the toolbox name them as %{BKY_DIV_<KEY>}: Blockly looks
// them up when it builds a block, and the page rebuilds the blocks when
// the language changes. Blockly's own messages (menus, dialogs, the
// variable prompts) switch with them: Blockly's English and its Portuguese
// from Portugal, bundled in vendor/blockly.js.
//
// Words used throughout the Portuguese: sprite = "personagem", frame =
// "fotograma", screen = "ecrã", key = "tecla", press = "carregar em",
// random = "ao acaso". The blocks speak to the player ("anda", "vira",
// "repete"), like Scratch's Portuguese.
//
// Only what the player reads changes: dropdown values, sprite names and
// the generated DIV code are the same in every language.

import * as Blockly from './vendor/blockly.js';

const EN = {
  // Page
  TAGLINE: 'Snap blocks together, see the real DIV code',
  RUN: '▶ Run',
  RUN_TITLE: 'Run the game',
  STOP: '■ Stop',
  STOP_TITLE: 'Stop the game',
  OPEN_PLAYGROUND: 'Open in the playground',
  OPEN_PLAYGROUND_TITLE: 'Open this DIV code in the text playground, to go on in real code',
  PLAYGROUND_TITLE: 'The DivJS Playground: write DIV code as text',
  GITHUB_TITLE: 'DivJS on GitHub - a star helps!',
  LANGUAGE: 'Language',
  LESSONS: 'Lessons',
  LOADING: 'Loading…',
  SOLUTION: 'Show me the solution',
  SOLUTION_TITLE: 'Replace your blocks with a working solution',
  RESTART: 'Start again',
  RESTART_TITLE: 'Go back to this lesson\'s starting blocks',
  RESTART_CONFIRM: 'Go back to the starting blocks of this lesson? Your blocks for it will be lost.',
  NEXT: 'Next lesson ▶',
  BLOCKS: 'Blocks',
  GAME: 'Game',
  GAME_SCREEN: 'Game screen',
  CODE_TITLE: 'DIV code',
  CODE_NOTE: 'made from your blocks (read-only)',
  PRESS_RUN: 'Press ▶ Run to play',
  PAGE_TITLE: '{lesson} - DivJS Blocks',

  // Status bar and console
  STATUS_STOPPED: 'Stopped',
  STATUS_RUNNING: 'Running',
  STATUS_FINISHED: 'Finished',
  STATUS_COMPILE_ERROR: 'Compile error',
  STATUS_ERROR: 'Stopped by an error',
  STATS: '{fps} fps · {count} processes',
  COMPILE_ERROR: 'Compile error: {reason}{where}',
  AT_LINE: ' (line {line})',
  AT_LINE_COLUMN: ' (line {line}, column {col})',
  RUNTIME_ERROR: 'Runtime error: {message}',
  LOAD_FAILED: 'These blocks could not be loaded: {message}',

  // Warnings on blocks
  WARN_NO_SPRITE: 'There is no sprite called "{name}": add a "define sprite {name}" block.',
  WARN_LOOSE: 'These blocks are not inside "when the game starts" or a "define sprite", so they do nothing yet.',
  WARN_SAME_SPRITE: 'There is already a sprite called "{name}": give this one another name.',
  WARN_TWO_STARTS: 'Only one "when the game starts" block is used: put all its blocks under the first one.',

  // Toolbox
  CAT_PROGRAM: 'Program',
  CAT_LOOKS: 'Looks',
  CAT_MOTION: 'Motion',
  CAT_CONTROL: 'Control',
  CAT_SENSING: 'Sensing',
  CAT_OPERATORS: 'Operators',
  CAT_VARIABLES: 'Variables',
  CAT_SOUND: 'Sound',
  MAKE_VARIABLE: 'Make a variable',
  // The text a new text block starts with (ASCII: the game's font has no accents).
  NEW_SAY: 'Hello!',
  NEW_JOIN: 'score: ',
  NEW_TEXT: 'hello',

  // Blocks: labels
  BLOCK_START: 'when the game starts %1 %2',
  BLOCK_SPRITE: 'define sprite %1 %2 %3',
  BLOCK_CREATE: 'create sprite %1 at x %2 y %3',
  BLOCK_LOOK: 'look like a %1 size %2 colour %3',
  BLOCK_SET_SIZE: 'set size to %1 %%',
  BLOCK_SAY: 'show text %1 at x %2 y %3',
  BLOCK_SET_ANGLE: 'point in direction %1 degrees',
  BLOCK_TURN: 'turn %1 by %2 degrees',
  BLOCK_SET_X: 'set x to %1',
  BLOCK_CHANGE_X: 'change x by %1',
  BLOCK_SET_Y: 'set y to %1',
  BLOCK_CHANGE_Y: 'change y by %1',
  BLOCK_FORWARD: 'move forward %1 steps',
  BLOCK_GOTO: 'go to x %1 y %2',
  BLOCK_GOTO_RANDOM: 'go to a random place',
  BLOCK_BOUNCE: 'bounce off the edges',
  BLOCK_X: 'x position',
  BLOCK_Y: 'y position',
  BLOCK_DIRECTION: 'direction',
  BLOCK_FOREVER: 'forever %1 %2',
  BLOCK_REPEAT: 'repeat %1 times %2 %3',
  BLOCK_IF: 'if %1 then %2 %3',
  BLOCK_IF_ELSE: 'if %1 then %2 %3 else %4 %5',
  BLOCK_WAIT: 'wait %1 frames',
  BLOCK_DELETE: 'delete this sprite',
  BLOCK_KEY: 'key %1 pressed?',
  BLOCK_KEY_PRESSED: 'key %1 just pressed?',
  BLOCK_TOUCHING: 'touching sprite %1 ?',
  BLOCK_MOUSE_X: 'mouse x',
  BLOCK_MOUSE_Y: 'mouse y',
  BLOCK_MOUSE_DOWN: 'mouse button down?',
  BLOCK_RANDOM: 'pick random %1 to %2',
  BLOCK_NOT: 'not %1',
  BLOCK_JOIN: 'join %1 %2',
  BLOCK_VAR_SET: 'set %1 to %2',
  BLOCK_VAR_CHANGE: 'change %1 by %2',
  BLOCK_VAR_SHOW: 'show variable %1 at x %2 y %3',
  BLOCK_SOUND: 'play sound %1',

  // Blocks: dropdown labels (the values behind them never change)
  SHAPE_CIRCLE: 'circle',
  SHAPE_BOX: 'box',
  SHAPE_TRIANGLE: 'triangle',
  COLOUR_RED: 'red',
  COLOUR_ORANGE: 'orange',
  COLOUR_YELLOW: 'yellow',
  COLOUR_GREEN: 'green',
  COLOUR_TEAL: 'teal',
  COLOUR_BLUE: 'blue',
  COLOUR_PURPLE: 'purple',
  COLOUR_PINK: 'pink',
  COLOUR_WHITE: 'white',
  COLOUR_GREY: 'grey',
  TURN_LEFT: 'left ↺',
  TURN_RIGHT: 'right ↻',
  KEY_RIGHT: 'right arrow',
  KEY_LEFT: 'left arrow',
  KEY_UP: 'up arrow',
  KEY_DOWN: 'down arrow',
  KEY_SPACE: 'space',
  KEY_ENTER: 'enter',
  LOGIC_AND: 'and',
  LOGIC_OR: 'or',
  SOUND_COIN: 'coin',
  SOUND_LASER: 'laser',
  SOUND_EXPLOSION: 'explosion',
  SOUND_POWERUP: 'powerup',
  SOUND_HIT: 'hit',
  SOUND_JUMP: 'jump',
  SOUND_BLIP: 'blip',

  // Blocks: tooltips
  TIP_START: 'The game starts here: create your sprites with "create sprite". '
    + 'The screen is 320 wide and 240 tall; x grows to the right and y grows down.',
  TIP_SPRITE: 'What a sprite looks like and what it does. Nothing appears until '
    + '"create sprite" makes one; every copy runs these blocks on its own.',
  TIP_CREATE: 'Makes a new copy of a sprite at this place on the screen. You can create as many as you like.',
  TIP_LOOK: 'Gives the sprite a shape to show: size is its width in pixels (4 to 200). '
    + 'The triangle points the way the sprite is facing.',
  TIP_SET_SIZE: 'Makes the sprite bigger or smaller: 100 is its normal size, 50 is half, 200 is double.',
  TIP_SAY: 'Writes a text on the screen for one frame: put it inside a "forever" loop to keep it there.',
  TIP_SET_ANGLE: 'Turns the sprite to face a direction: 0 is right, 90 is up, 180 is left, 270 (or -90) is down.',
  TIP_TURN: 'Turns the sprite a little. "move forward" then goes the new way.',
  TIP_SET_X: 'Moves the sprite to this x: 0 is the left edge, 320 the right edge.',
  TIP_CHANGE_X: 'Moves the sprite sideways: a positive number goes right, a negative one goes left.',
  TIP_SET_Y: 'Moves the sprite to this y: 0 is the top edge, 240 the bottom edge.',
  TIP_CHANGE_Y: 'Moves the sprite up or down: a positive number goes DOWN the screen, a negative one goes up.',
  TIP_FORWARD: 'Moves the sprite this many pixels the way it is facing (see "point in direction").',
  TIP_GOTO: 'Jumps the sprite to this place on the screen.',
  TIP_GOTO_RANDOM: 'Jumps the sprite to a random place on the screen (at least 20 pixels from the edges).',
  TIP_BOUNCE: 'If the sprite has gone past an edge of the screen, puts it back and turns it round like a ball. '
    + 'Use it with "move forward", inside a "forever" loop.',
  TIP_X: 'Where the sprite is across the screen (0 at the left, 320 at the right).',
  TIP_Y: 'Where the sprite is down the screen (0 at the top, 240 at the bottom).',
  TIP_DIRECTION: 'The way the sprite is facing, in degrees (0 right, 90 up).',
  TIP_FOREVER: 'Runs the blocks inside again and again, once every frame (60 times a second), until the game stops.',
  TIP_REPEAT: 'Runs the blocks inside this many times. The game shows one frame after each time round, '
    + 'so you see every step of a movement.',
  TIP_IF: 'Runs the blocks inside only when the condition is true.',
  TIP_IF_ELSE: 'Runs the first blocks when the condition is true, the second ones when it is not.',
  TIP_WAIT: 'Waits this many frames before going on: 60 frames is one second. The rest of the game keeps moving.',
  TIP_DELETE: 'Removes this copy of the sprite from the game (a coin that was picked up, a shot that hit something).',
  TIP_KEY: 'True while this key is held down. Click the game first so it gets the keys.',
  TIP_KEY_PRESSED: 'True only in the frame the key goes down: one shot per press, even if the key is held.',
  TIP_TOUCHING: 'True when this sprite overlaps a sprite of that kind. Both need a "look like" block to have a size.',
  TIP_MOUSE_X: 'Where the mouse pointer is across the game screen.',
  TIP_MOUSE_Y: 'Where the mouse pointer is down the game screen.',
  TIP_MOUSE_DOWN: 'True while the left mouse button is held down over the game.',
  TIP_NUMBER: 'A number.',
  TIP_TEXT: 'Some text.',
  TIP_ARITH: 'Adds, subtracts, multiplies or divides. Dividing two whole numbers gives a whole number: 7 ÷ 2 is 3.',
  TIP_RANDOM: 'A random whole number from the first number to the second (both included).',
  TIP_COMPARE: 'Compares two values: true or false.',
  TIP_LOGIC: '"and" is true when both sides are true; "or" when at least one of them is.',
  TIP_NOT: 'True when the condition inside is false, and false when it is true.',
  TIP_JOIN: 'Puts two things together as text: join "score: " and 5 gives "score: 5".',
  TIP_VAR_SET: 'Gives the variable a new value. Variables are shared by the whole game.',
  TIP_VAR_CHANGE: 'Adds a number to the variable (a negative number takes some away).',
  TIP_VAR_GET: 'The value the variable holds now.',
  TIP_VAR_SHOW: 'Writes the variable\'s name and value on the screen for one frame: put it inside a "forever" loop.',
  TIP_SOUND: 'Plays a sound effect made by the engine (no file needed). Browsers only play sound after a click or a key press.',

  // Lessons (sprite and variable names are the ones in the lesson's blocks)
  LESSON_SHAPE_TITLE: 'Make a shape appear',
  LESSON_SHAPE_GOAL: 'Show a teal circle in the middle of the game screen.',
  LESSON_SHAPE_HINTS: [
    'From Looks, drag "look like a circle" into the "define sprite player" block.',
    'From Program, drag "create sprite player at x 160 y 120" under "when the game starts".',
    'Press ▶ Run. The screen is 320 wide and 240 tall, so 160, 120 is the middle.'
  ],
  LESSON_ARROWS_TITLE: 'Move it with the arrow keys',
  LESSON_ARROWS_GOAL: 'Make the circle move when you press the arrow keys.',
  LESSON_ARROWS_HINTS: [
    'Put a "forever" loop (Control) at the end of "define sprite player": it runs every frame.',
    'Inside it, add "if key right arrow pressed? then change x by 3" (Control, Sensing, Motion).',
    'Do the same for left (change x by -3), up (change y by -3) and down (change y by 3): y grows DOWN the screen.',
    'Run, then click the game so it gets the keys.'
  ],
  LESSON_COIN_TITLE: 'Catch the coin',
  LESSON_COIN_GOAL: 'Add a coin at a random place. When the player touches it: add 1 to the score, play a sound and move the coin somewhere else.',
  LESSON_COIN_HINTS: [
    'Under "when the game starts", create sprite coin (at x 60, y 60 for example).',
    'In "define sprite coin": look like a small yellow circle, "go to a random place" (Motion), then forever: if touching sprite player?',
    'Inside the if: change score by 1 (the "score" variable is ready in Variables), play sound coin, go to a random place.',
    'Show the score: a "forever" with "show variable score at x 8 y 8" at the end of "when the game starts".'
  ],
  LESSON_ENEMY_TITLE: 'Avoid the enemy',
  LESSON_ENEMY_GOAL: 'Add a red box that flies around and bounces off the edges. If it touches the player, the score goes back to 0.',
  LESSON_ENEMY_HINTS: [
    'Create the enemy under "when the game starts", in a corner (x 300, y 20).',
    'In "define sprite enemy": look like a red box, point in direction 40, then forever: move forward 2 steps and bounce off the edges.',
    'Still inside the forever: if touching sprite player? then set score to 0, play sound hit, and go to x 300 y 20.'
  ],
  LESSON_FREE_TITLE: 'Free play',
  LESSON_FREE_GOAL: 'Make your own game with every block. The solution is an example: a ship that turns, flies and shoots at rocks.',
  LESSON_FREE_HINTS: [
    'Every block has a tip: hold the mouse over it.',
    '"Open in the playground" takes the DIV code of your blocks to the text editor, to go on in real code.',
    'Your blocks are saved in this browser, for each lesson.'
  ]
};

const PT = {
  // Page
  TAGLINE: 'Encaixa blocos e vê o verdadeiro código DIV',
  RUN: '▶ Jogar',
  RUN_TITLE: 'Pôr o jogo a correr',
  STOP: '■ Parar',
  STOP_TITLE: 'Parar o jogo',
  OPEN_PLAYGROUND: 'Abrir no playground',
  OPEN_PLAYGROUND_TITLE: 'Abrir este código DIV no playground de texto, para continuares em código a sério',
  PLAYGROUND_TITLE: 'O DivJS Playground: escreve código DIV como texto',
  GITHUB_TITLE: 'O DivJS no GitHub - uma estrela ajuda!',
  LANGUAGE: 'Idioma',
  LESSONS: 'Lições',
  LOADING: 'A carregar…',
  SOLUTION: 'Mostra-me a solução',
  SOLUTION_TITLE: 'Trocar os teus blocos por uma solução que funciona',
  RESTART: 'Recomeçar',
  RESTART_TITLE: 'Voltar aos blocos do início desta lição',
  RESTART_CONFIRM: 'Voltar aos blocos do início desta lição? Os blocos que fizeste nesta lição perdem-se.',
  NEXT: 'Lição seguinte ▶',
  BLOCKS: 'Blocos',
  GAME: 'Jogo',
  GAME_SCREEN: 'Ecrã do jogo',
  CODE_TITLE: 'Código DIV',
  CODE_NOTE: 'feito com os teus blocos (só para ler)',
  PRESS_RUN: 'Carrega em ▶ Jogar para começar',
  PAGE_TITLE: '{lesson} - DivJS Blocks',

  // Status bar and console
  STATUS_STOPPED: 'Parado',
  STATUS_RUNNING: 'A correr',
  STATUS_FINISHED: 'Terminou',
  STATUS_COMPILE_ERROR: 'Erro no código',
  STATUS_ERROR: 'Parou com um erro',
  STATS: '{fps} fps · {count} processos',
  COMPILE_ERROR: 'Erro no código: {reason}{where}',
  AT_LINE: ' (linha {line})',
  AT_LINE_COLUMN: ' (linha {line}, coluna {col})',
  RUNTIME_ERROR: 'Erro durante o jogo: {message}',
  LOAD_FAILED: 'Não foi possível carregar estes blocos: {message}',

  // Warnings on blocks
  WARN_NO_SPRITE: 'Não há nenhuma personagem chamada "{name}": junta um bloco "define a personagem {name}".',
  WARN_LOOSE: 'Estes blocos não estão dentro de "quando o jogo começa" nem de um "define a personagem", por isso ainda não fazem nada.',
  WARN_SAME_SPRITE: 'Já há uma personagem chamada "{name}": dá outro nome a esta.',
  WARN_TWO_STARTS: 'Só se usa um bloco "quando o jogo começa": põe os blocos todos debaixo do primeiro.',

  // Toolbox
  CAT_PROGRAM: 'Programa',
  CAT_LOOKS: 'Aparência',
  CAT_MOTION: 'Movimento',
  CAT_CONTROL: 'Controlo',
  CAT_SENSING: 'Sensores',
  CAT_OPERATORS: 'Operadores',
  CAT_VARIABLES: 'Variáveis',
  CAT_SOUND: 'Som',
  MAKE_VARIABLE: 'Criar uma variável',
  NEW_SAY: 'Viva!',
  NEW_JOIN: 'pontos: ',
  NEW_TEXT: 'viva',

  // Blocks: labels
  BLOCK_START: 'quando o jogo começa %1 %2',
  BLOCK_SPRITE: 'define a personagem %1 %2 %3',
  BLOCK_CREATE: 'cria a personagem %1 em x %2 y %3',
  BLOCK_LOOK: 'parece um %1 tamanho %2 cor %3',
  BLOCK_SET_SIZE: 'muda o tamanho para %1 %%',
  BLOCK_SAY: 'mostra o texto %1 em x %2 y %3',
  BLOCK_SET_ANGLE: 'aponta na direção %1 graus',
  BLOCK_TURN: 'vira %1 %2 graus',
  BLOCK_SET_X: 'muda x para %1',
  BLOCK_CHANGE_X: 'adiciona %1 a x',
  BLOCK_SET_Y: 'muda y para %1',
  BLOCK_CHANGE_Y: 'adiciona %1 a y',
  BLOCK_FORWARD: 'anda %1 passos em frente',
  BLOCK_GOTO: 'vai para x %1 y %2',
  BLOCK_GOTO_RANDOM: 'vai para um sítio ao acaso',
  BLOCK_BOUNCE: 'ressalta nas bordas',
  BLOCK_X: 'posição x',
  BLOCK_Y: 'posição y',
  BLOCK_DIRECTION: 'direção',
  BLOCK_FOREVER: 'para sempre %1 %2',
  BLOCK_REPEAT: 'repete %1 vezes %2 %3',
  BLOCK_IF: 'se %1 então %2 %3',
  BLOCK_IF_ELSE: 'se %1 então %2 %3 senão %4 %5',
  BLOCK_WAIT: 'espera %1 fotogramas',
  BLOCK_DELETE: 'apaga esta personagem',
  BLOCK_KEY: 'tecla %1 carregada?',
  BLOCK_KEY_PRESSED: 'tecla %1 acabou de ser carregada?',
  BLOCK_TOUCHING: 'a tocar na personagem %1 ?',
  BLOCK_MOUSE_X: 'x do rato',
  BLOCK_MOUSE_Y: 'y do rato',
  BLOCK_MOUSE_DOWN: 'botão do rato carregado?',
  BLOCK_RANDOM: 'número ao acaso de %1 a %2',
  BLOCK_NOT: 'não %1',
  BLOCK_JOIN: 'junta %1 %2',
  BLOCK_VAR_SET: 'muda %1 para %2',
  BLOCK_VAR_CHANGE: 'adiciona %2 a %1',
  BLOCK_VAR_SHOW: 'mostra a variável %1 em x %2 y %3',
  BLOCK_SOUND: 'toca o som %1',

  // Blocks: dropdown labels
  SHAPE_CIRCLE: 'círculo',
  SHAPE_BOX: 'quadrado',
  SHAPE_TRIANGLE: 'triângulo',
  COLOUR_RED: 'vermelho',
  COLOUR_ORANGE: 'laranja',
  COLOUR_YELLOW: 'amarelo',
  COLOUR_GREEN: 'verde',
  COLOUR_TEAL: 'azul-esverdeado',
  COLOUR_BLUE: 'azul',
  COLOUR_PURPLE: 'roxo',
  COLOUR_PINK: 'cor-de-rosa',
  COLOUR_WHITE: 'branco',
  COLOUR_GREY: 'cinzento',
  TURN_LEFT: 'à esquerda ↺',
  TURN_RIGHT: 'à direita ↻',
  KEY_RIGHT: 'seta para a direita',
  KEY_LEFT: 'seta para a esquerda',
  KEY_UP: 'seta para cima',
  KEY_DOWN: 'seta para baixo',
  KEY_SPACE: 'espaço',
  KEY_ENTER: 'enter',
  LOGIC_AND: 'e',
  LOGIC_OR: 'ou',
  SOUND_COIN: 'moeda',
  SOUND_LASER: 'laser',
  SOUND_EXPLOSION: 'explosão',
  SOUND_POWERUP: 'poder extra',
  SOUND_HIT: 'pancada',
  SOUND_JUMP: 'salto',
  SOUND_BLIP: 'blip',

  // Blocks: tooltips
  TIP_START: 'O jogo começa aqui: cria as tuas personagens com "cria a personagem". '
    + 'O ecrã tem 320 de largura e 240 de altura; o x cresce para a direita e o y cresce para baixo.',
  TIP_SPRITE: 'Como é uma personagem e o que faz. Nada aparece até "cria a personagem" fazer uma; '
    + 'cada cópia corre estes blocos por si.',
  TIP_CREATE: 'Faz uma nova cópia de uma personagem neste sítio do ecrã. Podes criar quantas quiseres.',
  TIP_LOOK: 'Dá à personagem uma forma para mostrar: o tamanho é a largura em píxeis (de 4 a 200). '
    + 'O triângulo aponta para onde a personagem está virada.',
  TIP_SET_SIZE: 'Torna a personagem maior ou mais pequena: 100 é o tamanho normal, 50 é metade, 200 é o dobro.',
  TIP_SAY: 'Escreve um texto no ecrã durante um fotograma: põe-no dentro de um "para sempre" para ele ficar lá.',
  TIP_SET_ANGLE: 'Vira a personagem para uma direção: 0 é para a direita, 90 para cima, 180 para a esquerda, 270 (ou -90) para baixo.',
  TIP_TURN: 'Vira um pouco a personagem. Depois, "anda … passos em frente" vai pelo novo caminho.',
  TIP_SET_X: 'Leva a personagem para este x: 0 é a borda da esquerda, 320 a da direita.',
  TIP_CHANGE_X: 'Mexe a personagem para o lado: um número positivo vai para a direita, um negativo vai para a esquerda.',
  TIP_SET_Y: 'Leva a personagem para este y: 0 é a borda de cima, 240 a de baixo.',
  TIP_CHANGE_Y: 'Mexe a personagem para cima ou para baixo: um número positivo vai para BAIXO no ecrã, um negativo vai para cima.',
  TIP_FORWARD: 'Anda este número de píxeis para onde a personagem está virada (vê "aponta na direção").',
  TIP_GOTO: 'Põe logo a personagem neste sítio do ecrã.',
  TIP_GOTO_RANDOM: 'Põe logo a personagem num sítio ao acaso do ecrã (a pelo menos 20 píxeis das bordas).',
  TIP_BOUNCE: 'Se a personagem passou uma borda do ecrã, põe-na de volta e vira-a como uma bola. '
    + 'Usa-o com "anda … passos em frente", dentro de um "para sempre".',
  TIP_X: 'Onde está a personagem, da esquerda para a direita (0 à esquerda, 320 à direita).',
  TIP_Y: 'Onde está a personagem, de cima para baixo (0 em cima, 240 em baixo).',
  TIP_DIRECTION: 'Para onde a personagem está virada, em graus (0 direita, 90 cima).',
  TIP_FOREVER: 'Corre os blocos lá de dentro vezes sem conta, uma vez em cada fotograma (60 vezes por segundo), até o jogo parar.',
  TIP_REPEAT: 'Corre os blocos lá de dentro este número de vezes. O jogo mostra um fotograma depois de cada volta, '
    + 'para veres cada passo de um movimento.',
  TIP_IF: 'Corre os blocos lá de dentro só quando a condição é verdadeira.',
  TIP_IF_ELSE: 'Corre os primeiros blocos quando a condição é verdadeira e os segundos quando não é.',
  TIP_WAIT: 'Espera este número de fotogramas antes de continuar: 60 fotogramas são um segundo. O resto do jogo continua a mexer-se.',
  TIP_DELETE: 'Tira esta cópia da personagem do jogo (uma moeda que foi apanhada, um tiro que acertou nalguma coisa).',
  TIP_KEY: 'Verdadeiro enquanto esta tecla estiver carregada. Clica primeiro no jogo para ele receber as teclas.',
  TIP_KEY_PRESSED: 'Verdadeiro só no fotograma em que carregas na tecla: um tiro de cada vez que carregas, mesmo que não a largues.',
  TIP_TOUCHING: 'Verdadeiro quando esta personagem está em cima de uma personagem desse tipo. '
    + 'As duas precisam de um bloco "parece um" para terem tamanho.',
  TIP_MOUSE_X: 'Onde está o ponteiro do rato no ecrã do jogo, da esquerda para a direita.',
  TIP_MOUSE_Y: 'Onde está o ponteiro do rato no ecrã do jogo, de cima para baixo.',
  TIP_MOUSE_DOWN: 'Verdadeiro enquanto o botão esquerdo do rato estiver carregado em cima do jogo.',
  TIP_NUMBER: 'Um número.',
  TIP_TEXT: 'Um texto.',
  TIP_ARITH: 'Soma, subtrai, multiplica ou divide. Dividir dois números inteiros dá um número inteiro: 7 ÷ 2 é 3.',
  TIP_RANDOM: 'Um número inteiro ao acaso, do primeiro número ao segundo (os dois incluídos).',
  TIP_COMPARE: 'Compara dois valores: verdadeiro ou falso.',
  TIP_LOGIC: '"e" é verdadeiro quando os dois lados são verdadeiros; "ou" quando pelo menos um deles é.',
  TIP_NOT: 'Verdadeiro quando a condição lá de dentro é falsa, e falso quando é verdadeira.',
  TIP_JOIN: 'Junta duas coisas num texto: juntar "pontos: " e 5 dá "pontos: 5".',
  TIP_VAR_SET: 'Dá um valor novo à variável. As variáveis são as mesmas para o jogo todo.',
  TIP_VAR_CHANGE: 'Soma um número à variável (um número negativo tira).',
  TIP_VAR_GET: 'O valor que a variável tem agora.',
  TIP_VAR_SHOW: 'Escreve o nome e o valor da variável no ecrã durante um fotograma: põe-no dentro de um "para sempre".',
  TIP_SOUND: 'Toca um efeito sonoro feito pelo motor do jogo (não precisa de ficheiro). '
    + 'Os browsers só tocam som depois de um clique ou de uma tecla.',

  // Lessons
  LESSON_SHAPE_TITLE: 'Faz aparecer uma forma',
  LESSON_SHAPE_GOAL: 'Mostra um círculo azul-esverdeado no meio do ecrã do jogo.',
  LESSON_SHAPE_HINTS: [
    'Da categoria Aparência, arrasta "parece um círculo" para dentro do bloco "define a personagem player".',
    'Da categoria Programa, arrasta "cria a personagem player em x 160 y 120" para debaixo de "quando o jogo começa".',
    'Carrega em ▶ Jogar. O ecrã tem 320 de largura e 240 de altura, por isso 160, 120 é o meio.'
  ],
  LESSON_ARROWS_TITLE: 'Mexe-o com as setas',
  LESSON_ARROWS_GOAL: 'Faz o círculo mexer-se quando carregas nas teclas das setas.',
  LESSON_ARROWS_HINTS: [
    'Põe um "para sempre" (Controlo) no fim de "define a personagem player": corre em cada fotograma.',
    'Lá dentro, junta "se tecla seta para a direita carregada? então adiciona 3 a x" (Controlo, Sensores, Movimento).',
    'Faz o mesmo para a esquerda (adiciona -3 a x), para cima (adiciona -3 a y) e para baixo (adiciona 3 a y): o y cresce para BAIXO no ecrã.',
    'Carrega em ▶ Jogar e depois clica no jogo para ele receber as teclas.'
  ],
  LESSON_COIN_TITLE: 'Apanha a moeda',
  LESSON_COIN_GOAL: 'Junta uma moeda num sítio ao acaso. Quando o player lhe tocar: soma 1 aos pontos, toca um som e leva a moeda para outro sítio.',
  LESSON_COIN_HINTS: [
    'Em "quando o jogo começa", cria a personagem coin (por exemplo em x 60, y 60).',
    'Em "define a personagem coin": parece um círculo amarelo pequeno, "vai para um sítio ao acaso" (Movimento) e depois para sempre: se a tocar na personagem player?',
    'Dentro do "se": adiciona 1 a score (a variável "score" já está pronta em Variáveis), toca o som moeda, vai para um sítio ao acaso.',
    'Mostra os pontos: um "para sempre" com "mostra a variável score em x 8 y 8" no fim de "quando o jogo começa".'
  ],
  LESSON_ENEMY_TITLE: 'Foge do inimigo',
  LESSON_ENEMY_GOAL: 'Junta um quadrado vermelho que voa pelo ecrã e ressalta nas bordas. Se tocar no player, os pontos voltam a 0.',
  LESSON_ENEMY_HINTS: [
    'Cria a personagem enemy em "quando o jogo começa", num canto (x 300, y 20).',
    'Em "define a personagem enemy": parece um quadrado vermelho, aponta na direção 40 e depois para sempre: anda 2 passos em frente e ressalta nas bordas.',
    'Ainda dentro do "para sempre": se a tocar na personagem player? então muda score para 0, toca o som pancada e vai para x 300 y 20.'
  ],
  LESSON_FREE_TITLE: 'Jogo livre',
  LESSON_FREE_GOAL: 'Faz o teu próprio jogo com todos os blocos. A solução é um exemplo: uma nave que vira, voa e dispara contra rochas.',
  LESSON_FREE_HINTS: [
    'Cada bloco tem uma dica: deixa o rato parado em cima dele.',
    '"Abrir no playground" leva o código DIV dos teus blocos para o editor de texto, para continuares em código a sério.',
    'Os teus blocos ficam guardados neste browser, para cada lição.'
  ]
};

export const STRINGS = { en: EN, pt: PT };
export const LANGUAGES = Object.keys(STRINGS);
export const DEFAULT_LANGUAGE = 'en';

let current = DEFAULT_LANGUAGE;

export function getLanguage()
{
  return current;
}

// A language code the page knows ("pt-PT" -> "pt"), or null.
export function knownLanguage(code)
{
  const base = String(code ?? '').toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.includes(base) ? base : null;
}

// The text for a key in the current language (English if it has none),
// with its {name} parameters filled in.
export function t(key, params = {})
{
  const text = STRINGS[current][key] ?? EN[key] ?? key;
  if (typeof text !== 'string')
  {
    return text;
  }
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
}

// The Blockly message reference for a key, for block definitions and the
// toolbox: %{BKY_DIV_<KEY>}.
export function msg(key)
{
  return `%{BKY_DIV_${key}}`;
}

// Switches the language: Blockly's own messages and the page's. Blocks
// already on a workspace keep their old labels until they are rebuilt.
export function setLanguage(language)
{
  current = knownLanguage(language) || DEFAULT_LANGUAGE;
  Blockly.setLocale(Blockly.MESSAGES[current]);
  for (const key of Object.keys(EN))
  {
    const text = t(key);
    if (typeof text === 'string')
    {
      Blockly.Msg[`DIV_${key}`] = text;
    }
  }
  return current;
}

setLanguage(DEFAULT_LANGUAGE);
