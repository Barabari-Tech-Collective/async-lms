import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Code2,
  LayoutList,
  Plus,
  Trash2,
  Wand2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export interface RubricCriterion {
  id?: string | number;
  name: string;
  description: string;
  weight: number;
}

export interface RubricVisualEditorProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate?: () => void;
  generating?: boolean;
  canGenerate?: boolean;
  evaluatorType?: string;
  required?: boolean;
  className?: string;
}

/**
 * Normalizes any rubric input (array of criteria, { criteria: [...] }, or legacy fields)
 * into a standard RubricCriterion[]
 */
function parseRubricJson(rawJson: string): { items: RubricCriterion[]; error: string | null } {
  if (!rawJson || !rawJson.trim()) {
    return { items: [], error: null };
  }
  try {
    const parsed = JSON.parse(rawJson);
    const rawList: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.criteria)
      ? parsed.criteria
      : Array.isArray(parsed?.rubric)
      ? parsed.rubric
      : [];

    if (!Array.isArray(rawList)) {
      return { items: [], error: 'Rubric must be a JSON array of criteria.' };
    }

    const items: RubricCriterion[] = rawList.map((item, idx) => ({
      id: item.id || `rubric_item_${idx}`,
      name: item.name ?? item.criteria ?? item.title ?? item.criterion ?? '',
      description: item.description || '',
      weight: Math.max(
        0,
        Math.min(100, Number(item.weight ?? item.score ?? item.points ?? item.maxScore ?? 10) || 0)
      ),
    }));

    return { items, error: null };
  } catch (err: any) {
    return { items: [], error: err?.message || 'Invalid JSON syntax' };
  }
}

