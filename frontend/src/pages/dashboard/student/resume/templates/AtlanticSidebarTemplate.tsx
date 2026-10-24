import {
  ExternalLink,
  Github,
  Sparkles,
  Loader2,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Globe,
} from 'lucide-react';
import type { ResumeDocument, Section } from '../types';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, AvatarPhoto, OrganizationLogoBadge } from '../ResumeCommon';

export interface TemplateProps {
  data: ResumeDocument;
  sections?: Section[];
  onUpdate?: (updated: ResumeDocument) => void;
  readOnly?: boolean;
  onEditLinks?: () => void;
  onTriggerRewrite: (
    key: string,
    section: 'bullet' | 'summary' | 'project',
    originalText: string,
    context?: string
  ) => void;
  rewritingKey: string | null;
}

export function AtlanticSidebarTemplate({
  data,
  onUpdate,
  readOnly = false,
  sections,
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
    'summary',
    'skills',
    'projects',
    'experience',
    'education',
    'certifications',
  ]);

  const githubLink = pi.links?.find(
    (l) => l.label.toLowerCase().includes('github') || l.url.includes('github')
  );
  const linkedinLink = pi.links?.find(
    (l) => l.label.toLowerCase().includes('linkedin') || l.url.includes('linkedin')
  );
  const customLinks = (pi.links || []).filter(
    (l) => l !== githubLink && l !== linkedinLink && l.url.trim().length > 0
  );

  return (
    <div className='font-sans text-slate-800 text-[12.5px] leading-relaxed max-w-[850px] mx-auto bg-white select-text shadow-sm overflow-hidden border border-slate-200 print:max-w-none print:w-full print:border-none print:shadow-none'>
      <div className='grid grid-cols-12 min-h-[900px] print:min-h-0'>
        {/* ── LEFT ACCENT SIDEBAR (Col 1-4) ─────────────────────────────────── */}
        <aside className='col-span-4 bg-[#1e2653] text-white p-6 sm:p-7 flex flex-col justify-between space-y-6 print:bg-[#1e2653] print:text-white print:p-6'>
          <div className='space-y-6'>
            {/* Top Institutional Organization Badge */}
            <OrganizationLogoBadge variant='sidebar-dark' />

            {/* Avatar & Personal Header */}
            <div className='text-center flex flex-col items-center'>
              <AvatarPhoto
                url={pi.avatarUrl}
                name={pi.fullName}
                size='lg'
                borderColor='#38bdf8'
                onEdit={onEditLinks}
                readOnly={readOnly}
                className='mb-3'
              />
              <h1 className='text-xl sm:text-2xl font-black tracking-tight text-white uppercase text-center'>
                <InlineText
                  value={pi.fullName || 'YOUR NAME'}
                  onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
                  placeholder='Full Name'
                  className='font-black tracking-tight text-white uppercase'
                />
              </h1>
              <p className='text-xs font-semibold text-sky-300 mt-1 tracking-wide text-center'>
                <InlineText
                  value={pi.headline || 'Data Scientist | Machine Learning'}
                  onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
                  placeholder='Target Role'
                  className='text-xs font-semibold text-sky-300'
                />
              </p>
            </div>

            {/* Contact Details */}
            <div className='pt-3 border-t border-white/10 space-y-2 text-[11px] text-slate-200'>
              <h3 className='text-[10px] font-black tracking-widest text-sky-400 uppercase font-mono mb-2'>
                CONTACT
              </h3>

              {pi.email && (
                <div className='flex items-center gap-2 overflow-hidden'>
                  <Mail size={12} className='text-sky-400 shrink-0' />
                  <a
                    href={formatHref(pi.email, 'email')}
                    className='truncate hover:text-white hover:underline'
                  >
                    {pi.email}
                  </a>
                </div>
              )}

              {pi.phone && (
                <div className='flex items-center gap-2'>
                  <Phone size={12} className='text-sky-400 shrink-0' />
                  <a
                    href={formatHref(pi.phone, 'whatsapp')}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='hover:text-white hover:underline'
                  >
                    {pi.phone}
                  </a>
                </div>
              )}

              {pi.location && (
                <div className='flex items-center gap-2 text-slate-300'>
                  <MapPin size={12} className='text-sky-400 shrink-0' />
                  <span>{pi.location}</span>
                </div>
              )}

              {linkedinLink && linkedinLink.url && (
                <div className='flex items-center gap-2'>
                  <Linkedin size={12} className='text-sky-400 shrink-0' />
                  <a
                    href={formatHref(linkedinLink.url, 'web')}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='hover:text-white hover:underline font-medium text-sky-200'
                  >
                    LinkedIn Profile
                  </a>
                </div>
              )}

              {githubLink && githubLink.url && (
                <div className='flex items-center gap-2'>
                  <Github size={12} className='text-sky-400 shrink-0' />
                  <a
                    href={formatHref(githubLink.url, 'web')}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='hover:text-white hover:underline font-medium'
                  >
                    GitHub Profile
                  </a>
                </div>
              )}

              {customLinks.map((link, idx) => (
                <div key={idx} className='flex items-center gap-2'>
                  <Globe size={12} className='text-sky-400 shrink-0' />
                  <a
                    href={formatHref(link.url, 'web')}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='hover:text-white hover:underline'
                  >
                    {link.label || 'Portfolio'}
                  </a>
                </div>
              ))}

              {!readOnly && onEditLinks && (
                <button
                  type='button'
                  onClick={onEditLinks}
                  className='mt-2 inline-flex items-center gap-1 text-[10.5px] font-bold text-sky-300 hover:text-white bg-white/10 px-2.5 py-1 rounded-md transition-colors print:hidden'
                >
                  ✏️ Edit Links & Photo
                </button>
              )}
            </div>

            {/* Technical Skills & Certifications Sidebar (Dynamically Reorderable) */}
            {activeOrder
              .filter((k) => k === 'skills' || k === 'certifications')
              .map((sectionKey) => {
                if (sectionKey === 'skills') {
                  return (data.skills?.languages?.length ||
                    data.skills?.frameworks?.length ||
                    data.skills?.databases?.length ||
                    data.skills?.tools?.length) ? (
                    <div key='skills' className='pt-3 border-t border-white/10 space-y-3'>
                      <h3 className='text-[10px] font-black tracking-widest text-sky-400 uppercase font-mono'>
                        SKILLS & EXPERTISE
                      </h3>

                      {data.skills?.languages?.length > 0 && (
                        <div>
                          <span className='text-[10.5px] font-bold text-slate-300 block mb-1'>Languages</span>
                          <div className='flex flex-wrap gap-1'>
                            {data.skills.languages.map((s, idx) => (
                              <span
                                key={idx}
                                className='px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white font-medium'
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {data.skills?.frameworks?.length > 0 && (
                        <div>
                          <span className='text-[10.5px] font-bold text-slate-300 block mb-1'>
                            Libraries & Tools
                          </span>
                          <div className='flex flex-wrap gap-1'>
                            {data.skills.frameworks.map((s, idx) => (
                              <span
                                key={idx}
                                className='px-1.5 py-0.5 rounded text-[10px] bg-sky-900/60 text-sky-200 font-medium'
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {data.skills?.databases?.length > 0 && (
                        <div>
                          <span className='text-[10.5px] font-bold text-slate-300 block mb-1'>Databases</span>
                          <div className='flex flex-wrap gap-1'>
                            {data.skills.databases.map((s, idx) => (
                              <span
                                key={idx}
                                className='px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white font-medium'
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {data.skills?.tools?.length > 0 && (
                        <div>
                          <span className='text-[10.5px] font-bold text-slate-300 block mb-1'>Platforms</span>
                          <div className='flex flex-wrap gap-1'>
                            {data.skills.tools.map((s, idx) => (
                              <span
                                key={idx}
                                className='px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white font-medium'
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null;
                }

                if (sectionKey === 'certifications') {
                  return data.certifications?.length > 0 ? (
                    <div key='certifications' className='pt-3 border-t border-white/10 space-y-2'>
                      <h3 className='text-[10px] font-black tracking-widest text-sky-400 uppercase font-mono'>
                        CERTIFICATIONS
                      </h3>
                      {data.certifications.map((cert, cIdx) => (
                        <div key={cert.id || cIdx} className='text-[11px] leading-snug'>
                          <span className='font-semibold text-white block'>{cert.title}</span>
                          <span className='text-slate-300 text-[10px]'>{cert.issuer}</span>
                          {cert.credentialUrl && (
                            <a
                              href={formatHref(cert.credentialUrl, 'web')}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='block text-sky-300 hover:underline text-[9.5px] mt-0.5'
                            >
                              View Credential ↗
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null;
                }

                return null;
              })}
          </div>

          <div className='text-[9.5px] text-slate-400 text-center pt-4 border-t border-white/10'>
            FlowCV • Atlantic Blue
          </div>
        </aside>

        {/* ── RIGHT MAIN BODY (Col 5-12) ────────────────────────────────────── */}
        <main className='col-span-8 p-6 sm:p-8 print:p-7 space-y-6 bg-white'>
          {activeOrder
            .filter((k) => k !== 'skills' && k !== 'certifications')
            .map((sectionKey) => {
              if (sectionKey === 'summary') {
                return data.summary ? (
                  <section key='summary' className='page-break-inside-avoid'>
                    <h2 className='text-[11px] font-black tracking-[0.16em] text-[#1e2653] uppercase border-b border-slate-200 pb-1 mb-2 font-mono'>
                      PROFILE SUMMARY
                    </h2>
                    <div className='group relative text-slate-700 text-[12px] leading-relaxed'>
                      <InlineTextarea
                        value={data.summary}
                        onChange={
                          onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                        }
                        className='text-slate-700 text-[12px]'
                      />
                      {!readOnly && (
                        <button
                          onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                          disabled={rewritingKey === 'summary'}
                          className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-indigo-600 hover:text-indigo-800 rounded bg-indigo-50 border border-indigo-200 print:hidden text-[11px] flex items-center gap-1 shadow-2xs'
                        >
                          {rewritingKey === 'summary' ? (
                            <Loader2 size={12} className='animate-spin' />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          <span>Polish</span>
                        </button>
                      )}
                    </div>
                  </section>
                ) : null;
              }

              if (sectionKey === 'projects') {
                return data.projects?.length > 0 ? (
                  <section key='projects' className='space-y-4'>
                    <h2 className='text-[11px] font-black tracking-[0.16em] text-[#1e2653] uppercase border-b border-slate-200 pb-1 mb-2 font-mono'>
                      FEATURED PROJECTS & CAPSTONES
                    </h2>
                    <div className='space-y-4'>
                      {data.projects.map((proj, pIdx) => (
                        <div key={proj.id || pIdx} className='page-break-inside-avoid'>
                          <div className='flex flex-wrap items-baseline justify-between gap-2'>
                            <div className='flex items-center gap-2'>
                              <span className='font-bold text-[13px] text-slate-900'>
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
                                  className='font-bold text-[13px] text-slate-900'
                                />
                              </span>
                              <VerificationBadge status={proj.verificationStatus} />
                            </div>

                            <div className='flex items-center gap-2 text-[10.5px] font-medium'>
                              {proj.repositoryUrl && (
                                <a
                                  href={formatHref(proj.repositoryUrl, 'web')}
                                  target='_blank'
                                  rel='noopener noreferrer'
                                  className='inline-flex items-center gap-0.5 text-[#1e2653] hover:underline'
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
                                  className='inline-flex items-center gap-0.5 text-emerald-700 hover:underline'
                                >
                                  <ExternalLink size={10} />
                                  <span>Live Demo</span>
                                </a>
                              )}
                            </div>
                          </div>

                          {proj.techStack?.length > 0 && (
                            <p className='text-[11px] text-slate-500 font-medium'>
                              <span className='font-semibold text-slate-600'>Stack:</span>{' '}
                              {proj.techStack.join(', ')}
                            </p>
                          )}

                          {proj.bullets?.length > 0 && (
                            <ul className='mt-1.5 space-y-1 text-[11.5px] text-slate-700'>
                              {proj.bullets.map((b, bIdx) => (
                                <li key={bIdx} className='group flex items-start gap-1.5'>
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
                ) : null;
              }

              if (sectionKey === 'education') {
                return data.education?.length > 0 ? (
                  <section key='education' className='space-y-2.5'>
                    <h2 className='text-[11px] font-black tracking-[0.16em] text-[#1e2653] uppercase border-b border-slate-200 pb-1 mb-2 font-mono'>
                      EDUCATION
                    </h2>
                    <div className='space-y-2.5'>
                      {data.education.map((edu, eIdx) => (
                        <div key={edu.id || eIdx} className='flex justify-between items-baseline page-break-inside-avoid'>
                          <div>
                            <h3 className='font-bold text-[12.5px] text-slate-900'>{edu.degree}</h3>
                            <p className='text-[11.5px] text-slate-600'>{edu.institution}</p>
                            {edu.score && (
                              <p className='text-[10.5px] font-medium text-slate-500'>
                                Score: {edu.score}{' '}
                                {edu.gradingSystem ? `(${edu.gradingSystem.replace('_', ' ')})` : ''}
                              </p>
                            )}
                          </div>
                          <span className='text-[10.5px] text-slate-500 font-medium'>
                            {edu.startYear ? `${edu.startYear} - ` : ''}
                            {edu.endYear || 'Present'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null;
              }

              if (sectionKey === 'experience') {
                return data.experience?.length > 0 ? (
                  <section key='experience' className='space-y-3'>
                    <h2 className='text-[11px] font-black tracking-[0.16em] text-[#1e2653] uppercase border-b border-slate-200 pb-1 mb-2 font-mono'>
                      WORK EXPERIENCE
                    </h2>
                    <div className='space-y-3'>
                      {data.experience.map((exp, xIdx) => (
                        <div key={exp.id || xIdx} className='page-break-inside-avoid'>
                          <div className='flex justify-between items-baseline'>
                            <div>
                              <h3 className='font-bold text-[12.5px] text-slate-900'>{exp.role}</h3>
                              <p className='text-[11.5px] font-medium text-[#1e2653]'>{exp.organization || exp.company}</p>
                            </div>
                            <span className='text-[10.5px] text-slate-500 font-medium'>
                              {exp.startDate} - {exp.endDate || 'Present'}
                            </span>
                          </div>
                          {exp.bullets?.length > 0 && (
                            <ul className='mt-1 space-y-1 text-[11.5px] text-slate-700'>
                              {exp.bullets.map((b, bIdx) => (
                                <li key={bIdx} className='flex items-start gap-1.5'>
                                  <span className='mt-1.5 w-1 h-1 rounded-full bg-slate-400 shrink-0' />
                                  <span>{b}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null;
              }

              return null;
            })}
        </main>
      </div>
    </div>
  );
}
