import { useState } from 'react';
import {
  Check,
  X,
  Eye,
  Palette,
} from 'lucide-react';
import { RESUME_TEMPLATES } from '../templateRegistry';
import { TemplateQuickPreviewModal } from './TemplateQuickPreviewModal';
import { A4ScaledDocumentThumbnail } from './A4ScaledDocumentThumbnail';

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
                <Palette size={16} className='text-[#333d7c]' />
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
                  {/* Miniature Real Document Sheet - Google Docs Style */}
                  <div className='h-52 p-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-center relative overflow-hidden'>
                    <div className='rounded-[2px] border border-slate-300 shadow-xs overflow-hidden bg-white group-hover:border-[#1a73e8] transition-colors'>
                      <A4ScaledDocumentThumbnail
                        templateId={tpl.id}
                        width={132}
                        height={186}
                      />
                    </div>
                    {/* Action buttons */}
                    <div className='absolute top-2 right-2 flex items-center gap-1.5'>
                      <button
                        type='button'
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewTemplateId(tpl.id);
                        }}
                        className='px-2 py-1 rounded text-[10px] font-semibold bg-white/95 hover:bg-white text-slate-700 hover:text-[#1e2653] shadow-xs border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer'
                        title='Quick Preview full sheet'
                      >
                        <Eye size={11} />
                        <span>Preview</span>
                      </button>
                      {isSelected && (
                        <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#333d7c] text-white shadow-2xs'>
                          <Check size={11} />
                          Active
                        </span>
                      )}
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
