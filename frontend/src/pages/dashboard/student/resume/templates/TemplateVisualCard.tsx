import React from 'react';
import { Eye, Check, Zap, Sparkles } from 'lucide-react';
import type { ResumeTemplateMeta } from '../types';

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
  const isSerif = template.fontFamily === 'serif' || template.id === 'ivy-standard' || template.id === 'executive-serif';
  const accent = template.accentColor || '#333d7c';

  return (
    <div
      onClick={() => onSelect(template.id)}
      className={`group relative flex flex-col shrink-0 cursor-pointer transition-all duration-200 select-none text-left rounded-xl ${
        isSelected ? 'ring-2 ring-[#1e2653] ring-offset-2' : ''
      }`}
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
      {/* Miniature A4 Sheet Frame */}
      <div
        className={`relative w-[175px] h-[245px] bg-white rounded-lg border overflow-hidden shadow-xs group-hover:shadow-lg transition-all duration-200 flex flex-col ${
          isSelected
            ? 'border-[#1e2653]'
            : 'border-slate-200 group-hover:border-[#333d7c]'
        }`}
      >
        {/* Real Miniature Template Sheet Rendering */}
        <div
          className={`w-full h-full p-2.5 flex flex-col overflow-hidden bg-white text-[7px] leading-tight ${
            isSerif ? 'font-serif' : 'font-sans'
          }`}
          style={{ letterSpacing: '-0.01em' }}
        >
          {/* Layout Variant 1: Two-Column Sidebar (Atlantic Blue) */}
          {template.layoutType === 'two-column-sidebar' && (
            <div className='flex h-full w-full gap-1.5 -m-2.5 p-2'>
              {/* Left Dark Sidebar */}
              <div
                className='w-[34%] h-full p-1.5 flex flex-col gap-1 text-white shrink-0'
                style={{ backgroundColor: accent }}
              >
                <div className='w-5 h-5 rounded-full bg-white/25 border border-white/40 mx-auto mt-0.5 shrink-0 flex items-center justify-center text-[6px] font-bold'>
                  AC
                </div>
                <div className='text-center font-bold text-[7px] leading-tight text-white mt-0.5 truncate'>
                  Alex Chen
                </div>
                <div className='text-center text-[5.5px] text-white/70 scale-90 truncate'>
                  Full Stack
                </div>
                <div className='w-full h-[0.5px] bg-white/30 my-0.5' />
                <div className='text-[5.5px] font-bold text-white/90 uppercase tracking-wider'>
                  Skills
                </div>
                <div className='space-y-0.5'>
                  <div className='h-1 bg-white/40 rounded-xs w-full' />
                  <div className='h-1 bg-white/40 rounded-xs w-5/6' />
                  <div className='h-1 bg-white/40 rounded-xs w-4/6' />
                </div>
                <div className='mt-auto text-[5.5px] text-white/60'>
                  Barabari LMS
                </div>
              </div>
              {/* Right Body */}
              <div className='flex-1 flex flex-col gap-1 py-1 pr-1'>
                <div className='font-bold text-[7.5px] text-slate-800 border-b border-slate-200 pb-0.5'>
                  PROJECTS
                </div>
                <div className='space-y-0.5'>
                  <div className='font-semibold text-[6.5px] text-slate-700 flex justify-between'>
                    <span>CodeGuru LMS</span>
                    <span className='text-[5px] text-slate-400'>2026</span>
                  </div>
                  <div className='h-1 bg-slate-200 rounded-xs w-full' />
                  <div className='h-1 bg-slate-200 rounded-xs w-5/6' />
                </div>
                <div className='font-bold text-[7.5px] text-slate-800 border-b border-slate-200 pb-0.5 mt-0.5'>
                  EDUCATION
                </div>
                <div className='space-y-0.5'>
                  <div className='font-semibold text-[6px] text-slate-700'>
                    B.Tech Computer Science
                  </div>
                  <div className='h-1 bg-slate-200 rounded-xs w-4/5' />
                </div>
              </div>
            </div>
          )}

          {/* Layout Variant 2: Centered Classical Serif (Ivy Standard & Harvard Executive) */}
          {(template.id === 'ivy-standard' || template.id === 'executive-serif') && (
            <div className='flex flex-col h-full w-full gap-1'>
              <div className='text-center border-b border-slate-900 pb-1'>
                <div className='font-bold text-[9px] uppercase tracking-wider text-slate-900 font-serif'>
                  ALEX CHEN
                </div>
                <div className='text-[5.5px] text-slate-600 mt-0.5 font-serif'>
                  alex.chen@example.com • +91 98765 43210 • Hyderabad, India
                </div>
              </div>
              <div className='flex flex-col gap-1'>
                <div className='font-bold text-[6.5px] uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-0.5 flex justify-between items-center'>
                  <span>EDUCATION</span>
                  <span className='text-[5px] text-slate-400 font-normal'>2022 – 2026</span>
                </div>
                <div className='flex justify-between text-[6px] font-semibold text-slate-800'>
                  <span>B.Tech in Computer Science</span>
                  <span>8.8 CGPA</span>
                </div>
                <div className='h-1 bg-slate-200 rounded-xs w-4/5' />
              </div>
              <div className='flex flex-col gap-1 mt-0.5'>
                <div className='font-bold text-[6.5px] uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-0.5'>
                  TECHNICAL SKILLS
                </div>
                <div className='text-[5.5px] text-slate-700 space-y-0.5'>
                  <div><span className='font-bold'>Languages:</span> Python, TypeScript, SQL</div>
                  <div><span className='font-bold'>Frameworks:</span> React, Node.js, Express</div>
                </div>
              </div>
              <div className='flex flex-col gap-1 mt-0.5'>
                <div className='font-bold text-[6.5px] uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-0.5'>
                  PROJECTS
                </div>
                <div className='space-y-0.5'>
                  <div className='font-semibold text-[6px] text-slate-800 flex justify-between'>
                    <span>CodeGuru LMS Platform</span>
                    <span className='text-[5px] text-slate-400'>React, Node</span>
                  </div>
                  <div className='h-1 bg-slate-200 rounded-xs w-full' />
                  <div className='h-1 bg-slate-200 rounded-xs w-5/6' />
                </div>
              </div>
            </div>
          )}

          {/* Layout Variant 3: Photo Centric (Classic Portrait) */}
          {template.layoutType === 'photo-centric' && (
            <div className='flex flex-col h-full w-full gap-1'>
              <div className='flex items-center gap-1.5 pb-1 border-b' style={{ borderColor: accent }}>
                <div
                  className='w-6 h-6 rounded-full border-2 flex items-center justify-center font-bold text-[6.5px] text-white shrink-0 shadow-2xs'
                  style={{ backgroundColor: accent, borderColor: accent }}
                >
                  AC
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='font-bold text-[8.5px] text-slate-900 truncate'>Alex Chen</div>
                  <div className='text-[6px] font-medium truncate' style={{ color: accent }}>
                    Full Stack Consultant
                  </div>
                </div>
              </div>
              <div className='flex flex-col gap-1 mt-0.5'>
                <div className='font-bold text-[6.5px] uppercase tracking-wider text-slate-800 flex items-center gap-1'>
                  <div className='w-1 h-1 rounded-full' style={{ backgroundColor: accent }} />
                  <span>TECHNICAL EXPERTISE</span>
                </div>
                <div className='h-1 bg-slate-200 rounded-xs w-full' />
                <div className='h-1 bg-slate-200 rounded-xs w-4/5' />
              </div>
              <div className='flex flex-col gap-1 mt-0.5'>
                <div className='font-bold text-[6.5px] uppercase tracking-wider text-slate-800 flex items-center gap-1'>
                  <div className='w-1 h-1 rounded-full' style={{ backgroundColor: accent }} />
                  <span>CLIENT & CAPSTONE PROJECTS</span>
                </div>
                <div className='space-y-0.5'>
                  <div className='font-semibold text-[6px] text-slate-800'>Async LMS Portal</div>
                  <div className='h-1 bg-slate-200 rounded-xs w-full' />
                  <div className='h-1 bg-slate-200 rounded-xs w-3/4' />
                </div>
              </div>
            </div>
          )}

          {/* Layout Variant 4: Editorial PM / Horizontal Bar */}
          {template.layoutType === 'editorial' && (
            <div className='flex flex-col h-full w-full gap-1 -m-2.5 p-2'>
              <div className='h-1.5 w-full rounded-t' style={{ backgroundColor: accent }} />
              <div className='flex justify-between items-baseline border-b border-slate-200 pb-1 px-0.5'>
                <div>
                  <div className='font-bold text-[8.5px] text-slate-900'>Alex Chen</div>
                  <div className='text-[5.5px] font-semibold text-amber-800'>Product & Analytics</div>
                </div>
                <div className='text-[5px] text-slate-400'>Hyderabad, IN</div>
              </div>
              <div className='bg-amber-50/70 border border-amber-200/60 rounded p-1 text-[5.5px] text-amber-900 leading-tight'>
                <span className='font-bold'>Summary: </span>Full-stack contributor with proven product metrics...
              </div>
              <div className='font-bold text-[6.5px] text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-0.5 mt-0.5'>
                CASE STUDIES & PROJECTS
              </div>
              <div className='space-y-0.5'>
                <div className='font-semibold text-[6px] text-slate-800 flex justify-between'>
                  <span>CodeGuru Telemetry</span>
                  <span className='text-[5px] text-amber-700 font-bold'>+40% Latency Win</span>
                </div>
                <div className='h-1 bg-slate-200 rounded-xs w-full' />
                <div className='h-1 bg-slate-200 rounded-xs w-5/6' />
              </div>
            </div>
          )}

          {/* Layout Variant 5: Modern Tech / Tag-based (Mercury Flow & Cobalt Edge) */}
          {(template.id === 'modern-mercury' || template.id === 'creative-cobalt' || template.id === 'compact-sans') && (
            <div className='flex flex-col h-full w-full gap-1'>
              <div className='flex justify-between items-start border-b pb-1' style={{ borderColor: `${accent}40` }}>
                <div>
                  <div className='font-bold text-[9px] text-slate-900'>Alex Chen</div>
                  <div className='text-[6px] font-semibold' style={{ color: accent }}>
                    Full Stack Developer
                  </div>
                </div>
                <div
                  className='px-1 py-0.5 rounded text-[5px] font-bold text-white uppercase'
                  style={{ backgroundColor: accent }}
                >
                  ATS 98%
                </div>
              </div>
              {/* Categorized Skills Pills */}
              <div className='flex flex-col gap-0.5'>
                <div className='font-bold text-[6.5px] text-slate-800 uppercase tracking-wider'>
                  TECHNICAL SKILLS
                </div>
                <div className='flex flex-wrap gap-0.5'>
                  {['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker'].map((tag) => (
                    <span
                      key={tag}
                      className='px-1 py-0.2 rounded-xs text-[5px] font-medium border bg-slate-50 text-slate-700'
                      style={{ borderColor: `${accent}30` }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              {/* Projects */}
              <div className='flex flex-col gap-1 mt-0.5'>
                <div className='font-bold text-[6.5px] text-slate-800 uppercase tracking-wider'>
                  FEATURED PROJECTS
                </div>
                <div className='space-y-0.5 border-l-2 pl-1' style={{ borderColor: accent }}>
                  <div className='font-bold text-[6px] text-slate-900 flex justify-between'>
                    <span>Async LMS Platform</span>
                    <span className='text-[5px] text-emerald-600 font-bold'>✓ Live Demo</span>
                  </div>
                  <div className='h-1 bg-slate-200 rounded-xs w-full' />
                  <div className='h-1 bg-slate-200 rounded-xs w-4/5' />
                </div>
              </div>
            </div>
          )}

          {/* Layout Variant 6: Default Single Column / Clean Slate / First Job */}
          {template.id !== 'two-column-sidebar' &&
            template.id !== 'ivy-standard' &&
            template.id !== 'executive-serif' &&
            template.id !== 'photo-modern' &&
            template.id !== 'editorial-rule' &&
            template.id !== 'modern-mercury' &&
            template.id !== 'creative-cobalt' &&
            template.id !== 'compact-sans' && (
              <div className='flex flex-col h-full w-full gap-1'>
                <div className='border-b border-slate-200 pb-1'>
                  <div className='font-bold text-[9px] text-slate-900'>Alex Chen</div>
                  <div className='text-[6px] text-slate-500'>alex.chen@example.com • Hyderabad, IN</div>
                </div>
                {template.id === 'first-job-fresh' && (
                  <div className='bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 text-[5.5px] font-bold text-emerald-800'>
                    🎓 Capstone & Education Priority
                  </div>
                )}
                <div className='flex flex-col gap-1 mt-0.5'>
                  <div className='font-bold text-[6.5px] uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-0.5'>
                    EDUCATION & CAPSTONE
                  </div>
                  <div className='font-semibold text-[6px] text-slate-800'>B.Tech Computer Science</div>
                  <div className='h-1 bg-slate-200 rounded-xs w-4/5' />
                </div>
                <div className='flex flex-col gap-1 mt-0.5'>
                  <div className='font-bold text-[6.5px] uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-0.5'>
                    KEY PROJECTS
                  </div>
                  <div className='space-y-0.5'>
                    <div className='font-semibold text-[6px] text-slate-800'>CodeGuru Async Portal</div>
                    <div className='h-1 bg-slate-200 rounded-xs w-full' />
                    <div className='h-1 bg-slate-200 rounded-xs w-5/6' />
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Hover Overlay with Quick Preview Eye Action */}
        <div className='absolute inset-0 bg-[#1e2653]/60 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2'>
          <button
            type='button'
            onClick={(e) => onPreview(template.id, e)}
            className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[#1e2653] font-bold text-[11px] shadow-md hover:bg-slate-100 hover:scale-105 transition-all cursor-pointer'
          >
            <Eye size={13} strokeWidth={2.5} />
            <span>Quick View</span>
          </button>
          <span className='text-[10px] text-white font-semibold drop-shadow-xs'>
            Click card to choose
          </span>
        </div>

        {/* Selected Badge */}
        {isSelected && (
          <div className='absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-[#1e2653] text-white text-[9px] font-bold shadow-md flex items-center gap-1'>
            <Check size={10} strokeWidth={3} />
            Active
          </div>
        )}

        {/* Popular / Recommended Pill */}
        {!isSelected && template.popular && (
          <div className='absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[8.5px] font-bold shadow-xs flex items-center gap-0.5'>
            <Zap size={9} />
            Popular
          </div>
        )}
      </div>

      {/* Card Info Footer */}
      <div className='mt-2.5 flex flex-col text-left'>
        <div className='flex items-center justify-between gap-1'>
          <span className='font-bold text-xs text-slate-900 group-hover:text-[#333d7c] transition-colors truncate'>
            {template.name}
          </span>
          <span
            className='w-2 h-2 rounded-full shrink-0'
            style={{ backgroundColor: accent }}
            title={`Accent: ${accent}`}
          />
        </div>
        <span className='text-[10.5px] text-slate-500 truncate mt-0.5'>
          {template.badgeText}
        </span>
        <span className='text-[9.5px] text-[#333d7c] font-medium flex items-center gap-1 mt-1'>
          <Sparkles size={10} />
          {template.recommendedFor.split('&')[0].trim()}
        </span>
      </div>
    </div>
  );
};

