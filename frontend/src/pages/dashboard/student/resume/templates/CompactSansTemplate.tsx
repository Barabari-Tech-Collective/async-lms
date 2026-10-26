import { Fragment } from 'react';
import { ExternalLink, Github, Sparkles, Loader2 } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import type { SectionKey } from '../types';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, ContactLinksRow, OrganizationLogoBadge } from '../ResumeCommon';
import type { TemplateProps } from './AtlanticSidebarTemplate';

export function CompactSansTemplate({
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

  const activeOrder = getResolvedSectionOrder(sections, data.sectionOrder);

  return (
    <div className='font-sans text-slate-900 text-[11.5px] leading-snug max-w-[800px] mx-auto bg-white p-5 sm:p-7 print:max-w-none print:w-full print:p-8 print:border-none print:shadow-none select-text border border-slate-200'>
      {/* ── COMPACT HEADER ─────────────────────────────────────────────────── */}
      <header className='pb-2.5 border-b border-slate-800 mb-3 flex flex-row items-baseline justify-between gap-2'>
        <div>
          <h1 className='text-xl sm:text-2xl font-black tracking-tight text-slate-950 uppercase'>
            <InlineText
              value={pi.fullName || 'YOUR NAME'}
              onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
              placeholder='Full Name'
              className='font-black tracking-tight text-slate-950 uppercase'
            />
          </h1>
          <p className='text-[12px] font-semibold text-slate-700'>
            <InlineText
              value={pi.headline || 'Full Stack Engineer | Systems & Architecture'}
              onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
              placeholder='Target Headline'
              className='text-[12px] font-semibold text-slate-700'
            />
          </p>
        </div>

        <div className='flex flex-col items-end gap-1.5'>
          <OrganizationLogoBadge variant='compact' />
          <ContactLinksRow
            personalInfo={pi}
            variant='compact'
            onEditLinks={onEditLinks}
            readOnly={readOnly}
          />
        </div>
      </header>

      {/* ── DYNAMIC REORDERABLE SECTIONS ────────────────────────── */}
      {(() => {
        const renderSummary = () => {
          if (!data.summary) return null;
          return (
            <section key='summary' className='mb-3 page-break-inside-avoid'>
              <div className='group relative text-slate-700 text-[11.5px] leading-normal'>
                <InlineTextarea
                  value={data.summary}
                  onChange={
                    onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                  }
                  className='text-slate-700 text-[11.5px]'
                />
                {!readOnly && (
                  <button
                    onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                    disabled={rewritingKey === 'summary'}
                    className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-0.5 text-slate-600 hover:text-black rounded bg-slate-100 border border-slate-200 print:hidden text-[9.5px] flex items-center gap-1'
                  >
                    {rewritingKey === 'summary' ? (
                      <Loader2 size={10} className='animate-spin' />
                    ) : (
                      <Sparkles size={10} />
                    )}
                    <span>Polish</span>
                  </button>
                )}
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
            <section key='skills' className='mb-3 page-break-inside-avoid'>
              <h2 className='text-[10.5px] font-black tracking-widest text-slate-900 uppercase border-b border-slate-300 pb-0.5 mb-1.5 font-mono'>
                TECHNICAL SKILLS
              </h2>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]'>
                {data.skills?.languages?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-24 shrink-0'>Languages:</span>
                    <span className='text-slate-700 truncate'>{data.skills.languages.join(', ')}</span>
                  </div>
                )}
                {data.skills?.frameworks?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-24 shrink-0'>Frameworks:</span>
                    <span className='text-slate-700 truncate'>{data.skills.frameworks.join(', ')}</span>
                  </div>
                )}
                {data.skills?.databases?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-24 shrink-0'>Databases:</span>
                    <span className='text-slate-700 truncate'>{data.skills.databases.join(', ')}</span>
                  </div>
                )}
                {data.skills?.tools?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-24 shrink-0'>Tools & Cloud:</span>
                    <span className='text-slate-700 truncate'>{data.skills.tools.join(', ')}</span>
                  </div>
                )}
              </div>
            </section>
          );
        };

        const renderProjects = () => {
          if (!data.projects?.length) return null;
          return (
            <section key='projects' className='mb-3'>
              <h2 className='text-[10.5px] font-black tracking-widest text-slate-900 uppercase border-b border-slate-300 pb-0.5 mb-2 font-mono'>
                PROJECTS
              </h2>
              <div className='space-y-2.5'>
                {data.projects.map((proj, pIdx) => (
                  <div key={proj.id || pIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div className='flex items-center gap-1.5'>
                        <span className='font-bold text-[12px] text-slate-950'>{proj.title}</span>
                        <VerificationBadge status={proj.verificationStatus} />
                        {proj.techStack?.length > 0 && (
                          <span className='text-[10.5px] text-slate-500 font-medium'>
                            | {proj.techStack.join(', ')}
                          </span>
                        )}
                      </div>
                      <div className='flex items-center gap-2 text-[10.5px] font-medium'>
                        {proj.repositoryUrl && (
                          <a
                            href={formatHref(proj.repositoryUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-slate-700 hover:underline flex items-center gap-0.5'
                          >
                            <Github size={10} />
                            <span>Code</span>
                          </a>
                        )}
                        {proj.liveDemoUrl && (
                          <a
                            href={formatHref(proj.liveDemoUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-emerald-700 hover:underline font-bold flex items-center gap-0.5'
                          >
                            <ExternalLink size={10} />
                            <span>Live Demo</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {proj.bullets?.length > 0 && (
                      <ul className='mt-0.5 space-y-0.5 text-[11px] text-slate-700'>
                        {proj.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='flex items-start gap-1.5'>
                            <span className='mt-1.5 w-1 h-1 rounded-full bg-slate-400 shrink-0' />
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
                                className='text-[11px] text-slate-700'
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

        const renderEducation = () => {
          if (!data.education?.length) return null;
          return (
            <section key='education' className='mb-3'>
              <h2 className='text-[10.5px] font-black tracking-widest text-slate-900 uppercase border-b border-slate-300 pb-0.5 mb-1.5 font-mono'>
                EDUCATION
              </h2>
              <div className='space-y-1 text-[11px]'>
                {data.education.map((edu, eIdx) => (
                  <div key={edu.id || eIdx} className='flex justify-between items-baseline page-break-inside-avoid'>
                    <div>
                      <span className='font-bold text-slate-900'>{edu.degree}</span>
                      <span className='text-slate-600 block text-[10.5px]'>{edu.institution}</span>
                    </div>
                    <span className='text-[10px] text-slate-500 font-medium'>
                      {edu.score ? `Score: ${edu.score} | ` : ''}
                      {edu.startYear ? `${edu.startYear}-` : ''}
                      {edu.endYear || 'Present'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        };

        const renderExperience = () => {
          if (!data.experience?.length) return null;
          return (
            <section key='experience' className='mb-3'>
              <h2 className='text-[10.5px] font-black tracking-widest text-slate-900 uppercase border-b border-slate-300 pb-0.5 mb-1.5 font-mono'>
                EXPERIENCE
              </h2>
              <div className='space-y-2 text-[11px]'>
                {data.experience.map((exp, xIdx) => (
                  <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <span className='font-bold text-slate-900'>{exp.role} — {exp.organization}</span>
                      <span className='text-[10px] text-slate-500 font-medium'>
                        {exp.startDate} - {exp.endDate || 'Present'}
                      </span>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className='mt-0.5 space-y-0.5 text-[10.5px] text-slate-700'>
                        {exp.bullets.map((b, bIdx) => (
                          <li key={bIdx}>{b}</li>
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
            <section key='certifications' className='mb-3'>
              <h2 className='text-[10.5px] font-black tracking-widest text-slate-900 uppercase border-b border-slate-300 pb-0.5 mb-1.5 font-mono'>
                CERTIFICATIONS
              </h2>
              <div className='space-y-1 text-[11px]'>
                {data.certifications.map((cert, cIdx) => (
                  <div key={cert.id || cIdx} className='flex justify-between items-baseline page-break-inside-avoid'>
                    <span className='font-medium text-slate-800 truncate'>{cert.title} — {cert.issuer}</span>
                    {cert.credentialUrl && (
                      <a
                        href={formatHref(cert.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-[9.5px] text-blue-700 hover:underline shrink-0 ml-1'
                      >
                        Verify ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        };

        const renderEvents = () => {
          if (!data.events?.length) return null;
          return (
            <section key='events' className='mb-4'>
              <h2 className='text-[11px] font-black tracking-widest text-slate-800 uppercase border-b border-slate-300 pb-0.5 mb-1.5 font-mono'>
                WORKSHOPS & EVENTS
              </h2>
              <div className='space-y-2 text-[11.5px]'>
                {data.events.map((evt, eIdx) => (
                  <div key={evt.id || eIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div>
                        <div className='flex items-center gap-1.5'>
                          <span className='font-bold text-slate-900'>{evt.title}</span>
                          {evt.eventType && (
                            <span className='text-[9.5px] font-bold px-1 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200'>
                              {evt.eventType}
                            </span>
                          )}
                        </div>
                        {(evt.organizer || evt.location) && (
                          <span className='text-[10.5px] text-slate-500 block'>
                            {[evt.organizer, evt.location].filter(Boolean).join(' • ')}
                          </span>
                        )}
                      </div>
                      <div className='flex items-center gap-1.5'>
                        {evt.date && <span className='text-[10.5px] text-slate-500'>{evt.date}</span>}
                        {evt.credentialUrl && (
                          <a
                            href={formatHref(evt.credentialUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-[10px] text-[#333d7c] font-bold hover:underline'
                          >
                            Proof ↗
                          </a>
                        )}
                      </div>
                    </div>
                    {evt.learnings && (
                      <p className='mt-0.5 text-[11px] text-slate-600 leading-snug'>
                        <span className='font-semibold text-slate-800'>Learnings: </span>
                        {evt.learnings}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        };

        const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
          summary: renderSummary,
          skills: renderSkills,
          projects: renderProjects,
          education: renderEducation,
          experience: renderExperience,
          events: renderEvents,
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
