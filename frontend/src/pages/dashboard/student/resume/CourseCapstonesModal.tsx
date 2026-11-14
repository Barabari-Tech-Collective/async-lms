import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Sparkles,
  Check,
  Plus,
  BookOpen,
  Code2,
  Award,
  GraduationCap,
  Loader2,
} from 'lucide-react';
import type { ResumeProject, CourseCapstoneItem } from './types';
import { detectRoleTrack, TRACK_METADATA } from './resumeRoleMatcher';
import apiClient from '@/services/api';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface CourseCapstonesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCapstone: (capstone: CourseCapstoneItem) => void;
  existingProjects: ResumeProject[];
  studentHeadline?: string;
  targetRole?: string;
  category?: string;
}

export const CourseCapstonesModal: React.FC<CourseCapstonesModalProps> = ({
  isOpen,
  onClose,
  onSelectCapstone,
  existingProjects,
  studentHeadline,
  targetRole,
  category,
}) => {
  const [capstones, setCapstones] = useState<CourseCapstoneItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('recommended');

  const detectedTrack = useMemo(() => {
    return detectRoleTrack(studentHeadline, targetRole, category);
  }, [studentHeadline, targetRole, category]);

  const trackMeta = TRACK_METADATA[detectedTrack] || TRACK_METADATA.tech;

  // Fetch course capstones from API on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function fetchCapstones() {
      setLoading(true);
      try {
        const res = await apiClient.get('/assistant/resume/course-capstones');
        if (res.data?.success && isMounted) {
          setCapstones(res.data.data || []);
        }
      } catch (err) {
        console.error('Failed to load course capstones:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchCapstones();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Check if a capstone is already added to the resume
  const isAlreadyAdded = (capstone: CourseCapstoneItem): boolean => {
    return existingProjects.some(
      (p) =>
        p.id === capstone.id ||
        p.lmsProjectId === capstone.id ||
        p.title.toLowerCase().trim() === capstone.title.toLowerCase().trim()
    );
  };

  // Filtered capstones based on tab and search
  const filteredCapstones = useMemo(() => {
    return capstones.filter((c) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          c.title.toLowerCase().includes(q) ||
          c.course_name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.techStack.some((t) => t.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      // Tab filter
      if (activeTab === 'recommended') {
        if (detectedTrack === 'data') return c.track === 'data';
        return c.track === 'tech';
      }

      if (activeTab === 'tech') {
        return c.track === 'tech' && !c.course_name.toLowerCase().includes('java');
      }
      if (activeTab === 'java') {
        return (
          c.course_name.toLowerCase().includes('java') ||
          c.techStack.some((t) => t.toLowerCase().includes('java'))
        );
      }
      if (activeTab === 'data') {
        return c.track === 'data' || c.course_name.toLowerCase().includes('excel');
      }
      if (activeTab === 'enrolled') return c.isEnrolled === true;

      return true; // 'all'
    });
  }, [capstones, searchQuery, activeTab, detectedTrack]);

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs animate-in fade-in-50 duration-200'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200'>
        {/* Modal Header */}
        <div className='px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-4'>
          <div className='flex items-center gap-3'>
            <div className='w-9 h-9 rounded-xl bg-[#223498] text-white flex items-center justify-center shadow-xs'>
              <GraduationCap size={20} />
            </div>
            <div>
              <div className='flex items-center gap-2 flex-wrap'>
                <h3 className='text-base sm:text-lg font-bold text-slate-900'>
                  Select Course Capstone Projects
                </h3>
                <span className='inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200'>
                  <Sparkles size={11} className='text-amber-500' />
                  CodeGuru Verified
                </span>
              </div>
              <p className='text-xs text-slate-500 mt-0.5'>
                Choose verified capstones from your courses or add industry-standard deliverables tailored to your target role.
              </p>
            </div>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer'
          >
            <X size={20} />
          </button>
        </div>

        {/* Role Detection Banner */}
        <div className='bg-[#DEE8FB]/70 px-6 py-2.5 border-b border-[#223498]/15 flex items-center justify-between flex-wrap gap-2 text-xs'>
          <div className='flex items-center gap-2 text-[#223498] font-medium'>
            <span className='font-bold flex items-center gap-1'>
              <Award size={14} />
              Detected Career Track:
            </span>
            <span className='font-bold px-2 py-0.5 rounded-md bg-[#223498] text-white shadow-2xs'>
              {studentHeadline || trackMeta.label}
            </span>
            <span className='hidden md:inline text-[#223498]/80'>
              ({trackMeta.description})
            </span>
          </div>

          <div className='text-[11px] text-[#223498]/90 font-semibold'>
            Showing capstones optimized for your profile
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className='p-4 sm:p-5 border-b border-slate-100 bg-white space-y-3'>
          {/* Search Bar */}
          <div className='relative'>
            <Search size={16} className='absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search by project title, course name, or technology (e.g., React, Python, SQL, SEO, Agent, Stripe)...'
              className='w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F285B]'
            />
            {searchQuery && (
              <button
                type='button'
                onClick={() => setSearchQuery('')}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600'
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className='flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none'>
            {[
              { id: 'recommended', label: '🎯 Recommended for You' },
              { id: 'tech', label: '💻 Web & Full-Stack' },
              { id: 'java', label: '☕ Java Programming' },
              { id: 'data', label: '📊 Excel & Data Analysis' },
              { id: 'enrolled', label: '📚 In My Enrolled Courses' },
              { id: 'all', label: `🌐 All CodeGuru Projects (${capstones.length})` },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type='button'
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all cursor-pointer',
                    isActive
                      ? 'bg-[#1F285B] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Capstones List */}
        <div className='flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 space-y-4'>
          {loading ? (
            <div className='py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3'>
              <Loader2 size={28} className='animate-spin text-[#1F285B]' />
              <p className='text-xs font-medium'>Fetching verified capstone projects from your LMS courses...</p>
            </div>
          ) : filteredCapstones.length === 0 ? (
            <div className='py-16 text-center bg-white rounded-xl border border-dashed border-slate-300 p-8'>
              <BookOpen size={36} className='text-slate-300 mx-auto mb-2' />
              <h4 className='text-sm font-bold text-slate-700'>No matching capstone projects found</h4>
              <p className='text-xs text-slate-500 mt-1 max-w-sm mx-auto'>
                Try clearing your search query or selecting a different track category tab above.
              </p>
              <button
                type='button'
                onClick={() => {
                  setSearchQuery('');
                  setActiveTab('all');
                }}
                className='mt-3 px-3 py-1.5 text-xs font-semibold text-[#1F285B] bg-indigo-50 hover:bg-indigo-100 rounded-lg cursor-pointer'
              >
                View All Capstones
              </button>
            </div>
          ) : (
            filteredCapstones.map((cap) => {
              const alreadyAdded = isAlreadyAdded(cap);
              const trackInfo = TRACK_METADATA[cap.track] || TRACK_METADATA.general;

              return (
                <div
                  key={cap.id}
                  className={cn(
                    'p-4 sm:p-5 rounded-xl border bg-white shadow-2xs transition-all hover:shadow-sm flex flex-col sm:flex-row sm:items-start justify-between gap-4',
                    alreadyAdded ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className='space-y-2 flex-1'>
                    {/* Course & Badges */}
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className='inline-flex items-center gap-1 text-[11px] font-bold text-[#223498] bg-[#DEE8FB] px-2.5 py-0.5 rounded-full'>
                        <BookOpen size={11} />
                        {cap.course_name}
                      </span>

                      <span
                        className={cn(
                          'text-[10.5px] font-semibold px-2 py-0.5 rounded-full border',
                          trackInfo.pillBg,
                          trackInfo.pillText,
                          trackInfo.border
                        )}
                      >
                        {trackInfo.badgeLabel}
                      </span>

                      {cap.isEnrolled && (
                        <span className='text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200'>
                          Enrolled Course
                        </span>
                      )}

                      {cap.score !== null && cap.score !== undefined && (
                        <span className='text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200'>
                          {cap.score}% Score
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h4 className='text-sm sm:text-base font-bold text-slate-900 leading-snug'>
                      {cap.title}
                    </h4>

                    {/* Description */}
                    <p className='text-xs text-slate-600 leading-relaxed'>
                      {cap.description}
                    </p>

                    {/* Impact Bullets Preview */}
                    {cap.bullets?.length > 0 && (
                      <ul className='space-y-1 pt-1'>
                        {cap.bullets.slice(0, 2).map((bullet, bIdx) => (
                          <li key={bIdx} className='flex items-start gap-1.5 text-[11.5px] text-slate-600 leading-tight'>
                            <span className='mt-1 w-1 h-1 rounded-full bg-slate-400 shrink-0' />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Tech Stack Tags */}
                    {cap.techStack?.length > 0 && (
                      <div className='flex items-center gap-1.5 flex-wrap pt-1.5'>
                        <span className='text-[10.5px] font-bold text-slate-500 flex items-center gap-1'>
                          <Code2 size={11} />
                          Stack:
                        </span>
                        {cap.techStack.map((tech) => (
                          <span
                            key={tech}
                            className='text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700'
                          >
                            {tech}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className='sm:self-center shrink-0 pt-2 sm:pt-0'>
                    {alreadyAdded ? (
                      <div className='inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold shadow-2xs'>
                        <Check size={14} className='text-emerald-600' strokeWidth={2.5} />
                        <span>Added to Resume</span>
                      </div>
                    ) : (
                      <button
                        type='button'
                        onClick={() => {
                          onSelectCapstone(cap);
                          toast.success(`Added "${cap.title}" to your resume!`);
                        }}
                        className='w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#040000] hover:bg-black/85 text-white text-xs font-bold shadow-xs transition-all cursor-pointer hover:scale-[1.02]'
                      >
                        <Plus size={13} strokeWidth={2.5} />
                        <span>Add to Resume</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className='px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500'>
          <span>
            {existingProjects.length} Project{existingProjects.length !== 1 ? 's' : ''} currently on your resume
          </span>
          <button
            type='button'
            onClick={onClose}
            className='px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer transition-colors'
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
