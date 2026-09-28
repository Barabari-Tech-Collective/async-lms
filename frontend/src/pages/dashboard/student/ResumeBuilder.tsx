import { useState, useRef, useCallback } from 'react';
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
  Wand2,
  GripVertical,
  CheckSquare,
  Send,
  FileText,
  User,
  GraduationCap,
  Award,
  Maximize2,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import apiClient from '@/services/api';

import type { ResumeData, ATSResult, Section } from './resume/types';
import { DEFAULT_SECTIONS, calcLocalATS } from './resume/resumeUtils';
import { ResumeDocument } from './resume/ResumeDocument';
import { InputForm } from './resume/InputForm';
import type { InputFormValues } from './resume/InputForm';

// ── Score Bar ─────────────────────────────────────────────────────────────────

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
          className={cn(
            'h-full rounded-full transition-all duration-700',
            color,
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ── Sortable Section Item ─────────────────────────────────────────────────────

function SortableSectionItem({ section }: { section: Section }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });
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
  data: ResumeData;
  sections: Section[];
  onClose: () => void;
}) {
  return (
    <div className='fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col'>
        <div className='flex items-center justify-between px-6 py-3 border-b border-slate-100'>
          <span className='font-semibold text-[#1e2653]'>Full Preview</span>
          <button
            onClick={onClose}
            className='text-slate-400 hover:text-slate-600'
          >
            <X size={20} />
          </button>
        </div>
        <div className='overflow-y-auto flex-1 p-10'>
          <ResumeDocument data={data} sections={sections} />
        </div>
      </div>
    </div>
  );
}

// ── Action Button ─────────────────────────────────────────────────────────────

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className='flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 shadow-2xs'
    >
      {icon}
      <span className='hidden sm:inline font-medium'>{label}</span>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const EMPTY_FORM: InputFormValues = {
  jobTitle: '',
  phone: '',
  location: '',
  linkedin: '',
  careerObjective: '',
  extraSkills: [''],
  workExperience: [],
};

