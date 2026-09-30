import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, extname, join, relative } from 'path';
import { fileURLToPath } from 'url';

// The engine this site runs on: engine/divjs.js (npm run engine).
const { Lexer, Parser, Compiler, bundleEngineModules, buildPackedHtml, BUILTIN_CONSTANTS } = await import('../engine/divjs.js');

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function isLegacyDivFile(filePath) {
	const rel = relative(rootDir, filePath).replaceAll('\\', '/');
	// examples/*.div predates this compiler's actual grammar; demos/*.div
	// are DIV/Fenix reference source pulled from an external
	// implementation for API reference only - neither was ever meant to
	// compile against this project's tokenizer/parser. demos/*.html (the
	// interactive browser demos actually built against this engine) is
	// deliberately NOT excluded here - those should compile cleanly.
	return rel.startsWith('examples/') || (rel.startsWith('demos/') && rel.endsWith('.div'));
}

function compileSource(source) {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	const parser = new Parser(tokens);
	const ast = parser.parse();
	const compiler = new Compiler();
	const bytecode = compiler.compile(ast);
	return { tokens, ast, bytecode };
}

function walkFiles(dir, out = []) {
	for (const name of readdirSync(dir)) {
		// Hidden folders (.git, editor and tool folders - some hold whole
		// copies of the repository) and dependencies are not the project.
		if (name.startsWith('.') || name === 'node_modules' || name === 'dist') {
			continue;
		}
		const fullPath = join(dir, name);
		const st = statSync(fullPath);
		if (st.isDirectory()) {
			walkFiles(fullPath, out);
		} else {
			out.push(fullPath);
		}
	}
	return out;
}

function extractInlineDivSources(htmlText) {
	const sources = [];
	// Demo HTML files use "const SOURCE = ..." (uppercase); index.html and
	// examples/ use "const source = ..." (lowercase) - match both rather
	// than assuming one convention.
	const re = /const\s+SOURCE\s*=\s*`([\s\S]*?)`\s*;/gi;
	let m;
	while ((m = re.exec(htmlText)) !== null) {
		sources.push(m[1]);
	}
	return sources;
}

const files = walkFiles(rootDir);
const divFiles = files.filter((p) => extname(p).toLowerCase() === '.div' && !isLegacyDivFile(p));
const htmlFiles = files.filter((p) => extname(p).toLowerCase() === '.html');

let ok = 0;
let fail = 0;

for (const filePath of divFiles) {
	const rel = relative(rootDir, filePath);
	const source = readFileSync(filePath, 'utf-8');
	try {
		const { bytecode } = compileSource(source);
		console.log(`OK    ${rel.padEnd(35)} ${bytecode.instructions.length} instr, ${bytecode.processTable.size} procs`);
		ok += 1;
	} catch (err) {
		console.log(`FAIL  ${rel.padEnd(35)} ${err?.message || String(err)}`);
		fail += 1;
	}
}

for (const filePath of htmlFiles) {
	const rel = relative(rootDir, filePath);
	const html = readFileSync(filePath, 'utf-8');
	const inlineSources = extractInlineDivSources(html);
	if (inlineSources.length === 0) {
		continue;
	}

	for (let i = 0; i < inlineSources.length; i++) {
		const label = inlineSources.length === 1 ? rel : `${rel}#source${i + 1}`;
		try {
			const { bytecode } = compileSource(inlineSources[i]);
			console.log(`OK    ${label.padEnd(35)} ${bytecode.instructions.length} instr, ${bytecode.processTable.size} procs`);
			ok += 1;
		} catch (err) {
			console.log(`FAIL  ${label.padEnd(35)} ${err?.message || String(err)}`);
			fail += 1;
		}
	}
}

// Resolution a program runs at: its first set_mode(mWxH) or
// set_mode(width, height), else DIV's default 320x200. null when set_mode
// is called with something this can't read statically.

