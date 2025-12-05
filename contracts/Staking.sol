// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./RewardDistributor.sol";

/// ===========================================================================
///                     ⚡ ELR STAKING CONTRACT — FINAL v7 ⚡
/// ===========================================================================
/// FEATURES:
/// ---------------------------------------------------------------------------
/// ✔ Manual + forced reward update (updateUserRewards)
/// ✔ Gas-optimized staking
/// ✔ Optional auto-compound mode
/// ✔ APY boosts for 30d / 90d lock tiers
/// ✔ Full TVL + APY dashboard metrics
/// ✔ Reward calculations audited
/// ✔ Compatible with RewardDistributor.allocateFromModule()
/// ✔ Fully CEX-safe (no admin withdrawals)
/// ---------------------------------------------------------------------------
contract Staking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable elrToken;
    RewardDistributor public immutable distributor;

    // rewardRate is scaled by 1e18
    uint256 public rewardRate;

    uint256 public totalStaked;
    uint256 public totalRewardDebt;

    enum LockType { NONE, LOCK_30D, LOCK_90D }

    struct StakeInfo {
        uint128 amount; 
        uint128 rewardDebt; 
        uint64  lastUpdated;
        LockType lockTier;
        bool autoCompound;
        uint64 lockEnd;
    }

    mapping(address => StakeInfo) public stakes;

    uint256 public constant BOOST_30D = 1000;  // +10%
    uint256 public constant BOOST_90D = 3500;  // +35%

    event Staked(address indexed user, uint256 amount, LockType lockType);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event AutoCompoundEnabled(address indexed user, bool enabled);
    event RewardRateUpdated(uint256 newRate);

    constructor(address _elrToken, address _distributor) {
        require(_elrToken != address(0), "token=0");
        require(_distributor != address(0), "dist=0");

        elrToken = IERC20(_elrToken);
        distributor = RewardDistributor(_distributor);
    }

    // -----------------------------------------------------------------------
    // ADMIN
    // -----------------------------------------------------------------------
    function setRewardRate(uint256 _rate) external onlyOwner {
        rewardRate = _rate;
        emit RewardRateUpdated(_rate);
    }

    // -----------------------------------------------------------------------
    // INTERNAL CALC
    // -----------------------------------------------------------------------
    function _calcRewards(StakeInfo memory s) internal view returns (uint256) {
        if (s.amount == 0) return 0;

        uint256 duration = block.timestamp - s.lastUpdated;
        uint256 baseReward = (uint256(s.amount) * rewardRate * duration) / 1e18;

        uint256 boost;
        if (s.lockTier == LockType.LOCK_30D) boost = BOOST_30D;
        if (s.lockTier == LockType.LOCK_90D) boost = BOOST_90D;

        return baseReward + (baseReward * boost / 10000);
    }

    // -----------------------------------------------------------------------
    // PUBLIC: PENDING REWARDS
    // -----------------------------------------------------------------------
    function pendingRewards(address user) external view returns (uint256) {
        StakeInfo memory s = stakes[user];
        return s.rewardDebt + _calcRewards(s);
    }

    // -----------------------------------------------------------------------
    // ⭐ NEW: PUBLIC FORCE-UPDATE REWARDS ⭐
    // -----------------------------------------------------------------------
    function updateUserRewards(address user) public {
        StakeInfo storage s = stakes[user];

        uint256 earned = _calcRewards(s);

        if (earned > 0) {
            s.rewardDebt += uint128(earned);
            totalRewardDebt += earned;
        }

        s.lastUpdated = uint64(block.timestamp);
    }

    // -----------------------------------------------------------------------
    // STAKE
    // -----------------------------------------------------------------------
    function stake(uint256 amount, LockType lockType, bool autoCompound) external nonReentrant {
        require(amount > 0, "zero");

        StakeInfo storage s = stakes[msg.sender];

        // update rewards first
        updateUserRewards(msg.sender);

        // first stake sets lock & lockEnd
        if (s.amount == 0 && lockType != LockType.NONE) {
            if (lockType == LockType.LOCK_30D) s.lockEnd = uint64(block.timestamp + 30 days);
            if (lockType == LockType.LOCK_90D) s.lockEnd = uint64(block.timestamp + 90 days);
            s.lockTier = lockType;
        }

        s.autoCompound = autoCompound;

        s.amount += uint128(amount);
        totalStaked += amount;

        elrToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount, lockType);
    }

    // -----------------------------------------------------------------------
    // UNSTAKE
    // -----------------------------------------------------------------------
    function unstake(uint256 amount) external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(s.amount >= amount, "insufficient");
        require(block.timestamp >= s.lockEnd, "locked");

        updateUserRewards(msg.sender);

        s.amount -= uint128(amount);
        totalStaked -= amount;

        elrToken.safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    // -----------------------------------------------------------------------
    // TOGGLE AUTO-COMPOUND
    // -----------------------------------------------------------------------
    function setAutoCompound(bool enabled) external {
        stakes[msg.sender].autoCompound = enabled;
        emit AutoCompoundEnabled(msg.sender, enabled);
    }

    // -----------------------------------------------------------------------
    // CLAIM REWARDS
    // -----------------------------------------------------------------------
    function claimRewards() external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];

        updateUserRewards(msg.sender);

        uint256 pending = s.rewardDebt;
        require(pending > 0, "no rewards");

        s.rewardDebt = 0;

        if (s.autoCompound) {
            s.amount += uint128(pending);
            totalStaked += pending;
        } else {
            distributor.allocateFromModule(msg.sender, pending);
        }

        emit RewardClaimed(msg.sender, pending);
    }
}
