import React from 'react';
import { Eye, Check } from 'lucide-react';
import type { ResumeTemplateMeta } from '../types';
import { A4ScaledDocumentThumbnail } from './A4ScaledDocumentThumbnail';

interface TemplateVisualCardProps {
  template: ResumeTemplateMeta;
  isSelected?: boolean;
  onSelect: (templateId: string) => void;
  onPreview: (templateId: string, e: React.MouseEvent) => void;
}

export const TemplateVisualCard: React.FC<TemplateVisualCardProps> = ({
  template,
  isSelected = false,
  onSelect,
  onPreview,
}) => {
  return (
    <div
      onClick={() => onSelect(template.id)}
      className='group relative flex flex-col shrink-0 cursor-pointer select-none text-left'
      style={{ width: '175px' }}
      role='button'
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(template.id);
        }
      }}
      aria-label={`Select ${template.name} template`}
    >
      {/* Miniature A4 Sheet Frame - Google Docs Style */}
      <div
        className={`relative w-[175px] h-[247px] bg-white rounded-[2px] border transition-all duration-200 overflow-hidden ${
          isSelected
            ? 'border-[#1e2653] ring-2 ring-[#1e2653] ring-offset-1 shadow-md'
            : 'border-slate-300 group-hover:border-[#1a73e8] group-hover:shadow-md shadow-xs'
        }`}
      >
        {/* Real Scaled A4 Document */}
        <A4ScaledDocumentThumbnail
          templateId={template.id}
          width={175}
          height={247}
        />

        {/* Hover Action Overlay with Quick Preview */}
        <div className='absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2'>
          <button
            type='button'
            onClick={(e) => onPreview(template.id, e)}
            className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-slate-900 font-semibold text-[11px] shadow-md hover:bg-slate-100 hover:scale-105 transition-all cursor-pointer'
          >
            <Eye size={13} strokeWidth={2.2} />
            <span>Preview</span>
          </button>
        </div>

        {/* Selected Check Indicator */}
        {isSelected && (
          <div className='absolute top-2 right-2 px-1.5 py-0.5 rounded-sm bg-[#1e2653] text-white text-[9px] font-bold shadow-md flex items-center gap-1'>
            <Check size={10} strokeWidth={3} />
            Active
          </div>
        )}
      </div>

      {/* Card Info Footer - Exact Google Docs 2-Line Hierarchy */}
      <div className='mt-2 flex flex-col text-left'>
        <span className='font-semibold text-xs text-slate-900 group-hover:text-[#1a73e8] transition-colors truncate'>
          Resume
        </span>
        <span className='text-xs text-slate-500 font-normal truncate mt-0.5'>
          {template.name}
        </span>
      </div>
    </div>
  );
};
