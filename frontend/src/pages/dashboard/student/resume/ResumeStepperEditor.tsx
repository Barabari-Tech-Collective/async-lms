import React, { useState, useRef, useEffect, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calendar,
  Sparkles,
  Camera,
  ExternalLink,
  ChevronDown,
  GraduationCap,
  BookOpen,
} from 'lucide-react';
import type {
  ResumeDocument as ResumeDocType,
  Section,
  EducationLevel,
  ResumeProject,
  CourseCapstoneItem,
} from './types';
import { ResumeDocument } from './ResumeDocument';
import { CourseCapstonesModal } from './CourseCapstonesModal';
import { detectRoleTrack, TRACK_METADATA } from './resumeRoleMatcher';
import { compressAvatarImage } from './resumeUtils';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface ResumeStepperEditorProps {
  resumeDoc: ResumeDocType;
  onUpdate: (updated: ResumeDocType) => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  onBackToDashboard: () => void;
  onGoToPreview: () => void;
  sections?: Section[];
  user?: any;
}

const STEP_LABELS = [
  'Your Details',
  'Short Bio',
  'Projects',
  'Experience',
  'Education',
  'Certificates & Events',
  'Skills',
];

const EDUCATION_LEVEL_CONFIG: Record<
  EducationLevel,
  {
    label: string;
    short: string;
    badgeClass: string;
    qualLabel: string;
    qualPlaceholder: string;
    instLabel: string;
    instPlaceholder: string;
    fieldLabel: string;
    fieldPlaceholder: string;
  }
> = {
  degree: {
    label: 'Graduation / Degree',
    short: 'Graduation',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    qualLabel: 'Degree / Course Name',
    qualPlaceholder: 'e.g., B.Tech in Computer Science',
    instLabel: 'College / University Name',
    instPlaceholder: 'e.g., IIIT Hyderabad',
    fieldLabel: 'Specialization / Major',
    fieldPlaceholder: 'e.g., Computer Science & Engineering',
  },
  intermediate: {
    label: 'Intermediate / 12th (+2)',
    short: 'Intermediate (12th)',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    qualLabel: 'Course / Stream / Board',
    qualPlaceholder: 'e.g., Class 12 (MPC) or State Board / CBSE',
    instLabel: 'Junior College / School Name',
    instPlaceholder: 'e.g., Narayana Junior College',
    fieldLabel: 'Stream / Subject Group',
    fieldPlaceholder: 'e.g., Mathematics, Physics, Chemistry (MPC)',
  },
  schooling: {
    label: 'Schooling / 10th (SSC)',
    short: 'Schooling (10th)',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    qualLabel: 'Standard / Board',
    qualPlaceholder: 'e.g., Class 10 (SSC / CBSE / ICSE)',
    instLabel: 'School Name',
    instPlaceholder: 'e.g., St. Paul’s High School',
    fieldLabel: 'Board / Medium (Optional)',
    fieldPlaceholder: 'e.g., CBSE / State Board (English Medium)',
  },
  post_graduation: {
    label: 'Post Graduation / Master’s',
    short: 'Post Graduation',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    qualLabel: 'Master’s Degree',
    qualPlaceholder: 'e.g., M.Tech in Artificial Intelligence, MBA, MCA',
    instLabel: 'University / Institute Name',
    instPlaceholder: 'e.g., IIT Bombay',
    fieldLabel: 'Specialization / Research Focus',
    fieldPlaceholder: 'e.g., Machine Learning & Robotics',
  },
  diploma: {
    label: 'Diploma / Polytechnic',
    short: 'Diploma',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    qualLabel: 'Diploma Branch',
    qualPlaceholder: 'e.g., Diploma in Electrical & Electronics Engineering',
    instLabel: 'Polytechnic / Institute Name',
    instPlaceholder: 'e.g., Government Polytechnic College',
    fieldLabel: 'Discipline / Trade',
    fieldPlaceholder: 'e.g., Electrical & Electronics Engineering',
  },
};

const SAMPLE_COPY = {
  shortBio:
    'Motivated software engineering graduate with a strong foundation in full-stack web development, data structures, and clean code principles. Experienced in building responsive web applications using JavaScript/TypeScript, Python, and modern backend frameworks. Passionate about solving complex technical problems and eager to contribute to high-impact engineering teams.',
  projectDesc:
    'Developed a full-stack e-commerce application using React, Node.js, and MongoDB featuring real-time inventory management, user authentication (JWT), and integrated Stripe payment processing. Improved page load speed by 35% through query optimization and component lazy loading.',
  roleDesc:
    'Built scalable backend microservices using Python (FastAPI) and Docker. Managed AWS cloud infrastructure (S3, EC2) and automated CI/CD deployment pipelines, resulting in a 40% reduction in deployment errors.',
  eventDesc:
    'Attended expert-led sessions on modern cloud infrastructure, serverless architectures, and CI/CD pipelines. Gained industry insights into scalable microservices and deployment best practices.',
};

