import { useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import type { ResumeDocument as ResumeDocType, Section } from './types';
import apiClient from '@/services/api';
import { toast } from 'react-hot-toast';
import { TemplateRenderer } from './templates/TemplateRenderer';
import { ContactPhotoModal } from './ResumeCommon';

interface ResumeDocumentProps {
  data: ResumeDocType;
  sections?: Section[];
  onUpdate?: (updated: ResumeDocType) => void;
  readOnly?: boolean;
}

export function ResumeDocument({
  data,
  sections,
  onUpdate,
  readOnly = false,
}: ResumeDocumentProps) {
  const [rewritingKey, setRewritingKey] = useState<string | null>(null);
  const [rewriteProposal, setRewriteProposal] = useState<{
    key: string;
    originalText: string;
    proposedText: string;
    rationale: string;
  } | null>(null);

  const [editingContactPhoto, setEditingContactPhoto] = useState(false);

  const handleTriggerRewrite = async (
    key: string,
    section: 'bullet' | 'summary' | 'project',
    originalText: string,
    context?: string
  ) => {
    if (!originalText.trim() || readOnly) return;
    setRewritingKey(key);
    try {
      const res = await apiClient.post('/assistant/resume/rewrite', {
        section,
        originalText,
        context,
      });
      if (res.data?.success && res.data?.data) {
        setRewriteProposal({
          key,
          originalText,
          proposedText: res.data.data.proposedText,
          rationale: res.data.data.rationale || 'Enhanced action verbs and conciseness',
        });
      }
    } catch {
      toast.error('AI rewrite failed. Try again.');
    } finally {
      setRewritingKey(null);
    }
  };

  const handleAcceptRewrite = () => {
    if (!rewriteProposal || !onUpdate) return;
    const { key, proposedText } = rewriteProposal;

    if (key === 'summary') {
      onUpdate({ ...data, summary: proposedText });
    } else if (key.startsWith('proj_bullet_')) {
      const [, , projIdxStr, bulletIdxStr] = key.split('_');
      const pIdx = parseInt(projIdxStr, 10);
      const bIdx = parseInt(bulletIdxStr, 10);
      const nextProjects = [...data.projects];
      if (nextProjects[pIdx]?.bullets) {
        nextProjects[pIdx].bullets[bIdx] = proposedText;
        onUpdate({ ...data, projects: nextProjects });
      }
    }
    setRewriteProposal(null);
    toast.success('Accepted rewrite');
  };

  const handleSaveContactPhoto = (patch: Partial<typeof data.personalInfo>) => {
    if (!onUpdate || readOnly) return;
    onUpdate({
      ...data,
      personalInfo: {
        ...data.personalInfo,
        ...patch,
      },
    });
    toast.success('Contact details & photo updated!');
  };

  return (
    <div className='relative'>
      {/* Rewrite Diff Modal Banner */}
      {rewriteProposal && (
        <div className='mb-4 max-w-[800px] mx-auto p-4 rounded-xl border border-indigo-200 bg-indigo-50/90 shadow-md animate-in fade-in-50 print:hidden'>
          <div className='flex items-center justify-between pb-2 mb-2 border-b border-indigo-200/60'>
            <span className='flex items-center gap-1.5 text-xs font-bold text-indigo-900'>
              <Sparkles size={14} className='text-indigo-600' />
              AI Proposal ({rewriteProposal.rationale})
            </span>
            <div className='flex items-center gap-2'>
              <button
                onClick={handleAcceptRewrite}
                className='flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#333d7c] text-white rounded-md hover:bg-[#252d5e] transition-colors shadow-2xs'
              >
                <Check size={13} />
                Accept
              </button>
              <button
                onClick={() => setRewriteProposal(null)}
                className='flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors'
              >
                <X size={13} />
                Discard
              </button>
            </div>
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs'>
            <div className='p-2.5 rounded bg-white/70 border border-slate-200'>
              <span className='font-semibold text-slate-500 block mb-1'>Original:</span>
              <p className='text-slate-700'>{rewriteProposal.originalText}</p>
            </div>
            <div className='p-2.5 rounded bg-white border border-indigo-200'>
              <span className='font-semibold text-indigo-700 block mb-1'>Proposed:</span>
              <p className='text-indigo-950 font-medium'>{rewriteProposal.proposedText}</p>
            </div>
          </div>
        </div>
      )}

      {/* Render Selected Template */}
      <TemplateRenderer
        data={data}
        sections={sections}
        onUpdate={onUpdate}
        readOnly={readOnly}
        onEditLinks={() => setEditingContactPhoto(true)}
        onTriggerRewrite={handleTriggerRewrite}
        rewritingKey={rewritingKey}
      />

      {/* Contact Details & Photo Modal */}
      <ContactPhotoModal
        isOpen={editingContactPhoto}
        onClose={() => setEditingContactPhoto(false)}
        personalInfo={
          data.personalInfo || {
            fullName: '',
            headline: '',
            email: '',
            location: '',
            links: [],
          }
        }
        onSave={handleSaveContactPhoto}
      />
    </div>
  );
}
