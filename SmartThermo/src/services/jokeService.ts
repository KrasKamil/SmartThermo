import axios from 'axios';

export const getDailyJoke = async () => {
    try {
        const url = 'https://v2.jokeapi.dev/joke/Programming,Miscellaneous,Pun?blacklistFlags=nsfw,religious,political,racist,sexist,explicit&safe-mode';
        
        const { data } = await axios.get(url);
        
        if (data.error) {
            return { joke: "Błąd API z żartami.", category: "Error" };
        }

        let jokeText = "";
        
        // API zwraca żart w dwóch formatach: 'single' lub 'twopart'
        if (data.type === 'single') {
            jokeText = data.joke;
        } else {
            jokeText = `${data.setup}\n\n👉 ${data.delivery}`;
        }

        return { joke: jokeText, category: data.category };

    } catch (error) {
        console.error("Joke Service Error:", error);
        // Fallback w razie braku neta
        return { 
            joke: "Dlaczego programiści mylą Halloween z Bożym Narodzeniem?\nBo 31 OCT = 25 DEC.", 
            category: "Classic" 
        };
    }
};