export default function ResumeBuilder() {
  const [formValues, setFormValues] = useState<InputFormValues>(EMPTY_FORM);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [atsResult, setAtsResult] = useState<ATSResult | null>(null);
  const [jdText, setJdText] = useState('');
  const [jdLoading, setJdLoading] = useState(false);
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [eligibilityError, setEligibilityError] = useState<{ message: string; suggestion: any } | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);

  const handleExportPDF = useCallback(() => {
    if (!previewRef.current) return;
    const printId = 'resume-print-target';
    previewRef.current.id = printId;

    const style = document.createElement('style');
    style.id = 'resume-print-style';
    style.textContent = `
      @media print {
        body > *:not([data-resume-print-root]) { display: none !important; }
        [data-resume-print-root] { display: block !important; position: fixed; inset: 0; z-index: 99999; background: white; padding: 32px; overflow: visible; }
        [data-resume-print-root] * { visibility: visible !important; }
        @page { margin: 0.5in; }
      }
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-resume-print-root', '');
    wrapper.style.cssText = 'display:none';
    const clone = previewRef.current.cloneNode(true) as HTMLElement;
    // Strip interactive hover/edit styles for print
    clone.querySelectorAll('[title="Double-click to edit"]').forEach((el) => {
      (el as HTMLElement).removeAttribute('title');
    });
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    const cleanup = () => {
      document.getElementById('resume-print-style')?.remove();
      wrapper.remove();
      previewRef.current && (previewRef.current.id = '');
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id);
        const newIdx = prev.findIndex((s) => s.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }, []);

  const handleGenerate = async (values: InputFormValues) => {
    setLoading(true);
    setFormValues(values);
    try {
      const res = await apiClient.post('/assistant/resume', {
        careerObjective: values.careerObjective,
        extraSkills: values.extraSkills.filter(Boolean),
        workExperience: values.workExperience,
      });

      if (res.data.success === false && res.data.eligible === false) {
        setEligibilityError({ message: res.data.message, suggestion: res.data.suggestion });
        setShowForm(false);
        return;
      }

      setEligibilityError(null);
      const data = res.data.data as ResumeData;
      data.personalInfo = {
        ...data.personalInfo,
        phone: values.phone,
        location: values.location,
        linkedin: values.linkedin,
        title: values.jobTitle,
      };
      setResumeData(data);
      setAtsResult(null);
      setShowForm(false);
      toast.success('Resume generated!');
    } catch {
      toast.error('Failed to generate resume. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOptimizeJD = async () => {
    if (!resumeData) return toast.error('Generate your resume first.');
    if (!jdText.trim()) return toast.error('Paste a job description first.');
    setJdLoading(true);
    try {
      const res = await apiClient.post('/assistant/resume/optimize', {
        resumeData,
        jobDescription: jdText,
      });
      const result = res.data.data as ATSResult;
      setAtsResult(result);
      if (result.optimizedSummary) {
        setResumeData((prev) =>
          prev ? { ...prev, summary: result.optimizedSummary! } : prev,
        );
      }
      toast.success('Resume optimized for the JD!');
    } catch {
      toast.error('Optimization failed.');
    } finally {
      setJdLoading(false);
    }
  };

  const localATS = atsResult ?? calcLocalATS(resumeData);

  return (
    <div className='flex flex-col h-full bg-[#f7f8fc]'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-white border-b border-slate-100 shrink-0'>
        <div className='flex items-center justify-between gap-2'>
          <div>
            <h1 className='text-base sm:text-lg font-bold text-[#1e2653]'>Resume Workspace</h1>
            <p className='text-[11px] sm:text-xs text-slate-400 mt-0.5'>
              ATS-optimized resume builder with AI assistance
            </p>
          </div>

          {/* Quick Primary Button on Mobile */}
          <div className='sm:hidden shrink-0'>
            <button
              onClick={() => setShowForm(true)}
              className='flex items-center gap-1.5 bg-[#333d7c] hover:bg-[#1e2653] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-xs'
            >
              <Send size={12} />
              {resumeData ? 'Regenerate' : 'Build Resume'}
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className='flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 [&::-webkit-scrollbar]:hidden'>
          <button
            onClick={() => setShowForm(true)}
            className='hidden sm:flex items-center gap-1.5 sm:gap-2 bg-[#333d7c] hover:bg-[#1e2653] text-white text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg shrink-0 transition-colors shadow-xs'
          >
            <Send size={13} />
            {resumeData ? 'Regenerate' : 'Build Resume'}
          </button>

          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className='lg:hidden flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg shrink-0 transition-colors'
          >
            <SlidersHorizontal size={13} />
            ATS & Tools
          </button>

          {resumeData && (
            <>
              <ActionBtn
                icon={<Maximize2 size={14} />}
                label='Full Preview'
                onClick={() => setShowFullPreview(true)}
              />
              <ActionBtn
                icon={<CheckSquare size={14} />}
                label='ATS Score'
                onClick={() => setAtsResult(calcLocalATS(resumeData))}
              />
              <ActionBtn
                icon={<Download size={14} />}
                label='Download PDF'
                onClick={handleExportPDF}
              />
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className='flex flex-1 overflow-hidden relative'>
        {/* Mobile Backdrop */}
        {mobileSidebarOpen && (
          <div
            className='fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden'
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar */}
        <aside
          className={cn(
            'w-72 shrink-0 bg-white border-r border-slate-100 flex flex-col overflow-y-auto transition-transform duration-300 z-40',
            'fixed inset-y-0 left-0 lg:static lg:translate-x-0',
            mobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
          )}
        >
          <div className='flex items-center justify-between p-4 border-b border-slate-100 lg:hidden'>
            <span className='font-bold text-[#1e2653] text-sm'>ATS & AI Tools</span>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className='p-1 text-slate-400 hover:text-slate-600 rounded-lg'
            >
              <X size={18} />
            </button>
          </div>
          {/* ATS Score */}
          <div className='p-4 border-b border-slate-100'>
            <div className='flex items-center justify-between mb-3'>
              <span className='text-xs font-semibold text-slate-700'>
                ATS Score
              </span>
              <div className='flex items-baseline gap-1'>
                <span className='text-2xl font-black text-[#333d7c]'>
                  {localATS.atsScore}
                </span>
                <span className='text-xs text-slate-400'>/100</span>
              </div>
            </div>
            <ScoreBar
              label='Keyword match'
              value={localATS.keywordMatch}
              color='bg-blue-400'
            />
            <ScoreBar
              label='Content quality'
              value={localATS.contentQuality}
              color='bg-emerald-400'
            />
            <ScoreBar
              label='Formatting'
              value={localATS.formatting}
              color='bg-green-400'
            />

            {atsResult?.suggestions?.length ||
            atsResult?.missingKeywords?.length ? (
              <div className='mt-3 space-y-1.5'>
                {atsResult.missingKeywords.slice(0, 2).map((kw, i) => (
                  <div
                    key={i}
                    className='flex items-start gap-2 text-[11px] text-amber-700'
                  >
                    <span className='mt-1 w-2 h-2 rounded-full bg-amber-400 shrink-0' />
                    Add keyword: <span className='font-semibold'>{kw}</span>
                  </div>
                ))}
                {atsResult.suggestions.slice(0, 2).map((s, i) => (
                  <div
                    key={i}
                    className='flex items-start gap-2 text-[11px] text-amber-700'
                  >
                    <span className='mt-1 w-2 h-2 rounded-full bg-amber-400 shrink-0' />
                    {s}
                  </div>
                ))}
              </div>
            ) : resumeData ? (
              <div className='mt-3'>
                <div className='flex items-start gap-2 text-[11px] text-amber-700'>
                  <span className='mt-1 w-2 h-2 rounded-full bg-amber-400 shrink-0' />
                  Paste a JD below to get tailored suggestions
                </div>
              </div>
            ) : null}
          </div>

          {/* AI Tools */}
          <div className='p-4 border-b border-slate-100'>
            <div className='flex items-center gap-1.5 mb-3'>
              <Wand2 size={13} className='text-[#333d7c]' />
              <span className='text-xs font-semibold text-slate-700'>
                AI Tools
              </span>
            </div>
            <label className='text-[11px] text-slate-500 mb-1 block'>
              Job Description
            </label>
            <textarea
              className='w-full border border-slate-200 rounded-lg px-2.5 py-2 text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20 min-h-22.5'
              placeholder='Paste job description here...'
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
            />
            <button
              onClick={handleOptimizeJD}
              disabled={jdLoading || !jdText.trim()}
              className='mt-2 w-full flex items-center justify-center gap-2 bg-[#333d7c] hover:bg-[#1e2653] text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50 transition-colors'
            >
              {jdLoading ? (
                <Loader2 size={13} className='animate-spin' />
              ) : (
                <Wand2 size={13} />
              )}
              Optimize with JD
            </button>
          </div>

          {/* Sections */}
          <div className='p-4 flex-1'>
            <div className='flex items-center justify-between mb-2'>
              <span className='text-xs font-semibold text-slate-700'>
                Sections
              </span>
              <span className='text-[10px] text-slate-400'>
                Drag to reorder
              </span>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sections.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className='space-y-0.5'>
                  {sections.map((section) => (
                    <SortableSectionItem key={section.id} section={section} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </aside>

        {/* Resume Canvas */}
        <main className='flex-1 overflow-y-auto p-3.5 sm:p-6 md:p-8'>
          {eligibilityError ? (
            <div className='max-w-3xl mx-auto bg-white shadow-sm rounded-lg p-6 sm:p-10 min-h-[360px] flex flex-col items-center justify-center border border-slate-100'>
              <div className='w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-50 flex items-center justify-center mb-4 sm:mb-5'>
                <X size={32} className='text-red-500' />
              </div>
              <h2 className='text-lg sm:text-xl font-bold text-[#1e2653] mb-2 text-center'>
                {eligibilityError.message}
              </h2>
              {typeof eligibilityError.suggestion === 'string' ? (
                <p className='text-xs sm:text-sm text-slate-500 text-center max-w-md mb-6 sm:mb-8 mt-2'>
                  {eligibilityError.suggestion}
                </p>
              ) : (
                <div className='w-full max-w-md mt-4 sm:mt-6'>
                  <h3 className='text-xs sm:text-sm font-semibold text-slate-700 mb-3 text-center'>Underperforming Projects</h3>
                  <div className='space-y-2.5 sm:space-y-3'>
                    {eligibilityError.suggestion.map((proj: any, idx: number) => (
                      <div key={idx} className='flex justify-between items-center p-2.5 sm:p-3 bg-slate-50 rounded-lg border border-slate-100'>
                        <span className='font-medium text-slate-700 text-xs sm:text-sm truncate pr-2'>{proj.name}</span>
                        <span className='text-[10px] sm:text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded-md shrink-0'>{proj.needed}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={() => setEligibilityError(null)}
                className='mt-6 sm:mt-8 flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm transition-colors'
              >
                Go Back
              </button>
            </div>
          ) : resumeData ? (
            <div
              className='max-w-3xl mx-auto bg-white shadow-sm rounded-lg p-4 sm:p-8 md:p-10 min-h-225 overflow-x-auto'
              ref={previewRef}
            >
              <ResumeDocument
                data={resumeData}
                sections={sections}
                onUpdate={setResumeData}
              />
            </div>
          ) : (
            <div className='max-w-3xl mx-auto flex flex-col items-center justify-center p-2 sm:p-4 my-auto py-4 sm:py-8'>
              <div className='w-12 h-12 sm:w-20 sm:h-20 rounded-full bg-[#eef0fb] flex items-center justify-center mb-3 sm:mb-5'>
                <FileText size={24} className='text-[#333d7c] sm:w-8 sm:h-8' />
              </div>
              <h2 className='text-base sm:text-xl font-bold text-[#1e2653] mb-1.5 sm:mb-2 text-center'>
                Start building your resume
              </h2>
              <p className='text-xs sm:text-sm text-slate-400 text-center max-w-sm mb-4 sm:mb-8 leading-relaxed'>
                Your profile, course completions, and earned badges will be
                auto-fetched. Add a few extra details and let AI do the rest.
              </p>
              <div className='grid grid-cols-3 gap-2 sm:gap-4 mb-5 sm:mb-8 w-full max-w-lg'>
                {[
                  {
                    icon: <User size={16} className='text-[#333d7c] sm:w-[18px] sm:h-[18px]' />,
                    text: 'Profile auto-fetched',
                  },
                  {
                    icon: (
                      <GraduationCap size={16} className='text-[#333d7c] sm:w-[18px] sm:h-[18px]' />
                    ),
                    text: 'Courses & skills detected',
                  },
                  {
                    icon: <Award size={16} className='text-[#333d7c] sm:w-[18px] sm:h-[18px]' />,
                    text: 'Badges included',
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className='bg-white rounded-xl p-2.5 sm:p-4 shadow-sm flex flex-col items-center gap-1.5 sm:gap-2 text-center border border-slate-100'
                  >
                    <div className='w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-[#eef0fb] flex items-center justify-center'>
                      {item.icon}
                    </div>
                    <span className='text-[10px] sm:text-xs text-slate-500 font-medium leading-tight'>{item.text}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowForm(true)}
                className='flex items-center justify-center gap-2 bg-[#333d7c] hover:bg-[#1e2653] text-white font-semibold px-6 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm transition-colors shadow-sm w-full sm:w-auto'
              >
                <Wand2 size={16} /> Build My Resume
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {showForm && (
        <InputForm
          initialValues={formValues}
          onSubmit={handleGenerate}
          loading={loading}
          onClose={() => setShowForm(false)}
        />
      )}

      {showFullPreview && resumeData && (
        <FullPreviewModal
          data={resumeData}
          sections={sections}
          onClose={() => setShowFullPreview(false)}
        />
      )}
    </div>
  );
}
