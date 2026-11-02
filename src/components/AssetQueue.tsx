import { memo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faCircleExclamation,
  faFileAudio,
  faFileImage,
  faFileVideo,
  faFolderOpen,
  faRotateRight,
  faTrashCan
} from "@fortawesome/free-solid-svg-icons";
import type { AssetItem, OptimizerSettings } from "../types";
import { formatBytes, formatDuration, shortPath } from "../utils/format";
import { previewOutputName } from "../utils/rename";
import { ProgressBar } from "./ProgressBar";

interface AssetQueueProps {
  assets: AssetItem[];
  settings: OptimizerSettings;
  onRemove: (id: string) => void;
  onClearDone: () => void;
  onReveal: (path: string) => void;
}

export function AssetQueue({ assets, settings, onRemove, onClearDone, onReveal }: AssetQueueProps) {
  const doneCount = assets.filter((asset) => asset.status === "done").length;

  return (
    <section className="queue-panel">
      <div className="section-heading">
        <div>
          <h2>Queue</h2>
          <p>{assets.length === 0 ? "No assets added yet" : `${doneCount} completed of ${assets.length}`}</p>
        </div>
        <button className="button subtle" type="button" onClick={onClearDone} disabled={doneCount === 0}>
          <FontAwesomeIcon icon={faRotateRight} />
          <span>Clear done</span>
        </button>
      </div>

      <div className="asset-list">
        {assets.map((asset, index) => (
          <AssetRow key={asset.id} asset={asset} index={index} settings={settings} onRemove={onRemove} onReveal={onReveal} />
        ))}
      </div>
    </section>
  );
}

interface AssetRowProps {
  asset: AssetItem;
  index: number;
  settings: OptimizerSettings;
  onRemove: (id: string) => void;
  onReveal: (path: string) => void;
}

// Progress updates replace one asset object at a time, so memoizing rows keeps the rest of the queue from re-rendering.
const AssetRow = memo(function AssetRow({ asset, index, settings, onRemove, onReveal }: AssetRowProps) {
  return (
    <article className={`asset-row status-${asset.status}`}>
      <div className="asset-thumb">
        {asset.thumbnail ? (
          <img src={asset.thumbnail} alt="" />
        ) : (
          <FontAwesomeIcon icon={asset.type === "video" ? faFileVideo : asset.type === "audio" ? faFileAudio : faFileImage} />
        )}
      </div>

      <div className="asset-main">
        <div className="asset-title-line">
          <h3>{asset.name}</h3>
          <span className={`status-chip ${asset.status}`}>
            <FontAwesomeIcon icon={asset.status === "error" ? faCircleExclamation : faCheckCircle} />
            {asset.status}
          </span>
        </div>
        <p className="asset-meta">
          {asset.type}
          {asset.duration ? ` · ${formatDuration(asset.duration)}` : ""} · {formatBytes(asset.size)}
        </p>
        <p className="asset-dimensions">{asset.type === "audio" ? formatAudioDetails(asset) : formatAssetDimensions(asset, settings)}</p>
        <p className="asset-path">{shortPath(asset.path)}</p>
        {asset.status === "running" ? <ProgressBar value={asset.progress} /> : null}
      </div>

      <div className="asset-output">
        <span>{previewOutputName(asset, settings, index + 1)}</span>
        <strong>
          {asset.outputSize ? formatBytes(asset.outputSize) : asset.savings !== undefined ? `${asset.savings}%` : asset.message || "Ready"}
        </strong>
      </div>

      <div className="row-actions">
        {asset.outputPath ? (
          <button className="icon-button" type="button" onClick={() => onReveal(asset.outputPath!)} title="Reveal output">
            <FontAwesomeIcon icon={faFolderOpen} />
          </button>
        ) : null}
        <button className="icon-button" type="button" onClick={() => onRemove(asset.id)} title="Remove asset">
          <FontAwesomeIcon icon={faTrashCan} />
        </button>
      </div>
    </article>
  );
});

function formatAudioDetails(asset: AssetItem): string {
  const details = [
    asset.sampleRate ? `${Number((asset.sampleRate / 1000).toFixed(1))} kHz` : "",
    asset.channels === 1 ? "Mono" : asset.channels === 2 ? "Stereo" : asset.channels ? `${asset.channels} channels` : "",
    asset.bitrate ? `${Math.round(asset.bitrate / 1000)} kbps` : ""
  ].filter(Boolean);

  return details.length > 0 ? details.join(" · ") : "Audio details unavailable";
}

function formatAssetDimensions(asset: AssetItem, settings: OptimizerSettings): string {
  if (!asset.width || !asset.height) {
    return "Start size unavailable";
  }

  const startingSize = `Start ${asset.width} x ${asset.height}px${asset.wideGamut ? " · Wide gamut" : ""}`;

  if (settings.resizeMode !== "percentage") {
    return startingSize;
  }

  const percent = clamp(settings.resizePercent, 1, 100);
  const outputWidth = Math.max(1, Math.round(asset.width * (percent / 100)));
  const outputHeight = Math.max(1, Math.round(asset.height * (percent / 100)));

  return `${startingSize} -> ${outputWidth} x ${outputHeight}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
