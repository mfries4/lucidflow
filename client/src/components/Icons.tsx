interface IconProps {
  name: keyof typeof PATHS;
  size?: number;
}

const PATHS = {
  back: 'M13 5 6 12l7 7',
  cursor: 'M6 3.5 17.5 11l-5 1.2L10.6 18z',
  hand: 'M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-1.2a1.5 1.5 0 0 1 3 0V11m0-.8a1.5 1.5 0 0 1 3 0V15a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-3l-1.6 1',
  connector: 'M4 20 20 4m0 0h-6m6 0v6',
  undo: 'M9 8H5V4m.6 3.6A8 8 0 1 1 4 12',
  redo: 'M15 8h4V4m-.6 3.6A8 8 0 1 0 20 12',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7m4 4v6m4-6v6',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5',
  layers: 'M12 3 3 8l9 5 9-5-9-5Zm9 9-9 5-9-5m18 4-9 5-9-5',
  copy: 'M9 9V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H15M5.5 9h8A1.5 1.5 0 0 1 15 10.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 18.5v-8A1.5 1.5 0 0 1 5.5 9Z',
  check: 'M5 12.5 10 17.5 19 7',
} as const;

export function Icon({ name, size = 17 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} fill={name === 'cursor' ? 'currentColor' : 'none'} />
    </svg>
  );
}
