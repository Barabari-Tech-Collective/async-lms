import { Fragment } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, ContactLinksRow, OrganizationLogoBadge } from '../ResumeCommon';
import type { SectionKey } from '../types';
import type { TemplateProps } from './AtlanticSidebarTemplate';

export function EditorialRuleTemplate({
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

  const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
    summary: () =>
      data.summary ? (
        <section className='mb-5 page-break-inside-avoid'>
          <div className='border-l-4 border-amber-800 pl-4 py-1'>
            <div className='group relative text-slate-800 text-[12.5px] leading-relaxed font-serif italic'>
              <InlineTextarea
                value={data.summary}
                onChange={
                  onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
                }
                className='text-slate-800 text-[12.5px] font-serif italic'
              />
              {!readOnly && (
                <button
                  onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                  disabled={rewritingKey === 'summary'}
                  className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-amber-800 hover:text-black rounded bg-amber-50 border border-amber-200 print:hidden text-[10px] flex items-center gap-1 not-italic'
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
      ) : null,

    skills: () =>
      data.skills?.languages?.length ||
      data.skills?.frameworks?.length ||
      data.skills?.databases?.length ||
      data.skills?.tools?.length ? (
        <section className='mb-5 page-break-inside-avoid'>
          <h2 className='text-[11.5px] font-black tracking-widest text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-2 font-mono'>
            TECHNICAL & STRATEGIC TOOLKIT
          </h2>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]'>
            {data.skills.languages?.length > 0 && (
              <div>
                <span className='font-bold text-slate-900'>Languages: </span>
                <span className='text-slate-700'>{data.skills.languages.join(', ')}</span>
              </div>
            )}
            {data.skills.frameworks?.length > 0 && (
              <div>
                <span className='font-bold text-slate-900'>Frameworks: </span>
                <span className='text-slate-700'>{data.skills.frameworks.join(', ')}</span>
              </div>
            )}
            {data.skills.databases?.length > 0 && (
              <div>
                <span className='font-bold text-slate-900'>Databases: </span>
                <span className='text-slate-700'>{data.skills.databases.join(', ')}</span>
              </div>
            )}
            {data.skills.tools?.length > 0 && (
              <div>
                <span className='font-bold text-slate-900'>Analytics & PM Tools: </span>
                <span className='text-slate-700'>{data.skills.tools.join(', ')}</span>
              </div>
            )}
          </div>
        </section>
      ) : null,

    projects: () =>
      data.projects?.length > 0 ? (
        <section className='mb-5'>
          <h2 className='text-[11.5px] font-black tracking-widest text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-3 font-mono'>
            INITIATIVES & DELIVERABLES
          </h2>
          <div className='space-y-4'>
            {data.projects.map((proj, pIdx) => (
              <div key={proj.id || pIdx} className='page-break-inside-avoid relative pl-4 border-l-2 border-amber-800/40'>
                <div className='absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-amber-800' />
                <div className='flex justify-between items-baseline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-bold text-[13px] text-slate-950'>{proj.title}</span>
                    <VerificationBadge status={proj.verificationStatus} />
                  </div>
                  <div className='flex items-center gap-2 text-[10.5px] font-medium'>
                    {proj.repositoryUrl && (
                      <a
                        href={formatHref(proj.repositoryUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-slate-700 hover:underline'
                      >
                        [Repository]
                      </a>
                    )}
                    {proj.liveDemoUrl && (
                      <a
                        href={formatHref(proj.liveDemoUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-amber-900 hover:underline font-bold'
                      >
                        [Interactive Demo ↗]
                      </a>
                    )}
                  </div>
                </div>

                {proj.techStack?.length > 0 && (
                  <p className='text-[11px] text-slate-500 font-medium'>
                    Scope: {proj.techStack.join(', ')}
                  </p>
                )}

                {proj.bullets?.length > 0 && (
                  <ul className='mt-1.5 space-y-1 text-[11.5px] text-slate-800'>
                    {proj.bullets.map((b, bIdx) => (
                      <li key={bIdx} className='group flex items-start gap-1.5'>
                        <span className='mt-1.5 w-1 h-1 rounded-full bg-slate-500 shrink-0' />
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
                            className='text-[11.5px] text-slate-800'
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
      ) : null,

    experience: () =>
      data.experience && data.experience.length > 0 ? (
        <section className='mb-5'>
          <h2 className='text-[11.5px] font-black tracking-widest text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-3 font-mono'>
            PROFESSIONAL EXPERIENCE
          </h2>
          <div className='space-y-4'>
            {data.experience.map((exp, expIdx) => (
              <div key={exp.id || expIdx} className='page-break-inside-avoid relative pl-4 border-l-2 border-amber-800/40'>
                <div className='absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-amber-800' />
                <div className='flex justify-between items-baseline'>
                  <h3 className='font-bold text-[13px] text-slate-950'>
                    {exp.role} <span className='font-normal text-slate-600'>· {exp.company}</span>
                  </h3>
                  <span className='text-[10.5px] text-slate-500'>
                    {exp.startDate} - {exp.current ? 'Present' : exp.endDate || ''}
                  </span>
                </div>
                {exp.bullets?.length > 0 && (
                  <ul className='mt-1.5 space-y-1 text-[11.5px] text-slate-800'>
                    {exp.bullets.map((b, bIdx) => (
                      <li key={bIdx} className='flex items-start gap-1.5'>
                        <span className='mt-1.5 w-1 h-1 rounded-full bg-slate-500 shrink-0' />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null,

    education: () =>
      data.education?.length > 0 ? (
        <section className='mb-5'>
          <h2 className='text-[11.5px] font-black tracking-widest text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-2 font-mono'>
            EDUCATION
          </h2>
          <div className='space-y-2'>
            {data.education.map((edu, eIdx) => (
              <div key={edu.id || eIdx} className='page-break-inside-avoid'>
                <h3 className='font-bold text-[12.5px] text-slate-900'>{edu.degree}</h3>
                <p className='text-[11.5px] text-slate-600'>{edu.institution}</p>
                <span className='text-[10.5px] text-slate-500'>
                  {edu.startYear ? `${edu.startYear} - ` : ''}
                  {edu.endYear || 'Present'}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null,

    certifications: () =>
      data.certifications?.length > 0 ? (
        <section className='mb-5'>
          <h2 className='text-[11.5px] font-black tracking-widest text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-2 font-mono'>
            CERTIFICATIONS
          </h2>
          <div className='space-y-1.5 text-[11.5px]'>
            {data.certifications.map((cert, cIdx) => (
              <div key={cert.id || cIdx} className='flex items-center justify-between page-break-inside-avoid'>
                <div>
                  <span className='font-semibold text-slate-900'>{cert.title || cert.name}</span>
                  <span className='text-[10.5px] text-slate-500 block'>{cert.issuer}</span>
                </div>
                {cert.credentialUrl && (
                  <a
                    href={formatHref(cert.credentialUrl, 'web')}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-[10.5px] font-bold text-amber-800 hover:underline'
                  >
                    Verify ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null,
  };

  return (
    <div className='font-sans text-slate-900 text-[12.5px] leading-relaxed max-w-[820px] mx-auto bg-white p-6 sm:p-10 print:max-w-none print:w-full print:p-8 print:border-none print:shadow-none select-text border-t-4 border-t-amber-800 border-x border-b border-slate-200 shadow-xs'>
      {/* ── EDITORIAL HEADER ───────────────────────────────────────────────── */}
      <header className='pb-4 border-b-2 border-slate-900 mb-5 flex flex-row justify-between items-end gap-3'>
        <div>
          <OrganizationLogoBadge variant='editorial' />
          <h1 className='text-2xl sm:text-3xl font-black tracking-tight text-slate-950 uppercase'>
            <InlineText
              value={pi.fullName || 'YOUR NAME'}
              onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
              placeholder='Full Name'
              className='font-black tracking-tight text-slate-950 uppercase'
            />
          </h1>
          <p className='text-xs font-bold text-slate-700 tracking-wide mt-0.5'>
            <InlineText
              value={pi.headline || 'Product Manager & Analytics Strategist'}
              onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
              placeholder='Target Headline'
              className='text-xs font-bold text-slate-700'
            />
          </p>
        </div>

        <div className='text-right'>
          <ContactLinksRow
            personalInfo={pi}
            variant='light'
            onEditLinks={onEditLinks}
            readOnly={readOnly}
          />
        </div>
      </header>

      {/* ── DYNAMIC SECTIONS ────────────────────────────────────────────────── */}
      {activeOrder.map((sectionKey) => {
        const renderer = sectionRenderers[sectionKey];
        return renderer ? <Fragment key={sectionKey}>{renderer()}</Fragment> : null;
      })}
    </div>
  );
}
