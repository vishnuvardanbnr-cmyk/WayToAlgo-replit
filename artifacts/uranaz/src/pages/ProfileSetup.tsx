import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useSetupProfile, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2 } from "lucide-react";

const BEP20_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TEAL = "#00FF94";

interface Props { onUpdate: (user: any) => void; }

export default function ProfileSetup({ onUpdate }: Props) {
  const [, setLocation] = useLocation();
  const setupProfile = useSetupProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const [status, setStatus] = useState<"detecting" | "saving" | "done">("detecting");
  const [detectedAddress, setDetectedAddress] = useState("");

  useEffect(() => {
    const detect = async () => {
      let address = "";

      // 1. From the user record (set during registration)
      if (me?.walletAddress && BEP20_REGEX.test(me.walletAddress)) {
        address = me.walletAddress;
      }

      // 2. From window.ethereum (already approved — no pop-up)
      if (!address && (window as any).ethereum) {
        try {
          const accounts: string[] = await (window as any).ethereum.request({ method: "eth_accounts" });
          if (accounts[0] && BEP20_REGEX.test(accounts[0])) {
            address = accounts[0];
          }
        } catch {}
      }

      if (address) {
        setDetectedAddress(address);
        setStatus("saving");
        try {
          const user = await setupProfile.mutateAsync({
            data: { walletAddress: address, country: "", idNumber: "" } as any,
          });
          await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          onUpdate(user);
          setStatus("done");
          setTimeout(() => setLocation("/dashboard"), 1500);
        } catch (err: any) {
          toast({ title: "Setup failed", description: err?.message, variant: "destructive" });
          setStatus("detecting");
        }
      } else {
        // No wallet found — go straight to dashboard anyway
        setLocation("/dashboard");
      }
    };

    if (me !== undefined) detect();
  }, [me]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="relative w-full max-w-sm text-center">

        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{
            background: "linear-gradient(135deg, rgba(0,255,148,0.18), rgba(0,204,119,0.08))",
            border: "2px solid rgba(0,255,148,0.45)",
            boxShadow: "0 0 30px rgba(0,255,148,0.25)",
          }}
        >
          {status === "done"
            ? <CheckCircle size={28} style={{ color: TEAL }} />
            : <Loader2 size={28} style={{ color: TEAL }} className="animate-spin" />}
        </div>

        <h1
          className="text-2xl font-bold mb-2"
          style={{
            fontFamily: "'Sora', sans-serif",
            background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {status === "done" ? "All Set!" : "Setting Up Your Account"}
        </h1>

        <p style={{ color: "rgba(176,255,224,0.5)", fontSize: "0.875rem" }}>
          {status === "done"
            ? "Redirecting to your dashboard…"
            : status === "saving"
            ? "Linking your wallet address…"
            : "Detecting wallet…"}
        </p>

        {detectedAddress && (
          <div
            className="mt-6 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm mx-auto"
            style={{
              background: "rgba(0,20,40,0.6)",
              border: "1px solid rgba(0,255,148,0.35)",
              color: "rgba(176,255,224,0.8)",
            }}
          >
            <span className="truncate flex-1 text-left" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
              {detectedAddress}
            </span>
            <span
              className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(0,255,148,0.15)", color: TEAL, border: "1px solid rgba(0,255,148,0.3)" }}
            >
              Connected
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
