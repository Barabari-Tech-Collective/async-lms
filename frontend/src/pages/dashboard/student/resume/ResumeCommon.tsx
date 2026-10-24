import { useState, useRef, type ChangeEvent } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Github,
  Globe,
  ExternalLink,
  ShieldCheck,
  X,
  Camera,
  User,
} from 'lucide-react';
import type {
  ResumePersonalInfo,
  VerificationStatus,
} from './types';
import { formatHref, compressAvatarImage } from './resumeUtils';
import orgLogoImg from '@/assets/logo.png';
export { orgLogoImg };

// ── Organization Logo Badge (Top-side Institutional Credential) ───────────────
export interface OrganizationLogoBadgeProps {
  variant?:
    | 'sidebar-dark'
    | 'mercury'
    | 'corporate-center'
    | 'executive-seal'
    | 'compact'
    | 'cobalt-pill'
    | 'minimal'
    | 'modern-card'
    | 'editorial'
    | 'fresher-chip';
  className?: string;
}

export function OrganizationLogoBadge({
  variant = 'mercury',
  className = '',
}: OrganizationLogoBadgeProps) {
  if (variant === 'sidebar-dark') {
    return (
      <div className={`flex items-center gap-2.5 pb-3 border-b border-white/10 ${className}`}>
        <img
          src={orgLogoImg}
          alt='Organization Logo'
          className='h-7 w-7 object-contain rounded-xs drop-shadow-xs shrink-0'
        />
        <div className='text-left leading-tight'>
          <div className='text-[10px] font-black tracking-widest text-white uppercase font-mono'>
            CODEGURU
          </div>
          <div className='text-[8.5px] text-sky-300 font-semibold tracking-wide'>
            PLACEMENT VERIFIED
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'corporate-center') {
    return (
      <div className={`flex items-center justify-center gap-2 mb-2 ${className}`}>
        <img
          src={orgLogoImg}
          alt='Organization Logo'
          className='h-5 w-5 object-contain shrink-0'
        />
        <span className='text-[10px] font-black tracking-[0.22em] text-slate-700 uppercase font-mono'>
          CODEGURU VERIFIED CANDIDATE
        </span>
      </div>
    );
  }

  if (variant === 'executive-seal') {
    return (
      <div className={`flex items-center justify-center gap-3 mb-3 ${className}`}>
        <div className='w-10 h-px bg-stone-300' />
        <div className='flex items-center gap-1.5'>
          <img
            src={orgLogoImg}
            alt='Organization Logo'
            className='h-5 w-5 object-contain shrink-0'
          />
          <span className='text-[9.5px] font-serif tracking-[0.25em] text-stone-600 uppercase font-semibold'>
            CODEGURU ACCREDITED
          </span>
        </div>
        <div className='w-10 h-px bg-stone-300' />
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 border border-slate-300 shrink-0 ${className}`}
      >
        <img
          src={orgLogoImg}
          alt='Organization Logo'
          className='h-4 w-4 object-contain shrink-0'
        />
        <span className='text-[9.5px] font-black text-slate-800 font-mono tracking-tight'>
          CODEGURU
        </span>
      </div>
    );
  }

  if (variant === 'cobalt-pill') {
    return (
      <div
        className={`flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 shadow-2xs shrink-0 ${className}`}
      >
        <img
          src={orgLogoImg}
          alt='Organization Logo'
          className='h-5 w-5 object-contain shrink-0'
        />
        <span className='text-[10px] font-bold text-blue-700 tracking-wide font-mono uppercase'>
          CODEGURU FELLOW
        </span>
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <div className={`flex items-center gap-2 mb-3.5 ${className}`}>
        <img
          src={orgLogoImg}
          alt='Organization Logo'
          className='h-5 w-5 object-contain opacity-90 shrink-0'
        />
        <span className='text-[9.5px] font-medium tracking-[0.25em] text-slate-400 uppercase font-mono'>
          CODEGURU VERIFIED
        </span>
      </div>
    );
  }

  if (variant === 'modern-card') {
    return (
      <div
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-teal-50/80 border border-teal-200/90 shadow-2xs shrink-0 ${className}`}
      >
        <img
          src={orgLogoImg}
          alt='Organization Logo'
          className='h-6 w-6 object-contain shrink-0'
        />
        <div className='text-left leading-tight'>
          <div className='text-[9.5px] font-black text-teal-950 font-mono tracking-wider'>
            CODEGURU
          </div>
          <div className='text-[8px] font-bold text-teal-700 uppercase tracking-wide'>
            PLACEMENT TRACK
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'editorial') {
    return (
      <div className={`flex items-center gap-2 mb-1.5 ${className}`}>
        <img
          src={orgLogoImg}
          alt='Organization Logo'
          className='h-5 w-5 object-contain shrink-0'
        />
        <span className='text-[10px] font-bold uppercase tracking-widest text-amber-900 font-mono'>
          CODEGURU PORTFOLIO DOSSIER • VERIFIED CANDIDATE
        </span>
      </div>
    );
  }

  if (variant === 'fresher-chip') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-2 ${className}`}
      >
        <img
          src={orgLogoImg}
          alt='Organization Logo'
          className='h-4 w-4 object-contain shrink-0'
        />
        <span>CodeGuru Campus Placement • Verified Fresher</span>
      </div>
    );
  }

  // default: 'mercury'
  return (
    <div
      className={`flex items-center gap-2 p-1.5 px-2.5 rounded-lg bg-slate-50 border border-slate-200/90 shadow-2xs shrink-0 ${className}`}
    >
      <img
        src={orgLogoImg}
        alt='Organization Logo'
        className='h-6 w-6 object-contain shrink-0'
      />
      <div className='text-left leading-tight'>
        <div className='text-[10px] font-black tracking-wider text-slate-900 font-mono'>
          CODEGURU
        </div>
        <div className='text-[8.5px] font-bold text-[#333d7c] uppercase tracking-wide'>
          VERIFIED GRADUATE
        </div>
      </div>
    </div>
  );
}

// ── Verification Badge ────────────────────────────────────────────────────────
export function VerificationBadge({ status }: { status?: VerificationStatus }) {
  if (status === 'LMS_VERIFIED') {
    return (
      <span
        title='Authoritative CodeGuru verified achievement'
        className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'
      >
        <ShieldCheck size={11} className='text-emerald-600' />
        <span>CodeGuru Verified</span>
      </span>
    );
  }

  if (status === 'CREDENTIAL_LINK_PROVIDED') {
    return (
      <span
        title='Public repository or demo link provided'
        className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200'
      >
        <ExternalLink size={10} className='text-blue-500' />
        <span>Link Provided</span>
      </span>
    );
  }

  return null;
}

// ── Avatar Photo Component ────────────────────────────────────────────────────
interface AvatarPhotoProps {
  url?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  borderColor?: string;
  onEdit?: () => void;
  readOnly?: boolean;
}

export function AvatarPhoto({
  url,
  name,
  size = 'md',
  className = '',
  borderColor = '#333d7c',
  onEdit,
  readOnly = false,
}: AvatarPhotoProps) {
  const [imgError, setImgError] = useState(false);
  const sizeClasses = {
    sm: 'w-12 h-12 text-sm',
    md: 'w-20 h-20 text-xl',
    lg: 'w-24 h-24 text-2xl',
  };

  const initials = (name || 'CG')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  const hasPhoto = Boolean(url && typeof url === 'string' && url.trim().length > 10 && !imgError);

  return (
    <div className={`relative group shrink-0 ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-full overflow-hidden border-2 shadow-xs bg-slate-100 flex items-center justify-center transition-all`}
        style={{ borderColor: borderColor }}
      >
        {hasPhoto ? (
          <img
            src={url}
            alt={name || 'Profile'}
            className='w-full h-full object-cover'
            onError={() => setImgError(true)}
            loading='eager'
          />
        ) : (
          <div className='w-full h-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center'>
            {initials || <User size={24} />}
          </div>
        )}
      </div>

      {!readOnly && onEdit && (
        <button
          type='button'
          onClick={onEdit}
          className='opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 rounded-full bg-black/40 flex items-center justify-center text-white text-[10px] font-semibold print:hidden'
          title='Change profile photo'
        >
          <Camera size={14} />
        </button>
      )}
    </div>
  );
}

// ── Contact Links Row ─────────────────────────────────────────────────────────
interface ContactLinksRowProps {
  personalInfo: ResumePersonalInfo;
  variant?: 'light' | 'dark' | 'corporate' | 'compact' | 'centered';
  onEditLinks?: () => void;
  readOnly?: boolean;
}

export function ContactLinksRow({
  personalInfo: pi,
  variant = 'light',
  onEditLinks,
  readOnly = false,
}: ContactLinksRowProps) {
  const githubLink = pi.links?.find(
    (l) => l.label.toLowerCase().includes('github') || l.url.includes('github')
  );
  const linkedinLink = pi.links?.find(
    (l) => l.label.toLowerCase().includes('linkedin') || l.url.includes('linkedin')
  );
  const customLinks = (pi.links || []).filter(
    (l) => l !== githubLink && l !== linkedinLink && l.url.trim().length > 0
  );

  const isDark = variant === 'dark';
  const isCentered = variant === 'centered';

  const linkColor = isDark
    ? 'text-slate-200 hover:text-white'
    : 'text-slate-600 hover:text-[#333d7c]';
  const iconColor = isDark ? 'text-slate-400' : 'text-slate-400';

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11.5px] font-medium ${
        isCentered ? 'justify-center' : ''
      }`}
    >
      {pi.email && (
        <a
          href={formatHref(pi.email, 'email')}
          className={`inline-flex items-center gap-1 hover:underline underline-offset-2 transition-colors ${linkColor}`}
          title='Send Email'
        >
          <Mail size={12} className={iconColor} />
          <span>{pi.email}</span>
        </a>
      )}

      {pi.phone && (
        <a
          href={formatHref(pi.phone, 'whatsapp')}
          target='_blank'
          rel='noopener noreferrer'
          className={`inline-flex items-center gap-1 hover:underline underline-offset-2 transition-colors ${linkColor}`}
          title='WhatsApp / Phone'
        >
          <Phone size={12} className={iconColor} />
          <span>{pi.phone}</span>
        </a>
      )}

      {pi.location && (
        <span className={`inline-flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
          <MapPin size={12} className={iconColor} />
          <span>{pi.location}</span>
        </span>
      )}

      {linkedinLink && linkedinLink.url && (
        <a
          href={formatHref(linkedinLink.url, 'web')}
          target='_blank'
          rel='noopener noreferrer'
          className={`inline-flex items-center gap-1 hover:underline underline-offset-2 transition-colors font-semibold ${
            isDark ? 'text-sky-300 hover:text-white' : 'text-[#0077b5]'
          }`}
          title='LinkedIn Profile'
        >
          <Linkedin size={12} />
          <span>LinkedIn</span>
        </a>
      )}

      {githubLink && githubLink.url && (
        <a
          href={formatHref(githubLink.url, 'web')}
          target='_blank'
          rel='noopener noreferrer'
          className={`inline-flex items-center gap-1 hover:underline underline-offset-2 transition-colors font-semibold ${
            isDark ? 'text-slate-200 hover:text-white' : 'text-slate-800'
          }`}
          title='GitHub Profile'
        >
          <Github size={12} />
          <span>GitHub</span>
        </a>
      )}

      {customLinks.map((link, idx) => (
        <a
          key={idx}
          href={formatHref(link.url, 'web')}
          target='_blank'
          rel='noopener noreferrer'
          className={`inline-flex items-center gap-1 hover:underline underline-offset-2 transition-colors ${linkColor}`}
        >
          <Globe size={12} className={iconColor} />
          <span>{link.label || 'Portfolio'}</span>
        </a>
      ))}

      {!readOnly && onEditLinks && (
        <button
          type='button'
          onClick={onEditLinks}
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded transition-colors print:hidden ${
            isDark
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'text-[#333d7c] hover:bg-slate-100'
          }`}
          title='Edit Contact Details & Links'
        >
          <span>✏️ Edit Links</span>
        </button>
      )}
    </div>
  );
}

