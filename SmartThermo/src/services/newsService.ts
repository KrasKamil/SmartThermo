import Parser from 'rss-parser';

const parser = new Parser();

export const getWorldNews = async () => {
    try {
        // Google News PL - Sekcja Świat
        const feedUrl = 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=pl&gl=PL&ceid=PL:pl';
        
        const feed = await parser.parseURL(feedUrl);

        // Pobieramy 3 pierwsze i formatujemy
        return feed.items.slice(0, 3).map(item => ({
            title: item.title || "Bez tytułu",
            link: item.link || "#",
            snippet: item.contentSnippet 
                ? item.contentSnippet.substring(0, 100) + "..." 
                : "Kliknij, aby przeczytać więcej."
        }));

    } catch (error: any) {
        console.warn("RSS Service Error:", error.message);
        return [{ title: "Nie udało się pobrać wiadomości.", link: "#", snippet: "Spróbuj ponownie później." }];
    }
};