// --- MODULE: Voice Assistant ---
import { controlSystemMedia } from './systemPlayer.js';
import { openPopup } from './ui.js';

// --- DATA (Conversational phrases) ---
const hello = ["Hi Bro! what's up?", "Hi, how are you doing?", "What's up?", "Ahoy matey!", "How's going?"];
const joke = [
    "How many programmers does it take to change a light bulb? None, it's a hardware problem...",
    "Why do mummies have trouble keeping friends? Because they're so wrapped up in themselves.",
    "Why don't scientists trust atoms? Because they make up everything."
];

let voices = [];
let recognition = null;

// --- SPEECH SYNTHESIS (Loading voices) ---
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
    };
}

// --- UI HELPER FUNCTIONS ---
function toggleVoicePopup(forceClose = false) {
    const overlay = document.getElementById("voice-overlay");
    const status = document.getElementById("voice-status");

    if (!overlay) return;

    if (forceClose) {
        overlay.classList.add("hidden");
        // Reset text after closing
        setTimeout(() => { if (status) status.innerText = "Listening..."; }, 300);
    } else {
        overlay.classList.remove("hidden");
        if (status) status.innerText = "Listening...";
    }
}

function readOutLoud(message) {
    const speech = new SpeechSynthesisUtterance();
    speech.text = message;
    speech.volume = 1;
    speech.rate = 1;
    speech.pitch = 1;
    // Select first available voice
    if (voices.length > 0) speech.voice = voices[0];
    window.speechSynthesis.speak(speech);
}

function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// --- COMMAND PROCESSING LOGIC ---
function processCommand(rawText) {
    let text = rawText.replace(/\s/g, "").replace(/\'/g, "").toLowerCase();
    let response = "I didn't catch that.";

    if (text.includes("hello") || text.includes("hi") || text.includes("hey")) {
        response = getRandomItem(hello);
    } else if (text.includes("yourname")) {
        response = "My name's AL.";
    } else if (text.includes("time")) {
        response = "It is " + new Date().toLocaleTimeString();
    } else if (text.includes("joke")) {
        response = getRandomItem(joke);
    } else if (text.includes("play") && text.includes("despacito")) {
        response = "Playing Despacito...";
        window.open("https://www.youtube.com/watch?v=kJQP7kiw5Fk", "_blank");
    } else if (text.includes("open") && text.includes("spotify")) {
        response = "Opening Spotify...";
        openPopup('spotify-overlay');
    } else if (text.includes("stop") || text.includes("bye")) {
        response = "Bye!";
    } else if (text.includes("play")) {
        controlSystemMedia('playpause');
        return "Playing music...";
    } else if (text.includes("pause")) {
        controlSystemMedia('playpause');
        return "Pausing...";
    } else if (text.includes("next")) {
        controlSystemMedia('next');
        return "Next track...";
    } else if (text.includes("radio")) {
        response = "Turning on the radio...";
        openPopup('radio-overlay');
        // Logic for auto-playing radio can be added here in the future
    }

    // Fallback to Google
    if (response === "I didn't catch that.") {
        window.open(`http://google.com/search?q=${rawText}`, "_blank");
        return `Searching Google for ${rawText}`;
    }

    return response;
}

// --- ASSISTANT INITIALIZATION ---
export function initVoiceAssistant() {
    const voiceBtn = document.getElementById("voiceBtn");
    const voiceStatus = document.getElementById("voice-status");

    // Handle closing overlay via X button
    const closeBtns = document.querySelectorAll('#voice-overlay .close-btn');
    closeBtns.forEach(btn => btn.onclick = () => toggleVoicePopup(true));

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (typeof SpeechRecognition === "undefined") {
        if (voiceBtn) voiceBtn.style.display = 'none';
        console.error("No support for Speech API");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    // Recognition Events
    recognition.onstart = () => {
        console.log("🎤 Microphone on");
        toggleVoicePopup(false);
    };

    recognition.onerror = (event) => {
        console.error("Microphone error:", event.error);
        if (voiceStatus) voiceStatus.innerText = "Error: " + event.error;
        setTimeout(() => toggleVoicePopup(true), 3000);
    };

    recognition.onresult = (event) => {
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript;

        if (voiceStatus) voiceStatus.innerText = "Got it!";
        console.log("🗣️ Heard:", transcript);

        const response = processCommand(transcript);

        setTimeout(() => {
            toggleVoicePopup(true);
            readOutLoud(response);
        }, 1000);
    };

    // Microphone button handler
    if (voiceBtn) {
        voiceBtn.onclick = () => {
            try {
                recognition.start();
            } catch (e) {
                console.log("Restarting microphone...");
                recognition.stop();
            }
        };
    }
}