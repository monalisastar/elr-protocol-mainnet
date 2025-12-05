// scripts/setup-all-vesting.js
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("👤 Using deployer:", deployer.address);

  // Vesting contract address (your deployed one)
  const vestingAddress = "0x05BfF24A655834C275C27b58A98Ccaaa8d948128";

  const vest = await hre.ethers.getContractAt(
    "EloreTokenVesting",
    vestingAddress
  );

  // Allocation wallets
  const TEAM = "0xff01420FB151A7bd49E067Be6AbfCD1492a13ab6";
  const PUBLIC_SALE = "0x4121E61f37781092e8422AcA29F248D73f3Cd089";
  const TREASURY = "0x24746fA674Da211891ed068af86eEDD8d235Eb66";

  const now = Math.floor(Date.now() / 1000);

  console.log("⏳ Creating vesting schedules...");

  // --------------------------
  // 1. TEAM – 12m cliff, 36m vesting
  // --------------------------
  let tx = await vest.createVesting(
    TEAM,
    hre.ethers.utils.parseEther("100000000"),  // 100M
    now,
    60 * 60 * 24 * 365,                       // 12 months cliff
    60 * 60 * 24 * 365 * 3,                   // 36 months duration
    false                                     // NOT revocable
  );
  await tx.wait();
  console.log("✅ Team vesting created");

  // --------------------------
  // 2. PUBLIC SALE – no cliff, 12m vesting
  // --------------------------
  tx = await vest.createVesting(
    PUBLIC_SALE,
    hre.ethers.utils.parseEther("100000000"), // 100M
    now,
    0,                                        // no cliff
    60 * 60 * 24 * 365,                       // 12 months duration
    false                                     // NOT revocable
  );
  await tx.wait();
  console.log("✅ Public sale vesting created");

  // --------------------------
  // 3. TREASURY – 6m cliff, 24m vesting
  // --------------------------
  tx = await vest.createVesting(
    TREASURY,
    hre.ethers.utils.parseEther("50000000"),  // 50M
    now,
    60 * 60 * 24 * 180,                        // 6 months cliff
    60 * 60 * 24 * 365 * 2,                    // 24 months vesting
    true                                       // revocable
  );
  await tx.wait();
  console.log("✅ Treasury vesting created");

  console.log("\n🎉 ALL VESTING SCHEDULES DEPLOYED SUCCESSFULLY");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
