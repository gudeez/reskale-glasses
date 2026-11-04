// From the Reskale app: first written 2026-10-23, last changed 2026-10-23 (before this repo). See HACKATHON.md.
const { withAppDelegate } = require('expo/config-plugins');

/**
 * Let React Native see every link that opens the iOS app, even when a native
 * module has already claimed it.
 *
 * Expo's AppDelegate template ends `open url` with
 *
 *   return super.application(app, open: url, options: options) || RCTLinkingManager.application(...)
 *
 * and `super` returns true as soon as any Expo module's AppDelegate subscriber
 * does. The Meta glasses wrapper's subscriber returns true for EVERY url (it
 * forwards them all to the Meta SDK), so with it installed the `||`
 * short-circuits and RCTLinkingManager never runs: password-reset, sign-in and
 * checkout links stop reaching expo-router while the app is open. Calling
 * both, every time, keeps the links working; the Meta SDK still gets its
 * registration callbacks.
 */

const ORIGINAL =
  'return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)';

const REPLACEMENT = [
  '// Reskale (plugins/withLinkingAfterSubscribers.js): always hand the link to React Native too.',
  '    let handledByModules = super.application(app, open: url, options: options)',
  '    let handledByReact = RCTLinkingManager.application(app, open: url, options: options)',
  '    return handledByModules || handledByReact',
].join('\n');

/** Pure, so it can be unit-tested against the template text. */
function patchAppDelegate(contents) {
  if (contents.includes('handledByReact')) return contents;
  if (!contents.includes(ORIGINAL)) {
    throw new Error(
      'withLinkingAfterSubscribers: the AppDelegate `open url` line has changed in this Expo version. ' +
        'Check that RCTLinkingManager still runs when a module subscriber returns true, then update this plugin.',
    );
  }
  return contents.replace(ORIGINAL, REPLACEMENT);
}

function withLinkingAfterSubscribers(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('withLinkingAfterSubscribers expects a Swift AppDelegate.');
    }
    config.modResults.contents = patchAppDelegate(config.modResults.contents);
    return config;
  });
}

module.exports = withLinkingAfterSubscribers;
module.exports.patchAppDelegate = patchAppDelegate;