// The playground's program list: every entry must name an existing .div
// with the fields the page reads, and every .div in the folder must be
// listed (an unlisted program would silently never appear online).
const programsDir = join(rootDir, 'playground', 'programs');
const manifest = JSON.parse(readFileSync(join(programsDir, 'manifest.json'), 'utf-8'));
const categories = new Set((manifest.categories || []).map((c) => c.id));
const listed = new Set();
// The keys a "touch" entry may name: the key constants without the "_".
const keyNames = new Set(Object.keys(BUILTIN_CONSTANTS).filter((k) => k.startsWith('_')).map((k) => k.slice(1)));
function touchProblems(touch)
{
	if (touch === false)
	{
		return [];
	}
	if (!touch || typeof touch !== 'object')
	{
		return ['missing "touch" (the phone controls; false for none)'];
	}
	const problems = [];
	if (!['dpad', 'stick', 'none'].includes(touch.pad))
	{
		problems.push(`touch.pad "${touch.pad}"`);
	}
	for (const [field, max] of [['buttons', 6], ['menu', 2]])
	{
		const items = String(touch[field] ?? '').split(',').filter(Boolean);
		if (items.length > max)
		{
			problems.push(`touch.${field}: more than ${max}`);
		}
		for (const item of items)
		{
			const [key, label] = item.split(':');
			if (!keyNames.has(key) || !label)
			{
				problems.push(`touch.${field}: "${item}"`);
			}
		}
	}
	return problems;
}
for (const entry of manifest.programs || []) {
	const problems = [];
	for (const field of ['id', 'title', 'category', 'file', 'width', 'height']) {
		if (entry[field] === undefined || entry[field] === '') {
			problems.push(`missing "${field}"`);
		}
	}
	if (!categories.has(entry.category)) {
		problems.push(`unknown category "${entry.category}"`);
	}
	if (listed.has(entry.file)) {
		problems.push(`"${entry.file}" listed twice`);
	}
	listed.add(entry.file);
	try {
		statSync(join(programsDir, entry.file));
	} catch {
		problems.push(`file "${entry.file}" not found`);
	}
	// The screen size must be the one the program runs in: its first
	// set_mode, or DIV's default 320x200 without one (manual: "By default,
	// all the programs start with the 320 by 200 pixel activated mode").
	try {
		const expected = programResolution(readFileSync(join(programsDir, entry.file), 'utf-8'));
		if (expected && (expected[0] !== entry.width || expected[1] !== entry.height)) {
			problems.push(`size ${entry.width}x${entry.height}, but the program runs at ${expected[0]}x${expected[1]}`);
		}
	} catch {
		// Missing file: reported above.
	}
	problems.push(...touchProblems(entry.touch));
	const label = `manifest: ${entry.id}`;
	if (problems.length > 0) {
		console.log(`FAIL  ${label.padEnd(35)} ${problems.join(', ')}`);
		fail += 1;
	} else {
		ok += 1;
	}
}
for (const name of readdirSync(programsDir)) {
	if (extname(name) === '.div' && !listed.has(name)) {
		console.log(`FAIL  ${('manifest: ' + name).padEnd(35)} not listed in manifest.json`);
		fail += 1;
	}
}

// Sparkroll: the momentum platformer compiles with the processes and
// functions its physics and levels are built from.
{
	const problems = [];
	try
	{
		const { bytecode } = compileSource(readFileSync(join(programsDir, 'sparkroll.div'), 'utf-8'));
		for (const name of ['kip', 'chunk', 'spark', 'lost_spark', 'walker', 'flyer', 'spring', 'booster', 'goal', 'boss'])
		{
			if (!bytecode.processTable.has(name))
			{
				problems.push(`no PROCESS ${name}`);
			}
		}
		for (const name of ['solid', 'probe', 'ground_follow', 'kip_ground', 'kip_air', 'loop_layers', 'coast_a', 'works_b'])
		{
			if (!bytecode.functionTable.has(name))
			{
				problems.push(`no FUNCTION ${name}`);
			}
		}
	}
	catch (err)
	{
		problems.push(err?.message || String(err));
	}
	if (problems.length > 0)
	{
		console.log(`FAIL  ${'sparkroll (compile)'.padEnd(35)} ${problems.join(', ')}`);
		fail += 1;
	}
	else
	{
		console.log(`OK    ${'sparkroll (compile)'.padEnd(35)} processes and physics functions present`);
		ok += 1;
	}
}

