import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useSearch } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { setToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/useWallet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Mail, ArrowLeft, ShieldCheck, ChevronsUpDown, Check, Eye, EyeOff, Wallet, CheckCircle2 } from "lucide-react";
import { COUNTRIES, COUNTRY_BY_ISO2 } from "@/lib/countries";

function buildSchema(requireReferral: boolean) {
  return z.object({
    name: z.string().min(2, "Full name required"),
    email: z.string().email("Valid email required"),
    countryIso2: z
      .string()
      .min(2, "Country is required")
      .refine((v) => Boolean(COUNTRY_BY_ISO2[v]), { message: "Pick a country from the list" }),
    phoneLocal: z
      .string()
      .trim()
      .regex(/^[0-9 \-]*$/, "Digits only")
      .refine((v) => v.replace(/[^0-9]/g, "").length >= 5, {
        message: "Enter at least 5 digits",
      }),
    password: z.string().min(6, "Min 6 characters"),
    referralCode: requireReferral
      ? z.string().trim().min(1, "Referral code is required")
      : z.string().optional(),
  });
}
type RegisterValues = z.infer<ReturnType<typeof buildSchema>>;

type RegistrationInfo = { userCount: number; isFirstUser: boolean; requiresReferral: boolean };

async function fetchRegistrationInfo(): Promise<RegistrationInfo> {
  const res = await fetch("/api/auth/registration-info");
  if (!res.ok) throw new Error("Failed to load registration info");
  return res.json();
}

interface Props { onLogin: (user: any) => void; }

const TEAL = "#5B8CFF";
const LABEL_STYLE = { color: "rgba(194,210,255,0.7)", fontSize: "0.8rem", letterSpacing: "0.05em" };
const INPUT_STYLE = { background: "rgba(0,20,40,0.6)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" };

async function checkOtpRequired(): Promise<{ registrationOtp: boolean; withdrawalOtp: boolean }> {
  const res = await fetch("/api/auth/otp-required");
  if (!res.ok) return { registrationOtp: false, withdrawalOtp: false };
  return res.json();
}

async function sendOtp(email: string): Promise<void> {
  const res = await fetch("/api/auth/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, purpose: "registration" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to send OTP");
  }
}

