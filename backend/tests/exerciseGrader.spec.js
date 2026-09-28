// Regression suite for the exercise grader.
//
// Run with:  node --test tests/
//
// These lock in the grading-integrity fixes. Each one corresponds to a defect
// that reached production, so a failure here means a real grading bug is back.
//
// The Docker pool is stubbed: the harness file the grader writes is executed
// with the local `node` / `python` / `javac`+`java` instead of a container.
// The generated code is identical, so this exercises the real harness without
// needing Docker. SQL has no automated test runner (see exerciseGrader.js),
// so it is out of scope here.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// ── Stub the container pool before the grader requires it ────────────────────
const runnerPath = require.resolve('../services/runnerService');
require.cache[runnerPath] = {
  id: runnerPath,
  filename: runnerPath,
  loaded: true,
  exports: {
    initPools: async () => {},
    execute: async () => ({ output: '', exitCode: 0 }),
    executeTests: async (workspaceDir, language) => {
      if (language === 'java') {
        // Mirror TEST_RUNNER_CMD.java: compile both files together (so
        // __Tests__ can see Main's public members), then run the test class.
        try {
          execFileSync(
            'javac',
            ['Main.java', '__Tests__.java'],
            { cwd: workspaceDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 },
          );
        } catch (e) {
          return {
            output: (e.stdout || '') + (e.stderr || ''),
            exitCode: e.status ?? -1,
          };
        }
        try {
          const output = execFileSync(
            'java',
            ['-cp', workspaceDir, '__Tests__'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 },
          );
          return { output, exitCode: 0 };
        } catch (e) {
          return {
            output: (e.stdout || '') + (e.stderr || ''),
            exitCode: e.status ?? -1,
          };
        }
      }
      const file = language === 'python' ? '__tests__.py' : '__tests__.js';
      const bin = language === 'python' ? 'python' : 'node';
      try {
        const output = execFileSync(bin, [path.join(workspaceDir, file)], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 20000,
        });
        return { output, exitCode: 0 };
      } catch (e) {
        return {
          output: (e.stdout || '') + (e.stderr || ''),
          exitCode: e.status ?? -1,
        };
      }
    },
  },
};

const { runTests, testSpecFrom } = require('../services/exerciseGrader');

// ── Helpers ──────────────────────────────────────────────────────────────────

