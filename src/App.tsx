import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import HomePage from './components/HomePage';
import HomePageV2 from './components/HomePageV2';

const Dashboard = lazy(() => import('./DashboardApp'));
const isDashboard = () => /^#\/symbols(?:\/|$)/.test(location.hash)
  || new URLSearchParams(location.search).has('instrument');

export default function App() {
  const [creative, setCreative] = useState(() => location.hash === '#/creative');
  const [showDashboard, setShowDashboard] = useState(isDashboard);
  const view = showDashboard ? 'dashboard' : creative ? 'creative' : 'home';
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' });
  }, [view]);
  useEffect(() => {
    const sync = () => { setShowDashboard(isDashboard()); if (location.hash === '#/' || location.hash === '#/creative') setCreative(location.hash === '#/creative'); };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  return showDashboard ? (
    <Suspense fallback={<main dir="rtl" role="status" className="p-6">در حال بارگذاری داشبورد…</main>}>
      <div key={view} className="fd-page-enter"><Dashboard /></div>
    </Suspense>
  ) : (
    <div key={view} className="fd-page-enter">{creative ? <HomePageV2 /> : <HomePage />}</div>
  );
}
