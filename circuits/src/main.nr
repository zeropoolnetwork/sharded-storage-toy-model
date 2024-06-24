mod common;
mod rollup;


use rollup::{tx, file, mining};
use tx::Account;
use file::File;
use rollup::root::Root;
use common::mt::mt_compute_root;
use crate::common::mt::{MerkleProof, poseidon2};
use crate::common::ec::SignaturePacked;

global RANDOM_ORACLE_SIZE:u32=16;
global HASH_PAYLOAD_SIZE:u32=4+RANDOM_ORACLE_SIZE;
global HASH_U8_PAYLOAD_SIZE:u32=32*HASH_PAYLOAD_SIZE;


global ACCOUNT_AND_DATA_TREE_DEPTH:u32=10;
global FILE_TREE_DEPTH:u32=10;

global MAX_TX_PER_BLOCK:u32=8;
global MAX_FILE_PER_BLOCK:u32=8;
global MAX_MINING_PER_BLOCK:u32=1;


#[export]
struct RollupPubInput {
    old_root: Field,
    new_root: Field,
    now: Field,
    oracle: mining::RandomOracle<RANDOM_ORACLE_SIZE>
}

#[export]
struct RollupInput {
    public: RollupPubInput,
    old_root: Root,
    new_root: Root,
    tx: tx::AccountBlock<MAX_TX_PER_BLOCK, ACCOUNT_AND_DATA_TREE_DEPTH>,
    file: file::FileBlock<MAX_FILE_PER_BLOCK, ACCOUNT_AND_DATA_TREE_DEPTH>,
    mining: mining::MiningBlock<MAX_MINING_PER_BLOCK, ACCOUNT_AND_DATA_TREE_DEPTH, FILE_TREE_DEPTH>
}

impl RollupPubInput {
    fn hash(self) -> Field {


        let mut payload = [0; HASH_PAYLOAD_SIZE];
        payload[0] = self.old_root;
        payload[1] = self.new_root;
        payload[2] = self.now;
        payload[3] = self.oracle.offset;
        for i in 0..RANDOM_ORACLE_SIZE {
            payload[4+i] = self.oracle.data[i];
        }
        
        let mut bytes_payload = [0; HASH_U8_PAYLOAD_SIZE];

        for i in 0..HASH_PAYLOAD_SIZE {
            // use BE for Ethereum compatibility
            let bytes = payload[i].to_be_bytes(32);
            for j in 0..32 {
                bytes_payload[i*32+j] = bytes[j];
            }
        }

        let res = dep::std::hash::keccak256(bytes_payload, HASH_U8_PAYLOAD_SIZE);

        let mut acc = 0;

        // use BE for Ethereum compatibility
        for i in 0..32 {
            acc = acc*256 + res[i] as Field;
        }
        acc
    }
}

