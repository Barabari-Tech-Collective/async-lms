import { Fragment } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import type { SectionKey } from '../types';
import { InlineText, InlineTextarea } from '../InlineEdit';
import type { TemplateProps } from './AtlanticSidebarTemplate';

// Exact section order matching Image 2 (Omkari Kasula):
// PROFILE -> EDUCATION -> PROJECTS -> EXPERIENCE -> TECHNICAL SKILLS -> CERTIFICATIONS -> EXTRACURRICULAR ACTIVITIES
const IVY_DEFAULT_SECTION_ORDER: SectionKey[] = [
  'summary',
  'education',
  'projects',
  'experience',
  'skills',
  'certifications',
  'events',
];

function SectionHeading({ title }: { title: string }) {
  return (
    <div
      data-section-heading=''
      style={{
        display: 'block',
        width: '100%',
        marginBottom: '4px',
      }}
    >
      <h2
        className='text-left text-[13.5px] font-bold tracking-[0.03em] text-slate-950 uppercase font-sans'
        style={{
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          fontSize: '13.5px',
          fontWeight: 'bold',
          letterSpacing: '0.03em',
          color: '#020617',
          textTransform: 'uppercase',
          lineHeight: '1.25',
          margin: 0,
          padding: 0,
          display: 'block',
        }}
      >
        {title}
      </h2>
      <div
        data-heading-line=''
        style={{
          display: 'block',
          width: '100%',
          height: '0px',
          borderTop: '1px solid #020617',
          marginTop: '6px',
          marginBottom: '8px',
        }}
      />
    </div>
  );
}

