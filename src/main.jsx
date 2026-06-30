import { createRoot } from "react-dom/client";

// Design tokens (light + dark) and all application-chrome styling. Ported
// verbatim from the prototype. The font @font-face/@import rules live in
// colors_and_type.css; url("./fonts/..") resolve relative to that file.
import "../colors_and_type.css";
import "./styles.css";

// Side-effect import: layoutEngine publishes the `window.LayoutEngine`
// geometry service (and `window.computeAutoLayoutEngine`). It is consumed by
// canvas/rightPanel via that global singleton, so nothing imports it by name —
// it must be pulled in here so the module executes.
import "./layoutEngine.jsx";

import { App } from "./app.jsx";

createRoot(document.getElementById("root")).render(<App />);
