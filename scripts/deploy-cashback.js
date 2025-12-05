const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("==============================================");
  console.log("🚀 ELR GAMIFIED CASHBACK ENGINE DEPLOY SCRIPT");
  console.log("==============================================\n");

  console.log("👤 Deployer Address:", deployer.address);
  console.log("💰 Deployer Balance:", (await deployer.getBalance()).toString(), "\n");

  // Constructor args
  const elrToken     = "0x8E9abdF8759B0d2863A030E49406C05b30ed43Ed";
  const registry     = "0xC61C8C198E82E60f3DE422812ea8395b6B808e1B";
  const distributor  = "0x8Cd94160d912b4E646c49Fe7f3fEE6c9226Ec7c2";

  console.log("📦 Constructor Arguments:");
  console.log("   - elrToken    :", elrToken);
  console.log("   - registry    :", registry);
  console.log("   - distributor :", distributor);
  console.log("");

  console.log("🛠  Creating Contract Factory...");
  const Engine = await hre.ethers.getContractFactory("CashbackEngine");

  console.log("📡 Deploying contract...");
  const engine = await Engine.deploy(elrToken, registry, distributor);

  console.log("\n⏳ Deployment TX sent!");
  console.log("   TX Hash:", engine.deployTransaction.hash);

  console.log("⏳ Awaiting deployment...");
  await engine.deployed();

  console.log("\n🎉 DEPLOYMENT SUCCESS");
  console.log("   Contract Address:", engine.address);

  const receipt = await hre.ethers.provider.getTransactionReceipt(
    engine.deployTransaction.hash
  );

  console.log("\n📊 Deployment Details:");
  console.log("   - Block Number:", receipt.blockNumber);
  console.log("   - Gas Used    :", receipt.gasUsed.toString());
  console.log("   - Gas Price   :", engine.deployTransaction.gasPrice?.toString() || "N/A");

  console.log("\n🔍 Checking runtime bytecode...");
  const code = await hre.ethers.provider.getCode(engine.address);
  console.log("   Runtime Bytecode Length:", code.length);

  console.log("\n⏳ Waiting for 5 confirmations...");
  await engine.deployTransaction.wait(5);

  console.log("\n==============================================");
  console.log("🟢 Sourcify Verification Triggered");
  console.log("👉 It may take 30–90 seconds to appear.");
  console.log("👉 Check both URLs:");
  console.log(`🔗 Full Match   : https://repo.sourcify.dev/contracts/full_match/80002/${engine.address}/`);
  console.log(`🔗 Partial Match: https://repo.sourcify.dev/contracts/partial_match/80002/${engine.address}/`);
  console.log("==============================================\n");

  console.log("🔎 POST-DEPLOY CONTRACT STATE CHECKS:");
  try {
    const reg = await engine.registry();
    const dist = await engine.distributor();
    const token = await engine.elrToken();

    console.log("   registry():    ", reg);
    console.log("   distributor(): ", dist);
    console.log("   elrToken():    ", token);
  } catch (e) {
    console.log("⚠️ Could not read contract state — maybe not verified yet.");
  }

  console.log("\n✨ Deployment script completed.\n");
}

main().catch((err) => {
  console.error("❌ Deployment Error:", err);
  process.exit(1);
});
