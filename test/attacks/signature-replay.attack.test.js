const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RewardDistributor — Signature Replay Attack", function () {
    let token, dist, user, signer, owner;

    beforeEach(async () => {
        [owner, user, signer] = await ethers.getSigners();

        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR", "ELR", ethers.utils.parseEther("1000000"));
        await token.deployed();

        const Distributor = await ethers.getContractFactory("RewardDistributor");
        dist = await Distributor.deploy(token.address, signer.address, owner.address);

        await token.transfer(dist.address, ethers.utils.parseEther("1000"));
    });

    it("should reject replayed signatures across contracts", async () => {
        const nonce = ethers.utils.keccak256(ethers.utils.randomBytes(32));
        const amount = ethers.utils.parseEther("10");

        // Create signature
        const msgHash = ethers.utils.solidityKeccak256(
            ["address", "uint256", "bytes32", "address"],
            [user.address, amount, nonce, dist.address]
        );

        const signature = await signer.signMessage(ethers.utils.arrayify(msgHash));

        // 1. First call succeeds
        await dist.allocateRewardSigned(user.address, amount, nonce, signature);

        // 2. Deploy new distributor
        const Distributor2 = await ethers.getContractFactory("RewardDistributor");
        const dist2 = await Distributor2.deploy(token.address, signer.address, owner.address);

        // Must fund dist2 or PoolLow triggers instead
        await token.transfer(dist2.address, ethers.utils.parseEther("1000"));

        await expect(
            dist2.allocateRewardSigned(user.address, amount, nonce, signature)
        ).to.be.revertedWith("AlreadyUsedNonce");
    });
});
