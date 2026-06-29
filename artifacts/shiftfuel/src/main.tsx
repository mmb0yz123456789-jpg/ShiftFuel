import { createRoot } from "react-dom/client";
import App from "./App";
import "@/lib/supabase";

createRoot(document.getElementById("root")!).render(<App />);
