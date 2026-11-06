import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Download,
  Share2,
  Sparkles,
  Briefcase,
  LayoutTemplate,
  Loader2,
  X,
  Search,
  Check,
  Pencil,
  ChevronDown,
  Palette,
  Maximize2,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  ShieldCheck,
  Mail,
  MessageSquare,
  FileDown,
} from 'lucide-react';
import { useRef } from 'react';
import type { ResumeDocument as ResumeDocType, Section, ResumeMatchResult } from './types';
import { ResumeDocument } from './ResumeDocument';
import { RESUME_TEMPLATES, getTemplateMeta } from './templateRegistry';
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
  resumeId?: string;
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
  resumeId,
}) => {
  const [showJDModal, setShowJDModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showFullscreenModal, setShowFullscreenModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const previewDocRef = useRef<HTMLDivElement>(null);
  const [docHeight, setDocHeight] = useState<number>(0);

  useEffect(() => {
    const el = previewDocRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDocHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [resumeDoc]);

  const A4_HEIGHT_PX = 1130;
  const isMultiPage = docHeight > A4_HEIGHT_PX;
  const pageCount = Math.max(1, Math.ceil(docHeight / A4_HEIGHT_PX));

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

  const getPublicShareUrl = () => {
    if (resumeId) {
      return `${window.location.origin}/r/${resumeId}`;
    }
    return '';
  };

  const handleShare = () => {
    const url = getPublicShareUrl();
    if (!url) {
      toast.error('Please save your resume first to generate a shareable recruiter link.');
      return;
    }
    setShowShareModal(true);
  };

  const handleCopyShareLink = () => {
    const url = getPublicShareUrl();
    if (!url) return;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    toast.success('Public recruiter link copied to clipboard!');
    setTimeout(() => setShareCopied(false), 2500);
  };

  const handleNativeShare = () => {
    const url = getPublicShareUrl();
    if (!url) return;
    if (navigator.share) {
      navigator
        .share({
          title: `${resumeDoc.personalInfo?.fullName || 'Candidate'} - Verified Resume`,
          text: `Review verified placement resume for ${resumeDoc.personalInfo?.fullName || 'this candidate'} on CodeGuru:`,
          url: url,
        })
        .catch(() => {});
    } else {
      handleCopyShareLink();
    }
  };

  const currentTemplate = getTemplateMeta(resumeDoc.templateId);

  return (
    <div className='min-h-screen bg-[#F8FAFC] text-slate-800 pb-24 font-sans antialiased'>
      {/* ── TOP STICKY TOOLBAR ─────────────────────────────────────────── */}
      <header className='sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs px-4 sm:px-6 py-2.5'>
        <div className='max-w-[1360px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3'>
          {/* Left: Back & Candidate Info */}
          <div className='flex items-center gap-3 min-w-0'>
            <button
              type='button'
              onClick={onBackToEditor}
              className='p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors border border-slate-200/80 bg-white shadow-2xs shrink-0 cursor-pointer'
              title='Back to Form Editor'
            >
              <ArrowLeft size={18} strokeWidth={2.5} />
            </button>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <h1 className='text-sm sm:text-base font-bold text-slate-900 truncate'>
                  {resumeDoc.personalInfo?.fullName || 'Placement Resume'}
                </h1>
                <span className='hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70 uppercase tracking-wider shrink-0'>
                  FlowCV Verified
                </span>
              </div>
              <p className='text-xs text-slate-500 truncate'>
                {resumeDoc.personalInfo?.headline || 'Ready to export for job drives'}
              </p>
            </div>
          </div>

          {/* Center: Template & Fullscreen View Pills */}
          <div className='flex items-center gap-2 self-start md:self-auto shrink-0'>
            {/* Template Selector */}
            <button
              type='button'
              onClick={() => setShowTemplateModal(true)}
              className='h-8 px-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer'
              title={`Switch Resume Template (10 Available) - Current: ${currentTemplate.name}`}
            >
              <Palette size={13.5} className='text-indigo-600 shrink-0' />
              <span className='max-w-[110px] truncate'>{currentTemplate.name}</span>
              <ChevronDown size={11} className='text-slate-400 shrink-0' />
            </button>

            {/* Fullscreen Preview */}
            <button
              type='button'
              onClick={() => setShowFullscreenModal(true)}
              className='h-8 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer'
              title='Fullscreen Inspection'
            >
              <Maximize2 size={13.5} className='text-slate-500 shrink-0' />
              <span className='hidden sm:inline'>Fullscreen</span>
            </button>
          </div>

          {/* Right: Actions (JD Match, AI Polish, Share, Edit, Download) */}
          <div className='flex items-center gap-2 self-end md:self-auto flex-wrap sm:flex-nowrap shrink-0'>
            {/* Check Skill / JD Match */}
            <button
              type='button'
              onClick={() => setShowJDModal(true)}
              className='h-8 px-2.5 sm:px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer'
              title='Check ATS alignment against a Job Description'
            >
              <Briefcase size={13.5} className='text-indigo-600 shrink-0' />
              <span className='hidden lg:inline'>JD Match</span>
            </button>

            {/* Polish with AI */}
            <button
              type='button'
              onClick={onPolishWithAI}
              disabled={polishingWithAI}
              className='h-8 px-2.5 sm:px-3 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-60'
              title='Polish summary and STAR bullet points with AI'
            >
              {polishingWithAI ? (
                <Loader2 size={13.5} className='animate-spin text-indigo-700 shrink-0' />
              ) : (
                <Sparkles size={13.5} className='text-indigo-600 shrink-0' />
              )}
              <span className='hidden sm:inline'>AI Polish</span>
            </button>

            {/* Share */}
            <button
              type='button'
              onClick={handleShare}
              className='h-8 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer'
              title='Share or Copy link'
            >
              <Share2 size={13.5} className='text-slate-600 shrink-0' />
              <span className='hidden xl:inline'>Share</span>
            </button>

            {/* Edit Details */}
            <button
              type='button'
              onClick={onBackToEditor}
              className='h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer'
            >
              <Pencil size={13} className='text-slate-500 shrink-0' />
              <span>Edit</span>
            </button>

            {/* Save Completed */}
            <button
              type='button'
              onClick={onSaveCompleted}
              className='h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer'
              title='Save and mark resume as Completed'
            >
              <Check size={13.5} className='text-emerald-600 shrink-0' />
              <span>Mark Done</span>
            </button>

            {/* Download PDF Primary Button */}
            <button
              type='button'
              onClick={onDownloadPdf}
              disabled={downloadingPdf}
              className='h-8 px-3.5 text-xs font-bold text-white bg-[#1e2653] hover:bg-[#252d5e] active:scale-[0.98] rounded-lg inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-60'
              title='Download print-ready A4 PDF'
            >
              {downloadingPdf ? (
                <>
                  <Loader2 size={13.5} className='animate-spin text-white shrink-0' />
                  <span>Preparing...</span>
                </>
              ) : (
                <>
                  <Download size={13.5} className='shrink-0' />
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN A4 DOCUMENT CANVAS ───────────────────────────────────── */}
      <main className='max-w-[1240px] mx-auto pt-6 px-4 sm:px-6'>
        <div className='flex items-center justify-between mb-3 text-xs text-slate-500 px-1 flex-wrap gap-2'>
          <span className='flex items-center gap-1.5'>
            <span className='w-2 h-2 rounded-full bg-emerald-500 inline-block' />
            <span>Double-click any text inside the document to make quick inline edits</span>
          </span>
          <div className='flex items-center gap-2.5'>
            {isMultiPage ? (
              <span
                className='inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs'
                title='Content overflows onto Page 2. Fresher resumes are ideally 1 single A4 page.'
              >
                <AlertCircle size={12} className='text-amber-600 shrink-0' />
                <span>{pageCount} Pages (Overflows Page 1)</span>
              </span>
            ) : (
              <span
                className='inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs'
                title='Fits within 1 single A4 sheet!'
              >
                <CheckCircle2 size={12} className='text-emerald-600 shrink-0' />
                <span>1 Page (Fits A4 Sheet)</span>
              </span>
            )}
            <span className='font-medium text-slate-600 hidden sm:inline'>
              {currentTemplate.name} · {currentTemplate.recommendedFor}
            </span>
          </div>
        </div>

        {/* Clean, Non-Overlapped A4 Sheet with Real-Time Multi-Page Break Line */}
        <div className='w-full flex justify-center pb-8'>
          <div
            data-resume-print-root
            ref={previewDocRef}
            className='relative w-full max-w-[850px] bg-white shadow-xl rounded-xl border border-slate-200 overflow-hidden'
          >
            <ResumeDocument
              data={resumeDoc}
              sections={sections}
              onUpdate={onUpdate}
              readOnly={false}
            />

            {/* Visual Page Break 1 -> Page 2 Indicator */}
            {isMultiPage && (
              <div
                style={{ top: `${A4_HEIGHT_PX}px` }}
                className='absolute left-0 right-0 z-20 pointer-events-none flex items-center justify-center print:hidden'
              >
                <div className='w-full border-t-2 border-dashed border-rose-400 absolute' />
                <span className='relative bg-rose-50 text-rose-800 border border-rose-300 px-3 py-0.5 rounded-full text-[11px] font-bold shadow-xs flex items-center gap-1 select-none'>
                  ✂️ End of Page 1 · Content below starts on Page 2
                </span>
              </div>
            )}

            {/* Visual Page Break 2 -> Page 3 Indicator (if 3+ pages) */}
            {docHeight > A4_HEIGHT_PX * 2 && (
              <div
                style={{ top: `${A4_HEIGHT_PX * 2}px` }}
                className='absolute left-0 right-0 z-20 pointer-events-none flex items-center justify-center print:hidden'
              >
                <div className='w-full border-t-2 border-dashed border-rose-400 absolute' />
                <span className='relative bg-rose-50 text-rose-800 border border-rose-300 px-3 py-0.5 rounded-full text-[11px] font-bold shadow-xs flex items-center gap-1 select-none'>
                  ✂️ End of Page 2 · Content below starts on Page 3
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Quick Action Dock */}
        <div className='flex items-center justify-between border-t border-slate-200/80 pt-5 pb-2'>
          <button
            type='button'
            onClick={onBackToEditor}
            className='inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer'
          >
            <ArrowLeft size={14} />
            <span>Back to Step Editor</span>
          </button>
          <div className='flex items-center gap-2.5'>
            <button
              type='button'
              onClick={onSaveCompleted}
              className='px-5 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer inline-flex items-center gap-1.5'
            >
              <Check size={14} className='text-emerald-600' />
              <span>Mark Completed</span>
            </button>
            <button
              type='button'
              onClick={onDownloadPdf}
              disabled={downloadingPdf}
              className='px-6 py-2 rounded-lg bg-[#1e2653] hover:bg-[#252d5e] text-white text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60'
            >
              <Download size={14} />
              <span>Download A4 PDF</span>
            </button>
          </div>
        </div>
      </main>

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
              className='w-full py-2.5 rounded-xl bg-[#1e2653] hover:bg-[#252d5e] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-xs transition-colors'
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
                  className='px-3.5 py-1.5 rounded-lg bg-[#1e2653] hover:bg-[#252d5e] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors disabled:opacity-60'
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
      {/* ------------------------------------------------------------- */}
      {/* MODAL 4: DOWNLOAD & SHARE WITH RECRUITERS                     */}
      {/* ------------------------------------------------------------- */}
      {showShareModal && (
        <div className='fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50'>
          <div className='bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4'>
            {/* Header */}
            <div className='flex items-center justify-between pb-3 border-b border-slate-100'>
              <div className='flex items-center gap-2.5'>
                <div className='w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0'>
                  <FileDown size={20} />
                </div>
                <div>
                  <h3 className='text-base font-bold text-slate-800'>
                    Resume Downloaded & Ready to Share
                  </h3>
                  <p className='text-xs text-slate-500'>
                    Your verified PDF is saving to your computer. Attach it directly or share the link below.
                  </p>
                </div>
              </div>
              <button
                type='button'
                onClick={() => setShowShareModal(false)}
                className='text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer'
              >
                <X size={18} />
              </button>
            </div>

            {/* Download Status Banner */}
            <div className='p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900'>
              <CheckCircle2 size={16} className='text-emerald-600 shrink-0 mt-0.5' />
              <div className='flex-1'>
                <p className='font-semibold'>PDF Saved to Your Computer</p>
                <p className='text-[11.5px] text-emerald-800 mt-0.5 leading-relaxed'>
                  Your placement-ready resume has been downloaded to your <span className='font-semibold'>Downloads folder</span>. You can attach this file directly when applying on job portals or sending messages.
                </p>
              </div>
              <button
                type='button'
                onClick={() => onDownloadPdf()}
                disabled={downloadingPdf}
                className='px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg shrink-0 inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs'
                title='Download another copy'
              >
                <Download size={12} />
                <span>Download Again</span>
              </button>
            </div>

            {/* Public Link Box */}
            <div className='space-y-1.5'>
              <label className='block text-xs font-semibold text-slate-700'>
                Direct Recruiter Link (No login required)
              </label>
              <div className='flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-xl'>
                <input
                  type='text'
                  readOnly
                  value={getPublicShareUrl() || 'Saving resume to generate public link...'}
                  className='flex-1 px-2.5 py-1 text-xs text-slate-800 bg-transparent outline-none font-mono select-all'
                />
                <button
                  type='button'
                  onClick={handleCopyShareLink}
                  disabled={!getPublicShareUrl()}
                  className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#1F285B] hover:bg-[#161D44] active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50'
                >
                  {shareCopied ? (
                    <>
                      <Check size={13} />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Share Targets */}
            <div className='pt-1 space-y-2'>
              <span className='block text-[11px] font-bold text-slate-400 uppercase tracking-wider'>
                Quick Share via Apps
              </span>
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
                {/* WhatsApp */}
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `Hi, please find my verified resume PDF (attached). You can also view my verified credentials online at: ${getPublicShareUrl()}`
                  )}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-xs font-semibold text-slate-700 hover:text-emerald-800'
                >
                  <MessageSquare size={16} className='text-emerald-600' />
                  <span className='text-[11px]'>WhatsApp</span>
                </a>

                {/* Email to Recruiter */}
                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    `Application & Verified Resume - ${resumeDoc.personalInfo?.fullName || 'Candidate'}`
                  )}&body=${encodeURIComponent(
                    `Hello,\n\nPlease find attached my verified resume PDF from my Downloads folder.\n\nYou can also verify my credentials and profile directly on CodeGuru:\n${getPublicShareUrl()}\n\nThank you!\n${resumeDoc.personalInfo?.fullName || ''}`
                  )}`}
                  className='flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-xs font-semibold text-slate-700 hover:text-indigo-800'
                >
                  <Mail size={16} className='text-indigo-600' />
                  <span className='text-[11px]'>Email</span>
                </a>

                {/* LinkedIn */}
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                    getPublicShareUrl()
                  )}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-xs font-semibold text-slate-700 hover:text-blue-800'
                >
                  <Globe size={16} className='text-blue-600' />
                  <span className='text-[11px]'>LinkedIn</span>
                </a>

                {/* Native Device Share */}
                <button
                  type='button'
                  onClick={handleNativeShare}
                  className='flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border border-slate-200 hover:border-purple-300 hover:bg-purple-50/50 transition-all text-xs font-semibold text-slate-700 hover:text-purple-800 cursor-pointer'
                >
                  <Share2 size={16} className='text-purple-600' />
                  <span className='text-[11px]'>More...</span>
                </button>
              </div>
            </div>

            {/* Verification Footer */}
            <div className='pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500'>
              <div className='flex items-center gap-1 text-emerald-700 font-medium'>
                <ShieldCheck size={13} className='text-emerald-600' />
                <span>Verified ATS Recruiter View</span>
              </div>
              {getPublicShareUrl() && (
                <a
                  href={getPublicShareUrl()}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 text-[#344499] hover:underline font-semibold'
                >
                  <span>Preview Public Page</span>
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
