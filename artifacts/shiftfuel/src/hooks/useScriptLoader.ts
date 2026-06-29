import { useState, useEffect } from "react";

export function useScriptLoader(urls: string[]): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (urls.length === 0) { setLoaded(true); return; }
    let cancelled = false;
    let remaining = urls.length;

    urls.forEach((url) => {
      const existing = document.querySelector(`script[src="${url}"]`);
      if (existing) {
        remaining--;
        if (remaining === 0 && !cancelled) setLoaded(true);
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.onload = () => {
        remaining--;
        if (remaining === 0 && !cancelled) setLoaded(true);
      };
      script.onerror = () => {
        remaining--;
        if (remaining === 0 && !cancelled) setLoaded(true);
      };
      document.body.appendChild(script);
    });

    return () => { cancelled = true; };
  }, []);

  return loaded;
}
