import { useCallback, useEffect, useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { EditorPage } from './pages/EditorPage';

/** Routage minimal : « / » pour la liste, « /d/:id » pour l'éditeur. */
function useRoute() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState({}, '', to);
    setPath(to);
  }, []);

  return { path, navigate };
}

export default function App() {
  const { path, navigate } = useRoute();
  const match = /^\/d\/([\w-]+)$/.exec(path);

  useEffect(() => {
    document.title = match ? 'LucidFlow · éditeur' : 'LucidFlow · mes documents';
  }, [match]);

  if (match) {
    return <EditorPage key={match[1]} docId={match[1]} onBack={() => navigate('/')} />;
  }
  return <Dashboard onOpen={(id) => navigate(`/d/${id}`)} />;
}
