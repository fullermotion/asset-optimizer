import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faCircleNotch, faFolderOpen, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { AppHeader } from "./components/AppHeader";
import { AssetQueue } from "./components/AssetQueue";
import { DropZone } from "./components/DropZone";
import { SettingsPanel } from "./components/SettingsPanel";
import { defaultSettings } from "./data/presets";
import type { ActivePanel, AssetItem, Capabilities, OptimizerSettings, ThemeMode } from "./types";
import { formatBytes } from "./utils/format";

function App() {
  const api = getAssetOptimizerApi();
  const platform = api.platform ?? "browser";
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [settings, setSettings] = useState<OptimizerSettings>(() => loadSettings());
  const [activePanel, setActivePanel] = useState<ActivePanel>("optimize");
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>({ av1Encoder: null, av1Accelerated: false });

  const readyAssets = assets.filter((asset) => asset.status !== "running" && asset.type !== "unsupported");
  const totalInputSize = useMemo(() => assets.reduce((sum, asset) => sum + asset.size, 0), [assets]);
  const totalOutputSize = useMemo(() => assets.reduce((sum, asset) => sum + (asset.outputSize || 0), 0), [assets]);
  const completedCount = assets.filter((asset) => asset.status === "done").length;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("asset-optimizer-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("asset-optimizer-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    api.getCapabilities().then(setCapabilities, () => undefined);
  }, [api]);

  useEffect(() => {
    return api.onProgress((update) => {
      setAssets((current) =>
        current.map((asset) =>
          asset.id === update.id
            ? {
                ...asset,
                status: update.phase === "done" ? "done" : update.phase === "error" ? "error" : "running",
                progress: update.progress,
                message: update.message,
                error: update.phase === "error" ? update.message : asset.error
              }
            : asset
        )
      );
    });
  }, [api]);

  const addFilePaths = async (filePaths: string[]) => {
    if (filePaths.length === 0) {
      return;
    }

    const existing = new Set(assets.map((asset) => asset.path));
    const newPaths = filePaths.filter((filePath) => !existing.has(filePath));

    if (newPaths.length === 0) {
      return;
    }

    const metadata = await api.readAssetMetadata(newPaths);
    setAssets((current) => {
      // Another drop can finish while this one is still reading metadata.
      const known = new Set(current.map((asset) => asset.path));
      return [...current, ...metadata.filter((asset) => !known.has(asset.path))];
    });
  };

  const removeAsset = useCallback((id: string) => {
    setAssets((current) => current.filter((asset) => asset.id !== id));
  }, []);

  const clearDone = useCallback(() => {
    setAssets((current) => current.filter((asset) => asset.status !== "done"));
  }, []);

  const revealAsset = useCallback((filePath: string) => api.revealInFinder(filePath), [api]);

  const chooseFiles = async () => {
    const selected = await api.selectFiles();
    await addFilePaths(selected);
  };

  const chooseOutput = async () => {
    const outputDir = await api.selectOutputFolder();
    if (outputDir) {
      setSettings((current) => ({ ...current, outputDir }));
    }
  };

  const startOptimizing = async () => {
    if (readyAssets.length === 0 || processing) {
      return;
    }

    setProcessing(true);
    setAssets((current) =>
      current.map((asset) =>
        asset.type === "unsupported"
          ? asset
          : {
              ...asset,
              status: "ready",
              progress: 0,
              message: "Queued",
              outputPath: undefined,
              outputSize: undefined,
              savings: undefined,
              error: undefined
            }
      )
    );

    const jobs = readyAssets.map((asset, index) => ({ ...asset, batchIndex: index + 1 }));
    const results = await api.optimizeAssets({ assets: jobs, settings });
    const resultsById = new Map(results.map((result) => [result.id, result]));

    setAssets((current) =>
      current.map((asset) => {
        const result = resultsById.get(asset.id);
        if (!result) {
          return asset;
        }

        return {
          ...asset,
          status: result.status === "done" ? "done" : "error",
          outputPath: result.outputPath,
          outputSize: result.outputSize,
          savings: result.savings,
          error: result.error,
          message: result.error || asset.message
        };
      })
    );
    setProcessing(false);
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);

    const paths = Array.from(event.dataTransfer.files)
      .map((file) => api.getPathForFile(file))
      .filter(Boolean);

    await addFilePaths(paths);
  };

  return (
    <div
      className={`app platform-${platform}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDragging(false);
        }
      }}
      onDrop={onDrop}
    >
      <AppHeader
        assetCount={assets.length}
        outputDir={settings.outputDir}
        theme={theme}
        onAddFiles={chooseFiles}
        onChooseOutput={chooseOutput}
        onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
      />

      <main className="workspace">
        <div className="queue-column">
          {assets.length === 0 ? (
            <DropZone dragging={dragging} onChooseFiles={chooseFiles} />
          ) : (
            <AssetQueue
              assets={assets}
              settings={settings}
              onRemove={removeAsset}
              onClearDone={clearDone}
              onReveal={revealAsset}
            />
          )}
        </div>

        <SettingsPanel
          activePanel={activePanel}
          settings={settings}
          capabilities={capabilities}
          onPanelChange={setActivePanel}
          onSettingsChange={setSettings}
        />
      </main>

      <footer className="action-bar">
        <div className="output-summary">
          <span>
            <FontAwesomeIcon icon={faFolderOpen} />
            {settings.outputDir || "Creates an optimized folder beside each source"}
          </span>
          <strong>
            {formatBytes(totalInputSize)}
            {totalOutputSize > 0 ? ` -> ${formatBytes(totalOutputSize)}` : ""}
          </strong>
        </div>
        <div className="action-buttons">
          <button className="button subtle danger" type="button" onClick={() => setAssets([])} disabled={assets.length === 0 || processing}>
            <FontAwesomeIcon icon={faTrashCan} />
            <span>Clear</span>
          </button>
          <button className="button primary start-button" type="button" onClick={startOptimizing} disabled={readyAssets.length === 0 || processing}>
            <FontAwesomeIcon icon={processing ? faCircleNotch : faBolt} spin={processing} />
            <span>{processing ? `Optimizing ${completedCount}/${readyAssets.length}` : "Start optimizing"}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

function loadTheme(): ThemeMode {
  const saved = window.localStorage.getItem("asset-optimizer-theme");
  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function loadSettings(): OptimizerSettings {
  const saved = window.localStorage.getItem("asset-optimizer-settings");
  if (!saved) {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(saved);
    return { ...defaultSettings, ...parsed, rename: { ...defaultSettings.rename, ...parsed.rename } };
  } catch {
    return defaultSettings;
  }
}

export default App;

function getAssetOptimizerApi() {
  return window.assetOptimizer ?? browserPreviewApi;
}

const browserPreviewApi: Window["assetOptimizer"] = {
  platform: "browser",
  getCapabilities: async () => ({ av1Encoder: null, av1Accelerated: false }),
  selectFiles: async () => [],
  selectOutputFolder: async () => null,
  readAssetMetadata: async () => [],
  optimizeAssets: async () => [],
  revealInFinder: async () => undefined,
  getPathForFile: () => "",
  onProgress: () => () => undefined
};