export function IvyStandardTemplate({
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

  const activeOrder = getResolvedSectionOrder(sections, data.sectionOrder, IVY_DEFAULT_SECTION_ORDER);

  // Collect contact items: Phone | Email | LinkedIn | GitHub | Portfolio
  const contactItems: { label: string; href?: string; isExternal?: boolean; isPhone?: boolean }[] = [];

  if (pi.phone) {
    contactItems.push({
      label: pi.phone,
      isPhone: true,
    });
  }

  if (pi.email) {
    contactItems.push({
      label: pi.email,
      href: formatHref(pi.email, 'email'),
    });
  }

  if (pi.links && pi.links.length > 0) {
    pi.links.forEach((l) => {
      if (l.url) {
        contactItems.push({
          label: l.label || 'Link',
          href: formatHref(l.url, 'web'),
          isExternal: true,
        });
      }
    });
  }

  return (
    <div className='font-sans [font-variant-numeric:lining-nums] text-slate-900 text-[11px] leading-[1.48] max-w-[800px] mx-auto bg-white p-7 sm:p-9 print:max-w-none print:w-full print:p-6 print:border-none print:shadow-none select-text border border-stone-200 shadow-2xs'>
      {/* ── HEADER (Centered Small-Caps / Uppercase, Subtitle, Clean Contact Links) ── */}
      <header className='text-center mb-3.5'>
        <h1
          className='text-[26px] sm:text-[28px] font-bold text-black font-sans tracking-[0.02em] leading-tight uppercase'
          style={{
            color: '#020617',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          <InlineText
            value={pi.fullName || 'Your Name'}
            onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
            placeholder='Full Name'
            className='font-bold text-black font-sans tracking-[0.02em] uppercase'
            style={{ color: '#020617' }}
          />
        </h1>

        {pi.headline && (
          <p
            className='text-[12px] font-semibold text-black tracking-wider uppercase mt-1'
            style={{ color: '#334155' }}
          >
            <InlineText
              value={pi.headline}
              onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
              placeholder='Target Role'
              className='text-black font-semibold uppercase'
              style={{ color: '#334155' }}
            />
          </p>
        )}

        {pi.location && (
          <p
            className='text-[11px] text-black mt-0.5 font-sans'
            style={{ color: '#475569' }}
          >
            <InlineText
              value={pi.location}
              onChange={onUpdate && !readOnly ? (v) => upPI({ location: v }) : undefined}
              placeholder='City, State, Country'
              className='text-black'
              style={{ color: '#475569' }}
            />
          </p>
        )}

        <div
          className='mt-1 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11px] text-black font-sans [font-variant-numeric:lining-nums]'
          style={{ color: '#0f172a' }}
        >
          {contactItems.map((item, idx) => (
            <Fragment key={idx}>
              {idx > 0 && <span style={{ color: '#94a3b8' }} className='select-none'>•</span>}
              {item.isPhone ? (
                <span style={{ color: '#0f172a' }} className='font-normal tracking-wide'>{item.label}</span>
              ) : item.href ? (
                <a
                  href={item.href}
                  target={item.isExternal ? '_blank' : undefined}
                  rel={item.isExternal ? 'noopener noreferrer' : undefined}
                  style={{ color: '#0f172a' }}
                  className='hover:underline underline-offset-2 transition-colors'
                >
                  {item.label}
                </a>
              ) : (
                <span style={{ color: '#0f172a' }}>{item.label}</span>
              )}
            </Fragment>
          ))}
          {!readOnly && onEditLinks && (
            <button
              type='button'
              onClick={onEditLinks}
              style={{ color: '#64748b' }}
              className='text-[9.5px] hover:underline print:hidden cursor-pointer ml-1.5 font-sans opacity-75 hover:opacity-100 transition-opacity'
            >
              [Edit Links]
            </button>
          )}
        </div>
      </header>

      {/* ── SECTIONS (Exact match to Omkari Kasula hierarchy, font sizes and styling) ── */}
      {(() => {
        // 1. PROFILE
        const renderSummary = () => {
          if (!data.summary) return null;
          return (
            <section key='summary' className='mb-3.5 page-break-inside-avoid'>
              <SectionHeading title='Profile' />
              <div className='group relative text-black text-[11px] leading-[1.48] text-justify'>
                <InlineTextarea
                  value={data.summary}
                  onChange={
                    onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                  }
                  className='text-black text-[11px] leading-[1.48] text-justify'
                />
                {!readOnly && onTriggerRewrite && (
                  <button
                    onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                    disabled={rewritingKey === 'summary'}
                    className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-stone-700 hover:text-black rounded bg-stone-100 border border-stone-300 print:hidden text-[9px] flex items-center gap-1 cursor-pointer font-sans'
                  >
                    {rewritingKey === 'summary' ? (
                      <Loader2 size={10} className='animate-spin' />
                    ) : (
                      <Sparkles size={10} />
                    )}
                    <span>Refine</span>
                  </button>
                )}
              </div>
            </section>
          );
        };

        // 2. EDUCATION
        const renderEducation = () => {
          if (!data.education?.length) return null;
          return (
            <section key='education' className='mb-3.5'>
              <SectionHeading title='Education' />
              <div className='space-y-1.5'>
                {data.education.map((edu, eIdx) => (
                  <div key={edu.id || eIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <h3 className='font-bold text-[12px] text-black'>{edu.institution}</h3>
                      <span className='text-[11px] text-black shrink-0 ml-2 font-normal'>
                        {edu.startYear ? `${edu.startYear} – ` : ''}
                        {edu.endYear || 'Present'}
                      </span>
                    </div>
                    <div className='flex justify-between items-baseline text-[11px] text-black'>
                      <p className='italic'>
                        {edu.degree}
                        {edu.fieldOfStudy ? `, ${edu.fieldOfStudy}` : ''}
                      </p>
                      {edu.score && (
                        <span className='italic text-black text-[11px] shrink-0 ml-2'>
                          {String(edu.score).toLowerCase().includes('cgpa') || String(edu.score).toLowerCase().includes('score')
                            ? edu.score
                            : `CGPA: ${edu.score}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        };

        // 3. PROJECTS
        const renderProjects = () => {
          if (!data.projects?.length) return null;
          return (
            <section key='projects' className='mb-3.5'>
              <SectionHeading title='Projects' />
              <div className='space-y-1.5'>
                {data.projects.map((proj, pIdx) => (
                  <div key={proj.id || pIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div className='flex items-baseline gap-1 flex-wrap'>
                        <span className='font-bold text-[12px] text-black'>{proj.title}</span>
                        {proj.techStack?.length > 0 && (
                          <span className='text-[11px] text-black italic'>
                            {' | '}
                            {proj.techStack.join(', ')}
                          </span>
                        )}
                        {formatHref(proj.repositoryUrl, 'web') && (
                          <span className='text-[11px] ml-1.5'>
                            <a
                              href={formatHref(proj.repositoryUrl, 'web')}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='text-slate-700 hover:text-slate-950 underline underline-offset-2 decoration-slate-300 hover:decoration-slate-900 font-medium transition-colors'
                            >
                              GitHub Link
                            </a>
                          </span>
                        )}
                        {formatHref(proj.liveDemoUrl, 'web') && (
                          <span className='text-[11px] ml-1.5'>
                            <a
                              href={formatHref(proj.liveDemoUrl, 'web')}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='text-slate-700 hover:text-slate-950 underline underline-offset-2 decoration-slate-300 hover:decoration-slate-900 font-medium transition-colors'
                            >
                              Live Demo
                            </a>
                          </span>
                        )}
                      </div>
                    </div>

                    {proj.bullets?.length > 0 && (
                      <ul className='mt-0.5 space-y-0.5 text-[11px] text-black list-disc list-outside ml-4 leading-[1.48]'>
                        {proj.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='group leading-[1.48] pl-0.5'>
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
                              className='text-[11px] text-black'
                            />
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

        // 4. EXPERIENCE
        const renderExperience = () => {
          if (!data.experience?.length) return null;
          return (
            <section key='experience' className='mb-3.5'>
              <SectionHeading title='Experience' />
              <div className='space-y-1.5'>
                {data.experience.map((exp, xIdx) => (
                  <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <h3 className='font-bold text-[12px] text-black'>{exp.role}</h3>
                      <span className='text-[11px] text-black shrink-0 ml-2 font-normal'>
                        {exp.startDate} – {exp.endDate || 'Present'}
                      </span>
                    </div>
                    {(exp.organization || exp.company || exp.location) && (
                      <div className='flex justify-between items-baseline text-[11px] text-black'>
                        <span className='italic'>{exp.company || exp.organization}</span>
                        {exp.location && <span className='italic'>{exp.location}</span>}
                      </div>
                    )}
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className='mt-0.5 space-y-0.5 text-[11px] text-black list-disc list-outside ml-4 leading-[1.48]'>
                        {exp.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='leading-[1.48] pl-0.5'>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        };

        // 5. TECHNICAL SKILLS
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
            <section key='skills' className='mb-3.5 page-break-inside-avoid'>
              <SectionHeading title='Technical Skills' />
              <div className='space-y-0.5 text-[11px] text-black leading-[1.48]'>
                {data.skills?.languages?.length > 0 && (
                  <div>
                    <span className='font-bold text-black'>Languages & Core Strengths: </span>
                    <span className='text-black'>{data.skills.languages.join(', ')}</span>
                  </div>
                )}
                {data.skills?.frameworks?.length > 0 && (
                  <div>
                    <span className='font-bold text-black'>Frameworks & Libraries: </span>
                    <span className='text-black'>{data.skills.frameworks.join(', ')}</span>
                  </div>
                )}
                {data.skills?.databases?.length > 0 && (
                  <div>
                    <span className='font-bold text-black'>Databases: </span>
                    <span className='text-black'>{data.skills.databases.join(', ')}</span>
                  </div>
                )}
                {data.skills?.tools?.length > 0 && (
                  <div>
                    <span className='font-bold text-black'>Tools & Platforms: </span>
                    <span className='text-black'>{data.skills.tools.join(', ')}</span>
                  </div>
                )}
              </div>
            </section>
          );
        };

        // 6. CERTIFICATIONS
        const renderCertifications = () => {
          if (!data.certifications?.length) return null;
          return (
            <section key='certifications' className='mb-3.5'>
              <SectionHeading title='Certifications' />
              <ul className='space-y-0.5 text-[11px] text-black list-disc list-outside ml-4 leading-[1.48]'>
                {data.certifications.map((cert, cIdx) => (
                  <li key={cert.id || cIdx} className='page-break-inside-avoid pl-0.5'>
                    <span className='font-bold text-black'>{cert.title || cert.name}</span>
                    {cert.issuer && <span className='text-black'> — {cert.issuer}</span>}
                    {cert.issueDate && <span className='text-black'>, {cert.issueDate}</span>}
                    {formatHref(cert.credentialUrl, 'web') && (
                      <a
                        href={formatHref(cert.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-slate-700 hover:text-slate-950 underline underline-offset-2 decoration-slate-300 hover:decoration-slate-900 font-medium ml-1.5 transition-colors'
                      >
                        [Credential]
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        };

        // 7. EXTRACURRICULAR ACTIVITIES
        const renderEvents = () => {
          if (!data.events?.length) return null;
          return (
            <section key='events' className='mb-3.5'>
              <SectionHeading title='Extracurricular Activities' />
              <div className='space-y-1.5 text-[11px]'>
                {data.events.map((evt, vIdx) => (
                  <div key={evt.id || vIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div className='flex items-baseline gap-1'>
                        <span className='font-bold text-black'>{evt.title}</span>
                        {evt.organizer && <span className='text-black italic'>— {evt.organizer}</span>}
                      </div>
                      <div className='flex items-center gap-2'>
                        {evt.date && <span className='text-[11px] text-black font-normal'>{evt.date}</span>}
                        {formatHref(evt.credentialUrl, 'web') && (
                          <a
                            href={formatHref(evt.credentialUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-slate-700 hover:text-slate-950 underline underline-offset-2 decoration-slate-300 hover:decoration-slate-900 font-medium ml-1 transition-colors'
                          >
                            [Link]
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        };

        const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
          summary: renderSummary,
          education: renderEducation,
          projects: renderProjects,
          experience: renderExperience,
          skills: renderSkills,
          certifications: renderCertifications,
          events: renderEvents,
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
