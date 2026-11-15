import type { ReactNode } from "react";

export type IconName =
  | "flame"
  | "map"
  | "calendar"
  | "activity"
  | "shield"
  | "flask"
  | "pin"
  | "bell"
  | "arrowRight"
  | "arrowUpRight"
  | "play"
  | "pause"
  | "download"
  | "chevronDown"
  | "layers"
  | "alert"
  | "check"
  | "reset"
  | "plus"
  | "minus";

const paths: Record<IconName, ReactNode> = {
  flame: (
    <path d="M12 22c4.2 0 7-2.8 7-6.7 0-3.1-1.8-5.7-4.4-8.6-.5 2-1.5 3.2-2.8 4.1.2-3.5-1.4-6.4-4-8.8.2 3.4-1.8 5.4-1.8 8.7C6 17.4 8.4 22 12 22Z" />
  ),
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  shield: (
    <>
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: (
    <>
      <path d="M9 5v14M15 5v14" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5M12 17.5h.01" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
