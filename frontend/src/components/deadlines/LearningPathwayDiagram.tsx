import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { StudentJourney } from './PendingTasksReminderModal';
import { GoldenHexMascot, IndigoHexMascot } from '@/components/common/Mascots';

interface LearningPathwayDiagramProps {
  journey: StudentJourney;
  onContinue: (url: string) => void;
}


export const LearningPathwayDiagram: React.FC<LearningPathwayDiagramProps> = ({
  journey,
  onContinue,
}) => {
  return (
    <div
      className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-linear-to-b from-[#10143E] via-[#0B0D28] to-[#07081A] border border-indigo-900/50 shadow-2xl relative overflow-hidden text-white"
    >
      {/* Subtle Background Glows */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-2 left-12 w-1.5 h-1.5 bg-amber-200/60 rounded-full blur-[0.5px]" />
        <div className="absolute bottom-6 right-20 w-1.5 h-1.5 bg-indigo-300/50 rounded-full blur-[0.5px]" />
      </div>

      {/* Main Pathway Canvas matching Figma exactly */}
      <div className="flex items-center justify-between gap-1 sm:gap-4 relative z-10 py-1">
        
        {/* ─── Node A: Completed Unit (Figma Golden Mascot) ─── */}
        <div className="w-[130px] sm:w-[165px] shrink-0 flex flex-col items-center text-center">
          <div className="relative mb-0.5 flex flex-col items-center">
            {/* Exact Figma Golden Mascot with Glowing White Halo Base */}
            <GoldenHexMascot size={58} />
          </div>

          {/* Underlined Unit Title (Loops) */}
          <h4
            className="text-[12.5px] sm:text-[14px] font-bold text-white leading-snug mt-1.5 line-clamp-2 underline underline-offset-4 decoration-white"
            title={journey.completed_unit_title || 'Loops'}
          >
            {journey.completed_unit_title || 'Loops'}
          </h4>

          {/* Vibrant Green Glowing Status */}
          <span className="text-[10.5px] sm:text-[11.5px] font-bold text-[#00E575] mt-1 drop-shadow-[0_0_8px_rgba(0,229,117,0.7)] tracking-wide">
            All Lessons Completed
          </span>
        </div>

        {/* ─── Center: Dashed Curved Flight Path (Figma Vector 108) ─── */}
        <div className="flex-1 min-w-[50px] sm:min-w-[100px] flex items-center justify-center relative px-1 sm:px-2">
          <svg
            className="w-full h-14 sm:h-16 overflow-visible"
            preserveAspectRatio="none"
            viewBox="0 0 180 50"
          >
            {/* Exact Smooth S-Curve Dashed Vector Line */}
            <path
              d="M 5 22 C 55 5, 125 45, 175 28"
              fill="none"
              stroke="rgba(255, 255, 255, 0.85)"
              strokeWidth="2"
              strokeDasharray="4 6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* ─── Node B: Next Up Destination (Figma Indigo Mascot & Pedestals) ─── */}
        <div className="w-[130px] sm:w-[165px] shrink-0 flex flex-col items-center text-center">
          {/* Coral / Red "Next Up" Tag */}
          <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-[#FF5757] drop-shadow-sm mb-0.5">
            Next Up
          </span>

          <div className="relative mb-0.5 flex flex-col items-center">
            {/* Exact Figma Indigo Mascot with Dual Blurred/Glowing Pedestals */}
            <IndigoHexMascot size={60} />
          </div>

          {/* Destination Unit Title (Collections) */}
          <h4
            className="text-[12.5px] sm:text-[14px] font-bold text-white leading-snug mt-1.5 line-clamp-2"
            title={journey.current_unit_title || 'Collections'}
          >
            {journey.current_unit_title || 'Collections'}
          </h4>

          {/* Golden XP Milestone Text */}
          <p className="text-[10px] sm:text-[11px] font-bold text-[#FFD13B] mt-0.5 leading-tight drop-shadow-sm">
            Complete all lessons to gain {journey.current_unit_xp ? `${journey.current_unit_xp}XP` : '10XP'} Points
          </p>

          {/* Continue Action */}
          {journey.current_unit_url && (
            <button
              type="button"
              onClick={() => onContinue(journey.current_unit_url)}
              className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-slate-100 text-slate-950 text-[11px] font-extrabold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer group"
            >
              <span>Continue</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
