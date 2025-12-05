// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./RewardDistributor.sol";

/// ---------------------------------------------------------------------------
///                           ELR Purchase Quest Engine (V1)
/// ---------------------------------------------------------------------------
/// ✔ Daily, weekly, and lifetime quests
/// ✔ Automatically progressed by CashbackEngine
/// ✔ Rewards through RewardDistributor
/// ✔ Only CashbackEngine can update progress
/// ✔ Highly configurable, CEX-safe
/// ---------------------------------------------------------------------------
contract PurchaseQuests is Ownable, ReentrancyGuard {

    RewardDistributor public immutable distributor;
    address public immutable cashbackEngine;

    // -------------------------------------------------------
    // QUEST TYPES
    // -------------------------------------------------------
    struct Quest {
        uint256 target;     // required purchases
        uint256 reward;     // ELR reward
        bool active;        // is quest active?
    }

    Quest public dailyQuest;
    Quest public weeklyQuest;
    Quest public lifetimeQuest;

    // -------------------------------------------------------
    // USER DATA
    // -------------------------------------------------------
    struct Progress {
        uint256 dailyCount;
        uint256 weeklyCount;
        uint256 lifetimeCount;

        uint256 lastDay;
        uint256 lastWeek;
    }

    mapping(address => Progress) public progress;

    // EVENTS
    event DailyQuestCompleted(address indexed user, uint256 reward);
    event WeeklyQuestCompleted(address indexed user, uint256 reward);
    event LifetimeQuestCompleted(address indexed user, uint256 reward);

    // ERRORS
    error NotAuthorized();
    error ZeroAddress();

    constructor(address _distributor, address _cashbackEngine) {
        if (_distributor == address(0) || _cashbackEngine == address(0))
            revert ZeroAddress();

        distributor = RewardDistributor(_distributor);
        cashbackEngine = _cashbackEngine;

        // Default quests (owner may update)
        dailyQuest    = Quest(1,  3 * 1e18, true);
        weeklyQuest   = Quest(5, 10 * 1e18, true);
        lifetimeQuest = Quest(50, 50 * 1e18, true);
    }

    // -------------------------------------------------------
    // ADMIN FUNCTIONS
    // -------------------------------------------------------
    function setDailyQuest(uint256 target, uint256 reward, bool active) external onlyOwner {
        dailyQuest = Quest(target, reward, active);
    }

    function setWeeklyQuest(uint256 target, uint256 reward, bool active) external onlyOwner {
        weeklyQuest = Quest(target, reward, active);
    }

    function setLifetimeQuest(uint256 target, uint256 reward, bool active) external onlyOwner {
        lifetimeQuest = Quest(target, reward, active);
    }

    // -------------------------------------------------------
    // MAIN LOGIC — CALLED BY CASHBACK ENGINE
    // -------------------------------------------------------
    function recordPurchase(address user) external nonReentrant {
        if (msg.sender != cashbackEngine) revert NotAuthorized();

        uint256 today = block.timestamp / 1 days;
        uint256 week = today / 7;

        Progress storage p = progress[user];

        // DAILY RESET
        if (p.lastDay != today) {
            p.dailyCount = 0;
            p.lastDay = today;
        }

        // WEEKLY RESET
        if (p.lastWeek != week) {
            p.weeklyCount = 0;
            p.lastWeek = week;
        }

        // Increment counts
        p.dailyCount += 1;
        p.weeklyCount += 1;
        p.lifetimeCount += 1;

        // DAILY QUEST
        if (dailyQuest.active && p.dailyCount == dailyQuest.target) {
            distributor.allocateFromModule(user, dailyQuest.reward);
            emit DailyQuestCompleted(user, dailyQuest.reward);
        }

        // WEEKLY QUEST
        if (weeklyQuest.active && p.weeklyCount == weeklyQuest.target) {
            distributor.allocateFromModule(user, weeklyQuest.reward);
            emit WeeklyQuestCompleted(user, weeklyQuest.reward);
        }

        // LIFETIME QUEST
        if (lifetimeQuest.active && p.lifetimeCount == lifetimeQuest.target) {
            distributor.allocateFromModule(user, lifetimeQuest.reward);
            emit LifetimeQuestCompleted(user, lifetimeQuest.reward);
        }
    }

    // -------------------------------------------------------
    // VIEW HELPERS
    // -------------------------------------------------------
    function getProgress(address user)
        external
        view
        returns (
            uint256 daily,
            uint256 weekly,
            uint256 lifetime
        )
    {
        Progress memory p = progress[user];
        return (p.dailyCount, p.weeklyCount, p.lifetimeCount);
    }
}
