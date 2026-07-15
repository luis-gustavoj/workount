"use client";

import { useCallback, useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";

// DESIGN.md's Stepper: big −/+ at 44px minimum, a tabular readout between
// them, hold-to-repeat. This exists because a native number input's 16px
// spinners are unusable with a chalked thumb mid-set — direct numeric entry
// still works by tapping the readout itself (it's a real <input>).

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 90;

function round(value: number, step: number): number {
  // Avoids float drift (0.1 + 0.2 territory) when repeatedly adding a 2.5
  // step — weight readouts must never show 82.500000000001.
  return Math.round(value / step) * step;
}

export function Stepper({
  label,
  value,
  step,
  min = 0,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);

  const applyStep = useCallback(
    (direction: 1 | -1) => {
      onChange(Math.max(min, round(valueRef.current + direction * step, step)));
    },
    [min, step, onChange],
  );

  const startRepeat = useCallback(
    (direction: 1 | -1) => {
      applyStep(direction);
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => applyStep(direction), REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS);
    },
    [applyStep],
  );

  useEffect(() => stopRepeat, [stopRepeat]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-ink-muted text-[0.6875rem] font-medium tracking-[0.06em] uppercase">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`${label}: decrease`}
          className="bg-raised text-ink grid size-11 shrink-0 place-items-center rounded active:translate-y-px"
          onPointerDown={() => startRepeat(-1)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
        >
          <Minus className="size-5" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          aria-label={label}
          value={value}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            onChange(Number.isFinite(parsed) ? Math.max(min, parsed) : min);
          }}
          className="text-ink w-20 bg-transparent text-center text-[2.25rem] leading-none font-semibold tabular-nums outline-none"
        />
        <button
          type="button"
          aria-label={`${label}: increase`}
          className="bg-raised text-ink grid size-11 shrink-0 place-items-center rounded active:translate-y-px"
          onPointerDown={() => startRepeat(1)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
        >
          <Plus className="size-5" />
        </button>
      </div>
    </div>
  );
}
