import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

const DEFAULT_PRIVACY = `1. Information We Collect
We collect information you provide directly to us, such as your name, email address, phone number, country of residence, and cryptocurrency wallet addresses. We also collect transaction data, investment history, and referral information.

2. How We Use Your Information
We use the information we collect to: process your investments and withdrawals; communicate with you about your account; provide customer support; detect and prevent fraud; comply with legal obligations; and improve our platform.

3. Information Sharing
We do not sell, trade, or otherwise transfer your personal information to outside parties except as necessary to operate our platform, comply with law, or protect our rights. Referral relationships within the platform are visible to your upline for commission calculation purposes.

4. Data Security
We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.

5. Cryptocurrency & Blockchain
By nature of blockchain technology, certain transaction data may be publicly visible. Your wallet addresses used for deposits and withdrawals may be recorded on public blockchains.

6. Cookies
We use cookies and similar tracking technologies to improve your experience, analyze platform usage, and maintain your session.

7. Your Rights
You have the right to access, correct, or delete your personal information. You may request a copy of your data or request deletion by contacting us.

8. Data Retention
We retain your personal information for as long as your account is active or as needed to provide services, comply with legal obligations, resolve disputes, and enforce our agreements.

9. Contact Us
If you have questions about this Privacy Policy or our data practices, please contact us through our support channels.`;

export default function Privacy() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/legal/privacy")
      .then(r => r.json())
      .then(d => setContent(d.content || DEFAULT_PRIVACY))
      .catch(() => setContent(DEFAULT_PRIVACY))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto pb-24 md:pb-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => window.history.back()} className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center">
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-xl font-bold">Privacy Policy</h1>
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
