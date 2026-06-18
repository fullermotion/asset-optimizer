import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faFileExport,
  faPenNib,
  faSliders,
  faVolumeXmark
} from "@fortawesome/free-solid-svg-icons";
import type { ActivePanel, OptimizerSettings } from "../types";
import { settingsForPreset } from "../data/presets";

interface SettingsPanelProps {
  activePanel: ActivePanel;
  settings: OptimizerSettings;
  onPanelChange: (panel: ActivePanel) => void;
  onSettingsChange: (settings: OptimizerSettings) => void;
}

export function SettingsPanel({ activePanel, settings, onPanelChange, onSettingsChange }: SettingsPanelProps) {
  const update = <K extends keyof OptimizerSettings>(key: K, value: OptimizerSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value, preset: key === "preset" ? value as OptimizerSettings["preset"] : "custom" });
  };

  const updateRename = (key: keyof OptimizerSettings["rename"], value: string | number | boolean) => {
    onSettingsChange({
      ...settings,
      rename: {
        ...settings.rename,
        [key]: value
      }
    });
  };

  return (
    <aside className="settings-panel">
      <div className="tabs" role="tablist" aria-label="Processing options">
        <button className={activePanel === "optimize" ? "active" : ""} type="button" onClick={() => onPanelChange("optimize")}>
          <FontAwesomeIcon icon={faCompress} />
          <span>Optimize</span>
        </button>
        <button className={activePanel === "convert" ? "active" : ""} type="button" onClick={() => onPanelChange("convert")}>
          <FontAwesomeIcon icon={faFileExport} />
          <span>Convert</span>
        </button>
        <button className={activePanel === "rename" ? "active" : ""} type="button" onClick={() => onPanelChange("rename")}>
          <FontAwesomeIcon icon={faPenNib} />
          <span>Rename</span>
        </button>
      </div>

      <div className="settings-stack">
        <section className="settings-group">
          <h2>
            <FontAwesomeIcon icon={faSliders} />
            Balanced
          </h2>
          <label className="field">
            <span>Preset</span>
            <select
              value={settings.preset}
              onChange={(event) => onSettingsChange(settingsForPreset(event.target.value as OptimizerSettings["preset"], settings))}
            >
              <option value="balanced">Balanced</option>
              <option value="smallest">Smallest file</option>
              <option value="quality">Best quality</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </section>

        {activePanel === "optimize" ? (
          <section className="settings-group">
            <h2>Quality</h2>
            <RangeField label="Image quality" value={settings.quality} onChange={(value) => update("quality", value)} />
            <RangeField label="Video quality" value={settings.videoQuality} onChange={(value) => update("videoQuality", value)} />
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.preserveMetadata}
                onChange={(event) => update("preserveMetadata", event.target.checked)}
              />
              <span>Preserve metadata</span>
            </label>
          </section>
        ) : null}

        {activePanel === "optimize" ? (
          <section className="settings-group">
            <h2>Resize</h2>
            <div className="split-fields">
              <NumberField label="Max width" value={settings.maxWidth} onChange={(value) => update("maxWidth", value)} />
              <NumberField label="Max height" value={settings.maxHeight} onChange={(value) => update("maxHeight", value)} />
            </div>
            <PercentageField value={settings.resizePercent} onChange={(value) => update("resizePercent", value)} />
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.resizeMode === "percentage"}
                onChange={(event) => update("resizeMode", event.target.checked ? "percentage" : "manual")}
              />
              <span>Use percentage resize</span>
            </label>
          </section>
        ) : null}

        {activePanel === "convert" ? (
          <section className="settings-group">
            <h2>Output format</h2>
            <label className="field">
              <span>Format</span>
              <select value={settings.outputFormat} onChange={(event) => update("outputFormat", event.target.value as OptimizerSettings["outputFormat"])}>
                <option value="auto">Auto recommended</option>
                <option value="original">Keep original</option>
                <option value="webp">Image: WebP</option>
                <option value="jpeg">Image: JPEG</option>
                <option value="png">Image: PNG</option>
                <option value="avif">Image: AVIF</option>
                <option value="mp4">Video: MP4</option>
                <option value="webm">Video: WebM</option>
                <option value="mov">Video: MOV</option>
                <option value="mkv">Video: MKV</option>
              </select>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={settings.stripAudio} onChange={(event) => update("stripAudio", event.target.checked)} />
              <span>
                <FontAwesomeIcon icon={faVolumeXmark} />
                Strip video audio
              </span>
            </label>
          </section>
        ) : null}

        {activePanel === "rename" ? (
          <section className="settings-group">
            <h2>Batch rename</h2>
            <label className="field">
              <span>Pattern</span>
              <input value={settings.rename.pattern} onChange={(event) => updateRename("pattern", event.target.value)} />
            </label>
            <div className="split-fields">
              <label className="field">
                <span>Prefix</span>
                <input value={settings.rename.prefix} onChange={(event) => updateRename("prefix", event.target.value)} />
              </label>
              <label className="field">
                <span>Suffix</span>
                <input value={settings.rename.suffix} onChange={(event) => updateRename("suffix", event.target.value)} />
              </label>
            </div>
            <div className="split-fields">
              <label className="field">
                <span>Find</span>
                <input value={settings.rename.find} onChange={(event) => updateRename("find", event.target.value)} />
              </label>
              <label className="field">
                <span>Replace</span>
                <input value={settings.rename.replace} onChange={(event) => updateRename("replace", event.target.value)} />
              </label>
            </div>
            <div className="split-fields">
              <NumberField label="Padding" value={settings.rename.padding} onChange={(value) => updateRename("padding", value)} />
              <label className="field">
                <span>Case</span>
                <select value={settings.rename.caseMode} onChange={(event) => updateRename("caseMode", event.target.value)}>
                  <option value="none">No change</option>
                  <option value="lower">lowercase</option>
                  <option value="upper">UPPERCASE</option>
                </select>
              </label>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={settings.rename.slugify} onChange={(event) => updateRename("slugify", event.target.checked)} />
              <span>Slugify filenames</span>
            </label>
            <p className="token-help">Tokens: {"{name}"} {"{index}"} {"{date}"} {"{width}"} {"{height}"} {"{format}"}</p>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
}

function RangeField({ label, value, suffix = "", onChange }: RangeFieldProps) {
  return (
    <label className="field range-field">
      <span>
        {label}
        <strong>{value}{suffix}</strong>
      </span>
      <input type="range" min="1" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

interface PercentageFieldProps {
  value: number;
  onChange: (value: number) => void;
}

function PercentageField({ value, onChange }: PercentageFieldProps) {
  const reduction = 100 - value;
  const updatePercent = (nextValue: number) => {
    onChange(Math.min(100, Math.max(1, Math.round(nextValue))));
  };

  return (
    <div className="percentage-control">
      <div className="percentage-row">
        <RangeField label="Output scale" value={value} suffix="%" onChange={updatePercent} />
        <label className="field percentage-input">
          <span>Percent</span>
          <input type="number" min="1" max="100" value={value} onChange={(event) => updatePercent(Number(event.target.value))} />
        </label>
      </div>
      <div className="range-scale">
        <span>1%</span>
        <strong>{reduction}% reduction</strong>
        <span>100%</span>
      </div>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
