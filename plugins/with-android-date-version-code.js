const { createRunOncePlugin, withAppBuildGradle } = require('expo/config-plugins');

const DEFAULT_TIME_ZONE = 'Europe/Prague';
const DEFAULT_BUILD_INDEX = 1;
const MAX_BUILD_INDEX = 99;

const GRADLE_MARKER = '// [faktoro] date-version-code';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function resolveDateCode(rawDateOverride, timeZone) {
  if (rawDateOverride) {
    const normalized = String(rawDateOverride).replace(/\D/g, '');
    if (!/^\d{8}$/.test(normalized)) {
      throw new Error(
        'Invalid FAKTORO_VERSIONCODE_DATE. Expected format YYYYMMDD, for example 20260319.',
      );
    }
    return normalized;
  }

  const { year, month, day } = formatDateParts(new Date(), timeZone);
  return `${year}${month}${day}`;
}

function resolveBuildIndex(rawBuildIndex) {
  if (rawBuildIndex == null || rawBuildIndex === '') {
    return DEFAULT_BUILD_INDEX;
  }

  const parsed = Number.parseInt(String(rawBuildIndex), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_BUILD_INDEX) {
    throw new Error(`Invalid FAKTORO_BUILD_INDEX. Expected integer in range 1-${MAX_BUILD_INDEX}.`);
  }

  return parsed;
}

/**
 * Builds a Groovy helper function that computes versionCode at Gradle execution time.
 * The result is the same YYYYMMDDxx format as the JS side, but evaluated on every build.
 */
function buildGradleHelper(timeZone) {
  return `${GRADLE_MARKER} {
def computeDateVersionCode() {
    def tz = System.getenv("FAKTORO_VERSIONCODE_TIMEZONE") ?: "${timeZone}"
    def dateOverride = System.getenv("FAKTORO_VERSIONCODE_DATE")
    def rawIndex = System.getenv("FAKTORO_BUILD_INDEX") ?: "1"
    def buildIndex = Integer.parseInt(rawIndex)
    def dateCode
    if (dateOverride != null && !dateOverride.isEmpty()) {
        dateCode = dateOverride.replaceAll("[^0-9]", "")
    } else {
        def cal = Calendar.getInstance(TimeZone.getTimeZone(tz))
        dateCode = String.format("%04d%02d%02d",
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH) + 1,
            cal.get(Calendar.DAY_OF_MONTH))
    }
    return Integer.parseInt(dateCode + String.format("%02d", buildIndex))
}
${GRADLE_MARKER} }`;
}

function injectGradleVersionCode(contents, timeZone) {
  // Inject helper function before 'android {' — skip if already present (idempotent)
  if (!contents.includes(GRADLE_MARKER)) {
    contents = contents.replace(/android\s*\{/, `${buildGradleHelper(timeZone)}\n\nandroid {`);
  }

  // Replace the static versionCode integer with the dynamic call.
  // No-op if already replaced (the regex only matches a bare number).
  contents = contents.replace(/(\bversionCode\s+)\d+/, '$1computeDateVersionCode()');

  return contents;
}

function withAndroidDateVersionCode(config, options = {}) {
  const timeZone =
    options.timeZone || process.env.FAKTORO_VERSIONCODE_TIMEZONE || DEFAULT_TIME_ZONE;
  const dateCode = resolveDateCode(options.date || process.env.FAKTORO_VERSIONCODE_DATE, timeZone);
  const buildIndex = resolveBuildIndex(options.buildIndex || process.env.FAKTORO_BUILD_INDEX);
  const versionCode = Number(`${dateCode}${pad2(buildIndex)}`);

  if (!Number.isSafeInteger(versionCode)) {
    throw new Error(`Generated Android versionCode is invalid: ${versionCode}`);
  }

  // Static value for config-time consumers (EAS Build metadata, app.json introspection, etc.)
  config.android = config.android || {};
  config.android.versionCode = versionCode;

  // Inject Groovy helper so every `gradle build` / `build-android` recomputes versionCode
  // from the current date and env vars without requiring a new prebuild.
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = injectGradleVersionCode(cfg.modResults.contents, timeZone);
    return cfg;
  });
}

module.exports = createRunOncePlugin(
  withAndroidDateVersionCode,
  'with-android-date-version-code',
  '1.0.0',
);
