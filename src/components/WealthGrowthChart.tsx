import { useState } from 'react';
import type { YearlyProjectionPoint } from '../types/finance';
import { formatPeso, type CurrencyCode } from '../utils/financeMath';

interface WealthGrowthChartProps {
  series: YearlyProjectionPoint[];
  benchmarkName: string;
  currency?: CurrencyCode;
}

export function WealthGrowthChart({
  series,
  benchmarkName,
  currency = 'PHP',
}: WealthGrowthChartProps) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const width = 760;
  const height = 280;
  const padLeft = 64;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 38;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const maxVal = Math.max(
    1000,
    ...series.map((p) => Math.max(p.portfolioValue, p.totalContributed))
  );
  const niceMax = maxVal * 1.12;

  const xForIndex = (idx: number) =>
    padLeft + (idx / Math.max(1, series.length - 1)) * innerW;
  const yForValue = (val: number) =>
    padTop + innerH - (Math.max(0, val) / niceMax) * innerH;

  const portfolioPath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(1)} ${yForValue(p.portfolioValue).toFixed(1)}`)
    .join(' ');

  const contributedPath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(1)} ${yForValue(p.totalContributed).toFixed(1)}`)
    .join(' ');

  const areaPath =
    portfolioPath +
    ` L ${xForIndex(series.length - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${xForIndex(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: niceMax * t,
    y: yForValue(niceMax * t),
  }));

  const activePoint =
    hoveredYear !== null
      ? series.find((p) => p.yearIndex === hoveredYear) ?? series[series.length - 1]
      : series[series.length - 1];

  const milestoneYears = [5, 10, 20];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            20-Year Historical Compounding Curve
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {benchmarkName} · Actual 2005–2024 sequence vs. cash contributions only
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
            <span>Index Portfolio</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-slate-400 border-t border-dashed border-slate-500" aria-hidden="true" />
            <span>Cash Deposited</span>
          </div>
        </div>
      </div>

      {/* Interactive readout strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 px-4 mb-4 bg-slate-50 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs tabular-nums">
        <div>
          <div className="text-slate-500 dark:text-slate-400">Selected Year</div>
          <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
            Year {activePoint.yearIndex} ({activePoint.calendarYear})
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">Portfolio Balance</div>
          <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
            {formatPeso(activePoint.portfolioValue, false, currency)}
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">Total Deposited</div>
          <div className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
            {formatPeso(activePoint.totalContributed, false, currency)}
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">Market Gains</div>
          <div
            className={`font-mono font-semibold mt-0.5 ${
              activePoint.marketGain >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {activePoint.marketGain >= 0 ? '+' : ''}
            {formatPeso(activePoint.marketGain, false, currency)}
          </div>
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label="20-year historical index compounding chart"
        >
          <defs>
            <linearGradient id="finsightWealthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={tick.y}
                x2={width - padRight}
                y2={tick.y}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
              >
                {formatPeso(tick.val, true, currency)}
              </text>
            </g>
          ))}

          {/* Milestone vertical reference lines at Year 5, 10, 20 */}
          {milestoneYears.map((yr) => {
            const pt = series[yr];
            if (!pt) return null;
            const x = xForIndex(yr);
            return (
              <g key={yr}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + innerH}
                  className="stroke-slate-300 dark:stroke-slate-700"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-600 dark:fill-slate-400 text-[10px] font-mono font-semibold"
                >
                  Yr {yr}
                </text>
              </g>
            );
          })}

          {/* Shaded Area under portfolio curve */}
          <path d={areaPath} fill="url(#finsightWealthFill)" />

          {/* Cash Deposited baseline */}
          <path
            d={contributedPath}
            fill="none"
            className="stroke-slate-500 dark:stroke-slate-400"
            strokeWidth="2"
            strokeDasharray="5 4"
          />

          {/* Portfolio Value Curve */}
          <path
            d={portfolioPath}
            fill="none"
            className="stroke-emerald-700 dark:stroke-emerald-400"
            strokeWidth="2.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Milestone dots */}
          {milestoneYears.map((yr) => {
            const pt = series[yr];
            if (!pt) return null;
            return (
              <circle
                key={`dot-${yr}`}
                cx={xForIndex(yr)}
                cy={yForValue(pt.portfolioValue)}
                r={activePoint.yearIndex === yr ? 5.5 : 4}
                className="fill-emerald-700 dark:fill-emerald-400 stroke-white dark:stroke-slate-900"
                strokeWidth="2"
              />
            );
          })}

          {/* Active hover crosshair */}
          {hoveredYear !== null && (
            <g>
              <line
                x1={xForIndex(activePoint.yearIndex)}
                y1={padTop}
                x2={xForIndex(activePoint.yearIndex)}
                y2={padTop + innerH}
                className="stroke-slate-900 dark:stroke-amber-400"
                strokeWidth="1"
              />
              <circle
                cx={xForIndex(activePoint.yearIndex)}
                cy={yForValue(activePoint.portfolioValue)}
                r={5}
                className="fill-slate-900 dark:fill-amber-400 stroke-white dark:stroke-slate-900"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Invisible interactive hover bands for each year */}
          {series.map((pt, idx) => {
            const bandW = innerW / Math.max(1, series.length - 1);
            return (
              <rect
                key={pt.yearIndex}
                x={Math.max(padLeft, xForIndex(idx) - bandW / 2)}
                y={padTop}
                width={bandW}
                height={innerH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoveredYear(pt.yearIndex)}
                onMouseLeave={() => setHoveredYear(null)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
