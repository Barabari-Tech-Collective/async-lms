import React, { useRef, useState, useEffect } from 'react';
import {
  Plus,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  FileText,
  Star,
  Copy,
  Trash2,
  Edit3,
  Eye,
  Archive,
  Pencil,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import type { ResumeListItem, ResumeDocument as ResumeDocType } from './types';
import { RESUME_TEMPLATES } from './templateRegistry';
import { TemplateModal } from './templates/TemplateModal';
import { TemplateVisualCard } from './templates/TemplateVisualCard';
import { TemplateQuickPreviewModal } from './templates/TemplateQuickPreviewModal';

interface ResumeDashboardViewProps {
  resumesList: ResumeListItem[];
  activeResumeRecordId?: string;
  onSelectResume: (id: string, mode?: 'preview' | 'editor') => void;
  onCreateNew: (templateId?: string) => void;
  onDeleteResume: (id: string, e?: React.MouseEvent) => void;
  onDuplicateResume: (id: string, e?: React.MouseEvent) => void;
  onSetPrimary: (id: string, e?: React.MouseEvent) => void;
  onRenameResume?: (id: string, newTitle: string) => Promise<boolean | void>;
  openRecycleBin: () => void;
  recycleBinCount: number;
  activeFilter: 'drafted' | 'completed';
  setActiveFilter: (filter: 'drafted' | 'completed') => void;
  activeResumeDoc?: ResumeDocType;
}

const PAGE_SIZE = 8;

function getPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 2) {
    return [1, 2, 3, '...', totalPages];
  }
  if (currentPage >= totalPages - 1) {
    return [1, '...', totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage, '...', totalPages];
}

