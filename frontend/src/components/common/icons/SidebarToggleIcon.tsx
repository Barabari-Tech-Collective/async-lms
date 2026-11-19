import React from 'react';

interface SidebarToggleIconProps {
  className?: string;
  size?: number;
}

/**
 * Exact split-pane sidebar toggle symbol matching the CodeGuru header design:
 * - Left pane: vertical sidebar pill
 * - Right pane: rounded content window
 */
export const SidebarToggleIcon: React.FC<SidebarToggleIconProps> = ({
  className = 'w-5 h-5',
  size = 20,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Left sidebar vertical pill */}
      <rect x="2.5" y="4" width="3.5" height="16" rx="1.75" />
      {/* Right main window panel with rounded corners */}
      <rect x="8.5" y="4" width="13" height="16" rx="3" />
    </svg>
  );
};

export default SidebarToggleIcon;
