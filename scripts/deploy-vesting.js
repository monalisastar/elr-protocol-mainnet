const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("🚀 Deploying Vesting Contract with account:", deployer.address);
  console.log("💰 Balance:", (await deployer.getBalance()).toString());

  // ⭐ IMPORTANT — your ELR token address on Amoy testnet
  const TOKEN_ADDRESS = "0x8E9abdF8759B0d2863A030E49406C05b30ed43Ed";

  const Vesting = await hre.ethers.getContractFactory("EloreTokenVesting");

  console.log("📦 Deploying EloreTokenVesting...");
  const vesting = await Vesting.deploy(TOKEN_ADDRESS);

  await vesting.deployed();

  console.log("🎉 Vesting Contract deployed at:", vesting.address);

  // Optional: wait for confirmations before verify
  console.log("⏳ Waiting for 5 confirmations...");
  await vesting.deployTransaction.wait(5);

  console.log("🔍 Verifying contract...");
  await hre.run("verify:verify", {
    address: vesting.address,
    constructorArguments: [TOKEN_ADDRESS],
    contract: "contracts/EloreTokenVesting.sol:EloreTokenVesting"
  });

  console.log("✅ Verification Complete!");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
