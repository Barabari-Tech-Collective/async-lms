import { Fragment } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import type { SectionKey } from '../types';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, ContactLinksRow, OrganizationLogoBadge } from '../ResumeCommon';
import type { TemplateProps } from './AtlanticSidebarTemplate';

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
    <div className='font-serif text-slate-900 text-[13px] leading-relaxed max-w-[820px] mx-auto bg-[#fafafa] p-6 sm:p-11 print:max-w-none print:w-full print:p-8 print:border-none print:shadow-none select-text border border-stone-200 shadow-xs'>
      {/* ── HEADER (Centered Classical) ──────────────────────────────────── */}
      <header className='text-center pb-5 mb-5 border-b border-stone-400'>
        <OrganizationLogoBadge variant='executive-seal' />
        <h1 className='text-2xl sm:text-3xl font-normal tracking-wide text-stone-950 uppercase'>
          <InlineText
            value={pi.fullName || 'YOUR NAME'}
            onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
            placeholder='Full Name'
            className='font-normal tracking-wide text-stone-950 uppercase'
          />
        </h1>
        <p className='text-xs sm:text-[13px] italic text-stone-700 mt-1 font-serif'>
          <InlineText
            value={pi.headline || 'Senior Software Engineer & Technical Lead'}
            onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
            placeholder='Executive Headline'
            className='italic text-stone-700'
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
            <section key='summary' className='mb-6 page-break-inside-avoid'>
              <h2 className='text-center text-[12px] font-bold tracking-[0.2em] text-stone-900 uppercase mb-2 font-serif'>
                Executive Profile
              </h2>
              <div className='w-12 h-0.5 bg-stone-400 mx-auto mb-3' />
              <div className='group relative text-stone-800 text-[12.5px] leading-relaxed text-justify'>
                <InlineTextarea
                  value={data.summary}
                  onChange={
                    onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                  }
                  className='text-stone-800 text-[12.5px] text-justify font-serif'
                />
                {!readOnly && (
                  <button
                    onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                    disabled={rewritingKey === 'summary'}
                    className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-stone-700 hover:text-black rounded bg-stone-100 border border-stone-300 print:hidden text-[10px] flex items-center gap-1'
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
            <section key='skills' className='mb-6 page-break-inside-avoid'>
              <h2 className='text-center text-[12px] font-bold tracking-[0.2em] text-stone-900 uppercase mb-2 font-serif'>
                Areas of Expertise & Technical Mastery
              </h2>
              <div className='w-12 h-0.5 bg-stone-400 mx-auto mb-3' />
              <div className='space-y-1.5 text-[12px] text-stone-800 font-sans'>
                {data.skills?.languages?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-semibold text-stone-900 w-36 shrink-0'>Languages:</span>
                    <span className='text-stone-700'>{data.skills.languages.join(', ')}</span>
                  </div>
                )}
                {data.skills?.frameworks?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-semibold text-stone-900 w-36 shrink-0'>Frameworks:</span>
                    <span className='text-stone-700'>{data.skills.frameworks.join(', ')}</span>
                  </div>
                )}
                {data.skills?.databases?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-semibold text-stone-900 w-36 shrink-0'>Databases:</span>
                    <span className='text-stone-700'>{data.skills.databases.join(', ')}</span>
                  </div>
                )}
                {data.skills?.tools?.length > 0 && (
                  <div className='flex items-baseline'>
                    <span className='font-semibold text-stone-900 w-36 shrink-0'>Tools & Systems:</span>
                    <span className='text-stone-700'>{data.skills.tools.join(', ')}</span>
                  </div>
                )}
              </div>
            </section>
          );
        };

        const renderProjects = () => {
          if (!data.projects?.length) return null;
          return (
            <section key='projects' className='mb-6'>
              <h2 className='text-center text-[12px] font-bold tracking-[0.2em] text-stone-900 uppercase mb-2 font-serif'>
                Selected Projects & Technical Initiatives
              </h2>
              <div className='w-12 h-0.5 bg-stone-400 mx-auto mb-4' />
              <div className='space-y-4'>
                {data.projects.map((proj, pIdx) => (
                  <div key={proj.id || pIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline border-b border-stone-200 pb-1 mb-1'>
                      <div className='flex items-center gap-2'>
                        <span className='font-bold text-[13.5px] text-stone-900'>{proj.title}</span>
                        <VerificationBadge status={proj.verificationStatus} />
                      </div>
                      <div className='flex items-center gap-3 text-[11px] font-sans font-medium text-stone-700'>
                        {proj.repositoryUrl && (
                          <a
                            href={formatHref(proj.repositoryUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='hover:underline'
                          >
                            Source Code ↗
                          </a>
                        )}
                        {proj.liveDemoUrl && (
                          <a
                            href={formatHref(proj.liveDemoUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='hover:underline font-bold text-stone-900'
                          >
                            Live Demonstration ↗
                          </a>
                        )}
                      </div>
                    </div>

                    {proj.techStack?.length > 0 && (
                      <p className='text-[11px] text-stone-600 font-sans italic mb-1.5'>
                        Technologies: {proj.techStack.join(', ')}
                      </p>
                    )}

                    {proj.bullets?.length > 0 && (
                      <ul className='space-y-1 text-[12px] text-stone-800 list-disc list-inside font-serif'>
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

        const renderEducation = () => {
          if (!data.education?.length) return null;
          return (
            <section key='education' className='mb-6'>
              <h2 className='text-center text-[12px] font-bold tracking-[0.2em] text-stone-900 uppercase mb-2 font-serif'>
                Academic Background
              </h2>
              <div className='w-12 h-0.5 bg-stone-400 mx-auto mb-3' />
              <div className='space-y-2'>
                {data.education.map((edu, eIdx) => (
                  <div key={edu.id || eIdx} className='flex justify-between items-baseline page-break-inside-avoid'>
                    <div>
                      <h3 className='font-bold text-[13px] text-stone-900'>{edu.degree}</h3>
                      <p className='text-[12px] text-stone-700 italic'>{edu.institution}</p>
                    </div>
                    <div className='text-right text-[11.5px] text-stone-600 font-sans'>
                      {edu.score && (
                        <span className='font-semibold text-stone-800 mr-2'>
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
            <section key='experience' className='mb-6'>
              <h2 className='text-center text-[12px] font-bold tracking-[0.2em] text-stone-900 uppercase mb-2 font-serif'>
                Executive Experience
              </h2>
              <div className='w-12 h-0.5 bg-stone-400 mx-auto mb-3' />
              <div className='space-y-3'>
                {data.experience.map((exp, xIdx) => (
                  <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div>
                        <h3 className='font-bold text-[13px] text-stone-900'>{exp.role}</h3>
                        <p className='text-[12px] text-stone-700 italic'>{exp.organization}</p>
                      </div>
                      <span className='text-[11px] text-stone-600 font-sans'>
                        {exp.startDate} - {exp.endDate || 'Present'}
                      </span>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className='mt-1 space-y-1 text-[12px] text-stone-800 list-disc list-inside font-serif'>
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
            <section key='certifications' className='mb-6'>
              <h2 className='text-center text-[12px] font-bold tracking-[0.2em] text-stone-900 uppercase mb-2 font-serif'>
                Professional Accreditations
              </h2>
              <div className='w-12 h-0.5 bg-stone-400 mx-auto mb-3' />
              <div className='space-y-1.5 text-[12px]'>
                {data.certifications.map((cert, cIdx) => (
                  <div key={cert.id || cIdx} className='flex justify-between items-baseline page-break-inside-avoid'>
                    <div>
                      <span className='font-semibold text-stone-900'>{cert.title}</span>
                      <span className='text-stone-600'> — {cert.issuer}</span>
                    </div>
                    {cert.credentialUrl && (
                      <a
                        href={formatHref(cert.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-[11px] text-stone-700 hover:underline font-sans'
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
