const connectScreen = document.getElementById("connectScreen");
const trackpadScreen = document.getElementById("trackpadScreen");

const scrollSensitivity = document.getElementById("scrollSensitivity");
const scrollSensitivityValue = document.getElementById("scrollSensitivityValue");
const ipInput = document.getElementById("ipInput");
const connectButton = document.getElementById("connectButton");
const statusElement = document.getElementById("status");
const savedIpsElement = document.getElementById("savedIps");
const savedIpList = document.getElementById("savedIpList");
const settingsButton = document.getElementById("settingsButton");
const settingsPanel = document.getElementById("settingsPanel");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const keepScreenAwake = document.getElementById("keepScreenAwake");
const wakeLockStatus = document.getElementById("wakeLockStatus");
const mouseSensitivity = document.getElementById("mouseSensitivity");
const mouseSensitivityValue = document.getElementById("mouseSensitivityValue");

const trackpad = document.getElementById("trackpad");
const scrollZone = document.getElementById("scrollZone");
const returnButton = document.getElementById("returnButton");
const keyboardButton = document.getElementById("keyboardButton");
const keyboardPanel = document.getElementById("keyboardPanel");
const closeKeyboardButton = document.getElementById("closeKeyboardButton");
const keyboardInput = document.getElementById("keyboardInput");

let scrollSensMultiplier = 1;
const SCROLL_SENSITIVITY_KEY = "phoneMouse.scrollSensitivity";

const savedScrollSens = Number(localStorage.getItem(SCROLL_SENSITIVITY_KEY));
if (Number.isFinite(savedScrollSens) && savedScrollSens >= 1 && savedScrollSens <= 10) {
    scrollSensMultiplier = savedScrollSens;
}
if (scrollSensitivity) {
    scrollSensitivity.addEventListener("input", () => {
        if (!scrollSensitivity.value || !scrollSensitivity.validity.valid) return;
        // Tam sayıya yuvarlayarak kusuru önlüyoruz
        scrollSensMultiplier = Math.round(Number(scrollSensitivity.value)); 
        scrollSensitivityValue.value = `${scrollSensMultiplier}x`;
        localStorage.setItem(SCROLL_SENSITIVITY_KEY, String(scrollSensMultiplier));
    });

    scrollSensitivity.addEventListener("change", () => {
        if (!scrollSensitivity.value || !scrollSensitivity.validity.valid) {
            scrollSensitivity.value = String(scrollSensMultiplier);
        }
    });
}

let socket = null;
let wakeLock = null;

let touchState = {
    count: 0,
    startTime: 0,
    moved: false,
    longPressTimer: null,
    longPressFired: false,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    lastPinchDist: 0,
    lastTapTime: 0,
    isDragging: false
};

let scrollState = {
    lastY: 0,
    isActive: false
};

const MOVE_THRESHOLD = 10;
const LONG_PRESS_TIME = 500;
let moveSensitivity = 2;
const DOUBLE_TAP_TIME = 300;
const PINCH_THRESHOLD = 15;

const SAVED_IPS_KEY = "phoneMouse.savedIps";
const KEEP_SCREEN_AWAKE_KEY = "phoneMouse.keepScreenAwake";
const MOUSE_SENSITIVITY_KEY = "phoneMouse.mouseSensitivity";

const savedSensitivity = Number(localStorage.getItem(MOUSE_SENSITIVITY_KEY));
if (Number.isFinite(savedSensitivity) && savedSensitivity >= 0.5 && savedSensitivity <= 5) {
    moveSensitivity = savedSensitivity;
}
if (mouseSensitivity) {
    mouseSensitivity.value = String(moveSensitivity);
    mouseSensitivityValue.value = `${moveSensitivity}x`;
}

function getSavedIps() {
    try {
        const savedIps = JSON.parse(localStorage.getItem(SAVED_IPS_KEY) || "[]");
        return Array.isArray(savedIps) ? savedIps.filter(ip => typeof ip === "string") : [];
    } catch (error) {
        return [];
    }
}

