import { Button } from '@/components/ui/button';
import type { ExerciseModalProps, ExerciseTask, TestCase } from '@/utils/types';
import {
  Save, X, Plus, Trash2, ChevronDown, ChevronRight, Sparkles, Loader2, Wand2,
  FlaskConical, FileCode2, CheckCircle2, XCircle, ShieldCheck, Copy,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { aiCurriculumApi } from '@/features/aiCurriculum/aiCurriculumApi';
import toast from 'react-hot-toast';
import apiClient from '@/services/api';

// ─── Environment definitions ──────────────────────────────────────────────────
// Exercises are function-based: the starter file declares a named function and
// test cases call it. The grader runs a fixed entry file per environment
// (ENTRY_FILE in backend/services/exerciseTestRunner.js) — keep these in sync.

interface EnvDef {
  label: string;
  entryFile: string;
  extensions: string[];
  autoGraded: boolean;
  /** Supports the args/expected table. Java stays on code-mode: generating
   *  typed call sites from JSON needs overload resolution. */
  supportsData: boolean;
  starter: { name: string; content: string }[];
  solution: { name: string; content: string }[];
  testExample: string;
  assertHint: string;
}

const ENVIRONMENTS: Record<string, EnvDef> = {
  javascript: {
    label: 'JavaScript',
    entryFile: 'index.js',
    extensions: ['.js'],
    autoGraded: true,
    supportsData: true,
    starter: [{
      name: 'index.js',
      content: [
        '// Implement the function below.',
        '// The tests call it by name, so keep the name unchanged.',
        '',
        'function solution(value) {',
        '  // Write your code here',
        '}',
        '',
      ].join('\n'),
    }],
    solution: [{
      name: 'index.js',
      content: [
        '// Reference answer — students never see this.',
        '',
        'function solution(value) {',
        '  return value + 5000;',
        '}',
        '',
      ].join('\n'),
    }],
    testExample: "test('adds 5000 to the salary', () => {\n  expect(solution(30000)).toBe(35000);\n});",
    assertHint: 'expect(value).toBe(expected)',
  },
  python: {
    label: 'Python',
    entryFile: 'main.py',
    extensions: ['.py'],
    autoGraded: true,
    supportsData: true,
    starter: [{
      name: 'main.py',
      content: [
        '# Implement the function below.',
        '# The tests call it by name, so keep the name unchanged.',
        '',
        'def solution(value):',
        '    # Write your code here',
        '    pass',
        '',
      ].join('\n'),
    }],
    solution: [{
      name: 'main.py',
      content: [
        '# Reference answer — students never see this.',
        '',
        'def solution(value):',
        '    return value + 5000',
        '',
      ].join('\n'),
    }],
    testExample: "test('adds 5000 to the salary', lambda: expect(solution(30000)).to_be(35000))",
    assertHint: 'expect(value).to_be(expected)',
  },
  java: {
    label: 'Java',
    entryFile: 'Main.java',
    extensions: ['.java'],
    autoGraded: true,
    supportsData: false,
    starter: [{
      name: 'Main.java',
      content: [
        'public class Main {',
        '    // The tests call this method by name — keep the signature unchanged.',
        '    public static int solution(int value) {',
        '        // Write your code here',
        '        return 0;',
        '    }',
        '',
        '    public static void main(String[] args) {',
        '    }',
        '}',
        '',
      ].join('\n'),
    }],
    solution: [{
      name: 'Main.java',
      content: [
        '// Reference answer — students never see this.',
        'public class Main {',
        '    public static int solution(int value) {',
        '        return value + 5000;',
        '    }',
        '',
        '    public static void main(String[] args) {',
        '    }',
        '}',
        '',
      ].join('\n'),
    }],
    testExample: '__test("adds 5000 to the salary", () -> {\n  __expect(Main.solution(30000)).toBe(35000);\n});',
    assertHint: '__expect(value).toBe(expected)',
  },
  dom: {
    label: 'HTML/CSS/JS (DOM)',
    entryFile: 'index.html',
    extensions: ['.html', '.css', '.js'],
    autoGraded: false,
    supportsData: false,
    starter: [
      { name: 'index.html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello DOM</h1>\n  <script src="script.js"></script>\n</body>\n</html>' },
      { name: 'style.css', content: 'body {\n  font-family: sans-serif;\n}\n' },
      { name: 'script.js', content: '// Write your DOM logic here\n' },
    ],
    solution: [],
    testExample: '',
    assertHint: '',
  },
};

const ENV_KEYS = Object.keys(ENVIRONMENTS);

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function makeTask(language: string, index: number): ExerciseTask {
  const env = ENVIRONMENTS[language] ?? ENVIRONMENTS.dom;
  return {
    id: crypto.randomUUID(),
    title: `Task ${index}`,
    instructions: '',
    initial_files: clone(env.starter),
    reference_solution: clone(env.solution),
    test_cases: [],
    // New exercises default to the args/expected table wherever it's supported.
    test_kind: env.supportsData ? 'data' : 'code',
    entry_function: 'solution',
  };
}

const makeDataCase = (): TestCase => ({
  id: crypto.randomUUID(),
  description: '',
  is_hidden: false,
  visible: true,
  args: [],
  expected: null,
  _argsText: '[]',
  _expectedText: 'null',
});

const makeCodeCase = (): TestCase => ({
  id: crypto.randomUUID(),
  description: '',
  is_hidden: false,
  test_code: '',
});

/** Cases arrive from the API with parsed values; the editor needs text to type into. */
const withEditText = (tc: TestCase): TestCase => ({
  ...tc,
  _argsText: tc._argsText ?? JSON.stringify(tc.args ?? []),
  _expectedText: tc._expectedText ?? JSON.stringify(tc.expected ?? null),
});

const isValidJson = (text: string) => {
  try { JSON.parse(text); return true; } catch { return false; }
};

interface VerifyResult {
  valid: boolean;
  passed: number;
  failed: number;
  total: number;
  results: { description: string; passed: boolean; error?: string }[];
}

// ─── Small building blocks ────────────────────────────────────────────────────

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className='space-y-3'>
    <div>
      <h4 className='text-sm font-semibold text-slate-800'>{title}</h4>
      {hint && <p className='text-xs text-slate-500 mt-0.5'>{hint}</p>}
    </div>
    {children}
  </section>
);

