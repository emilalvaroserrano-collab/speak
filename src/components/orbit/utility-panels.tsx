import { useState, type FormEvent } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Heart, Languages, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveTranslation } from "@/lib/live-translation";
import { TRANSLATION_LANGUAGES } from "@/lib/translation-languages";

const DONATION_AMOUNTS = [10, 25, 50, 100];

export function TranslatorPanel({ active, incomingStream }: { active: boolean; incomingStream: MediaStream | null }) {
  const [targetLanguageCode, setTargetLanguageCode] = useState("en");
  const { state, restart } = useLiveTranslation(incomingStream, active, targetLanguageCode);
  const language = TRANSLATION_LANGUAGES.find((item) => item.code === targetLanguageCode);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line p-4">
        <label className="text-sm font-medium" htmlFor="translation-language">
          Translate incoming speech into
        </label>
        <Select.Root value={targetLanguageCode} onValueChange={setTargetLanguageCode}>
          <Select.Trigger
            id="translation-language"
            className="mt-2 flex h-11 w-full items-center justify-between rounded-md border border-strong bg-bg px-3 text-sm text-fg outline-none"
          >
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="size-4 text-muted" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              position="popper"
              sideOffset={6}
              className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-elevated shadow-panel"
            >
              <Select.Viewport className="scroll-thin max-h-72 overflow-y-auto p-1">
                {TRANSLATION_LANGUAGES.map((item) => (
                  <Select.Item
                    key={item.code}
                    value={item.code}
                    className="relative flex h-10 cursor-pointer select-none items-center rounded-md px-3 pr-9 text-sm text-fg outline-none data-[highlighted]:bg-subtle"
                  >
                    <Select.ItemText>{item.name}</Select.ItemText>
                    <Select.ItemIndicator className="absolute right-3">
                      <Check className="size-4" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`size-2 shrink-0 rounded-full ${
              state.status === "error"
                ? "bg-danger"
                : state.status === "connecting"
                  ? "animate-pulse bg-muted"
                  : incomingStream
                    ? "bg-live"
                    : "bg-faint"
            }`}
          />
          <p className="truncate text-sm text-muted">
            {!incomingStream
              ? "Waiting for participant audio"
              : state.status === "connecting"
                ? "Connecting"
                : state.status === "playing"
                  ? "Playing translation"
                  : state.status === "error"
                    ? "Translation unavailable"
                    : `Listening for ${language?.name ?? "selected language"}`}
          </p>
        </div>
        <Volume2 className="size-4 shrink-0 text-faint" aria-hidden="true" />
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!incomingStream ? (
          <div className="rounded-md border border-line bg-subtle p-4">
            <Languages className="size-5 text-fg" />
            <p className="mt-3 text-sm font-medium">Translation is ready</p>
            <p className="mt-1 text-sm leading-normal text-muted">
              Start translation automatically when another participant&apos;s audio track connects to this room.
            </p>
          </div>
        ) : (
          <>
            <article>
              <p className="text-xs font-medium text-faint">Original</p>
              <p className="mt-1 text-sm leading-normal text-muted">
                {state.sourceText || "Listening…"}
              </p>
            </article>
            <article>
              <p className="text-xs font-medium text-faint">{language?.name}</p>
              <p className="mt-1 text-sm leading-normal text-fg">
                {state.translatedText || "Translation will appear here."}
              </p>
            </article>
          </>
        )}

        {state.error && (
          <div className="rounded-md border border-line bg-subtle p-3">
            <p className="text-sm text-muted">{state.error}</p>
            <Button variant="secondary" className="mt-3" onClick={restart}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DonatePanel({ returnPath }: { returnPath: string }) {
  const [amount, setAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedAmount = customAmount ? Number(customAmount) : amount;

  async function donate(event: FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(selectedAmount) || selectedAmount < 5 || selectedAmount > 500) {
      setError("Choose an amount from $5 to $500.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/donate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: selectedAmount, returnPath }),
      });
      const payload = (await response.json()) as { mode?: "demo" | "live"; url?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Checkout could not be created.");
      if (payload.mode === "live" && payload.url) {
        window.location.assign(payload.url);
        return;
      }
      setMessage(`Demo donation of $${selectedAmount} prepared. No payment was taken.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout could not be created.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={donate} className="scroll-thin h-full overflow-y-auto p-4">
      <div className="rounded-md border border-line bg-subtle p-4">
        <Heart className="size-5 text-fg" />
        <h3 className="mt-3 text-base font-medium">Support Orbit</h3>
        <p className="mt-1 text-sm leading-normal text-muted">
          Help keep simple, private meetings open to everyone.
        </p>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Donation amount</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {DONATION_AMOUNTS.map((value) => (
            <Button
              key={value}
              type="button"
              variant={!customAmount && amount === value ? "primary" : "secondary"}
              onClick={() => {
                setAmount(value);
                setCustomAmount("");
                setMessage(null);
              }}
            >
              ${value}
            </Button>
          ))}
        </div>
        <label className="mt-3 grid gap-2 text-sm font-medium" htmlFor="custom-donation">
          Custom amount
          <span className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              id="custom-donation"
              type="number"
              inputMode="numeric"
              min={5}
              max={500}
              value={customAmount}
              onChange={(event) => {
                setCustomAmount(event.target.value);
                setMessage(null);
              }}
              placeholder="25"
              className="h-12 w-full rounded-md border border-strong bg-bg pl-7 pr-3 text-base text-fg outline-none placeholder:text-faint"
            />
          </span>
        </label>
      </fieldset>

      <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={loading}>
        {loading ? "Opening checkout…" : `Donate $${Number.isFinite(selectedAmount) ? selectedAmount : 0}`}
      </Button>

      {message && (
        <p role="status" className="mt-3 rounded-md border border-line bg-subtle p-3 text-sm leading-normal text-muted">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-line bg-subtle p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
