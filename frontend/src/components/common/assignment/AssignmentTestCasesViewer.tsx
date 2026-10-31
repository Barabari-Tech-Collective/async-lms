import React, { useMemo, useState } from 'react';
import { Terminal, Check, Copy, Code2, Cpu, Lock, FileSpreadsheet, BarChart3, Layers, Database } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface AssignmentTestCasesViewerProps {
  testCases: any;
  evaluatorType?: string | null;
  className?: string;
  isStaff?: boolean;
}

const b64_to_utf8 = (str: string) => {
  try {
    return decodeURIComponent(escape(window.atob(str)));
  } catch {
    return str;
  }
};

type ParsedTestCases =
  | { type: 'spec'; content: string; testCases: any[] }
  | { type: 'function'; entryFunction?: string; testCases: any[] }
  | { type: 'script'; expectedLogs: string[] }
  | { type: 'list'; items: any[] }
  | { type: 'raw'; content: string }
  | { type: 'json'; content: string };

export const AssignmentTestCasesViewer: React.FC<AssignmentTestCasesViewerProps> = ({
  testCases,
  evaluatorType,
  className = '',
  isStaff = false,
}) => {
  const [copied, setCopied] = useState(false);

  const parsed = useMemo<ParsedTestCases | null>(() => {
    if (!testCases) return null;
    let data = testCases;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // Plain text or raw code
        return { type: 'raw', content: data };
      }
    }

    if (!data) return null;

    // Spec file format (REACT, FULLSTACK, AI, etc.)
    if (data.specFile) {
      const decoded = b64_to_utf8(data.specFile);
      return {
        type: 'spec',
        content: decoded,
        testCases: Array.isArray(data.testCases) ? data.testCases : [],
      };
    }

    // Excel evaluation mode or list of Excel assertions (prevents false function mode match)
    const isExcelFormat =
      evaluatorType === 'EXCEL' ||
      (Array.isArray(data) && data.some((i: any) => i && (i.criterion || i.range || i.anchor || i.type === 'formula_behavior_check' || i.type === 'value_check' || i.type === 'formula_range_check' || i.type === 'format_check' || i.type === 'chart_check' || i.type === 'pivot_check' || i.type === 'data_check' || i.type === 'macro_check'))) ||
      (Array.isArray(data?.testCases) && data.testCases.some((i: any) => i && (i.criterion || i.range || i.anchor || i.type === 'formula_behavior_check' || i.type === 'value_check' || i.type === 'formula_range_check' || i.type === 'format_check' || i.type === 'chart_check' || i.type === 'pivot_check' || i.type === 'data_check' || i.type === 'macro_check')));

    if (isExcelFormat) {
      const items = Array.isArray(data) ? data : Array.isArray(data.testCases) ? data.testCases : [];
      return {
        type: 'list',
        items,
      };
    }

    // Function mode format
    if (data.evaluationMode === 'function' || Array.isArray(data.testCases)) {
      return {
        type: 'function',
        entryFunction: data.entryFunction,
        testCases: Array.isArray(data.testCases) ? data.testCases : [],
      };
    }

    // Script mode format
    if (data.evaluationMode === 'script' || Array.isArray(data.expectedLogs)) {
      return {
        type: 'script',
        expectedLogs: Array.isArray(data.expectedLogs) ? data.expectedLogs : [],
      };
    }

    // Generic array of test items
    if (Array.isArray(data)) {
      return {
        type: 'list',
        items: data,
      };
    }

    return { type: 'json', content: JSON.stringify(data, null, 2) };
  }, [testCases, evaluatorType]);

  if (!parsed) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={`overflow-hidden rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm p-0 ${className}`}>
      {/* Header */}
      <div className='flex items-center justify-between px-4 sm:px-8 pt-5 sm:pt-6 pb-2'>
        <div>
          <div className='flex items-center gap-2'>
            <Terminal className='h-4 w-4 text-indigo-500' />
            <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>
              Test Cases & Verification
            </p>
          </div>
          <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
            Automated verification checks and expected behavior
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {evaluatorType && (
            <Badge className={`${evaluatorType === 'EXCEL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : (evaluatorType === 'SQL' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200')} text-xs font-semibold px-2.5 py-0.5 uppercase`}>
              {evaluatorType === 'EXCEL' ? (
                <FileSpreadsheet className='h-3 w-3 mr-1 inline' />
              ) : evaluatorType === 'SQL' ? (
                <Database className='h-3 w-3 mr-1 inline' />
              ) : (
                <Cpu className='h-3 w-3 mr-1 inline' />
              )}
              {evaluatorType} Evaluator
            </Badge>
          )}
        </div>
      </div>

      <div className='px-4 sm:px-8 py-4 sm:py-6'>
        {/* SCRIPT MODE */}
        {parsed.type === 'script' && (
          <div className='space-y-3'>
            <div className='flex items-center justify-between text-xs text-slate-500 font-medium'>
              <span>Expected Output / Console Verification</span>
              <span className='text-slate-400'>Sequential Script Execution</span>
            </div>
            {isStaff ? (
              <div className='rounded-xl bg-slate-900 p-4 text-emerald-400 font-mono text-xs sm:text-sm space-y-1.5 shadow-inner overflow-x-auto'>
                {parsed.expectedLogs.length > 0 ? (
                  parsed.expectedLogs.map((log: string, idx: number) => (
                    <div key={idx} className='flex items-start gap-2'>
                      <span className='text-slate-500 select-none'>&gt;</span>
                      <span className='text-slate-100'>{log}</span>
                    </div>
                  ))
                ) : (
                  <div className='text-slate-400 italic'>No specific console logs defined</div>
                )}
              </div>
            ) : (
              <div className='p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs sm:text-sm'>
                <div className='flex items-center gap-2'>
                  <Lock className='w-4 h-4 text-slate-400' />
                  <span className='text-slate-700 font-medium'>
                    {parsed.expectedLogs.length > 0
                      ? `${parsed.expectedLogs.length} automated console check${parsed.expectedLogs.length > 1 ? 's' : ''} configured`
                      : 'Automated console verification checks configured'}
                  </span>
                </div>
                <span className='text-xs text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200 font-medium'>
                  Verified upon submission
                </span>
              </div>
            )}
          </div>
        )}

        {/* FUNCTION MODE */}
        {parsed.type === 'function' && (
          <div className='space-y-3'>
            {parsed.entryFunction && (
              <div className='flex items-center gap-2 text-xs font-medium text-slate-600 mb-2'>
                <span>Target Function:</span>
                <code className='bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono font-semibold text-xs border border-indigo-100'>
                  {parsed.entryFunction}()
                </code>
              </div>
            )}
            <div className='grid gap-2.5'>
              {parsed.testCases.map((tc: any, idx: number) => (
                <div
                  key={idx}
                  className='p-3.5 rounded-xl border border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm'
                >
                  <div className='flex items-center gap-2'>
                    <span className='w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0'>
                      {idx + 1}
                    </span>
                    <div className='space-y-0.5'>
                      <span className='text-slate-500 text-xs block'>Input Arguments:</span>
                      <code className='bg-white px-2 py-1 rounded border border-slate-200 text-slate-800 font-mono text-xs inline-block max-w-full truncate'>
                        {typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input ?? '')}
                      </code>
                    </div>
                  </div>
                  <div className='sm:text-right space-y-0.5'>
                    <span className='text-slate-500 text-xs block'>Expected Return:</span>
                    {isStaff ? (
                      <code className='bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-1 rounded font-mono text-xs font-semibold inline-block max-w-full truncate'>
                        {typeof tc.expected === 'object' ? JSON.stringify(tc.expected) : String(tc.expected ?? tc.output ?? '')}
                      </code>
                    ) : (
                      <span className='inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200'>
                        <Lock className='w-3 h-3 text-slate-400' />
                        Locked (Evaluated upon submission)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SPEC FILE / CODE SUITE MODE */}
        {(parsed.type === 'spec' || parsed.type === 'raw') && (
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-1.5 text-xs font-semibold text-slate-600'>
                <Code2 className='h-3.5 w-3.5 text-slate-500' />
                <span>Automated Test Spec File</span>
              </div>
              {isStaff && (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => handleCopy(parsed.content)}
                  className='h-7 text-xs text-slate-500 hover:text-slate-800'
                >
                  {copied ? <Check className='h-3 w-3 mr-1 text-emerald-600' /> : <Copy className='h-3 w-3 mr-1' />}
                  {copied ? 'Copied' : 'Copy Spec'}
                </Button>
              )}
            </div>
            {isStaff ? (
              <div className='rounded-xl bg-slate-900 p-4 text-slate-200 font-mono text-xs max-h-64 overflow-y-auto shadow-inner leading-relaxed whitespace-pre'>
                {parsed.content}
              </div>
            ) : (
              <div className='p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs sm:text-sm'>
                <div className='flex items-center gap-2'>
                  <Lock className='w-4 h-4 text-slate-400' />
                  <span className='text-slate-700 font-medium'>
                    Automated verification suite loaded
                  </span>
                </div>
                <span className='text-xs text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200 font-medium'>
                  Evaluated upon submission
                </span>
              </div>
            )}
          </div>
        )}

        {/* LIST MODE (Generic & Excel Test Cases) */}
        {parsed.type === 'list' && (
          <div className='grid gap-2.5'>
            {parsed.items?.map((item: any, idx: number) => {
              const isExcelItem = item.criterion || item.type || item.range || item.anchor || item.expectedValue !== undefined;
              return (
                <div
                  key={idx}
                  className='p-3.5 rounded-xl border border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm'
                >
                  <div className='flex items-start sm:items-center gap-2.5'>
                    <span className='w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 sm:mt-0'>
                      {idx + 1}
                    </span>
                    <div className='space-y-1'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <span className='text-xs font-semibold text-slate-800'>
                          {item.criterion || item.name || `Test Case #${idx + 1}`}
                        </span>
                        {item.type && (
                          <span className='text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 uppercase'>
                            {String(item.type).replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>

                      {/* Excel-specific descriptors */}
                      {isExcelItem && (
                        <div className='flex items-center gap-1.5 flex-wrap text-xs text-slate-600'>
                          {item.range && (
                            <code className='bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-700 font-mono text-[11px] font-semibold'>
                              Range: {item.range}
                            </code>
                          )}
                          {item.anchor && (
                            <code className='bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-mono text-[11px]'>
                              Anchor: &quot;{item.anchor}&quot; ({item.direction || 'right'})
                            </code>
                          )}
                          {item.cell && (
                            <code className='bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-mono text-[11px]'>
                              Cell: {item.cell}
                            </code>
                          )}
                          {item.acceptedFunctions && Array.isArray(item.acceptedFunctions) && (
                            <span className='inline-flex items-center gap-1 text-[11px] text-slate-600'>
                              Allowed: <span className='font-mono font-medium text-emerald-700'>{item.acceptedFunctions.join(', ')}</span>
                            </span>
                          )}
                          {item.mustBeFormula && (
                            <span className='text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium'>
                              Dynamic Formula Required
                            </span>
                          )}
                          {/* Behavior mutation check */}
                          {item.type === 'formula_behavior_check' && (
                            <div className='flex items-center gap-1.5 flex-wrap mt-0.5'>
                              {item.inputs && Array.isArray(item.inputs) && item.inputs.map((inp: any, iIdx: number) => (
                                <span key={iIdx} className='inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold'>
                                  Mutate {inp.cell} ➔ {inp.value}
                                </span>
                              ))}
                              <span className='text-slate-400 text-xs'>➔</span>
                              {item.expectedOutputs && Array.isArray(item.expectedOutputs) && item.expectedOutputs.map((out: any, oIdx: number) => (
                                <span key={oIdx} className='inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold'>
                                  Expect {out.cell} ➔ {out.expectedValue}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Chart check */}
                          {(item.type === 'chart_check' || item.chartType) && (
                            <div className='flex items-center gap-1.5 flex-wrap mt-0.5'>
                              <span className='inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium'>
                                <BarChart3 className='w-3 h-3' />
                                Chart Type: {item.chartType || 'Any'}
                              </span>
                              {item.title && (
                                <span className='text-[11px] text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 font-medium'>
                                  Title: &quot;{item.title}&quot;
                                </span>
                              )}
                            </div>
                          )}

                          {/* Pivot check */}
                          {(item.type === 'pivot_check' || item.minPivotTables) && (
                            <div className='flex items-center gap-1.5 flex-wrap mt-0.5'>
                              <span className='inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200 font-medium'>
                                <Layers className='w-3 h-3' />
                                Pivot Table {item.minPivotTables ? `(${item.minPivotTables}+)` : ''}
                              </span>
                              {(item.requiredField || item.requiredFields) && (
                                <span className='text-[11px] text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 font-mono'>
                                  Field: {item.requiredField || (Array.isArray(item.requiredFields) ? item.requiredFields.join(', ') : item.requiredFields)}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Macro / VBA check */}
                          {(item.type === 'macro_check' || item.requireVba) && (
                            <div className='flex items-center gap-1.5 flex-wrap mt-0.5'>
                              <span className='inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium'>
                                VBA Automation
                              </span>
                              {item.requiredSub && (
                                <span className='text-[11px] text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 font-mono'>
                                  Sub: {item.requiredSub}()
                                </span>
                              )}
                            </div>
                          )}

                          {/* Data completeness check */}
                          {item.type === 'data_check' && (
                            <span className='text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium'>
                              Non-Empty Data in Range {item.range || 'Table'}
                            </span>
                          )}

                          {item.bold && (
                            <span className='text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold'>
                              Bold
                            </span>
                          )}
                          {item.align && (
                            <span className='text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700'>
                              Align: {item.align}
                            </span>
                          )}
                          {item.hasFill && (
                            <span className='text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200'>
                              Header Fill
                            </span>
                          )}
                          {item.hasBorder && (
                            <span className='text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700'>
                              Borders
                            </span>
                          )}
                          {item.numberFormat && (
                            <span className='text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium'>
                              Format: {item.numberFormat}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Standard JS input if present */}
                      {!isExcelItem && item.input && (
                        <code className='bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-mono text-xs'>
                          Input: {typeof item.input === 'object' ? JSON.stringify(item.input) : String(item.input)}
                        </code>
                      )}
                    </div>
                  </div>

                  {/* Expected Output / Value */}
                  <div>
                    {isExcelItem && item.expectedValue !== undefined ? (
                      isStaff ? (
                        <code className='bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-mono text-xs font-semibold'>
                          Expected: {String(item.expectedValue)}{item.tolerance ? ` (±${item.tolerance * 100}%)` : ''}
                        </code>
                      ) : (
                        <span className='inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200'>
                          <Lock className='w-3 h-3 text-slate-400' />
                          Locked
                        </span>
                      )
                    ) : (item.output !== undefined || item.expected !== undefined) ? (
                      isStaff ? (
                        <code className='bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-mono text-xs font-semibold'>
                          Expected: {typeof (item.expected ?? item.output) === 'object' ? JSON.stringify(item.expected ?? item.output) : String(item.expected ?? item.output)}
                        </code>
                      ) : (
                        <span className='inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200'>
                          <Lock className='w-3 h-3 text-slate-400' />
                          Locked
                        </span>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* JSON FALLBACK */}
        {parsed.type === 'json' && (
          isStaff ? (
            <div className='rounded-xl bg-slate-900 p-4 text-slate-200 font-mono text-xs max-h-60 overflow-y-auto whitespace-pre'>
              {parsed.content}
            </div>
          ) : (
            <div className='p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2 text-xs sm:text-sm text-slate-600'>
              <Lock className='w-4 h-4 text-slate-400' />
              <span>Automated test configuration (Evaluated upon submission)</span>
            </div>
          )
        )}
      </div>
    </Card>
  );
};

export default AssignmentTestCasesViewer;
