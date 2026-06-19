#!/usr/bin/env node
import { dateRangeFromArgs, dateRangeLabel, metricsDateRangeFromArgs } from "./lib/dates.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkRange(name, args, expected) {
  const actual = metricsDateRangeFromArgs(args, {
    env: {
      SEO_AEO_METRICS_LOOKBACK_DAYS: "7",
      SEO_AEO_METRICS_LAG_DAYS: "3",
    },
  });
  for (const [key, value] of Object.entries(expected)) {
    assert(actual[key] === value, `${name}: expected ${key}=${value}, got ${actual[key]}`);
  }
  return { name, label: dateRangeLabel(actual), ...actual };
}

function run() {
  const cases = [
    checkRange(
      "generic-start-end-with-run-date",
      ["--date", "2026-06-18", "--start", "2026-06-09", "--end", "2026-06-15"],
      {
        startDate: "2026-06-09",
        endDate: "2026-06-15",
        mode: "range",
      }
    ),
    checkRange(
      "metrics-start-end",
      ["--date", "2026-06-18", "--metrics-start", "2026-06-08", "--metrics-end", "2026-06-14"],
      {
        startDate: "2026-06-08",
        endDate: "2026-06-14",
        mode: "range",
      }
    ),
    checkRange(
      "metrics-flags-win-over-generic",
      [
        "--date",
        "2026-06-18",
        "--start",
        "2026-06-01",
        "--end",
        "2026-06-02",
        "--metrics-start",
        "2026-06-11",
        "--metrics-end",
        "2026-06-12",
      ],
      {
        startDate: "2026-06-11",
        endDate: "2026-06-12",
        mode: "range",
      }
    ),
    checkRange(
      "generic-lookback-with-end",
      ["--date", "2026-06-18", "--lookback-days", "3", "--end", "2026-06-15"],
      {
        startDate: "2026-06-13",
        endDate: "2026-06-15",
        mode: "rolling_lookback",
        lookbackDays: 3,
        lagDays: 3,
      }
    ),
  ];
  const directPullRange = dateRangeFromArgs([
    "--date",
    "2026-06-18",
    "--start",
    "2026-06-09",
    "--end",
    "2026-06-15",
  ]);
  assert(
    directPullRange.startDate === "2026-06-18" && directPullRange.endDate === "2026-06-18",
    `direct pull date precedence changed unexpectedly: ${dateRangeLabel(directPullRange)}`
  );

  console.log(JSON.stringify({ ok: true, fixture: "metrics-date-range-args", cases, directPullRange }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
