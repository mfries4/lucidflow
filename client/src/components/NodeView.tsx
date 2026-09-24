import { memo } from 'react';
import type { DiagramNode } from '../types';
import { renderShapeBody, renderShapeText, shapeDef, umlLayout } from '../shapes/registry';

interface Props {
  node: DiagramNode;
  selected: boolean;
  hidden?: boolean;
  onPointerDown: (event: React.PointerEvent, id: string) => void;
}

function NodeViewBase({ node, selected, hidden, onPointerDown }: Props) {
  const def = shapeDef(node.shape);
  // Un conteneur ne doit pas « avaler » les clics sur ce qu'il contient.
  const pointer = node.container ? 'stroke' : 'visiblePainted';

  return (
    <g
      className="node"
      data-node={node.id}
      transform={`translate(${node.x} ${node.y})`}
      opacity={hidden ? 0 : node.style.opacity}
      onPointerDown={(e) => onPointerDown(e, node.id)}
      style={{ cursor: node.locked ? 'default' : 'move' }}
    >
      {node.container && (
        <>
          {/* Le centre laisse passer les clics vers ce que le cadre contient… */}
          <rect x={0} y={0} width={node.w} height={node.h} fill="transparent" pointerEvents="none" />
          {/* …mais son bord offre une bande de saisie confortable. */}
          <rect
            x={0}
            y={0}
            width={node.w}
            height={node.h}
            fill="none"
            stroke="transparent"
            strokeWidth={12}
          />
        </>
      )}
      <g pointerEvents={pointer}>{renderShapeBody(node)}</g>
      {/* Zone invisible pour attraper les formes sans remplissage (texte, sous-branche). */}
      {!node.container && node.style.fill === 'none' && (
        <rect x={0} y={0} width={node.w} height={node.h} fill="transparent" />
      )}
      <g pointerEvents="none">{renderShapeText(node)}</g>
      {selected && def.Text && (
        <CompartmentHints node={node} />
      )}
    </g>
  );
}

/** Repères discrets sur les compartiments UML sélectionnés (double-clic pour éditer). */
function CompartmentHints({ node }: { node: DiagramNode }) {
  const { rows } = umlLayout(node, node.w, node.h);
  return (
    <g data-ui="hints" pointerEvents="none">
      {rows.map((r) => (
        <rect
          key={r.y}
          x={1}
          y={r.y + 1}
          width={node.w - 2}
          height={Math.max(r.h - 2, 4)}
          fill="none"
          stroke="#2563eb"
          strokeOpacity={0.18}
          strokeDasharray="4 4"
        />
      ))}
    </g>
  );
}

export const NodeView = memo(NodeViewBase);
