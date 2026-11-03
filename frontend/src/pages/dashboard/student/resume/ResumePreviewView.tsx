import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Download,
  Share2,
  Sparkles,
  Eye,
  Briefcase,
  LayoutTemplate,
  Loader2,
  X,
  CheckCircle2,
  FileText,
  Search,
} from 'lucide-react';
import type { ResumeDocument as ResumeDocType, Section, ResumeMatchResult } from './types';
import { ResumeDocument } from './ResumeDocument';
import { RESUME_TEMPLATES } from './templateRegistry';
import { toast } from 'react-hot-toast';
import apiClient from '@/services/api';

interface ResumePreviewViewProps {
  resumeDoc: ResumeDocType;
  onUpdate: (updated: ResumeDocType) => void;
  onBackToEditor: () => void;
  onSaveCompleted: () => void;
  onDownloadPdf: () => void;
  onPolishWithAI: () => void;
  polishingWithAI: boolean;
  downloadingPdf: boolean;
  sections?: Section[];
}

export const ResumePreviewView: React.FC<ResumePreviewViewProps> = ({
  resumeDoc,
  onUpdate,
  onBackToEditor,
  onSaveCompleted,
  onDownloadPdf,
  onPolishWithAI,
  polishingWithAI,
  downloadingPdf,
  sections,
}) => {
  const [showJDModal, setShowJDModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showFullscreenModal, setShowFullscreenModal] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // JD Match state
  const [jdText, setJdText] = useState('');
  const [jdLoading, setJdLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<ResumeMatchResult | null>(null);

  const handleAnalyzeJD = async () => {
    if (!jdText.trim()) return toast.error('Paste a job description first.');
    setJdLoading(true);
    try {
      const res = await apiClient.post('/assistant/resume/optimize', {
        resumeData: resumeDoc,
        jobDescription: jdText,
      });
      if (res.data?.success && res.data.data) {
        setMatchResult(res.data.data as ResumeMatchResult);
        toast.success('Match analysis complete!');
      }
    } catch {
      toast.error('Failed to analyze match. Try again.');
    } finally {
      setJdLoading(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: `${resumeDoc.personalInfo?.fullName || 'Student'} Resume`,
          text: `Check out my verified resume on CodeGuru!`,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Resume link copied to clipboard!');
    }
  };

  return (
    <div className='min-h-screen bg-[#F1F4F9] text-slate-800 pb-20 font-sans antialiased'>
      <div className='max-w-[1240px] mx-auto pt-4 px-4 sm:px-6'>
        {/* Top Stepper & Navigation */}
        <div className='mb-4'>
          <div className='flex items-center gap-2 mb-3'>
            <button
              type='button'
              onClick={onBackToEditor}
              className='p-1.5 rounded-md hover:bg-slate-200/70 text-black transition-colors cursor-pointer'
              title='Back to editor'
            >
              <ArrowLeft size={20} strokeWidth={2.5} />
            </button>
          </div>

          {/* Stepper (All 7 Steps Completed) */}
          <div className='bg-white shadow-[3px_4px_5.2px_#DBEAFF] rounded-md px-4 py-3 flex items-center justify-between sm:justify-center overflow-x-auto gap-2 sm:gap-4'>
            {[
              'Your Details',
              'Short Bio',
              'Projects',
              'Experience',
              'Education',
              'Certificates & Events',
              'Skills',
            ].map((label, idx) => (
              <React.Fragment key={label}>
                <div
                  onClick={onBackToEditor}
                  className='flex items-center gap-2 shrink-0 cursor-pointer select-none'
                >
                  <div className='w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[#1F285B] text-white'>
                    {idx + 1}
                  </div>
                  <span className='text-xs sm:text-sm font-semibold text-[#1F285B] whitespace-nowrap'>
                    {label}
                  </span>
                </div>
                {idx < 6 && (
                  <div className='hidden md:block w-8 sm:w-10 h-[2px] bg-[#1F285B] shrink-0' />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Candidate Header Card */}
          <div className='bg-white rounded-md p-4 mt-4 shadow-xs border border-slate-200/60 flex items-center justify-between'>
            <div>
              <h2 className='text-2xl font-bold text-[#374151]'>
                {resumeDoc.personalInfo?.fullName || 'Your Name'}
              </h2>
              <p className='text-sm text-[#374151] font-medium mt-0.5'>
                {resumeDoc.personalInfo?.headline || 'Software Developer.'}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={onBackToEditor}
                className='px-4 py-2 rounded-lg bg-[#FFCC33] hover:bg-[#e6b82e] text-black text-xs font-bold transition-all shadow-xs cursor-pointer'
              >
                Edit Details
              </button>
              <button
                type='button'
                onClick={onSaveCompleted}
                className='px-5 py-2 rounded-lg bg-[#040000] hover:bg-black/85 text-white text-xs font-bold transition-all shadow-xs cursor-pointer'
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className='bg-white rounded-xl shadow-xs border border-slate-200/70 p-4 sm:p-8 relative min-h-[850px] flex justify-center items-start'>
          {/* Left Floating Action Tools */}
          <div className='absolute left-4 sm:left-6 top-8 flex flex-col items-center gap-4 z-20'>
            {/* Download PDF */}
            <button
              type='button'
              onClick={onDownloadPdf}
              disabled={downloadingPdf}
              className='w-11 h-11 rounded-full bg-[#C5CCEC] hover:bg-[#b0b9e8] text-black shadow-[0px_4px_4px_#F5F9FF] flex items-center justify-center transition-all hover:scale-105 cursor-pointer disabled:opacity-50'
              title='Download PDF'
            >
              {downloadingPdf ? (
                <Loader2 size={18} className='animate-spin' />
              ) : (
                <Download size={18} strokeWidth={2.2} />
              )}
            </button>

            {/* Share Link */}
            <button
              type='button'
              onClick={handleShare}
              className='w-11 h-11 rounded-full bg-[#C5CCEC] hover:bg-[#b0b9e8] text-black shadow-[0px_4px_4px_#F3F4F6] flex items-center justify-center transition-all hover:scale-105 cursor-pointer'
              title='Share Resume'
            >
              <Share2 size={18} strokeWidth={2.2} />
            </button>

            {/* Improve With AI */}
            <button
              type='button'
              onClick={onPolishWithAI}
              disabled={polishingWithAI}
              className='w-11 h-11 rounded-full bg-[#C5CCEC] hover:bg-[#b0b9e8] text-black shadow-[0px_4px_4px_#F3F4F6] flex items-center justify-center transition-all hover:scale-105 cursor-pointer disabled:opacity-50'
              title='Improve With AI'
            >
              {polishingWithAI ? (
                <Loader2 size={18} className='animate-spin text-indigo-700' />
              ) : (
                <Sparkles size={18} strokeWidth={2.2} />
              )}
            </button>

            {/* Preview / Zoom */}
            <button
              type='button'
              onClick={() => setShowFullscreenModal(true)}
              className='w-11 h-11 rounded-full bg-[#C5CCEC] hover:bg-[#b0b9e8] text-black shadow-[0px_4px_4px_#F3F4F6] flex items-center justify-center transition-all hover:scale-105 cursor-pointer'
              title='Fullscreen Preview'
            >
              <Eye size={18} strokeWidth={2.2} />
            </button>
          </div>

          {/* Right Floating Action Tools */}
          <div className='absolute right-4 sm:right-6 top-8 flex flex-col items-end gap-3 z-20'>
            {/* Check Skill / JD Match */}
            <button
              type='button'
              onClick={() => setShowJDModal(true)}
              className='inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-[#C5CCEC] hover:bg-[#b0b9e8] text-[#374151] font-semibold text-xs shadow-md transition-all hover:scale-105 cursor-pointer'
              title='Check Skill / JD Match'
            >
              <Briefcase size={16} className='text-black' strokeWidth={2.2} />
              <span className='hidden sm:inline'>Check Skill / JD Match</span>
            </button>

            {/* Change Template */}
            <button
              type='button'
              onClick={() => setShowTemplateModal(true)}
              className='inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-semibold text-xs shadow-xs transition-all hover:scale-105 cursor-pointer'
              title='Change Template'
            >
              <LayoutTemplate size={16} className='text-[#223498]' />
              <span className='hidden sm:inline'>Change Template</span>
            </button>
          </div>

          {/* Centered A4 Resume Sheet */}
          <div className='w-full max-w-[800px] flex justify-center py-6 sm:py-8'>
            <div
              data-resume-print-root
              className='w-full bg-white shadow-2xl rounded-sm border border-slate-200 overflow-hidden'
            >
              <ResumeDocument
                data={resumeDoc}
                sections={sections}
                onUpdate={onUpdate}
                readOnly={false}
              />
            </div>
          </div>
        </div>

        {/* Bottom Save & Edit Floating Bar */}
        <div className='flex items-center justify-end gap-3 mt-6'>
          <button
            type='button'
            onClick={onBackToEditor}
            className='px-6 py-2.5 rounded-lg bg-[#FFCC33] hover:bg-[#e6b82e] text-black text-xs font-bold transition-all shadow-sm cursor-pointer'
          >
            Edit
          </button>
          <button
            type='button'
            onClick={onSaveCompleted}
            className='px-7 py-2.5 rounded-lg bg-[#040000] hover:bg-black/85 text-white text-xs font-bold transition-all shadow-sm cursor-pointer'
          >
            Save
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 1: CHECK SKILL / JD MATCH                               */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showJDModal && (
        <div className='fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4'>
          <div className='bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 animate-in fade-in-50 duration-200 max-h-[90vh] overflow-y-auto'>
            <div className='flex items-center justify-between pb-3 border-b border-slate-200 mb-4'>
              <div className='flex items-center gap-2'>
                <Briefcase size={18} className='text-[#223498]' />
                <h3 className='text-base font-bold text-slate-800'>
                  Check Skill / Job Description Match
                </h3>
              </div>
              <button
                type='button'
                onClick={() => setShowJDModal(false)}
                className='text-slate-400 hover:text-slate-600 p-1 cursor-pointer'
              >
                <X size={18} />
              </button>
            </div>

            <p className='text-xs text-slate-500 mb-3'>
              Paste the job requirements below to analyze keyword alignment, ATS readiness score, and get personalized recommendations.
            </p>

            <textarea
              rows={4}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder='Paste job description or requirements here...'
              className='w-full p-3 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1F285B] focus:outline-hidden text-slate-800 resize-none mb-3'
            />

            <button
              type='button'
              onClick={handleAnalyzeJD}
              disabled={jdLoading}
              className='w-full py-2.5 rounded-xl bg-[#040000] hover:bg-black/85 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-sm'
            >
              {jdLoading ? (
                <>
                  <Loader2 size={14} className='animate-spin' />
                  <span>Analyzing Match...</span>
                </>
              ) : (
                <>
                  <Search size={14} />
                  <span>Analyze Alignment</span>
                </>
              )}
            </button>

            {matchResult && (
              <div className='mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 animate-in fade-in-50'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-bold text-slate-700'>
                    ATS Keyword Match Score:
                  </span>
                  <span className='text-sm font-black text-[#223498] bg-[#DEE8FB] px-2.5 py-0.5 rounded-full'>
                    {matchResult.matchPercentage ?? (matchResult as any).matchScore ?? 0}%
                  </span>
                </div>

                {matchResult.matchedKeywords?.length > 0 && (
                  <div>
                    <span className='block text-[11px] font-bold text-emerald-800 mb-1.5'>
                      ✓ Matched Keywords:
                    </span>
                    <div className='flex flex-wrap gap-1.5'>
                      {matchResult.matchedKeywords.map((kw, i) => (
                        <span
                          key={i}
                          className='px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-semibold'
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {matchResult.missingKeywords?.length > 0 && (
                  <div>
                    <span className='block text-[11px] font-bold text-amber-800 mb-1.5'>
                      ⚠ Missing Keywords from Resume:
                    </span>
                    <div className='flex flex-wrap gap-1.5'>
                      {matchResult.missingKeywords.map((kw, i) => (
                        <span
                          key={i}
                          className='px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-semibold'
                        >
                          + {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {matchResult.actionableSuggestions?.length > 0 && (
                  <div>
                    <span className='block text-[11px] font-bold text-slate-700 mb-1'>
                      Recommendations:
                    </span>
                    <ul className='list-disc list-inside text-[11px] text-slate-600 space-y-1'>
                      {matchResult.actionableSuggestions.map((sug, i) => (
                        <li key={i}>{sug}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 2: CHANGE TEMPLATE                                      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showTemplateModal && (
        <div className='fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4'>
          <div className='bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-in fade-in-50 duration-200 max-h-[85vh] overflow-y-auto'>
            <div className='flex items-center justify-between pb-3 border-b border-slate-200 mb-4'>
              <div className='flex items-center gap-2'>
                <LayoutTemplate size={18} className='text-[#223498]' />
                <h3 className='text-base font-bold text-slate-800'>
                  Select Resume Template
                </h3>
              </div>
              <button
                type='button'
                onClick={() => setShowTemplateModal(false)}
                className='text-slate-400 hover:text-slate-600 p-1 cursor-pointer'
              >
                <X size={18} />
              </button>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              {RESUME_TEMPLATES.map((tmpl) => {
                const isSelected = resumeDoc.templateId === tmpl.id;
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => {
                      onUpdate({ ...resumeDoc, templateId: tmpl.id });
                      setShowTemplateModal(false);
                      toast.success(`Switched to "${tmpl.name}"`);
                    }}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#223498] bg-[#DEE8FB]/30 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className='flex items-center justify-between mb-1'>
                        <h4 className='text-sm font-bold text-slate-800'>
                          {tmpl.name}
                        </h4>
                        {isSelected && (
                          <span className='px-2 py-0.5 rounded-full bg-[#1F285B] text-white text-[9px] font-bold'>
                            Active
                          </span>
                        )}
                      </div>
                      <p className='text-[10px] font-semibold text-[#223498] mb-1.5'>
                        {tmpl.headline}
                      </p>
                      <p className='text-xs text-slate-500 leading-relaxed'>
                        {tmpl.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 3: FULLSCREEN PREVIEW                                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showFullscreenModal && (
        <div className='fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4'>
          <div className='bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] flex flex-col overflow-hidden'>
            <div className='flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-slate-50'>
              <span className='font-bold text-sm text-slate-800'>
                A4 Placement Format Preview
              </span>
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={onDownloadPdf}
                  disabled={downloadingPdf}
                  className='px-3 py-1.5 rounded-lg bg-[#040000] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs'
                >
                  <Download size={13} />
                  <span>Download PDF</span>
                </button>
                <button
                  type='button'
                  onClick={() => setShowFullscreenModal(false)}
                  className='p-1.5 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer'
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className='flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center'>
              <div className='w-full max-w-[780px] bg-white shadow-xl'>
                <ResumeDocument
                  data={resumeDoc}
                  sections={sections}
                  onUpdate={onUpdate}
                  readOnly={true}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
