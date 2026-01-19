// js/modules/spotify.js
import { state } from './state.js';

export function handleSpotifyToken() {
    if (window.location.hash) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken) {
            console.log("✅ Token Spotify zapisany.");
            localStorage.setItem('spotify_access_token', accessToken);
            // Zapisujemy refresh token na zawsze (dopóki użytkownik nie wyczyści danych)
            if (refreshToken) localStorage.setItem('spotify_refresh_token', refreshToken);

            window.history.replaceState(null, null, 'vapage.html');
            state.activeSource = 'spotify';
        }
    }
}

// Funkcja do zdobywania nowego tokena
async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) {
        console.warn("Brak refresh tokena. Użytkownik musi zalogować się ponownie.");
        return null;
    }

    try {
        console.log("🔄 Odświeżam token Spotify...");
        const res = await fetch(`/api/spotify/refresh_token?refresh_token=${refreshToken}`);
        if (!res.ok) throw new Error("Błąd odświeżania");

        const data = await res.json();
        if (data.access_token) {
            console.log("✅ Token odświeżony!");
            localStorage.setItem('spotify_access_token', data.access_token);
            return data.access_token;
        }
    } catch (e) {
        console.error("Nie udało się odświeżyć tokena:", e);
        // Opcjonalnie: Wyloguj użytkownika lub pokaż przycisk "Zaloguj ponownie"
    }
    return null;
}

export async function fetchSpotifyStatus() {
    let token = localStorage.getItem('spotify_access_token');
    if (!token) return null;

    try {
        let res = await fetch(`/api/spotify/status?access_token=${token}`);

        // JEŚLI TOKEN WYGASŁ (Status 401) -> ODŚWIEŻ I SPRÓBUJ PONOWNIE
        if (res.status === 401) {
            const newToken = await refreshAccessToken();
            if (newToken) {
                // Próbujemy jeszcze raz z nowym tokenem
                res = await fetch(`/api/spotify/status?access_token=${newToken}`);
            } else {
                return null; // Nie udało się odświeżyć
            }
        }

        const data = await res.json();

        if (data.isPlaying) {
            return {
                title: data.title,
                artist: data.artist,
                status: 'Playing',
                cover: data.cover,
                source: 'Spotify'
            };
        }
    } catch (e) {
        // Ignorujemy błędy sieci, żeby nie spamować konsoli
    }
    return null;
}