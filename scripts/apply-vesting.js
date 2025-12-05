const hre = require("hardhat");

async function main() {
  const vesting = await hre.ethers.getContractAt(
    "EloreTokenVesting",
    "0x2C721019fAC43655eFE183f6D837289b9190b7C0"
  );

  const now = Math.floor(Date.now() / 1000);

  const schedules = [
    {
      addr: "0xff01420FB151A7bd49E067Be6AbfCD1492a13ab6",
      amount: "50000000",              // Foundation vested portion
      start: now,
      cliff: 0,
      duration: 36 * 30 * 24 * 3600,   // 36 months
      revocable: true
    },
    {
      addr: "0x4121E61f37781092e8422AcA29F248D73f3Cd089",
      amount: "37500000",              // Operations vested portion
      start: now,
      cliff: 0,
      duration: 24 * 30 * 24 * 3600,   // 24 months
      revocable: true
    },
    {
      addr: "0xA4629a00109109a9483020DF45154661b54ECa12",
      amount: "100000000",             // Team full vesting
      start: now,
      cliff: 12 * 30 * 24 * 3600,      // 12-month cliff
      duration: 48 * 30 * 24 * 3600,   // 48 months
      revocable: true
    },
    {
      addr: "0x1f26316eb1a29EE4dE8D00BF7b2544c63bA98322",
      amount: "25000000",              // Advisors
      start: now,
      cliff: 0,
      duration: 18 * 30 * 24 * 3600,   // 18 months
      revocable: false
    }
  ];

  for (let s of schedules) {
    const tx = await vesting.createVesting(
      s.addr,
      hre.ethers.utils.parseUnits(s.amount, 18),
      s.start,
      s.cliff,
      s.duration,
      s.revocable
    );
    console.log(`Created vesting for ${s.addr} (tx: ${tx.hash})`);
    await tx.wait();
  }

  console.log("🎉 All vesting schedules created!");
}

main().catch(console.error);
