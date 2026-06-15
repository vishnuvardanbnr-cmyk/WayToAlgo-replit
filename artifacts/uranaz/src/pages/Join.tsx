import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { ExternalLink, Wallet } from "lucide-react";

const TEAL = "#5B8CFF";

/* ── Wallet definitions ─────────────────────────────────────────────────── */
interface WalletDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
  icon: React.FC<{ size?: number }>;
  getLink: (registerUrl: string) => string;
}

/* Simple inline SVG wallet logos */
const MetaMaskIcon: React.FC<{ size?: number }> = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="rgba(246,133,27,0.15)" />
    <path d="M32 9L22 16.5L24 12L32 9Z" fill="#E17726" stroke="#E17726" strokeWidth="0.3" />
    <path d="M8 9L17.9 16.6L16 12L8 9Z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" />
    <path d="M28.5 25.5L26 29.5L31.5 31L33 25.6L28.5 25.5Z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" />
    <path d="M7 25.6L8.5 31L14 29.5L11.5 25.5L7 25.6Z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" />
    <path d="M13.7 19.5L12.2 21.8L17.6 22L17.4 16.2L13.7 19.5Z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" />
    <path d="M26.3 19.5L22.5 16.1L22.4 22L27.8 21.8L26.3 19.5Z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" />
    <path d="M14 29.5L17.2 28L14.4 25.6L14 29.5Z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" />
    <path d="M22.8 28L26 29.5L25.6 25.6L22.8 28Z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" />
    <text x="20" y="37" textAnchor="middle" fontSize="7" fill="#F6851B" fontWeight="700" fontFamily="sans-serif">MM</text>
  </svg>
);

const TrustWalletIcon: React.FC<{ size?: number }> = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="rgba(51,117,187,0.15)" />
    <path d="M20 8L10 12V21C10 26.5 14.5 31.5 20 33C25.5 31.5 30 26.5 30 21V12L20 8Z" fill="#3375BB" opacity="0.8" />
    <path d="M20 10L12 13.5V21C12 25.5 15.5 29.8 20 31.2C24.5 29.8 28 25.5 28 21V13.5L20 10Z" fill="#4A9EE8" opacity="0.9" />
    <path d="M16 20L18.5 22.5L24 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TokenPocketIcon: React.FC<{ size?: number }> = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="rgba(41,128,254,0.15)" />
    <rect x="10" y="10" width="20" height="20" rx="5" fill="#2980FE" opacity="0.85" />
    <text x="20" y="24" textAnchor="middle" fontSize="11" fill="white" fontWeight="800" fontFamily="sans-serif">TP</text>
  </svg>
);

