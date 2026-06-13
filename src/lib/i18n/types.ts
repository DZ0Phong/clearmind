// Shared types for the i18n module. Kept tiny so dict-vi.ts and dict-en.ts
// can `import type { Dict }` without picking up the React provider chain.

export type Lang = "vi" | "en";

export type Dict = Record<string, string>;

export type TimeZoneMode = "device" | "cli" | "manual";
