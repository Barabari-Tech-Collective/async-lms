import React, { useState, useRef, useEffect, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  Camera,
  GraduationCap,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Lightbulb,
  X,
  Loader2,
} from 'lucide-react';
import apiClient from '@/services/api';
import type {
  ResumeDocument as ResumeDocType,
  Section,
  EducationLevel,
  ResumeProject,
} from './types';
import { ResumeDocument } from './ResumeDocument';
import { compressAvatarImage, calcLocalMatchAnalysis, validateUrl } from './resumeUtils';
import { CommaSeparatedInput } from './ResumeCommon';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import CalendarPicker from '@/components/ui/CalendarPicker';

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

interface PolishDiffModalState {
  isOpen: boolean;
  section: string;
  originalText: string;
  proposedText: string;
  rationale?: string;
  onApply: (text: string) => void;
}

interface ExampleModalState {
  isOpen: boolean;
  type: 'project' | 'experience' | 'summary' | 'event';
}

const GUIDE_CONTENT: Record<
  'project' | 'experience' | 'summary' | 'event',
  { title: string; subtitle: string; formula: string; example: string; tip: string }
> = {
  project: {
    title: 'Writing a High-Impact Project Description',
    subtitle: 'Recruiters scan for technologies used, architectural depth, and tangible outcomes.',
    formula: 'Action Verb + Architecture / Stack + Problem Solved + Measurable Result (% or speed)',
    example:
      'Developed a full-stack e-commerce application using React, Node.js, and MongoDB featuring real-time inventory management, user authentication (JWT), and integrated Stripe payment processing. Improved page load speed by 35% through query optimization and component lazy loading.',
    tip: 'Avoid passive phrases like "I worked on". Use active verbs like "Architected", "Engineered", "Optimized", or "Automated".',
  },
  experience: {
    title: 'Writing a Work Experience / Internship Description',
    subtitle: 'Demonstrate real business and engineering ownership from your contributions.',
    formula: 'Action Verb + Core Responsibility + Tooling / Cloud + Quantifiable Outcome',
    example:
      'Built scalable backend microservices using Python (FastAPI) and Docker. Managed AWS cloud infrastructure (S3, EC2) and automated CI/CD deployment pipelines, resulting in a 40% reduction in deployment errors.',
    tip: 'Highlight metrics such as reduction in errors, percentage faster deployments, or volume of requests handled.',
  },
  summary: {
    title: 'Writing a Placement Professional Summary',
    subtitle: 'A concise 3-4 sentence hook summarizing your technical strengths and career direction.',
    formula: 'Target Role Title + Core Competencies / Languages + Academic / Project Proof + Value Proposition',
    example:
      'Motivated software engineering graduate with a strong foundation in full-stack web development, data structures, and clean code principles. Experienced in building responsive web applications using JavaScript/TypeScript, Python, and modern backend frameworks. Passionate about solving complex technical problems and eager to contribute to high-impact engineering teams.',
    tip: 'Keep it between 40-70 words. Recruiters read this first to gauge whether you match the open position.',
  },
  event: {
    title: 'Describing an Event, Workshop, or Hackathon',
    subtitle: 'Showcase curiosity, team collaboration, and proactive technical development.',
    formula: 'Event Role / Focus Area + Specific Technical Takeaways + Rank / Deliverable',
    example:
      'Attended expert-led sessions on modern cloud infrastructure, serverless architectures, and CI/CD pipelines. Gained industry insights into scalable microservices and deployment best practices.',
    tip: 'State what technical capability you acquired or what milestone or prize was achieved.',
  },
};

function localPolishFallback(text: string, _context?: string): { proposedText: string; rationale: string } {
  let polished = text.trim();
  polished = polished.charAt(0).toUpperCase() + polished.slice(1);
  if (!/[.!?]$/.test(polished)) polished += '.';

  polished = polished
    .replace(/^(i worked on|worked on|helped with|helped to build|did|made)\s+/i, 'Architected and developed ')
    .replace(/^(i built|built|created)\s+/i, 'Designed and built ')
    .replace(/^(i managed|managed|handled)\s+/i, 'Administered and coordinated ')
    .replace(/^(i tested|tested)\s+/i, 'Validated and tested ');

  return {
    proposedText: polished,
    rationale:
      'Refined sentence structure, applied strong technical action verbs, and standardized grammar for resume placement standards.',
  };
}


interface MonthYearSelectProps {
  label: string;
  value: string;
  onChange: (val: string, isPresent?: boolean) => void;
  allowPresent?: boolean;
  isCurrentRole?: boolean;
  onToggleCurrentRole?: (isCurrent: boolean) => void;
  placeholder?: string;
}

const MonthYearSelect: React.FC<MonthYearSelectProps> = ({
  label,
  value,
  onChange,
  allowPresent = false,
  isCurrentRole = false,
  onToggleCurrentRole,
  placeholder,
}) => {
  return (
    <CalendarPicker
      label={label}
      value={value}
      onChange={onChange}
      allowPresent={allowPresent}
      isCurrentRole={isCurrentRole}
      onToggleCurrentRole={onToggleCurrentRole}
      mode='month-year'
      placeholder={placeholder}
    />
  );
};

