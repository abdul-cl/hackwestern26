import { forwardRef, useEffect, useRef, useState } from "react";

// Scroll reveals. Content is only hidden once this module has confirmed IntersectionObserver exists
// (the "reveal-ready" class on <html>), so with no JS or an old browser everything is simply visible.
const supported = typeof window !== "undefined" && "IntersectionObserver" in window;
if (supported) document.documentElement.classList.add("reveal-ready");

const callbacks = new WeakMap();
const observer = supported
  ? new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            callbacks.get(e.target)?.();
            observer.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    )
  : null;

/** True once the element has scrolled into view (stays true). */
export function useInView(ref) {
  const [shown, setShown] = useState(!supported);
  useEffect(() => {
    const el = ref.current;
    if (!el || !observer) return;
    callbacks.set(el, () => setShown(true));
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [ref]);
  return shown;
}

/**
 * Fades and slides its content in the first time it scrolls into view.
 * delay (ms) staggers siblings; x / y set where it comes from (CSS lengths, default 18px below).
 * still: don't move or fade this element, only mark it shown (for children that animate on [data-shown]).
 */
const Reveal = forwardRef(function Reveal({ as: Tag = "div", delay = 0, x, y, still = false, style, children, ...rest }, outerRef) {
  const ref = useRef(null);
  const shown = useInView(ref);
  const setRef = (el) => {
    ref.current = el;
    if (typeof outerRef === "function") outerRef(el);
    else if (outerRef) outerRef.current = el;
  };
  return (
    <Tag
      ref={setRef}
      data-reveal={still ? undefined : ""}
      data-shown={shown ? "" : undefined}
      style={{ "--reveal-delay": `${delay}ms`, ...(x != null && { "--reveal-x": x }), ...(y != null && { "--reveal-y": y }), ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export default Reveal;
