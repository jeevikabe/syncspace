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
  Zap,
  AlertTriangle,
  PhoneOff,
  Eye,
  EyeOff,
} from "lucide-react";
import "./App.css";

const BACKEND_URL = "https://syncspace-backend-8f4l.onrender.com";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function VideoPlayer({
  stream,
  username,
  isSelf = false,
  isScreen = false,
  isVideoMuted = false,
  isAudioMuted = false,
}) {
  const videoRef = useRef(null);
  const [trackMutedState, setTrackMutedState] = useState({
    video: false,
    audio: false,
  });

  useEffect(() => {
    const videoObj = videoRef.current;
    if (videoObj && stream) {
      videoObj.srcObject = stream;
      videoObj.play().catch(() => {
        videoObj.muted = true;
        videoObj.play().catch((err) => console.error("Autoplay blocked:", err));
      });
    }
  }, [stream]);

  // Track native WebRTC mute/unmute events on incoming tracks
  useEffect(() => {
    if (!stream) return;

    const vTrack = stream.getVideoTracks()[0];
    const aTrack = stream.getAudioTracks()[0];

    const syncTrackState = () => {
      setTrackMutedState({
        video: !vTrack || !vTrack.enabled || vTrack.muted,
        audio: !aTrack || !aTrack.enabled || aTrack.muted,
      });
    };

    syncTrackState();

    if (vTrack) {
      vTrack.onmute = syncTrackState;
      vTrack.onunmute = syncTrackState;
      vTrack.onended = syncTrackState;
    }
    if (aTrack) {
      aTrack.onmute = syncTrackState;
      aTrack.onunmute = syncTrackState;
      aTrack.onended = syncTrackState;
    }

    return () => {
      if (vTrack) {
        vTrack.onmute = null;
        vTrack.onunmute = null;
        vTrack.onended = null;
      }
      if (aTrack) {
        aTrack.onmute = null;
        aTrack.onunmute = null;
        aTrack.onended = null;
      }
    };
  }, [stream]);

  const videoTracks = stream?.getVideoTracks?.() ?? [];
  const audioTracks = stream?.getAudioTracks?.() ?? [];

  const effectiveVideoMuted =
    isVideoMuted ||
    !stream ||
    videoTracks.length === 0 ||
    trackMutedState.video ||
    videoTracks.some((t) => !t.enabled || t.muted);

  const effectiveAudioMuted =
    isAudioMuted ||
    !stream ||
    audioTracks.length === 0 ||
    trackMutedState.audio ||
    audioTracks.some((t) => !t.enabled || t.muted);

  const cleanName = (username || "Peer")
    .replace(" ( You )", "")
    .replace(" (You)", "")
    .trim();
  const initial = cleanName ? cleanName.charAt(0).toUpperCase() : "P";

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
        {effectiveAudioMuted ? (
          <MicOff size={14} color="#ffffff" />
        ) : (
          <Mic size={14} color="#10b981" />
        )}
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        style={{ display: effectiveVideoMuted && !isScreen ? "none" : "block" }}
        className={isScreen ? "screen-stream" : "video-stream"}
      />

      {effectiveVideoMuted && !isScreen && (
        <div className="avatar-fallback">
          <div className="avatar-circle">{initial}</div>
          <span className="avatar-name">{cleanName || "Peer"}</span>
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
    setIsMobileDevice(
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
    );
  }, []);

  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      const off = document.createElement("canvas");
      off.width = 600;
      off.height = 500;
      offscreenCanvasRef.current = off;
    }
  }, []);

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
    socketRef.current.on("connect_error", () => confirmLogout());
    return () => socketRef.current?.disconnect();
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
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("ice-candidate", {
          target: targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => {
        const current = prev[targetSocketId] || {};
        return {
          ...prev,
          [targetSocketId]: {
            ...current,
            username: targetUsername || current.username || "Peer",
            stream: remoteStream,
            isAudioMuted: current.isAudioMuted ?? false,
            isVideoMuted: current.isVideoMuted ?? false,
          },
        };
      });
    };

    pc.oniceconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.iceConnectionState)) {
        removePeer(targetSocketId);
      }
    };

    return pc;
  };

  const leaveRoom = () => {
    if (socketRef.current && joined) socketRef.current.emit("leave-room", roomId);
    if (cameraStreamRef.current)
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
    Object.keys(peerConnections.current).forEach((id) => removePeer(id));
    setLocalStream(null);
    setJoined(false);
  };

  const joinRoom = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      cameraStreamRef.current = stream;
      currentStreamRef.current = stream;
      setLocalStream(stream);
      setJoined(true);

      const socket = socketRef.current;
      socket.emit("join-room", { roomId, username });

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
              isAudioMuted: u.isAudioMuted || false,
              isVideoMuted: u.isVideoMuted || false,
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

      socket.on(
        "user-connected",
        ({ socketId, username: newUsername, isAudioMuted, isVideoMuted }) => {
          setRemoteStreams((prev) => ({
            ...prev,
            [socketId]: {
              ...(prev[socketId] || {}),
              username: newUsername || "Peer",
              isAudioMuted: isAudioMuted || false,
              isVideoMuted: isVideoMuted || false,
            },
          }));
          createPeerConnection(socketId, newUsername);
        }
      );

      socket.on("offer", async ({ callerId, callerUsername, sdp }) => {
        setRemoteStreams((prev) => ({
          ...prev,
          [callerId]: {
            ...(prev[callerId] || {}),
            username: callerUsername || "Peer",
          },
        }));
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
        if (pc && candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {}
        }
      });

      socket.on("media-state-change", (data) => {
        const targetId = data.socketId || data.userId || data.id;
        if (!targetId || targetId === socket.id) return;

        setRemoteStreams((prev) => {
          const existing = prev[targetId] || {};
          return {
            ...prev,
            [targetId]: {
              ...existing,
              username: existing.username || data.username || "Peer",
              isAudioMuted: data.isAudioMuted ?? existing.isAudioMuted ?? false,
              isVideoMuted: data.isVideoMuted ?? existing.isVideoMuted ?? false,
            },
          };
        });
      });

      socket.on("user-left", (socketId) => {
        setRemoteStreams((prev) => {
          const name = prev[socketId]?.username || "A participant";
          setNotification(`${name} left the room`);
          setTimeout(() => setNotification(""), 4000);
          return prev;
        });
        removePeer(socketId);
      });

      socket.on("draw-line", (d) =>
        drawLineOnCanvas(d.x0, d.y0, d.x1, d.y1, d.color, false)
      );
      socket.on("clear-canvas", () => clearCanvas(false));
      socket.on("receive-file", (f) => {
        setReceivedFiles((prev) => {
          if (prev.some((item) => item.id === f.id)) return prev;
          const url = URL.createObjectURL(
            new Blob([f.fileData], { type: f.fileType })
          );
          return [...prev, { ...f, url, isImage: f.fileType.startsWith("image/") }];
        });
      });
    } catch (err) {
      alert("Please allow camera and mic access to join.");
    }
  };

  const toggleAudio = () => {
    const track = currentStreamRef.current?.getAudioTracks()[0];
    if (track) {
      const nextState = !audioMuted;
      track.enabled = !nextState;
      setAudioMuted(nextState);
      socketRef.current?.emit("media-state-change", {
        roomId,
        socketId: socketRef.current?.id,
        isAudioMuted: nextState,
        isVideoMuted: videoMuted,
      });
    }
  };

  const toggleVideo = () => {
    const track = currentStreamRef.current?.getVideoTracks()[0];
    if (track) {
      const nextState = !videoMuted;
      track.enabled = !nextState;
      setVideoMuted(nextState);
      socketRef.current?.emit("media-state-change", {
        roomId,
        socketId: socketRef.current?.id,
        isAudioMuted: audioMuted,
        isVideoMuted: nextState,
      });
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      if (isMobileDevice) {
        alert("Screen sharing is restricted on mobile browsers.");
        return;
      }
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        const screenTrack = screenStream.getVideoTracks()[0];

        Object.keys(peerConnections.current).forEach(async (peerId) => {
          const sender = peerConnections.current[peerId]
            .getSenders()
            .find((s) => s.track?.kind === "video");
          if (sender) await sender.replaceTrack(screenTrack);
        });

        currentStreamRef.current = new MediaStream([
          screenTrack,
          ...cameraStreamRef.current.getAudioTracks(),
        ]);
        setLocalStream(currentStreamRef.current);
        setIsScreenSharing(true);
        screenTrack.onended = stopScreenShare;
      } catch (err) {}
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = async () => {
    const cameraVideoTrack = cameraStreamRef.current?.getVideoTracks()[0];
    if (cameraVideoTrack) {
      Object.keys(peerConnections.current).forEach(async (peerId) => {
        const sender = peerConnections.current[peerId]
          .getSenders()
          .find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(cameraVideoTrack);
      });
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
      socketRef.current?.emit("send-file", { roomId, fileObj });
      setReceivedFiles((prev) => [
        ...prev,
        {
          ...fileObj,
          url: URL.createObjectURL(file),
          isImage: file.type.startsWith("image/"),
        },
      ]);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const getCanvasCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (clientY - rect.top) * (canvasRef.current.height / rect.height),
    };
  };

  const drawLineOnCanvas = (x0, y0, x1, y1, color, emit) => {
    [canvasRef.current, offscreenCanvasRef.current].forEach((c) => {
      if (!c) return;
      const ctx = c.getContext("2d");
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.closePath();
    });
    if (emit)
      socketRef.current?.emit("draw-line", {
        roomId,
        drawData: { x0, y0, x1, y1, color },
      });
  };

  const clearCanvas = (emit = true) => {
    [canvasRef.current, offscreenCanvasRef.current].forEach((c) => {
      if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
    });
    if (emit) socketRef.current?.emit("clear-canvas", roomId);
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-glow"></div>
        <div className="auth-card">
          <div className="auth-header">
            <div className="logo-icon">
              <Zap size={24} color="#38bdf8" />
            </div>
            <h2 className="auth-title">SyncSpace Studio</h2>
            <p className="auth-subtitle">Encrypted Collaboration Portal</p>
          </div>
          {authError && <div className="error-box">{authError}</div>}
          <form onSubmit={handleAuth} className="form-stack">
            <div className="input-group">
              <label className="label">Username</label>
              <input
                type="text"
                placeholder="Username"
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
                  {showPassword ? (
                    <EyeOff size={18} color="#94a3b8" />
                  ) : (
                    <Eye size={18} color="#94a3b8" />
                  )}
                </button>
              </div>
            </div>
            <button type="submit" className="primary-auth-btn">
              {isRegistering ? "Register" : "Sign In"}
            </button>
            <div
              className="toggle-text"
              onClick={() => setIsRegistering(!isRegistering)}
            >
              {isRegistering
                ? "Already have an account? Sign In"
                : "Need account? Register"}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <header className="navbar-container">
        <div className="brand-group">
          <div className="logo-icon-small">
            <Zap size={18} color="#38bdf8" />
          </div>
          <span className="brand-title">
            SyncSpace <span className="brand-highlight">Studio</span>
          </span>
        </div>
        {joined && (
          <div className="room-status-badge">
            <span className="online-dot"></span> Room: <strong>{roomId}</strong>
          </div>
        )}
        <div className="user-controls">
          <div className="user-pill">
            <User size={14} color="#a1a1aa" />
            <span className="user-name">{username}</span>
          </div>
          <button onClick={() => setShowLogoutDialog(true)} className="logout-btn">
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
            <h3 className="dialog-title">Confirm Logout</h3>
            <p className="dialog-text">Are you sure you want to sign out?</p>
            <div className="dialog-actions">
              <button
                onClick={() => setShowLogoutDialog(false)}
                className="cancel-btn"
              >
                Cancel
              </button>
              <button onClick={confirmLogout} className="confirm-logout-btn">
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {!joined ? (
        <main className="hero-container">
          <div className="hero-card">
            <h1 className="hero-title">Join Video Session</h1>
            <div className="join-input-stack">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="hero-input"
              />
              <button onClick={joinRoom} className="hero-join-btn">
                Launch Session
              </button>
            </div>
          </div>
        </main>
      ) : (
        <div className="workspace-layout show-video">
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
              >
                {audioMuted ? (
                  <MicOff size={20} color="#fca5a5" />
                ) : (
                  <Mic size={20} color="#f8fafc" />
                )}
              </button>
              <button
                onClick={toggleVideo}
                className={videoMuted ? "dock-btn-muted" : "dock-btn-active"}
              >
                {videoMuted ? (
                  <VideoOff size={20} color="#fca5a5" />
                ) : (
                  <Video size={20} color="#f8fafc" />
                )}
              </button>
              <button
                onClick={toggleScreenShare}
                className={
                  isScreenSharing ? "dock-btn-sharing" : "dock-btn-active"
                }
              >
                {isScreenSharing ? (
                  <StopCircle size={20} color="#fef08a" />
                ) : (
                  <ScreenShare size={20} color="#f8fafc" />
                )}
              </button>
              <label className="dock-btn-upload">
                <Paperclip size={20} color="#f8fafc" />
                <input
                  type="file"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </label>
              <button onClick={leaveRoom} className="dock-btn-leave">
                <PhoneOff size={18} color="#ffffff" />
                <span className="leave-text">Leave</span>
              </button>
            </div>
          </div>

          <aside className="side-suite">
            <div className="tab-header">
              <button
                onClick={() => setActiveTab("whiteboard")}
                className={
                  activeTab === "whiteboard" ? "tab-btn-active" : "tab-btn"
                }
              >
                <Edit3 size={16} /> Whiteboard
              </button>
              <button
                onClick={() => setActiveTab("files")}
                className={
                  activeTab === "files" ? "tab-btn-active" : "tab-btn"
                }
              >
                <FileText size={16} /> Files ({receivedFiles.length})
              </button>
            </div>
            <div className="tab-body">
              {activeTab === "whiteboard" ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                  }}
                >
                  <div className="pane-controls">
                    <span className="pane-label">Live Canvas</span>
                    <button onClick={() => clearCanvas(true)} className="clear-btn">
                      <Trash2 size={14} /> Clear
                    </button>
                  </div>
                  <div className="canvas-wrapper">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={500}
                      onMouseDown={(e) => {
                        isDrawing.current = true;
                        const c = getCanvasCoords(e);
                        canvasRef.current.lastX = c.x;
                        canvasRef.current.lastY = c.y;
                      }}
                      onMouseMove={(e) => {
                        if (!isDrawing.current) return;
                        const c = getCanvasCoords(e);
                        drawLineOnCanvas(
                          canvasRef.current.lastX,
                          canvasRef.current.lastY,
                          c.x,
                          c.y,
                          "#38bdf8",
                          true
                        );
                        canvasRef.current.lastX = c.x;
                        canvasRef.current.lastY = c.y;
                      }}
                      onMouseUp={() => (isDrawing.current = false)}
                      onMouseLeave={() => (isDrawing.current = false)}
                      className="canvas-element"
                    />
                  </div>
                </div>
              ) : (
                <div className="files-pane">
                  <div className="pane-controls">
                    <span className="pane-label">Shared Files</span>
                  </div>
                  {receivedFiles.length === 0 ? (
                    <div className="empty-state">No files yet.</div>
                  ) : (
                    receivedFiles.map((f) => (
                      <div key={f.id} className="file-card">
                        <div className="file-card-info">
                          <FileText size={18} color="#38bdf8" />
                          <div>
                            <p className="file-name">{f.fileName}</p>
                            <span className="file-meta">From {f.sender}</span>
                          </div>
                        </div>
                        <a
                          href={f.url}
                          download={f.fileName}
                          className="download-link"
                        >
                          <Download size={16} />
                        </a>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}