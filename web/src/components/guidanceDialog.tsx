import type { JSX, ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Shared dialog behaviour for the intro modal and the help panel:
 * focus moves in on open and is trapped (Tab / Shift+Tab cycle),
 * Escape closes, and focus returns to whatever had it before.
 */
export function useFocusTrap(open: boolean, onClose: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevActive = typeof document !== "undefined" ? document.activeElement : null;
    const restore = (): void => {
      // Return focus to what had it (e.g. the Act input or the "?" button).
      const prev = prevActive as HTMLElement | null;
      if (prev !== null && typeof prev.focus === "function") {
        try {
          prev.focus();
        } catch {
          /* element gone — nothing to restore */
        }
      }
    };
    const frame = requestAnimationFrame(() => {
      const box = ref.current;
      if (box === null) return;
      const focusables = box.querySelectorAll<HTMLElement>("button, input, select, textarea, [href], [tabindex]:not([tabindex=\"-1\"])");
      if (focusables.length > 0) focusables[0]?.focus();
      else box.focus();
    });
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const box = ref.current;
      if (box === null) return;
      const focusables = box.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])");
      if (focusables.length === 0) {
        e.preventDefault();
        box.focus();
        return;
      }
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      restore();
    };
  }, [open ]);

  return ref;
}

/** Centered modal shell: dim backdrop, angled V3 panel, snappy motion. */
export function GuidanceOverlay({
  open,
  labelledBy,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}): JSX.Element {
  const reduced = useReducedMotion();
  const trapRef = useFocusTrap(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="presentation"
          initial={reduced ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          style={backdropStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            className="panel-cut"
            initial={reduced ? false : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: [0.175, 0.885, 0.32, 1.275] }}
            style={wide ? panelWideStyle : panelStyle}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const backdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  background: "rgba(12, 9, 16, 0.82)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  overflowY: "auto",
} as const;

const panelStyle = {
  background: "#1A1421",
  border: "1px solid #5A4A68",
  borderTop: "4px solid #B44DFF",
  padding: "26px 26px 22px",
  width: "100%",
  maxWidth: 640,
  maxHeight: "90dvh",
  overflowY: "auto",
  outline: "none",
} as const;

const panelWideStyle = { ...panelStyle, maxWidth: 760 } as const;
