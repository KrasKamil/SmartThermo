// js/modules/daily.js
export async function initDaily() {
    const container = document.getElementById('daily-widget');
    if (!container) return;

    try {
        const res = await fetch('/api/daily');
        const data = await res.json();

        // Formatowanie imienin
        const imieniny = data.imieniny.replace(/,/g, ', ');

        // ZMIANA: Zamiast style="color: #fff" używamy klas CSS
        container.innerHTML = `
            <div style="border-left: 4px solid #00d2ff; padding-left: 15px; text-align: left;">
                
                <h2 class="daily-title" style="margin: 0; font-size: 1.4em;">Dzień dobry! 👋</h2>
                
                <div style="margin-top: 10px;">
                    <span class="daily-subtitle" style="font-size: 0.85em; text-transform: uppercase; letter-spacing: 1px;">Dziś są imieniny:</span>
                    <div class="daily-names" style="font-weight: bold; font-size: 1.1em; margin-bottom: 12px;">
                        ${imieniny}
                    </div>
                </div>

                <div class="history-box" style="padding: 10px; border-radius: 8px;">
                    <div class="history-date" style="font-size: 0.8em; margin-bottom: 3px;">
                        📅 Tego dnia w ${data.event.year} roku:
                    </div>
                    <div class="daily-text" style="font-size: 0.9em; line-height: 1.4;">
                        ${data.event.text}
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red">Błąd ładowania danych dnia.</p>';
    }
}