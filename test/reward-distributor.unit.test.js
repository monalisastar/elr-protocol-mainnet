const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RewardDistributor — Unit + Security Tests (FINAL, ETHERS v5)", function () {

    let owner, kybSigner, user, attacker, module;
    let token, distributor;

    // Helper: build signature the exact way the contract expects
    async function buildSignature(signer, userAddr, amount, nonce, contractAddr) {
        const message = ethers.utils.solidityKeccak256(
            ["address", "uint256", "bytes32", "address"],
            [userAddr, amount, nonce, contractAddr]
        );
        const ethHash = ethers.utils.hashMessage(ethers.utils.arrayify(message));
        return await signer.signMessage(ethers.utils.arrayify(message));
    }

    beforeEach(async function () {
        [owner, kybSigner, user, attacker, module] = await ethers.getSigners();

        // Deploy mock token
        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("ELR", "ELR", ethers.utils.parseEther("1000000"));
        await token.deployed();

        // Distributor
        const RD = await ethers.getContractFactory("RewardDistributor");
        distributor = await RD.deploy(
            token.address,
            kybSigner.address,
            owner.address
        );
        await distributor.deployed();

        // Fund owner with tokens and approve distributor to pull
        await token.transfer(owner.address, ethers.utils.parseEther("500000"));
        await token.connect(owner).approve(distributor.address, ethers.utils.parseEther("500000"));

        // Owner funds reward pool
        await distributor.connect(owner).fundRewardPool(ethers.utils.parseEther("1000"));

        // Enable module
        await distributor.connect(owner).setModule(module.address, true);
    });

    // -------------------------------------------------------------------------
    // 1. Constructor + basic state
    // -------------------------------------------------------------------------
    it("should initialize correctly", async function () {
        expect(await distributor.kybSigner()).to.equal(kybSigner.address);
        expect(await distributor.rewardPool()).to.equal(ethers.utils.parseEther("1000"));
        expect(await token.balanceOf(distributor.address)).to.equal(ethers.utils.parseEther("1000"));
    });

    // -------------------------------------------------------------------------
    // 2. Fund reward pool
    // -------------------------------------------------------------------------
    it("owner should fund reward pool", async function () {
        await token.connect(owner).approve(distributor.address, ethers.utils.parseEther("200"));
        await expect(distributor.connect(owner).fundRewardPool(ethers.utils.parseEther("200")))
            .to.emit(distributor, "RewardPoolFunded");

        expect(await distributor.rewardPool()).to.equal(ethers.utils.parseEther("1200"));
    });

    it("non-owner cannot fund pool", async function () {
        await expect(
            distributor.connect(attacker).fundRewardPool(10)
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    // -------------------------------------------------------------------------
    // 3. Module access control
    // -------------------------------------------------------------------------
    it("should allow approved module to allocate", async function () {
        await distributor.connect(module).allocateFromModule(user.address, 100);

        const r = await distributor.rewards(user.address);
        expect(r.earned).to.equal(100);
        expect(await distributor.rewardPool()).to.equal(ethers.utils.parseEther("1000").sub(100));
    });

    it("should reject non-module allocations", async function () {
        await expect(
            distributor.connect(attacker).allocateFromModule(user.address, 50)
        ).to.be.revertedWith("NotModule");
    });

    // -------------------------------------------------------------------------
    // 4. Allocation error conditions
    // -------------------------------------------------------------------------
    it("should reject zero amount allocations", async function () {
        await expect(
            distributor.connect(module).allocateFromModule(user.address, 0)
        ).to.be.revertedWith("ZeroAmount");
    });

    it("should revert when reward exceeds pool", async function () {
        await expect(
            distributor.connect(module).allocateFromModule(user.address, ethers.utils.parseEther("2000"))
        ).to.be.revertedWith("PoolLow");
    });

    // -------------------------------------------------------------------------
    // 5. Signed allocation system
    // -------------------------------------------------------------------------
    it("should allocate rewards with valid backend signature", async function () {
        const nonce = ethers.utils.formatBytes32String("nonce1");
        const amount = 123;

        const sig = await buildSignature(
            kybSigner,
            user.address,
            amount,
            nonce,
            distributor.address
        );

        await expect(
            distributor.allocateRewardSigned(user.address, amount, nonce, sig)
        ).to.emit(distributor, "RewardAllocated");

        const r = await distributor.rewards(user.address);
        expect(r.earned).to.equal(amount);
    });

    it("should reject reused nonce", async function () {
        const nonce = ethers.utils.formatBytes32String("X1");
        const amount = 55;

        const sig = await buildSignature(
            kybSigner,
            user.address,
            amount,
            nonce,
            distributor.address
        );

        // First OK
        await distributor.allocateRewardSigned(user.address, amount, nonce, sig);

        // Second should fail
        await expect(
            distributor.allocateRewardSigned(user.address, amount, nonce, sig)
        ).to.be.revertedWith("AlreadyUsedNonce");
    });

    it("should reject signatures from wrong signer", async function () {
        const nonce = ethers.utils.formatBytes32String("BAD_SIG");
        const amount = 22;

        const sig = await buildSignature(
            attacker, // WRONG SIGNER
            user.address,
            amount,
            nonce,
            distributor.address
        );

        await expect(
            distributor.allocateRewardSigned(user.address, amount, nonce, sig)
        ).to.be.revertedWith("InvalidSignature");
    });

    it("should reject tampered amount (signature mismatch)", async function () {
        const nonce = ethers.utils.formatBytes32String("T1");

        const sig = await buildSignature(
            kybSigner,
            user.address,
            50,
            nonce,
            distributor.address
        );

        await expect(
            distributor.allocateRewardSigned(user.address, 99, nonce, sig)
        ).to.be.revertedWith("InvalidSignature");
    });

    it("should prevent replay attack across contracts", async function () {
        // Deploy second distributor
        const RD = await ethers.getContractFactory("RewardDistributor");
        const distributor2 = await RD.deploy(
            token.address,
            kybSigner.address,
            owner.address
        );
        await distributor2.deployed();

        const nonce = ethers.utils.formatBytes32String("REPLAY");
        const amount = 10;

        // Signature is bound to distributor.address, not distributor2
        const sig = await buildSignature(
            kybSigner,
            user.address,
            amount,
            nonce,
            distributor.address
        );

        await expect(
            distributor2.allocateRewardSigned(user.address, amount, nonce, sig)
        ).to.be.revertedWith("InvalidSignature");
    });

    // -------------------------------------------------------------------------
    // 6. claimRewards()
    // -------------------------------------------------------------------------
    it("user should claim accumulated rewards", async function () {
        await distributor.connect(module).allocateFromModule(user.address, 100);

        const beforeBalance = await token.balanceOf(user.address);

        await expect(distributor.connect(user).claimRewards())
            .to.emit(distributor, "RewardClaimed");

        const afterBalance = await token.balanceOf(user.address);

        expect(afterBalance.sub(beforeBalance)).to.equal(100);

        const r = await distributor.rewards(user.address);
        expect(r.claimed).to.equal(100);
        expect(r.earned).to.equal(100);
    });

    it("should revert claim when no rewards", async function () {
        await expect(
            distributor.connect(user).claimRewards()
        ).to.be.revertedWith("none");
    });

    // -------------------------------------------------------------------------
    // 7. resetUser() — testing cleanup
    // -------------------------------------------------------------------------
    it("owner can reset user rewards", async function () {
        await distributor.connect(module).allocateFromModule(user.address, 100);

        await distributor.connect(owner).resetUser(user.address);

        const r = await distributor.rewards(user.address);
        expect(r.earned).to.equal(0);
        expect(r.claimed).to.equal(0);
        expect(r.lastClaimed).to.equal(0);
    });

    it("non-owner cannot reset user", async function () {
        await expect(
            distributor.connect(attacker).resetUser(user.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

});
