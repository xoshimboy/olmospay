import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { TERMS_SECTIONS, TERMS_VERSION } from '../data/terms.js';

interface TermsDialogProps {
  open: boolean;
  required: boolean;
  accepting: boolean;
  error: string;
  onAccept: () => void;
  onClose: () => void;
}

export function TermsDialog({ open, required, accepting, error, onAccept, onClose }: TermsDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const checkboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    setConfirmed(false);
    (checkboxRef.current || closeButtonRef.current)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!required) onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        aria-describedby="terms-description"
        onKeyDown={handleDialogKeyDown}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#007AFF]/10 text-[#007AFF] dark:bg-[#E5B94C]/15 dark:text-[#E5B94C]">
              <ShieldCheck size={22} />
            </span>
            <div>
              <h2 id="terms-title" className="font-display text-lg font-bold text-[var(--ink)] sm:text-xl">Foydalanish qoidalari</h2>
              <p id="terms-description" className="mt-0.5 text-xs text-[var(--ink-muted)]">Versiya {TERMS_VERSION}</p>
            </div>
          </div>
          {!required && (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Qoidalarni yopish"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
            >
              <X size={18} />
            </button>
          )}
        </header>

        <div className="overflow-y-auto px-5 py-4 sm:px-6" tabIndex={0} aria-label="Qoidalar matni">
          <div className="space-y-5">
            {TERMS_SECTIONS.map((section) => (
              <section key={section.title} aria-labelledby={`terms-section-${section.title.slice(0, 1)}`}>
                <h3 id={`terms-section-${section.title.slice(0, 1)}`} className="font-display text-sm font-bold text-[var(--ink)]">{section.title}</h3>
                <div className="mt-2 space-y-2">
                  {section.clauses.map((clause) => (
                    <p key={clause.slice(0, 24)} className="text-sm leading-6 text-[var(--ink-muted)]">{clause}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className="mt-5 rounded-2xl border border-[#007AFF]/15 bg-[#007AFF]/5 p-4 text-sm font-medium leading-6 text-[var(--ink)] dark:border-[#E5B94C]/20 dark:bg-[#E5B94C]/5">
            Qoidalarni qabul qilish orqali siz yuqoridagi shartlarga e’tirozingiz yo‘qligini bildirasiz.
          </p>
        </div>

        <footer className="space-y-3 border-t border-[var(--line)] bg-[var(--surface)] px-5 py-4 sm:px-6">
          {required ? (
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-[var(--ink)]">
              <input
                ref={checkboxRef}
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#007AFF]"
              />
              <span>Qoidalarni o‘qidim va qabul qilaman.</span>
            </label>
          ) : null}
          {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {!required ? (
              <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-[var(--line)] px-5 text-sm font-semibold text-[var(--ink)]">Yopish</button>
            ) : null}
            {required ? (
              <button
                type="button"
                onClick={onAccept}
                disabled={!confirmed || accepting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#007AFF] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[#E5B94C] dark:text-[#09090B]"
              >
                {accepting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                <span>{accepting ? 'Saqlanmoqda…' : 'Qabul qilaman'}</span>
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}
