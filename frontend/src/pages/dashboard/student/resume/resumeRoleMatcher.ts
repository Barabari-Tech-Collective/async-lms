export type RoleTrack =
  | 'tech'
  | 'data'
  | 'business_finance'
  | 'sales_marketing'
  | 'design'
  | 'product_operations'
  | 'general';

export const TRACK_METADATA: Record<
  RoleTrack,
  {
    label: string;
    badgeLabel: string;
    description: string;
    pillBg: string;
    pillText: string;
    border: string;
  }
> = {
  tech: {
    label: 'Tech & Full-Stack',
    badgeLabel: 'Tech / Web / AI',
    description: 'Full-Stack Development, Web Applications, Backend Services, Agentic AI & Systems',
    pillBg: 'bg-indigo-50',
    pillText: 'text-indigo-700',
    border: 'border-indigo-200',
  },
  data: {
    label: 'Data Science & BI',
    badgeLabel: 'Data & Analytics',
    description: 'Data Analytics, SQL, Python, Business Intelligence & Machine Learning',
    pillBg: 'bg-sky-50',
    pillText: 'text-sky-700',
    border: 'border-sky-200',
  },
  business_finance: {
    label: 'Finance & Accounts',
    badgeLabel: 'Finance & Commerce',
    description: 'Financial Modeling, Corporate Valuation, GST Compliance, Tally & Auditing',
    pillBg: 'bg-emerald-50',
    pillText: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  sales_marketing: {
    label: 'Marketing & Growth',
    badgeLabel: 'Digital Marketing',
    description: 'Performance Marketing, SEO, Social Media, Growth Strategy & Campaigns',
    pillBg: 'bg-amber-50',
    pillText: 'text-amber-800',
    border: 'border-amber-200',
  },
  design: {
    label: 'Product Design',
    badgeLabel: 'UI/UX Design',
    description: 'UI/UX Design, Figma Prototypes, Design Systems & Usability Research',
    pillBg: 'bg-pink-50',
    pillText: 'text-pink-700',
    border: 'border-pink-200',
  },
  product_operations: {
    label: 'Product & Operations',
    badgeLabel: 'Product & Ops',
    description: 'Agile Product Management, Sprint Ops, PRD Specifications & KPI Tracking',
    pillBg: 'bg-purple-50',
    pillText: 'text-purple-700',
    border: 'border-purple-200',
  },
  general: {
    label: 'General & Entry-Level',
    badgeLabel: 'All Tracks',
    description: 'Cross-functional projects, business communication, and professional deliverables',
    pillBg: 'bg-slate-100',
    pillText: 'text-slate-700',
    border: 'border-slate-200',
  },
};

/**
 * Detects whether a student is aiming for a Tech, Data, Non-Tech (Finance/Marketing/Ops),
 * or Design career track based on their headline/title, target role, or selected resume category.
 */
export function detectRoleTrack(
  headline?: string,
  targetRole?: string,
  category?: string
): RoleTrack {
  const combined = `${headline || ''} ${targetRole || ''} ${category || ''}`.toLowerCase();

  // 1. Tech & Engineering keywords
  if (
    /full\s*stack|web|frontend|front-end|backend|back-end|developer|software|engineer|agentic|agent\s*dki|ai\s*agent|llm|coder|programmer|react|node|javascript|typescript|python\s*dev|java|c\+\+|golang|devops|cloud|mobile|flutter|android|ios|system\s*design/i.test(
      combined
    )
  ) {
    return 'tech';
  }

  // 2. Data Science & Analytics keywords
  if (
    /data\s*analyst|analytics|business\s*intelligence|power\s*bi|tableau|data\s*science|data\s*engineer|machine\s*learning|sql\s*analyst|statistic/i.test(
      combined
    )
  ) {
    return 'data';
  }

  // 3. Finance & Accounting keywords
  if (
    /account|finance|financial|tax|gst|tally|audit|bookkeeping|valuation|wealth|banking|commerce/i.test(
      combined
    )
  ) {
    return 'business_finance';
  }

  // 4. Sales & Digital Marketing keywords
  if (
    /marketing|digital\s*market|seo|sem|growth|sales|lead\s*gen|social\s*media|content\s*market|advertising|bde|business\s*development/i.test(
      combined
    )
  ) {
    return 'sales_marketing';
  }

  // 5. Product Design & UI/UX keywords
  if (/design|ui[\s/]*ux|figma|ux|user\s*experience|user\s*interface|creative|graphic/i.test(combined)) {
    return 'design';
  }

  // 6. Product Management & Operations keywords
  if (/product\s*manag|scrum|agile|operation|project\s*manag|pmo/i.test(combined)) {
    return 'product_operations';
  }

  // Fallback to explicit category if recognized
  if (category && category in TRACK_METADATA) {
    return category as RoleTrack;
  }

  return 'tech'; // Default to tech in CodeGuru
}
