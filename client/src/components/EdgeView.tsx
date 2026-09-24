import { memo } from 'react';
import type { DiagramEdge } from '../types';
import type { EdgeGeometry } from '../lib/edges';
import { EdgeMarker } from './EdgeMarker';
import { FONT_STACK, fontString, measure } from '../lib/text';

interface Props {
  edge: DiagramEdge;
  geo: EdgeGeometry;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent, id: string) => void;
}

interface LabelProps {
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
}

function EdgeLabel({ x, y, text, size, color }: LabelProps) {
  if (!text) return null;
  const lines = text.split('\n');
  const font = fontString(size);
  const width = Math.max(...lines.map((l) => measure(l, font))) + 10;
  const height = lines.length * size * 1.3 + 4;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={4}
        fill="rgba(255,255,255,0.92)"
      />
      <text
        x={x}
        textAnchor="middle"
        fontFamily={FONT_STACK}
        fontSize={size}
        fill={color}
        style={{ userSelect: 'none' }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={x} y={y - height / 2 + 2 + (i + 0.5) * size * 1.3} dominantBaseline="central">
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function EdgeViewBase({ edge, geo, selected, onPointerDown }: Props) {
  const { style } = edge;
  const dash =
    style.dash === 'dashed'
      ? `${style.strokeWidth * 4} ${style.strokeWidth * 3}`
      : style.dash === 'dotted'
        ? `1 ${style.strokeWidth * 3}`
        : undefined;

  // Décalage perpendiculaire des étiquettes de cardinalité, près de chaque extrémité.
  const offset = (angle: number, at: { x: number; y: number }, back: number) => ({
    x: at.x - Math.cos(angle) * back - Math.sin(angle) * 12,
    y: at.y - Math.sin(angle) * back + Math.cos(angle) * 12,
  });
  const startLabelAt = offset(geo.startAngle, geo.start, 26);
  const endLabelAt = offset(geo.endAngle, geo.end, 26);

  return (
    <g className="edge" data-edge={edge.id}>
      {selected && (
        <path
          data-ui="selection"
          d={geo.d}
          fill="none"
          stroke="#2563eb"
          strokeOpacity={0.28}
          strokeWidth={style.strokeWidth + 8}
          strokeLinecap="round"
        />
      )}
      <path
        d={geo.d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(16, style.strokeWidth + 12)}
        style={{ cursor: 'pointer' }}
        onPointerDown={(e) => onPointerDown(e, edge.id)}
      />
      <path
        d={geo.d}
        fill="none"
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        strokeDasharray={dash}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />
      <EdgeMarker
        type={style.start}
        x={geo.start.x}
        y={geo.start.y}
        angle={geo.startAngle}
        color={style.stroke}
        strokeWidth={style.strokeWidth}
      />
      <EdgeMarker
        type={style.end}
        x={geo.end.x}
        y={geo.end.y}
        angle={geo.endAngle}
        color={style.stroke}
        strokeWidth={style.strokeWidth}
      />
      <EdgeLabel x={geo.labelAt.x} y={geo.labelAt.y} text={edge.label} size={style.fontSize} color={style.color} />
      <EdgeLabel
        x={startLabelAt.x}
        y={startLabelAt.y}
        text={edge.startLabel ?? ''}
        size={style.fontSize - 1}
        color={style.color}
      />
      <EdgeLabel
        x={endLabelAt.x}
        y={endLabelAt.y}
        text={edge.endLabel ?? ''}
        size={style.fontSize - 1}
        color={style.color}
      />
    </g>
  );
}

export const EdgeView = memo(EdgeViewBase);
