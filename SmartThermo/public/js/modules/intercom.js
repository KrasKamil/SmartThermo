const targets = ['gate', 'wicket'];
const ringTimeoutMs = 30_000;
const envStreamUrl = window.ENV_INTERCOM_STREAM_URL || '';
const storedStreamUrl = window.localStorage.getItem('smartthermo_intercom_stream');
const state = {
    callStatus: 'idle',
    revision: -1,
    callId: null,
    socketConnected: false,
    apiAvailable: false,
    devices: {
        gate: { available: false, status: 'not_configured', pulseExpiresAt: null },
        wicket: { available: false, status: 'not_configured', pulseExpiresAt: null }
    }
};

const pendingTargets = new Set();
let currentStreamUrl = storedStreamUrl === null ? envStreamUrl : storedStreamUrl;
let ringSoundEnabled = window.localStorage.getItem('smartthermo_intercom_ring_sound') !== 'false';
let ringAudioContext = null;
let ringSequenceTimer = null;
let ringSequenceId = 0;
let answerPending = false;
let dismissPending = false;
let swipeProgress = 0;
let swipePointerId = null;
let swipeStartX = 0;
let previousFocus = null;

const element = (id) => document.getElementById(id);

const setSoundSettingStatus = (message) => {
    const status = element('intercom-sound-setting-status');
    if (status) status.textContent = message;
};

const stopRingSound = () => {
    ringSequenceId += 1;
    if (ringSequenceTimer) clearTimeout(ringSequenceTimer);
    ringSequenceTimer = null;
    if (ringAudioContext && ringAudioContext.state === 'running') {
        ringAudioContext.suspend().catch((error) => {
            console.warn('[DOMOFON] Nie udało się zatrzymać kontekstu dźwięku:', error);
        });
    }
};

const getRingAudioContext = () => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (!ringAudioContext || ringAudioContext.state === 'closed') {
        ringAudioContext = new AudioContextConstructor();
    }
    return ringAudioContext;
};

const playDoorbellPattern = (audioContext) => {
    const notes = [
        { frequency: 523.25, start: 0, duration: 0.36 },
        { frequency: 659.25, start: 0.32, duration: 0.4 },
        { frequency: 783.99, start: 0.66, duration: 0.5 },
        { frequency: 659.25, start: 1.06, duration: 0.72 }
    ];

    for (const note of notes) {
        for (const partial of [{ frequency: note.frequency, volume: 0.22 }, { frequency: note.frequency * 2, volume: 0.045 }]) {
            const oscillator = audioContext.createOscillator();
            const envelope = audioContext.createGain();
            const start = audioContext.currentTime + note.start;
            const end = start + note.duration;
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(partial.frequency, start);
            envelope.gain.setValueAtTime(0.0001, start);
            envelope.gain.exponentialRampToValueAtTime(partial.volume, start + 0.04);
            envelope.gain.exponentialRampToValueAtTime(0.0001, end);
            oscillator.connect(envelope);
            envelope.connect(audioContext.destination);
            oscillator.start(start);
            oscillator.stop(end + 0.02);
        }
    }
};

const playRingSound = async () => {
    if (!ringSoundEnabled) return;
    const sequenceId = ++ringSequenceId;
    try {
        const audioContext = getRingAudioContext();
        if (!audioContext) throw new Error('Web Audio API jest niedostępne');
        await audioContext.resume();
        if (state.callStatus !== 'ringing' || sequenceId !== ringSequenceId) {
            if (audioContext.state === 'running') {
                audioContext.suspend().catch((suspendError) => {
                    console.warn('[DOMOFON] Nie udało się uśpić anulowanego kontekstu:', suspendError);
                });
            }
            return;
        }

        const ringOnce = () => {
            if (state.callStatus !== 'ringing' || !ringSoundEnabled || sequenceId !== ringSequenceId) return;
            playDoorbellPattern(audioContext);
            ringSequenceTimer = setTimeout(ringOnce, 3_000);
        };
        ringOnce();
        setSoundSettingStatus('Własny dźwięk domofonu jest aktywny.');
    } catch (error) {
        console.info('[DOMOFON] Przeglądarka zablokowała dźwięk do czasu interakcji:', error);
        setSoundSettingStatus('Autoplay zablokowany. Użyj „Odtwórz testowy dźwięk”, aby odblokować dźwięk.');
        const feedback = element('intercom-action-feedback');
        if (feedback && state.callStatus === 'ringing') {
            feedback.textContent = 'Dźwięk zablokowany przez przeglądarkę — użyj testu w Ustawieniach.';
        }
    }
};

