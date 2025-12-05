// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./RewardDistributor.sol";

/// ---------------------------------------------------------------------------
///                    ELR Referral Rewards Engine (FINAL V2)
/// ---------------------------------------------------------------------------
/// Compatible with:
/// - RewardDistributor (module-based reward allocation)
/// - CashbackEngine (calls referral rewards after purchase)
///
/// KEY RULES:
/// ✔ One referral per user
/// ✔ No self-referrals
/// ✔ CashbackEngine triggers referral reward
/// ✔ Works alongside cashback + staking + vesting
/// ---------------------------------------------------------------------------
contract ReferralRewards is ReentrancyGuard {

    RewardDistributor public immutable distributor;
    address public immutable cashbackEngine;

    uint256 public immutable referrerBonusBP;   // e.g., 300 = 3%
    uint256 public immutable refereeBonus;      // optional bonus for referred user

    mapping(address => address) public referredBy; // user → referrer
    mapping(address => uint256) public referralEarnings;

    // EVENTS
    event ReferralRegistered(address indexed user, address indexed referrer);
    event ReferralRewardIssued(address indexed referrer, address indexed referee, uint256 amount);
    event WelcomeBonusIssued(address indexed referee, uint256 amount);

    // ERRORS
    error AlreadyReferred();
    error CannotReferSelf();
    error InvalidCaller();
    error InvalidReferrer();
    error ZeroAddress();

    constructor(
        address _distributor,
        address _cashbackEngine,
        uint256 _referrerBonusBP,
        uint256 _refereeBonus
    ) {
        if (_distributor == address(0) || _cashbackEngine == address(0))
            revert ZeroAddress();

        distributor = RewardDistributor(_distributor);
        cashbackEngine = _cashbackEngine;

        referrerBonusBP = _referrerBonusBP;
        refereeBonus = _refereeBonus;
    }

    /// -----------------------------------------------------------------------
    /// Register referral (user → referrer)
    /// -----------------------------------------------------------------------
    function registerReferral(address referrer) external nonReentrant {
        if (referrer == msg.sender) revert CannotReferSelf();
        if (referrer == address(0)) revert InvalidReferrer();
        if (referredBy[msg.sender] != address(0)) revert AlreadyReferred();

        referredBy[msg.sender] = referrer;

        emit ReferralRegistered(msg.sender, referrer);

        // Optional welcome bonus
        if (refereeBonus > 0) {
            distributor.allocateFromModule(msg.sender, refereeBonus);
            emit WelcomeBonusIssued(msg.sender, refereeBonus);
        }
    }

    /// -----------------------------------------------------------------------
    /// Called by CashbackEngine when a purchase is processed
    /// -----------------------------------------------------------------------
    function processReferralReward(address user, uint256 purchaseAmount)
        external
        nonReentrant
    {
        if (msg.sender != cashbackEngine) revert InvalidCaller();

        address referrer = referredBy[user];
        if (referrer == address(0)) return; // no referral

        uint256 bonus = (purchaseAmount * referrerBonusBP) / 10_000;

        distributor.allocateFromModule(referrer, bonus);
        referralEarnings[referrer] += bonus;

        emit ReferralRewardIssued(referrer, user, bonus);
    }
}
