const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * One protobuf runtime in the Android app.
 *
 * The Mentra SDK depends on the full runtime (com.google.protobuf:protobuf-java
 * 4.32) and Meta's DAT SDK on the lite one (protobuf-javalite 3.25.5). The two
 * jars hold the same classes, so a build with both fails at
 * checkDebugDuplicateClasses. The full runtime contains everything the lite
 * one does (GeneratedMessageLite included), so lite is excluded and Meta's
 * code runs on the full runtime.
 *
 * Only needed while both glasses SDKs are in one build (feat/meta-glasses).
 * Verified to compile; Meta's SDK on the full runtime is not yet tried on
 * real glasses — if Meta calls crash with a protobuf error, start here.
 */

const MARKER = '// Reskale: withSingleProtobufRuntime';
const BLOCK = `
${MARKER}
configurations.all {
    exclude group: 'com.google.protobuf', module: 'protobuf-javalite'
}
`;

/** Pure, so it can be unit-tested. */
function addProtobufExclusion(contents) {
  if (contents.includes(MARKER)) return contents;
  return `${contents.trimEnd()}\n${BLOCK}`;
}

function withSingleProtobufRuntime(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withSingleProtobufRuntime expects a Groovy app/build.gradle.');
    }
    config.modResults.contents = addProtobufExclusion(config.modResults.contents);
    return config;
  });
}

module.exports = withSingleProtobufRuntime;
module.exports.addProtobufExclusion = addProtobufExclusion;
