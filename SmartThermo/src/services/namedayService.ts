import { namedays } from '../data/imieniny';

export const getNamedays = async (): Promise<string> => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Klucz w formacie "MM-DD", np. "02-05"
    const dateKey = `${month}-${day}`;

    return namedays[dateKey] || "Brak danych o imieninach";
};