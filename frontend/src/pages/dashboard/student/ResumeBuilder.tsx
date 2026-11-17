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
                ? { ...item, version: savedRecord.version, updated_at: savedRecord.updated_at, document: savedRecord.document || newDoc }
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

  // 5b. Rename resume
  const handleRenameResume = async (id: string, newTitle: string): Promise<boolean> => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      toast.error('Resume name cannot be empty.');
      return false;
    }
    try {
      const res = await apiClient.patch(`/assistant/resume/${id}/rename`, { title: trimmed });
      if (res.data?.success) {
        setResumesList((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  title: trimmed,
                  updated_at: res.data.data?.updated_at || new Date().toISOString(),
                }
              : item
          )
        );
        if (resumeRecord?.id === id) {
          setResumeRecord((prev) => (prev ? { ...prev, title: trimmed } : null));
        }
        toast.success(`Renamed to "${trimmed}"!`);
        return true;
      }
      return false;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to rename resume.');
      return false;
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
          document: rec.document || fresh,
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

  const handleDownloadPDF = useCallback(async () => {
    const previewEl =
      previewRef.current ||
      (document.querySelector('[data-resume-print-root]') as HTMLElement);
    if (!previewEl || exporting) return;
    setExporting(true);
    const toastId = toast.loading('Preparing downloadable PDF...');

    // Wait for document fonts to be ready
    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch {
      // ignore
    }

    // Wait for any images (e.g. avatars, logos) inside previewEl to load
    try {
      const images = Array.from(previewEl.querySelectorAll('img'));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
        })
      );
    } catch {
      // ignore
    }

    const exportStyle = document.createElement('style');
    exportStyle.id = 'resume-export-style';
    exportStyle.textContent = `
      .exporting-pdf .print\\:hidden,
      .exporting-pdf button,
      .exporting-pdf [title="Change profile photo"],
      .exporting-pdf [data-pagebreak-indicator],
      .exporting-pdf [data-avatar-hidden-img] {
        display: none !important;
      }
      .exporting-pdf [title="Double-click to edit"] {
        background-color: transparent !important;
        cursor: default !important;
        box-shadow: none !important;
      }
      .exporting-pdf img:not([data-avatar-hidden-img]) {
        display: inline-block !important;
      }
      .exporting-pdf [data-avatar-container] {
        background-size: cover !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }
    `;
    document.head.appendChild(exportStyle);
    previewEl.classList.add('exporting-pdf');

    // Create an offscreen 1x1 canvas to accurately convert ANY CSS color (oklch, oklab, color-mix, vars)
    // to standard 8-bit sRGB (rgb/rgba) that html2canvas can parse 100% reliably.
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
    const colorCache = new Map<string, string>();

    const toRgbColor = (cssColor: string): string => {
      if (!cssColor || cssColor === 'transparent' || cssColor === 'inherit' || cssColor === 'initial') {
        return cssColor;
      }
      if (/^#([0-9a-f]{3,8})$/i.test(cssColor)) return cssColor;
      if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/i.test(cssColor)) return cssColor;
      const cached = colorCache.get(cssColor);
      if (cached) return cached;
      if (!colorCtx) return '#000000';
      try {
        colorCtx.clearRect(0, 0, 1, 1);
        colorCtx.fillStyle = cssColor;
        colorCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
        const res =
          a === 0
            ? 'transparent'
            : a === 255
            ? `rgb(${r}, ${g}, ${b})`
            : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
        colorCache.set(cssColor, res);
        return res;
      } catch {
        return '#000000';
      }
    };

    const convertColorString = (val: string): string => {
      if (!val || typeof val !== 'string') return val;
      if (val.includes('oklch') || val.includes('oklab') || val.includes('color-mix')) {
        return val
          .replace(/oklch\([^)]+\)/g, (m) => toRgbColor(m))
          .replace(/oklab\([^)]+\)/g, (m) => toRgbColor(m))
          .replace(/color-mix\([^)]+\)/g, '#1e293b');
      }
      return val;
    };

    const wrapGetComputedStyle = (
      origFn: typeof window.getComputedStyle,
      owningWin: Window
    ) => {
      return function (elt: Element, pseudoElt?: string | null) {
        let style: CSSStyleDeclaration;
        const eltWin = elt?.ownerDocument?.defaultView;
        if (eltWin && eltWin !== owningWin && typeof eltWin.getComputedStyle === 'function') {
          try {
            style = eltWin.getComputedStyle(elt, pseudoElt);
          } catch {
            style = origFn.call(owningWin, elt, pseudoElt);
          }
        } else {
          style = origFn.call(owningWin, elt, pseudoElt);
        }

        return new Proxy(style, {
          get(target, prop) {
            const val = Reflect.get(target, prop, target);
            if (typeof val === 'function') {
              if (prop === 'getPropertyValue') {
                return function (propName: string) {
                  const rawVal = target.getPropertyValue(propName);
                  return convertColorString(rawVal);
                };
              }
              return val.bind(target);
            }
            if (typeof val === 'string') {
              return convertColorString(val);
            }
            return val;
          },
        });
      };
    };

    // Pre-flight setup: Monkey-patch parent window.getComputedStyle & set solid background
    // html2canvas calls unqualified getComputedStyle(ownerDocument.body) BEFORE and DURING rendering!
    const originalWindowGetComputedStyle = window.getComputedStyle;
    const prevDocBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;

    try {
      window.getComputedStyle = wrapGetComputedStyle(originalWindowGetComputedStyle, window);
      document.documentElement.style.backgroundColor = '#ffffff';
      document.body.style.backgroundColor = '#ffffff';

      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;
      const filename = getCandidateFilename();

      const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg' as const, quality: 0.99 },
        html2canvas: {
          scale: 2.5,
          useCORS: true,
          allowTaint: true,
          imageTimeout: 5000,
          logging: false,
          scrollY: 0,
          scrollX: 0,
          backgroundColor: '#ffffff',
          windowWidth: 800,
          onclone: (clonedDoc: Document) => {
            // ── LAYER 1: Explicitly set solid background & colors on root & body ──
            if (clonedDoc.documentElement) {
              clonedDoc.documentElement.style.backgroundColor = '#ffffff';
              clonedDoc.documentElement.style.color = '#000000';
            }
            if (clonedDoc.body) {
              clonedDoc.body.style.backgroundColor = '#ffffff';
              clonedDoc.body.style.color = '#000000';
            }

            // ── LAYER 2: Intercept cloned window's getComputedStyle with Proxy ──
            const clonedWin = clonedDoc.defaultView;
            if (clonedWin && clonedWin !== window) {
              clonedWin.getComputedStyle = wrapGetComputedStyle(clonedWin.getComputedStyle, clonedWin);
            }

            // ── LAYER 3: Replace all oklch / oklab in all <style> tags in clonedDoc ──
            clonedDoc.querySelectorAll('style').forEach((styleEl) => {
              if (
                styleEl.textContent &&
                (styleEl.textContent.includes('oklch') ||
                  styleEl.textContent.includes('oklab') ||
                  styleEl.textContent.includes('color-mix'))
              ) {
                styleEl.textContent = styleEl.textContent
                  .replace(/oklch\([^)]+\)/g, (match) => toRgbColor(match))
                  .replace(/oklab\([^)]+\)/g, (match) => toRgbColor(match))
                  .replace(/color-mix\([^)]+\)/g, '#1e293b');
              }
            });

            // ── LAYER 4: Replace any oklch in inline styles across the cloned document ──
            clonedDoc.querySelectorAll<HTMLElement>('*').forEach((el) => {
              const inline = el.getAttribute('style');
              if (
                inline &&
                (inline.includes('oklch') || inline.includes('oklab') || inline.includes('color-mix'))
              ) {
                el.setAttribute(
                  'style',
                  inline
                    .replace(/oklch\([^)]+\)/g, (m) => toRgbColor(m))
                    .replace(/oklab\([^)]+\)/g, (m) => toRgbColor(m))
                    .replace(/color-mix\([^)]+\)/g, '#1e293b')
                );
              }
            });

            // ── LAYER 5: Configure printRoot A4 dimensions & clean layout ──
            const printRoot = clonedDoc.querySelector('[data-resume-print-root]') as HTMLElement;
            if (printRoot) {
              printRoot.style.transform = 'none';
              printRoot.style.transformOrigin = 'initial';
              printRoot.style.margin = '0 auto';
              printRoot.style.marginBottom = '0px';
              printRoot.style.marginTop = '0px';
              printRoot.style.width = '800px';
              printRoot.style.maxWidth = '800px';
              printRoot.style.boxShadow = 'none';
              printRoot.style.border = 'none';
              printRoot.style.borderRadius = '0';
              printRoot.style.overflow = 'visible';
              printRoot.style.backgroundColor = '#ffffff';

              const innerWrapper = printRoot.firstElementChild as HTMLElement;
              if (innerWrapper) {
                innerWrapper.style.boxShadow = 'none';
                innerWrapper.style.border = 'none';
              }

              // Apply solid RGB inline styles to all elements inside printRoot
              const allElements = printRoot.querySelectorAll<HTMLElement>('*');
              allElements.forEach((el) => {
                const computed = window.getComputedStyle(el);

                // Text color
                if (computed.color && computed.color !== 'rgba(0, 0, 0, 0)' && computed.color !== 'transparent') {
                  el.style.color = toRgbColor(computed.color);
                }

                // Background color
                if (
                  computed.backgroundColor &&
                  computed.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                  computed.backgroundColor !== 'transparent'
                ) {
                  el.style.backgroundColor = toRgbColor(computed.backgroundColor);
                }

                // Border colors
                if (computed.borderTopColor && computed.borderTopWidth !== '0px') {
                  el.style.borderTopColor = toRgbColor(computed.borderTopColor);
                }
                if (computed.borderBottomColor && computed.borderBottomWidth !== '0px') {
                  el.style.borderBottomColor = toRgbColor(computed.borderBottomColor);
                }
                if (computed.borderLeftColor && computed.borderLeftWidth !== '0px') {
                  el.style.borderLeftColor = toRgbColor(computed.borderLeftColor);
                }
                if (computed.borderRightColor && computed.borderRightWidth !== '0px') {
                  el.style.borderRightColor = toRgbColor(computed.borderRightColor);
                }

                // Box shadow oklch removal
                if (computed.boxShadow && computed.boxShadow !== 'none' && computed.boxShadow.includes('oklch')) {
                  el.style.boxShadow = computed.boxShadow.replace(/oklch\([^)]+\)/g, (m) => toRgbColor(m));
                }

                // Clean up editing UI
                if (el.hasAttribute('title') && el.getAttribute('title')?.includes('Double-click')) {
                  el.removeAttribute('title');
                  el.style.backgroundColor = 'transparent';
                  el.style.boxShadow = 'none';
                  el.style.cursor = 'default';
                }
              });

              // Also resolve SVGs
              printRoot.querySelectorAll<SVGElement>('svg, svg *').forEach((svgEl) => {
                const computed = window.getComputedStyle(svgEl);
                if (computed.fill && computed.fill !== 'none') {
                  (svgEl as unknown as HTMLElement).style.fill = toRgbColor(computed.fill);
                }
                if (computed.stroke && computed.stroke !== 'none') {
                  (svgEl as unknown as HTMLElement).style.stroke = toRgbColor(computed.stroke);
                }
              });
            }

            // Sync Google Fonts links into clonedDoc
            document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
              const href = link.getAttribute('href');
              if (href && (href.includes('fonts.googleapis.com') || href.includes('fonts.gstatic.com'))) {
                clonedDoc.head.appendChild(link.cloneNode(true));
              }
            });

            if (document.fonts) {
              document.fonts.forEach((font) => {
                try {
                  clonedDoc.fonts.add(font);
                } catch {
                  // ignore
                }
              });
            }

            // Remove all interactive buttons and hidden elements
            clonedDoc
              .querySelectorAll('button, .print\\:hidden, [data-pagebreak-indicator], [title="Change profile photo"]')
              .forEach((el) => {
                (el as HTMLElement).style.display = 'none';
              });

            // ── LAYER 6: Avatar & Image Rendering Integrity ──
            // 6A. Ensure all avatar containers preserve exact circular cover background without distortion
            clonedDoc.querySelectorAll<HTMLElement>('[data-avatar-container]').forEach((avatarEl) => {
              const liveAvatarEl = previewEl.querySelector<HTMLElement>('[data-avatar-container]');
              const bgImg =
                avatarEl.style.backgroundImage ||
                (liveAvatarEl ? window.getComputedStyle(liveAvatarEl).backgroundImage : '');
              if (bgImg && bgImg !== 'none') {
                avatarEl.style.backgroundImage = bgImg;
                avatarEl.style.backgroundSize = 'cover';
                avatarEl.style.backgroundPosition = 'center center';
                avatarEl.style.backgroundRepeat = 'no-repeat';
              }
              // Hide any internal hidden img elements so html2canvas doesn't draw an uncropped img
              avatarEl.querySelectorAll('img').forEach((img) => {
                (img as HTMLElement).style.display = 'none';
              });
            });

            // 6B. Standalone images (logos, badges): ensure proper display without squishing
            const liveImages = Array.from(previewEl.querySelectorAll<HTMLImageElement>('img'));
            const clonedImages = Array.from(clonedDoc.querySelectorAll<HTMLImageElement>('img'));

            clonedImages.forEach((img, idx) => {
              if (
                img.hasAttribute('data-avatar-hidden-img') ||
                img.closest('[data-avatar-container]')
              ) {
                (img as HTMLElement).style.display = 'none';
                return;
              }

              (img as HTMLElement).style.display = 'inline-block';

              const liveImg = liveImages[idx];
              if (!liveImg) return;

              const nw = liveImg.naturalWidth;
              const nh = liveImg.naturalHeight;
              if (!nw || !nh) return;

              const parent = liveImg.parentElement;
              const targetW = liveImg.offsetWidth || parent?.offsetWidth || 80;
              const targetH = liveImg.offsetHeight || parent?.offsetHeight || 80;
              if (!targetW || !targetH) return;

              const targetAspect = targetW / targetH;
              const naturalAspect = nw / nh;

              // If natural aspect ratio differs from target container aspect ratio, center-crop to avoid squishing
              if (Math.abs(naturalAspect - targetAspect) > 0.02) {
                try {
                  let sx = 0;
                  let sy = 0;
                  let sw = nw;
                  let sh = nh;

                  if (naturalAspect > targetAspect) {
                    // Image is wider than container: crop equal amounts left & right
                    sw = nh * targetAspect;
                    sx = (nw - sw) / 2;
                  } else {
                    // Image is taller than container: crop equal amounts top & bottom
                    sh = nw / targetAspect;
                    sy = (nh - sh) / 2;
                  }

                  const cropCanvas = document.createElement('canvas');
                  cropCanvas.width = Math.round(sw);
                  cropCanvas.height = Math.round(sh);
                  const cropCtx = cropCanvas.getContext('2d');
                  if (cropCtx) {
                    cropCtx.imageSmoothingEnabled = true;
                    cropCtx.imageSmoothingQuality = 'high';
                    cropCtx.drawImage(liveImg, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);
                    img.src = cropCanvas.toDataURL('image/png');
                    img.style.objectFit = 'fill';
                  }
                } catch (cropErr) {
                  console.warn('Image aspect ratio crop error:', cropErr);
                }
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
        try {
          const pdfBlob = (await worker.outputPdf('blob')) as Blob;
          if (pdfBlob && pdfBlob.size > 0) {
            const blobUrl = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.style.display = 'none';
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
              link.remove();
              URL.revokeObjectURL(blobUrl);
            }, 3000);
            return;
          }
        } catch (blobErr) {
          console.warn('Direct blob output fallback to save:', blobErr);
        }
        await worker.save(filename);
      };

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PDF generation timed out')), 30000)
      );

      await Promise.race([runPdf(), timeoutPromise]);
      toast.success(`Downloaded ${filename}!`, { id: toastId });
    } catch (err: unknown) {
      console.error('PDF download error:', err);
      const errMsg = err instanceof Error ? err.message : 'Please try again.';
      toast.error(`Download failed: ${errMsg}`, { id: toastId });
    } finally {
      window.getComputedStyle = originalWindowGetComputedStyle;
      document.documentElement.style.backgroundColor = prevDocBg;
      document.body.style.backgroundColor = prevBodyBg;
      previewEl.classList.remove('exporting-pdf');
      document.getElementById('resume-export-style')?.remove();
      setExporting(false);
    }
  }, [exporting, getCandidateFilename]);

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
          onRenameResume={handleRenameResume}
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
