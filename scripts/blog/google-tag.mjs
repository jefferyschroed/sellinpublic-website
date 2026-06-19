import { envOrConfig, loadConfig } from "../seo-aeo/lib/config.mjs";

export const GOOGLE_TAG_START = "<!-- SEO_AEO_GOOGLE_TAG_START -->";
export const GOOGLE_TAG_END = "<!-- SEO_AEO_GOOGLE_TAG_END -->";
export const DEFAULT_GA4_MEASUREMENT_ID = "G-QCYHK55RCG";

export function isMeasurementId(value) {
  return /^G-[A-Z0-9]+$/i.test(String(value || "").trim());
}

export function configuredMeasurementId(root = process.cwd()) {
  const config = loadConfig(root);
  const value = envOrConfig("GA4_MEASUREMENT_ID", config.google?.ga4MeasurementId, DEFAULT_GA4_MEASUREMENT_ID);
  return isMeasurementId(value) ? String(value).trim() : "";
}

export function renderGoogleTag(measurementId = configuredMeasurementId()) {
  if (!isMeasurementId(measurementId)) return "";
  const id = String(measurementId).trim();
  return `${GOOGLE_TAG_START}
    <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${id}');
    </script>
    ${GOOGLE_TAG_END}`;
}
