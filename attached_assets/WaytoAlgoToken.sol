// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WaytoAlgoToken
 * @notice USDT-backed bonding-curve token for WaytoAlgo.
 *
 * @dev Based on the supplied MvaultToken reference, adapted so that USERS can
 *      buy and sell DIRECTLY on-chain (the reference locked minting to a
 *      controller contract). Mechanics are otherwise identical:
 *
 *      - Price = totalLiquidity (USDT held) / totalSupply (tokens minted)
 *      - Initial price = 0.01 USDT
 *      - Buy:  send USDT -> the full USDT is added to liquidity, buyer receives
 *              90% of the tokens the price implies (10% spread lifts the price).
 *      - Sell: burn tokens -> receive 90% of the current sell value in USDT.
 *      - Buy price is read BEFORE liquidity is added (front-running protection).
 *
 *      Differences from the reference (all are user-protections — see the
 *      project notes for how to revert any of them):
 *        1. `buy()` is PUBLIC (any user, after approving USDT to this contract).
 *        2. `buy`/`sell` accept a minimum-output argument (slippage protection).
 *        3. There is NO owner withdrawal of curve USDT. Every USDT held backs
 *           the curve, making the token fully trustless (no rug vector). The
 *           10% spread stays in the curve and is reflected as a rising price.
 *
 *      MULTI-LEVEL REFERRAL REWARDS (carved from the buyer):
 *        - `buy()` accepts an ordered list of the buyer's upline sponsor
 *          addresses (level 1 = direct sponsor, up to LEVELS deep). These are
 *          supplied by the WaytoAlgo website from its referral tree.
 *        - The owner (admin) sets a per-level percentage (`setLevelPercents`,
 *          basis points). Each sponsor receives that % of the buyer's freshly
 *          minted tokens, CARVED OUT of the buyer's allocation (the buyer
 *          receives the remainder). Total minted per buy is unchanged — the
 *          curve's USDT backing per token is therefore unaffected by rewards.
 *        - Slippage protection (`_minTokensOut`) is checked against the amount
 *          the buyer ACTUALLY receives (net of referral payouts).
 *
 *      ASSUMES an 18-decimal USDT (BSC BEP-20 USDT, 0x55d3...7955 is 18 dp) and
 *      a non fee-on-transfer token.
 */
