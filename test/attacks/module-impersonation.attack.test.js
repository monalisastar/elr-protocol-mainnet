const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Module Impersonation Attack", function () {
    let dist, token, attacker, owner;

    beforeEach(async () => {
        [owner, attacker, module1] = await ethers.getSigners();

        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR", "ELR", ethers.utils.parseEther("10000"));

        const Distributor = await ethers.getContractFactory("RewardDistributor");
        dist = await Distributor.deploy(token.address, owner.address, owner.address);

        await token.transfer(dist.address, ethers.utils.parseEther("500"));
    });

    it("attacker cannot impersonate module", async () => {
        await expect(
            dist.connect(attacker).allocateFromModule(attacker.address, 100)
        ).to.be.revertedWith("NotModule");
    });
});
