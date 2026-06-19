export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
}

function getArg(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return "";
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : "";
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

export function validateIsoDate(value, name = "date") {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${name} must use yyyy-mm-dd.`);
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || isoDate(parsed) !== text) {
    throw new Error(`${name} is not a valid calendar date: ${text}`);
  }
  return text;
}

export function addDays(dateString, days) {
  const date = new Date(`${validateIsoDate(dateString)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function validateDateRange(startDate, endDate) {
  if (startDate > endDate) {
    throw new Error(`start date must be on or before end date: ${startDate} > ${endDate}`);
  }
  return { startDate, endDate };
}

export function dateRangeFromArgs(args, defaultLagDays = 3) {
  const date = getArg(args, "--date");
  if (date) {
    const singleDate = validateIsoDate(date, "--date");
    return { startDate: singleDate, endDate: singleDate };
  }

  const lagDays = positiveInteger(getArg(args, "--lag-days") || String(defaultLagDays), "--lag-days");
  const fallbackDate = daysAgo(lagDays);
  const lookbackDays = getArg(args, "--lookback-days");
  if (lookbackDays) {
    const endDate = validateIsoDate(getArg(args, "--end") || fallbackDate, "--end");
    const startDate = validateIsoDate(
      getArg(args, "--start") || addDays(endDate, -(positiveInteger(lookbackDays, "--lookback-days") - 1)),
      "--start"
    );
    return validateDateRange(startDate, endDate);
  }

  const startArg = getArg(args, "--start");
  const endArg = getArg(args, "--end");
  if (startArg || endArg) {
    const singleDate = startArg || endArg;
    return validateDateRange(
      validateIsoDate(startArg || singleDate, "--start"),
      validateIsoDate(endArg || singleDate, "--end")
    );
  }

  return { startDate: fallbackDate, endDate: fallbackDate };
}

export function dateRangeLabel({ startDate, endDate }) {
  return startDate === endDate ? startDate : `${startDate}..${endDate}`;
}

export function metricsDateRangeFromArgs(
  args,
  { defaultLagDays = 3, defaultLookbackDays = 7, env = process.env } = {}
) {
  const metricsDate = getArg(args, "--metrics-date");
  if (metricsDate) {
    return {
      ...dateRangeFromArgs(["--date", metricsDate], defaultLagDays),
      mode: "date",
      lookbackDays: 1,
      lagDays: null,
    };
  }

  const metricsStart = getArg(args, "--metrics-start") || getArg(args, "--start");
  const metricsEnd = getArg(args, "--metrics-end") || getArg(args, "--end");
  const metricsLookbackDays = getArg(args, "--metrics-lookback-days") || getArg(args, "--lookback-days");
  const metricsLagDays =
    getArg(args, "--metrics-lag-days") || getArg(args, "--lag-days") || env.SEO_AEO_METRICS_LAG_DAYS || String(defaultLagDays);

  if (metricsLookbackDays && !metricsStart) {
    const rangeArgs = ["--lookback-days", metricsLookbackDays, "--lag-days", metricsLagDays];
    if (metricsEnd) rangeArgs.push("--end", metricsEnd);
    return {
      ...dateRangeFromArgs(rangeArgs, defaultLagDays),
      mode: "rolling_lookback",
      lookbackDays: positiveInteger(metricsLookbackDays, "--metrics-lookback-days"),
      lagDays: positiveInteger(metricsLagDays, "--metrics-lag-days"),
    };
  }

  if (metricsStart || metricsEnd) {
    const rangeArgs = [];
    if (metricsStart) rangeArgs.push("--start", metricsStart);
    if (metricsEnd) rangeArgs.push("--end", metricsEnd);
    return {
      ...dateRangeFromArgs(rangeArgs, defaultLagDays),
      mode: "range",
      lookbackDays: null,
      lagDays: null,
    };
  }

  const lookbackDays = env.SEO_AEO_METRICS_LOOKBACK_DAYS || String(defaultLookbackDays);
  return {
    ...dateRangeFromArgs(["--lookback-days", lookbackDays, "--lag-days", metricsLagDays], defaultLagDays),
    mode: "rolling_lookback",
    lookbackDays: positiveInteger(lookbackDays, "SEO_AEO_METRICS_LOOKBACK_DAYS"),
    lagDays: positiveInteger(metricsLagDays, "SEO_AEO_METRICS_LAG_DAYS"),
  };
}

export function today() {
  return isoDate(new Date());
}
