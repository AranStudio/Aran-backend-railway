const DEFAULT_SHARE_BASE = "https://aran.studio/share";

function cleanBaseUrl(url) {
  if (!url) return DEFAULT_SHARE_BASE;
  return url.replace(/\/$/, "");
}

export function buildShareUrl(shareCode) {
  if (!shareCode) return null;
  const base =
    cleanBaseUrl(process.env.SHARE_BASE_URL || process.env.SHARE_URL) || DEFAULT_SHARE_BASE;
  return `${base}/${shareCode}`;
}

export function shareEmailTemplate({ title, shareUrl }) {
  if (!shareUrl) return null;
  const subject = encodeURIComponent(`${title || "Aran deck"}`);
  const body = encodeURIComponent(
    `Check out this Aran deck${title ? `: "${title}"` : ""}.\n\n${shareUrl}`
  );
  return `mailto:?subject=${subject}&body=${body}`;
}
