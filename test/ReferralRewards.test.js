const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReferralRewards (Integration Test)", function () {
    let token, distributor, registry, cashback, referral;
    let owner, user, referee, merchant;

    beforeEach(async function () {
        [owner, user, referee, merchant] = await ethers.getSigners();

        // -------------------------------
        // 1. Deploy Mock ELR Token
        // -------------------------------
        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR TOKEN", "ELR", ethers.parseEther("1000000"));
        await token.waitForDeployment();

        // -------------------------------
        // 2. Deploy Merchant Registry (needs signer)
        // -------------------------------
        const Registry = await ethers.getContractFactory("MerchantRegistry");
        registry = await Registry.deploy(owner.address);
        await registry.waitForDeployment();

        // Register merchant manually for tests
        await registry.registerMerchant("TestShop", "https://shop.test");

        // Approve merchant using signature bypass (direct write for testing)
        const merchantData = await registry.merchants(merchant.address).catch(() => {});
        registry.merchants[merchant.address] = {
            exists: true,
            approved: true,
            blacklisted: false,
            tierLevel: 1,      // SILVER
            totalVolume: 0,
            name: "TestShop",
            website: "test"
        };

        // -------------------------------
        // 3. Deploy Reward Distributor
        // -------------------------------
        const Distributor = await ethers.getContractFactory("RewardDistributor");
        distributor = await Distributor.deploy(token.target, owner.address, owner.address);
        await distributor.waitForDeployment();

        // Fund reward pool
        await token.transfer(distributor.target, ethers.parseEther("500000"));

        // -------------------------------
        // 4. Deploy CashbackEngine
        // -------------------------------
        const Cashback = await ethers.getContractFactory("CashbackEngine");
        cashback = await Cashback.deploy(token.target, registry.target, distributor.target);
        await cashback.waitForDeployment();

        // Register CashbackEngine as module
        await distributor.setModule(cashback.target, true);

        // -------------------------------
        // 5. Deploy ReferralRewards Module
        // -------------------------------
        const Referral = await ethers.getContractFactory("ReferralRewards");
        referral = await Referral.deploy(
            distributor.target,
            cashback.target,
            300,               // 3% bonus to referrer
            ethers.parseEther("10") // 10 ELR welcome bonus
        );
        await referral.waitForDeployment();

        // Register Referral module
        await distributor.setModule(referral.target, true);
    });

    // ---------------------------------------------------
    // TEST 1: Register Referral
    // ---------------------------------------------------
    it("should allow user to register a referral", async function () {
        await referral.connect(user).registerReferral(referee.address);

        const ref = await referral.referredBy(user.address);
        expect(ref).to.equal(referee.address);
    });

    // ---------------------------------------------------
    // TEST 2: Prevent Self-Referral
    // ---------------------------------------------------
    it("should block self-referral", async function () {
        await expect(
            referral.connect(user).registerReferral(user.address)
        ).to.be.revertedWith("CannotReferSelf()");
    });

    // ---------------------------------------------------
    // TEST 3: Prevent Double Referral
    // ---------------------------------------------------
    it("should prevent double registration", async function () {
        await referral.connect(user).registerReferral(referee.address);

        await expect(
            referral.connect(user).registerReferral(referee.address)
        ).to.be.revertedWith("AlreadyReferred()");
    });

    // ---------------------------------------------------
    // TEST 4: Welcome Bonus Allocation
    // ---------------------------------------------------
    it("should give referee a welcome bonus", async function () {
        await referral.connect(user).registerReferral(referee.address);

        const rewards = await distributor.rewards(user.address);
        expect(rewards.earned).to.equal(ethers.parseEther("10"));
    });

    // ---------------------------------------------------
    // TEST 5: Referral Bonus After Purchase
    // ---------------------------------------------------
    it("should allocate referral bonus after purchase", async function () {
        // Step 1 — register referral
        await referral.connect(user).registerReferral(referee.address);

        // Step 2 — simulate merchant purchase, 1000 ELR
        const purchaseAmount = ethers.parseEther("1000");

        // We mock getMerchant() response (bypass signature restrictions)
        registry.getMerchant = async () => {
            return [true, true, false, 1, 0, "Test", "site"];
        };

        // Step 3 — process purchase
        await cashback.processPurchase(
            user.address,
            purchaseAmount,
            merchant.address
        );

        // Step 4 — referral triggered inside CashbackEngine
        await referral.processReferralReward(
            user.address,
            purchaseAmount
        );

        // 3% of 1000 = 30 ELR
        const referrerRewards = await distributor.rewards(referee.address);

        expect(referrerRewards.earned).to.equal(ethers.parseEther("30"));
    });
});
