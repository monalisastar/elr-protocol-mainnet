// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./RewardDistributor.sol";

/// ---------------------------------------------------------------------------
///                          ELR Loyalty Streak Engine (V1)
/// ---------------------------------------------------------------------------
/// ✔ Tracks daily purchase streak
/// ✔ Rewards streak milestones (3, 7, 14, 30 days)
/// ✔ CEX-safe: no minting, no owner control over rewards except setting values
/// ✔ Only CashbackEngine may call recordPurchase()
/// ---------------------------------------------------------------------------
contract LoyaltyStreaks is Ownable, ReentrancyGuard {

    RewardDistributor public immutable distributor;
    address public immutable cashbackEngine;

    // MILESTONE DAYS → reward amount (ELR)
    mapping(uint256 => uint256) public streakRewards;

    struct StreakData {
        uint256 lastDay;         // Last purchase day (in days)
        uint256 currentStreak;   // Current streak counter
        uint256 longestStreak;   // Historical max
    }

    mapping(address => StreakData) public streaks;

    // EVENTS
    event StreakUpdated(address indexed user, uint256 newStreak);
    event StreakRewardIssued(address indexed user, uint256 streak, uint256 amount);

    // ERRORS
    error NotAuthorized();
    error ZeroAddress();

    constructor(address _distributor, address _cashbackEngine) {
        if (_distributor == address(0) || _cashbackEngine == address(0))
            revert ZeroAddress();

        distributor = RewardDistributor(_distributor);
        cashbackEngine = _cashbackEngine;

        // DEFAULT rewards (can be updated by owner)
        streakRewards[3]  = 5  * 1e18;
        streakRewards[7]  = 15 * 1e18;
        streakRewards[14] = 35 * 1e18;
        streakRewards[30] = 100 * 1e18;
    }

    // -----------------------------------------------------------------------
    // SET REWARD AMOUNTS (OWNER ONLY)
    // -----------------------------------------------------------------------
    function setStreakReward(uint256 daysCount, uint256 amount) external onlyOwner {
        streakRewards[daysCount] = amount;
    }

    // -----------------------------------------------------------------------
    // CALLED BY CASHBACK ENGINE WHEN USER MAKES A PURCHASE
    // -----------------------------------------------------------------------
    function recordPurchase(address user) external nonReentrant {
        if (msg.sender != cashbackEngine) revert NotAuthorized();

        uint256 today = block.timestamp / 1 days;

        StreakData storage s = streaks[user];

        if (s.lastDay == today) {
            // already purchased today → streak unchanged
            return;
        }

        if (s.lastDay == today - 1) {
            // continues streak
            s.currentStreak += 1;
        } else {
            // streak reset
            s.currentStreak = 1;
        }

        s.lastDay = today;

        // update longest streak
        if (s.currentStreak > s.longestStreak) {
            s.longestStreak = s.currentStreak;
        }

        emit StreakUpdated(user, s.currentStreak);

        // REWARD if hitting milestone
        uint256 reward = streakRewards[s.currentStreak];
        if (reward > 0) {
            distributor.allocateFromModule(user, reward);
            emit StreakRewardIssued(user, s.currentStreak, reward);
        }
    }

    // -----------------------------------------------------------------------
    // VIEW HELPERS FOR UI
    // -----------------------------------------------------------------------
    function getStreak(address user)
        external
        view
        returns (
            uint256 current,
            uint256 longest,
            uint256 lastDay
        )
    {
        StreakData storage s = streaks[user];
        return (s.currentStreak, s.longestStreak, s.lastDay);
    }
}
