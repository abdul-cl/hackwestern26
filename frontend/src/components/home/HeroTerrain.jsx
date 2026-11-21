import { lazy, Suspense, useEffect, useState } from "react";
import { useIsDark } from "../../theme";

// The WebGL terrain is a large file: it loads after the page, and only where it will be shown.
const Topography = lazy(() => import("../bits/Topography"));

/** WebGL2 available, a screen wide enough to see it, and the person hasn't asked to save data. */
function canShow() {
  if (typeof window === "undefined") return false;
  if (!window.matchMedia?.("(min-width: 768px)").matches) return false;
  if (navigator.connection?.saveData) return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * The hero's backdrop: a slowly drifting contour map in pine (React Bits Topography), the terrain CareScout searches
 * for you. Purely decorative: fades out toward the text, ignores the pointer, and isn't drawn on phones, without
 * WebGL2, or with Data Saver on. Reduced motion is handled inside Topography (it holds still).
 */
export default function HeroTerrain() {
  const dark = useIsDark();
  const [show, setShow] = useState(false);
  // Start the terrain after the headline and buttons have arrived: compiling its WebGL shaders can hold up the page
  // for a moment, and the intro text matters more. It fades in on its own.
  useEffect(() => {
    if (!canShow()) return;
    let idle;
    const timer = setTimeout(() => {
      idle = (window.requestIdleCallback || ((fn) => setTimeout(fn, 1)))(() => setShow(true), { timeout: 1200 });
    }, 1100);
    return () => {
      clearTimeout(timer);
      if (idle && window.cancelIdleCallback) window.cancelIdleCallback(idle);
    };
  }, []);
  if (!show) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 animate-fade-in [animation-duration:1.6s] [mask-image:radial-gradient(120%_90%_at_70%_40%,#000_35%,transparent_80%)]"
    >
      <Suspense fallback={null}>
        <Topography
          key={dark ? "dark" : "light"}
          color={dark ? "#62BB99" : "#23876C"}
          lightMode={!dark}
          opacity={dark ? 0.55 : 0.45}
          lineCount={24}
          lineWidth={1}
          speed={0.12}
          morph={0.15}
          tilt={38}
          glow={dark ? 0.5 : 0.25}
          fog={0.45}
          markers="dots"
          mouseInteraction={false}
          clickEffect="none"
          dpr={Math.min(window.devicePixelRatio || 1, 1.5)}
        />
      </Suspense>
    </div>
  );
}
