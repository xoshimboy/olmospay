import { useEffect, useState } from 'react';

interface AppLoaderProps {
  visible: boolean;
}

export function AppLoader({ visible }: AppLoaderProps) {
  const [rendered, setRendered] = useState(visible);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      setExiting(false);
      return;
    }

    if (!rendered) return;
    setExiting(true);
    const timeout = window.setTimeout(() => setRendered(false), 420);
    return () => window.clearTimeout(timeout);
  }, [visible, rendered]);

  if (!rendered) return null;

  return (
    <div
      className={`app-loader ${exiting ? 'app-loader--exit' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Olmos Pay yuklanmoqda"
      aria-hidden={exiting}
    >
      <div className="app-loader__mark" aria-hidden="true">
        <svg className="app-loader__flower app-loader__flower--one" viewBox="0 0 100 100">
          <path d="M63 37c-7-4-4-27-13-27s-6 23-13 27-27 4-27 13 20 9 27 13 4 27 13 27 6-23 13-27 27-4 27-13-20-9-27-13Z" />
        </svg>
        <svg className="app-loader__flower app-loader__flower--two" viewBox="0 0 100 100">
          <path d="M63 37c-7-4-4-27-13-27s-6 23-13 27-27 4-27 13 20 9 27 13 4 27 13 27 6-23 13-27 27-4 27-13-20-9-27-13Z" />
        </svg>
        <svg className="app-loader__flower app-loader__flower--three" viewBox="0 0 100 100">
          <path d="M63 37c-7-4-4-27-13-27s-6 23-13 27-27 4-27 13 20 9 27 13 4 27 13 27 6-23 13-27 27-4 27-13-20-9-27-13Z" />
        </svg>
      </div>
      <span className="app-loader__label">Olmos Pay</span>
      <span className="app-loader__hint">Ilova tayyorlanmoqda</span>
    </div>
  );
}
