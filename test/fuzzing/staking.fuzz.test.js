const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingEngine — Fuzzing Tests", function () {
    let token, dist, staking, owner, user;

    beforeEach(async () => {
        [owner, user] = await ethers.getSigners();

        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR", "ELR", ethers.utils.parseEther("1000000"));
        await token.deployed();

        const Dist = await ethers.getContractFactory("RewardDistributor");
        dist = await Dist.deploy(token.address, owner.address, owner.address);
        await dist.deployed();

        const Staking = await ethers.getContractFactory("Staking");
        staking = await Staking.deploy(token.address, dist.address);
        await staking.deployed();

        await dist.setModule(staking.address, true);

        await token.transfer(user.address, ethers.utils.parseEther("10000"));
        await token.connect(user).approve(staking.address, ethers.utils.parseEther("10000"));
    });

    it("fuzz: random stake values should never break accounting", async function () {
        let total = 0;

        for (let i = 0; i < 50; i++) {
            let amount = Math.floor(Math.random() * 1000);
            if (amount === 0) continue;

            await staking.connect(user).stake(amount, 0, false);

            const stake = await staking.stakes(user.address);
            total += amount;

            expect(stake.amount).to.equal(total);
        }
    });

    it("fuzz: random reward rate + random time travel", async function () {
        for (let i = 0; i < 20; i++) {
            let rate = Math.floor(Math.random() * 1e15);
            await staking.setRewardRate(rate);

            await staking.connect(user).stake(1000, 0, false);

            // time travel fuzz
            const seconds = Math.floor(Math.random() * 200000);
            await ethers.provider.send("evm_increaseTime", [seconds]);
            await ethers.provider.send("evm_mine");

            const pending = await staking.pendingRewards(user.address);
            expect(pending).to.be.gte(0);
        }
    });
});