function saveIp(ip) {
    const savedIps = [ip, ...getSavedIps().filter(savedIp => savedIp !== ip)].slice(0, 6);
    localStorage.setItem(SAVED_IPS_KEY, JSON.stringify(savedIps));
    renderSavedIps();
}

function removeSavedIp(ip) {
    const savedIps = getSavedIps().filter(savedIp => savedIp !== ip);
    localStorage.setItem(SAVED_IPS_KEY, JSON.stringify(savedIps));
    renderSavedIps();
}

function renderSavedIps() {
    const savedIps = getSavedIps();
    savedIpList.replaceChildren();
    savedIpsElement.classList.toggle("hidden", savedIps.length === 0);

    for (const ip of savedIps) {
        const row = document.createElement("div");
        row.className = "savedIpRow";

        const connectSavedButton = document.createElement("button");
        connectSavedButton.className = "savedIpButton";
        connectSavedButton.textContent = ip;
        connectSavedButton.addEventListener("click", () => {
            ipInput.value = ip;
            connect();
        });

        const removeButton = document.createElement("button");
        removeButton.className = "removeIpButton";
        removeButton.textContent = "×";
        removeButton.title = `${ip} kaydını sil`;
        removeButton.addEventListener("click", () => removeSavedIp(ip));

        row.append(connectSavedButton, removeButton);
        savedIpList.append(row);
    }
}

function setStatus(text) {
    statusElement.textContent = text;
}

function send(data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }
    socket.send(data);
}

function sendKeyboardMessage(type, value) {
    send(JSON.stringify({ type, value }));
}

async function requestWakeLock() {
    if (!keepScreenAwake.checked || !("wakeLock" in navigator)) return;
    if (wakeLock && !wakeLock.released) return;

    try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
            wakeLock = null;
        });
    } catch (error) {
        console.log("Wake Lock alınamadı:", error);
    }
}

async function releaseWakeLock() {
    if (!wakeLock) return;
    await wakeLock.release();
    wakeLock = null;
}

async function reconnectWakeLock() {
    if (document.visibilityState === "visible" && socket && socket.readyState === WebSocket.OPEN) {
        await requestWakeLock();
    }
}

