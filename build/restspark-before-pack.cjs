module.exports = async function beforePack (context) {
  if (!['darwin', 'win32'].includes(context.electronPlatformName)) {
    throw new Error('Rest Spark builds installers for macOS and Windows.')
  }
}
