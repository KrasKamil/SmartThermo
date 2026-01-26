// js/modules/daily.js
import { state } from './state.js';


export async function initDaily() {
    const container = document.getElementById('daily-widget-content');
    if (!container) return;

    try {
        const res = await fetch('/api/daily');
        const data = await res.json();
        const imieniny = data.imieniny.replace(/,/g, ', ');
        const newsList = data.news || [];

        container.innerHTML = `
            <div style="border-left: 4px solid #00d2ff; padding-left: 15px; text-align: left;">
                <h2 class="daily-title" style="margin: 0; font-size: 1.4em;">Dzień dobry! 👋</h2>
                
                <div style="margin-top: 10px;">
                    <span class="daily-subtitle" style="font-size: 0.8em; text-transform: uppercase; color: #88aadd;">Imieniny:</span>
                    <div class="daily-names" style="font-weight: bold; font-size: 1.1em; margin-bottom: 12px;">${imieniny}</div>
                </div>

                <div class="history-box" style="padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03); margin-bottom: 10px;">
                    
                    <div onclick="toggleHistory()" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
                        <div style="font-size: 0.85em; color: #2E94E3; font-weight: bold;">
                            📅 Tego dnia w ${data.event.year} roku:
                        </div>
                        <i id="history-icon" class="fas fa-chevron-down" style="font-size: 0.8em; color: #555; transition: transform 0.3s;"></i>
                    </div>

                    <div id="history-content" style="
                        max-height: 0;
                        opacity: 0;
                        overflow: hidden;
                        transition: all 0.3s ease;
                        font-size: 0.9em;
                        line-height: 1.4;
                        margin-top: 0;
                        color: #ddd;
                    ">
                        ${data.event.text}
                    </div>
                </div>

                <div class="news-section" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <div style="font-size: 0.8em; color: #00d2ff; font-weight: bold; margin-bottom: 8px;">
                        <i class="fas fa-newspaper"></i> ZE ŚWIATA NEWSÓW:
                    </div>
                    
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        ${newsList.map((item, index) => `
                            <li class="news-item" style="margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
                                
                                <div onclick="toggleNewsItem(${index})" style="cursor: pointer; display: flex; align-items: flex-start; gap: 8px;">
                                    <i id="news-icon-${index}" class="fas fa-chevron-right" style="font-size: 0.8em; margin-top: 4px; transition: transform 0.3s; color: #555;"></i>
                                    <span style="font-size: 0.9em; font-weight: 500; line-height: 1.3;">${item.title}</span>
                                </div>

                                <div id="news-snippet-${index}" style="
                                    max-height: 0; 
                                    opacity: 0; 
                                    overflow: hidden; 
                                    transition: all 0.3s ease; 
                                    font-size: 0.85em; 
                                    color: #aaa; 
                                    padding-left: 18px;
                                ">
                                    <p style="margin: 5px 0 5px 0;">${item.snippet}</p>
                                    <a href="${item.link}" target="_blank" style="color: #00d2ff; text-decoration: none; font-weight: bold; font-size: 0.9em;">
                                        Czytaj całość &rarr;
                                    </a>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `;
    } catch (e) {
        console.error("Błąd Daily:", e);
    }
}

export function startDailyInterval() {
    initDaily(); // Pierwsze wywołanie od razu

    setInterval(() => {
        console.log("[Daily] Automatyczne odświeżanie...");
        initDaily();
    }, state.dailyRefreshInterval); // Pobiera 5 min ze state.js
}

// Obsługa zwijania/rozwijania sekcji Historycznej
window.toggleHistory = function() {
    const content = document.getElementById('history-content');
    const icon = document.getElementById('history-icon');

    // Sprawdzamy czy jest zwinięty
    if (content.style.maxHeight === '0px' || content.style.maxHeight === '') {
        // Rozwijamy
        content.style.maxHeight = '200px'; 
        content.style.opacity = '1';
        content.style.marginTop = '10px';
        if(icon) icon.style.transform = 'rotate(180deg)'; // Obrót strzałki
    } else {
        // Zwijamy
        content.style.maxHeight = '0px';
        content.style.opacity = '0';
        content.style.marginTop = '0px';
        if(icon) icon.style.transform = 'rotate(0deg)';
    }
}

// Funkcja pomocnicza do przełączania widoczności newsa (dodaj ją na dole pliku lub w module)
window.toggleNewsItem = function(index) {
    const snippet = document.getElementById(`news-snippet-${index}`);
    const icon = document.getElementById(`news-icon-${index}`);
    
    if (snippet.style.maxHeight === '0px' || snippet.style.maxHeight === '') {
        snippet.style.maxHeight = '200px'; // Rozwijanie
        snippet.style.opacity = '1';
        snippet.style.marginTop = '8px';
        if(icon) icon.style.transform = 'rotate(90deg)';
    } else {
        snippet.style.maxHeight = '0px'; // Zwijanie
        snippet.style.opacity = '0';
        snippet.style.marginTop = '0px';
        if(icon) icon.style.transform = 'rotate(0deg)';
    }
}