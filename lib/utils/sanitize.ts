export function sanitizeText(value: string, maxLength = 1000): string {
  return value.replace(/\0/g, '').trim().slice(0, maxLength);
}
