import { useEffect, useState } from "react";

const STORAGE_KEY = "office:code:draft";

export default function Code() {
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
        <h1>Code editor</h1>
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
