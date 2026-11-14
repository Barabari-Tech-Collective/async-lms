import { Fragment } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import type { SectionKey } from '../types';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { ContactLinksRow, OrganizationLogoBadge } from '../ResumeCommon';
import type { TemplateProps } from './AtlanticSidebarTemplate';

function SectionHeading({ title }: { title: string }) {
  return (
    <div
      data-section-heading=''
      className='mb-2'
      style={{
        marginBottom: '6px',
        paddingBottom: '0px',
        borderBottom: 'none',
        display: 'block',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'block',
          width: '100%',
          lineHeight: '1.2',
          paddingBottom: '5px',
          margin: 0,
        }}
      >
        <h2
          className='text-left text-[11px] font-bold tracking-[0.14em] text-stone-900 uppercase font-serif'
          style={{
            fontSize: '11px',
            fontWeight: 'bold',
            letterSpacing: '0.14em',
            color: '#1c1917',
            textTransform: 'uppercase',
            lineHeight: '1.2',
            margin: 0,
            padding: 0,
            display: 'block',
          }}
        >
          {title}
        </h2>
      </div>
      <div
        data-heading-line=''
        style={{
          display: 'block',
          width: '100%',
          height: '1px',
          backgroundColor: '#292524',
          marginTop: '0px',
          marginBottom: '5px',
          border: 'none',
          padding: 0,
        }}
      />
    </div>
  );
}

