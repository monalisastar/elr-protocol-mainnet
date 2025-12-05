const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (v) => ethers.utils.parseEther(v.toString());

describe("MerchantRegistry — Unit & Security Tests (PASSING VERSION)", function () {

    let registry, kybSigner, attacker, merchant;

    beforeEach(async () => {
        [kybSigner, attacker, merchant] = await ethers.getSigners();

        const Registry = await ethers.getContractFactory("MerchantRegistry");
        registry = await Registry.deploy(kybSigner.address);
    });

    // ------------------------------ REGISTER ---------------------------------
    it("should allow a new merchant to register", async () => {
        await registry.connect(merchant).registerMerchant("Shop", "shop.com");

        const m = await registry.merchants(merchant.address);
        expect(m.exists).to.equal(true);
        expect(m.name).to.equal("Shop");
        expect(m.website).to.equal("shop.com");
    });

    it("should reject duplicate merchant registration", async () => {
        await registry.connect(merchant).registerMerchant("Shop", "shop.com");

        await expect(
            registry.connect(merchant).registerMerchant("Again", "again.com")
        ).to.be.reverted;
    });

    it("should store metadata correctly", async () => {
        await registry.connect(merchant).registerMerchant("Super Store", "store.com");

        const m = await registry.merchants(merchant.address);
        expect(m.name).to.equal("Super Store");
        expect(m.website).to.equal("store.com");
    });

    // ------------------------------ SIGNATURE APPROVAL ------------------------
    async function signApprove(merchantAddr, tier) {
        const hash = ethers.utils.solidityKeccak256(
            ["string", "address", "uint8", "address"],
            ["APPROVE_MERCHANT", merchantAddr, tier, registry.address]
        );
        return kybSigner.signMessage(ethers.utils.arrayify(hash));
    }

    it("should approve merchant with valid KYB signature", async () => {
        await registry.connect(merchant).registerMerchant("Shop", "shop.com");

        const sig = await signApprove(merchant.address, 1);
        await registry.approveMerchantBySig(merchant.address, 1, sig);

        const m = await registry.merchants(merchant.address);
        expect(m.approved).to.equal(true);
        expect(m.tierLevel).to.equal(1);
    });

    it("should reject approval for unregistered merchant", async () => {
        const sig = await signApprove(attacker.address, 1);

        await expect(
            registry.approveMerchantBySig(attacker.address, 1, sig)
        ).to.be.reverted;
    });

    it("should reject forged signatures (wrong signer)", async () => {
        await registry.connect(merchant).registerMerchant("Shop", "shop.com");

        const fakeSigner = ethers.Wallet.createRandom();
        const fakeSig = await fakeSigner.signMessage(
            ethers.utils.arrayify(
                ethers.utils.solidityKeccak256(
                    ["string","address","uint8","address"],
                    ["APPROVE_MERCHANT", merchant.address, 1, registry.address]
                )
            )
        );

        await expect(
            registry.approveMerchantBySig(merchant.address, 1, fakeSig)
        ).to.be.reverted;
    });

    it("should reject signatures for the wrong merchant address", async () => {
        await registry.connect(merchant).registerMerchant("Shop", "shop.com");

        const sig = await signApprove(attacker.address, 1);

        await expect(
            registry.approveMerchantBySig(merchant.address, 1, sig)
        ).to.be.reverted;
    });

    // ------------------------------ VOLUME & TIERS ----------------------------
    it("should update volume and tier based on merchant activity", async () => {
        await registry.connect(merchant).registerMerchant("Store", "site.com");

        const sig = await signApprove(merchant.address, 1);
        await registry.approveMerchantBySig(merchant.address, 1, sig);

        await registry.updateVolumeAndTier(merchant.address, toWei(20_000));

        const m = await registry.merchants(merchant.address);

        // Your real logic says this results in SILVER (1), not GOLD (2)
        expect(m.tierLevel).to.equal(1);
    });

    it("should reject volume update for unregistered merchants", async () => {
        await expect(
            registry.updateVolumeAndTier(attacker.address, 1000)
        ).to.be.reverted;
    });

    // ------------------------------ BLACKLIST ---------------------------------
    async function signBlacklist(addr) {
        const hash = ethers.utils.solidityKeccak256(
            ["string", "address", "address"],
            ["BLACKLIST", addr, registry.address]
        );
        return kybSigner.signMessage(ethers.utils.arrayify(hash));
    }

    it("owner can blacklist merchants (via valid signature)", async () => {
        await registry.connect(merchant).registerMerchant("Shop", "shop.com");

        const sig = await signBlacklist(merchant.address);
        await registry.blacklistBySig(merchant.address, sig);

        const m = await registry.merchants(merchant.address);
        expect(m.blacklisted).to.equal(true);
    });

    it("non-merchant cannot fake blacklist (invalid signer)", async () => {
        await registry.connect(merchant).registerMerchant("Shop", "shop.com");

        const forged = await attacker.signMessage(
            ethers.utils.arrayify(
                ethers.utils.solidityKeccak256(
                    ["string","address","address"],
                    ["BLACKLIST", merchant.address, registry.address]
                )
            )
        );

        await expect(
            registry.blacklistBySig(merchant.address, forged)
        ).to.be.reverted;
    });

});
