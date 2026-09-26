import React, { useId, useMemo } from 'react';
import { Check, ArrowRight, Zap, Sparkles } from 'lucide-react';
import type { StudentJourney } from './PendingTasksReminderModal';
import { GoldenHexMascot, IndigoHexMascot } from '@/components/common/Mascots';

interface LearningPathwayDiagramProps {
  journey: StudentJourney;
  onContinue: (url: string) => void;
}

interface TopicTheme {
  category: string;
  gradientBg: string;
  prevPortalGlow: string;
  nextPortalGlow: string;
  prevColor: string;
  nextColor: string;
  badgeLabel: string;
  badgeColor: string;
}

function resolveTopicTheme(subjectName: string, unitTitle: string): TopicTheme {
  const combined = `${subjectName} ${unitTitle}`.toLowerCase();

  // AI & Data Science Track
  if (
    combined.includes('ai') ||
    combined.includes('machine learning') ||
    combined.includes('neural') ||
    combined.includes('deep learning') ||
    combined.includes('nlp') ||
    combined.includes('prompt')
  ) {
    return {
      category: 'Artificial Intelligence',
      gradientBg: 'from-[#071319] via-[#0d222b] to-[#08161d]',
      prevPortalGlow: 'shadow-[0_0_22px_rgba(16,185,129,0.35)] ring-emerald-400/50',
      nextPortalGlow: 'shadow-[0_0_25px_rgba(168,85,247,0.45)] ring-purple-400/50',
      prevColor: '#10b981',
      nextColor: '#a855f7',
      badgeLabel: 'AI Odyssey',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    };
  }

  // Databases & SQL Track
  if (
    combined.includes('sql') ||
    combined.includes('database') ||
    combined.includes('postgres') ||
    combined.includes('mongo') ||
    combined.includes('mysql') ||
    combined.includes('schema') ||
    combined.includes('query')
  ) {
    return {
      category: 'Database Systems',
      gradientBg: 'from-[#0d101a] via-[#141829] to-[#0e121e]',
      prevPortalGlow: 'shadow-[0_0_22px_rgba(245,158,11,0.35)] ring-amber-400/50',
      nextPortalGlow: 'shadow-[0_0_25px_rgba(168,85,247,0.45)] ring-purple-400/50',
      prevColor: '#f59e0b',
      nextColor: '#a855f7',
      badgeLabel: 'Data Realm',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    };
  }

  // BI & Analytics Track
  if (
    combined.includes('power bi') ||
    combined.includes('tableau') ||
    combined.includes('analytics') ||
    combined.includes('excel') ||
    combined.includes('dax') ||
    combined.includes('dashboard') ||
    combined.includes('metrics')
  ) {
    return {
      category: 'Business Intelligence',
      gradientBg: 'from-[#08141d] via-[#0d2130] to-[#091621]',
      prevPortalGlow: 'shadow-[0_0_22px_rgba(16,185,129,0.35)] ring-emerald-400/50',
      nextPortalGlow: 'shadow-[0_0_25px_rgba(6,182,212,0.45)] ring-cyan-400/50',
      prevColor: '#10b981',
      nextColor: '#06b6d4',
      badgeLabel: 'Insights Path',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    };
  }

  // Design & UI/UX Track
  if (
    combined.includes('design') ||
    combined.includes('figma') ||
    combined.includes('ui') ||
    combined.includes('ux') ||
    combined.includes('wireframe') ||
    combined.includes('prototype') ||
    combined.includes('graphic')
  ) {
    return {
      category: 'UI/UX Design',
      gradientBg: 'from-[#170a1a] via-[#241029] to-[#160a19]',
      prevPortalGlow: 'shadow-[0_0_22px_rgba(244,63,94,0.35)] ring-rose-400/50',
      nextPortalGlow: 'shadow-[0_0_25px_rgba(192,132,252,0.45)] ring-violet-400/50',
      prevColor: '#f43f5e',
      nextColor: '#c084fc',
      badgeLabel: 'Creative Path',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    };
  }

  // Universal Cosmic Default (Golden completed bot + Electric purple next bot)
  return {
    category: subjectName || 'Learning Journey',
    gradientBg: 'from-[#0b0f1b] via-[#121930] to-[#0c1221]',
    prevPortalGlow: 'shadow-[0_0_22px_rgba(251,191,36,0.35)] ring-amber-400/50',
    nextPortalGlow: 'shadow-[0_0_25px_rgba(147,51,234,0.45)] ring-purple-400/50',
    prevColor: '#fbbf24',
    nextColor: '#9333ea',
    badgeLabel: 'Cosmic Quest',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  };
}

