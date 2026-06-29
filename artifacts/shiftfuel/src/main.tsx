import "./index.css";
import App from "./App";
import { createRoot } from "react-dom/client";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(<App />);
}
