import { Fragment } from 'react';
import { ExternalLink, Github, Sparkles, Loader2 } from 'lucide-react';
import { formatHref, getResolvedSectionOrder } from '../resumeUtils';
import { InlineText, InlineTextarea } from '../InlineEdit';
import { VerificationBadge, ContactLinksRow, AvatarPhoto, OrganizationLogoBadge } from '../ResumeCommon';
import type { SectionKey } from '../types';
import type { TemplateProps } from './AtlanticSidebarTemplate';

export function PhotoModernTemplate({
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
          <h2 className='text-[11.5px] font-black tracking-widest text-teal-800 uppercase border-b-2 border-teal-600 pb-1 mb-2 font-mono'>
            PROFESSIONAL OVERVIEW
          </h2>
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
                className='opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0 p-1 text-teal-700 hover:text-teal-900 rounded bg-teal-50 border border-teal-200 print:hidden text-[10.5px] flex items-center gap-1 shadow-2xs'
              >
                {rewritingKey === 'summary' ? (
                  <Loader2 size={11} className='animate-spin' />
                ) : (
                  <Sparkles size={11} />
                )}
                <span>Rewrite</span>
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
          <h2 className='text-[11.5px] font-black tracking-widest text-teal-800 uppercase border-b-2 border-teal-600 pb-1 mb-2.5 font-mono'>
            CORE EXPERTISE
          </h2>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] bg-slate-50/70 p-3 rounded-lg border border-slate-200'>
            {data.skills?.languages?.length > 0 && (
              <div>
                <span className='font-bold block text-[11px] text-teal-900'>
                  Languages:
                </span>
                <span className='text-slate-700'>{data.skills.languages.join(', ')}</span>
              </div>
            )}
            {data.skills?.frameworks?.length > 0 && (
              <div>
                <span className='font-bold block text-[11px] text-teal-900'>
                  Frameworks:
                </span>
                <span className='text-slate-700'>{data.skills.frameworks.join(', ')}</span>
              </div>
            )}
            {data.skills?.databases?.length > 0 && (
              <div>
                <span className='font-bold block text-[11px] text-teal-900'>
                  Databases:
                </span>
                <span className='text-slate-700'>{data.skills.databases.join(', ')}</span>
              </div>
            )}
            {data.skills?.tools?.length > 0 && (
              <div>
                <span className='font-bold block text-[11px] text-teal-900'>
                  Cloud & Tools:
                </span>
                <span className='text-slate-700'>{data.skills.tools.join(', ')}</span>
              </div>
            )}
          </div>
        </section>
      ) : null,

    projects: () =>
      data.projects?.length > 0 ? (
        <section className='mb-6'>
          <h2 className='text-[11.5px] font-black tracking-widest text-teal-800 uppercase border-b-2 border-teal-600 pb-1 mb-3 font-mono'>
            KEY PROJECTS & DEPLOYMENTS
          </h2>
          <div className='space-y-4'>
            {data.projects.map((proj, pIdx) => (
              <div key={proj.id || pIdx} className='border-l-2 border-teal-600 pl-3 py-0.5 page-break-inside-avoid'>
                <div className='flex justify-between items-baseline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-bold text-[13px] text-slate-900'>{proj.title}</span>
                    <VerificationBadge status={proj.verificationStatus} />
                  </div>
                  <div className='flex items-center gap-2 text-[11px] font-medium'>
                    {proj.repositoryUrl && (
                      <a
                        href={formatHref(proj.repositoryUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-slate-700 hover:text-black hover:underline flex items-center gap-0.5'
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
                        className='text-teal-700 hover:underline font-bold flex items-center gap-0.5'
                      >
                        <ExternalLink size={11} />
                        <span>Demo ↗</span>
                      </a>
                    )}
                  </div>
                </div>

                {proj.techStack?.length > 0 && (
                  <p className='text-[11px] text-slate-500 font-medium'>
                    Tech: {proj.techStack.join(', ')}
                  </p>
                )}

                {proj.bullets?.length > 0 && (
                  <ul className='mt-1.5 space-y-1 text-[11.5px] text-slate-700'>
                    {proj.bullets.map((b, bIdx) => (
                      <li key={bIdx} className='flex items-start gap-1.5'>
                        <span className='mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0' />
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

    experience: () =>
      data.experience && data.experience.length > 0 ? (
        <section className='mb-6'>
          <h2 className='text-[11.5px] font-black tracking-widest text-teal-800 uppercase border-b-2 border-teal-600 pb-1 mb-3 font-mono'>
            PROFESSIONAL EXPERIENCE
          </h2>
          <div className='space-y-4'>
            {data.experience.map((exp, expIdx) => (
              <div key={exp.id || expIdx} className='border-l-2 border-teal-600 pl-3 py-0.5 page-break-inside-avoid'>
                <div className='flex justify-between items-baseline'>
                  <h3 className='font-bold text-[13px] text-slate-900'>
                    {exp.role} <span className='font-normal text-slate-600'>at {exp.company}</span>
                  </h3>
                  <span className='text-[10.5px] text-slate-500'>
                    {exp.startDate} - {exp.current ? 'Present' : exp.endDate || ''}
                  </span>
                </div>
                {exp.bullets?.length > 0 && (
                  <ul className='mt-1.5 space-y-1 text-[11.5px] text-slate-700'>
                    {exp.bullets.map((b, bIdx) => (
                      <li key={bIdx} className='flex items-start gap-1.5'>
                        <span className='mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0' />
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
        <section className='mb-6'>
          <h2 className='text-[11.5px] font-black tracking-widest text-teal-800 uppercase border-b-2 border-teal-600 pb-1 mb-2 font-mono'>
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

    events: () =>
      data.events && data.events.length > 0 ? (
        <section className='mb-6'>
          <h2 className='text-[11.5px] font-black tracking-widest text-teal-800 uppercase border-b-2 border-teal-600 pb-1 mb-2 font-mono'>
            WORKSHOPS & EVENTS
          </h2>
          <div className='space-y-3'>
            {data.events.map((evt, eIdx) => (
              <div key={evt.id || eIdx} className='page-break-inside-avoid text-[12px]'>
                <div className='flex justify-between items-baseline'>
                  <div>
                    <div className='flex items-center gap-2'>
                      <span className='font-bold text-slate-900'>{evt.title}</span>
                      {evt.eventType && (
                        <span className='text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200'>
                          {evt.eventType}
                        </span>
                      )}
                    </div>
                    {(evt.organizer || evt.location) && (
                      <span className='text-[11px] text-teal-800 font-medium block mt-0.5'>
                        {[evt.organizer, evt.location].filter(Boolean).join(' • ')}
                      </span>
                    )}
                  </div>
                  <div className='flex items-center gap-2'>
                    {evt.date && <span className='text-[11px] text-slate-500 font-medium'>{evt.date}</span>}
                    {evt.credentialUrl && (
                      <a
                        href={formatHref(evt.credentialUrl, 'web')}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-[10px] text-teal-700 hover:underline font-bold'
                      >
                        Proof ↗
                      </a>
                    )}
                  </div>
                </div>
                {evt.learnings && (
                  <p className='mt-1 text-[11.5px] text-slate-700 leading-relaxed'>
                    <span className='font-semibold text-slate-900'>Key Learnings: </span>
                    {evt.learnings}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null,

    certifications: () =>
      data.certifications?.length > 0 ? (
        <section className='mb-6'>
          <h2 className='text-[11.5px] font-black tracking-widest text-teal-800 uppercase border-b-2 border-teal-600 pb-1 mb-2 font-mono'>
            CERTIFICATIONS
          </h2>
          <div className='space-y-2'>
            {data.certifications.map((cert, cIdx) => (
              <div key={cert.id || cIdx} className='text-[11.5px] page-break-inside-avoid'>
                <span className='font-bold text-slate-900 block'>{cert.title || cert.name}</span>
                <span className='text-[10.5px] text-slate-600'>{cert.issuer}</span>
                {cert.credentialUrl && (
                  <a
                    href={formatHref(cert.credentialUrl, 'web')}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='block text-[10px] text-teal-700 hover:underline font-bold mt-0.5'
                  >
                    View Credential ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null,
  };

  return (
    <div className='font-sans text-slate-800 text-[12.5px] leading-relaxed max-w-[820px] mx-auto bg-white p-6 sm:p-10 print:max-w-none print:w-full print:p-8 print:border-none print:shadow-none select-text border border-teal-100 shadow-xs'>
      {/* ── HEADER WITH PROMINENT PHOTO ───────────────────────────────────── */}
      <header className='pb-5 border-b border-teal-200/80 mb-6'>
        <div className='flex flex-row items-center gap-5'>
          <AvatarPhoto
            url={pi.avatarUrl}
            name={pi.fullName}
            size='lg'
            borderColor='#0d9488'
            onEdit={onEditLinks}
            readOnly={readOnly}
          />

          <div className='flex-1 text-left'>
            <h1 className='text-2xl sm:text-3xl font-black tracking-tight text-slate-950 uppercase'>
              <InlineText
                value={pi.fullName || 'YOUR NAME'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ fullName: v }) : undefined}
                placeholder='Full Name'
                className='font-black tracking-tight text-slate-950 uppercase'
              />
            </h1>
            <p className='text-[13.5px] font-bold text-teal-700 mt-0.5 tracking-wide'>
              <InlineText
                value={pi.headline || 'Solutions Architect | Senior Technical Consultant'}
                onChange={onUpdate && !readOnly ? (v) => upPI({ headline: v }) : undefined}
                placeholder='Professional Title'
                className='text-[13.5px] font-bold text-teal-700'
              />
            </p>

            <div className='mt-2.5'>
              <ContactLinksRow
                personalInfo={pi}
                variant='light'
                onEditLinks={onEditLinks}
                readOnly={readOnly}
              />
            </div>
          </div>

          <OrganizationLogoBadge variant='modern-card' className='self-start' />
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
