// Adds Google sign-in native config only once google-services.json exists (Firebase console >
// Project settings > Android app com.magat_nokia.tubigtala > download). Until then the
// google-services Gradle plugin would fail the build, so it is left out and the app shows
// "Google sign-in is not available" in real-project mode. Everything else is in app.json.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  if (!fs.existsSync(path.join(__dirname, 'google-services.json'))) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: './google-services.json' },
    plugins: [...(config.plugins ?? []), '@react-native-google-signin/google-signin'],
  };
};
