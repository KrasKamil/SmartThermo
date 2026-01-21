// js/modules/state.js
export const state = {
    // Źródło dźwięku: 'spotify', 'radio', 'system', 'bluetooth', 'none'
    activeSource: 'none',

    // Czy cokolwiek gra (Globalny status)
    isPlaying: false,

    // Informacje o utworze (wspólne dla wszystkich źródeł)
    currentTrack: {
        title: '',
        artist: '',
        cover: ''
    },

    // Specyficzne dla Radia
    isRadioPlaying: false,
    globalStationList: [],
    currentStationIndex: -1,

    // Ustawienia
    use24HourFormat: false
};