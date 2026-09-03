// const express = require("express");
// const http = require("http");
// const { Server } = require("socket.io");
// const cors = require("cors");
// const jwt = require("jsonwebtoken");
// const bcrypt = require("bcryptjs");
// require("dotenv").config();

// const app = express();
// app.use(express.json());
// app.use(cors());

// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: "*",
//     methods: ["GET", "POST"],
//   },
// });

// const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

// // In-Memory Database
// const usersDB = {}; // username -> { passwordHash, username }
// const roomData = {}; // roomId -> { users: [], drawings: [], files: [] }

// // --- AUTHENTICATION ROUTES ---

// app.post("/api/register", async (req, res) => {
//   const { username, password } = req.body;
//   if (!username || !password) {
//     return res.status(400).json({ error: "Username and password required" });
//   }
//   if (usersDB[username]) {
//     return res.status(400).json({ error: "User already exists" });
//   }

//   const passwordHash = await bcrypt.hash(password, 10);
//   usersDB[username] = { username, passwordHash };

//   const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "12h" });
//   res.json({ token, username });
// });

// app.post("/api/login", async (req, res) => {
//   const { username, password } = req.body;
//   const user = usersDB[username];
//   if (!user) {
//     return res.status(401).json({ error: "Invalid credentials" });
//   }

//   const isValid = await bcrypt.compare(password, user.passwordHash);
//   if (!isValid) {
//     return res.status(401).json({ error: "Invalid credentials" });
//   }

//   const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "12h" });
//   res.json({ token, username });
// });

// // --- SOCKET.IO AUTHENTICATION MIDDLEWARE ---

// io.use((socket, next) => {
//   const token = socket.handshake.auth?.token;
//   if (!token) {
//     return next(new Error("Authentication token required"));
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     socket.user = decoded;
//     next();
//   } catch (err) {
//     next(new Error("Invalid or expired authentication token"));
//   }
// });

// // --- REAL-TIME SIGNALING & DATA SYNC ---

// io.on("connection", (socket) => {
//   console.log(`Authenticated user connected: ${socket.user.username} (${socket.id})`);

//   socket.on("join-room", (roomId) => {
//     socket.join(roomId);
//     socket.roomId = roomId;

//     if (!roomData[roomId]) {
//       roomData[roomId] = {
//         users: [],
//         drawings: [],
//         files: [],
//       };
//     }

//     const room = roomData[roomId];
//     if (!room.users.some((u) => u.socketId === socket.id)) {
//       room.users.push({ socketId: socket.id, username: socket.user.username });
//     }

//     const otherUsers = room.users.filter((u) => u.socketId !== socket.id);

//     // Send existing users list and room history to joining user
//     socket.emit("all-users", otherUsers);
//     socket.emit("room-history", {
//       drawings: room.drawings,
//       files: room.files,
//     });

//     // Notify other users in the room
//     socket.to(roomId).emit("user-connected", {
//       socketId: socket.id,
//       username: socket.user.username,
//     });
//   });

//   // Native WebRTC Mesh Signaling
//   socket.on("offer", ({ target, callerUsername, sdp }) => {
//     io.to(target).emit("offer", {
//       callerId: socket.id,
//       callerUsername: callerUsername || socket.user.username,
//       sdp,
//     });
//   });

//   socket.on("answer", ({ target, sdp }) => {
//     io.to(target).emit("answer", {
//       callerId: socket.id,
//       sdp,
//     });
//   });

//   socket.on("ice-candidate", ({ target, candidate }) => {
//     io.to(target).emit("ice-candidate", {
//       callerId: socket.id,
//       candidate,
//     });
//   });

//   // Whiteboard Synchronizer
//   socket.on("draw-line", ({ roomId, drawData }) => {
//     if (roomData[roomId]) {
//       roomData[roomId].drawings.push(drawData);
//     }
//     socket.to(roomId).emit("draw-line", drawData);
//   });

//   socket.on("clear-canvas", (roomId) => {
//     if (roomData[roomId]) {
//       roomData[roomId].drawings = [];
//     }
//     io.to(roomId).emit("clear-canvas");
//   });

//   // File Sharing Broadcaster
//   socket.on("send-file", ({ roomId, fileObj }) => {
//     if (roomData[roomId]) {
//       roomData[roomId].files.push(fileObj);
//     }
//     socket.to(roomId).emit("receive-file", fileObj);
//   });

//   // Disconnect Handling
//   socket.on("disconnect", () => {
//     const roomId = socket.roomId;
//     if (roomId && roomData[roomId]) {
//       roomData[roomId].users = roomData[roomId].users.filter((u) => u.socketId !== socket.id);
      
//       // Clean empty rooms to prevent memory leaks
//       if (roomData[roomId].users.length === 0) {
//         delete roomData[roomId];
//       } else {
//         socket.to(roomId).emit("user-left", socket.id);
//       }
//     }
//     console.log(`User disconnected: ${socket.user.username} (${socket.id})`);
//   });
// });

// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//   console.log(`Secure SyncSpace Backend active on port ${PORT}`);
// });




const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Track socket to room & username mapping
const socketRoomMap = {};

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    socketRoomMap[socket.id] = { roomId };

    // Get all other connected clients in room
    const clientsInRoom = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const otherUsers = clientsInRoom
      .filter((id) => id !== socket.id)
      .map((id) => ({
        socketId: id,
        username: socketRoomMap[id]?.username || "Peer",
      }));

    socket.emit("all-users", otherUsers);
    socket.to(roomId).emit("user-connected", {
      socketId: socket.id,
      username: socketRoomMap[socket.id]?.username || "Peer",
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

  // Explicit User Leave Event
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

  // Unexpected Disconnect Event (App closed / Mobile network drop)
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    handleUserLeave(socket.id);
  });
});

server.listen(5000, () => console.log("Signaling Server running on port 5000"));