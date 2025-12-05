const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (v) => ethers.utils.parseUnits(v.toString(), 18);

describe("🚨 ELR ECOSYSTEM — SECURITY & EXPLOIT TEST SUITE", function () {
    let owner, user, merchant, attackerEOA, teamWallet;
    let token, registry, distributor, engine, staking, vesting;
    let kybSigner;

    beforeEach(async () => {
        [owner, user, merchant, attackerEOA, teamWallet] = await ethers.getSigners();

        kybSigner = ethers.Wallet.createRandom();

        // Token
        const Mock = await ethers.getContractFactory("MockERC20");
        token = await Mock.deploy("ELR", "ELR", toWei(1_000_000));
        await token.transfer(user.address, toWei(50_000));

        // Merchant Registry
        const Registry = await ethers.getContractFactory("MerchantRegistry");
        registry = await Registry.deploy(kybSigner.address);

        // Reward Distributor (owner = owner)
        const Distributor = await ethers.getContractFactory("RewardDistributor");
        distributor = await Distributor.deploy(token.address, kybSigner.address, owner.address);

        await token.approve(distributor.address, toWei(800_000));
        await distributor.fundRewardPool(toWei(800_000));

        // CashbackEngine
        const Engine = await ethers.getContractFactory("CashbackEngine");
        engine = await Engine.deploy(token.address, registry.address, distributor.address);

        await distributor.connect(owner).setModule(engine.address, true);

        // Staking
        const Staking = await ethers.getContractFactory("Staking");
        staking = await Staking.deploy(token.address, distributor.address);

        await distributor.connect(owner).setModule(staking.address, true);

        await staking.setRewardRate("1000000000000");

        // Vesting
        const Vesting = await ethers.getContractFactory("EloreTokenVesting");
        vesting = await Vesting.deploy(token.address);
        await token.transfer(vesting.address, toWei(200_000));
    });

    // -------------------------------------------------------------------------
    // 🧨 1. Attempt reentrancy attack on RewardDistributor.claimRewards()
    // -------------------------------------------------------------------------

    it("should block reentrancy attempts", async () => {
        const Attacker = await ethers.getContractFactory("ReentrancyAttack");
        const attackContract = await Attacker.deploy(distributor.address);

        // Give attacker some fake rewards manually (onlyOwner)
        await distributor.connect(owner).resetUser(attackContract.address);
        distributor.rewards(attackContract.address);

        // Try reentrancy
        await expect(
            attackContract.attack()
        ).to.be.reverted; // ReentrancyGuard should block
    });

    // -------------------------------------------------------------------------
    // 🧨 2. Unauthorized module calling allocateFromModule()
    // -------------------------------------------------------------------------

    it("should block reward allocation by unauthorized modules", async () => {
        await expect(
            distributor.connect(attackerEOA).allocateFromModule(user.address, 1000)
        ).to.be.revertedWith("NotModule()");
    });

    // -------------------------------------------------------------------------
    // 🧨 3. Forged KYB signature attacker cannot approve themselves
    // -------------------------------------------------------------------------

    function buildSig(addr, tier) {
        const msgHash = ethers.utils.solidityKeccak256(
            ["string", "address", "uint8", "address"],
            ["APPROVE_MERCHANT", addr, tier, registry.address]
        );
        return attackerEOA.signMessage(ethers.utils.arrayify(msgHash)); // forged
    }

    it("should reject forged KYB signatures", async () => {
        await registry.connect(attackerEOA).registerMerchant("Fake", "hack.me");

        const fakeSig = await buildSig(attackerEOA.address, 3);

        await expect(
            registry.approveMerchantBySig(attackerEOA.address, 3, fakeSig)
        ).to.be.revertedWith("invalid KYB signature");
    });

    // -------------------------------------------------------------------------
    // 🧨 4. Attempt rewardPool draining via overflow math
    // -------------------------------------------------------------------------

    it("should prevent overflow attacks on rewardPool", async () => {
        const before = await distributor.rewardPool();

        // Attacker tries to allocate huge reward
        await expect(
            distributor.connect(owner).allocateFromModule(
                user.address,
                ethers.constants.MaxUint256
            )
        ).to.be.reverted; // Will overflow or fail PoolLow()

        expect(await distributor.rewardPool()).to.equal(before);
    });

    // -------------------------------------------------------------------------
    // 🧨 5. Attacker tries to steal staking rewards without staking
    // -------------------------------------------------------------------------

    it("attacker cannot claim staking rewards without staking", async () => {
        await expect(
            staking.connect(attackerEOA).claimRewards()
        ).to.be.revertedWith("no rewards");
    });

    // -------------------------------------------------------------------------
    // 🧨 6. Attacker attempts to bypass lock and unstake early
    // -------------------------------------------------------------------------

    it("attacker cannot bypass staking lock", async () => {
        await token.transfer(attackerEOA.address, toWei(2000));
        await token.connect(attackerEOA).approve(staking.address, toWei(2000));

        // attacker stakes with 30d lock
        await staking.connect(attackerEOA).stake(toWei(2000), 1, false);

        // try early unstake
        await expect(
            staking.connect(attackerEOA).unstake(toWei(2000))
        ).to.be.revertedWith("locked");
    });

    // -------------------------------------------------------------------------
    // 🧨 7. Vesting: attacker tries to release tokens of another user
    // -------------------------------------------------------------------------

    it("attacker cannot release someone else's vested tokens", async () => {
        const now = (await ethers.provider.getBlock("latest")).timestamp;

        await vesting.createVesting(
            user.address,
            toWei(10000),
            now,
            10,
            100,
            true
        );

        await ethers.provider.send("evm_increaseTime", [50]);
        await ethers.provider.send("evm_mine");

        await expect(
            vesting.connect(attackerEOA).release(user.address)
        ).to.be.revertedWith("not beneficiary");
    });

    // -------------------------------------------------------------------------
    // 🧨 8. Vesting: attacker tries to revoke someone else's vesting
    // -------------------------------------------------------------------------

    it("attacker cannot revoke vesting schedule", async () => {
        const now = (await ethers.provider.getBlock("latest")).timestamp;

        await vesting.createVesting(
            user.address,
            toWei(10000),
            now,
            10,
            100,
            true
        );

        await expect(
            vesting.connect(attackerEOA).revoke(user.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    // -------------------------------------------------------------------------
    // 🧨 9. Merchant Registry – attacker tries tier escalation without volume
    // -------------------------------------------------------------------------

    it("attacker cannot self-upgrade tier", async () => {
        await registry.connect(attackerEOA).registerMerchant("Bad", "hack.com");

        const merchant = await registry.merchants(attackerEOA.address);
        expect(merchant.tierLevel).to.equal(0); // default

        // attacker tries updating without real volumes
        await expect(
            registry.updateVolumeAndTier(attackerEOA.address, 0)
        ).to.be.reverted;
    });

    // -------------------------------------------------------------------------
    // 🧨 10. Cashback: attacker tries to call processPurchase() for an unapproved merchant
    // -------------------------------------------------------------------------

    it("rejects purchases from unapproved merchants", async () => {
        await registry.connect(attackerEOA).registerMerchant("fake", "attacker.com");

        await expect(
            engine.processPurchase(user.address, toWei(1000), attackerEOA.address)
        ).to.be.revertedWith("NotApproved()");
    });
});
