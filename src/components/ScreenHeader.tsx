import type { ReactNode } from 'react';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children?: ReactNode;
}

export default function ScreenHeader({
  title,
  subtitle,
  onBack,
  children,
}: ScreenHeaderProps) {
  return (
    <div className="sh">
      <button className="back" onClick={onBack} aria-label="Back">
        ‹
      </button>
      <div>
        <div className="sh-title">{title}</div>
        {subtitle ? <div className="sh-sub">{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}
