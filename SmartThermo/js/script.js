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
        response = "Searching on YouTube...";
        window.open(`https://www.youtube.com/results?search_query=${rawText.replace("play", "")}`, "_blank");
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
// --- SPOTIFY INTEGRATION (Best Practices) ---

const SPOTIFY_CONFIG = {
    apiBase: 'https://api.spotify.com/v1/me/player',
    backendUrl: window.location.origin // Dynamicznie bierze localhost:8888
};

let accessToken = null;
let refreshToken = null;

// Funkcja startowa
window.addEventListener('load', () => {
    // 1. Sprawdź czy wracamy z autoryzacji (hash w URL)
    const params = new URLSearchParams(window.location.hash.substring(1));
    const tokenParams = params.get('access_token');
    const refreshParams = params.get('refresh_token');

    if (tokenParams) {
        // Zapisz tokeny w pamięci (lub localStorage jeśli wolisz trwałość między odświeżeniami)
        accessToken = tokenParams;
        refreshToken = refreshParams;

        // Wyczyść URL dla estetyki
        window.history.pushState({}, document.title, window.location.pathname);

        // Pokaż player
        activatePlayerUI();
    }
});

function activatePlayerUI() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('player-view').style.display = 'flex';

    // Pobierz stan odtwarzania od razu
    getCurrentPlaybackState();

    // Odświeżaj co 5 sekund
    setInterval(getCurrentPlaybackState, 5000);

    // Obsługa przycisków
    document.getElementById('play-btn').onclick = () => togglePlayback();
    document.getElementById('next-btn').onclick = () => controlSpotify('next');
    document.getElementById('prev-btn').onclick = () => controlSpotify('previous');
}

// Pobieranie stanu (co leci?)
async function getCurrentPlaybackState() {
    if (!accessToken) return;

    try {
        const res = await fetch(SPOTIFY_CONFIG.apiBase, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (res.status === 204) {
            console.log("Spotify nieaktywne (otwórz aplikację na urządzeniu)");
            return;
        }

        if (res.status === 401) {
            await refreshAccessToken(); // Token wygasł, odśwież go
            return;
        }

        const data = await res.json();
        updateWidgetUI(data);

    } catch (e) {
        console.error("Błąd playera:", e);
    }
}

// Aktualizacja wyglądu
function updateWidgetUI(data) {
    if (!data || !data.item) return;

    const track = data.item;
    document.getElementById('current-track').innerText = track.name;
    document.getElementById('current-artist').innerText = track.artists.map(a => a.name).join(', ');
    document.getElementById('current-art').src = track.album.images[0].url;

    const playBtn = document.getElementById('play-btn');
    playBtn.innerText = data.is_playing ? '⏸' : '▶️';
}

// Sterowanie (Play, Pause, Next, Prev)
async function controlSpotify(command) {
    if (!accessToken) return;
    try {
        await fetch(`${SPOTIFY_CONFIG.apiBase}/${command}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        setTimeout(getCurrentPlaybackState, 500); // Szybkie odświeżenie UI
    } catch (e) { console.error(e); }
}

async function togglePlayback() {
    // Sprawdź czy gra, żeby wiedzieć czy wysłać play czy pause
    // (Uproszczona logika - lepiej pobrać stan, ale API endpointy są różne: /play i /pause)
    const btn = document.getElementById('play-btn');
    const isPlaying = btn.innerText === '⏸';
    const endpoint = isPlaying ? 'pause' : 'play';

    try {
        await fetch(`${SPOTIFY_CONFIG.apiBase}/${endpoint}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        setTimeout(getCurrentPlaybackState, 500);
    } catch (e) { console.error(e); }
}

// Odświeżanie tokenu przez Backend
async function refreshAccessToken() {
    if (!refreshToken) return;

    try {
        const res = await fetch(`/refresh_token?refresh_token=${refreshToken}`);
        const data = await res.json();
        if (data.access_token) {
            accessToken = data.access_token;
            console.log("Token odświeżony!");
            getCurrentPlaybackState(); // Ponów próbę
        }
    } catch (e) {
        console.error("Nie udało się odświeżyć tokenu", e);
    }
}