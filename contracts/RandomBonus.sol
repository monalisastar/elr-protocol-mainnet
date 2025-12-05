// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./RewardDistributor.sol";

/// ---------------------------------------------------------------------------
///                          ELR Random Bonus Engine (V1)
/// ---------------------------------------------------------------------------
/// ✔ Random chance rewards on each purchase
/// ✔ Uses pseudo-randomness (safe for low-value rewards)
/// ✔ Only CashbackEngine may trigger rewards
/// ✔ RewardDistributor handles actual token distribution
/// ✔ CEX-safe: no tokens minted, no admin token withdrawals
/// ---------------------------------------------------------------------------
contract RandomBonus is Ownable, ReentrancyGuard {

    RewardDistributor public immutable distributor;
    address public immutable cashbackEngine;

    uint256 private nonce = 1; // internal entropy

    struct BonusTier {
        uint256 probabilityBP; // probability in basis points (100 = 1%)
        uint256 rewardAmount;  // reward amount (in ELR)
    }

    BonusTier[] public bonusTiers;

    // EVENTS
    event RandomBonusTriggered(address indexed user, uint256 amount);

    // ERRORS
    error ZeroAddress();
    error NotAuthorized();

    constructor(address _distributor, address _cashbackEngine) {
        if (_distributor == address(0) || _cashbackEngine == address(0))
            revert ZeroAddress();

        distributor = RewardDistributor(_distributor);
        cashbackEngine = _cashbackEngine;

        // DEFAULT BONUS TIERS
        bonusTiers.push(BonusTier(500, 2 * 1e18));   // 5% chance → 2 ELR
        bonusTiers.push(BonusTier(100, 10 * 1e18));  // 1% chance → 10 ELR
        bonusTiers.push(BonusTier(20,  50 * 1e18));  // 0.2% chance → 50 ELR
    }

    // -----------------------------------------------------------------------
    // OWNER: Add or update bonus tiers
    // -----------------------------------------------------------------------
    function setBonusTier(uint256 index, uint256 probBP, uint256 reward)
        external
        onlyOwner
    {
        bonusTiers[index] = BonusTier(probBP, reward);
    }

    function addBonusTier(uint256 probBP, uint256 reward) external onlyOwner {
        bonusTiers.push(BonusTier(probBP, reward));
    }

    // -----------------------------------------------------------------------
    // INTERNAL RNG — pseudo random but safe for gamification
    // -----------------------------------------------------------------------
    function _random(address user, uint256 purchaseAmount)
        internal
        returns (uint256)
    {
        nonce++;
        return uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1),
                    block.timestamp,
                    user,
                    purchaseAmount,
                    nonce
                )
            )
        );
    }

    // -----------------------------------------------------------------------
    // CALLED BY CASHBACK ENGINE
    // -----------------------------------------------------------------------
    function processRandomReward(address user, uint256 purchaseAmount)
        external
        nonReentrant
    {
        if (msg.sender != cashbackEngine) revert NotAuthorized();

        uint256 rand = _random(user, purchaseAmount) % 10_000; // 0–9999

        uint256 cumulative = 0;

        for (uint256 i = 0; i < bonusTiers.length; i++) {
            cumulative += bonusTiers[i].probabilityBP;

            if (rand < cumulative) {
                // User wins this tier
                uint256 reward = bonusTiers[i].rewardAmount;
                distributor.allocateFromModule(user, reward);

                emit RandomBonusTriggered(user, reward);
                return;
            }
        }
    }

    // -----------------------------------------------------------------------
    // VIEW HELPERS
    // -----------------------------------------------------------------------
    function getBonusTier(uint256 index)
        public
        view
        returns (uint256 probabilityBP, uint256 amount)
    {
        BonusTier memory b = bonusTiers[index];
        return (b.probabilityBP, b.rewardAmount);
    }

    function tiersCount() public view returns (uint256) {
        return bonusTiers.length;
    }
}
