import { Briefcase, GraduationCap, Code2, Award, User, Lightbulb, Calendar } from 'lucide-react';
import type { ResumeMatchResult, ResumeDocument, Section, SectionKey, ResumeCategory } from './types';
import { getCategoryConfig } from './types';

export const DEFAULT_SECTIONS: Section[] = [
  { id: 'summary', label: 'Summary', icon: User },
  { id: 'skills', label: 'Skills', icon: Lightbulb },
  { id: 'projects', label: 'Projects', icon: Code2 },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'experience', label: 'Experience', icon: Briefcase },
  { id: 'events', label: 'Events & Workshops', icon: Calendar },
  { id: 'certifications', label: 'Certifications', icon: Award },
];

export function createEmptyResume(
  user?: { full_name?: string; email?: string } | null,
  category: ResumeCategory = 'general',
  targetRole?: string
): ResumeDocument {
  const config = getCategoryConfig(category);
  const selectedRole = targetRole?.trim() || config.defaultRole;

  return {
    schemaVersion: 1,
    category,
    targetRole: selectedRole,
    templateId: config.recommendedTemplate || 'ivy-standard',
    personalInfo: {
      fullName: user?.full_name || '',
      headline: selectedRole,
      email: user?.email || '',
      phone: '',
      location: '',
      avatarUrl: '',
      links: config.linkSuggestions.map((item) => ({
        label: item.label,
        url: '',
      })),
    },
    summary: '',
    skills: {
      languages: [],
      frameworks: [],
      databases: [],
      tools: [],
    },
    projects: [],
    experience: [],
    events: [],
    education: [],
    certifications: [],
  };
}

export interface UrlValidationResult {
  isValid: boolean;
  error?: string;
}

const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function validateUrl(
  url: string | undefined | null,
  platform?: 'LinkedIn' | 'GitHub' | 'LeetCode' | 'Portfolio' | 'Repository' | 'LiveDemo' | 'Certificate' | string
): UrlValidationResult {
  if (!url) return { isValid: true };
  const trimmed = url.trim();
  if (!trimmed) return { isValid: true };

  // Disallow any whitespace within URLs
  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      error: 'URL cannot contain spaces. Please enter a valid web link.',
    };
  }

  // Prepend https:// if protocol is missing so native URL parser succeeds on naked domains
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      isValid: false,
      error: 'Invalid URL structure. Please enter a valid link.',
    };
  }

  // Must have a valid hostname with at least 1 dot and recognized domain syntax
  const hostname = parsed.hostname.toLowerCase();
  if (!DOMAIN_REGEX.test(hostname)) {
    return {
      isValid: false,
      error: 'Please enter a valid domain (e.g. example.com).',
    };
  }

  const normPlatform = (platform || '').toLowerCase().trim();

  if (normPlatform.includes('linkedin')) {
    if (!hostname.includes('linkedin.com')) {
      return {
        isValid: false,
        error: 'Must be a valid LinkedIn URL (e.g. linkedin.com/in/username)',
      };
    }
  } else if (normPlatform.includes('github')) {
    if (!hostname.includes('github.com') && !hostname.includes('gitlab.com')) {
      return {
        isValid: false,
        error: 'Must be a valid GitHub or GitLab URL (e.g. github.com/username)',
      };
    }
  } else if (normPlatform.includes('leetcode') || normPlatform.includes('coding')) {
    const validCodingHosts = [
      'leetcode.com',
      'hackerrank.com',
      'codeforces.com',
      'codechef.com',
      'geeksforgeeks.org',
      'github.com',
    ];
    if (!validCodingHosts.some((h) => hostname.includes(h))) {
      return {
        isValid: false,
        error: 'Must be a valid coding profile URL (e.g. leetcode.com/u/username)',
      };
    }
  } else if (normPlatform.includes('repository')) {
    const validRepoHosts = ['github.com', 'gitlab.com', 'bitbucket.org'];
    if (!validRepoHosts.some((h) => hostname.includes(h))) {
      return {
        isValid: false,
        error: 'Repository URL should be on GitHub, GitLab, or Bitbucket.',
      };
    }
  }

  return { isValid: true };
}

export function isValidWebUrl(url: string | undefined | null): boolean {
  if (!url || !url.trim()) return false;
  return validateUrl(url.trim()).isValid;
}

