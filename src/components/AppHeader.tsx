import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleHalfStroke,
  faFolderOpen,
  faGaugeHigh,
  faMoon,
  faPlus,
  faSun
} from "@fortawesome/free-solid-svg-icons";
import type { ThemeMode } from "../types";
import { shortPath } from "../utils/format";

interface AppHeaderProps {
  assetCount: number;
  outputDir: string;
  theme: ThemeMode;
  onAddFiles: () => void;
  onChooseOutput: () => void;
  onToggleTheme: () => void;
}

export function AppHeader({
  assetCount,
  outputDir,
  theme,
  onAddFiles,
  onChooseOutput,
  onToggleTheme
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">
          <FontAwesomeIcon icon={faGaugeHigh} />
        </span>
        <div>
          <h1>Asset Optimizer</h1>
          <p>{assetCount === 0 ? "Ready for images and videos" : `${assetCount} asset${assetCount === 1 ? "" : "s"} queued`}</p>
        </div>
      </div>

      <div className="header-actions">
        <button className="button subtle" type="button" onClick={onChooseOutput} title="Choose output folder">
          <FontAwesomeIcon icon={faFolderOpen} />
          <span>{outputDir ? shortPath(outputDir) : "Output folder"}</span>
        </button>
        <button className="icon-button" type="button" onClick={onToggleTheme} title="Toggle light or dark mode">
          <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} />
        </button>
        <button className="button primary" type="button" onClick={onAddFiles}>
          <FontAwesomeIcon icon={faPlus} />
          <span>Add assets</span>
        </button>
        <span className="system-icon" title="Theme follows local preference when first opened">
          <FontAwesomeIcon icon={faCircleHalfStroke} />
        </span>
      </div>
    </header>
  );
}
