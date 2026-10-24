export type VerificationStatus =
  | 'LMS_VERIFIED'
  | 'CREDENTIAL_LINK_PROVIDED'
  | 'SELF_REPORTED';

export interface ResumeLink {
  label: string;
  url: string;
}

export interface ResumeProject {
  id: string;
  title: string;
  description: string;
  techStack: string[];
  repositoryUrl?: string;
  liveDemoUrl?: string;
  bullets: string[];
  verificationStatus: VerificationStatus;
  lmsProjectId?: string;
}

export interface ResumeExperience {
  id: string;
  role: string;
  organization: string;
  company?: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  bullets: string[];
}

export interface ResumeEducation {
  id: string;
  institution: string;
  degree: string;
  score?: number | string;
  gradingSystem?: 'CGPA_10' | 'GPA_4' | 'PERCENTAGE';
  startYear?: number | string;
  endYear?: number | string;
}

export interface ResumeCertification {
  id: string;
  title: string;
  name?: string;
  issuer: string;
  issueDate?: string;
  credentialUrl?: string;
  verificationStatus: VerificationStatus;
}

export interface ResumeSkills {
  languages: string[];
  frameworks: string[];
  databases: string[];
  tools: string[];
}

export interface ResumePersonalInfo {
  fullName: string;
  headline: string;
  email: string;
  phone?: string;
  location: string;
  links: ResumeLink[];
  avatarUrl?: string;
}

export type TemplateCourseTrack =
  | 'Full-Stack & Web Dev'
  | 'Data Science & AI'
  | 'Excel & Business Intelligence'
  | 'Executive & Management'
  | 'Design & Creative'
  | 'Campus Fresher & Internships';

export interface ResumeTemplateMeta {
  id: string;
  name: string;
  flowcvName: string;
  headline: string;
  recommendedFor: TemplateCourseTrack;
  description: string;
  layoutType: 'single-column' | 'two-column-sidebar' | 'compact-single' | 'photo-centric' | 'editorial';
  fontFamily: 'sans' | 'serif' | 'mono';
  accentColor: string;
  badgeText: string;
  popular?: boolean;
}

export interface ResumeDocument {
  schemaVersion: number;
  templateId?: string;
  sectionOrder?: SectionKey[];
  personalInfo: ResumePersonalInfo;
  summary: string;
  skills: ResumeSkills;
  projects: ResumeProject[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
}

export interface ResumeRecord {
  id: string;
  title: string;
  schema_version: number;
  version: number;
  document: ResumeDocument;
  updated_at: string;
}

export interface ResumeMatchResult {
  matchPercentage: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  readabilityTips: string[];
  actionableSuggestions: string[];
  suggestedSummary?: string;
}

export interface RewriteProposal {
  originalText: string;
  proposedText: string;
  rationale: string;
}

// Backward-compatibility aliases for legacy templates
export type PersonalInfo = ResumePersonalInfo;
export type Project = ResumeProject;
export type WorkExperience = ResumeExperience;
export type Education = ResumeEducation;
export type ResumeData = ResumeDocument;
export type ATSResult = ResumeMatchResult;

export type SectionKey =
  | 'summary'
  | 'skills'
  | 'projects'
  | 'education'
  | 'experience'
  | 'certifications';

export interface Section {
  id: SectionKey;
  label: string;
  icon: React.ElementType;
}