fn assert_block_data_generated(input: RollupInput) {
	let empty_cells_0 = 0;
	let empty_cells_1 = poseidon2([empty_cells_0, empty_cells_0]);
	let empty_cells_2 = poseidon2([empty_cells_1, empty_cells_1]);
	let empty_cells_3 = poseidon2([empty_cells_2, empty_cells_2]);
	let empty_cells_4 = poseidon2([empty_cells_3, empty_cells_3]);
	let empty_cells_5 = poseidon2([empty_cells_4, empty_cells_4]);
	let empty_cells_6 = poseidon2([empty_cells_5, empty_cells_5]);
	let empty_cells_7 = poseidon2([empty_cells_6, empty_cells_6]);
	let empty_cells_8 = poseidon2([empty_cells_7, empty_cells_7]);
	let empty_cells_9 = poseidon2([empty_cells_8, empty_cells_8]);
	let cell_0_0 = poseidon2([input.tx.txs[0].tx.sender_index, input.tx.txs[0].tx.receiver_index]);
	let cell_0_1 = poseidon2([input.tx.txs[0].tx.receiver_key, input.tx.txs[0].tx.amount]);
	let cell_0_2 = poseidon2([input.tx.txs[1].tx.sender_index, input.tx.txs[1].tx.receiver_index]);
	let cell_0_3 = poseidon2([input.tx.txs[1].tx.receiver_key, input.tx.txs[1].tx.amount]);
	let cell_0_4 = poseidon2([input.tx.txs[2].tx.sender_index, input.tx.txs[2].tx.receiver_index]);
	let cell_0_5 = poseidon2([input.tx.txs[2].tx.receiver_key, input.tx.txs[2].tx.amount]);
	let cell_0_6 = poseidon2([input.tx.txs[3].tx.sender_index, input.tx.txs[3].tx.receiver_index]);
	let cell_0_7 = poseidon2([input.tx.txs[3].tx.receiver_key, input.tx.txs[3].tx.amount]);
	let cell_0_8 = poseidon2([input.tx.txs[4].tx.sender_index, input.tx.txs[4].tx.receiver_index]);
	let cell_0_9 = poseidon2([input.tx.txs[4].tx.receiver_key, input.tx.txs[4].tx.amount]);
	let cell_0_10 = poseidon2([input.tx.txs[5].tx.sender_index, input.tx.txs[5].tx.receiver_index]);
	let cell_0_11 = poseidon2([input.tx.txs[5].tx.receiver_key, input.tx.txs[5].tx.amount]);
	let cell_0_12 = poseidon2([input.tx.txs[6].tx.sender_index, input.tx.txs[6].tx.receiver_index]);
	let cell_0_13 = poseidon2([input.tx.txs[6].tx.receiver_key, input.tx.txs[6].tx.amount]);
	let cell_0_14 = poseidon2([input.tx.txs[7].tx.sender_index, input.tx.txs[7].tx.receiver_index]);
	let cell_0_15 = poseidon2([input.tx.txs[7].tx.receiver_key, input.tx.txs[7].tx.amount]);
	let cell_0_16 = poseidon2([input.mining.txs[0].tx.sender_index, input.mining.txs[0].tx.random_oracle_nonce]);
	let cell_0_17 = poseidon2([input.file.txs[0].tx.sender_index, input.file.txs[0].tx.data_index]);
	let cell_0_18 = poseidon2([input.file.txs[0].tx.time_interval, 0]);
	let cell_0_19 = poseidon2([input.file.txs[1].tx.sender_index, input.file.txs[1].tx.data_index]);
	let cell_0_20 = poseidon2([input.file.txs[1].tx.time_interval, input.file.txs[1].tx.data]);
	let cell_0_21 = poseidon2([input.file.txs[2].tx.sender_index, input.file.txs[2].tx.data_index]);
	let cell_0_22 = poseidon2([input.file.txs[2].tx.time_interval, input.file.txs[2].tx.data]);
	let cell_0_23 = poseidon2([input.file.txs[3].tx.sender_index, input.file.txs[3].tx.data_index]);
	let cell_0_24 = poseidon2([input.file.txs[3].tx.time_interval, input.file.txs[3].tx.data]);
	let cell_0_25 = poseidon2([input.file.txs[4].tx.sender_index, input.file.txs[4].tx.data_index]);
	let cell_0_26 = poseidon2([input.file.txs[4].tx.time_interval, input.file.txs[4].tx.data]);
	let cell_0_27 = poseidon2([input.file.txs[5].tx.sender_index, input.file.txs[5].tx.data_index]);
	let cell_0_28 = poseidon2([input.file.txs[5].tx.time_interval, input.file.txs[5].tx.data]);
	let cell_0_29 = poseidon2([input.file.txs[6].tx.sender_index, input.file.txs[6].tx.data_index]);
	let cell_0_30 = poseidon2([input.file.txs[6].tx.time_interval, input.file.txs[6].tx.data]);
	let cell_0_31 = poseidon2([input.file.txs[7].tx.sender_index, input.file.txs[7].tx.data_index]);
	let cell_0_32 = poseidon2([input.file.txs[7].tx.time_interval, input.file.txs[7].tx.data]);
	let cell_1_0 = poseidon2([cell_0_0, cell_0_1]);
	let cell_1_1 = poseidon2([cell_0_2, cell_0_3]);
	let cell_1_2 = poseidon2([cell_0_4, cell_0_5]);
	let cell_1_3 = poseidon2([cell_0_6, cell_0_7]);
	let cell_1_4 = poseidon2([cell_0_8, cell_0_9]);
	let cell_1_5 = poseidon2([cell_0_10, cell_0_11]);
	let cell_1_6 = poseidon2([cell_0_12, cell_0_13]);
	let cell_1_7 = poseidon2([cell_0_14, cell_0_15]);
	let cell_1_8 = poseidon2([cell_0_16, cell_0_17]);
	let cell_1_9 = poseidon2([cell_0_18, cell_0_19]);
	let cell_1_10 = poseidon2([cell_0_20, cell_0_21]);
	let cell_1_11 = poseidon2([cell_0_22, cell_0_23]);
	let cell_1_12 = poseidon2([cell_0_24, cell_0_25]);
	let cell_1_13 = poseidon2([cell_0_26, cell_0_27]);
	let cell_1_14 = poseidon2([cell_0_28, cell_0_29]);
	let cell_1_15 = poseidon2([cell_0_30, cell_0_31]);
	let cell_1_16 = poseidon2([cell_0_32, empty_cells_1]);
	let cell_2_0 = poseidon2([cell_1_0, cell_1_1]);
	let cell_2_1 = poseidon2([cell_1_2, cell_1_3]);
	let cell_2_2 = poseidon2([cell_1_4, cell_1_5]);
	let cell_2_3 = poseidon2([cell_1_6, cell_1_7]);
	let cell_2_4 = poseidon2([cell_1_8, cell_1_9]);
	let cell_2_5 = poseidon2([cell_1_10, cell_1_11]);
	let cell_2_6 = poseidon2([cell_1_12, cell_1_13]);
	let cell_2_7 = poseidon2([cell_1_14, cell_1_15]);
	let cell_2_8 = poseidon2([cell_1_16, empty_cells_2]);
	let cell_3_0 = poseidon2([cell_2_0, cell_2_1]);
	let cell_3_1 = poseidon2([cell_2_2, cell_2_3]);
	let cell_3_2 = poseidon2([cell_2_4, cell_2_5]);
	let cell_3_3 = poseidon2([cell_2_6, cell_2_7]);
	let cell_3_4 = poseidon2([cell_2_8, empty_cells_3]);
	let cell_4_0 = poseidon2([cell_3_0, cell_3_1]);
	let cell_4_1 = poseidon2([cell_3_2, cell_3_3]);
	let cell_4_2 = poseidon2([cell_3_4, empty_cells_4]);
	let cell_5_0 = poseidon2([cell_4_0, cell_4_1]);
	let cell_5_1 = poseidon2([cell_4_2, empty_cells_5]);
	let cell_6_0 = poseidon2([cell_5_0, cell_5_1]);
	let cell_7_0 = poseidon2([cell_6_0, empty_cells_7]);
	let cell_8_0 = poseidon2([cell_7_0, empty_cells_8]);
	let cell_9_0 = poseidon2([cell_8_0, empty_cells_9]);
	assert(input.file.txs[0].tx.data == cell_9_0);
}


