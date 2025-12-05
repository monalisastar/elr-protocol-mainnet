// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./RewardDistributor.sol";
import "./MerchantRegistry.sol";


/// ---------------------------------------------------------------------------
///                           ELR Merchant Staking (V1)
/// ---------------------------------------------------------------------------
/// ✔ Merchants stake ELR to increase their "boost level"
/// ✔ CashbackEngine can query merchantBoost(merchant)
/// ✔ Optional: give staking rewards through RewardDistributor
/// ✔ Configurable lock period
/// ✔ CEX-safe, non-privileged, no minting
/// ---------------------------------------------------------------------------
contract MerchantStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable elrToken;
    RewardDistributor public immutable distributor;
    address public immutable merchantRegistry;

    uint256 public lockPeriod = 30 days;

    struct StakeInfo {
        uint256 amount;        // total staked
        uint256 unlockTime;    // when merchant can unstake
        uint256 boostLevel;    // cached boost level
    }

    mapping(address => StakeInfo) public stakes;

    // BOOST TABLE
    uint256[4] public boostThresholds = [
        0,               // Level 0
        1_000e18,        // Level 1
        10_000e18,       // Level 2
        50_000e18        // Level 3
    ];

    // OPTIONAL STAKING REWARDS (sent via distributor)
    uint256 public stakeRewardRate = 5; // 0.5% (per stake action)

    // EVENTS
    event Staked(address indexed merchant, uint256 amount, uint256 newBoost);
    event Unstaked(address indexed merchant, uint256 amount);
    event BoostUpdated(address indexed merchant, uint256 level);

    // ERRORS
    error ZeroAddress();
    error NotMerchant();
    error StillLocked();
    error NothingToUnstake();

    constructor(
        address _elrToken,
        address _distributor,
        address _merchantRegistry
    ) {
        if (
            _elrToken == address(0) ||
            _distributor == address(0) ||
            _merchantRegistry == address(0)
        ) revert ZeroAddress();

        elrToken = IERC20(_elrToken);
        distributor = RewardDistributor(_distributor);
        merchantRegistry = _merchantRegistry;
    }

    // -----------------------------------------------------------------------
    // INTERNAL: Verify merchant (CashbackEngine uses same registry)
    // -----------------------------------------------------------------------
    function _isMerchant(address merchant) internal view returns (bool) {
        (bool exists, , , , , , ) = 
            MerchantRegistry(merchantRegistry).getMerchant(merchant);

        return exists;
    }

    // -----------------------------------------------------------------------
    // MAIN STAKING FUNCTION
    // -----------------------------------------------------------------------
    function stake(uint256 amount) external nonReentrant {
        if (!_isMerchant(msg.sender)) revert NotMerchant();
        require(amount > 0, "zero");

        elrToken.safeTransferFrom(msg.sender, address(this), amount);

        StakeInfo storage s = stakes[msg.sender];

        s.amount += amount;
        s.unlockTime = block.timestamp + lockPeriod;

        // update boost level
        uint256 newBoost = _calculateBoostLevel(s.amount);
        s.boostLevel = newBoost;

        emit Staked(msg.sender, amount, newBoost);

        // Optional staking reward
        uint256 reward = (amount * stakeRewardRate) / 1000;
        if (reward > 0) {
            distributor.allocateFromModule(msg.sender, reward);
        }
    }

    // -----------------------------------------------------------------------
    // UNSTAKE FUNCTION
    // -----------------------------------------------------------------------
    function unstake() external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];

        if (s.amount == 0) revert NothingToUnstake();
        if (block.timestamp < s.unlockTime) revert StillLocked();

        uint256 amt = s.amount;

        s.amount = 0;
        s.boostLevel = 0; // reset boost

        elrToken.safeTransfer(msg.sender, amt);

        emit Unstaked(msg.sender, amt);
    }

    // -----------------------------------------------------------------------
    // INTERNAL BOOST CALCULATION
    // -----------------------------------------------------------------------
    function _calculateBoostLevel(uint256 amount)
        internal
        view
        returns (uint256)
    {
        if (amount >= boostThresholds[3]) return 3;
        if (amount >= boostThresholds[2]) return 2;
        if (amount >= boostThresholds[1]) return 1;
        return 0;
    }

    // -----------------------------------------------------------------------
    // PUBLIC VIEW: CashbackEngine calls this to adjust cashback
    // -----------------------------------------------------------------------
    function merchantBoost(address merchant)
        external
        view
        returns (uint256)
    {
        return stakes[merchant].boostLevel;
    }

    // -----------------------------------------------------------------------
    // ADMIN: Adjust lock period and thresholds
    // -----------------------------------------------------------------------
    function setLockPeriod(uint256 period) external onlyOwner {
        lockPeriod = period;
    }

    function setBoostThreshold(uint256 level, uint256 amount) external onlyOwner {
        require(level < 4, "bad level");
        boostThresholds[level] = amount;
    }

    function setStakeRewardRate(uint256 rate) external onlyOwner {
        stakeRewardRate = rate;
    }
}
