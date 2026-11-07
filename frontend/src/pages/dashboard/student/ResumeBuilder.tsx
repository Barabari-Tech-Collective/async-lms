import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '@/services/api';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';

import type { ResumeDocument as ResumeDocType, ResumeRecord, ResumeListItem, Section } from './resume/types';
import { getCategoryConfig } from './resume/types';
import { DEFAULT_SECTIONS, createEmptyResume } from './resume/resumeUtils';
import ResumeRecycleBinModal from './resume/ResumeRecycleBinModal';
import type { RecycledResumeItem } from './resume/ResumeRecycleBinModal';
import { ResumeDashboardView } from './resume/ResumeDashboardView';
import { ResumeStepperEditor } from './resume/ResumeStepperEditor';
import { ResumePreviewView } from './resume/ResumePreviewView';

export default function ResumeBuilder() {
  const user = useAppSelector(selectUser);

  const [resumesList, setResumesList] = useState<ResumeListItem[]>([]);
  const [resumeRecord, setResumeRecord] = useState<ResumeRecord | null>(null);
  const [resumeDoc, setResumeDoc] = useState<ResumeDocType>(() => createEmptyResume(user));
  const [initialLoading, setInitialLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [, setSaveStatus] = useState<'saved' | 'saving' | 'conflict' | 'error'>('saved');

  // Multi-Resume Management & View State
  const [viewMode, setViewMode] = useState<'dashboard' | 'editor' | 'preview'>('dashboard');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [activeFilter, setActiveFilter] = useState<'drafted' | 'completed'>('drafted');
  const [showRecycleBinModal, setShowRecycleBinModal] = useState(false);
  const [recycleBinCount, setRecycleBinCount] = useState<number>(0);
  const [exporting, setExporting] = useState(false);
  const [polishingWithAI, setPolishingWithAI] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRecordRef = useRef<ResumeRecord | null>(null);
  const resumeDocRef = useRef<ResumeDocType>(resumeDoc);

  // Keep ref in sync with latest document
  resumeDocRef.current = resumeDoc;

  const fetchRecycleBinCount = useCallback(async () => {
    try {
      const res = await apiClient.get('/assistant/resumes/bin');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setRecycleBinCount(res.data.data.length);
      }
    } catch {
      // silent
    }
  }, []);

  // 1. Initial Load: Fetch all resumes for the authenticated student
  useEffect(() => {
    let isMounted = true;
    if (!user?.id) return;

    // Purge legacy un-scoped draft
    try {
      localStorage.removeItem('codeguru_resume_draft');
    } catch {}

    async function loadSavedResume() {
      try {
        const res = await apiClient.get('/assistant/resumes');
        if (res.data?.success && isMounted) {
          const list = (res.data.data || []) as ResumeListItem[];
          setResumesList(list);

          if (list.length === 0) {
            setResumeRecord(null);
            resumeRecordRef.current = null;
            const freshDoc = createEmptyResume(user);
            setResumeDoc(freshDoc);
            resumeDocRef.current = freshDoc;
            setInitialLoading(false);
            return;
          }

          // Pick primary resume or most recent
          const target = list.find((r) => r.is_primary) || list[0];
          const fullRes = await apiClient.get(`/assistant/resume/${target.id}`);
          if (fullRes.data?.success && isMounted) {
            const record = fullRes.data.data as ResumeRecord;
            let finalDoc = record.document;

            // Sanitize cross-student email differences
            if (
              user?.email &&
              finalDoc?.personalInfo?.email &&
              finalDoc.personalInfo.email.toLowerCase() !== user.email.toLowerCase()
            ) {
              finalDoc = {
                ...finalDoc,
                personalInfo: {
                  ...finalDoc.personalInfo,
                  fullName: user.full_name || finalDoc.personalInfo.fullName,
                  email: user.email,
                  avatarUrl: '',
                },
              };
            }

            setResumeRecord(record);
            resumeRecordRef.current = record;
            setResumeDoc(finalDoc);
            resumeDocRef.current = finalDoc;

            if (finalDoc.sectionOrder && Array.isArray(finalDoc.sectionOrder)) {
              const order = [...finalDoc.sectionOrder];
              if (!order.includes('events')) {
                const expIdx = order.indexOf('experience');
                if (expIdx !== -1) order.splice(expIdx + 1, 0, 'events');
                else order.push('events');
              }
              setSections((prev) => {
                return [...prev].sort((a, b) => {
                  const idxA = order.indexOf(a.id);
                  const idxB = order.indexOf(b.id);
                  if (idxA === -1 && idxB === -1) return 0;
                  if (idxA === -1) return 1;
                  if (idxB === -1) return -1;
                  return idxA - idxB;
                });
              });
            }
            setSaveStatus('saved');
          }
        }
      } catch (err) {
        console.error('Failed to load student resumes:', err);
        setResumeRecord(null);
        resumeRecordRef.current = null;
        toast.error('Failed to connect to cloud storage.');
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    }
    loadSavedResume();
    fetchRecycleBinCount();
    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.email, user?.full_name, fetchRecycleBinCount]);

  // 2. Autosave with Debounce & Version Sync for Active Resume
  const triggerAutosave = useCallback((newDoc: ResumeDocType) => {
    if (!resumeRecordRef.current?.id) return;

    setSaveStatus('saving');
    resumeDocRef.current = newDoc;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      try {
        const currentRecord = resumeRecordRef.current;
        if (!currentRecord?.id) return;

        const payload = {
          title: currentRecord.title,
          document: newDoc,
          expectedVersion: currentRecord.version ?? null,
        };

        const res = await apiClient.put(`/assistant/resume/${currentRecord.id}`, payload);
        if (res.data?.success) {
          const savedRecord = res.data.data as ResumeRecord;
          setResumeRecord(savedRecord);
          resumeRecordRef.current = savedRecord;
          setResumesList((prev) =>
            prev.map((item) =>
              item.id === savedRecord.id
                ? { ...item, version: savedRecord.version, updated_at: savedRecord.updated_at }
                : item
            )
          );
          setSaveStatus('saved');
        }
      } catch (err: any) {
        if (err.response?.status === 409) {
          setSaveStatus('conflict');
          toast.error('Draft conflict: Updated in another window.');
        } else {
          setSaveStatus('error');
        }
      }
    }, 700);
  }, []);

  const handleUpdateDocument = useCallback(
    (updated: ResumeDocType) => {
      setResumeDoc(updated);
      resumeDocRef.current = updated;
      triggerAutosave(updated);
    },
    [triggerAutosave]
  );

  // 3. Switch active resume
  const handleSelectResume = async (targetId: string) => {
    if (targetId === resumeRecord?.id) return;
    try {
      const res = await apiClient.get(`/assistant/resume/${targetId}`);
      if (res.data?.success && res.data.data) {
        const rec = res.data.data as ResumeRecord;
        setResumeRecord(rec);
        resumeRecordRef.current = rec;
        setResumeDoc(rec.document);
        resumeDocRef.current = rec.document;

        if (rec.document.sectionOrder && Array.isArray(rec.document.sectionOrder)) {
          const order = [...rec.document.sectionOrder];
          if (!order.includes('events')) {
            const expIdx = order.indexOf('experience');
            if (expIdx !== -1) order.splice(expIdx + 1, 0, 'events');
            else order.push('events');
          }
          setSections((prev) => {
            return [...prev].sort((a, b) => {
              const idxA = order.indexOf(a.id);
              const idxB = order.indexOf(b.id);
              if (idxA === -1 && idxB === -1) return 0;
              if (idxA === -1) return 1;
              if (idxB === -1) return -1;
              return idxA - idxB;
            });
          });
        }
        setSaveStatus('saved');
      }
    } catch {
      toast.error('Failed to load resume.');
    }
  };

  // 4. Duplicate resume
  const handleDuplicateResume = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await apiClient.post(`/assistant/resume/${id}/duplicate`);
      if (res.data?.success && res.data.data) {
        const cloned = res.data.data as ResumeRecord;
        const newListItem: ResumeListItem = {
          id: cloned.id,
          title: cloned.title,
          version: cloned.version,
          is_primary: cloned.is_primary || false,
          template_id: cloned.document?.templateId,
          created_at: cloned.created_at || new Date().toISOString(),
          updated_at: cloned.updated_at,
        };
        setResumesList((prev) => [newListItem, ...prev]);
        setResumeRecord(cloned);
        resumeRecordRef.current = cloned;
        setResumeDoc(cloned.document);
        resumeDocRef.current = cloned.document;
        toast.success(`Duplicated "${cloned.title}"!`);
      }
    } catch {
      toast.error('Failed to duplicate resume.');
    }
  };

  // 5. Set primary resume
  const handleSetPrimary = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await apiClient.patch(`/assistant/resume/${id}/primary`);
      if (res.data?.success) {
        setResumesList((prev) =>
          prev.map((item) => ({ ...item, is_primary: item.id === id }))
        );
        if (resumeRecord?.id === id) {
          setResumeRecord((prev) => (prev ? { ...prev, is_primary: true } : null));
        }
        toast.success('Set as primary placement resume!');
      }
    } catch {
      toast.error('Failed to set primary resume.');
    }
  };

  // 6. Delete resume (Soft delete to Recycle Bin)
  const handleDeleteResume = async (idToDelete?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const targetId = idToDelete || resumeRecord?.id;
    if (!targetId) return;

    const targetItem = resumesList.find((r) => r.id === targetId);
    const targetTitle = targetItem?.title || resumeRecord?.title || 'this resume';

    if (!window.confirm(`Move "${targetTitle}" to Recycle Bin? You can restore it anytime.`)) {
      return;
    }

    try {
      await apiClient.delete(`/assistant/resume/${targetId}`);
      const updatedList = resumesList.filter((r) => r.id !== targetId);
      setResumesList(updatedList);

      if (updatedList.length === 0) {
        setResumeRecord(null);
        resumeRecordRef.current = null;
        setResumeDoc(createEmptyResume(user));
      } else if (targetId === resumeRecord?.id) {
        const next = updatedList.find((r) => r.is_primary) || updatedList[0];
        await handleSelectResume(next.id);
      }

      fetchRecycleBinCount();
      toast.success(`Moved "${targetTitle}" to Recycle Bin.`);
    } catch {
      toast.error('Failed to move resume to Recycle Bin.');
    }
  };

  const handleRestoredFromModal = async (restored: RecycledResumeItem) => {
    try {
      const listRes = await apiClient.get('/assistant/resumes');
      if (listRes.data?.success) {
        const freshList = listRes.data.data as ResumeListItem[];
        setResumesList(freshList);
        if (!resumeRecordRef.current || freshList.length === 1) {
          await handleSelectResume(restored.id);
        }
      }
      fetchRecycleBinCount();
    } catch (err) {
      console.error('Failed to sync after modal restore:', err);
    }
  };

  const handleBinListUpdated = () => {
    fetchRecycleBinCount();
  };

  // 7. Create from template
  const handleCreateFromTemplate = async (templateId: string = 'ivy-standard') => {
    const chosenCat = 'general';
    const catCfg = getCategoryConfig(chosenCat);
    const fresh = createEmptyResume(user, chosenCat, catCfg.defaultRole);
    if (templateId !== 'blank') {
      fresh.templateId = templateId;
    }
    (fresh as any).status = 'draft';

    setResumeDoc(fresh);
    resumeDocRef.current = fresh;
    setCurrentStep(1);
    setViewMode('editor');

    try {
      setSaveStatus('saving');
      const titleToUse =
        resumesList.length === 0 ? 'Primary Resume' : `Resume ${resumesList.length + 1}`;
      const res = await apiClient.post('/assistant/resume/new', {
        title: titleToUse,
        document: fresh,
        is_primary: resumesList.length === 0,
      });
      if (res.data?.success && res.data.data) {
        const rec = res.data.data as ResumeRecord;
        const newListItem: ResumeListItem = {
          id: rec.id,
          title: rec.title,
          category: rec.document?.category || chosenCat,
          target_role: rec.document?.targetRole,
          version: rec.version,
          is_primary: rec.is_primary || false,
          template_id: rec.document?.templateId,
          created_at: rec.created_at || new Date().toISOString(),
          updated_at: rec.updated_at,
        };
        setResumesList((prev) => [newListItem, ...prev]);
        setResumeRecord(rec);
        resumeRecordRef.current = rec;
        setSaveStatus('saved');
      }
    } catch (err) {
      console.error('Error creating new draft resume:', err);
    }
  };

  const handleSelectResumeFromDashboard = async (
    id: string,
    mode: 'preview' | 'editor' = 'preview'
  ) => {
    await handleSelectResume(id);
    setViewMode(mode);
    if (mode === 'editor') {
      setCurrentStep(1);
    }
  };

  const handleSaveCompleted = async () => {
    if (!resumeRecord?.id) return;
    const updatedDoc: ResumeDocType = {
      ...resumeDoc,
      status: 'completed' as const,
    };
    setResumeDoc(updatedDoc);
    resumeDocRef.current = updatedDoc;

    setResumesList((prev) =>
      prev.map((r) =>
        r.id === resumeRecord.id
          ? ({ ...r, status: 'completed', is_completed: true } as any)
          : r
      )
    );

    try {
      setSaveStatus('saving');
      await apiClient.put(`/assistant/resume/${resumeRecord.id}`, {
        title: resumeRecord.title,
        document: updatedDoc,
        expectedVersion: resumeRecord.version,
      });
      setSaveStatus('saved');
      toast.success('Resume marked as Completed!');
      setViewMode('dashboard');
    } catch {
      toast.error('Failed to update resume status.');
    }
  };

  const handlePolishCurrentResumeWithAI = async () => {
    if (polishingWithAI) return;
    setPolishingWithAI(true);
    try {
      const payload = {
        category: resumeDoc.category || 'general',
        targetRole: resumeDoc.targetRole || resumeDoc.personalInfo?.headline,
        personalInfo: resumeDoc.personalInfo,
        careerObjective: resumeDoc.summary,
        extraSkills: [
          ...(resumeDoc.skills?.languages || []),
          ...(resumeDoc.skills?.frameworks || []),
          ...(resumeDoc.skills?.databases || []),
          ...(resumeDoc.skills?.tools || []),
        ],
        workExperience: resumeDoc.experience || [],
        events: resumeDoc.events || [],
        manualProjects: resumeDoc.projects || [],
        education: resumeDoc.education || [],
      };

      const res = await apiClient.post('/assistant/resume/generate', payload);
      if (res.data?.success && res.data?.data) {
        const generated = res.data.data as ResumeDocType;
        const polishedDoc: ResumeDocType = {
          ...generated,
          templateId: resumeDoc.templateId || generated.templateId,
          sectionOrder: resumeDoc.sectionOrder || generated.sectionOrder,
          personalInfo: {
            ...generated.personalInfo,
            ...resumeDoc.personalInfo,
            headline: generated.personalInfo?.headline || resumeDoc.personalInfo?.headline,
            links: resumeDoc.personalInfo?.links?.length ? resumeDoc.personalInfo.links : generated.personalInfo?.links,
            avatarUrl: resumeDoc.personalInfo?.avatarUrl || generated.personalInfo?.avatarUrl,
          },
        };

        handleUpdateDocument(polishedDoc);
        toast.success('Your resume has been polished with AI!');
      } else {
        toast.error('AI polish returned an incomplete response.');
      }
    } catch (err: any) {
      console.error('Polish error:', err);
      toast.error('AI polish encountered an issue. Please try again.');
    } finally {
      setPolishingWithAI(false);
    }
  };

  const getCandidateFilename = useCallback(() => {
    const fullName = (resumeDoc.personalInfo?.fullName || user?.full_name || 'Student').trim();
    const title = (resumeRecord?.title || resumeDoc.targetRole || 'Resume').trim();
    const safeName = `${fullName}_${title}`.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    return `${safeName}.pdf`;
  }, [resumeDoc.personalInfo?.fullName, resumeDoc.targetRole, resumeRecord?.title, user?.full_name]);

  const handlePrintPDF = useCallback(() => {
    const targetElement =
      previewRef.current ||
      (document.querySelector('[data-resume-print-root]') as HTMLElement);
    if (!targetElement) return;

    const style = document.createElement('style');
    style.id = 'resume-print-style';
    style.textContent = `
      @page {
        size: A4 portrait;
        margin: 0;
      }
      @media print {
        html, body {
          width: 210mm !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not([data-resume-print-root]) {
          display: none !important;
        }
        [data-resume-print-root] {
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        [data-resume-print-root] > div {
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          margin: 0 !important;
          width: 210mm !important;
          max-width: 210mm !important;
          box-sizing: border-box !important;
        }
        [data-resume-print-root] [class*="max-w-"] {
          max-width: 210mm !important;
          width: 210mm !important;
          margin: 0 !important;
          border-left: none !important;
          border-right: none !important;
          border-bottom: none !important;
          box-shadow: none !important;
          box-sizing: border-box !important;
        }
        [data-resume-print-root] [class*="shadow-"] {
          box-shadow: none !important;
        }
        [data-resume-print-root] .grid.grid-cols-12 {
          display: grid !important;
          grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
          width: 100% !important;
        }
        [data-resume-print-root] header .flex-row {
          flex-direction: row !important;
        }
        .page-break-inside-avoid {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        h1, h2, h3, h4 {
          break-after: avoid !important;
          page-break-after: avoid !important;
        }
        .print\\:hidden,
        button,
        [title="Change profile photo"] {
          display: none !important;
        }
        [title="Double-click to edit"] {
          background-color: transparent !important;
          cursor: default !important;
          box-shadow: none !important;
        }
        a {
          text-decoration: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-resume-print-root', '');
    wrapper.style.cssText = 'display:none';
    const clone = targetElement.cloneNode(true) as HTMLElement;

    clone.querySelectorAll('.print\\:hidden, button, [title="Change profile photo"]').forEach((el) => {
      el.remove();
    });
    clone.querySelectorAll('[title]').forEach((el) => {
      (el as HTMLElement).removeAttribute('title');
    });

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    const cleanup = () => {
      document.getElementById('resume-print-style')?.remove();
      wrapper.remove();
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  }, []);

  const handleDownloadPDF = useCallback(async () => {
    const previewEl =
      previewRef.current ||
      (document.querySelector('[data-resume-print-root]') as HTMLElement);
    if (!previewEl || exporting) return;
    setExporting(true);
    const toastId = toast.loading('Preparing downloadable PDF...');

    const exportStyle = document.createElement('style');
    exportStyle.id = 'resume-export-style';
    exportStyle.textContent = `
      .exporting-pdf .print\:hidden,
      .exporting-pdf button,
      .exporting-pdf [title="Change profile photo"] {
        display: none !important;
      }
      .exporting-pdf [title="Double-click to edit"] {
        background-color: transparent !important;
        cursor: default !important;
        box-shadow: none !important;
      }
      .exporting-pdf [data-section-heading] {
        padding-bottom: 3.5mm !important;
        margin-bottom: 6px !important;
      }
    `;
    document.head.appendChild(exportStyle);
    previewEl.classList.add('exporting-pdf');

    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;
      const filename = getCandidateFilename();

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
            const printRoot = clonedDoc.querySelector('[data-resume-print-root]') as HTMLElement;
            if (printRoot) {
              printRoot.style.width = '800px';
              printRoot.style.maxWidth = '800px';
              printRoot.style.boxShadow = 'none';
              printRoot.style.border = 'none';
              printRoot.style.borderRadius = '0';
              printRoot.style.overflow = 'visible';
            }
            clonedDoc.querySelectorAll('[title="Double-click to edit"]').forEach((el) => {
              const htmlEl = el as HTMLElement;
              htmlEl.style.backgroundColor = 'transparent';
              htmlEl.style.boxShadow = 'none';
              htmlEl.removeAttribute('title');
            });
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
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait' as const,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };

      const runPdf = async () => {
        const worker = html2pdf().set(opt).from(previewEl);
        await worker.save();
      };

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PDF generation timed out')), 9000)
      );

      await Promise.race([runPdf(), timeoutPromise]);
      toast.success(`Downloaded ${filename}!`, { id: toastId });
    } catch (err) {
      console.warn('PDF download issue, opening print dialog:', err);
      toast.dismiss(toastId);
      toast('Opening print dialog to save PDF...', { icon: '🖨️' });
      handlePrintPDF();
    } finally {
      previewEl.classList.remove('exporting-pdf');
      document.getElementById('resume-export-style')?.remove();
      setExporting(false);
    }
  }, [exporting, getCandidateFilename, handlePrintPDF]);

  if (initialLoading) {
    return (
      <div className='min-h-[70vh] flex flex-col items-center justify-center gap-3'>
        <Loader2 size={32} className='animate-spin text-[#1e2653]' />
        <p className='text-sm text-slate-500 font-medium'>Loading your verified resume workspace...</p>
      </div>
    );
  }

  return (
    <div className='w-full min-h-screen bg-[#F8FAFC] text-slate-900'>
      {viewMode === 'dashboard' && (
        <ResumeDashboardView
          resumesList={resumesList}
          activeResumeRecordId={resumeRecord?.id}
          onSelectResume={handleSelectResumeFromDashboard}
          onCreateNew={handleCreateFromTemplate}
          onDeleteResume={(id, e) => handleDeleteResume(id, e)}
          onDuplicateResume={(id, e) => handleDuplicateResume(id, e)}
          onSetPrimary={(id, e) => handleSetPrimary(id, e)}
          openRecycleBin={() => setShowRecycleBinModal(true)}
          recycleBinCount={recycleBinCount}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          activeResumeDoc={resumeDoc}
        />
      )}

      {viewMode === 'editor' && (
        <ResumeStepperEditor
          resumeDoc={resumeDoc}
          onUpdate={handleUpdateDocument}
          currentStep={currentStep}
          setCurrentStep={setCurrentStep}
          onBackToDashboard={() => setViewMode('dashboard')}
          onGoToPreview={() => setViewMode('preview')}
          sections={sections}
          user={user}
        />
      )}

      {viewMode === 'preview' && (
        <ResumePreviewView
          resumeDoc={resumeDoc}
          onUpdate={handleUpdateDocument}
          onBackToEditor={() => setViewMode('editor')}
          onSaveCompleted={handleSaveCompleted}
          onDownloadPdf={handleDownloadPDF}
          onPolishWithAI={handlePolishCurrentResumeWithAI}
          polishingWithAI={polishingWithAI}
          downloadingPdf={exporting}
          sections={sections}
          resumeId={resumeRecord?.id}
        />
      )}

      {/* Resume Recycle Bin Modal */}
      <ResumeRecycleBinModal
        open={showRecycleBinModal}
        onClose={() => setShowRecycleBinModal(false)}
        onRestored={handleRestoredFromModal}
        onListUpdated={handleBinListUpdated}
      />
    </div>
  );
}
