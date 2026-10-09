const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const startVoiceButton = document.getElementById("start-voice");
const stopVoiceButton = document.getElementById("stop-voice");
const clearVoiceHighlightButton = document.getElementById("clear-voice-highlight");
const voiceSupport = document.getElementById("voice-support");
const voiceState = document.getElementById("voice-state");
const voiceTranscript = document.getElementById("voice-transcript");
const voiceAction = document.getElementById("voice-action");

let recognition = null;
let recognitionActive = false;
let cancelledByUser = false;
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
    return command.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
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

function highlightCompany(command) {
    const match = companies.find(company => command.includes(company.company_name.toLowerCase()));
    if (!match) return null;
    clearCompanyHighlight(false);
    nodeSelection.classed("voice-selected", company => company.id === match.id)
        .classed("voice-muted", company => company.id !== match.id);
    linkLayer.selectAll("line")
        .classed("voice-selected", link => endpointId(link.source) === match.id || endpointId(link.target) === match.id)
        .classed("voice-muted", link => endpointId(link.source) !== match.id && endpointId(link.target) !== match.id);
    return `Highlighted ${match.company_name} and its active relationships on Day ${currentDay}.`;
}

function navigateToDay(day) {
    pause();
    showDay(day);
    clearCompanyHighlight(false);
}

function handleVoiceCommand(rawCommand) {
    const command = normalizeCommand(rawCommand);
    let action;

    if (!command) {
        setVoiceFeedback({action: "No usable words were recognized. Try one of the listed commands.", tone: "error"});
        return false;
    }

    if (command.includes("clear highlight") || command.includes("clear selection")) {
        clearCompanyHighlight(false);
        action = "Company highlight cleared.";
    } else if (command.includes("highlight") || command.includes("select company")) {
        action = highlightCompany(command);
        if (!action) {
            setVoiceFeedback({action: "Company not recognized. Try saying “Highlight” followed by a complete company name.", tone: "error"});
            return false;
        }
    } else {
        const dayMatch = command.match(/(?:go to|show|open|jump to|select)?\s*day\s+(\d{1,2})\b/);
        if (dayMatch) {
            const requestedDay = Number(dayMatch[1]);
            if (requestedDay < 1 || requestedDay > 60) {
                setVoiceFeedback({action: "Day must be between 1 and 60.", tone: "error"});
                return false;
            }
            navigateToDay(requestedDay);
            action = `Showing Day ${requestedDay}.`;
        } else if (command.includes("next day") || command === "next" || command.includes("move forward")) {
            const wasLastDay = currentDay === 60;
            const nextDay = Math.min(60, currentDay + 1);
            navigateToDay(nextDay);
            action = wasLastDay ? "Already at Day 60." : `Showing Day ${nextDay}.`;
        } else if (command.includes("previous day") || command === "previous" || command === "back" || command.includes("move back")) {
            const wasFirstDay = currentDay === 1;
            const previousDay = Math.max(1, currentDay - 1);
            navigateToDay(previousDay);
            action = wasFirstDay ? "Already at Day 1." : `Showing Day ${previousDay}.`;
        } else if (command.includes("reset") || command.includes("start over") || command.includes("first day")) {
            reset();
            clearCompanyHighlight(false);
            action = "Reset the visualization to Day 1.";
        } else if (command.includes("pause") || command.includes("stop animation")) {
            pause();
            action = `Paused on Day ${currentDay}.`;
        } else if (command === "play" || command.includes("start animation") || command.includes("play animation")) {
            const wasLastDay = currentDay === 60;
            clearCompanyHighlight(false);
            play();
            action = wasLastDay ? "Restarted playback from Day 1." : `Playing from Day ${currentDay}.`;
        } else {
            setVoiceFeedback({action: "Command not recognized. Try Play, Pause, Next day, Previous day, Go to day 30, Reset, or Highlight plus a company name.", tone: "error"});
            return false;
        }
    }

    setVoiceFeedback({action, tone: "success"});
    return true;
}

function describeRecognitionError(errorCode) {
    const messages = {
        "not-allowed": "Microphone permission was denied. Use the conventional controls or allow microphone access and try again.",
        "service-not-allowed": "Speech recognition is blocked by this browser or device. Conventional controls remain available.",
        "audio-capture": "No working microphone was found. Conventional controls remain available.",
        "no-speech": "No speech was detected. Select Start Voice Control and try again.",
        network: "The browser speech-recognition service could not be reached. Conventional controls remain available.",
        aborted: "Listening was cancelled."
    };
    return messages[errorCode] || `Speech recognition failed (${errorCode}). Conventional controls remain available.`;
}

function configureRecognition() {
    if (!SpeechRecognition) {
        voiceSupport.textContent = "Speech recognition is unavailable in this browser. The visualization and all fallback controls still work.";
        voiceSupport.classList.add("unsupported");
        startVoiceButton.disabled = true;
        stopVoiceButton.disabled = true;
        setVoiceFeedback({state: "Unsupported", action: "Use Play, Pause, Reset, the slider, mouse, or keyboard controls.", tone: "error"});
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    voiceSupport.textContent = "Voice recognition is available. It activates only when you select Start Voice Control.";

    recognition.onstart = () => {
        cancelledByUser = false;
        setRecognitionButtons(true);
        setVoiceFeedback({state: "Listening…", transcript: "Waiting for speech", action: "Speak one supported command.", tone: "listening"});
    };

    recognition.onresult = event => {
        const result = event.results[0][0];
        const transcript = result.transcript.trim();
        const confidence = Number.isFinite(result.confidence) && result.confidence > 0 ? ` (${Math.round(result.confidence * 100)}% confidence)` : "";
        setVoiceFeedback({state: "Recognized", transcript: `“${transcript}”${confidence}`, action: "Interpreting command…", tone: "success"});
        handleVoiceCommand(transcript);
    };

    recognition.onerror = event => {
        const message = cancelledByUser && event.error === "aborted" ? "Listening was cancelled." : describeRecognitionError(event.error);
        setVoiceFeedback({state: "Recognition ended", action: message, tone: event.error === "aborted" ? "neutral" : "error"});
    };

    recognition.onend = () => {
        setRecognitionButtons(false);
        if (voiceState.textContent === "Listening…") {
            setVoiceFeedback({state: "Inactive", action: cancelledByUser ? "Listening was cancelled." : "Listening ended without a recognized command.", tone: "neutral"});
        }
    };
}

startVoiceButton.addEventListener("click", () => {
    if (!recognition || recognitionActive || !networkReady) return;
    try {
        cancelledByUser = false;
        recognition.start();
    } catch (error) {
        setRecognitionButtons(false);
        setVoiceFeedback({state: "Unable to start", action: "Speech recognition could not start. Wait a moment or use the conventional controls.", tone: "error"});
    }
});

stopVoiceButton.addEventListener("click", () => {
    if (!recognition || !recognitionActive) return;
    cancelledByUser = true;
    recognition.abort();
});

clearVoiceHighlightButton.addEventListener("click", () => clearCompanyHighlight(true));

const networkReadyObserver = new MutationObserver(() => {
    networkReady = document.getElementById("network-status").classList.contains("ready");
    setRecognitionButtons(recognitionActive);
    if (networkReady) networkReadyObserver.disconnect();
});
networkReadyObserver.observe(document.getElementById("network-status"), {attributes: true, childList: true, subtree: true});

window.addEventListener("pagehide", () => {
    if (recognitionActive && recognition) recognition.abort();
});

configureRecognition();
