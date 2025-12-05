const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  const Elore = await hre.ethers.getContractFactory("EloreToken");
  const contract = await Elore.deploy(); // ✅ no args

  await contract.deployed();
  console.log("✅ Deployed to:", contract.address);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});

