// Dane do rozmowy
const hello = ["Hi Bro! what's up?", "Hi, how are you doing?", "What's up?", "Ahoy matey!", "How's going?"];
const joke = [
    "How many programmers does it take to change a light bulb? None, it's a hardware problem...",
    "Why do mummies have trouble keeping friends? Because they're so wrapped up in themselves.",
    "Why don't scientists trust atoms? Because they make up everything."
];

let voices = [];
const voiceBtn = document.getElementById("voiceBtn");
const voiceOverlay = document.getElementById("voice-overlay");
const voiceStatus = document.getElementById("voice-status");

// Ładowanie głosów
window.speechSynthesis.onvoiceschanged = () => {
    voices = window.speechSynthesis.getVoices();
};

// Funkcja sterująca popupem
function toggleVoicePopup(forceClose = false) {
    if (!voiceOverlay) {
        console.error("Brak elementu overlay!");
        return;
    }

    if (forceClose) {
        voiceOverlay.classList.add("hidden");
        // Opcjonalnie resetujemy tekst po zamknięciu
        setTimeout(() => { if (voiceStatus) voiceStatus.innerText = "Słucham..."; }, 300);
    } else {
        voiceOverlay.classList.remove("hidden");
        if (voiceStatus) voiceStatus.innerText = "Słucham...";
    }
}

// Speech to Text
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (typeof SpeechRecognition === "undefined") {
    if (voiceBtn) voiceBtn.remove();
    console.error("Twoja przeglądarka nie obsługuje Speech API.");
} else {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    // Gdy mikrofon faktycznie ruszy
    recognition.onstart = () => {
        console.log("Mikrofon uruchomiony");
        toggleVoicePopup(false); // Pokaż popup
    };

    // Gdy mikrofon skończy słuchać
    recognition.onend = () => {
        console.log("Mikrofon wyłączony");
        // Nie zamykamy od razu, żeby użytkownik zobaczył wynik (zamykamy ręcznie lub po procesowaniu)
        // toggleVoicePopup(true); 
    };

    // OBSŁUGA BŁĘDÓW (Ważne!)
    recognition.onerror = (event) => {
        console.error("Błąd mikrofonu:", event.error);
        if (voiceStatus) voiceStatus.innerText = "Błąd: " + event.error;
        // Zamknij po chwili jeśli błąd
        setTimeout(() => toggleVoicePopup(true), 3000);
    };

    recognition.onresult = event => {
        const current = event.resultIndex;
        const recognitionResult = event.results[current];
        const recognitionText = recognitionResult[0].transcript;

        if (recognitionResult.isFinal) {
            console.log("Usłyszano:", recognitionText);

            if (voiceStatus) voiceStatus.innerText = "Mam!";

            // Przetwórz komendę
            const response = process(recognitionText);

            // Zamknij popup po chwili i powiedz odpowiedź
            setTimeout(() => {
                toggleVoicePopup(true);
                readOutLoud(response);
            }, 1000);
        }
    };

    // Obsługa kliknięcia przycisku
    if (voiceBtn) {
        voiceBtn.addEventListener("click", () => {
            try {
                recognition.start();
            } catch (e) {
                console.log("Mikrofon już działa, restartuję...");
                recognition.stop();
            }
        });
    }
}