const playTestSound = async () => {
    if (!ringSoundEnabled) {
        setSoundSettingStatus('Najpierw włącz dźwięk dzwonka.');
        return;
    }
    try {
        const audioContext = getRingAudioContext();
        if (!audioContext) throw new Error('Web Audio API jest niedostępne');
        await audioContext.resume();
        playDoorbellPattern(audioContext);
        setSoundSettingStatus('Odtwarzana jest testowa sekwencja dźwięku domofonu.');
        if (state.callStatus !== 'ringing') {
            window.setTimeout(() => {
                if (state.callStatus !== 'ringing' && audioContext.state === 'running') {
                    audioContext.suspend().catch((suspendError) => {
                        console.warn('[DOMOFON] Nie udało się uśpić kontekstu testowego:', suspendError);
                    });
                }
            }, 1_500);
        }
    } catch (error) {
        console.warn('[DOMOFON] Nie udało się odtworzyć dźwięku testowego:', error);
        setSoundSettingStatus('Nie udało się odtworzyć dźwięku. Sprawdź ustawienia dźwięku przeglądarki.');
    }
};

const setCameraMessage = (message, isError = false) => {
    const messageElement = element('intercom-camera-message');
    const messageText = element('intercom-camera-message-text');
    const image = element('intercom-live-img');
    if (messageElement) {
        if (messageText) messageText.textContent = message;
        messageElement.classList.toggle('is-error', isError);
        messageElement.hidden = false;
    }
    if (image) image.hidden = true;
};

const startCameraPreview = () => {
    const image = element('intercom-live-img');
    if (!currentStreamUrl) {
        setCameraMessage('Adres kamery furtki nie jest skonfigurowany. Ustaw go w Ustawieniach systemu.');
        return;
    }
    if (image) {
        setCameraMessage('Łączenie z kamerą furtki…');
        image.src = currentStreamUrl;
    }
};

const refreshCameraPreviewIfOpen = () => {
    if (!element('intercom-overlay')?.hidden) startCameraPreview();
};

const updateDeviceStatus = (target, device) => {
    if (!targets.includes(target) || !device) return;
    state.devices[target] = {
        available: Boolean(device.available),
        status: device.status || (device.available ? 'ready' : 'not_configured'),
        pulseExpiresAt: device.pulseExpiresAt || null
    };

    const label = target === 'gate' ? 'Brama' : 'Furtka';
    const statusText = state.devices[target].status === 'multiple_devices'
        ? 'wymaga jednego sterownika'
        : !state.devices[target].available
            ? 'brak sterownika'
            : state.devices[target].status === 'pulse_active'
            ? 'impuls potwierdzony'
            : 'sterownik gotowy';
    const statusElement = element(`intercom-${target}-status`);
    const button = element(`intercom-unlock-${target}-btn`);
    if (statusElement) statusElement.textContent = `${label}: ${statusText}`;
    if (button) button.disabled = !state.devices[target].available || pendingTargets.has(target) ||
        !state.socketConnected || !state.apiAvailable;
};

