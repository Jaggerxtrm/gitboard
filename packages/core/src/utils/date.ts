/**
 * Date utilities for Omniforge
 */

/**
 * Convert a date to a relative time string (e.g., "2h ago", "just now")
 */
export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) {
    return "just now";
  }
  
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  
  // Use <= 7 to include exactly 7 days
  if (diffDay <= 7) {
    return `${diffDay}d ago`;
  }
  
  // For older dates, return a formatted date string
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  
  // Include year if different from current year
  if (d.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${d.getFullYear()}`;
  }
  
  return `${month} ${day}`;
}

/**
 * Format a duration in seconds to a human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return "0s";
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    if (m > 0 && s > 0) {
      return `${h}h ${m}m ${s}s`;
    } else if (m > 0) {
      return `${h}h ${m}m`;
    }
    return `${h}h`;
  }
  
  if (m > 0) {
    if (s > 0) {
      return `${m}m ${s}s`;
    }
    return `${m}m`;
  }
  
  return `${s}s`;
}

/**
 * Check if a date is within a threshold from now
 */
export function isRecent(date: Date | string, thresholdMs: number = 3600000): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return diffMs <= thresholdMs;
}
