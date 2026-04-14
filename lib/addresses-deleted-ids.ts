/**
 * Legacy no-op kept for callers that used to clear a localStorage deleted-ids list.
 * Address deletions are tracked server-side; importing this file does not pull react-query.
 */
export function clearAddressesDeletedIds(): void {
  // no-op – server-side deletedIds are used instead of localStorage
}
