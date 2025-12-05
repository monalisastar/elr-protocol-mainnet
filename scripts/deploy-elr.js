const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("🚀 Deploying ELR Token with account:", deployer.address);
  console.log("💰 Deployer balance:", (await deployer.getBalance()).toString());

  // Load the ERC20 contract
  const Token = await hre.ethers.getContractFactory("EloreToken");

  console.log("📦 Deploying EloreToken...");
  const token = await Token.deploy();   // No constructor args
  await token.deployed();

  console.log("🎉 Elore Token deployed at:", token.address);

  // Optional: Wait a bit before verifying
  console.log("⏳ Waiting for 5 confirmations before verification...");
  await token.deployTransaction.wait(5);

  // Etherscan (Polygonscan Amoy) Verification
  console.log("🔍 Verifying contract...");
  await hre.run("verify:verify", {
    address: token.address,
    constructorArguments: [],
  });

  console.log("✅ Verification Complete!");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
