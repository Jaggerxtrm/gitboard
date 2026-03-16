/**
 * Formatting utilities for Omniforge
 */

/**
 * Format a number with K/M suffixes for large values
 */
export function formatNumber(num: number, precision: number = 1): string {
  if (num < 0) {
    return "-" + formatNumber(-num, precision);
  }
  
  if (num < 1000) {
    return num.toString();
  }
  
  // Use >= 999500 for M threshold to round 999999 to 1M
  if (num >= 999500) {
    const value = num / 1000000;
    const formatted = precision === 0 
      ? Math.round(value).toString()
      : value.toFixed(precision).replace(/\.?0+$/, "");
    return `${formatted}M`;
  }
  
  const value = num / 1000;
  const formatted = precision === 0 
    ? Math.round(value).toString()
    : value.toFixed(precision).replace(/\.?0+$/, "");
  return `${formatted}K`;
}

/**
 * Format bytes to human-readable string (KB, MB, GB)
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 0) return "-" + formatBytes(-bytes);
  
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  
  // Format with appropriate decimal places
  const formatted = i === 0 
    ? value.toString()
    : value.toFixed(1).replace(/\.0$/, "");
  
  return `${formatted} ${units[i]}`;
}

/**
 * Format a decimal as a percentage
 */
export function formatPercentage(value: number, precision: number = 0): string {
  const pct = value * 100;
  
  if (precision === 0) {
    return `${Math.round(pct)}%`;
  }
  
  return `${pct.toFixed(precision)}%`;
}

/**
 * Pluralize a word based on count
 */
export function pluralize(
  count: number, 
  singular: string, 
  plural?: string,
  includeCount: boolean = false
): string {
  const word = count === 1 ? singular : (plural ?? singular + "s");
  return includeCount ? `${count} ${word}` : word;
}