export default function Register({ onLogin }: Props) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const ref = params.get("ref") || "";
  const registerMutation = useRegister();
  const { toast } = useToast();
  const wallet = useWallet();

  // step: "form" → "otp"
  const [step, setStep] = useState<"form" | "otp">("form");
  const [connectedAddress, setConnectedAddress] = useState<string>("");
  const [walletExists, setWalletExists] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState<RegisterValues | null>(null);
  const [regInfo, setRegInfo] = useState<RegistrationInfo | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchRegistrationInfo()
      .then(setRegInfo)
      .catch(() => setRegInfo({ userCount: 1, isFirstUser: false, requiresReferral: true }));
  }, []);

  // Auto-fill referral code from URL ?ref= param
  useEffect(() => {
    if (ref) {
      form.setValue("referralCode", ref, { shouldValidate: true });
    }
  }, [ref]);

  // Auto-switch to BSC when inside a wallet DApp browser
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    const BSC_CHAIN_ID = "0x38";
    eth.request({ method: "eth_chainId" }).then((chainId: string) => {
      if (chainId !== BSC_CHAIN_ID) {
        eth
          .request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: BSC_CHAIN_ID,
                chainName: "BNB Smart Chain",
                nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
                rpcUrls: ["https://bsc-dataseed.binance.org/"],
                blockExplorerUrls: ["https://bscscan.com/"],
              },
            ],
          })
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const requireReferral = regInfo?.requiresReferral ?? true;
  const isFirstUser = regInfo?.isFirstUser ?? false;
  const schema = buildSchema(requireReferral);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", countryIso2: "", phoneLocal: "", password: "", referralCode: ref },
  });

  const selectedIso2 = form.watch("countryIso2");
  const selectedCountry = selectedIso2 ? COUNTRY_BY_ISO2[selectedIso2] : undefined;

  function toApiPayload(data: RegisterValues) {
    const c = COUNTRY_BY_ISO2[data.countryIso2];
    const localDigits = data.phoneLocal.replace(/[^0-9]/g, "");
    const phone = c ? `${c.dialCode} ${localDigits}` : localDigits;
    return {
      name: data.name,
      email: data.email,
      phone,
      country: c?.name ?? "",
      password: data.password,
      referralCode: data.referralCode,
      walletAddress: connectedAddress || undefined,
    };
  }

  const handleConnectWallet = async () => {
    setWalletExists(false);
    const address = await wallet.connect();
    if (!address) return;
    setConnectedAddress(address);
    // Check if this wallet already has an account
    try {
      const res = await fetch(`/api/auth/wallet-check?address=${encodeURIComponent(address)}`);
      if (res.ok) {
        const { exists } = await res.json();
        setWalletExists(exists);
      }
    } catch {}
  };

  const handleFormSubmit = async (data: RegisterValues) => {
    try {
      const payload = toApiPayload(data);
      const { registrationOtp } = await checkOtpRequired();
      if (registrationOtp) {
        setSending(true);
        try {
          await sendOtp(payload.email);
          setFormData(data);
          setStep("otp");
          toast({ title: "OTP sent!", description: `Check your email ${payload.email}` });
        } catch (err: any) {
          toast({ title: "Failed to send OTP", description: err?.message, variant: "destructive" });
        } finally {
          setSending(false);
        }
      } else {
        const res = await registerMutation.mutateAsync({ data: payload as any });
        setToken(res.token);
        onLogin(res.user);
        setLocation("/profile-setup");
      }
    } catch (err: any) {
      toast({ title: "Registration failed", description: err?.message || "Please try again", variant: "destructive" });
    }
  };

  const handleOtpSubmit = async () => {
    if (!formData) return;
    if (otp.length !== 6) {
      toast({ title: "Enter the 6-digit OTP", variant: "destructive" });
      return;
    }
    try {
      const payload = toApiPayload(formData);
      const res = await registerMutation.mutateAsync({ data: { ...payload, otp } as any });
      setToken(res.token);
      onLogin(res.user);
      setLocation("/profile-setup");
    } catch (err: any) {
      toast({ title: "Registration failed", description: err?.message || "Invalid OTP", variant: "destructive" });
    }
  };

  const handleResend = async () => {
    if (!formData) return;
    setSending(true);
    try {
      await sendOtp(formData.email);
      toast({ title: "OTP resent!", description: "Check your inbox" });
    } catch (err: any) {
      toast({ title: "Failed to resend", description: err?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {step === "otp" ? "Verify Email" : "Create Account"}
          </h1>
          <p style={{ color: "rgba(194,210,255,0.5)", fontSize: "0.875rem" }}>
            {step === "otp"
              ? `We sent a code to ${formData?.email}`
              : "Join WaytoAlgo and start earning"}
          </p>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{
            background: "rgba(10, 14, 30, 0.75)",
            backdropFilter: "blur(24px) saturate(1.5)",
            WebkitBackdropFilter: "blur(24px) saturate(1.5)",
            border: "1px solid rgba(91, 140, 255, 0.20)",
            boxShadow: "0 0 0 1px rgba(91,140,255,0.06) inset, 0 20px 60px rgba(0,0,0,0.5)",
          }}
        >

          {/* ── STEP: FORM ── */}
          {step === "form" && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">

                {/* ── Wallet connect — first step inside the form ── */}
                <div>
                  <div className="text-xs font-medium mb-2" style={LABEL_STYLE}>
                    Connect Wallet <span style={{ color: "rgba(255,100,100,0.8)" }}>*</span>
                  </div>
                  {!connectedAddress ? (
                    <>
                      <button
                        type="button"
                        onClick={handleConnectWallet}
                        disabled={wallet.connecting}
                        className="w-full py-2.5 rounded-xl font-semibold transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
                        style={{
                          background: "rgba(91,140,255,0.10)",
                          border: "1px solid rgba(91,140,255,0.35)",
                          color: TEAL,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          boxShadow: "0 0 12px rgba(91,140,255,0.10)",
                        }}
                      >
                        <Wallet size={15} />
                        {wallet.connecting ? "Connecting…" : "Connect Wallet"}
                      </button>
                      {wallet.error && (
                        <div
                          className="mt-2 p-2.5 rounded-xl text-xs"
                          style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.25)", color: "rgba(255,160,160,0.9)" }}
                        >
                          {wallet.error}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      {/* Address row with inline disconnect */}
                      <div
                        className="w-full h-10 rounded-xl px-3 flex items-center gap-2"
                        style={{
                          background: "rgba(0,20,40,0.6)",
                          border: "1px solid rgba(91,140,255,0.35)",
                        }}
                      >
                        <span className="truncate flex-1" style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "rgba(194,210,255,0.85)" }}>
                          {connectedAddress}
                        </span>
                        <span
                          className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(91,140,255,0.15)", color: TEAL, border: "1px solid rgba(91,140,255,0.3)", letterSpacing: "0.02em" }}
                        >
                          Connected
                        </span>
                        <button
                          type="button"
                          onClick={() => { setConnectedAddress(""); setWalletExists(false); }}
                          className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
                          title="Disconnect wallet"
                          style={{ color: "rgba(194,210,255,0.35)" }}
                        >
                          ✕
                        </button>
                      </div>
                      {/* Already exists warning */}
                      {walletExists && (
                        <div
                          className="flex items-center justify-between p-2.5 rounded-xl text-xs"
                          style={{ background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.3)", color: "rgba(255,200,100,0.9)" }}
                        >
                          <span>⚠ This wallet already has an account.</span>
                          <Link href="/login" className="font-semibold underline" style={{ color: TEAL }}>Sign In</Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isFirstUser && (
                  <div
                    data-testid="banner-first-admin"
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{
                      background: "rgba(91,140,255,0.08)",
                      border: "1px solid rgba(91,140,255,0.25)",
                    }}
                  >
                    <ShieldCheck size={18} style={{ color: TEAL, flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div className="text-xs font-semibold" style={{ color: TEAL, letterSpacing: "0.04em" }}>
                        FIRST ACCOUNT — ADMIN ACCESS
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.65)" }}>
                        You are the first user on this platform. This account will be created as the
                        admin and a referral code is not required.
                      </p>
                    </div>
                  </div>
                )}

                {/* Name */}
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel style={LABEL_STYLE}>Full Name</FormLabel>
                    <FormControl>
                      <Input data-testid="input-name" type="text" placeholder="Your full name" {...field} style={INPUT_STYLE} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Email */}
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel style={LABEL_STYLE}>Email Address</FormLabel>
                    <FormControl>
                      <Input data-testid="input-email" type="email" placeholder="you@example.com" {...field} style={INPUT_STYLE} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Country */}
                <FormField control={form.control} name="countryIso2" render={({ field }) => (
                  <FormItem>
                    <FormLabel style={LABEL_STYLE}>Country</FormLabel>
                    <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <button
                            type="button"
                            data-testid="select-country"
                            className="w-full h-9 rounded-md px-3 flex items-center justify-between text-sm"
                            style={field.value
                              ? INPUT_STYLE
                              : { ...INPUT_STYLE, color: "rgba(194,210,255,0.4)" }}
                          >
                            {field.value
                              ? (() => {
                                  const c = COUNTRY_BY_ISO2[field.value];
                                  return c ? `${c.name} (${c.dialCode})` : field.value;
                                })()
                              : "Search country…"}
                            <ChevronsUpDown size={14} style={{ color: "rgba(91,140,255,0.5)", flexShrink: 0 }} />
                          </button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-0 w-[var(--radix-popover-trigger-width)]"
                        style={{
                          background: "rgba(10,14,30,0.97)",
                          border: "1px solid rgba(91,140,255,0.25)",
                          color: "rgba(194,210,255,0.9)",
                          backdropFilter: "blur(24px)",
                        }}
                        align="start"
                        sideOffset={4}
                      >
                        <Command
                          style={{ background: "transparent", color: "rgba(194,210,255,0.9)" }}
                          filter={(value, search) => {
                            const c = COUNTRY_BY_ISO2[value];
                            if (!c) return 0;
                            const q = search.toLowerCase();
                            if (c.name.toLowerCase().startsWith(q)) return 2;
                            if (c.name.toLowerCase().includes(q) || c.dialCode.includes(q)) return 1;
                            return 0;
                          }}
                        >
                          <CommandInput
                            placeholder="Type to search…"
                            className="text-sm"
                            style={{ color: "rgba(194,210,255,0.9)" }}
                          />
                          <CommandList className="max-h-56">
                            <CommandEmpty style={{ color: "rgba(194,210,255,0.45)" }}>
                              No country found.
                            </CommandEmpty>
                            {COUNTRIES.map((c) => (
                              <CommandItem
                                key={c.iso2}
                                value={c.iso2}
                                data-testid={`option-country-${c.iso2}`}
                                onSelect={(val) => {
                                  field.onChange(val);
                                  setCountryOpen(false);
                                }}
                                className="cursor-pointer flex items-center justify-between gap-2"
                                style={{ color: "rgba(194,210,255,0.85)" }}
                              >
                                <span className="flex items-center gap-2">
                                  <span>{c.name}</span>
                                  <span style={{ color: "rgba(194,210,255,0.4)", fontSize: "0.75rem" }}>
                                    {c.dialCode}
                                  </span>
                                </span>
                                {field.value === c.iso2 && (
                                  <Check size={13} style={{ color: TEAL, flexShrink: 0 }} />
                                )}
                              </CommandItem>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Phone */}
                <FormField control={form.control} name="phoneLocal" render={({ field }) => (
                  <FormItem>
                    <FormLabel style={LABEL_STYLE}>Phone Number</FormLabel>
                    <FormControl>
                      <div
                        className="flex items-stretch rounded-md overflow-hidden"
                        style={{ background: INPUT_STYLE.background, border: INPUT_STYLE.border }}
                      >
                        <div
                          data-testid="text-dial-code"
                          aria-label="Country dial code"
                          className="flex items-center px-3 text-sm select-none"
                          style={{
                            background: "rgba(91,140,255,0.10)",
                            color: selectedCountry ? TEAL : "rgba(194,210,255,0.4)",
                            borderRight: "1px solid rgba(91,140,255,0.18)",
                            fontWeight: 600,
                            minWidth: 64,
                            justifyContent: "center",
                          }}
                          title={selectedCountry ? `${selectedCountry.name} dial code` : "Select a country first"}
                        >
                          {selectedCountry?.dialCode ?? "+—"}
                        </div>
                        <input
                          data-testid="input-phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          placeholder={selectedCountry ? "8123 4567" : "Select country first"}
                          disabled={!selectedCountry}
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value.replace(/[^0-9 \-]/g, ""))}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          className="flex-1 bg-transparent px-3 text-sm focus:outline-none disabled:opacity-60"
                          style={{ color: "rgba(194,210,255,0.9)" }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Password */}
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel style={LABEL_STYLE}>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          data-testid="input-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Min 6 characters"
                          {...field}
                          style={{ ...INPUT_STYLE, paddingRight: "2.5rem" }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(p => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff size={15} style={{ color: TEAL }} /> : <Eye size={15} style={{ color: TEAL }} />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Referral */}
                {!isFirstUser && (
                  <FormField control={form.control} name="referralCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel style={LABEL_STYLE}>
                        {requireReferral ? "Referral Code" : "Referral Code (Optional)"}
                        {ref && <span className="ml-2 text-xs" style={{ color: TEAL }}>✓ Auto-filled</span>}
                      </FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-referral"
                          type="text"
                          placeholder="Enter referral code"
                          readOnly={!!ref}
                          {...field}
                          style={{
                            ...INPUT_STYLE,
                            ...(ref ? { opacity: 0.75, cursor: "not-allowed", borderColor: "rgba(91,140,255,0.35)" } : {}),
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <button
                  data-testid="button-submit-register"
                  type="submit"
                  disabled={registerMutation.isPending || sending || !connectedAddress || walletExists}
                  className="w-full py-2.5 rounded-xl font-semibold transition-all duration-200 disabled:opacity-60 mt-2"
                  style={{
                    background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                    color: "#060814",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    boxShadow: "0 0 20px rgba(91,140,255,0.35), 0 4px 16px rgba(0,0,0,0.4)",
                  }}
                >
                  {sending ? "Sending OTP..." : registerMutation.isPending ? "Creating account..." : "Create Account"}
                </button>
              </form>
            </Form>
          )}

          {/* ── STEP: OTP ── */}
          {step === "otp" && (
            <div className="space-y-5">
              <div
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.14)" }}
              >
                <Mail size={18} style={{ color: TEAL, flexShrink: 0 }} />
                <p className="text-xs" style={{ color: "rgba(194,210,255,0.6)" }}>
                  Enter the 6-digit code sent to <span style={{ color: TEAL }}>{formData?.email}</span>
                </p>
              </div>

              <div>
                <label className="text-xs font-medium block mb-2" style={LABEL_STYLE}>Verification Code</label>
                <input
                  data-testid="input-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full rounded-xl px-3 py-3 text-center text-2xl font-bold tracking-[0.4em] focus:outline-none"
                  style={{
                    background: "rgba(0,20,40,0.7)",
                    border: "1px solid rgba(91,140,255,0.25)",
                    color: TEAL,
                    letterSpacing: "0.4em",
                  }}
                />
              </div>

              <button
                data-testid="button-verify-otp"
                onClick={handleOtpSubmit}
                disabled={registerMutation.isPending || otp.length !== 6}
                className="w-full py-2.5 rounded-xl font-bold transition-all disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                  color: "#060814",
                  letterSpacing: "0.04em",
                  boxShadow: "0 0 20px rgba(91,140,255,0.35)",
                }}
              >
                {registerMutation.isPending ? "Verifying..." : "Verify & Create Account"}
              </button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setStep("form"); setOtp(""); }}
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: "rgba(194,210,255,0.4)" }}
                >
                  <ArrowLeft size={12} /> Back
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={sending}
                  className="text-xs font-medium"
                  style={{ color: TEAL }}
                >
                  {sending ? "Sending..." : "Resend code"}
                </button>
              </div>
            </div>
          )}

          {step === "form" && (
            <>
              <div className="mt-5 text-center text-sm" style={{ color: "rgba(194,210,255,0.4)" }}>
                Already have an account?{" "}
                <Link href="/login" style={{ color: TEAL, fontWeight: 600 }} className="hover:underline">Sign In</Link>
              </div>
              <div className="mt-3 text-xs text-center" style={{ color: "rgba(194,210,255,0.3)" }}>
                By registering, you agree to our{" "}
                <Link href="/terms" style={{ color: TEAL }} className="hover:underline">Terms</Link> and{" "}
                <Link href="/privacy" style={{ color: TEAL }} className="hover:underline">Privacy Policy</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
