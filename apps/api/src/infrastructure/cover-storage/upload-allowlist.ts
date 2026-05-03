const allowed = (process.env.UPLOAD_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isUploadAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  return allowed.includes(email.toLowerCase());
}
