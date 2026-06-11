import { ethers } from "ethers";
import { getProvider, USDT_CONTRACT, USDT_DECIMALS } from "./blockchain";
import { logger } from "./logger";

/**
 * Server-side client for the BondingCurveToken used by the ROI-token payout
 * cycle. All buys/sells are executed from the platform WITHDRAW wallet (the
 * same wallet that funds user withdrawals), with BNB gas topped up from the
 * gas wallet — mirroring the deposit-sweep / withdrawal patterns in
 * blockchain.ts.
 *
 * Token decimals are assumed to be 18 (matches the on-chain token plan).
 */
export const TOKEN_DECIMALS = 18;

const TOKEN_ABI = [
  "function buy(uint256 usdtAmount, uint256 minTokensOut, address[] referrers)",
  "function sell(uint256 tokenAmount, uint256 minUsdtOut)",
  "function getBuyPrice() view returns (uint256)",
  "function getSellPrice() view returns (uint256)",
  "function quoteBuy(uint256 usdtAmount) view returns (uint256)",
  "function quoteSell(uint256 tokenAmount) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

const USDT_ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function isValidAddress(addr: string | null | undefined): boolean {
  return !!addr && ADDR_RE.test(addr.trim());
}

export interface TokenPrices {
  // USDT (18-dp) per 1 whole token, as a human-readable decimal string.
  buyPrice: string;
  sellPrice: string;
}

/** Read the live on-chain buy/sell prices. Throws if the RPC/contract fails. */
export async function getTokenPrices(contractAddress: string, rpcUrl: string): Promise<TokenPrices> {
  const provider = getProvider(rpcUrl);
  const token = new ethers.Contract(contractAddress, TOKEN_ABI, provider);
  const [buyWei, sellWei] = await Promise.all([token.getBuyPrice(), token.getSellPrice()]);
  return {
    buyPrice: ethers.formatUnits(buyWei, USDT_DECIMALS),
    sellPrice: ethers.formatUnits(sellWei, USDT_DECIMALS),
  };
}

/** Read the platform withdraw wallet's token + USDT balances (wei). */
export async function getPlatformBalances(
  contractAddress: string,
  withdrawWalletPrivateKey: string,
  rpcUrl: string,
): Promise<{ tokenWei: bigint; usdtWei: bigint; address: string }> {
  const provider = getProvider(rpcUrl);
  const wallet = new ethers.Wallet(withdrawWalletPrivateKey, provider);
  const token = new ethers.Contract(contractAddress, TOKEN_ABI, provider);
  const usdt = new ethers.Contract(USDT_CONTRACT, USDT_ERC20_ABI, provider);
  const [tokenWei, usdtWei] = await Promise.all([
    token.balanceOf(wallet.address),
    usdt.balanceOf(wallet.address),
  ]);
  return { tokenWei, usdtWei, address: wallet.address };
}

/** Ensure `wallet` has at least `neededWei` BNB, topping up from the gas wallet. */
async function ensureBnb(
  wallet: ethers.Wallet,
  gasWallet: ethers.Wallet,
  provider: ethers.JsonRpcProvider,
  neededWei: bigint,
  gasPrice: bigint,
): Promise<void> {
  const have = await provider.getBalance(wallet.address);
  if (have >= neededWei) return;
  const topup = neededWei - have;
  logger.info({ to: wallet.address, topup: ethers.formatEther(topup) }, "Topping up BNB for token tx");
  const tx = await gasWallet.sendTransaction({
    to: wallet.address,
    value: topup,
    gasLimit: 21000n,
    gasPrice,
  });
  await tx.wait(1);
}

export interface BuyResult {
  success: boolean;
  txHash?: string;
  tokensBought?: bigint; // wei (18dp) actually credited to the platform wallet
  error?: string;
}

/**
 * Execute a REAL on-chain buy of `usdtAmount` (human USDT) from the platform
 * withdraw wallet. Approves USDT if needed, buys with a slippage-guarded
 * minOut, and measures tokens actually received via a balance diff.
 * referrers is intentionally empty — referral/level rewards are handled
 * virtually off-chain (carved from the distribution pool).
 */
export async function buyTokens(
  usdtAmount: number,
  contractAddress: string,
  withdrawWalletPrivateKey: string,
  gasWalletPrivateKey: string,
  rpcUrl: string,
): Promise<BuyResult> {
  try {
    const provider = getProvider(rpcUrl);
    const wallet = new ethers.Wallet(withdrawWalletPrivateKey, provider);
    const gasWallet = new ethers.Wallet(gasWalletPrivateKey, provider);

    const usdt = new ethers.Contract(USDT_CONTRACT, USDT_ERC20_ABI, wallet);
    const token = new ethers.Contract(contractAddress, TOKEN_ABI, wallet);

    const amountWei = ethers.parseUnits(usdtAmount.toFixed(6), USDT_DECIMALS);

    const usdtBal: bigint = await usdt.balanceOf(wallet.address);
    if (usdtBal < amountWei) {
      return {
        success: false,
        error: `Withdraw wallet has insufficient USDT (has ${ethers.formatUnits(usdtBal, USDT_DECIMALS)}, need ${usdtAmount})`,
      };
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");

    // Budget BNB for: approve (~100k) + buy (~1.5M) + buffer
    const APPROVE_GAS = 100000n;
    const BUY_GAS = 1500000n;
    const buffer = ethers.parseEther("0.0005");
    await ensureBnb(wallet, gasWallet, provider, (APPROVE_GAS + BUY_GAS) * gasPrice + buffer, gasPrice);

    // Approve if allowance insufficient
    const allowance: bigint = await usdt.allowance(wallet.address, contractAddress);
    if (allowance < amountWei) {
      const approveTx = await usdt.approve(contractAddress, amountWei, { gasLimit: APPROVE_GAS, gasPrice });
      await approveTx.wait(1);
      logger.info({ txHash: approveTx.hash, amount: usdtAmount }, "USDT approved for token buy");
    }

    // Slippage-guarded minOut from quote (2%)
    let minOut = 0n;
    try {
      const quoted: bigint = await token.quoteBuy(amountWei);
      minOut = (quoted * 9800n) / 10000n;
    } catch {
      minOut = 0n;
    }

    const balBefore: bigint = await token.balanceOf(wallet.address);
    const buyTx = await token.buy(amountWei, minOut, [], { gasLimit: BUY_GAS, gasPrice });
    await buyTx.wait(1);
    const balAfter: bigint = await token.balanceOf(wallet.address);
    const tokensBought = balAfter - balBefore;

    logger.info(
      { txHash: buyTx.hash, usdt: usdtAmount, tokensBought: ethers.formatUnits(tokensBought, TOKEN_DECIMALS) },
      "On-chain token buy completed",
    );

    if (tokensBought <= 0n) {
      return { success: false, txHash: buyTx.hash, error: "Buy succeeded but no tokens were received" };
    }

    return { success: true, txHash: buyTx.hash, tokensBought };
  } catch (err: any) {
    logger.error({ err }, "On-chain token buy failed");
    return { success: false, error: err?.shortMessage || err?.message || "Buy failed" };
  }
}

export interface SellResult {
  success: boolean;
  txHash?: string;
  usdtReceived?: number; // human USDT actually received
  error?: string;
}

/**
 * Execute a REAL on-chain sell of `tokenWei` tokens from the platform withdraw
 * wallet back to the contract. Measures USDT actually received via a balance
 * diff so the user is credited the real proceeds.
 */
export async function sellTokens(
  tokenWei: bigint,
  contractAddress: string,
  withdrawWalletPrivateKey: string,
  gasWalletPrivateKey: string,
  rpcUrl: string,
): Promise<SellResult> {
  try {
    const provider = getProvider(rpcUrl);
    const wallet = new ethers.Wallet(withdrawWalletPrivateKey, provider);
    const gasWallet = new ethers.Wallet(gasWalletPrivateKey, provider);

    const usdt = new ethers.Contract(USDT_CONTRACT, USDT_ERC20_ABI, provider);
    const token = new ethers.Contract(contractAddress, TOKEN_ABI, wallet);

    const tokenBal: bigint = await token.balanceOf(wallet.address);
    if (tokenBal < tokenWei) {
      return {
        success: false,
        error: `Platform wallet has insufficient tokens (has ${ethers.formatUnits(tokenBal, TOKEN_DECIMALS)})`,
      };
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");

    const SELL_GAS = 600000n;
    const buffer = ethers.parseEther("0.0003");
    await ensureBnb(wallet, gasWallet, provider, SELL_GAS * gasPrice + buffer, gasPrice);

    // Slippage-guarded minUsdtOut from quote (2%)
    let minUsdtOut = 0n;
    try {
      const quoted: bigint = await token.quoteSell(tokenWei);
      minUsdtOut = (quoted * 9800n) / 10000n;
    } catch {
      minUsdtOut = 0n;
    }

    const usdtBefore: bigint = await usdt.balanceOf(wallet.address);
    const sellTx = await token.sell(tokenWei, minUsdtOut, { gasLimit: SELL_GAS, gasPrice });
    await sellTx.wait(1);
    const usdtAfter: bigint = await usdt.balanceOf(wallet.address);
    const receivedWei = usdtAfter - usdtBefore;
    const usdtReceived = parseFloat(ethers.formatUnits(receivedWei, USDT_DECIMALS));

    logger.info(
      { txHash: sellTx.hash, tokens: ethers.formatUnits(tokenWei, TOKEN_DECIMALS), usdtReceived },
      "On-chain token sell completed",
    );

    if (receivedWei <= 0n) {
      return { success: false, txHash: sellTx.hash, error: "Sell succeeded but no USDT was received" };
    }

    return { success: true, txHash: sellTx.hash, usdtReceived };
  } catch (err: any) {
    logger.error({ err }, "On-chain token sell failed");
    return { success: false, error: err?.shortMessage || err?.message || "Sell failed" };
  }
}
