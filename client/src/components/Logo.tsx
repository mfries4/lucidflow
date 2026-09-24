interface Props {
  size?: number;
  /** Couleur du symbole ; la teinte de marque par défaut. */
  color?: string;
}

/** Symbole LucidFlow : un nœud qui se ramifie en deux. */
export function Logo({ size = 24, color = '#0B4FC4' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="LucidFlow">
      <path
        d="M24 12 V24 M24 24 H12 V36 M24 24 H36 V36"
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <circle cx="24" cy="10" r="7" fill={color} />
      <rect x="5" y="31" width="14" height="14" rx="3" fill={color} />
      <rect x="29" y="31" width="14" height="14" rx="3" fill={color} />
    </svg>
  );
}
