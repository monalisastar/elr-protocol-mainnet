const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CashbackEngine — Unit + Security Tests (ETHERS v5, FINAL FIX)", function () {
    let token, registry, distributor, engine;
    let owner, user, merchant, attacker, kybSigner;

    beforeEach(async () => {
        [owner, user, merchant, attacker, kybSigner] = await ethers.getSigners();

        // ---------------- TOKEN ----------------
        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR", "ELR", ethers.utils.parseEther("1000000"));
        await token.deployed();

        const initialPool = ethers.utils.parseEther("100000");

        // ---------------- REGISTRY ----------------
        const Registry = await ethers.getContractFactory("MerchantRegistry");
        registry = await Registry.deploy(kybSigner.address);
        await registry.deployed();

        // ---------------- DISTRIBUTOR ----------------
        const Distributor = await ethers.getContractFactory("RewardDistributor");
        distributor = await Distributor.deploy(
            token.address,
            kybSigner.address,
            owner.address
        );
        await distributor.deployed();

        // fund pool
        await token.transfer(owner.address, initialPool);
        await token.connect(owner).approve(distributor.address, initialPool);
        await distributor.connect(owner).fundRewardPool(initialPool);

        // ---------------- CASHBACK ENGINE ----------------
        const Engine = await ethers.getContractFactory("CashbackEngine");
        engine = await Engine.deploy(
            token.address,
            registry.address,
            distributor.address
        );
        await engine.deployed();

        await distributor.connect(owner).setModule(engine.address, true);

        // ---------------- REGISTER MERCHANT ----------------
        await registry.connect(merchant).registerMerchant("TestStore", "store.com");

        // ---------------- APPROVE MERCHANT ----------------
        const tier = 1; // SILVER

        const hash = ethers.utils.solidityKeccak256(
            ["string", "address", "uint8", "address"],
            ["APPROVE_MERCHANT", merchant.address, tier, registry.address]
        );

        const sig = await kybSigner.signMessage(ethers.utils.arrayify(hash));

        await registry.approveMerchantBySig(
            merchant.address,
            tier,
            sig
        );
    });

    // --------------------------------------------------------------------
    // TEST CASES
    // --------------------------------------------------------------------

    it("should reject purchases with amount = 0", async () => {
        await expect(
            engine.processPurchase(user.address, 0, merchant.address)
        ).to.be.revertedWith("InvalidAmount");
    });

    it("should reject purchases from unregistered merchants", async () => {
        await expect(
            engine.processPurchase(user.address, 500, attacker.address)
        ).to.be.revertedWith("NotMerchant");
    });

    it("should reject purchases from blacklisted merchants", async () => {
        const hash = ethers.utils.solidityKeccak256(
            ["string", "address", "address"],
            ["BLACKLIST", merchant.address, registry.address]
        );
        const sig = await kybSigner.signMessage(ethers.utils.arrayify(hash));

        await registry.blacklistBySig(merchant.address, sig);

        await expect(
            engine.processPurchase(user.address, 1000, merchant.address)
        ).to.be.revertedWith("Blacklisted");
    });

    it("should reject purchases from unapproved merchants", async () => {
        await registry.connect(attacker).registerMerchant("Fake", "fake.com");

        await expect(
            engine.processPurchase(user.address, 1000, attacker.address)
        ).to.be.revertedWith("NotApproved");
    });

    it("should compute correct cashback for SILVER tier (1%)", async () => {
        const amount = ethers.utils.parseEther("100");
        const expected = amount.mul(1).div(100);

        await engine.processPurchase(user.address, amount, merchant.address);

        const reward = await distributor.rewards(user.address);

        expect(reward.earned).to.equal(expected);
    });

    it("should emit CashbackProcessed", async () => {
        const amount = ethers.utils.parseEther("50");
        const expected = amount.mul(1).div(100);

        await expect(
            engine.processPurchase(user.address, amount, merchant.address)
        )
            .to.emit(engine, "CashbackProcessed")
            .withArgs(user.address, merchant.address, amount, expected, 1);
    });

    it("should increase volume and upgrade tier", async () => {
        const SILVER_THRESHOLD = ethers.utils.parseEther("10000");

        await engine.processPurchase(user.address, SILVER_THRESHOLD, merchant.address);

        const m = await registry.getMerchant(merchant.address);
        expect(m.tierLevel).to.equal(1);
    });

    it("should revert if CashbackEngine is not an approved module", async () => {
        await distributor.connect(owner).setModule(engine.address, false);

        await expect(
            engine.processPurchase(user.address, 1000, merchant.address)
        ).to.be.revertedWith("NotModule");
    });

    it("should revert when reward exceeds pool", async () => {
        const hugeAmount = ethers.utils.parseEther("99999999999");

        await expect(
            engine.processPurchase(user.address, hugeAmount, merchant.address)
        ).to.be.revertedWith("PoolLow");
    });
});
