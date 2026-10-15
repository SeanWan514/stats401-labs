const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const startVoiceButton = document.getElementById("start-voice");
const stopVoiceButton = document.getElementById("stop-voice");
const clearVoiceHighlightButton = document.getElementById("clear-voice-highlight");
const voiceSupport = document.getElementById("voice-support");
const voiceState = document.getElementById("voice-state");
const voiceTranscript = document.getElementById("voice-transcript");
const voiceAction = document.getElementById("voice-action");
const networkStatus = document.getElementById("network-status");

let recognition = null;
let recognitionActive = false;
let recognitionTimeout = null;
let networkReady = false;

function setVoiceFeedback({state, transcript, action, tone = "neutral"}) {
    if (state !== undefined) voiceState.textContent = state;
    if (transcript !== undefined) voiceTranscript.textContent = transcript;
    if (action !== undefined) voiceAction.textContent = action;
    voiceState.dataset.tone = tone;
    voiceAction.dataset.tone = tone;
}

function setRecognitionButtons(listening) {
    recognitionActive = listening;
    startVoiceButton.disabled = listening || !SpeechRecognition || !networkReady;
    stopVoiceButton.disabled = !listening;
}

function normalizeCommand(command) {
    return String(command).toLowerCase().trim().replace(/([a-z])-([a-z])/g, "$1 $2")
        .replace(/[.,!?;:]+$/g, "").replace(/\s+/g, " ").trim()
        .replace(/^please\s+/, "").replace(/\s+please$/, "");
}

function parseDayNumber(value) {
    if (/^\d+$/.test(value)) return Number(value);
    const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
    const tens = {twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90};
    if (small.includes(value)) return small.indexOf(value);
    const parts = value.split(" ");
    if (Object.hasOwn(tens, parts[0])) {
        if (parts.length === 1) return tens[parts[0]];
        const unit = small.indexOf(parts[1]);
        if (parts.length === 2 && unit >= 1 && unit <= 9) return tens[parts[0]] + unit;
    }
    return NaN;
}

function clearCompanyHighlight(announce = true) {
    if (typeof nodeSelection !== "undefined" && nodeSelection) {
        nodeSelection.classed("voice-selected", false).classed("voice-muted", false);
    }
    if (typeof linkLayer !== "undefined" && linkLayer) {
        linkLayer.selectAll("line").classed("voice-selected", false).classed("voice-muted", false);
    }
    if (announce) setVoiceFeedback({action: "Company highlight cleared.", tone: "success"});
}

function highlightCompany(name) {
    const match = companies.find(company => normalizeCommand(company.company_name) === name);
    if (!match) return null;
    // Freeze the inspected day so emphasized relationships cannot become stale.
    pause();
    clearCompanyHighlight(false);
    nodeSelection.classed("voice-selected", company => company.id === match.id)
        .classed("voice-muted", company => company.id !== match.id);
    linkLayer.selectAll("line")
        .classed("voice-selected", link => endpointId(link.source) === match.id || endpointId(link.target) === match.id)
        .classed("voice-muted", link => endpointId(link.source) !== match.id && endpointId(link.target) !== match.id);
    return `Paused and highlighted ${match.company_name} and its active relationships on Day ${currentDay}.`;
}

function navigateToDay(day) {
    pause();
    clearCompanyHighlight(false);
    showDay(day);
}

