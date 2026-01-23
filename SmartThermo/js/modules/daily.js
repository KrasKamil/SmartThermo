// js/modules/daily.js
export async function initDaily() {
    const container = document.getElementById('daily-widget');
    if (!container) return;

    try {
        const res = await fetch('/api/daily');
        const data = await res.json();

        // Formatowanie tekstu imienin (czasem API zwraca "Imie1, Imie2", chcemy spacje)
        const imieniny = data.imieniny.replace(/,/g, ', ');

        container.innerHTML = `
            <div style="border-left: 4px solid #00d2ff; padding-left: 15px; text-align: left;">
                <h2 style="margin: 0; font-size: 1.4em; color: #fff;">Dzień dobry! 👋</h2>
                
                <div style="margin-top: 10px;">
                    <span style="color: #aaa; font-size: 0.85em; text-transform: uppercase; letter-spacing: 1px;">Dziś są imieniny:</span>
                    <div style="color: #00d2ff; font-weight: bold; font-size: 1.1em; margin-bottom: 12px;">
                        ${imieniny}
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                    <div style="font-size: 0.8em; color: #f1c40f; margin-bottom: 3px;">
                        📅 Tego dnia w ${data.event.year} roku:
                    </div>
                    <div style="font-size: 0.9em; line-height: 1.4; color: #ddd;">
                        ${data.event.text}
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error("Daily Widget Error:", e);
        container.innerHTML = `<p style="color: #aaa;">Nie udało się pobrać wydarzeń dnia.</p>`;
    }
}