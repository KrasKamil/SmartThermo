import { state } from './state.js';

export async function loadAppConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        state.use24HourFormat = (data.clockFormat === '24');
        updateClock();
    } catch (error) {
        console.error('Config error', error);
    }
}

export function updateClock() {
    const now = new Date();
    const dname = now.getDay(),
        mo = now.getMonth(),
        dnum = now.getDate(),
        yr = now.getFullYear();
    let hou = now.getHours(),
        min = now.getMinutes(),
        sec = now.getSeconds();
    let pe = state.use24HourFormat ? "" : "AM";

    if (!state.use24HourFormat) {
        if (hou == 0) hou = 12;
        if (hou > 12) {
            hou -= 12;
            pe = "PM";
        }
    }

    const pad = (num) => num.toString().padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const week = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const ids = ["dayname", "month", "daynum", "year", "hour", "minute", "second", "period"];
    const values = [week[dname], months[mo], pad(dnum), yr, pad(hou), pad(min), pad(sec), pe];

    for (let i = 0; i < ids.length; i++) {
        const el = document.getElementById(ids[i]);
        if (el) {
            el.textContent = values[i];
            if (ids[i] === "period") el.style.display = state.use24HourFormat ? "none" : "inline-block";
        }
    }
}

export function initClock() {
    loadAppConfig();
    window.setInterval(updateClock, 1000);
}