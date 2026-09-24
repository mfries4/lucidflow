import { useMemo, useState } from 'react';
import { PALETTE, type PaletteItem } from '../shapes/palette';
import { shapeDef, styleFor } from '../shapes/registry';
import { useEditor } from '../store/editor';
import { matches } from '../lib/search';
import type { DiagramNode } from '../types';

const THUMB = { w: 68, h: 46 };

/** Aperçu miniature d'une forme, rendu avec le même moteur que le canvas. */
function ShapeThumb({ item }: { item: PaletteItem }) {
  const def = shapeDef(item.shape);
  const [dw, dh] = item.size ?? def.size;
  const scale = Math.min((THUMB.w - 8) / dw, (THUMB.h - 8) / dh, 1);
  const w = Math.max(dw * scale, 10);
  const h = Math.max(dh * scale, 6);
  const node: DiagramNode = useMemo(
    () => ({
      id: 'thumb',
      shape: item.shape,
      x: 0,
      y: 0,
      w,
      h,
      text: '',
      compartments: undefined,
      style: { ...styleFor(item.shape, item.style), strokeWidth: 1.5, fontSize: 9 },
    }),
    [item, w, h],
  );

  return (
    <svg width={THUMB.w} height={THUMB.h} viewBox={`0 0 ${THUMB.w} ${THUMB.h}`} aria-hidden>
      <g transform={`translate(${(THUMB.w - w) / 2} ${(THUMB.h - h) / 2})`}>
        {def.Body({ node, w, h, s: node.style })}
        {def.Text && (
          <g>
            <line x1={0} y1={h * 0.34} x2={w} y2={h * 0.34} stroke={node.style.stroke} strokeWidth={1} />
            <line x1={0} y1={h * 0.67} x2={w} y2={h * 0.67} stroke={node.style.stroke} strokeWidth={1} />
          </g>
        )}
      </g>
    </svg>
  );
}

export function ShapePanel() {
  const paletteGroup = useEditor((s) => s.paletteGroup);
  const setPaletteGroup = useEditor((s) => s.setPaletteGroup);
  const setPending = useEditor((s) => s.setPending);
  const pending = useEditor((s) => s.pending);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    if (!query.trim()) return PALETTE;
    const needle = query.trim();
    // Chercher « uml » ou « séquence » doit ramener la famille entière.
    return PALETTE.map((group) => ({
      ...group,
      items: matches(group.label, needle)
        ? group.items
        : group.items.filter((item) => matches(item.label ?? shapeDef(item.shape).name, needle)),
    })).filter((group) => group.items.length);
  }, [query]);

  const open = (id: string) => Boolean(query.trim()) || paletteGroup === id;

  return (
    <aside className="panel panel-left">
      <div className="panel-search">
        <input
          type="search"
          value={query}
          placeholder="Rechercher une forme…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="panel-scroll">
        {groups.map((group) => (
          <section key={group.id} className="shape-group">
            <button
              type="button"
              className="group-header"
              aria-expanded={open(group.id)}
              onClick={() => setPaletteGroup(paletteGroup === group.id ? '' : group.id)}
            >
              <span className={`chevron ${open(group.id) ? 'open' : ''}`} aria-hidden>
                ▾
              </span>
              {group.label}
            </button>

            {open(group.id) && (
              <div className="shape-grid">
                {group.items.map((item, i) => {
                  const label = item.label ?? shapeDef(item.shape).name;
                  const active = pending === item;
                  return (
                    <button
                      key={`${item.shape}-${i}`}
                      type="button"
                      className={`shape-tile ${active ? 'active' : ''}`}
                      title={`${label} — cliquez puis posez sur la toile, ou glissez-déposez`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-lucidflow-shape', JSON.stringify(item));
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => setPending(active ? null : item)}
                    >
                      <ShapeThumb item={item} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ))}
        {!groups.length && <p className="empty-hint">Aucune forme ne correspond.</p>}
      </div>
    </aside>
  );
}
