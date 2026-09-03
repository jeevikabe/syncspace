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

// function VideoPlayer({ stream, username, isSelf = false, isScreen = false, isVideoMuted = false, isAudioMuted = false }) {
//   const videoRef = useRef(null);

//   useEffect(() => {
//     const videoObj = videoRef.current;
//     if (videoObj && stream) {
//       videoObj.srcObject = stream;
      
//       const playPromise = videoObj.play();
//       if (playPromise !== undefined) {
//         playPromise.catch((e) => {
//           console.warn("Autoplay block / playback error, attempting muted fallback:", e);
//           videoObj.muted = true;
//           videoObj.play().catch((err) => console.error("Video play completely blocked:", err));
//         });
//       }
//     }
//   }, [stream]);

//   const cleanName = (username || "User").replace(" ( You )", "").trim();
//   const initial = cleanName ? cleanName.charAt(0).toUpperCase() : "U";

//   return (
//     <div className="video-card-element">
//       <div className="video-header">
//         <div className="video-badge">
//           <span className="online-dot"></span>
//           <span>{username || "Peer"}</span>
//         </div>
//         {isScreen && <span className="screen-badge">Sharing Screen</span>}
//       </div>

//       <div className={`mic-status-overlay ${isAudioMuted ? "muted" : ""}`}>
//         {isAudioMuted ? <MicOff size={14} color="#ffffff" /> : <Mic size={14} color="#10b981" />}
//       </div>

//       <video
//         ref={videoRef}
//         autoPlay
//         playsInline
//         webkit-playsinline="true"
//         muted={isSelf}
//         style={{ display: isVideoMuted ? "none" : "block" }}
//         className={isScreen ? "screen-stream" : "video-stream"}
//       />

//       {isVideoMuted && (
//         <div className="avatar-fallback">
//           <div className="avatar-circle">{initial}</div>
//           <span className="avatar-name">{username || "Peer"}</span>
//         </div>
//       )}
//     </div>
//   );
// }


