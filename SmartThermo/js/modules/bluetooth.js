// js/modules/bluetooth.js

// js/modules/bluetooth.js

// Funkcja skanowania (generuje listę i dodaje nasłuchiwanie)
export async function scanBluetooth() {
    const list = document.getElementById('bt-device-list');
    const status = document.getElementById('bt-status');

    if (!list) return console.error("Brak elementu listy BT w HTML");

    list.innerHTML = '<li style="color: #ccc; text-align: center;">Szukam urządzeń... ⏳</li>';
    if (status) status.innerText = "";

    try {
        const res = await fetch('/api/bluetooth/scan');
        const devices = await res.json();

        list.innerHTML = ''; // Wyczyść listę

        if (!devices || devices.length === 0) {
            list.innerHTML = '<li style="color: #aaa; text-align: center;">Nie znaleziono urządzeń.</li>';
            return;
        }

        // 1. Generujemy HTML bez "onclick"
        devices.forEach(dev => {
            const li = document.createElement('li');
            li.className = 'bt-item';
            const name = dev.name.trim() || dev.mac;

            li.innerHTML = `
                <span>📱 ${name}</span>
                <button class="bt-connect-btn" data-mac="${dev.mac}">Połącz</button>
            `;
            list.appendChild(li);
        });

        // 2. Dodajemy obsługę kliknięć (Event Delegation)
        // To naprawia problem "connectBluetooth is not defined" raz na zawsze
        list.onclick = (e) => {
            if (e.target && e.target.classList.contains('bt-connect-btn')) {
                const mac = e.target.getAttribute('data-mac');
                connectBluetooth(mac);
            }
        };

    } catch (e) {
        console.error(e);
        list.innerHTML = '<li style="color: red;">Błąd skanowania</li>';
    }
}

// Funkcja łączenia (nie musi być w window, bo wywołujemy ją wewnątrz modułu)
export async function connectBluetooth(mac) {
    const status = document.getElementById('bt-status');
    if (status) {
        status.innerText = "Łączenie... (Zaakceptuj na telefonie)";
        status.style.color = "#00d2ff";
    }

    try {
        const res = await fetch('/api/bluetooth/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mac: mac })
        });
        const data = await res.json();

        if (status) {
            if (data.status === 'success') {
                status.innerText = "✅ " + data.message;
                status.style.color = "#4CAF50";
            } else {
                status.innerText = "⚠️ " + data.message;
                status.style.color = "orange";
            }
        }
    } catch (e) {
        console.error("Błąd łączenia:", e);
        if (status) {
            status.innerText = "❌ Błąd połączenia";
            status.style.color = "red";
        }
    }
}