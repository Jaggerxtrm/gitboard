import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility for conditionally constructing class strings with Tailwind CSS conflict resolution
 * 
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 * 
 * @example
 * cn("px-2 py-1", isActive && "bg-blue-500", "text-white")
 * cn("p-2", "p-4") // Returns "p-4" (later wins)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
