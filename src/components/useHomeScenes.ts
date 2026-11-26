import { useEffect, useRef, useState } from 'react';

const cooldown = 850;
const wheelQuietTime = 180;

export function useHomeScenes() {
  const root = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0);
  const [active, setActive] = useState(0);

  function jump(index: number, focus = false) {
    const scene = root.current?.querySelectorAll<HTMLElement>('[data-scene]')[index];
    if (!scene) return;
    const header = root.current?.querySelector('header')?.getBoundingClientRect().height ?? 0;
    if (focus) scene.focus({ preventScroll: true });
    lockUntil.current = performance.now() + cooldown;
    window.scrollTo({
      top: Math.max(0, window.scrollY + scene.getBoundingClientRect().top - header),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  useEffect(() => {
    const home = root.current;
    if (!home) return;
    const scenes = Array.from(home.querySelectorAll<HTMLElement>('[data-scene]'));
    const desktopMotion = matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
    let frame = 0;
    let lastWheel = -Infinity;
    let pagingGesture = false;

    const current = () => {
      const center = window.innerHeight / 2;
      return scenes.findIndex(scene => {
        const { top, bottom } = scene.getBoundingClientRect();
        return top <= center && bottom > center;
      });
    };

    const syncScene = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const index = current();
        if (index >= 0) setActive(index);
      });
    };

    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= .45) entry.target.setAttribute('data-entered', '');
        else if (!entry.isIntersecting) entry.target.removeAttribute('data-entered');
      }
    }, { threshold: [0, .45] });
    for (const scene of scenes) observer?.observe(scene);
    if (observer) home.classList.add('fd-observed');

    function onWheel(event: WheelEvent) {
      if (!desktopMotion.matches || event.ctrlKey || event.shiftKey || event.defaultPrevented
        || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || !event.cancelable) return;
      const now = performance.now();
      if (now - lastWheel > wheelQuietTime) pagingGesture = false;
      lastWheel = now;
      if (pagingGesture || now < lockUntil.current) {
        event.preventDefault();
        return;
      }
      const index = current();
      const next = index + Math.sign(event.deltaY);
      if (index < 0 || next < 0 || next >= scenes.length) return;
      event.preventDefault();
      pagingGesture = true;
      jump(next);
    }

    function onKey(event: KeyboardEvent) {
      if (!desktopMotion.matches || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
        || (event.target instanceof Element && event.target.closest('a,button,input,select,textarea,[contenteditable]'))) return;
      const down = event.key === 'ArrowDown' || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey);
      const up = event.key === 'ArrowUp' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey);
      if (!down && !up) return;
      const index = current();
      const next = index + (down ? 1 : -1);
      if (index < 0 || next < 0 || next >= scenes.length) return;
      event.preventDefault();
      if (!event.repeat && performance.now() >= lockUntil.current) jump(next, true);
    }

    syncScene();
    window.addEventListener('scroll', syncScene, { passive: true });
    window.addEventListener('resize', syncScene);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      observer?.disconnect();
      home.classList.remove('fd-observed');
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', syncScene);
      window.removeEventListener('resize', syncScene);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return { root, active, jump };
}