const updateCallStatus = (status) => {
    if (!['idle', 'ringing', 'answered'].includes(status)) return;
    const wasRinging = state.callStatus === 'ringing';
    state.callStatus = status;
    if (status === 'ringing' && !wasRinging) playRingSound();
    if (status !== 'ringing') stopRingSound();

    const banner = element('intercom-ring-banner');
    const title = element('intercom-call-title');
    const statusText = element('intercom-call-status');
    const answerButton = element('intercom-answer-btn');
    const answerSwipe = element('intercom-answer-swipe-wrap');
    const dismissButton = element('intercom-dismiss-btn');
    const isRinging = status === 'ringing';

    if (banner) banner.hidden = !isRinging;
    if (title) {
        title.textContent = isRinging
            ? 'Ktoś dzwoni'
            : status === 'answered'
                ? 'Powiadomienie odebrane'
                : 'Domofon gotowy';
    }
    if (statusText) {
        statusText.textContent = !state.socketConnected || !state.apiAvailable
            ? 'Brak połączenia z serwerem'
            : status === 'ringing'
                ? 'Oczekiwanie na odbiór'
                : status === 'answered'
                    ? 'Odebrano powiadomienie · obraz jest jednokierunkowym strumieniem MJPEG'
                    : 'Gotowy na połączenie';
    }
    if (answerButton) {
        answerButton.hidden = !isRinging;
        answerButton.disabled = !isRinging || answerPending || !state.socketConnected || !state.apiAvailable;
    }
    if (answerSwipe) answerSwipe.hidden = !isRinging;
    if (dismissButton) {
        dismissButton.hidden = !isRinging && status !== 'answered';
        dismissButton.disabled = dismissPending || !state.socketConnected || !state.apiAvailable;
    }
    if (!isRinging) resetSwipe();
};

const applyStatus = (data) => {
    if (!data || Number(data.revision) < state.revision) return;
    state.revision = Number.isFinite(Number(data.revision)) ? Number(data.revision) : state.revision;
    state.callId = data.callId || null;
    let callStatus = data.callStatus || data.status || 'idle';
    if (callStatus === 'ringing') {
        const lastRing = Number(data.lastRing ?? data.timestamp);
        if (!Number.isFinite(lastRing) || Date.now() - lastRing >= ringTimeoutMs || lastRing - Date.now() > 5_000) {
            callStatus = 'idle';
        }
    }
    updateCallStatus(callStatus);
    for (const target of targets) updateDeviceStatus(target, data.devices && data.devices[target]);
    if (state.callStatus === 'ringing' && element('intercom-overlay')?.hidden) {
        openIntercomPopup(false);
    }
};

const setConnectionStatus = (connected) => {
    state.socketConnected = connected;
    const connection = element('intercom-connection-status');
    if (connection) {
        connection.textContent = !connected
            ? 'Brak połączenia Socket.IO'
            : state.apiAvailable
                ? 'Serwer połączony'
                : 'Brak odpowiedzi API serwera';
        connection.dataset.connected = String(connected);
    }
    updateCallStatus(state.callStatus);
    for (const target of targets) updateDeviceStatus(target, state.devices[target]);
};

const refreshIntercomStatus = async () => {
    try {
        const response = await fetch('/api/intercom/status');
        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload.message || 'Nie udało się pobrać stanu domofonu');
        }
        state.apiAvailable = true;
        setConnectionStatus(state.socketConnected);
        applyStatus(payload.data);
    } catch (error) {
        console.error('[DOMOFON] Nie udało się odświeżyć stanu:', error);
        state.apiAvailable = false;
        setConnectionStatus(state.socketConnected);
    }
};

const resetSwipe = () => {
    swipeProgress = 0;
    swipePointerId = null;
    const slider = element('intercom-answer-swipe');
    if (slider) {
        slider.style.setProperty('--swipe-progress', '0%');
        slider.style.setProperty('--swipe-position', '0px');
        slider.setAttribute('aria-valuenow', '0');
    }
};

const setSwipeProgress = (progress) => {
    swipeProgress = Math.max(0, Math.min(100, progress));
    const slider = element('intercom-answer-swipe');
    if (slider) {
        slider.style.setProperty('--swipe-progress', `${swipeProgress}%`);
        const distance = Math.max(0, slider.clientWidth - 58);
        slider.style.setProperty('--swipe-position', `${distance * swipeProgress / 100}px`);
        slider.setAttribute('aria-valuenow', String(Math.round(swipeProgress)));
    }
};

