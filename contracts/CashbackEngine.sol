// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./MerchantRegistry.sol";
import "./RewardDistributor.sol";
import "./ReferralRewards.sol";

import "./LoyaltyStreaks.sol";
import "./UserLevels.sol";
import "./RandomBonus.sol";
import "./PurchaseQuests.sol";
import "./MerchantStaking.sol";

/// ----------------------------------------------------------------------------
///                      ELR Cashback Engine — Gamified Version
/// ----------------------------------------------------------------------------
contract CashbackEngine is Ownable, ReentrancyGuard {

    MerchantRegistry public immutable registry;
    RewardDistributor public immutable distributor;
    address public immutable elrToken;

    // EXISTING MODULE
    ReferralRewards public referral;

    // NEW MODULES
    LoyaltyStreaks public streaks;
    UserLevels public levels;
    RandomBonus public randomBonus;
    PurchaseQuests public quests;
    MerchantStaking public merchantStaking;

    // ERRORS
    error InvalidAmount();
    error NotMerchant();
    error NotApproved();
    error Blacklisted();
    error ZeroAddress();

    // EVENTS
    event CashbackProcessed(
        address indexed user,
        address indexed merchant,
        uint256 purchaseAmount,
        uint256 cashbackAmount,
        MerchantRegistry.Tier tier
    );

    constructor(
        address _elrToken,
        address _registry,
        address _distributor
    ) {
        if (_elrToken == address(0) || _registry == address(0) || _distributor == address(0))
            revert ZeroAddress();

        elrToken = _elrToken;
        registry = MerchantRegistry(_registry);
        distributor = RewardDistributor(_distributor);
    }

    // MODULE SETTERS
    function setReferralEngine(address a) external onlyOwner {
        require(a != address(0), "referral=0");
        referral = ReferralRewards(a);
    }

    function setStreakEngine(address a) external onlyOwner {
        require(a != address(0), "streak=0");
        streaks = LoyaltyStreaks(a);
    }

    function setLevelEngine(address a) external onlyOwner {
        require(a != address(0), "levels=0");
        levels = UserLevels(a);
    }

    function setRandomBonusEngine(address a) external onlyOwner {
        require(a != address(0), "random=0");
        randomBonus = RandomBonus(a);
    }

    function setQuestEngine(address a) external onlyOwner {
        require(a != address(0), "quests=0");
        quests = PurchaseQuests(a);
    }

    function setMerchantStakingEngine(address a) external onlyOwner {
        require(a != address(0), "mstake=0");
        merchantStaking = MerchantStaking(a);
    }

    // CASHBACK RATE (basis points)
    function _cashbackRate(MerchantRegistry.Tier tier)
        internal
        pure
        returns (uint256)
    {
        if (tier == MerchantRegistry.Tier.SILVER) return 100;    // 1%
        if (tier == MerchantRegistry.Tier.GOLD) return 300;      // 3%
        if (tier == MerchantRegistry.Tier.PLATINUM) return 500;  // 5%
        return 0;
    }

    // MAIN METHOD
    function processPurchase(
        address user,
        uint256 purchaseAmount,
        address merchant
    ) external nonReentrant {

        if (purchaseAmount == 0) revert InvalidAmount();

        (
            bool exists,
            bool approved,
            bool isBlacklisted,
            MerchantRegistry.Tier tierLevel,
            ,
            ,
        ) = registry.getMerchant(merchant);

        if (!exists) revert NotMerchant();
        if (isBlacklisted) revert Blacklisted();
        if (!approved) revert NotApproved();

        uint256 rate = _cashbackRate(tierLevel);
        uint256 reward = (purchaseAmount * rate) / 10_000;

        // Cashback reward
        if (reward > 0) {
            distributor.allocateFromModule(user, reward);
        }

        // Merchant tier update
        registry.updateVolumeAndTier(merchant, purchaseAmount);

        emit CashbackProcessed(user, merchant, purchaseAmount, reward, tierLevel);

        // -------------------------------------------------------------------
        // GAMIFICATION HOOKS
        // -------------------------------------------------------------------

        // REFERRAL
        if (address(referral) != address(0)) {
            referral.processReferralReward(user, purchaseAmount);
        }

        // LOYALTY STREAKS
        if (address(streaks) != address(0)) {
            streaks.recordPurchase(user);
        }

        // USER XP LEVELING
        if (address(levels) != address(0)) {
            levels.recordXP(user, purchaseAmount);
        }

        // RANDOM BONUS
        if (address(randomBonus) != address(0)) {
            randomBonus.processRandomReward(user, purchaseAmount);
        }

        // QUEST PROGRESS
        if (address(quests) != address(0)) {
            quests.recordPurchase(user);
        }

        // MERCHANT STAKING BOOST
        if (address(merchantStaking) != address(0)) {
            uint256 boost = merchantStaking.merchantBoost(merchant);
            if (boost > 0) {
                // Example logic: each boost level adds +10% bonus cashback
                uint256 boosted = (reward * boost * 10) / 100;
                if (boosted > 0) {
                    distributor.allocateFromModule(user, boosted);
                }
            }
        }
    }
}