export const ResumeStepperEditor: React.FC<ResumeStepperEditorProps> = ({
  resumeDoc,
  onUpdate,
  currentStep,
  setCurrentStep,
  onBackToDashboard,
  onGoToPreview,
  sections,
  user,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCapstoneModal, setShowCapstoneModal] = useState<boolean>(false);

  // Detect track from headline, targetRole, or category
  const detectedTrack = detectRoleTrack(
    resumeDoc.personalInfo?.headline,
    resumeDoc.targetRole,
    resumeDoc.category
  );
  const trackInfo = TRACK_METADATA[detectedTrack] || TRACK_METADATA.tech;

  const handleSelectCapstone = (capstone: CourseCapstoneItem) => {
    // Check if already in projects
    const alreadyExists = (resumeDoc.projects || []).some(
      (p) =>
        p.id === capstone.id ||
        p.lmsProjectId === capstone.id ||
        p.title.toLowerCase().trim() === capstone.title.toLowerCase().trim()
    );

    if (alreadyExists) {
      toast('This capstone is already in your projects list');
      return;
    }

    const newProject: ResumeProject = {
      id: capstone.id || `proj_cap_${Date.now()}`,
      lmsProjectId: capstone.id,
      title: capstone.title,
      description: capstone.description,
      techStack: capstone.techStack || [],
      repositoryUrl: capstone.userSubmissionLink || capstone.githubUrl || '',
      liveDemoUrl: capstone.liveDemoUrl || '',
      bullets: capstone.bullets?.length ? capstone.bullets : [capstone.description],
      verificationStatus: capstone.score ? 'LMS_VERIFIED' : 'CREDENTIAL_LINK_PROVIDED',
      isCourseCapstone: true,
      courseName: capstone.course_name,
      score: capstone.score || undefined,
    };

    onUpdate({
      ...resumeDoc,
      projects: [newProject, ...(resumeDoc.projects || [])],
    });
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  // Helper to safely extract link values by label
  const getLinkUrl = (label: string): string => {
    const found = resumeDoc.personalInfo?.links?.find(
      (l) => l.label.toLowerCase() === label.toLowerCase()
    );
    return found ? found.url : '';
  };

  const updateLinkUrl = (label: string, url: string) => {
    const currentLinks = [...(resumeDoc.personalInfo?.links || [])];
    const idx = currentLinks.findIndex(
      (l) => l.label.toLowerCase() === label.toLowerCase()
    );
    if (idx !== -1) {
      currentLinks[idx] = { label, url };
    } else {
      currentLinks.push({ label, url });
    }
    onUpdate({
      ...resumeDoc,
      personalInfo: {
        ...resumeDoc.personalInfo,
        links: currentLinks,
      },
    });
  };

  // Avatar Upload Handler
  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressAvatarImage(file);
      onUpdate({
        ...resumeDoc,
        personalInfo: {
          ...resumeDoc.personalInfo,
          avatarUrl: compressed,
        },
      });
      toast.success('Profile photo updated!');
    } catch {
      toast.error('Failed to process image. Try a smaller JPG or PNG.');
    }
  };

  // Navigation handlers
  const handleNext = () => {
    if (currentStep < 7) {
      setCurrentStep(currentStep + 1);
    } else {
      onGoToPreview();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      onBackToDashboard();
    }
  };

  return (
    <div className='min-h-screen bg-[#F1F4F9] text-slate-800 pb-16 font-sans antialiased'>
      <div className='max-w-[1280px] mx-auto pt-4 px-4 sm:px-6'>
        {/* Top Header & Stepper */}
        <div className='mb-6'>
          {/* Back Action */}
          <div className='flex items-center gap-2 mb-3'>
            <button
              type='button'
              onClick={handleBack}
              className='p-1.5 rounded-md hover:bg-slate-200/70 text-black transition-colors cursor-pointer'
              title='Go back'
            >
              <ArrowLeft size={20} strokeWidth={2.5} />
            </button>
          </div>

          {/* Stepper Card */}
          <div className='bg-white shadow-[3px_4px_5.2px_#DBEAFF] rounded-md px-4 py-3 flex items-center justify-between sm:justify-center overflow-x-auto gap-2 sm:gap-4'>
            {STEP_LABELS.map((label, idx) => {
              const stepNum = idx + 1;
              const isActive = stepNum === currentStep;
              const isPast = stepNum < currentStep;

              return (
                <React.Fragment key={label}>
                  <div
                    onClick={() => setCurrentStep(stepNum)}
                    className='flex items-center gap-2 shrink-0 cursor-pointer select-none'
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        isActive || isPast
                          ? 'bg-[#1F285B] text-white'
                          : 'bg-[#FFE4BF] text-[#6B7280]'
                      }`}
                    >
                      {stepNum}
                    </div>
                    <span
                      className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${
                        isActive
                          ? 'text-[#1F285B]'
                          : isPast
                          ? 'text-[#1F285B]/80'
                          : 'text-[#6B7280]'
                      }`}
                    >
                      {label}
                    </span>
                  </div>

                  {idx < STEP_LABELS.length - 1 && (
                    <div
                      className={`hidden md:block w-8 sm:w-10 h-[2px] shrink-0 transition-colors ${
                        isPast ? 'bg-[#1F285B]' : 'bg-[#E5E7EB]'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Subheading */}
          <div className='mt-5 mb-2'>
            <h2 className='text-xl sm:text-2xl font-bold text-[#374151]'>
              Lets Get Started
            </h2>
            <p className='text-xs sm:text-sm text-[#374151] font-medium'>
              Create new resume to apply for Jobs.
            </p>
          </div>
        </div>

        {/* 2-Column Split Screen Layout */}
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'>
          {/* Left Column: Form Controls (7 cols or ~532px) */}
          <div className='lg:col-span-6 bg-white rounded-xl shadow-xs border border-slate-200/70 p-6 sm:p-8 min-h-[600px] flex flex-col justify-between'>
            <div>
              {/* ───────────────────────────────────────────────────────────── */}
              {/* STEP 1: YOUR DETAILS                                          */}
              {/* ───────────────────────────────────────────────────────────── */}
              {currentStep === 1 && (
                <div className='space-y-6 animate-in fade-in-50 duration-200'>
                  <div>
                    <h3 className='text-xl font-bold text-[#374151]'>
                      Your Resume Heading
                    </h3>
                    <p className='text-xs sm:text-sm text-[#374151] mt-0.5'>
                      How do you want employers to contact you?
                    </p>
                  </div>

                  {/* Profile Avatar Upload */}
                  <div className='flex items-center gap-4'>
                    <div className='relative'>
                      <div className='w-24 h-24 rounded-full border-2 border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center shadow-xs'>
                        {resumeDoc.personalInfo?.avatarUrl ? (
                          <img
                            src={resumeDoc.personalInfo.avatarUrl}
                            alt='Profile avatar'
                            className='w-full h-full object-cover'
                          />
                        ) : (
                          <Camera size={28} className='text-slate-400' />
                        )}
                      </div>
                      <button
                        type='button'
                        onClick={() => fileInputRef.current?.click()}
                        className='absolute bottom-0 right-0 w-7 h-7 rounded-full bg-black text-white flex items-center justify-center shadow-md hover:scale-105 transition-transform cursor-pointer'
                        title='Upload Photo'
                      >
                        <Plus size={16} strokeWidth={2.5} />
                      </button>
                      <input
                        ref={fileInputRef}
                        type='file'
                        accept='image/png,image/jpeg,image/webp'
                        className='hidden'
                        onChange={handleAvatarChange}
                      />
                    </div>
                    {resumeDoc.personalInfo?.avatarUrl && (
                      <button
                        type='button'
                        onClick={() =>
                          onUpdate({
                            ...resumeDoc,
                            personalInfo: {
                              ...resumeDoc.personalInfo,
                              avatarUrl: '',
                            },
                          })
                        }
                        className='text-xs text-rose-600 hover:underline font-medium'
                      >
                        Remove photo
                      </button>
                    )}
                  </div>

                  {/* Job Title */}
                  <div>
                    <label className='block text-xs font-semibold text-[#374151] mb-1.5'>
                      Job Title
                    </label>
                    <input
                      type='text'
                      value={resumeDoc.personalInfo?.headline || ''}
                      onChange={(e) =>
                        onUpdate({
                          ...resumeDoc,
                          personalInfo: {
                            ...resumeDoc.personalInfo,
                            headline: e.target.value,
                          },
                        })
                      }
                      placeholder='Software Developer'
                      className='w-full px-3.5 py-2 text-xs sm:text-sm bg-white/70 border border-[#344499]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800'
                    />
                  </div>

                  {/* First Name & Last Name */}
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-xs font-semibold text-[#374151] mb-1.5'>
                        Full / First Name
                      </label>
                      <input
                        type='text'
                        value={resumeDoc.personalInfo?.fullName || ''}
                        onChange={(e) =>
                          onUpdate({
                            ...resumeDoc,
                            personalInfo: {
                              ...resumeDoc.personalInfo,
                              fullName: e.target.value,
                            },
                          })
                        }
                        placeholder='John Doe'
                        className='w-full px-3.5 py-2 text-xs sm:text-sm bg-white/70 border border-[#344499]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800'
                      />
                    </div>
                    <div>
                      <label className='block text-xs font-semibold text-[#374151] mb-1.5'>
                        Location / City
                      </label>
                      <input
                        type='text'
                        value={resumeDoc.personalInfo?.location || ''}
                        onChange={(e) =>
                          onUpdate({
                            ...resumeDoc,
                            personalInfo: {
                              ...resumeDoc.personalInfo,
                              location: e.target.value,
                            },
                          })
                        }
                        placeholder='Bangalore, India'
                        className='w-full px-3.5 py-2 text-xs sm:text-sm bg-white/70 border border-[#344499]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800'
                      />
                    </div>
                  </div>

                  {/* Email & Phone Number */}
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-xs font-semibold text-[#374151] mb-1.5'>
                        Email
                      </label>
                      <input
                        type='email'
                        value={resumeDoc.personalInfo?.email || ''}
                        onChange={(e) =>
                          onUpdate({
                            ...resumeDoc,
                            personalInfo: {
                              ...resumeDoc.personalInfo,
                              email: e.target.value,
                            },
                          })
                        }
                        placeholder='john@example.com'
                        className='w-full px-3.5 py-2 text-xs sm:text-sm bg-white/70 border border-[#344499]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800'
                      />
                    </div>
                    <div>
                      <label className='block text-xs font-semibold text-[#374151] mb-1.5'>
                        Phone Number
                      </label>
                      <input
                        type='text'
                        value={resumeDoc.personalInfo?.phone || ''}
                        onChange={(e) =>
                          onUpdate({
                            ...resumeDoc,
                            personalInfo: {
                              ...resumeDoc.personalInfo,
                              phone: e.target.value,
                            },
                          })
                        }
                        placeholder='+91 9876543210'
                        className='w-full px-3.5 py-2 text-xs sm:text-sm bg-white/70 border border-[#344499]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800'
                      />
                    </div>
                  </div>

                  {/* Professional Links */}
                  <div className='pt-2'>
                    <h4 className='text-sm font-bold text-[#374151] mb-3'>
                      Professional Links
                    </h4>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                      <div>
                        <label className='block text-xs font-semibold text-[#374151] mb-1'>
                          LinkedIn
                        </label>
                        <input
                          type='text'
                          value={getLinkUrl('LinkedIn')}
                          onChange={(e) => updateLinkUrl('LinkedIn', e.target.value)}
                          placeholder='https://linkedin.com/in/john'
                          className='w-full px-3.5 py-2 text-xs bg-[#FFFAF3]/40 border border-[#344499]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800'
                        />
                      </div>
                      <div>
                        <label className='block text-xs font-semibold text-[#374151] mb-1'>
                          GitHub Profile Link
                        </label>
                        <input
                          type='text'
                          value={getLinkUrl('GitHub')}
                          onChange={(e) => updateLinkUrl('GitHub', e.target.value)}
                          placeholder='https://github.com/john'
                          className='w-full px-3.5 py-2 text-xs bg-[#FFFAF3]/40 border border-[#344499]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800'
                        />
                      </div>
                      <div>
                        <label className='block text-xs font-semibold text-[#374151] mb-1'>
                          Portfolio
                        </label>
                        <input
                          type='text'
                          value={getLinkUrl('Portfolio')}
                          onChange={(e) => updateLinkUrl('Portfolio', e.target.value)}
                          placeholder='https://john.dev'
                          className='w-full px-3.5 py-2 text-xs bg-[#FFFAF3]/40 border border-[#344499]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800'
                        />
                      </div>
                      <div>
                        <label className='block text-xs font-semibold text-[#374151] mb-1'>
                          LeetCode / Coding Profile
                        </label>
                        <input
                          type='text'
                          value={getLinkUrl('LeetCode')}
                          onChange={(e) => updateLinkUrl('LeetCode', e.target.value)}
                          placeholder='https://leetcode.com/u/john'
                          className='w-full px-3.5 py-2 text-xs bg-[#FFFAF3]/40 border border-[#344499]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800'
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* STEP 2: SHORT BIO (ABOUT YOU)                                 */}
              {/* ───────────────────────────────────────────────────────────── */}
              {currentStep === 2 && (
                <div className='space-y-6 animate-in fade-in-50 duration-200'>
                  <div>
                    <h3 className='text-xl font-bold text-[#374151]'>About You</h3>
                    <p className='text-xs sm:text-sm text-[#374151] mt-0.5'>
                      Add a concise summary of your professional background, key skills, and career goals.
                    </p>
                  </div>

                  <div>
                    <label className='block text-xs font-semibold text-[#374151] mb-1.5'>
                      Short Bio
                    </label>
                    <textarea
                      rows={5}
                      value={resumeDoc.summary || ''}
                      onChange={(e) =>
                        onUpdate({ ...resumeDoc, summary: e.target.value })
                      }
                      placeholder='I am an aspiring software developer...'
                      className='w-full p-3.5 text-xs sm:text-sm bg-[#DEE8FB]/40 border border-slate-200 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800 resize-none leading-relaxed'
                    />
                  </div>

                  {/* Sample Short Bio Clickable Card */}
                  <div className='pt-2'>
                    <div className='flex items-center justify-between mb-1.5'>
                      <span className='text-xs font-bold text-[#374151]'>
                        Sample Short Bio
                      </span>
                      <button
                        type='button'
                        onClick={() =>
                          onUpdate({ ...resumeDoc, summary: SAMPLE_COPY.shortBio })
                        }
                        className='text-[11px] font-semibold text-[#344499] hover:underline cursor-pointer flex items-center gap-1'
                      >
                        <Sparkles size={12} />
                        Use Sample
                      </button>
                    </div>
                    <div
                      onClick={() =>
                        onUpdate({ ...resumeDoc, summary: SAMPLE_COPY.shortBio })
                      }
                      className='p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-xs text-slate-600 leading-relaxed cursor-pointer'
                    >
                      {SAMPLE_COPY.shortBio}
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* STEP 3: PROJECTS                                              */}
              {/* ───────────────────────────────────────────────────────────── */}
              {currentStep === 3 && (
                <div className='space-y-6 animate-in fade-in-50 duration-200'>
                  <div>
                    <h3 className='text-xl font-bold text-[#374151]'>
                      Add Your Best Projects
                    </h3>
                    <p className='text-xs sm:text-sm text-[#374151] mt-0.5'>
                      Showcase your best technical and capstone deliverables. You can add your own local projects or select verified capstones from your courses.
                    </p>
                  </div>

                  {/* Course Capstones Banner Card */}
                  <div className='bg-[#DEE8FB] border border-[#223498]/20 rounded-xl p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs'>
                    <div className='flex items-start gap-3'>
                      <div className='w-9 h-9 rounded-xl bg-[#223498] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5'>
                        <GraduationCap size={18} />
                      </div>
                      <div>
                        <div className='flex items-center gap-2 flex-wrap'>
                          <span className='text-xs sm:text-sm font-bold text-[#223498]'>
                            Course Capstone Projects Available
                          </span>
                          <span className='text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-white text-[#223498] border border-[#223498]/25 shadow-2xs'>
                            🎯 Track: {resumeDoc.personalInfo?.headline || trackInfo.label}
                          </span>
                        </div>
                        <p className='text-xs text-[#223498]/85 mt-0.5 leading-relaxed'>
                          Import verified capstones directly from your CodeGuru courses (Full-Stack Web Development, Java, Excel For Data Analysis).
                        </p>
                      </div>
                    </div>

                    <button
                      type='button'
                      onClick={() => setShowCapstoneModal(true)}
                      className='inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#040000] hover:bg-black/85 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer whitespace-nowrap shrink-0 hover:scale-[1.02]'
                    >
                      <Sparkles size={13} className='text-amber-300' />
                      <span>Select Capstone Projects</span>
                    </button>
                  </div>

                  {/* Projects List */}
                  <div className='space-y-6'>
                    {(resumeDoc.projects || []).map((project, pIdx) => (
                      <div
                        key={project.id || pIdx}
                        className='p-4 rounded-xl border border-slate-200 bg-slate-50/50 relative space-y-4 transition-all hover:border-slate-300'
                      >
                        <div className='flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2'>
                          <div className='flex items-center gap-2'>
                            <span className='text-xs font-bold text-[#374151] uppercase tracking-wider'>
                              Project #{pIdx + 1}
                            </span>
                            {project.isCourseCapstone && (
                              <span className='inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200'>
                                <GraduationCap size={11} />
                                {project.courseName || 'CodeGuru Capstone'}
                              </span>
                            )}
                            {project.verificationStatus === 'LMS_VERIFIED' && (
                              <span className='text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200'>
                                LMS Verified
                              </span>
                            )}
                          </div>

                          {(resumeDoc.projects || []).length > 1 && (
                            <button
                              type='button'
                              onClick={() => {
                                const next = (resumeDoc.projects || []).filter((_, i) => i !== pIdx);
                                onUpdate({ ...resumeDoc, projects: next });
                              }}
                              className='text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer'
                              title='Remove Project'
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>

                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                          <div>
                            <label className='block text-xs font-semibold text-[#374151] mb-1'>
                              Add Project Title - {pIdx + 1}
                            </label>
                            <input
                              type='text'
                              value={project.title}
                              onChange={(e) => {
                                const next = [...resumeDoc.projects];
                                next[pIdx] = { ...next[pIdx], title: e.target.value };
                                onUpdate({ ...resumeDoc, projects: next });
                              }}
                              placeholder='e.g. E-commerce App'
                              className='w-full px-3 py-2 text-xs bg-white border border-[#344499]/20 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400'
                            />
                          </div>
                          <div>
                            <label className='block text-xs font-semibold text-[#374151] mb-1'>
                              Add Project live link
                            </label>
                            <input
                              type='text'
                              value={project.liveDemoUrl || ''}
                              onChange={(e) => {
                                const next = [...resumeDoc.projects];
                                next[pIdx] = { ...next[pIdx], liveDemoUrl: e.target.value };
                                onUpdate({ ...resumeDoc, projects: next });
                              }}
                              placeholder='e.g. https://projectlink.com'
                              className='w-full px-3 py-2 text-xs bg-white border border-[#344499]/20 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400'
                            />
                          </div>
                        </div>

                        <div>
                          <label className='block text-xs font-semibold text-[#374151] mb-1'>
                            Add Github Link
                          </label>
                          <input
                            type='text'
                            value={project.repositoryUrl || ''}
                            onChange={(e) => {
                              const next = [...resumeDoc.projects];
                              next[pIdx] = { ...next[pIdx], repositoryUrl: e.target.value };
                              onUpdate({ ...resumeDoc, projects: next });
                            }}
                            placeholder='e.g. https://github.com/username/project'
                            className='w-full px-3 py-2 text-xs bg-white border border-[#344499]/20 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400'
                          />
                        </div>

                        <div>
                          <div className='flex items-center justify-between mb-1'>
                            <label className='text-xs font-semibold text-[#374151]'>
                              Add Project Description
                            </label>
                            <button
                              type='button'
                              onClick={() => {
                                const next = [...resumeDoc.projects];
                                next[pIdx] = {
                                  ...next[pIdx],
                                  description: SAMPLE_COPY.projectDesc,
                                  bullets: [SAMPLE_COPY.projectDesc],
                                };
                                onUpdate({ ...resumeDoc, projects: next });
                              }}
                              className='text-[10px] font-semibold text-[#344499] underline hover:text-[#223498] cursor-pointer'
                            >
                              Sample Project description
                            </button>
                          </div>
                          <textarea
                            rows={3}
                            value={project.description || project.bullets?.[0] || ''}
                            onChange={(e) => {
                              const next = [...resumeDoc.projects];
                              next[pIdx] = {
                                ...next[pIdx],
                                description: e.target.value,
                                bullets: [e.target.value],
                              };
                              onUpdate({ ...resumeDoc, projects: next });
                            }}
                            placeholder='Key features, architecture, and impact...'
                            className='w-full p-3 text-xs bg-[#DEE8FB]/40 border border-slate-200 rounded-xl text-slate-800 resize-none focus:outline-none focus:ring-1 focus:ring-slate-400'
                          />
                        </div>
                      </div>
                    ))}

                    {/* Action Buttons: Add Custom Project + Select from Capstones */}
                    <div className='flex items-center flex-wrap gap-2.5 pt-1'>
                      <button
                        type='button'
                        onClick={() => {
                          const newProj: ResumeProject = {
                            id: `proj_${Date.now()}`,
                            title: '',
                            description: '',
                            techStack: [],
                            repositoryUrl: '',
                            liveDemoUrl: '',
                            bullets: [''],
                            verificationStatus: 'SELF_REPORTED' as const,
                          };
                          onUpdate({
                            ...resumeDoc,
                            projects: [...(resumeDoc.projects || []), newProj],
                          });
                        }}
                        className='inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-[#374151] hover:text-black cursor-pointer shadow-2xs transition-all'
                      >
                        <div className='w-4 h-4 rounded-full bg-black text-white flex items-center justify-center'>
                          <Plus size={10} strokeWidth={2.5} />
                        </div>
                        <span>+ Add Custom Project</span>
                      </button>

                      <button
                        type='button'
                        onClick={() => setShowCapstoneModal(true)}
                        className='inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#223498]/30 bg-[#DEE8FB]/70 hover:bg-[#DEE8FB] text-xs font-bold text-[#223498] cursor-pointer shadow-2xs transition-all'
                      >
                        <Sparkles size={13} className='text-[#223498]' />
                        <span>Select from Course Capstones</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* STEP 4: PROFESSIONAL EXPERIENCE                               */}
              {/* ───────────────────────────────────────────────────────────── */}
              {currentStep === 4 && (
                <div className='space-y-6 animate-in fade-in-50 duration-200'>
                  <div>
                    <h3 className='text-xl font-bold text-[#374151]'>
                      Professional Experience
                    </h3>
                    <p className='text-xs sm:text-sm text-[#374151] mt-0.5'>
                      Add your recent jobs, internships, or freelance roles to highlight your career history.
                    </p>
                  </div>

                  <div className='space-y-6'>
                    {(resumeDoc.experience || []).map((exp, eIdx) => (
                      <div
                        key={exp.id || eIdx}
                        className='p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4'
                      >
                        <div className='flex items-center justify-between border-b border-slate-200 pb-2'>
                          <span className='text-xs font-bold text-[#374151] uppercase tracking-wider'>
                            Role #{eIdx + 1}
                          </span>
                          <button
                            type='button'
                            onClick={() => {
                              const next = (resumeDoc.experience || []).filter((_, i) => i !== eIdx);
                              onUpdate({ ...resumeDoc, experience: next });
                            }}
                            className='text-slate-400 hover:text-rose-600 p-1 cursor-pointer'
                            title='Remove Experience'
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                          <div>
                            <label className='block text-xs font-semibold text-[#374151] mb-1'>
                              Role
                            </label>
                            <input
                              type='text'
                              value={exp.role}
                              onChange={(e) => {
                                const next = [...resumeDoc.experience];
                                next[eIdx] = { ...next[eIdx], role: e.target.value };
                                onUpdate({ ...resumeDoc, experience: next });
                              }}
                              placeholder='e.g. Product Designer'
                              className='w-full px-3 py-2 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                            />
                          </div>
                          <div>
                            <label className='block text-xs font-semibold text-[#374151] mb-1'>
                              Company Name
                            </label>
                            <input
                              type='text'
                              value={exp.organization || exp.company || ''}
                              onChange={(e) => {
                                const next = [...resumeDoc.experience];
                                next[eIdx] = {
                                  ...next[eIdx],
                                  organization: e.target.value,
                                  company: e.target.value,
                                };
                                onUpdate({ ...resumeDoc, experience: next });
                              }}
                              placeholder='e.g. Acme Corp'
                              className='w-full px-3 py-2 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                            />
                          </div>
                        </div>

                        {/* Employment Duration */}
                        <div>
                          <label className='block text-xs font-semibold text-[#374151] mb-1'>
                            Employment Duration
                          </label>
                          <div className='grid grid-cols-2 gap-3 p-2 bg-white border border-[#D1D5DB] rounded-xl items-center'>
                            <div className='flex items-center gap-2 bg-[#F9FAFB] rounded-lg px-2.5 py-1.5'>
                              <Calendar size={14} className='text-slate-500 shrink-0' />
                              <input
                                type='text'
                                value={exp.startDate || ''}
                                onChange={(e) => {
                                  const next = [...resumeDoc.experience];
                                  next[eIdx] = { ...next[eIdx], startDate: e.target.value };
                                  onUpdate({ ...resumeDoc, experience: next });
                                }}
                                placeholder='May 2026'
                                className='w-full bg-transparent text-xs text-slate-800 focus:outline-hidden'
                              />
                            </div>
                            <div className='flex items-center gap-2 bg-[#F9FAFB] rounded-lg px-2.5 py-1.5'>
                              <Calendar size={14} className='text-slate-500 shrink-0' />
                              <input
                                type='text'
                                value={exp.current ? 'Present' : exp.endDate || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const next = [...resumeDoc.experience];
                                  next[eIdx] = {
                                    ...next[eIdx],
                                    endDate: val,
                                    current: val.toLowerCase() === 'present',
                                  };
                                  onUpdate({ ...resumeDoc, experience: next });
                                }}
                                placeholder='Present'
                                className='w-full bg-transparent text-xs text-slate-800 focus:outline-hidden'
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className='flex items-center justify-between mb-1'>
                            <label className='text-xs font-semibold text-[#374151]'>
                              Add Role Description
                            </label>
                            <button
                              type='button'
                              onClick={() => {
                                const next = [...resumeDoc.experience];
                                next[eIdx] = {
                                  ...next[eIdx],
                                  bullets: [SAMPLE_COPY.roleDesc],
                                };
                                onUpdate({ ...resumeDoc, experience: next });
                              }}
                              className='text-[10px] font-semibold text-[#344499] underline hover:text-[#223498] cursor-pointer'
                            >
                              Sample Role Description
                            </button>
                          </div>
                          <textarea
                            rows={3}
                            value={exp.bullets?.[0] || ''}
                            onChange={(e) => {
                              const next = [...resumeDoc.experience];
                              next[eIdx] = {
                                ...next[eIdx],
                                bullets: [e.target.value],
                              };
                              onUpdate({ ...resumeDoc, experience: next });
                            }}
                            placeholder='Responsibilities, achievements, and impact...'
                            className='w-full p-3 text-xs bg-[#DEE8FB]/40 border border-slate-200 rounded-xl text-slate-800 resize-none'
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      type='button'
                      onClick={() => {
                        const newExp = {
                          id: `exp_${Date.now()}`,
                          role: '',
                          organization: '',
                          company: '',
                          startDate: '',
                          endDate: 'Present',
                          current: true,
                          bullets: [''],
                        };
                        onUpdate({
                          ...resumeDoc,
                          experience: [...(resumeDoc.experience || []), newExp],
                        });
                      }}
                      className='inline-flex items-center gap-1.5 text-xs font-bold text-[#374151] hover:text-black cursor-pointer'
                    >
                      <div className='w-5 h-5 rounded-full bg-black text-white flex items-center justify-center'>
                        <Plus size={12} strokeWidth={2.5} />
                      </div>
                      <span>Add Experience</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* STEP 5: EDUCATION & ACCOMPLISHMENTS                           */}
              {/* ───────────────────────────────────────────────────────────── */}
              {currentStep === 5 && (
                <div className='space-y-6 animate-in fade-in-50 duration-200'>
                  <div>
                    <h3 className='text-xl font-bold text-[#374151]'>
                      Education
                    </h3>
                    <p className='text-xs sm:text-sm text-[#374151] mt-0.5'>
                      Add your college degrees, intermediate (+2 / 12th), schooling (10th / SSC), or diploma to showcase your complete academic journey.
                    </p>
                  </div>

                  <div className='space-y-4'>
                    {(resumeDoc.education || []).map((edu, eduIdx) => {
                      const level = (edu.level || 'degree') as EducationLevel;
                      const config = EDUCATION_LEVEL_CONFIG[level] || EDUCATION_LEVEL_CONFIG.degree;

                      return (
                        <div
                          key={edu.id || eduIdx}
                          className='p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3.5 shadow-xs transition-all hover:border-slate-300'
                        >
                          <div className='flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-200/80'>
                            <div className='flex items-center gap-2'>
                              <div className='w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold'>
                                {eduIdx + 1}
                              </div>
                              <span className='text-xs font-bold text-slate-700'>
                                Education #{eduIdx + 1}
                              </span>
                              <span className={cn('text-[11px] font-semibold px-2.5 py-0.5 rounded-full border', config.badgeClass)}>
                                {config.short}
                              </span>
                            </div>

                            <div className='flex items-center gap-2 flex-wrap'>
                              {/* Level Category Switcher */}
                              <div className='flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs'>
                                {(
                                  [
                                    { key: 'degree', label: 'Degree' },
                                    { key: 'intermediate', label: '12th / Inter' },
                                    { key: 'schooling', label: '10th / School' },
                                    { key: 'post_graduation', label: 'PG' },
                                    { key: 'diploma', label: 'Diploma' },
                                  ] as { key: EducationLevel; label: string }[]
                                ).map((lvl) => {
                                  const isSelected = level === lvl.key;
                                  return (
                                    <button
                                      key={lvl.key}
                                      type='button'
                                      onClick={() => {
                                        const next = [...(resumeDoc.education || [])];
                                        next[eduIdx] = { ...next[eduIdx], level: lvl.key };
                                        onUpdate({ ...resumeDoc, education: next });
                                      }}
                                      className={cn(
                                        'px-2 py-0.5 text-[11px] font-medium rounded-md transition-all cursor-pointer',
                                        isSelected
                                          ? 'bg-[#1F285B] text-white shadow-xs'
                                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                      )}
                                    >
                                      {lvl.label}
                                    </button>
                                  );
                                })}
                              </div>

                              {(resumeDoc.education || []).length > 1 && (
                                <button
                                  type='button'
                                  onClick={() => {
                                    const next = (resumeDoc.education || []).filter((_, i) => i !== eduIdx);
                                    onUpdate({ ...resumeDoc, education: next });
                                  }}
                                  className='text-slate-400 hover:text-rose-600 p-1.5 rounded-md hover:bg-rose-50 transition-colors cursor-pointer'
                                  title='Remove education entry'
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Row 1: Qualification Name & Institution Name */}
                          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                            <div>
                              <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                {config.qualLabel}
                              </label>
                              <input
                                type='text'
                                value={edu.degree || ''}
                                onChange={(e) => {
                                  const next = [...(resumeDoc.education || [])];
                                  next[eduIdx] = { ...next[eduIdx], degree: e.target.value };
                                  onUpdate({ ...resumeDoc, education: next });
                                }}
                                placeholder={config.qualPlaceholder}
                                className='w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400'
                              />
                            </div>
                            <div>
                              <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                {config.instLabel}
                              </label>
                              <input
                                type='text'
                                value={edu.institution || ''}
                                onChange={(e) => {
                                  const next = [...(resumeDoc.education || [])];
                                  next[eduIdx] = { ...next[eduIdx], institution: e.target.value };
                                  onUpdate({ ...resumeDoc, education: next });
                                }}
                                placeholder={config.instPlaceholder}
                                className='w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400'
                              />
                            </div>
                          </div>

                          {/* Row 2: Field of Study / Stream & Graduation Year */}
                          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                            <div>
                              <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                {config.fieldLabel}
                              </label>
                              <input
                                type='text'
                                value={edu.fieldOfStudy || ''}
                                onChange={(e) => {
                                  const next = [...(resumeDoc.education || [])];
                                  next[eduIdx] = { ...next[eduIdx], fieldOfStudy: e.target.value };
                                  onUpdate({ ...resumeDoc, education: next });
                                }}
                                placeholder={config.fieldPlaceholder}
                                className='w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400'
                              />
                            </div>
                            <div>
                              <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                Graduation Year / Duration
                              </label>
                              <input
                                type='text'
                                value={
                                  edu.startYear && edu.endYear
                                    ? `${edu.startYear} – ${edu.endYear}`
                                    : edu.endYear || ''
                                }
                                onChange={(e) => {
                                  const next = [...(resumeDoc.education || [])];
                                  next[eduIdx] = { ...next[eduIdx], endYear: e.target.value };
                                  onUpdate({ ...resumeDoc, education: next });
                                }}
                                placeholder={level === 'schooling' ? 'e.g., 2020' : 'e.g., 2022 – 2026'}
                                className='w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400'
                              />
                            </div>
                          </div>

                          {/* Row 3: Grade / CGPA */}
                          <div>
                            <label className='block text-xs font-semibold text-[#374151] mb-1'>
                              Grade / CGPA / Percentage
                            </label>
                            <input
                              type='text'
                              value={edu.score || ''}
                              onChange={(e) => {
                                const next = [...(resumeDoc.education || [])];
                                next[eduIdx] = { ...next[eduIdx], score: e.target.value };
                                onUpdate({ ...resumeDoc, education: next });
                              }}
                              placeholder={
                                level === 'intermediate'
                                  ? 'e.g., 95% or 950 / 1000'
                                  : level === 'schooling'
                                  ? 'e.g., 10 / 10 CGPA or 92%'
                                  : 'e.g., 8.5 / 10 or 3.8 / 4.0'
                              }
                              className='w-full sm:w-1/2 px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400'
                            />
                          </div>
                        </div>
                      );
                    })}

                    {/* Quick Add Buttons for Education */}
                    <div className='flex items-center flex-wrap gap-2 pt-2'>
                      <button
                        type='button'
                        onClick={() => {
                          const newEdu = {
                            id: `edu_${Date.now()}`,
                            level: 'degree' as EducationLevel,
                            institution: '',
                            degree: '',
                            fieldOfStudy: '',
                            endYear: '',
                          };
                          onUpdate({
                            ...resumeDoc,
                            education: [...(resumeDoc.education || []), newEdu],
                          });
                        }}
                        className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-[#374151] hover:text-black cursor-pointer shadow-2xs transition-all'
                      >
                        <div className='w-4 h-4 rounded-full bg-black text-white flex items-center justify-center'>
                          <Plus size={10} strokeWidth={2.5} />
                        </div>
                        <span>+ Add Degree</span>
                      </button>

                      <button
                        type='button'
                        onClick={() => {
                          const newEdu = {
                            id: `edu_${Date.now()}`,
                            level: 'intermediate' as EducationLevel,
                            institution: '',
                            degree: 'Intermediate (Class XII)',
                            fieldOfStudy: '',
                            endYear: '',
                          };
                          onUpdate({
                            ...resumeDoc,
                            education: [...(resumeDoc.education || []), newEdu],
                          });
                        }}
                        className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-xs font-bold text-blue-800 cursor-pointer shadow-2xs transition-all'
                      >
                        <div className='w-4 h-4 rounded-full bg-blue-700 text-white flex items-center justify-center'>
                          <Plus size={10} strokeWidth={2.5} />
                        </div>
                        <span>+ Add Intermediate / 12th</span>
                      </button>

                      <button
                        type='button'
                        onClick={() => {
                          const newEdu = {
                            id: `edu_${Date.now()}`,
                            level: 'schooling' as EducationLevel,
                            institution: '',
                            degree: 'Secondary School (Class X)',
                            fieldOfStudy: '',
                            endYear: '',
                          };
                          onUpdate({
                            ...resumeDoc,
                            education: [...(resumeDoc.education || []), newEdu],
                          });
                        }}
                        className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-xs font-bold text-emerald-800 cursor-pointer shadow-2xs transition-all'
                      >
                        <div className='w-4 h-4 rounded-full bg-emerald-700 text-white flex items-center justify-center'>
                          <Plus size={10} strokeWidth={2.5} />
                        </div>
                        <span>+ Add Schooling / 10th</span>
                      </button>

                      <button
                        type='button'
                        onClick={() => {
                          const newEdu = {
                            id: `edu_${Date.now()}`,
                            level: 'diploma' as EducationLevel,
                            institution: '',
                            degree: '',
                            fieldOfStudy: '',
                            endYear: '',
                          };
                          onUpdate({
                            ...resumeDoc,
                            education: [...(resumeDoc.education || []), newEdu],
                          });
                        }}
                        className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer shadow-2xs transition-all'
                      >
                        <Plus size={12} strokeWidth={2} />
                        <span>Add Diploma / Other</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* STEP 6: CERTIFICATES & EVENTS                                 */}
              {/* ───────────────────────────────────────────────────────────── */}
              {currentStep === 6 && (
                <div className='space-y-6 animate-in fade-in-50 duration-200'>
                  <div>
                    <h3 className='text-xl font-bold text-[#374151]'>
                      Certificates & Events
                    </h3>
                    <p className='text-xs sm:text-sm text-[#374151] mt-0.5'>
                      Highlight your verified certifications, hackathons, competitions, and key industry milestones.
                    </p>
                  </div>

                  {/* Section A: Certifications */}
                  <div className='space-y-4'>
                    <h4 className='text-base font-bold text-[#223498] border-b border-slate-200 pb-1.5'>
                      Certifications
                    </h4>
                    {resumeDoc.certifications?.map((cert, cIdx) => (
                      <div
                        key={cert.id || cIdx}
                        className='p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3'
                      >
                        <div className='flex items-center justify-between'>
                          <span className='text-xs font-bold text-slate-600'>
                            Certificate #{cIdx + 1}
                          </span>
                          <button
                            type='button'
                            onClick={() => {
                              const next = (resumeDoc.certifications || []).filter((_, i) => i !== cIdx);
                              onUpdate({ ...resumeDoc, certifications: next });
                            }}
                            className='text-slate-400 hover:text-rose-600 p-1 cursor-pointer'
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                          <div>
                            <label className='block text-xs font-semibold text-[#374151] mb-1'>
                              Certificate Name
                            </label>
                            <input
                              type='text'
                              value={cert.title || cert.name || ''}
                              onChange={(e) => {
                                const next = [...resumeDoc.certifications];
                                next[cIdx] = {
                                  ...next[cIdx],
                                  title: e.target.value,
                                  name: e.target.value,
                                };
                                onUpdate({ ...resumeDoc, certifications: next });
                              }}
                              placeholder='e.g., AWS Certified Cloud Practitioner'
                              className='w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                            />
                          </div>
                          <div>
                            <label className='block text-xs font-semibold text-[#374151] mb-1'>
                              Issue Date (Optional)
                            </label>
                            <input
                              type='text'
                              value={cert.issueDate || ''}
                              onChange={(e) => {
                                const next = [...resumeDoc.certifications];
                                next[cIdx] = { ...next[cIdx], issueDate: e.target.value };
                                onUpdate({ ...resumeDoc, certifications: next });
                              }}
                              placeholder='e.g., Oct 2025'
                              className='w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                            />
                          </div>
                        </div>

                        <div>
                          <label className='block text-xs font-semibold text-[#374151] mb-1'>
                            Issuing Organization
                          </label>
                          <input
                            type='text'
                            value={cert.issuer || ''}
                            onChange={(e) => {
                              const next = [...resumeDoc.certifications];
                              next[cIdx] = { ...next[cIdx], issuer: e.target.value };
                              onUpdate({ ...resumeDoc, certifications: next });
                            }}
                            placeholder='e.g., Amazon Web Services'
                            className='w-full sm:w-1/2 px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      type='button'
                      onClick={() => {
                        const newCert = {
                          id: `cert_${Date.now()}`,
                          title: '',
                          issuer: '',
                          issueDate: '',
                          verificationStatus: 'SELF_REPORTED' as const,
                        };
                        onUpdate({
                          ...resumeDoc,
                          certifications: [...(resumeDoc.certifications || []), newCert],
                        });
                      }}
                      className='inline-flex items-center gap-1.5 text-xs font-bold text-[#374151] hover:text-black cursor-pointer'
                    >
                      <div className='w-5 h-5 rounded-full bg-black text-white flex items-center justify-center'>
                        <Plus size={12} strokeWidth={2.5} />
                      </div>
                      <span>Add Certificate</span>
                    </button>
                  </div>

                  {/* Section C: Hackathons & Events */}
                  <div className='space-y-4 pt-2'>
                    <h4 className='text-base font-bold text-[#223498] border-b border-slate-200 pb-1.5'>
                      Hackathons & Events
                    </h4>
                    {resumeDoc.events?.map((ev, evIdx) => (
                      <div
                        key={ev.id || evIdx}
                        className='p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3'
                      >
                        <div className='flex items-center justify-between'>
                          <span className='text-xs font-bold text-slate-600'>
                            Event #{evIdx + 1}
                          </span>
                          <button
                            type='button'
                            onClick={() => {
                              const next = (resumeDoc.events || []).filter((_, i) => i !== evIdx);
                              onUpdate({ ...resumeDoc, events: next });
                            }}
                            className='text-slate-400 hover:text-rose-600 p-1 cursor-pointer'
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                          <div>
                            <label className='block text-xs font-semibold text-[#374151] mb-1'>
                              Event / Competition Name
                            </label>
                            <input
                              type='text'
                              value={ev.title}
                              onChange={(e) => {
                                const next = [...(resumeDoc.events || [])];
                                next[evIdx] = { ...next[evIdx], title: e.target.value };
                                onUpdate({ ...resumeDoc, events: next });
                              }}
                              placeholder='e.g., Smart India Hackathon'
                              className='w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                            />
                          </div>
                          <div>
                            <label className='block text-xs font-semibold text-[#374151] mb-1'>
                              Organizer / Host (Optional)
                            </label>
                            <input
                              type='text'
                              value={ev.organizer || ''}
                              onChange={(e) => {
                                const next = [...(resumeDoc.events || [])];
                                next[evIdx] = { ...next[evIdx], organizer: e.target.value };
                                onUpdate({ ...resumeDoc, events: next });
                              }}
                              placeholder='e.g., Ministry of Education'
                              className='w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                            />
                          </div>
                        </div>

                        <div>
                          <div className='flex items-center justify-between mb-1'>
                            <label className='text-xs font-semibold text-[#374151]'>
                              Brief About The Event
                            </label>
                            <button
                              type='button'
                              onClick={() => {
                                const next = [...(resumeDoc.events || [])];
                                next[evIdx] = {
                                  ...next[evIdx],
                                  learnings: SAMPLE_COPY.eventDesc,
                                };
                                onUpdate({ ...resumeDoc, events: next });
                              }}
                              className='text-[10px] font-semibold text-[#344499] underline hover:text-[#223498] cursor-pointer'
                            >
                              Sample Event Description
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={ev.learnings || ''}
                            onChange={(e) => {
                              const next = [...(resumeDoc.events || [])];
                              next[evIdx] = { ...next[evIdx], learnings: e.target.value };
                              onUpdate({ ...resumeDoc, events: next });
                            }}
                            placeholder='Key takeaways, rank achieved, or hackathon project overview...'
                            className='w-full p-2.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800 resize-none'
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      type='button'
                      onClick={() => {
                        const newEv = {
                          id: `ev_${Date.now()}`,
                          title: '',
                          organizer: '',
                          learnings: '',
                        };
                        onUpdate({
                          ...resumeDoc,
                          events: [...(resumeDoc.events || []), newEv],
                        });
                      }}
                      className='inline-flex items-center gap-1.5 text-xs font-bold text-[#374151] hover:text-black cursor-pointer'
                    >
                      <div className='w-5 h-5 rounded-full bg-black text-white flex items-center justify-center'>
                        <Plus size={12} strokeWidth={2.5} />
                      </div>
                      <span>Add Event / Competition</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* STEP 7: SKILLS & EXPERTISE                                    */}
              {/* ───────────────────────────────────────────────────────────── */}
              {currentStep === 7 && (
                <div className='space-y-6 animate-in fade-in-50 duration-200'>
                  <div>
                    <h3 className='text-xl font-bold text-[#374151]'>
                      Skills & Expertise
                    </h3>
                    <p className='text-xs sm:text-sm text-[#374151] mt-0.5'>
                      Highlight your technical proficiencies, collaboration abilities, and familiarity with industry tools.
                    </p>
                  </div>

                  {/* Technical Skills */}
                  <div>
                    <label className='block text-xs font-semibold text-[#374151] mb-1.5'>
                      Technical Skills
                    </label>
                    <input
                      type='text'
                      value={(resumeDoc.skills?.languages || []).join(', ')}
                      onChange={(e) => {
                        const arr = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        onUpdate({
                          ...resumeDoc,
                          skills: {
                            ...resumeDoc.skills,
                            languages: arr,
                          },
                        });
                      }}
                      placeholder='e.g., Python, JavaScript, React'
                      className='w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                    />
                  </div>

                  {/* Communication & Collaboration Skills */}
                  <div>
                    <label className='block text-xs font-semibold text-[#374151] mb-1.5'>
                      Communication & Collaboration Skills
                    </label>
                    <input
                      type='text'
                      value={(resumeDoc.skills?.frameworks || []).join(', ')}
                      onChange={(e) => {
                        const arr = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        onUpdate({
                          ...resumeDoc,
                          skills: {
                            ...resumeDoc.skills,
                            frameworks: arr,
                          },
                        });
                      }}
                      placeholder='e.g., Cross-functional Team Leadership, Agile/Scrum, Technical Writing, Public Speaking'
                      className='w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                    />
                  </div>

                  {/* Tools & Technologies */}
                  <div>
                    <label className='block text-xs font-semibold text-[#374151] mb-1.5'>
                      Tools & Technologies
                    </label>
                    <input
                      type='text'
                      value={[
                        ...(resumeDoc.skills?.databases || []),
                        ...(resumeDoc.skills?.tools || []),
                      ].join(', ')}
                      onChange={(e) => {
                        const arr = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        onUpdate({
                          ...resumeDoc,
                          skills: {
                            ...resumeDoc.skills,
                            databases: arr.slice(0, 3),
                            tools: arr.slice(3),
                          },
                        });
                      }}
                      placeholder='e.g., Figma, Git, Docker, AWS, Postman, VS Code'
                      className='w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className='flex items-center justify-end gap-3 pt-8 border-t border-slate-100 mt-6'>
              {(currentStep === 4 || currentStep === 6) && (
                <button
                  type='button'
                  onClick={() => setCurrentStep(currentStep + 1)}
                  className='px-3.5 py-2 rounded-lg bg-[#F6F6F6] text-black/70 hover:bg-slate-200 text-xs font-semibold transition-colors cursor-pointer'
                >
                  Skip
                </button>
              )}

              {currentStep < 7 ? (
                <button
                  type='button'
                  onClick={handleNext}
                  className='px-5 py-2 rounded-lg bg-[#040000] hover:bg-black/85 text-white text-xs font-bold transition-all shadow-xs cursor-pointer'
                >
                  Save & Next
                </button>
              ) : (
                <button
                  type='button'
                  onClick={onGoToPreview}
                  className='px-6 py-2 rounded-lg bg-[#040000] hover:bg-black/85 text-white text-xs font-bold transition-all shadow-xs cursor-pointer'
                >
                  Preview
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Live Real-time A4 Resume Preview (5 cols or scaled) */}
          <div className='lg:col-span-6 bg-slate-200/80 rounded-xl p-4 sm:p-6 flex flex-col items-center justify-start min-h-[700px] overflow-hidden relative shadow-inner'>
            <div className='w-full max-w-[500px] origin-top transform scale-[0.68] sm:scale-[0.80] xl:scale-[0.92] transition-transform duration-300'>
              <div className='bg-white rounded-lg shadow-xl overflow-hidden border border-slate-200'>
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
      </div>

      {/* Course Capstone Projects Picker Modal */}
      <CourseCapstonesModal
        isOpen={showCapstoneModal}
        onClose={() => setShowCapstoneModal(false)}
        onSelectCapstone={handleSelectCapstone}
        existingProjects={resumeDoc.projects || []}
        studentHeadline={resumeDoc.personalInfo?.headline}
        targetRole={resumeDoc.targetRole}
        category={resumeDoc.category}
      />
    </div>
  );
};
