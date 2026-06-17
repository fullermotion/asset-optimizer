interface ProgressBarProps {
  value?: number;
}

export function ProgressBar({ value = 0 }: ProgressBarProps) {
  return (
    <div className="progress-track" aria-label={`Progress ${value}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
