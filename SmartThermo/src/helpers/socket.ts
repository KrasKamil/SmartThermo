// src/helpers/socket.ts
import { Server } from "socket.io";
import http from "http";

let io: Server | null = null;

export const initSocket = (server: http.Server) => {
    // Inicjalizacja Socket.io z włączonym CORS (aby frontend mógł się łączyć)
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    io.on("connection", (socket) => {
        const auth = socket.handshake.auth || {};
        const target = auth.device;
        if (target === "gate" || target === "wicket") {
            const deviceKey = target === "gate"
                ? process.env.INTERCOM_GATE_KEY
                : process.env.INTERCOM_WICKET_KEY;
            if (!deviceKey || auth.apiKey !== deviceKey) {
                socket.disconnect(true);
                return;
            }

            const room = `intercom:device:${target}`;
            socket.join(room);
            io?.emit("doorbell:device:availability", {
                target,
                available: (io?.sockets.adapter.rooms.get(room)?.size || 0) === 1,
                status: (io?.sockets.adapter.rooms.get(room)?.size || 0) === 1 ? "ready" : "multiple_devices",
                timestamp: Date.now()
            });
            socket.on("disconnect", () => {
                setTimeout(() => {
                    const count = io?.sockets.adapter.rooms.get(room)?.size || 0;
                    io?.emit("doorbell:device:availability", {
                        target,
                        available: count === 1,
                        status: count === 0 ? "not_configured" : count === 1 ? "ready" : "multiple_devices",
                        timestamp: Date.now()
                    });
                }, 0);
            });
        } else if (target !== undefined) {
            socket.disconnect(true);
        }
    });
    console.log("✅ Socket.io zainicjowany!");
    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("❌ Socket.io nie został zainicjowany! Wywołaj initSocket w server.ts");
    }
    return io;
};