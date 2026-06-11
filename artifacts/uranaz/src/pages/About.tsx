import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CertConfig {
  companyName: string;
  companyNumber: string;
  incorporatedDate: string;
}

const DEFAULTS: CertConfig = {
  companyName: "WaytoAlgo INVESTMENT LTD",
  companyNumber: "14309852",
  incorporatedDate: "22nd August 2022",
};

export default function About() {
  const [cert, setCert] = useState<CertConfig>(DEFAULTS);

  useEffect(() => {
    fetch(`${BASE}/api/cert-config`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCert(d); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: "#060814" }}>

      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(91,140,255,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(91,140,255,0.025) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
      {/* Nebula blobs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div style={{
          position: "absolute", top: "-20%", right: "-15%",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(91,140,255,0.06) 0%, transparent 65%)",
        }} />
        <div style={{
          position: "absolute", bottom: "-10%", left: "-10%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(120,60,220,0.07) 0%, transparent 65%)",
        }} />
      </div>

      {/* Content */}
      <div className="relative z-10 px-4 py-8 max-w-2xl mx-auto pb-16">

        {/* Back button */}
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 mb-8 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:brightness-125"
          style={{
            background: "rgba(91,140,255,0.06)",
            border: "1px solid rgba(91,140,255,0.15)",
            color: "rgba(194,210,255,0.6)",
          }}
        >
          <ArrowLeft size={15} />
          Back
        </button>

        {/* Page heading */}
        <div className="text-center mb-8">
          <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(91,140,255,0.5)" }}>
            Company Information
          </div>
          <h1
            className="text-3xl sm:text-4xl font-black mb-4"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            About WaytoAlgo
          </h1>
          <p className="text-sm leading-relaxed max-w-lg mx-auto" style={{ color: "rgba(194,210,255,0.50)" }}>
            {cert.companyName} is an officially registered company incorporated in England &amp; Wales,
            operating a diversified investment platform across Real Estate, Stocks, Forex, and Cryptocurrency
            markets with over 10 years of combined expertise.
          </p>
        </div>

        {/* Key facts */}
        <div className="grid grid-cols-2 gap-3 mb-10">
          {[
            { label: "Company Name",   value: cert.companyName },
            { label: "Company Number", value: cert.companyNumber },
            { label: "Jurisdiction",   value: "England & Wales" },
            { label: "Incorporated",   value: cert.incorporatedDate },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl px-4 py-3"
              style={{
                background: "rgba(10,14,30,0.65)",
                backdropFilter: "blur(14px)",
                border: "1px solid rgba(91,140,255,0.10)",
              }}
            >
              <div className="text-xs mb-1" style={{ color: "rgba(194,210,255,0.35)" }}>{label}</div>
              <div className="text-xs font-bold" style={{ color: "rgba(200,240,255,0.85)" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Certificate of Incorporation */}
        <div className="mb-3 text-center">
          <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: "rgba(91,140,255,0.5)" }}>
            Official Document
          </div>
        </div>

        {/* Certificate paper */}
        <div
          className="relative rounded-xl select-none overflow-hidden"
          onContextMenu={e => e.preventDefault()}
          style={{
            background: "#f9f7f2",
            border: "2px solid #c8b87a",
            boxShadow: "inset 0 0 60px rgba(200,184,122,0.12), 0 8px 40px rgba(0,0,0,0.5)",
            fontFamily: "Georgia, 'Times New Roman', serif",
            color: "#1a1208",
          }}
        >
          {/* Gold top bar */}
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #c8b87a, #e8d89a, #c8b87a)" }} />

          <div className="px-8 sm:px-16 py-10 sm:py-14">
            {/* Corner decorations */}
            {["top-4 left-4", "top-4 right-4", "bottom-4 left-4", "bottom-4 right-4"].map(pos => (
              <div
                key={pos}
                className={`absolute ${pos} w-7 h-7`}
                style={{ border: "2px solid #c8b87a", borderRadius: 2 }}
              />
            ))}

            {/* Header */}
            <div className="text-center mb-8">
              <div
                className="text-xs tracking-[0.3em] uppercase mb-2"
                style={{ color: "#8a7a4a", letterSpacing: "0.3em" }}
              >
                Companies House
              </div>
              <div className="w-20 h-px mx-auto mb-5" style={{ background: "linear-gradient(90deg, transparent, #c8b87a, transparent)" }} />
              <div
                className="text-xl sm:text-2xl font-bold tracking-widest uppercase mb-1"
                style={{ color: "#1a1208", letterSpacing: "0.12em" }}
              >
                Certificate of Incorporation
              </div>
              <div className="text-sm tracking-wide my-1" style={{ color: "#5a4a2a" }}>of a</div>
              <div
                className="text-base font-bold tracking-widest uppercase"
                style={{ color: "#1a1208", letterSpacing: "0.1em" }}
              >
                Private Limited Company
              </div>
              <div className="w-36 h-px mx-auto mt-5" style={{ background: "linear-gradient(90deg, transparent, #c8b87a, transparent)" }} />
            </div>

            {/* Company Number */}
            <div className="text-center mb-6">
              <span className="text-sm" style={{ color: "#5a4a2a" }}>Company Number&nbsp;</span>
              <span className="text-base font-bold" style={{ color: "#1a1208" }}>{cert.companyNumber}</span>
            </div>

            {/* Body text */}
            <div className="text-sm leading-loose text-center mb-6" style={{ color: "#2a1e0a" }}>
              <p className="mb-5">
                The Registrar of Companies for England and Wales, hereby certifies that
              </p>
              <p
                className="text-2xl sm:text-3xl font-bold tracking-wide my-6"
                style={{ color: "#1a1208", fontFamily: "Georgia, serif", letterSpacing: "0.05em" }}
              >
                {cert.companyName}
              </p>
              <p className="leading-relaxed max-w-md mx-auto">
                is this day incorporated under the Companies Act 2006 as a private company,
                that the company is limited by shares, and the situation of its registered
                office is in England and Wales.
              </p>
            </div>

            {/* Date */}
            <div className="text-center mb-8 text-sm" style={{ color: "#5a4a2a" }}>
              Given at Companies House, Cardiff, on&nbsp;
              <strong style={{ color: "#1a1208" }}>{cert.incorporatedDate}</strong>.
            </div>

            {/* Divider */}
            <div className="w-full h-px mb-6" style={{ background: "linear-gradient(90deg, transparent, #c8b87a, transparent)" }} />

            {/* Footer note */}
            <p className="text-xs text-center leading-relaxed" style={{ color: "#7a6a4a" }}>
              The above information was communicated by electronic means and authenticated by the
              Registrar of Companies under section 1115 of the Companies Act 2006
            </p>
          </div>

          {/* Gold bottom bar */}
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #c8b87a, #e8d89a, #c8b87a)" }} />

          {/* Watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            <div
              className="text-3xl font-black tracking-widest"
              style={{
                fontFamily: "'Sora', sans-serif",
                color: "rgba(91,140,255,0.06)",
                transform: "rotate(-30deg)",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
            >
              WaytoAlgo · OFFICIAL
            </div>
          </div>

          {/* Protective overlay */}
          <div
            className="absolute inset-0"
            style={{ zIndex: 10 }}
            onContextMenu={e => e.preventDefault()}
            onDragStart={e => e.preventDefault()}
          />
        </div>

        {/* Footer note */}
        <p className="text-center text-xs mt-6" style={{ color: "rgba(194,210,255,0.25)" }}>
          Issued by Companies House, England &amp; Wales · {cert.incorporatedDate}
        </p>
      </div>
    </div>
  );
}
