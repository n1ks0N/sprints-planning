import * as React from "react";

type UseInViewOptions = {
  rootMargin?: string;
  threshold?: number | number[];
};

export default function useInView(
  options: UseInViewOptions = {}
): [React.RefCallback<Element>, boolean] {
  const { rootMargin = "0px", threshold = 0 } = options;
  const [inView, setInView] = React.useState(() => {
    if (typeof window === "undefined") return true;
    if (!("IntersectionObserver" in window)) return true;
    return false;
  });
  const observerRef = React.useRef<IntersectionObserver | null>(null);

  const cleanupObserver = React.useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  const ref = React.useCallback(
    (node: Element | null) => {
      if (typeof window === "undefined") return;
      if (!("IntersectionObserver" in window)) return;

      cleanupObserver();

      if (!node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          if (entry.isIntersecting) {
            setInView(true);
            cleanupObserver();
          }
        },
        { rootMargin, threshold }
      );
      observerRef.current.observe(node);
    },
    [cleanupObserver, rootMargin, threshold]
  );

  React.useEffect(() => cleanupObserver, [cleanupObserver]);

  return [ref, inView];
}
