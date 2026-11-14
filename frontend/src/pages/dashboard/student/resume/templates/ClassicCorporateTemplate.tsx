import { Fragment } from 'react';
import { Sparkles, Loader2, Table } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import type { SectionKey } from '../types';
import { getCategoryConfig } from '../types';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, ContactLinksRow, OrganizationLogoBadge } from '../ResumeCommon';
import type { TemplateProps } from './AtlanticSidebarTemplate';

function SectionHeading({ title, icon }: { title: string; icon?: React.ReactNode }) {
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
          className='text-[11px] font-bold tracking-widest text-slate-900 uppercase font-sans flex items-center gap-1.5'
          style={{
            fontSize: '11px',
            fontWeight: 'bold',
            letterSpacing: '0.12em',
            color: '#0f172a',
            textTransform: 'uppercase',
            lineHeight: '1.2',
            margin: 0,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {icon}
          {title}
        </h2>
      </div>
      <div
        data-heading-line=''
        style={{
          display: 'block',
          width: '100%',
          height: '1px',
          backgroundColor: '#334155',
          marginTop: '0px',
          marginBottom: '5px',
          border: 'none',
          padding: 0,
        }}
      />
    </div>
  );
}

export function ClassicCorporateTemplate({
  data,
  sections,
  onUpdate,
  readOnly = false,
  onEditLinks,
  onTriggerRewrite,
  rewritingKey,
}: TemplateProps) {
  const catCfg = getCategoryConfig(data.category);
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
    <div className='font-sans text-slate-900 text-[12px] leading-normal max-w-[800px] mx-auto bg-white p-6 sm:p-8 print:max-w-none print:w-full print:p-6 print:border-none print:shadow-none select-text border border-slate-300 shadow-xs'>
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className='pb-2.5 border-b-2 border-slate-900 mb-3 text-center'>
        <OrganizationLogoBadge variant='corporate-center' />
        <h1 className='text-2xl sm:text-3xl font-black tracking-tight text-slate-950 uppercase'>
          <InlineText
            value={pi.fullName || 'YOUR NAME'}
            onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
            placeholder='Full Name'
            className='font-black tracking-tight text-slate-950 uppercase'
          />
        </h1>
        <p className='text-xs font-bold text-slate-700 tracking-wider uppercase mt-1'>
          <InlineText
            value={pi.headline || catCfg.defaultRole}
            onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
            placeholder='Target Role'
            className='text-xs font-bold text-slate-700 tracking-wider uppercase'
          />
        </p>

        <div className='mt-3 flex justify-center'>
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
              <div className='border-l-4 border-slate-800 bg-slate-50 p-3 rounded-r-md'>
                <div className='group relative text-slate-800 text-[12px] leading-relaxed'>
                  <InlineTextarea
                    value={data.summary}
                    onChange={
                      onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                    }
                    className='text-slate-800 text-[12px]'
                  />
                  {!readOnly && (
                    <button
                      onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                      disabled={rewritingKey === 'summary'}
                      className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-slate-700 hover:text-black rounded bg-white border border-slate-300 print:hidden text-[10px] flex items-center gap-1 shadow-2xs'
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
              <SectionHeading title='CORE COMPETENCIES & TECHNICAL TOOLS' icon={<Table size={12} className='text-slate-600' />} />
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] bg-slate-50/60 p-3 rounded-md border border-slate-200'>
                {data.skills.languages?.length > 0 && (
                  <div>
                    <span className='font-bold text-slate-900 block text-[11px] uppercase tracking-wide text-slate-600'>
                      {catCfg.skillLabels.languages}:
                    </span>
                    <span className='text-slate-800 font-medium'>{data.skills.languages.join(' • ')}</span>
                  </div>
                )}
                {data.skills.frameworks?.length > 0 && (
                  <div>
                    <span className='font-bold text-slate-900 block text-[11px] uppercase tracking-wide text-slate-600'>
                      {catCfg.skillLabels.frameworks}:
                    </span>
                    <span className='text-slate-800 font-medium'>{data.skills.frameworks.join(' • ')}</span>
                  </div>
                )}
                {data.skills.databases?.length > 0 && (
                  <div>
                    <span className='font-bold text-slate-900 block text-[11px] uppercase tracking-wide text-slate-600'>
                      {catCfg.skillLabels.databases}:
                    </span>
                    <span className='text-slate-800 font-medium'>{data.skills.databases.join(' • ')}</span>
                  </div>
                )}
                {data.skills.tools?.length > 0 && (
                  <div>
                    <span className='font-bold text-slate-900 block text-[11px] uppercase tracking-wide text-slate-600'>
                      {catCfg.skillLabels.tools}:
                    </span>
                    <span className='text-slate-800 font-medium'>{data.skills.tools.join(' • ')}</span>
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
              <SectionHeading title={catCfg.projectLabels.sectionTitle.toUpperCase()} />
              <div className='space-y-2'>
                {data.projects.map((proj, pIdx) => (
                  <div key={proj.id || pIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div className='flex items-center gap-2'>
                        <span className='font-bold text-[13px] text-slate-950'>{proj.title}</span>
                        <VerificationBadge status={proj.verificationStatus} />
                      </div>
                      <div className='flex items-center gap-3 text-[10.5px] font-medium'>
                        {formatHref(proj.repositoryUrl, 'web') && (
                          <a
                            href={formatHref(proj.repositoryUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-slate-800 hover:underline'
                          >
                            [Repository]
                          </a>
                        )}
                        {formatHref(proj.liveDemoUrl, 'web') && (
                          <a
                            href={formatHref(proj.liveDemoUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-blue-700 hover:underline font-bold'
                          >
                            [Dashboard Demo ↗]
                          </a>
                        )}
                      </div>
                    </div>

                    {proj.techStack?.length > 0 && (
                      <p className='text-[11px] text-slate-600 italic'>
                        Key Tools: {proj.techStack.join(', ')}
                      </p>
                    )}

                    {proj.bullets?.length > 0 && (
                      <ul className='mt-1 space-y-1 text-[11.5px] text-slate-800 list-disc list-inside'>
                        {proj.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='group'>
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
                                className='text-[11.5px] text-slate-800'
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

        const renderEducation = () => {
          if (!data.education?.length) return null;
          return (
            <section key='education' className='mb-3'>
              <SectionHeading title='EDUCATION & CREDENTIALS' />
              <div className='space-y-2'>
                {data.education.map((edu, eIdx) => (
                  <div key={edu.id || eIdx} className='flex justify-between items-baseline page-break-inside-avoid'>
                    <div>
                      <h3 className='font-bold text-[12.5px] text-slate-950'>{edu.degree}</h3>
                      <p className='text-[11.5px] text-slate-700'>{edu.institution}</p>
                    </div>
                    <div className='text-right text-[11px] text-slate-600'>
                      {edu.score && (
                        <span className='font-bold text-slate-800 mr-2'>
                          Score: {edu.score}
                        </span>
                      )}
                      <span>
                        {edu.startYear ? `${edu.startYear} - ` : ''}
                        {edu.endYear || 'Present'}
                      </span>
                    </div>
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
              <SectionHeading title='WORK EXPERIENCE' />
              <div className='space-y-2'>
                {data.experience.map((exp, xIdx) => (
                  <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div>
                        <h3 className='font-bold text-[13px] text-slate-950'>{exp.role}</h3>
                        <p className='text-[11.5px] text-slate-700 font-medium'>{exp.organization}</p>
                      </div>
                      <span className='text-[11px] text-slate-600'>
                        {exp.startDate} - {exp.endDate || 'Present'}
                      </span>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className='mt-1 space-y-1 text-[11.5px] text-slate-800 list-disc list-inside'>
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
              <SectionHeading title='PROFESSIONAL CERTIFICATIONS' />
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px]'>
                {data.certifications.map((cert, cIdx) => (
                  <div key={cert.id || cIdx} className='flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 page-break-inside-avoid'>
                    <div>
                      <span className='font-bold text-slate-900 block'>{cert.title}</span>
                      <span className='text-[10.5px] text-slate-600'>{cert.issuer}</span>
                    </div>
                    {formatHref(cert.credentialUrl, 'web') && (
                      <a
                        href={formatHref(cert.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-[10px] font-bold text-blue-700 hover:underline'
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
            <section key='events' className='mb-3'>
              <SectionHeading title='WORKSHOPS, HACKATHONS & EVENTS' />
              <div className='space-y-2 text-[11.5px]'>
                {data.events.map((evt, eIdx) => (
                  <div key={evt.id || eIdx} className='p-2.5 rounded bg-slate-50 border border-slate-200 page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div>
                        <div className='flex items-center gap-2'>
                          <span className='font-bold text-slate-900'>{evt.title}</span>
                          {evt.eventType && (
                            <span className='text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-800'>
                              {evt.eventType}
                            </span>
                          )}
                        </div>
                        {(evt.organizer || evt.location) && (
                          <span className='text-[10.5px] text-slate-600 block mt-0.5'>
                            {[evt.organizer, evt.location].filter(Boolean).join(' • ')}
                          </span>
                        )}
                      </div>
                      <div className='flex items-center gap-2'>
                        {evt.date && <span className='text-[10.5px] text-slate-500'>{evt.date}</span>}
                        {formatHref(evt.credentialUrl, 'web') && (
                          <a
                            href={formatHref(evt.credentialUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-[10px] font-bold text-blue-700 hover:underline'
                          >
                            Proof ↗
                          </a>
                        )}
                      </div>
                    </div>
                    {evt.learnings && (
                      <p className='mt-1 text-[11px] text-slate-700'>
                        <span className='font-semibold text-slate-900'>Key Learnings: </span>
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
