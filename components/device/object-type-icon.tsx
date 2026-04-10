import type { DeviceObjectType } from "@prisma/client";
import type { ReactNode } from "react";

import { DEVICE_OBJECT_TYPE_LABEL } from "@/lib/admin/device-object-type";

type Props = {
  type: DeviceObjectType | null | undefined;
  className?: string;
  title?: string;
};

function IconSvg({
  className,
  title,
  children,
}: {
  className?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

/** Inline icon for the device object / asset type. Renders nothing when `type` is null. */
export function ObjectTypeIcon({ type, className = "h-5 w-5 shrink-0", title }: Props) {
  if (!type) return null;
  const label = title ?? DEVICE_OBJECT_TYPE_LABEL[type];

  switch (type) {
    case "car":
      return (
        <IconSvg className={className} title={label}>
          <path d="M3 11h18l-1.5-4h-15L3 11z" />
          <path d="M5 11v4h3v-2h8v2h3v-4" />
          <circle cx="7.5" cy="15" r="1.25" />
          <circle cx="16.5" cy="15" r="1.25" />
          <path d="M6 7l1-2h10l1 2" />
        </IconSvg>
      );
    case "bike":
      return (
        <IconSvg className={className} title={label}>
          <circle cx="6" cy="15" r="3.5" />
          <circle cx="18" cy="15" r="3.5" />
          <path d="M14.5 6.5L11 15M9.5 10.5l4.5-4 3 4" />
          <path d="M12 6.5h3.5" />
        </IconSvg>
      );
    case "ambulance":
      return (
        <IconSvg className={className} title={label}>
          <path d="M4 10h3l2-4h6l2 4h3v8H4v-8z" />
          <path d="M12 10v6M9 13h6" />
          <circle cx="7.5" cy="17" r="1.25" />
          <circle cx="16.5" cy="17" r="1.25" />
        </IconSvg>
      );
    case "fire_truck":
      return (
        <IconSvg className={className} title={label}>
          <path d="M4 14h12v4H4v-4z" />
          <path d="M16 14l3-4h2v4h-5" />
          <path d="M6 10V8h6v2" />
          <path d="M8 6V4M11 6V4" />
          <circle cx="7.5" cy="17" r="1.25" />
          <circle cx="14.5" cy="17" r="1.25" />
        </IconSvg>
      );
    case "atv":
      return (
        <IconSvg className={className} title={label}>
          <circle cx="5.5" cy="16.5" r="2.25" />
          <circle cx="18.5" cy="16.5" r="2.25" />
          <path d="M7.5 16.5h9" />
          <path d="M10 16.5L8 10h8l-2 6.5" />
          <path d="M8 10l-1.5-3h3L8 10zM16 10l1.5-3h-3L16 10z" />
        </IconSvg>
      );
    case "boat":
      return (
        <IconSvg className={className} title={label}>
          <path d="M4 15c2 3 6 4 8 4s6-1 8-4l-2-3H6l-2 3z" />
          <path d="M12 5v7M9 8h6" />
        </IconSvg>
      );
    case "container":
      return (
        <IconSvg className={className} title={label}>
          <path d="M4 8l8-3 8 3v10l-8 3-8-3V8z" />
          <path d="M4 8l8 3 8-3M12 11v10" />
        </IconSvg>
      );
    case "bus":
      return (
        <IconSvg className={className} title={label}>
          <path d="M5 6h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z" />
          <path d="M6 10h12M6 14h5M13 14h5" />
          <circle cx="8" cy="17.5" r="1.25" />
          <circle cx="16" cy="17.5" r="1.25" />
        </IconSvg>
      );
    case "garbage_truck":
      return (
        <IconSvg className={className} title={label}>
          <path d="M4 12h10v6H4v-6z" />
          <path d="M14 12l3-5h3v5h-6" />
          <path d="M6 12V9h4v3" />
          <path d="M8 7V5h4v2M11 5v4" />
          <circle cx="7" cy="17.5" r="1.25" />
          <circle cx="15" cy="17.5" r="1.25" />
        </IconSvg>
      );
    case "jet_ski":
      return (
        <IconSvg className={className} title={label}>
          <path d="M3 16c3 2 8 2 11 0l2-4H5l-2 4z" />
          <path d="M8 12l2-5h4l2 5" />
          <path d="M10 7V5h4v2" />
        </IconSvg>
      );
    case "speed_boat":
      return (
        <IconSvg className={className} title={label}>
          <path d="M3 15c4 2 10 2 14 0l-1-3H5l-2 3z" />
          <path d="M6 12L9 6h6l3 6" />
          <path d="M4 17c2 1 4 1.5 6 1.5M14 17c2 0 4-.5 6-1.5" opacity={0.5} />
        </IconSvg>
      );
    default:
      return null;
  }
}
