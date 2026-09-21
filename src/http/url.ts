import { HeaderPair } from "../models";
import { substitute } from "../env/substitute";

export function applyQuery(
  url: string,
  query: HeaderPair[],
  envValues: Record<string, string>
): string {
  const enabled = query.filter((item) => item.enabled && item.key.trim());
  if (!enabled.length) {
    return url;
  }
  try {
    const parsed = new URL(url);
    for (const item of enabled) {
      parsed.searchParams.set(
        substitute(item.key, envValues),
        substitute(item.value, envValues)
      );
    }
    return parsed.toString();
  } catch {
    const extra = enabled
      .map(
        (item) =>
          `${encodeURIComponent(substitute(item.key, envValues))}=${encodeURIComponent(
            substitute(item.value, envValues)
          )}`
      )
      .join("&");
    return url.includes("?") ? `${url}&${extra}` : `${url}?${extra}`;
  }
}
