import { useState, useRef, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Loader2,
  Download,
  GripVertical,
  Maximize2,
  X,
  SlidersHorizontal,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Search,
  LayoutTemplate,
  Palette,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import apiClient from '@/services/api';

import type { ResumeDocument as ResumeDocType, ResumeRecord, ResumeMatchResult, Section } from './resume/types';
import { DEFAULT_SECTIONS, createEmptyResume, calcLocalMatchAnalysis } from './resume/resumeUtils';
import { ResumeDocument } from './resume/ResumeDocument';
import { InputForm } from './resume/InputForm';
import { TemplateModal } from './resume/templates/TemplateModal';
import { getTemplateMeta, RESUME_TEMPLATES } from './resume/templateRegistry';

// ── Match Score Bar ───────────────────────────────────────────────────────────
function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className='mb-2'>
      <div className='flex justify-between text-[11px] text-slate-500 mb-1'>
        <span>{label}</span>
        <span className='font-semibold text-slate-700'>{value}%</span>
      </div>
      <div className='h-1.5 bg-slate-100 rounded-full overflow-hidden'>
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ── Sortable Section Item ─────────────────────────────────────────────────────
function SortableSectionItem({ section }: { section: Section }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const Icon = section.icon;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className='flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-600 group'
    >
      <button
        {...attributes}
        {...listeners}
        className='text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing'
      >
        <GripVertical size={14} />
      </button>
      <Icon size={14} className='text-slate-400' />
      <span className='flex-1 text-[13px] font-medium'>{section.label}</span>
      <div className='w-2 h-2 rounded-full bg-[#333d7c]' />
    </div>
  );
}

