const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("🚀 Deploying MerchantRegistry with account:", deployer.address);

  const kybSigner = deployer.address; // testnet signer

  const Registry = await hre.ethers.getContractFactory("MerchantRegistry");

  console.log("📦 Deploying MerchantRegistry...");
  const registry = await Registry.deploy(kybSigner);

  // Ethers v5 deployment wait
  await registry.deployed();

  console.log("🎉 MerchantRegistry deployed at:", registry.address);
  console.log("🔑 KYB Signer:", kybSigner);

  console.log("⏳ Waiting for 5 confirmations...");
  await registry.deployTransaction.wait(5);

  console.log("🔍 Verifying...");
  await hre.run("verify:verify", {
    address: registry.address,
    constructorArguments: [kybSigner],
    contract: "contracts/MerchantRegistry.sol:MerchantRegistry",
  });

  console.log("✅ Verification complete!");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
