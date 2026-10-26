import { Fragment } from 'react';
import { ExternalLink, Github, Sparkles, Loader2 } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import type { SectionKey } from '../types';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, ContactLinksRow, AvatarPhoto, OrganizationLogoBadge } from '../ResumeCommon';
import type { TemplateProps } from './AtlanticSidebarTemplate';

export function MercuryTemplate({
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
    <div className='font-sans text-slate-800 text-[13px] leading-relaxed max-w-[800px] mx-auto bg-white p-6 sm:p-10 print:max-w-none print:w-full print:p-8 print:border-none print:shadow-none select-text'>
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className='mb-6 pb-4 border-b border-slate-200'>
        <div className='flex flex-row items-start justify-between gap-4'>
          <div className='text-left'>
            <h1 className='text-[26px] sm:text-[30px] font-black tracking-tight text-slate-950 uppercase'>
              <InlineText
                value={pi.fullName || 'YOUR NAME'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
                placeholder='Full Name'
                className='font-black tracking-tight text-slate-950 uppercase'
              />
            </h1>
            <p className='text-[14px] font-semibold text-[#333d7c] mt-0.5 tracking-wide'>
              <InlineText
                value={pi.headline || 'Software Engineer | Full Stack Developer'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
                placeholder='Target Headline / Role'
                className='text-[14px] font-semibold text-[#333d7c]'
              />
            </p>
          </div>

          <div className='flex items-center gap-3 self-start'>
            <OrganizationLogoBadge variant='mercury' />
            {pi.avatarUrl && (
              <AvatarPhoto
                url={pi.avatarUrl}
                name={pi.fullName}
                size='md'
                borderColor='#333d7c'
                onEdit={onEditLinks}
                readOnly={readOnly}
              />
            )}
          </div>
        </div>

        {/* Hyperlinks Contact Row */}
        <div className='mt-3'>
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
        const renderSummary = () => {
          if (!data.summary) return null;
          return (
            <div key='summary' className='mb-6 page-break-inside-avoid'>
              <div className='flex items-center gap-2 border-b-2 border-slate-800 pb-1 mb-3'>
                <h2 className='text-[12px] font-black tracking-[0.18em] text-slate-900 uppercase font-mono'>
                  PROFESSIONAL SUMMARY
                </h2>
              </div>
              <div className='group relative text-slate-700 text-[12.5px] leading-relaxed'>
                <InlineTextarea
                  value={data.summary}
                  onChange={
                    onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                  }
                  className='text-slate-700 text-[12.5px]'
                />
                {!readOnly && (
                  <button
                    onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                    disabled={rewritingKey === 'summary'}
                    className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-indigo-600 hover:text-indigo-800 rounded bg-indigo-50 border border-indigo-200 print:hidden text-[11px] flex items-center gap-1 shadow-2xs'
                    title='AI Rewrite summary'
                  >
                    {rewritingKey === 'summary' ? (
                      <Loader2 size={12} className='animate-spin' />
                    ) : (
                      <Sparkles size={12} />
                    )}
                    <span>Rewrite</span>
                  </button>
                )}
              </div>
            </div>
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
            <div key='skills' className='mb-6 page-break-inside-avoid'>
              <div className='flex items-center gap-2 border-b-2 border-slate-800 pb-1 mb-3'>
                <h2 className='text-[12px] font-black tracking-[0.18em] text-slate-900 uppercase font-mono'>
                  TECHNICAL SKILLS
                </h2>
              </div>
              <div className='space-y-1.5 text-[12.5px] text-slate-800'>
                {data.skills?.languages?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-36 shrink-0'>Languages:</span>
                    <span className='text-slate-700'>{data.skills.languages.join(', ')}</span>
                  </div>
                )}
                {data.skills?.frameworks?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-bold text-slate-900 w-36 shrink-0'>Frameworks & Libs:</span>
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
            </div>
          );
        };

        const renderProjects = () => {
          if (!data.projects?.length) return null;
          return (
            <div key='projects' className='mb-6'>
              <div className='flex items-center gap-2 border-b-2 border-slate-800 pb-1 mb-3'>
                <h2 className='text-[12px] font-black tracking-[0.18em] text-slate-900 uppercase font-mono'>
                  PROJECTS
                </h2>
              </div>
              <div className='space-y-4'>
                {data.projects.map((proj, pIdx) => (
                  <div
                    key={proj.id || pIdx}
                    className='border-l-2 border-slate-200 pl-3 py-0.5 page-break-inside-avoid'
                  >
                    <div className='flex flex-wrap items-baseline justify-between gap-2'>
                      <div className='flex items-center gap-2'>
                        <span className='font-bold text-[13.5px] text-slate-900'>
                          <InlineText
                            value={proj.title}
                            onChange={
                              onUpdate && !readOnly
                                ? (v) => {
                                    const next = [...data.projects];
                                    next[pIdx] = { ...proj, title: v };
                                    onUpdate({ ...data, projects: next });
                                  }
                                : undefined
                            }
                            className='font-bold text-[13.5px] text-slate-900'
                          />
                        </span>
                        <VerificationBadge status={proj.verificationStatus} />
                      </div>

                      <div className='flex items-center gap-3 text-[11px] font-medium'>
                        {proj.repositoryUrl && (
                          <a
                            href={formatHref(proj.repositoryUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='inline-flex items-center gap-0.5 text-[#333d7c] hover:underline underline-offset-2'
                          >
                            <Github size={11} />
                            <span>Code</span>
                          </a>
                        )}
                        {proj.liveDemoUrl && (
                          <a
                            href={formatHref(proj.liveDemoUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='inline-flex items-center gap-0.5 text-emerald-700 hover:underline underline-offset-2'
                          >
                            <ExternalLink size={11} />
                            <span>Live Demo</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {proj.techStack?.length > 0 && (
                      <div className='text-[11.5px] text-slate-500 font-medium mt-0.5'>
                        <span>Tech Stack: </span>
                        <span className='text-slate-700'>{proj.techStack.join(', ')}</span>
                      </div>
                    )}

                    {proj.bullets && proj.bullets.length > 0 && (
                      <ul className='mt-2 space-y-1.5'>
                        {proj.bullets.map((bullet, bIdx) => {
                          const rewriteKey = `proj_bullet_${pIdx}_${bIdx}`;
                          return (
                            <li key={bIdx} className='group flex items-start gap-2 text-[12px] text-slate-700'>
                              <span className='mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0' />
                              <div className='flex-1 relative'>
                                <InlineText
                                  value={bullet}
                                  onChange={
                                    onUpdate && !readOnly
                                      ? (v) => {
                                          const next = [...data.projects];
                                          next[pIdx].bullets[bIdx] = v;
                                          onUpdate({ ...data, projects: next });
                                        }
                                      : undefined
                                  }
                                  className='text-[12px] text-slate-700'
                                />
                                {!readOnly && (
                                  <button
                                    onClick={() =>
                                      onTriggerRewrite(
                                        rewriteKey,
                                        'bullet',
                                        bullet,
                                        `Project: ${proj.title}, Tech: ${proj.techStack?.join(', ')}`
                                      )
                                    }
                                    disabled={rewritingKey === rewriteKey}
                                    className='opacity-0 group-hover:opacity-100 transition-opacity ml-2 inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded shadow-2xs print:hidden'
                                    title='AI Rewrite bullet'
                                  >
                                    {rewritingKey === rewriteKey ? (
                                      <Loader2 size={10} className='animate-spin' />
                                    ) : (
                                      <Sparkles size={10} />
                                    )}
                                    <span>Polish</span>
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        };

        const renderEducation = () => {
          if (!data.education?.length) return null;
          return (
            <div key='education' className='mb-6'>
              <div className='flex items-center gap-2 border-b-2 border-slate-800 pb-1 mb-3'>
                <h2 className='text-[12px] font-black tracking-[0.18em] text-slate-900 uppercase font-mono'>
                  EDUCATION
                </h2>
              </div>
              <div className='space-y-3'>
                {data.education.map((edu, eIdx) => (
                  <div key={edu.id || eIdx} className='flex justify-between items-baseline page-break-inside-avoid'>
                    <div>
                      <h3 className='font-bold text-[13px] text-slate-900'>
                        <InlineText
                          value={edu.degree}
                          onChange={
                            onUpdate && !readOnly
                              ? (v) => {
                                  const next = [...data.education];
                                  next[eIdx] = { ...edu, degree: v };
                                  onUpdate({ ...data, education: next });
                                }
                              : undefined
                          }
                          className='font-bold text-[13px] text-slate-900'
                        />
                      </h3>
                      <p className='text-[12px] text-slate-600'>
                        <InlineText
                          value={edu.institution}
                          onChange={
                            onUpdate && !readOnly
                              ? (v) => {
                                  const next = [...data.education];
                                  next[eIdx] = { ...edu, institution: v };
                                  onUpdate({ ...data, education: next });
                                }
                              : undefined
                          }
                          className='text-[12px] text-slate-600'
                        />
                      </p>
                      {edu.score && (
                        <p className='text-[11.5px] font-semibold text-slate-700 mt-0.5'>
                          Score: {edu.score} {edu.gradingSystem ? `(${edu.gradingSystem.replace('_', ' ')})` : ''}
                        </p>
                      )}
                    </div>

                    <div className='text-right text-[11.5px] text-slate-500 font-medium'>
                      {edu.startYear || edu.endYear ? (
                        <span>
                          {edu.startYear ? `${edu.startYear} - ` : ''}
                          {edu.endYear || 'Present'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        };

        const renderExperience = () => {
          if (!data.experience?.length) return null;
          return (
            <div key='experience' className='mb-6'>
              <div className='flex items-center gap-2 border-b-2 border-slate-800 pb-1 mb-3'>
                <h2 className='text-[12px] font-black tracking-[0.18em] text-slate-900 uppercase font-mono'>
                  EXPERIENCE
                </h2>
              </div>
              <div className='space-y-4'>
                {data.experience.map((exp, xIdx) => (
                  <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div>
                        <h3 className='font-bold text-[13px] text-slate-900'>{exp.role}</h3>
                        <p className='text-[12px] text-[#333d7c] font-medium'>
                          {[exp.organization || exp.company, exp.location].filter(Boolean).join(' • ')}
                          {exp.employmentType ? ` (${exp.employmentType})` : ''}
                        </p>
                      </div>
                      <span className='text-[11px] text-slate-500 font-medium'>
                        {exp.startDate} - {exp.endDate || 'Present'}
                      </span>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className='mt-2 space-y-1 text-[12px] text-slate-700'>
                        {exp.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='flex items-start gap-2'>
                            <span className='mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0' />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        };

        const renderCertifications = () => {
          if (!data.certifications?.length) return null;
          return (
            <div key='certifications' className='mb-6'>
              <div className='flex items-center gap-2 border-b-2 border-slate-800 pb-1 mb-3'>
                <h2 className='text-[12px] font-black tracking-[0.18em] text-slate-900 uppercase font-mono'>
                  CERTIFICATIONS
                </h2>
              </div>
              <div className='space-y-2'>
                {data.certifications.map((cert, cIdx) => (
                  <div key={cert.id || cIdx} className='flex items-center justify-between text-[12px] page-break-inside-avoid'>
                    <div className='flex items-center gap-2'>
                      <span className='font-semibold text-slate-800'>{cert.title}</span>
                      <span className='text-slate-500'>— {cert.issuer}</span>
                      <VerificationBadge status={cert.verificationStatus} />
                    </div>
                    {cert.credentialUrl && (
                      <a
                        href={formatHref(cert.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex items-center gap-0.5 text-xs text-[#333d7c] hover:underline underline-offset-2'
                      >
                        <ExternalLink size={11} />
                        <span>View Credential</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        };

        const renderEvents = () => {
          if (!data.events?.length) return null;
          return (
            <div key='events' className='mb-6'>
              <div className='flex items-center gap-2 border-b-2 border-slate-800 pb-1 mb-3'>
                <h2 className='text-[12px] font-black tracking-[0.18em] text-slate-900 uppercase font-mono'>
                  WORKSHOPS, HACKATHONS & EVENTS
                </h2>
              </div>
              <div className='space-y-3'>
                {data.events.map((evt, eIdx) => (
                  <div key={evt.id || eIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div>
                        <div className='flex items-center gap-2'>
                          <h3 className='font-bold text-[13px] text-slate-900'>{evt.title}</h3>
                          {evt.eventType && (
                            <span className='text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200'>
                              {evt.eventType}
                            </span>
                          )}
                        </div>
                        {(evt.organizer || evt.location) && (
                          <p className='text-[12px] text-slate-600 font-medium'>
                            {[evt.organizer, evt.location].filter(Boolean).join(' • ')}
                          </p>
                        )}
                      </div>
                      <div className='flex items-center gap-2'>
                        {evt.date && (
                          <span className='text-[11px] text-slate-500 font-medium'>{evt.date}</span>
                        )}
                        {evt.credentialUrl && (
                          <a
                            href={formatHref(evt.credentialUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='inline-flex items-center gap-0.5 text-xs text-[#333d7c] hover:underline underline-offset-2 ml-1'
                          >
                            <ExternalLink size={11} />
                            <span>Proof</span>
                          </a>
                        )}
                      </div>
                    </div>
                    {evt.learnings && (
                      <p className='mt-1.5 text-[12px] text-slate-700 leading-relaxed'>
                        <span className='font-semibold text-slate-900'>Key Learnings: </span>
                        {evt.learnings}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
