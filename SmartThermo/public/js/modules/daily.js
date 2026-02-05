import { state } from './state.js';

export async function initDaily() {
    const container = document.getElementById('daily-widget-content');
    if (!container) return;

    try {
        const res = await fetch('/api/daily');
        const data = await res.json();
        const imieniny = data.imieniny.replace(/,/g, ', ');
        const newsList = data.news || [];

        // Generowanie listy newsów
        const newsHTML = newsList.map((item, index) => `
            <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="toggleNewsItem(${index})">
                    <span style="font-size: 0.9em; font-weight: bold;">📰 ${item.title}</span>
                    <span id="news-icon-${index}" style="font-size: 0.8em; transition: 0.3s;">▼</span>
                </div>
                <div id="news-snippet-${index}" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out; opacity: 0; font-size: 0.85em; color: #ccc; margin-top: 0px;">
                    <p style="margin: 5px 0;">${item.snippet}</p>
                    <a href="${item.link}" target="_blank" style="color: #00d2ff; text-decoration: none; font-size: 0.8em;">Czytaj więcej &rarr;</a>
                </div>
            </div>
        `).join('');

        // Wstawiamy HTML do kontenera
        container.innerHTML = `
            <div style="border-left: 4px solid #00d2ff; padding-left: 15px; text-align: left;">
                <h2 class="daily-title" style="margin: 0; font-size: 1.4em;">Dzień dobry! 👋</h2>
                
                <div style="margin-top: 10px;">
                    <span class="daily-subtitle" style="font-size: 0.8em; text-transform: uppercase; color: #88aadd;">Imieniny:</span>
                    <div class="daily-names" style="font-weight: bold; font-size: 1.1em; margin-bottom: 12px;">${imieniny}</div>
                </div>
                <div class="widget-box daily-joke-box" style="padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.05); margin-top: 10px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="margin: 0 0 5px 0; font-size: 0.9em; text-transform: uppercase; color: #aaa; letter-spacing: 1px;">🤡 Suchar na dziś</h3>
                    <p id="daily-joke-text" style="font-size: 1em; font-style: italic; color: #fff; white-space: pre-wrap; margin: 10px 0;">Ładowanie humoru...</p>
                    <button class="btn-text" onclick="loadDailyJoke()" style="background: none; border: none; color: #00d2ff; cursor: pointer; font-size: 0.85em; opacity: 0.8;">🔄 Inny</button>
                </div>

                

                <div class="news-box" style="padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03); margin-bottom: 10px;">
                    <div style="margin-bottom: 5px; font-size: 0.9em; color: #aaa; text-transform: uppercase;">🌍 Newsy ze świata</div>
                    ${newsHTML}
                </div>

                <div class="history-box" style="padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03); margin-bottom: 10px;">
                    <div onclick="toggleHistory()" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                        <span style="font-size: 0.9em; color: #aaa;">📜 TEGO DNIA (${data.event.year})</span>
                        <span id="history-icon" style="transition: transform 0.3s;">▼</span>
                    </div>
                    <div id="history-content" style="max-height: 0; overflow: hidden; transition: max-height 0.5s ease-out; opacity: 0; margin-top: 0;">
                        <p style="margin: 5px 0 0 0; font-style: italic; font-size: 0.95em;">${data.event.text}</p>
                    </div>
                </div>

                

            </div>
        `;

        // Po wygenerowaniu HTML, pobieramy pierwszy żart
        loadDailyJoke();

    } catch (e) {
        container.innerHTML = `<p>Błąd ładowania widgetu.</p>`;
        console.error(e);
    }
}

// --- FUNKCJA OBSŁUGUJĄCA ŻARTY ---
export async function loadDailyJoke() {
    const jokeEl = document.getElementById('daily-joke-text');
    if (!jokeEl) return;

    // Efekt ładowania
    jokeEl.style.opacity = '0.5';

    try {
        // Fetch automatycznie doda Twój API Key dzięki kodowi w main.js
        const res = await fetch('/api/daily/joke');
        const data = await res.json();

        jokeEl.innerText = data.joke;
        jokeEl.style.opacity = '1';
    } catch (e) {
        console.error("Błąd żartu:", e);
        jokeEl.innerText = "Nie udało się pobrać żartu :(";
        jokeEl.style.opacity = '1';
    }
}

// Eksport do window (dla onclick w HTML)
window.loadDailyJoke = loadDailyJoke;

window.toggleHistory = function() {
    const content = document.getElementById('history-content');
    const icon = document.getElementById('history-icon');

    if (content.style.maxHeight === '0px' || content.style.maxHeight === '') {
        content.style.maxHeight = '200px';
        content.style.opacity = '1';
        content.style.marginTop = '10px';
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        content.style.maxHeight = '0px';
        content.style.opacity = '0';
        content.style.marginTop = '0px';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

window.toggleNewsItem = function(index) {
    const snippet = document.getElementById(`news-snippet-${index}`);
    const icon = document.getElementById(`news-icon-${index}`);

    if (snippet.style.maxHeight === '0px' || snippet.style.maxHeight === '') {
        snippet.style.maxHeight = '200px';
        snippet.style.opacity = '1';
        snippet.style.marginTop = '5px';
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        snippet.style.maxHeight = '0px';
        snippet.style.opacity = '0';
        snippet.style.marginTop = '0px';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}