export const ResumeStepperEditor: React.FC<ResumeStepperEditorProps> = ({
  resumeDoc,
  onUpdate,
  currentStep,
  setCurrentStep,
  onBackToDashboard,
  onGoToPreview,
  sections,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const livePreviewDocRef = useRef<HTMLDivElement>(null);
  const previewScrollAreaRef = useRef<HTMLDivElement>(null);
  const [docHeight, setDocHeight] = useState<number>(0);
  const [scrollAreaWidth, setScrollAreaWidth] = useState<number>(500);

  const CANONICAL_A4_WIDTH = 800;
  const A4_HEIGHT_PX = 1130;

  useEffect(() => {
    const el = livePreviewDocRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDocHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [resumeDoc]);

  useEffect(() => {
    const scrollEl = previewScrollAreaRef.current;
    if (!scrollEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setScrollAreaWidth(entry.contentRect.width);
      }
    });
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, []);

  const isMultiPage = docHeight > A4_HEIGHT_PX;
  const previewPageCount = Math.max(1, Math.ceil(docHeight / A4_HEIGHT_PX));
  const [isPolishing, setIsPolishing] = useState<boolean>(false);
  const [polishDiff, setPolishDiff] = useState<PolishDiffModalState | null>(null);
  const [exampleModal, setExampleModal] = useState<ExampleModalState | null>(null);

  const handleTriggerPolish = async (
    currentText: string | undefined | null,
    sectionType: 'bullet' | 'summary',
    contextLabel: string,
    onApply: (polishedText: string) => void
  ) => {
    const draft = (currentText || '').trim();
    if (draft.length < 15) {
      toast.error('Please write a draft of your work first (at least 15 characters). AI will then polish your real accomplishments!');
      return;
    }

    setIsPolishing(true);
    const toastId = toast.loading('Polishing your draft with CodeGuru AI...');
    try {
      const res = await apiClient.post('/assistant/resume/rewrite', {
        section: sectionType,
        originalText: draft,
        context: contextLabel,
      });

      toast.dismiss(toastId);

      if (res.data?.success && res.data?.data?.proposedText) {
        setPolishDiff({
          isOpen: true,
          section: sectionType,
          originalText: draft,
          proposedText: res.data.data.proposedText,
          rationale: res.data.data.rationale || 'Refined with strong action verbs and professional placement impact.',
          onApply,
        });
      } else {
        const fb = localPolishFallback(draft, contextLabel);
        setPolishDiff({
          isOpen: true,
          section: sectionType,
          originalText: draft,
          proposedText: fb.proposedText,
          rationale: fb.rationale,
          onApply,
        });
      }
    } catch {
      toast.dismiss(toastId);
      const fb = localPolishFallback(draft, contextLabel);
      setPolishDiff({
        isOpen: true,
        section: sectionType,
        originalText: draft,
        proposedText: fb.proposedText,
        rationale: fb.rationale,
        onApply,
      });
    } finally {
      setIsPolishing(false);
    }
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

  const [showLivePreview, setShowLivePreview] = useState<boolean>(true);
  const [showAtsScoreDropdown, setShowAtsScoreDropdown] = useState<boolean>(false);
  const atsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (atsDropdownRef.current && !atsDropdownRef.current.contains(event.target as Node)) {
        setShowAtsScoreDropdown(false);
      }
    }
    if (showAtsScoreDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAtsScoreDropdown]);

  const atsAnalysis = calcLocalMatchAnalysis(resumeDoc);

  const isStepComplete = (step: number) => {
    switch (step) {
      case 1: {
        const pi = resumeDoc.personalInfo;
        const hasName = Boolean(pi?.fullName?.trim());
        const hasRole = Boolean(pi?.headline?.trim());
        const hasLoc = Boolean(pi?.location?.trim());
        const hasEmail = Boolean(pi?.email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pi.email.trim()));
        const hasPhone = Boolean(pi?.phone?.trim() && pi.phone.replace(/\D/g, '').length >= 7);
        if (!hasName || !hasRole || !hasLoc || !hasEmail || !hasPhone) return false;

        const linkList = [
          getLinkUrl('LinkedIn'),
          getLinkUrl('GitHub'),
          getLinkUrl('Portfolio'),
          getLinkUrl('LeetCode'),
          ...(pi?.links || []).map((l) => l.url),
        ].filter(Boolean);

        if (linkList.length === 0) return false;
        return linkList.every((url) => validateUrl(url).isValid);
      }
      case 2:
        return Boolean((resumeDoc.summary || '').trim().length >= 30);
      case 3: {
        const projects = resumeDoc.projects || [];
        if (projects.length === 0) return false;
        return projects.every(
          (p) =>
            Boolean(p.title?.trim()) &&
            Boolean((p.description || p.bullets?.[0] || '').trim().length >= 20)
        );
      }
      case 4: {
        const expList = resumeDoc.experience || [];
        if (expList.length === 0) return true; // Optional for freshers
        return expList.every(
          (e) =>
            Boolean(e.role?.trim()) &&
            Boolean(e.company?.trim() || e.organization?.trim()) &&
            Boolean(e.startDate?.trim()) &&
            Boolean(e.current || e.endDate?.trim()) &&
            Boolean((e.bullets?.[0] || '').trim().length >= 15)
        );
      }
      case 5: {
        const eduList = resumeDoc.education || [];
        if (eduList.length < 2) return false;
        return eduList.every(
          (edu) =>
            Boolean(edu.degree?.trim()) &&
            Boolean(edu.institution?.trim()) &&
            Boolean(String(edu.endYear ?? '').trim() || String(edu.startYear ?? '').trim()) &&
            Boolean(String(edu.score ?? '').trim())
        );
      }
      case 6: {
        const certs = resumeDoc.certifications || [];
        const evs = resumeDoc.events || [];
        const certsValid = certs.every(
          (c) =>
            Boolean((c.title || c.name || '').trim()) &&
            Boolean(c.issuer?.trim()) &&
            Boolean(c.issueDate?.trim())
        );
        const evsValid = evs.every(
          (ev) =>
            Boolean(ev.title?.trim()) &&
            Boolean(ev.organizer?.trim())
        );
        return certsValid && evsValid;
      }
      case 7: {
        const hasTech = (resumeDoc.skills?.languages || []).length > 0;
        const hasSoft = (resumeDoc.skills?.frameworks || []).length > 0;
        const hasTools =
          (resumeDoc.skills?.databases || []).length > 0 ||
          (resumeDoc.skills?.tools || []).length > 0;
        return [hasTech, hasSoft, hasTools].filter(Boolean).length >= 2;
      }
      default:
        return false;
    }
  };

  // Comprehensive Validation Guard across all 7 Stepper Steps
  const validateCurrentStep = (): boolean => {
    // ── STEP 1: YOUR DETAILS ──────────────────────────────────────────────────
    if (currentStep === 1) {
      const pi = resumeDoc.personalInfo;
      if (!pi?.fullName?.trim()) {
        toast.error('Please enter your full name.');
        return false;
      }
      if (!pi?.headline?.trim()) {
        toast.error('Please enter your job title / target role.');
        return false;
      }
      if (!pi?.location?.trim()) {
        toast.error('Please enter your location (city/country).');
        return false;
      }
      if (!pi?.email?.trim()) {
        toast.error('Please enter your email address.');
        return false;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(pi.email.trim())) {
        toast.error('Please enter a valid email address (e.g. name@example.com).');
        return false;
      }
      if (!pi?.phone?.trim() || pi.phone.replace(/\D/g, '').length < 7) {
        toast.error('Please enter a valid phone number (at least 7 digits).');
        return false;
      }

      // At least ONE valid professional link is required
      const linkCandidates = [
        { label: 'LinkedIn', url: getLinkUrl('LinkedIn') },
        { label: 'GitHub', url: getLinkUrl('GitHub') },
        { label: 'Portfolio', url: getLinkUrl('Portfolio') },
        { label: 'LeetCode', url: getLinkUrl('LeetCode') },
        ...(pi.links || []),
      ];

      const filledLinks = linkCandidates.filter((l) => Boolean(l.url && l.url.trim()));
      if (filledLinks.length === 0) {
        toast.error(
          'Please add at least one professional link (LinkedIn, GitHub, Portfolio, or LeetCode) so recruiters can verify your profile.'
        );
        return false;
      }

      for (const link of filledLinks) {
        const val = validateUrl(link.url, link.label);
        if (!val.isValid) {
          toast.error(val.error || `Please enter a valid URL for ${link.label}`);
          return false;
        }
      }
    }

    // ── STEP 2: SHORT BIO / SUMMARY ───────────────────────────────────────────
    if (currentStep === 2) {
      const bio = (resumeDoc.summary || '').trim();
      if (bio.length < 30) {
        toast.error('Please write a professional summary (at least 30 characters). Recruiters scan this first.');
        return false;
      }
    }

    // ── STEP 3: PROJECTS ──────────────────────────────────────────────────────
    if (currentStep === 3) {
      const projects = resumeDoc.projects || [];
      if (projects.length === 0) {
        toast.error('Please add at least one project showcasing your work.');
        return false;
      }

      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        if (!p.title?.trim()) {
          toast.error(`Project #${i + 1}: Please enter a project title.`);
          return false;
        }
        const desc = (p.description || p.bullets?.[0] || '').trim();
        if (desc.length < 20) {
          toast.error(
            `Project #${i + 1} (${p.title || 'Untitled'}): Please add a project description (at least 20 characters).`
          );
          return false;
        }
        if (p.repositoryUrl) {
          const repoVal = validateUrl(p.repositoryUrl, 'Repository');
          if (!repoVal.isValid) {
            toast.error(`Project #${i + 1} Repository: ${repoVal.error}`);
            return false;
          }
        }
        if (p.liveDemoUrl) {
          const demoVal = validateUrl(p.liveDemoUrl, 'LiveDemo');
          if (!demoVal.isValid) {
            toast.error(`Project #${i + 1} Live Link: ${demoVal.error}`);
            return false;
          }
        }
      }
    }

    // ── STEP 4: PROFESSIONAL EXPERIENCE (OPTIONAL SECTION) ────────────────────
    if (currentStep === 4) {
      const expList = resumeDoc.experience || [];
      // 0 experiences is allowed for freshers!
      if (expList.length > 0) {
        for (let i = 0; i < expList.length; i++) {
          const exp = expList[i];
          if (!exp.role?.trim()) {
            toast.error(`Role #${i + 1}: Please enter the role / job title.`);
            return false;
          }
          if (!exp.company?.trim() && !exp.organization?.trim()) {
            toast.error(`Role #${i + 1}: Please enter the company or organization name.`);
            return false;
          }
          if (!exp.startDate?.trim()) {
            toast.error(`Role #${i + 1}: Please select a start date.`);
            return false;
          }
          const isCurrent = exp.current || exp.endDate?.trim().toLowerCase() === 'present';
          if (!isCurrent && !exp.endDate?.trim()) {
            toast.error(`Role #${i + 1}: Please select an end date or check 'I currently work here'.`);
            return false;
          }
          const roleDesc = (exp.bullets?.[0] || '').trim();
          if (roleDesc.length < 15) {
            toast.error(`Role #${i + 1}: Please write a role description (at least 15 characters).`);
            return false;
          }
        }
      }
    }

    // ── STEP 5: EDUCATION (AT LEAST 2 ENTRIES MANDATORY) ──────────────────────
    if (currentStep === 5) {
      const eduList = resumeDoc.education || [];
      if (eduList.length < 2) {
        toast.error(
          'Please add at least two education entries (e.g. Degree and 12th/Intermediate or 10th/Schooling) to showcase your complete academic journey.'
        );
        return false;
      }

      for (let i = 0; i < eduList.length; i++) {
        const edu = eduList[i];
        if (!edu.degree?.trim()) {
          toast.error(`Education #${i + 1}: Please enter the Degree / Course / School name.`);
          return false;
        }
        if (!edu.institution?.trim()) {
          toast.error(`Education #${i + 1}: Please enter the College / University / School name.`);
          return false;
        }
        const hasYear = Boolean(String(edu.endYear ?? '').trim() || String(edu.startYear ?? '').trim());
        if (!hasYear) {
          toast.error(`Education #${i + 1}: Please enter the graduation year or duration.`);
          return false;
        }
        const hasScore = Boolean(String(edu.score ?? '').trim());
        if (!hasScore) {
          toast.error(`Education #${i + 1}: Please enter your Grade, CGPA, or Percentage.`);
          return false;
        }
      }
    }

    // ── STEP 6: CERTIFICATES & EVENTS (OPTIONAL SECTION) ──────────────────────
    if (currentStep === 6) {
      const certs = resumeDoc.certifications || [];
      for (let i = 0; i < certs.length; i++) {
        const c = certs[i];
        const certName = (c.title || c.name || '').trim();
        if (!certName) {
          toast.error(`Certificate #${i + 1}: Please enter the certificate name.`);
          return false;
        }
        if (!c.issuer?.trim()) {
          toast.error(`Certificate #${i + 1}: Please enter the issuing organization.`);
          return false;
        }
        if (!c.issueDate?.trim()) {
          toast.error(`Certificate #${i + 1}: Please enter the issue year.`);
          return false;
        }
        if (c.credentialUrl) {
          const certVal = validateUrl(c.credentialUrl, 'Certificate');
          if (!certVal.isValid) {
            toast.error(`Certificate #${i + 1} Link: ${certVal.error}`);
            return false;
          }
        }
      }

      const evs = resumeDoc.events || [];
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i];
        if (!ev.title?.trim()) {
          toast.error(`Event #${i + 1}: Please enter the event title.`);
          return false;
        }
        if (!ev.organizer?.trim()) {
          toast.error(`Event #${i + 1}: Please enter the organizer / host name.`);
          return false;
        }
        if (ev.credentialUrl) {
          const evVal = validateUrl(ev.credentialUrl, 'Certificate');
          if (!evVal.isValid) {
            toast.error(`Event #${i + 1} Link: ${evVal.error}`);
            return false;
          }
        }
      }
    }

    // ── STEP 7: SKILLS & EXPERTISE (AT LEAST 2 CATEGORIES MANDATORY) ──────────
    if (currentStep === 7) {
      const hasTech = (resumeDoc.skills?.languages || []).length > 0;
      const hasSoft = (resumeDoc.skills?.frameworks || []).length > 0;
      const hasTools =
        (resumeDoc.skills?.databases || []).length > 0 ||
        (resumeDoc.skills?.tools || []).length > 0;

      const filledCount = [hasTech, hasSoft, hasTools].filter(Boolean).length;
      if (filledCount < 2) {
        toast.error(
          'Please fill at least 2 skill categories (e.g. Technical Skills and Tools & Technologies) to complete your resume.'
        );
        return false;
      }
    }

    return true;
  };

  // Navigation handlers
  const handleNext = () => {
    if (!validateCurrentStep()) return;
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
    <div className='min-h-screen bg-[#F8FAFC] text-slate-800 pb-16 font-sans antialiased'>
      <div className='max-w-[1360px] mx-auto pt-4 px-4 sm:px-6'>
        {/* Top Header & Stepper */}
        <div className='mb-6'>
          {/* Top Row: Back button, Title & ATS Score Badge */}
          <div className='flex items-center justify-between gap-3 mb-4'>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={handleBack}
                className='p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-700 transition-colors cursor-pointer border border-slate-200/60 bg-white shadow-2xs'
                title='Go back to Dashboard'
              >
                <ArrowLeft size={18} strokeWidth={2.5} />
              </button>
              <div>
                <h1 className='text-lg sm:text-xl font-bold text-slate-900 tracking-tight'>
                  {resumeDoc.personalInfo?.fullName || 'Targeted Resume'} — Step {currentStep} of 7
                </h1>
                <p className='text-xs text-slate-500'>
                  {STEP_LABELS[currentStep - 1]}: Fill in your details to create an ATS-optimized placement resume.
                </p>
              </div>
            </div>

            {/* Right: Live Preview Toggle & Interactive ATS Score Pill */}
            <div className='flex items-center gap-2.5 shrink-0'>
              <button
                type='button'
                onClick={() => setShowLivePreview((prev) => !prev)}
                className='hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer'
                title={showLivePreview ? 'Collapse preview to focus on writing' : 'Show live preview'}
              >
                {showLivePreview ? (
                  <EyeOff size={13.5} className='text-slate-500' />
                ) : (
                  <Eye size={13.5} className='text-indigo-600' />
                )}
                <span>{showLivePreview ? 'Focus Form' : 'Split Preview'}</span>
              </button>

              {/* Ambient ATS Score Pill with Popover */}
              <div ref={atsDropdownRef} className='relative'>
                <button
                  type='button'
                  onClick={() => setShowAtsScoreDropdown((prev) => !prev)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border shadow-2xs cursor-pointer select-none',
                    atsAnalysis.matchPercentage >= 75
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/80'
                      : atsAnalysis.matchPercentage >= 50
                      ? 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100/80'
                      : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100/80'
                  )}
                  title='Click to view ATS Readiness Checklist'
                >
                  <Sparkles size={13} className='text-current shrink-0' />
                  <span>{atsAnalysis.matchPercentage}% ATS Score</span>
                  <ChevronDown
                    size={12}
                    className={cn('transition-transform shrink-0', showAtsScoreDropdown && 'rotate-180')}
                  />
                </button>

                {showAtsScoreDropdown && (
                  <div className='absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-40 animate-in fade-in zoom-in-95 duration-100 text-xs'>
                    <div className='flex items-center justify-between pb-2 mb-2 border-b border-slate-100'>
                      <span className='font-bold text-slate-900'>ATS Placement Readiness</span>
                      <span className='font-black text-indigo-700'>{atsAnalysis.matchPercentage}%</span>
                    </div>

                    <div className='space-y-1.5 mb-3'>
                      {STEP_LABELS.map((lbl, i) => {
                        const complete = isStepComplete(i + 1);
                        return (
                          <div key={lbl} className='flex items-center justify-between text-slate-700'>
                            <span className={cn(complete ? 'text-slate-800' : 'text-slate-500')}>
                              {i + 1}. {lbl}
                            </span>
                            {complete ? (
                              <span className='inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700'>
                                <CheckCircle2 size={12} className='text-emerald-600' />
                                <span>Complete</span>
                              </span>
                            ) : (
                              <span className='inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium'>
                                <AlertCircle size={12} className='text-amber-500' />
                                <span>Pending</span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {atsAnalysis.readabilityTips.length > 0 && (
                      <div className='bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 text-[11px] text-slate-600 leading-relaxed'>
                        <span className='font-bold text-slate-800 block mb-0.5'>💡 Recommendation:</span>
                        {atsAnalysis.readabilityTips[0]}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stepper Card */}
          <div className='bg-white shadow-2xs border border-slate-200/80 rounded-xl px-4 py-3 flex items-center justify-between sm:justify-center overflow-x-auto gap-2 sm:gap-4'>
            {STEP_LABELS.map((label, idx) => {
              const stepNum = idx + 1;
              const isActive = stepNum === currentStep;
              const isDone = isStepComplete(stepNum);

              return (
                <React.Fragment key={label}>
                  <div
                    onClick={() => { if (stepNum > currentStep && !validateCurrentStep()) return; setCurrentStep(stepNum); }}
                    className='flex items-center gap-2 shrink-0 cursor-pointer select-none group'
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-2xs',
                        isActive
                          ? 'bg-[#1e2653] text-white ring-4 ring-[#1e2653]/15'
                          : isDone
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 border border-slate-200 group-hover:bg-slate-200'
                      )}
                    >
                      {isDone && !isActive ? <Check size={13} strokeWidth={3} /> : stepNum}
                    </div>
                    <span
                      className={cn(
                        'text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors',
                        isActive
                          ? 'text-[#1e2653] font-bold'
                          : isDone
                          ? 'text-slate-800'
                          : 'text-slate-500 group-hover:text-slate-700'
                      )}
                    >
                      {label}
                    </span>
                  </div>

                  {idx < STEP_LABELS.length - 1 && (
                    <div
                      className={cn(
                        'hidden md:block w-8 sm:w-10 h-[2px] shrink-0 transition-colors',
                        isStepComplete(stepNum) ? 'bg-emerald-500' : 'bg-slate-200'
                      )}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* 2-Column Split Screen Layout */}
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'>
          {/* Left Column: Form Controls */}
          <div
            className={cn(
              'bg-white rounded-xl shadow-xs border border-slate-200/80 p-6 sm:p-8 min-h-[600px] flex flex-col justify-between transition-all',
              showLivePreview ? 'lg:col-span-6 xl:col-span-6' : 'lg:col-span-12 max-w-4xl mx-auto w-full'
            )}
          >
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
                    <div className='flex items-center justify-between mb-3'>
                      <h4 className='text-sm font-bold text-[#374151]'>
                        Professional Links
                      </h4>
                      <span className='text-[11px] text-slate-500 font-medium'>
                        Include valid URLs without spaces
                      </span>
                    </div>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                      {/* LinkedIn */}
                      <div>
                        {(() => {
                          const val = validateUrl(getLinkUrl('LinkedIn'), 'LinkedIn');
                          return (
                            <>
                              <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                LinkedIn
                              </label>
                              <input
                                type='text'
                                value={getLinkUrl('LinkedIn')}
                                onChange={(e) => updateLinkUrl('LinkedIn', e.target.value)}
                                placeholder='https://linkedin.com/in/john'
                                className={cn(
                                  'w-full px-3.5 py-2 text-xs rounded-xl focus:outline-hidden focus:ring-2 text-slate-800 transition-colors',
                                  !val.isValid
                                    ? 'bg-rose-50/40 border border-rose-400 focus:ring-rose-500/20'
                                    : 'bg-[#FFFAF3]/40 border border-[#344499]/20 focus:ring-[#1F285B]'
                                )}
                              />
                              {!val.isValid && (
                                <p className='mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1'>
                                  <AlertCircle size={12} className='shrink-0' />
                                  <span>{val.error}</span>
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* GitHub Profile */}
                      <div>
                        {(() => {
                          const val = validateUrl(getLinkUrl('GitHub'), 'GitHub');
                          return (
                            <>
                              <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                GitHub Profile Link
                              </label>
                              <input
                                type='text'
                                value={getLinkUrl('GitHub')}
                                onChange={(e) => updateLinkUrl('GitHub', e.target.value)}
                                placeholder='https://github.com/john'
                                className={cn(
                                  'w-full px-3.5 py-2 text-xs rounded-xl focus:outline-hidden focus:ring-2 text-slate-800 transition-colors',
                                  !val.isValid
                                    ? 'bg-rose-50/40 border border-rose-400 focus:ring-rose-500/20'
                                    : 'bg-[#FFFAF3]/40 border border-[#344499]/20 focus:ring-[#1F285B]'
                                )}
                              />
                              {!val.isValid && (
                                <p className='mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1'>
                                  <AlertCircle size={12} className='shrink-0' />
                                  <span>{val.error}</span>
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Portfolio */}
                      <div>
                        {(() => {
                          const val = validateUrl(getLinkUrl('Portfolio'), 'Portfolio');
                          return (
                            <>
                              <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                Portfolio
                              </label>
                              <input
                                type='text'
                                value={getLinkUrl('Portfolio')}
                                onChange={(e) => updateLinkUrl('Portfolio', e.target.value)}
                                placeholder='https://john.dev'
                                className={cn(
                                  'w-full px-3.5 py-2 text-xs rounded-xl focus:outline-hidden focus:ring-2 text-slate-800 transition-colors',
                                  !val.isValid
                                    ? 'bg-rose-50/40 border border-rose-400 focus:ring-rose-500/20'
                                    : 'bg-[#FFFAF3]/40 border border-[#344499]/20 focus:ring-[#1F285B]'
                                )}
                              />
                              {!val.isValid && (
                                <p className='mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1'>
                                  <AlertCircle size={12} className='shrink-0' />
                                  <span>{val.error}</span>
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* LeetCode */}
                      <div>
                        {(() => {
                          const val = validateUrl(getLinkUrl('LeetCode'), 'LeetCode');
                          return (
                            <>
                              <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                LeetCode / Coding Profile
                              </label>
                              <input
                                type='text'
                                value={getLinkUrl('LeetCode')}
                                onChange={(e) => updateLinkUrl('LeetCode', e.target.value)}
                                placeholder='https://leetcode.com/u/john'
                                className={cn(
                                  'w-full px-3.5 py-2 text-xs rounded-xl focus:outline-hidden focus:ring-2 text-slate-800 transition-colors',
                                  !val.isValid
                                    ? 'bg-rose-50/40 border border-rose-400 focus:ring-rose-500/20'
                                    : 'bg-[#FFFAF3]/40 border border-[#344499]/20 focus:ring-[#1F285B]'
                                )}
                              />
                              {!val.isValid && (
                                <p className='mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1'>
                                  <AlertCircle size={12} className='shrink-0' />
                                  <span>{val.error}</span>
                                </p>
                              )}
                            </>
                          );
                        })()}
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
                    <div className='flex items-center justify-between mb-1.5 flex-wrap gap-2'>
                      <label className='block text-xs font-semibold text-[#374151]'>
                        Short Bio / Executive Summary
                      </label>
                      <div className='flex items-center gap-2'>
                        <button
                          type='button'
                          onClick={() => setExampleModal({ isOpen: true, type: 'summary' })}
                          className='inline-flex items-center gap-1 text-[11px] font-semibold text-[#344499] hover:underline cursor-pointer'
                        >
                          <Lightbulb size={12} className='text-amber-500' />
                          <span>View Example & Guide</span>
                        </button>
                        <button
                          type='button'
                          disabled={isPolishing}
                          onClick={() =>
                            handleTriggerPolish(
                              resumeDoc.summary,
                              'summary',
                              'Target Role: ' + (resumeDoc.personalInfo?.headline || resumeDoc.targetRole || 'Software Engineer'),
                              (p) => onUpdate({ ...resumeDoc, summary: p })
                            )
                          }
                          className='inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer disabled:opacity-60'
                        >
                          {isPolishing ? <Loader2 size={12} className='animate-spin' /> : <Sparkles size={12} />}
                          <span>Polish with AI</span>
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={5}
                      value={resumeDoc.summary || ''}
                      onChange={(e) =>
                        onUpdate({ ...resumeDoc, summary: e.target.value })
                      }
                      placeholder='Write a concise summary of your background, technical interests, and career goals...'
                      className='w-full p-3.5 text-xs sm:text-sm bg-[#DEE8FB]/40 border border-slate-200 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-[#1F285B] text-slate-800 resize-none leading-relaxed'
                    />
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
                      Showcase your best technical projects, application features, and engineering accomplishments.
                    </p>
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
                            {(() => {
                              const demoVal = validateUrl(project.liveDemoUrl, 'LiveDemo');
                              return (
                                <>
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
                                    className={cn(
                                      'w-full px-3 py-2 text-xs bg-white rounded-lg text-slate-800 focus:outline-none transition-colors',
                                      !demoVal.isValid
                                        ? 'border border-rose-400 bg-rose-50/40 focus:ring-1 focus:ring-rose-400'
                                        : 'border border-[#344499]/20 focus:ring-1 focus:ring-slate-400'
                                    )}
                                  />
                                  {!demoVal.isValid && (
                                    <p className='mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1'>
                                      <AlertCircle size={12} className='shrink-0' />
                                      <span>{demoVal.error}</span>
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        <div>
                          {(() => {
                            const repoVal = validateUrl(project.repositoryUrl, 'Repository');
                            return (
                              <>
                                <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                  Add Github / Repository Link
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
                                  className={cn(
                                    'w-full px-3 py-2 text-xs bg-white rounded-lg text-slate-800 focus:outline-none transition-colors',
                                    !repoVal.isValid
                                      ? 'border border-rose-400 bg-rose-50/40 focus:ring-1 focus:ring-rose-400'
                                      : 'border border-[#344499]/20 focus:ring-1 focus:ring-slate-400'
                                  )}
                                />
                                {!repoVal.isValid && (
                                  <p className='mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1'>
                                    <AlertCircle size={12} className='shrink-0' />
                                    <span>{repoVal.error}</span>
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        <div>
                          <div className='flex items-center justify-between mb-1.5 flex-wrap gap-2'>
                            <label className='text-xs font-semibold text-[#374151]'>
                              Add Project Description
                            </label>
                            <div className='flex items-center gap-2'>
                              <button
                                type='button'
                                onClick={() => setExampleModal({ isOpen: true, type: 'project' })}
                                className='inline-flex items-center gap-1 text-[11px] font-semibold text-[#344499] hover:underline cursor-pointer'
                              >
                                <Lightbulb size={12} className='text-amber-500' />
                                <span>View Example</span>
                              </button>
                              <button
                                type='button'
                                disabled={isPolishing}
                                onClick={() =>
                                  handleTriggerPolish(
                                    project.description || project.bullets?.[0],
                                    'bullet',
                                    'Project: ' + (project.title || 'Technical Project'),
                                    (p) => {
                                      const next = [...resumeDoc.projects];
                                      next[pIdx] = {
                                        ...next[pIdx],
                                        description: p,
                                        bullets: [p],
                                      };
                                      onUpdate({ ...resumeDoc, projects: next });
                                    }
                                  )
                                }
                                className='inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer disabled:opacity-60'
                              >
                                {isPolishing ? <Loader2 size={12} className='animate-spin' /> : <Sparkles size={12} />}
                                <span>Polish with AI</span>
                              </button>
                            </div>
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

                    {/* Action Button: Add Project */}
                    <div className='pt-1'>
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
                        className='inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-[#374151] hover:text-black cursor-pointer shadow-2xs transition-all'
                      >
                        <div className='w-4 h-4 rounded-full bg-black text-white flex items-center justify-center'>
                          <Plus size={10} strokeWidth={2.5} />
                        </div>
                        <span>Add Another Project</span>
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
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5'>
                          <MonthYearSelect
                            label='Start Date'
                            value={exp.startDate || ''}
                            onChange={(val) => {
                              const next = [...resumeDoc.experience];
                              next[eIdx] = { ...next[eIdx], startDate: val };
                              onUpdate({ ...resumeDoc, experience: next });
                            }}
                            placeholder='e.g., May 2021'
                          />
                          <MonthYearSelect
                            label='End Date'
                            value={exp.current ? 'Present' : exp.endDate || ''}
                            isCurrentRole={Boolean(exp.current)}
                            onToggleCurrentRole={(isCurrent) => {
                              const next = [...resumeDoc.experience];
                              next[eIdx] = {
                                ...next[eIdx],
                                current: isCurrent,
                                endDate: isCurrent ? 'Present' : (next[eIdx].endDate === 'Present' ? '' : next[eIdx].endDate),
                              };
                              onUpdate({ ...resumeDoc, experience: next });
                            }}
                            onChange={(val, isPres) => {
                              const next = [...resumeDoc.experience];
                              next[eIdx] = {
                                ...next[eIdx],
                                endDate: val,
                                current: isPres || val.toLowerCase().trim() === 'present',
                              };
                              onUpdate({ ...resumeDoc, experience: next });
                            }}
                            allowPresent={true}
                            placeholder='e.g., Aug 2024'
                          />
                        </div>

                        <div>
                          <div className='flex items-center justify-between mb-1.5 flex-wrap gap-2'>
                            <label className='text-xs font-semibold text-[#374151]'>
                              Add Role Description
                            </label>
                            <div className='flex items-center gap-2'>
                              <button
                                type='button'
                                onClick={() => setExampleModal({ isOpen: true, type: 'experience' })}
                                className='inline-flex items-center gap-1 text-[11px] font-semibold text-[#344499] hover:underline cursor-pointer'
                              >
                                <Lightbulb size={12} className='text-amber-500' />
                                <span>View Example</span>
                              </button>
                              <button
                                type='button'
                                disabled={isPolishing}
                                onClick={() =>
                                  handleTriggerPolish(
                                    exp.bullets?.[0],
                                    'bullet',
                                    'Role: ' + (exp.role || '') + ' at ' + (exp.company || ''),
                                    (p) => {
                                      const next = [...resumeDoc.experience];
                                      next[eIdx] = {
                                        ...next[eIdx],
                                        bullets: [p],
                                      };
                                      onUpdate({ ...resumeDoc, experience: next });
                                    }
                                  )
                                }
                                className='inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer disabled:opacity-60'
                              >
                                {isPolishing ? <Loader2 size={12} className='animate-spin' /> : <Sparkles size={12} />}
                                <span>Polish with AI</span>
                              </button>
                            </div>
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

                    {/* Add Education Button */}
                    <div className='pt-2'>
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
                        className='inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-[#374151] hover:text-black cursor-pointer shadow-2xs transition-all'
                      >
                        <div className='w-4 h-4 rounded-full bg-black text-white flex items-center justify-center'>
                          <Plus size={10} strokeWidth={2.5} />
                        </div>
                        <span>+ Add Degree / Education</span>
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

                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
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
                              placeholder='e.g., Amazon Web Services, Deloitte, Coursera'
                              className='w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl text-slate-800'
                            />
                          </div>

                          <div>
                            {(() => {
                              const certVal = validateUrl(cert.credentialUrl, 'Certificate');
                              return (
                                <>
                                  <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                    Certificate Link / Drive URL (Optional)
                                  </label>
                                  <input
                                    type='url'
                                    value={cert.credentialUrl || ''}
                                    onChange={(e) => {
                                      const next = [...resumeDoc.certifications];
                                      next[cIdx] = { ...next[cIdx], credentialUrl: e.target.value };
                                      onUpdate({ ...resumeDoc, certifications: next });
                                    }}
                                    placeholder='e.g., Google Drive link, Credly, or PDF document URL'
                                    className={cn(
                                      'w-full px-3 py-1.5 text-xs bg-white rounded-xl text-slate-800 transition-colors',
                                      !certVal.isValid
                                        ? 'border border-rose-400 bg-rose-50/40 focus:ring-1 focus:ring-rose-400'
                                        : 'border border-[#D1D5DB]'
                                    )}
                                  />
                                  {!certVal.isValid && (
                                    <p className='mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1'>
                                      <AlertCircle size={12} className='shrink-0' />
                                      <span>{certVal.error}</span>
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
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
                          {(() => {
                            const evVal = validateUrl(ev.credentialUrl, 'Certificate');
                            return (
                              <>
                                <label className='block text-xs font-semibold text-[#374151] mb-1'>
                                  Event Certificate / Proof Link (Optional)
                                </label>
                                <input
                                  type='url'
                                  value={ev.credentialUrl || ''}
                                  onChange={(e) => {
                                    const next = [...(resumeDoc.events || [])];
                                    next[evIdx] = { ...next[evIdx], credentialUrl: e.target.value };
                                    onUpdate({ ...resumeDoc, events: next });
                                  }}
                                  placeholder='e.g., Google Drive link or event credential URL'
                                  className={cn(
                                    'w-full px-3 py-1.5 text-xs bg-white rounded-xl text-slate-800 transition-colors',
                                    !evVal.isValid
                                      ? 'border border-rose-400 bg-rose-50/40 focus:ring-1 focus:ring-rose-400'
                                      : 'border border-[#D1D5DB]'
                                  )}
                                />
                                {!evVal.isValid && (
                                  <p className='mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1'>
                                    <AlertCircle size={12} className='shrink-0' />
                                    <span>{evVal.error}</span>
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        <div>
                          <div className='flex items-center justify-between mb-1.5 flex-wrap gap-2'>
                            <label className='text-xs font-semibold text-[#374151]'>
                              Brief About The Event
                            </label>
                            <div className='flex items-center gap-2'>
                              <button
                                type='button'
                                onClick={() => setExampleModal({ isOpen: true, type: 'event' })}
                                className='inline-flex items-center gap-1 text-[11px] font-semibold text-[#344499] hover:underline cursor-pointer'
                              >
                                <Lightbulb size={12} className='text-amber-500' />
                                <span>View Example</span>
                              </button>
                              <button
                                type='button'
                                disabled={isPolishing}
                                onClick={() =>
                                  handleTriggerPolish(
                                    ev.learnings,
                                    'bullet',
                                    'Event: ' + (ev.title || ''),
                                    (p) => {
                                      const next = [...(resumeDoc.events || [])];
                                      next[evIdx] = { ...next[evIdx], learnings: p };
                                      onUpdate({ ...resumeDoc, events: next });
                                    }
                                  )
                                }
                                className='inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer disabled:opacity-60'
                              >
                                {isPolishing ? <Loader2 size={12} className='animate-spin' /> : <Sparkles size={12} />}
                                <span>Polish with AI</span>
                              </button>
                            </div>
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
                    <CommaSeparatedInput
                      value={resumeDoc.skills?.languages || []}
                      onChange={(arr) => {
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
                    <CommaSeparatedInput
                      value={resumeDoc.skills?.frameworks || []}
                      onChange={(arr) => {
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
                    <CommaSeparatedInput
                      value={[
                        ...(resumeDoc.skills?.databases || []),
                        ...(resumeDoc.skills?.tools || []),
                      ]}
                      onChange={(arr) => {
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

            {/* Bottom Actions Bar with Universal Back Button */}
            <div className='flex items-center justify-between gap-3 pt-8 border-t border-slate-100 mt-6'>
              <button
                type='button'
                onClick={handleBack}
                className='inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer'
              >
                <ArrowLeft size={14} />
                <span>{currentStep === 1 ? 'Back to Dashboard' : 'Back'}</span>
              </button>

              <div className='flex items-center gap-2.5'>
                {(currentStep === 4 || currentStep === 6) && (
                  <button
                    type='button'
                    onClick={() => setCurrentStep(currentStep + 1)}
                    className='px-3.5 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition-colors cursor-pointer'
                  >
                    Skip
                  </button>
                )}

                {currentStep < 7 ? (
                  <button
                    type='button'
                    onClick={handleNext}
                    className='px-5 py-2 rounded-lg bg-[#1e2653] hover:bg-[#252d5e] text-white text-xs font-bold transition-all shadow-xs cursor-pointer'
                  >
                    Save & Next
                  </button>
                ) : (
                  <button
                    type='button'
                    onClick={onGoToPreview}
                    className='px-6 py-2 rounded-lg bg-[#1e2653] hover:bg-[#252d5e] text-white text-xs font-bold transition-all shadow-xs cursor-pointer'
                  >
                    Preview Document
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Live Real-time A4 Resume Preview */}
          {showLivePreview && (
            <div className='lg:col-span-6 sticky top-4 max-h-[calc(100vh-60px)] bg-slate-100 rounded-2xl p-3.5 sm:p-4 flex flex-col items-center justify-start border border-slate-200/80 shadow-xs'>
              {/* Preview Zoom Toolbar & A4 Page Fit Indicator */}
              <div className='w-full max-w-[500px] flex items-center justify-between mb-3 text-xs flex-wrap gap-2'>
                <div className='flex items-center gap-2'>
                  <div className='flex items-center gap-1.5 font-bold text-slate-700'>
                    <Eye size={14} className='text-indigo-600' />
                    <span>Real-time A4 Preview</span>
                  </div>
                  {isMultiPage ? (
                    <span
                      className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs'
                      title='Content exceeds 1 A4 page. Campus placement resumes are ideally 1 single page.'
                    >
                      <AlertCircle size={11} className='text-amber-600 shrink-0' />
                      <span>{previewPageCount} Pages (Overflows)</span>
                    </span>
                  ) : (
                    <span
                      className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs'
                      title='Perfect! Fits within 1 single A4 sheet.'
                    >
                      <CheckCircle2 size={11} className='text-emerald-600 shrink-0' />
                      <span>1 Page (Fits A4)</span>
                    </span>
                  )}
                </div>
                <button
                  type='button'
                  onClick={onGoToPreview}
                  className='inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-[#1e2653] text-[11px] font-bold rounded-lg transition-all shadow-2xs hover:shadow-xs cursor-pointer'
                  title='Open Full Page Preview'
                >
                  <Maximize2 size={12} className='text-indigo-600' />
                  <span>Full Page Preview</span>
                </button>
              </div>

              {/* Overflow warning banner right below toolbar */}
              {isMultiPage && (
                <div className='w-full mb-2.5 p-2.5 rounded-xl bg-amber-50/95 border border-amber-300 text-[11px] text-amber-950 flex items-start gap-2 shadow-2xs shrink-0 animate-in fade-in duration-150'>
                  <AlertCircle size={14} className='text-amber-600 shrink-0 mt-0.5' />
                  <div className='leading-snug'>
                    <strong>Placement Notice:</strong> Resume overflows onto <strong>Page 2</strong> ({previewPageCount} pages). Scroll down in this preview pane to see where Page 1 ends and Page 2 begins.
                  </div>
                </div>
              )}

              {/* Scrollable Document Canvas with Auto-Fit Canonical A4 Scaling */}
              <div
                ref={previewScrollAreaRef}
                className='w-full flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center rounded-xl p-1 custom-scrollbar'
              >
                {(() => {
                  const appliedScale = Math.min(1, Math.max(0.4, (scrollAreaWidth - 24) / CANONICAL_A4_WIDTH));

                  return (
                    <div
                      style={{
                        width: `${CANONICAL_A4_WIDTH}px`,
                        transform: `scale(${appliedScale})`,
                        transformOrigin: 'top center',
                        marginBottom:
                          docHeight > 0 && appliedScale < 1
                            ? `-${Math.round(docHeight * (1 - appliedScale))}px`
                            : undefined,
                      }}
                      className='shrink-0 transition-transform duration-150'
                    >
                      <div
                        ref={livePreviewDocRef}
                        style={{ width: `${CANONICAL_A4_WIDTH}px` }}
                        className='relative bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden'
                      >
                        <ResumeDocument
                          data={resumeDoc}
                          sections={sections}
                          onUpdate={onUpdate}
                          readOnly={true}
                        />

                        {/* Visual Page Break 1 -> Page 2 Indicator */}
                        {isMultiPage && (
                          <div
                            style={{ top: `${A4_HEIGHT_PX}px` }}
                            className='absolute left-0 right-0 z-20 pointer-events-none flex items-center justify-center print:hidden'
                          >
                            <div className='w-full border-t-2 border-dashed border-rose-500 absolute shadow-xs' />
                            <span className='relative bg-rose-600 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-md flex items-center gap-1 select-none uppercase tracking-wide'>
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
                            <div className='w-full border-t-2 border-dashed border-rose-500 absolute shadow-xs' />
                            <span className='relative bg-rose-600 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-md flex items-center gap-1 select-none uppercase tracking-wide'>
                              ✂️ End of Page 2 · Content below starts on Page 3
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Example Guide Modal ────────────────────────────────────────── */}
      {exampleModal?.isOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150'>
          <div className='bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 relative'>
            <div className='flex items-start justify-between gap-3 mb-4'>
              <div className='flex items-center gap-2.5'>
                <div className='w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200/60'>
                  <Lightbulb size={18} />
                </div>
                <div>
                  <h3 className='text-sm sm:text-base font-bold text-slate-900'>
                    {GUIDE_CONTENT[exampleModal.type].title}
                  </h3>
                  <p className='text-xs text-slate-500'>
                    {GUIDE_CONTENT[exampleModal.type].subtitle}
                  </p>
                </div>
              </div>
              <button
                type='button'
                onClick={() => setExampleModal(null)}
                className='text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer'
              >
                <X size={18} />
              </button>
            </div>

            <div className='space-y-3.5 mb-6 text-xs text-slate-700'>
              <div className='bg-indigo-50/60 border border-indigo-100 rounded-xl p-3'>
                <span className='font-bold text-indigo-900 block mb-1'>Recommended Formula:</span>
                <span className='text-indigo-800 font-medium leading-relaxed block'>
                  {GUIDE_CONTENT[exampleModal.type].formula}
                </span>
              </div>

              <div>
                <span className='font-bold text-slate-800 block mb-1.5'>Reference Example:</span>
                <div className='bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800 leading-relaxed font-normal italic'>
                  "{GUIDE_CONTENT[exampleModal.type].example}"
                </div>
              </div>

              <div className='bg-amber-50/50 border border-amber-200/50 rounded-xl p-3 text-[11.5px] text-amber-900 leading-relaxed'>
                <span className='font-bold block mb-0.5'>💡 Recruiter Insight:</span>
                {GUIDE_CONTENT[exampleModal.type].tip}
              </div>

              <p className='text-[11px] text-slate-500'>
                ✍️ <span className='font-semibold'>Note:</span> Write what you built or accomplished in your own words. You can then click <span className='font-semibold text-indigo-700'>✨ Polish with AI</span> to enhance the phrasing without losing your original facts!
              </p>
            </div>

            <div className='flex justify-end'>
              <button
                type='button'
                onClick={() => setExampleModal(null)}
                className='px-4 py-2 bg-[#1e2653] hover:bg-[#252d5e] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs'
              >
                Got it, I'll write my draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Polish Diff Comparison Modal ─────────────────────────────────── */}
      {polishDiff?.isOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150'>
          <div className='bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-slate-200 relative'>
            <div className='flex items-start justify-between gap-3 mb-4'>
              <div className='flex items-center gap-2.5'>
                <div className='w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-200/60'>
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className='text-sm sm:text-base font-bold text-slate-900'>
                    Review AI-Polished Phrasing
                  </h3>
                  <p className='text-xs text-slate-500'>
                    Compare your original draft with the ATS-optimized placement phrasing.
                  </p>
                </div>
              </div>
              <button
                type='button'
                onClick={() => setPolishDiff(null)}
                className='text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer'
              >
                <X size={18} />
              </button>
            </div>

            <div className='space-y-3.5 mb-6 text-xs'>
              {/* Original Draft Card */}
              <div>
                <span className='text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1'>
                  Your Original Draft
                </span>
                <div className='bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 leading-relaxed font-sans'>
                  {polishDiff.originalText}
                </div>
              </div>

              {/* Polished Card */}
              <div>
                <span className='text-[11px] font-bold text-emerald-700 uppercase tracking-wider block mb-1'>
                  ✨ Polished Placement-Ready Version
                </span>
                <div className='bg-emerald-50/40 border border-emerald-200 rounded-xl p-3.5 text-slate-900 font-medium leading-relaxed font-sans shadow-2xs'>
                  {polishDiff.proposedText}
                </div>
              </div>

              {/* Rationale pill */}
              {polishDiff.rationale && (
                <div className='flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5'>
                  <Lightbulb size={13} className='text-amber-500 shrink-0' />
                  <span><strong>AI Improvement:</strong> {polishDiff.rationale}</span>
                </div>
              )}
            </div>

            <div className='flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100'>
              <button
                type='button'
                onClick={() => setPolishDiff(null)}
                className='px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer'
              >
                Keep My Original
              </button>
              <button
                type='button'
                onClick={() => {
                  polishDiff.onApply(polishDiff.proposedText);
                  setPolishDiff(null);
                  toast.success('✨ Applied polished description!');
                }}
                className='px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5'
              >
                <Check size={14} strokeWidth={2.5} />
                <span>Apply Polished Version</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
