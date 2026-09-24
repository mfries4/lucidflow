import type { Marker } from '../types';

interface Props {
  type: Marker;
  x: number;
  y: number;
  angle: number;
  color: string;
  strokeWidth: number;
  /** Fond des pointes creuses (héritage, agrégation). */
  hollow?: string;
}

/** Pointe de connecteur : le sommet est en (x, y) et le corps part vers l'arrière. */
export function EdgeMarker({ type, x, y, angle, color, strokeWidth, hollow = '#ffffff' }: Props) {
  if (type === 'none') return null;
  const k = Math.max(0.85, Math.min(strokeWidth / 2, 1.8));
  const transform = `translate(${x} ${y}) rotate(${(angle * 180) / Math.PI}) scale(${k})`;
  const sw = strokeWidth / k;

  const shape = () => {
    switch (type) {
      case 'arrow':
        return <path d="M 0 0 L -11 -6 L -8 0 L -11 6 Z" fill={color} stroke="none" />;
      case 'arrow-thin':
        return (
          <path
            d="M -11 -6.5 L 0 0 L -11 6.5"
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'triangle':
        return <path d="M 0 0 L -13 -7 L -13 7 Z" fill={color} stroke={color} strokeWidth={sw} strokeLinejoin="round" />;
      case 'triangle-open':
        return <path d="M 0 0 L -13 -8 L -13 8 Z" fill={hollow} stroke={color} strokeWidth={sw} strokeLinejoin="round" />;
      case 'diamond':
        return <path d="M 0 0 L -8 -6 L -16 0 L -8 6 Z" fill={color} stroke={color} strokeWidth={sw} strokeLinejoin="round" />;
      case 'diamond-open':
        return <path d="M 0 0 L -8 -6 L -16 0 L -8 6 Z" fill={hollow} stroke={color} strokeWidth={sw} strokeLinejoin="round" />;
      case 'circle':
        return <circle cx={-5} cy={0} r={5} fill={color} />;
      case 'circle-open':
        return <circle cx={-5} cy={0} r={5} fill={hollow} stroke={color} strokeWidth={sw} />;
      default:
        return null;
    }
  };

  return <g transform={transform}>{shape()}</g>;
}
