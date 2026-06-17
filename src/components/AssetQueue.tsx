import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faCircleExclamation,
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
          <article className={`asset-row status-${asset.status}`} key={asset.id}>
            <div className="asset-thumb">
              {asset.thumbnail ? (
                <img src={asset.thumbnail} alt="" />
              ) : (
                <FontAwesomeIcon icon={asset.type === "video" ? faFileVideo : faFileImage} />
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
                {asset.width && asset.height ? ` · ${asset.width}x${asset.height}` : ""}
                {asset.duration ? ` · ${formatDuration(asset.duration)}` : ""} · {formatBytes(asset.size)}
              </p>
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
        ))}
      </div>
    </section>
  );
}
