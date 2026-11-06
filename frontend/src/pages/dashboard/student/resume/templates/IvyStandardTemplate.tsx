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
      className='pb-1 mb-1.5 border-b border-black'
      style={{
        borderBottom: '1px solid #000000',
        paddingBottom: '3.5mm',
        marginBottom: '6px',
        display: 'block',
        width: '100%',
      }}
    >
      <h2
        className='text-left text-[10px] font-bold tracking-[0.04em] text-black uppercase'
        style={{
          fontSize: '10px',
          fontWeight: 'bold',
          letterSpacing: '0.04em',
          color: '#000000',
          textTransform: 'uppercase',
          lineHeight: '1.35',
          margin: 0,
          padding: 0,
          display: 'block',
        }}
      >
        {title}
      </h2>
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
  const contactItems: { label: string; href?: string; isExternal?: boolean }[] = [];

  if (pi.phone) {
    contactItems.push({
      label: pi.phone,
      href: formatHref(pi.phone, 'phone'),
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
    <div className="font-['Times_New_Roman',_Times,_Garamond,_Georgia,_serif] text-black text-[9.5px] leading-[1.32] max-w-[800px] mx-auto bg-white p-7 sm:p-9 print:max-w-none print:w-full print:p-6 print:border-none print:shadow-none select-text border border-stone-200 shadow-2xs">
      {/* ── HEADER (Exact Match to Image 2: Centered Title Case Serif, Subtitle, Contact Links) ── */}
      <header className='text-center mb-2.5'>
        <h1 className="text-[22px] sm:text-[24px] font-bold text-black font-['Times_New_Roman',_Times,_Garamond,_Georgia,_serif] tracking-normal leading-tight">
          <InlineText
            value={pi.fullName || 'Your Name'}
            onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
            placeholder='Full Name'
            className="font-bold text-black font-['Times_New_Roman',_Times,_Garamond,_Georgia,_serif] tracking-normal"
          />
        </h1>

        {pi.location && (
          <p className='text-[9.5px] text-[#1f2937] mt-0.5'>
            <InlineText
              value={pi.location}
              onChange={onUpdate && !readOnly ? (v) => upPI({ location: v }) : undefined}
              placeholder='City, State, Country'
              className='text-[#1f2937]'
            />
          </p>
        )}

        <div className='mt-0.5 flex flex-wrap items-center justify-center gap-x-2 text-[9.5px] text-[#1f2937]'>
          {contactItems.map((item, idx) => (
            <Fragment key={idx}>
              {idx > 0 && <span className='text-[#9ca3af] select-none'>|</span>}
              {item.href ? (
                <a
                  href={item.href}
                  target={item.isExternal ? '_blank' : undefined}
                  rel={item.isExternal ? 'noopener noreferrer' : undefined}
                  className='text-[#1e40af] hover:underline transition-colors'
                >
                  {item.label}
                </a>
              ) : (
                <span>{item.label}</span>
              )}
            </Fragment>
          ))}
          {!readOnly && onEditLinks && (
            <button
              type='button'
              onClick={onEditLinks}
              className='text-[9px] text-indigo-700 hover:underline print:hidden cursor-pointer ml-1 font-sans opacity-70 hover:opacity-100'
            >
              [Edit Links]
            </button>
          )}
        </div>
        <div className='w-full border-b border-black' style={{ marginTop: '3.5mm' }} />
      </header>

      {/* ── SECTIONS (Exact match to Image 2 hierarchy and font sizes) ── */}
      {(() => {
        // 1. PROFILE
        const renderSummary = () => {
          if (!data.summary) return null;
          return (
            <section key='summary' className='mb-2.5 page-break-inside-avoid'>
              <SectionHeading title='Profile' />
              <div className='group relative text-black text-[9.5px] leading-[1.35] text-justify'>
                <InlineTextarea
                  value={data.summary}
                  onChange={
                    onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                  }
                  className='text-black text-[9.5px] leading-[1.35] text-justify'
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
            <section key='education' className='mb-2.5'>
              <SectionHeading title='Education' />
              <div className='space-y-1.5'>
                {data.education.map((edu, eIdx) => (
                  <div key={edu.id || eIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <h3 className='font-bold text-[10px] text-black'>{edu.institution}</h3>
                      <span className='text-[9.5px] text-[#1f2937] italic shrink-0 ml-2'>
                        {edu.startYear ? `${edu.startYear} – ` : ''}
                        {edu.endYear || 'Present'}
                      </span>
                    </div>
                    <div className='flex justify-between items-baseline text-[9.5px] text-[#111827]'>
                      <p className='italic'>
                        {edu.degree}
                        {edu.fieldOfStudy ? `, ${edu.fieldOfStudy}` : ''}
                      </p>
                      {edu.score && (
                        <span className='font-semibold text-black text-[9.5px] shrink-0 ml-2'>
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

        // 3. PROJECTS
        const renderProjects = () => {
          if (!data.projects?.length) return null;
          return (
            <section key='projects' className='mb-2.5'>
              <SectionHeading title='Projects' />
              <div className='space-y-1.5'>
                {data.projects.map((proj, pIdx) => (
                  <div key={proj.id || pIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div className='flex items-baseline gap-1 flex-wrap'>
                        <span className='font-bold text-[10px] text-black'>{proj.title}</span>
                        {proj.techStack?.length > 0 && (
                          <span className='text-[9.5px] text-[#1f2937] italic'>
                            | {proj.techStack.join(', ')}
                          </span>
                        )}
                        {formatHref(proj.repositoryUrl, 'web') && (
                          <span className='text-[9.5px] text-[#1e40af] italic'>
                            ,{' '}
                            <a
                              href={formatHref(proj.repositoryUrl, 'web')}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='underline'
                            >
                              GitHub Link
                            </a>
                          </span>
                        )}
                        {formatHref(proj.liveDemoUrl, 'web') && (
                          <span className='text-[9.5px] text-[#1e40af] italic'>
                            ,{' '}
                            <a
                              href={formatHref(proj.liveDemoUrl, 'web')}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='underline'
                            >
                              Live Demo
                            </a>
                          </span>
                        )}
                      </div>
                    </div>

                    {proj.bullets?.length > 0 && (
                      <ul className='mt-0.5 space-y-0.5 text-[9.5px] text-black list-disc list-outside ml-4 leading-[1.3]'>
                        {proj.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='group leading-[1.3] pl-0.5'>
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
                              className='text-[9.5px] text-black'
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
            <section key='experience' className='mb-2.5'>
              <SectionHeading title='Experience' />
              <div className='space-y-1.5'>
                {data.experience.map((exp, xIdx) => (
                  <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <h3 className='font-bold text-[10px] text-black'>{exp.role}</h3>
                      <span className='text-[9.5px] text-[#1f2937] italic shrink-0 ml-2'>
                        {exp.startDate} – {exp.endDate || 'Present'}
                      </span>
                    </div>
                    {(exp.organization || exp.company || exp.location) && (
                      <div className='flex justify-between items-baseline text-[9.5px] text-[#1f2937]'>
                        <span className='italic'>{exp.company || exp.organization}</span>
                        {exp.location && <span>{exp.location}</span>}
                      </div>
                    )}
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className='mt-0.5 space-y-0.5 text-[9.5px] text-black list-disc list-outside ml-4 leading-[1.3]'>
                        {exp.bullets.map((b, bIdx) => (
                          <li key={bIdx} className='leading-[1.3] pl-0.5'>{b}</li>
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
            <section key='skills' className='mb-2.5 page-break-inside-avoid'>
              <SectionHeading title='Technical Skills' />
              <div className='space-y-0.5 text-[9.5px] text-black leading-[1.35]'>
                {data.skills?.languages?.length > 0 && (
                  <div>
                    <span className='font-bold text-black'>Languages & Core Strengths: </span>
                    <span className='text-[#111827]'>{data.skills.languages.join(', ')}</span>
                  </div>
                )}
                {data.skills?.frameworks?.length > 0 && (
                  <div>
                    <span className='font-bold text-black'>Frameworks & Libraries: </span>
                    <span className='text-[#111827]'>{data.skills.frameworks.join(', ')}</span>
                  </div>
                )}
                {data.skills?.databases?.length > 0 && (
                  <div>
                    <span className='font-bold text-black'>Databases: </span>
                    <span className='text-[#111827]'>{data.skills.databases.join(', ')}</span>
                  </div>
                )}
                {data.skills?.tools?.length > 0 && (
                  <div>
                    <span className='font-bold text-black'>Tools & Platforms: </span>
                    <span className='text-[#111827]'>{data.skills.tools.join(', ')}</span>
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
            <section key='certifications' className='mb-2.5'>
              <SectionHeading title='Certifications' />
              <ul className='space-y-0.5 text-[9.5px] text-black list-disc list-outside ml-4 leading-[1.3]'>
                {data.certifications.map((cert, cIdx) => (
                  <li key={cert.id || cIdx} className='page-break-inside-avoid pl-0.5'>
                    <span className='font-semibold text-black'>{cert.title || cert.name}</span>
                    {cert.issuer && <span className='text-[#1f2937]'> — {cert.issuer}</span>}
                    {cert.issueDate && <span className='text-[#374151]'>, {cert.issueDate}</span>}
                    {formatHref(cert.credentialUrl, 'web') && (
                      <a
                        href={formatHref(cert.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-[#1e40af] underline ml-1.5'
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
            <section key='events' className='mb-2.5'>
              <SectionHeading title='Extracurricular Activities' />
              <div className='space-y-1.5 text-[9.5px]'>
                {data.events.map((evt, vIdx) => (
                  <div key={evt.id || vIdx} className='page-break-inside-avoid'>
                    <div className='flex justify-between items-baseline'>
                      <div className='flex items-baseline gap-1'>
                        <span className='font-bold text-black'>{evt.title}</span>
                        {evt.organizer && <span className='text-[#1f2937] italic'>— {evt.organizer}</span>}
                      </div>
                      <div className='flex items-center gap-2'>
                        {evt.date && <span className='text-[9.5px] text-[#1f2937] italic'>{evt.date}</span>}
                        {formatHref(evt.credentialUrl, 'web') && (
                          <a
                            href={formatHref(evt.credentialUrl, 'web')}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-[9.5px] text-[#1e40af] underline'
                          >
                            [Credential]
                          </a>
                        )}
                      </div>
                    </div>
                    {evt.learnings && (
                      <ul className='mt-0.5 space-y-0.5 text-[9.5px] text-black list-disc list-outside ml-4 leading-[1.3]'>
                        <li className='pl-0.5'>{evt.learnings}</li>
                      </ul>
                    )}
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
