import { Briefcase, GraduationCap, Code2, Award, User, Lightbulb } from 'lucide-react';
import type { ResumeMatchResult, ResumeDocument, Section, SectionKey } from './types';

export const DEFAULT_SECTIONS: Section[] = [
  { id: 'summary', label: 'Summary', icon: User },
  { id: 'skills', label: 'Skills', icon: Lightbulb },
  { id: 'projects', label: 'Projects', icon: Code2 },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'experience', label: 'Experience', icon: Briefcase },
  { id: 'certifications', label: 'Certifications', icon: Award },
];

export function createEmptyResume(): ResumeDocument {
  return {
    schemaVersion: 1,
    templateId: 'modern-mercury',
    personalInfo: {
      fullName: '',
      headline: '',
      email: '',
      phone: '',
      location: '',
      avatarUrl: '',
      links: [
        { label: 'LinkedIn', url: '' },
        { label: 'GitHub', url: '' },
      ],
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
    education: [],
    certifications: [],
  };
}

export function formatHref(url: string, type: 'email' | 'phone' | 'whatsapp' | 'web' = 'web'): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (type === 'email') return `mailto:${trimmed}`;
  if (type === 'phone') return `tel:${trimmed.replace(/[^\d+]/g, '')}`;
  if (type === 'whatsapp') {
    const cleanNum = trimmed.replace(/[^\d]/g, '');
    return `https://wa.me/${cleanNum}`;
  }
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
  defaultOrder: SectionKey[] = ['summary', 'skills', 'projects', 'education', 'experience', 'certifications']
): SectionKey[] {
  if (sections && sections.length > 0) {
    return sections.map((s) => s.id);
  }
  if (docSectionOrder && docSectionOrder.length > 0) {
    return docSectionOrder;
  }
  return defaultOrder;
}

