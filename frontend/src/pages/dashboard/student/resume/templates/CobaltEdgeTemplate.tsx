import { Fragment } from 'react';
import { Github, Sparkles, Loader2, Globe } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import type { SectionKey } from '../types';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, ContactLinksRow, AvatarPhoto, OrganizationLogoBadge } from '../ResumeCommon';
import type { TemplateProps } from './AtlanticSidebarTemplate';

export function CobaltEdgeTemplate({
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
    <div className='font-sans text-slate-800 text-[12.5px] leading-relaxed max-w-[820px] mx-auto bg-white p-6 sm:p-10 print:max-w-none print:w-full print:p-8 print:border-none print:shadow-none select-text border border-blue-100 shadow-xs'>
      {/* ── HEADER (Vibrant Cobalt Strip) ─────────────────────────────────── */}
      <header className='pb-4 border-b-2 border-blue-600 mb-5'>
        <div className='flex flex-row items-start justify-between gap-4'>
          <div className='text-left'>
            <h1 className='text-2xl sm:text-3xl font-black tracking-tight text-slate-950 uppercase'>
              <InlineText
                value={pi.fullName || 'YOUR NAME'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
                placeholder='Full Name'
                className='font-black tracking-tight text-slate-950 uppercase'
              />
            </h1>
            <p className='text-[13.5px] font-bold text-blue-600 mt-0.5 tracking-wide'>
              <InlineText
                value={pi.headline || 'Frontend Engineer & UI/UX Specialist'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
                placeholder='Target Headline'
                className='text-[13.5px] font-bold text-blue-600'
              />
            </p>
          </div>

          <div className='flex items-center gap-3 self-start'>
            <OrganizationLogoBadge variant='cobalt-pill' />
            {pi.avatarUrl && (
              <AvatarPhoto
                url={pi.avatarUrl}
                name={pi.fullName}
                size='md'
                borderColor='#2563eb'
                onEdit={onEditLinks}
                readOnly={readOnly}
              />
            )}
          </div>
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
        const renderSummary = () => {
          if (!data.summary) return null;
          return (
            <section key='summary' className='mb-5 page-break-inside-avoid'>
              <div className='flex items-center gap-2 mb-2'>
                <div className='w-1.5 h-4 bg-blue-600 rounded-full' />
                <h2 className='text-[11.5px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  ABOUT & CREATIVE FOCUS
                </h2>
              </div>
              <div className='group relative text-slate-700 text-[12.5px] leading-relaxed pl-3.5'>
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
                    className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-blue-600 hover:text-blue-800 rounded bg-blue-50 border border-blue-200 print:hidden text-[10px] flex items-center gap-1 shadow-2xs'
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
              <div className='flex items-center gap-2 mb-2'>
                <div className='w-1.5 h-4 bg-blue-600 rounded-full' />
                <h2 className='text-[11.5px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  TECH STACK & DESIGN SYSTEMS
                </h2>
              </div>
              <div className='space-y-2 pl-3.5'>
                {data.skills?.frameworks?.length > 0 && (
                  <div>
                    <span className='text-[11px] font-bold text-slate-500 block mb-1'>
                      Frontend & Frameworks:
                    </span>
                    <div className='flex flex-wrap gap-1.5'>
                      {data.skills.frameworks.map((s, idx) => (
                        <span
                          key={idx}
                          className='px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {data.skills?.languages?.length > 0 && (
                  <div>
                    <span className='text-[11px] font-bold text-slate-500 block mb-1'>Languages:</span>
                    <div className='flex flex-wrap gap-1.5'>
                      {data.skills.languages.map((s, idx) => (
                        <span
                          key={idx}
                          className='px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-800'
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {data.skills?.tools?.length > 0 && (
                  <div>
                    <span className='text-[11px] font-bold text-slate-500 block mb-1'>Design & Tools:</span>
                    <div className='flex flex-wrap gap-1.5'>
                      {data.skills.tools.map((s, idx) => (
                        <span
                          key={idx}
                          className='px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200'
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        };

        const renderProjects = () => {
          if (!data.projects?.length) return null;
          return (
            <section key='projects' className='mb-5'>
              <div className='flex items-center gap-2 mb-2'>
                <div className='w-1.5 h-4 bg-blue-600 rounded-full' />
                <h2 className='text-[11.5px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  FEATURED PROJECTS & LIVE APPS
                </h2>
              </div>
              <div className='space-y-3.5 pl-3.5'>
                {data.projects.map((proj, pIdx) => (
                  <div
                    key={proj.id || pIdx}
                    className='p-3.5 rounded-xl border border-blue-100/90 bg-slate-50/40 hover:bg-slate-50/80 transition-colors page-break-inside-avoid'
                  >
                    <div className='flex flex-wrap items-baseline justify-between gap-2'>
                      <div className='flex items-center gap-2'>
                        <span className='font-bold text-[13px] text-slate-900'>{proj.title}</span>
                        <VerificationBadge status={proj.verificationStatus} />
                      </div>

                      <div className='flex items-center gap-2 text-[11px] font-semibold'>
                        {proj.liveDemoUrl && (
                          <a
                            href={formatHref(proj.liveDemoUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-2xs'
                          >
                            <Globe size={11} />
                            <span>Live App</span>
                          </a>
                        )}
                        {proj.repositoryUrl && (
                          <a
                            href={formatHref(proj.repositoryUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='inline-flex items-center gap-1 text-slate-700 hover:text-black hover:underline'
                          >
                            <Github size={11} />
                            <span>Code</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {proj.techStack?.length > 0 && (
                      <p className='text-[11px] text-blue-700 font-medium mt-0.5'>
                        {proj.techStack.join(' • ')}
                      </p>
                    )}

                    {proj.bullets?.length > 0 && (
                      <ul className='mt-2 space-y-1 text-[11.5px] text-slate-700'>
                        {proj.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='flex items-start gap-1.5'>
                            <span className='mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0' />
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

        const renderEducation = () => {
          if (!data.education?.length) return null;
          return (
            <section key='education' className='mb-5'>
              <div className='flex items-center gap-2 mb-2'>
                <div className='w-1.5 h-4 bg-blue-600 rounded-full' />
                <h2 className='text-[11px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  EDUCATION
                </h2>
              </div>
              <div className='space-y-2 pl-3.5'>
                {data.education.map((edu, eIdx) => (
                  <div key={edu.id || eIdx} className='page-break-inside-avoid'>
                    <h3 className='font-bold text-[12.5px] text-slate-900'>{edu.degree}</h3>
                    <p className='text-[11.5px] text-slate-600'>{edu.institution}</p>
                    <span className='text-[10.5px] text-slate-500 font-medium'>
                      {edu.score ? `Score: ${edu.score} | ` : ''}
                      {edu.startYear ? `${edu.startYear} - ` : ''}
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
            <section key='experience' className='mb-5'>
              <div className='flex items-center gap-2 mb-2'>
                <div className='w-1.5 h-4 bg-blue-600 rounded-full' />
                <h2 className='text-[11px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  EXPERIENCE
                </h2>
              </div>
              <div className='space-y-3 pl-3.5'>
                {data.experience.map((exp, xIdx) => (
                  <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <span className='font-bold text-[12.5px] text-slate-900'>{exp.role} — {exp.organization}</span>
                      <span className='text-[10.5px] text-slate-500 font-medium'>
                        {exp.startDate} - {exp.endDate || 'Present'}
                      </span>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className='mt-1 space-y-1 text-[11px] text-slate-700'>
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
            <section key='certifications' className='mb-5'>
              <div className='flex items-center gap-2 mb-2'>
                <div className='w-1.5 h-4 bg-blue-600 rounded-full' />
                <h2 className='text-[11px] font-black tracking-wider text-slate-900 uppercase font-mono'>
                  CERTIFICATIONS
                </h2>
              </div>
              <div className='space-y-1.5 text-[11.5px] pl-3.5'>
                {data.certifications.map((cert, cIdx) => (
                  <div key={cert.id || cIdx} className='flex items-center justify-between page-break-inside-avoid'>
                    <div>
                      <span className='font-semibold text-slate-900'>{cert.title}</span>
                      <span className='text-[10.5px] text-slate-500 block'>{cert.issuer}</span>
                    </div>
                    {cert.credentialUrl && (
                      <a
                        href={formatHref(cert.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-[10.5px] font-bold text-blue-600 hover:underline'
                      >
                        Credential ↗
                      </a>
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
