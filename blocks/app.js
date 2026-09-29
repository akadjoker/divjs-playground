// DivJS Blocks: the page. A Blockly workspace on the left, the game and
// the DIV code the blocks make on the right, and a lesson above.
//
// Every change to the blocks regenerates the code (generator.js), shows
// it, and saves the workspace in localStorage for the current lesson.
// "Run" runs that code with the DivJS engine, exactly as the text
// playground would; "Open in the playground" hands it over as a share link.

import * as Blockly from './vendor/blockly.js';
import { runDivDemo } from '../engine/divjs.js';
import { registerBlocks, registerFlyouts, TOOLBOX, SCREEN_WIDTH, SCREEN_HEIGHT } from './blocks.js';
import { generateDiv } from './generator.js';
import { LESSONS } from './lessons.js';

const STORAGE_PREFIX = 'divjs.blocks.workspace.';
const LESSON_KEY = 'divjs.blocks.lesson';
const SAVE_DELAY_MS = 400;
const MAX_CONSOLE_LINES = 200;
const STATS_INTERVAL_MS = 500;
// The playground program a shared link opens into (its "New program").
const PLAYGROUND_PROGRAM = 'new';
const CLEAR_COLOUR = '#101820';

const el = {
  runBtn: document.getElementById('runBtn'),
  stopBtn: document.getElementById('stopBtn'),
  openLink: document.getElementById('openLink'),
  lessonNav: document.getElementById('lessonNav'),
  lessonTitle: document.getElementById('lessonTitle'),
  lessonGoal: document.getElementById('lessonGoal'),
  lessonHints: document.getElementById('lessonHints'),
  solutionBtn: document.getElementById('solutionBtn'),
  restartBtn: document.getElementById('restartBtn'),
  nextBtn: document.getElementById('nextBtn'),
  workspace: document.getElementById('workspace'),
  canvas: document.getElementById('game'),
  status: document.getElementById('status'),
  stats: document.getElementById('stats'),
  console: document.getElementById('console'),
  code: document.getElementById('code')
};

let workspace = null;
let lessonIndex = 0;
let code = '';
let runner = null;
let saveTimer = 0;
let loading = false;       // true while the page replaces the blocks itself
let lessonOpen = false;    // false until the first lesson's blocks are loaded
let lastStatsAt = 0;
let linkToken = 0;
let warnedIds = new Set();

// ── Storage (may be unavailable: private windows, blocked site data) ────

function storageGet(key)
{
  try
  {
    return window.localStorage.getItem(key);
  }
  catch
  {
    return null;
  }
}

function storageSet(key, text)
{
  try
  {
    window.localStorage.setItem(key, text);
  }
  catch
  {
    // Not saved: the blocks stay on screen.
  }
}

function storageRemove(key)
{
  try
  {
    window.localStorage.removeItem(key);
  }
  catch
  {
    // Nothing to remove.
  }
}

// ── Share link, the same encoding as the playground's ───────────────────

