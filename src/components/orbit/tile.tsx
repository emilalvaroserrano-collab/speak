import { Hand, MicOff } from "lucide-react";
import { StreamVideo } from "@/components/orbit/media";
import { cn } from "@/lib/cn";
import type { Person, Reaction } from "@/lib/meeting-store";

const REACTION_LABEL: Record<Reaction, string> = {
  yes: "Yes",
  no: "No",
  here: "Here",
  noted: "Noted",
};

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "?";
}

export function Eq() {
  return (
    <span className="eq" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function Tile({
  person,
  stream,
  mirror,
  compact,
  className,
}: {
  person: Person;
  stream?: MediaStream | null;
  mirror?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const showVideo = Boolean(person.local && person.video && stream);
  const label = person.local ? `${person.name} (you)` : person.name;

  return (
    <article
      data-speaking={person.speaking ? "true" : "false"}
      className={cn(
        "relative flex min-h-36 overflow-hidden rounded-lg border-2 bg-subtle",
        person.speaking ? "border-accent" : "border-transparent",
        className,
      )}
    >
      {showVideo ? (
        <StreamVideo stream={stream ?? null} mirror={mirror} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className={cn("font-medium tracking-tight text-fg", compact ? "text-lg" : "text-3xl")}>{initials(person.name)}</span>
        </div>
      )}

      {person.hand && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-sm bg-bg/80 px-2 py-1 text-xs font-medium text-fg">
          <Hand className="size-3.5" aria-hidden="true" />
          Hand
        </span>
      )}

      {person.speaking && person.audio && (
        <span className="absolute right-2 top-2 rounded-sm bg-bg/80 px-1.5 py-1">
          <Eq />
        </span>
      )}

      {person.reaction && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-strong bg-elevated px-3 py-1.5 text-sm font-medium text-fg">
          {REACTION_LABEL[person.reaction]}
        </span>
      )}

      <div className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-sm bg-bg/80 px-2 py-1 text-sm text-fg">
        {!person.audio && <MicOff className="size-3.5 shrink-0 text-danger" aria-label="Muted" />}
        <span className="truncate">{label}</span>
      </div>
    </article>
  );
}
