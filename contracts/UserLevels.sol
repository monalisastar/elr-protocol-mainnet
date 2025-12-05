// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./RewardDistributor.sol";

/// ---------------------------------------------------------------------------
///                          ELR XP & LEVEL ENGINE (V1)
/// ---------------------------------------------------------------------------
/// ✔ Users earn XP when they spend
/// ✔ XP thresholds increase each level (level * 1000)
/// ✔ Level-up rewards distributed via RewardDistributor
/// ✔ Only CashbackEngine can call recordXP()
/// ✔ CEX-safe (no direct minting, no admin tokens)
/// ---------------------------------------------------------------------------
contract UserLevels is Ownable, ReentrancyGuard {

    RewardDistributor public immutable distributor;
    address public immutable cashbackEngine;

    uint256 public xpRate = 10; // XP per 1 ELR-equivalent purchase

    // OPTIONAL LEVEL-UP REWARD TABLE
    mapping(uint256 => uint256) public levelRewards;

    struct UserData {
        uint256 xp;
        uint256 level;
    }

    mapping(address => UserData) public users;

    // EVENTS
    event XPAdded(address indexed user, uint256 amount, uint256 newTotalXP);
    event LevelUp(address indexed user, uint256 newLevel);
    event LevelRewardIssued(address indexed user, uint256 level, uint256 amount);

    // ERRORS
    error NotAuthorized();
    error ZeroAddress();

    constructor(address _distributor, address _cashbackEngine) {
        if (_distributor == address(0) || _cashbackEngine == address(0))
            revert ZeroAddress();

        distributor = RewardDistributor(_distributor);
        cashbackEngine = _cashbackEngine;

        // OPTIONAL REWARDS — can be updated by owner
        levelRewards[2] = 5  * 1e18;
        levelRewards[5] = 20 * 1e18;
        levelRewards[10] = 50 * 1e18;
    }

    // -----------------------------------------------------------------------
    // ADMIN — Adjust XP reward rate
    // -----------------------------------------------------------------------
    function setXPRate(uint256 rate) external onlyOwner {
        xpRate = rate;
    }

    // -----------------------------------------------------------------------
    // ADMIN — Adjust level-up reward amounts
    // -----------------------------------------------------------------------
    function setLevelReward(uint256 level, uint256 amount) external onlyOwner {
        levelRewards[level] = amount;
    }

    // -----------------------------------------------------------------------
    // CORE LOGIC — Called by CashbackEngine
    // -----------------------------------------------------------------------
    function recordXP(address user, uint256 purchaseAmount)
        external
        nonReentrant
    {
        if (msg.sender != cashbackEngine) revert NotAuthorized();

        // XP proportional to purchase amount
        uint256 xpToAdd = (purchaseAmount / 1e18) * xpRate;
        if (xpToAdd == 0) return;

        UserData storage u = users[user];

        u.xp += xpToAdd;
        emit XPAdded(user, xpToAdd, u.xp);

        // process level-ups
        while (u.xp >= _xpRequired(u.level + 1)) {
            u.level += 1;
            emit LevelUp(user, u.level);

            uint256 reward = levelRewards[u.level];
            if (reward > 0) {
                distributor.allocateFromModule(user, reward);
                emit LevelRewardIssued(user, u.level, reward);
            }
        }
    }

    // -----------------------------------------------------------------------
    // INTERNAL: XP required for next level
    // -----------------------------------------------------------------------
    function _xpRequired(uint256 nextLevel) internal pure returns (uint256) {
        return nextLevel * 1000; // simple scalable formula
    }

    // -----------------------------------------------------------------------
    // VIEW HELPERS FOR UI/FRONTEND
    // -----------------------------------------------------------------------
    function getUserInfo(address user)
        external
        view
        returns (uint256 xp, uint256 level, uint256 xpToNext)
    {
        UserData memory u = users[user];
        uint256 nextLevel = u.level + 1;
        uint256 required = _xpRequired(nextLevel);
        uint256 remaining = required > u.xp ? required - u.xp : 0;

        return (u.xp, u.level, remaining);
    }
}
