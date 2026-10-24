import { Fragment } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, ContactLinksRow, AvatarPhoto, OrganizationLogoBadge } from '../ResumeCommon';
import type { SectionKey } from '../types';
import type { TemplateProps } from './AtlanticSidebarTemplate';

export function CleanSlateTemplate({
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
        <section className='mb-6 page-break-inside-avoid'>
          <h2 className='text-[11px] font-medium tracking-[0.2em] text-slate-400 uppercase mb-2'>
            About
          </h2>
          <div className='group relative text-slate-600 text-[12.5px] leading-relaxed'>
            <InlineTextarea
              value={data.summary}
              onChange={
                onUpdate && !readOnly ? (v) => onUpdate({ ...data, summary: v }) : undefined
              }
              className='text-slate-600 text-[12.5px]'
            />
            {!readOnly && (
              <button
                onClick={() => onTriggerRewrite('summary', 'summary', data.summary)}
                disabled={rewritingKey === 'summary'}
                className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-slate-600 hover:text-black rounded bg-slate-50 border border-slate-200 print:hidden text-[10px] flex items-center gap-1 shadow-2xs'
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
      ) : null,

    skills: () =>
      data.skills?.languages?.length ||
      data.skills?.frameworks?.length ||
      data.skills?.databases?.length ||
      data.skills?.tools?.length ? (
        <section className='mb-6 page-break-inside-avoid'>
          <h2 className='text-[11px] font-medium tracking-[0.2em] text-slate-400 uppercase mb-2.5'>
            Skills
          </h2>
          <div className='space-y-1.5 text-[12px] text-slate-700'>
            {data.skills?.languages?.length > 0 && (
              <div>
                <span className='font-semibold text-slate-900'>Languages: </span>
                <span>{data.skills.languages.join(' · ')}</span>
              </div>
            )}
            {data.skills?.frameworks?.length > 0 && (
              <div>
                <span className='font-semibold text-slate-900'>Frameworks: </span>
                <span>{data.skills.frameworks.join(' · ')}</span>
              </div>
            )}
            {data.skills?.databases?.length > 0 && (
              <div>
                <span className='font-semibold text-slate-900'>Databases: </span>
                <span>{data.skills.databases.join(' · ')}</span>
              </div>
            )}
            {data.skills?.tools?.length > 0 && (
              <div>
                <span className='font-semibold text-slate-900'>Tools: </span>
                <span>{data.skills.tools.join(' · ')}</span>
              </div>
            )}
          </div>
        </section>
      ) : null,

    projects: () =>
      data.projects?.length > 0 ? (
        <section className='mb-6'>
          <h2 className='text-[11px] font-medium tracking-[0.2em] text-slate-400 uppercase mb-3'>
            Projects
          </h2>
          <div className='space-y-4'>
            {data.projects.map((proj, pIdx) => (
              <div key={proj.id || pIdx} className='page-break-inside-avoid'>
                <div className='flex justify-between items-baseline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold text-[13px] text-slate-900'>{proj.title}</span>
                    <VerificationBadge status={proj.verificationStatus} />
                  </div>
                  <div className='flex items-center gap-3 text-[11px] font-medium text-slate-500'>
                    {proj.repositoryUrl && (
                      <a
                        href={formatHref(proj.repositoryUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='hover:text-black hover:underline'
                      >
                        GitHub ↗
                      </a>
                    )}
                    {proj.liveDemoUrl && (
                      <a
                        href={formatHref(proj.liveDemoUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-slate-900 hover:underline font-semibold'
                      >
                        Live Demo ↗
                      </a>
                    )}
                  </div>
                </div>

                {proj.techStack?.length > 0 && (
                  <p className='text-[11px] text-slate-500 mt-0.5'>{proj.techStack.join(' · ')}</p>
                )}

                {proj.bullets?.length > 0 && (
                  <ul className='mt-1.5 space-y-1 text-[12px] text-slate-600'>
                    {proj.bullets.map((b, bIdx) => (
                      <li key={bIdx} className='flex items-start gap-2'>
                        <span className='mt-2 w-1 h-1 rounded-full bg-slate-300 shrink-0' />
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
                            className='text-[12px] text-slate-600'
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
        <section className='mb-6'>
          <h2 className='text-[11px] font-medium tracking-[0.2em] text-slate-400 uppercase mb-3'>
            Experience
          </h2>
          <div className='space-y-4'>
            {data.experience.map((exp, expIdx) => (
              <div key={exp.id || expIdx} className='page-break-inside-avoid'>
                <div className='flex justify-between items-baseline'>
                  <h3 className='font-semibold text-[13px] text-slate-900'>
                    {exp.role} <span className='font-normal text-slate-500'>at {exp.company}</span>
                  </h3>
                  <span className='text-[11px] text-slate-400'>
                    {exp.startDate} - {exp.current ? 'Present' : exp.endDate || ''}
                  </span>
                </div>
                {exp.bullets?.length > 0 && (
                  <ul className='mt-1.5 space-y-1 text-[12px] text-slate-600'>
                    {exp.bullets.map((b, bIdx) => (
                      <li key={bIdx} className='flex items-start gap-2'>
                        <span className='mt-2 w-1 h-1 rounded-full bg-slate-300 shrink-0' />
                        <span className='flex-1'>{b}</span>
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
        <section className='mb-6'>
          <h2 className='text-[11px] font-medium tracking-[0.2em] text-slate-400 uppercase mb-2'>
            Education
          </h2>
          <div className='space-y-2'>
            {data.education.map((edu, eIdx) => (
              <div key={edu.id || eIdx} className='flex justify-between items-baseline page-break-inside-avoid'>
                <div>
                  <h3 className='font-semibold text-[12.5px] text-slate-900'>{edu.degree}</h3>
                  <p className='text-[11.5px] text-slate-500'>{edu.institution}</p>
                </div>
                <span className='text-[11px] text-slate-400'>
                  {edu.startYear ? `${edu.startYear} - ` : ''}
                  {edu.endYear || 'Present'}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null,

    certifications: () =>
      data.certifications && data.certifications.length > 0 ? (
        <section className='mb-6 page-break-inside-avoid'>
          <h2 className='text-[11px] font-medium tracking-[0.2em] text-slate-400 uppercase mb-2'>
            Certifications
          </h2>
          <div className='space-y-1.5 text-[12px] text-slate-700'>
            {data.certifications.map((cert, cIdx) => (
              <div key={cert.id || cIdx} className='flex justify-between items-baseline'>
                <div>
                  <span className='font-semibold text-slate-900'>{cert.name}</span>
                  <span className='text-slate-500'> — {cert.issuer}</span>
                </div>
                {cert.issueDate && <span className='text-[11px] text-slate-400'>{cert.issueDate}</span>}
              </div>
            ))}
          </div>
        </section>
      ) : null,
  };

  return (
    <div className='font-sans text-slate-800 text-[12.5px] leading-relaxed max-w-[820px] mx-auto bg-white p-7 sm:p-12 print:max-w-none print:w-full print:p-8 print:border-none print:shadow-none select-text border border-slate-100 shadow-xs'>
      {/* ── MINIMALIST HEADER ──────────────────────────────────────────────── */}
      <header className='pb-6 mb-6 border-b border-slate-100'>
        <OrganizationLogoBadge variant='minimal' />
        <div className='flex flex-row items-start justify-between gap-4'>
          <div className='text-left'>
            <h1 className='text-2xl sm:text-3xl font-light tracking-wide text-slate-900'>
              <InlineText
                value={pi.fullName || 'YOUR NAME'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
                placeholder='Full Name'
                className='font-light tracking-wide text-slate-900'
              />
            </h1>
            <p className='text-xs font-medium text-slate-500 mt-1 tracking-wider uppercase'>
              <InlineText
                value={pi.headline || 'Software Engineer | Python & Web Developer'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
                placeholder='Target Headline'
                className='text-xs font-medium text-slate-500 tracking-wider uppercase'
              />
            </p>
          </div>

          {pi.avatarUrl && (
            <AvatarPhoto
              url={pi.avatarUrl}
              name={pi.fullName}
              size='md'
              borderColor='#94a3b8'
              onEdit={onEditLinks}
              readOnly={readOnly}
            />
          )}
        </div>

        <div className='mt-3.5'>
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
