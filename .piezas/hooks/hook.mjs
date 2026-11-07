// Piezas guardrails for this project. Written by "npx piezas init"; do not edit.
//
// Claude Code (.claude/settings.json) and Codex (.codex/hooks.json) run this
// file for every event, with the event's name as its argument. It loads the
// Piezas checks from the Piezas tools installed in this project
// (node_modules/piezas here, nowhere else). When they are missing or cannot
// start, a small rule built into this file still keeps the guardrails' own
// files in place, and the owner is told plainly that the guardrails are not
// fully running.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EVENTS = { 'session-start': 'SessionStart', 'user-prompt-submit': 'UserPromptSubmit', 'pre-tool-use': 'PreToolUse', stop: 'Stop' };
const argName = process.argv.slice(1).find((a) => Object.prototype.hasOwnProperty.call(EVENTS, a));
const named = argName ? EVENTS[argName] : null;
const projectDir = realOr(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const FAILED = 'Piezas check could not run; refusing this step. (For the AI: the Piezas hook could not read this event or run its checks.)';
const BLOCKED = 'This would change or switch off the Piezas guardrails for this app, and they are not fully running right now, ' +
  'so it was stopped. If you, the owner, want this change anyway, make it yourself in your own terminal. ' +
  '(For the AI: the Piezas tools are not installed in this project (node_modules/piezas), or could not start, so only this ' +
  'basic rule is running. Run npm install in the project folder first; never edit the guardrail files.)';
const MARKER_MAX_AGE_MS = 6 * 60 * 60 * 1000;
// The built-in rule's lists (used before the main flow below runs it).
const PROTECTED = ['.piezas/hooks', 'node_modules/piezas', '.claude/settings.json', '.claude/settings.local.json', '.codex/hooks.json', '.codex/config.toml'];
const HOLDERS = ['', '.claude', '.codex', '.piezas', 'node_modules'];
const MENTION = /\.piezas|hook\.mjs|hookentry|settings\.json|settings\.local\.json|hooks\.json|config\.toml|node_modules|\.claude|\.codex/i;
const WRITEISH = /[>]|(^|[\s;|&(])(rm|mv|cp|tee|truncate|ln|touch|install|rsync|dd|rimraf|unlink|shred|chmod|ditto)(\s|$)|sed\b[^\n]*\s-i|-delete\b|(^|[\s;|&(])git\s+(checkout|restore|clean|reset|stash)\b|(^|[\s;|&(])(node|python3?|ruby|perl|deno|bun)\s+(-e|-c|--eval|eval)\b/i;
const WIPE = /(^|[\s;|&(])git\s+(clean\s+[^;&|\n]*-[a-zA-Z]*[xX]|reset\s+[^;&|\n]*--hard|stash(\s|$))/;
const PM_PIEZAS = /(^|[\s;|&(])(npm|pnpm|yarn|bun)\s+[^;&|\n]*\b(install|i|add|ci|uninstall|un|remove|rm|r|update|up|upgrade|link|pkg)\b[^;&|\n]*(\s)piezas(@\S*)?(?=\s|$|;|&|\|)/i;


// usablePackage — node_modules/piezas is the piezas package at a version
// that runs the guardrails (0.7.0 or newer). Whatever installed it (npm,
// pnpm, yarn, bun, a mirror): where it came from is the guard's job (it
// refuses folder, file, tarball and link installs).
function usablePackage(real) {
  const pkgDir = real.slice(0, real.lastIndexOf(sep + 'src' + sep));
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(pkg.version || ''));
    return pkg.name === 'piezas' && !!m && (Number(m[1]) > 0 || Number(m[2]) >= 7);
  } catch {
    return false;
  }
}

// unusualSource — npm's own record says piezas came from somewhere other
// than a registry tarball: said to the owner once, never a reason not to run.
function unusualSource() {
  try {
    const lock = JSON.parse(readFileSync(join(projectDir, 'node_modules', '.package-lock.json'), 'utf-8'));
    const e = lock && lock.packages && lock.packages['node_modules/piezas'];
    return !!e && (!!e.link || (typeof e.resolved === 'string' && !/^https?:\/\/[^\s]+\.tgz$/.test(e.resolved)));
  } catch {
    return false;
  }
}

function realOr(p) {
  try { return realpathSync(p); } catch { return resolve(p); }
}

function refuse(reason) {
  process.stderr.write(reason + '\n');
  process.exit(2);
}

let payload = null;
try {
  payload = JSON.parse(readFileSync(0, 'utf-8'));
} catch {
  payload = null;
}
const valid = !!payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.hook_event_name === 'string';
if (!valid || (named && payload.hook_event_name !== named)) {
  // A tool call that cannot be read is refused; anything else is not ours.
  if (named === 'PreToolUse' || (valid && payload.hook_event_name === 'PreToolUse')) refuse(FAILED);
  process.exit(0);
}
const event = payload.hook_event_name;

// The checks: node_modules/piezas in this project (its real place must be
// there too, or in pnpm's store inside this project).
let entry = null;
let why = declared() === null ? 'nodep' : 'missing';
try {
  const real = realpathSync(join(projectDir, 'node_modules', 'piezas', 'src', 'hookentry.js'));
  const allowed = [join(projectDir, 'node_modules', 'piezas') + sep, join(projectDir, 'node_modules', '.pnpm') + sep];
  if (!allowed.some((a) => real.startsWith(a))) why = 'elsewhere';
  else if (!usablePackage(real)) why = 'unverified';
  else entry = real;
} catch {
  entry = null;
}

let runner = null;
if (entry) {
  try {
    runner = (await import(pathToFileURL(entry).href)).runProjectHook;
    if (typeof runner !== 'function') { runner = null; why = 'failed'; }
  } catch {
    why = 'failed';
  }
}

if (runner) {
  let out;
  try {
    out = await runner(payload, { projectDir });
  } catch (error) {
    // The checks are installed but could not run: a tool call is refused (as
    // the plugin does); the other events never stop the session.
    if (event === 'PreToolUse') refuse(FAILED);
    process.stderr.write('piezas hook: ' + ((error && error.message) || error) + '\n');
    process.exit(0);
  }
  let stdout = out && out.stdout ? out.stdout : '';
  // A notice, at the start of a session, when npm's record shows piezas came
  // from somewhere unusual (the checks run all the same).
  if (event === 'SessionStart' && unusualSource()) {
    const notice = 'Note: the Piezas tools here were not installed from the npm registry. If that is not what you meant, ask your AI tool to reinstall them.';
    try {
      const o = stdout ? JSON.parse(stdout) : {};
      o.systemMessage = o.systemMessage ? o.systemMessage + ' ' + notice : notice;
      stdout = JSON.stringify(o);
    } catch { /* keep the answer as it is */ }
  }
  if (stdout) process.stdout.write(stdout + '\n');
  if (out && out.stderr) process.stderr.write(out.stderr + '\n');
  process.exit(out && out.code === 2 ? 2 : 0);
}

// The checks are missing or could not start.
if (event === 'PreToolUse') {
  const reason = minimumRule(payload);
  if (reason) refuse(reason);
  process.exit(0);
}
notRunning();
process.exit(0);

// --- the built-in rule: the guardrails' own files stay in place ------------

function fold(s) {
  return process.platform === 'darwin' || process.platform === 'win32' ? s.toLowerCase() : s;
}

function relOf(p, base) {
  if (typeof p !== 'string' || !p) return null;
  const abs = resolve(base, p);
  let real = abs;
  try { real = join(realpathSync(dirname(abs)), basename(abs)); } catch { real = abs; }
  const rel = relative(projectDir, real).split(sep).join('/');
  return rel.startsWith('..') || isAbsolute(rel) ? null : fold(rel);
}

function hits(rel, deleting) {
  if (rel === null) return false;
  if (PROTECTED.some((p) => rel === p || rel.startsWith(p + '/'))) return true;
  return deleting && HOLDERS.includes(rel);
}

function patchText(input) {
  if (typeof input === 'string') return input.includes('*** Begin Patch') ? input : null;
  if (Array.isArray(input)) {
    for (const part of input) if (typeof part === 'string' && part.includes('*** Begin Patch')) return part;
    return null;
  }
  if (input && typeof input === 'object') {
    for (const field of ['input', 'patch', 'command', 'cmd']) {
      const found = patchText(input[field]);
      if (found) return found;
    }
  }
  return null;
}

function usableSpec(spec) {
  const m = /^[\^~]?(\d+)\.(\d+)\.(\d+)$/.exec(String(spec || '').trim());
  return !!m && (Number(m[1]) > 0 || Number(m[2]) >= 7);
}

function declared() {
  try { return piezasSpec(readFileSync(join(projectDir, 'package.json'), 'utf-8')); } catch { return null; }
}

function addsUsablePiezas(cmd) {
  if (!/\b(install|i|add)\b/.test(cmd)) return false;
  const named = cmd.match(/(?:^|\s)piezas@(\S+)/gi) || [];
  return named.length > 0 && named.every((n) => usableSpec(n.trim().slice('piezas@'.length)));
}

function piezasSpec(text) {
  const m = /"piezas"\s*:\s*"([^"]*)"/.exec(String(text || ''));
  return m ? m[1] : null;
}

function minimumRule(p) {
  const tool = typeof p.tool_name === 'string' ? p.tool_name : '';
  const input = p.tool_input && typeof p.tool_input === 'object' ? p.tool_input : {};
  const cwd = typeof p.cwd === 'string' && p.cwd ? p.cwd : projectDir;
  const base = typeof input.workdir === 'string' && input.workdir ? resolve(cwd, input.workdir) : cwd;
  const patch = tool === 'apply_patch' || !(typeof input.file_path === 'string' || typeof input.path === 'string') ? patchText(input) : null;
  if (patch) {
    let last = null;
    for (const line of patch.split('\n')) {
      const m = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
      const mv = /^\*\*\* Move to: (.+)$/.exec(line);
      if (m) {
        last = relOf(m[2].trim(), base);
        if (hits(last, m[1] === 'Delete')) return BLOCKED;
        if (last === 'package.json' && /piezas/i.test(patch)) return BLOCKED;
      } else if (mv) {
        if (hits(relOf(mv[1].trim(), base), false) || hits(last, true)) return BLOCKED;
      }
    }
    return null;
  }
  if (tool === 'Bash' || tool === 'shell' || tool === 'exec_command' || tool === 'local_shell') {
    const c = input.command !== undefined ? input.command : input.cmd;
    const cmd = Array.isArray(c) ? c.join(' ') : typeof c === 'string' ? c : '';
    if (!cmd) return null;
    if (WIPE.test(cmd)) return BLOCKED;
    // Adding piezas back (0.7.0 or newer) when the project no longer lists it.
    if (PM_PIEZAS.test(cmd) && !(declared() === null && addsUsablePiezas(cmd))) return BLOCKED;
    if (MENTION.test(cmd) && WRITEISH.test(cmd)) return BLOCKED;
    if (/package\.json/i.test(cmd) && /piezas/i.test(cmd) && WRITEISH.test(cmd)) return BLOCKED;
    return null;
  }
  const file = input.file_path !== undefined ? input.file_path : input.path !== undefined ? input.path : input.notebook_path;
  if (typeof file !== 'string') return null;
  const rel = relOf(file, base);
  if (hits(rel, false)) return BLOCKED;
  if (rel === 'package.json') {
    let current = '';
    try { current = readFileSync(join(projectDir, 'package.json'), 'utf-8'); } catch { current = ''; }
    const spec = piezasSpec(current);
    let next = null;
    if (tool === 'Write') next = typeof input.content === 'string' ? input.content : null;
    else {
      const edits = Array.isArray(input.edits) ? input.edits : [input];
      next = current;
      for (const ed of edits) {
        if (!ed || typeof ed.old_string !== 'string' || typeof ed.new_string !== 'string' || next === null || !next.includes(ed.old_string)) { next = null; break; }
        next = ed.replace_all ? next.split(ed.old_string).join(ed.new_string) : next.replace(ed.old_string, () => ed.new_string);
      }
    }
    if (next === null) return /piezas/i.test(JSON.stringify(input)) ? BLOCKED : null;
    const after = piezasSpec(next);
    // The piezas entry stays as it is, or (when it is missing) comes back at
    // a published version that runs the guardrails.
    if (spec !== null ? after !== spec : after !== null && !usableSpec(after)) return BLOCKED;
  }
  return null;
}

// --- telling the owner -------------------------------------------------------

function stateDir() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const dir = process.env.PIEZAS_HOOK_STATE_DIR || join(tmpdir(), 'piezas-hooks-' + (uid === null ? 'user' : uid));
  try {
    mkdirSync(dir, { mode: 0o700 });
  } catch (error) {
    if (!error || error.code !== 'EEXIST') return null;
  }
  try {
    const st = lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) return null;
    if (uid !== null && st.uid !== uid) return null;
    if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) return null;
    return dir;
  } catch {
    return null;
  }
}

