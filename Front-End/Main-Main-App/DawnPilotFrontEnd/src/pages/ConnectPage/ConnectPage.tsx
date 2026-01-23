import QRCode from "react-qr-code";
import { SERVER_IP } from "../../ApiConfig";

function ConnectPage() {
  // 1. Get the current Network IP automatically
  const protocol = window.location.protocol;
  const hostname = SERVER_IP;
  const port = window.location.port ? `:${window.location.port}` : "";
  
  // 2. Construct the Mobile URL
  const mobileUrl = `${protocol}//${hostname}${port}/mobile`;
  
  // 3. Check for localhost warning
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        background: "#121212",
        color: "#fff",
        fontFamily: "Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          background: "#1e1e1e",
          padding: "40px",
          borderRadius: "16px",
          textAlign: "center",
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          maxWidth: "500px",
          border: "1px solid #333",
        }}
      >
        <h1 style={{ margin: "0 0 20px 0", fontSize: "24px" }}>
          📱 Mobile Setup
        </h1>
        
        <p style={{ color: "#aaa", marginBottom: "30px" }}>
          Scan this QR code with your phone to join the session.
        </p>

        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "8px",
            display: "inline-block",
            marginBottom: "20px",
          }}
        >
          {isLocalhost ? (
            <div style={{ color: "red", fontWeight: "bold", width: "200px" }}>
              ⚠️ ERROR <br />
              <span style={{ fontSize: "12px", fontWeight: "normal", color: "#333" }}>
                Cannot sync on "localhost". <br/>
                Please use your Network IP: <br/>
                <b>http://192.168.x.x:5173/connect</b>
              </span>
            </div>
          ) : (
            <QRCode
              value={mobileUrl}
              size={256}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              viewBox={`0 0 256 256`}
            />
          )}
        </div>

        <div
          style={{
            background: "#2a2a2a",
            padding: "10px",
            borderRadius: "4px",
            fontFamily: "monospace",
            fontSize: "14px",
            color: "#4CAF50",
            wordBreak: "break-all",
          }}
        >
          {mobileUrl}
        </div>

        <div style={{ marginTop: "30px", fontSize: "12px", color: "#666" }}>
          Keep this screen open for new devices.
        </div>
      </div>
    </div>
  );
}

export default ConnectPage;