export const LearningPathwayDiagram: React.FC<LearningPathwayDiagramProps> = ({
  journey,
  onContinue,
}) => {
  const uniqueId = useId().replace(/:/g, '');
  const gradId = `trailGrad-${uniqueId}`;

  const theme = useMemo(
    () => resolveTopicTheme(journey.subject_name || '', journey.current_unit_title || ''),
    [journey.subject_name, journey.current_unit_title],
  );

  return (
    <div
      className={`p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-linear-to-r ${theme.gradientBg} border border-slate-800/80 shadow-lg relative overflow-hidden text-white`}
    >
      {/* Background Starfield & Subtle Glows */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-2 left-10 w-1 h-1 bg-white rounded-full animate-ping duration-1000" />
        <div className="absolute top-8 right-16 w-1.5 h-1.5 bg-indigo-300 rounded-full opacity-60" />
        <div className="absolute bottom-3 left-1/3 w-1 h-1 bg-amber-200 rounded-full opacity-50" />
      </div>

      {/* Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10 relative z-10 text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2 font-bold tracking-wider uppercase text-slate-200 text-[11px] sm:text-xs">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Your Learning Journey</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wide uppercase border ${theme.badgeColor} shrink-0`}
          >
            {theme.badgeLabel}
          </span>
          <span className="text-slate-400 font-medium text-[11px] truncate max-w-[110px] sm:max-w-[180px]">
            {journey.subject_name}
          </span>
        </div>
      </div>

      {/* Main Cosmic Journey Trail */}
      <div className="pt-3 pb-1 sm:pt-4 sm:pb-2 flex items-center justify-between gap-1.5 sm:gap-4 relative z-10">
        
        {/* Node A: Completed Unit (Figma Golden Mascot) */}
        <div className="flex flex-col items-center text-center max-w-[130px] sm:max-w-[170px] shrink-0">
          <div className="relative mb-1 flex flex-col items-center">
            {/* Floating Star / Check Badge */}
            <div className="absolute -top-1 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center text-[9px] sm:text-[10px] font-black shadow-sm z-20 border border-white/40">
              ✓
            </div>
            
            {/* Exact Figma Golden Mascot with Glowing Halo Base */}
            <GoldenHexMascot size={52} />
          </div>

          <h4
            className="text-xs sm:text-[13px] font-bold text-slate-100 leading-snug mt-1 line-clamp-2 underline underline-offset-4 decoration-white/40 min-h-[1.8rem]"
            title={journey.completed_unit_title}
          >
            {journey.completed_unit_title || 'Orientation Completed'}
          </h4>
          <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 mt-0.5 drop-shadow-sm">
            <Check className="w-2.5 h-2.5 stroke-[3]" /> Lessons Completed
          </span>
        </div>

        {/* Central Energy Stream Connector (Dashed Cosmic Flight Path) */}
        <div className="flex-1 min-w-[45px] sm:min-w-[80px] flex flex-col items-center justify-center relative px-1">
          <svg
            className="w-full h-10 sm:h-12 overflow-visible"
            preserveAspectRatio="none"
            viewBox="0 0 160 30"
          >
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#818CF8" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* Dotted / Dashed Cosmic Trail */}
            <path
              d="M 5 15 C 45 2, 115 28, 155 15"
              fill="none"
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="2.5"
              strokeDasharray="6 7"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Flowing Starlight Energy Glyph in Center */}
          <div className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-slate-900/90 border border-white/20 text-amber-300 shadow-sm">
            <Zap className="w-2.5 h-2.5 fill-amber-300" />
          </div>
        </div>

        {/* Node B: Next Up Destination (Figma Indigo Mascot) */}
        <div className="flex flex-col items-center text-center max-w-[130px] sm:max-w-[170px] shrink-0">
          <div className="relative mb-1 flex flex-col items-center">
            {/* Top Red/Coral "Next Up" Tag */}
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-rose-400 drop-shadow-sm mb-0.5">
              Next Up
            </span>

            {/* Exact Figma Indigo Mascot with Dual Stepping-Stone Pedestals */}
            <IndigoHexMascot size={56} />
          </div>

          <h4
            className="text-xs sm:text-[13px] font-bold text-white leading-snug mt-0.5 line-clamp-2 min-h-[1.8rem]"
            title={journey.current_unit_title}
          >
            {journey.current_unit_title || 'Next in Syllabus'}
          </h4>

          <p className="text-[9.5px] sm:text-[10px] font-bold text-amber-300 mt-0.5 max-w-full leading-tight drop-shadow-sm">
            Complete all lessons to gain 10XP Points
          </p>

          {/* Action CTA Button */}
          <button
            type="button"
            onClick={() => onContinue(journey.current_unit_url)}
            className="mt-1.5 inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 bg-white hover:bg-slate-100 text-slate-950 text-[10.5px] sm:text-[11px] font-extrabold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer group"
          >
            <span>Continue</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

      </div>
    </div>
  );
};
