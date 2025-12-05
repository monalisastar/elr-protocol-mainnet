const { expect } = require("chai");
const { ethers } = require("hardhat");

// helper
function toWei(v) {
    return ethers.utils.parseEther(String(v));
}

describe("⚡ Staking — Unit & Security Tests (FINAL v7, ETHERS v5)", function () {
    let token, distributor, staking;
    let owner, user, attacker;

    beforeEach(async function () {
        [owner, user, attacker] = await ethers.getSigners();

        // -------------------------------------------------------------
        // 1. Deploy Mock Token with big mint buffer
        // -------------------------------------------------------------
        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR TOKEN", "ELR", toWei(2_000_000));
        await token.deployed();

        // -------------------------------------------------------------
        // 2. Deploy Reward Distributor
        // -------------------------------------------------------------
        const Distributor = await ethers.getContractFactory("RewardDistributor");
        distributor = await Distributor.deploy(
            token.address,
            owner.address,   // kybSigner
            owner.address    // owner (admin)
        );
        await distributor.deployed();

        // -------------------------------------------------------------
        // 3. Fund Reward Pool (FIXED)
        // -------------------------------------------------------------
        await token.connect(owner).approve(distributor.address, toWei(1_000_000));
        await distributor.connect(owner).fundRewardPool(toWei(1_000_000));

        // -------------------------------------------------------------
        // 4. Deploy Staking Contract
        // -------------------------------------------------------------
        const Staking = await ethers.getContractFactory("Staking");
        staking = await Staking.deploy(token.address, distributor.address);
        await staking.deployed();

        // -------------------------------------------------------------
        // 5. Register staking as an approved module
        // -------------------------------------------------------------
        await distributor.connect(owner).setModule(staking.address, true);

        // -------------------------------------------------------------
        // 6. Set reward rate (simple deterministic rate)
        // -------------------------------------------------------------
        await staking.connect(owner).setRewardRate(
            ethers.BigNumber.from("1000000000000") // 1e12
        );

        // -------------------------------------------------------------
        // 7. Give tokens to user
        // -------------------------------------------------------------
        await token.transfer(user.address, toWei(1000));
        await token.connect(user).approve(staking.address, toWei(1000));
    });

    // ------------------------------------------------------------------
    //  TESTS
    // ------------------------------------------------------------------

    it("should reject zero amount stake", async function () {
        await expect(
            staking.connect(user).stake(0, 0, false)
        ).to.be.revertedWith("zero");
    });

    it("should allow a user to stake and update state", async function () {
        await staking.connect(user).stake(toWei(100), 0, false);

        const s = await staking.stakes(user.address);

        expect(s.amount).to.equal(toWei(100));
        expect(await staking.totalStaked()).to.equal(toWei(100));
    });

    it("should accumulate rewards over time", async function () {
        await staking.connect(user).stake(toWei(100), 0, false);

        // move time forward 1 hour
        await ethers.provider.send("evm_increaseTime", [3600]);
        await ethers.provider.send("evm_mine");

        await staking.updateUserRewards(user.address);
        const s = await staking.stakes(user.address);

        expect(s.rewardDebt).to.be.gt(0);
    });

    it("should allow claiming rewards", async function () {
        await staking.connect(user).stake(toWei(100), 0, false);

        // Travel 1 hour
        await ethers.provider.send("evm_increaseTime", [3600]);
        await ethers.provider.send("evm_mine");

        await staking.connect(user).claimRewards();

        // Pending becomes zero
        const s = await staking.stakes(user.address);
        expect(s.rewardDebt).to.equal(0);
    });

    it("should auto-compound on claim", async function () {
        await staking.connect(user).stake(toWei(100), 0, true);

        // time travel
        await ethers.provider.send("evm_increaseTime", [3600]);
        await ethers.provider.send("evm_mine");

        await staking.connect(user).claimRewards();

        const s = await staking.stakes(user.address);
        expect(s.amount).to.be.gt(toWei(100)); // amount increased ✔
    });

    it("should enforce lock period on unstake", async function () {
        // lock for 30 days
        await staking.connect(user).stake(toWei(100), 1, false);

        await expect(
            staking.connect(user).unstake(toWei(100))
        ).to.be.revertedWith("locked");

        // fast-forward 30 days
        await ethers.provider.send("evm_increaseTime", [30 * 24 * 3600]);
        await ethers.provider.send("evm_mine");

        await staking.connect(user).unstake(toWei(100));
    });

    it("should reject unstake if balance is insufficient", async function () {
        await staking.connect(user).stake(toWei(100), 0, false);

        await expect(
            staking.connect(user).unstake(toWei(200))
        ).to.be.revertedWith("insufficient");
    });

    it("attacker cannot claim others’ rewards", async function () {
        await staking.connect(user).stake(toWei(100), 0, false);

        // attacker tries to get rewards
        await expect(
            staking.connect(attacker).claimRewards()
        ).to.be.revertedWith("no rewards");
    });

    it("should let user toggle auto-compound", async function () {
        await staking.connect(user).setAutoCompound(true);
        let s = await staking.stakes(user.address);
        expect(s.autoCompound).to.equal(true);

        await staking.connect(user).setAutoCompound(false);
        s = await staking.stakes(user.address);
        expect(s.autoCompound).to.equal(false);
    });
});
