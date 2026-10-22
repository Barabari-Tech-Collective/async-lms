import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Code2,
  LayoutList,
  Plus,
  Trash2,
  Copy,
  Sparkles,
  Loader2,
  AlertCircle,
  Terminal,
  FileCode,
  FileSpreadsheet,
  Cpu,
  ArrowRight,
  Check,
  Hash,
  Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface TestCasesVisualEditorProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate?: () => void;
  generating?: boolean;
  canGenerate?: boolean;
  evaluatorType?: string;
  rubricJson?: string;
  className?: string;
}

export type TestParadigm = 'function' | 'excel' | 'script' | 'spec';

const EXCEL_CHECK_TYPES = [
  { value: 'formula_behavior_check', label: 'Formula Check (fx)', badge: 'fx' },
  { value: 'value_check', label: 'Value Match', badge: '123' },
  { value: 'formula_range_check', label: 'Range Calculation', badge: 'A1:B5' },
  { value: 'format_check', label: 'Cell Formatting / Currency', badge: '₹ / $' },
  { value: 'chart_check', label: 'Chart Verification', badge: 'Chart' },
  { value: 'pivot_check', label: 'Pivot Table Check', badge: 'Pivot' },
  { value: 'data_check', label: 'Data Verification', badge: 'Data' },
];