export const ResumeDashboardView: React.FC<ResumeDashboardViewProps> = ({
  resumesList,
  activeResumeRecordId,
  onSelectResume,
  onCreateNew,
  onDeleteResume,
  onDuplicateResume,
  onSetPrimary,
  onRenameResume,
  openRecycleBin,
  recycleBinCount,
  activeFilter,
  setActiveFilter,
}) => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [quickPreviewTemplateId, setQuickPreviewTemplateId] = useState<string | null>(null);

  // Inline Resume Title Renaming
  const [editingResumeId, setEditingResumeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const startEditing = (id: string, currentTitle: string) => {
    setEditingResumeId(id);
    setEditingTitle(currentTitle);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 50);
  };

  const cancelEditing = () => {
    setEditingResumeId(null);
    setEditingTitle('');
  };

  const handleSaveRename = async (id: string) => {
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      return;
    }
    const currentItem = resumesList.find((r) => r.id === id);
    if (currentItem && currentItem.title === trimmed) {
      cancelEditing();
      return;
    }

    if (onRenameResume) {
      setIsSavingTitle(true);
      try {
        await onRenameResume(id, trimmed);
        setEditingResumeId(null);
      } finally {
        setIsSavingTitle(false);
      }
    } else {
      setEditingResumeId(null);
    }
  };

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = direction === 'left' ? -350 : 350;
      carouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Filter resumes into Drafted and Completed
  // Resumes are 'completed' if marked in document status or if they have completed all core sections
  const isCompleted = (item: ResumeListItem) => {
    return item.status === 'completed' || item.is_completed === true;
  };

  const formatUpdatedDate = (isoString?: string) => {
    if (!isoString) return 'Recent';
    try {
      const d = new Date(isoString);
      return isNaN(d.getTime())
        ? 'Recent'
        : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  // Pagination State (8 resumes per page)
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever active filter changes
  useEffect(() => {
    setPage(1);
  }, [activeFilter]);

  const completedResumes = resumesList.filter((r) => isCompleted(r));
  const draftedResumes = resumesList.filter((r) => !isCompleted(r));

  const displayedResumes = activeFilter === 'completed' ? completedResumes : draftedResumes;
  const totalPages = Math.max(1, Math.ceil(displayedResumes.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedResumes = displayedResumes.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className='min-h-screen bg-[#F1F4F9] text-slate-800 pb-16 font-sans antialiased'>
      {/* Top Header */}
      <div className='max-w-[1240px] mx-auto pt-7 px-4 sm:px-6'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6'>
          <div>
            <h1 className='text-2xl sm:text-[26px] font-bold text-[#374151] tracking-tight'>
              Resume Builder
            </h1>
            <p className='text-sm sm:text-base text-[#374151] font-medium mt-0.5'>
              Create new resume to apply for Jobs.
            </p>
          </div>
          <div className='flex items-center gap-3'>
            {recycleBinCount > 0 && (
              <button
                type='button'
                onClick={openRecycleBin}
                className='inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 transition-colors cursor-pointer'
              >
                <Archive size={14} className='text-slate-500' />
                <span>Recycle Bin ({recycleBinCount})</span>
              </button>
            )}
            <button
              type='button'
              onClick={() => onCreateNew('ivy-standard')}
              className='inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e2653] hover:bg-[#252d5e] text-white text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer'
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Create New Resume</span>
            </button>
          </div>
        </div>

        {/* Sample Resume Banner */}
        <div className='bg-[#DEE8FB] rounded-xl p-6 sm:p-7 relative mb-10 overflow-hidden shadow-xs'>
          <div className='flex items-start justify-between gap-4 mb-6'>
            <div>
              <h2 className='text-xl sm:text-2xl font-bold text-[#223498]'>
                Sample Resume
              </h2>
              <p className='text-sm sm:text-base text-[#223498] font-medium mt-1'>
                Here are some resume templates that can help you build your perfect resume.
              </p>
            </div>
            <button
              type='button'
              onClick={() => setIsTemplateModalOpen(true)}
              className='inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#344499] hover:underline cursor-pointer shrink-0 mt-1'
            >
              <span>See All</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Carousel */}
          <div className='relative'>
            <div
              ref={carouselRef}
              className='flex items-start gap-6 overflow-x-auto scrollbar-none scroll-smooth pb-2'
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* Blank Card */}
              <div
                onClick={() => onCreateNew('blank')}
                className='group flex flex-col shrink-0 cursor-pointer text-left select-none'
                style={{ width: '175px' }}
                role='button'
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCreateNew('blank');
                  }
                }}
                aria-label='Start with a blank resume'
              >
                <div className='w-[175px] h-[245px] bg-white rounded-lg shadow-xs border-2 border-dashed border-slate-300 group-hover:border-[#344499] group-hover:shadow-lg transition-all flex flex-col items-center justify-center bg-radial from-slate-50 to-white'>
                  <div className='w-11 h-11 rounded-full border-2 border-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform'>
                    <Plus size={22} className='text-slate-800' strokeWidth={2.2} />
                  </div>
                  <span className='mt-2.5 text-xs font-bold text-slate-800'>Blank Resume</span>
                  <span className='text-[10px] text-slate-400'>Start from scratch</span>
                </div>
                <div className='mt-2.5 text-left'>
                  <span className='block text-xs font-bold text-[#223498] group-hover:underline'>
                    Blank Canvas
                  </span>
                  <span className='block text-[10.5px] text-[#223498]/80 font-normal leading-tight mt-0.5'>
                    Start completely from scratch
                  </span>
                </div>
              </div>

              {/* Template Cards */}
              {RESUME_TEMPLATES.map((tmpl) => (
                <TemplateVisualCard
                  key={tmpl.id}
                  template={tmpl}
                  isSelected={false}
                  onSelect={(id) => onCreateNew(id)}
                  onPreview={(id, e) => {
                    e.stopPropagation();
                    setQuickPreviewTemplateId(id);
                  }}
                />
              ))}
            </div>

            {/* Carousel navigation arrows */}
            <button
              type='button'
              onClick={() => scrollCarousel('left')}
              className='absolute -left-3 top-[92px] w-8 h-8 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center text-slate-800 hover:bg-white hover:scale-105 transition-all cursor-pointer z-10'
              aria-label='Scroll templates left'
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <button
              type='button'
              onClick={() => scrollCarousel('right')}
              className='absolute -right-3 top-[92px] w-8 h-8 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center text-slate-800 hover:bg-white hover:scale-105 transition-all cursor-pointer z-10'
              aria-label='Scroll templates right'
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* My Recent Resumes Section */}
        <div>
          <div className='flex items-center justify-between pb-3'>
            <h2 className='text-xl sm:text-2xl font-bold text-[#374151]'>
              My Recent Resumes
            </h2>
          </div>

          {/* Filter Tabs */}
          <div className='flex items-center gap-6 border-b border-[#5B5B5B]/30 pb-3 mb-6'>
            <button
              type='button'
              onClick={() => setActiveFilter('drafted')}
              className={`text-base font-medium transition-colors cursor-pointer relative pb-1 ${
                activeFilter === 'drafted'
                  ? 'text-[#374151] font-bold after:content-[""] after:absolute after:bottom-[-13px] after:left-0 after:right-0 after:h-0.5 after:bg-[#1F285B]'
                  : 'text-[#374151]/70 hover:text-[#374151]'
              }`}
            >
              Drafted <span className='font-bold ml-1'>{draftedResumes.length}</span>
            </button>
            <button
              type='button'
              onClick={() => setActiveFilter('completed')}
              className={`text-base font-medium transition-colors cursor-pointer relative pb-1 ${
                activeFilter === 'completed'
                  ? 'text-[#374151] font-bold after:content-[""] after:absolute after:bottom-[-13px] after:left-0 after:right-0 after:h-0.5 after:bg-[#1F285B]'
                  : 'text-[#374151]/70 hover:text-[#374151]'
              }`}
            >
              Completed <span className='font-bold ml-1'>{completedResumes.length}</span>
            </button>
          </div>

          {/* Resume Grid */}
          {displayedResumes.length === 0 ? (
            <div className='bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center my-6'>
              <FileText size={42} className='text-slate-300 mx-auto mb-3' />
              <h3 className='text-base font-bold text-slate-700'>
                No {activeFilter} resumes found
              </h3>
              <p className='text-xs text-slate-500 mt-1 max-w-sm mx-auto'>
                {activeFilter === 'drafted'
                  ? 'You have no in-progress drafts. Pick a template above or create a new resume to get started.'
                  : 'Completed resumes will appear here once you finalize and save them in the Preview stage.'}
              </p>
              <button
                type='button'
                onClick={() => onCreateNew('modern-mercury')}
                className='mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#1e2653] hover:bg-[#252d5e] text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer'
              >
                <Plus size={14} />
                <span>Create New Resume</span>
              </button>
            </div>
          ) : (
            <>
              <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pt-2'>
                {pagedResumes.map((resume) => {
                const isSelected = resume.id === activeResumeRecordId;
                const updatedDateStr = formatUpdatedDate(resume.updated_at);

                return (
                  <div
                    key={resume.id}
                    className={`group relative bg-white rounded-lg border-4 ${
                      isSelected ? 'border-[#344499] shadow-md' : 'border-white shadow-xs'
                    } hover:shadow-lg transition-all flex flex-col overflow-hidden cursor-pointer`}
                    onClick={() => onSelectResume(resume.id, activeFilter === 'completed' ? 'preview' : 'editor')}
                  >
                    {/* Primary Badge */}
                    {resume.is_primary && (
                      <div className='absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-[#1F285B] text-white text-[9px] font-bold flex items-center gap-1 shadow-xs'>
                        <Star size={10} className='fill-amber-400 text-amber-400' />
                        Primary
                      </div>
                    )}

                    {/* Resume Miniature Canvas */}
                    <div className='w-full h-[220px] bg-slate-50 flex items-center justify-center p-3 relative overflow-hidden border-b border-slate-100'>
                      <div className='w-full h-full bg-white shadow-2xs rounded-xs p-3 flex flex-col gap-1.5 pointer-events-none select-none border border-slate-200/60'>
                        <div className='flex items-center justify-between pb-1 border-b border-slate-200'>
                          <div className='h-2.5 bg-slate-800 rounded-xs w-1/2' />
                          <div className='h-2 bg-slate-300 rounded-xs w-1/4' />
                        </div>
                        <div className='h-1.5 bg-slate-400 rounded-xs w-3/4 mt-1' />
                        <div className='space-y-1 mt-1'>
                          <div className='h-1 bg-slate-300 rounded-xs w-full' />
                          <div className='h-1 bg-slate-200 rounded-xs w-5/6' />
                          <div className='h-1 bg-slate-200 rounded-xs w-4/6' />
                        </div>
                        <div className='h-1.5 bg-slate-700 rounded-xs w-1/3 mt-2' />
                        <div className='space-y-1 mt-1'>
                          <div className='h-1 bg-slate-200 rounded-xs w-full' />
                          <div className='h-1 bg-slate-200 rounded-xs w-11/12' />
                        </div>
                      </div>

                      {/* Hover Overlay with Action Buttons */}
                      <div className='absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2'>
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectResume(resume.id, 'editor');
                          }}
                          className='p-2 rounded-full bg-white text-slate-800 hover:bg-slate-100 shadow-md cursor-pointer transition-transform hover:scale-105'
                          title='Edit Resume'
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectResume(resume.id, 'preview');
                          }}
                          className='p-2 rounded-full bg-white text-slate-800 hover:bg-slate-100 shadow-md cursor-pointer transition-transform hover:scale-105'
                          title='Preview Resume'
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type='button'
                          onClick={(e) => onDuplicateResume(resume.id, e)}
                          className='p-2 rounded-full bg-white text-slate-800 hover:bg-slate-100 shadow-md cursor-pointer transition-transform hover:scale-105'
                          title='Duplicate Resume'
                        >
                          <Copy size={15} />
                        </button>
                        {!resume.is_primary && (
                          <button
                            type='button'
                            onClick={(e) => onSetPrimary(resume.id, e)}
                            className='p-2 rounded-full bg-white text-amber-600 hover:bg-slate-100 shadow-md cursor-pointer transition-transform hover:scale-105'
                            title='Set as Primary'
                          >
                            <Star size={15} />
                          </button>
                        )}
                        <button
                          type='button'
                          onClick={(e) => onDeleteResume(resume.id, e)}
                          className='p-2 rounded-full bg-white text-rose-600 hover:bg-rose-50 shadow-md cursor-pointer transition-transform hover:scale-105'
                          title='Delete Resume'
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Footer Info */}
                    <div
                      className='p-3 bg-white border-t border-slate-100 transition-colors'
                      onClick={(e) => e.stopPropagation()}
                    >
                      {editingResumeId === resume.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSaveRename(resume.id);
                          }}
                          className='flex items-center gap-1.5'
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            ref={editInputRef}
                            type='text'
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                cancelEditing();
                              }
                            }}
                            disabled={isSavingTitle}
                            maxLength={100}
                            placeholder='Enter resume name...'
                            className='flex-1 min-w-0 text-xs sm:text-sm font-semibold text-slate-900 bg-slate-50 border border-[#344499] rounded px-2 py-1 outline-hidden focus:bg-white focus:ring-2 focus:ring-[#344499]/20 transition-all'
                            autoFocus
                          />
                          <button
                            type='submit'
                            disabled={isSavingTitle || !editingTitle.trim()}
                            className='p-1.5 rounded-md bg-[#344499] text-white hover:bg-[#253275] transition-colors cursor-pointer shrink-0 disabled:opacity-50'
                            title='Save resume name'
                            aria-label='Save resume name'
                          >
                            {isSavingTitle ? (
                              <Loader2 size={13} className='animate-spin' />
                            ) : (
                              <Check size={13} strokeWidth={2.5} />
                            )}
                          </button>
                          <button
                            type='button'
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelEditing();
                            }}
                            disabled={isSavingTitle}
                            className='p-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors cursor-pointer shrink-0'
                            title='Cancel'
                            aria-label='Cancel renaming'
                          >
                            <X size={13} strokeWidth={2.5} />
                          </button>
                        </form>
                      ) : (
                        <div className='flex items-start justify-between gap-1.5 group/title'>
                          <div className='min-w-0 flex-1'>
                            <h4
                              className='text-sm font-semibold text-slate-900 truncate hover:text-[#344499] transition-colors cursor-pointer'
                              title={`${resume.title || 'Untitled Resume'} — Click to rename`}
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(resume.id, resume.title || 'Untitled Resume');
                              }}
                            >
                              {resume.title || 'Untitled Resume'}
                            </h4>
                            <p className='text-[10px] text-slate-500 mt-0.5'>
                              Last updated on {updatedDateStr}
                            </p>
                          </div>

                          <button
                            type='button'
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(resume.id, resume.title || 'Untitled Resume');
                            }}
                            className='p-1 text-slate-400 hover:text-[#344499] hover:bg-slate-100 rounded transition-all cursor-pointer shrink-0 -mt-0.5'
                            title='Edit resume name'
                            aria-label={`Edit name for ${resume.title || 'Untitled Resume'}`}
                          >
                            <Pencil size={12.5} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className='flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-4 border-t border-slate-200/80'>
                <span className='text-xs text-slate-500 font-medium'>
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, displayedResumes.length)} of {displayedResumes.length} resumes
                </span>
                <div className='flex items-center gap-1 sm:gap-1.5'>
                  <button
                    type='button'
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className='px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition min-h-[32px] flex items-center gap-1 cursor-pointer'
                  >
                    <ChevronLeft size={14} />
                    <span>Previous</span>
                  </button>

                  {getPageNumbers(currentPage, totalPages).map((p, i) => (
                    <button
                      key={i}
                      type='button'
                      onClick={() => typeof p === 'number' && setPage(p)}
                      disabled={p === '...'}
                      className={`min-w-[32px] h-[32px] px-2 flex items-center justify-center rounded-lg border text-xs sm:text-sm transition font-medium cursor-pointer ${
                        p === currentPage
                          ? 'bg-[#1e2653] text-white border-[#1e2653] font-bold shadow-xs'
                          : p === '...'
                          ? 'border-transparent text-slate-400 cursor-default'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}

                  <button
                    type='button'
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className='px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition min-h-[32px] flex items-center gap-1 cursor-pointer'
                  >
                    <span>Next</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
          )}
        </div>
      </div>

      <TemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        currentTemplateId=''
        onSelectTemplate={(templateId) => onCreateNew(templateId)}
      />

      <TemplateQuickPreviewModal
        isOpen={Boolean(quickPreviewTemplateId)}
        templateId={quickPreviewTemplateId}
        onClose={() => setQuickPreviewTemplateId(null)}
        onSelectTemplate={(templateId) => onCreateNew(templateId)}
      />
    </div>
  );
};
