import React, { useMemo, useState } from 'react';
import { Terminal, Check, Copy, Code2, Cpu } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface AssignmentTestCasesViewerProps {
  testCases: any;
  evaluatorType?: string | null;
  className?: string;
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
  }, [testCases]);

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
            <Badge className='bg-indigo-50 text-indigo-700 border-indigo-200 text-xs font-semibold px-2.5 py-0.5 uppercase'>
              <Cpu className='h-3 w-3 mr-1 inline' />
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
              <span>Expected Output / Console Logs</span>
              <span className='text-slate-400'>Sequential Script Execution</span>
            </div>
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
                    <code className='bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-1 rounded font-mono text-xs font-semibold inline-block max-w-full truncate'>
                      {typeof tc.expected === 'object' ? JSON.stringify(tc.expected) : String(tc.expected ?? tc.output ?? '')}
                    </code>
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
            </div>
            <div className='rounded-xl bg-slate-900 p-4 text-slate-200 font-mono text-xs max-h-64 overflow-y-auto shadow-inner leading-relaxed whitespace-pre'>
              {parsed.content}
            </div>
          </div>
        )}

        {/* LIST MODE */}
        {parsed.type === 'list' && (
          <div className='grid gap-2.5'>
            {parsed.items?.map((item: any, idx: number) => (
              <div
                key={idx}
                className='p-3.5 rounded-xl border border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm'
              >
                <div className='flex items-center gap-2.5'>
                  <span className='w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0'>
                    {idx + 1}
                  </span>
                  <div>
                    <span className='text-xs text-slate-500 block'>{item.name || `Test Case #${idx + 1}`}</span>
                    {item.input && (
                      <code className='bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-mono text-xs'>
                        Input: {typeof item.input === 'object' ? JSON.stringify(item.input) : String(item.input)}
                      </code>
                    )}
                  </div>
                </div>
                {item.output && (
                  <div>
                    <code className='bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-mono text-xs font-semibold'>
                      Expected: {typeof item.output === 'object' ? JSON.stringify(item.output) : String(item.output)}
                    </code>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* JSON FALLBACK */}
        {parsed.type === 'json' && (
          <div className='rounded-xl bg-slate-900 p-4 text-slate-200 font-mono text-xs max-h-60 overflow-y-auto whitespace-pre'>
            {parsed.content}
          </div>
        )}
      </div>
    </Card>
  );
};

export default AssignmentTestCasesViewer;
