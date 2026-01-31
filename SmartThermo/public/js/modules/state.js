// js/modules/state.js
export const state = {
    // Źródło dźwięku: 'spotify', 'radio', 'system', 'bluetooth', 'none'
    activeSource: 'none',

    // Czy cokolwiek gra (Globalny status)
    isPlaying: false,
    isLocalSoundPlaying: false,

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

    // Znacznik czasu startu radia (Tarcza ochronna)
    lastRadioStartTimestamp: 0,

    // Ustawienia
    use24HourFormat: false,

    // Interwał odświeżania widgetu Daily(5 minut do testów)
    dailyRefreshInterval: 30 * 60 * 1000
};