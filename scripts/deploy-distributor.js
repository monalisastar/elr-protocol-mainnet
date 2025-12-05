const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("🚀 Deployer:", deployer.address);

  const elrToken = "0x8E9abdF8759B0d2863A030E49406C05b30ed43Ed";
  const kybSigner = deployer.address;
  const multisigOwner = deployer.address;

  const Distributor = await hre.ethers.getContractFactory("RewardDistributor");

  const distributor = await Distributor.deploy(
    elrToken,
    kybSigner,
    multisigOwner,
    {
      gasLimit: 9500000,
      gasPrice: hre.ethers.utils.parseUnits("350", "gwei"),
    }
  );

  const tx = distributor.deployTransaction;

  console.log("📝 TX Hash:", tx.hash);
  console.log("🔍 Track:", `https://amoy.polygonscan.com/tx/${tx.hash}`);

  console.log("⏳ Waiting for 1 confirmation...");
  await tx.wait(1);

  console.log("🎉 CONTRACT MINED!");
  console.log("📍 Address:", distributor.address);
}

main().catch(console.error);
