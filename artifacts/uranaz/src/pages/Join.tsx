import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { ExternalLink, Wallet } from "lucide-react";

const TEAL = "#00FF94";

/* ── Wallet definitions ─────────────────────────────────────────────────── */
interface WalletDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
  logo: () => React.ReactElement;
  getLink: (registerUrl: string) => string;
}

/* ─────────────────────────────────────────────────────────────────────────
   Official brand logos
   MetaMask  — official SVG from wikimedia (fox + brand colours)
   Trust Wallet — brand blue shield + white checkmark (matching app icon)
   TokenPocket — brand blue rounded-square + white pocket icon
   SafePal     — dark rounded-square + cyan key/shield mark
   ─────────────────────────────────────────────────────────────────────────*/

/* MetaMask — served as a static file /wallets/metamask.svg */
const MetaMaskLogo = () => (
  <img
    src="/wallets/metamask.svg"
    alt="MetaMask"
    style={{ width: 44, height: 44, objectFit: "contain" }}
  />
);

/* Trust Wallet — exact brand: dark-navy pill, white shield, blue checkmark */
const TrustWalletLogo = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
    <rect width="44" height="44" rx="11" fill="#1A52EF" />
    {/* shield outer — white, semi-transparent fill to show gradient */}
    <path
      d="M22 8L11 13v11c0 7.2 5 13.1 11 14.7C28 36.1 33 30.2 33 23V13L22 8Z"
      fill="url(#tw_grad)"
    />
    {/* checkmark */}
    <path
      d="M16 23.5l4 4 8-8.5"
      stroke="white"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <defs>
      <linearGradient id="tw_grad" x1="22" y1="8" x2="22" y2="38" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="white" stopOpacity="0.30" />
        <stop offset="100%" stopColor="white" stopOpacity="0.07" />
      </linearGradient>
    </defs>
  </svg>
);

/* TokenPocket — crisp inline SVG matching official TP brand */
const TokenPocketLogo = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
    <rect width="44" height="44" rx="10" fill="#2980FE" />
    <text
      x="22"
      y="30"
      textAnchor="middle"
      fontFamily="'Arial Black', Arial, sans-serif"
      fontWeight="900"
      fontSize="20"
      fill="white"
      letterSpacing="-1"
    >TP</text>
  </svg>
);

/* SafePal — brand: dark #0E1C36, cyan shield with keyhole */
const SafePalLogo = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
    {/* outer rounded square — their dark navy */}
    <rect width="44" height="44" rx="11" fill="#0E1C36" />
    {/* shield body — cyan gradient */}
    <path
      d="M22 7L11 12v11c0 7.5 5 13.5 11 15.2C28 36.5 33 30.5 33 23V12L22 7Z"
      fill="url(#sp_grad)"
    />
    {/* keyhole ring */}
    <circle cx="22" cy="21" r="5" fill="#0E1C36" />
    <circle cx="22" cy="21" r="3" fill="#00D2E6" />
    {/* keyhole slot */}
    <rect x="20.5" y="24" width="3" height="5.5" rx="1.2" fill="#0E1C36" />
    <rect x="21" y="23.5" width="2" height="6" rx="0.8" fill="#00D2E6" />
    <defs>
      <linearGradient id="sp_grad" x1="22" y1="7" x2="22" y2="38" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#00D2E6" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#0077A8" stopOpacity="0.85" />
      </linearGradient>
    </defs>
  </svg>
);

/* ── Wallet list ─────────────────────────────────────────────────────────── */
const WALLETS: WalletDef[] = [
  {
    id: "metamask",
    name: "MetaMask",
    desc: "Open in MetaMask browser",
    color: "#F6851B",
    bg: "rgba(246,133,27,0.07)",
    border: "rgba(246,133,27,0.28)",
    logo: MetaMaskLogo,
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
    logo: TrustWalletLogo,
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
    logo: TokenPocketLogo,
    getLink: (url) =>
      `tpoutside://pull.activity?param=${encodeURIComponent(
        JSON.stringify({ action: "openDApp", actionType: "dapp", url })
      )}`,
  },
  {
    id: "safepal",
    name: "SafePal",
    desc: "Open in SafePal browser",
    color: "#00D2E6",
    bg: "rgba(0,210,230,0.07)",
    border: "rgba(0,210,230,0.28)",
    logo: SafePalLogo,
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

  const registerUrl = `${window.location.protocol}//${window.location.host}/register${
    ref ? `?ref=${encodeURIComponent(ref)}` : ""
  }`;

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
        <div className="text-sm" style={{ color: "rgba(176,255,224,0.5)" }}>Opening…</div>
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
            style={{ background: "rgba(0,255,148,0.10)", border: "1px solid rgba(0,255,148,0.22)" }}
          >
            <Wallet size={26} style={{ color: TEAL }} />
          </div>
          <h1
            className="text-2xl font-bold"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Open in Your Wallet
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(176,255,224,0.55)" }}>
            Choose a wallet to open this invite link in its built-in browser
          </p>
        </div>

        {/* Referral code badge */}
        {ref && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
            style={{
              background: "rgba(0,255,148,0.07)",
              border: "1px solid rgba(0,255,148,0.18)",
            }}
          >
            <div>
              <div
                className="text-[10px] font-semibold uppercase tracking-widest mb-0.5"
                style={{ color: "rgba(176,255,224,0.45)" }}
              >
                Referral Code
              </div>
              <div className="font-bold font-mono text-base" style={{ color: TEAL }}>
                {ref}
              </div>
            </div>
            <div
              className="text-[10px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: "rgba(0,255,148,0.15)", color: TEAL }}
            >
              AUTO-FILLED
            </div>
          </div>
        )}

        {/* Wallet buttons */}
        <div className="space-y-3">
          {WALLETS.map((wallet) => (
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
              <wallet.logo />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm" style={{ color: "rgba(200,240,255,0.95)" }}>
                  {wallet.name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.45)" }}>
                  {wallet.desc}
                </div>
              </div>
              <ExternalLink size={15} style={{ color: wallet.color, opacity: 0.7, flexShrink: 0 }} />
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full" style={{ borderTop: "1px solid rgba(0,255,148,0.12)" }} />
          </div>
          <div className="relative flex justify-center">
            <span
              className="px-3 text-[11px]"
              style={{ background: "#050C0A", color: "rgba(176,255,224,0.35)" }}
            >
              or continue in browser
            </span>
          </div>
        </div>

        <a
          href={`/register${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: "rgba(0,255,148,0.07)",
            border: "1px solid rgba(0,255,148,0.18)",
            color: TEAL,
          }}
        >
          Register without wallet
        </a>

        <p
          className="text-center text-[11px] leading-relaxed"
          style={{ color: "rgba(176,255,224,0.3)" }}
        >
          Your referral code is automatically included when you open the link through any wallet above.
        </p>
      </div>
    </div>
  );
}
