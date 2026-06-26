/**
 * electron-builder afterSign hook: notarize the macOS app with Apple.
 *
 * Runs only on macOS and only when the APPLE_* credentials are present, so
 * unsigned CI builds (no secrets configured) succeed unchanged — the hook just
 * logs and returns. Configure these repo secrets to enable notarization:
 *   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 * (and a Developer ID cert via MAC_CSC_LINK / MAC_CSC_KEY_PASSWORD for signing).
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('• notarize: APPLE_* secrets not set — skipping (build remains unsigned/un-notarized)')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appBundleId = context.packager.appInfo.id

  // Lazy require so non-macOS runners never need the dependency at runtime.
  const { notarize } = require('@electron/notarize')
  console.log(`• notarize: submitting ${appName}.app to Apple…`)
  await notarize({
    appBundleId,
    appPath: `${appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  })
  console.log('• notarize: done')
}
