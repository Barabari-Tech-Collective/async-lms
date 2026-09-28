import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  FlaskConical,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Code2,
} from 'lucide-react';
import apiClient from '@/services/api';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import type { Exercise, ExerciseTask } from '@/utils/types';
import { getErrorMessage } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkspaceFile {
  name: string;
  content: string;
}

interface TaskWorkspace {
  files: WorkspaceFile[];
  activeFile: string;
  projectId: string;
  initialized: boolean;
}

interface TestResult {
  description: string;
  passed: boolean;
  error?: string;
}

interface TestRunResult {
  passed: number;
  failed: number;
  total: number;
  results: TestResult[];
}

interface ExerciseEditorProps {
  exercise: Exercise;
  submitting: boolean;
  onSubmit: (exerciseId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  java: 'java',
  sql: 'sql',
  json: 'json',
  html: 'html',
  css: 'css',
  md: 'markdown',
};

function monacoLang(filename: string): string {
  const ext = filename.split('.').pop() ?? '';
  return EXT_TO_LANG[ext] ?? 'plaintext';
}

// ─── Component ────────────────────────────────────────────────────────────────

const ExerciseEditor = ({ exercise, submitting, onSubmit }: ExerciseEditorProps) => {
  const user = useAppSelector(selectUser);

  const [activeTab, setActiveTab] = useState<'instructions' | 'code'>('instructions');

  const tasks: ExerciseTask[] = exercise.tasks && exercise.tasks.length > 0 ? exercise.tasks : [];
  const isMultiTask = tasks.length > 0;

  // ── Single-task (legacy) state ───────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>('');
  const [language, setLanguage] = useState('javascript');
  const [projectId, setProjectId] = useState('');

  // ── Multi-task state ─────────────────────────────────────────────────────────
  const [activeTaskId, setActiveTaskId] = useState<string>(tasks[0]?.id ?? '');
  const [taskWorkspaces, setTaskWorkspaces] = useState<Record<string, TaskWorkspace>>({});
  const [taskLoading, setTaskLoading] = useState<Record<string, boolean>>({});
  const [taskInitError, setTaskInitError] = useState<Record<string, string | null>>({});

  // ── Shared run/test state ────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);

  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestRunResult | null>(null);
  const [testPanelOpen, setTestPanelOpen] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // ── Init workspace for single-task (legacy) ──────────────────────────────────

  useEffect(() => {
    if (isMultiTask) return;

    let cancelled = false;
    const init = async () => {
      setLoading(true);
      setInitError(null);
      try {
        const res = await apiClient.post<{
          success: boolean;
          data: { language: string; files: WorkspaceFile[]; projectId: string };
        }>(`/students/exercise/${exercise.id}/workspace/init`);

        if (cancelled) return;
        const { language: lang, files: initialFiles, projectId: pid } = res.data.data;
        setLanguage(lang);
        setFiles(initialFiles);
        setProjectId(pid);
        setActiveFile(initialFiles[0]?.name ?? '');
      } catch (err) {
        if (!cancelled) setInitError(getErrorMessage(err, 'Could not set up your workspace'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [exercise.id, isMultiTask, retryToken]);

  // ── Init workspace for a specific task (lazy) ────────────────────────────────

  const initTaskWorkspace = useCallback(async (taskId: string) => {
    if (taskWorkspaces[taskId]?.initialized) return;

    setTaskLoading(prev => ({ ...prev, [taskId]: true }));
    setTaskInitError(prev => ({ ...prev, [taskId]: null }));
    try {
      const res = await apiClient.post<{
        success: boolean;
        data: { language: string; files: WorkspaceFile[]; projectId: string };
      }>(`/students/exercise/${exercise.id}/workspace/init`, { taskId });

      const { language: lang, files: initialFiles, projectId: pid } = res.data.data;
      setLanguage(lang);
      setTaskWorkspaces(prev => ({
        ...prev,
        [taskId]: {
          files: initialFiles,
          activeFile: initialFiles[0]?.name ?? '',
          projectId: pid,
          initialized: true,
        },
      }));
    } catch (err) {
      setTaskInitError(prev => ({ ...prev, [taskId]: getErrorMessage(err, 'Could not set up your workspace') }));
    } finally {
      setTaskLoading(prev => ({ ...prev, [taskId]: false }));
    }
  }, [exercise.id, taskWorkspaces]);

  // ── Bootstrap first task on mount (multi-task) ───────────────────────────────

  useEffect(() => {
    if (!isMultiTask) return;
    if (tasks[0]) {
      initTaskWorkspace(tasks[0].id).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiTask]);

  // ── Switch task tab ──────────────────────────────────────────────────────────

  const handleTaskSwitch = (taskId: string) => {
    if (taskId === activeTaskId) return;
    setActiveTaskId(taskId);
    setOutput(null);
    setTestResults(null);
    setOutputOpen(false);
    setTestPanelOpen(false);
    initTaskWorkspace(taskId);
  };

  // ── Derived workspace values ─────────────────────────────────────────────────

  const currentFiles = isMultiTask ? (taskWorkspaces[activeTaskId]?.files ?? []) : files;
  const currentActiveFile = isMultiTask ? (taskWorkspaces[activeTaskId]?.activeFile ?? '') : activeFile;
  const currentProjectId = isMultiTask ? (taskWorkspaces[activeTaskId]?.projectId ?? '') : projectId;
  const isCurrentTaskLoading = isMultiTask ? (taskLoading[activeTaskId] ?? !taskWorkspaces[activeTaskId]?.initialized) : loading;
  const currentInitError = isMultiTask ? (taskInitError[activeTaskId] ?? null) : initError;
  const isWorkspaceReady = isMultiTask
    ? !!taskWorkspaces[activeTaskId]?.initialized
    : (!loading && !initError && !!projectId);

  const retryInit = () => {
    if (isMultiTask) initTaskWorkspace(activeTaskId);
    else setRetryToken((t) => t + 1);
  };

  const setCurrentActiveFile = (name: string) => {
    if (isMultiTask) {
      setTaskWorkspaces(prev => ({
        ...prev,
        [activeTaskId]: { ...prev[activeTaskId], activeFile: name },
      }));
    } else {
      setActiveFile(name);
    }
  };

  const activeContent = currentFiles.find(f => f.name === currentActiveFile)?.content ?? '';

  // ── Auto-save on content change (debounced 800ms) ───────────────────────────

  const handleContentChange = useCallback(
    (content: string | undefined) => {
      if (content === undefined || !currentActiveFile || !user || !currentProjectId) return;

      if (isMultiTask) {
        setTaskWorkspaces(prev => ({
          ...prev,
          [activeTaskId]: {
            ...prev[activeTaskId],
            files: prev[activeTaskId].files.map(f =>
              f.name === currentActiveFile ? { ...f, content } : f,
            ),
          },
        }));
      } else {
        setFiles(prev => prev.map(f => f.name === currentActiveFile ? { ...f, content } : f));
      }

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        apiClient.post('/workspace/file', {
          userId: user.id,
          projectId: currentProjectId,
          filePath: currentActiveFile,
          content,
        }).catch(() => {
          // auto-save silently fails — user can retry manually
        });
      }, 800);
    },
    [isMultiTask, activeTaskId, currentActiveFile, user, currentProjectId],
  );

  // ── Run code ────────────────────────────────────────────────────────────────

  const handleRun = async () => {
    setRunning(true);
    setOutput(null);
    setOutputOpen(true);
    try {
      const body = isMultiTask ? { taskId: activeTaskId } : {};
      const res = await apiClient.post<{
        success: boolean;
        data: { output: string; exitCode: number };
      }>(`/students/exercise/${exercise.id}/run`, body);
      setOutput(res.data.data.output || '(no output)');
      setExitCode(res.data.data.exitCode);
    } catch (err) {
      setOutput(getErrorMessage(err, 'Failed to run code'));
      setExitCode(-1);
    } finally {
      setRunning(false);
    }
  };

  // ── Run tests ────────────────────────────────────────────────────────────────

  const handleRunTests = async () => {
    setTestRunning(true);
    setTestResults(null);
    setTestPanelOpen(true);
    try {
      const body = isMultiTask ? { taskId: activeTaskId } : {};
      const res = await apiClient.post<{
        success: boolean;
        data: TestRunResult;
      }>(`/students/exercise/${exercise.id}/run-tests`, body);
      setTestResults(res.data.data);
    } catch (err) {
      setTestResults({
        passed: 0,
        failed: 1,
        total: 1,
        results: [{ description: 'Test runner', passed: false, error: getErrorMessage(err, 'Failed to run tests') }],
      });
    } finally {
      setTestRunning(false);
    }
  };

  // ── Determine if current task/exercise has test cases ───────────────────────

  const hasTestCases = isMultiTask
    ? (tasks.find(t => t.id === activeTaskId)?.test_cases?.length ?? 0) > 0
    : (exercise.test_cases?.length ?? 0) > 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading && !isMultiTask) {
    return (
      <div className='flex items-center gap-2 text-slate-400 text-sm py-6'>
        <Loader2 className='w-4 h-4 animate-spin' />
        Setting up editor…
      </div>
    );
  }

  const currentInstructions = isMultiTask
    ? (tasks.find(t => t.id === activeTaskId)?.instructions ?? exercise.instructions)
    : exercise.instructions;

  return (
    <div className='rounded-xl border border-slate-200 overflow-hidden bg-[#1e1e1e]'>

      {/* ── Task tabs (multi-task only) ── */}
      {isMultiTask && (
        <div className='flex items-center border-b border-slate-600 bg-[#1a1a2e] overflow-x-auto'>
          {tasks.map((task, idx) => (
            <button
              key={task.id}
              onClick={() => handleTaskSwitch(task.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-r border-slate-600 ${
                activeTaskId === task.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#2d2d2d]'
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                activeTaskId === task.id ? 'bg-white/20 text-white' : 'bg-slate-600 text-slate-300'
              }`}>
                {idx + 1}
              </span>
              {task.title}
            </button>
          ))}
        </div>
      )}

      {/* ── Instructions / Code tab bar ── */}
      <div className='flex border-b border-slate-700 bg-[#252526]'>
        <button
          onClick={() => setActiveTab('instructions')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === 'instructions'
              ? 'text-white border-b-2 border-indigo-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className='w-3.5 h-3.5' />
          Instructions
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === 'code'
              ? 'text-white border-b-2 border-indigo-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Code2 className='w-3.5 h-3.5' />
          Code
        </button>
      </div>

      {/* ── Instructions panel ── */}
      {activeTab === 'instructions' && (
        <div className='p-5 bg-[#1e1e1e] min-h-80'>
          {currentInstructions
            ? <p className='text-sm text-slate-300 leading-relaxed whitespace-pre-wrap'>{currentInstructions}</p>
            : <p className='text-sm text-slate-500 italic'>No instructions provided.</p>
          }
        </div>
      )}

      {/* ── Code panel ── */}
      {activeTab === 'code' && (
        <>
          {currentInitError && (
            <div className='flex items-center justify-between gap-3 px-4 py-3 bg-red-950/40 border-b border-red-900 text-xs text-red-300'>
              <span>{currentInitError}</span>
              <Button
                size='sm'
                variant='outline'
                onClick={retryInit}
                className='border-red-700 bg-transparent text-red-200 hover:bg-red-900 hover:text-white shrink-0'
              >
                Retry
              </Button>
            </div>
          )}

          {/* File tabs */}
          <div className='flex items-center gap-0 border-b border-slate-700 bg-[#252526] overflow-x-auto'>
            {isCurrentTaskLoading ? (
              <div className='flex items-center gap-2 px-4 py-2 text-xs text-slate-400'>
                <Loader2 className='w-3 h-3 animate-spin' />
                Loading task…
              </div>
            ) : (
              currentFiles.map((f) => (
                <button
                  key={f.name}
                  onClick={() => setCurrentActiveFile(f.name)}
                  className={`px-4 py-2 text-xs font-mono whitespace-nowrap transition-colors border-r border-slate-700 ${
                    currentActiveFile === f.name
                      ? 'bg-[#1e1e1e] text-white border-t-2 border-t-indigo-500'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#2d2d2d]'
                  }`}
                >
                  {f.name}
                </button>
              ))
            )}
            <div className='ml-auto px-3 flex items-center'>
              <Badge variant='secondary' className='text-[10px] uppercase font-medium bg-slate-700 text-slate-300 border-0'>
                {language}
              </Badge>
            </div>
          </div>

          {/* Monaco editor */}
          {isCurrentTaskLoading ? (
            <div className='flex items-center justify-center h-80 bg-[#1e1e1e]'>
              <Loader2 className='w-6 h-6 animate-spin text-indigo-400' />
            </div>
          ) : (
            <Editor
              height='320px'
              language={monacoLang(currentActiveFile)}
              value={activeContent}
              onChange={handleContentChange}
              theme='vs-dark'
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                wordWrap: 'on',
                padding: { top: 12, bottom: 12 },
                fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                fontLigatures: true,
              }}
            />
          )}

          {/* Output panel */}
          {output !== null && (
            <div className='border-t border-slate-700'>
              <button
                onClick={() => setOutputOpen((o) => !o)}
                className='w-full flex items-center justify-between px-4 py-2 bg-[#252526] text-xs text-slate-300 hover:bg-[#2d2d2d] transition-colors'
              >
                <span className='font-semibold uppercase tracking-wider flex items-center gap-2'>
                  Output
                  {exitCode !== null && (
                    <span className={`font-mono ${exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      (exit {exitCode})
                    </span>
                  )}
                </span>
                {outputOpen ? <ChevronUp className='w-3 h-3' /> : <ChevronDown className='w-3 h-3' />}
              </button>
              {outputOpen && (
                <pre className='px-4 py-3 text-xs font-mono text-slate-200 bg-[#1e1e1e] whitespace-pre-wrap max-h-48 overflow-y-auto'>
                  {output}
                </pre>
              )}
            </div>
          )}

          {/* Test results panel */}
          {(testResults !== null || testRunning) && (
            <div className='border-t border-slate-700'>
              <button
                onClick={() => setTestPanelOpen((o) => !o)}
                className='w-full flex items-center justify-between px-4 py-2 bg-[#252526] text-xs text-slate-300 hover:bg-[#2d2d2d] transition-colors'
              >
                <span className='font-semibold uppercase tracking-wider flex items-center gap-2'>
                  Test Results
                  {testResults && (
                    <span className={testResults.failed === 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {testResults.passed}/{testResults.total} passed
                    </span>
                  )}
                  {testRunning && <Loader2 className='w-3 h-3 animate-spin text-indigo-400' />}
                </span>
                {testPanelOpen ? <ChevronUp className='w-3 h-3' /> : <ChevronDown className='w-3 h-3' />}
              </button>
              {testPanelOpen && testResults && (
                <div className='bg-[#1e1e1e] max-h-64 overflow-y-auto divide-y divide-slate-800'>
                  {testResults.results.map((r, i) => (
                    <div key={i} className='flex items-start gap-3 px-4 py-2.5'>
                      {r.passed
                        ? <CheckCircle2 className='w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5' />
                        : <XCircle className='w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5' />
                      }
                      <div className='min-w-0'>
                        <p className='text-xs text-slate-200'>{r.description}</p>
                        {r.error && (
                          <p className='text-xs font-mono text-red-400 mt-0.5 break-all'>{r.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action bar */}
          <div className='flex items-center gap-3 px-4 py-3 bg-[#252526] border-t border-slate-700'>
            <Button
              size='sm'
              variant='outline'
              onClick={handleRun}
              disabled={running || testRunning || isCurrentTaskLoading || !isWorkspaceReady}
              className='border-slate-600 bg-transparent text-slate-200 hover:bg-slate-700 hover:text-white'
            >
              {running
                ? <><Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />Running…</>
                : <><Play className='w-3.5 h-3.5 mr-1.5' />Run</>
              }
            </Button>

            {hasTestCases && (
              <Button
                size='sm'
                variant='outline'
                onClick={handleRunTests}
                disabled={running || testRunning || isCurrentTaskLoading || !isWorkspaceReady}
                className='border-slate-600 bg-transparent text-slate-200 hover:bg-slate-700 hover:text-white'
              >
                {testRunning
                  ? <><Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />Testing…</>
                  : <><FlaskConical className='w-3.5 h-3.5 mr-1.5' />Run Tests</>
                }
              </Button>
            )}

            <Button
              size='sm'
              onClick={() => onSubmit(exercise.id)}
              disabled={submitting}
              className='bg-indigo-600 hover:bg-indigo-700 text-white'
            >
              {submitting
                ? <><Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />Submitting…</>
                : <><CheckCircle2 className='w-3.5 h-3.5 mr-1.5' />Submit</>
              }
            </Button>

            <span className='ml-auto text-[10px] text-slate-500 font-mono'>
              Auto-save enabled
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default ExerciseEditor;
