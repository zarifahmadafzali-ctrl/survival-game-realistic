import { createRoot } from "react-dom/client";
import { Game } from "./game/Game";
import { installErrorLog } from "./game/debug";
import "./styles.css";

installErrorLog();
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("contextmenu", (e) => e.preventDefault());
createRoot(document.getElementById("root")!).render(<Game />);
