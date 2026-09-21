export function substitute(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, key: string) => {
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : full;
  });
}
