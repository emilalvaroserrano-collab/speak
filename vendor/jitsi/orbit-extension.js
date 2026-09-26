(function() {
  var TRANSLATOR_ID = "orbit-translator";
  var DONATE_ID = "orbit-donate";
  var LIVE_MODEL = "models/gemini-3.5-live-translate-preview";
  var LIVE_SOCKET_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
  var POLL_MS = 750;
  var DONATION_AMOUNTS = [10, 25, 50, 100];
  var panel = { active: null, target: "en", languages: null, languagesLoading: false };
  var translation = {
    enabled: false,
    status: "idle",
    error: "",
    source: "",
    translated: "",
    signature: "",
    generation: 0,
    socket: null,
    input: null,
    output: null,
    sourceNodes: [],
    mixerNode: null,
    processor: null,
    nextTime: 0,
    playing: [],
    token: "",
    model: "",
    target: "",
    mediaTracks: [],
    sessionHandle: "",
    reconnectTimer: null,
    reconnectAttempts: 0,
    sourceCount: 0,
    remoteAudioCount: 0,
    shareAudioCount: 0,
    screenShareActive: false,
    packetsSent: 0,
    lastInputPeak: 0,
    capturedShareStream: null
  };
  var lastAction = { key: "", time: 0 };

  function appStore() {
    if (window.APP && window.APP.store) {
      return window.APP.store;
    }
    return null;
  }

  function appApi() {
    if (window.APP && window.APP.API) {
      return window.APP.API;
    }
    return null;
  }

  function element(name, attributes, children) {
    var node = document.createElement(name);
    var key;
    if (attributes) {
      for (key in attributes) {
        if (!Object.prototype.hasOwnProperty.call(attributes, key)) {
          continue;
        }
        if (key === "text") {
          node.textContent = attributes[key];
        } else if (key === "htmlFor") {
          node.setAttribute("for", attributes[key]);
        } else {
          node.setAttribute(key, attributes[key]);
        }
      }
    }
    (children || []).forEach(function(child) {
      if (typeof child === "string") {
        node.appendChild(document.createTextNode(child));
      } else if (child) {
        node.appendChild(child);
      }
    });
    return node;
  }

  function panelState() {
    var store = appStore();
    if (!store) {
      return null;
    }
    return store.getState()["features/custom-panel"] || null;
  }

  function panelHost() {
    var root = document.getElementById("custom-panel");
    var index;
    if (root) {
      for (index = 0; index < root.children.length; index += 1) {
        var child = root.children[index];
        if (String(child.className || "").indexOf("contentContainer") !== -1) {
          return child;
        }
      }
    }
    return document.getElementById("orbit-panel-fallback-content");
  }

  function ensureFallbackPanel() {
    if (!panel.active || document.getElementById("custom-panel") || document.getElementById("orbit-panel-fallback")) {
      return;
    }
    var root = element("div", {
      id: "orbit-panel-fallback",
      style: "position:fixed;left:0;top:0;bottom:0;width:min(380px,100vw);z-index:10000;background:#1c1f24;color:#fff;box-shadow:8px 0 28px rgba(0,0,0,.38);display:flex;flex-direction:column;"
    });
    root.appendChild(element("div", {
      id: "orbit-panel-fallback-content",
      style: "display:flex;flex:1;min-height:0;overflow:hidden;"
    }));
    document.body.appendChild(root);
  }

  function setPanelSide(mode) {
    var root = document.getElementById("custom-panel");
    if (!root) {
      return;
    }
    if (mode === "translator") {
      root.setAttribute("data-orbit-side", "left");
    } else if (mode === "donate") {
      root.setAttribute("data-orbit-side", "right");
    } else {
      root.removeAttribute("data-orbit-side");
    }
  }

  function injectPanelSideStyle() {
    if (document.getElementById("orbit-panel-side")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "orbit-panel-side";
    style.textContent = "#custom-panel[data-orbit-side='left']{order:-1;}#custom-panel[data-orbit-side='left'] .customPanelDragHandleContainer{left:auto !important;right:4px !important;}";
    document.head.appendChild(style);
  }

  function closeWrapper() {
    var store = appStore();
    var host = panelHost();
    if (host) {
      host.innerHTML = "";
    }
    var fallback = document.getElementById("orbit-panel-fallback");
    if (fallback && fallback.parentNode) {
      fallback.parentNode.removeChild(fallback);
    }
    panel.active = null;
    setPanelSide(null);
    try {
      if (store) {
        store.dispatch({ type: "CUSTOM_PANEL_CLOSE" });
      }
    } catch (ignored) {
      // The fallback panel is already closed even if Jitsi's panel action is unavailable.
    }
  }

  function openPanel(mode) {
    var store = appStore();
    panel.active = mode;
    setPanelSide(mode);
    if (store) {
      try {
        store.dispatch({ type: "SET_CUSTOM_PANEL_ENABLED", enabled: true });
        store.dispatch({ type: "CUSTOM_PANEL_OPEN" });
      } catch (ignored) {
        // A DOM fallback is mounted below if this Jitsi build cannot open custom-panel.
      }
    }
    window.setTimeout(renderActivePanel, 60);
    window.setTimeout(renderActivePanel, 450);
    window.setTimeout(function() {
      if (!document.getElementById("custom-panel")) {
        ensureFallbackPanel();
      }
      renderActivePanel();
    }, 700);
  }

  function togglePanel(mode) {
    var state = panelState();
    if (panel.active === mode && state && state.isOpen) {
      closeWrapper();
    } else {
      if (mode === "translator") {
        translation.enabled = true;
        primeTranslationAudio();
        syncTranslation();
      }
      openPanel(mode);
    }
  }

  function normalizeKey(value) {
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value === "object") {
      return value.key || value.id || value.buttonKey || value.buttonId || "";
    }
    return "";
  }

  function handleToolbarKey(key) {
    if (key === TRANSLATOR_ID || key === DONATE_ID) {
      lastAction = { key: key, time: Date.now() };
      togglePanel(key === TRANSLATOR_ID ? "translator" : "donate");
    }
  }

  function wrapNotify() {
    var api = appApi();
    if (!api || typeof api.notifyToolbarButtonClicked !== "function" || api.notifyToolbarButtonClicked.orbitWrapped) {
      return;
    }
    var original = api.notifyToolbarButtonClicked;
    var wrapped = function() {
      try {
        handleToolbarKey(normalizeKey(arguments.length > 0 ? arguments[0] : ""));
      } catch (ignored) {
        return original.apply(this, arguments);
      }
      return original.apply(this, arguments);
    };
    wrapped.orbitWrapped = true;
    api.notifyToolbarButtonClicked = wrapped;
  }

  function buttonLabel(node) {
    var label = node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("data-testid") || "";
    if (!label) {
      label = node.textContent || "";
    }
    return String(label).trim().toLowerCase();
  }

  function documentClick(event) {
    var node = event.target && event.target.closest ? event.target.closest("button,[role='button']") : null;
    var image;
    var source;
    if (!node) {
      return;
    }
    image = node.querySelector("img");
    source = image ? String(image.getAttribute("src") || "") : "";
    var label = buttonLabel(node);
    if (source.indexOf("orbit-translator.svg") !== -1 || label === "translator") {
      if (Date.now() - lastAction.time < 500 && lastAction.key === TRANSLATOR_ID) {
        return;
      }
      handleToolbarKey(TRANSLATOR_ID);
      return;
    }
    if (source.indexOf("orbit-donate.svg") !== -1 || label === "donate") {
      if (Date.now() - lastAction.time < 500 && lastAction.key === DONATE_ID) {
        return;
      }
      handleToolbarKey(DONATE_ID);
    }
  }

  function renderActivePanel() {
    var host = panelHost();
    var state = panelState();
    var fallbackOpen = Boolean(document.getElementById("orbit-panel-fallback"));
    if (!host || !panel.active || ((!state || !state.isOpen) && !fallbackOpen)) {
      return;
    }
    var marker = host.querySelector("[data-orbit-panel='" + panel.active + "']");
    if (marker) {
      return;
    }
    host.innerHTML = "";
    if (panel.active === "translator") {
      host.appendChild(renderTranslator());
    } else if (panel.active === "donate") {
      host.appendChild(renderDonate());
    }
  }

  function panelShell(title, body) {
    var wrapper = element("div", { "data-orbit-panel": panel.active, style: "display:flex;flex-direction:column;height:100%;min-height:0;background:inherit;color:inherit;font:inherit;" });
    var header = element("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 14px 10px;border-bottom:1px solid rgba(128,128,128,.35);" });
    header.appendChild(element("div", { style: "font-size:15px;font-weight:650;" }, [title]));
    var close = element("button", { type: "button", "aria-label": "Close panel", style: "width:34px;height:34px;border:1px solid rgba(128,128,128,.45);border-radius:999px;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;" }, ["×"]);
    close.addEventListener("click", closeWrapper);
    header.appendChild(close);
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    return wrapper;
  }

  function statusDot(color) {
    return element("span", { style: "width:8px;height:8px;border-radius:999px;background:" + color + ";flex:none;" });
  }

  function loadLanguages(done) {
    if (panel.languages) {
      done(panel.languages);
      return;
    }
    if (panel.languagesLoading) {
      var waiter = window.setInterval(function() {
        if (panel.languages || !panel.languagesLoading) {
          window.clearInterval(waiter);
          done(panel.languages || []);
        }
      }, 250);
      return;
    }
    panel.languagesLoading = true;
    fetch("/api/translation-languages", { headers: { accept: "*/*" } })
      .then(function(response) {
        if (!response.ok) {
          throw new Error("languages");
        }
        return response.json();
      })
      .then(function(languages) {
        panel.languages = Array.isArray(languages) ? languages : [];
        panel.languagesLoading = false;
        done(panel.languages);
      })
      .catch(function() {
        panel.languages = [];
        panel.languagesLoading = false;
        done([]);
      });
  }

  function renderTranslator() {
    var body = element("div", { style: "display:flex;flex-direction:column;min-height:0;flex:1;" });
    var top = element("div", { style: "padding:12px 14px;border-bottom:1px solid rgba(128,128,128,.35);" });
    var label = element("label", { htmlFor: "orbit-language", style: "display:block;font-size:13px;font-weight:600;margin-bottom:8px;" }, ["Translate incoming speech into"]);
    var select = element("select", { id: "orbit-language", style: "width:100%;height:42px;border:1px solid rgba(128,128,128,.55);border-radius:8px;background:rgba(0,0,0,.18);color:inherit;padding:0 10px;font-size:14px;" });
    select.appendChild(element("option", { value: "", text: "Loading languages…" }));
    select.addEventListener("change", function() {
      if (!select.value) {
        return;
      }
      panel.target = select.value;
      syncTranslation();
    });
    top.appendChild(label);
    top.appendChild(select);
    top.appendChild(element("div", {
      style: "margin-top:7px;font-size:11px;line-height:1.35;opacity:.65;"
    }, ["Google Translate language catalog. Languages not currently supported by Gemini Live speech translation are shown but disabled."]));
    body.appendChild(top);

    var statusRow = element("div", { style: "display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(128,128,128,.35);font-size:13px;opacity:.9;" });
    var dot = statusDot("#888");
    var statusText = element("span", { id: "orbit-translation-status", text: "Starting…" });
    statusRow.appendChild(dot);
    statusRow.appendChild(statusText);
    body.appendChild(statusRow);
    body.appendChild(element("div", {
      id: "orbit-translation-debug",
      style: "padding:7px 14px;border-bottom:1px solid rgba(128,128,128,.25);font-size:11px;line-height:1.35;opacity:.68;"
    }, ["Audio sources: 0 • PCM packets: 0"]));

    var controlRow = element("div", { style: "padding:8px 14px;border-bottom:1px solid rgba(128,128,128,.25);" });
    var stopButton = element("button", {
      id: "orbit-stop-translation",
      type: "button",
      style: "width:100%;height:38px;border-radius:8px;border:1px solid rgba(128,128,128,.5);background:rgba(255,255,255,.06);color:inherit;font-size:13px;font-weight:600;cursor:pointer;"
    }, ["Stop translator"]);
    stopButton.addEventListener("click", function() {
      translation.enabled = false;
      stopTranslation(false);
      setTranslationStatus("Translator stopped.", "#888");
      setTranslationDebug("Audio sources: 0 • PCM packets: 0");
      stopButton.textContent = "Translator stopped";
      stopButton.disabled = true;
    });
    controlRow.appendChild(stopButton);
    body.appendChild(controlRow);

    var scroll = element("div", { style: "flex:1;min-height:0;overflow-y:auto;padding:12px 14px 16px;" });
    scroll.appendChild(element("div", { style: "font-size:12px;font-weight:700;opacity:.75;margin-bottom:4px;" }, ["Original"]));
    scroll.appendChild(element("div", { id: "orbit-source-text", style: "font-size:14px;line-height:1.45;margin-bottom:14px;" }, ["Waiting for participant audio."]));
    scroll.appendChild(element("div", { id: "orbit-target-label", style: "font-size:12px;font-weight:700;opacity:.75;margin-bottom:4px;" }, ["Translation"]));
    scroll.appendChild(element("div", { id: "orbit-translated-text", style: "font-size:14px;line-height:1.45;" }, ["Translation will appear here."]));
    scroll.appendChild(element("div", { style: "margin-top:14px;" }, [
      element("button", { id: "orbit-retry", type: "button", style: "display:none;width:100%;height:42px;border-radius:8px;border:1px solid rgba(128,128,128,.55);background:rgba(255,255,255,.08);color:inherit;font-size:14px;font-weight:600;cursor:pointer;" }, ["Try again"])
    ]));
    body.appendChild(scroll);

    var retry = scroll.querySelector("#orbit-retry");
    if (retry) {
      retry.addEventListener("click", function() {
        stopTranslation(true);
        primeTranslationAudio();
        syncTranslation();
      });
    }
    loadLanguages(function(languages) {
      if (panel.active !== "translator") {
        return;
      }
      select.innerHTML = "";
      if (!languages.length) {
        select.appendChild(element("option", { value: "", text: "Languages unavailable" }));
        setTranslationError("The language list could not be loaded. Please try again.");
        return;
      }
      languages.forEach(function(language) {
        if (!language || !language.name) {
          return;
        }
        var liveCode = language.code || "";
        var option = element("option", { value: liveCode, text: language.name });
        if (!language.liveSupported || !liveCode) {
          option.disabled = true;
          option.setAttribute("data-live-supported", "false");
        }
        if (liveCode && liveCode === panel.target) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      syncTranslation();
    });
    window.setTimeout(syncTranslation, 50);
    return panelShell("Translator", body);
  }

  function renderDonate() {
    var body = element("div", { style: "flex:1;min-height:0;overflow-y:auto;padding:14px;" });
    var card = element("div", { style: "border:1px solid rgba(128,128,128,.4);border-radius:12px;padding:14px;margin-bottom:14px;" });
    card.appendChild(element("div", { style: "font-size:15px;font-weight:700;margin-bottom:6px;" }, ["Support Orbit"]));
    card.appendChild(element("div", { style: "font-size:13.5px;line-height:1.45;opacity:.9;" }, ["Help keep simple, private meetings open to everyone."]));
    body.appendChild(card);
    body.appendChild(element("div", { style: "font-size:13px;font-weight:700;margin-bottom:8px;" }, ["Donation amount"]));
    var grid = element("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;" });
    DONATION_AMOUNTS.forEach(function(amount) {
      var choice = element("button", { type: "button", "data-orbit-amount": String(amount), style: "height:44px;border-radius:8px;border:1px solid rgba(128,128,128,.5);background:rgba(255,255,255,.06);color:inherit;font-size:14px;font-weight:650;cursor:pointer;" }, ["$" + amount]);
      choice.addEventListener("click", function() {
        var input = body.querySelector("#orbit-custom-amount");
        if (input) {
          input.value = "";
        }
        donate(amount, body);
      });
      grid.appendChild(choice);
    });
    body.appendChild(grid);
    var customLabel = element("label", { htmlFor: "orbit-custom-amount", style: "display:block;font-size:13px;font-weight:600;margin-bottom:6px;" }, ["Custom amount"]);
    var custom = element("input", { id: "orbit-custom-amount", type: "number", min: "5", max: "500", value: "25", style: "width:100%;height:44px;border:1px solid rgba(128,128,128,.5);border-radius:8px;background:rgba(0,0,0,.18);color:inherit;padding:0 12px;font-size:15px;margin-bottom:12px;" });
    body.appendChild(customLabel);
    body.appendChild(custom);
    var donateButton = element("button", { type: "button", style: "width:100%;height:46px;border:0;border-radius:9px;background:#e7e9ee;color:#0a0a0b;font-size:15px;font-weight:700;cursor:pointer;" }, ["Continue to Stripe"]);
    donateButton.addEventListener("click", function() {
      var amount = Number(custom.value);
      if (!Number.isInteger(amount) || amount < 5 || amount > 500) {
        setDonateMessage(body, "Choose an amount from $5 to $500.", true);
        return;
      }
      donate(amount, body);
    });
    body.appendChild(donateButton);
    body.appendChild(element("div", { id: "orbit-donate-message", role: "status", style: "display:none;margin-top:12px;border:1px solid rgba(128,128,128,.4);border-radius:9px;padding:10px 12px;font-size:13.5px;line-height:1.45;" }));
    return panelShell("Donate", body);
  }

  function setDonateMessage(body, message, isError) {
    var node = body.querySelector("#orbit-donate-message");
    if (!node) {
      return;
    }
    node.style.display = "block";
    node.style.color = isError ? "#ff9d94" : "inherit";
    node.textContent = message;
  }

  function donate(amount, body) {
    var buttons = body.querySelectorAll("button");
    var index;
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].disabled = true;
    }
    setDonateMessage(body, "Opening checkout…", false);
    fetch("/api/donate", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "*/*" },
      body: JSON.stringify({ amount: amount, returnPath: window.location.pathname || "/" })
    })
      .then(function(response) {
        return response.json().then(function(payload) {
          return { ok: response.ok, payload: payload || {} };
        });
      })
      .then(function(result) {
        var i;
        for (i = 0; i < buttons.length; i += 1) {
          buttons[i].disabled = false;
        }
        if (!result.ok) {
          setDonateMessage(body, result.payload.error || "Checkout could not be created.", true);
          return;
        }
        if (result.payload.mode === "live" && result.payload.url) {
          window.location.assign(result.payload.url);
          return;
        }
        setDonateMessage(body, "Demo donation of $" + amount + " prepared. No payment was taken.", false);
      })
      .catch(function() {
        var i;
        for (i = 0; i < buttons.length; i += 1) {
          buttons[i].disabled = false;
        }
        setDonateMessage(body, "Checkout could not be created.", true);
      });
  }

  function supportedConstraint(name) {
    try {
      var supported = navigator.mediaDevices && navigator.mediaDevices.getSupportedConstraints
        ? navigator.mediaDevices.getSupportedConstraints()
        : {};
      return supported[name] !== false;
    } catch (ignored) {
      return true;
    }
  }

  function voiceAudioConstraints(value) {
    var next = {};
    var key;
    if (value && typeof value === "object") {
      for (key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          next[key] = value[key];
        }
      }
    }
    if (supportedConstraint("echoCancellation")) {
      next.echoCancellation = true;
    }
    if (supportedConstraint("noiseSuppression")) {
      next.noiseSuppression = true;
    }
    if (supportedConstraint("autoGainControl")) {
      next.autoGainControl = true;
    }
    if (supportedConstraint("channelCount")) {
      next.channelCount = 1;
    }
    if (supportedConstraint("voiceIsolation")) {
      next.voiceIsolation = true;
    }
    return next;
  }

  function rememberShareStream(stream) {
    if (!stream || typeof stream.getTracks !== "function") {
      return stream;
    }
    translation.capturedShareStream = stream;
    var onEnded = function() {
      window.setTimeout(function() {
        if (translation.capturedShareStream !== stream) {
          return;
        }
        var live = stream.getTracks().some(function(track) {
          return track.readyState === "live";
        });
        if (!live) {
          translation.capturedShareStream = null;
        }
        if (translation.enabled) {
          syncTranslation();
        }
      }, 0);
    };
    stream.getTracks().forEach(function(track) {
      track.addEventListener("ended", onEnded, { once: true });
    });
    if (translation.enabled) {
      window.setTimeout(syncTranslation, 0);
    }
    return stream;
  }

  function installMediaCaptureBridge() {
    var devices = navigator.mediaDevices;
    if (!devices) {
      return;
    }

    if (typeof devices.getUserMedia === "function" && !devices.getUserMedia.orbitWrapped) {
      var originalGetUserMedia = devices.getUserMedia;
      var wrappedGetUserMedia = function(constraints) {
        var next = constraints || {};
        var copied = {};
        var key;
        for (key in next) {
          if (Object.prototype.hasOwnProperty.call(next, key)) {
            copied[key] = next[key];
          }
        }
        if (copied.audio) {
          copied.audio = voiceAudioConstraints(copied.audio);
        }
        return originalGetUserMedia.call(devices, copied);
      };
      wrappedGetUserMedia.orbitWrapped = true;
      try {
        devices.getUserMedia = wrappedGetUserMedia;
      } catch (ignoredUserMediaPatch) {
        // Some WebViews expose read-only media methods. Jitsi's own AEC/NS/AGC
        // flags below still keep the microphone on the voice-processing path.
      }
    }

    if (typeof devices.getDisplayMedia === "function" && !devices.getDisplayMedia.orbitWrapped) {
      var originalGetDisplayMedia = devices.getDisplayMedia;
      var wrappedGetDisplayMedia = function(constraints) {
        var requested = constraints || {};
        var enhanced = {};
        var key;
        for (key in requested) {
          if (Object.prototype.hasOwnProperty.call(requested, key)) {
            enhanced[key] = requested[key];
          }
        }
        enhanced.video = requested.video === false ? true : (requested.video || true);
        enhanced.audio = {
          suppressLocalAudioPlayback: false
        };
        enhanced.systemAudio = "include";
        enhanced.surfaceSwitching = "include";
        enhanced.selfBrowserSurface = "exclude";

        return originalGetDisplayMedia.call(devices, enhanced)
          .then(rememberShareStream)
          .catch(function(error) {
            var name = error && error.name ? String(error.name) : "";
            if (name === "NotAllowedError" || name === "SecurityError" || name === "AbortError") {
              throw error;
            }
            // Browser/OS combinations differ on system-audio support. If an
            // enhanced capture constraint is unsupported, preserve screen
            // sharing by retrying the original Jitsi request.
            return originalGetDisplayMedia.call(devices, requested).then(rememberShareStream);
          });
      };
      wrappedGetDisplayMedia.orbitWrapped = true;
      try {
        devices.getDisplayMedia = wrappedGetDisplayMedia;
      } catch (ignoredDisplayMediaPatch) {
        // The Redux/Jitsi original-stream path below remains the fallback.
      }
    }
  }

  function audioContextConstructor() {
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function ensureAudioContexts() {
    var Constructor = audioContextConstructor();
    if (!Constructor) {
      throw new Error("AudioContext is unavailable");
    }
    if (!translation.input || translation.input.state === "closed") {
      translation.input = new Constructor();
    }
    if (!translation.output || translation.output.state === "closed") {
      translation.output = new Constructor();
    }
    return { input: translation.input, output: translation.output };
  }

  function primeTranslationAudio() {
    try {
      var contexts = ensureAudioContexts();
      contexts.input.resume().catch(function() { return null; });
      contexts.output.resume().catch(function() { return null; });
    } catch (ignored) {
      return;
    }
  }

  function isShareSourceType(value) {
    return /screen|desktop|window|tab|display/i.test(String(value || ""));
  }

  function trackVideoType(track) {
    var value = track && track.videoType ? track.videoType : "";
    var jitsiTrack = track && track.jitsiTrack;
    if (!value && jitsiTrack && typeof jitsiTrack.getVideoType === "function") {
      try {
        value = jitsiTrack.getVideoType() || "";
      } catch (ignored) {
        value = "";
      }
    }
    return String(value || "").toLowerCase();
  }

  function addTranslationTrack(result, mediaTrack, signature) {
    var id;
    if (!mediaTrack || mediaTrack.kind !== "audio" || mediaTrack.readyState !== "live") {
      return false;
    }
    id = mediaTrack.id || signature;
    if (result.seen[id]) {
      return false;
    }
    result.seen[id] = true;
    result.tracks.push(mediaTrack);
    result.signature.push(signature + ":" + id);
    return true;
  }

  function translationMedia() {
    var store = appStore();
    var result = {
      tracks: [],
      signature: [],
      seen: {},
      remoteAudioCount: 0,
      shareAudioCount: 0,
      screenShareActive: false
    };
    var state;
    var tracks;
    if (!store) {
      return result;
    }
    state = store.getState();
    tracks = state["features/base/tracks"] || [];

    // The browser capture bridge keeps the original getDisplayMedia stream.
    // This is the most reliable place to retrieve local tab/system audio,
    // because Jitsi may retain only the desktop video track in Redux.
    if (translation.capturedShareStream && typeof translation.capturedShareStream.getTracks === "function") {
      var capturedTracks = translation.capturedShareStream.getTracks();
      result.screenShareActive = capturedTracks.some(function(track) {
        return track.kind === "video" && track.readyState === "live";
      });
      translation.capturedShareStream.getAudioTracks().forEach(function(audioTrack) {
        if (addTranslationTrack(result, audioTrack, "captured-share:" + String(audioTrack.id || "audio"))) {
          result.shareAudioCount += 1;
        }
      });
    }

    tracks.forEach(function(track) {
      var jitsiTrack = track && track.jitsiTrack;
      var mediaTrack = null;
      var participantId = track && track.participantId ? track.participantId : "remote";
      var sourceName = "";
      var trackId = "";
      var sourceType = "";

      if (!track || !jitsiTrack) {
        return;
      }

      // Jitsi keeps the browser getDisplayMedia stream on the local desktop
      // video track. That original stream contains system/tab audio when the
      // user checked "Share audio", even if Jitsi does not expose a separate
      // local audio entry in the Redux track list.
      if (track.local && track.mediaType === "video" && trackVideoType(track) === "desktop") {
        result.screenShareActive = true;
        if (typeof jitsiTrack.getOriginalStream === "function") {
          try {
            var originalStream = jitsiTrack.getOriginalStream();
            if (originalStream && typeof originalStream.getAudioTracks === "function") {
              originalStream.getAudioTracks().forEach(function(audioTrack) {
                if (addTranslationTrack(result, audioTrack, "local-share-original")) {
                  result.shareAudioCount += 1;
                }
              });
            }
          } catch (ignoredOriginalStream) {
            // Continue and try an explicit share-audio track if Jitsi exposes one.
          }
        }
        return;
      }

      if (track.mediaType !== "audio" || track.muted || track.isReceivingData === false || typeof jitsiTrack.getTrack !== "function") {
        return;
      }

      try {
        mediaTrack = jitsiTrack.getTrack();
        if (typeof jitsiTrack.getParticipantId === "function") {
          participantId = jitsiTrack.getParticipantId() || participantId;
        }
        if (typeof jitsiTrack.getSourceName === "function") {
          sourceName = jitsiTrack.getSourceName() || "";
        }
        if (typeof jitsiTrack.getTrackId === "function") {
          trackId = jitsiTrack.getTrackId() || "";
        }
        sourceType = jitsiTrack.sourceType || track.sourceType || "";
      } catch (ignoredTrack) {
        mediaTrack = null;
      }

      if (!trackId && mediaTrack) {
        trackId = mediaTrack.id || "audio";
      }

      // Every remote audio source is valid translator input.
      if (!track.local) {
        if (addTranslationTrack(result, mediaTrack, "remote:" + String(participantId) + ":" + String(sourceName) + ":" + String(trackId))) {
          result.remoteAudioCount += 1;
        }
        return;
      }

      // Never translate the local microphone. Only explicit local share/system
      // audio is admitted here to avoid feeding the listener's own speech back
      // into Gemini.
      if (isShareSourceType(sourceType) || trackVideoType(track) === "desktop") {
        result.screenShareActive = true;
        if (addTranslationTrack(result, mediaTrack, "local-share:" + String(sourceName) + ":" + String(trackId))) {
          result.shareAudioCount += 1;
        }
      }
    });

    result.signature = result.signature.sort().join("|");
    return result;
  }

  function setTranslationStatus(text, color) {
    var status = document.querySelector("#orbit-translation-status");
    if (status) {
      status.textContent = text;
    }
    var retry = document.querySelector("#orbit-retry");
    if (retry) {
      retry.style.display = translation.status === "error" ? "block" : "none";
    }
    void color;
  }

  function setTranslationDebug(text) {
    var node = document.querySelector("#orbit-translation-debug");
    if (node) {
      node.textContent = text;
    }
  }

  function updateTranslationDebug() {
    var sources = translation.sourceCount || 0;
    var parts = ["Audio sources: " + sources];
    if (translation.shareAudioCount) {
      parts.push("shared: " + translation.shareAudioCount);
    }
    if (translation.remoteAudioCount) {
      parts.push("remote: " + translation.remoteAudioCount);
    }
    parts.push("PCM packets: " + (translation.packetsSent || 0));
    if (translation.packetsSent) {
      parts.push("signal: " + Math.round((translation.lastInputPeak || 0) * 100) + "%");
    }
    setTranslationDebug(parts.join(" • "));
  }

  function mergeTranscript(previous, incoming) {
    var before = String(previous || "").trim();
    var next = String(incoming || "").trim();
    if (!next) {
      return before;
    }
    if (!before) {
      return next;
    }
    if (next.indexOf(before) === 0) {
      return next;
    }
    if (before.indexOf(next) !== -1) {
      return before;
    }
    return (before + " " + next).replace(/\s+/g, " ").trim();
  }

  function setTranslationText(kind, text) {
    var node = document.querySelector(kind === "source" ? "#orbit-source-text" : "#orbit-translated-text");
    if (node) {
      node.textContent = text;
    }
  }

  function setTranslationError(message) {
    translation.status = "error";
    translation.error = message;
    setTranslationStatus(message, "#ff9d94");
    setTranslationText("source", translation.source || "Waiting for participant audio.");
    setTranslationText("translated", translation.translated || "Translation will appear here.");
    var retry = document.querySelector("#orbit-retry");
    if (retry) {
      retry.style.display = "block";
    }
  }

  function clearReconnectTimer() {
    if (translation.reconnectTimer) {
      window.clearTimeout(translation.reconnectTimer);
      translation.reconnectTimer = null;
    }
  }

  function disconnectInput() {
    if (translation.processor) {
      try {
        translation.processor.disconnect();
      } catch (ignoredProcessor) {
      }
      translation.processor.onaudioprocess = null;
      translation.processor = null;
    }
    if (translation.mixerNode) {
      try {
        translation.mixerNode.disconnect();
      } catch (ignoredMixer) {
      }
      translation.mixerNode = null;
    }
    translation.sourceNodes.forEach(function(source) {
      try {
        source.disconnect();
      } catch (ignoredSource) {
        return;
      }
    });
    translation.sourceNodes = [];
  }

  function stopOutputPlayback() {
    translation.playing.forEach(function(source) {
      try {
        source.stop();
      } catch (ignoredStop) {
        return;
      }
    });
    translation.playing = [];
    translation.nextTime = translation.output ? translation.output.currentTime : 0;
  }

  function closeSocket() {
    var socket = translation.socket;
    translation.socket = null;
    if (!socket) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch (ignored) {
      return;
    }
  }

  function stopTranslation(keepAudio) {
    translation.generation += 1;
    translation.status = "idle";
    translation.error = "";
    translation.signature = "";
    translation.token = "";
    translation.model = "";
    translation.target = "";
    translation.mediaTracks = [];
    translation.sessionHandle = "";
    translation.reconnectAttempts = 0;
    translation.sourceCount = 0;
    translation.remoteAudioCount = 0;
    translation.shareAudioCount = 0;
    translation.screenShareActive = false;
    translation.packetsSent = 0;
    translation.lastInputPeak = 0;
    updateTranslationDebug();
    clearReconnectTimer();
    closeSocket();
    disconnectInput();
    stopOutputPlayback();
    if (!keepAudio) {
      if (translation.input) {
        translation.input.close().catch(function() { return null; });
        translation.input = null;
      }
      if (translation.output) {
        translation.output.close().catch(function() { return null; });
        translation.output = null;
      }
    }
  }

  function floatToBase64(input) {
    var bytes = new Uint8Array(input.length * 2);
    var view = new DataView(bytes.buffer);
    var index;
    for (index = 0; index < input.length; index += 1) {
      var sample = Math.max(-1, Math.min(1, input[index]));
      view.setInt16(index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    var binary = "";
    for (index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    var index;
    for (index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function scheduleOutput(bytes, output, next) {
    var samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    var buffer = output.createBuffer(1, samples.length, 24000);
    var channel = buffer.getChannelData(0);
    var index;
    for (index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 32768;
    }
    if (next.value > output.currentTime + 2) {
      next.value = output.currentTime + 0.03;
    }
    var source = output.createBufferSource();
    source.buffer = buffer;
    source.connect(output.destination);
    var startAt = Math.max(output.currentTime + 0.03, next.value);
    source.start(startAt);
    next.value = startAt + buffer.duration;
    translation.playing.push(source);
    source.onended = function() {
      translation.playing = translation.playing.filter(function(item) {
        return item !== source;
      });
    };
  }

  function syncTranslation() {
    var media;
    var expectedSignature;
    if (!translation.enabled) {
      return;
    }
    media = translationMedia();

    translation.sourceCount = media.tracks.length;
    translation.remoteAudioCount = media.remoteAudioCount;
    translation.shareAudioCount = media.shareAudioCount;
    translation.screenShareActive = media.screenShareActive;
    updateTranslationDebug();

    if (!media.tracks.length) {
      if (translation.signature || translation.status === "connecting" || translation.status === "listening" || translation.status === "playing") {
        stopTranslation(true);
        translation.screenShareActive = media.screenShareActive;
        updateTranslationDebug();
      }
      translation.status = "idle";
      if (media.screenShareActive) {
        setTranslationStatus("Screen share detected, but no shared audio track is available.", "#888");
        setTranslationText("source", "Re-share the tab/window and enable Share audio.");
      } else {
        setTranslationStatus("Waiting for participant or shared-screen audio.", "#888");
        setTranslationText("source", translation.source || "Waiting for participant or shared-screen audio.");
      }
      return;
    }

    expectedSignature = media.signature + "|" + panel.target;
    if (translation.signature === expectedSignature && (translation.socket || translation.reconnectTimer || translation.status === "connecting")) {
      return;
    }

    stopTranslation(true);
    translation.sourceCount = media.tracks.length;
    translation.remoteAudioCount = media.remoteAudioCount;
    translation.shareAudioCount = media.shareAudioCount;
    translation.screenShareActive = media.screenShareActive;
    updateTranslationDebug();
    startTranslation(media.tracks, expectedSignature, panel.target);
  }

  function startTranslation(mediaTracks, signature, target) {
    var generation = translation.generation + 1;
    var contexts;
    translation.generation = generation;
    translation.status = "connecting";
    translation.error = "";
    translation.signature = signature;
    translation.source = "";
    translation.translated = "";
    translation.target = target;
    translation.mediaTracks = mediaTracks.slice();
    translation.sessionHandle = "";
    translation.reconnectAttempts = 0;
    translation.packetsSent = 0;
    translation.lastInputPeak = 0;
    updateTranslationDebug();
    setTranslationStatus("Connecting to live translator…", "#ffd479");
    setTranslationText("source", "Listening…");
    setTranslationText("translated", "Translation will appear here.");
    try {
      contexts = ensureAudioContexts();
    } catch (contextError) {
      setTranslationError("This browser cannot start live audio translation.");
      return;
    }
    contexts.input.resume().catch(function() { return null; });
    contexts.output.resume().catch(function() { return null; });
    translation.nextTime = contexts.output.currentTime;

    fetch("/api/translate-token", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ targetLanguageCode: target })
    })
      .then(function(response) {
        return response.json().then(function(payload) {
          return { ok: response.ok, payload: payload || {} };
        });
      })
      .then(function(result) {
        if (generation !== translation.generation) {
          return;
        }
        if (!result.ok || !result.payload.token || !result.payload.model) {
          setTranslationError(result.payload.error || "Translation could not start. Please try again.");
          return;
        }
        translation.token = result.payload.token;
        translation.model = result.payload.model;
        openLiveSocket(mediaTracks, result.payload.token, result.payload.model, target, generation, "");
      })
      .catch(function() {
        if (generation !== translation.generation) {
          return;
        }
        setTranslationError("Translation could not start. Please try again.");
      });
  }

  function scheduleReconnect(generation) {
    var delay;
    if (generation !== translation.generation || !translation.enabled || translation.reconnectTimer) {
      return;
    }
    translation.reconnectAttempts += 1;
    if (!translation.sessionHandle || translation.reconnectAttempts > 2) {
      var tracks = translation.mediaTracks.slice();
      var signature = translation.signature;
      var target = translation.target;
      translation.reconnectTimer = window.setTimeout(function() {
        translation.reconnectTimer = null;
        if (generation !== translation.generation || !translation.enabled) {
          return;
        }
        stopTranslation(true);
        if (tracks.length && signature && target) {
          startTranslation(tracks, signature, target);
        }
      }, 600);
      setTranslationStatus("Refreshing translation connection…", "#ffd479");
      return;
    }
    delay = Math.min(2000, 300 * translation.reconnectAttempts);
    setTranslationStatus("Reconnecting translation…", "#ffd479");
    translation.reconnectTimer = window.setTimeout(function() {
      translation.reconnectTimer = null;
      if (generation !== translation.generation || !translation.enabled) {
        return;
      }
      openLiveSocket(
        translation.mediaTracks,
        translation.token,
        translation.model,
        translation.target,
        generation,
        translation.sessionHandle
      );
    }, delay);
  }

  function openLiveSocket(mediaTracks, token, model, target, generation, sessionHandle) {
    var socket;
    var setup;
    clearReconnectTimer();
    disconnectInput();
    try {
      socket = new WebSocket(LIVE_SOCKET_URL + "?access_token=" + encodeURIComponent(token));
    } catch (socketError) {
      scheduleReconnect(generation);
      return;
    }
    translation.socket = socket;
    socket.onopen = function() {
      if (generation !== translation.generation || translation.socket !== socket) {
        return;
      }
      setup = {
        model: model.indexOf("models/") === 0 ? model : "models/" + model,
        generationConfig: {
          responseModalities: ["AUDIO"],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          translationConfig: { targetLanguageCode: target, echoTargetLanguage: false }
        },
        sessionResumption: sessionHandle ? { handle: sessionHandle } : {},
        contextWindowCompression: { slidingWindow: {} }
      };
      socket.send(JSON.stringify({ setup: setup }));
    };
    socket.onmessage = function(event) {
      var message;
      var content;
      if (generation !== translation.generation || translation.socket !== socket) {
        return;
      }
      try {
        message = JSON.parse(event.data);
      } catch (parseError) {
        return;
      }
      if (message.sessionResumptionUpdate && message.sessionResumptionUpdate.resumable && message.sessionResumptionUpdate.newHandle) {
        translation.sessionHandle = message.sessionResumptionUpdate.newHandle;
      }
      if (message.goAway) {
        setTranslationStatus("Refreshing translation connection…", "#ffd479");
      }
      if (message.setupComplete) {
        translation.status = "listening";
        translation.reconnectAttempts = 0;
        setTranslationStatus("Live translator connected. Listening…", "#8fd49a");
        updateTranslationDebug();
        startInput(mediaTracks, generation);
        return;
      }
      content = message.serverContent;
      if (!content) {
        return;
      }
      if (content.interrupted) {
        stopOutputPlayback();
      }
      if (content.inputTranscription && content.inputTranscription.text) {
        translation.source = mergeTranscript(translation.source, content.inputTranscription.text);
        setTranslationText("source", translation.source);
      }
      if (content.outputTranscription && content.outputTranscription.text) {
        translation.translated = mergeTranscript(translation.translated, content.outputTranscription.text);
        translation.status = "playing";
        setTranslationStatus("Playing translation.", "#8fd49a");
        setTranslationText("translated", translation.translated);
      }
      (content.modelTurn && content.modelTurn.parts ? content.modelTurn.parts : []).forEach(function(part) {
        if (!part || !part.inlineData || !part.inlineData.data || String(part.inlineData.mimeType || "").indexOf("audio/") !== 0) {
          return;
        }
        translation.status = "playing";
        setTranslationStatus("Playing translation.", "#8fd49a");
        if (translation.output) {
          scheduleOutput(base64ToBytes(part.inlineData.data), translation.output, {
            get value() { return translation.nextTime; },
            set value(next) { translation.nextTime = next; }
          });
        }
      });
      if (content.turnComplete) {
        translation.status = "listening";
        setTranslationStatus("Listening for remote speech.", "#8fd49a");
      }
    };
    socket.onerror = function() {
      if (generation !== translation.generation || translation.socket !== socket) {
        return;
      }
      setTranslationStatus("Reconnecting translation…", "#ffd479");
    };
    socket.onclose = function() {
      if (generation !== translation.generation || translation.socket !== socket) {
        return;
      }
      translation.socket = null;
      disconnectInput();
      scheduleReconnect(generation);
    };
  }

  function downsample(input, fromRate) {
    var rate = fromRate || 16000;
    var ratio;
    var length;
    var output;
    var index;
    var start;
    var end;
    var total;
    var count;
    if (rate === 16000) {
      return input;
    }
    ratio = rate / 16000;
    length = Math.max(1, Math.floor(input.length / ratio));
    output = new Float32Array(length);
    for (index = 0; index < length; index += 1) {
      start = Math.floor(index * ratio);
      end = Math.min(input.length, Math.floor((index + 1) * ratio));
      total = 0;
      count = 0;
      while (start < end) {
        total += input[start];
        start += 1;
        count += 1;
      }
      output[index] = count ? total / count : 0;
    }
    return output;
  }

  function startInput(mediaTracks, generation) {
    var input = translation.input;
    var socket = translation.socket;
    var liveTracks;
    var mixer;
    var processor;
    if (!input || !socket || generation !== translation.generation) {
      return;
    }
    disconnectInput();
    liveTracks = mediaTracks.filter(function(track) {
      return track && track.kind === "audio" && track.readyState === "live";
    });
    if (!liveTracks.length) {
      setTranslationError("No live participant audio is available to translate.");
      return;
    }
    try {
      mixer = input.createGain();
      mixer.gain.value = 1 / Math.max(1, Math.sqrt(liveTracks.length));
      translation.sourceNodes = liveTracks.map(function(track) {
        var source = input.createMediaStreamSource(new MediaStream([track]));
        source.connect(mixer);
        return source;
      });
      processor = input.createScriptProcessor(1024, 1, 1);
      processor.onaudioprocess = function(event) {
        var live;
        var peak = 0;
        var i;
        if (generation !== translation.generation || !translation.socket || translation.socket.readyState !== 1) {
          return;
        }
        event.outputBuffer.getChannelData(0).fill(0);
        if (translation.socket.bufferedAmount > 512 * 1024) {
          return;
        }
        live = downsample(event.inputBuffer.getChannelData(0), input.sampleRate);
        for (i = 0; i < live.length; i += 1) {
          peak = Math.max(peak, Math.abs(live[i]));
        }
        translation.lastInputPeak = peak;
        translation.packetsSent += 1;
        if (translation.packetsSent === 1 || translation.packetsSent % 10 === 0) {
          updateTranslationDebug();
        }
        translation.socket.send(JSON.stringify({
          realtimeInput: {
            audio: { data: floatToBase64(live), mimeType: "audio/pcm;rate=16000" }
          }
        }));
      };
      mixer.connect(processor);
      processor.connect(input.destination);
      translation.mixerNode = mixer;
      translation.processor = processor;
      input.resume().catch(function() { return null; });
    } catch (inputError) {
      disconnectInput();
      setTranslationError("This browser cannot capture meeting or shared-screen audio.");
    }
  }

  function poll() {
    var store = appStore();
    if (!store) {
      return;
    }
    wrapNotify();
    if (translation.enabled) {
      syncTranslation();
    }
    var state = panelState();
    if (panel.active && (!state || !state.isOpen)) {
      closeWrapper();
      return;
    }
    renderActivePanel();
  }

  function boot() {
    if (!window.APP || !appApi() || !appStore()) {
      window.setTimeout(boot, 250);
      return;
    }
    installMediaCaptureBridge();
    wrapNotify();
    injectPanelSideStyle();
    document.addEventListener("click", documentClick, true);
    window.setInterval(poll, POLL_MS);
    window.setTimeout(poll, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
