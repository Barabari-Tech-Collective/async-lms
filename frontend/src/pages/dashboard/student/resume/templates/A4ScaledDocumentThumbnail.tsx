import React, { useMemo } from 'react';
import type { ResumeDocument } from '../types';
import { SAMPLE_RESUME_DOC } from '../sampleResumeData';
import { TemplateRenderer } from './TemplateRenderer';

export interface A4ScaledDocumentThumbnailProps {
  document?: ResumeDocument;
  templateId?: string;
  width?: number;
  height?: number;
  className?: string;
}

const CANONICAL_A4_WIDTH = 800;
const CANONICAL_A4_HEIGHT = 1130;

export const A4ScaledDocumentThumbnail: React.FC<A4ScaledDocumentThumbnailProps> = ({
  document,
  templateId,
  width = 175,
  height = 247,
  className = '',
}) => {
  const finalDoc: ResumeDocument = useMemo(() => {
    if (document) {
      const chosenTemplate = document.templateId || templateId || 'ivy-standard';
      return { ...document, templateId: chosenTemplate };
    }
    return {
      ...SAMPLE_RESUME_DOC,
      templateId: templateId || 'ivy-standard',
    };
  }, [document, templateId]);

  const scale = width / CANONICAL_A4_WIDTH;

  return (
    <div
      className={`relative bg-white overflow-hidden select-none pointer-events-none ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <div
        style={{
          width: `${CANONICAL_A4_WIDTH}px`,
          height: `${CANONICAL_A4_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          userSelect: 'none',
          overflow: 'hidden',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
        }}
      >
        <TemplateRenderer
          data={finalDoc}
          readOnly={true}
          onTriggerRewrite={() => {}}
          rewritingKey={null}
        />
      </div>
    </div>
  );
};