export const TestCasesVisualEditor: React.FC<TestCasesVisualEditorProps> = ({
  value,
  onChange,
  onGenerate,
  generating = false,
  canGenerate = true,
  evaluatorType = '',
  className = '',
}) => {
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState<string>(value || '');
  const [parseError, setParseError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const lastSentJsonRef = useRef<string>('');

  // Evaluator type normalization
  const upperType = (evaluatorType || '').toUpperCase();
  const isExcelEvaluator = upperType === 'EXCEL';

  // Parse structured data safely
  const parsedData = useMemo(() => {
    if (!jsonText || !jsonText.trim()) return null;
    try {
      const data = JSON.parse(jsonText);
      return { data, isJson: true, isSpecCode: false, error: null };
    } catch (err: any) {
      if (
        jsonText.includes('test(') ||
        jsonText.includes('describe(') ||
        jsonText.includes('import ') ||
        jsonText.includes('require(')
      ) {
        return { data: jsonText, isJson: false, isSpecCode: true, error: null };
      }
      return {
        data: null,
        isJson: false,
        isSpecCode: false,
        error: err?.message || 'Invalid JSON syntax',
      };
    }
  }, [jsonText]);

  // Sync external changes safely without wiping state during active keystrokes
  useEffect(() => {
    if (value === lastSentJsonRef.current) return;
    setJsonText(value || '');
    if (!value || !value.trim()) {
      setParseError(null);
      return;
    }
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (err: any) {
      if (value.includes('test(') || value.includes('describe(')) {
        setParseError(null);
      } else {
        setParseError(err?.message || 'Invalid JSON');
      }
    }
  }, [value]);

  const handleUpdateJson = useCallback(
    (updatedObj: any) => {
      const formatted = JSON.stringify(updatedObj, null, 2);
      lastSentJsonRef.current = formatted;
      setJsonText(formatted);
      onChange(formatted);
      setParseError(null);
    },
    [onChange]
  );

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonText(formatted);
      onChange(formatted);
      setParseError(null);
    } catch (err: any) {
      setParseError(err?.message || 'Invalid JSON syntax');
    }
  };

  const handleRawChange = (newVal: string) => {
    setJsonText(newVal);
    onChange(newVal);
    try {
      JSON.parse(newVal);
      setParseError(null);
    } catch (err: any) {
      if (newVal.includes('test(') || newVal.includes('describe(')) {
        setParseError(null);
      } else {
        setParseError(err?.message || 'Invalid JSON syntax');
      }
    }
  };

  // ─── Determine active paradigm ───
  const rawData = parsedData?.data;

  // 1. Is Excel Assertions?
  const isDetectedExcel =
    isExcelEvaluator ||
    (Array.isArray(rawData) &&
      rawData.some(
        (i: any) =>
          i &&
          (i.criterion ||
            i.range ||
            i.anchor ||
            i.type?.includes('check') ||
            i.expectedFormula)
      )) ||
    (Array.isArray(rawData?.testCases) &&
      rawData.testCases.some(
        (i: any) =>
          i &&
          (i.criterion ||
            i.range ||
            i.anchor ||
            i.type?.includes('check') ||
            i.expectedFormula)
      ));

  // 2. Is Script Console Logs?
  const isDetectedScript =
    !isDetectedExcel &&
    (rawData?.evaluationMode === 'script' ||
      (Array.isArray(rawData?.expectedLogs) && !Array.isArray(rawData?.testCases)));

  // 3. Is Spec Code?
  const isDetectedSpec =
    Boolean(parsedData?.isSpecCode) || Boolean(rawData?.specFile);

  // Active Paradigm State (defaults based on detection, can be manually selected)
  const defaultParadigm: TestParadigm = isDetectedExcel
    ? 'excel'
    : isDetectedScript
    ? 'script'
    : isDetectedSpec
    ? 'spec'
    : 'function';

  const [activeParadigm, setActiveParadigm] = useState<TestParadigm>(defaultParadigm);

  useEffect(() => {
    setActiveParadigm(defaultParadigm);
  }, [defaultParadigm]);

  // ─── Excel Paradigm Handlers ───
  const excelItems: any[] = useMemo(() => {
    if (Array.isArray(rawData)) return rawData;
    if (Array.isArray(rawData?.testCases)) return rawData.testCases;
    return [];
  }, [rawData]);

  const handleAddExcelAssertion = () => {
    const newItem = {
      criterion: `Rule ${excelItems.length + 1}`,
      type: 'formula_behavior_check',
      range: 'C10',
      expectedFormula: '=SUM(C2:C9)',
      marks: 10,
    };
    if (Array.isArray(rawData)) {
      handleUpdateJson([...excelItems, newItem]);
    } else {
      handleUpdateJson({ ...(rawData || {}), testCases: [...excelItems, newItem] });
    }
  };

  const handleDuplicateExcelItem = (idx: number) => {
    const original = excelItems[idx];
    const cloned = {
      ...original,
      criterion: `${original.criterion || 'Rule'} (Copy)`,
    };
    const updated = [...excelItems.slice(0, idx + 1), cloned, ...excelItems.slice(idx + 1)];
    if (Array.isArray(rawData)) {
      handleUpdateJson(updated);
    } else {
      handleUpdateJson({ ...(rawData || {}), testCases: updated });
    }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleUpdateExcelItem = (idx: number, field: string, val: any) => {
    const updated = [...excelItems];
    let cleanVal = val;
    if (field === 'marks' || field === 'score') {
      cleanVal = val === '' ? 0 : Math.max(0, Number(val) || 0);
    }
    updated[idx] = { ...updated[idx], [field]: cleanVal };
    if (Array.isArray(rawData)) {
      handleUpdateJson(updated);
    } else {
      handleUpdateJson({ ...(rawData || {}), testCases: updated });
    }
  };

  const handleRemoveExcelItem = (idx: number) => {
    const updated = excelItems.filter((_, i) => i !== idx);
    if (Array.isArray(rawData)) {
      handleUpdateJson(updated);
    } else {
      handleUpdateJson({ ...(rawData || {}), testCases: updated });
    }
  };

  // ─── Function Unit Tests Paradigm Handlers ───
  const functionTestCases: any[] = useMemo(() => {
    if (Array.isArray(rawData?.testCases)) return rawData.testCases;
    if (Array.isArray(rawData)) return rawData;
    return [];
  }, [rawData]);

  const handleAddFunctionTestCase = () => {
    const newItem = {
      id: `tc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      input: '',
      output: '',
      expected: '',
      score: 10,
      description: '',
    };
    if (Array.isArray(rawData)) {
      handleUpdateJson([...functionTestCases, newItem]);
    } else {
      handleUpdateJson({
        ...(rawData || {}),
        evaluationMode: rawData?.evaluationMode || 'function',
        testCases: [...functionTestCases, newItem],
      });
    }
  };

  const handleDuplicateFunctionItem = (idx: number) => {
    const original = functionTestCases[idx];
    const cloned = {
      ...original,
      id: `tc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      description: original.description ? `${original.description} (Copy)` : '',
    };
    const updated = [
      ...functionTestCases.slice(0, idx + 1),
      cloned,
      ...functionTestCases.slice(idx + 1),
    ];
    if (Array.isArray(rawData)) {
      handleUpdateJson(updated);
    } else {
      handleUpdateJson({
        ...(rawData || {}),
        evaluationMode: rawData?.evaluationMode || 'function',
        testCases: updated,
      });
    }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleUpdateFunctionItem = (idx: number, field: string, val: any) => {
    const updated = [...functionTestCases];
    let cleanVal = val;
    if (field === 'score') {
      cleanVal = val === '' ? 0 : Math.max(0, Number(val) || 0);
    }
    const updatedItem = {
      ...updated[idx],
      [field]: cleanVal,
      ...(field === 'output' ? { expected: cleanVal } : {}),
      ...(field === 'expected' ? { output: cleanVal } : {}),
    };
    updated[idx] = updatedItem;
    if (Array.isArray(rawData)) {
      handleUpdateJson(updated);
    } else {
      handleUpdateJson({
        ...(rawData || {}),
        evaluationMode: rawData?.evaluationMode || 'function',
        testCases: updated,
      });
    }
  };

  const handleRemoveFunctionItem = (idx: number) => {
    const updated = functionTestCases.filter((_, i) => i !== idx);
    if (Array.isArray(rawData)) {
      handleUpdateJson(updated);
    } else {
      handleUpdateJson({
        ...(rawData || {}),
        evaluationMode: rawData?.evaluationMode || 'function',
        testCases: updated,
      });
    }
  };

  const handleUpdateEntryFunction = (funcName: string) => {
    if (Array.isArray(rawData)) {
      handleUpdateJson({
        evaluationMode: 'function',
        entryFunction: funcName,
        testCases: rawData,
      });
    } else {
      handleUpdateJson({
        ...(rawData || { evaluationMode: 'function' }),
        entryFunction: funcName,
      });
    }
  };

  // ─── Script Logs Paradigm Handlers ───
  const logsList: string[] = useMemo(() => {
    if (Array.isArray(rawData?.expectedLogs)) return rawData.expectedLogs;
    return [];
  }, [rawData]);

  const handleAddLog = () => {
    const currentLogs = Array.isArray(rawData?.expectedLogs) ? rawData.expectedLogs : [];
    handleUpdateJson({
      ...(rawData && typeof rawData === 'object' ? rawData : {}),
      evaluationMode: 'script',
      expectedLogs: [...currentLogs, ''],
    });
  };

  const handleUpdateLog = (idx: number, text: string) => {
    const currentLogs = [...logsList];
    currentLogs[idx] = text;
    handleUpdateJson({
      ...(rawData || { evaluationMode: 'script' }),
      expectedLogs: currentLogs,
    });
  };

  const handleRemoveLog = (idx: number) => {
    const currentLogs = logsList.filter((_, i) => i !== idx);
    handleUpdateJson({
      ...(rawData || { evaluationMode: 'script' }),
      expectedLogs: currentLogs,
    });
  };

  // ─── Metrics & Scoring ───
  const totalItemCount =
    activeParadigm === 'excel'
      ? excelItems.length
      : activeParadigm === 'script'
      ? logsList.length
      : activeParadigm === 'function'
      ? functionTestCases.length
      : isDetectedSpec
      ? 1
      : 0;

  const totalCalculatedScore = useMemo(() => {
    if (activeParadigm === 'excel') {
      return excelItems.reduce((acc, item) => acc + (Number(item.marks ?? item.score ?? 10) || 0), 0);
    }
    if (activeParadigm === 'function') {
      return functionTestCases.reduce((acc, item) => acc + (Number(item.score ?? 10) || 0), 0);
    }
    return 0;
  }, [activeParadigm, excelItems, functionTestCases]);

  // Switch paradigm helper
  const handleSwitchParadigm = (newParadigm: TestParadigm) => {
    setActiveParadigm(newParadigm);
    if (newParadigm === 'function' && functionTestCases.length === 0) {
      handleUpdateJson({
        evaluationMode: 'function',
        entryFunction: '',
        testCases: [
          { id: `tc_${Date.now()}`, input: '[1, 2]', output: '3', score: 10 },
        ],
      });
    } else if (newParadigm === 'excel' && excelItems.length === 0) {
      handleUpdateJson([
        {
          criterion: 'Formula Verification',
          type: 'formula_behavior_check',
          range: 'B10',
          expectedFormula: '=SUM(B2:B9)',
          marks: 10,
        },
      ]);
    } else if (newParadigm === 'script' && logsList.length === 0) {
      handleUpdateJson({
        evaluationMode: 'script',
        expectedLogs: ['Hello World'],
      });
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ─── Control Toolbar: Header + Segmented View Switcher + AI Generator ─── */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1 border-b border-slate-100'>
        {/* Left: Icon, Title & Dynamic Score Tally */}
        <div className='flex items-center gap-2 flex-wrap'>
          <div className='w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs shrink-0'>
            {activeParadigm === 'excel' ? (
              <FileSpreadsheet className='w-4 h-4 text-emerald-600' />
            ) : activeParadigm === 'script' ? (
              <Terminal className='w-4 h-4 text-indigo-600' />
            ) : (
              <Cpu className='w-4 h-4 text-indigo-600' />
            )}
          </div>

          <div>
            <div className='flex items-center gap-1.5'>
              <label className='text-xs sm:text-sm font-bold text-slate-800 tracking-tight'>
                Test Cases & Automated Specs
              </label>
              {['JS', 'PYTHON', 'EXCEL'].includes(upperType) && (
                <span className='text-rose-500 font-bold'>*</span>
              )}
            </div>
            <p className='text-[10px] text-slate-400 leading-none mt-0.5'>
              {activeParadigm === 'excel'
                ? 'Automated cell and formula verification'
                : activeParadigm === 'script'
                ? 'Sequential console output validation'
                : 'Automated input/output assertion suite'}
            </p>
          </div>

          {/* Points & Case Count Badges */}
          {totalItemCount > 0 && (
            <div className='flex items-center gap-1.5 ml-auto sm:ml-2'>
              <Badge
                variant='outline'
                className='text-[10px] font-semibold px-2 py-0.5 bg-slate-50 text-slate-700 border-slate-200'
              >
                {totalItemCount} {activeParadigm === 'excel' ? 'Rules' : activeParadigm === 'script' ? 'Logs' : 'Cases'}
              </Badge>

              {totalCalculatedScore > 0 && (
                <Badge
                  variant='outline'
                  className={`text-[10px] font-bold px-2 py-0.5 border ${
                    totalCalculatedScore === 100
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  }`}
                >
                  <Calculator className='w-3 h-3 mr-1 inline' />
                  {totalCalculatedScore} pts total
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Right: Dual-Mode Segmented Control + AI Generate */}
        <div className='flex items-center gap-2 self-end sm:self-center'>
          {/* Segmented Switcher */}
          <div className='inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs'>
            <button
              type='button'
              onClick={() => !parseError && setMode('visual')}
              disabled={Boolean(parseError && mode === 'json')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                mode === 'visual'
                  ? 'bg-white text-indigo-600 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={parseError ? 'Fix JSON error to switch to visual mode' : 'Interactive Visual Editor'}
            >
              <LayoutList className='w-3.5 h-3.5' />
              <span>Visual</span>
            </button>
            <button
              type='button'
              onClick={() => setMode('json')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                mode === 'json'
                  ? 'bg-white text-indigo-600 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title='Raw JSON Schema or Code Spec'
            >
              <Code2 className='w-3.5 h-3.5' />
              <span>JSON / Spec</span>
            </button>
          </div>

          {/* AI Auto-Generate Button */}
          {onGenerate && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={onGenerate}
              disabled={generating || !canGenerate}
              className='h-7 px-2.5 text-xs bg-indigo-50/80 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-800 font-semibold shadow-2xs transition-all'
            >
              {generating ? (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin text-indigo-600' />
              ) : (
                <Sparkles className='mr-1.5 h-3.5 w-3.5 text-indigo-600' />
              )}
              <span>Auto-Generate</span>
            </Button>
          )}
        </div>
      </div>

      {/* Parse Error Notification */}
      {parseError && (
        <div className='flex items-center justify-between p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs shadow-2xs'>
          <div className='flex items-center gap-2 min-w-0'>
            <AlertCircle className='w-4 h-4 shrink-0 text-rose-500' />
            <span className='truncate font-medium'>JSON Syntax Error: {parseError}</span>
          </div>
          <button
            type='button'
            onClick={handleFormatJson}
            className='ml-2 text-xs font-semibold text-rose-800 underline hover:no-underline shrink-0'
          >
            Attempt Repair
          </button>
        </div>
      )}

      {/* ─── Mode 1: Visual Mode ─── */}
      {mode === 'visual' && !parseError ? (
        <div className='space-y-2.5'>
          {/* Sub-toolbar: Test Paradigm Switcher (Tabs) */}
          <div className='flex items-center gap-1 p-1 bg-slate-50/90 rounded-lg border border-slate-200/70 overflow-x-auto text-[11px] font-semibold text-slate-600'>
            <span className='text-[10px] uppercase font-bold text-slate-400 px-2 select-none'>
              Paradigm:
            </span>
            <button
              type='button'
              onClick={() => handleSwitchParadigm('function')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all shrink-0 ${
                activeParadigm === 'function'
                  ? 'bg-white text-indigo-600 shadow-2xs font-bold border border-indigo-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Cpu className='w-3 h-3 text-indigo-500' />
              <span>Function Unit Tests</span>
            </button>

            <button
              type='button'
              onClick={() => handleSwitchParadigm('excel')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all shrink-0 ${
                activeParadigm === 'excel'
                  ? 'bg-white text-emerald-700 shadow-2xs font-bold border border-emerald-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileSpreadsheet className='w-3 h-3 text-emerald-600' />
              <span>Spreadsheet Rules (Excel)</span>
            </button>

            <button
              type='button'
              onClick={() => handleSwitchParadigm('script')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all shrink-0 ${
                activeParadigm === 'script'
                  ? 'bg-white text-indigo-600 shadow-2xs font-bold border border-indigo-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Terminal className='w-3 h-3 text-indigo-500' />
              <span>Console Logs</span>
            </button>

            <button
              type='button'
              onClick={() => handleSwitchParadigm('spec')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all shrink-0 ${
                activeParadigm === 'spec'
                  ? 'bg-white text-indigo-600 shadow-2xs font-bold border border-indigo-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileCode className='w-3 h-3 text-indigo-500' />
              <span>Spec Code</span>
            </button>
          </div>

          {/* ─────────────────────────────────────────────────────────────
             PARADIGM 1: FUNCTION UNIT TESTS (Responsive 2-Column Cards)
          ────────────────────────────────────────────────────────────── */}
          {activeParadigm === 'function' && (
            <div className='space-y-2.5'>
              {/* Optional Entry Function input */}
              <div className='flex items-center gap-2 px-3 py-2 bg-indigo-50/40 rounded-xl border border-indigo-100/80'>
                <div className='flex items-center gap-1.5 shrink-0'>
                  <span className='w-2 h-2 rounded-full bg-indigo-500'></span>
                  <span className='text-xs font-mono font-bold text-indigo-900'>
                    entryFunction:
                  </span>
                </div>
                <Input
                  value={rawData?.entryFunction || ''}
                  onChange={(e) => handleUpdateEntryFunction(e.target.value)}
                  placeholder='e.g. calculateTotal(items) or solution'
                  className='h-7 text-xs font-mono font-semibold bg-white border-indigo-200 text-indigo-950 flex-1'
                />
                <span className='hidden sm:inline text-[10px] text-indigo-600 font-medium shrink-0'>
                  Target function executed by auto-grader
                </span>
              </div>

              {/* Cards Container with smooth scrolling */}
              <div className='space-y-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar'>
                {functionTestCases.length === 0 ? (
                  <div className='p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2'>
                    <Cpu className='w-6 h-6 text-slate-400 mx-auto' />
                    <p className='text-xs font-semibold text-slate-700'>
                      No function test cases configured.
                    </p>
                    <p className='text-[11px] text-slate-400 max-w-sm mx-auto'>
                      Define arguments and expected returns for automatic grading of code submissions.
                    </p>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={handleAddFunctionTestCase}
                      className='text-xs h-7.5 border-slate-300'
                    >
                      <Plus className='w-3.5 h-3.5 mr-1 text-slate-600' />
                      Add First Test Case
                    </Button>
                  </div>
                ) : (
                  functionTestCases.map((tc: any, idx: number) => (
                    <div
                      key={tc.id || idx}
                      className='bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all overflow-hidden'
                    >
                      {/* Card Header: Test Case # Pill + Description + Points & Actions */}
                      <div className='flex items-center justify-between gap-2 px-3 py-2 bg-slate-50/70 border-b border-slate-100'>
                        <div className='flex items-center gap-2 flex-1 min-w-0'>
                          <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-bold shrink-0'>
                            <Hash className='w-3 h-3 text-indigo-500' />
                            <span>{idx + 1}</span>
                          </span>

                          <input
                            type='text'
                            value={tc.description || ''}
                            onChange={(e) =>
                              handleUpdateFunctionItem(idx, 'description', e.target.value)
                            }
                            placeholder='Optional test title (e.g. Positive integers, Handles null)'
                            className='flex-1 min-w-0 h-6 px-1.5 text-xs font-medium text-slate-700 bg-transparent hover:bg-white focus:bg-white rounded border border-transparent hover:border-slate-200 focus:border-indigo-300 outline-none transition-all placeholder:text-slate-400'
                          />
                        </div>

                        {/* Right: Score Tag + Duplicate + Delete */}
                        <div className='flex items-center gap-1.5 shrink-0'>
                          <div className='flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-0.5 h-6.5 shadow-2xs'>
                            <span className='text-[10px] text-slate-400 font-semibold uppercase tracking-wider'>
                              Points:
                            </span>
                            <input
                              type='number'
                              inputMode='numeric'
                              min={0}
                              value={tc.score ?? 10}
                              onChange={(e) =>
                                handleUpdateFunctionItem(idx, 'score', Number(e.target.value))
                              }
                              className='w-9 text-xs font-bold text-center text-slate-800 bg-transparent outline-none'
                            />
                          </div>

                          <button
                            type='button'
                            onClick={() => handleDuplicateFunctionItem(idx)}
                            className='p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors'
                            title='Duplicate test case'
                          >
                            {copiedIdx === idx ? (
                              <Check className='w-3.5 h-3.5 text-emerald-600' />
                            ) : (
                              <Copy className='w-3.5 h-3.5' />
                            )}
                          </button>

                          <button
                            type='button'
                            onClick={() => handleRemoveFunctionItem(idx)}
                            className='p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors'
                            title='Delete test case'
                          >
                            <Trash2 className='w-3.5 h-3.5' />
                          </button>
                        </div>
                      </div>

                      {/* Card Body: Responsive 2-Column with Arrow Flow */}
                      <div className='p-3 sm:p-3.5'>
                        <div className='grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2.5 items-center'>
                          {/* Input Arguments Field */}
                          <div className='space-y-1'>
                            <div className='flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-slate-500'>
                              <span className='flex items-center gap-1'>
                                <span className='w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block'></span>
                                <span>Input (args)</span>
                              </span>
                              <span className='text-slate-400 font-normal font-mono lowercase'>
                                e.g. [1, 2]
                              </span>
                            </div>
                            <Input
                              value={
                                typeof tc.input === 'object'
                                  ? JSON.stringify(tc.input)
                                  : tc.input ?? ''
                              }
                              onChange={(e) =>
                                handleUpdateFunctionItem(idx, 'input', e.target.value)
                              }
                              placeholder='e.g. [10, 20] or "hello"'
                              className='h-8.5 text-xs font-mono text-slate-800 bg-slate-50/70 border-slate-200 focus:bg-white focus:border-indigo-500 transition-colors'
                            />
                          </div>

                          {/* Connector Arrow (Desktop only) */}
                          <div className='hidden sm:flex items-center justify-center pt-4 px-0.5 text-slate-300'>
                            <div className='w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center'>
                              <ArrowRight className='w-3.5 h-3.5 text-slate-400' />
                            </div>
                          </div>

                          {/* Expected Return Output Field */}
                          <div className='space-y-1'>
                            <div className='flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-emerald-700'>
                              <span className='flex items-center gap-1'>
                                <span className='w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block'></span>
                                <span>Expected Return</span>
                              </span>
                              <span className='text-emerald-600/70 font-normal font-mono lowercase'>
                                return value
                              </span>
                            </div>
                            <Input
                              value={
                                typeof tc.output === 'object'
                                  ? JSON.stringify(tc.output)
                                  : tc.output ?? ''
                              }
                              onChange={(e) =>
                                handleUpdateFunctionItem(idx, 'output', e.target.value)
                              }
                              placeholder='e.g. 30 or "HELLO"'
                              className='h-8.5 text-xs font-mono font-semibold text-emerald-900 bg-emerald-50/30 border-emerald-200/90 focus:bg-white focus:border-emerald-500 transition-colors'
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Add Test Case Button */}
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handleAddFunctionTestCase}
                className='w-full text-xs h-8.5 border-dashed border-slate-300 text-slate-700 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/40 font-semibold gap-1.5 transition-all'
              >
                <Plus className='w-3.5 h-3.5 text-indigo-600' />
                <span>Add Another Test Case</span>
              </Button>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
             PARADIGM 2: SPREADSHEET / EXCEL ASSERTIONS
          ────────────────────────────────────────────────────────────── */}
          {activeParadigm === 'excel' && (
            <div className='space-y-2.5'>
              <div className='space-y-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar'>
                {excelItems.length === 0 ? (
                  <div className='p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2'>
                    <FileSpreadsheet className='w-6 h-6 text-emerald-600 mx-auto' />
                    <p className='text-xs font-semibold text-slate-700'>
                      No spreadsheet verification rules configured.
                    </p>
                    <p className='text-[11px] text-slate-400 max-w-sm mx-auto'>
                      Specify formulas, target ranges, cell values, and formats for Excel file submissions.
                    </p>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={handleAddExcelAssertion}
                      className='text-xs h-7.5 border-slate-300'
                    >
                      <Plus className='w-3.5 h-3.5 mr-1 text-slate-600' />
                      Add Spreadsheet Rule
                    </Button>
                  </div>
                ) : (
                  excelItems.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className='bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-emerald-300 hover:shadow-xs transition-all overflow-hidden'
                    >
                      {/* Card Header: Rule # + Rule Name + Points + Actions */}
                      <div className='flex items-center justify-between gap-2 px-3 py-2 bg-slate-50/70 border-b border-slate-100'>
                        <div className='flex items-center gap-2 flex-1 min-w-0'>
                          <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-bold shrink-0'>
                            <FileSpreadsheet className='w-3 h-3 text-emerald-600' />
                            <span>Rule {idx + 1}</span>
                          </span>

                          <input
                            type='text'
                            value={item.criterion || item.name || ''}
                            onChange={(e) =>
                              handleUpdateExcelItem(idx, 'criterion', e.target.value)
                            }
                            placeholder='Rule Title (e.g. Total Revenue Formula, Sales Growth %)'
                            className='flex-1 min-w-0 h-6 px-1.5 text-xs font-medium text-slate-800 bg-transparent hover:bg-white focus:bg-white rounded border border-transparent hover:border-slate-200 focus:border-emerald-400 outline-none transition-all placeholder:text-slate-400'
                          />
                        </div>

                        {/* Points & Actions */}
                        <div className='flex items-center gap-1.5 shrink-0'>
                          <div className='flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-0.5 h-6.5 shadow-2xs'>
                            <span className='text-[10px] text-slate-400 font-semibold uppercase tracking-wider'>
                              Points:
                            </span>
                            <input
                              type='number'
                              inputMode='numeric'
                              min={0}
                              value={item.marks ?? item.score ?? item.points ?? 10}
                              onChange={(e) =>
                                handleUpdateExcelItem(idx, 'marks', Number(e.target.value))
                              }
                              className='w-9 text-xs font-bold text-center text-slate-800 bg-transparent outline-none'
                            />
                          </div>

                          <button
                            type='button'
                            onClick={() => handleDuplicateExcelItem(idx)}
                            className='p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors'
                            title='Duplicate rule'
                          >
                            {copiedIdx === idx ? (
                              <Check className='w-3.5 h-3.5 text-emerald-600' />
                            ) : (
                              <Copy className='w-3.5 h-3.5' />
                            )}
                          </button>

                          <button
                            type='button'
                            onClick={() => handleRemoveExcelItem(idx)}
                            className='p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors'
                            title='Delete rule'
                          >
                            <Trash2 className='w-3.5 h-3.5' />
                          </button>
                        </div>
                      </div>

                      {/* Card Body: Responsive 3-Column Fields */}
                      <div className='p-3 sm:p-3.5'>
                        <div className='grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center'>
                          {/* Target Range */}
                          <div className='space-y-1'>
                            <span className='text-[10px] font-semibold text-slate-400 uppercase tracking-wider block'>
                              Target Cell / Range
                            </span>
                            <Input
                              value={item.range || item.anchor || ''}
                              onChange={(e) =>
                                handleUpdateExcelItem(idx, 'range', e.target.value)
                              }
                              placeholder='e.g. C10 or D2:D20'
                              className='h-8.5 text-xs font-mono font-bold text-emerald-800 bg-emerald-50/40 border-emerald-200 focus:bg-white focus:border-emerald-500'
                            />
                          </div>

                          {/* Expected Formula / Pattern */}
                          <div className='space-y-1'>
                            <span className='text-[10px] font-semibold text-slate-400 uppercase tracking-wider block'>
                              Expected Formula / Value
                            </span>
                            <Input
                              value={
                                item.expectedFormula ||
                                item.formula ||
                                (typeof item.expectedValue === 'object'
                                  ? JSON.stringify(item.expectedValue)
                                  : String(item.expectedValue ?? ''))
                              }
                              onChange={(e) =>
                                handleUpdateExcelItem(idx, 'expectedFormula', e.target.value)
                              }
                              placeholder='e.g. =SUM(C2:C9) or Currency'
                              className='h-8.5 text-xs font-mono text-slate-800 bg-slate-50/70 border-slate-200 focus:bg-white focus:border-emerald-500'
                            />
                          </div>

                          {/* Verification Type */}
                          <div className='space-y-1'>
                            <span className='text-[10px] font-semibold text-slate-400 uppercase tracking-wider block'>
                              Check Type
                            </span>
                            <select
                              value={item.type || 'formula_behavior_check'}
                              onChange={(e) =>
                                handleUpdateExcelItem(idx, 'type', e.target.value)
                              }
                              className='w-full h-8.5 px-2 text-xs font-medium text-slate-700 bg-slate-50/70 border border-slate-200 rounded-md outline-none focus:border-emerald-500 focus:bg-white'
                            >
                              {EXCEL_CHECK_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Add Excel Rule Button */}
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handleAddExcelAssertion}
                className='w-full text-xs h-8.5 border-dashed border-slate-300 text-slate-700 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50/40 font-semibold gap-1.5 transition-all'
              >
                <Plus className='w-3.5 h-3.5 text-emerald-600' />
                <span>Add Another Spreadsheet Rule</span>
              </Button>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
             PARADIGM 3: SCRIPT / CONSOLE LOG STREAM
          ────────────────────────────────────────────────────────────── */}
          {activeParadigm === 'script' && (
            <div className='rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs'>
              {/* Terminal Title Bar */}
              <div className='flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-slate-300'>
                <div className='flex items-center gap-2'>
                  <div className='flex items-center gap-1.5'>
                    <span className='w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block'></span>
                    <span className='w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block'></span>
                    <span className='w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block'></span>
                  </div>
                  <span className='text-[11px] font-mono text-slate-400 font-medium ml-1'>
                    stdout verification stream
                  </span>
                </div>
                <Badge
                  variant='outline'
                  className='text-[10px] bg-slate-800 text-slate-300 border-slate-700'
                >
                  Sequential Execution
                </Badge>
              </div>

              {/* Terminal Logs Container */}
              <div className='p-3 space-y-1.5 bg-slate-950 max-h-[300px] overflow-y-auto custom-scrollbar font-mono'>
                {logsList.length === 0 ? (
                  <p className='text-xs text-slate-500 italic py-2'>
                    No expected stdout output lines defined yet.
                  </p>
                ) : (
                  logsList.map((log: string, idx: number) => (
                    <div key={idx} className='flex items-center gap-2 group'>
                      <span className='text-[11px] text-slate-600 w-6 text-right select-none font-bold'>
                        {idx + 1}.
                      </span>
                      <span className='text-emerald-500 font-bold select-none text-xs'>
                        &gt;
                      </span>
                      <input
                        value={log}
                        onChange={(e) => handleUpdateLog(idx, e.target.value)}
                        placeholder='Exact expected output text...'
                        className='flex-1 bg-transparent border-b border-slate-800 hover:border-slate-700 focus:border-indigo-400 text-xs text-slate-100 outline-none py-1 transition-colors'
                      />
                      <button
                        type='button'
                        onClick={() => handleRemoveLog(idx)}
                        className='p-1 text-slate-500 hover:text-rose-400 rounded opacity-70 group-hover:opacity-100 transition-opacity'
                        title='Delete log line'
                      >
                        <Trash2 className='w-3.5 h-3.5' />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add Log Action */}
              <div className='p-2.5 bg-slate-900 border-t border-slate-800 flex justify-end'>
                <Button
                  type='button'
                  size='sm'
                  onClick={handleAddLog}
                  className='h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium'
                >
                  <Plus className='w-3.5 h-3.5 mr-1' />
                  Add Output Line
                </Button>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
             PARADIGM 4: CODE SPEC SUITE (PLAYWRIGHT / JEST)
          ────────────────────────────────────────────────────────────── */}
          {activeParadigm === 'spec' && (
            <div className='rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs'>
              <div className='flex items-center justify-between px-3.5 py-2 bg-slate-100 border-b border-slate-200 text-slate-700'>
                <div className='flex items-center gap-2'>
                  <FileCode className='w-4 h-4 text-indigo-600' />
                  <span className='text-xs font-bold'>Playwright / Jest Spec Code</span>
                </div>
                <Badge
                  variant='outline'
                  className='text-[10px] bg-white text-indigo-700 border-indigo-200'
                >
                  Executable
                </Badge>
              </div>
              <textarea
                value={jsonText}
                onChange={(e) => handleRawChange(e.target.value)}
                rows={8}
                placeholder={`test('user can log in', async ({ page }) => {\n  await page.goto('/');\n});`}
                className='w-full font-mono text-xs text-slate-800 bg-slate-50/50 p-3 outline-none focus:bg-white resize-y leading-relaxed'
              />
            </div>
          )}
        </div>
      ) : (
        /* ─── Mode 2: Code / JSON Editor Mode ─── */
        <div className='space-y-1.5'>
          <textarea
            value={jsonText}
            onChange={(e) => handleRawChange(e.target.value)}
            placeholder='[\n  {\n    "input": "[1, 2]",\n    "output": "3",\n    "score": 10\n  }\n]'
            className='w-full min-h-[160px] max-h-[380px] rounded-xl border border-slate-300 p-3.5 font-mono text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all bg-slate-950 text-cyan-400 resize-y leading-relaxed'
          />
          <div className='flex items-center justify-between text-[11px] text-slate-400 px-1'>
            <span>Full JSON schema or test suite specification.</span>
            <button
              type='button'
              onClick={handleFormatJson}
              className='text-indigo-600 hover:underline font-semibold'
            >
              Format JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
