const hre = require("hardhat");

async function main() {

    const token = await hre.ethers.getContractAt(
        "EloreToken",
        "0x8E9abdF8759B0d2863A030E49406C05b30ed43Ed"
    );

    const vestingAddress = "0x05BfF24A655834C275C27b58A98Ccaaa8d948128";

    console.log("🚀 Funding vesting contract...");

    const tx = await token.transfer(
        vestingAddress,
        hre.ethers.utils.parseEther("250000000")
    );

    console.log("⏳ Waiting for confirmation...");
    await tx.wait();

    console.log("✅ Funding complete!");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
