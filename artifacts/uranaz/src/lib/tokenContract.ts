/* ────────────────────────────────────────────────────────────────
   On-chain bonding-curve token (BUY / SELL) — BSC BEP-20.
   Fully on-chain via the user's own wallet (MetaMask). This module is
   completely independent of the platform's off-chain USDT balance,
   deposits and investments.

   NOTE: paste the deployed contract address below once it is live.
   While empty, the UI shows a "not configured yet" state.
   ──────────────────────────────────────────────────────────────── */

// 👇 Set this to your deployed BondingCurveToken address on BSC mainnet.
export const TOKEN_CONTRACT_ADDRESS = "";

// BSC mainnet BEP-20 USDT (18 decimals) — same token the platform already uses.
export const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
export const BSC_CHAIN_ID = "0x38";

// Slippage tolerance for the on-chain min-output guard (1%).
export const SLIPPAGE_BPS = 100; // basis points (100 = 1%)

export function isTokenConfigured(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(TOKEN_CONTRACT_ADDRESS);
}

/* Function selectors (keccak256 of the signature, first 4 bytes) */
const SEL = {
  buy: "5e1f417e", // buy(uint256,uint256,address[])
  sell: "d79875eb", // sell(uint256,uint256)
  getBuyPrice: "018a25e8", // getBuyPrice()
  getSellPrice: "43d32e9c", // getSellPrice()
  quoteBuy: "4beb394c", // quoteBuy(uint256)
  quoteSell: "a64190c4", // quoteSell(uint256)
  totalSupply: "18160ddd", // totalSupply()
  balanceOf: "70a08231", // balanceOf(address)
  allowance: "dd62ed3e", // allowance(address,address)
  approve: "095ea7b3", // approve(address,uint256)
  symbol: "95d89b41", // symbol()
  getTotalLiquidity: "35c7e925", // getTotalLiquidity()
  getLevelPercents: "0a732428", // getLevelPercents()
  setLevelPercents: "605efdc7", // setLevelPercents(uint256[10])
  owner: "8da5cb5b", // owner()
} as const;

// Referral depth — must match BondingCurveToken.LEVELS.
export const REFERRAL_LEVELS = 10;
export const BPS_DENOMINATOR = 10000;

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// keccak256("TokensBought(address,uint256,uint256)") — buyer is indexed (topic1)
const TOKENS_BOUGHT_TOPIC = "0x8442948036198f1146d3a63c3db355d7e0295c2cc5676c755990445da4fdc1c9";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/* ── encoding / decoding helpers (18-decimal assumptions) ── */
const DECIMALS_BASE = 10n ** 18n;

function pad32(hexNoPrefix: string): string {
  return hexNoPrefix.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function encUint(value: bigint): string {
  return pad32(value.toString(16));
}

function encAddress(addr: string): string {
  return pad32(addr.replace(/^0x/, ""));
}

/**
 * ABI-encode a dynamic `address[]` for use as the LAST argument of a call.
 * Returns { head, tail }: `head` is the 32-byte offset word, `tail` is the
 * array body (length + elements). The caller concatenates all heads then all
 * tails. `precedingArgsWords` = number of 32-byte words before this arg's head.
 */
function encAddressArray(addrs: string[], precedingArgsWords: number): { head: string; tail: string } {
  // Offset points to where the tail begins, measured from the start of the args.
  const totalHeadWords = precedingArgsWords + 1; // +1 for this array's own offset word
  const offsetBytes = BigInt(totalHeadWords * 32);
  const head = encUint(offsetBytes);
  let tail = encUint(BigInt(addrs.length));
  for (const a of addrs) tail += encAddress(a);
  return { head, tail };
}

export function parseUnits18(value: string): bigint {
  const clean = (value || "0").replace(/,/g, "").trim();
  const [whole = "0", frac = ""] = clean.split(".");
  const fracPadded = frac.slice(0, 18).padEnd(18, "0");
  return BigInt(whole || "0") * DECIMALS_BASE + BigInt(fracPadded || "0");
}

export function formatUnits18(wei: bigint, dp = 6): string {
  let v = wei;
  const neg = v < 0n;
  if (neg) v = -v;
  const whole = v / DECIMALS_BASE;
  const frac = v % DECIMALS_BASE;
  let fracStr = frac.toString().padStart(18, "0").slice(0, dp).replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (fracStr ? "." + fracStr : "");
}

function decodeString(hex: string): string {
  const h = (hex || "").replace(/^0x/, "");
  if (h.length < 128) return "";
  const len = parseInt(h.slice(64, 128), 16);
  if (!len || Number.isNaN(len)) return "";
  const dataHex = h.slice(128, 128 + len * 2);
  let str = "";
  for (let i = 0; i < dataHex.length; i += 2) {
    str += String.fromCharCode(parseInt(dataHex.substr(i, 2), 16));
  }
  return str;
}

function getEth(): any {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("MetaMask not detected. Please install MetaMask.");
  return eth;
}

async function ethCall(to: string, data: string): Promise<string> {
  const eth = getEth();
  return eth.request({ method: "eth_call", params: [{ to, data: "0x" + data }, "latest"] });
}

/* ── network / account ── */
export async function ensureBscNetwork(): Promise<void> {
  const eth = getEth();
  const chainId: string = await eth.request({ method: "eth_chainId" });
  if (chainId === BSC_CHAIN_ID) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
  } catch (e: any) {
    if (e?.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: BSC_CHAIN_ID,
          chainName: "BNB Smart Chain",
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: ["https://bsc-dataseed.binance.org/"],
          blockExplorerUrls: ["https://bscscan.com"],
        }],
      });
    } else throw e;
  }
}