function handleVoiceCommand(rawCommand) {
    if (!networkReady) {
        setVoiceFeedback({action: "The network is still loading. Try again when it is ready.", tone: "error"});
        return false;
    }
    const command = normalizeCommand(rawCommand);
    const companyMatch = command.match(/^(?:highlight|select company)\s+(.+)$/);
    const dayMatch = command.match(/^(?:(?:go to|show|open|jump to|select)\s+)?day\s+(.+)$/);
    let action;

    if (/^clear (?:highlight|selection)$/.test(command)) {
        clearCompanyHighlight(false);
        action = "Company highlight cleared.";
    } else if (companyMatch) {
        action = highlightCompany(companyMatch[1]);
        if (!action) {
            setVoiceFeedback({action: "Company not recognized. Try “Highlight” followed by a complete company name, such as Ion Systems.", tone: "error"});
            return false;
        }
    } else if (dayMatch) {
        const requestedDay = parseDayNumber(dayMatch[1]);
        if (!Number.isInteger(requestedDay) || requestedDay < 1 || requestedDay > 60) {
            setVoiceFeedback({action: "Choose one whole day between 1 and 60. Try “Go to day thirty” or “Go to day 30”.", tone: "error"});
            return false;
        }
        navigateToDay(requestedDay);
        action = `Showing Day ${requestedDay}.`;
    } else if (/^(?:next(?: day)?|move forward)$/.test(command)) {
        const wasLastDay = currentDay === 60;
        navigateToDay(Math.min(60, currentDay + 1));
        action = wasLastDay ? "Already at Day 60." : `Showing Day ${currentDay}.`;
    } else if (/^(?:previous(?: day)?|back|move back)$/.test(command)) {
        const wasFirstDay = currentDay === 1;
        navigateToDay(Math.max(1, currentDay - 1));
        action = wasFirstDay ? "Already at Day 1." : `Showing Day ${currentDay}.`;
    } else if (/^(?:reset|start over|first day)$/.test(command)) {
        clearCompanyHighlight(false);
        reset();
        action = "Reset the visualization to Day 1.";
    } else if (/^(?:pause|stop animation)$/.test(command)) {
        pause();
        action = `Paused on Day ${currentDay}.`;
    } else if (/^(?:play|start animation|play animation)$/.test(command)) {
        const wasLastDay = currentDay === 60;
        clearCompanyHighlight(false);
        play();
        action = wasLastDay ? "Restarted playback from Day 1." : `Playing from Day ${currentDay}.`;
    } else {
        setVoiceFeedback({action: "Command not recognized. Say one command: Play, Pause, Next day, Previous day, Go to day thirty, Reset, or Highlight plus a company name.", tone: "error"});
        return false;
    }

    setVoiceFeedback({action, tone: "success"});
    return true;
}

function describeRecognitionError(errorCode) {
    const messages = {
        "not-allowed": "Microphone or speech-recognition permission was denied. Check this site's microphone permission and your system's speech-recognition settings, or use the conventional controls.",
        "service-not-allowed": "Speech recognition is blocked by this browser or device. Conventional controls remain available.",
        "audio-capture": "No working microphone was found. Conventional controls remain available.",
        "no-speech": "No speech was detected. Select Start Voice Control and try again.",
        network: "The browser speech-recognition service could not be reached. Conventional controls remain available.",
        aborted: "Listening was cancelled."
    };
    return messages[errorCode] || `Speech recognition failed (${errorCode}). Conventional controls remain available.`;
}

function finishRecognition(session, abort = false) {
    if (recognition !== session) return;
    clearTimeout(recognitionTimeout);
    recognitionTimeout = null;
    // Detach retired sessions so delayed events cannot execute an old command.
    session.onstart = session.onresult = session.onerror = session.onend = null;
    recognition = null;
    if (abort) {
        try { session.abort(); } catch (_) { /* The browser may already have ended. */ }
    }
    setRecognitionButtons(false);
}

function cancelListening(message = "Listening was cancelled.") {
    if (!recognition) return;
    finishRecognition(recognition, true);
    setVoiceFeedback({state: "Inactive", action: message});
}