const FileList = ({
  files, onChange, rows = 6,
}: {
  files: { name: string; content: string }[];
  onChange: (files: { name: string; content: string }[]) => void;
  rows?: number;
}) => (
  <div className='space-y-2'>
    {files.map((file, idx) => (
      <div key={idx} className='rounded-lg border border-slate-200 overflow-hidden bg-white'>
        <div className='flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200'>
          <FileCode2 className='w-3.5 h-3.5 text-slate-400 shrink-0' />
          <input
            type='text'
            value={file.name}
            onChange={e => onChange(files.map((f, i) => i === idx ? { ...f, name: e.target.value } : f))}
            placeholder='filename.js'
            className='flex-1 text-xs font-mono bg-transparent outline-none text-slate-700'
          />
          {files.length > 1 && (
            <button
              type='button'
              onClick={() => onChange(files.filter((_, i) => i !== idx))}
              className='text-slate-400 hover:text-red-500'
              title='Remove file'
            >
              <Trash2 className='w-3.5 h-3.5' />
            </button>
          )}
        </div>
        <textarea
          value={file.content}
          onChange={e => onChange(files.map((f, i) => i === idx ? { ...f, content: e.target.value } : f))}
          rows={rows}
          spellCheck={false}
          className='w-full px-3 py-2 font-mono text-xs text-slate-700 bg-white outline-none resize-y leading-relaxed'
        />
      </div>
    ))}
    <Button
      onClick={() => onChange([...files, { name: '', content: '' }])}
      size='sm'
      variant='outline'
      className='text-xs h-7'
    >
      <Plus className='w-3 h-3 mr-1' /> Add file
    </Button>
  </div>
);

// ─── Task editor ──────────────────────────────────────────────────────────────

interface TaskEditorProps {
  task: ExerciseTask;
  index: number;
  canRemove: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (updated: ExerciseTask) => void;
  onRemove: () => void;
  language: string;
}