// ── Full Preview Modal ────────────────────────────────────────────────────────
function FullPreviewModal({
  data,
  sections,
  onClose,
}: {
  data: ResumeDocType;
  sections: Section[];
  onClose: () => void;
}) {
  return (
    <div className='fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-6'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden'>
        <div className='flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50'>
          <span className='font-bold text-[#1e2653] text-sm'>A4 Placement Format Preview</span>
          <button onClick={onClose} className='text-slate-400 hover:text-slate-600'>
            <X size={20} />
          </button>
        </div>
        <div className='overflow-y-auto flex-1 p-6 sm:p-10 bg-slate-100/50'>
          <div className='bg-white shadow-md rounded-xl overflow-hidden'>
            <ResumeDocument data={data} sections={sections} readOnly />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ResumeBuilder() {
  const [resumeRecord, setResumeRecord] = useState<ResumeRecord | null>(null);
  const [resumeDoc, setResumeDoc] = useState<ResumeDocType>(createEmptyResume());
  const [initialLoading, setInitialLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [matchResult, setMatchResult] = useState<ResumeMatchResult | null>(null);
  const [jdText, setJdText] = useState('');
  const [jdLoading, setJdLoading] = useState(false);
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'conflict' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [conflictData, setConflictData] = useState<{ currentVersion: number; currentResume: any } | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRecordRef = useRef<ResumeRecord | null>(null);
  const resumeDocRef = useRef<ResumeDocType>(resumeDoc);

  // Keep ref in sync with latest document
  resumeDocRef.current = resumeDoc;

  // 1. Initial Load: Fetch primary resume from PostgreSQL with local draft healing
  useEffect(() => {
    let isMounted = true;
    async function loadSavedResume() {
      try {
        const res = await apiClient.get('/assistant/resume');
        if (res.data?.success && isMounted) {
          if (res.data.data) {
            const record = res.data.data as ResumeRecord;
            let finalDoc = record.document;

            // HEAL AVATAR IF MISSING ON SERVER:
            // If the database record lacks an avatarUrl, check if localStorage preserved it
            const localSaved = localStorage.getItem('codeguru_resume_draft');
            if (localSaved && !finalDoc?.personalInfo?.avatarUrl) {
              try {
                const parsed = JSON.parse(localSaved);
                if (parsed?.document?.personalInfo?.avatarUrl) {
                  finalDoc = {
                    ...finalDoc,
                    personalInfo: {
                      ...finalDoc.personalInfo,
                      avatarUrl: parsed.document.personalInfo.avatarUrl,
                    },
                  };
                }
              } catch (e) {
                console.warn('Draft parse error:', e);
              }
            }

            setResumeRecord(record);
            resumeRecordRef.current = record;
            setResumeDoc(finalDoc);
            resumeDocRef.current = finalDoc;
            if (finalDoc.sectionOrder && Array.isArray(finalDoc.sectionOrder)) {
              setSections((prev) => {
                return [...prev].sort((a, b) => {
                  const idxA = finalDoc.sectionOrder!.indexOf(a.id);
                  const idxB = finalDoc.sectionOrder!.indexOf(b.id);
                  if (idxA === -1 && idxB === -1) return 0;
                  if (idxA === -1) return 1;
                  if (idxB === -1) return -1;
                  return idxA - idxB;
                });
              });
            }
            setSaveStatus('saved');
            setLastSavedAt(new Date(record.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            localStorage.setItem('codeguru_resume_draft', JSON.stringify({ version: record.version, document: finalDoc }));

            // If we restored an avatar that wasn't yet persisted in cloud, push autosave
            if (finalDoc.personalInfo?.avatarUrl && !record.document?.personalInfo?.avatarUrl) {
              triggerAutosave(finalDoc);
            }
          } else {
            // Check local storage draft
            const localSaved = localStorage.getItem('codeguru_resume_draft');
            if (localSaved) {
              try {
                const parsed = JSON.parse(localSaved);
                if (parsed.document) {
                  setResumeDoc(parsed.document);
                  resumeDocRef.current = parsed.document;
                  if (parsed.document.sectionOrder && Array.isArray(parsed.document.sectionOrder)) {
                    setSections((prev) => {
                      return [...prev].sort((a, b) => {
                        const idxA = parsed.document.sectionOrder!.indexOf(a.id);
                        const idxB = parsed.document.sectionOrder!.indexOf(b.id);
                        if (idxA === -1 && idxB === -1) return 0;
                        if (idxA === -1) return 1;
                        if (idxB === -1) return -1;
                        return idxA - idxB;
                      });
                    });
                  }
                  toast('Loaded recoverable draft from your device');
                }
              } catch {
                setShowWizard(true);
              }
            } else {
              setShowWizard(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load primary resume:', err);
        // Fallback to local draft on network/server error
        const localSaved = localStorage.getItem('codeguru_resume_draft');
        if (localSaved && isMounted) {
          try {
            const parsed = JSON.parse(localSaved);
            if (parsed.document) {
              setResumeDoc(parsed.document);
              resumeDocRef.current = parsed.document;
            }
          } catch {
            // ignore
          }
        }
        toast.error('Failed to connect to cloud storage. Using local draft.');
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    }
    loadSavedResume();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Autosave with Debounce & Version Sync
  const triggerAutosave = useCallback((newDoc: ResumeDocType) => {
    setSaveStatus('saving');
    resumeDocRef.current = newDoc;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      try {
        const currentRecord = resumeRecordRef.current;
        const payload = {
          title: currentRecord?.title || 'Primary Tech Resume',
          document: newDoc,
          expectedVersion: currentRecord?.version ?? null,
        };

        const res = await apiClient.put('/assistant/resume', payload);
        if (res.data?.success) {
          const savedRecord = res.data.data as ResumeRecord;
          setResumeRecord(savedRecord);
          resumeRecordRef.current = savedRecord;
          setSaveStatus('saved');
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setLastSavedAt(timeStr);
          localStorage.setItem(
            'codeguru_resume_draft',
            JSON.stringify({ version: savedRecord.version, document: savedRecord.document })
          );
        }
      } catch (err: any) {
        if (err.response?.status === 409) {
          setSaveStatus('conflict');
          setConflictData({
            currentVersion: err.response.data?.currentVersion,
            currentResume: err.response.data?.currentResume,
          });
          toast.error('Draft conflict: Updated in another window.');
        } else {
          setSaveStatus('error');
          // Ensure local storage preserves it
          localStorage.setItem('codeguru_resume_draft', JSON.stringify({ document: newDoc }));
        }
      }
    }, 700);
  }, []);

  const handleUpdateDocument = useCallback(
    (updated: ResumeDocType) => {
      setResumeDoc(updated);
      resumeDocRef.current = updated;
      triggerAutosave(updated);
    },
    [triggerAutosave]
  );

  const handleSwitchTemplate = useCallback(
    (newTemplateId: string) => {
      const currentDoc = resumeDocRef.current;
      const updated = { ...currentDoc, templateId: newTemplateId };
      handleUpdateDocument(updated);
      const meta = getTemplateMeta(newTemplateId);
      toast.success(`Switched to "${meta.name}" (${meta.recommendedFor})`);
    },
    [handleUpdateDocument]
  );

  // Overwrite server conflict with local changes
  const handleResolveOverwrite = async () => {
    if (!conflictData) return;
    try {
      setSaveStatus('saving');
      const payload = {
        title: resumeRecord?.title || 'Primary Tech Resume',
        document: resumeDoc,
        expectedVersion: conflictData.currentVersion,
      };
      const res = await apiClient.put('/assistant/resume', payload);
      if (res.data?.success) {
        const saved = res.data.data;
        setResumeRecord(saved);
        resumeRecordRef.current = saved;
        setSaveStatus('saved');
        setConflictData(null);
        toast.success('Synced your edits to cloud');
      }
    } catch {
      toast.error('Failed to resolve conflict.');
    }
  };

  // Discard local and load server version
  const handleResolveLoadServer = () => {
    if (!conflictData?.currentResume?.document) return;
    const serverDoc = conflictData.currentResume.document;
    setResumeDoc(serverDoc);
    resumeDocRef.current = serverDoc;
    setResumeRecord(conflictData.currentResume);
    resumeRecordRef.current = conflictData.currentResume;
    setConflictData(null);
    setSaveStatus('saved');
    toast.success('Loaded latest server version');
  };

  const handleGenerateWithAI = async (intakeValues: any) => {
    setGenerating(true);
    try {
      const res = await apiClient.post('/assistant/resume/generate', intakeValues);
      if (res.data?.success && res.data?.data) {
        const generated = res.data.data as ResumeDocType;
        if (intakeValues.personalInfo) {
          generated.personalInfo = {
            ...generated.personalInfo,
            ...intakeValues.personalInfo,
            links: intakeValues.personalInfo.links?.length
              ? intakeValues.personalInfo.links
              : generated.personalInfo.links,
          };
        }
        setResumeDoc(generated);
        resumeDocRef.current = generated;
        setShowWizard(false);
        triggerAutosave(generated);
        toast.success('Professional resume generated and saved!');
      }
    } catch {
      toast.error('AI generation encountered an issue. You can continue editing manually.');
    } finally {
      setGenerating(false);
    }
  };

  // Job Match Analysis
  const handleAnalyzeJD = async () => {
    if (!jdText.trim()) return toast.error('Paste a job description first.');
    setJdLoading(true);
    try {
      const res = await apiClient.post('/assistant/resume/optimize', {
        resumeData: resumeDoc,
        jobDescription: jdText,
      });
      if (res.data?.success) {
        setMatchResult(res.data.data as ResumeMatchResult);
        toast.success('Match analysis complete!');
      }
    } catch {
      toast.error('Failed to analyze match. Try again.');
    } finally {
      setJdLoading(false);
    }
  };

  // First-Class Pixel-Perfect A4 PDF Export (Matching FlowCV Standard)
  const handleExportPDF = useCallback(() => {
    if (!previewRef.current) return;

    const style = document.createElement('style');
    style.id = 'resume-print-style';
    style.textContent = `
      @page {
        size: A4 portrait;
        margin: 0;
      }
      @media print {
        html, body {
          width: 210mm !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not([data-resume-print-root]) {
          display: none !important;
        }
        [data-resume-print-root] {
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        /* Strip outer container card borders, rounded corners, and shadows */
        [data-resume-print-root] > div {
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          margin: 0 !important;
          width: 210mm !important;
          max-width: 210mm !important;
          box-sizing: border-box !important;
        }
        /* Force template container to fit exact A4 width */
        [data-resume-print-root] [class*="max-w-"] {
          max-width: 210mm !important;
          width: 210mm !important;
          margin: 0 !important;
          border-left: none !important;
          border-right: none !important;
          border-bottom: none !important;
          box-shadow: none !important;
          box-sizing: border-box !important;
        }
        [data-resume-print-root] [class*="shadow-"] {
          box-shadow: none !important;
        }
        /* Preserve Atlantic Blue two-column sidebar layout in print */
        [data-resume-print-root] .grid.grid-cols-12 {
          display: grid !important;
          grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
          width: 100% !important;
        }
        /* Ensure headers preserve side-by-side flex alignment */
        [data-resume-print-root] header .flex-row {
          flex-direction: row !important;
        }
        /* Page break rules: avoid splitting individual project, education, or skill items */
        .page-break-inside-avoid {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        h1, h2, h3, h4 {
          break-after: avoid !important;
          page-break-after: avoid !important;
        }
        /* Hide interactive edit icons, toolbars, and buttons in print */
        .print\\:hidden,
        button,
        [title="Change profile photo"],
        [title="Double-click to edit"] {
          display: none !important;
        }
        a {
          text-decoration: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-resume-print-root', '');
    wrapper.style.cssText = 'display:none';
    const clone = previewRef.current.cloneNode(true) as HTMLElement;

    // Strip interactive buttons, wands, and title attributes
    clone.querySelectorAll('.print\\:hidden, button, [title="Change profile photo"]').forEach((el) => {
      el.remove();
    });
    clone.querySelectorAll('[title]').forEach((el) => {
      (el as HTMLElement).removeAttribute('title');
    });

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    const cleanup = () => {
      document.getElementById('resume-print-style')?.remove();
      wrapper.remove();
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id);
        const newIdx = prev.findIndex((s) => s.id === over.id);
        const next = arrayMove(prev, oldIdx, newIdx);
        const nextOrder = next.map((s) => s.id);
        setResumeDoc((prevDoc) => {
          const updated = { ...prevDoc, sectionOrder: nextOrder };
          triggerAutosave(updated);
          return updated;
        });
        return next;
      });
    }
  }, [triggerAutosave]);

  const localScore = calcLocalMatchAnalysis(resumeDoc);
  const currentTemplateMeta = getTemplateMeta(resumeDoc.templateId);

  if (initialLoading) {
    return (
      <div className='min-h-[70vh] flex flex-col items-center justify-center gap-3'>
        <Loader2 size={32} className='animate-spin text-[#333d7c]' />
        <p className='text-sm text-slate-500 font-medium'>Loading your verified resume workspace...</p>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-slate-100 flex flex-col'>
      {/* ── TOP HEADER / TOOLBAR ─────────────────────────────────────────── */}
      <header className='bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-2xs'>
        <div className='flex items-center gap-3'>
          <div>
            <div className='flex items-center gap-2'>
              <h1 className='text-base sm:text-lg font-bold text-slate-900'>CodeGuru Placement Resume</h1>
              <span className='hidden sm:inline px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200'>
                FlowCV Standard
              </span>
            </div>
            <div className='flex items-center gap-2 text-xs text-slate-500'>
              {/* Concurrency & Autosave Status Indicator */}
              {saveStatus === 'saving' && (
                <span className='inline-flex items-center gap-1 text-amber-600 font-medium'>
                  <Cloud size={13} className='animate-pulse' />
                  <span>Saving...</span>
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className='inline-flex items-center gap-1 text-emerald-600 font-medium'>
                  <CheckCircle2 size={13} />
                  <span>Saved {lastSavedAt ? `at ${lastSavedAt}` : 'to Cloud'} (v{resumeRecord?.version || 1})</span>
                </span>
              )}
              {saveStatus === 'conflict' && (
                <span className='inline-flex items-center gap-1 text-red-600 font-bold'>
                  <AlertTriangle size={13} />
                  <span>Conflict detected</span>
                </span>
              )}
              {saveStatus === 'error' && (
                <span className='inline-flex items-center gap-1 text-slate-500'>
                  <RotateCcw size={13} />
                  <span>Cached locally</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className='flex items-center gap-2'>
          <button
            onClick={() => setShowTemplateModal(true)}
            className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs'
            title='Browse & Switch Template (10 Available)'
          >
            <LayoutTemplate size={14} className='text-[#333d7c]' />
            <span className='hidden sm:inline'>Template:</span>
            <span className='font-bold text-[#333d7c]'>{currentTemplateMeta.name}</span>
          </button>

          <button
            onClick={() => setShowWizard(true)}
            className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs'
          >
            <SlidersHorizontal size={14} />
            <span>Intake Wizard</span>
          </button>

          <button
            onClick={() => setShowFullPreview(true)}
            className='hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs'
          >
            <Maximize2 size={14} />
            <span>Preview</span>
          </button>

          <button
            onClick={handleExportPDF}
            className='inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-bold bg-[#333d7c] text-white rounded-lg hover:bg-[#252d5e] transition-colors shadow-sm'
          >
            <Download size={14} />
            <span>Export PDF</span>
          </button>
        </div>
      </header>

      {/* ── CONFLICT BANNER (Issue 3: Autosave Conflict Handling) ───────────── */}
      {conflictData && (
        <div className='bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between text-xs text-red-900'>
          <div className='flex items-center gap-2'>
            <AlertTriangle size={16} className='text-red-600 shrink-0' />
            <span>
              <strong>Autosave Conflict:</strong> This resume was edited in another tab or device (Server version: v
              {conflictData.currentVersion}). How would you like to proceed?
            </span>
          </div>
          <div className='flex items-center gap-2'>
            <button
              onClick={handleResolveOverwrite}
              className='px-3 py-1 font-bold bg-red-600 text-white rounded hover:bg-red-700 transition-colors'
            >
              Overwrite Server with My Draft
            </button>
            <button
              onClick={handleResolveLoadServer}
              className='px-3 py-1 font-bold bg-white text-slate-700 border border-slate-300 rounded hover:bg-slate-50 transition-colors'
            >
              Load Server Version
            </button>
          </div>
        </div>
      )}

      {/* ── MAIN WORKSPACE ─────────────────────────────────────────────────── */}
      <div className='flex-1 flex overflow-hidden'>
        {/* LEFT SIDEBAR: Structure & Match Analysis */}
        <aside className='w-80 bg-white border-r border-slate-200 p-5 overflow-y-auto hidden lg:flex flex-col gap-6 shrink-0'>
          {/* Section 1: Placement Readiness Score */}
          <div className='p-4 bg-slate-50 rounded-xl border border-slate-200'>
            <div className='flex items-center justify-between mb-3'>
              <span className='text-xs font-bold text-slate-900 uppercase tracking-wide'>
                Placement Readiness
              </span>
              <span className='text-xs font-black text-[#333d7c]'>{localScore.matchPercentage}%</span>
            </div>
            <ScoreBar
              label='Profile Completeness'
              value={localScore.matchPercentage}
              color={localScore.matchPercentage >= 75 ? 'bg-emerald-500' : 'bg-[#333d7c]'}
            />
            {localScore.readabilityTips.length > 0 && (
              <p className='text-[11px] text-slate-500 mt-2 leading-relaxed'>
                💡 {localScore.readabilityTips[0]}
              </p>
            )}
          </div>

          {/* Section 2: Reorder Sections */}
          <div>
            <h2 className='text-xs font-bold text-slate-900 uppercase tracking-wide mb-2'>
              Reorder Resume Sections
            </h2>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className='space-y-1'>
                  {sections.map((sec) => (
                    <SortableSectionItem key={sec.id} section={sec} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Section 3: Job Description Match Analysis */}
          <div className='border-t border-slate-200 pt-5 space-y-3'>
            <div className='flex items-center gap-1.5'>
              <Search size={14} className='text-[#333d7c]' />
              <h2 className='text-xs font-bold text-slate-900 uppercase tracking-wide'>
                Job Description Match
              </h2>
            </div>
            <p className='text-[11px] text-slate-500 leading-relaxed'>
              Paste a job description to discover matching keywords and recommendations.
            </p>
            <textarea
              rows={3}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder='Paste JD requirements here...'
              className='w-full border border-slate-200 rounded-lg p-2.5 text-xs bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-[#333d7c]'
            />
            <button
              onClick={handleAnalyzeJD}
              disabled={jdLoading || !jdText.trim()}
              className='w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-[#333d7c] text-white rounded-lg hover:bg-[#252d5e] transition-colors disabled:opacity-50'
            >
              {jdLoading ? <Loader2 size={13} className='animate-spin' /> : <Sparkles size={13} />}
              <span>Analyze Match</span>
            </button>

            {matchResult && (
              <div className='p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2.5 text-xs animate-in fade-in-50'>
                <div className='flex items-center justify-between font-bold text-indigo-950'>
                  <span>Keyword Match</span>
                  <span>{matchResult.matchPercentage}%</span>
                </div>
                {matchResult.matchedKeywords?.length > 0 && (
                  <div>
                    <span className='font-semibold text-emerald-800 text-[11px] block mb-1'>
                      Matched Skills:
                    </span>
                    <div className='flex flex-wrap gap-1'>
                      {matchResult.matchedKeywords.map((k, i) => (
                        <span
                          key={i}
                          className='px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-medium'
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {matchResult.missingKeywords?.length > 0 && (
                  <div>
                    <span className='font-semibold text-amber-800 text-[11px] block mb-1'>
                      Missing from JD:
                    </span>
                    <div className='flex flex-wrap gap-1'>
                      {matchResult.missingKeywords.map((k, i) => (
                        <span
                          key={i}
                          className='px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-medium'
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER / PREVIEW: Live FlowCV Interactive Document */}
        <main className='flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center'>
          <div className='w-full max-w-[850px]'>
            {/* Quick Template Switcher Strip */}
            <div className='mb-3 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2 text-xs'>
              <div className='flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5'>
                <span className='font-bold text-slate-700 flex items-center gap-1 shrink-0'>
                  <Palette size={13} className='text-[#333d7c]' />
                  <span className='hidden sm:inline'>Templates:</span>
                </span>
                <div className='flex items-center gap-1'>
                  {RESUME_TEMPLATES.map((tpl) => {
                    const isSel = (resumeDoc.templateId || 'modern-mercury') === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => handleSwitchTemplate(tpl.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-all ${
                          isSel
                            ? 'bg-[#333d7c] text-white shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                        title={`${tpl.name} — ${tpl.recommendedFor}`}
                      >
                        {tpl.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setShowTemplateModal(true)}
                className='text-[11px] font-bold text-[#333d7c] hover:underline flex items-center gap-1 shrink-0 px-1'
              >
                Browse 10 Templates ↗
              </button>
            </div>

            <div className='mb-2 flex items-center justify-between text-xs text-slate-500 px-1'>
              <span>Double-click any text in the resume to edit directly</span>
              <span className='text-[11px] text-slate-400'>
                {currentTemplateMeta.name} · {currentTemplateMeta.headline}
              </span>
            </div>

            <div
              ref={previewRef}
              className='bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden'
            >
              <ResumeDocument data={resumeDoc} sections={sections} onUpdate={handleUpdateDocument} />
            </div>
          </div>
        </main>
      </div>

      {/* ── 6-STEP INTAKE WIZARD MODAL ─────────────────────────────────────── */}
      {showWizard && (
        <InputForm
          initialDocument={resumeDoc}
          onComplete={(doc) => {
            setResumeDoc(doc);
            triggerAutosave(doc);
            setShowWizard(false);
            toast.success('Resume updated!');
          }}
          onGenerateWithAI={handleGenerateWithAI}
          loading={generating}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* ── FULLSCREEN PREVIEW MODAL ───────────────────────────────────────── */}
      {showFullPreview && (
        <FullPreviewModal data={resumeDoc} sections={sections} onClose={() => setShowFullPreview(false)} />
      )}

      {/* ── 10 FLOWCV TEMPLATES SELECTION MODAL ────────────────────────────── */}
      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        currentTemplateId={resumeDoc.templateId || 'modern-mercury'}
        onSelectTemplate={handleSwitchTemplate}
      />
    </div>
  );
}
