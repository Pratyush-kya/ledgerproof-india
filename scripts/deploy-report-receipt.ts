import { network } from "hardhat";

const connection = await network.create();

if (connection.networkName !== "baseSepolia") {
  throw new Error("ReportReceipt may only be deployed with --network baseSepolia.");
}

const receipt = await connection.viem.deployContract("ReportReceipt");

console.log(`ReportReceipt deployed to ${receipt.address}`);