const TaskEditor: React.FC<TaskEditorProps> = ({
  task, index, canRemove, expanded, onToggle, onChange, onRemove, language,
}) => {
  const env = ENVIRONMENTS[language] ?? ENVIRONMENTS.dom;
  const tests = task.test_cases ?? [];
  // Java has no data-mode runner, so those exercises stay on authored code.
  const isData = env.supportsData && task.test_kind !== 'code';

  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [showSolution, setShowSolution] = useState(false);

  // Any edit invalidates a previous verification result.
  const update = (patch: Partial<ExerciseTask>) => {
    setVerifyResult(null);
    onChange({ ...task, ...patch });
  };

  const updateTestCase = (id: string, field: keyof TestCase, value: unknown) =>
    update({ test_cases: tests.map(tc => tc.id === id ? { ...tc, [field]: value } : tc) });

  const addTestCase = () =>
    update({ test_cases: [...tests, isData ? makeDataCase() : makeCodeCase()] });

  const switchMode = (kind: 'data' | 'code') => {
    // Cases from the other mode can't be translated, so start clean rather than
    // silently keeping fields the runner will ignore.
    if (tests.length > 0 && !window.confirm(
      `Switching test style will clear the ${tests.length} existing test case${tests.length === 1 ? '' : 's'} for this task. Continue?`,
    )) return;
    update({ test_kind: kind, test_cases: [] });
  };

  const generateTests = async () => {
    if (!task.instructions?.trim()) {
      toast.error('Add task instructions first so the AI knows what to test.');
      return;
    }
    setGenerating(true);
    try {
      const res = await aiCurriculumApi.generateTaskTests({
        instructions: task.instructions,
        language,
      });
      const newTests = (res.data.data || []).map((tc: any) => ({ ...tc, id: crypto.randomUUID() }));
      update({ test_cases: [...tests, ...newTests] });
      toast.success(`Generated ${newTests.length} test case${newTests.length === 1 ? '' : 's'}`);
    } catch {
      toast.error('Failed to generate tests');
    } finally {
      setGenerating(false);
    }
  };

  // Runs the authored tests against the reference solution using the same
  // harness that grades students — a test suite that fails here would fail
  // every student too.
  const verifyTests = async () => {
    if (tests.length === 0) {
      toast.error('Add at least one test case to verify.');
      return;
    }
    const solution = (task.reference_solution ?? []).filter(f => f.name.trim());
    if (solution.length === 0) {
      toast.error('Add a reference solution so the tests have something correct to run against.');
      setShowSolution(true);
      return;
    }
    if (isData) {
      if (!task.entry_function?.trim()) {
        toast.error('Set the function name the tests should call.');
        return;
      }
      const bad = tests.findIndex(
        tc => !isValidJson(tc._argsText ?? '[]') || !isValidJson(tc._expectedText ?? 'null'),
      );
      if (bad !== -1) {
        toast.error(`Test #${bad + 1} has invalid JSON in its arguments or expected value.`);
        return;
      }
    }

    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await apiClient.post('/admin/exercises/validate-tests', {
        language,
        files: solution,
        test_kind: isData ? 'data' : 'code',
        entry_function: task.entry_function,
        // Data cases carry editor scratch text; send parsed values only.
        test_cases: isData
          ? tests.map(tc => ({
              description: tc.description,
              args: JSON.parse(tc._argsText ?? '[]'),
              expected: JSON.parse(tc._expectedText ?? 'null'),
              visible: tc.visible !== false,
            }))
          : tests,
      });
      const data: VerifyResult = res.data?.data;
      setVerifyResult(data);
      if (data?.valid) toast.success('All tests pass against the reference solution');
      else toast.error('These tests do not pass the reference solution');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not verify tests');
    } finally {
      setVerifying(false);
    }
  };

  const summary = [
    `${task.initial_files.length} file${task.initial_files.length === 1 ? '' : 's'}`,
    env.autoGraded ? `${tests.length} test${tests.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className='rounded-lg border border-slate-200 bg-white overflow-hidden'>
      {/* Header */}
      <div className='flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200'>
        <button type='button' onClick={onToggle} className='text-slate-400 hover:text-slate-700 shrink-0'>
          {expanded ? <ChevronDown className='w-4 h-4' /> : <ChevronRight className='w-4 h-4' />}
        </button>
        <span className='w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0'>
          {index + 1}
        </span>
        <input
          type='text'
          value={task.title}
          onChange={e => update({ title: e.target.value })}
          placeholder='Task title'
          className='flex-1 min-w-0 text-sm font-medium bg-transparent outline-none text-slate-800'
        />
        <span className='text-xs text-slate-400 shrink-0 hidden sm:block'>{summary}</span>
        {verifyResult && (
          <span
            className={`text-xs font-medium shrink-0 flex items-center gap-1 ${verifyResult.valid ? 'text-emerald-600' : 'text-red-600'}`}
            title={verifyResult.valid ? 'Tests verified' : 'Tests failing'}
          >
            {verifyResult.valid ? <CheckCircle2 className='w-3.5 h-3.5' /> : <XCircle className='w-3.5 h-3.5' />}
            {verifyResult.passed}/{verifyResult.total}
          </span>
        )}
        {canRemove && (
          <button type='button' onClick={onRemove} className='text-slate-400 hover:text-red-500 shrink-0' title='Remove task'>
            <Trash2 className='w-4 h-4' />
          </button>
        )}
      </div>

      {expanded && (
        <div className='p-4 space-y-5'>
          {/* Instructions */}
          <div>
            <label className='mb-1.5 block text-xs font-medium text-slate-600'>
              What should the student do?
              <span className='ml-1 font-normal text-slate-400'>markdown supported</span>
            </label>
            <textarea
              value={task.instructions ?? ''}
              onChange={e => update({ instructions: e.target.value })}
              placeholder={`Describe the function they must write, its inputs and its return value.`}
              rows={3}
              className='w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200'
            />
          </div>

          {/* Starter files */}
          <div>
            <label className='mb-1.5 block text-xs font-medium text-slate-600'>
              Starter code
              <span className='ml-1 font-normal text-slate-400'>
                what the student opens — must include {env.entryFile}
              </span>
            </label>
            <FileList files={task.initial_files} onChange={files => update({ initial_files: files })} />
          </div>

          {env.autoGraded && (
            <>
              {/* Reference solution */}
              <div>
                <button
                  type='button'
                  onClick={() => setShowSolution(v => !v)}
                  className='flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 transition-colors flex-wrap text-left'
                >
                  {showSolution ? <ChevronDown className='w-3.5 h-3.5 text-indigo-600 shrink-0' /> : <ChevronRight className='w-3.5 h-3.5 shrink-0' />}
                  <span>Reference solution</span>
                  <span className='font-normal text-slate-400 text-[11px]'>(used to verify tests — never shown to students)</span>
                </button>
                {showSolution && (
                  <div className='mt-2 space-y-2'>
                    <Button
                      onClick={() => update({ reference_solution: clone(task.initial_files) })}
                      size='sm'
                      variant='outline'
                      className='text-xs h-7'
                    >
                      <Copy className='w-3 h-3 mr-1' /> Start from starter code
                    </Button>
                    <FileList
                      files={task.reference_solution ?? []}
                      onChange={files => update({ reference_solution: files })}
                      rows={7}
                    />
                  </div>
                )}
              </div>

              {/* Entry function — the name every data case calls */}
              {isData && (
                <div>
                  <label className='mb-1.5 block text-xs font-medium text-slate-600'>
                    Function to test
                    <span className='ml-1 font-normal text-slate-400'>
                      the name students must use in {env.entryFile}
                    </span>
                  </label>
                  <input
                    type='text'
                    value={task.entry_function ?? ''}
                    onChange={e => update({ entry_function: e.target.value })}
                    placeholder='updateSalary'
                    spellCheck={false}
                    className='w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200'
                  />
                </div>
              )}

              {/* Test cases */}
              <div>
                <div className='flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2'>
                  <label className='text-xs font-medium text-slate-600'>
                    Test cases
                    <span className='ml-1 font-normal text-slate-400'>
                      {isData ? 'inputs and the result they must produce' : 'each one is graded'}
                    </span>
                  </label>
                  <div className='flex items-center gap-1.5 flex-wrap'>
                    <Button
                      type='button'
                      onClick={generateTests}
                      disabled={generating}
                      size='sm'
                      variant='outline'
                      className='text-xs h-7.5 px-2.5 border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors shrink-0'
                    >
                      {generating ? <Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' /> : <Sparkles className='w-3.5 h-3.5 mr-1.5' />}
                      AI generate
                    </Button>
                    <Button
                      type='button'
                      onClick={addTestCase}
                      size='sm'
                      variant='outline'
                      className='text-xs h-7.5 px-2.5 shrink-0'
                    >
                      <Plus className='w-3.5 h-3.5 mr-1.5' /> Add test
                    </Button>
                    <Button
                      type='button'
                      onClick={verifyTests}
                      disabled={verifying}
                      size='sm'
                      variant='outline'
                      className='text-xs h-7.5 px-2.5 border-emerald-300 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-colors shrink-0'
                    >
                      {verifying ? <Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' /> : <ShieldCheck className='w-3.5 h-3.5 mr-1.5' />}
                      Verify
                    </Button>
                  </div>
                </div>

                {tests.length === 0 ? (
                  <p className='rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800'>
                    No test cases yet. A {env.label} exercise cannot be graded without at least one.
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {tests.map((tc, tcIdx) => {
                      const outcome = verifyResult?.results?.[tcIdx];
                      return (
                        <div
                          key={tc.id}
                          className={`rounded-lg border overflow-hidden ${
                            outcome ? (outcome.passed ? 'border-emerald-300' : 'border-red-300') : 'border-slate-200'
                          }`}
                        >
                          <div className='flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200'>
                            <span className='text-xs text-slate-400 font-mono shrink-0'>#{tcIdx + 1}</span>
                            <input
                              type='text'
                              value={tc.description}
                              onChange={e => updateTestCase(tc.id, 'description', e.target.value)}
                              placeholder='What this test checks (shown to the student)'
                              className='flex-1 min-w-0 text-xs bg-transparent outline-none text-slate-700'
                            />
                            {isData ? (
                              <label className='flex items-center gap-1 text-xs text-slate-500 shrink-0 cursor-pointer' title='Sample cases run on “Run tests”; the rest only run on Submit'>
                                <input
                                  type='checkbox'
                                  checked={tc.visible !== false}
                                  onChange={e => updateTestCase(tc.id, 'visible', e.target.checked)}
                                  className='rounded'
                                />
                                Sample
                              </label>
                            ) : (
                              <label className='flex items-center gap-1 text-xs text-slate-500 shrink-0 cursor-pointer' title='Hide this test&#39;s name from students'>
                                <input
                                  type='checkbox'
                                  checked={tc.is_hidden}
                                  onChange={e => updateTestCase(tc.id, 'is_hidden', e.target.checked)}
                                  className='rounded'
                                />
                                Hidden
                              </label>
                            )}
                            <button
                              type='button'
                              onClick={() => update({ test_cases: tests.filter(t => t.id !== tc.id) })}
                              className='text-slate-400 hover:text-red-500 shrink-0'
                            >
                              <Trash2 className='w-3.5 h-3.5' />
                            </button>
                          </div>

                          {isData ? (
                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-200'>
                              <label className='bg-white px-3 py-2 flex flex-col gap-1'>
                                <span className='text-[10px] uppercase tracking-wide text-slate-400 font-medium'>
                                  Arguments · JSON array
                                </span>
                                <input
                                  type='text'
                                  value={tc._argsText ?? ''}
                                  onChange={e => updateTestCase(tc.id, '_argsText', e.target.value)}
                                  placeholder='[30000]'
                                  spellCheck={false}
                                  className={`font-mono text-xs outline-none bg-transparent ${
                                    isValidJson(tc._argsText ?? '') ? 'text-slate-700' : 'text-red-600'
                                  }`}
                                />
                              </label>
                              <label className='bg-white px-3 py-2 flex flex-col gap-1'>
                                <span className='text-[10px] uppercase tracking-wide text-slate-400 font-medium'>
                                  Expected result · JSON
                                </span>
                                <input
                                  type='text'
                                  value={tc._expectedText ?? ''}
                                  onChange={e => updateTestCase(tc.id, '_expectedText', e.target.value)}
                                  placeholder='35000'
                                  spellCheck={false}
                                  className={`font-mono text-xs outline-none bg-transparent ${
                                    isValidJson(tc._expectedText ?? '') ? 'text-slate-700' : 'text-red-600'
                                  }`}
                                />
                              </label>
                            </div>
                          ) : (
                            <textarea
                              value={tc.test_code ?? ''}
                              onChange={e => updateTestCase(tc.id, 'test_code', e.target.value)}
                              placeholder={env.testExample}
                              rows={4}
                              spellCheck={false}
                              className='w-full px-3 py-2 font-mono text-xs text-slate-700 bg-white outline-none resize-y leading-relaxed'
                            />
                          )}
                          {outcome && !outcome.passed && (
                            <p className='px-3 py-1.5 bg-red-50 border-t border-red-200 text-xs font-mono text-red-700 break-words'>
                              {outcome.error}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Verification banner */}
                {verifyResult && (
                  <div
                    className={`mt-2 rounded-lg px-3 py-2 text-xs border ${
                      verifyResult.valid
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    {verifyResult.valid ? (
                      <span className='flex items-center gap-1.5'>
                        <CheckCircle2 className='w-3.5 h-3.5' />
                        All {verifyResult.total} tests pass against the reference solution — this task is ready.
                      </span>
                    ) : (
                      <span className='flex items-center gap-1.5'>
                        <XCircle className='w-3.5 h-3.5' />
                        {verifyResult.passed}/{verifyResult.total} passed. A correct answer must pass every test, or students will be marked wrong unfairly.
                      </span>
                    )}
                  </div>
                )}

                <div className='mt-2.5 flex items-start justify-between gap-2.5 flex-wrap'>
                  <p className='text-[11px] sm:text-xs text-slate-500 flex-1 min-w-0 leading-relaxed'>
                    {isData ? (
                      <>
                        Each case calls{' '}
                        <code className='bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-slate-800'>
                          {task.entry_function || 'solution'}(…arguments)
                        </code>{' '}
                        and compares the result. Values are JSON, so{' '}
                        <code className='bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-slate-800'>"text"</code> needs quotes.
                        Sample cases run on “Run tests”; the rest are held back for Submit.
                      </>
                    ) : (
                      <>
                        Use <code className='bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-slate-800'>test(name, fn)</code> and{' '}
                        <code className='bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-slate-800'>{env.assertHint}</code>. Tests run
                        server-side against <code className='bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-slate-800'>{env.entryFile}</code>.
                      </>
                    )}
                  </p>
                  {env.supportsData && (
                    <button
                      type='button'
                      onClick={() => switchMode(isData ? 'code' : 'data')}
                      className='text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2 shrink-0'
                    >
                      {isData ? 'Write test code instead' : 'Use the inputs table instead'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main modal ───────────────────────────────────────────────────────────────

const ExerciseModal: React.FC<ExerciseModalProps> = ({
  isOpen, onClose, onSave, editData, subtopicTitle, loading = false,
}) => {
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [language, setLanguage] = useState('javascript');
  const [tasks, setTasks] = useState<ExerciseTask[]>([]);
  const [rubric, setRubric] = useState('');
  const [generatingRubric, setGeneratingRubric] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setTitle(editData?.title ?? '');
    setInstructions(editData?.instructions ?? '');
    setMaxScore(editData?.max_score ?? 100);
    const lang = editData?.language ?? 'javascript';
    setLanguage(lang);

    let initialTasks: ExerciseTask[];
    if (editData?.tasks && editData.tasks.length > 0) {
      // Data cases come back with parsed values; the editor edits them as text.
      initialTasks = editData.tasks.map(t =>
        t.test_kind === 'data'
          ? { ...t, test_cases: (t.test_cases ?? []).map(withEditText) }
          : t,
      );
    } else if (editData?.initial_files?.length) {
      // Legacy exercise with no tasks — fold it into a single task.
      initialTasks = [{
        id: crypto.randomUUID(),
        title: 'Task 1',
        instructions: '',
        initial_files: editData.initial_files,
        test_cases: editData.test_cases ?? [],
      }];
    } else {
      initialTasks = [makeTask(lang, 1)];
    }
    setTasks(initialTasks);
    setExpandedTask(initialTasks[0]?.id ?? null);

    setRubric(
      editData?.rubric
        ? (typeof editData.rubric === 'string' ? editData.rubric : JSON.stringify(editData.rubric, null, 2))
        : '',
    );
  }, [isOpen, editData]);

  const env = ENVIRONMENTS[language] ?? ENVIRONMENTS.dom;

  const handleLanguageChange = (lang: string) => {
    const prevEnv = ENVIRONMENTS[language] ?? ENVIRONMENTS.dom;
    const nextEnv = ENVIRONMENTS[lang] ?? ENVIRONMENTS.dom;
    setLanguage(lang);
    // Swap templates for every task whose files are still untouched defaults,
    // so switching environment never leaves stale files behind.
    setTasks(prev => prev.map(task => {
      const isDefault =
        task.initial_files.length === prevEnv.starter.length &&
        task.initial_files.every((f, i) => f.name === prevEnv.starter[i].name);
      return isDefault
        ? { ...task, initial_files: clone(nextEnv.starter), reference_solution: clone(nextEnv.solution) }
        : task;
    }));
  };

  const addTask = () => {
    const t = makeTask(language, tasks.length + 1);
    setTasks(prev => [...prev, t]);
    setExpandedTask(t.id);
  };

  const handleGenerateRubric = async () => {
    if (!title.trim() || !instructions.trim()) {
      toast.error('Title and instructions are required to generate a rubric.');
      return;
    }
    setGeneratingRubric(true);
    try {
      const res = await apiClient.post('/evaluations/generate-rubric', {
        title,
        instructions,
        evaluatorType: 'VISUAL',
      });
      if (res.data.success && res.data.rubric) {
        setRubric(res.data.rubric);
        toast.success('Rubric generated');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to generate rubric');
    } finally {
      setGeneratingRubric(false);
    }
  };

  const handleSave = () => {
    if (!title.trim()) return toast.error('Exercise title is required');
    if (maxScore <= 0) return toast.error('Max score must be greater than 0');
    if (tasks.length === 0) return toast.error('At least one task is required');

    for (const task of tasks) {
      const label = task.title.trim() || 'Untitled task';
      if (!task.title.trim()) return toast.error('Every task needs a title');
      if (task.initial_files.some(f => !f.name.trim()))
        return toast.error(`${label}: every file needs a name`);
      if (!task.initial_files.some(f => f.name.trim() === env.entryFile))
        return toast.error(`${label}: needs a file named "${env.entryFile}" — the grader runs this file`);

      const badFile = task.initial_files.find(
        f => !env.extensions.some(ext => f.name.trim().toLowerCase().endsWith(ext)),
      );
      if (badFile)
        return toast.error(`${label}: "${badFile.name}" is not valid for ${env.label} (allowed: ${env.extensions.join(', ')})`);

      if (env.autoGraded) {
        const usesData = env.supportsData && task.test_kind !== 'code';
        const cases = task.test_cases ?? [];

        if (usesData) {
          if (!task.entry_function?.trim())
            return toast.error(`${label}: set the function name the tests should call`);
          if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(task.entry_function.trim()))
            return toast.error(`${label}: "${task.entry_function}" is not a valid function name`);
          for (let i = 0; i < cases.length; i++) {
            const tc = cases[i];
            if (!tc.description.trim())
              return toast.error(`${label}: test #${i + 1} needs a description`);
            if (!isValidJson(tc._argsText ?? '[]'))
              return toast.error(`${label}: test #${i + 1} has invalid JSON in Arguments`);
            if (!Array.isArray(JSON.parse(tc._argsText ?? '[]')))
              return toast.error(`${label}: test #${i + 1} Arguments must be a JSON array, e.g. [30000]`);
            if (!isValidJson(tc._expectedText ?? 'null'))
              return toast.error(`${label}: test #${i + 1} has invalid JSON in Expected result`);
          }
          if (!cases.some(tc => tc.visible !== false))
            return toast.error(`${label}: mark at least one case as a Sample so students get feedback from “Run tests”`);
        } else {
          const bad = cases.find(tc => !tc.description.trim() || !tc.test_code?.trim());
          if (bad)
            return toast.error(`${label}: every test case needs both a description and test code`);
        }
      }
    }

    if (env.autoGraded) {
      const totalTests = tasks.reduce((n, t) => n + (t.test_cases ?? []).length, 0);
      if (totalTests === 0)
        return toast.error(`A ${env.label} exercise needs at least one test case, otherwise students cannot be graded.`);
    }

    if (!env.autoGraded && rubric.trim()) {
      try {
        JSON.parse(rubric);
      } catch {
        return toast.error('Rubric must be valid JSON');
      }
    }

    // Convert editor scratch text into the values the grader will receive, and
    // drop the scratch fields so they never reach the database.
    const serialiseCases = (task: ExerciseTask): TestCase[] => {
      if (!env.autoGraded) return [];
      const cases = task.test_cases ?? [];
      if (!(env.supportsData && task.test_kind !== 'code')) return cases;
      return cases.map((tc) => {
        const { _argsText, _expectedText, ...rest } = tc;
        delete rest.test_code; // data cases carry no authored code
        return {
          ...rest,
          args: JSON.parse(_argsText ?? '[]'),
          expected: JSON.parse(_expectedText ?? 'null'),
          visible: tc.visible !== false,
        };
      });
    };

    const outTasks = tasks.map(t => ({
      ...t,
      test_kind: env.supportsData && t.test_kind !== 'code' ? 'data' as const : 'code' as const,
      test_cases: serialiseCases(t),
    }));

    onSave({
      title: title.trim(),
      instructions: instructions.trim(),
      max_score: maxScore,
      language,
      initial_files: outTasks[0].initial_files,
      test_cases: outTasks[0].test_cases,
      tasks: outTasks,
      rubric: !env.autoGraded && rubric.trim() ? JSON.parse(rubric) : null,
    });
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs'>
      <div className='w-[96vw] sm:max-w-3xl rounded-2xl bg-white shadow-2xl my-auto flex flex-col max-h-[92vh] overflow-hidden'>

        {/* Header */}
        <div className='flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 shrink-0'>
          <div className='min-w-0 flex-1 pr-2'>
            <h3 className='text-base sm:text-lg font-bold text-slate-900 truncate'>
              {editData ? 'Edit exercise' : 'Create exercise'}
            </h3>
            <p className='text-xs text-slate-500 mt-0.5 truncate max-w-xs sm:max-w-md'>{subtopicTitle}</p>
          </div>
          <button onClick={onClose} className='p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0'>
            <X className='h-5 w-5' />
          </button>
        </div>

        {/* Body */}
        <div className='flex-1 overflow-y-auto p-4 sm:p-6 space-y-6'>

          <Section title='Basics'>
            <div className='space-y-3'>
              <input
                type='text'
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder='Exercise title — e.g. Employee Salary Update'
                className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
              />
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder='Overview shown above every task (markdown supported)'
                rows={3}
                className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
              />
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='mb-1 block text-xs font-medium text-slate-600'>Environment</label>
                  <select
                    value={language}
                    onChange={e => handleLanguageChange(e.target.value)}
                    className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
                  >
                    {ENV_KEYS.map(key => (
                      <option key={key} value={key}>{ENVIRONMENTS[key].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='mb-1 block text-xs font-medium text-slate-600'>Maximum score</label>
                  <input
                    type='number'
                    value={maxScore}
                    onChange={e => setMaxScore(parseInt(e.target.value) || 0)}
                    min='1'
                    className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
                  />
                </div>
              </div>
              <p className='flex items-start gap-1.5 text-xs text-slate-500'>
                <FlaskConical className='w-3.5 h-3.5 mt-px shrink-0 text-slate-400' />
                {env.autoGraded
                  ? <span>Graded automatically by running test cases against <code className='bg-slate-100 px-1 rounded'>{env.entryFile}</code>. Write the task as a function the tests can call.</span>
                  : <span>Graded by the AI evaluator using the rubric below — no test cases.</span>}
              </p>
            </div>
          </Section>

          <Section
            title='Tasks'
            hint={`${tasks.length} task${tasks.length === 1 ? '' : 's'} — each gets its own editor tab for the student`}
          >
            <div className='space-y-2'>
              {tasks.map((task, idx) => (
                <TaskEditor
                  key={task.id}
                  task={task}
                  index={idx}
                  canRemove={tasks.length > 1}
                  expanded={expandedTask === task.id}
                  onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  onChange={updated => setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))}
                  onRemove={() => setTasks(prev => prev.filter(t => t.id !== task.id))}
                  language={language}
                />
              ))}
            </div>
            <Button onClick={addTask} size='sm' variant='outline' className='text-xs h-7'>
              <Plus className='w-3 h-3 mr-1' /> Add task
            </Button>
          </Section>

          {!env.autoGraded && (
            <Section title='Evaluation rubric' hint='JSON array of criteria used by the AI evaluator'>
              <div className='flex justify-end mb-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleGenerateRubric}
                  disabled={generatingRubric}
                  className='h-7 text-xs bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
                >
                  {generatingRubric
                    ? <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                    : <Wand2 className='mr-1.5 h-3.5 w-3.5' />}
                  Auto-generate
                </Button>
              </div>
              <textarea
                value={rubric}
                onChange={e => setRubric(e.target.value)}
                placeholder={'[\n  { "name": "Code Correctness", "weight": 60, "description": "Meets task requirements" }\n]'}
                spellCheck={false}
                className='w-full min-h-[140px] rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
              />
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className='flex gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 shrink-0'>
          <Button onClick={onClose} className='flex-1 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={loading} className='flex-1 bg-indigo-600 text-white hover:bg-indigo-700'>
            {!loading && <Save className='mr-2 h-4 w-4' />}
            {editData ? 'Update' : 'Create'} exercise
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ExerciseModal;