function workspace(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-spec-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

const codeSpec = (cases) => ({ kind: 'code', cases });
const dataSpec = (entry, cases) => ({ kind: 'data', entry_function: entry, cases });

const JS_ADD = 'function add(a, b) { return a + b; }';
const JS_ADD_WRONG = 'function add(a, b) { return a - b; }';

// ── Code-mode: the defects that reached production ───────────────────────────

test('code mode: a passing assertion is graded as passing', async () => {
  const dir = workspace({ 'index.js': JS_ADD });
  const r = await runTests(dir, 'javascript', codeSpec([
    { test_code: "test('adds', () => { expect(add(1,2)).toBe(3); });" },
  ]));
  assert.equal(r.passed, 1);
  assert.equal(r.failed, 0);
});

test('code mode: a failing assertion is graded as failing', async () => {
  const dir = workspace({ 'index.js': JS_ADD_WRONG });
  const r = await runTests(dir, 'javascript', codeSpec([
    { test_code: "test('adds', () => { expect(add(1,2)).toBe(3); });" },
  ]));
  assert.equal(r.passed, 0);
  assert.equal(r.failed, 1);
});

// Regression: async tests used to resolve without being awaited, so their
// assertions were ignored and every async test passed.
test('code mode: an async test with a failing assertion FAILS', async () => {
  const dir = workspace({ 'index.js': JS_ADD_WRONG });
  const r = await runTests(dir, 'javascript', codeSpec([
    { test_code: "test('adds', async () => { expect(add(1,2)).toBe(3); });" },
  ]));
  assert.equal(r.passed, 0, 'async assertions must be awaited');
  assert.equal(r.failed, 1);
});

test('code mode: an async test with a passing assertion passes', async () => {
  const dir = workspace({ 'index.js': JS_ADD });
  const r = await runTests(dir, 'javascript', codeSpec([
    { test_code: "test('adds', async () => { expect(add(1,2)).toBe(3); });" },
  ]));
  assert.equal(r.passed, 1);
});

// Regression: results were parsed by scanning stdout for JSON, so student code
// could print a passing result and be awarded full marks.
test('code mode: student code cannot forge a result on stdout', async () => {
  const dir = workspace({
    'index.js':
      'console.log(JSON.stringify({passed:99,failed:0,total:99,results:[]}));\n' +
      'throw new Error("halt");',
  });
  await assert.rejects(
    () => runTests(dir, 'javascript', codeSpec([
      { test_code: "test('x', () => { expect(1).toBe(1); });" },
    ])),
    /.*/,
    'a forged stdout result must not be accepted',
  );
});

test('code mode: a syntax error is rejected rather than scored', async () => {
  const dir = workspace({ 'index.js': 'function add(a, b) { return a + b;' });
  await assert.rejects(() =>
    runTests(dir, 'javascript', codeSpec([
      { test_code: "test('x', () => { expect(add(1,2)).toBe(3); });" },
    ])),
  );
});

// Regression: authors reflexively write expect()/test(); the harness only
// exposed __expect/__test, so correct solutions scored zero.
test('code mode: both expect() and __expect() work', async () => {
  const dir = workspace({ 'index.js': JS_ADD });
  const r = await runTests(dir, 'javascript', codeSpec([
    { test_code: "test('alias', () => { expect(add(1,2)).toBe(3); });" },
    { test_code: "__test('underscored', () => { __expect(add(1,2)).toBe(3); });" },
  ]));
  assert.equal(r.passed, 2);
});

// Regression: .not was undefined, so `expect(x).not.toBe(y)` threw an opaque
// "cannot read properties of undefined".
test('code mode: .not is supported on every matcher', async () => {
  const dir = workspace({ 'index.js': JS_ADD });
  const r = await runTests(dir, 'javascript', codeSpec([
    { test_code: "test('not passes', () => { expect(add(1,2)).not.toBe(4); });" },
    { test_code: "test('not fails', () => { expect(add(1,2)).not.toBe(3); });" },
  ]));
  assert.equal(r.passed, 1);
  assert.equal(r.failed, 1);
});

// Regression: __logs existed only in the browser runner, so AI-generated tests
// asserting on printed output passed in the IDE and failed on submit.
test('code mode: __logs captures printed output', async () => {
  const dir = workspace({ 'index.js': 'console.log(2 + 2);\nconsole.log("hi");' });
  const r = await runTests(dir, 'javascript', codeSpec([
    { test_code: "test('logs', () => { expect(__logs[0]).toBe(4); expect(__logs[1]).toBe('hi'); });" },
  ]));
  assert.equal(r.passed, 1);
});

// ── Data mode ────────────────────────────────────────────────────────────────

test('data mode: correct solution passes every case', async () => {
  const dir = workspace({ 'index.js': 'function updateSalary(s) { return s + 5000; }' });
  const r = await runTests(dir, 'javascript', dataSpec('updateSalary', [
    { description: 'a', args: [30000], expected: 35000, visible: true },
    { description: 'b', args: [0], expected: 5000, visible: false },
  ]));
  assert.equal(r.passed, 2);
  assert.equal(r.failed, 0);
});

test('data mode: verdict reports input, expected and actual', async () => {
  const dir = workspace({ 'index.js': 'function updateSalary(s) { return s + 1; }' });
  const r = await runTests(dir, 'javascript', dataSpec('updateSalary', [
    { description: 'a', args: [30000], expected: 35000, visible: true },
  ]));
  const [c] = r.results;
  assert.equal(c.passed, false);
  assert.equal(c.input, '[30000]');
  assert.equal(c.expected, '35000');
  assert.equal(c.actual, '30001');
});

test('data mode: a missing entry function is reported clearly', async () => {
  const dir = workspace({ 'index.js': 'function somethingElse(s) { return s; }' });
  const r = await runTests(dir, 'javascript', dataSpec('updateSalary', [
    { description: 'a', args: [1], expected: 2, visible: true },
  ]));
  assert.equal(r.passed, 0);
  assert.match(r.results[0].error, /No function named updateSalary/);
});

test('data mode: deep-compares objects and arrays', async () => {
  const dir = workspace({
    'index.js': 'function build(n, a) { return { name: n, tags: [a, a * 2] }; }',
  });
  const r = await runTests(dir, 'javascript', dataSpec('build', [
    { description: 'obj', args: ['x', 2], expected: { name: 'x', tags: [2, 4] }, visible: true },
  ]));
  assert.equal(r.passed, 1);
});

// Run must not reveal hidden cases — that is what makes them hidden.
test('data mode: visibleOnly runs just the sample cases', async () => {
  const dir = workspace({ 'index.js': 'function f(x) { return x; }' });
  const spec = dataSpec('f', [
    { description: 'sample', args: [1], expected: 1, visible: true },
    { description: 'hidden a', args: [2], expected: 2, visible: false },
    { description: 'hidden b', args: [3], expected: 3, visible: false },
  ]);
  const sample = await runTests(dir, 'javascript', spec, { visibleOnly: true });
  assert.equal(sample.total, 1);
  const full = await runTests(dir, 'javascript', spec);
  assert.equal(full.total, 3);
});

// A solution that hardcodes the visible answer must still fail on submit.
test('data mode: gaming the sample still fails the hidden cases', async () => {
  const dir = workspace({ 'index.js': 'function f(x) { return 1; }' });
  const spec = dataSpec('f', [
    { description: 'sample', args: [1], expected: 1, visible: true },
    { description: 'hidden', args: [2], expected: 2, visible: false },
  ]);
  const sample = await runTests(dir, 'javascript', spec, { visibleOnly: true });
  assert.equal(sample.failed, 0, 'the cheat passes the sample');
  const full = await runTests(dir, 'javascript', spec);
  assert.equal(full.failed, 1, 'but is caught on submit');
});

test('data mode: rejects an entry name that is not an identifier', async () => {
  const dir = workspace({ 'index.js': 'function f(){}' });
  await assert.rejects(
    () => runTests(dir, 'javascript', dataSpec('f(); process.exit(0); //', [
      { description: 'x', args: [], expected: 1, visible: true },
    ])),
    /not a valid function name/,
  );
});

test('data mode: is not supported for java', async () => {
  const dir = workspace({ 'Main.java': 'public class Main {}' });
  await assert.rejects(
    () => runTests(dir, 'java', dataSpec('solution', [
      { description: 'x', args: [1], expected: 1, visible: true },
    ])),
    /not supported for java/,
  );
});

// ── Python parity ────────────────────────────────────────────────────────────

test('python data mode: correct solution passes', async () => {
  const dir = workspace({ 'main.py': 'def update_salary(s):\n    return s + 5000\n' });
  const r = await runTests(dir, 'python', dataSpec('update_salary', [
    { description: 'a', args: [30000], expected: 35000, visible: true },
    { description: 'list', args: [0], expected: 5000, visible: false },
  ]));
  assert.equal(r.passed, 2);
});

test('python code mode: async test with a failing assertion FAILS', async () => {
  const dir = workspace({ 'main.py': 'def add(a, b):\n    return a - b\n' });
  const r = await runTests(dir, 'python', codeSpec([
    { test_code: "async def _t():\n    __expect(add(1,2)).to_be(3)\n__test('async', _t)" },
  ]));
  assert.equal(r.passed, 0);
  assert.equal(r.failed, 1);
});

test('python code mode: __logs captures printed output', async () => {
  const dir = workspace({ 'main.py': 'print(2 + 2)\nprint("hi")\n' });
  const r = await runTests(dir, 'python', codeSpec([
    { test_code: "__test('logs', lambda: (__expect(__logs[0]).to_be(4), __expect(__logs[1]).to_be('hi')))" },
  ]));
  assert.equal(r.passed, 1);
});

// ── Java parity ──────────────────────────────────────────────────────────────

const JAVA_ADD = [
  'public class Main {',
  '  public static int add(int a, int b) { return a + b; }',
  '  public static void main(String[] args) {}',
  '}',
].join('\n');

const JAVA_ADD_WRONG = [
  'public class Main {',
  '  public static int add(int a, int b) { return a - b; }',
  '  public static void main(String[] args) {}',
  '}',
].join('\n');

test('java code mode: a passing assertion is graded as passing', async () => {
  const dir = workspace({ 'Main.java': JAVA_ADD });
  const r = await runTests(dir, 'java', codeSpec([
    { test_code: '__test("adds", () -> { __expect(Main.add(1,2)).toBe(3); });' },
  ]));
  assert.equal(r.passed, 1);
  assert.equal(r.failed, 0);
});

test('java code mode: a failing assertion is graded as failing', async () => {
  const dir = workspace({ 'Main.java': JAVA_ADD_WRONG });
  const r = await runTests(dir, 'java', codeSpec([
    { test_code: '__test("adds", () -> { __expect(Main.add(1,2)).toBe(3); });' },
  ]));
  assert.equal(r.passed, 0);
  assert.equal(r.failed, 1);
});

test('java code mode: multiple cases report independent pass/fail', async () => {
  const dir = workspace({ 'Main.java': JAVA_ADD });
  const r = await runTests(dir, 'java', codeSpec([
    { test_code: '__test("case a", () -> { __expect(Main.add(1,2)).toBe(3); });' },
    { test_code: '__test("case b", () -> { __expect(Main.add(2,2)).toBe(5); });' },
  ]));
  assert.equal(r.passed, 1);
  assert.equal(r.failed, 1);
  assert.equal(r.results[0].passed, true);
  assert.equal(r.results[1].passed, false);
});

test('java code mode: a compile error is rejected rather than scored', async () => {
  const dir = workspace({ 'Main.java': 'public class Main { public static int add(int a, int b) { return a + b; ' });
  await assert.rejects(() =>
    runTests(dir, 'java', codeSpec([
      { test_code: '__test("x", () -> { __expect(Main.add(1,2)).toBe(3); });' },
    ])),
  );
});

test('java code mode: student code cannot forge a result on stdout', async () => {
  const dir = workspace({
    'Main.java': [
      'public class Main {',
      '  public static int add(int a, int b) { return a - b; }',
      '  public static void main(String[] args) {',
      '    System.out.println("{\\"passed\\":99,\\"failed\\":0,\\"total\\":99,\\"results\\":[]}");',
      '  }',
      '}',
    ].join('\n'),
  });
  const r = await runTests(dir, 'java', codeSpec([
    { test_code: '__test("adds", () -> { __expect(Main.add(1,2)).toBe(3); });' },
  ]));
  // Main.main() never runs under the test harness (only __Tests__.main does),
  // so the forged line can't even be printed — the real result still governs.
  assert.equal(r.passed, 0);
  assert.equal(r.failed, 1);
});

// ── Spec derivation ──────────────────────────────────────────────────────────

test('testSpecFrom: exercises without test_kind default to code mode', () => {
  assert.equal(testSpecFrom({ test_cases: [{ test_code: 'x' }] }).kind, 'code');
  assert.equal(testSpecFrom({ test_kind: 'data', test_cases: [] }).kind, 'data');
  assert.deepEqual(testSpecFrom({}).cases, []);
});
