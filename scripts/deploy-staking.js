const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying Staking from:", deployer.address);

  // ELR token contract address on Polygon Amoy
  const ELR_ADDRESS = "0x8169124844347d9A9d0B6F2eD708F8948eef6242";

  if (!hre.ethers.utils.isAddress(ELR_ADDRESS)) {
    throw new Error("❌ Invalid ELR token address");
  }

  const Staking = await hre.ethers.getContractFactory("ELRStaking");
  const staking = await Staking.deploy(ELR_ADDRESS);

  await staking.deployed();
  console.log("Staking deployed at:", staking.address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
