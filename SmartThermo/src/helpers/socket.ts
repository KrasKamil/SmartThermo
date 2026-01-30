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
    console.log("✅ Socket.io zainicjowany!");
    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("❌ Socket.io nie został zainicjowany! Wywołaj initSocket w server.ts");
    }
    return io;
};