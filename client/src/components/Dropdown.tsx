import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  label: ReactNode;
  title?: string;
  align?: 'left' | 'right';
  children: (close: () => void) => ReactNode;
}

export function Dropdown({ label, title, align = 'left', children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      <button type="button" className="tool-btn" title={title} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && <div className={`dropdown-menu ${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
