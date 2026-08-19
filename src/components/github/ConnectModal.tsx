import React, { useState, useEffect, useRef } from "react";
import { useGithubStore } from "../../githubStore";
import { safeInvoke } from "../../utils/tauri";
import { Key, Smartphone, Loader, X, ExternalLink } from "lucide-react";

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({ isOpen, onClose }) => {
  const { connectPat, reload } = useGithubStore();
  const [pat, setPat] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Device Flow State
  const [showDevice, setShowDevice] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState("");
  const pollingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      pollingRef.current = false;
      setUserCode(null);
      setError(null);
      setPat("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectPat = async () => {
    if (!pat.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await connectPat(pat.trim());
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleStartDeviceFlow = async () => {
    if (!clientId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const code = await safeInvoke<DeviceCode>("gh_device_start", {
        clientId: clientId.trim(),
      });
      setUserCode(code.user_code);
      setVerificationUri(code.verification_uri);

      // Open verification URL in browser
      await safeInvoke("open_in_finder", { path: code.verification_uri }).catch(() => {
        window.open(code.verification_uri, "_blank");
      });

      startPolling(code);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const startPolling = async (code: DeviceCode) => {
    pollingRef.current = true;
    let interval = Math.max(code.interval, 5) * 1000;
    const deadline = Date.now() + code.expires_in * 1000;

    while (pollingRef.current && isOpen && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval));
      if (!pollingRef.current || !isOpen) return;

      try {
        const result = await safeInvoke<{ status: string; user: any }>("gh_device_poll", {
          clientId: clientId.trim(),
          deviceCode: code.device_code,
        });

        if (result.status === "ok") {
          await reload();
          setUserCode(null);
          onClose();
          return;
        }
        if (result.status === "slow_down") {
          interval += 5000;
        }
        if (result.status === "expired" || result.status === "denied") {
          setError(result.status === "denied" ? "Authorization was denied." : "Code expired — try again.");
          setUserCode(null);
          return;
        }
      } catch (e) {
        setError(String(e));
        setUserCode(null);
        return;
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-100 font-mono">Connect GitHub</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* PAT Section */}
          <div className="space-y-2">
            <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
              Paste a personal access token (classic or fine-grained) with <code className="text-zinc-200 bg-zinc-800 px-1 rounded">repo</code> scope. Stored securely in your system Keychain.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="ghp_... or github_pat_..."
                className="flex-1 bg-zinc-950 border border-zinc-800 text-xs rounded px-2.5 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 font-mono"
              />
              <button
                disabled={!pat.trim() || busy}
                onClick={handleConnectPat}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white text-xs font-mono font-medium rounded px-3 py-1.5 flex items-center gap-1.5 transition-colors"
              >
                {busy && !showDevice && <Loader size={12} className="animate-spin" />}
                Connect
              </button>
            </div>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-zinc-800"></div>
            <span className="flex-shrink mx-3 text-[10px] text-zinc-600 font-mono">or</span>
            <div className="flex-grow border-t border-zinc-800"></div>
          </div>

          {/* Device Flow Section */}
          <div className="space-y-2">
            <button
              onClick={() => setShowDevice(!showDevice)}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-mono"
            >
              <Smartphone size={13} />
              Use OAuth device flow
            </button>

            {showDevice && (
              <div className="space-y-3 pt-1 border-t border-zinc-800/40">
                <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                  Requires a GitHub OAuth App Client ID (Developer Settings → OAuth Apps, enable Device Flow).
                </p>

                {!userCode ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="OAuth App Client ID"
                      className="flex-1 bg-zinc-950 border border-zinc-800 text-xs rounded px-2.5 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      disabled={!clientId.trim() || busy}
                      onClick={handleStartDeviceFlow}
                      className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs font-mono font-medium rounded px-3 py-1.5 flex items-center gap-1.5 transition-colors"
                    >
                      {busy && showDevice && <Loader size={12} className="animate-spin" />}
                      Start
                    </button>
                  </div>
                ) : (
                  <div className="rounded border border-zinc-800 bg-zinc-950/60 p-4 text-center space-y-2">
                    <p className="text-[11px] text-zinc-400 font-mono">
                      Enter this code at:
                    </p>
                    <a
                      href={verificationUri}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:underline font-mono"
                    >
                      {verificationUri}
                      <ExternalLink size={10} />
                    </a>
                    <div className="text-xl font-mono font-bold tracking-widest text-zinc-100 py-1.5 bg-zinc-900 border border-zinc-800 rounded select-all">
                      {userCode}
                    </div>
                    <p className="text-[10px] text-zinc-500 font-mono animate-pulse">
                      Waiting for user authorization…
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="rounded border border-rose-500/20 bg-rose-500/5 p-3 text-[11px] text-rose-400 font-mono leading-relaxed">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
