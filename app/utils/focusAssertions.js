export function parseFocusAssertions (document) {
  const records = document?.data?.[0]?.storeAssertionRecords
  if (!Array.isArray(records)) return null
  if (records.length === 0) return false
  return records.some(record => typeof record?.assertionDetails?.assertionDetailsModeIdentifier === 'string') ? true : null
}
