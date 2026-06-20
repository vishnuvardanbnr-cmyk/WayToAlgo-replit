import { useEffect, useState, ReactNode, ComponentType } from "react";
import { useForm } from "react-hook-form";
import { useGetAdminSettings, useUpdateAdminSettings, getGetAdminSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import AdminTokenReferral from "@/components/AdminTokenReferral";
import AdminTokenSafeReferral from "@/components/AdminTokenSafeReferral";
import AdminTokenDistribution from "@/components/AdminTokenDistribution";
import AdminSellForUser from "@/components/AdminSellForUser";
import {
  Settings, Save, Mail, Eye, EyeOff, Wallet, ShieldAlert, RefreshCw, Database,
  AlertTriangle, CheckCircle2, ArrowUpRight, TrendingUp, SlidersHorizontal, Coins, Server,
  Layers, BadgeDollarSign, Search, ChevronLeft, ChevronRight, X, Upload, FileArchive, Users,
  KeyRound, RotateCcw,
} from "lucide-react";

const TEAL = "#00FF94";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" } as const;
const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors";
const INPUT_STYLE = {
  background: "rgba(0,20,40,0.7)",
  border: "1px solid rgba(0,255,148,0.18)",
  color: "rgba(176,255,224,0.9)",
};
const SAVE_BTN_STYLE = {
  background: "linear-gradient(135deg, #00FF94, #00CC77)",
  color: "#050C0A",
  letterSpacing: "0.04em",
  boxShadow: "0 0 20px rgba(0,255,148,0.3)",
};
const ORBITRON_GRADIENT_STYLE = {
  fontFamily: "'Sora', sans-serif",
  background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent" as const,
  backgroundClip: "text",
};

type TabKey = "general" | "blockchain" | "withdrawals" | "income" | "email" | "maintenance";

const TABS: { key: TabKey; label: string; icon: ComponentType<{ size?: number; style?: any }>; desc: string }[] = [
  { key: "general",     label: "General",       icon: SlidersHorizontal, desc: "Deposit limits, platform toggles, launch offer countdown" },
  { key: "blockchain",  label: "Blockchain",    icon: Wallet,            desc: "Master wallet, gas wallet, BSC RPC and minimum deposit" },
  { key: "withdrawals", label: "Withdrawals",   icon: ArrowUpRight,      desc: "Processing mode and the withdrawal wallet that pays users" },
  { key: "income",      label: "Income",        icon: TrendingUp,        desc: "Spot referral, daily tier rates, level commissions and unlocks" },
  { key: "email",       label: "Email & SMTP",  icon: Mail,              desc: "SMTP credentials and which user actions trigger email OTPs" },
  { key: "maintenance", label: "Maintenance",   icon: RefreshCw,         desc: "Regenerate user deposit addresses and review backed-up keys" },
];

type SettingsForm = {
  maintenanceMode: boolean;
  minDeposit: number;
  maxDeposit: number;
  maxTotalInvestment: number;
  hyperCoinMinPercent: number;
  hyperCoinPrice: number;
  spotReferralRate: number;
  launchOfferActive: boolean;
  withdrawalEnabled: boolean;
  autoRoiEnabled: boolean;
  launchOfferEndDate: string;
  hcDepositUsername: string;
  withdrawalCoolingHours: number;
  maxTokenBuyUsdt: number;
};

type IncomeForm = {
  spotReferralRate: number;
  planDays: number;
  planMinAmount: number;
  levelCommissionPoolPct: number;
  levelCommL1: number;
  levelCommL2: number;
  levelCommL3: number;
  levelCommL4: number;
  levelCommL5: number;
  levelCommL6: number;
  levelCommL7: number;
  levelCommL8: number;
  levelCommL9: number;
  levelCommL10: number;
  levelUnlockL2: number;
  levelUnlockL3: number;
  levelUnlockL4: number;
  levelUnlockL5: number;
  levelUnlockL6: number;
  levelUnlockL7: number;
  levelUnlockL8: number;
  levelUnlockL9: number;
  levelUnlockL10: number;
  levelDaysL1: number;
  levelDaysL2: number;
  levelDaysL3: number;
  levelDaysL4: number;
  levelDaysL5: number;
  levelDaysL6: number;
  levelDaysL7: number;
  levelDaysL8: number;
  levelDaysL9: number;
  levelDaysL10: number;
  levelDirectsL1: number;
  levelDirectsL2: number;
  levelDirectsL3: number;
  levelDirectsL4: number;
  levelDirectsL5: number;
  levelDirectsL6: number;
  levelDirectsL7: number;
  levelDirectsL8: number;
  levelDirectsL9: number;
  levelDirectsL10: number;
  dailyRoiRate: number;
  earningsCapEnabled: boolean;
  earningsCapBase: number;
  earningsCapBoosted: number;
};

type SmtpForm = {
  smtpEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
  smtpFromName: string;
  otpRegistrationEnabled: boolean;
  otpWithdrawalEnabled: boolean;
  otpWalletUpdateEnabled: boolean;
  depositConfirmationEnabled: boolean;
  backupEmail: string;
  telegramBotToken: string;
  telegramChatId: string;
};

function getToken() {
  return localStorage.getItem("waytoalgo_token") || "";
}

async function fetchSmtpSettings(): Promise<SmtpForm> {
  const res = await fetch("/api/admin/smtp-settings", {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Failed to load SMTP settings");
  return res.json();
}

async function saveSmtpSettings(data: SmtpForm): Promise<SmtpForm> {
  const res = await fetch("/api/admin/smtp-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to save SMTP settings");
  }
  return res.json();
}

/** A standardized section card with icon header + description + body. */
function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  accent = TEAL,
}: {
  icon: ComponentType<{ size?: number; style?: any }>;
  title: string;
  description: string;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <section className="rounded-2xl overflow-hidden" style={GLASS}>
      <header
        className="px-5 md:px-6 py-4 flex items-start gap-3"
        style={{ borderBottom: `1px solid ${accent}1A` }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${accent}25, ${accent}10)`,
            border: `1px solid ${accent}40`,
          }}
        >
          <Icon size={17} style={{ color: accent }} />
        </div>
        <div className="min-w-0">
          <h2
            className="text-base md:text-lg font-bold leading-tight"
            style={{
              ...ORBITRON_GRADIENT_STYLE,
              letterSpacing: "0.03em",
            }}
          >
            {title}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.5)" }}>
            {description}
          </p>
        </div>
      </header>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

/** A subsection rule: small uppercase label with a teal divider. */
function SubHeader({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="pb-2" style={{ borderBottom: "1px solid rgba(0,255,148,0.10)" }}>
      <h3
        className="font-semibold text-[11px] tracking-[0.18em] uppercase"
        style={{ color: "rgba(176,255,224,0.55)" }}
      >
        {children}
      </h3>
      {hint && (
        <p className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.35)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-xs font-medium block mb-1.5" style={{ color: "rgba(176,255,224,0.6)" }}>
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.35)" }}>
      {children}
    </p>
  );
}

function SaveButton({
  pending,
  pendingLabel = "Saving…",
  label = "Save Settings",
}: { pending: boolean; pendingLabel?: string; label?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full md:w-auto md:px-8 py-3 rounded-xl font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
      style={SAVE_BTN_STYLE}
    >
      <Save size={16} />
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function AdminSettings() {
  const { data: settings, isLoading } = useGetAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>("general");

  const { register, handleSubmit, reset } = useForm<SettingsForm>();

  const smtpForm = useForm<SmtpForm>({
    defaultValues: {
      smtpEnabled: false,
      smtpHost: "",
      smtpPort: 587,
      smtpUser: "",
      smtpPassword: "",
      smtpFrom: "",
      smtpFromName: "WaytoAlgo",
      otpRegistrationEnabled: false,
      otpWithdrawalEnabled: false,
      otpWalletUpdateEnabled: false,
      depositConfirmationEnabled: false,
      backupEmail: "",
      telegramBotToken: "",
      telegramChatId: "",
    },
  });

  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [triggeringBackup, setTriggeringBackup] = useState(false);
  const [backupTriggerMsg, setBackupTriggerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [rotateSecret, setRotateSecret] = useState("");
  const [rotateConfirm, setRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateResult, setRotateResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (settings) reset(settings as SettingsForm);
  }, [settings]);

  useEffect(() => {
    setSmtpLoading(true);
    fetchSmtpSettings()
      .then(data => smtpForm.reset(data))
      .catch(() => {})
      .finally(() => setSmtpLoading(false));
  }, []);

  const onSubmit = async (data: SettingsForm) => {
    try {
      await updateSettings.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
      toast({ title: "Settings updated!" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
  };

  const onSmtpSubmit = async (data: SmtpForm) => {
    setSmtpSaving(true);
    try {
      const updated = await saveSmtpSettings(data);
      smtpForm.reset(updated);
      toast({ title: "SMTP settings saved!" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setSmtpSaving(false);
    }
  };

  const triggerBackupNow = async () => {
    setTriggeringBackup(true);
    setBackupTriggerMsg(null);
    try {
      const res = await fetch("/api/admin/trigger-backup", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setBackupTriggerMsg({ ok: data.success, text: data.message });
    } catch {
      setBackupTriggerMsg({ ok: false, text: "Request failed" });
    } finally {
      setTriggeringBackup(false);
    }
  };

  // Wallet settings + regenerate state
  const [walletStats, setWalletStats] = useState<{ totalWithAddress: number; backupCount: number } | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenResult, setRegenResult] = useState<{ regenerated: number; backed_up: number; message: string } | null>(null);

  // Reset for Live
  const [resetForLiveStep, setResetForLiveStep] = useState<"idle" | "confirm" | "typing">("idle");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetNewEmail, setResetNewEmail] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetNewWalletAddress, setResetNewWalletAddress] = useState("");
  const [resetShowPass, setResetShowPass] = useState(false);
  const [resetShowConfirmPass, setResetShowConfirmPass] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const resetForLiveClear = () => {
    setResetForLiveStep("idle");
    setResetConfirmText("");
    setResetNewEmail("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setResetNewWalletAddress("");
    setResetShowPass(false);
    setResetShowConfirmPass(false);
  };

  const doResetForLive = async () => {
    if (resetConfirmText !== "RESET FOR LIVE") {
      toast({ title: "Confirmation text doesn't match", variant: "destructive" });
      return;
    }
    if (!resetNewEmail) {
      toast({ title: "New admin email is required", variant: "destructive" });
      return;
    }
    if (resetNewPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setResetting(true);
    try {
      const r = await fetch("/api/admin/reset-for-live", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ confirm: "RESET FOR LIVE", newEmail: resetNewEmail, newPassword: resetNewPassword, ...(resetNewWalletAddress ? { newWalletAddress: resetNewWalletAddress } : {}) }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Failed"); }
      setResetDone(true);
      resetForLiveClear();
      toast({ title: "Reset complete", description: "All non-admin data cleared and admin credentials updated" });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err?.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  type ServerStatus = { heapUsed: number; heapTotal: number; rss: number; external: number; uptimeSeconds: number };
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [serverStatusLoading, setServerStatusLoading] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartDone, setRestartDone] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupSearch, setBackupSearch] = useState("");
  const [backupPage, setBackupPage] = useState(1);
  const BACKUP_PAGE_SIZE = 5;

  // DB Restore
  const [restoreMode, setRestoreMode] = useState<"single" | "multipart">("single");
  const [restoreFiles, setRestoreFiles] = useState<File[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const loadWalletStats = () => {
    fetch("/api/admin/wallet-stats", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => setWalletStats(d))
      .catch(() => {});
  };

  const loadServerStatus = () => {
    setServerStatusLoading(true);
    fetch("/api/admin/server-status", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => setServerStatus(d))
      .catch(() => {})
      .finally(() => setServerStatusLoading(false));
  };

  const doServerRestart = async () => {
    setRestarting(true);
    setConfirmRestart(false);
    try {
      await fetch("/api/admin/server-restart", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setRestartDone(true);
      // Poll until server comes back, then reload status
      const poll = setInterval(async () => {
        try {
          const r = await fetch("/api/admin/server-status", { headers: { Authorization: `Bearer ${getToken()}` } });
          if (r.ok) {
            const d = await r.json();
            setServerStatus(d);
            setRestarting(false);
            clearInterval(poll);
          }
        } catch { /* still restarting */ }
      }, 1500);
    } catch {
      setRestarting(false);
    }
  };

  const doRegenerate = async () => {
    setRegenerating(true);
    setConfirmRegen(false);
    setRegenResult(null);
    try {
      const res = await fetch("/api/admin/wallet-settings/regenerate-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setRegenResult(data);
      loadWalletStats();
      toast({ title: "Wallets regenerated!", description: data.message });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  const loadBackups = () => {
    setBackupsLoading(true);
    fetch("/api/admin/wallet-backups", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => setBackups(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setBackupsLoading(false));
  };

  // Income settings
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [reserveTokenBalance, setReserveTokenBalance] = useState(0);
  const incomeForm = useForm<IncomeForm>({
    defaultValues: {
      spotReferralRate: 5,
      planDays: 300,
      planMinAmount: 100,
      levelCommissionPoolPct: 50,
      dailyRoiRate: 0.4,
      earningsCapEnabled: true,
      earningsCapBase: 2,
      earningsCapBoosted: 3,
      levelCommL1: 20, levelCommL2: 10, levelCommL3: 10,
      levelCommL4: 4, levelCommL5: 4, levelCommL6: 4, levelCommL7: 4, levelCommL8: 4, levelCommL9: 4, levelCommL10: 4,
      levelUnlockL2: 1000, levelUnlockL3: 3000,
      levelUnlockL4: 10000, levelUnlockL5: 10000, levelUnlockL6: 10000, levelUnlockL7: 10000, levelUnlockL8: 10000, levelUnlockL9: 10000, levelUnlockL10: 10000,
      levelDaysL1: 0, levelDaysL2: 0, levelDaysL3: 0, levelDaysL4: 0,
      levelDaysL5: 0, levelDaysL6: 0, levelDaysL7: 0, levelDaysL8: 0, levelDaysL9: 0, levelDaysL10: 0,
      levelDirectsL1: 0, levelDirectsL2: 0, levelDirectsL3: 0, levelDirectsL4: 0, levelDirectsL5: 0,
      levelDirectsL6: 0, levelDirectsL7: 0, levelDirectsL8: 0, levelDirectsL9: 0, levelDirectsL10: 0,
    },
  });

  useEffect(() => {
    setIncomeLoading(true);
    fetch("/api/admin/income-settings", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => { incomeForm.reset(d); setReserveTokenBalance(d.reserveTokenBalance ?? 0); })
      .catch(() => {})
      .finally(() => setIncomeLoading(false));
  }, []);

  const onIncomeSubmit = async (data: IncomeForm) => {
    setIncomeSaving(true);
    try {
      const res = await fetch("/api/admin/income-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      incomeForm.reset(updated);
      setReserveTokenBalance(updated.reserveTokenBalance ?? 0);
      toast({ title: "Income settings saved!" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setIncomeSaving(false);
    }
  };

  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSaving, setWalletSaving] = useState(false);
  const [showGasKey, setShowGasKey] = useState(false);
  const [gasWalletKeySet, setGasWalletKeySet] = useState(false);

  // ── Token referral security ──
  const [tokenSecMode, setTokenSecMode] = useState<"open" | "signed">("open");
  const [tokenSignerAddr, setTokenSignerAddr] = useState("");
  const [tokenSignerHasKey, setTokenSignerHasKey] = useState(false);
  const [tokenSignerLoading, setTokenSignerLoading] = useState(false);
  const [tokenSignerGenerating, setTokenSignerGenerating] = useState(false);
  const [tokenSignerSaving, setTokenSignerSaving] = useState(false);
  const walletForm = useForm<{
    adminMasterWallet: string;
    gasWalletPrivateKey: string;
    bscRpcUrl: string;
    minDepositUsdt: number;
    tokenContractAddress: string;
  }>({
    defaultValues: {
      adminMasterWallet: "",
      gasWalletPrivateKey: "",
      bscRpcUrl: "https://bsc-dataseed.binance.org/",
      minDepositUsdt: 1,
      tokenContractAddress: "",
    },
  });

  useEffect(() => {
    setWalletLoading(true);
    fetch("/api/admin/wallet-settings", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => {
        setGasWalletKeySet(!!d.gasWalletKeySet);
        walletForm.reset({
          adminMasterWallet: d.adminMasterWallet ?? "",
          gasWalletPrivateKey: "",
          bscRpcUrl: d.bscRpcUrl ?? "https://bsc-dataseed.binance.org/",
          minDepositUsdt: d.minDepositUsdt ?? 1,
          tokenContractAddress: d.tokenContractAddress ?? "",
        });
      })
      .catch(() => {})
      .finally(() => setWalletLoading(false));
    loadWalletStats();
    loadServerStatus();
  }, []);

  useEffect(() => {
    setTokenSignerLoading(true);
    fetch("/api/admin/token/signer-info", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => {
        setTokenSecMode(d.mode ?? "open");
        setTokenSignerAddr(d.signerAddress ?? "");
        setTokenSignerHasKey(!!d.hasSignerKey);
      })
      .catch(() => {})
      .finally(() => setTokenSignerLoading(false));
  }, []);

  const onWalletSubmit = async (data: { adminMasterWallet: string; gasWalletPrivateKey: string; bscRpcUrl: string; minDepositUsdt: number; tokenContractAddress: string }) => {
    setWalletSaving(true);
    try {
      const body: Record<string, unknown> = {
        adminMasterWallet: data.adminMasterWallet,
        bscRpcUrl: data.bscRpcUrl,
        minDepositUsdt: data.minDepositUsdt,
        tokenContractAddress: data.tokenContractAddress,
      };
      // Only send the key if the admin entered a new one — blank means "keep existing"
      if (data.gasWalletPrivateKey.trim()) body.gasWalletPrivateKey = data.gasWalletPrivateKey.trim();
      const res = await fetch("/api/admin/wallet-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      setGasWalletKeySet(!!updated.gasWalletKeySet);
      walletForm.reset({ ...data, gasWalletPrivateKey: "" });
      toast({ title: "Wallet settings saved!" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setWalletSaving(false);
    }
  };

  // Withdrawal settings
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [withdrawalSaving, setWithdrawalSaving] = useState(false);
  const [showWithdrawKey, setShowWithdrawKey] = useState(false);
  const [withdrawKeySet, setWithdrawKeySet] = useState(false);
  const withdrawalForm = useForm<{
    withdrawalMode: "auto" | "manual";
    withdrawWalletPrivateKey: string;
    withdrawFeeMode: "deduct_from_amount" | "deduct_from_balance";
  }>({
    defaultValues: {
      withdrawalMode: "manual",
      withdrawWalletPrivateKey: "",
      withdrawFeeMode: "deduct_from_amount",
    },
  });

  useEffect(() => {
    setWithdrawalLoading(true);
    fetch("/api/admin/withdrawal-settings", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => {
        setWithdrawKeySet(!!d.withdrawKeySet);
        withdrawalForm.reset({
          withdrawalMode: d.withdrawalMode ?? "manual",
          withdrawWalletPrivateKey: "",
          withdrawFeeMode: d.withdrawFeeMode ?? "deduct_from_amount",
        });
      })
      .catch(() => {})
      .finally(() => setWithdrawalLoading(false));
  }, []);

  const onWithdrawalSubmit = async (data: {
    withdrawalMode: "auto" | "manual";
    withdrawWalletPrivateKey: string;
    withdrawFeeMode: "deduct_from_amount" | "deduct_from_balance";
  }) => {
    setWithdrawalSaving(true);
    try {
      const body: Record<string, unknown> = {
        withdrawalMode: data.withdrawalMode,
        withdrawFeeMode: data.withdrawFeeMode,
      };
      if (data.withdrawWalletPrivateKey.trim()) body.withdrawWalletPrivateKey = data.withdrawWalletPrivateKey.trim();
      const res = await fetch("/api/admin/withdrawal-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      setWithdrawKeySet(!!updated.withdrawKeySet);
      withdrawalForm.reset({
        withdrawalMode: data.withdrawalMode,
        withdrawWalletPrivateKey: "",
        withdrawFeeMode: updated.withdrawFeeMode ?? data.withdrawFeeMode,
      });
      toast({ title: "Withdrawal settings saved!" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setWithdrawalSaving(false);
    }
  };

  const withdrawalMode = withdrawalForm.watch("withdrawalMode");
  const withdrawFeeMode = withdrawalForm.watch("withdrawFeeMode");
  const smtpEnabled = smtpForm.watch("smtpEnabled");
  const earningsCapEnabled = incomeForm.watch("earningsCapEnabled");
  const activeTabMeta = TABS.find(t => t.key === activeTab) ?? TABS[0];

  // Manual ROI payout
  const [payoutRunning, setPayoutRunning] = useState(false);
  const [payoutResult, setPayoutResult] = useState<{ processed: number; skipped: number; errors: number } | null>(null);
  const [payoutError, setPayoutError] = useState("");

  async function runManualPayout() {
    setPayoutRunning(true);
    setPayoutResult(null);
    setPayoutError("");
    try {
      const res = await fetch("/api/admin/run-daily-payout", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Payout failed");
      setPayoutResult({ processed: data.processed, skipped: data.skipped, errors: data.errors });
      toast({ title: "ROI payout completed!", description: `${data.processed} investments processed` });
    } catch (err: any) {
      setPayoutError(err?.message || "Unknown error");
      toast({ title: "Payout failed", description: err?.message, variant: "destructive" });
    } finally {
      setPayoutRunning(false);
    }
  }

  if (isLoading) {
    return (
      <div className="px-4 md:px-6 py-6 max-w-5xl mx-auto space-y-4">
        {[1,2,3].map(i => (
          <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />
        ))}
      </div>
    );
  }

  // Backup viewer derived state (computed here to avoid IIFE crashes in JSX)
  const _bq = backupSearch.toLowerCase().trim();
  const _bFiltered = _bq
    ? backups.filter(b =>
        (b.userName ?? "").toLowerCase().includes(_bq) ||
        (b.userEmail ?? "").toLowerCase().includes(_bq) ||
        (b.oldAddress ?? "").toLowerCase().includes(_bq) ||
        String(b.userId) === _bq,
      )
    : backups;
  const _bTotalPages = Math.max(1, Math.ceil(_bFiltered.length / BACKUP_PAGE_SIZE));
  const _bSafePage = Math.min(backupPage, _bTotalPages);
  const _bPageRows = _bFiltered.slice((_bSafePage - 1) * BACKUP_PAGE_SIZE, _bSafePage * BACKUP_PAGE_SIZE);

  return (
    <div className="px-4 md:px-6 py-6 max-w-5xl mx-auto pb-24 md:pb-10">
      {/* Page Header */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,148,0.2), rgba(0,204,119,0.08))",
              border: "1px solid rgba(0,255,148,0.35)",
              boxShadow: "0 0 20px rgba(0,255,148,0.18)",
            }}
          >
            <Settings size={20} style={{ color: TEAL }} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold leading-tight" style={ORBITRON_GRADIENT_STYLE}>
              Platform Settings
            </h1>
            <p className="text-xs md:text-sm" style={{ color: "rgba(176,255,224,0.5)" }}>
              Configure how the platform behaves, from deposit limits to email delivery.
            </p>
          </div>
        </div>
      </header>

      {/* Tab Strip — sticky just under the global TopNav (h-14) */}
      <div
        className="sticky top-14 z-10 -mx-4 md:mx-0 px-4 md:px-0 pt-2 pb-2 mb-5"
        style={{ background: "rgba(6,8,20,0.92)", backdropFilter: "blur(10px)" }}
      >
        <div
          className="flex gap-1 overflow-x-auto rounded-2xl p-1.5 scrollbar-none"
          style={{
            background: "rgba(10,14,30,0.85)",
            border: "1px solid rgba(0,255,148,0.14)",
            backdropFilter: "blur(14px)",
          }}
        >
          {TABS.map(t => {
            const isActive = activeTab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
                style={
                  isActive
                    ? {
                        background: "linear-gradient(135deg, rgba(0,255,148,0.22), rgba(0,204,119,0.10))",
                        color: TEAL,
                        border: `1px solid ${TEAL}60`,
                        boxShadow: `0 0 12px ${TEAL}30`,
                      }
                    : {
                        color: "rgba(176,255,224,0.55)",
                        border: "1px solid transparent",
                      }
                }
              >
                <Icon size={15} style={{ color: isActive ? TEAL : "rgba(176,255,224,0.55)" }} />
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-2 px-1" style={{ color: "rgba(176,255,224,0.4)" }}>
          {activeTabMeta.desc}
        </p>
      </div>

      {/* ============ GENERAL ============ */}
      {activeTab === "general" && (
        <>
        <SectionCard
          icon={SlidersHorizontal}
          title="General Platform"
          description="Deposit boundaries, hyper coin pricing, master toggles and the launch offer countdown."
        >
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <SubHeader>Deposit & Pricing</SubHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: "Min Deposit (USDT)",           testId: "input-min-deposit",        name: "minDeposit" as const,          type: "number", extra: {} },
                { label: "Max Deposit (USDT)",           testId: "input-max-deposit",        name: "maxDeposit" as const,          type: "number", extra: {} },
                { label: "Max Total Investment (USDT)",  testId: "input-max-total-invest",   name: "maxTotalInvestment" as const,  type: "number", extra: { step: "100", min: "100" } },
                { label: "Min WTA % (0–100)",      testId: "input-hypercoin-pct",      name: "hyperCoinMinPercent" as const,  type: "number", extra: { step: "1", min: "0", max: "100" } },
                { label: "WTA Price (USDT)",       testId: "input-hypercoin-price",    name: "hyperCoinPrice" as const,       type: "number", extra: { step: "0.0001", min: "0.0001" } },
              ].map(f => (
                <div key={f.name}>
                  <FieldLabel>{f.label}</FieldLabel>
                  <input
                    data-testid={f.testId}
                    type={f.type}
                    {...f.extra}
                    {...register(f.name, { valueAsNumber: true })}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
              ))}
            </div>
            <SubHeader>WTA Deposit Account</SubHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>WTA Deposit Username</FieldLabel>
                <input
                  type="text"
                  placeholder="e.g. waytoalgo_official"
                  {...register("hcDepositUsername")}
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                />
                <FieldHint>Users will be shown this username to send WTA to during WTA deposits.</FieldHint>
              </div>
            </div>

            <SubHeader hint="How many hours must pass after an investment is created before ROI payouts and commissions begin.">Investment Cooling Period</SubHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <FieldLabel>Cooling Period (hours)</FieldLabel>
                <input
                  type="number"
                  min="0"
                  step="1"
                  {...register("withdrawalCoolingHours", { valueAsNumber: true })}
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                />
                <FieldHint>Default is 24. Set to 0 to disable the cooling period entirely.</FieldHint>
              </div>
            </div>

            <SubHeader>Platform Toggles</SubHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: "maintenanceMode" as const,   label: "Maintenance Mode",    desc: "Disable all user logins temporarily" },
                { key: "withdrawalEnabled" as const, label: "Withdrawals Enabled", desc: "Allow users to submit withdrawal requests" },
              ].map(item => (
                <label
                  key={item.key}
                  htmlFor={`toggle-${item.key}`}
                  className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                  style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(0,255,148,0.10)" }}
                >
                  <input
                    id={`toggle-${item.key}`}
                    type="checkbox"
                    data-testid={`toggle-${item.key}`}
                    {...register(item.key)}
                    className="w-4 h-4 mt-0.5"
                    style={{ accentColor: TEAL }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.85)" }}>{item.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>{item.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <SaveButton pending={updateSettings.isPending} label="Save General Settings" />
            </div>
          </form>
        </SectionCard>

        <SectionCard
          icon={TrendingUp}
          title="ROI Distribution"
          description="Manually trigger the daily ROI payout for all active investments. The system also runs this automatically Mon–Fri at 03:00 AM IST."
        >
          <div className="space-y-4">
            <label
              htmlFor="toggle-autoRoiEnabled"
              className="flex items-center justify-between gap-4 p-4 rounded-xl cursor-pointer transition-colors"
              style={{ background: "rgba(0,15,30,0.55)", border: "1px solid rgba(0,255,148,0.14)" }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <RefreshCw size={14} className="shrink-0 mt-0.5" style={{ color: TEAL }} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold mb-0.5" style={{ color: "rgba(176,255,224,0.85)" }}>Auto ROI Schedule</div>
                  <div className="text-xs leading-relaxed" style={{ color: "rgba(176,255,224,0.5)" }}>
                    When enabled, daily return + level commissions run automatically <strong style={{ color: "rgba(176,255,224,0.75)" }}>Mon–Fri at 03:00 AM IST</strong>. Disable to pause auto-runs without affecting manual payouts.
                  </div>
                </div>
              </div>
              <input
                id="toggle-autoRoiEnabled"
                type="checkbox"
                data-testid="toggle-autoRoiEnabled"
                {...register("autoRoiEnabled")}
                className="w-4 h-4 shrink-0"
                style={{ accentColor: TEAL }}
              />
            </label>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={runManualPayout}
                disabled={payoutRunning}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
                style={{
                  background: payoutRunning ? "rgba(52,211,153,0.08)" : "linear-gradient(135deg, rgba(52,211,153,0.18), rgba(16,185,129,0.1))",
                  border: "1px solid rgba(52,211,153,0.35)",
                  color: "rgba(52,211,153,0.95)",
                }}
              >
                {payoutRunning
                  ? <><RefreshCw size={14} className="animate-spin" /> Running…</>
                  : <><TrendingUp size={14} /> Run ROI Payout Now</>}
              </button>
            </div>

            {payoutResult && (
              <div className="p-4 rounded-xl space-y-2" style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={14} style={{ color: "rgba(52,211,153,0.9)" }} />
                  <span className="text-xs font-semibold" style={{ color: "rgba(52,211,153,0.9)" }}>Payout completed</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Processed", value: payoutResult.processed, color: "rgba(52,211,153,0.9)" },
                    { label: "Skipped",   value: payoutResult.skipped,   color: "rgba(176,255,224,0.6)" },
                    { label: "Errors",    value: payoutResult.errors,     color: payoutResult.errors > 0 ? "rgba(248,113,113,0.9)" : "rgba(176,255,224,0.4)" },
                  ].map(s => (
                    <div key={s.label} className="text-center p-2 rounded-lg" style={{ background: "rgba(0,10,20,0.4)" }}>
                      <div className="text-lg font-bold" style={{ color: s.color, fontFamily: "'Sora',sans-serif" }}>{s.value}</div>
                      <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {payoutError && (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.3)" }}>
                <AlertTriangle size={14} className="shrink-0" style={{ color: "rgba(248,113,113,0.9)" }} />
                <span className="text-xs" style={{ color: "rgba(248,113,113,0.9)" }}>{payoutError}</span>
              </div>
            )}
          </div>
        </SectionCard>
        </>
      )}

      {/* ============ BLOCKCHAIN ============ */}
      {activeTab === "blockchain" && (
        <>
        <SectionCard
          icon={Wallet}
          title="Blockchain & Wallets"
          description="Master wallet for sweeping USDT, gas wallet for paying BSC fees, RPC endpoint and the on-chain minimum deposit."
        >
          {walletLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: "rgba(0,255,148,0.04)" }} />)}
            </div>
          ) : (
            <form onSubmit={walletForm.handleSubmit(onWalletSubmit)} className="space-y-6">
              {/* Security notice */}
              <div className="flex gap-3 p-3.5 rounded-xl" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.20)" }}>
                <ShieldAlert size={16} className="shrink-0 mt-0.5" style={{ color: "rgba(251,191,36,0.85)" }} />
                <div className="text-xs leading-relaxed" style={{ color: "rgba(251,191,36,0.8)" }}>
                  <strong>Security Notice:</strong> Private keys are encrypted with AES-256-GCM before storage. The gas wallet should hold only enough BNB to cover sweep fees — do not fund it heavily.
                </div>
              </div>

              <SubHeader hint="All swept USDT will be sent here.">Master Wallet — receives all user USDT deposits</SubHeader>
              <div>
                <FieldLabel>Admin Master Wallet Address (BEP-20)</FieldLabel>
                <input
                  type="text"
                  placeholder="0x..."
                  {...walletForm.register("adminMasterWallet")}
                  className={INPUT_CLS + " font-mono"}
                  style={INPUT_STYLE}
                />
              </div>

              <SubHeader hint="This wallet's BNB is used to fund deposit addresses before sweeping USDT.">Gas Wallet — pays BNB fees for sweeping</SubHeader>
              <div>
                <FieldLabel>Gas Wallet Private Key</FieldLabel>
                {gasWalletKeySet && (
                  <div className="flex items-center gap-1.5 mb-2 text-xs" style={{ color: "rgba(74,222,128,0.85)" }}>
                    <CheckCircle2 size={12} />
                    Key is configured — leave blank to keep existing
                  </div>
                )}
                <div className="relative">
                  <input
                    type={showGasKey ? "text" : "password"}
                    placeholder={gasWalletKeySet ? "Leave blank to keep existing key" : "0x... (private key with BNB for gas)"}
                    {...walletForm.register("gasWalletPrivateKey")}
                    className={INPUT_CLS + " pr-10 font-mono"}
                    style={INPUT_STYLE}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGasKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "rgba(176,255,224,0.5)" }}
                    aria-label={showGasKey ? "Hide key" : "Show key"}
                  >
                    {showGasKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <SubHeader hint="The deployed WTA token smart contract on BSC. Required for on-chain buy/sell and ROI distribution.">Token Contract</SubHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>WTA Token Contract Address (BEP-20)</FieldLabel>
                  <input
                    type="text"
                    placeholder="0x... deployed contract address"
                    {...walletForm.register("tokenContractAddress")}
                    className={INPUT_CLS + " font-mono"}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <FieldLabel>Max Token Buy per Transaction (USDT)</FieldLabel>
                  <input
                    type="number" step="1" min="1"
                    placeholder="100"
                    {...register("maxTokenBuyUsdt", { valueAsNumber: true })}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                  <p className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.35)" }}>
                    Cap enforced per on-chain buy transaction. Saved with General Settings.
                  </p>
                </div>
              </div>

              <SubHeader>Network</SubHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Min Deposit (USDT)</FieldLabel>
                  <input
                    type="number" step="0.01" min="0"
                    {...walletForm.register("minDepositUsdt", { valueAsNumber: true })}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <FieldLabel>BSC RPC URL</FieldLabel>
                  <input
                    type="text"
                    placeholder="https://bsc-dataseed.binance.org/"
                    {...walletForm.register("bscRpcUrl")}
                    className={INPUT_CLS + " font-mono"}
                    style={INPUT_STYLE}
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <SaveButton pending={walletSaving} label="Save Wallet Settings" />
              </div>
            </form>
          )}
        </SectionCard>

        <SectionCard
          icon={Coins}
          title="ROI Token Distribution"
          description="Distribute the day's trading profit as WTA — buy new tokens with USDT, or hand out tokens already sent to the withdraw wallet. Preview eligible users and amount before confirming."
        >
          <AdminTokenDistribution />
        </SectionCard>

        <SectionCard
          icon={Coins}
          title="Sell Tokens For User"
          description="Sell WTA tokens on behalf of a user. Enter their wallet address — the platform sells the tokens from the withdraw wallet and credits the USDT proceeds directly to the user's Withdraw Balance."
        >
          <AdminSellForUser />
        </SectionCard>

        <SectionCard
          icon={Users}
          title="Token Referral Rewards (On-Chain)"
          description="Per-level token reward paid to a buyer's upline on every on-chain purchase. Set via the contract owner wallet in MetaMask."
        >
          <AdminTokenReferral />
        </SectionCard>

        <SectionCard
          icon={Users}
          title="Safe Invest Referral Rewards (On-Chain)"
          description="Separate per-level scheme that applies only to Safe Invest token purchases. Level 6 is reserved for the admin master wallet. Set via the contract owner wallet in MetaMask."
        >
          <AdminTokenSafeReferral />
        </SectionCard>

        <SectionCard
          icon={ShieldAlert}
          title="Token Buy — Referral Security Mode"
          description="Controls whether every on-chain buy() must carry a server-issued ECDSA signature that locks in the referrers array. SIGNED mode prevents users from bypassing the platform's referral tree."
        >
          {tokenSignerLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: "rgba(0,255,148,0.04)" }} />)}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Mode toggle */}
              <div className="flex gap-3 items-start p-4 rounded-xl" style={{ background: tokenSecMode === "signed" ? "rgba(0,255,148,0.07)" : "rgba(255,255,255,0.03)", border: `1px solid ${tokenSecMode === "signed" ? "rgba(0,255,148,0.25)" : "rgba(255,255,255,0.08)"}` }}>
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: "rgba(176,255,224,0.9)" }}>
                    {tokenSecMode === "signed" ? "SIGNED mode — server signature required" : "OPEN mode — no signature required"}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.45)" }}>
                    {tokenSecMode === "signed"
                      ? "Every buy() call is authorised by the backend. Referrers are locked server-side — users cannot self-refer."
                      : "Anyone can pass any referrers array. Suitable only while testing or when referral fraud risk is acceptable."}
                  </div>
                </div>
                <button
                  disabled={tokenSignerSaving}
                  onClick={async () => {
                    const next = tokenSecMode === "open" ? "signed" : "open";
                    if (next === "signed" && !tokenSignerHasKey) {
                      toast({ title: "Generate a signer key first", description: "Click 'Generate New Signer Key' before enabling signed mode.", variant: "destructive" });
                      return;
                    }
                    setTokenSignerSaving(true);
                    try {
                      await fetch("/api/admin/token/signer-mode", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
                        body: JSON.stringify({ mode: next }),
                      });
                      setTokenSecMode(next);
                      toast({ title: `Switched to ${next.toUpperCase()} mode` });
                    } catch { toast({ title: "Save failed", variant: "destructive" }); }
                    finally { setTokenSignerSaving(false); }
                  }}
                  className="relative w-11 h-6 rounded-full transition-all shrink-0"
                  style={{
                    background: tokenSecMode === "signed" ? "rgba(0,255,148,0.18)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${tokenSecMode === "signed" ? "rgba(0,255,148,0.45)" : "rgba(255,255,255,0.10)"}`,
                  }}
                >
                  <span className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{
                    left: tokenSecMode === "signed" ? "22px" : "2px",
                    background: tokenSecMode === "signed" ? TEAL : "rgba(176,255,224,0.5)",
                    boxShadow: tokenSecMode === "signed" ? `0 0 8px ${TEAL}` : "none",
                  }} />
                </button>
              </div>

              {/* Signer address */}
              <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(0,255,148,0.08)" }}>
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(176,255,224,0.35)" }}>Platform Signer Address</div>
                <div className="font-mono text-xs break-all" style={{ color: tokenSignerAddr ? "rgba(176,255,224,0.85)" : "rgba(176,255,224,0.3)" }}>
                  {tokenSignerAddr || "— not generated yet —"}
                </div>
                {tokenSignerAddr && (
                  <div className="text-[10px] mt-1" style={{ color: "rgba(251,191,36,0.75)" }}>
                    Call <strong>setTrustedSigner("{tokenSignerAddr}")</strong> on the contract via the owner wallet to activate SIGNED mode on-chain.
                  </div>
                )}
              </div>

              {/* Generate button */}
              <div className="flex gap-3 items-center">
                <button
                  disabled={tokenSignerGenerating}
                  onClick={async () => {
                    if (!confirm("Generate a NEW signer key? The old key (if any) will be overwritten and on-chain txs that used the old address will stop working until you call setTrustedSigner() with the new address.")) return;
                    setTokenSignerGenerating(true);
                    try {
                      const r = await fetch("/api/admin/token/generate-signer", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${getToken()}` },
                      });
                      const d = await r.json();
                      setTokenSignerAddr(d.signerAddress ?? "");
                      setTokenSignerHasKey(true);
                      toast({ title: "New signer key generated", description: d.message });
                    } catch { toast({ title: "Key generation failed", variant: "destructive" }); }
                    finally { setTokenSignerGenerating(false); }
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "rgba(0,255,148,0.12)", border: "1px solid rgba(0,255,148,0.30)", color: TEAL }}
                >
                  {tokenSignerGenerating ? "Generating…" : (tokenSignerHasKey ? "Regenerate Signer Key" : "Generate New Signer Key")}
                </button>
                <div className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>
                  The private key is stored AES-256-GCM encrypted in the database.
                </div>
              </div>

              {/* Instructions */}
              <div className="rounded-xl p-4 space-y-2" style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.18)" }}>
                <div className="text-xs font-semibold" style={{ color: "rgba(176,210,255,0.85)" }}>Setup checklist</div>
                <ol className="list-decimal list-inside space-y-1 text-xs" style={{ color: "rgba(176,210,255,0.65)" }}>
                  <li>Click <em>Generate New Signer Key</em> to create a fresh keypair.</li>
                  <li>Copy the signer address shown above.</li>
                  <li>Open your contract owner wallet (MetaMask) and call <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>setTrustedSigner(address)</code> on the contract.</li>
                  <li>Once the transaction confirms, enable SIGNED mode with the toggle above.</li>
                  <li>To disable: flip the toggle to OPEN, then call <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>setTrustedSigner(0x000…000)</code>.</li>
                </ol>
              </div>
            </div>
          )}
        </SectionCard>
        </>
      )}

      {/* ============ WITHDRAWALS ============ */}
      {activeTab === "withdrawals" && (
        <SectionCard
          icon={ArrowUpRight}
          title="Withdrawal Settings"
          description="Choose how user payouts are processed and which wallet sends USDT to users."
        >
          {withdrawalLoading ? (
            <div className="space-y-3">
              {[1,2].map(i => <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: "rgba(0,255,148,0.04)" }} />)}
            </div>
          ) : (
            <form onSubmit={withdrawalForm.handleSubmit(onWithdrawalSubmit)} className="space-y-6">
              <div className="flex gap-3 p-3.5 rounded-xl" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.20)" }}>
                <ShieldAlert size={16} className="shrink-0 mt-0.5" style={{ color: "rgba(251,191,36,0.85)" }} />
                <div className="text-xs leading-relaxed" style={{ color: "rgba(251,191,36,0.8)" }}>
                  <strong>Security Notice:</strong> The withdrawal wallet private key is encrypted with AES-256-GCM before storage — it is never returned in API responses. This wallet should hold USDT for payouts. BNB top-ups come from the gas wallet when balance is low.
                </div>
              </div>

              <SubHeader>Processing Mode</SubHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["manual", "auto"] as const).map(mode => (
                  <label
                    key={mode}
                    className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: withdrawalMode === mode ? "rgba(0,255,148,0.14)" : "rgba(0,15,30,0.5)",
                      border: `1px solid ${withdrawalMode === mode ? "rgba(0,255,148,0.5)" : "rgba(0,255,148,0.10)"}`,
                      boxShadow: withdrawalMode === mode ? "0 0 16px rgba(0,255,148,0.18)" : "none",
                    }}
                  >
                    <input
                      type="radio"
                      value={mode}
                      {...withdrawalForm.register("withdrawalMode")}
                      className="sr-only"
                    />
                    <div className="text-base font-bold capitalize" style={{ color: withdrawalMode === mode ? TEAL : "rgba(176,255,224,0.6)" }}>
                      {mode}
                    </div>
                    <div className="text-xs text-center" style={{ color: "rgba(176,255,224,0.4)" }}>
                      {mode === "manual" ? "Admin approves each request" : "On-chain send on submit"}
                    </div>
                  </label>
                ))}
              </div>

              {withdrawalMode === "auto" && (
                <div className="flex gap-2 p-3 rounded-xl" style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.18)" }}>
                  <div className="text-xs leading-relaxed" style={{ color: "rgba(176,255,224,0.6)" }}>
                    In <strong style={{ color: TEAL }}>Auto</strong> mode, USDT is sent on-chain immediately when a user submits a withdrawal request. Make sure the withdrawal wallet has sufficient USDT balance.
                  </div>
                </div>
              )}

              {/* ── Withdrawal Fee ── */}
              <SubHeader>Withdrawal Fee</SubHeader>
              <div
                className="rounded-xl px-4 py-3 text-xs mb-1"
                style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.09)", color: "rgba(176,255,224,0.5)" }}
              >
                Fee rates are shared with deposit fees — configure them at <strong style={{ color: "rgba(176,255,224,0.75)" }}>cert-edit</strong>. Select how the fee is deducted below.
              </div>

              {/* Fee deduction mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  {
                    value: "deduct_from_amount",
                    label: "Deduct from Amount",
                    desc: "User requests $100, receives $99.50 — balance debited $100",
                  },
                  {
                    value: "deduct_from_balance",
                    label: "Deduct from Balance",
                    desc: "User requests $100, receives $100 — balance debited $100.50",
                  },
                ] as const).map(opt => (
                  <label
                    key={opt.value}
                    className="flex flex-col gap-1.5 p-4 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: withdrawFeeMode === opt.value ? "rgba(0,255,148,0.12)" : "rgba(0,15,30,0.5)",
                      border: `1px solid ${withdrawFeeMode === opt.value ? "rgba(0,255,148,0.45)" : "rgba(0,255,148,0.10)"}`,
                    }}
                  >
                    <input type="radio" value={opt.value} {...withdrawalForm.register("withdrawFeeMode")} className="sr-only" />
                    <span className="text-sm font-bold" style={{ color: withdrawFeeMode === opt.value ? TEAL : "rgba(176,255,224,0.6)" }}>{opt.label}</span>
                    <span className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>{opt.desc}</span>
                  </label>
                ))}
              </div>

              <SubHeader hint="If its BNB runs low, the gas wallet tops it up automatically.">Withdrawal Wallet — sends USDT to users</SubHeader>
              <div>
                <FieldLabel>Withdrawal Wallet Private Key</FieldLabel>
                {withdrawKeySet && (
                  <div className="flex items-center gap-1.5 mb-2 text-xs" style={{ color: "rgba(74,222,128,0.85)" }}>
                    <CheckCircle2 size={12} />
                    Key is configured — leave blank to keep existing
                  </div>
                )}
                <div className="relative">
                  <input
                    type={showWithdrawKey ? "text" : "password"}
                    placeholder={withdrawKeySet ? "Leave blank to keep existing key" : "0x... (private key of wallet holding USDT for payouts)"}
                    {...withdrawalForm.register("withdrawWalletPrivateKey")}
                    className={INPUT_CLS + " pr-10 font-mono"}
                    style={INPUT_STYLE}
                  />
                  <button
                    type="button"
                    onClick={() => setShowWithdrawKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "rgba(176,255,224,0.5)" }}
                    aria-label={showWithdrawKey ? "Hide key" : "Show key"}
                  >
                    {showWithdrawKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <SaveButton pending={withdrawalSaving} label="Save Withdrawal Settings" />
              </div>
            </form>
          )}
        </SectionCard>
      )}

      {/* ============ INCOME ============ */}
      {activeTab === "income" && (
        <SectionCard
          icon={TrendingUp}
          title="Income Settings"
          description="Spot referral, daily tier rates, level commission percentages and the unlock thresholds for each level."
        >
          {incomeLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: "rgba(0,255,148,0.04)" }} />)}
            </div>
          ) : (
            <form onSubmit={incomeForm.handleSubmit(onIncomeSubmit)} className="space-y-7">
              {/* Spot Referral */}
              <div>
                <SubHeader hint="Paid to the sponsor when their referral makes an investment.">
                  <span className="inline-flex items-center gap-1.5"><BadgeDollarSign size={12} />Spot Referral Commission</span>
                </SubHeader>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <FieldLabel>Rate (%)</FieldLabel>
                    <input
                      type="number" step="0.1" min="0" max="100"
                      {...incomeForm.register("spotReferralRate", { valueAsNumber: true })}
                      className={INPUT_CLS} style={INPUT_STYLE}
                    />
                  </div>
                </div>
              </div>

              {/* Investment Plan */}
              <div>
                <SubHeader hint="Returns are distributed as WTA proportional to investment size. The Daily ROI Rate sets the minimum token value distributed each day (eligible principal × rate).">
                  <span className="inline-flex items-center gap-1.5"><Coins size={12} />Investment Plan</span>
                </SubHeader>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                  <div>
                    <FieldLabel>Plan Duration (days)</FieldLabel>
                    <input type="number" min="1"
                      {...incomeForm.register("planDays", { valueAsNumber: true })}
                      className={INPUT_CLS} style={INPUT_STYLE}
                    />
                    <FieldHint>How long each investment runs before completion.</FieldHint>
                  </div>
                  <div>
                    <FieldLabel>Minimum Investment (USDT)</FieldLabel>
                    <input type="number" step="1" min="1"
                      {...incomeForm.register("planMinAmount", { valueAsNumber: true })}
                      className={INPUT_CLS} style={INPUT_STYLE}
                    />
                    <FieldHint>Minimum amount a user can invest in one plan.</FieldHint>
                  </div>
                  <div>
                    <FieldLabel>Daily ROI Rate (%)</FieldLabel>
                    <input type="number" step="0.01" min="0" max="100"
                      {...incomeForm.register("dailyRoiRate", { valueAsNumber: true })}
                      className={INPUT_CLS} style={INPUT_STYLE}
                    />
                    <FieldHint>Flat daily rate. Sets the minimum token distribution required each day (eligible principal × this %).</FieldHint>
                  </div>
                </div>
              </div>

              {/* Earnings Cap */}
              <div>
                <SubHeader hint="Limits how much a user can earn from Trading Profit (ROI) + Team Benefit (level commission) combined, as a multiple of their own personal investment. Spot referral income is not capped. Admins are never capped.">
                  <span className="inline-flex items-center gap-1.5"><Coins size={12} />Earnings Cap</span>
                </SubHeader>
                <div
                  className="flex items-center justify-between gap-4 rounded-xl px-4 py-3 mt-3"
                  style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.20)" }}
                >
                  <div>
                    <div className="text-sm font-bold" style={{ color: "rgba(176,255,224,0.95)" }}>Enable Earnings Cap</div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.5)" }}>
                      When ON, ROI + level earnings stop once a user reaches their cap.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input type="checkbox" className="sr-only" {...incomeForm.register("earningsCapEnabled")} />
                    <div
                      className="w-11 h-6 rounded-full transition-colors"
                      style={{
                        background: earningsCapEnabled ? TEAL : "rgba(0,255,148,0.15)",
                        border: `1px solid ${earningsCapEnabled ? TEAL : "rgba(0,255,148,0.25)"}`,
                        position: "relative",
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                        style={{
                          left: earningsCapEnabled ? "calc(100% - 22px)" : "2px",
                          background: earningsCapEnabled ? "#050C0A" : "rgba(176,255,224,0.4)",
                        }}
                      />
                    </div>
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <FieldLabel>Base Multiplier (×)</FieldLabel>
                    <input type="number" step="0.1" min="1"
                      {...incomeForm.register("earningsCapBase", { valueAsNumber: true })}
                      className={INPUT_CLS} style={INPUT_STYLE}
                    />
                    <FieldHint>Default cap = this × personal investment (e.g. 2 = earn up to 2× invested).</FieldHint>
                  </div>
                  <div>
                    <FieldLabel>Boosted Multiplier (×)</FieldLabel>
                    <input type="number" step="0.1" min="1"
                      {...incomeForm.register("earningsCapBoosted", { valueAsNumber: true })}
                      className={INPUT_CLS} style={INPUT_STYLE}
                    />
                    <FieldHint>Applied when a user's direct referrals' total invested exceeds their own (e.g. 3 = 3× invested).</FieldHint>
                  </div>
                </div>
              </div>

              {/* Token Distribution Split */}
              <div>
                <SubHeader hint="Investors receive the FULL daily ROI as Trading Profit. Level commission is paid ON TOP as this % of that ROI, split across the 10 levels. Unclaimed level commission tokens go to the platform reserve.">
                  <span className="inline-flex items-center gap-1.5"><Coins size={12} />Level Commission</span>
                </SubHeader>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div>
                    <FieldLabel>Total Level Commission (% of daily ROI)</FieldLabel>
                    {(() => {
                      const pct = ([1,2,3,4,5,6,7,8,9,10] as const)
                        .reduce((s, l) => s + (Number(incomeForm.watch(`levelCommL${l}` as keyof IncomeForm)) || 0), 0);
                      const total = 100 + pct;
                      const invShare = (100 / total) * 100;
                      const lvlShare = (pct / total) * 100;
                      const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
                      return (
                        <>
                          <div className="rounded-xl px-3 py-2.5 text-2xl font-black"
                            style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.15)", color: "#00FF94" }}>
                            {fmt(pct)}%
                          </div>
                          <div className="mt-2.5">
                            <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(0,255,148,0.1)" }}>
                              <div style={{ width: `${invShare}%`, background: "rgb(52,211,153)", transition: "width 0.2s" }} />
                              <div style={{ width: `${lvlShare}%`, background: "#00FF94", transition: "width 0.2s" }} />
                            </div>
                            <div className="flex justify-between mt-1.5 text-[11px] font-semibold">
                              <span style={{ color: "rgb(52,211,153)" }}>Investor ROI 100%</span>
                              <span style={{ color: "#00FF94" }}>+ Levels {fmt(pct)}%</span>
                            </div>
                            <FieldHint>Auto-calculated as the sum of the 10 level rates below. Investors always get the full daily ROI; levels get an additional {fmt(pct)}% of it on top, so the platform distributes {fmt(total)}% of ROI in total.</FieldHint>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="col-span-2 rounded-xl p-4" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.12)" }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: "rgba(176,255,224,0.5)" }}>Reserve Wallet (unclaimed level tokens)</div>
                    <div className="text-2xl font-black" style={{ color: "#c084fc" }}>
                      {reserveTokenBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} WTA
                    </div>
                    <div className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.35)" }}>Tokens go here when an investor has no eligible upline for a given level</div>
                  </div>
                </div>
              </div>

              {/* Level Commission Rates */}
              <div>
                <SubHeader hint="Each value is a DIRECT % of the investor's daily ROI paid to that upline level (e.g. L1 = 20 means L1 earns 20% of the ROI). Their sum is the Total Level Commission shown above.">
                  <span className="inline-flex items-center gap-1.5"><Layers size={12} />Level Commission Rates (% of ROI)</span>
                </SubHeader>
                <div className="grid grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
                  {([1,2,3,4,5,6,7,8,9,10] as const).map(lvl => (
                    <div key={lvl}>
                      <FieldLabel>L{lvl}</FieldLabel>
                      <input type="number" step="0.1" min="0" max="100"
                        {...incomeForm.register(`levelCommL${lvl}` as keyof IncomeForm, { valueAsNumber: true })}
                        className={INPUT_CLS + " text-center"} style={INPUT_STYLE}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Level Unlock Thresholds */}
              <div>
                <SubHeader hint="Total earnings required to unlock each level (L1 is always unlocked)">
                  <span className="inline-flex items-center gap-1.5"><Layers size={12} />Level Unlock Thresholds ($)</span>
                </SubHeader>
                <div className="grid grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
                  <div className="p-2.5 rounded-xl flex flex-col items-center justify-center" style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.15)" }}>
                    <span className="text-xs font-bold" style={{ color: TEAL }}>L1</span>
                    <span className="text-[11px] mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>Always</span>
                  </div>
                  {([2,3,4,5,6,7,8,9,10] as const).map(lvl => (
                    <div key={lvl}>
                      <FieldLabel>L{lvl} ($)</FieldLabel>
                      <input type="number" min="0"
                        {...incomeForm.register(`levelUnlockL${lvl}` as keyof IncomeForm, { valueAsNumber: true })}
                        className={INPUT_CLS + " text-center"} style={INPUT_STYLE}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Level Commission Active Days */}
              <div>
                <SubHeader hint="Number of days from investment start that each level earns commission. Set 0 for unlimited (no expiry).">
                  <span className="inline-flex items-center gap-1.5"><Layers size={12} />Level Commission Days (0 = unlimited)</span>
                </SubHeader>
                <div className="grid grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
                  {([1,2,3,4,5,6,7,8,9,10] as const).map(lvl => (
                    <div key={lvl}>
                      <FieldLabel>L{lvl}</FieldLabel>
                      <input type="number" min="0" step="1"
                        {...incomeForm.register(`levelDaysL${lvl}` as keyof IncomeForm, { valueAsNumber: true })}
                        className={INPUT_CLS + " text-center"} style={INPUT_STYLE}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mt-2" style={{ color: "rgba(176,255,224,0.35)" }}>
                  Example: L1 = 180 means the direct upline receives Level 1 commission only for the first 180 days of each investment. After that, L1 commission stops for that investment.
                </p>
              </div>

              {/* Required Active Direct Referrals per Level */}
              <div>
                <SubHeader hint="Minimum number of ACTIVE (invested) direct referrals an upline must have to earn each level's commission. Set 0 to require none.">
                  <span className="inline-flex items-center gap-1.5"><Layers size={12} />Required Active Directs per Level (0 = none)</span>
                </SubHeader>
                <div className="grid grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
                  {([1,2,3,4,5,6,7,8,9,10] as const).map(lvl => (
                    <div key={lvl}>
                      <FieldLabel>L{lvl}</FieldLabel>
                      <input type="number" min="0" step="1"
                        {...incomeForm.register(`levelDirectsL${lvl}` as keyof IncomeForm, { valueAsNumber: true })}
                        className={INPUT_CLS + " text-center"} style={INPUT_STYLE}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mt-2" style={{ color: "rgba(176,255,224,0.35)" }}>
                  Example: L3 = 5 means an upline earns Level 3 commission only if they have at least 5 direct referrals who have invested. "Active" counts a direct only once they have a non-zero invested amount.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <SaveButton pending={incomeSaving} label="Save Income Settings" />
              </div>
            </form>
          )}
        </SectionCard>
      )}

      {/* ============ EMAIL & SMTP ============ */}
      {activeTab === "email" && (
        <SectionCard
          icon={Mail}
          title="Email & SMTP"
          description="Connect your SMTP provider and choose which user actions trigger email OTPs and confirmations."
        >
          {smtpLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: "rgba(0,255,148,0.04)" }} />)}
            </div>
          ) : (
            <form onSubmit={smtpForm.handleSubmit(onSmtpSubmit)} className="space-y-6">
              {/* Global SMTP Toggle */}
              <div
                className="flex items-center justify-between gap-4 p-4 rounded-xl"
                style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.20)" }}
              >
                <div>
                  <div className="text-sm font-bold" style={{ color: "rgba(176,255,224,0.95)" }}>SMTP Enabled</div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.5)" }}>
                    Master switch — must be ON for any email to send
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" className="sr-only" {...smtpForm.register("smtpEnabled")} />
                  <div
                    className="w-11 h-6 rounded-full transition-colors"
                    style={{
                      background: smtpEnabled ? TEAL : "rgba(0,255,148,0.15)",
                      border: `1px solid ${smtpEnabled ? TEAL : "rgba(0,255,148,0.25)"}`,
                      position: "relative",
                    }}
                  >
                    <div
                      className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                      style={{
                        left: smtpEnabled ? "calc(100% - 22px)" : "2px",
                        background: smtpEnabled ? "#050C0A" : "rgba(176,255,224,0.4)",
                      }}
                    />
                  </div>
                </label>
              </div>

              <SubHeader>SMTP Credentials</SubHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <FieldLabel>SMTP Host</FieldLabel>
                  <input
                    type="text"
                    placeholder="smtp.gmail.com"
                    {...smtpForm.register("smtpHost")}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <FieldLabel>Port</FieldLabel>
                  <input
                    type="number"
                    placeholder="587"
                    {...smtpForm.register("smtpPort", { valueAsNumber: true })}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <FieldLabel>SMTP Username</FieldLabel>
                  <input
                    type="text"
                    placeholder="you@gmail.com"
                    {...smtpForm.register("smtpUser")}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <FieldLabel>Password / App Key</FieldLabel>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      {...smtpForm.register("smtpPassword")}
                      className={INPUT_CLS + " pr-10"}
                      style={INPUT_STYLE}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "rgba(176,255,224,0.5)" }}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <FieldLabel>From Email</FieldLabel>
                  <input
                    type="email"
                    placeholder="noreply@waytoalgo.com"
                    {...smtpForm.register("smtpFrom")}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <FieldLabel>From Name</FieldLabel>
                  <input
                    type="text"
                    placeholder="WaytoAlgo"
                    {...smtpForm.register("smtpFromName")}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
              </div>

              <SubHeader>Email Features</SubHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { key: "otpRegistrationEnabled" as const,   label: "OTP on Registration",         desc: "Send email OTP to verify new accounts before they're created" },
                  { key: "otpWithdrawalEnabled" as const,     label: "OTP on Withdrawal",           desc: "Require email OTP verification before processing withdrawal requests" },
                  { key: "otpWalletUpdateEnabled" as const,   label: "OTP on Wallet Address Change", desc: "Require email OTP when a user updates their withdrawal wallet address" },
                  { key: "depositConfirmationEnabled" as const, label: "Deposit Confirmation Email", desc: "Send a confirmation email when a new investment is activated" },
                ].map(item => {
                  const val = smtpForm.watch(item.key);
                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-4 p-3.5 rounded-xl"
                      style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(0,255,148,0.10)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.85)" }}>{item.label}</div>
                        <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>{item.desc}</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input type="checkbox" className="sr-only" {...smtpForm.register(item.key)} />
                        <div
                          className="w-10 h-5 rounded-full transition-colors"
                          style={{
                            background: val ? TEAL : "rgba(0,255,148,0.12)",
                            border: `1px solid ${val ? TEAL : "rgba(0,255,148,0.20)"}`,
                            position: "relative",
                          }}
                        >
                          <div
                            className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                            style={{
                              left: val ? "calc(100% - 18px)" : "2px",
                              background: val ? "#050C0A" : "rgba(176,255,224,0.35)",
                            }}
                          />
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>

              <SubHeader
                hint="Receive a full SQL dump every hour via email and/or Telegram. At least one destination must be configured."
              >
                Automated DB Backup
              </SubHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FieldLabel>Backup Recipient Email</FieldLabel>
                  <input
                    type="email"
                    placeholder="backup@yourdomain.com"
                    {...smtpForm.register("backupEmail")}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                  <FieldHint>
                    A full database backup (.sql.gz) will be emailed here every hour. Requires SMTP enabled. Leave blank to skip email.
                  </FieldHint>
                </div>
              </div>

              {/* Telegram backup */}
              <div
                className="rounded-xl p-4 space-y-4"
                style={{ background: "rgba(0,255,148,0.03)", border: "1px solid rgba(0,255,148,0.10)" }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(0,255,148,0.15)", border: "1px solid rgba(0,255,148,0.3)" }}>
                    <span style={{ color: TEAL, fontSize: 13, fontWeight: 700 }}>✈</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "rgba(176,255,224,0.85)" }}>Telegram Backup</span>
                </div>
                <div
                  className="text-xs leading-relaxed p-3 rounded-lg"
                  style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(0,255,148,0.08)", color: "rgba(176,255,224,0.5)" }}
                >
                  <strong style={{ color: "rgba(176,255,224,0.75)" }}>How to set up:</strong><br />
                  1. Open Telegram and message <strong style={{ color: TEAL }}>@BotFather</strong> → /newbot → copy the bot token.<br />
                  2. Start a chat with your bot (or add it to a group/channel).<br />
                  3. Message <strong style={{ color: TEAL }}>@userinfobot</strong> to get your Chat ID (a number like <code>123456789</code>). For groups, the ID starts with <code>-</code>.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Telegram Bot Token</FieldLabel>
                    <input
                      type="text"
                      placeholder="123456:ABCdefGHI..."
                      {...smtpForm.register("telegramBotToken")}
                      className={INPUT_CLS + " font-mono"}
                      style={INPUT_STYLE}
                    />
                    <FieldHint>From @BotFather. Leave blank to disable Telegram backup.</FieldHint>
                  </div>
                  <div>
                    <FieldLabel>Telegram Chat ID</FieldLabel>
                    <input
                      type="text"
                      placeholder="123456789 or -100123456789"
                      {...smtpForm.register("telegramChatId")}
                      className={INPUT_CLS + " font-mono"}
                      style={INPUT_STYLE}
                    />
                    <FieldHint>Your personal chat ID, group ID, or channel ID.</FieldHint>
                  </div>
                </div>
              </div>

              {/* Manual trigger */}
              <div
                className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl"
                style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.12)" }}
              >
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.85)" }}>Send Backup Now</div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>
                    Immediately trigger a backup email to the address above (must be saved first).
                  </div>
                  {backupTriggerMsg && (
                    <div
                      className="text-xs mt-1.5 font-medium"
                      style={{ color: backupTriggerMsg.ok ? "#34d399" : "#f87171" }}
                    >
                      {backupTriggerMsg.text}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={triggerBackupNow}
                  disabled={triggeringBackup}
                  className="shrink-0 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all hover:brightness-125 disabled:opacity-50"
                  style={{
                    background: "rgba(0,255,148,0.10)",
                    border: "1px solid rgba(0,255,148,0.28)",
                    color: "#00FF94",
                  }}
                >
                  <Database size={13} />
                  {triggeringBackup ? "Sending…" : "Send Now"}
                </button>
              </div>

              <div className="pt-2 flex justify-end">
                <SaveButton pending={smtpSaving} label="Save SMTP Settings" />
              </div>
            </form>
          )}
        </SectionCard>
      )}

      {/* ============ MAINTENANCE ============ */}
      {activeTab === "maintenance" && (
        <>
        <SectionCard
          icon={RefreshCw}
          title="Wallet Maintenance"
          description="Regenerate every user deposit address and review the archived backup keys. Use with caution — this is a destructive operation."
          accent="#f87171"
        >
          <div className="space-y-5">
            {/* Stats row */}
            {walletStats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl text-center" style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.14)" }}>
                  <div className="text-2xl font-bold" style={{ color: TEAL, fontFamily: "'Sora',sans-serif" }}>{walletStats.totalWithAddress}</div>
                  <div className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.5)" }}>Users with wallets</div>
                </div>
                <div className="p-4 rounded-xl text-center" style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.14)" }}>
                  <div className="text-2xl font-bold" style={{ color: TEAL, fontFamily: "'Sora',sans-serif" }}>{walletStats.backupCount}</div>
                  <div className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.5)" }}>Backed-up old keys</div>
                </div>
              </div>
            )}

            <p className="text-xs leading-relaxed" style={{ color: "rgba(176,255,224,0.55)" }}>
              Generates a new independent BEP-20 wallet for every existing user. Each wallet is freshly created (not HD/seed-derived). All old private keys are archived to the backup table before being replaced.
            </p>

            {/* Confirm prompt */}
            {!confirmRegen ? (
              <button
                type="button"
                onClick={() => setConfirmRegen(true)}
                disabled={regenerating}
                className="w-full md:w-auto md:px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{
                  background: "rgba(248,113,113,0.10)",
                  border: "1px solid rgba(248,113,113,0.40)",
                  color: "rgba(248,113,113,0.95)",
                  letterSpacing: "0.03em",
                }}
              >
                <RefreshCw size={15} />
                Regenerate All Deposit Addresses
              </button>
            ) : (
              <div className="p-4 rounded-xl space-y-3" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.35)" }}>
                <div className="flex gap-2 items-start">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: "rgba(248,113,113,0.9)" }} />
                  <p className="text-xs font-medium leading-relaxed" style={{ color: "rgba(248,113,113,0.9)" }}>
                    This will assign a brand-new wallet address to every user. Old addresses are backed up. Users must use their new address for future deposits. Continue?
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={doRegenerate}
                    disabled={regenerating}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: "rgba(248,113,113,0.85)", color: "#fff" }}
                  >
                    {regenerating ? <><RefreshCw size={13} className="animate-spin" /> Regenerating…</> : "Yes, Regenerate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRegen(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.7)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Result */}
            {regenResult && (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)" }}>
                <CheckCircle2 size={14} style={{ color: "rgba(52,211,153,0.9)" }} />
                <span className="text-xs" style={{ color: "rgba(52,211,153,0.9)" }}>{regenResult.message}</span>
              </div>
            )}

            {/* Old Key Backups Viewer */}
            <div style={{ borderTop: "1px solid rgba(0,255,148,0.10)", paddingTop: "16px" }}>
              <button
                type="button"
                onClick={() => { setShowBackups(v => !v); if (!showBackups) loadBackups(); }}
                className="flex items-center gap-2 text-xs font-medium"
                style={{ color: "rgba(176,255,224,0.6)" }}
              >
                <Database size={13} />
                {showBackups ? "Hide" : "View"} Old Key Backups
                {walletStats && walletStats.backupCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: "rgba(0,255,148,0.15)", color: TEAL }}>
                    {walletStats.backupCount}
                  </span>
                )}
              </button>

              {showBackups && (
                  <div className="mt-4 space-y-3">
                    {/* Search */}
                    <div className="relative">
                      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(176,255,224,0.35)" }} />
                      <input
                        value={backupSearch}
                        onChange={e => { setBackupSearch(e.target.value); setBackupPage(1); }}
                        placeholder="Search by name, email or address…"
                        className="w-full text-xs pl-8 pr-8 py-2 rounded-lg outline-none"
                        style={{ background: "rgba(0,15,30,0.7)", border: "1px solid rgba(0,255,148,0.18)", color: "rgba(176,255,224,0.9)" }}
                      />
                      {backupSearch && (
                        <button onClick={() => { setBackupSearch(""); setBackupPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "rgba(176,255,224,0.4)" }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* List */}
                    {backupsLoading ? (
                      <div className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(0,255,148,0.04)" }} />
                    ) : _bPageRows.length === 0 ? (
                      <p className="text-xs text-center py-4" style={{ color: "rgba(176,255,224,0.4)" }}>
                        {backupSearch ? "No backups match your search" : "No backups yet"}
                      </p>
                    ) : (
                      _bPageRows.map(b => (
                        <div
                          key={b.id}
                          className="p-3 rounded-xl space-y-1.5"
                          style={{ background: "rgba(0,15,30,0.6)", border: "1px solid rgba(0,255,148,0.10)" }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium" style={{ color: "rgba(176,255,224,0.7)" }}>{b.userName ?? `User #${b.userId}`}</span>
                            <span className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>{new Date(b.replacedAt).toLocaleDateString()}</span>
                          </div>
                          <div className="text-xs font-mono break-all" style={{ color: "rgba(176,255,224,0.55)" }}>
                            <span style={{ color: "rgba(176,255,224,0.4)" }}>Addr: </span>{b.oldAddress}
                          </div>
                          <div className="text-xs font-mono break-all" style={{ color: "rgba(248,113,113,0.55)" }}>
                            <span style={{ color: "rgba(176,255,224,0.4)" }}>Key: </span>{b.oldPrivateKey}
                          </div>
                        </div>
                      ))
                    )}

                    {/* Pagination */}
                    {_bTotalPages > 1 && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px]" style={{ color: "rgba(176,255,224,0.4)" }}>
                          {_bFiltered.length} result{_bFiltered.length !== 1 ? "s" : ""} — page {_bSafePage} / {_bTotalPages}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            disabled={_bSafePage <= 1}
                            onClick={() => setBackupPage(p => Math.max(1, p - 1))}
                            className="p-1.5 rounded-md disabled:opacity-30 transition-all"
                            style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.18)", color: "#00FF94" }}
                          >
                            <ChevronLeft size={13} />
                          </button>
                          <button
                            disabled={_bSafePage >= _bTotalPages}
                            onClick={() => setBackupPage(p => Math.min(_bTotalPages, p + 1))}
                            className="p-1.5 rounded-md disabled:opacity-30 transition-all"
                            style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.18)", color: "#00FF94" }}
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
              )}
            </div>
          </div>
        </SectionCard>
        <SectionCard
          icon={Database}
          title="Database Restore"
          description="Restore the live database from a backup file. Single file (.sql or .sql.gz) or multiple Telegram part files joined together."
          accent="#f59e0b"
        >
          <div className="space-y-5">
            {/* Warning */}
            <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "rgba(245,158,11,0.85)" }} />
              <p className="text-xs leading-relaxed" style={{ color: "rgba(245,158,11,0.85)" }}>
                This will <strong>overwrite the live database</strong> with the backup. All current data will be replaced. Make sure you upload the correct file(s). <strong>This cannot be undone.</strong>
              </p>
            </div>

            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: "single" as const, label: "Single File", desc: ".sql or .sql.gz", icon: FileArchive },
                { key: "multipart" as const, label: "Multiple Parts", desc: "Telegram split parts", icon: Upload },
              ]).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { setRestoreMode(opt.key); setRestoreFiles([]); setRestoreResult(null); setConfirmRestore(false); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all"
                  style={{
                    background: restoreMode === opt.key ? "rgba(245,158,11,0.12)" : "rgba(0,15,30,0.5)",
                    border: `1px solid ${restoreMode === opt.key ? "rgba(245,158,11,0.5)" : "rgba(0,255,148,0.10)"}`,
                  }}
                >
                  <opt.icon size={18} style={{ color: restoreMode === opt.key ? "#f59e0b" : "rgba(176,255,224,0.4)" }} />
                  <span className="text-sm font-bold" style={{ color: restoreMode === opt.key ? "#f59e0b" : "rgba(176,255,224,0.6)" }}>{opt.label}</span>
                  <span className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>{opt.desc}</span>
                </button>
              ))}
            </div>

            {/* File input */}
            <div>
              <label
                className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl cursor-pointer transition-all"
                style={{ background: "rgba(0,15,30,0.5)", border: "2px dashed rgba(245,158,11,0.3)" }}
              >
                <Upload size={20} style={{ color: "rgba(245,158,11,0.7)" }} />
                <span className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.7)" }}>
                  {restoreMode === "single" ? "Click to select backup file" : "Click to select all part files"}
                </span>
                <span className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>
                  {restoreMode === "single" ? "Accepts .sql or .sql.gz" : "Select all .partXofY.gz files at once"}
                </span>
                <input
                  type="file"
                  multiple={restoreMode === "multipart"}
                  accept={restoreMode === "single" ? ".sql,.gz" : ".gz,.sql"}
                  className="hidden"
                  onChange={e => {
                    const selected = Array.from(e.target.files ?? []);
                    setRestoreFiles(selected);
                    setRestoreResult(null);
                    setConfirmRestore(false);
                  }}
                />
              </label>

              {/* Selected files list */}
              {restoreFiles.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {restoreFiles
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileArchive size={12} style={{ color: "rgba(245,158,11,0.7)", flexShrink: 0 }} />
                          <span className="text-xs font-mono truncate" style={{ color: "rgba(176,255,224,0.8)" }}>{f.name}</span>
                        </div>
                        <span className="text-xs shrink-0" style={{ color: "rgba(176,255,224,0.4)" }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      </div>
                    ))}
                  <p className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.4)" }}>
                    {restoreFiles.length} file{restoreFiles.length > 1 ? "s" : ""} selected — {(restoreFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB total
                  </p>
                </div>
              )}
            </div>

            {/* Result */}
            {restoreResult && (
              <div
                className="flex items-center gap-2 p-3 rounded-xl"
                style={{
                  background: restoreResult.ok ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
                  border: `1px solid ${restoreResult.ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                }}
              >
                {restoreResult.ok
                  ? <CheckCircle2 size={14} style={{ color: "rgba(52,211,153,0.9)" }} />
                  : <AlertTriangle size={14} style={{ color: "rgba(248,113,113,0.9)" }} />}
                <span className="text-xs" style={{ color: restoreResult.ok ? "rgba(52,211,153,0.9)" : "rgba(248,113,113,0.9)" }}>{restoreResult.text}</span>
              </div>
            )}

            {/* Confirm + Restore button */}
            {restoreFiles.length > 0 && !restoring && (
              !confirmRestore ? (
                <button
                  type="button"
                  onClick={() => setConfirmRestore(true)}
                  className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", color: "#f59e0b" }}
                >
                  <Upload size={15} /> Restore Database
                </button>
              ) : (
                <div className="p-4 rounded-xl space-y-3" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.30)" }}>
                  <p className="text-xs font-semibold" style={{ color: "rgba(245,158,11,0.9)" }}>
                    Are you sure? This will overwrite all live data with the backup.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setRestoring(true);
                        setRestoreResult(null);
                        setConfirmRestore(false);
                        try {
                          const form = new FormData();
                          restoreFiles.forEach(f => form.append("files", f));
                          const r = await fetch("/api/admin/db-restore", {
                            method: "POST",
                            headers: { Authorization: `Bearer ${getToken()}` },
                            body: form,
                          });
                          const d = await r.json();
                          setRestoreResult({ ok: d.success, text: d.message });
                          if (d.success) setRestoreFiles([]);
                        } catch {
                          setRestoreResult({ ok: false, text: "Upload failed — check your connection" });
                        } finally {
                          setRestoring(false);
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: "rgba(245,158,11,0.85)", color: "#050C0A" }}
                    >
                      Yes, Restore Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRestore(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.7)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            )}

            {restoring && (
              <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <RefreshCw size={15} className="animate-spin" style={{ color: "#f59e0b" }} />
                <span className="text-sm" style={{ color: "rgba(245,158,11,0.85)" }}>Restoring database — please wait, do not close this page…</span>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          icon={KeyRound}
          title="Rotate Encryption Key"
          description="Replace the master PRIVATE_KEY_SECRET used to encrypt all wallet private keys in the database. All keys are re-encrypted atomically, then the server reloads with the new secret."
          accent="#a78bfa"
        >
          <div className="space-y-4">
            <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.22)" }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "rgba(167,139,250,0.85)" }} />
              <p className="text-xs leading-relaxed" style={{ color: "rgba(167,139,250,0.85)" }}>
                Generate a new secret externally (e.g. <code style={{ background: "rgba(167,139,250,0.12)", padding: "1px 4px", borderRadius: 4 }}>openssl rand -hex 32</code>) and paste it below.
                All encrypted keys are re-encrypted with the new secret before the server reloads. <strong>Back up the new secret immediately</strong> — losing it makes all wallet keys unrecoverable.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(176,255,224,0.55)" }}>
                New Secret (64 hex characters — 32 bytes)
              </label>
              <input
                type="password"
                value={rotateSecret}
                onChange={e => { setRotateSecret(e.target.value); setRotateConfirm(false); setRotateResult(null); }}
                placeholder="e.g. a3f9c1d2e4b5... (64 hex chars)"
                className={INPUT_CLS + " font-mono"}
                style={INPUT_STYLE}
                disabled={rotating}
              />
              {rotateSecret && !/^[0-9a-fA-F]{64}$/i.test(rotateSecret) && (
                <p className="text-xs mt-1" style={{ color: "rgba(248,113,113,0.8)" }}>
                  Must be exactly 64 hex characters ({rotateSecret.replace(/[^0-9a-fA-F]/gi, "").length}/64 valid chars entered)
                </p>
              )}
            </div>

            {rotateResult && (
              <div
                className="flex items-center gap-2 p-3 rounded-xl"
                style={{
                  background: rotateResult.ok ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
                  border: `1px solid ${rotateResult.ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                }}
              >
                {rotateResult.ok
                  ? <CheckCircle2 size={14} style={{ color: "rgba(52,211,153,0.9)" }} />
                  : <AlertTriangle size={14} style={{ color: "rgba(248,113,113,0.9)" }} />}
                <span className="text-xs" style={{ color: rotateResult.ok ? "rgba(52,211,153,0.9)" : "rgba(248,113,113,0.9)" }}>
                  {rotateResult.text}
                </span>
              </div>
            )}

            {!rotateConfirm ? (
              <button
                type="button"
                disabled={rotating || !/^[0-9a-fA-F]{64}$/i.test(rotateSecret)}
                onClick={() => setRotateConfirm(true)}
                className="w-full md:w-auto md:px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.4)", color: "rgba(167,139,250,0.95)", letterSpacing: "0.03em" }}
              >
                <RotateCcw size={14} /> Rotate Key
              </button>
            ) : (
              <div className="p-4 rounded-xl space-y-3" style={{ background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.35)" }}>
                <div className="flex gap-2 items-start">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: "rgba(167,139,250,0.9)" }} />
                  <p className="text-xs font-medium leading-relaxed" style={{ color: "rgba(167,139,250,0.9)" }}>
                    This will re-encrypt all wallet keys and reload the server. Make sure you have saved the new secret somewhere safe before continuing.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={rotating}
                    onClick={async () => {
                      setRotating(true);
                      setRotateResult(null);
                      try {
                        const r = await fetch("/api/admin/rotate-encryption-key", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
                          body: JSON.stringify({ newSecret: rotateSecret }),
                        });
                        const d = await r.json();
                        setRotateResult({ ok: r.ok, text: d.message });
                        if (r.ok) { setRotateSecret(""); setRotateConfirm(false); }
                      } catch {
                        setRotateResult({ ok: false, text: "Request failed — check your connection." });
                      } finally {
                        setRotating(false);
                      }
                    }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: "rgba(167,139,250,0.85)", color: "#050C0A" }}
                  >
                    {rotating ? <><RefreshCw size={13} className="animate-spin" /> Rotating…</> : "Yes, Rotate Now"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotateConfirm(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.7)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          icon={AlertTriangle}
          title="Reset for Live"
          description="Wipe all non-admin users, investments, income, deposits and transactions. Use this to clean test data before going live."
          accent="#f87171"
        >
          <div className="space-y-4">
            <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.20)" }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "rgba(248,113,113,0.85)" }} />
              <p className="text-xs leading-relaxed" style={{ color: "rgba(248,113,113,0.85)" }}>
                This permanently deletes all non-admin user accounts and clears every transaction, income record, deposit, investment, withdrawal and admin balance adjustment. The admin account is kept and its balances are reset to zero. <strong>This cannot be undone.</strong>
              </p>
            </div>

            {resetDone && (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)" }}>
                <CheckCircle2 size={14} style={{ color: "rgba(52,211,153,0.9)" }} />
                <span className="text-xs" style={{ color: "rgba(52,211,153,0.9)" }}>Reset complete — platform is clean and ready for live users.</span>
              </div>
            )}

            {resetForLiveStep === "idle" && (
              <button
                type="button"
                onClick={() => { setResetForLiveStep("confirm"); setResetDone(false); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.35)", color: "rgba(248,113,113,0.9)" }}
              >
                <AlertTriangle size={13} /> Reset for Live
              </button>
            )}

            {resetForLiveStep === "confirm" && (
              <div className="p-4 rounded-xl space-y-3" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.30)" }}>
                <p className="text-xs font-semibold" style={{ color: "rgba(248,113,113,0.9)" }}>
                  Are you absolutely sure? This will delete all test users and transactions.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setResetForLiveStep("typing")}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: "rgba(248,113,113,0.85)", color: "#fff" }}
                  >
                    Yes, continue
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetForLiveStep("idle")}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.7)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {resetForLiveStep === "typing" && (
              <div className="p-4 rounded-xl space-y-3" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.30)" }}>
                <p className="text-xs font-semibold" style={{ color: "rgba(248,113,113,0.9)" }}>
                  Set new admin credentials for after the reset:
                </p>
                {/* Admin wallet address */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "rgba(176,255,224,0.55)" }}>Admin Wallet Address <span style={{ color: "rgba(248,113,113,0.7)" }}>(required for wallet-connect login)</span></label>
                  <input
                    type="text"
                    value={resetNewWalletAddress}
                    onChange={e => setResetNewWalletAddress(e.target.value.trim())}
                    placeholder="0x..."
                    className="w-full rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none"
                    style={{ background: "rgba(0,15,30,0.7)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.9)" }}
                  />
                  {resetNewWalletAddress && !/^0x[a-fA-F0-9]{40}$/.test(resetNewWalletAddress) && (
                    <p className="text-xs mt-1" style={{ color: "rgba(248,113,113,0.85)" }}>Invalid wallet address format</p>
                  )}
                </div>
                {/* New admin email */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "rgba(176,255,224,0.55)" }}>New Admin Email</label>
                  <input
                    type="email"
                    value={resetNewEmail}
                    onChange={e => setResetNewEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                    style={{ background: "rgba(0,15,30,0.7)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.9)" }}
                  />
                </div>
                {/* New password */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "rgba(176,255,224,0.55)" }}>New Password</label>
                  <div className="relative">
                    <input
                      type={resetShowPass ? "text" : "password"}
                      value={resetNewPassword}
                      onChange={e => setResetNewPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none"
                      style={{ background: "rgba(0,15,30,0.7)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.9)" }}
                    />
                    <button type="button" onClick={() => setResetShowPass(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity">
                      {resetShowPass ? <EyeOff size={14} style={{ color: TEAL }} /> : <Eye size={14} style={{ color: TEAL }} />}
                    </button>
                  </div>
                </div>
                {/* Confirm password */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "rgba(176,255,224,0.55)" }}>Confirm Password</label>
                  <div className="relative">
                    <input
                      type={resetShowConfirmPass ? "text" : "password"}
                      value={resetConfirmPassword}
                      onChange={e => setResetConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none"
                      style={{ background: "rgba(0,15,30,0.7)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.9)" }}
                    />
                    <button type="button" onClick={() => setResetShowConfirmPass(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity">
                      {resetShowConfirmPass ? <EyeOff size={14} style={{ color: TEAL }} /> : <Eye size={14} style={{ color: TEAL }} />}
                    </button>
                  </div>
                  {resetConfirmPassword && resetNewPassword !== resetConfirmPassword && (
                    <p className="text-xs mt-1" style={{ color: "rgba(248,113,113,0.85)" }}>Passwords do not match</p>
                  )}
                </div>
                {/* Confirmation text */}
                <div>
                  <p className="text-xs leading-relaxed mb-1" style={{ color: "rgba(248,113,113,0.9)" }}>
                    Type <strong>RESET FOR LIVE</strong> to confirm:
                  </p>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={e => setResetConfirmText(e.target.value)}
                    placeholder="RESET FOR LIVE"
                    className="w-full rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none"
                    style={{ background: "rgba(0,15,30,0.7)", border: "1px solid rgba(248,113,113,0.35)", color: "rgba(248,113,113,0.9)" }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={doResetForLive}
                    disabled={resetting || resetConfirmText !== "RESET FOR LIVE" || !resetNewEmail || resetNewPassword.length < 6 || resetNewPassword !== resetConfirmPassword}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                    style={{ background: "rgba(248,113,113,0.85)", color: "#fff" }}
                  >
                    {resetting ? <><RefreshCw size={13} className="animate-spin" /> Resetting…</> : "Reset Now"}
                  </button>
                  <button
                    type="button"
                    onClick={resetForLiveClear}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.7)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          icon={Server}
          title="Server Status"
          description="Live stats from the VPS — RAM, CPU load, disk, and API process memory."
        >
          <div className="space-y-5">
            {serverStatusLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: "rgba(0,255,148,0.04)" }} />)}
              </div>
            ) : serverStatus ? (
              <>
                {/* ── Stat tiles ── */}
                {(() => {
                  const fmt = (s: number) => {
                    if (s < 60) return `${s}s`;
                    if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
                    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
                    return `${h}h ${m}m`;
                  };
                  const ramPct  = Math.round(serverStatus.ramUsedMB  / serverStatus.ramTotalMB  * 100);
                  const diskPct = serverStatus.diskTotalMB ? Math.round(serverStatus.diskUsedMB / serverStatus.diskTotalMB * 100) : 0;
                  const cpuPct  = Math.min(100, Math.round((serverStatus.loadAvg1m / serverStatus.cpuCores) * 100));

                  const barColor = (pct: number) =>
                    pct > 85 ? "linear-gradient(90deg,#f87171,#ef4444)"
                    : pct > 60 ? "linear-gradient(90deg,#fbbf24,#d97706)"
                    : "linear-gradient(90deg,#00FF94,#00CC77)";

                  const StatBar = ({ label, value, sub, pct, note }: { label: string; value: string; sub?: string; pct: number; note?: string }) => (
                    <div className="p-4 rounded-xl space-y-2.5" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.10)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-base font-bold" style={{ color: TEAL, fontFamily: "'Sora',sans-serif" }}>{value}</div>
                          <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.45)" }}>{label}</div>
                        </div>
                        <div className="text-sm font-bold shrink-0" style={{ color: pct > 85 ? "rgba(248,113,113,0.9)" : pct > 60 ? "rgba(251,191,36,0.9)" : "rgba(52,211,153,0.85)" }}>{pct}%</div>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,255,148,0.08)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor(pct) }} />
                      </div>
                      {sub && <div className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>{sub}</div>}
                    </div>
                  );

                  return (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <StatBar
                          label="Server RAM"
                          value={`${serverStatus.ramUsedMB} / ${serverStatus.ramTotalMB} MB`}
                          sub={`${serverStatus.ramFreeMB} MB free`}
                          pct={ramPct}
                        />
                        <StatBar
                          label="CPU Load (1 min)"
                          value={`${serverStatus.loadAvg1m} avg`}
                          sub={`${serverStatus.cpuCores} cores · 5m: ${serverStatus.loadAvg5m} · 15m: ${serverStatus.loadAvg15m}`}
                          pct={cpuPct}
                        />
                        <StatBar
                          label="Disk Usage"
                          value={serverStatus.diskTotalMB >= 1024
                            ? `${(serverStatus.diskUsedMB/1024).toFixed(1)} / ${(serverStatus.diskTotalMB/1024).toFixed(1)} GB`
                            : `${serverStatus.diskUsedMB} / ${serverStatus.diskTotalMB} MB`}
                          sub={serverStatus.diskTotalMB >= 1024
                            ? `${((serverStatus.diskTotalMB - serverStatus.diskUsedMB)/1024).toFixed(1)} GB free`
                            : `${serverStatus.diskTotalMB - serverStatus.diskUsedMB} MB free`}
                          pct={diskPct}
                        />
                      </div>

                      {/* API process row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: "API Heap Used",  value: `${serverStatus.heapUsed} MB` },
                          { label: "API Heap Total", value: `${serverStatus.heapTotal} MB` },
                          { label: "API RSS",        value: `${serverStatus.rss} MB` },
                          { label: "API Uptime",     value: fmt(serverStatus.processUptimeSeconds) },
                        ].map(s => (
                          <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: "rgba(0,255,148,0.03)", border: "1px solid rgba(0,255,148,0.08)" }}>
                            <div className="text-sm font-bold" style={{ color: "rgba(176,255,224,0.75)", fontFamily: "'Sora',sans-serif" }}>{s.value}</div>
                            <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.35)" }}>{s.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* System uptime */}
                      <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>
                        <span>System uptime:</span>
                        <span style={{ color: "rgba(52,211,153,0.8)" }}>{fmt(serverStatus.sysUptimeSeconds)}</span>
                      </div>
                    </>
                  );
                })()}
              </>
            ) : (
              <p className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>Could not load server status.</p>
            )}

            {restartDone && !restarting && (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)" }}>
                <CheckCircle2 size={14} style={{ color: "rgba(52,211,153,0.9)" }} />
                <span className="text-xs" style={{ color: "rgba(52,211,153,0.9)" }}>Server restarted successfully — memory cleared.</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={loadServerStatus}
                disabled={serverStatusLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.22)", color: TEAL }}
              >
                <RefreshCw size={13} className={serverStatusLoading ? "animate-spin" : ""} />
                Refresh Stats
              </button>

              {!confirmRestart ? (
                <button
                  type="button"
                  onClick={() => setConfirmRestart(true)}
                  disabled={restarting}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                  style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.35)", color: "rgba(248,113,113,0.9)" }}
                >
                  <Server size={13} />
                  {restarting ? <><RefreshCw size={13} className="animate-spin" /> Restarting…</> : "Restart API Server"}
                </button>
              ) : (
                <div className="w-full p-4 rounded-xl space-y-3" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.3)" }}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "rgba(248,113,113,0.9)" }} />
                    <p className="text-xs leading-relaxed" style={{ color: "rgba(248,113,113,0.85)" }}>
                      The API process will restart — <strong>no database data or files will be affected</strong>. Active requests may briefly fail. PM2 will bring it back online in seconds. Continue?
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={doServerRestart}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                      style={{ background: "rgba(248,113,113,0.85)", color: "#fff" }}
                    >
                      <Server size={13} /> Yes, Restart Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRestart(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)", color: "rgba(176,255,224,0.7)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
        </>
      )}
    </div>
  );
}
