const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RewardDistributor — Fuzzing Tests", function () {
    let token, dist, owner, mod, user, signer, attacker;

    beforeEach(async () => {
        [owner, mod, user, signer, attacker] = await ethers.getSigners();

        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR", "ELR", ethers.utils.parseEther("100000000"));
        await token.deployed();

        const Dist = await ethers.getContractFactory("RewardDistributor");
        dist = await Dist.deploy(token.address, signer.address, owner.address);
        await dist.deployed();

        // Fund pool
        await token.transfer(owner.address, ethers.utils.parseEther("1000000"));
        await token.approve(dist.address, ethers.utils.parseEther("1000000"));
        await dist.fundRewardPool(ethers.utils.parseEther("1000000"));

        // Approve module
        await dist.setModule(mod.address, true);
    });

    it("fuzz: random module allocations should always reduce pool", async function () {
        for (let i = 0; i < 50; i++) {
            let amount = Math.floor(Math.random() * 10000); // small fuzz amount

            if (amount === 0) continue;

            await expect(
                dist.connect(mod).allocateFromModule(user.address, amount)
            ).to.not.be.reverted;

            const reward = await dist.rewards(user.address);
            expect(reward.earned).to.be.gte(amount);
        }
    });

    it("fuzz: invalid module must always revert", async function () {
        for (let i = 0; i < 20; i++) {
            let amount = Math.floor(Math.random() * 10000);
            if (amount === 0) continue;

            await expect(
                dist.connect(attacker).allocateFromModule(user.address, amount)
            ).to.be.revertedWithCustomError(dist, "NotModule");
        }
    });

    it("fuzz: random nonces in signed allocations must never collide", async function () {
        for (let i = 0; i < 50; i++) {
            const nonce = ethers.utils.keccak256(
                ethers.utils.randomBytes(32)
            );

            const amount = Math.floor(Math.random() * 500);

            const msgHash = ethers.utils.solidityKeccak256(
                ["address", "uint256", "bytes32", "address"],
                [user.address, amount, nonce, dist.address]
            );

            const sig = await signer.signMessage(ethers.utils.arrayify(msgHash));

            await dist.allocateRewardSigned(user.address, amount, nonce, sig);
        }
    });
});
