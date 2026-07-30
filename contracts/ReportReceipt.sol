// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReportReceipt {
    error ReceiptAlreadyMinted(bytes32 reportHash);
    error ZeroReportHash();

    struct Receipt {
        address owner;
        uint64 timestamp;
    }

    mapping(bytes32 reportHash => Receipt receipt) public receipts;

    event ReceiptMinted(
        bytes32 indexed reportHash,
        address indexed owner,
        uint64 timestamp
    );

    function mintReceipt(bytes32 reportHash) external {
        if (reportHash == bytes32(0)) revert ZeroReportHash();
        if (receipts[reportHash].owner != address(0)) {
            revert ReceiptAlreadyMinted(reportHash);
        }

        uint64 timestamp = uint64(block.timestamp);
        receipts[reportHash] = Receipt({
            owner: msg.sender,
            timestamp: timestamp
        });

        emit ReceiptMinted(reportHash, msg.sender, timestamp);
    }
}