contract WaytoAlgoToken is ERC20, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdtToken;

    uint256 public totalLiquidity;
    uint256 public totalMinted;
    uint256 public totalBurned;

    uint256 public constant INITIAL_PRICE   = 0.01 ether; // 0.01 USDT (18 dp)
    uint256 public constant MINT_PERCENTAGE = 90;
    uint256 public constant SELL_PERCENTAGE = 90;

    // ── Referral configuration ──
    uint256 public constant LEVELS = 10;          // upline depth rewarded
    uint256 public constant BPS_DENOMINATOR = 10000; // 100% = 10000 bps
    // Maximum combined referral payout, leaving the buyer at least 10%.
    uint256 public constant MAX_TOTAL_BPS = 9000;

    // Per-level reward percentage in basis points (index 0 = level 1).
    uint256[LEVELS] public levelPercents;

    // ── Holder tracking ──
    uint256 public holderCount;
    mapping(address => bool) private _isHolder;

    mapping(address => uint256) public totalReceivedByUser;
    mapping(address => uint256) public totalBurnedByUser;
    mapping(address => uint256) public totalReferralEarned;

    struct TokenTransfer {
        uint256 usdtAmount;
        uint256 tokenAmount;
        uint256 timestamp;
        uint8   transferType; // 0 = buy, 2 = sell
    }

    mapping(address => TokenTransfer[]) private userTransferHistory;

    event PriceUpdated(uint256 newBuyPrice, uint256 newSellPrice);
    event TokensBought(address indexed buyer, uint256 usdtAmount, uint256 tokenAmount);
    event TokensSold(address indexed seller, uint256 tokenAmount, uint256 usdtAmount);
    event ReferralPaid(address indexed buyer, address indexed sponsor, uint256 indexed level, uint256 amount);
    event LevelPercentsUpdated(uint256[LEVELS] percents);

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance();
    error InsufficientLiquidity();
    error SlippageExceeded();
    error InvalidPercents();

    /**
     * @param _usdt   USDT (BEP-20) token address. BSC mainnet: 0x55d398326f99059fF775485246999027B3197955
     * @param _name   ERC20 name  (e.g. "WaytoAlgo Token")
     * @param _symbol ERC20 symbol (e.g. "WTA")
     */
    constructor(address _usdt, string memory _name, string memory _symbol)
        ERC20(_name, _symbol)
        Ownable(msg.sender)
    {
        if (_usdt == address(0)) revert ZeroAddress();
        usdtToken = IERC20(_usdt);
    }

    // ---------------------------------------------------------------------
    // Admin: referral percentages (on-chain, owner-only)
    // ---------------------------------------------------------------------

    /**
     * @notice Set the per-level referral reward percentages (basis points).
     *         Index 0 = level 1 (direct sponsor). The combined total may not
     *         exceed MAX_TOTAL_BPS so the buyer always keeps a share.
     */
    function setLevelPercents(uint256[LEVELS] calldata _percents) external onlyOwner {
        uint256 total;
        for (uint256 i = 0; i < LEVELS; i++) {
            total += _percents[i];
        }
        if (total > MAX_TOTAL_BPS) revert InvalidPercents();
        levelPercents = _percents;
        emit LevelPercentsUpdated(_percents);
    }

    /// @notice Read the configured per-level reward percentages (basis points).
    function getLevelPercents() external view returns (uint256[LEVELS] memory) {
        return levelPercents;
    }

    function levelCount() external pure returns (uint256) {
        return LEVELS;
    }

    // ---------------------------------------------------------------------
    // Buy / Sell
    // ---------------------------------------------------------------------

    /**
     * @notice Buy WTA tokens by depositing USDT. Caller must first
     *         `approve(thisContract, _usdtAmount)` on the USDT token.
     * @param _usdtAmount   USDT to spend (18 decimals).
     * @param _minTokensOut Minimum WTA tokens the BUYER will accept after referral
     *                      payouts (slippage guard; use 0 to disable).
     * @param _referrers    Ordered upline sponsor addresses, level 1 first
     *                      (length 0..LEVELS). Zero address / self / empty
     *                      levels are skipped and stay with the buyer.
     * @return mintAmount   WTA tokens minted to the caller (net of referral payouts).
     */
    function buy(uint256 _usdtAmount, uint256 _minTokensOut, address[] calldata _referrers)
        external
        nonReentrant
        returns (uint256 mintAmount)
    {
        if (_usdtAmount == 0) revert ZeroAmount();

        // Price is captured BEFORE liquidity is added (front-running protection).
        uint256 buyPrice = getBuyPrice();

        usdtToken.safeTransferFrom(msg.sender, address(this), _usdtAmount);
        totalLiquidity += _usdtAmount;

        uint256 tokensToMint = (_usdtAmount * 1e18) / buyPrice;
        uint256 gross = (tokensToMint * MINT_PERCENTAGE) / 100;
        if (gross == 0) revert ZeroAmount();

        // ── Distribute per-level referral rewards, carved from `gross` ──
        uint256 referralTotal = _payReferrals(gross, _referrers);

        mintAmount = gross - referralTotal;
        if (mintAmount < _minTokensOut) revert SlippageExceeded();

        totalMinted += gross;
        totalReceivedByUser[msg.sender] += mintAmount;
        userTransferHistory[msg.sender].push(
            TokenTransfer(_usdtAmount, mintAmount, block.timestamp, 0)
        );

        _mint(msg.sender, mintAmount);

        emit TokensBought(msg.sender, _usdtAmount, mintAmount);
        emit PriceUpdated(getBuyPrice(), getSellPrice());
    }

    /// @dev Mints each eligible sponsor their per-level cut of `gross`.
    function _payReferrals(uint256 gross, address[] calldata _referrers)
        private
        returns (uint256 referralTotal)
    {
        uint256 n = _referrers.length < LEVELS ? _referrers.length : LEVELS;
        for (uint256 i = 0; i < n; i++) {
            address sponsor = _referrers[i];
            uint256 pct = levelPercents[i];
            if (sponsor == address(0) || sponsor == msg.sender || pct == 0) continue;
            uint256 reward = (gross * pct) / BPS_DENOMINATOR;
            if (reward == 0) continue;
            referralTotal += reward;
            totalReferralEarned[sponsor] += reward;
            _mint(sponsor, reward);
            emit ReferralPaid(msg.sender, sponsor, i + 1, reward);
        }
    }

    /**
     * @notice Sell (burn) WTA tokens and receive USDT.
     * @param _amount     WTA tokens to sell.
     * @param _minUsdtOut Minimum USDT to accept (slippage guard; use 0 to disable).
     * @return usdtOut    USDT sent to the caller.
     */
    function sell(uint256 _amount, uint256 _minUsdtOut)
        external
        nonReentrant
        returns (uint256 usdtOut)
    {
        if (_amount == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < _amount) revert InsufficientBalance();

        usdtOut = (_amount * getSellPrice()) / 1e18;
        if (usdtOut == 0) revert ZeroAmount();
        if (usdtOut < _minUsdtOut) revert SlippageExceeded();
        if (totalLiquidity < usdtOut) revert InsufficientLiquidity();

        totalBurned += _amount;
        totalBurnedByUser[msg.sender] += _amount;
        totalLiquidity -= usdtOut;
        userTransferHistory[msg.sender].push(
            TokenTransfer(usdtOut, _amount, block.timestamp, 2)
        );

        _burn(msg.sender, _amount);
        usdtToken.safeTransfer(msg.sender, usdtOut);

        emit TokensSold(msg.sender, _amount, usdtOut);
        emit PriceUpdated(getBuyPrice(), getSellPrice());
    }

    // ---------------------------------------------------------------------
    // Pricing / quotes
    // ---------------------------------------------------------------------

    function getBuyPrice() public view returns (uint256) {
        if (totalSupply() == 0) return INITIAL_PRICE;
        return (totalLiquidity * 1e18) / totalSupply();
    }

    function getSellPrice() public view returns (uint256) {
        return (getBuyPrice() * SELL_PERCENTAGE) / 100;
    }

    /// @notice Gross WTA tokens (before referral payouts) for `_usdtAmount`.
    function quoteBuy(uint256 _usdtAmount) public view returns (uint256 mintAmount) {
        uint256 buyPrice = getBuyPrice();
        uint256 tokensToMint = (_usdtAmount * 1e18) / buyPrice;
        mintAmount = (tokensToMint * MINT_PERCENTAGE) / 100;
    }

    /**
     * @notice What the BUYER would receive in WTA for `_usdtAmount` given
     *         `_referrers`, after per-level referral payouts are carved out.
     */
    function quoteBuyNet(uint256 _usdtAmount, address[] calldata _referrers)
        external
        view
        returns (uint256 buyerAmount, uint256 referralTotal)
    {
        uint256 gross = quoteBuy(_usdtAmount);
        uint256 n = _referrers.length < LEVELS ? _referrers.length : LEVELS;
        for (uint256 i = 0; i < n; i++) {
            address sponsor = _referrers[i];
            uint256 pct = levelPercents[i];
            // Mirror _payReferrals: skip zero-address, self, and zero-percent levels.
            if (sponsor == address(0) || sponsor == msg.sender || pct == 0) continue;
            referralTotal += (gross * pct) / BPS_DENOMINATOR;
        }
        buyerAmount = gross - referralTotal;
    }

    /// @notice USDT a seller would receive for `_amount` WTA tokens at the current price.
    function quoteSell(uint256 _amount) external view returns (uint256 usdtOut) {
        usdtOut = (_amount * getSellPrice()) / 1e18;
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    // ---------------------------------------------------------------------
    // Holder tracking hook
    // ---------------------------------------------------------------------

    /**
     * @dev Called by OpenZeppelin on every mint, burn, and transfer.
     *      Maintains `holderCount` by watching when balances cross zero.
     *      address(0) (the mint/burn sentinel) is always excluded.
     */
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        // New holder: `to` is a real address that had no balance before this transfer.
        if (to != address(0) && !_isHolder[to] && balanceOf(to) > 0) {
            _isHolder[to] = true;
            holderCount++;
        }

        // Lost holder: `from` is a real address whose balance is now zero.
        if (from != address(0) && _isHolder[from] && balanceOf(from) == 0) {
            _isHolder[from] = false;
            holderCount--;
        }
    }

    // ---------------------------------------------------------------------
    // Views (parity with reference)
    // ---------------------------------------------------------------------

    function getTotalLiquidity() external view returns (uint256) { return totalLiquidity; }
    function getTotalAvailableTokens() external view returns (uint256) { return totalSupply(); }
    function getTotalBurnedTokens() external view returns (uint256) { return totalBurned; }
    function getTotalMintedTokens() external view returns (uint256) { return totalMinted; }
    function getTotalReceivedByUser(address user) external view returns (uint256) { return totalReceivedByUser[user]; }
    function getTotalBurnedByUser(address user) external view returns (uint256) { return totalBurnedByUser[user]; }
    function getUserTransferCount(address user) external view returns (uint256) { return userTransferHistory[user].length; }

    /// @notice Returns the current number of addresses holding a non-zero WTA balance.
    function getHolderCount() external view returns (uint256) { return holderCount; }

    /// @notice Returns true if `account` currently holds a non-zero WTA balance.
    function isHolder(address account) external view returns (bool) { return _isHolder[account]; }

    function getUserTransferHistory(address user, uint256 start, uint256 limit)
        external
        view
        returns (
            uint256[] memory usdtAmounts,
            uint256[] memory tokenAmounts,
            uint256[] memory timestamps,
            uint8[]   memory types
        )
    {
        TokenTransfer[] storage history = userTransferHistory[user];
        uint256 end = start + limit;
        if (end > history.length) end = history.length;
        if (start >= history.length) {
            return (new uint256[](0), new uint256[](0), new uint256[](0), new uint8[](0));
        }
        uint256 size = end - start;
        usdtAmounts  = new uint256[](size);
        tokenAmounts = new uint256[](size);
        timestamps   = new uint256[](size);
        types        = new uint8[](size);
        for (uint256 i = 0; i < size; i++) {
            TokenTransfer storage t = history[start + i];
            usdtAmounts[i]  = t.usdtAmount;
            tokenAmounts[i] = t.tokenAmount;
            timestamps[i]   = t.timestamp;
            types[i]        = t.transferType;
        }
    }

    function getRecentTransfers(address user, uint256 count)
        external
        view
        returns (
            uint256[] memory usdtAmounts,
            uint256[] memory tokenAmounts,
            uint256[] memory timestamps,
            uint8[]   memory types
        )
    {
        TokenTransfer[] storage history = userTransferHistory[user];
        uint256 len = history.length;
        if (len == 0) {
            return (new uint256[](0), new uint256[](0), new uint256[](0), new uint8[](0));
        }
        uint256 size  = count > len ? len : count;
        uint256 start = len - size;
        usdtAmounts  = new uint256[](size);
        tokenAmounts = new uint256[](size);
        timestamps   = new uint256[](size);
        types        = new uint8[](size);
        for (uint256 i = 0; i < size; i++) {
            TokenTransfer storage t = history[start + i];
            usdtAmounts[i]  = t.usdtAmount;
            tokenAmounts[i] = t.tokenAmount;
            timestamps[i]   = t.timestamp;
            types[i]        = t.transferType;
        }
    }
}
