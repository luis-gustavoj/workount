"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  // Local text mirrors `value` except while the user is mid-edit (e.g. typed
  // "82." or "82,"), when it would otherwise get clobbered by the formatted
  // number on every keystroke.
  const [text, setText] = useState(() => String(value));
  const isFocusedRef = useRef(false);
  useEffect(() => {
    if (!isFocusedRef.current) setText(String(value));
  }, [value]);

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
        intervalRef.current = setInterval(
          () => applyStep(direction),
          REPEAT_INTERVAL_MS,
        );
      }, REPEAT_DELAY_MS);
    },
    [applyStep],
  );

  useEffect(() => stopRepeat, [stopRepeat]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[0.6875rem] font-medium tracking-[0.06em] text-ink-muted uppercase">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`${label}: decrease`}
          className="grid size-11 shrink-0 place-items-center rounded bg-raised text-ink active:translate-y-px"
          onPointerDown={() => startRepeat(-1)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
        >
          <Minus className="size-5" />
        </button>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={text}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onChange={(e) => {
            // South American keyboards' decimal inputMode key sends ",";
            // normalize it to "." before parsing.
            const raw = e.target.value.replace(",", ".");
            if (!/^\d*\.?\d?$/.test(raw)) return;
            setText(raw);
            if (raw === "" || raw === ".") return;
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) onChange(Math.max(min, parsed));
          }}
          onBlur={() => {
            isFocusedRef.current = false;
            setText(String(valueRef.current));
          }}
          className="w-20 bg-transparent text-center text-[2.25rem] leading-none font-semibold text-ink tabular-nums outline-none"
        />
        <button
          type="button"
          aria-label={`${label}: increase`}
          className="grid size-11 shrink-0 place-items-center rounded bg-raised text-ink active:translate-y-px"
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
