export type Prefs = {
  name: string;
  audio: boolean;
  video: boolean;
  mirror: boolean;
};

export type RecentRoom = {
  slug: string;
  at: number;
};

const PREFS_KEY = "orbit-meeting-prefs";
const RECENT_KEY = "orbit-meeting-recent";

const LEFT = ["quiet", "north", "glass", "cedar", "plain", "inner", "clear", "late", "open", "silver"];
const RIGHT = ["harbor", "ledger", "archive", "studio", "table", "brief", "forum", "hall", "desk", "room"];

export function randomRoom(): string {
  const a = LEFT[Math.floor(Math.random() * LEFT.length)];
  const b = RIGHT[Math.floor(Math.random() * RIGHT.length)];
  return `${a}-${b}`;
}

export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || randomRoom();
}

export function roomLabel(slug: string): string {
  return slug.replace(/-/g, " ");
}

export function loadPrefs(): Prefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    if (typeof parsed.name !== "string") return null;
    return {
      name: parsed.name.slice(0, 40) || "Guest",
      audio: parsed.audio !== false,
      video: parsed.video !== false,
      mirror: parsed.mirror !== false,
    };
  } catch {
    return null;
  }
}

export function savePrefs(prefs: Prefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function loadRecent(): RecentRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentRoom[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.slug === "string")
      .slice(0, 5);
  } catch {
    return [];
  }
}

export function rememberRoom(slug: string): RecentRoom[] {
  const next = [
    { slug, at: Date.now() },
    ...loadRecent().filter((item) => item.slug !== slug),
  ].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}
