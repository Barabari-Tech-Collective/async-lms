import type { TemplateProps } from './AtlanticSidebarTemplate';
import { MercuryTemplate } from './MercuryTemplate';
import { AtlanticSidebarTemplate } from './AtlanticSidebarTemplate';
import { ClassicCorporateTemplate } from './ClassicCorporateTemplate';
import { ExecutiveSerifTemplate } from './ExecutiveSerifTemplate';
import { CompactSansTemplate } from './CompactSansTemplate';
import { CobaltEdgeTemplate } from './CobaltEdgeTemplate';
import { CleanSlateTemplate } from './CleanSlateTemplate';
import { PhotoModernTemplate } from './PhotoModernTemplate';
import { EditorialRuleTemplate } from './EditorialRuleTemplate';
import { FirstJobFresherTemplate } from './FirstJobFresherTemplate';

export function TemplateRenderer(props: TemplateProps) {
  const templateId = props.data.templateId || 'modern-mercury';

  switch (templateId) {
    case 'atlantic-sidebar':
      return <AtlanticSidebarTemplate {...props} />;
    case 'classic-corporate':
      return <ClassicCorporateTemplate {...props} />;
    case 'executive-serif':
      return <ExecutiveSerifTemplate {...props} />;
    case 'compact-sans':
      return <CompactSansTemplate {...props} />;
    case 'creative-cobalt':
      return <CobaltEdgeTemplate {...props} />;
    case 'minimal-slate':
      return <CleanSlateTemplate {...props} />;
    case 'photo-modern':
      return <PhotoModernTemplate {...props} />;
    case 'editorial-rule':
      return <EditorialRuleTemplate {...props} />;
    case 'first-job-fresh':
      return <FirstJobFresherTemplate {...props} />;
    case 'modern-mercury':
    default:
      return <MercuryTemplate {...props} />;
  }
}
