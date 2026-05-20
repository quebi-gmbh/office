import { useEffect, useState } from "react";

const STORAGE_KEY = "office:text:draft";

export default function Text() {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(localStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, value);
  }, [value]);

  return (
    <section className="text">
      <header className="text__bar">
        <h1>Text editor</h1>
        <small>autosaved locally — syntax highlighting coming soon</small>
      </header>
      <textarea
        className="text__area"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Start typing…"
        spellCheck={false}
      />
    </section>
  );
}