const SafePalIcon: React.FC<{ size?: number }> = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="rgba(10,175,224,0.15)" />
    <rect x="9" y="9" width="22" height="22" rx="4" fill="#0AAFE0" opacity="0.85" />
    <circle cx="20" cy="19" r="4" fill="white" opacity="0.9" />
    <rect x="17" y="22" width="6" height="5" rx="1" fill="white" opacity="0.9" />
    <path d="M18 19V21" stroke="#0AAFE0" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const WALLETS: WalletDef[] = [
  {
    id: "metamask",
    name: "MetaMask",
    desc: "Open in MetaMask browser",
    color: "#F6851B",
    bg: "rgba(246,133,27,0.07)",
    border: "rgba(246,133,27,0.28)",
    icon: MetaMaskIcon,
    getLink: (url) => {
      const u = new URL(url);
      // metamask.app.link/dapp/<host><pathname><search>
      return `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}`;
    },
  },
  {
    id: "trustwallet",
    name: "Trust Wallet",
    desc: "Open in Trust Wallet browser",
    color: "#3375BB",
    bg: "rgba(51,117,187,0.07)",
    border: "rgba(51,117,187,0.28)",
    icon: TrustWalletIcon,
    getLink: (url) =>
      `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(url)}`,
  },
  {
    id: "tokenpocket",
    name: "TokenPocket",
    desc: "Open in TokenPocket browser",
    color: "#2980FE",
    bg: "rgba(41,128,254,0.07)",
    border: "rgba(41,128,254,0.28)",
    icon: TokenPocketIcon,
    getLink: (url) =>
      `tpoutside://pull.activity?param=${encodeURIComponent(
        JSON.stringify({ action: "openDApp", actionType: "dapp", url })
      )}`,
  },
  {
    id: "safepal",
    name: "SafePal",
    desc: "Open in SafePal browser",
    color: "#0AAFE0",
    bg: "rgba(10,175,224,0.07)",
    border: "rgba(10,175,224,0.28)",
    icon: SafePalIcon,
    getLink: (url) =>
      `https://safepal.io/dapp?dapp_url=${encodeURIComponent(url)}`,
  },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function isInsideWalletBrowser(): boolean {
  const eth = (window as any).ethereum;
  if (!eth) return false;
  return !!(
    eth.isMetaMask ||
    eth.isTrust ||
    eth.isTrustWallet ||
    eth.isTokenPocket ||
    eth.isSafePal ||
    eth.isCoinbaseWallet ||
    eth.isOKExWallet ||
    eth.isImToken
  );
}

/* ── Component ───────────────────────────────────────────────────────────── */
export default function Join() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const ref = params.get("ref") || "";

  // Full register URL (with ref code) that each wallet will open
  const registerUrl = `${window.location.protocol}//${window.location.host}/register${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;

  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // If already inside a DApp wallet browser, go straight to register
    if (isInsideWalletBrowser()) {
      setRedirecting(true);
      setLocation(`/register${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
    }
  }, []);

  const handleWalletClick = (wallet: WalletDef) => {
    const link = wallet.getLink(registerUrl);
    window.location.href = link;
  };

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm" style={{ color: "rgba(194,210,255,0.5)" }}>Opening…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
            style={{ background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.22)" }}
          >
            <Wallet size={26} style={{ color: TEAL }} />
          </div>
          <h1
            className="text-2xl font-bold"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Open in Your Wallet
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(194,210,255,0.55)" }}>
            Choose a wallet to open this invite link in its built-in browser
          </p>
        </div>

        {/* Referral code badge */}
        {ref && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
            style={{
              background: "rgba(91,140,255,0.07)",
              border: "1px solid rgba(91,140,255,0.18)",
            }}
          >
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "rgba(194,210,255,0.45)" }}>
                Referral Code
              </div>
              <div className="font-bold font-mono text-base" style={{ color: TEAL }}>{ref}</div>
            </div>
            <div
              className="text-[10px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: "rgba(91,140,255,0.15)", color: TEAL }}
            >
              AUTO-FILLED
            </div>
          </div>
        )}

        {/* Wallet buttons */}
        <div className="space-y-3">
          {WALLETS.map((wallet) => {
            const Icon = wallet.icon;
            return (
              <button
                key={wallet.id}
                type="button"
                onClick={() => handleWalletClick(wallet)}
                className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left transition-all active:scale-[0.98]"
                style={{
                  background: wallet.bg,
                  border: `1px solid ${wallet.border}`,
                  cursor: "pointer",
                }}
              >
                <Icon size={40} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm" style={{ color: "rgba(200,240,255,0.95)" }}>
                    {wallet.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.45)" }}>
                    {wallet.desc}
                  </div>
                </div>
                <ExternalLink size={15} style={{ color: wallet.color, opacity: 0.7, flexShrink: 0 }} />
              </button>
            );
          })}
        </div>

        {/* Divider + direct link */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full" style={{ borderTop: "1px solid rgba(91,140,255,0.12)" }} />
          </div>
          <div className="relative flex justify-center">
            <span className="px-3 text-[11px]" style={{ background: "#060814", color: "rgba(194,210,255,0.35)" }}>
              or continue in browser
            </span>
          </div>
        </div>

        <a
          href={`/register${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: "rgba(91,140,255,0.07)",
            border: "1px solid rgba(91,140,255,0.18)",
            color: TEAL,
          }}
        >
          Register without wallet
        </a>

        <p className="text-center text-[11px] leading-relaxed" style={{ color: "rgba(194,210,255,0.3)" }}>
          Your referral code is automatically included when you open the link through any wallet above.
        </p>
      </div>
    </div>
  );
}
