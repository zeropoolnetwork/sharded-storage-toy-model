use dep::std::hash::poseidon2::{Poseidon2, Poseidon2Hasher};


struct MerkleProof<N> {
    index_bits: [u1; N],
    hash_path: [Field; N],
}


impl<N> MerkleProof<N> {
    pub fn root(self, leaf: Field) -> Field {
        merkle_root_from_path(leaf, self)
    }

    pub fn update(self, leaf: Field, new_leaf: Field, old_root: Field) -> Field {
        assert(self.root(leaf) == old_root);
        self.root(new_leaf)
    }
    
}

/// Path and proof start with indices that are close to the leaf
pub fn merkle_root_from_path<N>(leaf: Field, proof:MerkleProof<N>) -> Field {
    let n = proof.hash_path.len();
    let mut current = leaf;
    for i in 0..n {
        let path_bit = proof.index_bits[i] as bool;
        let next = proof.hash_path[i];
        let (hash_left, hash_right) = if path_bit {
            (next, current)
        } else {
            (current, next)
        };
        current = poseidon2([hash_left, hash_right]);
    }
    current
}




/// Helper around Noir's clunky API
pub fn poseidon2<N>(input: [Field; N]) -> Field {
    Poseidon2::hash(input, input.len())
}


// assuming N<=1<<K
pub fn mt_compute_root<K,N>(mut leaves: [Field; N], mut empty_cells: [Field;K]) -> Field {
    assert(N <= (1<<K));
    for i in 1..K {
        empty_cells[i] = poseidon2([empty_cells[i-1], empty_cells[i-1]]);
    }

    let mut n = N;
    for i in 0..K {
        for j in 0..(n+1)/2 {   
            let index_r = j*2+1;
            let r = if index_r == n {
                empty_cells[i]
            } else {
                leaves[index_r]
            };
            leaves[j] = poseidon2([leaves[j*2], r]);
        }
    }

    leaves[0]
}