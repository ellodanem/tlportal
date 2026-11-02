import type { ReactNode } from "react";

/** Small stroke icons, decorative only (aria-hidden); every control that uses one carries a text label. */
function Icon({ children, className = "size-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export const LayersIcon = ({ className }: IconProps) => <Icon className={className}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></Icon>;
export const CalendarIcon = ({ className }: IconProps) => <Icon className={className}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>;
export const CardIcon = ({ className }: IconProps) => <Icon className={className}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></Icon>;
export const DocumentIcon = ({ className }: IconProps) => <Icon className={className}><path d="M7 3h7l5 5v13H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></Icon>;
export const PinIcon = ({ className }: IconProps) => <Icon className={className}><path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></Icon>;
export const SimIcon = ({ className }: IconProps) => <Icon className={className}><path d="M8 3h6l5 5v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><rect x="10" y="12" width="6" height="6" rx="1" /></Icon>;
export const CoinsIcon = ({ className }: IconProps) => <Icon className={className}><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3M3 12v5c0 1.7 2.7 3 6 3 3.3 0 6-1.3 6-3" /><ellipse cx="16" cy="14" rx="5" ry="2.5" /><path d="M21 14v4c0 1.4-2.2 2.5-5 2.5" /></Icon>;
export const TagIcon = ({ className }: IconProps) => <Icon className={className}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.4" /></Icon>;
export const SwapIcon = ({ className }: IconProps) => <Icon className={className}><path d="M4 8h14l-3-3M20 16H6l3 3" /></Icon>;
export const RefreshIcon = ({ className }: IconProps) => <Icon className={className}><path d="M20 11a8 8 0 0 0-14.3-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.5L20 16M20 20v-4h-4" /></Icon>;
export const CarIcon = ({ className }: IconProps) => <Icon className={className}><path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 13h.01M17 13h.01" /></Icon>;
export const WarningIcon = ({ className }: IconProps) => <Icon className={className}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v5M12 18h.01" /></Icon>;
export const ChevronRightIcon = ({ className }: IconProps) => <Icon className={className}><path d="m9 6 6 6-6 6" /></Icon>;
export const ArrowLeftIcon = ({ className }: IconProps) => <Icon className={className}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
export const ExternalIcon = ({ className }: IconProps) => <Icon className={className}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icon>;
export const CloseIcon = ({ className }: IconProps) => <Icon className={className}><path d="m6 6 12 12M18 6 6 18" /></Icon>;
export const CheckIcon = ({ className }: IconProps) => <Icon className={className}><path d="m5 12 5 5 9-10" /></Icon>;
export const PauseIcon = ({ className }: IconProps) => <Icon className={className}><path d="M9 5v14M15 5v14" /></Icon>;
export const PlayIcon = ({ className }: IconProps) => <Icon className={className}><path d="M7 5v14l12-7L7 5Z" /></Icon>;
export const BoatIcon = ({ className }: IconProps) => <Icon className={className}><path d="M3 17l2 3h14l2-3M5 17l-2-6h18l-2 6M12 11V4l5 5" /></Icon>;