// Rusty Leap: the jump-and-stomp platformer compiles with the processes
// and functions its player physics, enemies and levels are built from.
{
	const problems = [];
	try
	{
		const { bytecode } = compileSource(readFileSync(join(programsDir, 'rusty-leap.div'), 'utf-8'));
		for (const name of ['player', 'block', 'foe', 'item', 'gem', 'acorn_shot', 'lamp', 'waystone', 'mplat', 'hud'])
		{
			if (!bytecode.processTable.has(name))
			{
				problems.push(`no PROCESS ${name}`);
			}
		}
		for (const name of ['player_move', 'ptouch', 'hit_block', 'foe_walk', 'hurt_player', 'level1', 'level2', 'level3', 'font_part'])
		{
			if (!bytecode.functionTable.has(name))
			{
				problems.push(`no FUNCTION ${name}`);
			}
		}
	}
	catch (err)
	{
		problems.push(err?.message || String(err));
	}
	if (problems.length > 0)
	{
		console.log(`FAIL  ${'rusty-leap (compile)'.padEnd(35)} ${problems.join(', ')}`);
		fail += 1;
	}
	else
	{
		console.log(`OK    ${'rusty-leap (compile)'.padEnd(35)} processes and physics functions present`);
		ok += 1;
	}
}

// Beat Bash: the rhythm game compiles with the processes and functions its
// songs, charts and judging are built from.
{
	const problems = [];
	try
	{
		const { bytecode } = compileSource(readFileSync(join(programsDir, 'beat-bash.div'), 'utf-8'));
		for (const name of ['note', 'beatline', 'receptor', 'glowp', 'highway', 'popup', 'countin', 'spark', 'grade_show'])
		{
			if (!bytecode.processTable.has(name))
			{
				problems.push(`no PROCESS ${name}`);
			}
		}
		for (const name of ['song1', 'song2', 'song3', 'make_song', 'build_chart', 'judge', 'miss', 'play_update', 'resume_play', 'calib_update'])
		{
			if (!bytecode.functionTable.has(name))
			{
				problems.push(`no FUNCTION ${name}`);
			}
		}
	}
	catch (err)
	{
		problems.push(err?.message || String(err));
	}
	if (problems.length > 0)
	{
		console.log(`FAIL  ${'beat-bash (compile)'.padEnd(35)} ${problems.join(', ')}`);
		fail += 1;
	}
	else
	{
		console.log(`OK    ${'beat-bash (compile)'.padEnd(35)} processes and rhythm functions present`);
		ok += 1;
	}
}

// Export packs the engine bundle as a single module (the packer's own
// tests live with the library).
{
	const problems = [];
	const expect = (cond, msg) => { if (!cond) problems.push(msg); };
	const bundle = readFileSync(join(rootDir, 'engine', 'divjs.js'), 'utf-8');
	expect(!/^import\s/m.test(bundle), 'engine/divjs.js must be a bundle with no imports of its own');
	const html = buildPackedHtml({ modules: bundleEngineModules(bundle), source: 'program p; begin set_mode(640, 480); end', title: '<Game>' });
	expect(html.includes('width="640" height="480"'), 'the page canvas should take the program\'s set_mode size');
	expect(html.includes('<title>&lt;Game&gt;</title>'), 'the title must be escaped');
	expect(html.includes('Copyright (c) 2026 akadjoker') && html.includes('Permission is hereby granted'), 'a packed page must carry the engine\'s MIT notice');
	if (problems.length > 0)
	{
		console.log(`FAIL  ${'export (engine bundle)'.padEnd(35)} ${problems.join('; ')}`);
		fail += 1;
	}
	else
	{
		console.log(`OK    ${'export (engine bundle)'.padEnd(35)} ${(bundle.length / 1024).toFixed(0)} KB engine`);
		ok += 1;
	}
}

