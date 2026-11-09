// The approved mint UI is independent of system light/dark appearance.
// Keep the historic renderer color token so break layout/health effects do not change.
export const MINT_COLOR = '#478484'

export function migrateMintTheme (store) {
  if (store.get('settingsThemeVersion') === 1) return
  const backup = store.get('settingsThemeBackup') || {
    mainColor: store.get('mainColor'),
    miniBreakColor: store.get('miniBreakColor')
  }
  // electron-store writes this patch atomically, including the original values.
  store.set({
    settingsThemeBackup: backup,
    mainColor: MINT_COLOR,
    miniBreakColor: MINT_COLOR,
    settingsTheme: 'mint',
    settingsThemeVersion: 1
  })
}