export async function getAccount(): Promise<string> {
  const eth = getEth();
  const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
  const from = accounts[0];
  if (!from) throw new Error("No wallet account found.");
  return from;
}

/**
 * Silently return the already-authorized wallet account, if any, WITHOUT
 * prompting the user. Uses `eth_accounts` (no popup) — returns null when no
 * wallet is installed or the site is not yet connected.
 */
export async function getConnectedAccount(): Promise<string | null> {
  try {
    if (typeof window === "undefined" || !(window as any).ethereum) return null;
    const eth = getEth();
    const accounts: string[] = await eth.request({ method: "eth_accounts" });
    return accounts && accounts[0] ? accounts[0] : null;
  } catch {
    return null;
  }
}

/** Subscribe to wallet account changes. Returns an unsubscribe function. */
export function onAccountsChanged(cb: (account: string | null) => void): () => void {
  if (typeof window === "undefined" || !(window as any).ethereum) return () => {};
  const eth = (window as any).ethereum;
  const handler = (accounts: string[]) => cb(accounts && accounts[0] ? accounts[0] : null);
  eth.on?.("accountsChanged", handler);
  return () => eth.removeListener?.("accountsChanged", handler);
}

export async function waitForReceipt(txHash: string, maxWait = 180_000): Promise<any | null> {
  const eth = getEth();
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const receipt = await eth.request({ method: "eth_getTransactionReceipt", params: [txHash] });
    if (receipt) return receipt;
  }
  return null;
}

/* ── reads ── */
export async function readBuyPrice(): Promise<bigint> {
  return BigInt(await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.getBuyPrice));
}
export async function readSellPrice(): Promise<bigint> {
  return BigInt(await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.getSellPrice));
}
export async function readQuoteBuy(usdtWei: bigint): Promise<bigint> {
  return BigInt(await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.quoteBuy + encUint(usdtWei)));
}
export async function readQuoteSell(tokenWei: bigint): Promise<bigint> {
  return BigInt(await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.quoteSell + encUint(tokenWei)));
}
export async function readTotalSupply(): Promise<bigint> {
  return BigInt(await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.totalSupply));
}
export async function readTokenBalance(owner: string): Promise<bigint> {
  return BigInt(await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.balanceOf + encAddress(owner)));
}
export async function readUsdtBalance(owner: string): Promise<bigint> {
  return BigInt(await ethCall(USDT_CONTRACT, SEL.balanceOf + encAddress(owner)));
}
export async function readAllowance(owner: string): Promise<bigint> {
  // allowance(owner, spender=tokenContract)
  return BigInt(await ethCall(USDT_CONTRACT, SEL.allowance + encAddress(owner) + encAddress(TOKEN_CONTRACT_ADDRESS)));
}
export async function readSymbol(): Promise<string> {
  try {
    return decodeString(await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.symbol)) || "WTA";
  } catch {
    return "WTA";
  }
}
export async function readTotalLiquidity(): Promise<bigint> {
  return BigInt(await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.getTotalLiquidity));
}

/**
 * Count current holders by replaying the token's Transfer events and tallying
 * net balances. There is no on-chain holder counter, so this is derived from
 * logs. Returns null if the RPC cannot serve the log query.
 */
export async function readHolderCount(): Promise<number | null> {
  try {
    const eth = getEth();
    const logs: any[] = await eth.request({
      method: "eth_getLogs",
      params: [{ address: TOKEN_CONTRACT_ADDRESS, topics: [TRANSFER_TOPIC], fromBlock: "0x0", toBlock: "latest" }],
    });
    const balances = new Map<string, bigint>();
    for (const log of logs) {
      if (!log.topics || log.topics.length < 3) continue;
      const from = ("0x" + log.topics[1].slice(26)).toLowerCase();
      const to = ("0x" + log.topics[2].slice(26)).toLowerCase();
      const value = BigInt(log.data && log.data !== "0x" ? log.data : "0x0");
      if (from !== ZERO_ADDR) balances.set(from, (balances.get(from) ?? 0n) - value);
      if (to !== ZERO_ADDR) balances.set(to, (balances.get(to) ?? 0n) + value);
    }
    let count = 0;
    for (const v of balances.values()) if (v > 0n) count++;
    return count;
  } catch {
    return null;
  }
}

