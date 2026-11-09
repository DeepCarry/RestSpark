// macOS is the approved release target for this brand integration.
module.exports = async function beforePack (context) {
  if (context.electronPlatformName !== 'darwin') {
    throw new Error('Rest Spark currently validates macOS only. Review Windows/Linux identity, icons, installer and Store publisher before packaging those platforms.')
  }
}
