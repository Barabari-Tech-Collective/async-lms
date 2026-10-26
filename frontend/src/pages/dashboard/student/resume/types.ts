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
  employmentType?: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  bullets: string[];
}

export type EducationLevel = 'degree' | 'intermediate' | 'schooling' | 'diploma' | 'post_graduation';

export interface ResumeEducation {
  id: string;
  institution: string;
  degree: string;
  score?: number | string;
  gradingSystem?: 'CGPA_10' | 'GPA_4' | 'PERCENTAGE';
  startYear?: number | string;
  endYear?: number | string;
  level?: EducationLevel;
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

export interface ResumeEvent {
  id: string;
  title: string;
  eventType?: string;
  organizer?: string;
  date?: string;
  location?: string;
  learnings: string;
  credentialUrl?: string;
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

export type ResumeCategory =
  | 'general'
  | 'tech'
  | 'data'
  | 'design'
  | 'sales_marketing'
  | 'product_operations'
  | 'business_finance';

export interface CategoryConfig {
  id: ResumeCategory;
  name: string;
  shortName: string;
  badge: string;
  description: string;
  defaultTitle: string;
  defaultRole: string;
  popularRoles: string[];
  recommendedTemplate: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  linkSuggestions: { label: string; placeholder: string }[];
  skillLabels: {
    languages: string;
    frameworks: string;
    databases: string;
    tools: string;
  };
  skillPlaceholders: {
    languages: string;
    frameworks: string;
    databases: string;
    tools: string;
  };
  projectLabels: {
    sectionTitle: string;
    itemTitle: string;
    itemTitlePlaceholder: string;
    toolsLabel: string;
    toolsPlaceholder: string;
    url1Label: string;
    url1Placeholder: string;
    url2Label: string;
    url2Placeholder: string;
    bulletPlaceholder: string;
  };
}

export const CATEGORY_CONFIGS: Record<ResumeCategory, CategoryConfig> = {
  general: {
    id: 'general',
    name: 'General & All-Rounder',
    shortName: 'General',
    badge: 'Simple & Streamlined',
    description: 'Perfect for campus freshers, customer success, admin, multi-disciplinary, and entry-level positions. Fast and clean setup.',
    defaultTitle: 'General Career Resume',
    defaultRole: 'All-Rounder Candidate | Campus Fresher',
    popularRoles: [
      'Campus Fresher / Graduate Trainee',
      'Operations Associate',
      'Customer Support Specialist',
      'Administrative Executive',
      'General Management Trainee',
    ],
    recommendedTemplate: 'first-job-fresh',
    accentColor: '#475569',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    linkSuggestions: [
      { label: 'LinkedIn', placeholder: 'https://linkedin.com/in/your-profile' },
      { label: 'Portfolio / Drive', placeholder: 'https://drive.google.com/... or personal site' },
    ],
    skillLabels: {
      languages: 'Core Strengths & Abilities',
      frameworks: 'Communication & Interpersonal',
      databases: 'Office & Productivity Tools',
      tools: 'Key Professional Competencies',
    },
    skillPlaceholders: {
      languages: 'Critical Thinking, Rapid Learning, Time Management, Team Collaboration',
      frameworks: 'Client Communication, Presentation, Conflict Resolution, Active Listening',
      databases: 'MS Excel, Google Workspace, PowerPoint, Notion',
      tools: 'Project Organization, Reporting, Research, Documentation',
    },
    projectLabels: {
      sectionTitle: 'Key Projects & Extracurricular Activities',
      itemTitle: 'Activity / Project Name',
      itemTitlePlaceholder: 'e.g. Annual College TechFest Organizing Committee',
      toolsLabel: 'Competencies / Tools Used',
      toolsPlaceholder: 'Team Leadership, Event Budgeting, MS Excel',
      url1Label: 'Documentation / Link URL',
      url1Placeholder: 'https://...',
      url2Label: 'Live Website / Presentation',
      url2Placeholder: 'https://...',
      bulletPlaceholder: 'Coordinated cross-functional tasks across 15+ student volunteers to deliver on time.',
    },
  },
  tech: {
    id: 'tech',
    name: 'Engineering & Tech',
    shortName: 'Tech',
    badge: 'Code, Scalability & Architecture',
    description: 'Designed for Full-Stack, Backend, Frontend, Cloud/DevOps, AI/ML, and Mobile Software Engineers.',
    defaultTitle: 'Software Engineering Resume',
    defaultRole: 'Software Engineer | Full-Stack Developer',
    popularRoles: [
      'Full-Stack Developer',
      'Backend Engineer',
      'Frontend Engineer',
      'AI & Machine Learning Engineer',
      'Cloud & DevOps Engineer',
      'Mobile App Developer (Flutter/React Native)',
    ],
    recommendedTemplate: 'modern-mercury',
    accentColor: '#333d7c',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    linkSuggestions: [
      { label: 'GitHub', placeholder: 'https://github.com/your-username' },
      { label: 'LinkedIn', placeholder: 'https://linkedin.com/in/your-profile' },
      { label: 'Portfolio / Live Apps', placeholder: 'https://yourname.dev' },
      { label: 'LeetCode', placeholder: 'https://leetcode.com/u/your-username' },
    ],
    skillLabels: {
      languages: 'Programming Languages',
      frameworks: 'Frameworks & Libraries',
      databases: 'Databases & Storage',
      tools: 'Developer Tools & Cloud',
    },
    skillPlaceholders: {
      languages: 'JavaScript, TypeScript, Python, Java, C++, Go',
      frameworks: 'React, Node.js, Express, Next.js, FastAPI, TailwindCSS',
      databases: 'PostgreSQL, MongoDB, Redis, MySQL',
      tools: 'Docker, Git, GitHub Actions, AWS, Postman, Linux',
    },
    projectLabels: {
      sectionTitle: 'Technical Projects & Verified Capstones',
      itemTitle: 'Project Name',
      itemTitlePlaceholder: 'e.g. E-Commerce Microservices Engine',
      toolsLabel: 'Tech Stack (comma-separated)',
      toolsPlaceholder: 'React, Node.js, PostgreSQL, Docker',
      url1Label: 'GitHub Repository URL',
      url1Placeholder: 'https://github.com/user/project',
      url2Label: 'Live Demo URL',
      url2Placeholder: 'https://project-demo.com',
      bulletPlaceholder: 'Engineered high-throughput REST APIs handling 5,000+ requests/min with sub-100ms latency.',
    },
  },
  data: {
    id: 'data',
    name: 'Data Science & Analytics',
    shortName: 'Data',
    badge: 'SQL, Dashboards & Business Insights',
    description: 'Ideal for Data Analysts, Business Analysts, BI Developers, Quantitative Researchers, and Data Engineers.',
    defaultTitle: 'Data Analytics Resume',
    defaultRole: 'Data Analyst | Business Intelligence',
    popularRoles: [
      'Data Analyst',
      'Business Intelligence (BI) Analyst',
      'Data Engineer',
      'Data Scientist',
      'Quantitative Analyst',
    ],
    recommendedTemplate: 'atlantic-sidebar',
    accentColor: '#0284c7',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-800',
    linkSuggestions: [
      { label: 'LinkedIn', placeholder: 'https://linkedin.com/in/your-profile' },
      { label: 'Tableau / Power BI Public', placeholder: 'https://public.tableau.com/app/profile/...' },
      { label: 'GitHub / Kaggle', placeholder: 'https://kaggle.com/your-username' },
      { label: 'Portfolio', placeholder: 'https://yourdataworks.com' },
    ],
    skillLabels: {
      languages: 'Query & Scripting Languages',
      frameworks: 'BI & Data Visualization Tools',
      databases: 'Data Warehousing & Databases',
      tools: 'Analytics, Modeling & Statistics',
    },
    skillPlaceholders: {
      languages: 'SQL (PostgreSQL/MySQL), Python (Pandas/NumPy), R, DAX',
      frameworks: 'Power BI, Tableau, Looker Studio, Metabase',
      databases: 'Snowflake, Google BigQuery, PostgreSQL, AWS Redshift',
      tools: 'Advanced Excel, Jupyter Notebooks, Git, ETL Pipelines, Scikit-learn',
    },
    projectLabels: {
      sectionTitle: 'Analytics Projects & Data Case Studies',
      itemTitle: 'Analysis / Project Title',
      itemTitlePlaceholder: 'e.g. Customer Churn Prediction & Retention Dashboard',
      toolsLabel: 'Analytics Stack Used',
      toolsPlaceholder: 'SQL, Python, Power BI, Snowflake',
      url1Label: 'Dashboard URL / Tableau Public',
      url1Placeholder: 'https://public.tableau.com/app/profile/...',
      url2Label: 'GitHub / Notebook Repository',
      url2Placeholder: 'https://github.com/user/data-analysis',
      bulletPlaceholder: 'Extracted and analyzed 250,000+ transaction records using SQL window functions, identifying $40K in revenue leakages.',
    },
  },
  design: {
    id: 'design',
    name: 'Product Design & Creative',
    shortName: 'Design',
    badge: 'Figma, UX Research & Systems',
    description: 'Tailored for UI/UX Designers, Product Designers, Graphic Artists, and Interaction Designers.',
    defaultTitle: 'Product Design Portfolio Resume',
    defaultRole: 'UI/UX Designer | Product Designer',
    popularRoles: [
      'UI/UX Designer',
      'Product Designer',
      'UX Researcher',
      'Design Systems Specialist',
      'Graphic / Visual Designer',
    ],
    recommendedTemplate: 'creative-cobalt',
    accentColor: '#9333ea',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-800',
    linkSuggestions: [
      { label: 'Portfolio', placeholder: 'https://yourname.design or notion site' },
      { label: 'Figma Community', placeholder: 'https://figma.com/@your-profile' },
      { label: 'Behance', placeholder: 'https://behance.net/your-profile' },
      { label: 'Dribbble / LinkedIn', placeholder: 'https://dribbble.com/your-profile' },
    ],
    skillLabels: {
      languages: 'Design Disciplines & UX Methodologies',
      frameworks: 'Design Systems & Prototyping',
      databases: 'User Research & Usability Testing',
      tools: 'Design Software & Tooling',
    },
    skillPlaceholders: {
      languages: 'User Experience (UX), User Interface (UI), Information Architecture, Wireframing',
      frameworks: 'Interactive Prototyping, Component Systems, Responsive Layouts, Micro-interactions',
      databases: 'User Interviews, Usability Testing, A/B Testing, Persona Mapping, Journey Mapping',
      tools: 'Figma, Adobe XD, Illustrator, Photoshop, Framer, Miro, Zeplin',
    },
    projectLabels: {
      sectionTitle: 'Design Case Studies & Prototypes',
      itemTitle: 'Design Case Study Title',
      itemTitlePlaceholder: 'e.g. Fintech Mobile App Onboarding Redesign',
      toolsLabel: 'Design Tools & Methodologies',
      toolsPlaceholder: 'Figma, User Interviews, Usability Testing, Design System',
      url1Label: 'Figma Prototype URL',
      url1Placeholder: 'https://figma.com/file/... or prototype link',
      url2Label: 'Behance / Case Study Link',
      url2Placeholder: 'https://behance.net/gallery/...',
      bulletPlaceholder: 'Redesigned user onboarding flow through 12 user interviews, reducing drop-off rate by 28% and increasing task completion speed.',
    },
  },
  sales_marketing: {
    id: 'sales_marketing',
    name: 'Sales, Marketing & Growth',
    shortName: 'Sales & Growth',
    badge: 'Revenue, Quota & Campaigns',
    description: 'Built for B2B Sales, Business Development Executives (BDR/SDR), Growth Marketers, and Digital Marketing Specialists.',
    defaultTitle: 'Sales & Marketing Resume',
    defaultRole: 'Business Development Executive | Sales Specialist',
    popularRoles: [
      'Business Development Representative (BDR/SDR)',
      'Account Executive / Inside Sales',
      'Growth & Digital Marketer',
      'Content & Social Media Strategist',
      'Performance Marketing Specialist',
    ],
    recommendedTemplate: 'classic-corporate',
    accentColor: '#ea580c',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-800',
    linkSuggestions: [
      { label: 'LinkedIn', placeholder: 'https://linkedin.com/in/your-profile' },
      { label: 'Campaign / Portfolio Link', placeholder: 'https://yourwork.com or drive portfolio' },
    ],
    skillLabels: {
      languages: 'Core Sales & Deal Competencies',
      frameworks: 'Growth & Inbound Marketing',
      databases: 'CRM Platforms & Outreach Tools',
      tools: 'Analytics & Productivity Suites',
    },
    skillPlaceholders: {
      languages: 'Prospecting, Cold Calling, Pipeline Management, B2B Negotiation, Objection Handling',
      frameworks: 'SEO/SEM, Meta Ads, Google Ads, Email Marketing, Content Strategy',
      databases: 'Salesforce, HubSpot, Zoho CRM, Apollo.io, Outreach',
      tools: 'Google Analytics 4, LinkedIn Sales Navigator, Excel, Canva',
    },
    projectLabels: {
      sectionTitle: 'Sales Campaigns & Key Initiatives',
      itemTitle: 'Campaign / Initiative Name',
      itemTitlePlaceholder: 'e.g. Enterprise SaaS Outbound Acquisition Sprint',
      toolsLabel: 'Channels & Platforms Used',
      toolsPlaceholder: 'LinkedIn Sales Navigator, HubSpot, Cold Email Sequences',
      url1Label: 'Campaign / Pitch Deck URL',
      url1Placeholder: 'https://drive.google.com/...',
      url2Label: 'Case Study Link',
      url2Placeholder: 'https://...',
      bulletPlaceholder: 'Executed targeted outreach campaign to 400+ prospective B2B clients, generating $85K in qualified pipeline and booking 32 demos.',
    },
  },
  product_operations: {
    id: 'product_operations',
    name: 'Product & Operations',
    shortName: 'Product & Ops',
    badge: 'PRDs, Agile & Cross-Functional Alignment',
    description: 'Constructed for Associate Product Managers (APMs), Scrum Masters, Operations Analysts, and Project Coordinators.',
    defaultTitle: 'Product Management Resume',
    defaultRole: 'Associate Product Manager | Operations Analyst',
    popularRoles: [
      'Associate Product Manager (APM)',
      'Operations Analyst',
      'Scrum Master / Agile Coordinator',
      'Project Coordinator',
      'Strategy & Operations Associate',
    ],
    recommendedTemplate: 'executive-serif',
    accentColor: '#059669',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    linkSuggestions: [
      { label: 'LinkedIn', placeholder: 'https://linkedin.com/in/your-profile' },
      { label: 'Notion / Medium PRD Link', placeholder: 'https://notion.so/... or substack' },
      { label: 'Portfolio', placeholder: 'https://yourname.com' },
    ],
    skillLabels: {
      languages: 'Product Management Methodologies',
      frameworks: 'Tracking & Project Management Tools',
      databases: 'Product Analytics & Metrics',
      tools: 'Documentation & Communication Suites',
    },
    skillPlaceholders: {
      languages: 'PRD Writing, User Stories, Agile/Scrum, Sprint Planning, Feature Prioritization (RICE/MoSCoW)',
      frameworks: 'Jira, Linear, Asana, Trello, Confluence',
      databases: 'Mixpanel, Amplitude, Google Analytics, SQL for Product',
      tools: 'Notion, Figma for PMs, Slack, MS Office, Lucidchart',
    },
    projectLabels: {
      sectionTitle: 'Product Initiatives & Teardowns',
      itemTitle: 'Product Initiative / PRD Title',
      itemTitlePlaceholder: 'e.g. Subscription Retention & Feature Upgrade PRD',
      toolsLabel: 'Frameworks & Tools Used',
      toolsPlaceholder: 'Jira, PRD Writing, Mixpanel, User Interviews',
      url1Label: 'PRD / Teardown Document URL',
      url1Placeholder: 'https://notion.so/my-sample-prd',
      url2Label: 'Prototype / Case Study URL',
      url2Placeholder: 'https://...',
      bulletPlaceholder: 'Authored comprehensive PRD for mobile checkout flow; aligned engineering and design teams to reduce cart abandonment by 14%.',
    },
  },
  business_finance: {
    id: 'business_finance',
    name: 'Finance & Corporate',
    shortName: 'Finance & HR',
    badge: 'Valuation, Compliance & ERP',
    description: 'Crafted for Financial Analysts, Accountants, Human Resources, and Business Operations professionals.',
    defaultTitle: 'Financial Analyst Resume',
    defaultRole: 'Financial Analyst | Business Operations',
    popularRoles: [
      'Financial Analyst',
      'Accountant / Audit Associate',
      'Human Resources (HR) Associate',
      'Talent Acquisition Specialist',
      'Corporate Finance Executive',
    ],
    recommendedTemplate: 'classic-corporate',
    accentColor: '#1e293b',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    linkSuggestions: [
      { label: 'LinkedIn', placeholder: 'https://linkedin.com/in/your-profile' },
      { label: 'Portfolio / Presentation', placeholder: 'https://drive.google.com/...' },
    ],
    skillLabels: {
      languages: 'Financial Modeling & Analysis',
      frameworks: 'Accounting & Compliance Standards',
      databases: 'ERP & Accounting Systems',
      tools: 'Corporate Software & Analytics',
    },
    skillPlaceholders: {
      languages: 'DCF Valuation, Financial Statement Analysis, Variance Analysis, Budgeting & Forecasting',
      frameworks: 'GAAP / IFRS, Internal Controls, Audit Preparation, Tax Filing',
      databases: 'SAP, TallyPrime, QuickBooks, Oracle NetSuite',
      tools: 'Advanced Excel (VLOOKUP, INDEX-MATCH, Pivot Tables, Macros), Power BI, PowerPoint',
    },
    projectLabels: {
      sectionTitle: 'Financial Models & Business Projects',
      itemTitle: 'Model / Project Title',
      itemTitlePlaceholder: 'e.g. 3-Statement Financial Model & Valuation',
      toolsLabel: 'Financial Tooling Used',
      toolsPlaceholder: 'Advanced Excel, DCF Modeling, Sensitivity Analysis',
      url1Label: 'Spreadsheet / Model Link',
      url1Placeholder: 'https://drive.google.com/...',
      url2Label: 'Deck / Report Link',
      url2Placeholder: 'https://...',
      bulletPlaceholder: 'Constructed dynamic 5-year discounted cash flow (DCF) model and sensitivity table for SaaS expansion scenarios.',
    },
  },
};

export function getCategoryConfig(category?: ResumeCategory | string | null): CategoryConfig {
  if (category && category in CATEGORY_CONFIGS) {
    return CATEGORY_CONFIGS[category as ResumeCategory];
  }
  return CATEGORY_CONFIGS.general;
}

export interface ResumeDocument {
  schemaVersion: number;
  category?: ResumeCategory;
  targetRole?: string;
  templateId?: string;
  sectionOrder?: SectionKey[];
  personalInfo: ResumePersonalInfo;
  summary: string;
  skills: ResumeSkills;
  projects: ResumeProject[];
  experience: ResumeExperience[];
  events?: ResumeEvent[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
}

export interface ResumeListItem {
  id: string;
  title: string;
  category?: ResumeCategory;
  target_role?: string;
  version: number;
  is_primary: boolean;
  template_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ResumeRecord {
  id: string;
  title: string;
  schema_version: number;
  version: number;
  is_primary?: boolean;
  document: ResumeDocument;
  created_at?: string;
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
  | 'events'
  | 'certifications';

export interface Section {
  id: SectionKey;
  label: string;
  icon: React.ElementType;
}
