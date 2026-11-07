import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router';
import {
  Download,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Mail,
  Phone,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import apiClient from '@/services/api';
import { toast } from 'react-hot-toast';
import { TemplateRenderer } from '../dashboard/student/resume/templates/TemplateRenderer';
import type { ResumeDocument as ResumeDocType } from '../dashboard/student/resume/types';

interface PublicResumeData {
  id: string;
  title: string;
  schema_version: number;
  version: number;
  document: ResumeDocType;
  updated_at: string;
  author_name?: string;
  author_email?: string;
}

export default function PublicResumeView() {
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumeData, setResumeData] = useState<PublicResumeData | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Fetch Public Resume from backend without auth
  useEffect(() => {
    if (!id) {
      setError('Invalid resume link.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiClient
      .get(`/assistant/public/resume/${id}`)
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.success && res.data?.data) {
          setResumeData(res.data.data);
        } else {
          setError('Resume could not be loaded.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        const msg =
          err?.response?.data?.message ||
          'Resume not found or has been made private by the candidate.';
        setError(msg);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Set document title dynamically
  useEffect(() => {
    if (resumeData?.document?.personalInfo?.fullName) {
      document.title = `${resumeData.document.personalInfo.fullName} - Resume | CodeGuru Verified`;
    } else {
      document.title = 'Candidate Resume | CodeGuru';
    }
  }, [resumeData]);

  // Download PDF Handler using html2pdf
  const handleDownloadPDF = useCallback(async () => {
    const el = printAreaRef.current;
    if (!el || downloading || !resumeData) return;

    setDownloading(true);
    const toastId = toast.loading('Generating verified PDF document...');

    try {
      const exportStyle = document.createElement('style');
      exportStyle.id = 'resume-export-style';
      exportStyle.textContent = `
        .exporting-pdf .print\\:hidden,
        .exporting-pdf button {
          display: none !important;
        }
        .exporting-pdf [data-section-heading] {
          padding-bottom: 3.5mm !important;
          margin-bottom: 6px !important;
        }
      `;
      document.head.appendChild(exportStyle);
      el.classList.add('exporting-pdf');

      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      const safeName = (
        resumeData.document.personalInfo?.fullName ||
        resumeData.author_name ||
        'Candidate'
      )
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_');
      const filename = `${safeName}_Resume.pdf`;

      const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
          scrollX: 0,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc: Document) => {
            clonedDoc.querySelectorAll('[data-section-heading]').forEach((el) => {
              const htmlEl = el as HTMLElement;
              htmlEl.style.paddingBottom = '3.5mm';
              htmlEl.style.marginBottom = '6px';
            });
            const canvas = clonedDoc.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const convertColor = (colorStr: string): string => {
              if (ctx) {
                try {
                  ctx.fillStyle = '#111827';
                  ctx.fillStyle = colorStr;
                  if (!ctx.fillStyle.startsWith('oklch') && !ctx.fillStyle.startsWith('oklab')) {
                    return ctx.fillStyle;
                  }
                } catch {
                  // fallback
                }
              }
              const lMatch = colorStr.match(/oklch\(\s*([\d.]+)/);
              if (lMatch) {
                const L = parseFloat(lMatch[1]);
                if (L < 0.25) return '#0f172a';
                if (L < 0.45) return '#1e293b';
                if (L < 0.65) return '#475569';
                if (L < 0.85) return '#cbd5e1';
                return '#f8fafc';
              }
              return '#1e293b';
            };

            clonedDoc.querySelectorAll('style').forEach((styleEl) => {
              if (styleEl.textContent) {
                styleEl.textContent = styleEl.textContent
                  .replace(/oklch\([^)]+\)/g, (match) => convertColor(match))
                  .replace(/oklab\([^)]+\)/g, (match) => convertColor(match))
                  .replace(/color-mix\([^)]+\)/g, '#1e293b');
              }
            });
          },
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak: {
          mode: ['avoid-all', 'css', 'legacy'],
          avoid: ['.page-break-inside-avoid', 'h1', 'h2', 'header', 'li', 'section'],
        },
      };

      await html2pdf().set(opt).from(el).save();
      toast.success(`Downloaded ${filename}!`, { id: toastId });
    } catch (err) {
      console.warn('PDF download fallback to print:', err);
      toast.dismiss(toastId);
      window.print();
    } finally {
      el.classList.remove('exporting-pdf');
      document.getElementById('resume-export-style')?.remove();
      setDownloading(false);
    }
  }, [downloading, resumeData]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success('Resume link copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  // ── SKELETON / LOADING STATE ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className='min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4'>
        <div className='w-full max-w-xl bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center space-y-4'>
          <div className='w-12 h-12 rounded-full bg-indigo-50 text-[#344499] flex items-center justify-center mx-auto animate-pulse'>
            <Loader2 size={24} className='animate-spin' />
          </div>
          <div>
            <h3 className='text-base font-bold text-slate-800'>Loading Candidate Resume...</h3>
            <p className='text-xs text-slate-500 mt-1'>
              Retrieving verified placement credentials from CodeGuru.
            </p>
          </div>
          <div className='h-2 bg-slate-100 rounded-full overflow-hidden max-w-xs mx-auto'>
            <div className='h-full bg-gradient-to-r from-indigo-500 to-purple-600 animate-[shimmer_1.5s_infinite]' />
          </div>
        </div>
      </div>
    );
  }

  // ── ERROR / NOT FOUND STATE ─────────────────────────────────────────────────
  if (error || !resumeData) {
    return (
      <div className='min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4'>
        <div className='w-full max-w-md bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center space-y-4'>
          <div className='w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto'>
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 className='text-lg font-bold text-slate-900'>Resume Unavailable</h3>
            <p className='text-xs text-slate-600 mt-1.5 leading-relaxed'>
              {error || 'The requested resume link could not be found or has expired.'}
            </p>
          </div>
          <div className='pt-2'>
            <Link
              to='/'
              className='inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#344499] hover:bg-[#2b3880] transition-colors shadow-sm'
            >
              Visit CodeGuru LMS
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const doc = resumeData.document;
  const pi = doc?.personalInfo;
  const fullName = pi?.fullName || resumeData.author_name || 'Candidate';
  const roleHeadline = pi?.headline || doc?.targetRole || 'Software Engineer Candidate';

  return (
    <div className='min-h-screen bg-[#F8FAFC] text-slate-800 antialiased font-sans pb-24 print:bg-white print:p-0'>
      {/* ── TOP RECRUITER ACTION BAR (Hidden in print) ────────────────────────── */}
      <nav className='sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs print:hidden'>
        <div className='max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap'>
          {/* Left: CodeGuru Verified Candidate Branding */}
          <div className='flex items-center gap-3'>
            <div className='w-8 h-8 rounded-xl bg-gradient-to-br from-[#1F285B] to-[#344499] text-white flex items-center justify-center font-bold text-sm shadow-xs'>
              CG
            </div>
            <div>
              <div className='flex items-center gap-1.5'>
                <span className='font-bold text-sm text-slate-900'>{fullName}</span>
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                  <ShieldCheck size={11} className='text-emerald-600' />
                  <span>Verified Candidate</span>
                </span>
              </div>
              <p className='text-[11px] text-slate-500 font-medium truncate max-w-xs'>
                {roleHeadline}
              </p>
            </div>
          </div>

          {/* Right: Quick Recruiter Actions (Contact, Copy Link, Print, Download) */}
          <div className='flex items-center gap-2 flex-wrap'>
            {pi?.email && (
              <a
                href={`mailto:${pi.email}`}
                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs'
                title='Send email to candidate'
              >
                <Mail size={13} className='text-slate-500' />
                <span className='hidden sm:inline'>Contact</span>
              </a>
            )}

            {pi?.phone && (
              <a
                href={`tel:${pi.phone}`}
                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs'
                title='Call candidate'
              >
                <Phone size={13} className='text-slate-500' />
                <span className='hidden sm:inline'>Call</span>
              </a>
            )}

            <button
              type='button'
              onClick={handleCopyLink}
              className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs cursor-pointer'
              title='Copy shareable resume link'
            >
              {copied ? (
                <>
                  <CheckCircle2 size={13} className='text-emerald-600' />
                  <span className='text-emerald-700'>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={13} className='text-slate-500' />
                  <span className='hidden sm:inline'>Copy Link</span>
                </>
              )}
            </button>

            <button
              type='button'
              onClick={handlePrint}
              className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs cursor-pointer'
              title='Print resume'
            >
              <Printer size={13} className='text-slate-500' />
              <span className='hidden md:inline'>Print</span>
            </button>

            <button
              type='button'
              onClick={handleDownloadPDF}
              disabled={downloading}
              className='inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[#1F285B] hover:bg-[#161D44] active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-60'
            >
              {downloading ? (
                <Loader2 size={13} className='animate-spin' />
              ) : (
                <Download size={13} />
              )}
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ── NOTICE FOR RECRUITERS ────────────────────────────────────────────── */}
      <div className='max-w-[840px] mx-auto px-4 mt-4 print:hidden'>
        <div className='flex items-center justify-between p-2.5 px-4 rounded-xl bg-blue-50/70 border border-blue-200/60 text-[11.5px] text-blue-900'>
          <div className='flex items-center gap-2'>
            <ShieldCheck size={14} className='text-blue-600 shrink-0' />
            <span>
              This is a verified placement profile hosted on <strong>CodeGuru LMS</strong>. Academic
              achievements and capstones are authenticated.
            </span>
          </div>
          <span className='text-[10.5px] text-blue-700/80 font-medium shrink-0 ml-3 hidden sm:inline'>
            1-Click Recruiter View
          </span>
        </div>
      </div>

      {/* ── RESUME CANVAS (A4 Format) ────────────────────────────────────────── */}
      <main className='max-w-[840px] mx-auto px-2 sm:px-4 mt-4 select-text'>
        <div
          ref={printAreaRef}
          data-resume-print-root
          className='bg-white rounded-md shadow-md border border-slate-200/80 overflow-hidden print:shadow-none print:border-none'
        >
          <TemplateRenderer data={doc} readOnly={true} onTriggerRewrite={() => {}} rewritingKey={null} />
        </div>
      </main>
    </div>
  );
}
