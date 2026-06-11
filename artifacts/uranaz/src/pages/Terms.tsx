import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

const DEFAULT_TERMS = `1. Acceptance of Terms
By accessing or using the WaytoAlgo platform, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.

2. Investment Risk Disclosure
All investments carry risk. Past performance does not guarantee future results. The daily returns stated (0.6%–0.8%) are targets based on our trading strategies but are not guaranteed. WaytoAlgo operates across real estate, stocks, forex, and cryptocurrency markets, all of which are subject to market volatility.

3. Eligibility
You must be at least 18 years of age to use this platform. By registering, you represent that you are of legal age in your jurisdiction and have the legal capacity to enter into this agreement.

4. Investment Plans
Investments must be in multiples of $100 USDT. Minimum investment is $100 and maximum is $1,500 per plan. A minimum of 50% of your deposit must be in HYPERCOIN. Returns are distributed every weekday (5 business days per week). Investment duration depends on your plan tier.

5. Referral & Commission Program
WaytoAlgo operates a multi-level referral system. A 5% spot referral commission is paid on the investment amount of your direct referrals. Level commissions (1–8) are paid on return amounts as specified in the commission schedule. Level unlocking is based on your total earnings milestones.

6. HYPERCOIN Requirement
All deposits must include a minimum of 50% in HYPERCOIN. WaytoAlgo is not responsible for the value fluctuation of HYPERCOIN. Users are responsible for understanding the risks associated with HYPERCOIN.

7. Withdrawals
Withdrawal requests are processed within 24–48 business hours. Minimum withdrawal amount is $10 USDT. Withdrawals are processed to the BEP20 wallet address provided in your profile.

8. Account Security
You are responsible for maintaining the confidentiality of your account credentials. You must notify us immediately of any unauthorized use of your account.

9. Termination
WaytoAlgo reserves the right to suspend or terminate any account that violates these terms, engages in fraudulent activity, or otherwise harms the platform or its users.

10. Contact
For any questions regarding these Terms, please contact our support team.`;

export default function Terms() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/legal/terms")
      .then(r => r.json())
      .then(d => setContent(d.content || DEFAULT_TERMS))
      .catch(() => setContent(DEFAULT_TERMS))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto pb-24 md:pb-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => window.history.back()} className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center">
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-xl font-bold">Terms &amp; Conditions</h1>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-muted-foreground text-xs mb-5">Last updated: {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-4 rounded animate-pulse bg-muted" />)}
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {content}
          </div>
        )}
      </div>
    </div>
  );
}
