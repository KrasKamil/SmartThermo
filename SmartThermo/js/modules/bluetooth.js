// js/modules/bluetooth.js

export async function scanBluetooth() {
    const list = document.getElementById('bt-device-list');
    const status = document.getElementById('bt-status');

    list.innerHTML = '<li style="color: #ccc; text-align: center;">Szukam urządzeń... ⏳</li>';
    if (status) status.innerText = "";

    try {
        const res = await fetch('/api/bluetooth/scan');
        const devices = await res.json();

        list.innerHTML = '';

        if (!devices || devices.length === 0) {
            list.innerHTML = '<li style="color: #aaa; text-align: center;">Nie znaleziono urządzeń.</li>';
            return;
        }

        devices.forEach(dev => {
            const li = document.createElement('li');
            li.className = 'bt-item';
            const name = dev.name.trim() || dev.mac;

            // Uwaga: Tutaj generujemy HTML z onclick="connectBluetooth...".
            // Dlatego connectBluetooth musi być globalny (window).
            li.innerHTML = `
                <span>📱 ${name}</span>
                <button onclick="connectBluetooth('${dev.mac}')">Połącz</button>
            `;
            list.appendChild(li);
        });

    } catch (e) {
        console.error(e);
        list.innerHTML = '<li style="color: red;">Błąd skanowania</li>';
    }
}

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
        if (status) {
            status.innerText = "❌ Błąd połączenia";
            status.style.color = "red";
        }
    }
}