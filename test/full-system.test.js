const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("🔥 FULL ELR ECOSYSTEM — END TO END FLOW", function () {
    let token, registry, distributor, cashback, referral;
    let staking, vesting;
    let owner, user, merchant, referrer;

    beforeEach(async function () {
        [owner, user, merchant, referrer] = await ethers.getSigners();

        // ---------------------------------------------------------------------
        // 1. Deploy Mock Token
        // ---------------------------------------------------------------------
        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy(
            "ELR TOKEN",
            "ELR",
            ethers.parseEther("1000000000")
        );
        await token.waitForDeployment();

        // ---------------------------------------------------------------------
        // 2. Deploy Registry
        // ---------------------------------------------------------------------
        const Registry = await ethers.getContractFactory("MerchantRegistry");
        registry = await Registry.deploy();
        await registry.waitForDeployment();

        // ---------------------------------------------------------------------
        // 3. Deploy Reward Distributor
        // ---------------------------------------------------------------------
        const Distributor = await ethers.getContractFactory("RewardDistributor");
        distributor = await Distributor.deploy(
            token.target,
            ethers.parseEther("1000000")
        );
        await distributor.waitForDeployment();

        // ---------------------------------------------------------------------
        // 4. Deploy CashbackEngine
        // ---------------------------------------------------------------------
        const Cashback = await ethers.getContractFactory("CashbackEngine");
        cashback = await Cashback.deploy(
            registry.target,
            distributor.target,
            token.target
        );
        await cashback.waitForDeployment();

        // ---------------------------------------------------------------------
        // 5. Deploy ReferralRewards (REQUIRES CashbackEngine)
        // ---------------------------------------------------------------------
        const Referral = await ethers.getContractFactory("ReferralRewards");
        referral = await Referral.deploy(
            distributor.target,
            cashback.target,
            300,                                // 3% bonus
            ethers.parseEther("10")             // welcome bonus
        );
        await referral.waitForDeployment();

        // ---------------------------------------------------------------------
        // 6. Deploy Staking
        // ---------------------------------------------------------------------
        const Staking = await ethers.getContractFactory("Staking");
        staking = await Staking.deploy(token.target, distributor.target);
        await staking.waitForDeployment();

        // ---------------------------------------------------------------------
        // 7. Deploy Vesting
        // ---------------------------------------------------------------------
        const Vesting = await ethers.getContractFactory("Vesting");
        vesting = await Vesting.deploy(token.target);
        await vesting.waitForDeployment();

        // ---------------------------------------------------------------------
        // 8. APPROVE MODULES
        // ---------------------------------------------------------------------
        await distributor.setModuleStatus(cashback.target, true);
        await distributor.setModuleStatus(staking.target, true);
        await distributor.setModuleStatus(referral.target, true);

        // ---------------------------------------------------------------------
        // 9. FUND Reward Pool
        // ---------------------------------------------------------------------
        await token.transfer(distributor.target, ethers.parseEther("500000"));

        // ---------------------------------------------------------------------
        // 10. Register + approve merchant
        // ---------------------------------------------------------------------
        await registry.registerMerchant("My Shop");
        await registry.approveMerchant(owner.address);
    });

    // =========================================================================
    //                              MAIN TEST FLOW
    // =========================================================================
    it("should process the full ecosystem flow", async function () {

        // ---------------------------------------------------------------------
        // USER registers referral
        // ---------------------------------------------------------------------
        await referral.connect(user).registerReferral(referrer.address);

        // ---------------------------------------------------------------------
        // USER makes a purchase → CashbackEngine
        // ---------------------------------------------------------------------
        const purchaseAmount = ethers.parseEther("1000");

        await token.transfer(user.address, purchaseAmount);
        await token.connect(user).approve(cashback.target, purchaseAmount);

        await cashback.connect(user).processCashback(
            user.address,
            owner.address,
            purchaseAmount
        );

        // Cashback earned?
        let rewards1 = await distributor.rewards(user.address);
        expect(rewards1.earned).to.be.gt(0);

        // ---------------------------------------------------------------------
        // USER stakes ELR
        // ---------------------------------------------------------------------
        const stakeAmount = ethers.parseEther("500");

        await token.transfer(user.address, stakeAmount);
        await token.connect(user).approve(staking.target, stakeAmount);

        await staking.connect(user).stake(stakeAmount);

        // ---------------------------------------------------------------------
        // Time passes — staking rewards accumulate
        // ---------------------------------------------------------------------
        await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
        await ethers.provider.send("evm_mine");

        await staking.connect(user).claimRewards();

        let rewards2 = await distributor.rewards(user.address);
        expect(rewards2.earned).to.be.gt(rewards1.earned);

        // ---------------------------------------------------------------------
        // USER creates vesting schedule
        // ---------------------------------------------------------------------
        await token.transfer(vesting.target, ethers.parseEther("10000"));

        await vesting.createVesting(
            user.address,
            ethers.parseEther("2000"),
            0,              // no cliff
            86400 * 30      // 30 days vesting
        );

        // ---------------------------------------------------------------------
        // Fast-forward → unlock
        // ---------------------------------------------------------------------
        await ethers.provider.send("evm_increaseTime", [86400 * 30]);
        await ethers.provider.send("evm_mine");

        await vesting.connect(user).release(1);

        // USER should have received vested tokens
        expect(await token.balanceOf(user.address)).to.be.gt(0);
    });
});