const openIntercomPopup = (refreshState = true) => {
    const overlay = element('intercom-overlay');
    if (!overlay) return;
    previousFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('intercom-open');
    refreshCameraPreviewIfOpen();
    if (refreshState) refreshIntercomStatus();
    element('intercom-close-btn')?.focus();
};

const closeIntercomPopup = () => {
    const overlay = element('intercom-overlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('intercom-open');
    const image = element('intercom-live-img');
    if (image) image.removeAttribute('src');
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
};

const answerDoorbell = async () => {
    if (answerPending || state.callStatus !== 'ringing' || !state.socketConnected || !state.apiAvailable) return;
    answerPending = true;
    updateCallStatus(state.callStatus);
    const feedback = element('intercom-action-feedback');
    if (feedback) feedback.textContent = 'Odbieranie powiadomienia…';

    try {
        const response = await fetch('/api/intercom/answer', { method: 'POST' });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || 'Nie udało się odebrać');
        if (Number(payload.revision) >= state.revision) {
            state.revision = Number(payload.revision);
            state.callId = payload.callId || state.callId;
            updateCallStatus('answered');
        }
        if (feedback) feedback.textContent = 'Powiadomienie odebrane. Obraz pozostaje jednokierunkowym strumieniem MJPEG.';
    } catch (error) {
        console.error('[DOMOFON] Błąd odbierania:', error);
        if (feedback) feedback.textContent = error.message || 'Nie udało się odebrać powiadomienia.';
        await refreshIntercomStatus();
    } finally {
        answerPending = false;
        updateCallStatus(state.callStatus);
    }
};

const dismissDoorbell = async () => {
    if (dismissPending || !state.socketConnected || !state.apiAvailable) return;
    dismissPending = true;
    const button = element('intercom-dismiss-btn');
    if (button) button.disabled = true;
    stopRingSound();
    try {
        const response = await fetch('/api/intercom/dismiss', { method: 'POST' });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || 'Nie udało się wyciszyć dzwonka');
        await refreshIntercomStatus();
        const feedback = element('intercom-action-feedback');
        if (feedback) feedback.textContent = payload.dismissed ? 'Dzwonek wyciszony.' : 'Nie ma aktywnego dzwonka.';
    } catch (error) {
        console.error('[DOMOFON] Błąd wyciszania:', error);
        const feedback = element('intercom-action-feedback');
        if (feedback) feedback.textContent = error.message || 'Nie udało się wyciszyć dzwonka.';
        await refreshIntercomStatus();
        if (state.callStatus === 'ringing') playRingSound();
    } finally {
        dismissPending = false;
        updateCallStatus(state.callStatus);
    }
};

const unlockDoorbell = async (target) => {
    if (!targets.includes(target) || pendingTargets.has(target) ||
        !state.devices[target].available || !state.socketConnected || !state.apiAvailable) return;
    pendingTargets.add(target);
    updateDeviceStatus(target, state.devices[target]);
    const feedback = element('intercom-action-feedback');
    const targetLabel = target === 'gate' ? 'bramy' : 'furtki';
    if (feedback) feedback.textContent = `Wysyłanie polecenia do sterownika ${targetLabel}…`;

    try {
        const response = await fetch('/api/intercom/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duration: 5, target })
        });
        const payload = await response.json();
        if (!response.ok || !payload.success || payload.confirmed !== true) {
            throw new Error(payload.message || `Sterownik ${targetLabel} nie potwierdził polecenia`);
        }
        if (feedback) feedback.textContent = `Sterownik ${targetLabel} potwierdził uruchomienie impulsu na ${payload.duration} s. Położenie fizyczne nie jest monitorowane.`;
        await refreshIntercomStatus();
    } catch (error) {
        console.error(`[DOMOFON] Błąd polecenia dla ${targetLabel}:`, error);
        if (feedback) feedback.textContent = error.message || `Nie udało się uzyskać potwierdzenia sterownika ${targetLabel}.`;
        await refreshIntercomStatus();
    } finally {
        pendingTargets.delete(target);
        updateDeviceStatus(target, state.devices[target]);
    }
};

