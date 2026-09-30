// DivJS Blocks: the page. A Blockly workspace on the left, the game and
// the DIV code the blocks make on the right, and a lesson above.
//
// Every change to the blocks regenerates the code (generator.js), shows
// it, and saves the workspace in localStorage for the current lesson.
// "Run" runs that code with the DivJS engine, exactly as the text
// playground would; "Open in the playground" hands it over as a share link.
//
// The page speaks English or Portuguese (i18n.js): ?lang=en or ?lang=pt in
// the address, else the last choice made with the EN | PT switch, else the
// browser's language. Switching rebuilds the blocks with their new labels
// (same blocks, same places) and leaves the game and the code alone.

import * as Blockly from './vendor/blockly.js';
import { runDivDemo } from '../engine/divjs.js';
import { registerBlocks, registerFlyouts, toolbox, SCREEN_WIDTH, SCREEN_HEIGHT } from './blocks.js';
import { generateDiv } from './generator.js';
import { LESSONS } from './lessons.js';
import { t, getLanguage, setLanguage, knownLanguage } from './i18n.js';

const STORAGE_PREFIX = 'divjs.blocks.workspace.';
const LESSON_KEY = 'divjs.blocks.lesson';
const LANGUAGE_KEY = 'divjs.blocks.language';
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
  code: document.getElementById('code'),
  langSwitch: document.getElementById('langSwitch')
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
let statusKey = 'STATUS_STOPPED';
let idleScreen = false;    // true while the canvas shows "Press Run"

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

