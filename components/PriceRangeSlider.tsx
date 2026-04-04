"use client";

type Props = {
  minBound: number;
  maxBound: number;
  valueMin: number;
  valueMax: number;
  disabled?: boolean;
  onChange: (min: number, max: number) => void;
};

const track =
  "[&::-webkit-slider-runnable-track]:h-9 [&::-webkit-slider-runnable-track]:rounded [&::-webkit-slider-runnable-track]:bg-transparent " +
  "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded [&::-moz-range-track]:bg-transparent";

const thumb =
  "[&::-webkit-slider-thumb]:mt-3 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:-translate-y-1/2 " +
  "[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full " +
  "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-teal-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md " +
  "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full " +
  "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-teal-600 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md";

/**
 * Dual-thumb range for min/max price.
 */
export default function PriceRangeSlider({
  minBound,
  maxBound,
  valueMin,
  valueMax,
  disabled,
  onChange,
}: Props) {
  if (!Number.isFinite(minBound) || !Number.isFinite(maxBound) || maxBound <= minBound) {
    return null;
  }

  const span = maxBound - minBound;
  const leftPct = ((valueMin - minBound) / span) * 100;
  const rightPct = 100 - ((valueMax - minBound) / span) * 100;

  const setMin = (raw: number) => {
    const v = Math.round(Math.min(Math.max(raw, minBound), valueMax));
    onChange(v, valueMax);
  };

  const setMax = (raw: number) => {
    const v = Math.round(Math.max(Math.min(raw, maxBound), valueMin));
    onChange(valueMin, v);
  };

  const baseRange =
    `absolute inset-x-0 top-0 h-9 w-full bg-transparent pointer-events-none ${track} ${thumb} ` +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto";

  return (
    <div className={`relative pt-1 pb-2 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <div className="relative mx-0.5 h-9">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-200" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-teal-500"
          style={{
            left: `${leftPct}%`,
            right: `${rightPct}%`,
          }}
        />
        <input
          type="range"
          min={minBound}
          max={maxBound}
          step={1}
          value={valueMin}
          disabled={Boolean(disabled)}
          onChange={(e) => setMin(Number(e.target.value))}
          className={`${baseRange} z-10`}
          aria-label="Minimum price"
        />
        <input
          type="range"
          min={minBound}
          max={maxBound}
          step={1}
          value={valueMax}
          disabled={Boolean(disabled)}
          onChange={(e) => setMax(Number(e.target.value))}
          className={`${baseRange} z-20`}
          aria-label="Maximum price"
        />
      </div>
    </div>
  );
}