#[export]
fn main(
    pubhash: pub Field,
    input: RollupInput
) {
    // check the public input hash
    assert_eq(
        pubhash,
        input.public.hash()
    );

    // check roots

    assert_eq(
        input.public.old_root,
        input.old_root.hash()
    );

    assert_eq(
        input.public.new_root,
        input.new_root.hash()
    );

    
    
    // compute block data
    // {
    //     let mut block_data = [0; 4*MAX_FILE_PER_BLOCK + 2*MAX_MINING_PER_BLOCK + 4*MAX_TX_PER_BLOCK];

    //     for i in 0..MAX_TX_PER_BLOCK {
    //         let offset = 4*i;
    //         block_data[offset] = input.tx.txs[i].tx.sender_index;
    //         block_data[offset+1] = input.tx.txs[i].tx.receiver_index;
    //         block_data[offset+2] = input.tx.txs[i].tx.receiver_key;
    //         block_data[offset+3] = input.tx.txs[i].tx.amount;
    //     }

    //     for i in 0..MAX_MINING_PER_BLOCK {
    //         let offset = 4*MAX_TX_PER_BLOCK + 2*i;
    //         block_data[offset] = input.mining.txs[i].tx.sender_index;
    //         block_data[offset+1] = input.mining.txs[i].tx.random_oracle_nonce;
    //     }


    //     { // i = 0
    //         let i = 0;
    //         let offset = 4*MAX_TX_PER_BLOCK + 2*MAX_MINING_PER_BLOCK + 4*i;
    //         block_data[offset] = input.file.txs[i].tx.sender_index;
    //         block_data[offset+1] = input.file.txs[i].tx.data_index;
    //         block_data[offset+2] = input.file.txs[i].tx.time_interval;
    //         block_data[offset+3] = 0;
    //     }


    //     for i in 1..MAX_FILE_PER_BLOCK {
    //         let offset = 4*MAX_TX_PER_BLOCK + 2*MAX_MINING_PER_BLOCK + 4*i;
    //         block_data[offset] = input.file.txs[i].tx.sender_index;
    //         block_data[offset+1] = input.file.txs[i].tx.data_index;
    //         block_data[offset+2] = input.file.txs[i].tx.time_interval;
    //         block_data[offset+3] = input.file.txs[i].tx.data;
    //     }

    //     let empty_cells = [0; FILE_TREE_DEPTH];

    //     let data_root = mt_compute_root(block_data, empty_cells);

    //     assert(input.file.txs[0].tx.data == data_root);
    // }


    // Replace the above code with the generated one, because of nargo bugs
    assert_block_data_generated(input);



    // apply blocks
    let acc_root = input.old_root.acc;
    let data_root = input.old_root.data;


    let acc_root = input.tx.apply(acc_root);

    let (acc_root, data_root) = input.file.apply(acc_root, data_root, input.public.now);

    let acc_root = input.mining.apply(acc_root, data_root, input.public.oracle);

    // check the new roots
    assert_eq(
        input.new_root.acc,
        acc_root
    );

    assert_eq(
        input.new_root.data,
        data_root
    );
}