// DivJS Blocks (blocks/): every lesson's starting blocks and solution turn
// into DIV code that compiles, the solutions use every block together, and
// sprite and variable names become identifiers DIV accepts. Blockly runs
// headless here; it needs jsdom (a peer dependency of blockly) for the XML
// it uses when loading shadow blocks.
{
	const Blockly = await import('../blocks/vendor/blockly.js');
	const { JSDOM } = await import('jsdom');
	Blockly.utils.xml.injectDependencies(new JSDOM('<!DOCTYPE html>').window);
	const { registerBlocks, BLOCK_TYPES } = await import('../blocks/blocks.js');
	const { generateDiv, reservedNames } = await import('../blocks/generator.js');
	const { LESSONS } = await import('../blocks/lessons.js');
	const { compile } = await import('../engine/divjs.js');
	registerBlocks();

	const generate = (state) =>
	{
		const ws = new Blockly.Workspace();
		try
		{
			Blockly.serialization.workspaces.load(state, ws);
			const types = new Set(ws.getAllBlocks(false).map((b) => b.type));
			return { ...generateDiv(ws), types };
		}
		finally
		{
			ws.dispose();
		}
	};
	const report = (label, problems, detail) =>
	{
		if (problems.length > 0)
		{
			console.log(`FAIL  ${label.padEnd(35)} ${problems.join('; ')}`);
			fail += 1;
		}
		else
		{
			console.log(`OK    ${label.padEnd(35)} ${detail}`);
			ok += 1;
		}
	};

	const used = new Set();
	for (const lesson of LESSONS)
	{
		for (const which of ['start', 'solution'])
		{
			const problems = [];
			let detail = '';
			try
			{
				const { code, warnings, types } = generate(lesson[which]);
				if (which === 'solution')
				{
					types.forEach((t) => used.add(t));
				}
				if (warnings.length > 0)
				{
					problems.push(`warnings: ${warnings.map((w) => w.text).join(' / ')}`);
				}
				if (!code.startsWith('// Made with DivJS Blocks'))
				{
					problems.push('no header comment');
				}
				const bytecode = compile(code);
				detail = `${bytecode.instructions.length} instr, ${bytecode.processTable.size} procs`;
			}
			catch (err)
			{
				problems.push(err?.message || String(err));
			}
			report(`blocks: ${lesson.id} ${which}`, problems, detail);
		}
	}
	const unused = BLOCK_TYPES.filter((t) => !used.has(t));
	report('blocks: solutions use every block', unused.length > 0 ? [`not used: ${unused.join(', ')}`] : [], `${BLOCK_TYPES.length} block types`);

	// Awkward names: keywords, engine names, spaces, accents, digits, case.
	{
		const problems = [];
		const awkward = ['x', 'key', 'Score', 'score', 'my score!', 'élan', '2fast', 'loop', 'text', 'sfx_coin', 'MAIN', 'make_look', ''];
		const state = {
			blocks: {
				languageVersion: 0,
				blocks: [
					{ type: 'div_start', x: 0, y: 0, inputs: { DO: { block: { type: 'div_create', fields: { SPRITE: 'if' }, next: { block: { type: 'div_create', fields: { SPRITE: 'nobody' } } } } } } },
					{ type: 'div_sprite', x: 0, y: 200, fields: { NAME: 'if' } },
					{ type: 'div_sprite', x: 0, y: 400, fields: { NAME: 'player' }, inputs: { DO: { block: {
						type: 'div_var_set',
						fields: { VAR: { id: 'v0' } },
						inputs: { VALUE: { shadow: { type: 'div_number', fields: { NUM: -3 } } } },
						next: { block: { type: 'div_var_show', fields: { VAR: { id: 'v2' } } } }
					} } } },
					{ type: 'div_sprite', x: 0, y: 600, fields: { NAME: 'player' } }
				]
			},
			variables: awkward.map((name, i) => ({ name: name || 'blank', id: `v${i}` }))
		};
		try
		{
			const { code, warnings } = generate(state);
			compile(code);
			const globals = code.slice(code.indexOf('GLOBAL'), code.indexOf('PROCESS')).match(/^ {2}([a-z_][a-z0-9_]*) = 0;$/gm) || [];
			const ids = globals.map((line) => line.trim().split(' ')[0]);
			if (ids.length !== awkward.length || new Set(ids).size !== ids.length)
			{
				problems.push(`globals not unique: ${ids.join(', ')}`);
			}
			const reserved = reservedNames();
			const clash = ids.filter((id) => reserved.has(id));
			if (clash.length > 0)
			{
				problems.push(`reserved names used: ${clash.join(', ')}`);
			}
			const texts = warnings.map((w) => w.text).join(' / ');
			if (!/no sprite called "nobody"/.test(texts) || !/already a sprite called "player"/.test(texts))
			{
				problems.push(`expected warnings, got: ${texts}`);
			}
		}
		catch (err)
		{
			problems.push(err?.message || String(err));
		}
		report('blocks: names', problems, 'awkward names compile');
	}

	// English and Portuguese (blocks/i18n.js): the same keys, the same
	// placeholders, every block and lesson finds its words, and the code
	// the blocks make does not depend on the language.
	{
		const { STRINGS, LANGUAGES, setLanguage } = await import('../blocks/i18n.js');
		const placeholders = (text) => [...String(text).matchAll(/%\d+|\{\w+\}/g)].map((m) => m[0]).sort().join(' ');
		for (const language of LANGUAGES.filter((l) => l !== 'en'))
		{
			const problems = [];
			const en = STRINGS.en;
			const other = STRINGS[language];
			for (const key of Object.keys(en))
			{
				if (!(key in other))
				{
					problems.push(`missing ${key}`);
				}
				else if (Array.isArray(en[key]) !== Array.isArray(other[key]))
				{
					problems.push(`${key}: not the same kind of value`);
				}
				else if (Array.isArray(en[key]) ? other[key].some((line) => !line.trim()) : !other[key].trim())
				{
					problems.push(`${key}: empty`);
				}
				else if (!Array.isArray(en[key]) && placeholders(en[key]) !== placeholders(other[key]))
				{
					problems.push(`${key}: placeholders "${placeholders(other[key])}", English has "${placeholders(en[key])}"`);
				}
			}
			for (const key of Object.keys(other))
			{
				if (!(key in en))
				{
					problems.push(`${key} is not in English`);
				}
			}
			report(`blocks: ${language} strings match English`, problems, `${Object.keys(other).length} keys`);
		}

		// Every block's label, dropdowns and tooltip, and every lesson's
		// texts, resolve in every language (no %{BKY_...} or key left over).
		for (const language of LANGUAGES)
		{
			const problems = [];
			setLanguage(language);
			const ws = new Blockly.Workspace();
			try
			{
				for (const type of BLOCK_TYPES)
				{
					const block = ws.newBlock(type);
					const options = block.inputList.flatMap((input) => input.fieldRow)
						.filter((field) => field instanceof Blockly.FieldDropdown && !(field instanceof Blockly.FieldVariable))
						.flatMap((field) => field.getOptions(false).map(([label]) => (typeof label === 'string' ? label : label.alt)));
					const texts = [block.toString(), String(block.tooltip), ...options];
					if (texts.some((text) => /BKY_|%\{/.test(text)))
					{
						problems.push(`${type}: ${texts.find((text) => /BKY_|%\{/.test(text))}`);
					}
				}
			}
			finally
			{
				ws.dispose();
			}
			for (const lesson of LESSONS)
			{
				if (!lesson.title || lesson.title.startsWith('LESSON_') || !lesson.goal || lesson.goal.startsWith('LESSON_')
					|| !Array.isArray(lesson.hints) || lesson.hints.length === 0)
				{
					problems.push(`lesson ${lesson.id} has no texts`);
				}
			}
			report(`blocks: every text in ${language}`, problems, `${BLOCK_TYPES.length} blocks, ${LESSONS.length} lessons`);
		}

		// The same DIV code, byte for byte, in every language.
		{
			const problems = [];
			let count = 0;
			for (const lesson of LESSONS)
			{
				for (const which of ['start', 'solution'])
				{
					const codes = LANGUAGES.map((language) =>
					{
						setLanguage(language);
						return generate(lesson[which]).code;
					});
					count += 1;
					if (codes.some((code) => code !== codes[0]))
					{
						problems.push(`${lesson.id} ${which}`);
					}
				}
			}
			setLanguage('en');
			report('blocks: code is the same in every language', problems, `${count} workspaces in ${LANGUAGES.join(', ')}`);
		}
	}
}

console.log(`\nSummary: ${ok} ok, ${fail} failed`);
if (fail > 0) {
	process.exitCode = 1;
}