function markerKey() {
  const sid = typeof payload.session_id === 'string' && payload.session_id ? payload.session_id : '';
  return sid ? createHash('sha256').update(sid + '\0' + projectDir).digest('hex').slice(0, 32) : '';
}

function pluginActive(dir, key) {
  try {
    const st = lstatSync(join(dir, 'plugin-' + key));
    if (!st.isFile() || st.isSymbolicLink()) return false;
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return false;
    const age = Date.now() - st.mtimeMs;
    return age > -60000 && age < MARKER_MAX_AGE_MS;
  } catch {
    return false;
  }
}

// once — true the first time this session (or when that cannot be recorded).
function once(dir, name) {
  try {
    writeFileSync(join(dir, name), new Date().toISOString(), { flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) {
    return !(error && error.code === 'EEXIST');
  }
}

function notRunning() {
  const dir = stateDir();
  const key = markerKey();
  // The plugin is running in this session: it checks everything already.
  if (dir && key && pluginActive(dir, key)) return;
  // Once per session: said at the start (always), else on the first message
  // or the first end of turn.
  if (dir && key) {
    const first = once(dir, 'notice-' + key);
    if (!first && event !== 'SessionStart') return;
  }
  const owner = why === 'nodep'
    ? 'Piezas guardrails are not fully running in this project: it no longer lists the Piezas tools (package.json). Until it does, only a basic protection of the guardrails themselves is on. Ask your AI tool to add the Piezas tools back (npx piezas init); they start with your next message.'
    : why === 'missing'
    ? 'Piezas guardrails are not fully running in this project: the Piezas tools are not installed here. Until they are, only a basic protection of the guardrails themselves is on. Ask your AI tool to install the Piezas tools in this folder; they start with your next message.'
    : why === 'unverified' || why === 'elsewhere'
      ? 'Piezas guardrails are not fully running in this project: the Piezas tools here are not a version that runs them (0.7.0 or newer is needed), or not the Piezas tools at all. Until that changes, only a basic protection of the guardrails themselves is on. Ask your AI tool to install the Piezas tools again; they start with your next message.'
      : 'Piezas guardrails are not fully running in this project: the Piezas tools installed here could not start. Until they do, only a basic protection of the guardrails themselves is on. Ask your AI tool to reinstall the Piezas tools; they start with your next message.';
  const ai = '[Piezas] The Piezas guardrails are not running: node_modules/piezas in this project is ' +
    (why === 'nodep' ? 'not listed in package.json (the piezas devDependency is gone; add it back with npx piezas init or npm install -D piezas@<0.7.0 or newer>)'
      : why === 'missing' ? 'missing' : why === 'unverified' ? 'not piezas 0.7.0 or newer' : why === 'elsewhere' ? 'a link to a folder outside the project' : 'not usable') +
    ', so only a basic rule protects the guardrail files. Tell the owner in one plain sentence, and offer to run npm install ' +
    '(a plain install from the registry) in the project folder; they start with the next message.';
  if (event === 'Stop') {
    process.stdout.write(JSON.stringify({ systemMessage: owner }) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify({ systemMessage: owner, hookSpecificOutput: { hookEventName: event, additionalContext: ai } }) + '\n');
}
