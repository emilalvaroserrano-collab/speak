import { create } from "zustand";
import { savePrefs, type Prefs } from "@/lib/rooms";

export type Reaction = "yes" | "no" | "here" | "noted";

export type Person = {
  id: string;
  name: string;
  role?: string;
  local: boolean;
  moderator: boolean;
  audio: boolean;
  video: boolean;
  hand: boolean;
  speaking: boolean;
  reaction: Reaction | null;
  sharing: boolean;
};

export type ChatMessage = {
  id: string;
  fromId: string;
  from: string;
  text: string;
  at: number;
};

export type LobbyGuest = {
  id: string;
  name: string;
  role?: string;
};

export type PanelId = "chat" | "people" | "settings" | "shortcuts" | "stats";

type MeetingState = {
  displayName: string;
  wantAudio: boolean;
  wantVideo: boolean;
  mirror: boolean;
  joined: boolean;
  room: string;
  startedAt: number | null;
  layout: "tile" | "speaker";
  panel: PanelId | null;
  recording: boolean;
  locked: boolean;
  people: Person[];
  lobby: LobbyGuest[];
  chat: ChatMessage[];
  unread: number;
  dominantId: string | null;
  toast: string | null;
  setDisplayName: (name: string) => void;
  setWantAudio: (value: boolean) => void;
  setWantVideo: (value: boolean) => void;
  setMirror: (value: boolean) => void;
  hydratePrefs: (prefs: Prefs) => void;
  join: (room: string) => void;
  leave: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleHand: () => void;
  setSharing: (on: boolean) => void;
  setLayout: (layout: "tile" | "speaker") => void;
  togglePanel: (panel: PanelId) => void;
  closePanel: () => void;
  setRecording: (value: boolean) => void;
  setLocked: (value: boolean) => void;
  sendChat: (text: string) => void;
  pushChat: (message: { fromId: string; from: string; text: string }) => void;
  addPerson: (person: Person) => void;
  patchPerson: (id: string, patch: Partial<Person>) => void;
  addLobby: (guest: LobbyGuest) => void;
  admit: (id: string) => void;
  deny: (id: string) => void;
  setSpeaking: (id: string | null) => void;
  showToast: (text: string) => void;
  clearToast: () => void;
  react: (id: string, reaction: Reaction) => void;
  muteAll: () => void;
};