function bytesToBase64Url(bytes)
{
  let binary = '';
  for (let i = 0; i < bytes.length; i++)
  {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function encodeSource(text)
{
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return bytesToBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function updateOpenLink()
{
  const token = ++linkToken;
  const encoded = await encodeSource(code);
  if (token === linkToken)
  {
    el.openLink.href = `../playground/#p=${PLAYGROUND_PROGRAM}&code=${encoded}`;
  }
}

// ── Console and status ──────────────────────────────────────────────────

function logLine(text, kind = '')
{
  const line = document.createElement('div');
  line.textContent = text;
  if (kind)
  {
    line.className = kind;
  }
  el.console.append(line);
  while (el.console.childElementCount > MAX_CONSOLE_LINES)
  {
    el.console.firstElementChild.remove();
  }
  el.console.scrollTop = el.console.scrollHeight;
}

function setStatus(text, kind = '')
{
  el.status.textContent = text;
  el.status.className = kind;
}

// ── The generated code ──────────────────────────────────────────────────

const KEYWORDS = /^(PROGRAM|GLOBAL|LOCAL|PRIVATE|PROCESS|FUNCTION|BEGIN|END|IF|ELSE|LOOP|FRAME|FOR|TO|RETURN|AND|OR|NOT|TYPE)$/;

function escapeHtml(text)
{
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A small highlighter: comments, strings, keywords and numbers.
function highlight(source)
{
  const token = /(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*')|\b([A-Z]+)\b|\b(\d+)\b/g;
  let html = '';
  let last = 0;
  for (const m of source.matchAll(token))
  {
    html += escapeHtml(source.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1])
    {
      html += `<span class="c">${escapeHtml(m[1])}</span>`;
    }
    else if (m[2])
    {
      html += `<span class="s">${escapeHtml(m[2])}</span>`;
    }
    else if (m[3] && KEYWORDS.test(m[3]))
    {
      html += `<span class="k">${m[3]}</span>`;
    }
    else if (m[4])
    {
      html += `<span class="n">${m[4]}</span>`;
    }
    else
    {
      html += escapeHtml(m[0]);
    }
  }
  return html + escapeHtml(source.slice(last));
}

// Warning icons on the blocks the generator could not use.
function showWarnings(warnings)
{
  const texts = new Map();
  for (const w of warnings)
  {
    texts.set(w.id, w.text);
  }
  for (const id of new Set([...warnedIds, ...texts.keys()]))
  {
    const block = workspace.getBlockById(id);
    if (block)
    {
      block.setWarningText(texts.get(id) ?? null);
    }
  }
  warnedIds = new Set(texts.keys());
}

function regenerate()
{
  const result = generateDiv(workspace);
  code = result.code;
  el.code.innerHTML = highlight(code);
  showWarnings(result.warnings);
  updateOpenLink();
}

// ── Lessons ─────────────────────────────────────────────────────────────

function lesson()
{
  return LESSONS[lessonIndex];
}

function saveNow()
{
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (workspace && lessonOpen && !loading)
  {
    storageSet(STORAGE_PREFIX + lesson().id, JSON.stringify(Blockly.serialization.workspaces.save(workspace)));
  }
}

function scheduleSave()
{
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

// Lays the stacks of blocks out in columns (each stack goes to the
// shortest column), as many columns as fit the view, so a lesson's blocks
// never overlap whatever their rendered size, from the top left of the
// view.
function arrangeStacks()
{
  const gap = 32;
  const stacks = workspace.getTopBlocks(true);
  if (stacks.length === 0)
  {
    return;
  }
  const sizes = stacks.map((b) => b.getHeightWidth());
  const view = workspace.getMetricsManager().getViewMetrics(true);
  const viewWidth = view.width;
  let layout = null;
  for (let count = stacks.length; count >= 1 && !layout; count--)
  {
    const heights = new Array(count).fill(gap);
    const widths = new Array(count).fill(0);
    const column = sizes.map((size) =>
    {
      const c = heights.indexOf(Math.min(...heights));
      heights[c] += size.height + gap;
      widths[c] = Math.max(widths[c], size.width);
      return c;
    });
    const total = widths.reduce((sum, w) => sum + w + gap, gap);
    if (total <= viewWidth || count === 1)
    {
      layout = { column, widths };
    }
  }
  const lefts = [];
  let x = view.left + gap;
  for (const w of layout.widths)
  {
    lefts.push(x);
    x += w + gap;
  }
  const tops = new Array(layout.widths.length).fill(view.top + gap);
  stacks.forEach((block, i) =>
  {
    const c = layout.column[i];
    block.moveTo(new Blockly.utils.Coordinate(lefts[c], tops[c]));
    tops[c] += sizes[i].height + gap;
  });
}

// Replaces the blocks with a saved state; false if it could not be read.
// A lesson's own states are laid out to fit; saved ones keep their places.
function loadState(state, arrange = false)
{
  loading = true;
  try
  {
    Blockly.serialization.workspaces.load(state, workspace);
    if (arrange)
    {
      arrangeStacks();
    }
    else
    {
      workspace.scrollCenter();
    }
    return true;
  }
  catch (err)
  {
    logLine(`These blocks could not be loaded: ${err.message || err}`, 'warn');
    return false;
  }
  finally
  {
    loading = false;
    warnedIds = new Set();
    regenerate();
  }
}

function renderLesson()
{
  const current = lesson();
  el.lessonTitle.textContent = `${lessonIndex + 1}. ${current.title}`;
  el.lessonGoal.textContent = current.goal;
  el.lessonHints.replaceChildren(...current.hints.map((hint) =>
  {
    const li = document.createElement('li');
    li.textContent = hint;
    return li;
  }));
  for (const button of el.lessonNav.children)
  {
    button.setAttribute('aria-current', String(Number(button.dataset.index) === lessonIndex));
  }
  const last = lessonIndex === LESSONS.length - 1;
  el.nextBtn.hidden = last;
  document.title = `${current.title} - DivJS Blocks`;
}

function openLesson(index)
{
  saveNow();
  stop();
  lessonIndex = Math.max(0, Math.min(LESSONS.length - 1, index));
  storageSet(LESSON_KEY, lesson().id);
  renderLesson();
  el.console.replaceChildren();
  let loaded = false;
  const saved = storageGet(STORAGE_PREFIX + lesson().id);
  if (saved)
  {
    try
    {
      loaded = loadState(JSON.parse(saved));
    }
    catch
    {
      loaded = false;
    }
  }
  if (!loaded)
  {
    loadState(lesson().start, true);
  }
  lessonOpen = true;
  drawIdleScreen();
}

function showSolution()
{
  stop();
  loadState(lesson().solution, true);
  saveNow();
}

function restartLesson()
{
  if (!window.confirm('Go back to the starting blocks of this lesson? Your blocks for it will be lost.'))
  {
    return;
  }
  stop();
  storageRemove(STORAGE_PREFIX + lesson().id);
  loadState(lesson().start, true);
}

function renderLessonNav()
{
  el.lessonNav.replaceChildren(...LESSONS.map((l, i) =>
  {
    const button = document.createElement('button');
    button.textContent = String(i + 1);
    button.title = l.title;
    button.dataset.index = String(i);
    button.addEventListener('click', () => openLesson(i));
    return button;
  }));
}

// ── Running ─────────────────────────────────────────────────────────────

function drawIdleScreen()
{
  const ctx = el.canvas.getContext('2d');
  el.canvas.width = SCREEN_WIDTH;
  el.canvas.height = SCREEN_HEIGHT;
  ctx.fillStyle = CLEAR_COLOUR;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  ctx.fillStyle = '#95a8b8';
  ctx.font = '16px "Fira Sans", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Press ▶ Run to play', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
  el.stats.textContent = '';
}

function handleError(err)
{
  if (err && err.name === 'DivError')
  {
    const where = err.line ? ` (line ${err.line}${err.col ? `, column ${err.col}` : ''})` : '';
    logLine(`Compile error: ${err.reason || err.message}${where}`, 'error');
    setStatus('Compile error', 'error');
  }
  else
  {
    logLine(`Runtime error: ${err?.message || String(err)}`, 'error');
    setStatus('Stopped by an error', 'error');
  }
  el.stopBtn.disabled = true;
}

function handleFrame({ runtime, vm })
{
  const now = performance.now();
  if (now - lastStatsAt >= STATS_INTERVAL_MS)
  {
    lastStatsAt = now;
    const sprites = vm.processManager.getAll().filter((p) => !p.isMouse).length;
    el.stats.textContent = `${Math.round(runtime.fpsValue || 0)} fps · ${sprites} processes`;
  }
  if (vm.halted && !el.stopBtn.disabled)
  {
    setStatus('Finished');
    el.stopBtn.disabled = true;
  }
}

function ensureRunner()
{
  if (!runner)
  {
    runner = runDivDemo({
      canvas: el.canvas,
      source: '',
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      clearColor: CLEAR_COLOUR,
      autoStart: false,
      onLog: (line) => logLine(line, line.startsWith('[warn]') ? 'warn' : ''),
      onError: handleError,
      onFrame: handleFrame
    });
  }
  return runner;
}

function run()
{
  saveNow();
  el.console.replaceChildren();
  const active = ensureRunner();
  setStatus('Running', 'running');
  el.stopBtn.disabled = false;
  active.start(code);
  if (active.getState().running)
  {
    // The keys go to the game, not to the blocks.
    el.canvas.focus({ preventScroll: true });
  }
}

function stop()
{
  if (runner)
  {
    runner.stop();
  }
  setStatus('Stopped');
  el.stopBtn.disabled = true;
}

// ── Blockly ─────────────────────────────────────────────────────────────

const THEME = Blockly.Theme.defineTheme('divjs-dark', {
  name: 'divjs-dark',
  base: Blockly.Themes.Classic,
  startHats: true,
  componentStyles: {
    workspaceBackgroundColour: '#0f1419',
    toolboxBackgroundColour: '#171f27',
    toolboxForegroundColour: '#e8f1f8',
    flyoutBackgroundColour: '#1f2a35',
    flyoutForegroundColour: '#e8f1f8',
    flyoutOpacity: 0.97,
    scrollbarColour: '#3a4d60',
    scrollbarOpacity: 0.8,
    insertionMarkerColour: '#ffffff',
    insertionMarkerOpacity: 0.3,
    cursorColour: '#2dd4bf'
  },
  fontStyle: {
    family: '"Fira Sans", "Segoe UI", system-ui, sans-serif',
    weight: '600',
    size: 11
  }
});

// Renaming a sprite ("define sprite") renames the blocks that use it.
function followSpriteRename(event)
{
  if (event.type !== Blockly.Events.BLOCK_CHANGE || event.element !== 'field' || event.name !== 'NAME')
  {
    return;
  }
  const block = workspace.getBlockById(event.blockId);
  if (!block || block.type !== 'div_sprite' || !event.oldValue)
  {
    return;
  }
  const stillDefined = workspace.getBlocksByType('div_sprite', false)
    .some((b) => b.getFieldValue('NAME') === event.oldValue);
  if (stillDefined)
  {
    return;
  }
  for (const user of workspace.getAllBlocks(false))
  {
    const field = user.getField('SPRITE');
    if (field && field.getValue() === event.oldValue)
    {
      field.setValue(event.newValue);
    }
  }
}

function onWorkspaceChange(event)
{
  if (event.isUiEvent || loading)
  {
    return;
  }
  followSpriteRename(event);
  regenerate();
  scheduleSave();
}

function createWorkspace()
{
  registerBlocks();
  workspace = Blockly.inject(el.workspace, {
    toolbox: TOOLBOX,
    renderer: 'zelos',
    theme: THEME,
    media: 'vendor/media/',
    sounds: false,
    trashcan: true,
    zoom: { controls: true, wheel: true, startScale: window.innerWidth < 600 ? 0.5 : 0.65, maxScale: 2, minScale: 0.35, scaleSpeed: 1.15 },
    move: { scrollbars: true, drag: true, wheel: true },
    grid: { spacing: 24, length: 2, colour: '#223242', snap: false }
  });
  registerFlyouts(workspace);
  workspace.addChangeListener(onWorkspaceChange);
  new ResizeObserver(() => Blockly.svgResize(workspace)).observe(el.workspace);
}

// ── Start ───────────────────────────────────────────────────────────────

function init()
{
  el.stopBtn.disabled = true;
  createWorkspace();
  renderLessonNav();
  el.runBtn.addEventListener('click', run);
  el.stopBtn.addEventListener('click', stop);
  el.solutionBtn.addEventListener('click', showSolution);
  el.restartBtn.addEventListener('click', restartLesson);
  el.nextBtn.addEventListener('click', () => openLesson(lessonIndex + 1));
  el.canvas.addEventListener('pointerdown', () => el.canvas.focus({ preventScroll: true }));
  window.addEventListener('beforeunload', saveNow);
  const savedLesson = LESSONS.findIndex((l) => l.id === storageGet(LESSON_KEY));
  openLesson(savedLesson >= 0 ? savedLesson : 0);
}

init();

// For debugging from the browser console (and the tests).
window.divBlocks = {
  getState: () => (runner ? runner.getState() : null),
  getCode: () => code,
  getLesson: () => lesson().id,
  lessonCount: LESSONS.length,
  openLesson,
  showSolution,
  workspace: () => workspace
};