export const RubricVisualEditor: React.FC<RubricVisualEditorProps> = ({
  value,
  onChange,
  onGenerate,
  generating = false,
  canGenerate = true,
  evaluatorType = '',
  required = false,
  className = '',
}) => {
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState<string>(value || '');
  const [parseError, setParseError] = useState<string | null>(null);
  const lastSentJsonRef = useRef<string>('');

  // Parse items from raw string
  const { items: parsedItems } = useMemo(() => parseRubricJson(jsonText), [jsonText]);

  // Local state for visual editing to allow smooth keystrokes
  const [criteria, setCriteria] = useState<RubricCriterion[]>(parsedItems);

  // Sync external changes (e.g. from AI Generation) into local state safely without dropping focus
  useEffect(() => {
    if (value === lastSentJsonRef.current) return;
    setJsonText(value || '');
    const res = parseRubricJson(value || '');
    if (!res.error) {
      setCriteria(res.items);
      setParseError(null);
    } else {
      setParseError(res.error);
    }
  }, [value]);

  // Broadcast criteria updates to parent as formatted JSON
  const notifyChange = useCallback(
    (newCriteria: RubricCriterion[]) => {
      setCriteria(newCriteria);
      const cleanPayload = newCriteria.map(({ name, weight, description }) => ({
        name: name,
        weight: Math.max(0, Math.min(100, Number(weight) || 0)),
        description: description || '',
      }));
      const formatted = JSON.stringify(cleanPayload, null, 2);
      lastSentJsonRef.current = formatted;
      setJsonText(formatted);
      setParseError(null);
      onChange(formatted);
    },
    [onChange]
  );

  const handleUpdateCriterion = (idx: number, field: keyof RubricCriterion, val: any) => {
    const updated = [...criteria];
    const cleanVal =
      field === 'weight'
        ? Math.max(0, Math.min(100, Number(val) || 0))
        : val;
    updated[idx] = { ...updated[idx], [field]: cleanVal };
    notifyChange(updated);
  };

  const handleAddCriterion = () => {
    const newCriterion: RubricCriterion = {
      id: `rubric_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: '',
      description: '',
      weight: 10,
    };
    notifyChange([...criteria, newCriterion]);
  };

  const handleRemoveCriterion = (idx: number) => {
    const updated = criteria.filter((_, i) => i !== idx);
    notifyChange(updated);
  };

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

  const handleJsonChange = (newVal: string) => {
    setJsonText(newVal);
    onChange(newVal);
    const res = parseRubricJson(newVal);
    if (!res.error) {
      setCriteria(res.items);
      setParseError(null);
    } else {
      setParseError(res.error);
    }
  };

  // Switch to visual mode with safety guard
  const handleSwitchToVisual = () => {
    if (parseError) return;
    setMode('visual');
  };

  const totalWeight = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Header controls & Mode Switcher */}
      <div className='flex flex-wrap items-center justify-between gap-2 pb-1'>
        <div className='flex items-center gap-2'>
          <label className='text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-1.5'>
            <span>Rubric & Criteria</span>
            {required ? (
              <span className='text-rose-500'>*</span>
            ) : (
              <span className='text-[11px] font-normal text-slate-400'>
                {evaluatorType ? '(Required for evaluation)' : '(Optional)'}
              </span>
            )}
          </label>

          {/* Total weight indicator */}
          {criteria.length > 0 && (
            <Badge
              variant='outline'
              className={`text-[11px] font-semibold px-2 py-0.5 border ${
                totalWeight === 100
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              Total: {totalWeight}%
            </Badge>
          )}
        </div>

        <div className='flex items-center gap-2'>
          {/* Segmented Mode Switcher */}
          <div className='inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/80'>
            <button
              type='button'
              onClick={handleSwitchToVisual}
              disabled={Boolean(parseError && mode === 'json')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                mode === 'visual'
                  ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={parseError ? 'Fix JSON errors to view visual cards' : 'Visual Preview & Editor'}
            >
              <LayoutList className='w-3.5 h-3.5' />
              <span>Visual</span>
            </button>
            <button
              type='button'
              onClick={() => setMode('json')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                mode === 'json'
                  ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title='Raw JSON Code'
            >
              <Code2 className='w-3.5 h-3.5' />
              <span>JSON</span>
            </button>
          </div>

          {/* Auto-Generate Button */}
          {onGenerate && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={onGenerate}
              disabled={generating || !canGenerate}
              className='h-7 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 font-semibold shadow-2xs'
            >
              {generating ? (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              ) : (
                <Wand2 className='mr-1.5 h-3.5 w-3.5 text-emerald-600' />
              )}
              <span>Auto-Generate Rubric</span>
            </Button>
          )}
        </div>
      </div>

      {/* Parse Error Banner */}
      {parseError && (
        <div className='flex items-center justify-between p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs'>
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

      {/* Mode 1: Visual Cards Preview & Editor */}
      {mode === 'visual' && !parseError ? (
        <div className='space-y-2.5'>
          {criteria.length === 0 ? (
            <div className='p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2'>
              <p className='text-xs text-slate-500'>No rubric criteria defined yet.</p>
              <div className='flex items-center justify-center gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={handleAddCriterion}
                  className='text-xs h-7 border-slate-300'
                >
                  <Plus className='w-3.5 h-3.5 mr-1 text-slate-600' />
                  Add First Criterion
                </Button>
                {onGenerate && canGenerate && (
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={onGenerate}
                    disabled={generating}
                    className='text-xs h-7 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  >
                    <Wand2 className='w-3.5 h-3.5 mr-1 text-emerald-600' />
                    Auto-Generate
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className='space-y-2 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar'>
              {criteria.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className='p-3 bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all space-y-2'
                >
                  <div className='flex items-center justify-between gap-2'>
                    <div className='flex items-center gap-2 flex-1 min-w-0'>
                      <span className='w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0 border border-indigo-100'>
                        {idx + 1}
                      </span>
                      <Input
                        value={item.name}
                        onChange={(e) => handleUpdateCriterion(idx, 'name', e.target.value)}
                        placeholder='Criterion Title (e.g. Code Correctness & Validation)'
                        className='h-8 text-xs font-semibold text-slate-800 bg-slate-50/50 border-slate-200 focus:bg-white'
                      />
                    </div>

                    <div className='flex items-center gap-1.5 shrink-0'>
                      <div className='flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5 h-8'>
                        <span className='text-[11px] text-slate-400 font-medium'>Weight:</span>
                        <input
                          type='number'
                          min={0}
                          max={100}
                          value={item.weight}
                          onChange={(e) => handleUpdateCriterion(idx, 'weight', e.target.value)}
                          className='w-12 text-xs font-bold text-center text-slate-800 bg-transparent outline-none'
                        />
                        <span className='text-[11px] text-slate-400 font-medium'>%</span>
                      </div>

                      <button
                        type='button'
                        onClick={() => handleRemoveCriterion(idx)}
                        className='p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors'
                        title='Delete criterion'
                      >
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={item.description}
                    onChange={(e) => handleUpdateCriterion(idx, 'description', e.target.value)}
                    placeholder='Describe the exact expectations and grading guidelines for this criterion...'
                    rows={2}
                    className='w-full text-xs text-slate-600 bg-slate-50/50 border border-slate-200 rounded-lg p-2 outline-none focus:bg-white focus:border-indigo-400 transition-all resize-y'
                  />
                </div>
              ))}
            </div>
          )}

          {/* Add Criterion Button */}
          {criteria.length > 0 && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={handleAddCriterion}
              className='w-full text-xs h-8 border-dashed border-slate-300 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30'
            >
              <Plus className='w-3.5 h-3.5 mr-1.5' />
              <span>Add Another Criterion</span>
            </Button>
          )}
        </div>
      ) : (
        /* Mode 2: Raw JSON Editor */
        <div className='space-y-1.5'>
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            placeholder='[\n  {\n    "name": "Criteria 1",\n    "weight": 20,\n    "description": "..."\n  }\n]'
            className='w-full min-h-[140px] max-h-[360px] rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all bg-slate-900 text-emerald-400'
          />
          <div className='flex items-center justify-between text-[11px] text-slate-400 px-1'>
            <span>Standard JSON format with name, weight, and description fields.</span>
            <button
              type='button'
              onClick={handleFormatJson}
              className='text-indigo-600 hover:underline font-medium'
            >
              Format JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
