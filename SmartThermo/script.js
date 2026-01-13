const hello = ["Hi Bro! what\'s up?",
        "hi, how are you doing?",
        "What\'s up?",
        "Ahoy matey! How are ye?",
        "What\'s shaking?",
        "How 's going?"
    ],

    joke = ["How many programmers does it take to change a light bulb? None, it\'s a hardware problem...",
        "Why do mummies have trouble keeping friends? Because they\'re so wrapped up in themselves.",
        "What did one ocean say to the other ocean? Nothing, they just waved.",
        "Two goldfish are in a tank. One turns to the other and says, Do you know how to drive this thing?",
        "Why did the pirate buy an eye patch?  Because he couldn\'t afford an iPad!",
        "What did the pirate say on his 80th birthday? Aye Matey!",
        "Why don\'t scientists trust atoms? Because they make up everything."
    ];

// Store voices
let voices = [];
// UI elements
const voiceBtn = document.getElementById("voiceBtn");
const result = document.getElementById("result");
const processing = document.getElementById("processing");

// Wait on voices to be loaded before fetching list
window.speechSynthesis.onvoiceschanged = () => {
    voices = window.speechSynthesis.getVoices();
};

// Speech to Text
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let toggleBtn = null;
if (typeof SpeechRecognition === "undefined") {
    voiceBtn.remove();
    result.innerHTML = "<strong>Your browser does not support Speech API. Please download latest Chrome version.<strong>";
} else {
    const recognition = new SpeechRecognition();
    recognition.continuous = true; // If true, the silence period is longer
    recognition.interimResults = true;
    recognition.onresult = event => {
        const current = event.resultIndex;
        const recognitionResult = event.results[current];
        const recognitionText = recognitionResult[0].transcript;

        if (recognitionResult.isFinal) {
            processing.innerHTML = "processing ...";

            const response = process(recognitionText);
            const p = document.createElement("p");
            p.innerHTML = `<strong>You said:</strong> ${recognitionText} </br><strong>VA said:</strong> ${response}`;
            processing.innerHTML = "";
            result.appendChild(p);

            readOutLoud(response);
        } else {
            processing.innerHTML = `listening: ${recognitionText}`;
        }
    };
    let listening = false;
    toggleBtn = () => {
        if (listening) {
            recognition.stop();
            voiceBtn.textContent = "Start listening";
        } else {
            recognition.start();
            voiceBtn.textContent = "Stop listening";
        }
        listening = !listening;
    };
    voiceBtn.addEventListener("click", toggleBtn);
}

// Processor
function process(rawText) {
    let text = rawText.replace(/\s/g, "").replace(/\'/g, "");
    text = text.toLowerCase();
    let response = null;

    if (text.includes("hello") || text.trim() == "hi" || text.includes("hey")) {
        response = getRandomItemFromArray(hello);
    } else if (text.includes("yourname")) {
        response = "My name's AL.";
    } else if (text.includes("howareyou") || text.includes("whatsup")) {
        response = "I'm fine. How about you?";
    } else if (text.includes("whattimeisit")) {
        response = new Date().toLocaleTimeString();
    } else if (text.includes("joke")) {
        response = getRandomItemFromArray(joke);
    } else if (text.includes("play") && text.includes("despacito")) {
        response = "Opened";
        window.open("https://www.youtube.com/watch?v=kJQP7kiw5Fk", "_blank", "noopener");
    } else if (text.includes("open") && text.includes("spotify")) {
        response = "Open spotify ";
        window.open("https://open.spotify.com/", "_blank", "noopener");
        toggleBtn();
    } else if (text.includes("flip") && text.includes("coin")) {
        response = Math.random() < 0.5 ? "heads" : "tails";
    } else if (text.includes("bye") || text.includes("stop")) {
        response = "Bye!!";
        toggleBtn();
    } else if (text.includes("play")) {
        response = "Looking for results on YouTube";
        window.open(`https://www.youtube.com/results?search_query=${rawText.replace("search", "")}`, "_blank", "noopener")
        toggleBtn();
    }
    if (!response) {
        window.open(`http://google.com/search?q=${rawText.replace("search", "")}`, "_blank", "noopener");
        toggleBtn();
        return `I found some information about ${rawText}`;
    }

    return response;
}

function getRandomItemFromArray(array) {
    const randomItem = array[Math.floor(Math.random() * array.length)];
    return randomItem;
};

// Set the text and voice attributes.
function readOutLoud(message) {
    const speech = new SpeechSynthesisUtterance();

    speech.text = message;
    speech.volume = 1;
    speech.rate = 1;
    speech.pitch = 1.56;
    speech.voice = voices[47];

    window.speechSynthesis.speak(speech);
}// --- SPOTIFY INTEGRATION (Best Practices) ---

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
    } catch(e) { console.error(e); }
}

// Odświeżanie tokenu przez Backend
async function refreshAccessToken() {
    if(!refreshToken) return;
    
    try {
        const res = await fetch(`/refresh_token?refresh_token=${refreshToken}`);
        const data = await res.json();
        if(data.access_token) {
            accessToken = data.access_token;
            console.log("Token odświeżony!");
            getCurrentPlaybackState(); // Ponów próbę
        }
    } catch(e) {
        console.error("Nie udało się odświeżyć tokenu", e);
    }
}