// This code was taken from
// https://github.com/zeropoolnetwork/sharded-storage-toy-model/blob/d2125003aebf1a57b77c1127b08ca9c35fc52efd/crypto-sdk/test/state.test.ts#L68
// and converted to Noir using Claude AI.
#[test]
fn genesis_blank_transactions_test() {
    let pubhash = 602553387949470750594511273396490299548949981251778541381794331133460415703;
    let input = RollupInput {
        public: RollupPubInput {
            old_root: 14549430161668819174367687045193236134328868030804612193732634858347281983336,
            new_root: 14549430161668819174367687045193236134328868030804612193732634858347281983336,
            now: 0,
            oracle: mining::RandomOracle {
                offset: 0,
                data: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
            }
        },
        tx: tx::AccountBlock {
            txs: [
                tx::AccountTxEx {
                    tx: tx::AccountTx {
                        sender_index: 0,
                        receiver_index: 0,
                        receiver_key: 0,
                        amount: 0,
                        nonce: 0
                    },
                    assets: tx::AccountTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_receiver: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        account_receiver: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                tx::AccountTxEx {
                    tx: tx::AccountTx {
                        sender_index: 0,
                        receiver_index: 0,
                        receiver_key: 0,
                        amount: 0,
                        nonce: 0
                    },
                    assets: tx::AccountTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_receiver: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        account_receiver: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                tx::AccountTxEx {
                    tx: tx::AccountTx {
                        sender_index: 0,
                        receiver_index: 0,
                        receiver_key: 0,
                        amount: 0,
                        nonce: 0
                    },
                    assets: tx::AccountTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_receiver: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        account_receiver: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                tx::AccountTxEx {
                    tx: tx::AccountTx {
                        sender_index: 0,
                        receiver_index: 0,
                        receiver_key: 0,
                        amount: 0,
                        nonce: 0
                    },
                    assets: tx::AccountTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_receiver: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        account_receiver: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                tx::AccountTxEx {
                    tx: tx::AccountTx {
                        sender_index: 0,
                        receiver_index: 0,
                        receiver_key: 0,
                        amount: 0,
                        nonce: 0
                    },
                    assets: tx::AccountTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_receiver: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        account_receiver: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                tx::AccountTxEx {
                    tx: tx::AccountTx {
                        sender_index: 0,
                        receiver_index: 0,
                        receiver_key: 0,
                        amount: 0,
                        nonce: 0
                    },
                    assets: tx::AccountTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_receiver: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        account_receiver: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                tx::AccountTxEx {
                    tx: tx::AccountTx {
                        sender_index: 0,
                        receiver_index: 0,
                        receiver_key: 0,
                        amount: 0,
                        nonce: 0
                    },
                    assets: tx::AccountTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_receiver: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        account_receiver: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                tx::AccountTxEx {
                    tx: tx::AccountTx {
                        sender_index: 0,
                        receiver_index: 0,
                        receiver_key: 0,
                        amount: 0,
                        nonce: 0
                    },
                    assets: tx::AccountTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_receiver: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        account_receiver: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
            ]
        },
        file: file::FileBlock {
            txs: [
                file::FileTxEx {
                    tx: file::FileTx {
                        sender_index: 0,
                        data_index: 0,
                        time_interval: 0,
                        data: 0,
                        nonce: 0
                    },
                    assets: file::FileTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        file: File { expiration_time: 0, owner: 0, data: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                file::FileTxEx {
                    tx: file::FileTx {
                        sender_index: 0,
                        data_index: 0,
                        time_interval: 0,
                        data: 0,
                        nonce: 0
                    },
                    assets: file::FileTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        file: File { expiration_time: 0, owner: 0, data: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                file::FileTxEx {
                    tx: file::FileTx {
                        sender_index: 0,
                        data_index: 0,
                        time_interval: 0,
                        data: 0,
                        nonce: 0
                    },
                    assets: file::FileTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        file: File { expiration_time: 0, owner: 0, data: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                file::FileTxEx {
                    tx: file::FileTx {
                        sender_index: 0,
                        data_index: 0,
                        time_interval: 0,
                        data: 0,
                        nonce: 0
                    },
                    assets: file::FileTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        file: File { expiration_time: 0, owner: 0, data: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                file::FileTxEx {
                    tx: file::FileTx {
                        sender_index: 0,
                        data_index: 0,
                        time_interval: 0,
                        data: 0,
                        nonce: 0
                    },
                    assets: file::FileTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        file: File { expiration_time: 0, owner: 0, data: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                file::FileTxEx {
                    tx: file::FileTx {
                        sender_index: 0,
                        data_index: 0,
                        time_interval: 0,
                        data: 0,
                        nonce: 0
                    },
                    assets: file::FileTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        file: File { expiration_time: 0, owner: 0, data: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                file::FileTxEx {
                    tx: file::FileTx {
                        sender_index: 0,
                        data_index: 0,
                        time_interval: 0,
                        data: 0,
                        nonce: 0
                    },
                    assets: file::FileTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        file: File { expiration_time: 0, owner: 0, data: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
                file::FileTxEx {
                    tx: file::FileTx {
                        sender_index: 0,
                        data_index: 0,
                        time_interval: 0,
                        data: 0,
                        nonce: 0
                    },
                    assets: file::FileTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        proof_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        file: File { expiration_time: 0, owner: 0, data: 0 },
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                },
            ]
        },
        mining: mining::MiningBlock {
            txs: [
                mining::MiningTxEx {
                    tx: mining::MiningTx {
                        sender_index: 0,
                        nonce: 0,
                        random_oracle_nonce: 0,
                        mining_nonce: 0
                    },
                    assets: mining::MiningTxAssets {
                        proof_sender: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        account_sender: Account { key: 0, balance: 0, nonce: 0, random_oracle_nonce: 0 },
                        random_oracle_value: 0,
                        proof_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        file: File { expiration_time: 0, owner: 0, data: 0 },
                        proof_data_in_file: MerkleProof { index_bits: [0,0,0,0,0,0,0,0,0,0], hash_path: [0,0,0,0,0,0,0,0,0,0] },
                        data_in_file: 0,
                        signature: SignaturePacked { a: 0, s: 0, r8: 0 }
                    }
                }
            ]
        },
        old_root: Root {
            acc: 11487528682305961401473309877471642447232578731758593718090665024687659047906,
            data: 820977286390674538425862012493542916279341100017457750366535111511456236832
        },
        new_root: Root {
            acc: 11487528682305961401473309877471642447232578731758593718090665024687659047906,
            data: 820977286390674538425862012493542916279341100017457750366535111511456236832
        }
    };
    main(pubhash, input);
}


#[test]
fn test_rollup_input_hash() {
    let rollup_input = RollupPubInput {
        old_root: 8918192209170995053702057230737241803337815611010203629775354209885370389637,
        new_root: 16883437091946480525328209831531237890634231029399717242983301882663446976393,
        now: 2089219850256167021614320445642961704853440022375543021380913753290554232094,
        oracle: mining::RandomOracle {
            offset: 19564933442608081724400236810305259559367395926194797124512609460106891757291,
            data: [2867903460422775183770252526445680822902260914741587409824326547207677449059, 8982059045193534856455115822855918079595979808050890144324375955477946872189, 8244606625356446328877588669345450740862722818968998233427305821443894298209, 2563331886220690115962865958996205782709996400410509944924024279779346858039, 4259287321668842861877945919250867372941655907983388880560121334145963464931, 13248443777284381212066333999324606216389209264761780664247552934952189807540, 20285832049167006555500366542975364483258018426785093480667760483324743362771, 5917574112058539259682488696363169814842830831565158865983549040317943619437, 5481112740512213277275567931578112635682204031814479186103196781426700777820, 2279985499514197233096628895612771540916719469378559248315569321638892674880, 17352348601282685282647606324939267344833087544148193972442404046889178826693, 4134703512352786192752684457112133135552477746155015642132205955914068294964, 20437528133140263981883173304601792611852858774503433718207914253936981139074, 14405569952615555161430534061004859201629453046842863205908548834064772152782, 7479156532127664218920775497597575535701336444222197405485291397698853279057, 11457425749485331896983930651284471892797617913351140334030139034158893475386]
        }
    };

    let pubhash = 3948662352623793037980422332430756023521811098554192536177723934080377254970;
    
    assert_eq(
        pubhash,
        rollup_input.hash()
    );
}
