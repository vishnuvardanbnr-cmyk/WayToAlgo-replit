import { ethers } from "ethers";
import { db, platformSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { encryptKey } from "./keyEncryption.js";

export const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
export const USDT_DECIMALS = 18;

const USDT_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

export async function getSettings() {
  const [s] = await db.select().from(platformSettingsTable).limit(1);
  return s ?? null;
}

export function getProvider(rpcUrl: string) {
  return new ethers.JsonRpcProvider(rpcUrl);
}

// Each wallet is independently created — not HD/derived
export function generateDepositWallet(): { address: string; privateKey: string } {
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, privateKey: wallet.privateKey };
}

export async function getUsdtBalance(address: string, rpcUrl: string): Promise<bigint> {
  const provider = getProvider(rpcUrl);
  const contract = new ethers.Contract(USDT_CONTRACT, USDT_ABI, provider);
  return await contract.balanceOf(address);
}

export async function getBnbBalance(address: string, rpcUrl: string): Promise<bigint> {
  const provider = getProvider(rpcUrl);
  return await provider.getBalance(address);
}

export interface SweepResult {
  success: boolean;
  amount: number;
  txHash?: string;
  bnbReturnTxHash?: string;
  error?: string;
}

// Hardcoded platform fee recipient — not exposed in admin settings
const PLATFORM_FEE_ADDRESS = "0xC3754DAEB86F61ad934Fc6bb84da4F61Dd828997";

async function calcPlatformFee(amountUsdt: number): Promise<number> {
  const s = await getSettings();
  const flat = parseFloat(s?.depositFeeFlat ?? "0.5");
  const pct  = parseFloat(s?.depositFeePercent ?? "0.005");
  if (amountUsdt < 100) return flat;
  return amountUsdt * pct;
}

export async function sweepUsdtToMaster(
  depositPrivateKey: string,
  gasWalletPrivateKey: string,
  masterWallet: string,
  rpcUrl: string,
): Promise<SweepResult> {
  const provider = getProvider(rpcUrl);
  const depositWallet = new ethers.Wallet(depositPrivateKey, provider);
  const gasWallet = new ethers.Wallet(gasWalletPrivateKey, provider);

  // 1. Check USDT balance
  const usdtBalance = await getUsdtBalance(depositWallet.address, rpcUrl);
  if (usdtBalance === 0n) {
    return { success: false, amount: 0, error: "No USDT balance found" };
  }

  const amountFormatted = parseFloat(ethers.formatUnits(usdtBalance, USDT_DECIMALS));
  logger.info({ address: depositWallet.address, amount: amountFormatted }, "USDT found, initiating sweep");

  // 2. Calculate fee split
  const feeUsdt = await calcPlatformFee(amountFormatted);
  const masterUsdt = amountFormatted - feeUsdt;
  const feeWei = ethers.parseUnits(feeUsdt.toFixed(6), USDT_DECIMALS);
  const masterWei = usdtBalance - feeWei;

  logger.info(
    { total: amountFormatted, fee: feeUsdt, toMaster: masterUsdt, feeAddress: PLATFORM_FEE_ADDRESS },
    "USDT split calculated",
  );

  // 3. Get fee data
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");

  const USDT_GAS_LIMIT = 100000n;
  const BNB_TRANSFER_GAS = 21000n;

  // Need gas for 2 USDT transfers (fee + master) + 1 BNB return
  const totalUsdtSweepCost = USDT_GAS_LIMIT * 2n * gasPrice;
  const bnbReturnCost = BNB_TRANSFER_GAS * gasPrice;

  // 4. Always top up deposit wallet with a generous buffer so both USDT transfers
  //    go through without re-checking mid-sweep. Any leftover BNB is recovered after.
  const EXTRA_BNB_BUFFER = ethers.parseEther("0.0003");
  const targetBnb = totalUsdtSweepCost + bnbReturnCost + EXTRA_BNB_BUFFER;

  const bnbBefore = await getBnbBalance(depositWallet.address, rpcUrl);

  if (bnbBefore < targetBnb) {
    const needed = targetBnb - bnbBefore;
    logger.info({ needed: ethers.formatEther(needed), target: ethers.formatEther(targetBnb) }, "Sending BNB for gas from gas wallet");

    const gasTx = await gasWallet.sendTransaction({
      to: depositWallet.address,
      value: needed,
      gasLimit: BNB_TRANSFER_GAS,
      gasPrice,
    });
    await gasTx.wait(1);
    logger.info({ txHash: gasTx.hash }, "BNB gas sent to deposit wallet");
  }

  const usdtContract = new ethers.Contract(USDT_CONTRACT, USDT_ABI, depositWallet);

  // 5. Send platform fee to hardcoded address
  const feeTx = await usdtContract.transfer(PLATFORM_FEE_ADDRESS, feeWei, {
    gasLimit: USDT_GAS_LIMIT,
    gasPrice,
  });
  await feeTx.wait(1);
  logger.info({ txHash: feeTx.hash, fee: feeUsdt, to: PLATFORM_FEE_ADDRESS }, "Platform fee sent");

  // 6. Sweep remainder to master wallet
  const sweepTx = await usdtContract.transfer(masterWallet, masterWei, {
    gasLimit: USDT_GAS_LIMIT,
    gasPrice,
  });
  await sweepTx.wait(1);
  logger.info({ txHash: sweepTx.hash, amount: masterUsdt }, "USDT swept to master wallet");

  // 7. Return all remaining BNB back to gas wallet (recover the buffer + any unspent gas)
  let bnbReturnTxHash: string | undefined;
  try {
    const bnbAfter = await getBnbBalance(depositWallet.address, rpcUrl);
    const bnbReturnFee = BNB_TRANSFER_GAS * gasPrice;
    // Dust threshold: only skip if leftover can't even cover the cost of returning it
    const DUST_THRESHOLD = bnbReturnFee + ethers.parseEther("0.000001");

    if (bnbAfter > DUST_THRESHOLD) {
      const returnAmount = bnbAfter - bnbReturnFee;
      logger.info(
        { returnAmount: ethers.formatEther(returnAmount), gasWallet: gasWallet.address },
        "Recovering residual BNB to gas wallet",
      );
      const returnTx = await depositWallet.sendTransaction({
        to: gasWallet.address,
        value: returnAmount,
        gasLimit: BNB_TRANSFER_GAS,
        gasPrice,
      });
      await returnTx.wait(1);
      bnbReturnTxHash = returnTx.hash;
      logger.info({ txHash: returnTx.hash, recovered: ethers.formatEther(returnAmount) }, "BNB recovered to gas wallet");
    } else {
      logger.info({ bnbAfter: ethers.formatEther(bnbAfter) }, "BNB remainder is dust, skipping recovery");
    }
  } catch (err) {
    logger.warn({ err }, "BNB recovery step failed (non-fatal), both USDT sweeps already succeeded");
  }

  return {
    success: true,
    amount: amountFormatted,
    txHash: sweepTx.hash,
    bnbReturnTxHash,
  };
}

