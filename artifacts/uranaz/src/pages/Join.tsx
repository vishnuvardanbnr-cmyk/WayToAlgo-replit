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

/* ── Brand-accurate wallet SVG logos ──────────────────────────────────────*/

/** MetaMask — fox head with correct brand colours */
const MetaMaskIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    {/* rounded dark bg */}
    <rect width="40" height="40" rx="9" fill="#1C1C1E" />

    {/* left ear outer */}
    <polygon points="8,18 12.5,6 17.5,16.5" fill="#E2761B" />
    {/* left ear inner */}
    <polygon points="9.5,17.2 12.5,8.5 16,15.5" fill="#D7C1B3" />

    {/* right ear outer */}
    <polygon points="32,18 27.5,6 22.5,16.5" fill="#E2761B" />
    {/* right ear inner */}
    <polygon points="30.5,17.2 27.5,8.5 24,15.5" fill="#D7C1B3" />

    {/* head base */}
    <path d="M9 18 Q9 34 20 35.5 Q31 34 31 18 Q25.5 13.5 20 13 Q14.5 13.5 9 18Z" fill="#E4761B" />

    {/* forehead dark band */}
    <path d="M13 19 L27 19 L25.5 22 L14.5 22 Z" fill="#763D16" opacity="0.55" />

    {/* left eye white surround */}
    <ellipse cx="14.8" cy="24" rx="4.2" ry="3.6" fill="#D7C1B3" />
    {/* right eye white surround */}
    <ellipse cx="25.2" cy="24" rx="4.2" ry="3.6" fill="#D7C1B3" />

    {/* left pupil */}
    <ellipse cx="14.8" cy="24" rx="2.3" ry="2.3" fill="#161616" />
    {/* right pupil */}
    <ellipse cx="25.2" cy="24" rx="2.3" ry="2.3" fill="#161616" />

    {/* eye shine left */}
    <circle cx="15.6" cy="23.2" r="0.85" fill="white" />
    {/* eye shine right */}
    <circle cx="26" cy="23.2" r="0.85" fill="white" />

    {/* muzzle / lower face */}
    <path d="M15.5 29 Q20 33 24.5 29 L23.5 32 Q20 34.5 16.5 32 Z" fill="#C0AC9D" />

    {/* nose */}
    <ellipse cx="20" cy="29" rx="2.8" ry="1.8" fill="#763D16" />
    {/* nose highlight */}
    <ellipse cx="19.1" cy="28.3" rx="1" ry="0.65" fill="#CD6116" opacity="0.6" />
  </svg>
);

/** Trust Wallet — blue shield + white checkmark */
const TrustWalletIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="9" fill="#1A52EF" />

    {/* shield fill */}
    <path
      d="M20 6.5 L9.5 11.5 L9.5 22 C9.5 28.8 14.2 34.1 20 35.5 C25.8 34.1 30.5 28.8 30.5 22 L30.5 11.5 Z"
      fill="url(#tw_fill)"
    />
    {/* shield border */}
    <path
      d="M20 6.5 L9.5 11.5 L9.5 22 C9.5 28.8 14.2 34.1 20 35.5 C25.8 34.1 30.5 28.8 30.5 22 L30.5 11.5 Z"
      fill="none"
      stroke="white"
      strokeWidth="1.2"
      opacity="0.35"
    />

    {/* checkmark */}
    <path
      d="M14 22.5 L18 26.5 L26 18"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    <defs>
      <linearGradient id="tw_fill" x1="20" y1="6" x2="20" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="white" stopOpacity="0.18" />
        <stop offset="100%" stopColor="white" stopOpacity="0.04" />
      </linearGradient>
    </defs>
  </svg>
);

/** TokenPocket — blue square, pocket bag icon */
const TokenPocketIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="9" fill="#2980FE" />

    {/* bag body */}
    <path
      d="M12 20 Q12 15 16 14 L24 14 Q28 15 28 20 L28 30 Q28 33 25 33 L15 33 Q12 33 12 30 Z"
      fill="white"
      opacity="0.9"
    />
    {/* bag handle */}
    <path
      d="M16 14 Q16 9.5 20 9.5 Q24 9.5 24 14"
      stroke="white"
      strokeWidth="2.6"
      fill="none"
      strokeLinecap="round"
    />
    {/* horizontal lines inside bag */}
    <path d="M16 22 L24 22" stroke="#2980FE" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16 26 L21 26" stroke="#2980FE" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** SafePal — dark rounded square, cyan shield-key brand mark */
const SafePalIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="9" fill="#0D1829" />

    {/* outer shield */}
    <path
      d="M20 6 L10 10.5 L10 21 C10 27.5 14.5 32.8 20 34.5 C25.5 32.8 30 27.5 30 21 L30 10.5 Z"
      fill="url(#sp_shield)"
    />

    {/* inner keyhole circle */}
    <circle cx="20" cy="19.5" r="4.5" fill="#0D1829" stroke="#0FF" strokeWidth="1.5" opacity="0.85" />
    {/* keyhole body */}
    <rect x="18" y="22.5" width="4" height="6" rx="1.2" fill="#0D1829" />
    {/* key hole dot */}
    <circle cx="20" cy="19.5" r="1.8" fill="#00C9E4" />
    {/* connecting bar of keyhole */}
    <rect x="18.8" y="21" width="2.4" height="3.5" rx="0.5" fill="#00C9E4" />

    <defs>
      <linearGradient id="sp_shield" x1="20" y1="6" x2="20" y2="35" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#00C9E4" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#005F8F" stopOpacity="0.6" />
      </linearGradient>
    </defs>
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
    color: "#00C9E4",
    bg: "rgba(0,201,228,0.07)",
    border: "rgba(0,201,228,0.28)",
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

  const registerUrl = `${window.location.protocol}//${window.location.host}/register${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;

  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (isInsideWalletBrowser()) {
      setRedirecting(true);
      setLocation(`/register${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
    }
  }, []);

  const handleWalletClick = (wallet: WalletDef) => {
    window.location.href = wallet.getLink(registerUrl);
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
                className="w-full flex items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.98]"
                style={{
                  background: wallet.bg,
                  border: `1px solid ${wallet.border}`,
                  cursor: "pointer",
                }}
              >
                <Icon size={44} />
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
