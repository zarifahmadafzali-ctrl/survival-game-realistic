import { useEffect, useState } from "react";
import { clearErrors, getErrors } from "./debug";
import { resetSettings, settings, subscribeSettings, updateSettings, type Quality } from "./settings";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => subscribeSettings(() => tick((n) => n + 1)), []);
  const s = settings;
  const canFs = !!document.documentElement.requestFullscreen;
  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const errs = getErrors();
  return (
    <div className="sw-settings" role="dialog" aria-label="Settings">
      <div className="sw-sheet">
        <h2>Settings</h2>
        <label className="sw-field">
          Look sensitivity: {s.sens.toFixed(1)}
          <input type="range" min={0.4} max={2.5} step={0.1} value={s.sens} onChange={(e) => updateSettings({ sens: Number(e.target.value) })} />
        </label>
        <label className="sw-field">
          Field of view: {s.fov}
          <input type="range" min={60} max={95} step={1} value={s.fov} onChange={(e) => updateSettings({ fov: Number(e.target.value) })} />
        </label>
        <label className="sw-field">
          Volume: {Math.round(s.volume * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => updateSettings({ volume: Number(e.target.value) })} />
        </label>
        <div className="sw-field">
          Graphics (lower = faster on phones)
          <div className="sw-seg">
            {(["low", "medium", "high"] as Quality[]).map((q) => (
              <button key={q} type="button" className={s.quality === q ? "on" : ""} onClick={() => updateSettings({ quality: q })}>
                {q}
              </button>
            ))}
          </div>
        </div>
        <label className="sw-check">
          <input type="checkbox" checked={s.invertY} onChange={(e) => updateSettings({ invertY: e.target.checked })} /> Invert look (Y)
        </label>
        <label className="sw-check">
          <input type="checkbox" checked={s.haptics} onChange={(e) => updateSettings({ haptics: e.target.checked })} /> Vibration
        </label>
        <label className="sw-check">
          <input type="checkbox" checked={s.showFps} onChange={(e) => updateSettings({ showFps: e.target.checked })} /> Show FPS
        </label>
        <label className="sw-check">
          <input type="checkbox" checked={s.minimap} onChange={(e) => updateSettings({ minimap: e.target.checked })} /> Minimap
        </label>
        {errs.length > 0 && (
          <div className="sw-field">
            Error log
            <pre className="sw-log">{errs.join("\n")}</pre>
            <button type="button" className="sw-btn ghost" onClick={() => { clearErrors(); tick((n) => n + 1); }}>
              Clear log
            </button>
          </div>
        )}
        <div className="sw-row">
          {canFs && (
            <button type="button" className="sw-btn ghost" onClick={toggleFs}>
              Fullscreen
            </button>
          )}
          <button type="button" className="sw-btn ghost" onClick={resetSettings}>
            Reset
          </button>
          <button type="button" className="sw-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
