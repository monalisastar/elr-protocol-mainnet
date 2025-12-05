const { expect } = require("chai");
const { ethers } = require("hardhat");

function log(...args) {
    console.log("\n🟦 LOG:", ...args);
}

describe("🔥 FULL ELR ECOSYSTEM — END TO END WITH LOGS + rewardRate FIX", function () {
    let owner, user, merchant, referrer, kybSigner, multisigOwner;

    // Core
    let token, registry, distributor, engine;

    // Modules
    let referralEngine, streakEngine, levelEngine, randomEngine, questEngine, merchantStaking, staking;

    beforeEach(async function () {

        log("Setting up signers...");
        [owner, user, merchant, referrer, kybSigner, multisigOwner] = await ethers.getSigners();

        // -------------------------------------------------------------
        // 1. Deploy MockERC20
        // -------------------------------------------------------------
        log("Deploying MockERC20...");
        const Mock = await ethers.getContractFactory("MockERC20");
        token = await Mock.deploy("ELR", "ELR", ethers.utils.parseEther("1000000000"));
        await token.deployed();
        log("Token deployed at:", token.address);

        // -------------------------------------------------------------
        // 2. Merchant Registry
        // -------------------------------------------------------------
        const Registry = await ethers.getContractFactory("MerchantRegistry");
        registry = await Registry.deploy(kybSigner.address);
        await registry.deployed();
        log("Registry deployed at:", registry.address);

        // -------------------------------------------------------------
        // 3. Reward Distributor
        // -------------------------------------------------------------
        const Distributor = await ethers.getContractFactory("RewardDistributor");
        distributor = await Distributor.deploy(
            token.address,
            kybSigner.address,
            multisigOwner.address
        );
        await distributor.deployed();
        log("Distributor deployed at:", distributor.address);

        // -------------------------------------------------------------
        // 4. Cashback Engine
        // -------------------------------------------------------------
        const Engine = await ethers.getContractFactory("CashbackEngine");
        engine = await Engine.deploy(token.address, registry.address, distributor.address);
        await engine.deployed();
        log("CashbackEngine deployed at:", engine.address);

        await distributor.connect(multisigOwner).setModule(engine.address, true);

        // -------------------------------------------------------------
        // 5. Referral Engine
        // -------------------------------------------------------------
        const Referral = await ethers.getContractFactory("ReferralRewards");
        referralEngine = await Referral.deploy(
            distributor.address,
            engine.address,
            300,
            ethers.utils.parseEther("1")
        );
        await referralEngine.deployed();
        log("ReferralEngine deployed:", referralEngine.address);
        await distributor.connect(multisigOwner).setModule(referralEngine.address, true);

        // -------------------------------------------------------------
        // 6. Streak Engine
        // -------------------------------------------------------------
        const Streaks = await ethers.getContractFactory("LoyaltyStreaks");
        streakEngine = await Streaks.deploy(distributor.address, engine.address);
        await streakEngine.deployed();
        log("StreakEngine deployed:", streakEngine.address);
        await distributor.connect(multisigOwner).setModule(streakEngine.address, true);

        // -------------------------------------------------------------
        // 7. XP Engine
        // -------------------------------------------------------------
        const Levels = await ethers.getContractFactory("UserLevels");
        levelEngine = await Levels.deploy(distributor.address, engine.address);
        await levelEngine.deployed();
        log("LevelEngine deployed:", levelEngine.address);
        await distributor.connect(multisigOwner).setModule(levelEngine.address, true);

        // -------------------------------------------------------------
        // 8. Random Bonus Engine
        // -------------------------------------------------------------
        const Random = await ethers.getContractFactory("RandomBonus");
        randomEngine = await Random.deploy(distributor.address, engine.address);
        await randomEngine.deployed();
        log("RandomEngine deployed:", randomEngine.address);
        await distributor.connect(multisigOwner).setModule(randomEngine.address, true);

        // -------------------------------------------------------------
        // 9. Quest Engine
        // -------------------------------------------------------------
        const Quests = await ethers.getContractFactory("PurchaseQuests");
        questEngine = await Quests.deploy(distributor.address, engine.address);
        await questEngine.deployed();
        log("QuestEngine deployed:", questEngine.address);
        await distributor.connect(multisigOwner).setModule(questEngine.address, true);

        // -------------------------------------------------------------
        // 10. Merchant Staking Engine
        // -------------------------------------------------------------
        const MStake = await ethers.getContractFactory("MerchantStaking");
        merchantStaking = await MStake.deploy(
            token.address,
            distributor.address,
            registry.address
        );
        await merchantStaking.deployed();
        log("MerchantStaking deployed:", merchantStaking.address);
        await distributor.connect(multisigOwner).setModule(merchantStaking.address, true);

        // -------------------------------------------------------------
        // 11. User Staking (ELR Staking)
        // -------------------------------------------------------------
        const Staking = await ethers.getContractFactory("Staking");
        staking = await Staking.deploy(token.address, distributor.address);
        await staking.deployed();
        log("StakingEngine deployed:", staking.address);
        await distributor.connect(multisigOwner).setModule(staking.address, true);

        // -------------------------------------------------------------
        // 12. Wire Modules into cashback engine
        // -------------------------------------------------------------
        log("Wiring modules...");
        await engine.setReferralEngine(referralEngine.address);
        await engine.setStreakEngine(streakEngine.address);
        await engine.setLevelEngine(levelEngine.address);
        await engine.setRandomBonusEngine(randomEngine.address);
        await engine.setQuestEngine(questEngine.address);
        await engine.setMerchantStakingEngine(merchantStaking.address);
        log("Modules wired ✓");

        // -------------------------------------------------------------
        // 13. Fund reward pool
        // -------------------------------------------------------------
        log("Funding reward pool...");
        await token.transfer(multisigOwner.address, ethers.utils.parseEther("1000000"));
        await token.connect(multisigOwner).approve(distributor.address, ethers.utils.parseEther("1000000"));
        await distributor.connect(multisigOwner).fundRewardPool(ethers.utils.parseEther("1000000"));
        log("Reward pool funded ✓");

        // -------------------------------------------------------------
        // 14. Merchant registration + approval
        // -------------------------------------------------------------
        await registry.connect(merchant).registerMerchant("Duka", "https://duka.ke");

        const hash = ethers.utils.solidityKeccak256(
            ["string", "address", "uint8", "address"],
            ["APPROVE_MERCHANT", merchant.address, 1, registry.address]
        );
        const sig = await kybSigner.signMessage(ethers.utils.arrayify(hash));

        await registry.approveMerchantBySig(merchant.address, 1, sig);
        log("Merchant approved ✓");

        // -------------------------------------------------------------
        // 15. Referral registration
        // -------------------------------------------------------------
        await referralEngine.connect(user).registerReferral(referrer.address);
        log("Referral registered ✓");

        // Give tokens
        await token.transfer(user.address, ethers.utils.parseEther("1000"));
        await token.transfer(merchant.address, ethers.utils.parseEther("5000"));

        log("Initial balances distributed ✓");
    });

    // =====================================================================
    // TEST FLOW
    // =====================================================================

    it("should complete the FULL ecosystem flow", async function () {

        log("Starting test flow...");

        await token.connect(user).approve(engine.address, ethers.utils.parseEther("1000000"));
        await token.connect(merchant).approve(engine.address, ethers.utils.parseEther("1000000"));

        // -------------------------------------------------------------
        // Merchant stakes → boost
        // -------------------------------------------------------------
        log("Merchant staking 2000 ELR...");
        await token.connect(merchant).approve(merchantStaking.address, ethers.utils.parseEther("2000"));
        await merchantStaking.connect(merchant).stake(ethers.utils.parseEther("2000"));

        const boost = await merchantStaking.merchantBoost(merchant.address);
        log("Merchant boost:", boost.toString());
        expect(boost).to.equal(1);

        // -------------------------------------------------------------
        // User purchase → triggers all modules
        // -------------------------------------------------------------
        log("Processing purchase...");
        await engine.processPurchase(
            user.address,
            ethers.utils.parseEther("1000"),
            merchant.address
        );

        const earned = (await distributor.rewards(user.address)).earned;
        log("User earned rewards:", earned.toString());
        expect(earned).to.be.gt(0);

        // -------------------------------------------------------------
        // Claim rewards
        // -------------------------------------------------------------
        log("User claiming rewards...");
        const before = await token.balanceOf(user.address);

        await distributor.connect(user).claimRewards();

        const after = await token.balanceOf(user.address);
        log("Balance before:", before.toString());
        log("Balance after:", after.toString());

        expect(after).to.be.gt(before);

        // -------------------------------------------------------------
        // ⭐ CRITICAL FIX: Set Staking reward rate
        // -------------------------------------------------------------
        log("Setting reward rate for staking...");
        await staking.connect(owner).setRewardRate(
            ethers.utils.parseEther("0.00001") // 1e-5 per second
        );
        log("Reward rate set ✓");

        // -------------------------------------------------------------
        // Stake 50 ELR
        // -------------------------------------------------------------
        log("User staking 50 ELR...");
        await token.connect(user).approve(staking.address, ethers.utils.parseEther("50"));
        await staking.connect(user).stake(ethers.utils.parseEther("50"), 0, false);

        const st = await staking.stakes(user.address);
        log("User staked:", st.amount.toString());
        expect(st.amount).to.equal(ethers.utils.parseEther("50"));

        // Fast forward 1 hour
        await ethers.provider.send("evm_increaseTime", [3600]);
        await ethers.provider.send("evm_mine");

        // -------------------------------------------------------------
        // Claim staking rewards
        // -------------------------------------------------------------
        log("Claiming staking rewards...");
        await staking.connect(user).claimRewards();

        const stAfter = await staking.stakes(user.address);
        log("Reward debt after claim:", stAfter.rewardDebt.toString());

        expect(stAfter.rewardDebt).to.equal(0);
    });
});
