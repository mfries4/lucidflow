import { useEditor } from '../store/editor';
import { EDGE_PRESETS } from '../shapes/palette';
import type { Dash, Marker, Routing } from '../types';

const FILLS = [
  'none', '#ffffff', '#f1f5f9', '#e2e8f0', '#fee2e2', '#ffedd5', '#fef08a',
  '#dcfce7', '#cffafe', '#dbeafe', '#e0e7ff', '#f3e8ff', '#fce7f3', '#0f172a',
];
const STROKES = [
  'none', '#0f172a', '#334155', '#64748b', '#dc2626', '#ea580c', '#ca8a04',
  '#16a34a', '#0891b2', '#2563eb', '#4f46e5', '#9333ea', '#db2777', '#ffffff',
];

const MARKERS: { value: Marker; label: string }[] = [
  { value: 'none', label: 'Aucune' },
  { value: 'arrow', label: 'Flèche pleine' },
  { value: 'arrow-thin', label: 'Flèche ouverte' },
  { value: 'triangle', label: 'Triangle plein' },
  { value: 'triangle-open', label: 'Triangle creux' },
  { value: 'diamond', label: 'Losange plein' },
  { value: 'diamond-open', label: 'Losange creux' },
  { value: 'circle', label: 'Disque' },
  { value: 'circle-open', label: 'Cercle' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Swatches({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="swatches">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={`swatch ${value === color ? 'active' : ''} ${color === 'none' ? 'is-none' : ''}`}
          style={color === 'none' ? undefined : { background: color }}
          title={color === 'none' ? 'Transparent' : color}
          onClick={() => onChange(color)}
        />
      ))}
      <label className="swatch custom" title="Couleur personnalisée">
        <input
          type="color"
          value={value === 'none' ? '#ffffff' : value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; title?: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          title={option.title ?? option.label}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const DASHES: { value: Dash; label: string }[] = [
  { value: 'solid', label: '——' },
  { value: 'dashed', label: '– –' },
  { value: 'dotted', label: '· ·' },
];

export function PropertiesPanel() {
  // Abonnements ciblés : un déplacement de la vue ne redessine pas le panneau.
  const allNodes = useEditor((s) => s.nodes);
  const allEdges = useEditor((s) => s.edges);
  const selection = useEditor((s) => s.selection);
  const state = useEditor.getState(); // actions, stables d'un rendu à l'autre
  const nodes = allNodes.filter((n) => selection.includes(n.id));
  const edges = allEdges.filter((e) => selection.includes(e.id));
  const nodeIds = nodes.map((n) => n.id);
  const edgeIds = edges.map((e) => e.id);
  const first = nodes[0];
  const firstEdge = edges[0];

  const withHistory = (run: () => void) => {
    state.history();
    run();
  };

  return (
    <aside className="panel panel-right">
      <div className="panel-scroll">
        {!nodes.length && !edges.length && <DocumentSection />}

        {Boolean(nodes.length) && first && (
          <section className="prop-section">
            <h3>{nodes.length > 1 ? `${nodes.length} formes` : 'Forme'}</h3>

            <Field label="Remplissage">
              <Swatches
                colors={FILLS}
                value={first.style.fill}
                onChange={(fill) => withHistory(() => state.styleNodes(nodeIds, { fill }))}
              />
            </Field>

            <Field label="Contour">
              <Swatches
                colors={STROKES}
                value={first.style.stroke}
                onChange={(stroke) => withHistory(() => state.styleNodes(nodeIds, { stroke }))}
              />
            </Field>

            <div className="row">
              <Field label="Épaisseur">
                <input
                  type="range"
                  min={0}
                  max={8}
                  step={0.5}
                  value={first.style.strokeWidth}
                  onChange={(e) => state.styleNodes(nodeIds, { strokeWidth: Number(e.target.value) })}
                  onPointerDown={() => state.history()}
                />
              </Field>
              <Field label="Trait">
                <Segmented
                  options={DASHES}
                  value={first.style.dash}
                  onChange={(dash) => withHistory(() => state.styleNodes(nodeIds, { dash }))}
                />
              </Field>
            </div>

            <div className="row">
              <Field label="Arrondi">
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={Math.min(first.style.radius, 40)}
                  onChange={(e) => state.styleNodes(nodeIds, { radius: Number(e.target.value) })}
                  onPointerDown={() => state.history()}
                />
              </Field>
              <Field label="Opacité">
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={first.style.opacity}
                  onChange={(e) => state.styleNodes(nodeIds, { opacity: Number(e.target.value) })}
                  onPointerDown={() => state.history()}
                />
              </Field>
            </div>

            <h4>Texte</h4>
            <div className="row">
              <Field label="Taille">
                <input
                  type="number"
                  min={8}
                  max={48}
                  value={first.style.fontSize}
                  onFocus={() => state.history()}
                  onChange={(e) => state.styleNodes(nodeIds, { fontSize: Number(e.target.value) || 14 })}
                />
              </Field>
              <Field label="Style">
                <div className="segmented">
                  <button
                    type="button"
                    className={first.style.bold ? 'active' : ''}
                    onClick={() => withHistory(() => state.styleNodes(nodeIds, { bold: !first.style.bold }))}
                  >
                    <strong>G</strong>
                  </button>
                  <button
                    type="button"
                    className={first.style.italic ? 'active' : ''}
                    onClick={() => withHistory(() => state.styleNodes(nodeIds, { italic: !first.style.italic }))}
                  >
                    <em>I</em>
                  </button>
                </div>
              </Field>
            </div>

            <Field label="Couleur du texte">
              <Swatches
                colors={STROKES}
                value={first.style.color}
                onChange={(color) => withHistory(() => state.styleNodes(nodeIds, { color }))}
              />
            </Field>

            <div className="row">
              <Field label="Alignement">
                <Segmented
                  options={[
                    { value: 'left', label: '⇤' },
                    { value: 'center', label: '↔' },
                    { value: 'right', label: '⇥' },
                  ]}
                  value={first.style.align}
                  onChange={(align) => withHistory(() => state.styleNodes(nodeIds, { align }))}
                />
              </Field>
              <Field label="Vertical">
                <Segmented
                  options={[
                    { value: 'top', label: '⤒' },
                    { value: 'middle', label: '↕' },
                    { value: 'bottom', label: '⤓' },
                  ]}
                  value={first.style.valign}
                  onChange={(valign) => withHistory(() => state.styleNodes(nodeIds, { valign }))}
                />
              </Field>
            </div>

            {nodes.length === 1 && (
              <div className="row">
                <Field label="Largeur">
                  <input
                    type="number"
                    value={Math.round(first.w)}
                    onFocus={() => state.history()}
                    onChange={(e) => state.updateNode(first.id, { w: Math.max(16, Number(e.target.value)) })}
                  />
                </Field>
                <Field label="Hauteur">
                  <input
                    type="number"
                    value={Math.round(first.h)}
                    onFocus={() => state.history()}
                    onChange={(e) => state.updateNode(first.id, { h: Math.max(16, Number(e.target.value)) })}
                  />
                </Field>
              </div>
            )}

            {nodes.length > 1 && (
              <>
                <h4>Alignement</h4>
                <div className="align-grid">
                  <button type="button" onClick={() => state.align('left')} title="Aligner à gauche">⇤</button>
                  <button type="button" onClick={() => state.align('center-h')} title="Centrer horizontalement">↔</button>
                  <button type="button" onClick={() => state.align('right')} title="Aligner à droite">⇥</button>
                  <button type="button" onClick={() => state.align('top')} title="Aligner en haut">⤒</button>
                  <button type="button" onClick={() => state.align('center-v')} title="Centrer verticalement">↕</button>
                  <button type="button" onClick={() => state.align('bottom')} title="Aligner en bas">⤓</button>
                  <button type="button" onClick={() => state.distribute('h')} title="Répartir horizontalement">⇹</button>
                  <button type="button" onClick={() => state.distribute('v')} title="Répartir verticalement">⇳</button>
                </div>
              </>
            )}

            <h4>Ordre</h4>
            <div className="btn-row">
              <button type="button" onClick={() => state.reorder('front')}>Premier plan</button>
              <button type="button" onClick={() => state.reorder('forward')}>Avancer</button>
              <button type="button" onClick={() => state.reorder('backward')}>Reculer</button>
              <button type="button" onClick={() => state.reorder('back')}>Arrière-plan</button>
            </div>
          </section>
        )}

        {Boolean(edges.length) && firstEdge && (
          <section className="prop-section">
            <h3>{edges.length > 1 ? `${edges.length} liens` : 'Connecteur'}</h3>

            <Field label="Type de relation">
              <div className="preset-list">
                {EDGE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="preset"
                    title={preset.hint}
                    onClick={() => withHistory(() => state.styleEdges(edgeIds, preset.style))}
                  >
                    <PresetPreview preset={preset.style} />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Tracé">
              <Segmented<Routing>
                options={[
                  { value: 'orthogonal', label: 'Coudé' },
                  { value: 'straight', label: 'Droit' },
                  { value: 'curved', label: 'Courbe' },
                ]}
                value={firstEdge.style.routing}
                onChange={(routing) => withHistory(() => state.styleEdges(edgeIds, { routing }))}
              />
            </Field>

            <div className="row">
              <Field label="Départ">
                <select
                  value={firstEdge.style.start}
                  onChange={(e) => withHistory(() => state.styleEdges(edgeIds, { start: e.target.value as Marker }))}
                >
                  {MARKERS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Arrivée">
                <select
                  value={firstEdge.style.end}
                  onChange={(e) => withHistory(() => state.styleEdges(edgeIds, { end: e.target.value as Marker }))}
                >
                  {MARKERS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Couleur">
              <Swatches
                colors={STROKES}
                value={firstEdge.style.stroke}
                onChange={(stroke) => withHistory(() => state.styleEdges(edgeIds, { stroke, color: stroke }))}
              />
            </Field>

            <div className="row">
              <Field label="Épaisseur">
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={0.5}
                  value={firstEdge.style.strokeWidth}
                  onChange={(e) => state.styleEdges(edgeIds, { strokeWidth: Number(e.target.value) })}
                  onPointerDown={() => state.history()}
                />
              </Field>
              <Field label="Trait">
                <Segmented
                  options={DASHES}
                  value={firstEdge.style.dash}
                  onChange={(dash) => withHistory(() => state.styleEdges(edgeIds, { dash }))}
                />
              </Field>
            </div>

            {edges.length === 1 && (
              <>
                <h4>Étiquettes</h4>
                <Field label="Au centre">
                  <input
                    type="text"
                    value={firstEdge.label}
                    placeholder="ex. « valide »"
                    onChange={(e) => state.updateEdge(firstEdge.id, { label: e.target.value })}
                    onFocus={() => state.history()}
                  />
                </Field>
                <div className="row">
                  <Field label="Départ">
                    <input
                      type="text"
                      value={firstEdge.startLabel ?? ''}
                      placeholder="1"
                      onChange={(e) => state.updateEdge(firstEdge.id, { startLabel: e.target.value })}
                      onFocus={() => state.history()}
                    />
                  </Field>
                  <Field label="Arrivée">
                    <input
                      type="text"
                      value={firstEdge.endLabel ?? ''}
                      placeholder="0..*"
                      onChange={(e) => state.updateEdge(firstEdge.id, { endLabel: e.target.value })}
                      onFocus={() => state.history()}
                    />
                  </Field>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}

function PresetPreview({ preset }: { preset: Partial<import('../types').EdgeStyle> }) {
  const dash = preset.dash === 'dashed' ? '6 4' : preset.dash === 'dotted' ? '1 4' : undefined;
  return (
    <svg width={46} height={16} viewBox="0 0 46 16" aria-hidden>
      <line x1={preset.start && preset.start !== 'none' ? 14 : 2} y1={8} x2={preset.end && preset.end !== 'none' ? 34 : 44} y2={8} stroke="#334155" strokeWidth={1.6} strokeDasharray={dash} />
      {preset.end && preset.end !== 'none' && <MiniMarker type={preset.end} x={44} flip={false} />}
      {preset.start && preset.start !== 'none' && <MiniMarker type={preset.start} x={2} flip />}
    </svg>
  );
}

function MiniMarker({ type, x, flip }: { type: Marker; x: number; flip: boolean }) {
  const t = `translate(${x} 8) rotate(${flip ? 180 : 0})`;
  const fill = type.endsWith('open') ? '#ffffff' : '#334155';
  if (type === 'arrow') return <path transform={t} d="M 0 0 L -9 -4.5 L -6.5 0 L -9 4.5 Z" fill="#334155" />;
  if (type === 'arrow-thin') return <path transform={t} d="M -9 -5 L 0 0 L -9 5" fill="none" stroke="#334155" strokeWidth={1.6} />;
  if (type.startsWith('triangle')) return <path transform={t} d="M 0 0 L -10 -5 L -10 5 Z" fill={fill} stroke="#334155" strokeWidth={1.2} />;
  if (type.startsWith('diamond')) return <path transform={t} d="M 0 0 L -6 -4 L -12 0 L -6 4 Z" fill={fill} stroke="#334155" strokeWidth={1.2} />;
  return <circle transform={t} cx={-4} cy={0} r={4} fill={fill} stroke="#334155" strokeWidth={1.2} />;
}

function DocumentSection() {
  const nodeCount = useEditor((s) => s.nodes.length);
  const edgeCount = useEditor((s) => s.edges.length);
  const showGrid = useEditor((s) => s.showGrid);
  const snap = useEditor((s) => s.snap);
  const toggleGrid = useEditor((s) => s.toggleGrid);
  const toggleSnap = useEditor((s) => s.toggleSnap);
  return (
    <section className="prop-section">
      <h3>Document</h3>
      <p className="muted">
        {nodeCount} forme{nodeCount > 1 ? 's' : ''} · {edgeCount} lien{edgeCount > 1 ? 's' : ''}
      </p>

      <label className="check">
        <input type="checkbox" checked={showGrid} onChange={toggleGrid} />
        Afficher la grille
      </label>
      <label className="check">
        <input type="checkbox" checked={snap} onChange={toggleSnap} />
        Magnétisme sur la grille
      </label>

      <h4>Raccourcis</h4>
      <ul className="shortcuts">
        <li><kbd>V</kbd> sélection · <kbd>M</kbd> main · <kbd>C</kbd> connecteur</li>
        <li><kbd>Double-clic</kbd> sur la toile : nouvelle forme</li>
        <li><kbd>Double-clic</kbd> sur une forme : éditer le texte</li>
        <li>Survolez une forme puis tirez un <b>point bleu</b> pour relier</li>
        <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Z</kbd> annuler / rétablir</li>
        <li><kbd>Ctrl</kbd>+<kbd>D</kbd> dupliquer · <kbd>Suppr</kbd> supprimer</li>
        <li><kbd>Espace</kbd> + glisser, ou molette : déplacer la vue</li>
        <li><kbd>Ctrl</kbd>+molette : zoomer</li>
      </ul>
    </section>
  );
}
