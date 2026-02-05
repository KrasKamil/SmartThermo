// public/js/modules/voice.js
import { controlSystemMedia } from './systemPlayer.js';

let recognition = null;
let synthesis = window.speechSynthesis;

// --- KONFIGURACJA UI ---
function updateVoiceUI(state, message = "") {
    const overlay = document.getElementById("voice-overlay");
    const circle = document.getElementById("voice-circle");
    const status = document.getElementById("voice-status");
    const aiText = document.getElementById("ai-text");
    const userText = document.getElementById("user-text");

    if (!overlay) return;

    // Otwieranie/Zamykanie
    if (state === 'HIDDEN') {
        overlay.classList.add("hidden");
        // Reset po zamknięciu
        if (synthesis) synthesis.cancel(); // Przestań mówić
        return;
    }

    overlay.classList.remove("hidden");

    // Reset klas animacji
    circle.className = 'circle-state';

    switch (state) {
        case 'LISTENING':
            circle.classList.add('listening');
            status.innerText = "Słucham...";
            userText.innerText = "";
            aiText.innerText = "";
            break;

        case 'PROCESSING':
            circle.classList.add('processing');
            status.innerText = "Przetwarzam...";
            break;

        case 'SPEAKING':
            circle.classList.add('speaking');
            status.innerText = "Odpowiedź:";
            break;
    }

    // Aktualizacja tekstów
    if (state === 'PROCESSING' && message) userText.innerText = `"${message}"`;
    if (state === 'SPEAKING' && message) aiText.innerText = message;
}

// --- SYNTEZA MOWY (TTS) ---
function speak(text) {
    if (!synthesis) return;

    // Anuluj poprzednie gadanie
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // 🔥 ULEPSZENIE GŁOSU 🔥
    const voices = synthesis.getVoices();

    // 1. Szukamy głosu "Google" (jest najlepszy w Chrome)
    let selectedVoice = voices.find(v => v.name.includes("Google") && v.lang.includes("pl"));

    // 2. Jak nie ma Google, bierzemy jakikolwiek polski
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.includes("pl"));
    }

    if (selectedVoice) {
        utterance.voice = selectedVoice;
        // Lekka korekta, żeby brzmiał dynamiczniej
        utterance.pitch = 0.9; // Nieco niższy ton (bardziej męski/jarvisowy)
        utterance.rate = 1.1; // Nieco szybciej
    }

    // Kiedy zacznie mówić -> zmień UI
    utterance.onstart = () => updateVoiceUI('SPEAKING', text);

    // Kiedy skończy -> zamknij po 2 sekundach (szybciej niż wcześniej)
    utterance.onend = () => {
        setTimeout(() => toggleVoicePopup(true), 2000);
    };

    synthesis.speak(utterance);
}

// --- KOMUNIKACJA Z BACKENDEM (LLM) ---
async function askAI(transcript) {
    updateVoiceUI('PROCESSING', transcript);

    try {
        const response = await fetch('/api/voice/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: transcript })
        });

        const data = await response.json();

        // 1. OBSŁUGA AKCJI (Backend już swoje zrobił, teraz kolej na Frontend)
        if (data.command) {
            console.log("⚡ Komenda od AI:", data.command);

            // Obsługa komend wizualnych (tylko frontend)
            if (data.command === 'THEME_TOGGLE') {
                toggleTheme();
            }

            // Jeśli to było włączenie radia, odświeżmy UI po chwili
            if (data.command === 'RADIO_ON' || data.command === 'MEDIA_NEXT') {
                setTimeout(() => {
                    if (window.fetchCurrentMedia) window.fetchCurrentMedia();
                }, 1000);
            }
        }

        // 2. Przeczytaj odpowiedź
        speak(data.text);

    } catch (error) {
        console.error("Błąd Voice AI:", error);
        speak("Błąd systemu.");
    }
}

// --- GŁÓWNA FUNKCJA INICJUJĄCA ---
export function initVoiceAssistant() {
    // Sprawdzamy wsparcie przeglądarki
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.error("Brak wsparcia dla Speech Recognition API");
        const btn = document.getElementById("voiceBtn");
        if (btn) btn.style.display = 'none';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL'; // Ustawiamy na polski!
    recognition.continuous = false;
    recognition.interimResults = false;

    // Zdarzenia rozpoznawania
    recognition.onstart = () => {
        console.log("🎤 Rozpoczęto nasłuchiwanie...");
        updateVoiceUI('LISTENING');
    };

    recognition.onend = () => {
        // Jeśli skończył słuchać, ale nie rozpoznał (nie wywołał onresult), to można zamknąć
        // Ale onresult wywoła się pierwszy, więc tu nic nie robimy
    };

    recognition.onerror = (event) => {
        console.error("Błąd mikrofonu:", event.error);
        updateVoiceUI('HIDDEN');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("🗣️ Usłyszano:", transcript);
        // Wyślij do AI
        askAI(transcript);
    };

    // Obsługa przycisku mikrofonu w UI (np. w stopce)
    /* UWAGA: W HTML masz <button onclick="startVoiceRecognition()">
       Musimy podpiąć tę funkcję do window, żeby HTML ją widział.
    */
    window.startVoiceRecognition = () => {
        try {
            recognition.start();
        } catch (e) {
            console.log("Restart mikrofonu...");
            recognition.stop();
        }
    };

    // Funkcja zamykania (X)
    window.toggleVoicePopup = (forceClose) => {
        if (forceClose) {
            updateVoiceUI('HIDDEN');
            recognition.stop();
        }
    };
}