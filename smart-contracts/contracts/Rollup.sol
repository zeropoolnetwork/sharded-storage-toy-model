// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

import { UltraVerifier } from "./UltraVerifier.sol";    



contract Rollup {
    uint256 constant GENESIS_ROOT_STATE = 16401344736640986707530875561901522019956508678914201367151582104570937928339;
    uint256 constant RANDOM_ORACLE_SIZE = 16;

    // BN256 group order
    uint256 constant R = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    uint256 constant BLOCKNUMBER_MAX_DELAY = 100;

    UltraVerifier public verifier;
    address public owner;
    uint256 public last_committed_blocknumber = 0;

    uint256 public root = GENESIS_ROOT_STATE;

    error NotAuthorized();
    error WrongBlockNumber();
    error WrongProof();

    constructor(address _owner) {
        verifier = new UltraVerifier();
        owner = _owner;
    }

    function publish_block(uint256 new_root, uint256 _now, bytes calldata _proof) external {
        if (msg.sender != owner) {
            revert NotAuthorized();
        }

        if (_now <= last_committed_blocknumber) {
            revert WrongBlockNumber();
        }

        if (_now <= block.number - BLOCKNUMBER_MAX_DELAY) {
            revert WrongBlockNumber();
        }

        if (_now >= block.number) {
            revert WrongBlockNumber();
        }

        // use block hashes as random oracle, should be replaced to randao
        uint256[RANDOM_ORACLE_SIZE] memory oracle;
        uint ro_offset = _now - RANDOM_ORACLE_SIZE + 1;
        for (uint256 i = 0; i < RANDOM_ORACLE_SIZE; i++) {
            oracle[i] = uint256(blockhash(ro_offset +i))%R;
        }

        uint256 h = uint256(keccak256(abi.encodePacked(root, new_root, _now, ro_offset, oracle)))%R;

        bytes32[] memory inputs = new bytes32[](1);
        inputs[0] = bytes32(h);

        if (!verifier.verify(_proof, inputs)) {
            revert WrongProof();
        }

        last_committed_blocknumber = _now;
        root = new_root;
    }
}
