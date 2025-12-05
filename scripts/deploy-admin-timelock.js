const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying ProxyAdmin + Timelock from:", deployer.address);

  const Factory = await hre.ethers.getContractFactory(
    "ELRAdminTimelock"
  );

  const timelockDelay = 3600; // 1 hour for testnet (mainnet = 24-48 hrs)

  const contract = await Factory.deploy(
    timelockDelay,
    [deployer.address],    // proposers
    [deployer.address],    // executors
    deployer.address       // admin
  );

  await contract.deployed();

  console.log("📌 ELRAdminTimelock deployed at:", contract.address);
  console.log("📌 ProxyAdmin at:", await contract.proxyAdmin());
  console.log("📌 TimelockController at:", await contract.timelock());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
