const { withAppBuildGradle, createRunOncePlugin } = require('expo/config-plugins');

function withCustomAndroidSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    const applyLine = `apply from: rootProject.file("../android-signing.gradle")`;

    if (!contents.includes(applyLine)) {
      contents = contents.replace(/android\s*\{/, `${applyLine}\n\nandroid {`);
    }

    contents = contents.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release',
    );

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = createRunOncePlugin(
  withCustomAndroidSigning,
  'with-custom-android-signing',
  '1.0.0',
);
