import { useState, useRef, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Loader2,
  Download,
  GripVertical,
  Maximize2,
  X,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Search,
  LayoutTemplate,
  Palette,
  FileText,
  Plus,
  Trash2,
  ShieldCheck,
  ArrowRight,
  ChevronDown,
  Copy,
  Star,
  Pencil,
  Check,
  FileEdit,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import apiClient from '@/services/api';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';

import type { ResumeDocument as ResumeDocType, ResumeRecord, ResumeListItem, ResumeMatchResult, Section, ResumeCategory } from './resume/types';
import { CATEGORY_CONFIGS, getCategoryConfig } from './resume/types';
import { DEFAULT_SECTIONS, createEmptyResume, calcLocalMatchAnalysis } from './resume/resumeUtils';
import { ResumeDocument } from './resume/ResumeDocument';
import { InputForm } from './resume/InputForm';
import { TemplateModal } from './resume/templates/TemplateModal';
import { getTemplateMeta, RESUME_TEMPLATES } from './resume/templateRegistry';
import ResumeRecycleBinModal from './resume/ResumeRecycleBinModal';
import type { RecycledResumeItem } from './resume/ResumeRecycleBinModal';

// ── Match Score Bar ───────────────────────────────────────────────────────────
function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className='mb-2'>
      <div className='flex justify-between text-[11px] text-slate-500 mb-1'>
        <span>{label}</span>
        <span className='font-semibold text-slate-700'>{value}%</span>
      </div>
      <div className='h-1.5 bg-slate-100 rounded-full overflow-hidden'>
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ── Sortable Section Item ─────────────────────────────────────────────────────
function SortableSectionItem({ section }: { section: Section }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const Icon = section.icon;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className='flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100/70 text-slate-700 transition-colors group select-none'
    >
      <button
        {...attributes}
        {...listeners}
        className='text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing'
        title='Drag to reorder'
      >
        <GripVertical size={14} />
      </button>
      <Icon size={14} className='text-[#333d7c] shrink-0' />
      <span className='flex-1 text-xs font-semibold text-slate-800'>{section.label}</span>
    </div>
  );
}