const saveStreamUrl = () => {
    const input = element('intercom-stream-url-setting');
    const feedback = element('intercom-stream-setting-status');
    if (!input) return;
    const value = input.value.trim();
    if (value) {
        try {
            const parsed = new URL(value);
            if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
                throw new Error('Nieprawidłowy adres strumienia');
            }
        } catch {
            if (feedback) feedback.textContent = 'Podaj pełny adres HTTP(S) strumienia MJPEG.';
            input.focus();
            return;
        }
    }
    currentStreamUrl = value;
    window.localStorage.setItem('smartthermo_intercom_stream', currentStreamUrl);
    if (feedback) feedback.textContent = value ? 'Zapisano adres kamery w tej przeglądarce.' : 'Adres wyczyszczony; kamera nie będzie wyświetlana.';
    refreshCameraPreviewIfOpen();
};

const restoreDefaultStreamUrl = () => {
    window.localStorage.removeItem('smartthermo_intercom_stream');
    currentStreamUrl = envStreamUrl;
    const input = element('intercom-stream-url-setting');
    const feedback = element('intercom-stream-setting-status');
    if (input) input.value = currentStreamUrl;
    if (feedback) {
        feedback.textContent = currentStreamUrl
            ? 'Przywrócono domyślny adres INTERCOM_STREAM_URL z serwera.'
            : 'Serwer nie ma ustawionego INTERCOM_STREAM_URL.';
    }
    refreshCameraPreviewIfOpen();
};

const setRingSoundEnabled = (enabled) => {
    ringSoundEnabled = enabled;
    window.localStorage.setItem('smartthermo_intercom_ring_sound', String(enabled));
    if (enabled && state.callStatus === 'ringing') {
        playRingSound();
    } else if (!enabled) {
        stopRingSound();
        setSoundSettingStatus('Dźwięk dzwonka wyłączony.');
    } else {
        setSoundSettingStatus('Dźwięk dzwonka włączony.');
    }
};

const bindSwipeGesture = () => {
    const slider = element('intercom-answer-swipe');
    if (!slider) return;
    slider.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0 || state.callStatus !== 'ringing' || answerPending) return;
        swipePointerId = event.pointerId;
        swipeStartX = event.clientX;
        slider.setPointerCapture(event.pointerId);
    });
    slider.addEventListener('pointermove', (event) => {
        if (event.pointerId !== swipePointerId) return;
        const distance = Math.max(1, slider.getBoundingClientRect().width - 64);
        setSwipeProgress(((event.clientX - swipeStartX) / distance) * 100);
    });
    const finishSwipe = (event, shouldAnswer) => {
        if (event.pointerId !== swipePointerId) return;
        const accepted = shouldAnswer && swipeProgress >= 88;
        resetSwipe();
        if (accepted) answerDoorbell();
    };
    slider.addEventListener('pointerup', (event) => finishSwipe(event, true));
    slider.addEventListener('pointercancel', (event) => finishSwipe(event, false));
    slider.addEventListener('lostpointercapture', (event) => finishSwipe(event, false));
    slider.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            answerDoorbell();
        } else if (event.key === 'Home') {
            event.preventDefault();
            setSwipeProgress(0);
        } else if (event.key === 'End') {
            event.preventDefault();
            setSwipeProgress(100);
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            setSwipeProgress(swipeProgress + 10);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            setSwipeProgress(swipeProgress - 10);
        }
    });
};

