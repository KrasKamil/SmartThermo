import axios from 'axios';

export const getHistoricalEvent = async () => {
    try {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');

        // Wikipedia API wymaga User-Agent, inaczej może odrzucić
        const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${month}/${day}`;
        
        const { data } = await axios.get(url, {
            timeout: 3000,
            headers: {
                'User-Agent': 'SmartThermo/1.0 (twoj-email@example.com)'
            }
        });

        const events = data.selected;
        if (events && events.length > 0) {
            // Losujemy jedno wydarzenie
            const selected = events[Math.floor(Math.random() * events.length)];
            return {
                year: selected.year,
                text: selected.text
            };
        }
        
        return { text: "Dziś jest spokojny dzień w historii.", year: today.getFullYear() };

    } catch (error: any) {
        console.warn("Wiki Service Error:", error.message);
        // Zwracamy bezpieczny obiekt, żeby nie wysadzić frontendu
        return { text: "Nie udało się pobrać danych historycznych.", year: new Date().getFullYear() };
    }
};