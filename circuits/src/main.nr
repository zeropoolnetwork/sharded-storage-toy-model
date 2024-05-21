use dep::{
    std,
    std::{
        hash,
        merkle,
    }
};


struct MerkleRoot {
    root: Field
}

impl Eq for MerkleRoot {
    fn eq(self, other: Self) -> bool {
        self.root == other.root
    }
}

impl MerkleRoot {
    fn new(n: u64) -> MerkleRoot {
        let mut v = 0;
        for _ in 0..n {
            // v = H(v, v)
            v = merkle::compute_merkle_root(v, 0, [v]);
        }
        MerkleRoot { root: v }
    }

    fn update<N>(&mut self, index: Field, proof: [Field; N], old_leaf: Field, new_leaf: Field) {
        assert_eq((*self).root, merkle::compute_merkle_root(old_leaf, index, proof));
        (*self).root = merkle::compute_merkle_root(new_leaf, index, proof);
    }
}

struct RollupState {
    accounts_root: Field,
    storage_root: Field,
    operator: (),
}

impl RollupState {
    fn hash(self) -> Field {
        hash::pedersen_hash([self.accounts_root, self.storage_root])
    }
}

fn main(x: Field, y: pub Field) {
    assert(x != y);
}

#[test]
fn test_main() {
    main(1, 2);

    // Uncomment to make test fail
    // main(1, 1);
}