const bindModalKeyboard = () => {
    const overlay = element('intercom-overlay');
    overlay?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeIntercomPopup();
        }
        if (event.key !== 'Tab') return;
        const focusable = [...overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
            .filter((item) => !item.hidden && item.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    overlay?.addEventListener('click', (event) => {
        if (event.target === overlay) closeIntercomPopup();
    });
};

export const initIntercom = (socket) => {
    socket.on('connect', () => {
        setConnectionStatus(true);
        refreshIntercomStatus();
    });
    socket.on('disconnect', () => setConnectionStatus(false));
    socket.on('doorbell:ring', (event) => {
        openIntercomPopup();
        applyStatus({
            callStatus: 'ringing',
            lastRing: event.timestamp,
            callId: event.callId,
            revision: event.revision
        });
    });
    socket.on('doorbell:answered', (event) => {
        applyStatus({ callStatus: 'answered', callId: event.callId, revision: event.revision });
    });
    socket.on('doorbell:idle', (event) => {
        applyStatus({ callStatus: 'idle', callId: event.callId, revision: event.revision });
    });
    socket.on('doorbell:dismiss', (event) => {
        applyStatus({ callStatus: 'idle', callId: event.callId, revision: event.revision });
    });
    socket.on('doorbell:device:availability', (event) => {
        const target = event?.target;
        if (!targets.includes(target)) return;
        updateDeviceStatus(target, {
            ...state.devices[target],
            available: Boolean(event.available),
            status: event.available ? 'ready' : 'not_configured'
        });
    });
    socket.on('doorbell:unlock:confirmed', (event) => {
        if (!targets.includes(event?.target)) return;
        updateDeviceStatus(event.target, {
            ...state.devices[event.target],
            available: true,
            status: 'pulse_active',
            pulseExpiresAt: event.expiresAt
        });
    });
    socket.on('doorbell:unlock:ended', (event) => {
        if (!targets.includes(event?.target)) return;
        updateDeviceStatus(event.target, {
            ...state.devices[event.target],
            status: state.devices[event.target].available ? 'ready' : 'not_configured',
            pulseExpiresAt: null
        });
        const feedback = element('intercom-action-feedback');
        if (feedback) feedback.textContent = `Impuls sterownika ${event.target === 'gate' ? 'bramy' : 'furtki'} zakończony. Położenie fizyczne pozostaje nieznane.`;
    });

    element('intercom-button')?.addEventListener('click', openIntercomPopup);
    element('intercom-close-btn')?.addEventListener('click', closeIntercomPopup);
    element('intercom-close-footer-btn')?.addEventListener('click', closeIntercomPopup);
    element('intercom-answer-btn')?.addEventListener('click', answerDoorbell);
    element('intercom-dismiss-btn')?.addEventListener('click', dismissDoorbell);
    element('intercom-unlock-wicket-btn')?.addEventListener('click', () => unlockDoorbell('wicket'));
    element('intercom-unlock-gate-btn')?.addEventListener('click', () => unlockDoorbell('gate'));
    element('intercom-save-stream-setting')?.addEventListener('click', saveStreamUrl);
    element('intercom-reset-stream-setting')?.addEventListener('click', restoreDefaultStreamUrl);
    element('intercom-ring-sound-setting')?.addEventListener('change', (event) => {
        setRingSoundEnabled(event.target.checked);
    });
    element('intercom-test-sound-setting')?.addEventListener('click', playTestSound);
    element('intercom-preview-btn')?.addEventListener('click', () => {
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        element('intercom-preview')?.scrollIntoView({ behavior, block: 'center' });
    });
    element('intercom-live-img')?.addEventListener('load', () => {
        element('intercom-camera-message').hidden = true;
        element('intercom-live-img').hidden = false;
    });
    element('intercom-live-img')?.addEventListener('error', () => {
        setCameraMessage('Kamera furtki jest niedostępna. Sprawdź adres, zasilanie i dostępność sieciową strumienia MJPEG.', true);
    });
    bindSwipeGesture();
    bindModalKeyboard();

    if (element('intercom-stream-url-setting')) element('intercom-stream-url-setting').value = currentStreamUrl;
    const soundSetting = element('intercom-ring-sound-setting');
    if (soundSetting) soundSetting.checked = ringSoundEnabled;
    updateCallStatus(state.callStatus);
    setConnectionStatus(Boolean(socket.connected));
    refreshIntercomStatus();
};
