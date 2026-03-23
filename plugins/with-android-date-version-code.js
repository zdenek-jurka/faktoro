const { createRunOncePlugin } = require('expo/config-plugins');

const DEFAULT_TIME_ZONE = 'Europe/Prague';
const DEFAULT_BUILD_INDEX = 1;
const MAX_BUILD_INDEX = 99;

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

function withAndroidDateVersionCode(config, options = {}) {
  const timeZone =
    options.timeZone || process.env.FAKTORO_VERSIONCODE_TIMEZONE || DEFAULT_TIME_ZONE;
  const dateCode = resolveDateCode(options.date || process.env.FAKTORO_VERSIONCODE_DATE, timeZone);
  const buildIndex = resolveBuildIndex(options.buildIndex || process.env.FAKTORO_BUILD_INDEX);
  const versionCode = Number(`${dateCode}${pad2(buildIndex)}`);

  if (!Number.isSafeInteger(versionCode)) {
    throw new Error(`Generated Android versionCode is invalid: ${versionCode}`);
  }

  config.android = config.android || {};
  config.android.versionCode = versionCode;

  return config;
}

module.exports = createRunOncePlugin(
  withAndroidDateVersionCode,
  'with-android-date-version-code',
  '1.0.0',
);
