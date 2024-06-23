const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const owner = "0xC828Db30a16d9A0938514952e84cdFcF081d736B";

  console.log("Deploying Rollup contract...");

  const rollup = await deploy("Rollup", {
    from: deployer,
    args: [owner],
    log: true,
    waitConfirmations: 1,
  });

  console.log("Rollup deployed to:", rollup.address);
  console.log("Owner set to:", owner);


  if (network.name !== "hardhat" && network.name !== "localhost") {
    try {
      console.log("Verifying contract on Etherscan...");
      await hre.run("verify:verify", {
        address: rollup.address,
        constructorArguments: [owner],
      });
    } catch (error) {
      console.error("Error verifying contract:", error);
    }
  }
};

module.exports.tags = ["Rollup"];