// ── Full Preview Modal ────────────────────────────────────────────────────────
function FullPreviewModal({
  data,
  sections,
  onClose,
  onDownload,
  onPrint,
  downloading,
}: {
  data: ResumeDocType;
  sections: Section[];
  onClose: () => void;
  onDownload?: () => void;
  onPrint?: () => void;
  downloading?: boolean;
}) {
  return (
    <div className='fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-2xs'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden'>
        <div className='flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-slate-50/80'>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-[#1e2653] text-sm'>A4 Placement Format Preview</span>
            <span className='text-[11px] text-slate-500 hidden sm:inline'>• FlowCV-standard verified format</span>
          </div>
          <div className='flex items-center gap-2'>
            {onDownload && (
              <button
                type='button'
                onClick={onDownload}
                disabled={downloading}
                className='px-3 py-1.5 text-xs font-bold text-white bg-[#333d7c] hover:bg-[#252d5e] rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-60'
                title='Download resume PDF directly to your device'
              >
                {downloading ? (
                  <>
                    <Loader2 size={13} className='animate-spin' />
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <Download size={13} />
                    <span>Download PDF</span>
                  </>
                )}
              </button>
            )}
            {onPrint && (
              <button
                type='button'
                onClick={onPrint}
                className='px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer'
                title='Print or Save via Browser'
              >
                <FileText size={13} className='text-slate-500' />
                <span>Print</span>
              </button>
            )}
            <button
              onClick={onClose}
              className='p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer'
              title='Close preview'
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className='overflow-y-auto flex-1 p-6 sm:p-10 bg-slate-100/60'>
          <div className='bg-white shadow-md rounded-xl overflow-hidden'>
            <ResumeDocument data={data} sections={sections} readOnly />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ResumeBuilder() {
  const user = useAppSelector(selectUser);
  const getDraftKey = useCallback((uid?: string | number) => (uid ? `codeguru_resume_draft_${uid}` : null), []);

  const [resumesList, setResumesList] = useState<ResumeListItem[]>([]);
  const [resumeRecord, setResumeRecord] = useState<ResumeRecord | null>(null);
  const [resumeDoc, setResumeDoc] = useState<ResumeDocType>(() => createEmptyResume(user));
  const [initialLoading, setInitialLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [matchResult, setMatchResult] = useState<ResumeMatchResult | null>(null);
  const [jdText, setJdText] = useState('');
  const [jdLoading, setJdLoading] = useState(false);
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'conflict' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [conflictData, setConflictData] = useState<{ currentVersion: number; currentResume: any } | null>(null);

  // Multi-Resume Management State
  const [showResumeDropdown, setShowResumeDropdown] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [showNewResumeModal, setShowNewResumeModal] = useState(false);
  const [newResumeTitle, setNewResumeTitle] = useState('');
  const [newResumeType, setNewResumeType] = useState<'blank' | 'clone' | 'wizard'>('blank');
  const [cloneSourceId, setCloneSourceId] = useState('');
  const [switchingResume, setSwitchingResume] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ResumeCategory>('general');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [showRecycleBinModal, setShowRecycleBinModal] = useState(false);
  const [recycleBinCount, setRecycleBinCount] = useState<number>(0);
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRecordRef = useRef<ResumeRecord | null>(null);
  const resumeDocRef = useRef<ResumeDocType>(resumeDoc);

  // Keep ref in sync with latest document
  resumeDocRef.current = resumeDoc;

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowResumeDropdown(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    if (showResumeDropdown || showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showResumeDropdown, showExportMenu]);

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

    // Purge any legacy un-scoped draft to avoid leaking across student accounts on this device
    try {
      localStorage.removeItem('codeguru_resume_draft');
    } catch {}

    const userDraftKey = getDraftKey(user.id);

    // Helper to detect ghost mock boilerplate from prior dev versions
    const isGhostMockResume = (doc: any) => {
      if (!doc) return false;
      const hasMockProject = doc.projects?.some((p: any) => p.title === 'Centralized Code Evaluator Engine');
      const hasMockEdu = doc.education?.some(
        (e: any) => typeof e.institution === 'string' && e.institution.includes('Indian Institute of Technology')
      );
      const hasMockSummary =
        typeof doc.summary === 'string' &&
        doc.summary.includes('Passionate Software Engineer skilled in full-stack web development');
      return hasMockProject || (hasMockEdu && hasMockSummary);
    };

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

            // PURGE GHOST / ACCIDENTAL BOILERPLATE RESUME:
            if (isGhostMockResume(finalDoc)) {
              try {
                await apiClient.delete(`/assistant/resume/${record.id}`);
              } catch {}
              if (userDraftKey) {
                try {
                  localStorage.removeItem(userDraftKey);
                } catch {}
              }
              const refetch = await apiClient.get('/assistant/resumes');
              const remaining = (refetch.data?.data || []) as ResumeListItem[];
              setResumesList(remaining);
              if (remaining.length === 0) {
                setResumeRecord(null);
                resumeRecordRef.current = null;
                const freshDoc = createEmptyResume(user);
                setResumeDoc(freshDoc);
                resumeDocRef.current = freshDoc;
                setInitialLoading(false);
                return;
              }
            }

            // SANITIZE / HEAL CROSS-STUDENT CONTAMINATION:
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
            setTitleInput(record.title);
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
            setLastSavedAt(new Date(record.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
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
  }, [user?.id, user?.email, user?.full_name, getDraftKey, fetchRecycleBinCount]);

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
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setLastSavedAt(timeStr);
        }
      } catch (err: any) {
        if (err.response?.status === 409) {
          setSaveStatus('conflict');
          setConflictData({
            currentVersion: err.response.data?.currentVersion,
            currentResume: err.response.data?.currentResume,
          });
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

  const handleSwitchTemplate = useCallback(
    (newTemplateId: string) => {
      const currentDoc = resumeDocRef.current;
      const updated = { ...currentDoc, templateId: newTemplateId };
      handleUpdateDocument(updated);
      const meta = getTemplateMeta(newTemplateId);
      toast.success(`Switched to "${meta.name}" (${meta.recommendedFor})`);
    },
    [handleUpdateDocument]
  );

  // Overwrite server conflict with local changes
  const handleResolveOverwrite = async () => {
    if (!conflictData) return;
    try {
      setSaveStatus('saving');
      const payload = {
        title: resumeRecord?.title || 'Primary Tech Resume',
        document: resumeDoc,
        expectedVersion: conflictData.currentVersion,
      };
      const targetEndpoint = resumeRecord?.id ? `/assistant/resume/${resumeRecord.id}` : '/assistant/resume';
      const res = await apiClient.put(targetEndpoint, payload);
      if (res.data?.success) {
        const saved = res.data.data;
        setResumeRecord(saved);
        resumeRecordRef.current = saved;
        setSaveStatus('saved');
        setConflictData(null);
        toast.success('Synced your edits to cloud');
      }
    } catch {
      toast.error('Failed to resolve conflict.');
    }
  };

  // Discard local and load server version
  const handleResolveLoadServer = () => {
    if (!conflictData?.currentResume?.document) return;
    const serverDoc = conflictData.currentResume.document;
    setResumeDoc(serverDoc);
    resumeDocRef.current = serverDoc;
    setResumeRecord(conflictData.currentResume);
    resumeRecordRef.current = conflictData.currentResume;
    setConflictData(null);
    setSaveStatus('saved');
    toast.success('Loaded latest server version');
  };

  // 3. Switch active resume
  const handleSelectResume = async (targetId: string) => {
    if (targetId === resumeRecord?.id) {
      setShowResumeDropdown(false);
      return;
    }
    setSwitchingResume(true);
    setShowResumeDropdown(false);
    try {
      const res = await apiClient.get(`/assistant/resume/${targetId}`);
      if (res.data?.success && res.data.data) {
        const rec = res.data.data as ResumeRecord;
        setResumeRecord(rec);
        resumeRecordRef.current = rec;
        setResumeDoc(rec.document);
        resumeDocRef.current = rec.document;
        setTitleInput(rec.title);
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
        setLastSavedAt(new Date(rec.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        toast.success(`Loaded "${rec.title}"`);
      }
    } catch {
      toast.error('Failed to load resume.');
    } finally {
      setSwitchingResume(false);
    }
  };

  // 4. Rename current active resume
  const handleSaveTitle = async () => {
    if (!resumeRecord?.id || !titleInput.trim()) {
      setIsEditingTitle(false);
      return;
    }
    const cleanTitle = titleInput.trim().slice(0, 150);
    try {
      const res = await apiClient.patch(`/assistant/resume/${resumeRecord.id}/rename`, { title: cleanTitle });
      if (res.data?.success) {
        setResumeRecord((prev) => (prev ? { ...prev, title: cleanTitle } : null));
        if (resumeRecordRef.current) {
          resumeRecordRef.current.title = cleanTitle;
        }
        setResumesList((prev) =>
          prev.map((item) => (item.id === resumeRecord.id ? { ...item, title: cleanTitle } : item))
        );
        setIsEditingTitle(false);
        toast.success(`Renamed to "${cleanTitle}"`);
      }
    } catch {
      toast.error('Failed to rename resume.');
    }
  };

  // 5. Duplicate a resume
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
        setTitleInput(cloned.title);
        setShowResumeDropdown(false);
        toast.success(`Duplicated "${cloned.title}"!`);
      }
    } catch {
      toast.error('Failed to duplicate resume.');
    }
  };

  // 6. Set as primary placement resume
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

  // 7. Delete specific resume or active resume (Soft-delete to Recycle Bin)
  const handleDeleteResume = async (idToDelete?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const targetId = idToDelete || resumeRecord?.id;
    if (!targetId) return;

    const targetItem = resumesList.find((r) => r.id === targetId);
    const targetTitle = targetItem?.title || resumeRecord?.title || 'this resume';

    if (
      !window.confirm(
        `Move "${targetTitle}" to Recycle Bin? You can restore it anytime within 30 days.`
      )
    ) {
      return;
    }

    try {
      await apiClient.delete(`/assistant/resume/${targetId}`);
      const updatedList = resumesList.filter((r) => r.id !== targetId);
      setResumesList(updatedList);
      setShowResumeDropdown(false);

      if (updatedList.length === 0) {
        setResumeRecord(null);
        resumeRecordRef.current = null;
        setResumeDoc(createEmptyResume(user));
      } else {
        if (targetId === resumeRecord?.id) {
          const next = updatedList.find((r) => r.is_primary) || updatedList[0];
          await handleSelectResume(next.id);
        }
      }

      fetchRecycleBinCount();

      toast(
        (t) => (
          <div className='flex items-center justify-between gap-3 text-xs w-full'>
            <span>
              Moved <strong>"{targetTitle}"</strong> to Recycle Bin.
            </span>
            <button
              type='button'
              onClick={async () => {
                toast.dismiss(t.id);
                await handleRestoreResume(targetId);
              }}
              className='font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer shrink-0'
            >
              Undo
            </button>
          </div>
        ),
        { duration: 6000 }
      );
    } catch {
      toast.error('Failed to move resume to Recycle Bin.');
    }
  };

  const handleRestoreResume = async (idToRestore: string) => {
    try {
      const res = await apiClient.patch(`/assistant/resume/${idToRestore}/restore`);
      if (res.data?.success) {
        const restored = res.data.data;
        toast.success(`Restored "${restored.title}".`);
        const listRes = await apiClient.get('/assistant/resumes');
        if (listRes.data?.success) {
          const freshList = listRes.data.data as ResumeListItem[];
          setResumesList(freshList);
          if (!resumeRecordRef.current || freshList.length === 1) {
            await handleSelectResume(restored.id);
          }
        }
        fetchRecycleBinCount();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to restore resume.');
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

  const [creatingBlank, setCreatingBlank] = useState(false);

  const handleCreateBlankResume = async (
    customTitle?: string,
    catToUse?: ResumeCategory,
    roleToUse?: string
  ) => {
    setCreatingBlank(true);
    const chosenCat = catToUse || selectedCategory || 'general';
    const catCfg = getCategoryConfig(chosenCat);
    const chosenRole = roleToUse || selectedRole || catCfg.defaultRole;
    const fresh = createEmptyResume(user, chosenCat, chosenRole);
    const titleToUse =
      customTitle?.trim() ||
      (resumesList.length === 0 ? `Primary ${catCfg.shortName} Resume` : catCfg.defaultTitle);
    try {
      setSaveStatus('saving');
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
          target_role: rec.document?.targetRole || chosenRole,
          version: rec.version,
          is_primary: rec.is_primary || false,
          template_id: rec.document?.templateId,
          created_at: rec.created_at || new Date().toISOString(),
          updated_at: rec.updated_at,
        };
        setResumesList((prev) => [newListItem, ...prev]);
        setResumeRecord(rec);
        resumeRecordRef.current = rec;
        setResumeDoc(rec.document);
        resumeDocRef.current = rec.document;
        setTitleInput(rec.title);
        setSaveStatus('saved');
        setLastSavedAt(new Date(rec.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setShowNewResumeModal(false);
        toast.success(`Created "${rec.title}"!`);
      }
    } catch {
      toast.error('Failed to initialize resume workspace.');
    } finally {
      setCreatingBlank(false);
    }
  };

  const handleGenerateWithAI = async (intakeValues: any) => {
    setGenerating(true);
    try {
      const res = await apiClient.post('/assistant/resume/generate', intakeValues);
      if (res.data?.success && res.data?.data) {
        const generated = res.data.data as ResumeDocType;
        if (intakeValues.personalInfo) {
          generated.personalInfo = {
            ...generated.personalInfo,
            ...intakeValues.personalInfo,
            links: intakeValues.personalInfo.links?.length
              ? intakeValues.personalInfo.links
              : generated.personalInfo.links,
          };
        }
        setShowWizard(false);

        const chosenCat = generated.category || intakeValues.category || selectedCategory || 'general';
        const catCfg = getCategoryConfig(chosenCat);
        const targetTitle =
          newResumeTitle.trim() ||
          (resumesList.length === 0 ? `Primary ${catCfg.shortName} Resume` : catCfg.defaultTitle);
        setSaveStatus('saving');
        const saveRes = await apiClient.post('/assistant/resume/new', {
          title: targetTitle,
          document: generated,
          is_primary: resumesList.length === 0,
        });
        if (saveRes.data?.success && saveRes.data.data) {
          const rec = saveRes.data.data as ResumeRecord;
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
          setResumeDoc(generated);
          resumeDocRef.current = generated;
          setTitleInput(rec.title);
          setSaveStatus('saved');
          setLastSavedAt(new Date(rec.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          setShowNewResumeModal(false);
          setNewResumeTitle('');
          toast.success(`Created "${rec.title}" with AI!`);
        }
      }
    } catch {
      toast.error('AI generation encountered an issue. You can continue editing manually.');
    } finally {
      setGenerating(false);
    }
  };

  const [polishingWithAI, setPolishingWithAI] = useState(false);

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

        // Merge and preserve user's chosen template, section ordering, genuine links, and avatar
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

  const handleCreateNewResumeSubmit = async () => {
    const catCfg = getCategoryConfig(selectedCategory);
    const title = newResumeTitle.trim() || catCfg.defaultTitle;
    if (newResumeType === 'blank') {
      await handleCreateBlankResume(title, selectedCategory, selectedRole);
      setShowNewResumeModal(false);
      setNewResumeTitle('');
    } else if (newResumeType === 'clone') {
      const sourceId = cloneSourceId || resumeRecord?.id || resumesList[0]?.id;
      if (!sourceId) return;
      try {
        const res = await apiClient.post(`/assistant/resume/${sourceId}/duplicate`, { title });
        if (res.data?.success && res.data.data) {
          const cloned = res.data.data as ResumeRecord;
          const newListItem: ResumeListItem = {
            id: cloned.id,
            title: cloned.title,
            category: cloned.document?.category || selectedCategory,
            target_role: cloned.document?.targetRole,
            version: cloned.version,
            is_primary: false,
            template_id: cloned.document?.templateId,
            created_at: cloned.created_at || new Date().toISOString(),
            updated_at: cloned.updated_at,
          };
          setResumesList((prev) => [newListItem, ...prev]);
          setResumeRecord(cloned);
          resumeRecordRef.current = cloned;
          setResumeDoc(cloned.document);
          resumeDocRef.current = cloned.document;
          setTitleInput(cloned.title);
          setShowNewResumeModal(false);
          setNewResumeTitle('');
          toast.success(`Created "${cloned.title}" from clone!`);
        }
      } catch {
        toast.error('Failed to duplicate resume.');
      }
    } else if (newResumeType === 'wizard') {
      const freshWizardDoc = createEmptyResume(user, selectedCategory, selectedRole);
      setResumeDoc(freshWizardDoc);
      setShowNewResumeModal(false);
      setShowWizard(true);
    }
  };

  // Job Match Analysis
  const handleAnalyzeJD = async () => {
    if (!jdText.trim()) return toast.error('Paste a job description first.');
    setJdLoading(true);
    try {
      const res = await apiClient.post('/assistant/resume/optimize', {
        resumeData: resumeDoc,
        jobDescription: jdText,
      });
      if (res.data?.success) {
        setMatchResult(res.data.data as ResumeMatchResult);
        toast.success('Match analysis complete!');
      }
    } catch {
      toast.error('Failed to analyze match. Try again.');
    } finally {
      setJdLoading(false);
    }
  };

  const getCandidateFilename = useCallback(() => {
    const fullName = (resumeDoc.personalInfo?.fullName || user?.full_name || 'Student').trim();
    const title = (resumeRecord?.title || resumeDoc.targetRole || 'Resume').trim();
    const safeName = `${fullName}_${title}`.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    return `${safeName}.pdf`;
  }, [resumeDoc.personalInfo?.fullName, resumeDoc.targetRole, resumeRecord?.title, user?.full_name]);

  const handlePrintPDF = useCallback(() => {
    if (!previewRef.current) return;

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
        /* Strip outer container card borders, rounded corners, and shadows */
        [data-resume-print-root] > div {
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          margin: 0 !important;
          width: 210mm !important;
          max-width: 210mm !important;
          box-sizing: border-box !important;
        }
        /* Force template container to fit exact A4 width */
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
        /* Preserve Atlantic Blue two-column sidebar layout in print */
        [data-resume-print-root] .grid.grid-cols-12 {
          display: grid !important;
          grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
          width: 100% !important;
        }
        /* Ensure headers preserve side-by-side flex alignment */
        [data-resume-print-root] header .flex-row {
          flex-direction: row !important;
        }
        /* Page break rules: avoid splitting individual project, education, or skill items */
        .page-break-inside-avoid {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        h1, h2, h3, h4 {
          break-after: avoid !important;
          page-break-after: avoid !important;
        }
        /* Hide interactive edit icons, toolbars, and buttons in print */
        .print\\:hidden,
        button,
        [title="Change profile photo"],
        [title="Double-click to edit"] {
          display: none !important;
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
    const clone = previewRef.current.cloneNode(true) as HTMLElement;

    // Strip interactive buttons, wands, and title attributes
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

  // Direct File Download as .pdf
  const handleDownloadPDF = useCallback(async () => {
    const previewEl = previewRef.current;
    if (!previewEl || exporting) return;
    setExporting(true);
    const toastId = toast.loading('Preparing downloadable PDF...');

    // Inject temporary style to hide interactive UI during capture
    const exportStyle = document.createElement('style');
    exportStyle.id = 'resume-export-style';
    exportStyle.textContent = `
      .exporting-pdf .print\\:hidden,
      .exporting-pdf button,
      .exporting-pdf [title="Change profile photo"],
      .exporting-pdf [title="Double-click to edit"] {
        display: none !important;
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
            clonedDoc.querySelectorAll('style').forEach((styleEl) => {
              if (styleEl.textContent) {
                styleEl.textContent = styleEl.textContent
                  .replace(/oklch\([^)]+\)/g, '#ffffff')
                  .replace(/oklab\([^)]+\)/g, '#ffffff')
                  .replace(/color-mix\([^)]+\)/g, '#ffffff');
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id);
        const newIdx = prev.findIndex((s) => s.id === over.id);
        const next = arrayMove(prev, oldIdx, newIdx);
        const nextOrder = next.map((s) => s.id);
        setResumeDoc((prevDoc) => {
          const updated = { ...prevDoc, sectionOrder: nextOrder };
          triggerAutosave(updated);
          return updated;
        });
        return next;
      });
    }
  }, [triggerAutosave]);

  const localScore = calcLocalMatchAnalysis(resumeDoc);
  const currentTemplateMeta = getTemplateMeta(resumeDoc.templateId);

  const hasResume = Boolean(resumeRecord?.id);

  if (initialLoading) {
    return (
      <div className='min-h-[70vh] flex flex-col items-center justify-center gap-3'>
        <Loader2 size={32} className='animate-spin text-[#333d7c]' />
        <p className='text-sm text-slate-500 font-medium'>Loading your verified resume workspace...</p>
      </div>
    );
  }

  // ── EMPTY STATE: When a student has not yet created any resume ───────────────
  if (!hasResume) {
    const emptyCatConfig = getCategoryConfig(selectedCategory);

    return (
      <div className='min-h-[85vh] bg-slate-50 flex flex-col justify-center items-center px-4 sm:px-6 py-10'>
        <div className='w-full max-w-4xl'>
          {/* Header Card */}
          <div className='text-center mb-6'>
            <div className='inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-3'>
              <Sparkles size={14} className='text-indigo-600' />
              <span>Multi-Track Placement Resume Platform</span>
            </div>
            <h1 className='text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight'>
              Choose Your Target Career Track
            </h1>
            <p className='text-xs sm:text-sm text-slate-600 mt-2 max-w-2xl mx-auto'>
              Welcome, <span className='font-semibold text-slate-900'>{user?.full_name || 'Student'}</span>! Select the job track you are targeting. Your resume builder will customize its skills taxonomy, portfolio links, and FlowCV placement template automatically.
            </p>
          </div>

          {/* Category Picker Grid */}
          <div className='grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-6'>
            {(Object.keys(CATEGORY_CONFIGS) as ResumeCategory[]).map((catKey) => {
              const cfg = CATEGORY_CONFIGS[catKey];
              const isSelected = selectedCategory === catKey;
              return (
                <button
                  key={catKey}
                  type='button'
                  onClick={() => {
                    setSelectedCategory(catKey);
                    setSelectedRole(cfg.defaultRole);
                    setNewResumeTitle(cfg.defaultTitle);
                  }}
                  className={cn(
                    'p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between group',
                    isSelected
                      ? 'border-[#333d7c] bg-[#333d7c] text-white shadow-sm ring-2 ring-[#333d7c]/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <div className='flex items-center justify-between mb-1'>
                    <span className={cn('text-[9px] font-black uppercase px-1.5 py-0.5 rounded', isSelected ? 'bg-white/20 text-white' : cfg.badgeBg + ' ' + cfg.badgeText)}>
                      {cfg.shortName}
                    </span>
                  </div>
                  <div>
                    <div className={cn('font-bold text-xs truncate', isSelected ? 'text-white' : 'text-slate-900')}>
                      {cfg.name.split('&')[0]}
                    </div>
                    <div className={cn('text-[9.5px] line-clamp-1 mt-0.5', isSelected ? 'text-slate-200' : 'text-slate-400')}>
                      {cfg.badge}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Category Overview Box */}
          <div className='p-4 bg-white rounded-2xl border border-slate-200 shadow-sm mb-6'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100'>
              <div>
                <div className='flex items-center gap-2'>
                  <span className='font-extrabold text-slate-900 text-sm sm:text-base'>
                    {emptyCatConfig.name}
                  </span>
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', emptyCatConfig.badgeBg, emptyCatConfig.badgeText)}>
                    {emptyCatConfig.badge}
                  </span>
                </div>
                <p className='text-xs text-slate-500 mt-0.5'>{emptyCatConfig.description}</p>
              </div>
              <div className='shrink-0 text-left sm:text-right'>
                <span className='text-[10px] uppercase font-bold text-slate-400 block'>Recommended Template</span>
                <span className='text-xs font-semibold text-[#333d7c]'>
                  {getTemplateMeta(emptyCatConfig.recommendedTemplate).name}
                </span>
              </div>
            </div>

            {/* Popular Roles Chips */}
            <div className='pt-3'>
              <span className='text-[11px] font-bold text-slate-700 block mb-1.5'>
                Popular Target Roles (Click to select):
              </span>
              <div className='flex flex-wrap gap-1.5'>
                {emptyCatConfig.popularRoles.map((role) => {
                  const isRoleActive = (selectedRole || emptyCatConfig.defaultRole) === role;
                  return (
                    <button
                      key={role}
                      type='button'
                      onClick={() => {
                        setSelectedRole(role);
                        setNewResumeTitle(`${role} Resume`);
                      }}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer',
                        isRoleActive
                          ? 'bg-[#333d7c] text-white border-[#333d7c] font-bold shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      )}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Cards Grid */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-6'>
            {/* Card 1: Guided AI Wizard */}
            <div className='relative bg-white rounded-2xl p-5 border-2 border-indigo-500/40 hover:border-indigo-600 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group'>
              <div className='absolute -top-2.5 right-4 bg-indigo-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-2xs'>
                Recommended
              </div>
              <div>
                <div className='w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform'>
                  <Sparkles size={20} />
                </div>
                <h3 className='text-sm font-bold text-slate-900 mb-1'>
                  Build with AI for {emptyCatConfig.shortName}
                </h3>
                <p className='text-xs text-slate-500 leading-relaxed mb-4'>
                  Answer a few role-specific questions. Our AI will automatically generate an ATS-formatted resume tailored specifically to {emptyCatConfig.name}.
                </p>
              </div>
              <button
                onClick={() => {
                  const fresh = createEmptyResume(user, selectedCategory, selectedRole);
                  setResumeDoc(fresh);
                  setShowWizard(true);
                }}
                className='w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer'
              >
                <span>Build with AI ({emptyCatConfig.shortName})</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Card 2: Blank Canvas */}
            <div className='bg-white rounded-2xl p-5 border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between group'>
              <div>
                <div className='w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform'>
                  <FileText size={20} />
                </div>
                <h3 className='text-sm font-bold text-slate-900 mb-1'>
                  Start Blank {emptyCatConfig.shortName} Canvas
                </h3>
                <p className='text-xs text-slate-500 leading-relaxed mb-4'>
                  Prefer writing your resume directly? Starts with clean inputs pre-configured with {emptyCatConfig.shortName} skills and portfolio links.
                </p>
              </div>
              <button
                onClick={() => handleCreateBlankResume(undefined, selectedCategory, selectedRole)}
                disabled={creatingBlank}
                className='w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-slate-900 text-white hover:bg-slate-800 shadow-xs transition-colors disabled:opacity-50 cursor-pointer'
              >
                {creatingBlank ? (
                  <>
                    <Loader2 size={14} className='animate-spin' />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    <span>Create Blank {emptyCatConfig.shortName} Resume</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3 Pillars / Feature Highlights */}
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-white/80 border border-slate-200/80 rounded-xl text-xs text-slate-600'>
            <div className='flex items-center gap-2.5'>
              <div className='w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0'>
                <ShieldCheck size={16} />
              </div>
              <div>
                <div className='font-bold text-slate-800 text-[11px]'>Multi-Job Flexibility</div>
                <div className='text-[10px] text-slate-500'>Create distinct resumes for each role</div>
              </div>
            </div>
            <div className='flex items-center gap-2.5'>
              <div className='w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0'>
                <LayoutTemplate size={16} />
              </div>
              <div>
                <div className='font-bold text-slate-800 text-[11px]'>10 FlowCV Templates</div>
                <div className='text-[10px] text-slate-500'>Single & double column ATS designs</div>
              </div>
            </div>
            <div className='flex items-center gap-2.5'>
              <div className='w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0'>
                <Download size={16} />
              </div>
              <div>
                <div className='font-bold text-slate-800 text-[11px]'>Pixel-Perfect A4 PDF</div>
                <div className='text-[10px] text-slate-500'>Ready for on-campus & off-campus drives</div>
              </div>
            </div>
          </div>
        </div>

        {/* Wizard Modal */}
        {showWizard && (
          <InputForm
            initialDocument={resumeDoc}
            onComplete={async (doc) => {
              setResumeDoc(doc);
              resumeDocRef.current = doc;
              setShowWizard(false);
              try {
                setSaveStatus('saving');
                const catCfg = getCategoryConfig(doc.category || selectedCategory);
                const titleToSave = `Primary ${catCfg.shortName} Resume`;
                const res = await apiClient.post('/assistant/resume/new', {
                  title: titleToSave,
                  document: doc,
                  is_primary: true,
                });
                if (res.data?.success && res.data.data) {
                  const rec = res.data.data as ResumeRecord;
                  const newListItem: ResumeListItem = {
                    id: rec.id,
                    title: rec.title,
                    category: rec.document?.category || doc.category || selectedCategory,
                    target_role: rec.document?.targetRole,
                    version: rec.version,
                    is_primary: true,
                    template_id: rec.document?.templateId,
                    created_at: rec.created_at || new Date().toISOString(),
                    updated_at: rec.updated_at,
                  };
                  setResumesList([newListItem]);
                  setResumeRecord(rec);
                  resumeRecordRef.current = rec;
                  setSaveStatus('saved');
                  setLastSavedAt(new Date(rec.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                  toast.success('Resume created successfully!');
                }
              } catch {
                toast.error('Failed to save resume.');
              }
            }}
            onGenerateWithAI={handleGenerateWithAI}
            loading={generating}
            onClose={() => setShowWizard(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-slate-100 flex flex-col w-full max-w-full'>
      {/* ── TOP HEADER / TOOLBAR ─────────────────────────────────────────── */}
      <header className='bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center justify-between sticky top-0 z-30 shadow-2xs gap-2 sm:gap-3 min-h-[52px] w-full max-w-full'>
        {/* Left: Interactive Resume Switcher & Title Editor */}
        <div className='flex items-center gap-2 min-w-0 flex-1'>
          <div ref={dropdownRef} className='relative min-w-0 flex items-center shrink'>
            {isEditingTitle ? (
              <div className='flex items-center gap-1.5 min-w-0 max-w-full'>
                <input
                  type='text'
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  autoFocus
                  className='h-8 px-2.5 py-1 text-xs sm:text-sm font-bold text-slate-900 bg-white border border-indigo-500 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 shadow-xs max-w-[150px] sm:max-w-[220px]'
                  maxLength={150}
                  placeholder='Resume title'
                />
                <button
                  type='button'
                  onClick={handleSaveTitle}
                  className='p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer shrink-0'
                  title='Save Title'
                >
                  <Check size={15} />
                </button>
                <button
                  type='button'
                  onClick={() => setIsEditingTitle(false)}
                  className='p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0'
                  title='Cancel'
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className='flex items-center gap-1 min-w-0 max-w-full'>
                {/* Resume Selector Trigger */}
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowResumeDropdown((prev) => !prev);
                  }}
                  className='inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-100 active:bg-slate-200/80 transition-colors cursor-pointer group text-left min-w-0 max-w-full'
                  title={resumeRecord?.title || 'Resume'}
                >
                  <FileText size={15} className='text-indigo-600 shrink-0' />
                  <span className='font-bold text-slate-900 text-xs sm:text-sm truncate tracking-tight min-w-0 shrink max-w-[130px] sm:max-w-[190px] md:max-w-[250px] lg:max-w-[300px]'>
                    {resumeRecord?.title || 'Resume'}
                  </span>
                  {(() => {
                    const activeCat = getCategoryConfig(
                      resumeDoc?.category || resumeRecord?.document?.category || 'general'
                    );
                    return (
                      <span
                        className={cn(
                          'hidden sm:inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold border shrink-0',
                          activeCat.badgeBg,
                          activeCat.badgeText
                        )}
                      >
                        {activeCat.shortName}
                      </span>
                    );
                  })()}
                  {resumeRecord?.is_primary && (
                    <span className='hidden md:inline-flex px-1.5 py-0.5 rounded text-[8.5px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider shrink-0'>
                      Primary
                    </span>
                  )}
                  <ChevronDown size={13} className='text-slate-400 group-hover:text-slate-700 transition-colors shrink-0' />
                </button>

                {/* Edit Title Button */}
                <button
                  type='button'
                  onClick={() => {
                    setTitleInput(resumeRecord?.title || '');
                    setIsEditingTitle(true);
                  }}
                  className='p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer shrink-0'
                  title='Rename this resume'
                >
                  <Pencil size={12} />
                </button>

                {/* Recycle Bin Trigger */}
                <button
                  type='button'
                  onClick={() => setShowRecycleBinModal(true)}
                  className='relative p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer shrink-0'
                  title={recycleBinCount > 0 ? `Recycle Bin (${recycleBinCount} deleted)` : 'Recycle Bin'}
                >
                  <Trash2 size={13} />
                  {recycleBinCount > 0 && (
                    <span className='absolute -top-1 -right-1 min-w-[13px] h-[13px] px-0.5 bg-red-500 text-white rounded-full text-[8px] font-bold flex items-center justify-center ring-2 ring-white'>
                      {recycleBinCount > 9 ? '9+' : recycleBinCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Dropdown Menu */}
            {showResumeDropdown && (
              <div
                className='absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 py-2 divide-y divide-slate-100 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100'
              >
                <div className='px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/60'>
                  <span>Your Resumes ({resumesList.length})</span>
                  <div className='flex items-center gap-2'>
                    <button
                      onClick={() => {
                        setShowResumeDropdown(false);
                        setShowRecycleBinModal(true);
                      }}
                      className='text-slate-500 hover:text-red-600 normal-case font-semibold flex items-center gap-1 cursor-pointer transition-colors'
                      title='Open Recycle Bin'
                    >
                      <Trash2 size={12} />
                      <span>Recycle Bin</span>
                      {recycleBinCount > 0 && (
                        <span className='px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-red-100 text-red-700'>
                          {recycleBinCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowResumeDropdown(false);
                        setShowNewResumeModal(true);
                      }}
                      className='text-indigo-600 hover:text-indigo-800 normal-case font-semibold flex items-center gap-1 cursor-pointer'
                    >
                      <Plus size={12} />
                      <span>New</span>
                    </button>
                  </div>
                </div>

                <div className='max-h-64 overflow-y-auto py-1'>
                  {resumesList.map((resItem) => {
                    const isSelected = resItem.id === resumeRecord?.id;
                    return (
                      <div
                        key={resItem.id}
                        onClick={() => handleSelectResume(resItem.id)}
                        className={cn(
                          'px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-50 cursor-pointer transition-colors group',
                          isSelected && 'bg-indigo-50/60'
                        )}
                      >
                        <div className='min-w-0 flex-1'>
                          <div className='flex items-center gap-1.5 flex-wrap'>
                            <span className={cn('text-xs font-semibold truncate max-w-[140px]', isSelected ? 'text-indigo-900 font-bold' : 'text-slate-800')}>
                              {resItem.title}
                            </span>
                            {(() => {
                              const itemCat = getCategoryConfig(resItem.category || 'general');
                              return (
                                <span
                                  className={cn(
                                    'px-1.5 py-0.2 rounded text-[9px] font-bold border shrink-0',
                                    itemCat.badgeBg,
                                    itemCat.badgeText
                                  )}
                                >
                                  {itemCat.shortName}
                                </span>
                              );
                            })()}
                            {resItem.is_primary && (
                              <span className='px-1 py-0.2 rounded text-[8px] font-black bg-emerald-100 text-emerald-800 uppercase shrink-0'>
                                Primary
                              </span>
                            )}
                          </div>
                          <div className='text-[10px] text-slate-400 mt-0.5'>
                            v{resItem.version} · Updated {new Date(resItem.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </div>
                        </div>

                        {/* Quick Action Icons */}
                        <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                          {!resItem.is_primary && (
                            <button
                              type='button'
                              onClick={(e) => handleSetPrimary(resItem.id, e)}
                              className='p-1 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors cursor-pointer'
                              title='Set as primary placement resume'
                            >
                              <Star size={13} />
                            </button>
                          )}
                          <button
                            type='button'
                            onClick={(e) => handleDuplicateResume(resItem.id, e)}
                            className='p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer'
                            title='Duplicate this resume'
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type='button'
                            onClick={(e) => handleDeleteResume(resItem.id, e)}
                            className='p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer'
                            title='Move to Recycle Bin'
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className='p-2 flex flex-col gap-1.5'>
                  <button
                    onClick={() => {
                      setShowResumeDropdown(false);
                      setShowNewResumeModal(true);
                    }}
                    className='w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer'
                  >
                    <Plus size={14} />
                    <span>Create New Resume</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowResumeDropdown(false);
                      setShowRecycleBinModal(true);
                    }}
                    className='w-full inline-flex items-center justify-between py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50/60 transition-colors cursor-pointer border border-transparent hover:border-red-100'
                  >
                    <div className='inline-flex items-center gap-1.5'>
                      <Trash2 size={13} className='text-slate-400' />
                      <span>View Recycle Bin</span>
                    </div>
                    {recycleBinCount > 0 ? (
                      <span className='text-[10px] text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full font-bold'>
                        {recycleBinCount} deleted
                      </span>
                    ) : (
                      <span className='text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full font-medium'>
                        Empty
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Autosave Status Badge */}
          <div className='flex items-center text-xs whitespace-nowrap shrink-0'>
            {saveStatus === 'saving' && (
              <span className='inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full font-medium text-[11px]'>
                <Cloud size={12} className='animate-pulse shrink-0 text-amber-600' />
                <span className='hidden xl:inline'>Saving...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span
                className='inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 sm:px-2.5 py-0.5 rounded-full font-medium text-[11px]'
                title={lastSavedAt ? `Saved at ${lastSavedAt} (v${resumeRecord?.version || 1})` : 'Saved to Cloud'}
              >
                <CheckCircle2 size={12} className='text-emerald-600 shrink-0' />
                <span className='hidden xl:inline'>Saved {lastSavedAt ? `at ${lastSavedAt}` : 'to Cloud'}</span>
                <span className='xl:hidden text-[10.5px]'>Saved</span>
              </span>
            )}
            {saveStatus === 'conflict' && (
              <span className='inline-flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-200/80 px-2 py-0.5 rounded-full font-bold text-[11px]'>
                <AlertTriangle size={12} className='text-red-600 shrink-0' />
                <span>Conflict</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className='inline-flex items-center gap-1.5 text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-[11px]' title='Edits cached locally'>
                <RotateCcw size={12} className='shrink-0' />
                <span className='hidden sm:inline'>Cached</span>
              </span>
            )}
          </div>
        </div>

        {/* Right: Action Controls */}
        <div className='flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto'>
          {/* + New Resume CTA */}
          <button
            onClick={() => setShowNewResumeModal(true)}
            className='h-8 px-2 sm:px-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-lg inline-flex items-center gap-1 whitespace-nowrap transition-colors shadow-2xs cursor-pointer shrink-0'
            title='Create another resume for a different job role'
          >
            <Plus size={13.5} className='text-indigo-600 shrink-0' />
            <span className='hidden xl:inline'>New Resume</span>
          </button>

          {/* Template Selector Pill */}
          <button
            onClick={() => setShowTemplateModal(true)}
            className='h-8 px-2 sm:px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-lg inline-flex items-center gap-1 whitespace-nowrap transition-colors shadow-2xs cursor-pointer shrink-0'
            title={`Switch Resume Template (10 Available) - Current: ${currentTemplateMeta.name}`}
          >
            <Palette size={13} className='text-indigo-600 shrink-0' />
            <span className='font-semibold text-slate-800 text-xs max-w-[80px] sm:max-w-[100px] truncate'>{currentTemplateMeta.name}</span>
            <ChevronDown size={11} className='text-slate-400 shrink-0' />
          </button>

          {/* Direct 1-Click Polish with AI */}
          <button
            onClick={handlePolishCurrentResumeWithAI}
            disabled={polishingWithAI}
            className='h-8 px-2.5 sm:px-3 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:opacity-95 active:scale-[0.98] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-all shadow-xs cursor-pointer shrink-0 disabled:opacity-60'
            title='Analyze and polish this current resume with AI'
          >
            {polishingWithAI ? (
              <>
                <Loader2 size={13} className='animate-spin text-white' />
                <span>Polishing...</span>
              </>
            ) : (
              <>
                <Sparkles size={13} className='text-amber-300 shrink-0' />
                <span className='hidden sm:inline'>Polish with AI</span>
                <span className='sm:hidden'>Polish</span>
              </>
            )}
          </button>

          {/* Step-by-Step Form Editor */}
          <button
            onClick={() => setShowWizard(true)}
            className='h-8 px-2 sm:px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors shadow-2xs cursor-pointer shrink-0'
            title='Open step-by-step form to edit your resume details'
          >
            <FileEdit size={13.5} className='text-indigo-600 shrink-0' />
            <span className='hidden sm:inline'>Edit Details</span>
            <span className='sm:hidden'>Edit</span>
          </button>

          <div className='h-4 w-px bg-slate-200 mx-0.5 hidden sm:block' />

          {/* Preview Modal */}
          <button
            onClick={() => setShowFullPreview(true)}
            className='h-8 px-2 sm:px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-lg inline-flex items-center gap-1 whitespace-nowrap transition-colors shadow-2xs cursor-pointer shrink-0'
            title='Preview A4 Print Layout'
          >
            <Maximize2 size={13} className='text-slate-500 shrink-0' />
            <span className='hidden lg:inline'>Preview</span>
          </button>

          {/* Delete Active Resume */}
          {resumesList.length > 1 && (
            <button
              onClick={() => handleDeleteResume()}
              className='h-8 px-2 text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer shrink-0'
              title='Delete this resume'
            >
              <Trash2 size={13} className='shrink-0' />
            </button>
          )}

          {/* Export & Download PDF Action Group */}
          <div ref={exportMenuRef} className='relative inline-flex items-center rounded-lg shadow-xs shrink-0'>
            <button
              type='button'
              onClick={handleDownloadPDF}
              disabled={exporting}
              className='h-8 px-2.5 sm:px-3 text-xs font-bold text-white bg-[#333d7c] hover:bg-[#252d5e] active:scale-[0.98] rounded-l-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer disabled:opacity-60'
              title='Download resume as PDF directly to your device'
            >
              {exporting ? (
                <>
                  <Loader2 size={13.5} className='animate-spin text-white' />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download size={13.5} className='shrink-0' />
                  <span>Download PDF</span>
                </>
              )}
            </button>

            <button
              type='button'
              onClick={() => setShowExportMenu((prev) => !prev)}
              className='h-8 px-1.5 text-white/90 bg-[#2b3368] hover:bg-[#20274f] hover:text-white rounded-r-lg border-l border-white/20 inline-flex items-center justify-center transition-colors cursor-pointer'
              title='More export options'
            >
              <ChevronDown size={12} />
            </button>

            {showExportMenu && (
              <div
                className='absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100'
              >
                <button
                  type='button'
                  onClick={() => {
                    setShowExportMenu(false);
                    handleDownloadPDF();
                  }}
                  className='w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer font-medium'
                >
                  <Download size={14} className='text-indigo-600 shrink-0' />
                  <div>
                    <div className='font-semibold text-slate-900'>Direct Download (.pdf)</div>
                    <div className='text-[10px] text-slate-400'>Save file directly to Downloads</div>
                  </div>
                </button>

                <button
                  type='button'
                  onClick={() => {
                    setShowExportMenu(false);
                    handlePrintPDF();
                  }}
                  className='w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer font-medium border-t border-slate-100'
                >
                  <FileText size={14} className='text-slate-500 shrink-0' />
                  <div>
                    <div className='font-semibold text-slate-900'>Print / Save via Browser</div>
                    <div className='text-[10px] text-slate-400'>System print dialog & A4 preview</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── CONFLICT BANNER (Issue 3: Autosave Conflict Handling) ───────────── */}
      {conflictData && (
        <div className='bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between text-xs text-red-900'>
          <div className='flex items-center gap-2'>
            <AlertTriangle size={16} className='text-red-600 shrink-0' />
            <span>
              <strong>Autosave Conflict:</strong> This resume was edited in another tab or device (Server version: v
              {conflictData.currentVersion}). How would you like to proceed?
            </span>
          </div>
          <div className='flex items-center gap-2'>
            <button
              onClick={handleResolveOverwrite}
              className='px-3 py-1 font-bold bg-red-600 text-white rounded hover:bg-red-700 transition-colors'
            >
              Overwrite Server with My Draft
            </button>
            <button
              onClick={handleResolveLoadServer}
              className='px-3 py-1 font-bold bg-white text-slate-700 border border-slate-300 rounded hover:bg-slate-50 transition-colors'
            >
              Load Server Version
            </button>
          </div>
        </div>
      )}

      {/* ── MAIN WORKSPACE ─────────────────────────────────────────────────── */}
      <div className='flex-1 flex overflow-hidden'>
        {/* LEFT SIDEBAR: Structure & Match Analysis */}
        <aside className='w-80 bg-white border-r border-slate-200 p-5 overflow-y-auto hidden lg:flex flex-col gap-6 shrink-0'>
          {/* Section 1: Resume Completeness Score */}
          <div className='p-4 bg-slate-50 rounded-xl border border-slate-200'>
            <div className='flex items-center justify-between mb-3'>
              <span className='text-xs font-bold text-slate-900 uppercase tracking-wide'>
                Resume Completeness
              </span>
              <span className='text-xs font-black text-[#333d7c]'>{localScore.matchPercentage}%</span>
            </div>
            <ScoreBar
              label='Required Sections Fulfilled'
              value={localScore.matchPercentage}
              color={localScore.matchPercentage >= 75 ? 'bg-emerald-500' : 'bg-[#333d7c]'}
            />
            {localScore.readabilityTips.length > 0 && (
              <p className='text-[11px] text-slate-500 mt-2 leading-relaxed'>
                💡 {localScore.readabilityTips[0]}
              </p>
            )}
          </div>

          {/* Section 2: Reorder Sections */}
          <div>
            <h2 className='text-xs font-bold text-slate-900 uppercase tracking-wide mb-2'>
              Reorder Resume Sections
            </h2>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className='space-y-1'>
                  {sections.map((sec) => (
                    <SortableSectionItem key={sec.id} section={sec} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Section 3: Job Description Match Analysis */}
          <div className='border-t border-slate-200 pt-5 space-y-3'>
            <div className='flex items-center gap-1.5'>
              <Search size={14} className='text-[#333d7c]' />
              <h2 className='text-xs font-bold text-slate-900 uppercase tracking-wide'>
                Job Description Match
              </h2>
            </div>
            <p className='text-[11px] text-slate-500 leading-relaxed'>
              Paste a job description to discover matching keywords and recommendations.
            </p>
            <textarea
              rows={3}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder='Paste JD requirements here...'
              className='w-full border border-slate-200 rounded-lg p-2.5 text-xs bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-[#333d7c]'
            />
            <button
              onClick={handleAnalyzeJD}
              disabled={jdLoading || !jdText.trim()}
              className='w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-[#333d7c] text-white rounded-lg hover:bg-[#252d5e] transition-colors disabled:opacity-50'
            >
              {jdLoading ? <Loader2 size={13} className='animate-spin' /> : <Sparkles size={13} />}
              <span>Analyze Match</span>
            </button>

            {matchResult && (
              <div className='p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2.5 text-xs animate-in fade-in-50'>
                <div className='flex items-center justify-between font-bold text-indigo-950'>
                  <span>Keyword Match</span>
                  <span>{matchResult.matchPercentage}%</span>
                </div>
                {matchResult.matchedKeywords?.length > 0 && (
                  <div>
                    <span className='font-semibold text-emerald-800 text-[11px] block mb-1'>
                      Matched Skills:
                    </span>
                    <div className='flex flex-wrap gap-1'>
                      {matchResult.matchedKeywords.map((k, i) => (
                        <span
                          key={i}
                          className='px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-medium'
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {matchResult.missingKeywords?.length > 0 && (
                  <div>
                    <span className='font-semibold text-amber-800 text-[11px] block mb-1'>
                      Missing from JD:
                    </span>
                    <div className='flex flex-wrap gap-1'>
                      {matchResult.missingKeywords.map((k, i) => (
                        <span
                          key={i}
                          className='px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-medium'
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER / PREVIEW: Live FlowCV Interactive Document */}
        <main className='flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center'>
          <div className='w-full max-w-[850px]'>
            {/* Quick Template Switcher Strip */}
            <div className='mb-3 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-nowrap items-center justify-between gap-2 text-xs overflow-hidden'>
              <div className='flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5 min-w-0 flex-1'>
                <span className='font-bold text-slate-700 flex items-center gap-1 shrink-0'>
                  <Palette size={13} className='text-[#333d7c]' />
                  <span className='hidden sm:inline'>Templates:</span>
                </span>
                <div className='flex items-center gap-1'>
                  {RESUME_TEMPLATES.map((tpl) => {
                    const isSel = (resumeDoc.templateId || 'modern-mercury') === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => handleSwitchTemplate(tpl.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-all ${
                          isSel
                            ? 'bg-[#333d7c] text-white shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                        title={`${tpl.name} — ${tpl.recommendedFor}`}
                      >
                        {tpl.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setShowTemplateModal(true)}
                className='text-[11px] font-bold text-[#333d7c] hover:underline flex items-center gap-1 shrink-0 px-1'
              >
                Browse 10 Templates ↗
              </button>
            </div>

            <div className='mb-2 flex items-center justify-between text-xs text-slate-500 px-1'>
              <span>Double-click any text in the resume to edit directly</span>
              <span className='text-[11px] text-slate-400'>
                {currentTemplateMeta.name} · {currentTemplateMeta.headline}
              </span>
            </div>

            <div
              ref={previewRef}
              className='relative bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden'
            >
              {switchingResume && (
                <div className='absolute inset-0 bg-white/70 backdrop-blur-2xs z-20 flex flex-col items-center justify-center gap-2'>
                  <Loader2 size={28} className='animate-spin text-[#333d7c]' />
                  <span className='text-xs font-semibold text-slate-600'>Loading resume...</span>
                </div>
              )}
              {polishingWithAI && (
                <div className='absolute inset-0 bg-white/80 backdrop-blur-xs z-20 flex flex-col items-center justify-center gap-2 animate-in fade-in-50 duration-200'>
                  <div className='w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#333d7c] to-purple-600 text-white flex items-center justify-center shadow-lg'>
                    <Sparkles size={24} className='animate-pulse text-amber-300' />
                  </div>
                  <span className='text-sm font-bold text-slate-900'>Polishing your resume with AI...</span>
                  <span className='text-xs text-slate-500 max-w-xs text-center'>
                    Enhancing summary, structuring STAR bullet points & optimizing skills taxonomy
                  </span>
                </div>
              )}
              <ResumeDocument data={resumeDoc} sections={sections} onUpdate={handleUpdateDocument} />
            </div>
          </div>
        </main>
      </div>

      {/* ── 6-STEP INTAKE WIZARD MODAL ─────────────────────────────────────── */}
      {showWizard && (
        <InputForm
          initialDocument={resumeDoc}
          onComplete={(doc) => {
            setResumeDoc(doc);
            triggerAutosave(doc);
            setShowWizard(false);
            toast.success('Resume updated!');
          }}
          onGenerateWithAI={handleGenerateWithAI}
          loading={generating}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* ── FULLSCREEN PREVIEW MODAL ───────────────────────────────────────── */}
      {showFullPreview && (
        <FullPreviewModal
          data={resumeDoc}
          sections={sections}
          onClose={() => setShowFullPreview(false)}
          onDownload={handleDownloadPDF}
          onPrint={handlePrintPDF}
          downloading={exporting}
        />
      )}

      {/* ── 10 FLOWCV TEMPLATES SELECTION MODAL ────────────────────────────── */}
      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        currentTemplateId={resumeDoc.templateId || 'modern-mercury'}
        onSelectTemplate={handleSwitchTemplate}
      />

      {/* ── CREATE NEW RESUME MODAL ───────────────────────────────────────── */}
      {showNewResumeModal && (
        <div className='fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150'>
            <div className='px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0'>
              <div>
                <h3 className='font-extrabold text-slate-900 text-base'>Create New Targeted Resume</h3>
                <p className='text-xs text-slate-500'>Create specialized resumes for General, Tech, Data, Design, or Business opportunities.</p>
              </div>
              <button
                onClick={() => setShowNewResumeModal(false)}
                className='text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer'
              >
                <X size={18} />
              </button>
            </div>

            <div className='p-6 space-y-5 overflow-y-auto flex-1'>
              {/* 1. Category Track Selection */}
              <div>
                <div className='flex items-center justify-between mb-2'>
                  <label className='block text-xs font-bold text-slate-700 uppercase tracking-wider'>
                    1. Select Job Category / Track
                  </label>
                  <span className='text-[11px] text-slate-500 font-medium'>
                    Tailors layout, skills & terminology
                  </span>
                </div>
                <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
                  {(Object.keys(CATEGORY_CONFIGS) as ResumeCategory[]).map((catKey) => {
                    const cfg = CATEGORY_CONFIGS[catKey];
                    const isSelected = selectedCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type='button'
                        onClick={() => {
                          setSelectedCategory(catKey);
                          setSelectedRole(cfg.defaultRole);
                          setNewResumeTitle(cfg.defaultTitle);
                        }}
                        className={cn(
                          'p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer relative flex flex-col justify-between',
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/70 shadow-xs ring-2 ring-indigo-500/20'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 bg-white'
                        )}
                      >
                        <div>
                          <div className='flex items-center justify-between gap-1 mb-1'>
                            <span className={cn('text-xs font-bold truncate', isSelected ? 'text-indigo-950 font-black' : 'text-slate-800')}>
                              {cfg.shortName}
                            </span>
                            {catKey === 'general' && (
                              <span className='px-1 py-0.2 rounded text-[8px] font-black bg-blue-100 text-blue-700 uppercase'>
                                Fresher
                              </span>
                            )}
                          </div>
                          <p className='text-[10px] text-slate-500 line-clamp-2 leading-snug'>
                            {cfg.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Target Role & Quick Chips */}
              {(() => {
                const currentCfg = getCategoryConfig(selectedCategory);
                return (
                  <div>
                    <label className='block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5'>
                      2. Target Role
                    </label>
                    <div className='flex flex-wrap gap-1.5 mb-2'>
                      {currentCfg.popularRoles.map((role) => (
                        <button
                          key={role}
                          type='button'
                          onClick={() => {
                            setSelectedRole(role);
                            setNewResumeTitle(`${role} Resume`);
                          }}
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border cursor-pointer',
                            selectedRole === role
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-semibold'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                    <input
                      type='text'
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      placeholder='Or type custom role, e.g. Entry-Level Analyst, Retail Associate...'
                      className='w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white'
                      maxLength={100}
                    />
                  </div>
                );
              })()}

              {/* 3. Title Input */}
              <div>
                <label className='block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5'>
                  3. Resume Name / Display Title
                </label>
                <input
                  type='text'
                  value={newResumeTitle}
                  onChange={(e) => setNewResumeTitle(e.target.value)}
                  placeholder={`e.g., ${getCategoryConfig(selectedCategory).defaultTitle}`}
                  className='w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium'
                  maxLength={150}
                />
              </div>

              {/* 4. Start Method Options */}
              <div>
                <label className='block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2'>
                  4. Select Starting Method
                </label>
                <div className='grid grid-cols-1 gap-2.5'>
                  {/* Option 1: Blank Canvas */}
                  <label
                    onClick={() => setNewResumeType('blank')}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                      newResumeType === 'blank'
                        ? 'border-indigo-600 bg-indigo-50/40'
                        : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <input
                      type='radio'
                      name='resumeType'
                      checked={newResumeType === 'blank'}
                      onChange={() => setNewResumeType('blank')}
                      className='mt-1 text-indigo-600'
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='font-bold text-xs text-slate-900 flex items-center gap-1.5'>
                        <FileText size={13} className='text-slate-600' />
                        <span>Start with Blank Canvas (Quickest)</span>
                      </div>
                      <p className='text-[11px] text-slate-500 mt-0.5 leading-relaxed'>
                        Instantly creates an empty resume pre-configured with the ideal FlowCV template for {getCategoryConfig(selectedCategory).shortName} jobs.
                      </p>
                    </div>
                  </label>

                  {/* Option 2: AI Intake Wizard */}
                  <label
                    onClick={() => setNewResumeType('wizard')}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                      newResumeType === 'wizard'
                        ? 'border-indigo-600 bg-indigo-50/40'
                        : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <input
                      type='radio'
                      name='resumeType'
                      checked={newResumeType === 'wizard'}
                      onChange={() => setNewResumeType('wizard')}
                      className='mt-1 text-indigo-600'
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='font-bold text-xs text-slate-900 flex items-center gap-1.5'>
                        <Sparkles size={13} className='text-indigo-600' />
                        <span>Build with AI (Step-by-Step)</span>
                      </div>
                      <p className='text-[11px] text-slate-500 mt-0.5 leading-relaxed'>
                        Answer tailored questions for {getCategoryConfig(selectedCategory).shortName} and let AI write bullet points and impact statements.
                      </p>
                    </div>
                  </label>

                  {/* Option 3: Clone from existing (if user has at least 1 resume) */}
                  {resumesList.length > 0 && (
                    <label
                      onClick={() => setNewResumeType('clone')}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                        newResumeType === 'clone'
                          ? 'border-indigo-600 bg-indigo-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <input
                        type='radio'
                        name='resumeType'
                        checked={newResumeType === 'clone'}
                        onChange={() => setNewResumeType('clone')}
                        className='mt-1 text-indigo-600'
                      />
                      <div className='min-w-0 flex-1'>
                        <div className='font-bold text-xs text-slate-900 flex items-center gap-1.5'>
                          <Copy size={13} className='text-indigo-600' />
                          <span>Duplicate an Existing Resume</span>
                        </div>
                        <p className='text-[11px] text-slate-500 mt-0.5 leading-relaxed'>
                          Copy contact details, education, and baseline info so you only adjust skills for this role.
                        </p>
                        {newResumeType === 'clone' && resumesList.length > 1 && (
                          <div className='mt-2'>
                            <select
                              value={cloneSourceId || resumeRecord?.id || resumesList[0]?.id}
                              onChange={(e) => setCloneSourceId(e.target.value)}
                              className='text-xs px-2 py-1 border border-slate-300 rounded-lg bg-white w-full'
                            >
                              {resumesList.map((r) => (
                                <option key={r.id} value={r.id}>
                                  Copy from: {r.title} {r.is_primary ? '(Primary)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className='px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0'>
              <button
                onClick={() => setShowNewResumeModal(false)}
                className='px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer'
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewResumeSubmit}
                disabled={creatingBlank}
                className='px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5'
              >
                {creatingBlank ? (
                  <>
                    <Loader2 size={13} className='animate-spin' />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Resume</span>
                )}
              </button>
            </div>
          </div>
        </div>
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
