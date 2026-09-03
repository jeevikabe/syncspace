const express = require("express");
const http = http = require("http"); // or standard http setup
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Track socket details including username and media states
const socketRoomMap = {};

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);
    socketRoomMap[socket.id] = { 
      roomId, 
      username: username || "Peer",
      isAudioMuted: false,
      isVideoMuted: false 
    };

    const clientsInRoom = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const otherUsers = clientsInRoom
      .filter((id) => id !== socket.id)
      .map((id) => ({
        socketId: id,
        username: socketRoomMap[id]?.username || "Peer",
        isAudioMuted: socketRoomMap[id]?.isAudioMuted || false,
        isVideoMuted: socketRoomMap[id]?.isVideoMuted || false,
      }));

    socket.emit("all-users", otherUsers);
    socket.to(roomId).emit("user-connected", {
      socketId: socket.id,
      username: socketRoomMap[socket.id].username,
      isAudioMuted: false,
      isVideoMuted: false,
    });
  });

  socket.on("offer", ({ target, callerUsername, sdp }) => {
    io.to(target).emit("offer", { callerId: socket.id, callerUsername, sdp });
  });

  socket.on("answer", ({ target, sdp }) => {
    io.to(target).emit("answer", { callerId: socket.id, sdp });
  });

  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate", { callerId: socket.id, candidate });
  });

  socket.on("media-state-change", ({ roomId, isAudioMuted, isVideoMuted }) => {
    if (socketRoomMap[socket.id]) {
      socketRoomMap[socket.id].isAudioMuted = isAudioMuted;
      socketRoomMap[socket.id].isVideoMuted = isVideoMuted;
    }

    socket.to(roomId).emit("media-state-change", {
      socketId: socket.id,
      isAudioMuted,
      isVideoMuted,
    });
  });

  socket.on("draw-line", ({ roomId, drawData }) => {
    socket.to(roomId).emit("draw-line", drawData);
  });

  socket.on("clear-canvas", (roomId) => {
    socket.to(roomId).emit("clear-canvas");
  });

  socket.on("send-file", ({ roomId, fileObj }) => {
    socket.to(roomId).emit("receive-file", fileObj);
  });

  const handleUserLeave = (socketId) => {
    const userInfo = socketRoomMap[socketId];
    if (userInfo) {
      const { roomId } = userInfo;
      socket.to(roomId).emit("user-left", socketId);
      delete socketRoomMap[socketId];
      socket.leave(roomId);
    }
  };

  socket.on("leave-room", () => {
    handleUserLeave(socket.id);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    handleUserLeave(socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Signaling Server running on port ${PORT}`));