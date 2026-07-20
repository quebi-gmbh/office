/**
 * Minimal toast notification.
 * Usage: useToast() → { show, Toast }
 */
import { useCallback, useEffect, useRef, useState } from "react";

type ToastMessage = { id: number; text: string; kind: "info" | "error" };

export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const counter = useRef(0);

  const show = useCallback((text: string, kind: "info" | "error" = "info") => {
    const id = ++counter.current;
    setMessages((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 4000);
  }, []);

  const ToastContainer = () => (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`rounded-lg px-4 py-2.5 text-sm shadow-lg pointer-events-auto ${
            m.kind === "error"
              ? "bg-red-600 text-white"
              : "bg-bg border border-border text-fg"
          }`}
        >
          {m.text}
        </div>
      ))}
    </div>
  );

  return { show, ToastContainer };
}