export function formatHref(url: string | undefined | null, type: 'email' | 'phone' | 'whatsapp' | 'web' = 'web'): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (type === 'email') return `mailto:${trimmed}`;
  if (type === 'phone') return `tel:${trimmed.replace(/[^\d+]/g, '')}`;
  if (type === 'whatsapp') {
    const cleanNum = trimmed.replace(/[^\d]/g, '');
    return `https://wa.me/${cleanNum}`;
  }
  // For web URLs, only format if it passes validateUrl
  const val = validateUrl(trimmed);
  if (!val.isValid) return '';

  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function compressAvatarImage(file: File, maxDim = 320, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function calcLocalMatchAnalysis(doc: ResumeDocument | null): ResumeMatchResult {
  if (!doc) {
    return {
      matchPercentage: 0,
      matchedKeywords: [],
      missingKeywords: [],
      readabilityTips: ['Fill in your contact details and summary to begin.'],
      actionableSuggestions: ['Add at least one technical project with GitHub repository link.'],
    };
  }

  let score = 0;
  const tips: string[] = [];
  const suggestions: string[] = [];

  if (doc.personalInfo.fullName && doc.personalInfo.email) {
    score += 15;
  } else {
    tips.push('Include full name and clickable email address');
  }

  if (doc.personalInfo.phone) {
    score += 5;
  }

  if (doc.personalInfo.links?.some((l) => l.url.includes('github') || l.label.toLowerCase().includes('github'))) {
    score += 10;
  } else {
    suggestions.push('Add your GitHub profile URL to your contact links');
  }

  if (doc.personalInfo.links?.some((l) => l.url.includes('linkedin') || l.label.toLowerCase().includes('linkedin'))) {
    score += 10;
  }

  if (doc.summary && doc.summary.length >= 50) {
    score += 15;
  } else {
    tips.push('Craft a concise 2-3 sentence technical summary');
  }

  const allSkillsCount =
    (doc.skills?.languages?.length || 0) +
    (doc.skills?.frameworks?.length || 0) +
    (doc.skills?.databases?.length || 0) +
    (doc.skills?.tools?.length || 0);

  if (allSkillsCount >= 6) {
    score += 15;
  } else {
    suggestions.push('List at least 6-8 core technical skills across languages, frameworks, and databases');
  }

  if (doc.projects?.length >= 2) {
    score += 20;
  } else if (doc.projects?.length === 1) {
    score += 10;
    suggestions.push('Add a second technical project or verified capstone');
  } else {
    suggestions.push('Add technical projects showcasing your stack');
  }

  if (doc.education?.length >= 1) {
    score += 10;
  }

  if (doc.events && doc.events.length >= 1) {
    score += 5;
  }

  const matchedKeywords = [
    ...(doc.skills?.languages || []),
    ...(doc.skills?.frameworks || []),
    ...(doc.skills?.databases || []),
  ].slice(0, 8);

  return {
    matchPercentage: Math.min(100, score),
    matchedKeywords,
    missingKeywords: [],
    readabilityTips: tips.length ? tips : ['Formatting structure is clean and ATS-friendly'],
    actionableSuggestions: suggestions.length ? suggestions : ['Your profile has complete core sections'],
  };
}

// Backward-compatibility alias
export const calcLocalATS = calcLocalMatchAnalysis;

export function getResolvedSectionOrder(
  sections?: Section[],
  docSectionOrder?: SectionKey[],
  defaultOrder: SectionKey[] = [
    'summary',
    'skills',
    'projects',
    'education',
    'experience',
    'events',
    'certifications',
  ]
): SectionKey[] {
  let resolved: SectionKey[];
  if (sections && sections.length > 0) {
    resolved = sections.map((s) => s.id);
  } else if (docSectionOrder && docSectionOrder.length > 0) {
    resolved = [...docSectionOrder];
  } else {
    resolved = [...defaultOrder];
  }

  // Ensure 'events' is present if missing from legacy/saved sectionOrder
  if (!resolved.includes('events')) {
    const expIdx = resolved.indexOf('experience');
    if (expIdx !== -1) {
      resolved.splice(expIdx + 1, 0, 'events');
    } else {
      resolved.push('events');
    }
  }

  return resolved;
}

export function calculateExperienceDuration(
  startDate?: string,
  endDate?: string,
  isCurrent?: boolean
): string {
  if (!startDate || !startDate.trim()) return '';

  const parseDate = (str?: string): Date | null => {
    if (!str || !str.trim()) return null;
    const s = str.trim().toLowerCase();
    if (s === 'present' || s === 'current' || s === 'now') return new Date();

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed;

    const yearMatch = str.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      let month = 0;
      for (let i = 0; i < months.length; i++) {
        if (s.includes(months[i])) {
          month = i;
          break;
        }
      }
      return new Date(year, month, 1);
    }
    return null;
  };

  const start = parseDate(startDate);
  const end = isCurrent ? new Date() : (parseDate(endDate) || new Date());

  if (!start || !end || end < start) return '';

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth() + 1;

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0 && months <= 0) return '1 mo';

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'mo' : 'mos'}`);

  return parts.join(' ');
}

