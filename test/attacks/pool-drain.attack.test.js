const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RewardDistributor — Pool Drain Attack", function () {
    let token, dist, owner, module;

    beforeEach(async () => {
        [owner, module] = await ethers.getSigners();

        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR", "ELR", ethers.utils.parseEther("100000"));

        const Distributor = await ethers.getContractFactory("RewardDistributor");
        dist = await Distributor.deploy(token.address, owner.address, owner.address);

        await dist.setModule(module.address, true);
        await token.transfer(dist.address, ethers.utils.parseEther("1000"));
    });

    it("should always block over-allocation attempts", async () => {
        await expect(
            dist.connect(module).allocateFromModule(module.address, ethers.utils.parseEther("5000"))
        ).to.be.revertedWith("PoolLow");
    });
});
