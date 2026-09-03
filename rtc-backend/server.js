const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json()); // <-- CRITICAL: Required to parse JSON request bodies

// Mock authentication database storage for demo purposes
const usersDb = {};

// Authentication Endpoints
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (usersDb[username]) {
    return res.status(400).json({ error: "Username already exists" });
  }
  usersDb[username] = password;
  return res.json({ token: `token_${Date.now()}`, username });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (usersDb[username] && usersDb[username] !== password) {
    return res.status(401).json({ error: "Invalid password" });
  }
  // Allow login if user exists or auto-register for ease of testing
  usersDb[username] = password;
  return res.json({ token: `token_${Date.now()}`, username });
});

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
        isAudioMuted: Boolean(socketRoomMap[id]?.isAudioMuted),
        isVideoMuted: Boolean(socketRoomMap[id]?.isVideoMuted),
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

  socket.on("media-state-change", (data) => {
    if (socketRoomMap[socket.id]) {
      socketRoomMap[socket.id].isAudioMuted = Boolean(data.isAudioMuted);
      socketRoomMap[socket.id].isVideoMuted = Boolean(data.isVideoMuted);
    }

    const payload = {
      socketId: socket.id,
      username: socketRoomMap[socket.id]?.username || socket.username || "Peer",
      isAudioMuted: Boolean(data.isAudioMuted),
      isVideoMuted: Boolean(data.isVideoMuted),
    };
    socket.to(data.roomId).emit("media-state-change", payload);
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