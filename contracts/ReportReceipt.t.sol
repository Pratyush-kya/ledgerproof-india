// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReportReceipt} from "./ReportReceipt.sol";

contract ReportReceiptTest {
    ReportReceipt private receipt;

    function setUp() public {
        receipt = new ReportReceipt();
    }

    function testStoresOwnerAndTimestamp() public {
        bytes32 reportHash = keccak256("stable-report");

        receipt.mintReceipt(reportHash);

        (address owner, uint64 timestamp) = receipt.receipts(reportHash);
        require(owner == address(this), "wrong receipt owner");
        require(timestamp == uint64(block.timestamp), "wrong timestamp");
    }

    function testRejectsDuplicateHash() public {
        bytes32 reportHash = keccak256("duplicate-report");
        receipt.mintReceipt(reportHash);

        (bool succeeded, ) = address(receipt).call(
            abi.encodeCall(receipt.mintReceipt, (reportHash))
        );

        require(!succeeded, "duplicate hash was accepted");
    }

    function testRejectsZeroHash() public {
        (bool succeeded, ) = address(receipt).call(
            abi.encodeCall(receipt.mintReceipt, (bytes32(0)))
        );

        require(!succeeded, "zero hash was accepted");
    }
}