function startListening() {
    if (!SpeechRecognition || recognitionActive || !networkReady) return;
    // Lock immediately, including while the browser is waiting for permission.
    setRecognitionButtons(true);
    setVoiceFeedback({state: "Starting…", transcript: "Waiting for speech", action: "Allow microphone access if prompted, then speak one command.", tone: "listening"});
    try {
        const session = new SpeechRecognition();
        recognition = session;
        session.lang = "en-US";
        session.continuous = false;
        session.interimResults = false;
        session.maxAlternatives = 1;
        const isCurrent = () => recognition === session && recognitionActive;

        session.onstart = () => {
            if (!isCurrent()) return;
            setVoiceFeedback({state: "Listening…", action: "Speak one supported command.", tone: "listening"});
        };
        session.onresult = event => {
            if (!isCurrent()) return;
            const result = event.results?.[event.resultIndex ?? 0]?.[0];
            const transcript = result?.transcript?.trim() || "";
            setVoiceFeedback({state: "Recognized", transcript: transcript ? `“${transcript}”` : "No usable words", action: "Interpreting command…", tone: "success"});
            handleVoiceCommand(transcript);
            finishRecognition(session, true);
        };
        session.onerror = event => {
            if (!isCurrent()) return;
            setVoiceFeedback({state: "Recognition ended", action: describeRecognitionError(event.error), tone: event.error === "aborted" ? "neutral" : "error"});
            finishRecognition(session, true);
        };
        session.onend = () => {
            if (!isCurrent()) return;
            setVoiceFeedback({state: "Inactive", action: "Listening ended without a recognized command. Select Start Voice Control to try again."});
            finishRecognition(session);
        };
        recognitionTimeout = setTimeout(() => {
            if (!isCurrent()) return;
            finishRecognition(session, true);
            setVoiceFeedback({state: "Timed out", action: "No command completed within 20 seconds. Check microphone permission and try again, or use the conventional controls.", tone: "error"});
        }, 20000);
        session.start();
    } catch (_) {
        if (recognition) finishRecognition(recognition, true);
        else setRecognitionButtons(false);
        setVoiceFeedback({state: "Unable to start", action: "Speech recognition could not start in this browser. Try again or use the conventional controls.", tone: "error"});
    }
}

startVoiceButton.addEventListener("click", startListening);
stopVoiceButton.addEventListener("click", () => cancelListening());
clearVoiceHighlightButton.addEventListener("click", () => {
    cancelListening();
    clearCompanyHighlight(true);
});

// Conventional navigation cancels pending voice input and clears day-specific emphasis.
function useConventionalNavigation() {
    cancelListening("Listening stopped because a conventional control was used.");
    clearCompanyHighlight(false);
    setVoiceFeedback({action: "Conventional navigation used; any company highlight has been cleared."});
}
for (const id of ["play-button", "pause-button", "reset-button"]) {
    document.getElementById(id).addEventListener("click", useConventionalNavigation, true);
}
document.getElementById("time-slider").addEventListener("input", useConventionalNavigation, true);

// A tooltip or hover neighborhood from the previous day must not describe a new frame.
const dayInspectionObserver = new MutationObserver(() => {
    if (typeof hideTooltip === "function") hideTooltip();
    if (typeof nodeSelection !== "undefined" && nodeSelection) nodeSelection.classed("dimmed", false);
    if (typeof linkLayer !== "undefined" && linkLayer) {
        linkLayer.selectAll("line").classed("dimmed", false).classed("emphasized", false);
    }
});
dayInspectionObserver.observe(document.getElementById("current-day"), {childList: true, subtree: true});

function syncNetworkReady() {
    networkReady = networkStatus.classList.contains("ready");
    setRecognitionButtons(recognitionActive);
    if (networkReady) networkReadyObserver.disconnect();
}
const networkReadyObserver = new MutationObserver(syncNetworkReady);
networkReadyObserver.observe(networkStatus, {attributes: true, childList: true, subtree: true});
// Also read the existing state: the reused network may have finished before this script.
syncNetworkReady();

if (SpeechRecognition) {
    voiceSupport.textContent = "This browser exposes speech recognition. Select Start Voice Control to try it; microphone permission and service availability are also required.";
} else {
    voiceSupport.textContent = "Speech recognition is unavailable in this browser. The visualization and all fallback controls still work.";
    voiceSupport.classList.add("unsupported");
    setVoiceFeedback({state: "Unsupported", action: "Use Play, Pause, Reset, the slider, mouse, or keyboard controls.", tone: "error"});
}

window.addEventListener("pagehide", () => cancelListening("Listening stopped because the page was left."));
document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelListening("Listening stopped because the page is no longer visible.");
});
