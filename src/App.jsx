import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Video,
  Mic,
  MicOff,
  VideoOff,
  ScreenShare,
  StopCircle,
  Paperclip,
  Download,
  Trash2,
  User,
  LogOut,
  Edit3,
  FileText,
  ShieldCheck,
  Zap,
  AlertTriangle,
  PhoneOff,
  Eye,
  EyeOff,
  Layout,
} from "lucide-react";
import "./App.css";

const BACKEND_URL = "https://syncspace-backend-8f4l.onrender.com";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

function VideoPlayer({ stream, username, isSelf = false, isScreen = false, isVideoMuted = false, isAudioMuted = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoObj = videoRef.current;
    if (videoObj && stream) {
      videoObj.srcObject = stream;
      const playPromise = videoObj.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          videoObj.muted = true;
          videoObj.play().catch((e) => console.error("Autoplay failed:", e));
        });
      }
    }
  }, [stream]);

  const rawName = username.replace(" ( You )", "").trim();
  const initial = rawName ? rawName.charAt(0).toUpperCase() : "U";

  return (
    <div className="video-card-element">
      <div className="video-header">
        <div className="video-badge">
          <span className="online-dot"></span>
          <span>{username}</span>
        </div>
        {isScreen && <span className="screen-badge">Sharing Screen</span>}
      </div>

      <div className={`mic-status-overlay ${isAudioMuted ? "muted" : ""}`}>
        {isAudioMuted ? <MicOff size={14} color="#ffffff" /> : <Mic size={14} color="#10b981" />}
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        webkit-playsinline="true"
        muted={isSelf}
        style={{ display: isVideoMuted ? "none" : "block" }}
        className={isScreen ? "screen-stream" : "video-stream"}
      />

      {isVideoMuted && (
        <div className="avatar-fallback">
          <div className="avatar-circle">{initial}</div>
          <span className="avatar-name">{username}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [authInputUser, setAuthInputUser] = useState("");
  const [authInputPass, setAuthInputPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [roomId, setRoomId] = useState("room-1");
  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState([]);
  
  const [activeTab, setActiveTab] = useState("whiteboard");
  const [mobileView, setMobileView] = useState("video");
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const [remoteStreams, setRemoteStreams] = useState({});

  const socketRef = useRef();
  const peerConnections = useRef({});
  const cameraStreamRef = useRef(null);
  const currentStreamRef = useRef(null);
  const canvasRef = useRef();
  const isDrawing = useRef(false);

  useEffect(() => {
    const checkMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobileDevice(checkMobile);
  }, []);

  const confirmLogout = () => {
    leaveRoom();
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setToken("");
    setUsername("");
    setJoined(false);
    setShowLogoutDialog(false);
    if (socketRef.current) socketRef.current.disconnect();
  };

  useEffect(() => {
    if (!token) return;
    socketRef.current = io(BACKEND_URL, { auth: { token } });

    socketRef.current.on("connect_error", () => confirmLogout());

    return () => {
      socketRef.current?.disconnect();
    };
  }, [token]);

  const removePeer = (targetSocketId) => {
    if (peerConnections.current[targetSocketId]) {
      peerConnections.current[targetSocketId].close();
      delete peerConnections.current[targetSocketId];
    }
    setRemoteStreams((prev) => {
      const updated = { ...prev };
      delete updated[targetSocketId];
      return updated;
    });
  };

  const createPeerConnection = (targetSocketId, targetUsername) => {
    if (peerConnections.current[targetSocketId]) {
      return peerConnections.current[targetSocketId];
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current[targetSocketId] = pc;

    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, currentStreamRef.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", {
          target: targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => ({
        ...prev,
        [targetSocketId]: {
          ...prev[targetSocketId],
          username: targetUsername || prev[targetSocketId]?.username || "Peer",
          stream: remoteStream,
        },
      }));
    };

    return pc;
  };

  const leaveRoom = () => {
    if (socketRef.current && joined) {
      socketRef.current.emit("leave-room");
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    Object.keys(peerConnections.current).forEach((id) => removePeer(id));
    setLocalStream(null);
    setJoined(false);
  };

  const joinRoom = async () => {
    try {
      const constraints = {
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraStreamRef.current = stream;
      currentStreamRef.current = stream;
      setLocalStream(stream);
      setJoined(true);

      const socket = socketRef.current;
      socket.emit("join-room", roomId);

      socket.off("all-users");
      socket.off("user-connected");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("user-left");

      socket.on("all-users", async (users) => {
        for (const u of users) {
          const pc = createPeerConnection(u.socketId, u.username);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit("offer", {
            target: u.socketId,
            callerUsername: username,
            sdp: pc.localDescription,
          });
        }
      });

      socket.on("user-connected", ({ socketId, username: newUsername }) => {
        createPeerConnection(socketId, newUsername);
      });

      socket.on("offer", async ({ callerId, callerUsername, sdp }) => {
        const pc = createPeerConnection(callerId, callerUsername);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", { target: callerId, sdp: pc.localDescription });
      });

      socket.on("answer", async ({ callerId, sdp }) => {
        const pc = peerConnections.current[callerId];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      });

      socket.on("ice-candidate", async ({ callerId, candidate }) => {
        const pc = peerConnections.current[callerId];
        if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      });

      // Handle user left (disconnect or leave button click)
      socket.on("user-left", (socketId) => {
        removePeer(socketId);
      });

    } catch (err) {
      alert("Microphone and Camera access are required to join.");
    }
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <h2>SyncSpace Studio</h2>
          <form onSubmit={(e) => e.preventDefault()}>
            <input type="text" placeholder="Username" value={authInputUser} onChange={(e) => setAuthInputUser(e.target.value)} />
            <input type="password" placeholder="Password" value={authInputPass} onChange={(e) => setAuthInputPass(e.target.value)} />
            <button type="submit" onClick={() => setToken("demo-token")}>Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <header className="navbar-container">
        <span>SyncSpace Studio</span>
        <button onClick={confirmLogout}><LogOut size={16} /></button>
      </header>

      {!joined ? (
        <div className="hero-container">
          <input type="text" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          <button onClick={joinRoom}>Join Meeting</button>
        </div>
      ) : (
        <div className="workspace-layout">
          <div className="video-grid">
            <VideoPlayer
              stream={localStream}
              username={`${username} ( You )`}
              isSelf={true}
              isVideoMuted={videoMuted}
              isAudioMuted={audioMuted}
            />
            {Object.entries(remoteStreams).map(([id, remote]) => (
              <VideoPlayer
                key={id}
                stream={remote.stream}
                username={remote.username}
                isSelf={false}
                isVideoMuted={remote.isVideoMuted}
                isAudioMuted={remote.isAudioMuted}
              />
            ))}
          </div>
          <div className="floating-dock">
            <button onClick={leaveRoom} className="dock-btn-leave"><PhoneOff size={18} /></button>
          </div>
        </div>
      )}
    </div>
  );
}