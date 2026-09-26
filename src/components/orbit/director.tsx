import { useEffect } from "react";
import { useMeeting, type Person } from "@/lib/meeting-store";

const CAST = [
  { id: "maya", name: "Maya Chen", role: "Product" },
  { id: "leo", name: "Leo Okonkwo", role: "Design" },
  { id: "priya", name: "Priya Shah", role: "Engineering" },
] as const;

function remote(who: (typeof CAST)[number]): Person {
  return {
    id: who.id,
    name: who.name,
    role: who.role,
    local: false,
    moderator: false,
    audio: true,
    video: false,
    hand: false,
    speaking: false,
    reaction: null,
    sharing: false,
  };
}

export function useRoomPresence(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const seen = new Set<string>();
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };

    const enter = (who: (typeof CAST)[number]) => {
      if (seen.has(who.id)) return;
      const state = useMeeting.getState();
      if (!state.joined) return;
      seen.add(who.id);
      if (state.locked) {
        state.addLobby({ id: who.id, name: who.name, role: who.role });
        state.showToast(`${who.name} is waiting in the lobby`);
        return;
      }
      state.addPerson(remote(who));
      state.showToast(`${who.name} joined`);
    };

    later(800, () => enter(CAST[0]));
    later(1700, () => enter(CAST[1]));
    later(2600, () => {
      const state = useMeeting.getState();
      if (!state.people.some((person) => person.id === "maya")) return;
      state.pushChat({
        fromId: "maya",
        from: "Maya Chen",
        text: "I'm here. Camera's off on my side.",
      });
    });
    later(4300, () => enter(CAST[2]));
    later(5200, () => {
      const state = useMeeting.getState();
      if (!state.people.some((person) => person.id === "leo")) return;
      state.pushChat({
        fromId: "leo",
        from: "Leo Okonkwo",
        text: "Audio only works. I'll raise a hand if I need the floor.",
      });
    });
    later(6800, () => {
      if (!useMeeting.getState().people.some((person) => person.id === "leo")) return;
      useMeeting.getState().patchPerson("leo", { hand: true });
    });
    later(10200, () => {
      if (!useMeeting.getState().people.some((person) => person.id === "leo")) return;
      useMeeting.getState().patchPerson("leo", { hand: false });
    });

    const speak = window.setInterval(() => {
      const people = useMeeting
        .getState()
        .people.filter((person) => !person.local && person.audio);
      if (people.length === 0) {
        useMeeting.getState().setSpeaking(null);
        return;
      }
      const pick = people[Math.floor(Date.now() / 3400) % people.length];
      useMeeting.getState().setSpeaking(pick.id);
    }, 3400);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(speak);
    };
  }, [active]);
}
