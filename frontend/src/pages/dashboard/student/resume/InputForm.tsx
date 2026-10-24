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
} from 'lucide-react';
import type { ResumeDocument } from './types';
import { RESUME_TEMPLATES } from './templateRegistry';
import { compressAvatarImage } from './resumeUtils';
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

  // Extract contact links
  const pi = doc.personalInfo;
  const linkedinLink = pi.links?.find((l) => l.label.toLowerCase().includes('linkedin') || l.url.includes('linkedin'))?.url || '';
  const githubLink = pi.links?.find((l) => l.label.toLowerCase().includes('github') || l.url.includes('github'))?.url || '';
  const portfolioLink = pi.links?.find((l) => !l.label.toLowerCase().includes('linkedin') && !l.label.toLowerCase().includes('github'))?.url || '';

  const updateLink = (label: string, url: string) => {
    const existing = (pi.links || []).filter((l) => !l.label.toLowerCase().includes(label.toLowerCase()));
    if (url.trim()) {
      existing.push({ label, url: url.trim() });
    }
    setDoc({
      ...doc,
      personalInfo: { ...pi, links: existing },
    });
  };

  const handleFinishManual = () => {
    onComplete(doc);
    onClose();
  };

  const handleGenerateAI = async () => {
    await onGenerateWithAI({
      personalInfo: doc.personalInfo,
      careerObjective: doc.summary,
      extraSkills: [
        ...doc.skills.languages,
        ...doc.skills.frameworks,
        ...doc.skills.databases,
        ...doc.skills.tools,
      ],
      workExperience: doc.experience,
      manualProjects: doc.projects,
      education: doc.education,
    });
  };

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in-50'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden'>
        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50'>
          <div>
            <div className='flex items-center gap-2'>
              <h2 className='font-bold text-[#1e2653] text-base sm:text-lg'>Placement Resume Intake Wizard</h2>
              <span className='px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#333d7c]/10 text-[#333d7c]'>
                Step {step} of 6
              </span>
            </div>
            <p className='text-xs text-slate-500 mt-0.5'>Follow FlowCV standards for verified campus placements</p>
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
        <div className='overflow-y-auto flex-1 p-6 space-y-5'>
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

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <label className='text-xs font-semibold text-slate-600 mb-1 block'>
                    Full Name <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='text'
                    value={pi.fullName}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, fullName: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20'
                    placeholder='e.g. Rahul Sharma'
                  />
                </div>

                <div>
                  <label className='text-xs font-semibold text-slate-600 mb-1 block'>
                    Target Headline / Role <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='text'
                    value={pi.headline}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, headline: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20'
                    placeholder='e.g. Software Engineer | Full-Stack Developer'
                  />
                </div>

                <div>
                  <label className='text-xs font-semibold text-slate-600 mb-1 block'>
                    Email Address (Clickable mailto:) <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='email'
                    value={pi.email}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, email: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20'
                    placeholder='rahul@example.com'
                  />
                </div>

                <div>
                  <label className='text-xs font-semibold text-slate-600 mb-1 block'>
                    Phone / WhatsApp (Clickable wa.me) <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='tel'
                    value={pi.phone || ''}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, phone: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20'
                    placeholder='+91 98765 43210'
                  />
                </div>

                <div className='sm:col-span-2'>
                  <label className='text-xs font-semibold text-slate-600 mb-1 block'>City, Country</label>
                  <input
                    type='text'
                    value={pi.location}
                    onChange={(e) => setDoc({ ...doc, personalInfo: { ...pi, location: e.target.value } })}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20'
                    placeholder='Bengaluru, India'
                  />
                </div>

                <div>
                  <label className='text-xs font-semibold text-slate-600 mb-1 block'>
                    LinkedIn Profile URL
                  </label>
                  <input
                    type='url'
                    value={linkedinLink}
                    onChange={(e) => updateLink('LinkedIn', e.target.value)}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20'
                    placeholder='https://linkedin.com/in/your-username'
                  />
                  {linkedinLink.includes('/feed') ? (
                    <p className='text-[11px] text-amber-600 font-medium mt-1'>
                      ⚠️ That is your feed URL. Use your public profile URL: https://linkedin.com/in/your-username
                    </p>
                  ) : (
                    <p className='text-[10.5px] text-slate-400 mt-0.5'>
                      Format: https://linkedin.com/in/your-name
                    </p>
                  )}
                </div>

                <div>
                  <label className='text-xs font-semibold text-slate-600 mb-1 block'>GitHub Profile URL</label>
                  <input
                    type='url'
                    value={githubLink}
                    onChange={(e) => updateLink('GitHub', e.target.value)}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20'
                    placeholder='https://github.com/rahul-sharma'
                  />
                </div>

                <div className='sm:col-span-2'>
                  <label className='text-xs font-semibold text-slate-600 mb-1 block'>Portfolio / Live Demo URL</label>
                  <input
                    type='url'
                    value={portfolioLink}
                    onChange={(e) => updateLink('Portfolio', e.target.value)}
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20'
                    placeholder='https://rahulsharma.dev'
                  />
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
                  className='w-full border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20 leading-relaxed'
                  placeholder='Aspiring Full-Stack Software Engineer with a solid foundation in React, Node.js, and PostgreSQL. Passionate about engineering high-performance web applications and mastering scalable system design.'
                />
                <span className='text-[11px] text-slate-400 mt-1 block text-right'>
                  {doc.summary.length} characters (Recommended: 150 - 300)
                </span>
              </div>
            </div>
          )}

          {/* ── STEP 3: Education & Academics ─────────────────────────────────── */}
          {step === 3 && (
            <div className='space-y-4 animate-in fade-in-50'>
              <div className='flex items-center justify-between border-b border-slate-100 pb-2'>
                <h3 className='text-sm font-bold text-slate-800'>Step 3: Education & Academic Scores</h3>
                <button
                  type='button'
                  onClick={() =>
                    setDoc({
                      ...doc,
                      education: [
                        ...doc.education,
                        {
                          id: `edu_${Date.now()}`,
                          institution: '',
                          degree: '',
                          score: '',
                          gradingSystem: 'CGPA_10',
                          startYear: 2021,
                          endYear: 2025,
                        },
                      ],
                    })
                  }
                  className='inline-flex items-center gap-1 text-xs text-[#333d7c] font-semibold hover:underline'
                >
                  <Plus size={13} />
                  <span>Add Degree</span>
                </button>
              </div>

              {doc.education.map((edu, idx) => (
                <div key={edu.id || idx} className='p-3.5 border border-slate-200 rounded-xl space-y-3 bg-slate-50/50'>
                  <div className='flex items-center justify-between'>
                    <span className='text-xs font-bold text-slate-700'>Degree #{idx + 1}</span>
                    {doc.education.length > 1 && (
                      <button
                        type='button'
                        onClick={() =>
                          setDoc({
                            ...doc,
                            education: doc.education.filter((_, i) => i !== idx),
                          })
                        }
                        className='text-slate-400 hover:text-red-500'
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                    <div>
                      <label className='text-xs text-slate-500 mb-1 block'>Degree / Course</label>
                      <input
                        type='text'
                        value={edu.degree}
                        onChange={(e) => {
                          const next = [...doc.education];
                          next[idx].degree = e.target.value;
                          setDoc({ ...doc, education: next });
                        }}
                        className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
                        placeholder='B.Tech in Computer Science'
                      />
                    </div>

                    <div>
                      <label className='text-xs text-slate-500 mb-1 block'>College / University</label>
                      <input
                        type='text'
                        value={edu.institution}
                        onChange={(e) => {
                          const next = [...doc.education];
                          next[idx].institution = e.target.value;
                          setDoc({ ...doc, education: next });
                        }}
                        className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
                        placeholder='Institute of Technology'
                      />
                    </div>

                    <div>
                      <label className='text-xs text-slate-500 mb-1 block'>Score / Grade</label>
                      <div className='flex gap-2'>
                        <input
                          type='text'
                          value={edu.score || ''}
                          onChange={(e) => {
                            const next = [...doc.education];
                            next[idx].score = e.target.value;
                            setDoc({ ...doc, education: next });
                          }}
                          className='w-28 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
                          placeholder='8.5'
                        />
                        <select
                          value={edu.gradingSystem || 'CGPA_10'}
                          onChange={(e) => {
                            const next = [...doc.education];
                            next[idx].gradingSystem = e.target.value as any;
                            setDoc({ ...doc, education: next });
                          }}
                          className='border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white'
                        >
                          <option value='CGPA_10'>CGPA / 10</option>
                          <option value='GPA_4'>GPA / 4</option>
                          <option value='PERCENTAGE'>Percentage %</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className='text-xs text-slate-500 mb-1 block'>Year Range</label>
                      <div className='flex items-center gap-2'>
                        <input
                          type='number'
                          value={edu.startYear || ''}
                          onChange={(e) => {
                            const next = [...doc.education];
                            next[idx].startYear = e.target.value;
                            setDoc({ ...doc, education: next });
                          }}
                          className='w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white'
                          placeholder='2021'
                        />
                        <span className='text-xs text-slate-400'>to</span>
                        <input
                          type='number'
                          value={edu.endYear || ''}
                          onChange={(e) => {
                            const next = [...doc.education];
                            next[idx].endYear = e.target.value;
                            setDoc({ ...doc, education: next });
                          }}
                          className='w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white'
                          placeholder='2025'
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── STEP 4: Technical Skills (Categorized) ─────────────────────────── */}
          {step === 4 && (
            <div className='space-y-4 animate-in fade-in-50'>
              <h3 className='text-sm font-bold text-slate-800 border-b border-slate-100 pb-2'>
                Step 4: Categorized Technical Skills
              </h3>
              <p className='text-xs text-slate-500'>
                List skills separated by commas. Recruiters and ATS scanners prefer categorized groupings.
              </p>

              <div className='space-y-3'>
                <div>
                  <label className='text-xs font-semibold text-slate-700 mb-1 block'>Programming Languages</label>
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
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white'
                    placeholder='JavaScript, TypeScript, Python, SQL, C++'
                  />
                </div>

                <div>
                  <label className='text-xs font-semibold text-slate-700 mb-1 block'>Frameworks & Libraries</label>
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
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white'
                    placeholder='React, Node.js, Express, TailwindCSS, Next.js'
                  />
                </div>

                <div>
                  <label className='text-xs font-semibold text-slate-700 mb-1 block'>Databases</label>
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
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white'
                    placeholder='PostgreSQL, MongoDB, Redis, MySQL'
                  />
                </div>

                <div>
                  <label className='text-xs font-semibold text-slate-700 mb-1 block'>Developer Tools & Platforms</label>
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
                    className='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white'
                    placeholder='Git, GitHub, Docker, Postman, Linux, VS Code'
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5: Projects & LMS Capstones ──────────────────────────────── */}
          {step === 5 && (
            <div className='space-y-4 animate-in fade-in-50'>
              <div className='flex items-center justify-between border-b border-slate-100 pb-2'>
                <div>
                  <h3 className='text-sm font-bold text-slate-800'>Step 5: Projects & Verified Capstones</h3>
                  <p className='text-xs text-slate-500'>Include STAR-method bullets, GitHub repository, and live demo</p>
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
                          bullets: ['Implemented core backend logic with secure authentication and database persistence'],
                          verificationStatus: 'SELF_REPORTED',
                        },
                      ],
                    })
                  }
                  className='inline-flex items-center gap-1 text-xs text-[#333d7c] font-semibold hover:underline'
                >
                  <Plus size={13} />
                  <span>Add Project</span>
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
                  No projects added yet. Click "+ Add Project" or import a verified LMS capstone.
                </div>
              ) : (
                doc.projects.map((proj, pIdx) => (
                  <div key={proj.id || pIdx} className='p-3.5 border border-slate-200 rounded-xl space-y-3 bg-slate-50/50'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <span className='text-xs font-bold text-slate-800'>Project #{pIdx + 1}</span>
                        {proj.verificationStatus === 'LMS_VERIFIED' && (
                          <span className='text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200'>
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
                        className='text-slate-400 hover:text-red-500'
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                      <div>
                        <label className='text-xs text-slate-500 mb-1 block'>Project Title</label>
                        <input
                          type='text'
                          value={proj.title}
                          onChange={(e) => {
                            const next = [...doc.projects];
                            next[pIdx].title = e.target.value;
                            setDoc({ ...doc, projects: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
                          placeholder='E-Commerce Microservices Platform'
                        />
                      </div>

                      <div>
                        <label className='text-xs text-slate-500 mb-1 block'>Tech Stack (comma-separated)</label>
                        <input
                          type='text'
                          value={proj.techStack.join(', ')}
                          onChange={(e) => {
                            const next = [...doc.projects];
                            next[pIdx].techStack = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                            setDoc({ ...doc, projects: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
                          placeholder='React, Node.js, PostgreSQL, Docker'
                        />
                      </div>

                      <div>
                        <label className='text-xs text-slate-500 mb-1 block'>GitHub Repository URL</label>
                        <input
                          type='url'
                          value={proj.repositoryUrl || ''}
                          onChange={(e) => {
                            const next = [...doc.projects];
                            next[pIdx].repositoryUrl = e.target.value;
                            setDoc({ ...doc, projects: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
                          placeholder='https://github.com/user/project'
                        />
                      </div>

                      <div>
                        <label className='text-xs text-slate-500 mb-1 block'>Live Demo / Deployment URL</label>
                        <input
                          type='url'
                          value={proj.liveDemoUrl || ''}
                          onChange={(e) => {
                            const next = [...doc.projects];
                            next[pIdx].liveDemoUrl = e.target.value;
                            setDoc({ ...doc, projects: next });
                          }}
                          className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
                          placeholder='https://project-demo.com'
                        />
                      </div>

                      <div className='sm:col-span-2'>
                        <label className='text-xs text-slate-500 mb-1 block'>STAR Bullet Points</label>
                        {proj.bullets.map((bullet, bIdx) => (
                          <div key={bIdx} className='flex items-center gap-2 mb-1.5'>
                            <input
                              type='text'
                              value={bullet}
                              onChange={(e) => {
                                const next = [...doc.projects];
                                next[pIdx].bullets[bIdx] = e.target.value;
                                setDoc({ ...doc, projects: next });
                              }}
                              className='flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
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
                                className='text-slate-400 hover:text-red-500'
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
                          className='text-[11px] text-[#333d7c] font-semibold hover:underline mt-1'
                        >
                          + Add Bullet Point
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
                          startDate: '2024',
                          endDate: 'Present',
                          bullets: ['Developed features collaboratively using agile methodologies'],
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
              {doc.experience.map((exp, xIdx) => (
                <div key={exp.id || xIdx} className='p-3.5 border border-slate-200 rounded-xl space-y-2.5 bg-slate-50/50'>
                  <div className='flex items-center justify-between'>
                    <span className='text-xs font-bold text-slate-800'>Experience #{xIdx + 1}</span>
                    <button
                      type='button'
                      onClick={() =>
                        setDoc({
                          ...doc,
                          experience: doc.experience.filter((_, i) => i !== xIdx),
                        })
                      }
                      className='text-slate-400 hover:text-red-500'
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                    <input
                      type='text'
                      value={exp.role}
                      onChange={(e) => {
                        const next = [...doc.experience];
                        next[xIdx].role = e.target.value;
                        setDoc({ ...doc, experience: next });
                      }}
                      className='border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
                      placeholder='Software Engineer Intern'
                    />
                    <input
                      type='text'
                      value={exp.organization}
                      onChange={(e) => {
                        const next = [...doc.experience];
                        next[xIdx].organization = e.target.value;
                        setDoc({ ...doc, experience: next });
                      }}
                      className='border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white'
                      placeholder='Company / Organization'
                    />
                  </div>
                </div>
              ))}
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
