import { useState } from 'react';
import {
  Check,
  X,
  Zap,
  Eye,
} from 'lucide-react';
import { RESUME_TEMPLATES } from '../templateRegistry';
import { TemplateQuickPreviewModal } from './TemplateQuickPreviewModal';

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
}

export function TemplateModal({
  isOpen,
  onClose,
  currentTemplateId,
  onSelectTemplate,
}: TemplateModalProps) {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filters: { id: string; label: string; count: number }[] = [
    { id: 'all', label: 'All Templates', count: RESUME_TEMPLATES.length },
    {
      id: 'Full-Stack & Web Dev',
      label: 'Full-Stack & Tech',
      count: RESUME_TEMPLATES.filter((t) => t.recommendedFor === 'Full-Stack & Web Dev').length,
    },
    {
      id: 'Data Science & AI',
      label: 'Data Science & AI',
      count: RESUME_TEMPLATES.filter((t) => t.recommendedFor === 'Data Science & AI').length,
    },
    {
      id: 'Excel & Business Intelligence',
      label: 'Excel & Business',
      count: RESUME_TEMPLATES.filter((t) => t.recommendedFor === 'Excel & Business Intelligence').length,
    },
    {
      id: 'Campus Fresher & Internships',
      label: 'Fresher & Campus',
      count: RESUME_TEMPLATES.filter((t) => t.recommendedFor === 'Campus Fresher & Internships').length,
    },
    {
      id: 'Executive & Management',
      label: 'Executive & Serif',
      count: RESUME_TEMPLATES.filter((t) => t.recommendedFor === 'Executive & Management').length,
    },
    {
      id: 'Design & Creative',
      label: 'Design & Frontend',
      count: RESUME_TEMPLATES.filter((t) => t.recommendedFor === 'Design & Creative').length,
    },
  ];

  const filteredTemplates = RESUME_TEMPLATES.filter((tpl) => {
    if (activeFilter === 'all') return true;
    return tpl.recommendedFor === activeFilter;
  });

  return (
    <div className='fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in-50'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden'>
        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70'>
          <div>
            <div className='flex items-center gap-2'>
              <div className='w-8 h-8 rounded-lg bg-[#333d7c]/10 text-[#333d7c] flex items-center justify-center font-bold'>
                🎨
              </div>
              <div>
                <h2 className='font-bold text-[#1e2653] text-base sm:text-lg'>
                  Select Resume Template (CodeGuru Collection)
                </h2>
                <p className='text-xs text-slate-500'>
                  11 curated, placement-proven templates. Switch anytime without losing any content or progress.
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className='p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors'
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className='flex items-center gap-1.5 px-6 py-2.5 bg-white border-b border-slate-100 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeFilter === f.id
                  ? 'bg-[#333d7c] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {/* Template Cards Grid */}
        <div className='overflow-y-auto flex-1 p-6 bg-slate-50/50'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'>
            {filteredTemplates.map((tpl) => {
              const isSelected = Boolean(currentTemplateId) && currentTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => {
                    onSelectTemplate(tpl.id);
                    onClose();
                  }}
                  className={`group relative rounded-xl border-2 transition-all cursor-pointer flex flex-col bg-white overflow-hidden shadow-xs hover:shadow-md ${
                    isSelected
                      ? 'border-[#333d7c] ring-2 ring-[#333d7c]/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Miniature Visual Layout Mockup */}
                  <div
                    className='h-32 p-3 border-b flex flex-col justify-between transition-colors'
                    style={{
                      backgroundColor:
                        tpl.layoutType === 'two-column-sidebar'
                          ? '#f8fafc'
                          : tpl.id === 'executive-serif'
                          ? '#fafaf9'
                          : tpl.id === 'editorial-rule'
                          ? '#fefce8'
                          : '#f1f5f9',
                    }}
                  >
                    {/* Top bar indicators */}
                    <div className='flex items-center justify-between'>
                      <span className='px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/90 text-slate-700 shadow-2xs'>
                        {tpl.name}
                      </span>
                      <div className='flex items-center gap-1.5'>
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewTemplateId(tpl.id);
                          }}
                          className='px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/90 hover:bg-white text-slate-700 hover:text-[#1e2653] shadow-2xs transition-colors inline-flex items-center gap-1'
                          title='Quick Preview full sheet'
                        >
                          <Eye size={11} />
                          <span>Preview</span>
                        </button>
                        {isSelected ? (
                          <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#333d7c] text-white shadow-2xs'>
                            <Check size={11} />
                            Active
                          </span>
                        ) : tpl.popular ? (
                          <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-500 text-white shadow-2xs'>
                            <Zap size={10} />
                            Popular
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Miniature Wireframe */}
                    <div className='bg-white rounded-md border border-slate-200/80 p-2 shadow-2xs flex-1 my-1.5 flex gap-2 overflow-hidden text-[6px] select-none'>
                      {tpl.layoutType === 'two-column-sidebar' ? (
                        <>
                          <div className='w-1/3 bg-[#1e2653] rounded p-1 flex flex-col gap-0.5 text-white'>
                            <div className='w-3.5 h-3.5 rounded-full bg-white/30 border border-white/50 mx-auto' />
                            <div className='text-center font-bold text-[5px] text-white/90 truncate'>Alex Chen</div>
                            <div className='w-full h-[0.5px] bg-white/30 my-0.5' />
                            <div className='text-[4.5px] font-bold text-white/80 uppercase'>Skills</div>
                            <div className='space-y-0.5'>
                              <div className='h-1 bg-white/40 rounded-xs w-full' />
                              <div className='h-1 bg-white/40 rounded-xs w-4/5' />
                            </div>
                          </div>
                          <div className='w-2/3 flex flex-col gap-0.5 py-0.5'>
                            <div className='font-bold text-[6px] text-slate-800 border-b border-slate-200 pb-0.5'>
                              PROJECTS
                            </div>
                            <div className='font-semibold text-[5.5px] text-slate-700 flex justify-between'>
                              <span>CodeGuru LMS</span>
                              <span className='text-[4.5px] text-slate-400'>2026</span>
                            </div>
                            <div className='h-1 bg-slate-200 rounded-xs w-full' />
                            <div className='font-bold text-[6px] text-slate-800 border-b border-slate-200 pb-0.5 mt-0.5'>
                              EDUCATION
                            </div>
                            <div className='h-1 bg-slate-200 rounded-xs w-4/5' />
                          </div>
                        </>
                      ) : tpl.layoutType === 'photo-centric' ? (
                        <div className='w-full flex flex-col gap-1'>
                          <div className='flex items-center gap-1.5 pb-0.5 border-b border-slate-100'>
                            <div className='w-4 h-4 rounded-full bg-teal-600 shrink-0 flex items-center justify-center text-[5px] font-bold text-white'>
                              AC
                            </div>
                            <div className='flex-1 min-w-0'>
                              <div className='font-bold text-[6.5px] text-slate-800 truncate'>Alex Chen</div>
                              <div className='text-[5px] text-teal-700 truncate'>Tech Consultant</div>
                            </div>
                          </div>
                          <div className='font-bold text-[5.5px] text-slate-800 uppercase tracking-wider'>
                            CAPSTONE & PROJECTS
                          </div>
                          <div className='h-1 bg-slate-200 rounded-xs w-full' />
                          <div className='h-1 bg-slate-200 rounded-xs w-4/5' />
                        </div>
                      ) : tpl.id === 'executive-serif' || tpl.id === 'ivy-standard' ? (
                        <div className='w-full flex flex-col items-center gap-0.5 font-serif'>
                          <div className='font-bold text-[7px] text-slate-900 uppercase tracking-wider'>
                            ALEX CHEN
                          </div>
                          <div className='text-[4.5px] text-slate-500'>Email • Phone • Location</div>
                          <div className='w-full border-b border-slate-800 my-0.5' />
                          <div className='w-full flex justify-between text-[5.5px] font-bold text-slate-800 border-b border-slate-200 pb-0.5'>
                            <span>EDUCATION</span>
                            <span className='font-normal text-[4.5px]'>2022-2026</span>
                          </div>
                          <div className='w-full flex justify-between text-[5.5px] font-bold text-slate-800 border-b border-slate-200 pb-0.5 mt-0.5'>
                            <span>PROJECTS</span>
                            <span className='font-normal text-[4.5px]'>CodeGuru</span>
                          </div>
                          <div className='h-1 bg-slate-200 rounded-xs w-full' />
                        </div>
                      ) : tpl.id === 'editorial-rule' ? (
                        <div className='w-full flex flex-col gap-0.5'>
                          <div className='w-full h-1 bg-amber-700 rounded-xs' />
                          <div className='font-bold text-[6.5px] text-slate-900'>Alex Chen</div>
                          <div className='bg-amber-50 border border-amber-200/60 rounded px-1 py-0.5 text-[4.5px] text-amber-900'>
                            Executive Summary: 40% performance improvement...
                          </div>
                          <div className='font-bold text-[5.5px] text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-0.5'>
                            KEY METRICS & PROJECTS
                          </div>
                          <div className='h-1 bg-slate-200 rounded-xs w-full' />
                        </div>
                      ) : (
                        <div className='w-full flex flex-col gap-0.5'>
                          <div className='flex justify-between items-baseline border-b pb-0.5' style={{ borderColor: `${tpl.accentColor}40` }}>
                            <div className='font-bold text-[6.5px] text-slate-900'>Alex Chen</div>
                            <div className='text-[4.5px] font-bold' style={{ color: tpl.accentColor }}>ATS 98%</div>
                          </div>
                          <div className='font-bold text-[5.5px] text-slate-800 uppercase tracking-wider'>
                            {tpl.id === 'first-job-fresh' ? 'EDUCATION & CAPSTONES' : 'SKILLS & PROJECTS'}
                          </div>
                          <div className='flex gap-0.5'>
                            {['React', 'Node.js', 'SQL'].map((s) => (
                              <span key={s} className='px-1 py-0.2 rounded-2xs text-[4.5px] bg-slate-100 border text-slate-700'>
                                {s}
                              </span>
                            ))}
                          </div>
                          <div className='h-1 bg-slate-200 rounded-xs w-full mt-0.5' />
                        </div>
                      )}
                    </div>

                    {/* Format style pill */}
                    <div className='flex items-center justify-between text-[10px] text-slate-500'>
                      <span className='font-medium'>{tpl.headline}</span>
                      <span
                        className='w-2.5 h-2.5 rounded-full border border-white'
                        style={{ backgroundColor: tpl.accentColor }}
                      />
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className='p-4 flex-1 flex flex-col justify-between'>
                    <div>
                      <div className='flex items-baseline justify-between mb-1'>
                        <h3 className='font-bold text-slate-900 text-sm group-hover:text-[#333d7c] transition-colors'>
                          {tpl.name}
                        </h3>
                        <span className='text-[10.5px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded'>
                          {tpl.badgeText}
                        </span>
                      </div>
                      <p className='text-xs text-slate-600 leading-relaxed mb-3'>
                        {tpl.description}
                      </p>
                    </div>

                    <div className='pt-2 border-t border-slate-100 flex items-center justify-between'>
                      <button
                        type='button'
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewTemplateId(tpl.id);
                        }}
                        className='inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#1e2653] hover:underline cursor-pointer'
                      >
                        <Eye size={12} />
                        <span>Quick View</span>
                      </button>
                      <button
                        type='button'
                        className={`text-xs font-bold px-3 py-1 rounded-md transition-colors ${
                          isSelected
                            ? 'bg-[#333d7c] text-white'
                            : 'bg-slate-100 text-slate-700 group-hover:bg-[#333d7c] group-hover:text-white'
                        }`}
                      >
                        {isSelected ? 'Applied' : 'Use Template'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className='px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500'>
          <span>
            Tip: You can switch templates anytime. All your projects, skills, and edits remain 100% saved.
          </span>
          <button
            onClick={onClose}
            className='px-4 py-1.5 font-bold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors'
          >
            Close
          </button>
        </div>
      </div>

      <TemplateQuickPreviewModal
        isOpen={Boolean(previewTemplateId)}
        templateId={previewTemplateId}
        onClose={() => setPreviewTemplateId(null)}
        onSelectTemplate={(templateId) => {
          onSelectTemplate(templateId);
          onClose();
        }}
      />
    </div>
  );
}
