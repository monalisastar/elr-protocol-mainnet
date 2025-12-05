const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RewardDistributor — Reentrancy Attack Simulation", function () {
    let token, dist, attackerContract, owner, user;

    beforeEach(async () => {
        [owner, user] = await ethers.getSigners();

        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR", "ELR", ethers.utils.parseEther("100000"));

        const Distributor = await ethers.getContractFactory("RewardDistributor");
        dist = await Distributor.deploy(token.address, owner.address, owner.address);

        // Give some initial rewards
        dist.rewards(user.address).earned = ethers.utils.parseEther("10");

        // Deploy attack contract
        const Attack = await ethers.getContractFactory("ReentrancyAttack");
        attackerContract = await Attack.deploy(dist.address);
    });

    it("should block reentrancy on claimRewards()", async () => {
        await expect(
            attackerContract.attack()
        ).to.be.reverted; // ReentrancyGuard blocks second call
    });
});
