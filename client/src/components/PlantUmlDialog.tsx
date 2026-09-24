import { useEffect, useMemo, useRef, useState } from 'react';
import { parsePlantUml, type PlantUmlResult } from '../lib/plantuml';

interface Props {
  title: string;
  actionLabel: string;
  onClose: () => void;
  onImport: (result: PlantUmlResult) => void;
}

const EXAMPLES: { label: string; source: string }[] = [
  {
    label: 'Classes',
    source: `@startuml
class Personne {
  - nom : String
  - age : int
  + sePresenter() : void
}
class Etudiant {
  - numero : String
  + sInscrire(c : Cours) : void
}
interface Identifiable {
  + identifiant() : String
}
class Cours {
  - intitule : String
}
Personne <|-- Etudiant
Personne ..|> Identifiable
Etudiant "0..*" o-- "1..*" Cours : suit
@enduml`,
  },
  {
    label: 'Séquence',
    source: `@startuml
participant ":Utilisateur" as U
participant ":Interface" as I
participant ":Service" as S
U -> I : soumettre()
activate I
I -> S : valider(données)
activate S
S --> I : résultat
deactivate S
I --> U : confirmation
deactivate I
@enduml`,
  },
  {
    label: "Cas d'utilisation",
    source: `@startuml
actor Client
actor Administrateur as Admin
rectangle "Plateforme de réservation" {
  usecase "Rechercher un trajet" as UC1
  usecase "Réserver un billet" as UC2
  usecase "Payer en ligne" as UC3
  usecase "Gérer les offres" as UC4
}
Client -- UC1
Client -- UC2
Admin -- UC4
UC2 ..> UC3 : <<include>>
@enduml`,
  },
  {
    label: 'Carte mentale',
    source: `@startmindmap
* Sujet principal
** Objectifs
*** Court terme
*** Long terme
** Étapes
*** Jalons
left side
** Contraintes
*** Budget
** Ressources
@endmindmap`,
  },
];

export function PlantUmlDialog({ title, actionLabel, onClose, onImport }: Props) {
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    areaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // L'analyse est relancée à chaque frappe : elle est purement locale et rapide.
  const parsed = useMemo(() => {
    if (!source.trim()) return null;
    try {
      return { ok: true as const, result: parsePlantUml(source) };
    } catch (error) {
      return { ok: false as const, message: (error as Error).message };
    }
  }, [source]);

  const submit = () => {
    if (!parsed?.ok || busy) return;
    setBusy(true);
    onImport(parsed.result);
  };

  return (
    <div className="modal-veil" onPointerDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="tool-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </header>

        <div className="modal-examples">
          <span>Exemples :</span>
          {EXAMPLES.map((example) => (
            <button key={example.label} type="button" onClick={() => setSource(example.source)}>
              {example.label}
            </button>
          ))}
        </div>

        <textarea
          ref={areaRef}
          className="plantuml-input"
          value={source}
          spellCheck={false}
          placeholder={'@startuml\nclass Personne\nclass Etudiant\nPersonne <|-- Etudiant\n@enduml'}
          onChange={(e) => setSource(e.target.value)}
        />

        <div className="modal-report">
          {!parsed && <p className="muted">Collez un texte PlantUML : classes, séquence, cas d’utilisation ou carte mentale.</p>}
          {parsed && !parsed.ok && <p className="error">{parsed.message}</p>}
          {parsed?.ok && (
            <>
              <p className="ok-line">
                {LABELS[parsed.result.kind] ?? parsed.result.kind} · {parsed.result.diagram.nodes.length} forme
                {parsed.result.diagram.nodes.length > 1 ? 's' : ''} · {parsed.result.diagram.edges.length} lien
                {parsed.result.diagram.edges.length > 1 ? 's' : ''}
              </p>
              {Boolean(parsed.result.warnings.length) && (
                <ul className="warnings">
                  {parsed.result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <footer className="modal-foot">
          <span className="muted">La mise en page est recalculée : PlantUML confie la sienne à Graphviz.</span>
          <div>
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="button" className="btn-primary" disabled={!parsed?.ok || busy} onClick={submit}>
              {actionLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

const LABELS: Record<string, string> = {
  'uml-class': 'Diagramme de classes',
  'uml-sequence': 'Diagramme de séquence',
  'uml-usecase': "Diagramme de cas d'utilisation",
  mindmap: 'Carte mentale',
};
