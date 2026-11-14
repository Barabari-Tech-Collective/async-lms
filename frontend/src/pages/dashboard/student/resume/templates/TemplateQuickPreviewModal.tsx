import React, { useMemo } from 'react';
import { X, ArrowRight, FileCheck } from 'lucide-react';
import { RESUME_TEMPLATES } from '../templateRegistry';
import { SAMPLE_RESUME_DOC } from '../sampleResumeData';
import { TemplateRenderer } from './TemplateRenderer';
import type { ResumeDocument } from '../types';

interface TemplateQuickPreviewModalProps {
  isOpen: boolean;
  templateId: string | null;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
}

export const TemplateQuickPreviewModal: React.FC<TemplateQuickPreviewModalProps> = ({
  isOpen,
  templateId,
  onClose,
  onSelectTemplate,
}) => {
  const currentTemplate = useMemo(() => {
    if (!templateId) return RESUME_TEMPLATES[0];
    return RESUME_TEMPLATES.find((t) => t.id === templateId) || RESUME_TEMPLATES[0];
  }, [templateId]);

  const sampleDocForTemplate: ResumeDocument = useMemo(() => {
    return {
      ...SAMPLE_RESUME_DOC,
      templateId: currentTemplate.id,
    };
  }, [currentTemplate.id]);

  if (!isOpen || !templateId) return null;

  return (
    <div
      className='fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in-50'
      onClick={onClose}
    >
      <div
        className='relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar: Clean & Minimalist */}
        <div className='flex items-center justify-between px-5 sm:px-7 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50/95 shrink-0'>
          {/* Left: Template Name & Highlights */}
          <div className='flex items-center gap-3 min-w-0'>
            <div
              className='w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0'
              style={{ backgroundColor: currentTemplate.accentColor }}
            >
              <FileCheck size={20} />
            </div>
            <div className='min-w-0'>
              <div className='flex items-center gap-2 flex-wrap'>
                <h3 className='font-bold text-slate-900 text-base sm:text-lg truncate'>
                  {currentTemplate.name}
                </h3>
                <span className='px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                  98% ATS Score
                </span>
                <span className='hidden md:inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-blue-50 text-blue-700 border border-blue-200'>
                  Single A4 Page
                </span>
              </div>
              <p className='text-xs text-slate-500 truncate mt-0.5'>
                {currentTemplate.headline}
              </p>
            </div>
          </div>

          {/* Right: Primary "Use This Template" Action & Close Button */}
          <div className='flex items-center gap-2 shrink-0 ml-3'>
            <button
              type='button'
              onClick={() => {
                onSelectTemplate(currentTemplate.id);
                onClose();
              }}
              className='inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 bg-[#1e2653] hover:bg-[#252d5e] text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer'
            >
              <span>Use This Template</span>
              <ArrowRight size={15} />
            </button>
            <button
              type='button'
              onClick={onClose}
              className='p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/80 transition-colors cursor-pointer'
              aria-label='Close preview'
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body: Centered A4 Resume Canvas (No Clutter, No Sidebars) */}
        <div className='flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center items-start bg-slate-100/90 custom-scrollbar'>
          <div
            className='bg-white shadow-2xl rounded-sm border border-slate-300 w-full max-w-[720px] p-6 sm:p-10 select-none my-1'
            style={{ minHeight: '900px' }}
          >
            <TemplateRenderer
              data={sampleDocForTemplate}
              readOnly={true}
              onTriggerRewrite={() => {}}
              rewritingKey={null}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