let seq = 0;
function uid(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}`;
}

function persist(state: MeetingState) {
  savePrefs({
    name: state.displayName,
    audio: state.wantAudio,
    video: state.wantVideo,
    mirror: state.mirror,
  });
}

function replyFor(text: string): string {
  const value = text.toLowerCase();
  if (value.includes("hello") || value.includes("hi ") || value === "hi") {
    return "Hey — glad you made it in.";
  }
  if (value.includes("?")) return "Good question. Let's settle it before we drop.";
  if (value.includes("mute")) return "I'll stay muted unless I'm talking.";
  if (value.includes("hand")) return "I see you. Go ahead.";
  if (value.includes("share") || value.includes("screen")) {
    return "Go ahead and share whenever you're ready.";
  }
  return "Noted. I'll keep that with the room notes.";
}

function guestToPerson(guest: LobbyGuest): Person {
  return {
    id: guest.id,
    name: guest.name,
    role: guest.role,
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

export const useMeeting = create<MeetingState>((set, get) => ({
  displayName: "Guest",
  wantAudio: true,
  wantVideo: true,
  mirror: true,
  joined: false,
  room: "",
  startedAt: null,
  layout: "tile",
  panel: null,
  recording: false,
  locked: false,
  people: [],
  lobby: [],
  chat: [],
  unread: 0,
  dominantId: null,
  toast: null,

  setDisplayName: (name) => {
    const next = name.slice(0, 40);
    set((state) => ({
      displayName: next,
      people: state.people.map((person) =>
        person.local ? { ...person, name: next || "Guest" } : person,
      ),
    }));
    persist(get());
  },

  setWantAudio: (value) => {
    set({ wantAudio: value });
    persist(get());
  },

  setWantVideo: (value) => {
    set({ wantVideo: value });
    persist(get());
  },

  setMirror: (value) => {
    set({ mirror: value });
    persist(get());
  },

  hydratePrefs: (prefs) => {
    if (get().joined) return;
    set({
      displayName: prefs.name || "Guest",
      wantAudio: prefs.audio,
      wantVideo: prefs.video,
      mirror: prefs.mirror,
    });
  },

  join: (room) => {
    const state = get();
    const name = state.displayName.trim() || "Guest";
    set({
      displayName: name,
      joined: true,
      room,
      startedAt: Date.now(),
      layout: "tile",
      panel: null,
      recording: false,
      locked: false,
      lobby: [],
      chat: [],
      unread: 0,
      dominantId: "local",
      toast: "You are the only moderator.",
      people: [
        {
          id: "local",
          name,
          local: true,
          moderator: true,
          audio: state.wantAudio,
          video: state.wantVideo,
          hand: false,
          speaking: false,
          reaction: null,
          sharing: false,
        },
      ],
    });
    persist(get());
  },

  leave: () =>
    set({
      joined: false,
      room: "",
      startedAt: null,
      people: [],
      lobby: [],
      chat: [],
      unread: 0,
      panel: null,
      recording: false,
      locked: false,
      dominantId: null,
      toast: null,
      layout: "tile",
    }),

  toggleAudio: () =>
    set((state) => {
      const next = !state.wantAudio;
      persist({ ...state, wantAudio: next });
      return {
        wantAudio: next,
        people: state.people.map((person) =>
          person.local
            ? { ...person, audio: next, speaking: next ? person.speaking : false }
            : person,
        ),
      };
    }),

  toggleVideo: () =>
    set((state) => {
      const next = !state.wantVideo;
      persist({ ...state, wantVideo: next });
      return {
        wantVideo: next,
        people: state.people.map((person) =>
          person.local ? { ...person, video: next } : person,
        ),
      };
    }),

  toggleHand: () =>
    set((state) => ({
      people: state.people.map((person) =>
        person.local ? { ...person, hand: !person.hand } : person,
      ),
    })),

  setSharing: (on) =>
    set((state) => ({
      people: state.people.map((person) =>
        person.local ? { ...person, sharing: on } : person,
      ),
    })),

  setLayout: (layout) => set({ layout }),

  togglePanel: (panel) =>
    set((state) => {
      const next = state.panel === panel ? null : panel;
      return {
        panel: next,
        unread: next === "chat" ? 0 : state.unread,
      };
    }),

  closePanel: () => set({ panel: null }),

  setRecording: (value) => set({ recording: value }),

  setLocked: (value) => set({ locked: value }),

  pushChat: (message) =>
    set((state) => ({
      chat: [
        ...state.chat,
        { ...message, id: uid("chat"), at: Date.now() },
      ],
      unread: state.panel === "chat" ? state.unread : state.unread + 1,
    })),

  sendChat: (text) => {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;
    const state = get();
    const local = state.people.find((person) => person.local);
    const from = local?.name || state.displayName || "Guest";
    set((current) => ({
      chat: [
        ...current.chat,
        {
          id: uid("chat"),
          fromId: "local",
          from,
          text: trimmed,
          at: Date.now(),
        },
      ],
    }));
    const responders = get().people.filter((person) => !person.local);
    if (responders.length === 0) return;
    const who = responders[get().chat.length % responders.length];
    const reply = replyFor(trimmed);
    window.setTimeout(() => {
      const now = get();
      if (!now.joined || !now.people.some((person) => person.id === who.id)) return;
      now.pushChat({ fromId: who.id, from: who.name, text: reply });
    }, 900);
  },

  addPerson: (person) =>
    set((state) => {
      if (state.people.some((item) => item.id === person.id)) return state;
      return { people: [...state.people, person] };
    }),

  patchPerson: (id, patch) =>
    set((state) => ({
      people: state.people.map((person) =>
        person.id === id ? { ...person, ...patch } : person,
      ),
    })),

  addLobby: (guest) =>
    set((state) => {
      if (state.lobby.some((item) => item.id === guest.id)) return state;
      if (state.people.some((item) => item.id === guest.id)) return state;
      return { lobby: [...state.lobby, guest] };
    }),

  admit: (id) => {
    const guest = get().lobby.find((item) => item.id === id);
    if (!guest) return;
    set((state) => ({
      lobby: state.lobby.filter((item) => item.id !== id),
      people: state.people.some((item) => item.id === id)
        ? state.people
        : [...state.people, guestToPerson(guest)],
      toast: `${guest.name} joined`,
    }));
  },

  deny: (id) => {
    const guest = get().lobby.find((item) => item.id === id);
    if (!guest) return;
    set((state) => ({
      lobby: state.lobby.filter((item) => item.id !== id),
      toast: `${guest.name} was not admitted`,
    }));
  },

  setSpeaking: (id) =>
    set((state) => ({
      dominantId: id ?? state.people.find((person) => person.local)?.id ?? null,
      people: state.people.map((person) => ({
        ...person,
        speaking: person.id === id && person.audio,
      })),
    })),

  showToast: (text) => set({ toast: text }),
  clearToast: () => set({ toast: null }),

  react: (id, reaction) => {
    get().patchPerson(id, { reaction });
    window.setTimeout(() => {
      const person = get().people.find((item) => item.id === id);
      if (person?.reaction === reaction) get().patchPerson(id, { reaction: null });
    }, 2200);
  },

  muteAll: () =>
    set((state) => ({
      toast: "Everyone else is muted.",
      people: state.people.map((person) =>
        person.local ? person : { ...person, audio: false, speaking: false },
      ),
    })),
}));