async function connect() {
    const ip = ipInput.value.trim();
    if (!ip) {
        setStatus("IP adresini gir.");
        return;
    }

    connectButton.disabled = true;
    setStatus("Bağlanıyor...");

    if (socket) socket.close();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${ip}:8765`);

    socket.addEventListener("open", async () => {
        saveIp(ip);
        setStatus("Bağlandı");
        connectScreen.classList.add("hidden");
        trackpadScreen.classList.remove("hidden");
        await requestWakeLock();
    });

    socket.addEventListener("close", () => {
        releaseWakeLock();
        connectButton.disabled = false;
        trackpadScreen.classList.add("hidden");
        connectScreen.classList.remove("hidden");
        setStatus("Bağlantı kesildi");
    });

    socket.addEventListener("error", () => {
        connectButton.disabled = false;
        setStatus("Bağlantı başarısız");
    });
}

// Event Listeners
settingsButton.addEventListener("click", () => settingsPanel.classList.remove("hidden"));
closeSettingsButton.addEventListener("click", () => settingsPanel.classList.add("hidden"));

keepScreenAwake.checked = localStorage.getItem(KEEP_SCREEN_AWAKE_KEY) !== "false";
keepScreenAwake.addEventListener("change", async () => {
    localStorage.setItem(KEEP_SCREEN_AWAKE_KEY, String(keepScreenAwake.checked));
    if (keepScreenAwake.checked) {
        await requestWakeLock();
    } else {
        await releaseWakeLock();
    }
});

if (!("wakeLock" in navigator)) {
    wakeLockStatus.textContent = "Bu tarayıcı ekranı açık tutmayı desteklemiyor.";
}

if (mouseSensitivity) {
    mouseSensitivity.addEventListener("input", () => {
        if (!mouseSensitivity.value || !mouseSensitivity.validity.valid) return;
        moveSensitivity = Number(mouseSensitivity.value);
        mouseSensitivityValue.value = `${moveSensitivity}x`;
        localStorage.setItem(MOUSE_SENSITIVITY_KEY, String(moveSensitivity));
    });

    mouseSensitivity.addEventListener("change", () => {
        if (!mouseSensitivity.value || !mouseSensitivity.validity.valid) {
            mouseSensitivity.value = String(moveSensitivity);
        }
    });
}

renderSavedIps();

function openKeyboard() {
    keyboardPanel.classList.remove("hidden");
    keyboardInput.focus();
}

function closeKeyboard() {
    keyboardInput.blur();
    keyboardPanel.classList.add("hidden");
}

keyboardButton.addEventListener("click", openKeyboard);
closeKeyboardButton.addEventListener("click", closeKeyboard);

returnButton.addEventListener("click", () => {
    if (touchState.isDragging) {
        send(JSON.stringify({ type: "drag", value: "end" }));
        touchState.isDragging = false;
    }
    if (socket) socket.close();
});

keyboardInput.addEventListener("input", (event) => {
    if (event.inputType.startsWith("insert")) {
        const text = event.data || keyboardInput.value;
        if (text) sendKeyboardMessage("text", text);
        keyboardInput.value = "";
    }
});

keyboardInput.addEventListener("keydown", (event) => {
    const specialKeys = ["Backspace", "Delete", "Enter", "Tab", "Escape", "Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (event.key === " ") {
        event.preventDefault();
        sendKeyboardMessage("key", "space");
    } else if (specialKeys.includes(event.key)) {
        event.preventDefault();
        sendKeyboardMessage("key", event.key.toLowerCase());
    }
});

function getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function startLongPressTimer() {
    cancelLongPressTimer();
    touchState.longPressFired = false;
    touchState.longPressTimer = setTimeout(() => {
        if (!touchState.moved && touchState.count === 1) {
            send("right");
            touchState.longPressFired = true;
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }, LONG_PRESS_TIME);
}

function cancelLongPressTimer() {
    if (touchState.longPressTimer) {
        clearTimeout(touchState.longPressTimer);
        touchState.longPressTimer = null;
    }
}

// ========== SCROLL ZONE - SADECE SCROLL ==========
scrollZone.addEventListener("touchstart", (event) => {
    event.preventDefault();
    event.stopPropagation(); // Trackpad'e geçmesini engelle
    
    const touch = event.touches[0];
    scrollState.lastY = touch.clientY;
    scrollState.isActive = true;
    
    // Görsel geri bildirim
    scrollZone.style.background = "rgba(99, 102, 241, 0.3)";
}, { passive: false });

scrollZone.addEventListener("touchmove", (event) => {
    event.preventDefault();
    event.stopPropagation(); // Trackpad'e geçmesini engelle[cite: 2]
    
    const touch = event.touches[0];
    const dy = touch.clientY - scrollState.lastY;
    
    // Eşik değerini daha makul bir seviyeye çekiyoruz (örn. 8 piksel)
    if (Math.abs(dy) > 8) {
        const direction = dy > 0 ? -1 : 1;
        send(`scroll,${direction * scrollSensMultiplier}`);
        
        // Hatanın çözümü: lastY değerini SADECE şart sağlandıktan sonra güncelliyoruz!
        scrollState.lastY = touch.clientY;
    }
}, { passive: false });

scrollZone.addEventListener("touchend", (event) => {
    event.preventDefault();
    event.stopPropagation();
    scrollState.isActive = false;
    scrollZone.style.background = "rgba(99, 102, 241, 0.15)";
}, { passive: false });

scrollZone.addEventListener("touchcancel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    scrollState.isActive = false;
    scrollZone.style.background = "rgba(99, 102, 241, 0.15)";
}, { passive: false });

// ========== TRACKPAD - MOUSE + ZOOM ==========
trackpad.addEventListener("touchstart", (event) => {
    event.preventDefault();
    const touches = event.touches;
    
    touchState.count = touches.length;
    touchState.startTime = performance.now();
    touchState.moved = false;
    
    if (touches.length === 1) {
        const t = touches[0];
        touchState.startX = t.clientX;
        touchState.startY = t.clientY;
        touchState.lastX = t.clientX;
        touchState.lastY = t.clientY;
        
        if (touchState.isDragging) {
            // Sürükleme devam ediyor
        } else {
            startLongPressTimer();
        }
    }
    
    if (touches.length === 2) {
        cancelLongPressTimer();
        touchState.lastPinchDist = getDistance(touches[0], touches[1]);
    }
}, { passive: false });

trackpad.addEventListener("touchmove", (event) => {
    event.preventDefault();
    const touches = event.touches;
    
    if (touches.length === 1) {
        const t = touches[0];
        const dx = t.clientX - touchState.lastX;
        const dy = t.clientY - touchState.lastY;
        
        const totalDx = t.clientX - touchState.startX;
        const totalDy = t.clientY - touchState.startY;
        
        if (Math.abs(totalDx) > MOVE_THRESHOLD || Math.abs(totalDy) > MOVE_THRESHOLD) {
            touchState.moved = true;
            cancelLongPressTimer();
        }
        
        if (dx !== 0 || dy !== 0) {
            send(`${dx * moveSensitivity},${dy * moveSensitivity}`);
        }
        
        touchState.lastX = t.clientX;
        touchState.lastY = t.clientY;
    }
    
    if (touches.length === 2) {
        const currentDist = getDistance(touches[0], touches[1]);
        const distDiff = currentDist - touchState.lastPinchDist;
        
        if (Math.abs(distDiff) > PINCH_THRESHOLD) {
            touchState.moved = true;
            
            if (distDiff > 0) {
                send(JSON.stringify({ type: "zoom", value: 1 }));
            } else {
                send(JSON.stringify({ type: "zoom", value: -1 }));
            }
            
            touchState.lastPinchDist = currentDist;
        }
    }
}, { passive: false });

trackpad.addEventListener("touchend", (event) => {
    event.preventDefault();
    const remainingTouches = event.touches.length;
    
    cancelLongPressTimer();
    
    if (remainingTouches === 0) {
        if (touchState.isDragging) {
            send(JSON.stringify({ type: "drag", value: "end" }));
            touchState.isDragging = false;
        }
        
        if (!touchState.moved && !touchState.longPressFired) {
            if (touchState.count === 1) {
                const now = performance.now();
                const timeSinceLastTap = now - touchState.lastTapTime;
                
                if (timeSinceLastTap < DOUBLE_TAP_TIME && timeSinceLastTap > 0) {
                    send(JSON.stringify({ type: "drag", value: "start" }));
                    touchState.isDragging = true;
                    touchState.lastTapTime = 0;
                    if (navigator.vibrate) navigator.vibrate(30);
                } else {
                    send("left");
                    touchState.lastTapTime = now;
                }
            }
        }
        
        touchState.count = 0;
        touchState.moved = false;
        touchState.longPressFired = false;
    }
}, { passive: false });

trackpad.addEventListener("touchcancel", (event) => {
    event.preventDefault();
    cancelLongPressTimer();
    
    if (touchState.isDragging) {
        send(JSON.stringify({ type: "drag", value: "end" }));
        touchState.isDragging = false;
    }
    
    touchState.count = 0;
    touchState.moved = false;
    touchState.longPressFired = false;
}, { passive: false });

// Global Events
document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (event) => event.preventDefault(), { passive: false });
document.addEventListener("gestureend", (event) => event.preventDefault(), { passive: false });

document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
        await reconnectWakeLock();
    }
});

window.addEventListener("pageshow", async () => {
    await reconnectWakeLock();
});

connectButton.addEventListener("click", connect);

ipInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        connect();
    }
});

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js")
            .catch(error => {
                console.log("Service Worker kayıt hatası:", error);
            });
    });
}