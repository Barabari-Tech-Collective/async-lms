import type { ResumeTemplateMeta } from './types';

export const RESUME_TEMPLATES: ResumeTemplateMeta[] = [
  {
    id: 'modern-mercury',
    name: 'Mercury Flow',
    flowcvName: 'Mercury Flow',
    headline: 'Modern Single-Column Tech Layout',
    recommendedFor: 'Full-Stack & Web Dev',
    description:
      'Engineered for Full-Stack & Backend engineers. Features clear categorized skills (Languages, Frameworks, DBs, Tools), verified LMS capstones, and GitHub/Demo badges.',
    layoutType: 'single-column',
    fontFamily: 'sans',
    accentColor: '#333d7c',
    badgeText: 'Most Popular for Tech',
    popular: true,
  },
  {
    id: 'atlantic-sidebar',
    name: 'Atlantic Blue',
    flowcvName: 'Atlantic Blue',
    headline: 'Two-Column Left-Sidebar Layout',
    recommendedFor: 'Data Science & AI',
    description:
      'Distinctive left sidebar with profile photo, contact links, skill competencies matrix, and certifications. Gives data science students ample space for metric-heavy project results.',
    layoutType: 'two-column-sidebar',
    fontFamily: 'sans',
    accentColor: '#1e3a8a',
    badgeText: 'Top for Data & AI',
    popular: true,
  },
  {
    id: 'classic-corporate',
    name: 'Steady Form',
    flowcvName: 'Steady Form',
    headline: 'Structured Business & Analytics Layout',
    recommendedFor: 'Excel & Business Intelligence',
    description:
      'Clean horizontal rule dividers, formal tabular alignment, and strong metrics emphasis. Built specifically for Advanced Excel, MIS, Financial Modeling, and Business Analysts.',
    layoutType: 'single-column',
    fontFamily: 'sans',
    accentColor: '#0f172a',
    badgeText: 'Best for Excel & MIS',
  },
  {
    id: 'executive-serif',
    name: 'Harvard Executive',
    flowcvName: 'Harvard / Executive',
    headline: 'Traditional Academic & Leadership Serif',
    recommendedFor: 'Executive & Management',
    description:
      'Prestigious serif typography (Georgia style), timeless black/charcoal palette, and a centered classic header with bullet separators. Ideal for senior hires, tech leads, and career changers.',
    layoutType: 'single-column',
    fontFamily: 'serif',
    accentColor: '#111827',
    badgeText: 'High-Trust Serif',
  },
  {
    id: 'compact-sans',
    name: 'Compact Flow',
    flowcvName: 'Compact Sans',
    headline: 'High-Density Space-Optimized Layout',
    recommendedFor: 'Full-Stack & Web Dev',
    description:
      'Space-efficient margins, compact line heights, and dual-column skill pill tags. Comfortably fits extensive project bullets and full-stack repositories on 1 clean printable page.',
    layoutType: 'compact-single',
    fontFamily: 'sans',
    accentColor: '#334155',
    badgeText: '1-Page Density',
  },
  {
    id: 'creative-cobalt',
    name: 'Cobalt Edge',
    flowcvName: 'Cobalt Edge',
    headline: 'Vibrant Frontend & Portfolio Showcase',
    recommendedFor: 'Design & Creative',
    description:
      'Vibrant cobalt & indigo accents with modern rounded pill tags for tools/frameworks. Highlights live demo URLs, Figma prototypes, and portfolio links for UI/UX & Frontend devs.',
    layoutType: 'single-column',
    fontFamily: 'sans',
    accentColor: '#2563eb',
    badgeText: 'UI/UX & Frontend',
  },
  {
    id: 'minimal-slate',
    name: 'Clean Slate',
    flowcvName: 'Clean Slate',
    headline: 'Minimalist Airy Layout for Starters',
    recommendedFor: 'Campus Fresher & Internships',
    description:
      'Ultra-clean whitespace, subtle hairline dividers, and elegant typography. Designed to look complete, balanced, and confident even for junior developers with 1-2 core projects.',
    layoutType: 'single-column',
    fontFamily: 'sans',
    accentColor: '#475569',
    badgeText: 'Clean Minimalist',
  },
  {
    id: 'photo-modern',
    name: 'Classic Portrait',
    flowcvName: 'Classic Portrait',
    headline: 'Photo-Centric Modern Header',
    recommendedFor: 'Executive & Management',
    description:
      'Features a prominent circular headshot portrait in the header with a modern accent frame. Perfect for international placements, tech consultants, and client-facing engineering roles.',
    layoutType: 'photo-centric',
    fontFamily: 'sans',
    accentColor: '#0d9488',
    badgeText: 'With Profile Photo',
  },
  {
    id: 'editorial-rule',
    name: 'Editorial PM',
    flowcvName: 'Editorial Rule',
    headline: 'Publication-Style Structured Header',
    recommendedFor: 'Excel & Business Intelligence',
    description:
      'Bold top accent bar, structured executive summary block, and timeline-style project markers. Emphasizes problem statements, business outcomes, and key performance indicators.',
    layoutType: 'editorial',
    fontFamily: 'sans',
    accentColor: '#854d0e',
    badgeText: 'Product & Analytics',
  },
  {
    id: 'first-job-fresh',
    name: 'First Job Fresher',
    flowcvName: 'First Job Fresher',
    headline: 'Education & Capstones First Priority',
    recommendedFor: 'Campus Fresher & Internships',
    description:
      'Reordered structure placing Education & verified Barabari Capstone Projects at the very top. Gives college students maximum placement leverage without requiring past work experience.',
    layoutType: 'single-column',
    fontFamily: 'sans',
    accentColor: '#059669',
    badgeText: 'Campus Placements',
    popular: true,
  },
];

export function getTemplateMeta(id?: string): ResumeTemplateMeta {
  const match = RESUME_TEMPLATES.find((t) => t.id === id);
  return match || RESUME_TEMPLATES[0]; // fallback to Mercury Flow
}