// Logika Asystenta
function process(rawText) {
    let text = rawText.replace(/\s/g, "").replace(/\'/g, "").toLowerCase();
    let response = "I didn't catch that.";

    if (text.includes("hello") || text.includes("hi") || text.includes("hey")) {
        response = getRandomItem(hello);
    } else if (text.includes("yourname")) {
        response = "My name's AL.";
    } else if (text.includes("time")) {
        response = new Date().toLocaleTimeString();
    } else if (text.includes("joke")) {
        response = getRandomItem(joke);
    } else if (text.includes("play") && text.includes("despacito")) {
        response = "Playing Despacito...";
        window.open("https://www.youtube.com/watch?v=kJQP7kiw5Fk", "_blank");
    } else if (text.includes("open") && text.includes("spotify")) {
        response = "Opening Spotify...";
        if (typeof openSpotifyPopup === 'function') openSpotifyPopup();
    } else if (text.includes("stop") || text.includes("bye")) {
        response = "Bye!";
    } else if (text.includes("play")) {
        controlSystemMedia('playpause'); // Wywołuje nową funkcję sterującą
        return "Playing music...";
    } else if (text.includes("pause")) {
        controlSystemMedia('playpause');
        return "Pausing...";
    } else if (text.includes("next")) {
        controlSystemMedia('next');
        return "Next track...";
    } else if (text.includes("radio")) {
        response = "Turning on the radio...";
        openRadioPopup();
        // Optional: Auto-search for "Hits"
        document.getElementById('radio-search-input').value = "Hits";
        searchRadio();
    }

    if (response === "I didn't catch that.") {
        window.open(`http://google.com/search?q=${rawText}`, "_blank");
        return `Searching Google for ${rawText}`;
    }

    return response;
}

function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function readOutLoud(message) {
    const speech = new SpeechSynthesisUtterance();
    speech.text = message;
    speech.volume = 1;
    speech.rate = 1;
    speech.pitch = 1;
    if (voices.length > 0) speech.voice = voices[0];
    window.speechSynthesis.speak(speech);
}
// --- SYSTEM MEDIA INTEGRATION (Obsługa Spotify, Bluetooth i Windows Media) ---

// 1. START - Uruchomienie po załadowaniu
window.addEventListener('load', () => {
    // Ukryj stary przycisk logowania (zbędny)
    const loginLink = document.querySelector('#login-view a');
    if (loginLink) loginLink.style.display = 'none';

    // Pętla sprawdzania co 3 sekundy
    setInterval(checkSystemMedia, 3000);
    checkSystemMedia();

    // Podpięcie sterowania (przyciski ekranowe sterują teraz systemem Windows/Telefonem)
    const playBtn = document.getElementById('play-btn');
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');

    if (playBtn) playBtn.onclick = () => controlSystemMedia('playpause');
    if (nextBtn) nextBtn.onclick = () => controlSystemMedia('next');
    if (prevBtn) prevBtn.onclick = () => controlSystemMedia('prev');
});

// 2. GŁÓWNA FUNKCJA SPRAWDZAJĄCA
async function checkSystemMedia() {
    try {
        const res = await fetch('/api/media/now-playing');
        if (!res.ok) return;

        const data = await res.json();
        // Oczekujemy: { title, artist, status }

        // --- WAŻNE: LOGIKA PRIORYTETÓW ---
        // Zmienne 'activeSource' i 'isRadioPlaying' pochodzą z dashboard.js (są globalne).
        // Jeśli użytkownik włączył Radio Internetowe w naszej apce, nie chcemy, 
        // żeby Spotify w tle nadpisywało pasek "Mini Player".
        if (typeof activeSource !== 'undefined' && activeSource === 'radio' && isRadioPlaying) {
            // Radio gra -> ignorujemy aktualizację Mini Playera z systemu.
            // Ale możemy zaktualizować duży widget (jeśli jest otwarty), żeby widzieć co gra w tle.
            updateMainPlayerOnly(data);
            return;
        }

        // Jeśli nic nie gra w systemie (puste dane)
        if (!data.title && !data.artist) {
            hidePlayer();
        } else {
            // Gra system (Spotify lub Bluetooth) -> Pokazujemy
            showPlayer(data);
        }
    } catch (e) {
        console.error("Błąd checkSystemMedia:", e);
        hidePlayer();
    }
}

// 3. POKAZYWANIE PLAYERA (ZIMNE KOLORY DLA BT, ZIELONE DLA SPOTIFY)
function showPlayer(data) {
    const playerView = document.getElementById('player-view');
    const loginView = document.getElementById('login-view');

    if (playerView) playerView.style.display = 'flex';
    if (loginView) loginView.style.display = 'none';

    // Ustawienie tekstów w dużym widgecie
    setText('current-track', data.title || "Nieznany utwór");
    setText('current-artist', data.artist || "Nieznany artysta");

    // Przycisk Play/Pause
    const playBtn = document.getElementById('play-btn');
    if (playBtn) playBtn.innerText = (data.status === 'Playing') ? '⏸' : '▶️';

    // --- DETEKCJA ŹRÓDŁA (Ikona i Kolor) ---
    // Server.ts zwraca "Audio Bluetooth" dla Line-in, a normalne tytuły dla Spotify.
    const isBluetooth = (data.title === "Audio Bluetooth");
    const artEl = document.getElementById('current-art');

    if (artEl) {
        // Podmień ikonę: Spotify (zielona nuta/logo) vs Bluetooth (sygnał/radio)
        artEl.src = isBluetooth ? "style-css/icon.svg" : "style-css/spotify.png";
    }

    // Aktualizacja Mini Playera (pod zegarem)
    if (typeof updateMiniPlayer === 'function') {
        // Typ 'spotify' daje zielony pasek, typ 'radio' daje niebieski.
        // Dla Bluetooth używamy 'radio' (bo to zewnętrzne źródło), dla Spotify 'spotify'.
        let type = isBluetooth ? 'radio' : 'spotify';
        updateMiniPlayer(data.title, data.artist, type);
    }
}

// Funkcja pomocnicza: Aktualizuje tylko duży widget (nie dotyka paska pod zegarem)
function updateMainPlayerOnly(data) {
    setText('current-track', data.title || "");
    setText('current-artist', data.artist || "");
    const artEl = document.getElementById('current-art');
    const isBluetooth = (data.title === "Audio Bluetooth");
    if (artEl) artEl.src = isBluetooth ? "style-css/icon.svg" : "style-css/spotify.png";
}

// 4. UKRYWANIE
function hidePlayer() {
    const playerView = document.getElementById('player-view');
    const loginView = document.getElementById('login-view');

    if (playerView) playerView.style.display = 'none';
    if (loginView) {
        loginView.style.display = 'block';
        const p = loginView.querySelector('p');
        if (p) p.innerText = "System gotowy. Włącz muzykę 🎵";
    }

    // Ukryj Mini Player (tylko jeśli nie gra Radio!)
    if (typeof activeSource !== 'undefined' && activeSource !== 'radio') {
        if (typeof updateMiniPlayer === 'function') {
            updateMiniPlayer("", "", "none");
        }
    }
}

// 5. WYSYŁANIE KOMEND
async function controlSystemMedia(action) {
    try {
        await fetch('/api/media/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action })
        });
        setTimeout(checkSystemMedia, 500);
    } catch (e) { console.error(e); }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}