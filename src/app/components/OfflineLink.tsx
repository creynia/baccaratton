export const OFFLINE_COPY_URL =
  'https://github.com/creynia/baccaratton/releases/download/latest-build/baccaratton.html';

/** "Download offline copy" (hidden inside the single-file build, which already is one). */
export function OfflineLink() {
  if (__SINGLE_FILE__) return null;
  return (
    <a class="btn btn-ghost" href={OFFLINE_COPY_URL} download="baccaratton.html">
      Download offline copy
    </a>
  );
}