/**
 * Sum a user's on-chain purchases by replaying the contract's `TokensBought`
 * events (buyer is indexed, so we filter by topic). The event's second data
 * word is `mintAmount` — the NET tokens credited to the buyer after the
 * referral carve-out — so `tokensReceived` reflects what actually landed in
 * the buyer's wallet, not the gross mint. Returns the total USDT spent and
 * net tokens received, or null if the RPC cannot serve the log query.
 */
export async function readUserPurchase(
  owner: string,
): Promise<{ usdtSpent: bigint; tokensReceived: bigint } | null> {
  try {
    const eth = getEth();
    const logs: any[] = await eth.request({
      method: "eth_getLogs",
      params: [{
        address: TOKEN_CONTRACT_ADDRESS,
        topics: [TOKENS_BOUGHT_TOPIC, "0x" + encAddress(owner)],
        fromBlock: "0x0",
        toBlock: "latest",
      }],
    });
    let usdtSpent = 0n;
    let tokensReceived = 0n;
    for (const log of logs) {
      const h = (log.data || "").replace(/^0x/, "");
      if (h.length < 128) continue;
      usdtSpent += BigInt("0x" + h.slice(0, 64));
      tokensReceived += BigInt("0x" + h.slice(64, 128));
    }
    return { usdtSpent, tokensReceived };
  } catch {
    return null;
  }
}

/* ── writes ── */
async function sendTx(to: string, data: string, gasHex: string): Promise<string> {
  const eth = getEth();
  const from = await getAccount();
  return eth.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data: "0x" + data, gas: gasHex }],
  });
}

export async function approveUsdt(amountWei: bigint): Promise<string> {
  const data = SEL.approve + encAddress(TOKEN_CONTRACT_ADDRESS) + encUint(amountWei);
  return sendTx(USDT_CONTRACT, data, "0x186A0"); // 100,000
}

export async function buyTokens(
  usdtWei: bigint,
  minTokensOut: bigint,
  referrers: string[] = [],
): Promise<string> {
  // buy(uint256 _usdtAmount, uint256 _minTokensOut, address[] _referrers)
  // Trim to the contract's level cap so calldata stays bounded/deterministic.
  const refs = referrers.slice(0, REFERRAL_LEVELS);
  const { head, tail } = encAddressArray(refs, 2); // 2 preceding static args
  const data = SEL.buy + encUint(usdtWei) + encUint(minTokensOut) + head + tail;
  // Referral payouts mint to extra addresses, so allow more gas headroom.
  return sendTx(TOKEN_CONTRACT_ADDRESS, data, "0xF4240"); // 1,000,000
}

/** Read the on-chain per-level referral percentages (basis points, length 10). */
export async function readLevelPercents(): Promise<number[]> {
  const raw = (await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.getLevelPercents)).replace(/^0x/, "");
  const out: number[] = [];
  for (let i = 0; i < REFERRAL_LEVELS; i++) {
    const word = raw.slice(i * 64, i * 64 + 64);
    out.push(word ? Number(BigInt("0x" + word)) : 0);
  }
  return out;
}

/** Read the contract owner address (admin gating for the percent setter). */
export async function readOwner(): Promise<string> {
  const raw = (await ethCall(TOKEN_CONTRACT_ADDRESS, SEL.owner)).replace(/^0x/, "");
  return "0x" + raw.slice(-40);
}

/**
 * Owner-only: set the 10 per-level referral percentages (basis points). The
 * caller's wallet must be the contract owner or the transaction reverts.
 */
export async function setLevelPercents(percentsBps: number[]): Promise<string> {
  const padded = Array.from({ length: REFERRAL_LEVELS }, (_, i) => BigInt(Math.round(percentsBps[i] ?? 0)));
  const data = SEL.setLevelPercents + padded.map((p) => encUint(p)).join("");
  return sendTx(TOKEN_CONTRACT_ADDRESS, data, "0x30D40"); // 200,000
}

export async function sellTokens(tokenWei: bigint, minUsdtOut: bigint): Promise<string> {
  const data = SEL.sell + encUint(tokenWei) + encUint(minUsdtOut);
  return sendTx(TOKEN_CONTRACT_ADDRESS, data, "0x61A80"); // 400,000
}

export function applySlippage(amount: bigint): bigint {
  return (amount * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
}
