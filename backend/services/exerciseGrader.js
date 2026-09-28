const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const runnerService = require('./runnerService');

// Files the grader generates. They inline every test case — including hidden
// ones and their expected values — so they must never live in, or be read back
// out of, a student's workspace.
const HARNESS_FILES = new Set([
  '__tests__.js',
  '__tests__.py',
  '__Tests__.java',
  '__Tests__.class',
]);

/**
 * Copy a student's workspace into a throwaway directory to grade in.
 *
 * The harness used to be written into the workspace itself and left there;
 * `workspace/init` lists that directory and hands everything back, so the next
 * time the student opened the exercise they received the full generated test
 * file — hidden cases, expected values and all. Grading against a copy keeps
 * their workspace untouched.
 */
function createStagingDir(workspaceDir) {
  const dir = path.join(
    os.tmpdir(),
    'codeguru-grade',
    crypto.randomBytes(12).toString('hex'),
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(workspaceDir, dir, {
    recursive: true,
    // Skip any harness file left behind by a pre-fix run.
    filter: (src) => !HARNESS_FILES.has(path.basename(src)),
  });
  return dir;
}

function removeStagingDir(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

const ENTRY_FILE = {
  javascript: 'index.js',
  python: 'main.py',
  java: 'Main.java',
  sql: 'solution.sql',
};

const TEST_RUNNER_CMD = {
  javascript: { image: 'workspace-node', cmd: ['node', '__tests__.js'] },
  python: { image: 'workspace-python', cmd: ['python3', '__tests__.py'] },
  java: {
    image: 'workspace-java',
    cmd: [
      'sh',
      '-c',
      'cd /workspace && javac Main.java __Tests__.java 2>&1 && java -cp /workspace __Tests__',
    ],
  },
  // sql: not supported — no test runner for SQL exercises
};

// Console capture. Must be prepended BEFORE the student's code so that
// __logs[] holds everything they printed — AI-generated test cases assert
// against __logs rather than against the student's variables.
const JS_PRELUDE = `const __logs=[];
const __origLog=console.log,__origErr=console.error;
console.log=(...a)=>{__logs.push(a.length===1?a[0]:a.join(' '));__origLog(...a);};
console.error=(...a)=>{__logs.push('[Error]: '+a.join(' '));__origErr(...a);};
`;

const PY_PRELUDE = `import builtins as __b\n__logs=[]\n__orig_print=__b.print\ndef __cp(*a,**k):\n    if len(a)==1: __logs.append(a[0])\n    else: __logs.append(k.get('sep',' ').join(str(x) for x in a))\n    __orig_print(*a,**k)\n__b.print=__cp\n`;

const JS_TEST_HEADER = `let __p=0,__f=0,__r=[];const __q=[];
const __test=(d,fn)=>{__q.push({d:d,fn:fn});};
const __fmtv=(v)=>{try{const s=JSON.stringify(v);return s===undefined?String(v):s}catch{return String(v)}};
const __mkExpect=(a,neg)=>{
  const chk=(ok,msg)=>{if(ok===neg)throw new Error((neg?'Expected not ':'Expected ')+msg)};
  return {
    toBe:(e)=>chk(a===e,__fmtv(e)+', got '+__fmtv(a)),
    toEqual:(e)=>chk(JSON.stringify(a)===JSON.stringify(e),__fmtv(e)+', got '+__fmtv(a)),
    toBeTruthy:()=>chk(!!a,'truthy, got '+__fmtv(a)),
    toBeFalsy:()=>chk(!a,'falsy, got '+__fmtv(a)),
    toBeNull:()=>chk(a===null,'null, got '+__fmtv(a)),
    toBeUndefined:()=>chk(a===undefined,'undefined, got '+__fmtv(a)),
    toBeGreaterThan:(e)=>chk(a>e,'greater than '+e+', got '+__fmtv(a)),
    toBeLessThan:(e)=>chk(a<e,'less than '+e+', got '+__fmtv(a)),
    toContain:(e)=>chk(a!=null&&typeof a.includes==='function'&&a.includes(e),'to contain '+__fmtv(e)),
  };
};
// .not mirrors every matcher — authors reach for it reflexively, and without it
// \`__expect(x).not.toBe(y)\` fails with an opaque "cannot read toBe of undefined".
const __expect=(a)=>{const o=__mkExpect(a,false);o.not=__mkExpect(a,true);return o;};
// Jest-style aliases: authors reflexively write expect()/test(), and without
// these the whole suite fails with "expect is not defined" even when the
// student's solution is correct. Assigned onto globalThis (not re-declared)
// so student code that already defined these names can't cause a redeclaration
// SyntaxError — by this point their code has finished running.
globalThis.expect=__expect;globalThis.test=__test;globalThis.it=__test;
`;
// Tests are queued by __test and executed here, awaited, so an async test whose
// assertion fails is recorded as failed instead of silently passing.
// Results are emitted behind a per-run random sentinel so student code cannot
// forge a result line on stdout.
const JS_TEST_FOOTER = (sentinel) => `
;(async()=>{
  for(const t of __q){
    try{ await t.fn(); __r.push({description:t.d,passed:true}); __p++; }
    catch(e){ __r.push({description:t.d,passed:false,error:(e&&e.message)?e.message:String(e)}); __f++; }
  }
  console.log=__origLog;console.error=__origErr;
  console.log(${JSON.stringify(sentinel)}+JSON.stringify({passed:__p,failed:__f,total:__p+__f,results:__r}));
  process.exit(__f>0?1:0);
})();
`;

const PY_TEST_HEADER = `import json,sys,inspect,asyncio\n_p,_f,_r=0,0,[]\n_q=[]\ndef __test(d,fn):\n  _q.append((d,fn))\nclass _E:\n  def __init__(self,a):self._a=a\n  def to_be(self,e):\n    assert self._a==e,f"Expected {repr(e)}, got {repr(self._a)}"\n  def to_equal(self,e):\n    assert self._a==e,f"Expected {repr(e)}, got {repr(self._a)}"\n  def to_be_truthy(self):\n    assert self._a,"Expected truthy"\n  def to_be_falsy(self):\n    assert not self._a,"Expected falsy"\ndef __expect(a): return _E(a)\nexpect = __expect\ntest = __test\n`;
const PY_TEST_FOOTER = (sentinel) => `
async def __run_all():
  global _p,_f
  for _d,_fn in _q:
    try:
      _res=_fn()
      if inspect.isawaitable(_res): await _res
      _r.append({"description":_d,"passed":True});_p+=1
    except Exception as _e:
      _r.append({"description":_d,"passed":False,"error":str(_e)});_f+=1
asyncio.run(__run_all())
__b.print=__orig_print
print(${JSON.stringify(sentinel)}+json.dumps({"passed":_p,"failed":_f,"total":_p+_f,"results":_r}))
sys.exit(1 if _f>0 else 0)
`;

// Java test framework — test cases call static methods on the student's Main class.
// Both Main.java and __Tests__.java are compiled together so Main's public members are accessible.
const JAVA_TEST_HEADER = `import java.util.*;
public class __Tests__ {
  static int __p=0,__f=0;
  static List<Map<String,Object>> __r=new ArrayList<>();
  @FunctionalInterface interface __Fn{void run()throws Exception;}
  static void __test(String d,__Fn fn){
    try{fn.run();Map<String,Object>m=new LinkedHashMap<>();m.put("description",d);m.put("passed",true);__r.add(m);__p++;}
    catch(Throwable e){Map<String,Object>m=new LinkedHashMap<>();m.put("description",d);m.put("passed",false);String err=e.getMessage()==null?e.getClass().getSimpleName():e.getMessage().replace("\\\\","\\\\\\\\").replace("\\"","'");m.put("error",err);__r.add(m);__f++;}
  }
  static<T>__E<T>__expect(T a){return new __E<>(a);}
  static class __E<T>{T a;__E(T v){this.a=v;}
    public void toBe(T e){if(!Objects.equals(a,e))throw new AssertionError("Expected "+e+", got "+a);}
    public void toEqual(T e){if(!Objects.equals(a,e))throw new AssertionError("Expected "+e+", got "+a);}
    public void toBeTruthy(){if(a==null||Boolean.FALSE.equals(a)||Integer.valueOf(0).equals(a))throw new AssertionError("Expected truthy");}
    public void toBeFalsy(){if(a!=null&&!Boolean.FALSE.equals(a)&&!Integer.valueOf(0).equals(a))throw new AssertionError("Expected falsy");}
  }
  public static void main(String[]args)throws Exception{
`;
const JAVA_TEST_FOOTER = (sentinel) => `
    StringBuilder sb=new StringBuilder();
    sb.append("{\\"passed\\":").append(__p).append(",\\"failed\\":").append(__f).append(",\\"total\\":").append(__p+__f).append(",\\"results\\":[");
    for(int i=0;i<__r.size();i++){Map<String,Object>m=__r.get(i);sb.append("{\\"description\\":\\"").append(m.get("description")).append("\\",\\"passed\\":").append(m.get("passed"));if(m.containsKey("error"))sb.append(",\\"error\\":\\"").append(m.get("error")).append("\\"");sb.append("}");if(i<__r.size()-1)sb.append(",");}
    sb.append("]}");
    System.out.println(${JSON.stringify(sentinel)}+sb);
    System.exit(__f>0?1:0);
  }
}
`;

/**
 * Write the test runner file to disk, execute it via the container pool,
 * and return { passed, failed, total, results }.
 */
async function runTestCases(workspaceDir, language, testCases) {
  // Per-run unguessable marker: only the harness knows it, so student code
  // cannot print a fake result line and have it accepted as the grade.
  const sentinel = `__RESULT_${crypto.randomBytes(16).toString('hex')}__`;

  if (language === 'sql') {
    throw new Error(
      'Automated test cases are not supported for SQL exercises.',
    );
  }

  // The harness reads a fixed entry file per language. Fail loudly if the
  // exercise was authored without it rather than surfacing a raw ENOENT.
  const entryFile = ENTRY_FILE[language] ?? ENTRY_FILE.javascript;
  if (!fs.existsSync(path.join(workspaceDir, entryFile))) {
    throw new Error(
      `This exercise is misconfigured: expected a file named "${entryFile}" but it is missing.`,
    );
  }

  // Everything below writes the generated harness — grade against a copy so
  // none of it lands in the student's workspace.
  const stagingDir = createStagingDir(workspaceDir);
  try {
    let header, footer, testFile;

    if (language === 'python') {
      const studentCode = fs.readFileSync(
        path.join(stagingDir, 'main.py'),
        'utf-8',
      );
      const escapedCode = studentCode
        .replace(/\\/g, '\\\\')
        .replace(/"""/g, '\\"\\"\\"');
      header =
        PY_PRELUDE +
        `studentCodeString = """${escapedCode}"""\n` +
        studentCode +
        `\n` +
        PY_TEST_HEADER;
      footer = PY_TEST_FOOTER(sentinel);
      testFile = path.join(stagingDir, '__tests__.py');
    } else if (language === 'java') {
      header = JAVA_TEST_HEADER;
      footer = JAVA_TEST_FOOTER(sentinel);
      testFile = path.join(stagingDir, '__Tests__.java');
    } else {
      // javascript (default)
      const studentCode = fs.readFileSync(
        path.join(stagingDir, 'index.js'),
        'utf-8',
      );
      const escapedCode = studentCode
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
      header =
        JS_PRELUDE +
        `const studentCodeString = \`${escapedCode}\`;\n` +
        studentCode +
        `\n` +
        JS_TEST_HEADER;
      footer = JS_TEST_FOOTER(sentinel);
      testFile = path.join(stagingDir, '__tests__.js');
    }

    const testCode = testCases.map((tc) => tc.test_code).join('\n');
    fs.writeFileSync(testFile, header + testCode + footer, 'utf-8');

    return await executeAndParse(stagingDir, language, sentinel);
  } finally {
    removeStagingDir(stagingDir);
  }
}

// ── Shared execution + trusted-result parsing ────────────────────────────────

/**
 * Run the written harness and return only a result carrying this run's
 * sentinel. Anything else on stdout is student output, not a grade.
 */
async function executeAndParse(workspaceDir, language, sentinel) {
  const result = await runnerService.executeTests(workspaceDir, language);
  if (!result)
    throw new Error('Test execution is not supported for this language.');

  const { output } = result;

  const lines = output.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const idx = lines[i].indexOf(sentinel);
    if (idx === -1) continue;
    try {
      const parsed = JSON.parse(lines[i].slice(idx + sentinel.length));
      if (
        typeof parsed.passed === 'number' &&
        typeof parsed.total === 'number'
      ) {
        return parsed;
      }
    } catch {}
  }

  // No trusted result: the student's code failed to compile/parse, crashed
  // before the harness ran, or exited early. Surface the runner output so the
  // student sees the actual compiler/interpreter error.
  const err = new Error(
    output.trim() || 'Your code did not run. Check for syntax errors.',
  );
  err.isStudentCodeFailure = true;
  throw err;
}

// ── Data-driven cases ────────────────────────────────────────────────────────
//
// The author declares an entry function and a table of {args, expected}. We
// generate the comparison code, so there is no test API for an author to get
// wrong, and no author-written code running inside the grader.
//
// Java is intentionally excluded: generating typed call sites from JSON needs
// overload resolution, so Java exercises stay on code-mode tests.

const DATA_SUPPORTED_LANGUAGES = ['javascript', 'python'];

// Guards against the entry name being used as a code-injection point.
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const JS_DATA_RUNNER = (entry, cases, sentinel) => `
const __cases = ${JSON.stringify(cases)};
const __eq = (a, b) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => __eq(a[k], b[k]));
};
const __fmt = (v) => { try { const s = JSON.stringify(v); return s === undefined ? String(v) : s; } catch { return String(v); } };
;(async () => {
  const __r = []; let __p = 0, __f = 0;
  const __fn = (typeof ${entry} === 'function') ? ${entry} : null;
  for (let i = 0; i < __cases.length; i++) {
    const c = __cases[i];
    const base = { index: i, description: c.description, visible: !!c.visible, input: __fmt(c.args), expected: __fmt(c.expected) };
    if (!__fn) {
      __r.push({ ...base, actual: null, passed: false, error: 'No function named ${entry} was found. Check the name and that it is declared at the top level.' });
      __f++; continue;
    }
    try {
      let actual = __fn.apply(null, c.args);
      if (actual && typeof actual.then === 'function') actual = await actual;
      const ok = __eq(actual, c.expected);
      __r.push({ ...base, actual: __fmt(actual), passed: ok, error: ok ? undefined : 'Expected ' + __fmt(c.expected) + ', got ' + __fmt(actual) });
      ok ? __p++ : __f++;
    } catch (e) {
      __r.push({ ...base, actual: null, passed: false, error: (e && e.message) ? e.message : String(e) });
      __f++;
    }
  }
  console.log = __origLog; console.error = __origErr;
  console.log(${JSON.stringify(sentinel)} + JSON.stringify({ passed: __p, failed: __f, total: __r.length, results: __r }));
  process.exit(__f > 0 ? 1 : 0);
})();
`;

const PY_DATA_RUNNER = (entry, cases, sentinel) => `
import json, sys, inspect, asyncio
__cases = json.loads(${JSON.stringify(JSON.stringify(cases))})
def __fmt(v):
    try: return json.dumps(v)
    except Exception: return repr(v)
async def __run_all():
    _r = []; _p = 0; _f = 0
    fn = globals().get(${JSON.stringify(entry)})
    for i, c in enumerate(__cases):
        base = {"index": i, "description": c.get("description"), "visible": bool(c.get("visible")),
                "input": __fmt(c.get("args", [])), "expected": __fmt(c.get("expected"))}
        if not callable(fn):
            base.update({"actual": None, "passed": False,
                         "error": "No function named ${entry} was found. Check the name and that it is defined at the top level."})
            _r.append(base); _f += 1; continue
        try:
            actual = fn(*c.get("args", []))
            if inspect.isawaitable(actual): actual = await actual
            ok = actual == c.get("expected")
            base.update({"actual": __fmt(actual), "passed": ok})
            if not ok: base["error"] = "Expected " + __fmt(c.get("expected")) + ", got " + __fmt(actual)
            _r.append(base)
            _p += 1 if ok else 0
            _f += 0 if ok else 1
        except Exception as e:
            base.update({"actual": None, "passed": False, "error": str(e)})
            _r.append(base); _f += 1
    return _p, _f, _r
_p, _f, _r = asyncio.run(__run_all())
__b.print = __orig_print
print(${JSON.stringify(sentinel)} + json.dumps({"passed": _p, "failed": _f, "total": len(_r), "results": _r}))
sys.exit(1 if _f > 0 else 0)
`;

/**
 * Execute data-driven cases against the student's entry function.
 * @param {string} entryFunction  name the tests call, e.g. "updateSalary"
 * @param {Array}  cases          [{ description, args, expected, visible }]
 */
async function runDataCases(workspaceDir, language, entryFunction, cases) {
  if (!DATA_SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(
      `Data-driven test cases are not supported for ${language} exercises yet.`,
    );
  }
  if (!IDENTIFIER_RE.test(String(entryFunction || ''))) {
    throw new Error(
      `"${entryFunction}" is not a valid function name for this exercise.`,
    );
  }
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('This exercise has no test cases.');
  }

  const sentinel = `__RESULT_${crypto.randomBytes(16).toString('hex')}__`;
  const entryFile = ENTRY_FILE[language];
  const entryPath = path.join(workspaceDir, entryFile);
  if (!fs.existsSync(entryPath)) {
    throw new Error(
      `This exercise is misconfigured: expected a file named "${entryFile}" but it is missing.`,
    );
  }

  // The generated runner embeds every case, hidden ones included — write it to
  // a throwaway copy so it can never be read back out of the workspace.
  const stagingDir = createStagingDir(workspaceDir);
  try {
    const studentCode = fs.readFileSync(
      path.join(stagingDir, entryFile),
      'utf-8',
    );
    let contents, testFile;

    if (language === 'python') {
      contents =
        PY_PRELUDE +
        studentCode +
        '\n' +
        PY_DATA_RUNNER(entryFunction, cases, sentinel);
      testFile = path.join(stagingDir, '__tests__.py');
    } else {
      contents =
        JS_PRELUDE +
        studentCode +
        '\n' +
        JS_DATA_RUNNER(entryFunction, cases, sentinel);
      testFile = path.join(stagingDir, '__tests__.js');
    }

    fs.writeFileSync(testFile, contents, 'utf-8');
    return await executeAndParse(stagingDir, language, sentinel);
  } finally {
    removeStagingDir(stagingDir);
  }
}

/**
 * Single entry point for grading. `spec` is either
 *   { kind: 'data', entry_function, cases }
 * or { kind: 'code', cases }  (legacy authored test code).
 * Pass `visibleOnly` to run just the sample cases (the Run button).
 */
async function runTests(
  workspaceDir,
  language,
  spec,
  { visibleOnly = false } = {},
) {
  const kind = spec?.kind === 'data' ? 'data' : 'code';
  let cases = Array.isArray(spec?.cases) ? spec.cases : [];

  if (visibleOnly) {
    const visible = cases.filter((c) => c.visible);
    // Code-mode cases have no notion of visibility; fall back to all of them.
    cases = kind === 'data' ? visible : cases;
    if (cases.length === 0) {
      return { passed: 0, failed: 0, total: 0, results: [] };
    }
  }

  return kind === 'data'
    ? runDataCases(workspaceDir, language, spec.entry_function, cases)
    : runTestCases(workspaceDir, language, cases);
}

/**
 * Build a grading spec from a task (or a legacy exercise row). Exercises
 * authored before data-mode have no `test_kind`, so they default to 'code'.
 */
function testSpecFrom(source) {
  return {
    kind: source?.test_kind === 'data' ? 'data' : 'code',
    entry_function: source?.entry_function,
    cases: Array.isArray(source?.test_cases) ? source.test_cases : [],
  };
}

module.exports = {
  runTests,
  runTestCases,
  runDataCases,
  testSpecFrom,
  ENTRY_FILE,
  TEST_RUNNER_CMD,
  DATA_SUPPORTED_LANGUAGES,
  HARNESS_FILES,
};
