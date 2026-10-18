import { useEffect, useRef, useState } from "react";
import { SettingsPanel } from "./SettingsPanel";
import { loadGame } from "./saveGame";
import { mountGame } from "./engine";

export function Game() {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hasSave] = useState(() => !!loadGame());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      return mountGame(el);
    } catch (e) {
      setErr(String((e as Error)?.stack || e));
    }
  }, []);

  return (
    <div ref={ref} className="game-root">
      <div className="sw-fps" id="sw-fps" hidden />
      <div className="sw-layer sw-loading" id="sw-loading">
        <div className="sw-load-card">
          <p id="sw-load-text">Loading…</p>
          <div className="sw-load-bar indet"><i id="sw-load-fill" /></div>
        </div>
      </div>
      <div className="sw-layer sw-menu" id="sw-menu">
        <div className="sw-card">
          <p className="sw-kicker">Basin range · dawn watch</p>
          <h1 className="sw-title">Stillwater</h1>
          <hr className="sw-rule" />
          <p className="sw-lead">
            A cold lake under snow ridges, pine on the shoulders, and a creek that cuts the meadow.
            When the sun drops, the wolves come down to the shore.
          </p>
          <button id="sw-start" className="sw-btn" type="button">
            Start
          </button>
          {hasSave && (
            <button id="sw-continue" className="sw-btn ghost" type="button">
              Continue
            </button>
          )}
          <button className="sw-btn ghost" type="button" onClick={() => setOpen(true)}>
            Settings
          </button>
          <p className="sw-lead">Phone: left thumb moves, drag the right side to look. Landscape works best.</p>
          <ul className="sw-keys">
            <li>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>
              Move
            </li>
            <li>
              <kbd>Mouse</kbd>
              Aim
            </li>
            <li>
              <kbd>Click</kbd>
              Fire
            </li>
            <li>
              <kbd>R</kbd>
              Reload
            </li>
            <li>
              <kbd>Shift</kbd>
              Sprint
            </li>
            <li>
              <kbd>Space</kbd>
              Jump
            </li>
          </ul>
        </div>
      </div>

            <div id="sw-scope" className="sw-scope" hidden>
        <div className="sw-scope-ring" />
        <div className="sw-scope-reticle" />
      </div>
      <div className="sw-layer sw-hud" id="sw-hud" hidden>
        <div className="sw-top">
          <div>
            <div className="sw-place" id="sw-place">
              Basin Meadow
            </div>
            <div className="sw-clock" id="sw-clock">
              07:40
            </div>
          </div>
          <div className="sw-compass" id="sw-bearing">
            N
          </div>
          <div className="sw-row">
            <button id="sw-phase" className="sw-phase" type="button">
              Morning
            </button>
            <button id="sw-pause-open" className="sw-phase" type="button">
              Pause
            </button>
            <div className="sw-kills" id="sw-kills">
              0 down
            </div>
          </div>
        </div>
        <div className="sw-cross" id="sw-cross">
          <i />
        </div>
        <canvas className="sw-minimap" id="sw-minimap" />
        <div className="sw-msg" id="sw-msg" />
        <div className="sw-dmg" id="sw-dmg" />
        <div className="sw-bottom">
          <div className="sw-health">
            <span>Condition</span>
            <div className="sw-bar">
              <i id="sw-hp" />
            </div>
          </div>
          <div className="sw-ammo">
            <b id="sw-mag">30</b>
            <em id="sw-res">90 held</em>
          </div>
        </div>
      </div>

      <div className="sw-touch" id="sw-touch">
        <div className="sw-pad" id="sw-pad">
          <div className="sw-knob" id="sw-knob" />
        </div>
        <div className="sw-actions">
          <button id="sw-fire" className="fire" type="button">
            Fire
          </button>
          <button id="sw-zoom" type="button">
            Scope
          </button>
          <button id="sw-jump" type="button">
            Jump
          </button>
          <button id="sw-reload" type="button">
            Reload
          </button>
          <button id="sw-sprint" type="button">
            Sprint
          </button>
        </div>
      </div>

      <div className="sw-layer sw-pause" id="sw-pause" hidden>
        <div className="sw-panel">
          <h2>Hold</h2>
          <p>The valley keeps turning while you do. Morning, noon, dusk, night — the chip in the corner scrubs the sky.</p>
          <div className="sw-row">
            <button id="sw-resume" className="sw-btn" type="button">
              Resume
            </button>
            <button id="sw-new" className="sw-btn ghost" type="button">
              New valley
            </button>
            <button className="sw-btn ghost" type="button" onClick={() => setOpen(true)}>
              Settings
            </button>
          </div>
        </div>
      </div>

      <div className="sw-layer sw-dead" id="sw-dead" hidden>
        <div className="sw-panel">
          <h2>Down</h2>
          <p id="sw-dead-line">The shore goes quiet.</p>
          <button id="sw-again" className="sw-btn" type="button">
            Wake at camp
          </button>
        </div>
      </div>
      {open && <SettingsPanel onClose={() => setOpen(false)} />}
      {err && <pre className="sw-crash">{"Game failed to start:\n" + err}</pre>}
    </div>
  );
}
