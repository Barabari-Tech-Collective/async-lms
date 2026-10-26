import { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  Wand2,
  Plus,
  Trash2,
  X,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  BookOpen,
  LayoutTemplate,
  User,
  Calendar,
  Clock,
  GraduationCap,
  School,
  Building,
  Check,
} from 'lucide-react';
import type { ResumeDocument, ResumeCategory, EducationLevel } from './types';
import { CATEGORY_CONFIGS, getCategoryConfig } from './types';
import { RESUME_TEMPLATES } from './templateRegistry';
import { compressAvatarImage, calculateExperienceDuration } from './resumeUtils';
import apiClient from '@/services/api';
import { toast } from 'react-hot-toast';

interface InputFormProps {
  initialDocument: ResumeDocument;
  onComplete: (doc: ResumeDocument) => void;
  onGenerateWithAI: (payload: any) => Promise<void>;
  loading: boolean;
  onClose: () => void;
}

export function InputForm({
  initialDocument,
  onComplete,
  onGenerateWithAI,
  loading,
  onClose,
}: InputFormProps) {
  const [step, setStep] = useState(1);
  const [doc, setDoc] = useState<ResumeDocument>(initialDocument);
  const [achievements, setAchievements] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressAvatarImage(file, 320, 0.88);
      setDoc((prev) => ({
        ...prev,
        personalInfo: { ...prev.personalInfo, avatarUrl: compressed },
      }));
      toast.success('Profile picture added & optimized!');
    } catch {
      toast.error('Failed to process image. Please try another file.');
    }
  };

  // Fetch verified LMS achievements on mount to prefill and offer 1-click import
  useEffect(() => {
    let isMounted = true;
    async function loadAchievements() {
      try {
        const res = await apiClient.get('/assistant/resume/achievements');
        if (res.data?.success && isMounted) {
          const ach = res.data.data;
          setAchievements(ach);

          // Prefill profile if currently empty
          setDoc((prev) => {
            const pi = { ...prev.personalInfo };
            if (!pi.fullName && ach.profile?.full_name) {
              pi.fullName = ach.profile.full_name;
            }
            if (!pi.email && ach.profile?.email) {
              pi.email = ach.profile.email;
            }
            if (!prev.education.length && (ach.profile?.degree || ach.profile?.college_name)) {
              return {
                ...prev,
                personalInfo: pi,
                education: [
                  {
                    id: 'edu_lms_1',
                    institution: ach.profile.college_name || 'Engineering Institute',
                    degree: ach.profile.degree || 'B.Tech Computer Science',
                    startYear: ach.profile.year ? parseInt(ach.profile.year, 10) - 4 : 2021,
                    endYear: ach.profile.year ? parseInt(ach.profile.year, 10) : 2025,
                    gradingSystem: 'CGPA_10',
                    score: 8.5,
                  },
                ],
              };
            }
            return { ...prev, personalInfo: pi };
          });
        }
      } catch {
        // LMS achievements load failure is non-blocking
      }
    }
    loadAchievements();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleImportCapstone = (capstone: any) => {
    // Check if already in projects
    if (doc.projects.some((p) => p.lmsProjectId === String(capstone.project_id) || p.title === capstone.title)) {
      toast('Capstone already added to your resume');
      return;
    }

    const isVerified = capstone.is_approved === true || (capstone.score !== null && Number(capstone.score) >= 70);
    const newProject = {
      id: `proj_lms_${capstone.project_id}`,
      lmsProjectId: String(capstone.project_id),
      title: capstone.title,
      description: capstone.instructions ? String(capstone.instructions).slice(0, 150) : 'LMS Capstone Project',
      techStack: [capstone.subject_name || 'Full Stack'],
      repositoryUrl: capstone.submission_link || '',
      liveDemoUrl: '',
      bullets: isVerified
        ? [
            `Architected and deployed full-featured ${capstone.title} capstone project`,
            `Achieved ${capstone.score || 100}% evaluation score with rigorous automated unit testing and validation`,
          ]
        : [
            `Architected and deployed full-featured ${capstone.title} capstone project`,
            `Engineered complete application logic with database persistence and modular architecture`,
          ],
      verificationStatus: isVerified ? ('LMS_VERIFIED' as const) : ('CREDENTIAL_LINK_PROVIDED' as const),
    };

    setDoc((prev) => ({
      ...prev,
      projects: [newProject, ...prev.projects],
    }));
    toast.success(`Imported capstone: ${capstone.title}`);
  };

  const nextStep = () => setStep((s) => Math.min(6, s + 1));
  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  const currentCategory: ResumeCategory = doc.category || 'general';
  const categoryConfig = getCategoryConfig(currentCategory);

  const handleCategorySwitch = (cat: ResumeCategory) => {
    const nextConfig = getCategoryConfig(cat);
    const updatedLinks = nextConfig.linkSuggestions.map((item) => {
      const matched = doc.personalInfo.links?.find(
        (l) => l.label.toLowerCase() === item.label.toLowerCase()
      );
      return { label: item.label, url: matched?.url || '' };
    });

    setDoc((prev) => ({
      ...prev,
      category: cat,
      targetRole: nextConfig.defaultRole,
      templateId: nextConfig.recommendedTemplate || prev.templateId,
      personalInfo: {
        ...prev.personalInfo,
        headline: nextConfig.defaultRole,
        links: updatedLinks,
      },
    }));
    toast.success(`Switched to ${nextConfig.name} Track`);
  };

  const pi = doc.personalInfo;

  const getLinkValue = (label: string) => {
    return (
      pi.links?.find(
        (l) => l.label.toLowerCase() === label.toLowerCase()
      )?.url || ''
    );
  };

  const updateLink = (label: string, url: string) => {
    const existingLinks = [...(pi.links || [])];
    const matchIdx = existingLinks.findIndex(
      (l) => l.label.toLowerCase() === label.toLowerCase()
    );
    if (matchIdx >= 0) {
      existingLinks[matchIdx] = { label, url };
    } else {
      existingLinks.push({ label, url });
    }
    setDoc({
      ...doc,
      personalInfo: { ...pi, links: existingLinks },
    });
  };

  const handleFinishManual = () => {
    onComplete(doc);
    onClose();
  };

  const handleGenerateAI = async () => {
    await onGenerateWithAI({
      category: doc.category || 'general',
      targetRole: doc.targetRole || doc.personalInfo.headline,
      personalInfo: doc.personalInfo,
      careerObjective: doc.summary,
      extraSkills: [
        ...doc.skills.languages,
        ...doc.skills.frameworks,
        ...doc.skills.databases,
        ...doc.skills.tools,
      ],
      workExperience: doc.experience,
      events: doc.events || [],
      manualProjects: doc.projects,
      education: doc.education,
    });
  };

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in-50'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden'>
        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50'>
          <div>
            <div className='flex items-center gap-2'>
              <h2 className='font-bold text-[#1e2653] text-base sm:text-lg'>Build Resume with AI</h2>
              <span className='px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#333d7c]/10 text-[#333d7c]'>
                Step {step} of 6
              </span>
            </div>
            <p className='text-xs text-slate-500 mt-0.5'>Step-by-step guided setup for verified campus placements</p>
          </div>
          <button onClick={onClose} className='p-1 text-slate-400 hover:text-slate-600 rounded-lg'>
            <X size={20} />
          </button>
        </div>

        {/* Step Indicator Bar */}
        <div className='grid grid-cols-6 h-1 bg-slate-100'>
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div
              key={s}
              className={`h-full transition-colors ${s <= step ? 'bg-[#333d7c]' : 'bg-transparent'}`}
            />
          ))}
        </div>

        {/* Form Body */}
        <div className='overflow-y-auto overflow-x-hidden flex-1 p-5 sm:p-6 space-y-5'>
          {/* ── STEP 1: Template Selection, Profile Photo & Contact Details ──── */}
          {step === 1 && (
            <div className='space-y-4 animate-in fade-in-50'>
              <div className='border-b border-slate-100 pb-2 flex items-center justify-between'>
                <div>
                  <h3 className='text-sm font-bold text-slate-800'>
                    Step 1: Choose Template, Photo & Contact Info
                  </h3>
                  <p className='text-xs text-slate-500'>
                    Choose your course-tailored FlowCV template. You can switch templates anytime later!
                  </p>
                </div>
              </div>

              {/* Category Track Switcher Carousel */}
              <div className='p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-bold text-slate-800 flex items-center gap-1.5'>
                    <BookOpen size={13} className='text-[#333d7c]' />
                    Target Career Category:
                  </span>
                  <span className='text-[11px] font-semibold text-[#333d7c]'>
                    {categoryConfig.name}
                  </span>
                </div>
                <div className='flex flex-wrap gap-1.5'>
                  {(Object.keys(CATEGORY_CONFIGS) as ResumeCategory[]).map((catKey) => {
                    const cfg = CATEGORY_CONFIGS[catKey];
                    const isSelected = currentCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type='button'
                        onClick={() => handleCategorySwitch(catKey)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#333d7c] text-white shadow-2xs font-bold'
                            : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {cfg.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Template Picker Pill Carousel */}
              <div className='p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-bold text-slate-800 flex items-center gap-1.5'>
                    <LayoutTemplate size={13} className='text-[#333d7c]' />
                    Choose Starting Template:
                  </span>
                  <span className='text-[11px] font-semibold text-[#333d7c]'>
                    10 Templates Available
                  </span>
                </div>
                <div className='grid grid-cols-2 sm:grid-cols-5 gap-1.5 max-h-36 overflow-y-auto pr-1'>
                  {RESUME_TEMPLATES.map((t) => {
                    const isSelected = (doc.templateId || 'modern-mercury') === t.id;
                    return (
                      <button
                        key={t.id}
                        type='button'
                        onClick={() => setDoc({ ...doc, templateId: t.id })}
                        className={`p-2 rounded-lg text-left border transition-all text-xs flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#333d7c] text-white border-[#333d7c] shadow-2xs font-bold'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className='font-bold text-[11px] truncate block'>{t.name}</span>
                        <span
                          className={`text-[9.5px] truncate block mt-0.5 ${
                            isSelected ? 'text-sky-200' : 'text-slate-400'
                          }`}
                        >
                          {t.recommendedFor.split('&')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Profile Photo Upload Card */}
              <div className='p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-4'>
                <div className='relative w-14 h-14 rounded-full overflow-hidden border-2 border-[#333d7c] bg-white shrink-0 shadow-xs flex items-center justify-center'>
                  {pi.avatarUrl ? (
                    <img src={pi.avatarUrl} alt='Avatar' className='w-full h-full object-cover' />
                  ) : (
                    <User size={22} className='text-slate-400' />
                  )}
                </div>

                <div className='flex-1 space-y-1'>
                  <span className='font-semibold text-xs text-slate-800 block'>
                    Profile Picture (Optional)
                  </span>
                  <div className='flex flex-wrap items-center gap-2'>
                    <input
                      ref={fileInputRef}
                      type='file'
                      accept='image/*'
                      onChange={handlePhotoUpload}
                      className='hidden'
                    />
                    <button
                      type='button'
                      onClick={() => fileInputRef.current?.click()}
                      className='px-2.5 py-1 text-xs font-semibold bg-[#333d7c] text-white rounded-lg hover:bg-[#252d5e] transition-colors shadow-2xs'
                    >
                      {pi.avatarUrl ? 'Change Photo' : 'Upload Photo'}
                    </button>
                    {pi.avatarUrl && (
                      <button
                        type='button'
                        onClick={() =>
                          setDoc({
                            ...doc,
                            personalInfo: { ...pi, avatarUrl: '' },
                          })
                        }
                        className='px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors'
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className='text-[10px] text-slate-500'>
                    Visible in Photo-centric & Atlantic Blue templates. Supports JPG/PNG &lt; 2MB.
                  </p>
                </div>
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5'>
                <div>
                  <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                    Full Name <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='text'
                    value={pi.fullName}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, fullName: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                    placeholder='e.g. Rahul Sharma'
                  />
                </div>

                <div>
                  <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                    Target Headline / Role <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='text'
                    value={pi.headline}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, headline: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                    placeholder={categoryConfig.defaultRole}
                  />
                  <div className='flex flex-wrap gap-1 mt-1.5'>
                    {categoryConfig.popularRoles.slice(0, 3).map((role) => (
                      <button
                        key={role}
                        type='button'
                        onClick={() => setDoc({ ...doc, personalInfo: { ...pi, headline: role } })}
                        className='text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer transition-colors'
                      >
                        + {role}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                    Email Address (Clickable) <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='email'
                    value={pi.email}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, email: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                    placeholder='rahul@example.com'
                  />
                </div>

                <div>
                  <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                    Phone / WhatsApp (Clickable) <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='tel'
                    value={pi.phone || ''}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, phone: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                    placeholder='+91 98765 43210'
                  />
                </div>

                <div className='sm:col-span-2'>
                  <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>City, Country</label>
                  <input
                    type='text'
                    value={pi.location}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, location: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                    placeholder='Bengaluru, India'
                  />
                </div>

                {/* Dynamic Category-Specific Links */}
                <div className='sm:col-span-2 space-y-2 pt-2 border-t border-slate-100'>
                  <div className='flex items-center justify-between'>
                    <label className='text-xs font-bold text-slate-700'>
                      Portfolio & Professional Links
                    </label>
                    <span className='text-[10px] text-slate-500 font-medium'>
                      Suggested for {categoryConfig.shortName}
                    </span>
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                    {categoryConfig.linkSuggestions.map((item) => {
                      const val = getLinkValue(item.label);
                      return (
                        <div key={item.label}>
                          <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                            {item.label}
                          </label>
                          <input
                            type='url'
                            value={val}
                            onChange={(e) => updateLink(item.label, e.target.value)}
                            className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] bg-white transition-all'
                            placeholder={item.placeholder}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Professional Summary ─────────────────────────────────── */}
          {step === 2 && (
            <div className='space-y-4 animate-in fade-in-50'>
              <h3 className='text-sm font-bold text-slate-800 border-b border-slate-100 pb-2'>
                Step 2: Professional Summary
              </h3>
              <p className='text-xs text-slate-500'>
                A concise 2-3 sentence overview of your technical focus, core stacks, and career drive.
              </p>

              <div>
                <textarea
                  rows={5}
                  value={doc.summary}
                  onChange={(e) => setDoc({ ...doc, summary: e.target.value })}
                  className='w-full border border-slate-200 rounded-lg p-3 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all leading-relaxed'
                  placeholder='Aspiring Full-Stack Software Engineer with a solid foundation in React, Node.js, and PostgreSQL. Passionate about engineering high-performance web applications and mastering scalable system design.'
                />
                <span className='text-[11px] text-slate-400 mt-1 block text-right'>
                  {doc.summary.length} characters (Recommended: 150 - 300)
                </span>
              </div>
            </div>
          )}

          {/* ── STEP 3: Education & Academic Scores ─────────────────────────────────── */}
          {step === 3 && (() => {
            const currentYear = new Date().getFullYear();
            const addEducation = (level: EducationLevel = 'degree') => {
              let defaultDegree = '';
              let defaultGrading: 'CGPA_10' | 'GPA_4' | 'PERCENTAGE' = 'CGPA_10';
              let startYear: number | string = currentYear - 2;
              let endYear: number | string = currentYear + 2;

              if (level === 'intermediate') {
                defaultDegree = 'Intermediate (MPC / Class 12)';
                defaultGrading = 'PERCENTAGE';
                startYear = currentYear - 4;
                endYear = currentYear - 2;
              } else if (level === 'schooling') {
                defaultDegree = 'Secondary School Certificate (Class 10th - SSC/CBSE)';
                defaultGrading = 'CGPA_10';
                startYear = currentYear - 6;
                endYear = currentYear - 4;
              } else if (level === 'diploma') {
                defaultDegree = 'Diploma in Engineering';
                defaultGrading = 'PERCENTAGE';
                startYear = currentYear - 5;
                endYear = currentYear - 2;
              } else if (level === 'post_graduation') {
                defaultDegree = 'Master of Technology (M.Tech)';
                defaultGrading = 'CGPA_10';
                startYear = currentYear;
                endYear = currentYear + 2;
              }

              setDoc({
                ...doc,
                education: [
                  ...doc.education,
                  {
                    id: `edu_${level}_${Date.now()}`,
                    level,
                    institution: '',
                    degree: defaultDegree,
                    score: '',
                    gradingSystem: defaultGrading,
                    startYear,
                    endYear,
                  },
                ],
              });
            };

            const hasIntermediate = doc.education.some(
              (e) =>
                e.level === 'intermediate' ||
                (e.degree || '').toLowerCase().includes('intermediate') ||
                (e.degree || '').toLowerCase().includes('12th') ||
                (e.degree || '').toLowerCase().includes('+2')
            );
            const hasSchooling = doc.education.some(
              (e) =>
                e.level === 'schooling' ||
                (e.degree || '').toLowerCase().includes('school') ||
                (e.degree || '').toLowerCase().includes('10th') ||
                (e.degree || '').toLowerCase().includes('ssc') ||
                (e.degree || '').toLowerCase().includes('matric')
            );

            return (
              <div className='space-y-4 animate-in fade-in-50'>
                {/* Header */}
                <div className='flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2'>
                  <div>
                    <h3 className='text-sm font-bold text-slate-800'>Step 3: Education & Academic Scores</h3>
                    <p className='text-xs text-slate-500 mt-0.5'>
                      Provide your degree and optional 12th & 10th scores for campus placement drives.
                    </p>
                  </div>
                  <button
                    type='button'
                    onClick={() => addEducation('degree')}
                    className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#333d7c] font-semibold bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200/80 rounded-lg transition-colors cursor-pointer self-start sm:self-auto shadow-2xs'
                  >
                    <Plus size={13} />
                    <span>Add Degree</span>
                  </button>
                </div>

                {/* Academic Quick-Selector Status Cards */}
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-2.5'>
                  {/* Degree Card */}
                  <div className='p-3 rounded-xl border border-indigo-200/90 bg-indigo-50/40 flex items-center justify-between'>
                    <div className='flex items-center gap-2.5'>
                      <div className='w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs'>
                        <GraduationCap size={16} />
                      </div>
                      <div>
                        <p className='text-xs font-bold text-slate-800 leading-tight'>Graduation / Degree</p>
                        <p className='text-[10.5px] text-slate-500 font-medium'>College Qualification</p>
                      </div>
                    </div>
                    <span className='inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-white/95 border border-indigo-200 px-2 py-0.5 rounded-full shadow-2xs'>
                      <Check size={11} className='stroke-[2.5]' />
                      <span>Added</span>
                    </span>
                  </div>

                  {/* Intermediate Card */}
                  {hasIntermediate ? (
                    <div className='p-3 rounded-xl border border-sky-200/90 bg-sky-50/40 flex items-center justify-between'>
                      <div className='flex items-center gap-2.5'>
                        <div className='w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 shadow-2xs'>
                          <Building size={16} />
                        </div>
                        <div>
                          <p className='text-xs font-bold text-slate-800 leading-tight'>Class 12th / +2</p>
                          <p className='text-[10.5px] text-slate-500 font-medium'>Intermediate</p>
                        </div>
                      </div>
                      <span className='inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-white/95 border border-sky-200 px-2 py-0.5 rounded-full shadow-2xs'>
                        <Check size={11} className='stroke-[2.5]' />
                        <span>Added</span>
                      </span>
                    </div>
                  ) : (
                    <button
                      type='button'
                      onClick={() => addEducation('intermediate')}
                      className='p-3 rounded-xl border border-dashed border-sky-300 bg-sky-50/30 hover:bg-sky-100/60 hover:border-sky-400 flex items-center justify-between transition-all cursor-pointer group text-left'
                    >
                      <div className='flex items-center gap-2.5'>
                        <div className='w-8 h-8 rounded-lg bg-white text-sky-600 border border-sky-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs'>
                          <Plus size={16} />
                        </div>
                        <div>
                          <p className='text-xs font-bold text-sky-900 leading-tight'>+ Class 12th / +2</p>
                          <p className='text-[10.5px] text-sky-600 font-medium'>Intermediate (Optional)</p>
                        </div>
                      </div>
                      <span className='text-[10px] font-bold text-sky-700 bg-white border border-sky-200/80 px-2 py-0.5 rounded-md shadow-2xs'>
                        Add
                      </span>
                    </button>
                  )}

                  {/* Schooling Card */}
                  {hasSchooling ? (
                    <div className='p-3 rounded-xl border border-amber-200/90 bg-amber-50/40 flex items-center justify-between'>
                      <div className='flex items-center gap-2.5'>
                        <div className='w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs'>
                          <School size={16} />
                        </div>
                        <div>
                          <p className='text-xs font-bold text-slate-800 leading-tight'>Class 10th / SSC</p>
                          <p className='text-[10.5px] text-slate-500 font-medium'>Schooling</p>
                        </div>
                      </div>
                      <span className='inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-white/95 border border-amber-200 px-2 py-0.5 rounded-full shadow-2xs'>
                        <Check size={11} className='stroke-[2.5]' />
                        <span>Added</span>
                      </span>
                    </div>
                  ) : (
                    <button
                      type='button'
                      onClick={() => addEducation('schooling')}
                      className='p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/30 hover:bg-amber-100/60 hover:border-amber-400 flex items-center justify-between transition-all cursor-pointer group text-left'
                    >
                      <div className='flex items-center gap-2.5'>
                        <div className='w-8 h-8 rounded-lg bg-white text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs'>
                          <Plus size={16} />
                        </div>
                        <div>
                          <p className='text-xs font-bold text-amber-900 leading-tight'>+ Class 10th / SSC</p>
                          <p className='text-[10.5px] text-amber-600 font-medium'>Schooling (Optional)</p>
                        </div>
                      </div>
                      <span className='text-[10px] font-bold text-amber-700 bg-white border border-amber-200/80 px-2 py-0.5 rounded-md shadow-2xs'>
                        Add
                      </span>
                    </button>
                  )}
                </div>

                {/* Education List */}
                <div className='space-y-4 pt-1'>
                  {doc.education.map((edu, idx) => {
                    const itemLevel: EducationLevel =
                      edu.level ||
                      ((edu.degree || '').toLowerCase().includes('school') ||
                      (edu.degree || '').toLowerCase().includes('10th') ||
                      (edu.degree || '').toLowerCase().includes('ssc')
                        ? 'schooling'
                        : (edu.degree || '').toLowerCase().includes('intermediate') ||
                          (edu.degree || '').toLowerCase().includes('12th') ||
                          (edu.degree || '').toLowerCase().includes('+2')
                        ? 'intermediate'
                        : (edu.degree || '').toLowerCase().includes('diploma')
                        ? 'diploma'
                        : (edu.degree || '').toLowerCase().includes('master') ||
                          (edu.degree || '').toLowerCase().includes('m.tech') ||
                          (edu.degree || '').toLowerCase().includes('mba') ||
                          (edu.degree || '').toLowerCase().includes('mca')
                        ? 'post_graduation'
                        : 'degree');

                    const isSchooling = itemLevel === 'schooling';
                    const isIntermediate = itemLevel === 'intermediate';
                    const isOptional = isSchooling || isIntermediate || itemLevel === 'diploma';

                    return (
                      <div
                        key={edu.id || idx}
                        className={`p-4 sm:p-5 border rounded-2xl space-y-4 transition-all shadow-xs bg-white ${
                          isSchooling
                            ? 'border-amber-200/90 border-l-4 border-l-amber-500'
                            : isIntermediate
                            ? 'border-sky-200/90 border-l-4 border-l-sky-500'
                            : 'border-slate-200/90 border-l-4 border-l-[#333d7c]'
                        }`}
                      >
                        {/* Card Header */}
                        <div className='flex items-center justify-between pb-3 border-b border-slate-100 gap-3'>
                          <div className='flex items-center gap-2.5'>
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
                                isSchooling
                                  ? 'bg-amber-100 text-amber-700'
                                  : isIntermediate
                                  ? 'bg-sky-100 text-sky-700'
                                  : 'bg-indigo-100 text-indigo-700'
                              }`}
                            >
                              {isSchooling ? (
                                <School size={15} />
                              ) : isIntermediate ? (
                                <Building size={15} />
                              ) : (
                                <GraduationCap size={15} />
                              )}
                            </div>
                            <div>
                              <div className='flex items-center gap-2'>
                                <h4 className='text-xs font-bold text-slate-800'>
                                  {isSchooling
                                    ? 'Class 10th / Schooling'
                                    : isIntermediate
                                    ? 'Intermediate / Class 12th (+2)'
                                    : itemLevel === 'diploma'
                                    ? 'Diploma / Polytechnic'
                                    : itemLevel === 'post_graduation'
                                    ? 'Post Graduation / Master\'s'
                                    : 'Graduation / College Degree'}
                                </h4>
                                {isOptional && (
                                  <span className='px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-slate-100 text-slate-600 border border-slate-200'>
                                    Optional
                                  </span>
                                )}
                              </div>
                              <p className='text-[10.5px] text-slate-400'>Academic Record #{idx + 1}</p>
                            </div>
                          </div>

                          <div className='flex items-center gap-2'>
                            <div className='flex items-center gap-1.5'>
                              <span className='text-[11px] text-slate-500 font-medium hidden sm:inline'>Type:</span>
                              <select
                                value={itemLevel}
                                onChange={(e) => {
                                  const next = [...doc.education];
                                  const newLevel = e.target.value as EducationLevel;
                                  next[idx] = { ...next[idx], level: newLevel };
                                  if (!next[idx].degree || next[idx].degree === 'B.Tech in Computer Science') {
                                    if (newLevel === 'intermediate') {
                                      next[idx].degree = 'Intermediate (MPC / Class 12)';
                                      next[idx].gradingSystem = 'PERCENTAGE';
                                    } else if (newLevel === 'schooling') {
                                      next[idx].degree = 'Secondary School Certificate (Class 10th - SSC/CBSE)';
                                      next[idx].gradingSystem = 'CGPA_10';
                                    }
                                  }
                                  setDoc({ ...doc, education: next });
                                }}
                                className='text-[11px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] transition-colors'
                              >
                                <option value='degree'>Graduation / Degree</option>
                                <option value='intermediate'>Intermediate (+2 / 12th)</option>
                                <option value='schooling'>Schooling (10th / SSC)</option>
                                <option value='diploma'>Diploma / Polytechnic</option>
                                <option value='post_graduation'>Master's Degree</option>
                              </select>
                            </div>

                            {(doc.education.length > 1 || isOptional) && (
                              <button
                                type='button'
                                onClick={() =>
                                  setDoc({
                                    ...doc,
                                    education: doc.education.filter((_, i) => i !== idx),
                                  })
                                }
                                className='p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer'
                                title='Remove this education entry'
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Input Grid */}
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5'>
                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              {isSchooling
                                ? 'Board / Examination Name *'
                                : isIntermediate
                                ? 'Stream / Board / Course *'
                                : itemLevel === 'diploma'
                                ? 'Diploma Stream / Branch *'
                                : itemLevel === 'post_graduation'
                                ? 'Master\'s Program / Degree *'
                                : 'Degree / Course Name *'}
                            </label>
                            <input
                              type='text'
                              value={edu.degree}
                              onChange={(e) => {
                                const next = [...doc.education];
                                next[idx].degree = e.target.value;
                                setDoc({ ...doc, education: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all font-medium text-slate-800 placeholder:text-slate-400'
                              placeholder={
                                isSchooling
                                  ? 'e.g. Class 10th - SSC / CBSE / ICSE'
                                  : isIntermediate
                                  ? 'e.g. Intermediate (MPC / Class 12 CBSE)'
                                  : itemLevel === 'diploma'
                                  ? 'e.g. Diploma in Computer Engineering'
                                  : itemLevel === 'post_graduation'
                                  ? 'e.g. M.Tech in Computer Science'
                                  : 'e.g. B.Tech in Artificial Intelligence & Machine Learning'
                              }
                            />
                          </div>

                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              {isSchooling
                                ? 'School Name & City *'
                                : isIntermediate
                                ? 'Junior College / Higher Secondary School *'
                                : 'College / University *'}
                            </label>
                            <input
                              type='text'
                              value={edu.institution}
                              onChange={(e) => {
                                const next = [...doc.education];
                                next[idx].institution = e.target.value;
                                setDoc({ ...doc, education: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all font-medium text-slate-800 placeholder:text-slate-400'
                              placeholder={
                                isSchooling
                                  ? 'e.g. Kendriya Vidyalaya / St. Joseph\'s High School'
                                  : isIntermediate
                                  ? 'e.g. Narayana Junior College, Hyderabad'
                                  : 'e.g. Government City College / JNTUH'
                              }
                            />
                          </div>

                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              Score / Grade {isOptional ? '(Optional)' : ''}
                            </label>
                            <div className='flex gap-2'>
                              <input
                                type='text'
                                value={edu.score || ''}
                                onChange={(e) => {
                                  const next = [...doc.education];
                                  next[idx].score = e.target.value;
                                  setDoc({ ...doc, education: next });
                                }}
                                className='flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all font-medium text-slate-800'
                                placeholder={isIntermediate ? 'e.g. 94.5%' : isSchooling ? 'e.g. 9.8' : 'e.g. 8.5'}
                              />
                              <select
                                value={edu.gradingSystem || (isIntermediate ? 'PERCENTAGE' : 'CGPA_10')}
                                onChange={(e) => {
                                  const next = [...doc.education];
                                  next[idx].gradingSystem = e.target.value as any;
                                  setDoc({ ...doc, education: next });
                                }}
                                className='w-36 border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all font-medium text-slate-700'
                              >
                                <option value='CGPA_10'>CGPA / 10</option>
                                <option value='PERCENTAGE'>Percentage %</option>
                                <option value='GPA_4'>GPA / 4</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              {isSchooling ? 'Passing / Completion Year' : 'Academic Year Range'}
                            </label>
                            <div className='flex items-center gap-2'>
                              <div className='relative flex-1'>
                                <input
                                  type='number'
                                  value={edu.startYear || ''}
                                  onChange={(e) => {
                                    const next = [...doc.education];
                                    next[idx].startYear = e.target.value;
                                    setDoc({ ...doc, education: next });
                                  }}
                                  className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all font-medium text-slate-800'
                                  placeholder={String(isSchooling ? currentYear - 6 : currentYear - 4)}
                                />
                              </div>
                              <span className='text-xs text-slate-400 font-medium px-0.5 select-none'>to</span>
                              <div className='relative flex-1'>
                                <input
                                  type='number'
                                  value={edu.endYear || ''}
                                  onChange={(e) => {
                                    const next = [...doc.education];
                                    next[idx].endYear = e.target.value;
                                    setDoc({ ...doc, education: next });
                                  }}
                                  className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all font-medium text-slate-800'
                                  placeholder={String(isSchooling ? currentYear - 4 : currentYear - 2)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── STEP 4: Technical & Domain Skills (Categorized) ─────────────────────────── */}
          {step === 4 && (
            <div className='space-y-4 animate-in fade-in-50'>
              <div className='border-b border-slate-100 pb-2'>
                <h3 className='text-sm font-bold text-slate-800'>
                  Step 4: Categorized Skills ({categoryConfig.shortName})
                </h3>
                <p className='text-xs text-slate-500'>
                  List skills separated by commas. Recruiters and ATS scanners prefer categorized groupings tailored to your role.
                </p>
              </div>

              <div className='space-y-3.5'>
                <div>
                  <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                    {categoryConfig.skillLabels.languages}
                  </label>
                  <input
                    type='text'
                    value={doc.skills.languages.join(', ')}
                    onChange={(e) =>
                      setDoc({
                        ...doc,
                        skills: {
                          ...doc.skills,
                          languages: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                    placeholder={categoryConfig.skillPlaceholders.languages}
                  />
                </div>

                <div>
                  <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                    {categoryConfig.skillLabels.frameworks}
                  </label>
                  <input
                    type='text'
                    value={doc.skills.frameworks.join(', ')}
                    onChange={(e) =>
                      setDoc({
                        ...doc,
                        skills: {
                          ...doc.skills,
                          frameworks: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                    placeholder={categoryConfig.skillPlaceholders.frameworks}
                  />
                </div>

                <div>
                  <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                    {categoryConfig.skillLabels.databases}
                  </label>
                  <input
                    type='text'
                    value={doc.skills.databases.join(', ')}
                    onChange={(e) =>
                      setDoc({
                        ...doc,
                        skills: {
                          ...doc.skills,
                          databases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                    placeholder={categoryConfig.skillPlaceholders.databases}
                  />
                </div>

                <div>
                  <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                    {categoryConfig.skillLabels.tools}
                  </label>
                  <input
                    type='text'
                    value={doc.skills.tools.join(', ')}
                    onChange={(e) =>
                      setDoc({
                        ...doc,
                        skills: {
                          ...doc.skills,
                          tools: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                    placeholder={categoryConfig.skillPlaceholders.tools}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5: Projects / Activities / Case Studies ──────────────────────────────── */}
          {step === 5 && (
            <div className='space-y-4 animate-in fade-in-50'>
              <div className='flex items-center justify-between border-b border-slate-100 pb-2'>
                <div>
                  <h3 className='text-sm font-bold text-slate-800'>
                    Step 5: {categoryConfig.projectLabels.sectionTitle}
                  </h3>
                  <p className='text-xs text-slate-500'>
                    Include action-verb bullets, deliverables, and verifiable work proof
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() =>
                    setDoc({
                      ...doc,
                      projects: [
                        ...doc.projects,
                        {
                          id: `proj_${Date.now()}`,
                          title: '',
                          description: '',
                          techStack: [],
                          repositoryUrl: '',
                          liveDemoUrl: '',
                          bullets: [categoryConfig.projectLabels.bulletPlaceholder],
                          verificationStatus: 'SELF_REPORTED',
                        },
                      ],
                    })
                  }
                  className='inline-flex items-center gap-1 text-xs text-[#333d7c] font-semibold hover:underline'
                >
                  <Plus size={13} />
                  <span>Add Item</span>
                </button>
              </div>

              {/* Verified LMS Capstones Quick Import */}
              {achievements?.verifiedCapstones?.length > 0 && (
                <div className='p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2'>
                  <div className='flex items-center gap-1.5 text-xs font-bold text-emerald-900'>
                    <ShieldCheck size={14} className='text-emerald-600' />
                    <span>Your CodeGuru LMS Capstones</span>
                  </div>
                  <div className='space-y-1.5'>
                    {achievements.verifiedCapstones.map((cap: any) => {
                      const isGraded = cap.is_approved === true || (cap.score !== null && Number(cap.score) >= 70);
                      return (
                        <div
                          key={cap.project_id}
                          className='flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-emerald-100 text-xs'
                        >
                          <div>
                            <span className='font-bold text-slate-800'>{cap.title}</span>
                            <span className='text-slate-500 ml-2'>({cap.subject_name})</span>
                            {isGraded ? (
                              <span className='text-emerald-700 font-semibold ml-2 text-[11px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200'>
                                Verified • {cap.score}%
                              </span>
                            ) : (
                              <span className='text-amber-700 font-semibold ml-2 text-[11px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200'>
                                Submitted • Pending Evaluation
                              </span>
                            )}
                          </div>
                          <button
                            type='button'
                            onClick={() => handleImportCapstone(cap)}
                            className='inline-flex items-center gap-1 text-xs font-semibold text-[#333d7c] hover:underline'
                          >
                            <Plus size={12} />
                            <span>Import to Resume</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Projects List */}
              {doc.projects.length === 0 ? (
                <div className='text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl'>
                  No items added yet. Click "+ Add Item" or import a verified LMS capstone.
                </div>
              ) : (
                doc.projects.map((proj, pIdx) => (
                  <div key={proj.id || pIdx} className='p-4 border border-slate-200/90 rounded-xl space-y-3.5 bg-slate-50/60 shadow-2xs'>
                    <div className='flex items-center justify-between pb-1 border-b border-slate-200/60'>
                      <div className='flex items-center gap-2'>
                        <span className='text-xs font-bold text-slate-800'>Item #{pIdx + 1}</span>
                        {proj.verificationStatus === 'LMS_VERIFIED' && (
                          <span className='text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200'>
                            Verified Capstone
                          </span>
                        )}
                      </div>
                      <button
                        type='button'
                        onClick={() =>
                          setDoc({
                            ...doc,
                            projects: doc.projects.filter((_, i) => i !== pIdx),
                          })
                        }
                        className='text-slate-400 hover:text-red-500 transition-colors p-1'
                        title='Delete Item'
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                      <div>
                        <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                          {categoryConfig.projectLabels.itemTitle}
                        </label>
                        <input
                          type='text'
                          value={proj.title}
                          onChange={(e) => {
                            const next = [...doc.projects];
                            next[pIdx].title = e.target.value;
                            setDoc({ ...doc, projects: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                          placeholder={categoryConfig.projectLabels.itemTitlePlaceholder}
                        />
                      </div>

                      <div>
                        <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                          {categoryConfig.projectLabels.toolsLabel}
                        </label>
                        <input
                          type='text'
                          value={proj.techStack.join(', ')}
                          onChange={(e) => {
                            const next = [...doc.projects];
                            next[pIdx].techStack = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                            setDoc({ ...doc, projects: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                          placeholder={categoryConfig.projectLabels.toolsPlaceholder}
                        />
                      </div>

                      <div>
                        <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                          {categoryConfig.projectLabels.url1Label}
                        </label>
                        <input
                          type='url'
                          value={proj.repositoryUrl || ''}
                          onChange={(e) => {
                            const next = [...doc.projects];
                            next[pIdx].repositoryUrl = e.target.value;
                            setDoc({ ...doc, projects: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                          placeholder={categoryConfig.projectLabels.url1Placeholder}
                        />
                      </div>

                      <div>
                        <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                          {categoryConfig.projectLabels.url2Label}
                        </label>
                        <input
                          type='url'
                          value={proj.liveDemoUrl || ''}
                          onChange={(e) => {
                            const next = [...doc.projects];
                            next[pIdx].liveDemoUrl = e.target.value;
                            setDoc({ ...doc, projects: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                          placeholder={categoryConfig.projectLabels.url2Placeholder}
                        />
                      </div>

                      <div className='sm:col-span-2'>
                        <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>STAR Bullet Points</label>
                        {proj.bullets.map((bullet, bIdx) => (
                          <div key={bIdx} className='flex items-center gap-2 mb-2'>
                            <input
                              type='text'
                              value={bullet}
                              onChange={(e) => {
                                const next = [...doc.projects];
                                next[pIdx].bullets[bIdx] = e.target.value;
                                setDoc({ ...doc, projects: next });
                              }}
                              className='flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                              placeholder='Architected REST API achieving 99.9% uptime with Redis caching'
                            />
                            {proj.bullets.length > 1 && (
                              <button
                                type='button'
                                onClick={() => {
                                  const next = [...doc.projects];
                                  next[pIdx].bullets = next[pIdx].bullets.filter((_, i) => i !== bIdx);
                                  setDoc({ ...doc, projects: next });
                                }}
                                className='text-slate-400 hover:text-red-500 transition-colors p-1'
                                title='Delete bullet'
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type='button'
                          onClick={() => {
                            const next = [...doc.projects];
                            next[pIdx].bullets.push('');
                            setDoc({ ...doc, projects: next });
                          }}
                          className='inline-flex items-center gap-1 text-[11px] text-[#333d7c] font-semibold hover:underline mt-0.5'
                        >
                          <Plus size={12} />
                          <span>Add Bullet Point</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── STEP 6: Experience & Certifications (Optional) ────────────────── */}
          {step === 6 && (
            <div className='space-y-4 animate-in fade-in-50'>
              <div className='flex items-center justify-between border-b border-slate-100 pb-2'>
                <div>
                  <h3 className='text-sm font-bold text-slate-800'>Step 6: Work Experience & Certifications (Optional)</h3>
                  <p className='text-xs text-slate-500'>Internships, freelance work, and recognized technical certificates</p>
                </div>
                <button
                  type='button'
                  onClick={() =>
                    setDoc({
                      ...doc,
                      experience: [
                        ...doc.experience,
                        {
                          id: `exp_${Date.now()}`,
                          role: '',
                          organization: '',
                          employmentType: 'Full-Time',
                          location: '',
                          startDate: '',
                          endDate: 'Present',
                          current: true,
                          bullets: [''],
                        },
                      ],
                    })
                  }
                  className='inline-flex items-center gap-1 text-xs text-[#333d7c] font-semibold hover:underline'
                >
                  <Plus size={13} />
                  <span>Add Experience</span>
                </button>
              </div>

              {/* Experience list */}
              {doc.experience.map((exp, xIdx) => {
                const durationText = calculateExperienceDuration(exp.startDate, exp.endDate, exp.current);
                return (
                  <div key={exp.id || xIdx} className='p-4 border border-slate-200/90 rounded-xl space-y-3.5 bg-slate-50/60 shadow-2xs'>
                    <div className='flex items-center justify-between pb-1 border-b border-slate-200/60'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <span className='text-xs font-bold text-slate-800'>Experience #{xIdx + 1}</span>
                        {exp.employmentType && (
                          <span className='text-[10px] font-semibold text-[#333d7c] bg-[#333d7c]/10 px-2 py-0.5 rounded'>
                            {exp.employmentType}
                          </span>
                        )}
                      </div>
                      <button
                        type='button'
                        onClick={() =>
                          setDoc({
                            ...doc,
                            experience: doc.experience.filter((_, i) => i !== xIdx),
                          })
                        }
                        className='p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors'
                        title='Remove experience'
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5'>
                      {/* Job Role / Designation */}
                      <div>
                        <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                          Job Title / Designation *
                        </label>
                        <input
                          type='text'
                          value={exp.role}
                          onChange={(e) => {
                            const next = [...doc.experience];
                            next[xIdx].role = e.target.value;
                            setDoc({ ...doc, experience: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                          placeholder='e.g. Senior Software Engineer / Full-Stack Intern'
                        />
                      </div>

                      {/* Company / Organization */}
                      <div>
                        <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                          Company / Organization *
                        </label>
                        <input
                          type='text'
                          value={exp.organization}
                          onChange={(e) => {
                            const next = [...doc.experience];
                            next[xIdx].organization = e.target.value;
                            setDoc({ ...doc, experience: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                          placeholder='e.g. Google, Microsoft, Tech Corp'
                        />
                      </div>

                      {/* Employment Type */}
                      <div>
                        <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                          Employment Type
                        </label>
                        <select
                          value={exp.employmentType || 'Full-Time'}
                          onChange={(e) => {
                            const next = [...doc.experience];
                            next[xIdx].employmentType = e.target.value;
                            setDoc({ ...doc, experience: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                        >
                          <option value='Full-Time'>Full-Time</option>
                          <option value='Internship'>Internship</option>
                          <option value='Contract / Freelance'>Contract / Freelance</option>
                          <option value='Part-Time'>Part-Time</option>
                          <option value='Co-Op / Trainee'>Co-Op / Trainee</option>
                        </select>
                      </div>

                      {/* Location & Work Mode */}
                      <div>
                        <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                          Location & Work Mode
                        </label>
                        <input
                          type='text'
                          value={exp.location || ''}
                          onChange={(e) => {
                            const next = [...doc.experience];
                            next[xIdx].location = e.target.value;
                            setDoc({ ...doc, experience: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                          placeholder='e.g. Bengaluru, India (Hybrid) or Remote'
                        />
                      </div>

                      {/* Timeline: Start Date, End Date, and Work Duration */}
                      <div className='sm:col-span-2 p-3.5 bg-white rounded-xl border border-slate-200 space-y-3 shadow-2xs'>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end'>
                          <div>
                            <div className='flex items-center h-4 mb-1.5'>
                              <label className='text-[11px] font-semibold text-slate-700'>
                                Start Date (Month & Year) *
                              </label>
                            </div>
                            <input
                              type='text'
                              value={exp.startDate || ''}
                              onChange={(e) => {
                                const next = [...doc.experience];
                                next[xIdx].startDate = e.target.value;
                                setDoc({ ...doc, experience: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                              placeholder='e.g. July 2022'
                            />
                          </div>

                          <div>
                            <div className='flex items-center justify-between h-4 mb-1.5'>
                              <label className='text-[11px] font-semibold text-slate-700'>
                                End Date (Month & Year)
                              </label>
                              <label className='inline-flex items-center gap-1.5 text-[11px] font-medium text-[#333d7c] cursor-pointer select-none hover:text-[#1e2653]'>
                                <input
                                  type='checkbox'
                                  checked={exp.current ?? (exp.endDate === 'Present' || !exp.endDate)}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    const next = [...doc.experience];
                                    next[xIdx].current = isChecked;
                                    next[xIdx].endDate = isChecked ? 'Present' : '';
                                    setDoc({ ...doc, experience: next });
                                  }}
                                  className='rounded text-[#333d7c] focus:ring-0 cursor-pointer h-3.5 w-3.5'
                                />
                                <span>Present (Current Job)</span>
                              </label>
                            </div>
                            <input
                              type='text'
                              value={exp.current ? 'Present' : (exp.endDate || '')}
                              disabled={exp.current ?? (exp.endDate === 'Present')}
                              onChange={(e) => {
                                const next = [...doc.experience];
                                next[xIdx].endDate = e.target.value;
                                setDoc({ ...doc, experience: next });
                              }}
                              className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-xs transition-all ${
                                exp.current ? 'bg-slate-100/90 text-slate-500 font-medium cursor-not-allowed border-slate-200' : 'bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c]'
                              }`}
                              placeholder='e.g. November 2024'
                            />
                          </div>
                        </div>

                        {/* Tenure summary bar */}
                        <div className='flex items-center justify-between pt-2.5 border-t border-slate-100 text-[11px]'>
                          <span className='font-medium text-slate-500 flex items-center gap-1.5'>
                            <Clock size={12} className='text-[#333d7c]' />
                            <span>Lifetime Experience at this Company:</span>
                          </span>
                          {durationText ? (
                            <span className='font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs'>
                              {durationText}
                            </span>
                          ) : (
                            <span className='text-[10.5px] text-slate-400 italic'>
                              Enter start and end date to compute duration
                            </span>
                          )}
                        </div>
                      </div>

                      {/* STAR Achievement & Impact Bullets (Senior/Mid/Fresher Level) */}
                      <div className='sm:col-span-2'>
                        <div className='flex items-center justify-between mb-1.5'>
                          <label className='text-[11px] font-semibold text-slate-700'>
                            Key Responsibilities, Architecture Decisions & Impact (STAR Method)
                          </label>
                          <span className='text-[10px] text-slate-400'>
                            Action verbs + quantifiable impact
                          </span>
                        </div>

                        {(exp.bullets || []).map((bullet, bIdx) => (
                          <div key={bIdx} className='flex items-center gap-2 mb-2'>
                            <input
                              type='text'
                              value={bullet}
                              onChange={(e) => {
                                const next = [...doc.experience];
                                next[xIdx].bullets[bIdx] = e.target.value;
                                setDoc({ ...doc, experience: next });
                              }}
                              className='flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                              placeholder='Architected and scaled microservices handling 2M+ daily requests with 99.99% uptime'
                            />
                            {(exp.bullets.length > 1 || (exp.bullets.length === 1 && bullet.trim())) && (
                              <button
                                type='button'
                                onClick={() => {
                                  const next = [...doc.experience];
                                  next[xIdx].bullets = next[xIdx].bullets.filter((_, i) => i !== bIdx);
                                  setDoc({ ...doc, experience: next });
                                }}
                                className='text-slate-400 hover:text-red-500 transition-colors'
                                title='Remove bullet'
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))}

                        <button
                          type='button'
                          onClick={() => {
                            const next = [...doc.experience];
                            if (!next[xIdx].bullets) next[xIdx].bullets = [];
                            next[xIdx].bullets.push('');
                            setDoc({ ...doc, experience: next });
                          }}
                          className='text-[11px] text-[#333d7c] font-semibold hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer'
                        >
                          <Plus size={11} />
                          <span>Add Impact Bullet Point</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── EVENTS & WORKSHOPS (Optional) ────────────────────────── */}
              <div className='pt-5 border-t border-slate-200/90'>
                <div className='flex items-center justify-between pb-2 mb-2'>
                  <div>
                    <h4 className='text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5'>
                      <Calendar size={13} className='text-[#333d7c]' />
                      Events, Workshops & Hackathons (Optional)
                    </h4>
                    <p className='text-[11px] text-slate-500'>
                      Workshops attended, hackathons, bootcamps, or technical events & key takeaways
                    </p>
                  </div>
                  <button
                    type='button'
                    onClick={() =>
                      setDoc({
                        ...doc,
                        events: [
                          ...(doc.events || []),
                          {
                            id: `evt_${Date.now()}`,
                            title: '',
                            eventType: 'Workshop',
                            organizer: '',
                            date: '',
                            location: 'Online',
                            learnings: '',
                            credentialUrl: '',
                          },
                        ],
                      })
                    }
                    className='inline-flex items-center gap-1 text-xs text-[#333d7c] font-semibold hover:underline cursor-pointer'
                  >
                    <Plus size={13} />
                    <span>Add Event / Workshop</span>
                  </button>
                </div>

                {(!doc.events || doc.events.length === 0) ? (
                  <div className='text-center py-4 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50/50'>
                    No events or workshops added yet. Click "+ Add Event / Workshop" to showcase hackathons or learning workshops.
                  </div>
                ) : (
                  <div className='space-y-3'>
                    {doc.events.map((evt, eIdx) => (
                      <div
                        key={evt.id || eIdx}
                        className='p-4 border border-slate-200/90 rounded-xl space-y-3.5 bg-slate-50/60 shadow-2xs'
                      >
                        <div className='flex items-center justify-between pb-1 border-b border-slate-200/60'>
                          <div className='flex items-center gap-2'>
                            <span className='text-xs font-bold text-slate-800'>Event #{eIdx + 1}</span>
                            {evt.eventType && (
                              <span className='text-[10px] font-semibold text-[#333d7c] bg-[#333d7c]/10 px-2 py-0.5 rounded'>
                                {evt.eventType}
                              </span>
                            )}
                          </div>
                          <button
                            type='button'
                            onClick={() =>
                              setDoc({
                                ...doc,
                                events: (doc.events || []).filter((_, i) => i !== eIdx),
                              })
                            }
                            className='p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors'
                            title='Remove event'
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5'>
                          {/* Col 1: Event Name */}
                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              Event / Workshop Name *
                            </label>
                            <input
                              type='text'
                              value={evt.title}
                              onChange={(e) => {
                                const next = [...(doc.events || [])];
                                next[eIdx].title = e.target.value;
                                setDoc({ ...doc, events: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                              placeholder='e.g. Generative AI Workshop or Smart India Hackathon'
                            />
                          </div>

                          {/* Col 2: Event Type */}
                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              Event Type
                            </label>
                            <select
                              value={evt.eventType || 'Workshop'}
                              onChange={(e) => {
                                const next = [...(doc.events || [])];
                                next[eIdx].eventType = e.target.value;
                                setDoc({ ...doc, events: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                            >
                              <option value='Workshop'>Workshop</option>
                              <option value='Hackathon'>Hackathon</option>
                              <option value='Bootcamp'>Bootcamp</option>
                              <option value='Seminar'>Seminar / Webinar</option>
                              <option value='Tech Fest'>Tech Fest / Summit</option>
                              <option value='Conference'>Conference</option>
                            </select>
                          </div>

                          {/* Col 1: Organizer / Host */}
                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              Organizer / Host
                            </label>
                            <input
                              type='text'
                              value={evt.organizer || ''}
                              onChange={(e) => {
                                const next = [...(doc.events || [])];
                                next[eIdx].organizer = e.target.value;
                                setDoc({ ...doc, events: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                              placeholder='e.g. Google Developer Group / College Dept'
                            />
                          </div>

                          {/* Col 2: Month & Year */}
                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              Month & Year
                            </label>
                            <input
                              type='text'
                              value={evt.date || ''}
                              onChange={(e) => {
                                const next = [...(doc.events || [])];
                                next[eIdx].date = e.target.value;
                                setDoc({ ...doc, events: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                              placeholder='e.g. November 2024'
                            />
                          </div>

                          {/* Col 1: Location */}
                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              Location / Platform
                            </label>
                            <input
                              type='text'
                              value={evt.location || ''}
                              onChange={(e) => {
                                const next = [...(doc.events || [])];
                                next[eIdx].location = e.target.value;
                                setDoc({ ...doc, events: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                              placeholder='e.g. Online / Bengaluru'
                            />
                          </div>

                          {/* Col 2: Credential / Verification Link */}
                          <div>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              Certificate / Project Link (Optional)
                            </label>
                            <input
                              type='url'
                              value={evt.credentialUrl || ''}
                              onChange={(e) => {
                                const next = [...(doc.events || [])];
                                next[eIdx].credentialUrl = e.target.value;
                                setDoc({ ...doc, events: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                              placeholder='https://certificate-link... or GitHub repo'
                            />
                          </div>

                          {/* Full width: Key Learnings & Takeaways */}
                          <div className='sm:col-span-2'>
                            <label className='text-[11px] font-semibold text-slate-700 mb-1 block'>
                              What you learned & achieved from this event *
                            </label>
                            <textarea
                              rows={2}
                              value={evt.learnings}
                              onChange={(e) => {
                                const next = [...(doc.events || [])];
                                next[eIdx].learnings = e.target.value;
                                setDoc({ ...doc, events: next });
                              }}
                              className='w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:border-[#333d7c] transition-all'
                              placeholder='e.g. Learned prompt engineering and LLM evaluation; built and pitched an AI resume analyzer prototype in 24 hours.'
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className='px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between'>
          <div>
            {step > 1 ? (
              <button
                type='button'
                onClick={prevStep}
                className='inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors'
              >
                <ChevronLeft size={14} />
                <span>Back</span>
              </button>
            ) : (
              <span className='text-xs text-slate-400'>All edits are saved directly</span>
            )}
          </div>

          <div className='flex items-center gap-2'>
            {step < 6 ? (
              <button
                type='button'
                onClick={nextStep}
                className='inline-flex items-center gap-1 px-4 py-2 text-xs font-bold bg-[#333d7c] text-white rounded-lg hover:bg-[#252d5e] transition-colors shadow-2xs'
              >
                <span>Continue</span>
                <ChevronRight size={14} />
              </button>
            ) : (
              <>
                <button
                  type='button'
                  onClick={handleFinishManual}
                  className='inline-flex items-center gap-1 px-4 py-2 text-xs font-bold bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shadow-2xs'
                >
                  <BookOpen size={14} />
                  <span>Save & Edit Manually</span>
                </button>
                <button
                  type='button'
                  onClick={handleGenerateAI}
                  disabled={loading}
                  className='inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-gradient-to-r from-[#333d7c] to-indigo-600 text-white rounded-lg hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50'
                >
                  {loading ? <Loader2 size={14} className='animate-spin' /> : <Wand2 size={14} />}
                  <span>Polish with AI</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
