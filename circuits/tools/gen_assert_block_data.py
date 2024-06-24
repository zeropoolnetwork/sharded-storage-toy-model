
FILE_TREE_DEPTH=10
MAX_TX_PER_BLOCK=8
MAX_FILE_PER_BLOCK=8
MAX_MINING_PER_BLOCK=1





def gen_block_compute_root():
    block_data = [""] * (4*MAX_FILE_PER_BLOCK + 2*MAX_MINING_PER_BLOCK + 4*MAX_TX_PER_BLOCK)

    for i in range(0, MAX_TX_PER_BLOCK):
        offset = 4*i
        block_data[offset] = f"input.tx.txs[{i}].tx.sender_index"
        block_data[offset+1] = f"input.tx.txs[{i}].tx.receiver_index"
        block_data[offset+2] = f"input.tx.txs[{i}].tx.receiver_key"
        block_data[offset+3] = f"input.tx.txs[{i}].tx.amount"
    

    for i in range(0, MAX_MINING_PER_BLOCK):
        offset = 4*MAX_TX_PER_BLOCK + 2*i
        block_data[offset] = f"input.mining.txs[{i}].tx.sender_index"
        block_data[offset+1] = f"input.mining.txs[{i}].tx.random_oracle_nonce"



    
    i = 0
    offset = 4*MAX_TX_PER_BLOCK + 2*MAX_MINING_PER_BLOCK + 4*i
    block_data[offset] = f"input.file.txs[{i}].tx.sender_index"
    block_data[offset+1] = f"input.file.txs[{i}].tx.data_index"
    block_data[offset+2] = f"input.file.txs[{i}].tx.time_interval"
    block_data[offset+3] = "0";
    


    for i in range(1,MAX_FILE_PER_BLOCK):
        offset = 4*MAX_TX_PER_BLOCK + 2*MAX_MINING_PER_BLOCK + 4*i
        block_data[offset] = f"input.file.txs[{i}].tx.sender_index"
        block_data[offset+1] = f"input.file.txs[{i}].tx.data_index"
        block_data[offset+2] = f"input.file.txs[{i}].tx.time_interval"
        block_data[offset+3] = f"input.file.txs[{i}].tx.data"
    

    return gen_mt_compute_root(block_data)




def gen_mt_compute_root(block_data):
    rows = []
    K = FILE_TREE_DEPTH
    rows.append("let empty_cells_0 = 0;")
    for i in range(1,K):
        rows.append(f"let empty_cells_{i} = poseidon2([empty_cells_{i-1}, empty_cells_{i-1}]);")
    

    n = len(block_data)
    
    for i in range(0,K):
        for j in range(0,n//2):
            rows.append(f"let cell_{i}_{j} = poseidon2([{block_data[j*2]}, {block_data[j*2+1]}]);")
            block_data[j] = f"cell_{i}_{j}"
        

        if n%2 == 1:
            rows.append(f"let cell_{i}_{n//2} = poseidon2([{block_data[n-1]}, empty_cells_{i}]);")
            block_data[n//2] = f"cell_{i}_{n//2}"
        

        n = (n+1)//2

    return rows, block_data[0]



rows, root = gen_block_compute_root()

print("fn assert_block_data_generated(input: RollupInput) {")
print("\t"+"\n\t".join(rows))
print(f"\tassert(input.file.txs[0].tx.data == {root});")
print("}\n")