// ── Contact & Photo Edit Modal ────────────────────────────────────────────────
interface ContactPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  personalInfo: ResumePersonalInfo;
  onSave: (patch: Partial<ResumePersonalInfo>) => void;
}

export function ContactPhotoModal({
  isOpen,
  onClose,
  personalInfo: pi,
  onSave,
}: ContactPhotoModalProps) {
  const [email, setEmail] = useState(pi.email || '');
  const [phone, setPhone] = useState(pi.phone || '');
  const [location, setLocation] = useState(pi.location || '');
  const [avatarUrl, setAvatarUrl] = useState(pi.avatarUrl || '');

  const linkedinLink = pi.links?.find(
    (l) => l.label.toLowerCase().includes('linkedin') || l.url.includes('linkedin')
  )?.url || '';
  const githubLink = pi.links?.find(
    (l) => l.label.toLowerCase().includes('github') || l.url.includes('github')
  )?.url || '';
  const portfolioLink = pi.links?.find(
    (l) => !l.label.toLowerCase().includes('linkedin') && !l.label.toLowerCase().includes('github')
  )?.url || '';

  const [linkedin, setLinkedin] = useState(linkedinLink);
  const [github, setGithub] = useState(githubLink);
  const [portfolio, setPortfolio] = useState(portfolioLink);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressAvatarImage(file, 320, 0.88);
      setAvatarUrl(compressed);
    } catch {
      alert('Failed to process image. Please try another file.');
    }
  };

  const handleSave = () => {
    const links: { label: string; url: string }[] = [];
    if (linkedin.trim()) links.push({ label: 'LinkedIn', url: linkedin.trim() });
    if (github.trim()) links.push({ label: 'GitHub', url: github.trim() });
    if (portfolio.trim()) links.push({ label: 'Portfolio', url: portfolio.trim() });

    onSave({
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
      avatarUrl: avatarUrl.trim(),
      links,
    });
    onClose();
  };

  return (
    <div className='fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden animate-in fade-in-50'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto'>
        <div className='flex items-center justify-between border-b border-slate-100 pb-3'>
          <div>
            <h3 className='font-bold text-slate-900 text-sm sm:text-base'>
              Edit Contact Details & Profile Photo
            </h3>
            <p className='text-xs text-slate-500'>
              All contact details and photos update across all 10 templates.
            </p>
          </div>
          <button onClick={onClose} className='text-slate-400 hover:text-slate-600 p-1'>
            <X size={18} />
          </button>
        </div>

        {/* Profile Picture Section */}
        <div className='p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-4'>
          <div className='relative w-16 h-16 rounded-full overflow-hidden border-2 border-[#333d7c] bg-white shrink-0 shadow-xs flex items-center justify-center'>
            {avatarUrl ? (
              <img src={avatarUrl} alt='Avatar Preview' className='w-full h-full object-cover' />
            ) : (
              <User size={24} className='text-slate-400' />
            )}
          </div>

          <div className='flex-1 space-y-1.5'>
            <span className='font-semibold text-xs text-slate-700 block'>
              Profile Photo (Optional)
            </span>
            <div className='flex flex-wrap items-center gap-2'>
              <input
                ref={fileInputRef}
                type='file'
                accept='image/*'
                onChange={handleFileUpload}
                className='hidden'
              />
              <button
                type='button'
                onClick={() => fileInputRef.current?.click()}
                className='px-2.5 py-1 text-xs font-semibold bg-[#333d7c] text-white rounded-lg hover:bg-[#252d5e] transition-colors'
              >
                Upload Photo
              </button>
              {avatarUrl && (
                <button
                  type='button'
                  onClick={() => setAvatarUrl('')}
                  className='px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors'
                >
                  Remove
                </button>
              )}
            </div>
            <p className='text-[10.5px] text-slate-500'>
              Supports JPG/PNG under 2MB. Great for photo-centric templates.
            </p>
          </div>
        </div>

        {/* Contact Links Inputs */}
        <div className='space-y-3 text-xs'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <div>
              <label className='font-semibold text-slate-700 block mb-1'>Email Address</label>
              <input
                type='email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#333d7c]'
                placeholder='name@example.com'
              />
            </div>
            <div>
              <label className='font-semibold text-slate-700 block mb-1'>Phone / WhatsApp</label>
              <input
                type='tel'
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#333d7c]'
                placeholder='+91 98765 43210'
              />
            </div>
          </div>

          <div>
            <label className='font-semibold text-slate-700 block mb-1'>City, Country</label>
            <input
              type='text'
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#333d7c]'
              placeholder='Bengaluru, India'
            />
          </div>

          <div>
            <label className='font-semibold text-slate-700 block mb-1'>LinkedIn Profile URL</label>
            <input
              type='url'
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder='https://linkedin.com/in/your-username'
              className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#333d7c]'
            />
            {linkedin.includes('/feed') && (
              <p className='text-[10.5px] text-amber-600 font-medium mt-0.5'>
                ⚠️ Feed URL detected. Use your public profile URL: https://linkedin.com/in/username
              </p>
            )}
          </div>

          <div>
            <label className='font-semibold text-slate-700 block mb-1'>GitHub Profile URL</label>
            <input
              type='url'
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder='https://github.com/your-username'
              className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#333d7c]'
            />
          </div>

          <div>
            <label className='font-semibold text-slate-700 block mb-1'>Portfolio URL</label>
            <input
              type='url'
              value={portfolio}
              onChange={(e) => setPortfolio(e.target.value)}
              placeholder='https://yourportfolio.dev'
              className='w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#333d7c]'
            />
          </div>
        </div>

        <div className='flex items-center justify-end gap-2 pt-3 border-t border-slate-100'>
          <button
            type='button'
            onClick={onClose}
            className='px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg'
          >
            Cancel
          </button>
          <button
            type='button'
            onClick={handleSave}
            className='px-4 py-1.5 text-xs font-bold bg-[#333d7c] text-white rounded-lg hover:bg-[#252d5e] transition-colors shadow-2xs'
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
