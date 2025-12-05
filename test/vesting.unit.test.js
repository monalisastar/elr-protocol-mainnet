const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (v) => ethers.utils.parseUnits(v.toString(), 18);

describe("EloreTokenVesting — Unit & Logic Tests", function () {
  let owner, beneficiary, other;
  let token, vesting;
  const cliff = 30 * 86400;
  const duration = 300 * 86400;

  beforeEach(async () => {
    [owner, beneficiary, other] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockERC20");
    token = await Mock.deploy("ELR TOKEN", "ELR", toWei(1_000_000));

    const Vesting = await ethers.getContractFactory("EloreTokenVesting");
    vesting = await Vesting.deploy(token.address);

    // fund vesting contract
    await token.transfer(vesting.address, toWei(500_000));
  });

  it("creates vesting schedule correctly", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await vesting.createVesting(
      beneficiary.address,
      toWei(10000),
      now,
      cliff,
      duration,
      true
    );

    const v = await vesting.vestings(beneficiary.address);

    expect(v.total).to.equal(toWei(10000));
    expect(v.start).to.equal(now);
    expect(v.cliff).to.equal(now + cliff);
    expect(v.duration).to.equal(duration);
    expect(v.revocable).to.equal(true);
    expect(v.released).to.equal(0);
  });

  it("rejects creating vesting for zero address", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await expect(
      vesting.createVesting(
        ethers.constants.AddressZero,
        toWei(1000),
        now,
        cliff,
        duration,
        true
      )
    ).to.be.revertedWith("zero address");
  });

  it("cannot release before cliff ends", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await vesting.createVesting(
      beneficiary.address,
      toWei(10000),
      now,
      cliff,
      duration,
      true
    );

    await expect(
      vesting.release(beneficiary.address)
    ).to.be.revertedWith("cliff not reached");
  });

  it("linear release works after cliff", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await vesting.createVesting(
      beneficiary.address,
      toWei(10000),
      now,
      cliff,
      duration,
      true
    );

    // Move slightly past cliff
    await ethers.provider.send("evm_increaseTime", [cliff + 10]);
    await ethers.provider.send("evm_mine");

    await vesting.release(beneficiary.address);

    const bal = await token.balanceOf(beneficiary.address);
    expect(bal).to.be.gt(0);
    expect(bal).to.be.lt(toWei(10000));
  });

  it("full release after full duration", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await vesting.createVesting(
      beneficiary.address,
      toWei(10000),
      now,
      cliff,
      duration,
      true
    );

    // Jump to end of vesting
    await ethers.provider.send("evm_increaseTime", [cliff + duration + 10]);
    await ethers.provider.send("evm_mine");

    await vesting.release(beneficiary.address);

    const bal = await token.balanceOf(beneficiary.address);
    expect(bal.toString()).to.equal(toWei(10000).toString());
  });

  it("cannot release twice for same unlocked tokens", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await vesting.createVesting(
      beneficiary.address,
      toWei(10000),
      now,
      cliff,
      duration,
      true
    );

    await ethers.provider.send("evm_increaseTime", [cliff + duration]);
    await ethers.provider.send("evm_mine");

    await vesting.release(beneficiary.address);

    await expect(
      vesting.release(beneficiary.address)
    ).to.be.revertedWith("no tokens due");
  });

  it("owner can revoke revocable vesting", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await vesting.createVesting(
      beneficiary.address,
      toWei(10000),
      now,
      cliff,
      duration,
      true
    );

    await vesting.revoke(beneficiary.address);

    const v = await vesting.vestings(beneficiary.address);
    expect(v.revoked).to.equal(true);
  });

  it("non-owner cannot revoke", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await vesting.createVesting(
      beneficiary.address,
      toWei(10000),
      now,
      cliff,
      duration,
      true
    );

    await expect(
      vesting.connect(other).revoke(beneficiary.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("cannot revoke non-revocable vesting", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await vesting.createVesting(
      beneficiary.address,
      toWei(10000),
      now,
      cliff,
      duration,
      false
    );

    await expect(
      vesting.revoke(beneficiary.address)
    ).to.be.revertedWith("not revocable");
  });

  it("revoking stops future release", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await vesting.createVesting(
      beneficiary.address,
      toWei(10000),
      now,
      cliff,
      duration,
      true
    );

    await vesting.revoke(beneficiary.address);

    await ethers.provider.send("evm_increaseTime", [cliff + duration]);
    await ethers.provider.send("evm_mine");

    await expect(
      vesting.release(beneficiary.address)
    ).to.be.revertedWith("revoked");
  });
});
