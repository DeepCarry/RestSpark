// Preserve the historic mint value for the compatibility migration and health effect.
export const MINT_COLOR = '#478484'

export function normalizeThemeSource (value) {
  return value === 'light' || value === 'dark' ? value : 'system'
}

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