// The status is kept as a key, so a language switch can say it again.
function setStatus(key, kind = '')
{
  statusKey = key;
  el.status.textContent = t(key);
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
    logLine(t('LOAD_FAILED', { message: err.message || err }), 'warn');
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
  document.title = t('PAGE_TITLE', { lesson: current.title });
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
  if (!window.confirm(t('RESTART_CONFIRM')))
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
  ctx.fillText(t('PRESS_RUN'), SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
  el.stats.textContent = '';
  idleScreen = true;
}

function handleError(err)
{
  if (err && err.name === 'DivError')
  {
    let where = '';
    if (err.line)
    {
      where = err.col ? t('AT_LINE_COLUMN', { line: err.line, col: err.col }) : t('AT_LINE', { line: err.line });
    }
    logLine(t('COMPILE_ERROR', { reason: err.reason || err.message, where }), 'error');
    setStatus('STATUS_COMPILE_ERROR', 'error');
  }
  else
  {
    logLine(t('RUNTIME_ERROR', { message: err?.message || String(err) }), 'error');
    setStatus('STATUS_ERROR', 'error');
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
    el.stats.textContent = t('STATS', { fps: Math.round(runtime.fpsValue || 0), count: sprites });
  }
  if (vm.halted && !el.stopBtn.disabled)
  {
    setStatus('STATUS_FINISHED');
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
  setStatus('STATUS_RUNNING', 'running');
  el.stopBtn.disabled = false;
  idleScreen = false;
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
  setStatus('STATUS_STOPPED');
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

// Blockly shows a tooltip below the pointer and means to move it above
// when it would leave the window, but it compares the workspace's own
// coordinates with the window's: on a page scrolled down (the phone
// layout) a tooltip of a block near the bottom hung off the window. Each
// time it is placed, it is moved back inside the window if it is not.
function keepTooltipsInWindow()
{
  const tip = Blockly.Tooltip.getDiv();
  if (!tip)
  {
    return;
  }
  const margin = 5;
  const pointerGap = 20;
  new MutationObserver(() =>
  {
    if (tip.style.display === 'none')
    {
      return;
    }
    const r = tip.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (r.bottom > window.innerHeight - margin)
    {
      // Above the pointer instead of below it.
      dy = -(r.height + pointerGap);
    }
    dy = Math.max(dy, margin - r.top);
    if (r.right > window.innerWidth - margin)
    {
      dx = window.innerWidth - margin - r.right;
    }
    dx = Math.max(dx, margin - r.left);
    if (dx !== 0 || dy !== 0)
    {
      tip.style.left = `${parseFloat(tip.style.left || '0') + dx}px`;
      tip.style.top = `${parseFloat(tip.style.top || '0') + dy}px`;
    }
  }).observe(tip, { attributes: true, attributeFilter: ['style'] });
}

function createWorkspace()
{
  registerBlocks();
  workspace = Blockly.inject(el.workspace, {
    toolbox: toolbox(),
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
  keepTooltipsInWindow();
  workspace.addChangeListener(onWorkspaceChange);
  new ResizeObserver(() => Blockly.svgResize(workspace)).observe(el.workspace);
}

// ── Language ────────────────────────────────────────────────────────────

// ?lang= in the address, else the saved choice, else the browser's.
function startingLanguage()
{
  const fromAddress = knownLanguage(new URLSearchParams(window.location.search).get('lang'));
  if (fromAddress)
  {
    return fromAddress;
  }
  const saved = knownLanguage(storageGet(LANGUAGE_KEY));
  if (saved)
  {
    return saved;
  }
  const browser = navigator.languages?.length ? navigator.languages : [navigator.language];
  return browser.some((code) => knownLanguage(code) === 'pt') ? 'pt' : 'en';
}

// The page's own texts: elements marked with data-i18n (text),
// data-i18n-title and data-i18n-aria-label, then the lesson and status.
function translatePage()
{
  const language = getLanguage();
  document.documentElement.lang = language === 'pt' ? 'pt-PT' : 'en';
  for (const node of document.querySelectorAll('[data-i18n]'))
  {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll('[data-i18n-title]'))
  {
    node.title = t(node.dataset.i18nTitle);
  }
  for (const node of document.querySelectorAll('[data-i18n-aria-label]'))
  {
    node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  }
  for (const button of el.langSwitch.querySelectorAll('button'))
  {
    button.setAttribute('aria-pressed', String(button.dataset.lang === language));
  }
  el.status.textContent = t(statusKey);
}

// Rebuilds the blocks from their saved state so they take the new labels:
// the same blocks with the same ids, in the same places, the view left
// where it was. Events are off, so it is not an edit (nothing to undo,
// nothing to save) and the code, which does not depend on the language,
// stays as it was.
function relabelBlocks()
{
  Blockly.hideChaff();
  const state = Blockly.serialization.workspaces.save(workspace);
  const { scrollX, scrollY } = workspace;
  loading = true;
  Blockly.Events.disable();
  try
  {
    workspace.updateToolbox(toolbox());
    Blockly.serialization.workspaces.load(state, workspace);
    workspace.scroll(scrollX, scrollY);
  }
  finally
  {
    Blockly.Events.enable();
    loading = false;
  }
  // The warnings on blocks are in the new language too.
  warnedIds = new Set();
  showWarnings(generateDiv(workspace).warnings);
}

function switchLanguage(language)
{
  if (language === getLanguage())
  {
    return;
  }
  setLanguage(language);
  storageSet(LANGUAGE_KEY, language);
  // An address that asked for a language now asks for this one.
  const url = new URL(window.location.href);
  if (url.searchParams.has('lang'))
  {
    url.searchParams.set('lang', language);
    window.history.replaceState(null, '', url);
  }
  translatePage();
  if (lessonOpen)
  {
    renderLessonNav();
    renderLesson();
    relabelBlocks();
  }
  if (idleScreen)
  {
    drawIdleScreen();
  }
}

// ── Start ───────────────────────────────────────────────────────────────

function init()
{
  el.stopBtn.disabled = true;
  setLanguage(startingLanguage());
  translatePage();
  createWorkspace();
  renderLessonNav();
  el.runBtn.addEventListener('click', run);
  el.stopBtn.addEventListener('click', stop);
  el.solutionBtn.addEventListener('click', showSolution);
  el.restartBtn.addEventListener('click', restartLesson);
  el.nextBtn.addEventListener('click', () => openLesson(lessonIndex + 1));
  el.langSwitch.addEventListener('click', (event) =>
  {
    const button = event.target.closest('button[data-lang]');
    if (button)
    {
      switchLanguage(button.dataset.lang);
    }
  });
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
  getLanguage,
  setLanguage: switchLanguage,
  lessonCount: LESSONS.length,
  openLesson,
  showSolution,
  workspace: () => workspace
};