export function ExecutiveSerifTemplate({
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
    <div className='font-serif text-slate-900 text-[12.5px] leading-relaxed max-w-[820px] mx-auto bg-white p-6 sm:p-8 print:max-w-none print:w-full print:p-8 print:border-none print:shadow-none select-text border border-stone-200 shadow-xs'>
      {/* ── HEADER (Centered Classical Academic / Harvard Format) ────────── */}
      <header className='text-center pb-4 mb-4 border-b border-stone-300'>
        <OrganizationLogoBadge variant='executive-seal' />
        <h1 className='text-2xl sm:text-3xl font-bold tracking-wide text-stone-950 uppercase'>
          <InlineText
            value={pi.fullName || 'YOUR NAME'}
            onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
            placeholder='Full Name'
            className='font-bold tracking-wide text-stone-950 uppercase'
          />
        </h1>
        {pi.headline && (
          <p className='text-xs sm:text-[13px] italic text-stone-700 mt-0.5 font-serif'>
            <InlineText
              value={pi.headline}
              onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
              placeholder='Target Role / Headline'
              className='italic text-stone-700'
            />
          </p>
        )}

        <div className='mt-2.5 flex justify-center'>
          <ContactLinksRow
            personalInfo={pi}
            variant='centered'
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
              <SectionHeading title='Profile
              ' />
              <div className='group relative text-stone-800 text-[12.5px] leading-relaxed text-justify'>
                <InlineTextarea
                  value={data.summary}
                  onChange={
                    onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                  }
                  className='text-stone-800 text-[12.5px] text-justify font-serif'
                />
                {!readOnly && onTriggerRewrite && (
                  <button
                    onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                    disabled={rewritingKey === 'summary'}
                    className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-stone-700 hover:text-black rounded bg-stone-100 border border-stone-300 print:hidden text-[10px] flex items-center gap-1 cursor-pointer'
                  >
                    {rewritingKey === 'summary' ? (
                      <Loader2 size={11} className='animate-spin' />
                    ) : (
                      <Sparkles size={11} />
                    )}
                    <span>Refine</span>
                  </button>
                )}
              </div>
            </section>
          );
        };

        const renderEducation = () => {
          if (!data.education?.length) return null;
          return (
            <section key='education' className='mb-3'>
              <SectionHeading title='Education
              ' />
              <div className='space-y-1.5'>
                {data.education.map((edu, eIdx) => (
                  <div key={edu.id || eIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <h3 className='font-bold text-[13px] text-stone-950'>{edu.institution}</h3>
                      <span className='text-[11.5px] text-stone-700 font-sans italic'>
                        {edu.startYear ? `${edu.startYear} – ` : ''}
                        {edu.endYear || 'Present'}
                      </span>
                    </div>
                    <div className='flex justify-between items-baseline text-[12px] text-stone-800'>
                      <p className='italic'>
                        {edu.degree}
                        {edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''}
                      </p>
                      {edu.score && (
                        <span className='font-semibold text-stone-900 font-sans text-[11px]'>
                          Score: {edu.score}
                        </span>
                      )}
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
            <section key='projects' className='mb-3'>
              <h2 className='text-left text-[12px] font-bold tracking-[0.14em] text-stone-900 uppercase pb-0.5 mb-2.5 border-b border-stone-800 font-serif'>
                Projects
              </h2>
              <div className='space-y-2'>
                {data.projects.map((proj, pIdx) => (
                  <div key={proj.id || pIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div className='flex items-baseline gap-1.5 flex-wrap'>
                        <span className='font-bold text-[13px] text-stone-950'>{proj.title}</span>
                        {proj.techStack?.length > 0 && (
                          <span className='text-[11.5px] text-stone-700 italic'>
                            | {proj.techStack.join(', ')}
                          </span>
                        )}
                      </div>
                      <div className='flex items-center gap-2 text-[11px] font-sans font-semibold shrink-0 ml-2'>
                        {formatHref(proj.repositoryUrl, 'web') && (
                          <a
                            href={formatHref(proj.repositoryUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-blue-700 hover:underline'
                          >
                            GitHub Link ↗
                          </a>
                        )}
                        {formatHref(proj.liveDemoUrl, 'web') && (
                          <a
                            href={formatHref(proj.liveDemoUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-blue-700 hover:underline'
                          >
                            Live Demo ↗
                          </a>
                        )}
                      </div>
                    </div>

                    {proj.bullets?.length > 0 && (
                      <ul className='mt-1 space-y-1 text-[12px] text-stone-800 list-disc list-inside font-serif'>
                        {proj.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='group leading-relaxed'>
                            <span className='relative'>
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
                                className='text-[12px] text-stone-800'
                              />
                            </span>
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

        const renderExperience = () => {
          if (!data.experience?.length) return null;
          return (
            <section key='experience' className='mb-3'>
              <SectionHeading title='Experience
              ' />
              <div className='space-y-1.5'>
                {data.experience.map((exp, xIdx) => (
                  <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <h3 className='font-bold text-[13px] text-stone-950'>{exp.role}</h3>
                      <span className='text-[11.5px] text-stone-700 font-sans italic'>
                        {exp.startDate} – {exp.endDate || 'Present'}
                      </span>
                    </div>
                    {exp.organization && (
                      <p className='text-[12px] text-stone-700 italic'>{exp.organization}</p>
                    )}
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className='mt-1 space-y-1 text-[12px] text-stone-800 list-disc list-inside font-serif'>
                        {exp.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='leading-relaxed'>{b}</li>
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
            <section key='skills' className='mb-3 page-break-inside-avoid'>
              <SectionHeading title='Technical Skills
              ' />
              <div className='space-y-1.5 text-[12px] text-stone-800 font-serif'>
                {data.skills?.languages?.length > 0 && (
                  <div>
                    <span className='font-bold text-stone-950'>Languages: </span>
                    <span className='text-stone-800'>{data.skills.languages.join(', ')}</span>
                  </div>
                )}
                {data.skills?.frameworks?.length > 0 && (
                  <div>
                    <span className='font-bold text-stone-950'>Frameworks & Libraries: </span>
                    <span className='text-stone-800'>{data.skills.frameworks.join(', ')}</span>
                  </div>
                )}
                {data.skills?.databases?.length > 0 && (
                  <div>
                    <span className='font-bold text-stone-950'>Databases: </span>
                    <span className='text-stone-800'>{data.skills.databases.join(', ')}</span>
                  </div>
                )}
                {data.skills?.tools?.length > 0 && (
                  <div>
                    <span className='font-bold text-stone-950'>Tools & Systems: </span>
                    <span className='text-stone-800'>{data.skills.tools.join(', ')}</span>
                  </div>
                )}
              </div>
            </section>
          );
        };

        const renderCertifications = () => {
          if (!data.certifications?.length) return null;
          return (
            <section key='certifications' className='mb-3'>
              <SectionHeading title='Certifications
              ' />
              <div className='space-y-1.5 text-[12px]'>
                {data.certifications.map((cert, cIdx) => (
                  <div key={cert.id || cIdx} className='flex justify-between items-baseline page-break-inside-avoid'>
                    <div className='flex items-baseline gap-1.5 flex-wrap'>
                      <span className='font-bold text-stone-950'>{cert.title || cert.name}</span>
                      {cert.issuer && <span className='text-stone-700'>— {cert.issuer}</span>}
                      {cert.issueDate && <span className='text-stone-600 font-sans text-[11px]'>({cert.issueDate})</span>}
                    </div>
                    {formatHref(cert.credentialUrl, 'web') && (
                      <a
                        href={formatHref(cert.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-[11px] text-blue-700 hover:underline font-sans font-semibold shrink-0 ml-2'
                      >
                        [Credential]
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
            <section key='events' className='mb-3'>
              <SectionHeading title='Extracurricular Activities & Events
              ' />
              <div className='space-y-2 text-[12px]'>
                {data.events.map((evt, vIdx) => (
                  <div key={evt.id || vIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div className='flex items-baseline gap-1.5'>
                        <span className='font-bold text-stone-950'>{evt.title}</span>
                        {evt.organizer && <span className='text-stone-700 italic'>— {evt.organizer}</span>}
                      </div>
                      <div className='flex items-center gap-2 font-sans'>
                        {evt.date && <span className='text-[11px] text-stone-600 italic'>{evt.date}</span>}
                        {formatHref(evt.credentialUrl, 'web') && (
                          <a
                            href={formatHref(evt.credentialUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-[11px] text-blue-700 hover:underline font-semibold'
                          >
                            [Credential]
                          </a>
                        )}
                      </div>
                    </div>
                    {evt.learnings && (
                      <p className='text-[11.5px] text-stone-700 mt-0.5 font-serif leading-relaxed'>
                        • {evt.learnings}
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
