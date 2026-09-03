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
} from "lucide-react";

const BACKEND_URL = "https://syncspace-backend-8f4l.onrender.com";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function VideoPlayer({ stream, username, isSelf = false, isScreen = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((e) => console.warn("Autoplay block:", e));
    }
  }, [stream]);

  return (
    <div style={styles.videoCard}>
      <div style={styles.videoHeader}>
        <div style={styles.videoBadge}>
          <span style={styles.onlineDot}></span>
          <span>{username}</span>
        </div>
        {isScreen && <span style={styles.screenBadge}>Sharing Screen</span>}
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        style={isScreen ? styles.screenStream : styles.videoStream}
      />
    </div>
  );
}

export default function App() {
  // Auth States
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [authInputUser, setAuthInputUser] = useState("");
  const [authInputPass, setAuthInputPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");

  // Logout Dialog State
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  // Room & Stream States
  const [roomId, setRoomId] = useState("room-1");
  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [activeTab, setActiveTab] = useState("whiteboard");

  // Remote streams: socketId -> { username, stream }
  const [remoteStreams, setRemoteStreams] = useState({});

  // Operational Refs
  const socketRef = useRef();
  const peerConnections = useRef({});
  const cameraStreamRef = useRef(null);
  const currentStreamRef = useRef(null);
  
  // Whiteboard Canvas State Persistence
  const canvasRef = useRef();
  const offscreenCanvasRef = useRef(null);
  const isDrawing = useRef(false);

  // Prevent Mobile Back Button from leaving page when typing or interacting
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

  // Initialize Off-Screen Canvas
  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      const off = document.createElement("canvas");
      off.width = 600;
      off.height = 500;
      offscreenCanvasRef.current = off;
    }
  }, []);

  // Restore canvas state when switching back to Whiteboard tab
  useEffect(() => {
    if (activeTab === "whiteboard" && canvasRef.current && offscreenCanvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.drawImage(offscreenCanvasRef.current, 0, 0);
    }
  }, [activeTab]);

  // Auth Handlers
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
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setToken("");
    setUsername("");
    setJoined(false);
    setShowLogoutDialog(false);
    if (socketRef.current) socketRef.current.disconnect();
  };

  // Socket Connection Setup
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

  // WebRTC Logic
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
          username: targetUsername || prev[targetSocketId]?.username || "Peer",
          stream: remoteStream,
        },
      }));
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "closed") {
        removePeer(targetSocketId);
      }
    };

    return pc;
  };

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

  const joinRoom = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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

      socket.on("user-left", (socketId) => removePeer(socketId));

      socket.on("draw-line", (draw) => drawLineOnCanvas(draw.x0, draw.y0, draw.x1, draw.y1, draw.color, false));
      socket.on("clear-canvas", () => clearCanvas(false));
      socket.on("receive-file", (fileObj) => addFileToState(fileObj));

    } catch (err) {
      console.error("Failed to access camera/mic:", err);
    }
  };

  // Media Toggles
  const toggleAudio = () => {
    const track = currentStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setAudioMuted(!track.enabled);
    } else {
      setAudioMuted(!audioMuted);
    }
  };

  const toggleVideo = () => {
    const track = currentStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setVideoMuted(!track.enabled);
    } else {
      setVideoMuted(!videoMuted);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        Object.keys(peerConnections.current).forEach(async (peerId) => {
          const pc = peerConnections.current[peerId];
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
          if (sender) {
            await sender.replaceTrack(screenTrack);
          }
        });

        const combinedStream = new MediaStream([
          screenTrack,
          ...cameraStreamRef.current.getAudioTracks(),
        ]);
        currentStreamRef.current = combinedStream;
        setLocalStream(combinedStream);
        setIsScreenSharing(true);

        screenTrack.onended = () => stopScreenShare();
      } catch (err) {
        console.error("Screen sharing failed:", err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = async () => {
    const cameraVideoTrack = cameraStreamRef.current?.getVideoTracks()[0];

    if (cameraVideoTrack) {
      Object.keys(peerConnections.current).forEach(async (peerId) => {
        const pc = peerConnections.current[peerId];
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          await sender.replaceTrack(cameraVideoTrack);
        }
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

      if (socketRef.current && joined) {
        socketRef.current.emit("send-file", { roomId, fileObj });
      }
      addFileToState(fileObj);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Persistent Canvas Whiteboard Functions
  const startDrawing = (e) => {
    isDrawing.current = true;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    canvasRef.current.lastX = clientX - rect.left;
    canvasRef.current.lastY = clientY - rect.top;
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { lastX, lastY } = canvasRef.current;
    
    drawLineOnCanvas(lastX, lastY, x, y, "#38bdf8", true);
    canvasRef.current.lastX = x;
    canvasRef.current.lastY = y;
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

  // Login Screen
  if (!token) {
    return (
      <div style={styles.authWrapper}>
        <div style={styles.authGlow}></div>
        <div style={styles.authCard}>
          <div style={styles.authHeader}>
            <div style={styles.logoIcon}><Zap size={24} color="#38bdf8" /></div>
            <h2 style={styles.authTitle}>SyncSpace Studio</h2>
            <p style={styles.authSubtitle}>Encrypted Collaboration & Video Portal</p>
          </div>

          {authError && <div style={styles.errorBox}>{authError}</div>}

          <form onSubmit={handleAuth} style={styles.formStack}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Username</label>
              <input
                type="text"
                placeholder="Enter username"
                value={authInputUser}
                onChange={(e) => setAuthInputUser(e.target.value)}
                style={styles.input}
                required
              />
            </div>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Password</label>
              <div style={{ position: "relative", width: "100%" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={authInputPass}
                  onChange={(e) => setAuthInputPass(e.target.value)}
                  style={{ ...styles.input, width: "100%", paddingRight: "40px" }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  {showPassword ? <EyeOff size={18} color="#94a3b8" /> : <Eye size={18} color="#94a3b8" />}
                </button>
              </div>
            </div>

            <button type="submit" style={styles.primaryAuthBtn}>
              {isRegistering ? "Create Account" : "Sign In to Studio"}
            </button>

            <div style={styles.toggleText} onClick={() => setIsRegistering(!isRegistering)}>
              {isRegistering ? "Already have an account? Sign In" : "Need workspace access? Register"}
            </div>
          </form>

          <div style={styles.securityBadge}>
            <ShieldCheck size={14} color="#10b981" /> End-to-End DTLS-SRTP Encrypted
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appWrapper}>
      {/* Top Navigation Bar */}
      <header className="navbar-container" style={styles.navbar}>
        <div style={styles.brandGroup}>
          <div style={styles.logoIconSmall}><Zap size={18} color="#38bdf8" /></div>
          <span style={styles.brandTitle}>SyncSpace <span style={styles.brandHighlight}>Studio</span></span>
        </div>

        {joined && (
          <div style={styles.roomStatusBadge}>
            <span style={styles.onlineDot}></span> Room: <strong style={{ color: "#fff" }}>{roomId}</strong>
          </div>
        )}

        <div style={styles.userControls}>
          <div style={styles.userPill}>
            <User size={14} color="#a1a1aa" />
            <span style={styles.userName}>{username}</span>
          </div>
          <button onClick={() => setShowLogoutDialog(true)} style={styles.logoutBtn} title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Confirmation Modal Pop-Up for Logout */}
      {showLogoutDialog && (
        <div style={styles.dialogOverlay}>
          <div style={styles.dialogCard}>
            <div style={styles.dialogHeader}>
              <AlertTriangle size={24} color="#f59e0b" />
              <h3 style={styles.dialogTitle}>Confirm Logout</h3>
            </div>
            <p style={styles.dialogText}>
              Are you sure you want to logout? This will disconnect your media stream and end active sessions.
            </p>
            <div style={styles.dialogActions}>
              <button onClick={() => setShowLogoutDialog(false)} style={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={confirmLogout} style={styles.confirmLogoutBtn}>
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {!joined ? (
        <main style={styles.heroContainer}>
          <div style={styles.heroCard}>
            <h1 style={styles.heroTitle}>Join Video Session</h1>
            <p style={styles.heroDesc}>Enter or create a conference room key to connect with your team.</p>
            
            <div className="join-stack" style={styles.joinInputStack}>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="e.g. room-101"
                style={styles.heroInput}
              />
              <button onClick={joinRoom} style={styles.heroJoinBtn}>
                Launch Session
              </button>
            </div>
          </div>
        </main>
      ) : (
        <div className="workspace-container" style={styles.workspaceLayout}>
          {/* Main Full-Screen Media Stage */}
          <div style={styles.stageArea}>
            <div style={styles.videoGrid}>
              <VideoPlayer
                stream={localStream}
                username={`${username} ( You )`}
                isSelf={true}
                isScreen={isScreenSharing}
              />

              {Object.entries(remoteStreams).map(([id, remote]) => (
                <VideoPlayer
                  key={id}
                  stream={remote.stream}
                  username={remote.username}
                  isSelf={false}
                />
              ))}
            </div>

            {/* Bottom Floating Control Bar */}
            <div style={styles.floatingDock}>
              <button
                onClick={toggleAudio}
                style={audioMuted ? styles.dockBtnMuted : styles.dockBtnActive}
                title={audioMuted ? "Unmute Mic" : "Mute Mic"}
              >
                {audioMuted ? (
                  <MicOff size={20} color="#fca5a5" style={{ flexShrink: 0, display: "block" }} />
                ) : (
                  <Mic size={20} color="#f8fafc" style={{ flexShrink: 0, display: "block" }} />
                )}
              </button>

              <button
                onClick={toggleVideo}
                style={videoMuted ? styles.dockBtnMuted : styles.dockBtnActive}
                title={videoMuted ? "Start Video" : "Stop Video"}
              >
                {videoMuted ? (
                  <VideoOff size={20} color="#fca5a5" style={{ flexShrink: 0, display: "block" }} />
                ) : (
                  <Video size={20} color="#f8fafc" style={{ flexShrink: 0, display: "block" }} />
                )}
              </button>

              <button
                onClick={toggleScreenShare}
                style={isScreenSharing ? styles.dockBtnSharing : styles.dockBtnActive}
                title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
              >
                {isScreenSharing ? (
                  <StopCircle size={20} color="#fef08a" style={{ flexShrink: 0, display: "block" }} />
                ) : (
                  <ScreenShare size={20} color="#f8fafc" style={{ flexShrink: 0, display: "block" }} />
                )}
              </button>

              <label style={styles.dockBtnUpload} title="Share File">
                <Paperclip size={20} color="#f8fafc" style={{ flexShrink: 0, display: "block" }} />
                <input type="file" onChange={handleFileUpload} style={{ display: "none" }} />
              </label>

              <button
                onClick={() => setJoined(false)}
                style={styles.dockBtnLeaveRed}
                title="Leave Room"
              >
                <PhoneOff size={18} color="#ffffff" style={{ flexShrink: 0, display: "block" }} />
                <span>Leave</span>
              </button>
            </div>
          </div>

          {/* Right Collaboration Suite */}
          <aside className="side-suite" style={styles.sideSuite}>
            <div style={styles.tabHeader}>
              <button
                onClick={() => setActiveTab("whiteboard")}
                style={activeTab === "whiteboard" ? styles.tabBtnActive : styles.tabBtn}
              >
                <Edit3 size={16} /> Whiteboard
              </button>
              <button
                onClick={() => setActiveTab("files")}
                style={activeTab === "files" ? styles.tabBtnActive : styles.tabBtn}
              >
                <FileText size={16} /> Files ({receivedFiles.length})
              </button>
            </div>

            <div style={styles.tabBody}>
              <div style={{ display: activeTab === "whiteboard" ? "flex" : "none", flexDirection: "column", height: "100%" }}>
                <div style={styles.paneControls}>
                  <span style={styles.paneLabel}>Live Interactive Canvas</span>
                  <button onClick={() => clearCanvas(true)} style={styles.clearBtn}>
                    <Trash2 size={14} /> Clear
                  </button>
                </div>
                <div style={styles.canvasWrapper}>
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
                    style={styles.canvasElement}
                  />
                </div>
              </div>

              {activeTab === "files" && (
                <div style={styles.filesPane}>
                  <div style={styles.paneControls}>
                    <span style={styles.paneLabel}>Shared Room Files</span>
                  </div>

                  {receivedFiles.length === 0 ? (
                    <div style={styles.emptyState}>No files shared in this room yet.</div>
                  ) : (
                    <div style={styles.fileList}>
                      {receivedFiles.map((f) => (
                        <div key={f.id} style={styles.fileCard}>
                          <div style={styles.fileCardInfo}>
                            <FileText size={18} color="#38bdf8" />
                            <div style={{ overflow: "hidden" }}>
                              <p style={styles.fileName}>{f.fileName}</p>
                              <span style={styles.fileMeta}>From {f.sender || "Peer"}</span>
                            </div>
                          </div>
                          <a href={f.url} download={f.fileName} style={styles.downloadLink}>
                            <Download size={16} />
                          </a>
                          {f.isImage && (
                            <img src={f.url} alt="Shared preview" style={styles.imagePreview} />
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
      )}
    </div>
  );
}

const styles = {
  appWrapper: {
    height: "100vh",
    width: "100vw",
    backgroundColor: "#090d16",
    color: "#f1f5f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  navbar: {
    minHeight: "60px",
    borderBottom: "1px solid #1e293b",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    backdropFilter: "blur(12px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    zIndex: 10,
    flexShrink: 0,
    boxSizing: "border-box",
  },
  brandGroup: { display: "flex", alignItems: "center", gap: "10px" },
  logoIconSmall: {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(56, 189, 248, 0.2)",
  },
  brandTitle: { fontSize: "18px", fontWeight: "700", letterSpacing: "-0.5px" },
  brandHighlight: { color: "#38bdf8" },
  roomStatusBadge: {
    padding: "6px 14px",
    borderRadius: "20px",
    backgroundColor: "#1e293b",
    fontSize: "13px",
    color: "#94a3b8",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #334155",
  },
  onlineDot: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#10b981" },
  userControls: { display: "flex", alignItems: "center", gap: "12px" },
  userPill: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "#1e293b",
    padding: "6px 12px",
    borderRadius: "20px",
    fontSize: "13px",
  },
  userName: { fontWeight: "600", color: "#e2e8f0" },
  logoutBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    padding: "8px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // Logout Dialog Box
  dialogOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  dialogCard: {
    width: "90%",
    maxWidth: "360px",
    backgroundColor: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
  },
  dialogHeader: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" },
  dialogTitle: { fontSize: "18px", fontWeight: "700", color: "#f8fafc", margin: 0 },
  dialogText: { fontSize: "14px", color: "#94a3b8", lineHeight: "1.5", margin: "0 0 20px 0" },
  dialogActions: { display: "flex", justifyContent: "flex-end", gap: "10px" },
  cancelBtn: {
    padding: "8px 16px",
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: "8px",
    cursor: "pointer",
  },
  confirmLogoutBtn: {
    padding: "8px 16px",
    backgroundColor: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    cursor: "pointer",
  },

  // Auth Styles
  authWrapper: {
    height: "100vh",
    width: "100vw",
    backgroundColor: "#090d16",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  authGlow: {
    position: "absolute",
    width: "400px",
    height: "400px",
    background: "radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, rgba(0, 0, 0, 0) 70%)",
    pointerEvents: "none",
  },
  authCard: {
    width: "90%",
    maxWidth: "380px",
    backgroundColor: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
    zIndex: 1,
    boxSizing: "border-box",
  },
  authHeader: { textAlign: "center", marginBottom: "24px" },
  logoIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 12px auto",
    border: "1px solid rgba(56, 189, 248, 0.2)",
  },
  authTitle: { fontSize: "20px", fontWeight: "700", color: "#f8fafc", margin: "0 0 4px 0" },
  authSubtitle: { fontSize: "13px", color: "#64748b", margin: 0 },
  formStack: { display: "flex", flexDirection: "column", gap: "16px" },
  inputGroup: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "12px", fontWeight: "600", color: "#94a3b8" },
  input: {
    padding: "10px 14px",
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  },
  eyeBtn: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px",
  },
  primaryAuthBtn: {
    padding: "12px",
    backgroundColor: "#0284c7",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    marginTop: "8px",
  },
  toggleText: { fontSize: "13px", color: "#38bdf8", textAlign: "center", cursor: "pointer", marginTop: "12px" },
  securityBadge: {
    marginTop: "24px",
    paddingTop: "16px",
    borderTop: "1px solid #1e293b",
    fontSize: "12px",
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
  },
  errorBox: {
    padding: "10px",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    borderRadius: "8px",
    color: "#fca5a5",
    fontSize: "13px",
    marginBottom: "16px",
  },

  // Hero Room Join Layout
  heroContainer: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  heroCard: {
    maxWidth: "480px",
    width: "100%",
    textAlign: "center",
    backgroundColor: "#0f172a",
    border: "1px solid #1e293b",
    padding: "32px 24px",
    borderRadius: "20px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxSizing: "border-box",
  },
  heroTitle: { fontSize: "24px", fontWeight: "800", color: "#f8fafc", margin: "0 0 12px 0" },
  heroDesc: { fontSize: "14px", color: "#94a3b8", lineHeight: "1.5", margin: "0 0 28px 0" },
  joinInputStack: { display: "flex", gap: "10px", width: "100%" },
  heroInput: {
    flex: 1,
    padding: "12px 16px",
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "14px",
    outline: "none",
  },
  heroJoinBtn: {
    padding: "12px 20px",
    backgroundColor: "#0284c7",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  // Dynamic Workspace Layout
  workspaceLayout: {
    flex: 1,
    display: "flex",
    padding: "16px",
    gap: "16px",
    height: "calc(100vh - 60px)",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  stageArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    position: "relative",
    height: "100%",
    overflow: "hidden",
    justifyContent: "space-between",
  },
  videoGrid: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflowY: "auto",
    maxHeight: "calc(100% - 70px)",
  },
  videoCard: {
    backgroundColor: "#0f172a",
    borderRadius: "14px",
    border: "1px solid #1e293b",
    overflow: "hidden",
    position: "relative",
    width: "100%",
    height: "100%",
    maxHeight: "100%",
    minHeight: "200px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  videoHeader: {
    position: "absolute",
    top: "12px",
    left: "12px",
    right: "12px",
    display: "flex",
    justifyContent: "space-between",
    zIndex: 2,
  },
  videoBadge: {
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    backdropFilter: "blur(8px)",
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "600",
    color: "#e2e8f0",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  screenBadge: {
    backgroundColor: "rgba(234, 179, 8, 0.2)",
    color: "#fde047",
    border: "1px solid rgba(234, 179, 8, 0.4)",
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "700",
  },
  videoStream: { width: "100%", height: "100%", objectFit: "cover", backgroundColor: "#020617" },
  screenStream: { width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#020617" },

  // Floating Control Dock
  floatingDock: {
    height: "56px",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    backdropFilter: "blur(16px)",
    border: "1px solid #1e293b",
    borderRadius: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "0 16px",
    alignSelf: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
    flexShrink: 0,
    zIndex: 20,
    position: "relative",
    maxWidth: "100%",
    boxSizing: "border-box",
  },
  dockBtnActive: {
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
  dockBtnMuted: {
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    backgroundColor: "#7f1d1d",
    border: "1px solid #991b1b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
  dockBtnSharing: {
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    backgroundColor: "#854d0e",
    border: "1px solid #a16207",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
  dockBtnUpload: {
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
  dockBtnLeaveRed: {
    padding: "0 14px",
    height: "42px",
    borderRadius: "12px",
    backgroundColor: "#dc2626",
    color: "#ffffff",
    border: "none",
    fontWeight: "600",
    fontSize: "13px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    boxShadow: "0 2px 8px rgba(220, 38, 38, 0.4)",
  },

  // Sidebar Suite Layout
  sideSuite: {
    width: "380px",
    backgroundColor: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    height: "100%",
  },
  tabHeader: { display: "flex", borderBottom: "1px solid #1e293b", backgroundColor: "#090d16" },
  tabBtn: {
    flex: 1,
    padding: "14px",
    backgroundColor: "transparent",
    border: "none",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    cursor: "pointer",
  },
  tabBtnActive: {
    flex: 1,
    padding: "14px",
    backgroundColor: "#0f172a",
    border: "none",
    borderBottom: "2px solid #38bdf8",
    color: "#38bdf8",
    fontSize: "13px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    cursor: "pointer",
  },
  tabBody: { flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column" },
  paneControls: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" },
  paneLabel: { fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.5px" },
  clearBtn: {
    background: "none",
    border: "none",
    color: "#ef4444",
    fontSize: "12px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    cursor: "pointer",
  },
  canvasWrapper: {
    flex: 1,
    backgroundColor: "#020617",
    border: "1px solid #1e293b",
    borderRadius: "12px",
    overflow: "hidden",
    position: "relative",
    touchAction: "none",
  },
  canvasElement: { width: "100%", height: "100%", cursor: "crosshair" },

  filesPane: { display: "flex", flexDirection: "column", height: "100%" },
  emptyState: { fontSize: "13px", color: "#64748b", textAlign: "center", marginTop: "40px" },
  fileList: { display: "flex", flexDirection: "column", gap: "10px" },
  fileCard: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    padding: "12px",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  fileCardInfo: { display: "flex", alignItems: "center", gap: "10px" },
  fileName: { fontSize: "13px", fontWeight: "600", color: "#f8fafc", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  fileMeta: { fontSize: "11px", color: "#94a3b8" },
  downloadLink: { color: "#38bdf8", textDecoration: "none", alignSelf: "flex-end" },
  imagePreview: { width: "100%", maxHeight: "140px", objectFit: "cover", borderRadius: "6px" },
};