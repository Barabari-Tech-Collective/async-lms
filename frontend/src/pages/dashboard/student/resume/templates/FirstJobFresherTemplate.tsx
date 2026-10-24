import { Fragment } from 'react';
import {
  ExternalLink,
  Github,
  GraduationCap,
  Code2,
  Lightbulb,
  Award,
  Sparkles,
  Loader2,
  Briefcase,
} from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import type { SectionKey } from '../types';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, ContactLinksRow, AvatarPhoto, OrganizationLogoBadge } from '../ResumeCommon';
import type { TemplateProps } from './AtlanticSidebarTemplate';

export function FirstJobFresherTemplate({
  data,
  sections,
  onUpdate,
  readOnly = false,
  onEditLinks,
  onTriggerRewrite,
  rewritingKey,
}: TemplateProps) {
  const pi = data.personalInfo || {
    fullName: '',
    headline: '',
    email: '',
    phone: '',
    location: '',
    links: [],
  };

  const upPI = (patch: Partial<typeof pi>) => {
    if (readOnly || !onUpdate) return;
    onUpdate({
      ...data,
      personalInfo: { ...pi, ...patch },
    });
  };

  const activeOrder = getResolvedSectionOrder(sections, data.sectionOrder, [
    'education',
    'projects',
    'skills',
    'summary',
    'experience',
    'certifications',
  ]);

  return (
    <div className='font-sans text-slate-800 text-[12.5px] leading-relaxed max-w-[820px] mx-auto bg-white p-6 sm:p-10 print:max-w-none print:w-full print:p-8 print:border-none print:shadow-none select-text border border-emerald-100 shadow-xs'>
      {/* ── HEADER (Fresher Badge Accent) ─────────────────────────────────── */}
      <header className='pb-4 border-b-2 border-emerald-600 mb-5'>
        <div className='flex flex-row items-start justify-between gap-4'>
          <div className='text-left'>
            <OrganizationLogoBadge variant='fresher-chip' />
            <h1 className='text-2xl sm:text-3xl font-black tracking-tight text-slate-950 uppercase'>
              <InlineText
                value={pi.fullName || 'YOUR NAME'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
                placeholder='Full Name'
                className='font-black tracking-tight text-slate-950 uppercase'
              />
            </h1>
            <p className='text-xs font-bold text-emerald-800 mt-0.5 tracking-wide'>
              <InlineText
                value={pi.headline || 'Graduate Software Engineer | Full-Stack Aspirant'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
                placeholder='Target Headline'
                className='text-xs font-bold text-emerald-800'
              />
            </p>
          </div>

          {pi.avatarUrl && (
            <AvatarPhoto
              url={pi.avatarUrl}
              name={pi.fullName}
              size='md'
              borderColor='#059669'
              onEdit={onEditLinks}
              readOnly={readOnly}
            />
          )}
        </div>

        <div className='mt-3 pt-2 border-t border-slate-100'>
          <ContactLinksRow
            personalInfo={pi}
            variant='light'
            onEditLinks={onEditLinks}
            readOnly={readOnly}
          />
        </div>
      </header>

      {/* ── DYNAMIC REORDERABLE SECTIONS ────────────────────────── */}
      {(() => {
        const renderEducation = () => {
          if (!data.education?.length) return null;
          return (
            <section key='education' className='mb-5'>
              <div className='flex items-center gap-1.5 border-b-2 border-emerald-700 pb-1 mb-3'>
                <GraduationCap size={14} className='text-emerald-700' />
                <h2 className='text-[12px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  EDUCATION & ACADEMIC CREDENTIALS
                </h2>
              </div>
              <div className='space-y-3'>
                {data.education.map((edu, eIdx) => (
                  <div
                    key={edu.id || eIdx}
                    className='p-3 rounded-lg bg-emerald-50/40 border border-emerald-100 flex flex-col sm:flex-row justify-between sm:items-baseline gap-1 page-break-inside-avoid'
                  >
                    <div>
                      <h3 className='font-bold text-[13px] text-slate-950'>{edu.degree}</h3>
                      <p className='text-[12px] font-medium text-slate-700'>{edu.institution}</p>
                      {edu.score && (
                        <span className='inline-block mt-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-white text-emerald-800 border border-emerald-200'>
                          Academic Score: {edu.score}{' '}
                          {edu.gradingSystem ? `(${edu.gradingSystem.replace('_', ' ')})` : ''}
                        </span>
                      )}
                    </div>
                    <div className='text-left sm:text-right text-[11px] font-semibold text-emerald-900'>
                      {edu.startYear ? `${edu.startYear} - ` : ''}
                      {edu.endYear || 'Present'}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        };

        const renderProjects = () => {
          if (!data.projects?.length) return null;
          return (
            <section key='projects' className='mb-5'>
              <div className='flex items-center gap-1.5 border-b-2 border-emerald-700 pb-1 mb-3'>
                <Code2 size={14} className='text-emerald-700' />
                <h2 className='text-[12px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  PORTFOLIO PROJECTS & CODEGURU CAPSTONES
                </h2>
              </div>
              <div className='space-y-3.5'>
                {data.projects.map((proj, pIdx) => (
                  <div
                    key={proj.id || pIdx}
                    className='border-l-3 border-emerald-600 pl-3 py-0.5 page-break-inside-avoid'
                  >
                    <div className='flex flex-wrap items-baseline justify-between gap-2'>
                      <div className='flex items-center gap-2'>
                        <span className='font-bold text-[13px] text-slate-900'>{proj.title}</span>
                        <VerificationBadge status={proj.verificationStatus} />
                      </div>
                      <div className='flex items-center gap-3 text-[11px] font-medium'>
                        {proj.repositoryUrl && (
                          <a
                            href={formatHref(proj.repositoryUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='inline-flex items-center gap-0.5 text-emerald-800 hover:underline font-semibold'
                          >
                            <Github size={11} />
                            <span>Source Code</span>
                          </a>
                        )}
                        {proj.liveDemoUrl && (
                          <a
                            href={formatHref(proj.liveDemoUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='inline-flex items-center gap-0.5 text-blue-700 hover:underline font-bold'
                          >
                            <ExternalLink size={11} />
                            <span>Live Demo ↗</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {proj.techStack?.length > 0 && (
                      <p className='text-[11px] text-slate-600 mt-0.5'>
                        <span className='font-semibold text-slate-700'>Stack:</span>{' '}
                        {proj.techStack.join(', ')}
                      </p>
                    )}

                    {proj.bullets?.length > 0 && (
                      <ul className='mt-1.5 space-y-1 text-[11.5px] text-slate-700'>
                        {proj.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='group flex items-start gap-1.5'>
                            <span className='mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0' />
                            <div className='flex-1 relative'>
                              <InlineText
                                value={b}
                                onChange={
                                  onUpdate && !readOnly
                                    ? (v) => {
                                        const next = [...data.projects];
                                        next[pIdx].bullets[bIdx] = v;
                                        onUpdate({ ...data, projects: next });
                                      }
                                    : undefined
                                }
                                className='text-[11.5px] text-slate-700'
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        };

        const renderSkills = () => {
          if (
            !(
              data.skills?.languages?.length ||
              data.skills?.frameworks?.length ||
              data.skills?.databases?.length ||
              data.skills?.tools?.length
            )
          ) {
            return null;
          }
          return (
            <section key='skills' className='mb-5 page-break-inside-avoid'>
              <div className='flex items-center gap-1.5 border-b-2 border-emerald-700 pb-1 mb-3'>
                <Lightbulb size={14} className='text-emerald-700' />
                <h2 className='text-[12px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  TECHNICAL SKILLS & COMPETENCIES
                </h2>
              </div>
              <div className='space-y-1.5 text-[12px] text-slate-800'>
                {data.skills?.languages?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-36 shrink-0'>Languages:</span>
                    <span className='text-slate-700'>{data.skills.languages.join(', ')}</span>
                  </div>
                )}
                {data.skills?.frameworks?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-36 shrink-0'>Frameworks:</span>
                    <span className='text-slate-700'>{data.skills.frameworks.join(', ')}</span>
                  </div>
                )}
                {data.skills?.databases?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-36 shrink-0'>Databases:</span>
                    <span className='text-slate-700'>{data.skills.databases.join(', ')}</span>
                  </div>
                )}
                {data.skills?.tools?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-36 shrink-0'>Tools & Platforms:</span>
                    <span className='text-slate-700'>{data.skills.tools.join(', ')}</span>
                  </div>
                )}
              </div>
            </section>
          );
        };

        const renderSummary = () => {
          if (!data.summary) return null;
          return (
            <section key='summary' className='mb-5 page-break-inside-avoid'>
              <h2 className='text-[11.5px] font-black tracking-wider text-slate-900 uppercase border-b border-slate-200 pb-1 mb-2 font-mono'>
                CAREER OBJECTIVE
              </h2>
              <div className='group relative text-slate-700 text-[12px] leading-relaxed'>
                <InlineTextarea
                  value={data.summary}
                  onChange={
                    onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                  }
                  className='text-slate-700 text-[12px]'
                />
                {!readOnly && onTriggerRewrite && (
                  <button
                    type='button'
                    onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                    disabled={rewritingKey === 'summary'}
                    className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-emerald-700 hover:text-emerald-900 rounded bg-emerald-50 border border-emerald-200 print:hidden text-[10px] flex items-center gap-1 shadow-2xs'
                    title='AI Rewrite Career Objective'
                  >
                    {rewritingKey === 'summary' ? (
                      <Loader2 size={11} className='animate-spin' />
                    ) : (
                      <Sparkles size={11} />
                    )}
                    <span>Polish</span>
                  </button>
                )}
              </div>
            </section>
          );
        };

        const renderExperience = () => {
          if (!data.experience?.length) return null;
          return (
            <section key='experience' className='mb-5'>
              <div className='flex items-center gap-1.5 border-b-2 border-emerald-700 pb-1 mb-2'>
                <Briefcase size={14} className='text-emerald-700' />
                <h2 className='text-[12px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  WORK EXPERIENCE & INTERNSHIPS
                </h2>
              </div>
              <div className='space-y-3'>
                {data.experience.map((exp, xIdx) => (
                  <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div>
                        <h3 className='font-bold text-[13px] text-slate-900'>{exp.role}</h3>
                        <p className='text-[12px] text-emerald-800 font-medium'>{exp.organization}</p>
                      </div>
                      <span className='text-[11px] text-slate-500 font-medium'>
                        {exp.startDate} - {exp.endDate || 'Present'}
                      </span>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className='mt-1.5 space-y-1 text-[11.5px] text-slate-700'>
                        {exp.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='flex items-start gap-1.5'>
                            <span className='mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0' />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        };

        const renderCertifications = () => {
          if (!data.certifications?.length) return null;
          return (
            <section key='certifications' className='mb-5'>
              <div className='flex items-center gap-1.5 border-b-2 border-emerald-700 pb-1 mb-2'>
                <Award size={14} className='text-emerald-700' />
                <h2 className='text-[12px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  CERTIFICATIONS & LMS ACHIEVEMENTS
                </h2>
              </div>
              <div className='space-y-1.5 text-[11.5px]'>
                {data.certifications.map((cert, cIdx) => (
                  <div key={cert.id || cIdx} className='flex items-center justify-between page-break-inside-avoid'>
                    <div className='flex items-center gap-2'>
                      <span className='font-semibold text-slate-900'>{cert.title}</span>
                      <span className='text-slate-500'>— {cert.issuer}</span>
                      <VerificationBadge status={cert.verificationStatus} />
                    </div>
                    {cert.credentialUrl && (
                      <a
                        href={formatHref(cert.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-emerald-700 hover:underline text-[11px] font-bold'
                      >
                        View Credential ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        };

        const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
          education: renderEducation,
          projects: renderProjects,
          skills: renderSkills,
          summary: renderSummary,
          experience: renderExperience,
          certifications: renderCertifications,
        };

        return activeOrder.map((sectionKey) => (
          <Fragment key={sectionKey}>
            {sectionRenderers[sectionKey]?.()}
          </Fragment>
        ));
      })()}
    </div>
  );
}