function VideoPlayer({ stream, username, isSelf = false, isScreen = false, isVideoMuted = false, isAudioMuted = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoObj = videoRef.current;
    if (videoObj && stream) {
      videoObj.srcObject = stream;

      const playPromise = videoObj.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          console.warn("Autoplay block / playback error, attempting muted fallback:", e);
          videoObj.muted = true;
          videoObj.play().catch((err) => console.error("Video play completely blocked:", err));
        });
      }
    }
  }, [stream]);

  const videoTracks = stream?.getVideoTracks?.() ?? [];
  const audioTracks = stream?.getAudioTracks?.() ?? [];

  const effectiveVideoMuted =
    isVideoMuted ||
    videoTracks.some((track) => track.readyState === "live" && track.enabled === false) ||
    videoTracks.length === 0;

  const effectiveAudioMuted =
    isAudioMuted ||
    audioTracks.some((track) => track.readyState === "live" && track.enabled === false) ||
    audioTracks.length === 0;

  const cleanName = (username || "User").replace(" ( You )", "").trim();
  const initial = cleanName ? cleanName.charAt(0).toUpperCase() : "U";

  return (
    <div className="video-card-element">
      <div className="video-header">
        <div className="video-badge">
          <span className="online-dot"></span>
          <span>{username || "Peer"}</span>
        </div>
        {isScreen && <span className="screen-badge">Sharing Screen</span>}
      </div>

      <div className={`mic-status-overlay ${effectiveAudioMuted ? "muted" : ""}`}>
        {effectiveAudioMuted ? <MicOff size={14} color="#ffffff" /> : <Mic size={14} color="#10b981" />}
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        webkit-playsinline="true"
        muted={isSelf}
        style={{ display: effectiveVideoMuted ? "none" : "block" }}
        className={isScreen ? "screen-stream" : "video-stream"}
      />

      {effectiveVideoMuted && (
        <div className="avatar-fallback">
          <div className="avatar-circle">{initial}</div>
          <span className="avatar-name">{username || "Peer"}</span>
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
  
  const [notification, setNotification] = useState("");
  
  const [activeTab, setActiveTab] = useState("whiteboard");
  const [mobileView, setMobileView] = useState("video"); 
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const [remoteStreams, setRemoteStreams] = useState({});

  const socketRef = useRef();
  const peerConnections = useRef({});
  const cameraStreamRef = useRef(null);
  const currentStreamRef = useRef(null);

  const canvasRef = useRef();
  const offscreenCanvasRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const checkMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobileDevice(checkMobile);
  }, []);

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const handleBackButton = () => {
      if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        document.activeElement.blur();
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener("popstate", handleBackButton);
    return () => window.removeEventListener("popstate", handleBackButton);
  }, []);

  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      const off = document.createElement("canvas");
      off.width = 600;
      off.height = 500;
      offscreenCanvasRef.current = off;
    }
  }, []);

  useEffect(() => {
    if (activeTab === "whiteboard" && canvasRef.current && offscreenCanvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.drawImage(offscreenCanvasRef.current, 0, 0);
    }
  }, [activeTab]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    const endpoint = isRegistering ? "/api/register" : "/api/login";

    try {
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authInputUser, password: authInputPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");

      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.username);
      setToken(data.token);
      setUsername(data.username);
    } catch (err) {
      setAuthError(err.message);
    }
  };

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

    socketRef.current.on("connect_error", (err) => {
      console.error("Socket Auth Error:", err.message);
      confirmLogout();
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [token]);

  const addFileToState = (fileObj) => {
    setReceivedFiles((prev) => {
      if (prev.some((f) => f.id === fileObj.id)) return prev;
      const blob = new Blob([fileObj.fileData], { type: fileObj.fileType });
      const url = URL.createObjectURL(blob);
      return [...prev, { ...fileObj, url, isImage: fileObj.fileType.startsWith("image/") }];
    });
  };

  const removePeer = (targetSocketId) => {
    if (peerConnections.current[targetSocketId]) {
      peerConnections.current[targetSocketId].close();
      delete peerConnections.current[targetSocketId];
    }
    
    setRemoteStreams((prev) => {
      const updated = { ...prev };
      if (updated[targetSocketId]?.stream) {
        updated[targetSocketId].stream.getTracks().forEach((track) => track.stop());
      }
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
      if (event.candidate && socketRef.current) {
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

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === "disconnected" || 
        pc.iceConnectionState === "failed" || 
        pc.iceConnectionState === "closed"
      ) {
        removePeer(targetSocketId);
      }
    };

    return pc;
  };

  const leaveRoom = () => {
    if (socketRef.current && joined) {
      socketRef.current.emit("leave-room", roomId);
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
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: "user"
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
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
      socket.off("media-state-change");
      socket.off("draw-line");
      socket.off("clear-canvas");
      socket.off("receive-file");

      socket.on("all-users", async (users) => {
        for (const u of users) {
          setRemoteStreams((prev) => ({
            ...prev,
            [u.socketId]: {
              ...(prev[u.socketId] || {}),
              username: u.username || "Peer",
            },
          }));

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
        setRemoteStreams((prev) => ({
          ...prev,
          [socketId]: {
            ...(prev[socketId] || {}),
            username: newUsername || "Peer",
          },
        }));
        createPeerConnection(socketId, newUsername);
      });

      socket.on("offer", async ({ callerId, callerUsername, sdp }) => {
        if (callerId) {
          setRemoteStreams((prev) => ({
            ...prev,
            [callerId]: {
              ...(prev[callerId] || {}),
              username: callerUsername || "Peer",
            },
          }));
        }

        const pc = createPeerConnection(callerId, callerUsername);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
          target: callerId,
          sdp: pc.localDescription,
        });
      });

      socket.on("answer", async ({ callerId, sdp }) => {
        const pc = peerConnections.current[callerId];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
      });

      socket.on("ice-candidate", async ({ callerId, candidate }) => {
        const pc = peerConnections.current[callerId];
        if (pc && candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("Error adding ice candidate", e);
          }
        }
      });

      socket.on("media-state-change", (data) => {
        const targetId = data.socketId || data.userId;
        if (!targetId) return;

        setRemoteStreams((prev) => {
          const existing = prev[targetId] || {};
          return {
            ...prev,
            [targetId]: {
              ...existing,
              ...(data.isAudioMuted !== undefined && { isAudioMuted: data.isAudioMuted }),
              ...(data.isVideoMuted !== undefined && { isVideoMuted: data.isVideoMuted }),
            },
          };
        });
      });

      socket.on("user-left", (socketId) => {
        setRemoteStreams((prev) => {
          const leftPeerName = prev[socketId]?.username || "A participant";
          setNotification(`${leftPeerName} left the meeting`);
          setTimeout(() => setNotification(""), 4000);
          return prev;
        });
        removePeer(socketId);
      });

      socket.on("draw-line", (draw) => drawLineOnCanvas(draw.x0, draw.y0, draw.x1, draw.y1, draw.color, false));
      socket.on("clear-canvas", () => clearCanvas(false));
      socket.on("receive-file", (fileObj) => addFileToState(fileObj));

    } catch (err) {
      console.error("Failed to access camera/mic:", err);
      alert("Please allow camera and microphone permissions to join.");
    }
  };

  const toggleAudio = () => {
    const track = currentStreamRef.current?.getAudioTracks()[0];
    if (track) {
      const nextState = !audioMuted;
      track.enabled = !nextState;
      setAudioMuted(nextState);

      if (socketRef.current) {
        socketRef.current.emit("media-state-change", { roomId, isAudioMuted: nextState });
      }
    }
  };

  const toggleVideo = () => {
    const track = currentStreamRef.current?.getVideoTracks()[0];
    if (track) {
      const nextState = !videoMuted;
      track.enabled = !nextState;
      setVideoMuted(nextState);

      if (socketRef.current) {
        socketRef.current.emit("media-state-change", { roomId, isVideoMuted: nextState });
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        if (isMobileDevice) {
          alert("Screen sharing is restricted on mobile browsers. Please use camera sharing instead.");
          return;
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        for (const peerId of Object.keys(peerConnections.current)) {
          const pc = peerConnections.current[peerId];
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
          if (sender) {
            await sender.replaceTrack(screenTrack);
          }
        }

        const combinedStream = new MediaStream([
          screenTrack,
          ...cameraStreamRef.current.getAudioTracks(),
        ]);
        currentStreamRef.current = combinedStream;
        setLocalStream(combinedStream);
        setIsScreenSharing(true);

        screenTrack.onended = () => stopScreenShare();
      } catch (err) {
        console.error("Screen sharing error:", err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = async () => {
    const cameraVideoTrack = cameraStreamRef.current?.getVideoTracks()[0];

    if (cameraVideoTrack) {
      for (const peerId of Object.keys(peerConnections.current)) {
        const pc = peerConnections.current[peerId];
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          await sender.replaceTrack(cameraVideoTrack);
        }
      }
    }

    currentStreamRef.current = cameraStreamRef.current;
    setLocalStream(cameraStreamRef.current);
    setIsScreenSharing(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const fileObj = {
        id: `${file.name}-${Date.now()}`,
        fileName: file.name,
        fileType: file.type,
        fileData: reader.result,
        sender: username,
      };

      if (socketRef.current && joined) {
        socketRef.current.emit("send-file", { roomId, fileObj });
      }
      addFileToState(fileObj);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const getCanvasCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    isDrawing.current = true;
    const coords = getCanvasCoords(e);
    canvasRef.current.lastX = coords.x;
    canvasRef.current.lastY = coords.y;
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const coords = getCanvasCoords(e);
    const { lastX, lastY } = canvasRef.current;

    drawLineOnCanvas(lastX, lastY, coords.x, coords.y, "#38bdf8", true);
    canvasRef.current.lastX = coords.x;
    canvasRef.current.lastY = coords.y;
  };

  const drawLineOnCanvas = (x0, y0, x1, y1, color, emit) => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.closePath();
    }

    if (offscreenCanvasRef.current) {
      const offCtx = offscreenCanvasRef.current.getContext("2d");
      offCtx.beginPath();
      offCtx.moveTo(x0, y0);
      offCtx.lineTo(x1, y1);
      offCtx.strokeStyle = color;
      offCtx.lineWidth = 3;
      offCtx.lineCap = "round";
      offCtx.stroke();
      offCtx.closePath();
    }

    if (emit && socketRef.current) {
      socketRef.current.emit("draw-line", { roomId, drawData: { x0, y0, x1, y1, color } });
    }
  };

  const clearCanvas = (emit = true) => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    if (offscreenCanvasRef.current) {
      const offCtx = offscreenCanvasRef.current.getContext("2d");
      offCtx.clearRect(0, 0, offscreenCanvasRef.current.width, offscreenCanvasRef.current.height);
    }
    if (emit && socketRef.current) {
      socketRef.current.emit("clear-canvas", roomId);
    }
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-glow"></div>
        <div className="auth-card">
          <div className="auth-header">
            <div className="logo-icon"><Zap size={24} color="#38bdf8" /></div>
            <h2 className="auth-title">SyncSpace Studio</h2>
            <p className="auth-subtitle">Encrypted Collaboration & Video Portal</p>
          </div>

          {authError && <div className="error-box">{authError}</div>}

          <form onSubmit={handleAuth} className="form-stack">
            <div className="input-group">
              <label className="label">Username</label>
              <input
                type="text"
                placeholder="Enter username"
                value={authInputUser}
                onChange={(e) => setAuthInputUser(e.target.value)}
                className="input"
                required
              />
            </div>

            <div className="input-group">
              <label className="label">Password</label>
              <div style={{ position: "relative", width: "100%" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={authInputPass}
                  onChange={(e) => setAuthInputPass(e.target.value)}
                  className="input"
                  style={{ width: "100%", paddingRight: "40px" }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="eye-btn"
                >
                  {showPassword ? <EyeOff size={18} color="#94a3b8" /> : <Eye size={18} color="#94a3b8" />}
                </button>
              </div>
            </div>

            <button type="submit" className="primary-auth-btn">
              {isRegistering ? "Create Account" : "Sign In to Studio"}
            </button>

            <div className="toggle-text" onClick={() => setIsRegistering(!isRegistering)}>
              {isRegistering ? "Already have an account? Sign In" : "Need workspace access? Register"}
            </div>
          </form>

          <div className="security-badge">
            <ShieldCheck size={14} color="#10b981" /> End-to-End DTLS-SRTP Encrypted
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <header className="navbar-container">
        <div className="brand-group">
          <div className="logo-icon-small"><Zap size={18} color="#38bdf8" /></div>
          <span className="brand-title">SyncSpace <span className="brand-highlight">Studio</span></span>
        </div>

        {joined && (
          <div className="room-status-badge">
            <span className="online-dot"></span> Room: <strong style={{ color: "#fff" }}>{roomId}</strong>
          </div>
        )}

        <div className="user-controls">
          <div className="user-pill">
            <User size={14} color="#a1a1aa" />
            <span className="user-name">{username}</span>
          </div>
          <button onClick={() => setShowLogoutDialog(true)} className="logout-btn" title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {notification && (
        <div className="teams-toast-banner">
          <AlertTriangle size={16} color="#f59e0b" />
          <span>{notification}</span>
        </div>
      )}

      {showLogoutDialog && (
        <div className="dialog-overlay">
          <div className="dialog-card">
            <div className="dialog-header">
              <AlertTriangle size={24} color="#f59e0b" />
              <h3 className="dialog-title">Confirm Logout</h3>
            </div>
            <p className="dialog-text">
              Are you sure you want to logout? This will disconnect your media stream and end active sessions.
            </p>
            <div className="dialog-actions">
              <button onClick={() => setShowLogoutDialog(false)} className="cancel-btn">
                Cancel
              </button>
              <button onClick={confirmLogout} className="confirm-logout-btn">
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {!joined ? (
        <main className="hero-container">
          <div className="hero-card">
            <h1 className="hero-title">Join Video Session</h1>
            <p className="hero-desc">Enter or create a conference room key to connect with your team.</p>

            <div className="join-input-stack">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="e.g. room-101"
                className="hero-input"
              />
              <button onClick={joinRoom} className="hero-join-btn">
                Launch Session
              </button>
            </div>
          </div>
        </main>
      ) : (
        <>
          <div className="mobile-bar-switch">
            <button
              className={`mobile-switch-btn ${mobileView === 'video' ? 'active' : ''}`}
              onClick={() => setMobileView('video')}
            >
              <Video size={14} /> Stage
            </button>
            <button
              className={`mobile-switch-btn ${mobileView === 'suite' ? 'active' : ''}`}
              onClick={() => setMobileView('suite')}
            >
              <Layout size={14} /> Workspace
            </button>
          </div>

          <div className={`workspace-layout ${mobileView === 'video' ? 'show-video' : 'show-suite'}`}>
            <div className="stage-area">
              <div className="video-grid">
                <VideoPlayer
                  stream={localStream}
                  username={`${username} ( You )`}
                  isSelf={true}
                  isScreen={isScreenSharing}
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
                <button
                  onClick={toggleAudio}
                  className={audioMuted ? "dock-btn-muted" : "dock-btn-active"}
                  title={audioMuted ? "Unmute Mic" : "Mute Mic"}
                >
                  {audioMuted ? <MicOff size={20} color="#fca5a5" /> : <Mic size={20} color="#f8fafc" />}
                </button>

                <button
                  onClick={toggleVideo}
                  className={videoMuted ? "dock-btn-muted" : "dock-btn-active"}
                  title={videoMuted ? "Start Video" : "Stop Video"}
                >
                  {videoMuted ? <VideoOff size={20} color="#fca5a5" /> : <Video size={20} color="#f8fafc" />}
                </button>

                <button
                  onClick={toggleScreenShare}
                  className={isScreenSharing ? "dock-btn-sharing" : "dock-btn-active"}
                  title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
                >
                  {isScreenSharing ? <StopCircle size={20} color="#fef08a" /> : <ScreenShare size={20} color="#f8fafc" />}
                </button>

                <label className="dock-btn-upload" title="Share File">
                  <Paperclip size={20} color="#f8fafc" />
                  <input type="file" onChange={handleFileUpload} style={{ display: "none" }} />
                </label>

                <button
                  onClick={leaveRoom}
                  className="dock-btn-leave"
                  title="Leave Room"
                >
                  <PhoneOff size={18} color="#ffffff" />
                  <span className="leave-text">Leave</span>
                </button>
              </div>
            </div>

            <aside className="side-suite">
              <div className="tab-header">
                <button
                  onClick={() => setActiveTab("whiteboard")}
                  className={activeTab === "whiteboard" ? "tab-btn-active" : "tab-btn"}
                >
                  <Edit3 size={16} /> Whiteboard
                </button>
                <button
                  onClick={() => setActiveTab("files")}
                  className={activeTab === "files" ? "tab-btn-active" : "tab-btn"}
                >
                  <FileText size={16} /> Files ({receivedFiles.length})
                </button>
              </div>

              <div className="tab-body">
                <div style={{ display: activeTab === "whiteboard" ? "flex" : "none", flexDirection: "column", height: "100%" }}>
                  <div className="pane-controls">
                    <span className="pane-label">Live Interactive Canvas</span>
                    <button onClick={() => clearCanvas(true)} className="clear-btn">
                      <Trash2 size={14} /> Clear
                    </button>
                  </div>
                  <div className="canvas-wrapper">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={500}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={() => (isDrawing.current = false)}
                      onMouseLeave={() => (isDrawing.current = false)}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={() => (isDrawing.current = false)}
                      className="canvas-element"
                    />
                  </div>
                </div>

                {activeTab === "files" && (
                  <div className="files-pane">
                    <div className="pane-controls">
                      <span className="pane-label">Shared Room Files</span>
                    </div>

                    {receivedFiles.length === 0 ? (
                      <div className="empty-state">No files shared in this room yet.</div>
                    ) : (
                      <div className="file-list">
                        {receivedFiles.map((f) => (
                          <div key={f.id} className="file-card">
                            <div className="file-card-info">
                              <FileText size={18} color="#38bdf8" />
                              <div style={{ overflow: "hidden" }}>
                                <p className="file-name">{f.fileName}</p>
                                <span className="file-meta">From {f.sender || "Peer"}</span>
                              </div>
                            </div>
                            <a href={f.url} download={f.fileName} className="download-link">
                              <Download size={16} />
                            </a>
                            {f.isImage && (
                              <img src={f.url} alt="Shared preview" className="image-preview" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}