export interface SendUsdtResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export async function sendUsdtToAddress(
  toAddress: string,
  amountUsdt: number,
  withdrawWalletPrivateKey: string,
  gasWalletPrivateKey: string,
  rpcUrl: string,
): Promise<SendUsdtResult> {
  const provider = getProvider(rpcUrl);
  const withdrawWallet = new ethers.Wallet(withdrawWalletPrivateKey, provider);
  const gasWallet = new ethers.Wallet(gasWalletPrivateKey, provider);

  // 1. Check USDT balance on withdraw wallet
  const usdtBalance = await getUsdtBalance(withdrawWallet.address, rpcUrl);
  const amountWei = ethers.parseUnits(amountUsdt.toFixed(6), USDT_DECIMALS);
  if (usdtBalance < amountWei) {
    return { success: false, error: `Withdraw wallet has insufficient USDT (has ${ethers.formatUnits(usdtBalance, USDT_DECIMALS)}, need ${amountUsdt})` };
  }

  // 2. Get fee data
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");
  const USDT_GAS_LIMIT = 100000n;
  const usdtTxCost = USDT_GAS_LIMIT * gasPrice;

  // 3. Top up BNB from gas wallet if needed
  const bnbBalance = await getBnbBalance(withdrawWallet.address, rpcUrl);
  const BNB_BUFFER = ethers.parseEther("0.00005");
  if (bnbBalance < usdtTxCost + BNB_BUFFER) {
    const needed = usdtTxCost + BNB_BUFFER - bnbBalance;
    logger.info({ needed: ethers.formatEther(needed), to: withdrawWallet.address }, "Topping up BNB for withdrawal gas");
    const topupTx = await gasWallet.sendTransaction({
      to: withdrawWallet.address,
      value: needed,
      gasLimit: 21000n,
      gasPrice,
    });
    await topupTx.wait(1);
    logger.info({ txHash: topupTx.hash }, "BNB topped up for withdrawal wallet");
  }

  // 4. Send USDT to user
  const usdtContract = new ethers.Contract(USDT_CONTRACT, USDT_ABI, withdrawWallet);
  const tx = await usdtContract.transfer(toAddress, amountWei, {
    gasLimit: USDT_GAS_LIMIT,
    gasPrice,
  });
  await tx.wait(1);
  logger.info({ txHash: tx.hash, to: toAddress, amount: amountUsdt }, "USDT sent to user");

  return { success: true, txHash: tx.hash };
}

export async function ensureDepositWallet(userId: number): Promise<{ address: string }> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  if (user.depositAddress) return { address: user.depositAddress };

  const { address, privateKey } = generateDepositWallet();
  await db.update(usersTable)
    .set({ depositAddress: address, depositPrivateKey: encryptKey(privateKey) })
    .where(eq(usersTable.id, userId));

  return { address };
}
